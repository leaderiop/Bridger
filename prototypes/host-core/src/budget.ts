// Budget kernel (entitlement BEH-EN-017..020; improvement report 06 S16): reservations against label-subset limits, with the application deciding what an
// unmatched key does and which labels are essential, and a per-plugin view whose labels the host derives. Prototype: one process (a limit without a period never
// reserves are counted as committed; BEH-EN-021 periods and the BudgetLedger (BEH-EN-022) are implemented in the minimal form below).
import { Clock, Effect } from "effect"

export interface BudgetKey { readonly labels: Readonly<Record<string, string>>; readonly unit: string }
export interface BudgetLimit { readonly match: Readonly<Record<string, string>>; readonly unit: string; readonly amount: number; readonly period?: number }   // period: ms, counted from `anchor`
export class BudgetExhausted extends Error {
  readonly _tag = "BudgetExhausted"
  constructor(readonly match: Readonly<Record<string, string>>, readonly unit: string, readonly requested: number, readonly remaining: number) { super(`budget exhausted: ${unit}`) }
}
export interface BudgetOptions {
  /** What a key to which no limit applies does. No default: "unlimited" is the old behaviour and a choice, "refuse" fails closed (BEH-EN-017). */
  readonly onUnmatched: "refuse" | "unlimited"
  /** The labels the application treats as essential (BEH-EN-007); a call site's `essential` is honoured only for these. */
  readonly essentialLabels?: ReadonlyArray<string>
  /** BEH-EN-021: the absolute instant (ms) periods count from; required when a limit has a period, so a restart cannot move a boundary. */
  readonly anchor?: number
  /** BEH-EN-022: a shared ledger; `onLedgerUnavailable` is then required. */
  readonly ledger?: {
    readonly reserve: (r: { id: string; key: BudgetKey; amount: number; essential: boolean; period: number }) => Effect.Effect<void, BudgetExhausted | Error>
  }
  readonly onLedgerUnavailable?: "refuse" | "local"
}
const applies = (l: BudgetLimit, k: BudgetKey) => l.unit === k.unit && Object.entries(l.match).every(([a, b]) => k.labels[a] === b)

export const makeBudget = (limits: ReadonlyArray<BudgetLimit>, o: BudgetOptions) => {
  if (limits.some((l) => l.period !== undefined) && o.anchor === undefined) throw new Error("BudgetOptions.anchor is required when a limit has a period")
  if (o.ledger && o.onLedgerUnavailable === undefined) throw new Error("onLedgerUnavailable must be stated when a ledger is wired")
  const used = limits.map(() => 0), periodOf = limits.map(() => 0), overdraft = new Map<number, number>()
  const unreconciled: Array<{ id: string; key: BudgetKey; amount: number; essential: boolean; period: number }> = []
  let seq = 0
  const roll = (now: number) => limits.forEach((l, i) => {
    const idx = l.period ? Math.floor((now - o.anchor!) / l.period) : 0
    if (idx !== periodOf[i]) { periodOf[i] = idx; used[i] = 0; overdraft.delete(i) }              // a new period resets the committed amount
  })
  const reserve = (key: BudgetKey, amount: number, options: { readonly essential?: ReadonlyArray<string> } = {}): Effect.Effect<{ readonly amount: number }, BudgetExhausted> => Effect.gen(function* () {
    if (!Number.isFinite(amount) || amount < 0) return yield* Effect.die(new Error("amount must be a finite number >= 0"))
    const now = yield* Clock.currentTimeMillis
    roll(now)
    const hit = limits.flatMap((l, i) => applies(l, key) ? [i] : [])
    if (hit.length === 0) return yield* (o.onUnmatched === "refuse" ? Effect.fail(new BudgetExhausted({}, key.unit, amount, 0)) : Effect.succeed({ amount }))
    const essential = (options.essential ?? []).some((e) => (o.essentialLabels ?? []).includes(e))      // the application's list decides, never the call site
    const bad = hit.find((i) => limits[i]!.amount - used[i]! < amount)
    if (bad !== undefined && !essential) return yield* Effect.fail(new BudgetExhausted(limits[bad]!.match, key.unit, amount, limits[bad]!.amount - used[bad]!))
    if (o.ledger) {
      const period = Math.max(...hit.map((i) => periodOf[i]!))
      for (const r of [...unreconciled]) {                                                          // replay local reservations by id before a new one (the ledger is idempotent by id)
        const ok = yield* Effect.exit(o.ledger.reserve(r))
        if (ok._tag === "Success") unreconciled.splice(unreconciled.indexOf(r), 1)
      }
      const r = { id: `r-${++seq}`, key, amount, essential, period }
      const out = yield* Effect.exit(o.ledger.reserve(r))
      if (out._tag === "Failure") {
        const err = out.cause.reasons.find((x) => x._tag === "Fail") as { error: unknown } | undefined
        if (err?.error instanceof BudgetExhausted && !essential) return yield* Effect.fail(err.error)
        if (!(err?.error instanceof BudgetExhausted)) {
          if (o.onLedgerUnavailable === "refuse" && !essential) return yield* Effect.fail(new BudgetExhausted(limits[hit[0]!]!.match, key.unit, amount, 0))
          unreconciled.push(r)                                                                    // "local": account here, reconcile later
        }
      }
    }
    for (const i of hit) {
      const room = Math.max(0, limits[i]!.amount - used[i]!), take = Math.min(room, amount)
      used[i]! += take
      if (take < amount) overdraft.set(i, (overdraft.get(i) ?? 0) + amount - take)                      // an essential overdraft, counted, never debited below zero
    }
    return { amount }
  })
  const remaining = (key: BudgetKey) => limits.flatMap((l, i) => applies(l, key) ? [{ match: l.match, unit: l.unit, remaining: l.amount - used[i]!, essentialOverdraft: overdraft.get(i) ?? 0 }] : [])
  const usage = () => ({ unreconciled: unreconciled.length })
  /** A view for one plugin: `labels` the host derived from its principal override anything the plugin passes, so a plugin can add labels and never take one away or replace one. */
  const forPlugin = (host: Readonly<Record<string, string>>) => ({
    reserve: (key: BudgetKey, amount: number, options?: { readonly essential?: ReadonlyArray<string> }) => reserve({ unit: key.unit, labels: { ...key.labels, ...host } }, amount, options),
    remaining: (key: BudgetKey) => remaining({ unit: key.unit, labels: { ...key.labels, ...host } })
  })
  return { reserve, remaining, forPlugin, usage }
}
