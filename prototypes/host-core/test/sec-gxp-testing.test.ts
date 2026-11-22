// Report 06 S32-S37: the testing entry point cannot pass as production.
import { describe, expect, it } from "vitest"
import { gatePosture, iq11, scriptedSignatureCapture, testKeyProvider } from "../src/gxp-testing.js"

describe("gxp testing entry point", () => {
  it("IQ-11 catches a fixture that dropped its own flag (S32)", () => {
    const k = testKeyProvider("s")
    expect(iq11([k.manifest]).length).toBeGreaterThan(0)
    const { fixture: _f, ...stripped } = k.manifest
    expect(iq11([stripped]).map((x) => x.why)).toEqual(["testing name prefix"])
    expect(iq11([{ name: "acme/trail", commit: "in-memory" }, { name: "acme/anchor", custodian: "test fixture" }, { name: "acme/sig", methods: ["test-fixture"] }])).toHaveLength(3)
    expect(iq11([{ name: "acme/trail", commit: "durable" }])).toEqual([])
  })
  it("scriptedSignatureCapture refuses a missing decide at runtime (S34)", () => {
    expect(() => scriptedSignatureCapture(undefined as never)).toThrow(TypeError)
    expect(() => scriptedSignatureCapture(() => undefined)).not.toThrow()
  })
  it("the gate probe fails an approve-everything gate and passes a refusing or throwing one (S35)", () => {
    expect(gatePosture(() => "allow").ok).toBe(false)
    expect(gatePosture(() => "refuse").ok).toBe(true)
    expect(gatePosture(() => { throw new Error("x") }).ok).toBe(true)
  })
  it("a key id carries a digest of the seed, never the seed (S37)", () => {
    const k = testKeyProvider("my-real-secret").key(1)
    expect(k.id).not.toContain("my-real-secret"); expect(k.id).toMatch(/^test:[0-9a-f]{8}:1$/)
    expect(testKeyProvider("a").key(1).bytes.equals(testKeyProvider("a").key(1).bytes)).toBe(true)
    expect(() => testKeyProvider("bad seed")).toThrow()
  })
})
