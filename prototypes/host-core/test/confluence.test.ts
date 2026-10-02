// Confluence (BEH-BR-160): the settled state depends on what is installed, not on the
// order of operations that produced it. A seeded random walk over install/remove/restart/
// disable/enable is compared with a fresh host given only the final plugin set.
import { Context, Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { define, type AnyPlugin } from "../src/plugin.js"
import { withHost } from "./fixtures.js"

class S1 extends Context.Service<S1, {}>()("c/S1") {}
class S2 extends Context.Service<S2, {}>()("c/S2") {}
class S3 extends Context.Service<S3, {}>()("c/S3") {}
const plugins: Array<AnyPlugin> = [
  define({ id: "p1", requires: [] as const, provides: [S1] as const, build: Layer.succeed(S1, {}) }),
  define({ id: "p2", requires: [S1] as const, provides: [S2] as const, build: Layer.succeed(S2, {}) }),
  define({ id: "p3", requires: [S2] as const, provides: [S3] as const, build: Layer.succeed(S3, {}) }),
  define({ id: "p4", requires: [S1, S3] as const, provides: [] as const, build: Layer.empty }),
]
const rng = (seed: number) => () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)

describe("confluence", () => {
  for (const seed of [1, 7, 42, 99, 2026]) {
    it(`seed ${seed}: a random history settles to the same states as a fresh install of the final set`, async () => {
      const rand = rng(seed)
      const final = await withHost((host) => Effect.gen(function* () {
        const installed = new Map<string, "on" | "off">()
        for (let step = 0; step < 40; step++) {
          const p = plugins[Math.floor(rand() * plugins.length)]!
          const r = rand()
          const st = installed.get(p.id)
          if (!st) { yield* host.install(p); installed.set(p.id, "on") }
          else if (r < 0.3) { yield* host.remove(p.id); installed.delete(p.id) }
          else if (r < 0.5 && st === "on") { yield* host.disable(p.id); installed.set(p.id, "off") }
          else if (r < 0.7 && st === "off") { yield* host.enable(p.id); installed.set(p.id, "on") }
          else if (st === "on") yield* host.restart(p.id)
          if (rand() < 0.3) yield* host.awaitIdle
        }
        yield* host.awaitIdle
        const snap = yield* host.snapshot
        return { installed, states: Object.fromEntries(snap.plugins.map((x) => [x.id, x.state])) }
      }))
      const fresh = await withHost((host) => Effect.gen(function* () {
        for (const p of plugins) {
          const st = final.installed.get(p.id)
          if (st) yield* host.install(p, { disabled: st === "off" })
        }
        yield* host.awaitIdle
        const snap = yield* host.snapshot
        return Object.fromEntries(snap.plugins.map((x) => [x.id, x.state]))
      }))
      expect(final.states).toEqual(fresh)
    })
  }
})
