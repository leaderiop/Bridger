// The minimal bus applies S39 and S42: gated retirement with a loss record, and envelope limits that stop one stream only.
import { describe, expect, it } from "vitest"
import { makeBus, type Envelope } from "../src/durablebus.js"

const env = (o: Partial<Envelope> = {}): Envelope => ({ origin: "o", stream: "s", sequence: 1, bytes: 10, annotations: 0, body: "x", ...o })
const bus = (gate: "allow" | "refuse" = "allow") => makeBus({ limits: { maxEnvelopeBytes: 100, maxStreamBytes: 256, maxAnnotations: 2 }, gate: () => gate })
describe("durable bus", () => {
  it("retirement with pending envelopes needs accepted loss, the gate and an attributed actor, and records what was dropped", () => {
    const b = bus(); b.publish("d", env()); b.publish("d", env({ sequence: 2 }))
    const who = { actor: { id: "ops" }, reason: "decommission" }
    expect(b.retire("d", who)).toBe("loss-not-accepted"); expect(b.pending("d")).toBe(2)
    expect(b.retire("d", { ...who, acceptLoss: { count: 2 } })).toBe("retired"); expect(b.pending("d")).toBe(0)
    expect(b.records()).toEqual([{ _tag: "DestinationRetired", actor: "ops", dropped: 2 }])
    const g = bus("refuse"); g.publish("d", env()); expect(g.retire("d", { ...who, acceptLoss: { count: 1 } })).toBe("refused"); expect(g.pending("d")).toBe(1)
  })
  it("an oversize envelope stops its own stream, keeping only the position, and does not touch another stream", () => {
    const b = bus()
    expect(b.receive(env({ bytes: 101 }))).toBe("stopped"); expect(b.receive(env({ sequence: 2 }))).toBe("stopped")
    expect(b.stopped()).toEqual([["rx:o:s", { sequence: 1 }]]); expect(b.receive(env({ stream: "t" }))).toBe("stored")
    expect(b.receive(env({ annotations: 3, stream: "u" }))).toBe("stopped")
  })
})
