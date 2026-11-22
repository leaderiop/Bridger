// Audit-chain companion, offline half (references/audit-chain 01 BEH-AC-003, 03 BEH-AC-017..019/022, 04 BEH-AC-026/031, 05 BEH-AC-033..040).
// The bundle half is pure, synchronous, no Effect, no clock: `createdAt` is passed in by the caller. `ChainGate` (BEH-AC-013, BEH-AC-013) is the live half. `bridger verify-chain` (kit BEH-KT-047) calls verifyBundle and prints renderReport.
import { createHash } from "node:crypto"
import { Clock, Effect, Schema } from "effect"
import type { Gate } from "./gate.js"
import { verifyAuditSequence, type OperationRequest } from "./gxp.js"

export type Alg = "sha-256" | "sha-512"
export type ChainLink = {
  readonly v?: 2; readonly alg: Alg; readonly keyId?: string; readonly prevHash: string; readonly hash: string
  readonly hostId?: string; readonly auditSeq?: number // v1 (audit)
  readonly seriesId?: string; readonly seq?: number; readonly canon?: string // v2 (generic)
  readonly recordId?: string
  readonly break?: { readonly reason: "chain-order" | "retry-mismatch" }
  readonly schema?: "unsupported"; readonly canonical?: "jcs-escaped"
}
export type ChainEntry = { readonly record: unknown; readonly link?: ChainLink }
export interface ChainProfile<R = unknown> {
  readonly canon: string
  readonly position: (record: R) => { readonly seq: number; readonly recordId: string }
  readonly encode: (record: R) => Uint8Array
  readonly dropped?: (record: R) => number
}
export type TrustRoot = { readonly kind: string; readonly anchor: string; readonly [k: string]: unknown }
// BEH-AC-009: version 2 is written; version 1 (hostId, no canon) is read and reported as anchoring no loss counter.
export type AnchorStatement =
  | { readonly v: 2; readonly alg: Alg; readonly seriesId: string; readonly canon: string; readonly fromSeq: number; readonly toSeq: number; readonly merkleRoot: string; readonly headHash: string; readonly previous?: string; readonly dropped?: number; readonly createdAt: string }
  | { readonly v: 1; readonly alg: Alg; readonly hostId: string; readonly fromSeq: number; readonly toSeq: number; readonly merkleRoot: string; readonly headHash: string; readonly previous?: string; readonly createdAt: string }
export type InclusionProof = { readonly hostId: string; readonly auditSeq: number; readonly link: ChainLink; readonly statementHash: string; readonly path: readonly string[] }
export type DisclosedRecord = InclusionProof & { readonly record: unknown } // BEH-AC-033: the record, its link and its proof
export class BundleExportFailed extends Schema.TaggedError<BundleExportFailed>()("BundleExportFailed", {
  seriesId: Schema.optional(Schema.String),
  reason: Schema.Literals(["store-unreadable", "receipts-unreadable", "unknown-series", "range-invalid"]),
  message: Schema.String
}) {}
export type AnchorReceipt = { readonly anchor: string; readonly statementHash: string; readonly evidence?: unknown }
export interface OfflineReceiptVerifier {
  readonly anchorKind: string
  readonly confirm: (s: AnchorStatement, statementHash: string, r: AnchorReceipt, roots: readonly TrustRoot[]) =>
    { readonly _tag: "Confirmed"; readonly by: string } | { readonly _tag: "Failed"; readonly reason: string } | { readonly _tag: "NeedsOnline" }
}
export type SeriesDescription = {
  readonly seriesId: string; readonly canon: string; readonly profile: string; readonly alg: Alg
  readonly continuesFrom?: { readonly seriesId: string; readonly seq: number; readonly hash: string }
}
export interface VerificationBundle {
  readonly format: "bridger-chain-bundle/v1"
  readonly createdAt: string
  readonly series: readonly SeriesDescription[]
  readonly segments: readonly { readonly seriesId: string; readonly fromSeq: number; readonly toSeq: number; readonly predecessor?: { readonly seq: number; readonly hash: string }; readonly entries: readonly ChainEntry[] }[]
  readonly inclusions?: readonly DisclosedRecord[]
  readonly anchors: readonly { readonly statement: AnchorStatement; readonly receipt: AnchorReceipt }[]
  readonly trustRoots: readonly TrustRoot[]
  readonly expectedHeads?: readonly { readonly seriesId: string; readonly seq: number; readonly hash?: string; readonly source: string }[]
  readonly digest: string
}

// ---- canonical encoding (RFC 8785 subset) and link (BEH-AC-003, BEH-AC-026) ----
// shortcut: JCS via sorted-key JSON.stringify (ES number and well-formed string output already match 8785), no independent-implementation vectors, when a second reader exists.
export const jcs = (v: unknown): string => {
  if (v === null || typeof v === "string" || typeof v === "boolean") return JSON.stringify(v)
  if (typeof v === "number") { if (!Number.isFinite(v)) throw new Error("not I-JSON"); return JSON.stringify(v) }
  if (Array.isArray(v)) return `[${v.map((x) => jcs(x === undefined ? null : x)).join(",")}]`
  if (typeof v === "object") return `{${Object.keys(v).filter((k) => (v as Record<string, unknown>)[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${jcs((v as Record<string, unknown>)[k])}`).join(",")}}`
  throw new Error("not JSON")
}
const utf8 = (s: string) => Buffer.from(s, "utf8")
const nodeAlg = (a: Alg) => (a === "sha-512" ? "sha512" : "sha256")
export const H = (alg: Alg, ...parts: Array<Uint8Array | string>): string => {
  const h = createHash(nodeAlg(alg)); for (const p of parts) h.update(typeof p === "string" ? utf8(p) : p); return h.digest("hex")
}
const D = (alg: Alg, v: 1 | 2) => `bridger-audit-chain/v${v}/${alg}\n`
export const genesis = (alg: Alg, id: string, v: 1 | 2 = 1): string => H(alg, D(alg, v), "genesis\n", id)
const mac = (alg: Alg, v: 1 | 2, prevHash: string, tail: Uint8Array): Uint8Array => Buffer.concat([utf8(D(alg, v)), utf8("record\n"), Buffer.from(prevHash, "hex"), tail])
const auditTail = (r: unknown) => utf8(jcs(r))
export const genericTail = (p: ChainProfile<any>, r: unknown) => { const pos = p.position(r); if (/[\u0000-\u001f\u007f]/.test(pos.recordId)) throw new Error("recordId holds a control character"); return Buffer.concat([utf8(`${p.canon}\n${pos.seq}\n${pos.recordId}\n`), p.encode(r)]) }
const hashOf = (alg: Alg, input: Uint8Array, keyed?: (input: Uint8Array) => Uint8Array | undefined) => { const k = keyed?.(input); return k ? Buffer.from(k).toString("hex") : H(alg, input) }

export const auditProfile: ChainProfile<any> = {
  canon: "jcs-v1", position: (r) => ({ seq: r.auditSeq, recordId: r.recordId ?? "" }), encode: (r) => utf8(jcs(r)), dropped: (r) => (typeof r.auditDropped === "number" ? r.auditDropped : 0)
}
const isAudit = (profile: string) => profile === "audit"

/** Build stored entries (record + link) for one series; the writer side the tests and exportBundle callers use. */
export const chainEntries = (opts: {
  readonly seriesId: string; readonly records: readonly unknown[]; readonly profile?: ChainProfile<any>; readonly alg?: Alg
  readonly keyed?: { readonly keyId: string; readonly mac: (input: Uint8Array) => Uint8Array }
  readonly continuesFrom?: { readonly hash: string }
}): ChainEntry[] => {
  const alg = opts.alg ?? "sha-256"; const generic = opts.profile && opts.profile !== auditProfile
  let prev = opts.continuesFrom?.hash ?? genesis(alg, opts.seriesId, generic ? 2 : 1)
  return opts.records.map((record: any) => {
    const input = generic ? mac(alg, 2, prev, genericTail(opts.profile!, record)) : mac(alg, 1, prev, auditTail(record))
    const hash = hashOf(alg, input, opts.keyed ? opts.keyed.mac : undefined)
    const base = { alg, ...(opts.keyed ? { keyId: opts.keyed.keyId } : {}), prevHash: prev, hash }
    prev = hash
    if (!generic) return { record, link: { ...base, hostId: record.hostId, auditSeq: record.auditSeq, recordId: record.recordId } }
    const pos = opts.profile!.position(record)
    return { record, link: { v: 2 as const, ...base, seriesId: opts.seriesId, seq: pos.seq, recordId: pos.recordId, canon: opts.profile!.canon } }
  })
}

// ---- windows, Merkle root, statements, inclusion proofs (02 BEH-AC-009/010, 03 BEH-AC-021) ----
const hexb = (h: string) => Buffer.from(h, "hex")
const dv = (s: AnchorStatement): 1 | 2 => (s.v === 1 || s.canon === "jcs-v1" ? 1 : 2)
const leaf = (alg: Alg, v: 1 | 2, linkHash: string) => H(alg, D(alg, v), "leaf\n", hexb(linkHash))
const node = (alg: Alg, v: 1 | 2, l: string, r: string) => H(alg, D(alg, v), "node\n", hexb(l), hexb(r))
const pow2Below = (n: number) => { let k = 1; while (k * 2 < n) k *= 2; return k }
/** RFC 6962 §2.1 Merkle Tree Hash over link hashes, with leaf() and node() of BEH-AC-010. */
export const merkleRoot = (alg: Alg, v: 1 | 2, linkHashes: readonly string[]): string => {
  const mth = (hs: readonly string[]): string => { if (hs.length === 1) return leaf(alg, v, hs[0]!); const k = pow2Below(hs.length); return node(alg, v, mth(hs.slice(0, k)), mth(hs.slice(k))) }
  return mth(linkHashes)
}
const auditPath = (alg: Alg, v: 1 | 2, m: number, hs: readonly string[]): string[] => {
  if (hs.length === 1) return []
  const k = pow2Below(hs.length)
  return m < k ? [...auditPath(alg, v, m, hs.slice(0, k)), merkleRoot(alg, v, hs.slice(k))] : [...auditPath(alg, v, m - k, hs.slice(k)), merkleRoot(alg, v, hs.slice(0, k))]
}
const rootFromPath = (alg: Alg, v: 1 | 2, m: number, n: number, leafHash: string, path: readonly string[]): string | undefined => {
  if (n === 1) return path.length === 0 ? leafHash : undefined
  if (path.length === 0) return undefined
  const k = pow2Below(n); const sib = path[path.length - 1]!; const rest = path.slice(0, -1)
  const sub = m < k ? rootFromPath(alg, v, m, k, leafHash, rest) : rootFromPath(alg, v, m - k, n - k, leafHash, rest)
  return sub === undefined ? undefined : m < k ? node(alg, v, sub, sib) : node(alg, v, sib, sub)
}
const seriesOf = (s: AnchorStatement) => (s.v === 1 ? s.hostId : s.seriesId)
export const statementHash = (s: AnchorStatement): string => H(s.alg, D(s.alg, dv(s)), "statement\n", jcs(s))
const seqOf = (e: ChainEntry, profile?: ChainProfile<any>): number => (profile ?? auditProfile).position(e.record).seq

/** Build a version 2 statement over entries fromSeq..toSeq of one series (writer side, for tests and tools). */
export const makeStatement = (o: { readonly seriesId: string; readonly alg?: Alg; readonly profile?: ChainProfile<any>; readonly entries: readonly ChainEntry[]; readonly fromSeq: number; readonly toSeq: number; readonly previous?: string; readonly createdAt: string }): AnchorStatement => {
  const alg = o.alg ?? "sha-256"; const p = o.profile ?? auditProfile
  const win = o.entries.filter((e) => { const q = seqOf(e, p); return q >= o.fromSeq && q <= o.toSeq })
  const dropped = p.dropped?.(win[win.length - 1]!.record)
  return { v: 2, alg, seriesId: o.seriesId, canon: p.canon, fromSeq: o.fromSeq, toSeq: o.toSeq, merkleRoot: merkleRoot(alg, p === auditProfile ? 1 : 2, win.map((e) => e.link!.hash)), headHash: win[win.length - 1]!.link!.hash, ...(o.previous ? { previous: o.previous } : {}), ...(dropped !== undefined ? { dropped } : {}), createdAt: o.createdAt }
}

/** Pure, total: undefined when the sequence is not in the statement's window of these entries. */
export const proveInclusion = (entries: Iterable<ChainEntry>, statement: AnchorStatement, seq: number, profile: ChainProfile<any> = auditProfile): InclusionProof | undefined => {
  try {
    const win = [...entries].filter((e) => { const q = seqOf(e, profile); return q >= statement.fromSeq && q <= statement.toSeq }).sort((a, b) => seqOf(a, profile) - seqOf(b, profile))
    const m = win.findIndex((e) => seqOf(e, profile) === seq)
    if (m < 0 || win.some((e) => !e.link) || win.length !== statement.toSeq - statement.fromSeq + 1) return undefined
    return { hostId: seriesOf(statement), auditSeq: seq, link: win[m]!.link!, statementHash: statementHash(statement), path: auditPath(statement.alg, profile === auditProfile ? 1 : 2, m, win.map((e) => e.link!.hash)) }
  } catch { return undefined }
}
/** The link hash recomputes, the link matches the record, and the path leads to the statement's merkleRoot. `keyed` as in verifyBundle. */
export const verifyInclusion = (record: unknown, proof: InclusionProof, statement: AnchorStatement, profile: ChainProfile<any> = auditProfile, keyed?: VerifyOptions["keyed"]): boolean => {
  try {
    const l = proof.link; const pos = profile.position(record); const generic = profile !== auditProfile
    if (statementHash(statement) !== proof.statementHash || pos.seq !== proof.auditSeq || pos.seq < statement.fromSeq || pos.seq > statement.toSeq) return false
    if (generic ? !(l.v === 2 && l.seriesId === proof.hostId && l.seq === pos.seq && l.recordId === pos.recordId) : !(l.v !== 2 && l.hostId === proof.hostId && l.auditSeq === pos.seq && l.recordId === pos.recordId)) return false
    const input = generic ? mac(l.alg, 2, l.prevHash, genericTail(profile, record)) : mac(l.alg, 1, l.prevHash, auditTail(record))
    if (l.keyId) { const k = keyed?.(l.keyId, input); if (k === undefined || Buffer.from(k).toString("hex") !== l.hash) return false } else if (H(l.alg, input) !== l.hash) return false
    return rootFromPath(statement.alg, generic ? 2 : 1, pos.seq - statement.fromSeq, statement.toSeq - statement.fromSeq + 1, leaf(statement.alg, generic ? 2 : 1, l.hash), proof.path) === statement.merkleRoot
  } catch { return false }
}

// ---- bundle export and digest (BEH-AC-033, BEH-AC-037) ----
const digestOf = (b: object): string => { const { digest: _d, ...rest } = b as Record<string, unknown>; return "sha256:" + H("sha-256", D("sha-256", 1), "bundle\n", jcs(rest)) }

/** Copy stored entries as given (breaks, missing links and gaps included); no verification. Throws BundleExportFailed when a request cannot be met. */
export const exportBundle = (req: {
  readonly createdAt: string
  readonly series: readonly (Omit<SeriesDescription, "canon" | "profile" | "alg"> & { readonly entries: readonly ChainEntry[]; readonly profile?: { readonly id: string; readonly profile: ChainProfile<any> }; readonly alg?: Alg })[]
  readonly anchors?: VerificationBundle["anchors"]
  readonly trustRoots: readonly TrustRoot[]
  readonly expectedHeads?: VerificationBundle["expectedHeads"]
  readonly range?: ReadonlyMap<string, { readonly fromSeq: number; readonly toSeq: number }> // default: the whole series
  readonly disclose?: "segments" | "inclusions" // default "segments"
  readonly include?: ReadonlyMap<string, readonly number[]> // with "inclusions": the seqs requested per series
}): VerificationBundle => {
  const fail = (reason: "unknown-series" | "range-invalid" | "receipts-unreadable" | "store-unreadable", seriesId: string | undefined, message: string): never => { throw new BundleExportFailed({ ...(seriesId ? { seriesId } : {}), reason, message }) }
  const ids = new Set(req.series.map((s) => s.seriesId))
  for (const id of [...(req.range?.keys() ?? []), ...(req.include?.keys() ?? [])]) if (!ids.has(id)) fail("unknown-series", id, `no series ${id}`)
  const preds = new Map<string, { seq: number; hash: string }>(); const inclusions: DisclosedRecord[] = []; const segments: VerificationBundle["segments"][number][] = []; const covered: { seriesId: string; fromSeq: number; toSeq: number }[] = []
  for (const s of req.series) {
    const p = s.profile?.profile
    let seqs: number[]
    try { seqs = s.entries.map((e) => seqOf(e, p)) } catch { return fail("store-unreadable", s.seriesId, "an entry has no readable position") }
    const lo = Math.min(...seqs); const hi = Math.max(...seqs)
    const r = req.range?.get(s.seriesId) ?? { fromSeq: lo, toSeq: hi }
    if (seqs.length === 0 || r.fromSeq > r.toSeq || r.fromSeq < lo || r.toSeq > hi) fail("range-invalid", s.seriesId, `range ${r.fromSeq}-${r.toSeq} is outside the stored ${lo}-${hi}`)
    // a range above seq 1 carries its predecessor link hash on the segment, so the verifier can prev-check the first entry
    if (r.fromSeq > 1 && req.disclose !== "inclusions") {
      const h = s.entries[seqs.indexOf(r.fromSeq - 1)]?.link?.hash
      if (h === undefined) fail("range-invalid", s.seriesId, `the entry before seq ${r.fromSeq} (or its link) is missing`)
      preds.set(s.seriesId, { seq: r.fromSeq - 1, hash: h! })
    }
    if (req.disclose === "inclusions") {
      for (const seq of req.include?.get(s.seriesId) ?? []) {
        // statement windows come from the supplied anchors; a record in no anchored window cannot be disclosed
        const a = (req.anchors ?? []).find((x) => seriesOf(x.statement) === s.seriesId && x.statement.fromSeq <= seq && seq <= x.statement.toSeq)
        const proof = a && proveInclusion(s.entries, a.statement, seq, p)
        if (!a || !proof) fail("receipts-unreadable", s.seriesId, `no anchored window with a proof for seq ${seq}`)
        inclusions.push({ record: s.entries[seqs.indexOf(seq)]!.record, ...proof! })
        covered.push({ seriesId: s.seriesId, fromSeq: seq, toSeq: seq })
      }
    } else {
      segments.push({ seriesId: s.seriesId, fromSeq: r.fromSeq, toSeq: r.toSeq, ...(preds.has(s.seriesId) ? { predecessor: preds.get(s.seriesId)! } : {}), entries: s.entries.filter((_, i) => seqs[i]! >= r.fromSeq && seqs[i]! <= r.toSeq) })
      covered.push({ seriesId: s.seriesId, ...r })
    }
  }
  // every statement and receipt whose window overlaps what is exported; trust roots from the request only
  const anchors = (req.anchors ?? []).filter((a) => covered.some((c) => c.seriesId === seriesOf(a.statement) && ((a.statement.fromSeq <= c.toSeq && c.fromSeq <= a.statement.toSeq) || (req.disclose !== "inclusions" && preds.has(c.seriesId) && a.statement.toSeq === c.fromSeq - 1)))) // plus the predecessor window of a range, to check `previous`
  const body = {
    format: "bridger-chain-bundle/v1" as const, createdAt: req.createdAt,
    series: req.series.map((s) => ({ seriesId: s.seriesId, canon: s.profile?.profile.canon ?? auditProfile.canon, profile: s.profile?.id ?? "audit", alg: s.alg ?? "sha-256", ...(s.continuesFrom ? { continuesFrom: s.continuesFrom } : {}) })),
    segments, ...(req.disclose === "inclusions" ? { inclusions } : {}),
    anchors, trustRoots: req.trustRoots, ...(req.expectedHeads ? { expectedHeads: req.expectedHeads } : {})
  }
  return { ...body, digest: digestOf(body) } as VerificationBundle
}

// ---- verification (BEH-AC-034..039) ----
export type BreakKind = "hash-mismatch" | "prev-mismatch" | "missing-link" | "link-record-mismatch" | "unsupported-version" | "key-unavailable" | "unkeyed-link" | "sink-marked" | "canon-changed" | "alg-changed" | "counter-decreased"
export type SeriesReport = {
  readonly sequence: { readonly gaps: readonly { readonly after: number; readonly before: number }[]; readonly duplicates: readonly number[]; readonly outOfOrder: readonly number[]; readonly problems: readonly { readonly kind: "gap" | "duplicate" | "out-of-order"; readonly seq: number }[] }
  readonly highestSeq: number; readonly linksCheckedThrough: number; readonly verifiedThrough: number
  readonly unanchoredTail: { readonly fromSeq: number; readonly toSeq: number } | undefined
  readonly head: "confirmed" | "head-unconfirmed" | "head-short" | "head-mismatch"
  readonly breaks: readonly { readonly seq: number; readonly kind: BreakKind; readonly marker?: string }[]
  readonly notices: readonly { readonly seq: number; readonly kind: "non-canonical-encoding" | "loss-counter-rose" }[] // loss-counter-rose = auditDropped rose
  readonly lossCounterUnanchored: readonly { readonly fromSeq: number; readonly toSeq: number; readonly statementHash: string }[] // confirmed version 1 statements anchor no loss counter
  readonly anchorMismatches: readonly { readonly statementHash: string; readonly kind: "root-mismatch" | "head-mismatch" | "window-not-in-entries" | "previous-mismatch" | "window-gap" }[]
}
export interface BundleReport {
  readonly format: "bridger-chain-bundle-report/v1"
  readonly bundleDigest: { readonly stated: string; readonly computed: string; readonly matches: boolean }
  readonly trustRoots: { readonly source: "pinned" | "bundle"; readonly fingerprints: readonly string[] }
  readonly receipts: readonly { readonly seriesId: string; readonly statementHash: string; readonly result: "confirmed-offline" | "not-checked" | "failed"; readonly reason?: string }[]
  readonly chain: Readonly<Record<string, SeriesReport>>
  readonly statedHeads: readonly { readonly seriesId: string; readonly seq: number; readonly hash?: string; readonly label: "stated by the bundle"; readonly source: string }[]
  readonly inclusions: readonly { readonly seriesId: string; readonly seq: number; readonly result: "included" | "not-included" | "not-checked" }[]
  readonly malformed: readonly { readonly path: string; readonly problem: string }[]
  readonly inconsistent: boolean // something was found inconsistent (kit "inconsistent" exit)
  readonly incomplete: boolean // nothing inconsistent, but a receipt, a keyed link or a bundle-stated head is unchecked (kit "incomplete" exit)
}
export interface VerifyOptions {
  readonly pinnedTrustRoots?: readonly TrustRoot[]
  readonly expectedHeads?: ReadonlyMap<string, { readonly seq: number; readonly hash?: string }>
  readonly profiles?: ReadonlyMap<string, ChainProfile<any>>
  readonly receiptVerifiers?: readonly OfflineReceiptVerifier[]
  readonly keyed?: (keyId: string, input: Uint8Array) => Uint8Array | undefined
  readonly expectKeyed?: boolean | ReadonlySet<string>
  /** `seriesId/seq` -> reason the sink recorded a break for (its own status or retry log). A link that lacks a marker the sink recorded was stripped (improvement report 06 S60). */
  readonly expectedBreaks?: ReadonlyMap<string, string>
}

const isObj = (x: unknown): x is Record<string, any> => typeof x === "object" && x !== null && !Array.isArray(x)
const num = (x: unknown): x is number => typeof x === "number" && Number.isInteger(x)

const verifySeries = (d: SeriesDescription, profile: ChainProfile<any>, entries: readonly ChainEntry[], opts: VerifyOptions, anchors: readonly { statement: AnchorStatement; hash: string }[], preds: ReadonlyMap<number, string>): SeriesReport => {
  const generic = !isAudit(d.profile); const v = generic ? 2 : 1
  const breaks: { seq: number; kind: BreakKind; marker?: string }[] = []
  const notices: { seq: number; kind: "non-canonical-encoding" | "loss-counter-rose" }[] = []
  const expectKeyed = opts.expectKeyed === true || (opts.expectKeyed instanceof Set && opts.expectKeyed.has(d.seriesId))
  const seen = new Set<number>(); let lastDropped: number | undefined
  let firstBad = Infinity; let prevLink: ChainLink | undefined; let prevSeq: number | undefined
  const hashAt = new Map<number, string>()
  const bad = (seq: number, kind: BreakKind, marker?: string) => { breaks.push({ seq, kind, ...(marker ? { marker } : {}) }); firstBad = Math.min(firstBad, seq) }
  entries.forEach((e) => {
    let seq = NaN
    try {
      const pos = profile.position(e.record); seq = pos.seq
      seen.add(seq)
      const l = e.link
      if (!isObj(l)) { bad(seq, "missing-link"); prevLink = undefined; prevSeq = seq; return }
      hashAt.set(seq, l.hash)
      if (l.break) bad(seq, "sink-marked", l.break.reason)
      else if (opts.expectedBreaks?.has(`${d.seriesId}/${seq}`)) bad(seq, "sink-marked", "stripped")   // the hash does not cover `break`, so the verifier cross-checks it
      if (l.schema === "unsupported") bad(seq, "unsupported-version")
      if (l.canonical === "jcs-escaped") notices.push({ seq, kind: "non-canonical-encoding" })
      if ((l.v === 2) !== generic) { bad(seq, "unsupported-version"); prevLink = l; prevSeq = seq; return }
      const idOk = generic ? l.seriesId === d.seriesId && l.seq === seq && l.recordId === pos.recordId : (e.record as any).hostId === d.seriesId && l.hostId === d.seriesId && l.auditSeq === seq && l.recordId === pos.recordId
      if (!idOk) bad(seq, "link-record-mismatch")
      if (l.alg !== d.alg) bad(seq, "alg-changed")
      if (generic && l.canon !== profile.canon) bad(seq, "canon-changed")
      const expectedPrev = prevLink && prevSeq !== undefined && seq === prevSeq + 1 ? prevLink.hash : seq === 1 ? (d.continuesFrom?.hash ?? genesis(d.alg, d.seriesId, v)) : preds.get(seq - 1)
      // a first entry above seq 1 with no segment predecessor naming seq - 1 has no predecessor to check against
      if (expectedPrev !== undefined && l.prevHash !== expectedPrev) bad(seq, "prev-mismatch")
      if (expectKeyed && !l.keyId) bad(seq, "unkeyed-link")
      const input = generic ? mac(d.alg, 2, l.prevHash, genericTail(profile, e.record)) : mac(d.alg, 1, l.prevHash, auditTail(e.record))
      if (l.keyId) {
        const k = opts.keyed?.(l.keyId, input)
        if (k === undefined) bad(seq, "key-unavailable")
        else if (Buffer.from(k).toString("hex") !== l.hash) bad(seq, "hash-mismatch")
      } else if (H(d.alg, input) !== l.hash) bad(seq, "hash-mismatch")
      const dr = profile.dropped?.(e.record)
      if (dr !== undefined) { if (lastDropped !== undefined && dr > lastDropped) notices.push({ seq, kind: "loss-counter-rose" }); if (lastDropped !== undefined && dr < lastDropped) bad(seq, "counter-decreased"); lastDropped = dr }
      prevLink = l; prevSeq = seq
    } catch { bad(Number.isNaN(seq) ? 0 : seq, "link-record-mismatch") }
  })
  // core's verifyAuditSequence (BEH-BR-215, BEH-AC-018), keyed on the series' seq; a generic profile reads the same numbering check.
  const seqs = [...seen].sort((a, b) => a - b); const first = seqs[0] ?? 0
  const rawSeq = (() => { try { return verifyAuditSequence(entries.map((e) => ({ auditSeq: profile.position(e.record).seq }))) } catch { return { gaps: [], duplicates: [], outOfOrder: [] } } })()
  // a bundle holds only the records it was exported with (BEH-AC-038): a start above 1 is the exported range, not a gap
  const gaps = rawSeq.gaps.filter((g) => !(g.after === 0 && g.before === first))
  const problems = [...gaps.map((g) => ({ kind: "gap" as const, seq: g.before })), ...rawSeq.duplicates.map((seq) => ({ kind: "duplicate" as const, seq })), ...rawSeq.outOfOrder.map((seq) => ({ kind: "out-of-order" as const, seq }))]
  const highestSeq = seqs[seqs.length - 1] ?? 0
  // the cap is the number before the first gap, duplicate, disorder or break (BEH-AC-018, 019)
  const firstProblem = Math.min(firstBad, ...gaps.map((g) => g.after + 1), ...rawSeq.duplicates, ...rawSeq.outOfOrder)
  // shortcut: linksCheckedThrough counts from the first entry present (partial ranges allowed), when a range must prove it starts at 1.
  const linksCheckedThrough = seqs.length === 0 ? 0 : Math.min(highestSeq, firstProblem - 1)
  const lossCounterUnanchored = anchors.filter((x) => x.statement.v === 1).map((x) => ({ fromSeq: x.statement.fromSeq, toSeq: x.statement.toSeq, statementHash: x.hash })).sort((a, b) => a.fromSeq - b.fromSeq)
  const mism: SeriesReport["anchorMismatches"][number][] = []
  let verifiedThrough = 0; let chainOk = true
  // the statement just before the range, when the bundle carries it, is what the first window's `previous` must name
  let prevStatement: string | undefined = anchors.find((x) => x.statement.toSeq === first - 1 && first > 1)?.hash
  for (const { statement: s, hash } of [...anchors].filter((x) => x.statement.toSeq >= first).sort((a, b) => a.statement.fromSeq - b.statement.fromSeq)) {
    const win: string[] = []; for (let q = s.fromSeq; q <= s.toSeq; q++) { const h = hashAt.get(q); if (h === undefined) break; win.push(h) }
    if (win.length !== s.toSeq - s.fromSeq + 1 || win.length === 0) { mism.push({ statementHash: hash, kind: "window-not-in-entries" }); chainOk = false; continue }
    if (merkleRoot(s.alg, v, win) !== s.merkleRoot) { mism.push({ statementHash: hash, kind: "root-mismatch" }); chainOk = false; continue }
    if (s.headHash !== win[win.length - 1]) { mism.push({ statementHash: hash, kind: "head-mismatch" }); chainOk = false; continue }
    if (!chainOk) continue
    if (verifiedThrough > 0 ? s.fromSeq !== verifiedThrough + 1 : s.fromSeq !== first) { mism.push({ statementHash: hash, kind: "window-gap" }); chainOk = false; continue }
    if (prevStatement !== undefined && s.previous !== prevStatement) { mism.push({ statementHash: hash, kind: "previous-mismatch" }); chainOk = false; continue }
    if (s.toSeq <= linksCheckedThrough) { verifiedThrough = s.toSeq; prevStatement = hash } else chainOk = false
  }
  const exp = opts.expectedHeads?.get(d.seriesId)
  const head: SeriesReport["head"] = !exp ? "head-unconfirmed" : highestSeq < exp.seq ? "head-short" : exp.hash !== undefined && hashAt.get(exp.seq) !== exp.hash ? "head-mismatch" : "confirmed"
  return {
    sequence: { gaps, duplicates: rawSeq.duplicates, outOfOrder: rawSeq.outOfOrder, problems }, highestSeq, linksCheckedThrough, verifiedThrough,
    unanchoredTail: highestSeq > verifiedThrough ? { fromSeq: Math.max(verifiedThrough + 1, first), toSeq: highestSeq } : undefined,
    head, breaks, notices, lossCounterUnanchored, anchorMismatches: mism
  }
}

/** Pure, total, offline. A malformed bundle yields `malformed` entries and the well-formed rest is still checked. */
export const verifyBundle = (bundle: unknown, options: VerifyOptions = {}): BundleReport => {
  const malformed: { path: string; problem: string }[] = []
  const b: Record<string, any> = isObj(bundle) ? bundle : {}
  if (!isObj(bundle)) malformed.push({ path: "$", problem: "not-an-object" })
  if (b.format !== "bridger-chain-bundle/v1") malformed.push({ path: "format", problem: "unknown-format" })
  const arr = (k: string): any[] => { if (Array.isArray(b[k])) return b[k]; if (isObj(bundle) && k !== "expectedHeads") malformed.push({ path: k, problem: "not-an-array" }); return [] }
  const series = arr("series"); const segments = arr("segments"); const anchors = arr("anchors"); const carriedRoots = arr("trustRoots")
  const carriedHeads: any[] = Array.isArray(b.expectedHeads) ? b.expectedHeads : []
  let computed = ""; try { computed = digestOf(b) } catch { malformed.push({ path: "$", problem: "not-canonicalisable" }) }
  const bundleDigest = { stated: typeof b.digest === "string" ? b.digest : "", computed, matches: typeof b.digest === "string" && b.digest === computed }

  const roots = (options.pinnedTrustRoots ?? carriedRoots).filter(isObj) as TrustRoot[]
  const trustRoots = { source: options.pinnedTrustRoots ? ("pinned" as const) : ("bundle" as const), fingerprints: roots.map((r) => { try { return H("sha-256", jcs(r)) } catch { return "unfingerprintable" } }) }

  const receipts: BundleReport["receipts"][number][] = []
  const confirmed = new Map<string, { statement: AnchorStatement; hash: string }[]>()
  anchors.forEach((a, i) => {
    const sid = isObj(a) && isObj(a.statement) ? (a.statement.v === 1 ? a.statement.hostId : a.statement.seriesId) : undefined
    if (!isObj(a) || !isObj(a.statement) || !isObj(a.receipt) || typeof sid !== "string" || (a.statement.alg !== "sha-256" && a.statement.alg !== "sha-512") || typeof a.statement.merkleRoot !== "string" || typeof a.statement.headHash !== "string" || !num(a.statement.fromSeq) || !num(a.statement.toSeq)) { malformed.push({ path: `anchors[${i}]`, problem: "bad-anchor" }); return }
    const st = a.statement as AnchorStatement; const rc = a.receipt as AnchorReceipt
    let hash: string; try { hash = statementHash(st) } catch { malformed.push({ path: `anchors[${i}]`, problem: "bad-anchor" }); return }
    const row = (result: "confirmed-offline" | "not-checked" | "failed", reason?: string) => { receipts.push({ seriesId: sid, statementHash: hash, result, ...(reason ? { reason } : {}) }); if (result === "confirmed-offline") confirmed.set(sid, [...(confirmed.get(sid) ?? []), { statement: st, hash }]) }
    if (rc.statementHash !== hash) return row("failed", "statement-hash-mismatch")
    if (typeof rc.anchor !== "string" || rc.anchor.startsWith("testing:")) return row("not-checked", "testing-receipt")
    const verifier = options.receiptVerifiers?.find((x) => rc.anchor === x.anchorKind || rc.anchor.startsWith(x.anchorKind + ":"))
    if (!verifier) return row("not-checked", "no-verifier")
    const mine = roots.filter((r) => r.anchor === rc.anchor || rc.anchor.startsWith(r.anchor + ":"))
    if (mine.length === 0) return row("not-checked", "no-trust-root")
    try {
      const r = verifier.confirm(st, hash, rc, mine)
      if (r._tag === "Confirmed") row("confirmed-offline", r.by); else if (r._tag === "Failed") row("failed", r.reason); else row("not-checked", "needs-online-check")
    } catch { row("failed", "verifier-threw") }
  })

  const chain: Record<string, SeriesReport> = {}
  const disclosed: any[] = Array.isArray(b.inclusions) ? b.inclusions : []
  const inclusions: BundleReport["inclusions"][number][] = []
  series.forEach((d, i) => {
    if (!isObj(d) || typeof d.seriesId !== "string" || typeof d.profile !== "string" || (d.alg !== "sha-256" && d.alg !== "sha-512")) { malformed.push({ path: `series[${i}]`, problem: "bad-series" }); return }
    const profile = isAudit(d.profile) ? auditProfile : options.profiles?.get(d.profile)
    if (!profile) { malformed.push({ path: `series[${i}]`, problem: "unknown-profile" }); return }
    const entries: ChainEntry[] = []; const preds = new Map<number, string>()
    const segs = segments.map((s, j) => ({ s, j })).filter(({ s }) => isObj(s) && s.seriesId === d.seriesId).sort((x, y) => (x.s.fromSeq ?? 0) - (y.s.fromSeq ?? 0))
    for (const { s, j } of segs) {
      if (isObj(s.predecessor) && num(s.predecessor.seq) && typeof s.predecessor.hash === "string") preds.set(s.predecessor.seq, s.predecessor.hash)
      if (!Array.isArray(s.entries)) { malformed.push({ path: `segments[${j}].entries`, problem: "not-an-array" }); continue }
      s.entries.forEach((e: unknown, k: number) => { if (isObj(e) && "record" in e) entries.push(e as ChainEntry); else malformed.push({ path: `segments[${j}].entries[${k}]`, problem: "bad-entry" }) })
    }
    // BEH-AC-034: heads stated by the bundle are never used to confirm, only listed in statedHeads (05 Open 3: carried heads are not signed).
    const disclosedOnly = entries.length === 0 && disclosed.some((x) => isObj(x) && x.hostId === d.seriesId)
    // a series disclosed only through inclusion proofs has no segment to check; its statements are checked by those proofs
    if (!disclosedOnly) chain[d.seriesId] = verifySeries(d as SeriesDescription, profile, entries, options, confirmed.get(d.seriesId) ?? [], preds)
  })
  disclosed.forEach((x, i) => {
    if (!isObj(x) || typeof x.hostId !== "string" || !num(x.auditSeq) || !isObj(x.link) || typeof x.statementHash !== "string" || !Array.isArray(x.path) || !("record" in x)) { malformed.push({ path: `inclusions[${i}]`, problem: "bad-inclusion" }); return }
    const d = series.find((q) => isObj(q) && q.seriesId === x.hostId)
    const profile = d && (isAudit(d.profile) ? auditProfile : options.profiles?.get(d.profile))
    const st = (confirmed.get(x.hostId) ?? []).find((c) => c.hash === x.statementHash)?.statement
    const result = !profile ? "not-checked" : !st ? "not-checked" : verifyInclusion(x.record, x as InclusionProof, st, profile, options.keyed) ? "included" : "not-included"
    inclusions.push({ seriesId: x.hostId, seq: x.auditSeq, result })
  })
  const statedHeads = carriedHeads.filter((h) => isObj(h) && typeof h.seriesId === "string" && num(h.seq)).map((h) => ({ seriesId: h.seriesId as string, seq: h.seq as number, ...(typeof h.hash === "string" ? { hash: h.hash } : {}), label: "stated by the bundle" as const, source: String(h.source ?? "") }))

  const all = Object.values(chain)
  const keyUnavail = all.some((c) => c.breaks.some((x) => x.kind === "key-unavailable"))
  const inconsistent = !bundleDigest.matches || inclusions.some((i) => i.result === "not-included") || receipts.some((r) => r.result === "failed") ||
    malformed.some((m) => m.problem !== "unknown-profile") ||
    all.some((c) => c.breaks.some((x) => x.kind !== "key-unavailable") || c.sequence.problems.length > 0 || c.anchorMismatches.length > 0 || c.head === "head-short" || c.head === "head-mismatch")
  const incomplete = !inconsistent && (inclusions.some((i) => i.result === "not-checked") || receipts.some((r) => r.result === "not-checked") || keyUnavail || malformed.some((m) => m.problem === "unknown-profile") || (statedHeads.length > 0 && all.some((c) => c.head === "head-unconfirmed")))
  return { format: "bridger-chain-bundle-report/v1", bundleDigest, trustRoots, receipts, chain, statedHeads, inclusions, malformed, inconsistent, incomplete }
}

/** The lines `bridger verify-chain` prints (BEH-AC-022, 035, 038, 039): no overall verdict, every bound beside its claim. */
export const renderReport = (r: BundleReport): string[] => {
  const out: string[] = [`bundle digest ${r.bundleDigest.matches ? "matches" : "DOES NOT MATCH"} (detects accidental corruption only; anyone who edits a bundle can recompute it)`]
  for (const [id, c] of Object.entries(r.chain)) {
    out.push(`series ${id}: links consistent through ${c.linksCheckedThrough}; anchored through ${c.verifiedThrough} (verifiedThrough ${c.verifiedThrough})`)
    out.push(c.unanchoredTail ? `  records ${c.unanchoredTail.fromSeq}-${c.unanchoredTail.toSeq} covered by the chain alone` : "  no unanchored tail")
    out.push(`  head: ${c.head}${c.head === "head-unconfirmed" ? " (heads stated by the bundle confirm nothing)" : ""}`)
    for (const p of c.sequence.problems) out.push(`  sequence ${p.kind} at ${p.seq}`)
    for (const x of c.breaks) out.push(`  break ${x.kind} at ${x.seq}${x.marker ? ` (${x.marker})` : ""}${x.kind === "key-unavailable" ? " (not checked: incomplete)" : ""}`)
    for (const x of c.notices) out.push(`  notice ${x.kind} at ${x.seq}`)
    for (const x of c.anchorMismatches) out.push(`  anchor mismatch ${x.kind} for ${x.statementHash}`)
  }
  const n = (k: string) => r.receipts.filter((x) => x.result === k).length
  out.push(`receipts: ${n("confirmed-offline")} confirmed offline, ${n("not-checked")} not checked, ${n("failed")} failed`)
  for (const x of r.receipts.filter((y) => y.result !== "confirmed-offline")) out.push(`  ${x.result} ${x.statementHash}${x.reason ? ` (${x.reason})` : ""}`)
  for (const h of r.statedHeads) out.push(`head for ${h.seriesId}: ${h.seq}${h.hash ? ` ${h.hash}` : ""}, ${h.label} (source "${h.source}")`)
  out.push(`trust roots: ${r.trustRoots.source}; fingerprints ${r.trustRoots.fingerprints.join(", ") || "none"}`)
  if (r.trustRoots.source === "bundle") out.push("  the roots were supplied by the party that produced the bundle; a producer able to forge receipts could supply matching roots; compare the fingerprints with roots obtained independently")
  for (const m of r.malformed) out.push(`malformed ${m.path}: ${m.problem}`)
  out.push("a keyed chain can be recomputed only by a holder of the key", "this report covers only the records in the bundle; records it does not contain are not checked")
  return out
}

// ---------------------------------------------------------------- ChainGate (BEH-AC-013, BEH-AC-013)
export interface ChainStatus {
  readonly head: { readonly auditSeq: number; readonly hash: string }
  readonly lastAnchored?: { readonly toSeq: number; readonly statementHash: string; readonly at: string }
  readonly unanchored: { readonly records: number; readonly oldest?: string }
  readonly chainBreaks: number
}
export interface ChainStatusView { readonly current: Effect.Effect<ChainStatus> }
export class ChainGateConfig extends Error { constructor(message: string) { super(message); this.name = "ChainGateConfig" } }

/**
 * A gate piece that refuses operator calls while the trail is too far behind its anchors (BEH-AC-013), and, with `anchorBeforeIrreversible`,
 * refuses a call whose request carries `reversibility: "irreversible"` (core BEH-BR-327) until every record so far is anchored (BEH-AC-013).
 * It reads only the status and the clock, never returns `Defer`, and never touches the write path (INV-AC-005): the caller retries once
 * the next anchor has published.
 */
export const ChainGate = {
  make: (status: ChainStatusView, options: {
    readonly maxUnanchoredRecords?: number
    readonly maxUnanchoredAgeMs?: number
    readonly refuseOnBreak?: boolean
    readonly anchorBeforeIrreversible?: boolean
    readonly allow: ReadonlyArray<string>
    /** The sink's `anchorEvery`, for the configuration check of BEH-AC-013. */
    readonly anchorEvery?: { readonly records?: number; readonly intervalMs?: number }
  }): Gate<OperationRequest> => {
    const refuseOnBreak = options.refuseOnBreak ?? true
    const limits = options.maxUnanchoredRecords !== undefined || options.maxUnanchoredAgeMs !== undefined
    if (!limits && !refuseOnBreak && !options.anchorBeforeIrreversible) throw new ChainGateConfig("ChainGate: no limit, no chain-break refusal and no irreversible rule")
    if (options.maxUnanchoredRecords !== undefined && options.anchorEvery?.records !== undefined && options.maxUnanchoredRecords <= options.anchorEvery.records) throw new ChainGateConfig("ChainGate: maxUnanchoredRecords must exceed anchorEvery.records")
    if (options.maxUnanchoredAgeMs !== undefined && options.anchorEvery?.intervalMs !== undefined && options.maxUnanchoredAgeMs <= options.anchorEvery.intervalMs) throw new ChainGateConfig("ChainGate: maxUnanchoredAge must exceed anchorEvery.interval")
    return {
      decide: (request) => Effect.gen(function* () {
        if (options.allow.includes(request.operation)) return { _tag: "Allow" } as const
        const s = yield* status.current
        const now = yield* Clock.currentTimeMillis
        const overdue = (options.maxUnanchoredRecords !== undefined && s.unanchored.records > options.maxUnanchoredRecords)
          || (options.maxUnanchoredAgeMs !== undefined && s.unanchored.oldest !== undefined && now - Date.parse(s.unanchored.oldest) > options.maxUnanchoredAgeMs)
        if (overdue) return { _tag: "Refuse", reason: "anchor-overdue" } as const
        if (refuseOnBreak && s.chainBreaks > 0) return { _tag: "Refuse", reason: "chain-break" } as const
        if (options.anchorBeforeIrreversible && request.reversibility === "irreversible" && s.unanchored.records > 0) return { _tag: "Refuse", reason: "anchor-behind" } as const
        return { _tag: "Allow" } as const
      })
    }
  }
}
