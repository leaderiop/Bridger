// The minimal event store applies S38, S40 and S41 end to end.
import { describe, expect, it } from "vitest"
import { AppendRefused, VersionConflict, makeEventStore } from "../src/eventstore.js"

const store = (ask = (_: { mode: "append" | "read"; stream: string }) => true) => { let n = 0; return makeEventStore({ ask, newId: () => `e${++n}` }) }
describe("event store", () => {
  it("appends with an expected version and asks the access policy for append and read", () => {
    const s = store((r) => r.stream !== "secret"); s.append("a", "T", "1", 0)
    expect(() => s.append("a", "T", "2", 0)).toThrow(VersionConflict); expect(s.read("a")).toHaveLength(1)
    expect(() => s.append("secret", "T", "x", 0)).toThrow(AppendRefused); expect(() => s.read("secret")).toThrow(AppendRefused)
  })
  it("the rx: prefix is not appendable, and a received fact is deduplicated by content with conflicts recorded", () => {
    const s = store(); expect(() => s.append("rx:o:s", "T", "x", 0)).toThrow(AppendRefused)
    expect(s.receive("o", "s", { factId: "f", type: "T", payload: "a", version: 1 })).toBe("recorded"); expect(s.receive("o", "s", { factId: "f", type: "T", payload: "a", version: 1 })).toBe("already-recorded")
    expect(s.receive("o", "s", { factId: "f", type: "T", payload: "b", version: 1 })).toBe("conflict")
    expect(s.read("rx:o:s").map((e) => e.type)).toEqual(["T", "FactConflict"]); expect(s.conflicts()).toHaveLength(1)
  })
  it("a snapshot is used while its event is intact and dropped on shred", () => {
    const s = store(); s.append("a", "T", "1", 0); s.append("a", "T", "2", 1)
    s.putSnapshot("a", 2, { sum: 3 }); expect(s.loadSnapshot("a")).toEqual({ sum: 3 })
    s.shred(["a"]); expect(s.loadSnapshot("a")).toBeUndefined()
  })
})
