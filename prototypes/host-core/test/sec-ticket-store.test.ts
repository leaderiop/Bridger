// S71: ticket and anchor store conformance, hash-chained ticket events, authentication event reuse, trail counts seeded from the store, received actors, verbatim receive, restore conflict.
import { describe, expect, it } from "vitest"
import { makeBus } from "../src/durablebus.js"
import { makeEventStore } from "../src/eventstore.js"
import { makeAnchorStore, makeTicketStore, makeTrailCounts, runAnchorStoreConformance, runTicketStoreConformance } from "../src/gxp-ticket.js"
import { mayApprove, receivedActor } from "../src/hardening.js"
import { PayloadDecodeFailed } from "../src/keyring.js"

describe("ticket and anchor stores", () => {
  it("the shipped stores pass their conformance suites; a read-then-write store fails", () => {
    for (const c of [...runTicketStoreConformance(makeTicketStore), ...runAnchorStoreConformance(makeAnchorStore)]) expect(c.pass, c.name).toBe(true)
    const racy = () => { const s = makeTicketStore(); return { ...s, append: (id: string, e: never, _v: number) => s.append(id, e, s.events(id).length) } }
    expect(runTicketStoreConformance(racy as never).some((c) => !c.pass)).toBe(true)
  })
  it("ticket events are hash-chained: an edited or removed event is a break; an authentication event is used once", () => {
    const s = makeTicketStore(); s.append("t", { kind: "issued" }, 0); s.append("t", { kind: "signed", signer: "a", authEvent: "e1" }, 1); s.append("t", { kind: "signed", signer: "b", authEvent: "e2" }, 2)
    expect(s.verify("t")).toEqual([]); const head = s.head("t")
    s._tamper("t", (l) => [l[0]!, { ...l[1]!, signer: "z" }, l[2]!]); expect(s.verify("t")).toEqual([3])
    s._tamper("t", (l) => l.slice(0, 1)); expect(s.verify("t")).toEqual([]); expect(s.head("t")).not.toBe(head)      // truncation is visible only against a pinned head
    const u = makeTicketStore(); u.append("t1", { kind: "signed", signer: "a", authEvent: "e" }, 0)
    expect(u.append("t2", { kind: "signed", signer: "a", authEvent: "e" }, 0)).toBe("authEventReused"); expect(u.append("t1", { kind: "signed", signer: "b", authEvent: "e" }, 1)).toBe("authEventReused")
  })
  it("a restart over a store that holds a collision still refuses until an attributed acknowledgement writes a record", () => {
    const records: unknown[] = [], c = makeTrailCounts({ collisions: () => 1 }, records)
    expect(c.refuses()).toBe(true); expect(c.acknowledge({ id: "bridger:x" }, "r")).toBe("refused"); expect(c.refuses()).toBe(true)
    expect(c.acknowledge({ id: "qa-1" }, "reviewed")).toBe("acknowledged"); expect(c.refuses()).toBe(false); expect(records).toHaveLength(1)
  })
})
describe("received data", () => {
  it("receiveVerbatim refuses peer plaintext at a selected path and keeps an encrypted or shredded form", () => {
    const s = makeEventStore({ ask: () => true, newId: (() => { let n = 0; return () => `e${++n}` })() })
    const f = (payload: object, id: string) => ({ factId: id, type: "t", payload: JSON.stringify(payload), version: 1 })
    expect(() => s.receiveVerbatim("o", "s", f({ pii: { email: "a@b.c" } }, "f1"), ["pii.email"])).toThrow(PayloadDecodeFailed)
    expect(s.receiveVerbatim("o", "s", f({ pii: { email: { $encrypted: 1, subject: "u", kv: 0, n: "", c: "" } } }, "f2"), ["pii.email"])).toBe("recorded")
    expect(s.receiveVerbatim("o", "s", f({ pii: { email: { $shredded: 1, subject: "u", path: "pii.email" } } }, "f3"), ["pii.email"])).toBe("recorded")
  })
  it("a restored sender re-using a sequence with a new eventId is a conflict even after the inbox purged the first envelope", () => {
    const b = makeBus({ limits: { maxEnvelopeBytes: 100, maxStreamBytes: 64, maxAnnotations: 4 }, gate: () => "allow" })
    const e = (sequence: number, eventId: string) => ({ origin: "o", stream: "s", sequence, bytes: 1, annotations: 0, body: "", eventId })
    expect([b.accept(e(1, "a")), b.accept(e(1, "a")), b.accept(e(1, "b")), b.accept(e(2, "c"))]).toEqual(["accepted", "duplicate", "EnvelopeConflict", "accepted"])
  })
  it("a received handler runs as a peer actor with the claimed actor as onBehalfOf, and a peer never approves unless its origin is allowed", () => {
    const r = receivedActor("node-b", { id: "alice-approver", kind: "user" })
    expect(r.actor.id).toBe("peer:node-b"); expect(r.onBehalfOf.id).toBe("alice-approver")
    expect(mayApprove(r.actor)).toBe(false); expect(mayApprove(r.actor, new Set(["node-b"]))).toBe(true); expect(mayApprove({ id: "alice-approver" })).toBe(true)
  })
})
