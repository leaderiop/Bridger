// Report 05 R3 (DX-03): the error catalog is data, and verify-errors.sh compares it with the sources and the guide.
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { entries, type ErrorTag } from "../src/errors.catalog.js"

const root = resolve(__dirname, "../../..")
const script = join(root, "references/kit/scripts/verify-errors.sh")
const check = (env: Record<string, string> = {}) => spawnSync("bash", [script], { encoding: "utf8", env: { ...process.env, ...env } })
// assembled so the script, which scans prototypes/*/src only, never reads the fixture text as a declaration
const DECL = (tag: string) => `export class ${tag} extends Schema.Tagged` + `Error<${tag}>()("${tag}", {}) {}\n`

describe("error catalog (improvement report 05, R3)", { timeout: 60_000 }, () => {
  it("the tree passes: every declared tag has a row, every row a guide entry and the reverse, the data file is current", () => {
    const r = check()
    expect(r.stdout).toContain("0 failure(s)")
    expect(r.status).toBe(0)
  })
  it("a tag with no row in BEH-KT-052 fails", () => {
    const dir = mkdtempSync(join(tmpdir(), "err-"))
    try {
      writeFileSync(join(dir, "x.ts"), DECL("NobodyRowedMe"))
      const r = check({ DOC_ERRORS_EXTRA: dir })
      expect(r.status).toBe(1)
      expect(r.stdout).toContain("NobodyRowedMe has no row")
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
  it("a row with no guide entry fails", () => {
    const dir = mkdtempSync(join(tmpdir(), "err-"))
    try {
      const guide = readFileSync(join(root, "docs/guides/error-catalog.md"), "utf8").replace("### DuplicatePlugin", "### Renamed")
      writeFileSync(join(dir, "g.md"), guide)
      const r = check({ DOC_ERRORS_GUIDE: join(dir, "g.md") })
      expect(r.status).toBe(1)
      expect(r.stdout).toContain("row DuplicatePlugin has no entry")
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
  it("every tag the prototype declares has an entry (compile time) with a cause and a fix", () => {
    type Missing = Exclude<ErrorTag, keyof typeof entries>
    const none: [Missing] extends [never] ? true : false = true
    expect(none).toBe(true)
    expect(entries.DuplicatePlugin.fix.length).toBeGreaterThan(0)
    expect(Object.keys(entries).length).toBeGreaterThanOrEqual(51)
  })
})
