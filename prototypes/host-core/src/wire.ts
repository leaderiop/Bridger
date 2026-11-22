// In-memory wire for the two boundary handshakes: the frames of remote BEH-RM-009 (hello / welcome / refuse) and federation
// BEH-FD-018 (offer), over a duplex of queues. A stand-in for a `Transport` (remote 07): frames are JSON strings, nothing else.
import { Effect, Queue } from "effect"
import type { ContractDescriptor } from "./contract.js"
import { guestAnswer, importCheck, welcomeCheck, type ImportVerdict, type Mismatch, type WireSide } from "./handshake.js"

export interface Connection { readonly send: (frame: string) => Effect.Effect<void>; readonly receive: Effect.Effect<string> }
/** Two connected ends: what one sends the other receives, in order. */
export const duplex = Effect.gen(function* () {
  const ab = yield* Queue.unbounded<string>(), ba = yield* Queue.unbounded<string>()
  const end = (out: Queue.Queue<string>, inn: Queue.Queue<string>): Connection => ({ send: (f) => Queue.offer(out, f).pipe(Effect.asVoid), receive: Queue.take(inn) })
  return [end(ab, ba), end(ba, ab)] as const
})

const parse = (s: string): { readonly t?: string; readonly [k: string]: unknown } | undefined => { try { const v = JSON.parse(s); return typeof v === "object" && v !== null && !Array.isArray(v) ? v : undefined } catch { return undefined } }
const schemasOf = (u: unknown): ContractDescriptor["schemas"] | undefined =>
  Array.isArray(u) && u.every((x) => x && typeof x.method === "string" && typeof x.digest === "string") ? u : undefined

// ---------------------------------------------------------------- remote (BEH-RM-009, 011, 033)
export type LinkOutcome =
  | { readonly session: { readonly version: string; readonly wire: number; readonly epoch: string } }
  | { readonly refused: "wire" | "incompatible-contract" | "revoked" | "busy" | "not-a-peer"; readonly cause?: Mismatch }

/** The link's end: send `hello`, read the answer, accept a `welcome` only as BEH-RM-011 states. */
export const linkHandshake = (conn: Connection, hello: { readonly wire: ReadonlyArray<number>; readonly epoch: string; readonly contract: WireSide & { readonly id: string; readonly accepts: string } }): Effect.Effect<LinkOutcome> =>
  Effect.gen(function* () {
    yield* conn.send(JSON.stringify({ t: "hello", wire: hello.wire, epoch: hello.epoch, contract: hello.contract }))
    const f = parse(yield* conn.receive)
    if (!f) return { refused: "wire" as const }
    if (f.t === "refuse") return { refused: (typeof f.reason === "string" ? f.reason : "wire") as "wire" }
    if (f.t !== "welcome" || f.epoch !== hello.epoch || typeof f.wire !== "number" || !hello.wire.includes(f.wire) || typeof f.version !== "string") return { refused: "wire" as const }
    const schemas = schemasOf(f.schemas)
    const bad = welcomeCheck(hello.contract, { version: f.version, ...(schemas ? { methods: schemas.map((x) => x.method), schemas } : {}) })
    if (bad) return { refused: "incompatible-contract" as const, cause: bad }
    return { session: { version: f.version, wire: f.wire, epoch: hello.epoch } }
  })

/** The guest's end (`Guest.serve`): answer a `hello` with the highest common wire version and served contract version, or refuse. */
export const guestServe = (conn: Connection, guest: { readonly wire: ReadonlyArray<number>; readonly served: ReadonlyArray<WireSide>; readonly maxInFlight: number }): Effect.Effect<{ readonly answered: "welcome" | "refuse"; readonly epoch?: string; readonly version?: string }> =>
  Effect.gen(function* () {
    const h = parse(yield* conn.receive)
    const epoch = typeof h?.epoch === "string" ? h.epoch : undefined
    const c = h?.contract as { accepts?: unknown; version?: unknown } | undefined
    const wires = Array.isArray(h?.wire) ? (h!.wire as unknown[]).filter((w): w is number => typeof w === "number" && guest.wire.includes(w)) : []
    if (!h || h.t !== "hello" || epoch === undefined || !c || typeof c.accepts !== "string" || typeof c.version !== "string" || wires.length === 0) {
      yield* conn.send(JSON.stringify({ t: "refuse", ...(epoch !== undefined ? { epoch } : {}), reason: "wire" }))
      return { answered: "refuse" as const }
    }
    const schemas = schemasOf((c as { schemas?: unknown }).schemas)
    const methods = Array.isArray((c as { methods?: unknown }).methods) ? (c as { methods: string[] }).methods : undefined
    const a = guestAnswer({ version: c.version, accepts: c.accepts, ...(methods ? { methods } : {}), ...(schemas ? { schemas } : {}) }, guest.served)
    if (a.t === "refuse") { yield* conn.send(JSON.stringify({ t: "refuse", epoch, reason: a.reason })); return { answered: "refuse" as const } }
    yield* conn.send(JSON.stringify({ t: "welcome", wire: Math.max(...wires), epoch, version: a.version, ...(a.schemas ? { schemas: a.schemas } : {}), maxInFlight: guest.maxInFlight }))
    return { answered: "welcome" as const, epoch, version: a.version }
  })

// ---------------------------------------------------------------- federation (BEH-FD-018, 019, 020)
export interface PeerOffer {
  readonly host: string; readonly authority: string
  readonly protocol: readonly [min: number, max: number]; readonly protocolWindow: number
  readonly exports: ReadonlyArray<{ readonly key: string; readonly major: number; readonly version?: string; readonly schemas?: ContractDescriptor["schemas"] }>
  readonly imports: ReadonlyArray<{ readonly key: string; readonly version: string; readonly methods?: ReadonlyArray<string>; readonly schemas?: ContractDescriptor["schemas"] }>
}
export type IncompatiblePeer = { readonly _tag: "IncompatiblePeer"; readonly reason: "wrong-host" | "wrong-authority" | "protocol" }
export type LinkAgreement =
  | { readonly protocol: number; readonly verdicts: ReadonlyArray<{ readonly key: string } & ImportVerdict> }
  | IncompatiblePeer

/** BEH-FD-019: the highest version in `[max(minA, minB, maxA − wA, maxB − wB), min(maxA, maxB)]`, the same on both ends. */
export const agreeProtocol = (a: PeerOffer, b: PeerOffer): number | undefined => {
  const lo = Math.max(a.protocol[0], b.protocol[0], a.protocol[1] - a.protocolWindow, b.protocol[1] - b.protocolWindow)
  const hi = Math.min(a.protocol[1], b.protocol[1])
  return lo <= hi ? hi : undefined
}

/** One end of the offer exchange: send mine, read the peer's, decide the agreement; every import accepted or refused alone. */
export const offerExchange = (conn: Connection, mine: PeerOffer, peer: { readonly host: string; readonly authority: string }, o: { readonly onKill?: (k: { readonly revision: number; readonly list: unknown }) => Effect.Effect<void> } = {}): Effect.Effect<LinkAgreement> =>
  Effect.gen(function* () {
    yield* conn.send(JSON.stringify({ t: "offer", offer: mine }))
    let f = parse(yield* conn.receive)
    while (f?.t === "kill") {                                                  // BEH-FD-043: a revocation list is the first control frame, before the offer
      if (o.onKill) yield* o.onKill({ revision: Number(f.revision), list: f.list })
      f = parse(yield* conn.receive)
    }
    const theirs = f?.t === "offer" ? f.offer as PeerOffer : undefined
    if (!theirs) return { _tag: "IncompatiblePeer" as const, reason: "protocol" as const }
    if (theirs.host !== peer.host) return { _tag: "IncompatiblePeer" as const, reason: "wrong-host" as const }
    if (theirs.authority !== peer.authority) return { _tag: "IncompatiblePeer" as const, reason: "wrong-authority" as const }
    const protocol = agreeProtocol(mine, theirs)
    if (protocol === undefined) return { _tag: "IncompatiblePeer" as const, reason: "protocol" as const }
    return { protocol, verdicts: mine.imports.map((i) => ({ key: i.key, ...importCheck(i, theirs.exports) })) }
  })
