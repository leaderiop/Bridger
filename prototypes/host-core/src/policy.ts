// Principals, access, capability, call log, correlation and caller context (references/core behaviours 28, 29, 30
// and 22 BEH-BR-187), the parts the host and helpers share. Prototype only.
import { Context, Effect, Option, Schema, type Stream } from "effect"
import { Annotations, CurrentAnnotations, isBag, type Annotations as Bag } from "./annotations.js"
import { Actor, CurrentActor } from "./gxp.js"

// ---------------------------------------------------------------- principals (BEH-BR-257–259)
export interface PrincipalRef { readonly id: string; readonly realm: string; readonly version?: string; readonly digest?: string; readonly revision: number }
export type PluginPrincipal = PrincipalRef
const minted = new WeakSet<object>(), retired = new WeakSet<object>()
export class PrincipalForged extends Error { readonly _tag = "PrincipalForged"; constructor(readonly id: string) { super(`PrincipalForged ${id}`) } }
export class PrincipalRetired extends Error { readonly _tag = "PrincipalRetired"; constructor(readonly id: string) { super(`PrincipalRetired ${id}`) } }
export class NoPluginPrincipal extends Schema.TaggedError<NoPluginPrincipal>()("NoPluginPrincipal", {}) {}
/** Host only. */
export const mint = (r: PrincipalRef): PluginPrincipal => { const p = Object.freeze({ ...r }); minted.add(p); return p }
export const retire = (p: PluginPrincipal | undefined) => { if (p) retired.add(p) }
export const isRetired = (p: PluginPrincipal) => retired.has(p)
export const refOf = (p: PluginPrincipal): PrincipalRef => ({ id: p.id, realm: p.realm, ...(p.version !== undefined ? { version: p.version } : {}), ...(p.digest !== undefined ? { digest: p.digest } : {}), revision: p.revision })
export const PrincipalReference = Context.Reference<Option.Option<PluginPrincipal>>("@bridger/core/CurrentPlugin", { defaultValue: () => Option.none() })
const readRaw: Effect.Effect<Option.Option<PluginPrincipal>> = Effect.gen(function* () { return yield* PrincipalReference })
/** Reading checks forgery; acting also checks retirement (BEH-BR-257). */
const checked = (acting: boolean): Effect.Effect<Option.Option<PluginPrincipal>> => Effect.flatMap(readRaw, (o): Effect.Effect<Option.Option<PluginPrincipal>> => {
  if (Option.isNone(o)) return Effect.succeed(o)
  if (!minted.has(o.value)) return Effect.die(new PrincipalForged(o.value.id))
  if (acting && retired.has(o.value)) return Effect.die(new PrincipalRetired(o.value.id))
  return Effect.succeed(o)
})
export const CurrentPlugin = {
  reference: PrincipalReference,
  get: checked(false),
  require: Effect.flatMap(checked(false), (o) => Option.isSome(o) ? Effect.succeed(o.value) : Effect.fail(new NoPluginPrincipal())),
  /** The principal of a fiber that acts (a host mutation, a wake, an emit under a policy). */
  acting: checked(true)
}
export const PrincipalRefCodec = {
  encode: (r: PrincipalRef): string => ["p1", r.id, r.realm, r.version ?? "", r.digest ?? "", String(r.revision)].map((x, i) => i === 0 ? x : encodeURIComponent(x)).join(";"),
  decode: (s: string): Option.Option<PrincipalRef> => {
    const parts = typeof s === "string" ? s.split(";") : []
    if (parts.length !== 6 || parts[0] !== "p1") return Option.none()
    try {
      const [, id, realm, version, digest, rev] = parts.map((x) => decodeURIComponent(x))
      if (!id || !realm || !/^(0|[1-9]\d*)$/.test(rev!)) return Option.none()
      const out: PrincipalRef = { id, realm, ...(version ? { version } : {}), ...(digest ? { digest } : {}), revision: Number(rev) }
      return PrincipalRefCodec.encode(out) === s ? Option.some(out) : Option.none()
    } catch { return Option.none() }
  }
}

// ---------------------------------------------------------------- consumers and mandatory interceptions (BEH-BR-260–263)
export type Consumer = { readonly kind: "plugin"; readonly pluginId: string; readonly realm: string; readonly principal: PrincipalRef } | { readonly kind: "application"; readonly realm: string }
export interface MandatoryInterception<S = any> { readonly key: Context.Key<any, S>; readonly wrap: (service: S, consumer: Consumer) => S; readonly appliesTo?: "plugins" | "all" }
export interface RegisteredInterception<S = any> extends MandatoryInterception<S> { readonly id: string }
export class ChildNotAllowed extends Schema.TaggedError<ChildNotAllowed>()("ChildNotAllowed", { parentId: Schema.String, childId: Schema.String, reason: Schema.String }) {}
export class PolicyMismatch extends Schema.TaggedError<PolicyMismatch>()("PolicyMismatch", { id: Schema.String, realm: Schema.String, fields: Schema.Array(Schema.String) }) {}

// ---------------------------------------------------------------- AccessPolicy (BEH-BR-264, 268, 269)
export interface DeclaredAccess { readonly contributions: ReadonlyArray<{ readonly registry: string; readonly id: string }>; readonly events: ReadonlyArray<string> }
export type AccessRequest =
  | { readonly kind: "listen"; readonly principal?: PrincipalRef; readonly event: string; readonly style: "on" | "around" | "subscribe" | "delivery"; readonly origin?: string; readonly declared?: DeclaredAccess }
  | { readonly kind: "emit"; readonly principal?: PrincipalRef; readonly event: string; readonly mode: "emit" | "parallel" | "serial" | "waterfall" | "publish" }
  | { readonly kind: "contribute"; readonly principal?: PrincipalRef; readonly registry: string; readonly id: string; readonly declared?: DeclaredAccess }
  | { readonly kind: "child"; readonly principal: PrincipalRef; readonly childId: string; readonly definition: { readonly version?: string; readonly digest?: string } }
export type AccessDecision = "allow" | { readonly deny: string }
export interface AccessPolicyShape { readonly decide: (request: AccessRequest) => AccessDecision }
export class AccessPolicy extends Context.Service<AccessPolicy, AccessPolicyShape>()("@bridger/core/AccessPolicy") {}
export class AccessDenied extends Error { readonly _tag = "AccessDenied"; constructor(readonly kind: string, readonly subject: string, readonly reason: string) { super(`AccessDenied ${kind} ${subject}: ${reason}`) } }
export class AccessRefused extends Schema.TaggedError<AccessRefused>()("AccessRefused", { kind: Schema.String, subject: Schema.String, reason: Schema.String }) {}
/** A throwing `decide` denies with "policy-defect" (BEH-BR-264). */
export const decideSafely = (p: AccessPolicyShape, r: AccessRequest): AccessDecision => { try { return p.decide(r) } catch { return { deny: "policy-defect" } } }
/** The seam through which the host lends its wired policy to helpers running in plugin fibers (registries). */
export const PolicySeam = Context.Reference<Option.Option<{ readonly decide: (r: AccessRequest) => AccessDecision; readonly declaredFor: (p: PrincipalRef | undefined) => DeclaredAccess | undefined }>>("bridger/prototype/PolicySeam", { defaultValue: () => Option.none() })
export const declaredOnly = (inner: AccessPolicyShape, options: { readonly withoutManifest: "allow" | "deny" }): AccessPolicyShape => ({
  decide: (r) => {
    if (r.kind === "listen" || r.kind === "contribute") {
      if (!r.declared) { if (options.withoutManifest === "deny") return { deny: "undeclared: no manifest" } }
      else if (r.kind === "listen" ? !r.declared.events.includes(r.event) : !r.declared.contributions.some((c) => c.registry === r.registry && c.id === r.id)) return { deny: "undeclared" }
    }
    return decideSafely(inner, r)
  }
})
/** Companion buses consult the same wired policy (BEH-BR-269). */
export const ask = (request: { readonly kind: "listen"; readonly event: string; readonly style: "subscribe" | "delivery"; readonly origin?: string } | { readonly kind: "emit"; readonly event: string; readonly mode: "publish" }, options: { readonly principal?: PluginPrincipal } = {}): Effect.Effect<AccessDecision> => Effect.gen(function* () {
  const p = options.principal ? Option.some(options.principal) : yield* CurrentPlugin.get
  if (Option.isSome(p) && !minted.has(p.value)) return yield* Effect.die(new PrincipalForged(p.value.id))
  if (Option.isSome(p) && retired.has(p.value)) return { deny: "principal-retired" }
  const policy = yield* Effect.serviceOption(AccessPolicy)
  if (Option.isNone(policy)) return "allow"
  return decideSafely(policy.value, { ...request, ...(Option.isSome(p) ? { principal: refOf(p.value) } : {}) } as AccessRequest)
})
export const Access = { declaredOnly, ask }

// ---------------------------------------------------------------- CapabilityPolicy and grants (BEH-BR-273–275, 281)
export type Route = "required" | "optional" | "whenAvailable" | "use" | "useAll" | "lease"
export interface ResolutionRequest {
  readonly consumer: Consumer; readonly serviceId: string
  readonly provider: { readonly kind: "plugin"; readonly id: string; readonly realm: string; readonly version?: string; readonly digest?: string } | { readonly kind: "base" }
  readonly route: Route; readonly annotations: Bag
}
export interface Grant { readonly serviceId: string; readonly members: "all" | ReadonlyArray<string> }
export const Grant = {
  all: (key: Context.Key<any, any>): Grant => ({ serviceId: (key as unknown as { key: string }).key, members: "all" }),
  of: <S>(key: Context.Key<any, S>, options: { readonly methods: ReadonlyArray<keyof S & string> }): Grant => ({ serviceId: (key as unknown as { key: string }).key, members: options.methods })
}
export class ResolutionRefused extends Schema.TaggedError<ResolutionRefused>()("ResolutionRefused", { serviceId: Schema.String, consumer: Schema.String, reason: Schema.String }) {}
export class CapabilityDenied extends Error { readonly _tag = "CapabilityDenied"; constructor(readonly serviceId: string, readonly member: string, readonly consumer: string) { super(`CapabilityDenied ${serviceId}.${member}`) } }
export interface ResolveAgain { readonly consumers?: ReadonlyArray<string>; readonly serviceIds?: ReadonlyArray<string> }
export class CapabilityPolicy extends Context.Service<CapabilityPolicy, {
  readonly resolve: (request: ResolutionRequest) => Effect.Effect<Grant, ResolutionRefused>
  readonly changes?: Stream.Stream<ResolveAgain>
}>()("@bridger/core/CapabilityPolicy") {}
export const consumerLabel = (c: Consumer) => c.kind === "plugin" ? `plugin:${c.pluginId}@${c.realm}` : `application@${c.realm}`

// ---------------------------------------------------------------- CallLog (BEH-BR-276–280)
export interface CallCapture { readonly consumer: Consumer; readonly serviceId: string; readonly provider: ResolutionRequest["provider"]; readonly route: Route }
export interface CallEntry {
  readonly kind: "call" | "crossing" | "refusal" | "revocation" | "dispatch"
  readonly callId: string
  readonly consumer: { readonly kind: "plugin"; readonly principal: PrincipalRef } | { readonly kind: "application"; readonly realm: string } | { readonly kind: "remote"; readonly principal: string; readonly host?: string }
  readonly actor: { readonly id: string; readonly kind: string; readonly display?: string }
  readonly serviceId: string
  readonly provider?: ResolutionRequest["provider"]
  readonly member?: string
  readonly outcome: "success" | "failure" | "defect" | "interrupted" | "denied" | "refused"
  readonly errorTag?: string
  readonly startedAt: string
  readonly durationMs: number
  readonly correlationId?: string
  readonly annotations?: ReadonlyArray<{ readonly key: string; readonly value: unknown }>
  readonly refusal?: { readonly stage: "resolve" | "boundary"; readonly reason: string }
  readonly crossing?: { readonly direction: "outbound" | "inbound"; readonly link: string; readonly epoch?: string; readonly peer?: string }
  readonly revocation?: { readonly link: string; readonly epoch?: string; readonly reason: string }
  readonly dispatch?: { readonly command: string }
  readonly origin: "core" | { readonly companion: string }
}
export class CallLog extends Context.Service<CallLog, {
  readonly select: (capture: CallCapture) => boolean | "drop" | "refuse"
  readonly record: (entry: CallEntry) => Effect.Effect<void>
  readonly onFailure?: "drop" | "refuse"
  readonly queue?: number
}>()("@bridger/core/CallLog") {}
export class CallLogUnavailable extends Schema.TaggedError<CallLogUnavailable>()("CallLogUnavailable", { serviceId: Schema.String, member: Schema.optional(Schema.String), why: Schema.Literals(["queue-full", "record-failed", "record-timeout", "host-closing"]) }) {}
export class InvalidCallEntry extends Schema.TaggedError<InvalidCallEntry>()("InvalidCallEntry", { reason: Schema.String }) {}
export interface CallInfo { readonly callId: string; readonly consumer: CallEntry["consumer"]; readonly serviceId: string; readonly member: string; readonly grant: "all" | ReadonlyArray<string>; readonly [k: symbol]: true }
const CALL = Symbol.for("bridger/prototype/CallInfo")
const CallRef = Context.Reference<Option.Option<CallInfo>>("@bridger/core/CurrentCall", { defaultValue: () => Option.none() })
export const CurrentCall = {
  reference: CallRef,
  /** A provided CallInfo not made by core dies with PrincipalForged (check 73). */
  get: Effect.flatMap(Effect.gen(function* () { return yield* CallRef }), (o) => Option.isSome(o) && !o.value[CALL] ? Effect.die(new PrincipalForged("CurrentCall")) : Effect.succeed(o)),
  make: (c: Omit<CallInfo, symbol>): CallInfo => ({ ...c, [CALL]: true })
}

// ---------------------------------------------------------------- correlation and caller context (BEH-BR-187, 292)
const CorrRef = Context.Reference<Option.Option<string>>("@bridger/core/CurrentCorrelation", { defaultValue: () => Option.none() })
export const CurrentCorrelation = {
  reference: CorrRef,
  get: Effect.gen(function* () { return yield* CorrRef }),
  with: (id: string) => <A, E, R>(e: Effect.Effect<A, E, R>) => Effect.provideService(e, CorrRef, Option.some(id))
}
export interface CallerContextValue { readonly actor: Actor; readonly annotations: Bag; readonly correlationId?: string }
export const CallerContext = {
  current: Effect.gen(function* () {
    const actor = yield* CurrentActor, ann = yield* CurrentAnnotations, corr = yield* CorrRef
    return { actor, annotations: isBag(ann) ? ann : Annotations.empty, ...(Option.isSome(corr) ? { correlationId: corr.value } : {}) } as CallerContextValue
  }),
  serve: (ctx: CallerContextValue) => <X, E, R>(effect: Effect.Effect<X, E, R>): Effect.Effect<X, E, R> => Effect.gen(function* () {
    const mine = yield* CurrentAnnotations
    let e = effect.pipe(Effect.provideService(CurrentActor, ctx.actor), Effect.provideService(CurrentAnnotations, combineInto(isBag(mine) ? mine : Annotations.empty, ctx.annotations)))
    if (ctx.correlationId !== undefined) e = e.pipe(Effect.provideService(CorrRef, Option.some(ctx.correlationId)))
    return yield* e
  })
}
/** Combine every key of `b` into `a` under the key's combine rule (monotonic keys are never removed). */
const combineInto = (a: Bag, b: Bag): Bag => {
  let out = a
  for (const k of b.keys) { const entry = (b as unknown as { entries: Map<string, { key: any; value: unknown }> }).entries.get(k)!; out = Annotations.add(out, entry.key, entry.value) }
  return out
}

// ---------------------------------------------------------------- EntitlementView (BEH-BR-089)
export interface EntitlementState { readonly mode: "full" | "grace" | "read-only" | "none" | "unmetered" | "unknown"; readonly validUntil?: string; readonly graceUntil?: string; readonly reason?: string; readonly asOf: string; readonly stale?: true }
export class EntitlementView extends Context.Service<EntitlementView, { readonly watch: (target: { readonly id: string; readonly realm: string; readonly version?: string }) => Stream.Stream<EntitlementState> }>()("@bridger/core/EntitlementView") {}
void Actor
