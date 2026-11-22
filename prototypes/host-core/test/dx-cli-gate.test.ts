// Report 05 R10 (DX-11): verify-cli.sh fails on a document naming a bridger command the kit CLI does not have and no extension declares.
import { spawnSync } from "node:child_process"
import { mkdtempSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { describe, expect, it } from "vitest"

const script = resolve(__dirname, "../../../references/kit/scripts/verify-cli.sh")
const check = (dir?: string) => spawnSync("bash", [script], { encoding: "utf8", env: { ...process.env, ...(dir ? { VERIFY_CLI_EXTRA: dir } : {}) } })
const withDoc = (md: string, f: (dir: string) => void) => {
  const dir = mkdtempSync(join(tmpdir(), "cli-"))
  try { writeFileSync(join(dir, "d.md"), md); f(dir) } finally { rmSync(dir, { recursive: true, force: true }) }
}

describe("CLI convergence gate (improvement report 05, R10)", { timeout: 60_000 }, () => {
  it("the docs pass: every command is the kit's or a declared extension", () => {
    const r = check()
    expect(r.stdout).toContain("0 failure(s)")
    expect(r.status).toBe(0)
  })
  it("an unknown command fails; a declared extension passes; an extension shadowing a kit command fails", () => {
    withDoc("Run `bridger frobnicate` now.\n", (dir) => { const r = check(dir); expect(r.status).toBe(1); expect(r.stdout).toContain("`bridger frobnicate` is neither") })
    withDoc("```text extension\nbridger frobnicate   do it\n```\nRun `bridger frobnicate`.\n", (dir) => { expect(check(dir).status).toBe(0) })
    withDoc("```text extension\nbridger check   mine\n```\n", (dir) => { const r = check(dir); expect(r.status).toBe(1); expect(r.stdout).toContain("shadows a kit command") })
  })
})
