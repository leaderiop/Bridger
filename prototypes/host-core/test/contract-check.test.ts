// Report 02 R1 / kit acceptance check 30 (BEH-KT-028): breaking changes and unbumped additions against the released snapshot.
import { Context, Effect, Schema } from "effect"
import { describe, expect, it } from "vitest"
import { Contract } from "../src/contract.js"
import { checkRelease, snapshotOf } from "../src/contractcheck.js"

class Board extends Context.Service<Board, { readonly post: (s: string) => Effect.Effect<string> }>()("example/Board@1") {}
const rel = (version: string, payload: Schema.Top, extra: Record<string, ReturnType<typeof Contract.method>> = {}, success: Schema.Top = Schema.String) =>
  snapshotOf(Contract.make(Board, { version, methods: { post: Contract.method({ payload, success }), ...extra } }))
const Text = Schema.Struct({ text: Schema.String })

describe("kit check: contract releases (BEH-BR-230)", () => {
  const released = rel("1.2.0", Text)
  it("passes an unchanged contract and a documentation-only change", () => {
    expect(checkRelease(released, rel("1.2.1", Text.annotate({ description: "a post" })))).toEqual({ ok: true })
  })
  it("a field-level documentation annotation is not a change", () => {
    expect(checkRelease(released, rel("1.2.1", Schema.Struct({ text: Schema.String.annotate({ description: "the post body", title: "Text" }) })))).toEqual({ ok: true })
  })
  it("an optional payload field made required is breaking", () => {
    const opt = rel("1.2.0", Schema.Struct({ text: Schema.String, mood: Schema.optional(Schema.String) }))
    expect(checkRelease(opt, rel("1.3.0", Schema.Struct({ text: Schema.String, mood: Schema.String })))).toMatchObject({ ok: false, _tag: "ContractBreakingChange", changes: expect.arrayContaining([expect.objectContaining({ detail: expect.stringContaining("became required") })]) })
  })
  it("passes an additive change with a minor bump: optional payload field, success field, new method", () => {
    const next = rel("1.3.0", Schema.Struct({ text: Schema.String, mood: Schema.optional(Schema.String) }), { list: Contract.method({}) })
    expect(checkRelease(released, next)).toEqual({ ok: true })
    expect(checkRelease(rel("1.2.0", Text, {}, Schema.Struct({ id: Schema.String })), rel("1.3.0", Text, {}, Schema.Struct({ id: Schema.String, at: Schema.Number })))).toEqual({ ok: true })
  })
  it("fails ContractVersionNotBumped for an addition under the same minor", () => {
    const v = checkRelease(released, rel("1.2.1", Text, { list: Contract.method({}) }))
    expect(v).toMatchObject({ ok: false, _tag: "ContractVersionNotBumped", from: "1.2.0", to: "1.2.1", changes: [{ method: "list", detail: "method added" }] })
  })
  it("fails ContractBreakingChange for a required payload field, a type change, a removed method and a stream flip", () => {
    expect(checkRelease(released, rel("1.3.0", Schema.Struct({ text: Schema.String, mood: Schema.String })))).toMatchObject({ ok: false, _tag: "ContractBreakingChange", changes: [{ detail: expect.stringContaining("added as required") }] })
    expect(checkRelease(released, rel("1.3.0", Schema.Struct({ text: Schema.Number })))).toMatchObject({ ok: false, _tag: "ContractBreakingChange" })
    const two = rel("1.2.0", Text, { list: Contract.method({}) })
    expect(checkRelease(two, rel("1.3.0", Text))).toMatchObject({ ok: false, _tag: "ContractBreakingChange", changes: [{ method: "list", detail: "method removed" }] })
    const stream = snapshotOf(Contract.makeUnchecked(Board, { version: "1.3.0", methods: { post: Contract.method({ payload: Text, success: Schema.String, stream: true }) } }))
    expect(checkRelease(released, stream)).toMatchObject({ ok: false, _tag: "ContractBreakingChange", changes: [{ detail: "stream flag changed" }] })
  })
  it("treats a removed payload field and a narrowed success as breaking, and a new major as nothing to compare", () => {
    expect(checkRelease(rel("1.2.0", Schema.Struct({ text: Schema.String, mood: Schema.optional(Schema.String) })), rel("1.3.0", Text))).toMatchObject({ ok: false, _tag: "ContractBreakingChange" })
    const next2 = snapshotOf(Contract.makeUnchecked(class extends Context.Service<any, any>()("example/Board@2") {} as never, { version: "2.0.0", methods: { post: Contract.method({ payload: Schema.Number, success: Schema.String }) } }))
    expect(checkRelease(released, { ...next2 })).toEqual({ ok: true })
  })
  it("the same payload change in two separately built copies of one version passes", () => {
    const a = rel("1.3.0", Schema.Struct({ text: Schema.String, mood: Schema.optional(Schema.String) }))
    const b = rel("1.3.0", Schema.Struct({ text: Schema.String, mood: Schema.optional(Schema.String) }).annotate({ description: "copy" }))
    expect(checkRelease(a, b)).toEqual({ ok: true })
  })
})
