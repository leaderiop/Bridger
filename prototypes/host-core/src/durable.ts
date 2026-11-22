// Durable federation state (federation 06 BEH-FD-048, 01 BEH-FD-004): the highest verified manifest (stored before it is applied),
// the last applied one, pending kills, the re-bootstrap marker, firstActivation. A file store writes atomically (temp file, rename).
import { Effect } from "effect"
import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeSync } from "node:fs"
import { dirname } from "node:path"
import type { KillEntry } from "./federation.js"
import type { Envelope } from "./sync.js"
import type { Marker } from "./rebootstrap.js"

export interface Stored { readonly envelope: Envelope; readonly acceptedAt: number }
export interface DurableState {
  readonly highest?: Stored & { readonly revision: number }
  readonly lastApplied?: Stored & { readonly revision: number; readonly requiresFresh: ReadonlyArray<{ readonly id: string; readonly realm: string }>; readonly plugins?: ReadonlyArray<{ readonly id: string; readonly realm: string; readonly digest: string }> }
  readonly pendingKills: ReadonlyArray<KillEntry & { readonly revision: number }>
  /** Digests a released revocation list revokes: killed at every apply, whether or not a manifest lists them (BEH-FD-007, 042). */
  readonly revoked?: ReadonlyArray<string>
  readonly marker?: Marker
  readonly firstActivation?: number
}
export interface StateStore { readonly read: Effect.Effect<DurableState>; readonly update: (f: (s: DurableState) => DurableState) => Effect.Effect<void> }
const empty: DurableState = { pendingKills: [] }

export const memoryState = (initial: DurableState = empty): StateStore => {
  let s = initial
  return { read: Effect.sync(() => s), update: (f) => Effect.sync(() => { s = f(s) }) }
}
/**
 * A log-structured file: each update appends one line holding only the top-level keys that changed (`null` deletes a key); a load
 * folds the lines; once the log exceeds `compactAfter` lines it is rewritten as one line (temp file, rename). A torn last line, left by
 * a crash mid-append, is ignored.
 */
export class StateLocked { readonly _tag = "StateLocked"; constructor(readonly path: string, readonly pid: number) {} }
const alive = (pid: number) => { try { process.kill(pid, 0); return true } catch (e) { return (e as { code?: string }).code === "EPERM" } }
/** One writer per state file: a lock file holding the owner's pid, taken exclusively; a lock whose owner is gone is stolen. */
const withLock = <A>(path: string, f: () => A): A => {
  const lock = `${path}.lock`
  for (let attempt = 0; ; attempt++) {
    try { const fd = openSync(lock, "wx"); writeSync(fd, String(process.pid)); closeSync(fd); break }
    catch (e) {
      if ((e as { code?: string }).code !== "EEXIST") throw e
      const pid = Number(readFileSync(lock, "utf8") || 0)
      if (pid && pid !== process.pid && alive(pid)) throw new StateLocked(path, pid)
      if (attempt > 2) throw new StateLocked(path, pid)
      try { unlinkSync(lock) } catch { /* another process stole it first */ }
    }
  }
  try { return f() } finally { try { unlinkSync(lock) } catch { /* already gone */ } }
}
const durableAppend = (path: string, text: string) => { const fd = openSync(path, "a"); try { writeSync(fd, text); fsyncSync(fd) } finally { closeSync(fd) } }
const durableWrite = (path: string, text: string) => { const tmp = `${path}.tmp`; const fd = openSync(tmp, "w"); try { writeSync(fd, text); fsyncSync(fd) } finally { closeSync(fd) } renameSync(tmp, path) }
export const fileState = (path: string, o: { readonly compactAfter?: number } = {}): StateStore => {
  const limit = o.compactAfter ?? 64
  const load = (): { state: DurableState; lines: number } => {
    let text = ""; try { text = readFileSync(path, "utf8") } catch { return { state: empty, lines: 0 } }
    const state: Record<string, unknown> = { ...empty }; let lines = 0
    for (const l of text.split("\n")) {
      if (!l) continue
      try { const d = JSON.parse(l) as Record<string, unknown>; for (const [k, v] of Object.entries(d)) { if (v === null) delete state[k]; else state[k] = v }; lines++ } catch { /* a torn final line */ }
    }
    return { state: state as unknown as DurableState, lines }
  }
  return {
    read: Effect.sync(() => load().state),
    update: (f) => Effect.sync(() => withLock(path, () => {
      mkdirSync(dirname(path), { recursive: true })
      const { state: cur, lines } = load(); const next = f(cur)
      const diff: Record<string, unknown> = {}
      for (const k of new Set([...Object.keys(cur), ...Object.keys(next)])) {
        const a = (cur as unknown as Record<string, unknown>)[k], b = (next as unknown as Record<string, unknown>)[k]
        if (JSON.stringify(a) !== JSON.stringify(b)) diff[k] = b === undefined ? null : b
      }
      if (Object.keys(diff).length === 0) return
      if (lines + 1 > limit) durableWrite(path, JSON.stringify(next) + "\n")        // fsynced before the rename
      else durableAppend(path, JSON.stringify(diff) + "\n")                          // fsynced before the update returns
    }))
  }
}

/** The re-bootstrap marker kept in the durable state (BEH-FD-048): written before each step is acted on. */
export const markerPorts = (store: StateStore) => ({
  read: Effect.map(store.read, (s) => s.marker),
  write: (m: Marker) => store.update((s) => ({ ...s, marker: m })),
  clear: store.update((s) => { const { marker: _m, ...rest } = s; return rest })
})
