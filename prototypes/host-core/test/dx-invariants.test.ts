// Report 07, R8: the Check block of an invariant is linted. Seeded drift in a scratch tree must each be reported.
import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const script = new URL("../../../references/core/scripts/verify-invariants.py", import.meta.url).pathname
const block = (over: Record<string, string> = {}) => {
  const f = { predicate: "none", scope: "x", evidence: "none", status: "Planned", unchecked: "none stated", ...over }
  return "**Check**:\n\n```yaml\n" + Object.entries(f).map(([k, v]) => `${k}: ${v}`).join("\n") + "\n```\n"
}
const tree = (body: string) => {
  const dir = join(mkdtempSync(join(tmpdir(), "inv-")), "core"); mkdirSync(dir)
  const file = join(dir, "invariants.md"); writeFileSync(file, body); return file
}
const run = (file: string) => { const r = spawnSync("python3", ["-I", script, file], { encoding: "utf8" }); return { code: r.status, out: r.stdout } }
const inv = (n: number, check = "") => `## INV-BR-${String(n).padStart(3, "0")}: t\n\ntext\n\n${check}\n---\n\n`

describe("verify-invariants.py", () => {
  it("passes the repository's core invariants", () => {
    const r = spawnSync("python3", ["-I", script], { encoding: "utf8" })
    expect(r.status).toBe(0)
    expect(r.stdout).toContain("references/core/invariants.md: 52 invariants authored, 0 failure(s)")
  })
  it("treats a tree with no block as not yet authored, and a partly authored one as failing", () => {
    expect(run(tree(inv(1) + inv(2)))).toMatchObject({ code: 0 })
    const r = run(tree(inv(1, block()) + inv(2)))
    expect(r.code).toBe(1); expect(r.out).toContain("INV-BR-002: no Check block")
  })
  it("rejects a missing field, a predicate the model does not export, and evidence that does not name the invariant", () => {
    expect(run(tree(inv(1, block({ unchecked: "" })))).out).toContain("lacks 'unchecked'")
    expect(run(tree(inv(1, block({ predicate: "inv999" })))).out).toContain("predicate 'inv999' is not exported")
    const wrong = "evidence:\n  - prototypes/host-core/test/model.test.ts"
    expect(run(tree(inv(7, block({ evidence: "", status: "Tested" }).replace("evidence: \n", wrong + "\n")))).out).toContain("does not name it")
  })
  it("derives the status from the evidence", () => {
    const real = "evidence:\n  - prototypes/host-core/test/pbt/properties.pbt.test.ts"
    const ok = block({ evidence: "", status: "Tested", predicate: "inv017" }).replace("evidence: \n", real + "\n")
    expect(run(tree(inv(17, ok))).code).toBe(0)
    expect(run(tree(inv(17, ok.replace("Tested", "Planned")))).out).toContain("the evidence makes it Tested")
  })
})
