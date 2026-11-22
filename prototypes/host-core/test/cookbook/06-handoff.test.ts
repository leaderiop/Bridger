// Cookbook 6: replace a plugin and keep its state (handoff).
import { Context, Effect, Ref, Schema } from "effect"
import { describe, expect, it } from "vitest"
import { definePlugin } from "../../src/kit.js"
import type { AnyPlugin } from "../../src/plugin.js"
import { drive, idle } from "../fixtures.js"
import { as, run } from "../p4fixtures.js"

// #region recipe
class Counter extends Context.Service<Counter, { readonly count: Ref.Ref<number> }>()("example/Counter") {}
const State = Schema.Struct({ n: Schema.Number })

export const counter = (version: string) => definePlugin({
  id: "example/counter",
  provides: Counter,
  meta: { version },
  make: Effect.gen(function* () { return { count: yield* Ref.make(0) } }),
  handoff: {
    version: "1",                                           // the state's version, not the plugin's
    schema: State,
    export: Effect.gen(function* () { return { n: yield* Ref.get((yield* Counter).count) } }),
    import: (state: { n: number }) => Effect.gen(function* () { yield* Ref.set((yield* Counter).count, state.n) })
  }
})
// #endregion

describe("cookbook 6: replace with handoff", () => {
  it("the new definition starts with the old one's count", () => run((host) => Effect.gen(function* () {
    yield* host.install(counter("1.0.0") as unknown as AnyPlugin, as()); yield* idle(host)
    yield* host.use(Counter, (c) => Ref.set(c.count, 41))
    yield* drive(host, host.replace(counter("1.1.0") as unknown as AnyPlugin, as())); yield* idle(host)
    expect(yield* host.use(Counter, (c) => Ref.get(c.count))).toBe(41)
  })))
})
