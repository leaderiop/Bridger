// Cookbook 5: add a configuration field that may change without a restart (`volatile`).
import { Context, Effect, Schema } from "effect"
import { describe, expect, it } from "vitest"
import { PluginConfig } from "../../src/config.js"
import { definePlugin } from "../../src/kit.js"
import type { AnyPlugin } from "../../src/plugin.js"
import { drive, idle } from "../fixtures.js"
import { as, run } from "../p4fixtures.js"

// #region recipe
class Mailer extends Context.Service<Mailer, { readonly retries: Effect.Effect<number>; readonly host: string }>()("example/Mailer") {}

export const mailer = definePlugin({
  id: "example/mailer",
  provides: Mailer,
  config: Schema.Struct({ host: Schema.String, retries: Schema.Number }),
  volatile: ["retries"],                                   // a change to `retries` is applied in place; `host` restarts
  make: ({ config }) => Effect.gen(function* () {
    const cfg = yield* PluginConfig                        // `current` follows volatile changes, `value` is the build's
    return { host: config.host, retries: Effect.map(cfg.current, (c) => (c as { retries: number }).retries) }
  })
})
// #endregion

describe("cookbook 5: a volatile config field", () => {
  it("a volatile change is seen without a restart, a non-volatile change rebuilds", () => run((host) => Effect.gen(function* () {
    yield* host.install(mailer as unknown as AnyPlugin, { ...as(), config: { host: "a", retries: 1 } } as never); yield* idle(host)
    const first = yield* host.use(Mailer, (m) => Effect.succeed(m))
    yield* drive(host, host.reconfigure("example/mailer", { host: "a", retries: 5 }, as()))
    expect(yield* first.retries).toBe(5)                                           // same activation, new value
    yield* drive(host, host.reconfigure("example/mailer", { host: "b", retries: 5 }, as())); yield* idle(host)
    expect((yield* host.use(Mailer, (m) => Effect.succeed(m.host)))).toBe("b")     // restarted with the new host
  })))
})
