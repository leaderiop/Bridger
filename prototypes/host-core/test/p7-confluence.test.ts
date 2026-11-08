// P7 (round 2): the confluence property (BEH-BR-160) over random histories that include lazy wakes, plans and
// handoff replaces, with random step orders on TestHost. Prototype; evidences no requirement.
import { Context, Effect, Exit, Fiber, Layer, Ref, Schema } from "effect"
import { TestClock } from "effect/testing"
import { describe, expect, it } from "vitest"
import * as Host from "../src/host.js"
import { lazy, type PluginManifest } from "../src/manifest.js"
import { define, type AnyPlugin } from "../src/plugin.js"
import * as Testing from "../src/testing.js"
import { as } from "./p4fixtures.js"
import { mulberry32 } from "./universe.js"

class Lz extends Context.Service<Lz, {}>()("example/Lz") {}
class Ho extends Context.Service<Ho, { readonly n: Ref.Ref<number> }>()("example/Ho") {}
const lzManifest: PluginManifest = { manifestVersion: 1, id: "lz", version: "1.0.0", provides: [{ serviceId: "example/Lz" }], requires: [] }
const lzEager = define({ id: "lz", requires: [] as const, provides: [Lz] as const, meta: { version: "1.0.0", digest: "lz" }, build: Layer.succeed(Lz, {}) }) as unknown as AnyPlugin
const lzLazy = lazy({ manifest: lzManifest, digest: "lz", load: Effect.succeed(lzEager) })
const lzc = define({ id: "lzc", requires: [Lz] as const, provides: [] as const, build: Layer.empty as never }) as unknown as AnyPlugin
const ho = (v: string) => define({ id: "ho", requires: [] as const, provides: [Ho] as const, meta: { version: v, digest: `ho${v}` },
  build: Layer.effect(Ho, Effect.map(Ref.make(0), (n) => ({ n }))),
  handoff: { version: "1", schema: Schema.Struct({ n: Schema.Number }), export: Effect.gen(function* () { return { n: yield* Ref.get((yield* Ho).n) } }), import: (s: { n: number }) => Effect.gen(function* () { yield* Ref.set((yield* Ho).n, s.n) }) } }) as unknown as AnyPlugin
const names = ["lz", "lzc", "ho"] as const
const options = { drainTimeout: 200, shutdownTimeout: 300 }
/** Like `normal` of the P4/P5 suites, plus a lazy registration's state class (finding G-P9: dormant vs. loaded is history). */
const normal = (s: Host.HostSnapshot, collapseLazy: boolean) => s.plugins.map((p) => JSON.stringify([p.id, p.realm,
  collapseLazy && p.lazy && (p.state === "dormant" || p.state === "active") ? "dormant|active" : p.state,
  p.state === "waiting" ? [...p.missingServiceIds].sort() : null])).sort()

describe("P7 confluence with lazy wakes, plans and handoffs (BEH-BR-160)", () => {
  it("random histories settle to the snapshot of a direct install, modulo a lazy plugin woken in the history", async () => {
    let differOnlyByLazy = 0
    for (let seed = 1; seed <= 30; seed++) {
      const rnd = mulberry32(seed * 104729)
      const target = names.filter(() => rnd() < 0.7)
      const pick = <A>(xs: ReadonlyArray<A>) => xs[Math.floor(rnd() * xs.length)]!
      const history = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
        const t = yield* Testing.make(options)
        const calls: Array<Fiber.Fiber<Exit.Exit<unknown, unknown>>> = []
        const present = (n: string) => Effect.map(t.snapshot, (s) => s.plugins.find((p) => p.id === n))
        for (let i = 0; i < 24; i++) {
          const r = rnd()
          if (r < 0.4) {
            const n = pick(names)
            const p = yield* present(n)
            const op: Effect.Effect<unknown, unknown> =
              !p ? t.install(n === "lz" ? lzLazy : n === "lzc" ? lzc : ho(pick(["1", "2"])), as())
                : n === "ho" ? pick([t.replace(ho(pick(["1", "2"])), as()), t.restart("ho", as()), t.remove("ho", as())])
                : pick([t.remove(n, as()), t.restart(n, as())])
            calls.push(yield* Effect.forkChild(Effect.exit(op)))
          } else if (r < 0.5) {
            calls.push(yield* Effect.forkChild(Effect.exit(t.wake({ _tag: "OnService", serviceId: "example/Lz" }))))
          } else if (r < 0.6) {
            // A plan is a read: it must change nothing, whatever it is asked.
            const before = normal(yield* t.snapshot, false)
            yield* t.plan(names.filter(() => rnd() < 0.5).map((n) => ({ id: n, plugin: (n === "lz" ? lzLazy : n === "lzc" ? lzc : ho("2")) as AnyPlugin })))
            expect(normal(yield* t.snapshot, false)).toEqual(before)
          } else {
            const pending = (yield* t.pending).filter((p) => !p.parked)
            if (pending.length) yield* t.stepPlugin({ id: pick(pending).pluginId, realm: "default" })
          }
        }
        yield* t.runUntilIdle
        for (const c of calls) yield* Fiber.join(c)
        const finish = (e: Effect.Effect<unknown, unknown>) => Effect.gen(function* () { const f = yield* Effect.forkChild(Effect.exit(e)); yield* t.runUntilIdle; return yield* Fiber.join(f) })
        for (const n of names) {
          const p = yield* present(n)
          const want = target.includes(n)
          if (!want && p) yield* finish(t.remove(n, as()))
          if (want && !p) yield* finish(t.install(n === "lz" ? lzLazy : n === "lzc" ? lzc : ho("1"), as()))
        }
        return yield* t.runUntilIdle
      })).pipe(Effect.provide(TestClock.layer())))
      const direct = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
        const h = yield* Host.make(options)
        for (const n of target) yield* h.install(n === "lz" ? lzLazy : n === "lzc" ? lzc : ho("1"), as())
        return yield* h.awaitIdle
      })))
      expect({ seed, s: normal(history, true) }).toEqual({ seed, s: normal(direct, true) })
      if (JSON.stringify(normal(history, false)) !== JSON.stringify(normal(direct, false))) differOnlyByLazy++
    }
    // Evidence for finding G-P9: some histories end with the lazy plugin loaded where a direct install leaves it dormant.
    expect(differOnlyByLazy).toBeGreaterThan(0)
  }, 120_000)
})
