// Minimal sequence authority (sequence 01, 02; improvement report 06 S51, S52 part): numbers issued per series, events accepted only when origins agree and
// quarantined otherwise, verification that reports gaps and duplicates from the series' own events only. Incarnation and chaining are not modelled.
import { acceptSeriesEvent } from "./hardening.js"

export interface SeriesEvent { readonly kind: "NumberIssued" | "SeriesClosed"; readonly seriesId: string; readonly number?: number; readonly envelopeOrigin: string; readonly streamOrigin: string; readonly seriesOrigin: string; readonly reason?: string }
const REASON = /^[a-z][a-z0-9-]{0,31}$/                               // a code, never free text: these events are cleartext and immutable

export const makeSequenceAuthority = () => {
  const events: SeriesEvent[] = [], quarantine: SeriesEvent[] = []
  const accept = (e: SeriesEvent): "recorded" | "quarantined" | "invalid" => {
    if (e.kind === "SeriesClosed" && !(e.reason !== undefined && REASON.test(e.reason))) return "invalid"
    if (acceptSeriesEvent(e) === "quarantine") { quarantine.push(e); return "quarantined" }
    events.push(e); return "recorded"
  }
  /** Only events of the series' own origin count; a quarantined foreign event changes no computed field. */
  const verifySeries = (seriesId: string) => {
    const own = events.filter((e) => e.seriesId === seriesId && e.kind === "NumberIssued" && e.number !== undefined).map((e) => e.number!)
    const seen = new Set<number>(), duplicates: number[] = [], gaps: number[] = []
    for (const n of own) { if (seen.has(n)) duplicates.push(n); seen.add(n) }
    const max = own.length ? Math.max(...own) : 0
    for (let n = 1; n <= max; n++) if (!seen.has(n)) gaps.push(n)
    return { gaps, duplicates, closed: events.some((e) => e.seriesId === seriesId && e.kind === "SeriesClosed"), foreignWriter: quarantine.some((e) => e.seriesId === seriesId) }
  }
  return { accept, verifySeries, quarantined: () => quarantine.length }
}

export class NotOwner extends Error { readonly _tag = "NotOwner"; constructor(readonly series: string) { super(`not owner of ${series}`) } }
export class SupersessionPending extends Error { readonly _tag = "SupersessionPending"; constructor() { super("supersession pending") } }
export interface Superseded { readonly kind: "SeriesSuperseded"; readonly series: string; readonly highest: number; readonly lastKnownOnly: false; readonly actor: { readonly kind: "service"; readonly id: string } }
/**
 * BEH-SQ-002, 009, 010 (SPEC-AUDIT-09 H4): after a whole-store install the node has a new origin. A handle opened before it fails with NotOwner and writes nothing;
 * calls under the new origin fail with SupersessionPending until the step commits; the step supersedes every series open in the replaced store once, with its highest number.
 */
export const makeSeriesNode = (node: string) => {
  let origin = 1, pending = false; const issued = new Map<string, number>(), events: Array<Superseded | { kind: "NumberIssued"; series: string; number: number; previous?: number }> = [], superseded = new Map<string, number>()
  const open = (series: string) => ({ series, origin })
  const next = (h: { series: string; origin: number }) => {
    if (h.origin !== origin) throw new NotOwner(h.series)
    if (pending) throw new SupersessionPending()
    const n = (issued.get(h.series) ?? 0) + 1, previous = superseded.get(h.series)
    issued.set(h.series, n); superseded.delete(h.series)
    events.push({ kind: "NumberIssued", series: h.series, number: n, ...(previous !== undefined ? { previous } : {}) }); return n
  }
  const installed = () => { origin++; pending = true }
  /** `replaced` is the highest number of each series open in the replaced store; `inSnapshot` names those the snapshot already superseded. */
  const commitStep = (replaced: ReadonlyMap<string, number>, inSnapshot: ReadonlySet<string> = new Set()) => {
    for (const [series, highest] of [...replaced].sort(([a], [b]) => a.localeCompare(b))) {
      if (inSnapshot.has(series)) continue
      events.push({ kind: "SeriesSuperseded", series, highest, lastKnownOnly: false, actor: { kind: "service", id: `sequence:${node}` } }); superseded.set(series, highest); issued.set(series, highest)
    }
    pending = false
  }
  return { open, next, installed, commitStep, events: () => events }
}
