import { Context, Effect, Layer } from "effect"
import * as Host from "../src/host.js"
import { define } from "../src/plugin.js"

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

/** Runs a test body with a fresh host inside a scope. */
export const withHost = <A, E>(body: (host: Host.Host) => Effect.Effect<A, E>, options?: Host.Options) =>
  Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const host = yield* Host.make(options)
    return yield* body(host)
  })))

export const stateOf = (host: Host.Host, id: string) =>
  Effect.map(host.snapshot, (s) => s.plugins.find((p) => p.id === id)?.state ?? "uninstalled")
