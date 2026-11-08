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

export interface EventKey<Args extends ReadonlyArray<unknown>, Result, E> {
  readonly id: string
  readonly _types?: (args: Args) => [Result, E]
}
/** `Event.make<Args, Result, E>()(id)` (BEH-BR-138); identifiers follow `domain/action`. */
export const Event = {
  make: <Args extends ReadonlyArray<unknown>, Result, E = never>() => (id: string): EventKey<Args, Result, E> => ({ id })
}

interface Listener { readonly kind: "on" | "around"; readonly fn: (...a: Array<any>) => Effect.Effect<any, any>; readonly owner?: PluginPrincipal; readonly ownerKey?: string }

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
  /** Round 2: the wired AccessPolicy (BEH-BR-264), and the dispatch hook for OnEvent triggers (BEH-BR-245, 251). */
  readonly access?: { readonly decide: (r: AccessRequest) => AccessDecision; readonly declaredFor: (p: PrincipalRef | undefined) => DeclaredAccess | undefined }
  readonly onDispatch?: (eventId: string, args: ReadonlyArray<unknown>, annotations: Bag) => Effect.Effect<void>
  /** Listener runs per owner, for the idle condition of BEH-BR-252 (G-P17, CCR-BR-029). */
  readonly onListenerRun?: (ownerKey: string, delta: 1 | -1) => void
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
  const begin = (eventId: string, mode: "emit" | "parallel" | "serial" | "waterfall", args: ReadonlyArray<unknown>) => Effect.gen(function* () {
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
    on: (event, listener, o) => register(event.id, "on", listener as Listener["fn"], o),
    around: (event, listener, o) => register(event.id, "around", listener as Listener["fn"], o),
    emit: (event, ...args) => Effect.gen(function* () {
      const ann = yield* begin(event.id, "emit", args)
      const { r, ids } = yield* snapshot(event.id, "on")
      if (r) yield* fireAndForget(event.id, r, ids, args, ann)
    }),
    parallel: (event, ...args) => Effect.gen(function* () {
      const ann = yield* begin(event.id, "parallel", args)
      const { r, ids } = yield* snapshot(event.id, "on")
      return yield* Effect.forEach(ids, (cid) => invoke(event.id, r!, cid, (fn) => fn(...args), ann), { concurrency: "unbounded" })
    }),
    serial: (event, ...args) => Effect.gen(function* () {
      const ann = yield* begin(event.id, "serial", args)
      const { r, ids } = yield* snapshot(event.id, "on")
      for (const cid of ids) {
        const out = yield* invoke(event.id, r!, cid, (fn) => fn(...args), ann)
        if (out !== undefined) return Option.some(out)
      }
      return Option.none()
    }),
    waterfall: (event, args, final) => Effect.gen(function* () {
      const ann = yield* begin(event.id, "waterfall", args)
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
