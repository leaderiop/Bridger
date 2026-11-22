// Report 01 R3 (activation ordinal) and R7 (events carry revision, trigger, cause). Prototype only (CCR-BR-004).
import { Context, Effect, Layer, Stream } from "effect"
import { describe, expect, it } from "vitest"
import { define, type AnyPlugin } from "../src/plugin.js"
import type { HostEvent } from "../src/events.js"
import { Logger, drive, idle, journal, loggerPlugin, withHost } from "./fixtures.js"

const dependent = define({ id: "repro/dependent", requires: [Logger] as const, provides: [] as const, build: Layer.effectDiscard(Effect.void) as never }) as unknown as AnyPlugin

const scenario = withHost((host) => Effect.gen(function* () {
  const seen: HostEvent[] = []
  yield* Effect.forkScoped(host.events.pipe(Stream.runForEach((e) => Effect.sync(() => { seen.push(e) }))))
  yield* host.install(loggerPlugin(journal())); yield* host.install(dependent)
  yield* idle(host)
  const snap1 = yield* host.snapshot
  yield* drive(host, host.restart("example/logger")); yield* idle(host)
  const snap2 = yield* host.snapshot
  return { seen, snap1, snap2 }
}))

const act = (s: { plugins: ReadonlyArray<any> }, id: string) => s.plugins.find((p) => p.id === id)

describe("R3: activation ordinal", () => {
  it("a dependent captures its provider's activation, and a restart gives both a new, larger one", async () => {
    const { snap1, snap2 } = await scenario
    for (const s of [snap1, snap2]) {
      const dep = act(s, "repro/dependent"), log = act(s, "example/logger")
      expect(dep.providerIds).toEqual([{ id: "example/logger", realm: "default", activation: log.activation }])
    }
    expect(act(snap2, "example/logger").activation).toBeGreaterThan(act(snap1, "example/logger").activation)
    expect(act(snap2, "repro/dependent").activation).toBeGreaterThan(act(snap1, "repro/dependent").activation)
  })
})

describe("R7: events correlate with revisions and causes", () => {
  it("every event carries a non-decreasing revision; causeSeq points earlier; transitions chain; triggers are set", async () => {
    const { seen } = await scenario
    let last = 0
    for (const e of seen) { expect(e.revision).toBeGreaterThanOrEqual(last); last = e.revision!; if (e.causeSeq !== undefined) expect(e.causeSeq).toBeLessThan(e.seq) }
    const changes = seen.filter((e) => e.type === "state-changed") as Array<HostEvent & { from: string; to: string; trigger?: string }>
    for (const id of new Set(changes.map((c) => c.pluginId))) {
      const mine = changes.filter((c) => c.pluginId === id)
      mine.slice(1).forEach((c, i) => expect(c.from).toBe(mine[i]!.to))
    }
    expect(changes.every((c) => c.trigger !== undefined)).toBe(true)
    expect(changes.some((c) => c.trigger === "dependency-loss" && c.causeSeq !== undefined)).toBe(true)
  })
})

class SvcA extends Context.Service<SvcA, {}>()("example/CauseA") {}
class SvcB extends Context.Service<SvcB, {}>()("example/CauseB") {}
const prov = (id: string, k: typeof SvcA | typeof SvcB) => ({ id, requires: [], provides: [k], build: Layer.succeed(k as never, {}) as unknown as AnyPlugin["build"] }) as AnyPlugin
const dep = (id: string, k: typeof SvcA | typeof SvcB) => ({ id, requires: [k], provides: [], build: Layer.empty as unknown as AnyPlugin["build"] }) as AnyPlugin

describe("R7: causeSeq names the provider's own stop, per edge", () => {
  it("two independent providers lose their dependents in turn; each dependent points at its own provider's stopping event", async () => {
    await withHost((host) => Effect.gen(function* () {
      const seen: HostEvent[] = []
      yield* Effect.forkScoped(host.events.pipe(Stream.runForEach((e) => Effect.sync(() => { seen.push(e) }))))
      for (const p of [prov("pa", SvcA), prov("pb", SvcB), dep("da", SvcA), dep("db", SvcB)]) yield* host.install(p)
      yield* idle(host)
      yield* drive(host, host.remove("pa")); yield* drive(host, host.remove("pb")); yield* idle(host)
      for (let i = 0; i < 300; i++) yield* Effect.yieldNow
      const stopping = (id: string) => seen.find((e) => e.type === "state-changed" && e.pluginId === id && (e as any).to === "stopping")!
      const loss = (id: string) => seen.find((e) => e.type === "state-changed" && e.pluginId === id && (e as any).trigger === "dependency-loss" && (e as any).to === "stopping")!
      expect(loss("da").causeSeq).toBe(stopping("pa").seq)
      expect(loss("db").causeSeq).toBe(stopping("pb").seq)
      expect(loss("da").causeSeq).not.toBe(loss("db").causeSeq)
    }))
  })
  it("providerIds carry the provider's realm, so a realm-isolated provider is not confused with the default one", async () => {
    await withHost((host) => Effect.gen(function* () {
      yield* host.defineRealm("t", { isolate: [Logger] })
      yield* host.install(loggerPlugin(journal()), { realm: "t" }); yield* host.install(dependent, { realm: "t" }); yield* idle(host)
      const snap = yield* host.snapshot
      expect(snap.plugins.find((p) => p.id === "repro/dependent" && p.realm === "t")).toMatchObject({ providerIds: [{ id: "example/logger", realm: "t" }] })
    }))
  })
})
