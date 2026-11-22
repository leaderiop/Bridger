// BEH-BR-297: hook point durations are Duration.Input; a string, a number and a Duration are the same value.
import { Duration, Effect } from "effect"
import { describe, expect, it } from "vitest"
import { HookPoint } from "../src/hooks.js"
import { run } from "./p4fixtures.js"

describe("hook point durations (BEH-BR-297)", () => {
  it("accepts strings, numbers and Duration values; timeout above deadline is still a defect", () => run(() => Effect.gen(function* () {
    const a = yield* HookPoint.make<{}, never, never, never>("d/a", { codes: [], who: () => true, timeout: "200 millis", deadline: "1 second", onError: "deny" })
    const b = yield* HookPoint.make<{}, never, never, never>("d/b", { codes: [], who: () => true, timeout: 200, deadline: Duration.seconds(1), onError: "deny", breaker: { failures: 3, window: "1 minute", cooldown: "30 seconds" } })
    expect(a.id).toBe("d/a"); expect(b.id).toBe("d/b")
    const bad = yield* Effect.exit(HookPoint.make<{}, never, never, never>("d/c", { codes: [], who: () => true, timeout: "2 seconds", deadline: "1 second", onError: "deny" }))
    expect(bad._tag).toBe("Failure")
  })))
})
