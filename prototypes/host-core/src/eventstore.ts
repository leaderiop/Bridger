// Minimal in-memory event store (event-store 01, 02, 03, 05; improvement report 06 S38, S40, S41): append with expected version and access policy, facts matched by
// id and content, snapshots bound to their event and removed on shred. Storage is a Map; the real port, projections and chaining are not modelled.
import { createHash } from "node:crypto"
import { appendAllowed, recordFact, snapshotStore } from "./hardening.js"

export interface StoredEvent { readonly stream: string; readonly version: number; readonly eventId: string; readonly type: string; readonly payload: string; readonly factDigest: string }
export class VersionConflict extends Error { readonly _tag = "VersionConflict"; constructor(readonly expected: number, readonly actual: number) { super("version conflict") } }
export class AppendRefused extends Error { readonly _tag = "AppendRefused"; constructor(readonly stream: string) { super(`append refused: ${stream}`) } }

export const makeEventStore = (o: { readonly ask: (r: { mode: "append" | "read"; stream: string }) => boolean; readonly newId: () => string }) => {
  const streams = new Map<string, StoredEvent[]>(), facts = new Map<string, Map<string, { digest: string }>>(), conflicts: unknown[] = [], snaps = snapshotStore()
  const at = (stream: string, version: number) => { const e = streams.get(stream)?.[version - 1]; return e && { eventId: e.eventId, bytes: e.payload } }
  const push = (stream: string, type: string, payload: string, factDigest = ""): StoredEvent => {
    const list = streams.get(stream) ?? []; const e = { stream, version: list.length + 1, eventId: o.newId(), type, payload, factDigest }
    streams.set(stream, [...list, e]); return e
  }
  const append = (stream: string, type: string, payload: string, expected: number, via: { receive: boolean } = { receive: false }) => {
    if (!appendAllowed({ stream, viaReceive: via.receive, ask: o.ask })) throw new AppendRefused(stream)
    const have = streams.get(stream)?.length ?? 0
    if (have !== expected) throw new VersionConflict(expected, have)
    return push(stream, type, payload)
  }
  /** A received fact: never rejected. Equal content is already recorded; different content under the same id is recorded as a FactConflict event. */
  const receive = (origin: string, stream: string, f: { factId: string; type: string; payload: string; version: number }) => {
    const rx = `rx:${origin}:${stream}`, seen = facts.get(rx) ?? new Map(); facts.set(rx, seen)
    const out = recordFact(seen, conflicts, f)
    if (out === "recorded") push(rx, f.type, f.payload, seen.get(f.factId)!.digest)
    if (out === "conflict") push(rx, "FactConflict", JSON.stringify({ factId: f.factId, digest: createHash("sha256").update(`${f.version}\n${f.payload}`).digest("hex") }))
    return out
  }
  const read = (stream: string): ReadonlyArray<StoredEvent> => { if (!o.ask({ mode: "read", stream })) throw new AppendRefused(stream); return streams.get(stream) ?? [] }
  return {
    append, receive, read, conflicts: () => conflicts,
    putSnapshot: (stream: string, version: number, state: unknown) => { const e = at(stream, version); if (e) snaps.put(stream, version, e, state) },
    loadSnapshot: (stream: string) => snaps.load(stream, (v) => at(stream, v)),
    shred: (affected: Iterable<string>) => snaps.onShred(affected)
  }
}
