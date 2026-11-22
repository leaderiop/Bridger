// The federation plugin over core `reconcile` (federation 01, 02): project a verified manifest to a desired list, overlay the
// permitted local patches, remove kills, disable `requiresFresh` entries while stale, and apply it as one attributed reconcile.
import { Effect } from "effect"
import { Desired, type DesiredPlugin } from "./desired.js"
import type { AnyPlugin } from "./plugin.js"
import { applyFreshness, applyKills, freshness, type FreshnessInput, type KillEntry, type StaleReason } from "./federation.js"
import { makeSync, verifyManifest, type Envelope, type SyncOptions, type SyncOutcome } from "./sync.js"
import type { StateStore } from "./durable.js"
import type { Listed } from "./federation.js"
import type { ReconcileOptions, ReconcileReport } from "./host.js"

export interface ManifestPlugin { readonly id: string; readonly digest: string; readonly version?: string; readonly realm?: string; readonly config?: unknown; readonly disabled?: boolean; readonly requiresFresh?: boolean; readonly mandatoryInterceptions?: ReadonlyArray<string>; readonly allowChildren?: boolean }
export type OverridableField = { readonly id: string; readonly realm?: string; readonly fields: ReadonlyArray<"config" | "disabled"> }
export interface HostManifest {
  readonly format: "bridger.host-manifest/1"; readonly authority: string; readonly host: string; readonly revision: number
  readonly issuedAt: number; readonly validUntil?: number
  readonly plugins: ReadonlyArray<ManifestPlugin>; readonly kill?: ReadonlyArray<KillEntry & { readonly reason?: string }>; readonly overridable?: ReadonlyArray<OverridableField>
}
export interface LocalPatch { readonly id: string; readonly realm?: string; readonly config?: unknown; readonly disabled?: boolean; readonly plugin?: unknown; readonly actor: string }
export type ResolveFailure = { readonly reason: "revocation-stale" | string }
export type Resolver = (digest: string) => Effect.Effect<AnyPlugin, ResolveFailure>

/** BEH-FD-001: another `format` is refused; unknown fields are ignored. */
export const decodeManifest = (raw: unknown): HostManifest | { readonly _tag: "ManifestRejected"; readonly reason: "unknown-format" } =>
  (raw as { format?: string })?.format === "bridger.host-manifest/1" ? raw as HostManifest : { _tag: "ManifestRejected", reason: "unknown-format" }

export interface Projection {
  readonly desired: ReadonlyArray<DesiredPlugin>
  readonly dropped: ReadonlyArray<{ readonly id: string; readonly reason: string }>
  readonly pending: ReadonlyArray<{ readonly id: string; readonly reason: "revocation-stale" }>
  readonly patchReports: ReadonlyArray<{ readonly id: string; readonly reason: "not-overridable" | "not-in-manifest" }>
}
/**
 * BEH-FD-005, 006, 007, 012. An entry that does not resolve is dropped from the list; one already owned keeps its last resolved
 * definition (`lastResolved`) while pending for "revocation-stale". Patches only reach `overridable` fields of entries the manifest lists.
 */
export const projectManifest = (m: HostManifest, o: { readonly resolver: Resolver; readonly patches?: ReadonlyArray<LocalPatch>; readonly fresh: boolean; readonly pendingKills?: ReadonlyArray<KillEntry>; readonly lastResolved?: ReadonlyMap<string, AnyPlugin> }): Effect.Effect<Projection> => Effect.gen(function* () {
  const dropped: Array<{ id: string; reason: string }> = [], pending: Array<{ id: string; reason: "revocation-stale" }> = []
  const base: Array<DesiredPlugin & { requiresFresh?: boolean }> = []
  for (const p of m.plugins) {
    const r = yield* o.resolver(p.digest).pipe(Effect.map((plugin) => ({ plugin })), Effect.catch((e) => Effect.succeed({ fail: e })))
    const plugin = "plugin" in r ? r.plugin : (r.fail.reason === "revocation-stale" ? o.lastResolved?.get(p.id) : undefined)
    if (!plugin) { dropped.push({ id: p.id, reason: "fail" in r ? r.fail.reason : "unresolved" }); if ("fail" in r && r.fail.reason === "revocation-stale") pending.push({ id: p.id, reason: "revocation-stale" }); continue }
    if ("fail" in r) pending.push({ id: p.id, reason: "revocation-stale" })       // kept on its last definition while pending
    base.push({ id: p.id, plugin, ...(p.realm ? { realm: p.realm } : {}), ...(p.config !== undefined ? { config: p.config } : {}), ...(p.disabled ? { disabled: true } : {}),
      ...(p.mandatoryInterceptions ? { mandatoryInterceptions: p.mandatoryInterceptions } : {}), ...(p.allowChildren ? { allowChildren: true } : {}), ...(p.requiresFresh ? { requiresFresh: true } : {}) })
  }
  const patchReports: Array<{ id: string; reason: "not-overridable" | "not-in-manifest" }> = []
  const allowed: Array<Partial<DesiredPlugin> & { id: string }> = []
  for (const pt of o.patches ?? []) {
    const realm = pt.realm ?? "default"
    if (!m.plugins.some((p) => p.id === pt.id && (p.realm ?? "default") === realm) || pt.plugin !== undefined) { patchReports.push({ id: pt.id, reason: "not-in-manifest" }); continue }   // a patch never adds an entry
    const fields = m.overridable?.find((x) => x.id === pt.id && (x.realm ?? "default") === realm)?.fields ?? []
    const keep: Partial<DesiredPlugin> & { id: string } = { id: pt.id }
    for (const f of ["config", "disabled"] as const) {
      if (pt[f] === undefined) continue
      if (fields.includes(f)) (keep as Record<string, unknown>)[f] = pt[f]; else patchReports.push({ id: pt.id, reason: "not-overridable" })
    }
    if (Object.keys(keep).length > 1) allowed.push(keep)
  }
  const overlaid = Desired.overlay(base, allowed) as ReadonlyArray<DesiredPlugin & { requiresFresh?: boolean }>
  const withFlag = overlaid.map((d) => ({ ...d, requiresFresh: base.find((b) => b.id === d.id)?.requiresFresh }))
  const killed = applyKills(withFlag.map((d) => ({ ...d, digest: m.plugins.find((p) => p.id === d.id)?.digest })), [...(m.kill ?? []), ...(o.pendingKills ?? [])])   // last, and not overridable
  const final = applyFreshness(killed.desired, o.fresh).map(({ requiresFresh: _r, digest: _d, ...d }) => d as DesiredPlugin)
  return { desired: final, dropped, pending, patchReports }
})

export interface FederationOptions extends Omit<SyncOptions, "apply" | "authority" | "host"> {
  readonly authority: string; readonly host: string
  readonly reconcile: (desired: ReadonlyArray<DesiredPlugin>, opts: ReconcileOptions & { readonly reason?: string }) => Effect.Effect<ReconcileReport, unknown>
  readonly resolver: Resolver
  readonly patches?: () => ReadonlyArray<LocalPatch>
  readonly now: Effect.Effect<number>
  readonly freshness: { readonly maxOffline: number | "forever"; readonly skewTolerance: number }
  readonly firstActivation: number
  /** Durable state; absent: nothing survives a restart. */
  readonly state?: StateStore
  /** Plugins installed outside the federation scope, for `kill-unowned`. */
  readonly outside?: () => ReadonlyArray<Listed>
  /** Disable a plugin the federation owns (kills that act without a manifest, BEH-FD-048). */
  readonly disable?: (ref: { readonly id: string; readonly realm: string }, reason: string) => Effect.Effect<void, unknown>
}
/** Ties the sync attempt, projection, kills and freshness to one attributed reconcile in the federation's scope. */
export const makeFederation = (o: FederationOptions) => Effect.gen(function* () {
  let last: HostManifest | undefined; let lastFresh = true
  const lastResolved = new Map<string, AnyPlugin>()
  const status: { pending: Projection["pending"]; dropped: Projection["dropped"]; patchReports: Projection["patchReports"]; stale: ReadonlyArray<StaleReason>; events: Array<{ _tag: string }> } = { pending: [], dropped: [], patchReports: [], stale: [], events: [] }
  let contact: number | undefined
  const input = (m: HostManifest, now: number): FreshnessInput => ({ now, issuedAt: m.issuedAt, ...(m.validUntil !== undefined ? { validUntil: m.validUntil } : {}), ...(contact !== undefined ? { lastContact: contact } : {}), firstActivation: o.firstActivation, ...o.freshness })
  const applyWith = (m: HostManifest, fresh: boolean, why: string, stored?: { envelope: Envelope; acceptedAt: number }) => Effect.gen(function* () {
    const patches = o.patches?.() ?? []
    const pendingKills = (yield* (o.state?.read ?? Effect.succeed({ pendingKills: [] }))).pendingKills
    const proj = yield* projectManifest(m, { resolver: o.resolver, patches, fresh, pendingKills, lastResolved })
    const unowned = applyKills([], [...(m.kill ?? []), ...pendingKills], o.outside?.() ?? []).events
    for (const e of unowned) status.events.push(e)                                 // kill-unowned is published, nothing is done to the plugin
    for (const d of proj.desired) lastResolved.set(d.id, d.plugin)
    status.pending = proj.pending; status.dropped = proj.dropped; status.patchReports = proj.patchReports
    const actors = [...new Set(patches.map((p) => p.actor))].sort()
    yield* o.reconcile(proj.desired, { scope: `federation:${o.authority}`, prune: true, reason: `federation ${why} revision ${m.revision}${actors.length ? ` patches by ${actors.join(",")}` : ""}` })
    last = m; lastFresh = fresh
    if (o.state && stored) yield* o.state.update((s) => ({ ...s,
      lastApplied: { ...stored, revision: m.revision, requiresFresh: m.plugins.filter((p) => p.requiresFresh).map((p) => ({ id: p.id, realm: p.realm ?? "default" })) },
      pendingKills: s.pendingKills.filter((k) => k.revision > m.revision) }))      // a full apply clears the kills up to its revision
  })
  const sync = yield* makeSync({ ...o,
    apply: (m, env, at) => Effect.gen(function* () {
      // the highest verified manifest is stored BEFORE it is applied: a crash re-applies it instead of bringing back a killed plugin
      if (o.state) yield* o.state.update((s) => ({ ...s, highest: { envelope: env, acceptedAt: at, revision: m.revision } }))
      const cur = yield* readState()
      if (cur.marker) {                                                            // a re-bootstrap is pending: a kill-only apply, its kills recorded as pending
        const kills = ((m as unknown as HostManifest).kill ?? []).map((k) => ({ ...k, revision: m.revision }))
        yield* o.state!.update((s) => ({ ...s, pendingKills: [...s.pendingKills, ...kills] }))
        yield* killsActWithout(yield* readState())
        return
      }
      yield* applyWith(m as unknown as HostManifest, true, "apply", { envelope: env, acceptedAt: at })
    }).pipe(Effect.orDie) })
  /** On a fresh/stale transition, re-apply the same revision with the new freshness; staleness removes and reconfigures nothing. */
  const checkFreshness = Effect.gen(function* () {
    if (!last) return "no-manifest" as const
    contact = sync.lastContact()
    const f = freshness(input(last, yield* o.now)); status.stale = f.reasons
    if (f.reasons.includes("offline-capped") && !status.events.some((e) => e._tag === "offline-capped")) status.events.push({ _tag: "offline-capped" })
    if (f.reasons.includes("clock-skew")) status.events.push({ _tag: "clock-skew" })
    if (f.fresh !== lastFresh) { yield* applyWith(last, f.fresh, f.fresh ? "freshness restored" : "freshness lost").pipe(Effect.orDie); return f.fresh ? "fresh" as const : "stale" as const }
    return "unchanged" as const
  })
  /** Disable what a pending kill matches without any manifest (BEH-FD-048): by id and realm, or by the digest the stored manifest lists. */
  const killsActWithout = (s: import("./durable.js").DurableState) => Effect.gen(function* () {
    if (!o.disable) return
    const digests = new Map<string, { id: string; realm: string }[]>()
    try { for (const p of (JSON.parse(s.lastApplied?.envelope.payload ?? "{}") as HostManifest).plugins ?? []) digests.set(p.digest, [...(digests.get(p.digest) ?? []), { id: p.id, realm: p.realm ?? "default" }]) } catch { /* unreadable stored bytes: id kills still act */ }
    for (const k of s.pendingKills) {
      const targets = [...(k.id ? [{ id: k.id, realm: k.realm ?? "default" }] : []), ...(k.digest ? digests.get(k.digest) ?? [] : [])]
      for (const t of targets) yield* o.disable(t, `pending kill of revision ${k.revision}`).pipe(Effect.catch(() => Effect.sync(() => { status.events.push({ _tag: "kill-pending" }) })))
    }
  })
  const readState = () => (o.state?.read ?? Effect.succeed({ pendingKills: [] } as import("./durable.js").DurableState))
  /**
   * BEH-FD-010, 048: re-verify the last applied manifest from its stored bytes with `reverify { acceptedAt }`, then apply it. A refusal
   * reports `store-invalid`, reconciles nothing, keeps the stored manifest, and lets the pending kills act by disabling.
   */
  const boot = Effect.gen(function* () {
    const s = yield* readState()
    if (s.firstActivation === undefined && o.state) yield* o.state.update((x) => ({ ...x, firstActivation: o.firstActivation }))   // stored once, before the boot apply
    const target = !s.marker && s.highest && (!s.lastApplied || s.highest.revision > s.lastApplied.revision) ? s.highest : s.lastApplied   // stored before applied: a crash re-applies it
    if (!target) return "no-state" as const
    const v = yield* Effect.exit(verifyManifest(o.policy, target.envelope, { acceptedAt: target.acceptedAt }))
    if (v._tag === "Failure") { status.events.push({ _tag: "store-invalid" }); yield* killsActWithout(s); return "store-invalid" as const }
    const m = v.value as unknown as HostManifest
    contact = undefined
    const f = freshness(input(m, yield* o.now))
    yield* applyWith(m, f.fresh, s.marker ? "boot (re-bootstrap pending)" : "boot", { envelope: target.envelope, acceptedAt: target.acceptedAt }).pipe(Effect.orDie)     // pending kills are removed from the list (projectManifest)
    return (s.marker ? "marker-pending" : "applied") as "marker-pending" | "applied"
  })
  /** The running loop: sync, check freshness, wait the (jittered, backed-off) interval; ends with its fiber. */
  const loop = Effect.forever(Effect.gen(function* () { yield* sync.sync; yield* checkFreshness; yield* Effect.sleep(yield* sync.nextInterval) }))
  return { boot, loop, sync: sync.sync as Effect.Effect<SyncOutcome>, nextInterval: sync.nextInterval, checkFreshness, status, applied: () => last }
})
