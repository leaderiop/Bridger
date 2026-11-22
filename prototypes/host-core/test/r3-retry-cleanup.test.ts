// Report 03 R8 (BEH-BR-047, BEH-BR-074): retryCleanup re-runs the kept releases of a failed(cleanup) plugin. Prototype; evidences no requirement.
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { define, type AnyPlugin } from "../src/plugin.js"
import { PluginRuntime } from "../src/runtime.js"
import { drive, idle } from "./fixtures.js"
import { as, memorySink, run, settleWriter, stateIn } from "./p4fixtures.js"
import { errorOf } from "./p7fixtures.js"

const plugin = (fails: { pool: number; bare?: boolean }) => define({ id: "svc", requires: [] as const, provides: [] as const,
  build: Layer.effectDiscard(Effect.gen(function* () {
    const rt = yield* PluginRuntime
    if (fails.bare) yield* Effect.addFinalizer(() => Effect.die(new Error("bare finalizer failed")))
    yield* rt.acquire("pool", Effect.succeed(1), () => fails.pool-- > 0 ? Effect.die(new Error("pool busy")) : Effect.void)
  })) as never }) as unknown as AnyPlugin

describe("report 03 R8: retryCleanup", () => {
  it("re-runs the failed release; once nothing is left the plugin is disabled, with no leak record", async () => {
    const { records, sink } = memorySink()
    await run((host) => Effect.gen(function* () {
      yield* host.install(plugin({ pool: 1 }), as()); yield* idle(host)
      expect(errorOf(yield* Effect.exit(drive(host, host.restart("svc", as()))))._tag).toBe("CleanupError")
      expect(yield* stateIn(host, "svc")).toBe("failed")
      expect((yield* host.inspect("svc")).resources).toEqual([{ label: "pool", state: "release-failed" }])
      yield* drive(host, host.retryCleanup("svc", as()))
      expect(yield* stateIn(host, "svc")).toBe("disabled")
      expect((yield* host.inspect("svc")).resources).toEqual([])
      yield* settleWriter
      expect(records.some((r) => r.operation === "leak-acknowledged")).toBe(false)
      expect(records.filter((r) => r.operation === "retryCleanup" && r.phase === "completed")).toHaveLength(1)
      yield* drive(host, host.enable("svc", as())); yield* idle(host)
      expect(yield* stateIn(host, "svc")).toBe("active")                        // enable follows as for any disabled plugin
    }), { sink })
  })

  it("a release that fails again, or a failure that was not kept, leaves the plugin failed(cleanup) with the remaining causes", async () => {
    await run((host) => Effect.gen(function* () {
      yield* host.install(plugin({ pool: 2, bare: true }), as()); yield* idle(host)
      yield* Effect.exit(drive(host, host.restart("svc", as())))
      const first = errorOf(yield* Effect.exit(drive(host, host.retryCleanup("svc", as()))))
      expect(first._tag).toBe("CleanupError")
      expect(first.causes).toEqual([{ label: "pool", message: "pool busy" }, { message: "bare finalizer failed" }])   // last acquired first
      const second = errorOf(yield* Effect.exit(drive(host, host.retryCleanup("svc", as()))))
      expect(second.causes).toEqual([{ message: "bare finalizer failed" }])       // the pool is released now; the bare finalizer is not retryable
      expect(yield* stateIn(host, "svc")).toBe("failed")
      yield* drive(host, host.remove("svc", as()))                                 // the acknowledgement is still the way out
      expect((yield* host.snapshot).plugins).toEqual([])
    }))
  })

  it("is refused on a plugin that is not failed(cleanup), changing nothing", async () => {
    await run((host) => Effect.gen(function* () {
      yield* host.install(plugin({ pool: 0 }), as()); yield* idle(host)
      const r = errorOf(yield* Effect.exit(drive(host, host.retryCleanup("svc", as()))))
      expect(r).toMatchObject({ _tag: "Conflict", pending: "not-cleanup-failed" })
      expect(yield* stateIn(host, "svc")).toBe("active")
    }))
  })
})
