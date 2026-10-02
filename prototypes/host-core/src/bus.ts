// Bridger.Events (references/core behaviour 16): typed keys, scoped listeners, four dispatch modes.
// Phase-P4 prototype — not product code. The listener list stands in for the ContributionRegistry
// of behaviour 19 (phase P5): priority, then a zero-padded contribution ID, descending for `prepend`.
import { Cause, Context, Deferred, Effect, Exit, Fiber, Option, Scope } from "effect"
import { Actor, CurrentActor } from "./gxp.js"

export interface EventKey<Args extends ReadonlyArray<unknown>, Result, E> {
  readonly id: string
  readonly _types?: (args: Args) => [Result, E]
}
/** `Event.make<Args, Result, E>()(id)` (BEH-BR-138); identifiers follow `domain/action`. */
export const Event = {
  make: <Args extends ReadonlyArray<unknown>, Result, E = never>() => (id: string): EventKey<Args, Result, E> => ({ id })
}

interface Contribution {
  readonly cid: string
  readonly priority: number
  readonly kind: "on" | "around"
  readonly fn: (...a: Array<any>) => Effect.Effect<any, any>
  readonly running: Set<Fiber.Fiber<any, any>>
  idle?: Deferred.Deferred<void>
}

export interface ListenerOptions { readonly priority?: number; readonly prepend?: boolean }
export interface EventBus {
  readonly on: <Args extends ReadonlyArray<unknown>, Result, E>(
    event: EventKey<Args, Result, E>, listener: (...args: Args) => Effect.Effect<Result, E>, options?: ListenerOptions
  ) => Effect.Effect<void, never, Scope.Scope>
  readonly around: <Args extends ReadonlyArray<unknown>, Result, E>(
    event: EventKey<Args, Result, E>, listener: (args: Args, next: Effect.Effect<Result, E>) => Effect.Effect<Result, E>, options?: ListenerOptions
  ) => Effect.Effect<void, never, Scope.Scope>
  readonly emit: <Args extends ReadonlyArray<unknown>, R, E>(event: EventKey<Args, R, E>, ...args: Args) => Effect.Effect<void>
  readonly parallel: <Args extends ReadonlyArray<unknown>, R, E>(event: EventKey<Args, R, E>, ...args: Args) => Effect.Effect<ReadonlyArray<R>, E>
  readonly serial: <Args extends ReadonlyArray<unknown>, R, E>(event: EventKey<Args, R, E>, ...args: Args) => Effect.Effect<Option.Option<R>, E>
  readonly waterfall: <Args extends ReadonlyArray<unknown>, R, E>(event: EventKey<Args, R, E>, args: Args, final: Effect.Effect<R, E>) => Effect.Effect<R, E>
}

/** A base service: no plugin can provide or replace it (BEH-BR-137). */
export class Events extends Context.Service<Events, EventBus>()("@bridger/core/Events") {}

/** A listener interrupted because its plugin was removed during a dispatch (prototype choice; see RESULTS.md). */
export class ListenerRemoved extends Error { constructor(readonly eventId: string) { super(`listener of ${eventId} removed during dispatch`) } }

export const makeBus = (opts: {
  readonly drainTimeout: number
  readonly supervisor: Scope.Scope
  readonly onListenerFailed: (eventId: string, message: string) => Effect.Effect<void>
}) => {
  const lists = new Map<string, Array<Contribution>>()
  let counter = 0
  const WIDTH = 12
  const pad = (n: number) => String(n).padStart(WIDTH, "0")

  const register = (eventId: string, kind: "on" | "around", fn: Contribution["fn"], o: ListenerOptions = {}) => Effect.gen(function* () {
    const n = ++counter
    // Descending IDs for `prepend` sort before every ascending one of equal priority (BEH-BR-140).
    const cid = o.prepend ? `0${pad(10 ** WIDTH - 1 - n)}` : `1${pad(n)}`
    const c: Contribution = { cid, priority: o.priority ?? 0, kind, fn, running: new Set() }
    const list = [...(lists.get(eventId) ?? []), c].sort((a, b) => a.priority - b.priority || (a.cid < b.cid ? -1 : a.cid > b.cid ? 1 : 0))
    lists.set(eventId, list)
    // Lifetime is the registering scope (BEH-BR-139): removed, then running invocations drain or are interrupted.
    yield* Effect.addFinalizer(() => Effect.gen(function* () {
      lists.set(eventId, (lists.get(eventId) ?? []).filter((x) => x !== c))
      if (c.running.size === 0) return
      c.idle = yield* Deferred.make<void>()
      const ok = yield* Deferred.await(c.idle).pipe(Effect.as(true), Effect.timeoutOrElse({ duration: opts.drainTimeout, orElse: () => Effect.succeed(false) }))
      if (!ok) yield* Fiber.interruptAll([...c.running])
    }))
  })

  /** One invocation, in a child fiber that inherits the dispatcher's context, tracked so removal can drain it. */
  const invoke = <A, E>(eventId: string, c: Contribution, body: Effect.Effect<A, E>): Effect.Effect<A, E> => Effect.gen(function* () {
    const fiber = yield* Effect.forkChild(body.pipe(Effect.provideService(CurrentActor, Actor.unattributed)))
    c.running.add(fiber)
    const exit = yield* Fiber.await(fiber).pipe(Effect.onInterrupt(() => Fiber.interrupt(fiber)))
    c.running.delete(fiber)
    if (c.running.size === 0 && c.idle) yield* Deferred.succeed(c.idle, undefined)
    if (Exit.isSuccess(exit)) return exit.value
    if (Cause.hasInterruptsOnly(exit.cause)) return yield* Effect.die(new ListenerRemoved(eventId))
    return yield* Effect.failCause(exit.cause)
  })

  const snapshot = (eventId: string, kind: "on" | "around") => (lists.get(eventId) ?? []).filter((c) => c.kind === kind)   // as of the dispatch start

  const bus: EventBus = {
    on: (event, listener, o) => register(event.id, "on", listener as Contribution["fn"], o),
    around: (event, listener, o) => register(event.id, "around", listener as Contribution["fn"], o),
    // Fire and forget (BEH-BR-141): returns once every listener fiber has started; failures never reach the emitter.
    emit: (event, ...args) => Effect.gen(function* () {
      for (const c of snapshot(event.id, "on")) {
        const run = invoke(event.id, c, c.fn(...args)).pipe(
          Effect.catchCause((cause) => Cause.hasInterruptsOnly(cause) ? Effect.void : Effect.gen(function* () {
            const message = String(Cause.squash(cause) instanceof Error ? (Cause.squash(cause) as Error).message : Cause.squash(cause))
            yield* Effect.logWarning(`listener of ${event.id} failed`, cause)
            yield* opts.onListenerFailed(event.id, message)
          })))
        yield* Effect.forkIn(run, opts.supervisor)
      }
    }),
    // Results in listener order; the first typed failure interrupts the rest (BEH-BR-142).
    parallel: (event, ...args) => Effect.forEach(snapshot(event.id, "on"), (c) => invoke(event.id, c, c.fn(...args)), { concurrency: "unbounded" }),
    serial: (event, ...args) => Effect.gen(function* () {
      for (const c of snapshot(event.id, "on")) {
        const r = yield* invoke(event.id, c, c.fn(...args))
        if (r !== undefined) return Option.some(r)
      }
      return Option.none()
    }),
    // Around listeners compose over `final`; `next` is not memoised (BEH-BR-143).
    waterfall: (event, args, final) => {
      const chain = snapshot(event.id, "around")
      const at = (i: number): Effect.Effect<any, any> => i === chain.length ? final : invoke(event.id, chain[i]!, Effect.suspend(() => chain[i]!.fn(args, at(i + 1))))
      return at(0)
    }
  }
  return bus
}
