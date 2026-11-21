import { FLIGHT_TABLE, STATE_TABLE } from "./legality.table.js"
// The state × operation table of references/core behaviour 08 (BEH-BR-071), as a pure,
// total function. Every route to an operation consults it (BEH-BR-077).
export type PluginState = "dormant" | "waiting" | "starting" | "active" | "stopping" | "failed" | "disabled"
export type Row = PluginState | "unknown" | "failed-cleanup"
export type Op = "install" | "remove" | "replace" | "retry" | "reconfigure" | "restart" | "disable" | "enable" | "abort"
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
export const OPS: ReadonlyArray<Op> = ["install", "remove", "replace", "retry", "reconfigure", "restart", "disable", "enable", "abort"]

const outcomeOf = (cell: string): Outcome =>
  cell === "proceed" ? P : cell === "noop" ? N : cell === "unknown-plugin" || cell === "duplicate-plugin" ? { kind: cell } : C(cell.replace(/^conflict:/, ""))

/** BEH-BR-071, from the transition ledger (references/core/transitions.yaml). Every route to an operation consults it (BEH-BR-077). */
export const legality = (row: Row, op: Op): Outcome => outcomeOf(STATE_TABLE[row]![op]!)

// The in-flight operation table of BEH-BR-072, without `reconfigure` (no configuration in this prototype).
// Rows: the operator operation in flight on the plugin (also while parked); columns: the incoming call.
export type FlightOp = "remove" | "replace" | "reconfigure" | "restart" | "disable"
export const FLIGHT_OPS: ReadonlyArray<FlightOp> = ["remove", "replace", "reconfigure", "restart", "disable"]
export type InFlightOutcome =
  | { readonly kind: "join" }
  | { readonly kind: "supersede" }
  | { readonly kind: "join-if-equal" }     // reconfigure on reconfigure: equal value joins, different supersedes
  | { readonly kind: "abort-if-parked" }   // abort: proceeds on a parked stop, conflicts while the drain still runs
  | { readonly kind: "conflict"; readonly pending: FlightOp }
  | { readonly kind: "duplicate-plugin" }

export const inFlight = (flight: FlightOp, op: Op): InFlightOutcome => {
  const cell = FLIGHT_TABLE[flight]![op]!
  return cell.startsWith("conflict:") ? { kind: "conflict", pending: flight } : cell === "duplicate-plugin" ? { kind: "duplicate-plugin" } : { kind: cell as "join" | "supersede" | "join-if-equal" | "abort-if-parked" }
}
