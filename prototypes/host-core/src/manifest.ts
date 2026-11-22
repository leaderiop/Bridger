// Manifests, consentDiff and Plugin.lazy (references/core behaviour 27, BEH-BR-241–244). Prototype.
// The manifest is one Effect Schema; the type, the decoder and the JSON Schema derive from it (report 05 R5).
import { Cause, Context, Duration, Effect, Exit, Layer, Option, Schema, type SchemaIssue } from "effect"
import { CONTRACT, parseRange, refKind, satisfies } from "./contract.js"
import type { AnyPlugin } from "./plugin.js"

export const BRIDGER_VERSION = "0.3.0"     // `Bridger.version` of this prototype (BEH-BR-242)

// The manifest is declared once, as a Schema; the type, the decoder and the JSON Schema `bridger pack` writes all derive from it
// (improvement report 05 R5, DX-06).
const Str = Schema.String
const refFields = { serviceId: Str, internal: Schema.optionalKey(Schema.Boolean), version: Schema.optionalKey(Str), methods: Schema.optionalKey(Schema.Array(Str)) }
export const ProvidedRef = Schema.Struct(refFields)
export const RequiredRef = Schema.Struct({ ...refFields, range: Schema.optionalKey(Str) })
export const LazyTrigger = Schema.Union([
  Schema.Struct({ _tag: Schema.Literal("OnService"), serviceId: Str }),
  Schema.Struct({ _tag: Schema.Literal("OnContribution"), registry: Str, id: Str }),
  Schema.Struct({ _tag: Schema.Literal("OnEvent"), eventId: Str })
])
export const ManifestSchema = Schema.Struct({
  manifestVersion: Schema.Literal(1),
  id: Str,
  version: Str,
  digest: Schema.optionalKey(Str),
  provides: Schema.Array(ProvidedRef),
  requires: Schema.Array(RequiredRef),
  optional: Schema.optionalKey(Schema.Array(RequiredRef)),
  engines: Schema.optionalKey(Schema.Record(Str, Str)),
  activation: Schema.optionalKey(Schema.Array(LazyTrigger)),
  contributions: Schema.optionalKey(Schema.Array(Schema.Struct({ registry: Str, id: Str, role: Schema.optionalKey(Schema.Literals(["veto", "enrich", "advisory"])), target: Schema.optionalKey(Schema.Unknown) }))),
  listens: Schema.optionalKey(Schema.Array(Str)),
  /** Event ids the plugin may emit (BEH-BR-268, improvement report 06 R2). */
  emits: Schema.optionalKey(Schema.Array(Str)),
  /** Plugin ids the plugin may mount as children with `Plugin.Runtime.install`. */
  mounts: Schema.optionalKey(Schema.Array(Str)),
  /** Host operations the plugin may call through `Plugin.Runtime`, by name (`install`, `unmount`). */
  hostOps: Schema.optionalKey(Schema.Array(Str)),
  description: Schema.optionalKey(Str),
  publisher: Schema.optionalKey(Str),
  tier: Schema.optionalKey(Str),
  requested: Schema.optionalKey(Schema.Struct({
    capabilities: Schema.optionalKey(Schema.Array(Schema.Struct({ serviceId: Str, methods: Schema.optionalKey(Schema.Array(Str)) }))),
    permissions: Schema.optionalKey(Schema.Array(Str)),
    egress: Schema.optionalKey(Schema.Array(Schema.Struct({ host: Str, purpose: Schema.optionalKey(Str) })))
  })),
  residency: Schema.optionalKey(Str),
  config: Schema.optionalKey(Schema.Struct({ schema: Schema.Unknown, volatile: Schema.optionalKey(Schema.Array(Str)) })),
  /** Companion-owned data, by package name (BEH-BR-241): the only open part of a manifest. */
  extensions: Schema.optionalKey(Schema.Record(Str, Schema.Unknown))
})
export type LazyTrigger = typeof LazyTrigger.Type
export type ProvidedRef = typeof ProvidedRef.Type
export type RequiredRef = typeof RequiredRef.Type
export type PluginManifest = typeof ManifestSchema.Type
/**
 * A decoded manifest as read: known fields typed, unknown properties kept (BEH-BR-241 clause 2: a newer manifest read by an older
 * core keeps what it does not understand, and `consentDiff` still sees it). The type of a manifest a plugin author writes is
 * `PluginManifest`, closed; only the decoded form is open.
 */
export type ManifestData = PluginManifest & { readonly [extra: string]: unknown }
/** The JSON Schema of a manifest, for `bridger pack` and editors (kit BEH-KT-029). */
export const manifestJsonSchema = () => Schema.toJsonSchemaDocument(ManifestSchema)

/** The path of the first problem an issue names, never a value (BEH-BR-241): `provides[1].serviceId`. */
const pathOf = (issue: SchemaIssue.Issue, prefix = ""): string => {
  switch (issue._tag) {
    case "Pointer": {
      const here = issue.path.reduce<string>((acc, k) => typeof k === "number" ? `${acc}[${k}]` : acc === "" ? String(k) : `${acc}.${String(k)}`, prefix)
      return pathOf(issue.issue, here)
    }
    case "Composite": return issue.issues.length > 0 ? pathOf(issue.issues[0]!, prefix) : prefix
    case "MissingKey": return prefix
    case "AnyOf": return issue.issues.length > 0 ? pathOf(issue.issues[0]!, prefix) : prefix
    case "OneOf": return prefix
    case "Filter": case "Encoding": return pathOf(issue.issue, prefix)
    default: return prefix
  }
}
/** Rules across the fields of one reference, which a structural schema does not express (BEH-BR-241). */
const crossProblem = (m: PluginManifest): string | undefined => {
  for (const field of ["provides", "requires", "optional"] as const) {
    const refs = (m[field] ?? []) as ReadonlyArray<{ internal?: boolean; version?: string; methods?: ReadonlyArray<string> }>
    for (let i = 0; i < refs.length; i++) {
      const r = refs[i]!
      if (r.internal !== undefined && r.version !== undefined) return `manifest: ${field}[${i}].internal (on a contract key)`
      if (r.version !== undefined && r.methods === undefined) return `manifest: ${field}[${i}].methods (version without methods)`
      if (r.version === undefined && r.methods !== undefined) return `manifest: ${field}[${i}].methods (methods on a plain key)`
    }
  }
  return undefined
}
/** The decode of BEH-BR-241: a path naming the first problem, never a value; undefined when it decodes. */
export const decodeProblem = (m: unknown): string | undefined => {
  if (typeof m !== "object" || m === null || Array.isArray(m)) return "manifest: <root> is not an object"
  const exit = Schema.decodeUnknownExit(ManifestSchema, { errors: "first" })(m)
  if (Exit.isFailure(exit)) {
    const err = Cause.squash(exit.cause) as { readonly issue?: SchemaIssue.Issue }
    const path = err.issue ? pathOf(err.issue) : ""
    return `manifest: ${path === "" ? "<root>" : path}`
  }
  return crossProblem(exit.value)
}

/** Engines (BEH-BR-242): undefined, or the range problem ("invalid") or the unsatisfied range. */
/**
 * Plain keys (no contract version) that a decoded manifest does not mark `internal: true`, in `provides`, `requires`, `optional` order
 * (BEH-BR-241, loader BEH-LD-014, kit BEH-KT-028): `path` as the loader's `reason` names it, for example "requires[2]".
 */
export const plainKeyProblems = (m: PluginManifest): ReadonlyArray<{ readonly serviceId: string; readonly path: string }> =>
  (["provides", "requires", "optional"] as const).flatMap((field) =>
    (m[field] ?? []).flatMap((r, i) => r.version === undefined && r.internal !== true ? [{ serviceId: r.serviceId, path: `${field}[${i}]` }] : []))

/** The same check for a definition that has no manifest: every plain key it names (kit BEH-KT-028). */
export const plainKeysOfDefinition = (d: AnyPlugin): ReadonlyArray<string> =>
  [...d.provides, ...d.requires, ...((d as { optional?: ReadonlyArray<{ key: string }> }).optional ?? [])]
    .filter((k) => refKind(k) === undefined).map((k) => (k as { key: string }).key)

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
const isObj = (u: unknown): u is Record<string, unknown> => typeof u === "object" && u !== null && !Array.isArray(u)
const canon = (u: unknown): string => JSON.stringify(u, (_k, v) => isObj(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => cu(a, b))) : v)
export const consentDiff = (previous: ManifestData | undefined, next: ManifestData): ConsentDiff => {
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
  setDiff("emits", p?.emits ?? [], next.emits ?? [])
  setDiff("mounts", p?.mounts ?? [], next.mounts ?? [])
  setDiff("hostOps", p?.hostOps ?? [], next.hostOps ?? [])
  setDiff("requires", (p?.requires ?? []).map((r) => r.serviceId), next.requires.map((r) => r.serviceId))
  setDiff("optional", (p?.optional ?? []).map((r) => r.serviceId), (next.optional ?? []).map((r) => r.serviceId))
  for (const f of ["publisher", "tier", "residency"] as const) {
    const a = p?.[f], b = next[f]
    if (a !== b) relabelled.push({ path: f, ...(a !== undefined ? { from: a } : {}), ...(b !== undefined ? { to: b } : {}) })
  }
  if (p) {
    const skip = new Set(["version", "digest", "description", "manifestVersion", "requested", "requires", "optional", "publisher", "tier", "residency", "emits", "mounts", "hostOps"])
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
/** What a JSON import of a manifest looks like to the compiler: literals widened. `lazy` and the host's decoder check the values (BEH-BR-241), so a file written by `bridger pack` is accepted as it is read. */
export type FromJson<T> = T extends string ? string : T extends number ? number : T extends boolean ? boolean : T extends ReadonlyArray<infer U> ? ReadonlyArray<FromJson<U>> : T extends object ? { readonly [K in keyof T]: FromJson<T[K]> } : T
export const lazy = (options: { readonly manifest: PluginManifest | FromJson<PluginManifest>; readonly load: Effect.Effect<AnyPlugin, unknown>; readonly digest?: string; readonly idle?: Duration.Input; readonly holdTimeout?: Duration.Input }): LazyPluginDefinition => {
  const m = options.manifest as PluginManifest
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
