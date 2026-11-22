// A federation link coming up (federation 03, 06): the newest revocation list first, then the offer; each import of the manifest is
// installed only when the peer's offer accepted it, with the fence the manifest names. Peers are dialled from their manifest addresses.
import { Effect } from "effect"
import type { Contract } from "./contract.js"
import { type FenceTable, type Fence, type KillEntry, RevocationRelay } from "./federation.js"
import { dialSocket } from "./net.js"
import { type FederatedHost, importFrom, type ImportOutcome } from "./testfederation.js"
import { offerExchange, type Connection, type LinkAgreement, type PeerOffer } from "./wire.js"

export interface ManifestImportEntry { readonly key: string; readonly major: number; readonly fence?: Fence; readonly residency?: ReadonlyArray<string>; readonly digest?: string; readonly contract: Contract<any, any>; readonly accepts: string }
export interface LinkResult {
  readonly agreement: LinkAgreement
  readonly imports: ReadonlyArray<{ readonly key: string; readonly outcome: ImportOutcome | { readonly refused: "offer"; readonly detail: unknown } }>
  readonly received: ReadonlyArray<{ readonly revision: number; readonly list: unknown }>
}
/**
 * One end of a link-up. Sends the newest accepted revocation list as the first control frame (if any), exchanges offers, records the
 * lists received before the offer's answer, then installs only the imports the offer accepted.
 */
export const linkUp = (host: FederatedHost, o: {
  readonly conn: Connection; readonly mine: PeerOffer; readonly peer: { readonly host: string; readonly authority: string; readonly residency?: ReadonlyArray<string> }
  readonly relay: RevocationRelay; readonly linkId: string; readonly fences: FenceTable; readonly kills: ReadonlyArray<KillEntry>
  readonly imports: ReadonlyArray<ManifestImportEntry>; readonly dial: (e: ManifestImportEntry) => Effect.Effect<Connection>; readonly attribution: unknown
  readonly onKill?: (k: { revision: number; list: unknown }) => Effect.Effect<void>
}): Effect.Effect<LinkResult, unknown> => Effect.gen(function* () {
  const first = o.relay.onLinkUp(o.linkId)
  if (first) yield* o.conn.send(JSON.stringify({ t: "kill", revision: first.revision, list: first.list }))
  const received: Array<{ revision: number; list: unknown }> = []
  const agreement = yield* offerExchange(o.conn, o.mine, o.peer, { onKill: (k) => Effect.suspend(() => { received.push(k); return o.onKill?.(k) ?? Effect.void }) })
  if (!("verdicts" in agreement)) return { agreement, imports: [], received }
  const out: Array<{ key: string; outcome: LinkResult["imports"][number]["outcome"] }> = []
  for (const e of o.imports) {
    const v = agreement.verdicts.find((x) => x.key === e.key)
    if (!v || !("accepted" in v) || !v.accepted) { out.push({ key: e.key, outcome: { refused: "offer", detail: v } }); continue }
    out.push({ key: e.key, outcome: yield* importFrom(host, o.fences, o.kills, { peer: o.peer.host, key: e.key, major: e.major, digest: e.digest, fence: e.fence, residency: e.residency, peerResidency: o.peer.residency }, { contract: e.contract, accepts: e.accepts, dial: o.dial(e), attribution: o.attribution }) })
  }
  return { agreement, imports: out, received }
})

/** `host:port` → a connection over loopback or the network; `tls` options turn it into TLS. The address is the manifest peer's, never parsed for meaning elsewhere. */
export const dialAddress = (address: string, tls?: Parameters<typeof dialSocket>[1]): Effect.Effect<Connection> => {
  const i = address.lastIndexOf(":"); const port = Number(address.slice(i + 1))
  return dialSocket(port, tls, address.slice(0, i) || "127.0.0.1").pipe(Effect.orDie)
}
