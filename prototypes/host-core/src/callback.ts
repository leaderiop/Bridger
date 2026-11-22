// Host-side handling of a guest's `callback` frame (remote 06, BEH-RM-046): the checks in order, stopping at the first refusal;
// nothing is leased and no host code runs before step 8. Policy is consulted only through `use` (step 8), never here.
import { Effect } from "effect"
import { admitCallback, type CallbackFrame, type Revocations, type TokenAuthority, type TokenClaims } from "./tokens.js"
import { exactPlacement, type Placement } from "./federation.js"

export interface CallbackRequest extends CallbackFrame { readonly contract: string; readonly method: string; readonly payload: unknown }
export type CallbackExit =
  | { readonly ok: unknown }
  | { readonly refused: { readonly reason: "stale-epoch" | "denied" | "placement-refused" | "budget-exceeded"; readonly tag: string } }
  | { readonly duplicate: true }
  | { readonly failed: { readonly _tag: string } }

export interface CallbackContext {
  readonly epoch: string; readonly revoked: boolean; readonly rev: Revocations; readonly now: Effect.Effect<number>
  /** The link's `tokenTtl`: a token whose lifetime exceeds it is refused whatever the authority minted (BEH-RM-043). */
  readonly tokenTtl?: number
  /** BEH-RM-044: the most callbacks admitted per parent call; refused `CallbackLimit` beyond it. */
  readonly maxCallbacks?: number
  readonly inFlight: (callId: string) => boolean; readonly seen: Set<string>; readonly authority: TokenAuthority
  readonly offeredLabels: ReadonlyArray<string>; readonly placement?: Placement
  readonly budget?: (claims: TokenClaims) => Effect.Effect<boolean>
  readonly grants: ReadonlyArray<{ readonly contract: string; readonly methods: ReadonlyArray<string>; readonly local?: boolean }>
  readonly admission?: (r: { readonly claims: TokenClaims; readonly contract: string; readonly method: string }) => Effect.Effect<void, { readonly _tag: "CallbackDenied"; readonly reason: string }>
  readonly decode: (contract: string, method: string, payload: unknown) => Effect.Effect<unknown, unknown>
  /** Step 8: `Host.use` in the link's realm; the caller bounds it by the remaining deadline of the call it serves. */
  readonly run: (claims: TokenClaims, contract: string, method: string, payload: unknown) => Effect.Effect<unknown, { readonly _tag: string }>
}
const denied = (tag: string) => ({ refused: { reason: "denied", tag } }) as const

export const handleCallback = (c: CallbackContext, f: CallbackRequest): Effect.Effect<CallbackExit> => Effect.gen(function* () {
  const a = yield* admitCallback(c.authority, f, { ...(c.tokenTtl !== undefined ? { maxLifetime: c.tokenTtl } : {}), ...(c.maxCallbacks !== undefined ? { maxCallbacks: c.maxCallbacks } : {}), epoch: c.epoch, revoked: c.revoked, now: c.now, inFlight: c.inFlight, seen: c.seen, rev: c.rev })   // steps 1 to 4
  if ("refused" in a) return a
  if ("duplicate" in a) return a
  const claims = a.admitted
  // 4a: a residency label in the token's annotations must be offered by the link's transport
  const labels = ((claims.annotations as { residency?: ReadonlyArray<string> } | undefined)?.residency) ?? []
  if (labels.length && !(c.placement ?? exactPlacement)(labels, c.offeredLabels)) return { refused: { reason: "placement-refused", tag: "PlacementRefused" } } as const
  // 4b: the principal budget, when one is provided
  if (c.budget && !(yield* c.budget(claims))) return { refused: { reason: "budget-exceeded", tag: "RemoteBudgetExceeded" } } as const
  // 5: covered by the grants, and not a local contract
  const grant = c.grants.find((g) => g.contract === f.contract && g.methods.includes(f.method))
  if (!grant) return denied("CallbackDenied")
  if (grant.local) return denied("CallbackDenied")
  // 6: the optional admission
  if (c.admission) { const ad = yield* c.admission({ claims, contract: f.contract, method: f.method }).pipe(Effect.map(() => true), Effect.catch(() => Effect.succeed(false))); if (!ad) return denied("CallbackDenied") }
  // 7: the payload decodes with the granted contract's codec
  const decoded = yield* c.decode(f.contract, f.method, f.payload).pipe(Effect.map((value) => ({ value })), Effect.catch(() => Effect.succeed(undefined)))
  if (!decoded) return { failed: { _tag: "WireDecodeError" } } as const
  // 8: reach the service; a ResolutionRefused is a Refused exit, anything else a failure of the callback
  return yield* c.run(claims, f.contract, f.method, decoded.value).pipe(
    Effect.map((ok) => ({ ok }) as CallbackExit),
    Effect.catch((e) => Effect.succeed(e._tag === "ResolutionRefused" ? denied("ResolutionRefused") : { failed: { _tag: e._tag } } as CallbackExit)))
})
