// The federation sync path (federation 01, 02): verify a received envelope as received bytes, then the sync loop with a
// shared attempt, lastContact, and jittered back-off. Source, signature policy and applying are injected.
import { Clock, Deferred, Effect, Random } from "effect"
import { ManifestStore, type Acceptance } from "./federation.js"

export interface Envelope { readonly statementType: string; readonly id: string; readonly version: string; readonly payload: string; readonly signatures: ReadonlyArray<unknown> }
export interface SignaturePolicy { readonly verify: (r: { readonly subject: { readonly bytes: string }; readonly id: string; readonly version: string; readonly signatures: ReadonlyArray<unknown>; readonly reverify?: { readonly acceptedAt: number } }) => Effect.Effect<void, unknown> }
export interface ManifestBody { readonly authority: string; readonly host: string; readonly revision: number; readonly [k: string]: unknown }
export type Rejection = { readonly _tag: "ManifestRejected"; readonly reason: "signature" | "statement-type" | "wrong-host" | "stale-revision" | "revision-reused" }

export class SignaturePolicyMissing { readonly _tag = "SignaturePolicyMissing" }
/** There is no default policy, permissive or otherwise. */
export const requirePolicy = (p: SignaturePolicy | undefined): Effect.Effect<SignaturePolicy, SignaturePolicyMissing> => p ? Effect.succeed(p) : Effect.fail(new SignaturePolicyMissing())

/**
 * BEH-FD-002: refuse a foreign statement type before verifying; pass the received envelope unchanged to the policy; decode only after
 * it accepted; then bind the decoded body to the signed id and version. Any refusal, failure or defect of the policy is a signature rejection.
 * shortcut: JSON.stringify of [authority, host] stands for the JCS of two strings; it differs only for strings JCS escapes differently.
 */
export const verifyManifest = (policy: SignaturePolicy, env: Envelope, reverify?: { readonly acceptedAt: number }): Effect.Effect<ManifestBody, Rejection> => Effect.gen(function* () {
  const reject = (reason: Rejection["reason"]): Rejection => ({ _tag: "ManifestRejected", reason })
  if (env.statementType !== "host-manifest") return yield* Effect.fail(reject("statement-type"))
  yield* policy.verify({ subject: { bytes: env.payload }, id: env.id, version: env.version, signatures: env.signatures, ...(reverify ? { reverify } : {}) }).pipe(
    Effect.catchCause(() => Effect.fail(reject("signature"))))
  const body = yield* Effect.try({ try: () => JSON.parse(env.payload) as ManifestBody, catch: () => reject("signature") })
  if (JSON.stringify([body.authority, body.host]) !== env.id || String(body.revision) !== env.version) return yield* Effect.fail(reject("signature"))
  return body
})

export type SyncAnswer = { readonly kind: "manifest"; readonly envelope: Envelope } | { readonly kind: "none" } | { readonly kind: "resync" }
export type SyncOutcome = { readonly applied: number } | { readonly unchanged: true } | Rejection | { readonly _tag: "ManifestUnavailable" } | { readonly _tag: "ResyncRequired" }

export interface SyncOptions {
  readonly host: string; readonly authority: string
  readonly source: (req: { readonly host: string; readonly known: number }) => Effect.Effect<SyncAnswer, unknown>
  readonly policy: SignaturePolicy; readonly store: ManifestStore
  readonly syncEvery: number; readonly syncTimeout: number
  readonly apply: (m: ManifestBody, envelope: Envelope, acceptedAt: number) => Effect.Effect<void>
  readonly now?: Effect.Effect<number>; readonly onResync?: Effect.Effect<void>; readonly rebootstrapPending?: () => boolean
}
/** The sync attempt. Two concurrent `sync` calls share one attempt; the interval backs off on consecutive failures and resets on success. */
export const makeSync = (o: SyncOptions) => Effect.gen(function* () {
  const now = o.now ?? Clock.currentTimeMillis                          // the host's Clock; a test supplies its own
  let lastContact: number | undefined
  let inFlight: Deferred.Deferred<SyncOutcome> | undefined
  let failures = 0
  const attempt: Effect.Effect<SyncOutcome> = Effect.gen(function* () {
    const known = o.store.current(o.authority, o.host)?.revision ?? 0
    const answer = yield* o.source({ host: o.host, known }).pipe(Effect.timeout(o.syncTimeout), Effect.map((a) => ({ a })), Effect.catchCause(() => Effect.succeed({ a: undefined })))    // a failed, timed-out or dying source is ManifestUnavailable
    if (!answer.a) { failures++; return { _tag: "ManifestUnavailable" } as const }       // lastContact is not updated
    failures = 0; lastContact = yield* now                          // any successful answer is contact
    const a = answer.a
    if (a.kind === "none") return { unchanged: true } as const
    if (a.kind === "resync") { if (!o.rebootstrapPending?.() && o.onResync) yield* o.onResync; return { _tag: "ResyncRequired" } as const }
    const verified = yield* Effect.exit(verifyManifest(o.policy, a.envelope))
    if (verified._tag === "Failure") return { _tag: "ManifestRejected", reason: "signature" } as const
    const m = verified.value
    if (m.authority !== o.authority || m.host !== o.host) return { _tag: "ManifestRejected", reason: "wrong-host" } as const
    const acc: Acceptance = o.store.accept({ authority: m.authority, host: m.host, revision: m.revision, digest: a.envelope.payload, acceptedAt: yield* now })
    if (acc.outcome === "stale") return { _tag: "ManifestRejected", reason: "stale-revision" } as const
    if (acc.outcome === "revision-reused") return { _tag: "ManifestRejected", reason: "revision-reused" } as const
    if (acc.outcome === "unchanged") return { unchanged: true } as const
    yield* o.apply(m, a.envelope, yield* now)                                                                   // stored as highest before it is applied
    return { applied: m.revision } as const
  })
  const sync: Effect.Effect<SyncOutcome> = Effect.gen(function* () {
    if (inFlight) return yield* Deferred.await(inFlight)
    const d = yield* Deferred.make<SyncOutcome>(); inFlight = d
    const out = yield* attempt.pipe(Effect.ensuring(Effect.sync(() => { inFlight = undefined })))
    yield* Deferred.succeed(d, out)
    return out
  })
  /** syncEvery, doubling per consecutive failure up to ten times, plus jitter in [0, interval/10) from `Random`. */
  const nextInterval = Effect.gen(function* () { const base = Math.min(o.syncEvery * 2 ** failures, o.syncEvery * 10); return base + Math.floor((yield* Random.next) * base / 10) })
  return { sync, nextInterval, lastContact: () => lastContact }
})
