// Report 06 S28: the dispatch input is frozen, so an enricher cannot alter what the veto phase sees.
import { Effect, Option, Schema, Scope } from "effect"
import { describe, expect, it } from "vitest"
import { HostLink } from "../src/host.js"
import { HookPoint } from "../src/hooks.js"

type In = { readonly sku: string; readonly price: number }
describe("hook input (BEH-BR-306)", () => {
  it("an enricher that tries to change the input cannot, and the veto phase sees the original", () => Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    let seenByVeto = 0
    const p = yield* HookPoint.make<In, number, string, "cheap">("p", { codes: ["cheap"], who: () => true, timeout: 50, deadline: 400, onError: "skip", enrichment: Schema.Number, advice: Schema.String, allowNoLink: true, allowSkipOnVeto: true })
    yield* p.register("enrich", (i) => Effect.sync(() => { try { (i as { price: number }).price = 0 } catch { /* frozen */ } return { _tag: "Enrich" as const, value: 1 } }), { role: "enrich" })
    yield* p.register("veto", (i) => Effect.sync(() => { seenByVeto = i.price; return { _tag: "Pass" as const } }), { role: "veto" })
    const input = { sku: "a", price: 5 }
    yield* p.dispatch(input)
    expect(seenByVeto).toBe(5); expect(Object.isFrozen(input)).toBe(true); expect(input.price).toBe(5)
  }).pipe(Effect.provideService(HostLink.reference, Option.some(HostLink.none)))) as Effect.Effect<void>))
})
