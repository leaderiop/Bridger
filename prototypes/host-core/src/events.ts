// Host.events (references/core behaviour 13): a lossy diagnostic feed, not an audit trail.
import { Clock, Effect, PubSub, Stream } from "effect"

export type HostEventBody =
  | { readonly type: "plugin-installed" }
  | { readonly type: "plugin-removed" }
  | { readonly type: "build-started" }
  | { readonly type: "build-finished"; readonly durationMs: number; readonly outcome: "success" | "failure" | "interrupted" }
  | { readonly type: "state-changed"; readonly from: string; readonly to: string; readonly reason?: string }
  | { readonly type: "runtime-failure"; readonly message: string }
  | { readonly type: "lease-revoked"; readonly leases: number }
  | { readonly type: "drain-timeout"; readonly leases: number; readonly target?: string }
  | { readonly type: "stop-parked"; readonly leases: number; readonly target?: string }
  | { readonly type: "stop-resumed"; readonly by: "operator" | "cascade" | "shutdown"; readonly endsIntent?: string }
  | { readonly type: "config-rejected"; readonly message: string }
  | { readonly type: "config-updated"; readonly paths: ReadonlyArray<string> }
  | { readonly type: "closed" }
  | { readonly type: "audit-degraded"; readonly message: string }
  | { readonly type: "audit-acknowledged" }
  | { readonly type: "listener-failed"; readonly event: string; readonly message: string }

export type HostEvent = { readonly hostId: string; readonly seq: number; readonly timestamp: string; readonly pluginId?: string } & HostEventBody

/** `seq` starts at 1 and steps by one per published event (BEH-BR-115); the PubSub drops oldest per subscriber. */
export const makeEvents = (hostId: string, capacity: number) => Effect.gen(function* () {
  const pubsub = yield* PubSub.sliding<HostEvent>(capacity)
  let seq = 0
  const emit = (body: HostEventBody, pluginId?: string) => Effect.gen(function* () {
    const timestamp = new Date(yield* Clock.currentTimeMillis).toISOString()
    seq++
    yield* PubSub.publish(pubsub, { ...body, hostId, seq, timestamp, ...(pluginId !== undefined ? { pluginId } : {}) } as HostEvent)
  })
  return { emit, stream: Stream.fromPubSub(pubsub), close: PubSub.shutdown(pubsub) }
})
