// Generates evidence/oq.json and evidence/deviations.json from the test runner's own JSON report. Run: npx vite-node scripts/oq-evidence.ts
// The result of every requirement is computed from that report; nothing here is entered by hand (ADR-BR-035).
import { execFileSync } from "node:child_process"
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { hostname } from "node:os"
import { collect, readTraceRows, readVitestReport, rollup } from "../src/evidence.js"
import { captureRunEnvironment, installedPackage, judgeRun } from "../src/runenv.js"

const root = new URL("../", import.meta.url).pathname
const behaviours = new URL("../../../references/core/behaviors/", import.meta.url).pathname
const known = readdirSync(behaviours).filter((f) => f.endsWith(".md")).flatMap((f) => [...readFileSync(behaviours + f, "utf8").matchAll(/^## (BEH-BR-\d+):/gm)].map((m) => m[1]!))
mkdirSync(root + "evidence", { recursive: true })
const reportPath = root + "evidence/vitest-report.json"
try { execFileSync("npx", ["vitest", "run", "--reporter=json", `--outputFile=${reportPath}`], { cwd: root, stdio: "ignore" }) } catch { /* a failing test still leaves a complete report, which is the point */ }
// This prototype is the core itself, so its installed dependency set is `effect` alone; the gxp companion and audit-chain are not part of it.
const lockfile = root + "package-lock.json", REQUIRED = ["effect"]
const run = captureRunEnvironment({ executor: process.env.USER ?? "unknown", suiteVersion: "host-core-prototype", packageRoot: root, lockfile, names: REQUIRED, loaded: [], now: () => new Date(), machine: hostname() })
const installed = REQUIRED.flatMap((n) => installedPackage(n, root, readFileSync(lockfile, "utf8")) ?? [])
const judged = judgeRun(run, installed, REQUIRED)
// BEH-GX-126: a run that is not counted contributes no result to any requirement.
const ev = collect(judged.counted ? readVitestReport(JSON.parse(readFileSync(reportPath, "utf8"))) : [], known)
const deviations = [...ev.deviations, ...judged.deviations]
writeFileSync(root + "evidence/oq.json", JSON.stringify({ source: "vitest-report.json", run, runCounted: judged.counted, ...ev, deviations }, null, 2) + "\n")
writeFileSync(root + "evidence/deviations.json", JSON.stringify(deviations, null, 2) + "\n")
const rows = readTraceRows(readFileSync(new URL("../../../references/core/traceability.md", import.meta.url).pathname, "utf8"))
const reqs = rollup(ev, rows)
writeFileSync(root + "evidence/requirements.json", JSON.stringify(reqs, null, 2) + "\n")   // derived from oq.json; traceability.md itself is not edited
const tally: Record<string, number> = {}; for (const r of Object.values(reqs)) tally[r.outcome] = (tally[r.outcome] ?? 0) + 1
console.log("requirement rows:", JSON.stringify(tally))
console.log(JSON.stringify({ ...ev.counts, requirements: known.length, deviations: deviations.length, runCounted: judged.counted }), ev.statement)
