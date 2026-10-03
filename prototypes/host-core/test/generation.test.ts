// Phase-P5 scenarios for Generation (behaviour 20, BEH-BR-169–176).
import { Cause, Context, Deferred, Effect, Exit, Fiber, Layer, Scope, Stream } from "effect"
import { describe, expect, it } from "vitest"
import * as Generation from "../src/generation.js"
import { PluginRuntime } from "../src/runtime.js"
import type { AnyPlugin } from "../src/plugin.js"
import { as, run } from "./p4fixtures.js"
import { drive, idle } from "./fixtures.js"

const failed = (exit: Exit.Exit<unknown, unknown>, tag: string) => Exit.isFailure(exit) && JSON.stringify(exit.cause).includes(tag)
const scoped = <A, E>(e: Effect.Effect<A, E, Scope.Scope>) => Effect.runPromise(Effect.scoped(e))

/** Holds a lease taken with `acquire` until released; reports the value it saw. */
const holdAcquired = <A>(g: Generation.Generation<A>) => Effect.gen(function* () {
  const got = yield* Deferred.make<Generation.Lease<A>>()
  const release = yield* Deferred.make<void>()
  const fiber = yield* Effect.forkChild(Effect.scoped(Effect.gen(function* () {
    yield* Deferred.succeed(got, yield* g.acquire)
    yield* Deferred.await(release)
  })))
  return { lease: yield* Deferred.await(got), release: Deferred.succeed(release, undefined), fiber }
})

describe("Generation (behaviour 20)", () => {
  it("BEH-BR-170: publish replaces the value in one step; earlier leases keep the old value; revisions count publishes", () => scoped(Effect.gen(function* () {
    const g = yield* Generation.make({ validators: "v1", storage: "s1" }, { name: "model" })
    expect(yield* g.current).toEqual({ revision: 0, open: true })
    const old = yield* holdAcquired(g)
    const retired = yield* g.publish({ validators: "v2", storage: "s2" })
    const fresh = yield* holdAcquired(g)
    expect([old.lease.value.validators, old.lease.value.storage, old.lease.revision]).toEqual(["v1", "s1", 0])   // never a mixture
    expect([fresh.lease.value.validators, fresh.lease.value.storage, fresh.lease.revision]).toEqual(["v2", "s2", 1])
    expect(retired.value).toEqual({ validators: "v1", storage: "s1" })
    expect(yield* retired.holders).toBe(1)
    yield* old.release; yield* Fiber.join(old.fiber)
    yield* retired.drained                                                     // completes once the old lease ends
    expect(yield* retired.holders).toBe(0)
    yield* fresh.release
  })))

  it("BEH-BR-171, 173: admission closes and reopens without touching admitted leases; awaitDrained neither closes admission nor waits for later leases", () => scoped(Effect.gen(function* () {
    const g = yield* Generation.make(1, { name: "model", drainTimeout: 50 })
    const held = yield* holdAcquired(g)
    yield* g.closeAdmission; yield* g.closeAdmission                            // a no-op the second time
    expect(failed(yield* Effect.exit(Effect.scoped(g.acquire)), `"name":"model"`)).toBe(true)
    expect(failed(yield* Effect.exit(g.use((n) => Effect.succeed(n))), "AdmissionClosed")).toBe(true)
    yield* g.publish(2)
    expect(yield* g.current).toEqual({ revision: 1, open: false })            // publish does not reopen
    yield* g.reopenAdmission
    expect(yield* g.use((n) => Effect.succeed(n))).toBe(2)
    const t = yield* Effect.exit(g.awaitDrained({ timeout: 20 }))
    expect(Exit.isSuccess(t)).toBe(true)                                        // nothing held on the current value
    expect(held.lease.value).toBe(1)
    yield* held.release
  })))

  it("BEH-BR-173–175: a retired value's drain times out repeatably, force revokes and awaits finalizers; retired values drain independently", () => scoped(Effect.gen(function* () {
    const g = yield* Generation.make("a", { name: "model" })
    const log: Array<string> = []
    const entered = yield* Deferred.make<void>()
    const user = yield* Effect.forkChild(g.use(() => Effect.gen(function* () {
      yield* Effect.addFinalizer(() => Effect.sync(() => { log.push("use finalizer") }))
      yield* Deferred.succeed(entered, undefined)
      return yield* Effect.never
    }).pipe(Effect.scoped)))
    yield* Deferred.await(entered)
    const retiredA = yield* g.publish("b")
    const other = yield* holdAcquired(g)
    const retiredB = yield* g.publish("c")
    const t1 = yield* Effect.exit(retiredA.drain({ timeout: 10 }))
    expect(failed(t1, `"id":"model"`) && failed(t1, `"leases":1`)).toBe(true)
    expect(failed(yield* Effect.exit(retiredA.drain({ timeout: 10 })), "DrainTimeout")).toBe(true)   // repeatable
    yield* retiredA.drain({ timeout: 10, force: true })
    expect(failed(yield* Fiber.await(user), "LeaseRevoked")).toBe(true)
    expect(log).toEqual(["use finalizer"])
    expect(yield* retiredB.holders).toBe(1)                                    // the other retired value is untouched
    yield* other.release; yield* Fiber.join(other.fiber)
    yield* retiredB.drained
  })))

  it("finding G26: a forced drain of an `acquire` lease interrupts the acquiring fiber — a caller's Scope cannot be closed from outside", () => scoped(Effect.gen(function* () {
    const g = yield* Generation.make("a")
    const held = yield* holdAcquired(g)
    const retired = yield* g.publish("b")
    yield* retired.drain({ timeout: 5, force: true })
    const exit = yield* Fiber.await(held.fiber)
    expect(Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)).toBe(true)
    expect(yield* retired.holders).toBe(0)
  })))

  it("BEH-BR-169: closing the generation's scope closes admission and drains everything, revoking at the limit", async () => {
    let held: Fiber.Fiber<unknown, unknown> | undefined
    await scoped(Effect.gen(function* () {
      const inner = yield* Scope.make()
      const g = yield* Generation.make(1, { drainTimeout: 20 }).pipe(Scope.provide(inner))
      held = (yield* holdAcquired(g)).fiber as Fiber.Fiber<unknown, unknown>
      yield* Scope.close(inner, Exit.void)
      expect((yield* g.current).open).toBe(false)
      expect(Exit.isFailure(yield* Fiber.await(held))).toBe(true)
    }))
  })

  it("BEH-BR-174: a forced drain of a generation made in an activation is a lease-revoked host event naming it", async () => {
    class Model extends Context.Service<Model, Generation.Generation<string>>()("example/Model") {}
    await run((host) => Effect.gen(function* () {
      const seen = yield* Effect.forkChild(host.events.pipe(Stream.filter((e) => e.type === "lease-revoked"), Stream.take(1), Stream.runCollect))
      const coordinator: AnyPlugin = {
        id: "coordinator", requires: [], provides: [Model],
        build: Layer.effect(Model, Effect.gen(function* () { yield* PluginRuntime; return yield* Generation.make("m1", { name: "active-model" }) })) as unknown as AnyPlugin["build"]
      }
      yield* host.install(coordinator, as())
      yield* idle(host)
      const g = yield* host.use(Model, (m) => Effect.succeed(m))
      const entered = yield* Deferred.make<void>()
      yield* Effect.forkChild(g.use(() => Deferred.succeed(entered, undefined).pipe(Effect.andThen(Effect.never))))
      yield* Deferred.await(entered)
      const retired = yield* g.publish("m2")
      yield* retired.drain({ timeout: 5, force: true })
      const [event] = [...(yield* Fiber.join(seen))]
      expect(event).toMatchObject({ type: "lease-revoked", generation: "active-model", leases: 1, pluginId: "coordinator" })
    }))
  })
})
