// Operational evidence from test-runner output (gxp BEH-GX-121, 122, 124, 125; ADR-BR-035, ADR-GX-021): results come only from the runner's own
// machine-readable report, a requirement's outcome follows literally from its tests, and gaps stay gaps. This prototype reads vitest's JSON
// report and resolves `BEH-BR-nnn` tags against the core behaviour headings; the rest of the pack (conformance, package and environment
// records, BEH-GX-126, 127) is not built here.
export type TestStatus = "passed" | "failed" | "skipped"
export interface RunnerTest { readonly id: string; readonly file: string; readonly status: TestStatus }
export type Outcome = "fail" | "pass" | "skipped" | "not covered"
export interface Requirement { readonly outcome: Outcome; readonly tests: ReadonlyArray<RunnerTest> }
export interface Deviation { readonly kind: "unknown-requirement" | "requirement-failed" | "requirement-not-covered"; readonly source: string; readonly subject: string; readonly detail: string; readonly state: "open" }
export interface OqEvidence {
  readonly requirements: Readonly<Record<string, Requirement>>
  readonly counts: { readonly fail: number; readonly pass: number; readonly skipped: number; readonly notCovered: number }
  readonly deviations: ReadonlyArray<Deviation>
  readonly statement: string
}

/** The rule of BEH-GX-124, and no other: fail if any failed; else pass if any passed; else skipped if any skipped; else not covered. */
export const outcomeOf = (statuses: ReadonlyArray<TestStatus>): Outcome =>
  statuses.includes("failed") ? "fail" : statuses.includes("passed") ? "pass" : statuses.includes("skipped") ? "skipped" : "not covered"

export const tagsOf = (name: string): ReadonlyArray<string> => [...new Set(name.match(/\bBEH-BR-\d{1,3}\b/g) ?? [])]

/** Reads vitest's JSON report completely or not at all: a missing or unknown field is an error, never a guess (BEH-GX-122). */
export const readVitestReport = (report: unknown): ReadonlyArray<RunnerTest> => {
  const r = report as { testResults?: Array<{ name?: unknown; assertionResults?: Array<{ fullName?: unknown; status?: unknown }> }> } | null
  if (!r || !Array.isArray(r.testResults)) throw new Error("not a vitest JSON report: no testResults")
  const out: RunnerTest[] = []
  for (const file of r.testResults) {
    if (typeof file.name !== "string" || !Array.isArray(file.assertionResults)) throw new Error("incomplete vitest report: a file without name or assertionResults")
    for (const a of file.assertionResults) {
      if (typeof a.fullName !== "string") throw new Error("incomplete vitest report: a test without fullName")
      const status = a.status === "passed" ? "passed" : a.status === "failed" ? "failed" : a.status === "skipped" || a.status === "pending" || a.status === "todo" ? "skipped" : undefined
      if (!status) throw new Error(`unknown test status ${JSON.stringify(a.status)}`)
      out.push({ id: a.fullName, file: file.name, status })
    }
  }
  return out
}

export const STATEMENT = "Results are the test runner's. A requirement with no executed test is not covered."

export const collect = (tests: ReadonlyArray<RunnerTest>, known: ReadonlyArray<string>): OqEvidence => {
  const claimed = new Map<string, RunnerTest[]>(known.map((k) => [k, []]))
  const deviations: Deviation[] = []
  const unknown = new Set<string>()
  for (const t of tests) for (const tag of tagsOf(t.id)) {
    const list = claimed.get(tag)
    if (list) list.push(t)
    else if (!unknown.has(tag)) { unknown.add(tag); deviations.push({ kind: "unknown-requirement", source: "test-tag", subject: tag, detail: "a test claims a requirement that no specification defines", state: "open" }) }
  }
  const requirements: Record<string, Requirement> = {}
  const counts = { fail: 0, pass: 0, skipped: 0, notCovered: 0 }
  for (const [id, list] of claimed) {
    const outcome = outcomeOf(list.map((t) => t.status))
    requirements[id] = { outcome, tests: list }
    if (outcome === "fail") { counts.fail++; deviations.push({ kind: "requirement-failed", source: "oq", subject: id, detail: "a test of the requirement failed", state: "open" }) }
    else if (outcome === "pass") counts.pass++
    else { if (outcome === "skipped") counts.skipped++; else counts.notCovered++; deviations.push({ kind: "requirement-not-covered", source: "oq", subject: id, detail: "no test of the requirement passed", state: "open" }) }
  }
  return { requirements, counts, deviations, statement: STATEMENT }
}
