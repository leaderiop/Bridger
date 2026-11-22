// Cookbook 7: test a plugin whose build fails (fault injection on the test host).
import { Context, Effect, Scope, Exit } from "effect"
import { describe, expect, it } from "vitest"
import { definePlugin } from "../../src/kit.js"
import type { AnyPlugin } from "../../src/plugin.js"
import * as Testing from "../../src/testing.js"
import { drive, idle, stateOf } from "../fixtures.js"
import { as, run } from "../p4fixtures.js"

class Store extends Context.Service<Store, { readonly get: Effect.Effect<number> }>()("example/Store") {}
const store = definePlugin({ id: "example/store", provides: Store, make: Effect.succeed({ get: Effect.succeed(1) }) })

// #region recipe
// inject a build failure for one plugin id; the fault lasts as long as the scope it is injected into
export const withFailingBuild = (host: Testing.TestHost, id: string) => Effect.gen(function* () {
  const fault = yield* Scope.make()
  yield* host.inject(Testing.Fault.buildFails(id)).pipe(Scope.provide(fault))
  return fault
})
// #endregion

describe("cookbook 7: a failing activation", () => {
  it("the plugin ends failed (build) while the fault is injected and activates once it is gone", () => run((host) => Effect.gen(function* () {
    const fault = yield* withFailingBuild(host, "example/store")
    yield* host.install(store as unknown as AnyPlugin, as()); yield* idle(host)
    expect(yield* stateOf(host, "example/store")).toBe("failed")
    yield* Scope.close(fault, Exit.void)
    yield* drive(host, host.restart("example/store", as())); yield* idle(host)
    expect(yield* stateOf(host, "example/store")).toBe("active")
  })))
})
