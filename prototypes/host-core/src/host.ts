// Phase-P1 prototype of the Bridger host core (references/core behaviours 02–09).
//
// Deliberate simplifications (recorded in RESULTS.md):
//  - Operations are admitted and linearized per plugin (ADR-BR-038): no host-wide operation lock.
//    A call that meets another operator operation in flight on the same plugin queues behind it
//    instead of being decided by the in-flight table (BEH-BR-072: joins, supersession), which
//    this prototype does not implement.
//  - No realms, configuration, events, health, children or reconcile (later phases).
//  - Builds run concurrently in forked fibers, bounded by `concurrency`.
import { Cause, Context, Deferred, Effect, Exit, Fiber, Layer, Option, Scope, Semaphore, SubscriptionRef } from "effect"
import {
  CleanupError, Conflict, DependencyCycle, DrainTimeout, DuplicatePlugin, DuplicateProvider, HostClosed,
  InvalidDefinition, LeaseRevoked, LeaseTimeout, ServiceUnavailable, UnknownPlugin, WouldDeadlock,
  ActivationFailed, PluginRemoved, type InstallError, ReplaceError
} from "./errors.js"
import { legality, type Op, type PluginState, type Row } from "./legality.js"
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
  | { readonly state: "active"; readonly providerIds: ReadonlyArray<string> }
  | { readonly state: "stopping"; readonly reason: string }
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
  readonly auditDegraded: boolean
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
}

const sid = (k: Context.Key<any, any>): string => (k as unknown as { key: string }).key
const msg = (u: unknown): string => (u instanceof Error ? u.message : String(u)).split("\n")[0]!.slice(0, 200)

export const make = (options: Options = {}) => Effect.gen(function* () {
  const hostScope = yield* Effect.scope
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
      if (e.state !== "active" || !e.services) continue
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
        case "active": return { ...common, state: "active", providerIds: [...new Set(e.providers.values())] }
        case "stopping": return { ...common, state: "stopping", reason: e.stopReason ?? "unknown" }
        case "failed": return { ...common, state: "failed", failure: e.failure ?? { phase: "build", message: "" }, missingServiceIds: missing(e) }
        case "disabled": return { ...common, state: "disabled" }
      }
    }),
    availableServiceIds: [...base.keys(), ...[...entries.values()].filter((e) => e.state === "active").flatMap((e) => e.def.provides.map(sid))].sort(),
    audit: writer ? "wired" : "unwired",
    auditDegraded: writer?.state.degraded ?? false,
    auditDropped: writer?.state.dropped ?? 0
  })
  const commit = Effect.suspend(() => { revision++; return SubscriptionRef.set(feed, snapshotOf()) })
  degradedHook = () => commit

  /** A system record (BEH-BR-199): Actor.system, not gated, causation from the triggering record. */
  const systemRecord = (operation: SystemTransition, e: Entry, causationId: string | undefined, error?: { _tag: string; message: string }) =>
    writer ? Effect.gen(function* () {
      const draft: Draft = {
        actor: Actor.system, correlationId: causationId ?? (yield* ids.next), operation, phase: "system",
        target: { id: e.id, realm: "default" }, after: { state: e.state, revision, ...defRef(e.def) },
        ...(causationId ? { causationId } : {}), ...(error ? { error } : {})
      }
      yield* writer.enqueue(draft)
    }) : Effect.void
  const defRef = (d: AnyPlugin): DefinitionRef => ({ ...(d.meta?.version ? { version: d.meta.version } : {}), ...(d.meta?.digest ? { digest: d.meta.digest } : {}) })

  // ---------------------------------------------------------------- validation (BEH-BR-003, 018–020)
  const validate = (def: AnyPlugin, excluding?: string): Effect.Effect<void, InstallError> => Effect.suspend((): Effect.Effect<void, InstallError> => {
    if (!def.id || def.id.trim() !== def.id) return Effect.fail(new InvalidDefinition({ id: def.id, reason: "malformed id" }))
    const req = def.requires.map(sid), prov = def.provides.map(sid)
    if (new Set(req).size !== req.length || new Set(prov).size !== prov.length)
      return Effect.fail(new InvalidDefinition({ id: def.id, reason: "a key is listed twice" }))
    if (req.some((r) => prov.includes(r))) return Effect.fail(new InvalidDefinition({ id: def.id, reason: "requires a key it provides" }))
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
    const scope = yield* Scope.fork(hostScope, "sequential")
    const memo = yield* Layer.makeMemoMap                       // fresh per activation (BEH-BR-036)
    const exit = yield* Layer.buildWithMemoMap(e.def.build, memo, scope).pipe(
      Effect.provideContext(ctx),
      Effect.timeoutOrElse({ duration: buildTimeout, orElse: () => Effect.fail(new Error("build timeout")) }),
      Effect.exit)
    let discard = false
    yield* locked(Effect.gen(function* () {
      if (e.epoch !== epoch || e.state !== "starting") { discard = true; return }   // stale (BEH-BR-039)
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
      yield* commit
      yield* systemRecord("system-start", e, e.cause)
      yield* settle
    }))
    if (discard) yield* Scope.close(scope, Exit.void)
  }))

  // ---------------------------------------------------------------- stopping (BEH-BR-041..047, 085, 086)
  type StopFailure = DrainTimeout | CleanupError
  const forced = new Set<string>()

  /**
   * Stop one plugin's activation after its dependents; leaves the entry registered. Returns whether
   * this call stopped it. `cascadeFrom` is set when a provider's stop needs this dependent stopped:
   * the cascade waits for the dependent's running step and then stops it only if it still holds
   * that provider (BEH-BR-079); a parked stop is resumed under the cascade's options (BEH-BR-080).
   * Waits run only from a provider to its dependents, so step locks are taken in dependency order
   * and cannot cycle (INV-BR-030).
   */
  const stopTree = (id: string, reason: string, opts: RemoveOptions, cascadeFrom?: string): Effect.Effect<boolean, StopFailure> =>
    Semaphore.withPermit(semOf(steps, id), Effect.gen(function* () {
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
    // Hidden from new consumers in the revision the stop begins, before dependents stop (BEH-BR-042),
    // so no build started meanwhile — a dependent's own restart included — can capture it.
    const drained = yield* locked(Effect.gen(function* () {
      e.state = "stopping"; e.stopReason = reason
      if (!e.drained || (yield* Deferred.isDone(e.drained))) e.drained = yield* Deferred.make<void>()
      if (e.leases === 0) yield* Deferred.succeed(e.drained, undefined)
      yield* commit
      return e.drained
    }))
    // Dependents first, each fully stopped before the provider (BEH-BR-043).
    for (const d of dependentsOf(id).sort((a, b) => b.order - a.order)) {
      const stopped = yield* stopTree(d.id, "dependency-loss", opts, id)
      if (!stopped) continue
      yield* locked(Effect.gen(function* () {
        if (d.state === "stopping") d.state = "waiting"                    // a parked intent ends here (BEH-BR-080)
        yield* commit
        yield* systemRecord("system-stop", d, yield* CurrentCause)
      }))
    }
    // Drain leases (BEH-BR-085).
    const limit = opts.drain ?? defaultDrain
    if (limit !== "forever") {
      const ok = yield* Deferred.await(drained).pipe(
        Effect.as(true), Effect.timeoutOrElse({ duration: limit, orElse: () => Effect.succeed(false) }))
      if (!ok) {
        if (!opts.force) return yield* Effect.fail(new DrainTimeout({ id, leases: e.leases }))
        forced.add(id)
        yield* Fiber.interruptAll([...e.holders])               // revoke (BEH-BR-086)
        yield* systemRecord("lease-revoked", e, yield* CurrentCause)
        yield* Deferred.await(drained)
      }
    } else yield* Deferred.await(drained)
    // Close the scope; a finalizer that fails leaves failed(cleanup) (BEH-BR-046).
    const scope = e.scope
    const closeExit = scope ? yield* Effect.exit(Scope.close(scope, Exit.void)) : Exit.void
    yield* locked(Effect.gen(function* () {
      e.scope = undefined; e.services = undefined; e.providers = new Map()
      if (Exit.isFailure(closeExit)) {
        e.state = "failed"; e.cleanupFailed = true; e.failure = { phase: "cleanup", message: msg(Cause.squash(closeExit.cause)) }
      }
      yield* commit
    }))
    if (Exit.isFailure(closeExit)) return yield* Effect.fail(new CleanupError({ id, message: msg(Cause.squash(closeExit.cause)) }))
    return true
  }))

  // ---------------------------------------------------------------- operations (BEH-BR-017..024, 041..062, 065..077)
  const rowOf = (id: string): Row => {
    const e = entries.get(id)
    if (!e) return "unknown"
    if (e.state === "failed" && e.cleanupFailed) return "failed-cleanup"
    return e.state
  }
  const legal = (id: string, op: Op) => Effect.gen(function* () {
    const out = legality(rowOf(id), op)
    switch (out.kind) {
      case "unknown-plugin": return yield* Effect.fail(new UnknownPlugin({ id }))
      case "duplicate-plugin": return yield* Effect.fail(new DuplicatePlugin({ id }))
      case "conflict": return yield* Effect.fail(new Conflict({ id, pending: out.pending }))
      default: return out.kind
    }
  })
  /** Re-entrancy check (BEH-BR-088): fail fast when the caller holds a lease the operation would wait for. */
  const deadlockCheck = (id: string) => Effect.gen(function* () {
    const held = yield* HeldPlugins
    if (held.size === 0) return
    const affected = new Set([id, ...transitiveDependents(id)])
    for (const h of held) if (affected.has(h)) return yield* Effect.fail(new WouldDeadlock({ id: h }))
  })
  const stateOfId = (id: string) => ({ state: entries.get(id)?.state ?? "uninstalled", revision })

  type MutationError = HostClosed | Unattributed | ReasonRequired | AuditUnavailable | OperationRejected
  /**
   * The order of a mutating call (BEH-BR-188): HostClosed → attribution → latch → validation →
   * gate → requested record → WouldDeadlock → (linearization point: re-validation, intent,
   * transition) → terminal record. Steps 1–7 run under the plugin's admission order, so
   * WouldDeadlock is decided before the call waits for anything a held lease could block
   * (BEH-BR-088). Nothing is ordered host-wide (ADR-BR-038).
   */
  const mutating = <A, E1, E2>(spec: {
    readonly operation: Operation
    readonly target?: string
    readonly options?: OperationOptions | undefined
    readonly definition?: DefinitionRef
    readonly validate: Effect.Effect<"proceed" | "noop", E1>
    readonly run: Effect.Effect<A, E2>
    readonly noopValue: A
  }): Effect.Effect<A, MutationError | E1 | E2 | WouldDeadlock> => Effect.gen(function* () {
    const op = spec.operation
    const key = spec.target ?? "@host"
    const exempt = op === "shutdown" || op === "acknowledgeAuditDegraded"
    const admitted = yield* Semaphore.withPermit(semOf(admissions, key), Effect.gen(function* () {
      // 1. host closed
      if (closed || closing) return yield* Effect.fail(new HostClosed())
      // 2. attribution
      const ctx: OperationContext = spec.options?.context ?? { actor: yield* CurrentActor }
      const reserved = ctx.actor.id.startsWith("bridger:")
      if (!ctx.actor.id.trim() || (attribution.require && reserved)) return yield* Effect.fail(new Unattributed({ operation: op }))
      if ((attribution.requireReason ?? []).includes(op) && !ctx.reason?.trim()) return yield* Effect.fail(new ReasonRequired({ operation: op }))
      const correlationId = ctx.correlationId ?? (yield* ids.next)
      // 3. latch
      if (writer?.state.degraded && !exempt) return yield* Effect.fail(new AuditUnavailable({ operation: op, message: "audit degraded" }))
      // 4. validation (no record on failure)
      yield* spec.validate
      const target = spec.target !== undefined ? { id: spec.target, realm: "default" } : undefined
      const base = { actor: ctx.actor, correlationId, operation: op, ...(ctx.reason ? { reason: ctx.reason } : {}), ...(target ? { target } : {}) }
      const before = spec.target !== undefined ? { ...stateOfId(spec.target), ...(spec.definition ?? {}) } : undefined
      // 5. gate — never for shutdown (BEH-BR-223); a defect or timeout is a refusal (BEH-BR-221)
      if (Option.isSome(gateOpt) && op !== "shutdown") {
        const verdict = yield* gateOpt.value.authorize({ operation: op, actor: ctx.actor, correlationId, ...(ctx.reason ? { reason: ctx.reason } : {}), ...(target ? { target } : {}), ...(spec.definition ? { definition: spec.definition } : {}) }).pipe(
          Effect.timeoutOrElse({ duration: gateTimeout, orElse: () => Effect.fail(new OperationRejected({ operation: op, reason: "gate-timeout" })) }),
          Effect.as(undefined), Effect.catchCause((c) => {
            const e = Cause.squash(c)
            return Effect.succeed(e instanceof OperationRejected ? e.reason : "gate-defect")
          }))
        if (verdict !== undefined) {
          if (writer) yield* writer.enqueue({ ...base, phase: "rejected", error: { _tag: "OperationRejected", message: verdict } })
          return yield* Effect.fail(new OperationRejected({ operation: op, reason: verdict, ...(target ? { target } : {}) }))
        }
      }
      // 6. requested record — fail closed, except shutdown (BEH-BR-203, BEH-BR-110)
      let causeId: string | undefined
      if (writer) {
        const req = yield* writer.enqueue({ ...base, phase: "requested", ...(before ? { before } : {}) })
        const ok = req ? yield* awaitWritten(req.written, auditTimeout) : false
        if (!ok && op !== "shutdown") {
          if (req) yield* writer.enqueue({ ...base, phase: "failed", causationId: req.recordId, error: { _tag: "AuditUnavailable", message: "requested record not written in time" } })
          return yield* Effect.fail(new AuditUnavailable({ operation: op, message: "requested record not written" }))
        }
        causeId = req?.recordId
      }
      const terminal = (phase: "completed" | "failed", extra: Partial<Draft>) => writer
        ? writer.enqueue({ ...base, phase, ...(causeId ? { causationId: causeId } : {}), ...(spec.target !== undefined ? { after: { ...stateOfId(spec.target), ...(spec.definition ?? {}) } } : {}), ...extra }).pipe(Effect.asVoid)
        : Effect.void
      const failWith = <E>(cause: Cause.Cause<E>): Effect.Effect<never, E> => Effect.gen(function* () {
        const err = Cause.squash(cause)
        yield* terminal("failed", { error: { _tag: (err as { _tag?: string })?._tag ?? "Defect", message: msg(err) } })
        return yield* Effect.failCause(cause)
      })
      // 7. WouldDeadlock — before any wait on the plugin's order, a step or a drain (BEH-BR-088, ADR-BR-038)
      if (spec.target !== undefined) {
        const dl = yield* Effect.exit(deadlockCheck(spec.target))
        if (Exit.isFailure(dl)) return yield* failWith(dl.cause)
      }
      return { causeId, terminal, failWith }
    }))
    // Linearization point: re-evaluate what may have changed since step 4 (BEH-BR-066), then the transition.
    return yield* Semaphore.withPermit(semOf(opLocks, key), Effect.gen(function* () {
      const kind = yield* Effect.exit(spec.validate)
      if (Exit.isFailure(kind)) return yield* admitted.failWith(kind.cause)
      if (kind.value === "noop") { yield* admitted.terminal("completed", { noop: true }); return spec.noopValue }
      const exit = yield* Effect.exit(spec.run.pipe(Effect.provideService(CurrentCause, admitted.causeId)))
      if (Exit.isSuccess(exit)) { yield* admitted.terminal("completed", {}); return exit.value }
      return yield* admitted.failWith(exit.cause)
    }))
  })

  const handleOf = (id: string): PluginHandle => ({
    id,
    awaitActive: Effect.gen(function* () {
      while (true) {
        const e = entries.get(id)
        if (!e) return yield* Effect.fail(new PluginRemoved({ id }))
        if (e.state === "active") return
        if (e.state === "failed") return yield* Effect.fail(new ActivationFailed({ id, phase: e.failure?.phase ?? "build", message: e.failure?.message ?? "" }))
        yield* Effect.sleep(1)
      }
    })
  })

  const install = (def: AnyPlugin, opts: OperationOptions & { readonly disabled?: boolean } = {}) => mutating({
    operation: "install", target: def.id, options: opts, definition: defRef(def), noopValue: handleOf(def.id),
    validate: legal(def.id, "install").pipe(Effect.andThen(validate(def)), Effect.as("proceed" as const)),   // registers nothing on error (BEH-BR-018)
    run: locked(Effect.gen(function* () {
      entries.set(def.id, { id: def.id, def, state: opts.disabled ? "disabled" : "waiting", cleanupFailed: false, providers: new Map(), leases: 0, holders: new Set(), epoch: 0, order: order++ })
      yield* commit
      yield* settle
      return handleOf(def.id)
    }))
  })

  const remove = (id: string, opts: RemoveOptions = {}) => mutating({
    operation: "remove", target: id, options: opts, definition: entries.get(id) ? defRef(entries.get(id)!.def) : {}, noopValue: undefined,
    validate: legal(id, "remove"),
    run: Effect.gen(function* () {
      const e = entries.get(id)!
      if (!e.cleanupFailed) yield* stopTree(id, "remove", opts)
      // Removing a cleanup-failed plugin acknowledges the leak; cleanup is not re-run (BEH-BR-047).
      yield* locked(Effect.gen(function* () { entries.delete(id); yield* commit; yield* settle }))
    })
  })

  const replace = (def: AnyPlugin, opts: RemoveOptions = {}) => mutating({
    operation: "replace", target: def.id, options: opts, definition: defRef(def), noopValue: undefined,
    validate: legal(def.id, "replace").pipe(Effect.tap(() =>
      validate(def, def.id).pipe(Effect.mapError((c) => new ReplaceError({ id: def.id, cause: c._tag }))))),   // before anything stops (BEH-BR-050)
    run: Effect.gen(function* () {
      const e = entries.get(def.id)!
      const wasDisabled = e.state === "disabled"
      yield* stopTree(def.id, "replace", opts)
      yield* locked(Effect.gen(function* () {
        e.def = def; e.failure = undefined; e.cleanupFailed = false
        e.state = wasDisabled ? "disabled" : "waiting"
        yield* commit; yield* settle
      }))
    })
  })

  const reactivate = (id: string) => locked(Effect.gen(function* () {
    const e = entries.get(id)!; e.state = "waiting"; e.failure = undefined; yield* commit; yield* settle
  }))

  const retry = (id: string, opts: OperationOptions = {}) => mutating({
    operation: "retry", target: id, options: opts, noopValue: undefined, validate: legal(id, "retry"), run: reactivate(id)
  })

  const restart = (id: string, opts: RemoveOptions = {}) => mutating({
    operation: "restart", target: id, options: opts, noopValue: undefined, validate: legal(id, "restart"),
    run: stopTree(id, "restart", opts).pipe(Effect.andThen(reactivate(id)))
  })

  const disable = (id: string, opts: RemoveOptions = {}) => mutating({
    operation: "disable", target: id, options: opts, noopValue: undefined, validate: legal(id, "disable"),
    run: stopTree(id, "disable", opts).pipe(Effect.andThen(locked(Effect.gen(function* () {
      const e = entries.get(id)!; e.state = "disabled"; e.failure = undefined; yield* commit; yield* settle
    }))))
  })

  const enable = (id: string, opts: OperationOptions = {}) => mutating({
    operation: "enable", target: id, options: opts, noopValue: undefined,
    validate: legal(id, "enable").pipe(Effect.tap((k) => k === "proceed" ? validate(entries.get(id)!.def, id) : Effect.void)),   // re-check (BEH-BR-062)
    run: reactivate(id)
  })

  /** Leaving the audit latch (BEH-BR-206): attributed, reason always required, its own record must be written. */
  const acknowledgeAuditDegraded = (opts: { readonly context: OperationContext }) => Effect.gen(function* () {
    if (!opts.context.reason?.trim()) return yield* Effect.fail(new ReasonRequired({ operation: "acknowledgeAuditDegraded" }))
    const dropped = writer?.state.droppedSinceAck ?? 0
    yield* mutating({
      operation: "acknowledgeAuditDegraded", options: opts, noopValue: undefined, validate: Effect.succeed("proceed" as const),
      run: Effect.suspend(() => {
        if (writer) { writer.state.degraded = false; writer.state.droppedSinceAck = 0 }
        return locked(commit)
      })
    })
    void dropped
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
  const awaitIdle = Effect.gen(function* () {
    const held = yield* HeldPlugins
    if (held.size > 0) return yield* Effect.fail(new WouldDeadlock({ id: [...held][0]! }))
    while (true) {
      const busy = [...entries.values()].some((e) => e.state === "starting") ||
        [...entries.values()].some((e) => e.state === "waiting" && missing(e).length === 0)
      if (!busy) return snapshotOf()
      yield* Effect.sleep(1)
    }
  })

  const shutdown = (opts: OperationOptions & { readonly drain?: number } = {}) => mutating({
    operation: "shutdown", options: opts, noopValue: undefined as unknown as CloseReport, validate: Effect.succeed("proceed" as const),
    run: Effect.gen(function* () {
      closing = true                                               // later calls fail with HostClosed (BEH-BR-075)
      const stopped: Array<string> = [], failed: Array<{ id: string; cause: "cleanup" | "drain"; message: string }> = []
      // Reverse dependency order: stop plugins nothing depends on first (stopTree handles the rest).
      const isLive = (e: Entry) => e.state === "active" || e.state === "starting" || (e.state === "stopping" && !!e.scope)
      const live = [...entries.values()].filter(isLive).sort((a, b) => b.order - a.order)
      for (const e of live) {
        if (!isLive(e)) continue
        const exit = yield* Effect.exit(stopTree(e.id, "shutdown", { drain: opts.drain ?? defaultDrain, force: true }))
        if (Exit.isFailure(exit)) failed.push({ id: e.id, cause: "cleanup", message: msg(Cause.squash(exit.cause)) })
      }
      for (const e of entries.values()) if (e.state === "stopping" || e.state === "waiting") stopped.push(e.id)
      closed = true
      return { stopped: stopped.sort(), failed, forced: [...forced], auditDegraded: writer?.state.degraded ?? false } satisfies CloseReport
    })
  })

  return {
    install, remove, replace, retry, restart, disable, enable, acknowledgeAuditDegraded,
    use, useAll, lease, awaitIdle, shutdown,
    snapshot: Effect.sync(snapshotOf),
    changes: SubscriptionRef.changes(feed),
  }
})

export type Host = Effect.Success<ReturnType<typeof make>>
