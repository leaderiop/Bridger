// Report 01 R1/R2 (BEH-BR-039, BEH-BR-160): a stale build's outcome is always discarded and reported, never sticky.
// Prototype only; evidences no requirement (CCR-BR-004).
import { Effect, Layer, Stream } from "effect"
import { describe, expect, it } from "vitest"
import { define, type AnyPlugin } from "../src/plugin.js"
import type { HostEvent } from "../src/events.js"
import { Logger, drive, idle, journal, loggerPlugin, stateOf, withHost } from "./fixtures.js"

const dependent = (build: Effect.Effect<void, string>) => define({
  id: "repro/dependent", requires: [Logger] as const, provides: [] as const,
  build: Layer.effectDiscard(build) as never
}) as unknown as AnyPlugin

const run = (cause: "provider-removed" | "operator-removed") => withHost((host) => Effect.gen(function* () {
  const seen: HostEvent[] = []
  yield* Effect.forkScoped(host.events.pipe(Stream.runForEach((e) => Effect.sync(() => { seen.push(e) }))))
  yield* host.install(loggerPlugin(journal()))
  yield* host.install(dependent(Effect.andThen(Effect.sleep(400), Effect.fail("late build failure"))))
  yield* host.stepPlugin("example/logger")
  yield* host.stepPlugin("repro/dependent")
  yield* drive(host, host.remove(cause === "provider-removed" ? "example/logger" : "repro/dependent"))
  yield* idle(host)
  const isStale = (e: HostEvent) => e.type === "build-finished" && (e as { stale?: boolean }).stale
  for (let i = 0; i < 1000 && !seen.some(isStale); i++) yield* Effect.sleep(2)   // the collector fiber catches up
  const state = cause === "provider-removed" ? yield* stateOf(host, "repro/dependent") : undefined
  return { state, stale: seen.filter((e) => e.type === "build-finished" && (e as { stale?: boolean }).stale) as Array<HostEvent & { discardedFailures?: number; outcome?: string }> }
}))

describe("BEH-BR-039 (R1): stale failed builds are discarded and reported", () => {
  it("provider loss: plugin is `waiting`, event is stale with discardedFailures 1", async () => {
    const r = await run("provider-removed")
    expect(r.state).toBe("waiting")
    expect(r.stale).toHaveLength(1)
    expect(r.stale[0]).toMatchObject({ outcome: "failure", discardedFailures: 1 })
  })
  it("operator removal: failure is likewise reported stale", async () => {
    const r = await run("operator-removed")
    expect(r.stale[0]).toMatchObject({ outcome: "failure", discardedFailures: 1 })
  })
})
