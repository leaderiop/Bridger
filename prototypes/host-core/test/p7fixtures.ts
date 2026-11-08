// Shared fixtures of the P7 (round 2) scenarios — prototype, evidences no requirement.
import { Context, Effect, Exit, Layer } from "effect"
import { AuditSink, OperationGate, type AuditRecord } from "../src/gxp.js"
import type * as Host from "../src/host.js"
import * as Testing from "../src/testing.js"
import { withHost } from "./fixtures.js"
import { Contract } from "../src/contract.js"
import { lazy, type PluginManifest } from "../src/manifest.js"
import { define, type AnyPlugin } from "../src/plugin.js"

export const failedWith = (exit: Exit.Exit<unknown, unknown>, tag: string) => Exit.isFailure(exit) && JSON.stringify(exit.cause).includes(tag)
export const errorOf = (exit: Exit.Exit<unknown, unknown>): any => Exit.isFailure(exit) ? (exit.cause as any).reasons?.[0]?.error ?? JSON.parse(JSON.stringify(exit.cause)) : undefined

type AuditShape = { readonly append: (s: string) => Effect.Effect<string>; readonly query: Effect.Effect<number>; readonly tail?: Effect.Effect<string> }
export class AuditKey extends Context.Service<AuditKey, AuditShape>()("example/Audit@2") {}
export const m = Contract.method({})
export const Audit23 = Contract.make(AuditKey, { version: "2.3.0", methods: { append: m, query: m, tail: m } })
export const Audit21 = Contract.make(AuditKey, { version: "2.1.0", methods: { append: m, query: m } })   // a separately built, older copy
const impl: AuditShape = { append: (s) => Effect.succeed(s), query: Effect.succeed(1), tail: Effect.succeed("t") }

export const provider = (id: string, ref: any, version = "1") => define({
  id, requires: [] as const, provides: [ref] as const, meta: { version, digest: id + version },
  build: Layer.succeed(AuditKey, impl) as any
}) as unknown as AnyPlugin
export const dependent = (id: string, ref: any, seen?: Array<string>) => define({
  id, requires: [ref] as const, provides: [] as const,
  build: Layer.effectDiscard(Effect.gen(function* () { const a = yield* AuditKey; seen?.push(yield* a.append(id)) })) as any
}) as unknown as AnyPlugin


export class Reports extends Context.Service<Reports, { readonly run: Effect.Effect<string> }>()("example/Reports") {}
export class Store extends Context.Service<Store, { readonly get: Effect.Effect<number> }>()("example/Store") {}
export const reportsManifest: PluginManifest = {
  manifestVersion: 1, id: "reports", version: "1.0.0", provides: [{ serviceId: "example/Reports" }], requires: [],
  contributions: [{ registry: "example/price-change", id: "reports/guard", role: "veto" }],
  activation: [{ _tag: "OnEvent", eventId: "billing/invoice-posted" }], description: "Reports", "x-vendor": { keep: true }
}
export const reportsDef = (journal: Array<string> = [], extra: Partial<AnyPlugin> = {}) => define({
  id: "reports", requires: [] as const, provides: [Reports] as const, meta: { version: "1.0.0", digest: "sha-1" },
  build: Layer.effect(Reports, Effect.sync(() => { journal.push("reports:build"); return { run: Effect.succeed("r") } })), ...extra
}) as unknown as AnyPlugin
export const lazyReports = (load: Effect.Effect<AnyPlugin, unknown>, o: { digest?: string; manifest?: PluginManifest } = {}) =>
  lazy({ manifest: o.manifest ?? reportsManifest, load, digest: o.digest ?? "sha-1" })

export const rec = () => { const records: Array<AuditRecord> = []; const m = Effect.runSync(Testing.memoryAuditSink({ behave: (_n, r) => { records.push(r); return "store" } })); return { records, sink: m.sink } }
export const onHost = <A, E>(body: (h: Testing.TestHost) => Effect.Effect<A, E, import("effect").Scope.Scope>, o: { options?: Host.Options; layers?: ReadonlyArray<Layer.Layer<any>>; sink?: AuditSink["Service"]; gate?: OperationGate["Service"] } = {}) =>
  withHost(body, o.options, Layer.mergeAll(Testing.counterIdGenerator("id-"), ...(o.layers ?? []), o.sink ? Layer.succeed(AuditSink, o.sink) : Layer.empty, o.gate ? Layer.succeed(OperationGate, o.gate) : Layer.empty))
