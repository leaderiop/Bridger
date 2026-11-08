// Prototype of the Bridger host core (references/core behaviours 02–25): phases P1–P5.
//
// Deliberate simplifications (recorded in RESULTS.md):
//  - Operations are linearized per plugin (ADR-BR-038): no host-wide operation lock. An operator
//    operation in flight is a `Flight` run by a host fiber; an incoming call joins, supersedes or
//    conflicts with it (BEH-BR-072).
//  - A plugin's identity (id, realm) is held as one internal key: the id in the default realm,
//    `id@realm` elsewhere (BEH-BR-147). Snapshots and records show the pair.
//  - Configuration comes from a function source only (no ConfigProvider default); `ConfigInvalid`
//    carries a fixed message rather than per-path issues.
//  - Builds run concurrently in forked fibers, bounded by `concurrency`; stops take no slot.
//  - Transition steps and contended waits run through `Scheduling` (`immediate` here; held by TestHost).
//  - Children, realms, interception, optional dependencies and reconcile: phase P4 (RESULTS.md).
import { Cause, Clock, Context, Deferred, Duration, Effect, Exit, Fiber, Layer, Option, Schedule, Schema, Scope, Semaphore, Stream, SubscriptionRef } from "effect"
import {
  CleanupError, Conflict, DependencyCycle, DrainTimeout, DuplicatePlugin, DuplicateProvider, HostClosed,
  InvalidDefinition, LeaseRevoked, LeaseTimeout, ServiceUnavailable, UnknownPlugin, WouldDeadlock,
  ActivationFailed, PluginRemoved, type InstallError, ReplaceError, Superseded, ConfigInvalid, UnknownRealm, DuplicateRealm, IncompatibleContract, IncompatibleEngine, LoadFailed, ManifestMismatch, PlanStale, RealmInUse, ApplyRolledBack, PartialApply
} from "./errors.js"
import { decodeProblem, disagreement, engineProblem, idleProblem, isLazy, manifestDefinition, triggersOf, BRIDGER_VERSION, type LazyPluginDefinition, type LazyTrigger } from "./manifest.js"
import { incompatibility, provisionOf, refKind, refProblem, requirementOf, underlyingKey } from "./contract.js"
import { PluginConfig, changedPaths } from "./config.js"
import { makeEvents, type HostEvent, type HostEventBody } from "./events.js"
import { PluginRuntime, type FailurePolicy } from "./runtime.js"
import { inFlight, legality, type FlightOp, type Op, type Outcome, type PluginState, type Row } from "./legality.js"
import {
  Actor, AuditSink, AuditUnavailable, ConfigFingerprinter, ConfigFingerprintUnavailable, CurrentActor, FINGERPRINT_FORMAT, IdGenerator,
  OperationGate, OperationRejected, ReasonRequired, Unattributed,
  awaitWritten, defaultIdGenerator, makeWriter, sanitizeContext, RefusalList, type AttributionOptions, type ConfigChange, type DefinitionRef, type Draft, type Fingerprint,
  type Operation, type OperationContext, type OperationOptions, type SystemTransition
} from "./gxp.js"
import type { AnyPlugin, InstallOptions, Interception, Keys, PluginAny, PluginHandle, ServicesOf } from "./plugin.js"
import { Events, makeBus } from "./bus.js"
import { ActivePlugin } from "./active.js"
import {
  AccessPolicy, CallLog, CallLogUnavailable, CapabilityDenied, CapabilityPolicy, ChildNotAllowed, PolicyMismatch, CurrentCall, CurrentCorrelation, CurrentPlugin,
  EntitlementView, InvalidCallEntry, PolicySeam, PrincipalReference, ResolutionRefused, consumerLabel, decideSafely, mint, refOf, retire,
  type AccessRequest, type CallEntry, type Consumer, type DeclaredAccess, type EntitlementState, type Grant, type MandatoryInterception, type PluginPrincipal,
  type RegisteredInterception, type ResolutionRequest, type Route
} from "./policy.js"
import { Annotation, Annotations as Ann, CurrentAnnotations, isBag } from "./annotations.js"
import { deepEqual, type DesiredPlugin } from "./desired.js"
export type { PluginHandle } from "./plugin.js"

// ------------------------------------------------------------------ public types
const LOAD_TIMEOUT = Symbol("load-timeout")
const HELD_BACK = Symbol("held-back")
export interface DeclaredContribution {
  readonly registry: string; readonly id: string; readonly role?: "veto" | "enrich" | "advisory"; readonly target?: unknown
  readonly pluginId: string; readonly realm: string; readonly status: "dormant" | "waking" | "load-failed" | "idling" | "refused"
}
export interface HostLinkShape {
  /** The host's hostId (BEH-BR-016, 250); absent on HostLink.none. */
  readonly hostId?: string
  readonly declaredContributions: (registry: string) => Effect.Effect<ReadonlyArray<DeclaredContribution>, HostClosed>
  readonly wake: (trigger: LazyTrigger, options?: { readonly realm?: string; readonly correlationId?: string }) => Effect.Effect<{ readonly triggered: ReadonlyArray<{ readonly id: string; readonly realm: string }> }, UnknownRealm | HostClosed>
}
/** `@bridger/core/HostLink` (BEH-BR-250): default none. */
export const HostLink = {
  reference: Context.Reference<Option.Option<HostLinkShape>>("@bridger/core/HostLink", { defaultValue: () => Option.none() }),
  none: { declaredContributions: () => Effect.succeed([]), wake: () => Effect.succeed({ triggered: [] }) } as HostLinkShape
}
export type PluginSnapshot = { readonly id: string; readonly realm: string; readonly parentId?: string; readonly meta?: AnyPlugin["meta"]; readonly lazy?: { readonly loaded: boolean } } & (
  | { readonly state: "dormant"; readonly triggers: ReadonlyArray<LazyTrigger> }
  | { readonly state: "waiting"; readonly missingServiceIds: ReadonlyArray<string> }
  | { readonly state: "starting"; readonly providerIds: ReadonlyArray<string>; readonly loading?: boolean }
  | { readonly state: "active"; readonly providerIds: ReadonlyArray<string>; readonly health: "healthy" | "degraded" | "unknown" }
  | { readonly state: "stopping"; readonly reason: string; readonly parked: boolean; readonly next?: "gone" }
  | { readonly state: "failed"; readonly failure: { readonly phase: string; readonly message: string }; readonly missingServiceIds: ReadonlyArray<string> }
  | { readonly state: "disabled"; readonly reason?: "refused-digest" }
)
export interface HostSnapshot {
  readonly revision: number
  readonly plugins: ReadonlyArray<PluginSnapshot>
  readonly availableServiceIds: ReadonlyArray<string>            // the default realm's list (BEH-BR-149)
  readonly realms: ReadonlyArray<{ readonly id: string; readonly isolatedServiceIds: ReadonlyArray<string>; readonly availableServiceIds: ReadonlyArray<string> }>
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
  readonly auditLastSeq?: number              // highest auditSeq written when the report was made (CCR-BR-014)
}
/** Read-only view of the host's audit controls and wiring (CCR-BR-014), for installation checks and high-water marks. */
export interface HostControls {
  readonly hostId: string
  readonly wired: { readonly audit: boolean; readonly gate: boolean; readonly fingerprinter: boolean }
  readonly attribution: AttributionOptions
  readonly auditTimeout: number
  readonly gateTimeout: number
  readonly fingerprintTimeout: number
  readonly buildTimeout: number              // round 2 (BEH-BR-212)
  readonly idGenerator: "default" | "provided"
  readonly auditPosition?: { readonly lastWritten: number }   // present when a sink is wired
  readonly policy: { readonly access: "wired" | "unwired"; readonly refusal: "wired" | "unwired"; readonly capability: "wired" | "unwired"; readonly callLog: "wired" | "unwired";
    readonly mandatory: ReadonlyArray<{ readonly scope: string; readonly serviceIds: ReadonlyArray<string> }> }   // BEH-BR-265
  readonly callLog?: { readonly failed: number; readonly dropped: number; readonly refused: number; readonly onFailure: "drop" | "refuse"; readonly queue: number }
}
export interface PluginInspection {
  readonly id: string
  readonly realm: string
  readonly state: PluginState
  readonly optional: ReadonlyArray<string>
  readonly whenAvailable: ReadonlyArray<{ readonly name: string; readonly keys: ReadonlyArray<string>; readonly running: boolean }>
  readonly contributions: ReadonlyArray<{ readonly registry: string; readonly id: string }>
  readonly requires: ReadonlyArray<string>
  readonly provides: ReadonlyArray<string>
  readonly background: ReadonlyArray<{ readonly name: string; readonly policy: FailurePolicy; readonly restarts: number; readonly running: boolean }>
  readonly leases: number
  readonly lastBuildMs?: number
  readonly parked: boolean
  readonly pending?: { readonly operation: string; readonly correlationId: string; readonly requestedRecordId?: string }
}
/** A plugin is addressed by ID within a realm; a bare string means the default realm (BEH-BR-147). */
export type PluginRef = string | { readonly id: string; readonly realm: string }
export interface ReconcileOptions {
  readonly scope?: string
  readonly prune?: boolean
  readonly pruneDrain?: number | "forever"   // BEH-BR-155 (ms here)
  readonly pruneForce?: boolean
  readonly expect?: ReconcilePlan            // BEH-BR-319
  readonly atomic?: boolean                  // BEH-BR-322; default false
}
type PlanAction = "install" | "replace" | "reconfigure" | "disable" | "enable" | "remove"
export interface PlannedEntry {
  readonly target: { readonly id: string; readonly realm: string }
  readonly actions: ReadonlyArray<PlanAction>
  readonly expected: { readonly installed: false } | { readonly installed: true; readonly registeredAt: number; readonly version?: string; readonly digest?: string }
  readonly incoming?: { readonly version?: string; readonly digest?: string }
  readonly configChange?: { readonly paths: ReadonlyArray<string> }
  readonly policy?: { readonly mandatoryInterceptions: ReadonlyArray<string>; readonly allowChildren: boolean }
  readonly undo?: ReadonlyArray<PlanAction>
}
export interface ReconcilePlan {
  readonly hostId: string
  readonly revision: number
  readonly scope: string
  readonly prune: { readonly enabled: boolean; readonly drain?: number | "forever"; readonly force: boolean }
  readonly entries: ReadonlyArray<PlannedEntry>
  readonly unchanged: ReadonlyArray<{ readonly id: string; readonly realm: string }>
  readonly rejected: ReadonlyArray<{ readonly id: string; readonly realm: string; readonly reason: { readonly _tag: string; readonly message: string } }>
  readonly reasonRequiredFor: ReadonlyArray<Operation>
  readonly atomic: boolean
}
export interface ReconcileReport {
  readonly installed: ReadonlyArray<string>
  readonly replaced: ReadonlyArray<string>
  readonly reconfigured: ReadonlyArray<string>
  readonly enabled: ReadonlyArray<string>
  readonly disabled: ReadonlyArray<string>
  readonly removed: ReadonlyArray<string>
  readonly unchanged: ReadonlyArray<string>
  readonly rejected: ReadonlyArray<{ readonly id: string; readonly reason: { readonly _tag: string } }>
}
export interface RealmOptions { readonly isolate: ReadonlyArray<Context.Key<any, any>>; readonly interceptors?: ReadonlyArray<Interception>; readonly mandatory?: ReadonlyArray<MandatoryInterception> }
export interface Options {
  readonly base?: ReadonlyArray<readonly [Context.Key<any, any>, unknown]>
  readonly concurrency?: number
  readonly buildTimeout?: number     // ms
  readonly drainTimeout?: number     // ms
  readonly attribution?: AttributionOptions
  readonly auditTimeout?: number     // ms (default 10 s)
  readonly gateTimeout?: number      // ms (default 60 s)
  readonly fingerprintTimeout?: number   // ms (default 5 s; never "forever", CCR-BR-014)
  readonly auditCapacity?: number    // writer queue bound (default 1024)
  readonly config?: (id: string) => Effect.Effect<unknown, unknown>   // the configuration source (BEH-BR-098)
  readonly shutdownTimeout?: number  // ms (default 60 s)
  readonly eventBuffer?: number      // default 1024
  readonly onClose?: (report: CloseReport) => Effect.Effect<void>
  readonly handoffTimeout?: number   // ms (default 5 s; BEH-BR-347)
  readonly mandatory?: ReadonlyArray<MandatoryInterception>           // BEH-BR-260
  readonly mandatoryCatalog?: ReadonlyArray<RegisteredInterception>   // BEH-BR-153
  readonly resolutionTimeout?: number                                 // BEH-BR-274 (ms, default 5 s)
  readonly callLogTimeout?: number                                    // BEH-BR-276 (ms, default 1 s)
  readonly baseContracts?: ReadonlyArray<Context.Key<any, any>>   // Contract or ContractProvision entries (BEH-BR-227)
}

/** A pending item of a steppable reconciler (BEH-BR-178). */
export interface StepItem {
  readonly kind: "build" | "stop" | "wait"
  readonly pluginId: string                  // the plugin stepped; for "wait", the plugin waited on
  readonly realm: string
  readonly waiter?: string                   // "wait" only: the plugin whose call or cascade waits
  readonly owner: string                     // the operation or system transition it belongs to
  readonly correlationId?: string            // the owner's, when the owner is an operator call
  readonly seq: number                       // arrival of the call or transition that created it
  readonly tie: string                       // ready-set order for builds, (realm, id) otherwise
}
/**
 * How the host schedules its transition steps and contended waits (BEH-BR-177, 178). Every step and wait
 * goes through it: the production host runs them at once (`immediate`); a test host holds them until stepped.
 * Not part of the public `Host`; it is the one seam `TestHost` owns.
 */
export interface Scheduling {
  readonly transition: <A, E>(item: StepItem, ready: () => boolean, body: Effect.Effect<A, E>) => Effect.Effect<A, E>
  readonly wait: <A, E>(item: StepItem, body: Effect.Effect<A, E>) => Effect.Effect<A, E>
}
export const immediate: Scheduling = { transition: (_item, _ready, body) => body, wait: (_item, body) => body }

/** The operation a build or stop belongs to, for StepItem.owner (BEH-BR-178). */
const CurrentOwner = Context.Reference<{ readonly owner: string; readonly correlationId?: string } | undefined>("bridger/prototype/CurrentOwner", { defaultValue: () => undefined })

/** Internal options of a reconcile entry action (BEH-BR-158, 201). */
interface EntryAction {
  readonly causedBy?: string; readonly reached?: () => void
  readonly undoes?: string; readonly undo?: true                    // an atomic apply's undo action (BEH-BR-325)
  readonly onRequested?: (recordId: string) => void                 // the forward action's requested record, for `undoes`
}

/** Record id of the operator record that caused the work running in this fiber (for system records' causationId). */
export const CurrentCause = Context.Reference<string | undefined>("bridger/prototype/CurrentCause", { defaultValue: () => undefined })

/** `@bridger/core/HeldPlugins`: plugin ids leased by the current fiber (BEH-BR-088). */
export const HeldPlugins = Context.Reference<ReadonlySet<string>>("@bridger/core/HeldPlugins", { defaultValue: () => new Set<string>() })

// ------------------------------------------------------------------ internal state
interface Entry {
  readonly id: string                         // internal key of (pluginId, realm)
  readonly pluginId: string
  readonly realm: string
  readonly parentKey?: string                 // a child: the internal key of its parent (BEH-BR-121)
  lazy?: { readonly def: LazyPluginDefinition; loaded: boolean; loading: boolean }   // a registration made from Plugin.lazy (BEH-BR-244)
  principal?: PluginPrincipal                 // the current activation's principal (BEH-BR-257)
  mandatoryChain: ReadonlyArray<MandatoryInterception>   // installation-mandatory: root ancestor first, own last (BEH-BR-261)
  allowChildren: boolean                      // BEH-BR-263
  catalogIds?: ReadonlyArray<string>          // the mandatory catalog ids a reconcile entry named (BEH-BR-153)
  captures: Array<{ readonly request: ResolutionRequest; readonly holder: { grant: Grant } }>   // live grants (BEH-BR-281)
  held?: { readonly version: string; readonly encoded: unknown; readonly causeId: string | undefined }   // a handoff in flight (BEH-BR-348)
  handoffLoss?: { readonly tag: string; readonly causeId: string | undefined }
  heldEvent?: { readonly eventId: string; readonly args: ReadonlyArray<unknown>; readonly ann: import("./annotations.js").Annotations; readonly until: number }   // BEH-BR-251
  disabledReason?: "refused-digest"          // BEH-BR-267
  /** BEH-BR-252: triggers that reached the plugin during an idle stop, applied once it is dormant. */
  /** BEH-BR-251 (G-P14): a held event kept while a stop waits for a running load or build to settle. */
  heldUntilSettled?: boolean
  pendingTriggers?: Array<{ readonly trigger: LazyTrigger; readonly root: { correlationId?: string; onBehalfOf?: ReturnType<typeof refOf> }; readonly held?: { readonly args: ReadonlyArray<unknown>; readonly ann: import("./annotations.js").Annotations } }>
  wakeCause?: string                          // the lazy-triggered record that started this activation (BEH-BR-248)
  registeredAt?: number                       // revision of the last change to definition, override, disabled flag or ownership (BEH-BR-318)
  regFp?: readonly [unknown, unknown, boolean, string | undefined]
  readonly intercept: { readonly inherited: ReadonlyArray<Interception>; readonly own: ReadonlyArray<Interception> }
  removing?: boolean                          // a child whose stop ends in removal (`next` "gone", BEH-BR-125)
  owner?: string                              // the reconcile scope that installed it (BEH-BR-155)
  reactive: Set<Fiber.Fiber<unknown, unknown>> // whenAvailable runs holding a lease on this plugin (BEH-BR-133)
  whenAvailable?: Array<{ name: string; keys: ReadonlyArray<string>; running: boolean }>
  contributions: Array<{ registry: string; id: string }>   // reported through ActivePlugin (BEH-BR-168)
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
  buildSeq: number                            // StepItem of the pending build (BEH-BR-178)
  buildOwner?: { readonly owner: string; readonly correlationId?: string }
  buildBegun?: boolean                        // the build holds its slot and has captured (BEH-BR-034, 035)
  order: number                               // registration order (FIFO among ready plugins)
  cause?: string                              // causation of the activation in flight
  stepRunning: boolean                        // a stop step is running (BEH-BR-078)
  parkedSystem: boolean                       // a dependency-loss stop parked after DrainTimeout (BEH-BR-074)
  // P2
  health?: "healthy" | "degraded" | "unknown"
  healthFails?: number
  failing?: boolean                           // a runtime failure transition is running (BEH-BR-094)
  pendingFailure?: string                     // a runtime failure signalled while still starting (BEH-BR-091)
  override?: { readonly raw: unknown; fingerprints?: ReadonlyArray<Fingerprint> }   // configuration override (BEH-BR-099); fingerprints from the port (CCR-BR-014)
  configValue?: unknown                       // decoded configuration of the current activation (latest)
  configRef?: SubscriptionRef.SubscriptionRef<unknown>
  background?: Array<{ name: string; policy: FailurePolicy; restarts: number; running: boolean }>
  lastBuildMs?: number
  healthFiber?: Fiber.Fiber<unknown, unknown>
}

/** Marks the manifest-derived definition of a lazy registration (BEH-BR-242). */
const LAZY = Symbol.for("bridger/prototype/lazy")
const sid = (k: Context.Key<any, any>): string => (k as unknown as { key: string }).key
const keyOf = (id: string, realm: string) => realm === "default" ? id : `${id}@${realm}`
const refKey = (ref: PluginRef) => typeof ref === "string" ? ref : keyOf(ref.id, ref.realm)
const msg = (u: unknown): string => {
  const m = u instanceof Error ? u.message : String(u)
  const tag = (u as { _tag?: unknown } | null)?._tag
  return (m || (typeof tag === "string" ? tag : "")).split("\n")[0]!.slice(0, 200)
}

export const make = (options: Options = {}) => makeWith(options, immediate)

export const makeWith = (options: Options, scheduling: Scheduling) => Effect.gen(function* () {
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
  const concurrency = options.concurrency ?? 4
  const buildSem = yield* Semaphore.make(concurrency)
  let buildsRunning = 0
  let arrivals = 0                               // creation order of calls and transitions, for StepItem.seq
  let stopsRequested = 0                         // stop steps requested and not settled, begun or not (BEH-BR-040)
  /** Takes a step lock; a contended wait goes through the scheduler (BEH-BR-178). */
  const takeStep = (sem: Semaphore.Semaphore, item: () => StepItem) => Effect.gen(function* () {
    if (yield* sem.takeIfAvailable(1)) return
    yield* scheduling.wait(item(), sem.take(1))
  })
  const buildTimeout = options.buildTimeout ?? 60_000
  const handoffTimeout = options.handoffTimeout ?? 5_000
  const defaultDrain = options.drainTimeout ?? 30_000

  const entries = new Map<string, Entry>()
  const flights = new Map<string, Flight>()      // operator operations in flight, per plugin (BEH-BR-072)
  const base = new Map<string, { key: Context.Key<any, any>; service: unknown }>()
  for (const [k, s] of options.base ?? []) base.set(sid(k), { key: k, service: s })
  // BEH-BR-227: base services that implement contracts; an invalid entry or one naming no base service is a defect.
  const baseContracts = options.baseContracts ?? []
  for (const k of baseContracts) {
    const problem = refKind(k) ? refProblem(k, "provides") : "not a contract reference"
    if (problem) return yield* Effect.die(new Error(`baseContracts: ${problem}`))
    if (!base.has(sid(k))) return yield* Effect.die(new Error(`baseContracts: ${sid(k)} is not provided by the base`))
  }
  // Realms (BEH-BR-145): "default" always exists and isolates nothing; definitions never change.
  const realms = new Map<string, { readonly isolate: ReadonlyMap<string, Context.Key<any, any>>; readonly interceptors: ReadonlyArray<Interception>; readonly mandatory?: ReadonlyArray<MandatoryInterception> }>(
    [["default", { isolate: new Map(), interceptors: [] }]])
  /** scopeOf(R, K): the realm's own slot when it isolates K, the default realm's otherwise (BEH-BR-146). */
  const slotOf = (realm: string, serviceId: string) => realms.get(realm)?.isolate.has(serviceId) ? realm : "default"
  let order = 0
  let closed = false
  let closing = false
  let revision = 0
  // GxP ports, resolved once at construction (BEH-BR-015).
  const sinkOpt = yield* Effect.serviceOption(AuditSink)
  const gateOpt = yield* Effect.serviceOption(OperationGate)
  const idOpt = yield* Effect.serviceOption(IdGenerator)
  const ids = Option.getOrElse(idOpt, () => defaultIdGenerator)
  const fpOpt = yield* Effect.serviceOption(ConfigFingerprinter)
  const refusalOpt = yield* Effect.serviceOption(RefusalList)
  const listenerRuns = new Map<string, number>()
  const busHooks: { access?: Parameters<typeof makeBus>[0]["access"]; onDispatch?: Parameters<typeof makeBus>[0]["onDispatch"] } = {}
  // ---- round 2 ports (core 28, 29, 10): read with serviceOption, never required.
  const accessOpt = yield* Effect.serviceOption(AccessPolicy)
  const capOpt = yield* Effect.serviceOption(CapabilityPolicy)
  const logOpt = yield* Effect.serviceOption(CallLog)
  const entitlementOpt = yield* Effect.serviceOption(EntitlementView)
  const resolutionTimeout = options.resolutionTimeout ?? 5_000
  // BEH-BR-281: re-resolve the live captures a change names; later calls see the new grant, plugin state does not change.
  if (Option.isSome(capOpt) && capOpt.value.changes) {
    const cap = capOpt.value
    yield* Effect.forkIn(cap.changes!.pipe(Stream.runForEach((again) => Effect.gen(function* () {
      for (const e of entries.values()) for (const c of e.captures) {
        const label = consumerLabel(c.request.consumer)
        if (again.consumers && !again.consumers.includes(label)) continue
        if (again.serviceIds && !again.serviceIds.includes(c.request.serviceId)) continue
        const g = yield* Effect.exit(cap.resolve(c.request).pipe(Effect.timeoutOrElse({ duration: resolutionTimeout, orElse: () => Effect.fail("timeout") })))
        c.holder.grant = Exit.isSuccess(g) ? g.value : { serviceId: c.request.serviceId, members: [] }
      }
    }))), hostScope)
  }
  const callLogTimeout = options.callLogTimeout ?? 1_000
  const catalog = options.mandatoryCatalog ?? []
  if (catalog.some((c) => !c.id) || new Set(catalog.map((c) => c.id)).size !== catalog.length) return yield* Effect.die(new Error("mandatoryCatalog: an id is empty or repeated"))
  // BEH-BR-279: a slot is taken from when an entry is queued (or reserved) until its `record` call ends.
  type LogOutcome = "ok" | "record-failed" | "record-timeout" | "host-closing"
  type Queued = { readonly entry: CallEntry; readonly done?: Deferred.Deferred<LogOutcome> }
  const logState = { failed: 0, dropped: 0, refused: 0, slots: 0, queue: [] as Array<Queued>, wake: yield* Deferred.make<void>() }
  const logCapacity = Option.isSome(logOpt) ? logOpt.value.queue ?? 1024 : 0
  if (Option.isSome(logOpt)) {
    const log = logOpt.value
    yield* Effect.forkIn(Effect.forever(Effect.gen(function* () {
      const next = logState.queue.shift()
      if (!next) { yield* Deferred.await(logState.wake); logState.wake = yield* Deferred.make<void>(); return }
      const out: LogOutcome = yield* log.record(next.entry).pipe(Effect.timeoutOrElse({ duration: callLogTimeout, orElse: () => Effect.fail(LOAD_TIMEOUT) }), Effect.as("ok" as LogOutcome),
        Effect.catchCause((c) => Effect.succeed((Cause.hasFails(c) && Cause.squash(c) === LOAD_TIMEOUT ? "record-timeout" : "record-failed") as LogOutcome)))
      logState.slots--
      if (out !== "ok") logState.failed++                            // under "drop" a failing or slow record changes no outcome (BEH-BR-276)
      if (next.done) yield* Deferred.succeed(next.done, out)
    })), hostScope)
    // A call still waiting under "refuse" when the host closes dies "host-closing" (BEH-BR-279).
    yield* Scope.addFinalizer(hostScope, Effect.suspend(() => Effect.forEach(logState.queue.splice(0), (q) => { logState.dropped++; return q.done ? Deferred.succeed(q.done, "host-closing" as LogOutcome) : Effect.void }, { discard: true })))
  }
  /** Reserve a slot (capacity is judged here only, BEH-BR-279); false when none is free. */
  const reserveSlot = () => { if (logState.slots >= logCapacity) return false; logState.slots++; return true }
  /** Queue an entry into a slot already reserved. */
  const queueReserved = (entry: CallEntry, done?: Deferred.Deferred<LogOutcome>) => Effect.gen(function* () {
    logState.queue.push({ entry, ...(done ? { done } : {}) }); yield* Deferred.succeed(logState.wake, undefined)
  })
  /** Hand an entry to the bounded queue; false when full (BEH-BR-279). */
  const offerEntry = (entry: CallEntry): Effect.Effect<boolean> => Effect.gen(function* () {
    if (!reserveSlot()) return false
    yield* queueReserved(entry); return true
  })
  /** BEH-BR-268: the declarations of the principal's registration, from its manifest. */
  const declaredFor = (p: { id: string; realm: string } | undefined): DeclaredAccess | undefined => {
    if (!p) return undefined
    const e = entries.get(keyOf(p.id, p.realm))
    const m = e?.lazy?.def.manifest ?? e?.def.manifest
    if (!m) return undefined
    return { contributions: (m.contributions ?? []).map((c) => ({ registry: c.registry, id: c.id })), events: [...(m.activation ?? []).flatMap((t) => t._tag === "OnEvent" ? [t.eventId] : []), ...(m.listens ?? [])] }
  }
  const seam = Option.isSome(accessOpt) ? Option.some({ decide: (r: AccessRequest) => decideSafely(accessOpt.value, r), declaredFor }) : Option.none()
  if (Option.isSome(seam)) busHooks.access = seam.value
  // ---- the held event (BEH-BR-251): an event dispatch that wakes a dormant plugin holds that event for it.
  busHooks.onDispatch = (eventId, args, ann) => Effect.gen(function* () {
    const p = yield* CurrentPlugin.acting
    const corr = yield* CurrentCorrelation.get
    const now = yield* Clock.currentTimeMillis
    yield* locked(Effect.gen(function* () {
      let any = false
      const root = { ...(Option.isSome(corr) ? { correlationId: corr.value } : {}), ...(Option.isSome(p) ? { onBehalfOf: refOf(p.value) } : {}) }
      for (const e of [...entries.values()].sort((a, b) => a.order - b.order)) {
        if (!e.lazy || !(e.lazy.def.manifest.activation ?? []).some((t) => t._tag === "OnEvent" && t.eventId === eventId)) continue
        // An idle stop under way keeps the trigger, with its event, for when the plugin is dormant (BEH-BR-252).
        if (idling(e)) { (e.pendingTriggers ??= []).push({ trigger: { _tag: "OnEvent", eventId }, root, held: { args, ann } }); continue }
        if (e.state !== "dormant") continue
        if (!(yield* applyTrigger(e, { _tag: "OnEvent", eventId }, undefined, root))) continue
        any = true
        yield* hold(e, eventId, args, ann, now)
      }
      if (any) { yield* commit; yield* settle }
    }))
  })
  const idling = (e: Entry) => !!e.lazy?.loaded && e.state === "stopping" && e.stopReason === "idle"
  const hold = (e: Entry, eventId: string, args: ReadonlyArray<unknown>, ann: import("./annotations.js").Annotations, now: number) => Effect.gen(function* () {
    const ms = Duration.toMillis(Duration.fromInputUnsafe(e.lazy!.def.holdTimeout))
    const held = { eventId, args, ann, until: now + ms }
    e.heldEvent = held
    yield* Effect.forkIn(Effect.sleep(ms).pipe(Effect.andThen(Effect.suspend(() => e.heldEvent === held ? dropHeld(e, "timeout") : Effect.void))), hostScope)
  })
  const dropHeld = (e: Entry, reason: "no-listener" | "activation-failed" | "ended" | "timeout") => Effect.suspend(() => {
    const h = e.heldEvent
    if (!h) return Effect.void
    e.heldEvent = undefined                                   // released at drop (BEH-BR-251)
    return Effect.logWarning(`held event ${h.eventId} for ${e.id} dropped: ${reason}`).pipe(Effect.andThen(emit({ type: "held-event-dropped", event: h.eventId, reason } as never, e.id)))
  })
  const deliverHeld = (e: Entry) => Effect.gen(function* () {
    const h = e.heldEvent
    if (!h) return
    e.heldEvent = undefined
    const n = yield* bus.deliverHeld(h.eventId, e.id, h.args, h.ann)
    if (n === 0) { e.heldEvent = h; yield* dropHeld(e, "no-listener") }
  })
  // ---- idle return (BEH-BR-252)
  // Leases cover `use`/`useAll` callbacks; listener runs are counted by the bus (G-P17). Registry holds and hook
  // calls are not conditions: they drain on the idle stop (BEH-BR-252, CCR-BR-029).
  const isIdle = (e: Entry) => e.leases === 0 && !listenerRuns.has(e.id) && ![...entries.values()].some((x) => x.parentKey === e.id) &&
    !dependentsOf(e.id).some((d) => d.state !== "dormant" && d.state !== "disabled")
  const idleLoop = (e: Entry, epoch: number) => Effect.gen(function* () {
    const idleMs = Duration.toMillis(Duration.fromInputUnsafe(e.lazy!.def.idle!))
    let since = yield* Clock.currentTimeMillis
    while (true) {
      yield* Effect.sleep(Math.max(1, Math.floor(idleMs / 4)))
      if (e.epoch !== epoch || e.state !== "active") return
      const now = yield* Clock.currentTimeMillis
      if (!isIdle(e)) { since = now; continue }                // any busy condition resets the idle time
      if (now - since < idleMs) continue
      yield* Effect.forkIn(idleReturn(e, epoch), hostScope)
      return
    }
  })
  const idleReturn = (e: Entry, epoch: number) => Effect.gen(function* () {
    if (e.epoch !== epoch || e.state !== "active" || !isIdle(e) || flights.has(e.id)) return
    const ok = yield* Effect.exit(stopTree(e.id, "idle", { mode: "no-caller", land: (x) => { x.state = "dormant"; x.lazy!.loaded = false; x.def = asDefinition(x.lazy!.def) } }))
    if (Exit.isFailure(ok)) return
    yield* locked(Effect.gen(function* () {
      yield* systemRecord("lazy-idle", e, undefined, undefined, { before: { state: "active", revision }, after: { state: "dormant", revision } })
      yield* emit({ type: "plugin-idled" } as never, e.id)
      // Triggers kept during the stop are applied now that the plugin is dormant (BEH-BR-252).
      const pending = e.pendingTriggers ?? []
      e.pendingTriggers = undefined
      const now = yield* Clock.currentTimeMillis
      for (const t of pending) {
        if (!(yield* applyTrigger(e, t.trigger, undefined, t.root))) continue
        if (t.held && t.trigger._tag === "OnEvent") yield* hold(e, t.trigger.eventId, t.held.args, t.held.ann, now)
      }
      yield* commit; yield* settle
    }))
  })
  /** BEH-BR-267: a system start of a refused digest lands in disabled ("refused-digest") with one start-refused record. */
  const refusedStart = (e: Entry) => Effect.gen(function* () {
    if (Option.isNone(refusalOpt)) return false
    const ref = defRef(e.def)
    if (ref.digest === undefined) return false
    const r = refusalOpt.value.refused({ id: e.pluginId, realm: e.realm, ...(ref.version !== undefined ? { version: ref.version } : {}), digest: ref.digest })
    if (Option.isNone(r)) return false
    e.state = "disabled"; e.disabledReason = "refused-digest"
    yield* systemRecord("start-refused", e, e.wakeCause ?? (yield* CurrentCause), { _tag: "DigestRefused", message: "refused-digest" })
    return true
  })
  const fingerprintTimeout = options.fingerprintTimeout ?? 5_000
  const hostId = yield* ids.next
  const auditTimeout = options.auditTimeout ?? 10_000
  const gateTimeout = options.gateTimeout ?? 60_000
  const attribution = options.attribution ?? {}
  let degradedHook: (why: string) => Effect.Effect<void> = () => Effect.void
  const events = yield* makeEvents(hostId, options.eventBuffer ?? 1024)
  const emit = (body: HostEventBody, pluginId?: string) => events.emit(body, pluginId)
  // Bridger.Events is a base service of the default realm (BEH-BR-137, 147); its listener fibers belong to the host.
  // The bus is made before the ports are read; access and the OnEvent hook are bound late (round 2).
  const bus = makeBus({ drainTimeout: options.drainTimeout ?? 30_000, supervisor: hostScope,
    onListenerFailed: (event, message) => emit({ type: "listener-failed", event, message }),
    onListenerRun: (k: string, d: 1 | -1) => { const n = (listenerRuns.get(k) ?? 0) + d; if (n > 0) listenerRuns.set(k, n); else listenerRuns.delete(k) },
    get access() { return busHooks.access }, onDispatch: (id, args, ann) => busHooks.onDispatch ? busHooks.onDispatch(id, args, ann) : Effect.void } as Parameters<typeof makeBus>[0])
  if (!base.has(sid(Events))) base.set(sid(Events), { key: Events, service: bus })
  const closedSignal = yield* Deferred.make<void>()
  const writer = Option.isSome(sinkOpt)
    ? yield* makeWriter({ sink: sinkOpt.value, hostId, ids, auditTimeout, capacity: options.auditCapacity ?? 1024, onDegraded: (w) => degradedHook(w) })
    : undefined
  const feed = yield* SubscriptionRef.make<HostSnapshot>({ revision: 0, plugins: [], availableServiceIds: [...base.keys()].sort(), realms: [{ id: "default", isolatedServiceIds: [], availableServiceIds: [...base.keys()].sort() }], audit: writer ? "wired" : "unwired", auditDegraded: false, auditDropped: 0 })
  const locked = <A, E, R>(e: Effect.Effect<A, E, R>) => Semaphore.withPermit(lock, e)

  // ---------------------------------------------------------------- resolution helpers
  /** The provider a consumer in `realm` resolves `serviceId` to, in the slot scopeOf(realm, key) (BEH-BR-146). */
  const activeProvider = (serviceId: string, realm = "default"): Option.Option<{ id: string; key: Context.Key<any, any>; service: unknown }> => {
    const slot = slotOf(realm, serviceId)
    const b = slot === "default" ? base.get(serviceId) : undefined   // an isolated key hides the base service (BEH-BR-146)
    if (b) return Option.some({ id: "base", key: b.key, service: b.service })
    for (const e of entries.values()) {
      if (e.state !== "active" || !e.services || flights.has(e.id) || e.failing) continue   // not leasable while an operation or a runtime failure is in flight (BEH-BR-076, 094)
      if (slotOf(e.realm, serviceId) !== slot) continue
      const k = e.def.provides.find((p) => sid(p) === serviceId)
      if (k) return Option.some({ id: e.id, key: k, service: Context.getUnsafe(e.services, k) })
    }
    return Option.none()
  }
  const missing = (e: Entry): Array<string> => e.def.requires.map(sid).filter((s) => Option.isNone(activeProvider(s, e.realm)))
  /** Plugins whose current activation captured `id` as a provider — including a stop parked before its close. */
  const holds = (e: Entry, id: string) => [...e.providers.values()].includes(id)
  /** Dependents in removal ordering: plugins that captured `id`, and its children in any state (BEH-BR-043, 121). */
  const dependentsOf = (id: string): Array<Entry> =>
    [...entries.values()].filter((e) => e.parentKey === id || ((e.state === "active" || e.state === "starting" || e.state === "stopping") && holds(e, id)))
  /** Interceptions in scope for a consumer's key, composed realm → inherited → own (BEH-BR-151). */
  const wrapFor = (e: Entry, k: Context.Key<any, any>, service: unknown) =>
    [...(realms.get(e.realm)?.interceptors ?? []), ...e.intercept.inherited, ...e.intercept.own]
      .filter((i) => sid(i.key) === sid(k))
      .reduce((svc, i) => i.wrap(svc, { pluginId: e.pluginId, realm: e.realm }), service)
  /** The consumer a capture serves (BEH-BR-260): a plugin activation, or the application. */
  const consumerOfEntry = (e: Entry): Consumer => e.principal ? { kind: "plugin", pluginId: e.pluginId, realm: e.realm, principal: refOf(e.principal) } : { kind: "application", realm: e.realm }
  const fiberConsumer = (realm: string): Effect.Effect<Consumer> => Effect.map(CurrentPlugin.get, (p) => Option.isSome(p) ? { kind: "plugin", pluginId: p.value.id, realm: p.value.realm, principal: refOf(p.value) } as Consumer : { kind: "application", realm })
  const findCaller = (c: Consumer & { kind: "plugin" }) => [...entries.values()].find((x) => !!x.principal && x.pluginId === c.pluginId && x.realm === c.realm && x.principal.revision === c.principal.revision)
  const RECORDER = Symbol("recorder")
  /**
   * The composition of BEH-BR-261 for one capture: ordinary interceptions (activation captures only), the mandatory
   * layers, then grant narrowing and the call recorder. `hostRoute`: Host.use/useAll/lease, wrapped by "all" layers only.
   */
  const deliver = (a: { consumer: Consumer; entry?: Entry; realm: string; key: Context.Key<any, any>; providerId: string; service: unknown; route: Route; hostRoute: boolean }): Effect.Effect<unknown, ResolutionRefused> => Effect.gen(function* () {
    const k = a.key, serviceId = sid(k)
    let svc = a.service
    if (a.entry && !a.hostRoute) svc = wrapFor(a.entry, k, svc)
    // BEH-BR-262 (G-P16 not adopted, CCR-BR-029): a plugin consumer of Host.use/useAll/lease keeps its own
    // installation set and its registration realm's set; a call `realm` naming another realm adds that realm's set
    // outside them. "plugins" layers apply to every plugin consumer, never to the application.
    const caller = a.entry ?? (a.hostRoute && a.consumer.kind === "plugin" ? findCaller(a.consumer) : undefined)
    const regRealm = a.consumer.kind === "plugin" && caller ? caller.realm : a.realm
    const layers = [...(caller ? caller.mandatoryChain : []), ...(realms.get(regRealm)?.mandatory ?? []), ...(regRealm !== a.realm ? realms.get(a.realm)?.mandatory ?? [] : []), ...(options.mandatory ?? [])]
      .filter((m) => sid(m.key) === serviceId && (a.consumer.kind === "plugin" ? true : (m.appliesTo ?? "all") === "all"))
    for (const m of layers) svc = m.wrap(svc, a.consumer)
    const pe = a.providerId === "base" ? undefined : [...entries.values()].find((x) => x.pluginId === a.providerId && x.def.provides.some((p) => sid(p) === serviceId))
    const provider: ResolutionRequest["provider"] = pe ? { kind: "plugin", id: pe.pluginId, realm: pe.realm, ...defRef(pe.def) } : { kind: "base" }
    const label = consumerLabel(a.consumer)
    let holder: { grant: Grant } | undefined
    if (Option.isSome(capOpt)) {
      const ann = yield* CurrentAnnotations
      const request: ResolutionRequest = { consumer: a.consumer, serviceId, provider, route: a.route, annotations: Ann.filter(isBag(ann) ? ann : Ann.empty, "policy") }
      const grant = yield* resolveOnce(request, label)
      holder = { grant }
      if (a.entry && a.route === "required") a.entry.captures.push({ request, holder })
      // Grant.all adds no layer — unless the policy can narrow a live capture later (finding G-P13).
      if (grant.members !== "all" || capOpt.value.changes) {
        const target = svc as object, h = holder
        svc = new Proxy(target, { get: (t, prop, r) => {
          const v = Reflect.get(t, prop, r)
          if (typeof prop !== "string" || h.grant.members === "all" || h.grant.members.includes(prop)) return v
          const die = Effect.die(new CapabilityDenied(serviceId, prop, label))
          return typeof v === "function" ? () => die : die
        } })
      }
    }
    if (Option.isSome(logOpt)) {
      const sel = logOpt.value.select({ consumer: a.consumer, serviceId, provider, route: a.route })
      if (sel) {
        const policy = sel === true ? logOpt.value.onFailure ?? "drop" : sel
        const target = svc as object, h = holder
        const record = (member: string, run: () => unknown): unknown => {
          const once = Effect.gen(function* () {
            // "refuse": the slot is reserved before the member runs, and only there is capacity judged (G-P18).
            const reserved = policy === "refuse" ? reserveSlot() : false
            if (policy === "refuse" && !reserved) { logState.refused++; return yield* Effect.die(new CallLogUnavailable({ serviceId, member, why: "queue-full" })) }
            const callId = yield* ids.next
            const consumer: CallEntry["consumer"] = a.consumer.kind === "plugin" ? { kind: "plugin", principal: a.consumer.principal } : { kind: "application", realm: a.consumer.realm }
            const info = CurrentCall.make({ callId, consumer, serviceId, member, grant: h?.grant.members ?? "all" })
            const started = yield* Clock.currentTimeMillis
            const exit = yield* Effect.exit(Effect.suspend(() => run() as Effect.Effect<unknown, unknown>).pipe(Effect.provideService(CurrentCall.reference, Option.some(info))))
            const ended = yield* Clock.currentTimeMillis
            const actor = yield* CurrentActor, corr = yield* CurrentCorrelation.get, ann = yield* CurrentAnnotations
            const err = Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined
            const outcome: CallEntry["outcome"] = Exit.isSuccess(exit) ? "success" : err instanceof CapabilityDenied ? "denied" : Cause.hasInterruptsOnly(exit.cause) ? "interrupted" : Cause.hasFails(exit.cause) ? "failure" : "defect"
            const enc = Ann.encode(Ann.filter(isBag(ann) ? ann : Ann.empty, "callLog")).entries
            const entry: CallEntry = { kind: "call", callId, consumer, actor, serviceId, provider, member, outcome, ...(outcome === "failure" && (err as { _tag?: string })?._tag ? { errorTag: (err as { _tag: string })._tag } : {}),
              startedAt: new Date(started).toISOString(), durationMs: ended - started, ...(Option.isSome(corr) ? { correlationId: corr.value } : {}), ...(enc.length ? { annotations: enc } : {}), origin: "core" }
            // A denied call keeps its outcome; its entry follows "drop" (BEH-BR-279).
            if (reserved && outcome !== "denied") {
              const done = yield* Deferred.make<LogOutcome>()
              yield* queueReserved(entry, done)
              const got = yield* Deferred.await(done)                // an interruption ends only this wait; the entry stays queued
              if (got !== "ok") { logState.refused++; return yield* Effect.die(new CallLogUnavailable({ serviceId, member, why: got })) }
              return yield* exit
            }
            if (reserved) yield* queueReserved(entry)
            else if (!(yield* offerEntry(entry))) logState.dropped++
            return yield* exit
          })
          return once
        }
        svc = new Proxy(target, { get: (t, prop, r) => {
          const v = Reflect.get(t, prop, r)
          if (typeof prop !== "string") return v
          if (typeof v === "function") return (...args: Array<unknown>) => record(prop, () => v.apply(t, args))
          if (Effect.isEffect(v)) return record(prop, () => v)
          return v
        } })
        void RECORDER
      }
    }
    return svc
  })
  const resolveOnce = (request: ResolutionRequest, label: string): Effect.Effect<Grant, ResolutionRefused> =>
    capOpt.pipe(Option.getOrThrow).resolve(request).pipe(
      Effect.timeoutOrElse({ duration: resolutionTimeout, orElse: () => Effect.fail(new ResolutionRefused({ serviceId: request.serviceId, consumer: label, reason: "policy-timeout" })) }),
      Effect.catchCause((c) => {
        const e = Cause.squash(c)
        return Effect.fail(e instanceof ResolutionRefused ? e : new ResolutionRefused({ serviceId: request.serviceId, consumer: label, reason: "policy-defect" }))
      }))
  const availableIn = (realm: string): Array<string> => {
    const out = new Set<string>()
    for (const s of base.keys()) if (slotOf(realm, s) === "default") out.add(s)
    for (const e of entries.values()) if (e.state === "active")
      for (const k of e.def.provides) if (slotOf(e.realm, sid(k)) === slotOf(realm, sid(k))) out.add(sid(k))
    return [...out].sort()
  }
  const transitiveDependents = (id: string, acc = new Set<string>()): Set<string> => {
    for (const d of dependentsOf(id)) if (!acc.has(d.id)) { acc.add(d.id); transitiveDependents(d.id, acc) }
    return acc
  }

  // ---------------------------------------------------------------- snapshots (BEH-BR-027..030)
  const snapshotOf = (): HostSnapshot => ({
    revision,
    plugins: [...entries.values()].sort((a, b) => a.order - b.order).map((e): PluginSnapshot => {
      const parent = e.parentKey !== undefined ? entries.get(e.parentKey) : undefined
      const common = { id: e.pluginId, realm: e.realm, ...(parent ? { parentId: parent.pluginId } : {}), ...(e.def.meta ? { meta: e.def.meta } : {}), ...(e.lazy ? { lazy: { loaded: e.lazy.loaded } } : {}) }
      switch (e.state) {
        case "dormant": return { ...common, state: "dormant", triggers: triggersOf(e.lazy!.def.manifest) }
        case "waiting": return { ...common, state: "waiting", missingServiceIds: missing(e) }
        case "starting": return { ...common, state: "starting", providerIds: [...new Set(e.providers.values())], ...(e.lazy ? { loading: e.lazy.loading } : {}) }
        case "active": return { ...common, state: "active", providerIds: [...new Set(e.providers.values())], health: e.health ?? "unknown" }
        case "stopping": return { ...common, state: "stopping", reason: e.stopReason ?? "unknown", parked: e.parkedSystem || !!flights.get(e.id)?.parked, ...(e.removing ? { next: "gone" as const } : {}) }
        case "failed": return { ...common, state: "failed", failure: e.failure ?? { phase: "build", message: "" }, missingServiceIds: missing(e) }
        case "disabled": return { ...common, state: "disabled", ...(e.disabledReason ? { reason: e.disabledReason } : {}) }
      }
    }),
    availableServiceIds: availableIn("default"),
    realms: [...realms].map(([id, r]) => ({ id, isolatedServiceIds: [...r.isolate.keys()].sort(), availableServiceIds: availableIn(id) })),
    audit: writer ? "wired" : "unwired",
    auditDegraded: writer?.state.degraded ?? false,
    auditDropped: writer?.state.dropped ?? 0
  })
  /** The operator's `disabled` flag: a RefusalList disable is not one (BEH-BR-154, 318; CCR-BR-029). */
  const operatorDisabled = (e: Entry) => e.state === "disabled" && e.disabledReason !== "refused-digest"
  const lastStates = new Map<string, string>()
  const heldSet = new Set<Entry>()
  const commit = Effect.gen(function* () {
    revision++
    // A held event whose plugin left the path to active before delivery is dropped as "ended" (BEH-BR-251).
    for (const e of [...heldSet]) {
      if (!e.heldEvent) { heldSet.delete(e); continue }
      if (e.heldUntilSettled) continue                       // decided when the running load or build settles (G-P14)
      if (entries.get(e.id) !== e || e.state === "disabled" || e.state === "stopping" || e.state === "dormant") { heldSet.delete(e); yield* dropHeld(e, "ended") }
    }
    for (const e of entries.values()) if (e.heldEvent) heldSet.add(e)
    for (const e of entries.values()) {
      const fp = [e.def, e.override, operatorDisabled(e), e.owner] as const
      if (!e.regFp || e.regFp.some((x, i) => x !== fp[i])) { e.regFp = fp; e.registeredAt = revision }
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
        target: { id: e.pluginId, realm: e.realm }, after: { state: e.state, revision, ...defRef(e.def) },
        ...(causationId ? { causationId } : {}), ...(error ? { error } : {}), ...extra
      }
      return (yield* writer.enqueue(draft))?.recordId
    }) : Effect.succeed(undefined)
  /** The RefusalList answer for one submission, as "refused-digest: <reason>" (BEH-BR-267; shared with plan, BEH-BR-317). */
  const refusalOf = (target: { readonly id: string; readonly realm: string }, ref: DefinitionRef | undefined): string | undefined => {
    if (Option.isNone(refusalOpt) || ref?.digest === undefined) return undefined
    const r = refusalOpt.value.refused({ id: target.id, realm: target.realm, ...(ref.version !== undefined ? { version: ref.version } : {}), digest: ref.digest })
    return Option.isSome(r) ? `refused-digest: ${r.value}` : undefined
  }
  const defRef = (d: AnyPlugin): DefinitionRef => ({ ...(d.meta?.version ? { version: d.meta.version } : {}), ...(d.meta?.digest ? { digest: d.meta.digest } : {}) })

  // ---------------------------------------------------------------- lazy activation (BEH-BR-244–250)
  const asDefinition = (d: AnyPlugin | PluginAny | LazyPluginDefinition): AnyPlugin => isLazy(d) ? Object.assign(manifestDefinition(d), { [LAZY]: d }) : d as AnyPlugin
  /** Where a registration rests when nothing starts it: `dormant` while not yet loaded (BEH-BR-244, 247). */
  const restState = (e: Entry): "dormant" | "waiting" => e.lazy && !e.lazy.loaded ? "dormant" : "waiting"
  const sameTrigger = (a: LazyTrigger, b: LazyTrigger) => JSON.stringify(a) === JSON.stringify(b)
  /** Moves a dormant plugin out as a system transition and writes its lazy-triggered record (BEH-BR-245, 248). */
  const applyTrigger = (d: Entry, trigger: LazyTrigger, causationId: string | undefined, root?: { correlationId?: string; onBehalfOf?: ReturnType<typeof refOf> }) => Effect.gen(function* () {
    if (d.state !== "dormant") return false
    // A refused start is not triggered: no lazy-triggered record, absent from WakeReport (BEH-BR-245).
    if (yield* refusedStart(d)) return false
    d.state = "waiting"
    const rid = writer ? yield* Effect.gen(function* () {
      const draft: Draft = {
        actor: Actor.system, correlationId: root?.correlationId ?? causationId ?? (yield* ids.next), operation: "lazy-triggered", phase: "system",
        target: { id: d.pluginId, realm: d.realm }, before: { state: "dormant", revision }, after: { state: "waiting", revision: revision + 1, ...defRef(d.def) },
        trigger: trigger as never, ...(causationId ? { causationId } : {}), ...(root?.onBehalfOf && !causationId ? { onBehalfOf: root.onBehalfOf } : {})
      }
      return (yield* writer.enqueue(draft))?.recordId
    }) : undefined
    d.wakeCause = rid
    yield* emit({ type: "plugin-triggered", trigger }, d.id)
    return true
  })
  /** OnService from every registration that waits on a key a dormant plugin provides (BEH-BR-245). Call under `lock`. */
  const applyServiceTriggers = Effect.gen(function* () {
    let changed = true
    while (changed) {
      changed = false
      for (const e of [...entries.values()].sort((a, b) => a.order - b.order)) {
        if (e.state !== "waiting") continue
        for (const k of e.def.requires) {
          const slot = slotOf(e.realm, sid(k))
          const d = [...entries.values()].find((x) => x.state === "dormant" && slotOf(x.realm, sid(k)) === slot && x.def.provides.some((p) => sid(p) === sid(k)))
          if (d && (yield* applyTrigger(d, { _tag: "OnService", serviceId: sid(k) }, e.wakeCause ?? (yield* CurrentCause)))) changed = true
        }
      }
    }
  })
  const wake = (trigger: LazyTrigger, o: { readonly realm?: string; readonly correlationId?: string } = {}): Effect.Effect<{ readonly triggered: ReadonlyArray<{ readonly id: string; readonly realm: string }> }, UnknownRealm | HostClosed> =>
    Effect.gen(function* () {
      // The caller's real principal, read as a mutation reads it (BEH-BR-253); a forged one dies.
      const p = yield* CurrentPlugin.acting
      const corr = yield* CurrentCorrelation.get
      const root = { ...(o.correlationId ? { correlationId: o.correlationId } : Option.isSome(corr) ? { correlationId: corr.value } : {}), ...(Option.isSome(p) ? { onBehalfOf: refOf(p.value) } : {}) }
      return yield* wakeWith(trigger, o, root)
    })
  const wakeWith = (trigger: LazyTrigger, o: { readonly realm?: string }, root: { correlationId?: string; onBehalfOf?: ReturnType<typeof refOf> }) =>
    locked(Effect.gen(function* () {
      if (closed || closing) return yield* Effect.fail(new HostClosed())
      const realm = o.realm ?? "default"
      if (!realms.has(realm)) return yield* Effect.fail(new UnknownRealm({ id: realm }))
      const named = (e: Entry) => !!e.lazy && (
        trigger._tag === "OnService" ? slotOf(e.realm, trigger.serviceId) === slotOf(realm, trigger.serviceId) && e.def.provides.some((p) => sid(p) === trigger.serviceId)
          : e.realm === realm && triggersOf(e.lazy.def.manifest).some((t) => sameTrigger(t, trigger)))
      // During an idle stop the trigger is kept and applied at dormant (BEH-BR-252); `wake` holds no event.
      for (const e of entries.values()) if (idling(e) && named(e)) (e.pendingTriggers ??= []).push({ trigger, root })
      const matches = [...entries.values()].filter((e) => e.state === "dormant" && named(e))
      const triggered: Array<{ id: string; realm: string }> = []
      for (const e of matches.sort((a, b) => a.order - b.order)) if (yield* applyTrigger(e, trigger, undefined, root)) triggered.push({ id: e.pluginId, realm: e.realm })
      if (matches.length) { yield* commit; yield* settle }
      return { triggered }
    }))
  /** BEH-BR-250: declarations of registrations not yet loaded and not disabled, by realm, plugin id, contribution id. */
  const declaredContributions = (registry: string): Effect.Effect<ReadonlyArray<DeclaredContribution>, HostClosed> => Effect.suspend(() => {
    if (closed || closing) return Effect.fail(new HostClosed())
    const out: Array<DeclaredContribution> = []
    for (const e of entries.values()) {
      if (!e.lazy) continue
      // CCR-BR-029 (R1-03, R1-04): an idle stop under way reads "idling", a refusal-list disable "refused";
      // an operator's disable is never reported.
      const status = e.state === "disabled" && e.disabledReason === "refused-digest" ? "refused" as const
        : e.lazy.loaded ? (e.state === "stopping" && e.stopReason === "idle" ? "idling" as const : undefined)
        : e.state === "dormant" ? "dormant" as const
        : e.state === "failed" ? (e.failure?.phase === "load" ? "load-failed" as const : undefined)
        : e.state === "waiting" || e.state === "starting" ? "waking" as const : undefined
      if (!status) continue
      for (const c of e.lazy.def.manifest.contributions ?? []) if (c.registry === registry)
        out.push({ registry, id: c.id, ...(c.role ? { role: c.role } : {}), ...(c.target !== undefined ? { target: c.target } : {}), pluginId: e.pluginId, realm: e.realm, status })
    }
    const cu = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0
    return Effect.succeed(out.sort((a, b) => cu(a.realm, b.realm) || cu(a.pluginId, b.pluginId) || cu(a.id, b.id)))
  })
  const link: HostLinkShape = { hostId, declaredContributions, wake }
  /** BEH-BR-089: one EntitlementView watch per activation, shared latest-wins, ended with the activation scope. */
  const entitledFor = (e: Entry, scope: Scope.Scope): Stream.Stream<EntitlementState> => {
    if (Option.isNone(entitlementOpt)) return Stream.fromEffect(Effect.map(Clock.currentTimeMillis, (t): EntitlementState => ({ mode: "unmetered", asOf: new Date(t).toISOString() }))).pipe(Stream.concat(Stream.never))
    const view = entitlementOpt.value
    let shared: { ref: SubscriptionRef.SubscriptionRef<Option.Option<EntitlementState>>; ended: Deferred.Deferred<void> } | undefined
    return Stream.unwrap(Effect.gen(function* () {
      if (!shared) {
        const ref = yield* SubscriptionRef.make<Option.Option<EntitlementState>>(Option.none())
        const ended = yield* Deferred.make<void>()
        shared = { ref, ended }
        yield* Scope.addFinalizer(scope, Deferred.succeed(ended, undefined))
        const watch = view.watch({ id: e.pluginId, realm: e.realm, ...(e.def.meta?.version ? { version: e.def.meta.version } : {}) })
        yield* Effect.forkIn(watch.pipe(Stream.runForEach((st) => SubscriptionRef.set(ref, Option.some(st))), Effect.exit, Effect.flatMap(() => Effect.gen(function* () {
          // Ended, failed or died: the last state marked stale (or "unknown"), once, and no further call.
          const last = yield* SubscriptionRef.get(ref), now = new Date(yield* Clock.currentTimeMillis).toISOString()
          yield* SubscriptionRef.set(ref, Option.some(Option.isSome(last) ? { ...last.value, stale: true, reason: "entitlement-view-ended" } : { mode: "unknown", asOf: now, stale: true, reason: "entitlement-view-ended" }))
        }))), scope)
      }
      const sh = shared
      return SubscriptionRef.changes(sh.ref).pipe(Stream.filter(Option.isSome), Stream.map((o) => o.value), Stream.interruptWhen(Deferred.await(sh.ended)))
    }))
  }
  /** BEH-BR-246: `load` in the build slot under buildTimeout; a failure or mismatch fails with phase "load". */
  const loadIfNeeded = (e: Entry, epoch: number): Effect.Effect<boolean> => Effect.gen(function* () {
    const lz = e.lazy
    if (!lz || lz.loaded) return true
    lz.loading = true
    yield* locked(commit)
    const fail = (message: string) => locked(Effect.gen(function* () {
      lz.loading = false
      if (e.epoch !== epoch) { if (e.heldUntilSettled) { e.heldUntilSettled = false; yield* dropHeld(e, "activation-failed") } return false }
      e.state = "failed"; e.failure = { phase: "load", message }
      yield* dropHeld(e, "activation-failed")
      yield* commit
      return false
    }))
    const exit = yield* Effect.exit(lz.def.load.pipe(Effect.timeoutOrElse({ duration: buildTimeout, orElse: () => Effect.fail(LOAD_TIMEOUT) })))
    if (Exit.isFailure(exit)) {
      // Core writes the message from the kind of the cause, never from the loader's text (BEH-BR-246).
      const kind = Cause.hasInterrupts(exit.cause) && !Cause.hasFails(exit.cause) && !Cause.hasDies(exit.cause) ? "interrupted"
        : Cause.hasDies(exit.cause) ? "died" : Cause.squash(exit.cause) === LOAD_TIMEOUT ? "timeout" : "failed"
      return yield* fail(`LoadFailed: load ${kind}`)
    }
    const loaded = exit.value
    const field = isLazy(loaded) ? "lazy" : disagreement(loaded, lz.def.manifest, { ...(lz.def.meta.digest !== undefined ? { expected: lz.def.meta.digest } : {}) })
    if (field) return yield* fail(`ManifestMismatch: ${field}`)
    return yield* locked(Effect.sync(() => {
      lz.loading = false
      if (e.epoch !== epoch) return false
      e.def = loaded; lz.loaded = true
      return true
    }))
  })

  // ---------------------------------------------------------------- validation (BEH-BR-003, 018–020, 129, 146–148)
  interface Ident { readonly key: string; readonly id: string; readonly realm: string; readonly parentKey?: string }
  const identOf = (e: Entry): Ident => ({ key: e.id, id: e.pluginId, realm: e.realm, ...(e.parentKey !== undefined ? { parentKey: e.parentKey } : {}) })
  const validate = (def: AnyPlugin, ident: Ident, excluding?: string, landsDisabled = false): Effect.Effect<void, InstallError> => Effect.suspend((): Effect.Effect<void, InstallError> => {
    if (!realms.has(ident.realm)) return Effect.fail(new UnknownRealm({ id: ident.realm }))
    // Manifest (BEH-BR-241, 242, 244, 252): first within the InvalidDefinition check.
    const lazyDef = (def as { [LAZY]?: LazyPluginDefinition })[LAZY]
    const manifest = lazyDef?.manifest ?? def.manifest
    if (manifest !== undefined) {
      const problem = decodeProblem(manifest)
      if (problem) return Effect.fail(new InvalidDefinition({ id: def.id ?? "", reason: problem }))
      if (lazyDef?.digestConflict) return Effect.fail(new InvalidDefinition({ id: def.id, reason: "manifest: digest differs from the digest supplied" }))
      if (lazyDef && idleProblem(lazyDef.idle)) return Effect.fail(new InvalidDefinition({ id: def.id, reason: "idle is not a positive finite duration" }))
      if (!lazyDef) { const field = disagreement(def, manifest, "manifest"); if (field) return Effect.fail(new InvalidDefinition({ id: def.id, reason: `manifest: disagrees with the definition in ${field}` })) }
      const eng = engineProblem(manifest)
      if (eng?.kind === "invalid") return Effect.fail(new InvalidDefinition({ id: def.id, reason: `manifest: engines range ${eng.range} breaks the grammar` }))
    }
    if (!def.id || def.id.trim() !== def.id) return Effect.fail(new InvalidDefinition({ id: def.id, reason: "malformed id" }))
    const req = def.requires.map(sid), prov = def.provides.map(sid), opt = (def.optional ?? []).map(sid)
    if (new Set(req).size !== req.length || new Set(prov).size !== prov.length || new Set(opt).size !== opt.length)
      return Effect.fail(new InvalidDefinition({ id: def.id, reason: "a key is listed twice" }))
    if (req.some((r) => prov.includes(r))) return Effect.fail(new InvalidDefinition({ id: def.id, reason: "requires a key it provides" }))
    if (opt.some((o) => req.includes(o))) return Effect.fail(new InvalidDefinition({ id: def.id, reason: "a key is both required and optional" }))   // BEH-BR-129
    if (def.health && def.health.failureThreshold < 1) return Effect.fail(new InvalidDefinition({ id: def.id, reason: "failureThreshold below 1" }))
    if (def.volatile?.length && !def.config) return Effect.fail(new InvalidDefinition({ id: def.id, reason: "volatile without config" }))
    if (def.volatile?.length && def.config) {
      const fields = (def.config as unknown as { fields?: Record<string, unknown> }).fields
      const unknownName = def.volatile.find((v) => !fields || !(v in fields))
      if (unknownName !== undefined) return Effect.fail(new InvalidDefinition({ id: def.id, reason: `volatile names no field: ${unknownName}` }))
    }
    // Contract references (BEH-BR-225–227): invalid contracts, misplaced references and ranges leaving the major.
    for (const [pos, list] of [["requires", def.requires], ["optional", def.optional ?? []], ["provides", def.provides]] as const)
      for (const k of list) { const problem = refProblem(k, pos); if (problem) return Effect.fail(new InvalidDefinition({ id: def.id, reason: problem })) }
    const eng = manifest !== undefined ? engineProblem(manifest) : undefined
    if (eng?.kind === "unsatisfied") return Effect.fail(new IncompatibleEngine({ id: def.id, engine: "@bridger/core", range: eng.range, actual: BRIDGER_VERSION }))
    if (excluding === undefined && entries.has(ident.key)) return Effect.fail(new DuplicatePlugin({ id: ident.id }))
    const others = [...entries.values()].filter((e) => e.id !== excluding && e.id !== ident.key && e.state !== "disabled")
    // One provider per slot scopeOf(R, K) (BEH-BR-146, 148); the base occupies the default realm's slots.
    for (const p of prov) {
      const slot = slotOf(ident.realm, p)
      if (slot === "default" && base.has(p)) return Effect.fail(new DuplicateProvider({ serviceId: p, providerId: "base" }))
      const owner = others.find((e) => slotOf(e.realm, p) === slot && e.def.provides.some((k) => sid(k) === p))
      if (owner) return Effect.fail(new DuplicateProvider({ serviceId: p, providerId: owner.pluginId }))
    }
    // Cycle over resolved edges (consumer → the provider its key resolves to) and mount edges child → parent
    // (INV-BR-002, BEH-BR-121, 148). Optional keys take no part (BEH-BR-129).
    const nodes: Array<{ ident: Ident; def: AnyPlugin }> = [...others.map((e) => ({ ident: identOf(e), def: e.def })), { ident, def }]
    const providerOf = new Map<string, string>()
    for (const n of nodes) for (const k of n.def.provides) providerOf.set(`${slotOf(n.ident.realm, sid(k))}|${sid(k)}`, n.ident.key)
    const edges = new Map(nodes.map((n) => [n.ident.key, [
      ...n.def.requires.map((k) => providerOf.get(`${slotOf(n.ident.realm, sid(k))}|${sid(k)}`)).filter((x): x is string => !!x),
      ...(n.ident.parentKey !== undefined ? [n.ident.parentKey] : [])
    ]]))
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
    const cycle = visit(ident.key)
    if (cycle) return Effect.fail(new DependencyCycle({ path: cycle }))
    // A registration that lands disabled forms no registered pair (BEH-BR-228).
    const incompatible = landsDisabled ? undefined : contractCheck(def, ident, others)
    return incompatible ? Effect.fail(incompatible) : Effect.void
  })
  /** BEH-BR-228: registered pairs naming `def`, dependent side first (in `requires` order), then provider side by dependent id. */
  const provisionIn = (owner: { def: AnyPlugin } | "base", serviceId: string) => {
    if (owner === "base") { const b = baseContracts.find((k) => sid(k) === serviceId); return b ? provisionOf(b) : undefined }
    const k = owner.def.provides.find((x) => sid(x) === serviceId)
    return k ? provisionOf(k) : undefined
  }
  const contractCheck = (def: AnyPlugin, ident: Ident, others: ReadonlyArray<Entry>): IncompatibleContract | undefined => {
    const providerFor = (realm: string, serviceId: string, pool: ReadonlyArray<{ id: string; realm: string; def: AnyPlugin }>): { id: string; def: AnyPlugin } | "base" | undefined => {
      const slot = slotOf(realm, serviceId)
      const p = pool.find((e) => slotOf(e.realm, serviceId) === slot && e.def.provides.some((k) => sid(k) === serviceId))
      if (p) return p
      return slot === "default" && base.has(serviceId) ? "base" : undefined
    }
    const pool = others.map((e) => ({ id: e.pluginId, realm: e.realm, def: e.def }))
    for (const k of def.requires) {
      const req = requirementOf(k)
      if (!req) continue
      const p = providerFor(ident.realm, sid(k), pool)
      if (!p) continue                                             // no provider: not checked; the dependent waits
      const bad = incompatibility(req, provisionIn(p, sid(k)))
      if (bad) return new IncompatibleContract({ serviceId: sid(k), dependentId: def.id, providerId: p === "base" ? "base" : p.id, required: req.range, ...bad })
    }
    const withMe = [...pool, { id: def.id, realm: ident.realm, def }]
    for (const d of [...pool].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)) {
      for (const k of d.def.requires) {
        const req = requirementOf(k)
        if (!req) continue
        const p = providerFor(d.realm, sid(k), withMe)
        if (p === undefined || p === "base" || p.def !== def) continue
        const bad = incompatibility(req, provisionIn(p, sid(k)))
        if (bad) return new IncompatibleContract({ serviceId: sid(k), dependentId: d.id, providerId: def.id, required: req.range, ...bad })
      }
    }
    return undefined
  }

  // ---------------------------------------------------------------- activation (BEH-BR-033..040)
  /** Start every waiting plugin whose requirements are met, FIFO by registration. Call under `lock`. */
  const settle: Effect.Effect<void> = Effect.gen(function* () {
    if (closed) return
    let changed = false
    const pass = ++arrivals                      // builds made ready together share one arrival (BEH-BR-178)
    const owner = yield* CurrentOwner
    yield* applyServiceTriggers
    for (const e of [...entries.values()].sort((a, b) => a.order - b.order)) {
      if (e.state !== "waiting" || missing(e).length > 0) continue
      if (yield* refusedStart(e)) { changed = true; continue }
      e.providers = new Map(e.def.requires.map((k) => [sid(k), Option.getOrThrow(activeProvider(sid(k), e.realm)).id]))
      e.state = "starting"; e.epoch++; e.buildBegun = false; changed = true
      e.cause = e.wakeCause ?? (yield* CurrentCause); e.wakeCause = undefined
      retire(e.principal)
      e.principal = mint({ id: e.pluginId, realm: e.realm, ...defRef(e.def), revision: revision + 1 })   // BEH-BR-257
      e.buildSeq = pass; e.buildOwner = owner
      e.build = yield* Effect.forkIn(runBuild(e, e.epoch).pipe(Effect.provideService(CurrentOwner, undefined)), hostScope)
    }
    if (changed) yield* commit
  })

  /**
   * A build begins when it holds a slot (BEH-BR-034); it captures its providers then (BEH-BR-035). Until then a
   * stop cancels it rather than waiting for a slot (BEH-BR-034), and a requirement that vanished meanwhile sends
   * the plugin back to `waiting`, not to `failed` (prototype finding G25).
   */
  const runBuild = (e: Entry, epoch: number): Effect.Effect<void> => Effect.gen(function* () {
    // A build is a transition step; it can progress only when a slot is free (BEH-BR-178).
    yield* scheduling.transition({
      kind: "build", pluginId: e.pluginId, realm: e.realm, owner: e.buildOwner?.owner ?? "system-start",
      ...(e.buildOwner?.correlationId ? { correlationId: e.buildOwner.correlationId } : {}), seq: e.buildSeq, tie: String(e.order).padStart(12, "0")
    }, () => buildsRunning < concurrency, Effect.void)
    yield* buildSem.take(1)
    buildsRunning++
    let held = true
    const releaseSlot = Effect.suspend(() => { if (!held) return Effect.void; held = false; buildsRunning--; return buildSem.release(1) })
    return yield* runBuildInSlot(e, epoch, releaseSlot).pipe(Effect.ensuring(releaseSlot))
  })
  const runBuildInSlot = (e: Entry, epoch: number, releaseSlot: Effect.Effect<unknown>): Effect.Effect<void> => Effect.gen(function* () {
    const begun = yield* locked(Effect.sync(() => {
      if (e.epoch !== epoch || e.state !== "starting") return false
      e.buildBegun = true
      return true
    }))
    if (!begun) return
    if (!(yield* loadIfNeeded(e, epoch))) return
    // Captured services, with the KeyMismatch check (BEH-BR-038): same ServiceId, different key object.
    let ctx = Context.empty() as Context.Context<any>
    const failActivation = (message: string) => locked(Effect.gen(function* () {
      if (e.epoch !== epoch) return
      e.state = "failed"; e.failure = { phase: "activation", message }
      yield* commit
    }))
    for (const k of e.def.requires) {
      const p = Option.getOrUndefined(activeProvider(sid(k), e.realm))
      if (!p) return yield* locked(Effect.gen(function* () {
        if (e.epoch !== epoch || e.state !== "starting") return
        e.state = "waiting"; e.providers = new Map(); e.buildBegun = false
        yield* commit
      }))
      // Between two contract references the registered-pair check replaces the object check (BEH-BR-229).
      if (!(refKind(p.key) && refKind(k)) && underlyingKey(p.key) !== underlyingKey(k)) return yield* failActivation(`KeyMismatch ${sid(k)}`)
      // The consumer receives its interceptions' wrapper; a wrap that throws fails this activation only (BEH-BR-151, 152).
      const wrapped = yield* deliver({ consumer: consumerOfEntry(e), entry: e, realm: e.realm, key: k, providerId: p.id, service: p.service, route: "required", hostRoute: false }).pipe(Effect.exit)
      if (Exit.isFailure(wrapped)) {
        const err = Cause.squash(wrapped.cause)
        if (err instanceof ResolutionRefused) return yield* failActivation(`ResolutionRefused ${sid(k)}: ${err.reason}`)   // phase activation (BEH-BR-274)
        return yield* failActivation(`interception of ${sid(k)} failed: ${msg(err)}`)
      }
      ctx = Context.add(ctx, k, wrapped.value)
    }
    // Configuration is read and decoded afresh before build (BEH-BR-097, 099); a failure publishes nothing.
    let cfg: unknown = undefined
    if (e.def.config) {
      const raw = e.override ? Effect.succeed(e.override.raw) : options.config ? options.config(e.pluginId) : Effect.succeed(undefined)
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
    e.background = []; e.whenAvailable = []
    const scope = yield* Scope.fork(pluginsScope, "sequential")
    ctx = Context.add(ctx, PluginRuntime, runtimeFor(e, epoch, scope))
    const memo = yield* Layer.makeMemoMap                       // fresh per activation (BEH-BR-036)
    yield* emit({ type: "build-started" }, e.id)
    const startedAt = yield* Clock.currentTimeMillis
    // The build slot covers the build only: discarding an activation (below) may wait for its children's builds.
    const exit = yield* Layer.buildWithMemoMap(e.def.build, memo, scope).pipe(
      Effect.provideContext(ctx),
      // A build, and the finalizers it registers, carry the plugin in HeldPlugins (BEH-BR-088, R11).
      Effect.provideService(HeldPlugins, new Set([e.id])),
      // Plugin code runs under its activation's principal, with empty annotations and no correlation (BEH-BR-258, 292, 187).
      Effect.provideService(PrincipalReference, e.principal ? Option.some(e.principal) : Option.none()),
      Effect.provideService(PolicySeam, seam),
      Effect.provideService(CurrentAnnotations, Ann.empty),
      Effect.provideService(CurrentCorrelation.reference, Option.none()),
      Effect.provideService(HostLink.reference, Option.some(link)),
      // Helpers called inside the activation report ownership through ActivePlugin (BEH-BR-163, 168, 174).
      Effect.provideService(ActivePlugin, Option.some({
        pluginId: e.pluginId, realm: e.realm,
        contributed: (registry: string, id: string) => { e.contributions.push({ registry, id }) },
        withdrawn: (registry: string, id: string) => { e.contributions = e.contributions.filter((c) => c.registry !== registry || c.id !== id) },
        revoked: (generation: string, leases: number) => { Effect.runFork(emit({ type: "lease-revoked", leases, generation }, e.id)) }
      })),
      Effect.timeoutOrElse({ duration: buildTimeout, orElse: () => Effect.fail(new Error("build timeout")) }),
      Effect.exit)
    yield* releaseSlot                                         // discarding below may wait for children's builds
    // Handoff import (BEH-BR-349): after the build, before publication; each step under handoffTimeout.
    let handoff: { readonly tag?: string; readonly importFailed?: true; readonly causeId: string | undefined } | undefined
    if (e.handoffLoss) { handoff = e.handoffLoss; e.handoffLoss = undefined }
    if (e.held) {
      const held = e.held; e.held = undefined
      const h = e.def.handoff
      const bound = <A>(x: Effect.Effect<A, unknown, any>) => x.pipe(Effect.provideContext(Exit.isSuccess(exit) ? exit.value as Context.Context<any> : Context.empty()), Effect.provideService(HeldPlugins, new Set([e.id])), Effect.provideService(CurrentActor, Actor.unattributed),
        Effect.timeoutOrElse({ duration: handoffTimeout, orElse: () => Effect.fail("timeout") }), Effect.exit) as Effect.Effect<Exit.Exit<A, unknown>>
      if (Exit.isFailure(exit) || !h) handoff = { tag: "HandoffAbandoned", causeId: held.causeId }
      else {
        let encoded: unknown = held.encoded
        let lost: string | undefined
        if (held.version !== h.version) {
          if (!(h.accepts ?? [h.version]).includes(held.version) || !h.upgrade) lost = "HandoffVersionUnaccepted"
          else { const u = yield* bound(h.upgrade({ version: held.version, encoded })); if (Exit.isSuccess(u)) encoded = u.value; else lost = "HandoffUpgradeFailed" }
        }
        if (!lost) {
          const d = yield* bound(Schema.decodeUnknownEffect(h.schema)(encoded, { onExcessProperty: "ignore" }))
          if (Exit.isFailure(d)) lost = "HandoffDecodeFailed"
          else {
            const im = yield* bound(h.import(d.value))
            handoff = Exit.isSuccess(im) ? { causeId: held.causeId } : { tag: "HandoffImportFailed", importFailed: true, causeId: held.causeId }
          }
        }
        if (lost) handoff = { tag: lost, causeId: held.causeId }
      }
    }
    const writeHandoff = handoff ? Effect.gen(function* () {
      const hf = handoff!
      yield* systemRecord("handoff", e, hf.causeId, hf.tag ? { _tag: hf.tag, message: `handoff lost at ${hf.tag.replace("Handoff", "").toLowerCase()}` } : undefined)
      if (hf.tag) { yield* emit({ type: "handoff-lost", tag: hf.tag }, e.id); yield* Effect.logWarning(`handoff of ${e.id} lost: ${hf.tag}`) }
      else yield* emit({ type: "handoff-imported" }, e.id)
    }) : Effect.void
    const durationMs = (yield* Clock.currentTimeMillis) - startedAt
    e.lastBuildMs = durationMs
    yield* emit({ type: "build-finished", durationMs, outcome: Exit.isSuccess(exit) ? "success" : Cause.hasInterruptsOnly(exit.cause) ? "interrupted" : "failure" }, e.id)
    let discard = false
    yield* locked(Effect.gen(function* () {
      if (e.epoch !== epoch || e.state !== "starting") {                          // stale (BEH-BR-039)
        discard = true
        // A stop waited for this build (G-P14): a failure drops "activation-failed"; a success is discarded by the
        // starting row of 08, so nothing publishes and the prototype drops "ended" (finding G-P19).
        if (e.heldUntilSettled) { e.heldUntilSettled = false; yield* dropHeld(e, Exit.isFailure(exit) ? "activation-failed" : "ended") }
        return
      }
      // A runtime failure signalled during the build fails the activation; nothing is published (BEH-BR-091).
      if (Exit.isSuccess(exit) && e.pendingFailure !== undefined) {
        discard = true; e.state = "failed"; e.failure = { phase: "activation", message: e.pendingFailure }; e.pendingFailure = undefined
        yield* dropHeld(e, "activation-failed"); yield* commit; return
      }
      if (Exit.isFailure(exit)) {
        discard = true; e.state = "failed"; e.failure = { phase: "build", message: msg(Cause.squash(exit.cause)) }
        yield* commit; yield* writeHandoff; yield* systemRecord("system-start", e, e.cause, { _tag: "ActivationFailed", message: e.failure.message }); yield* dropHeld(e, "activation-failed"); return
      }
      if (handoff?.importFailed) {
        discard = true; e.state = "failed"; e.failure = { phase: "activation", message: "handoff import failed" }
        yield* dropHeld(e, "activation-failed"); yield* commit; yield* writeHandoff; yield* systemRecord("system-start", e, e.cause, { _tag: "ActivationFailed", message: e.failure.message }); return
      }
      const built = exit.value as Context.Context<any>
      const absent = e.def.provides.filter((k) => Option.isNone(Context.getOption(built, k)))
      if (absent.length) {
        discard = true; e.state = "failed"; e.failure = { phase: "activation", message: `did not provide ${absent.map(sid).join(", ")}` }
        yield* dropHeld(e, "activation-failed"); yield* commit; return
      }
      e.scope = scope; e.services = built; e.state = "active"; e.failure = undefined   // atomic publication (BEH-BR-037)
      e.configRef = configRef; e.configValue = cfg; e.health = "unknown"; e.healthFails = 0
      yield* commit
      yield* writeHandoff                                      // before system-start (BEH-BR-350)
      yield* systemRecord("system-start", e, e.cause)
      // After the revision that published it and before any waiting stop begins (BEH-BR-251, G-P14).
      if (e.heldEvent) yield* deliverHeld(e)
      if (e.lazy?.def.idle !== undefined) yield* Effect.forkIn(idleLoop(e, epoch), scope)
      if (e.def.health) e.healthFiber = yield* Effect.forkIn(healthLoop(e, epoch, ctx), scope)
      yield* settle
    }))
    if (discard) {
      // Children mounted by a discarded activation are removed before its scope closes (BEH-BR-121, 128).
      yield* unmountChildren(e)
      yield* Scope.close(scope, Exit.void)
      retire(e.principal); e.captures = []
    }
  })

  // ---------------------------------------------------------------- runtime failure and health (BEH-BR-089..096)
  /** One Plugin.Runtime per activation, bound to its scope (BEH-BR-089). */
  const runtimeFor = (e: Entry, epoch: number, activationScope: Scope.Scope): PluginRuntime["Service"] => ({
    principal: e.principal!,
    asSelf: (effect) => Effect.provideService(effect, PrincipalReference, e.principal ? Option.some(e.principal) : Option.none()),
    entitled: entitledFor(e, activationScope),
    unmount: (child, o) => Effect.gen(function* () {
      const c = entries.get(keyOf(child.id, child.realm))
      if (!c || c.parentKey !== e.id) return
      // BEH-BR-126: one unmount-requested record naming who asked, causing the removal's records.
      const rid = yield* systemRecord("unmount-requested", c, e.cause, undefined, { requestedBy: o.context.actor } as never)
      yield* Effect.exit(stopDependent(c, e.id, { mode: "no-caller" }, e.id)).pipe(Effect.provideService(CurrentCause, rid))
    }),
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
    reportFailure: (cause) => failRuntime(e, epoch, msg(Cause.squash(cause))),

    // ---- children (BEH-BR-121–126)
    install: (child, o = {}) => Effect.gen(function* () {
      const callerScope = yield* Effect.scope                // only inside the activation (BEH-BR-121)
      if (isLazy(child)) return yield* Effect.fail(new InvalidDefinition({ id: (child as { id: string }).id, reason: "a lazy definition cannot be a child" }))
      const realm = o.realm ?? e.realm
      const id = `${e.pluginId}/${child.id}`                 // always prefixed (BEH-BR-122)
      const ident: Ident = { key: keyOf(id, realm), id, realm, parentKey: e.id }
      // Inherited unless the options set them (BEH-BR-122, 151).
      const intercept = o.intercept !== undefined ? { inherited: [], own: o.intercept } : { inherited: [...e.intercept.inherited, ...e.intercept.own], own: [] }
      return yield* locked(Effect.gen(function* () {
        if (closing || closed) return yield* Effect.fail(new HostClosed())
        // A parent that has begun to leave mounts nothing: its children are being removed (prototype finding G19).
        if (e.epoch !== epoch || entries.get(e.id) !== e || (e.state !== "starting" && e.state !== "active") || e.failing)
          return yield* Effect.fail(new Conflict({ id: e.pluginId, pending: e.stopReason ?? "stopping" }))
        // allowChildren, the AccessPolicy and the RefusalList, before anything is registered (BEH-BR-263, 264, 267).
        const refuseChild = (reason: string) => emit({ type: "child-refused", childId: id, reason } as never, e.id).pipe(Effect.andThen(Effect.fail(new ChildNotAllowed({ parentId: e.pluginId, childId: id, reason }))))
        if (!e.allowChildren) return yield* refuseChild("allowChildren: false")
        if (Option.isSome(accessOpt) && e.principal) {
          const d = decideSafely(accessOpt.value, { kind: "child", principal: refOf(e.principal), childId: id, definition: defRef(child) })
          if (d !== "allow") return yield* refuseChild(d.deny)
        }
        yield* validate(child, ident)                        // registers nothing on error (BEH-BR-121)
        const digest = child.meta?.digest
        if (Option.isSome(refusalOpt) && digest !== undefined) {
          const r = refusalOpt.value.refused({ id, realm, ...(child.meta?.version ? { version: child.meta.version } : {}), digest })
          if (Option.isSome(r)) {
            const ghost = newEntry(child, ident, {})
            yield* systemRecord("start-refused", ghost, e.cause, { _tag: "DigestRefused", message: "refused-digest" })
            return yield* Effect.fail(new ChildNotAllowed({ parentId: e.pluginId, childId: id, reason: `refused-digest: ${r.value}` }))
          }
        }
        const c = newEntry(child, ident, { ...(o.disabled ? { disabled: true } : {}), ...(o.config !== undefined ? { config: o.config } : {}), intercept,
          mandatoryChain: [...e.mandatoryChain, ...(o.mandatory ?? [])], allowChildren: e.allowChildren && (o.allowChildren ?? true) })
        entries.set(c.id, c)
        yield* emit({ type: "plugin-installed" }, c.id)
        yield* commit
        // A mount is a system transition caused by the record that began the parent's activation (BEH-BR-126, 190).
        const rid = yield* systemRecord("system-start", c, e.cause)
        yield* settle.pipe(Effect.provideService(CurrentCause, rid ?? e.cause))
        // Mounted under a sub-scope of the activation: removed when that scope closes, never parked, ungated (BEH-BR-121, 126).
        if (callerScope !== activationScope) yield* Scope.addFinalizer(callerScope, Effect.suspend(() => {
          const now = entries.get(c.id)
          return now === c ? Effect.exit(stopDependent(c, e.id, { mode: "no-caller" }, e.id)).pipe(Effect.provideService(CurrentCause, rid), Effect.asVoid) : Effect.void
        }))
        return handleOf(c.id)
      }))
    }),

    // ---- optional and reactive dependencies (BEH-BR-129–136)
    optional: (key) => Effect.gen(function* () {
      if (!declaredOptional(e, key)) return yield* undeclared(e, key)
      const p = Option.getOrUndefined(activeProvider(sid(key), e.realm))
      if (!p || !optionalCompatible(e, key, p.id)) return Option.none()     // not leased (BEH-BR-130); incompatible = absent (BEH-BR-229)
      const got = yield* Effect.exit(deliver({ consumer: consumerOfEntry(e), entry: e, realm: e.realm, key, providerId: p.id, service: p.service, route: "optional", hostRoute: false }))
      if (Exit.isSuccess(got)) return Option.some(got.value as never)
      const err = Cause.squash(got.cause)
      if (err instanceof ResolutionRefused) { yield* emit({ type: "resolution-refused", serviceId: sid(key), route: "optional" } as never, e.id); return Option.none() }
      return yield* Effect.die(err)
    }),
    useOptional: (key, run) => Effect.gen(function* () {
      if (!declaredOptional(e, key)) return yield* undeclared(e, key)
      const pNow = Option.getOrUndefined(activeProvider(sid(key), e.realm))
      if (pNow && !optionalCompatible(e, key, pNow.id)) return Option.none()   // BEH-BR-229
      const r = yield* Effect.exit(useAllIn([key] as const, ([s]) => run(s as never), { realm: e.realm, consumer: e }))
      if (Exit.isSuccess(r)) return Option.some(r.value)
      const err = Cause.squash(r.cause)
      if (err instanceof ServiceUnavailable && !Cause.hasInterrupts(r.cause)) return Option.none()   // unavailable is normal (BEH-BR-131)
      if (err instanceof ResolutionRefused) { yield* emit({ type: "resolution-refused", serviceId: sid(key), route: "optional" } as never, e.id); return Option.none() }
      return yield* Effect.failCause(r.cause as Cause.Cause<never>)
    }),
    whenAvailable: (keys, run, o = {}) => Effect.gen(function* () {
      const scope = yield* Effect.scope                      // the activation scope: the registration ends with it (BEH-BR-132)
      const reg = { name: o.name ?? `whenAvailable#${(e.whenAvailable?.length ?? 0) + 1}`, keys: keys.map(sid), running: false }
      e.whenAvailable?.push(reg)
      const policy = o.onFailure ?? "fail-plugin"
      const allAvailable = () => keys.every((k) => { const p = Option.getOrUndefined(activeProvider(sid(k), e.realm)); return !!p && (!declaredOptional(e, k) || optionalCompatible(e, k, p.id)) })
      const waitFor = (pred: () => boolean) => SubscriptionRef.changes(feed).pipe(Stream.filter(() => pred()), Stream.take(1), Stream.runDrain)
      // One run: a lease on every key held by the run's own fiber, then a child scope; finalizers run before the lease ends.
      const once = Effect.scoped(Effect.gen(function* () {
        const self = yield* Effect.fiber
        const granted = yield* acquire(keys, self as Fiber.Fiber<unknown, unknown>, e.realm, true)
        reg.running = true
        yield* Effect.addFinalizer(() => Effect.sync(() => { reg.running = false }))
        const services = [] as Array<unknown>
        for (let i = 0; i < keys.length; i++) {
          const k = keys[i]!
          const got = yield* Effect.exit(deliver({ consumer: consumerOfEntry(e), entry: e, realm: e.realm, key: k, providerId: granted.providerIds[i]!, service: (granted.services as ReadonlyArray<unknown>)[i], route: "whenAvailable", hostRoute: false }))
          if (Exit.isFailure(got)) {
            if (Cause.squash(got.cause) instanceof ResolutionRefused) { yield* emit({ type: "resolution-refused", serviceId: sid(k), route: "whenAvailable" } as never, e.id); return yield* Effect.fail(HELD_BACK) }
            return yield* Effect.failCause(got.cause)
          }
          services.push(got.value)
        }
        // A run carries only the leases it holds (BEH-BR-136).
        return yield* run(services as unknown as ServicesOf<typeof keys>).pipe(Effect.provideService(HeldPlugins, new Set(granted.ids)))
      }))
      const loop = Effect.gen(function* () {
        let failures = 0
        while (true) {
          yield* waitFor(allAvailable)
          const fiber = yield* Effect.forkChild(once)
          const exit = yield* Fiber.await(fiber)
          if (Exit.isSuccess(exit)) { yield* waitFor(() => !allAvailable()); continue }   // ran to completion: again when the keys return
          if (Cause.hasInterruptsOnly(exit.cause)) continue                               // a provider leaving is not a failure (BEH-BR-134)
          if (Cause.squash(exit.cause) === HELD_BACK) { yield* waitFor(() => !allAvailable()); continue }   // refused: held back (BEH-BR-274)
          if (Cause.squash(exit.cause) instanceof ServiceUnavailable) continue           // a provider left between the check and the lease
          const message = `whenAvailable ${reg.name}: ${msg(Cause.squash(exit.cause))}`
          if (policy === "ignore") { yield* Effect.logError(message).pipe(Effect.annotateLogs({ plugin: e.pluginId })); yield* waitFor(() => !allAvailable()); continue }
          if (policy === "restart" && ++failures <= 3) { yield* Effect.sleep(100); continue }   // the background default schedule (BEH-BR-134)
          return yield* failRuntime(e, epoch, message)
        }
      })
      yield* Effect.forkIn(loop.pipe(Effect.provideService(HeldPlugins, new Set<string>())), scope)
    })
  })
  /** BEH-BR-229: an optional contract key whose provider is incompatible is absent. */
  const optionalCompatible = (e: Entry, key: Context.Key<any, any>, providerId: string): boolean => {
    const declared = (e.def.optional ?? []).find((k) => sid(k) === sid(key))
    const req = declared ? requirementOf(declared) : undefined
    if (!req) return true
    const owner = providerId === "base" ? "base" as const : [...entries.values()].find((x) => x.pluginId === providerId && x.def.provides.some((k) => sid(k) === sid(key)))
    return owner !== undefined && incompatibility(req, provisionIn(owner, sid(key))) === undefined
  }
  const declaredOptional = (e: Entry, key: Context.Key<any, any>) => (e.def.optional ?? []).some((k) => sid(k) === sid(key))
  /** An undeclared optional key: None and a warning naming it (BEH-BR-130). */
  const undeclared = (e: Entry, key: Context.Key<any, any>) =>
    Effect.logWarning(`undeclared optional dependency ${sid(key)}`).pipe(Effect.annotateLogs({ plugin: e.pluginId }), Effect.as(Option.none()))

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
    readonly correlationId?: string                       // the operator call that owns the stop (StepItem)
    readonly seq?: number                                 // arrival of the stop's root (StepItem)
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
    let restored: ReadonlyArray<Fingerprint> = []
    if (f.overrideBefore) {
      paths = changedPaths(d.override?.raw, f.overrideBefore.value?.raw)
      d.override = f.overrideBefore.value                    // the last completed configuration (BEH-BR-101, T13)
      // The restored override's stored fingerprints; the port is never called again (CCR-BR-014).
      restored = (d.override?.fingerprints ?? []).filter((x) => paths.includes(x.path))
    }
    yield* commit
    yield* emit({ type: "stop-resumed", by, endsIntent: f.op }, d.id)
    yield* systemRecord("intent-ended", d, yield* CurrentCause, undefined, {
      ...(f.causeId ? { endsIntentOf: f.causeId } : {}), ...(paths.length ? { configChange: { paths, ...(restored.length ? { fingerprints: restored } : {}) } } : {})
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
      if (opts.seq === undefined) opts = { ...opts, seq: ++arrivals }
      const waitItem = (): StepItem => {
        const e = entries.get(id), w = cascadeFrom !== undefined ? entries.get(cascadeFrom) : undefined
        return { kind: "wait", pluginId: e?.pluginId ?? id, realm: e?.realm ?? "default", ...(w ? { waiter: w.pluginId } : {}), owner: reason,
          ...(opts.correlationId ? { correlationId: opts.correlationId } : {}), seq: opts.seq!, tie: `${e?.realm ?? "default"}\u0000${e?.pluginId ?? id}` }
      }
      const timeoutOf = (leases: number) => new DrainTimeout({ id, leases, ...(root !== id ? { target: root } : {}) })
      // A cascade waits for the dependent's running transition step under its own drain limit (BEH-BR-079, R12).
      if (cascadeFrom !== undefined && limit !== "forever") {
        const got = yield* restore(takeStep(sem, waitItem).pipe(Effect.as(true), Effect.timeoutOrElse({ duration: limit, orElse: () => Effect.succeed(false) })))
        if (!got) {
          const e = entries.get(id)
          if (!opts.force && (opts.mode ?? "operator") === "operator" && !closing) {
            yield* emit({ type: "drain-timeout", leases: e?.leases ?? 0, ...(root !== id ? { target: root } : {}) }, id)
            return yield* Effect.fail(timeoutOf(e?.leases ?? 0))
          }
          if (e && e.leases > 0) yield* revoke(e)
          yield* restore(takeStep(sem, waitItem))
        }
      } else yield* restore(takeStep(sem, waitItem))
      return yield* restore(stopStep(id, reason, opts, cascadeFrom, root)).pipe(Effect.ensuring(sem.release(1)))
    }))

  /**
   * One dependent or child in a provider's stop (BEH-BR-043, 079, 080). A child is removed — stopped, then
   * unregistered — whatever it holds; a dependent that is not a child lands in `waiting` (BEH-BR-121, 125).
   */
  const stopDependent = (d: Entry, id: string, opts: StopOpts, root: string): Effect.Effect<void, StopFailure> => Effect.gen(function* () {
    const isChild = d.parentKey === id
    // A cascade that meets a parked operation resumes it and ends its intent, with its own record (BEH-BR-080, T1).
    yield* locked(Effect.gen(function* () {
      const pf = flights.get(d.id)
      if (pf?.parked) yield* endIntent(d, pf, "cascade")
      else if (d.parkedSystem) yield* emit({ type: "stop-resumed", by: "cascade" }, d.id)
      if (isChild && !d.removing) { d.removing = true; yield* commit }
    }))
    const r = yield* Effect.exit(stopTree(d.id, "dependency-loss", { ...opts, land: undefined, correlationId: undefined }, id, root))
    if (Exit.isFailure(r)) {
      const err = Cause.squash(r.cause)
      if (err instanceof CleanupError) {
        // A dependent's cleanup failure is its own (failed, phase cleanup); the provider's stop continues (BEH-BR-046).
        opts.hooks?.cleanupFailed?.(d.id, err.message)
        if (isChild) return yield* unregister(d, { _tag: "CleanupError", message: err.message })
        yield* locked(Effect.gen(function* () { yield* commit; yield* systemRecord("system-stop", d, yield* CurrentCause, { _tag: "CleanupError", message: err.message }) }))
        return
      }
      // Every dependency-loss stop this call started that has not settled parks with it (BEH-BR-079, R9);
      // a child's parked stop keeps `next` "gone" (BEH-BR-125).
      if (err instanceof DrainTimeout && d.state === "stopping")
        yield* locked(Effect.gen(function* () {
          d.parkedSystem = true; d.stopReason = "dependency-loss"; yield* commit
          yield* emit({ type: "stop-parked", leases: d.leases, ...(root !== d.id ? { target: root } : {}) }, d.id)
        }))
      return yield* Effect.failCause(r.cause)
    }
    if (isChild) { yield* unregister(d); opts.hooks?.stopped?.(d.id); return }
    if (!r.value) return
    yield* locked(Effect.gen(function* () {
      if (d.state === "stopping") d.state = "waiting"
      d.parkedSystem = false
      yield* commit
      yield* systemRecord("system-stop", d, yield* CurrentCause)
    }))
    opts.hooks?.stopped?.(d.id)
  })
  /** Unregisters a removed child: its `system-stop` record is caused by the cascade root (BEH-BR-126, 190). */
  const unregister = (d: Entry, error?: { readonly _tag: string; readonly message: string }) => locked(Effect.gen(function* () {
    if (entries.get(d.id) !== d) return                       // removed directly meanwhile: nothing to do (BEH-BR-125)
    entries.delete(d.id); flights.delete(d.id)
    yield* emit({ type: "plugin-removed" }, d.id)
    yield* commit
    yield* systemRecord("system-stop", d, yield* CurrentCause, error, { after: { state: "uninstalled", revision, ...defRef(d.def) } })
  }))
  /** Children of an activation that ended without a stop (a failed or discarded build) (BEH-BR-121, 128). */
  const unmountChildren = (e: Entry) => Effect.gen(function* () {
    for (const c of [...entries.values()].filter((x) => x.parentKey === e.id).sort((a, b) => b.order - a.order))
      yield* Effect.exit(stopDependent(c, e.id, { mode: "no-caller" }, e.id))
  })

  /** A stop step that has work to do is a transition step of the scheduler (BEH-BR-178). */
  const stopStep = (id: string, reason: string, opts: StopOpts, cascadeFrom: string | undefined, root: string): Effect.Effect<boolean, StopFailure> => Effect.suspend(() => {
    const e = entries.get(id)
    const work = !!e && (cascadeFrom === undefined || holds(e, cascadeFrom) || e.parentKey === cascadeFrom) &&
      (e.state === "starting" || e.state === "active" || (e.state === "stopping" && !!e.scope))
    const body = stopStepBody(id, reason, opts, cascadeFrom, root)
    if (!work) return body
    // Counted from the request, not from the step's start: a scheduler may hold the step (BEH-BR-178), and a
    // system stop held there has no flight and no state change yet for `awaitIdle` to see (finding G33).
    stopsRequested++
    return scheduling.transition({ kind: "stop", pluginId: e!.pluginId, realm: e!.realm, owner: reason,
      ...(opts.correlationId ? { correlationId: opts.correlationId } : {}), seq: opts.seq ?? ++arrivals, tie: `${e!.realm}\u0000${e!.pluginId}` }, () => true, body).pipe(
      Effect.ensuring(Effect.sync(() => { stopsRequested-- })))
  })
  const stopStepBody = (id: string, reason: string, opts: StopOpts, cascadeFrom: string | undefined, root: string): Effect.Effect<boolean, StopFailure> => Effect.gen(function* () {
    const e = entries.get(id)
    if (!e) return false
    if (cascadeFrom !== undefined && !holds(e, cascadeFrom) && e.parentKey !== cascadeFrom) return false   // its own step already released the provider
    // A build in flight is invalidated and allowed to settle; its result is discarded (BEH-BR-039).
    if (e.state === "starting") {
      const b = e.build
      // Parked in "stopping" (not "waiting") so that no other settle starts a second build meanwhile.
      const begun = yield* locked(Effect.sync(() => { e.epoch++; e.state = "stopping"; e.stopReason = reason; e.stepRunning = true; return !!e.buildBegun }))
      // A begun build settles uninterrupted (BEH-BR-039); one still waiting for a slot is cancelled (BEH-BR-034).
      if (begun && e.heldEvent) e.heldUntilSettled = true
      if (b) yield* (begun ? Fiber.await(b) : Fiber.interrupt(b)).pipe(Effect.ensuring(Effect.sync(() => { e.stepRunning = false })))
      else e.stepRunning = false
      if (e.heldUntilSettled) { e.heldUntilSettled = false; yield* dropHeld(e, "ended") }
      return true
    }
    if (e.state !== "active" && e.state !== "stopping") return false
    if (e.state === "stopping" && !e.scope) return false                     // already closed by the step this call waited for
    e.stepRunning = true
    return yield* Effect.gen(function* () {
    // Hidden from new consumers in the revision the stop begins, before dependents stop (BEH-BR-042),
    // so no build started meanwhile — a dependent's own restart included — can capture it.
    const wasActive = e.state === "active"
    const drained = yield* locked(Effect.gen(function* () {
      e.state = "stopping"; e.stopReason = reason; e.parkedSystem = false
      if (!e.drained || (yield* Deferred.isDone(e.drained))) e.drained = yield* Deferred.make<void>()
      if (e.leases === 0) yield* Deferred.succeed(e.drained, undefined)
      yield* commit
      return e.drained
    }))
    // Leaving `active` interrupts an in-flight health check; its lease ends with it, uncounted (BEH-BR-092, 093).
    if (e.healthFiber) { const hf = e.healthFiber; e.healthFiber = undefined; yield* Fiber.interrupt(hf) }
    // A whenAvailable run holding this provider is interrupted as the stop begins, without waiting for the drain
    // limit; its finalizers and lease are then drained like any lease (BEH-BR-133).
    for (const f of [...e.reactive]) yield* Effect.forkDetach(Fiber.interrupt(f))
    // Dependents first, each fully stopped before the provider (BEH-BR-043).
    for (const d of dependentsOf(id).sort((a, b) => b.order - a.order)) yield* stopDependent(d, id, opts, root)
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
    // Handoff export (BEH-BR-346, 347): after the drain, before the scope closes, for a replace of an active plugin
    // whose old and new definitions both declare handoff, or a restart/reconfigure the definition lists in alsoOn.
    if (cascadeFrom === undefined && wasActive && e.def.handoff && e.services) {
      const f = flights.get(id)
      const h = e.def.handoff
      const admits = f && !(f.opts as { cold?: boolean }).cold && (
        (f.op === "replace" && f.target.kind === "swap" && !!f.target.def.handoff && !isLazy(f.target.def)) ||
        (f.op === "restart" && (h.alsoOn ?? []).includes("restart")) ||
        (f.op === "reconfigure" && (h.alsoOn ?? []).includes("reconfigure")))
      if (admits) {
        const out = yield* h.export.pipe(
          Effect.flatMap((v) => Schema.encodeUnknownEffect(h.schema)(v)),
          Effect.provideContext(e.services), Effect.provideService(HeldPlugins, new Set([e.id])), Effect.provideService(CurrentActor, Actor.unattributed),
          Effect.timeoutOrElse({ duration: handoffTimeout, orElse: () => Effect.fail("timeout") }), Effect.exit)
        if (Exit.isSuccess(out)) e.held = { version: h.version, encoded: out.value, causeId: f!.causeId }
        else e.handoffLoss = { tag: "HandoffExportFailed", causeId: f!.causeId }
      }
    }
    // Close the scope; a finalizer that fails leaves failed(cleanup) (BEH-BR-046).
    const scope = e.scope
    const closeExit = scope ? yield* Effect.exit(Scope.close(scope, Exit.void)) : Exit.void
    retire(e.principal)                                        // retirement follows the finalizers (BEH-BR-257)
    e.captures = []
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
    yield* dropHeld(e, "ended")                                 // removed, replaced or disabled before it became active
    switch (t.kind) {
      case "gone": entries.delete(id); yield* emit({ type: "plugin-removed" }, id); break   // a cleanup-failed plugin: the leak is acknowledged, not re-run (BEH-BR-047)
      case "swap": e.def = t.def; e.lazy = undefined; e.failure = undefined; e.cleanupFailed = false; e.override = undefined; e.state = t.disabled ? "disabled" : "waiting"; break
      case "rebuild": e.state = restState(e); e.failure = undefined; break
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
    const stop = yield* Effect.exit(skipStop ? Effect.succeed(false) : stopTree(id, f.op, { ...f.opts, correlationId: f.correlationId }))
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
  }).pipe(Effect.provideService(CurrentCause, f.causeId), Effect.provideService(CurrentOwner, { owner: f.op, correlationId: f.correlationId }))

  /**
   * BEH-BR-073: a running system stop on the plugin is waited for before the call is decided (no intent
   * yet, so the wait is interruptible). Returns "parked" when the plugin's system stop is parked — then
   * only a stopping operation may resume it (BEH-BR-074, R8, R10).
   */
  const awaitSystemStop = (id: string, op: string) => Effect.gen(function* () {
    const e = entries.get(id)
    if (!e || e.state !== "stopping" || flights.has(id)) return "none" as const
    if (e.parkedSystem && !e.stepRunning) return "parked" as const
    // The running step settles; a contended wait is a pending item (BEH-BR-178).
    yield* takeStep(semOf(steps, id), () => ({ kind: "wait", pluginId: e.pluginId, realm: e.realm, waiter: e.pluginId, owner: op, seq: ++arrivals, tie: `${e.realm}\u0000${e.pluginId}` }))
    yield* semOf(steps, id).release(1)
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
      const pre = yield* Effect.exit(recheck.pipe(Effect.andThen(awaitSystemStop(id, op))))
      if (Exit.isFailure(pre)) {
        if (Cause.hasInterrupts(pre.cause)) return yield* Effect.interrupt
        yield* finishCaller(me, undefined, pre); return done
      }
      return yield* Effect.uninterruptible(Effect.gen(function* () {
      call.intent.value = true
      const e = entries.get(id)
      // Resuming a parked system stop is this call's intent: it owns the stop, then applies its target (R10).
      if (pre.value === "parked" && e && e.parkedSystem && !flights.has(id)) {
        // A parked child removal (`next` "gone") resumes only as a removal (prototype choice, finding G19).
        if (e.removing && op !== "remove") return yield* refuse(new Conflict({ id, pending: "remove" }))
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
      if (kind.value === "noop") {
        // An operator `disable` of a registration the RefusalList disabled takes it over: the reason is cleared,
        // the operator's flag set, and `registeredAt` moves (BEH-BR-318, CCR-BR-029).
        const ne = entries.get(id)
        if (op === "disable" && ne?.disabledReason === "refused-digest") { ne.disabledReason = undefined; yield* commit; yield* finishCaller(me, undefined, Exit.void); return done }
        yield* finishCaller(me, undefined, Exit.void, true); return done
      }
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

  /**
   * Step 4a (CCR-BR-014): hand the selected values of a new override to the ConfigFingerprinter, and only those.
   * Any failure, defect, timeout or malformed answer fails the call before the gate, with no record and no change.
   */
  const fingerprintsOf = (op: Operation, target: { readonly id: string; readonly realm: string } | undefined,
    cfg: { readonly form: "raw" | "decoded"; readonly paths: ReadonlyArray<string>; readonly value: (path: string) => unknown } | undefined
  ): Effect.Effect<ReadonlyArray<Fingerprint>, ConfigFingerprintUnavailable> => {
    if (Option.isNone(fpOpt) || !cfg || cfg.paths.length === 0 || !target || (op !== "install" && op !== "reconfigure")) return Effect.succeed([])
    const port = fpOpt.value
    const q = { operation: op, target }
    const unavailable = (why: string) => new ConfigFingerprintUnavailable({ operation: op, message: `configuration fingerprints unavailable: ${why}` })
    return Effect.gen(function* () {
      const selected = yield* port.select({ ...q, paths: cfg.paths })
      if (selected.some((x) => !cfg.paths.includes(x)) || new Set(selected).size !== selected.length) return yield* Effect.fail(unavailable("selection outside the changed paths"))
      if (selected.length === 0) return []
      const ordered = cfg.paths.filter((x) => selected.includes(x))
      const out = yield* port.fingerprint({ ...q, form: cfg.form, entries: ordered.map((path) => ({ path, value: cfg.value(path) })) })
      const byPath = new Map(out.map((x) => [x.path, x.fingerprint]))
      if (out.length !== ordered.length || byPath.size !== out.length || ordered.some((x) => !FINGERPRINT_FORMAT.test(byPath.get(x) ?? "")))
        return yield* Effect.fail(unavailable("malformed answer"))
      return ordered.map((path) => ({ path, fingerprint: byPath.get(path)! }))
    }).pipe(
      Effect.timeoutOrElse({ duration: fingerprintTimeout, orElse: () => Effect.fail(unavailable("timeout")) }),
      // Core writes the message itself: the port's own text could quote a value (CCR-BR-014).
      Effect.catchCause((c) => {
        if (Cause.hasInterrupts(c) && !Cause.hasFails(c)) return Effect.failCause(c as Cause.Cause<never>)   // interruption only
        const e = Cause.squash(c)
        const err = e instanceof ConfigFingerprintUnavailable ? e : unavailable(e && typeof e === "object" && "_tag" in e ? String((e as { _tag: unknown })._tag) : "defect")
        return Effect.logError(`config fingerprinter: ${op} ${target.id}@${target.realm}: ${err.message}`).pipe(Effect.andThen(Effect.fail(err)))
      }))
  }

  type MutationError = HostClosed | Unattributed | ReasonRequired | AuditUnavailable | OperationRejected | ConfigFingerprintUnavailable
  /**
   * The order of a mutating call (BEH-BR-188): HostClosed → attribution → latch → validation →
   * gate → requested record → WouldDeadlock → linearization point (re-validation, legality,
   * intent) → terminal record. Steps 1–7 run under the plugin's admission order, so WouldDeadlock
   * is decided before the call waits for anything a held lease could block (BEH-BR-088). The
   * linearization is short; a transition runs in a host fiber and the caller only awaits it.
   */
  const mutating = <A, E>(spec: {
    readonly operation: Operation
    readonly target?: { readonly id: string; readonly realm: string }
    /** defineRealm: records name the realm as `{ id: R, realm: R }` (BEH-BR-196). */
    readonly realmTarget?: string
    readonly options?: OperationOptions | undefined
    readonly definition?: DefinitionRef
    readonly validate: Effect.Effect<unknown, E>
    readonly linearize: (call: Call) => Effect.Effect<Deferred.Deferred<Settlement>>
    /** Fields every record of the call carries, read after validation (e.g. `configChange`, BEH-BR-197). */
    readonly extra?: () => Partial<Draft>
    /** The scope-close shutdown: Actor.system, exempt from attribution (BEH-BR-108). */
    readonly system?: boolean
    /** A new override value supplied by the call, read after validation (step 4a, CCR-BR-014). */
    readonly config?: () => { readonly form: "raw" | "decoded"; readonly paths: ReadonlyArray<string>; readonly value: (path: string) => unknown } | undefined
    /** Receives the fingerprints, to be stored with the override. */
    readonly fingerprinted?: (fps: ReadonlyArray<Fingerprint>) => void
  }): Effect.Effect<A, MutationError | E | WouldDeadlock | Conflict | Superseded | UnknownPlugin | DuplicatePlugin | DrainTimeout | CleanupError> => Effect.gen(function* () {
    const op = spec.operation
    const tkey = spec.target ? keyOf(spec.target.id, spec.target.realm) : undefined
    const key = tkey ?? "@host"
    const exempt = op === "shutdown" || op === "acknowledgeAuditDegraded"
    // Once a `requested` record is enqueued, a call interrupted before its intent changes nothing
    // and still ends with a terminal record: `failed`, error `Interrupted` (BEH-BR-067, 188).
    const pending: { owed?: Call["terminal"]; intent: { value: boolean } } = { intent: { value: false } }
    // A reconcile entry action: its records are caused by the parent `requested` record (BEH-BR-201).
    const internal = (spec.options ?? {}) as EntryAction
    return yield* Effect.onInterrupt(Effect.gen(function* () {
    const call = yield* Semaphore.withPermit(semOf(admissions, key), Effect.gen(function* () {
      // 1. host closed (a shutdown joins the one in progress, BEH-BR-109)
      if ((closed || closing) && op !== "shutdown") return yield* Effect.fail(new HostClosed())
      // 2. attribution — the scope-close path is Actor.system and exempt (BEH-BR-108)
      const rawCtx: OperationContext = spec.system ? { actor: Actor.system } : spec.options?.context ?? { actor: yield* CurrentActor }
      const clean = sanitizeContext(rawCtx)                    // lone surrogates → U+FFFD on the request and every record (BEH-BR-185)
      const ctx: OperationContext = clean.value
      const reserved = ctx.actor.id.startsWith("bridger:")
      if (!spec.system && (!ctx.actor.id.trim() || (attribution.require && reserved))) return yield* Effect.fail(new Unattributed({ operation: op }))
      if (!spec.system && (attribution.requireReason ?? []).includes(op) && !ctx.reason?.trim()) return yield* Effect.fail(new ReasonRequired({ operation: op }))
      // Step 2 also resolves the principal, the correlation and the annotations (BEH-BR-259, 187, 292).
      const principal = spec.system ? Option.none<PluginPrincipal>() : yield* CurrentPlugin.acting
      const onBehalfOf = Option.isSome(principal) ? refOf(principal.value) : undefined
      const fiberCorr = yield* CurrentCorrelation.get
      const correlationId = ctx.correlationId ?? (Option.isSome(fiberCorr) ? fiberCorr.value : yield* ids.next)
      const fiberAnn = yield* CurrentAnnotations
      const annotations = spec.system ? Ann.empty : Ann.resolve(isBag(fiberAnn) ? fiberAnn : Ann.empty, ctx.annotations as never)
      const audited = Ann.encode(Ann.filter(annotations, "audit"))
      const deadline = annotations.get(Annotation.Deadline)
      // 3. latch
      if (writer?.state.degraded && !exempt) return yield* Effect.fail(new AuditUnavailable({ operation: op, message: "audit degraded" }))
      // 4. validation (no record on failure)
      yield* spec.validate
      const target = spec.target ?? (spec.realmTarget !== undefined ? { id: spec.realmTarget, realm: spec.realmTarget } : undefined)
      // 4b. RefusalList (BEH-BR-267): before the gate; one `rejected` record, nothing changed.
      if (Option.isSome(refusalOpt) && target && tkey !== undefined && (op === "install" || op === "replace" || op === "enable" || op === "retry" || op === "restart") && !(op === "install" && (spec.options as InstallOptions | undefined)?.disabled)) {
        const ref = op === "install" || op === "replace" ? spec.definition : (entries.get(tkey) ? defRef(entries.get(tkey)!.def) : undefined)
        const refusal = refusalOf(target, ref)
        if (refusal !== undefined) {
          const reason = refusal
          if (writer) yield* writer.enqueue({ actor: ctx.actor, correlationId, operation: op, target, phase: "rejected", ...(ctx.reason ? { reason: ctx.reason } : {}), ...(internal.causedBy ? { causationId: internal.causedBy } : {}), ...(spec.definition ? { definition: spec.definition } : {}), error: { _tag: "OperationRejected", message: reason } })
          return yield* Effect.fail(new OperationRejected({ operation: op, reason, target }))
        }
      }
      // 4a. fingerprints of a new override value, before the gate so an approval can bind to them (CCR-BR-014).
      const fps = yield* fingerprintsOf(op, target, spec.config?.())
      if (fps.length) spec.fingerprinted?.(fps)
      const extra = spec.extra?.() ?? {}
      const configChange: ConfigChange | undefined = extra.configChange ? { ...extra.configChange, ...(fps.length ? { fingerprints: fps } : {}) } : undefined
      const base = { actor: ctx.actor, correlationId, operation: op, ...(ctx.reason ? { reason: ctx.reason } : {}), ...(target ? { target } : {}), ...extra,
        ...(configChange ? { configChange } : {}), ...(internal.causedBy ? { causationId: internal.causedBy } : {}), ...(internal.undoes ? { undoes: internal.undoes } : {}),
        ...(clean.sanitized ? { sanitized: true as const } : {}), ...(onBehalfOf ? { onBehalfOf } : {}),
        ...(audited.entries.length ? { annotations: audited.entries } : {}), ...(audited.omitted.length ? { annotationsOmitted: audited.omitted } : {}) }
      // requested and rejected records carry the definition the call presents (CCR-BR-014).
      const presented = spec.definition && tkey !== undefined ? { definition: spec.definition } : {}
      const before = tkey !== undefined ? { ...stateOfId(tkey), ...(spec.definition ?? {}) } : undefined
      let causeId: string | undefined
      const terminal: Call["terminal"] = (phase, extra) => writer
        ? writer.enqueue({ ...base, phase, ...(internal.causedBy ? {} : causeId ? { causationId: causeId } : {}), ...(tkey !== undefined ? { after: { ...stateOfId(tkey), ...(spec.definition ?? {}) } } : {}), ...extra }).pipe(Effect.asVoid)
        : Effect.void
      // 5. gate — never for shutdown (BEH-BR-223); a defect or timeout is a refusal (BEH-BR-221).
      // 6. requested record — fail closed, except shutdown (BEH-BR-203, BEH-BR-110).
      // From the gate's approval to the enqueue of the `requested` record nothing may interrupt the call,
      // so an approval is never consumed without a record (BEH-BR-188, R1).
      internal.reached?.()                                    // counted in the reconcile parent's `children` (BEH-BR-201)
      const req = yield* Effect.uninterruptibleMask((restore) => Effect.gen(function* () {
        if (Option.isSome(gateOpt) && op !== "shutdown") {
          const verdict = yield* restore(gateOpt.value.authorize({ operation: op, actor: ctx.actor, correlationId, ...(ctx.reason ? { reason: ctx.reason } : {}), ...(target ? { target } : {}), ...(spec.definition ? { definition: spec.definition } : {}), ...(configChange ? { configChange } : {}), ...(internal.undo ? { undo: true as const } : {}),
            ...(onBehalfOf ? { onBehalfOf } : {}), annotations: Ann.filter(annotations, "gate"), ...policyOf(tkey, spec.options) }).pipe(
            Effect.timeoutOrElse({ duration: Option.isSome(deadline) ? Math.max(0, Math.min(gateTimeout, deadline.value.at - (yield* Clock.currentTimeMillis))) : gateTimeout, orElse: () => Effect.fail(new OperationRejected({ operation: op, reason: "gate-timeout" })) }),
            Effect.as(undefined), Effect.catchCause((c) => {
              if (Cause.hasInterrupts(c) && !Cause.hasFails(c)) return Effect.failCause(c)
              const e = Cause.squash(c)
              return Effect.succeed(e instanceof OperationRejected ? e.reason : "gate-defect")
            }),
            // A caller interrupted while the gate decides leaves one `rejected` record (BEH-BR-221).
            Effect.onInterrupt(() => writer ? writer.enqueue({ ...base, ...presented, phase: "rejected", error: { _tag: "OperationRejected", message: "caller-interrupted" } }) : Effect.void)))
          if (verdict !== undefined) {
            if (writer) yield* writer.enqueue({ ...base, ...presented, phase: "rejected", error: { _tag: "OperationRejected", message: verdict } })
            return yield* Effect.fail(new OperationRejected({ operation: op, reason: verdict, ...(target ? { target } : {}) }))
          }
        }
        if (!writer) return undefined
        const r = yield* writer.enqueue({ ...base, ...presented, phase: "requested", ...(before ? { before } : {}) })
        if (r) { causeId = r.recordId; pending.owed = terminal; internal.onRequested?.(r.recordId) }
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
      if (tkey !== undefined) {
        const dl = yield* Effect.exit(deadlockCheck(tkey))
        if (Exit.isFailure(dl)) {
          yield* terminal("failed", { error: errorOf(dl.cause) })
          return yield* Effect.failCause(dl.cause)
        }
      }
      return { correlationId, causeId, terminal, intent: pending.intent } satisfies Call
    }))
    // 8. linearization point under the plugin's operation order; then await the outcome.
    const done = yield* Semaphore.withPermit(semOf(opLocks, key), spec.linearize(call).pipe(Effect.provideService(CurrentOwner, { owner: op, correlationId: call.correlationId }), CurrentCorrelation.with(call.correlationId)))
    const exit = yield* Deferred.await(done)
    return Exit.isSuccess(exit) ? exit.value as A : yield* Effect.failCause(exit.cause)
    }), () => pending.owed && !pending.intent.value
      ? pending.owed("failed", { error: { _tag: "Interrupted", message: "caller interrupted before its intent was recorded" } })
      : Effect.void)
  })

  /** BEH-BR-219, 263: a plugin-addressed request carries the registration's effective allowChildren and mandatory interceptions. */
  const policyOf = (tkey: string | undefined, o: unknown): { allowChildren?: boolean; mandatoryInterceptions?: ReadonlyArray<{ serviceId: string; id?: string }> } => {
    if (tkey === undefined) return {}
    const e = entries.get(tkey)
    const io = (o ?? {}) as InstallOptions & { catalogIds?: ReadonlyArray<string> }
    const chain = e ? e.mandatoryChain : io.mandatory ?? []
    const ids = e ? e.catalogIds : io.catalogIds
    return { allowChildren: e ? e.allowChildren : io.allowChildren ?? true, mandatoryInterceptions: chain.map((m, i) => ({ serviceId: sid(m.key), ...(ids?.[i] ? { id: ids[i] } : {}) })) }
  }
  const newEntry = (def: AnyPlugin, ident: Ident, o: { readonly disabled?: boolean; readonly config?: unknown; readonly intercept?: Entry["intercept"]; readonly owner?: string; readonly mandatoryChain?: ReadonlyArray<MandatoryInterception>; readonly allowChildren?: boolean }): Entry => ({
    id: ident.key, pluginId: ident.id, realm: ident.realm, ...(ident.parentKey !== undefined ? { parentKey: ident.parentKey } : {}),
    intercept: o.intercept ?? { inherited: [], own: [] }, reactive: new Set(), contributions: [], ...(o.owner !== undefined ? { owner: o.owner } : {}),
    def, state: o.disabled ? "disabled" : "waiting", cleanupFailed: false, providers: new Map(), leases: 0, holders: new Set(), epoch: 0, order: order++,
    stepRunning: false, parkedSystem: false, buildSeq: 0, ...(o.config !== undefined ? { override: { raw: o.config } } : {}),
    mandatoryChain: o.mandatoryChain ?? [], allowChildren: o.allowChildren ?? true, captures: []
  })

  const handleOf = (key: string): PluginHandle => {
    const first = entries.get(key)
    return {
      id: first?.pluginId ?? key, realm: first?.realm ?? "default",
      awaitActive: Effect.gen(function* () {
        while (true) {
          const e = entries.get(key)
          if (!e) return yield* Effect.fail(new PluginRemoved({ id: key }))
          if (e.state === "failed") return yield* Effect.fail(new ActivationFailed({ id: e.pluginId, phase: e.failure?.phase ?? "build", message: e.failure?.message ?? "" }))
          if (e.state === "active") {
            if (!e.def.group) return
            // A group is active when every member is; the first failed member fails it fast (BEH-BR-127).
            const members = [...entries.values()].filter((m) => m.parentKey === key)
            const failed = members.find((m) => m.state === "failed")
            if (failed) return yield* Effect.fail(new ActivationFailed({ id: failed.pluginId, phase: failed.failure?.phase ?? "build", message: failed.failure?.message ?? "" }))
            if (members.every((m) => m.state === "active")) return
          }
          yield* Effect.yieldNow
        }
      })
    }
  }
  const toRef = (ref: PluginRef) => typeof ref === "string" ? { id: ref, realm: "default" } : ref

  const install = (given: AnyPlugin | PluginAny | LazyPluginDefinition, opts: InstallOptions & { readonly owner?: string } = {}) => {
    const def = asDefinition(given)
    const lazyDef = isLazy(given) ? given : undefined
    const realm = opts.realm ?? "default"
    let installFps: ReadonlyArray<Fingerprint> | undefined
    const ident: Ident = { key: keyOf(def.id, realm), id: def.id, realm }
    return mutating<PluginHandle, InstallError | UnknownPlugin | Conflict>({
      operation: "install", target: { id: def.id, realm }, options: opts, definition: defRef(def),
      // install with config: the top-level keys of the raw override, never decoded at the call (BEH-BR-197).
      ...(opts.config !== undefined ? {
        extra: () => ({ configChange: { paths: changedPaths(undefined, opts.config) } }),
        config: () => ({ form: "raw" as const, paths: changedPaths(undefined, opts.config),
          value: (p: string) => p === "<root>" ? opts.config : (opts.config as Record<string, unknown>)[p] }),
        fingerprinted: (fps: ReadonlyArray<Fingerprint>) => { installFps = fps }
      } : {}),
      validate: knownRealm(realm).pipe(Effect.andThen(legalEarly(ident.key, "install")), Effect.andThen(validate(def, ident, undefined, !!opts.disabled))),   // registers nothing on error (BEH-BR-018)
      linearize: (call) => immediate(call, Effect.gen(function* () {
        yield* legal(ident.key, "install"); yield* validate(def, ident, undefined, !!opts.disabled)
        return yield* locked(Effect.gen(function* () {
          entries.set(ident.key, newEntry(def, ident, {
            ...(opts.disabled ? { disabled: true } : {}), ...(opts.config !== undefined ? { config: opts.config } : {}), ...(opts.owner !== undefined ? { owner: opts.owner } : {}),
            ...(opts.intercept ? { intercept: { inherited: [], own: opts.intercept } } : {}),
            ...(opts.mandatory ? { mandatoryChain: opts.mandatory } : {}), ...(opts.allowChildren !== undefined ? { allowChildren: opts.allowChildren } : {}) }))
          const cids = (opts as { catalogIds?: ReadonlyArray<string> }).catalogIds
          if (cids) entries.get(ident.key)!.catalogIds = cids
          const created = entries.get(ident.key)!
          if (lazyDef) { created.lazy = { def: lazyDef, loaded: false, loading: false }; if (!opts.disabled) created.state = "dormant" }   // BEH-BR-244
          if (installFps && created.override) created.override.fingerprints = installFps
          yield* emit({ type: "plugin-installed" }, ident.key)
          yield* commit
          yield* settle
          return { value: handleOf(ident.key) }
        }))
      }))
    })
  }

  const remove = (ref: PluginRef, opts: RemoveOptions = {}) => {
    const id = refKey(ref)
    return mutating<void, UnknownPlugin | DuplicatePlugin | Conflict>({
      operation: "remove", target: toRef(ref), options: opts, definition: entries.get(id) ? defRef(entries.get(id)!.def) : {},
      validate: legalEarly(id, "remove"),
      linearize: (call) => flightOp(id, "remove", () => ({ kind: "gone" }), opts, call)
    })
  }

  const replace = (def: AnyPlugin, opts: RemoveOptions & { readonly realm?: string } = {}) => {
    const realm = opts.realm ?? "default"
    const key = keyOf(def.id, realm)
    const identNow = (): Ident => entries.get(key) ? identOf(entries.get(key)!) : { key, id: def.id, realm }
    const check = Effect.suspend(() => validate(def, identNow(), key)).pipe(Effect.mapError((c) => new ReplaceError({ id: def.id, cause: c._tag })))
    return mutating<void, UnknownPlugin | DuplicatePlugin | Conflict | ReplaceError>({
      operation: "replace", target: { id: def.id, realm }, options: opts, definition: defRef(def),
      validate: legalEarly(key, "replace").pipe(Effect.andThen(check)),           // before anything stops (BEH-BR-050)
      linearize: (call) => flightOp(key, "replace", (e) => ({ kind: "swap", def, disabled: e.state === "disabled" }), opts, call, check)
    })
  }

  const reactivate = (id: string) => locked(Effect.gen(function* () {
    // enable of a registration not yet loaded rests in dormant; retry from a load failure loads again (BEH-BR-246, 247).
    const e = entries.get(id)!; e.state = e.state === "disabled" ? restState(e) : "waiting"; e.failure = undefined; e.disabledReason = undefined; yield* commit; yield* settle
  }))

  /** retry and enable start a plugin that is not running; they conflict with everything in flight (BEH-BR-072). */
  const startOp = (id: string, op: "retry" | "enable", call: Call) => awaitSystemStop(id, op).pipe(
    Effect.andThen((sys) => immediate(call, Effect.gen(function* () {
    // retry and enable never resume a parked system stop (BEH-BR-073, R8).
    if (sys === "parked") return yield* Effect.fail(new Conflict({ id, pending: "dependency-loss" }))
    const f = flights.get(id)
    if (f) return yield* Effect.fail(new Conflict({ id, pending: f.op }))
    if ((yield* legal(id, op)) === "noop") return { value: undefined, noop: true }
    if (op === "enable") yield* validate(entries.get(id)!.def, identOf(entries.get(id)!), id)   // re-check (BEH-BR-062)
    yield* reactivate(id)
    return { value: undefined }
  }))))

  const retry = (ref: PluginRef, opts: OperationOptions = {}) => {
    const id = refKey(ref)
    return mutating<void, UnknownPlugin | DuplicatePlugin | Conflict>({
      operation: "retry", target: toRef(ref), options: opts, validate: legalEarly(id, "retry"), linearize: (call) => startOp(id, "retry", call)
    })
  }

  const restart = (ref: PluginRef, opts: RemoveOptions = {}) => {
    const id = refKey(ref)
    return mutating<void, UnknownPlugin | DuplicatePlugin | Conflict>({
      operation: "restart", target: toRef(ref), options: opts, validate: legalEarly(id, "restart"),
      linearize: (call) => flightOp(id, "restart", () => ({ kind: "rebuild" }), opts, call)
    })
  }

  const disable = (ref: PluginRef, opts: RemoveOptions = {}) => {
    const id = refKey(ref)
    return mutating<void, UnknownPlugin | DuplicatePlugin | Conflict>({
      operation: "disable", target: toRef(ref), options: opts, validate: legalEarly(id, "disable"),
      linearize: (call) => flightOp(id, "disable", () => ({ kind: "disabled" }), opts, call)
    })
  }

  const enable = (ref: PluginRef, opts: OperationOptions = {}) => {
    const id = refKey(ref)
    return mutating<void, UnknownPlugin | DuplicatePlugin | Conflict | InstallError>({
      operation: "enable", target: toRef(ref), options: opts,
      validate: legalEarly(id, "enable").pipe(Effect.tap((k) => k === "proceed" && !flights.has(id) && entries.get(id)?.state === "disabled" ? validate(entries.get(id)!.def, identOf(entries.get(id)!), id) : Effect.void)),
      linearize: (call) => startOp(id, "enable", call)
    })
  }

  /** defineRealm (BEH-BR-145): a mutating operation; `DuplicateRealm` is its validation step. */
  /** BEH-BR-335: retires an empty realm in one revision; "default" and a realm with registrations are refused. */
  const retireRealm = (id: string, opts: OperationOptions = {}) => mutating<void, UnknownRealm | RealmInUse>({
    operation: "retireRealm" as Operation, realmTarget: id, options: opts,
    validate: Effect.suspend(() => checkRetire(id)),
    linearize: (call) => immediate(call, Effect.gen(function* () {
      yield* checkRetire(id)
      realms.delete(id)
      yield* locked(commit)
      return { value: undefined }
    }))
  })
  const checkRetire = (id: string): Effect.Effect<void, UnknownRealm | RealmInUse> => {
    if (id === "default" || !realms.has(id)) return Effect.fail(new UnknownRealm({ id }))
    const inUse = [...entries.values()].filter((e) => e.realm === id).map((e) => e.pluginId).sort()
    return inUse.length ? Effect.fail(new RealmInUse({ id, plugins: inUse })) : Effect.void
  }
  /** BEH-BR-280: a companion offers an entry of another kind; validated, then queued under its failure policy. */
  const offerCallEntry = (entry: { readonly kind: "crossing" | "refusal" | "revocation" | "dispatch"; readonly companion: string; readonly serviceId: string; readonly member?: string; readonly consumer?: CallEntry["consumer"]; readonly outcome: CallEntry["outcome"]; readonly errorTag?: string; readonly crossing?: CallEntry["crossing"]; readonly refusal?: CallEntry["refusal"]; readonly revocation?: CallEntry["revocation"]; readonly dispatch?: CallEntry["dispatch"] },
    o: { readonly onFailure?: "drop" | "refuse" } = {}): Effect.Effect<void, InvalidCallEntry | CallLogUnavailable> => Effect.gen(function* () {
    if (!["crossing", "refusal", "revocation", "dispatch"].includes(entry.kind)) return yield* Effect.fail(new InvalidCallEntry({ reason: "kind" }))
    if (!entry.companion || !entry.serviceId) return yield* Effect.fail(new InvalidCallEntry({ reason: !entry.companion ? "companion" : "serviceId" }))
    if (!entry[entry.kind]) return yield* Effect.fail(new InvalidCallEntry({ reason: `${entry.kind} info missing` }))
    if (Option.isNone(logOpt)) return
    const p = yield* CurrentPlugin.get
    const consumer: CallEntry["consumer"] = entry.consumer ?? (Option.isSome(p) ? { kind: "plugin", principal: refOf(p.value) } : { kind: "application", realm: "default" })
    const now = yield* Clock.currentTimeMillis, corr = yield* CurrentCorrelation.get
    const { companion, ...rest } = entry
    const ok = yield* offerEntry({ ...rest, consumer, callId: yield* ids.next, actor: yield* CurrentActor, startedAt: new Date(now).toISOString(), durationMs: 0, ...(Option.isSome(corr) ? { correlationId: corr.value } : {}), origin: { companion } } as CallEntry)
    if (!ok) {
      if ((o.onFailure ?? logOpt.value.onFailure ?? "drop") === "refuse") { logState.refused++; return yield* Effect.fail(new CallLogUnavailable({ serviceId: entry.serviceId, ...(entry.member ? { member: entry.member } : {}), why: "queue-full" })) }
      logState.dropped++
    }
  })
  const defineRealm = (id: string, o: RealmOptions, opts: OperationOptions = {}) => mutating<void, DuplicateRealm>({
    operation: "defineRealm", realmTarget: id, options: opts,
    validate: Effect.suspend(() => realms.has(id) ? Effect.fail(new DuplicateRealm({ id })) : Effect.void),
    linearize: (call) => immediate(call, Effect.gen(function* () {
      if (realms.has(id)) return yield* Effect.fail(new DuplicateRealm({ id }))
      realms.set(id, { isolate: new Map(o.isolate.map((k) => [sid(k), k])), interceptors: [...(o.interceptors ?? [])], mandatory: [...(o.mandatory ?? [])] })   // fixed once defined
      yield* locked(commit)
      return { value: undefined }
    }))
  })

  /**
   * reconfigure (BEH-BR-101, 102): decoded before anything stops; a volatile-only or empty change applies in place;
   * otherwise the same stop/start path as restart, with the override stored under the flight's intent.
   */
  const reconfigure = (ref: PluginRef, config?: unknown, opts: OperationOptions = {}) => {
    const id = refKey(ref)
    const st: { decoded?: unknown; next?: Entry["override"]; paths: Array<string> } = { paths: [] }
    const decode = Effect.gen(function* () {
      const e = entries.get(id)
      if (!e) return yield* Effect.fail(new UnknownPlugin({ id }))
      const next = config === undefined ? undefined : { raw: config }
      const raw = next ? Effect.succeed(next.raw) : options.config ? options.config(e.pluginId) : Effect.succeed(undefined)
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
      operation: "reconfigure", target: toRef(ref), options: opts,
      extra: () => ({ configChange: { paths: st.paths } }),     // paths only, never values (BEH-BR-103)
      // reconfigure with a value: the decoded values at the changed paths; a clear hands nothing over (CCR-BR-014).
      config: () => config === undefined ? undefined : ({ form: "decoded" as const, paths: st.paths,
        value: (p: string) => p === "<root>" ? st.decoded : (st.decoded as Record<string, unknown> | undefined)?.[p] }),
      fingerprinted: (fps) => { if (st.next) st.next = { ...st.next, fingerprints: fps } },
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
          if (e.state === "waiting" || e.state === "disabled" || e.state === "dormant")
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
  /** All-or-nothing lease in `realm` (BEH-BR-082, 147); `reactive` marks a whenAvailable run (BEH-BR-133). */
  const acquire = <K extends Keys>(keys: K, holder: Fiber.Fiber<unknown, unknown>, realm = "default", reactive = false) => Effect.gen(function* () {
    const sorted = [...keys].sort((a, b) => (sid(a) < sid(b) ? -1 : sid(a) > sid(b) ? 1 : 0))   // canonical order (BEH-BR-082)
    const claimed = yield* locked(Effect.gen(function* () {
      const found: Array<{ key: Context.Key<any, any>; id: string; service: unknown }> = []
      for (const k of sorted) {
        const p = Option.getOrUndefined(activeProvider(sid(k), realm))
        if (!p || closed) return yield* Effect.fail(new ServiceUnavailable({ serviceId: sid(k) }))   // all or nothing
        found.push({ ...p, key: k })
      }
      for (const f of found) { const e = entries.get(f.id); if (e) { e.leases++; e.holders.add(holder); if (reactive) e.reactive.add(holder) } }
      return found
    }))
    yield* Effect.addFinalizer(() => locked(Effect.gen(function* () {
      for (const f of claimed) {
        const e = entries.get(f.id); if (!e) continue
        e.leases--; e.holders.delete(holder); e.reactive.delete(holder)
        if (e.leases === 0 && e.drained) yield* Deferred.succeed(e.drained, undefined)
      }
    })))
    const byId = new Map(claimed.map((c) => [sid(c.key), c]))
    return { services: keys.map((k) => byId.get(sid(k))!.service) as unknown as ServicesOf<K>, ids: claimed.map((c) => c.id).filter((i) => i !== "base"), providerIds: keys.map((k) => byId.get(sid(k))!.id as string) }
  })
  const knownRealm = (realm: string) => realms.has(realm) ? Effect.void : Effect.fail(new UnknownRealm({ id: realm }))

  const lease = <K extends Keys>(keys: K, opts: { readonly realm?: string } = {}) => Effect.gen(function* () {
    yield* knownRealm(opts.realm ?? "default")
    const self = yield* Effect.fiber
    const realm = opts.realm ?? "default"
    const granted = yield* acquire(keys, self, realm)
    const who = yield* fiberConsumer(realm)
    const out: Array<unknown> = []
    for (let i = 0; i < keys.length; i++) out.push(yield* deliver({ consumer: who, realm, key: keys[i]!, providerId: granted.providerIds[i]!, service: (granted.services as ReadonlyArray<unknown>)[i], route: "lease", hostRoute: true }))
    return out as unknown as typeof granted.services
  })

  /**
   * The lease primitive of use/useAll/useOptional (BEH-BR-084). `consumer`: a plugin activation, whose
   * interceptions wrap the services; application callers are never wrapped (BEH-BR-151).
   */
  const useAllIn = <K extends Keys, A, E, R>(keys: K, run: (services: ServicesOf<K>) => Effect.Effect<A, E, R>, opts: { readonly timeout?: number; readonly realm?: string; readonly consumer?: Entry } = {}) =>
    Effect.scoped(Effect.gen(function* () {
      const realm = opts.realm ?? "default"
      yield* knownRealm(realm)                                 // before any lease or callback (BEH-BR-147)
      const callerHeld = yield* HeldPlugins
      const gate = yield* Deferred.make<void>()
      const box: { services?: ServicesOf<K>; ids?: Array<string> } = {}
      // The child, not the caller, is the lease holder, so a force interrupts the child only (BEH-BR-084).
      // It carries HeldPlugins = caller's ∪ the leased providers, for re-entrancy detection (BEH-BR-088).
      const child = yield* Effect.forkChild(Effect.gen(function* () {
        yield* Deferred.await(gate)
        return yield* run(box.services!).pipe(Effect.provideService(HeldPlugins, new Set([...callerHeld, ...box.ids!])))
      }))
      const granted = yield* acquire(keys, child as Fiber.Fiber<unknown, unknown>, realm).pipe(Effect.onError(() => Fiber.interrupt(child)))
      const consumer = opts.consumer
      const who = consumer ? consumerOfEntry(consumer) : yield* fiberConsumer(realm)
      const out: Array<unknown> = []
      for (let i = 0; i < keys.length; i++) {
        const got = yield* Effect.exit(deliver({ consumer: who, ...(consumer ? { entry: consumer } : {}), realm, key: keys[i]!, providerId: granted.providerIds[i]!, service: (granted.services as ReadonlyArray<unknown>)[i], route: consumer ? "optional" : keys.length > 1 ? "useAll" : "use", hostRoute: !consumer }))
        if (Exit.isFailure(got)) { yield* Fiber.interrupt(child); return yield* Effect.failCause(got.cause) }   // the lease is released with the scope
        out.push(got.value)
      }
      box.services = out as unknown as ServicesOf<K>
      box.ids = granted.ids
      yield* Deferred.succeed(gate, undefined)
      // Caller interrupted: interrupt and await the child before the lease is released (prototype finding G9).
      const joined = Fiber.join(child).pipe(Effect.onInterrupt(() => Fiber.interrupt(child)))
      // A Deadline annotation shortens a per-call timeout that is given, never an absent one (BEH-BR-291).
      const ann = yield* CurrentAnnotations
      const dl = isBag(ann) ? ann.get(Annotation.Deadline) : Option.none()
      const limit = opts.timeout === undefined ? undefined : Option.isSome(dl) ? Math.max(0, Math.min(opts.timeout, dl.value.at - (yield* Clock.currentTimeMillis))) : opts.timeout
      const bounded = limit === undefined ? joined : joined.pipe(Effect.timeoutOrElse({
        duration: limit,
        orElse: () => Fiber.interrupt(child).pipe(Effect.andThen(Effect.fail(new LeaseTimeout({ serviceId: sid(keys[0]!) }))))
      }))
      const result = yield* Effect.exit(bounded)
      if (Exit.isSuccess(result)) return result.value
      // The child was interrupted while the caller was not: the host revoked the lease (BEH-BR-086).
      if (Cause.hasInterrupts(result.cause)) return yield* Effect.fail(new LeaseRevoked({ serviceId: sid(keys[0]!) }))
      return yield* Effect.failCause(result.cause)
    }))
  const useAll = <K extends Keys, A, E, R>(keys: K, run: (services: ServicesOf<K>) => Effect.Effect<A, E, R>, opts: { readonly timeout?: number; readonly realm?: string } = {}) =>
    useAllIn(keys, run, opts)

  const use = <S, A, E, R>(key: Context.Key<any, S>, run: (service: S) => Effect.Effect<A, E, R>, opts: { readonly timeout?: number; readonly realm?: string } = {}) =>
    useAll([key] as const, ([s]) => run(s as S), opts)

  // ---------------------------------------------------------------- reconcile (BEH-BR-153..160, 201)
  type ActionKind = "install" | "replace" | "reconfigure" | "disable" | "enable" | "remove"
  interface Plan {
    readonly invalid: Array<{ id: string; realm?: string; reason: InvalidDefinition }>
    readonly owned: Array<{ id: string; realm?: string; reason: DuplicatePlugin | PolicyMismatch }>
    readonly prune: Array<Entry>
    readonly entries: Array<{ d: DesiredPlugin; key: string; actions: Array<ActionKind>; refused?: string }>
  }
  /** Same definition: the same object, or both carry version and digest and both pairs are equal (BEH-BR-154). */
  const sameDefinition = (a: AnyPlugin, b: AnyPlugin) => a === b ||
    (!!a.meta?.version && !!a.meta?.digest && !!b.meta?.version && !!b.meta?.digest && a.meta.version === b.meta.version && a.meta.digest === b.meta.digest)
  /** The keyed diff against the host state now (BEH-BR-154..156). */
  const planOf = (desired: ReadonlyArray<DesiredPlugin>, scope: string, prune: boolean): Plan => {
    const plan: Plan = { invalid: [], owned: [], prune: [], entries: [] }
    const counts = new Map<string, number>()
    for (const d of desired) { const k = keyOf(d.id, d.realm ?? "default"); counts.set(k, (counts.get(k) ?? 0) + 1) }
    const listed = new Set(counts.keys())
    for (const d of desired) {
      const key = keyOf(d.id, d.realm ?? "default")
      if (d.id !== d.plugin.id) { plan.invalid.push({ id: d.id, realm: d.realm ?? "default", reason: new InvalidDefinition({ id: d.id, reason: "entry id differs from plugin.id" }) }); continue }
      if (counts.get(key)! > 1) { plan.invalid.push({ id: d.id, realm: d.realm ?? "default", reason: new InvalidDefinition({ id: d.id, reason: "listed more than once" }) }); continue }
      const ids = d.mandatoryInterceptions ?? []
      if (ids.some((i) => !catalog.some((c) => c.id === i)) || new Set(ids).size !== ids.length) { plan.invalid.push({ id: d.id, realm: d.realm ?? "default", reason: new InvalidDefinition({ id: d.id, reason: "mandatoryInterceptions: unknown or repeated catalog id" }) }); continue }
      const e = entries.get(key)
      const realmD = d.realm ?? "default"
      const incoming = defRef(asDefinition(d.plugin as AnyPlugin | LazyPluginDefinition))
      // BEH-BR-317 (CCR-BR-029, R1-07): each action step 4b would submit is asked of the RefusalList.
      if (!e) { const rf = d.disabled ? undefined : refusalOf({ id: d.id, realm: realmD }, incoming); plan.entries.push({ d, key, actions: ["install"], ...(rf ? { refused: rf } : {}) }); continue }
      // A policy difference on an installed entry is refused, never applied (BEH-BR-154).
      const fields = [...(JSON.stringify(e.catalogIds ?? []) !== JSON.stringify(ids) ? ["mandatoryInterceptions"] : []), ...(e.allowChildren !== (d.allowChildren ?? true) ? ["allowChildren"] : [])]
      if (fields.length && e.owner === scope) { plan.owned.push({ id: d.id, realm: d.realm ?? "default", reason: new PolicyMismatch({ id: d.id, realm: d.realm ?? "default", fields }) }); continue }
      if (e.owner !== scope) { plan.owned.push({ id: d.id, realm: d.realm ?? "default", reason: new DuplicatePlugin({ id: d.id }) }); continue }   // never adopted (BEH-BR-155)
      const replace = !sameDefinition(e.def, d.plugin)
      // `replace` drops the override, so a listed override follows it (BEH-BR-154).
      const reconfigure = replace ? d.config !== undefined : !((e.override === undefined && d.config === undefined) || (e.override !== undefined && d.config !== undefined && deepEqual(e.override.raw, d.config)))
      const wantDisabled = d.disabled ?? false
      const flip = wantDisabled !== operatorDisabled(e)          // the operator's flag (BEH-BR-154, R1-07)
      const actions: Array<ActionKind> = wantDisabled
        ? [...(flip ? ["disable" as const] : []), ...(replace ? ["replace" as const] : []), ...(reconfigure ? ["reconfigure" as const] : [])]
        : [...(replace ? ["replace" as const] : []), ...(reconfigure ? ["reconfigure" as const] : []), ...(flip ? ["enable" as const] : [])]
      const rf = actions.map((a) => a === "replace" ? refusalOf({ id: d.id, realm: realmD }, incoming) : a === "enable" ? refusalOf({ id: d.id, realm: realmD }, replace ? incoming : defRef(e.def)) : undefined).find((x) => x !== undefined)
      plan.entries.push({ d, key, actions, ...(rf ? { refused: rf } : {}) })
    }
    if (prune) {
      // Owned and absent; never a child, never an entry whose key is listed (even invalidly) (BEH-BR-153, 155).
      const pruned = [...entries.values()].filter((e) => e.owner === scope && e.parentKey === undefined && !listed.has(e.id))
      // Reverse dependency order: a plugin before any plugin it requires (BEH-BR-156).
      const providerOf = new Map<string, string>()
      for (const e of pruned) for (const k of e.def.provides) providerOf.set(`${slotOf(e.realm, sid(k))}|${sid(k)}`, e.id)
      const needs = (e: Entry) => e.def.requires.map((k) => providerOf.get(`${slotOf(e.realm, sid(k))}|${sid(k)}`)).filter((x): x is string => !!x)
      const left = new Set(pruned.map((e) => e.id))
      while (left.size) {
        const free = pruned.filter((e) => left.has(e.id) && ![...left].some((o) => o !== e.id && needs(entries.get(o)!).includes(e.id)))
        const pick = (free.length ? free : pruned.filter((e) => left.has(e.id))).sort((a, b) => b.order - a.order)[0]!
        plan.prune.push(pick); left.delete(pick.id)
      }
    }
    return plan
  }
  /** Catalog ids → InstallOptions.mandatory, in order, with allowChildren (BEH-BR-153). */
  const policyInstall = (ids: ReadonlyArray<string> | undefined, allowChildren: boolean | undefined) => ({
    ...(ids?.length ? { mandatory: ids.map((i) => catalog.find((c) => c.id === i)!), catalogIds: ids } : {}),
    ...(allowChildren !== undefined ? { allowChildren } : {})
  })
  const opsOf = (plan: Plan): Set<Operation> => new Set<Operation>([...plan.entries.flatMap((x) => x.actions), ...(plan.prune.length ? ["remove" as const] : [])])
  const reconcileTurn = Semaphore.makeUnsafe(1)                 // reconciles are serialized in call order (BEH-BR-156)

  // Execution order (BEH-BR-156, CCR-BR-025): a removal phase, dependents first, then a change phase, providers first.
  type Step = { readonly kind: "prune"; readonly e: Entry } | { readonly kind: "entry"; readonly x: Plan["entries"][number] }
  /** Kahn's order with ties broken by `rank`; a remaining cycle falls back to rank order. */
  const topo = <T>(items: ReadonlyArray<T>, before: (a: T, b: T) => boolean, rank: (t: T) => number): Array<T> => {
    const left = [...items].sort((a, b) => rank(a) - rank(b)), out: Array<T> = []
    while (left.length) {
      const i = left.findIndex((t) => !left.some((o) => o !== t && before(o, t)))
      out.push(...left.splice(i < 0 ? 0 : i, 1))
    }
    return out
  }
  const orderOf = (plan: Plan): Array<Step> => {
    const provides = (def: AnyPlugin, realm: string, serviceId: string, consumerRealm: string) =>
      def.provides.some((k) => sid(k) === serviceId) && slotOf(realm, serviceId) === slotOf(consumerRealm, serviceId)
    const requiresOf = (def: AnyPlugin) => def.requires.map(sid)                       // `optional` excluded
    // Removal phase: dependents first, in the current state.
    const removal: Array<Step> = [
      ...[...plan.prune].sort((a, b) => a.realm < b.realm ? -1 : a.realm > b.realm ? 1 : a.pluginId < b.pluginId ? -1 : a.pluginId > b.pluginId ? 1 : 0).map((e) => ({ kind: "prune" as const, e })),
      ...plan.entries.filter((x) => x.actions[0] === "disable").map((x) => ({ kind: "entry" as const, x }))
    ]
    const current = (s: Step) => s.kind === "prune" ? s.e : entries.get(s.x.key)!
    const rankR = new Map(removal.map((s, i) => [s, i]))
    const dependsOn = (d: Entry, p: Entry) => requiresOf(d.def).some((k) => provides(p.def, p.realm, k, d.realm))
    const removalOrdered = topo(removal, (a, b) => dependsOn(current(a), current(b)), (s) => rankR.get(s)!)
    // Change phase: providers first, in the state the list describes.
    const change = plan.entries.filter((x) => x.actions.length > 0 && x.actions[0] !== "disable")
    const rankC = new Map(change.map((x, i) => [x, i]))
    const realmOf = (x: Plan["entries"][number]) => x.d.realm ?? "default"
    const declared = (x: Plan["entries"][number]) => asDefinition(x.d.plugin as AnyPlugin | LazyPluginDefinition)   // a lazy entry: its manifest, never `load`
    const changeOrdered = topo(change, (p, d) => requiresOf(declared(d)).some((k) => provides(declared(p), realmOf(p), k, realmOf(d))), (x) => rankC.get(x)!)
    return [...removalOrdered, ...changeOrdered.map((x) => ({ kind: "entry" as const, x }))]
  }

  type ActionTag = "install" | "replace" | "reconfigure" | "disable" | "enable" | "remove"
  const UNDO: Record<ActionTag, ActionTag> = { install: "remove", replace: "replace", reconfigure: "reconfigure", disable: "enable", enable: "disable", remove: "install" }
  const reasonOf = (err: unknown): { _tag: string; message: string } => {
    const tag = err instanceof ReplaceError ? err.cause : (err as { _tag?: string })?._tag ?? "Defect"
    // A RefusalList refusal reports "refused-digest: <reason>", which core wrote (BEH-BR-322).
    if (err instanceof OperationRejected && err.reason.startsWith("refused-digest: ")) return { _tag: tag, message: err.reason }
    return { _tag: tag, message: `${tag}` }                    // core-written: the tag only, never the error's text (BEH-BR-324)
  }
  /** The plain, value-free plan (BEH-BR-318). */
  const planValue = (plan: Plan, opts: ReconcileOptions): ReconcilePlan => {
    const scope = opts.scope ?? "default", prune = opts.prune ?? true
    const steps = orderOf(plan)
    const entryOf = (s: Step): PlannedEntry => {
      if (s.kind === "prune") return {
        target: { id: s.e.pluginId, realm: s.e.realm }, actions: ["remove"],
        expected: { installed: true, registeredAt: s.e.registeredAt ?? 0, ...defRef(s.e.def) },
        ...(opts.atomic ? { undo: ["install"] } : {})
      }
      const { d, key, actions } = s.x
      const e = entries.get(key)
      const cfg = actions.includes("reconfigure") || (actions[0] === "install" && d.config !== undefined)
      return {
        target: { id: d.id, realm: d.realm ?? "default" }, actions: [...actions],
        expected: e ? { installed: true, registeredAt: e.registeredAt ?? 0, ...defRef(e.def) } : { installed: false },
        incoming: defRef(d.plugin),
        ...(actions[0] === "install" ? { policy: { mandatoryInterceptions: [...(d.mandatoryInterceptions ?? [])], allowChildren: d.allowChildren ?? true } } : {}),
        ...(cfg ? { configChange: { paths: changedPaths(actions.includes("replace") || !e ? undefined : e.override?.raw, d.config) } } : {}),
        // `replace` is undone by `replace` and, when the entry's previous override is not none, `reconfigure` (BEH-BR-323).
        ...(opts.atomic ? { undo: [...actions].reverse().flatMap((a): Array<ActionTag> => a === "replace" && e?.override !== undefined ? ["replace", "reconfigure"] : [UNDO[a]]) } : {})
      }
    }
    const ops = opsOf(plan)
    const planned = steps.filter((s) => s.kind === "prune" || (s.x.actions.length > 0 && s.x.refused === undefined)).map(entryOf)
    if (opts.atomic) for (const pe of planned) for (const u of pe.undo ?? []) ops.add(u)
    return {
      hostId, revision, scope,
      prune: { enabled: prune, ...(opts.pruneDrain !== undefined ? { drain: opts.pruneDrain } : {}), force: opts.pruneForce ?? false },
      entries: planned,
      unchanged: plan.entries.filter((x) => x.actions.length === 0).map((x) => ({ id: x.d.id, realm: x.d.realm ?? "default" })),
      rejected: [...[...plan.invalid, ...plan.owned].map((r) => ({ id: r.id, realm: r.realm ?? "default", reason: { _tag: r.reason._tag, message: `${r.reason._tag}: ${r.id}` } })),
        ...plan.entries.filter((x) => x.refused !== undefined).map((x) => ({ id: x.d.id, realm: x.d.realm ?? "default", reason: { _tag: "OperationRejected", message: x.refused! } }))],
      reasonRequiredFor: [...ops].filter((o) => (attribution.requireReason ?? []).includes(o)).sort(),
      atomic: opts.atomic ?? false
    }
  }
  /** BEH-BR-319: every field `expect` compares; `undo` and `stops` are not compared. */
  const staleness = (now: ReconcilePlan, expected: ReconcilePlan): Array<{ id: string; realm: string; reason: string }> => {
    const out: Array<{ id: string; realm: string; reason: string }> = []
    const host = (reason: string) => out.push({ id: "", realm: "", reason })
    if (now.hostId !== expected.hostId) host("hostId")
    if (now.scope !== expected.scope) host("scope")
    // G-P23 / CCR-BR-030: `prune.enabled` is always compared; drain and force only when prune or atomic is true.
    if (now.prune.enabled !== expected.prune.enabled) host("prune options")
    else if ((now.prune.enabled || now.atomic) &&
      (now.prune.drain !== expected.prune.drain || now.prune.force !== expected.prune.force)) host("prune options")
    if (now.atomic !== expected.atomic) host("atomic")
    const strip = (p: PlannedEntry) => JSON.stringify({ t: p.target, a: p.actions, e: p.expected, c: p.configChange?.paths, p: p.policy })
    const n = Math.max(now.entries.length, expected.entries.length)
    for (let i = 0; i < n; i++) {
      const a = now.entries[i], b = expected.entries[i]
      if (!a || !b || strip(a) !== strip(b)) { const t = (a ?? b)!.target; out.push({ id: t.id, realm: t.realm, reason: !a || !b ? "entry count" : "entry differs" }) }
    }
    if (JSON.stringify(now.unchanged) !== JSON.stringify(expected.unchanged)) host("unchanged")
    if (JSON.stringify(now.rejected.map((r) => [r.id, r.reason._tag])) !== JSON.stringify(expected.rejected.map((r) => [r.id, r.reason._tag]))) host("rejected")
    return out
  }

  const plan = (desired: ReadonlyArray<DesiredPlugin>, opts: ReconcileOptions = {}): Effect.Effect<ReconcilePlan, HostClosed> => Effect.suspend(() => {
    if (closed || closing) return Effect.fail(new HostClosed())
    return Effect.succeed(planValue(planOf(desired.map((d) => ({ ...d })), opts.scope ?? "default", opts.prune ?? true), opts))
  })

  const reconcile = (desired: ReadonlyArray<DesiredPlugin>, opts: ReconcileOptions & OperationOptions = {}): Effect.Effect<ReconcileReport, Unattributed | ReasonRequired | AuditUnavailable | HostClosed | PlanStale | ApplyRolledBack | PartialApply> =>
    Effect.uninterruptibleMask((restore) => Effect.gen(function* () {
      const list = desired.map((d) => ({ ...d }))               // not retained, not mutated (BEH-BR-153)
      const scope = opts.scope ?? "default", prune = opts.prune ?? true, atomic = opts.atomic ?? false
      // Steps 1–3 once for the call (BEH-BR-158).
      if (closed || closing) return yield* Effect.fail(new HostClosed())
      const ctx: OperationContext = opts.context ?? { actor: yield* CurrentActor }
      if (!ctx.actor.id.trim() || (attribution.require && ctx.actor.id.startsWith("bridger:"))) return yield* Effect.fail(new Unattributed({ operation: "reconcile" }))
      const needReason = (ops: Set<Operation>) => !ctx.reason?.trim() && (attribution.requireReason ?? []).some((o) => o === "reconcile" || ops.has(o))
      const principal = yield* CurrentPlugin.acting
      const onBehalfOf = Option.isSome(principal) ? refOf(principal.value) : undefined
      const fiberAnn = yield* CurrentAnnotations
      const callAnn = Ann.resolve(isBag(fiberAnn) ? fiberAnn : Ann.empty, ctx.annotations as never)
      const auditAnn = Ann.encode(Ann.filter(callAnn, "audit"))
      const provisionalPlan = planOf(list, scope, prune)
      const provisional = opsOf(provisionalPlan)
      if (needReason(provisional)) return yield* Effect.fail(new ReasonRequired({ operation: "reconcile" }))   // no record
      if (writer?.state.degraded) return yield* Effect.fail(new AuditUnavailable({ operation: "reconcile", message: "audit degraded" }))
      // Step 4 (BEH-BR-319, 322): a stale plan or an atomic validation rejection, with no record.
      if (opts.expect) {
        const stale = staleness(planValue(provisionalPlan, opts), opts.expect)
        if (stale.length) return yield* Effect.fail(new PlanStale({ message: stale.map((m) => `${m.id}@${m.realm}: ${m.reason}`).join("; ") }))
      }
      const validationRejections = (p: Plan) => [...[...p.invalid, ...p.owned].map((r) => {
        const x = p.entries.find((y) => y.d.id === r.id)
        return { id: r.id, realm: r.realm ?? x?.d.realm ?? "default", action: x?.actions[0] ?? "install", reason: { _tag: r.reason._tag, message: `${r.reason._tag}: ${r.id}` } }
      }), ...p.entries.filter((x) => x.refused !== undefined).map((x) => ({ id: x.d.id, realm: x.d.realm ?? "default", action: x.actions[0]!, reason: { _tag: "OperationRejected", message: x.refused! } }))]
      if (atomic && validationRejections(provisionalPlan).length) return yield* Effect.fail(new ApplyRolledBack({ failed: validationRejections(provisionalPlan), undone: [] }))
      const correlationId = ctx.correlationId ?? (yield* ids.next)
      const base = { actor: ctx.actor, correlationId, operation: "reconcile" as const, ...(ctx.reason ? { reason: ctx.reason } : {}), ...(onBehalfOf ? { onBehalfOf } : {}),
        ...(auditAnn.entries.length ? { annotations: auditAnn.entries } : {}) }
      const req = writer ? yield* writer.enqueue({ ...base, phase: "requested" }) : undefined
      const parentEnd = (phase: "completed" | "failed", children: number, error?: { _tag: string; message: string }) =>
        writer && req ? writer.enqueue({ ...base, phase, causationId: req.recordId, children, ...(phase === "completed" && children === 0 ? { noop: true as const } : {}), ...(error ? { error } : {}) }).pipe(Effect.asVoid) : Effect.void
      // The intent is recorded once the parent record is written and this call's turn begins (BEH-BR-156).
      const turn = yield* Effect.exit(restore(Effect.gen(function* () {
        if (writer && req && !(yield* awaitWritten(req.written, auditTimeout))) return yield* Effect.fail(new AuditUnavailable({ operation: "reconcile", message: "requested record not written" }))
        if (writer && !req) return yield* Effect.fail(new AuditUnavailable({ operation: "reconcile", message: "requested record not written" }))
        yield* reconcileTurn.take(1)
      })))
      if (Exit.isFailure(turn)) {
        const interrupted = Cause.hasInterrupts(turn.cause) && !Cause.hasFails(turn.cause)
        yield* parentEnd("failed", 0, interrupted ? { _tag: "Interrupted", message: "caller interrupted before its intent was recorded" } : errorOf(turn.cause))
        return yield* Effect.failCause(turn.cause)
      }
      // From the intent on, the batch runs in a host fiber: an interrupted caller stops waiting, nothing else (BEH-BR-156).
      type BatchError = AuditUnavailable | ReasonRequired | HostClosed | PlanStale | ApplyRolledBack | PartialApply
      const done = yield* Deferred.make<ReconcileReport, BatchError>()
      const batch = Effect.gen(function* () {
        const plan = planOf(list, scope, prune)                 // recomputed at the intent
        const newly = [...opsOf(plan)].filter((o) => !provisional.has(o))
        if (needReason(new Set(newly)) && newly.length) {
          yield* parentEnd("failed", 0, { _tag: "ReasonRequired", message: "the recomputed diff needs a reason" })
          return yield* Effect.fail(new ReasonRequired({ operation: "reconcile" }))
        }
        if (opts.expect) {
          const stale = staleness(planValue(plan, opts), opts.expect)
          if (stale.length) {
            const err = new PlanStale({ message: stale.map((m) => `${m.id}@${m.realm}: ${m.reason}`).join("; ") })
            yield* parentEnd("failed", 0, { _tag: "PlanStale", message: "the diff at the intent differs from the expected plan" })
            return yield* Effect.fail(err)
          }
        }
        if (atomic && validationRejections(plan).length) {
          yield* parentEnd("failed", 0, { _tag: "ApplyRolledBack", message: "validation-stage rejection at the intent" })
          return yield* Effect.fail(new ApplyRolledBack({ failed: validationRejections(plan), undone: [] }))
        }
        const r = { installed: [] as Array<string>, replaced: [] as Array<string>, reconfigured: [] as Array<string>, enabled: [] as Array<string>, disabled: [] as Array<string>, removed: [] as Array<string>, unchanged: [] as Array<string>, rejected: [] as Array<{ id: string; reason: { _tag: string } }> }
        for (const x of [...plan.invalid, ...plan.owned]) r.rejected.push({ id: x.id, reason: x.reason })
        let children = 0
        const entryOpts = (extra: Partial<EntryAction> = {}): OperationOptions & EntryAction => ({ context: { actor: ctx.actor, correlationId, ...(ctx.reason ? { reason: ctx.reason } : {}) }, ...(req ? { causedBy: req.recordId } : {}), reached: () => { children++ }, ...extra })
        const listOf: Record<ActionKind, Array<string>> = { install: r.installed, replace: r.replaced, reconfigure: r.reconfigured, enable: r.enabled, disable: r.disabled, remove: r.removed }
        // What an undo needs, in memory only, dropped at the end of the call (BEH-BR-323).
        type Prev = { readonly def: AnyPlugin; readonly override?: unknown; readonly disabled: boolean; readonly owner?: string; readonly catalogIds?: ReadonlyArray<string>; readonly allowChildren: boolean }
        interface Completed { readonly id: string; readonly realm: string; readonly action: ActionTag; readonly requestedId?: string }
        const completed: Array<Completed> = []
        // "Previous" is read per entry: before the entry's first action in this call (BEH-BR-323, R1-01).
        const entryPrev = new Map<string, Prev | undefined>()
        // The revision this call's most recent completed action produced on each plugin, forward or undo (R1-02).
        const lastRev = new Map<string, number | undefined>()
        let failed: { id: string; realm: string; action: ActionTag; reason: { _tag: string; message: string } } | undefined
        let stopAll: { _tag: "AuditUnavailable" | "HostClosed" } | undefined
        const prevOf = (key: string): Prev | undefined => { const e = entries.get(key); return e ? { def: e.def, ...(e.override ? { override: e.override.raw } : {}), disabled: operatorDisabled(e), ...(e.owner !== undefined ? { owner: e.owner } : {}), ...(e.catalogIds ? { catalogIds: e.catalogIds } : {}), allowChildren: e.allowChildren } : undefined }
        const runAction = (a: ActionTag, d: { id: string; realm: string; plugin?: AnyPlugin; config?: unknown; disabled?: boolean; owner?: string; catalogIds?: ReadonlyArray<string>; allowChildren?: boolean }, o: OperationOptions & EntryAction): Effect.Effect<unknown, unknown> => {
          const ref = { id: d.id, realm: d.realm }
          return a === "install" ? install(d.plugin!, { ...o, realm: d.realm, owner: d.owner ?? scope, ...(d.config !== undefined ? { config: d.config } : {}), ...(d.disabled ? { disabled: true } : {}), ...policyInstall(d.catalogIds, d.allowChildren) }) :
            a === "replace" ? replace(d.plugin!, { ...o, realm: d.realm }) :
            a === "reconfigure" ? reconfigure(ref, d.config, o) :
            a === "disable" ? disable(ref, o) :
            a === "enable" ? enable(ref, o) :
            remove(ref, { ...o, ...(opts.pruneDrain !== undefined ? { drain: opts.pruneDrain as number } : {}), ...(opts.pruneForce ? { force: true } : {}) })
        }
        /** One entry action; false when the entry is done for this call. AuditUnavailable stops the batch (BEH-BR-157). */
        const act = (id: string, realm: string, kind: ActionTag, d: Parameters<typeof runAction>[1]) => Effect.gen(function* () {
          if (writer?.state.degraded) { stopAll = { _tag: "AuditUnavailable" }; return yield* Effect.fail(new AuditUnavailable({ operation: kind, message: "audit degraded during reconcile" })) }
          if (closing || closed) { stopAll = { _tag: "HostClosed" }; return yield* Effect.fail(new HostClosed()) }
          const key = keyOf(id, realm)
          if (!entryPrev.has(key)) entryPrev.set(key, prevOf(key))
          let requestedId: string | undefined
          const exit = yield* Effect.exit(runAction(kind, d, entryOpts({ onRequested: (rid) => { requestedId = rid } })))
          if (Exit.isSuccess(exit)) {
            listOf[kind].push(id)
            completed.push({ id, realm, action: kind, ...(requestedId ? { requestedId } : {}) })
            lastRev.set(key, entries.get(key)?.registeredAt)
            return true
          }
          const err = Cause.squash(exit.cause)
          if (err instanceof AuditUnavailable) { stopAll = { _tag: "AuditUnavailable" }; return yield* Effect.fail(err) }
          if (err instanceof HostClosed) { stopAll = { _tag: "HostClosed" }; return yield* Effect.fail(err) }
          r.rejected.push({ id, reason: err instanceof ReplaceError ? { _tag: err.cause } : (err as { _tag: string }) })
          failed ??= { id, realm, action: kind, reason: reasonOf(err) }
          // A parked forward removal keeps its intent: it cannot be undone (BEH-BR-326).
          if (err instanceof DrainTimeout) parkedForward.push({ id, realm, action: kind, reason: reasonOf(err) })
          return false
        })
        const parkedForward: Array<{ id: string; realm: string; action: string; reason: { _tag: string; message: string } }> = []
        const result = yield* Effect.exit(Effect.gen(function* () {
          for (const s of orderOf(plan)) {
            if (atomic && failed) break                                          // stop at the first incomplete forward action (BEH-BR-322)
            if (s.kind === "prune") { yield* act(s.e.pluginId, s.e.realm, "remove", { id: s.e.pluginId, realm: s.e.realm }); continue }
            const { d, actions } = s.x
            if (actions.length === 0) continue
            for (const a of actions) {
              const realm = d.realm ?? "default"
              if (!(yield* act(d.id, realm, a, { id: d.id, realm, plugin: d.plugin, config: d.config, ...(d.disabled ? { disabled: true } : {}), ...(d.mandatoryInterceptions ? { catalogIds: d.mandatoryInterceptions } : {}), ...(d.allowChildren !== undefined ? { allowChildren: d.allowChildren } : {}) }))) break   // no further actions for this entry (BEH-BR-157)
            }
          }
          for (const x of plan.entries) if (x.actions.length === 0) r.unchanged.push(x.d.id)
        }))
        if (atomic && (failed || (Exit.isFailure(result) && stopAll))) {
          // Undo in reverse completion order (BEH-BR-323), unless the latch or shutdown forbids it (BEH-BR-326).
          const undone: Array<{ id: string; realm: string; action: string }> = []
          const notUndone: Array<{ id: string; realm: string; action: string; reason: { _tag: string; message: string } }> = [...parkedForward]
          for (const c of [...completed].reverse()) {
            const blocked = stopAll ?? (writer?.state.degraded ? { _tag: "AuditUnavailable" as const } : closing || closed ? { _tag: "HostClosed" as const } : undefined)
            if (blocked) { notUndone.push({ id: c.id, realm: c.realm, action: c.action, reason: { _tag: blocked._tag, message: blocked._tag } }); continue }
            const key = keyOf(c.id, c.realm)
            const p = entryPrev.get(key)
            const u = UNDO[c.action]
            // One undo step: one action, or `replace` then `reconfigure` with the entry's previous override (R1-01).
            const actions: Array<{ a: ActionTag; d: Parameters<typeof runAction>[1] }> =
              u === "install" ? [{ a: u, d: { id: c.id, realm: c.realm, plugin: p!.def, config: p!.override, disabled: p!.disabled, ...(p!.owner !== undefined ? { owner: p!.owner } : {}), ...(p!.catalogIds ? { catalogIds: p!.catalogIds } : {}), allowChildren: p!.allowChildren } }]
              : u === "replace" ? [{ a: u, d: { id: c.id, realm: c.realm, plugin: p!.def } }, ...(p!.override !== undefined ? [{ a: "reconfigure" as const, d: { id: c.id, realm: c.realm, config: p!.override } }] : [])]
              : u === "reconfigure" ? [{ a: u, d: { id: c.id, realm: c.realm, config: p?.override } }]
              : [{ a: u, d: { id: c.id, realm: c.realm } }]
            let stepOk = true
            for (const ua of actions) {
              // Checked against the revision this call last produced on the plugin (R1-02).
              const e = entries.get(key)
              const unchanged = c.action === "remove" && ua.a === "install" ? !e : !!e && e.registeredAt === lastRev.get(key)
              if (!unchanged) { notUndone.push({ id: c.id, realm: c.realm, action: c.action, reason: { _tag: "ChangedSinceApply", message: "ChangedSinceApply" } }); stepOk = false; break }
              const exit = yield* Effect.exit(runAction(ua.a, ua.d, entryOpts({ undo: true, ...(c.requestedId ? { undoes: c.requestedId } : {}) })))
              if (Exit.isSuccess(exit)) { lastRev.set(key, entries.get(key)?.registeredAt); continue }
              const err = Cause.squash(exit.cause)
              notUndone.push({ id: c.id, realm: c.realm, action: c.action, reason: reasonOf(err) })
              if (err instanceof AuditUnavailable) stopAll = { _tag: "AuditUnavailable" }
              if (err instanceof HostClosed) stopAll = { _tag: "HostClosed" }
              stepOk = false; break
            }
            if (stepOk) undone.push({ id: c.id, realm: c.realm, action: c.action })
          }
          const failedList = failed ? [failed] : []
          if (notUndone.length) {
            yield* emit({ type: "reconcile-partial", scope, correlationId, notUndone: notUndone.map(({ id, realm, action }) => ({ id, realm, action })) })
            yield* Effect.logError(`reconcile ${scope} (${correlationId}): partial apply; not undone: ${notUndone.map((n) => `${n.id}@${n.realm}`).join(", ")}`)
            const err = new PartialApply({ failed: failedList, undone, notUndone })
            yield* parentEnd("failed", children, { _tag: "PartialApply", message: "PartialApply" })
            return yield* Effect.fail(err)
          }
          yield* parentEnd("failed", children, { _tag: "ApplyRolledBack", message: "ApplyRolledBack" })
          return yield* Effect.fail(new ApplyRolledBack({ failed: failedList, undone }))
        }
        if (Exit.isFailure(result)) {
          yield* parentEnd("failed", children, errorOf(result.cause))
          return yield* Effect.failCause(result.cause as Cause.Cause<AuditUnavailable | HostClosed>)
        }
        yield* parentEnd("completed", children)
        return r satisfies ReconcileReport
      })
      yield* Effect.forkIn(batch.pipe(
        Effect.provideService(CurrentActor, ctx.actor),
        // Entry actions carry the call's principal and annotations (BEH-BR-259, 293).
        Effect.provideService(PrincipalReference, principal), Effect.provideService(CurrentAnnotations, callAnn),
        Effect.exit, Effect.flatMap((x) => Deferred.done(done, x)), Effect.ensuring(reconcileTurn.release(1))), hostScope)
      return yield* restore(Deferred.await(done))
    }))

  // ---------------------------------------------------------------- idle and shutdown (BEH-BR-040, 105..109)
  const awaitIdle: Effect.Effect<HostSnapshot, WouldDeadlock | HostClosed> = Effect.gen(function* () {
    if (closing || closed) return yield* Effect.fail(new HostClosed())
    const held = yield* HeldPlugins
    if (held.size > 0) return yield* Effect.fail(new WouldDeadlock({ id: [...held][0]! }))
    while (true) {
      // A stop still running (a cascade, an unmount) is a transition in flight; a parked one is not.
      const busy = stopsRequested > 0 || [...flights.values()].some((f) => !f.parked) || [...entries.values()].some((e) => e.state === "starting" || e.failing || (e.state === "stopping" && e.stepRunning && !e.parkedSystem)) ||
        [...entries.values()].some((e) => e.state === "waiting" && missing(e).length === 0)
      if (!busy) return snapshotOf()
      yield* Effect.yieldNow
    }
  })

  /** BEH-BR-118: names and counts only. */
  const inspect = (ref: PluginRef): Effect.Effect<PluginInspection, UnknownPlugin | HostClosed> => Effect.gen(function* () {
    const id = refKey(ref)
    if (closing || closed) return yield* Effect.fail(new HostClosed())
    const e = entries.get(id)
    if (!e) return yield* Effect.fail(new UnknownPlugin({ id }))
    const f = flights.get(id)
    return {
      id: e.pluginId, realm: e.realm, state: e.state, requires: e.def.requires.map(sid), provides: e.def.provides.map(sid),
      optional: (e.def.optional ?? []).map(sid), whenAvailable: (e.whenAvailable ?? []).map((w) => ({ ...w })),   // BEH-BR-135
      contributions: e.contributions.map((c) => ({ ...c })),                                                       // BEH-BR-168
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
      durationMs: (yield* Clock.currentTimeMillis) - start, auditDegraded: writer?.state.degraded ?? false,
      ...(writer ? { auditLastSeq: writer.state.lastWritten } : {})
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
    install, remove, replace, retry, reconfigure, restart, disable, enable, acknowledgeAuditDegraded, defineRealm, reconcile, plan, wake, declaredContributions, link,
    use, useAll, lease, awaitIdle, inspect, shutdown,
    snapshot: Effect.sync(snapshotOf),
    /** Read-only; available after close, when it reports records flushed after the CloseReport (CCR-BR-014). */
    controls: Effect.sync((): HostControls => ({
      hostId, wired: { audit: !!writer, gate: Option.isSome(gateOpt), fingerprinter: Option.isSome(fpOpt) },
      attribution, auditTimeout, gateTimeout, fingerprintTimeout, buildTimeout, idGenerator: Option.isSome(idOpt) ? "provided" : "default",
      ...(writer ? { auditPosition: { lastWritten: writer.state.lastWritten } } : {}),
      policy: {
        access: Option.isSome(accessOpt) ? "wired" : "unwired", refusal: Option.isSome(refusalOpt) ? "wired" : "unwired",
        capability: Option.isSome(capOpt) ? "wired" : "unwired", callLog: Option.isSome(logOpt) ? "wired" : "unwired",
        mandatory: [...((options.mandatory ?? []).length ? [{ scope: "host", serviceIds: (options.mandatory ?? []).map((m) => sid(m.key)) }] : []),
          ...[...realms].filter(([, r]) => r.mandatory?.length).map(([id, r]) => ({ scope: `realm:${id}`, serviceIds: r.mandatory!.map((m) => sid(m.key)) }))]
      },
      ...(Option.isSome(logOpt) ? { callLog: { failed: logState.failed, dropped: logState.dropped, refused: logState.refused, onFailure: logOpt.value.onFailure ?? "drop", queue: logCapacity } } : {})
    })),
    retireRealm, offerCallEntry,
    changes: SubscriptionRef.changes(feed).pipe(Stream.interruptWhen(Deferred.await(closedSignal))),   // ends when the host closes
    events: events.stream as Stream.Stream<HostEvent>,                                                  // diagnostic feed, not an audit trail
  }
})

export type Host = Effect.Success<ReturnType<typeof make>>

/** `Bridger.Host` and `Bridger.layer` (BEH-BR-111): hosting through `ManagedRuntime`. */
export class BridgerHost extends Context.Service<BridgerHost, Host>()("@bridger/core/Host") {}
export const layer = (options?: Options) => Layer.effect(BridgerHost, make(options))
