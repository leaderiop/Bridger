// Report 07, R6 (v): a risk row's Controls cell is what the sources say; a dropped Risk link is caught and regenerated.
import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const script = new URL("../../../references/core/scripts/verify-risk-rows.py", import.meta.url).pathname
const fixture = (behRisk: string) => {
  const core = mkdtempSync(join(tmpdir(), "core-"))
  for (const d of ["gxp", "behaviors"]) mkdirSync(join(core, d))
  writeFileSync(join(core, "gxp", "03-risk-assessment.md"), '# R\n\n<a id="rsk-br-001"></a>\n\nControl: BEH-BR-001.\n')
  writeFileSync(join(core, "behaviors", "01.md"), `## BEH-BR-001: a\n\n> **Risk:** [RSK-BR-001](x)\n\n## BEH-BR-002: b\n\n${behRisk}\n`)
  writeFileSync(join(core, "invariants.md"), "## INV-BR-001: i\n\ntext\n")
  writeFileSync(join(core, "traceability.md"), "## §7 Risk traceability\n\n| Risk | Hazard | Controls | Verified by |\n| --- | --- | --- | --- |\n| [RSK-BR-001](gxp/03-risk-assessment.md#rsk-br-001) | h | BEH-BR-001, BEH-BR-002 | REQ-BR-001 |\n")
  return core
}
const run = (core: string, ...args: Array<string>) => spawnSync("python3", ["-I", script, ...args], { encoding: "utf8", env: { ...process.env, RISK_ROWS_CORE: core } })

describe("verify-risk-rows.py", () => {
  it("accepts a row that matches the entry and the behaviours' Risk fields", () => {
    expect(run(fixture("> **Risk:** [RSK-BR-001](x)")).status).toBe(0)
  })
  it("reports a control the sources no longer name, and regenerates the cell", () => {
    const core = fixture("> **Risk:** [RSK-BR-002](x)")
    const r = run(core)
    expect(r.status).toBe(1); expect(r.stdout).toContain("row only: ['BEH-BR-002']")
    run(core, "--write")
    expect(readFileSync(join(core, "traceability.md"), "utf8")).toContain("| h | BEH-BR-001 | REQ-BR-001 |")
    expect(run(core).status).toBe(0)
  })
  it("the repository passes", () => {
    expect(spawnSync("python3", ["-I", script], { encoding: "utf8" }).status).toBe(0)
  })
})
