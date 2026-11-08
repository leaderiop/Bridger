# Runtime Invariants — Remote Companion

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-RM-INV                                               |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Runtime Invariants                                           |
> | Change History | 0.2 (2026-11-08): resolutions of the agent review of 2026-11-08 — INV-RM-005 states the finalizer deviation; INV-RM-007 and INV-RM-009 sources aligned with BEH-RM-043, BEH-RM-046 and BEH-RM-035; INV-RM-009 limited on per-call transports; INV-RM-010 added (R3-05, R3-06, R3-09, R3-16) (CCR-RM-002)<br>0.1 (2026-11-08): Initial draft (CCR-RM-001)                 |

---

Properties of `@bridger/remote` that hold for every execution. They restate,
for a plugin whose code runs on the other side of a transport, the rules of
the gap report's §7 rule 2: availability is eventually consistent, a
partition makes plugins wait instead of failing, a stale epoch is refused at
the boundary, remote calls always have a timeout, and a lifecycle step never
waits on a peer. They hold **per host**: nothing here is a property of a set
of hosts.

This specification is prospective
([ADR-BR-036](../core/decisions/036-prospective-specification.md)): nothing
below is implemented. Every **Source** names a planned module, marked
*(Planned)*; every **Verification** names a planned check, also *(Planned)*.
No invariant here may be cited as evidence until a test that checks it has
been written and executed
([ADR-BR-035](../core/decisions/035-evidence-from-executed-tests.md)).

Each invariant has the shape used by the core
([core invariants](../core/invariants.md)): statement, **Source**,
**Implication**, **Verification**, **Related**.

## INV-RM-001: A remote plugin adds no state, operation or transition

A remote plugin is, to the host, two ordinary plugins — a link and its
session child — whose every state, transition, operation outcome, audit
record and gate consultation is one the core already defines.

**Source**: `packages/remote/src/Remote.ts` *(Planned)* — `Remote.define`
returns a plain `PluginDefinition` built with `Plugin.define`; the session
child is mounted with `Plugin.Runtime.install`. The package imports only the
public API of `@bridger/core` and has no access to the host's internal
scheduling interface.

**Implication**: the legality table ([BEH-BR-071](../core/behaviors/08-operation-legality.md)),
the state diagram ([BEH-BR-026](../core/behaviors/04-states-and-snapshots.md))
and `reconcile` ([18](../core/behaviors/18-reconciliation-and-confluence.md))
need no remote-specific row. A tool that reads core snapshots understands a
remote plugin without knowing it is remote.

**Verification** *(Planned)*: the core acceptance checks listed in
[BEH-RM-060](behaviors/08-test-transport-and-acceptance.md) re-run with the
provider under test replaced by a remote proxy, with unchanged expectations;
a type-level test that `Remote.define` returns `PluginDefinition`.

**Related**: [BEH-RM-001](behaviors/01-remote-proxy-plugin.md), [BEH-RM-002](behaviors/01-remote-proxy-plugin.md), [BEH-RM-027](behaviors/04-heartbeat-and-partition.md), [BEH-RM-060](behaviors/08-test-transport-and-acceptance.md), [ADR-RM-001](decisions/001-remote-plugin-is-a-local-proxy.md), [ADR-RM-002](decisions/002-partition-withdraws-the-session-child.md).

---

## INV-RM-002: No lifecycle step waits on a peer

No build, finalizer or stop of a link or session child waits for a frame,
an acknowledgement or any other action of the peer.

**Source**: `packages/remote/src/Link.ts` *(Planned)* — the link's build
creates local resources only and forks connection, handshake and heartbeat
work with `Plugin.Runtime.background`; `packages/remote/src/Session.ts`
*(Planned)* — the session child's build captures an already established
session; finalizers send `goodbye` without awaiting a reply and close the
local end.

**Implication**: an unreachable, slow or hostile peer cannot hold a removal,
a replace, a shutdown or a cascade; every such step is bounded by core's own
limits (`buildTimeout`, `drainTimeout`) independently of the peer.

**Verification** *(Planned)*: under `TestTransport` with the peer
partitioned before install, during build, during stop and during shutdown,
assert that each lifecycle step completes on the test clock without any
frame being delivered; a mutation test that awaits the handshake inside the
build must fail this check.

**Related**: [BEH-RM-003](behaviors/01-remote-proxy-plugin.md), [BEH-RM-005](behaviors/01-remote-proxy-plugin.md), [BEH-RM-012](behaviors/02-sessions-and-epochs.md), [BEH-RM-028](behaviors/04-heartbeat-and-partition.md), [ADR-RM-004](decisions/004-bounded-calls-and-peer-free-lifecycle.md).

---

## INV-RM-003: Every remote call is bounded by a timeout

Every call that crosses a transport — host to guest and guest to host — has a
finite deadline, and it ends with a result, a typed failure or a
`RemoteTimeout` no later than that deadline plus the local scheduling delay.

**Source**: `packages/remote/src/Call.ts` *(Planned)* — the deadline is the
smallest of the method's, the link's and the call context's deadline; the
option type admits no `"forever"`; a timer on Effect's `Clock` fails the call
and sends `cancel`.

**Implication**: a remote call never holds a lease, a drain or a caller
indefinitely; a lost reply becomes a typed, attributable outcome
([URS-BR-010](../core/urs.md#urs-br-010-detect-a-plugin-that-waits-forever)).

**Verification** *(Planned)*: property test under `TestTransport` with
random drops and delays: every call issued ends by its deadline on the test
clock; type-level test that `"forever"` is rejected.

**Related**: [BEH-RM-017](behaviors/03-remote-calls.md), [BEH-RM-018](behaviors/03-remote-calls.md), [BEH-RM-045](behaviors/06-capability-tokens-and-call-log.md), [ADR-RM-004](decisions/004-bounded-calls-and-peer-free-lifecycle.md).

---

## INV-RM-004: A stale epoch is refused at the boundary

A frame whose epoch is not the epoch of the open session it arrives on is
never acted upon: a guest does not execute a call of another epoch, and a
host does not deliver a reply, or admit a callback, of another epoch.

**Source**: `packages/remote/src/Session.ts` *(Planned)* (host end) and
`packages/remote/src/Guest.ts` *(Planned)* (guest end) — every frame after
the handshake carries the epoch; both ends compare it by equality with the
session's epoch before decoding the payload; tokens carry the epoch and are
refused when it is not current
([BEH-RM-044](behaviors/06-capability-tokens-and-call-log.md)).

**Implication**: after a partition heals, nothing sent under the old session
— a delayed call, a late reply, a callback from a guest invocation that
outlived its session — takes effect under the new one. Split-brain between
two sessions of one link cannot occur at the boundary.

**Verification** *(Planned)*: `TestTransport` scenarios that delay or
duplicate frames across a partition and heal, asserting the guest's
execution count and the host's delivered results; a property test over
random reorderings.

**Related**: [BEH-RM-010](behaviors/02-sessions-and-epochs.md), [BEH-RM-011](behaviors/02-sessions-and-epochs.md), [BEH-RM-035](behaviors/05-guest-serve.md), [BEH-RM-044](behaviors/06-capability-tokens-and-call-log.md), [ADR-RM-003](decisions/003-sessions-carry-epochs.md).

---

## INV-RM-005: A partition withdraws the provider and fails no dependent

When a session is lost, the contract's provider is withdrawn from the host
(in `"withdraw"` mode) and its dependents go to `waiting`; no dependent and
no link enters `failed` because of a partition.

**Source**: `packages/remote/src/Link.ts` *(Planned)* — on session loss the
link unmounts the session child, which the core treats as a system stop of
a child; dependents follow the core's dependency-loss path
(`active → stopping → waiting`) and return through `waiting → starting` when
a new session mounts a new child.

**Implication**: a partition is visible as `waiting` with the contract's
`ServiceId` in `missingServiceIds` — the state that already means "a
requirement is not available" — and heals without any operator action
([URS-BR-004](../core/urs.md#urs-br-004-know-why-a-plugin-is-not-running)).
It does not keep the provider usable from the dependents' finalizers: calls
in flight fail before the unmount, so finalizers of dependents stopped by a
session loss see the provider as unreachable — the one place where a proxy
departs from a local provider ([BEH-RM-026](behaviors/04-heartbeat-and-partition.md),
[RSK-RM-012](risks.md#rsk-rm-012)).

**Verification** *(Planned)*: `TestTransport.partition` with dependents
installed, asserting the snapshot sequence of the session child and each
dependent, the absence of `failed`, and the return to `active` after heal.

**Related**: [BEH-RM-025](behaviors/04-heartbeat-and-partition.md), [BEH-RM-026](behaviors/04-heartbeat-and-partition.md), [BEH-RM-027](behaviors/04-heartbeat-and-partition.md), [ADR-RM-002](decisions/002-partition-withdraws-the-session-child.md).

---

## INV-RM-006: Remote adds no second admission path

A call into a remote contract is protected from its provider closing only by
the core's lease and dependency rules on the session child; the remote
package keeps an in-flight table for deadlines, cancellation and epochs, never
for admission.

**Source**: `packages/remote/src/Session.ts` *(Planned)* — the face service
is published by the session child; a caller reaches it through `Host.use`,
`useAll`, `lease` or a declared requirement; the in-flight table refuses a
call only when the session is already ended.

**Implication**: drain, force, revocation and `WouldDeadlock` behave through a
proxy exactly as for a local provider
([ADR-BR-015](../core/decisions/015-leases-one-primitive.md),
[INV-BR-006](../core/invariants.md#inv-br-006-a-leased-provider-does-not-close-under-its-lease)).

**Verification** *(Planned)*: core acceptance checks 2, 12 and 18 re-run
through a proxy ([BEH-RM-060](behaviors/08-test-transport-and-acceptance.md)).

**Related**: [BEH-RM-019](behaviors/03-remote-calls.md), [BEH-RM-022](behaviors/03-remote-calls.md), [ADR-RM-001](decisions/001-remote-plugin-is-a-local-proxy.md).

---

## INV-RM-007: A guest reaches only granted contracts, under a live token

Every call from a guest into a host service names a contract and method
covered by the link's grants, carries a token that is unexpired, of the
current epoch and bound to a call still in flight, and is admitted only after
the core's capability policy allows it.

**Source**: `packages/remote/src/Callback.ts` *(Planned)* — in the order of
BEH-RM-043: epoch and revocation checked, the token checked through the
`TokenAuthority`, duplicates set aside, the grant checked, the optional
`CallbackAdmission` consulted, the payload decoded, and only then the host
service reached with `Host.use`, whose capture is where the core
`CapabilityPolicy` decides; the `CallLog` entry is offered when the callback
ends (BEH-RM-046).

**Implication**: a guest has no ambient authority through Bridger: no
service it was not granted, no call after its invocation ended, no call
under another session. What the guest's runtime lets it do outside the
Remote channel (network, files) is the host process's or isolate's
business ([ADR-RM-006](decisions/006-isolation-comes-from-the-host.md)).

**Verification** *(Planned)*: scenarios for an ungranted contract, an
ungranted method, an expired token, a token of an ended call, a token of a
previous epoch, and a forged token, each refused with its tag and logged.

**Related**: [BEH-RM-036](behaviors/05-guest-serve.md), [BEH-RM-041](behaviors/06-capability-tokens-and-call-log.md), [BEH-RM-043](behaviors/06-capability-tokens-and-call-log.md), [BEH-RM-044](behaviors/06-capability-tokens-and-call-log.md), [BEH-RM-046](behaviors/06-capability-tokens-and-call-log.md), [ADR-RM-005](decisions/005-per-call-capability-tokens.md).

---

## INV-RM-008: An unknown outcome is reported as unknown and never retried

A call whose execution on the peer cannot be known — timed out, cancelled
after sending, or cut by a session loss — fails with `outcome: "unknown"`,
and the remote package never sends it again.

**Source**: `packages/remote/src/Call.ts` *(Planned)* — the outcome is fixed
by the last frame state of the call (`not-sent`, `sent`, `answered`); no code
path re-sends a `call` frame after a session ends or a deadline expires.

**Implication**: a side effect on the guest is never repeated by the proxy
([RSK-BR-003](../core/gxp/03-risk-assessment.md#rsk-br-003)); a caller that
needs to retry does so knowingly, with its own idempotency key.

**Verification** *(Planned)*: frame-log assertions under `TestTransport`
that no `callId` is sent twice; outcome assertions for each frame state.

**Related**: [BEH-RM-020](behaviors/03-remote-calls.md), [BEH-RM-021](behaviors/03-remote-calls.md), [ADR-RM-008](decisions/008-unknown-outcomes-are-surfaced-never-retried.md).

---

## INV-RM-009: Within one session a call executes at most once on a conforming guest

A guest built with `Guest.serve`, or a host serving end built with
`Remote.serve`, executes the handler for a given (epoch, `callId`) at most
once, whatever duplicates the transport delivers, on every transport whose
profile has `liveness: "heartbeat"`. On a `liveness: "per-call"` transport
the guarantee covers one invocation only: the guest keeps no table between
invocations, and a handler reached through such a transport must be
idempotent ([BEH-RM-034](behaviors/05-guest-serve.md),
[RSK-RM-001](risks.md#rsk-rm-001)).

**Source**: `packages/remote/src/Guest.ts` *(Planned)* — a per-session table
of seen call identifiers and their results, each kept until the call's
remaining duration has passed (BEH-RM-035); its size is bounded by the call
rate times the longest deadline (core NFR-BR-007), not by the in-flight
limit; a duplicate is answered with the stored result or dropped.

**Implication**: transports that duplicate frames (`reliable: false`) do not
duplicate side effects inside a session. Across sessions, a call is never
re-sent ([INV-RM-008](#inv-rm-008-an-unknown-outcome-is-reported-as-unknown-and-never-retried)),
so the guest never sees it under a second epoch.

**Verification** *(Planned)*: `TestTransport.duplicate` scenarios asserting
the handler's execution count; a property test over random duplication.

**Related**: [BEH-RM-034](behaviors/05-guest-serve.md), [BEH-RM-035](behaviors/05-guest-serve.md), [BEH-RM-039](behaviors/05-guest-serve.md), [BEH-RM-051](behaviors/07-transports-and-adapters.md), [ADR-RM-003](decisions/003-sessions-carry-epochs.md).

---

## INV-RM-010: Within one parent call, a callback executes at most once

The host end runs the host service for a given (parent `callId`, callback
`callId`) at most once, whatever duplicates the transport delivers.

**Source**: `packages/remote/src/Callback.ts` *(Planned)* — a table per
host-to-guest call in flight of admitted callback identifiers and their
results, released when the parent call ends (BEH-RM-048).

**Implication**: transports that duplicate frames do not duplicate a host
side effect a guest asked for once.

**Verification** *(Planned)*: `TestTransport.duplicate` on `callback`
frames, asserting the host service's execution count and one `CallLog`
entry (check 28 of BEH-RM-061).

**Related**: [BEH-RM-043](behaviors/06-capability-tokens-and-call-log.md), [BEH-RM-048](behaviors/06-capability-tokens-and-call-log.md), [ADR-RM-005](decisions/005-per-call-capability-tokens.md).

---

_Previous: [Decisions](./decisions/001-remote-plugin-is-a-local-proxy.md)_ · _Next: [Traceability](./traceability.md)_
