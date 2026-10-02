// Prototype of the Bridger host core (references/core behaviours 02–13, 22–25): phases P1, P2 and P3.
//
// Deliberate simplifications (recorded in RESULTS.md):
//  - Operations are linearized per plugin (ADR-BR-038): no host-wide operation lock. An operator
//    operation in flight is a `Flight` run by a host fiber; an incoming call joins, supersedes or
//    conflicts with it (BEH-BR-072).
//  - No realms, children, optional dependencies, event bus or reconcile (phase P4).
//  - Configuration comes from a function source only (no ConfigProvider default); `ConfigInvalid`
//    carries a fixed message rather than per-path issues.
//  - Builds run concurrently in forked fibers, bounded by `concurrency`; stops take no slot.
import { Cause, Clock, Context, Deferred, Effect, Exit, Fiber, Layer, Option, Schedule, Schema, Scope, Semaphore, Stream, SubscriptionRef } from "effect"
import {
  CleanupError, Conflict, DependencyCycle, DrainTimeout, DuplicatePlugin, DuplicateProvider, HostClosed,
  InvalidDefinition, LeaseRevoked, LeaseTimeout, ServiceUnavailable, UnknownPlugin, WouldDeadlock,
  ActivationFailed, PluginRemoved, type InstallError, ReplaceError, Superseded, ConfigInvalid
} from "./errors.js"
import { PluginConfig, changedPaths } from "./config.js"
import { makeEvents, type HostEvent, type HostEventBody } from "./events.js"
import { PluginRuntime, type FailurePolicy } from "./runtime.js"
import { inFlight, legality, type FlightOp, type Op, type Outcome, type PluginState, type Row } from "./legality.js"
import {
  Actor, AuditSink, AuditUnavailable, CurrentActor, IdGenerator, OperationGate, OperationRejected, ReasonRequired, Unattributed,
  awaitWritten, defaultIdGenerator, makeWriter, type AttributionOptions, type DefinitionRef, type Draft, type Operation,
  type OperationContext, type OperationOptions, type SystemTransition
} from "./gxp.js"
import type { AnyPlugin, Keys, ServicesOf } from "./plugin.js"

// ------------------------------------------------------------------ public types
export type PluginSnapshot = { readonly id: string; readonly meta?: AnyPlugin["meta"] } & (
  | { readonly state: "waiting"; readonly missingServiceIds: ReadonlyArray<string> }
  | { readonly state: "starting"; readonly providerIds: ReadonlyArray<string> }
  | { readonly state: "active"; readonly providerIds: ReadonlyArray<string>; readonly health: "healthy" | "degraded" | "unknown" }
  | { readonly state: "stopping"; readonly reason: string; readonly parked: boolean }
  | { readonly state: "failed"; readonly failure: { readonly phase: string; readonly message: string }; readonly missingServiceIds: ReadonlyArray<string> }
  | { readonly state: "disabled" }
)
export interface HostSnapshot {
  readonly revision: number
  readonly plugins: ReadonlyArray<PluginSnapshot>
  readonly availableServiceIds: ReadonlyArray<string>
  readonly audit: "wired" | "unwired"
  readonly auditDegraded: boolean
  readonly auditDropped: number
}
export interface RemoveOptions extends OperationOptions { readonly drain?: number | "forever"; readonly force?: boolean }
export interface CloseReport {
  readonly stopped: ReadonlyArray<string>
  readonly failed: ReadonlyArray<{ readonly id: string; readonly cause: "cleanup" | "drain"; readonly message: string }>
  readonly forced: ReadonlyArray<string>
  readonly durationMs: number                 // measured with the Clock service (BEH-BR-106)
  readonly auditDegraded: boolean
}
export interface PluginInspection {
  readonly id: string
  readonly state: PluginState
  readonly requires: ReadonlyArray<string>
  readonly provides: ReadonlyArray<string>
  readonly background: ReadonlyArray<{ readonly name: string; readonly policy: FailurePolicy; readonly restarts: number; readonly running: boolean }>
  readonly leases: number
  readonly lastBuildMs?: number
  readonly parked: boolean
  readonly pending?: { readonly operation: string; readonly correlationId: string; readonly requestedRecordId?: string }
}
export interface PluginHandle {
  readonly id: string
  readonly awaitActive: Effect.Effect<void, ActivationFailed | PluginRemoved>
}
export interface Options {
  readonly base?: ReadonlyArray<readonly [Context.Key<any, any>, unknown]>
  readonly concurrency?: number
  readonly buildTimeout?: number     // ms
  readonly drainTimeout?: number     // ms
  readonly attribution?: AttributionOptions
  readonly auditTimeout?: number     // ms (default 10 s)
  readonly gateTimeout?: number      // ms (default 60 s)
  readonly auditCapacity?: number    // writer queue bound (default 1024)
  readonly config?: (id: string) => Effect.Effect<unknown, unknown>   // the configuration source (BEH-BR-098)
  readonly shutdownTimeout?: number  // ms (default 60 s)
  readonly eventBuffer?: number      // default 1024
  readonly onClose?: (report: CloseReport) => Effect.Effect<void>
}

/** Record id of the operator record that caused the work running in this fiber (for system records' causationId). */
export const CurrentCause = Context.Reference<string | undefined>("bridger/prototype/CurrentCause", { defaultValue: () => undefined })

/** `@bridger/core/HeldPlugins`: plugin ids leased by the current fiber (BEH-BR-088). */
export const HeldPlugins = Context.Reference<ReadonlySet<string>>("@bridger/core/HeldPlugins", { defaultValue: () => new Set<string>() })

// ------------------------------------------------------------------ internal state
interface Entry {
  readonly id: string
  def: AnyPlugin
  state: PluginState
  cleanupFailed: boolean
  failure?: { phase: string; message: string }
  stopReason?: string
  scope?: Scope.Closeable
  services?: Context.Context<any>
  providers: Map<string, string>              // captured serviceId → provider id ("base" for base services)
  leases: number
  holders: Set<Fiber.Fiber<unknown, unknown>>
  drained?: Deferred.Deferred<void>
  epoch: number                               // bumped whenever the target changes; a build of an older epoch is stale
  build?: Fiber.Fiber<void, never>
  order: number                               // registration order (FIFO among ready plugins)
  cause?: string                              // causation of the activation in flight
  stepRunning: boolean                        // a stop step is running (BEH-BR-078)
  parkedSystem: boolean                       // a dependency-loss stop parked after DrainTimeout (BEH-BR-074)
  // P2
  health?: "healthy" | "degraded" | "unknown"
  healthFails?: number
  failing?: boolean                           // a runtime failure transition is running (BEH-BR-094)
  pendingFailure?: string                     // a runtime failure signalled while still starting (BEH-BR-091)
  override?: { readonly raw: unknown }        // configuration override (BEH-BR-099)
  configValue?: unknown                       // decoded configuration of the current activation (latest)
  configRef?: SubscriptionRef.SubscriptionRef<unknown>
  background?: Array<{ name: string; policy: FailurePolicy; restarts: number; running: boolean }>
  lastBuildMs?: number
  healthFiber?: Fiber.Fiber<unknown, unknown>
}

const sid = (k: Context.Key<any, any>): string => (k as unknown as { key: string }).key
const msg = (u: unknown): string => (u instanceof Error ? u.message : String(u)).split("\n")[0]!.slice(0, 200)

export const make = (options: Options = {}) => Effect.gen(function* () {
  const hostScope = yield* Effect.scope
  // Activation scopes live under this scope, forked before the shutdown finalizer is registered: closing the
  // host scope therefore runs the dependents-first shutdown before any activation scope closes (BEH-BR-108).
  const pluginsScope = yield* Scope.fork(hostScope, "sequential")
  const lock = yield* Semaphore.make(1)          // short state critical sections
  // Per-plugin orders (ADR-BR-038). Keyed by plugin id; "@host" for calls that name no plugin.
  const admissions = new Map<string, Semaphore.Semaphore>()   // steps 1–7 of BEH-BR-188, in arrival order
  const opLocks = new Map<string, Semaphore.Semaphore>()      // linearization point and transition
  const steps = new Map<string, Semaphore.Semaphore>()        // one stop step at a time per plugin
  const semOf = (m: Map<string, Semaphore.Semaphore>, k: string) => {
    let x = m.get(k)
    if (!x) { x = Semaphore.makeUnsafe(1); m.set(k, x) }
    return x
  }
  const buildSem = yield* Semaphore.make(options.concurrency ?? 4)
  const buildTimeout = options.buildTimeout ?? 60_000
  const defaultDrain = options.drainTimeout ?? 30_000

  const entries = new Map<string, Entry>()
  const flights = new Map<string, Flight>()      // operator operations in flight, per plugin (BEH-BR-072)
  const base = new Map<string, { key: Context.Key<any, any>; service: unknown }>()
  for (const [k, s] of options.base ?? []) base.set(sid(k), { key: k, service: s })
  let order = 0
  let closed = false
  let closing = false
  let revision = 0
  // GxP ports, resolved once at construction (BEH-BR-015).
  const sinkOpt = yield* Effect.serviceOption(AuditSink)
  const gateOpt = yield* Effect.serviceOption(OperationGate)
  const ids = Option.getOrElse(yield* Effect.serviceOption(IdGenerator), () => defaultIdGenerator)
  const hostId = yield* ids.next
  const auditTimeout = options.auditTimeout ?? 10_000
  const gateTimeout = options.gateTimeout ?? 60_000
  const attribution = options.attribution ?? {}
  let degradedHook: (why: string) => Effect.Effect<void> = () => Effect.void
  const events = yield* makeEvents(hostId, options.eventBuffer ?? 1024)
  const emit = (body: HostEventBody, pluginId?: string) => events.emit(body, pluginId)
  const closedSignal = yield* Deferred.make<void>()
  const writer = Option.isSome(sinkOpt)
    ? yield* makeWriter({ sink: sinkOpt.value, hostId, ids, auditTimeout, capacity: options.auditCapacity ?? 1024, onDegraded: (w) => degradedHook(w) })
    : undefined
  const feed = yield* SubscriptionRef.make<HostSnapshot>({ revision: 0, plugins: [], availableServiceIds: [...base.keys()].sort(), audit: writer ? "wired" : "unwired", auditDegraded: false, auditDropped: 0 })
  const locked = <A, E, R>(e: Effect.Effect<A, E, R>) => Semaphore.withPermit(lock, e)

  // ---------------------------------------------------------------- resolution helpers
  const activeProvider = (serviceId: string): Option.Option<{ id: string; key: Context.Key<any, any>; service: unknown }> => {
    const b = base.get(serviceId)
    if (b) return Option.some({ id: "base", key: b.key, service: b.service })
    for (const e of entries.values()) {
      if (e.state !== "active" || !e.services || flights.has(e.id) || e.failing) continue   // not leasable while an operation or a runtime failure is in flight (BEH-BR-076, 094)
      const k = e.def.provides.find((p) => sid(p) === serviceId)
      if (k) return Option.some({ id: e.id, key: k, service: Context.getUnsafe(e.services, k) })
    }
    return Option.none()
  }
  const missing = (e: Entry): Array<string> => e.def.requires.map(sid).filter((s) => Option.isNone(activeProvider(s)))
  /** Plugins whose current activation captured `id` as a provider — including a stop parked before its close. */
  const holds = (e: Entry, id: string) => [...e.providers.values()].includes(id)
  const dependentsOf = (id: string): Array<Entry> =>
    [...entries.values()].filter((e) => (e.state === "active" || e.state === "starting" || e.state === "stopping") && holds(e, id))
  const transitiveDependents = (id: string, acc = new Set<string>()): Set<string> => {
    for (const d of dependentsOf(id)) if (!acc.has(d.id)) { acc.add(d.id); transitiveDependents(d.id, acc) }
    return acc
  }

  // ---------------------------------------------------------------- snapshots (BEH-BR-027..030)
  const snapshotOf = (): HostSnapshot => ({
    revision,
    plugins: [...entries.values()].sort((a, b) => a.order - b.order).map((e): PluginSnapshot => {
      const common = { id: e.id, ...(e.def.meta ? { meta: e.def.meta } : {}) }
      switch (e.state) {
        case "waiting": return { ...common, state: "waiting", missingServiceIds: missing(e) }
        case "starting": return { ...common, state: "starting", providerIds: [...new Set(e.providers.values())] }
        case "active": return { ...common, state: "active", providerIds: [...new Set(e.providers.values())], health: e.health ?? "unknown" }
        case "stopping": return { ...common, state: "stopping", reason: e.stopReason ?? "unknown", parked: e.parkedSystem || !!flights.get(e.id)?.parked }
        case "failed": return { ...common, state: "failed", failure: e.failure ?? { phase: "build", message: "" }, missingServiceIds: missing(e) }
        case "disabled": return { ...common, state: "disabled" }
      }
    }),
    availableServiceIds: [...base.keys(), ...[...entries.values()].filter((e) => e.state === "active").flatMap((e) => e.def.provides.map(sid))].sort(),
    audit: writer ? "wired" : "unwired",
    auditDegraded: writer?.state.degraded ?? false,
    auditDropped: writer?.state.dropped ?? 0
  })
  const lastStates = new Map<string, string>()
  const commit = Effect.gen(function* () {
    revision++
    for (const e of entries.values()) {
      const from = lastStates.get(e.id)
      if (from !== undefined && from !== e.state)
        yield* emit({ type: "state-changed", from, to: e.state, ...(e.state === "stopping" && e.stopReason ? { reason: e.stopReason } : {}) }, e.id)
      lastStates.set(e.id, e.state)
    }
    for (const id of [...lastStates.keys()]) if (!entries.has(id)) lastStates.delete(id)
    yield* SubscriptionRef.set(feed, snapshotOf())
  })
  degradedHook = (why) => emit({ type: "audit-degraded", message: why }).pipe(Effect.andThen(commit))

  /** A system record (BEH-BR-199): Actor.system, not gated, causation from the triggering record. */
  const systemRecord = (operation: SystemTransition, e: Entry, causationId: string | undefined, error?: { _tag: string; message: string }, extra: Partial<Draft> = {}): Effect.Effect<string | undefined> =>
    writer ? Effect.gen(function* () {
      const draft: Draft = {
        actor: Actor.system, correlationId: causationId ?? (yield* ids.next), operation, phase: "system",
        target: { id: e.id, realm: "default" }, after: { state: e.state, revision, ...defRef(e.def) },
        ...(causationId ? { causationId } : {}), ...(error ? { error } : {}), ...extra
      }
      return (yield* writer.enqueue(draft))?.recordId
    }) : Effect.succeed(undefined)
  const defRef = (d: AnyPlugin): DefinitionRef => ({ ...(d.meta?.version ? { version: d.meta.version } : {}), ...(d.meta?.digest ? { digest: d.meta.digest } : {}) })

  // ---------------------------------------------------------------- validation (BEH-BR-003, 018–020)
  const validate = (def: AnyPlugin, excluding?: string): Effect.Effect<void, InstallError> => Effect.suspend((): Effect.Effect<void, InstallError> => {
    if (!def.id || def.id.trim() !== def.id) return Effect.fail(new InvalidDefinition({ id: def.id, reason: "malformed id" }))
    const req = def.requires.map(sid), prov = def.provides.map(sid)
    if (new Set(req).size !== req.length || new Set(prov).size !== prov.length)
      return Effect.fail(new InvalidDefinition({ id: def.id, reason: "a key is listed twice" }))
    if (req.some((r) => prov.includes(r))) return Effect.fail(new InvalidDefinition({ id: def.id, reason: "requires a key it provides" }))
    if (def.health && def.health.failureThreshold < 1) return Effect.fail(new InvalidDefinition({ id: def.id, reason: "failureThreshold below 1" }))
    if (def.volatile?.length && !def.config) return Effect.fail(new InvalidDefinition({ id: def.id, reason: "volatile without config" }))
    if (def.volatile?.length && def.config) {
      const fields = (def.config as unknown as { fields?: Record<string, unknown> }).fields
      const unknownName = def.volatile.find((v) => !fields || !(v in fields))
      if (unknownName !== undefined) return Effect.fail(new InvalidDefinition({ id: def.id, reason: `volatile names no field: ${unknownName}` }))
    }
    if (excluding === undefined && entries.has(def.id)) return Effect.fail(new DuplicatePlugin({ id: def.id }))
    const others = [...entries.values()].filter((e) => e.id !== excluding && e.id !== def.id && e.state !== "disabled")
    for (const p of prov) {
      if (base.has(p)) return Effect.fail(new DuplicateProvider({ serviceId: p, providerId: "base" }))
      const owner = others.find((e) => e.def.provides.some((k) => sid(k) === p))
      if (owner) return Effect.fail(new DuplicateProvider({ serviceId: p, providerId: owner.id }))
    }
    // cycle: edge A → B when A requires a key B provides
    const defs = [...others.map((e) => e.def), def]
    const providerOf = new Map<string, string>()
    for (const d of defs) for (const k of d.provides) providerOf.set(sid(k), d.id)
    const edges = new Map(defs.map((d) => [d.id, d.requires.map((k) => providerOf.get(sid(k))).filter((x): x is string => !!x)]))
    const path: Array<string> = []
    const onPath = new Set<string>(), done = new Set<string>()
    const visit = (n: string): Array<string> | undefined => {
      if (onPath.has(n)) return [...path.slice(path.indexOf(n)), n]
      if (done.has(n)) return undefined
      onPath.add(n); path.push(n)
      for (const m of edges.get(n) ?? []) { const c = visit(m); if (c) return c }
      onPath.delete(n); path.pop(); done.add(n)
      return undefined
    }
    const cycle = visit(def.id)
    return cycle ? Effect.fail(new DependencyCycle({ path: cycle })) : Effect.void
  })

  // ---------------------------------------------------------------- activation (BEH-BR-033..040)
  /** Start every waiting plugin whose requirements are met, FIFO by registration. Call under `lock`. */
  const settle: Effect.Effect<void> = Effect.gen(function* () {
    if (closed) return
    let changed = false
    for (const e of [...entries.values()].sort((a, b) => a.order - b.order)) {
      if (e.state !== "waiting" || missing(e).length > 0) continue
      e.providers = new Map(e.def.requires.map((k) => [sid(k), Option.getOrThrow(activeProvider(sid(k))).id]))
      e.state = "starting"; e.epoch++; changed = true
      e.cause = yield* CurrentCause
      e.build = yield* Effect.forkIn(runBuild(e, e.epoch), hostScope)
    }
    if (changed) yield* commit
  })

  const runBuild = (e: Entry, epoch: number): Effect.Effect<void> => Semaphore.withPermit(buildSem, Effect.gen(function* () {
    // Captured services, with the KeyMismatch check (BEH-BR-038): same ServiceId, different key object.
    let ctx = Context.empty() as Context.Context<any>
    for (const k of e.def.requires) {
      const p = Option.getOrUndefined(activeProvider(sid(k)))
      if (!p || p.key !== k) {
        return yield* locked(Effect.gen(function* () {
          if (e.epoch !== epoch) return
          e.state = "failed"; e.failure = { phase: "activation", message: p ? `KeyMismatch ${sid(k)}` : `provider of ${sid(k)} left` }
          yield* commit
        }))
      }
      ctx = Context.add(ctx, k, p.service)
    }
    // Configuration is read and decoded afresh before build (BEH-BR-097, 099); a failure publishes nothing.
    let cfg: unknown = undefined
    if (e.def.config) {
      const raw = e.override ? Effect.succeed(e.override.raw) : options.config ? options.config(e.id) : Effect.succeed(undefined)
      const decoded = yield* Effect.exit(raw.pipe(Effect.flatMap((r) => Schema.decodeUnknownEffect(e.def.config!)(r))))
      if (Exit.isFailure(decoded)) {
        // The message names the plugin only: decode issues can quote the offending value (BEH-BR-103).
        const message = `configuration of ${e.id} does not decode against its schema`
        return yield* locked(Effect.gen(function* () {
          if (e.epoch !== epoch || e.state !== "starting") return
          e.state = "failed"; e.failure = { phase: "activation", message: `ConfigInvalid: ${message}` }
          yield* emit({ type: "config-rejected", message }, e.id)
          yield* commit
          yield* systemRecord("system-start", e, e.cause, { _tag: "ConfigInvalid", message })
        }))
      }
      cfg = decoded.value
    }
    const configRef = yield* SubscriptionRef.make<unknown>(cfg)
    ctx = Context.add(ctx, PluginConfig, { value: cfg, current: SubscriptionRef.get(configRef), changes: SubscriptionRef.changes(configRef) })
    e.background = []
    ctx = Context.add(ctx, PluginRuntime, runtimeFor(e, epoch))
    const scope = yield* Scope.fork(pluginsScope, "sequential")
    const memo = yield* Layer.makeMemoMap                       // fresh per activation (BEH-BR-036)
    yield* emit({ type: "build-started" }, e.id)
    const startedAt = yield* Clock.currentTimeMillis
    const exit = yield* Layer.buildWithMemoMap(e.def.build, memo, scope).pipe(
      Effect.provideContext(ctx),
      // A build, and the finalizers it registers, carry the plugin in HeldPlugins (BEH-BR-088, R11).
      Effect.provideService(HeldPlugins, new Set([e.id])),
      Effect.timeoutOrElse({ duration: buildTimeout, orElse: () => Effect.fail(new Error("build timeout")) }),
      Effect.exit)
    const durationMs = (yield* Clock.currentTimeMillis) - startedAt
    e.lastBuildMs = durationMs
    yield* emit({ type: "build-finished", durationMs, outcome: Exit.isSuccess(exit) ? "success" : Cause.hasInterruptsOnly(exit.cause) ? "interrupted" : "failure" }, e.id)
    let discard = false
    yield* locked(Effect.gen(function* () {
      if (e.epoch !== epoch || e.state !== "starting") { discard = true; return }   // stale (BEH-BR-039)
      // A runtime failure signalled during the build fails the activation; nothing is published (BEH-BR-091).
      if (Exit.isSuccess(exit) && e.pendingFailure !== undefined) {
        discard = true; e.state = "failed"; e.failure = { phase: "activation", message: e.pendingFailure }; e.pendingFailure = undefined
        yield* commit; return
      }
      if (Exit.isFailure(exit)) {
        discard = true; e.state = "failed"; e.failure = { phase: "build", message: msg(Cause.squash(exit.cause)) }
        yield* commit; yield* systemRecord("system-start", e, e.cause, { _tag: "ActivationFailed", message: e.failure.message }); return
      }
      const built = exit.value as Context.Context<any>
      const absent = e.def.provides.filter((k) => Option.isNone(Context.getOption(built, k)))
      if (absent.length) {
        discard = true; e.state = "failed"; e.failure = { phase: "activation", message: `did not provide ${absent.map(sid).join(", ")}` }
        yield* commit; return
      }
      e.scope = scope; e.services = built; e.state = "active"; e.failure = undefined   // atomic publication (BEH-BR-037)
      e.configRef = configRef; e.configValue = cfg; e.health = "unknown"; e.healthFails = 0
      yield* commit
      yield* systemRecord("system-start", e, e.cause)
      if (e.def.health) e.healthFiber = yield* Effect.forkIn(healthLoop(e, epoch, ctx), scope)
      yield* settle
    }))
    if (discard) yield* Scope.close(scope, Exit.void)
  }))

  // ---------------------------------------------------------------- runtime failure and health (BEH-BR-089..096)
  /** One Plugin.Runtime per activation, bound to its scope (BEH-BR-089). */
  const runtimeFor = (e: Entry, epoch: number): PluginRuntime["Service"] => ({
    background: (name, effect, o = {}) => Effect.gen(function* () {
      const scope = yield* Effect.scope                      // the activation scope, inside the build layer
      const policy = o.onFailure ?? "fail-plugin"
      const info = { name, policy, restarts: 0, running: true }
      e.background?.push(info)
      // "restart": retried on the given schedule, or a bounded, spaced default; exhaustion fails the plugin (BEH-BR-090).
      const body = policy === "restart"
        ? effect.pipe(Effect.tapError(() => Effect.sync(() => { info.restarts++ })),
            o.restart ? Effect.retry(o.restart as Schedule.Schedule<unknown, unknown>) : Effect.retry({ schedule: Schedule.spaced(100), times: 3 }))
        : effect
      const supervised = body.pipe(
        Effect.asVoid,
        Effect.catchCause((cause) => Cause.hasInterruptsOnly(cause)
          ? Effect.void                                       // the scope closing is not a failure
          : policy === "ignore"
            ? Effect.logError(`background ${name} failed`, cause).pipe(Effect.annotateLogs({ plugin: e.id }))
            : failRuntime(e, epoch, `background ${name}: ${msg(Cause.squash(cause))}`)),
        Effect.ensuring(Effect.sync(() => { info.running = false })),
        Effect.provideService(HeldPlugins, new Set<string>()))   // scope-owned fibers carry only their own leases (T14)
      yield* Effect.forkIn(supervised, scope)
    }),
    reportFailure: (cause) => failRuntime(e, epoch, msg(Cause.squash(cause)))
  })

  /** A runtime failure signal (BEH-BR-091): one transition per activation; later signals are logged only. */
  const failRuntime = (e: Entry, epoch: number, message: string): Effect.Effect<void> => locked(Effect.gen(function* () {
    if (e.epoch !== epoch || entries.get(e.id) !== e) return
    if (e.state === "starting") { e.pendingFailure ??= message; return }
    if (e.state !== "active" || e.failing || flights.has(e.id) || closing) {
      yield* Effect.logWarning(`runtime failure of ${e.id} ignored: already leaving service`)
      yield* emit({ type: "runtime-failure", message }, e.id)
      return
    }
    e.failing = true
    yield* commit                                              // hidden from new consumers at once (step 1)
    yield* Effect.forkIn(runtimeFailure(e, message), hostScope)
  }))

  /** BEH-BR-094: dependents first (a cascade with no caller), drain, close, end failed(runtime). */
  const runtimeFailure = (e: Entry, message: string) => Effect.gen(function* () {
    yield* emit({ type: "runtime-failure", message }, e.id)
    const rootId = yield* systemRecord("runtime-failure", e, undefined, { _tag: "RuntimeFailure", message })
    yield* Effect.exit(stopTree(e.id, "runtime-failure", {
      mode: "no-caller",
      land: (x) => { x.state = "failed"; x.failure = { phase: "runtime", message } }
    }).pipe(Effect.provideService(CurrentCause, rootId)))
    yield* locked(Effect.gen(function* () { e.failing = false; yield* commit; yield* settle }))
  })

  /** BEH-BR-092/093: checks only while active, as a short lease on the plugin; interrupted checks never count. */
  const healthLoop = (e: Entry, epoch: number, ctx: Context.Context<any>) => Effect.gen(function* () {
    const h = e.def.health!
    while (true) {
      yield* Effect.sleep(h.every)
      if (e.epoch !== epoch || e.state !== "active" || e.failing) return
      const self = yield* Effect.fiber
      yield* locked(Effect.sync(() => { e.leases++; e.holders.add(self as Fiber.Fiber<unknown, unknown>) }))
      const r = yield* Effect.exit(h.check.pipe(
        Effect.provideContext(ctx),
        Effect.timeoutOrElse({ duration: h.timeout, orElse: () => Effect.fail("health check timed out") }),
        Effect.ensuring(locked(Effect.gen(function* () {
          e.leases--; e.holders.delete(self as Fiber.Fiber<unknown, unknown>)
          if (e.leases === 0 && e.drained) yield* Deferred.succeed(e.drained, undefined)
        })))))
      if (Exit.isFailure(r) && Cause.hasInterruptsOnly(r.cause)) return
      if (Exit.isSuccess(r)) {
        e.healthFails = 0
        if (e.health !== "healthy") yield* locked(Effect.sync(() => { e.health = "healthy" }).pipe(Effect.andThen(commit)))
        continue
      }
      e.healthFails = (e.healthFails ?? 0) + 1
      if (e.healthFails >= h.failureThreshold) return yield* failRuntime(e, epoch, `health check failed ${e.healthFails} time(s)`)
      if (e.health !== "degraded") yield* locked(Effect.gen(function* () {
        e.health = "degraded"; yield* commit
        yield* systemRecord("health-degraded", e, undefined)
      }))
    }
  })

  // ---------------------------------------------------------------- stopping (BEH-BR-041..047, 085, 086)
  type StopFailure = DrainTimeout | CleanupError
  const forced = new Set<string>()
  /**
   * How a stop ends when its drain expires: "operator" fails the call and parks (BEH-BR-074, 079);
   * "no-caller" revokes (BEH-BR-095); "shutdown" waits until the overall deadline, then revokes
   * (BEH-BR-105, 107). Dependents inherit the mode of the stop that cascades into them.
   */
  interface StopOpts extends RemoveOptions {
    readonly mode?: "operator" | "no-caller" | "shutdown"
    readonly land?: (e: Entry) => void                     // final state, set in the revision the scope closes
    readonly hooks?: {
      readonly drainExpired?: (id: string, leases: number) => void
      readonly cleanupFailed?: (id: string, message: string) => void
      readonly stopped?: (id: string) => void
    }
  }
  let shutdownDeadline = 0
  const revoke = (e: Entry) => Effect.gen(function* () {
    forced.add(e.id)
    const leases = e.leases
    yield* Fiber.interruptAll([...e.holders])               // revoke (BEH-BR-086, 095, 107)
    yield* emit({ type: "lease-revoked", leases }, e.id)
    yield* systemRecord("lease-revoked", e, yield* CurrentCause)
  })
  /** Ends a parked operator intent (BEH-BR-080, 105): its own record, reservations released, overrides reverted. */
  const endIntent = (d: Entry, f: Flight, by: "cascade" | "shutdown") => Effect.gen(function* () {
    flights.delete(d.id)
    d.stopReason = by === "shutdown" ? "shutdown" : "dependency-loss"
    let paths: Array<string> = []
    if (f.overrideBefore) {
      paths = changedPaths(d.override?.raw, f.overrideBefore.value?.raw)
      d.override = f.overrideBefore.value                    // the last completed configuration (BEH-BR-101, T13)
    }
    yield* commit
    yield* emit({ type: "stop-resumed", by, endsIntent: f.op }, d.id)
    yield* systemRecord("intent-ended", d, yield* CurrentCause, undefined, {
      ...(f.causeId ? { endsIntentOf: f.causeId } : {}), ...(paths.length ? { configChange: { paths } } : {})
    })
  })

  /**
   * Stop one plugin's activation after its dependents; leaves the entry registered. Returns whether
   * this call stopped it. `cascadeFrom` is set when a provider's stop needs this dependent stopped:
   * the cascade waits for the dependent's running step and then stops it only if it still holds
   * that provider (BEH-BR-079); a parked stop is resumed under the cascade's options (BEH-BR-080).
   * Waits run only from a provider to its dependents, so step locks are taken in dependency order
   * and cannot cycle (INV-BR-030).
   */
  const stopTree = (id: string, reason: string, opts: StopOpts, cascadeFrom?: string, root: string = id): Effect.Effect<boolean, StopFailure> =>
    Effect.uninterruptibleMask((restore) => Effect.gen(function* () {
      const sem = semOf(steps, id)
      const limit = opts.drain ?? defaultDrain
      const timeoutOf = (leases: number) => new DrainTimeout({ id, leases, ...(root !== id ? { target: root } : {}) })
      // A cascade waits for the dependent's running transition step under its own drain limit (BEH-BR-079, R12).
      if (cascadeFrom !== undefined && limit !== "forever") {
        const got = yield* restore(sem.take(1).pipe(Effect.as(true), Effect.timeoutOrElse({ duration: limit, orElse: () => Effect.succeed(false) })))
        if (!got) {
          const e = entries.get(id)
          if (!opts.force && (opts.mode ?? "operator") === "operator" && !closing) {
            yield* emit({ type: "drain-timeout", leases: e?.leases ?? 0, ...(root !== id ? { target: root } : {}) }, id)
            return yield* Effect.fail(timeoutOf(e?.leases ?? 0))
          }
          if (e && e.leases > 0) yield* revoke(e)
          yield* restore(sem.take(1))
        }
      } else yield* restore(sem.take(1))
      return yield* restore(stopStep(id, reason, opts, cascadeFrom, root)).pipe(Effect.ensuring(sem.release(1)))
    }))

  const stopStep = (id: string, reason: string, opts: StopOpts, cascadeFrom: string | undefined, root: string): Effect.Effect<boolean, StopFailure> => Effect.gen(function* () {
    const e = entries.get(id)
    if (!e) return false
    if (cascadeFrom !== undefined && !holds(e, cascadeFrom)) return false    // its own step already released the provider
    // A build in flight is invalidated and allowed to settle; its result is discarded (BEH-BR-039).
    if (e.state === "starting") {
      const b = e.build
      // Parked in "stopping" (not "waiting") so that no other settle starts a second build meanwhile.
      yield* locked(Effect.sync(() => { e.epoch++; e.state = "stopping"; e.stopReason = reason }))
      if (b) yield* Fiber.await(b)
      return true
    }
    if (e.state !== "active" && e.state !== "stopping") return false
    if (e.state === "stopping" && !e.scope) return false                     // already closed by the step this call waited for
    e.stepRunning = true
    return yield* Effect.gen(function* () {
    // Hidden from new consumers in the revision the stop begins, before dependents stop (BEH-BR-042),
    // so no build started meanwhile — a dependent's own restart included — can capture it.
    const drained = yield* locked(Effect.gen(function* () {
      e.state = "stopping"; e.stopReason = reason; e.parkedSystem = false
      if (!e.drained || (yield* Deferred.isDone(e.drained))) e.drained = yield* Deferred.make<void>()
      if (e.leases === 0) yield* Deferred.succeed(e.drained, undefined)
      yield* commit
      return e.drained
    }))
    // Leaving `active` interrupts an in-flight health check; its lease ends with it, uncounted (BEH-BR-092, 093).
    if (e.healthFiber) { const hf = e.healthFiber; e.healthFiber = undefined; yield* Fiber.interrupt(hf) }
    // Dependents first, each fully stopped before the provider (BEH-BR-043).
    for (const d of dependentsOf(id).sort((a, b) => b.order - a.order)) {
      // A cascade that meets a parked operation resumes it and ends its intent (BEH-BR-080).
      yield* locked(Effect.gen(function* () {
        const pf = flights.get(d.id)
        // The intent ends now, and its own record says so, before the stop settles (BEH-BR-080, T1).
        if (pf?.parked) yield* endIntent(d, pf, "cascade")
        else if (d.parkedSystem) yield* emit({ type: "stop-resumed", by: "cascade" }, d.id)
      }))
      const childOpts: StopOpts = { ...opts, land: undefined }
      const r = yield* Effect.exit(stopTree(d.id, "dependency-loss", childOpts, id, root))
      if (Exit.isFailure(r)) {
        const err = Cause.squash(r.cause)
        if (err instanceof CleanupError) {
          // A dependent's cleanup failure is its own (failed, phase cleanup); the provider's stop continues (BEH-BR-046).
          opts.hooks?.cleanupFailed?.(d.id, err.message)
          yield* locked(Effect.gen(function* () { yield* commit; yield* systemRecord("system-stop", d, yield* CurrentCause, { _tag: "CleanupError", message: err.message }) }))
          continue
        }
        // Every dependency-loss stop this call started that has not settled parks with it (BEH-BR-079, R9).
        if (err instanceof DrainTimeout && d.state === "stopping")
          yield* locked(Effect.gen(function* () {
            d.parkedSystem = true; d.stopReason = "dependency-loss"; yield* commit
            yield* emit({ type: "stop-parked", leases: d.leases, ...(root !== d.id ? { target: root } : {}) }, d.id)
          }))
        return yield* Effect.failCause(r.cause)
      }
      if (!r.value) continue
      yield* locked(Effect.gen(function* () {
        if (d.state === "stopping") d.state = "waiting"
        d.parkedSystem = false
        yield* commit
        yield* systemRecord("system-stop", d, yield* CurrentCause)
      }))
      opts.hooks?.stopped?.(d.id)
    }
    // Drain leases (BEH-BR-085).
    const limit = opts.drain ?? defaultDrain
    const mode = opts.mode ?? "operator"
    if (limit !== "forever") {
      const ok = yield* Deferred.await(drained).pipe(
        Effect.as(true), Effect.timeoutOrElse({ duration: limit, orElse: () => Effect.succeed(false) }))
      if (!ok) {
        if (mode === "shutdown" || (closing && !opts.force)) {
          // Shutdown: report the drain shortfall, wait until the overall limit, then revoke (BEH-BR-105, 107).
          // Once shutdown has begun no stop parks: an operator stop is taken over the same way (BEH-BR-075).
          opts.hooks?.drainExpired?.(id, e.leases)
          const remaining = Math.max(0, shutdownDeadline - (yield* Clock.currentTimeMillis))
          const late = yield* Deferred.await(drained).pipe(Effect.as(true), Effect.timeoutOrElse({ duration: remaining, orElse: () => Effect.succeed(false) }))
          if (!late) { yield* revoke(e); yield* Deferred.await(drained) }
        } else if (opts.force || mode === "no-caller") {
          yield* revoke(e)
          yield* Deferred.await(drained)
        } else {
          yield* emit({ type: "drain-timeout", leases: e.leases, ...(root !== id ? { target: root } : {}) }, id)
          return yield* Effect.fail(new DrainTimeout({ id, leases: e.leases, ...(root !== id ? { target: root } : {}) }))
        }
      }
    } else yield* Deferred.await(drained)
    // Close the scope; a finalizer that fails leaves failed(cleanup) (BEH-BR-046).
    const scope = e.scope
    const closeExit = scope ? yield* Effect.exit(Scope.close(scope, Exit.void)) : Exit.void
    yield* locked(Effect.gen(function* () {
      e.scope = undefined; e.services = undefined; e.providers = new Map(); e.health = undefined
      if (Exit.isFailure(closeExit)) {
        e.state = "failed"; e.cleanupFailed = true
        // A runtime failure whose close fails ends in phase cleanup; the message records the stop (BEH-BR-094).
        e.failure = { phase: "cleanup", message: (reason === "runtime-failure" ? "during runtime failure: " : "") + msg(Cause.squash(closeExit.cause)) }
      } else opts.land?.(e)
      yield* commit
    }))
    if (Exit.isFailure(closeExit)) return yield* Effect.fail(new CleanupError({ id, message: msg(Cause.squash(closeExit.cause)) }))
    if (cascadeFrom === undefined) opts.hooks?.stopped?.(id)
    return true
    }).pipe(Effect.ensuring(Effect.sync(() => { e.stepRunning = false })))
  })

  // ---------------------------------------------------------------- operations (BEH-BR-017..024, 041..062, 065..077)
  const rowOf = (id: string): Row => {
    const e = entries.get(id)
    if (!e) return "unknown"
    if (e.state === "failed" && e.cleanupFailed) return "failed-cleanup"
    return e.state
  }
  const decided = (id: string, out: Outcome) => Effect.gen(function* () {
    switch (out.kind) {
      case "unknown-plugin": return yield* Effect.fail(new UnknownPlugin({ id }))
      case "duplicate-plugin": return yield* Effect.fail(new DuplicatePlugin({ id }))
      case "conflict": return yield* Effect.fail(new Conflict({ id, pending: out.pending }))
      default: return out.kind
    }
  })
  /** The state × operation table at the linearization point (BEH-BR-071). */
  const legal = (id: string, op: Op) => decided(id, legality(rowOf(id), op))
  /**
   * Step 4 only: definite refusals before the gate. A plugin with an operation in flight, or a
   * system stop, is decided at the linearization point instead (BEH-BR-072, 073).
   */
  const legalEarly = (id: string, op: Op) =>
    flights.has(id) || entries.get(id)?.state === "stopping" ? Effect.succeed("proceed" as const) : legal(id, op)
  /** Re-entrancy check (BEH-BR-088): fail fast when the caller holds a lease the operation would wait for. */
  const deadlockCheck = (id: string) => Effect.gen(function* () {
    const held = yield* HeldPlugins
    if (held.size === 0) return
    const affected = new Set([id, ...transitiveDependents(id)])
    for (const h of held) if (affected.has(h)) return yield* Effect.fail(new WouldDeadlock({ id: h }))
  })
  const stateOfId = (id: string) => ({ state: entries.get(id)?.state ?? "uninstalled", revision })
  const errorOf = (c: Cause.Cause<unknown>) => {
    const err = Cause.squash(c)
    return { _tag: (err as { _tag?: string })?._tag ?? "Defect", message: msg(err) }
  }

  // ---------------------------------------------------------------- calls and flights (BEH-BR-066..074, 200)
  /** An admitted call: passed steps 1–7, its `requested` record (if any) written. */
  interface Call {
    readonly correlationId: string
    readonly causeId: string | undefined
    readonly terminal: (phase: "completed" | "failed" | "superseded" | "joined", extra: Partial<Draft>) => Effect.Effect<void>
    /** Set once the call's intent is recorded or its outcome decided; before that, an interruption ends it `Interrupted`. */
    readonly intent: { value: boolean }
  }
  type Settlement = Exit.Exit<any, any>
  interface Caller { readonly call: Call; readonly done: Deferred.Deferred<Settlement>; readonly joined: boolean; readonly resumes?: string }
  type Target =
    | { readonly kind: "gone" }
    | { readonly kind: "swap"; readonly def: AnyPlugin; readonly disabled: boolean }
    | { readonly kind: "rebuild" }
    | { readonly kind: "disabled" }
  /** An operator operation in flight on one plugin, from its linearization point until it completes (BEH-BR-072). */
  interface Flight {
    op: FlightOp
    target: Target
    opts: RemoveOptions
    callers: Array<Caller>
    correlationId: string                       // of the call that owns it (joined records point here)
    causeId: string | undefined                 // causation for the system records of its transition
    parked: boolean                             // after DrainTimeout (BEH-BR-074)
    /** The override before the first change made under this intent; restored if the intent is ended (BEH-BR-101). */
    overrideBefore?: { readonly value: Entry["override"] }
    /** A resumer's override, stored only once it is decided after the stop settles (BEH-BR-101, T6). */
    deferredOverride?: () => void
    /** The value a reconfigure flight targets, for equal-value joins (BEH-BR-072). */
    reconfigureValue?: unknown
  }
  /** Store a call's override under the flight's intent, remembering the value before the first change. */
  const setOverride = (e: Entry, f: Flight | undefined, next: Entry["override"]) => {
    if (f && !f.overrideBefore) f.overrideBefore = { value: e.override }
    e.override = next
  }

  /** Settle one caller and write its terminal record — from the host's fiber, so a caller's interruption cannot skip it. */
  const finishCaller = (c: Caller, f: Flight | undefined, exit: Settlement, noop = false) => Effect.gen(function* () {
    c.call.intent.value = true
    const error = Exit.isFailure(exit) ? { error: errorOf(exit.cause) } : {}
    if (c.joined && f) yield* c.call.terminal("joined", { correlationId: f.correlationId, causationId: c.call.correlationId, ...error })   // BEH-BR-200
    else yield* c.call.terminal(Exit.isSuccess(exit) ? "completed" : "failed", { ...(noop ? { noop: true } : {}), ...(c.resumes ? { resumes: c.resumes } : {}), ...error })
    yield* Deferred.succeed(c.done, exit)
  })
  const supersede = (c: Caller, id: string, by: string | undefined) => Effect.gen(function* () {
    yield* c.call.terminal("superseded", { ...(by ? { causationId: by } : {}), error: { _tag: "Superseded", message: id } })
    yield* Deferred.succeed(c.done, Exit.fail(new Superseded({ id })))
  })

  const apply = (id: string, t: Target) => Effect.gen(function* () {
    const e = entries.get(id)
    if (!e) return
    switch (t.kind) {
      case "gone": entries.delete(id); yield* emit({ type: "plugin-removed" }, id); break   // a cleanup-failed plugin: the leak is acknowledged, not re-run (BEH-BR-047)
      case "swap": e.def = t.def; e.failure = undefined; e.cleanupFailed = false; e.override = undefined; e.state = t.disabled ? "disabled" : "waiting"; break
      case "rebuild": e.state = "waiting"; e.failure = undefined; break
      case "disabled": e.state = "disabled"; e.failure = undefined; break
    }
    yield* commit
    yield* settle
  })

  /**
   * The transition of a flight, in a host fiber (BEH-BR-066, 067). The stop step settles first; the
   * target is read afterwards, so a call that superseded the flight meanwhile redirects it without
   * interrupting the step (BEH-BR-069). Completion is decided under the plugin's operation order,
   * so no call is linearized between the transition's end and its callers' settlement.
   */
  const drive = (id: string, f: Flight): Effect.Effect<void> => Effect.gen(function* () {
    const e = entries.get(id)
    const skipStop = !e || (e.cleanupFailed && f.target.kind === "gone")
    const stop = yield* Effect.exit(skipStop ? Effect.succeed(false) : stopTree(id, f.op, f.opts))
    yield* Semaphore.withPermit(semOf(opLocks, id), Effect.gen(function* () {
      let result: Settlement = Exit.void
      if (Exit.isFailure(stop)) {
        result = stop
        if (Cause.squash(stop.cause) instanceof DrainTimeout) {
          f.parked = true                                      // intent stays pending (BEH-BR-074)
          yield* locked(commit)
          yield* emit({ type: "stop-parked", leases: entries.get(id)?.leases ?? 0 }, id)
        } else flights.delete(id)
      } else {
        flights.delete(id)
        if (closing) { result = Exit.fail(new HostClosed()); yield* locked(commit) }   // shutdown took over (BEH-BR-075)
        else { f.deferredOverride?.(); yield* locked(apply(id, f.target)) }
      }
      const callers = f.callers
      f.callers = []
      for (const c of callers) yield* finishCaller(c, f, result)
    }))
  }).pipe(Effect.provideService(CurrentCause, f.causeId))

  /**
   * BEH-BR-073: a running system stop on the plugin is waited for before the call is decided (no intent
   * yet, so the wait is interruptible). Returns "parked" when the plugin's system stop is parked — then
   * only a stopping operation may resume it (BEH-BR-074, R8, R10).
   */
  const awaitSystemStop = (id: string) => Effect.gen(function* () {
    const e = entries.get(id)
    if (!e || e.state !== "stopping" || flights.has(id)) return "none" as const
    if (e.parkedSystem && !e.stepRunning) return "parked" as const
    yield* Semaphore.withPermit(semOf(steps, id), Effect.void)               // the running step settles
    if (e.parkedSystem) return "parked" as const                            // it parked meanwhile: decided as parked
    yield* locked(Effect.gen(function* () {
      if (e.state === "stopping" && !e.scope && !flights.has(id)) { e.state = "waiting"; yield* commit; yield* settle }
    }))
    return "none" as const
  })

  /** Linearization of a stopping operation (remove, replace, restart, disable): BEH-BR-072 if one is in flight, else BEH-BR-071. */
  const flightOp = (id: string, op: FlightOp, target: (e: Entry) => Target, opts: RemoveOptions, call: Call, recheck: Effect.Effect<void, unknown> = Effect.void,
    override?: { readonly next: Entry["override"]; readonly value: unknown }) =>
    Effect.gen(function* () {
      const done = yield* Deferred.make<Settlement>()
      const me: Caller = { call, done, joined: false }
      const refuse = (err: unknown) => finishCaller(me, undefined, Exit.fail(err)).pipe(Effect.as(done))
      // Re-validation fails only this call and leaves an operation in flight unaffected (BEH-BR-072).
      // Waiting for a system stop to settle is interruptible: no intent is recorded yet (BEH-BR-067, 188).
      const pre = yield* Effect.exit(recheck.pipe(Effect.andThen(awaitSystemStop(id))))
      if (Exit.isFailure(pre)) {
        if (Cause.hasInterrupts(pre.cause)) return yield* Effect.interrupt
        yield* finishCaller(me, undefined, pre); return done
      }
      return yield* Effect.uninterruptible(Effect.gen(function* () {
      call.intent.value = true
      const e = entries.get(id)
      // Resuming a parked system stop is this call's intent: it owns the stop, then applies its target (R10).
      if (pre.value === "parked" && e && e.parkedSystem && !flights.has(id)) {
        e.parkedSystem = false; e.stopReason = op
        const nf: Flight = { op, target: target(e), opts, callers: [me], correlationId: call.correlationId, causeId: call.causeId, parked: false,
          ...(override ? { reconfigureValue: override.value, deferredOverride: () => setOverride(e, undefined, override.next) } : {}) }
        flights.set(id, nf)
        yield* emit({ type: "stop-resumed", by: "operator" }, id)
        yield* Effect.forkIn(drive(id, nf), hostScope)
        return done
      }
      const f = flights.get(id)
      if (f && f.parked) {
        // Joining or superseding a parked operation is a resumption: this call owns it and writes its own
        // completed/failed record; the parked call's record is final (BEH-BR-072, 074, R2).
        const raw = inFlight(f.op, op)
        const out = raw.kind === "join-if-equal" ? (changedPaths(f.reconfigureValue, override?.value).length === 0 ? { kind: "join" as const } : { kind: "supersede" as const }) : raw
        if (out.kind === "conflict") return yield* refuse(new Conflict({ id, pending: out.pending }))
        if (out.kind === "duplicate-plugin") return yield* refuse(new DuplicatePlugin({ id }))
        if (out.kind === "supersede") { f.op = op; f.target = target(entries.get(id)!) }
        if (override) { setOverride(entries.get(id)!, f, override.next); f.reconfigureValue = override.value }
        yield* emit({ type: "stop-resumed", by: "operator" }, id)
        // The resumer's terminal record links to the parked call's `requested` record (BEH-BR-200, T2).
        f.callers = [f.causeId ? { ...me, resumes: f.causeId } : me]; f.correlationId = call.correlationId; f.causeId = call.causeId
        f.parked = false; f.opts = opts
        yield* Effect.forkIn(drive(id, f), hostScope)
        return done
      }
      if (f) {
        const raw = inFlight(f.op, op)
        const out = raw.kind === "join-if-equal" ? (changedPaths(f.reconfigureValue, override?.value).length === 0 ? { kind: "join" as const } : { kind: "supersede" as const }) : raw
        if (out.kind === "conflict") return yield* refuse(new Conflict({ id, pending: out.pending }))
        if (out.kind === "duplicate-plugin") return yield* refuse(new DuplicatePlugin({ id }))
        // A reconfigure that joins or supersedes sets its value under the flight's intent (BEH-BR-072, 101).
        if (override) { setOverride(entries.get(id)!, f, override.next); f.reconfigureValue = override.value }
        if (out.kind === "join") f.callers.push({ call, done, joined: true })
        else {
          // Supersede: every caller of the earlier operation, joined ones included, completes with Superseded.
          const earlier = f.callers
          f.callers = [me]
          for (const c of earlier) yield* supersede(c, id, call.causeId)
          f.op = op; f.target = target(entries.get(id)!); f.correlationId = call.correlationId; f.causeId = call.causeId
        }
        return done
      }
      const kind = yield* Effect.exit(legal(id, op))
      if (Exit.isFailure(kind)) { yield* finishCaller(me, undefined, kind); return done }
      if (kind.value === "noop") { yield* finishCaller(me, undefined, Exit.void, true); return done }
      const nf: Flight = { op, target: target(entries.get(id)!), opts, callers: [me], correlationId: call.correlationId, causeId: call.causeId, parked: false }
      if (override) { setOverride(entries.get(id)!, nf, override.next); nf.reconfigureValue = override.value }
      flights.set(id, nf)
      yield* Effect.forkIn(drive(id, nf), hostScope)
      return done
      }))
    })

  /** Linearization of an operation that completes at its linearization point (install, retry, enable, …). */
  const immediate = <A>(call: Call, eff: Effect.Effect<{ readonly value: A; readonly noop?: boolean }, unknown>) => Effect.gen(function* () {
    const done = yield* Deferred.make<Settlement>()
    const exit = yield* Effect.exit(Effect.uninterruptible(eff.pipe(Effect.provideService(CurrentCause, call.causeId))))
    yield* finishCaller({ call, done, joined: false }, undefined, Exit.isSuccess(exit) ? Exit.succeed(exit.value.value) : exit, Exit.isSuccess(exit) && !!exit.value.noop)
    return done
  })

  type MutationError = HostClosed | Unattributed | ReasonRequired | AuditUnavailable | OperationRejected
  /**
   * The order of a mutating call (BEH-BR-188): HostClosed → attribution → latch → validation →
   * gate → requested record → WouldDeadlock → linearization point (re-validation, legality,
   * intent) → terminal record. Steps 1–7 run under the plugin's admission order, so WouldDeadlock
   * is decided before the call waits for anything a held lease could block (BEH-BR-088). The
   * linearization is short; a transition runs in a host fiber and the caller only awaits it.
   */
  const mutating = <A, E>(spec: {
    readonly operation: Operation
    readonly target?: string
    readonly options?: OperationOptions | undefined
    readonly definition?: DefinitionRef
    readonly validate: Effect.Effect<unknown, E>
    readonly linearize: (call: Call) => Effect.Effect<Deferred.Deferred<Settlement>>
    /** Fields every record of the call carries, read after validation (e.g. `configChange`, BEH-BR-197). */
    readonly extra?: () => Partial<Draft>
    /** The scope-close shutdown: Actor.system, exempt from attribution (BEH-BR-108). */
    readonly system?: boolean
  }): Effect.Effect<A, MutationError | E | WouldDeadlock | Conflict | Superseded | UnknownPlugin | DuplicatePlugin | DrainTimeout | CleanupError> => Effect.gen(function* () {
    const op = spec.operation
    const key = spec.target ?? "@host"
    const exempt = op === "shutdown" || op === "acknowledgeAuditDegraded"
    // Once a `requested` record is enqueued, a call interrupted before its intent changes nothing
    // and still ends with a terminal record: `failed`, error `Interrupted` (BEH-BR-067, 188).
    const pending: { owed?: Call["terminal"]; intent: { value: boolean } } = { intent: { value: false } }
    return yield* Effect.onInterrupt(Effect.gen(function* () {
    const call = yield* Semaphore.withPermit(semOf(admissions, key), Effect.gen(function* () {
      // 1. host closed (a shutdown joins the one in progress, BEH-BR-109)
      if ((closed || closing) && op !== "shutdown") return yield* Effect.fail(new HostClosed())
      // 2. attribution — the scope-close path is Actor.system and exempt (BEH-BR-108)
      const ctx: OperationContext = spec.system ? { actor: Actor.system } : spec.options?.context ?? { actor: yield* CurrentActor }
      const reserved = ctx.actor.id.startsWith("bridger:")
      if (!spec.system && (!ctx.actor.id.trim() || (attribution.require && reserved))) return yield* Effect.fail(new Unattributed({ operation: op }))
      if (!spec.system && (attribution.requireReason ?? []).includes(op) && !ctx.reason?.trim()) return yield* Effect.fail(new ReasonRequired({ operation: op }))
      const correlationId = ctx.correlationId ?? (yield* ids.next)
      // 3. latch
      if (writer?.state.degraded && !exempt) return yield* Effect.fail(new AuditUnavailable({ operation: op, message: "audit degraded" }))
      // 4. validation (no record on failure)
      yield* spec.validate
      const target = spec.target !== undefined ? { id: spec.target, realm: "default" } : undefined
      const base = { actor: ctx.actor, correlationId, operation: op, ...(ctx.reason ? { reason: ctx.reason } : {}), ...(target ? { target } : {}), ...(spec.extra?.() ?? {}) }
      const before = spec.target !== undefined ? { ...stateOfId(spec.target), ...(spec.definition ?? {}) } : undefined
      let causeId: string | undefined
      const terminal: Call["terminal"] = (phase, extra) => writer
        ? writer.enqueue({ ...base, phase, ...(causeId ? { causationId: causeId } : {}), ...(spec.target !== undefined ? { after: { ...stateOfId(spec.target), ...(spec.definition ?? {}) } } : {}), ...extra }).pipe(Effect.asVoid)
        : Effect.void
      // 5. gate — never for shutdown (BEH-BR-223); a defect or timeout is a refusal (BEH-BR-221).
      // 6. requested record — fail closed, except shutdown (BEH-BR-203, BEH-BR-110).
      // From the gate's approval to the enqueue of the `requested` record nothing may interrupt the call,
      // so an approval is never consumed without a record (BEH-BR-188, R1).
      const req = yield* Effect.uninterruptibleMask((restore) => Effect.gen(function* () {
        if (Option.isSome(gateOpt) && op !== "shutdown") {
          const verdict = yield* restore(gateOpt.value.authorize({ operation: op, actor: ctx.actor, correlationId, ...(ctx.reason ? { reason: ctx.reason } : {}), ...(target ? { target } : {}), ...(spec.definition ? { definition: spec.definition } : {}) }).pipe(
            Effect.timeoutOrElse({ duration: gateTimeout, orElse: () => Effect.fail(new OperationRejected({ operation: op, reason: "gate-timeout" })) }),
            Effect.as(undefined), Effect.catchCause((c) => {
              if (Cause.hasInterrupts(c) && !Cause.hasFails(c)) return Effect.failCause(c)
              const e = Cause.squash(c)
              return Effect.succeed(e instanceof OperationRejected ? e.reason : "gate-defect")
            }),
            // A caller interrupted while the gate decides leaves one `rejected` record (BEH-BR-221).
            Effect.onInterrupt(() => writer ? writer.enqueue({ ...base, phase: "rejected", error: { _tag: "OperationRejected", message: "caller-interrupted" } }) : Effect.void)))
          if (verdict !== undefined) {
            if (writer) yield* writer.enqueue({ ...base, phase: "rejected", error: { _tag: "OperationRejected", message: verdict } })
            return yield* Effect.fail(new OperationRejected({ operation: op, reason: verdict, ...(target ? { target } : {}) }))
          }
        }
        if (!writer) return undefined
        const r = yield* writer.enqueue({ ...base, phase: "requested", ...(before ? { before } : {}) })
        if (r) { causeId = r.recordId; pending.owed = terminal }
        return r
      }))
      if (writer) {
        // From here an interruption before the intent still owes a terminal record (BEH-BR-188).
        const ok = req ? yield* awaitWritten(req.written, auditTimeout) : false
        if (!ok && op !== "shutdown") {
          if (req) yield* writer.enqueue({ ...base, phase: "failed", causationId: req.recordId, error: { _tag: "AuditUnavailable", message: "requested record not written in time" } })
          return yield* Effect.fail(new AuditUnavailable({ operation: op, message: "requested record not written" }))
        }
        causeId = req?.recordId
      }
      // 7. WouldDeadlock — before any wait on the plugin's order, a step or a drain (BEH-BR-088, ADR-BR-038)
      if (spec.target !== undefined) {
        const dl = yield* Effect.exit(deadlockCheck(spec.target))
        if (Exit.isFailure(dl)) {
          yield* terminal("failed", { error: errorOf(dl.cause) })
          return yield* Effect.failCause(dl.cause)
        }
      }
      return { correlationId, causeId, terminal, intent: pending.intent } satisfies Call
    }))
    // 8. linearization point under the plugin's operation order; then await the outcome.
    const done = yield* Semaphore.withPermit(semOf(opLocks, key), spec.linearize(call))
    const exit = yield* Deferred.await(done)
    return Exit.isSuccess(exit) ? exit.value as A : yield* Effect.failCause(exit.cause)
    }), () => pending.owed && !pending.intent.value
      ? pending.owed("failed", { error: { _tag: "Interrupted", message: "caller interrupted before its intent was recorded" } })
      : Effect.void)
  })

  const handleOf = (id: string): PluginHandle => ({
    id,
    awaitActive: Effect.gen(function* () {
      while (true) {
        const e = entries.get(id)
        if (!e) return yield* Effect.fail(new PluginRemoved({ id }))
        if (e.state === "active") return
        if (e.state === "failed") return yield* Effect.fail(new ActivationFailed({ id, phase: e.failure?.phase ?? "build", message: e.failure?.message ?? "" }))
        yield* Effect.yieldNow
      }
    })
  })

  const install = (def: AnyPlugin, opts: OperationOptions & { readonly disabled?: boolean; readonly config?: unknown } = {}) => mutating<PluginHandle, InstallError | UnknownPlugin | Conflict>({
    operation: "install", target: def.id, options: opts, definition: defRef(def),
    validate: legalEarly(def.id, "install").pipe(Effect.andThen(validate(def))),     // registers nothing on error (BEH-BR-018)
    linearize: (call) => immediate(call, Effect.gen(function* () {
      yield* legal(def.id, "install"); yield* validate(def)
      return yield* locked(Effect.gen(function* () {
        entries.set(def.id, { id: def.id, def, state: opts.disabled ? "disabled" : "waiting", cleanupFailed: false, providers: new Map(), leases: 0, holders: new Set(), epoch: 0, order: order++, stepRunning: false, parkedSystem: false,
          ...(opts.config !== undefined ? { override: { raw: opts.config } } : {}) })
        yield* emit({ type: "plugin-installed" }, def.id)
        yield* commit
        yield* settle
        return { value: handleOf(def.id) }
      }))
    }))
  })

  const remove = (id: string, opts: RemoveOptions = {}) => mutating<void, UnknownPlugin | DuplicatePlugin | Conflict>({
    operation: "remove", target: id, options: opts, definition: entries.get(id) ? defRef(entries.get(id)!.def) : {},
    validate: legalEarly(id, "remove"),
    linearize: (call) => flightOp(id, "remove", () => ({ kind: "gone" }), opts, call)
  })

  const replace = (def: AnyPlugin, opts: RemoveOptions = {}) => {
    const check = validate(def, def.id).pipe(Effect.mapError((c) => new ReplaceError({ id: def.id, cause: c._tag })))
    return mutating<void, UnknownPlugin | DuplicatePlugin | Conflict | ReplaceError>({
      operation: "replace", target: def.id, options: opts, definition: defRef(def),
      validate: legalEarly(def.id, "replace").pipe(Effect.andThen(check)),           // before anything stops (BEH-BR-050)
      linearize: (call) => flightOp(def.id, "replace", (e) => ({ kind: "swap", def, disabled: e.state === "disabled" }), opts, call, check)
    })
  }

  const reactivate = (id: string) => locked(Effect.gen(function* () {
    const e = entries.get(id)!; e.state = "waiting"; e.failure = undefined; yield* commit; yield* settle
  }))

  /** retry and enable start a plugin that is not running; they conflict with everything in flight (BEH-BR-072). */
  const startOp = (id: string, op: "retry" | "enable", call: Call) => awaitSystemStop(id).pipe(
    Effect.andThen((sys) => immediate(call, Effect.gen(function* () {
    // retry and enable never resume a parked system stop (BEH-BR-073, R8).
    if (sys === "parked") return yield* Effect.fail(new Conflict({ id, pending: "dependency-loss" }))
    const f = flights.get(id)
    if (f) return yield* Effect.fail(new Conflict({ id, pending: f.op }))
    if ((yield* legal(id, op)) === "noop") return { value: undefined, noop: true }
    if (op === "enable") yield* validate(entries.get(id)!.def, id)                    // re-check (BEH-BR-062)
    yield* reactivate(id)
    return { value: undefined }
  }))))

  const retry = (id: string, opts: OperationOptions = {}) => mutating<void, UnknownPlugin | DuplicatePlugin | Conflict>({
    operation: "retry", target: id, options: opts, validate: legalEarly(id, "retry"), linearize: (call) => startOp(id, "retry", call)
  })

  const restart = (id: string, opts: RemoveOptions = {}) => mutating<void, UnknownPlugin | DuplicatePlugin | Conflict>({
    operation: "restart", target: id, options: opts, validate: legalEarly(id, "restart"),
    linearize: (call) => flightOp(id, "restart", () => ({ kind: "rebuild" }), opts, call)
  })

  const disable = (id: string, opts: RemoveOptions = {}) => mutating<void, UnknownPlugin | DuplicatePlugin | Conflict>({
    operation: "disable", target: id, options: opts, validate: legalEarly(id, "disable"),
    linearize: (call) => flightOp(id, "disable", () => ({ kind: "disabled" }), opts, call)
  })

  const enable = (id: string, opts: OperationOptions = {}) => mutating<void, UnknownPlugin | DuplicatePlugin | Conflict | InstallError>({
    operation: "enable", target: id, options: opts,
    validate: legalEarly(id, "enable").pipe(Effect.tap((k) => k === "proceed" && !flights.has(id) && entries.get(id)?.state === "disabled" ? validate(entries.get(id)!.def, id) : Effect.void)),
    linearize: (call) => startOp(id, "enable", call)
  })

  /**
   * reconfigure (BEH-BR-101, 102): decoded before anything stops; a volatile-only or empty change applies in place;
   * otherwise the same stop/start path as restart, with the override stored under the flight's intent.
   */
  const reconfigure = (id: string, config?: unknown, opts: OperationOptions = {}) => {
    const st: { decoded?: unknown; next?: Entry["override"]; paths: Array<string> } = { paths: [] }
    const decode = Effect.gen(function* () {
      const e = entries.get(id)
      if (!e) return yield* Effect.fail(new UnknownPlugin({ id }))
      const next = config === undefined ? undefined : { raw: config }
      const raw = next ? Effect.succeed(next.raw) : options.config ? options.config(id) : Effect.succeed(undefined)
      const decoded = e.def.config
        ? yield* raw.pipe(
            Effect.flatMap((r) => Schema.decodeUnknownEffect(e.def.config!)(r)),
            Effect.catchCause(() => Effect.gen(function* () {
              const message = `configuration of ${id} does not decode against its schema`
              yield* emit({ type: "config-rejected", message }, id)
              return yield* Effect.fail(new ConfigInvalid({ id, message }))
            })))
        : undefined
      st.decoded = decoded; st.next = next; st.paths = changedPaths(e.configValue, decoded)
    })
    return mutating<void, UnknownPlugin | DuplicatePlugin | Conflict | ConfigInvalid>({
      operation: "reconfigure", target: id, options: opts,
      extra: () => ({ configChange: { paths: st.paths } }),     // paths only, never values (BEH-BR-103)
      validate: legalEarly(id, "reconfigure").pipe(Effect.andThen(decode)),
      linearize: (call) => Effect.gen(function* () {
        const e = entries.get(id)
        if (e && !flights.has(id) && !e.failing) {
          if (e.state === "active") {
            const volatile = new Set(e.def.volatile ?? [])
            if (st.paths.every((p) => volatile.has(p))) return yield* immediate(call, Effect.gen(function* () {
              const sameOverride = (e.override === undefined) === (st.next === undefined) && changedPaths(e.override?.raw, st.next?.raw).length === 0
              e.override = st.next
              if (st.paths.length === 0) return { value: undefined, noop: sameOverride }
              e.configValue = st.decoded
              yield* SubscriptionRef.set(e.configRef!, st.decoded)
              yield* emit({ type: "config-updated", paths: st.paths }, id)
              return { value: undefined }
            }))
          }
          // waiting or disabled: store or clear the override for the next activation (BEH-BR-071).
          if (e.state === "waiting" || e.state === "disabled")
            return yield* immediate(call, Effect.sync(() => { e.override = st.next; return { value: undefined } }))
          if (e.state === "failed" && !e.cleanupFailed)
            return yield* immediate(call, Effect.gen(function* () { e.override = st.next; yield* reactivate(id); return { value: undefined } }))
        }
        return yield* flightOp(id, "reconfigure", () => ({ kind: "rebuild" }), { drain: defaultDrain }, call, Effect.void, { next: st.next, value: st.decoded })
      })
    })
  }

  /** Leaving the audit latch (BEH-BR-206): attributed, reason always required, its own record must be written. */
  const acknowledgeAuditDegraded = (opts: { readonly context: OperationContext }) => Effect.gen(function* () {
    if (!opts.context.reason?.trim()) return yield* Effect.fail(new ReasonRequired({ operation: "acknowledgeAuditDegraded" }))
    yield* mutating<void, never>({
      operation: "acknowledgeAuditDegraded", options: opts, validate: Effect.void,
      linearize: (call) => immediate(call, Effect.suspend(() => {
        if (writer) { writer.state.degraded = false; writer.state.droppedSinceAck = 0 }
        return locked(commit).pipe(Effect.andThen(emit({ type: "audit-acknowledged" })), Effect.as({ value: undefined }))
      }))
    })
  })

  // ---------------------------------------------------------------- leases (BEH-BR-081..088)
  const acquire = <K extends Keys>(keys: K, holder: Fiber.Fiber<unknown, unknown>) => Effect.gen(function* () {
    const sorted = [...keys].sort((a, b) => (sid(a) < sid(b) ? -1 : sid(a) > sid(b) ? 1 : 0))   // canonical order (BEH-BR-082)
    const claimed = yield* locked(Effect.gen(function* () {
      const found: Array<{ key: Context.Key<any, any>; id: string; service: unknown }> = []
      for (const k of sorted) {
        const p = Option.getOrUndefined(activeProvider(sid(k)))
        if (!p || closed) return yield* Effect.fail(new ServiceUnavailable({ serviceId: sid(k) }))   // all or nothing
        found.push({ ...p, key: k })
      }
      for (const f of found) { const e = entries.get(f.id); if (e) { e.leases++; e.holders.add(holder) } }
      return found
    }))
    yield* Effect.addFinalizer(() => locked(Effect.gen(function* () {
      for (const f of claimed) {
        const e = entries.get(f.id); if (!e) continue
        e.leases--; e.holders.delete(holder)
        if (e.leases === 0 && e.drained) yield* Deferred.succeed(e.drained, undefined)
      }
    })))
    const byId = new Map(claimed.map((c) => [sid(c.key), c]))
    return { services: keys.map((k) => byId.get(sid(k))!.service) as unknown as ServicesOf<K>, ids: claimed.map((c) => c.id).filter((i) => i !== "base") }
  })

  const lease = <K extends Keys>(keys: K) => Effect.gen(function* () {
    const self = yield* Effect.fiber
    return (yield* acquire(keys, self)).services
  })

  const useAll = <K extends Keys, A, E, R>(keys: K, run: (services: ServicesOf<K>) => Effect.Effect<A, E, R>, opts: { readonly timeout?: number } = {}) =>
    Effect.scoped(Effect.gen(function* () {
      const callerHeld = yield* HeldPlugins
      const gate = yield* Deferred.make<void>()
      const box: { services?: ServicesOf<K>; ids?: Array<string> } = {}
      // The child, not the caller, is the lease holder, so a force interrupts the child only (BEH-BR-084).
      // It carries HeldPlugins = caller's ∪ the leased providers, for re-entrancy detection (BEH-BR-088).
      const child = yield* Effect.forkChild(Effect.gen(function* () {
        yield* Deferred.await(gate)
        return yield* run(box.services!).pipe(Effect.provideService(HeldPlugins, new Set([...callerHeld, ...box.ids!])))
      }))
      const granted = yield* acquire(keys, child as Fiber.Fiber<unknown, unknown>).pipe(Effect.onError(() => Fiber.interrupt(child)))
      box.services = granted.services; box.ids = granted.ids
      yield* Deferred.succeed(gate, undefined)
      // Caller interrupted: interrupt and await the child before the lease is released (prototype finding G9).
      const joined = Fiber.join(child).pipe(Effect.onInterrupt(() => Fiber.interrupt(child)))
      const bounded = opts.timeout === undefined ? joined : joined.pipe(Effect.timeoutOrElse({
        duration: opts.timeout,
        orElse: () => Fiber.interrupt(child).pipe(Effect.andThen(Effect.fail(new LeaseTimeout({ serviceId: sid(keys[0]!) }))))
      }))
      const result = yield* Effect.exit(bounded)
      if (Exit.isSuccess(result)) return result.value
      // The child was interrupted while the caller was not: the host revoked the lease (BEH-BR-086).
      if (Cause.hasInterrupts(result.cause)) return yield* Effect.fail(new LeaseRevoked({ serviceId: sid(keys[0]!) }))
      return yield* Effect.failCause(result.cause)
    }))

  const use = <S, A, E, R>(key: Context.Key<any, S>, run: (service: S) => Effect.Effect<A, E, R>, opts: { readonly timeout?: number } = {}) =>
    useAll([key] as const, ([s]) => run(s as S), opts)

  // ---------------------------------------------------------------- idle and shutdown (BEH-BR-040, 105..109)
  const awaitIdle: Effect.Effect<HostSnapshot, WouldDeadlock | HostClosed> = Effect.gen(function* () {
    if (closing || closed) return yield* Effect.fail(new HostClosed())
    const held = yield* HeldPlugins
    if (held.size > 0) return yield* Effect.fail(new WouldDeadlock({ id: [...held][0]! }))
    while (true) {
      const busy = [...flights.values()].some((f) => !f.parked) || [...entries.values()].some((e) => e.state === "starting" || e.failing) ||
        [...entries.values()].some((e) => e.state === "waiting" && missing(e).length === 0)
      if (!busy) return snapshotOf()
      yield* Effect.yieldNow
    }
  })

  /** BEH-BR-118: names and counts only. */
  const inspect = (id: string): Effect.Effect<PluginInspection, UnknownPlugin | HostClosed> => Effect.gen(function* () {
    if (closing || closed) return yield* Effect.fail(new HostClosed())
    const e = entries.get(id)
    if (!e) return yield* Effect.fail(new UnknownPlugin({ id }))
    const f = flights.get(id)
    return {
      id, state: e.state, requires: e.def.requires.map(sid), provides: e.def.provides.map(sid),
      background: (e.background ?? []).map((b) => ({ ...b })), leases: e.leases,
      ...(e.lastBuildMs !== undefined ? { lastBuildMs: e.lastBuildMs } : {}),
      parked: e.state === "stopping" && (e.parkedSystem || !!f?.parked),
      ...(f ? { pending: { operation: f.op, correlationId: f.correlationId, ...(writer && f.causeId ? { requestedRecordId: f.causeId } : {}) } } : {})
    }
  })

  interface ShutdownState { readonly owner: Caller; readonly joiners: Array<Caller>; report?: CloseReport }
  let shutdownState: ShutdownState | undefined

  /** BEH-BR-105..107: dependents first, bounded overall, never parking; the report lists every failure. */
  const runShutdown = (call: Call, timeout: number | undefined) => Effect.gen(function* () {
    closing = true
    const start = yield* Clock.currentTimeMillis
    shutdownDeadline = start + (timeout ?? options.shutdownTimeout ?? 60_000)
    const forcedBefore = new Set(forced)
    const failed: Array<{ id: string; cause: "cleanup" | "drain"; message: string }> = []
    const stopped = new Set<string>()
    for (const e of entries.values())
      if (e.state === "failed" && e.cleanupFailed) failed.push({ id: e.id, cause: "cleanup", message: e.failure?.message ?? "" })   // still unresolved (BEH-BR-106)
    const hooks = {
      drainExpired: (id: string, leases: number) => { failed.push({ id, cause: "drain", message: `${leases} lease(s) still held at the drain limit` }) },
      cleanupFailed: (id: string, message: string) => { failed.push({ id, cause: "cleanup", message }) },
      stopped: (id: string) => { stopped.add(id) }
    }
    yield* Effect.gen(function* () {
      // Parked operations end and parked system stops resume under shutdown's limits (BEH-BR-105).
      yield* locked(Effect.gen(function* () {
        for (const [id, f] of [...flights]) if (f.parked) yield* endIntent(entries.get(id)!, f, "shutdown")
        for (const e of entries.values()) if (e.parkedSystem) {
          e.parkedSystem = false; e.stopReason = "shutdown"
          yield* emit({ type: "stop-resumed", by: "shutdown" }, e.id)
        }
        yield* commit
      }))
      const isLive = (e: Entry) => e.state === "active" || e.state === "starting" || (e.state === "stopping" && !!e.scope)
      for (const e of [...entries.values()].filter(isLive).sort((x, y) => y.order - x.order)) {
        if (!isLive(e)) continue
        const exit = yield* Effect.exit(stopTree(e.id, "shutdown", { mode: "shutdown", drain: defaultDrain, hooks }))
        if (Exit.isFailure(exit)) {
          const err = Cause.squash(exit.cause)
          failed.push({ id: e.id, cause: "cleanup", message: err instanceof CleanupError ? err.message : msg(err) })
        }
      }
    }).pipe(Effect.provideService(CurrentCause, call.causeId))
    closed = true
    const report: CloseReport = {
      stopped: [...stopped].sort(), failed, forced: [...forced].filter((x) => !forcedBefore.has(x)),
      durationMs: (yield* Clock.currentTimeMillis) - start, auditDegraded: writer?.state.degraded ?? false
    }
    yield* emit({ type: "closed" })
    yield* Deferred.succeed(closedSignal, undefined)
    yield* events.close
    if (options.onClose) yield* options.onClose(report).pipe(Effect.catchCause((c) => Effect.logError("onClose failed", c)))
    return report
  })

  const shutdownWith = (opts: OperationOptions & { readonly timeout?: number }, system: boolean): Effect.Effect<CloseReport, Unattributed | ReasonRequired> =>
    Effect.gen(function* () {
      if (shutdownState?.report) return shutdownState.report    // after completion: the original report, no record (BEH-BR-109)
      return yield* (mutating<CloseReport, never>({
        operation: "shutdown", options: opts, validate: Effect.void, system,
        linearize: (call) => Effect.gen(function* () {
          const done = yield* Deferred.make<Settlement>()
          call.intent.value = true
          if (shutdownState) { shutdownState.joiners.push({ call, done, joined: true }); return done }   // joins (BEH-BR-109)
          const st: ShutdownState = { owner: { call, done, joined: false }, joiners: [] }
          shutdownState = st
          const run = Effect.gen(function* () {
            const report = yield* runShutdown(call, opts.timeout)
            st.report = report
            yield* finishCaller(st.owner, undefined, Exit.succeed(report))
            for (const j of st.joiners) yield* finishCaller(j, { correlationId: call.correlationId } as Flight, Exit.succeed(report))
          })
          // Runs in the host's fibers; the scope-close path runs it in place, as its scope is closing (BEH-BR-105, 108).
          if (system) yield* run
          else yield* Effect.forkIn(run, hostScope)
          return done
        })
      }) as Effect.Effect<CloseReport, Unattributed | ReasonRequired>)
    })
  const shutdown = (opts: OperationOptions & { readonly timeout?: number } = {}) => shutdownWith(opts, false)

  // Closing the host's scope performs the same shutdown, attributed to Actor.system (BEH-BR-108).
  yield* Effect.addFinalizer(() => Effect.gen(function* () {
    if (shutdownState?.report) return
    if (shutdownState) { yield* Deferred.await(shutdownState.owner.done); return }
    const report = yield* shutdownWith({}, true).pipe(Effect.orDie)
    for (const f of report.failed) yield* Effect.logError(`shutdown: ${f.id} ${f.cause}: ${f.message}`)
    // The writer closes with the host scope: hand it every queued record first, bounded by auditTimeout.
    if (writer) yield* writer.flush.pipe(Effect.timeoutOrElse({ duration: auditTimeout, orElse: () => Effect.void }))
  }))

  return {
    install, remove, replace, retry, reconfigure, restart, disable, enable, acknowledgeAuditDegraded,
    use, useAll, lease, awaitIdle, inspect, shutdown,
    snapshot: Effect.sync(snapshotOf),
    changes: SubscriptionRef.changes(feed).pipe(Stream.interruptWhen(Deferred.await(closedSignal))),   // ends when the host closes
    events: events.stream as Stream.Stream<HostEvent>,                                                  // diagnostic feed, not an audit trail
  }
})

export type Host = Effect.Success<ReturnType<typeof make>>

/** `Bridger.Host` and `Bridger.layer` (BEH-BR-111): hosting through `ManagedRuntime`. */
export class BridgerHost extends Context.Service<BridgerHost, Host>()("@bridger/core/Host") {}
export const layer = (options?: Options) => Layer.effect(BridgerHost, make(options))
