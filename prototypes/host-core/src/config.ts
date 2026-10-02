// Plugin.Config (references/core behaviour 11).
import { Context, Equal, type Effect, type Stream } from "effect"

export class PluginConfig extends Context.Service<PluginConfig, {
  /** Decoded at the start of the activation; never changes during it (BEH-BR-100). */
  readonly value: unknown
  /** The latest decoded value; differs from `value` only in volatile fields. */
  readonly current: Effect.Effect<unknown>
  /** Current value first, then every change, latest-wins. */
  readonly changes: Stream.Stream<unknown>
}>()("@bridger/core/Plugin.Config") {}

/** Top-level fields whose decoded values differ (BEH-BR-102: `Equal.equals`; erring toward "changed"). */
export const changedPaths = (a: unknown, b: unknown): Array<string> => {
  const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null
  // An absent side (no override, no value) differs in every field the other side has.
  if (!isObj(a) && isObj(b) && a === undefined) return Object.keys(b).sort()
  if (isObj(a) && !isObj(b) && b === undefined) return Object.keys(a).sort()
  if (!isObj(a) || !isObj(b)) return Equal.equals(a, b) ? [] : ["<root>"]
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  return [...keys].filter((k) => {
    try { return !Equal.equals((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]) } catch { return true }
  }).sort()
}
