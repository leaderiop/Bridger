import { createHmac } from "node:crypto"
import { describe, expect, it } from "vitest"
import { chainEntries, exportBundle, renderReport, statementHash, verifyBundle, type AnchorStatement, type ChainEntry, type OfflineReceiptVerifier, type TrustRoot } from "../src/audit-chain.js"

const rec = (n: number) => ({ hostId: "h1", auditSeq: n, recordId: `r${n}`, kind: "x", auditDropped: 0 })
const entries = () => chainEntries({ seriesId: "h1", records: [1, 2, 3, 4].map(rec) })
const root: TrustRoot = { kind: "anchor-key", anchor: "log", publicKey: "k" }
const mk = (e: ChainEntry[] = entries(), extra: object = {}) =>
  exportBundle({ createdAt: "2026-01-01T00:00:00.000Z", series: [{ seriesId: "h1", entries: e }], trustRoots: [root], ...extra })
const stmt = (e: ChainEntry[], from: number, to: number, previous?: string): AnchorStatement => ({ seriesId: "h1", fromSeq: from, toSeq: to, head: e[to - 1]!.link!.hash, ...(previous ? { previous } : {}) })
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
})
