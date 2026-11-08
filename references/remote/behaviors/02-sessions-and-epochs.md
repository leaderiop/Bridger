# 02 — Sessions and Epochs

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-RM-BEH-02                                            |
> | Revision       | 0.3                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.3 (2026-11-08): resolutions of the agent review of 2026-11-08 — accepted range bounded by core BEH-BR-232; `hello` carries the epoch and `welcome` must echo it; revocations held for the life of `Remote.layer`, re-read from the revocation source at start, and recorded in the companion's own status (R3-04, R3-07, R3-08, R3-12, R3-13) (CCR-RM-002)<br>0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-RM-001)<br>0.1 (2026-11-08): Initial draft (CCR-RM-001)                 |

---

A session is one agreed conversation between a link and a guest over one
transport connection. It begins with a handshake that fixes the wire version,
the contract version and the granted contracts; it carries an **epoch** on
every later frame; it ends locally, never by agreement. This file owns
BEH-RM-009–016 and uses BEH-RM-009–014; BEH-RM-015–016 are reserved.

Planned source: `packages/remote/src/Session.ts`, `packages/remote/src/Handshake.ts`
*(Planned)*.

## BEH-RM-009: The handshake fixes wire, contract version and grants

> **See:** [ADR-RM-003](../decisions/003-sessions-carry-epochs.md)
> **Satisfies:** [URS-BR-028](../../core/urs.md#urs-br-028-know-which-plugin-version-was-active-at-any-time)
> **Risk:** [RSK-RM-008](../risks.md#rsk-rm-008)

```
REQUIREMENT: On each new connection the link MUST send `hello` naming the
             wire version, the session's epoch (BEH-RM-010), the contract's
             identifier, the accepted range and a descriptor of each grant
             (contract identifier, version range, methods). The guest MUST
             answer `welcome` with the same epoch, the contract version it
             serves and the in-flight limit it applies, or `refuse` with a
             reason.
```

```
REQUIREMENT: The accepted range MUST be `>= V < (major+1).0.0`, where V is
             `contract.version` — the version at which the session child's
             provision is registered — intersected with `options.accepts`
             when that option is given (core BEH-BR-232). An `accepts` that
             admits versions outside that range is narrowed to it, never
             honoured beyond it.
```

```
REQUIREMENT: The link MUST accept a `welcome` only when the served version
             lies inside the accepted range under the range rules of core
             behaviour 26 (BEH-BR-226) and `welcome.epoch` equals the epoch
             sent in `hello`. Otherwise it MUST treat the answer as a refusal
             — reason "incompatible-contract" for a version outside the
             range, reason "wire" for a mismatched epoch — report a version
             refusal with an `IncompatibleContract` cause (core behaviour 26)
             in `RemoteStatus` and the log, and open no session. The link
             stays `active` and mounts no session child, so the contract
             stays unprovided and its dependents stay `waiting`; no
             activation fails.
```

```
REQUIREMENT: The agreed contract version MUST be recorded in `LinkStatus`
             and in every token minted for the session
             (06 — Capability Tokens and Call Log), so that a call can be
             traced to the guest version that served it.
```

**Settled here.** (1) The provision is fixed at registration (core
BEH-BR-232): the session child always provides the contract at V, so a guest
at a lower minor than V is refused rather than served under a provision it
does not implement — a dependent requiring `^2.1` is never bound to a guest
at 2.0.0. Following a guest across majors takes one link per major, each
with its own contract object and `ServiceId`. (2) The guest answers with one
version; there is no multi-round negotiation. A guest that can serve several versions picks the
highest inside the host's range. A refusal is not retried at the
reconnection pace: after "incompatible-contract" or "wire" the link waits
for the longest interval of its `reconnect` schedule before trying again,
since only a redeployment of either side can change the answer.

## BEH-RM-010: Every session carries an epoch, compared by equality

> **Invariant:** [INV-RM-004](../invariants.md#inv-rm-004-a-stale-epoch-is-refused-at-the-boundary)
> **See:** [ADR-RM-003](../decisions/003-sessions-carry-epochs.md), [ADR-BR-025](../../core/decisions/025-deterministic-time-and-ids.md)
> **Satisfies:** [URS-BR-005](../../core/urs.md#urs-br-005-never-lose-a-provider-in-the-middle-of-a-call)
> **Risk:** [RSK-RM-002](../risks.md#rsk-rm-002)

```
REQUIREMENT: The link MUST allocate a fresh epoch for every session from the
             core `IdGenerator` (BEH-BR-210) and send it in `hello.epoch`.
             The guest MUST adopt the epoch named in `hello` for the session
             and MUST echo it in `welcome.epoch` (BEH-RM-009). Epochs are
             strings; no two sessions of any link on one host MUST share an
             epoch.
```

```
REQUIREMENT: Both ends MUST compare epochs by equality with the epoch of the
             session the frame arrives on. Neither end MAY rely on an order
             between epochs.
```

```
REQUIREMENT: An epoch MUST NOT be reused after its session ends, including
             across activations of the link and across `replace`.
```

**Settled here.** Equality, not order. A stateless guest
([ADR-RM-007](../decisions/007-stateless-guests.md)) cannot be trusted to
remember the highest epoch it has seen, and an ordering that only the host
can check adds nothing to equality on the host side. Taking epochs from the
`IdGenerator` makes them deterministic under `TestHost` (BEH-BR-179).

## BEH-RM-011: A stale epoch is refused at both ends

> **Invariant:** [INV-RM-004](../invariants.md#inv-rm-004-a-stale-epoch-is-refused-at-the-boundary)
> **See:** [ADR-RM-003](../decisions/003-sessions-carry-epochs.md)
> **Satisfies:** [URS-BR-005](../../core/urs.md#urs-br-005-never-lose-a-provider-in-the-middle-of-a-call)
> **Risk:** [RSK-RM-002](../risks.md#rsk-rm-002)

```
REQUIREMENT: The guest end MUST NOT execute a `call` whose epoch differs from
             its session's epoch; it MUST answer `result` with
             `StaleEpoch { epoch }` (`outcome: "not-executed"`) when it can,
             and MUST drop the frame otherwise.
```

```
REQUIREMENT: The host end MUST drop a `result` or `pong` of any epoch other
             than the open session's, and MUST refuse a `callback` of another
             epoch with `StaleEpoch` without consulting any policy or leasing
             any service. Every drop and refusal MUST be counted in
             `LinkStatus.refusals` and logged with the link ID, the frame
             kind and the stale epoch.
```

```
REQUIREMENT: A late `result` of an ended session MUST NOT complete any call:
             the call it belonged to has already ended (BEH-RM-021).
```

A late result is not thrown away silently: the log line lets an operator
correlate it with the `outcome: "unknown"` that the caller received. Whether
to act on it (for example, reconcile a side effect) is the application's
decision ([ADR-RM-008](../decisions/008-unknown-outcomes-are-surfaced-never-retried.md)).

## BEH-RM-012: The handshake and reconnection are bounded and run outside lifecycle steps

> **Invariant:** [INV-RM-002](../invariants.md#inv-rm-002-no-lifecycle-step-waits-on-a-peer)
> **See:** [ADR-RM-004](../decisions/004-bounded-calls-and-peer-free-lifecycle.md)
> **Satisfies:** [URS-BR-010](../../core/urs.md#urs-br-010-detect-a-plugin-that-waits-forever)
> **Risk:** [RSK-RM-003](../risks.md#rsk-rm-003), [RSK-RM-010](../risks.md#rsk-rm-010)

```
REQUIREMENT: Opening a connection and completing the handshake MUST be bounded
             by the transport's `connectTimeout` and the link's
             `handshakeTimeout` (default 10 seconds) and MUST run in the
             link's background fiber, never in a build or finalizer.
```

```
REQUIREMENT: Between attempts the link MUST follow its `reconnect` schedule,
             which MUST be spaced (non-zero delay) and SHOULD back off. The
             default schedule MUST be exponential with jitter drawn from the
             core's deterministic sources, capped at 60 seconds, with
             unbounded attempts.
```

**Settled here.** Unbounded attempts are the default because the link's
whole purpose is to keep trying while dependents wait; this does not
contradict the bounded restart default of BEH-BR-090 (1), because a failed
attempt is not a failure of the background fiber: the fiber loops on the
schedule and fails only on a defect.

## BEH-RM-013: A session ends locally, for a stated reason

> **See:** [ADR-RM-003](../decisions/003-sessions-carry-epochs.md), [ADR-RM-002](../decisions/002-partition-withdraws-the-session-child.md)
> **Satisfies:** [URS-BR-004](../../core/urs.md#urs-br-004-know-why-a-plugin-is-not-running)

```ts
// illustrative — not type-checked
type SessionEnd =
  | { readonly reason: "heartbeat-missed" }        // 04
  | { readonly reason: "transport-closed" }        // the adapter reported close
  | { readonly reason: "goodbye" }                 // the peer said goodbye
  | { readonly reason: "envelope-undecodable" }    // BEH-RM-004
  | { readonly reason: "guest-reset" }             // the far end refused with "stale-epoch" or "incompatible-contract" (04)
  | { readonly reason: "revoked"; readonly by: string }   // BEH-RM-014
  | { readonly reason: "stopping" }                // the session child or the link is stopping
```

```
REQUIREMENT: A session MUST end at the first of the reasons above, decided by
             the host end alone, and MUST record that reason in `LinkStatus`
             and the log. Ending MUST be idempotent: later reasons are
             logged and change nothing.
```

```
REQUIREMENT: When a session ends for any reason other than "stopping", the
             link MUST withdraw the session child as
             04 — Heartbeat and Partition specifies, and then, unless the
             reason is "revoked", resume connecting on its schedule.
```

## BEH-RM-014: Revocation refuses at the boundary at once

> **See:** [ADR-RM-005](../decisions/005-per-call-capability-tokens.md)
> **Satisfies:** [URS-BR-021](../../core/urs.md#urs-br-021-know-who-changed-the-plugin-set-when-and-why)
> **Risk:** [RSK-RM-004](../risks.md#rsk-rm-004)

```ts
// illustrative — not type-checked
// Context.Service "@bridger/remote/RemoteBoundary", provided by Remote.layer
interface RemoteBoundary {
  readonly revoke: (selector: RevocationSelector, context: OperationContext) => Effect.Effect<RevocationReport>
  readonly revoked: Effect.Effect<ReadonlyArray<{ readonly selector: RevocationSelector; readonly actor: Actor; readonly reason?: string }>>
}
type RevocationSelector =
  | { readonly pluginId: string; readonly realm?: string }
  | { readonly digest: string }             // meta.digest of the link (the guest bundle, when a loader sets it)
```

```
REQUIREMENT: From the moment `revoke` returns, every matching link MUST refuse
             new host-to-guest calls with `RemoteRevoked` (`outcome:
             "not-executed"`), MUST refuse every guest callback with
             `RemoteRevoked`, MUST end its session with reason "revoked",
             and MUST NOT open another session.
```

```
REQUIREMENT: `RemoteBoundary` MUST keep every revoked selector for the life
             of `Remote.layer`, and every link that matches one — in its
             current activation or in any later one, after `restart`,
             `retry`, `reconfigure`, `enable`, or a `replace` or `reconcile`
             that installs a matching definition — MUST refuse to open a
             session, so that its session child is never mounted and the
             contract stays unprovided. A link's matching is re-evaluated at
             each session attempt against its current `pluginId`, realm and
             `meta.digest`.
```

```
REQUIREMENT: Persistence of a revocation across a process restart MUST be
             the revocation source's: when the loader companion's revocation
             source is wired, `Remote.layer` MUST read every revoked digest
             from it at its start, before any link opens a session, and MUST
             follow it afterwards. A revocation made only through `revoke`
             MUST be documented as lasting until the process ends.
```

```
REQUIREMENT: Revocation MUST NOT be a host mutation: it MUST NOT install,
             remove or change the state of any plugin other than through the
             session child's withdrawal. Removing the revoked link is a
             separate core operation (for example a `reconcile` driven by the
             loader's revocation source), attributed, gated and audited by
             the core.
```

```
REQUIREMENT: `revoke` MUST require an `OperationContext`. It MUST record the
             selector, the actor's id, the reason and the `Clock` time in
             `RemoteBoundary.revoked` and in the `revoked` field of the
             `LinkStatus` of every matching link, MUST log them at warning
             level with the link IDs it withdrew, and MUST write one entry to
             the core `CallLog` port (core behaviour 29, BEH-BR-276) naming
             the selector, the actor and the reason, when that port is
             wired.
```

Revocation and removal are two steps on purpose: the boundary must refuse in
the same instant a kill switch is pulled, while removal follows the core's
ordering — dependents first, bounded drain — and its approval rules. When the
loader companion's revocation source is wired ([references/loader/](../../loader/README.md)),
`Remote.layer` subscribes to it and calls `revoke` for each digest
it names.

The session child's unmount after a revocation is the sub-scope removal of
core BEH-BR-126: it and the dependents' stops that follow are audited as
`system-stop` by `Actor.system`, caused by the child's mount record. The
revoking actor and reason reach no core audit record — core gap G57 — so
until core offers an attributed cause, this companion's own trail
(`RemoteBoundary.revoked`, `LinkStatus.revoked`, the warning log line and
the `CallLog` entry) is the only place that links the withdrawal to who
pulled the switch ([RSK-RM-013](../risks.md#rsk-rm-013)).

A revocation stops a link from serving, not core from starting it: core
never gates a system start (core BEH-BR-223, gap G60), so a revoked link may
still be started by core, but each of its activations opens no session and
provides nothing. Making the digest unusable on the host is the separate
`disable` or `remove`.

**Open.** (1) Whether a revocation entry belongs in the core `CallLog` or in a
record kind of its own depends on the entry shape of core's `CallLog` port (BEH-BR-276), which
defines only core's own call entries (core URS gap G43); until it is fixed,
the entry above is the planned use. (2) Lifting a revocation is not
specified in this revision: a revocation from the source ends when the
source stops naming it and `Remote.layer` restarts.

---

_Previous: [01 — Remote Proxy Plugin](./01-remote-proxy-plugin.md)_ · _Next: [03 — Remote Calls](./03-remote-calls.md)_
