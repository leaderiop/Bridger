// Scenarios for behaviour 09 (leases) and behaviour 08 (legality table).
import { Deferred, Effect, Exit, Fiber } from "effect"
import { describe, expect, it } from "vitest"
import { legality, OPS, ROWS } from "../src/legality.js"
import { Audit, Logger, auditPlugin, journal, loggerPlugin, stateOf, withHost } from "./fixtures.js"

describe("leases", () => {
  it("check 2 / BEH-BR-085, 086: removal waits for a lease, fails with DrainTimeout, succeeds with force", async () => {
    await withHost((host) => Effect.gen(function* () {
      const j = journal()
      yield* host.install(loggerPlugin(j)); yield* host.awaitIdle
      const entered = yield* Deferred.make<void>()
      const call = yield* Effect.forkChild(host.use(Logger, (l) => Deferred.succeed(entered, undefined).pipe(Effect.andThen(l.log("held")), Effect.andThen(Effect.never))))
      yield* Deferred.await(entered)
      const timedOut = yield* Effect.exit(host.remove("example/logger", { drain: 20 }))
      expect(Exit.isFailure(timedOut) && JSON.stringify(timedOut.cause)).toContain("DrainTimeout")
      expect(yield* stateOf(host, "example/logger")).toBe("stopping")             // parked, unavailable to new consumers
      const fresh = yield* Effect.exit(host.use(Logger, (l) => l.log("new")))
      expect(Exit.isFailure(fresh) && JSON.stringify(fresh.cause)).toContain("ServiceUnavailable")
      yield* host.remove("example/logger", { drain: 20, force: true })
      const callExit = yield* Fiber.await(call)
      expect(Exit.isFailure(callExit) && JSON.stringify(callExit.cause)).toContain("LeaseRevoked")
      expect(yield* stateOf(host, "example/logger")).toBe("uninstalled")
    }))
  })

  it("check 3 / BEH-BR-088: a callback that removes its own provider fails at once with WouldDeadlock", async () => {
    await withHost((host) => Effect.gen(function* () {
      yield* host.install(loggerPlugin(journal())); yield* host.install(auditPlugin(journal())); yield* host.awaitIdle
      const own = yield* Effect.exit(host.use(Logger, () => host.remove("example/logger")))
      expect(Exit.isFailure(own) && JSON.stringify(own.cause)).toContain("WouldDeadlock")
      // Removing a provider of the leased plugin's dependents is also a self-wait.
      const viaDependent = yield* Effect.exit(host.use(Audit, () => host.remove("example/logger")))
      expect(Exit.isFailure(viaDependent) && JSON.stringify(viaDependent.cause)).toContain("WouldDeadlock")
      const idle = yield* Effect.exit(host.use(Logger, () => host.awaitIdle))
      expect(Exit.isFailure(idle) && JSON.stringify(idle.cause)).toContain("WouldDeadlock")
      expect(yield* stateOf(host, "example/logger")).toBe("active")
    }))
  })

  it("check 12 / BEH-BR-084: interrupting the caller interrupts the child and runs its finalizers before the lease is released", async () => {
    await withHost((host) => Effect.gen(function* () {
      const j = journal()
      yield* host.install(loggerPlugin(j)); yield* host.awaitIdle
      const entered = yield* Deferred.make<void>()
      const call = yield* Effect.forkChild(host.use(Logger, () =>
        Effect.acquireRelease(Effect.void, () => j.push("callback-finalizer")).pipe(
          Effect.andThen(Deferred.succeed(entered, undefined)), Effect.andThen(Effect.never), Effect.scoped)))
      yield* Deferred.await(entered)
      // Start a removal that must wait for the lease, then interrupt the caller.
      const removal = yield* Effect.forkChild(host.remove("example/logger", { drain: 1_000 }))
      yield* Effect.sleep(5)
      j.lines.length = 0
      yield* Fiber.interrupt(call)
      yield* Fiber.join(removal)
      expect(j.lines).toEqual(["callback-finalizer", "logger:close"])           // child cleanup before the provider closes
    }))
  })

  it("BEH-BR-087: a per-call timeout interrupts the callback and fails with LeaseTimeout", async () => {
    await withHost((host) => Effect.gen(function* () {
      yield* host.install(loggerPlugin(journal())); yield* host.awaitIdle
      const r = yield* Effect.exit(host.use(Logger, () => Effect.never, { timeout: 10 }))
      expect(Exit.isFailure(r) && JSON.stringify(r.cause)).toContain("LeaseTimeout")
      yield* host.remove("example/logger", { drain: 10 })                        // the timed-out lease was released
    }))
  })

  it("check 18 / BEH-BR-082, 083: useAll is all-or-nothing and goes through the same drain path", async () => {
    await withHost((host) => Effect.gen(function* () {
      yield* host.install(loggerPlugin(journal())); yield* host.awaitIdle
      const missing = yield* Effect.exit(host.useAll([Logger, Audit] as const, () => Effect.void))
      expect(Exit.isFailure(missing) && JSON.stringify(missing.cause)).toContain("ServiceUnavailable")
      yield* host.remove("example/logger", { drain: 10 })                        // nothing was left leased
      yield* host.install(loggerPlugin(journal())); yield* host.install(auditPlugin(journal())); yield* host.awaitIdle
      const entered = yield* Deferred.make<void>()
      yield* Effect.forkChild(host.useAll([Audit, Logger] as const, () => Deferred.succeed(entered, undefined).pipe(Effect.andThen(Effect.never))))
      yield* Deferred.await(entered)
      const blocked = yield* Effect.exit(host.remove("example/logger", { drain: 10 }))
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
      yield* host.install(loggerPlugin(journal())); yield* host.awaitIdle
      const rev = (yield* host.snapshot).revision
      yield* host.retry("example/logger"); yield* host.enable("example/logger")
      expect((yield* host.snapshot).revision).toBe(rev)
      yield* host.disable("example/logger")
      const r = yield* Effect.exit(host.restart("example/logger"))
      expect(Exit.isFailure(r) && JSON.stringify(r.cause)).toContain("disabled")
    }))
  })
})
