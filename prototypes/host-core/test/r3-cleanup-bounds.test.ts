// Report 03 R1/T2 (BEH-BR-046, BEH-BR-167): bounded finalizers and the revocation feed. Virtual time; prototype, evidences no requirement.
import { Effect, Exit, Fiber, Scope, Stream } from "effect"
import { TestClock } from "effect/testing"
import { describe, expect, it } from "vitest"
import * as Registry from "../src/registry.js"
import type { HoldRevoked } from "../src/registry.js"

const run = <A, E>(body: Effect.Effect<A, E, Scope.Scope>) => Effect.runPromise(Effect.scoped(body).pipe(Effect.provide(TestClock.layer())))

describe("report 03 T2: a revoked holder's finalizer is bounded by revokeTimeout (BEH-BR-167)", () => {
  it("a stuck finalizer is counted, the id is reusable after revokeTimeout, and the notice is published once with seq 1", () => run(Effect.gen(function* () {
    const reg = yield* Registry.make<string>({ name: "menu", drainTimeout: 100, revokeTimeout: 500 })
    const seen: HoldRevoked[] = []
    yield* Effect.forkScoped(reg.revocations.pipe(Stream.runForEach((n) => Effect.sync(() => { seen.push(n) }))))
    yield* Effect.yieldNow
    const owner = yield* Scope.make()
    yield* reg.add("a", "v").pipe(Scope.provide(owner))
    const holder = yield* Effect.forkDetach(reg.use("a", () => Effect.never.pipe(Effect.ensuring(Effect.never)), {}))
    yield* Effect.yieldNow
    const closing = yield* Effect.forkChild(Scope.close(owner, Exit.void))
    yield* TestClock.adjust(100)                                              // drain expires: holder revoked, its finalizer hangs
    yield* Effect.yieldNow
    expect(closing.pollUnsafe()).toBeUndefined()
    yield* TestClock.adjust(499)
    yield* Effect.yieldNow
    expect(closing.pollUnsafe()).toBeUndefined()                              // still inside the revoke bound
    yield* TestClock.adjust(1)
    yield* Fiber.await(closing)
    yield* Effect.yieldNow
    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatchObject({ registry: "menu", id: "a", holders: 1, stuck: 1, seq: 1 })
    yield* reg.add("a", "again")                                              // id released
    expect(holder.pollUnsafe()).toBeUndefined()                               // the holder itself is still stuck, not abandoned silently
  })))

  it("a holder whose finalizer returns is revoked with stuck 0", () => run(Effect.gen(function* () {
    const reg = yield* Registry.make<string>({ name: "menu", drainTimeout: 100, revokeTimeout: 500 })
    const seen: HoldRevoked[] = []
    yield* Effect.forkScoped(reg.revocations.pipe(Stream.runForEach((n) => Effect.sync(() => { seen.push(n) }))))
    yield* Effect.yieldNow
    const owner = yield* Scope.make()
    yield* reg.add("a", "v").pipe(Scope.provide(owner))
    yield* Effect.forkChild(reg.use("a", () => Effect.never))
    yield* Effect.yieldNow
    const closing = yield* Effect.forkChild(Scope.close(owner, Exit.void))
    yield* TestClock.adjust(100)
    yield* Fiber.await(closing)
    yield* Effect.yieldNow
    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatchObject({ holders: 1, stuck: 0, seq: 1 })
  })))

  it("a removal that revoked no holder publishes nothing", () => run(Effect.gen(function* () {
    const reg = yield* Registry.make<string>({ name: "menu" })
    const seen: HoldRevoked[] = []
    yield* Effect.forkScoped(reg.revocations.pipe(Stream.runForEach((n) => Effect.sync(() => { seen.push(n) }))))
    yield* Effect.yieldNow
    const owner = yield* Scope.make()
    yield* reg.add("a", "v").pipe(Scope.provide(owner))
    yield* Scope.close(owner, Exit.void)
    yield* Effect.yieldNow
    expect(seen).toEqual([])
  })))
})
