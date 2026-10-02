// Phase-P4 scenarios for optional and reactive dependencies (behaviour 15, BEH-BR-129–136).
import { Context, Deferred, Effect, Exit, Fiber, Layer, Option } from "effect"
import { describe, expect, it } from "vitest"
import type * as Host from "../src/host.js"
import { PluginRuntime, type FailurePolicy } from "../src/runtime.js"
import { define, type AnyPlugin } from "../src/plugin.js"
import { journal, type Journal } from "./fixtures.js"
import { as, run, stateIn } from "./p4fixtures.js"

class Search extends Context.Service<Search, { readonly query: (q: string) => Effect.Effect<string> }>()("example/Search") {}
class Metrics extends Context.Service<Metrics, { readonly n: number }>()("example/Metrics") {}
class Ui extends Context.Service<Ui, {
  readonly probe: Effect.Effect<Option.Option<string>>
  readonly probeUndeclared: Effect.Effect<Option.Option<Metrics["Service"]>>
  readonly withSearch: <A>(f: (s: Search["Service"]) => Effect.Effect<A>) => Effect.Effect<Option.Option<A>, unknown>
}>()("example/Ui") {}

const failed = (exit: Exit.Exit<unknown, unknown>, tag: string) => Exit.isFailure(exit) && JSON.stringify(exit.cause).includes(tag)

const searchPlugin = (j: Journal, closeDelay = 0) => define({
  id: "search", requires: [] as const, provides: [Search] as const,
  build: Layer.effect(Search, Effect.gen(function* () {
    let open = true
    yield* Effect.addFinalizer(() => Effect.sleep(closeDelay).pipe(Effect.andThen(Effect.sync(() => { open = false })), Effect.andThen(j.push("search:close"))))
    return { query: (q: string) => Effect.sync(() => (open ? `hit:${q}` : `CLOSED:${q}`)) }
  }))
})

/** The optional consumer: a probe, an undeclared probe, useOptional, and an optional whenAvailable registration. */
const uiPlugin = (j: Journal, o: { reactive?: (s: Search["Service"]) => Effect.Effect<void, unknown, import("effect").Scope.Scope>; onFailure?: FailurePolicy; name?: string } = {}): AnyPlugin => ({
  id: "ui", requires: [], provides: [Ui], optional: [Search],
  build: Layer.effect(Ui, Effect.gen(function* () {
    const rt = yield* PluginRuntime
    if (o.reactive) yield* rt.whenAvailable([Search] as const, ([s]) => o.reactive!(s), { ...(o.name ? { name: o.name } : {}), ...(o.onFailure ? { onFailure: o.onFailure } : {}) })
    return {
      probe: rt.optional(Search).pipe(Effect.flatMap(Option.match({ onNone: () => Effect.succeedNone, onSome: (s) => Effect.asSome(s.query("probe")) }))),
      probeUndeclared: rt.optional(Metrics),
      withSearch: (f) => rt.useOptional(Search, f)
    }
  })) as AnyPlugin["build"]
})

describe("optional dependencies (BEH-BR-129–131)", () => {
  it("BEH-BR-129: an optional key gates nothing, is never missing, takes no part in cycles, and cannot also be required", async () => {
    const j = journal()
    await run((host) => Effect.gen(function* () {
      yield* host.install(uiPlugin(j), as())
      yield* host.awaitIdle
      expect(yield* stateIn(host, "ui")).toBe("active")
      // Two plugins each listing the other's service as optional form no cycle.
      class A extends Context.Service<A, {}>()("example/A") {}
      class B extends Context.Service<B, {}>()("example/B") {}
      yield* host.install({ id: "a", requires: [], provides: [A], optional: [B], build: Layer.succeed(A, {}) as AnyPlugin["build"] }, as())
      yield* host.install({ id: "b", requires: [], provides: [B], optional: [A], build: Layer.succeed(B, {}) as AnyPlugin["build"] }, as())
      yield* host.awaitIdle
      expect([yield* stateIn(host, "a"), yield* stateIn(host, "b")]).toEqual(["active", "active"])
      const both = yield* Effect.exit(host.install({ id: "c", requires: [Search], provides: [], optional: [Search], build: Layer.empty as unknown as AnyPlugin["build"] }, as()))
      expect(failed(both, "InvalidDefinition")).toBe(true)
    }))
  })

  it("BEH-BR-129, 130: optional is a point-in-time, unleased read; the provider leaving changes nothing; an undeclared key is None", async () => {
    const j = journal()
    await run((host) => Effect.gen(function* () {
      yield* host.install(uiPlugin(j), as())
      yield* host.awaitIdle
      const ui = yield* host.use(Ui, (u) => Effect.succeed(u))
      expect(yield* ui.probe).toEqual(Option.none())
      yield* host.install(searchPlugin(j), as())
      yield* host.awaitIdle
      expect(yield* ui.probe).toEqual(Option.some("hit:probe"))
      expect(yield* ui.probeUndeclared).toEqual(Option.none())                // logged, never granted (BEH-BR-130)
      yield* host.remove("search", as())                                      // no lease held by `optional`
      expect(yield* stateIn(host, "ui")).toBe("active")
      expect(yield* ui.probe).toEqual(Option.none())
    }))
  })

  it("BEH-BR-131: useOptional is None when absent and otherwise runs under a lease that delays the provider's removal", async () => {
    const j = journal()
    await run((host) => Effect.gen(function* () {
      yield* host.install(uiPlugin(j), as())
      yield* host.awaitIdle
      const ui = yield* host.use(Ui, (u) => Effect.succeed(u))
      expect(yield* ui.withSearch((s) => s.query("x"))).toEqual(Option.none())
      yield* host.install(searchPlugin(j), as())
      yield* host.awaitIdle
      const entered = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      const call = yield* Effect.forkChild(ui.withSearch((s) => Deferred.succeed(entered, undefined).pipe(Effect.andThen(Deferred.await(release)), Effect.andThen(s.query("late")))))
      yield* Deferred.await(entered)
      const removal = yield* Effect.forkChild(host.remove("search", { ...as(), drain: 1_000 }))
      yield* Effect.sleep(10)
      expect(yield* stateIn(host, "search")).toBe("stopping")
      yield* Deferred.succeed(release, undefined)
      expect(yield* Fiber.join(call)).toEqual(Option.some("hit:late"))          // the provider stayed open for the lease
      yield* Fiber.join(removal)
      expect(yield* stateIn(host, "ui")).toBe("active")
    }))
  })
})

describe("reactive dependencies: whenAvailable (BEH-BR-132–136)", () => {
  const lit = (j: Journal) => (s: Search["Service"]) => Effect.gen(function* () {
    yield* j.push("lit")
    yield* Effect.addFinalizer(() => s.query("finalizer").pipe(Effect.flatMap((r) => j.push(`dim ${r}`))))
    return yield* Effect.never
  })

  it("BEH-BR-132, 133: a run starts when its keys arrive, ends before the provider closes, and runs again when they return; the plugin's state never moves", async () => {
    const j = journal()
    await run((host) => Effect.gen(function* () {
      yield* host.install(uiPlugin(j, { reactive: lit(j) }), as())
      yield* host.awaitIdle
      expect(j.lines).toEqual([])
      yield* host.install(searchPlugin(j), as())
      yield* host.awaitIdle
      yield* Effect.sleep(5)
      expect(j.lines).toEqual(["lit"])
      yield* host.remove("search", as())
      expect(j.lines).toEqual(["lit", "dim hit:finalizer", "search:close"])  // the run's finalizer used the provider before it closed
      expect(yield* stateIn(host, "ui")).toBe("active")
      yield* host.install(searchPlugin(j), as())
      yield* host.awaitIdle
      yield* Effect.sleep(5)
      expect(j.lines.at(-1)).toBe("lit")
    }))
  })

  it("BEH-BR-133: a run's finalizers drain under the provider's limit, with DrainTimeout and force; the run's plugin is never stopped", async () => {
    const j = journal()
    const slow = (s: Search["Service"]) => Effect.gen(function* () {
      yield* Effect.addFinalizer(() => Effect.sleep(300).pipe(Effect.andThen(s.query("slow")), Effect.flatMap((r) => j.push(`dim ${r}`))))
      return yield* Effect.never
    })
    await run((host) => Effect.gen(function* () {
      yield* host.install(searchPlugin(j), as())
      yield* host.install(uiPlugin(j, { reactive: slow }), as())
      yield* host.awaitIdle
      yield* Effect.sleep(5)
      const parked = yield* Effect.exit(host.remove("search", { ...as(), drain: 20 }))
      expect(failed(parked, "DrainTimeout")).toBe(true)
      expect(yield* stateIn(host, "ui")).toBe("active")
      yield* host.remove("search", { ...as(), drain: 20, force: true })
      expect(yield* stateIn(host, "search")).toBe("uninstalled")
      expect(yield* stateIn(host, "ui")).toBe("active")
    }))
  })

  it("BEH-BR-134: a failed run follows the background policy — fail-plugin fails the plugin; ignore leaves it active", async () => {
    const j = journal()
    const boom = () => Effect.fail("run failed")
    await run((host) => Effect.gen(function* () {
      yield* host.install(searchPlugin(j), as())
      yield* host.install(uiPlugin(j, { reactive: boom }), as())
      yield* host.awaitIdle
      yield* Effect.sleep(20)
      yield* host.awaitIdle
      const ui = (yield* host.snapshot).plugins.find((p) => p.id === "ui")!
      expect(ui.state === "failed" && ui.failure.phase).toBe("runtime")
    }))
    await run((host) => Effect.gen(function* () {
      yield* host.install(searchPlugin(j), as())
      yield* host.install(uiPlugin(j, { reactive: boom, onFailure: "ignore" }), as())
      yield* host.awaitIdle
      yield* Effect.sleep(20)
      expect(yield* stateIn(host, "ui")).toBe("active")
    }))
  })

  it("BEH-BR-135: inspect lists optional keys and each registration by name, keys and whether it runs", async () => {
    const j = journal()
    await run((host) => Effect.gen(function* () {
      yield* host.install(uiPlugin(j, { reactive: lit(j) }), as())
      yield* host.awaitIdle
      const before = yield* host.inspect("ui")
      expect(before.optional).toEqual(["example/Search"])
      expect(before.whenAvailable).toEqual([{ name: "whenAvailable#1", keys: ["example/Search"], running: false }])
      yield* host.install(searchPlugin(j), as())
      yield* host.awaitIdle
      yield* Effect.sleep(5)
      expect((yield* host.inspect("ui")).whenAvailable[0]!.running).toBe(true)
      expect((yield* host.snapshot).plugins.find((p) => p.id === "ui")!.state).toBe("active")
    }))
  })

  it("BEH-BR-136: a run carries only the leases it holds — removing its own provider from inside it fails with WouldDeadlock", async () => {
    const j = journal()
    const box: { host?: Host.Host; result?: Exit.Exit<unknown, unknown> } = {}
    const done = Effect.runSync(Deferred.make<void>())
    const selfRemove = () => Effect.gen(function* () {
      box.result = yield* Effect.exit(box.host!.remove("search", as()))
      yield* Deferred.succeed(done, undefined)
      return yield* Effect.never
    })
    await run((host) => Effect.gen(function* () {
      box.host = host
      yield* host.install(searchPlugin(j), as())
      yield* host.install(uiPlugin(j, { reactive: selfRemove }), as())
      yield* Deferred.await(done)
      expect(failed(box.result!, "WouldDeadlock")).toBe(true)
      expect(yield* stateIn(host, "search")).toBe("active")
      // The run does not carry the id of the plugin that registered it: removing `ui` from outside is not refused.
      yield* host.remove("ui", as())
    }))
  })
})
