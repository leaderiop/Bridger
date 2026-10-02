// The desired list of `reconcile` and `Desired.overlay` (references/core BEH-BR-153). Pure: no I/O, no host.
import type { AnyPlugin } from "./plugin.js"

export interface DesiredPlugin {
  readonly id: string                    // must equal plugin.id
  readonly plugin: AnyPlugin
  readonly config?: unknown              // the override the plugin should hold; absent = no override
  readonly disabled?: boolean
  readonly realm?: string
}

const isPlain = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x) && Object.getPrototypeOf(x) === Object.prototype

/** Plain objects merge key by key, recursively; anything else in the later value replaces the earlier. */
export const deepMerge = (a: unknown, b: unknown): unknown => {
  if (!isPlain(a) || !isPlain(b)) return b
  const out: Record<string, unknown> = { ...a }
  for (const [k, v] of Object.entries(b)) out[k] = k in a ? deepMerge(a[k], v) : v
  return out
}

/** Structural equality of raw override values (BEH-BR-154). */
export const deepEqual = (a: unknown, b: unknown): boolean => {
  if (Object.is(a, b)) return true
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]))
  if (isPlain(a) && isPlain(b)) {
    const ka = Object.keys(a), kb = Object.keys(b)
    return ka.length === kb.length && ka.every((k) => k in b && deepEqual(a[k], b[k]))
  }
  return false
}

const keyOf = (e: { readonly id: string; readonly realm?: string }) => `${e.realm ?? "default"}\u0000${e.id}`

export const Desired = {
  /** Patches in array order, matched by (id, realm); `config` merged deeply; base order kept (BEH-BR-153). */
  overlay: (base: ReadonlyArray<DesiredPlugin>, patch: ReadonlyArray<Partial<DesiredPlugin> & { readonly id: string }>): ReadonlyArray<DesiredPlugin> => {
    const out: Array<DesiredPlugin> = base.map((e) => ({ ...e }))
    for (const p of patch) {
      const i = out.findIndex((e) => keyOf(e) === keyOf(p))
      if (i < 0) {
        if (p.plugin) out.push({ ...p } as DesiredPlugin)   // appended in patch order; without a plugin it is dropped
        continue
      }
      const merged: Record<string, unknown> = { ...out[i]! }
      for (const [k, v] of Object.entries(p)) merged[k] = k === "config" && "config" in merged ? deepMerge(merged.config, v) : v
      out[i] = merged as unknown as DesiredPlugin
    }
    return out
  }
}
