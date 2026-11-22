// Conformance kits (references/kit behaviours 03, BEH-KT-017..022): suites bound to one contract version, `verify` over a plugin, a guest
// entry or an HTTP endpoint. A pass comes only from executed cases (INV-KT-005): there is no "skipped" outcome.
// shortcut: no Contract.local in the prototype, so the LocalContractRefused refusals are not built; `http` posts JSON to `<url>/<method>`
// (the remote companion's HTTP binding has no code here); stream methods are checked for plugin subjects only.
import { Effect, Schema, Stream, type Scope } from "effect"
import type { Contract, ContractDescriptor } from "./contract.js"
import { parseVersion } from "./contract.js"
import { rng, sample, validate, type Json } from "./jsonschema.js"
import type { AnyPlugin } from "./plugin.js"
import { mount, type MountOptions } from "./plugin-test.js"
import { schemasOf, type GuestEntry, type WireResult } from "./sdk.js"

export class CaseFailed extends Schema.TaggedError<CaseFailed>()("CaseFailed", { id: Schema.String, message: Schema.String }) {}
export class ConformanceFailed extends Schema.TaggedError<ConformanceFailed>()("ConformanceFailed", { serviceId: Schema.String, version: Schema.String, failed: Schema.Array(Schema.String) }) {}
export class SuiteVersionMismatch extends Schema.TaggedError<SuiteVersionMismatch>()("SuiteVersionMismatch", { serviceId: Schema.String, provided: Schema.optionalKey(Schema.String), suites: Schema.Array(Schema.String) }) {}

export interface Case { readonly id: string; readonly since: string; readonly method?: string; readonly run: (client: Record<string, (payload: any) => Effect.Effect<any, unknown>>) => Effect.Effect<void, CaseFailed> }
export interface Suite { readonly contract: ContractDescriptor; readonly contractRef: Contract; readonly samples: number; readonly cases: ReadonlyArray<Case> }
export interface HttpSubject { readonly kind: "http"; readonly url: string; readonly contract: Contract; readonly timeout: number; readonly headers?: Readonly<Record<string, string>> }
export interface GuestSubject { readonly kind: "guest"; readonly entry: GuestEntry; readonly contract: Contract }
export interface ConformanceReport {
  readonly kitVersion: string
  readonly contract: ContractDescriptor
  readonly subject: { readonly kind: "plugin" | "http" | "guest"; readonly id: string }
  readonly seed: number
  readonly cases: ReadonlyArray<{ readonly suite: string; readonly id: string; readonly method?: string; readonly outcome: "passed" | "failed"; readonly message?: string }>
}

export const suite = (contract: Contract, spec: { readonly generated?: { readonly samples: number }; readonly cases?: ReadonlyArray<Case> } = {}): Suite => {
  for (const c of spec.cases ?? []) if (compare(c.since, contract.version) > 0) throw new Error(`case ${c.id}: since ${c.since} is above the suite's version ${contract.version}`)
  return { contract: contract.descriptor, contractRef: contract, samples: spec.generated?.samples ?? 25, cases: spec.cases ?? [] }
}
const compare = (a: string, b: string) => { const x = parseVersion(a)!, y = parseVersion(b)!; return x[0] - y[0] || x[1] - y[1] || x[2] - y[2] }

export const http = (url: string, options: { readonly contract: Contract; readonly timeout: number | string; readonly headers?: Record<string, string> }): HttpSubject => ({
  kind: "http", url, contract: options.contract, timeout: typeof options.timeout === "number" ? options.timeout : Number.parseFloat(options.timeout) * (/second/.test(options.timeout) ? 1000 : 1), ...(options.headers ? { headers: options.headers } : {})
})
export const guest = (entry: GuestEntry, contract: Contract): GuestSubject => ({ kind: "guest", entry, contract })

type Caller = (method: string, encoded: Json) => Effect.Effect<WireResult, unknown>
const asResult = (e: Effect.Effect<WireResult, unknown>) => e

export const verify = (subject: AnyPlugin | HttpSubject | GuestSubject, suites: ReadonlyArray<Suite>, options: MountOptions & { readonly seed?: number } = {}): Effect.Effect<ConformanceReport, ConformanceFailed | SuiteVersionMismatch | unknown, Scope.Scope> => Effect.gen(function* () {
  const seed = options.seed ?? 1
  const first = suites[0]
  const serviceId = first?.contract.serviceId ?? "<none>"
  const isPlugin = (s: unknown): s is AnyPlugin => !("kind" in (s as object))
  const contract = first?.contractRef
  // the version the subject provides
  let provided: string | undefined
  if (isPlugin(subject)) {
    const p = (subject.provides as ReadonlyArray<any>).find((k) => (k.contract?.descriptor?.serviceId ?? k.descriptor?.serviceId ?? k.key) === serviceId)
    provided = p ? (p.version ?? p.contract?.version ?? p.descriptor?.version ?? first?.contract.version) : undefined
  } else provided = subject.contract.version
  const selected = provided === undefined ? [] : suites.filter((s) => s.contract.serviceId === serviceId && parseVersion(s.contract.version)![0] === parseVersion(provided!)![0] && compare(s.contract.version, provided!) <= 0)
  if (selected.length === 0) return yield* Effect.fail(new SuiteVersionMismatch({ serviceId, ...(provided ? { provided } : {}), suites: suites.map((s) => s.contract.version) }))

  let call: Caller, client: Record<string, (payload: any) => Effect.Effect<any, unknown>>
  const methodsOf = (s: Suite) => s.contractRef.methods
  if (isPlugin(subject)) {
    const t = yield* mount(subject, options)
    const key = contract!.contractKey
    const decodeIn = (m: string, enc: Json) => { const sp = contract!.methods[m]!.payload; return sp ? Schema.decodeUnknownSync(sp as never)(enc) : enc }
    call = (m, enc) => Effect.gen(function* () {
      const spec = contract!.methods[m]!
      const exit = yield* Effect.exit(t.use(key as never, (svc: any) => spec.stream ? Stream.runCollect(Stream.take((svc[m](decodeIn(m, enc)) as Stream.Stream<any, any>), 10)) : svc[m](decodeIn(m, enc))))
      if (exit._tag === "Success") {
        const v = exit.value as any
        const enc2 = spec.stream ? (v as ReadonlyArray<unknown>).map((x) => spec.success ? Schema.encodeUnknownSync(spec.success as never)(x) : x) : (spec.success ? Schema.encodeUnknownSync(spec.success as never)(v) : v ?? null)
        return spec.stream ? { ok: true, stream: (async function* () { for (const x of enc2 as Array<Json>) yield x })() } as WireResult : { ok: true, value: enc2 as Json } as WireResult
      }
      const failure = (exit.cause as any).failures?.[0]?.error ?? (exit.cause as any).reasons?.[0]?.error
      if (failure !== undefined && spec.error) { try { return { ok: false, failure: Schema.encodeUnknownSync(spec.error as never)(failure) as never } } catch { /* fall through */ } }
      return yield* Effect.fail(new Error("the call failed with something other than a declared error"))
    })
  } else if (subject.kind === "guest") {
    call = (m, enc) => Effect.promise(() => subject.entry.call(m, enc))
  } else {
    call = (m, enc) => Effect.tryPromise(async () => {
      const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), subject.timeout)
      try {
        const res = await fetch(`${subject.url.replace(/\/$/, "")}/${m}`, { method: "POST", headers: { "content-type": "application/json", ...subject.headers }, body: JSON.stringify(enc), signal: ctl.signal })
        const body = await res.json() as Json
        return res.ok ? { ok: true, value: body } as WireResult : { ok: false, failure: body as never } as WireResult
      } finally { clearTimeout(timer) }
    })
  }
  client = new Proxy({}, { get: (_t, m: string) => (payload: unknown) => Effect.flatMap(asResult(call(m, payload as Json)), (r) => r.ok ? Effect.succeed("value" in r ? r.value : null) : Effect.fail(r.failure)) })

  const report: Array<ConformanceReport["cases"][number]> = []
  const next = rng(seed)
  for (const s of selected) {
    const schemas = schemasOf(s.contractRef).schemas
    for (const m of methodsOf(s) ? Object.keys(methodsOf(s)).sort() : []) {
      const sc = schemas[m]!
      let message: string | undefined
      for (let i = 0; i < s.samples && !message; i++) {
        const payload = sc.payload ? sample(sc.payload, next) : null
        const r = yield* Effect.exit(call(m, payload))
        if (r._tag === "Failure") { message = `call ${i + 1} did not return a result or a typed failure`; break }
        const w = r.value
        if (!w.ok) { const f = w.failure; message = f._tag === "SdkDecodeFailed" || f._tag === "SdkUndeclaredFailure" ? `call ${i + 1}: ${f._tag}` : sc.error ? validate(sc.error, f) : "undeclared failure" }
        else if ("stream" in w) { const items: Array<Json> = []; yield* Effect.promise(async () => { for await (const x of w.stream) items.push(x) }); message = sc.success ? items.map((x) => validate(sc.success!, x)).find((e) => e) : undefined }
        else message = sc.success ? validate(sc.success, w.value) : undefined
      }
      report.push({ suite: s.contract.version, id: `generated:${m}`, method: m, outcome: message ? "failed" : "passed", ...(message ? { message } : {}) })
    }
    for (const c of s.cases) {
      const r = yield* Effect.exit(c.run(client))
      report.push({ suite: s.contract.version, id: c.id, ...(c.method ? { method: c.method } : {}), outcome: r._tag === "Success" ? "passed" : "failed", ...(r._tag === "Failure" ? { message: String((r.cause as any).failures?.[0]?.error?.message ?? "case failed") } : {}) })
    }
  }
  const out: ConformanceReport = { kitVersion: "0.0.0-prototype", contract: contract!.descriptor, subject: { kind: isPlugin(subject) ? "plugin" : subject.kind, id: isPlugin(subject) ? subject.id : subject.contract.descriptor.serviceId }, seed, cases: report }
  const failed = report.filter((c) => c.outcome === "failed").map((c) => c.id)
  if (failed.length) return yield* Effect.fail(Object.assign(new ConformanceFailed({ serviceId, version: provided!, failed }), { report: out }))
  return out
})

export const Conformance = { suite, verify, http, guest }
