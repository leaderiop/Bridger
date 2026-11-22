// Reference catalogs generated from the plugin definitions themselves (improvement report 05 R5; the Cordis `verify-cordis-catalog`
// idea): services with their contract versions, methods and timeouts, per-plugin configuration with its volatile flags, and the
// contributions a plugin's manifest declares. Pure data plus a Markdown rendering; a golden file in test/ makes drift a test failure.
import { Schema } from "effect"
import { contractOf, refKind } from "./contract.js"
import type { AnyPlugin } from "./plugin.js"

export interface ServiceRow { readonly serviceId: string; readonly kind: "plain" | "contract"; readonly version?: string; readonly methods: ReadonlyArray<{ readonly name: string; readonly timeoutMs?: number }>; readonly providedBy: ReadonlyArray<string>; readonly requiredBy: ReadonlyArray<string> }
export interface ConfigRow { readonly pluginId: string; readonly field: string; readonly type: string; readonly volatile: boolean; readonly required: boolean }
export interface ContributionRow { readonly pluginId: string; readonly registry: string; readonly id: string; readonly role?: string }
export interface Catalog { readonly services: ReadonlyArray<ServiceRow>; readonly config: ReadonlyArray<ConfigRow>; readonly contributions: ReadonlyArray<ContributionRow> }

const sidOf = (k: unknown) => (k as { key: string }).key
const cmp = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0

type Node = { readonly type?: string | ReadonlyArray<string>; readonly anyOf?: ReadonlyArray<Node>; readonly enum?: ReadonlyArray<unknown>; readonly const?: unknown }
/** A JSON Schema node as one word: `Schema.Number` encodes as a number or the strings "Infinity", "NaN"; that is still a number. */
const typeOf = (n: Node): string => {
  if (n.anyOf) {
    const members = n.anyOf.filter((m) => !(m.type === "string" && m.enum?.every((e) => e === "Infinity" || e === "-Infinity" || e === "NaN")))
    return [...new Set(members.map(typeOf))].join("|") || "any"
  }
  if (n.type) return Array.isArray(n.type) ? n.type.join("|") : (n.type as string)
  if (n.enum) return "enum"
  return n.const !== undefined ? typeof n.const : "any"
}
const fieldsOf = (config: Schema.Codec<any, any>): ReadonlyArray<{ field: string; type: string; required: boolean }> => {
  const doc = Schema.toJsonSchemaDocument(config as never) as { schema: { properties?: Record<string, Node>; required?: ReadonlyArray<string> } }
  const props = doc.schema.properties ?? {}
  return Object.keys(props).sort(cmp).map((field) => {
    return { field, type: typeOf(props[field]!), required: (doc.schema.required ?? []).includes(field) }
  })
}

export const catalogOf = (plugins: ReadonlyArray<AnyPlugin>): Catalog => {
  const services = new Map<string, { row: ServiceRow; provided: Set<string>; required: Set<string> }>()
  const entry = (k: unknown) => {
    const id = sidOf(k)
    let e = services.get(id)
    if (!e) {
      const kind = refKind(k)
      const c = kind ? contractOf(k as never) : undefined
      e = { row: { serviceId: id, kind: c ? "contract" : "plain", ...(c ? { version: c.version } : {}), methods: c ? c.descriptor.methods.map((name) => ({ name, ...(c.descriptor.timeouts.find((t) => t.method === name) ? { timeoutMs: c.descriptor.timeouts.find((t) => t.method === name)!.millis } : {}) })) : [], providedBy: [], requiredBy: [] }, provided: new Set(), required: new Set() }
      services.set(id, e)
    }
    return e
  }
  const config: Array<ConfigRow> = [], contributions: Array<ContributionRow> = []
  for (const p of plugins) {
    for (const k of p.provides) entry(k).provided.add(p.id)
    for (const k of [...p.requires, ...(p.optional ?? [])]) entry(k).required.add(p.id)
    if (p.config) for (const f of fieldsOf(p.config)) config.push({ pluginId: p.id, ...f, volatile: (p.volatile ?? []).includes(f.field) })
    for (const c of p.manifest?.contributions ?? []) contributions.push({ pluginId: p.id, registry: c.registry, id: c.id, ...(c.role ? { role: c.role } : {}) })
  }
  return {
    services: [...services.values()].map((e) => ({ ...e.row, providedBy: [...e.provided].sort(cmp), requiredBy: [...e.required].sort(cmp) })).sort((a, b) => cmp(a.serviceId, b.serviceId)),
    config: config.sort((a, b) => cmp(a.pluginId, b.pluginId) || cmp(a.field, b.field)),
    contributions: contributions.sort((a, b) => cmp(a.registry, b.registry) || cmp(a.id, b.id))
  }
}

export const renderCatalog = (c: Catalog): string => [
  "# Catalog", "", "## Services", "",
  "| Service | Kind | Version | Methods | Provided by | Required by |", "| --- | --- | --- | --- | --- | --- |",
  ...c.services.map((s) => `| \`${s.serviceId}\` | ${s.kind} | ${s.version ?? "-"} | ${s.methods.map((m) => m.timeoutMs ? `${m.name} (${m.timeoutMs} ms)` : m.name).join(", ") || "-"} | ${s.providedBy.join(", ") || "-"} | ${s.requiredBy.join(", ") || "-"} |`),
  "", "## Configuration", "", "| Plugin | Field | Type | Required | Volatile |", "| --- | --- | --- | --- | --- |",
  ...c.config.map((r) => `| ${r.pluginId} | \`${r.field}\` | ${r.type} | ${r.required ? "yes" : "no"} | ${r.volatile ? "yes" : "no"} |`),
  "", "## Contributions", "", "| Registry | Id | Role | Plugin |", "| --- | --- | --- | --- |",
  ...c.contributions.map((r) => `| \`${r.registry}\` | \`${r.id}\` | ${r.role ?? "-"} | ${r.pluginId} |`), ""
].join("\n")
