# 08 — Operation Legality

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-BEH-08                                               |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.2 (2026-10-02): Consistency fixes from independent review (CCR-BR-002)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001) |

---

This file specifies what happens when an operation names a plugin: in what
order concurrent operations on one plugin take effect, when an operation's
intent is fixed, why interrupting a caller does not cancel what it asked for,
when each operation completes, and — in two tables that together are total —
the outcome of every operation in every state and against every operation
already in flight. It converts the SPEC.md section "Operation semantics and
races" and the linearization sentence of "State and lifecycle", and applies
the settled legality decisions that close the gaps SPEC.md left. This file
owns BEH-BR-065–080; it uses 065–077, and 078–080 are reserved.

The eight operations that name a plugin — `install`, `remove`, `replace`,
`retry`, `reconfigure`, `restart`, `disable`, `enable` — are mutating
operations. Each is attributed, gated and audited as specified in
[22 — Attributable Operations](../behaviors/22-attributable-operations.md) and
[23 — Audit Sink and Record](../behaviors/23-audit-sink-and-record.md); this
file fixes only where in that sequence legality is decided, and does not
repeat the audit rules.

## BEH-BR-065: Operations on one plugin are linearized in call order

> **Invariant:** [INV-BR-009](../invariants.md#inv-br-009-at-most-one-transition-in-flight-per-plugin)
> **See:** [ADR-BR-012](../decisions/012-intent-and-linearization.md)
> **Satisfies:** [URS-BR-002](../urs.md#urs-br-002-remove-or-replace-a-plugin-safely-while-it-is-in-use)
> **Risk:** [RSK-BR-019](../gxp/03-risk-assessment.md#rsk-br-019)

```
REQUIREMENT: Operations that name a plugin MUST be linearized per plugin —
             the pair (realm, ID) — in call order: each takes effect at a
             single linearization point, and two calls on the same plugin
             MUST reach their linearization points in the order in which
             they reached the host.
```

```
REQUIREMENT: A plugin MUST have at most one transition in flight at any
             time. Operations on different plugins MUST NOT be ordered
             against each other except through dependency ordering
             (05 — Activation, 06 — Removal).
```

```
REQUIREMENT: For `install`, the plugin is the pair (`options.realm`,
             `plugin.id`); for `replace`, (`options.realm`, `plugin.id`);
             for every other operation, the plugin named by its `PluginRef`.
```

Linearization gives every pair of concurrent operations on one plugin a single
answer — which happened first — so the outcome of a race is a property of the
call order, not of scheduling. It is per plugin because a global order would
serialise unrelated work: a slow drain on one plugin must not hold up an
install of another.

Because the checks that precede the linearization point include the
`OperationGate` (BEH-BR-066), a gate that takes long to answer delays later
calls on the same plugin, never calls on other plugins. That delay is bounded
by `BridgerOptions.gateTimeout`, and approvals are meant to be obtained before
the call ([25 — Operation Gate](./25-operation-gate.md)).

**Settled here.** SPEC.md says "linearized per plugin in call order" and also
that intent is recorded when the operation is called. With the GxP checks in
front of intent recording, a call made first could otherwise be overtaken by
one made later whose gate answered sooner. This specification keeps call
order: calls on one plugin pass through the checks to their linearization
points in arrival order.

## BEH-BR-066: Intent is recorded at the linearization point

> **Invariant:** [INV-BR-010](../invariants.md#inv-br-010-intent-survives-caller-interruption), [INV-BR-027](../invariants.md#inv-br-027-a-refused-or-unauditable-mutation-changes-nothing)
> **See:** [ADR-BR-012](../decisions/012-intent-and-linearization.md), [ADR-BR-032](../decisions/032-operation-gate.md)

```
REQUIREMENT: A call MUST pass, in order: the `HostClosed` check;
             attribution; the audit latch; `UnknownPlugin` and definition
             checks (`InstallError`, `ReplaceError`, and `ConfigInvalid` for
             a value supplied to `reconfigure`); the `OperationGate`; the
             `requested` audit record; the `WouldDeadlock` check; and then
             its linearization point, where its intent is recorded
             (22 — Attributable Operations, BEH-BR-188).
```

```
REQUIREMENT: `WouldDeadlock` MUST be decided after the `requested` record
             and before the intent is recorded. A call that fails with it
             MUST change nothing and MUST be recorded with a `failed`
             terminal record.
```

```
REQUIREMENT: At the linearization point the host MUST decide the call's
             outcome from the plugin's state and the operation in flight at
             that moment, using the tables of BEH-BR-071 and BEH-BR-072,
             re-evaluating any check of the earlier steps whose answer may
             have changed in between.
```

```
REQUIREMENT: Once intent is recorded, the transition MUST run in the host's
             own fibers (the reconciler), independently of the caller.
```

The check order is the common one of
[22 — Attributable Operations](../behaviors/22-attributable-operations.md)
(BEH-BR-188, its eight steps). Cheap, definite refusals come first so that a
call that cannot succeed never reaches the gate or the audit sink; the gate
comes before the `requested` record so that a refused call leaves no
`requested` record; and intent comes last so that nothing changes until
everything that can refuse the call has had its say. `install` does not
decode `options.config` at the call: an override that does not decode is an
activation failure, phase `activation`
([03 — Installation](./03-installation.md), BEH-BR-022).

`WouldDeadlock` is not one of the early checks. Whether a stop would wait on
a lease held by the calling fiber depends on the leases held at the moment
the intent would be recorded, so it is decided there — after the `requested`
record, and before the intent — and a call refused for it leaves a
`requested` record answered by a `failed` one.

The re-evaluation at the linearization point matters because time passes
between the checks and intent: the gate may take seconds, and another call on
the same realm may have installed a competing provider or removed the plugin
meanwhile. An outcome decided there — a `Conflict`, an `UnknownPlugin`, a
no-op — is the call's terminal outcome and is recorded as such
([23 — Audit Sink and Record](../behaviors/23-audit-sink-and-record.md)).

## BEH-BR-067: Caller interruption does not cancel the transition

> **Invariant:** [INV-BR-010](../invariants.md#inv-br-010-intent-survives-caller-interruption)
> **See:** [ADR-BR-012](../decisions/012-intent-and-linearization.md)
> **Satisfies:** [URS-BR-002](../urs.md#urs-br-002-remove-or-replace-a-plugin-safely-while-it-is-in-use), [URS-BR-021](../urs.md#urs-br-021-know-who-changed-the-plugin-set-when-and-why)
> **Risk:** [RSK-BR-004](../gxp/03-risk-assessment.md#rsk-br-004)

```
REQUIREMENT: Interrupting a caller after its intent has been recorded MUST
             stop only the caller's wait. The transition MUST continue to
             completion, and its terminal audit record MUST still be
             written.
```

```
REQUIREMENT: Interrupting a caller before its intent has been recorded MUST
             leave the host unchanged.
```

```
REQUIREMENT: The core MUST NOT offer a cancel operation. A caller that wants
             to undo a requested change MUST issue the opposite operation
             (for example `retry`, `enable` or a new `replace`).
```

A transition abandoned half-way — dependents stopped, provider hidden, scope
not yet closed — would leave the plugin in a state no table describes, and an
audit trail with a `requested` record and no outcome. Making intent survive
interruption means every recorded intent reaches a terminal state that the
snapshot and the audit trail both show. A timeout on the caller's side is an
interruption like any other.

## BEH-BR-068: When each operation completes

> **See:** [ADR-BR-012](../decisions/012-intent-and-linearization.md)
> **Satisfies:** [URS-BR-004](../urs.md#urs-br-004-know-why-a-plugin-is-not-running)

| Operation | Completes successfully when |
| --- | --- |
| `install` | the plugin's first snapshot entry has been published (03) |
| `remove` | the plugin has no snapshot entry (06) |
| `replace` | the new definition is registered and the plugin has entered `starting`, `waiting` or `disabled` (07) |
| `retry` | the plugin has entered `starting` or `waiting` (07) |
| `reconfigure` | the plugin has re-entered `starting` or `waiting`; or, for a plugin that is not restarted, the override is stored or cleared (and volatile values published) (11) |
| `restart` | the plugin has re-entered `starting` or `waiting` (07) |
| `disable` | the plugin is `disabled` (07) |
| `enable` | the plugin has entered `starting` or `waiting` (07) |
| any no-op | at its linearization point |
| any joined call | when the call it joined completes, with the same result |

```
REQUIREMENT: Each operation MUST complete successfully exactly at the point
             given in the table above, and no earlier.
```

```
REQUIREMENT: An operation MUST NOT wait for a build to finish. The outcome
             of a build is state, read from the snapshot or from
             `PluginHandle.awaitActive`.
```

An operation that waited for its build would turn an activation outcome into an
operation error, which [03 — Installation](./03-installation.md) rules out for
`install` for good reasons that apply equally to every reactivating operation.
Completing at a fixed, observable point means a caller that reads the snapshot
after its call returns always sees the effect of its call.

**Settled here.** SPEC.md fixes the completion point of `remove` only ("after
cleanup"). The table fixes the others, consistently with `install`: an
operation completes when the state it asked for has been entered, never on a
later build.

## BEH-BR-069: Outcome kinds — proceed, no-op, join, supersede, conflict

> **Invariant:** [INV-BR-011](../invariants.md#inv-br-011-every-state-and-operation-pair-has-a-defined-outcome)
> **See:** [ADR-BR-013](../decisions/013-total-operation-legality.md)
> **Risk:** [RSK-BR-019](../gxp/03-risk-assessment.md#rsk-br-019)

```ts
// illustrative — not type-checked
class Conflict   extends Schema.TaggedError<Conflict>()("Conflict", { id: Schema.String, pending: Schema.String }) {}
class Superseded extends Schema.TaggedError<Superseded>()("Superseded", { id: Schema.String }) {}
// pending: the operation in flight ("remove", "replace", "restart", "reconfigure", "disable"),
//          or "disabled", or "cleanup-failure"
```

```
REQUIREMENT: Every call that reaches its linearization point MUST have
             exactly one of these outcomes:
             - proceed: its transition runs;
             - no-op: it succeeds at once and changes nothing;
             - join: it completes together with the operation in flight,
               with the same result;
             - supersede: the operation in flight is redirected to this
               call's target, and every caller of the superseded operation,
               including callers joined to it, completes with
               `Superseded { id }`;
             - conflict: it fails with `Conflict { id, pending }` and
               changes nothing;
             - or a named error from the tables (`UnknownPlugin`,
               `DuplicatePlugin`, `HostClosed`).
```

```
REQUIREMENT: A superseding call MUST NOT interrupt a step in progress: a
             running build or stop MUST settle first, and the transition
             then continues toward the superseding call's target.
```

A no-op still succeeds and is still audited, with phase `completed` and
`noop: true` ([23 — Audit Sink and Record](../behaviors/23-audit-sink-and-record.md)):
the operator asked for something, and the record shows that the host found
nothing to do. A joined call is audited with a `joined` record that links it
to the call it joined. A superseded caller's operation is audited as
`superseded`.

The pattern behind the tables is a strength order among stopping operations:
`remove` is strongest; `replace` and `disable` are next and incomparable with
each other; `restart` and `reconfigure` are weakest. A later, stronger
operation supersedes an earlier, weaker one; a later, weaker or incomparable
one conflicts; equal operations join (or, for two `replace`s and two
`reconfigure`s with different values, the later wins). `retry` and `enable`
conflict with every operation in flight.

## BEH-BR-070: A refused call changes nothing

> **Invariant:** [INV-BR-012](../invariants.md#inv-br-012-a-definition-error-registers-nothing), [INV-BR-027](../invariants.md#inv-br-027-a-refused-or-unauditable-mutation-changes-nothing)
> **Satisfies:** [URS-BR-006](../urs.md#urs-br-006-recover-from-failure-explicitly-and-never-silently)

```
REQUIREMENT: A call that fails before or at its linearization point — with
             `HostClosed`, `UnknownPlugin`, `DuplicatePlugin`, an
             `InstallError`, `ReplaceError`, `ConfigInvalid`,
             `WouldDeadlock`, `Conflict` or any GxP error — MUST NOT change
             any plugin's state, definition, override or provider slots, and
             MUST NOT increment the snapshot revision.
```

The caller of a refused call can retry it, or issue something else, knowing
the host is exactly as it was. Which events and audit records a refusal
produces is specified in [13 — Observability and
Diagnostics](./13-observability-and-diagnostics.md) and
[23 — Audit Sink and Record](../behaviors/23-audit-sink-and-record.md).

## BEH-BR-071: The state by operation table

> **Invariant:** [INV-BR-011](../invariants.md#inv-br-011-every-state-and-operation-pair-has-a-defined-outcome), [INV-BR-007](../invariants.md#inv-br-007-failure-is-sticky)
> **See:** [ADR-BR-013](../decisions/013-total-operation-legality.md)
> **Satisfies:** [URS-BR-002](../urs.md#urs-br-002-remove-or-replace-a-plugin-safely-while-it-is-in-use), [URS-BR-006](../urs.md#urs-br-006-recover-from-failure-explicitly-and-never-silently)
> **Risk:** [RSK-BR-019](../gxp/03-risk-assessment.md#rsk-br-019), [RSK-BR-009](../gxp/03-risk-assessment.md#rsk-br-009)

This table applies when **no operation is in flight** on the plugin. When one
is — whatever state the snapshot shows — BEH-BR-072 applies instead. "→ X"
means the transition proceeds and lands in X; "→ starting/waiting" lands by
requirement availability (07 — Replacement and Reactivation, BEH-BR-057);
"Conflict (x)" is `Conflict { pending: "x" }`.

| State | install | remove | replace | retry | reconfigure | restart | disable | enable |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **unknown** | registers → `waiting`, `starting` or `disabled` | `UnknownPlugin` | `UnknownPlugin` | `UnknownPlugin` | `UnknownPlugin` | `UnknownPlugin` | `UnknownPlugin` | `UnknownPlugin` |
| **waiting** | `DuplicatePlugin` | unregisters at once | swap → starting/waiting | no-op | stores or clears the override; nothing to restart | no-op | → `disabled` | no-op |
| **starting** | `DuplicatePlugin` | build settles, result discarded → gone | supersedes the target: build settles, discarded; swap → starting/waiting | no-op | override stored; build settles, discarded; builds again | supersedes the build: it settles, discarded; builds again | build settles, discarded → `disabled` | no-op |
| **active** | `DuplicatePlugin` | stop → gone | stop, swap → starting/waiting | no-op | stop → starting/waiting; volatile-only: in place, no state change | stop → starting/waiting | stop → `disabled` | no-op |
| **stopping** | `DuplicatePlugin` | BEH-BR-072 or BEH-BR-073 | BEH-BR-072 or BEH-BR-073 | BEH-BR-072 or BEH-BR-073 | BEH-BR-072 or BEH-BR-073 | BEH-BR-072 or BEH-BR-073 | BEH-BR-072 or BEH-BR-073 | BEH-BR-072 or BEH-BR-073 |
| **failed** (build, activation, runtime) | `DuplicatePlugin` | unregisters | swap → starting/waiting | → starting/waiting | → starting/waiting | as `retry` → starting/waiting | → `disabled` | no-op |
| **failed(cleanup)** | `DuplicatePlugin` | unregisters; leak acknowledged; cleanup not re-run | Conflict (cleanup-failure) | Conflict (cleanup-failure) | Conflict (cleanup-failure) | Conflict (cleanup-failure) | Conflict (cleanup-failure) | Conflict (cleanup-failure) |
| **disabled** | `DuplicatePlugin` | unregisters | swap; stays `disabled` | Conflict (disabled) | stores or clears the override for the next `enable` | Conflict (disabled) | no-op (joins the state) | re-check → starting/waiting, or `InstallError` |
| **host closing** | `HostClosed` | `HostClosed` | `HostClosed` | `HostClosed` | `HostClosed` | `HostClosed` | `HostClosed` | `HostClosed` |

```
REQUIREMENT: When no operation is in flight on the plugin, every operation
             MUST have exactly the outcome given by this table for the
             plugin's state.
```

```
REQUIREMENT: Every cell of this table and of BEH-BR-072 MUST be an
             acceptance check of the core (21 — Testing Host).
```

A `starting` plugin "with a build running" and one still queued behave the
same in this table, except that a queued plugin has no build to settle and its
step completes at once. A `reconfigure` with a value is decoded before
anything else (`ConfigInvalid` leaves everything untouched,
[11 — Configuration](./11-configuration.md)); `reconfigure` of a `starting`
plugin always rebuilds, because the build in flight read the old value.

**Settled here.** SPEC.md's race table left most pairs unstated. The table is
now total ([ADR-BR-013](../decisions/013-total-operation-legality.md)), and
four SPEC.md rules change: (1) for a phase-"cleanup" failure, `remove`
unregisters and records the leak as acknowledged instead of "retrying the
cleanup", which Effect cannot do because the scope is already closed
([06 — Removal](./06-removal.md)); (2) every other operation on a
phase-"cleanup" failure, not only `retry` and `replace`, is refused, so that
nothing rebuilds over a possibly held resource; (3) `restart` on `starting`
supersedes the build in flight; (4) `reconfigure` on `waiting` stores the
value without anything to restart, and on `starting` rebuilds once the build
settles.

## BEH-BR-072: The in-flight operation table

> **Invariant:** [INV-BR-009](../invariants.md#inv-br-009-at-most-one-transition-in-flight-per-plugin), [INV-BR-011](../invariants.md#inv-br-011-every-state-and-operation-pair-has-a-defined-outcome)
> **See:** [ADR-BR-012](../decisions/012-intent-and-linearization.md), [ADR-BR-013](../decisions/013-total-operation-legality.md)
> **Satisfies:** [URS-BR-002](../urs.md#urs-br-002-remove-or-replace-a-plugin-safely-while-it-is-in-use)
> **Risk:** [RSK-BR-019](../gxp/03-risk-assessment.md#rsk-br-019)

This table applies while an **operator operation is in flight** on the
plugin — from its linearization point until it completes, including while it
is parked after a `DrainTimeout` (BEH-BR-074). Rows are the operation in
flight; columns the incoming call. "Supersedes" means the incoming call wins
and the earlier caller completes with `Superseded` (BEH-BR-069).

| In flight | install | remove | replace | retry | reconfigure | restart | disable | enable |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **remove** | `DuplicatePlugin` | joins | Conflict (remove) | Conflict (remove) | Conflict (remove) | Conflict (remove) | Conflict (remove) | Conflict (remove) |
| **replace** | `DuplicatePlugin` | supersedes; the replacement is discarded → gone | supersedes; the later definition is the target | Conflict (replace) | Conflict (replace) | Conflict (replace) | Conflict (replace) | Conflict (replace) |
| **restart** | `DuplicatePlugin` | supersedes → gone | supersedes; swap | Conflict (restart) | joins; its value becomes the override | joins | supersedes → `disabled` | Conflict (restart) |
| **reconfigure** | `DuplicatePlugin` | supersedes → gone | supersedes; swap | Conflict (reconfigure) | equal value: joins; different value: supersedes, the later value is the target | joins | supersedes → `disabled` | Conflict (reconfigure) |
| **disable** | `DuplicatePlugin` | supersedes → gone | Conflict (disable) | Conflict (disable) | Conflict (disable) | Conflict (disable) | joins | Conflict (disable) |
| **shutdown** (host closing) | `HostClosed` | `HostClosed` | `HostClosed` | `HostClosed` | `HostClosed` | `HostClosed` | `HostClosed` | `HostClosed` |

```
REQUIREMENT: While an operator operation is in flight on the plugin, every
             incoming operation MUST have exactly the outcome given by this
             table.
```

```
REQUIREMENT: An incoming `replace` that supersedes MUST first pass its own
             definition checks (07 — Replacement and Reactivation,
             BEH-BR-050); a `ReplaceError` MUST fail only the incoming call
             and MUST leave the operation in flight unaffected.
```

```
REQUIREMENT: An incoming `reconfigure` that joins or supersedes MUST have
             its value decoded first; `ConfigInvalid` MUST fail only the
             incoming call. "Equal value" MUST mean both calls set
             structurally equal override values, or both clear the override.
```

```
REQUIREMENT: A joining call MUST NOT change the `drain` or `force` options of
             a stop in progress, except to resume a stop parked by a
             `DrainTimeout` (BEH-BR-074).
```

`install` of a known ID is always `DuplicatePlugin`: the ID stays known until
its removal completes, so a reinstall issued during a removal is refused rather
than queued behind it. `retry` and `enable` conflict with everything in flight:
both start a plugin that is not running, and while an operation is in flight
the plugin is, by definition, being moved somewhere already.

**Settled here.** SPEC.md's race table covered `remove`, `replace`, `disable`
(joining only), and `restart`/`reconfigure` in flight, and left the other
pairs open. This table closes them: an incoming `remove` supersedes an
in-flight `disable`, as it supersedes `replace`; `replace`, `reconfigure`,
`restart`, `retry` and `enable` conflict with an in-flight `disable`; `retry`
conflicts with an in-flight `replace`; a `reconfigure` with a different value
supersedes an in-flight `reconfigure`, and with an equal value joins it.

## BEH-BR-073: A stop the system began settles before an operation applies

> **Invariant:** [INV-BR-009](../invariants.md#inv-br-009-at-most-one-transition-in-flight-per-plugin), [INV-BR-007](../invariants.md#inv-br-007-failure-is-sticky)
> **See:** [ADR-BR-017](../decisions/017-runtime-failure-one-transition.md)
> **Risk:** [RSK-BR-016](../gxp/03-risk-assessment.md#rsk-br-016)

```
REQUIREMENT: When an operator operation reaches its linearization point
             while the plugin is `stopping` because of a system transition —
             `reason` "dependency-loss" or "runtime-failure" — with no
             operator operation in flight, the operation MUST wait until
             that stop has settled and MUST then be decided by BEH-BR-071
             against the state the plugin landed in.
```

```
REQUIREMENT: A system stop MUST NOT be redirected or superseded by an
             operator operation while it runs.
```

A system stop has no caller to receive `Superseded` and a destination that is
a fact about the world — the provider is gone, the plugin did fail — not a
request. Letting it finish and then applying the operator's call to the
result keeps both honest: a `retry` issued during a runtime failure retries
the recorded failure, a `remove` issued during a dependency loss removes the
`waiting` plugin, and a plugin whose stop ended in phase "cleanup" refuses
everything but `remove`. The wait is bounded, since system stops drain under
the drain limit and revoke on expiry
([10 — Runtime Failure and Health](./10-runtime-failure-and-health.md)).

## BEH-BR-074: A drain timeout parks the operation in flight

> **Invariant:** [INV-BR-017](../invariants.md#inv-br-017-every-drain-is-bounded-unless-declared-forever), [INV-BR-010](../invariants.md#inv-br-010-intent-survives-caller-interruption)
> **See:** [ADR-BR-015](../decisions/015-leases-one-primitive.md)
> **Satisfies:** [URS-BR-010](../urs.md#urs-br-010-detect-a-plugin-that-waits-forever)
> **Risk:** [RSK-BR-004](../gxp/03-risk-assessment.md#rsk-br-004)

```
REQUIREMENT: When an operation fails with `DrainTimeout`, its intent MUST
             remain recorded and pending: the plugin MUST stay `stopping`
             and hidden from new consumers, and BEH-BR-072 MUST continue to
             apply with that operation as the one in flight.
```

```
REQUIREMENT: A parked stop MUST NOT complete by itself, even when its leases
             end. It MUST resume only when a call joins or supersedes the
             parked operation, and it MUST then drain under that call's
             `drain` and `force` options (or the host default).
```

```
REQUIREMENT: A parked operation MUST NOT count as a running transition for
             `awaitIdle`.
```

After `DrainTimeout` the caller has been told the change did not complete; a
later, unattended completion would make the plugin set change with no call
that completed it, and no completed record that attributes it. Parking keeps
every completion tied to a call an operator made — the repeated `remove` with
a longer `drain`, or with `force` — and audited as such. For `reconfigure`,
which takes no `drain` option, the joining `restart` is the way to resume with
a longer drain or `force` ([11 — Configuration](./11-configuration.md)).

**Settled here.** SPEC.md says only that after `DrainTimeout` "the plugin stays
`stopping` … and the operation can be repeated with a longer `drain`, or with
`force: true`". This specification makes the pending intent explicit, decides
that the stop does not complete on its own, and decides that repeating the
operation (or a superseding one) is what resumes it.

## BEH-BR-075: A closing host refuses every operation

> **Invariant:** [INV-BR-018](../invariants.md#inv-br-018-shutdown-reports-every-failure)
> **Satisfies:** [URS-BR-008](../urs.md#urs-br-008-shut-down-with-a-report-of-what-failed)

```
REQUIREMENT: Once shutdown has started, every operation that names a plugin
             MUST fail with `HostClosed`. A `shutdown` call MUST join the
             shutdown in progress (12 — Shutdown and Hosting).
```

```
REQUIREMENT: An operation in flight when shutdown starts MUST have its
             current step settle; shutdown then takes over the plugin, and
             the operation's caller MUST complete with `HostClosed` unless
             the operation had already completed.
```

**Settled here.** SPEC.md says new operations fail with `HostClosed` once
shutdown starts, but not what happens to one already in flight. Its step
settles — nothing is abandoned mid-cleanup — and shutdown's own
dependents-first stop then decides the plugin's end, which the `CloseReport`
records. The caller is told `HostClosed` because the outcome it asked for was
overtaken; telling it success could misstate where the plugin ended.

## BEH-BR-076: A provider that is not active cannot be leased

> **Invariant:** [INV-BR-006](../invariants.md#inv-br-006-a-leased-provider-does-not-close-under-its-lease)
> **Satisfies:** [URS-BR-005](../urs.md#urs-br-005-never-lose-a-provider-in-the-middle-of-a-call)
> **Risk:** [RSK-BR-001](../gxp/03-risk-assessment.md#rsk-br-001)

```
REQUIREMENT: In every state other than `active`, and while an operation or
             system stop is in flight, `use`, `useAll` and `lease` of the
             plugin's services MUST fail with `ServiceUnavailable` and admit
             no lease.
```

Leases are not linearized with operations: they are reads of the provider
table, governed by [09 — Leases](./09-leases.md). This row of SPEC.md's race
table is kept here so that the race table is complete in one place.

## BEH-BR-077: Every route to an operation uses the same tables

> **Invariant:** [INV-BR-011](../invariants.md#inv-br-011-every-state-and-operation-pair-has-a-defined-outcome)
> **Risk:** [RSK-BR-014](../gxp/03-risk-assessment.md#rsk-br-014)

```
REQUIREMENT: Operations issued through a `PluginHandle`, through
             `reconcile` (one operation per entry action), or by an adapter
             MUST be linearized and decided exactly as the same operation
             issued on the Host, with the same tables and outcomes.
```

```
REQUIREMENT: System transitions — automatic starts, dependency-loss and
             runtime-failure stops, child mounts and removals by a parent —
             MUST respect the same per-plugin linearization: they MUST NOT
             run concurrently with another transition on the same plugin.
```

One legality model for every route means a handle cannot do what the host
refuses, and `reconcile` cannot reach a state that the same sequence of
individual calls could not. That is also what keeps the `OperationGate`
unavoidable: there is no second entry point with its own rules
([25 — Operation Gate](./25-operation-gate.md)).

---

_Previous: [07 — Replacement and Reactivation](./07-replacement-and-reactivation.md)_ · _Next: [09 — Leases](./09-leases.md)_
