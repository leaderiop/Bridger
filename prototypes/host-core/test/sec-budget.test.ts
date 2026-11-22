// Report 06 S16: an unmatched key is the application's decision, `essential` comes from the application's list, and a plugin's labels cannot shed its own.
import { Effect } from "effect"
import { TestClock } from "effect/testing"
import { describe, expect, it } from "vitest"
import { makeBudget, type BudgetLimit } from "../src/budget.js"

const limits: BudgetLimit[] = [{ match: { org: "o1" }, unit: "tokens", amount: 100 }, { match: { org: "o1", plugin: "p" }, unit: "tokens", amount: 10 }]
const key = (labels: Record<string, string>) => ({ labels, unit: "tokens" })
const run = <A, E>(e: Effect.Effect<A, E>) => Effect.runPromise(Effect.exit(e))

describe("budget (BEH-EN-017, BEH-EN-018, BEH-EN-020)", () => {
  it("onUnmatched decides a key no limit covers: refuse fails closed, unlimited reserves", async () => {
    expect(JSON.stringify(await run(makeBudget(limits, { onUnmatched: "refuse" }).reserve(key({ org: "other" }), 1)))).toContain("BudgetExhausted")
    expect((await run(makeBudget(limits, { onUnmatched: "unlimited" }).reserve(key({ org: "other" }), 1)))._tag).toBe("Success")
  })
  it("a call site's `essential` counts only for labels the application listed; an essential use succeeds and is counted as an overdraft", async () => {
    const b = makeBudget(limits, { onUnmatched: "refuse", essentialLabels: ["safety"] })
    expect(JSON.stringify(await run(b.reserve(key({ org: "o1", plugin: "p" }), 50, { essential: ["safety-ish"] })))).toContain("BudgetExhausted")   // self-declared, not listed
    expect((await run(b.reserve(key({ org: "o1", plugin: "p" }), 50, { essential: ["safety"] })))._tag).toBe("Success")
    expect(b.remaining(key({ org: "o1", plugin: "p" })).find((r) => r.match.plugin === "p")).toMatchObject({ remaining: 0, essentialOverdraft: 40 })
  })
  it("the plugin view puts the host's labels over the plugin's: another org's labels or a missing plugin label cannot escape the plugin's limit", async () => {
    const b = makeBudget(limits, { onUnmatched: "refuse" })
    const view = b.forPlugin({ org: "o1", plugin: "p" })
    expect((await run(view.reserve(key({}), 8)))._tag).toBe("Success")
    expect(JSON.stringify(await run(view.reserve(key({ org: "o2", plugin: "q" }), 8)))).toContain("BudgetExhausted")     // still o1/p: only 2 left
    expect(view.remaining(key({ plugin: "other" })).find((r) => r.match.plugin === "p")?.remaining).toBe(2)
  })
  it("a non-finite or negative amount is a defect", async () => {
    expect((await run(makeBudget(limits, { onUnmatched: "refuse" }).reserve(key({ org: "o1" }), Number.NaN)))._tag).toBe("Failure")
  })
  it("periods count from the anchor, so a restart (a new Budget with the same anchor) lands in the same period; a new period resets", async () => {
    const lim: BudgetLimit[] = [{ match: { org: "o1" }, unit: "tokens", amount: 10, period: 1000 }]
    expect(() => makeBudget(lim, { onUnmatched: "refuse" })).toThrow(/anchor/)
    await Effect.runPromise(Effect.gen(function* () {
      yield* TestClock.adjust(2500)                                                                // now = 2500; anchor 0: period 2
      const b = makeBudget(lim, { onUnmatched: "refuse", anchor: 0 })
      expect((yield* Effect.exit(b.reserve(key({ org: "o1" }), 10)))._tag).toBe("Success")
      expect((yield* Effect.exit(b.reserve(key({ org: "o1" }), 1)))._tag).toBe("Failure")
      yield* TestClock.adjust(499); expect((yield* Effect.exit(b.reserve(key({ org: "o1" }), 1)))._tag).toBe("Failure")   // still period 2
      yield* TestClock.adjust(1); expect((yield* Effect.exit(b.reserve(key({ org: "o1" }), 10)))._tag).toBe("Success")     // period 3 begins at 3000
    }).pipe(Effect.provide(TestClock.layer())))
  })
  it("a ledger sees the period index; with onLedgerUnavailable local the reservation is unreconciled and replayed by id before the next one; refuse fails", async () => {
    const lim: BudgetLimit[] = [{ match: { org: "o1" }, unit: "tokens", amount: 100, period: 1000 }]
    const seen: Array<{ id: string; period: number }> = []; let up = false
    const ledger = { reserve: (r: { id: string; period: number }) => up ? Effect.sync(() => { seen.push({ id: r.id, period: r.period }) }) : Effect.fail(new Error("down")) }
    await Effect.runPromise(Effect.gen(function* () {
      yield* TestClock.adjust(1500)
      const b = makeBudget(lim, { onUnmatched: "refuse", anchor: 0, ledger: ledger as never, onLedgerUnavailable: "local" })
      expect((yield* Effect.exit(b.reserve(key({ org: "o1" }), 1)))._tag).toBe("Success"); expect(b.usage().unreconciled).toBe(1)
      up = true
      yield* b.reserve(key({ org: "o1" }), 1)
      expect(b.usage().unreconciled).toBe(0); expect(seen.map((s) => s.id)).toEqual(["r-1", "r-2"]); expect(seen.every((s) => s.period === 1)).toBe(true)
      up = false
      const strict = makeBudget(lim, { onUnmatched: "refuse", anchor: 0, ledger: ledger as never, onLedgerUnavailable: "refuse" })
      expect((yield* Effect.exit(strict.reserve(key({ org: "o1" }), 1)))._tag).toBe("Failure")
    }).pipe(Effect.provide(TestClock.layer())))
    expect(() => makeBudget(lim, { onUnmatched: "refuse", anchor: 0, ledger: ledger as never })).toThrow(/onLedgerUnavailable/)
  })
})
