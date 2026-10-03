// Scenarios for behaviour 09 (leases) and behaviour 08 (legality table).
import { Context, Deferred, Effect, Exit, Fiber, Layer, Schema, Scope } from "effect"
import { describe, expect, it } from "vitest"
import { legality, OPS, ROWS, type Op } from "../src/legality.js"
import { define } from "../src/plugin.js"
import * as Testing from "../src/testing.js"
import { Audit, Logger, auditPlugin, journal, loggerPlugin, drive, idle, memorySink, stateOf, withHost } from "./fixtures.js"

describe("leases", () => {
  it("check 2 / BEH-BR-085, 086: removal waits for a lease, fails with DrainTimeout, succeeds with force", async () => {
    await withHost((host) => Effect.gen(function* () {
      const j = journal()
      yield* host.install(loggerPlugin(j)); yield* idle(host)
      const entered = yield* Deferred.make<void>()
      const call = yield* Effect.forkChild(host.use(Logger, (l) => Deferred.succeed(entered, undefined).pipe(Effect.andThen(l.log("held")), Effect.andThen(Effect.never))))
      yield* Deferred.await(entered)
      const timedOut = yield* Effect.exit(drive(host, host.remove("example/logger", { drain: 20 })))
      expect(Exit.isFailure(timedOut) && JSON.stringify(timedOut.cause)).toContain("DrainTimeout")
      expect(yield* stateOf(host, "example/logger")).toBe("stopping")             // parked, unavailable to new consumers
      const fresh = yield* Effect.exit(host.use(Logger, (l) => l.log("new")))
      expect(Exit.isFailure(fresh) && JSON.stringify(fresh.cause)).toContain("ServiceUnavailable")
      yield* drive(host, host.remove("example/logger", { drain: 20, force: true }))
      const callExit = yield* Fiber.await(call)
      expect(Exit.isFailure(callExit) && JSON.stringify(callExit.cause)).toContain("LeaseRevoked")
      expect(yield* stateOf(host, "example/logger")).toBe("uninstalled")
    }))
  })

  it("check 3 / BEH-BR-088: a callback that removes its own provider fails at once with WouldDeadlock", async () => {
    await withHost((host) => Effect.gen(function* () {
      yield* host.install(loggerPlugin(journal())); yield* host.install(auditPlugin(journal())); yield* idle(host)
      const own = yield* Effect.exit(host.use(Logger, () => host.remove("example/logger")))
      expect(Exit.isFailure(own) && JSON.stringify(own.cause)).toContain("WouldDeadlock")
      // Removing a provider of the leased plugin's dependents is also a self-wait.
      const viaDependent = yield* Effect.exit(host.use(Audit, () => host.remove("example/logger")))
      expect(Exit.isFailure(viaDependent) && JSON.stringify(viaDependent.cause)).toContain("WouldDeadlock")
      const ownIdle = yield* Effect.exit(host.use(Logger, () => host.awaitIdle))
      expect(Exit.isFailure(ownIdle) && JSON.stringify(ownIdle.cause)).toContain("WouldDeadlock")
      expect(yield* stateOf(host, "example/logger")).toBe("active")
    }))
  })

  it("check 12 / BEH-BR-084: interrupting the caller interrupts the child and runs its finalizers before the lease is released", async () => {
    await withHost((host) => Effect.gen(function* () {
      const j = journal()
      yield* host.install(loggerPlugin(j)); yield* idle(host)
      const entered = yield* Deferred.make<void>()
      const call = yield* Effect.forkChild(host.use(Logger, () =>
        Effect.acquireRelease(Effect.void, () => j.push("callback-finalizer")).pipe(
          Effect.andThen(Deferred.succeed(entered, undefined)), Effect.andThen(Effect.never), Effect.scoped)))
      yield* Deferred.await(entered)
      // Start a removal that must wait for the lease, then interrupt the caller.
      const removal = yield* Effect.forkChild(host.remove("example/logger", { drain: 1_000 }))
      expect(yield* host.stepPlugin("example/logger")).toBe(true)                // the stop begins and drains
      j.lines.length = 0
      yield* Fiber.interrupt(call)
      yield* Fiber.join(removal)
      expect(j.lines).toEqual(["callback-finalizer", "logger:close"])           // child cleanup before the provider closes
    }))
  })

  it("BEH-BR-087: a per-call timeout interrupts the callback and fails with LeaseTimeout", async () => {
    await withHost((host) => Effect.gen(function* () {
      yield* host.install(loggerPlugin(journal())); yield* idle(host)
      const r = yield* Effect.exit(host.use(Logger, () => Effect.never, { timeout: 10 }))
      expect(Exit.isFailure(r) && JSON.stringify(r.cause)).toContain("LeaseTimeout")
      yield* drive(host, host.remove("example/logger", { drain: 10 }))                        // the timed-out lease was released
    }))
  })

  it("check 18 / BEH-BR-082, 083: useAll is all-or-nothing and goes through the same drain path", async () => {
    await withHost((host) => Effect.gen(function* () {
      yield* host.install(loggerPlugin(journal())); yield* idle(host)
      const missing = yield* Effect.exit(host.useAll([Logger, Audit] as const, () => Effect.void))
      expect(Exit.isFailure(missing) && JSON.stringify(missing.cause)).toContain("ServiceUnavailable")
      yield* drive(host, host.remove("example/logger", { drain: 10 }))                        // nothing was left leased
      yield* host.install(loggerPlugin(journal())); yield* host.install(auditPlugin(journal())); yield* idle(host)
      const entered = yield* Deferred.make<void>()
      yield* Effect.forkChild(host.useAll([Audit, Logger] as const, () => Deferred.succeed(entered, undefined).pipe(Effect.andThen(Effect.never))))
      yield* Deferred.await(entered)
      const blocked = yield* Effect.exit(drive(host, host.remove("example/logger", { drain: 10 })))
      expect(Exit.isFailure(blocked) && JSON.stringify(blocked.cause)).toContain("DrainTimeout")
    }))
  })
})

describe("legality (BEH-BR-071)", () => {
  // Expected table, transcribed from references/core/behaviors/08-operation-legality.md (BEH-BR-071) and BRIEF §7.3.
  const expected: Record<string, Record<string, string>> = {
    unknown:          { install: "proceed", remove: "unknown-plugin", replace: "unknown-plugin", retry: "unknown-plugin", reconfigure: "unknown-plugin", restart: "unknown-plugin", disable: "unknown-plugin", enable: "unknown-plugin" },
    waiting:          { install: "duplicate-plugin", remove: "proceed", replace: "proceed", retry: "noop", reconfigure: "proceed", restart: "noop", disable: "proceed", enable: "noop" },
    starting:         { install: "duplicate-plugin", remove: "proceed", replace: "proceed", retry: "noop", reconfigure: "proceed", restart: "proceed", disable: "proceed", enable: "noop" },
    active:           { install: "duplicate-plugin", remove: "proceed", replace: "proceed", retry: "noop", reconfigure: "proceed", restart: "proceed", disable: "proceed", enable: "noop" },
    failed:           { install: "duplicate-plugin", remove: "proceed", replace: "proceed", retry: "proceed", reconfigure: "proceed", restart: "proceed", disable: "proceed", enable: "noop" },
    "failed-cleanup": { install: "duplicate-plugin", remove: "proceed", replace: "conflict:cleanup-failure", retry: "conflict:cleanup-failure", reconfigure: "conflict:cleanup-failure", restart: "conflict:cleanup-failure", disable: "conflict:cleanup-failure", enable: "conflict:cleanup-failure" },
    disabled:         { install: "duplicate-plugin", remove: "proceed", replace: "proceed", retry: "conflict:disabled", reconfigure: "proceed", restart: "conflict:disabled", disable: "noop", enable: "proceed" },
  }
  it("check 4: the table is total and matches the specification for every settled row", () => {
    for (const row of ROWS) for (const op of OPS) {
      const out = legality(row, op)
      const got = out.kind === "conflict" ? `conflict:${out.pending}` : out.kind
      if (row === "stopping") { expect(op === "install" ? got === "duplicate-plugin" : got === "proceed" || got.startsWith("conflict")).toBe(true); continue }
      expect(`${row}/${op}=${got}`).toBe(`${row}/${op}=${expected[row]![op]}`)
    }
  })

  it("no-op cells succeed and change nothing (live host)", async () => {
    await withHost((host) => Effect.gen(function* () {
      yield* host.install(loggerPlugin(journal())); yield* idle(host)
      const rev = (yield* host.snapshot).revision
      yield* drive(host, host.retry("example/logger")); yield* drive(host, host.enable("example/logger"))
      expect((yield* host.snapshot).revision).toBe(rev)
      yield* drive(host, host.disable("example/logger"))
      const r = yield* Effect.exit(drive(host, host.restart("example/logger")))
      expect(Exit.isFailure(r) && JSON.stringify(r.cause)).toContain("disabled")
    }))
  })

  // Check 4 (BEH-BR-183): every cell of the table, live. Each row is reached on a TestHost, then the
  // operation is called once and classified from its exit and its audit record (BEH-BR-071, 076).
  class Missing extends Context.Service<Missing, {}>()("x/Missing") {}
  class Subject extends Context.Service<Subject, {}>()("x/Subject") {}
  const subject = (waits: boolean) => define({
    id: "x/subject", requires: (waits ? [Missing] : []) as unknown as readonly [], provides: [Subject] as const,
    config: Schema.Struct({ n: Schema.Number }), build: Layer.succeed(Subject, {})
  })
  const ctx = (c: string) => ({ context: { actor: { id: "user-alice", kind: "user" as const }, correlationId: c } })
  const rows = ["unknown", "waiting", "starting", "active", "failed", "failed-cleanup", "disabled"] as const
  for (const row of rows) for (const op of OPS) {
    const want = expected[row]![op]!
    it(`live: ${op} on ${row} → ${want}`, async () => {
      const sink = memorySink()
      await withHost((host) => Effect.gen(function* () {
        const def = subject(row === "waiting")
        if (row !== "unknown") yield* host.install(def, ctx("setup"))
        if (row === "active" || row === "disabled") yield* idle(host)
        if (row === "disabled") yield* drive(host, host.disable("x/subject", ctx("setup")))
        if (row === "failed" || row === "failed-cleanup") {
          const faults = yield* Scope.make()
          if (row === "failed") yield* host.inject(Testing.Fault.buildFails("x/subject")).pipe(Scope.provide(faults))
          yield* idle(host)
          if (row === "failed-cleanup") {
            yield* host.inject(Testing.Fault.stopFails("x/subject")).pipe(Scope.provide(faults))
            yield* Effect.exit(drive(host, host.restart("x/subject", ctx("setup"))))
          }
          yield* Scope.close(faults, Exit.void)                                       // the row stays; the fault ends
        }
        const snap = (yield* host.snapshot).plugins.find((p) => p.id === "x/subject")
        expect(row === "failed-cleanup" ? snap?.state === "failed" && snap.failure.phase : snap?.state ?? "unknown")
          .toBe(row === "failed-cleanup" ? "cleanup" : row)
        const call: Record<Op, Effect.Effect<unknown, unknown>> = {
          install: host.install(subject(false), ctx("cell")), remove: host.remove("x/subject", ctx("cell")),
          replace: host.replace(subject(false), ctx("cell")), retry: host.retry("x/subject", ctx("cell")),
          reconfigure: host.reconfigure("x/subject", { n: 1 }, ctx("cell")), restart: host.restart("x/subject", ctx("cell")),
          disable: host.disable("x/subject", ctx("cell")), enable: host.enable("x/subject", ctx("cell"))
        }
        const exit = yield* Effect.exit(drive(host, call[op]))
        yield* idle(host)
        yield* Effect.sleep(20)                                                       // let the writer drain
        const cause = Exit.isFailure(exit) ? JSON.stringify(exit.cause) : ""
        const terminal = sink.records.find((r) => r.correlationId === "cell" && r.phase !== "requested")
        switch (want) {
          case "noop": expect(Exit.isSuccess(exit) && terminal?.phase === "completed" && terminal.noop === true).toBe(true); break
          case "proceed":
            expect(cause).not.toMatch(/"_tag":"(Conflict|UnknownPlugin|DuplicatePlugin)"/)
            expect(terminal !== undefined && terminal.noop !== true).toBe(true)      // admitted, and not a no-op
            break
          case "unknown-plugin": expect(cause).toContain(`"_tag":"UnknownPlugin"`); break
          case "duplicate-plugin": expect(cause).toContain(`"_tag":"DuplicatePlugin"`); break
          default: expect(cause).toContain(`"pending":"${want.slice("conflict:".length)}"`)
        }
      }), { config: () => Effect.succeed({ n: 0 }) }, sink.layer)
    })
  }
})
