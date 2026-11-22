// A manifest authority served over a socket (federation 02 BEH-FD-011, 014): `latest` and `snapshot` as request/response frames, and the
// client side that fits `SyncOptions.source` and `Rebootstrap.fetch`. One connection per request; signing is the consumer's (`SignaturePolicy`).
import { Effect } from "effect"
import { dialAddress } from "./links.js"
import { listen, type Listener } from "./net.js"
import type { Envelope, SyncAnswer } from "./sync.js"
import type { Connection } from "./wire.js"

export interface AuthorityData {
  /** The newest signed manifest envelope for `host`, with its revision; undefined: the host has none. */
  readonly latest: (host: string) => { readonly revision: number; readonly envelope: Envelope } | undefined
  readonly snapshot: (host: string, since: string) => { readonly revision: number; readonly snapshot: unknown } | undefined
  /** `known` older than this revision per host cannot be brought up by manifests alone: the host must re-bootstrap. */
  readonly resyncBelow?: (host: string) => number
}
const parse = (s: string): Record<string, unknown> | undefined => { try { const v = JSON.parse(s); return typeof v === "object" && v ? v : undefined } catch { return undefined } }

export const serveAuthority = (data: AuthorityData, tls?: Parameters<typeof listen>[1]): Effect.Effect<Listener> =>
  listen((c: Connection) => Effect.gen(function* () {
    const f = parse(yield* c.receive)
    if (f?.t === "latest") {
      const host = String(f.host), known = Number(f.known), l = data.latest(host)
      const resync = known > 0 && known < (data.resyncBelow?.(host) ?? 0)
      yield* c.send(JSON.stringify(resync ? { t: "answer", kind: "resync" } : !l || l.revision <= known ? { t: "answer", kind: "none" } : { t: "answer", kind: "manifest", envelope: l.envelope }))
    } else if (f?.t === "snapshot") {
      const s = data.snapshot(String(f.host), String(f.since))
      yield* c.send(JSON.stringify(s ? { t: "snapshot", ...s } : { t: "snapshot", error: "none" }))
    }
  }), tls)

const request = (address: string, frame: object, tls?: Parameters<typeof dialAddress>[1]) => Effect.gen(function* () {
  const c = yield* dialAddress(address, tls); yield* c.send(JSON.stringify(frame)); return parse(yield* c.receive)
})
/** `ManifestSource.latest` against an authority at `address`; a failed dial or an unreadable answer fails (the sync maps it to ManifestUnavailable). */
export const remoteSource = (address: string, tls?: Parameters<typeof dialAddress>[1]) => (req: { readonly host: string; readonly known: number }): Effect.Effect<SyncAnswer, unknown> =>
  request(address, { t: "latest", host: req.host, known: req.known }, tls).pipe(Effect.flatMap((a) =>
    a?.t === "answer" && (a.kind === "none" || a.kind === "resync" || (a.kind === "manifest" && a.envelope)) ? Effect.succeed((a.kind === "manifest" ? { kind: "manifest", envelope: a.envelope } : { kind: a.kind }) as unknown as SyncAnswer) : Effect.fail("bad-answer")))
export const remoteSnapshot = (address: string, tls?: Parameters<typeof dialAddress>[1]) => (q: { readonly host: string; readonly since: string }) =>
  request(address, { t: "snapshot", host: q.host, since: q.since }, tls).pipe(Effect.flatMap((a) => a?.t === "snapshot" && !a.error ? Effect.succeed({ revision: Number(a.revision), snapshot: a.snapshot }) : Effect.fail({ reason: "snapshot-unavailable" })))
