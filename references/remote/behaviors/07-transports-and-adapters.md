# 07 — Transports and Adapters

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-RM-BEH-07                                            |
> | Revision       | 0.5                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.5 (2026-11-10): round 2 follow-up: `GuestTransportError` declared (BEH-RM-049) (CCR-RM-005)<br>0.4 (2026-11-08): Round-2 agent review (R4 F15) — a multiplexed endpoint may be given the residency labels its route offers, which replace the physical profile's (CCR-RM-003)<br>0.3 (2026-11-08): round 2: recheck items 20 and 23 — `TransportProfile.residency` and `reportsUsage`, `Connection.usage`; isolation table rows for `Transport.postMessage` and the Workers for Platforms adapter (CCR-RM-003)<br>0.2 (2026-11-08): resolutions of the agent review of 2026-11-08 — endpoint multiplexer (BEH-RM-056) for several sessions over one physical connection; frames before the handshake per endpoint; per-call transports keep a host-side logical session (R3-01, R3-05) (CCR-RM-002)<br>0.1 (2026-11-08): Initial draft (CCR-RM-001)                 |

---

A transport moves opaque frames between a link and a guest. The remote
package defines the `Transport` interface and the obligations every adapter
must meet; adapters live in sub-packages, one per runtime. This file states
those obligations, the profile an adapter declares, and — explicitly — that
any isolation between host and guest comes from the process or isolate the
adapter runs the guest in, never from Bridger. It does not specify vendor
internals. This file owns BEH-RM-049–056 and uses all eight.

Planned source: `packages/remote/src/Transport.ts` *(Planned)*; adapters in
`packages/worker/`, `packages/worker-loader/`, `packages/workerd/`
*(Planned)*.

## BEH-RM-049: The Transport interface moves frames and reports closure

> **See:** [ADR-RM-006](../decisions/006-isolation-comes-from-the-host.md)
> **Satisfies:** [URS-BR-020](../../core/urs.md#urs-br-020-load-plugin-definitions-dynamically-while-running)

```ts
// illustrative — not type-checked
interface Transport {
  readonly profile: TransportProfile
  readonly open: Effect.Effect<Connection, TransportError, Scope.Scope>   // bounded by connectTimeout
}
interface GuestTransport {
  readonly accept: Stream.Stream<Connection, GuestTransportError, Scope.Scope>
}
interface Connection {
  readonly send: (frame: Uint8Array) => Effect.Effect<void, TransportClosed>   // never awaits the peer
  readonly receive: Stream.Stream<Uint8Array, TransportClosed>
  readonly closed: Effect.Effect<{ readonly reason: string }>                // completes once, when either end closes
  readonly usage?: Stream.Stream<TransportUsage>                             // 09, BEH-RM-066; adapters that report usage
}
class TransportError  extends Schema.TaggedError<TransportError>()("TransportError", { adapter: Schema.String, message: Schema.String }) {}
class TransportClosed extends Schema.TaggedError<TransportClosed>()("TransportClosed", { adapter: Schema.String, reason: Schema.String }) {}
class GuestTransportError extends Schema.TaggedError<GuestTransportError>()("GuestTransportError", {
  reason: Schema.Literal("accept-failed", "no-dedupe"),   // "no-dedupe": Guest.serve refuses to start (09, BEH-RM-067)
  message: Schema.String
}) {}
```

```
REQUIREMENT: A transport MUST carry frames as opaque byte arrays. It MUST NOT
             inspect, reorder on purpose, or rewrite frame contents, and MUST
             NOT decode payloads.
```

```
REQUIREMENT: A connection's `send` MUST return once the frame is handed to the
             adapter's local buffer, without waiting for the peer. When the
             buffer is full it MUST fail with `TransportClosed` and close the
             connection, rather than wait.
```

```
REQUIREMENT: When the connection closes for any reason, `closed` MUST complete
             and `receive` MUST end within the adapter's `closeNotice`
             (stated in the profile), so that the link learns of a local
             closure without waiting for a heartbeat.
```

## BEH-RM-050: An adapter declares its profile; Bridger does not check it

> **See:** [ADR-RM-006](../decisions/006-isolation-comes-from-the-host.md)
> **Satisfies:** [URS-BR-026](../../core/urs.md#urs-br-026-know-which-compliance-obligations-remain-mine)
> **Risk:** [RSK-RM-005](../risks.md#rsk-rm-005)

```ts
// illustrative — not type-checked
interface TransportProfile {
  readonly adapter: string                          // e.g. "@bridger/worker"
  readonly liveness: "heartbeat" | "per-call"       // 04
  readonly ordered: boolean                         // frames on one connection arrive in send order
  readonly reliable: boolean                        // frames are neither lost nor duplicated while open
  readonly connectTimeout: Duration.Duration
  readonly closeTimeout: Duration.Duration          // bound on blocking local close (BEH-RM-005)
  readonly closeNotice: Duration.Duration
  readonly isolationProvidedBy: string              // free text naming the host mechanism, e.g. "none (same process)"
  readonly residency?: readonly string[]            // labels this route offers, the consumer's statement (09, BEH-RM-068)
  readonly reportsUsage?: readonly ("cpuMs" | "egressBytes" | "subrequests")[]   // 09, BEH-RM-066
}
```

```
REQUIREMENT: Every adapter MUST declare a `TransportProfile`. The remote
             package MUST behave correctly for every combination of
             `ordered` and `reliable` (BEH-RM-051), and MUST use `liveness`,
             `connectTimeout`, `closeTimeout` and `closeNotice` as stated.
```

```
REQUIREMENT: `isolationProvidedBy` MUST be documentation only: the remote
             package MUST NOT read it to make any decision, and MUST NOT
             report it as a property of the link. Documentation MUST state
             that Bridger does not verify it.
```

## BEH-RM-051: The protocol tolerates loss, delay, reordering and duplication

> **Invariant:** [INV-RM-004](../invariants.md#inv-rm-004-a-stale-epoch-is-refused-at-the-boundary), [INV-RM-009](../invariants.md#inv-rm-009-within-one-session-a-call-executes-at-most-once-on-a-conforming-guest)
> **See:** [ADR-RM-003](../decisions/003-sessions-carry-epochs.md)
> **Satisfies:** [URS-BR-005](../../core/urs.md#urs-br-005-never-lose-a-provider-in-the-middle-of-a-call)
> **Risk:** [RSK-RM-001](../risks.md#rsk-rm-001), [RSK-RM-002](../risks.md#rsk-rm-002)

```
REQUIREMENT: Results MUST be matched to calls by (epoch, `callId`) only, never
             by arrival order. A duplicate `result` MUST be ignored, a `result`
             for an unknown `callId` MUST be logged and dropped, and a frame
             of another epoch MUST be handled as BEH-RM-011 states.
```

```
REQUIREMENT: A lost frame MUST at worst turn into a `RemoteTimeout` or a
             session loss with the outcome rule of BEH-RM-020; it MUST NOT
             leave a call without an end.
```

```
REQUIREMENT: Frames received on a connection (on a multiplexed endpoint, on
             that endpoint's logical connection) before its handshake
             completes, other than `hello`, `welcome` and `refuse`, MUST be
             dropped and logged.
```

## BEH-RM-052: Adapter obligations

> **Invariant:** [INV-RM-002](../invariants.md#inv-rm-002-no-lifecycle-step-waits-on-a-peer)
> **See:** [ADR-RM-006](../decisions/006-isolation-comes-from-the-host.md), [ADR-RM-009](../decisions/009-deterministic-test-transport.md)
> **Satisfies:** [URS-BR-019](../../core/urs.md#urs-br-019-test-plugin-lifecycles-deterministically-with-injected-faults), [URS-BR-026](../../core/urs.md#urs-br-026-know-which-compliance-obligations-remain-mine)
> **Risk:** [RSK-RM-005](../risks.md#rsk-rm-005), [RSK-RM-006](../risks.md#rsk-rm-006)

```
REQUIREMENT: An adapter package MUST:
             1. implement `Transport` and `GuestTransport` as BEH-RM-049
                states, with a truthful `TransportProfile`;
             2. create the guest's execution environment (thread, process,
                isolate) only in `open`, never at import or at
                `Remote.define`;
             3. pass to the guest no host capability other than the Remote
                channel: no environment bindings, file descriptors, shared
                memory or network routes that the adapter can withhold;
             4. bound `open` by `connectTimeout` and blocking local close by
                `closeTimeout`;
             5. pass the transport conformance suite of the remote package
                (08 — Test Transport and Acceptance, BEH-RM-061), run
                against the real runtime;
             6. state in its documentation which host mechanism provides
                whatever isolation exists, and what it does not prevent.
```

```
REQUIREMENT: An adapter MUST NOT describe itself, in names, documentation or
             profile, as a sandbox provided by Bridger.
```

Obligation 3 is what an adapter *can* withhold. What the guest's runtime
lets it reach on its own — a global `fetch`, a file system — is decided by
the host mechanism, and obligation 6 makes the adapter say so.

## BEH-RM-053: Isolation comes from the host process or isolate, never from Bridger

> **See:** [ADR-RM-006](../decisions/006-isolation-comes-from-the-host.md), [ADR-BR-027](../../core/decisions/027-core-exclusions.md), [ADR-BR-019](../../core/decisions/019-realms-are-resolution-namespaces.md)
> **Satisfies:** [URS-BR-026](../../core/urs.md#urs-br-026-know-which-compliance-obligations-remain-mine)
> **Risk:** [RSK-RM-005](../risks.md#rsk-rm-005), [RSK-BR-013](../../core/gxp/03-risk-assessment.md#rsk-br-013)

| Adapter (planned) | Guest runs in | Isolation, if any, provided by | Not prevented by the adapter |
| --- | --- | --- | --- |
| `@bridger/worker` (first) | a Node `worker_threads` worker, MessagePort transport | nothing beyond a separate V8 heap and event loop in the same process; `resourceLimits` cap memory | network, file system, process-wide state, native addons; a crash can take the process |
| `@bridger/remote` MessagePort / WebSocket transports | whatever the application runs at the other end | the application's deployment of that end | everything the far end can do |
| `@bridger/worker-loader` | a Cloudflare dynamic worker (Worker Loader) or a service binding | the provider's isolate and its configuration (`globalOutbound: null`, `env` holding only the Remote channel) | anything the provider's isolate model allows; isolate escapes in the provider's runtime |
| `@bridger/workerd` | a self-hosted `workerd` process | a VM or container the operator places around it (gVisor or Firecracker), per workerd's own documentation | escapes from workerd's isolates into the workerd process; anything outside the VM or container boundary is the operator's |
| `@bridger/remote` `Transport.postMessage` | a document in a browser frame (09, BEH-RM-070) | the browser's origin isolation, as the consumer configures the frame's `sandbox`, origin and content security policy | anything the frame's configuration allows; a same-origin frame with `allow-same-origin` reaches the host page |
| `@bridger/workers-for-platforms` | a user worker in a provider dispatch namespace (09, BEH-RM-071) | the provider's isolates, per-invocation limits and outbound route | anything the provider's isolate model allows; isolate escapes in the provider's runtime |
| `@bridger/wasm` (later) | a WebAssembly component (WASI 0.3) in a host runtime | the Wasm runtime's memory and capability model | defects in that runtime |

```
REQUIREMENT: The remote package and every adapter MUST state that Bridger
             provides no isolation. Running third-party code out of process
             behind a proxy plugin is the architecture's rule (gap report §7
             rule 1); the isolation of that process or isolate is a property
             of the host mechanism and of the consumer's deployment, and
             Bridger makes no claim about it.
```

```
REQUIREMENT: Documentation of `@bridger/worker` MUST state that it is
             suitable for first-party code, crash containment of a thread
             and testing, and MUST NOT recommend it for third-party code.
```

## BEH-RM-054: Worker Loader and service-binding adapter obligations

> **See:** [ADR-RM-006](../decisions/006-isolation-comes-from-the-host.md), [ADR-RM-007](../decisions/007-stateless-guests.md)
> **Satisfies:** [URS-BR-020](../../core/urs.md#urs-br-020-load-plugin-definitions-dynamically-while-running)
> **Risk:** [RSK-RM-007](../risks.md#rsk-rm-007), [RSK-RM-006](../risks.md#rsk-rm-006)

```
REQUIREMENT: The Worker Loader adapter MUST create each dynamic worker with no
             outbound network route (`globalOutbound: null`) and with
             environment bindings limited to the Remote channel; per-call
             context MUST travel in the frame (token reference, deadline),
             not in long-lived bindings or `props` that outlive the call.
```

```
REQUIREMENT: The adapter MUST declare `liveness: "per-call"` and treat each
             invocation as stateless (BEH-RM-034). It MUST treat eviction of
             an isolate as a transport failure of the calls in flight, never
             as a guest result.
```

```
REQUIREMENT: The adapter MUST respect the provider's published limits on
             dynamic workers per request and per provider-side coordinating
             object (at the time of writing 4 and 10) by failing an `open` beyond them with
             `TransportError`, never by waiting for a slot.
```

The limits are the provider's and may change; the adapter reads them from
its configuration, not from this specification. They are recorded here
because they shape the design: a guest cannot rely on a long-lived isolate,
so the session of a per-call transport is a logical session held on the host
only, spanning many invocations, each of which carries its own epoch and
contract version (BEH-RM-025, BEH-RM-034); the guest keeps nothing between
them ([RSK-RM-007](../risks.md#rsk-rm-007)).

## BEH-RM-055: Self-hosted workerd runs only inside an operator-supplied boundary

> **See:** [ADR-RM-006](../decisions/006-isolation-comes-from-the-host.md)
> **Satisfies:** [URS-BR-026](../../core/urs.md#urs-br-026-know-which-compliance-obligations-remain-mine)
> **Risk:** [RSK-RM-006](../risks.md#rsk-rm-006)

```
REQUIREMENT: Documentation of `@bridger/workerd` MUST state that workerd is not
             a sandbox on its own, that its own documentation requires a VM
             or container around it, and that an isolate-to-host escape in a
             workerd-class runtime was publicly reported in 2026; it MUST
             name a VM or container boundary (for example gVisor or
             Firecracker) as the operator's obligation.
```

```
REQUIREMENT: The adapter MUST refuse to `open` unless the consumer passes an
             explicit `boundary` option naming the mechanism in place. The
             value is recorded in the profile's `isolationProvidedBy` and is
             not verified (BEH-RM-050).
```

**Settled here.** The explicit `boundary` option does not make anything
safer; it makes the decision visible in the consumer's configuration, so
that running workerd bare is a choice someone wrote down rather than a
default nobody noticed.

## BEH-RM-056: Several endpoints may share one physical connection

> **See:** [ADR-RM-001](../decisions/001-remote-plugin-is-a-local-proxy.md), [ADR-RM-003](../decisions/003-sessions-carry-epochs.md)
> **Satisfies:** [URS-BR-041](../../core/urs.md#urs-br-041-use-plugin-code-that-runs-outside-the-host-process)
> **Risk:** [RSK-RM-002](../risks.md#rsk-rm-002)

```ts
// illustrative — not type-checked
interface Multiplexed {
  // a logical Transport over the shared connection; its profile is the physical transport's,
  // with `residency` replaced when given (09, BEH-RM-068)
  readonly endpoint: (name: string, options?: { readonly residency?: readonly string[] }) => Transport
  readonly closed: Effect.Effect<{ readonly reason: string }>
}
interface MultiplexedGuest {
  readonly endpoint: (name: string) => GuestTransport
  readonly closed: Effect.Effect<{ readonly reason: string }>
}
Transport.multiplex: (physical: Connection) => Effect.Effect<Multiplexed, never, Scope.Scope>
GuestTransport.multiplex: (physical: Connection) => Effect.Effect<MultiplexedGuest, never, Scope.Scope>
```

```
REQUIREMENT: `Transport.multiplex` and `GuestTransport.multiplex` MUST carry
             frames of several named endpoints over one `Connection`, each
             endpoint's frames as opaque bytes tagged with the endpoint
             name. Each endpoint MUST behave as a `Transport` or
             `GuestTransport` of BEH-RM-049, so that every session over it
             has its own handshake, epoch, in-flight table and heartbeat;
             no frame of one endpoint MUST be delivered to another.
```

```
REQUIREMENT: An endpoint's `profile` MUST be the physical transport's
             profile, except that `residency` MUST be the labels given to
             `endpoint`, when given, so that a caller who knows what the
             route offers (the federation companion's `ManifestPeer`
             residency) makes the link's placement check (BEH-RM-068)
             compare against the same labels it compared.
```

```
REQUIREMENT: When the physical connection closes, every logical connection
             over it MUST close at once, with the physical reason, so that
             each session over it ends as BEH-RM-013 states. Closing one
             logical connection MUST NOT close the others or the physical
             one.
```

```
REQUIREMENT: Frames for an endpoint name that the receiving end has not
             opened (host side) or is not accepting (guest side) MUST be
             dropped and logged; the far end learns of it only through its
             own handshake timeout. The multiplexer MUST NOT read the frames
             it carries.
```

**Settled here.** Multiplexing keeps one contract per session and one
session child per provided key (BEH-RM-038) while letting a deployment open
one network connection per pair of hosts. What decides which endpoints a
side opens or accepts — for example the federation companion's peer
agreement ([references/federation/](../../federation/README.md)) — is the
caller's; the multiplexer only carries frames.

---

_Previous: [06 — Capability Tokens and Call Log](./06-capability-tokens-and-call-log.md)_ · _Next: [08 — Test Transport and Acceptance](./08-test-transport-and-acceptance.md)_
