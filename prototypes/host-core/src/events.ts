// Host.events (references/core behaviour 13): a lossy diagnostic feed, not an audit trail.
import { Clock, Effect, PubSub, Stream } from "effect"

export type StateTrigger = "operator" | "system" | "provider-return" | "dependency-loss" | "runtime-failure" | "shutdown"
/** Fields the host adds to every event (report 01, R3/R7): the snapshot revision, the activation, the causing event. */
export type EventExtra = { readonly revision?: number; readonly activation?: number; readonly causeSeq?: number }

export type HostEventBody =
  | { readonly type: "plugin-installed" }
  | { readonly type: "handoff-imported" }
  | { readonly type: "handoff-lost"; readonly tag: string }
  | { readonly type: "plugin-triggered"; readonly trigger: { readonly _tag: string } }
  | { readonly type: "reconcile-partial"; readonly scope: string; readonly correlationId: string; readonly notUndone: ReadonlyArray<{ readonly id: string; readonly realm: string; readonly action: string }> }
  | { readonly type: "plugin-removed" }
  | { readonly type: "build-started" }
  | { readonly type: "build-finished"; readonly durationMs: number; readonly outcome: "success" | "failure" | "interrupted"; readonly stale?: true; readonly discardedFailures?: number }
  | { readonly type: "build-flapping"; readonly discardedFailures: number }
  | { readonly type: "state-changed"; readonly from: string; readonly to: string; readonly reason?: string; readonly trigger?: StateTrigger }
  | { readonly type: "runtime-failure"; readonly message: string }
  | { readonly type: "lease-revoked"; readonly leases: number; readonly generation?: string }
  | { readonly type: "drain-timeout"; readonly leases: number; readonly target?: string }
  | { readonly type: "stop-parked"; readonly leases: number; readonly target?: string }
  | { readonly type: "stop-resumed"; readonly by: "operator" | "cascade" | "shutdown" | "sub-scope" | "unmount"; readonly endsIntent?: string }
  | { readonly type: "stop-aborted"; readonly endsIntent?: string }
  | { readonly type: "config-rejected"; readonly message: string }
  | { readonly type: "config-updated"; readonly paths: ReadonlyArray<string> }
  | { readonly type: "closed" }
  | { readonly type: "audit-degraded"; readonly message: string }
  | { readonly type: "audit-acknowledged" }
  | { readonly type: "listener-failed"; readonly event: string; readonly listenerId: string; readonly message: string }
  | { readonly type: "listener-overflow"; readonly event: string; readonly listenerId: string; readonly bound: number; readonly dropped: number; readonly ended?: true }

export type HostEvent = { readonly hostId: string; readonly seq: number; readonly timestamp: string; readonly pluginId?: string } & EventExtra & HostEventBody

/** `seq` starts at 1 and steps by one per published event (BEH-BR-115); the PubSub drops oldest per subscriber. */
export const makeEvents = (hostId: string, capacity: number) => Effect.gen(function* () {
  const pubsub = yield* PubSub.sliding<HostEvent>(capacity)
  let seq = 0
  const emit = (body: HostEventBody, pluginId?: string, extra: EventExtra = {}) => Effect.gen(function* () {
    const timestamp = new Date(yield* Clock.currentTimeMillis).toISOString()
    seq++
    yield* PubSub.publish(pubsub, { ...body, ...extra, hostId, seq, timestamp, ...(pluginId !== undefined ? { pluginId } : {}) } as HostEvent)
    return seq
  })
  return { emit, stream: Stream.fromPubSub(pubsub), close: PubSub.shutdown(pubsub) }
})
