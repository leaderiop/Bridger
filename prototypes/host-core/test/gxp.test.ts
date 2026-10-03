// Phase-P3 scenarios for the GxP hooks (behaviours 22–25), acceptance checks 31–42 of BEH-BR-184.
import { readFileSync, readdirSync } from "node:fs"
import { Context, Effect, Exit, Fiber, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { CurrentActor, verifyAuditSequence, type Actor, type AuditRecord, type OperationRequest } from "../src/gxp.js"
import type * as Host from "../src/host.js"
import { define } from "../src/plugin.js"
import * as Testing from "../src/testing.js"
import * as F from "./fixtures.js"
import { Logger, auditPlugin, drive, idle, journal, loggerPlugin, stateOf } from "./fixtures.js"

const alice: Actor = { id: "user-alice", kind: "user", display: "Alice" }
const ctx = (reason?: string) => ({ context: { actor: alice, ...(reason ? { reason } : {}) } })

type Outcome = "store" | "fail" | "hang"
/** The testing entry point's sink (BEH-BR-181), switchable between outcomes, keeping every write attempt. */
const memorySink = () => {
  const attempts: Array<AuditRecord> = []
  const mode: { current: Outcome | ((r: AuditRecord) => Outcome) } = { current: "store" }
  const m = F.memorySink((_n, r) => { attempts.push(r); return typeof mode.current === "function" ? mode.current(r) : mode.current })
  return { ...m, attempts, mode }
}
/** The testing entry point's gate (BEH-BR-182). */
const scriptedGate = (decide: (r: OperationRequest) => "allow" | "deny" | "die" | "hang") =>
  F.scriptedGate((r) => { const d = decide(r); return d === "deny" ? { refuse: "not approved" } : d })

/** A TestHost with counter identifiers and, when given, the testing entry point's sink and gate. */
const run = <A, E>(
  body: (host: Testing.TestHost) => Effect.Effect<A, E>,
  opts: { sink?: { layer: Layer.Layer<any> }; gate?: { layer: Layer.Layer<any> }; options?: Host.Options } = {}
) => F.withHost(body, { gateTimeout: 50, ...opts.options },
  Layer.mergeAll(Testing.counterIdGenerator("id-"), opts.sink?.layer ?? Layer.empty, opts.gate?.layer ?? Layer.empty))
const settleWriter = Effect.sleep(20)
const tagOf = (e: Exit.Exit<unknown, unknown>) => Exit.isFailure(e) ? JSON.stringify(e.cause) : "success"

describe("attribution (behaviour 22)", () => {
  it("check 31: unattributed or reason-less calls fail before any record or change; a per-call context wins", async () => {
    const s = memorySink()
    await run((host) => Effect.gen(function* () {
      const anon = yield* Effect.exit(host.install(loggerPlugin(journal())))
      expect(tagOf(anon)).toContain("Unattributed")
      yield* host.install(loggerPlugin(journal()), ctx())
      yield* idle(host)
      const noReason = yield* Effect.exit(drive(host, host.remove("example/logger", ctx())))
      expect(tagOf(noReason)).toContain("ReasonRequired")
      expect(yield* stateOf(host, "example/logger")).toBe("active")
      yield* settleWriter
      expect(s.records.filter((r) => r.actor.id === "bridger:unattributed")).toEqual([])
      expect(s.records.filter((r) => r.operation === "remove")).toEqual([])
      // The ambient CurrentActor attributes a call without options; a per-call context wins over it.
      const bob: Actor = { id: "user-bob", kind: "user" }
      yield* drive(host, host.retry("example/logger")).pipe(Effect.provideService(CurrentActor, bob))
      yield* drive(host, host.remove("example/logger", ctx("CR-1"))).pipe(Effect.provideService(CurrentActor, bob))
      yield* settleWriter
      expect(s.records.find((r) => r.operation === "retry")?.actor.id).toBe("user-bob")
      expect(s.records.find((r) => r.operation === "remove")?.actor.id).toBe("user-alice")
    }), { sink: s, options: { attribution: { require: true, requireReason: ["remove"] } } })
  })
})

describe("audit records (behaviours 23, 24)", () => {
  it("check 33: exactly one requested and one terminal record per admitted call, including no-ops", async () => {
    const s = memorySink()
    await run((host) => Effect.gen(function* () {
      yield* host.install(loggerPlugin(journal()), ctx())
      yield* idle(host)
      yield* drive(host, host.retry("example/logger", ctx()))                         // no-op on active
      yield* drive(host, host.remove("example/logger", ctx("done")))
      yield* settleWriter
      const operator = s.records.filter((r) => r.phase !== "system")
      const byCorrelation = new Map<string, Array<string>>()
      for (const r of operator) byCorrelation.set(r.correlationId, [...(byCorrelation.get(r.correlationId) ?? []), r.phase])
      expect([...byCorrelation.values()]).toEqual([["requested", "completed"], ["requested", "completed"], ["requested", "completed"]])
      expect(operator.find((r) => r.operation === "retry" && r.phase === "completed")?.noop).toBe(true)
      expect(operator.find((r) => r.operation === "remove" && r.phase === "requested")?.reason).toBe("done")
    }), { sink: s })
  })

  it("check 39: system transitions carry Actor.system and the causation of their trigger, and are never gated", async () => {
    const s = memorySink()
    const g = scriptedGate(() => "allow")
    await run((host) => Effect.gen(function* () {
      yield* host.install(auditPlugin(journal()), ctx())
      yield* host.install(loggerPlugin(journal()), ctx())
      yield* idle(host)
      yield* drive(host, host.remove("example/logger", ctx("swap")))
      yield* settleWriter
      const removeReq = s.records.find((r) => r.operation === "remove" && r.phase === "requested")!
      const stop = s.records.find((r) => r.operation === "system-stop")!
      expect(stop.actor.id).toBe("bridger:system")
      expect(stop.target?.id).toBe("example/audit")
      expect(stop.causationId).toBe(removeReq.recordId)
      const starts = s.records.filter((r) => r.operation === "system-start").map((r) => r.target?.id)
      expect(starts).toEqual(["example/logger", "example/audit"])
      expect(g.requests.map((r) => r.operation)).toEqual(["install", "install", "remove"])   // no system transition gated
    }), { sink: s, gate: g })
  })

  it("check 35 / 36: auditSeq is contiguous from 1; a failed write is retried in place with the same id and number", async () => {
    const s = memorySink()
    await run((host) => Effect.gen(function* () {
      yield* host.install(loggerPlugin(journal()), ctx())
      yield* idle(host)
      yield* settleWriter
      s.mode.current = "fail"
      const failing = yield* Effect.forkChild(host.retry("example/logger", ctx()))   // its requested write will fail for a while
      yield* Effect.sleep(30)
      s.mode.current = "store"
      yield* Fiber.await(failing)
      yield* Effect.sleep(200)
      const seqs = s.records.map((r) => r.auditSeq)
      expect(verifyAuditSequence(s.records)).toEqual({ gaps: [], duplicates: [], outOfOrder: [] })
      expect(seqs).toEqual(seqs.map((_, i) => i + 1))
      const retried = s.attempts.filter((a) => a.operation === "retry" && a.phase === "requested")
      expect(retried.length).toBeGreaterThan(1)
      expect(new Set(retried.map((a) => `${a.recordId}#${a.auditSeq}`)).size).toBe(1)
    }), { sink: s })
  })

  it("check 36: verifyAuditSequence reports gaps, duplicates and disorder only", () => {
    expect(verifyAuditSequence([1, 2, 4, 4, 3].map((auditSeq) => ({ auditSeq })))).toEqual({
      gaps: [{ after: 2, before: 4 }], duplicates: [4], outOfOrder: [3] })
    expect(verifyAuditSequence([2, 3].map((auditSeq) => ({ auditSeq }))).gaps).toEqual([{ after: 0, before: 2 }])
  })
})

describe("fail closed and the latch (behaviour 23)", () => {
  it("check 32: a requested record that cannot be written fails the call with AuditUnavailable and changes nothing", async () => {
    const s = memorySink()
    await run((host) => Effect.gen(function* () {
      s.mode.current = "hang"
      const r = yield* Effect.exit(host.install(loggerPlugin(journal()), ctx()))
      expect(tagOf(r)).toContain("AuditUnavailable")
      expect((yield* host.snapshot).plugins).toEqual([])
    }), { sink: s })
  })

  it("check 34: an unwritten terminal record latches; mutations are refused; shutdown and acknowledgement are allowed", async () => {
    const s = memorySink()
    await run((host) => Effect.gen(function* () {
      yield* host.install(loggerPlugin(journal()), ctx())
      yield* idle(host)
      yield* settleWriter
      // Make the sink fail after the requested record of the next call: the terminal record cannot be written.
      let n = 0
      s.mode.current = () => (++n > 1 ? "fail" : "store")
      yield* drive(host, host.retry("example/logger", ctx()))
      yield* Effect.sleep(150)
      expect((yield* host.snapshot).auditDegraded).toBe(true)
      expect(tagOf(yield* Effect.exit(drive(host, host.restart("example/logger", ctx()))))).toContain("AuditUnavailable")
      const noReason = yield* Effect.exit(drive(host, host.acknowledgeAuditDegraded({ context: { actor: alice } })))
      expect(tagOf(noReason)).toContain("ReasonRequired")
      const whileDown = yield* Effect.exit(drive(host, host.acknowledgeAuditDegraded({ context: { actor: alice, reason: "store restored" } })))
      expect(tagOf(whileDown)).toContain("AuditUnavailable")      // acknowledgement needs a writable sink
      s.mode.current = "store"
      yield* Effect.sleep(250)                                      // the writer drains the retried records
      yield* drive(host, host.acknowledgeAuditDegraded({ context: { actor: alice, reason: "store restored" } }))
      expect((yield* host.snapshot).auditDegraded).toBe(false)
      yield* drive(host, host.restart("example/logger", ctx()))
      const report = yield* drive(host, host.shutdown(ctx()))
      expect(report.failed).toEqual([])
      yield* settleWriter
      expect(verifyAuditSequence(s.records)).toEqual({ gaps: [], duplicates: [], outOfOrder: [] })
    }), { sink: s })
  })
})

describe("operation gate (behaviour 25)", () => {
  it("check 32: validation failures reach neither gate nor sink; refusals, gate defects and timeouts leave one rejected record and change nothing", async () => {
    const s = memorySink()
    const decisions: Record<string, "allow" | "deny" | "die" | "hang"> = { "example/logger": "allow", "deny/me": "deny", "die/me": "die", "hang/me": "hang" }
    const g = scriptedGate((r) => decisions[r.target?.id ?? ""] ?? "allow")
    await run((host) => Effect.gen(function* () {
      yield* host.install(loggerPlugin(journal()), ctx())
      const dup = yield* Effect.exit(host.install(loggerPlugin(journal()), ctx()))       // validation failure
      expect(tagOf(dup)).toContain("DuplicatePlugin")
      expect(g.requests).toHaveLength(1)
      for (const id of ["deny/me", "die/me", "hang/me"]) {
        const r = yield* Effect.exit(host.install(define({ id, requires: [] as const, provides: [] as const, build: Layer.empty }), ctx()))
        expect(tagOf(r)).toContain("OperationRejected")
        expect((yield* host.snapshot).plugins.some((p) => p.id === id)).toBe(false)
      }
      yield* settleWriter
      const rejected = s.records.filter((r) => r.phase === "rejected")
      expect(rejected.map((r) => [r.target?.id, r.error?.message])).toEqual([["deny/me", "not approved"], ["die/me", "gate-defect"], ["hang/me", "gate-timeout"]])
      expect(s.records.filter((r) => r.phase === "requested").map((r) => r.target?.id)).toEqual(["example/logger"])
      expect(s.records.some((r) => r.operation === "install" && r.target?.id === "example/logger" && r.phase === "rejected")).toBe(false)
    }), { sink: s, gate: g })
  })

  it("check 42: gate requests and records carry the definition version and digest; a gate can refuse by digest", async () => {
    const s = memorySink()
    const g = scriptedGate((r) => (r.definition?.digest === "sha256:bad" ? "deny" : "allow"))
    await run((host) => Effect.gen(function* () {
      const good = { ...loggerPlugin(journal()), meta: { version: "1.0.0", digest: "sha256:good" } }
      const bad = { ...good, meta: { version: "1.0.1", digest: "sha256:bad" } }
      yield* host.install(good, ctx())
      const r = yield* Effect.exit(drive(host, host.replace(bad, ctx())))
      expect(tagOf(r)).toContain("OperationRejected")
      yield* settleWriter
      expect(g.requests.map((q) => q.definition)).toEqual([{ version: "1.0.0", digest: "sha256:good" }, { version: "1.0.1", digest: "sha256:bad" }])
      expect(s.records.find((x) => x.phase === "requested")?.before?.digest).toBe("sha256:good")
    }), { sink: s, gate: g })
  })
})

describe("hooks are optional (BEH-BR-194, 217)", () => {
  it("check 38: with no sink and no gate, outcomes and snapshots equal those with a sink and an allow-all gate (except `audit`)", async () => {
    const script = (host: Testing.TestHost) => Effect.gen(function* () {
      yield* host.install(auditPlugin(journal()), ctx()); yield* host.install(loggerPlugin(journal()), ctx())
      yield* idle(host)
      yield* drive(host, host.restart("example/logger", ctx())); yield* idle(host)
      yield* drive(host, host.disable("example/audit", ctx()))
      const snap = yield* host.snapshot
      return { ...snap, audit: "ignored" }
    })
    const bare = await run(script)
    const wired = await run(script, { sink: memorySink(), gate: scriptedGate(() => "allow") })
    expect(wired).toEqual(bare)
  })

  it("check 41: no core source reads ambient time or randomness outside the default IdGenerator", () => {
    const offenders: Array<string> = []
    for (const f of readdirSync(new URL("../src/", import.meta.url))) {
      const lines = readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8").split("\n")
      lines.forEach((l, i) => {
        if (/Date\.now\(|performance\.now\(|Math\.random\(|new Date\(\)/.test(l)) offenders.push(`${f}:${i + 1}`)
        if (/crypto\.randomUUID\(/.test(l) && !l.includes("defaultIdGenerator")) offenders.push(`${f}:${i + 1}`)
      })
    }
    expect(offenders).toEqual([])
  })
})

void Context; void Logger
