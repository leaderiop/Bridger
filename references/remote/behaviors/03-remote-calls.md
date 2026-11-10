# 03 — Remote Calls

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-RM-BEH-03                                            |
> | Revision       | 0.7                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.7 (2026-11-10): Specification audit of 2026-11-10 (SPEC-AUDIT-03, review of the round) — BEH-RM-022: the guest-callback fiber carries core `CurrentTransition` beside `HeldPlugins`, read from the calling fiber, so a guest callback of `restart(P)` during P's build fails `WouldDeadlock` (CCR-RM-006)<br>0.6 (2026-11-09): Specification audit of 2026-11-09 (F-07): identity claims (actor, `onBehalfOf`, `org`, `correlationId`) cross only when the link lists them in `disclose`, default none; a disclosing link is recorded as a data transfer; BEH-RM-024 every crossing entry names the identity claims that crossed in core's new `CrossingInfo.disclosed` (CCR-BR-033), unconditionally (CCR-RM-004)<br>0.5 (2026-11-08): Round-2 agent review (R4 F20) — `InProgress` exits keep the call in flight; a deadline reached after one is `RemoteTimeout` with outcome "unknown" (CCR-RM-003)<br>0.4 (2026-11-08): round 2: alignment with CORE-DECISIONS-2 — method timeouts read from `ContractDescriptor.timeouts` (`MethodSpec.timeout`, core G48 closed); the per-method option may only shorten them; both serving ends enforce the descriptor value; claims carry `onBehalfOf` as `PrincipalRef.encode`, `org` and `correlationId` (CCR-RM-003)<br>0.3 (2026-11-08): resolutions of the agent review of 2026-11-08 — `remaining` in the `call` frame, the deadline never sent as an annotation; wire annotations and claims of a call (BEH-RM-024); `Refused` exits mapped to errors, `MethodNotServed`; `welcome.maxInFlight` (R3-10, R3-15, R3-01) (CCR-RM-002)<br>0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-RM-001)<br>0.1 (2026-11-08): Initial draft (CCR-RM-001)                 |

---

A call into the face service published by a session child becomes a `call`
frame, a deadline, an entry in the session's in-flight table and, at the end,
one outcome. This file fixes the deadline, the outcome vocabulary, how a call
in flight relates to core leases, and what a session loss does to calls in
flight, and what a call carries besides its payload. This file owns
BEH-RM-017–024 and uses all eight.

Planned source: `packages/remote/src/Call.ts`, `packages/remote/src/Face.ts`
*(Planned)*.

## BEH-RM-017: Every remote call has a finite deadline

> **Invariant:** [INV-RM-003](../invariants.md#inv-rm-003-every-remote-call-is-bounded-by-a-timeout)
> **See:** [ADR-RM-004](../decisions/004-bounded-calls-and-peer-free-lifecycle.md)
> **Satisfies:** [URS-BR-010](../../core/urs.md#urs-br-010-detect-a-plugin-that-waits-forever)
> **Risk:** [RSK-RM-003](../risks.md#rsk-rm-003)

```ts
// illustrative — not type-checked
// the method's timeout comes from the contract: MethodSpec.timeout, published as
// ContractDescriptor.timeouts: { method, millis }[] (core BEH-BR-225, BEH-BR-234; core gap G48 closed)
type CallTimeout = Duration.Input           // "forever" is not assignable
// RemoteOptions.methodTimeouts?: Record<method, CallTimeout> — may only shorten the contract's value
// effective deadline = now + min(descriptor timeout, methodTimeouts[method], options.callTimeout ?? 30 seconds)
//                     bounded further by the OperationContext deadline annotation (core behaviour 30, BEH-BR-291)
```

```
REQUIREMENT: Every host-to-guest call MUST have a deadline equal to the
             current `Clock` time plus the smallest of: the method's entry in
             the contract's `ContractDescriptor.timeouts`, when the contract
             declares one (core BEH-BR-234); the link's
             `methodTimeouts[method]`, when given; the link's `callTimeout`
             (default 30 seconds); and the remaining time of the deadline
             annotation on the caller's `OperationContext`, when one is
             present. A `methodTimeouts` value longer than the descriptor's
             MUST be treated as the descriptor's (it can shorten, never
             lengthen) and logged once at warning level.
```

```
REQUIREMENT: The guest end (`Guest.serve`) and the host serving end
             (`Remote.serve`) MUST read the same `descriptor.timeouts` and
             MUST interrupt a handler at the smaller of the received
             `remaining` and the descriptor's value for that method. Core
             never enforces a contract timeout; this package does.
```

```
REQUIREMENT: The option types MUST NOT admit an unbounded timeout. A
             configuration value that decodes to zero, a negative duration or
             infinity MUST fail the link's configuration decoding
             (`ConfigInvalid`, BEH-BR-097).
```

```
REQUIREMENT: The deadline MUST be sent in the `call` frame as `deadline`, an
             absolute time on the host's clock, and as `remaining`, a
             duration in milliseconds; the guest MUST interrupt the handler
             at `remaining` measured on its own clock. The caller's
             `Annotation.Deadline` MUST NOT be sent as an annotation (core
             BEH-BR-296); `remaining` is the transport's own relative
             timeout that core BEH-BR-296 requires instead.
```

**Settled here.** The guest measures the remaining duration, not the
absolute time: the two clocks are not assumed to agree
([RSK-RM-011](../risks.md#rsk-rm-011)). The absolute value is carried for
the log only.

## BEH-RM-018: A deadline that expires fails the call and cancels it on the guest

> **Invariant:** [INV-RM-003](../invariants.md#inv-rm-003-every-remote-call-is-bounded-by-a-timeout), [INV-RM-008](../invariants.md#inv-rm-008-an-unknown-outcome-is-reported-as-unknown-and-never-retried)
> **See:** [ADR-RM-004](../decisions/004-bounded-calls-and-peer-free-lifecycle.md)
> **Satisfies:** [URS-BR-010](../../core/urs.md#urs-br-010-detect-a-plugin-that-waits-forever)

```
REQUIREMENT: When the deadline expires before a `result` arrives, the call
             MUST fail with `RemoteTimeout { link, method, epoch, callId,
             after }` with `outcome: "unknown"` if the `call` frame was handed
             to the transport, and `"not-executed"` otherwise, and the link
             MUST send `cancel` for that `callId` without awaiting a reply.
```

```
REQUIREMENT: When the caller's fiber is interrupted while the call is in
             flight, the link MUST send `cancel`, MUST remove the call from
             the in-flight table, and MUST let the interruption complete
             without waiting for the guest.
```

```
REQUIREMENT: On `cancel`, a guest built with `Guest.serve` MUST interrupt the
             handler's fiber if it is still running, and MUST send no
             `result` for that call afterwards.
```

## BEH-RM-019: Calls in flight are held by core leases on the session child

> **Invariant:** [INV-RM-006](../invariants.md#inv-rm-006-remote-adds-no-second-admission-path), [INV-BR-006](../../core/invariants.md#inv-br-006-a-leased-provider-does-not-close-under-its-lease)
> **See:** [ADR-RM-001](../decisions/001-remote-plugin-is-a-local-proxy.md), [ADR-BR-015](../../core/decisions/015-leases-one-primitive.md)
> **Satisfies:** [URS-BR-005](../../core/urs.md#urs-br-005-never-lose-a-provider-in-the-middle-of-a-call)
> **Risk:** [RSK-BR-001](../../core/gxp/03-risk-assessment.md#rsk-br-001)

```
REQUIREMENT: The face service MUST be reached only through the core: a
             `Host.use`, `useAll` or `lease` on the contract's key, or a
             declared requirement of a dependent. The remote package MUST NOT
             offer another way to obtain the face service.
```

```
REQUIREMENT: The session child's activation scope MUST NOT begin to close
             while a core lease on it is held; the remote package MUST rely
             on the core's drain for this and MUST NOT add an admission
             count of its own.
```

```
REQUIREMENT: A face method called after the session has ended — through a
             reference that escaped its lease, or during the session child's
             stop — MUST fail at once with `RemoteUnavailable { link, epoch }`
             (`outcome: "not-executed"`) and MUST NOT send a frame.
```

The in-flight table exists for deadlines, cancellation and matching results
to calls; it never decides whether a call may start while the provider is
active. That is the core's job, through the one lease primitive, and it is
why the core's drain, force and revocation suites can be re-run through a
proxy unchanged ([BEH-RM-060](./08-test-transport-and-acceptance.md)).

## BEH-RM-020: Every call ends with one outcome

> **Invariant:** [INV-RM-008](../invariants.md#inv-rm-008-an-unknown-outcome-is-reported-as-unknown-and-never-retried)
> **See:** [ADR-RM-008](../decisions/008-unknown-outcomes-are-surfaced-never-retried.md)
> **Satisfies:** [URS-BR-006](../../core/urs.md#urs-br-006-recover-from-failure-explicitly-and-never-silently)
> **Risk:** [RSK-RM-001](../risks.md#rsk-rm-001)

```ts
// illustrative — not type-checked
type CallOutcome = "not-executed" | "unknown" | "executed"

// errors added to every face method's error channel
class RemoteUnavailable extends Schema.TaggedError<RemoteUnavailable>()("RemoteUnavailable",
  { link: Schema.String, epoch: Schema.optional(Schema.String), outcome: Schema.Literal("not-executed") }) {}
class RemoteTimeout   /* { link, method, epoch, callId, after, outcome: "unknown" | "not-executed" } */
class SessionLost     /* { link, method, epoch, callId, reason, outcome: "unknown" | "not-executed" } */
class StaleEpoch      /* { epoch, outcome: "not-executed" } */
class RemoteRevoked   /* { link, outcome: "not-executed" | "unknown" } */
class RemoteBusy      /* { link, inFlight, outcome: "not-executed" } */
class WireDecodeError /* { link, method, direction: "payload" | "reply", outcome } */
class RemoteDefect    /* { link, method, message, outcome: "executed" } */
class MethodNotServed /* { link, method, outcome: "not-executed" } — the far end serves the contract but not this method (BEH-RM-039) */
type RemoteCallError = RemoteUnavailable | RemoteTimeout | SessionLost | StaleEpoch | RemoteRevoked | RemoteBusy | WireDecodeError | RemoteDefect | MethodNotServed
```

```
REQUIREMENT: Every face method's error channel MUST be the method's typed
             failures from the contract plus `RemoteCallError`. A call MUST
             end exactly once: with the decoded success, with a decoded
             typed failure of the contract (`outcome: "executed"`), or with
             one `RemoteCallError` carrying its outcome.
```

```
REQUIREMENT: The outcome MUST be "not-executed" only when the host knows the
             guest did not run the handler: the frame was never handed to the
             transport, or the guest answered with a `Refused` exit. In every
             other case of an error without a result it MUST be "unknown".
```

```
REQUIREMENT: A `Refused` exit MUST fail the call, with `outcome:
             "not-executed"`, as: "stale-epoch" → `StaleEpoch`; "busy" →
             `RemoteBusy`; "deadline-passed" → `RemoteTimeout`;
             "payload-undecodable" → `WireDecodeError { direction:
             "payload" }`; "incompatible-contract" → `SessionLost { reason:
             "incompatible-contract" }`; "method-not-served" →
             `MethodNotServed`; "unavailable" → `RemoteUnavailable`. A
             "stale-epoch" or "incompatible-contract" refusal MUST also end
             the session (04 — Heartbeat and Partition, BEH-RM-025).
```

```
REQUIREMENT: An `InProgress` exit is not an answer: it says that this copy
             of the call did not run because another copy with the same
             `callId` is running (09, BEH-RM-067). The link MUST keep the
             call in flight and wait for a `result` until the call's
             deadline; a call that reaches its deadline after an
             `InProgress` MUST fail with `RemoteTimeout` and `outcome:
             "unknown"`, never "not-executed". An `InProgress` MUST NOT be
             offered to the `CallLog` as a refusal.
```

`outcome` is the one field a caller needs to decide what to do next: a
"not-executed" call is safe to try again, an "unknown" call is not without an
idempotency key, and an "executed" failure is the guest's answer.

## BEH-RM-021: A session loss ends every call in flight on it

> **Invariant:** [INV-RM-008](../invariants.md#inv-rm-008-an-unknown-outcome-is-reported-as-unknown-and-never-retried), [INV-RM-002](../invariants.md#inv-rm-002-no-lifecycle-step-waits-on-a-peer)
> **See:** [ADR-RM-008](../decisions/008-unknown-outcomes-are-surfaced-never-retried.md), [ADR-RM-002](../decisions/002-partition-withdraws-the-session-child.md)
> **Satisfies:** [URS-BR-005](../../core/urs.md#urs-br-005-never-lose-a-provider-in-the-middle-of-a-call)
> **Risk:** [RSK-RM-001](../risks.md#rsk-rm-001)

```
REQUIREMENT: When a session ends (BEH-RM-013), every call still in its
             in-flight table MUST fail at once with
             `SessionLost { reason, outcome }`, before the session child's
             withdrawal begins, with the outcome rule of BEH-RM-020.
```

```
REQUIREMENT: The remote package MUST NOT send a call again after its session
             ended or its deadline expired, on any session.
```

Failing calls before the withdrawal starts is what lets the withdrawal
complete without waiting on the peer: the callers' leases end as their calls
fail, so the core's drain of the session child sees no lease held for a
reply that will never come.

## BEH-RM-022: Drain, force and re-entrancy behave through a proxy as for a local provider

> **Invariant:** [INV-RM-006](../invariants.md#inv-rm-006-remote-adds-no-second-admission-path), [INV-BR-016](../../core/invariants.md#inv-br-016-a-re-entrant-wait-fails-fast)
> **See:** [ADR-RM-001](../decisions/001-remote-plugin-is-a-local-proxy.md), [ADR-BR-016](../../core/decisions/016-reentrancy-detection.md)
> **Satisfies:** [URS-BR-002](../../core/urs.md#urs-br-002-remove-or-replace-a-plugin-safely-while-it-is-in-use), [URS-BR-010](../../core/urs.md#urs-br-010-detect-a-plugin-that-waits-forever)
> **Risk:** [RSK-BR-011](../../core/gxp/03-risk-assessment.md#rsk-br-011)

```
REQUIREMENT: When a `use` callback that leases the session child is revoked
             by a forced removal (BEH-BR-086), the remote call it awaits MUST
             be interrupted, `cancel` MUST be sent, and the callback MUST fail
             with the core's `LeaseRevoked`; the remote outcome is then
             "unknown" and MUST be logged with the `callId`.
```

```
REQUIREMENT: A guest callback into a host service (06 — Capability Tokens and
             Call Log) MUST run host-side in a fiber that carries, in
             `@bridger/core/HeldPlugins` (BEH-BR-088), the plugins held by
             the fiber of the host-to-guest call it belongs to, plus the
             session child, and, in `@bridger/core/CurrentTransition`
             (BEH-BR-088), the value that fiber carries — read from it,
             never set to none or to another plugin's id when it carries
             one — so that a callback that would wait for the proxy's own
             drain, or a `restart(P)` reached from a callback of a call
             made during P's build, fails with `WouldDeadlock` instead of
             waiting.
```

**Settled here.** Carrying `HeldPlugins` and `CurrentTransition` across the remote hop extends the
core's re-entrancy detection to the one cross-fiber path the remote package
creates itself. It does not close URS gap G6 in general: a wait that passes
through any other fiber is still undetected
([RSK-BR-011](../../core/gxp/03-risk-assessment.md#rsk-br-011)).

## BEH-RM-023: In-flight calls per session are bounded

> **See:** [ADR-RM-004](../decisions/004-bounded-calls-and-peer-free-lifecycle.md)
> **Satisfies:** [NFR-BR-007](../../core/urs.md#nfr-br-007-bounded-memory)

```
REQUIREMENT: A session MUST hold at most `maxInFlight` calls (default 64). A
             call beyond the limit MUST fail at once with
             `RemoteBusy { link, inFlight }` (`outcome: "not-executed"`); it
             MUST NOT queue.
```

```
REQUIREMENT: The guest end MUST apply the limit it announced in
             `welcome.maxInFlight` (default the value it was configured
             with, else 64) and answer excess calls with a `Refused` exit,
             reason "busy". The link MUST hold at most the smaller of its
             own `maxInFlight` and the announced limit.
```

**Settled here.** Failing rather than queuing keeps every wait in the system
bounded by a deadline the caller set; a queue would add a wait nobody
configured.

## BEH-RM-024: A call carries the caller's wire annotations and a copy of its claims

> **Invariant:** [INV-RM-007](../invariants.md#inv-rm-007-a-guest-reaches-only-granted-contracts-under-a-live-token), [INV-RM-012](../invariants.md#inv-rm-012-a-call-carries-no-identity-claim-its-link-did-not-disclose)
> **See:** [ADR-RM-005](../decisions/005-per-call-capability-tokens.md), [ADR-BR-045](../../core/decisions/045-operation-context-annotations.md)
> **Satisfies:** [URS-BR-035](../../core/urs.md#urs-br-035-carry-labels-such-as-taint-provenance-and-deadline-across-calls)
> **Risk:** [RSK-BR-031](../../core/gxp/03-risk-assessment.md#rsk-br-031), [RSK-RM-016](../risks.md#rsk-rm-016)

```
REQUIREMENT: Every `call` frame MUST carry, in `annotations`, the caller's
             annotations encoded as core BEH-BR-296 requires:
             `Annotations.encode(Annotations.filter(bag, "wire"))`, the
             encoded entries and the list of omitted keys. Keys whose flows
             do not include "wire" — `Annotation.Deadline` among them —
             MUST NOT be sent. The remote package MUST NOT flatten an
             annotation to a string.
```

```
REQUIREMENT: Every `call` frame MUST carry, in `claims`, the link claims of
             the token — link `pluginId`, realm, link `meta.version` and the
             agreed contract version — and, of the identity claims (actor,
             `onBehalfOf` encoded with core `PrincipalRef.encode`
             (BEH-BR-280), `org`, `correlationId`), exactly those the link
             lists in `RemoteOptions.disclose` and the token has. A claim
             the link does not disclose MUST be omitted, never sent empty or
             masked. The default `disclose` MUST be empty: a link built
             without the option sends no identity claim (INV-RM-012).
```

```
REQUIREMENT: A receiver MUST treat every identity claim as optional. It
             MUST read `onBehalfOf` with `PrincipalRef.decode` and treat a
             string it cannot decode as absent, logging it. The copy MUST
             NOT carry the `TokenRef`, the grant digest or the token's
             `tokenId`, and MUST be documented as a description that grants
             nothing: what a guest presents to call back is the `TokenRef`
             alone (06).
```

```
REQUIREMENT: A link whose `disclose` is not empty MUST be recorded as a
             data transfer to its peer: `LinkStatus.disclosed` MUST list
             the disclosed claim names (01, BEH-RM-006), and each session
             open MUST be logged at info level with the link ID, the epoch
             and the disclosed claim names, never their values.
             Documentation MUST state that the receiver of an identity
             claim becomes a processor of that personal data, and that
             choosing to disclose is the application's decision, made per
             link.
```

```
REQUIREMENT: Every "crossing" entry this package offers to the core
             `CallLog` (06, BEH-RM-046) MUST name in `crossing.disclosed`
             (core BEH-BR-280) the identity claims that crossed with that
             call, and never their values: on a host-to-guest call, the
             claims its `call` frame carried — a claim listed in `disclose`
             that had no value for the call did not cross and is not
             named; on a served call (05, BEH-RM-039), the identity claims
             its frame carried. A callback's identity comes from the token
             kept on the host (06), so a callback entry names none. Names
             MUST appear once each, in the order "actor", "onBehalfOf",
             "org", "correlationId"; an entry for a call that carried no
             identity claim MUST omit `disclosed`.
```

```
REQUIREMENT: The guest runtime MUST decode `annotations` with
             `Annotations.decode(entries, keys)`, where `keys` are the keys
             the guest bundle declares (core keys included), and MUST give
             the handler the decoded bag, the rejected ids and `claims`
             through `GuestContext` (05). A serving end that runs a host
             provider (BEH-RM-039) MUST combine the decoded bag into the
             fiber it runs the provider in, never replace it.
```

**Settled here.** Annotations travel in the frame, not in the token: a
token is a reference checked on the host (06), and the guest needs to read
taint and provenance whether or not it ever calls back. Which keys cross is
decided by each key's declared flows (core BEH-BR-296), not by this
package.

**Settled here (CCR-RM-004).** Identity is opt-in per link, as the MCP
companion's import already is
([BEH-MC-022](../../mcp/behaviors/03-client-import.md#beh-mc-022-the-proxy-forwards-no-identity-unless-the-import-discloses-it-and-never-annotations)):
a guest or a peer that receives user identities, organisations and
correlation ids becomes a processor of them, which is a decision for the
application, not a default of a library. Annotations are not identity
claims and still cross by their declared flows. A guest that needs to know
whom it serves asks for it through the integrator, who lists the claims in
`disclose` ([ADR-RM-005](../decisions/005-per-call-capability-tokens.md)).

---

_Previous: [02 — Sessions and Epochs](./02-sessions-and-epochs.md)_ · _Next: [04 — Heartbeat and Partition](./04-heartbeat-and-partition.md)_
