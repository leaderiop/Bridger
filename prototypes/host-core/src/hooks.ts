// Hook points (references/core behaviour 31, BEH-BR-297–312): a helper over a ContributionRegistry, outside Host.
//
// Prototype simplifications (RESULTS.md, P7):
//  - The owner is read from `@bridger/core/ActivePlugin` (no plugin principal in this prototype, core 28).
//  - Durations are milliseconds. The wake step polls the registry and the HostLink every millisecond.
//  - The deadline annotation of core 30 is not read; the effective deadline is min(point, call option).
import { Cause, Clock, Deferred, Effect, Exit, Fiber, Option, PubSub, Schema, Scope, Stream } from "effect"
import { ActivePlugin } from "./active.js"
import { HostLink, type DeclaredContribution } from "./host.js"
import * as Registry from "./registry.js"

export type HookRole = "veto" | "enrich" | "advisory"
export type HookResult<En, Ad, Code extends string> =
  | { readonly _tag: "Pass" }
  | { readonly _tag: "Veto"; readonly code: Code; readonly params?: Readonly<Record<string, string | number | boolean>> }
  | { readonly _tag: "Enrich"; readonly value: En }
  | { readonly _tag: "Advise"; readonly value: Ad }
export interface HookOwner { readonly pluginId?: string; readonly realm?: string }
export type Labels = Readonly<Record<string, string>>
export interface HookContext<En, Target> {
  readonly hookPoint: string
  readonly dispatchId: string
  readonly phase: "enrich" | "veto" | "advise"
  readonly enrichments: ReadonlyArray<{ readonly id: string; readonly value: En }>
  readonly missing: ReadonlyArray<string>
  readonly target?: Target
}
export type Hook<In, En, Ad, Code extends string, Target> = (input: In, ctx: HookContext<En, Target>) => Effect.Effect<HookResult<En, Ad, Code>, unknown>
export type OnErrorPolicy = "deny" | "skip" | { readonly default: "deny" | "skip"; readonly allow: ReadonlyArray<"deny" | "skip"> }
export type DormantPolicy = "wake" | "deny" | { readonly veto?: "wake" | "deny"; readonly enrich?: "wake" | "skip"; readonly advisory?: "wake" | "skip" }
export type PolicyDecision = { readonly _tag: "Run" } | { readonly _tag: "Skip"; readonly reason: string } | { readonly _tag: "Deny"; readonly reason: string }
export type SettleOutcome = "passed" | "vetoed" | "enriched" | "advised" | "failed" | "timeout" | "interrupted" | "revoked"
export interface AdmissionRequest<Sel> { readonly onError?: "deny" | "skip"; readonly target?: Sel; readonly declared: boolean }
export type AdmissionRule<Sel> = (contributor: HookOwner & { readonly labels: Labels }, role: HookRole, hookPoint: string, request: AdmissionRequest<Sel>) => boolean
export interface HookPointOptions<In, En, Ad, Code extends string, Target, Sel> {
  readonly codes: ReadonlyArray<Code>
  readonly enrichment?: Schema.Schema<En>
  readonly advice?: Schema.Schema<Ad>
  readonly who: AdmissionRule<Sel>
  readonly labelsOf?: (owner: HookOwner) => Labels
  readonly timeout: number
  readonly deadline: number
  readonly onError: OnErrorPolicy
  readonly breaker?: { readonly failures: number; readonly window: number; readonly cooldown: number } | "off"
  readonly breakerScope?: "contribution" | "plugin"
  readonly dormant?: DormantPolicy
  readonly targets?: { readonly descriptor: (input: In) => Target; readonly selector: Schema.Schema<Sel>; readonly matches: (sel: Sel, target: Target) => boolean }
  readonly policy?: (step: { readonly id: string; readonly role: HookRole; readonly owner?: HookOwner; readonly labels: Labels; readonly declared: boolean; readonly selector?: Sel }, input: In, target: Target | undefined) => Effect.Effect<PolicyDecision>
  /** BEH-BR-309 (CCR-BR-029): default false — `HostLink.none` counts as no link on a point with codes. */
  readonly allowNoLink?: boolean
  readonly settle?: (step: { readonly id: string; readonly role: HookRole; readonly owner?: HookOwner; readonly labels: Labels; readonly outcome: SettleOutcome }, input: In, target: Target | undefined) => Effect.Effect<void>
}
export type StepOutcome = "pass" | "veto" | "enrich" | "advise" | "failed" | "timeout" | "deadline" | "breaker-open" | "skipped-policy" | "skipped-deadline" | "not-run"
  | "denied-policy" | "not-targeted" | "dormant" | "wake-failed" | "wake-timeout" | "skipped-dormant" | "declared-refused"
export type DenyCause = "veto" | "hook-failed" | "hook-timeout" | "breaker-open" | "deadline" | "denied-policy" | "dormant" | "wake-failed" | "wake-timeout" | "no-host-link" | "target-failed"
export type HookVerdict<Code extends string> = { readonly _tag: "Allowed" } | { readonly _tag: "Denied"; readonly by?: string; readonly cause: DenyCause; readonly code?: Code; readonly params?: Readonly<Record<string, string | number | boolean>>; readonly reason?: string }
export interface HookDecisionRecord {
  readonly type: "decision"
  readonly hookPoint: string
  readonly dispatchId: string
  readonly startedAt: string
  readonly elapsedMs: number
  readonly deadlineMs: number
  readonly viewRevision: number
  readonly declarations?: "unseen"
  /** BEH-BR-305, 309: the hostId of the HostLink read, "none" for HostLink.none; absent with no link. */
  readonly link?: string
  readonly verdict: "allowed" | "denied" | "abandoned"
  readonly decidedBy?: { readonly id?: string; readonly owner?: HookOwner; readonly cause: string; readonly code?: string }
  readonly steps: ReadonlyArray<{ readonly id: string; readonly owner?: HookOwner; readonly role: HookRole; readonly declared?: true; readonly woken?: true; readonly outcome: StepOutcome; readonly errorTag?: string; readonly skipReason?: string }>
}
export interface HookBreakerRecord { readonly type: "breaker"; readonly hookPoint: string; readonly scope: "contribution" | "plugin"; readonly contribution: string; readonly owner?: HookOwner; readonly state: "closed" | "open" | "half-open"; readonly at: string }
export interface HookOutcome<En, Ad, Code extends string> {
  readonly verdict: HookVerdict<Code>
  readonly enrichments: ReadonlyArray<{ readonly id: string; readonly value: En }>
  readonly advice: ReadonlyArray<{ readonly id: string; readonly value: Ad }>
  readonly record: HookDecisionRecord
}
export class HookRegistrationRefused extends Schema.TaggedError<HookRegistrationRefused>()("HookRegistrationRefused", { hookPoint: Schema.String, id: Schema.String, role: Schema.String }) {}

interface Contribution<In, En, Ad, Code extends string, Target, Sel> {
  readonly id: string; readonly hook: Hook<In, En, Ad, Code, Target>; readonly role: HookRole; readonly owner?: HookOwner
  readonly labels: Labels; readonly onError: "deny" | "skip"; readonly selector?: Sel; readonly token: object
}
interface Breaker { state: "closed" | "open" | "half-open"; errors: Array<number>; openedAt: number; probing: boolean; readonly members: Set<object> }

export const make = <In, En = never, Ad = never, Code extends string = never, Target = never, Sel = never>(
  id: string, options: HookPointOptions<In, En, Ad, Code, Target, Sel>
): Effect.Effect<HookPoint<In, En, Ad, Code, Target, Sel>, never, Scope.Scope> => Effect.gen(function* () {
  // BEH-BR-297: option defects.
  const o = options
  const defect = (why: string) => Effect.die(new Error(`hook point ${id}: ${why}`))
  if (new Set(o.codes).size !== o.codes.length) return yield* defect("a code repeats")
  if (!(o.timeout > 0 && Number.isFinite(o.timeout)) || !(o.deadline > 0 && Number.isFinite(o.deadline)) || o.timeout > o.deadline) return yield* defect("timeout/deadline")
  if (typeof o.onError === "object" && (o.onError.allow.length === 0 || !o.onError.allow.includes(o.onError.default))) return yield* defect("onError")
  if (typeof o.dormant === "string" && o.codes.length === 0) return yield* defect("dormant string with empty codes")
  const vetoDormant = typeof o.dormant === "string" ? o.dormant : o.dormant?.veto ?? "wake"
  // BEH-BR-297 (CCR-BR-028, G-P3): an empty wake window is refused when a veto may be woken.
  if (o.codes.length > 0 && vetoDormant === "wake" && o.timeout === o.deadline) return yield* defect("timeout equals deadline while a veto may be woken")
  const scope = yield* Effect.scope
  const registry = yield* Registry.make<Contribution<In, En, Ad, Code, Target, Sel>>({ name: id })
  const decisions = yield* PubSub.sliding<HookDecisionRecord | HookBreakerRecord>(1024)
  let open = true
  yield* Effect.addFinalizer(() => Effect.sync(() => { open = false }))
  let dispatchSeq = 0
  const defaultOnError = typeof o.onError === "string" ? o.onError : o.onError.default
  const allowed = typeof o.onError === "string" ? [o.onError] : o.onError.allow
  const dormant = { veto: "wake" as "wake" | "deny", enrich: "skip" as "wake" | "skip", advisory: "skip" as "wake" | "skip",
    ...(typeof o.dormant === "string" ? { veto: o.dormant } : o.dormant ?? {}) }
  const breakerOpts = o.breaker === "off" ? undefined : o.breaker ?? { failures: 5, window: 60_000, cooldown: 30_000 }
  const breakerScope = o.breakerScope ?? "contribution"
  const breakers = new Map<string, Breaker>()
  const labelsOf = (owner: HookOwner) => o.labelsOf ? o.labelsOf(owner) : {}
  const iso = (ms: number) => new Date(ms).toISOString()
  // BEH-BR-309 (R1-10): declarations seen "waking" through one whole window, per (pluginId, realm, id).
  const wakingWaited = new Set<string>()

  // ------------------------------------------------------------ breakers (BEH-BR-304, 310)
  const breakerKey = (c: { id: string; owner?: HookOwner }) =>
    breakerScope === "plugin" && c.owner?.pluginId !== undefined ? `plugin:${c.owner.realm ?? "default"}:${c.owner.pluginId}` : `contribution:${c.id}`
  const breakerOf = (c: Contribution<In, En, Ad, Code, Target, Sel>) => {
    const k = breakerKey(c)
    let b = breakers.get(k)
    if (!b) { b = { state: "closed", errors: [], openedAt: 0, probing: false, members: new Set() }; breakers.set(k, b) }
    b.members.add(c.token)
    return b
  }
  const publishBreaker = (c: Contribution<In, En, Ad, Code, Target, Sel>, state: Breaker["state"]) => Effect.gen(function* () {
    const at = iso(yield* Clock.currentTimeMillis)
    const scopeOf = breakerKey(c).startsWith("plugin:") ? "plugin" as const : "contribution" as const
    yield* PubSub.publish(decisions, { type: "breaker", hookPoint: id, scope: scopeOf, contribution: c.id, ...(c.owner ? { owner: c.owner } : {}), state, at })
    yield* Effect.logWarning(`hook point ${id}: breaker of ${c.id} ${state}`)
  })
  /** "call" (with probe flag) or "open". */
  const admitBreaker = (c: Contribution<In, En, Ad, Code, Target, Sel>) => Effect.gen(function* () {
    if (!breakerOpts) return { call: true, probe: false }
    const b = breakerOf(c)
    const now = yield* Clock.currentTimeMillis
    if (b.state === "open" && now - b.openedAt >= breakerOpts.cooldown) { b.state = "half-open"; yield* publishBreaker(c, "half-open") }
    if (b.state === "open") return { call: false, probe: false }
    if (b.state === "half-open") { if (b.probing) return { call: false, probe: false }; b.probing = true; return { call: true, probe: true } }
    return { call: true, probe: false }
  })
  const recordResult = (c: Contribution<In, En, Ad, Code, Target, Sel>, error: boolean, probe: boolean) => Effect.gen(function* () {
    if (!breakerOpts) return
    const b = breakerOf(c)
    const now = yield* Clock.currentTimeMillis
    if (probe) {
      b.probing = false
      if (error) { b.state = "open"; b.openedAt = now; yield* publishBreaker(c, "open") }
      else { b.state = "closed"; b.errors = []; yield* publishBreaker(c, "closed") }
      return
    }
    if (!error) return
    b.errors = [...b.errors.filter((t) => now - t < breakerOpts.window), now]
    if (b.state === "closed" && b.errors.length >= breakerOpts.failures) { b.state = "open"; b.openedAt = now; yield* publishBreaker(c, "open") }
  })

  // ------------------------------------------------------------ register (BEH-BR-298, 310, 312)
  const register = (cid: string, hook: Hook<In, En, Ad, Code, Target>, ro: { readonly role: HookRole; readonly priority?: number; readonly onError?: "deny" | "skip"; readonly target?: unknown }) =>
    Effect.gen(function* () {
      const refused = new HookRegistrationRefused({ hookPoint: id, id: cid, role: ro.role })
      if (ro.role === "veto" && o.codes.length === 0) return yield* Effect.fail(refused)
      if (ro.onError !== undefined && (!allowed.includes(ro.onError) || (ro.onError === "deny" && ro.role !== "veto"))) return yield* Effect.fail(refused)
      let selector: Sel | undefined
      if (ro.target !== undefined) {
        if (!o.targets) return yield* Effect.fail(refused)
        const decoded = Schema.decodeUnknownOption(o.targets.selector as Schema.Codec<Sel, unknown>)(ro.target)
        if (Option.isNone(decoded)) return yield* Effect.fail(refused)
        selector = decoded.value
      }
      const active = yield* ActivePlugin
      const owner: HookOwner | undefined = Option.isSome(active) ? { pluginId: active.value.pluginId, realm: active.value.realm } : undefined
      const onError = ro.role === "veto" ? ro.onError ?? defaultOnError : "skip"
      const admitted = (() => {
        try {
          const labels = labelsOf(owner ?? {})
          return { labels, ok: o.who({ ...(owner ?? {}), labels }, ro.role, id, { ...(ro.role === "veto" ? { onError } : {}), ...(selector !== undefined ? { target: selector } : {}), declared: false }) }
        } catch { return { labels: {}, ok: false } }
      })()
      if (!admitted.ok) return yield* Effect.fail(refused)
      const c: Contribution<In, En, Ad, Code, Target, Sel> = { id: cid, hook, role: ro.role, ...(owner ? { owner } : {}), labels: admitted.labels, onError, ...(selector !== undefined ? { selector } : {}), token: {} }
      yield* registry.add(cid, c, { ...(ro.priority !== undefined ? { priority: ro.priority } : {}) })
      // The breaker is discarded with its contribution (plugin scope: with the owner's last contribution).
      yield* Effect.addFinalizer(() => Effect.sync(() => {
        const k = breakerKey(c), b = breakers.get(k)
        if (b) { b.members.delete(c.token); if (b.members.size === 0) breakers.delete(k) }
      }))
    })

  // ------------------------------------------------------------ dispatch (BEH-BR-299–312)
  const dispatch = (input: In, dopts: { readonly deadline?: number } = {}): Effect.Effect<HookOutcome<En, Ad, Code>> => Effect.gen(function* () {
    const startedMs = yield* Clock.currentTimeMillis
    const dispatchId = `${id}#${++dispatchSeq}`
    const deadlineMs = Math.min(o.deadline, dopts.deadline ?? Infinity)
    const end = startedMs + deadlineMs
    const remaining = Effect.map(Clock.currentTimeMillis, (now) => Math.max(0, end - now))
    type Step = HookDecisionRecord["steps"][number]
    const finish = (verdict: HookVerdict<Code>, steps: ReadonlyArray<Step>, viewRevision: number, enrichments: ReadonlyArray<{ id: string; value: En }>, advice: ReadonlyArray<{ id: string; value: Ad }>, extra: Partial<HookDecisionRecord> = {}) => Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis
      const decider = verdict._tag === "Denied" ? steps.find((s) => s.id === verdict.by) : undefined
      const record: HookDecisionRecord = {
        type: "decision", hookPoint: id, dispatchId, startedAt: iso(startedMs), elapsedMs: now - startedMs, deadlineMs, viewRevision,
        verdict: verdict._tag === "Allowed" ? "allowed" : "denied", steps, ...(linkName !== undefined ? { link: linkName } : {}), ...extra,
        ...(verdict._tag === "Denied" ? { decidedBy: { ...(verdict.by !== undefined ? { id: verdict.by } : {}), ...(decider?.owner ? { owner: decider.owner } : {}), cause: verdict.cause, ...(verdict.code !== undefined ? { code: verdict.code } : {}) } } : {})
      }
      yield* PubSub.publish(decisions, record)
      return { verdict, enrichments: verdict._tag === "Denied" ? enrichments : enrichments, advice: verdict._tag === "Denied" ? [] : advice, record }
    })
    const link = yield* HostLink.reference
    // A link without a hostId cannot be told from HostLink.none and is treated as it (prototype choice, G-P19).
    const isNone = Option.isSome(link) && (link.value === HostLink.none || link.value.hostId === undefined)
    const linkName: string | undefined = Option.isNone(link) ? undefined : isNone ? "none" : link.value.hostId
    if (!open) return yield* finish({ _tag: "Allowed" }, [], 0, [], [])
    const codes = o.codes.length > 0
    // Target (BEH-BR-312).
    let target: Target | undefined
    if (o.targets) {
      try { target = o.targets.descriptor(input) } catch {
        return yield* finish(codes ? { _tag: "Denied", cause: "target-failed" } : { _tag: "Allowed" }, [], (yield* registry.view).revision, [], [])
      }
    }
    const matches = (sel: Sel | undefined): boolean | "threw" => {
      if (sel === undefined || !o.targets) return true
      try { return o.targets.matches(sel, target as Target) } catch { return "threw" }
    }
    // BEH-BR-309 (CCR-BR-029, R1-06): no link, HostLink.none without allowNoLink, and a failed or late read deny a
    // point with codes; a point without codes proceeds without declarations ("unseen").
    const noLink = Option.isNone(link) || (isNone && !o.allowNoLink)
    if (noLink && codes) return yield* finish({ _tag: "Denied", cause: "no-host-link" }, [], (yield* registry.view).revision, [], [])
    let read: ReadonlyArray<DeclaredContribution> | undefined
    if (!noLink && Option.isSome(link)) {
      const left0 = yield* remaining
      const got = yield* Effect.suspend(() => link.value.declaredContributions(id)).pipe(
        Effect.timeoutOrElse({ duration: left0, orElse: () => Effect.fail("late" as const) }), Effect.exit)
      if (Exit.isSuccess(got)) read = got.value
      else if (codes) return yield* finish({ _tag: "Denied", cause: "no-host-link" }, [], (yield* registry.view).revision, [], [])
    }
    const unseen = read === undefined

    // ---- wake step (BEH-BR-309)
    const declSteps: Array<Step> = []
    const declDenials: Array<{ id: string; cause: DenyCause; reason?: string }> = []
    const wokenIds = new Set<string>()
    // R1-05: a declaration is matched by id, owner and role.
    const ownedBy = (c: { owner?: HookOwner; role: HookRole }, d: DeclaredContribution, role: HookRole) =>
      c.owner?.pluginId === d.pluginId && (c.owner?.realm ?? "default") === d.realm && c.role === role
    if (read !== undefined && Option.isSome(link)) {
      const viewNow = yield* registry.view
      const roleOf = (d: DeclaredContribution): HookRole | undefined => d.role ?? (codes ? "veto" : undefined)
      const decls = read.filter((d) => { const r = roleOf(d); return !r || !viewNow.entries.some((e) => e.id === d.id && ownedBy(e.value, d, r)) })
      const plans: Array<{ d: DeclaredContribution; role: HookRole; mode: "wake" | "deny"; step: (outcome: StepOutcome, extra?: Partial<Step>) => void }> = []
      for (const d of decls) {
        const role = roleOf(d)
        if (!role) continue
        const owner: HookOwner = { pluginId: d.pluginId, realm: d.realm }
        const dup = viewNow.entries.some((e) => e.id === d.id)
        let selector: Sel | undefined
        if (d.target !== undefined && o.targets) { const dec = Schema.decodeUnknownOption(o.targets.selector as Schema.Codec<Sel, unknown>)(d.target); if (Option.isSome(dec)) selector = dec.value }
        let labels: Labels = {}, ok = false
        try { labels = labelsOf(owner); ok = o.who({ ...owner, labels }, role, id, { ...(role === "veto" ? { onError: defaultOnError } : {}), ...(selector !== undefined ? { target: selector } : {}), declared: true }) } catch { ok = false }
        const step = (outcome: StepOutcome, extra: Partial<Step> = {}) => declSteps.push({ id: d.id, owner, role, declared: true, outcome, ...(dup ? { errorTag: "DuplicateContribution" } : {}), ...extra })
        if (!ok) { step("declared-refused"); continue }
        const m = matches(selector)
        if (m === "threw") { if (codes) return yield* finish({ _tag: "Denied", cause: "target-failed" }, [], viewNow.revision, [], []); continue }
        if (!m) { step("not-targeted"); continue }
        if (o.policy) {
          const pd = yield* o.policy({ id: d.id, role, owner, labels, declared: true, ...(selector !== undefined ? { selector } : {}) }, input, target).pipe(Effect.exit)
          if (Exit.isSuccess(pd) && pd.value._tag === "Skip") { step("skipped-policy", { skipReason: pd.value.reason }); continue }
          if (Exit.isSuccess(pd) && pd.value._tag === "Deny") {
            if (role === "veto") { step("denied-policy", { skipReason: pd.value.reason }); declDenials.push({ id: d.id, cause: "denied-policy", reason: pd.value.reason }); continue }
            step("skipped-policy", { skipReason: pd.value.reason }); continue
          }
        }
        const mode = role === "veto" ? dormant.veto : role === "enrich" ? dormant.enrich : dormant.advisory
        if (mode === "skip") { step("skipped-dormant"); continue }
        plans.push({ d, role, mode, step })
      }
      // R1-08: one more `timeout` for the enrich phase when it has work.
      const enrichWork = viewNow.entries.some((e) => e.value.role === "enrich") || plans.some((p) => p.role === "enrich" && p.mode === "wake")
      const windowEnd = end - o.timeout - (enrichWork ? o.timeout : 0)
      const startedWake = yield* Clock.currentTimeMillis
      const work: Array<Effect.Effect<void>> = []
      for (const { d, role, mode, step } of plans) {
        const wkey = `${d.pluginId}|${d.realm}|${d.id}`
        if (d.status !== "waking") wakingWaited.delete(wkey)
        // R1-03/R1-04: "idling" is woken as "dormant"; "waking", "load-failed" and "refused" are not woken.
        const callWake = d.status === "dormant" || d.status === "idling"
          ? Effect.suspend(() => link.value.wake({ _tag: "OnContribution", registry: id, id: d.id }, { realm: d.realm })).pipe(Effect.as(true), Effect.catchCause(() => Effect.succeed(false)))
          : Effect.succeed(d.status === "waking")
        if (mode === "deny") { work.push(Effect.gen(function* () { yield* callWake; step("dormant"); declDenials.push({ id: d.id, cause: "dormant" }) })); continue }
        const resolve = (outcome: "wake-failed" | "wake-timeout") => { step(outcome); if (role === "veto" && defaultOnError === "deny") declDenials.push({ id: d.id, cause: outcome }) }
        const arrived = Effect.map(registry.view, (v) => v.entries.some((e) => e.id === d.id && ownedBy(e.value, d, role)))
        // "wake": wake from the dispatcher's fiber, then wait for the contribution, the end of the registration or the window.
        work.push(Effect.gen(function* () {
          if (d.status === "refused") { resolve("wake-failed"); return }          // R1-04: decided by onError, no wake
          if (d.status === "waking" && wakingWaited.has(wkey)) { resolve("wake-timeout"); return }   // R1-10
          const woke = yield* callWake
          if (!woke) { resolve("wake-failed"); return }
          const fullWindow = startedWake < windowEnd
          while (true) {
            if (yield* arrived) { wokenIds.add(d.id); wakingWaited.delete(wkey); return }
            const now = yield* Clock.currentTimeMillis
            if (now >= windowEnd) { if (fullWindow) wakingWaited.add(wkey); resolve("wake-timeout"); return }
            const again = (yield* Effect.suspend(() => link.value.declaredContributions(id)).pipe(Effect.orElseSucceed(() => [] as ReadonlyArray<DeclaredContribution>)))
              .find((x) => x.id === d.id && x.pluginId === d.pluginId && x.realm === d.realm)
            if (!again || again.status === "load-failed" || again.status === "refused") {
              if (yield* arrived) { wokenIds.add(d.id); return }
              resolve("wake-failed"); return
            }
            yield* Effect.sleep(1)
          }
        }))
      }
      yield* Effect.all(work, { concurrency: "unbounded", discard: true })
    }
    declSteps.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    if (declDenials.length) {
      const first = [...declDenials].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)[0]!
      return yield* finish({ _tag: "Denied", by: first.id, cause: first.cause, ...(first.reason !== undefined ? { reason: first.reason } : {}) }, declSteps, (yield* registry.view).revision, [], [])
    }

    // ---- phases over the view taken now, held for the dispatch (BEH-BR-299, 311)
    return yield* registry.useAll((view) => Effect.gen(function* () {
      const contributions = view.entries.map((e) => e.value)
      const outcomes = new Map<string, Step>()
      const set = (c: Contribution<In, En, Ad, Code, Target, Sel>, outcome: StepOutcome, extra: Partial<Step> = {}) =>
        outcomes.set(c.id, { id: c.id, ...(c.owner ? { owner: c.owner } : {}), role: c.role, ...(wokenIds.has(c.id) ? { woken: true as const } : {}), outcome, ...extra })
      const enrichments: Array<{ id: string; value: En }> = []
      const advice: Array<{ id: string; value: Ad }> = []
      const missing: Array<string> = []
      /** One hook call: policy, breaker, the call in a supervised fiber under `timeout`, settle. */
      type CallResult = { kind: "ok"; result: HookResult<En, Ad, Code> } | { kind: "error"; outcome: "failed" | "timeout" | "breaker-open"; errorTag?: string } | { kind: "skipped"; reason: string } | { kind: "denied"; reason: string } | { kind: "deadline" } | { kind: "not-targeted" }
      const callOne = (c: Contribution<In, En, Ad, Code, Target, Sel>, phase: HookContext<En, Target>["phase"]): Effect.Effect<CallResult> => Effect.gen(function* () {
        const m = matches(c.selector)
        if (m !== true) return { kind: "not-targeted" }
        if (o.policy) {
          const pd = yield* o.policy({ id: c.id, role: c.role, ...(c.owner ? { owner: c.owner } : {}), labels: c.labels, declared: false, ...(c.selector !== undefined ? { selector: c.selector } : {}) }, input, target).pipe(Effect.exit)
          if (Exit.isFailure(pd)) return { kind: "error", outcome: "failed", errorTag: "PolicyFailed" }   // not counted toward the breaker
          if (pd.value._tag === "Skip") return { kind: "skipped", reason: pd.value.reason }
          if (pd.value._tag === "Deny") return c.role === "veto" ? { kind: "denied", reason: pd.value.reason } : { kind: "skipped", reason: pd.value.reason }
        }
        const br = yield* admitBreaker(c)
        if (!br.call) return { kind: "error", outcome: "breaker-open" }
        const left = yield* remaining
        const ctx: HookContext<En, Target> = { hookPoint: id, dispatchId, phase, enrichments: phase === "enrich" ? [] : Object.freeze([...enrichments]), missing: phase === "enrich" ? [] : Object.freeze([...missing]), ...(o.targets ? { target: target as Target } : {}) }
        // The call runs in a fiber supervised by the hook point; the dispatcher never waits for its finalizers.
        const settled = yield* Deferred.make<Exit.Exit<HookResult<En, Ad, Code>, unknown>>()
        const fiber = yield* Effect.forkIn(Effect.suspend(() => c.hook(input, ctx)).pipe(Effect.exit, Effect.flatMap((x) => Deferred.succeed(settled, x))), scope)
        const timedOut = Symbol("t"), deadlined = Symbol("d")
        const waited = yield* Deferred.await(settled).pipe(
          Effect.timeoutOrElse({ duration: Math.min(o.timeout, left), orElse: () => Effect.succeed(o.timeout <= left ? timedOut : deadlined) }),
          Effect.onInterrupt(() => Effect.forkIn(Fiber.interrupt(fiber), scope).pipe(Effect.andThen(settleCall(c, "interrupted")))))
        let result: CallResult
        let settleOutcome: SettleOutcome
        if (waited === timedOut) { yield* Effect.forkIn(Fiber.interrupt(fiber), scope); result = { kind: "error", outcome: "timeout" }; settleOutcome = "timeout" }
        else if (waited === deadlined) { yield* Effect.forkIn(Fiber.interrupt(fiber), scope); result = { kind: "deadline" }; settleOutcome = "interrupted" }
        else {
          const x = waited as Exit.Exit<HookResult<En, Ad, Code>, unknown>
          if (Exit.isFailure(x)) {
            const err = Cause.squash(x.cause)
            const tag = Cause.hasFails(x.cause) ? (err as { _tag?: string } | null)?._tag : undefined
            result = { kind: "error", outcome: "failed", ...(tag ? { errorTag: tag } : {}) }; settleOutcome = Cause.hasInterrupts(x.cause) ? "revoked" : "failed"
          } else {
            const r = x.value
            const wrongRole = (r._tag === "Veto" && c.role !== "veto") || (r._tag === "Enrich" && c.role !== "enrich") || (r._tag === "Advise" && c.role !== "advisory")
            const badVeto = r._tag === "Veto" && (!o.codes.includes(r.code) || Object.values(r.params ?? {}).some((v) => !(typeof v === "string" || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v)))))
            const badValue = (r._tag === "Enrich" && (!o.enrichment || !Schema.is(o.enrichment)(r.value))) || (r._tag === "Advise" && (!o.advice || !Schema.is(o.advice)(r.value)))
            if (wrongRole || badVeto || badValue) { result = { kind: "error", outcome: "failed", errorTag: "InvalidResult" }; settleOutcome = "failed" }
            else { result = { kind: "ok", result: r }; settleOutcome = r._tag === "Veto" ? "vetoed" : r._tag === "Enrich" ? "enriched" : r._tag === "Advise" ? "advised" : "passed" }
          }
        }
        // The deadline is not an error of the contribution (BEH-BR-304).
        if (result.kind !== "deadline") yield* recordResult(c, result.kind === "error", br.probe)
        else if (br.probe) { const b = breakerOf(c); b.probing = false }
        yield* settleCall(c, settleOutcome)
        return result
      })
      const settleCall = (c: Contribution<In, En, Ad, Code, Target, Sel>, outcome: SettleOutcome) => o.settle
        ? Effect.uninterruptible(o.settle({ id: c.id, role: c.role, ...(c.owner ? { owner: c.owner } : {}), labels: c.labels, outcome }, input, target).pipe(
            Effect.timeoutOrElse({ duration: o.timeout, orElse: () => Effect.logWarning(`hook point ${id}: settle of ${c.id} timed out`) }),
            Effect.catchCause(() => Effect.logWarning(`hook point ${id}: settle of ${c.id} failed`))))
        : Effect.void

      // enrich (concurrent)
      const enrichers = contributions.filter((c) => c.role === "enrich")
      const enrichResults = yield* Effect.all(enrichers.map((c) => callOne(c, "enrich")), { concurrency: "unbounded" })
      let deadlineHit = false
      enrichers.forEach((c, i) => {
        const r = enrichResults[i]!
        if (r.kind === "ok" && r.result._tag === "Enrich") { enrichments.push({ id: c.id, value: r.result.value }); set(c, "enrich") }
        else {
          missing.push(c.id)
          if (r.kind === "ok") set(c, "pass")
          else if (r.kind === "error") set(c, r.outcome, r.errorTag ? { errorTag: r.errorTag } : {})
          else if (r.kind === "skipped" || r.kind === "denied") set(c, "skipped-policy", { skipReason: r.reason })
          else if (r.kind === "deadline") { set(c, "deadline"); deadlineHit = true }
          else set(c, "not-targeted")
        }
      })
      // veto (serial)
      let verdict: HookVerdict<Code> = { _tag: "Allowed" }
      const vetoers = contributions.filter((c) => c.role === "veto")
      for (let i = 0; i < vetoers.length; i++) {
        const c = vetoers[i]!
        if (verdict._tag === "Denied") { set(c, "not-run"); continue }
        if (deadlineHit || (yield* remaining) <= 0) {
          // Decide from the uncompleted veto contributions (BEH-BR-303).
          for (const rest of vetoers.slice(i)) set(rest, "skipped-deadline")
          const firstDeny = vetoers.slice(i).find((x) => x.onError === "deny" && matches(x.selector) === true)
          if (firstDeny) verdict = { _tag: "Denied", by: firstDeny.id, cause: "deadline" }
          break
        }
        const r = yield* callOne(c, "veto")
        if (r.kind === "ok") {
          if (r.result._tag === "Veto") { set(c, "veto"); verdict = { _tag: "Denied", by: c.id, cause: "veto", code: r.result.code, ...(r.result.params ? { params: r.result.params } : {}) } }
          else set(c, "pass")
        } else if (r.kind === "error") {
          set(c, r.outcome, r.errorTag ? { errorTag: r.errorTag } : {})
          if (c.onError === "deny") verdict = { _tag: "Denied", by: c.id, cause: r.outcome === "timeout" ? "hook-timeout" : r.outcome === "breaker-open" ? "breaker-open" : "hook-failed" }
        } else if (r.kind === "skipped") set(c, "skipped-policy", { skipReason: r.reason })
        else if (r.kind === "denied") { set(c, "denied-policy", { skipReason: r.reason }); verdict = { _tag: "Denied", by: c.id, cause: "denied-policy", reason: r.reason } }
        else if (r.kind === "not-targeted") set(c, "not-targeted")
        else {
          set(c, "deadline")
          for (const rest of vetoers.slice(i + 1)) set(rest, "skipped-deadline")
          const firstDeny = vetoers.slice(i).find((x) => x.onError === "deny" && matches(x.selector) === true)
          if (firstDeny) verdict = { _tag: "Denied", by: firstDeny.id, cause: "deadline" }
          break
        }
      }
      // advise (concurrent, only when Allowed)
      const advisers = contributions.filter((c) => c.role === "advisory")
      if (verdict._tag === "Allowed") {
        const res = yield* Effect.all(advisers.map((c) => callOne(c, "advise")), { concurrency: "unbounded" })
        advisers.forEach((c, i) => {
          const r = res[i]!
          if (r.kind === "ok" && r.result._tag === "Advise") { advice.push({ id: c.id, value: r.result.value }); set(c, "advise") }
          else if (r.kind === "ok") set(c, "pass")
          else if (r.kind === "error") set(c, r.outcome, r.errorTag ? { errorTag: r.errorTag } : {})
          else if (r.kind === "skipped" || r.kind === "denied") set(c, "skipped-policy", { skipReason: r.reason })
          else if (r.kind === "deadline") set(c, "deadline")
          else set(c, "not-targeted")
        })
      } else for (const c of advisers) set(c, "not-run")
      const steps = [...contributions.map((c) => outcomes.get(c.id) ?? { id: c.id, role: c.role, outcome: "not-run" as const }), ...declSteps.filter((s) => !wokenIds.has(s.id))]
      return yield* finish(verdict, steps, view.revision, enrichments, advice, unseen ? { declarations: "unseen" as const } : {})
    })).pipe(Effect.orDie)
  })

  return {
    id, register, dispatch,
    view: Effect.map(registry.view, (v) => ({ revision: v.revision, entries: v.entries.map((e) => ({ id: e.id, priority: e.priority, role: e.value.role, owner: e.value.owner, onError: e.value.onError })) })),
    decisions: Stream.fromPubSub(decisions)
  } satisfies HookPoint<In, En, Ad, Code, Target, Sel>
})

export interface HookPoint<In, En, Ad, Code extends string, Target, Sel> {
  readonly id: string
  readonly register: (id: string, hook: Hook<In, En, Ad, Code, Target>, options: { readonly role: HookRole; readonly priority?: number; readonly onError?: "deny" | "skip"; readonly target?: unknown }) =>
    Effect.Effect<void, HookRegistrationRefused | import("./errors.js").DuplicateContribution | import("./errors.js").IncompatibleContract, Scope.Scope>
  readonly dispatch: (input: In, options?: { readonly deadline?: number }) => Effect.Effect<HookOutcome<En, Ad, Code>>
  readonly view: Effect.Effect<{ readonly revision: number; readonly entries: ReadonlyArray<{ readonly id: string; readonly priority: number; readonly role: HookRole; readonly owner?: HookOwner; readonly onError: "deny" | "skip" }> }>
  readonly decisions: Stream.Stream<HookDecisionRecord | HookBreakerRecord>
}
export const HookPoint = { make }
