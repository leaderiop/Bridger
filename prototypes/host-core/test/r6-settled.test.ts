// Report 01 R6: awaitSettled settles chosen plugins without waiting for unrelated churn. Prototype only (CCR-BR-004).
import { Effect, Exit, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { define, type AnyPlugin } from "../src/plugin.js"
import { drive, journal, loggerPlugin, stateOf, withHost } from "./fixtures.js"

const slow = define({ id: "repro/slow", requires: [] as const, provides: [] as const, build: Layer.effectDiscard(Effect.sleep(600)) as never }) as unknown as AnyPlugin

describe("R6: awaitSettled", () => {
  it("returns for the chosen plugin while an unrelated one is still starting, and times out on the busy one", async () => {
    await withHost((host) => Effect.gen(function* () {
      yield* host.install(loggerPlugin(journal())); yield* host.install(slow)
      yield* host.stepPlugin("example/logger"); yield* host.stepPlugin("repro/slow")
      const r = yield* drive(host, host.awaitSettled(["example/logger"]))
      expect(r).toMatchObject([{ ref: { id: "example/logger" }, state: "active" }])
      expect(yield* stateOf(host, "repro/slow")).toBe("starting")
      const t = yield* Effect.exit(drive(host, host.awaitSettled(["repro/slow"], { timeout: 50 })))
      expect(Exit.isFailure(t) && JSON.stringify(t)).toContain("SettleTimeout")
    }))
  })
})
