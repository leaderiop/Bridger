# 18 — Reconciliation and Confluence

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-BEH-18                                               |
> | Revision       | 0.15                                                         |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.15 (2026-11-11): confluence prose: the loader's kill switch removes revoked plugins of its own scope and only reports those outside it (loader BEH-LD-031) (CL3); the confluence comparison leaves out `PluginSnapshot.scope` (CL10) (SPEC-AUDIT-08) (CCR-BR-040)<br>0.14 (2026-11-11): confluence prose: the loader's kill switch removes revoked plugins with `remove`, never reconciling or disabling (CL12) ; BEH-BR-155 the owning scope is visible as `PluginSnapshot.scope` (L4) (SPEC-AUDIT-07) (CCR-BR-039)<br>0.13 (2026-11-11): BEH-BR-153 every `ReconcileReport` list names a plugin as `{ id, realm }`, and `rejected` entries carry `realm` (C2) (SPEC-AUDIT-05); BEH-BR-153 `ReconcileOptions.cold` (H9) (SPEC-AUDIT-05) (CCR-BR-037)<br>0.12 (2026-11-10): BEH-BR-156 an entry that would close a dependency cycle is a validation-stage rejection computed by the diff, listed in the plan's `rejected`, so `atomic` applies nothing; REQ-BR-098 row extended (C7) (CCR-BR-035)<br>0.11 (2026-11-10): BEH-BR-156 edges on a cycle of the change phase are ignored for the order (list order) and the entry closing the cycle is rejected with `DependencyCycle` (C9); BEH-BR-157 shutdown during a non-atomic `reconcile` issues no further action and fails with `HostClosed`, parent record `failed` (C10) (CCR-BR-034)<br>0.10 (2026-11-09): BEH-BR-153 `IncompatibleContract` and `IncompatibleEngine` reach the report as `InstallError` members, and a plan names each by its own tag (C-07) (CCR-BR-033)<br>0.9 (2026-11-08): BEH-BR-154 the diff reads the operator's `disabled` flag, a "refused-digest" registration counts as not disabled; BEH-BR-155 atomic undo removals use the prune options whatever `prune` is; BEH-BR-159 idempotence after a run with no rejection, refused entries retried; BEH-BR-160 refusal-list answers are history like failure (agent review R1-07, R1-11) (CCR-BR-029)<br>0.8 (2026-11-08): BEH-BR-160 lazy registrations compared with `dormant` and `active` as one class; eager registrations compared exactly (host-core prototype finding G-P7) (CCR-BR-028)<br>0.7 (2026-11-08): BEH-BR-153 `DesiredPlugin.mandatoryInterceptions` and `allowChildren`, `BridgerOptions.mandatoryCatalog`, `ReconcileOptions.atomic`, `PolicyMismatch`, `ApplyRolledBack` and `PartialApply`; BEH-BR-154 policy compared, never changed in place; BEH-BR-156 entries ordered by dependency (removals dependents first, other changes providers first), closing gap G36; BEH-BR-157 and 158 atomic apply and undo operations; acceptance checks 98 and 101 (CCR-BR-025)<br>0.6 (2026-11-08): BEH-BR-154: lazy identity `meta` (digest supplied beside the manifest); BEH-BR-153/155: `pruneDrain` and `pruneForce` (CCR-BR-022)<br>0.5 (2026-11-08): BEH-BR-153 `DesiredPlugin.plugin` accepts lazy definitions, BEH-BR-154 lazy definitions compared by manifest `version` and `digest` without loading (CCR-BR-017); BEH-BR-153 `expect` and `PlanStale`, BEH-BR-156 diff shared with `Host.plan`, BEH-BR-158 a stale plan applies nothing (CCR-BR-019); BEH-BR-153 `plugin: Plugin.Any` (CCR-BR-020)<br>0.4 (2026-10-03): `ConfigFingerprintUnavailable` added to the per-entry `rejected` reasons; entry actions that install with `config` or reconfigure with a value run step 4a of BEH-BR-188 on their own (CCR-BR-014)<br>0.3 (2026-10-02): A reconcile's intent is recorded with its parent `requested` record; interruption after that ends only the caller's wait; `requireReason` checked on a provisional diff at step 2 and again on the diff recomputed at the intent, failing with a recorded `ReasonRequired` (CCR-BR-008)<br>0.2 (2026-10-02): Consistency fixes from independent review (CCR-BR-002)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001) |

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
  readonly plugin: Plugin.Any | LazyPluginDefinition   // any definition, no cast (01, BEH-BR-001); lazy (27, BEH-BR-244)
  readonly config?: unknown              // the override the plugin should hold; absent = no override
  readonly disabled?: boolean            // default false
  readonly realm?: string                // default "default"
  readonly mandatoryInterceptions?: readonly string[]  // ids in BridgerOptions.mandatoryCatalog, in order; default []
  readonly allowChildren?: boolean       // default true (28, BEH-BR-263)
}

// The application names the mandatory interceptions a desired list may cite.
interface RegisteredInterception<S> extends MandatoryInterception<S> {   // 28, BEH-BR-260
  readonly id: string                    // non-empty; unique within the catalog
}
interface BridgerOptions { /* ... */ readonly mandatoryCatalog?: readonly RegisteredInterception<any>[] }   // default []

class PolicyMismatch extends Schema.TaggedError<PolicyMismatch>()("PolicyMismatch", {
  id: Schema.String,
  realm: Schema.String,
  fields: Schema.Array(Schema.Literal("mandatoryInterceptions", "allowChildren"))   // the fields that differ
}) {}

interface ReconcileOptions {
  readonly scope?: string                // ownership scope, default "default"
  readonly prune?: boolean               // default true
  readonly pruneDrain?: Duration.Input | "forever"   // drain of each prune remove; default BridgerOptions.drainTimeout
  readonly pruneForce?: boolean          // force of each prune remove; default false
  readonly expect?: ReconcilePlan        // apply this plan or nothing (32, BEH-BR-319)
  readonly atomic?: boolean              // all entries or none, by undo (32, BEH-BR-322); default false
  readonly cold?: boolean                // skip a handoff in every replace and restarting reconfigure
                                         // the reconcile issues (34, BEH-BR-353); default false
}

// Every list names a plugin as { id, realm } (17, BEH-BR-147; CCR-BR-037).
interface ReconcileReport {
  readonly installed: readonly { readonly id: string; readonly realm: string }[]
  readonly replaced: readonly { readonly id: string; readonly realm: string }[]
  readonly reconfigured: readonly { readonly id: string; readonly realm: string }[]
  readonly enabled: readonly { readonly id: string; readonly realm: string }[]
  readonly disabled: readonly { readonly id: string; readonly realm: string }[]
  readonly removed: readonly { readonly id: string; readonly realm: string }[]
  readonly unchanged: readonly { readonly id: string; readonly realm: string }[]
  readonly rejected: readonly {
    readonly id: string
    readonly realm: string
    readonly reason:
      | InstallError | ConfigInvalid | ConfigFingerprintUnavailable | OperationRejected | PolicyMismatch
      // Settled here (BEH-BR-157): an entry action that passes step 6 of
      // BEH-BR-188 and then fails operationally is reported, never dropped.
      | UnknownPlugin | Conflict | Superseded | CleanupError | DrainTimeout | WouldDeadlock
  }[]
}

interface Host {
  reconcile(desired: readonly DesiredPlugin[], options?: ReconcileOptions & OperationOptions):
    Effect.Effect<ReconcileReport,
      | Unattributed | ReasonRequired | AuditUnavailable | HostClosed | PlanStale
      | ApplyRolledBack | PartialApply>   // the last two only with atomic: true (32, BEH-BR-324)
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
REQUIREMENT: `BridgerOptions.mandatoryCatalog` MUST be fixed at construction.
             Construction MUST fail with a defect naming `mandatoryCatalog`
             when an entry's `id` is empty or two entries share one, as for
             any other option outside its domain (02 — Host Construction,
             BEH-BR-011).
```

```
REQUIREMENT: An entry's `mandatoryInterceptions` MUST hold catalog ids only,
             never an interception value or a function. An entry that names
             an id absent from `mandatoryCatalog`, or names one id twice,
             MUST be rejected with `InvalidDefinition { id, reason }`,
             `reason` naming the id, and MUST cause no action.
```

```
REQUIREMENT: An `install` issued for an entry MUST pass, as
             `InstallOptions.mandatory`, the catalog entries the entry names,
             in the entry's order, and as `InstallOptions.allowChildren` the
             entry's `allowChildren` (default true)
             ([28 — Plugin Principal and Mandatory Policy](./28-plugin-principal-and-mandatory-policy.md),
             BEH-BR-260, BEH-BR-263). The host MUST keep, for a plugin
             `reconcile` installed, the ids and the flag it was installed
             with, for as long as the registration lasts.
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

`IncompatibleContract` and `IncompatibleEngine` reach `rejected` as members
of `InstallError` ([26 — Versioned Contracts](./26-versioned-contracts.md),
[27 — Manifest and Lazy Activation](./27-manifest-and-lazy-activation.md)). A
report carries the error object, so the union is enough; a plan carries
plain data and names each by its own `_tag`, never "InstallError"
([32 — Generic Gate and Plan](./32-generic-gate-and-plan.md), BEH-BR-318).
With `expect`, a diff that differs from the plan fails the call with
`PlanStale` ([32 — Generic Gate and Plan](./32-generic-gate-and-plan.md),
BEH-BR-319); a dry run is the read-only `Host.plan` (BEH-BR-317), never an
option of `reconcile`.

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
overlay has no error channel to report it through. (4) A desired list is
data — read from a file, a database or a federation authority, shown in a
plan, compared with `expect` — so an entry names its mandatory interceptions
by catalog id and never carries the `wrap` function itself. The functions
stay in the application's code, wired once at construction; a list can only
choose among them, which also means a list received from elsewhere cannot
bring a policy function of its own into the host. This closes the
desired-state half of gap G40; the gate request half is in
[25 — Operation Gate](./25-operation-gate.md) and
[28 — Plugin Principal and Mandatory Policy](./28-plugin-principal-and-mandatory-policy.md).

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
             The `disabled` compared MUST be the operator's flag: a
             registration `disabled` with reason "refused-digest"
             ([28 — Plugin Principal and Mandatory Policy](./28-plugin-principal-and-mandatory-policy.md),
             BEH-BR-267) MUST count as `disabled: false`, so the diff never
             issues `enable` for it because of that reason (CCR-BR-029).
```

```
REQUIREMENT: Two definitions MUST be "the same definition" only when they are
             the same object, or when both carry `meta.version` and
             `meta.digest` and both pairs are equal. In every other case they
             MUST be treated as different. For a lazy definition, `version`
             and `digest` MUST be read from its identity `meta` — the
             manifest's `version` and the digest supplied to `Plugin.lazy`
             beside the manifest or, failing that, in it — and `reconcile`
             MUST NOT call its `load`
             ([27 — Manifest and Lazy Activation](./27-manifest-and-lazy-activation.md),
             BEH-BR-248).
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
REQUIREMENT: For an installed entry, `reconcile` MUST compare the entry's
             `mandatoryInterceptions` (absent = empty) with the ids the
             registration was installed with, as ordered lists, and the
             entry's `allowChildren` (absent = true) with the registration's
             flag. On any difference the entry MUST be rejected with
             `PolicyMismatch { id, realm, fields }` at validation, before
             any of its actions, and MUST cause no action. `reconcile` MUST
             NOT change a registration's mandatory interceptions or
             `allowChildren` by any action, and MUST NOT turn the difference
             into a `replace`, a removal or a reinstall.
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
or replaced. (3) A difference in mandatory interceptions or
`allowChildren` is a refusal, not an action, because no operation may change
them on a registration (28 — Plugin Principal and Mandatory Policy,
BEH-BR-260: they end only with `remove`). Turning the difference into a
removal and a fresh install would drop the plugin's activation, its
dependents and its children on the strength of a data edit, and an
approver reading "policy changed" would not see "plugin removed". An operator
who means it removes the entry (or the plugin) and lists it again: two
requests, each gated and recorded. This settles the second question of gap
G40.

## BEH-BR-155: A reconcile scope owns what it installed, and prunes only that

> **Invariant:** [INV-BR-021](../invariants.md#inv-br-021-reconcile-is-idempotent)
> **See:** [ADR-BR-023](../decisions/023-desired-state-reconcile.md)
> **Satisfies:** [URS-BR-016](../urs.md#urs-br-016-drive-the-plugin-set-from-a-declarative-list)
> **Risk:** [RSK-BR-019](../gxp/03-risk-assessment.md#rsk-br-019)

```
REQUIREMENT: A plugin installed by `reconcile` MUST be recorded as owned by
             `options.scope` (default "default") for as long as it stays
             installed. Ownership MUST end when the plugin is removed by any
             means. The snapshot entry of an owned plugin MUST carry the
             owning scope in `scope`, set in the revision that registers the
             plugin and gone with the entry (04 — States and Snapshots,
             BEH-BR-027; CCR-BR-039).
```

```
REQUIREMENT: With `prune` (default true), every plugin owned by the scope
             and absent from `desired` MUST be removed. Without `prune`, such
             plugins MUST be left untouched.
```

```
REQUIREMENT: Each prune `remove` MUST use `options.pruneDrain` as its
             `RemoveOptions.drain` and `options.pruneForce` as its `force`
             (06 — Removal), with the defaults of a direct `remove` when
             they are absent; it is gated and recorded exactly as a direct
             `remove` with those options. `pruneDrain` and `pruneForce`
             MUST be ignored when `prune` is false, except by the undo
             removals of an atomic apply, which use them whatever `prune`
             is ([32 — Generic Gate and Plan](./32-generic-gate-and-plan.md),
             BEH-BR-326). A prune `remove` that
             fails with `DrainTimeout` is reported in `rejected` like any
             other operational failure (BEH-BR-157).
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
             moment its intent is recorded (below), and then act in two
             phases, each in a fixed order:
             1. Removal phase — the prune removals and the entries whose
                action sequence begins with `disable` (BEH-BR-154), with
                dependents first: an action on a plugin P MUST come after
                every action of this phase on a plugin that depends on P in
                the current state. Ties MUST be broken with prune removals
                before entries, prune removals by (realm, id) in code-unit
                order, and entries in list order.
             2. Change phase — every other entry that has actions, with
                providers first: an entry D MUST come after an entry P when,
                in the state the list describes, P's definition provides a
                key that D's definition requires in D's resolution scope
                (`scopeOf`, 17 — Realms and Interception). Ties MUST be
                broken in list order. Edges that lie on a cycle of these
                edges MUST be ignored for the order, so the entries of a
                cycle keep list order among themselves.
             The diff MUST then, at validation and before any action, run
             the cycle check each entry's actions would meet in their
             direct calls (03 — Installation, BEH-BR-020), in this order,
             against the state the list describes up to that entry — the
             registered plugins, with the earlier entries' actions applied
             and the entries already rejected left out. An entry whose
             action would close a cycle MUST be a validation-stage
             rejection with `DependencyCycle { path }`: it MUST cause no
             action, and `Host.plan` MUST list it in `rejected`
             (BEH-BR-318), so that with `atomic` the call applies nothing
             (BEH-BR-322). The cycle check of the direct call stays in
             force as a safety net for a state that changed after the diff
             (CCR-BR-035).
             The diff computation, including this order, MUST be the one
             `Host.plan` uses
             ([32 — Generic Gate and Plan](./32-generic-gate-and-plan.md),
             BEH-BR-317).
```

```
REQUIREMENT: "Depends on" and "requires" in the order above MUST be read
             from `requires` declarations only — plain keys and contract
             references alike, `optional` keys excluded — and, for a lazy
             definition, from its manifest, without calling its `load`
             ([27 — Manifest and Lazy Activation](./27-manifest-and-lazy-activation.md),
             BEH-BR-242). The order MUST be a function of the list and of the
             registered definitions only, so that two runs of one list on one
             state issue the same operations in the same sequence.
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
comparable. Removals go first so that a provider moving from a dropped
plugin to a listed one frees its slot before the new one is installed; within
them dependents go first, as every stop does
([ADR-BR-038](../decisions/038-cross-plugin-stop-ordering.md)). Changes go
providers first so that a dependent which needs an upgraded provider meets
the upgrade already registered: the compatibility check of
[26 — Versioned Contracts](./26-versioned-contracts.md) (BEH-BR-228) runs
against the definitions registered when each action is linearized, so a list
that installs a dependent before the provider replacement it needs would
otherwise be refused with `IncompatibleContract` and converge only on the
next run.

**Settled here (CCR-BR-025).** Earlier revisions acted on the entries in
list order, which made the outcome depend on how the author happened to sort
the list (gap G36). The order is now derived from the declarations, with list
order kept only as the tie-break, so it stays deterministic and visible in
the plan. One case is not solved by any fixed order and is stated rather than
hidden: a `replace` that *narrows* a provider — a lower minor, fewer methods —
while a listed dependent's *current* definition still needs what is taken
away. Providers first refuses the provider's `replace`; the dependent's
replacement must be registered first, which is a separate run (or, with
`atomic`, an undo of the whole apply, 32 — Generic Gate and Plan,
BEH-BR-322). Ordering against the final state as a whole, rather than step
by step, would need every check to run against a staged set — the
alternative [ADR-BR-051](../decisions/051-atomic-bundle-apply.md) rejects.

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
             stated below for audit unavailability, and with `atomic`, where
             the first rejection stops the apply and undoes it
             ([32 — Generic Gate and Plan](./32-generic-gate-and-plan.md),
             BEH-BR-322–326).
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
             recorded; they are not rolled back. With `atomic`, the call
             MUST instead fail with `PartialApply` naming them
             (32 — Generic Gate and Plan, BEH-BR-326).
```

```
REQUIREMENT: When the audit-degraded latch becomes set while a `reconcile` is
             running (a terminal or system record could not be written),
             `reconcile` MUST issue no further action and MUST fail with
             `AuditUnavailable`, with the same treatment of completed actions.
```

```
REQUIREMENT: When host shutdown begins while a `reconcile` without `atomic`
             is running, `reconcile` MUST issue no further action and MUST
             fail with `HostClosed`. Entry actions already completed MUST
             remain applied and recorded; an action already issued ends as
             the direct call would under shutdown (08 — Operation Legality,
             BEH-BR-075). With a sink wired, the parent terminal record
             MUST be `failed` with `HostClosed`, written before the audit
             writer closes (12 — Shutdown and Hosting, BEH-BR-108). With
             `atomic`, 32 — Generic Gate and Plan, BEH-BR-326, applies.
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
and an automatic reversal would itself be an unrequested change — which is
why reversal happens only when the caller asks for it with `atomic`, and even
then not once the trail can no longer record it (BEH-BR-326). A caller that
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
             call — with `atomic`, also to every operation the undo of that
             diff could issue (32 — Generic Gate and Plan, BEH-BR-323). When
             any of them requires a reason and the context has none, the
             call MUST fail with `ReasonRequired` and MUST write no record.
```

```
REQUIREMENT: With `expect`, the diff computed at the call and the diff
             recomputed at the intent MUST also be compared with the plan;
             on a difference the call MUST fail with `PlanStale` as
             [32 — Generic Gate and Plan](./32-generic-gate-and-plan.md),
             BEH-BR-319, specifies, and no entry action MUST be issued.
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
             once for the call when absent). The undo actions of an atomic
             apply MUST be attributed, gated and recorded by the same rules
             (32 — Generic Gate and Plan, BEH-BR-325).
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
REQUIREMENT: Running `reconcile(D, o)` and, after it completes with no
             entry in `rejected`, running `reconcile(D, o)` again MUST issue
             no action the second time: every entry is `unchanged` and
             nothing is pruned. An entry rejected by the first run — by the
             gate, or by the `RefusalList` (28, BEH-BR-267) — is attempted
             again by the second, and rejected again while the reason
             stands. A registration that the list moved to `disabled` with
             reason "refused-digest" outside a call issues no action, by the
             rule of BEH-BR-154 (CCR-BR-029).
```

```
REQUIREMENT: After `reconcile(D, o)` completes and the host is idle, the set
             of plugins owned by `o.scope`, their definitions, their
             overrides and their enabled flags MUST depend only on D — not on
             the edit history that led there — except as stated for failed
             plugins and refused digests in BEH-BR-160.
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
REQUIREMENT: A trigger (27 — Manifest and Lazy Activation, BEH-BR-245) is
             history: two histories ending in the same installed set MAY
             differ in whether a registration of a lazy definition is
             loaded. For the comparison of this behaviour, the state of each
             such registration MUST be read through one map — `dormant` and
             `active` are one class, every other state stands for itself —
             and under that map the states of all registrations MUST be
             equal once idle. The states of registrations of eager
             definitions MUST be equal without the map. For a lazy
             registration in that class, its `lazy.loaded` flag, its
             principal and the services and contributions it publishes MUST
             NOT be compared (CCR-BR-028).
```

```
REQUIREMENT: The one permitted exception is failure: two histories that
             differ in a past build, activation, runtime or cleanup failure
             MAY differ until that plugin is retried, restarted, replaced,
             reconfigured, disabled or removed. Core MUST NOT retry a failed
             plugin to restore confluence.
```

```
REQUIREMENT: A `RefusalList` answer is history in the same way (28 — Plugin
             Principal and Mandatory Policy, BEH-BR-267): the list stops no
             running plugin, so a registration `active` when its digest was
             listed stays `active`, while the same installed set built after
             the listing has it `disabled` with reason "refused-digest". For
             the comparison of this behaviour, a registration `disabled`
             with that reason MAY differ from the same registration in any
             other state until an operator call addresses it. Core MUST NOT
             stop a plugin, or start one, to restore confluence
             (CCR-BR-029).
```

Three properties carry confluence: dependents stop first and providers start
first; a `waiting` plugin starts by itself when its provider returns; and
`reconcile` is a function of its list. Failure is the deliberate exception
because an automatic retry would repeat whatever side effects the failed
`build` already performed, possibly in a loop — exactly the hidden behaviour
[ADR-BR-005](../decisions/005-failure-is-sticky.md) rules out. The refusal
list is the second exception for the same reason: making confluence hold
would mean the list stopping running plugins, a mutating operation with no
caller (BEH-BR-267, Settled 4); the loader companion's kill switch does
that with an attributed `remove` for the plugins of its own scope, only
reports those outside it (loader BEH-LD-031), and never reconciles or
disables for a revocation (loader BEH-LD-029).

The test suite checks confluence directly: two different histories ending in
the same installed set must produce equal snapshots once idle, modulo
revision numbers, timing and each entry's `scope` — ownership is history, as
`install(A)` and `reconcile([A])` reach the same installed set with different
owners — with lazy registrations compared under the map
above ([21 — Testing Host](./21-testing-host.md)). The map exists because a
wake is an operation: the host-core prototype's confluence property found
histories that differ only in a woken lazy plugin (finding G-P7, 27,
BEH-BR-252).

---

## Acceptance checks

These checks extend BEH-BR-184 (21 — Testing Host); their scenarios are
allocated in [traceability.md](../traceability.md) §5. Each will be a tagged
scenario once code exists; none has run.

| Scenario | Check | Behaviours |
| --- | --- | --- |
| REQ-BR-098 | A list that installs a dependent before the provider replacement it needs, in any list order, converges in one run; removals and disable-first entries run dependents first, other changes providers first, ties in list order; `Host.plan` lists the same order; no lazy `load` is called to compute it; an entry that would close a dependency cycle is a validation-stage rejection (`DependencyCycle`) in the plan's `rejected`, and with `atomic` nothing is applied | BEH-BR-156, BEH-BR-317 |
| REQ-BR-101 | An entry's `mandatoryInterceptions` reach `InstallOptions.mandatory` from `mandatoryCatalog` in order, with `allowChildren`; unknown or repeated ids give `InvalidDefinition`; a policy difference on an installed entry gives `PolicyMismatch` and no action; a catalog with an empty or repeated id fails construction | BEH-BR-153, BEH-BR-154 |

_Previous: [17 — Realms and Interception](./17-realms-and-interception.md)_ · _Next: [19 — Contribution Registry](./19-contribution-registry.md)_
