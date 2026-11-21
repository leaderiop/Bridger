// Report 01 R5: abort of a parked stop (`stopping` -> `active`). Prototype only (CCR-BR-004).
import { Deferred, Effect, Exit, Fiber, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { define, type AnyPlugin } from "../src/plugin.js"
import { Logger, drive, idle, journal, loggerPlugin, stateOf, withHost } from "./fixtures.js"

const dependent = define({ id: "repro/dependent", requires: [Logger] as const, provides: [] as const, build: Layer.effectDiscard(Effect.void) as never }) as unknown as AnyPlugin
const failedWith = (e: Exit.Exit<unknown, unknown>, tag: string) => Exit.isFailure(e) && JSON.stringify(e.cause).includes(tag)

describe("R5: abort a parked stop", () => {
  it("a mistaken restart whose drain timed out is undone: provider active again, lease untouched, dependent restarted", async () => {
    await withHost((host) => Effect.gen(function* () {
      yield* host.install(loggerPlugin(journal())); yield* host.install(dependent); yield* idle(host)
      const before = (yield* host.snapshot).plugins.find((p) => p.id === "example/logger") as { activation: number }
      const entered = yield* Deferred.make<void>()
      const holder = yield* Effect.forkChild(host.use(Logger, () => Deferred.succeed(entered, undefined).pipe(Effect.andThen(Effect.never))))
      yield* Deferred.await(entered)
      expect(failedWith(yield* Effect.exit(drive(host, host.restart("example/logger", { drain: 20 }))), "DrainTimeout")).toBe(true)
      yield* idle(host)
      expect(yield* stateOf(host, "example/logger")).toBe("stopping")
      expect(yield* stateOf(host, "repro/dependent")).toBe("waiting")
      yield* drive(host, host.abort("example/logger"))
      yield* idle(host)
      const snap = yield* host.snapshot
      expect(snap.plugins.find((p) => p.id === "example/logger")).toMatchObject({ state: "active", activation: before.activation })
      expect(yield* stateOf(host, "repro/dependent")).toBe("active")
      expect(holder.pollUnsafe()).toBeUndefined()                              // the lease holder was never revoked
      expect(failedWith(yield* Effect.exit(drive(host, host.abort("example/logger"))), "Conflict")).toBe(true)   // nothing parked any more
      yield* Fiber.interrupt(holder)
      yield* drive(host, host.restart("example/logger")); yield* idle(host)       // a later stop drains normally
      expect(yield* stateOf(host, "example/logger")).toBe("active")
    }))
  })
})
