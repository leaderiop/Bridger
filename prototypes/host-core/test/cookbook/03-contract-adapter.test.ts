// Cookbook 3: add an adapter behind a contract (the partner side of a seam).
import { Context, Effect, Schema } from "effect"
import { describe, expect, it } from "vitest"
import { Contract } from "../../src/contract.js"
import { definePlugin } from "../../src/kit.js"
import type { AnyPlugin } from "../../src/plugin.js"
import { idle, stateOf } from "../fixtures.js"
import { as, run } from "../p4fixtures.js"

// #region recipe
class Pricing extends Context.Service<Pricing, { readonly quote: (sku: string) => Effect.Effect<number> }>()("example/Pricing@1") {}

// the contract: versioned, methods checked against the service shape
export const PricingV1 = Contract.make(Pricing, {
  version: "1.0.0",
  methods: { quote: Contract.method({ payload: Schema.String, success: Schema.Number }) }
})

// the adapter: provides the contract
export const flatPricing = definePlugin({
  id: "acme/flat-pricing",
  provides: PricingV1,
  make: Effect.succeed({ quote: (_sku: string) => Effect.succeed(100) })
})

// a consumer: requires any 1.x that has `quote`
export const checkout = definePlugin({
  id: "shop/checkout",
  requires: [PricingV1.range("^1.0")],
  run: Effect.gen(function* () { yield* (yield* Pricing).quote("A-1") })
})
// #endregion

describe("cookbook 3: an adapter behind a contract", () => {
  it("the consumer waits for a compatible provider and runs once it is active", () => run((host) => Effect.gen(function* () {
    yield* host.install(checkout as unknown as AnyPlugin, as()); yield* idle(host)
    expect(yield* stateOf(host, "shop/checkout")).toBe("waiting")
    yield* host.install(flatPricing as unknown as AnyPlugin, as()); yield* idle(host)
    expect(yield* stateOf(host, "shop/checkout")).toBe("active")
    expect(yield* host.use(Pricing, (p) => p.quote("X"))).toBe(100)
  })))
})
