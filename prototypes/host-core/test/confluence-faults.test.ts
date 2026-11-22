// Report 01 R2 (BEH-BR-160, BEH-BR-039): the confluence property with injected build failures. A stale failed build is
// discarded, so after a final restart of every faulted plugin a random history equals a direct install of the target.
// The universe's builds finish inside one step, so no build is ever stale there: the stale-discard property itself is
// the second test below (it fails when a stale failure is made sticky), the first covers failure x interleaving.
import { Context, Effect, Exit, Fiber, Layer, Stream } from "effect"
import { TestClock } from "effect/testing"
import { describe, expect, it } from "vitest"
import * as Testing from "../src/testing.js"
import { Fault } from "../src/testing.js"
import { as } from "./p4fixtures.js"
import { mulberry32, normal, plugins, present, refOf, setup, stalePairs, universe } from "./universe.js"

const options = { drainTimeout: 200, shutdownTimeout: 300 }
const onTestHost = <A>(body: (t: Testing.TestHost) => Effect.Effect<A, unknown, import("effect").Scope.Scope>) =>
  Effect.runPromise(Effect.scoped(Effect.flatMap(Testing.make(options), body)).pipe(Effect.provide(TestClock.layer())))

/** Forks one operation on a random plugin, mostly one its current state admits. */
const startOp = (t: Testing.TestHost, rnd: () => number) => Effect.gen(function* () {
  const u = universe[Math.floor(rnd() * universe.length)]!
  const ref = refOf(u)
  const p = yield* present(t, u)
  const pick = <A>(xs: ReadonlyArray<A>) => xs[Math.floor(rnd() * xs.length)]!
  const op = !p ? "install" : p.state === "disabled" ? pick(["enable", "remove"] as const) : pick(["remove", "disable", "restart", "restart"] as const)
  const disabled = rnd() < 0.3
  const call = {
    install: () => t.install(plugins[u.name]!, { ...as(), realm: u.realm, ...(disabled ? { disabled: true } : {}) }),
    remove: () => t.remove(ref, as()), disable: () => t.disable(ref, as()), enable: () => t.enable(ref, as()), restart: () => t.restart(ref, as())
  }[op]
  return yield* Effect.forkChild(Effect.exit(call()))
})


const faultable = ["logger", "audit", "report", "clock", "ui"] as const
const settleTo = (t: Testing.TestHost, target: ReadonlyArray<{ name: string; realm: string; disabled: boolean }>) => Effect.gen(function* () {
  const finish = (e: Effect.Effect<unknown, unknown>) => Effect.gen(function* () {
    const f = yield* Effect.forkChild(Effect.exit(e)); yield* t.runUntilIdle; return yield* Fiber.join(f)
  })
  for (const u of universe) {
    const want = target.find((x) => x.name === u.name && x.realm === u.realm)
    const p = yield* present(t, u)
    if (!want) { if (p) yield* finish(t.remove(refOf(u), as())); continue }
    if (!p) { yield* finish(t.install(plugins[u.name]!, { ...as(), realm: u.realm, ...(want.disabled ? { disabled: true } : {}) })); continue }
    if (want.disabled && p.state !== "disabled") yield* finish(t.disable(refOf(u), as()))
    if (!want.disabled && p.state === "disabled") yield* finish(t.enable(refOf(u), as()))
  }
  return yield* t.snapshot
})
/** `failed` is sticky until restarted, so a restart of every faulted plugin makes the outcome a function of the target alone. */
const restartFaulted = (t: Testing.TestHost, target: ReadonlyArray<{ name: string; realm: string; disabled: boolean }>, faulted: ReadonlyArray<string>) => Effect.gen(function* () {
  for (const u of universe) if (faulted.includes(u.name) && target.some((x) => x.name === u.name && x.realm === u.realm && !x.disabled)) {
    const f = yield* Effect.forkChild(Effect.exit(t.restart(refOf(u), as()))); yield* t.runUntilIdle; yield* Fiber.join(f)
  }
  return normal(yield* t.runUntilIdle)
})
const finalize = (t: Testing.TestHost, target: ReadonlyArray<{ name: string; realm: string; disabled: boolean }>, faulted: ReadonlyArray<string>) =>
  Effect.flatMap(settleTo(t, target), () => restartFaulted(t, target, faulted))
const keyOf = (p: { id: string; realm: string }) => `${p.id}@${p.realm}`

describe("confluence with injected build failures (report 01 R2; BEH-BR-160, BEH-BR-039)", () => {
  it("random histories with failing builds settle to the snapshot of a direct install", async () => {
    let stepped = 0, sawFailed = 0
    for (let seed = 1; seed <= 40; seed++) {
      const rnd = mulberry32(seed * 104729)
      const target = universe.filter(() => rnd() < 0.7).map((u) => ({ ...u, disabled: rnd() < 0.2 }))
      const faulted = faultable.filter(() => rnd() < 0.4)
      const inject = (t: Testing.TestHost) => Effect.forEach(universe.filter((u) => faulted.includes(u.name as never)), (u) => t.inject(Fault.buildFails(refOf(u))))
      const history = await onTestHost((t) => Effect.gen(function* () {
        yield* setup(t); yield* inject(t)
        const calls: Array<Fiber.Fiber<Exit.Exit<unknown, unknown>>> = []
        for (let i = 0; i < 24; i++) {
          if (rnd() < 0.45) { calls.push(yield* startOp(t, rnd)); continue }
          const pending = (yield* t.pending).filter((p) => !p.parked)
          if (pending.length === 0) continue
          const p = pending[Math.floor(rnd() * pending.length)]!
          if (yield* t.stepPlugin({ id: p.pluginId, realm: p.realm })) stepped++
          expect(stalePairs(yield* t.snapshot)).toEqual([])                       // R3: captured activation == provider's activation, at every step
        }
        yield* t.runUntilIdle
        for (const c of calls) yield* Fiber.join(c)
        yield* t.runUntilIdle
        for (let i = 0; i < 500; i++) yield* Effect.yieldNow                  // the collector fiber catches up
        const settled = yield* settleTo(t, target)
        const failed = settled.plugins.filter((p) => p.state === "failed").map(keyOf)
        // BEH-BR-160: the failed set is a subset of the plugins whose build was begun and failed in this history.
        for (const f of failed) expect({ seed, f, ok: universe.some((u) => keyOf({ id: plugins[u.name]!.id, realm: u.realm }) === f && faulted.includes(u.name as never) && target.some((x) => x.name === u.name && x.realm === u.realm && !x.disabled)) }).toMatchObject({ ok: true })
        const out = yield* restartFaulted(t, target, faulted)
        sawFailed += failed.length
        return { out, failed, rest: settled.plugins.filter((p) => p.state !== "failed").map((p) => JSON.stringify([p.id, p.realm, p.parentId ?? null, p.state, p.state === "waiting" ? [...p.missingServiceIds].sort() : null])).sort() }
      }))
      // BEH-BR-160: the non-failed plugins equal those of a history without failures in which each failed plugin is `disabled`.
      const reference = await onTestHost((t) => Effect.gen(function* () {
        yield* setup(t)
        const ref = target.map((x) => ({ ...x, disabled: x.disabled || history.failed.includes(keyOf({ id: plugins[x.name]!.id, realm: x.realm })) }))
        const snap = yield* settleTo(t, ref)
        return snap.plugins.filter((p) => !history.failed.includes(keyOf(p))).map((p) => JSON.stringify([p.id, p.realm, p.parentId ?? null, p.state, p.state === "waiting" ? [...p.missingServiceIds].sort() : null])).sort()
      }))
      expect({ seed, nonFailed: history.rest }).toEqual({ seed, nonFailed: reference })
      const direct = await onTestHost((t) => Effect.gen(function* () {
        yield* setup(t); yield* inject(t)
        for (const x of target) yield* t.install(plugins[x.name]!, { ...as(), realm: x.realm, ...(x.disabled ? { disabled: true } : {}) })
        return yield* finalize(t, target, faulted)
      }))
      expect({ seed, faulted, history: history.out }).toEqual({ seed, faulted, history: direct })
    }
    expect(stepped).toBeGreaterThan(100)
    expect(sawFailed).toBeGreaterThan(0)                                         // failures really occurred in the histories
  }, 180_000)
})

// A build that is in flight when its provider is lost is stale whatever it later returns, and however far the
// stop has progressed when it returns (BEH-BR-039): the plugin ends `waiting`, never `failed`.
class Dep extends Context.Service<Dep, {}>()("example/ConfluenceDep") {}
describe("a stale build is discarded in every interleaving (report 01 R1/R2)", () => {
  it("success or failure, any number of steps before it returns: `waiting`, one stale event", async () => {
    for (let seed = 1; seed <= 30; seed++) {
      const rnd = mulberry32(seed * 31337)
      const fails = rnd() < 0.5, extra = Math.floor(rnd() * 6), viaRestart = rnd() < 0.3
      const dependent = {
        id: "stale-dep", requires: [Dep], provides: [],
        build: Layer.effectDiscard(Effect.sleep(100).pipe(Effect.andThen(fails ? Effect.fail("late failure") : Effect.void))) as unknown as import("../src/plugin.js").AnyPlugin["build"]
      } as import("../src/plugin.js").AnyPlugin
      const provider = { id: "stale-prov", requires: [], provides: [Dep], build: Layer.succeed(Dep, {}) as unknown as import("../src/plugin.js").AnyPlugin["build"] } as import("../src/plugin.js").AnyPlugin
      const out = await onTestHost((t) => Effect.gen(function* () {
        const seen: Array<any> = []
        yield* Effect.forkScoped(t.events.pipe(Stream.runForEach((e) => Effect.sync(() => { seen.push(e) }))))
        yield* t.install(provider, as()); yield* t.install(dependent, as())
        yield* t.stepPlugin("stale-prov"); yield* t.stepPlugin("stale-dep")
        const loss = yield* Effect.forkChild(Effect.exit(viaRestart ? t.restart("stale-prov", as()) : t.remove("stale-prov", as())))
        const stateOf = () => Effect.map(t.snapshot, (s) => s.plugins.find((p) => p.id === "stale-dep")?.state)
        for (let i = 0; i < 200 && (yield* stateOf()) === "starting"; i++) yield* (yield* t.step) ? Effect.void : Effect.yieldNow
        for (let i = 0; i < extra; i++) yield* Effect.yieldNow
        yield* TestClock.adjust(200)
        yield* t.runUntilIdle
        yield* Fiber.join(loss)
        if (viaRestart) { yield* TestClock.adjust(200); yield* t.runUntilIdle }        // the new build after the provider returned
        for (let i = 0; i < 300; i++) yield* Effect.yieldNow
        const state = yield* stateOf()
        return { state, stale: seen.filter((e) => e.type === "build-finished" && e.stale && e.pluginId === "stale-dep") }
      }))
      // The stale outcome is discarded in every interleaving. After a plain loss the dependent waits; after a restart
      // the provider returns and the dependent's NEW build decides: `failed` only if that build really fails.
      expect({ seed, state: out.state }).toEqual({ seed, state: viaRestart ? (fails ? "failed" : "active") : "waiting" })
      expect(out.stale).toHaveLength(1)
    }
  }, 60_000)
})
