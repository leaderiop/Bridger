# 05 — Guest

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-RM-BEH-05                                            |
> | Revision       | 0.5                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.5 (2026-11-08): Round-2 agent review (R4 F20) — a duplicate of a running call is answered `InProgress` instead of dropped; a `DedupeStore` claim runs after the epoch, duplicate, in-flight and deadline checks (CCR-RM-003)<br>0.4 (2026-11-08): round 2: recheck items 20 and 23, CORE-DECISIONS-2 — per-call duplicate check across invocations through a `DedupeStore`; served calls set `CurrentCorrelation` and `HostLink.reference`; residency refusal before any lease (CCR-RM-003)<br>0.3 (2026-11-08): resolutions of the agent review of 2026-11-08 — host-side serving end `Remote.serve` (BEH-RM-039) for hosts that serve a local provider; epoch echo and `maxInFlight` in `welcome`; per-call transports keep no table across invocations; `CallbackDenied`; decoded wire annotations in `GuestContext`; endpoints may be multiplexed (R3-01, R3-03, R3-04, R3-05, R3-10, R3-11, R3-15) (CCR-RM-002)<br>0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-RM-001)<br>0.1 (2026-11-08): Initial draft (CCR-RM-001)                 |

---

The guest is the code on the far side of the transport. `Guest.serve` turns
an implementation of a contract into the guest end of the protocol: it
answers the handshake, checks epochs, runs handlers under their deadlines,
and gives each handler typed clients for the contracts the host granted —
and nothing else. A guest does not run a Bridger host and does not need to
know the plugin model. A Bridger host that wants to serve one of its own
providers to another host uses the host-side serving end, `Remote.serve`
(BEH-RM-039), which speaks the same protocol from inside a host. This file
owns BEH-RM-033–040 and uses BEH-RM-033–039; BEH-RM-040 is reserved.

Planned source: `packages/remote/src/Guest.ts` *(Planned)*; entry point
`@bridger/remote/guest`, which does not import the host-side modules.

## BEH-RM-033: Guest.serve implements a contract over a guest transport

> **See:** [ADR-RM-001](../decisions/001-remote-plugin-is-a-local-proxy.md), [ADR-RM-007](../decisions/007-stateless-guests.md)
> **Satisfies:** [URS-BR-018](../../core/urs.md#urs-br-018-host-plugins-from-code-that-does-not-use-effect)

```ts
// illustrative — not type-checked
Guest.serve<C extends Contract.Any, G extends readonly Contract.Any[] = []>(
  contract: C,
  impl: Guest.Handlers<C, G>,               // one handler per contract method
  options: {
    readonly transport: GuestTransport      // the guest end of an adapter (07)
    readonly versions?: readonly string[]   // versions served; default the contract's
    readonly grants?: G                     // contracts this guest expects to be granted
    readonly maxInFlight?: number
  }
): Effect.Effect<never, GuestTransportError, Scope.Scope>

type Guest.Handlers<C, G> = {
  readonly [M in MethodsOf<C>]: (input: InputOf<C, M>, ctx: GuestContext<G>) =>
    Effect.Effect<OutputOf<C, M>, FailureOf<C, M>>
}
interface GuestContext<G> {
  readonly clients: ClientsOf<G>            // granted contracts only (BEH-RM-036)
  readonly call: { readonly callId: string; readonly epoch: string; readonly remaining: Duration.Duration }
  readonly claims: WireClaims               // copy of the token's public claims (BEH-RM-024); grants nothing
  readonly annotations: Annotations         // decoded wire annotations (BEH-RM-024, core BEH-BR-296)
  readonly rejectedAnnotations: readonly string[]   // ids `Annotations.decode` left out
}
```

```
REQUIREMENT: `Guest.serve` MUST answer `hello` as BEH-RM-009 states, choosing
             the highest served version inside the host's accepted range,
             echoing `hello.epoch` in `welcome.epoch` and announcing its
             in-flight limit in `welcome.maxInFlight`, and MUST refuse with
             "incompatible-contract" when none is inside it.
```

```
REQUIREMENT: Each handler's input and its success or typed failure MUST be
             decoded and encoded with the contract's codecs at the agreed
             version (BEH-RM-004). A handler's typed failure MUST reach the
             host as that failure with `outcome: "executed"`.
```

```
REQUIREMENT: The guest entry point MUST NOT depend on the host-side modules of
             `@bridger/remote` or on `Bridger.Host`, so that a guest bundle
             contains only the guest runtime, the contract and its handlers.
```

**Settled here.** Handlers are Effect functions here. A Promise-returning
facade generated from the same contract is the developer-experience
companion's ([references/kit/](../../kit/README.md), agent KIT); it wraps `Guest.serve` and adds
no protocol of its own.

## BEH-RM-034: A guest keeps no state across invocations

> **See:** [ADR-RM-007](../decisions/007-stateless-guests.md)
> **Satisfies:** [URS-BR-005](../../core/urs.md#urs-br-005-never-lose-a-provider-in-the-middle-of-a-call)
> **Risk:** [RSK-RM-007](../risks.md#rsk-rm-007)

```
REQUIREMENT: The guest runtime MUST NOT carry application state from one
             handler invocation to the next: each invocation receives only
             its input, its `GuestContext` and the granted clients. State a
             handler needs MUST live in a host service reached through a
             granted client.
```

```
REQUIREMENT: The guest runtime's own per-session state (epoch, seen call
             identifiers, in-flight fibers) MUST be discardable: losing it,
             because an isolate is evicted or a worker restarted, MUST end
             the session and MUST NOT change the outcome rules of
             BEH-RM-020. A guest that has lost it MUST answer a call of an
             epoch it does not hold with a `Refused` exit, reason
             "stale-epoch", which ends the session on the host
             (BEH-RM-025).
```

```
REQUIREMENT: On a transport with `liveness: "per-call"` the guest runtime
             MUST keep no session table between invocations: it serves each
             invocation's `call` on its own, using the frame's `epoch` and
             `version`, and refuses it with "incompatible-contract" when it
             does not serve that version. On such a transport the duplicate
             check of BEH-RM-035 covers one invocation only unless a
             `DedupeStore` is wired (09 — Placement, Budgets and Adapters,
             BEH-RM-067), which carries the seen `callId`s and stored
             results across invocations outside the guest. Without one,
             documentation MUST state that a handler reached through it
             MUST be idempotent or tolerate a repeated call
             ([RSK-RM-001](../risks.md#rsk-rm-001)).
```

Documentation MUST state that module-level variables in a guest bundle are
outside this rule's reach: the runtime cannot prevent them, and an adapter
whose host evicts isolates (07 — Transports and Adapters) will lose them at
any time ([RSK-RM-007](../risks.md#rsk-rm-007)).

## BEH-RM-035: The guest checks epoch and duplicates before running a handler

> **Invariant:** [INV-RM-004](../invariants.md#inv-rm-004-a-stale-epoch-is-refused-at-the-boundary), [INV-RM-009](../invariants.md#inv-rm-009-within-one-session-a-call-executes-at-most-once-on-a-conforming-guest)
> **See:** [ADR-RM-003](../decisions/003-sessions-carry-epochs.md)
> **Satisfies:** [URS-BR-005](../../core/urs.md#urs-br-005-never-lose-a-provider-in-the-middle-of-a-call)
> **Risk:** [RSK-RM-002](../risks.md#rsk-rm-002), [RSK-RM-001](../risks.md#rsk-rm-001)

```
REQUIREMENT: Before decoding a call's payload the guest MUST check, in this
             order: the frame's epoch equals the session's (else a `Refused`
             exit, reason "stale-epoch"); the `callId` has not been seen in
             this session (else answer with the stored result if it has one,
             or answer `InProgress` while it is still running); the
             in-flight limit (else `Refused`, "busy"); `remaining` is
             positive (else `Refused`, "deadline-passed"). With a
             `DedupeStore` (09, BEH-RM-067), its `claim` runs after these
             four checks, so a refused copy never holds a claim.
```

```
REQUIREMENT: The guest MUST remember each `callId` of the session until the
             call's `remaining` duration, measured on its own clock from the
             first receipt, has passed, and MUST keep its result for
             re-sending until then, so that a duplicated `call` frame never
             runs the handler twice within a session. The memory this needs
             is bounded by the call rate times the longest deadline (core
             NFR-BR-007), not by the in-flight limit.
```

```
REQUIREMENT: The guest MUST run each handler in a fiber interrupted at the
             call's remaining deadline or on `cancel`, whichever comes first.
```

## BEH-RM-036: A guest gets typed clients for granted contracts only

> **Invariant:** [INV-RM-007](../invariants.md#inv-rm-007-a-guest-reaches-only-granted-contracts-under-a-live-token)
> **See:** [ADR-RM-005](../decisions/005-per-call-capability-tokens.md), [ADR-RM-006](../decisions/006-isolation-comes-from-the-host.md)
> **Satisfies:** [URS-BR-026](../../core/urs.md#urs-br-026-know-which-compliance-obligations-remain-mine)
> **Risk:** [RSK-RM-004](../risks.md#rsk-rm-004)

```
REQUIREMENT: `GuestContext.clients` MUST hold one client per contract that is
             both named in `options.grants` and present in the grant set the
             host sent in `hello`, restricted to the methods granted. A
             method that was not granted MUST NOT be present on the client
             type, and calling it through an untyped path MUST fail with
             `CallbackDenied { reason: "not-granted" }` without sending a
             frame.
```

```
REQUIREMENT: A client call MUST be sent as a `callback` frame bound to the
             current invocation's `callId` and token, and MUST fail with
             `CallbackDenied { reason: "invocation-ended" }` once that
             invocation has ended. A refusal returned by the host (BEH-RM-043)
             MUST reach the handler as `CallbackDenied` with the host's
             reason, or as the host-side tag it names.
```

```
REQUIREMENT: The guest runtime MUST NOT offer any other channel to the host:
             no raw frame access, no host `fetch`, no access to the
             transport's handle from handler code.
```

Egress is just another granted contract: a guest that needs the network
receives a client for an egress contract (for example `Egress.Http`,
[overview](../overview.md#public-api-surface)) provided on the host by a
plugin the application controls. Whether the guest's runtime *also* offers
an ambient `fetch` is a property of the host process or isolate — for a
Worker Loader adapter, `globalOutbound: null` — and never of Bridger
([ADR-RM-006](../decisions/006-isolation-comes-from-the-host.md)).

## BEH-RM-037: Guest failures cross the wire as tags and messages

> **See:** [ADR-RM-008](../decisions/008-unknown-outcomes-are-surfaced-never-retried.md)
> **Satisfies:** [URS-BR-006](../../core/urs.md#urs-br-006-recover-from-failure-explicitly-and-never-silently)
> **Risk:** [RSK-BR-008](../../core/gxp/03-risk-assessment.md#rsk-br-008)

```
REQUIREMENT: A handler defect, or a failure not declared by the contract,
             MUST be sent as `RemoteDefect { message }` with
             `outcome: "executed"`, the message being a fixed text plus the
             failure's tag when it has one. Stack traces, causes and values
             MUST NOT be sent.
```

```
REQUIREMENT: The guest runtime MUST log the full cause on the guest side, in
             whatever logger the guest's environment supplies.
```

## BEH-RM-038: A guest serves one contract per transport endpoint

> **See:** [ADR-RM-001](../decisions/001-remote-plugin-is-a-local-proxy.md)
> **Satisfies:** [URS-BR-003](../../core/urs.md#urs-br-003-catch-undeclared-dependencies-at-compile-time)

```
REQUIREMENT: One `Guest.serve` MUST serve exactly one contract on one guest
             transport endpoint. A bundle that implements several contracts
             MUST serve each on its own endpoint, matched on the host by one
             link per contract.
```

**Settled here.** One contract per link keeps one session child per
provided key, so withdrawal of one contract never withdraws another, and
every host-side rule stays per key as the core's are
([ADR-BR-003](../../core/decisions/003-one-provider-per-key-per-realm.md)).
Several endpoints may share one physical connection through the multiplexer
of [BEH-RM-056](./07-transports-and-adapters.md#beh-rm-056-several-endpoints-may-share-one-physical-connection);
each endpoint keeps its own session and epoch.

## BEH-RM-039: Remote.serve serves a local provider from inside a host

> **Invariant:** [INV-RM-004](../invariants.md#inv-rm-004-a-stale-epoch-is-refused-at-the-boundary), [INV-RM-009](../invariants.md#inv-rm-009-within-one-session-a-call-executes-at-most-once-on-a-conforming-guest), [INV-BR-006](../../core/invariants.md#inv-br-006-a-leased-provider-does-not-close-under-its-lease)
> **See:** [ADR-RM-001](../decisions/001-remote-plugin-is-a-local-proxy.md), [ADR-RM-005](../decisions/005-per-call-capability-tokens.md)
> **Satisfies:** [URS-BR-041](../../core/urs.md#urs-br-041-use-plugin-code-that-runs-outside-the-host-process), [URS-BR-005](../../core/urs.md#urs-br-005-never-lose-a-provider-in-the-middle-of-a-call)
> **Risk:** [RSK-RM-004](../risks.md#rsk-rm-004)

```ts
// illustrative — not type-checked
Remote.serve<C extends Contract.Any>(
  contract: C,                                   // the contract at the version this end announces in `welcome`
  options: {
    readonly transport: GuestTransport           // one endpoint (07; a multiplexed endpoint, BEH-RM-056)
    readonly realm?: string                      // where the provider is resolved; default "default"
    readonly methods?: readonly MethodsOf<C>[]   // default every method of the contract
    readonly context?: (call: {                  // the caller context a served call runs under
      readonly epoch: string; readonly claims: WireClaims; readonly annotations: Annotations
    }) => CallerContext                          // default: { actor: { kind: "service", id: "remote:" + claims.pluginId }, annotations }
    readonly annotationKeys?: readonly AnnotationKey<any>[]   // keys decoded besides core's (core BEH-BR-296)
    readonly maxInFlight?: number                // default 64
  }
): Effect.Effect<never, GuestTransportError, Scope.Scope | Bridger.Host>
// runs in the calling fiber's plugin context: its principal is the consumer of every capture (core 28)
```

```
REQUIREMENT: `Remote.serve` MUST implement the guest end of the protocol of
             BEH-RM-009, BEH-RM-010, BEH-RM-011 and BEH-RM-035 on each
             connection its transport accepts — epoch adopted from `hello`
             and echoed, duplicate `callId`s answered from the stored result,
             `Refused` exits for stale epochs, excess calls and expired
             deadlines — and MUST announce `contract.version` in `welcome`.
             It MUST send no `callback` frame: grants named in `hello` are
             ignored, and the `TokenRef` of a `call` is neither checked nor
             used.
```

```
REQUIREMENT: For a call to a method outside `options.methods`, `Remote.serve`
             MUST answer a `Refused` exit, reason "method-not-served",
             before decoding the payload and before leasing anything.
```

```
REQUIREMENT: For every other call it MUST decode the payload, then reach
             the provider only through `Host.use(contract, f, { realm,
             timeout })` with `timeout` no longer than the call's
             `remaining`, so that each served call holds a core lease for
             its duration and a local `remove`, `replace` or stop of the
             provider drains it as a local call. When `Host.use` fails with
             `ServiceUnavailable`, or the provision it resolves is not at a
             version satisfying `>= contract.version < (major+1).0.0` (core
             BEH-BR-232), the call MUST be answered with a `Refused` exit,
             reason "unavailable"; `Remote.serve` MUST NOT start, install or
             enable a provider.
```

```
REQUIREMENT: The provider's method MUST run inside
             `CallerContext.serve(ctx)` (core BEH-BR-292), where `ctx` is
             `options.context` applied to the call's epoch, its `claims`
             and its annotations decoded with `Annotations.decode` (core
             BEH-BR-296). The actor the far end asserts in `claims.actor`
             MUST NOT become the served call's actor by default: it is a
             claim, and a consumer that trusts its transport's
             authentication MAY map it through `options.context`.
```

```
REQUIREMENT: A `ResolutionRefused` from the capture (the core
             `CapabilityPolicy` refusing the serving fiber's principal) MUST
             be answered with a `Refused` exit, reason "unavailable", and
             logged with the policy's reason; a typed failure, success or
             defect of the method MUST be answered as `Guest.serve` answers
             them (BEH-RM-033, BEH-RM-037). When the core `CallLog` port is
             wired, each served call MUST be offered to it as BEH-RM-046
             states, with direction "served".
```

```
REQUIREMENT: Each served call MUST run with `CurrentCorrelation` set to the
             `correlationId` carried in `claims`, when present, through the
             `correlationId` of the `CallerContext` (core BEH-BR-292,
             BEH-BR-187), and with `HostLink.reference` set to the serving
             host's `host.link` (core BEH-BR-250), so that a provider that
             dispatches a hook point with codes from the served fiber can
             wake dormant contributors instead of being denied
             "no-host-link". A served call whose `claims` carry a
             residency annotation that this end's transport does not offer
             MUST be refused as BEH-RM-069 states, before any lease.
```

**Settled here.** (1) `Remote.serve` is the serving end a host needs when the
other end of a link is another Bridger host rather than a guest bundle —
the federation companion's exports are built on it
([references/federation/](../../federation/README.md)). It is not a plugin
and adds no host operation: it is an effect run by whoever owns the serving
policy, in its own fiber, and every lease it takes is an ordinary core
lease. (2) It serves no callbacks, so it needs no `TokenAuthority`: a peer
that calls into this host receives answers only, and what the peer asserts
about its caller arrives as `claims`, never as authority.

---

_Previous: [04 — Heartbeat and Partition](./04-heartbeat-and-partition.md)_ · _Next: [06 — Capability Tokens and Call Log](./06-capability-tokens-and-call-log.md)_
