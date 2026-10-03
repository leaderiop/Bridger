// Bridger.Events (references/core behaviour 16): typed keys, scoped listeners, four dispatch modes.
// Phase-P4/P5 prototype — not product code. Each event's listeners live in a ContributionRegistry named after
// the event (BEH-BR-140, 162): priority, then a zero-padded contribution ID, descending for `prepend`.
import { Cause, Context, Effect, Option, Scope } from "effect"
import { ContributionUnavailable, LeaseRevoked } from "./errors.js"
import { Actor, CurrentActor } from "./gxp.js"
import * as Registry from "./registry.js"

export interface EventKey<Args extends ReadonlyArray<unknown>, Result, E> {
  readonly id: string
  readonly _types?: (args: Args) => [Result, E]
}
/** `Event.make<Args, Result, E>()(id)` (BEH-BR-138); identifiers follow `domain/action`. */
export const Event = {
  make: <Args extends ReadonlyArray<unknown>, Result, E = never>() => (id: string): EventKey<Args, Result, E> => ({ id })
}

interface Listener { readonly kind: "on" | "around"; readonly fn: (...a: Array<any>) => Effect.Effect<any, any> }

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
  const registries = new Map<string, Registry.Registry<Listener>>()
  let counter = 0
  const WIDTH = 12
  const pad = (n: number) => String(n).padStart(WIDTH, "0")
  /** The event's registry, made on first use in the bus's own scope, so it outlives every contributor. */
  const registryOf = (eventId: string) => Effect.suspend(() => {
    const r = registries.get(eventId)
    if (r) return Effect.succeed(r)
    return Registry.make<Listener>({ name: eventId, drainTimeout: opts.drainTimeout }).pipe(
      Effect.provideService(Scope.Scope, opts.supervisor),
      Effect.tap((made) => Effect.sync(() => { registries.set(eventId, made) })))
  })
  const register = (eventId: string, kind: Listener["kind"], fn: Listener["fn"], o: ListenerOptions = {}) => Effect.gen(function* () {
    const n = ++counter
    // Descending IDs for `prepend` sort before every ascending one of equal priority (BEH-BR-140).
    const cid = o.prepend ? `0${pad(10 ** WIDTH - 1 - n)}` : `1${pad(n)}`
    yield* (yield* registryOf(eventId)).add(cid, { kind, fn }, { priority: o.priority ?? 0 }).pipe(Effect.orDie)   // ids are unique
  })
  /** The listeners of one style as of the dispatch start (BEH-BR-140). */
  const snapshot = (eventId: string, kind: Listener["kind"]) => Effect.gen(function* () {
    const r = registries.get(eventId)
    if (!r) return { r: undefined, ids: [] as Array<string>, fns: [] as Array<Listener["fn"]> }
    const v = yield* r.view
    const es = v.entries.filter((e) => e.value.kind === kind)
    return { r, ids: es.map((e) => e.id), fns: es.map((e) => e.value.fn) }
  })
  /**
   * One invocation holding its contribution, as a `use` does (BEH-BR-141). A listener whose plugin was removed
   * during the dispatch — revoked, or withdrawn before its turn — fails the dispatch with a defect (BEH-BR-142, G23).
   */
  const invoke = <A, E>(eventId: string, r: Registry.Registry<Listener>, cid: string, body: (fn: Listener["fn"]) => Effect.Effect<A, E>): Effect.Effect<A, E> =>
    r.use(cid, (l) => body(l.fn).pipe(Effect.provideService(CurrentActor, Actor.unattributed))).pipe(
      Effect.catchIf((e): e is ContributionUnavailable | LeaseRevoked => e instanceof ContributionUnavailable || e instanceof LeaseRevoked,
        () => Effect.die(new ListenerRemoved(eventId)))) as Effect.Effect<A, E>

  const bus: EventBus = {
    on: (event, listener, o) => register(event.id, "on", listener as Listener["fn"], o),
    around: (event, listener, o) => register(event.id, "around", listener as Listener["fn"], o),
    // Fire and forget (BEH-BR-141): returns once every listener fiber has started; failures never reach the emitter.
    emit: (event, ...args) => Effect.gen(function* () {
      const { r, ids } = yield* snapshot(event.id, "on")
      for (const cid of ids) {
        const run = invoke(event.id, r!, cid, (fn) => fn(...args)).pipe(
          Effect.catchCause((cause) => {
            const err = Cause.squash(cause)
            if (Cause.hasInterruptsOnly(cause) || err instanceof ListenerRemoved) return Effect.void   // removal is not a failure
            const message = err instanceof Error ? err.message : String(err)
            return Effect.logWarning(`listener of ${event.id} failed`, cause).pipe(Effect.andThen(opts.onListenerFailed(event.id, message)))
          }))
        yield* Effect.forkIn(run, opts.supervisor)
      }
    }),
    // Results in listener order; the first typed failure interrupts the rest (BEH-BR-142).
    parallel: (event, ...args) => Effect.gen(function* () {
      const { r, ids } = yield* snapshot(event.id, "on")
      return yield* Effect.forEach(ids, (cid) => invoke(event.id, r!, cid, (fn) => fn(...args)), { concurrency: "unbounded" })
    }),
    serial: (event, ...args) => Effect.gen(function* () {
      const { r, ids } = yield* snapshot(event.id, "on")
      for (const cid of ids) {
        const out = yield* invoke(event.id, r!, cid, (fn) => fn(...args))
        if (out !== undefined) return Option.some(out)
      }
      return Option.none()
    }),
    // Around listeners compose over `final`; `next` is not memoised (BEH-BR-143).
    waterfall: (event, args, final) => Effect.gen(function* () {
      const { r, ids } = yield* snapshot(event.id, "around")
      const at = (i: number): Effect.Effect<any, any> => i === ids.length ? final : invoke(event.id, r!, ids[i]!, (fn) => Effect.suspend(() => fn(args, at(i + 1))))
      return yield* at(0)
    })
  }
  return bus
}
