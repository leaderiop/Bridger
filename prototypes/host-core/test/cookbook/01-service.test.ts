// Cookbook 1: add a service plugin (report 05 R4, DX-07). The region between the markers is the page's snippet.
import { Context, Effect } from "effect"
import { describe, expect, it } from "vitest"
import { definePlugin } from "../../src/kit.js"
import type { AnyPlugin } from "../../src/plugin.js"
import { idle, stateOf } from "../fixtures.js"
import { as, run } from "../p4fixtures.js"

// #region recipe
class Greeter extends Context.Service<Greeter, { readonly greet: (name: string) => Effect.Effect<string> }>()("example/Greeter") {}

export const greeter = definePlugin({
  id: "example/greeter",
  provides: Greeter,
  make: Effect.succeed({ greet: (name: string) => Effect.succeed(`Hello, ${name}!`) })
})
// #endregion

describe("cookbook 1: a service plugin", () => {
  it("installs, becomes active and answers through the host", () => run((host) => Effect.gen(function* () {
    yield* host.install(greeter as unknown as AnyPlugin, as()); yield* idle(host)
    expect(yield* stateOf(host, "example/greeter")).toBe("active")
    expect(yield* host.use(Greeter, (g) => g.greet("Ada"))).toBe("Hello, Ada!")
  })))
})
