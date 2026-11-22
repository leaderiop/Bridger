// Versioned contracts (references/core behaviour 26, BEH-BR-225–234). Pure: no effect, no registration.
//
// Prototype note (finding G-P1): the spec gives `Contract` a member `key: Context.Key` while declaring
// `Contract extends Context.Key`. In Effect 4 every `Context.Key` already has `key: string` (its identifier),
// and `Context.add`/`getOption` read it. The prototype therefore names the wrapped key `contractKey` and keeps
// `key` as the string identifier, so a contract (and each reference made from it) is usable as a key.
import { createHash } from "node:crypto"
import { Duration, Option, Schema, type Context } from "effect"

export const CONTRACT = Symbol.for("@bridger/core/Contract")

export interface MethodSpec<P = unknown, S = unknown, E = unknown> {
  readonly payload?: P
  readonly success?: S
  readonly error?: E
  readonly stream?: boolean
  readonly timeout?: Duration.Input
  /** Overrides the computed schema digest, for a codec that has no canonical JSON Schema (BEH-BR-228 clause 3b). */
  readonly digest?: string
}
export interface ContractDescriptor {
  readonly serviceId: string
  readonly name: string
  readonly version: string
  readonly methods: ReadonlyArray<string>
  readonly timeouts: ReadonlyArray<{ readonly method: string; readonly millis: number }>
  /** A stable hash per method of its encoded-side schema (payload, success, error, stream flag); a method without one is not compared (BEH-BR-228 clause 3b). */
  readonly schemas: ReadonlyArray<{ readonly method: string; readonly digest: string }>
}
export interface Contract<Self = any, Shape = any> extends Context.Key<Self, Shape> {
  readonly [CONTRACT]: "contract"
  readonly contractKey: Context.Key<Self, Shape>
  readonly name: string
  readonly version: string
  readonly methods: Readonly<Record<string, MethodSpec>>
  readonly descriptor: ContractDescriptor
  /** Set when the contract breaks a rule of BEH-BR-225 or 234; install/replace/enable then fail. */
  readonly invalid?: string
  range(range: string): ContractRequirement<Self, Shape>
}
export interface ContractRequirement<Self = any, Shape = any> extends Context.Key<Self, Shape> {
  readonly [CONTRACT]: "requirement"
  readonly contract: Contract<Self, Shape>
  readonly range: string
}
export interface ContractProvision<Self = any, Shape = any> extends Context.Key<Self, Shape> {
  readonly [CONTRACT]: "provision"
  readonly contract: Contract<Self, Shape>
  readonly version: string
  readonly methods: ReadonlyArray<string>
}
export type ContractRef = Contract | ContractRequirement | ContractProvision

const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
const PART = "(0|[1-9]\\d*)"
const RANGE = new RegExp(`^(?:(\\^)${PART}(?:\\.${PART}(?:\\.${PART})?)?|(~)${PART}\\.${PART}(?:\\.${PART})?|${PART}\\.${PART}\\.${PART})$`)

type V = readonly [number, number, number]
export const parseVersion = (v: unknown): V | undefined => {
  if (typeof v !== "string") return undefined
  const m = VERSION.exec(v)
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : undefined
}
const cmp = (a: V, b: V) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]
/** A range as the half-open interval [lo, hi) of BEH-BR-226; `hi` undefined for an exact version. */
export const parseRange = (r: unknown): { readonly lo: V; readonly hi?: V; readonly exact?: true } | undefined => {
  if (typeof r !== "string") return undefined
  const m = RANGE.exec(r)
  if (!m) return undefined
  if (m[1] === "^") {
    const M = Number(m[2]), mi = m[3] !== undefined ? Number(m[3]) : 0, p = m[4] !== undefined ? Number(m[4]) : 0
    if (M >= 1) return { lo: [M, mi, p], hi: [M + 1, 0, 0] }
    if (m[3] === undefined) return undefined           // "^0" is not in the table
    return { lo: [0, mi, p], hi: [0, mi + 1, 0] }
  }
  if (m[5] === "~") {
    const M = Number(m[6]), mi = Number(m[7]), p = m[8] !== undefined ? Number(m[8]) : 0
    return { lo: [M, mi, p], hi: [M, mi + 1, 0] }
  }
  return { lo: [Number(m[9]), Number(m[10]), Number(m[11])], exact: true }
}

export const satisfies = (version: unknown, range: unknown): boolean => {
  const v = parseVersion(version), r = parseRange(range)
  if (!v || !r) return false
  if (r.exact) return cmp(v, r.lo) === 0
  return cmp(v, r.lo) >= 0 && cmp(v, r.hi!) < 0
}
export const maxSatisfying = (versions: ReadonlyArray<unknown>, range: unknown): Option.Option<string> => {
  let best: { s: string; v: V } | undefined
  for (const s of versions) {
    if (typeof s !== "string" || !satisfies(s, range)) continue
    const v = parseVersion(s)!
    if (!best || cmp(v, best.v) > 0) best = { s, v }
  }
  return best ? Option.some(best.s) : Option.none()
}
/** A range lies within `major` when every version it matches has that major (BEH-BR-226). */
export const rangeWithinMajor = (range: unknown, major: number): boolean => {
  const r = parseRange(range)
  if (!r) return false
  if (r.lo[0] !== major) return false
  if (r.exact) return true
  const hi = r.hi!
  return hi[0] === major || (hi[0] === major + 1 && hi[1] === 0 && hi[2] === 0)
}

const finiteMillis = (d: Duration.Input): number | undefined => {
  try {
    const decoded = Duration.fromInput(d)
    if (Option.isNone(decoded)) return undefined
    const ms = Duration.toMillis(decoded.value)
    return Number.isFinite(ms) && ms > 0 ? ms : undefined
  } catch { return undefined }
}

/** An object inheriting from a key (a class with a read-only `name`), with own properties defined, not assigned. */
const extend = (proto: object, props: Record<PropertyKey, unknown>): Record<PropertyKey, unknown> => {
  const o = Object.create(proto) as Record<PropertyKey, unknown>
  for (const k of Reflect.ownKeys(props)) Object.defineProperty(o, k, { value: props[k as string], enumerable: true, writable: false, configurable: false })
  return o
}
const sidOf = (k: Context.Key<any, any>) => (k as unknown as { key: string }).key
const codeUnit = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0

export const method = <const M extends MethodSpec>(spec: M): M => spec

type TypeOf<S> = S extends { readonly Type: infer T } ? T : never
type Arg<F> = F extends (...a: infer A) => any ? (A extends readonly [] ? void : A[0]) : never
type Ok<F> = F extends (...a: any) => infer R ? (R extends import("effect").Effect.Effect<infer A, any, any> ? A : R extends import("effect").Stream.Stream<infer A, any, any> ? A : never) : never
type Err<F> = F extends (...a: any) => import("effect").Effect.Effect<any, infer X, any> ? X : never
/** A spec fits a method of the shape when its schemas decode to what the method takes, gives and fails with (report 05 R7, DX-09). */
type Fits<F, M> =
  & (M extends { readonly payload: infer P } ? [unknown] extends [TypeOf<P>] ? unknown : [TypeOf<P>] extends [Arg<F>] ? unknown : { readonly "~payload": "does not match the method's argument" } : unknown)
  & (M extends { readonly success: infer S } ? [unknown] extends [TypeOf<S>] ? unknown : [TypeOf<S>] extends [Ok<F>] ? unknown : { readonly "~success": "does not match the method's result" } : unknown)
  & (M extends { readonly error: infer X } ? [unknown] extends [TypeOf<X>] ? unknown : [TypeOf<X>] extends [Err<F>] ? unknown : { readonly "~error": "does not match the method's failure" } : unknown)
/** Method names are the function-valued keys of the shape; each spec is checked against its method. */
export type MethodsOf<Shape, Ms> = { readonly [K in keyof Ms]: K extends keyof Shape ? Ms[K] & Fits<Shape[K], Ms[K]> : { readonly "~method": `no method ${K & string} in the service` } }

/** Sorted-key JSON, so that equal schemas hash equally whatever their construction order. */
const canonical = (v: unknown): string => JSON.stringify(v, (_, x) => x && typeof x === "object" && !Array.isArray(x)
  ? Object.fromEntries(Object.entries(x).filter(([k]) => k !== "title" && k !== "description" && k !== "examples").sort(([a], [b]) => codeUnit(a, b)))   // documentation never changes the wire
  : x)
const isSchema = (x: unknown): boolean => (typeof x === "object" || typeof x === "function") && x !== null && "ast" in x
/** shortcut: only Effect Schemas are fingerprinted; anything else needs `MethodSpec.digest`, else the method is not compared. */
export const digestOf = (spec: MethodSpec): string | undefined => {
  if (spec.digest !== undefined) return spec.digest
  const parts = [spec.payload, spec.success, spec.error]
  if (parts.some((x) => x !== undefined && !isSchema(x))) return undefined
  try {
    const doc = parts.map((x) => x === undefined ? null : Schema.toJsonSchemaDocument(x as never))
    return createHash("sha256").update(canonical({ schemas: doc, stream: spec.stream === true })).digest("hex").slice(0, 16)
  } catch { return undefined }
}

export const make = <Self, Shape, const Ms extends Record<string, MethodSpec>>(key: Context.Key<Self, Shape>, options: { readonly version: string; readonly methods: Ms & MethodsOf<Shape, Ms> }): Contract<Self, Shape> => {
  const serviceId = sidOf(key)
  const at = serviceId.lastIndexOf("@")
  const name = at >= 0 ? serviceId.slice(0, at) : serviceId
  const suffix = at >= 0 ? serviceId.slice(at + 1) : undefined
  const v = parseVersion(options.version)
  const names = Object.keys(options.methods).sort(codeUnit)
  const timeouts: Array<{ method: string; millis: number }> = []
  let invalid: string | undefined
  if (suffix === undefined || !/^(0|[1-9]\d*)$/.test(suffix)) invalid = "ServiceId lacks the @<major> suffix"
  else if (!v) invalid = "version breaks the grammar"
  else if (Number(suffix) !== v[0]) invalid = "ServiceId major differs from version's major"
  else if (names.length === 0) invalid = "methods is empty"
  for (const m of names) {
    const t = options.methods[m]!.timeout
    if (t === undefined) continue
    const ms = finiteMillis(t)
    if (ms === undefined) { invalid ??= `method ${m}: timeout is not a finite positive duration`; continue }
    timeouts.push({ method: m, millis: ms })
  }
  const schemas = names.flatMap((m) => { const d = digestOf(options.methods[m]!); return d === undefined ? [] : [{ method: m, digest: d }] })
  const descriptor: ContractDescriptor = Object.freeze({ serviceId, name, version: options.version, methods: Object.freeze(names), timeouts: Object.freeze(timeouts), schemas: Object.freeze(schemas) })
  let c: Record<PropertyKey, unknown> = {}
  c = extend(key as object, {
    [CONTRACT]: "contract", key: serviceId, contractKey: key, name, version: options.version, methods: options.methods, descriptor,
    ...(invalid ? { invalid } : {}),
    range: (range: string) => {
      return extend(key as object, { [CONTRACT]: "requirement", key: serviceId, contract: c, range })
    }
  })
  return c as unknown as Contract<Self, Shape>
}

export const at = <Self, Shape>(contract: Contract<Self, Shape>, version: string, options: { readonly methods: ReadonlyArray<string> }): ContractProvision<Self, Shape> => {
  return extend(contract.contractKey as object, { [CONTRACT]: "provision", key: contract.key, contract, version, methods: options.methods }) as unknown as ContractProvision<Self, Shape>
}

export const parseOptions = Object.freeze({ onExcessProperty: "ignore" as const })

export const refKind = (k: unknown): "contract" | "requirement" | "provision" | undefined =>
  (k as Record<PropertyKey, unknown> | null)?.[CONTRACT] as "contract" | "requirement" | "provision" | undefined
export const contractOf = (k: ContractRef): Contract => refKind(k) === "contract" ? k as Contract : (k as ContractRequirement | ContractProvision).contract
export const underlyingKey = (k: Context.Key<any, any>): Context.Key<any, any> => refKind(k) ? contractOf(k as ContractRef).contractKey : k

/** A requirement as declared: its range and the dependent's copy of the contract (BEH-BR-227). */
export const requirementOf = (k: Context.Key<any, any>): { readonly range: string; readonly version: string; readonly methods: ReadonlyArray<string>; readonly schemas?: ContractDescriptor["schemas"] } | undefined => {
  const kind = refKind(k)
  if (kind === "contract") { const c = k as unknown as Contract; return { range: "^" + c.version, version: c.version, methods: c.descriptor.methods, schemas: c.descriptor.schemas } }
  if (kind === "requirement") { const r = k as unknown as ContractRequirement; return { range: r.range, version: r.contract.version, methods: r.contract.descriptor.methods, schemas: r.contract.descriptor.schemas } }
  return undefined
}
/** A provision as declared (BEH-BR-227); undefined for a plain key. */
export const provisionOf = (k: Context.Key<any, any>): { readonly version: string; readonly methods: ReadonlyArray<string>; readonly schemas?: ContractDescriptor["schemas"] } | undefined => {
  const kind = refKind(k)
  if (kind === "contract") { const c = k as unknown as Contract; return { version: c.version, methods: c.descriptor.methods, schemas: c.descriptor.schemas } }
  if (kind === "provision") { const p = k as unknown as ContractProvision; return { version: p.version, methods: [...p.methods], schemas: p.contract.descriptor.schemas } }
  return undefined
}

/** The rule a reference breaks in its position (BEH-BR-225–227), or undefined. */
export const refProblem = (k: Context.Key<any, any>, position: "requires" | "optional" | "provides"): string | undefined => {
  const kind = refKind(k)
  if (!kind) return undefined
  const c = contractOf(k as ContractRef)
  if (c.invalid) return `contract ${c.key}: ${c.invalid}`
  const major = parseVersion(c.version)![0]
  if (kind === "requirement") {
    if (position === "provides") return `contract ${c.key}: a requirement in provides`
    const r = (k as unknown as ContractRequirement).range
    if (!parseRange(r)) return `contract ${c.key}: range ${JSON.stringify(r)} breaks the grammar`
    if (!rangeWithinMajor(r, major)) return `contract ${c.key}: range ${r} leaves major ${major}`
  }
  if (kind === "provision") {
    if (position !== "provides") return `contract ${c.key}: a provision in ${position}`
    const p = k as unknown as ContractProvision
    const pv = parseVersion(p.version)
    if (!pv || pv[0] !== major) return `contract ${c.key}: provision version ${p.version} is not in major ${major}`
    if (cmp(pv, parseVersion(c.version)!) > 0) return `contract ${c.key}: provision version ${p.version} is above ${c.version}`
    if (p.methods.length === 0 || p.methods.some((m) => !c.descriptor.methods.includes(m))) return `contract ${c.key}: provision methods are not a non-empty subset`
  }
  return undefined
}

type Side = { readonly version: string; readonly methods: ReadonlyArray<string>; readonly schemas?: ContractDescriptor["schemas"] }
/**
 * The conditions of BEH-BR-228; undefined when compatible, else `{ provided?, missingMethods, mismatchedMethods }`.
 * Clause 3b: a method both sides name, and both sides fingerprint, must have equal digests — an add-only
 * evolution (BEH-BR-230) never changes a method the older side knows.
 */
export const incompatibility = (
  req: Side & { readonly range: string },
  prov: Side | undefined
): { readonly provided?: string; readonly missingMethods: ReadonlyArray<string>; readonly mismatchedMethods: ReadonlyArray<string> } | undefined => {
  if (!prov) return { missingMethods: [], mismatchedMethods: [] }
  if (!satisfies(prov.version, req.range)) return { provided: prov.version, missingMethods: [], mismatchedMethods: [] }
  const pv = parseVersion(prov.version)!, dv = parseVersion(req.version)!
  if (cmp(pv, dv) >= 0) {
    const missing = req.methods.filter((m) => !prov.methods.includes(m)).sort(codeUnit)
    if (missing.length) return { provided: prov.version, missingMethods: missing, mismatchedMethods: [] }
  }
  const theirs = new Map((prov.schemas ?? []).map((x) => [x.method, x.digest]))
  const mismatched = (req.schemas ?? []).filter((x) => prov.methods.includes(x.method) && theirs.has(x.method) && theirs.get(x.method) !== x.digest).map((x) => x.method).sort(codeUnit)
  if (mismatched.length) return { provided: prov.version, missingMethods: [], mismatchedMethods: mismatched }
  return undefined
}

/** The same contract without the per-method fit check: for tools and tests that build a contract from data or deliberately drift it from its service (report 05 R7). */
export const makeUnchecked = <Self, Shape>(key: Context.Key<Self, Shape>, options: { readonly version: string; readonly methods: Record<string, MethodSpec> }): Contract<Self, Shape> => make(key, options as never)

export const Contract = { make, makeUnchecked, method, at, satisfies, maxSatisfying, parseOptions }
