# Take part in a decision through a hook point

Use this when: Several plugins must be able to veto, enrich or advise one decision (a checkout, a price change) under one failure policy.

```ts
// type-checked: test test/cookbook/02-hook-point.test.ts
interface Cart { readonly total: number }
const Discount = Schema.Struct({ percent: Schema.Number })

const beforeCheckout = HookPoint.make<Cart, { readonly percent: number }, never, "too-small">("shop/before-checkout", {
  codes: ["too-small"],
  enrichment: Discount,
  who: () => true,                       // who may register a veto: here everyone
  timeout: 200,
  deadline: 1_000,
  onError: "deny"
})
```

The point's type arguments say which roles it serves: `HookPoint.make<In, Enrich, Advice, Code>`. A veto carries one of the declared codes; an enrichment stays under its contributor's id. Dispatch from outside a plugin provides the host's link (`HostLink.reference`).

The snippet is the `recipe` region of
[`prototypes/host-core/test/cookbook/02-hook-point.test.ts`](../../../prototypes/host-core/test/cookbook/02-hook-point.test.ts),
which runs with the prototype's suite; `doc-typecheck.sh` fails if this page and
that region differ. See [core 31](../../../references/core/behaviors/31-hook-points.md) (BEH-BR-297 to 312).
