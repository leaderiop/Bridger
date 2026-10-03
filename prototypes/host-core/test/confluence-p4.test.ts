// Phase-P4 exit criterion (roadmap): a confluence property test over random operation histories (BEH-BR-160),
// across realms, optional dependencies and children. Seeded, so a failing history can be replayed.
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import type * as Host from "../src/host.js"
import { as, run } from "./p4fixtures.js"
import { mulberry32, normal, plugins, present, refOf, setup, universe } from "./universe.js"

/** One random step on a random plugin, mostly an operation its current state admits; refusals stay part of the history. */
const step = (host: Host.Host, rnd: () => number, tally: { ok: number; refused: number }) => Effect.gen(function* () {
  const u = universe[Math.floor(rnd() * universe.length)]!
  const ref = refOf(u)
  const p = yield* present(host, u)
  const pick = <A>(xs: ReadonlyArray<A>) => xs[Math.floor(rnd() * xs.length)]!
  const op = rnd() < 0.1
    ? pick(["install", "remove", "disable", "enable", "restart", "remove-kid"] as const)          // anything, legal or not
    : !p ? "install" : p.state === "disabled" ? pick(["enable", "remove"] as const) : pick(["remove", "disable", "restart", "restart", "remove-kid"] as const)
  const run = {
    install: () => host.install(plugins[u.name]!, { ...as(), realm: u.realm, ...(rnd() < 0.3 ? { disabled: true } : {}) }),
    remove: () => host.remove(ref, as()),
    disable: () => host.disable(ref, as()),
    enable: () => host.enable(ref, as()),
    restart: () => host.restart(ref, as()),
    "remove-kid": () => host.remove({ id: "app/kid", realm: "default" }, as())     // a child removed directly
  }[op]
  const x = yield* Effect.exit(run())
  tally[x._tag === "Success" ? "ok" : "refused"]++
  return x
})

describe("confluence (BEH-BR-160, P4 exit criterion)", () => {
  it("random histories ending in the same installed set settle to equal snapshots", async () => {
    const tally = { ok: 0, refused: 0 }
    for (let seed = 1; seed <= 100; seed++) {
      const rnd = mulberry32(seed)
      // The target: which plugins end installed, and which of those disabled.
      const target = universe.filter(() => rnd() < 0.6).map((u) => ({ ...u, disabled: rnd() < 0.25 }))
      const history = await run((host) => Effect.gen(function* () {
        yield* setup(host)
        const length = 8 + Math.floor(rnd() * 10)
        for (let i = 0; i < length; i++) {
          // Sometimes two operations race; their interleaving is part of the history.
          if (rnd() < 0.3) yield* Effect.all([step(host, rnd, tally), step(host, rnd, tally)], { concurrency: "unbounded" })
          else yield* step(host, rnd, tally)
        }
        yield* host.awaitIdle
        // Finish: bring the installed set and enabled flags to the target, by direct operations.
        for (const u of universe) {
          const want = target.find((t) => t.name === u.name && t.realm === u.realm)
          const p = yield* present(host, u)
          if (!want) { if (p) yield* host.remove(refOf(u), as()); continue }
          if (!p) { yield* host.install(plugins[u.name]!, { ...as(), realm: u.realm, ...(want.disabled ? { disabled: true } : {}) }); continue }
          if (want.disabled && p.state !== "disabled") yield* host.disable(refOf(u), as())
          if (!want.disabled && p.state === "disabled") yield* host.enable(refOf(u), as())
        }
        // A directly removed child stays removed until the parent's next activation (BEH-BR-125): restart the parent
        // in both histories so the comparison is of installed sets, not of that one rule.
        if (target.some((t) => t.name === "app" && !t.disabled)) { yield* host.restart("app", as()) }
        return normal(yield* host.awaitIdle)
      }))
      const direct = await run((host) => Effect.gen(function* () {
        yield* setup(host)
        for (const t of target) yield* host.install(plugins[t.name]!, { ...as(), realm: t.realm, ...(t.disabled ? { disabled: true } : {}) })
        if (target.some((t) => t.name === "app" && !t.disabled)) { yield* host.awaitIdle; yield* host.restart("app", as()) }
        return normal(yield* host.awaitIdle)
      }))
      expect({ seed, history }).toEqual({ seed, history: direct })
    }
    expect(tally.ok).toBeGreaterThan(tally.refused)                          // the histories mostly change the host
  }, 60_000)
})

