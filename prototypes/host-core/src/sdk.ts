// The promise SDK of @bridger/kit (references/kit behaviours 05, BEH-KT-033..038): the runtime a generated module calls (`serveContract`)
// and the generator (`generateSdk`). The runtime and everything a generated module exports is Effect-free: payloads are JSON values.
// shortcut: the guest transport is the remote companion's; `GuestEntry.call` is the seam it drives, and `inProcess` is the test transport.
import { Schema } from "effect"
import type { Contract } from "./contract.js"
import { tsOf, validate, type Json, type JsonSchema } from "./jsonschema.js"

export class ContractError<Tag extends string = string, Fields extends object = {}> extends Error {
  readonly _tag: Tag
  readonly fields: Fields
  constructor(fields: Fields, tag?: Tag) { super(tag ?? "ContractError"); this._tag = tag as Tag; this.fields = fields }
}
export class LocalContractRefused extends Error { readonly _tag = "LocalContractRefused"; constructor(readonly serviceId: string, readonly site: string) { super(`local contract refused at ${site}: ${serviceId}`) } }
export class SdkDecodeFailed extends Error { readonly _tag = "SdkDecodeFailed"; constructor(readonly method: string, readonly side: "input" | "output", message: string) { super(message) } }
export class SdkUndeclaredFailure extends Error { readonly _tag = "SdkUndeclaredFailure"; constructor(readonly method: string) { super("handler failed with an undeclared error") } }
export class CallbackDenied extends Error { readonly _tag = "CallbackDenied"; constructor(readonly serviceId: string, readonly reason: string) { super(`callback denied: ${reason}`) } }

export interface DisclosedClaims { readonly actor?: { readonly kind: string; readonly id: string }; readonly onBehalfOf?: string; readonly org?: string; readonly correlationId?: string }
export interface CallContext {
  readonly signal: AbortSignal
  readonly deadlineMs: number
  readonly claims: DisclosedClaims
  client<K extends ClientDef<any>>(client: K): ClientOf<K>
}
export interface ClientDef<Api = unknown> { readonly serviceId: string; readonly methods: ReadonlyArray<string>; readonly api?: Api }
/** The client of a requested capability: typed per method when the generator was given the contract, untyped JSON otherwise. */
export type ClientOf<K extends ClientDef<any>> = unknown extends K["api"] ? { readonly [M in K["methods"][number]]: (input: any) => Promise<any> } : NonNullable<K["api"]>
export const clientDef = <const M extends ReadonlyArray<string>, Api = unknown>(serviceId: string, methods: M): { readonly serviceId: string; readonly methods: M; readonly api?: Api } => ({ serviceId, methods })

export type WireResult = { readonly ok: true; readonly value: Json } | { readonly ok: true; readonly stream: AsyncIterable<Json> } | { readonly ok: false; readonly failure: { readonly _tag: string; readonly [k: string]: Json } }
export interface WireCall {
  readonly signal?: AbortSignal
  readonly deadlineMs?: number
  readonly claims?: Record<string, unknown>
  /** The session back to the link plugin; absent when the guest has no session. */
  readonly callback?: (serviceId: string, method: string, payload: Json) => Promise<WireResult>
}
declare const entryBrand: unique symbol
/** Opaque to the partner: what `Guest.serve` of the remote companion accepts. */
export interface GuestEntry {
  readonly [entryBrand]: true
  readonly served: { readonly serviceId: string; readonly version: string; readonly methods: ReadonlyArray<string> }
  readonly call: (method: string, payload: Json, wire?: WireCall) => Promise<WireResult>
}

export interface MethodSchemas { readonly payload?: JsonSchema; readonly success?: JsonSchema; readonly error?: JsonSchema; readonly stream?: boolean }
export interface Served { readonly serviceId: string; readonly version: string; readonly schemas: Readonly<Record<string, MethodSchemas>> }
export interface ServeOptions {
  readonly onUnexpected?: (method: string, thrown: unknown) => void
  /** `requested.capabilities` of the partner's manifest (BEH-KT-035): a client exists only for these. */
  readonly requested?: ReadonlyArray<{ readonly serviceId: string; readonly methods?: ReadonlyArray<string> }>
}

const CLAIMS = ["actor", "onBehalfOf", "org", "correlationId"] as const
const claimsOf = (wire: Record<string, unknown> | undefined): DisclosedClaims =>
  Object.fromEntries(CLAIMS.filter((k) => wire && wire[k] !== undefined).map((k) => [k, wire![k]]))

/** Wraps handlers into a `GuestEntry` (BEH-KT-034): checks input and output, maps failures, builds the call context. Opens no transport. */
export const serveContract = (served: Served, handlers: Readonly<Record<string, (input: any, ctx: CallContext) => any>>, options: ServeOptions = {}): GuestEntry => {
  const entry = {
    served: { serviceId: served.serviceId, version: served.version, methods: Object.keys(served.schemas).sort() },
    call: async (method: string, payload: Json, wire: WireCall = {}): Promise<WireResult> => {
      const schemas = served.schemas[method], handler = handlers[method]
      if (!schemas || !handler) return { ok: false, failure: { _tag: "SdkUndeclaredFailure", method, message: "unknown method" } }
      const bad = schemas.payload && validate(schemas.payload, payload)
      if (bad) return { ok: false, failure: { _tag: "SdkDecodeFailed", method, side: "input", message: bad } }
      const ctx: CallContext = {
        signal: wire.signal ?? new AbortController().signal,
        deadlineMs: wire.deadlineMs ?? Infinity,
        claims: claimsOf(wire.claims),
        client: (def) => {
          const req = options.requested?.find((r) => r.serviceId === def.serviceId)
          if (!req) throw new Error(`no client: ${def.serviceId} is not in requested.capabilities`)
          const allowed = new Set(req.methods ?? def.methods)
          return Object.fromEntries(def.methods.filter((m) => allowed.has(m)).map((m) => [m, async (input: Json) => {
            if (!wire.callback) throw new CallbackDenied(def.serviceId, "no-session")
            const r = await wire.callback(def.serviceId, m, input)
            if (r.ok) return "value" in r ? r.value : null
            if (r.failure._tag === "CallbackDenied") throw new CallbackDenied(def.serviceId, String(r.failure.reason ?? "not-granted"))
            throw new ContractError(r.failure as object, r.failure._tag)
          }])) as never
        }
      }
      try {
        const out = await handler(payload, ctx)
        if (schemas.stream) {
          const src = out as AsyncIterable<Json>
          return { ok: true, stream: (async function* () { for await (const x of src) { const e = schemas.success && validate(schemas.success, x); if (e) throw new SdkDecodeFailed(method, "output", e); yield x } })() }
        }
        const e = schemas.success && validate(schemas.success, out === undefined ? null : out)
        if (e) return { ok: false, failure: { _tag: "SdkDecodeFailed", method, side: "output", message: e } }
        return { ok: true, value: (out === undefined ? null : out) as Json }
      } catch (thrown) {
        if (thrown instanceof ContractError && thrown._tag) {
          const failure = { ...(thrown.fields as object), _tag: thrown._tag } as { _tag: string }
          if (schemas.error && validate(schemas.error, failure) === undefined) return { ok: false, failure: failure as never }
        }
        try { options.onUnexpected?.(method, thrown) } catch { /* the partner's callback must not change the result */ }
        return { ok: false, failure: { _tag: "SdkUndeclaredFailure", method, message: "handler failed with an undeclared error" } }
      }
    }
  }
  return entry as unknown as GuestEntry
}

/** The in-process test transport (tests only): calls a guest entry directly, with the wire a link would build. */
export const inProcess = (entry: GuestEntry) => (method: string, payload: Json, wire?: WireCall) => entry.call(method, payload, wire)

// ---------------------------------------------------------------------------------------------------- generator
const encodedDoc = (s: unknown): JsonSchema | undefined => s === undefined ? undefined : (Schema.toJsonSchemaDocument(Schema.toEncoded(s as never) as never) as unknown as { schema: JsonSchema }).schema
export const schemasOf = (contract: Contract): Served => ({
  serviceId: contract.descriptor.serviceId, version: contract.version,
  schemas: Object.fromEntries(Object.keys(contract.methods).sort().map((m) => {
    const spec = contract.methods[m]!
    const out: { -readonly [K in keyof MethodSchemas]: MethodSchemas[K] } = {}
    const p = encodedDoc(spec.payload), s = encodedDoc(spec.success), e = encodedDoc(spec.error)
    if (p) out.payload = p; if (s) out.success = s; if (e) out.error = e; if (spec.stream) out.stream = true
    return [m, out]
  }))
})
const pascal = (s: string) => s.replace(/(^|[^A-Za-z0-9]+)([A-Za-z0-9])/g, (_m, _a, c: string) => c.toUpperCase())
const baseName = (serviceId: string) => pascal(serviceId.split("@")[0]!.split("/").pop()!)
const stableJson = (v: unknown): string => JSON.stringify(v, (_, x) => x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : x, 2)

/** The text of a generated SDK module for one contract version: deterministic (BEH-KT-033); the contract's descriptor is embedded unchanged. */
export const generateSdk = (contract: Contract, options: { readonly requested?: ReadonlyArray<{ readonly serviceId: string; readonly methods?: ReadonlyArray<string>; readonly contract?: Contract }> } = {}): string => {
  if (contract.descriptor.local) throw new LocalContractRefused(contract.descriptor.serviceId, "sdk-generate")   // before anything is written (BEH-KT-033)
  const served = schemasOf(contract)
  const name = baseName(contract.descriptor.serviceId)
  const methods = Object.keys(served.schemas)
  const errorClasses: Array<string> = []
  const handlerLines = methods.map((m) => {
    const s = served.schemas[m]!
    for (const alt of s.error?.anyOf ?? (s.error ? [s.error] : [])) {
      const tag = (alt.properties?._tag?.enum?.[0] as string | undefined)
      if (!tag) continue
      const { _tag, ...rest } = alt.properties!
      const cls = `${name}${tag}`
      if (!errorClasses.some((c) => c.startsWith(`export class ${cls} `))) errorClasses.push(`export class ${cls} extends ContractError<${JSON.stringify(tag)}, ${tsOf({ type: "object", properties: rest, required: (alt.required ?? []).filter((k) => k !== "_tag") })}> {}`)
    }
    const input = s.payload && s.payload.type !== "null" ? tsOf(s.payload) : "void"
    const out = s.success ? tsOf(s.success) : "void"
    return `  ${m}(input: ${input}, ctx: CallContext): ${s.stream ? `AsyncIterable<${out}>` : `Promise<${out}>`}`
  })
  const clients = (options.requested ?? []).map((r) => {
    const methodNames = r.methods ?? (r.contract ? Object.keys(r.contract.methods).sort() : [])
    const typed = r.contract && !r.contract.descriptor.local
    const api = typed ? `<readonly ${JSON.stringify(methodNames)}, { ${methodNames.map((m) => { const sp = schemasOf(r.contract!).schemas[m]; return `${m}(input: ${sp?.payload && sp.payload.type !== "null" ? tsOf(sp.payload) : "void"}): Promise<${sp?.success ? tsOf(sp.success) : "void"}>` }).join("; ")} }>` : ""
    return `export const ${baseName(r.serviceId)}Client = clientDef${api}(${JSON.stringify(r.serviceId)}, ${JSON.stringify(methodNames)} as const)`
  })
  return [
    `// Generated by \`bridger sdk generate\` from ${contract.descriptor.serviceId} version ${contract.version}. Do not edit.`,
    `// This module describes the contract the partner serves. It isolates nothing: where the partner's code runs, and what confines it, is the deployment's choice.`,
    `import { ContractError, clientDef, serveContract, type CallContext, type GuestEntry } from "@bridger/kit/sdk"`,
    `export type { CallContext, GuestEntry }`,
    `export { ContractError }`,
    ``,
    `export interface ${name}Handlers {`, ...handlerLines, `}`,
    ...(errorClasses.length ? ["", ...errorClasses] : []),
    ...(clients.length ? ["", ...clients] : []),
    ``,
    `export const contract = { serviceId: ${JSON.stringify(contract.descriptor.serviceId)}, version: ${JSON.stringify(contract.version)}, methods: ${JSON.stringify(methods)} as const } as const`,
    `export const descriptor = ${stableJson(contract.descriptor)} as const`,
    `const served = ${stableJson(served)}`,
    ``,
    `export function serve(handlers: ${name}Handlers, options?: { onUnexpected?: (method: string, thrown: unknown) => void }): GuestEntry {`,
    `  return serveContract(served as never, handlers as never, { ...options, requested: ${JSON.stringify((options.requested ?? []).map((r) => ({ serviceId: r.serviceId, ...(r.methods ? { methods: r.methods } : {}) })))} })`,
    `}`, ``
  ].join("\n")
}
