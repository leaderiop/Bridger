import { Context, Effect, Fiber, Layer, type Scope } from "effect"
import type { AuditRecord, OperationRequest } from "../src/gxp.js"
import * as Host from "../src/host.js"
import { define } from "../src/plugin.js"
import * as Testing from "../src/testing.js"

export class Logger extends Context.Service<Logger, { readonly log: (m: string) => Effect.Effect<void> }>()("example/Logger") {}
export class Audit extends Context.Service<Audit, { readonly record: (e: string) => Effect.Effect<void> }>()("example/Audit") {}
export class Report extends Context.Service<Report, { readonly run: Effect.Effect<string> }>()("example/Report") {}

/** A shared, ordered log of lifecycle events observed by the fixtures. */
export const journal = () => {
  const lines: Array<string> = []
  return { lines, push: (l: string) => Effect.sync(() => { lines.push(l) }) }
}
export type Journal = ReturnType<typeof journal>

export const loggerPlugin = (j: Journal, opts: { failCleanup?: boolean; buildDelay?: number; version?: string } = {}) => define({
  id: "example/logger",
  requires: [] as const,
  provides: [Logger] as const,
  meta: { version: opts.version ?? "1" },
  build: Layer.effect(Logger, Effect.gen(function* () {
    yield* j.push("logger:build")
    if (opts.buildDelay) yield* Effect.sleep(opts.buildDelay)
    yield* Effect.addFinalizer(() => opts.failCleanup ? Effect.die(new Error("sink close failed")) : j.push("logger:close"))
    return { log: (m: string) => j.push(`log:${m}`) }
  }))
})

export const auditPlugin = (j: Journal) => define({
  id: "example/audit",
  requires: [Logger] as const,
  provides: [Audit] as const,
  build: Layer.effect(Audit, Effect.gen(function* () {
    const log = yield* Logger
    yield* j.push("audit:build")
    // The spatial guarantee: Audit's finalizer still uses its captured Logger.
    yield* Effect.addFinalizer(() => log.log("audit-finalizer").pipe(Effect.andThen(j.push("audit:close"))))
    return { record: (e: string) => log.log(`audit:${e}`) }
  }))
})

export const reportPlugin = (j: Journal) => define({
  id: "example/report",
  requires: [Audit] as const,
  provides: [Report] as const,
  build: Layer.effect(Report, Effect.gen(function* () {
    const audit = yield* Audit
    yield* j.push("report:build")
    yield* Effect.addFinalizer(() => j.push("report:close"))
    return { run: audit.record("report").pipe(Effect.as("ok")) }
  }))
})

/** Short drain and shutdown limits, so a test that leaves a lease held closes its host quickly (BEH-BR-105, 108). */
export const quickClose = { drainTimeout: 200, shutdownTimeout: 300 } as const

/**
 * Runs a test body with a fresh TestHost inside a scope (BEH-BR-183): no transition advances unless stepped.
 * `ports` supplies the testing entry point's sink, gate or identifiers, or a TestClock (BEH-BR-179, 181, 182).
 */
export const withHost = <A, E>(body: (host: Testing.TestHost) => Effect.Effect<A, E, Scope.Scope>, options?: Host.Options, ports?: Layer.Layer<any>) => {
  const program = Effect.scoped(Effect.gen(function* () {
    const host = yield* Testing.make({ ...quickClose, auditTimeout: 50, ...options })
    return yield* body(host)
  }))
  // Provided to the whole test, so a TestClock among the ports is the one the body adjusts.
  return Effect.runPromise(ports ? program.pipe(Effect.provide(ports)) as typeof program : program)
}
type Behave = NonNullable<NonNullable<Parameters<typeof Testing.memoryAuditSink>[0]>["behave"]>
/** The testing entry point's in-memory sink (BEH-BR-181), with a live array of what it stored. */
export const memorySink = (behave: Behave = () => "store") => {
  const records: Array<AuditRecord> = []
  const m = Effect.runSync(Testing.memoryAuditSink({ behave: (n, r) => {
    const out = behave(n, r)
    if (out === "store" || out === "store-and-hang") records.push(r)
    return out
  } }))
  return { ...m, records }
}
/** The testing entry point's scripted gate (BEH-BR-182), with a live array of what it was asked. */
export const scriptedGate = (decide: Parameters<typeof Testing.scriptedGate>[0]) => {
  const requests: Array<OperationRequest> = []
  const g = Effect.runSync(Testing.scriptedGate((r, i) => { requests.push(r); return decide(r, i) }))
  return { ...g, requests }
}

/**
 * The stepping form of a call (BEH-BR-178): fork it, step the host until the call settles, then join it. While
 * nothing can be stepped the call is waiting on a lease or the clock; the loop only yields (`step` itself waits
 * for a settlement point), so it reads no clock and works under TestClock.
 */
export const drive = <A, E>(host: Testing.TestHost, op: Effect.Effect<A, E>): Effect.Effect<A, E> => Effect.gen(function* () {
  const fiber = yield* Effect.forkChild(op)
  while (fiber.pollUnsafe() === undefined) if (!(yield* host.step)) yield* Effect.yieldNow
  return yield* Fiber.join(fiber)
})
/** `awaitIdle` in its stepping form. */
export const idle = (host: Testing.TestHost) => drive(host, host.awaitIdle)

export const stateOf = (host: Host.Host, id: string) =>
  Effect.map(host.snapshot, (s) => s.plugins.find((p) => p.id === id)?.state ?? "uninstalled")
