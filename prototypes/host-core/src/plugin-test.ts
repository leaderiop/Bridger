// `PluginTest` and `it.plugin` of @bridger/kit/testing (references/kit behaviours 02, BEH-KT-009..013). Sugar over core's TestHost:
// nothing here defines scheduling, faults or time (INV-KT-002). Improvement report 05 follow-up.
import { Context, Effect, Fiber, Layer, Schema, type Scope } from "effect"
import { it as vitestIt } from "vitest"
import type { Actor } from "./gxp.js"
import { AuditSink, type AuditRecord } from "./gxp.js"
import type * as Host from "./host.js"
import { define, type AnyPlugin, type Keys } from "./plugin.js"
import * as Testing from "./testing.js"
import { ActivationFailed, type HostClosed, type ServiceUnavailable, type UnknownPlugin } from "./errors.js"

type Key = Context.Key<any, any>
type ShapeOf<K> = K extends Context.Key<any, infer S> ? S : never
type IdOf<K> = K extends Context.Key<infer I, any> ? I : string

export class MissingProvision extends Schema.TaggedError<MissingProvision>()("MissingProvision", { id: Schema.String, missingServiceIds: Schema.Array(Schema.String) }) {}
export class StubNotImplemented extends Error { readonly _tag = "StubNotImplemented"; constructor(readonly serviceId: string, readonly member: string) { super(`StubNotImplemented: ${serviceId}.${member}`) } }

declare const stubBrand: unique symbol
export interface Stub<K extends Key = Key> { readonly [stubBrand]: K; readonly plugin: AnyPlugin }
type Provision = AnyPlugin | Stub<any>

const stubPlugin = (key: Key, impl: unknown): Stub => ({ plugin: define({ id: `test-stub/${key.key}`, requires: [], provides: [key], build: Layer.succeed(key, impl as never) }) as unknown as AnyPlugin } as Stub)
/** A double that implements the whole service shape. */
export const stub = <K extends Key>(key: K, implementation: ShapeOf<K>): Stub<K> => stubPlugin(key, implementation) as Stub<K>
/** A double whose unimplemented members die with `StubNotImplemented` when called or read. */
export const partial = <K extends Key>(key: K, implementation: Partial<ShapeOf<K>>): Stub<K> =>
  stubPlugin(key, new Proxy(implementation as object, { get: (t, p) => p in t ? (t as any)[p] : typeof p === "symbol" ? undefined : (() => { throw new StubNotImplemented(key.key, String(p)) })() })) as Stub<K>

export const actor = (id: string, kind: Actor["kind"] = "user"): Actor => ({ id, kind })
export const context = (a: Actor, overrides: Record<string, unknown> = {}) => ({ context: { actor: a, ...overrides } })

export interface MountOptions<C = unknown> {
  readonly provide?: ReadonlyArray<Provision>
  readonly config?: C
  readonly realm?: string
  readonly host?: Host.Options
  readonly actor?: Actor
  readonly allowWaiting?: boolean
}
export interface Mounted {
  readonly host: Testing.TestHost
  readonly use: <K extends Key, A, E>(key: K, f: (service: ShapeOf<K>) => Effect.Effect<A, E>) => Effect.Effect<A, E | ServiceUnavailable>
  readonly inspect: Effect.Effect<Host.PluginInspection, UnknownPlugin | HostClosed>
  readonly audit: { readonly records: Effect.Effect<ReadonlyArray<AuditRecord>> }
  readonly closeReports: Array<Host.CloseReport>
}

/** Runs `op` on the TestHost, stepping it until the operation settles (a TestHost advances only when stepped). */
const drive = <A, E>(host: Testing.TestHost, op: Effect.Effect<A, E>): Effect.Effect<A, E> => Effect.gen(function* () {
  const fiber = yield* Effect.forkChild(op)
  while (fiber.pollUnsafe() === undefined) if (!(yield* host.step)) yield* Effect.yieldNow
  return yield* Fiber.join(fiber)
})
export const mountOn = (host: Testing.TestHost) => ({ drive: <A, E>(op: Effect.Effect<A, E>) => drive(host, op) })

export const mount = <P extends AnyPlugin>(plugin: P, options: MountOptions = {}) => Effect.gen(function* () {
  const records: Array<AuditRecord> = []
  const memory = yield* Testing.memoryAuditSink({ behave: (_n, r) => { records.push(r); return "store" } })
  const closeReports: Array<Host.CloseReport> = []
  const host = yield* Testing.make({ drainTimeout: 200, shutdownTimeout: 300, auditTimeout: 50, ...options.host, onClose: (r) => Effect.sync(() => { closeReports.push(r) }) }).pipe(
    Effect.provide(Testing.counterIdGenerator("test-")), Effect.provideService(AuditSink, memory.sink))
  const who = context(options.actor ?? actor("test"), { correlationId: "mount" })
  const ro = options.realm ? { realm: options.realm } : {}
  for (const p of options.provide ?? []) yield* drive(host, host.install((p as Stub).plugin ?? (p as AnyPlugin), { ...who, ...ro }))
  yield* drive(host, host.install(plugin, { ...who, ...ro, ...(options.config !== undefined ? { config: options.config } : {}) }))
  yield* drive(host, host.awaitIdle)
  const mounted: Mounted = {
    host, closeReports,
    use: (key, f) => host.use(key, f as never) as never,
    inspect: host.inspect(plugin.id),
    audit: { records: Effect.sync(() => [...records]) }
  }
  const state = (yield* host.snapshot).plugins.find((p) => p.id === plugin.id)
  if (state?.state === "failed") return yield* Effect.fail(new ActivationFailed({ id: plugin.id, phase: (state as any).phase ?? "build", message: (state as any).message ?? "failed" }))
  if (state?.state === "waiting" && !options.allowWaiting) {
    const i = yield* host.inspect(plugin.id)
    const available = (yield* host.snapshot).availableServiceIds
    return yield* Effect.fail(new MissingProvision({ id: plugin.id, missingServiceIds: i.requires.filter((r) => !available.includes(r)) }))
  }
  return mounted
})

/** The body of an `it.plugin` case, as an effect: mount, run the body, then check leases, unexpected failures and a clean shutdown (BEH-KT-011). */
export const pluginCase = (subject: AnyPlugin, options: MountOptions & { readonly expectFailed?: ReadonlyArray<string> }, body: (t: Mounted) => Effect.Effect<void, unknown, Scope.Scope>) => {
  const expected = new Set(options.expectFailed ?? [])
  return Effect.gen(function* () {
    const reports: Array<Host.CloseReport> = []
    yield* Effect.scoped(Effect.gen(function* () {
      const t = yield* mount(subject, options)
      yield* body(t)
      yield* drive(t.host, t.host.awaitIdle)
      for (const p of (yield* t.host.snapshot).plugins) {
        const i = yield* t.host.inspect({ id: p.id, realm: p.realm })
        if (i.leases > 0) return yield* Effect.die(new Error(`it.plugin: ${p.id} still holds ${i.leases} lease(s) when the test ends`))
        if (p.state === "failed" && !expected.has(p.id)) return yield* Effect.die(new Error(`it.plugin: ${p.id} is failed and not listed in expectFailed`))
      }
      yield* Effect.addFinalizer(() => Effect.sync(() => { reports.push(...t.closeReports) }))
    }))
    for (const r of reports) for (const f of (r as any).failed ?? []) if (!(f.cause === "cleanup" && expected.has(f.id))) yield* Effect.die(new Error(`it.plugin: shutdown failed for ${f.id} (${f.cause})`))
  })
}
export const plugin = <P extends AnyPlugin>(name: string, subject: P, options: MountOptions & { readonly expectFailed?: ReadonlyArray<string> }, body: (t: Mounted) => Effect.Effect<void, unknown, Scope.Scope>): void => {
  vitestIt(name, () => Effect.runPromise(pluginCase(subject, options, body)))
}
export const PluginTest = { mount, stub, partial, actor, context, plugin }
export type { IdOf, Keys }
