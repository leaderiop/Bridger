// `@bridger/react` (docs/REACT-API.md): a client over a host the adapter owns, and the hooks that read it. Built on the framework-neutral
// client of adapter.ts, so the ten scenarios of kit appendix C hold for it. No JSX: components are built with `createElement`.
import { createContext, createElement, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react"
import { Effect, Exit, Option, Scope, Stream, type Context } from "effect"
import { makeClient, type Client, type PluginStateName } from "./adapter.js"
import { ActivationFailed } from "./errors.js"
import * as Host from "./host.js"
import type { HostSnapshot, PluginSnapshot } from "./host.js"
import { CurrentCorrelation } from "./policy.js"
import type { AnyPlugin } from "./plugin.js"

const ACTOR = { id: "bridger-react", kind: "service" as const }
export interface ClientOptions {
  readonly plugins?: ReadonlyArray<AnyPlugin>
  readonly host?: Host.Options
  /** A host the application owns: observed and called, never installed into or shut down by this client. */
  readonly over?: Pick<Host.Host, "changes" | "use"> & Partial<Host.Host>
}
export interface BridgerClient {
  readonly host: Host.Host
  readonly snapshot: () => HostSnapshot | undefined
  readonly subscribe: (listener: () => void) => () => void
  readonly install: (plugin: AnyPlugin, options?: { readonly context?: { readonly actor: { readonly id: string; readonly kind: "user" | "service" | "system" }; readonly reason?: string } }) => Promise<void>
  readonly remove: (id: string, options?: { readonly context?: { readonly actor: { readonly id: string; readonly kind: "user" | "service" | "system" }; readonly reason?: string } }) => Promise<void>
  readonly awaitIdle: () => Promise<void>
  readonly use: <S, A, E>(key: Context.Key<any, S>, run: (service: S) => Effect.Effect<A, E>, options?: { readonly correlationId?: string }) => Promise<A>
  readonly dispose: () => Promise<void>
}
let seq = 0
const nextId = () => `react-${++seq}`

/** Starts a host, registers the definitions, observes it, and resolves once the current transitions settle (REACT-API §1). */
export const createBridgerClient = async (options: ClientOptions = {}): Promise<BridgerClient> => {
  const scope = Effect.runSync(Scope.make())
  const listeners = new Set<() => void>()
  let latest: HostSnapshot | undefined
  let inner!: Client
  let disposed = false
  const ctx = { context: { actor: ACTOR, reason: "client start" } }
  const start = Effect.gen(function* () {
    const host = (options.over ?? (yield* Host.make({ ...options.host }))) as Host.Host
    inner = yield* makeClient(host)
    yield* Effect.forkIn(inner.changes.pipe(Stream.runForEach((s) => Effect.sync(() => { if (Option.isSome(s)) { latest = s.value; for (const l of listeners) l() } }))), scope)
    if (!options.over) { for (const p of options.plugins ?? []) yield* host.install(p, ctx); yield* host.awaitIdle }
    return host
  })
  let host: Host.Host
  try { host = await Effect.runPromise(start.pipe(Scope.provide(scope))) } catch (e) { await Effect.runPromise(Scope.close(scope, Exit.void)); throw e }
  const initial = options.over && !options.over.snapshot ? undefined : await Effect.runPromise(host.snapshot)
  const failed = (initial?.plugins ?? []).flatMap((p) => p.state === "failed" ? [{ id: p.id, phase: p.failure.phase, message: p.failure.message }] : [])
  const client: BridgerClient = {
    host,
    snapshot: () => latest,
    subscribe: (l) => { listeners.add(l); return () => { listeners.delete(l) } },
    install: (plugin, o) => Effect.runPromise(host.install(plugin, { context: o?.context ?? ctx.context }).pipe(Effect.asVoid) as Effect.Effect<void>),
    remove: (id, o) => Effect.runPromise(host.remove(id, { context: o?.context ?? ctx.context }).pipe(Effect.asVoid) as Effect.Effect<void>),
    awaitIdle: () => Effect.runPromise(host.awaitIdle.pipe(Effect.asVoid)),
    use: async (key, run, o) => {
      if (disposed) throw new Error("client disposed")
      const exit = await Effect.runPromiseExit(inner.use(key, run).pipe(CurrentCorrelation.with(o?.correlationId ?? nextId())))
      if (Exit.isSuccess(exit)) return exit.value
      const c = exit.cause as unknown as { failures?: ReadonlyArray<{ error?: unknown }>; reasons?: ReadonlyArray<{ error?: unknown; defect?: unknown }> }
      throw c.failures?.[0]?.error ?? c.reasons?.find((r) => r.error !== undefined)?.error ?? c.reasons?.find((r) => r.defect !== undefined)?.defect ?? new Error("the action failed")
    },
    dispose: async () => {
      if (disposed) return
      disposed = true
      await Effect.runPromise(inner.dispose)
      if (!options.over) await Effect.runPromise(host.shutdown({ context: { actor: ACTOR, reason: "client dispose" } }).pipe(Effect.ignore))
      await Effect.runPromise(Scope.close(scope, Exit.void))
    }
  }
  if (failed.length) { await client.dispose(); throw new ActivationFailed(failed[0]!) }
  if (initial && (latest === undefined || latest.revision <= initial.revision)) latest = initial
  return client
}

// ------------------------------------------------------------------------------------------------ React
const BridgerContext = createContext<BridgerClient | undefined>(undefined)
/** Exposes an existing client; mounting or unmounting it installs and disposes nothing. */
export const BridgerProvider = (props: { readonly client: BridgerClient; readonly children?: ReactNode }) => createElement(BridgerContext.Provider, { value: props.client }, props.children)
export const useBridgerClient = (): BridgerClient => {
  const c = useContext(BridgerContext)
  if (!c) throw new Error("useBridgerClient: no BridgerProvider above this component")
  return c
}

const UNINSTALLED = { state: "uninstalled" as const }
export type PluginState = PluginSnapshot | typeof UNINSTALLED
/** The lifecycle snapshot of one plugin: the seven core states, or `uninstalled` (REACT-API §3). */
export const usePluginState = (id: string): PluginState => {
  const client = useBridgerClient()
  return useSyncExternalStore(client.subscribe, () => client.snapshot()?.plugins.find((p) => p.id === id) ?? UNINSTALLED)
}
const availableOf = (client: BridgerClient, serviceId: string) => client.snapshot()?.availableServiceIds.includes(serviceId) ?? false

export interface ServiceAction<Args extends ReadonlyArray<unknown>, A> {
  readonly available: boolean
  readonly pending: boolean
  readonly data: A | undefined
  readonly error: { readonly message: string; readonly cause: unknown } | undefined
  readonly correlationId: string | undefined
  readonly run: (...args: Args) => void
}
/** One action at a time, run inside a lease; `available` is a hint, not a reservation (REACT-API §2). */
export const useServiceAction = <S, A, E, Args extends ReadonlyArray<unknown>>(key: Context.Key<any, S>, fn: (service: S, ...args: Args) => Effect.Effect<A, E>, options: { readonly correlationId?: string } = {}): ServiceAction<Args, A> => {
  const client = useBridgerClient()
  const available = useSyncExternalStore(client.subscribe, () => availableOf(client, key.key))
  const [state, setState] = useState<{ pending: boolean; data: A | undefined; error: ServiceAction<Args, A>["error"]; correlationId: string | undefined }>({ pending: false, data: undefined, error: undefined, correlationId: undefined })
  const mounted = useRef(true)
  const pending = useRef(false)
  const latestFn = useRef(fn)
  latestFn.current = fn
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => { setState({ pending: false, data: undefined, error: undefined, correlationId: undefined }) }, [client, key])
  const run = useCallback((...args: Args) => {
    if (pending.current) return
    pending.current = true
    const correlationId = options.correlationId ?? nextId()
    setState({ pending: true, data: undefined, error: undefined, correlationId })
    client.use(key, (s) => latestFn.current(s, ...args), { correlationId }).then(
      (data) => { pending.current = false; if (mounted.current) setState({ pending: false, data, error: undefined, correlationId }) },
      (cause: unknown) => { pending.current = false; if (mounted.current) setState({ pending: false, data: undefined, error: { message: (cause as { message?: string; _tag?: string })?.message ?? (cause as { _tag?: string })?._tag ?? String(cause), cause }, correlationId }) }
    )
  }, [client, key, options.correlationId])
  return { available, ...state, run }
}
export type { PluginStateName }
