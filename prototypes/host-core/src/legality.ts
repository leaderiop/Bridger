// The state × operation table of references/core behaviour 08 (BEH-BR-071), as a pure,
// total function. Every route to an operation consults it (BEH-BR-077).
export type PluginState = "waiting" | "starting" | "active" | "stopping" | "failed" | "disabled"
export type Row = PluginState | "unknown" | "failed-cleanup"
export type Op = "install" | "remove" | "replace" | "retry" | "restart" | "disable" | "enable"
export type Outcome =
  | { readonly kind: "proceed" }
  | { readonly kind: "noop" }
  | { readonly kind: "conflict"; readonly pending: string }
  | { readonly kind: "unknown-plugin" }
  | { readonly kind: "duplicate-plugin" }

const P: Outcome = { kind: "proceed" }
const N: Outcome = { kind: "noop" }
const C = (pending: string): Outcome => ({ kind: "conflict", pending })

export const ROWS: ReadonlyArray<Row> = ["unknown", "waiting", "starting", "active", "stopping", "failed", "failed-cleanup", "disabled"]
export const OPS: ReadonlyArray<Op> = ["install", "remove", "replace", "retry", "restart", "disable", "enable"]

export const legality = (row: Row, op: Op): Outcome => {
  if (row === "unknown") return op === "install" ? P : { kind: "unknown-plugin" }
  if (op === "install") return { kind: "duplicate-plugin" }
  switch (row) {
    case "waiting":  return op === "retry" || op === "restart" || op === "enable" ? N : P
    case "starting": return op === "retry" || op === "enable" ? N : P   // restart supersedes the in-flight build
    case "active":   return op === "retry" || op === "enable" ? N : P
    // A stop parked after DrainTimeout (BEH-BR-074): only remove may proceed (it resumes or supersedes the stop);
    // the in-flight table refines this for joins and supersession, which this serial prototype does not reach.
    case "stopping": return op === "remove" ? P : C("stopping")
    case "failed":   return op === "enable" ? N : P
    case "failed-cleanup": return op === "remove" ? P : C("cleanup-failure")
    case "disabled": return op === "retry" || op === "restart" ? C("disabled") : op === "disable" ? N : P
  }
}
