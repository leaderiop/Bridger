// BEH-GX-130, 131, 132 on a small known evidence.
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { collect, readTraceRows } from "../src/evidence.js"
import { canonical, coverage, STATEMENT, verifyEvidencePack, writeEvidencePack } from "../src/evidencepack.js"

const ev = collect([{ id: "BEH-BR-001 a", file: "f", status: "passed" }, { id: "BEH-BR-002 b", file: "f", status: "failed" }], ["BEH-BR-001", "BEH-BR-002", "BEH-BR-003"])
const rows = readTraceRows(["| REQ-BR-001 | a | [BEH-BR-001](x) | Not run |", "| REQ-BR-002 | b | [BEH-BR-001](x), [BEH-BR-002](x) | Not run |"].join("\n"))
const input = (extra = {}) => ({ generatedAt: "2026-11-22T00:00:00Z", packageVersion: "0.1.0", coreVersion: "0.1.0", oq: { counts: ev.counts, statement: ev.statement }, deviations: ev.deviations, coverage: coverage(ev, rows), ...extra })
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
