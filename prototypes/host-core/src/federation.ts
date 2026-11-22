// The federation plugin's pure rules (federation 01, 03, 04): the manifest store (BEH-FD-004), kill entries (BEH-FD-007),
// fences (BEH-FD-028, 029, 030) and peer realms (BEH-FD-022). No I/O: the host, the loader and the transport are injected.
import { Effect } from "effect"

// ---------------------------------------------------------------- BEH-FD-004: revisions are monotonic
export interface VerifiedManifest { readonly authority: string; readonly host: string; readonly revision: number; readonly digest: string; readonly acceptedAt: number }
export type Acceptance =
  | { readonly outcome: "accepted"; readonly previous?: number }
  | { readonly outcome: "unchanged" }                        // the same revision with the same content: applying it again is idempotent
  | { readonly outcome: "stale"; readonly highest: number }  // a lower revision is never applied: rolling back means a new, higher revision
  | { readonly outcome: "revision-reused"; readonly revision: number }   // same revision, different content: the authority signed twice for one slot

/** Keeps the highest verified revision per (authority, host); the highest is stored before it is applied, so a crash re-applies it. */
export class ManifestStore {
  private readonly highest = new Map<string, VerifiedManifest>()
  readonly events: Array<{ readonly _tag: "manifest-equivocation"; readonly revision: number }> = []
  accept(m: VerifiedManifest): Acceptance {
    const key = `${m.authority}\0${m.host}`, cur = this.highest.get(key)
    if (!cur || m.revision > cur.revision) { this.highest.set(key, m); return { outcome: "accepted", ...(cur ? { previous: cur.revision } : {}) } }
    if (m.revision < cur.revision) return { outcome: "stale", highest: cur.revision }
    if (m.digest === cur.digest) return { outcome: "unchanged" }
    this.events.push({ _tag: "manifest-equivocation", revision: m.revision })      // reported; what the host runs does not change
    return { outcome: "revision-reused", revision: m.revision }
  }
  current(authority: string, host: string): VerifiedManifest | undefined { return this.highest.get(`${authority}\0${host}`) }
}

// ---------------------------------------------------------------- BEH-FD-007: kill entries
export interface KillEntry { readonly digest?: string; readonly id?: string; readonly realm?: string }
export interface Listed { readonly id: string; readonly realm?: string; readonly digest?: string }
export type KillEvent = { readonly _tag: "kill-unowned"; readonly id: string; readonly realm: string; readonly reason: string }
/**
 * Removes every entry a kill matches, by digest or by (id, realm ?? "default"). Applied last and not overridable. A kill that matches
 * a plugin installed outside the federation scope causes no operation on it and is reported `kill-unowned`.
 */
export const applyKills = <T extends Listed>(desired: ReadonlyArray<T>, kills: ReadonlyArray<KillEntry>, installedOutside: ReadonlyArray<Listed> = []): { readonly desired: ReadonlyArray<T>; readonly events: ReadonlyArray<KillEvent> } => {
  const hits = (k: KillEntry, x: Listed) => (k.digest !== undefined && k.digest === x.digest) || (k.id !== undefined && k.id === x.id && (k.realm ?? "default") === (x.realm ?? "default"))
  const events: KillEvent[] = []
  for (const x of installedOutside) { const k = kills.find((k) => hits(k, x)); if (k) events.push({ _tag: "kill-unowned", id: x.id, realm: x.realm ?? "default", reason: "installed outside the federation scope" }) }
  return { desired: desired.filter((x) => !kills.some((k) => hits(k, x))), events }
}
/** A killed digest is neither imported nor exported (BEH-FD-027). */
export const isKilledDigest = (kills: ReadonlyArray<KillEntry>, digest: string | undefined): boolean => digest !== undefined && kills.some((k) => k.digest === digest)

// ---------------------------------------------------------------- BEH-FD-028..030: fences
export interface Fence { readonly scope: string; readonly token: number; readonly owner: string }
export type OfferVerdict =
  | { readonly outcome: "accepted"; readonly close: ReadonlyArray<string> }                 // endpoints whose agreed fence is now lower: close them, drop their frames
  | { readonly outcome: "StaleExport"; readonly key: string; readonly fence: number; readonly highest: number }
  | { readonly outcome: "ExportConflict"; readonly key: string; readonly owners: ReadonlyArray<string> }
  | { readonly outcome: "PeerMismatch"; readonly key: string; readonly offered: string; readonly authenticated: string }   // the offer names a host the transport did not authenticate
  | { readonly outcome: "advisory"; readonly key: string; readonly reason: "unauthenticated" | "out-of-window" | "not-owner" }          // checked for staleness, never stored, never closes a link

/** Per importer: the highest token seen per (key, scope), never lowered; the authority is the only source of a token. */
export class FenceTable {
  private readonly highest = new Map<string, Fence>()
  private readonly agreed = new Map<string, { readonly key: string; readonly scope: string; readonly token: number }>()    // endpoint -> the fence it was agreed under
  private readonly conflicts = new Map<string, Set<string>>()
  private k = (key: string, scope: string) => `${key}\0${scope}`
  /** An offer, or a manifest's import entry (`endpoint` omitted), names a fence for `key`. */
  see(key: string, f: Fence, endpoint?: string): OfferVerdict {
    const k = this.k(key, f.scope), cur = this.highest.get(k)
    if (cur && f.token < cur.token) return { outcome: "StaleExport", key, fence: f.token, highest: cur.token }
    if (cur && f.token === cur.token && f.owner !== cur.owner) {
      const owners = this.conflicts.get(k) ?? new Set([cur.owner]); owners.add(f.owner); this.conflicts.set(k, owners)
      return { outcome: "ExportConflict", key, owners: [...owners].sort() }
    }
    const close: string[] = []
    if (!cur || f.token > cur.token) {
      this.conflicts.delete(k)                                   // a higher token ends a conflict
      for (const [ep, a] of this.agreed) if (a.key === key && a.scope === f.scope && a.token < f.token) { close.push(ep); this.agreed.delete(ep) }
      this.highest.set(k, f)
    }
    if (endpoint !== undefined) this.agreed.set(endpoint, { key, scope: f.scope, token: f.token })
    return { outcome: "accepted", close }
  }
  /**
   * An offer on a link (BEH-FD-029, improvement report 06 S12). The transport is the only authenticator (BEH-FD-023): when it names the peer, the offer must
   * come from that host; a higher token is stored (and may close other links) only from an authenticated host and only within `maxJump` of the highest known,
   * so an unauthenticated or hostile offer cannot raise the stored highest. Anything else is advisory: it is refused when stale and otherwise changes nothing.
   */
  offer(key: string, f: Fence, endpoint: string, link: { readonly host: string; readonly authenticatedPeer?: string; readonly maxJump: number }): OfferVerdict {
    if (link.authenticatedPeer !== undefined && link.authenticatedPeer !== link.host) return { outcome: "PeerMismatch", key, offered: link.host, authenticated: link.authenticatedPeer }
    const cur = this.highest.get(this.k(key, f.scope))
    const stale = cur && f.token < cur.token
    if (stale) return this.see(key, f, endpoint)                                       // a stale offer is refused whoever sends it
    if (link.authenticatedPeer === undefined) return { outcome: "advisory", key, reason: "unauthenticated" }
    if (f.owner !== link.authenticatedPeer || (cur && f.owner !== cur.owner)) return { outcome: "advisory", key, reason: "not-owner" }   // a peer raises the fence only for itself, and an owner change comes from the signed manifest, never an offer
    if (cur && f.token > cur.token + link.maxJump) return { outcome: "advisory", key, reason: "out-of-window" }
    return this.see(key, f, endpoint)
  }
  conflictOf(key: string, scope: string): ReadonlyArray<string> | undefined { const c = this.conflicts.get(this.k(key, scope)); return c && [...c].sort() }
  /** A frame on an endpoint is delivered only while its agreed fence is still the highest. */
  deliverable(endpoint: string): boolean {
    const a = this.agreed.get(endpoint); if (!a) return false
    const cur = this.highest.get(this.k(a.key, a.scope)); return !!cur && cur.token === a.token && !this.conflicts.has(this.k(a.key, a.scope))
  }
}
/** An export carrying a fence is served only by the host the fence names (BEH-FD-028). */
export const mayServe = (fence: Fence | undefined, hostId: string): { readonly serve: true } | { readonly serve: false; readonly report: "fence-not-owner" } =>
  !fence || fence.owner === hostId ? { serve: true } : { serve: false, report: "fence-not-owner" }

// ---------------------------------------------------------------- BEH-FD-022: peer realms
export const peerRealmId = (peer: string, key: string, major: number): string => `peer:${peer}:${key}@${major}`

interface RealmHost {
  readonly defineRealm: (id: string, o: { readonly isolate: ReadonlyArray<never> }, opts?: never) => Effect.Effect<unknown, { readonly _tag: string }>
  readonly retireRealm: (id: string, opts?: never) => Effect.Effect<unknown, { readonly _tag: string }>
}
/** Ensures the realm of one import exists before the apply that installs it. `isolate` is exactly that contract's key. */
export const ensurePeerRealm = (host: RealmHost, peer: string, key: string, major: number, isolate: ReadonlyArray<never>) =>
  host.defineRealm(peerRealmId(peer, key, major), { isolate }).pipe(Effect.catch((e) => e._tag === "DuplicateRealm" ? Effect.void : Effect.fail(e)))
/** After the reconcile removed the import: retire its realm; a `RealmInUse` is reported and the realm stays, to be retried at the next apply. */
export const retirePeerRealm = (host: RealmHost, peer: string, key: string, major: number) =>
  host.retireRealm(peerRealmId(peer, key, major)).pipe(Effect.as("retired" as "retired" | "realm-in-use" | "unknown-realm"), Effect.catch((e) => Effect.succeed(e._tag === "RealmInUse" ? "realm-in-use" as const : "unknown-realm" as const)))

// ---------------------------------------------------------------- BEH-FD-012, 013, 016: freshness, the offline cap, a clock that went backwards
export type StaleReason = "expired" | "offline-capped" | "clock-skew"
export interface FreshnessInput {
  readonly now: number                                  // the host's Clock; never a peer's
  readonly issuedAt: number; readonly validUntil?: number
  readonly lastContact?: number; readonly firstActivation: number
  readonly maxOffline: number | "forever"; readonly skewTolerance: number
}
export const DEFAULT_MAX_OFFLINE = 72 * 3_600_000
/** `fresh` while the clock reads before `validUntil`, the offline cap is not exceeded and the clock has not gone backwards past the tolerance. */
export const freshness = (i: FreshnessInput): { readonly fresh: boolean; readonly reasons: ReadonlyArray<StaleReason> } => {
  const reasons: StaleReason[] = []
  if (i.validUntil !== undefined && i.now >= i.validUntil) reasons.push("expired")
  if (i.maxOffline !== "forever" && i.now - (i.lastContact ?? i.firstActivation) > i.maxOffline) reasons.push("offline-capped")
  if (i.now < i.issuedAt - i.skewTolerance || (i.lastContact !== undefined && i.now < i.lastContact - i.skewTolerance)) reasons.push("clock-skew")
  return { fresh: reasons.length === 0, reasons }
}
/** The first activation time is stored once and never overwritten, so restarting a host that never reached the authority does not restart the cap. */
export const firstActivationOf = (stored: number | undefined, now: number): number => stored ?? now

export interface FreshnessEntry { readonly id: string; readonly requiresFresh?: boolean; readonly disabled?: boolean }
/** A stale host disables exactly the entries marked `requiresFresh`; it removes, replaces and reconfigures nothing, and touches no other entry. */
export const applyFreshness = <T extends FreshnessEntry>(desired: ReadonlyArray<T>, fresh: boolean): ReadonlyArray<T> =>
  fresh ? desired : desired.map((e) => e.requiresFresh ? { ...e, disabled: true } : e)

/** Contact after the cap was exceeded needs a re-bootstrap before any newer manifest, unless the source says the host is current. */
export const needsRebootstrap = (capWasExceeded: boolean, known: number, latest: number, resyncRequired: boolean): boolean =>
  capWasExceeded && (known !== latest || resyncRequired)

// ---------------------------------------------------------------- BEH-FD-043: revocation lists are relayed on links
/** Each list crosses each link at most once per revision; only an accepted list is relayed, never to the link it came from. */
export class RevocationRelay {
  private newest = 0
  private newestList: unknown
  private readonly sent = new Set<string>()
  /** A list was accepted (offer answered Accepted, or changes yielded it): the links to send it on. */
  accepted(revision: number, list: unknown, from: string | undefined, linksUp: ReadonlyArray<string>): ReadonlyArray<string> {
    if (revision <= this.newest) return []                                   // a stale or repeated list is not relayed
    this.newest = revision; this.newestList = list
    const to = linksUp.filter((l) => l !== from && !this.sent.has(`${l}\0${revision}`))
    for (const l of to) this.sent.add(`${l}\0${revision}`)
    return to
  }
  /** A new link: the newest accepted list is its first control frame, before the offer. */
  onLinkUp(link: string): { readonly revision: number; readonly list: unknown } | undefined {
    if (this.newest === 0 || this.sent.has(`${link}\0${this.newest}`)) return undefined
    this.sent.add(`${link}\0${this.newest}`); return { revision: this.newest, list: this.newestList }
  }
}

// ---------------------------------------------------------------- BEH-FD-045: residency on a route
export type Placement = (required: ReadonlyArray<string>, offered: ReadonlyArray<string>) => boolean
/** PlacementPolicy.exact: every required label must be offered by the route. */
export const exactPlacement: Placement = (required, offered) => required.every((l) => offered.includes(l))
export interface ManifestPeerResidency { readonly residency?: ReadonlyArray<string> }
export type ImportVerdict = { readonly keep: true; readonly offered: ReadonlyArray<string> } | { readonly keep: false; readonly reason: "peer-residency-missing" | "placement-refused" }
/** An import with a `residency` needs its peer to declare one; the route's offered labels are the peer's (never the dialler's profile). */
export const checkImportResidency = (required: ReadonlyArray<string> | undefined, peer: ManifestPeerResidency | undefined, policy: Placement = exactPlacement): ImportVerdict => {
  if (!required || required.length === 0) return { keep: true, offered: peer?.residency ?? [] }
  if (!peer?.residency) return { keep: false, reason: "peer-residency-missing" }
  return policy(required, peer.residency) ? { keep: true, offered: peer.residency } : { keep: false, reason: "placement-refused" }
}
/** An export's offered labels: the peer's residency, else the profile's the dialler or listener yielded, else none. */
export const exportOffered = (peer: ManifestPeerResidency | undefined, profile: ManifestPeerResidency | undefined): ReadonlyArray<string> => peer?.residency ?? profile?.residency ?? []
