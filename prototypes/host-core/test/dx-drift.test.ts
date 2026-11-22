// Report 07, R5: a changed behaviour the prototype names needs a prototype change or an explicit exemption.
import { describe, expect, it } from "vitest"
// @ts-expect-error plain .mjs script, no declarations
import { decide, touched } from "../scripts/check-drift.mjs"

describe("prototype drift check", () => {
  it("passes when nothing named changed, or the prototype changed, or the change is exempt", () => {
    expect(decide([], false, false).ok).toBe(true)
    expect(decide(["x"], true, false).ok).toBe(true)
    expect(decide(["x"], false, true).ok).toBe(true)
  })
  it("fails when a named behaviour changed and neither holds", () => {
    expect(decide(["x"], false, false)).toEqual({ ok: false, named: ["x"] })
  })
  it("finds the behaviours whose section text changed between two revisions", () => {
    const ids: Array<string> = touched("a3d081a~6")
    expect(ids.length).toBeGreaterThan(0)
    for (const id of ids) expect(id).toMatch(/^(BEH|INV)-[A-Z]+-\d{3}$/)
    expect(touched("HEAD")).toEqual([])
  })
})
