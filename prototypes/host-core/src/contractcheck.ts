// The kit's contract check (kit BEH-KT-028): compare a contract with its last released snapshot (`bridger.contracts.lock`)
// and classify each difference by the table of core BEH-BR-230. Core itself compares only opaque digests (BEH-BR-231);
// this is the companion that reads the schemas.
import { Schema } from "effect"
import type { Contract } from "./contract.js"
import { parseVersion } from "./contract.js"

type Json = { readonly [k: string]: unknown }
export interface MethodSnapshot { readonly payload: Json | null; readonly success: Json | null; readonly error: Json | null; readonly stream: boolean }
/** What the lock file records per released version: plain JSON, no key objects. */
export interface ContractSnapshot { readonly serviceId: string; readonly version: string; readonly methods: Readonly<Record<string, MethodSnapshot>> }
export interface Change { readonly method: string; readonly kind: "breaking" | "additive"; readonly detail: string }

const doc = (x: unknown): Json | null => x === undefined ? null : (Schema.toJsonSchemaDocument(x as never) as unknown as { schema: Json }).schema
export const snapshotOf = (c: Contract): ContractSnapshot => ({
  serviceId: c.descriptor.serviceId, version: c.version,
  methods: Object.fromEntries(Object.entries(c.methods).map(([name, m]) => [name, { payload: doc(m.payload), success: doc(m.success), error: doc(m.error), stream: m.stream === true }]))
})

const strip = (v: unknown): unknown => Array.isArray(v) ? v.map(strip) : v && typeof v === "object"
  ? Object.fromEntries(Object.entries(v).filter(([k]) => k !== "title" && k !== "description" && k !== "examples").map(([k, x]) => [k, strip(x)])) : v
const same = (a: unknown, b: unknown) => JSON.stringify(strip(a)) === JSON.stringify(strip(b))
const isObj = (s: unknown): s is Json => typeof s === "object" && s !== null && !Array.isArray(s)

/**
 * Differences of one schema position. `side` decides what widening means: a payload is read by the provider, so accepting more
 * is additive; a success value is read by dependents, which ignore only fields they do not know (BEH-BR-231).
 */
const diffSchema = (prev: unknown, next: unknown, side: "payload" | "success" | "error", path: string): Array<{ kind: "breaking" | "additive"; detail: string }> => {
  if (same(prev, next)) return []
  const p = isObj(prev) ? prev : undefined, n = isObj(next) ? next : undefined
  if (p?.type === "object" && n?.type === "object" && isObj(p.properties) && isObj(n.properties) && side !== "error") {
    const out: Array<{ kind: "breaking" | "additive"; detail: string }> = []
    const preq = new Set(Array.isArray(p.required) ? p.required as string[] : []), nreq = new Set(Array.isArray(n.required) ? n.required as string[] : [])
    for (const k of Object.keys(p.properties)) {
      const here = `${path}.${k}`
      if (!(k in n.properties)) { out.push({ kind: "breaking", detail: `${here} removed` }); continue }
      if (!preq.has(k) && nreq.has(k)) out.push({ kind: "breaking", detail: `${here} became required` })
      else if (preq.has(k) && !nreq.has(k)) out.push(side === "payload" ? { kind: "additive", detail: `${here} became optional` } : { kind: "breaking", detail: `${here} became optional` })
      out.push(...diffSchema(p.properties[k], n.properties[k], side, here))
    }
    for (const k of Object.keys(n.properties)) if (!(k in p.properties))
      out.push(side === "payload" && nreq.has(k) ? { kind: "breaking", detail: `${path}.${k} added as required` } : { kind: "additive", detail: `${path}.${k} added` })
    return out
  }
  // Literal members of a payload may grow; every other change of a type, a literal set or a union is a new major.
  if (side === "payload" && p?.type === "string" && n?.type === "string" && Array.isArray(p.enum) && Array.isArray(n.enum)) {
    const removed = (p.enum as unknown[]).filter((x) => !(n.enum as unknown[]).includes(x))
    return removed.length ? [{ kind: "breaking", detail: `${path} lost member ${JSON.stringify(removed[0])}` }] : [{ kind: "additive", detail: `${path} gained members` }]
  }
  return [{ kind: "breaking", detail: `${path} changed` }]
}

/** Every difference between two snapshots of one contract, by the table of BEH-BR-230. */
export const classify = (prev: ContractSnapshot, next: ContractSnapshot): ReadonlyArray<Change> => {
  const out: Array<Change> = []
  for (const [name, p] of Object.entries(prev.methods)) {
    const n = next.methods[name]
    if (!n) { out.push({ method: name, kind: "breaking", detail: "method removed" }); continue }
    if (p.stream !== n.stream) out.push({ method: name, kind: "breaking", detail: "stream flag changed" })
    for (const side of ["payload", "success", "error"] as const) {
      const pv = p[side], nv = n[side]
      if (pv === null && nv === null) continue
      if (pv === null || nv === null) { out.push({ method: name, kind: "breaking", detail: `${side} ${pv === null ? "added" : "removed"}` }); continue }
      for (const d of diffSchema(pv, nv, side, side)) out.push({ method: name, ...d })
    }
  }
  for (const name of Object.keys(next.methods)) if (!(name in prev.methods)) out.push({ method: name, kind: "additive", detail: "method added" })
  return out
}

export type ContractVerdict =
  | { readonly ok: true }
  | { readonly ok: false; readonly _tag: "ContractBreakingChange" | "ContractVersionNotBumped"; readonly serviceId: string; readonly from: string; readonly to: string; readonly changes: ReadonlyArray<Change> }

/** The majors of BEH-BR-230: within one major, for major 0 within one minor, a release may only add, and adding takes a minor. */
export const checkRelease = (prev: ContractSnapshot, next: ContractSnapshot): ContractVerdict => {
  const pv = parseVersion(prev.version), nv = parseVersion(next.version)
  const changes = classify(prev, next)
  const failure = (_tag: "ContractBreakingChange" | "ContractVersionNotBumped", ch: ReadonlyArray<Change>) => ({ ok: false as const, _tag, serviceId: next.serviceId, from: prev.version, to: next.version, changes: ch })
  if (!pv || !nv || prev.serviceId !== next.serviceId) return { ok: true }          // a new ServiceId is a new major: nothing to compare
  const line = pv[0] === 0 ? pv[0] === nv[0] && pv[1] === nv[1] : pv[0] === nv[0]
  if (!line) return { ok: true }
  const breaking = changes.filter((c) => c.kind === "breaking")
  if (breaking.length) return failure("ContractBreakingChange", breaking)
  const additive = changes.filter((c) => c.kind === "additive")
  const minorBumped = pv[0] === 0 ? nv[2] > pv[2] : nv[1] > pv[1]
  if (additive.length && !minorBumped) return failure("ContractVersionNotBumped", additive)
  return { ok: true }
}
