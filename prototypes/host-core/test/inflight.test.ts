// Scenarios for the in-flight operation table (BEH-BR-069, 072, 074) and caller interruption (BEH-BR-067),
// acceptance check 4 of BEH-BR-183 (in-flight half), with the audit links of BEH-BR-200.
import { Context, Deferred, Effect, Exit, Fiber, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { AuditSink, type AuditRecord } from "../src/gxp.js"
import * as Host from "../src/host.js"
import { FLIGHT_OPS, OPS, inFlight, type FlightOp, type Op } from "../src/legality.js"
import { define } from "../src/plugin.js"
import { Audit, Logger, auditPlugin, journal, loggerPlugin, stateOf, withHost, quickClose } from "./fixtures.js"

class Clock2 extends Context.Service<Clock2, { readonly now: Effect.Effect<number> }>()("example/Clock") {}
const clockPlugin = define({ id: "example/clock", requires: [] as const, provides: [Clock2] as const, build: Layer.succeed(Clock2, { now: Effect.succeed(0) }) })

const failedWith = (exit: Exit.Exit<unknown, unknown> | undefined, tag: string) => !!exit && Exit.isFailure(exit) && JSON.stringify(exit.cause).includes(tag)
/** The fiber's exit if it has settled within `ms`, else undefined. */
const settledWithin = <A, E>(f: Fiber.Fiber<A, E>, ms = 20) =>
  Fiber.await(f).pipe(Effect.timeoutOrElse({ duration: ms, orElse: () => Effect.succeed(undefined) }))

// BEH-BR-072 transcribed from references/core/behaviors/08-operation-legality.md, without the reconfigure row and column.
const expected: Record<FlightOp, Record<Op, string>> = {
  remove:      { install: "duplicate-plugin", remove: "join",      replace: "conflict",  retry: "conflict", reconfigure: "conflict",      restart: "conflict",  disable: "conflict",  enable: "conflict" },
  replace:     { install: "duplicate-plugin", remove: "supersede", replace: "supersede", retry: "conflict", reconfigure: "conflict",      restart: "conflict",  disable: "conflict",  enable: "conflict" },
  reconfigure: { install: "duplicate-plugin", remove: "supersede", replace: "supersede", retry: "conflict", reconfigure: "join-if-equal", restart: "join",    disable: "supersede", enable: "conflict" },
  restart:     { install: "duplicate-plugin", remove: "supersede", replace: "supersede", retry: "conflict", reconfigure: "join",          restart: "join",      disable: "supersede", enable: "conflict" },
  disable:     { install: "duplicate-plugin", remove: "supersede", replace: "conflict",  retry: "conflict", reconfigure: "conflict",      restart: "conflict",  disable: "join",      enable: "conflict" },
}
/** Where a winning operation lands once the lease is released. */
const landing = (op: Op): { state: string; version?: string } =>
  op === "remove" ? { state: "uninstalled" } : op === "replace" ? { state: "active" } : op === "disable" ? { state: "disabled" } : { state: "active" }

describe("in-flight table (BEH-BR-072)", () => {
  it("the table is total and matches the specification", () => {
    for (const f of FLIGHT_OPS) for (const op of OPS) expect(`${f}/${op}=${inFlight(f, op).kind}`).toBe(`${f}/${op}=${expected[f][op]}`)
    expect(inFlight("restart", "retry")).toEqual({ kind: "conflict", pending: "restart" })
  })

  // reconfigure cells need a plugin with configuration: covered in test/p2.test.ts.
  for (const f of FLIGHT_OPS.filter((x) => x !== "reconfigure")) for (const op of OPS.filter((x) => x !== "reconfigure")) {
    const outcome = expected[f][op]
    it(`live: ${op} while ${f} is in flight → ${outcome}`, async () => {
      const j = journal()
      await withHost((host) => Effect.gen(function* () {
        yield* host.install(loggerPlugin(j, { version: "1" })); yield* host.awaitIdle
        const entered = yield* Deferred.make<void>()
        const release = yield* Deferred.make<void>()
        yield* Effect.forkChild(host.use(Logger, () => Deferred.succeed(entered, undefined).pipe(Effect.andThen(Deferred.await(release)))))
        yield* Deferred.await(entered)
        const run = (o: Op, version: string): Effect.Effect<unknown, unknown> => {
          switch (o) {
            case "install": return host.install(loggerPlugin(j, { version }))
            case "remove": return host.remove("example/logger", { drain: 2_000 })
            case "replace": return host.replace(loggerPlugin(j, { version }), { drain: 2_000 })
            case "retry": return host.retry("example/logger")
            case "restart": return host.restart("example/logger", { drain: 2_000 })
            case "disable": return host.disable("example/logger", { drain: 2_000 })
            case "enable": return host.enable("example/logger")
            default: return Effect.die(`unexpected ${o}`)
          }
        }
        const first = yield* Effect.forkChild(run(f, "2"))
        yield* Effect.sleep(10)
        expect(yield* stateOf(host, "example/logger")).toBe("stopping")
        const second = yield* Effect.forkChild(run(op, "3"))
        const early = yield* settledWithin(second)
        const firstEarly = yield* settledWithin(first, 1)
        switch (outcome) {
          case "duplicate-plugin": expect(failedWith(early, "DuplicatePlugin")).toBe(true); break
          case "conflict": expect(failedWith(early, `"pending":"${f}"`)).toBe(true); break
          case "join": expect(early).toBeUndefined(); expect(firstEarly).toBeUndefined(); break
          case "supersede": expect(early).toBeUndefined(); expect(failedWith(firstEarly, "Superseded")).toBe(true); break
        }
        yield* Deferred.succeed(release, undefined)
        const firstExit = yield* Fiber.await(first)
        const secondExit = yield* Fiber.await(second)
        yield* host.awaitIdle
        const winner = outcome === "join" || outcome === "supersede" ? op : f
        if (outcome === "join") { expect(Exit.isSuccess(firstExit)).toBe(true); expect(Exit.isSuccess(secondExit)).toBe(true) }
        if (outcome === "supersede") expect(Exit.isSuccess(secondExit)).toBe(true)
        if (outcome === "conflict" || outcome === "duplicate-plugin") expect(Exit.isSuccess(firstExit)).toBe(true)
        expect(yield* stateOf(host, "example/logger")).toBe(landing(winner).state)
        if (winner === "replace") {
          const p = (yield* host.snapshot).plugins.find((x) => x.id === "example/logger")!
          expect(p.meta?.version).toBe(outcome === "supersede" ? "3" : "2")             // a superseding replace's definition is the target
        }
        // One close of the old activation, whatever the outcome: no transition interleaved with another.
        expect(j.lines.filter((l) => l === "logger:close")).toHaveLength(1)
      }))
    })
  }
})

describe("intent and parking (BEH-BR-067, 074)", () => {
  it("BEH-BR-067: interrupting the caller does not cancel the transition", async () => {
    await withHost((host) => Effect.gen(function* () {
      yield* host.install(loggerPlugin(journal())); yield* host.awaitIdle
      const entered = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      yield* Effect.forkChild(host.use(Logger, () => Deferred.succeed(entered, undefined).pipe(Effect.andThen(Deferred.await(release)))))
      yield* Deferred.await(entered)
      const caller = yield* Effect.forkChild(host.remove("example/logger", { drain: 2_000 }))
      yield* Effect.sleep(10)
      yield* Fiber.interrupt(caller)                                              // a request timeout, a user cancelling
      yield* Deferred.succeed(release, undefined)
      yield* host.awaitIdle
      expect(yield* stateOf(host, "example/logger")).toBe("uninstalled")
    }))
  })

  it("BEH-BR-074: a call that supersedes a parked operation resumes it under its own options", async () => {
    await withHost((host) => Effect.gen(function* () {
      yield* host.install(loggerPlugin(journal())); yield* host.awaitIdle
      const entered = yield* Deferred.make<void>()
      const holder = yield* Effect.forkChild(host.use(Logger, () => Deferred.succeed(entered, undefined).pipe(Effect.andThen(Effect.never))))
      yield* Deferred.await(entered)
      expect(failedWith(yield* Effect.exit(host.restart("example/logger", { drain: 20 })), "DrainTimeout")).toBe(true)
      yield* host.awaitIdle                                                       // a parked operation is not running (BEH-BR-074)
      const enable = yield* Effect.exit(host.enable("example/logger"))
      expect(failedWith(enable, `"pending":"restart"`)).toBe(true)                // the parked restart is still in flight
      yield* host.remove("example/logger", { drain: 20, force: true })            // supersedes and resumes it
      expect(failedWith(yield* Fiber.await(holder), "LeaseRevoked")).toBe(true)
      expect(yield* stateOf(host, "example/logger")).toBe("uninstalled")
    }))
  })

  it("BEH-BR-072: a superseding replace that fails its definition checks fails alone", async () => {
    await withHost((host) => Effect.gen(function* () {
      yield* host.install(loggerPlugin(journal())); yield* host.install(clockPlugin); yield* host.awaitIdle
      const entered = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      yield* Effect.forkChild(host.use(Logger, () => Deferred.succeed(entered, undefined).pipe(Effect.andThen(Deferred.await(release)))))
      yield* Deferred.await(entered)
      const first = yield* Effect.forkChild(host.restart("example/logger", { drain: 2_000 }))
      yield* Effect.sleep(10)
      const bad = define({ id: "example/logger", requires: [] as const, provides: [Logger, Clock2] as const,
        build: Layer.mergeAll(Layer.succeed(Logger, { log: () => Effect.void }), Layer.succeed(Clock2, { now: Effect.succeed(1) })) })
      expect(failedWith(yield* Effect.exit(host.replace(bad)), "ReplaceError")).toBe(true)
      yield* Deferred.succeed(release, undefined)
      expect(Exit.isSuccess(yield* Fiber.await(first))).toBe(true)                // the restart in flight was unaffected
      yield* host.awaitIdle
      expect(yield* stateOf(host, "example/logger")).toBe("active")
    }))
  })
})

describe("interruption before intent (BEH-BR-067, 188)", () => {
  it("a caller interrupted while waiting for its turn changes nothing and ends with a failed (Interrupted) record", async () => {
    const records: Array<AuditRecord> = []
    const sink: AuditSink["Service"] = { record: (r) => Effect.sync(() => { records.push(r) }) }
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const host = yield* Host.make({ ...quickClose, auditTimeout: 50 }).pipe(Effect.provideService(AuditSink, sink))
      yield* host.install(loggerPlugin(journal())); yield* host.install(auditPlugin(journal())); yield* host.awaitIdle
      const entered = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      yield* Effect.forkChild(host.use(Audit, () => Deferred.succeed(entered, undefined).pipe(Effect.andThen(Deferred.await(release)))))
      yield* Deferred.await(entered)
      // The provider's removal runs a dependency-loss stop of the dependent, draining its lease.
      const removal = yield* Effect.forkChild(host.remove("example/logger", { drain: 5_000 }))
      yield* Effect.sleep(10)
      const ctx = (c: string) => ({ context: { actor: { id: "user-alice", kind: "user" as const }, correlationId: c } })
      // A waits for that running system stop before its intent (BEH-BR-073); B waits behind A for the plugin's turn.
      const a = yield* Effect.forkChild(host.retry("example/audit", ctx("c-a")))
      yield* Effect.sleep(20)
      const b = yield* Effect.forkChild(host.restart("example/audit", { drain: 20, ...ctx("c-b") }))
      yield* Effect.sleep(20)
      yield* Fiber.interrupt(b)
      yield* Fiber.interrupt(a)
      yield* Effect.sleep(20)
      expect(yield* stateOf(host, "example/audit")).toBe("stopping")             // nothing changed
      for (const c of ["c-a", "c-b"]) {
        const mine = records.filter((r) => r.correlationId === c)
        expect(mine.map((r) => r.phase)).toEqual(["requested", "failed"])
        expect(mine[1]!.error?._tag).toBe("Interrupted")
      }
      yield* Deferred.succeed(release, undefined)
      yield* Fiber.join(removal)
    })))
  })
})

describe("audit links of joins and supersession (BEH-BR-200)", () => {
  it("joined and superseded calls write their own requested and a linked terminal record", async () => {
    const records: Array<AuditRecord> = []
    const sink: AuditSink["Service"] = { record: (r) => Effect.sync(() => { records.push(r) }) }
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const host = yield* Host.make({ ...quickClose, auditTimeout: 50 }).pipe(Effect.provideService(AuditSink, sink))
      yield* host.install(loggerPlugin(journal())); yield* host.awaitIdle
      const entered = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      yield* Effect.forkChild(host.use(Logger, () => Deferred.succeed(entered, undefined).pipe(Effect.andThen(Deferred.await(release)))))
      yield* Deferred.await(entered)
      const ctx = (c: string) => ({ context: { actor: { id: "user-alice", kind: "user" as const }, correlationId: c } })
      const r1 = yield* Effect.forkChild(Effect.exit(host.restart("example/logger", { drain: 2_000, ...ctx("c-restart-1") })))
      yield* Effect.sleep(10)
      const r2 = yield* Effect.forkChild(Effect.exit(host.restart("example/logger", { drain: 2_000, ...ctx("c-restart-2") })))   // joins
      yield* Effect.sleep(10)
      const d = yield* Effect.forkChild(Effect.exit(host.disable("example/logger", { drain: 2_000, ...ctx("c-disable") })))       // supersedes both
      yield* Effect.sleep(10)
      yield* Deferred.succeed(release, undefined)
      expect(failedWith(yield* Fiber.join(r1), "Superseded")).toBe(true)
      expect(failedWith(yield* Fiber.join(r2), "Superseded")).toBe(true)          // joined callers of a superseded operation too
      expect(Exit.isSuccess(yield* Fiber.join(d))).toBe(true)
      // A second pair: remove joined by remove.
      yield* host.enable("example/logger"); yield* host.awaitIdle
      const e2 = yield* Deferred.make<void>()
      const rel2 = yield* Deferred.make<void>()
      yield* Effect.forkChild(host.use(Logger, () => Deferred.succeed(e2, undefined).pipe(Effect.andThen(Deferred.await(rel2)))))
      yield* Deferred.await(e2)
      const m1 = yield* Effect.forkChild(host.remove("example/logger", { drain: 2_000, ...ctx("c-remove-1") }))
      yield* Effect.sleep(10)
      const m2 = yield* Effect.forkChild(host.remove("example/logger", { drain: 2_000, ...ctx("c-remove-2") }))
      yield* Effect.sleep(10)
      yield* Deferred.succeed(rel2, undefined)
      yield* Fiber.join(m1); yield* Fiber.join(m2)
      yield* Effect.sleep(20)                                                     // let the writer drain

      const reqOf = (c: string) => records.filter((r) => r.correlationId === c && r.phase === "requested")
      const disableReq = reqOf("c-disable")[0]!
      for (const c of ["c-restart-1", "c-restart-2"]) {
        expect(reqOf(c)).toHaveLength(1)
        const t = records.filter((r) => r.correlationId === c && r.phase !== "requested")
        expect(t.map((r) => r.phase)).toEqual(["superseded"])
        expect(t[0]!.causationId).toBe(disableReq.recordId)
      }
      expect(records.filter((r) => r.correlationId === "c-disable" && r.phase === "completed")).toHaveLength(1)
      expect(reqOf("c-remove-2")).toHaveLength(1)
      const joined = records.filter((r) => r.phase === "joined")
      expect(joined).toHaveLength(1)
      expect(joined[0]).toMatchObject({ correlationId: "c-remove-1", causationId: "c-remove-2", after: { state: "uninstalled" } })
      expect(records.filter((r) => r.correlationId === "c-remove-1" && r.phase === "completed")).toHaveLength(1)
    })))
  })
})
