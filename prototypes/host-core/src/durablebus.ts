// Minimal in-memory durable bus (durable-bus 02, 03; improvement report 06 S39, S42): a transactional outbox per destination and an inbox that refuses oversize
// envelopes, with destination retirement gated, attributed and recorded. Delivery retries, ordering clocks and versions are not modelled.
import { checkEnvelope, receivedStream, retireDestination, type BusOp } from "./hardening.js"

export interface Envelope { readonly origin: string; readonly stream: string; readonly sequence: number; readonly bytes: number; readonly annotations: number; readonly body: string }
export interface Limits { readonly maxEnvelopeBytes: number; readonly maxStreamBytes: number; readonly maxAnnotations: number }
export class EnvelopeStopped extends Error { readonly _tag = "EnvelopeStopped"; constructor(readonly origin: string, readonly stream: string, readonly sequence: number) { super("envelope refused") } }

export const makeBus = (o: { readonly limits: Limits; readonly gate: (r: BusOp) => "allow" | "refuse" }) => {
  const outbox = new Map<string, Envelope[]>(), inbox = new Map<string, Envelope[]>(), stopped = new Map<string, { sequence: number }>(), records: unknown[] = []
  const publish = (destination: string, e: Envelope) => { outbox.set(destination, [...(outbox.get(destination) ?? []), e]) }
  /** A refused envelope stops its (origin, stream), keeping the position only; later envelopes of that stream are held, never skipped. */
  const receive = (e: Envelope): "stored" | "stopped" => {
    const key = receivedStream(e.origin, e.stream, o.limits.maxStreamBytes)
    if (stopped.has(key)) return "stopped"
    if (checkEnvelope({ bytes: e.bytes, stream: e.stream, annotations: e.annotations }, o.limits) !== "ok") { stopped.set(key, { sequence: e.sequence }); return "stopped" }
    inbox.set(key, [...(inbox.get(key) ?? []), e]); return "stored"
  }
  const retire = (destination: string, a: { actor: { id: string }; reason: string; acceptLoss?: { count: number } }) => {
    const pending = outbox.get(destination)?.length ?? 0
    const r = retireDestination({ gate: o.gate, actor: a.actor, reason: a.reason, pending, ...(a.acceptLoss ? { acceptLoss: a.acceptLoss } : {}), records })
    if (r === "retired") outbox.delete(destination)
    return r
  }
  return { publish, receive, retire, pending: (d: string) => outbox.get(d)?.length ?? 0, stopped: () => [...stopped], records: () => records, inbox: (k: string) => inbox.get(k) ?? [] }
}
