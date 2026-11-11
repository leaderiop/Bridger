# 08 — Operation Legality

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-BEH-08                                               |
> | Revision       | 0.19                                                         |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.19 (2026-11-11): Intro, BEH-BR-074 and BEH-BR-080: a sub-scope close or `unmount` resumes a child stop parked outside its parent's stop only before the parent's stop has begun (from the parent becoming `stopping` or shutdown beginning) (C1); BEH-BR-073 the system stops include a child's removal by its sub-scope close or `unmount` (`reason` "remove", `next` "gone", a take-over included), bounded by `drainTimeout`, after the owning operation's stop step and build for a take-over (CL13) (SPEC-AUDIT-08); BEH-BR-071 the `starting` × `replace` cell states the held handoff value's outcome, and the account of when a held value is abandoned names a superseding call with `cold: true` (C6); BEH-BR-069 `Conflict.reason` "cold-mismatch" and BEH-BR-072 the `cold` mismatch fails with it (CL1) (SPEC-AUDIT-08) (CCR-BR-040)<br>0.18 (2026-11-11): BEH-BR-073 the account of how long a wait lasts names every no-caller cascade root, a child's sub-scope close or unmount included (CL8); BEH-BR-074 the lease that makes a sub-scope close or `unmount` leave a parent-parked child stop is one in the child's removal set (H1); BEH-BR-071 the `starting` cells keep a held handoff value unless the superseding call passes `cold: true`; BEH-BR-072 a join requires equal `cold`, a different one is `Conflict` (C7, C8) (SPEC-AUDIT-07) (CCR-BR-039)<br>0.17 (2026-11-11): Intro and BEH-BR-080: a child's sub-scope close or unmount is the no-caller root of the cascades that stop the child's own dependents (CL3); BEH-BR-074 `stop-parked` and `stop-resumed` carry `realm`, `target` compared as `{ id, realm }` (CL5, CL6); BEH-BR-074 and BEH-BR-080 a child stop the parent's stop parked is left to that stop, not waited for, when the closing or calling fiber holds a lease on the child (H1) (SPEC-AUDIT-06) (CCR-BR-038)<br>0.16 (2026-11-11): Intro: cascade roots name the refused background restart, and a child's sub-scope close or unmount resumes only a stop parked outside its parent's stop (H1, CL1, CL3); BEH-BR-074 and BEH-BR-080 a child stop the parent's stop parked is never resumed by its sub-scope close or unmount, which only wait, and their `intent-ended` and settling records take the mount or `unmount-requested` record as cause (H1, CL2); BEH-BR-079, BEH-BR-080 `DrainTimeout` carries `realm` (C2) (SPEC-AUDIT-05); BEH-BR-072 a `Conflict` cell or join is not submitted to the `RefusalList` at step 4b (C9) (SPEC-AUDIT-05) (CCR-BR-037)<br>0.15 (2026-11-10): BEH-BR-066 the ordered check list names steps 4a (fingerprints) and 4b (refusal list) (CL3), and `ConfigInvalid` only for a value on a registration already loaded (C8); BEH-BR-074 the resume list and `stop-resumed` `by` name the sub-scope close and `unmount` of a child, with their drain limit; BEH-BR-080 such a resumption is not a cascade (C10) (CCR-BR-036)<br>0.14 (2026-11-10): BEH-BR-066 and BEH-BR-075 `shutdown`'s `WouldDeadlock` is the one decided before the `requested` record, with no record and no join; the carried references named (H1); BEH-BR-079 a refused background restart is a cascade root with no caller (C3) (CCR-BR-035)<br>0.13 (2026-11-10): BEH-BR-068 `replace` and `enable` complete on entering `dormant` too, and a row for a call whose start the `RefusalList` refuses after step 4b (completes on `disabled`, `completed` record, `start-refused` caused by its `requested` record) (H3); BEH-BR-073 names the system stop of a refused background restart, reason "refused-digest", `next` "disabled" (C5) (CCR-BR-034)<br>0.12 (2026-11-09): BEH-BR-071 `starting` row: a `restart` or `reconfigure` that supersedes a build keeps a held handoff value for the next build, and a call that arrives while a build imports handed-off state waits for the build step and is decided against the state it lands in (U-02) (CCR-BR-033)<br>0.11 (2026-11-09): BEH-BR-073 covers every system stop, the idle return of a lazy plugin (reason "idle", `next` "dormant") named (C-06); BEH-BR-075 every stop under shutdown ends "gone" or `failed(cleanup)` and nothing starts; BEH-BR-080 a resumed stop under shutdown unregisters the plugin (U-01) (CCR-BR-032)<br>0.10 (2026-11-08): BEH-BR-071 prose: `disabled` split by its reason (CCR-BR-026)<br>0.9 (2026-11-08): BEH-BR-071 gains the row "disabled (refused-digest)" (28, BEH-BR-267) (CCR-BR-026)<br>0.8 (2026-11-08): `unknown` row registers → `dormant` too; BEH-BR-065: realm turn for registrations into a realm and `retireRealm` (CCR-BR-022)<br>0.7 (2026-11-08): BEH-BR-071 gains the `dormant` row, failure phase "load" and the lazy `enable` outcome (CCR-BR-017)<br>0.6 (2026-10-03): `InstallError` among the named outcomes of BEH-BR-069; a child's parked removal resumed only by `remove` among operator calls (BEH-BR-125) in BEH-BR-073 and BEH-BR-074; a resumer's terminal `causationId` deferred to BEH-BR-200 (consistency pass) (CCR-BR-013)<br>0.5 (2026-10-02): Parked operations and parked system stops, resumption and interruption made total; cascade drain limit and bound; children removed; re-entrancy from builds and finalizers; second pass: one parking rule for a failing call, `intent-ended` record and `resumes` link, outcome after a resumed system stop, shutdown never parks, child→parent mount edges, stops take no slot, revert of every override change under an ended intent (CCR-BR-008)<br>0.4 (2026-10-02): Interruption before intent ends with a failed record; a parked call's records are final (findings G14, G15) (CCR-BR-007)<br>0.3 (2026-10-02): BEH-BR-078–080 added and BEH-BR-074 extended for cross-plugin stop ordering (CCR-BR-006)<br>0.2 (2026-10-02): Consistency fixes from independent review (CCR-BR-002)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001) |

---

This file specifies what happens when an operation names a plugin: in what
order concurrent operations on one plugin take effect, when an operation's
intent is fixed, why interrupting a caller does not cancel what it asked for,
when each operation completes, and — in two tables that together are total —
the outcome of every operation in every state and against every operation
already in flight. It converts the SPEC.md section "Operation semantics and
races" and the linearization sentence of "State and lifecycle", and applies
the settled legality decisions that close the gaps SPEC.md left. This file
owns BEH-BR-065–080 and uses all sixteen; 078–080 order stops that cross
plugins ([ADR-BR-038](../decisions/038-cross-plugin-stop-ordering.md)).

The eight operations that name a plugin — `install`, `remove`, `replace`,
`retry`, `reconfigure`, `restart`, `disable`, `enable` — are mutating
operations. Each is attributed, gated and audited as specified in
[22 — Attributable Operations](../behaviors/22-attributable-operations.md) and
[23 — Audit Sink and Record](../behaviors/23-audit-sink-and-record.md); this
file fixes only where in that sequence legality is decided, and does not
repeat the audit rules.

Three terms are used throughout ([Glossary](../glossary.md)). A *transition
step* is one build, or one stop, of one plugin; at most one runs per plugin at
a time. A stop step begins when the plugin becomes `stopping` and includes
waiting for its dependents' stops, its lease drain and its scope close. The
numbered stages of a call (BEH-BR-188) are always written "step N of
BEH-BR-188" and are never transition steps. A *cascade* is the stop of a
dependent that a provider's stop requires (BEH-BR-043); its *cascade root* is
what began the provider's stop — an operator call (the *cascading call*), a
runtime failure, a dependency-loss stop, a refused background restart (a
refused `whenAvailable` re-run included), or shutdown; the close of a child's
sub-scope and `Plugin.Runtime.unmount` remove a child without a cascade
(14 — Children and Groups, BEH-BR-121), and are the root, with no caller, of
the cascades that stop the child's own dependents. A stop is *parked* when
its drain expired without `force`, or when the failing call that drove it
left it unsettled, and it waits for a call, a cascade or shutdown to resume
it — or, for a child whose stop was parked outside its parent's stop, before
the parent's stop has begun (from the revision in which the parent becomes
`stopping` or shutdown begins), the close of its sub-scope or its `unmount`
(BEH-BR-121): a *parked operation*
is an operator operation's stop, a *parked system
stop* a dependency-loss stop (BEH-BR-074). Only stops driven by an operator
call — its own stop, or a cascade whose root is an operator call — park.

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
REQUIREMENT: A plugin MUST run at most one transition step at any time,
             and MUST have at most one operator operation in flight
             (BEH-BR-072). A parked stop (BEH-BR-074) stays in flight but
             runs no transition step until it is resumed. Operations on
             different plugins MUST NOT be ordered against each other except
             through dependency ordering (05 — Activation, 06 — Removal, and
             BEH-BR-078–080).
```

```
REQUIREMENT: For `install`, the plugin is the pair (`options.realm`,
             `plugin.id`); for `replace`, (`options.realm`, `plugin.id`);
             for every other operation, the plugin named by its `PluginRef`.
```

```
REQUIREMENT: An operation that registers a plugin into a realm other than
             "default" MUST also take that realm's turn at its
             linearization point and re-validate there that the realm is
             defined, failing with `UnknownRealm` and registering nothing
             when it was retired after validation; `retireRealm` takes the
             same turn ([33 — Realm Families](./33-realm-families.md),
             BEH-BR-335). The realm turn orders only registrations and
             retirement of one realm; it does not serialise other
             operations.
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
             a value supplied to `reconfigure` of a registration already
             loaded — a value for one not yet loaded is stored undecoded,
             27 — Manifest and Lazy Activation, BEH-BR-247); the
             configuration fingerprints (step 4a); the refusal list (step
             4b); the `OperationGate`; the `requested` audit record; the
             `WouldDeadlock` check; and then its linearization point, where
             its intent is recorded (22 — Attributable Operations,
             BEH-BR-188; CCR-BR-036).
```

```
REQUIREMENT: `WouldDeadlock` MUST be decided after the `requested` record
             and before the intent is recorded: at step 7 of BEH-BR-188
             before the call waits for anything, and again at the
             linearization point immediately before the intent is recorded.
             A call that fails with it MUST change nothing and MUST be
             recorded with a `failed` terminal record. The one exception is
             `shutdown`, which decides `WouldDeadlock` from the calling
             fiber alone, before its `requested` record, and when refused
             writes no record and joins nothing (12 — Shutdown and Hosting,
             BEH-BR-105; 22 — Attributable Operations, BEH-BR-188).
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

`WouldDeadlock` is not one of the early checks. Whether the call would wait
for a plugin that the calling fiber holds — through a lease, or because the
fiber runs that plugin's build, `load` or one of its finalizers, or was
forked and awaited by such a fiber ([09 — Leases](./09-leases.md),
BEH-BR-088) —
depends on what is in flight when the call gets there, so it is decided
after the `requested` record and before the intent, and a call refused for
it leaves a `requested` record answered by a `failed` one. It is checked
twice. At step 7 of BEH-BR-188 it runs before the call waits for anything —
its turn behind earlier calls, or a running system stop (BEH-BR-073), the
only waits before the intent. At the linearization point it runs again,
because only there is it known whether the call joins or supersedes an
operation in flight, or will wait after its intent for a running build or
stop on its target to settle (BEH-BR-071), and so whether it would wait for
a held plugin.

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
             leave the host unchanged, and MUST end the call by the stage it
             had reached (22 — Attributable Operations, BEH-BR-188), with
             records written only when an `AuditSink` is wired:
             - during steps 1–4 of BEH-BR-188: no record;
             - during step 5, while the `OperationGate` is deciding: the
               `rejected` record ("caller-interrupted") of 25 — Operation
               Gate, BEH-BR-221;
             - after its `requested` record is enqueued: a `failed` terminal
               record whose `error._tag` is "Interrupted" — including while
               it waits for that record to be written, for its turn at the
               linearization point, or for a running system stop to settle
               (BEH-BR-073), the only waits before its intent.
             A call that waits after its intent is recorded — for a running
             build or stop on its target to settle (BEH-BR-071), or for an
             operation it joined — is past its intent, and the previous
             requirement applies.
```

```
REQUIREMENT: The passage from the gate's approval (or from the end of step 4
             of BEH-BR-188 when no gate is wired) to the enqueue of the
             `requested` record MUST be uninterruptible, so that an approval
             is never consumed without a record.
```

```
REQUIREMENT: A call MUST have exactly one terminal record; the first
             terminal cause wins. A call interrupted while it waits for its
             `requested` record to be written MUST end `failed` with
             "Interrupted", and no `AuditUnavailable` record MUST follow when
             that record is later written; a call whose `auditTimeout`
             expired before any interruption MUST end with
             `AuditUnavailable` (23 — Audit Sink and Record, BEH-BR-203).
             The "Interrupted" record MUST be written by the host's call
             path — an interruption finalizer of the call — not by the
             reconciler.
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

Apart from waiting for its `requested` record to be written, a call waits
before its intent only for its turn behind earlier calls on the plugin and
for a running system stop. A call that meets a running system stop records
its intent only after waiting for it — when the stop has settled, or when
the call resumes it because it parked (BEH-BR-073, BEH-BR-074). The same line
applies there: before that moment an interruption ends the call with
"Interrupted" and changes nothing; after it, only the wait ends. A call that
waits for a build to settle on a `starting` plugin (BEH-BR-071) has already
recorded its intent, so an interruption there ends only its wait.

**Settled here.** CCR-BR-007 gave a call interrupted before its intent a
`failed` record, but left three things open: what an interruption during the
gate's decision writes, whether the gate's approval could be consumed with
no record of it, and which record wins when an interruption and an audit
timeout both occur. CCR-BR-008 settles them: the gate's own
"caller-interrupted" refusal covers the decision, the stretch from approval
to the enqueued `requested` record cannot be interrupted, and the first
terminal cause wins, so a call never has two terminal records. The
"Interrupted" record comes from the call's own interruption finalizer because
the reconciler has not yet heard of a call that has no intent.

## BEH-BR-068: When each operation completes

> **See:** [ADR-BR-012](../decisions/012-intent-and-linearization.md)
> **Satisfies:** [URS-BR-004](../urs.md#urs-br-004-know-why-a-plugin-is-not-running)

| Operation | Completes successfully when |
| --- | --- |
| `install` | the plugin's first snapshot entry has been published (03) |
| `remove` | the plugin has no snapshot entry (06) |
| `replace` | the new definition is registered and the plugin has entered `starting`, `waiting`, `dormant` or `disabled` (07; 27) |
| `retry` | the plugin has entered `starting` or `waiting` (07) |
| `reconfigure` | the plugin has re-entered `starting` or `waiting`; or, for a plugin that is not restarted, the override is stored or cleared (and volatile values published) (11) |
| `restart` | the plugin has re-entered `starting` or `waiting` (07) |
| `disable` | the plugin is `disabled` (07) |
| `enable` | the plugin has entered `starting`, `waiting` or `dormant` (07; 27, BEH-BR-247) |
| a call whose start a wired `RefusalList` refuses after its step 4b passed (28, BEH-BR-267) | the plugin has entered `disabled` with reason "refused-digest", in place of the state named above; the call succeeds, its terminal record is `completed`, and the `start-refused` record takes the call's `requested` record as its cause (22, BEH-BR-190) |
| any no-op | at its linearization point |
| any joined call | when the call it joined completes, with the same result — except a call that joins a parked operation, which resumes it (next row) |
| a call that joins or supersedes a parked operation | when the resumed operation — the operation BEH-BR-072's row names: the one in flight when the call joins, this call's own when it supersedes — reaches the point given above; the call is its owner (BEH-BR-074) |
| a call that resumes a parked system stop | at the point given above for its own operation, decided against the state the plugin landed in (BEH-BR-073, BEH-BR-074); when the stop removed the plugin, `remove` completes successfully then and any other operation fails with `UnknownPlugin` |

```
REQUIREMENT: Each operation MUST complete successfully exactly at the point
             given in the table above, and no earlier.
```

```
REQUIREMENT: An operation MUST NOT wait for a build that it starts to
             finish. The outcome of that build is state, read from the
             snapshot or from `PluginHandle.awaitActive`. Waiting for a
             build already running to settle (BEH-BR-069, BEH-BR-079) is
             not waiting for its outcome.
```

An operation that waited for its build would turn an activation outcome into an
operation error, which [03 — Installation](./03-installation.md) rules out for
`install` for good reasons that apply equally to every reactivating operation.
Completing at a fixed, observable point means a caller that reads the snapshot
after its call returns always sees the effect of its call.

**Settled here.** SPEC.md fixes the completion point of `remove` only ("after
cleanup"). The table fixes the others, consistently with `install`: an
operation completes when the state it asked for has been entered, never on a
later build. A joined call shares its result because the call it joined is
still waiting for the same outcome; a parked call is not — it has already
returned `DrainTimeout` — so a call that joins it resumes the operation and
completes as its owner (CCR-BR-008).

## BEH-BR-069: Outcome kinds — proceed, no-op, join, supersede, conflict

> **Invariant:** [INV-BR-011](../invariants.md#inv-br-011-every-state-and-operation-pair-has-a-defined-outcome)
> **See:** [ADR-BR-013](../decisions/013-total-operation-legality.md)
> **Risk:** [RSK-BR-019](../gxp/03-risk-assessment.md#rsk-br-019)

```ts
// illustrative — not type-checked
class Conflict   extends Schema.TaggedError<Conflict>()("Conflict", { id: Schema.String, pending: Schema.String, reason: Schema.optional(Schema.Literal("cold-mismatch")) }) {}
class Superseded extends Schema.TaggedError<Superseded>()("Superseded", { id: Schema.String }) {}
// pending: the operation in flight ("remove", "replace", "restart", "reconfigure", "disable"),
//          or "disabled", or "cleanup-failure",
//          or "dependency-loss" (a parked system stop; BEH-BR-073)
// reason: "cold-mismatch" only when the call would join with a different `cold` (BEH-BR-072); absent otherwise
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
               `DuplicatePlugin`, `InstallError`, `HostClosed`).
             A join or supersede of a parked operation is a resumption
             instead (BEH-BR-074): the call becomes the operation's owner
             and completes with its outcome. A parked operation has no
             waiting callers to supersede.
```

```
REQUIREMENT: A superseding call MUST NOT interrupt a transition step in
             progress: a running build or stop MUST settle first, and the
             transition then continues toward the superseding call's
             target.
```

A no-op still succeeds and is still audited, with phase `completed` and
`noop: true` ([23 — Audit Sink and Record](../behaviors/23-audit-sink-and-record.md)):
the operator asked for something, and the record shows that the host found
nothing to do. A joined call is audited with a `joined` record that links it
to the call it joined. A superseded caller's operation is audited as
`superseded`. A call that resumes a parked operation is audited with its own
`completed` or `failed` record, never `joined` or `superseded`, and that
record's `resumes` names the parked call's `requested` record (BEH-BR-074).

The pattern behind the tables is a strength order among stopping operations:
`remove` is strongest; `replace` and `disable` are next and incomparable with
each other; `restart` and `reconfigure` are weakest. A later, stronger
operation supersedes an earlier, weaker one; a later, weaker or incomparable
one conflicts; equal operations join (or, for two `replace`s and two
`reconfigure`s with different values, the later wins). `retry` and `enable`
conflict with every operation in flight, and with a parked system stop
(`pending` "dependency-loss", BEH-BR-073).

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

```
REQUIREMENT: A call that resumes a parked system stop (BEH-BR-073,
             BEH-BR-074) and is refused when it is decided after the stop
             settles MUST change nothing of its own, and its refusal MUST be
             its `failed` terminal record. The change the resumed stop itself
             made — the plugin landing where a dependency-loss stop leads, or
             a child's removal — is not the call's and MUST NOT be undone.
```

The caller of a refused call can retry it, or issue something else, knowing
the host is exactly as it was. The one exception is a call that resumed a
parked system stop: it finished a stop the system had begun, and the host is
as that stop left it. Which events and audit records a refusal
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
| **unknown** | registers → `dormant`, `waiting`, `starting` or `disabled` | `UnknownPlugin` | `UnknownPlugin` | `UnknownPlugin` | `UnknownPlugin` | `UnknownPlugin` | `UnknownPlugin` | `UnknownPlugin` |
| **dormant** | `DuplicatePlugin` | unregisters at once; nothing was loaded | swap → `dormant` (lazy) or starting/waiting (eager); triggers re-applied | no-op | stores or clears the raw override; not decoded until load | no-op | → `disabled` | no-op |
| **waiting** | `DuplicatePlugin` | unregisters at once | swap → starting/waiting | no-op | stores or clears the override; nothing to restart | no-op | → `disabled` | no-op |
| **starting** | `DuplicatePlugin` | build settles, result discarded → gone | supersedes the target: build settles, discarded; swap → starting/waiting (a held handoff value is abandoned with `HandoffAbandoned`, or with the skip record when the call passes `cold: true`: 34, BEH-BR-351) | no-op | override stored; build settles, discarded; builds again (a held handoff value stays held, unless the superseding call passes `cold: true`: 34, BEH-BR-351) | supersedes the build: it settles, discarded; builds again (a held handoff value stays held, unless the superseding call passes `cold: true`: 34, BEH-BR-351) | build settles, discarded → `disabled` | no-op |
| **active** | `DuplicatePlugin` | stop → gone | stop, swap → starting/waiting | no-op | stop → starting/waiting; volatile-only: in place, no state change | stop → starting/waiting | stop → `disabled` | no-op |
| **stopping** | `DuplicatePlugin` | BEH-BR-072, 073, 074, 080 | BEH-BR-072, 073, 074, 080 | BEH-BR-072, 073, 074, 080 | BEH-BR-072, 073, 074, 080 | BEH-BR-072, 073, 074, 080 | BEH-BR-072, 073, 074, 080 | BEH-BR-072, 073, 074, 080 |
| **failed** (load, build, activation, runtime) | `DuplicatePlugin` | unregisters | swap → starting/waiting | → starting/waiting | → starting/waiting | as `retry` → starting/waiting | → `disabled` | no-op |
| **failed(cleanup)** | `DuplicatePlugin` | unregisters; leak acknowledged; cleanup not re-run | Conflict (cleanup-failure) | Conflict (cleanup-failure) | Conflict (cleanup-failure) | Conflict (cleanup-failure) | Conflict (cleanup-failure) | Conflict (cleanup-failure) |
| **disabled** | `DuplicatePlugin` | unregisters | swap; stays `disabled` | Conflict (disabled) | stores or clears the override for the next `enable` | Conflict (disabled) | no-op (joins the state) | re-check → starting/waiting (or `dormant`, lazy and not loaded), or `InstallError` |
| **disabled (refused-digest)** | `DuplicatePlugin` | unregisters | incoming digest refused: `OperationRejected` at step 4b; otherwise swap → starting/waiting (or `dormant`), reason cleared | Conflict (disabled) | stores or clears the override for the next `enable` | Conflict (disabled) | → `disabled` by the operator; reason cleared | digest still refused: `OperationRejected` at step 4b; otherwise as **disabled**, reason cleared |
| **host closing** | `HostClosed` | `HostClosed` | `HostClosed` | `HostClosed` | `HostClosed` | `HostClosed` | `HostClosed` | `HostClosed` |

```
REQUIREMENT: When no operation is in flight on the plugin, every operation
             MUST have exactly the outcome given by this table for the
             plugin's state.
```

A `replace` with a lazy definition lands in `dormant` where a cell says
starting/waiting, and the `dormant` row is specified with its rules in
[27 — Manifest and Lazy Activation](./27-manifest-and-lazy-activation.md)
(BEH-BR-247, CCR-BR-017); the settled rows are now eight states by eight
operations, with `disabled` split by its reason: a plugin the `RefusalList`
disabled has its own row (28 — Plugin Principal and Mandatory Policy,
BEH-BR-267, CCR-BR-026).

```
REQUIREMENT: Every cell of this table and of BEH-BR-072 MUST be an
             acceptance check of the core (21 — Testing Host).
```

```
REQUIREMENT: While a build of a plugin imports handed-off state (34 — State
             Handoff, BEH-BR-349), an operator call that reaches its
             linearization point MUST NOT be decided by the `starting` row:
             it MUST wait, before its intent is recorded, until the build
             step has ended, and MUST then be decided by this table against
             the state the plugin landed in — `active`, or `failed` when the
             import failed — as BEH-BR-073 decides a call that meets a
             running system stop.
```

A `starting` plugin "with a build running" and one still queued behave the
same in this table, except that a queued plugin has no build to settle and its
transition step completes at once. A build whose result is discarded keeps
nothing of a handoff: a value handed off by the `replace`, `restart` or
`reconfigure` that started the plugin stays held for the build that follows,
and is abandoned only by a change after which no build of the registration
will be published, or by a call with `cold: true` that supersedes the build
(34 — State Handoff, BEH-BR-351). Once a build has begun
importing that value it is committed to publication or failure, so the
`starting` row no longer applies to it (CCR-BR-033). A `stopping` plugin is decided by
BEH-BR-072 while an operator operation is in flight (parked or not, and
including a call that resumed a parked system stop), by
BEH-BR-073 while a system stop runs or is parked, and by BEH-BR-074 and
BEH-BR-080 for how a parked stop resumes and what a cascade does to it. A
`reconfigure` with a value is decoded before anything else (`ConfigInvalid`
leaves everything untouched, [11 — Configuration](./11-configuration.md));
`reconfigure` of a `starting` plugin always rebuilds, because the build in
flight read the old value.

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
plugin — from its linearization point until it completes or its intent is
ended (BEH-BR-080), including while it is parked (BEH-BR-074). A call that
resumes a parked system stop is the operation in flight from the resumption
(BEH-BR-074). Rows are the operation in flight; columns the incoming call.
"Supersedes" means the incoming call wins and the earlier caller completes
with `Superseded` (BEH-BR-069). Against a parked operation, "joins" and
"supersedes" are resumptions (BEH-BR-074): the incoming call resumes the stop
and becomes the operation's owner, and the parked caller, which has already
received its terminal outcome, is told nothing more. The resumed operation
is the one the row names: the operation in flight when the call joins, the
incoming one when it supersedes. Once a cascade ends a parked intent and
leaves a parked system stop (BEH-BR-080), BEH-BR-073 and BEH-BR-074 apply to
the plugin instead of this table.

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
             table. An incoming call whose cell is a `Conflict` or a join
             leaves no definition able to start, so a wired `RefusalList`
             is not consulted for it at step 4b and it ends with the cell's
             outcome (28 — Plugin Principal and Mandatory Policy,
             BEH-BR-267; 22 — Attributable Operations, BEH-BR-188;
             CCR-BR-037).
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

```
REQUIREMENT: A join MUST require equal `cold` (absent counts as false): an
             incoming call whose cell is a join, or that would resume a
             parked operation by joining it, and whose `cold` differs from
             the operation in flight's MUST fail with
             `Conflict { id, pending, reason: "cold-mismatch" }`, `pending`
             naming the operation in flight, as a `Conflict` cell does,
             leaving that operation unaffected (34 — State Handoff,
             BEH-BR-353; CCR-BR-039, CCR-BR-040).
```

```
REQUIREMENT: A call that, by this table, joins or supersedes a parked
             operation MUST resume it and become its owner (BEH-BR-074). The
             resumed operation MUST be the one the row names — the operation
             in flight for a join, the incoming one for a supersede — and
             the inspection's `pending.operation` MUST name it from then on,
             as MUST the `endsIntent` of a `stop-resumed` event that later
             ends its intent (BEH-BR-080). The call MUST
             complete with the outcome of the resumed operation and MUST
             write its own terminal record in its own correlation —
             `completed` or `failed` — never `joined` or `superseded`.
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
CCR-BR-008 adds what "joins" and "supersedes" mean against a parked
operation. Neither can mean what it means otherwise: there is no waiting
caller to share a result with or to tell `Superseded`, and a `joined` record
would link the new call to one that writes nothing more, leaving the new
call's outcome unrecorded. The incoming call therefore owns the resumed
operation and records its own outcome.

## BEH-BR-073: A stop the system began settles before an operation applies

> **Invariant:** [INV-BR-009](../invariants.md#inv-br-009-at-most-one-transition-in-flight-per-plugin), [INV-BR-007](../invariants.md#inv-br-007-failure-is-sticky)
> **See:** [ADR-BR-017](../decisions/017-runtime-failure-one-transition.md), [ADR-BR-038](../decisions/038-cross-plugin-stop-ordering.md)
> **Risk:** [RSK-BR-016](../gxp/03-risk-assessment.md#rsk-br-016)

```
REQUIREMENT: When an operator call reaches its linearization point while the
             plugin is `stopping` because of a running system stop — any
             stop the host began without an operator operation: `reason`
             "dependency-loss" or "runtime-failure", "idle" with `next`
             "dormant" for the idle return of a lazy plugin (27 — Manifest
             and Lazy Activation, BEH-BR-252), or "refused-digest" with
             `next` "disabled" for a refused background restart (28 —
             Plugin Principal and Mandatory Policy, BEH-BR-267), or
             "remove" with `next` "gone" for a child's removal by its
             sub-scope close or `Plugin.Runtime.unmount`, a take-over's
             included (14 — Children and Groups, BEH-BR-121, BEH-BR-126);
             not parked — with no
             operator operation in flight, the call MUST wait,
             before its intent is recorded, until that stop has settled, and
             MUST then be decided by BEH-BR-071 against the state the plugin
             landed in. The wait is before the intent: interrupting the
             caller during it ends the call as BEH-BR-067 says, with the
             host unchanged.
```

```
REQUIREMENT: A system stop that no call has resumed MUST NOT be redirected
             or superseded by an operator operation.
```

```
REQUIREMENT: When an operator call reaches its linearization point while the
             plugin's system stop is parked (BEH-BR-074), or when the stop
             it waits for parks:
             - `remove`, `replace`, `restart`, `disable` and `reconfigure`
               MUST resume the parked system stop as BEH-BR-074 requires,
               except on a child whose parked stop has `next` "gone": only
               `remove` resumes it, and every other operation fails with
               `Conflict { id, pending: "remove" }` (14 — Children and
               Groups, BEH-BR-125);
             - `retry` and `enable` MUST fail with
               `Conflict { id, pending: "dependency-loss" }` and change
               nothing;
             - `install` MUST fail with `DuplicatePlugin`.
```

A system stop has no caller to receive `Superseded` and a destination that is
a fact about the world — the provider is gone, the plugin did fail, the
plugin was idle — not a request. Letting it finish and then applying the operator's call to the
result keeps both honest: a `retry` issued during a runtime failure retries
the recorded failure, a `remove` issued during a dependency loss removes the
`waiting` plugin, and a plugin whose stop ended in phase "cleanup" refuses
everything but `remove`.

How long the wait lasts depends on the stop. A runtime-failure stop, and a
dependency-loss stop whose cascade has no caller at its root (a runtime
failure, a dependency-loss stop with no operator call at its root, a refused
background restart, or a child's removal by its sub-scope close or
`Plugin.Runtime.unmount`, for the stops of the child's own dependents —
14 — Children and Groups, BEH-BR-121, BEH-BR-126), drain
under `BridgerOptions.drainTimeout` and revoke on expiry
([10 — Runtime Failure and Health](./10-runtime-failure-and-health.md),
BEH-BR-095; BEH-BR-079), so they settle by themselves unless that limit is
`"forever"`. So does the child's own removal by its sub-scope close or
`unmount` (`reason` "remove"); when that removal took over a stop begun
outside the parent's stop, it runs only once the operation owning that stop
has settled — its stop step under `drainTimeout`, a build it then runs under
`buildTimeout` — and a call meeting that operation is decided by the
in-flight table (BEH-BR-072; 14, BEH-BR-121). A dependency-loss stop whose cascade root is an operator call
drains under that call's `drain` and `force`; when that call fails with
`DrainTimeout` — its drain expired without `force` — the stop does not
settle but parks (BEH-BR-074, BEH-BR-079). A call waiting for it is then
decided by the third requirement, as if it had just arrived, instead of
waiting for a stop that will never settle by itself. Once shutdown has
begun, no stop parks and a call still waiting completes with `HostClosed`
(BEH-BR-075).

A call that resumes a parked system stop is the operation in flight from
that moment (BEH-BR-072, BEH-BR-074), but what it asked for — a
`reconfigure`'s override, a `replace`'s reservations, an unregistration — is
applied only when it is decided, after the stop has settled, against where
the plugin landed.

**Settled here.** CCR-BR-006 stated that every system stop settles by itself
because it revokes on expiry. That holds only where no caller exists to be
told `DrainTimeout`. A dependency-loss stop under an operator's cascade
drains under the operator's options, and revoking there would apply a
`force` the operator never passed (BEH-BR-086), so it parks instead
(CCR-BR-008). An idle return has no caller either: it drains under
`BridgerOptions.drainTimeout` and revokes on expiry, so it never parks and
always settles by itself; until CCR-BR-032 it was named only in file 27, and
this behaviour, which covered dependency-loss and runtime-failure stops,
left a call that met it without a rule. The five operations that resume a
parked stop — `remove`, `replace`,
`restart`, `disable`, `reconfigure` — each stop a running plugin, so
finishing a stop is part of what they ask for. `retry` and `enable` ask only
to start a plugin that is not running; letting them resume a stuck drain
would let a start request decide how leases are ended. They are
refused with `Conflict { pending: "dependency-loss" }` for the same reason
they conflict with every operation in flight (BEH-BR-072), and the caller can
repeat them once the plugin is `waiting`. A call that resumes a parked
system stop owns it, so later calls meet it in the in-flight table; but it
stores nothing until the stop has settled and it is decided, so if its own
drain expires again and a cascade later ends its intent, there is nothing of
it to revert.

## BEH-BR-074: A drain timeout parks the operation in flight

> **Invariant:** [INV-BR-017](../invariants.md#inv-br-017-every-drain-is-bounded-unless-declared-forever), [INV-BR-010](../invariants.md#inv-br-010-intent-survives-caller-interruption)
> **See:** [ADR-BR-015](../decisions/015-leases-one-primitive.md), [ADR-BR-038](../decisions/038-cross-plugin-stop-ordering.md)
> **Satisfies:** [URS-BR-010](../urs.md#urs-br-010-detect-a-plugin-that-waits-forever)
> **Risk:** [RSK-BR-004](../gxp/03-risk-assessment.md#rsk-br-004)

```
REQUIREMENT: When a call fails with `DrainTimeout`, every stop it drives
             that has not settled — its own stop and every dependency-loss
             stop it started, at any depth, including a parked stop it had
             resumed (BEH-BR-080) — MUST park in the same revision. Each
             parked stop MUST stay `stopping` and hidden from new consumers.
             The call's own stop is a parked operation: its intent MUST
             remain recorded and pending, and BEH-BR-072 MUST continue to
             apply with that operation as the one in flight. A parked
             dependency-loss stop is a parked system stop (BEH-BR-073,
             BEH-BR-079, BEH-BR-080). Only the call under whose options the
             drain ran fails; a stop it does not drive is not parked by its
             failure.
```

```
REQUIREMENT: While a stop is parked, the plugin's snapshot entry MUST show
             `parked: true` (04 — States and Snapshots, BEH-BR-027), and its
             inspection MUST show `parked: true` and, for a parked
             operation, `pending` naming that operation, its
             `correlationId` and, when an `AuditSink` is wired, the
             `recordId` of its owner's `requested` record as
             `requestedRecordId` (13 — Observability and Diagnostics).
             Parking MUST emit, for each stop that parks, a `stop-parked`
             event `{ pluginId, realm, leases, target? }`, `target` naming
             the plugin the failing call named as `{ id, realm }` when it
             differs from the plugin `pluginId` and `realm` name, in
             addition to the call's `drain-timeout` event; every
             resumption MUST emit a `stop-resumed` event
             `{ pluginId, realm, by, endsIntent? }`, with `by` "operator",
             "cascade", "shutdown", "sub-scope" or "unmount" (13 —
             Observability and Diagnostics, BEH-BR-114).
```

```
REQUIREMENT: A parked stop MUST NOT complete by itself, even when its leases
             end. It MUST resume only when:
             - a call joins or supersedes the parked operation (BEH-BR-072);
             - `remove`, `replace`, `restart`, `disable` or `reconfigure`
               arrives on a plugin whose system stop is parked (BEH-BR-073;
               on a child whose stop removes it, only `remove`);
             - a stop of one of its providers, or of its parent, needs it
               stopped (BEH-BR-080);
             - shutdown takes it over (BEH-BR-075);
             - for a child whose stop was parked outside its parent's stop,
               before the parent's stop has begun (from the revision in
               which the parent becomes `stopping` or shutdown begins), the
               sub-scope it was mounted under closes, or
               `Plugin.Runtime.unmount` is called for it (14 — Children and
               Groups, BEH-BR-121, BEH-BR-126).
             A call MUST resume it under that call's `drain` and `force`
             options (or the host default); a cascade and shutdown MUST
             resume it under the limits BEH-BR-080 and 12 — Shutdown and
             Hosting give them; a sub-scope close or an `unmount` MUST
             resume it under `BridgerOptions.drainTimeout`, revoking on
             expiry and never parking again (BEH-BR-121; CCR-BR-036). A
             child stop that its parent's stop parked stays with that stop:
             a sub-scope close or an `unmount` never resumes it — it waits
             for it, or, when the closing or calling fiber holds a lease in
             the child's removal set (the child and its dependents,
             transitively), the finalizer leaves it to that stop and
             `unmount` fails with `WouldDeadlock` (BEH-BR-121, BEH-BR-126;
             CCR-BR-037, CCR-BR-038, CCR-BR-039).
```

```
REQUIREMENT: A call that joins or supersedes a parked operation MUST become
             its owner. It MUST complete with the outcome of the resumed
             operation and MUST write its own terminal record in its own
             correlation (`completed` or `failed`), never `joined` or
             `superseded`. That terminal record MUST carry `resumes`, the
             `recordId` of the parked call's `requested` record, and, when
             the resumed operation stores an override (a parked
             `reconfigure`, or a parked `restart` whose override a joining
             `reconfigure` set), `configChange.paths` of that override
             (paths only; 23 — Audit Sink and Record, BEH-BR-200). Its
             `correlationId` and `causationId` are those of any terminal
             record of the resuming call (BEH-BR-200). The system
             records of the resumed stop MUST carry as `causationId` the
             resuming call's `requested` record.
```

```
REQUIREMENT: A call that resumes a parked system stop MUST record its intent
             when it resumes the stop, and is the operation in flight on
             the plugin from then on (BEH-BR-072): an interruption of its
             caller before that moment ends the call as BEH-BR-067 says, and
             afterwards ends only its wait. Until the stop settles, the
             snapshot `reason` MUST name the call's operation and `next` the
             destination of the dependency-loss stop. The system records of
             the resumed stop MUST carry the call's `requested` record as
             `causationId`. The call's own effects — a `reconfigure`'s
             override, a `replace`'s reservations — MUST be applied only
             when it is decided, after the stop settles.
```

```
REQUIREMENT: When the resumed system stop settles, the call MUST be decided by
             BEH-BR-071 against the state the plugin landed in, within the
             same call (for example, `remove` then unregisters the `waiting`
             plugin). When the stop removed the plugin (a child), `remove`
             MUST complete successfully; no other operation can have resumed
             such a stop (14 — Children and Groups, BEH-BR-125). A refusal
             decided then MUST be the call's `failed` terminal record
             (BEH-BR-070).
```

```
REQUIREMENT: When the drain of a stop resumed by a call expires again
             without `force`, that call MUST fail with `DrainTimeout`, and
             the stop MUST park again as that call's parked operation. A
             call that had resumed a parked system stop has stored nothing
             yet, so ending its intent (BEH-BR-080) reverts nothing.
```

```
REQUIREMENT: A parked stop — a parked operation or a parked system stop —
             MUST NOT count as a running transition for `awaitIdle`
             (05 — Activation, BEH-BR-040).
```

```
REQUIREMENT: The call that parked an operation has already received its
             terminal record (`failed`, `DrainTimeout`). When the parked
             operation is later joined, superseded, resumed or ended, the
             host MUST NOT write a further terminal record for that call; the
             outcome is recorded on the call that resumed it, whose
             terminal record carries `resumes`, or — when a cascade,
             shutdown, or a child's sub-scope close or `unmount` ends the
             intent — on the `intent-ended` record, whose
             `endsIntentOf` names the parked call's `requested` record
             (BEH-BR-080).
```

After `DrainTimeout` the caller has been told the change did not complete; a
later, unattended completion would make the plugin set change with no call
that completed it, and no completed record that attributes it. Parking keeps
every completion tied to a call an operator made — the repeated `remove` with
a longer `drain`, or with `force` — and audited as such. For `reconfigure`,
which takes no `drain` option, the joining `restart` is the way to resume with
a longer drain or `force` ([11 — Configuration](./11-configuration.md)).

A system stop parks in the same way when the cascading call that drives it
fails with `DrainTimeout`: every stop that call drives and that has not
settled parks with it, whichever plugin's drain expired, so no stop is left
draining under the options of a call that has already returned (BEH-BR-079,
BEH-BR-080). An operator call of the five listed above that arrives on such
a plugin resumes the stop under its own options and is then decided against
the state the plugin lands in, as BEH-BR-073 requires; otherwise it would
wait for a stop that never settles by itself. A stop resumed by a call that
then expires again parks as that call's operation, because the call's intent
is recorded: from then on it is a parked operation like any other.

A parked stop looks, by `state`, `reason` and `next`, exactly like a stop
still draining; only the second needs no operator. The `parked` flag, the
inspection's `pending`, and the `stop-parked` and `stop-resumed` events make
the difference visible without reading the audit trail, and `awaitIdle` does
not wait for a stop that waits for an operator.

**Settled here.** SPEC.md says only that after `DrainTimeout` "the plugin stays
`stopping` … and the operation can be repeated with a longer `drain`, or with
`force: true`". This specification makes the pending intent explicit, decides
that the stop does not complete on its own, and decides that repeating the
operation (or a superseding one) is what resumes it. CCR-BR-008 decides who
owns a resumed stop: the call that resumes it, which records its own outcome,
since the parked call was already answered; a call that resumes a parked
system stop records its intent at that moment, since until then it only
waited. It also makes parking visible in the snapshot, the inspection and the
event feed, and lists shutdown among what resumes a parked stop. A failing
call parks every unsettled stop it drives, not only its own: a
dependency-loss stop it started would otherwise go on under the options of a
call that has already returned, owned by nobody. A resumer's terminal record
links back to the parked call through `resumes`, so the trail joins the two
calls without a `joined` record.

## BEH-BR-075: A closing host refuses every operation

> **Invariant:** [INV-BR-018](../invariants.md#inv-br-018-shutdown-reports-every-failure)
> **Satisfies:** [URS-BR-008](../urs.md#urs-br-008-shut-down-with-a-report-of-what-failed)

```
REQUIREMENT: Once shutdown has started, every operation that names a plugin
             MUST fail with `HostClosed`. A `shutdown` call MUST join the
             shutdown in progress (12 — Shutdown and Hosting), except one
             refused with `WouldDeadlock` (BEH-BR-105).
```

```
REQUIREMENT: An operation in flight when shutdown starts MUST have its
             current transition step settle; shutdown then takes over the
             plugin, and the operation's caller MUST complete with
             `HostClosed` unless its caller had already received its
             terminal outcome — including a call that parked.
```

```
REQUIREMENT: A stop that shutdown takes over or resumes, and every stop it
             begins, MUST end "gone", or in `failed` with phase "cleanup"
             when its cleanup fails, whatever its earlier destination; a
             plugin MUST NOT enter `starting` once shutdown has begun
             (12 — Shutdown and Hosting, BEH-BR-105).
```

```
REQUIREMENT: Once shutdown has begun, a drain expiry MUST NOT park any stop,
             whoever began it: shutdown MUST take the stop over under its own
             limits, and a call still waiting on it MUST complete with
             `HostClosed`. Shutdown MUST drain under
             `BridgerOptions.drainTimeout` and revoke only once the overall
             shutdown limit has passed (12 — Shutdown and Hosting,
             BEH-BR-105, BEH-BR-107); it never parks.
```

```
REQUIREMENT: Shutdown MUST resume every parked stop — a parked operation or
             a parked system stop — under those limits, and the plugin's
             snapshot `reason` MUST become "shutdown". A parked operator
             intent MUST end there as BEH-BR-080 requires: its remaining
             actions MUST NOT run, the reservations of a parked `replace`
             MUST be released, every override change made under it MUST
             revert, and the `intent-ended` record MUST be written in that
             revision with shutdown's `requested` record as `causationId`.
             The call that parked it MUST receive nothing more
             (BEH-BR-074).
```

**Settled here.** SPEC.md says new operations fail with `HostClosed` once
shutdown starts, but not what happens to one already in flight. Its
transition step settles — nothing is abandoned mid-cleanup — and shutdown's
own dependents-first stop then decides the plugin's end, which the
`CloseReport` records. The caller is told `HostClosed` because the outcome it
asked for was overtaken; telling it success could misstate where the plugin
ended. A caller whose operation parked was already told `DrainTimeout`; that
is its one terminal outcome, and shutdown adds none (CCR-BR-008). Nothing
parks once shutdown has begun, because every call that could resume a parked
stop now fails with `HostClosed`: shutdown takes the stop over, and the
`intent-ended` record shows in the trail that an ended operator change will
not happen.

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
             run concurrently with another transition step on the same
             plugin.
```

One legality model for every route means a handle cannot do what the host
refuses, and `reconcile` cannot reach a state that the same sequence of
individual calls could not. That is also what keeps the `OperationGate`
unavoidable: there is no second entry point with its own rules
([25 — Operation Gate](./25-operation-gate.md)).

## BEH-BR-078: Operations on different plugins never wait for each other

> **Invariant:** [INV-BR-030](../invariants.md#inv-br-030-host-transitions-never-wait-on-each-other-in-a-cycle), [INV-BR-009](../invariants.md#inv-br-009-at-most-one-transition-in-flight-per-plugin)
> **See:** [ADR-BR-038](../decisions/038-cross-plugin-stop-ordering.md), [ADR-BR-012](../decisions/012-intent-and-linearization.md)
> **Satisfies:** [URS-BR-002](../urs.md#urs-br-002-remove-or-replace-a-plugin-safely-while-it-is-in-use)
> **Risk:** [RSK-BR-023](../gxp/03-risk-assessment.md#rsk-br-023)

```
REQUIREMENT: The host MUST NOT order operations by a host-wide lock. A call
             of an operation that names a plugin MUST NOT wait for a call on
             another plugin to pass steps 1–7 of BEH-BR-188, to reach its
             linearization point, or to finish a transition step, except
             where this file and 06 — Removal make one plugin's stop wait
             for its dependents. `reconcile`, which serializes its entries
             (18 — Reconciliation and Confluence, BEH-BR-156), and
             `awaitIdle` (05 — Activation, BEH-BR-040) are outside this
             rule.
```

```
REQUIREMENT: A transition step on plugin P MUST wait only for transition
             steps of plugins that depend on P (directly or transitively,
             through captured services or as children), and for leases on P
             and on those plugins. A `whenAvailable` block holding a service
             of P MUST be interrupted and its finalizers awaited as a lease
             on P (15 — Optional and Reactive Dependencies, BEH-BR-133); P's
             stop MUST NOT wait for a transition step of the block's plugin
             and MUST NOT stop that plugin on account of the block. That
             plugin is still stopped, or removed, when it is otherwise a
             dependent or a child of P. A transition step on P MUST NOT wait
             for a transition step of a provider of P or of any plugin
             unrelated to P.
```

```
REQUIREMENT: A build MAY wait for a free `concurrency` slot (05 — Activation,
             BEH-BR-034). The host MUST NOT make a build wait for a
             transition step of another plugin; a wait that the build's own
             author code introduces is bounded by `buildTimeout`
             (BEH-BR-040). `BridgerOptions.concurrency` bounds builds only:
             a stop step MUST NOT take a slot or wait for any slot, and
             stops of independent subtrees run concurrently.
```

A child install whose dependency or mount edges would close a cycle is
refused with `DependencyCycle { path }` and registers nothing, as
[14 — Children and Groups](./14-children-and-groups.md) (BEH-BR-121)
requires; whether that fails the parent's build is the parent author's choice.

A *transition step* is one build, or one stop, of one plugin; at most one
runs per plugin at a time, and a stop step includes waiting for the
dependents' stops, the lease drain and the scope close. The graph of
[INV-BR-002](../invariants.md#inv-br-002-the-dependency-graph-is-acyclic-per-resolution-scope)
is acyclic and has two kinds of edge: dependency edges, from a dependent to
its provider, and mount edges, from a child to the parent that mounted it (a
child depends on its parent). A child that requires its parent's services is
therefore legal; a parent that requires a service of its own child closes a
cycle. Waits run only against those edges — from a provider to its
dependents, from a parent to its children — so no two host transitions can
wait on each other, and no lock order has to be maintained to keep it so. A
cycle can be closed only by code that runs inside a lease, a build or a
finalizer of an activation scope and calls the host. The carried references
catch it within the fiber tree: a lease holder carries its provider in
`@bridger/core/HeldPlugins`; a fiber running P's build, `load` or one of P's
finalizers carries P in `@bridger/core/CurrentTransition`, and so does every
fiber it forks and awaits before returning, while fibers forked into the
activation scope (`background`, `whenAvailable`) carry only the leases they
hold; such a call fails with `WouldDeadlock`
([09 — Leases](./09-leases.md), BEH-BR-088).
A hand-off to another fiber that does not carry the reference remains the
residual of [RSK-BR-011](../gxp/03-risk-assessment.md#rsk-br-011), bounded by
the drain limits and `buildTimeout`.

The audit writer of [23 — Audit Sink and Record](./23-audit-sink-and-record.md)
is shared by every call, but it orders records, not operations: a call waits
there for its own `requested` record, never for another call's transition.

**Settled here.** The host-core prototype first linearized every operator
operation host-wide. That was correct but made an `install` of one plugin
wait behind a drain of another, and made a lease callback that issued any
mutating call block until an unrelated drain timed out (URS gap G11).
CCR-BR-008 corrects three overstatements of CCR-BR-006. The no-wait rule is
scoped to operations that name a plugin, because `reconcile` and `awaitIdle`
wait across plugins by design. A build can wait — for a `concurrency` slot,
or on whatever its author's code awaits — so the rule says which waits the
host imposes and how the others are bounded; stops take no slot, so a
provider's stop never queues behind builds. And a lease callback is not the
only code that can call the host from inside a plugin's transition: a build
and a finalizer can too, so the carried reference covers them
([ADR-BR-016](../decisions/016-reentrancy-detection.md)). The child-cycle rule
moved to 14, where `Plugin.Runtime.install` is specified, because the install
fails, not the parent's activation. Mount edges point from child to parent,
the same way as dependency edges: a child depends on the parent that mounted
it, so a child may use its parent's services and a parent may not use its
child's.

## BEH-BR-079: A cascade waits for a dependent's step, never for its operation

> **Invariant:** [INV-BR-030](../invariants.md#inv-br-030-host-transitions-never-wait-on-each-other-in-a-cycle), [INV-BR-005](../invariants.md#inv-br-005-dependents-stop-before-their-providers)
> **See:** [ADR-BR-038](../decisions/038-cross-plugin-stop-ordering.md)
> **Satisfies:** [URS-BR-002](../urs.md#urs-br-002-remove-or-replace-a-plugin-safely-while-it-is-in-use), [URS-BR-005](../urs.md#urs-br-005-never-lose-a-provider-in-the-middle-of-a-call)
> **Risk:** [RSK-BR-023](../gxp/03-risk-assessment.md#rsk-br-023), [RSK-BR-019](../gxp/03-risk-assessment.md#rsk-br-019)

```
REQUIREMENT: When stopping P needs a dependent D stopped (06 — Removal,
             BEH-BR-043), no transition step is running on D and D's stop
             is not parked, the host MUST start a stop of D with `reason`
             "dependency-loss".
```

```
REQUIREMENT: When the cascade root is an operator call, that stop MUST drain
             under the cascading call's `drain` and `force` options (or the
             host default). On expiry without `force` the cascading call
             MUST fail with `DrainTimeout { id, realm?, leases, target? }` —
             `id` and `realm` naming D, `target` the plugin the call named
             as `{ id, realm }` — and every stop
             it drives that has not settled MUST park in the same revision
             (BEH-BR-074), D's as a parked system stop with `reason`
             "dependency-loss". Its system records MUST carry the cascading
             call's `requested` record as `causationId`, the cascade root's
             record (22 — Attributable Operations, BEH-BR-190).
```

```
REQUIREMENT: When the cascade has no caller at its root — a runtime failure,
             a dependency-loss stop with no operator call at its root, a
             refused background restart (28 — Plugin Principal and
             Mandatory Policy, BEH-BR-267), shutdown, or a child's removal
             by its sub-scope close or `Plugin.Runtime.unmount` (for the
             stops of the child's own dependents; 14 — Children and Groups,
             BEH-BR-121, BEH-BR-126) — the stop MUST
             drain under `BridgerOptions.drainTimeout`, MUST NOT park, and MUST revoke
             the remaining leases on expiry (09 — Leases, BEH-BR-086;
             10 — Runtime Failure and Health, BEH-BR-095) — under
             shutdown, only once the overall shutdown limit has passed
             (12 — Shutdown and Hosting, BEH-BR-105, BEH-BR-107). Its system
             records MUST carry the `causationId` that 22 — Attributable
             Operations, BEH-BR-190, gives for the cascade's root.
```

```
REQUIREMENT: When a transition step is running on D — a build or a stop,
             owned by an operator operation, a system transition or another
             cascade — the cascade MUST wait for that step to settle, and
             MUST then stop D only if D still holds a service of P (or, when
             D is a child of P, remove D as required below).
```

```
REQUIREMENT: While a cascade waits for a running transition step of D — a
             stop or a build — the cascading call's own drain limit MUST
             run. On expiry without `force` the cascading call MUST fail
             with `DrainTimeout` (`id` and `realm` naming D, `leases` D's
             remaining leases, or 0 when D's step is a build, `target` the
             plugin the call named), and every stop it drives that has not
             settled — its own stop and every dependency-loss stop it
             started — MUST park in the same revision (BEH-BR-074); D's
             step continues
             under its owner's options. With `force`, D's remaining leases
             MUST be revoked (09 — Leases, BEH-BR-086); a build has none,
             and the wait for it continues, bounded by `buildTimeout`. A
             cascade with no caller at its root waits under
             `BridgerOptions.drainTimeout` and revokes on expiry; when the
             step it waits for is a build, an expiry continues the wait
             under `buildTimeout`.
```

```
REQUIREMENT: When D is a child of P, P's stop MUST remove D — stop it, then
             unregister it — as a dependent, before P's scope begins to
             close, whatever services D holds (06 — Removal, BEH-BR-043;
             14 — Children and Groups, BEH-BR-121, BEH-BR-125). D's system
             records MUST carry the `causationId` that 22 — Attributable
             Operations, BEH-BR-190, gives for the cascade root: when P was
             stopped directly by an operator call, that call's `requested`
             record. A parked operation on D MUST end as BEH-BR-080
             requires, and D MUST be removed when its stop completes; if
             the resumed drain expires again, D's stop MUST become a parked
             system stop with `next` "gone".
```

```
REQUIREMENT: A cascade MUST NOT join, supersede, redirect or cancel an
             operator operation in flight on D that is not parked
             (BEH-BR-074). That operation MUST continue after its transition
             step settles, and any build it then starts MUST NOT capture P.
```

```
REQUIREMENT: When the running transition step on D is a build whose result
             is stale both because an operator operation changed D's target
             and because P is leaving, the operator operation MUST decide
             what follows: the result is discarded (05 — Activation,
             BEH-BR-039) and D proceeds as that operation requires.
```

```
REQUIREMENT: Two cascades that need the same dependent stopped MUST share
             its one stop: the later MUST wait for the transition step the
             earlier started, and MUST NOT start a second stop of D. When
             that stop parks because the call under whose options it drained
             failed with `DrainTimeout`, only that call fails; the later
             cascade MUST then find the stop parked and resume it under its
             own options (BEH-BR-080).
```

Waiting for the transition step rather than the operation keeps a provider's
removal from waiting on work it does not need — the rebuild at the end of a
dependent's `restart` — and from waiting forever on a parked operation. The
step boundary is safe because P was hidden in the revision its stop began
(BEH-BR-042): whatever the dependent's operation does next, it cannot capture
P again, so it lands by availability
([07 — Replacement and Reactivation](./07-replacement-and-reactivation.md),
BEH-BR-057). A child is the exception: it lives only for its parent's
activation, so the parent's stop removes it whatever it holds, once its
running step has settled, and before the parent's own scope begins to close.

A cascading call's total wait is bounded: at most its own drain limit for the
plugin it named and for each plugin on the dependency path below it, plus
`buildTimeout` for each build step it waits for; finalizer running time is
not bounded by the core
([12 — Shutdown and Hosting](./12-shutdown-and-hosting.md), BEH-BR-107), so
the bound assumes finalizers that return. The drain limit runs while the
cascade waits for another owner's transition step, build or stop, so a
dependent's `restart` under `drain: "forever"` cannot hold a provider's
removal for longer than the removal's own limit. Only a drain declared
`"forever"` by the cascading call itself, or by `BridgerOptions.drainTimeout`
for a cascade with no caller, is unbounded
([INV-BR-017](../invariants.md#inv-br-017-every-drain-is-bounded-unless-declared-forever)).

**Settled here.** CCR-BR-006 bounded a cascade by "the limit of the step it
waits for, then its own drain limit". That is no bound when the step it
waits for belongs to an operation under `drain: "forever"`, so CCR-BR-008
runs the cascading call's own limit during that wait and fails the call with
`DrainTimeout` when it expires; `target` tells the caller that the plugin
that did not drain is not the one it named. CCR-BR-006 also left unsaid how
a dependency-loss stop drains: under the operator's options when an operator
call is the cascade root — parking on expiry, since the operator did not pass
`force` — and under the host's limit, revoking, when no caller exists. The
call's limit runs while it waits for a build step too, with `leases` 0 when
it expires, and the failing call parks every unsettled stop it drives, while
another cascade sharing one of those stops is not failed for a limit it did
not set. A child is removed rather than stopped because 14 binds its
lifetime to the parent's activation, and it is removed as a dependent,
before the parent's scope begins to close, so that it never outlives a
service of its parent. Where a stale build is stale for two reasons, the
operator's operation decides, because only it has a caller waiting for a
specific destination.

## BEH-BR-080: A cascade resumes a parked stop and ends the parked intent

> **Invariant:** [INV-BR-017](../invariants.md#inv-br-017-every-drain-is-bounded-unless-declared-forever), [INV-BR-030](../invariants.md#inv-br-030-host-transitions-never-wait-on-each-other-in-a-cycle)
> **See:** [ADR-BR-038](../decisions/038-cross-plugin-stop-ordering.md), [ADR-BR-015](../decisions/015-leases-one-primitive.md)
> **Satisfies:** [URS-BR-010](../urs.md#urs-br-010-detect-a-plugin-that-waits-forever), [URS-BR-021](../urs.md#urs-br-021-know-who-changed-the-plugin-set-when-and-why)
> **Risk:** [RSK-BR-023](../gxp/03-risk-assessment.md#rsk-br-023), [RSK-BR-004](../gxp/03-risk-assessment.md#rsk-br-004)

```
REQUIREMENT: When a cascade needs D stopped and D's stop is parked
             (BEH-BR-074) — a parked operation or a parked system stop — the
             cascade MUST resume that stop: under the cascading call's
             `drain` and `force` options (or the host default) when the
             cascade root is an operator call; otherwise under
             `BridgerOptions.drainTimeout`, never parking and revoking the
             remaining leases on expiry — under shutdown, only once the
             overall shutdown limit has passed (BEH-BR-075, BEH-BR-079). The
             resumption MUST emit a `stop-resumed` event with `by` "cascade"
             (or "shutdown") and, when it ends a parked operator intent,
             `endsIntent` naming that operation — the one BEH-BR-072's row
             names for the parked operation.
```

```
REQUIREMENT: A child's stop parked outside its parent's stop and resumed,
             before the parent's stop has begun, by the close of its
             sub-scope or by `Plugin.Runtime.unmount` is not a cascade: it MUST be resumed as 14 — Children and Groups
             (BEH-BR-121) states, under `BridgerOptions.drainTimeout`,
             revoking on expiry and never parking, ending any parked
             operator intent with its `intent-ended` record, and emitting
             `stop-resumed` with `by` "sub-scope" or "unmount"
             (CCR-BR-036). A child stop that its parent's stop parked is
             not resumed by them: they wait for it under the limits of the
             parent's stop, or leave it to that stop as BEH-BR-121 and
             BEH-BR-126 state (CCR-BR-037, CCR-BR-038).
```

```
REQUIREMENT: When the parked stop was an operator operation's, its intent
             MUST end with the resumption: D's snapshot `reason` MUST become
             "dependency-loss" ("shutdown" under shutdown), D MUST land
             where a dependency-loss stop leads (`waiting`, or `starting`
             when another provider is available) — or, when D is a child of
             P, D MUST be removed when its stop completes (BEH-BR-079); under
             shutdown D MUST be unregistered when its stop completes
             (12 — Shutdown and Hosting, BEH-BR-105) — and
             the parked operation's remaining actions — unregistering,
             disabling, swapping the definition, rebuilding — MUST NOT run.
```

```
REQUIREMENT: In the revision in which a parked operator intent ends, the
             reservations of a parked `replace` (07 — Replacement and
             Reactivation, BEH-BR-050) MUST be released, and every override
             change made under that intent — by the call that began it or
             by a call that joined or resumed it — MUST revert to the
             override in effect before the first of them, the last
             completed configuration (11 — Configuration). An intent that
             stored nothing — that of a call which had resumed a parked
             system stop (BEH-BR-074) — reverts nothing.
```

```
REQUIREMENT: In the revision in which a parked operator intent ends — by a
             cascade that resumes the parked stop, by shutdown
             (BEH-BR-075), or by a child's sub-scope close or `unmount`
             that resumes it (BEH-BR-121) — the host MUST write a system
             record with `operation` "intent-ended", `phase` "system", `actor`
             `Actor.system`, `target` D, `endsIntentOf` set to the
             `recordId` of the `requested` record of the call that parked
             the operation, `configChange.paths` naming every override path
             it reverted (paths only, never values), and the `causationId`
             that 22 — Attributable Operations, BEH-BR-190, gives for what
             ended it: the cascade root's record, the `requested` record
             of `shutdown`, or the child's mount record for a sub-scope
             close and the `unmount-requested` record for an `unmount`
             (23 — Audit Sink and Record). `endsIntentOf` and
             the revert's `configChange` MUST be carried by that record
             only.
```

```
REQUIREMENT: When D's stop settles, it MUST be recorded as an ordinary
             `system-stop` of D whose `causationId` is the one BEH-BR-190
             gives for what drove it to settle: the cascade root's record —
             the cascading call's `requested` record when an operator call
             is the root — or, for a child's stop resumed by its sub-scope
             close or `unmount`, the mount record or the
             `unmount-requested` record (BEH-BR-121).
```

```
REQUIREMENT: When a drain resumed under a cascading call's options expires
             again without `force`, that call — the one under whose options
             the drain ran — MUST fail with
             `DrainTimeout { id, realm?, leases, target? }`, `id` and
             `realm` naming D and `target` the plugin the call named, and
             every stop it drives
             that has not settled MUST park in the same revision
             (BEH-BR-074). The parked operator intent, if any, has already
             ended, its `intent-ended` record written and its remaining
             actions never run, and D's stop MUST become a parked system
             stop: `reason` "dependency-loss", `parked` true, and `next` the
             destination of the dependency-loss stop — "waiting" or
             "starting", "gone" for a child — kept current while it stays
             parked (04 — States and Snapshots, BEH-BR-027). From then on
             BEH-BR-073 and BEH-BR-074 apply to D, not BEH-BR-072. Another
             cascade waiting on that stop MUST NOT fail because that call
             did: it MUST find the stop parked and resume it under its own
             options, as the first requirement says.
```

The parked call has already returned `DrainTimeout`, and its own terminal
record says so. Completing its intent later under a different operator's call
would put a lasting change — a dependent unregistered or disabled — in the
trail under the wrong call, attributed only through a causation link. Ending
the intent with the stop the cascade needed leaves the dependent somewhere the
snapshot explains (`waiting`, with the lost keys) and leaves the operator who
parked the call to issue it again; from `waiting`, a `remove` unregisters at
once and a `disable` applies at once (BEH-BR-071). The `intent-ended` record,
whose `endsIntentOf` names the parked call's `requested` record, and the
`stop-resumed` event's `endsIntent` let the trail and the event feed show
that the intent ended, not merely that a stop ran. The record is written
when the intent ends, before the stop settles, so the trail shows the ended
change even if the resumed drain expires again; the `system-stop` written
when the stop settles stays an ordinary record of the stop.

**Settled here.** CCR-BR-006 left a re-expired resumed stop "owned by the
cascading call", which made a system stop an operator operation that the
in-flight table would then govern, and said nothing of what an ended
`replace` or `reconfigure` leaves behind. CCR-BR-008 makes it a parked system
stop, which the operator calls of BEH-BR-073 can resume, and requires an
ended intent to take back everything it had already changed: a `replace`
releases its reservations, and every override change made under the intent,
by whichever call, reverts to the last completed configuration in the same
revision. An `intent-ended` record of its own names the call whose intent
ended and the reverted paths, so the configuration history stays complete
and no `system-stop` has to carry an operator's outcome. Only the call under
whose options a resumed drain expired is told `DrainTimeout`; another
cascade sharing the stop resumes it under its own limit rather than failing
for one it did not set. A cascade with no caller — a runtime failure, a
dependency-loss stop with no operator at its root, shutdown — has nobody to
tell `DrainTimeout`, so it revokes and never parks.

---

_Previous: [07 — Replacement and Reactivation](./07-replacement-and-reactivation.md)_ · _Next: [09 — Leases](./09-leases.md)_
