// Report 07, R3: the callers table lists every behaviour or invariant that names a primitive, across the trees.
import { execFileSync } from "node:child_process"
import { describe, expect, it } from "vitest"

const run = (...args: Array<string>) =>
  execFileSync("bash", [new URL("../../../references/core/scripts/callers.sh", import.meta.url).pathname, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })

describe("callers.sh", () => {
  it("lists one row per section naming the primitive, in id order", () => {
    const rows = run("WouldDeadlock").trim().split("\n")
    expect(rows.length).toBeGreaterThan(10)
    for (const r of rows) expect(r).toMatch(/^(BEH|INV)-[A-Z]+-\d{3}\t[\w/.-]+\.md\t\d+$/)
    expect(new Set(rows.map((r) => r.split("\t")[0])).size).toBe(rows.length)
  })
  it("renders the markdown table a CCR attaches, with an empty Outcome column", () => {
    const md = run("WouldDeadlock", "--md")
    expect(md.startsWith("| Id | File | Mentions | Outcome |")).toBe(true)
    expect(md.split("\n")[2]).toMatch(/\| \d+ \| \|$/)
  })
  it("finds nothing for a name no document uses", () => {
    expect(run("zzzNoSuchPrimitive").trim()).toBe("")
  })
})
