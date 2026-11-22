# Add an adapter behind a contract

Use this when: A service is implemented by more than one party or across versions: a pricing source, a shipping provider.

```ts
// type-checked: test test/cookbook/03-contract-adapter.test.ts
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
```

`Contract.make` checks each method spec against the service shape at compile time. The provider provides the contract; the consumer requires a range. A consumer with no compatible provider waits instead of failing.

The snippet is the `recipe` region of
[`prototypes/host-core/test/cookbook/03-contract-adapter.test.ts`](../../../prototypes/host-core/test/cookbook/03-contract-adapter.test.ts),
which runs with the prototype's suite; `doc-typecheck.sh` fails if this page and
that region differ. See [core 26](../../../references/core/behaviors/26-versioned-contracts.md) (BEH-BR-225 to 234).
