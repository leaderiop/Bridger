import { createHmac } from "node:crypto"
import { describe, expect, it } from "vitest"
import { BundleExportFailed, chainEntries, exportBundle, jcs, makeStatement, merkleRoot, proveInclusion, renderReport, statementHash, verifyBundle, verifyInclusion, type AnchorStatement, type ChainEntry, type OfflineReceiptVerifier, type TrustRoot } from "../src/audit-chain.js"

const rec = (n: number) => ({ hostId: "h1", auditSeq: n, recordId: `r${n}`, kind: "x", auditDropped: 0 })
const entries = () => chainEntries({ seriesId: "h1", records: [1, 2, 3, 4].map(rec) })
const root: TrustRoot = { kind: "anchor-key", anchor: "log", publicKey: "k" }
const mk = (e: ChainEntry[] = entries(), extra: object = {}) =>
  exportBundle({ createdAt: "2026-01-01T00:00:00.000Z", series: [{ seriesId: "h1", entries: e }], trustRoots: [root], ...extra })
const stmt = (e: ChainEntry[], from: number, to: number, previous?: string): AnchorStatement => makeStatement({ seriesId: "h1", entries: e, fromSeq: from, toSeq: to, createdAt: "2026-01-01T00:00:00.000Z", ...(previous ? { previous } : {}) })
const yes: OfflineReceiptVerifier = { anchorKind: "log", confirm: () => ({ _tag: "Confirmed", by: "test" }) }
const online: OfflineReceiptVerifier = { anchorKind: "log", confirm: () => ({ _tag: "NeedsOnline" }) }
const withAnchor = (v: OfflineReceiptVerifier | undefined, to = 2) => {
  const e = entries(); const s = stmt(e, 1, to)
  return { b: mk(e, { anchors: [{ statement: s, receipt: { anchor: "log", statementHash: statementHash(s) } }] }), v }
}

describe("audit-chain offline verification", () => {
  it("valid bundle: links through 4, no flags, no overall verdict field", () => {
    const r = verifyBundle(mk())
    expect(r.chain.h1).toMatchObject({ linksCheckedThrough: 4, verifiedThrough: 0, head: "head-unconfirmed", breaks: [] })
    expect(r.inconsistent).toBe(false); expect(r.incomplete).toBe(false)
    expect(r).not.toHaveProperty("valid"); expect(renderReport(r).join("\n")).toContain("supplied by the party that produced the bundle")
  })
  it("anchors confirmed offline set verifiedThrough", () => {
    const { b, v } = withAnchor(yes)
    const r = verifyBundle(b, { receiptVerifiers: [v!] })
    expect(r.receipts[0]!.result).toBe("confirmed-offline"); expect(r.chain.h1!.verifiedThrough).toBe(2)
    expect(r.chain.h1!.unanchoredTail).toEqual({ fromSeq: 3, toSeq: 4 })
  })
  it("a tampered record is detected at its seq", () => {
    const e = entries(); const t = [e[0]!, { ...e[1]!, record: { ...(e[1]!.record as object), kind: "evil" } }, e[2]!, e[3]!]
    const r = verifyBundle(mk(t))
    expect(r.chain.h1!.breaks.map((x) => [x.seq, x.kind])).toContainEqual([2, "hash-mismatch"]); expect(r.chain.h1!.linksCheckedThrough).toBe(1); expect(r.inconsistent).toBe(true)
  })
  it("a broken link names the seq", () => {
    const e = entries(); const t = [e[0]!, e[1]!, { ...e[2]!, link: { ...e[2]!.link!, prevHash: "00".repeat(32) } }, e[3]!]
    expect(verifyBundle(mk(t)).chain.h1!.breaks).toContainEqual(expect.objectContaining({ seq: 3, kind: "prev-mismatch" }))
  })
  it("digest mismatch is reported and the rest still checked", () => {
    const r = verifyBundle({ ...mk(), createdAt: "2027-01-01T00:00:00.000Z" })
    expect(r.bundleDigest.matches).toBe(false); expect(r.chain.h1!.linksCheckedThrough).toBe(4); expect(r.inconsistent).toBe(true)
  })
  it("pinned roots replace carried ones; fingerprints reported", () => {
    const pin: TrustRoot = { kind: "anchor-key", anchor: "log", publicKey: "other" }
    const a = verifyBundle(mk()); const p = verifyBundle(mk(), { pinnedTrustRoots: [pin] })
    expect(a.trustRoots.source).toBe("bundle"); expect(p.trustRoots.source).toBe("pinned")
    expect(p.trustRoots.fingerprints).not.toEqual(a.trustRoots.fingerprints)
    const { b } = withAnchor(yes)
    expect(verifyBundle(b, { receiptVerifiers: [yes], pinnedTrustRoots: [{ kind: "x", anchor: "else" }] }).receipts[0]).toMatchObject({ result: "not-checked", reason: "no-trust-root" })
  })
  it("expected head: bundle-stated is unconfirmed, caller's confirms, mismatch and short are caught", () => {
    const e = entries()
    const stated = verifyBundle(mk(e, { expectedHeads: [{ seriesId: "h1", seq: 4, hash: e[3]!.link!.hash, source: "log" }] }))
    expect(stated.chain.h1!.head).toBe("head-unconfirmed"); expect(stated.statedHeads[0]!.label).toBe("stated by the bundle"); expect(stated.incomplete).toBe(true)
    const own = (seq: number, hash?: string) => verifyBundle(mk(e), { expectedHeads: new Map([["h1", { seq, ...(hash ? { hash } : {}) }]]) })
    expect(own(4, e[3]!.link!.hash).chain.h1!.head).toBe("confirmed")
    expect(own(4, "ab".repeat(32)).chain.h1!.head).toBe("head-mismatch"); expect(own(4, "ab".repeat(32)).inconsistent).toBe(true)
    expect(own(9).chain.h1!.head).toBe("head-short")
  })
  it("incomplete when a receipt is unchecked, never confirmed", () => {
    const { b } = withAnchor(online)
    const r = verifyBundle(b, { receiptVerifiers: [online] })
    expect(r.receipts[0]).toMatchObject({ result: "not-checked", reason: "needs-online-check" }); expect(r.incomplete).toBe(true); expect(r.inconsistent).toBe(false)
    expect(verifyBundle(b).receipts[0]!.reason).toBe("no-verifier")
  })
  it("keyed links: key-unavailable is incomplete; with the MAC they verify; expectKeyed flags unkeyed", () => {
    const key = (input: Uint8Array) => createHmac("sha256", "k").update(input).digest()
    const keyed = chainEntries({ seriesId: "h1", records: [1, 2].map(rec), keyed: { keyId: "k1", mac: key } })
    const none = verifyBundle(mk(keyed)); expect(none.chain.h1!.breaks[0]!.kind).toBe("key-unavailable"); expect(none.incomplete).toBe(true); expect(none.inconsistent).toBe(false)
    expect(verifyBundle(mk(keyed), { keyed: (_id, input) => key(input) }).chain.h1!.linksCheckedThrough).toBe(2)
    expect(verifyBundle(mk(), { expectKeyed: true }).chain.h1!.breaks[0]!.kind).toBe("unkeyed-link")
    expect(verifyBundle(mk(), { expectKeyed: new Set(["other"]) }).chain.h1!.breaks).toEqual([])
  })
  it("generic series under a supplied profile; unknown profile is not verified; auditDropped rise is a notice; malformed never throws", () => {
    const prof = { canon: "t-v1", position: (r: any) => ({ seq: r.n, recordId: r.id }), encode: (r: any) => Buffer.from(JSON.stringify(r)) }
    const g = chainEntries({ seriesId: "doc", records: [{ n: 1, id: "a" }, { n: 2, id: "b" }], profile: prof })
    const b = exportBundle({ createdAt: "t", series: [{ seriesId: "doc", entries: g, profile: { id: "doc-p", profile: prof } }, { seriesId: "h1", entries: entries() }], trustRoots: [] })
    const ok = verifyBundle(b, { profiles: new Map([["doc-p", prof]]) })
    expect(Object.keys(ok.chain).sort()).toEqual(["doc", "h1"]); expect(ok.inconsistent).toBe(false)
    const unk = verifyBundle(b); expect(unk.malformed).toContainEqual({ path: "series[0]", problem: "unknown-profile" }); expect(unk.chain.doc).toBeUndefined(); expect(unk.incomplete).toBe(true)
    const dropped = chainEntries({ seriesId: "h1", records: [rec(1), { ...rec(2), auditDropped: 3 }] })
    expect(verifyBundle(mk(dropped)).chain.h1!.notices).toEqual([{ seq: 2, kind: "loss-counter-rose" }])
    for (const junk of [null, 5, "x", {}, { format: "bridger-chain-bundle/v1", series: [1], segments: [{}], anchors: [null] }]) expect(verifyBundle(junk).inconsistent).toBe(true)
  })

  it("anchors match on the Merkle root: a root or head forged in the statement is a mismatch", () => {
    const e = entries(); const good = stmt(e, 1, 3)
    const run = (st: AnchorStatement) => verifyBundle(mk(e, { anchors: [{ statement: st, receipt: { anchor: "log", statementHash: statementHash(st) } }] }), { receiptVerifiers: [yes] }).chain.h1!
    expect(run(good).verifiedThrough).toBe(3)
    expect(run({ ...good, merkleRoot: "00".repeat(32) } as AnchorStatement).anchorMismatches[0]!.kind).toBe("root-mismatch")
    expect(run({ ...good, headHash: "00".repeat(32), merkleRoot: good.merkleRoot } as AnchorStatement).anchorMismatches[0]!.kind).toBe("head-mismatch")
    expect(statementHash(good)).toMatch(/^[0-9a-f]{64}$/)
    expect(statementHash(good)).not.toBe(statementHash({ ...good, createdAt: "x" } as AnchorStatement))
  })
  it("RFC 6962 root: single leaf is the leaf hash; inclusion proofs verify for every position of windows of 1..7", () => {
    for (let n = 1; n <= 7; n++) {
      const e = chainEntries({ seriesId: "h1", records: Array.from({ length: n }, (_, i) => rec(i + 1)) }); const st = stmt(e, 1, n)
      for (let q = 1; q <= n; q++) { const p = proveInclusion(e, st, q)!; expect(verifyInclusion(e[q - 1]!.record, p, st)).toBe(true); expect(verifyInclusion({ ...(e[q - 1]!.record as object), kind: "z" }, p, st)).toBe(false) }
    }
    expect(merkleRoot("sha-256", 1, ["aa", "bb", "cc"])).not.toBe(merkleRoot("sha-256", 1, ["aa", "bb", "cc", "dd"]))
    expect(proveInclusion(entries(), stmt(entries(), 1, 2), 3)).toBeUndefined()
  })
  it("disclose inclusions: only the requested record, reported 'included'; a tampered disclosed record is 'not-included'", () => {
    const e = entries(); const s = stmt(e, 1, 4)
    const anchors = [{ statement: s, receipt: { anchor: "log", statementHash: statementHash(s) } }]
    const b = exportBundle({ createdAt: "t", series: [{ seriesId: "h1", entries: e }], anchors, trustRoots: [root], disclose: "inclusions", include: new Map([["h1", [3]]]) })
    expect(b.segments).toEqual([]); expect(b.inclusions).toHaveLength(1); expect(JSON.stringify(b)).not.toContain('"recordId":"r2"')
    const r = verifyBundle(b, { receiptVerifiers: [yes] })
    expect(r.inclusions).toEqual([{ seriesId: "h1", seq: 3, result: "included" }]); expect(r.inconsistent).toBe(false); expect(r.chain.h1).toBeUndefined()
    const bad = JSON.parse(JSON.stringify(b)); bad.inclusions[0].record.kind = "evil"
    const rb = verifyBundle(bad, { receiptVerifiers: [yes] }); expect(rb.inclusions[0]!.result).toBe("not-included"); expect(rb.inconsistent).toBe(true)
    const nc = verifyBundle(b); expect(nc.inclusions[0]!.result).toBe("not-checked"); expect(nc.incomplete).toBe(true)
  })
  it("export range and BundleExportFailed; anchors only for overlapping windows", () => {
    const e = entries(); const s1 = stmt(e, 1, 2); const s2 = stmt(e, 3, 4, statementHash(s1))
    const anchors = [s1, s2].map((st) => ({ statement: st, receipt: { anchor: "log", statementHash: statementHash(st) } }))
    const b = exportBundle({ createdAt: "t", series: [{ seriesId: "h1", entries: e }], anchors, trustRoots: [root], range: new Map([["h1", { fromSeq: 3, toSeq: 4 }]]) })
    expect(b.segments[0]).toMatchObject({ fromSeq: 3, toSeq: 4 }); expect(b.anchors).toHaveLength(2)
    const r = verifyBundle(b, { receiptVerifiers: [yes] }); expect(r.chain.h1).toMatchObject({ linksCheckedThrough: 4, verifiedThrough: 4 }); expect(r.chain.h1!.sequence.problems).toEqual([]); expect(r.chain.h1!.breaks).toEqual([]); expect(r.inconsistent).toBe(false)
    expect(b.segments[0]!.predecessor).toEqual({ seq: 2, hash: e[1]!.link!.hash }); expect(b.series[0]!.continuesFrom).toBeUndefined()
    const req = { createdAt: "t", series: [{ seriesId: "h1", entries: e }], trustRoots: [root] }
    expect(() => exportBundle({ ...req, range: new Map([["h1", { fromSeq: 3, toSeq: 9 }]]) })).toThrow(BundleExportFailed)
    expect(() => exportBundle({ ...req, range: new Map([["nope", { fromSeq: 1, toSeq: 2 }]]) })).toThrow(BundleExportFailed)
    expect(() => exportBundle({ ...req, disclose: "inclusions", include: new Map([["h1", [1]]]) })).toThrow(BundleExportFailed)
  })
  it("sequence follows core's verifyAuditSequence: gap, duplicate and order are reported and cap links", () => {
    const e = entries(); const gap = [e[0]!, e[2]!, e[3]!]
    const r = verifyBundle(mk(gap)).chain.h1!; expect(r.sequence.gaps).toEqual([{ after: 1, before: 3 }]); expect(r.linksCheckedThrough).toBe(1)
    expect(verifyBundle(mk([e[0]!, e[0]!, e[1]!])).chain.h1!.sequence.duplicates).toEqual([1])
  })
  it("version 1 statements are read and listed as anchoring no loss counter", () => {
    const e = entries(); const v2 = stmt(e, 1, 2) as Extract<AnchorStatement, { v: 2 }>
    const v1 = { v: 1 as const, alg: v2.alg, hostId: "h1", fromSeq: 1, toSeq: 2, merkleRoot: v2.merkleRoot, headHash: v2.headHash, createdAt: v2.createdAt }
    const r = verifyBundle(mk(e, { anchors: [{ statement: v1, receipt: { anchor: "log", statementHash: statementHash(v1) } }] }), { receiptVerifiers: [yes] })
    expect(r.chain.h1!.verifiedThrough).toBe(2); expect(r.chain.h1!.lossCounterUnanchored).toEqual([{ fromSeq: 1, toSeq: 2, statementHash: statementHash(v1) }])
  })
})

describe("range export prev-checks its first entry", () => {
  const e = entries(); const s1 = stmt(e, 1, 2); const s2 = stmt(e, 3, 4, statementHash(s1))
  const anchors = [s1, s2].map((st) => ({ statement: st, receipt: { anchor: "log", statementHash: statementHash(st) } }))
  const exp = (ents = e, anch = anchors) => exportBundle({ createdAt: "t", series: [{ seriesId: "h1", entries: ents }], anchors: anch, trustRoots: [root], range: new Map([["h1", { fromSeq: 3, toSeq: 4 }]]) })
  it("valid: untouched range passes, a tampered first entry or wrong predecessor hash is a break", () => {
    expect(verifyBundle(exp(), { receiptVerifiers: [yes] }).inconsistent).toBe(false)
    const t = [e[0]!, e[1]!, { ...e[2]!, link: { ...e[2]!.link!, prevHash: "00".repeat(32) } }, e[3]!]
    expect(verifyBundle(exp(t), { receiptVerifiers: [yes] }).chain.h1!.breaks).toContainEqual(expect.objectContaining({ seq: 3, kind: "prev-mismatch" }))
    const b = JSON.parse(JSON.stringify(exp())); b.segments[0].predecessor.hash = "ab".repeat(32)
    expect(verifyBundle(b).chain.h1!.breaks).toContainEqual(expect.objectContaining({ seq: 3, kind: "prev-mismatch" }))
  })
  it("a missing predecessor fails the export; the first window's previous is checked against the carried predecessor statement", () => {
    expect(() => exportBundle({ createdAt: "t", series: [{ seriesId: "h1", entries: e.slice(1) }], trustRoots: [], range: new Map([["h1", { fromSeq: 2, toSeq: 4 }]]) })).toThrow(BundleExportFailed)
    const bad = stmt(e, 3, 4, "cd".repeat(32))
    const r = verifyBundle(exp(e, [anchors[0]!, { statement: bad, receipt: { anchor: "log", statementHash: statementHash(bad) } }]), { receiptVerifiers: [yes] })
    expect(r.chain.h1!.anchorMismatches).toEqual([{ statementHash: statementHash(bad), kind: "previous-mismatch" }])
  })
})

describe("jcs (RFC 8785)", () => {
  it("sorts keys by UTF-16 code units (RFC 8785 section 3.2.3)", () => {
    const o: Record<string, number> = { "\u20ac": 1, "\r": 2, "\ufb33": 3, "1": 4, "\ud83d\ude00": 5, "\u0080": 6, "\u00f6": 7 }
    expect([...jcs(o).matchAll(/"((?:[^"\\]|\\.)*)":/g)].map((m) => JSON.parse(`"${m[1]}"`))).toEqual(["\r", "1", "\u0080", "\u00f6", "\u20ac", "\ud83d\ude00", "\ufb33"])
    expect(jcs({ b: 1, a: { d: 1, c: [3, { z: 1, y: 2 }] } })).toBe('{"a":{"c":[3,{"y":2,"z":1}],"d":1},"b":1}')
  })
  it("serialises numbers like ECMAScript (RFC 8785 section 3.2.2)", () => {
    expect([1e21, 4.5, 0.002, 1e-7, -0, 333333333.33333329, 1e30, 123456789012345680000].map((n) => jcs(n))).toEqual(["1e+21", "4.5", "0.002", "1e-7", "0", "333333333.3333333", "1e+30", "123456789012345680000"])
    expect(() => jcs(NaN)).toThrow(); expect(() => jcs(Infinity)).toThrow()
  })
  it("escapes strings (RFC 8785 section 3.2.2.2) and keeps absent fields absent", () => {
    expect(jcs("\u20ac$\u000f\u000aA'B\"\\/")).toBe('"\u20ac$\\u000f\\nA\'B\\"\\\\/"')
    expect(jcs("\u0007\u007f")).toBe('"\\u0007\u007f"')
    expect(jcs("\ud800")).toBe('"\\ud800"')
    expect(jcs({ a: undefined, b: null, c: [] })).toBe('{"b":null,"c":[]}')
  })
})
