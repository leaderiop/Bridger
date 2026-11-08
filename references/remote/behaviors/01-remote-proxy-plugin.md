# 01 — Remote Proxy Plugin

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-RM-BEH-01                                            |
> | Revision       | 0.3                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.3 (2026-11-08): `meta` stamping points to the loader's `Loader.stampRemote` (BEH-LD-039) (CCR-RM-002); resolutions of the agent review of 2026-11-08 — default `accepts` per core BEH-BR-232; missing options; `hello` carries the epoch; `call` carries `remaining`, `version`, wire annotations and claims; `welcome` carries `maxInFlight`; per-call refusals in `WireExit` (R3-04, R3-07, R3-10, R3-15) (CCR-RM-002)<br>0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-RM-001)<br>0.1 (2026-11-08): Initial draft (CCR-RM-001)                 |

---

A remote plugin is code that runs somewhere else — a worker thread, another
process, an isolate, another host — and that the local host sees as an
ordinary plugin providing a contract. This file specifies the shape of that
local plugin: `Remote.define` returns a **link** plugin, the link mounts one
**session child** per established session, and the session child publishes
the contract's service. Sessions and epochs are in
[02](./02-sessions-and-epochs.md), calls in [03](./03-remote-calls.md),
partitions in [04](./04-heartbeat-and-partition.md). This file owns
BEH-RM-001–008 and uses BEH-RM-001–006; BEH-RM-007–008 are reserved.

Planned source: `packages/remote/src/Remote.ts`, `packages/remote/src/Link.ts`
*(Planned)*.

## BEH-RM-001: Remote.define returns an ordinary plugin definition

> **Invariant:** [INV-RM-001](../invariants.md#inv-rm-001-a-remote-plugin-adds-no-state-operation-or-transition)
> **See:** [ADR-RM-001](../decisions/001-remote-plugin-is-a-local-proxy.md)
> **Satisfies:** [URS-BR-020](../../core/urs.md#urs-br-020-load-plugin-definitions-dynamically-while-running), [URS-BR-026](../../core/urs.md#urs-br-026-know-which-compliance-obligations-remain-mine)
> **Risk:** [RSK-RM-005](../risks.md#rsk-rm-005)

```ts
// illustrative — not type-checked
Remote.define<C extends Contract.Any, R extends Keys = []>(
  contract: C,                              // core behaviour 26 (BEH-BR-225): Contract.make(Key, { version, methods }) with core MethodSpecs;
// remote derives an RpcGroup from them (BEH-BR-232)
  options: RemoteOptions<R>
): PluginDefinition<R, []>                  // the link; the contract's key is provided by its session child

interface RemoteOptions<R extends Keys> {
  readonly id: string                       // the link's plugin ID; the session child is `${id}/session`
  readonly transport: Transport             // 07 — Transports and Adapters
  readonly requires?: R                     // keys the transport layer itself needs (for example a loader binding)
  readonly grants?: readonly Grant[]        // core behaviour 29 (BEH-BR-273): Grant.of(Key, { methods }); 06
  readonly accepts?: Contract.Range         // MAY narrow, never widen, `>= contract.version < (major+1).0.0` (core BEH-BR-232); 02
  readonly callTimeout?: Duration.Input     // default for every method; 03 (never "forever")
  readonly handshakeTimeout?: Duration.Input   // 02; default 10 seconds
  readonly heartbeat?: { readonly every?: Duration.Input; readonly missed?: number }   // 04
  readonly unavailableAfter?: number        // 04; per-call transports only, default 3
  readonly partition?: "withdraw" | "hold"  // 04; default "withdraw"
  readonly reconnect?: Schedule.Schedule<unknown, unknown>   // 04; bounded spacing, unbounded attempts by default
  readonly stableFor?: Duration.Input       // 04; default 0 seconds
  readonly flapWarning?: number             // 04; default 5
  readonly flapWindow?: Duration.Input      // 04; default 10 minutes
  readonly maxInFlight?: number             // 03; default 64
  readonly tokenTtl?: Duration.Input        // 06; default 30 seconds
  readonly meta?: PluginDefinition["meta"]  // copied to the link; version and digest of the guest bundle are stamped by Loader.stampRemote (BEH-LD-039)
}
```

```
REQUIREMENT: `Remote.define` MUST return a `PluginDefinition` produced by the
             core's `Plugin.define`, with `id` equal to `options.id`,
             `requires` equal to `options.requires` (default empty), and
             `provides` empty. It MUST NOT return a wrapper, subclass or
             host extension.
```

```
REQUIREMENT: The definition MUST be inert as core requires
             (BEH-BR-001, BEH-BR-008): calling `Remote.define` MUST NOT open
             a transport, spawn a worker, read the clock or allocate an
             identifier.
```

```
REQUIREMENT: Installing, removing, replacing, restarting, disabling,
             enabling, retrying, reconfiguring and reconciling a link MUST be
             the core operations of the same name, with their legality,
             attribution, gate consultation and audit records unchanged.
             The remote package MUST NOT add a host operation.
```

Returning a plain definition is the whole point
([ADR-RM-001](../decisions/001-remote-plugin-is-a-local-proxy.md)): every
guarantee the core gives a plugin — operation legality, attribution, the
gate, `reconcile`, snapshots — applies to the link without a remote-specific
line in the core. A loader or a federation manifest that resolves to
`Remote.define(...)` installs it like any definition. The `meta.version` and `meta.digest` that
name a guest bundle are not computed by this package: the loader companion's
`Loader.stampRemote` copies them from a bundle it verified onto the returned
definition
([BEH-LD-039](../../loader/behaviors/05-catalog-and-lazy-loading.md#beh-ld-039-guest-bundles-are-fetched-and-verified-here-and-run-out-of-process)).
Whether the guest then runs those bytes is the transport's obligation
([07](./07-transports-and-adapters.md)).

**Settled here.** The link provides nothing itself. If the link provided the
contract's key, a partition could withdraw the key only by stopping the link,
and the only system-initiated stop that ends a plugin's activation without
an operator is a runtime failure, which is sticky
([ADR-BR-005](../../core/decisions/005-failure-is-sticky.md)) and would make a
partition look like a failure. Putting the key on a child that the link
mounts and unmounts lets a partition use the dependency-loss path instead
([ADR-RM-002](../decisions/002-partition-withdraws-the-session-child.md)).

## BEH-RM-002: The session child publishes the contract's service

> **Invariant:** [INV-RM-001](../invariants.md#inv-rm-001-a-remote-plugin-adds-no-state-operation-or-transition), [INV-RM-006](../invariants.md#inv-rm-006-remote-adds-no-second-admission-path)
> **See:** [ADR-RM-001](../decisions/001-remote-plugin-is-a-local-proxy.md), [ADR-BR-021](../../core/decisions/021-children-and-groups.md)
> **Satisfies:** [URS-BR-005](../../core/urs.md#urs-br-005-never-lose-a-provider-in-the-middle-of-a-call), [URS-BR-017](../../core/urs.md#urs-br-017-bind-sub-plugins-to-the-lifetime-of-a-parent)

```ts
// illustrative — not type-checked
// mounted by the link with Plugin.Runtime.install, once per established session
const sessionChild = Plugin.define({
  id: "session",                            // core prefixes it: `${linkId}/session` (BEH-BR-122)
  requires: [],
  provides: [contract.key],
  build: Layer.effect(contract.key, Face.make(session))   // Face: one method per contract method
})
```

```
REQUIREMENT: For each session that completes its handshake (02 — Sessions
             and Epochs) the link MUST mount exactly one session child, with
             child ID "session", through `Plugin.Runtime.install`, providing
             exactly the contract's key and requiring nothing.
```

```
REQUIREMENT: The session child's build MUST capture the established session
             and its epoch, and MUST publish a face service whose methods are
             derived from the contract's methods (through the `RpcGroup` the remote
             package derives from them). In `"withdraw"` mode one
             activation of the session child MUST serve exactly one epoch.
```

```
REQUIREMENT: At most one session child of a link MUST be registered at any
             revision. The link MUST NOT mount a new session child until the
             previous one has been unmounted and is no longer registered.
```

```
REQUIREMENT: When the mount fails with `DuplicateProvider` (another plugin
             took the contract's slot while the link was withdrawn), the link
             MUST end the session, MUST NOT retry the mount, and MUST call
             `Plugin.Runtime.reportFailure` with a message naming the
             conflicting `ServiceId`, so that the conflict is visible as the
             link's runtime failure.
```

Because the child is an ordinary plugin (BEH-BR-122), consumers resolve the
contract's key to it, lease it, depend on it and see it in snapshots with
`parentId` set to the link. Its provider slot is held only while it is
registered; that is the cost of withdrawal, recorded as the last requirement:
an operator who installs a local provider of the same key during a partition
has made a configuration decision the link must not override.

## BEH-RM-003: The link's build opens nothing that waits on the peer

> **Invariant:** [INV-RM-002](../invariants.md#inv-rm-002-no-lifecycle-step-waits-on-a-peer)
> **See:** [ADR-RM-004](../decisions/004-bounded-calls-and-peer-free-lifecycle.md)
> **Satisfies:** [URS-BR-010](../../core/urs.md#urs-br-010-detect-a-plugin-that-waits-forever)
> **Risk:** [RSK-RM-003](../risks.md#rsk-rm-003)

```
REQUIREMENT: The link's build MUST create only local resources (for example
             a worker thread handle or a transport object) and MUST fork the
             connection, handshake, heartbeat and reconnection work with
             `Plugin.Runtime.background` under the policy "restart" with the
             `reconnect` schedule. The build MUST NOT await a frame, a
             connection or a handshake.
```

```
REQUIREMENT: The link MUST become `active` whether or not the peer is
             reachable. Until a session is established it MUST provide
             nothing and mount no session child, so that dependents of the
             contract stay `waiting`.
```

```
REQUIREMENT: A local resource the transport cannot create (for example a
             worker script that does not exist) MUST fail the link's build
             with the transport's typed error, as any build failure
             (`failed`, phase "build"). An unreachable peer MUST NOT fail the
             build.
```

**Settled here.** "The peer is not there yet" and "the peer is gone" are the
same condition, and both are `waiting` for dependents. A build that waited for
the peer would hold a build slot (BEH-BR-034) and fail at `buildTimeout` on a
slow network, turning an availability condition into a sticky failure.

## BEH-RM-004: The wire schema comes from the versioned contract

> **See:** [ADR-RM-001](../decisions/001-remote-plugin-is-a-local-proxy.md)
> **Satisfies:** [URS-BR-003](../../core/urs.md#urs-br-003-catch-undeclared-dependencies-at-compile-time)
> **Risk:** [RSK-RM-008](../risks.md#rsk-rm-008)

```ts
// illustrative — not type-checked
// core behaviour 26 (BEH-BR-225): Contract.make(Key, { version, methods }) with core MethodSpecs;
// remote derives an RpcGroup from them (BEH-BR-232)
// remote envelope, versioned separately from every contract
type Frame =
  | { readonly t: "hello";   readonly wire: 1; readonly epoch: string; readonly contract: { readonly id: string; readonly accepts: string }; readonly grants: readonly GrantDescriptor[] }
  | { readonly t: "welcome"; readonly wire: 1; readonly epoch: string; readonly version: string; readonly maxInFlight: number }
  | { readonly t: "refuse";  readonly epoch?: string; readonly reason: "wire" | "incompatible-contract" | "revoked" | "busy" | "not-a-peer" }
  | { readonly t: "call";    readonly epoch: string; readonly callId: string; readonly method: string; readonly payload: unknown
                             readonly version: string                 // the agreed contract version (checked per invocation on per-call transports, 04)
                             readonly deadline: number                // absolute, host Clock millis — for the log only
                             readonly remaining: number               // millis; what the guest enforces (BEH-RM-017)
                             readonly annotations: WireAnnotations    // core BEH-BR-296
                             readonly claims: WireClaims              // a description for the guest; grants nothing (06)
                             readonly token: TokenRef }
  | { readonly t: "result";  readonly epoch: string; readonly callId: string; readonly exit: WireExit }
  | { readonly t: "cancel";  readonly epoch: string; readonly callId: string }
  | { readonly t: "callback"; readonly epoch: string; readonly callId: string; readonly parent: string; readonly contract: string; readonly method: string; readonly payload: unknown; readonly token: TokenRef }
  | { readonly t: "callback-result"; readonly epoch: string; readonly callId: string; readonly exit: WireExit }
  | { readonly t: "ping" | "pong"; readonly epoch: string; readonly n: number }
  | { readonly t: "goodbye"; readonly epoch: string; readonly reason: string }

type WireExit =
  | { readonly _tag: "Success"; readonly value: unknown }                 // encoded with the method's success codec
  | { readonly _tag: "Failure"; readonly error: unknown }                 // a typed failure of the contract; outcome "executed"
  | { readonly _tag: "Defect";  readonly message: string }                // RemoteDefect; outcome "executed" (BEH-RM-037)
  | { readonly _tag: "Refused"; readonly reason: WireRefusal; readonly tag?: string }   // the handler did not run; outcome "not-executed"; `tag`: the refusing error's tag
type WireRefusal =
  | "stale-epoch" | "busy" | "deadline-passed" | "payload-undecodable" | "incompatible-contract"
  | "method-not-served" | "unavailable"                                   // the last two: host-side serving end only (BEH-RM-039)
  | "denied"                                                              // callback-result only (BEH-RM-043)
interface WireAnnotations { readonly entries: readonly AnnotationEntry[]; readonly omitted: readonly string[] }   // core BEH-BR-289, BEH-BR-296
interface WireClaims {                                                    // a copy of public claims of the token (06); never authority
  readonly actor: Actor; readonly onBehalfOf?: string; readonly pluginId: string; readonly realm: string
  readonly version?: string; readonly contractVersion: string
}
```

```
REQUIREMENT: Payloads, successes and typed failures of every method MUST be
             encoded and decoded with the Schema codecs of the contract's
             `MethodSpec`s (core BEH-BR-225), through the `RpcGroup`
             (`effect/rpc`) the remote package derives from them (BEH-BR-232),
             at the contract version agreed in
             the handshake. The envelope MUST be encoded with the remote
             package's own `Frame` schema, whose `wire` version is
             independent of any contract version. Every refusal of a single
             call or callback by the far end MUST be sent as a `WireExit`
             `Refused` in that call's `result` or `callback-result`; the
             `refuse` frame refuses a whole handshake only.
```

```
REQUIREMENT: Decoding MUST ignore unknown fields, as the add-only evolution
             of core behaviour 26 requires. A frame or payload that does not
             decode MUST NOT reach a handler or a caller as data: a call's
             undecodable payload fails that call with `WireDecodeError`
             (`outcome: "not-executed"` on the guest), an undecodable reply
             fails the call with `WireDecodeError` (`outcome: "unknown"`),
             and an undecodable envelope ends the session.
```

```
REQUIREMENT: Defects and causes MUST NOT cross the wire as values. A guest
             defect MUST be sent as `RemoteDefect { message }` with a message
             chosen by the guest runtime, never a stack trace or a
             serialised object.
```

The contract is the keystone the gap report names (item 1): the proxy, the
guest's typed handler and, later, a Promise SDK are all derived from the
contract's methods (core BEH-BR-225); core does not depend on `effect/rpc`,
so the remote package derives an `RpcGroup` from them (BEH-BR-232). Remote
adds no schema language. `effect/rpc` is marked unstable
in Effect v4 ([RSK-RM-008](../risks.md#rsk-rm-008)); the envelope is the
remote package's own so that a change of the RPC module's frame format does
not change the wire.

**Open.** Whether the envelope reuses `RpcClient`/`RpcServer` protocol
messages or keeps the `Frame` union above is decided at prototype; the
requirements above hold either way.

## BEH-RM-005: Stopping a link or a session child never waits on the peer

> **Invariant:** [INV-RM-002](../invariants.md#inv-rm-002-no-lifecycle-step-waits-on-a-peer), [INV-BR-017](../../core/invariants.md#inv-br-017-every-drain-is-bounded-unless-declared-forever)
> **See:** [ADR-RM-004](../decisions/004-bounded-calls-and-peer-free-lifecycle.md)
> **Satisfies:** [URS-BR-002](../../core/urs.md#urs-br-002-remove-or-replace-a-plugin-safely-while-it-is-in-use), [URS-BR-008](../../core/urs.md#urs-br-008-shut-down-with-a-report-of-what-failed)
> **Risk:** [RSK-RM-003](../risks.md#rsk-rm-003)

```
REQUIREMENT: The finalizers of a session child MUST end the session locally:
             mark it ended, fail every call still in flight on it as
             BEH-RM-021 states, and send `goodbye` without awaiting any
             reply. The link's finalizers MUST close the transport's local
             end. Neither MAY wait for a frame from the peer.
```

```
REQUIREMENT: A transport adapter whose local close can block (for example
             terminating a worker thread) MUST bound it by the adapter's
             `closeTimeout` (07 — Transports and Adapters); expiry MUST be
             logged and MUST NOT fail the finalizer.
```

The core's drain rules (BEH-BR-085, BEH-BR-095) bound how long a stop waits
for leases; they do not bound a finalizer that blocks (BEH-BR-107). This
behaviour is what keeps a peer out of that unbounded part.

## BEH-RM-006: A link's remote state is observable without new host states

> **See:** [ADR-RM-001](../decisions/001-remote-plugin-is-a-local-proxy.md)
> **Satisfies:** [URS-BR-004](../../core/urs.md#urs-br-004-know-why-a-plugin-is-not-running), [URS-BR-009](../../core/urs.md#urs-br-009-see-plugin-lifecycle-in-existing-tracing-logs-and-metrics)

```ts
// illustrative — not type-checked
// Context.Service "@bridger/remote/RemoteStatus", provided as a base service by Remote.layer
interface RemoteStatus {
  readonly links: Effect.Effect<ReadonlyArray<LinkStatus>>
  readonly changes: Stream.Stream<LinkStatus>
}
interface LinkStatus {
  readonly id: string; readonly realm: string
  readonly session: "none" | "connecting" | "open" | "lost" | "refused"
  readonly epoch?: string
  readonly version?: string                 // contract version agreed in the handshake
  readonly inFlight: number
  readonly lastHeartbeatAt?: number         // Clock millis
  readonly refusals: number                 // boundary refusals since the link's activation
  readonly lastRefusal?: { readonly reason: string }
  readonly lastEnd?: SessionEnd["reason"]   // 02
  readonly withdrawals: number              // 04, BEH-RM-029
  readonly revoked?: { readonly by: string; readonly reason?: string; readonly at: number }   // BEH-RM-014; actor id only
}
```

```
REQUIREMENT: The remote package MUST expose each link's session condition
             through `RemoteStatus` and through `background` fiber names and
             counts in core `inspect` (BEH-BR-090). It MUST NOT report session
             condition through plugin state; plugin state stays the core's.
```

```
REQUIREMENT: `LinkStatus` MUST carry no payload, token value or
             configuration value — names, counts, epochs and reasons only —
             as core `inspect` does (BEH-BR-118).
```

**Settled here.** `RemoteStatus` is optional: a host without `Remote.layer`
runs links unchanged, with session condition visible only through the
session child's presence in snapshots.

---

_Next: [02 — Sessions and Epochs](./02-sessions-and-epochs.md)_
