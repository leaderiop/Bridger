// Report 03 R8 (BEH-BR-047, BEH-BR-074): retryCleanup re-runs the kept releases of a failed(cleanup) plugin. Prototype; evidences no requirement.
import { Effect, Exit, Layer, Scope } from "effect"
import { describe, expect, it } from "vitest"
import { define, type AnyPlugin } from "../src/plugin.js"
import { PluginRuntime } from "../src/runtime.js"
import * as Testing from "../src/testing.js"
import { drive, idle } from "./fixtures.js"
import { as, memorySink, run, settleWriter, stateIn } from "./p4fixtures.js"
import { errorOf } from "./p7fixtures.js"

const plugin = (fails: { pool: number; bare?: number }) => define({ id: "svc", requires: [] as const, provides: [] as const,
  build: Layer.effectDiscard(Effect.gen(function* () {
    const rt = yield* PluginRuntime
    if (fails.bare !== undefined) yield* Effect.addFinalizer(() => fails.bare!-- > 0 ? Effect.die(new Error("bare finalizer failed")) : Effect.void)
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

  it("a bare finalizer is retried too; what fails again stays, and the plugin leaves failed(cleanup) only when nothing is left", async () => {
    await run((host) => Effect.gen(function* () {
      yield* host.install(plugin({ pool: 2, bare: 3 }), as()); yield* idle(host)
      yield* Effect.exit(drive(host, host.restart("svc", as())))
      const first = errorOf(yield* Effect.exit(drive(host, host.retryCleanup("svc", as()))))
      expect(first.causes).toEqual([{ label: "pool", message: "pool busy" }, { message: "bare finalizer failed" }])   // both failed again, last acquired first
      const second = errorOf(yield* Effect.exit(drive(host, host.retryCleanup("svc", as()))))
      expect(second.causes).toEqual([{ message: "bare finalizer failed" }])       // the pool released on its third run; the bare finalizer fails once more
      expect(yield* stateIn(host, "svc")).toBe("failed")
      yield* drive(host, host.retryCleanup("svc", as()))
      expect(yield* stateIn(host, "svc")).toBe("disabled")
    }))
  })

  it("a close that timed out is not retryable: its finalizer is still running; remove acknowledges it", async () => {
    await run((host) => Effect.gen(function* () {
      yield* host.inject(Testing.Fault.closeHangs("svc"))
      yield* host.install(plugin({ pool: 0 }), as()); yield* idle(host)
      yield* Effect.exit(drive(host, host.restart("svc", as())))
      const r = errorOf(yield* Effect.exit(drive(host, host.retryCleanup("svc", as()))))
      expect(r.causes[0].message).toContain("close timed out")
      expect(yield* stateIn(host, "svc")).toBe("failed")
      yield* drive(host, host.remove("svc", as()))
      expect((yield* host.snapshot).plugins).toEqual([])
    }), { options: { closeTimeout: 50 } })
  })

  it("is refused on a plugin that is not failed(cleanup), changing nothing", async () => {
    await run((host) => Effect.gen(function* () {
      yield* host.install(plugin({ pool: 0 }), as()); yield* idle(host)
      const r = errorOf(yield* Effect.exit(drive(host, host.retryCleanup("svc", as()))))
      expect(r).toMatchObject({ _tag: "Conflict", pending: "not-cleanup-failed" })
      expect(yield* stateIn(host, "svc")).toBe("active")
    }))
  })

  it("documented limit (BEH-BR-074): a finalizer that closes a hand-made scope is retried as a no-op, so the inner finalizer is not run again", async () => {
    let inner = 0
    const p = define({ id: "svc", requires: [] as const, provides: [] as const, build: Layer.effectDiscard(Effect.gen(function* () {
      const sc = yield* Scope.make()
      yield* Scope.addFinalizer(sc, Effect.sync(() => { inner++ }).pipe(Effect.andThen(Effect.die(new Error("inner failed")))))
      yield* Effect.addFinalizer(() => Scope.close(sc, Exit.void))
    })) as never }) as unknown as AnyPlugin
    await run((host) => Effect.gen(function* () {
      yield* host.install(p, as()); yield* idle(host)
      yield* Effect.exit(drive(host, host.restart("svc", as())))
      yield* drive(host, host.retryCleanup("svc", as()))
      expect(inner).toBe(1)                                                         // the inner finalizer ran once and was not retried
    }))
  })
})
