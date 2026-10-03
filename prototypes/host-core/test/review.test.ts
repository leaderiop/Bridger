// Scenarios for the CCR-BR-008 resolutions, acceptance checks 45–48 of BEH-BR-184 (the parts this prototype reaches).
import { Context, Deferred, Effect, Exit, Fiber, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { AuditRecord } from "../src/gxp.js"
import type * as Host from "../src/host.js"
import { define } from "../src/plugin.js"
import type * as Testing from "../src/testing.js"
import { Audit, Logger, auditPlugin, drive, idle, journal, loggerPlugin, memorySink, scriptedGate, stateOf, withHost } from "./fixtures.js"

const failedWith = (exit: Exit.Exit<unknown, unknown> | undefined, text: string) => !!exit && Exit.isFailure(exit) && JSON.stringify(exit.cause).includes(text)
const ctx = (c: string) => ({ context: { actor: { id: "user-alice", kind: "user" as const }, correlationId: c } })
const phases = (records: ReadonlyArray<AuditRecord>, c: string) => records.filter((r) => r.correlationId === c).map((r) => r.phase)

/** A TestHost with the in-memory sink (and optionally a gate); the body gets the host and the records. */
const run = <A, E>(body: (host: Testing.TestHost, records: ReadonlyArray<AuditRecord>) => Effect.Effect<A, E>, gate?: ReturnType<typeof scriptedGate>) => {
  const sink = memorySink()
  return withHost((host) => body(host, sink.records), {}, gate ? Layer.merge(sink.layer, gate.layer) : sink.layer)
}
/** Holds a lease on `key` until the returned `release` is completed (or forever). */
const hold = (host: Host.Host, key: typeof Logger | typeof Audit) => Effect.gen(function* () {
  const entered = yield* Deferred.make<void>()
  const release = yield* Deferred.make<void>()
  const fiber = yield* Effect.forkChild(host.use(key as typeof Logger, () => Deferred.succeed(entered, undefined).pipe(Effect.andThen(Deferred.await(release)))))
  yield* Deferred.await(entered)
  return { release: Deferred.succeed(release, undefined), fiber }
})
const parkedOf = (host: Host.Host, id: string) => Effect.map(host.snapshot, (s) => {
  const p = s.plugins.find((x) => x.id === id)
  return p?.state === "stopping" ? { reason: p.reason, parked: p.parked } : p?.state
})

describe("CCR-BR-008: parked operations (check 47)", () => {
  it("R2, T2: a call that joins a parked operation resumes and owns it; the parked call's record is final", async () => {
    await run((host, records) => Effect.gen(function* () {
      yield* host.install(loggerPlugin(journal())); yield* idle(host)
      yield* hold(host, Logger)
      expect(failedWith(yield* Effect.exit(drive(host, host.remove("example/logger", { drain: 20, ...ctx("c-park") }))), "DrainTimeout")).toBe(true)
      expect(yield* parkedOf(host, "example/logger")).toEqual({ reason: "remove", parked: true })
      yield* drive(host, host.remove("example/logger", { drain: 20, force: true, ...ctx("c-resume") }))      // joins → resumes
      yield* Effect.sleep(20)
      expect(phases(records, "c-park")).toEqual(["requested", "failed"])                        // nothing more for the parked call
      expect(phases(records, "c-resume")).toEqual(["requested", "completed"])                   // its own record, not `joined`
      const parkReq = records.find((r) => r.correlationId === "c-park" && r.phase === "requested")!
      expect(records.find((r) => r.correlationId === "c-resume" && r.phase === "completed")!.resumes).toBe(parkReq.recordId)   // T2
      expect(records.some((r) => r.phase === "joined")).toBe(false)
    }))
  })

  it("R8, R10: retry and enable conflict with a parked system stop; a stopping operation resumes and owns it", async () => {
    await run((host) => Effect.gen(function* () {
      yield* host.install(loggerPlugin(journal())); yield* host.install(auditPlugin(journal())); yield* idle(host)
      const h = yield* hold(host, Audit)
      const r = yield* Effect.exit(drive(host, host.remove("example/logger", { drain: 20 })))
      expect(failedWith(r, `"id":"example/audit"`) && failedWith(r, `"target":"example/logger"`)).toBe(true)   // R12 fields
      expect(yield* parkedOf(host, "example/audit")).toEqual({ reason: "dependency-loss", parked: true })
      expect(failedWith(yield* Effect.exit(drive(host, host.retry("example/audit"))), `"pending":"dependency-loss"`)).toBe(true)
      expect(failedWith(yield* Effect.exit(drive(host, host.enable("example/audit"))), `"pending":"dependency-loss"`)).toBe(true)
      yield* drive(host, host.restart("example/audit", { drain: 20, force: true }))                                    // resumes the system stop
      expect(failedWith(yield* Fiber.await(h.fiber), "LeaseRevoked")).toBe(true)
      yield* idle(host)
      expect(yield* stateOf(host, "example/audit")).toBe("waiting")                              // its provider is still hidden
      expect(yield* parkedOf(host, "example/logger")).toEqual({ reason: "remove", parked: true })   // the provider's removal stays parked
    }))
  })

  it("R9, V, T1: a cascade that resumes a parked operation ends its intent; on re-expiry it is a parked system stop; endsIntentOf links the trail", async () => {
    await run((host, records) => Effect.gen(function* () {
      yield* host.install(loggerPlugin(journal())); yield* host.install(auditPlugin(journal())); yield* idle(host)
      yield* hold(host, Audit)
      expect(failedWith(yield* Effect.exit(drive(host, host.remove("example/audit", { drain: 20, ...ctx("c-parked-remove") }))), "DrainTimeout")).toBe(true)
      expect(yield* parkedOf(host, "example/audit")).toEqual({ reason: "remove", parked: true })
      expect(failedWith(yield* Effect.exit(drive(host, host.remove("example/logger", { drain: 20 }))), `"id":"example/audit"`)).toBe(true)
      // The parked remove's intent has ended: the dependent's stop is now a parked system stop.
      expect(yield* parkedOf(host, "example/audit")).toEqual({ reason: "dependency-loss", parked: true })
      expect(failedWith(yield* Effect.exit(drive(host, host.retry("example/audit"))), `"pending":"dependency-loss"`)).toBe(true)
      yield* drive(host, host.remove("example/logger", { drain: 20, force: true, ...ctx("c-force") }))
      expect(yield* stateOf(host, "example/audit")).toBe("waiting")                              // ended, not completed
      yield* Effect.sleep(20)
      const parkedReq = records.find((r) => r.correlationId === "c-parked-remove" && r.phase === "requested")!
      const ended = records.filter((r) => r.operation === "intent-ended" && r.target?.id === "example/audit")
      expect(ended).toHaveLength(1)                                                  // written when the intent ended (T1)
      expect(ended[0]!.endsIntentOf).toBe(parkedReq.recordId)
      expect(records.filter((r) => r.operation === "system-stop" && r.target?.id === "example/audit").every((r) => r.endsIntentOf === undefined)).toBe(true)
      expect(phases(records, "c-parked-remove")).toEqual(["requested", "failed"])
    }))
  })
})

describe("CCR-BR-008: re-entrancy and the cascade's drain limit (check 48)", () => {
  it("R11: a build and a finalizer that call back into the host fail with WouldDeadlock instead of hanging", async () => {
    const seen: Record<string, Exit.Exit<unknown, unknown>> = {}
    const hostRef: { current?: Host.Host } = {}
    class Self extends Context.Service<Self, {}>()("x/Self") {}
    const selfPlugin = define({
      id: "x/self", requires: [Logger] as const, provides: [Self] as const,
      build: Layer.effect(Self, Effect.gen(function* () {
        if (!seen.build) seen.build = yield* Effect.exit(hostRef.current!.restart("x/self"))            // its own transition
        yield* Effect.addFinalizer(() => Effect.exit(hostRef.current!.remove("example/logger")).pipe(  // its provider
          Effect.tap((x) => Effect.sync(() => { seen.finalizer = x }))))
        return {}
      }))
    })
    await run((host) => Effect.gen(function* () {
      hostRef.current = host
      yield* host.install(loggerPlugin(journal())); yield* host.install(selfPlugin); yield* idle(host)
      expect(failedWith(seen.build, "WouldDeadlock")).toBe(true)
      expect(yield* stateOf(host, "x/self")).toBe("active")
      yield* drive(host, host.restart("x/self")).pipe(Effect.timeoutOrElse({ duration: 1_000, orElse: () => Effect.die("hung") }))
      expect(failedWith(seen.finalizer, "WouldDeadlock")).toBe(true)
    }))
  })

  it("R12: a cascade's own drain limit runs while it waits for another call's drain: \"forever\" step", async () => {
    await run((host) => Effect.gen(function* () {
      yield* host.install(loggerPlugin(journal())); yield* host.install(auditPlugin(journal())); yield* idle(host)
      const h = yield* hold(host, Audit)
      const restart = yield* Effect.forkChild(host.restart("example/audit", { drain: "forever" }))
      yield* host.stepPlugin("example/audit")
      const r = yield* Effect.exit(drive(host, host.remove("example/logger", { drain: 20 })).pipe(
        Effect.timeoutOrElse({ duration: 1_000, orElse: () => Effect.die("cascade waited without bound") })))
      expect(failedWith(r, "DrainTimeout") && failedWith(r, `"id":"example/audit"`) && failedWith(r, `"target":"example/logger"`)).toBe(true)
      expect(yield* parkedOf(host, "example/logger")).toEqual({ reason: "remove", parked: true })
      yield* h.release
      expect(Exit.isSuccess(yield* drive(host, Fiber.await(restart)))).toBe(true)                            // the other call was not overruled
      yield* idle(host)
      expect(yield* stateOf(host, "example/audit")).toBe("waiting")                              // its rebuild could not capture the hidden provider
    }))
  })
})

describe("CCR-BR-008: interruption at the gate (check 46)", () => {
  it("R1: a caller interrupted while the gate decides leaves one rejected (caller-interrupted) record and no requested record", async () => {
    const gate = scriptedGate(() => "hang")
    await run((host, records) => Effect.gen(function* () {
      const call = yield* Effect.forkChild(host.install(loggerPlugin(journal()), ctx("c-gate")))
      yield* Effect.sleep(10)
      yield* Fiber.interrupt(call)
      yield* Effect.sleep(20)
      const mine = records.filter((r) => r.correlationId === "c-gate")
      expect(mine.map((r) => r.phase)).toEqual(["rejected"])
      expect(mine[0]!.error?.message).toBe("caller-interrupted")
      expect(yield* stateOf(host, "example/logger")).toBe("uninstalled")
    }), gate)
  })
})
