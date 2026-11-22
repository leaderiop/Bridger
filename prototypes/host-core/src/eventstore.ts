// Minimal in-memory event store (event-store 01, 02, 03, 05; improvement report 06 S38, S40, S41): append with expected version and access policy, facts matched by
// id and content, snapshots bound to their event and removed on shred. Storage is a Map; the real port, projections and chaining are not modelled.
import { createHash } from "node:crypto"
import { appendAllowed, recordFact, snapshotStore } from "./hardening.js"
import { PayloadDecodeFailed } from "./keyring.js"

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
  /** A received envelope kept byte for byte: the keyring's selected paths must hold an exact Encrypted or Shredded form, checked without a key, so peer plaintext never lands in the store (INV-KR-001, S71). */
  const receiveVerbatim = (origin: string, stream: string, f: { factId: string; type: string; payload: string; version: number }, paths: ReadonlyArray<string>) => {
    let body: any; try { body = JSON.parse(f.payload) } catch { throw new PayloadDecodeFailed("payload is not JSON") }
    for (const p of paths) {
      let v = body; for (const k of p.split(".")) v = v?.[k]
      if (v === undefined) continue
      if (!(typeof v === "object" && v !== null && (v.$encrypted === 1 || v.$shredded === 1))) throw new PayloadDecodeFailed(`plaintext at ${p}`)
    }
    return receive(origin, stream, f)
  }
  const read = (stream: string): ReadonlyArray<StoredEvent> => { if (!o.ask({ mode: "read", stream })) throw new AppendRefused(stream); return streams.get(stream) ?? [] }
  return {
    append, receive, receiveVerbatim, read, conflicts: () => conflicts,
    putSnapshot: (stream: string, version: number, state: unknown) => { const e = at(stream, version); if (e) snaps.put(stream, version, e, state) },
    loadSnapshot: (stream: string) => snaps.load(stream, (v) => at(stream, v)),
    shred: (affected: Iterable<string>) => snaps.onShred(affected)
  }
}

export class StoreSwapInProgress extends Error { readonly _tag = "StoreSwapInProgress"; constructor(readonly read: "page-interrupted" | "fence-refused") { super(`store swap in progress: ${read}`) } }
export type Page = ReadonlyArray<string>
/**
 * BEH-ES-040 check 18 (SPEC-AUDIT-09 H5, H6): reads across a whole-store freeze. `read` decodes no page between the freeze's second step and `whenReadable`; a lazy read begun
 * before it fails at its page in flight; `readIn` takes the fence with its transaction instead of waiting; a participant's `prepare` reads through `readForSwap` only.
 */
export const makeSwapReads = (pages: ReadonlyMap<string, ReadonlyArray<Page>>) => {
  let frozen = false, epoch = 0, running: { participant: string; step: number } | undefined
  const freeze = () => { frozen = true; epoch++ }
  const whenReadable = () => { frozen = false }
  const iterate = (stream: string, fence: (() => void) | undefined, tx?: { ended: boolean }) => {
    const born = epoch; let i = 0, dead = false
    return {
      next: (): { page: Page } | "waiting" | "done" => {
        if (tx?.ended) throw new Error("page pulled after its transaction ended")
        if (dead) throw new StoreSwapInProgress("page-interrupted")
        if (frozen) { if (born !== epoch) { dead = true; throw new StoreSwapInProgress("page-interrupted") } if (!fence) return "waiting" }
        const p = pages.get(stream)?.[i]; if (!p) return "done"; i++; return { page: p }
      }
    }
  }
  const guard = () => { if (running) throw new Error(`read from prepare of ${running.participant} at step ${running.step}: use readForSwap`) }
  const read = (stream: string) => { guard(); return iterate(stream, undefined) }
  const readIn = (tx: { ended: boolean }, stream: string) => { guard(); if (frozen) throw new StoreSwapInProgress("fence-refused"); return iterate(stream, () => undefined, tx) }
  const readForSwap = (step: { participant: string; step: number }, stream: string) => {
    if (!running || running.participant !== step.participant || running.step !== step.step) throw new Error("readForSwap needs the SwapStep it was handed")
    const all = pages.get(stream) ?? []; return all.flat()               // reads the replaced store at once, never waiting
  }
  const prepare = <A>(participant: string, step: number, body: (s: { participant: string; step: number }) => A): A => { running = { participant, step }; try { return body(running) } finally { running = undefined } }
  return { freeze, whenReadable, read, readIn, readForSwap, prepare }
}
