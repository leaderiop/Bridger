// Manifests, consentDiff and Plugin.lazy (references/core behaviour 27, BEH-BR-241–244). Prototype.
// The schema check is hand-written (structural, path-naming, value-free) rather than an Effect Schema.
import { Context, Duration, Effect, Layer, Option } from "effect"
import { CONTRACT, parseRange, satisfies } from "./contract.js"
import type { AnyPlugin } from "./plugin.js"

export const BRIDGER_VERSION = "0.3.0"     // `Bridger.version` of this prototype (BEH-BR-242)

export type LazyTrigger =
  | { readonly _tag: "OnService"; readonly serviceId: string }
  | { readonly _tag: "OnContribution"; readonly registry: string; readonly id: string }
  | { readonly _tag: "OnEvent"; readonly eventId: string }
export interface ProvidedRef { readonly serviceId: string; readonly version?: string; readonly methods?: ReadonlyArray<string> }
export interface RequiredRef { readonly serviceId: string; readonly range?: string; readonly version?: string; readonly methods?: ReadonlyArray<string> }
export interface PluginManifest {
  readonly manifestVersion: 1
  readonly id: string
  readonly version: string
  readonly digest?: string
  readonly provides: ReadonlyArray<ProvidedRef>
  readonly requires: ReadonlyArray<RequiredRef>
  readonly optional?: ReadonlyArray<RequiredRef>
  readonly engines?: Readonly<Record<string, string>>
  readonly activation?: ReadonlyArray<LazyTrigger>
  readonly contributions?: ReadonlyArray<{ readonly registry: string; readonly id: string; readonly role?: "veto" | "enrich" | "advisory"; readonly target?: unknown }>
  readonly listens?: ReadonlyArray<string>
  readonly description?: string
  readonly publisher?: string
  readonly tier?: string
  readonly requested?: {
    readonly capabilities?: ReadonlyArray<{ readonly serviceId: string; readonly methods?: ReadonlyArray<string> }>
    readonly permissions?: ReadonlyArray<string>
    readonly egress?: ReadonlyArray<{ readonly host: string; readonly purpose?: string }>
  }
  readonly residency?: string
  readonly config?: { readonly schema: unknown; readonly volatile?: ReadonlyArray<string> }
  readonly extensions?: Readonly<Record<string, unknown>>
  readonly [extra: string]: unknown
}

const isObj = (u: unknown): u is Record<string, unknown> => typeof u === "object" && u !== null && !Array.isArray(u)
const isStr = (u: unknown): u is string => typeof u === "string"
const strArr = (u: unknown) => Array.isArray(u) && u.every(isStr)

/** The decode of BEH-BR-241: a path naming the first problem, never a value; undefined when it decodes. */
export const decodeProblem = (m: unknown): string | undefined => {
  if (!isObj(m)) return "manifest: <root> is not an object"
  if (m.manifestVersion !== 1) return "manifest: manifestVersion"
  if (!isStr(m.id)) return "manifest: id"
  if (!isStr(m.version)) return "manifest: version"
  if (m.digest !== undefined && !isStr(m.digest)) return "manifest: digest"
  const refs = (field: "provides" | "requires" | "optional", required: boolean): string | undefined => {
    const v = m[field]
    if (v === undefined && !required) return undefined
    if (!Array.isArray(v)) return `manifest: ${field}`
    for (let i = 0; i < v.length; i++) {
      const r = v[i]
      if (!isObj(r) || !isStr(r.serviceId)) return `manifest: ${field}[${i}].serviceId`
      if (r.version !== undefined && !isStr(r.version)) return `manifest: ${field}[${i}].version`
      if (r.methods !== undefined && !strArr(r.methods)) return `manifest: ${field}[${i}].methods`
      if (field !== "provides" && r.range !== undefined && !isStr(r.range)) return `manifest: ${field}[${i}].range`
      if (r.version !== undefined && r.methods === undefined) return `manifest: ${field}[${i}].methods (version without methods)`
      if (r.version === undefined && r.methods !== undefined) return `manifest: ${field}[${i}].methods (methods on a plain key)`
    }
    return undefined
  }
  const bad = refs("provides", true) ?? refs("requires", true) ?? refs("optional", false)
  if (bad) return bad
  if (m.engines !== undefined && (!isObj(m.engines) || !Object.values(m.engines).every(isStr))) return "manifest: engines"
  if (m.activation !== undefined) {
    if (!Array.isArray(m.activation)) return "manifest: activation"
    for (let i = 0; i < m.activation.length; i++) {
      const t = m.activation[i]
      const ok = isObj(t) && ((t._tag === "OnService" && isStr(t.serviceId)) || (t._tag === "OnContribution" && isStr(t.registry) && isStr(t.id)) || (t._tag === "OnEvent" && isStr(t.eventId)))
      if (!ok) return `manifest: activation[${i}]`
    }
  }
  if (m.contributions !== undefined) {
    if (!Array.isArray(m.contributions)) return "manifest: contributions"
    for (let i = 0; i < m.contributions.length; i++) {
      const c = m.contributions[i]
      if (!isObj(c) || !isStr(c.registry) || !isStr(c.id)) return `manifest: contributions[${i}]`
      if (c.role !== undefined && c.role !== "veto" && c.role !== "enrich" && c.role !== "advisory") return `manifest: contributions[${i}].role`
    }
  }
  if (m.listens !== undefined && !strArr(m.listens)) return "manifest: listens"
  for (const f of ["description", "publisher", "tier", "residency"]) if (m[f] !== undefined && !isStr(m[f])) return `manifest: ${f}`
  if (m.extensions !== undefined && !isObj(m.extensions)) return "manifest: extensions"
  return undefined
}

/** Engines (BEH-BR-242): undefined, or the range problem ("invalid") or the unsatisfied range. */
export const engineProblem = (m: PluginManifest): { readonly kind: "invalid" | "unsatisfied"; readonly range: string } | undefined => {
  const range = m.engines?.["@bridger/core"]
  if (range === undefined) return undefined
  if (!parseRange(range)) return { kind: "invalid", range }
  return satisfies(BRIDGER_VERSION, range) ? undefined : { kind: "unsatisfied", range }
}

const sid = (k: Context.Key<any, any>) => (k as unknown as { key: string }).key
const refOf = (k: Context.Key<any, any>): { serviceId: string; version?: string; range?: string; methods?: ReadonlyArray<string> } => {
  const kind = (k as any)[CONTRACT] as string | undefined
  if (kind === "contract") return { serviceId: sid(k), version: (k as any).version, methods: (k as any).descriptor.methods }
  if (kind === "requirement") return { serviceId: sid(k), range: (k as any).range, version: (k as any).contract.version, methods: (k as any).contract.descriptor.methods }
  if (kind === "provision") return { serviceId: sid(k), version: (k as any).version, methods: (k as any).methods }
  return { serviceId: sid(k) }
}
/** The first field where a definition disagrees with a manifest (BEH-BR-242, 246), or undefined. */
export const disagreement = (def: AnyPlugin, m: PluginManifest, digest: "manifest" | { readonly expected?: string }): string | undefined => {
  if (def.id !== m.id) return "id"
  if (def.meta?.version !== m.version) return "version"
  if (digest === "manifest") { if (m.digest !== undefined && def.meta?.digest !== m.digest) return "digest" }
  else if (def.meta?.digest !== digest.expected) return "digest"
  const same = (field: "provides" | "requires" | "optional", keys: ReadonlyArray<Context.Key<any, any>>, refs: ReadonlyArray<RequiredRef> = []) => {
    const a = keys.map(refOf).sort((x, y) => x.serviceId < y.serviceId ? -1 : 1), b = [...refs].sort((x, y) => x.serviceId < y.serviceId ? -1 : 1)
    if (a.length !== b.length || a.some((x, i) => x.serviceId !== b[i]!.serviceId)) return field
    for (let i = 0; i < a.length; i++) {
      const x = a[i]!, y = b[i]!
      const cmpRange = field !== "provides" ? (x.range ?? (x.version ? "^" + x.version : undefined)) !== (y.range ?? (y.version ? "^" + y.version : undefined)) : false
      if (x.version !== y.version || cmpRange || JSON.stringify([...(x.methods ?? [])].sort()) !== JSON.stringify([...(y.methods ?? [])].sort())) return field
    }
    return undefined
  }
  return same("provides", def.provides, m.provides) ?? same("requires", def.requires, m.requires) ?? same("optional", def.optional ?? [], m.optional)
}

// ---------------------------------------------------------------- consentDiff (BEH-BR-243)
export interface ConsentChange { readonly path: string; readonly added?: ReadonlyArray<string>; readonly removed?: ReadonlyArray<string>; readonly from?: string; readonly to?: string }
export interface ConsentDiff {
  readonly widened: ReadonlyArray<ConsentChange>
  readonly narrowed: ReadonlyArray<ConsentChange>
  readonly relabelled: ReadonlyArray<ConsentChange>
  readonly unclassified: ReadonlyArray<ConsentChange>
  readonly requiresConsent: boolean
}
const cu = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0
const canon = (u: unknown): string => JSON.stringify(u, (_k, v) => isObj(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => cu(a, b))) : v)
export const consentDiff = (previous: PluginManifest | undefined, next: PluginManifest): ConsentDiff => {
  const widened: Array<ConsentChange> = [], narrowed: Array<ConsentChange> = [], relabelled: Array<ConsentChange> = [], unclassified: Array<ConsentChange> = []
  const setDiff = (path: string, a: ReadonlyArray<string>, b: ReadonlyArray<string>) => {
    const added = [...new Set(b.filter((x) => !a.includes(x)))].sort(cu), removed = [...new Set(a.filter((x) => !b.includes(x)))].sort(cu)
    if (added.length) widened.push({ path, added })
    if (removed.length) narrowed.push({ path, removed })
  }
  const p = previous
  // requested.capabilities: ServiceIds, then per-ServiceId methods.
  const capsA = p?.requested?.capabilities ?? [], capsB = next.requested?.capabilities ?? []
  setDiff("requested.capabilities", capsA.map((c) => c.serviceId), capsB.map((c) => c.serviceId))
  for (const b of capsB) {
    const a = capsA.find((x) => x.serviceId === b.serviceId)
    if (!a) continue
    const path = `requested.capabilities[${b.serviceId}].methods`
    if (a.methods && !b.methods) widened.push({ path, removed: [], from: "list", to: "all" })
    else if (!a.methods && b.methods) narrowed.push({ path, from: "all", to: "list" })
    else if (a.methods && b.methods) setDiff(path, a.methods, b.methods)
  }
  setDiff("requested.permissions", p?.requested?.permissions ?? [], next.requested?.permissions ?? [])
  const egA = p?.requested?.egress ?? [], egB = next.requested?.egress ?? []
  setDiff("requested.egress", egA.map((e) => e.host), egB.map((e) => e.host))
  // A purpose change on an unchanged host is a difference the table does not classify (finding G-P6).
  for (const b of egB) { const a = egA.find((x) => x.host === b.host); if (a && a.purpose !== b.purpose) unclassified.push({ path: `requested.egress[${b.host}].purpose`, ...(a.purpose !== undefined ? { from: a.purpose } : {}), ...(b.purpose !== undefined ? { to: b.purpose } : {}) }) }
  setDiff("requires", (p?.requires ?? []).map((r) => r.serviceId), next.requires.map((r) => r.serviceId))
  setDiff("optional", (p?.optional ?? []).map((r) => r.serviceId), (next.optional ?? []).map((r) => r.serviceId))
  for (const f of ["publisher", "tier", "residency"] as const) {
    const a = p?.[f], b = next[f]
    if (a !== b) relabelled.push({ path: f, ...(a !== undefined ? { from: a } : {}), ...(b !== undefined ? { to: b } : {}) })
  }
  if (p) {
    const skip = new Set(["version", "digest", "description", "manifestVersion", "requested", "requires", "optional", "publisher", "tier", "residency"])
    const keys = [...new Set([...Object.keys(p), ...Object.keys(next)])].filter((k) => !skip.has(k)).sort(cu)
    for (const k of keys) if (canon(p[k]) !== canon(next[k])) unclassified.push({ path: k })
    // Fields of `requested` the table does not name.
    const rk = [...new Set([...Object.keys(p.requested ?? {}), ...Object.keys(next.requested ?? {})])].filter((k) => !["capabilities", "permissions", "egress"].includes(k)).sort(cu)
    for (const k of rk) if (canon((p.requested as any)?.[k]) !== canon((next.requested as any)?.[k])) unclassified.push({ path: `requested.${k}` })
  }
  const byPath = (a: ConsentChange, b: ConsentChange) => cu(a.path, b.path)
  return {
    widened: widened.sort(byPath), narrowed: narrowed.sort(byPath), relabelled: relabelled.sort(byPath), unclassified: unclassified.sort(byPath),
    requiresConsent: widened.length + relabelled.length + unclassified.length > 0
  }
}

// ---------------------------------------------------------------- Plugin.lazy (BEH-BR-244)
export interface LazyPluginDefinition {
  readonly _tag: "LazyPlugin"
  readonly id: string
  readonly manifest: PluginManifest
  readonly meta: { readonly version: string; readonly digest?: string; readonly description?: string }
  readonly load: Effect.Effect<AnyPlugin, unknown>
  readonly idle?: Duration.Input
  readonly holdTimeout: Duration.Input
  readonly digestConflict?: true
}
export const lazy = (options: { readonly manifest: PluginManifest; readonly load: Effect.Effect<AnyPlugin, unknown>; readonly digest?: string; readonly idle?: Duration.Input; readonly holdTimeout?: Duration.Input }): LazyPluginDefinition => {
  const m = options.manifest
  const digest = options.digest ?? (isObj(m) ? m.digest : undefined)
  return {
    _tag: "LazyPlugin", id: isObj(m) ? m.id : (undefined as never), manifest: m, load: options.load,
    meta: { version: isObj(m) ? m.version : (undefined as never), ...(digest !== undefined ? { digest } : {}) },
    ...(options.idle !== undefined ? { idle: options.idle } : {}), holdTimeout: options.holdTimeout ?? "60 seconds",
    ...(options.digest !== undefined && isObj(m) && m.digest !== undefined && m.digest !== options.digest ? { digestConflict: true as const } : {})
  }
}
export const isLazy = (d: unknown): d is LazyPluginDefinition => (d as { _tag?: unknown } | null)?._tag === "LazyPlugin"

/** A key standing for a manifest reference: a ServiceId, and contract data when the reference has a version. */
const pseudoKey = (r: RequiredRef, position: "provides" | "requires"): Context.Key<any, any> => {
  const plain = { key: r.serviceId } as unknown as Context.Key<any, any>
  if (r.version === undefined) return plain
  const contract = { key: r.serviceId, version: r.version, descriptor: { methods: r.methods ?? [] }, contractKey: plain }
  return position === "provides"
    ? { key: r.serviceId, [CONTRACT]: "provision", contract, version: r.version, methods: r.methods ?? [] } as unknown as Context.Key<any, any>
    : { key: r.serviceId, [CONTRACT]: "requirement", contract, range: r.range ?? "^" + r.version } as unknown as Context.Key<any, any>
}
/** The manifest read as a definition, for every check made from the manifest (BEH-BR-242). Its build is never run. */
export const manifestDefinition = (d: LazyPluginDefinition): AnyPlugin => ({
  id: d.manifest.id,
  requires: d.manifest.requires.map((r) => pseudoKey(r, "requires")),
  provides: d.manifest.provides.map((r) => pseudoKey(r, "provides")),
  ...(d.manifest.optional ? { optional: d.manifest.optional.map((r) => pseudoKey(r, "requires")) } : {}),
  meta: { ...d.meta, ...(d.manifest.description !== undefined ? { description: d.manifest.description } : {}) },
  build: Layer.effectDiscard(Effect.die(new Error("a lazy definition's manifest is never built"))) as unknown as AnyPlugin["build"]
})
/** BEH-BR-244: triggers in snapshot order — OnService per provided ServiceId, OnContribution per entry, then activation; no duplicates. */
export const triggersOf = (m: PluginManifest): ReadonlyArray<LazyTrigger> => {
  const out: Array<LazyTrigger> = [], seen = new Set<string>()
  const add = (t: LazyTrigger) => { const k = canon(t); if (!seen.has(k)) { seen.add(k); out.push(t) } }
  for (const p of m.provides) add({ _tag: "OnService", serviceId: p.serviceId })
  for (const c of m.contributions ?? []) add({ _tag: "OnContribution", registry: c.registry, id: c.id })
  for (const t of m.activation ?? []) add(t)
  return out
}
export const idleProblem = (idle: Duration.Input | undefined): boolean => {
  if (idle === undefined) return false
  const d = Duration.fromInput(idle)
  if (Option.isNone(d)) return true
  const ms = Duration.toMillis(d.value)
  return !(Number.isFinite(ms) && ms > 0)
}
export const Manifest = { consentDiff }
