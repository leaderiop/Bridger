// Budget kernel (entitlement BEH-EN-017..020; improvement report 06 S16): reservations against label-subset limits, with the application deciding what an
// unmatched key does and which labels are essential, and a per-plugin view whose labels the host derives. Prototype: one process, no periods (a limit never
// resets here; BEH-EN-021 periods and the BudgetLedger port are not implemented).
import { Effect } from "effect"

export interface BudgetKey { readonly labels: Readonly<Record<string, string>>; readonly unit: string }
export interface BudgetLimit { readonly match: Readonly<Record<string, string>>; readonly unit: string; readonly amount: number }
export class BudgetExhausted extends Error {
  readonly _tag = "BudgetExhausted"
  constructor(readonly match: Readonly<Record<string, string>>, readonly unit: string, readonly requested: number, readonly remaining: number) { super(`budget exhausted: ${unit}`) }
}
export interface BudgetOptions {
  /** What a key to which no limit applies does. No default: "unlimited" is the old behaviour and a choice, "refuse" fails closed (BEH-EN-017). */
  readonly onUnmatched: "refuse" | "unlimited"
  /** The labels the application treats as essential (BEH-EN-007); a call site's `essential` is honoured only for these. */
  readonly essentialLabels?: ReadonlyArray<string>
}
const applies = (l: BudgetLimit, k: BudgetKey) => l.unit === k.unit && Object.entries(l.match).every(([a, b]) => k.labels[a] === b)

export const makeBudget = (limits: ReadonlyArray<BudgetLimit>, o: BudgetOptions) => {
  const used = limits.map(() => 0), overdraft = new Map<number, number>()
  const reserve = (key: BudgetKey, amount: number, options: { readonly essential?: ReadonlyArray<string> } = {}): Effect.Effect<{ readonly amount: number }, BudgetExhausted> => Effect.suspend(() => {
    if (!Number.isFinite(amount) || amount < 0) return Effect.die(new Error("amount must be a finite number >= 0"))
    const hit = limits.flatMap((l, i) => applies(l, key) ? [i] : [])
    if (hit.length === 0) return o.onUnmatched === "refuse" ? Effect.fail(new BudgetExhausted({}, key.unit, amount, 0)) : Effect.succeed({ amount })
    const essential = (options.essential ?? []).some((e) => (o.essentialLabels ?? []).includes(e))      // the application's list decides, never the call site
    const bad = hit.find((i) => limits[i]!.amount - used[i]! < amount)
    if (bad !== undefined && !essential) return Effect.fail(new BudgetExhausted(limits[bad]!.match, key.unit, amount, limits[bad]!.amount - used[bad]!))
    for (const i of hit) {
      const room = Math.max(0, limits[i]!.amount - used[i]!), take = Math.min(room, amount)
      used[i]! += take
      if (take < amount) overdraft.set(i, (overdraft.get(i) ?? 0) + amount - take)                      // an essential overdraft, counted, never debited below zero
    }
    return Effect.succeed({ amount })
  })
  const remaining = (key: BudgetKey) => limits.flatMap((l, i) => applies(l, key) ? [{ match: l.match, unit: l.unit, remaining: l.amount - used[i]!, essentialOverdraft: overdraft.get(i) ?? 0 }] : [])
  /** A view for one plugin: `labels` the host derived from its principal override anything the plugin passes, so a plugin can add labels and never take one away or replace one. */
  const forPlugin = (host: Readonly<Record<string, string>>) => ({
    reserve: (key: BudgetKey, amount: number, options?: { readonly essential?: ReadonlyArray<string> }) => reserve({ unit: key.unit, labels: { ...key.labels, ...host } }, amount, options),
    remaining: (key: BudgetKey) => remaining({ unit: key.unit, labels: { ...key.labels, ...host } })
  })
  return { reserve, remaining, forPlugin }
}
