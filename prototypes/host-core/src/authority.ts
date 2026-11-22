// A manifest authority served over a socket (federation 02 BEH-FD-011, 014): `latest` and `snapshot` as request/response frames, and the
// client side that fits `SyncOptions.source` and `Rebootstrap.fetch`. One connection per request; signing is the consumer's (`SignaturePolicy`).
import { Effect } from "effect"
import { createHash, timingSafeEqual } from "node:crypto"
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { join } from "node:path"
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

/**
 * Per-host bearer tokens, several valid at once so a token can be rotated without a gap: `add` the new one, move the host over, then
 * `revoke` the old one. A token opens exactly one host's manifests and snapshots (tenant isolation); the comparison is constant-time and
 * visits every token of the host, so the time does not tell which one matched.
 */
export interface TokenAuthorizer {
  (host: string, token: string | undefined): boolean
  readonly add: (host: string, token: string) => void
  readonly revoke: (host: string, token: string) => boolean
  /** Revokes every token of a host. */
  readonly revokeHost: (host: string) => void
}
export const tokenAuthorizer = (initial: Readonly<Record<string, string | readonly string[]>>): TokenAuthorizer => {
  const sets = new Map<string, Set<string>>(Object.entries(initial).map(([h, t]) => [h, new Set(typeof t === "string" ? [t] : t)]))
  const digest = (t: string) => createHash("sha256").update(t).digest()
  const check = (host: string, token: string | undefined): boolean => {
    const set = sets.get(host); if (!set || token === undefined) return false
    const got = digest(token); let ok = false
    for (const t of set) if (timingSafeEqual(digest(t), got)) ok = true
    return ok
  }
  return Object.assign(check, {
    add: (host: string, token: string) => { (sets.get(host) ?? sets.set(host, new Set()).get(host)!).add(token) },
    revoke: (host: string, token: string) => sets.get(host)?.delete(token) ?? false,
    revokeHost: (host: string) => { sets.delete(host) }
  })
}
export const serveAuthority = (data: AuthorityData, tls?: Parameters<typeof listen>[1], authorize?: (host: string, token: string | undefined) => boolean): Effect.Effect<Listener> =>
  listen((c: Connection) => Effect.gen(function* () {
    const f = parse(yield* c.receive)
    if (authorize && f && !authorize(String(f.host), typeof f.token === "string" ? f.token : undefined)) { yield* c.send(JSON.stringify({ t: "error", reason: "unauthorized" })); return }
    if (f?.t === "latest") {
      const host = String(f.host), known = Number(f.known), l = data.latest(host)
      const resync = known > 0 && known < (data.resyncBelow?.(host) ?? 0)
      yield* c.send(JSON.stringify(resync ? { t: "answer", kind: "resync" } : !l || l.revision <= known ? { t: "answer", kind: "none" } : { t: "answer", kind: "manifest", envelope: l.envelope }))
    } else if (f?.t === "snapshot") {
      const s = data.snapshot(String(f.host), String(f.since))
      yield* c.send(JSON.stringify(s ? { t: "snapshot", ...s } : { t: "snapshot", error: "none" }))
    }
  }), tls)

const request = (address: string, frame: object, tls?: Parameters<typeof dialAddress>[1], token?: string) => Effect.gen(function* () {
  const c = yield* dialAddress(address, tls); yield* c.send(JSON.stringify({ ...frame, ...(token !== undefined ? { token } : {}) })); return parse(yield* c.receive)
})
/** `ManifestSource.latest` against an authority at `address`; a failed dial or an unreadable answer fails (the sync maps it to ManifestUnavailable). */
export const remoteSource = (address: string, tls?: Parameters<typeof dialAddress>[1], token?: string) => (req: { readonly host: string; readonly known: number }): Effect.Effect<SyncAnswer, unknown> =>
  request(address, { t: "latest", host: req.host, known: req.known }, tls, token).pipe(Effect.flatMap((a) =>
    a?.t === "answer" && (a.kind === "none" || a.kind === "resync" || (a.kind === "manifest" && a.envelope)) ? Effect.succeed((a.kind === "manifest" ? { kind: "manifest", envelope: a.envelope } : { kind: a.kind }) as unknown as SyncAnswer) : Effect.fail(a?.t === "error" ? String(a.reason) : "bad-answer")))
export const remoteSnapshot = (address: string, tls?: Parameters<typeof dialAddress>[1], token?: string) => (q: { readonly host: string; readonly since: string }) =>
  request(address, { t: "snapshot", host: q.host, since: q.since }, tls, token).pipe(Effect.flatMap((a) => a?.t === "snapshot" && !a.error ? Effect.succeed({ revision: Number(a.revision), snapshot: a.snapshot }) : Effect.fail({ reason: a?.t === "error" ? String(a.reason) : "snapshot-unavailable" })))

/**
 * Authority data kept on disk, one directory per host (the host id is hashed into the directory name, never used as a path): a published
 * manifest or snapshot survives a restart of the authority. Writes go through a temp file and a rename.
 */
export const fileAuthorityData = (dir: string): AuthorityData & {
  readonly publish: (host: string, envelope: Envelope) => void
  readonly putSnapshot: (host: string, revision: number, snapshot: unknown) => void
  readonly setResyncBelow: (host: string, revision: number) => void
} => {
  const at = (host: string, file: string) => join(dir, createHash("sha256").update(host).digest("hex").slice(0, 32), file)
  const write = (host: string, file: string, value: unknown) => { const p = at(host, file); mkdirSync(join(p, ".."), { recursive: true }); const tmp = `${p}.tmp`; writeFileSync(tmp, JSON.stringify(value)); renameSync(tmp, p) }
  const read = <T>(host: string, file: string): T | undefined => { try { return JSON.parse(readFileSync(at(host, file), "utf8")) as T } catch { return undefined } }
  return {
    latest: (host) => { const e = read<Envelope>(host, "manifest.json"); return e ? { revision: Number(e.version), envelope: e } : undefined },
    snapshot: (host) => read<{ revision: number; snapshot: unknown }>(host, "snapshot.json"),
    resyncBelow: (host) => read<number>(host, "resync-below.json") ?? 0,
    publish: (host, envelope) => {
      const cur = read<Envelope>(host, "manifest.json")
      if (cur && Number(envelope.version) <= Number(cur.version)) throw new Error(`revision ${envelope.version} is not above ${cur.version}`)    // the authority never publishes a lower or reused revision
      write(host, "manifest.json", envelope)
    },
    putSnapshot: (host, revision, snapshot) => write(host, "snapshot.json", { revision, snapshot }),
    setResyncBelow: (host, revision) => write(host, "resync-below.json", revision)
  }
}
