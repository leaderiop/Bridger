// Report 01 R5: abort of a parked stop (`stopping` -> `active`). Prototype only (CCR-BR-004).
import { Cause, Context, Deferred, Effect, Exit, Fiber, Layer, Stream } from "effect"
import { describe, expect, it } from "vitest"
import { define, type AnyPlugin } from "../src/plugin.js"
import { PluginRuntime } from "../src/runtime.js"
import { Logger, drive, idle, journal, loggerPlugin, stateOf, withHost } from "./fixtures.js"

const dependent = define({ id: "repro/dependent", requires: [Logger] as const, provides: [] as const, build: Layer.effectDiscard(Effect.void) as never }) as unknown as AnyPlugin
const failedWith = (e: Exit.Exit<unknown, unknown>, tag: string) => Exit.isFailure(e) && JSON.stringify(e.cause).includes(tag)

describe("R5: abort a parked stop", () => {
  it("a mistaken restart whose drain timed out is undone: provider active again, lease untouched, dependent restarted", async () => {
    await withHost((host) => Effect.gen(function* () {
      yield* host.install(loggerPlugin(journal())); yield* host.install(dependent); yield* idle(host)
      const before = (yield* host.snapshot).plugins.find((p) => p.id === "example/logger") as { activation: number }
      const entered = yield* Deferred.make<void>()
      const holder = yield* Effect.forkChild(host.use(Logger, () => Deferred.succeed(entered, undefined).pipe(Effect.andThen(Effect.never))))
      yield* Deferred.await(entered)
      expect(failedWith(yield* Effect.exit(drive(host, host.restart("example/logger", { drain: 20 }))), "DrainTimeout")).toBe(true)
      yield* idle(host)
      expect(yield* stateOf(host, "example/logger")).toBe("stopping")
      expect(yield* stateOf(host, "repro/dependent")).toBe("waiting")
      yield* drive(host, host.abort("example/logger"))
      yield* idle(host)
      const snap = yield* host.snapshot
      expect(snap.plugins.find((p) => p.id === "example/logger")).toMatchObject({ state: "active", activation: before.activation })
      expect(yield* stateOf(host, "repro/dependent")).toBe("active")
      expect(holder.pollUnsafe()).toBeUndefined()                              // the lease holder was never revoked
      expect(failedWith(yield* Effect.exit(drive(host, host.abort("example/logger"))), "Conflict")).toBe(true)   // nothing parked any more
      yield* Fiber.interrupt(holder)
      yield* drive(host, host.restart("example/logger")); yield* idle(host)       // a later stop drains normally
      expect(yield* stateOf(host, "example/logger")).toBe("active")
    }))
  })

  it("a parked remove is aborted too: the plugin stays installed and active, and a stop-aborted event is emitted", async () => {
    await withHost((host) => Effect.gen(function* () {
      const seen: Array<any> = []
      yield* Effect.forkScoped(host.events.pipe(Stream.runForEach((e) => Effect.sync(() => { seen.push(e) }))))
      yield* host.install(loggerPlugin(journal())); yield* host.install(dependent); yield* idle(host)
      const entered = yield* Deferred.make<void>()
      const holder = yield* Effect.forkChild(host.use(Logger, () => Deferred.succeed(entered, undefined).pipe(Effect.andThen(Effect.never))))
      yield* Deferred.await(entered)
      expect(failedWith(yield* Effect.exit(drive(host, host.remove("example/logger", { drain: 20 }))), "DrainTimeout")).toBe(true)
      yield* idle(host)
      yield* drive(host, host.abort("example/logger")); yield* idle(host)
      expect(yield* stateOf(host, "example/logger")).toBe("active")
      expect(yield* stateOf(host, "repro/dependent")).toBe("active")
      for (let i = 0; i < 200 && !seen.some((e) => e.type === "stop-aborted"); i++) yield* Effect.yieldNow
      expect(seen.filter((e) => e.type === "stop-aborted" && e.pluginId === "example/logger")).toHaveLength(1)
      yield* Fiber.interrupt(holder)
    }))
  })

  it("the health loop runs again after an abort", async () => {
    let checks = 0
    class Probe extends Context.Service<Probe, {}>()("example/AbortProbe") {}
    const probed = define({
      id: "probed", requires: [] as const, provides: [Probe] as const, build: Layer.succeed(Probe, {}),
      health: { check: Effect.sync(() => { checks++ }), every: 5, timeout: 500, failureThreshold: 3 }
    }) as unknown as AnyPlugin
    await withHost((host) => Effect.gen(function* () {
      yield* host.install(probed); yield* idle(host)
      const entered = yield* Deferred.make<void>()
      const holder = yield* Effect.forkChild(host.use(Probe, () => Deferred.succeed(entered, undefined).pipe(Effect.andThen(Effect.never))))
      yield* Deferred.await(entered)
      expect(failedWith(yield* Effect.exit(drive(host, host.restart("probed", { drain: 20 }))), "DrainTimeout")).toBe(true)
      yield* idle(host)
      yield* drive(host, host.abort("probed")); yield* idle(host)
      const at = checks
      for (const t0 = Date.now(); Date.now() - t0 < 30_000 && checks <= at + 1;) yield* Effect.sleep(5)    // the loop keeps probing the same, still active, activation
      expect(checks).toBeGreaterThan(at + 1)
      expect(yield* stateOf(host, "probed")).toBe("active")
      yield* Fiber.interrupt(holder)
    }))
  })

  it("a whenAvailable run that ended with the parked stop runs again after the abort; the consumer's state never moved", async () => {
    class Search extends Context.Service<Search, { readonly q: Effect.Effect<string> }>()("example/AbortSearch") {}
    const j = journal()
    const search = define({ id: "search", requires: [] as const, provides: [Search] as const, build: Layer.succeed(Search, { q: Effect.succeed("hit") }) }) as unknown as AnyPlugin
    const ui = { id: "ui", requires: [], provides: [], optional: [Search], build: Layer.effectDiscard(Effect.gen(function* () {
      const rt = yield* PluginRuntime
      yield* rt.whenAvailable([Search] as const, () => j.push("lit").pipe(Effect.andThen(Effect.never)))
    })) as unknown as AnyPlugin["build"] } as AnyPlugin
    await withHost((host) => Effect.gen(function* () {
      yield* host.install(search); yield* host.install(ui); yield* idle(host)
      for (const t0 = Date.now(); Date.now() - t0 < 30_000 && j.lines.length < 1;) yield* Effect.sleep(2)
      expect(j.lines).toEqual(["lit"])
      const entered = yield* Deferred.make<void>()
      const holder = yield* Effect.forkChild(host.use(Search, () => Deferred.succeed(entered, undefined).pipe(Effect.andThen(Effect.never))))
      yield* Deferred.await(entered)
      expect(failedWith(yield* Effect.exit(drive(host, host.restart("search", { drain: 20 }))), "DrainTimeout")).toBe(true)
      yield* idle(host)
      yield* drive(host, host.abort("search")); yield* idle(host)
      for (const t0 = Date.now(); Date.now() - t0 < 30_000 && j.lines.length < 2;) yield* Effect.sleep(2)
      expect(j.lines).toEqual(["lit", "lit"])
      expect(yield* stateOf(host, "ui")).toBe("active")
      yield* Fiber.interrupt(holder)
    }))
  })

  it("a runtime-failure signal swallowed while the stop was parked is replayed after the abort", async () => {
    class Probe extends Context.Service<Probe, {}>()("example/AbortSignal") {}
    let report: ((m: string) => Effect.Effect<void>) | undefined
    const sig = define({ id: "sig", requires: [] as const, provides: [Probe] as const,
      build: Layer.effect(Probe, Effect.gen(function* () { const rt = yield* PluginRuntime; report = (m) => rt.reportFailure(Cause.fail(m)); return {} })) }) as unknown as AnyPlugin
    await withHost((host) => Effect.gen(function* () {
      yield* host.install(sig); yield* idle(host)
      const entered = yield* Deferred.make<void>()
      const holder = yield* Effect.forkChild(host.use(Probe, () => Deferred.succeed(entered, undefined).pipe(Effect.andThen(Effect.never))))
      yield* Deferred.await(entered)
      expect(failedWith(yield* Effect.exit(drive(host, host.restart("sig", { drain: 20 }))), "DrainTimeout")).toBe(true)
      yield* idle(host)
      yield* report!("boom while parked")                                      // swallowed: the plugin is `stopping`
      expect(yield* stateOf(host, "sig")).toBe("stopping")
      yield* Fiber.interrupt(holder)
      yield* drive(host, host.abort("sig")); yield* idle(host)
      // The retained signal now fails the plugin, instead of leaving it `active` with a dead fiber.
      expect(yield* stateOf(host, "sig")).toBe("failed")
    }))
  })

  it("abort is refused with HostClosed once shutdown has begun; shutdown resumes the parked stop", async () => {
    await withHost((host) => Effect.gen(function* () {
      yield* host.install(loggerPlugin(journal())); yield* idle(host)
      const entered = yield* Deferred.make<void>()
      const holder = yield* Effect.forkChild(host.use(Logger, () => Deferred.succeed(entered, undefined).pipe(Effect.andThen(Effect.never))))
      yield* Deferred.await(entered)
      expect(failedWith(yield* Effect.exit(drive(host, host.restart("example/logger", { drain: 20 }))), "DrainTimeout")).toBe(true)
      yield* idle(host)
      const closing = yield* Effect.forkChild(Effect.exit(host.shutdown()))
      for (let i = 0; i < 50; i++) yield* Effect.yieldNow
      expect(failedWith(yield* Effect.exit(host.abort("example/logger")), "HostClosed")).toBe(true)
      yield* Fiber.interrupt(holder)
      yield* drive(host, Fiber.join(closing))
    }))
  })

  it("the health count and health value held when the stop began survive an abort", async () => {
    class Probe extends Context.Service<Probe, {}>()("example/AbortHealth") {}
    let fail = true
    const probed = define({ id: "hp", requires: [] as const, provides: [Probe] as const, build: Layer.succeed(Probe, {}),
      health: { check: Effect.suspend(() => fail ? Effect.fail("down") : Effect.void), every: 5, timeout: 500, failureThreshold: 50 } }) as unknown as AnyPlugin
    await withHost((host) => Effect.gen(function* () {
      yield* host.install(probed); yield* idle(host)
      const healthOf = () => Effect.map(host.snapshot, (s) => (s.plugins.find((p) => p.id === "hp") as { health?: string }).health)
      for (const t0 = Date.now(); Date.now() - t0 < 30_000 && (yield* healthOf()) !== "degraded";) yield* Effect.sleep(5)
      expect(yield* healthOf()).toBe("degraded")
      const entered = yield* Deferred.make<void>()
      const holder = yield* Effect.forkChild(host.use(Probe, () => Deferred.succeed(entered, undefined).pipe(Effect.andThen(Effect.never))))
      yield* Deferred.await(entered)
      expect(failedWith(yield* Effect.exit(drive(host, host.restart("hp", { drain: 20 }))), "DrainTimeout")).toBe(true)
      yield* idle(host)
      yield* drive(host, host.abort("hp")); yield* idle(host)
      expect(yield* healthOf()).toBe("degraded")                                 // not reset to `unknown`
      fail = false
      for (const t0 = Date.now(); Date.now() - t0 < 30_000 && (yield* healthOf()) !== "healthy";) yield* Effect.sleep(5)
      expect(yield* healthOf()).toBe("healthy")                                  // the loop runs again
      yield* Fiber.interrupt(holder)
    }))
  })

  it("a stop that already removed a child cannot be aborted: the child's lifetime is its parent's activation", async () => {
    class Par extends Context.Service<Par, {}>()("example/AbortParent") {}
    const parent = define({ id: "par", requires: [] as const, provides: [Par] as const,
      build: Layer.effect(Par, Effect.gen(function* () {
        const rt = yield* PluginRuntime
        yield* rt.install({ id: "kid", requires: [Par], provides: [], build: Layer.empty as unknown as AnyPlugin["build"] } as AnyPlugin)
        return {}
      })) }) as unknown as AnyPlugin
    await withHost((host) => Effect.gen(function* () {
      yield* host.install(parent); yield* idle(host)
      const entered = yield* Deferred.make<void>()
      const holder = yield* Effect.forkChild(host.use(Par, () => Deferred.succeed(entered, undefined).pipe(Effect.andThen(Effect.never))))
      yield* Deferred.await(entered)
      expect(failedWith(yield* Effect.exit(drive(host, host.remove("par", { drain: 20 }))), "DrainTimeout")).toBe(true)
      yield* idle(host)
      expect(failedWith(yield* Effect.exit(drive(host, host.abort("par"))), "child-removed")).toBe(true)
      yield* Fiber.interrupt(holder)
    }))
  })

  it("a dependent returns only when every provider it requires is active or returns with it", async () => {
    class P1 extends Context.Service<P1, {}>()("example/AbortP1") {}
    class P2 extends Context.Service<P2, {}>()("example/AbortP2") {}
    const prov = (id: string, k: typeof P1 | typeof P2) => ({ id, requires: [], provides: [k], build: Layer.succeed(k as never, {}) as unknown as AnyPlugin["build"] }) as AnyPlugin
    class Dsvc extends Context.Service<Dsvc, {}>()("example/AbortD") {}
    const dep = { id: "d", requires: [P1, P2], provides: [Dsvc], build: Layer.succeed(Dsvc, {}) as unknown as AnyPlugin["build"] } as AnyPlugin
    await withHost((host) => Effect.gen(function* () {
      for (const p of [prov("p1", P1), prov("p2", P2), dep]) yield* host.install(p)
      yield* idle(host)
      const hold = (k: typeof P1 | typeof P2 | typeof Dsvc) => Effect.gen(function* () {
        const entered = yield* Deferred.make<void>()
        const h = yield* Effect.forkChild(host.use(k as never, () => Deferred.succeed(entered, undefined).pipe(Effect.andThen(Effect.never))) as Effect.Effect<void, unknown>)
        yield* Deferred.await(entered)
        return h
      })
      const h1 = yield* hold(P1), h2 = yield* hold(P2), hd = yield* hold(Dsvc)      // d's own lease parks its dependency-loss stop
      for (const id of ["p1", "p2"]) { expect(failedWith(yield* Effect.exit(drive(host, host.restart(id, { drain: 20 }))), "DrainTimeout")).toBe(true); yield* idle(host) }
      expect(yield* stateOf(host, "d")).toBe("stopping")
      yield* drive(host, host.abort("p1")); yield* idle(host)
      expect(yield* stateOf(host, "p1")).toBe("active")
      expect(yield* stateOf(host, "d")).toBe("stopping")                         // p2 is still stopping: d stays parked with it
      yield* drive(host, host.abort("p2")); yield* idle(host)
      expect(yield* stateOf(host, "d")).toBe("active")
      yield* Fiber.interrupt(h1); yield* Fiber.interrupt(h2); yield* Fiber.interrupt(hd)
    }))
  })
})
