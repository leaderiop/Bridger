// Bridger.Events (references/core behaviour 16): typed keys, scoped listeners, four dispatch modes.
// Phase-P4/P5 prototype — not product code. Each event's listeners live in a ContributionRegistry named after
// the event (BEH-BR-140, 162): priority, then a zero-padded contribution ID, descending for `prepend`.
import { Cause, Context, Effect, Exit, Option, Scope, Semaphore } from "effect"
import { ContributionUnavailable, LeaseRevoked } from "./errors.js"
import { Actor, CurrentActor } from "./gxp.js"
import { ActivePlugin } from "./active.js"
import { Annotations, CurrentAnnotations, isBag, type Annotations as Bag } from "./annotations.js"
import { AccessDenied, CurrentPlugin, PolicySeam, PrincipalReference, refOf, type AccessDecision, type AccessRequest, type DeclaredAccess, type PluginPrincipal, type PrincipalRef } from "./policy.js"
import * as Registry from "./registry.js"

/** The one dispatch mode an event is declared with (BEH-BR-138): the key fixes it, so a listener cannot be registered for a style the emitter never uses. */
export type EventMode = "emit" | "parallel" | "serial" | "waterfall"
/** What `parallel` does when a listener fails (BEH-BR-142): `settle` runs every listener to completion, `fail-fast` interrupts the rest. */
export type ParallelFailure = "settle" | "fail-fast"
export interface EventKey<Args extends ReadonlyArray<unknown>, Result, E, Mode extends EventMode = EventMode> {
  readonly id: string
  readonly mode: Mode
  /** `parallel` only: the number of listeners run at once (default: the host's `listenerConcurrency`). */
  readonly concurrency?: number
  /** `parallel` only (default "settle"). */
  readonly failure?: ParallelFailure
  readonly _types?: (args: Args) => [Result, E]
}
/** `Event.make<Args, Result, E>()(id, { mode })` (BEH-BR-138); identifiers follow `domain/action`. */
export const Event = {
  make: <Args extends ReadonlyArray<unknown>, Result, E = never>() => <const Mode extends EventMode>(id: string, o: { readonly mode: Mode } & (Mode extends "parallel" ? { readonly concurrency?: number; readonly failure?: ParallelFailure } : {})): EventKey<Args, Result, E, Mode> =>
    ({ id, mode: o.mode, ...("concurrency" in o && o.concurrency !== undefined ? { concurrency: o.concurrency } : {}), ...("failure" in o && o.failure !== undefined ? { failure: o.failure } : {}) })
}
/** The mode of an event is the key's; `on` serves the three `on` modes, `around` serves `waterfall` only (BEH-BR-139). */
type OnMode = "emit" | "parallel" | "serial"
/** The events whose listeners the running fiber is inside, outermost first (BEH-BR-144): the depth cap reads it. */
export const CurrentDispatchChain = Context.Reference<ReadonlyArray<string>>("@bridger/core/CurrentDispatchChain", { defaultValue: () => [] })
/** A listener re-emitted past `emitDepthCap` (BEH-BR-144): the defect names the chain. */
export class EmitDepthExceeded extends Error { constructor(readonly chain: ReadonlyArray<string>, readonly cap: number) { super(`emit depth ${cap} exceeded: ${chain.join(" -> ")}`) } }
/** A dispatch or registration through a key of another mode (reachable only through an untyped caller, BEH-BR-138). */
export class EventModeMismatch extends Error {
  constructor(readonly eventId: string, readonly declared: EventMode, readonly used: string) { super(`event ${eventId} is declared "${declared}" and was used as ${used}`) }
}

/** An `around` listener declares its role (BEH-BR-143): `observe` must run `next` and cannot veto, `decide` may answer without it. */
export type WaterfallRole = "observe" | "decide"
/** `next` run a second time in one listener invocation (BEH-BR-143): the tail runs once, the second call is a defect. */
export class NextCalledTwice extends Error { constructor(readonly eventId: string) { super(`next called twice by a listener of ${eventId}`) } }
interface Listener { readonly kind: "on" | "around"; readonly role?: WaterfallRole; readonly maxInFlight?: number; readonly serialised?: boolean; readonly pluginId?: string; readonly fn: (...a: Array<any>) => Effect.Effect<any, any>; readonly owner?: PluginPrincipal; readonly ownerKey?: string }

export interface ListenerOptions {
  readonly priority?: number; readonly prepend?: boolean
  /** BEH-BR-141: the most invocations of this listener in flight, running or queued; overrides `listenerConcurrency`. */
  readonly maxInFlight?: number
  /** BEH-BR-141: invocations run one at a time in the order `emit` started them, so a listener may rely on cross-emit order. */
  readonly serialised?: boolean
}
export interface AroundOptions extends ListenerOptions { readonly role: WaterfallRole }
export interface EventBus {
  readonly on: <Args extends ReadonlyArray<unknown>, Result, E>(
    event: EventKey<Args, Result, E, OnMode>, listener: (...args: Args) => Effect.Effect<Result, E>, options?: ListenerOptions
  ) => Effect.Effect<void, never, Scope.Scope>
  readonly around: <Args extends ReadonlyArray<unknown>, Result, E>(
    event: EventKey<Args, Result, E, "waterfall">, listener: (args: Args, next: Effect.Effect<Result, E>) => Effect.Effect<Result, E>, options: AroundOptions
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
  readonly onListenerFailed: (o: { readonly event: string; readonly listenerId: string; readonly pluginId?: string; readonly message: string }) => Effect.Effect<void>
  /** BEH-BR-141: an invocation dropped because the listener was at its bound; `ended` closes an overflow episode with its total. */
  readonly onListenerOverflow?: (o: { readonly event: string; readonly listenerId: string; readonly pluginId?: string; readonly bound: number; readonly dropped: number; readonly ended?: true }) => Effect.Effect<void>
  /** Default `maxInFlight` and `parallel` concurrency (BEH-BR-141, 142); default 64. */
  readonly listenerConcurrency?: number
  /** The deepest nest of listener re-dispatches (BEH-BR-144); default 16. */
  readonly emitDepthCap?: number
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
  const concurrencyDefault = opts.listenerConcurrency ?? 64
  const depthCap = opts.emitDepthCap ?? 16
  const register = (event: { readonly id: string; readonly mode: EventMode }, kind: Listener["kind"], fn: Listener["fn"], o: Partial<AroundOptions> & ListenerOptions = {}) => Effect.gen(function* () {
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
    yield* (yield* registryOf(eventId)).add(cid, { kind, ...(o.role ? { role: o.role } : {}), ...(o.maxInFlight !== undefined ? { maxInFlight: o.maxInFlight } : {}), ...(o.serialised ? { serialised: true } : {}), ...(Option.isSome(active) ? { pluginId: active.value.pluginId } : {}), fn, ...(owner ? { owner } : {}), ...(Option.isSome(active) ? { ownerKey: active.value.realm === "default" ? active.value.pluginId : `${active.value.pluginId}@${active.value.realm}` } : {}) }, { priority: o.priority ?? 0 })
      .pipe(Effect.provideService(PrincipalReference, Option.none()), Effect.provideService(PolicySeam, Option.none()), Effect.orDie)   // ids are unique; the bus's own registry is not policed twice
    // A listener is reported as `listener` only, never also as a contribution (BEH-BR-119).
    if (Option.isSome(active)) yield* active.value.report({ kind: "listener", event: eventId, id: cid, priority: o.priority ?? 0 })
  })
  /** The listeners of one style as of the dispatch start (BEH-BR-140). */
  const snapshot = (eventId: string, kind: Listener["kind"], only?: string) => Effect.gen(function* () {
    const r = registries.get(eventId)
    if (!r) return { r: undefined, ids: [] as Array<string>, fns: [] as Array<Listener["fn"]>, ls: [] as Array<Listener> }
    const v = yield* r.view
    const es = v.entries.filter((e) => e.value.kind === kind && (only === undefined || e.value.ownerKey === only))
    return { r, ids: es.map((e) => e.id), fns: es.map((e) => e.value.fn), ls: es.map((e) => e.value) }
  })
  /**
   * One invocation holding its contribution, as a `use` does (BEH-BR-141). A listener whose plugin was removed
   * during the dispatch — revoked, or withdrawn before its turn — fails the dispatch with a defect (BEH-BR-142, G23).
   */
  const invoke = <A, E>(eventId: string, r: Registry.Registry<Listener>, cid: string, body: (fn: Listener["fn"], l: Listener, cid: string) => Effect.Effect<A, E>, ann: Bag): Effect.Effect<A, E> =>
    r.use(cid, (l) => Effect.acquireUseRelease(
      Effect.sync(() => { if (l.ownerKey) opts.onListenerRun?.(l.ownerKey, 1) }),
      () => body(l.fn, l, cid),
      () => Effect.sync(() => { if (l.ownerKey) opts.onListenerRun?.(l.ownerKey, -1) })).pipe(Effect.provideService(CurrentActor, Actor.unattributed),
      // A listener runs under its owner's principal, with the dispatcher's "events" annotations only (BEH-BR-144, 292).
      Effect.provideService(PrincipalReference, l.owner ? Option.some(l.owner) : Option.none()),
      Effect.provideService(CurrentAnnotations, ann),
      Effect.updateService(CurrentDispatchChain, (c) => [...c, eventId]))).pipe(
      Effect.catchIf((e): e is ContributionUnavailable | LeaseRevoked => e instanceof ContributionUnavailable || e instanceof LeaseRevoked,
        () => Effect.die(new ListenerRemoved(eventId)))) as Effect.Effect<A, E>
  /** At every dispatch start: the emit access check, the "events" annotations, and the OnEvent trigger hook. */
  const begin = (event: { readonly id: string; readonly mode: EventMode }, mode: EventMode, args: ReadonlyArray<unknown>) => Effect.gen(function* () {
    const eventId = event.id
    yield* claim(event, `\`${mode}\``, [mode])
    const chain = yield* CurrentDispatchChain
    if (chain.length >= depthCap) return yield* Effect.die(new EmitDepthExceeded([...chain, eventId], depthCap))
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
  /** Per listener: the invocations in flight, the drops of the current overflow episode, and the mailbox of a serialised listener. */
  const droppedTotal = new Map<string, number>()   // cumulative drops per listener, for `inspect` (BEH-BR-141)
  const flight = new Map<string, { n: number; dropped: number; mailbox?: Semaphore.Semaphore }>()
  const fireAndForget = (eventId: string, r: Registry.Registry<Listener>, ids: ReadonlyArray<string>, ls: ReadonlyArray<Listener>, args: ReadonlyArray<unknown>, ann: Bag) => Effect.gen(function* () {
    for (const [i, cid] of ids.entries()) {
      const l = ls[i]
      const key = `${eventId}\0${cid}`
      const bound = l?.maxInFlight ?? concurrencyDefault
      const st = flight.get(key) ?? { n: 0, dropped: 0 }
      if (st.n >= bound) {
        st.dropped++; flight.set(key, st); droppedTotal.set(key, (droppedTotal.get(key) ?? 0) + 1)
        if (st.dropped === 1 && opts.onListenerOverflow) yield* opts.onListenerOverflow({ event: eventId, listenerId: cid, ...(l?.pluginId ? { pluginId: l.pluginId } : {}), bound, dropped: 1 })
        continue
      }
      st.n++; flight.set(key, st)
      if (l?.serialised && !st.mailbox) st.mailbox = Semaphore.makeUnsafe(1)
      const body = invoke(eventId, r, cid, (fn) => fn(...args), ann)
      const run = (st.mailbox ? st.mailbox.withPermit(body) : body).pipe(
        Effect.catchCause((cause) => {
          const err = Cause.squash(cause)
          if (Cause.hasInterruptsOnly(cause) || err instanceof ListenerRemoved) return Effect.void   // removal is not a failure
          const message = err instanceof Error ? err.message : String(err)
          return Effect.logWarning(`listener of ${eventId} failed`, cause).pipe(Effect.andThen(opts.onListenerFailed({ event: eventId, listenerId: cid, ...(l?.pluginId ? { pluginId: l.pluginId } : {}), message })))
        }),
        Effect.ensuring(Effect.suspend(() => {
          st.n--
          const ended = st.n < bound && st.dropped > 0 ? st.dropped : 0
          if (ended) st.dropped = 0
          if (st.n === 0 && st.dropped === 0) flight.delete(key)
          return ended && opts.onListenerOverflow
            ? opts.onListenerOverflow({ event: eventId, listenerId: cid, ...(l?.pluginId ? { pluginId: l.pluginId } : {}), bound, dropped: ended, ended: true })
            : Effect.void
        })))
      yield* Effect.forkIn(run, opts.supervisor)
    }
  })

  const bus: EventBus & { readonly droppedOf: (eventId: string, listenerId: string) => number; readonly deliverHeld: (eventId: string, ownerKey: string, args: ReadonlyArray<unknown>, ann: Bag) => Effect.Effect<number> } = {
    droppedOf: (eventId, listenerId) => droppedTotal.get(`${eventId}\0${listenerId}`) ?? 0,
    on: (event, listener, o) => register(event, "on", listener as Listener["fn"], o),
    around: (event, listener, o) => register(event, "around", listener as Listener["fn"], o),
    emit: (event, ...args) => Effect.gen(function* () {
      const ann = yield* begin(event, "emit", args)
      const { r, ids, ls } = yield* snapshot(event.id, "on")
      if (r) yield* fireAndForget(event.id, r, ids, ls, args, ann)
    }),
    parallel: (event, ...args) => Effect.gen(function* () {
      const ann = yield* begin(event, "parallel", args)
      const { r, ids, ls } = yield* snapshot(event.id, "on")
      const run = (cid: string) => invoke(event.id, r!, cid, (fn) => fn(...args), ann)
      const concurrency = event.concurrency ?? concurrencyDefault
      if (event.failure === "fail-fast") return yield* Effect.forEach(ids, run, { concurrency })
      // settle (default): every listener runs to completion; the first failure in listener order fails the dispatch, the others are reported (BEH-BR-142)
      const exits = yield* Effect.forEach(ids, (cid) => Effect.exit(run(cid)), { concurrency })
      const failures = exits.flatMap((x, i) => Exit.isFailure(x) ? [{ cause: x.cause, cid: ids[i]!, l: ls[i]! }] : [])
      for (const f of failures.slice(1)) {
        const err = Cause.squash(f.cause)
        if (!Cause.hasInterruptsOnly(f.cause) && !(err instanceof ListenerRemoved)) yield* opts.onListenerFailed({ event: event.id, listenerId: f.cid, ...(f.l.pluginId ? { pluginId: f.l.pluginId } : {}), message: err instanceof Error ? err.message : String(err) })
      }
      if (failures.length) return yield* Effect.failCause(failures[0]!.cause)
      return exits.map((x) => (x as Exit.Success<any, any>).value)
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
      const at = (i: number): Effect.Effect<any, any> => i === ids.length ? final : invoke(event.id, r!, ids[i]!, (fn, l, cid) => Effect.suspend(() => {
        let calls = 0
        const next = Effect.suspend(() => ++calls > 1 ? Effect.die(new NextCalledTwice(event.id)) : at(i + 1))
        // An observer that returned without `next` has not vetoed: the bus runs the tail and reports the skip (BEH-BR-143).
        return fn(args, next).pipe(Effect.flatMap((out) => l.role === "observe" && calls === 0
          ? opts.onListenerFailed({ event: event.id, listenerId: cid, ...(l.pluginId ? { pluginId: l.pluginId } : {}), message: "observer skipped next" }).pipe(Effect.andThen(next))
          : Effect.succeed(out)))
      }), ann)
      return yield* at(0)
    }),
    /** The held event of BEH-BR-251: once, emit semantics, to the woken plugin's `on` listeners only. */
    deliverHeld: (eventId, ownerKey, args, ann) => Effect.gen(function* () {
      const { r, ids, ls } = yield* snapshot(eventId, "on", ownerKey)
      if (r) yield* fireAndForget(eventId, r, ids, ls, args, ann)
      return ids.length
    })
  }
  return bus
}
