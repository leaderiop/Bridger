// Report 06 S14: plugin-authored error text can be scrubbed before it reaches the audit trail (BEH-BR-197).
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { define, type AnyPlugin } from "../src/plugin.js"
import { drive, idle, memorySink } from "./fixtures.js"
import { as, run, settleWriter } from "./p4fixtures.js"

const leaky = define({ id: "leaky", requires: [] as const, provides: [] as const, build: Layer.effectDiscard(Effect.fail(new Error("connect failed: postgres://user:s3cret@db/x"))) as never }) as unknown as AnyPlugin
const messages = async (auditMessage?: (m: string) => string) => {
  const { records, sink } = memorySink()
  await run((host) => Effect.gen(function* () {
    yield* drive(host, host.install(leaky, as())); yield* idle(host); yield* settleWriter
  }), { sink, options: auditMessage ? { auditMessage } : {} })
  return JSON.stringify(records.map((r) => (r as { error?: unknown }).error))
}
describe("auditMessage (BEH-BR-197)", () => {
  it("without a scrub the plugin's text is recorded (the documented residual); with one only the scrubbed text is", async () => {
    expect(await messages()).toContain("s3cret")
    const out = await messages(() => "activation failed")
    expect(out).not.toContain("s3cret"); expect(out).toContain("ActivationFailed"); expect(out).toContain("activation failed")
  })
})
