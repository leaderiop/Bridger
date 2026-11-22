// Report 05 DX-10: settlement on the TestHost is bounded and says what is pending; awaiting idle without stepping is documented to wait.
import { Effect, Exit, Layer, Cause } from "effect"
import { describe, expect, it } from "vitest"
import { define, type AnyPlugin } from "../src/plugin.js"
import { as, run } from "./p4fixtures.js"

const chain = (n: number) => Array.from({ length: n }, (_, i) =>
  define({ id: `p${i}`, requires: [], provides: [], build: Layer.empty as never }) as unknown as AnyPlugin)

describe("TestHost settlement (report 05 DX-10)", () => {
  it("runUntilIdle settles a host with work; with a bound too small it dies naming the pending steps instead of hanging", () => run((host) => Effect.gen(function* () {
    for (const p of chain(4)) yield* host.install(p, as())
    const exit = yield* Effect.exit(host.runUntilIdleWith({ maxSteps: 1 }))
    expect(Exit.isFailure(exit) && Cause.pretty(exit.cause)).toContain("runUntilIdle: not idle after 1 steps; pending:")
    const snap = yield* host.runUntilIdle                                          // the default bound is ample
    expect(snap.plugins.filter((p) => p.state === "active")).toHaveLength(4)
  })))
})
