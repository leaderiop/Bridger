// Audit-chain companion, offline half (references/audit-chain 01 BEH-AC-003, 03 BEH-AC-017..019/022, 04 BEH-AC-026/031, 05 BEH-AC-033..040).
// Pure, synchronous, no Effect, no clock: `createdAt` is passed in by the caller. `bridger verify-chain` (kit BEH-KT-047) calls verifyBundle and prints renderReport.
import { createHash } from "node:crypto"

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
export type AnchorStatement = { readonly seriesId: string; readonly fromSeq: number; readonly toSeq: number; readonly head: string; readonly previous?: string; readonly [k: string]: unknown }
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
  readonly segments: readonly { readonly seriesId: string; readonly fromSeq: number; readonly toSeq: number; readonly entries: readonly ChainEntry[] }[]
  readonly anchors: readonly { readonly statement: AnchorStatement; readonly receipt: AnchorReceipt }[]
  readonly trustRoots: readonly TrustRoot[]
  readonly expectedHeads?: readonly { readonly seriesId: string; readonly seq: number; readonly hash?: string; readonly source: string }[]
  readonly digest: string
}
// shortcut: no `inclusions` (selective disclosure) and no Merkle root in statements (matched by head hash), when 02/BEH-AC-021 land.

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
const genericTail = (p: ChainProfile<any>, r: unknown) => { const pos = p.position(r); return Buffer.concat([utf8(`${p.canon}\n${pos.seq}\n${pos.recordId}\n`), p.encode(r)]) }
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

// ---- bundle export and digest (BEH-AC-033, BEH-AC-037) ----
const digestOf = (b: object): string => { const { digest: _d, ...rest } = b as Record<string, unknown>; return "sha256:" + H("sha-256", D("sha-256", 1), "bundle\n", jcs(rest)) }
export const statementHash = (s: AnchorStatement): string => H("sha-256", D("sha-256", 1), "statement\n", jcs(s))
const seqOf = (e: ChainEntry, profile?: ChainProfile<any>): number => (profile ?? auditProfile).position(e.record).seq

/** Copy stored entries as given (breaks, missing links and gaps included); no verification. */
export const exportBundle = (req: {
  readonly createdAt: string
  readonly series: readonly (Omit<SeriesDescription, "canon" | "profile" | "alg"> & { readonly entries: readonly ChainEntry[]; readonly profile?: { readonly id: string; readonly profile: ChainProfile<any> }; readonly alg?: Alg })[]
  readonly anchors?: VerificationBundle["anchors"]
  readonly trustRoots: readonly TrustRoot[]
  readonly expectedHeads?: VerificationBundle["expectedHeads"]
}): VerificationBundle => {
  // shortcut: one segment per series, whole series only (no range, no BundleExportFailed), when a ChainReader store exists.
  const body = {
    format: "bridger-chain-bundle/v1" as const, createdAt: req.createdAt,
    series: req.series.map((s) => ({ seriesId: s.seriesId, canon: s.profile?.profile.canon ?? auditProfile.canon, profile: s.profile?.id ?? "audit", alg: s.alg ?? "sha-256", ...(s.continuesFrom ? { continuesFrom: s.continuesFrom } : {}) })),
    segments: req.series.map((s) => {
      const seqs = s.entries.map((e) => seqOf(e, s.profile?.profile))
      return { seriesId: s.seriesId, fromSeq: Math.min(...seqs), toSeq: Math.max(...seqs), entries: s.entries }
    }),
    anchors: req.anchors ?? [], trustRoots: req.trustRoots, ...(req.expectedHeads ? { expectedHeads: req.expectedHeads } : {})
  }
  return { ...body, digest: digestOf(body) } as VerificationBundle
}

// ---- verification (BEH-AC-034..039) ----
export type BreakKind = "hash-mismatch" | "prev-mismatch" | "missing-link" | "link-record-mismatch" | "unsupported-version" | "key-unavailable" | "unkeyed-link" | "sink-marked" | "canon-changed" | "alg-changed" | "counter-decreased"
export type SeriesReport = {
  readonly sequence: { readonly problems: readonly { readonly kind: "gap" | "duplicate" | "out-of-order"; readonly seq: number }[] }
  readonly highestSeq: number; readonly linksCheckedThrough: number; readonly verifiedThrough: number
  readonly unanchoredTail: { readonly fromSeq: number; readonly toSeq: number } | undefined
  readonly head: "confirmed" | "head-unconfirmed" | "head-short" | "head-mismatch"
  readonly breaks: readonly { readonly seq: number; readonly kind: BreakKind; readonly marker?: string }[]
  readonly notices: readonly { readonly seq: number; readonly kind: "non-canonical-encoding" | "loss-counter-rose" }[] // loss-counter-rose = auditDropped rose
  readonly anchorMismatches: readonly { readonly statementHash: string; readonly kind: "head-mismatch" | "window-not-in-entries" | "previous-mismatch" | "window-gap" }[]
}
export interface BundleReport {
  readonly format: "bridger-chain-bundle-report/v1"
  readonly bundleDigest: { readonly stated: string; readonly computed: string; readonly matches: boolean }
  readonly trustRoots: { readonly source: "pinned" | "bundle"; readonly fingerprints: readonly string[] }
  readonly receipts: readonly { readonly seriesId: string; readonly statementHash: string; readonly result: "confirmed-offline" | "not-checked" | "failed"; readonly reason?: string }[]
  readonly chain: Readonly<Record<string, SeriesReport>>
  readonly statedHeads: readonly { readonly seriesId: string; readonly seq: number; readonly hash?: string; readonly label: "stated by the bundle"; readonly source: string }[]
  readonly inclusions: readonly []
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
}

const isObj = (x: unknown): x is Record<string, any> => typeof x === "object" && x !== null && !Array.isArray(x)
const num = (x: unknown): x is number => typeof x === "number" && Number.isInteger(x)

const verifySeries = (d: SeriesDescription, profile: ChainProfile<any>, entries: readonly ChainEntry[], opts: VerifyOptions, anchors: readonly { statement: AnchorStatement; hash: string }[], bundleHead: boolean): SeriesReport => {
  const generic = !isAudit(d.profile); const v = generic ? 2 : 1
  const breaks: { seq: number; kind: BreakKind; marker?: string }[] = []
  const notices: { seq: number; kind: "non-canonical-encoding" | "loss-counter-rose" }[] = []
  const problems: { kind: "gap" | "duplicate" | "out-of-order"; seq: number }[] = []
  const expectKeyed = opts.expectKeyed === true || (opts.expectKeyed instanceof Set && opts.expectKeyed.has(d.seriesId))
  const seen = new Set<number>(); let lastSeq: number | undefined; let lastDropped: number | undefined
  let firstBad = Infinity; let prevLink: ChainLink | undefined; let prevSeq: number | undefined
  const hashAt = new Map<number, string>()
  const bad = (seq: number, kind: BreakKind, marker?: string) => { breaks.push({ seq, kind, ...(marker ? { marker } : {}) }); firstBad = Math.min(firstBad, seq) }
  entries.forEach((e) => {
    let seq = NaN
    try {
      const pos = profile.position(e.record); seq = pos.seq
      if (seen.has(seq)) problems.push({ kind: "duplicate", seq })
      else if (lastSeq !== undefined && seq < lastSeq) problems.push({ kind: "out-of-order", seq })
      else if (lastSeq !== undefined && seq > lastSeq + 1) problems.push({ kind: "gap", seq })
      seen.add(seq); lastSeq = lastSeq === undefined ? seq : Math.max(lastSeq, seq)
      const l = e.link
      if (!isObj(l)) { bad(seq, "missing-link"); prevLink = undefined; prevSeq = seq; return }
      hashAt.set(seq, l.hash)
      if (l.break) bad(seq, "sink-marked", l.break.reason)
      if (l.schema === "unsupported") bad(seq, "unsupported-version")
      if (l.canonical === "jcs-escaped") notices.push({ seq, kind: "non-canonical-encoding" })
      if ((l.v === 2) !== generic) { bad(seq, "unsupported-version"); prevLink = l; prevSeq = seq; return }
      const idOk = generic ? l.seriesId === d.seriesId && l.seq === seq && l.recordId === pos.recordId : (e.record as any).hostId === d.seriesId && l.hostId === d.seriesId && l.auditSeq === seq && l.recordId === pos.recordId
      if (!idOk) bad(seq, "link-record-mismatch")
      if (l.alg !== d.alg) bad(seq, "alg-changed")
      if (generic && l.canon !== profile.canon) bad(seq, "canon-changed")
      const expectedPrev = prevLink && prevSeq !== undefined && seq === prevSeq + 1 ? prevLink.hash : seq === 1 ? (d.continuesFrom?.hash ?? genesis(d.alg, d.seriesId, v)) : undefined
      // shortcut: first entry of a partial range is not prev-checked (no predecessor in the bundle), when exports carry the predecessor hash.
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
  const seqs = [...seen].sort((a, b) => a - b); const first = seqs[0] ?? 0; const highestSeq = seqs[seqs.length - 1] ?? 0
  const firstProblem = Math.min(firstBad, ...problems.map((p) => p.seq))
  // shortcut: linksCheckedThrough counts from the first entry present (partial ranges allowed), when a range must prove it starts at 1.
  const linksCheckedThrough = seqs.length === 0 ? 0 : Math.min(highestSeq, firstProblem - 1)
  const mism: SeriesReport["anchorMismatches"][number][] = []
  let verifiedThrough = 0; let chainOk = true; let prevStatement: string | undefined
  for (const { statement: s, hash } of [...anchors].sort((a, b) => a.statement.fromSeq - b.statement.fromSeq)) {
    if (!seen.has(s.toSeq) || !seen.has(s.fromSeq)) { mism.push({ statementHash: hash, kind: "window-not-in-entries" }); chainOk = false; continue }
    if (hashAt.get(s.toSeq) !== s.head) { mism.push({ statementHash: hash, kind: "head-mismatch" }); chainOk = false; continue }
    if (!chainOk) continue
    if (verifiedThrough > 0 ? s.fromSeq !== verifiedThrough + 1 : s.fromSeq !== first) { mism.push({ statementHash: hash, kind: "window-gap" }); chainOk = false; continue }
    if (prevStatement !== undefined && s.previous !== prevStatement) { mism.push({ statementHash: hash, kind: "previous-mismatch" }); chainOk = false; continue }
    if (s.toSeq <= linksCheckedThrough) { verifiedThrough = s.toSeq; prevStatement = hash } else chainOk = false
  }
  const exp = opts.expectedHeads?.get(d.seriesId)
  const head: SeriesReport["head"] = !exp ? "head-unconfirmed" : highestSeq < exp.seq ? "head-short" : exp.hash !== undefined && hashAt.get(exp.seq) !== exp.hash ? "head-mismatch" : "confirmed"
  void bundleHead
  return {
    sequence: { problems }, highestSeq, linksCheckedThrough, verifiedThrough,
    unanchoredTail: highestSeq > verifiedThrough ? { fromSeq: Math.max(verifiedThrough + 1, first), toSeq: highestSeq } : undefined,
    head, breaks, notices, anchorMismatches: mism
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
    if (!isObj(a) || !isObj(a.statement) || !isObj(a.receipt) || typeof a.statement.seriesId !== "string" || !num(a.statement.fromSeq) || !num(a.statement.toSeq)) { malformed.push({ path: `anchors[${i}]`, problem: "bad-anchor" }); return }
    const st = a.statement as AnchorStatement; const rc = a.receipt as AnchorReceipt
    let hash: string; try { hash = statementHash(st) } catch { malformed.push({ path: `anchors[${i}]`, problem: "bad-anchor" }); return }
    const row = (result: "confirmed-offline" | "not-checked" | "failed", reason?: string) => { receipts.push({ seriesId: st.seriesId, statementHash: hash, result, ...(reason ? { reason } : {}) }); if (result === "confirmed-offline") confirmed.set(st.seriesId, [...(confirmed.get(st.seriesId) ?? []), { statement: st, hash }]) }
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
  series.forEach((d, i) => {
    if (!isObj(d) || typeof d.seriesId !== "string" || typeof d.profile !== "string" || (d.alg !== "sha-256" && d.alg !== "sha-512")) { malformed.push({ path: `series[${i}]`, problem: "bad-series" }); return }
    const profile = isAudit(d.profile) ? auditProfile : options.profiles?.get(d.profile)
    if (!profile) { malformed.push({ path: `series[${i}]`, problem: "unknown-profile" }); return }
    const entries: ChainEntry[] = []
    const segs = segments.map((s, j) => ({ s, j })).filter(({ s }) => isObj(s) && s.seriesId === d.seriesId).sort((x, y) => (x.s.fromSeq ?? 0) - (y.s.fromSeq ?? 0))
    for (const { s, j } of segs) {
      if (!Array.isArray(s.entries)) { malformed.push({ path: `segments[${j}].entries`, problem: "not-an-array" }); continue }
      s.entries.forEach((e: unknown, k: number) => { if (isObj(e) && "record" in e) entries.push(e as ChainEntry); else malformed.push({ path: `segments[${j}].entries[${k}]`, problem: "bad-entry" }) })
    }
    // shortcut: heads stated by the bundle are never used to confirm, only listed in statedHeads, until carried heads are signed (05 Open 3).
    chain[d.seriesId] = verifySeries(d as SeriesDescription, profile, entries, options, confirmed.get(d.seriesId) ?? [], false)
  })
  const statedHeads = carriedHeads.filter((h) => isObj(h) && typeof h.seriesId === "string" && num(h.seq)).map((h) => ({ seriesId: h.seriesId as string, seq: h.seq as number, ...(typeof h.hash === "string" ? { hash: h.hash } : {}), label: "stated by the bundle" as const, source: String(h.source ?? "") }))

  const all = Object.values(chain)
  const keyUnavail = all.some((c) => c.breaks.some((x) => x.kind === "key-unavailable"))
  const inconsistent = !bundleDigest.matches || receipts.some((r) => r.result === "failed") ||
    malformed.some((m) => m.problem !== "unknown-profile") ||
    all.some((c) => c.breaks.some((x) => x.kind !== "key-unavailable") || c.sequence.problems.length > 0 || c.anchorMismatches.length > 0 || c.head === "head-short" || c.head === "head-mismatch")
  const incomplete = !inconsistent && (receipts.some((r) => r.result === "not-checked") || keyUnavail || malformed.some((m) => m.problem === "unknown-profile") || (statedHeads.length > 0 && all.some((c) => c.head === "head-unconfirmed")))
  return { format: "bridger-chain-bundle-report/v1", bundleDigest, trustRoots, receipts, chain, statedHeads, inclusions: [], malformed, inconsistent, incomplete }
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
