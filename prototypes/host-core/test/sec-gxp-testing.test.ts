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

import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { fixtureWarning } from "../src/gxp-testing.js"
import { checkTrail } from "../src/trailcheck.js"

describe("check 41 and 31 additions (S33, S36)", () => {
  it("no main-entry module imports the testing module (import graph)", () => {
    const src = join(__dirname, "../src")
    const offenders = readdirSync(src).filter((f) => f.endsWith(".ts") && f !== "gxp-testing.ts" && /from "\.\/gxp-testing(\.js)?"/.test(readFileSync(join(src, f), "utf8")))
    expect(offenders).toEqual([])
  })
  it("the signature has method test-fixture, two components and a numbered event; one warning line names fixtures and nothing else", () => {
    const sig = scriptedSignatureCapture(() => ({ signer: { id: "qa" } }))
    expect(sig.sign({ ticketId: "t1" })).toMatchObject({ method: "test-fixture", components: 2, event: "test-fixture:1", ticketId: "t1" })
    expect(sig.sign({ ticketId: "t2" })!.event).toBe("test-fixture:2")
    const w = fixtureWarning([sig.manifest, { name: "acme/trail" }])
    expect(w).toBe("warning: test fixtures wired: @bridger/gxp/testing/scriptedSignatureCapture"); expect(w).not.toContain("\n")
    expect(fixtureWarning([{ name: "acme/trail" }])).toBeUndefined()
  })
  it("a key seed, a key's bytes and an error text never appear in the key id, a check report or a fixture warning (canary)", () => {
    const seed = "CANARY-seed", k = testKeyProvider(seed), hex = Buffer.from(k.key(1).bytes).toString("hex"), b64 = Buffer.from(k.key(1).bytes).toString("base64")
    const out = JSON.stringify([k.key(1).id, checkTrail("h", [{ auditSeq: 1 }, { auditSeq: 3 }], { policy: { seed }, recordedPolicy: { seed } }), fixtureWarning([k.manifest])])
    for (const c of [seed, hex, b64]) expect(out).not.toContain(c)
  })
})
