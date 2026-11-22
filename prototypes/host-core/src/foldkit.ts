// `@bridger/foldkit` (docs/FOLDKIT-API.md): the Bridger side of the adapter, in Effect only: a resource Layer that owns a host, `use` for
// Commands, `changes` for Subscriptions, a `Snapshot` schema for the Model and pure selectors. FoldKit's own runtime is not imported; the
// application passes `layer` as its `resources`. Built on the framework-neutral client of adapter.ts (kit appendix C).
import { Context, Effect, Layer, Option, Schema, Stream } from "effect"
import { makeClient, type Client, type PluginStateName } from "./adapter.js"
import { ActivationFailed } from "./errors.js"
import * as Host from "./host.js"
import type { HostSnapshot } from "./host.js"
import type { AnyPlugin } from "./plugin.js"

/** What the Model keeps of a snapshot: data only, never live services (FOLDKIT-API §2). */
export const Snapshot = Schema.Struct({
  revision: Schema.Number,
  plugins: Schema.Array(Schema.Struct({ id: Schema.String, realm: Schema.String, state: Schema.String, missingServiceIds: Schema.optionalKey(Schema.Array(Schema.String)) })),
  availableServiceIds: Schema.Array(Schema.String)
})
export type Snapshot = typeof Snapshot.Type
const toSnapshot = (s: HostSnapshot): Snapshot => ({
  revision: s.revision, availableServiceIds: s.availableServiceIds,
  plugins: s.plugins.map((p) => ({ id: p.id, realm: p.realm, state: p.state, ...("missingServiceIds" in p ? { missingServiceIds: p.missingServiceIds } : {}) }))
})

export class BridgerHost extends Context.Service<BridgerHost, { readonly host: Host.Host; readonly client: Client }>()("@bridger/foldkit/Host") {}
const ACTOR = { id: "bridger-foldkit", kind: "service" as const }

/** Owns a host for the resource scope: registers the plugins, awaits runnable transitions, fails the layer on an initial activation failure. */
export const layer = (options: { readonly plugins?: ReadonlyArray<AnyPlugin>; readonly host?: Host.Options } = {}): Layer.Layer<BridgerHost, unknown> => Layer.effect(BridgerHost, Effect.gen(function* () {
  const host = yield* Host.make({ ...options.host })
  const client = yield* makeClient(host)
  for (const p of options.plugins ?? []) yield* host.install(p, { context: { actor: ACTOR, reason: "resource start" } })
  yield* host.awaitIdle
  const failed = (yield* host.snapshot).plugins.flatMap((p) => p.state === "failed" ? [{ id: p.id, phase: p.failure.phase, message: p.failure.message }] : [])
  if (failed.length) return yield* Effect.fail(new ActivationFailed(failed[0]!))
  return { host, client }
}))

/** A named Command's call: a leased `host.use` (FOLDKIT-API §3). */
export const use = <S, A, E>(key: Context.Key<any, S>, run: (service: S) => Effect.Effect<A, E>) => Effect.flatMap(Effect.service(BridgerHost), ({ client }) => client.use(key, run))
/** The Subscription's stream: `Option.none` until the first snapshot, then data-only snapshots, latest wins. */
export const changes: Stream.Stream<Option.Option<Snapshot>, never, BridgerHost> = Stream.unwrap(Effect.map(Effect.service(BridgerHost), ({ client }) => client.changes.pipe(Stream.map(Option.map(toSnapshot)))))

export const pluginState = (snapshot: Option.Option<Snapshot>, id: string): PluginStateName =>
  Option.match(snapshot, { onNone: () => "uninstalled" as const, onSome: (s) => (s.plugins.find((p) => p.id === id)?.state ?? "uninstalled") as PluginStateName })
export const isAvailable = (snapshot: Option.Option<Snapshot>, serviceId: string): boolean => Option.isSome(snapshot) && snapshot.value.availableServiceIds.includes(serviceId)

export const BridgerFoldkit = { layer, use, changes, Snapshot, Host: BridgerHost, pluginState, isAvailable } as const
