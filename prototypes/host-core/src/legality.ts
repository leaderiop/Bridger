// The state × operation table of references/core behaviour 08 (BEH-BR-071), as a pure,
// total function. Every route to an operation consults it (BEH-BR-077).
export type PluginState = "waiting" | "starting" | "active" | "stopping" | "failed" | "disabled"
export type Row = PluginState | "unknown" | "failed-cleanup"
export type Op = "install" | "remove" | "replace" | "retry" | "reconfigure" | "restart" | "disable" | "enable"
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
export const OPS: ReadonlyArray<Op> = ["install", "remove", "replace", "retry", "reconfigure", "restart", "disable", "enable"]

export const legality = (row: Row, op: Op): Outcome => {
  if (row === "unknown") return op === "install" ? P : { kind: "unknown-plugin" }
  if (op === "install") return { kind: "duplicate-plugin" }
  // reconfigure: waiting/disabled store the override; starting/active restart (or update in place,
  // volatile-only); failed starts again — all "proceed", refined by the host (BEH-BR-071, 101, 102).
  if (op === "reconfigure" && row !== "stopping") return row === "failed-cleanup" ? C("cleanup-failure") : P
  switch (row) {
    case "waiting":  return op === "retry" || op === "restart" || op === "enable" ? N : P
    case "starting": return op === "retry" || op === "enable" ? N : P   // restart supersedes the in-flight build
    case "active":   return op === "retry" || op === "enable" ? N : P
    // Not reached from the host: a stopping plugin has a flight (decided by `inFlight`, BEH-BR-072) or a
    // system stop that settles first (BEH-BR-073). Kept so that the table stays total.
    case "stopping": return op === "remove" ? P : C("stopping")
    case "failed":   return op === "enable" ? N : P
    case "failed-cleanup": return op === "remove" ? P : C("cleanup-failure")
    case "disabled": return op === "retry" || op === "restart" ? C("disabled") : op === "disable" ? N : P
  }
}

// The in-flight operation table of BEH-BR-072, without `reconfigure` (no configuration in this prototype).
// Rows: the operator operation in flight on the plugin (also while parked); columns: the incoming call.
export type FlightOp = "remove" | "replace" | "reconfigure" | "restart" | "disable"
export const FLIGHT_OPS: ReadonlyArray<FlightOp> = ["remove", "replace", "reconfigure", "restart", "disable"]
export type InFlightOutcome =
  | { readonly kind: "join" }
  | { readonly kind: "supersede" }
  | { readonly kind: "join-if-equal" }     // reconfigure on reconfigure: equal value joins, different supersedes
  | { readonly kind: "conflict"; readonly pending: FlightOp }
  | { readonly kind: "duplicate-plugin" }

const J: InFlightOutcome = { kind: "join" }
const S: InFlightOutcome = { kind: "supersede" }

export const inFlight = (flight: FlightOp, op: Op): InFlightOutcome => {
  if (op === "install") return { kind: "duplicate-plugin" }
  const conflict: InFlightOutcome = { kind: "conflict", pending: flight }
  switch (flight) {
    case "remove":  return op === "remove" ? J : conflict
    case "replace": return op === "remove" || op === "replace" ? S : conflict
    case "restart": return op === "restart" || op === "reconfigure" ? J : op === "remove" || op === "replace" || op === "disable" ? S : conflict
    case "reconfigure": return op === "reconfigure" ? { kind: "join-if-equal" } : op === "restart" ? J : op === "remove" || op === "replace" || op === "disable" ? S : conflict
    case "disable": return op === "disable" ? J : op === "remove" ? S : conflict
  }
}
