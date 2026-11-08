// Realm families and ephemeral realms (references/core behaviour 33, BEH-BR-329–336): helpers outside the Host,
// built only from its public calls (defineRealm, reconcile, retireRealm, useAll, snapshot). Prototype.
import { Clock, Deferred, Effect, Exit, PubSub, Schema, Scope, Stream } from "effect"
import { narrow } from "./actor.js"
import type { DesiredPlugin } from "./desired.js"
import type { OperationContext } from "./gxp.js"
import type { Host, RealmOptions } from "./host.js"
import type { Keys, ServicesOf } from "./plugin.js"

export class FamilyMemberUnavailable extends Schema.TaggedError<FamilyMemberUnavailable>()("FamilyMemberUnavailable", {
  family: Schema.String, key: Schema.String, reason: Schema.Literals(["rejected", "failed", "activation-timeout", "options-changed", "invalid-key", "closed"])
}) {}
export interface FamilyEvent { readonly type: "family-eviction"; readonly family: string; readonly key: string; readonly outcome: "completed" | "incomplete" | "realm-kept" | "forced" }
interface Member { readonly realm: string; status: "creating" | "ready" | "failed" | "evicting"; holders: number; lastUse: number; readonly options: string; created: Deferred.Deferred<boolean>; evicted?: Deferred.Deferred<void> }

/** Waits until every plugin of `realm` is active, or fails (BEH-BR-331). */
const awaitActive = (host: Host, realm: string, timeout: number) => Effect.gen(function* () {
  const deadline = (yield* Clock.currentTimeMillis) + timeout
  while (true) {
    const ps = (yield* host.snapshot).plugins.filter((p) => p.realm === realm)
    if (ps.some((p) => p.state === "failed")) return "failed" as const
    if (ps.every((p) => p.state === "active")) return "ready" as const
    if ((yield* Clock.currentTimeMillis) >= deadline) return "activation-timeout" as const
    yield* Effect.sleep(1)
  }
})

export const family = <K extends string>(host: Host, o: {
  readonly id: string
  readonly realm: (key: K) => RealmOptions
  readonly plugins: (key: K) => ReadonlyArray<DesiredPlugin>
  readonly context: OperationContext
  readonly idleEvict?: { readonly after: number; readonly drain?: number } | "never"
  readonly activationTimeout?: number
}) => Effect.gen(function* () {
  const members = new Map<string, Member>()
  const events = yield* PubSub.unbounded<FamilyEvent>()
  const opts = { context: o.context }
  const timeout = o.activationTimeout ?? 30_000
  let closed = false
  yield* Effect.addFinalizer(() => Effect.sync(() => { closed = true }))
  const unavailable = (key: string, reason: FamilyMemberUnavailable["reason"]) => new FamilyMemberUnavailable({ family: o.id, key, reason })
  /** One creation per key, shared by concurrent uses (BEH-BR-331). */
  const ensure = (key: K): Effect.Effect<Member, FamilyMemberUnavailable> => Effect.gen(function* () {
    if (closed) return yield* Effect.fail(unavailable(key, "closed"))
    if (!/^[A-Za-z0-9._-]{1,64}$/.test(key)) return yield* Effect.fail(unavailable(key, "invalid-key"))
    const realmOpts = o.realm(key)
    const fingerprint = JSON.stringify({ isolate: realmOpts.isolate.map((k) => (k as unknown as { key: string }).key), n: realmOpts.interceptors?.length ?? 0, m: realmOpts.mandatory?.length ?? 0 })
    let m = members.get(key)
    if (m?.evicted) { yield* Deferred.await(m.evicted); m = members.get(key) }   // a use during eviction waits, then recreates
    if (m) {
      if (m.options !== fingerprint) return yield* Effect.fail(unavailable(key, "options-changed"))
      if (m.status === "failed") return yield* Effect.fail(unavailable(key, "failed"))   // not recreated until reset (BEH-BR-334)
      if (m.status === "creating" && !(yield* Deferred.await(m.created))) return yield* Effect.fail(unavailable(key, "failed"))
      return m
    }
    const realm = `${o.id}/${key}`
    const created = yield* Deferred.make<boolean>()
    const fresh: Member = { realm, status: "creating", holders: 0, lastUse: yield* Clock.currentTimeMillis, options: fingerprint, created }
    members.set(key, fresh)
    const outcome = yield* Effect.gen(function* () {
      yield* host.defineRealm(realm, realmOpts, opts)
      const report = yield* host.reconcile(o.plugins(key).map((d) => ({ ...d, realm })), { ...opts, scope: realm })
      if (report.rejected.length) return "rejected" as const
      return yield* awaitActive(host, realm, timeout)
    }).pipe(Effect.catchCause(() => Effect.succeed("rejected" as const)))
    fresh.status = outcome === "ready" ? "ready" : "failed"
    yield* Deferred.succeed(created, outcome === "ready")
    if (outcome !== "ready") return yield* Effect.fail(unavailable(key, outcome))
    return fresh
  })
  const evictMember = (key: string, m: Member) => Effect.gen(function* () {
    m.status = "evicting"; m.evicted = yield* Deferred.make<void>()
    const ev = o.idleEvict && o.idleEvict !== "never" ? o.idleEvict : undefined
    const report = yield* host.reconcile([], { ...opts, scope: m.realm, prune: true, ...(ev?.drain !== undefined ? { pruneDrain: ev.drain } : {}), pruneForce: false }).pipe(Effect.exit)
    let outcome: FamilyEvent["outcome"]
    if (Exit.isFailure(report) || report.value.rejected.length) { outcome = "incomplete"; m.status = "ready" }     // parked; retried at the next check
    else {
      const retired = yield* Effect.exit(host.retireRealm(m.realm, opts))
      outcome = Exit.isSuccess(retired) ? "completed" : "realm-kept"
      members.delete(key)
    }
    const done = m.evicted; m.evicted = undefined
    yield* Deferred.succeed(done, undefined)
    yield* PubSub.publish(events, { type: "family-eviction", family: o.id, key, outcome })
  })
  if (o.idleEvict && o.idleEvict !== "never") {
    const after = o.idleEvict.after
    yield* Effect.forkScoped(Effect.forever(Effect.gen(function* () {
      yield* Effect.sleep(Math.max(1, Math.floor(after / 4)))
      const now = yield* Clock.currentTimeMillis
      for (const [key, m] of [...members]) if (m.status === "ready" && m.holders === 0 && now - m.lastUse >= after) yield* evictMember(key, m)
    })))
  }
  return {
    use: <Ks extends Keys, A, E, R>(key: K, keys: Ks, run: (services: ServicesOf<Ks>) => Effect.Effect<A, E, R>, uo: { readonly timeout?: number } = {}) => Effect.gen(function* () {
      const m = yield* ensure(key)
      m.holders++
      return yield* host.useAll(keys, run, { realm: m.realm, ...(uo.timeout !== undefined ? { timeout: uo.timeout } : {}) }).pipe(
        Effect.ensuring(Effect.gen(function* () { m.holders--; m.lastUse = yield* Clock.currentTimeMillis })))
    }),
    members: Effect.sync(() => [...members].map(([key, m]) => ({ key: key as K, realm: m.realm, status: m.status, holders: m.holders }))),
    events: Stream.fromPubSub(events),
    evict: (key: K) => Effect.suspend(() => { const m = members.get(key); return m ? evictMember(key, m) : Effect.void }),
    reset: (key: K, ro: { readonly context: OperationContext } = opts) => Effect.gen(function* () {
      const m = members.get(key)
      if (!m) return
      yield* host.reconcile([], { context: ro.context, scope: m.realm, prune: true }).pipe(Effect.ignore)
      yield* host.retireRealm(m.realm, { context: ro.context }).pipe(Effect.ignore)
      members.delete(key)
    })
  }
})

/** BEH-BR-336: a realm bound to a scope, under a narrowed actor; undone on failure, torn down at scope close. */
export const ephemeral = (host: Host, o: {
  readonly segment: string
  readonly realm: RealmOptions
  readonly plugins: ReadonlyArray<DesiredPlugin>
  readonly context: OperationContext
  readonly drain?: number
  readonly activationTimeout?: number
}) => Effect.gen(function* () {
  const realm = `ephemeral/${o.segment}`
  const context: OperationContext = { actor: narrow(o.context.actor, o.segment), ...(o.context.correlationId ? { correlationId: o.context.correlationId } : {}), ...(o.context.reason ? { reason: o.context.reason } : {}) }
  const teardown = Effect.gen(function* () {
    const soft = yield* host.reconcile([], { context, scope: realm, prune: true, ...(o.drain !== undefined ? { pruneDrain: o.drain } : {}), pruneForce: false }).pipe(Effect.exit)
    let forced = false
    if (Exit.isFailure(soft) || soft.value.rejected.length) {
      forced = true                                                   // force only at the limit, and say so
      yield* Effect.logWarning(`ephemeral realm ${realm}: drain limit reached, forcing`)
      yield* host.reconcile([], { context, scope: realm, prune: true, pruneDrain: 0, pruneForce: true }).pipe(Effect.ignore)
    }
    yield* host.retireRealm(realm, { context }).pipe(Effect.ignore)
    return forced
  })
  yield* host.defineRealm(realm, o.realm, { context })
  const ok = yield* Effect.gen(function* () {
    const r = yield* host.reconcile(o.plugins.map((d) => ({ ...d, realm })), { context, scope: realm })
    if (r.rejected.length) return "rejected" as const
    return yield* awaitActive(host, realm, o.activationTimeout ?? 30_000)
  }).pipe(Effect.catchCause(() => Effect.succeed("rejected" as const)))
  if (ok !== "ready") { yield* teardown; return yield* Effect.fail(new FamilyMemberUnavailable({ family: "ephemeral", key: o.segment, reason: ok })) }
  const report = { forced: false }
  yield* Effect.addFinalizer(() => Effect.map(teardown, (f) => { report.forced = f }))
  return {
    realm, context, report,
    use: <Ks extends Keys, A, E, R>(keys: Ks, run: (services: ServicesOf<Ks>) => Effect.Effect<A, E, R>, uo: { readonly timeout?: number } = {}) =>
      host.useAll(keys, run, { realm, ...(uo.timeout !== undefined ? { timeout: uo.timeout } : {}) })
  }
})
export const Realm = { family, ephemeral }
void Scope
