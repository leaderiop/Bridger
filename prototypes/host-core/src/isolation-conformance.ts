// Isolation conformance suite (remote BEH-RM-073, improvement report 06 R3): six numbered negative probes per adapter, manifest first and
// result-free, `reached` and `unsupported` both fail. It is evidence for the OQ pack, not a verdict on every route (BEH-RM-053).
import { Effect } from "effect"

export const PROBES = ["egress", "filesystem", "environment", "cpu", "memory", "module-cache"] as const
export type Probe = typeof PROBES[number]
export type Attempt = "reached" | "refused" | "unsupported"
export interface IsolationProbe { readonly attempt: (probe: Probe) => Effect.Effect<Attempt> }
export interface IsolationManifest {
  readonly adapter: string
  readonly cases: ReadonlyArray<{ readonly id: string; readonly probe: Probe }>
  readonly results: ReadonlyArray<{ readonly id: string; readonly outcome: "withheld" | "reached" | "unsupported" }>
  readonly scope: string
}
export type Register = (name: string, run: () => Promise<void>) => void

const SCOPE = "six probes of this adapter in the run's environment; says nothing of other routes (BEH-RM-053)"
export const caseId = (n: number) => `ISO-${String(n).padStart(2, "0")}`

/** The manifest of cases, with no result in it, built before any case runs (BEH-RM-073). */
export const isolationManifest = (adapter: string): IsolationManifest =>
  ({ adapter, cases: PROBES.map((probe, i) => ({ id: caseId(i + 1), probe })), results: [], scope: SCOPE })

/** Registers one case per probe with the caller's registrar and returns the manifest, which fills in its results as the cases run. */
export const runIsolationConformance = (adapter: string, probe: IsolationProbe, options: { readonly register: Register }): { readonly manifest: () => IsolationManifest } => {
  const base = isolationManifest(adapter)
  const results: Array<IsolationManifest["results"][number]> = []
  for (const c of base.cases) options.register(`BEH-RM-073 ${c.id} ${adapter}: ${c.probe} is withheld`, async () => {
    const got = await Effect.runPromise(probe.attempt(c.probe))
    results.push({ id: c.id, outcome: got === "refused" ? "withheld" : got })
    if (got !== "refused") throw new Error(`${c.id} ${c.probe}: ${got}`)
  })
  return { manifest: () => ({ ...base, results: [...results] }) }
}
