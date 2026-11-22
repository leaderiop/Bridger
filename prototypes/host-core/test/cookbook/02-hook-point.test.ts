// Cookbook 2: take part in a decision through a hook point (veto, enrich, advisory).
import { Effect, Option, Schema } from "effect"
import { describe, expect, it } from "vitest"
import { HookPoint } from "../../src/hooks.js"
import { HostLink } from "../../src/host.js"
import { idle } from "../fixtures.js"
import { as, run } from "../p4fixtures.js"

// #region recipe
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
// #endregion

describe("cookbook 2: a hook point", () => {
  it("a veto denies with its code, an enrichment rides along, and a passing cart is allowed", () => run((host) => Effect.gen(function* () {
    const point = yield* beforeCheckout
    yield* point.register("stock/min-total", (cart) => Effect.succeed(cart.total < 10 ? { _tag: "Veto", code: "too-small" } : { _tag: "Pass" }) as never, { role: "veto" })
    yield* point.register("promo/ten-percent", () => Effect.succeed({ _tag: "Enrich", value: { percent: 10 } }) as never, { role: "enrich" })
    yield* idle(host)
    const withLink = <A, E, R>(e: Effect.Effect<A, E, R>) => e.pipe(Effect.provideService(HostLink.reference, Option.some(host.link)))
    const denied = yield* withLink(point.dispatch({ total: 5 }))
    expect(denied).toMatchObject({ verdict: { _tag: "Denied", code: "too-small" } })
    const allowed = yield* withLink(point.dispatch({ total: 50 }))
    expect(allowed).toMatchObject({ verdict: { _tag: "Allowed" }, enrichments: [{ id: "promo/ten-percent", value: { percent: 10 } }] })
  })))
})
