// Durable federation state (federation 06 BEH-FD-048, 01 BEH-FD-004): the highest verified manifest (stored before it is applied),
// the last applied one, pending kills, the re-bootstrap marker, firstActivation. A file store writes atomically (temp file, rename).
import { Effect } from "effect"
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import type { KillEntry } from "./federation.js"
import type { Envelope } from "./sync.js"
import type { Marker } from "./rebootstrap.js"

export interface Stored { readonly envelope: Envelope; readonly acceptedAt: number }
export interface DurableState {
  readonly highest?: Stored & { readonly revision: number }
  readonly lastApplied?: Stored & { readonly revision: number; readonly requiresFresh: ReadonlyArray<{ readonly id: string; readonly realm: string }> }
  readonly pendingKills: ReadonlyArray<KillEntry & { readonly revision: number }>
  readonly marker?: Marker
  readonly firstActivation?: number
}
export interface StateStore { readonly read: Effect.Effect<DurableState>; readonly update: (f: (s: DurableState) => DurableState) => Effect.Effect<void> }
const empty: DurableState = { pendingKills: [] }

export const memoryState = (initial: DurableState = empty): StateStore => {
  let s = initial
  return { read: Effect.sync(() => s), update: (f) => Effect.sync(() => { s = f(s) }) }
}
/** shortcut: one JSON file rewritten whole per update; adequate for a few kilobytes of state, a log-structured store beyond that. */
export const fileState = (path: string): StateStore => {
  const load = (): DurableState => { try { return { ...empty, ...JSON.parse(readFileSync(path, "utf8")) } } catch { return empty } }
  return {
    read: Effect.sync(load),
    update: (f) => Effect.sync(() => { const next = f(load()); mkdirSync(dirname(path), { recursive: true }); const tmp = `${path}.tmp`; writeFileSync(tmp, JSON.stringify(next)); renameSync(tmp, path) })
  }
}

/** The re-bootstrap marker kept in the durable state (BEH-FD-048): written before each step is acted on. */
export const markerPorts = (store: StateStore) => ({
  read: Effect.map(store.read, (s) => s.marker),
  write: (m: Marker) => store.update((s) => ({ ...s, marker: m })),
  clear: store.update((s) => { const { marker: _m, ...rest } = s; return rest })
})
