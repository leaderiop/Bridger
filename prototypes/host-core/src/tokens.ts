// Per-call capability tokens and callback admission (remote 06, BEH-RM-044). The remote package chooses no signature scheme: a
// consumer that needs one provides a `TokenAuthority`; `inProcess` is a host-side table, valid only while the call runs.
import { Effect } from "effect"

export interface TokenClaims {
  readonly tokenId: string; readonly pluginId: string; readonly realm: string; readonly epoch: string; readonly callId: string
  readonly contractVersion: string; readonly issuedAt: number; readonly expires: number
  readonly actor?: unknown; readonly onBehalfOf?: unknown; readonly annotations?: unknown; readonly correlationId?: string; readonly digest?: string
}
export type TokenRef = string
export class TokenInvalid { readonly _tag = "TokenInvalid" }
export class TokenExpired { readonly _tag = "TokenExpired" }

export interface TokenAuthority {
  readonly mint: (claims: Omit<TokenClaims, "tokenId">) => Effect.Effect<TokenRef>
  readonly check: (ref: TokenRef) => Effect.Effect<TokenClaims, TokenInvalid>
  /** The call ended (result, failure, timeout, cancellation or session loss): every later check fails. */
  readonly end: (ref: TokenRef) => Effect.Effect<void>
}

export const inProcess = (nextId: () => string): TokenAuthority => {
  const table = new Map<string, TokenClaims>()
  return {
    mint: (c) => Effect.sync(() => { const id = nextId(); table.set(id, { ...c, tokenId: id }); return id }),
    check: (ref) => Effect.suspend(() => { const c = table.get(ref); return c ? Effect.succeed(c) : Effect.fail(new TokenInvalid()) }),
    end: (ref) => Effect.sync(() => { table.delete(ref) })
  }
}

export interface Revocations { readonly pluginIds: ReadonlySet<string>; readonly digests: ReadonlySet<string> }
export type Refusal = { readonly reason: "stale-epoch" | "denied"; readonly tag: "StaleEpoch" | "RemoteRevoked" | "TokenInvalid" | "TokenExpired" | "CallbackLimit" }

/** A token checks only when the authority returns its claims, the host clock reads before `expires`, the epoch is the open session's, the call is in flight and nothing revokes it. A failing or dying authority refuses. */
export const checkToken = (authority: TokenAuthority, ref: TokenRef, now: Effect.Effect<number>, session: { readonly maxLifetime?: number; readonly epoch: string; readonly inFlight: (callId: string) => boolean; readonly revoked: Revocations }) =>
  authority.check(ref).pipe(
    Effect.catchCause(() => Effect.fail(new TokenInvalid())),                      // a defect or failure in the authority is a refusal, never an allowance
    Effect.flatMap((c) => Effect.gen(function* () {
      if ((yield* now) >= c.expires) return yield* Effect.fail(new TokenExpired())
      // The checker holds the bound itself, so a custom authority cannot mint a token that outlives `tokenTtl` (BEH-RM-043; improvement report 06, S10).
      if (session.maxLifetime !== undefined && !(c.expires - c.issuedAt <= session.maxLifetime)) return yield* Effect.fail(new TokenInvalid())
      if (c.epoch !== session.epoch || !session.inFlight(c.callId)) return yield* Effect.fail(new TokenInvalid())
      if (session.revoked.pluginIds.has(c.pluginId) || (c.digest !== undefined && session.revoked.digests.has(c.digest))) return yield* Effect.fail(new TokenInvalid())
      return c
    })))

export interface CallbackFrame { readonly epoch: string; readonly callId: string; readonly parent: string; readonly token: TokenRef }
/** Steps 1 to 4 of BEH-RM-044/046, stopping at the first refusal; nothing is leased and no host code runs. */
export const admitCallback = (authority: TokenAuthority, f: CallbackFrame, st: { readonly maxCallbacks?: number; readonly maxLifetime?: number; readonly epoch: string; readonly revoked: boolean; readonly now: Effect.Effect<number>; readonly inFlight: (id: string) => boolean; readonly seen: Set<string>; readonly rev: Revocations }): Effect.Effect<{ readonly admitted: TokenClaims } | { readonly refused: Refusal } | { readonly duplicate: true }> => Effect.gen(function* () {
  if (f.epoch !== st.epoch) return { refused: { reason: "stale-epoch", tag: "StaleEpoch" } as const }
  if (st.revoked) return { refused: { reason: "denied", tag: "RemoteRevoked" } as const }
  const checked = yield* checkToken(authority, f.token, st.now, { ...(st.maxLifetime !== undefined ? { maxLifetime: st.maxLifetime } : {}), epoch: st.epoch, inFlight: st.inFlight, revoked: st.rev }).pipe(
    Effect.map((claims) => ({ claims })), Effect.catch((e) => Effect.succeed({ err: e._tag as "TokenInvalid" | "TokenExpired" })))
  if ("err" in checked) return { refused: { reason: "denied", tag: checked.err } as const }
  if (checked.claims.callId !== f.parent) return { refused: { reason: "denied", tag: "TokenInvalid" } as const }
  const key = `${f.parent}/${f.callId}`
  if (st.seen.has(key)) return { duplicate: true as const }
  if (st.maxCallbacks !== undefined && [...st.seen].filter((k) => k.startsWith(`${f.parent}/`)).length >= st.maxCallbacks) return { refused: { reason: "denied", tag: "CallbackLimit" } as const }   // BEH-RM-044: bounded per parent call
  st.seen.add(key)
  return { admitted: checked.claims }
})
