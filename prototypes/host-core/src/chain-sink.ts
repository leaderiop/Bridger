// Minimal audit-chain sink (audit-chain 03 BEH-AC-004, 005; improvement report 06 S60): appends records to one series, marks a retry with different content
// "retry-mismatch" and a repeated or skipped auditSeq "chain-order", and hands the verifier the markers it recorded so a stripped marker is noticed.
// Storage is an array; anchoring, keyed hashing and the ChainStore split are not modelled.
import { chainEntries, type ChainEntry } from "./audit-chain.js"

type Rec = { hostId: string; auditSeq: number; recordId: string; [k: string]: unknown }
export const makeChainSink = (seriesId: string) => {
  const records: Rec[] = [], marks = new Map<number, "chain-order" | "retry-mismatch">()      // keyed by position in the series, so a duplicate seq marks only the later record
  const same = (a: Rec, b: Rec) => JSON.stringify(a) === JSON.stringify(b)
  const append = (r: Rec): "appended" | "retry" | "retry-mismatch" | "chain-order" => {
    const dup = records.find((x) => x.recordId === r.recordId)
    if (dup) { if (same(dup, r)) return "retry"; records.push(r); marks.set(records.length - 1, "retry-mismatch"); return "retry-mismatch" }   // an identical retry changes nothing; a different one is kept, marked
    const last = records.at(-1), ordered = r.hostId === seriesId && (last === undefined || r.auditSeq === last.auditSeq + 1)
    records.push(r); if (!ordered) marks.set(records.length - 1, "chain-order")
    return ordered ? "appended" : "chain-order"
  }
  const entries = (): ChainEntry[] => chainEntries({ seriesId, records }).map((e, i) => { const m = marks.get(i); return m ? { ...e, link: { ...e.link!, break: { reason: m } } } : e })
  /** What `verifyBundle({ expectedBreaks })` takes: `seriesId/seq` -> reason. */
  const expectedBreaks = (): ReadonlyMap<string, string> => new Map([...marks].map(([i, reason]) => [`${seriesId}/${records[i]!.auditSeq}`, reason]))
  return { append, entries, expectedBreaks, size: () => records.length }
}
