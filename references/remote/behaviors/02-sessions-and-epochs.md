# 02 — Sessions and Epochs

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-RM-BEH-02                                            |
> | Revision       | 0.9                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.9 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-06) — BEH-RM-014: after a failed revocation unmount the child is removed by the parent's own stop when it resumes, or by shutdown, not when the session's sub-scope closes, which removes nothing then (R1; core CCR-BR-038) (CCR-RM-009)<br>0.8 (2026-11-11): BEH-RM-014: a failed revocation unmount (now possibly `WouldDeadlock`, core CCR-BR-037) is logged and leaves the boundary refusal in force; the sub-scope close removes the child (SPEC-AUDIT-05 follow-up) (CCR-RM-008)<br>0.7 (2026-11-10): Specification audit of 2026-11-10 (SPEC-AUDIT-04) — BEH-RM-009: the accepted range is `"^" + V`, inside the `ContractRange` grammar, and for major 0 admits no higher minor (C9) (CCR-RM-007)<br>0.6 (2026-11-09): Specification audit of 2026-11-09 (M-06): BEH-RM-014 reads the loader's `RevokedDigests` view, so signer and statement revocations refuse at the boundary at once, and the limit without the view is stated; BEH-RM-013 session end reason "mount-refused" (U-11); BEH-RM-014 consults the `RevokedDigests` view live at each session attempt and on each change, and never copies its answers into the permanent revocation list; BEH-RM-013 a link ended "revoked" by the view resumes when the view stops refusing it (independent review) (CCR-RM-004)<br>0.5 (2026-11-08): Round-2 agent review (R4 F23, F28) — the wire version is negotiated per session (`hello` lists N and N−1, `welcome` picks the highest common), which is writers last without a fleet condition; `RemoteOptions.wireVersions`; the revocation entry carries `epoch` when a session was open (stale parenthesis removed) (CCR-RM-003)<br>0.4 (2026-11-08): round 2: recheck item 25 — a revocation unmounts the session child with `Plugin.Runtime.unmount` and `requestedBy` (core G57 closed), offers a "revocation" entry through `Host.offerCallEntry` (G43 closed), and cites `RefusalList` for starts (G60 closed); recheck item 22 — the `wire` version follows the N/N−1, writers-last rule (CCR-RM-003)<br>0.3 (2026-11-08): resolutions of the agent review of 2026-11-08 — accepted range bounded by core BEH-BR-232; `hello` carries the epoch and `welcome` must echo it; revocations held for the life of `Remote.layer`, re-read from the revocation source at start, and recorded in the companion's own status (R3-04, R3-07, R3-08, R3-12, R3-13) (CCR-RM-002)<br>0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-RM-001)<br>0.1 (2026-11-08): Initial draft (CCR-RM-001)                 |

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
             wire versions it speaks, the session's epoch (BEH-RM-010), the contract's
             identifier, the accepted range and a descriptor of each grant
             (contract identifier, version range, methods). The guest MUST
             answer `welcome` with the same epoch, the agreed wire version,
             the contract version it serves and the in-flight limit it
             applies, or `refuse` with a reason.
```

```
REQUIREMENT: The accepted range MUST be `"^" + V` (core BEH-BR-226),
             where V is `contract.version` — the version at which the
             session child's provision is registered — intersected with `options.accepts`
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
REQUIREMENT: The wire version is negotiated per session — the N/N−1 rule of
             the federation companion's skew model
             ([BEH-FD-046](../../federation/behaviors/06-kill-path-placement-and-skew.md#beh-fd-046-one-skew-model-for-every-version-axis)):
             a release at wire N MUST list N and N−1 in `hello.wire` and
             MUST encode `hello` at the lowest version it lists; the guest
             MUST answer `welcome` with the highest version both ends list,
             or `refuse` with reason "wire" when there is none. Every later
             frame of the session MUST be sent and read at the agreed
             version, and a frame at another version MUST end the session
             with reason "wire". `hello`, `welcome` and `refuse` MUST keep
             the fields they need to negotiate readable at N−1.
```

```
REQUIREMENT: Writers last on this axis follows from the negotiation: a
             release at N sends N only to a peer that listed N, so no
             option chooses the version sent and no fleet-wide condition is
             needed. `RemoteOptions.wireVersions` MAY narrow the listed
             versions to one (for example to N−1 while a rollout is held
             back by desired state); it MUST NOT add a version the release
             cannot read.
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
  | { readonly reason: "mount-refused"; readonly tag: string }   // the session child's mount failed (01, BEH-RM-002)
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
             reason is "revoked" or "mount-refused", resume connecting on its
             schedule. After "mount-refused" the link has reported a runtime
             failure (01, BEH-RM-002) and opens no further session. After
             "revoked" it opens no session while a revocation matches it
             (BEH-RM-014): a selector given to `revoke` matches for the life
             of `Remote.layer`, while an answer of the loader's
             `RevokedDigests` view matches only for as long as the view
             gives it, and once it no longer does the link resumes
             connecting on its schedule.
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
REQUIREMENT: When the loader companion's `RevokedDigests` view is wired
             ([BEH-LD-070](../../loader/behaviors/09-trust-class-and-guest-links.md)),
             `Remote.layer` MUST read it at its start, before any link opens
             a session, and every link MUST consult the view live: at each
             session attempt it MUST call `refused` for its `meta.digest`
             and open no session while `refused` answers, and on each
             revision the view publishes on `changes` it MUST call `refused`
             again. A link with an open session for which `refused` now
             answers — by digest, by statement digest, by signer, or
             "verification-unknown" — MUST at once refuse calls and
             callbacks with `RemoteRevoked` and end its session with reason
             "revoked", as a `revoke` does, recording the view's `by` and
             `reason` in `LinkStatus.revoked` (under the revocation
             source's actor) and in the "revocation" call-log entry.
             A view answer MUST NOT be added to `RemoteBoundary.revoked` or
             kept once the view stops giving it: an answer can end — a
             "verification-unknown" digest whose `AcceptedDigests` record
             arrives — and the link then resumes connecting on its schedule
             (BEH-RM-013). Without the view, only the digests the
             revocation source lists reach the boundary, and documentation
             MUST state that a signer or statement revocation then reaches
             a running link only through the kill switch's removal of the
             link (loader BEH-LD-029).
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
             level with the link IDs it withdrew, and, when a `CallLog` is
             wired, MUST offer one entry per matching link through
             `Host.offerCallEntry` (core BEH-BR-280) with `kind`
             "revocation", `companion` "@bridger/remote", the link's
             contract as `serviceId`, `outcome` "refused" and `revocation`
             `{ link, reason }` and `epoch` when a session was open
             (BEH-RM-046), run in a fiber whose `CurrentActor` is the
             context's actor.
```

```
REQUIREMENT: The session child of each matching link MUST be removed with
             `Plugin.Runtime.unmount(child, { context })` (core BEH-BR-126),
             called by the link with the `context` given to `revoke`, before
             the session's sub-scope closes. Core then records one
             `unmount-requested` record carrying `requestedBy` (the revoking
             actor and reason) and the `system-stop` records of the child
             and its dependents, caused by it. When the child's removal has
             already begun (the session ended for another reason first), the
             call waits for it and adds no record; the revocation is then
             visible only in this companion's trail and the `CallLog`. When
             the unmount fails (`UnknownPlugin`, `HostClosed` or
             `WouldDeadlock`, core BEH-BR-126), the link MUST log the
             failure at warning level with the link, the digest and the
             error, and MUST leave the boundary refusal in force; the
             child is then removed by the parent's own stop when it
             resumes, or by shutdown — not when the session's sub-scope
             closes (core BEH-BR-121) — and no `unmount-requested` record
             names the revocation.
```

Revocation and removal are two steps on purpose: the boundary must refuse in
the same instant a kill switch is pulled, while removal of the link follows
the core's ordering — dependents first, bounded drain — and its approval
rules. When the loader companion's revocation source is wired
([references/loader/](../../loader/README.md)), `Remote.layer` subscribes to
it and calls `revoke` for each digest it names, with the revocation source's
actor. A revocation list names digests and signers; which package digests a
revoked signer or a revoked statement takes down is known only from the
loader's verification records, so `Remote.layer` reads that answer from the
loader's `RevokedDigests` view rather than recomputing it — the same view
that backs core's `RefusalList`, so the boundary and the start refusal agree
on every digest.

The session child's unmount after a revocation is attributed: core's
`Plugin.Runtime.unmount` writes `requestedBy` beside `Actor.system`, so the
core trail shows both that the host stopped the child and on whose request
(core gap G57, closed by CCR-BR-026). This companion's own trail
(`RemoteBoundary.revoked`, `LinkStatus.revoked`, the warning line and the
`CallLog` entry) remains the place that names the selector
([RSK-RM-013](../risks.md#rsk-rm-013)).

A revocation stops a link from serving; core's `RefusalList` stops it from
starting. When the deployment's `RefusalList` (core BEH-BR-267) refuses the
link's digest — the loader companion feeds it from the same revocation
source — core leaves the link `disabled` with reason "refused-digest" at its
next start, restart or mount, whatever causes it (core gap G60, closed by
CCR-BR-026). Without a wired `RefusalList`, a revoked link may still be
started by core, but each of its activations opens no session and provides
nothing. Making a running digest unusable on the host is the separate
`disable` or `remove`.

**Open.** Lifting a revocation is not specified in this revision: a
revocation from the source ends when the source stops naming it and
`Remote.layer` restarts.

---

_Previous: [01 — Remote Proxy Plugin](./01-remote-proxy-plugin.md)_ · _Next: [03 — Remote Calls](./03-remote-calls.md)_
