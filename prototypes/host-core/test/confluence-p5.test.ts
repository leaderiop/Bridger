// Phase-P5 exit criterion (prototype form): the confluence property of BEH-BR-160 driven through TestHost, with the
// interleaving itself chosen at random — operations are forked and the test steps randomly chosen pending items.
import { Effect, Exit, Fiber } from "effect"
import { TestClock } from "effect/testing"
import { describe, expect, it } from "vitest"
import * as Host from "../src/host.js"
import * as Testing from "../src/testing.js"
import { as } from "./p4fixtures.js"
import { mulberry32, normal, plugins, present, refOf, setup, universe } from "./universe.js"

const options = { drainTimeout: 200, shutdownTimeout: 300 }
const onTestHost = <A>(body: (t: Testing.TestHost) => Effect.Effect<A, unknown, import("effect").Scope.Scope>) =>
  Effect.runPromise(Effect.scoped(Effect.flatMap(Testing.make(options), body)).pipe(Effect.provide(TestClock.layer())))
const onHost = <A>(body: (h: Host.Host) => Effect.Effect<A, unknown>) =>
  Effect.runPromise(Effect.scoped(Effect.flatMap(Host.make(options), body)))

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

describe("confluence through TestHost (BEH-BR-160, BEH-BR-178; P5 exit criterion)", () => {
  it("random histories with randomly chosen step orders settle to the snapshot of a direct install", async () => {
    let stepped = 0
    for (let seed = 1; seed <= 40; seed++) {
      const rnd = mulberry32(seed * 7919)
      const target = universe.filter(() => rnd() < 0.6).map((u) => ({ ...u, disabled: rnd() < 0.25 }))
      const history = await onTestHost((t) => Effect.gen(function* () {
        yield* setup(t)
        const calls: Array<Fiber.Fiber<Exit.Exit<unknown, unknown>>> = []
        for (let i = 0; i < 20; i++) {
          if (rnd() < 0.45) { calls.push(yield* startOp(t, rnd)); continue }
          const pending = (yield* t.pending).filter((p) => !p.parked)
          if (pending.length === 0) continue
          const p = pending[Math.floor(rnd() * pending.length)]!
          if (yield* t.stepPlugin({ id: p.pluginId, realm: p.realm })) stepped++
        }
        yield* t.runUntilIdle
        for (const c of calls) yield* Fiber.join(c)
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
        if (target.some((x) => x.name === "app" && !x.disabled)) yield* finish(t.restart("app", as()))
        return normal(yield* t.runUntilIdle)
      }))
      const direct = await onHost((h) => Effect.gen(function* () {
        yield* setup(h)
        for (const x of target) yield* h.install(plugins[x.name]!, { ...as(), realm: x.realm, ...(x.disabled ? { disabled: true } : {}) })
        if (target.some((x) => x.name === "app" && !x.disabled)) { yield* h.awaitIdle; yield* h.restart("app", as()) }
        return normal(yield* h.awaitIdle)
      }))
      expect({ seed, history }).toEqual({ seed, history: direct })
    }
    expect(stepped).toBeGreaterThan(100)                                       // the histories chose many interleavings
  }, 120_000)
})
