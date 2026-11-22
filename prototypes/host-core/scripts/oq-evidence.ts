// Generates evidence/oq.json and evidence/deviations.json from the test runner's own JSON report. Run: npx vite-node scripts/oq-evidence.ts
// The result of every requirement is computed from that report; nothing here is entered by hand (ADR-BR-035).
import { execFileSync } from "node:child_process"
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { collect, readVitestReport } from "../src/evidence.js"

const root = new URL("../", import.meta.url).pathname
const behaviours = new URL("../../../references/core/behaviors/", import.meta.url).pathname
const known = readdirSync(behaviours).filter((f) => f.endsWith(".md")).flatMap((f) => [...readFileSync(behaviours + f, "utf8").matchAll(/^## (BEH-BR-\d+):/gm)].map((m) => m[1]!))
mkdirSync(root + "evidence", { recursive: true })
const reportPath = root + "evidence/vitest-report.json"
try { execFileSync("npx", ["vitest", "run", "--reporter=json", `--outputFile=${reportPath}`], { cwd: root, stdio: "ignore" }) } catch { /* a failing test still leaves a complete report, which is the point */ }
const ev = collect(readVitestReport(JSON.parse(readFileSync(reportPath, "utf8"))), known)
writeFileSync(root + "evidence/oq.json", JSON.stringify({ source: "vitest-report.json", ...ev }, null, 2) + "\n")
writeFileSync(root + "evidence/deviations.json", JSON.stringify(ev.deviations, null, 2) + "\n")
console.log(JSON.stringify({ ...ev.counts, requirements: known.length, deviations: ev.deviations.length }), ev.statement)
