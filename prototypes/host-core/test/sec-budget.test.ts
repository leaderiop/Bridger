// Report 06 S16: an unmatched key is the application's decision, `essential` comes from the application's list, and a plugin's labels cannot shed its own.
import { Effect } from "effect"
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
})
