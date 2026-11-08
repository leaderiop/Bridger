import { isLazy, type LazyPluginDefinition } from "./manifest.js"
// `@bridger/core/testing` (references/core behaviour 21, BEH-BR-177–182). Phase-P5 prototype — not product code.
//
// TestHost is the production host (`Host.makeWith`) with a scheduler that holds every transition step and
// every contended wait until the test steps it. Faults are injected by decorating definitions at the test
// host's own entry points; the production host has no fault hook (BEH-BR-177).
import { Cause, Deferred, Effect, Fiber, Layer, Option, Scope, Stream } from "effect"
import { AuditSink, AuditWriteFailed, IdGenerator, OperationGate, OperationRejected, type AuditRecord, type OperationRequest } from "./gxp.js"
import * as Host from "./host.js"
import { PluginRuntime } from "./runtime.js"
import type { AnyPlugin, InstallOptions } from "./plugin.js"
import type { DesiredPlugin } from "./desired.js"

// ---------------------------------------------------------------- identifiers (BEH-BR-179)
const counter = (prefix: string): IdGenerator["Service"] => { let n = 0; return { next: Effect.sync(() => `${prefix}${++n}`) } }
/** "test-1", "test-2", … in call order. */
export const counterIdGenerator = (prefix = "test-"): Layer.Layer<IdGenerator> => Layer.sync(IdGenerator, () => counter(prefix))

// ---------------------------------------------------------------- faults (BEH-BR-180)
type Ref = string | { readonly id: string; readonly realm: string }
export type FaultKind = "buildFails" | "stopFails" | "holdLease" | "runtimeFailure"
export interface Fault { readonly kind: FaultKind; readonly id: string; readonly realm: string }
const faultOf = (kind: FaultKind) => (ref: Ref): Fault => typeof ref === "string" ? { kind, id: ref, realm: "default" } : { kind, ...ref }
export const Fault = {
  buildFails: faultOf("buildFails"),
  stopFails: faultOf("stopFails"),
  holdLease: faultOf("holdLease"),
  runtimeFailure: faultOf("runtimeFailure")
}
/** Every injected failure says so (BEH-BR-180). */
export class InjectedFault extends Error { constructor(kind: FaultKind) { super(`injected fault: ${kind}`) } }

// ---------------------------------------------------------------- the test host (BEH-BR-177, 178)
export interface PendingStep {
  readonly kind: "build" | "stop" | "wait"
  readonly pluginId: string
  readonly realm: string
  readonly waiter?: string
  readonly owner: string
  readonly correlationId?: string
  readonly parked: boolean
}
export interface TestHost extends Host.Host {
  /** Advances the first pending item that can progress to its next settlement point; false when none can. */
  readonly step: Effect.Effect<boolean>
  readonly stepPlugin: (ref: Ref) => Effect.Effect<boolean>
  readonly pending: Effect.Effect<ReadonlyArray<PendingStep>>
  readonly runUntilIdle: Effect.Effect<Host.HostSnapshot>
  readonly inject: (fault: Fault) => Effect.Effect<void, never, Scope.Scope>
}

interface Held { readonly item: Host.StepItem; readonly ready: () => boolean; readonly release: Deferred.Deferred<void> }
const byArrival = (a: Held, b: Held) => a.item.seq - b.item.seq || (a.item.tie < b.item.tie ? -1 : a.item.tie > b.item.tie ? 1 : 0)
const keyOf = (id: string, realm: string) => realm === "default" ? id : `${id}@${realm}`

/**
 * Settlement: the host's fibers have nothing left to run without a step, the clock or a lease. Effect exposes
 * no quiescence signal, so the prototype yields until the observable state is unchanged for a run of yields
 * (prototype finding G27).
 */
const QUIET_YIELDS = 64

export const make = (options: Host.Options = {}): Effect.Effect<TestHost, never, Scope.Scope> => Effect.gen(function* () {
  const ids = Option.getOrElse(yield* Effect.serviceOption(IdGenerator), () => counter("test-"))
  const held: Array<Held> = []
  let auto = false                                    // once the test host's scope closes, transitions run on their own
  const drop = (h: Held) => Effect.sync(() => { const i = held.indexOf(h); if (i >= 0) held.splice(i, 1) })
  const enqueue = (h: Held) => { held.push(h); held.sort(byArrival) }

  const scheduling: Host.Scheduling = {
    transition: (item, ready, body) => Effect.suspend(() => auto ? body : Effect.gen(function* () {
      const h: Held = { item, ready, release: yield* Deferred.make<void>() }
      enqueue(h)
      yield* Deferred.await(h.release).pipe(Effect.onInterrupt(() => drop(h)))
      return yield* body
    })),
    // A wait is pending from the moment it begins; it can progress once what it waits for has settled.
    wait: (item, body) => Effect.suspend(() => auto ? body : Effect.gen(function* () {
      const state = { done: false }
      const h: Held = { item, ready: () => state.done, release: yield* Deferred.make<void>() }
      enqueue(h)
      const a = yield* body.pipe(Effect.onInterrupt(() => drop(h)))
      state.done = true
      if (!auto) yield* Deferred.await(h.release).pipe(Effect.onInterrupt(() => drop(h)))
      return a
    }))
  }

  const host = yield* Host.makeWith(options, scheduling).pipe(Effect.provideService(IdGenerator, ids))
  // Registered after the host, so it runs before the host's scope-close shutdown (finalizers run last in, first
  // out): a test cannot step a finalizer, so from here on every transition runs on its own (finding G27).
  yield* Effect.addFinalizer(() => Effect.gen(function* () {
    auto = true
    for (const h of held.splice(0)) yield* Deferred.succeed(h.release, undefined)
  }))

  const signature = Effect.map(host.snapshot, (s) => `${s.revision}|${held.map((h) => `${h.item.kind}:${h.item.pluginId}:${h.ready()}`).join(",")}`)
  const quiesce = Effect.gen(function* () {
    let last = yield* signature, quiet = 0
    while (quiet < QUIET_YIELDS) {
      yield* Effect.yieldNow
      const now = yield* signature
      if (now === last) quiet++
      else { last = now; quiet = 0 }
    }
  })
  const advance = (pick: (h: Held) => boolean) => Effect.gen(function* () {
    yield* quiesce
    const h = held.find((x) => pick(x) && x.ready())
    if (!h) return false
    yield* drop(h)
    yield* Deferred.succeed(h.release, undefined)
    yield* quiesce
    return true
  })
  const step = advance(() => true)
  const runUntilIdle = Effect.gen(function* () {
    while (yield* step) { /* one item at a time */ }
    return yield* host.snapshot
  })
  // Read at a settlement point, like `step`, so a just-forked transition is already listed (finding G27).
  const pending = Effect.gen(function* () {
    yield* quiesce
    const s = yield* host.snapshot
    const parked: Array<PendingStep> = s.plugins.filter((p) => p.state === "stopping" && p.parked)
      .map((p) => ({ kind: "stop" as const, pluginId: p.id, realm: p.realm, owner: p.state === "stopping" ? p.reason : "", parked: true }))
    return [...held.map(({ item }): PendingStep => ({
      kind: item.kind, pluginId: item.pluginId, realm: item.realm, ...(item.waiter ? { waiter: item.waiter } : {}),
      owner: item.owner, ...(item.correlationId ? { correlationId: item.correlationId } : {}), parked: false
    })), ...parked]
  })

  // ---- faults: definitions are decorated at the test host's entry points; nothing in the production host changes
  const faults: Array<Fault> = []
  const active = (kind: FaultKind, key: string) => faults.some((f) => f.kind === kind && keyOf(f.id, f.realm) === key)
  const runtimes = new Map<string, PluginRuntime["Service"]>()       // the latest activation's runtime, per plugin
  const defs = new Map<string, AnyPlugin>()
  const wrapped = new WeakMap<AnyPlugin, Map<string, AnyPlugin>>()   // stable identity, so reconcile still compares by object
  const wrap = (def: AnyPlugin, realm: string): AnyPlugin => {
    const byRealm = wrapped.get(def) ?? new Map<string, AnyPlugin>()
    wrapped.set(def, byRealm)
    const cached = byRealm.get(realm)
    if (cached) return cached
    const key = keyOf(def.id, realm)
    const build = Layer.effectContext(Effect.gen(function* () {
      if (active("buildFails", key)) return yield* Effect.fail(new InjectedFault("buildFails"))
      runtimes.set(key, yield* PluginRuntime)
      // Registered first, so it runs last: the close of the activation fails after the plugin's own finalizers.
      yield* Effect.addFinalizer(() => active("stopFails", key) ? Effect.die(new InjectedFault("stopFails")) : Effect.void)
      return yield* Layer.build(def.build)
    })) as unknown as AnyPlugin["build"]
    const out: AnyPlugin = { ...def, build }
    byRealm.set(realm, out)
    defs.set(key, def)
    return out
  }
  const isActive = (key: string, s: Host.HostSnapshot) => {
    const [id, realm] = key.includes("@") ? [key.slice(0, key.lastIndexOf("@")), key.slice(key.lastIndexOf("@") + 1)] : [key, "default"]
    return s.plugins.some((p) => p.id === id && p.realm === realm && p.state === "active")
  }
  const inject = (fault: Fault): Effect.Effect<void, never, Scope.Scope> => Effect.gen(function* () {
    faults.push(fault)
    yield* Effect.addFinalizer(() => Effect.sync(() => { faults.splice(faults.indexOf(fault), 1) }))
    const key = keyOf(fault.id, fault.realm)
    const realm = fault.realm
    if (fault.kind === "holdLease") {
      // Whenever the plugin is active, hold a lease on everything it provides, until revoked or the fault ends.
      let holder: Fiber.Fiber<unknown, unknown> | undefined
      yield* Effect.forkScoped(host.changes.pipe(Stream.runForEach((s) => Effect.gen(function* () {
        if (holder || !isActive(key, s)) return
        const def = defs.get(key)
        if (!def || def.provides.length === 0) return
        holder = yield* Effect.forkScoped(Effect.scoped(host.lease(def.provides, { realm }).pipe(Effect.andThen(Effect.never))).pipe(
          Effect.ensuring(Effect.sync(() => { holder = undefined }))))
      }))))
    }
    if (fault.kind === "runtimeFailure") {
      // One runtime failure: now if active, otherwise at the next activation.
      const deliver = Effect.suspend(() => runtimes.get(key)?.reportFailure(Cause.fail(new InjectedFault("runtimeFailure"))) ?? Effect.void)
      yield* Effect.forkScoped(host.changes.pipe(Stream.filter((s) => isActive(key, s)), Stream.take(1), Stream.runForEach(() => deliver)))
    }
  })

  const testHost: TestHost = {
    ...host,
    install: (def: AnyPlugin | import("./plugin.js").PluginAny | LazyPluginDefinition, o: InstallOptions & { readonly owner?: string } = {}) => host.install(isLazy(def) ? def : wrap(def as AnyPlugin, o.realm ?? "default"), o),
    replace: (def: AnyPlugin, o: Host.RemoveOptions & { readonly realm?: string } = {}) => host.replace(wrap(def, o.realm ?? "default"), o),
    reconcile: (desired: ReadonlyArray<DesiredPlugin>, o?: Host.ReconcileOptions & import("./gxp.js").OperationOptions) =>
      host.reconcile(desired.map((d) => ({ ...d, plugin: isLazy(d.plugin) ? d.plugin : wrap(d.plugin, d.realm ?? "default") })), o),
    step, stepPlugin: (ref) => {
      const { id, realm } = typeof ref === "string" ? { id: ref, realm: "default" } : ref
      return advance((h) => h.item.pluginId === id && h.item.realm === realm)
    },
    pending, runUntilIdle, inject
  }
  return testHost
})

/** TestHost as `Bridger.Host`. */
export const layer = (options?: Host.Options) => Layer.effect(Host.BridgerHost, make(options))

// ---------------------------------------------------------------- fixtures (BEH-BR-181, 182)
/**
 * TEST FIXTURE. Keeps records in process memory, unbounded, for the life of the test scope. It offers no
 * storage, retention, durability, access control or review, and is not a starting point for one (BEH-BR-181).
 */
export const memoryAuditSink = (options: {
  readonly behave?: (attempt: number, record: AuditRecord) => "store" | "fail" | "die" | "hang" | "store-and-hang"
} = {}) => Effect.sync(() => {
  const stored: Array<AuditRecord> = []
  let attempts = 0
  const sink: AuditSink["Service"] = {
    record: (r) => Effect.suspend(() => {
      const n = ++attempts
      if (stored.some((x) => x.recordId === r.recordId)) return Effect.void      // idempotent on recordId
      switch (options.behave?.(n, r) ?? "store") {
        case "store": stored.push(r); return Effect.void
        case "fail": return Effect.fail(new AuditWriteFailed({ message: "memoryAuditSink: scripted failure" }))
        case "die": return Effect.die(new Error("memoryAuditSink: scripted defect"))
        case "hang": return Effect.never
        case "store-and-hang": stored.push(r); return Effect.never
      }
    })
  }
  return { layer: Layer.succeed(AuditSink, sink), sink, records: Effect.sync(() => [...stored] as ReadonlyArray<AuditRecord>), attempts: Effect.sync(() => attempts) }
})

/**
 * TEST FIXTURE. Records every request and answers as `decide` says; there is deliberately no allow-all form
 * (BEH-BR-182). Not an approval mechanism.
 */
export const scriptedGate = (decide: (request: OperationRequest, index: number) => "allow" | { readonly refuse: string } | "die" | "hang") => Effect.sync(() => {
  const requests: Array<OperationRequest> = []
  const gate: OperationGate["Service"] = {
    authorize: (r) => Effect.suspend(() => {
      const d = decide(r, requests.length)
      requests.push(r)
      if (d === "allow") return Effect.void
      if (d === "die") return Effect.die(new Error("scriptedGate: scripted defect"))
      if (d === "hang") return Effect.never
      return Effect.fail(new OperationRejected({ operation: r.operation, reason: d.refuse }))
    })
  }
  return { layer: Layer.succeed(OperationGate, gate), gate, requests: Effect.sync(() => [...requests] as ReadonlyArray<OperationRequest>) }
})

