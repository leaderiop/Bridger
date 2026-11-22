// The minimal sequence authority applies S51: foreign-origin events cannot forge, suppress or close a series.
import { describe, expect, it } from "vitest"
import { makeSequenceAuthority, type SeriesEvent } from "../src/sequence.js"

const ev = (o: Partial<SeriesEvent>): SeriesEvent => ({ kind: "NumberIssued", seriesId: "inv", number: 1, envelopeOrigin: "a", streamOrigin: "a", seriesOrigin: "a", ...o })
describe("sequence authority", () => {
  it("reports gaps and duplicates from the series' own events", () => {
    const s = makeSequenceAuthority(); for (const n of [1, 2, 4, 4]) s.accept(ev({ number: n }))
    expect(s.verifySeries("inv")).toMatchObject({ gaps: [3], duplicates: [4], closed: false, foreignWriter: false })
  })
  it("a foreign-origin NumberIssued or SeriesClosed is quarantined and changes nothing but foreignWriter", () => {
    const s = makeSequenceAuthority(); s.accept(ev({ number: 1 }))
    expect(s.accept(ev({ number: 2, envelopeOrigin: "evil" }))).toBe("quarantined"); expect(s.accept(ev({ kind: "SeriesClosed", reason: "retired", streamOrigin: "evil" }))).toBe("quarantined")
    expect(s.verifySeries("inv")).toEqual({ gaps: [], duplicates: [], closed: false, foreignWriter: true }); expect(s.quarantined()).toBe(2)
  })
  it("a SeriesClosed reason is a code, not free text", () => {
    const s = makeSequenceAuthority()
    expect(s.accept(ev({ kind: "SeriesClosed", reason: "Patient John Doe left" }))).toBe("invalid"); expect(s.accept(ev({ kind: "SeriesClosed", reason: "retired" }))).toBe("recorded")
  })
})
