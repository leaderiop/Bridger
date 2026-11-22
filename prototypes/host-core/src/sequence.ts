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
