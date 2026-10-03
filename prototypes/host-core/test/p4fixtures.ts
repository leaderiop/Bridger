// Shared fixtures of the phase-P4 scenarios (behaviours 14–18).
import { Effect } from "effect"
import { AuditSink, OperationGate, type Actor, type AuditRecord, type OperationRequest } from "../src/gxp.js"
import * as Testing from "../src/testing.js"
import * as Host from "../src/host.js"
import { quickClose } from "./fixtures.js"

export const alice: Actor = { id: "user-alice", kind: "user", display: "Alice" }
export const as = (reason?: string, correlationId?: string) => ({ context: { actor: alice, ...(reason ? { reason } : {}), ...(correlationId ? { correlationId } : {}) } })

/** The testing entry point's sink (BEH-BR-181), with a live view of what it stored. */
export const memorySink = () => {
  const records: Array<AuditRecord> = []
  const m = Effect.runSync(Testing.memoryAuditSink({ behave: (_n, r) => { records.push(r); return "store" } }))
  return { records, sink: m.sink }
}
/** The testing entry point's gate (BEH-BR-182), with a live view of what it was asked. */
export const scriptedGate = (decide: (r: OperationRequest) => "allow" | "deny") => {
  const requests: Array<OperationRequest> = []
  const g = Effect.runSync(Testing.scriptedGate((r) => { requests.push(r); return decide(r) === "allow" ? "allow" : { refuse: "not approved" } }))
  return { requests, gate: g.gate }
}

/** A scoped host with optional sink and gate; deterministic record ids. */
export const run = <A, E>(
  body: (host: Host.Host) => Effect.Effect<A, E>,
  opts: { sink?: AuditSink["Service"]; gate?: OperationGate["Service"]; options?: Host.Options } = {}
) => Effect.runPromise(Effect.scoped(Effect.gen(function* () {
  let make = Host.make({ ...quickClose, auditTimeout: 50, gateTimeout: 50, ...opts.options }).pipe(Effect.provide(Testing.counterIdGenerator("id-")))
  if (opts.sink) make = make.pipe(Effect.provideService(AuditSink, opts.sink))
  if (opts.gate) make = make.pipe(Effect.provideService(OperationGate, opts.gate))
  const host = yield* make
  return yield* body(host)
})))
export const settleWriter = Effect.sleep(20)

export const find = (host: Host.Host, id: string, realm = "default") =>
  Effect.map(host.snapshot, (s) => s.plugins.find((p) => p.id === id && p.realm === realm))
export const stateIn = (host: Host.Host, id: string, realm = "default") =>
  Effect.map(find(host, id, realm), (p) => p?.state ?? "uninstalled")
