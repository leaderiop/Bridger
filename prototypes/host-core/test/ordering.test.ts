// Scenarios for cross-plugin stop ordering (ADR-BR-038; BEH-BR-078–080), acceptance checks 43–45 of BEH-BR-184.
import { Context, Deferred, Effect, Exit, Fiber, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { define } from "../src/plugin.js"
import { Audit, auditPlugin, drive, idle, journal, loggerPlugin, memorySink, stateOf, withHost } from "./fixtures.js"

class Clock2 extends Context.Service<Clock2, { readonly now: Effect.Effect<number> }>()("example/Clock") {}
const clockPlugin = define({ id: "example/clock", requires: [] as const, provides: [Clock2] as const, build: Layer.succeed(Clock2, { now: Effect.succeed(0) }) })

/** Fails with "blocked" when `e` does not settle within `ms` — the regression the host-wide lock showed. */
const within = <A, E>(ms: number, e: Effect.Effect<A, E>) =>
  Effect.exit(e.pipe(Effect.timeoutOrElse({ duration: ms, orElse: () => Effect.fail("blocked" as const) })))
const failedWith = (exit: Exit.Exit<unknown, unknown>, tag: string) => Exit.isFailure(exit) && JSON.stringify(exit.cause).includes(tag)

describe("cross-plugin stop ordering (ADR-BR-038)", () => {
  it("check 43 / BEH-BR-078, 088: a lease holder's calls never wait on the drain its lease blocks", async () => {
    await withHost((host) => Effect.gen(function* () {
      yield* host.install(loggerPlugin(journal())); yield* host.install(auditPlugin(journal())); yield* idle(host)
      const entered = yield* Deferred.make<void>()
      const go = yield* Deferred.make<void>()
      const holder = yield* Effect.forkChild(host.use(Audit, () => Effect.gen(function* () {
        yield* Deferred.succeed(entered, undefined)
        yield* Deferred.await(go)                                                  // the removal is now waiting on this lease
        const unrelated = yield* within(1_000, host.install(clockPlugin))
        const own = yield* within(1_000, host.remove("example/audit"))
        const provider = yield* within(1_000, host.restart("example/logger"))
        return { unrelated, own, provider }
      })))
      yield* Deferred.await(entered)
      const removal = yield* Effect.forkChild(host.remove("example/logger", { drain: 2_000 }))
      yield* host.stepPlugin("example/logger")
      expect(yield* stateOf(host, "example/logger")).toBe("stopping")             // hidden as the removal begins (BEH-BR-042)
      yield* host.stepPlugin("example/audit")                                     // the dependent's stop now drains the lease
      yield* Deferred.succeed(go, undefined)
      const r = yield* Fiber.join(holder)
      expect(Exit.isSuccess(r.unrelated)).toBe(true)                              // not ordered behind the drain
      expect(failedWith(r.own, "WouldDeadlock")).toBe(true)                       // fails at once, not after 2 s
      expect(failedWith(r.provider, "blocked")).toBe(false)                       // settles at once (Conflict on a stopping plugin)
      yield* drive(host, Fiber.join(removal))                                     // the lease ended with the callback
      yield* idle(host)
      expect(yield* stateOf(host, "example/clock")).toBe("active")
      expect(yield* stateOf(host, "example/audit")).toBe("waiting")
      expect(yield* stateOf(host, "example/logger")).toBe("uninstalled")
    }))
  })

  it("check 44 / BEH-BR-079: a removal that meets a dependent's restart waits for its step, not its operation", async () => {
    const j = journal()
    await withHost((host) => Effect.gen(function* () {
      yield* host.install(loggerPlugin(j)); yield* host.install(auditPlugin(j)); yield* idle(host)
      j.lines.length = 0
      const entered = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      yield* Effect.forkChild(host.use(Audit, () => Deferred.succeed(entered, undefined).pipe(Effect.andThen(Deferred.await(release)))))
      yield* Deferred.await(entered)
      const restart = yield* Effect.forkChild(host.restart("example/audit", { drain: 2_000 }))    // operator operation in flight on D
      yield* host.stepPlugin("example/audit")                                     // its stop step drains the lease
      const removal = yield* Effect.forkChild(host.remove("example/logger", { drain: 2_000 }))   // cascade into D
      yield* host.stepPlugin("example/logger")
      expect((yield* host.pending).map((p) => [p.kind, p.pluginId, p.waiter])).toEqual([["wait", "example/audit", "example/logger"]])
      expect(j.lines).toEqual([])                                                 // nothing closed while the lease is held
      yield* Deferred.succeed(release, undefined)
      yield* drive(host, Fiber.join(restart))                                     // completes for its own caller, not Superseded
      yield* drive(host, Fiber.join(removal))
      // The dependent's scope closed once, before its provider's; its rebuild did not capture the hidden provider.
      expect(j.lines).toEqual(["log:audit-finalizer", "audit:close", "logger:close"])
      const audit = (yield* host.snapshot).plugins.find((p) => p.id === "example/audit")!
      expect(audit.state === "waiting" && audit.missingServiceIds).toEqual(["example/Logger"])
    }))
  })

  it("check 45 / BEH-BR-080: a removal resumes a dependent's parked stop and ends the parked intent", async () => {
    const sink = memorySink()
    await withHost((host) => Effect.gen(function* () {
      yield* host.install(loggerPlugin(journal())); yield* host.install(auditPlugin(journal())); yield* idle(host)
      const entered = yield* Deferred.make<void>()
      const holder = yield* Effect.forkChild(host.use(Audit, () => Deferred.succeed(entered, undefined).pipe(Effect.andThen(Effect.never))))
      yield* Deferred.await(entered)
      // The dependent's own removal parks (BEH-BR-074).
      const parked = yield* Effect.exit(drive(host, host.remove("example/audit", { drain: 20 })))
      expect(failedWith(parked, "DrainTimeout")).toBe(true)
      expect(yield* stateOf(host, "example/audit")).toBe("stopping")
      // The provider's removal resumes it under its own options; without force it parks again, naming the dependent.
      const again = yield* Effect.exit(drive(host, host.remove("example/logger", { drain: 20 })))
      expect(failedWith(again, `"id":"example/audit"`)).toBe(true)
      expect(yield* stateOf(host, "example/logger")).toBe("stopping")
      // With force: revoked, the dependent lands in waiting — its parked remove is ended, not completed.
      yield* drive(host, host.remove("example/logger", { drain: 20, force: true }))
      expect(failedWith(yield* Fiber.await(holder), "LeaseRevoked")).toBe(true)
      expect(yield* stateOf(host, "example/audit")).toBe("waiting")
      expect(yield* stateOf(host, "example/logger")).toBe("uninstalled")
      yield* Effect.sleep(20)                                                     // let the writer drain
      const records = sink.records
      const forcedCall = records.filter((r) => r.operation === "remove" && r.target?.id === "example/logger" && r.phase === "requested").at(-1)!
      const stop = records.filter((r) => r.operation === "system-stop" && r.target?.id === "example/audit").at(-1)!
      expect(stop.causationId).toBe(forcedCall.recordId)
      expect(stop.after?.state).toBe("waiting")
    }), {}, sink.layer)
  })
})
