// Report 01 R1/R2 (BEH-BR-039, BEH-BR-160): a stale build's outcome is always discarded and reported, never sticky.
// Prototype only; evidences no requirement (CCR-BR-004).
import { Deferred, Effect, Fiber, Layer, Stream } from "effect"
import { describe, expect, it } from "vitest"
import { define, type AnyPlugin } from "../src/plugin.js"
import type { HostEvent } from "../src/events.js"
import { Logger, drive, idle, journal, loggerPlugin, stateOf, withHost } from "./fixtures.js"

const dependent = (build: Effect.Effect<void, string>) => define({
  id: "repro/dependent", requires: [Logger] as const, provides: [] as const,
  build: Layer.effectDiscard(build) as never
}) as unknown as AnyPlugin

const run = (cause: "provider-removed" | "operator-removed") => withHost((host) => Effect.gen(function* () {
  const seen: HostEvent[] = []
  yield* Effect.forkScoped(host.events.pipe(Stream.runForEach((e) => Effect.sync(() => { seen.push(e) }))))
  yield* host.install(loggerPlugin(journal()))
  yield* host.install(dependent(Effect.andThen(Effect.sleep(400), Effect.fail("late build failure"))))
  yield* host.stepPlugin("example/logger")
  yield* host.stepPlugin("repro/dependent")
  yield* drive(host, host.remove(cause === "provider-removed" ? "example/logger" : "repro/dependent", { drain: 5000 }))
  yield* idle(host)
  const isStale = (e: HostEvent) => e.type === "build-finished" && (e as { stale?: boolean }).stale
  for (let i = 0; i < 1000 && !seen.some(isStale); i++) yield* Effect.sleep(2)   // the collector fiber catches up
  const state = cause === "provider-removed" ? yield* stateOf(host, "repro/dependent") : undefined
  return { state, stale: seen.filter((e) => e.type === "build-finished" && (e as { stale?: boolean }).stale) as Array<HostEvent & { discardedFailures?: number; outcome?: string }> }
}))

describe("BEH-BR-039 (R1): stale failed builds are discarded and reported", () => {
  it("provider loss: plugin is `waiting`, event is stale with discardedFailures 1", async () => {
    const r = await run("provider-removed")
    expect(r.state).toBe("waiting")
    expect(r.stale).toHaveLength(1)
    expect(r.stale[0]).toMatchObject({ outcome: "failure", discardedFailures: 1 })
  })
  it("operator removal: failure is likewise reported stale", async () => {
    const r = await run("operator-removed")
    expect(r.stale[0]).toMatchObject({ outcome: "failure", discardedFailures: 1 })
  })
})

describe("BEH-BR-039: repeated discarded failures mark the build flapping", () => {
  it("the third consecutive discarded failure emits build-flapping and shows `flapping` on the waiting snapshot; a real outcome clears it", async () => {
    let gate = Effect.runSync(Deferred.make<void>())
    let failing = true
    const dep = dependent(Effect.suspend(() => Deferred.await(gate).pipe(Effect.andThen(failing ? Effect.fail("late failure") : Effect.void))))
    await withHost((host) => Effect.gen(function* () {
      const seen: HostEvent[] = []
      yield* Effect.forkScoped(host.events.pipe(Stream.runForEach((e) => Effect.sync(() => { seen.push(e) }))))
      const flappingOf = () => Effect.map(host.snapshot, (s) => (s.plugins.find((p) => p.id === "repro/dependent") as { flapping?: { discardedFailures: number } } | undefined)?.flapping)
      yield* host.install(dep)
      const lose = () => Effect.gen(function* () {
        gate = Effect.runSync(Deferred.make<void>())                       // a fresh gate per attempt: the build reads it when it starts
        yield* host.install(loggerPlugin(journal()))
        yield* host.stepPlugin("example/logger"); yield* host.stepPlugin("repro/dependent")
        const removal = yield* Effect.forkChild(host.remove("example/logger", { drain: 5000 }))   // the stop waits for the running build (G-P14), which is now stale
        while ((yield* stateOf(host, "repro/dependent")) !== "stopping") if (!(yield* host.step)) yield* Effect.yieldNow
        yield* Deferred.succeed(gate, undefined)
        yield* drive(host, Fiber.join(removal))
        yield* idle(host)
        for (let i = 0; i < 400 && !seen.some((e) => e.type === "build-finished" && (e as { stale?: boolean }).stale && (e as { discardedFailures?: number }).discardedFailures === attempts); i++) yield* Effect.sleep(2)
      })
      let attempts = 0
      for (attempts = 1; attempts <= 2; attempts++) yield* lose()
      expect(yield* flappingOf()).toBeUndefined()                            // below the limit
      expect(seen.filter((e) => e.type === "build-flapping")).toHaveLength(0)
      attempts = 3; yield* lose()
      expect(yield* flappingOf()).toEqual({ discardedFailures: 3 })
      for (let i = 0; i < 400 && !seen.some((e) => e.type === "build-flapping"); i++) yield* Effect.sleep(2)
      expect(seen.filter((e) => e.type === "build-flapping")).toMatchObject([{ discardedFailures: 3 }])
      // A real (non-stale) outcome clears the counter.
      failing = false
      yield* host.install(loggerPlugin(journal()))
      gate = Effect.runSync(Deferred.make<void>()); yield* Deferred.succeed(gate, undefined)
      yield* idle(host)
      expect(yield* stateOf(host, "repro/dependent")).toBe("active")
      expect(yield* flappingOf()).toBeUndefined()
    }))
  })
})

describe("BEH-BR-105: a build that fails after shutdown began is discarded, not `failed`", () => {
  it("the stale failure leaves the host closing cleanly with the plugin unregistered", async () => {
    const gate = Effect.runSync(Deferred.make<void>())
    const dep = define({ id: "slow", requires: [] as const, provides: [] as const, build: Layer.effectDiscard(Deferred.await(gate).pipe(Effect.andThen(Effect.fail("late")))) as never }) as unknown as AnyPlugin
    await withHost((host) => Effect.gen(function* () {
      const seen: HostEvent[] = []
      yield* Effect.forkScoped(host.events.pipe(Stream.runForEach((e) => Effect.sync(() => { seen.push(e) }))))
      yield* host.install(dep); yield* host.stepPlugin("slow")
      const closing = yield* Effect.forkChild(host.shutdown())
      for (let i = 0; i < 50; i++) yield* Effect.yieldNow
      yield* Deferred.succeed(gate, undefined)
      const report = yield* drive(host, Fiber.join(closing))
      expect(JSON.stringify(report)).not.toContain("slow")                         // no cleanup failure, nothing left over
      for (let i = 0; i < 100; i++) yield* Effect.yieldNow
      expect(seen.some((e) => e.type === "build-flapping")).toBe(false)
    }))
  })
})
