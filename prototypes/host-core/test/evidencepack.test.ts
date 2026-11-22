// BEH-GX-130, 131, 132 on a small known evidence.
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { collect, readTraceRows } from "../src/evidence.js"
import { packHeads, renderHtml, AssessmentRefused, assessDeviation, canonical, coverage, deviationId, diffPacks, EvidenceReadFailed, renderReport, SignatureRefused, signEvidencePack, STATEMENT, verifyEvidencePack, writeEvidencePack, writeReport } from "../src/evidencepack.js"

const ev = collect([{ id: "BEH-BR-001 a", file: "f", status: "passed" }, { id: "BEH-BR-002 b", file: "f", status: "failed" }], ["BEH-BR-001", "BEH-BR-002", "BEH-BR-003"])
const rows = readTraceRows(["| REQ-BR-001 | a | [BEH-BR-001](x) | Not run |", "| REQ-BR-002 | b | [BEH-BR-001](x), [BEH-BR-002](x) | Not run |"].join("\n"))
const input = (extra = {}) => ({ requester: { id: "dev-1", kind: "user" as const }, generatedAt: "2026-11-22T00:00:00Z", packageVersion: "0.1.0", coreVersion: "0.1.0", oq: { counts: ev.counts, statement: ev.statement }, deviations: ev.deviations, coverage: coverage(ev, rows), ...extra })
const dir = () => mkdtempSync(join(tmpdir(), "bridger-pack-"))

describe("canonical JSON (RFC 8785)", () => {
  it("sorts keys by code unit, drops whitespace and undefined, and rejects non-JSON", () => {
    expect(canonical({ b: 1, a: [true, null, "x"], "é": 2, A: { z: undefined, y: 1.5 } })).toBe('{"A":{"y":1.5},"a":[true,null,"x"],"b":1,"é":2}')
    expect(() => canonical(NaN)).toThrow(); expect(() => canonical(() => 1)).toThrow()
  })
})
describe("evidence pack (BEH-GX-130, 131, 132)", () => {
  it("builds a byte-identical pack with the same digest from the same inputs", () => {
    const a = dir(), b = dir(); const da = writeEvidencePack(a, input()), db = writeEvidencePack(b, input())
    expect(da.packDigest).toBe(db.packDigest)
    for (const f of ["manifest.json", "oq.json", "deviations.json", "coverage.json"]) expect(readFileSync(join(a, f))).toEqual(readFileSync(join(b, f)))
    const m = JSON.parse(readFileSync(join(a, "manifest.json"), "utf8")); expect(m.statement).toBe(STATEMENT); expect(m.files.map((f: { path: string }) => f.path)).toEqual(["coverage.json", "deviations.json", "oq.json"])
    expect(readFileSync(join(a, "oq.json"), "utf8").endsWith("}\n")).toBe(true)
  })
  it("keeps attachments byte for byte and records their input digests", () => {
    const d = dir(), raw = Buffer.from([0xef, 0xbb, 0xbf, 0x0d, 0x0a, 0xff, 0xfe, 0x7b, 0x20, 0x7d]); writeEvidencePack(d, input({ attachments: [{ as: "cov.json", bytes: raw }] }))
    expect(readFileSync(join(d, "attachments/cov.json"))).toEqual(raw)
    const m = JSON.parse(readFileSync(join(d, "manifest.json"), "utf8"))
    expect(m.inputs[0].digest).toBe(m.files.find((f: { path: string }) => f.path === "attachments/cov.json").digest)
  })
  it("covers every requirement row and every behaviour: worst citing outcome, uncited is not covered", () => {
    const c = coverage(ev, rows)
    expect(c.requirements.map((r) => [r.id, r.outcome])).toEqual([["REQ-BR-001", "pass"], ["REQ-BR-002", "fail"]])
    expect(c.behaviours).toEqual([{ id: "BEH-BR-001", requirements: ["REQ-BR-001", "REQ-BR-002"], outcome: "fail" }, { id: "BEH-BR-002", requirements: ["REQ-BR-002"], outcome: "fail" }, { id: "BEH-BR-003", requirements: [], outcome: "not covered" }])
  })
  it("verifies by path and never says authentic: changed, missing, unlisted, re-serialised manifest, wrong expected digest", () => {
    const d = dir(); const { packDigest } = writeEvidencePack(d, input())
    expect(verifyEvidencePack(d, packDigest)).toMatchObject({ matches: true, statement: "every file matches the manifest" })
    appendFileSync(join(d, "oq.json"), " "); rmSync(join(d, "coverage.json")); writeFileSync(join(d, "extra.txt"), "x")
    const r = verifyEvidencePack(d)
    expect(r.matches).toBe(false); expect(r.differences.map((x) => `${x.kind}:${x.path}`).sort()).toEqual(["changed:oq.json", "missing:coverage.json", "unlisted:extra.txt"])
    const e = dir(); writeEvidencePack(e, input())
    writeFileSync(join(e, "manifest.json"), JSON.stringify(JSON.parse(readFileSync(join(e, "manifest.json"), "utf8")), null, 2) + "\n")
    expect(verifyEvidencePack(e).differences).toContainEqual({ path: "manifest.json", kind: "manifest" })
    expect(verifyEvidencePack(dir.call(null) && (() => { const f = dir(); writeEvidencePack(f, input()); return f })(), "sha256:" + "0".repeat(64)).matches).toBe(false)
  })
})

const now = () => new Date("2026-11-22T01:00:00Z")
const devsOf = (d: string) => JSON.parse(readFileSync(join(d, "deviations.json"), "utf8")) as Array<{ id: string }>
const thrown = (f: () => void) => { try { f() } catch (e) { return e } return undefined }

describe("deviations and assessments (BEH-GX-133)", () => {
  it("gives each deviation a stable id from kind, source and subject, so two runs agree", () => {
    const d = { kind: "requirement-failed", source: "oq", subject: "BEH-BR-002" }
    expect(deviationId(d)).toMatch(/^DEV-[0-9a-f]{12}$/); expect(deviationId({ ...d })).toBe(deviationId(d)); expect(deviationId({ ...d, subject: "BEH-BR-003" })).not.toBe(deviationId(d))
    const a = dir(), b = dir(); writeEvidencePack(a, input()); writeEvidencePack(b, input())
    expect(devsOf(a).map((x) => x.id)).toEqual(devsOf(b).map((x) => x.id))
  })
  it("appends an attributed assessment outside the manifest, changes no other file, and refuses unknown, reserved and blank", () => {
    const d = dir(), { packDigest } = writeEvidencePack(d, input()); const id = devsOf(d)[0]!.id; const before = readFileSync(join(d, "deviations.json"))
    assessDeviation(d, { deviationId: id, by: { id: "qa-1", kind: "user" }, assessment: "accepted for release 1", reference: "CAPA-7" }, now)
    const [a] = JSON.parse(readFileSync(join(d, "assessments.json"), "utf8")); expect(a).toMatchObject({ deviationId: id, actor: { id: "qa-1", kind: "user" }, at: "2026-11-22T01:00:00.000Z", reference: "CAPA-7" })
    expect(readFileSync(join(d, "deviations.json"))).toEqual(before); expect(verifyEvidencePack(d, packDigest).matches).toBe(true)
    const reason = (by: { id: string; kind: string }, assessment: string, deviationId = id) => (thrown(() => assessDeviation(d, { deviationId, by, assessment }, now)) as AssessmentRefused).reason
    expect(reason({ id: "qa-1", kind: "user" }, "x", "DEV-nope")).toBe("unknown-deviation"); expect(reason({ id: "bridger:system", kind: "system" }, "x")).toBe("reserved-actor")
    expect(reason({ id: " ", kind: "user" }, "x")).toBe("reserved-actor"); expect(reason({ id: "qa-1", kind: "user" }, "  ")).toBe("blank-assessment")
  })
})
describe("derived report (BEH-GX-134)", () => {
  it("starts with the fixed line naming the pack digest, is byte-identical across runs, and holds nothing the JSON does not", () => {
    const d = dir(), { packDigest } = writeEvidencePack(d, input()); const r = renderReport(d)
    expect(r.split("\n")[0]).toBe(`Derived rendering of evidence pack ${packDigest}; the JSON files are the evidence.`)
    expect(renderReport(d)).toBe(r); expect(r).toContain(STATEMENT); expect(r).toContain("fail: 1, pass: 1, skipped: 0, not covered: 1")
    for (const x of devsOf(d)) expect(r).toContain(x.id)
    writeReport(d); expect(verifyEvidencePack(d, packDigest).matches).toBe(true)          // the report is derived: it does not change the pack
    const h = renderHtml(d); expect(h).toBe(renderHtml(d)); expect(h).not.toMatch(/<script|src=|href=|https?:/i)
    expect(h).toContain(`<p>Derived rendering of evidence pack ${packDigest}; the JSON files are the evidence.</p>`)
    for (const x of devsOf(d)) expect(h).toContain(x.id)
    const hostile = dir(); writeEvidencePack(hostile, input({ deviations: [{ kind: "k", source: "s", subject: '<img src="x">&', detail: "d", state: "open" }] }))
    expect(renderHtml(hostile)).toContain("&lt;img src=&quot;x&quot;&gt;&amp;"); expect(renderHtml(hostile)).not.toContain("<img")
    appendFileSync(join(d, "report.md"), "edited"); expect(verifyEvidencePack(d).differences).toContainEqual({ path: "report.md", kind: "changed" })   // a hand-edited report is caught
    writeReport(d); appendFileSync(join(d, "report.html"), "<script>"); expect(verifyEvidencePack(d).differences).toContainEqual({ path: "report.html", kind: "changed" })
  })
})
describe("QA signatures (BEH-GX-135)", () => {
  it("binds to the pack digest and the assessments, refuses the requester, and a later assessment makes the signature stop matching", () => {
    const d = dir(), { packDigest } = writeEvidencePack(d, input()); let seen: { ticketId: string; rendered: string } | undefined
    signEvidencePack(d, { meaning: "reviewed" }, (r) => { seen = r; return { signer: { id: "qa-1", kind: "user" } } }, now)
    expect(seen!.ticketId).toBe(`pack:${packDigest}`); expect(seen!.rendered).toBe(renderReport(d))
    expect(verifyEvidencePack(d, packDigest)).toMatchObject({ matches: true })
    const sig = JSON.parse(readFileSync(join(d, "signatures.json"), "utf8"))[0]; expect(sig).toMatchObject({ signer: { id: "qa-1" }, signedAt: "2026-11-22T01:00:00.000Z" })
    assessDeviation(d, { deviationId: devsOf(d)[0]!.id, by: { id: "qa-2", kind: "user" }, assessment: "later note" }, now)
    const after = verifyEvidencePack(d); expect(after.matches).toBe(false); expect(after.statement).toBe("signature does not match the current pack")
    const refuse = (a: unknown) => (thrown(() => signEvidencePack(d, { meaning: "m" }, () => a as never, now)) as SignatureRefused).reason
    expect(refuse({ signer: { id: "dev-1", kind: "user" } })).toBe("signer-is-requester"); expect(refuse({})).toBe("malformed-answer"); expect(refuse(undefined)).toBe("declined")
  })
})
describe("diffPacks (BEH-GX-136)", () => {
  it("lists changed, appeared and disappeared results by area and id, never summarises, and fails on a pack that does not match its manifest", () => {
    const a = dir(), b = dir()
    writeEvidencePack(a, input({ attachments: [{ as: "x.json", bytes: Buffer.from("1") }, { as: "gone.json", bytes: Buffer.from("g") }] }))
    const ev2 = collect([{ id: "BEH-BR-001 a", file: "f", status: "passed" }, { id: "BEH-BR-002 b", file: "f", status: "passed" }, { id: "BEH-BR-003 c", file: "f", status: "passed" }], ["BEH-BR-001", "BEH-BR-002", "BEH-BR-003"])
    writeEvidencePack(b, { ...input({ attachments: [{ as: "x.json", bytes: Buffer.from("2") }, { as: "new.json", bytes: Buffer.from("n") }] }), deviations: ev2.deviations, coverage: coverage(ev2, [...rows, ...readTraceRows("| REQ-BR-003 | c | [BEH-BR-003](x) | Not run |")]) })
    const diff = diffPacks(a, b)
    expect(diff.format).toBe("bridger-gx-pack-diff/1")
    const key = (c: { area: string; id: string; change: string }) => `${c.area}:${c.id}:${c.change}`
    expect(diff.changes.map(key)).toEqual(expect.arrayContaining(["attachment:attachments/gone.json:disappeared", "attachment:attachments/new.json:appeared", "attachment:attachments/x.json:changed", "requirement:REQ-BR-002:changed", "requirement:REQ-BR-003:appeared"]))
    expect(diff.changes.find((c) => c.id === "REQ-BR-002")).toMatchObject({ from: "fail", to: "pass" })
    expect([...diff.changes].sort((p, q) => (p.area + p.id < q.area + q.id ? -1 : 1))).toEqual(diff.changes)
    expect(Object.keys(diff).sort()).toEqual(["changes", "format", "next", "prev"])           // no better / worse / equivalent
    appendFileSync(join(b, "oq.json"), " "); const e = thrown(() => diffPacks(a, b)) as EvidenceReadFailed
    expect(e).toMatchObject({ _tag: "EvidenceReadFailed", reason: "manifest-mismatch" })
  })
  it("lists a requirement that went from pass to not covered as changed, never omitted", () => {
    const evA = collect([{ id: "BEH-BR-001", file: "f", status: "passed" }], ["BEH-BR-001"]), evB = collect([], ["BEH-BR-001"])
    const r1 = readTraceRows("| REQ-BR-001 | a | [BEH-BR-001](x) | Not run |"), a = dir(), b = dir()
    writeEvidencePack(a, { ...input(), deviations: evA.deviations, coverage: coverage(evA, r1) }); writeEvidencePack(b, { ...input(), deviations: evB.deviations, coverage: coverage(evB, r1) })
    expect(diffPacks(a, b).changes).toContainEqual({ area: "requirement", id: "REQ-BR-001", change: "changed", from: "pass", to: "not covered" })
  })
})

describe("requester and chained appends (improvement report 06, S27)", () => {
  it("the requester is the manifest's, so a signer cannot be separated from it by the caller's word; an inserted or edited entry breaks the chain", () => {
    const d = dir(); writeEvidencePack(d, input())
    expect(JSON.parse(readFileSync(join(d, "manifest.json"), "utf8")).requester).toEqual({ id: "dev-1", kind: "user" })
    expect((thrown(() => signEvidencePack(d, { meaning: "m" }, () => ({ signer: { id: "dev-1", kind: "user" } }), now)) as SignatureRefused).reason).toBe("signer-is-requester")
    signEvidencePack(d, { meaning: "m" }, () => ({ signer: { id: "qa-1", kind: "user" } }), now)
    assessDeviation(d, { deviationId: devsOf(d)[0]!.id, by: { id: "qa-2", kind: "user" }, assessment: "note" }, now)
    expect(verifyEvidencePack(d).differences.some((x) => x.kind === "chain")).toBe(false)
    const f = join(d, "assessments.json"), all = JSON.parse(readFileSync(f, "utf8"))
    writeFileSync(f, JSON.stringify([...all, { deviationId: all[0].deviationId, actor: { id: "qa-9", kind: "user" }, at: "x", assessment: "forged" }]) + "\n")   // appended outside the appender: no valid `prev`
    expect(verifyEvidencePack(d).differences).toContainEqual({ path: "assessments.json", kind: "chain" })
  })
  it("pinned heads reveal a removed last signature or an edited last entry (S66)", () => {
    const d = dir(); writeEvidencePack(d, input())
    signEvidencePack(d, { meaning: "m" }, () => ({ signer: { id: "qa-1", kind: "user" } }), now)
    signEvidencePack(d, { meaning: "m2" }, () => ({ signer: { id: "qa-2", kind: "user" } }), now)
    const heads = packHeads(d); expect(verifyEvidencePack(d, undefined, heads).differences.some((x) => x.kind === "chain")).toBe(false)
    const f = join(d, "signatures.json"), all = JSON.parse(readFileSync(f, "utf8"))
    writeFileSync(f, JSON.stringify(all.slice(0, -1)) + "\n"); expect(verifyEvidencePack(d).differences.some((x) => x.kind === "chain")).toBe(false)   // not visible without the pin
    expect(verifyEvidencePack(d, undefined, heads).differences).toContainEqual({ path: "signatures.json", kind: "chain" })
    writeFileSync(f, JSON.stringify([...all.slice(0, -1), { ...all.at(-1), meaning: "edited" }]) + "\n"); expect(verifyEvidencePack(d, undefined, heads).differences).toContainEqual({ path: "signatures.json", kind: "chain" })
  })
})

