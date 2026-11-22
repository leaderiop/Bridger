// docs/FOLDKIT-API.md: the Bridger side of the FoldKit adapter, run against the shared scenarios of kit appendix C.
import { Context, Effect, Exit, Layer, Option, Scope, Stream, SubscriptionRef } from "effect"
import { describe, expect, it } from "vitest"
import type { Client } from "../src/adapter.js"
import { BridgerFoldkit, BridgerHost, type Snapshot } from "../src/foldkit.js"
import { definePlugin } from "../src/kit.js"
import { scenarios } from "./adapter-conformance.js"
import { run } from "./p4fixtures.js"

class Audit extends Context.Service<Audit, { readonly record: (e: string) => Effect.Effect<string> }>()("example/Audit") {}
const audit = definePlugin({ id: "example/audit", provides: Audit, make: Effect.succeed({ record: (e: string) => Effect.succeed(`recorded ${e}`) }) })

/** A Client assembled only from what the adapter exports (`use`, `changes`, the selectors), the way a FoldKit app uses them. */
const viaFoldkit = (host: Parameters<Parameters<typeof scenarios[number]["run"]>[0]["make"]>[0]): Effect.Effect<Client, never, Scope.Scope> => Effect.gen(function* () {
  const { makeClient } = yield* Effect.promise(() => import("../src/adapter.js"))
  const inner = yield* makeClient(host)
  const env = Layer.succeed(BridgerHost, { host: host as never, client: inner })
  const cache = yield* SubscriptionRef.make<Option.Option<Snapshot>>(Option.none())
  yield* Effect.forkScoped(BridgerFoldkit.changes.pipe(Stream.runForEach((s) => SubscriptionRef.set(cache, s)), Effect.provide(env)))
  yield* Effect.yieldNow
  const fromSnapshot = (s: Option.Option<Snapshot>) => s
  return {
    snapshot: Effect.map(inner.snapshot, (o) => o) as never,
    changes: inner.changes,
    pluginState: (id) => Effect.map(SubscriptionRef.get(cache), (s) => BridgerFoldkit.pluginState(fromSnapshot(s), id)),
    isAvailable: (id) => Effect.map(SubscriptionRef.get(cache), (s) => BridgerFoldkit.isAvailable(s, id)),
    use: (key, f) => BridgerFoldkit.use(key, f).pipe(Effect.provide(env)) as never,
    dispose: inner.dispose
  }
})

describe("@bridger/foldkit seam (docs/FOLDKIT-API.md)", () => {
  for (const s of scenarios) it(`${s.id}: ${s.title}`, () => run((host) => s.run({ host, make: viaFoldkit })))

  it("layer owns a host, registers the plugins and awaits them; an initial activation failure fails the layer", async () => {
    const ok = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const env = yield* Layer.build(BridgerFoldkit.layer({ plugins: [audit] }))
      const { host } = Context.get(env, BridgerHost)
      return (yield* host.snapshot).plugins.map((p) => p.state)
    })))
    expect(ok).toEqual(["active"])
    const bad = definePlugin({ id: "example/boom", provides: Audit, make: Effect.fail("nope") as never })
    const exit = await Effect.runPromiseExit(Effect.scoped(Layer.build(BridgerFoldkit.layer({ plugins: [bad] }))))
    expect(Exit.isFailure(exit) && JSON.stringify(exit.cause)).toContain("ActivationFailed")
  })
  it("Snapshot is a data-only schema: a host snapshot round-trips through it", () => {
    const s: Snapshot = { revision: 3, availableServiceIds: ["example/Audit"], plugins: [{ id: "example/audit", realm: "default", state: "active" }] }
    expect(BridgerFoldkit.pluginState(Option.some(s), "example/audit")).toBe("active")
    expect(BridgerFoldkit.pluginState(Option.none(), "example/audit")).toBe("uninstalled")
  })
})
