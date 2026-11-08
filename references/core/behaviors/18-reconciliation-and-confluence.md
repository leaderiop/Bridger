# 18 — Reconciliation and Confluence

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-BEH-18                                               |
> | Revision       | 0.4                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.4 (2026-10-03): `ConfigFingerprintUnavailable` added to the per-entry `rejected` reasons; entry actions that install with `config` or reconfigure with a value run step 4a of BEH-BR-188 on their own (CCR-BR-014)<br>0.3 (2026-10-02): A reconcile's intent is recorded with its parent `requested` record; interruption after that ends only the caller's wait; `requireReason` checked on a provisional diff at step 2 and again on the diff recomputed at the intent, failing with a recorded `ReasonRequired` (CCR-BR-008)<br>0.2 (2026-10-02): Consistency fixes from independent review (CCR-BR-002)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001) |

---

Applications often keep the plugin set as data — a configuration file, a
database row set, an ERP module registry. `reconcile` makes the host match
such a list: a keyed diff, owned by a named scope, applied as ordinary host
operations, each of them attributed, gated and audited. This file converts
SPEC.md "Desired-state reconciliation" and "Confluence", plus the `reconcile`
signature in "Host interface". This file owns BEH-BR-153–160 and uses all
eight.

Planned source: `packages/core/src/Reconcile.ts` and
`packages/core/src/Desired.ts` *(Planned)*. The individual operations
`reconcile` issues are specified in [03 — Installation](./03-installation.md),
[06 — Removal](./06-removal.md),
[07 — Replacement and Reactivation](./07-replacement-and-reactivation.md) and
[11 — Configuration](./11-configuration.md); their legality in
[08 — Operation Legality](./08-operation-legality.md).

## BEH-BR-153: The desired list and its entries

> **See:** [ADR-BR-023](../decisions/023-desired-state-reconcile.md)
> **Satisfies:** [URS-BR-016](../urs.md#urs-br-016-drive-the-plugin-set-from-a-declarative-list)

```ts
// illustrative — not type-checked
interface DesiredPlugin {
  readonly id: string                    // must equal plugin.id; repeated so diffs and overlays can address an entry
  readonly plugin: PluginDefinition<any, any, any, any>
  readonly config?: unknown              // the override the plugin should hold; absent = no override
  readonly disabled?: boolean            // default false
  readonly realm?: string                // default "default"
}

interface ReconcileOptions {
  readonly scope?: string                // ownership scope, default "default"
  readonly prune?: boolean               // default true
}

interface ReconcileReport {
  readonly installed: readonly string[]
  readonly replaced: readonly string[]
  readonly reconfigured: readonly string[]
  readonly enabled: readonly string[]
  readonly disabled: readonly string[]
  readonly removed: readonly string[]
  readonly unchanged: readonly string[]
  readonly rejected: readonly {
    readonly id: string
    readonly reason:
      | InstallError | ConfigInvalid | ConfigFingerprintUnavailable | OperationRejected
      // Settled here (BEH-BR-157): an entry action that passes step 6 of
      // BEH-BR-188 and then fails operationally is reported, never dropped.
      | UnknownPlugin | Conflict | Superseded | CleanupError | DrainTimeout | WouldDeadlock
  }[]
}

interface Host {
  reconcile(desired: readonly DesiredPlugin[], options?: ReconcileOptions & OperationOptions):
    Effect.Effect<ReconcileReport, Unattributed | ReasonRequired | AuditUnavailable | HostClosed>
}

declare const Desired: {
  overlay(
    base: readonly DesiredPlugin[],
    patch: readonly (Partial<DesiredPlugin> & { readonly id: string })[]
  ): readonly DesiredPlugin[]
}
```

```
REQUIREMENT: An entry is addressed by the pair (id, realm ?? "default").
             An entry whose `id` differs from `plugin.id` MUST be rejected
             with `InvalidDefinition { id, reason }` and MUST cause no action.
```

```
REQUIREMENT: When two or more entries share one (id, realm), every one of
             them MUST be rejected with `InvalidDefinition`, and the plugin
             of that (id, realm), if installed, MUST be left untouched and
             MUST NOT be pruned.
```

```
REQUIREMENT: `reconcile` MUST NOT mutate `desired` and MUST NOT retain it
             after the call completes.
```

```
REQUIREMENT: `Desired.overlay(base, patch)` MUST be a pure function: it MUST
             perform no I/O, read no host, clock or identifier service, and
             MUST NOT mutate `base` or `patch`. It MUST apply the patches in
             array order, each to the entry of `base` with the same
             (id, realm ?? "default"); when several patches address one
             entry, the later wins field by field. `config` MUST be merged
             deeply: plain-object values are merged key by key, recursively,
             and every other value (an array, a primitive) in a later patch
             replaces the earlier one. Every other field present in a patch
             MUST replace the entry's field. The result MUST keep the order
             of `base`; a patch whose (id, realm) addresses no entry of
             `base` MUST be appended, in patch order, when it carries a
             `plugin`, and MUST otherwise be dropped.
```

`Desired.overlay` is the building block for profiles, bundles and local
overrides: a shipped list, a site profile and an operator's patch are
combined before the result is handed to `reconcile`. Keeping it pure means
the list `reconcile` receives depends only on its inputs, so convergence
(BEH-BR-159) holds for overlaid lists as for hand-written ones. It validates
nothing: a merged entry whose `id` differs from its `plugin.id`, or two
entries that share a key, are rejected by `reconcile` (above), not by the
overlay.

`config` in an entry means "the override this plugin should hold". An entry
without `config` therefore asks for *no* override, so that the source
(`BridgerOptions.config`) applies — which is what makes the result depend only
on the list (BEH-BR-159).

`reconcile` is the one mutating operation whose error union does not include
`OperationRejected`: the gate is consulted per entry action (BEH-BR-158), never
for the call as a whole, so a refusal is always an entry's outcome and lands
in `rejected`.

**Settled here.** (1) Duplicate keys in one list are rejected as a whole
rather than "last wins": a list that names one plugin twice is ambiguous, and
choosing one silently would hide the authoring error. (2) A `ReplaceError`
from an entry's `replace` is reported in `rejected` as its `cause` (an
`InstallError`), keeping `reason` within the declared union. (3) SPEC.md
described `Desired.overlay` in prose only ("merges patches by `id` in order,
later wins, `config` merged deeply"). It is specified above: patches are
matched by (id, realm), not by `id` alone, consistent with how entries are
addressed; a patch that addresses no entry becomes a new entry only if it
carries a `plugin`, since without one it is not a `DesiredPlugin` and the
overlay has no error channel to report it through.

## BEH-BR-154: The keyed diff and the action sequence of one entry

> **Invariant:** [INV-BR-021](../invariants.md#inv-br-021-reconcile-is-idempotent)
> **See:** [ADR-BR-023](../decisions/023-desired-state-reconcile.md)
> **Satisfies:** [URS-BR-016](../urs.md#urs-br-016-drive-the-plugin-set-from-a-declarative-list), [URS-BR-028](../urs.md#urs-br-028-know-which-plugin-version-was-active-at-any-time)

```
REQUIREMENT: For each valid entry, `reconcile` MUST compare the entry with
             the plugin of the same (id, realm) and derive the actions:
             - not installed            → `install` with the entry's
                                          `config`, `disabled` and `realm`;
             - different definition     → `replace`;
             - different override       → `reconfigure` (with the entry's
                                          `config`, or with none to clear);
             - `disabled` differs       → `disable` or `enable`;
             - none of the above        → no action (`unchanged`).
```

```
REQUIREMENT: Two definitions MUST be "the same definition" only when they are
             the same object, or when both carry `meta.version` and
             `meta.digest` and both pairs are equal. In every other case they
             MUST be treated as different.
```

```
REQUIREMENT: When an installed entry needs more than one action, they MUST be
             issued in this order, so that the plugin builds at most once:
             - target disabled: `disable`, then `replace`, then
               `reconfigure`;
             - target enabled:  `replace`, then `reconfigure`, then
               `enable`.
             Each action MUST complete before the next is issued.
```

```
REQUIREMENT: Overrides MUST be compared as raw values by structural equality.
             The decision whether a differing override restarts the plugin
             or is volatile-only belongs to `reconfigure` (BEH-BR-102 in
             11 — Configuration), not to `reconcile`.
```

```
REQUIREMENT: The values compared MUST NOT appear in the report, in events, in
             logs or in audit records. Only ids, and configuration paths
             where 23 — Audit Sink and Record allows them, may.
```

"Same object or equal version and digest" is deliberately strict. Two
definitions that carry the same `meta.version` but no digest might be two
builds of one release or two different code bodies under one label, and
`reconcile` cannot tell which. Treating them as different costs a restart;
treating them as the same could leave code running that nobody listed. A
consumer that re-imports definitions on every run and wants idempotence sets
both `version` and `digest`.

**Settled here.** (1) SPEC.md says "equal `meta.version` and `meta.digest`
when both are present"; this reads "both fields present on both
definitions". (2) SPEC.md lists the actions but not how they combine. `replace`
drops the override (SPEC.md "Configuration and metadata"), so `reconfigure`
must follow it; `replace` keeps a disabled plugin disabled, so disabling first
and enabling last avoids a build of a definition that is about to be stopped
or replaced.

## BEH-BR-155: A reconcile scope owns what it installed, and prunes only that

> **Invariant:** [INV-BR-021](../invariants.md#inv-br-021-reconcile-is-idempotent)
> **See:** [ADR-BR-023](../decisions/023-desired-state-reconcile.md)
> **Satisfies:** [URS-BR-016](../urs.md#urs-br-016-drive-the-plugin-set-from-a-declarative-list)
> **Risk:** [RSK-BR-019](../gxp/03-risk-assessment.md#rsk-br-019)

```
REQUIREMENT: A plugin installed by `reconcile` MUST be recorded as owned by
             `options.scope` (default "default") for as long as it stays
             installed. Ownership MUST end when the plugin is removed by any
             means.
```

```
REQUIREMENT: With `prune` (default true), every plugin owned by the scope
             and absent from `desired` MUST be removed. Without `prune`, such
             plugins MUST be left untouched.
```

```
REQUIREMENT: `reconcile` MUST NOT issue any action against a plugin that it
             does not own under `options.scope`: neither prune it, nor
             replace, reconfigure, disable or enable it. An entry that names
             such a plugin MUST be rejected with `DuplicatePlugin { id }`.
```

This is what lets a profile and a manual override coexist: an operator who
installs a diagnostic plugin by hand cannot have it pruned by the next
scheduled reconcile, and two reconcile scopes (say, a base profile and a site
bundle) cannot fight over one plugin.

**Settled here.** SPEC.md says plugins installed by hand or by another scope
"are never touched", but not what happens when a desired entry names one. It
is rejected with `DuplicatePlugin` — exactly what `install` would say — rather
than silently adopted. Adoption would let a list take over a plugin an
operator installed deliberately, which is the conflict ownership exists to
prevent.

## BEH-BR-156: Execution order, serialization and completion

> **See:** [ADR-BR-023](../decisions/023-desired-state-reconcile.md), [ADR-BR-012](../decisions/012-intent-and-linearization.md)
> **Risk:** [RSK-BR-019](../gxp/03-risk-assessment.md#rsk-br-019)

```
REQUIREMENT: `reconcile` MUST compute its diff against the host state at the
             moment its intent is recorded (below), and then act in this
             fixed order: first the prune removals, in reverse dependency
             order; then the entries, in list order.
```

```
REQUIREMENT: Calls to `reconcile` on one host MUST be serialized in call
             order: a reconcile's intent is recorded only after the previous
             reconcile has completed. Other host operations are not blocked
             and interleave under the per-plugin linearization of
             08 — Operation Legality.
```

```
REQUIREMENT: A `reconcile` call's parent `requested` record MUST be enqueued
             once the call passes steps 1–3 of BEH-BR-188, and its intent
             MUST be recorded when that record has been written and its turn
             in the serialization above has begun (with no sink wired, when
             its turn begins). An interruption of the caller before the
             intent MUST be treated as 22 — Attributable Operations,
             BEH-BR-188 states for any call: no record while steps 1–3 run;
             a parent `failed` (`Interrupted`) terminal record once the
             parent `requested` record is enqueued; no change in either
             case. An interruption after the intent MUST end only the
             caller's wait: the remaining entry actions MUST still be
             issued, and the parent terminal record MUST still be written.
```

```
REQUIREMENT: `reconcile` MUST return its report only after every action it
             issued has completed or been rejected. It MUST NOT wait for
             activations to settle: as for `install`, activation outcomes are
             state, read from snapshots.
```

```
REQUIREMENT: An action issued by `reconcile` MUST be the same operation, with
             the same legality, joins, supersession and conflicts, as the
             corresponding direct Host call.
```

A fixed order makes two runs of one list on one state issue the same
operations in the same sequence, which is what makes their audit records
comparable. Prune removals go first so that a provider moving from a dropped
plugin to a listed one frees its slot before the new one is installed.

**Settled here.** SPEC.md does not order the actions or say whether two
reconciles may overlap. Overlapping reconciles would each diff against a
state the other is changing; serializing them per host removes that race
without touching ordinary operations.

**Settled here.** A `reconcile` has no linearization point of its own: it is
not addressed to one plugin, and each entry action meets the linearization
point of its plugin separately. Its intent — the diff, and the decision to
issue the actions it implies — is therefore recorded with its parent
`requested` record, once its turn begins. From then on it behaves like any
call whose intent is recorded (INV-BR-010): a caller that stops waiting does
not leave a batch half-issued and unexplained, because the remaining entries
still run and the parent terminal record still closes the batch in the trail.
The parent record cannot be ended early in its place: entry actions already
issued would then have no parent outcome, and the ones still to come would
be silently dropped.

## BEH-BR-157: Errors are per entry, and the report accounts for every entry

> **See:** [ADR-BR-023](../decisions/023-desired-state-reconcile.md)
> **Satisfies:** [URS-BR-016](../urs.md#urs-br-016-drive-the-plugin-set-from-a-declarative-list), [URS-BR-004](../urs.md#urs-br-004-know-why-a-plugin-is-not-running)

```
REQUIREMENT: An entry whose action fails validation, fails configuration
             fingerprinting (step 4a of BEH-BR-188, with
             `ConfigFingerprintUnavailable`), is refused by the gate, or
             passes step 6 of BEH-BR-188 and then fails MUST be reported
             in `rejected` with the error, MUST receive no further actions in
             this call, and MUST NOT stop the other entries — except as
             stated below for audit unavailability.
```

```
REQUIREMENT: Every valid entry and every pruned plugin MUST appear in the
             report: in the list of each action that completed for it, in
             `rejected` if an action did not, or in `unchanged` if no action
             was needed. An entry in `rejected` MAY also appear in the lists
             of actions that completed before the rejection.
```

```
REQUIREMENT: Activation failures after a completed `install`, `replace`,
             `reconfigure` or `enable` MUST NOT be reported as rejections;
             they are plugin state (`failed`), exactly as for a direct call.
```

```
REQUIREMENT: When an entry action's `requested` record cannot be written,
             that action MUST change nothing, `reconcile` MUST issue no
             further action, and the call MUST fail with `AuditUnavailable`.
             Entry actions already completed MUST remain applied and
             recorded; they are not rolled back.
```

```
REQUIREMENT: When the audit-degraded latch becomes set while a `reconcile` is
             running (a terminal or system record could not be written),
             `reconcile` MUST issue no further action and MUST fail with
             `AuditUnavailable`, with the same treatment of completed actions.
```

The call-level errors are those that make the whole call impossible: the host
is closed, the call is unattributed or lacks a required reason (BEH-BR-189),
the latch is set when the call arrives, or a change can no longer be
recorded. Everything else is an entry's problem and is reported for that
entry.

**Settled here.** (1) SPEC.md says an invalid entry "does not stop the
others". For audit unavailability that rule is reversed: once one entry's
change cannot be recorded, continuing would only produce a run of further
refusals or, worse, a partially recorded batch. The completed actions are not
undone, because each is an ordinary operation with its own pair of records,
and an automatic reversal would itself be an unrequested change. A caller that
fails with `AuditUnavailable` reads the snapshot (and, once the sink is back,
the trail) to see how far the batch went. (2) The latch is checked once for
the call, but a latch that becomes set *during* the call also stops it:
continuing would issue operator-initiated changes while the host is in the
state
[INV-BR-029](../invariants.md#inv-br-029-the-audit-degraded-latch-blocks-operator-mutations)
exists to block. (3) An entry action that passes step 6 of BEH-BR-188 and then
fails operationally (`Conflict`, `Superseded`, `UnknownPlugin`,
`CleanupError`, `DrainTimeout`, `WouldDeadlock`) is reported in `rejected`
with that error; the `InstallError | ConfigInvalid |
ConfigFingerprintUnavailable | OperationRejected` union is extended by those
tags, because dropping such an entry from the report would hide a change
that was requested, recorded as `failed`, and not made. (4)
`ConfigFingerprintUnavailable` (CCR-BR-014) is the failure of step 4a of
BEH-BR-188 for an entry action that installs with `config` or reconfigures
with a value while a `ConfigFingerprinter` is wired
([ADR-BR-039](../decisions/039-config-fingerprint-port.md)). Like
`ConfigInvalid`, it comes before the gate: the entry is placed in
`rejected` with it, changes nothing and leaves no record of its own, and
does not stop the other entries.

## BEH-BR-158: Each entry action is gated and audited on its own

> **Invariant:** [INV-BR-022](../invariants.md#inv-br-022-one-requested-and-one-terminal-record-per-mutating-call), [INV-BR-027](../invariants.md#inv-br-027-a-refused-or-unauditable-mutation-changes-nothing)
> **See:** [ADR-BR-032](../decisions/032-operation-gate.md), [ADR-BR-030](../decisions/030-audit-sink-port.md), [ADR-BR-023](../decisions/023-desired-state-reconcile.md)
> **Satisfies:** [URS-BR-021](../urs.md#urs-br-021-know-who-changed-the-plugin-set-when-and-why), [URS-BR-024](../urs.md#urs-br-024-require-approval-before-a-regulated-change)
> **Risk:** [RSK-BR-014](../gxp/03-risk-assessment.md#rsk-br-014), [RSK-BR-004](../gxp/03-risk-assessment.md#rsk-br-004)
> **Regulatory:** supports 21 CFR 11.10(e), 11.10(g); EU GMP Annex 11 §9, §10; ALCOA+ Attributable, Complete

```
REQUIREMENT: The `reconcile` call MUST run steps 1–3 of BEH-BR-188 (host
             closed, attribution, latch) once for the whole call, failing the
             call with `HostClosed`, `Unattributed`, `ReasonRequired` or
             `AuditUnavailable`. The call as a whole MUST NOT be submitted to
             the gate.
```

```
REQUIREMENT: The attribution check of the call (step 2 of BEH-BR-188) MUST
             apply `requireReason` to `reconcile` and to every operation of
             a provisional diff computed against the host state at the
             call. When any of them requires a reason and the context has
             none, the call MUST fail with `ReasonRequired` and MUST write no
             record.
```

```
REQUIREMENT: When the intent is recorded, the diff is recomputed
             (BEH-BR-156). When the recomputed diff issues an operation that
             is listed in `requireReason` and the provisional diff did not,
             and the context has no reason, the call MUST fail with
             `ReasonRequired`, MUST write a parent `failed` terminal record
             with that error (`children: 0`), and MUST issue no entry
             action.
```

```
REQUIREMENT: When an `AuditSink` is wired, `reconcile` MUST write a parent
             `requested` record before any entry action and a parent
             terminal record after the last, or when the call stops.
```

```
REQUIREMENT: Every entry action — each `install`, `replace`, `reconfigure`,
             `disable`, `enable` and prune `remove` — MUST run steps 4–8 of
             BEH-BR-188 on its own: validation, configuration fingerprints
             (step 4a, for an `install` with `config` or a `reconfigure`
             with a value when a `ConfigFingerprinter` is wired), the gate
             (consulted once for that action when an `OperationGate` is
             wired), its own
             `requested` record, the transition, and its own terminal record
             — or a single `rejected` record when the gate refuses it.
```

```
REQUIREMENT: A gate refusal MUST change nothing for that entry and MUST place
             the entry in `rejected` with `OperationRejected`. The gate MUST
             NOT be consulted once for the batch in place of the per-action
             consultations.
```

```
REQUIREMENT: Every entry action MUST be attributed to the `reconcile` call's
             context — the same actor and reason — and MUST carry the
             call's `correlationId` (supplied by the caller, or generated
             once for the call when absent).
```

The record structure — the parent pair, the per-entry pairs, how they are
linked by `correlationId` and `causationId`, and the parent's `children`
count — is specified in [23 — Audit Sink and Record](./23-audit-sink-and-record.md).
The gate's request shape and the rule that `reconcile` cannot be used to
bypass the gate are in [25 — Operation Gate](./25-operation-gate.md).

Gating per action rather than per batch matters because an approver who
approves "apply the March profile" has not, by that, approved each of the
eleven changes it turns out to contain. A companion that wants batch approval
can implement it on top — approve the batch once, then answer each entry
request from that approval — but core never collapses the decisions for it.

**Settled here.** Attribution is checked once for the call, so a
`requireReason` rule naming, say, `remove` would otherwise never be applied to
a prune. Applying it to every operation the diff would issue — computed
before any change — keeps the rule meaning the same whether a removal is
requested directly or through a list. The diff that is acted on is the one
computed at the intent, and the host may change between the call and the
intent (another operator's call, or the previous reconcile in the
serialization). The check at step 2 therefore runs on a provisional diff, so
that the common refusal leaves no record; and the recomputed diff is checked
again at the intent, where a newly needed reason fails the call with a
recorded `failed` (`ReasonRequired`) terminal record — the parent `requested`
record already exists and must be answered — before any entry runs (URS gap
G16, second review pass).

## BEH-BR-159: Reconcile is idempotent and convergent

> **Invariant:** [INV-BR-021](../invariants.md#inv-br-021-reconcile-is-idempotent)
> **See:** [ADR-BR-023](../decisions/023-desired-state-reconcile.md), [ADR-BR-005](../decisions/005-failure-is-sticky.md)
> **Satisfies:** [URS-BR-016](../urs.md#urs-br-016-drive-the-plugin-set-from-a-declarative-list)

```
REQUIREMENT: Running `reconcile(D, o)` and, after it completes, running
             `reconcile(D, o)` again MUST issue no action the second time:
             every entry is `unchanged` and nothing is pruned.
```

```
REQUIREMENT: After `reconcile(D, o)` completes and the host is idle, the set
             of plugins owned by `o.scope`, their definitions, their
             overrides and their enabled flags MUST depend only on D — not on
             the edit history that led there — except as stated for failed
             plugins in BEH-BR-160.
```

```
REQUIREMENT: When an `AuditSink` is wired, the second run of an idempotent
             pair MUST still write its parent `requested` and terminal
             records; the terminal record MUST carry `noop: true` and
             `children: 0`.
```

Idempotence is a property of the *list*, so it holds only for definitions
that compare as "the same" (BEH-BR-154). A list built by re-importing
definitions without `meta.version` and `meta.digest` will replace them on
every run; that is the conservative outcome, not a violation.

A second run that changes nothing is still a request someone made, so it
still leaves a record. That keeps "who ran the profile, when" answerable
even when the answer is "and nothing changed".

## BEH-BR-160: Confluence — the settled state does not depend on operation order

> **Invariant:** [INV-BR-007](../invariants.md#inv-br-007-failure-is-sticky), [INV-BR-021](../invariants.md#inv-br-021-reconcile-is-idempotent)
> **See:** [ADR-BR-005](../decisions/005-failure-is-sticky.md), [ADR-BR-023](../decisions/023-desired-state-reconcile.md)
> **Risk:** [RSK-BR-003](../gxp/03-risk-assessment.md#rsk-br-003)

```
REQUIREMENT: Once the host is idle, the set of active plugins MUST depend
             only on what is installed (definitions, overrides, enabled
             flags, realms) and on the base services — not on the order of
             the operations that produced it. Installing A then B, B then A,
             or installing, removing and installing again MUST yield the
             same active set.
```

```
REQUIREMENT: The one permitted exception is failure: two histories that
             differ in a past build, activation, runtime or cleanup failure
             MAY differ until that plugin is retried, restarted, replaced,
             reconfigured, disabled or removed. Core MUST NOT retry a failed
             plugin to restore confluence.
```

Three properties carry confluence: dependents stop first and providers start
first; a `waiting` plugin starts by itself when its provider returns; and
`reconcile` is a function of its list. Failure is the deliberate exception
because an automatic retry would repeat whatever side effects the failed
`build` already performed, possibly in a loop — exactly the hidden behaviour
[ADR-BR-005](../decisions/005-failure-is-sticky.md) rules out.

The test suite checks confluence directly: two different histories ending in
the same installed set must produce equal snapshots once idle, modulo
revision numbers and timing ([21 — Testing Host](./21-testing-host.md)).

---

_Previous: [17 — Realms and Interception](./17-realms-and-interception.md)_ · _Next: [19 — Contribution Registry](./19-contribution-registry.md)_
