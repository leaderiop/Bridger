// Report 06 S44: a recordId with a line feed could move bytes between recordId and payload without changing the v2 link hash.
import { describe, expect, it } from "vitest"
import { genericTail } from "../src/audit-chain.js"

describe("generic chain hash input", () => {
  it("refuses a recordId with a control character and accepts a plain one", () => {
    const p = { canon: "jcs-v1", position: (r: { seq: number; id: string }) => ({ seq: r.seq, recordId: r.id }), encode: (r: unknown) => Buffer.from(JSON.stringify(r)) }
    expect(() => genericTail(p as never, { seq: 1, id: "a\nb" })).toThrow(/control/)
    expect(() => genericTail(p as never, { seq: 1, id: "a-b" })).not.toThrow()
  })
})
