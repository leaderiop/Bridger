// Report 01 R5: abort of a parked stop (`stopping` -> `active`). Prototype only (CCR-BR-004).
import { Context, Deferred, Effect, Exit, Fiber, Layer, Stream } from "effect"
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
      for (let i = 0; i < 400 && checks <= at + 1; i++) yield* Effect.sleep(5)    // the loop keeps probing the same, still active, activation
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
      for (let i = 0; i < 400 && j.lines.length < 1; i++) yield* Effect.sleep(2)
      expect(j.lines).toEqual(["lit"])
      const entered = yield* Deferred.make<void>()
      const holder = yield* Effect.forkChild(host.use(Search, () => Deferred.succeed(entered, undefined).pipe(Effect.andThen(Effect.never))))
      yield* Deferred.await(entered)
      expect(failedWith(yield* Effect.exit(drive(host, host.restart("search", { drain: 20 }))), "DrainTimeout")).toBe(true)
      yield* idle(host)
      yield* drive(host, host.abort("search")); yield* idle(host)
      for (let i = 0; i < 400 && j.lines.length < 2; i++) yield* Effect.sleep(2)
      expect(j.lines).toEqual(["lit", "lit"])
      expect(yield* stateOf(host, "ui")).toBe("active")
      yield* Fiber.interrupt(holder)
    }))
  })
})
