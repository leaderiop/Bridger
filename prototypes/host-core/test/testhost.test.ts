// Phase-P5 scenarios for @bridger/core/testing (behaviour 21, BEH-BR-177–182), run under TestClock.
import { Effect, Exit, Fiber, Layer, Scope, Stream } from "effect"
import { TestClock } from "effect/testing"
import { describe, expect, it } from "vitest"
import { AuditSink, OperationGate, type AuditRecord } from "../src/gxp.js"
import type { HostEvent } from "../src/events.js"
import { define, type AnyPlugin } from "../src/plugin.js"
import * as Testing from "../src/testing.js"
import { Logger, auditPlugin, journal, loggerPlugin, reportPlugin, type Journal } from "./fixtures.js"
import { as } from "./p4fixtures.js"

const failed = (exit: Exit.Exit<unknown, unknown>, tag: string) => Exit.isFailure(exit) && JSON.stringify(exit.cause).includes(tag)
const stateOf = (t: Testing.TestHost, id: string) => Effect.map(t.snapshot, (s) => s.plugins.find((p) => p.id === id)?.state ?? "uninstalled")

const runT = <A, E>(body: (t: Testing.TestHost) => Effect.Effect<A, E, Scope.Scope>, o: { options?: import("../src/host.js").Options; sink?: AuditSink["Service"]; gate?: OperationGate["Service"] } = {}) =>
  Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    let mk = Testing.make({ drainTimeout: 200, shutdownTimeout: 300, auditTimeout: 50, ...o.options })
    if (o.sink) mk = mk.pipe(Effect.provideService(AuditSink, o.sink))
    if (o.gate) mk = mk.pipe(Effect.provideService(OperationGate, o.gate))
    return yield* body(yield* mk)
  })).pipe(Effect.provide(TestClock.layer())))

const needs = (id: string): AnyPlugin => ({ id, requires: [Logger], provides: [], build: Layer.empty as unknown as AnyPlugin["build"] })
const sleeper = (j: Journal, id: string, ms: number): AnyPlugin => define({ id, requires: [] as const, provides: [] as const,
  build: Layer.effectDiscard(j.push(`${id}:start`).pipe(Effect.andThen(Effect.sleep(ms)), Effect.andThen(j.push(`${id}:built`)))) }) as unknown as AnyPlugin

describe("TestHost (BEH-BR-177, 178)", () => {
  it("BEH-BR-178: an operation records its intent and returns; its transition waits as a pending item until stepped", () => runT((t) => Effect.gen(function* () {
    const j = journal()
    yield* t.install(loggerPlugin(j), as(undefined, "c-1"))
    expect(yield* stateOf(t, "example/logger")).toBe("starting")
    expect(yield* t.pending).toEqual([{ kind: "build", pluginId: "example/logger", realm: "default", owner: "install", correlationId: "c-1", parked: false }])
    expect(j.lines).toEqual([])                                                // nothing ran on its own
    expect(yield* t.step).toBe(true)
    expect(yield* stateOf(t, "example/logger")).toBe("active")
    expect(yield* t.step).toBe(false)
  })))

  it("BEH-BR-178: builds made ready together are pending in registration order, owned by the system start", () => runT((t) => Effect.gen(function* () {
    const j = journal()
    yield* t.install(needs("zeta"), as())
    yield* t.install(needs("alpha"), as())
    yield* t.install(loggerPlugin(j), as())
    yield* t.step                                                               // the logger publishes; both become ready at once
    expect((yield* t.pending).map((p) => [p.pluginId, p.owner])).toEqual([["zeta", "system-start"], ["alpha", "system-start"]])
    yield* t.stepPlugin("alpha")                                                // a test may choose another order
    expect([yield* stateOf(t, "zeta"), yield* stateOf(t, "alpha")]).toEqual(["starting", "active"])
  })))

  it("BEH-BR-178: a cascade that meets a dependent's restart is a pending wait; step order is arrival order among items that can progress", () => runT((t) => Effect.gen(function* () {
    const j = journal()
    yield* t.install(loggerPlugin(j), as()); yield* t.install(auditPlugin(j), as())
    yield* t.runUntilIdle
    j.lines.length = 0
    const removal = yield* Effect.forkChild(t.remove("example/logger", as(undefined, "rm")))
    const restart = yield* Effect.forkChild(t.restart("example/audit", as(undefined, "rs")))
    yield* Effect.yieldNow
    expect((yield* t.pending).map((p) => [p.kind, p.pluginId, p.owner, p.correlationId])).toEqual([
      ["stop", "example/logger", "remove", "rm"], ["stop", "example/audit", "restart", "rs"]
    ])
    yield* t.step                                                               // the removal: hides the logger, then meets audit's step
    expect((yield* t.pending).map((p) => [p.kind, p.pluginId, p.waiter, p.owner])).toEqual([
      ["wait", "example/audit", "example/logger", "dependency-loss"], ["stop", "example/audit", undefined, "restart"]
    ])
    yield* t.runUntilIdle
    yield* Fiber.join(removal); yield* Fiber.join(restart)
    expect(j.lines).toEqual(["log:audit-finalizer", "audit:close", "logger:close"])
    expect(yield* stateOf(t, "example/audit")).toBe("waiting")
  })))

  it("BEH-BR-178: the concurrency limit holds while a build is suspended on the clock; a step that cannot progress returns false", () => runT((t) => Effect.gen(function* () {
    const j = journal()
    yield* t.install(sleeper(j, "slow", 1_000), as()); yield* t.install(sleeper(j, "next", 0), as())
    expect(yield* t.step).toBe(true)                                            // slow starts and suspends on the clock
    expect(j.lines).toEqual(["slow:start"])
    expect(yield* t.step).toBe(false)                                           // next cannot start: the only slot is held
    yield* TestClock.adjust(1_000)
    expect(yield* t.step).toBe(true)
    expect(j.lines).toEqual(["slow:start", "slow:built", "next:start", "next:built"])
  }), { options: { concurrency: 1 } }))

  it("finding G28: awaitIdle on a TestHost waits until the test steps; runUntilIdle steps", () => runT((t) => Effect.gen(function* () {
    yield* t.install(loggerPlugin(journal()), as())
    const idle = yield* Effect.forkChild(t.awaitIdle)
    for (let i = 0; i < 50; i++) yield* Effect.yieldNow
    expect(idle.pollUnsafe()).toBeUndefined()
    yield* t.runUntilIdle
    expect((yield* Fiber.join(idle)).plugins[0]!.state).toBe("active")
  })))

  it("finding G27: a test that ends with pending items still closes: from the scope's close on, transitions run on their own", () => runT((t) => Effect.gen(function* () {
    yield* t.install(loggerPlugin(journal()), as())
    yield* t.install(auditPlugin(journal()), as())
    expect((yield* t.pending).length).toBe(1)                                   // left pending on purpose
  })))
})

describe("TestHost: time, identifiers and determinism (BEH-BR-179)", () => {
  const script = (t: Testing.TestHost) => Effect.gen(function* () {
    const events: Array<HostEvent> = []
    yield* Effect.forkScoped(t.events.pipe(Stream.runForEach((e) => Effect.sync(() => { events.push(e) }))))
    yield* Effect.yieldNow
    const j = journal()
    yield* t.install(loggerPlugin(j), as()); yield* t.install(auditPlugin(j), as()); yield* t.install(reportPlugin(j), as())
    yield* t.runUntilIdle
    const snaps = [yield* t.snapshot]
    yield* TestClock.adjust(250)
    const rm = yield* Effect.forkChild(t.remove("example/logger", as("decommission")))
    yield* t.runUntilIdle; yield* Fiber.join(rm)
    snaps.push(yield* t.snapshot)
    yield* Effect.forkChild(t.install(loggerPlugin(j), as()))
    yield* t.runUntilIdle
    snaps.push(yield* t.snapshot)
    yield* t.runUntilIdle                                                       // a settlement point: the writer has drained
    return { events, snaps }
  })
  const once = () => {
    const records: Array<AuditRecord> = []
    const sink: AuditSink["Service"] = { record: (r) => Effect.sync(() => { records.push(r) }) }
    return runT((t) => script(t), { sink }).then((out) => ({ ...out, records }))
  }

  it("two runs of one script give identical snapshots, events and audit records, field for field; the host id is the first identifier", async () => {
    const a = await once(), b = await once()
    expect(a.records.length).toBeGreaterThan(10)
    expect(b.records).toEqual(a.records)
    expect(b.events).toEqual(a.events)
    expect(b.snaps).toEqual(a.snaps)
    expect(a.records[0]!.hostId).toBe("test-1")
    expect(a.records[0]!.timestamp).toBe(new Date(0).toISOString())
    expect(a.records.some((r) => r.timestamp === new Date(250).toISOString())).toBe(true)
  })
})

describe("TestHost: faults (BEH-BR-180)", () => {
  it("buildFails: every build fails while active (phase build, an injected message); retry succeeds once it ends", () => runT((t) => Effect.gen(function* () {
    const fault = yield* Scope.make()
    yield* t.inject(Testing.Fault.buildFails("example/logger")).pipe(Scope.provide(fault))
    yield* t.install(loggerPlugin(journal()), as())
    yield* t.runUntilIdle
    const p = (yield* t.snapshot).plugins[0]!
    expect(p.state === "failed" && [p.failure.phase, p.failure.message]).toEqual(["build", "injected fault: buildFails"])
    yield* Scope.close(fault, Exit.void)
    yield* t.retry("example/logger", as())
    yield* t.runUntilIdle
    expect(yield* stateOf(t, "example/logger")).toBe("active")
  })))

  it("stopFails: closing the activation fails — phase cleanup, CleanupError to the caller", () => runT((t) => Effect.gen(function* () {
    yield* t.inject(Testing.Fault.stopFails("example/logger"))
    yield* t.install(loggerPlugin(journal()), as())
    yield* t.runUntilIdle
    const call = yield* Effect.forkChild(t.restart("example/logger", as()))
    yield* t.runUntilIdle
    const exit = yield* Fiber.await(call)
    expect(failed(exit, "CleanupError") && failed(exit, "injected fault: stopFails")).toBe(true)
    const p = (yield* t.snapshot).plugins[0]!
    expect(p.state === "failed" && p.failure.phase).toBe("cleanup")
  })))

  it("holdLease: a held lease makes a removal time out under the clock; force revokes it", () => runT((t) => Effect.gen(function* () {
    yield* t.inject(Testing.Fault.holdLease("example/logger"))
    yield* t.install(loggerPlugin(journal()), as())
    yield* t.runUntilIdle
    yield* Effect.yieldNow
    expect((yield* t.inspect("example/logger")).leases).toBe(1)
    const call = yield* Effect.forkChild(t.remove("example/logger", { ...as(), drain: 100 }))
    yield* t.runUntilIdle
    yield* TestClock.adjust(100)
    expect(failed(yield* Fiber.await(call), "DrainTimeout")).toBe(true)
    const forced = yield* Effect.forkChild(t.remove("example/logger", { ...as(), drain: 100, force: true }))
    yield* t.runUntilIdle
    yield* TestClock.adjust(100)
    yield* t.runUntilIdle
    yield* Fiber.join(forced)
    expect(yield* stateOf(t, "example/logger")).toBe("uninstalled")
  })))

  it("runtimeFailure: one runtime failure, travelling the real path — dependents stop, the plugin ends failed (runtime)", () => runT((t) => Effect.gen(function* () {
    const j = journal()
    yield* t.install(loggerPlugin(j), as()); yield* t.install(auditPlugin(j), as())
    yield* t.runUntilIdle
    yield* t.inject(Testing.Fault.runtimeFailure("example/logger"))
    yield* Effect.yieldNow
    expect((yield* t.pending).map((p) => [p.kind, p.pluginId, p.owner])).toEqual([["stop", "example/logger", "runtime-failure"]])
    yield* t.runUntilIdle
    const p = (yield* t.snapshot).plugins.find((x) => x.id === "example/logger")!
    expect(p.state === "failed" && [p.failure.phase, p.failure.message]).toEqual(["runtime", "injected fault: runtimeFailure"])
    expect(j.lines.slice(-2)).toEqual(["audit:close", "logger:close"])
  })))
})

describe("fixtures (BEH-BR-181, 182)", () => {
  it("memoryAuditSink: idempotent on recordId; scripted outcomes; scriptedGate records every request and needs a decision", () => runT((t) => Effect.gen(function* () {
    const mem = yield* Testing.memoryAuditSink({ behave: (n) => n === 3 ? "fail" : "store" })
    const r = { recordId: "r-1" } as AuditRecord
    yield* mem.sink.record(r)
    yield* mem.sink.record(r)                                                    // stored once, succeeds
    expect(failed(yield* Effect.exit(mem.sink.record({ recordId: "r-2" } as AuditRecord)), "AuditWriteFailed")).toBe(true)
    expect([(yield* mem.records).length, yield* mem.attempts]).toEqual([1, 3])
    const g = yield* Testing.scriptedGate((req, i) => i === 0 ? "allow" : { refuse: `no ${req.operation}` })
    yield* g.gate.authorize({ operation: "install", actor: { id: "a", kind: "user" }, correlationId: "c" })
    const refused = yield* Effect.exit(g.gate.authorize({ operation: "remove", actor: { id: "a", kind: "user" }, correlationId: "c" }))
    expect(failed(refused, "no remove")).toBe(true)
    expect((yield* g.requests).map((x) => x.operation)).toEqual(["install", "remove"])
    void t
  })))
})
