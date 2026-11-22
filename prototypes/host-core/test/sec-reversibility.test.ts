// Report 06 R4 (S6): a plan says which entries an apply cannot take back, and an atomic apply runs them last (BEH-BR-327).
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { DesiredPlugin } from "../src/desired.js"
import { define, type AnyPlugin } from "../src/plugin.js"
import { PluginRuntime } from "../src/runtime.js"
import { drive, idle } from "./fixtures.js"
import { as, stateIn } from "./p4fixtures.js"
import { errorOf, onHost, rec } from "./p7fixtures.js"

const entry = (plugin: AnyPlugin): DesiredPlugin => ({ id: plugin.id, plugin })
const meta = (version: string) => ({ version, digest: `d-${version}` })
/** A plugin whose activation holds a resource acquired as irreversible: a key shred, a sent message (BEH-BR-119). */
const shred = define({
  id: "shred", requires: [] as const, provides: [] as const, meta: meta("1"),
  build: Layer.effectDiscard(Effect.gen(function* () {
    const rt = yield* PluginRuntime
    yield* rt.acquire("keys", Effect.void, () => Effect.void, { irreversible: true })
  })) as unknown as AnyPlugin["build"]
}) as unknown as AnyPlugin
const plain = (id: string, version: string, fail = false): AnyPlugin => define({
  id, requires: [] as const, provides: [] as const, meta: meta(version),
  build: Layer.effectDiscard(fail ? Effect.fail("boom") : Effect.void) as never
}) as unknown as AnyPlugin

describe("reversibility of plan entries (BEH-BR-327)", () => {
  it("an entry that stops or replaces a plugin holding an irreversible resource is irreversible; every other entry is reversible", async () => {
    await onHost((host) => Effect.gen(function* () {
      yield* drive(host, host.reconcile([entry(shred), entry(plain("b", "1"))], as()))
      yield* idle(host)
      const pruning = yield* host.plan([entry(plain("b", "1"))])                       // shred is pruned
      expect(pruning.entries.map((e) => [e.target.id, e.actions[0], e.reversibility])).toEqual([["shred", "remove", "irreversible"]])
      const replacing = yield* host.plan([entry({ ...shred, meta: meta("2") } as AnyPlugin), entry(plain("b", "2"))])
      expect(replacing.entries.map((e) => [e.target.id, e.reversibility]).sort()).toEqual([["b", "reversible"], ["shred", "irreversible"]])
      const fresh = yield* host.plan([entry(shred), entry(plain("b", "1")), entry(plain("c", "1"))])
      expect(fresh.entries.map((e) => [e.target.id, e.reversibility])).toEqual([["c", "reversible"]])
    }))
  })

  it("the gate sees the class of a request that stops an irreversible plugin, and none on any other", async () => {
    const requests: Array<{ operation: string; reversibility?: string }> = []
    await onHost((host) => Effect.gen(function* () {
      yield* drive(host, host.install(shred, as())); yield* idle(host)
      yield* drive(host, host.install(plain("b", "1"), as())); yield* idle(host)
      yield* drive(host, host.remove("b", as()))
      yield* drive(host, host.remove("shred", as()))
    }), { gate: { authorize: (r) => Effect.sync(() => { requests.push({ operation: r.operation, ...(r.reversibility ? { reversibility: r.reversibility } : {}) }) }) } })
    expect(requests.filter((r) => r.operation === "remove")).toEqual([{ operation: "remove" }, { operation: "remove", reversibility: "irreversible" }])
  })
})

describe("output commit: an atomic apply runs irreversible entries last (BEH-BR-327)", () => {
  it("a failing replace rolls the apply back before the irreversible removal ever runs", async () => {
    const { records, sink } = rec()
    await onHost((host) => Effect.gen(function* () {
      yield* drive(host, host.reconcile([entry(shred), entry(plain("b", "1"))], as()))
      yield* idle(host)
      const exit = yield* Effect.exit(drive(host, host.reconcile([entry(plain("b", "2", true))], { ...as(), atomic: true, settle: true })))
      expect(errorOf(exit)).toMatchObject({ _tag: "ApplyRolledBack", failed: [{ id: "b" }] })
      yield* idle(host)
      expect(yield* stateIn(host, "shred")).toBe("active")                             // never stopped: its resource is intact
      expect(yield* stateIn(host, "b")).toBe("active")
    }), { sink })
    expect(records.some((r) => r.operation === "remove" && r.target?.id === "shred")).toBe(false)
  })

  it("without atomic the order stays removals first; the plan lists the irreversible removal after the reversible ones in its phase", async () => {
    await onHost((host) => Effect.gen(function* () {
      yield* drive(host, host.reconcile([entry(shred), entry(plain("a", "1")), entry(plain("b", "1"))], as()))
      yield* idle(host)
      const p = yield* host.plan([])                                                   // prune all three
      expect(p.entries.map((e) => e.target.id)).toEqual(["a", "b", "shred"])           // reversible first, irreversible last, free of dependencies
      const atomic = yield* host.plan([entry(plain("n", "1"))], { atomic: true })
      expect(atomic.entries.map((e) => e.target.id).at(-1)).toBe("shred")             // deferred past the install
    }))
  })
})
