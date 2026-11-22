// Report 06 S30: a check report names the policy it ran under; a different policy than the recorded one is a finding.
import { describe, expect, it } from "vitest"
import { checkTrail } from "../src/trailcheck.js"

const entries = [{ auditSeq: 1 }, { auditSeq: 2 }, { auditSeq: 4 }]
describe("checkTrail (BEH-GX-033)", () => {
  it("reports the gap, lists unchecked kinds, and states only what was checked", () => {
    const r = checkTrail("h1", entries, { policy: { rules: ["a"] }, recordedPolicy: { rules: ["a"] } })
    expect(r.findings).toEqual([{ kind: "gap", hostId: "h1", auditSeq: 3, toSeq: 3 }])
    expect(r.notCheckedKinds).toContain("chainBreak"); expect(r.checkedKinds).not.toContain("chainBreak")
    expect(r.statement).toMatch(/^1 findings of the checked kinds\. Kinds not checked: /)
  })
  it("a laxer caller-supplied policy is a policyNotRecorded finding with its own digest; the same policy is not", () => {
    const same = checkTrail("h1", [{ auditSeq: 1 }], { policy: { r: 1 }, recordedPolicy: { r: 1 } })
    const lax = checkTrail("h1", [{ auditSeq: 1 }], { policy: { r: 0 }, recordedPolicy: { r: 1 } })
    expect(same.findings).toEqual([]); expect(same.statement.startsWith("No findings of the checked kinds.")).toBe(true)
    expect(lax.findings.map((f) => f.kind)).toEqual(["policyNotRecorded"]); expect(lax.policyDigest).not.toBe(same.policyDigest)
  })
})
