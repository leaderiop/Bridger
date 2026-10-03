// Scenarios for behaviours 03–07 (installation, states, activation, removal, replacement).
// Each `it` names the acceptance check of BEH-BR-183 it exercises.
import { Context, Effect, Exit, Layer, Stream } from "effect"
import { describe, expect, it } from "vitest"
import { define } from "../src/plugin.js"
import { Audit, Logger, Report, auditPlugin, journal, loggerPlugin, reportPlugin, drive, idle, stateOf, withHost } from "./fixtures.js"

describe("installation and activation", () => {
  it("check 19 / BEH-BR-017, 021, 033: install order does not matter; a missing requirement is state, not an error", async () => {
    const j = journal()
    await withHost((host) => Effect.gen(function* () {
      yield* host.install(auditPlugin(j))
      const waiting = (yield* host.snapshot).plugins[0]!
      expect(waiting.state).toBe("waiting")
      if (waiting.state === "waiting") expect(waiting.missingServiceIds).toEqual(["example/Logger"])   // discriminated union
      const handle = yield* host.install(loggerPlugin(j))
      yield* idle(host)
      yield* handle.awaitActive
      expect(yield* stateOf(host, "example/audit")).toBe("active")
      expect(j.lines).toEqual(["logger:build", "audit:build"])
    }))
  })

  it("check 9 / BEH-BR-018–020: duplicate ids, duplicate providers and cycles register nothing", async () => {
    await withHost((host) => Effect.gen(function* () {
      const j = journal()
      yield* host.install(loggerPlugin(j))
      const before = (yield* host.snapshot).revision
      const dupId = yield* Effect.exit(host.install(loggerPlugin(j)))
      const dupProvider = yield* Effect.exit(host.install(define({ id: "other/logger", requires: [] as const, provides: [Logger] as const, build: Layer.succeed(Logger, { log: () => Effect.void }) })))
      class A extends Context.Service<A, {}>()("cyc/A") {}
      class B extends Context.Service<B, {}>()("cyc/B") {}
      yield* host.install(define({ id: "cyc/a", requires: [B] as const, provides: [A] as const, build: Layer.succeed(A, {}) }))
      const afterA = (yield* host.snapshot).revision
      const cycle = yield* Effect.exit(host.install(define({ id: "cyc/b", requires: [A] as const, provides: [B] as const, build: Layer.succeed(B, {}) })))
      expect(Exit.isFailure(dupId) && JSON.stringify(dupId.cause)).toContain("DuplicatePlugin")
      expect(Exit.isFailure(dupProvider) && JSON.stringify(dupProvider.cause)).toContain("DuplicateProvider")
      expect(Exit.isFailure(cycle) && JSON.stringify(cycle.cause)).toContain("DependencyCycle")
      expect(afterA).toBeGreaterThan(before)
      expect((yield* host.snapshot).revision).toBe(afterA)                      // nothing registered, no new revision
      expect((yield* host.snapshot).plugins.map((p) => p.id)).toEqual(["example/logger", "cyc/a"])
    }))
  })

  it("check 11 / BEH-BR-038: two key objects with one ServiceId fail the activation with KeyMismatch", async () => {
    await withHost((host) => Effect.gen(function* () {
      class LoggerCopy extends Context.Service<LoggerCopy, { readonly log: (m: string) => Effect.Effect<void> }>()("example/Logger") {}
      yield* host.install(loggerPlugin(journal()))
      yield* host.install(define({ id: "bundled/consumer", requires: [LoggerCopy] as const, provides: [] as const, build: Layer.empty }))
      yield* idle(host)
      const s = (yield* host.snapshot).plugins.find((p) => p.id === "bundled/consumer")!
      expect(s.state).toBe("failed")
      if (s.state === "failed") expect(s.failure).toEqual({ phase: "activation", message: "KeyMismatch example/Logger" })
    }))
  })

  it("check 16 / BEH-BR-036: every activation builds its layer again (fresh memo map)", async () => {
    const j = journal()
    await withHost((host) => Effect.gen(function* () {
      yield* host.install(loggerPlugin(j))
      yield* idle(host)
      yield* drive(host, host.restart("example/logger"))
      yield* idle(host)
      expect(j.lines.filter((l) => l === "logger:build")).toHaveLength(2)
    }))
  })

  it("BEH-BR-034: a build still waiting for a slot when the plugin is removed is cancelled before it begins", async () => {
    const j = journal()
    await withHost((host) => Effect.gen(function* () {
      const queued = define({ id: "example/queued", requires: [] as const, provides: [] as const, build: Layer.effectDiscard(j.push("queued:build")) })
      yield* host.install(loggerPlugin(j, { buildDelay: 50 })); yield* host.install(queued)
      expect(yield* host.stepPlugin("example/logger")).toBe(true)              // takes the only slot
      expect(yield* host.stepPlugin("example/queued")).toBe(false)             // no slot: it cannot progress
      yield* drive(host, host.remove("example/queued"))                         // its stop can, and cancels the build
      expect((yield* host.snapshot).plugins.map((p) => p.id)).toEqual(["example/logger"])
      yield* idle(host)
      expect(j.lines).toEqual(["logger:build"])
    }), { concurrency: 1 })
  })

  it("BEH-BR-039: a build in flight when the plugin is removed is never published", async () => {
    const j = journal()
    await withHost((host) => Effect.gen(function* () {
      yield* host.install(loggerPlugin(j, { buildDelay: 50 }))
      expect(yield* host.stepPlugin("example/logger")).toBe(true)              // the build begins, then sleeps
      expect(yield* stateOf(host, "example/logger")).toBe("starting")
      yield* drive(host, host.remove("example/logger"))
      const snap = yield* host.snapshot
      expect(snap.plugins).toEqual([])
      expect(snap.availableServiceIds).toEqual(["@bridger/core/Events"])   // only the base event bus (BEH-BR-137)
      expect(j.lines).toEqual(["logger:build", "logger:close"])                  // the stale build's scope was closed
    }))
  })
})

describe("removal", () => {
  it("check 1 / BEH-BR-043, 044: dependents stop first and can use their provider in their finalizers", async () => {
    const j = journal()
    await withHost((host) => Effect.gen(function* () {
      yield* host.install(loggerPlugin(j)); yield* host.install(auditPlugin(j)); yield* host.install(reportPlugin(j))
      yield* idle(host)
      j.lines.length = 0
      yield* drive(host, host.remove("example/logger"))
      expect(j.lines).toEqual(["report:close", "log:audit-finalizer", "audit:close", "logger:close"])
      expect(yield* stateOf(host, "example/audit")).toBe("waiting")
      expect(yield* stateOf(host, "example/report")).toBe("waiting")
      expect(yield* stateOf(host, "example/logger")).toBe("uninstalled")
    }))
  })

  it("BEH-BR-046, 047: a cleanup failure is reported, and removing the plugin acknowledges the leak", async () => {
    await withHost((host) => Effect.gen(function* () {
      yield* host.install(loggerPlugin(journal(), { failCleanup: true }))
      yield* idle(host)
      const restart = yield* Effect.exit(drive(host, host.restart("example/logger")))
      expect(Exit.isFailure(restart) && JSON.stringify(restart.cause)).toContain("CleanupError")
      const s = (yield* host.snapshot).plugins[0]!
      expect(s.state === "failed" && s.failure.phase).toBe("cleanup")
      for (const op of [host.retry("example/logger"), host.restart("example/logger"), host.enable("example/logger")] as Array<Effect.Effect<void, unknown>>) {
        const e = yield* Effect.exit(drive(host, op))
        expect(Exit.isFailure(e) && JSON.stringify(e.cause)).toContain("cleanup-failure")
      }
      yield* drive(host, host.remove("example/logger"))                                      // acknowledges; does not re-run cleanup
      expect((yield* host.snapshot).plugins).toEqual([])
    }))
  })
})

describe("replacement and reactivation", () => {
  it("check 9 / BEH-BR-050, 051: replace validates before stopping; dropping a provided key strands dependents", async () => {
    const j = journal()
    await withHost((host) => Effect.gen(function* () {
      yield* host.install(loggerPlugin(j)); yield* host.install(auditPlugin(j)); yield* host.install(reportPlugin(j))
      yield* idle(host)
      // Invalid replacement: provides Report, already provided by example/report → rejected, nothing stops.
      const bad = yield* Effect.exit(drive(host, host.replace(define({ id: "example/audit", requires: [Logger] as const, provides: [Audit, Report] as const,
        build: Layer.mergeAll(Layer.succeed(Audit, { record: () => Effect.void }), Layer.succeed(Report, { run: Effect.succeed("x") })) }))))
      expect(Exit.isFailure(bad) && JSON.stringify(bad.cause)).toContain("ReplaceError")
      expect(yield* stateOf(host, "example/audit")).toBe("active")
      expect(yield* stateOf(host, "example/report")).toBe("active")
      // Valid replacement that no longer provides Audit: report is stranded in waiting.
      yield* drive(host, host.replace(define({ id: "example/audit", requires: [Logger] as const, provides: [] as const, build: Layer.empty })))
      yield* idle(host)
      expect(yield* stateOf(host, "example/audit")).toBe("active")
      const report = (yield* host.snapshot).plugins.find((p) => p.id === "example/report")!
      expect(report.state === "waiting" && report.missingServiceIds).toEqual(["example/Audit"])
    }))
  })

  it("check 10 / BEH-BR-031, 056, 057: failure is sticky through dependency loss; retry lands by availability", async () => {
    await withHost((host) => Effect.gen(function* () {
      const j = journal()
      let attempts = 0
      const flaky = define({ id: "example/flaky", requires: [Logger] as const, provides: [] as const,
        build: Layer.effectDiscard(Effect.suspend(() => ++attempts === 1 ? Effect.fail("boom") : Effect.void)) })
      yield* host.install(loggerPlugin(j)); yield* host.install(flaky)
      yield* idle(host)
      expect(yield* stateOf(host, "example/flaky")).toBe("failed")
      yield* drive(host, host.remove("example/logger"))
      expect(yield* stateOf(host, "example/flaky")).toBe("failed")             // dependency loss does not touch failed
      yield* host.install(loggerPlugin(j)); yield* idle(host)
      expect(yield* stateOf(host, "example/flaky")).toBe("failed")             // nor does its return: no automatic retry
      yield* drive(host, host.retry("example/flaky")); yield* idle(host)
      expect(yield* stateOf(host, "example/flaky")).toBe("active")
      expect(attempts).toBe(2)
    }))
  })

  it("check 27 / BEH-BR-060–062: disable frees the provider slot; enable re-validates", async () => {
    await withHost((host) => Effect.gen(function* () {
      const j = journal()
      yield* host.install(loggerPlugin(j)); yield* idle(host)
      yield* drive(host, host.disable("example/logger"))
      expect(yield* stateOf(host, "example/logger")).toBe("disabled")
      yield* host.install(define({ id: "other/logger", requires: [] as const, provides: [Logger] as const, build: Layer.succeed(Logger, { log: () => Effect.void }) }))
      const enable = yield* Effect.exit(drive(host, host.enable("example/logger")))
      expect(Exit.isFailure(enable) && JSON.stringify(enable.cause)).toContain("DuplicateProvider")
      expect(yield* stateOf(host, "example/logger")).toBe("disabled")
    }))
  })
})

describe("snapshots", () => {
  it("BEH-BR-029, 030: revisions never regress and `changes` emits the current snapshot first", async () => {
    await withHost((host) => Effect.gen(function* () {
      const first = yield* Stream.runHead(host.changes)
      yield* host.install(loggerPlugin(journal())); yield* idle(host)
      const snap = yield* host.snapshot
      expect(first._tag === "Some" && first.value.revision).toBe(0)
      expect(snap.revision).toBeGreaterThan(0)
      const head = yield* Stream.runHead(host.changes)
      expect(head._tag === "Some" && head.value.revision).toBe(snap.revision)
    }))
  })

  it("check 8 / BEH-BR-105, 106: shutdown stops in reverse dependency order and reports cleanup failures", async () => {
    const j = journal()
    const report = await withHost((host) => Effect.gen(function* () {
      yield* host.install(loggerPlugin(j)); yield* host.install(auditPlugin(j)); yield* idle(host)
      j.lines.length = 0
      const r = yield* drive(host, host.shutdown())
      const after = yield* Effect.exit(host.install(reportPlugin(j)))
      expect(Exit.isFailure(after) && JSON.stringify(after.cause)).toContain("HostClosed")
      return r
    }))
    expect(j.lines).toEqual(["log:audit-finalizer", "audit:close", "logger:close"])
    expect(report.failed).toEqual([])
    expect(report.stopped).toEqual(["example/audit", "example/logger"])
  })
})
