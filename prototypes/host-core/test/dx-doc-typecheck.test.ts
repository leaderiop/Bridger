// Report 05 R2 (DX-02): doc-typecheck.sh compiles `type-checked: yes` snippets, and fails on a broken one or a missing marker.
import { spawnSync } from "node:child_process"
import { mkdtempSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { describe, expect, it } from "vitest"

const script = resolve(__dirname, "../../../references/kit/scripts/doc-typecheck.sh")
const check = (dir?: string) => spawnSync("bash", [script], { encoding: "utf8", env: { ...process.env, ...(dir ? { DOC_TYPECHECK_EXTRA: dir } : {}) } })
const fence = (body: string) => "```ts\n" + body + "\n```\n"
const withDoc = (md: string, f: (dir: string) => void) => {
  const dir = mkdtempSync(join(tmpdir(), "doc-"))
  try { writeFileSync(join(dir, "g.md"), md); f(dir) } finally { rmSync(dir, { recursive: true, force: true }) }
}

describe("doc-typecheck (improvement report 05, R2)", { timeout: 120_000 }, () => {
  it("the guides pass", () => {
    const r = check()
    expect(r.stdout).toContain("0 failure(s)")
    expect(r.status).toBe(0)
  })
  it("a snippet marked yes that does not compile fails, naming the file and line", () => {
    withDoc(fence('// type-checked: yes\nconst n: number = "no"'), (dir) => {
      const r = check(dir)
      expect(r.status).toBe(1)
      expect(r.stdout).toContain("g.md:2: snippet does not compile")
    })
  })
  it("a snippet that imports a symbol the package does not export fails", () => {
    withDoc(fence('// type-checked: yes\nimport { definePluginX } from "@bridger/kit"\nexport const x = definePluginX'), (dir) => {
      expect(check(dir).status).toBe(1)
    })
  })
  it("a ts block without a marker fails; a not-yet block is counted, not compiled", () => {
    withDoc(fence("const a = 1") , (dir) => { const r = check(dir); expect(r.status).toBe(1); expect(r.stdout).toContain("no `// type-checked:` marker") })
    withDoc(fence("// type-checked: not yet (absent)\nconst a: number = 'x'"), (dir) => { expect(check(dir).status).toBe(0) })
  })
  it("a recipe whose body differs from its test's region fails; a missing test file fails", () => {
    withDoc(fence("// type-checked: test test/cookbook/01-service.test.ts\nconst different = 1"), (dir) => {
      const r = check(dir)
      expect(r.status).toBe(1)
      expect(r.stdout).toContain("differs from the region")
    })
    withDoc(fence("// type-checked: test test/cookbook/nope.test.ts\nx"), (dir) => { expect(check(dir).stdout).toContain("is missing or has no `// #region recipe`") })
  })
})
