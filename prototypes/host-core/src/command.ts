// Minimal command dispatcher (command 02; agent 03; improvement report 06 S45, S48): a command runs only when the gate allows, a tainted request runs only on the
// gate's approval witness, and a failure of an external command reaches the caller as one capped untrusted value. Receipts, batches and long commands are not modelled.
import { envelopeFailure, taintFloor, type Decision } from "./hardening.js"

export interface CommandDef { readonly name: string; readonly external: boolean; readonly read?: boolean; readonly run: (input: unknown) => unknown }
export interface Request { readonly command: string; readonly input: unknown; readonly tainted: boolean; readonly approval?: string }
export type Outcome = { readonly _tag: "Ok"; readonly output: unknown } | { readonly _tag: "Deferred"; readonly reason: string } | { readonly _tag: "Failed"; readonly text: string; readonly tainted: boolean } | { readonly _tag: "Unknown" }

export const makeDispatcher = (defs: ReadonlyArray<CommandDef>, gate: (r: Request) => Decision) => (r: Request): Outcome => {
  const def = defs.find((d) => d.name === r.command)
  if (!def) return { _tag: "Unknown" }
  const d = gate(r)
  if (d._tag === "Refuse") return { _tag: "Deferred", reason: "refused" }
  if (!(def.read && !r.tainted) && taintFloor(r.tainted, d, r.approval) === "defer") return { _tag: "Deferred", reason: "tainted-without-approval" }   // declared reads of a clean session pass
  try { return { _tag: "Ok", output: def.run(r.input) } }
  catch (e) { const f = envelopeFailure(e instanceof Error ? e.name : "Error", e instanceof Error ? e.message : String(e), { external: def.external }); return { _tag: "Failed", ...f } }
}
