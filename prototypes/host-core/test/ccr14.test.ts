// CCR-BR-014 scenarios (checks 55–58): the ConfigFingerprinter port, Host.controls, the presented definition.
// RECONSTRUCTED in round 2 (WS8): the original file was never committed and was lost; these 11 tests were rebuilt
// from acceptance checks 55–58 of references/core/behaviors/21-testing-host.md and the CCR-BR-014 section of
// RESULTS.md, against the source code that was still present. Prototype; evidences no requirement.
import { Context, Effect, Exit, Fiber, Layer, Schema } from "effect"
import { describe, expect, it } from "vitest"
import { AuditSink, ConfigFingerprinter, OperationGate, type OperationRequest } from "../src/gxp.js"
import { define, type AnyPlugin } from "../src/plugin.js"
import * as Testing from "../src/testing.js"
import { Logger, drive, idle, loggerPlugin, journal, memorySink, withHost } from "./fixtures.js"
import { alice, as, settleWriter } from "./p4fixtures.js"

class Cfg extends Context.Service<Cfg, { readonly ok: Effect.Effect<boolean> }>()("x/Cfg") {}
const cfgPlugin = (requires: ReadonlyArray<Context.Key<any, any>> = [], version = "1", digest = "d1") => define({
  id: "x/cfg", requires: requires as never, provides: [Cfg] as const, meta: { version, digest },
  config: Schema.Struct({ a: Schema.optional(Schema.Number), b: Schema.optional(Schema.String), secret: Schema.optional(Schema.String) }),
  build: Layer.succeed(Cfg, { ok: Effect.succeed(true) }) as never
}) as unknown as AnyPlugin
const cfgSrc = { config: () => Effect.succeed({}) }
type Port = ConfigFingerprinter["Service"]
const port = (o: { select?: Port["select"]; fingerprint?: Port["fingerprint"] } = {}) => {
  const calls: Array<{ kind: string; q: unknown }> = []
  const p: Port = {
    select: (q) => { calls.push({ kind: "select", q }); return o.select ? o.select(q) : Effect.succeed(q.paths.filter((x) => x !== "b")) },
    fingerprint: (q) => { calls.push({ kind: "fingerprint", q }); return o.fingerprint ? o.fingerprint(q) : Effect.succeed(q.entries.map((e) => ({ path: e.path, fingerprint: `fp:${e.path}:${String(e.value).length}` }))) }
  }
  return { calls, p }
}
const recordingGate = () => {
  const requests: Array<OperationRequest> = []
  const gate: OperationGate["Service"] = { authorize: (r) => Effect.sync(() => { requests.push(r) }) }
  return { requests, gate }
}
const ports = (o: { sink?: AuditSink["Service"]; gate?: OperationGate["Service"]; fp?: Port }) => Layer.mergeAll(Testing.counterIdGenerator("id-"),
  o.sink ? Layer.succeed(AuditSink, o.sink) : Layer.empty, o.gate ? Layer.succeed(OperationGate, o.gate) : Layer.empty, o.fp ? Layer.succeed(ConfigFingerprinter, o.fp) : Layer.empty)
const failedWith = (exit: Exit.Exit<unknown, unknown>, tag: string) => Exit.isFailure(exit) && JSON.stringify(exit.cause).includes(tag)

describe("CCR-BR-014: the ConfigFingerprinter port (step 4a)", () => {
  it("check 55: reconfigure with a value: only the selected changed paths are fingerprinted, before the gate; request and records carry equal configChange, never the value", async () => {
    const { records, sink } = memorySink(), { requests, gate } = recordingGate(), fp = port()
    await withHost((host) => Effect.gen(function* () {
      yield* host.install(cfgPlugin(), { ...as(), config: { a: 1 } }); yield* idle(host)
      const before = requests.length
      yield* drive(host, host.reconfigure("x/cfg", { a: 2, b: "hidden", secret: "s3cr3t" }, as()))
      yield* settleWriter
      const fpCall = fp.calls.filter((c) => c.kind === "fingerprint").at(-1)!.q as { entries: Array<{ path: string }>; form: string }
      expect(fpCall.form).toBe("decoded")
      expect(fpCall.entries.map((e) => e.path)).toEqual(["a", "secret"])         // b changed but was not selected
      const req = requests.slice(before).find((r) => r.operation === "reconfigure")!
      const recs = records.filter((r) => r.operation === "reconfigure")
      expect(recs.length).toBeGreaterThan(1)
      expect(recs.every((r) => JSON.stringify(r.configChange) === JSON.stringify(req.configChange))).toBe(true)
      expect(req.configChange!.fingerprints!.map((x) => x.path)).toEqual(["a", "secret"])
      expect(JSON.stringify([records, requests, fp.calls.filter((c) => c.kind === "select")])).not.toContain("s3cr3t")
      // No actor, reason or correlation reaches the port.
      expect(JSON.stringify(fp.calls)).not.toMatch(/user-alice|correlation/)
    }), cfgSrc, ports({ sink, gate, fp: fp.p }))
  })

  it("check 55: install with config hands over raw top-level keys; clearing the override calls nothing", async () => {
    const fp = port()
    await withHost((host) => Effect.gen(function* () {
      yield* host.install(cfgPlugin(), { ...as(), config: { a: 1, b: "x" } }); yield* idle(host)
      const f = fp.calls.find((c) => c.kind === "fingerprint")!.q as { form: string; entries: Array<{ path: string }> }
      expect(f.form).toBe("raw")
      expect((fp.calls.find((c) => c.kind === "select")!.q as { paths: Array<string> }).paths).toEqual(["a", "b"])
      const n = fp.calls.length
      yield* drive(host, host.reconfigure("x/cfg", undefined, as()))
      expect(fp.calls.length).toBe(n)
    }), cfgSrc, ports({ fp: fp.p }))
  })

  const failing: Array<[string, Partial<Port>, string]> = [
    ["fails", { fingerprint: () => Effect.fail(new (class extends Error { readonly _tag = "ConfigFingerprintFailed" })("port text")) as never }, "ConfigFingerprintFailed"],
    ["dies", { fingerprint: () => Effect.die(new Error("port text")) }, "defect"],
    ["hangs", { fingerprint: () => Effect.never }, "timeout"],
    ["answers an unselected path", { select: () => Effect.succeed(["zzz"]) }, "selection outside the changed paths"],
    ["answers a malformed fingerprint", { fingerprint: (q) => Effect.succeed(q.entries.map((e) => ({ path: e.path, fingerprint: "has spaces!" }))) }, "malformed answer"]
  ]
  for (const [name, behave, message] of failing) {
    it(`check 56: a fingerprinter that ${name} fails the call closed: no gate, no record, no change, no port text`, async () => {
      const { records, sink } = memorySink(), { requests, gate } = recordingGate(), fp = port(behave as never)
      await withHost((host) => Effect.gen(function* () {
        yield* host.install(cfgPlugin(), as()); yield* idle(host)
        const nRec = records.length, nReq = requests.length
        const exit = yield* Effect.exit(drive(host, host.reconfigure("x/cfg", { a: 5 }, as())))
        expect(failedWith(exit, "ConfigFingerprintUnavailable")).toBe(true)
        expect(JSON.stringify(exit)).toContain(message)
        expect(JSON.stringify(exit)).not.toContain("port text")
        yield* settleWriter
        expect(records.length).toBe(nRec); expect(requests.length).toBe(nReq)
        expect((yield* host.inspect("x/cfg")).state).toBe("active")
      }), { ...cfgSrc, fingerprintTimeout: 30 }, ports({ sink, gate, fp: fp.p }))
    })
  }

  it("check 55: with no fingerprinter wired, paths only and nothing else changes", async () => {
    const { records, sink } = memorySink()
    await withHost((host) => Effect.gen(function* () {
      yield* host.install(cfgPlugin(), { ...as(), config: { a: 1, b: "x" } }); yield* idle(host)
      yield* settleWriter
      const r = records.find((x) => x.operation === "install" && x.phase === "requested")!
      expect(r.configChange).toEqual({ paths: ["a", "b"] })
    }), cfgSrc, ports({ sink }))
  })

  it("check 55: an ended intent restores the earlier override's stored fingerprints without calling the port", async () => {
    const { records, sink } = memorySink(), fp = port()
    await withHost((host) => Effect.gen(function* () {
      yield* host.install(loggerPlugin(journal()), as())
      yield* host.install(cfgPlugin([Logger]), { ...as(), config: { a: 1 } }); yield* idle(host)
      // A lease held by another fiber: the restart parks (a revocation interrupts that fiber, not the test).
      const holder = yield* Effect.forkChild(Effect.scoped(Effect.andThen(host.lease([Cfg] as const), Effect.never)))
      yield* Effect.sleep(5)
      const parked = yield* Effect.exit(drive(host, host.reconfigure("x/cfg", { a: 22 }, as())))
      expect(failedWith(parked, "DrainTimeout")).toBe(true)
      const calls = fp.calls.length
      yield* drive(host, host.remove("example/logger", { ...as(), force: true }))   // the cascade ends the parked intent
      yield* Fiber.interrupt(holder)
      yield* settleWriter
      expect(fp.calls.length).toBe(calls)
      const ended = records.find((r) => r.operation === "intent-ended")
      expect(ended?.configChange?.fingerprints?.map((x) => x.path)).toEqual(["a"])
    }), { ...cfgSrc, drainTimeout: 20 }, ports({ sink, fp: fp.p }))
  })
})

describe("CCR-BR-014: Host.controls and the presented definition (checks 57, 58)", () => {
  it("check 57: controls report wiring and limits; lastWritten follows the writer; CloseReport.auditLastSeq; readable after close", async () => {
    const { records, sink } = memorySink(), fp = port()
    let after: unknown
    await withHost((host) => Effect.gen(function* () {
      const c0 = yield* host.controls
      expect(c0).toMatchObject({ wired: { audit: true, gate: false, fingerprinter: true }, auditTimeout: 50, fingerprintTimeout: 5000, idGenerator: "provided" })
      yield* host.install(cfgPlugin(), as()); yield* idle(host); yield* settleWriter
      const c1 = yield* host.controls
      expect(c1.auditPosition!.lastWritten).toBe(Math.max(...records.map((r) => r.auditSeq)))
      const report = yield* drive(host, host.shutdown(as()))
      expect(report.auditLastSeq).toBeGreaterThanOrEqual(c1.auditPosition!.lastWritten)
      after = yield* host.controls                                               // still readable after close
    }), cfgSrc, ports({ sink, fp: fp.p }))
    expect(after).toMatchObject({ wired: { audit: true } })
  })

  it("check 58: requested and rejected records carry the presented definition; terminal records do not; a refused replace keeps its incoming digest", async () => {
    const { records, sink } = memorySink()
    const gate: OperationGate["Service"] = { authorize: (r) => r.operation === "replace" ? Effect.fail({ _tag: "OperationRejected", operation: "replace", reason: "no" } as never) : Effect.void }
    await withHost((host) => Effect.gen(function* () {
      yield* host.install(cfgPlugin(), as()); yield* idle(host)
      yield* Effect.exit(drive(host, host.replace(cfgPlugin([], "2", "d2"), as())))
      yield* settleWriter
      const inst = records.filter((r) => r.operation === "install")
      expect(inst.find((r) => r.phase === "requested")!.definition).toEqual({ version: "1", digest: "d1" })
      expect(inst.find((r) => r.phase === "completed")!.definition).toBeUndefined()
      expect(records.find((r) => r.operation === "replace" && r.phase === "rejected")!.definition).toEqual({ version: "2", digest: "d2" })
      expect(alice.id).toBe("user-alice")
    }), cfgSrc, ports({ sink, gate }))
  })
})
