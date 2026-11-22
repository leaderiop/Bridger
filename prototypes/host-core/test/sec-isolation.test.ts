// Report 06 R3 (S4): the isolation conformance suite has teeth: a worker_threads adapter reaches the network-less probes it cannot withhold,
// a withholding double passes, an unsupported probe fails (BEH-RM-073).
import { Worker } from "node:worker_threads"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { PROBES, caseId, isolationManifest, runIsolationConformance, type Attempt, type IsolationProbe, type Probe } from "../src/isolation-conformance.js"
import { tagsOf } from "../src/evidence.js"

const CODE: Record<string, string> = {
  filesystem: `require("node:fs").readdirSync("/"); "reached"`,
  environment: `process.env.PATH !== undefined ? "reached" : "refused"`,
  egress: `typeof fetch === "function" ? "reached" : "refused"`
}
/** A real `worker_threads` guest: it shares the process, so it reaches the file system, the environment and a global fetch. */
const workerAdapter: IsolationProbe = {
  attempt: (probe: Probe) => Effect.promise<Attempt>(() => new Promise((resolve) => {
    const code = CODE[probe]
    if (!code) return resolve("unsupported")
    const w = new Worker(`const {parentPort}=require("node:worker_threads");let r;try{r=eval(${JSON.stringify(code)})}catch{r="refused"};parentPort.postMessage(r)`, { eval: true, env: { ...process.env } })
    w.once("message", (m) => { void w.terminate(); resolve(m as Attempt) })
    w.once("error", () => resolve("refused"))
  }))
}
const run = async (adapter: string, probe: IsolationProbe) => {
  const tests: Array<[string, () => Promise<void>]> = []
  const suite = runIsolationConformance(adapter, probe, { register: (n, f) => { tests.push([n, f]) } })
  const failed: Array<string> = []
  for (const [name, f] of tests) await f().catch(() => { failed.push(name) })
  return { tests, failed, manifest: suite.manifest() }
}

describe("isolation conformance suite (BEH-RM-073)", () => {
  it("the manifest of six numbered cases is result-free and ids are stable", () => {
    const m = isolationManifest("x")
    expect(m.cases.map((c) => c.id)).toEqual(PROBES.map((_, i) => caseId(i + 1)))
    expect(m.cases[0]).toEqual({ id: "ISO-01", probe: "egress" })
    expect(m.results).toEqual([])
  })
  it("a worker_threads adapter fails egress, filesystem and environment, and unsupported probes fail too (never skipped)", async () => {
    const r = await run("@bridger/worker", workerAdapter)
    expect(r.tests).toHaveLength(6)
    expect(r.failed.map((n) => n.match(/ISO-\d\d/)![0])).toEqual(["ISO-01", "ISO-02", "ISO-03", "ISO-04", "ISO-05", "ISO-06"])
    expect(r.manifest.results.find((x) => x.id === "ISO-02")?.outcome).toBe("reached")
    expect(r.manifest.results.find((x) => x.id === "ISO-04")?.outcome).toBe("unsupported")
  })
  it("an adapter that withholds every probe passes all six", async () => {
    const r = await run("withholding", { attempt: () => Effect.succeed("refused" as const) })
    expect(r.failed).toEqual([])
    expect(r.manifest.results.every((x) => x.outcome === "withheld")).toBe(true)
  })
  it("tests claim BEH-RM and BEH-GX ids as evidence tags", () => {
    expect(tagsOf("BEH-RM-073 ISO-01 w: x; BEH-GX-130; BEH-BR-5")).toEqual(["BEH-RM-073", "BEH-GX-130", "BEH-BR-5"])
  })
})
