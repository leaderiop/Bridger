# 04 — Heartbeat and Partition

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-RM-BEH-04                                            |
> | Revision       | 0.4                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.4 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-09) — BEH-RM-028: a sub-scope close that takes over an operator stop of the session child waits for its stop step only (drain, and export under `handoffTimeout`), never a build (PL4); a withdrawal whose session child's cleanup fails completes, the child is unregistered with its leak logged, and the link mounts the next session's child (F4); second pass: cites core's one system acknowledgement (06, BEH-BR-047) instead of restating it (CCR-RM-012)<br>0.3 (2026-11-08): round 2: recheck item 25 — the revocation path through `Plugin.Runtime.unmount` named as the one exception to sub-scope withdrawal (CCR-RM-003)<br>0.2 (2026-11-08): resolutions of the agent review of 2026-11-08 — one session model for per-call transports, a far end's `StaleEpoch` or contract refusal ends the session; scoped mount cited as specified; dependents' finalizers after a session loss stated as a deviation (R3-05, R3-09, R3-14) (CCR-RM-002)<br>0.1 (2026-11-08): Initial draft (CCR-RM-001)                 |

---

A partition is the loss of a session without either side deciding to end
it. The rule of the gap report (§7 rule 2) is that a partition makes plugins
**wait instead of failing**. This file maps that rule onto states the core
already has: the link unmounts its session child, the contract's key leaves
the provider table, and dependents follow the core's dependency-loss path to
`waiting` and back. No state, operation or legality cell is added. This file
owns BEH-RM-025–032 and uses BEH-RM-025–030; BEH-RM-031–032 are reserved.

Planned source: `packages/remote/src/Heartbeat.ts`, `packages/remote/src/Link.ts`
*(Planned)*.

## BEH-RM-025: Missed heartbeats end the session

> **Invariant:** [INV-RM-005](../invariants.md#inv-rm-005-a-partition-withdraws-the-provider-and-fails-no-dependent)
> **See:** [ADR-RM-002](../decisions/002-partition-withdraws-the-session-child.md)
> **Satisfies:** [URS-BR-004](../../core/urs.md#urs-br-004-know-why-a-plugin-is-not-running)
> **Risk:** [RSK-RM-010](../risks.md#rsk-rm-010)

```
REQUIREMENT: On a transport whose profile has `liveness: "heartbeat"`
             (07 — Transports and Adapters), the link MUST send `ping` every
             `heartbeat.every` (default 5 seconds) on the core's `Clock`, and
             the guest MUST answer `pong` with the same epoch and counter.
```

```
REQUIREMENT: Any frame of the current epoch that decodes MUST count as a sign
             of life. When no such frame has arrived for
             `heartbeat.every × heartbeat.missed` (default 3), the link MUST
             end the session with reason "heartbeat-missed".
```

```
REQUIREMENT: On a transport whose profile has `liveness: "per-call"` (an
             invocation transport such as a Worker Loader stub), the session
             MUST be a logical session held on the host only: the handshake
             runs in one invocation, and every later invocation carries its
             own `call` frame with the session's epoch and agreed `version`.
             The link MUST end the session after `unavailableAfter`
             (default 3) consecutive calls that failed at the transport, and
             MUST NOT send `ping`.
```

```
REQUIREMENT: On every transport, a `Refused` exit with reason
             "stale-epoch" or "incompatible-contract" from the far end MUST
             end the session at once, with reason "guest-reset", whatever
             the count: the far end has lost or changed the state the
             session was agreed on (an evicted isolate, a restarted worker,
             a redeployed guest). The link then opens a new session with a
             new handshake on its schedule.
```

**Settled here.** (1) A fresh isolate that receives a call of an old epoch
answers with a refusal, not a transport failure; counting only transport
failures would leave the session open while every call fails. Ending the
session on that answer turns a guest reset into a new session with a new
handshake, which is the only point where the host learns what the new guest
serves. (2) The heartbeat runs on the host side only; the guest never
decides that the host is gone for the purpose of withdrawal, because the
guest has no plugin to withdraw. A guest that wants to stop work for a
silent host does so through the deadlines of the calls it is serving.

## BEH-RM-026: Withdrawal unmounts the session child

> **Invariant:** [INV-RM-005](../invariants.md#inv-rm-005-a-partition-withdraws-the-provider-and-fails-no-dependent), [INV-BR-005](../../core/invariants.md#inv-br-005-dependents-stop-before-their-providers)
> **See:** [ADR-RM-002](../decisions/002-partition-withdraws-the-session-child.md), [ADR-BR-021](../../core/decisions/021-children-and-groups.md)
> **Satisfies:** [URS-BR-005](../../core/urs.md#urs-br-005-never-lose-a-provider-in-the-middle-of-a-call), [URS-BR-017](../../core/urs.md#urs-br-017-bind-sub-plugins-to-the-lifetime-of-a-parent)
> **Risk:** [RSK-RM-010](../risks.md#rsk-rm-010)

```ts
// illustrative — not type-checked
// the link's background fiber, per session
Effect.scoped(Effect.gen(function* () {
  const handle = yield* runtime.install(sessionChild(session))   // mounted under this session scope
  yield* session.ended                                            // BEH-RM-013
}))                                                               // closing the scope unmounts the child
```

```
REQUIREMENT: In `"withdraw"` mode, when a session ends for a reason other than
             "stopping", the link MUST first fail the calls in flight
             (BEH-RM-021) and then unmount the session child.
```

```
REQUIREMENT: The unmount MUST use the core's scoped-mount seam: the session
             child is mounted with `Plugin.Runtime.install` under a scope
             that is a sub-scope of the link's activation scope, and closing
             that sub-scope removes the child as the core removes a child on
             its parent's stop (BEH-BR-125) — dependents first, drained under
             `BridgerOptions.drainTimeout`, revoked on expiry, never parked —
             and records it as the system transition `system-stop` attributed
             to `Actor.system` (BEH-BR-126).
```

```
REQUIREMENT: The remote package MUST NOT unmount the session child through an
             operator operation (`PluginHandle.remove` or `Host.remove`).
             The one other path is a boundary revocation, which removes the
             child with `Plugin.Runtime.unmount(child, { context })` before
             the sub-scope closes, so that core records who asked
             (BEH-RM-014, core BEH-BR-126); that call is not an operator
             operation and consults no gate.
```

The scoped-mount seam is specified by core BEH-BR-121 and BEH-BR-126
(CCR-BR-020, with the finalizer, lease and precedence rules added under
CCR-BR-022) and tested by core acceptance check 89. It adds no state and no
operation: the child leaves exactly as it leaves when its parent stops.

**Settled here.** An operator `remove` would make every partition an
attributed, gated operation: the gate could refuse a withdrawal, leaving the
contract published over a dead session, and the audit trail would show an
operator decision where there was none. A partition is a consequence, and
the core does not gate consequences
([ADR-BR-032](../../core/decisions/032-operation-gate.md)).

**Deviation from a local provider.** Because the calls in flight fail
before the unmount begins (BEH-RM-021), a dependent that stops because of a
session loss stops before its provider, as core requires (core BEH-BR-043),
but its finalizers find the face answering `RemoteUnavailable`: the peer is
already unreachable. Core's guarantee that a provider is usable from its
dependents' finalizers therefore holds through a proxy for every stop
except one caused by a session loss. Core acceptance check 1 is exempted
under partition for that reason (BEH-RM-060), and the hazard is
[RSK-RM-012](../risks.md#rsk-rm-012).

## BEH-RM-027: A partition uses only existing states and legality cells

> **Invariant:** [INV-RM-001](../invariants.md#inv-rm-001-a-remote-plugin-adds-no-state-operation-or-transition), [INV-RM-005](../invariants.md#inv-rm-005-a-partition-withdraws-the-provider-and-fails-no-dependent)
> **See:** [ADR-RM-002](../decisions/002-partition-withdraws-the-session-child.md), [ADR-BR-013](../../core/decisions/013-total-operation-legality.md)
> **Satisfies:** [URS-BR-004](../../core/urs.md#urs-br-004-know-why-a-plugin-is-not-running)

| Condition | Link | Session child | Dependent of the contract | Core rule used |
| --- | --- | --- | --- | --- |
| Installed, peer never reached | `active` | not registered | `waiting`, contract's `ServiceId` in `missingServiceIds` | BEH-BR-033 |
| Session established | `active` | mounted (`system-start`), `starting` → `active` | `waiting` → `starting` → `active` | BEH-BR-126, BEH-BR-035 |
| Session lost (`"withdraw"`) | `active` | `active` → `stopping` → not registered (`system-stop`) | `active` → `stopping` (dependency loss) → `waiting` | BEH-BR-125, BEH-BR-043 |
| Session re-established | `active` | mounted again under a new epoch | `waiting` → `starting` → `active` | BEH-BR-126, BEH-BR-033 |
| Session lost (`"hold"`) | `active` | stays `active`; calls fail with `RemoteUnavailable` | unchanged | BEH-RM-030 |
| Link removed, replaced, restarted, disabled | per operation | removed with its parent's stop | dependency loss → `waiting` | BEH-BR-125 |
| Mount refused with `DuplicateProvider` | `active` → `stopping` → `failed` (runtime) | not registered | unchanged (served by the other provider) | BEH-RM-002, BEH-BR-094 |

```
REQUIREMENT: Every state a link, its session child or a dependent passes
             through because of a session's start or end MUST be one of the
             rows above, reached only by the core rules named in the last
             column. A partition MUST NOT put the link, the session child or
             any dependent in `failed`.
```

```
REQUIREMENT: Operations addressed to the session child directly are ordinary
             operator calls on a child (BEH-BR-125, "Settled here") and MUST
             follow the core's tables unchanged. A session child removed by
             an operator MUST NOT be mounted again for the rest of the
             session; the link mounts a child again only for a new session.
```

## BEH-RM-028: Withdrawal never waits on the peer and is bounded by core limits

> **Invariant:** [INV-RM-002](../invariants.md#inv-rm-002-no-lifecycle-step-waits-on-a-peer), [INV-BR-017](../../core/invariants.md#inv-br-017-every-drain-is-bounded-unless-declared-forever)
> **See:** [ADR-RM-004](../decisions/004-bounded-calls-and-peer-free-lifecycle.md)
> **Satisfies:** [URS-BR-010](../../core/urs.md#urs-br-010-detect-a-plugin-that-waits-forever)
> **Risk:** [RSK-RM-003](../risks.md#rsk-rm-003)

```
REQUIREMENT: No step of a withdrawal MAY wait for a frame from the peer. The
             withdrawal MUST be bounded by the core's drain limit for each
             dependent and for the session child, plus the time their
             finalizers take (BEH-BR-095, BEH-BR-107). When the sub-scope
             close takes over a stop of the session child begun by an
             operator call addressed to it (core BEH-BR-121, BEH-BR-125),
             it waits only for that call's stop step — its drain under
             `drainTimeout`, and the export after it under
             `handoffTimeout` when that step has one — and never for a
             build, then removes the child under the same limits.
```

```
REQUIREMENT: While a withdrawal is in progress the link MUST continue
             connecting on its schedule, but MUST NOT mount a new session
             child until the previous one is no longer registered
             (BEH-RM-002). A session established in the meantime MUST wait,
             open, for the mount; heartbeats MUST continue on it.
```

```
REQUIREMENT: When the session child's cleanup fails during the withdrawal,
             the withdrawal MUST still complete: core records
             `failed(cleanup)` and then unregisters the child by its system
             acknowledgement (core 06, BEH-BR-047), and the sub-scope close
             logs the child's `{ id, realm }` at error level (core
             BEH-BR-121). The child is then no longer
             registered, so the link MUST resume as after any withdrawal:
             a session established meanwhile, or the next one, gets a new
             session child (BEH-RM-029). Under shutdown the child stays
             registered (core BEH-BR-105) and no session follows.
```

## BEH-RM-029: A returning session restores the provider, with flap damping

> **See:** [ADR-RM-002](../decisions/002-partition-withdraws-the-session-child.md)
> **Satisfies:** [URS-BR-001](../../core/urs.md#urs-br-001-install-plugins-at-runtime-without-ordering-providers)
> **Risk:** [RSK-RM-010](../risks.md#rsk-rm-010)

```
REQUIREMENT: When a new session completes its handshake and no session child
             is registered, the link MUST mount a new session child for it
             after the session has stayed open for `stableFor` (default
             0 seconds, that is at once). If the session ends before
             `stableFor` elapses, no child MUST be mounted for it.
```

```
REQUIREMENT: The link MUST count withdrawals per activation and expose the
             count in `LinkStatus`; it MUST emit a log line at warning level
             when more than `flapWarning` withdrawals (default 5) occur within
             `flapWindow` (default 10 minutes).
```

**Settled here.** A link whose network flaps restarts every dependent on
every flap. `stableFor` lets a deployment trade the delay of recovery
against that churn; the default favours recovery, because a stopped
dependent is already the safe state.

## BEH-RM-030: In hold mode the provider stays and calls fail fast

> **See:** [ADR-RM-002](../decisions/002-partition-withdraws-the-session-child.md)
> **Satisfies:** [URS-BR-012](../../core/urs.md#urs-br-012-use-a-dependency-when-it-is-present-without-requiring-it)

```
REQUIREMENT: In `"hold"` mode the link MUST mount one session child for its
             activation once the first session is established, MUST keep it
             mounted across session loss, and its face MUST stamp each call
             with the epoch of the session open at the time of the call.
```

```
REQUIREMENT: While no session is open in `"hold"` mode, face methods MUST fail
             at once with `RemoteUnavailable` (`outcome: "not-executed"`);
             they MUST NOT wait for a session.
```

`"hold"` is for consumers that would rather handle a failed call than be
stopped: an advisory feature, a cache that can serve stale data. It keeps the
rule that remote calls never wait without a deadline. The session child's
state then says nothing about the peer; `RemoteStatus` does.

---

_Previous: [03 — Remote Calls](./03-remote-calls.md)_ · _Next: [05 — Guest](./05-guest-serve.md)_
