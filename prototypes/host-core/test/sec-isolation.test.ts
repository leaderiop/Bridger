// Report 06 R3 (S4): the isolation conformance suite has teeth: a worker_threads adapter reaches the network-less probes it cannot withhold,
// a withholding double passes, an unsupported probe fails (BEH-RM-073).
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { PROBES, caseId, isolationManifest, runIsolationConformance, type Attempt, type IsolationProbe, type Probe } from "../src/isolation-conformance.js"
import { tagsOf } from "../src/evidence.js"
import { openWorker, workerProbe } from "../src/worker-adapter.js"

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
  it("the worker adapter withholds environment, CPU, memory and the module cache, and fails egress and filesystem; an unknown probe is unsupported and fails", async () => {
    const r = await run("@bridger/worker", workerProbe)
    expect(r.tests).toHaveLength(6)
    expect(r.failed.map((n) => n.match(/ISO-\d\d/)![0])).toEqual(["ISO-01", "ISO-02"])
    expect(Object.fromEntries(r.manifest.results.map((x) => [x.id, x.outcome]))).toEqual({ "ISO-01": "reached", "ISO-02": "reached", "ISO-03": "withheld", "ISO-04": "withheld", "ISO-05": "withheld", "ISO-06": "withheld" })
    const odd = await run("odd", { attempt: (p) => p === "cpu" ? Effect.succeed("unsupported" as const) : Effect.succeed("refused" as const) })
    expect(odd.failed).toHaveLength(1)
    expect(odd.manifest.results.find((x) => x.id === "ISO-04")?.outcome).toBe("unsupported")
  }, 20_000)
  it("the adapter carries string frames both ways and opens the guest only when asked", async () => {
    const g = await Effect.runPromise(openWorker(`const { parentPort } = require("node:worker_threads"); parentPort.on("message", (m) => parentPort.postMessage(m.toUpperCase()))`))
    await Effect.runPromise(g.conn.send("ping"))
    expect(await Effect.runPromise(g.conn.receive)).toBe("PING")
    await Effect.runPromise(g.close)
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
