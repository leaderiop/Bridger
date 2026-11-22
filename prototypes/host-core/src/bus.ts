// Bridger.Events (references/core behaviour 16): typed keys, scoped listeners, four dispatch modes.
// Phase-P4/P5 prototype — not product code. Each event's listeners live in a ContributionRegistry named after
// the event (BEH-BR-140, 162): priority, then a zero-padded contribution ID, descending for `prepend`.
import { Cause, Context, Effect, Option, Scope } from "effect"
import { ContributionUnavailable, LeaseRevoked } from "./errors.js"
import { Actor, CurrentActor } from "./gxp.js"
import { ActivePlugin } from "./active.js"
import { Annotations, CurrentAnnotations, isBag, type Annotations as Bag } from "./annotations.js"
import { AccessDenied, CurrentPlugin, PolicySeam, PrincipalReference, refOf, type AccessDecision, type AccessRequest, type DeclaredAccess, type PluginPrincipal, type PrincipalRef } from "./policy.js"
import * as Registry from "./registry.js"

/** The one dispatch mode an event is declared with (BEH-BR-138): the key fixes it, so a listener cannot be registered for a style the emitter never uses. */
export type EventMode = "emit" | "parallel" | "serial" | "waterfall"
export interface EventKey<Args extends ReadonlyArray<unknown>, Result, E, Mode extends EventMode = EventMode> {
  readonly id: string
  readonly mode: Mode
  readonly _types?: (args: Args) => [Result, E]
}
/** `Event.make<Args, Result, E>()(id, { mode })` (BEH-BR-138); identifiers follow `domain/action`. */
export const Event = {
  make: <Args extends ReadonlyArray<unknown>, Result, E = never>() => <const Mode extends EventMode>(id: string, o: { readonly mode: Mode }): EventKey<Args, Result, E, Mode> => ({ id, mode: o.mode })
}
/** The mode of an event is the key's; `on` serves the three `on` modes, `around` serves `waterfall` only (BEH-BR-139). */
type OnMode = "emit" | "parallel" | "serial"
/** A dispatch or registration through a key of another mode (reachable only through an untyped caller, BEH-BR-138). */
export class EventModeMismatch extends Error {
  constructor(readonly eventId: string, readonly declared: EventMode, readonly used: string) { super(`event ${eventId} is declared "${declared}" and was used as ${used}`) }
}

interface Listener { readonly kind: "on" | "around"; readonly fn: (...a: Array<any>) => Effect.Effect<any, any>; readonly owner?: PluginPrincipal; readonly ownerKey?: string }

export interface ListenerOptions { readonly priority?: number; readonly prepend?: boolean }
export interface EventBus {
  readonly on: <Args extends ReadonlyArray<unknown>, Result, E>(
    event: EventKey<Args, Result, E, OnMode>, listener: (...args: Args) => Effect.Effect<Result, E>, options?: ListenerOptions
  ) => Effect.Effect<void, never, Scope.Scope>
  readonly around: <Args extends ReadonlyArray<unknown>, Result, E>(
    event: EventKey<Args, Result, E, "waterfall">, listener: (args: Args, next: Effect.Effect<Result, E>) => Effect.Effect<Result, E>, options?: ListenerOptions
  ) => Effect.Effect<void, never, Scope.Scope>
  readonly emit: <Args extends ReadonlyArray<unknown>, R, E>(event: EventKey<Args, R, E, "emit">, ...args: Args) => Effect.Effect<void>
  readonly parallel: <Args extends ReadonlyArray<unknown>, R, E>(event: EventKey<Args, R, E, "parallel">, ...args: Args) => Effect.Effect<ReadonlyArray<R>, E>
  readonly serial: <Args extends ReadonlyArray<unknown>, R, E>(event: EventKey<Args, R, E, "serial">, ...args: Args) => Effect.Effect<Option.Option<R>, E>
  readonly waterfall: <Args extends ReadonlyArray<unknown>, R, E>(event: EventKey<Args, R, E, "waterfall">, args: Args, final: Effect.Effect<R, E>) => Effect.Effect<R, E>
}

/** A base service: no plugin can provide or replace it (BEH-BR-137). */
export class Events extends Context.Service<Events, EventBus>()("@bridger/core/Events") {}

/** A listener interrupted because its plugin was removed during a dispatch (prototype choice; see RESULTS.md). */
export class ListenerRemoved extends Error { constructor(readonly eventId: string) { super(`listener of ${eventId} removed during dispatch`) } }

export const makeBus = (opts: {
  readonly drainTimeout: number
  readonly supervisor: Scope.Scope
  readonly onListenerFailed: (eventId: string, message: string) => Effect.Effect<void>
  /** Round 2: the wired AccessPolicy (BEH-BR-264), and the dispatch hook for OnEvent triggers (BEH-BR-245, 251). */
  readonly access?: { readonly decide: (r: AccessRequest) => AccessDecision; readonly declaredFor: (p: PrincipalRef | undefined) => DeclaredAccess | undefined }
  readonly onDispatch?: (eventId: string, args: ReadonlyArray<unknown>, annotations: Bag) => Effect.Effect<void>
  /** Listener runs per owner, for the idle condition of BEH-BR-252 (G-P17, CCR-BR-029). */
  readonly onListenerRun?: (ownerKey: string, delta: 1 | -1) => void
}) => {
  const registries = new Map<string, Registry.Registry<Listener>>()
  /** The mode each event id was first used with; a key of another mode under that id is refused (BEH-BR-138). */
  const modes = new Map<string, EventMode>()
  const claim = (event: { readonly id: string; readonly mode: EventMode }, used: string, expect: ReadonlyArray<EventMode>) => Effect.suspend(() => {
    const seen = modes.get(event.id)
    if (!expect.includes(event.mode)) return Effect.die(new EventModeMismatch(event.id, event.mode, used))
    if (seen !== undefined && seen !== event.mode) return Effect.die(new EventModeMismatch(event.id, seen, `${used} with a key declared "${event.mode}"`))
    modes.set(event.id, event.mode)
    return Effect.void
  })
  let counter = 0
  const WIDTH = 12
  const pad = (n: number) => String(n).padStart(WIDTH, "0")
  /** The event's registry, made on first use in the bus's own scope, so it outlives every contributor. */
  const registryOf = (eventId: string) => Effect.suspend(() => {
    const r = registries.get(eventId)
    if (r) return Effect.succeed(r)
    return Registry.make<Listener>({ name: eventId, drainTimeout: opts.drainTimeout, report: false }).pipe(
      Effect.provideService(Scope.Scope, opts.supervisor),
      Effect.tap((made) => Effect.sync(() => { registries.set(eventId, made) })))
  })
  const register = (event: { readonly id: string; readonly mode: EventMode }, kind: Listener["kind"], fn: Listener["fn"], o: ListenerOptions = {}) => Effect.gen(function* () {
    const eventId = event.id
    yield* claim(event, kind === "on" ? "an `on` listener" : "an `around` listener", kind === "on" ? ["emit", "parallel", "serial"] : ["waterfall"])
    const p = yield* CurrentPlugin.get
    const active = yield* ActivePlugin
    const owner = Option.isSome(p) ? p.value : undefined
    if (opts.access) {
      const principal = owner ? refOf(owner) : undefined
      const d = opts.access.decide({ kind: "listen", event: eventId, style: kind, ...(principal ? { principal } : {}), ...(principal && opts.access.declaredFor(principal) ? { declared: opts.access.declaredFor(principal)! } : {}) })
      if (d !== "allow") return yield* Effect.die(new AccessDenied("listen", eventId, d.deny))
    }
    const n = ++counter
    // Descending IDs for `prepend` sort before every ascending one of equal priority (BEH-BR-140).
    const cid = o.prepend ? `0${pad(10 ** WIDTH - 1 - n)}` : `1${pad(n)}`
    yield* (yield* registryOf(eventId)).add(cid, { kind, fn, ...(owner ? { owner } : {}), ...(Option.isSome(active) ? { ownerKey: active.value.realm === "default" ? active.value.pluginId : `${active.value.pluginId}@${active.value.realm}` } : {}) }, { priority: o.priority ?? 0 })
      .pipe(Effect.provideService(PrincipalReference, Option.none()), Effect.provideService(PolicySeam, Option.none()), Effect.orDie)   // ids are unique; the bus's own registry is not policed twice
    // A listener is reported as `listener` only, never also as a contribution (BEH-BR-119).
    if (Option.isSome(active)) yield* active.value.report({ kind: "listener", event: eventId, priority: o.priority ?? 0 })
  })
  /** The listeners of one style as of the dispatch start (BEH-BR-140). */
  const snapshot = (eventId: string, kind: Listener["kind"], only?: string) => Effect.gen(function* () {
    const r = registries.get(eventId)
    if (!r) return { r: undefined, ids: [] as Array<string>, fns: [] as Array<Listener["fn"]> }
    const v = yield* r.view
    const es = v.entries.filter((e) => e.value.kind === kind && (only === undefined || e.value.ownerKey === only))
    return { r, ids: es.map((e) => e.id), fns: es.map((e) => e.value.fn) }
  })
  /**
   * One invocation holding its contribution, as a `use` does (BEH-BR-141). A listener whose plugin was removed
   * during the dispatch — revoked, or withdrawn before its turn — fails the dispatch with a defect (BEH-BR-142, G23).
   */
  const invoke = <A, E>(eventId: string, r: Registry.Registry<Listener>, cid: string, body: (fn: Listener["fn"]) => Effect.Effect<A, E>, ann: Bag): Effect.Effect<A, E> =>
    r.use(cid, (l) => Effect.acquireUseRelease(
      Effect.sync(() => { if (l.ownerKey) opts.onListenerRun?.(l.ownerKey, 1) }),
      () => body(l.fn),
      () => Effect.sync(() => { if (l.ownerKey) opts.onListenerRun?.(l.ownerKey, -1) })).pipe(Effect.provideService(CurrentActor, Actor.unattributed),
      // A listener runs under its owner's principal, with the dispatcher's "events" annotations only (BEH-BR-144, 292).
      Effect.provideService(PrincipalReference, l.owner ? Option.some(l.owner) : Option.none()),
      Effect.provideService(CurrentAnnotations, ann))).pipe(
      Effect.catchIf((e): e is ContributionUnavailable | LeaseRevoked => e instanceof ContributionUnavailable || e instanceof LeaseRevoked,
        () => Effect.die(new ListenerRemoved(eventId)))) as Effect.Effect<A, E>
  /** At every dispatch start: the emit access check, the "events" annotations, and the OnEvent trigger hook. */
  const begin = (event: { readonly id: string; readonly mode: EventMode }, mode: EventMode, args: ReadonlyArray<unknown>) => Effect.gen(function* () {
    const eventId = event.id
    yield* claim(event, `\`${mode}\``, [mode])
    if (opts.access) {
      const p = yield* CurrentPlugin.acting
      const d = opts.access.decide({ kind: "emit", event: eventId, mode, ...(Option.isSome(p) ? { principal: refOf(p.value) } : {}) })
      if (d !== "allow") return yield* Effect.die(new AccessDenied("emit", eventId, d.deny))
    }
    const cur = yield* CurrentAnnotations
    const ann = Annotations.filter(isBag(cur) ? cur : Annotations.empty, "events")
    if (opts.onDispatch) yield* opts.onDispatch(eventId, args, ann)
    return ann
  })
  const fireAndForget = (eventId: string, r: Registry.Registry<Listener>, ids: ReadonlyArray<string>, args: ReadonlyArray<unknown>, ann: Bag) => Effect.gen(function* () {
    for (const cid of ids) {
      const run = invoke(eventId, r, cid, (fn) => fn(...args), ann).pipe(
        Effect.catchCause((cause) => {
          const err = Cause.squash(cause)
          if (Cause.hasInterruptsOnly(cause) || err instanceof ListenerRemoved) return Effect.void   // removal is not a failure
          const message = err instanceof Error ? err.message : String(err)
          return Effect.logWarning(`listener of ${eventId} failed`, cause).pipe(Effect.andThen(opts.onListenerFailed(eventId, message)))
        }))
      yield* Effect.forkIn(run, opts.supervisor)
    }
  })

  const bus: EventBus & { readonly deliverHeld: (eventId: string, ownerKey: string, args: ReadonlyArray<unknown>, ann: Bag) => Effect.Effect<number> } = {
    on: (event, listener, o) => register(event, "on", listener as Listener["fn"], o),
    around: (event, listener, o) => register(event, "around", listener as Listener["fn"], o),
    emit: (event, ...args) => Effect.gen(function* () {
      const ann = yield* begin(event, "emit", args)
      const { r, ids } = yield* snapshot(event.id, "on")
      if (r) yield* fireAndForget(event.id, r, ids, args, ann)
    }),
    parallel: (event, ...args) => Effect.gen(function* () {
      const ann = yield* begin(event, "parallel", args)
      const { r, ids } = yield* snapshot(event.id, "on")
      return yield* Effect.forEach(ids, (cid) => invoke(event.id, r!, cid, (fn) => fn(...args), ann), { concurrency: "unbounded" })
    }),
    serial: (event, ...args) => Effect.gen(function* () {
      const ann = yield* begin(event, "serial", args)
      const { r, ids } = yield* snapshot(event.id, "on")
      for (const cid of ids) {
        const out = yield* invoke(event.id, r!, cid, (fn) => fn(...args), ann)
        if (out !== undefined) return Option.some(out)
      }
      return Option.none()
    }),
    waterfall: (event, args, final) => Effect.gen(function* () {
      const ann = yield* begin(event, "waterfall", args)
      const { r, ids } = yield* snapshot(event.id, "around")
      const at = (i: number): Effect.Effect<any, any> => i === ids.length ? final : invoke(event.id, r!, ids[i]!, (fn) => Effect.suspend(() => fn(args, at(i + 1))), ann)
      return yield* at(0)
    }),
    /** The held event of BEH-BR-251: once, emit semantics, to the woken plugin's `on` listeners only. */
    deliverHeld: (eventId, ownerKey, args, ann) => Effect.gen(function* () {
      const { r, ids } = yield* snapshot(eventId, "on", ownerKey)
      if (r) yield* fireAndForget(eventId, r, ids, args, ann)
      return ids.length
    })
  }
  return bus
}
