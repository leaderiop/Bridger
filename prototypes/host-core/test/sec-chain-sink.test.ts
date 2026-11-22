// S60: the sink marks breaks and hands the verifier the markers it recorded, so a stripped marker is reported.
import { describe, expect, it } from "vitest"
import { exportBundle, verifyBundle } from "../src/audit-chain.js"
import { makeChainSink } from "../src/chain-sink.js"

const rec = (n: number, extra: object = {}) => ({ hostId: "h1", auditSeq: n, recordId: `r${n}`, kind: "x", auditDropped: 0, ...extra })
const bundle = (entries: ReturnType<ReturnType<typeof makeChainSink>["entries"]>) => exportBundle({ createdAt: "2026-01-01T00:00:00.000Z", series: [{ seriesId: "h1", entries }], trustRoots: [{ kind: "anchor-key", anchor: "log", publicKey: "k" }] })
describe("chain sink", () => {
  it("an identical retry changes nothing; a different retry and a skipped seq are appended with markers the verifier reports", () => {
    const s = makeChainSink("h1")
    expect([s.append(rec(1)), s.append(rec(1)), s.append(rec(2)), s.append(rec(2, { kind: "y" })), s.append(rec(5))]).toEqual(["appended", "retry", "appended", "retry-mismatch", "chain-order"])
    expect(s.size()).toBe(4)
    const breaks = verifyBundle(bundle(s.entries()), { expectedBreaks: s.expectedBreaks() }).chain.h1!.breaks
    expect(breaks.filter((b) => b.kind === "sink-marked").map((b) => b.marker).sort()).toEqual(["chain-order", "retry-mismatch"])   // and no false "stripped" for the original at a repeated seq
  })
  it("stripping a marker from the stored links is reported when the sink's markers are passed to the verifier", () => {
    const s = makeChainSink("h1"); s.append(rec(1)); s.append(rec(3))
    const stripped = s.entries().map((e) => { const { break: _b, ...link } = e.link as Record<string, unknown>; return { ...e, link } }) as never
    expect(verifyBundle(bundle(stripped), { expectedBreaks: s.expectedBreaks() }).chain.h1!.breaks).toContainEqual({ seq: 3, kind: "sink-marked", marker: "stripped" })
    expect(verifyBundle(bundle(stripped)).chain.h1!.breaks.filter((b) => b.kind === "sink-marked")).toEqual([])
  })
})
