// Report 01 R3 (activation ordinal) and R7 (events carry revision, trigger, cause). Prototype only (CCR-BR-004).
import { Effect, Layer, Stream } from "effect"
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
      expect(dep.providerIds).toEqual([{ id: "example/logger", activation: log.activation }])
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
