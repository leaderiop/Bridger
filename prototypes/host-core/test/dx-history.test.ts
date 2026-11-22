// Report 07, R6 (iv): a Change History cell keeps its newest revisions; older lines roll into the tree's CHANGES.md.
import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const script = new URL("../../../references/core/scripts/split-history.py", import.meta.url).pathname
const scratch = () => {
  const refs = mkdtempSync(join(tmpdir(), "refs-")); mkdirSync(join(refs, "t"))
  writeFileSync(join(refs, "t", "index.yaml"), "kind: root\ninfix: ZZ\nentries: []\n")
  return refs
}
const doc = (refs: string, lines: ReadonlyArray<string>) => writeFileSync(join(refs, "t", "a.md"),
  `# A\n\n> **Document Control**\n>\n> | Property | Value |\n> | Document ID    | BRIDGER-ZZ-A                                                 |\n> | Change History | ${lines.join("<br>")} |\n\ntext\n`)
const run = (refs: string, ...args: Array<string>) => spawnSync("python3", ["-I", script, ...args], { encoding: "utf8", env: { ...process.env, SPLIT_HISTORY_REFS: refs } })
const line = (n: number) => `0.${n} (2026-11-22): ${"x".repeat(300)} revision ${n}`
const cell = (refs: string) => /Change History \| (.*) \|$/m.exec(readFileSync(join(refs, "t", "a.md"), "utf8"))![1]!

describe("split-history.py", () => {
  it("moves the older lines, keeps the newest, and links the cell to them", () => {
    const refs = scratch()
    doc(refs, [9, 8, 7, 6, 5, 4, 3, 2, 1].map(line))
    expect(run(refs, "--check").status).toBe(1)
    expect(run(refs).stdout).toContain("1 cell(s) over 2000")
    expect(cell(refs).length).toBeLessThanOrEqual(2000)
    expect(cell(refs).startsWith("0.9 (")).toBe(true)
    expect(cell(refs)).toContain("Earlier revisions: [CHANGES.md](../t/CHANGES.md#bridger-zz-a)".replace("../t/", ""))
    const changes = readFileSync(join(refs, "t", "CHANGES.md"), "utf8")
    expect(changes).toContain("## BRIDGER-ZZ-A")
    expect(changes).toContain("revision 1")
    expect(changes).not.toContain("revision 9")
    expect(run(refs, "--check")).toMatchObject({ status: 0 })
  })
  it("is idempotent, and later overflow lands above the older lines", () => {
    const refs = scratch()
    doc(refs, [9, 8, 7, 6, 5, 4, 3, 2, 1].map(line))
    run(refs); const once = readFileSync(join(refs, "t", "CHANGES.md"), "utf8")
    run(refs); expect(readFileSync(join(refs, "t", "CHANGES.md"), "utf8")).toBe(once)
    const kept = cell(refs).split("<br>").filter((l) => !l.startsWith("Earlier"))
    doc(refs, [13, 12, 11, 10].map(line).concat(kept).concat([`Earlier revisions: [CHANGES.md](CHANGES.md#bridger-zz-a)`]))
    run(refs)
    const after = readFileSync(join(refs, "t", "CHANGES.md"), "utf8")
    expect(after.indexOf("revision 8")).toBeGreaterThan(-1)
    expect(after.indexOf("revision 5")).toBeLessThan(after.indexOf("revision 1"))
  })
  it("rejects a link whose anchor is gone", () => {
    const refs = scratch()
    doc(refs, [2, 1].map(line).concat(["Earlier revisions: [CHANGES.md](CHANGES.md#nowhere)"]))
    expect(run(refs, "--check").stdout).toContain("does not resolve")
  })
  it("the repository passes", () => {
    expect(spawnSync("python3", ["-I", script, "--check"], { encoding: "utf8" }).status).toBe(0)
  })
})
