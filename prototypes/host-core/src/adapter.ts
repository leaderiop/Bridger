// A framework-neutral client over a host: the part of the UI adapters (docs/REACT-API.md, docs/FOLDKIT-API.md) that does not
// depend on a framework (improvement report 05 R9, DX-08). One subscription per client, the latest snapshot cached, pure
// selectors, calls under a lease, an idempotent dispose. A prototype for the shared scenarios in
// references/kit/appendices/c-ui-adapter-scenarios.md; real adapters implement the same interface and run the same list.
import { Effect, Exit, Option, Scope, Stream, SubscriptionRef, type Context } from "effect"
import type { HostClosed, LeaseRevoked, LeaseTimeout, ServiceUnavailable } from "./errors.js"
import type { Host, HostSnapshot } from "./host.js"

export type PluginStateName = HostSnapshot["plugins"][number]["state"] | "uninstalled"

export interface Client {
  /** `None` until the host's first snapshot arrives; a snapshot with no plugins is a snapshot. */
  readonly snapshot: Effect.Effect<Option.Option<HostSnapshot>>
  readonly changes: Stream.Stream<Option.Option<HostSnapshot>>
  readonly pluginState: (id: string) => Effect.Effect<PluginStateName>
  /** A rendering hint, not a reservation. */
  readonly isAvailable: (serviceId: string) => Effect.Effect<boolean>
  readonly use: <S, A, E>(key: Context.Key<any, S>, run: (service: S) => Effect.Effect<A, E>) => Effect.Effect<A, E | ServiceUnavailable | LeaseRevoked | LeaseTimeout | HostClosed>
  /** Idempotent: stops the subscription and refuses later calls; never closes the host. */
  readonly dispose: Effect.Effect<void>
}

type Source = Pick<Host, "changes" | "use">

export const makeClient = (host: Source): Effect.Effect<Client, never, Scope.Scope> => Effect.gen(function* () {
  const cache = yield* SubscriptionRef.make<Option.Option<HostSnapshot>>(Option.none())
  const scope = yield* Scope.make()
  let disposed = false
  // one subscription per client; every consumer reads the cache
  yield* Effect.forkIn(host.changes.pipe(Stream.runForEach((s) => SubscriptionRef.set(cache, Option.some(s)))), scope)
  yield* Effect.yieldNow
  const read = SubscriptionRef.get(cache)
  const dispose = Effect.suspend(() => disposed ? Effect.void : Effect.sync(() => { disposed = true }).pipe(Effect.andThen(Scope.close(scope, Exit.void))))
  yield* Effect.addFinalizer(() => dispose)
  return {
    snapshot: read,
    changes: SubscriptionRef.changes(cache),
    pluginState: (id) => Effect.map(read, (s) => Option.match(s, { onNone: () => "uninstalled" as const, onSome: (x) => x.plugins.find((p) => p.id === id)?.state ?? "uninstalled" as const })),
    isAvailable: (serviceId) => Effect.map(read, (s) => Option.isSome(s) && s.value.availableServiceIds.includes(serviceId)),
    use: (key, run) => Effect.suspend(() => disposed ? Effect.die("client disposed") : host.use(key, run) as never),
    dispose
  }
})
