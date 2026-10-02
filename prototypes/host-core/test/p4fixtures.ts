// Shared fixtures of the phase-P4 scenarios (behaviours 14–18).
import { Effect } from "effect"
import { AuditSink, IdGenerator, OperationGate, OperationRejected, type Actor, type AuditRecord, type OperationRequest } from "../src/gxp.js"
import * as Host from "../src/host.js"
import { quickClose } from "./fixtures.js"

export const alice: Actor = { id: "user-alice", kind: "user", display: "Alice" }
export const as = (reason?: string, correlationId?: string) => ({ context: { actor: alice, ...(reason ? { reason } : {}), ...(correlationId ? { correlationId } : {}) } })

export const memorySink = () => {
  const records: Array<AuditRecord> = []
  const sink: AuditSink["Service"] = { record: (r) => Effect.sync(() => { if (!records.some((x) => x.recordId === r.recordId)) records.push(r) }) }
  return { records, sink }
}
export const scriptedGate = (decide: (r: OperationRequest) => "allow" | "deny") => {
  const requests: Array<OperationRequest> = []
  const gate: OperationGate["Service"] = {
    authorize: (r) => Effect.suspend(() => {
      requests.push(r)
      return decide(r) === "allow" ? Effect.void : Effect.fail(new OperationRejected({ operation: r.operation, reason: "not approved" }))
    })
  }
  return { requests, gate }
}
const counterIds = () => { let n = 0; return { next: Effect.sync(() => `id-${++n}`) } satisfies IdGenerator["Service"] }

/** A scoped host with optional sink and gate; deterministic record ids. */
export const run = <A, E>(
  body: (host: Host.Host) => Effect.Effect<A, E>,
  opts: { sink?: AuditSink["Service"]; gate?: OperationGate["Service"]; options?: Host.Options } = {}
) => Effect.runPromise(Effect.scoped(Effect.gen(function* () {
  let make = Host.make({ ...quickClose, auditTimeout: 50, gateTimeout: 50, ...opts.options }).pipe(Effect.provideService(IdGenerator, counterIds()))
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
