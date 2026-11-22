// Kit 02 (BEH-KT-009..013): PluginTest.mount, stubs, partials and it.plugin on the TestHost.
import { Cause, Context, Deferred, Effect, Exit } from "effect"
import { describe, expect, it } from "vitest"
import { definePlugin } from "../src/kit.js"
import * as PluginTest from "../src/plugin-test.js"

class Logger extends Context.Service<Logger, { readonly log: (m: string) => Effect.Effect<void>; readonly level: string }>()("example/Logger") {}
class Greeter extends Context.Service<Greeter, { readonly greet: (n: string) => Effect.Effect<string> }>()("example/Greeter") {}
const greeter = definePlugin({
  id: "example/greeter", requires: [Logger], provides: Greeter,
  make: (ctx) => Effect.succeed({ greet: (n: string) => ctx.use(Logger, (l) => l.log(n)).pipe(Effect.as(`hello ${n}`)) })
})
const run = <A, E_>(e: Effect.Effect<A, E_, import("effect").Scope.Scope>) => Effect.runPromise(Effect.scoped(e))
const calls: Array<string> = []
const logger = PluginTest.stub(Logger, { log: (m) => Effect.sync(() => { calls.push(m) }), level: "info" })

describe("PluginTest (kit 02)", () => {
  it("BEH-KT-009: mount installs the provisions, then the plugin, and resolves when it is active", () => run(Effect.gen(function* () {
    const t = yield* PluginTest.mount(greeter, { provide: [logger] })
    expect(yield* t.use(Greeter, (g) => g.greet("ada"))).toBe("hello ada")
    expect(calls).toContain("ada")
    expect((yield* t.inspect).state).toBe("active")
  })))
  it("BEH-KT-009: a missing provision fails with MissingProvision; allowWaiting leaves the plugin waiting", () => run(Effect.gen(function* () {
    const exit = yield* Effect.exit(PluginTest.mount(greeter))
    expect(Exit.isFailure(exit) && JSON.stringify(exit.cause)).toContain("MissingProvision")
    expect(Exit.isFailure(exit) && JSON.stringify(exit.cause)).toContain("example/Logger")
    const t = yield* PluginTest.mount(greeter, { allowWaiting: true })
    expect((yield* t.inspect).state).toBe("waiting")
  })))
  it("BEH-KT-009: a failing activation is ActivationFailed", () => run(Effect.gen(function* () {
    const boom = definePlugin({ id: "example/boom", provides: Greeter, make: Effect.fail("no") as never })
    const exit = yield* Effect.exit(PluginTest.mount(boom))
    expect(Exit.isFailure(exit) && JSON.stringify(exit.cause)).toContain("ActivationFailed")
  })))
  it("BEH-KT-010: a partial double dies naming the member it does not implement", () => run(Effect.gen(function* () {
    const p = PluginTest.partial(Logger, { level: "debug" })
    const t = yield* PluginTest.mount(greeter, { provide: [p] })
    const exit = yield* Effect.exit(t.use(Greeter, (g) => g.greet("x")))
    expect(Exit.isFailure(exit) && JSON.stringify(exit.cause)).toContain("StubNotImplemented")
  })))
  it("BEH-KT-012: actor fills the default kind", () => { expect(PluginTest.actor("a")).toEqual({ id: "a", kind: "user" }) })
})

describe("it.plugin (BEH-KT-011)", () => {
  PluginTest.plugin("runs the body on a mounted plugin and passes when nothing leaks", greeter, { provide: [logger] }, (t) =>
    Effect.gen(function* () { expect(yield* t.use(Greeter, (g) => g.greet("bo"))).toBe("hello bo") }))

  it("fails the case when the body leaves a lease held", async () => {
    const exit = await Effect.runPromiseExit(PluginTest.pluginCase(greeter, { provide: [logger] }, (t) => Effect.gen(function* () {
      const entered = yield* Deferred.make<void>()
      yield* Effect.forkScoped(t.use(Greeter, () => Deferred.succeed(entered, undefined).pipe(Effect.andThen(Effect.never))))
      yield* Deferred.await(entered)
    })))
    expect(Exit.isFailure(exit) && Cause.pretty(exit.cause)).toContain("still holds")
  })
  it("fails the case when a plugin is failed and not listed in expectFailed; listed, it passes", async () => {
    const boom = definePlugin({ id: "example/boom", provides: Logger, make: Effect.fail("no") as never })
    const opts = { provide: [boom], allowWaiting: true }
    const bad = await Effect.runPromiseExit(PluginTest.pluginCase(greeter, opts, () => Effect.void))
    expect(Exit.isFailure(bad) && Cause.pretty(bad.cause)).toContain("not listed in expectFailed")
    const ok = await Effect.runPromiseExit(PluginTest.pluginCase(greeter, { ...opts, expectFailed: ["example/boom"] }, () => Effect.void))
    expect(Exit.isSuccess(ok)).toBe(true)
  })
})
