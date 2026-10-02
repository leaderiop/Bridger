// Phase-P2 scenarios: runtime failure and health (behaviour 10), configuration (11), shutdown and
// hosting (12), observability (13). Acceptance checks 5, 7, 8, 13–15, 17, 20, 28, 30 and 37 of BEH-BR-183/184.
import { Cause, Context, Deferred, Effect, Exit, Fiber, Layer, ManagedRuntime, Schema, Stream } from "effect"
import { TestClock } from "effect/testing"
import { describe, expect, it } from "vitest"
import { PluginConfig } from "../src/config.js"
import type { HostEvent } from "../src/events.js"
import { AuditSink, OperationGate, type AuditRecord } from "../src/gxp.js"
import * as Host from "../src/host.js"
import { define } from "../src/plugin.js"
import { PluginRuntime } from "../src/runtime.js"
import { Audit, Logger, auditPlugin, journal, loggerPlugin, quickClose, stateOf, type Journal } from "./fixtures.js"

const failedWith = (exit: Exit.Exit<unknown, unknown> | undefined, text: string) => !!exit && Exit.isFailure(exit) && JSON.stringify(exit.cause).includes(text)
const ctx = (c: string) => ({ context: { actor: { id: "user-alice", kind: "user" as const }, correlationId: c } })

/** A host with an in-memory sink, an optional TestClock, an event collector started before the body runs. */
const run = <A, E>(
  body: (host: Host.Host, t: { records: Array<AuditRecord>; events: Array<HostEvent> }) => Effect.Effect<A, E>,
  opts: { options?: Host.Options; testClock?: boolean; gate?: OperationGate["Service"]; noCollector?: boolean } = {}
) => {
  const records: Array<AuditRecord> = []
  const events: Array<HostEvent> = []
  const sink: AuditSink["Service"] = { record: (r) => Effect.sync(() => { records.push(r) }) }
  let program = Effect.scoped(Effect.gen(function* () {
    let make = Host.make({ ...quickClose, auditTimeout: 50, ...opts.options }).pipe(Effect.provideService(AuditSink, sink))
    if (opts.gate) make = make.pipe(Effect.provideService(OperationGate, opts.gate))
    const host = yield* make
    if (!opts.noCollector) { yield* Effect.forkScoped(Stream.runForEach(host.events, (e) => Effect.sync(() => { events.push(e) }))); yield* Effect.yieldNow }
    return yield* body(host, { records, events })
  }))
  if (opts.testClock) program = program.pipe(Effect.provide(TestClock.layer())) as typeof program
  return Effect.runPromise(program)
}

// -------------------------------------------------------------------------------- plugins
class Worker extends Context.Service<Worker, { readonly ping: Effect.Effect<string> }>()("x/Worker") {}
/** A worker whose background fiber fails when `trigger` completes (it requires Logger, so Audit-like cascades apply). */
const workerPlugin = (j: Journal, trigger: Deferred.Deferred<void>, policy: "fail-plugin" | "restart" | "ignore" = "fail-plugin", failures = Infinity) => {
  let failed = 0
  return define({
    id: "x/worker", requires: [] as const, provides: [Worker] as const,
    build: Layer.effect(Worker, Effect.gen(function* () {
      const rt = yield* PluginRuntime
      yield* rt.background("loop", Deferred.await(trigger).pipe(
        Effect.andThen(Effect.suspend(() => ++failed <= failures ? Effect.fail("boom") : Effect.never))), { onFailure: policy })
      yield* j.push("worker:build")
      yield* Effect.addFinalizer(() => j.push("worker:close"))
      return { ping: Effect.succeed("pong") }
    }))
  })
}
class Client extends Context.Service<Client, {}>()("x/Client") {}
const clientOf = (j: Journal) => define({
  id: "x/client", requires: [Worker] as const, provides: [Client] as const,
  build: Layer.effect(Client, Effect.gen(function* () {
    yield* j.push("client:build"); yield* Effect.addFinalizer(() => j.push("client:close")); return {}
  }))
})

class Cfg extends Context.Service<Cfg, { readonly value: unknown; readonly current: Effect.Effect<unknown> }>()("x/Cfg") {}
const CfgSchema = Schema.Struct({ url: Schema.String, level: Schema.Number })
const cfgPlugin = (j: Journal) => define({
  id: "x/cfg", requires: [] as const, provides: [Cfg] as const, config: CfgSchema, volatile: ["level"],
  build: Layer.effect(Cfg, Effect.gen(function* () {
    const c = yield* PluginConfig
    yield* j.push(`cfg:build:${JSON.stringify(c.value)}`)
    yield* Effect.addFinalizer(() => j.push("cfg:close"))
    return { value: c.value, current: c.current }
  }))
})
const source = (v: unknown) => () => Effect.succeed(v)

// -------------------------------------------------------------------------------- behaviour 10
describe("runtime failure (behaviour 10)", () => {
  it("check 5 / BEH-BR-090, 094, 096: a failing background fiber stops dependents first and ends failed(runtime), sticky until retry", async () => {
    const j = journal()
    await run((host, t) => Effect.gen(function* () {
      const trigger = yield* Deferred.make<void>()
      yield* host.install(workerPlugin(j, trigger, "fail-plugin", 1)); yield* host.install(clientOf(j)); yield* host.awaitIdle
      j.lines.length = 0
      yield* Deferred.succeed(trigger, undefined)
      yield* host.awaitIdle
      expect(j.lines).toEqual(["client:close", "worker:close"])                       // dependents first
      const w = (yield* host.snapshot).plugins.find((p) => p.id === "x/worker")!
      expect(w.state === "failed" && w.failure.phase).toBe("runtime")
      expect(yield* stateOf(host, "x/client")).toBe("waiting")
      expect(t.events.some((e) => e.type === "state-changed" && e.pluginId === "x/worker" && e.to === "stopping" && e.reason === "runtime-failure")).toBe(true)
      yield* Effect.sleep(20)
      const root = t.records.find((r) => r.operation === "runtime-failure")!
      expect(root.causationId).toBeUndefined()                                            // a root system record
      expect(t.records.find((r) => r.operation === "system-stop" && r.target?.id === "x/client")!.causationId).toBe(root.recordId)
      // Sticky: the worker's provider-free requirements never restart it; retry does (BEH-BR-096).
      expect(yield* stateOf(host, "x/worker")).toBe("failed")
      yield* host.retry("x/worker"); yield* host.awaitIdle
      expect(yield* stateOf(host, "x/worker")).toBe("active")
    }))
  })

  it("BEH-BR-095: with no caller, a lease on a dependent is revoked at the drain limit; nothing parks", async () => {
    await run((host) => Effect.gen(function* () {
      const trigger = yield* Deferred.make<void>()
      yield* host.install(workerPlugin(journal(), trigger)); yield* host.install(clientOf(journal())); yield* host.awaitIdle
      const entered = yield* Deferred.make<void>()
      const holder = yield* Effect.forkChild(host.use(Client, () => Deferred.succeed(entered, undefined).pipe(Effect.andThen(Effect.never))))
      yield* Deferred.await(entered)
      yield* Deferred.succeed(trigger, undefined)
      expect(failedWith(yield* Fiber.await(holder), "LeaseRevoked")).toBe(true)
      yield* host.awaitIdle
      const snap = yield* host.snapshot
      expect(snap.plugins.find((p) => p.id === "x/worker")!.state).toBe("failed")
      expect(snap.plugins.some((p) => p.state === "stopping")).toBe(false)
    }))
  })

  it("BEH-BR-090: restart restarts only the fiber; ignore logs and changes nothing; inspect reports them", async () => {
    await run((host) => Effect.gen(function* () {
      const trigger = yield* Deferred.make<void>()
      yield* host.install(workerPlugin(journal(), trigger, "restart", 2)); yield* host.awaitIdle
      yield* Deferred.succeed(trigger, undefined)
      yield* Effect.sleep(300)                                                             // default schedule: spaced 100 ms
      expect(yield* stateOf(host, "x/worker")).toBe("active")
      const i = yield* host.inspect("x/worker")
      expect(i.background).toEqual([{ name: "loop", policy: "restart", restarts: 2, running: true }])
    }))
    await run((host) => Effect.gen(function* () {
      const trigger = yield* Deferred.make<void>()
      yield* host.install(workerPlugin(journal(), trigger, "ignore")); yield* host.awaitIdle
      yield* Deferred.succeed(trigger, undefined)
      yield* Effect.sleep(10)
      expect(yield* stateOf(host, "x/worker")).toBe("active")
      expect((yield* host.inspect("x/worker")).background[0]!.running).toBe(false)
    }))
  })

  it("BEH-BR-091: a failure reported during the build fails the activation and publishes nothing", async () => {
    const early = define({
      id: "x/early", requires: [] as const, provides: [Worker] as const,
      build: Layer.effect(Worker, Effect.gen(function* () {
        const rt = yield* PluginRuntime
        yield* rt.reportFailure(Cause.fail(new Error("bad device")))
        return { ping: Effect.succeed("never") }
      }))
    })
    await run((host) => Effect.gen(function* () {
      yield* host.install(early); yield* host.awaitIdle
      const p = (yield* host.snapshot).plugins[0]!
      expect(p.state === "failed" && p.failure.phase).toBe("activation")
      expect((yield* host.snapshot).availableServiceIds).toEqual([])
    }))
  })

  it("check 14 / BEH-BR-092, 093: health degrades, then fails at the threshold; an in-flight check is not counted when the plugin leaves active", async () => {
    let healthy = true
    const probed = define({
      id: "x/probed", requires: [] as const, provides: [Worker] as const,
      health: { check: Effect.suspend(() => healthy ? Effect.void : Effect.fail("down")), every: 1_000, timeout: 500, failureThreshold: 3 },
      build: Layer.succeed(Worker, { ping: Effect.succeed("pong") })
    })
    await run((host, t) => Effect.gen(function* () {
      yield* host.install(probed); yield* host.awaitIdle
      const health = Effect.map(host.snapshot, (s) => { const p = s.plugins[0]!; return p.state === "active" ? p.health : p.state })
      expect(yield* health).toBe("unknown")
      yield* TestClock.adjust(1_000); yield* host.awaitIdle
      expect(yield* health).toBe("healthy")
      healthy = false
      yield* TestClock.adjust(1_000); yield* Effect.yieldNow
      expect(yield* health).toBe("degraded")
      healthy = true
      yield* TestClock.adjust(1_000); yield* Effect.yieldNow
      expect(yield* health).toBe("healthy")                                             // a success resets the count
      healthy = false
      for (let i = 0; i < 3; i++) { yield* TestClock.adjust(1_000); yield* Effect.yieldNow }
      yield* host.awaitIdle
      const p = (yield* host.snapshot).plugins[0]!
      expect(p.state === "failed" && p.failure.phase).toBe("runtime")
      expect(t.records.filter((r) => r.operation === "health-degraded")).toHaveLength(2)   // only the entries into degraded
    }), { testClock: true })
    // An in-flight check is interrupted, not counted, when the plugin is removed.
    const gate = { started: 0 }
    const slow = define({
      id: "x/slow", requires: [] as const, provides: [Worker] as const,
      health: { check: Effect.sync(() => { gate.started++ }).pipe(Effect.andThen(Effect.never)), every: 1_000, timeout: 60_000, failureThreshold: 1 },
      build: Layer.succeed(Worker, { ping: Effect.succeed("pong") })
    })
    await run((host) => Effect.gen(function* () {
      yield* host.install(slow); yield* host.awaitIdle
      yield* TestClock.adjust(1_000); yield* Effect.yieldNow
      expect(gate.started).toBe(1)
      yield* host.remove("x/slow")                                                       // does not wait for the check's timeout
      expect(yield* stateOf(host, "x/slow")).toBe("uninstalled")
    }), { testClock: true })
  })
})

// -------------------------------------------------------------------------------- behaviour 11
describe("configuration (behaviour 11)", () => {
  it("check 7 / BEH-BR-097, 099: decode before build; an invalid value publishes nothing; the source is read at every activation", async () => {
    const j = journal()
    let value: unknown = { url: "db://a", level: 1 }
    await run((host, t) => Effect.gen(function* () {
      yield* host.install(cfgPlugin(j)); yield* host.awaitIdle
      expect(j.lines).toEqual([`cfg:build:{"url":"db://a","level":1}`])
      value = { url: 42 }                                                                // a corrected source is read on the next activation
      yield* host.restart("x/cfg"); yield* host.awaitIdle
      const p = (yield* host.snapshot).plugins[0]!
      expect(p.state === "failed" && p.failure.phase).toBe("activation")
      expect(p.state === "failed" && p.failure.message).toContain("ConfigInvalid")
      expect(t.events.some((e) => e.type === "config-rejected")).toBe(true)
      expect(j.lines.filter((l) => l.startsWith("cfg:build"))).toHaveLength(1)        // build never ran
      value = { url: "db://b", level: 2 }
      yield* host.retry("x/cfg"); yield* host.awaitIdle
      expect(j.lines.at(-1)).toBe(`cfg:build:{"url":"db://b","level":2}`)
    }), { options: { config: () => Effect.sync(() => value) } })
  })

  it("check 13 / BEH-BR-099, 101: an override wins over the source; reconfigure without a value clears it; ConfigInvalid leaves the plugin running", async () => {
    const j = journal()
    await run((host, t) => Effect.gen(function* () {
      yield* host.install(cfgPlugin(j), { config: { url: "db://override", level: 1 } }); yield* host.awaitIdle
      expect(j.lines.at(-1)).toBe(`cfg:build:{"url":"db://override","level":1}`)
      const bad = yield* Effect.exit(host.reconfigure("x/cfg", { url: 7, level: 1 }, ctx("c-bad")))
      expect(failedWith(bad, "ConfigInvalid")).toBe(true)
      expect(yield* stateOf(host, "x/cfg")).toBe("active")
      yield* Effect.sleep(20)
      expect(t.records.some((r) => r.correlationId === "c-bad")).toBe(false)            // refused at step 4: no record
      yield* host.reconfigure("x/cfg"); yield* host.awaitIdle                           // clear: back to the source
      expect(j.lines.at(-1)).toBe(`cfg:build:{"url":"db://source","level":0}`)
      yield* host.restart("x/cfg"); yield* host.awaitIdle                               // restart keeps (no) override
      expect(j.lines.at(-1)).toBe(`cfg:build:{"url":"db://source","level":0}`)
    }), { options: { config: source({ url: "db://source", level: 0 }) } })
  })

  it("check 28 / BEH-BR-102: a volatile-only change updates in place; a non-volatile change restarts with configChange paths", async () => {
    const j = journal()
    await run((host, t) => Effect.gen(function* () {
      yield* host.install(cfgPlugin(j)); yield* host.awaitIdle
      const cfg = yield* host.use(Cfg, (c) => Effect.succeed(c))
      yield* host.reconfigure("x/cfg", { url: "db://a", level: 5 }, ctx("c-vol"))
      expect(j.lines.filter((l) => l.startsWith("cfg:build"))).toHaveLength(1)        // no restart
      expect(cfg.value).toEqual({ url: "db://a", level: 0 })                             // `value` never changes
      expect(yield* cfg.current).toEqual({ url: "db://a", level: 5 })
      expect(t.events.find((e) => e.type === "config-updated")).toMatchObject({ paths: ["level"] })
      yield* host.reconfigure("x/cfg", { url: "db://b", level: 5 }, ctx("c-url")); yield* host.awaitIdle
      expect(j.lines.at(-1)).toBe(`cfg:build:{"url":"db://b","level":5}`)
      yield* Effect.sleep(20)
      for (const c of ["c-vol", "c-url"]) for (const r of t.records.filter((x) => x.correlationId === c && x.operation === "reconfigure"))
        expect(r.configChange).toEqual({ paths: c === "c-vol" ? ["level"] : ["url"] })
      // equal value: a no-op success
      yield* host.reconfigure("x/cfg", { url: "db://b", level: 5 }, ctx("c-same"))
      yield* Effect.sleep(20)
      expect(t.records.find((r) => r.correlationId === "c-same" && r.phase === "completed")!.noop).toBe(true)
    }), { options: { config: source({ url: "db://a", level: 0 }) } })
  })

  it("check 37 / BEH-BR-103: no configuration value appears in any record, event, snapshot or error", async () => {
    const secret = "s3cr3t-Pa55"
    await run((host, t) => Effect.gen(function* () {
      yield* host.install(cfgPlugin(journal()), { config: { url: secret, level: 1 }, ...ctx("c-1") }); yield* host.awaitIdle
      yield* host.reconfigure("x/cfg", { url: `${secret}-2`, level: 1 }, ctx("c-2")); yield* host.awaitIdle
      const bad = yield* Effect.exit(host.reconfigure("x/cfg", { url: secret, level: secret }, ctx("c-3")))
      yield* host.reconfigure("x/cfg", { url: `${secret}-2`, level: 9 }, ctx("c-4"))
      yield* Effect.sleep(20)
      const surfaces = JSON.stringify([t.records, t.events, yield* host.snapshot, bad, yield* host.inspect("x/cfg")])
      expect(surfaces).not.toContain(secret)
      expect(surfaces).toContain("ConfigInvalid")
    }), { options: { config: source({ url: "db://a", level: 0 }) } })
  })

  it("BEH-BR-072 (reconfigure cells): joins a restart in flight; equal value joins; a different value supersedes; remove supersedes", async () => {
    const j = journal()
    await run((host, t) => Effect.gen(function* () {
      yield* host.install(cfgPlugin(j)); yield* host.awaitIdle
      const entered = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      yield* Effect.forkChild(host.use(Cfg, () => Deferred.succeed(entered, undefined).pipe(Effect.andThen(Deferred.await(release)))))
      yield* Deferred.await(entered)
      const r1 = yield* Effect.forkChild(host.reconfigure("x/cfg", { url: "db://1", level: 0 }, ctx("c-r1")))
      yield* Effect.sleep(10)
      const r2 = yield* Effect.forkChild(host.reconfigure("x/cfg", { url: "db://1", level: 0 }, ctx("c-r2")))   // equal: joins
      const r3 = yield* Effect.forkChild(host.reconfigure("x/cfg", { url: "db://3", level: 0 }, ctx("c-r3")))   // different: supersedes
      yield* Effect.sleep(10)
      const restart = yield* Effect.forkChild(host.restart("x/cfg", ctx("c-rs")))                               // restart joins a reconfigure
      yield* Effect.sleep(10)
      yield* Deferred.succeed(release, undefined)
      expect(failedWith(yield* Fiber.await(r1), "Superseded")).toBe(true)
      expect(failedWith(yield* Fiber.await(r2), "Superseded")).toBe(true)
      expect(Exit.isSuccess(yield* Fiber.await(r3))).toBe(true)
      expect(Exit.isSuccess(yield* Fiber.await(restart))).toBe(true)
      yield* host.awaitIdle
      expect(j.lines.at(-1)).toBe(`cfg:build:{"url":"db://3","level":0}`)              // the later value is the target
      yield* Effect.sleep(20)
      // A joined record carries the correlation of the call it joined, and the joiner's in causationId (BEH-BR-200).
      expect(t.records.find((r) => r.phase === "joined" && r.causationId === "c-rs")).toMatchObject({ correlationId: "c-r3" })
    }), { options: { config: source({ url: "db://a", level: 0 }) } })
  })

  it("BEH-BR-101, 080 (T1, T13): a parked reconfigure ended by a cascade reverts the override; intent-ended carries the paths", async () => {
    const j = journal()
    class Needs extends Context.Service<Needs, {}>()("x/Needs") {}
    const cfgOnLogger = define({
      id: "x/cfg", requires: [Logger] as const, provides: [Needs] as const, config: CfgSchema, volatile: ["level"],
      build: Layer.effect(Needs, Effect.gen(function* () { const c = yield* PluginConfig; yield* j.push(`cfg:build:${JSON.stringify(c.value)}`); return {} }))
    })
    await run((host, t) => Effect.gen(function* () {
      yield* host.install(loggerPlugin(journal())); yield* host.install(cfgOnLogger); yield* host.awaitIdle
      const entered = yield* Deferred.make<void>()
      yield* Effect.forkChild(host.use(Needs, () => Deferred.succeed(entered, undefined).pipe(Effect.andThen(Effect.never))))
      yield* Deferred.await(entered)
      // reconfigure drains under drainTimeout (200 ms here) and never forces: it parks with the new override stored.
      expect(failedWith(yield* Effect.exit(host.reconfigure("x/cfg", { url: "db://new", level: 0 }, ctx("c-park"))), "DrainTimeout")).toBe(true)
      yield* host.remove("example/logger", { drain: 20, force: true })                  // ends the parked intent
      yield* host.install(loggerPlugin(journal())); yield* host.awaitIdle
      expect(j.lines.at(-1)).toBe(`cfg:build:{"url":"db://a","level":0}`)              // reverted to the last completed configuration
      yield* Effect.sleep(20)
      const parkReq = t.records.find((r) => r.correlationId === "c-park" && r.phase === "requested")!
      const ended = t.records.find((r) => r.operation === "intent-ended")!
      expect(ended).toMatchObject({ endsIntentOf: parkReq.recordId, configChange: { paths: ["level", "url"] } })
    }), { options: { config: source({ url: "db://a", level: 0 }) } })
  })
})

// -------------------------------------------------------------------------------- behaviour 12
describe("shutdown and hosting (behaviour 12)", () => {
  it("check 8 / BEH-BR-105–107: the report lists cleanup failures, drain shortfalls and forced plugins; durationMs from the Clock", async () => {
    let report: Host.CloseReport | undefined
    await run((host) => Effect.gen(function* () {
      yield* host.install(loggerPlugin(journal(), { failCleanup: true })); yield* host.install(auditPlugin(journal())); yield* host.awaitIdle
      const entered = yield* Deferred.make<void>()
      const holder = yield* Effect.forkChild(host.use(Audit, () => Deferred.succeed(entered, undefined).pipe(Effect.andThen(Effect.never))))
      yield* Deferred.await(entered)
      const call = yield* Effect.forkChild(host.shutdown({ timeout: 5_000 }))
      yield* TestClock.adjust(200)                                                          // audit's drain limit passes
      yield* TestClock.adjust(5_000)                                                        // then the overall limit: force
      report = yield* Fiber.join(call)
      expect(failedWith(yield* Fiber.await(holder), "LeaseRevoked")).toBe(true)
    }), { testClock: true })
    expect(report!.failed).toEqual([
      { id: "example/audit", cause: "drain", message: "1 lease(s) still held at the drain limit" },
      { id: "example/logger", cause: "cleanup", message: "sink close failed" }])
    expect(report!.forced).toEqual(["example/audit"])
    expect(report!.stopped).toEqual(["example/audit"])                                    // logger's scope failed to close
    expect(report!.durationMs).toBe(5_000)                                                // revoked at the overall limit
  })

  it("BEH-BR-109: concurrent shutdowns join; after completion the original report returns and nothing is recorded; HostClosed, changes and events end", async () => {
    await run((host, t) => Effect.gen(function* () {
      yield* host.install(loggerPlugin(journal())); yield* host.awaitIdle
      const changesDone = yield* Effect.forkChild(Stream.runDrain(host.changes))
      const a = yield* Effect.forkChild(host.shutdown(ctx("c-a")))
      const b = yield* Effect.forkChild(host.shutdown(ctx("c-b")))
      const ra = yield* Fiber.join(a); const rb = yield* Fiber.join(b)
      expect(rb).toEqual(ra)
      yield* Effect.sleep(20)
      expect(t.records.find((r) => r.correlationId === "c-a" && r.phase === "joined")).toMatchObject({ causationId: "c-b" })
      const count = t.records.length
      expect(yield* host.shutdown(ctx("c-c"))).toEqual(ra)
      yield* Effect.sleep(20)
      expect(t.records.length).toBe(count)                                                // no record after completion
      for (const op of [host.install(loggerPlugin(journal())), host.awaitIdle, host.inspect("example/logger")] as Array<Effect.Effect<unknown, unknown>>)
        expect(failedWith(yield* Effect.exit(op), "HostClosed")).toBe(true)
      expect(Exit.isSuccess(yield* Fiber.await(changesDone))).toBe(true)                // `changes` ended
      expect(t.events.at(-1)!.type).toBe("closed")
    }))
  })

  it("BEH-BR-108, 110: closing the scope shuts down as Actor.system despite required attribution and a set latch; onClose gets the report once", async () => {
    const reports: Array<Host.CloseReport> = []
    let latchProbe = false
    const records: Array<AuditRecord> = []
    const sink: AuditSink["Service"] = { record: (r) => Effect.sync(() => { records.push(r) }) }
    const denyAll: OperationGate["Service"] = { authorize: () => Effect.die("must not be consulted") }
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const host = yield* Host.make({ ...quickClose, auditTimeout: 50, attribution: { require: true, requireReason: ["shutdown"] },
        onClose: (r) => Effect.sync(() => { reports.push(r) }) }).pipe(Effect.provideService(AuditSink, sink), Effect.provideService(OperationGate, denyAll))
      latchProbe = (yield* host.snapshot).auditDegraded
    })))
    expect(latchProbe).toBe(false)
    expect(reports).toHaveLength(1)
    const req = records.find((r) => r.operation === "shutdown" && r.phase === "requested")!
    expect(req.actor.id).toBe("bridger:system")
    expect(records.find((r) => r.operation === "shutdown" && r.phase === "completed")).toBeDefined()
  })

  it("BEH-BR-105 (T1, T7): shutdown resumes a parked stop, ends its intent with intent-ended caused by shutdown, and never parks", async () => {
    await run((host, t) => Effect.gen(function* () {
      yield* host.install(loggerPlugin(journal())); yield* host.awaitIdle
      const entered = yield* Deferred.make<void>()
      yield* Effect.forkChild(host.use(Logger, () => Deferred.succeed(entered, undefined).pipe(Effect.andThen(Effect.never))))
      yield* Deferred.await(entered)
      expect(failedWith(yield* Effect.exit(host.remove("example/logger", { drain: 20, ...ctx("c-park") })), "DrainTimeout")).toBe(true)
      const report = yield* host.shutdown(ctx("c-shut"))
      expect(report.forced).toEqual(["example/logger"])
      yield* Effect.sleep(20)
      const shutReq = t.records.find((r) => r.correlationId === "c-shut" && r.phase === "requested")!
      const parkReq = t.records.find((r) => r.correlationId === "c-park" && r.phase === "requested")!
      expect(t.records.find((r) => r.operation === "intent-ended")).toMatchObject({ endsIntentOf: parkReq.recordId, causationId: shutReq.recordId })
      expect(t.events.some((e) => e.type === "stop-resumed" && e.by === "shutdown" && e.endsIntent === "remove")).toBe(true)
    }))
  })

  it("check 20 / BEH-BR-111: ManagedRuntime hosting forces the build, and dispose after shutdown keeps the report", async () => {
    const reports: Array<Host.CloseReport> = []
    const runtime = ManagedRuntime.make(Host.layer({ ...quickClose, onClose: (r) => Effect.sync(() => { reports.push(r) }) }))
    await runtime.context()                                                               // forces the build
    await runtime.runPromise(Effect.gen(function* () {
      const host = yield* Host.BridgerHost
      yield* host.install(loggerPlugin(journal())); yield* host.awaitIdle
    }))
    const report = await runtime.runPromise(Effect.gen(function* () { return yield* (yield* Host.BridgerHost).shutdown() }))
    expect(report.stopped).toEqual(["example/logger"])
    await runtime.dispose()
    expect(reports).toEqual([report])                                                     // onClose once, not again on dispose
  })
})

// -------------------------------------------------------------------------------- behaviour 13
describe("observability (behaviour 13)", () => {
  it("check 15 / BEH-BR-114, 115: seq starts at 1 and steps by one; a slow subscriber sees loss only as a gap", async () => {
    await run((host, t) => Effect.gen(function* () {
      yield* host.install(loggerPlugin(journal())); yield* host.install(auditPlugin(journal())); yield* host.awaitIdle
      yield* Effect.sleep(10)
      expect(t.events.map((e) => e.seq)).toEqual(t.events.map((_, i) => i + 1))
      const logger = t.events.filter((e) => e.pluginId === "example/logger").map((e) => e.type)
      expect(logger.slice(0, 4)).toEqual(["plugin-installed", "state-changed", "build-started", "build-finished"])
    }))
    // A subscriber that falls behind a 4-event buffer: seq values increase, with a gap, never repeat.
    await run((host) => Effect.gen(function* () {
      const seen: Array<number> = []
      const slow = yield* Effect.forkChild(Stream.runForEach(host.events, (e) => Effect.sleep(5).pipe(Effect.andThen(Effect.sync(() => { seen.push(e.seq) })))))
      yield* Effect.yieldNow
      for (let i = 0; i < 6; i++) { yield* host.install(define({ id: `x/p${i}`, requires: [] as const, provides: [] as const, build: Layer.empty })) }
      yield* host.awaitIdle
      yield* Effect.sleep(200)
      yield* Fiber.interrupt(slow)
      expect(seen.length).toBeGreaterThan(0)
      for (let i = 1; i < seen.length; i++) expect(seen[i]!).toBeGreaterThan(seen[i - 1]!)
      expect(seen.at(-1)! - seen[0]! + 1).toBeGreaterThan(seen.length)                  // a gap
    }), { options: { eventBuffer: 4 }, noCollector: true })
  })

  it("BEH-BR-118: inspect shows parked and pending during a parked removal", async () => {
    await run((host) => Effect.gen(function* () {
      yield* host.install(loggerPlugin(journal())); yield* host.awaitIdle
      const entered = yield* Deferred.make<void>()
      yield* Effect.forkChild(host.use(Logger, () => Deferred.succeed(entered, undefined).pipe(Effect.andThen(Effect.never))))
      yield* Deferred.await(entered)
      yield* Effect.exit(host.remove("example/logger", { drain: 20, ...ctx("c-park") }))
      const i = yield* host.inspect("example/logger")
      expect(i).toMatchObject({ state: "stopping", parked: true, leases: 1, pending: { operation: "remove", correlationId: "c-park" } })
      expect(i.pending!.requestedRecordId).toBeDefined()
    }))
  })
})
