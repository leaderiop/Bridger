// Round-9 High scenarios H3 to H6 (SPEC-AUDIT-09; improvement report 07, F13): agent replay of a spawn, sequence supersession on a running host, reads across a store swap.
import { describe, expect, it } from "vitest"
import { makeReplay, ReplayDiverged } from "../src/agent.js"
import { makeSeriesNode, NotOwner, SupersessionPending } from "../src/sequence.js"
import { makeSwapReads, StoreSwapInProgress } from "../src/eventstore.js"

describe("H3 agent check 10 (BEH-AG-035): a reserved spawn call during replay", () => {
  const rec = [{ callId: "c1", args: "a", outcome: "done", tainted: true }, { callId: "c2", args: "b", outcome: "ok", tainted: false }]
  it("runs no subagent, answers with the recorded outcome and taints from the record", () => {
    const r = makeReplay(rec)
    expect(r.spawn("c2", "b")).toBe("ok"); expect(r.tainted()).toBe(false)
    expect(r.spawn("c1", "a")).toBe("done"); expect(r.tainted()).toBe(true)
    expect(r.transcript()).toEqual([{ callId: "c2", outcome: "ok" }, { callId: "c1", outcome: "done" }])    // nothing of a subagent
  })
  it("a missing or different call fails with ReplayDiverged", () => {
    const r = makeReplay(rec)
    expect(() => r.spawn("c9", "a")).toThrow(ReplayDiverged); expect(() => r.spawn("c1", "other")).toThrow(ReplayDiverged)
    expect((() => { try { r.spawn("c1", "other") } catch (e) { return (e as ReplayDiverged).why } })()).toBe("different")
  })
})

describe("H4 sequence check 11 (BEH-SQ-002, 009, 010): a whole-store install on a running host", () => {
  it("fails an old handle with NotOwner, holds new calls until the step commits, supersedes each series once with its highest", () => {
    const n = makeSeriesNode("n1"); const old = n.open("inv"); expect(n.next(old)).toBe(1)
    n.installed()
    const before = n.events().length
    expect(() => n.next(old)).toThrow(NotOwner); expect(n.events()).toHaveLength(before)                // writes nothing
    const fresh = n.open("inv"); expect(() => n.next(fresh)).toThrow(SupersessionPending)
    n.commitStep(new Map([["inv", 7], ["dup", 3]]), new Set(["dup"]))                                       // dup is already superseded by the snapshot
    const sup = n.events().filter((e) => e.kind === "SeriesSuperseded")
    expect(sup).toEqual([{ kind: "SeriesSuperseded", series: "inv", highest: 7, lastKnownOnly: false, actor: { kind: "service", id: "sequence:n1" } }])
    expect(n.next(fresh)).toBe(8); expect(n.events().at(-1)).toMatchObject({ kind: "NumberIssued", number: 8, previous: 7 })   // a name reopened writes previous
  })
})

describe("H5, H6 event-store check 18 (BEH-ES-040): reads across the store swap", () => {
  const pages = new Map([["s", [["a", "b"], ["c"]]]])
  it("read decodes nothing while frozen and a lazy read begun before the freeze fails at its page in flight", () => {
    const s = makeSwapReads(pages); const lazy = s.read("s"); expect(lazy.next()).toEqual({ page: ["a", "b"] })
    s.freeze(); const during = s.read("s")
    expect(() => lazy.next()).toThrow(StoreSwapInProgress); expect(during.next()).toBe("waiting")
    s.whenReadable(); expect(during.next()).toEqual({ page: ["a", "b"] }); expect(() => lazy.next()).toThrow(StoreSwapInProgress)   // stays dead
  })
  it("readIn is refused by the fence instead of waiting, and dies on a page pulled after its transaction ended", () => {
    const s = makeSwapReads(pages); const tx = { ended: false }; const it1 = s.readIn(tx, "s"); expect(it1.next()).toEqual({ page: ["a", "b"] })
    tx.ended = true; expect(() => it1.next()).toThrow(/transaction ended/)
    s.freeze(); expect(() => s.readIn({ ended: false }, "s")).toThrow(StoreSwapInProgress)
  })
  it("a participant's prepare reads through readForSwap while frozen; read from prepare dies naming participant and step", () => {
    const s = makeSwapReads(pages); s.freeze()
    expect(s.prepare("seq", 2, (step) => s.readForSwap(step, "s"))).toEqual(["a", "b", "c"])
    expect(() => s.prepare("seq", 2, () => s.read("s"))).toThrow(/prepare of seq at step 2/)
    expect(() => s.readForSwap({ participant: "seq", step: 2 }, "s")).toThrow(/SwapStep/)
  })
})
