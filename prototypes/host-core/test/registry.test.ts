// Phase-P5 scenarios for ContributionRegistry (behaviour 19, BEH-BR-161–168).
import { Context, Deferred, Effect, Exit, Fiber, Layer, Option, Scope, Stream } from "effect"
import { describe, expect, it } from "vitest"
import * as Registry from "../src/registry.js"
import type { AnyPlugin } from "../src/plugin.js"
import { Event, Events } from "../src/bus.js"
import { as, run } from "./p4fixtures.js"
import { drive, idle } from "./fixtures.js"

const failed = (exit: Exit.Exit<unknown, unknown>, tag: string) => Exit.isFailure(exit) && JSON.stringify(exit.cause).includes(tag)
const scoped = <A, E>(e: Effect.Effect<A, E, Scope.Scope>) => Effect.runPromise(Effect.scoped(e))
const ids = <A>(v: Registry.RegistryView<A>) => v.entries.map((e) => e.id)

class Routes extends Context.Service<Routes, Registry.Registry<string>>()("example/Routes") {}

describe("ContributionRegistry (behaviour 19)", () => {
  it("BEH-BR-163: ids are unique — a duplicate, a concurrent duplicate and a non-finite priority register nothing", () => scoped(Effect.gen(function* () {
    const r = yield* Registry.make<string>({ name: "routes" })
    yield* r.add("home", "/")
    expect(failed(yield* Effect.exit(r.add("home", "/again")), "DuplicateContribution")).toBe(true)
    const both = yield* Effect.all([Effect.exit(r.add("about", "a")), Effect.exit(r.add("about", "b"))], { concurrency: "unbounded" })
    expect(both.filter(Exit.isSuccess)).toHaveLength(1)
    const nan = yield* Effect.exit(r.add("nan", "x", { priority: Number.NaN }))
    expect(Exit.isFailure(nan) && !failed(nan, "DuplicateContribution")).toBe(true)        // a defect
    expect(ids(yield* r.view)).toEqual(["about", "home"])
  })))

  it("BEH-BR-164, 165: scope close removes last-in-first-out, leaves others intact; order is priority then id; revisions step by one", () => scoped(Effect.gen(function* () {
    const r = yield* Registry.make<string>()
    const seen: Array<number> = []
    yield* Effect.forkScoped(r.changes.pipe(Stream.runForEach((v) => Effect.sync(() => { seen.push(v.revision) }))))
    yield* Effect.yieldNow
    yield* r.add("z", "keep", { priority: -1 })
    const inner = yield* Scope.make()
    yield* Effect.all([r.add("b", "1"), r.add("a", "2"), r.add("c", "3", { priority: 5 })]).pipe(Scope.provide(inner))
    expect((yield* r.view).entries.map((e) => [e.id, e.priority])).toEqual([["z", -1], ["a", 0], ["b", 0], ["c", 5]])
    expect((yield* r.view).revision).toBe(4)
    const order: Array<string> = []
    const sub = yield* Effect.forkScoped(r.changes.pipe(Stream.drop(1), Stream.take(3), Stream.runForEach((v) => Effect.sync(() => { order.push(ids(v).join(",")) }))))
    yield* Effect.yieldNow
    yield* Scope.close(inner, Exit.void)
    yield* Fiber.join(sub)
    expect(order).toEqual(["z,a,b", "z,b", "z"])                                // c, then a, then b: last in, first out
    expect((yield* r.view).revision).toBe(7)
    expect(seen.at(-1)).toBe(7)
    expect(seen.every((n, i) => i === 0 || n > seen[i - 1]!)).toBe(true)         // never regress
  })))

  it("BEH-BR-166, 167: use holds a contribution; removal hides it at once, waits for the holder, and the id stays reserved until it ends", () => scoped(Effect.gen(function* () {
    const r = yield* Registry.make<string>({ drainTimeout: 5_000 })
    expect(failed(yield* Effect.exit(r.use("ghost", () => Effect.void)), "ContributionUnavailable")).toBe(true)
    const contributor = yield* Scope.make()
    yield* r.add("job", "payload").pipe(Scope.provide(contributor))
    const entered = yield* Deferred.make<void>()
    const release = yield* Deferred.make<void>()
    const holder = yield* Effect.forkChild(r.use("job", (v) => Deferred.succeed(entered, undefined).pipe(Effect.andThen(Deferred.await(release)), Effect.as(v))))
    yield* Deferred.await(entered)
    const removal = yield* Effect.forkChild(Scope.close(contributor, Exit.void))
    yield* Effect.yieldNow
    expect(yield* r.get("job")).toEqual(Option.none())                          // hidden first
    expect(ids(yield* r.view)).toEqual([])
    expect(failed(yield* Effect.exit(r.use("job", () => Effect.void)), "ContributionUnavailable")).toBe(true)
    expect(failed(yield* Effect.exit(r.add("job", "successor")), "DuplicateContribution")).toBe(true)   // still reserved
    expect(removal.pollUnsafe()).toBeUndefined()                                // waiting for the holder
    yield* Deferred.succeed(release, undefined)
    expect(yield* Fiber.join(holder)).toBe("payload")
    yield* Fiber.join(removal)
    yield* r.add("job", "successor")                                            // reusable once removal completes
  })))

  it("BEH-BR-167: at drainTimeout the holders are interrupted, fail with LeaseRevoked, and their finalizers run before removal completes", () => scoped(Effect.gen(function* () {
    const r = yield* Registry.make<string>({ drainTimeout: 30 })
    const log: Array<string> = []
    const contributor = yield* Scope.make()
    yield* Effect.all([r.add("a", "A"), r.add("b", "B")]).pipe(Scope.provide(contributor))
    const entered = yield* Deferred.make<void>()
    const holder = yield* Effect.forkChild(r.useAll((v) => Effect.gen(function* () {
      yield* Effect.addFinalizer(() => Effect.sync(() => { log.push("holder finalizer") }))
      yield* Deferred.succeed(entered, undefined)
      return yield* Effect.never.pipe(Effect.as(ids(v)))
    }).pipe(Effect.scoped)))
    yield* Deferred.await(entered)
    yield* Scope.close(contributor, Exit.void).pipe(Effect.andThen(Effect.sync(() => { log.push("removed") })))
    expect(failed(yield* Fiber.await(holder), "LeaseRevoked")).toBe(true)
    expect(log).toEqual(["holder finalizer", "removed"])
  })))

  it("BEH-BR-163, 168: contributions added inside an activation are owned by that plugin in inspect — names and ids only", async () => {
    const Ping = Event.make<[], void>()("ops/ping")
    await run((host) => Effect.gen(function* () {
      const contributor: AnyPlugin = {
        id: "pages", requires: [Routes, Events], provides: [],
        build: Layer.effectDiscard(Effect.gen(function* () {
          const routes = yield* Routes
          yield* routes.add("pages/home", "route-value-secret")
          yield* (yield* Events).on(Ping, () => Effect.void)
        })) as unknown as AnyPlugin["build"]
      }
      yield* host.install(contributor, as())
      yield* idle(host)
      const i = yield* host.inspect("pages")
      expect(i.contributions.map((c) => c.registry)).toEqual(["routes", "ops/ping"])
      expect(i.contributions[0]!.id).toBe("pages/home")
      expect(JSON.stringify(i)).not.toContain("route-value-secret")             // the value is never reported
      yield* drive(host, host.restart("pages", as()))
      yield* idle(host)
      expect((yield* host.inspect("pages")).contributions).toHaveLength(2)      // withdrawn, then added again
    }), { options: { base: [[Routes, Effect.runSync(Effect.scoped(Registry.make<string>({ name: "routes" })))]] } })
  })
})
