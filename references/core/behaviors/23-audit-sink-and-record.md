# 23 — Audit Sink and Record

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-BEH-23                                               |
> | Revision       | 0.4                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.4 (2026-10-02): `AuditRecord.endsIntentOf` and `resumes` (record ids of the parked call's `requested` record); system record `intent-ended`, written when a cascade or shutdown ends a parked intent and carrying the reverted `configChange` paths (not the `system-stop`); record-only `Interrupted` and first-terminal-cause precedence; resumption of a parked operation writes `completed` or `failed`, not `joined` or `superseded`, with `resumes` and the stored override's paths; a `requested` record dropped for overflow fails the call at once with no terminal record; `noop` on a `children: 0` parent record only when `completed`; revocation on paths with no caller (CCR-BR-008)<br>0.3 (2026-10-02): Acknowledgement waits for the drained backlog (prototype finding G13) (CCR-BR-005)<br>0.2 (2026-10-02): Consistency fixes from independent review (CCR-BR-002)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001) |

---

`Host.events` tells a dashboard what happened, and loses the oldest entries
when a subscriber falls behind. That is the right design for diagnostics and
the wrong one for a record of who changed a regulated system. This file adds
the second channel: an optional `AuditSink` port to which the host hands
sequenced, attributed records of the lifecycle changes it makes, one at a
time and in order — losses that core itself causes are signalled by the
audit-degraded latch, not hidden — and the policy that a change which cannot
be recorded is not made. It has no
SPEC.md source section: it is a GxP hook added to the core design
([ADR-BR-030](../decisions/030-audit-sink-port.md),
[ADR-BR-031](../decisions/031-audit-failure-policy.md),
[ADR-BR-033](../decisions/033-no-config-values-in-audit.md)). This file owns
BEH-BR-193–208 and uses all sixteen.

> **What core does not do — and who does**
>
> Core hands records to a sink. It does **not** authenticate the actors it
> records, **store**, **retain**, **archive** or **back up** records, make
> them **durable**, **review** them, manifest or link **electronic
> signatures**, or make them **tamper-evident**. Those are the consumer's
> obligations, or those of the `@bridger/gxp` companion where the consumer
> adopts it; they are specified later in `references/gxp/`. A host with no
> sink wired has no audit trail at all, and says so (BEH-BR-194).

Planned source: `packages/core/src/Audit.ts` and
`packages/core/src/AuditWriter.ts` *(Planned)*. The order in which a call is
checked, gated and recorded is [BEH-BR-188](./22-attributable-operations.md)
in 22 — Attributable Operations; sequence numbers and time are in
[24 — Time, Identifiers and Sequence](./24-time-ids-and-sequence.md).

## BEH-BR-193: The AuditSink port is optional and write-only

> **Invariant:** [INV-BR-026](../invariants.md#inv-br-026-an-unwired-sink-or-gate-changes-nothing)
> **See:** [ADR-BR-030](../decisions/030-audit-sink-port.md)
> **Satisfies:** [URS-BR-022](../urs.md#urs-br-022-obtain-a-complete-ordered-and-gap-detectable-lifecycle-record)
> **Risk:** [RSK-BR-004](../gxp/03-risk-assessment.md#rsk-br-004)
> **Regulatory:** supports 21 CFR 11.10(e); EU GMP Annex 11 §9

```ts
// illustrative — not type-checked
interface AuditSinkShape {
  readonly record: (r: AuditRecord) => Effect.Effect<void, AuditWriteFailed>
}
class AuditSink extends Context.Service<AuditSink, AuditSinkShape>()("@bridger/core/AuditSink") {}

class AuditWriteFailed extends Schema.TaggedError<AuditWriteFailed>()("AuditWriteFailed", {
  message: Schema.String
}) {}
```

```
REQUIREMENT: The host MUST read `AuditSink` with `Effect.serviceOption` when
             it is constructed. `AuditSink` MUST NOT appear in the
             requirements of `Bridger.layer` or `Bridger.make`.
```

```
REQUIREMENT: The port MUST be write-only: one method that takes a record and
             returns nothing. Core MUST NOT read records back through it.
```

```
REQUIREMENT: A sink MUST treat a write whose `recordId` it has already stored
             as idempotent: it MUST succeed and MUST NOT store a second copy.
             A sink SHOULD fail with `AuditWriteFailed` only when it did not
             store the record.
```

```
REQUIREMENT: A sink MUST NOT call mutating operations of the host it records
             for. Such a call waits behind the write it is part of and cannot
             complete before that write times out.
```

Unlike an observability sink, this port has a typed failure. Its failure must
*change the outcome* — a change that cannot be recorded is not made
(BEH-BR-203) — so the sink must be able to say that it failed. Success means
the sink has accepted responsibility for the record; what it does with it
(write it to a database, forward it to the companion, sign it) is behind the
port. A sink that acknowledges before persisting has made that trade-off on
the consumer's behalf, and the consumer's validation must cover it.

The idempotence obligation is what lets core retry a write whose outcome is
unknown (BEH-BR-202): a write that timed out after reaching the store, then
retried with the same `recordId`, leaves exactly one record.

## BEH-BR-194: An unwired sink changes nothing, and nothing claims an audit exists

> **Invariant:** [INV-BR-026](../invariants.md#inv-br-026-an-unwired-sink-or-gate-changes-nothing)
> **See:** [ADR-BR-030](../decisions/030-audit-sink-port.md), [ADR-BR-028](../decisions/028-gxp-scope.md)
> **Satisfies:** [URS-BR-026](../urs.md#urs-br-026-know-which-compliance-obligations-remain-mine)
> **Risk:** [RSK-BR-004](../gxp/03-risk-assessment.md#rsk-br-004), [RSK-BR-018](../gxp/03-risk-assessment.md#rsk-br-018)
> **Regulatory:** supports 21 CFR 11.10(e) (by never implying a trail that does not exist)

```ts
interface HostSnapshot {
  // ...
  readonly audit: "wired" | "unwired"
  readonly auditDegraded: boolean
}
```

```
REQUIREMENT: A host with no `AuditSink` MUST behave exactly as specified in
             files 02–21: no record is created, nothing waits on a write,
             `auditTimeout` has no effect, the latch is never set,
             `audit-degraded` is never emitted, and `auditDegraded` is always
             `false`.
```

```
REQUIREMENT: `HostSnapshot.audit` MUST be "wired" when the host was
             constructed with an `AuditSink` and "unwired" otherwise. It MUST
             NOT change during the life of the host.
```

```
REQUIREMENT: When the sink is unwired, nothing in core — snapshots, events,
             logs, `CloseReport`, errors or documentation — MAY state or imply
             that the host's changes are audited.
```

```
REQUIREMENT: When the sink is wired, core MUST NOT claim more than that it
             handed each record to the sink in order. It MUST NOT describe
             the trail as complete, retained, durable or tamper-evident.
```

`HostSnapshot.audit` is there so that an admin screen, a health check or an
installation qualification script can tell, from the running host, whether
an audit trail exists at all. An application that forgot to provide its sink
then shows "unwired" instead of quietly running without one.

## BEH-BR-195: The AuditRecord

> **Invariant:** [INV-BR-022](../invariants.md#inv-br-022-one-requested-and-one-terminal-record-per-mutating-call), [INV-BR-024](../invariants.md#inv-br-024-time-and-identifiers-come-only-from-services)
> **See:** [ADR-BR-030](../decisions/030-audit-sink-port.md), [ADR-BR-037](../decisions/037-audit-sequence-separate-from-event-seq.md)
> **Satisfies:** [URS-BR-021](../urs.md#urs-br-021-know-who-changed-the-plugin-set-when-and-why), [URS-BR-022](../urs.md#urs-br-022-obtain-a-complete-ordered-and-gap-detectable-lifecycle-record), [URS-BR-028](../urs.md#urs-br-028-know-which-plugin-version-was-active-at-any-time)
> **Regulatory:** supports 21 CFR 11.10(e); EU GMP Annex 11 §9, §12.4; ALCOA+ Attributable, Contemporaneous, Complete

```ts
type AuditPhase = "requested" | "rejected" | "completed" | "failed" | "superseded" | "joined" | "system"

interface AuditRecord {
  readonly schemaVersion: 1
  readonly recordId: string                        // from IdGenerator
  readonly hostId: string                          // HostSnapshot.hostId
  readonly auditSeq: number                        // 1, 2, 3, ... per host (24)
  readonly timestamp: string                       // from Clock, ISO-8601 UTC with ms: "2026-10-02T09:15:00.123Z"
  readonly actor: Actor
  readonly reason?: string
  readonly correlationId: string                   // always present: supplied, or generated by the host
  readonly causationId?: string
  readonly operation: Operation | SystemTransition
  readonly target?: { readonly id: string; readonly realm: string }
  readonly phase: AuditPhase
  readonly noop?: true
  readonly before?: { readonly state: PluginState; readonly version?: string; readonly digest?: string; readonly revision: number }
  readonly after?:  { readonly state: PluginState; readonly version?: string; readonly digest?: string; readonly revision: number }
  readonly configChange?: { readonly paths: readonly string[] }
  readonly children?: number                       // reconcile parent terminal record only
  readonly error?: { readonly _tag: string; readonly message: string }
  readonly droppedSinceAck?: number                // acknowledgeAuditDegraded records only (BEH-BR-202)
  readonly endsIntentOf?: string                   // intent-ended records only: recordId of the parked call's requested record (BEH-BR-199)
  readonly resumes?: string                        // terminal record of a call that resumed a parked operation only: recordId of the parked call's requested record (BEH-BR-200)
}

// SystemTransition (22 — Attributable Operations, BEH-BR-185):
//   "system-start" | "system-stop" | "runtime-failure" | "lease-revoked"
//   | "health-degraded" | "intent-ended"
```

```
REQUIREMENT: Every record handed to the sink MUST have exactly these fields,
             with these types, and `schemaVersion: 1`. A field that does not
             apply MUST be absent, never `null`, empty or a placeholder.
```

```
REQUIREMENT: A record MUST be immutable once created, and MUST be
             self-contained: a reader MUST NOT need the host, a snapshot or
             the event feed to interpret it.
```

```
REQUIREMENT: `schemaVersion` MUST change whenever a field is added, removed or
             changes meaning, so that a consumer's store can tell records of
             different shapes apart.
```

The record answers the questions a reviewer asks of a change, each from one
field: who (`actor`), why (`reason`), when (`timestamp`), in what order
(`auditSeq`), to what (`target`), what kind of change (`operation`, `phase`),
from what to what (`before`, `after`, including `version` and `digest`),
which configuration fields (`configChange.paths`), how it ended (`error`),
and as part of what (`correlationId`, `causationId`).

**Settled here.** (1) `correlationId` is typed as always present. The host
generates one when the caller supplies none (BEH-BR-187), so every record
carries one, and an optional type would push a "cannot happen" branch onto
every reader. (2) `droppedSinceAck` is part of the version-1 shape. It was
added in revision 0.2 of this file without changing `schemaVersion`: the
specification is pre-release and no record of an earlier shape has ever been
handed to a sink, so there is nothing for a store to tell apart. The rule of
the third requirement above applies from the first release on. (3)
`endsIntentOf` and `resumes`, and the `SystemTransition` value
"intent-ended", were added in revision 0.4 on the same ground, and are part
of the version-1 shape too.

## BEH-BR-196: What each field records

> **Invariant:** [INV-BR-022](../invariants.md#inv-br-022-one-requested-and-one-terminal-record-per-mutating-call)
> **See:** [ADR-BR-030](../decisions/030-audit-sink-port.md), [ADR-BR-008](../decisions/008-error-taxonomy.md)
> **Satisfies:** [URS-BR-028](../urs.md#urs-br-028-know-which-plugin-version-was-active-at-any-time), [URS-BR-021](../urs.md#urs-br-021-know-who-changed-the-plugin-set-when-and-why)
> **Regulatory:** supports 21 CFR 11.10(e) ("shall not obscure previously recorded information"); ALCOA+ Accurate, Contemporaneous

```
REQUIREMENT: `timestamp` MUST be the time, read from `Clock` when the record
             is created, of the event the record describes. `recordId` MUST
             be drawn from `IdGenerator` at the same moment.
```

```
REQUIREMENT: `target` MUST be the plugin's (id, realm) for plugin-addressed
             operations and system transitions; `{ id: R, realm: R }` for
             `defineRealm(R)`; and absent for `shutdown`,
             `acknowledgeAuditDegraded` and the parent records of
             `reconcile`.
```

```
REQUIREMENT: `before` MUST describe the target as it was when the record was
             created and MUST be present on `requested`, `rejected` and
             system records whenever the target existed. `after` MUST
             describe the target when the call or transition ended and MUST
             be present on terminal and system records whenever the target
             still exists. `version` and `digest` MUST be the `meta` of the
             definition installed at that moment, absent when not declared;
             `revision` MUST be `HostSnapshot.revision` at that moment.
```

```
REQUIREMENT: `error` MUST be present on `rejected`, `failed`, `superseded`
             records and on system records that end in failure, and MUST
             carry only the tagged error's `_tag` and `message`. It MUST NOT
             carry a cause, a stack, a fiber or a configuration value. The
             one `error` that is not a tagged error is the record-only
             `{ _tag: "Interrupted", message: "caller interrupted before
             its intent was recorded" }` of a call interrupted before its
             intent (22 — Attributable Operations, BEH-BR-188;
             ADR-BR-008).
```

```
REQUIREMENT: `droppedSinceAck` MUST be present on the `requested` and
             terminal records of an `acknowledgeAuditDegraded` call, and
             absent on every other record. Its value MUST be the number of
             records dropped for writer-queue overflow (BEH-BR-202) since the
             previous successful acknowledgement, or since the host started
             if there was none, counted when the record is created; it is 0
             when none were dropped.
```

```
REQUIREMENT: Core MUST NOT rewrite a record once it is created. A later
             change is recorded by a later record; nothing is corrected in
             place.
```

`before` and `after` together with `version` and `digest` make URS-BR-028
answerable from the trail alone: the `system-start` record that took a plugin
to `active` names the version and digest that became active, and the record
that took it out names when it stopped.

`droppedSinceAck` exists because an overflow drop leaves no gap in
`auditSeq` (BEH-BR-202): the acknowledgement that ends a degradation is where
the trail itself states how many records core failed to hand over.

## BEH-BR-197: Configuration paths, never configuration values

> **Invariant:** [INV-BR-028](../invariants.md#inv-br-028-audit-records-carry-no-configuration-values), [INV-BR-013](../invariants.md#inv-br-013-configuration-values-are-never-observable)
> **See:** [ADR-BR-033](../decisions/033-no-config-values-in-audit.md), [ADR-BR-018](../decisions/018-configuration-decoded-before-build.md)
> **Satisfies:** [URS-BR-007](../urs.md#urs-br-007-configure-plugins-safely-including-secrets-and-live-changes), [URS-BR-021](../urs.md#urs-br-021-know-who-changed-the-plugin-set-when-and-why)
> **Risk:** [RSK-BR-008](../gxp/03-risk-assessment.md#rsk-br-008)
> **Regulatory:** supports EU GMP Annex 11 §12.1; 21 CFR 11.10(e)

```
REQUIREMENT: No record MAY contain a configuration value — raw, decoded,
             redacted, hashed or summarized — in any field, including
             `reason`-like free text produced by core and `error.message`.
```

```
REQUIREMENT: `configChange` MUST be present on the `requested` and terminal
             records of a call that supplies a configuration override
             (`install` with `config`, `reconfigure` with a value, and the
             corresponding `reconcile` entry actions). Paths MUST be written
             as dot-separated field paths with array indices as numbers
             ("db.pool.max", "hosts.0").
```

```
REQUIREMENT: `configChange` MUST also be present on the terminal record of a
             call that resumes a parked operation which stores an override —
             a parked `reconfigure`, or a parked `restart` whose override a
             joining `reconfigure` set (BEH-BR-200) — and its `paths` MUST be
             the paths recorded for that override.
```

```
REQUIREMENT: `configChange` MUST also be present on the `intent-ended` record
             (BEH-BR-199) of an intent under which the stored override was
             changed — by the parked call or by a call that joined it
             (11 — Configuration, BEH-BR-101; 08 — Operation Legality,
             BEH-BR-080). The override reverts, in the same revision, to the
             one in effect before the first of those changes. Its `paths`
             MUST be the reverted paths — the paths recorded for those
             changes — and nothing else. No other system record MAY carry
             `configChange`.
```

```
REQUIREMENT: For `reconfigure` with a value, which is decoded at the call
             (22 — Attributable Operations, BEH-BR-188 step 4), `paths` MUST
             list the fields whose decoded value differs from the
             configuration in effect.
```

```
REQUIREMENT: For `install` with `config`, which is not decoded at the call
             (03 — Installation, BEH-BR-022), `paths` MUST list the
             top-level keys of the raw override object, and nothing else:
             no nested path, no value and nothing derived from a value. An
             override that is not an object has no keys and yields an empty
             list.
```

```
REQUIREMENT: A `Redacted` field that changed MUST be listed by path like any
             other. Its value MUST NOT influence anything else in the record.
```

```
REQUIREMENT: A `reconfigure` without a value (clearing the override) MUST
             carry `configChange` only when an override was stored; its
             `paths` MUST then be the paths recorded when that override was
             stored. It MUST NOT compare against, or record anything
             derived from, the configuration source.
```

A path tells a reviewer *that* `db.password` changed and *who* changed it,
which is what the trail needs. The value would turn the audit store into a
second secret store — governed, retained and exported on a different regime
from the first, and readable by every auditor. Hashing does not help: a
low-entropy secret is recoverable from its hash. If a consumer must evidence
the value itself, it records it in a store governed for secrets, under its own
controls.

An `install` override is only stored at the call; it is decoded at
activation, where a value that does not decode becomes an activation failure
rather than an error of the call. Its top-level keys are the only paths
available without decoding, and they still say which parts of the
configuration the operator chose to override.

A `reconfigure` without a value carries no new value: clearing an override
records the cleared paths only. The source values that take effect instead
are not recorded — source values are never recorded, for the same reason no
other value is.

## BEH-BR-198: Exactly one requested and one terminal record per admitted call

> **Invariant:** [INV-BR-022](../invariants.md#inv-br-022-one-requested-and-one-terminal-record-per-mutating-call)
> **See:** [ADR-BR-030](../decisions/030-audit-sink-port.md), [ADR-BR-029](../decisions/029-attributable-mutations.md)
> **Satisfies:** [URS-BR-022](../urs.md#urs-br-022-obtain-a-complete-ordered-and-gap-detectable-lifecycle-record)
> **Risk:** [RSK-BR-006](../gxp/03-risk-assessment.md#rsk-br-006)
> **Regulatory:** supports 21 CFR 11.10(e); EU GMP Annex 11 §9; ALCOA+ Complete

```
REQUIREMENT: With a sink wired, every mutating call that passes the
             attribution, latch and gate checks MUST produce exactly one
             `requested` and one terminal record, except a call whose
             `requested` record is dropped because the writer's queue is
             full (BEH-BR-202), which MUST produce no record. A call refused
             at the gate MUST produce exactly one `rejected` record and no
             `requested` record. A call refused for attribution or by the
             latch, and a call that fails validation before the gate
             (BEH-BR-188 step 4), MUST produce no record. A call that passes
             the gate, has its `requested` record queued, and then fails
             before its intent MUST end with a `failed` terminal record. Its
             causes are: `AuditUnavailable` when its `requested` record was
             not written within `auditTimeout` (BEH-BR-203); "Interrupted"
             when the caller was interrupted after that record was enqueued
             (BEH-BR-188); re-validation failing when the intent would be
             recorded — for `reconcile`, a recomputed diff that needs a
             reason the call lacks, `ReasonRequired` (18 — Reconciliation
             and Confluence, BEH-BR-158); and `WouldDeadlock`, `Conflict` or
             another named error decided at BEH-BR-188 step 7.
```

```
REQUIREMENT: The terminal record MUST be one of `completed`, `failed`,
             `superseded` or `joined`, and MUST share the `correlationId`
             and `actor` of its `requested` record (except as BEH-BR-200
             states for `joined`).
```

```
REQUIREMENT: A call MUST have exactly one terminal record, and the first
             terminal cause MUST win: once a terminal record has been
             created for a call, no later event — the delayed write of its
             `requested` record, a later outcome of an operation it parked
             (08 — Operation Legality, BEH-BR-074) — MAY create another.
```

```
REQUIREMENT: The `requested` record MUST be written before the intent is
             recorded; the terminal record MUST be written after the call's
             outcome is known and after every system record the call's
             transition produced up to that point.
```

```
REQUIREMENT: Caller interruption after the `requested` record MUST NOT
             prevent the terminal record.
```

The pair is what makes an incomplete change visible. A `requested` record
with no terminal record means the host stopped, or the sink failed, between
the two — and the latch (BEH-BR-205) makes the second case visible in the
host as well as in the trail.

## BEH-BR-199: System records

> **Invariant:** [INV-BR-022](../invariants.md#inv-br-022-one-requested-and-one-terminal-record-per-mutating-call)
> **See:** [ADR-BR-029](../decisions/029-attributable-mutations.md), [ADR-BR-017](../decisions/017-runtime-failure-one-transition.md), [ADR-BR-021](../decisions/021-children-and-groups.md)
> **Satisfies:** [URS-BR-028](../urs.md#urs-br-028-know-which-plugin-version-was-active-at-any-time), [URS-BR-022](../urs.md#urs-br-022-obtain-a-complete-ordered-and-gap-detectable-lifecycle-record)
> **Risk:** [RSK-BR-004](../gxp/03-risk-assessment.md#rsk-br-004), [RSK-BR-016](../gxp/03-risk-assessment.md#rsk-br-016), [RSK-BR-015](../gxp/03-risk-assessment.md#rsk-br-015)
> **Regulatory:** supports 21 CFR 11.10(e); EU GMP Annex 11 §9; ALCOA+ Complete, Attributable

```
REQUIREMENT: With a sink wired, the host MUST write one record with phase
             `system`, actor `Actor.system` and no `reason`:
             - `system-start` each time an activation attempt settles — the
               plugin became `active`, or `failed` with phase `build` or
               `activation` — and each time a child is mounted through
               `Plugin.Runtime.install`;
             - `system-stop` each time a stop settles — the plugin left
               `stopping` for `waiting`, `starting`, `disabled`, `failed` or
               removal — including a child removed with its parent;
             - `runtime-failure` when a runtime failure is confirmed, before
               the dependents are stopped;
             - `lease-revoked` for each plugin whose leases the host revoked
               (a forced drain; a drain limit reached on a path with no
               caller — a runtime failure, or a cascade whose root is not an
               operator call; shutdown);
             - `health-degraded` each time a plugin's health enters
               `degraded`; leaving `degraded` is not recorded;
             - `intent-ended` each time a parked operator intent is ended
               (below).
```

```
REQUIREMENT: A system record's `causationId` MUST follow BEH-BR-190, and its
             `correlationId` MUST be that of the operator call or root system
             record at the start of its causation chain; a root system record
             MUST receive a newly generated `correlationId`.
```

```
REQUIREMENT: When a parked operator intent is ended — by a cascade that
             resumes the parked stop (08 — Operation Legality, BEH-BR-080),
             or by shutdown (08 — Operation Legality, BEH-BR-075;
             12 — Shutdown and Hosting, BEH-BR-105) — the host MUST create,
             in the revision in which the intent ends, one record with:
             - `operation` "intent-ended", `phase` `system`, actor
               `Actor.system` and no `reason`;
             - `target` the plugin whose parked operation's intent ended;
             - `endsIntentOf` the `recordId` of the `requested` record of
               the call that parked that operation;
             - `configChange` with the paths of every override change it
               reverts, when it reverts any (BEH-BR-197), and otherwise no
               `configChange`;
             - `causationId` the cause that 22 — Attributable Operations,
               BEH-BR-190, gives for what ended the intent: the record of
               the cascade root, or the `requested` record of `shutdown`.
             It MUST be created when the intent ends, not when the stop
             later settles, so it precedes in the trail every record of
             that stop's settling.
```

```
REQUIREMENT: `endsIntentOf`, and the `configChange` of a reverted override,
             MUST be carried by the `intent-ended` record only. The
             `system-stop` written when the plugin's stop settles MUST be an
             ordinary `system-stop`, caused by whatever drove the settling
             (BEH-BR-190), and MUST carry neither. Every other record MUST
             omit `endsIntentOf`.
```

```
REQUIREMENT: A child mounted through `Plugin.Runtime.install` MUST produce
             two `system-start` records, both expected: the mount record,
             whose `causationId` is the record of the parent's triggering
             transition (22 — Attributable Operations, BEH-BR-190), and,
             when the child's activation attempt settles, a second
             `system-start` whose `causationId` is the `recordId` of the
             mount record.
```

```
REQUIREMENT: System records MUST be written in the order of the state
             changes they describe. A transition MUST NOT wait for its own
             system record to be written; the order is kept by the writer
             (BEH-BR-202).
```

```
REQUIREMENT: System transitions MUST NOT be submitted to the
             `OperationGate` (25 — Operation Gate).
```

The target's own stop and start are recorded as system records too, even when
an operator requested them: `remove(P)` writes `requested`, then a
`system-stop` for each dependent and for P, then `completed`. The operator
pair records the request and its outcome; the system records record each
state change it caused, in order, with the same `correlationId`. That is
what lets a reviewer reconstruct which version of each plugin was active at
any instant from the trail alone.

**Settled here.** (1) Only entry into `degraded` is recorded; the transition
list has no value for recovery, and a recovery is not a change anyone acted
on. (2) A transition does not wait for its system record: a slow sink then
cannot stall runtime-failure handling, and a record that is not written in
time sets the latch instead (BEH-BR-205). (3) A child's mount and its
activation are two state changes — the child becomes known, then it becomes
`active` or `failed` — so they are two `system-start` records, told apart by
`before`/`after` and chained by `causationId`; a reviewer who sees both is
not looking at a duplicate. (4) When a cascade or shutdown ends a parked
operator intent, the parked call's own correlation holds its `requested`
record, the system records its stop step wrote before the drain expired (a
dependent's `system-stop`, for instance) and its `failed` (`DrainTimeout`)
record; nothing in it says that the intent later ended. The `intent-ended`
record says so: it belongs to the correlation of the cascade root or of
`shutdown`, and its `endsIntentOf` holds the `recordId` of the parked call's
`requested` record, so a reviewer holding that record can find where the
intent ended, which override paths it reverted, and that its remaining
actions never ran. It is a record of its own, rather than a field on the
`system-stop` of the stop that was resumed, because the intent ends when the
stop is resumed while that `system-stop` is written only when the stop
settles — perhaps much later, perhaps after the resumed drain expired again
and the stop was resumed by somebody else — and a revert that happens at one
moment must be recorded at that moment (URS gap G16, second review pass).

## BEH-BR-200: Joins, supersession and no-ops are recorded as such

> **Invariant:** [INV-BR-022](../invariants.md#inv-br-022-one-requested-and-one-terminal-record-per-mutating-call)
> **See:** [ADR-BR-012](../decisions/012-intent-and-linearization.md), [ADR-BR-013](../decisions/013-total-operation-legality.md)
> **Satisfies:** [URS-BR-021](../urs.md#urs-br-021-know-who-changed-the-plugin-set-when-and-why)
> **Risk:** [RSK-BR-019](../gxp/03-risk-assessment.md#rsk-br-019)
> **Regulatory:** supports 21 CFR 11.10(e); ALCOA+ Accurate, Complete

```
REQUIREMENT: A call that succeeds without changing anything (a no-op success
             of 08 — Operation Legality) MUST write `requested` and a
             `completed` record with `noop: true`.
```

```
REQUIREMENT: A call that joins an operation already in progress MUST write
             its own `requested` record and, as its terminal record, a
             `joined` record whose `correlationId` is the correlation of the
             call it joined and whose `causationId` is the joining call's own
             `correlationId`. The `joined` record MUST carry the shared
             outcome in `after` and, if the shared operation failed, in
             `error`.
```

```
REQUIREMENT: A call superseded by a later one MUST write a `superseded`
             terminal record with `error` `Superseded`, and `causationId` set
             to the `recordId` of the superseding call's `requested` record.
```

```
REQUIREMENT: The two requirements above MUST NOT apply to a resumption. A
             call that, per 08 — Operation Legality, BEH-BR-072, joins or
             supersedes an operation that is parked (BEH-BR-074) resumes it
             and becomes its owner: it MUST write its own terminal record,
             `completed` or `failed`, in its own correlation, with the
             outcome of the resumed operation, and MUST NOT write `joined`
             or `superseded`. The call that parked the operation MUST
             receive no further record. The system records of the resumed
             stop MUST carry, as `causationId`, the `recordId` of the
             resuming call's `requested` record (22 — Attributable
             Operations, BEH-BR-190).
```

```
REQUIREMENT: The terminal record of a call that resumed a parked operation
             MUST carry `resumes`: the `recordId` of the `requested` record
             of the call that parked it. When the resumed operation stores
             an override — a parked `reconfigure`, or a parked `restart`
             whose override a joining `reconfigure` set — that terminal
             record MUST also carry `configChange` with the paths recorded
             for that override (BEH-BR-197). Its `correlationId` and
             `causationId` MUST be those of any terminal record of the
             resuming call. Every other record MUST omit `resumes`.
```

A no-op is still a request somebody made, and a reviewer reading "retry
requested by J. Rivera" needs to see "and it changed nothing" rather than a
gap. Joins and supersession are where two operators' actions meet; the
cross-links let a reviewer see that the second operator's `remove` completed
*because* the first one's did, and that the first operator's `replace` did
not take effect because someone else's did.

The `joined` record is the one place where `causationId` holds a correlation
rather than a record id: the record belongs, by `correlationId`, to the
operation that actually ran, and points back to the joining call's own
correlation, where its `requested` record is.

**Settled here.** A parked operation has no waiting caller: the call that
parked it has already received its terminal record (BEH-BR-074). A call that
joins or supersedes it therefore shares an outcome with nobody and overtakes
nobody; it is the call that makes the stop move again, under its own `drain`
and `force`. Recording it as `joined` or `superseded` would point the trail at
a correlation whose call ended long before, so it is recorded like any call
that ran its own operation. What it carried out, though, is somebody else's
request — possibly an override stored under the parked call — so its
terminal record names that request in `resumes` and the stored override's
paths in `configChange`; a reviewer reading the resumer's correlation alone
can then see whose change it completed and which configuration it put into
effect (URS gap G16, second review pass).

## BEH-BR-201: The records of a reconcile

> **Invariant:** [INV-BR-022](../invariants.md#inv-br-022-one-requested-and-one-terminal-record-per-mutating-call), [INV-BR-021](../invariants.md#inv-br-021-reconcile-is-idempotent)
> **See:** [ADR-BR-023](../decisions/023-desired-state-reconcile.md), [ADR-BR-030](../decisions/030-audit-sink-port.md)
> **Satisfies:** [URS-BR-016](../urs.md#urs-br-016-drive-the-plugin-set-from-a-declarative-list), [URS-BR-021](../urs.md#urs-br-021-know-who-changed-the-plugin-set-when-and-why)
> **Regulatory:** supports 21 CFR 11.10(e); EU GMP Annex 11 §9; ALCOA+ Complete

```
parent    requested   op=reconcile  corr=C                         (no target)
 entry 1  requested   op=install    corr=C  cause=<parent requested>
          system      op=system-start ...    cause=<entry 1 requested>
          completed   op=install    corr=C  cause=<parent requested>
 entry 2  rejected    op=replace    corr=C  cause=<parent requested>   (gate refused)
 ...
parent    completed   op=reconcile  corr=C  children=2
```

```
REQUIREMENT: A `reconcile` MUST write a parent `requested` record before any
             entry action and a parent terminal record after the last. The
             parent terminal record MUST be `completed` when the call returns
             a report and `failed` (with `error`) when it fails; it MUST carry
             `children`, the number of entry actions that reached the gate
             (each produced a `rejected` record or a `requested` record).
```

```
REQUIREMENT: Each entry action that reaches the gate MUST write its own
             records as an ordinary call does (BEH-BR-198), with the parent's
             `correlationId`, and with `causationId` set to the `recordId` of
             the parent `requested` record.
```

```
REQUIREMENT: A parent `completed` record with `children: 0` MUST carry
             `noop: true`. A parent `failed` record MUST NOT carry `noop`,
             whatever its `children` count — for instance the `failed`
             (`ReasonRequired`) record of a reconcile whose recomputed diff
             needs a reason (18 — Reconciliation and Confluence,
             BEH-BR-158).
```

The shared `correlationId` groups the batch; the `causationId` on each entry
record points at the request that issued it. An entry rejected by validation
writes nothing — exactly like the same call made directly — and is counted
only in the `ReconcileReport`.

## BEH-BR-202: One writer, in order, retrying in place

> **Invariant:** [INV-BR-023](../invariants.md#inv-br-023-the-audit-sequence-is-contiguous-per-host)
> **See:** [ADR-BR-030](../decisions/030-audit-sink-port.md), [ADR-BR-037](../decisions/037-audit-sequence-separate-from-event-seq.md)
> **Satisfies:** [URS-BR-022](../urs.md#urs-br-022-obtain-a-complete-ordered-and-gap-detectable-lifecycle-record)
> **Risk:** [RSK-BR-006](../gxp/03-risk-assessment.md#rsk-br-006), [RSK-BR-020](../gxp/03-risk-assessment.md#rsk-br-020)
> **Regulatory:** supports 21 CFR 11.10(e); EU GMP Annex 11 §9; ALCOA+ Consistent, Complete

```
REQUIREMENT: Each host MUST have exactly one audit writer. Records MUST be
             handed to the sink one at a time, in the order they were
             created, and a write MUST NOT start before the previous write
             has succeeded.
```

```
REQUIREMENT: When a write attempt fails — `AuditWriteFailed`, a defect, or
             an attempt not completed within `auditTimeout` (which is then
             interrupted) — the writer MUST retry the same record, identical
             in every field including `recordId` and `auditSeq`, before
             handing any other record to the sink. Retries MUST be spaced by
             a schedule read from `Clock`, starting at 100 milliseconds and
             doubling up to `auditTimeout`.
```

```
REQUIREMENT: Records waiting behind the writer MUST be held in a queue of at
             most 1024 records. A record that cannot be queued because the
             queue is full MUST be dropped without being numbered, logged at
             error level with its operation and target, and MUST set the
             latch (BEH-BR-205).
```

```
REQUIREMENT: When the dropped record is a call's `requested` record, the
             call MUST fail at once with `AuditUnavailable`, MUST change
             nothing, and MUST receive no terminal record: there is no
             `requested` record for one to answer. The latch and the drop
             count (below) record the loss.
```

```
REQUIREMENT: The host MUST count records dropped for overflow, expose the
             count as `HostSnapshot.auditDropped`, and carry the count since
             the previous acknowledgement as `droppedSinceAck` on the
             `acknowledgeAuditDegraded` records (BEH-BR-196), so that a loss
             is countable even though it leaves no gap in `auditSeq`.
```

Writing one record at a time is what makes `auditSeq` order, sink order and
creation order the same order, and what makes the sequence handed to the sink
contiguous ([24 — Time, Identifiers and Sequence](./24-time-ids-and-sequence.md)).
Retrying the *same* record — rather than moving on and reusing its number for
the next one — means a number always belongs to exactly one record: if a
timed-out write did reach the store, the retry is absorbed by the sink's
idempotence on `recordId` (BEH-BR-193), and no duplicate can arise.

The queue bound exists so that a sink that is down for hours cannot grow the
host's memory without limit. In normal operation the queue stays short:
operator calls wait for their own records, and a record left unwritten for
`auditTimeout` sets the latch (BEH-BR-205), after which operator mutations
are refused and only system transitions add records.

**Settled here.** (1) A failed write is retried in place, never skipped, so
that a number is never reused by a different record. (2) The retry spacing
and the queue capacity (1024) are fixed here. (3) A record dropped for
overflow is never numbered, so its loss is **not** visible as a gap in
`auditSeq`; it is visible through the error log, the latch, the
`HostSnapshot.auditDropped` counter and the `droppedSinceAck` count carried
by the `acknowledgeAuditDegraded` records that must follow. This is the one
path on which core loses a record while the host runs, and it is stated
rather than hidden. (4) A call whose `requested` record is dropped fails at
once rather than after `auditTimeout`: the record will never be written, so
waiting would only delay the answer, and a terminal record written later
would answer a request that is not in the trail.

## BEH-BR-203: A change that cannot be recorded is not made

> **Invariant:** [INV-BR-027](../invariants.md#inv-br-027-a-refused-or-unauditable-mutation-changes-nothing)
> **See:** [ADR-BR-031](../decisions/031-audit-failure-policy.md)
> **Satisfies:** [URS-BR-023](../urs.md#urs-br-023-prevent-a-change-that-cannot-be-recorded)
> **Risk:** [RSK-BR-004](../gxp/03-risk-assessment.md#rsk-br-004)
> **Regulatory:** supports 21 CFR 11.10(e); EU GMP Annex 11 §9; ALCOA+ Complete

```
REQUIREMENT: A mutating call MUST NOT record its intent until its `requested`
             record has been written. When the record is not written within
             `auditTimeout`, the call MUST fail with
             `AuditUnavailable { operation, message }` and MUST change
             nothing — no intent, no transition, no state, no event other
             than diagnostics of the failure.
```

```
REQUIREMENT: The unwritten `requested` record of such a call remains in the
             writer and is retried (BEH-BR-202). When it is eventually
             written, the host MUST follow it with a `failed` terminal record
             for that call, with `error` `AuditUnavailable`, so the trail
             shows that the request was made and did nothing. A `requested`
             record dropped because the writer's queue is full is not in the
             writer: its call fails at once and receives no terminal record
             (BEH-BR-202).
```

```
REQUIREMENT: The first terminal cause MUST win (BEH-BR-198). A call whose
             caller was interrupted while it waited for its `requested`
             record, before `auditTimeout` expired, ends with the `failed`
             (`Interrupted`) record of 22 — Attributable Operations,
             BEH-BR-188, and MUST NOT receive a `failed`
             (`AuditUnavailable`) record when its `requested` record is
             later written. A call whose `auditTimeout` expired first ends
             with `AuditUnavailable` as stated above.
```

```
REQUIREMENT: `shutdown` is the exception: its `requested` record is
             attempted, and when it is not written shutdown proceeds
             (BEH-BR-188).
```

Fail-closed is the only policy under which "no operator change is made
without its request on record" can be a property of the system rather than a
hope. A host that performed the change
anyway and logged the audit failure would produce exactly the unrecorded
change the trail exists to rule out, in exactly the circumstances — an
overloaded or unreachable store — where nobody is watching.

**Settled here.** (1) A sink that answers `AuditWriteFailed` at once does not
fail the call at once: the writer retries in place (BEH-BR-202), and the call
fails with `AuditUnavailable` when `auditTimeout` passes without a successful
write. A transient refusal therefore costs a retry, not an operator's change.
(2) The late `failed` record for an abandoned `requested` record keeps the
"one requested, one terminal" rule true even for a call that failed for audit
reasons, instead of leaving an orphan that looks like an interrupted change.

## BEH-BR-204: auditTimeout bounds every wait on the sink

> **See:** [ADR-BR-031](../decisions/031-audit-failure-policy.md)
> **Satisfies:** [URS-BR-023](../urs.md#urs-br-023-prevent-a-change-that-cannot-be-recorded)
> **Risk:** [RSK-BR-020](../gxp/03-risk-assessment.md#rsk-br-020)
> **Regulatory:** supports EU GMP Annex 11 §9; ALCOA+ Contemporaneous

```ts
interface BridgerOptions {
  // ...
  readonly auditTimeout?: Duration.Input   // default 10 seconds
}
```

```
REQUIREMENT: No operation and no transition MAY wait for the sink longer than
             `auditTimeout`, measured from the moment its record was queued.
             When it passes, a waiting call MUST proceed as BEH-BR-203 and
             BEH-BR-205 specify for an unwritten record.
```

```
REQUIREMENT: `auditTimeout` MUST be read from `Clock`, so that it is
             controlled by `TestClock` in tests.
```

```
REQUIREMENT: `auditTimeout` MUST NOT accept "forever".
```

A sink is called inside every operator mutation, so a sink that stalls
stalls the operator. Bounding the wait turns a stall into a visible failure —
`AuditUnavailable` to the caller, the latch for the host — instead of a host
that silently stops responding to administration.

**Settled here.** Unlike the drain limits, `auditTimeout` has no "forever"
form: an unbounded wait on a sink would let one stuck store hold every
operator call indefinitely, which the latch exists to make visible.

## BEH-BR-205: An unwritten terminal, rejected or system record sets the latch

> **Invariant:** [INV-BR-029](../invariants.md#inv-br-029-the-audit-degraded-latch-blocks-operator-mutations)
> **See:** [ADR-BR-031](../decisions/031-audit-failure-policy.md)
> **Satisfies:** [URS-BR-023](../urs.md#urs-br-023-prevent-a-change-that-cannot-be-recorded)
> **Risk:** [RSK-BR-006](../gxp/03-risk-assessment.md#rsk-br-006), [RSK-BR-004](../gxp/03-risk-assessment.md#rsk-br-004)
> **Regulatory:** supports EU GMP Annex 11 §9, §13; 21 CFR 11.10(e)

```
REQUIREMENT: The host MUST set the audit-degraded latch when a terminal,
             `rejected` or system record is not written within
             `auditTimeout`, when `shutdown`'s `requested` record is not
             written, and when a record is dropped for overflow.
```

```
REQUIREMENT: The change being recorded MUST NOT be undone: a `completed` call
             still returns its result, a refused call still fails with
             `OperationRejected`, and a system transition still completes.
```

```
REQUIREMENT: Setting the latch MUST publish a snapshot with
             `auditDegraded: true` and emit one `audit-degraded` event. While
             the latch is set, every mutating call except `shutdown` and
             `acknowledgeAuditDegraded` MUST fail at step 3 with
             `AuditUnavailable`. Reads, leases and system transitions MUST
             continue.
```

```
REQUIREMENT: The latch MUST stay set until `acknowledgeAuditDegraded`
             succeeds (BEH-BR-206). It MUST NOT clear itself when the sink
             recovers.
```

By the time a terminal record fails, the change has happened; refusing it
after the fact is impossible. What core can do is stop the next one. The
latch turns "one record is missing" into "no further operator change until a
person has looked", and requiring an explicit acknowledgement — rather than
clearing automatically when writes succeed again — makes that look an
attributed, recorded act.

## BEH-BR-206: acknowledgeAuditDegraded

> **Invariant:** [INV-BR-029](../invariants.md#inv-br-029-the-audit-degraded-latch-blocks-operator-mutations), [INV-BR-025](../invariants.md#inv-br-025-no-mutation-proceeds-without-required-attribution)
> **See:** [ADR-BR-031](../decisions/031-audit-failure-policy.md)
> **Satisfies:** [URS-BR-023](../urs.md#urs-br-023-prevent-a-change-that-cannot-be-recorded), [URS-BR-021](../urs.md#urs-br-021-know-who-changed-the-plugin-set-when-and-why)
> **Regulatory:** supports EU GMP Annex 11 §13; 21 CFR 11.10(e); ALCOA+ Attributable

```ts
interface Host {
  acknowledgeAuditDegraded(options: { readonly context: OperationContext }):
    Effect.Effect<void, Unattributed | ReasonRequired | AuditUnavailable | OperationRejected | HostClosed>
}
```

```
REQUIREMENT: `acknowledgeAuditDegraded` MUST require an explicit context with
             a non-reserved actor and a non-blank reason (BEH-BR-189). It MUST
             skip the latch check, MUST be submitted to the gate when one is
             wired, and MUST write `requested` and terminal records like any
             mutating call.
```

```
REQUIREMENT: Its `requested` record is queued behind every record still
             waiting in the writer. The latch MUST be cleared only once that
             `requested` record has been written — and therefore every
             earlier record with it. When it is not written within
             `auditTimeout`, the call MUST fail with `AuditUnavailable` and
             the latch MUST stay set.
```

```
REQUIREMENT: Clearing the latch MUST publish a snapshot with
             `auditDegraded: false` and emit one `audit-acknowledged` event,
             before the terminal `completed` record is written.
```

```
REQUIREMENT: When the latch is not set, the call MUST succeed as a no-op
             (`completed`, `noop: true`); with no sink wired, it MUST succeed
             and write nothing.
```

```
REQUIREMENT: Acknowledgement MUST NOT claim that records dropped for overflow
             were recovered.
```

Acknowledgement is a deliberate human act with a stated reason — "store
restored after network outage, INC-4471" — and its records sit in the trail
exactly where the degradation ended. A reviewer who finds a `requested` record
without its terminal can look forward to the acknowledgement and read why.
Making it succeed only through a writable sink means the latch can never be
cleared into a sink that is still failing.


**Prototype finding G13 (CCR-BR-005).** Because the writer retries in place and
writes in order (BEH-BR-202), the `requested` record of an acknowledgement
queues behind every record still waiting to be written. "A writable sink"
therefore means, in practice, "the backlog has drained": an acknowledgement
attempted while earlier records are still being retried fails with
`AuditUnavailable`, and succeeds once they are written. Observed in
`prototypes/host-core` (acceptance check 34).

```
REQUIREMENT: `acknowledgeAuditDegraded` MUST NOT clear the latch before every
             record enqueued ahead of its own `requested` record has been
             written.
```

## BEH-BR-207: The audit trail is not Host.events

> **See:** [ADR-BR-030](../decisions/030-audit-sink-port.md), [ADR-BR-007](../decisions/007-observation-primitives.md), [ADR-BR-037](../decisions/037-audit-sequence-separate-from-event-seq.md)
> **Satisfies:** [URS-BR-022](../urs.md#urs-br-022-obtain-a-complete-ordered-and-gap-detectable-lifecycle-record), [URS-BR-026](../urs.md#urs-br-026-know-which-compliance-obligations-remain-mine)
> **Risk:** [RSK-BR-012](../gxp/03-risk-assessment.md#rsk-br-012)
> **Regulatory:** supports 21 CFR 11.10(e); EU GMP Annex 11 §9

```
REQUIREMENT: Core documentation, types and examples MUST NOT describe
             `Host.events` or `Host.changes` as an audit trail, and core MUST
             NOT provide an `AuditSink` built from either.
```

```
REQUIREMENT: Records MUST be produced by the host's own operations and
             transitions, never derived from `Host.events`. The event `seq`
             and `auditSeq` MUST be independent sequences.
```

`Host.events` is backed by a sliding buffer: a subscriber that falls behind
loses the oldest events and sees a gap in `seq`. It carries no actor and no
reason. Both properties are right for a diagnostic feed and disqualifying for
an audit trail, and a well-meant adapter that persisted the event stream as
"the audit log" would produce something that looks like one and is lossy by
design. Keeping the two channels separate in code, in sequence numbers and in
words is how core avoids lending the event feed a credibility it does not
have.

## BEH-BR-208: Core keeps no copy; storage, retention, durability and review are the consumer's

> **See:** [ADR-BR-028](../decisions/028-gxp-scope.md), [ADR-BR-034](../decisions/034-gxp-companion-scope.md)
> **Satisfies:** [URS-BR-026](../urs.md#urs-br-026-know-which-compliance-obligations-remain-mine)
> **Risk:** [RSK-BR-006](../gxp/03-risk-assessment.md#rsk-br-006), [RSK-BR-018](../gxp/03-risk-assessment.md#rsk-br-018)
> **Regulatory:** supports (by delimiting) 21 CFR 11.10(c), 11.10(e); EU GMP Annex 11 §7, §8, §9, §17; ALCOA+ Original, Enduring, Available

```
REQUIREMENT: Core MUST hold a record only until the sink has accepted it.
             After a successful write, core MUST keep no reference to it and
             MUST offer no way to read it back. The record the sink accepted
             is the original.
```

```
REQUIREMENT: When the host closes, the writer MUST be given at most
             `auditTimeout` after the last record is queued to empty its
             queue. Records still unwritten after that MUST be logged at
             error level by operation and target, and the `CloseReport` MUST
             carry `auditDegraded: true`.
```

```
REQUIREMENT: Core documentation MUST state that storage, retention,
             archiving, backup, durability, access control, printing or
             export, review, and protection of the stored records are the
             consumer's responsibility (or the companion's, where adopted).
```

Records waiting in the writer live in process memory; a process that ends
abruptly loses them, and no library running inside that process can promise
otherwise. That is the honest boundary of core's part: produce each record at
the moment of the change, hand it over in order, and refuse further operator
changes when that fails. Everything after the hand-over — the store, how long
it keeps records, who may read them, how they are reviewed and whether they
can be altered — is outside core and is specified for the consumer and the
companion in `references/gxp/`.

---

_Previous: [22 — Attributable Operations](./22-attributable-operations.md)_ · _Next: [24 — Time, Identifiers and Sequence](./24-time-ids-and-sequence.md)_
