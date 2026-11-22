// Report 06 review finding: BEH-BR-185 covers every string of a record at any depth, error.message included, not only actor, reason and correlation.
import { describe, expect, it } from "vitest"
import { sanitizeDeep } from "../src/gxp.js"

describe("sanitizeDeep (BEH-BR-185)", () => {
  it("replaces lone surrogates in nested strings, arrays and objects and leaves valid pairs, keys, numbers and shapes alone", () => {
    const rec = { error: { _tag: "ActivationFailed", message: "bad \ud800 text" }, onBehalfOf: { id: "p\udc00", realm: "r" }, annotations: [{ key: "k", value: "v\ud83d" }], n: 3, ok: "pair 😀", nested: { a: { b: ["\ud800"] } } }
    expect(sanitizeDeep(rec)).toEqual({ error: { _tag: "ActivationFailed", message: "bad � text" }, onBehalfOf: { id: "p�", realm: "r" }, annotations: [{ key: "k", value: "v�" }], n: 3, ok: "pair 😀", nested: { a: { b: ["�"] } } })
  })
})
