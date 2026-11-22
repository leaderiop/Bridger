// The outcome rule of BEH-GX-124 and the deviations of BEH-GX-125, exactly, on a known corpus.
import { describe, expect, it } from "vitest"
import { collect, outcomeOf, readVitestReport, STATEMENT, tagsOf, type RunnerTest } from "../src/evidence.js"

const t = (id: string, status: RunnerTest["status"]): RunnerTest => ({ id, file: "f.test.ts", status })

describe("oq evidence (BEH-GX-124, 125)", () => {
  it("fail beats pass beats skipped beats not covered, with no weighting", () => {
    expect(outcomeOf(["passed", "passed", "failed"])).toBe("fail")
    expect(outcomeOf(["skipped", "passed"])).toBe("pass")
    expect(outcomeOf(["skipped", "skipped"])).toBe("skipped")
    expect(outcomeOf([])).toBe("not covered")
    expect(outcomeOf(["passed"])).toBe("pass")
  })
  it("lists each test under every requirement it claims, counts the four outcomes, and raises one open deviation per gap", () => {
    const ev = collect([t("BEH-BR-001 and BEH-BR-002: x", "passed"), t("BEH-BR-002: y", "failed"), t("BEH-BR-003: z", "skipped"), t("BEH-BR-099: typo", "passed")], ["BEH-BR-001", "BEH-BR-002", "BEH-BR-003", "BEH-BR-004"])
    expect(Object.fromEntries(Object.entries(ev.requirements).map(([k, v]) => [k, v.outcome]))).toEqual({ "BEH-BR-001": "pass", "BEH-BR-002": "fail", "BEH-BR-003": "skipped", "BEH-BR-004": "not covered" })
    expect(ev.requirements["BEH-BR-002"]!.tests.map((x) => x.id)).toEqual(["BEH-BR-001 and BEH-BR-002: x", "BEH-BR-002: y"])
    expect(ev.counts).toEqual({ fail: 1, pass: 1, skipped: 1, notCovered: 1 })
    expect(ev.deviations.map((d) => `${d.kind}:${d.subject}`).sort()).toEqual(["requirement-failed:BEH-BR-002", "requirement-not-covered:BEH-BR-003", "requirement-not-covered:BEH-BR-004", "unknown-requirement:BEH-BR-099"])
    expect(ev.deviations.every((d) => d.state === "open")).toBe(true)
    expect(ev.statement).toBe(STATEMENT)
  })
  it("never takes free text from a test's name into a deviation", () => {
    const ev = collect([t("BEH-BR-777 <script>alert(1)</script>", "passed")], [])
    expect(JSON.stringify(ev.deviations)).not.toContain("script")
  })
  it("reads the vitest report completely or not at all", () => {
    const ok = { testResults: [{ name: "a.test.ts", assertionResults: [{ fullName: "BEH-BR-001 x", status: "passed" }, { fullName: "y", status: "pending" }] }] }
    expect(readVitestReport(ok).map((x) => x.status)).toEqual(["passed", "skipped"])
    expect(() => readVitestReport({})).toThrow(/no testResults/)
    expect(() => readVitestReport({ testResults: [{ name: "a", assertionResults: [{ status: "passed" }] }] })).toThrow(/fullName/)
    expect(() => readVitestReport({ testResults: [{ name: "a", assertionResults: [{ fullName: "x", status: "weird" }] }] })).toThrow(/unknown test status/)
  })
  it("finds BEH-BR tags once each and ignores near misses", () => {
    expect(tagsOf("BEH-BR-121, BEH-BR-121 and BEH-BR-5; XBEH-BR-7 BEH-BR-1234")).toEqual(["BEH-BR-121", "BEH-BR-5"])
  })
})
