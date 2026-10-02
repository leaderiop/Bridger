// Phase-P4 exit criterion (roadmap): a confluence property test over random operation histories (BEH-BR-160),
// across realms, optional dependencies and children. Seeded, so a failing history can be replayed.
import { Context, Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type * as Host from "../src/host.js"
import { PluginRuntime } from "../src/runtime.js"
import type { AnyPlugin } from "../src/plugin.js"
import { Audit, Logger, Report, auditPlugin, journal, loggerPlugin, reportPlugin } from "./fixtures.js"
import { as, run } from "./p4fixtures.js"

class Clock2 extends Context.Service<Clock2, {}>()("example/Clock") {}
class Parent extends Context.Service<Parent, {}>()("example/Parent") {}

const j = journal()
const plugins: Record<string, AnyPlugin> = {
  logger: loggerPlugin(j) as AnyPlugin,
  audit: auditPlugin(j) as AnyPlugin,
  report: reportPlugin(j) as AnyPlugin,
  clock: { id: "clock", requires: [], provides: [Clock2], build: Layer.succeed(Clock2, {}) as unknown as AnyPlugin["build"] },
  ui: { id: "ui", requires: [], provides: [], optional: [Logger, Audit], build: Layer.empty as unknown as AnyPlugin["build"] },
  app: {
    id: "app", requires: [Clock2], provides: [Parent],
    build: Layer.effect(Parent, Effect.gen(function* () {
      const rt = yield* PluginRuntime
      yield* rt.install({ id: "kid", requires: [Parent, Report], provides: [], build: Layer.empty as unknown as AnyPlugin["build"] })
      return {}
    })) as unknown as AnyPlugin["build"]
  }
}
/** The universe: (plugin, realm). Realm "t" isolates Logger and Audit, so logger and audit run once per realm. */
const universe: ReadonlyArray<{ readonly name: string; readonly realm: string }> = [
  ...Object.keys(plugins).map((name) => ({ name, realm: "default" })),
  { name: "logger", realm: "t" }, { name: "audit", realm: "t" }, { name: "ui", realm: "t" }
]
const refOf = (u: { name: string; realm: string }) => ({ id: plugins[u.name]!.id, realm: u.realm })

const mulberry32 = (seed: number) => () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const setup = (host: Host.Host) => host.defineRealm("t", { isolate: [Logger, Audit] }, as())
const present = (host: Host.Host, u: { name: string; realm: string }) =>
  Effect.map(host.snapshot, (s) => s.plugins.find((p) => p.id === plugins[u.name]!.id && p.realm === u.realm))
/** Compared modulo revision numbers and timing (BEH-BR-160): ids, realms, parents, states, missing keys. */
const normal = (s: Host.HostSnapshot) => s.plugins
  .map((p) => JSON.stringify([p.id, p.realm, p.parentId ?? null, p.state, p.state === "waiting" ? [...p.missingServiceIds].sort() : null]))
  .sort()

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

void Report
