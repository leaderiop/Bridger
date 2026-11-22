// Minimal ticket and anchor stores with their conformance suites (gxp 09, 10, 12; improvement report 06 S71): per-ticket hash-chained events, compare-and-set
// appends, a signature's authentication event used once, and a trail gate whose condition counts are seeded from the store and cleared only by a record.
// Storage is a Map; signature capture, tokens and the real adapters are not modelled.
import { createHash } from "node:crypto"

const dig = (x: unknown) => createHash("sha256").update(JSON.stringify(x)).digest("hex")
export interface TicketEvent { readonly kind: "issued" | "signed" | "consumed"; readonly signer?: string; readonly authEvent?: string }
export interface StoredTicketEvent extends TicketEvent { readonly eventSeq: number; readonly prev: string }

export const makeTicketStore = () => {
  const tickets = new Map<string, StoredTicketEvent[]>(), authEvents = new Map<string, string>()   // authEvent -> "ticket/signer"
  const headOf = (id: string) => { const l = tickets.get(id) ?? []; return l.length ? dig(l.at(-1)) : "" }
  /** Compare-and-set on the event count; a signed event whose authentication event was used by another signer or ticket is refused. */
  const append = (id: string, e: TicketEvent, expectedVersion: number): "stored" | "conflict" | "authEventReused" => {
    const l = tickets.get(id) ?? []
    if (l.length !== expectedVersion) return "conflict"
    if (e.kind === "signed") {
      const use = `${id}/${e.signer}`, seen = e.authEvent === undefined || e.authEvent.trim() === "" ? undefined : authEvents.get(e.authEvent)
      if (e.authEvent === undefined || e.authEvent.trim() === "" || (seen !== undefined && seen !== use)) return "authEventReused"
      authEvents.set(e.authEvent, use)
    }
    tickets.set(id, [...l, { ...e, eventSeq: l.length + 1, prev: headOf(id) }]); return "stored"
  }
  /** Breaks in a ticket's chain: a gap in eventSeq or a `prev` that is not the digest of the entry before. */
  const verify = (id: string): ReadonlyArray<number> => (tickets.get(id) ?? []).flatMap((e, i, l) => (e.eventSeq !== i + 1 || e.prev !== (i ? dig(l[i - 1]) : "") ? [e.eventSeq] : []))
  return { append, verify, events: (id: string) => tickets.get(id) ?? [], head: headOf, _tamper: (id: string, f: (l: StoredTicketEvent[]) => StoredTicketEvent[]) => tickets.set(id, f([...(tickets.get(id) ?? [])])) }
}

export const makeAnchorStore = () => {
  const list: Array<{ seq: number; statement: string }> = []
  return { append: (statement: string, expectedLast: number): "stored" | "conflict" => { if ((list.at(-1)?.seq ?? 0) !== expectedLast) return "conflict"; list.push({ seq: expectedLast + 1, statement }); return "stored" }, latest: () => list.at(-1), all: () => list }
}

export interface ConformanceCase { readonly name: string; readonly pass: boolean }
/** Cases a consumer's ticket store adapter must pass before production (ADR-GX-013): exactly one of two writers at one version stores, events are contiguous and chained, no update path. */
export const runTicketStoreConformance = (make: () => ReturnType<typeof makeTicketStore>): ReadonlyArray<ConformanceCase> => {
  const s = make(), a = s.append("t", { kind: "issued" }, 0), b = s.append("t", { kind: "issued" }, 0)
  const s2 = make(); s2.append("t", { kind: "issued" }, 0); s2.append("t", { kind: "signed", signer: "a", authEvent: "e1" }, 1)
  const reuse = s2.append("t", { kind: "signed", signer: "b", authEvent: "e1" }, 2), blank = s2.append("t", { kind: "signed", signer: "c", authEvent: " " }, 2)
  return [{ name: "two writers at one version: exactly one stores", pass: [a, b].filter((x) => x === "stored").length === 1 },
    { name: "eventSeq is contiguous and the chain verifies", pass: s2.verify("t").length === 0 && s2.events("t").map((e) => e.eventSeq).join() === "1,2" },
    { name: "an authentication event is not reused by another signer", pass: reuse === "authEventReused" }, { name: "a blank authentication event is refused", pass: blank === "authEventReused" }]
}
export const runAnchorStoreConformance = (make: () => ReturnType<typeof makeAnchorStore>): ReadonlyArray<ConformanceCase> => {
  const s = make(), a = s.append("x", 0), b = s.append("y", 0), c = s.append("z", 1)
  return [{ name: "two appenders at one position: exactly one stores", pass: [a, b].filter((x) => x === "stored").length === 1 }, { name: "latest is the highest appended", pass: c === "stored" && s.latest()?.statement === "z" }]
}

/** trailGate condition counts: seeded from the store at build, so a restart over a collision still refuses; cleared only by an attributed acknowledgement that writes a record (S71). */
export const makeTrailCounts = (store: { readonly collisions: () => number }, records: unknown[]) => {
  let acknowledged = 0
  const open = () => store.collisions() - acknowledged
  return { refuses: () => open() > 0, open,
    acknowledge: (actor: { id: string }, reason: string): "acknowledged" | "refused" => { if (!actor.id.trim() || actor.id.startsWith("bridger:") || !reason.trim()) return "refused"; acknowledged = store.collisions(); records.push({ _tag: "TrailConditionAcknowledged", actor: actor.id, reason }); return "acknowledged" } }
}
