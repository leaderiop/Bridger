// Report 01 R4: `replace` with `onFailure: { rollback }`. Prototype only (CCR-BR-004).
import { Effect, Exit, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { define, type AnyPlugin } from "../src/plugin.js"
import { Logger, drive, idle, journal, loggerPlugin, memorySink, stateOf, withHost } from "./fixtures.js"

const failingLogger = (version: string) => define({
  id: "example/logger", requires: [] as const, provides: [Logger] as const, meta: { version },
  build: Layer.effect(Logger, Effect.fail("new build failed") as never)
}) as unknown as AnyPlugin
const dependent = define({ id: "repro/dependent", requires: [Logger] as const, provides: [] as const, build: Layer.effectDiscard(Effect.void) as never }) as unknown as AnyPlugin
const ctx = (c: string) => ({ context: { actor: { id: "user-alice", kind: "user" as const }, correlationId: c } })
const tag = (e: Exit.Exit<unknown, unknown>) => Exit.isFailure(e) ? JSON.stringify(e.cause) : ""

describe("R4: replace with rollback", () => {
  it("a failing new build puts the previous definition back; dependents restart; the undo links to the forward record", async () => {
    const sink = memorySink()
    await withHost((host) => Effect.gen(function* () {
      const j = journal()
      yield* host.install(loggerPlugin(j)); yield* host.install(dependent); yield* idle(host)
      const exit = yield* Effect.exit(drive(host, host.replace(failingLogger("2"), { ...ctx("c-rb"), onFailure: { rollback: loggerPlugin(j, { version: "1" }) } })))
      expect(tag(exit)).toContain("ReplaceRolledBack"); expect(tag(exit)).toContain("restored")
      yield* idle(host)
      const snap = yield* host.snapshot
      expect(snap.plugins.find((p) => p.id === "example/logger")).toMatchObject({ state: "active", meta: { version: "1" } })
      expect(yield* stateOf(host, "repro/dependent")).toBe("active")
      yield* Effect.sleep(20)
      const forward = sink.records.find((r) => r.correlationId === "c-rb" && r.phase === "requested")
      expect(sink.records.some((r) => r.undoes !== undefined && r.undoes === forward?.recordId)).toBe(true)
    }), {}, sink.layer)
  })

  it("a failing rollback ends `failed` and reports both", async () => {
    await withHost((host) => Effect.gen(function* () {
      yield* host.install(loggerPlugin(journal())); yield* idle(host)
      const exit = yield* Effect.exit(drive(host, host.replace(failingLogger("2"), { onFailure: { rollback: failingLogger("1") } })))
      expect(tag(exit)).toContain("ReplaceRolledBack"); expect(tag(exit)).toContain("\"rollback\":\"failed\"")
      expect(yield* stateOf(host, "example/logger")).toBe("failed")
    }))
  })

  it("a successful new build needs no rollback", async () => {
    await withHost((host) => Effect.gen(function* () {
      const j = journal()
      yield* host.install(loggerPlugin(j)); yield* idle(host)
      yield* drive(host, host.replace(loggerPlugin(j, { version: "2" }), { onFailure: { rollback: loggerPlugin(j) } }))
      expect(yield* stateOf(host, "example/logger")).toBe("active")
    }))
  })
})

import type { DesiredPlugin } from "../src/desired.js"
import { as } from "./p4fixtures.js"
import { errorOf, onHost } from "./p7fixtures.js"

describe("R4: atomic reconcile with settle", () => {
  const entry = (plugin: AnyPlugin): DesiredPlugin => ({ id: plugin.id, plugin })
  const plain = define({ id: "ok", requires: [] as const, provides: [] as const, meta: { version: "1", digest: "ok-1" }, build: Layer.empty as never }) as unknown as AnyPlugin
  const bad = define({ id: "bad", requires: [] as const, provides: [] as const, meta: { version: "1", digest: "bad-1" }, build: Layer.effectDiscard(Effect.fail("boom")) as never }) as unknown as AnyPlugin

  it("a first activation that fails undoes the whole apply when `settle` is set", async () => {
    await onHost((host) => Effect.gen(function* () {
      const exit = yield* Effect.exit(drive(host, host.reconcile([entry(plain), entry(bad)], { ...as(), atomic: true, settle: true })))
      expect(errorOf(exit)).toMatchObject({ _tag: "ApplyRolledBack", failed: [{ id: "bad" }] })
      yield* idle(host)
      expect((yield* host.snapshot).plugins).toEqual([])
    }))
  })

  it("without `settle` the same apply succeeds and leaves `bad` failed (BEH-BR-322)", async () => {
    await onHost((host) => Effect.gen(function* () {
      yield* drive(host, host.reconcile([entry(plain), entry(bad)], { ...as(), atomic: true }))
      yield* idle(host)
      expect(yield* stateOf(host, "bad")).toBe("failed")
    }))
  })
})
