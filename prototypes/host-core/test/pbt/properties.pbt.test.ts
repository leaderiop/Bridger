// Report 07, R4: the remaining model-based properties, all on TestHost with a TestClock (no real sleeps).
//  - LIFO revert (check 1, BEH-BR-043): over random provider graphs, every finalizer runs once and dependents close first.
//  - drain bound (INV-BR-017): a held lease makes a removal fail with DrainTimeout exactly when the limit passes.
//  - audit chain (INV-BR-022, 023): any history leaves a gapless `auditSeq` and one terminal record per `requested`.
//  - reconcile idempotence (BEH-BR-159): reconciling a list twice changes nothing the second time.
// The state x operation table (R4.2) is not sampled: `leases.test.ts` walks every cell live, which is stronger.
import { Context, Deferred, Effect, Exit, Fiber, Layer } from "effect"
import { TestClock } from "effect/testing"
import * as fc from "fast-check"
import { describe, expect, it } from "vitest"
import type { DesiredPlugin } from "../../src/desired.js"
import { inv022, inv023 } from "../../../../references/core/formal/model.js"
import { AuditSink, verifyAuditSequence, type AuditRecord } from "../../src/gxp.js"
import { define, type AnyPlugin } from "../../src/plugin.js"
import * as Testing from "../../src/testing.js"
import { drive, idle, journal, Logger, loggerPlugin } from "../fixtures.js"
import { as } from "../p4fixtures.js"
import { assertProperty, onTestHost } from "./config.js"

// ---------------------------------------------------------------- LIFO revert
class G0 extends Context.Service<G0, {}>()("g/0") {}
class G1 extends Context.Service<G1, {}>()("g/1") {}
class G2 extends Context.Service<G2, {}>()("g/2") {}
class G3 extends Context.Service<G3, {}>()("g/3") {}
class G4 extends Context.Service<G4, {}>()("g/4") {}
const services = [G0, G1, G2, G3, G4] as const

/** Node i may require any subset of the nodes before it: a random acyclic provider graph. */
const graph = fc.integer({ min: 2, max: 5 }).chain((n) =>
  fc.tuple(...Array.from({ length: n }, (_, i) => fc.subarray(Array.from({ length: i }, (_, k) => k)))))

const graphPlugin = (i: number, requires: ReadonlyArray<number>, j: ReturnType<typeof journal>) => {
  const S = services[i]!
  return define({
    id: `g${i}`, requires: requires.map((k) => services[k]!) as never, provides: [S] as never,
    build: Layer.effect(S as never, Effect.gen(function* () {
      for (const k of requires) yield* (services[k]! as unknown as Context.Service<any, any>)
      yield* Effect.addFinalizer(() => j.push(`close:${i}`))
      return {}
    })) as never
  }) as unknown as AnyPlugin
}

/** Every node that needs `i`, directly or through others. */
const dependentsOf = (g: ReadonlyArray<ReadonlyArray<number>>, i: number): Set<number> => {
  const out = new Set<number>()
  const walk = (x: number) => g.forEach((req, d) => { if (req.includes(x) && !out.has(d)) { out.add(d); walk(d) } })
  walk(i)
  return out
}

describe("LIFO revert (BEH-BR-043, INV-BR-005)", () => {
  it("removing a provider closes each dependent once, before it", async () => {
    await assertProperty(fc.asyncProperty(graph, fc.nat(), async (g, pick) => {
      const target = pick % g.length
      const j = journal()
      const lines = await onTestHost((t) => Effect.gen(function* () {
        for (let i = 0; i < g.length; i++) yield* t.install(graphPlugin(i, g[i]!, j), as())
        yield* idle(t)
        j.lines.length = 0
        yield* drive(t, t.remove(`g${target}`, as()))
        yield* idle(t)
        return [...j.lines]
      }))
      const closing = new Set([target, ...dependentsOf(g, target)])
      expect([...lines].sort()).toEqual([...closing].map((i) => `close:${i}`).sort())      // each exactly once, nothing else
      for (const d of closing) for (const p of g[d]!) if (closing.has(p)) expect(lines.indexOf(`close:${d}`)).toBeLessThan(lines.indexOf(`close:${p}`))
    }), 40)
  }, 120_000)
})

// ---------------------------------------------------------------- drain bound
describe("drain bound (INV-BR-017)", () => {
  it("a removal blocked by a lease fails with DrainTimeout when the limit passes, not before", async () => {
    await assertProperty(fc.asyncProperty(fc.integer({ min: 2, max: 400 }), async (limit) => {
      const exit = await onTestHost((t) => Effect.gen(function* () {
        yield* t.install(loggerPlugin(journal()), as()); yield* idle(t)
        const entered = yield* Deferred.make<void>()
        const holder = yield* Effect.forkChild(t.use(Logger, () => Deferred.succeed(entered, undefined).pipe(Effect.andThen(Effect.never))))
        yield* Deferred.await(entered)
        const removal = yield* Effect.forkChild(Effect.exit(t.remove("example/logger", { ...as(), drain: limit })))
        const settle = Effect.gen(function* () { for (let i = 0; i < 60; i++) yield* Effect.yieldNow })
        yield* settle
        yield* t.step                                                    // the stop begins and starts its drain, a wait on the clock
        yield* TestClock.adjust(limit - 1)
        yield* settle
        const early = removal.pollUnsafe()
        yield* TestClock.adjust(1)
        yield* settle
        // Bounded: a removal that does not end is an assertion failure, not a hung test.
        for (let i = 0; i < 50 && removal.pollUnsafe() === undefined; i++) if (!(yield* t.step)) yield* Effect.yieldNow
        const late = removal.pollUnsafe() === undefined ? undefined : yield* Fiber.join(removal)
        yield* Fiber.interrupt(holder)                                   // the scope's own shutdown would wait on it under a frozen clock
        return { early, late }
      }))
      expect(exit.early).toBeUndefined()
      expect(exit.late !== undefined && Exit.isFailure(exit.late) && JSON.stringify(exit.late.cause)).toContain("DrainTimeout")
    }), 30)
  }, 120_000)
})

// ---------------------------------------------------------------- audit chain
const opAlphabet = fc.array(fc.record({ kind: fc.constantFrom("install", "remove", "disable", "enable", "restart"), at: fc.nat({ max: 3 }) }), { maxLength: 14 })
const chainPlugins = ["a", "b", "c", "d"].map((id) => define({ id, requires: [] as const, provides: [] as const, build: Layer.empty }) as unknown as AnyPlugin)

describe("audit chain (INV-BR-022, INV-BR-023)", () => {
  it("any history leaves a gapless sequence and one terminal record per requested", async () => {
    await assertProperty(fc.asyncProperty(opAlphabet, async (history) => {
      const records: Array<AuditRecord> = []
      const sink = Effect.runSync(Testing.memoryAuditSink({ behave: (_n, r) => { records.push(r); return "store" } })).sink
      await onTestHost((t) => Effect.gen(function* () {
        for (const o of history) {
          const p = chainPlugins[o.at]!
          const call = o.kind === "install" ? t.install(p, as()) : t[o.kind](p.id, as())
          yield* Effect.exit(drive(t, call as Effect.Effect<unknown, unknown>))
        }
        yield* idle(t)
        yield* TestClock.adjust(100)
        for (let i = 0; i < 50; i++) yield* Effect.yieldNow
      }), Layer.succeed(AuditSink, sink))
      if (history.length > 0) expect(records.length).toBeGreaterThan(0)                 // the sink was the one the host used
      expect(inv023(records)).toBe(true)                                              // 1, 2, 3, ... in write order
      expect(verifyAuditSequence(records)).toEqual({ gaps: [], duplicates: [], outOfOrder: [] })   // and the host's own verifier agrees
      expect(inv022(records)).toBe(true)                                              // one requested and one terminal per call, once idle
    }), 30)
  }, 120_000)
})

// ---------------------------------------------------------------- reconcile idempotence
const subset = fc.subarray([0, 1, 2, 3], { minLength: 0 })
describe("reconcile idempotence (BEH-BR-159, INV-BR-021)", () => {
  it("reconciling the same list twice issues nothing the second time", async () => {
    await assertProperty(fc.asyncProperty(subset, subset, async (first, second) => {
      const list = (ix: ReadonlyArray<number>): Array<DesiredPlugin> => ix.map((i) => ({ id: chainPlugins[i]!.id, plugin: chainPlugins[i]! }))
      const report = await onTestHost((t) => Effect.gen(function* () {
        yield* drive(t, t.reconcile(list(first), as("one")))
        yield* idle(t)
        yield* drive(t, t.reconcile(list(second), as("two")))
        yield* idle(t)
        return yield* drive(t, t.reconcile(list(second), as("two")))
      }))
      expect(report).toMatchObject({ installed: [], removed: [], disabled: [], enabled: [], replaced: [], reconfigured: [], rejected: [] })
      expect(report.unchanged.length).toBe(second.length)
    }), 40)
  }, 120_000)
})
