// Report 04 R4 (EV-03, EV-04, EV-07, EV-12): a bounded `emit`, stated ordering, a re-emit depth cap, and the `parallel` failure policy (BEH-BR-141, 142, 144).
import { Cause, Context, Deferred, Effect, Exit, Fiber, Layer, Stream } from "effect"
import { describe, expect, it } from "vitest"
import { Event, Events, type EventBus } from "../src/bus.js"
import type { AnyPlugin } from "../src/plugin.js"
import { as, run } from "./p4fixtures.js"
import { idle } from "./fixtures.js"

const Note = Event.make<[n: number], void>()("r4/note", { mode: "emit" })
const Loop = Event.make<[n: number], void>()("r4/loop", { mode: "emit" })
const Fan = Event.make<[], number, string>()("r4/fan", { mode: "parallel", failure: "settle" })
const FanFast = Event.make<[], number, string>()("r4/fan-fast", { mode: "parallel", failure: "fail-fast" })

const listenerPlugin = (id: string, register: (bus: EventBus) => Effect.Effect<void, never, import("effect").Scope.Scope>): AnyPlugin => ({
  id, requires: [Events], provides: [],
  build: Layer.effectDiscard(Effect.gen(function* () { yield* register(yield* Events) })) as unknown as AnyPlugin["build"]
})
const busOf = (host: { use: <S, A>(k: Context.Key<any, S>, f: (s: S) => Effect.Effect<A>) => Effect.Effect<A, unknown> }) =>
  host.use(Events, (b) => Effect.succeed(b)) as Effect.Effect<EventBus, never>
const until = (cond: () => boolean) => Effect.gen(function* () { for (const t0 = Date.now(); Date.now() - t0 < 10_000 && !cond();) yield* Effect.sleep(1) })

describe("bounded emit, ordering and depth (report 04 R4)", () => {
  it("BEH-BR-141: a listener at its bound drops the next invocations, reports one overflow, and closes the episode with the total", async () => {
    await run((host) => Effect.gen(function* () {
      const gate = yield* Deferred.make<void>()
      let started = 0
      const seen = yield* Effect.forkChild(host.events.pipe(Stream.filter((e) => e.type === "listener-overflow"), Stream.take(2), Stream.runCollect))
      yield* host.install(listenerPlugin("l", (bus) => bus.on(Note, () => Effect.sync(() => { started++ }).pipe(Effect.andThen(Deferred.await(gate))), { maxInFlight: 2 })), as())
      yield* idle(host)
      const bus = yield* busOf(host)
      for (let i = 0; i < 5; i++) yield* bus.emit(Note, i)
      yield* until(() => started === 2)
      yield* Effect.sleep(5)
      expect(started).toBe(2)                                       // 3 dropped, not queued
      yield* Deferred.succeed(gate, undefined)
      const events = [...(yield* Fiber.join(seen))]
      expect(events[0]).toMatchObject({ type: "listener-overflow", event: "r4/note", bound: 2, dropped: 1, pluginId: "l" })
      expect(events[1]).toMatchObject({ type: "listener-overflow", bound: 2, dropped: 3, ended: true })
      expect(events[0]).not.toHaveProperty("ended")
    }))
  })

  it("BEH-BR-141: the bound is per listener and defaults to listenerConcurrency; a host option of 1 admits one invocation", async () => {
    await run((host) => Effect.gen(function* () {
      const gate = yield* Deferred.make<void>()
      let started = 0
      yield* host.install(listenerPlugin("l", (bus) => bus.on(Note, () => Effect.sync(() => { started++ }).pipe(Effect.andThen(Deferred.await(gate))))), as())
      yield* idle(host)
      const bus = yield* busOf(host)
      for (let i = 0; i < 4; i++) yield* bus.emit(Note, i)
      yield* until(() => started >= 1); yield* Effect.sleep(5)
      expect(started).toBe(1)
      yield* Deferred.succeed(gate, undefined)
    }), { options: { listenerConcurrency: 1 } })
  })

  it("BEH-BR-141: a serialised listener sees invocations in the order emit started them, whatever each takes", async () => {
    await run((host) => Effect.gen(function* () {
      const gates = [yield* Deferred.make<void>(), yield* Deferred.make<void>(), yield* Deferred.make<void>()]
      const order: Array<number> = []
      yield* host.install(listenerPlugin("l", (bus) => bus.on(Note, (n) => Deferred.await(gates[n]!).pipe(Effect.andThen(Effect.sync(() => { order.push(n) }))), { serialised: true })), as())
      yield* idle(host)
      const bus = yield* busOf(host)
      for (let n = 0; n < 3; n++) yield* bus.emit(Note, n)
      yield* Deferred.succeed(gates[2]!, undefined); yield* Deferred.succeed(gates[1]!, undefined); yield* Deferred.succeed(gates[0]!, undefined)
      yield* until(() => order.length === 3)
      expect(order).toEqual([0, 1, 2])                              // released in reverse, run in emit order
    }))
  })

  it("BEH-BR-144: a listener re-emitting its own event stops at emitDepthCap with a defect naming the chain", async () => {
    await run((host) => Effect.gen(function* () {
      const seen = yield* Effect.forkChild(host.events.pipe(Stream.filter((e) => e.type === "listener-failed"), Stream.take(1), Stream.runCollect))
      let runs = 0
      yield* host.install(listenerPlugin("l", (bus) => bus.on(Loop, (n) => Effect.suspend(() => { runs++; return bus.emit(Loop, n + 1) }))), as())
      yield* idle(host)
      const bus = yield* busOf(host)
      yield* bus.emit(Loop, 0)
      const e = [...(yield* Fiber.join(seen))][0] as { message: string }
      expect(e.message).toContain("emit depth 4 exceeded")
      expect(e.message).toContain("r4/loop -> r4/loop")
      expect(runs).toBe(4)                                          // depth 1..4 ran, the fifth dispatch was refused
    }), { options: { emitDepthCap: 4 } })
  })

  it("BEH-BR-142: parallel settles by default (every listener finishes, the first failure in listener order fails the dispatch, the rest are reported); fail-fast interrupts the rest", async () => {
    await run((host) => Effect.gen(function* () {
      const done: Array<string> = []
      const gate = yield* Deferred.make<void>()
      const slow = (name: string) => Deferred.await(gate).pipe(Effect.andThen(Effect.sync(() => { done.push(name) })), Effect.as(1))
      yield* host.install(listenerPlugin("l", (bus) => Effect.gen(function* () {
        yield* bus.on(Fan, () => Effect.fail("first"))
        yield* bus.on(Fan, () => slow("settled"))
        yield* bus.on(Fan, () => Effect.fail("second"))
        yield* bus.on(FanFast, () => Effect.never.pipe(Effect.onInterrupt(() => Effect.sync(() => { done.push("interrupted") }))))
        yield* bus.on(FanFast, () => Effect.fail("first"))
      })), as())
      yield* idle(host)
      const bus = yield* busOf(host)
      const seen = yield* Effect.forkChild(host.events.pipe(Stream.filter((e) => e.type === "listener-failed"), Stream.take(1), Stream.runCollect))
      const settling = yield* Effect.forkChild(Effect.exit(bus.parallel(Fan)))
      yield* Effect.sleep(5)
      yield* Deferred.succeed(gate, undefined)                       // the slow sibling finishes although a listener already failed
      const exit = yield* Fiber.join(settling)
      expect(Exit.isFailure(exit) && JSON.stringify(exit.cause)).toContain("first")
      expect(done).toEqual(["settled"])
      expect([...(yield* Fiber.join(seen))][0]).toMatchObject({ type: "listener-failed", message: "second" })
      done.length = 0
      const fast = yield* Effect.exit(bus.parallel(FanFast))
      expect(Exit.isFailure(fast) && Cause.squash(fast.cause)).toBe("first")
      expect(done).toEqual(["interrupted"])                          // the sibling was cut off
    }))
  })
})
