// Phase-P4 scenarios for the typed event bus (behaviour 16, BEH-BR-137–144).
import { Cause, Context, Deferred, Effect, Exit, Fiber, Layer, Option, Stream } from "effect"
import { describe, expect, it } from "vitest"
import { Event, Events, ListenerRemoved, type EventBus } from "../src/bus.js"
import { CurrentActor } from "../src/gxp.js"
import { HeldPlugins } from "../src/host.js"
import type { AnyPlugin } from "../src/plugin.js"
import { journal, type Journal } from "./fixtures.js"
import { alice, as, run, stateIn } from "./p4fixtures.js"

const Posted = Event.make<[invoiceId: string], string | undefined, string>()("billing/invoice-posted")
const Price = Event.make<[sku: string], number, never>()("shop/price")
class Probe extends Context.Service<Probe, {}>()("example/Probe") {}

const failed = (exit: Exit.Exit<unknown, unknown>, tag: string) => Exit.isFailure(exit) && JSON.stringify(exit.cause).includes(tag)

/** A plugin that registers listeners on the bus for its activation. */
const listenerPlugin = (id: string, register: (bus: EventBus) => Effect.Effect<void, never, import("effect").Scope.Scope>): AnyPlugin => ({
  id, requires: [Events], provides: [],
  build: Layer.effectDiscard(Effect.gen(function* () { yield* register(yield* Events) })) as unknown as AnyPlugin["build"]
})
const busOf = (host: { use: <S, A>(k: Context.Key<any, S>, f: (s: S) => Effect.Effect<A>) => Effect.Effect<A, unknown> }) =>
  host.use(Events, (b) => Effect.succeed(b)) as Effect.Effect<EventBus, never>
const say = (j: Journal, line: string, result?: string) => (_: string) => j.push(line).pipe(Effect.as(result))

describe("event bus (behaviour 16)", () => {
  it("BEH-BR-137: the bus is a base service, obtained by requiring it, which no plugin can provide", async () => {
    await run((host) => Effect.gen(function* () {
      yield* host.install(listenerPlugin("l", () => Effect.void), as())
      yield* host.awaitIdle
      expect(yield* stateIn(host, "l")).toBe("active")
      const usurper: AnyPlugin = { id: "usurper", requires: [], provides: [Events], build: Layer.succeed(Events, {} as EventBus) as unknown as AnyPlugin["build"] }
      const exit = yield* Effect.exit(host.install(usurper, as()))
      expect(failed(exit, "DuplicateProvider") && failed(exit, `"providerId":"base"`)).toBe(true)
    }))
  })

  it("BEH-BR-139, 140: listeners run by priority, then registration, `prepend` first among equals; a stopped plugin's listeners are gone", async () => {
    const j = journal()
    await run((host) => Effect.gen(function* () {
      yield* host.install(listenerPlugin("a", (bus) => Effect.gen(function* () {
        yield* bus.on(Posted, say(j, "a1"))
        yield* bus.on(Posted, say(j, "a-late"), { priority: 10 })
        yield* bus.on(Posted, say(j, "a-early"), { priority: -1 })
      })), as())
      yield* host.install(listenerPlugin("b", (bus) => Effect.gen(function* () {
        yield* bus.on(Posted, say(j, "b1"))
        yield* bus.on(Posted, say(j, "b-prepend"), { prepend: true })
        yield* bus.on(Posted, say(j, "b-prepend-2"), { prepend: true })
      })), as())
      yield* host.awaitIdle
      const bus = yield* busOf(host)
      yield* bus.serial(Posted, "inv-1")
      expect(j.lines).toEqual(["a-early", "b-prepend-2", "b-prepend", "a1", "b1", "a-late"])
      j.lines.length = 0
      yield* host.remove("a", as())
      yield* bus.serial(Posted, "inv-2")
      expect(j.lines).toEqual(["b-prepend-2", "b-prepend", "b1"])
    }))
  })

  it("BEH-BR-141: emit returns once listeners are started; a failure never reaches the emitter and is reported as listener-failed", async () => {
    const j = journal()
    await run((host) => Effect.gen(function* () {
      const seen = yield* Effect.forkChild(host.events.pipe(Stream.filter((e) => e.type === "listener-failed"), Stream.take(1), Stream.runCollect))
      yield* host.install(listenerPlugin("l", (bus) => Effect.gen(function* () {
        yield* bus.on(Posted, () => Effect.fail("posting failed"))
        yield* bus.on(Posted, (id) => Effect.sleep(20).pipe(Effect.andThen(j.push(`slow ${id}`)), Effect.as(undefined)))
      })), as())
      yield* host.awaitIdle
      const bus = yield* busOf(host)
      yield* bus.emit(Posted, "inv-1")
      expect(j.lines).toEqual([])                                            // not awaited
      const events = [...(yield* Fiber.join(seen))]
      expect(events[0]).toMatchObject({ type: "listener-failed", event: "billing/invoice-posted", message: "posting failed" })
      yield* Effect.sleep(40)
      expect(j.lines).toEqual(["slow inv-1"])
    }))
  })

  it("BEH-BR-142: parallel returns results in listener order and fails on the first typed failure; serial stops at the first defined result", async () => {
    await run((host) => Effect.gen(function* () {
      const order: Array<string> = []
      yield* host.install(listenerPlugin("l", (bus) => Effect.gen(function* () {
        yield* bus.on(Price, () => Effect.sleep(30).pipe(Effect.as(1)))
        yield* bus.on(Price, () => Effect.succeed(2))
        yield* bus.on(Posted, () => Effect.sync(() => { order.push("first") }).pipe(Effect.as(undefined)))
        yield* bus.on(Posted, () => Effect.sync(() => { order.push("second") }).pipe(Effect.as("second wins")))
        yield* bus.on(Posted, () => Effect.sync(() => { order.push("third") }).pipe(Effect.as("never")))
      })), as())
      yield* host.awaitIdle
      const bus = yield* busOf(host)
      expect(yield* bus.parallel(Price, "sku")).toEqual([1, 2])               // listener order, not completion order
      expect(yield* bus.serial(Posted, "inv")).toEqual(Option.some("second wins"))
      expect(order).toEqual(["first", "second"])
      yield* host.install(listenerPlugin("m", (b) => b.on(Posted, () => Effect.fail("refused"))), as())
      yield* host.awaitIdle
      expect(failed(yield* Effect.exit(bus.parallel(Posted, "inv")), "refused")).toBe(true)
    }))
  })

  it("BEH-BR-143: waterfall composes around-listeners over the final effect; a listener that skips next short-circuits", async () => {
    await run((host) => Effect.gen(function* () {
      yield* host.install(listenerPlugin("l", (bus) => Effect.gen(function* () {
        yield* bus.around(Price, (_args, next) => next.pipe(Effect.map((p) => p * 2)))
        yield* bus.around(Price, ([sku], next) => sku === "free" ? Effect.succeed(0) : next.pipe(Effect.map((p) => p + 1)))
      })), as())
      yield* host.awaitIdle
      const bus = yield* busOf(host)
      expect(yield* bus.waterfall(Price, ["book"], Effect.succeed(10))).toBe(22)
      expect(yield* bus.waterfall(Price, ["free"], Effect.succeed(10))).toBe(0)
    }))
  })

  it("BEH-BR-144: listeners keep the dispatcher's HeldPlugins but run with CurrentActor reset to unattributed", async () => {
    await run((host) => Effect.gen(function* () {
      const seen: Array<{ actor: string; held: Array<string> }> = []
      yield* host.install({ id: "probe", requires: [], provides: [Probe], build: Layer.succeed(Probe, {}) as unknown as AnyPlugin["build"] }, as())
      yield* host.install(listenerPlugin("l", (bus) => bus.on(Posted, () => Effect.gen(function* () {
        seen.push({ actor: (yield* CurrentActor).id, held: [...(yield* HeldPlugins)] })
        return undefined
      }))), as())
      yield* host.awaitIdle
      const bus = yield* busOf(host)
      yield* host.use(Probe, () => bus.serial(Posted, "inv")).pipe(Effect.provideService(CurrentActor, alice))
      expect(seen).toEqual([{ actor: "bridger:unattributed", held: ["probe"] }])
    }))
  })

  it("BEH-BR-140: a listener whose plugin is removed mid-dispatch is drained, then interrupted under the drain limit", async () => {
    await run((host) => Effect.gen(function* () {
      const started = yield* Deferred.make<void>()
      yield* host.install(listenerPlugin("l", (bus) => bus.on(Posted, () => Deferred.succeed(started, undefined).pipe(Effect.andThen(Effect.never)))), as())
      yield* host.awaitIdle
      const bus = yield* busOf(host)
      const dispatch = yield* Effect.forkChild(bus.serial(Posted, "inv"))
      yield* Deferred.await(started)
      yield* host.remove("l", as())                                           // its scope closes; the running listener holds it up to drainTimeout
      const exit = yield* Fiber.await(dispatch)
      // What the dispatch returns is unspecified (finding G23); the prototype dies with ListenerRemoved.
      expect(Exit.isFailure(exit) && Cause.squash(exit.cause) instanceof ListenerRemoved).toBe(true)
    }), { options: { drainTimeout: 50 } })
  })
})
