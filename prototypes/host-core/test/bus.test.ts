// Phase-P4 scenarios for the typed event bus (behaviour 16, BEH-BR-137–144).
import { Cause, Context, Deferred, Effect, Exit, Fiber, Layer, Option, Stream } from "effect"
import { describe, expect, it } from "vitest"
import { Event, EventModeMismatch, Events, ListenerRemoved, NextCalledTwice, type EventBus } from "../src/bus.js"
import { CurrentActor } from "../src/gxp.js"
import { HeldPlugins } from "../src/host.js"
import type { AnyPlugin } from "../src/plugin.js"
import { journal, type Journal } from "./fixtures.js"
import { alice, as, run, stateIn } from "./p4fixtures.js"
import { drive, idle } from "./fixtures.js"

const Posted = Event.make<[invoiceId: string], string | undefined, string>()("billing/invoice-posted", { mode: "serial" })
const PostedNote = Event.make<[invoiceId: string], string | undefined, string>()("billing/invoice-noted", { mode: "emit" })
const Audited = Event.make<[invoiceId: string], string | undefined, string>()("billing/invoice-audited", { mode: "parallel" })
const Quotes = Event.make<[sku: string], number, never>()("shop/quotes", { mode: "parallel" })
const Price = Event.make<[sku: string], number, never>()("shop/price", { mode: "waterfall" })
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
      yield* idle(host)
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
      yield* idle(host)
      const bus = yield* busOf(host)
      yield* bus.serial(Posted, "inv-1")
      expect(j.lines).toEqual(["a-early", "b-prepend-2", "b-prepend", "a1", "b1", "a-late"])
      j.lines.length = 0
      yield* drive(host, host.remove("a", as()))
      yield* bus.serial(Posted, "inv-2")
      expect(j.lines).toEqual(["b-prepend-2", "b-prepend", "b1"])
    }))
  })

  it("BEH-BR-141: emit returns once listeners are started; a failure never reaches the emitter and is reported as listener-failed", async () => {
    const j = journal()
    await run((host) => Effect.gen(function* () {
      const seen = yield* Effect.forkChild(host.events.pipe(Stream.filter((e) => e.type === "listener-failed"), Stream.take(1), Stream.runCollect))
      yield* host.install(listenerPlugin("l", (bus) => Effect.gen(function* () {
        yield* bus.on(PostedNote, () => Effect.fail("posting failed"))
        yield* bus.on(PostedNote, (id) => Effect.sleep(20).pipe(Effect.andThen(j.push(`slow ${id}`)), Effect.as(undefined)))
      })), as())
      yield* idle(host)
      const bus = yield* busOf(host)
      yield* bus.emit(PostedNote, "inv-1")
      expect(j.lines).toEqual([])                                            // not awaited
      const events = [...(yield* Fiber.join(seen))]
      expect(events[0]).toMatchObject({ type: "listener-failed", event: "billing/invoice-noted", message: "posting failed" })
      yield* Effect.sleep(40)
      expect(j.lines).toEqual(["slow inv-1"])
    }))
  })

  it("BEH-BR-142: parallel returns results in listener order and fails on the first typed failure; serial stops at the first defined result", async () => {
    await run((host) => Effect.gen(function* () {
      const order: Array<string> = []
      yield* host.install(listenerPlugin("l", (bus) => Effect.gen(function* () {
        yield* bus.on(Quotes, () => Effect.sleep(30).pipe(Effect.as(1)))
        yield* bus.on(Quotes, () => Effect.succeed(2))
        yield* bus.on(Posted, () => Effect.sync(() => { order.push("first") }).pipe(Effect.as(undefined)))
        yield* bus.on(Posted, () => Effect.sync(() => { order.push("second") }).pipe(Effect.as("second wins")))
        yield* bus.on(Posted, () => Effect.sync(() => { order.push("third") }).pipe(Effect.as("never")))
      })), as())
      yield* idle(host)
      const bus = yield* busOf(host)
      expect(yield* bus.parallel(Quotes, "sku")).toEqual([1, 2])               // listener order, not completion order
      expect(yield* bus.serial(Posted, "inv")).toEqual(Option.some("second wins"))
      expect(order).toEqual(["first", "second"])
      yield* host.install(listenerPlugin("m", (b) => b.on(Audited, () => Effect.fail("refused"))), as())
      yield* idle(host)
      expect(failed(yield* Effect.exit(bus.parallel(Audited, "inv")), "refused")).toBe(true)
    }))
  })

  it("BEH-BR-143: waterfall composes around-listeners over the final effect; a listener that skips next short-circuits", async () => {
    await run((host) => Effect.gen(function* () {
      yield* host.install(listenerPlugin("l", (bus) => Effect.gen(function* () {
        yield* bus.around(Price, (_args, next) => next.pipe(Effect.map((p) => p * 2)), { role: "observe" })
        yield* bus.around(Price, ([sku], next) => sku === "free" ? Effect.succeed(0) : next.pipe(Effect.map((p) => p + 1)), { role: "decide" })
      })), as())
      yield* idle(host)
      const bus = yield* busOf(host)
      expect(yield* bus.waterfall(Price, ["book"], Effect.succeed(10))).toBe(22)
      expect(yield* bus.waterfall(Price, ["free"], Effect.succeed(10))).toBe(0)
    }))
  })

  it("S74: the waterfall final step runs in the dispatcher's context, not the last listener's (unattributed actor)", async () => {
    await run((host) => Effect.gen(function* () {
      yield* host.install(listenerPlugin("l", (bus) => bus.around(Price, (_a, next) => next, { role: "observe" })), as())
      yield* idle(host)
      const bus = yield* busOf(host)
      const seen = yield* bus.waterfall(Price, ["book"], Effect.gen(function* () { return (yield* CurrentActor) === alice ? 1 : 0 })).pipe(Effect.provideService(CurrentActor, alice))
      expect(seen).toBe(1)
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
      yield* idle(host)
      const bus = yield* busOf(host)
      yield* host.use(Probe, () => bus.serial(Posted, "inv")).pipe(Effect.provideService(CurrentActor, alice))
      expect(seen).toEqual([{ actor: "bridger:unattributed", held: ["probe"] }])
    }))
  })

  it("BEH-BR-140: a listener whose plugin is removed mid-dispatch is drained, then interrupted under the drain limit", async () => {
    await run((host) => Effect.gen(function* () {
      const started = yield* Deferred.make<void>()
      yield* host.install(listenerPlugin("l", (bus) => bus.on(Posted, () => Deferred.succeed(started, undefined).pipe(Effect.andThen(Effect.never)))), as())
      yield* idle(host)
      const bus = yield* busOf(host)
      const dispatch = yield* Effect.forkChild(bus.serial(Posted, "inv"))
      yield* Deferred.await(started)
      yield* drive(host, host.remove("l", as()))                                           // its scope closes; the running listener holds it up to drainTimeout
      const exit = yield* Fiber.await(dispatch)
      // What the dispatch returns is unspecified (finding G23); the prototype dies with ListenerRemoved.
      expect(Exit.isFailure(exit) && Cause.squash(exit.cause) instanceof ListenerRemoved).toBe(true)
    }), { options: { drainTimeout: 50 } })
  })

  it("BEH-BR-138, 139: the mode belongs to the key; a listener or dispatch of another mode is a compile error, and for an untyped caller a defect naming the event", async () => {
    await run((host) => Effect.gen(function* () {
      yield* idle(host)
      const bus = yield* busOf(host)
      const scoped = <A, E>(e: Effect.Effect<A, E, import("effect").Scope.Scope>) => Effect.scoped(e)
      // @ts-expect-error a waterfall key cannot be registered with `on`
      const a = bus.on(Price, () => Effect.succeed(1))
      // @ts-expect-error an emit key cannot be registered with `around`
      const b = bus.around(PostedNote, (_a, next) => next, { role: "observe" })
      // @ts-expect-error a serial key cannot be dispatched with `waterfall`
      const c = bus.waterfall(Posted, ["x"], Effect.succeed(undefined))
      // @ts-expect-error a waterfall key cannot be dispatched with `emit`
      const d = bus.emit(Price, "sku")
      // @ts-expect-error a serial key cannot be dispatched with `parallel`
      const e = bus.parallel(Posted, "x")
      for (const attempt of [scoped(a), scoped(b), c, d, e]) {
        const exit = yield* Effect.exit(attempt as Effect.Effect<unknown, unknown>)
        expect(Exit.isFailure(exit) && Cause.squash(exit.cause) instanceof EventModeMismatch).toBe(true)
        expect(JSON.stringify(Exit.isFailure(exit) ? (Cause.squash(exit.cause) as Error).message : "")).toMatch(/billing\/invoice-(posted|noted)|shop\/price/)
      }
      // two key objects sharing an id with different modes: the second is refused
      yield* bus.serial(Posted, "x")
      const other = Event.make<[invoiceId: string], string | undefined, string>()("billing/invoice-posted", { mode: "parallel" })
      expect(Exit.isFailure(yield* Effect.exit(bus.parallel(other, "x")))).toBe(true)
    }))
  })

  it("BEH-BR-143: an observer that skips next does not veto (the bus runs the tail and reports it); next is once-only; a decider may answer without it", async () => {
    const tail: Array<string> = []
    const final = Effect.sync(() => { tail.push("final"); return 10 })
    await run((host) => Effect.gen(function* () {
      const seen = yield* Effect.forkChild(host.events.pipe(Stream.filter((e) => e.type === "listener-failed"), Stream.take(1), Stream.runCollect))
      yield* host.install(listenerPlugin("l", (bus) => Effect.gen(function* () {
        yield* bus.around(Price, ([sku]) => Effect.succeed(-1), { role: "observe", priority: 0 })
        yield* bus.around(Price, ([sku], next) => sku === "free" ? Effect.succeed(0) : next, { role: "decide", priority: 5 })
      })), as())
      yield* idle(host)
      const bus = yield* busOf(host)
      // observer (priority 0) skips next: the tail (the decider, then final) still runs, its result is the dispatch result
      expect(yield* bus.waterfall(Price, ["obs"], final)).toBe(10)
      expect(tail).toEqual(["final"])
      const events = [...(yield* Fiber.join(seen))]
      expect(events[0]).toMatchObject({ type: "listener-failed", event: "shop/price", message: "observer skipped next" })
      // the decider in the tail answers without next: final never runs
      tail.length = 0
      expect(yield* bus.waterfall(Price, ["free"], final)).toBe(0)
      expect(tail).toEqual([])
    }))
  })

  it("BEH-BR-143: calling next twice is a defect naming the event, and the tail ran once", async () => {
    const tail: Array<string> = []
    await run((host) => Effect.gen(function* () {
      yield* host.install(listenerPlugin("l", (bus) => bus.around(Price, (_a, next) => next.pipe(Effect.andThen(next)), { role: "decide" })), as())
      yield* idle(host)
      const bus = yield* busOf(host)
      const exit = yield* Effect.exit(bus.waterfall(Price, ["x"], Effect.sync(() => { tail.push("final"); return 1 })))
      expect(Exit.isFailure(exit) && Cause.squash(exit.cause) instanceof NextCalledTwice).toBe(true)
      expect(tail).toEqual(["final"])
    }))
  })
})
