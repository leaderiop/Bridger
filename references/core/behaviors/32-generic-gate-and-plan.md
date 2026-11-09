# 32 — Generic Gate and Plan

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-BEH-32                                               |
> | Revision       | 0.7                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.7 (2026-11-09): BEH-BR-318 a plan rejection's `_tag` is the concrete tag of the error, an `InstallError` member's own tag, never the union's name (C-07) (CCR-BR-033)<br>0.6 (2026-11-08): BEH-BR-318 and BEH-BR-319 `expect` compares `pruneDrain` and `pruneForce` only when `prune` or `atomic` is true (host-core prototype finding G-P23), BEH-BR-326 aligned; BEH-BR-323 a two-action undo step that stops halfway is one `notUndone` entry (G-P24); checks REQ-BR-083 and REQ-BR-099 amended (CCR-BR-030)<br>0.5 (2026-11-08): BEH-BR-317 `plan` and atomic validation consult the `RefusalList`; BEH-BR-318 `rejected` may carry a refusal, `registeredAt` tracks the operator's flag; BEH-BR-322 a step-4b refusal stops an atomic apply; BEH-BR-323 undo of `replace` restores the entry's previous override, expected revision moves with the undo, the "refused-digest" reason is not restored; BEH-BR-326 undo removals use the prune options whatever `prune` is (agent review R1-01, R1-02, R1-07, R1-11, R1-12) (CCR-BR-029)<br>0.4 (2026-11-08): BEH-BR-317 `plan` MUST decode a `reconfigure` value to compute the recorded paths (host-core prototype finding G-P10); BEH-BR-319 `PlanStale` mismatches not about one entry carry no `id` or `realm` (G-P9) (CCR-BR-028)<br>0.3 (2026-11-08): BEH-BR-322–326 atomic apply (`atomic: true`): dependency order, stop at the first failure, undo in reverse, `ApplyRolledBack` and `PartialApply`, records with `undoes`, gate requests with `undo`, interaction with leases, drain, `PlanStale`, the latch, interruption and shutdown; BEH-BR-318 plan carries `atomic`, `undo` and `policy`, and `PolicyMismatch` among rejections; BEH-BR-319 compares `atomic`; acceptance checks 99 and 100 (CCR-BR-025)<br>0.2 (2026-11-08): `plan` may decode `reconfigure` values to compute paths (never exposed); `configChange.paths` and the prune options are part of the `expect` comparison; plan `rejected` reasons are `{ _tag, message }`; `Gate.all` pieces take a timeout (CCR-BR-022)<br>0.1 (2026-11-08): Initial draft (CCR-BR-019) |

---

The `OperationGate` port ([25 — Operation Gate](./25-operation-gate.md))
answers one question for one kind of request: may this host lifecycle
operation run now. Applications ask the same question of their own requests
— a command, a tool call an agent wants to make, a batch of changes — and
often the honest answer is neither yes nor no but "not yet: hold this until
someone approves it". This file generalises the gate into `Gate<Req>`, whose
decision is `Allow`, `Refuse` or `Defer` with a draft; re-expresses
`OperationGate` as one instance of it without changing its behaviour or its
records; gives drafts the expected versions that let a stale draft be
detected and re-planned; and adds `Host.plan`, a dry run of `reconcile` that
returns the diff with no effect, so that an agent can propose a plugin set,
show what would change and ask for approval before anything happens. It has
no SPEC.md source section ([ADR-BR-047](../decisions/047-generic-gate-and-plan.md),
building on [ADR-BR-032](../decisions/032-operation-gate.md) and
[ADR-BR-023](../decisions/023-desired-state-reconcile.md)). This file owns
BEH-BR-313–328 and uses BEH-BR-313–326; numbers 327–328 of the block are reserved.

> **What core does not do — and who does**
>
> Core ships no gate implementation, stores no draft, records no approval and
> runs no approval workflow. A deferred request is held, shown, approved and
> re-submitted by the consumer or a companion. `Host.plan` describes what
> `reconcile` would do; it reserves nothing, so the host can change between a
> plan and its application — which is what expected versions detect, not
> prevent.

Planned source: `packages/core/src/Gate.ts` and `packages/core/src/Plan.ts`
*(Planned)*; `Host.plan` and the `expect` option in
`packages/core/src/Reconcile.ts` *(Planned)*.

## BEH-BR-313: Gate<Req> and its three decisions

> **See:** [ADR-BR-047](../decisions/047-generic-gate-and-plan.md), [ADR-BR-032](../decisions/032-operation-gate.md)
> **Satisfies:** [URS-BR-037](../urs.md#urs-br-037-review-a-proposed-plugin-set-change-before-it-is-applied), [URS-BR-024](../urs.md#urs-br-024-require-approval-before-a-regulated-change)
> **Risk:** [RSK-BR-014](../gxp/03-risk-assessment.md#rsk-br-014)

```ts
// illustrative — not type-checked
type GateDecision<Req> =
  | { readonly _tag: "Allow" }
  | { readonly _tag: "Refuse"; readonly reason: string }
  | { readonly _tag: "Defer"; readonly draft: Draft<Req> }

interface Gate<Req> {
  readonly decide: (request: Req, context: GateContext) => Effect.Effect<GateDecision<Req>>
}
interface GateContext {
  readonly annotations: Annotations     // the caller's annotations whose key declares flow "gate" (30, BEH-BR-292)
}

declare const Gate: {
  // Consults a gate with the fail-closed rules of BEH-BR-314.
  run<Req>(gate: Gate<Req>, request: Req, options: {
    readonly name: string
    readonly timeout: Duration.Input | "forever"
  }): Effect.Effect<GateDecision<Req>>
}
```

```
REQUIREMENT: `Gate<Req>` MUST be a type and `Gate.run` a function. Core
             MUST NOT export any `Gate` implementation — no allow-all, no
             refuse-all, no "defer everything", no example — other than the
             scripted test fixture of 21 — Testing Host.
```

```
REQUIREMENT: `Allow` MUST mean the request may proceed now; `Refuse` MUST
             mean it MUST NOT proceed; `Defer` MUST mean it MUST NOT proceed
             now and that the gate has produced a draft describing what
             would be approved. A caller MUST treat `Defer` as not allowed.
```

```
REQUIREMENT: `Gate.run` MUST pass `decide` the calling fiber's annotations
             filtered to those whose key declares the flow "gate"
             (30 — Operation Context Annotations, BEH-BR-292), and nothing
             else of the caller's context.
```

```
REQUIREMENT: Core MUST NOT interpret a `Req` or a `Refuse.reason`. A
             request is the application's value; core never inspects it.
```

The three outcomes are the ones a person or an agent actually meets. "Not
yet" is not a refusal — nothing is wrong with the request — and it is not an
approval. Giving it its own case with a draft lets the caller show the
operator exactly what is waiting, instead of a refusal whose message has to
be parsed for a ticket number.

## BEH-BR-314: Consulting a gate fails closed, once per request

> **See:** [ADR-BR-047](../decisions/047-generic-gate-and-plan.md), [ADR-BR-032](../decisions/032-operation-gate.md)
> **Satisfies:** [URS-BR-037](../urs.md#urs-br-037-review-a-proposed-plugin-set-change-before-it-is-applied)
> **Risk:** [RSK-BR-014](../gxp/03-risk-assessment.md#rsk-br-014)

```
REQUIREMENT: `Gate.run` MUST call `decide` exactly once. It MUST NOT cache,
             reuse or infer a decision; two identical requests MUST each be
             submitted.
```

```
REQUIREMENT: A `decide` that dies, or is interrupted by anything other than
             the caller, MUST yield `Refuse { reason: "gate-defect" }`. A
             `decide` that has not completed within `timeout` (measured with
             the `Clock` service) MUST be interrupted and MUST yield
             `Refuse { reason: "gate-timeout" }`. `timeout: "forever"` MUST
             be accepted only when stated.
```

```
REQUIREMENT: When the caller is interrupted while `decide` runs, `decide`
             MUST be interrupted and `Gate.run` MUST end without a decision.
```

```
REQUIREMENT: A `Defer` whose draft is malformed (BEH-BR-316) MUST yield
             `Refuse { reason: "gate-defect" }`.
```

These are the rules of BEH-BR-221, lifted out of the host so that every gate
an application builds fails the same way: a gate that cannot answer has not
allowed anything. `Gate.run` writes no audit record; a caller that records
its gated requests does so itself, as the host does for its own
(BEH-BR-315).

## BEH-BR-315: OperationGate is the Gate<OperationRequest> instance, with unchanged behaviour and records

> **Invariant:** [INV-BR-026](../invariants.md#inv-br-026-an-unwired-sink-or-gate-changes-nothing), [INV-BR-027](../invariants.md#inv-br-027-a-refused-or-unauditable-mutation-changes-nothing)
> **See:** [ADR-BR-047](../decisions/047-generic-gate-and-plan.md), [ADR-BR-032](../decisions/032-operation-gate.md)
> **Satisfies:** [URS-BR-024](../urs.md#urs-br-024-require-approval-before-a-regulated-change), [URS-BR-037](../urs.md#urs-br-037-review-a-proposed-plugin-set-change-before-it-is-applied)
> **Risk:** [RSK-BR-014](../gxp/03-risk-assessment.md#rsk-br-014)
> **Regulatory:** supports 21 CFR 11.10(f), 11.10(g)

```ts
// illustrative — not type-checked
declare const OperationGate: {
  // Adapts a generic gate to the port the host reads (25 — Operation Gate).
  fromGate(gate: Gate<OperationRequest>, options?: {
    readonly deferReason?: (draft: Draft<OperationRequest>) => string   // default: () => "deferred"
  }): OperationGateShape
  // Views a wired port as a generic gate (never yields Defer).
  asGate(port: OperationGateShape): Gate<OperationRequest>
}
```

```
REQUIREMENT: The host MUST keep reading the `OperationGate` port with the
             shape, position, timeout, failure rules and records of
             BEH-BR-217–224. Nothing in this file MUST change any of them.
```

```
REQUIREMENT: `OperationGate.fromGate(gate)` MUST map `Allow` to success,
             `Refuse { reason }` to `OperationRejected { reason }`, and
             `Defer { draft }` to `OperationRejected { reason }` where
             `reason` is `deferReason(draft)`. A deferred host operation
             MUST therefore change nothing and leave exactly the one
             `rejected` record of BEH-BR-220.
```

```
REQUIREMENT: The host MUST NOT hold a host lifecycle operation open while a
             deferred request awaits approval. An approved draft MUST be
             applied by issuing the operation again; that call MUST be gated
             again, as every call is (BEH-BR-218).
```

```
REQUIREMENT: `OperationGate.asGate(port)` MUST map success to `Allow` and
             `OperationRejected { reason }` to `Refuse { reason }`; it MUST
             NOT yield `Defer`.
```

Re-expressing `OperationGate` as an instance means one vocabulary and one
set of failure rules for every gate in an application, while the host's own
port stays byte-for-byte what [ADR-BR-032](../decisions/032-operation-gate.md)
decided. `Defer` reaches the host as a refusal on purpose: BEH-BR-221 already
says approval is obtained *before* the call, not by holding the call open
while someone is paged, and a parked lifecycle operation waiting on a person
would hold its plugin's linearization point for as long as that takes.

**Settled here.** (1) No new audit phase for deferral: the `rejected` record,
whose message carries `deferReason(draft)`, already says "this request
reached the gate and did not proceed", and a reviewer finds the draft
through the reason and the call's `correlationId` in the companion's store.
The audit record schema is unchanged. (2) The default reason is the fixed
string "deferred", never text from the draft, so that the gate does not put
request content into the trail unless the consumer chooses to.

## BEH-BR-316: Drafts carry expected versions, and a stale draft is re-planned

> **Invariant:** [INV-BR-043](../invariants.md#inv-br-043-a-plan-changes-nothing-and-a-stale-plan-applies-nothing)
> **See:** [ADR-BR-047](../decisions/047-generic-gate-and-plan.md)
> **Satisfies:** [URS-BR-037](../urs.md#urs-br-037-review-a-proposed-plugin-set-change-before-it-is-applied)
> **Risk:** [RSK-BR-033](../gxp/03-risk-assessment.md#rsk-br-033)

```ts
// illustrative — not type-checked
interface Draft<Req> {
  readonly draftId: string                          // chosen by the gate, e.g. from IdGenerator
  readonly requests: readonly Req[]                 // one or more; applied together or not at all by the consumer
  readonly expected: readonly Expectation[]         // what must still hold when the draft is applied
}
interface Expectation { readonly key: string; readonly version: string }

type DraftCheck =
  | { readonly _tag: "Fresh" }
  | { readonly _tag: "Stale"; readonly mismatches: readonly {
      readonly key: string; readonly expected: string; readonly actual: Option.Option<string> }[] }

declare const Draft: {
  check<Req>(draft: Draft<Req>, read: (key: string) => Effect.Effect<Option.Option<string>>):
    Effect.Effect<DraftCheck>
}
```

```
REQUIREMENT: A draft MUST be well formed: a non-empty `draftId`, at least
             one request, and `expected` keys without duplicates. Versions
             MUST be compared as opaque strings.
```

```
REQUIREMENT: `Draft.check` MUST call `read` once per expectation and MUST
             return `Stale` listing every expectation whose current version
             differs or is absent, and `Fresh` otherwise. It MUST perform no
             other effect.
```

```
REQUIREMENT: Core documentation MUST state that an approved draft is applied
             only after a `Fresh` check, that a `Stale` draft MUST be
             re-planned and approved again rather than applied, and that a
             check followed by an apply is not atomic unless the apply
             itself re-checks — as `reconcile` with `expect` does for host
             changes (BEH-BR-319).
```

An approval is an approval of a change *to a particular state*. Approving
"replace the pricing plugin with 4.2" while 4.0 is installed does not
approve the same text applied after someone else installed 4.1. Expected
versions are how a draft says what it was planned against, so the party that
applies it can tell.

`draftId` is the handle the rest of the system uses for the deferred
request: a dispatcher returns it to its caller (a command catalog returns it
as `CommandDeferred.draftId`), the approval store keys the approval by it,
and the approved request is submitted again carrying a reference to it —
for example the command companion's `ApprovalRef { draftId, approvalId,
digest }` — so that the gate can recognise the approval when it is asked a
second time. Core defines no reference type and never reads one.

```
REQUIREMENT: `Gate.run` MUST return a `Defer`'s draft, including its
             `draftId`, to its caller unchanged.
```

**Settled here.** Core gives drafts a shape and a check, not a store or a
lifecycle: who may approve, how long a draft lives and where it is kept are
the consumer's. The versions are opaque strings so that any application —
an ERP's document revision, a command's aggregate version, the host's own
registration revision (BEH-BR-318) — can supply them.

## BEH-BR-317: Host.plan is a dry run of reconcile with no effect

> **Invariant:** [INV-BR-043](../invariants.md#inv-br-043-a-plan-changes-nothing-and-a-stale-plan-applies-nothing)
> **See:** [ADR-BR-047](../decisions/047-generic-gate-and-plan.md), [ADR-BR-023](../decisions/023-desired-state-reconcile.md)
> **Satisfies:** [URS-BR-037](../urs.md#urs-br-037-review-a-proposed-plugin-set-change-before-it-is-applied), [URS-BR-016](../urs.md#urs-br-016-drive-the-plugin-set-from-a-declarative-list)

```ts
// illustrative — not type-checked
interface Host {
  plan(desired: readonly DesiredPlugin[], options?: ReconcileOptions): Effect.Effect<ReconcilePlan, HostClosed>
}
```

```
REQUIREMENT: `plan` MUST compute the diff `reconcile(desired, options)`
             would compute against the host state at one revision — entry
             validation, ownership, the keyed diff, the action order of one
             entry and pruning (BEH-BR-153–156) — using the same code path,
             and MUST return it without performing any action.
```

```
REQUIREMENT: `plan` MUST be a read-only operation: it MUST NOT record an
             intent, take a turn at any linearization point, consult the
             `OperationGate` or the `ConfigFingerprinter`, write any audit
             record, emit any host event, expose a configuration value, or
             build, stop or reserve anything. It MUST compute a
             `reconfigure` entry's `configChange.paths` as `reconcile` will
             record them, decoding the value with the loaded definition's
             schema (CCR-BR-028)
             (BEH-BR-197; for a registration not yet loaded, the top-level
             keys of the raw value, 27 — Manifest and Lazy Activation,
             BEH-BR-247); the decoded value MUST NOT leave the call. A value
             that does not decode MUST make the entry a validation
             rejection (`ConfigInvalid`), as it would in `reconcile`. It MUST NOT take an
             `OperationContext` and MUST NOT be attributed (BEH-BR-186).
```

```
REQUIREMENT: When a `RefusalList` is wired, `plan` — and `reconcile` at
             validation, step 4 of BEH-BR-188 — MUST call `refused` for each
             entry action that step 4b would submit (28 — Plugin Principal
             and Mandatory Policy, BEH-BR-267), with the definition step 4b
             would submit, and MUST list an entry with a refused action in
             `rejected` with `{ _tag: "OperationRejected", message:
             "refused-digest: <reason>" }` instead of in `entries`. Without
             `atomic`, `reconcile` MUST still issue that entry's actions in
             order, so that step 4b refuses the refused one and writes its
             `rejected` record (BEH-BR-267) and the entry receives no
             further action (BEH-BR-157); with `atomic`, it is a
             validation-stage rejection
             (BEH-BR-322). The plan's `rejected` set, compared by `expect`
             (BEH-BR-319), therefore goes stale when the list changes
             (CCR-BR-029).
```

```
REQUIREMENT: `plan` MUST NOT mutate `desired` and MUST NOT retain it after
             the call completes. Its only failure MUST be `HostClosed`.
```

**Settled here.** The architecture review wrote the dry run as
`reconcile(desired, { plan: true })`. It is a separate read-only method
instead. A flag that turns the one mutating batch operation into a read-only
one would split `reconcile` across the partition of BEH-BR-186 — attributed,
gated and audited on one value of an option, none of those on the other —
and a caller who forgot the flag, or a refactoring that dropped it, would
apply what was meant to be shown. Two methods sharing one diff computation
keep the property that matters — the plan is exactly what `reconcile` would
do against that state — without the hazard.

## BEH-BR-318: The ReconcilePlan, without values

> **Invariant:** [INV-BR-028](../invariants.md#inv-br-028-audit-records-carry-no-configuration-values), [INV-BR-013](../invariants.md#inv-br-013-configuration-values-are-never-observable)
> **See:** [ADR-BR-047](../decisions/047-generic-gate-and-plan.md), [ADR-BR-033](../decisions/033-no-config-values-in-audit.md)
> **Satisfies:** [URS-BR-037](../urs.md#urs-br-037-review-a-proposed-plugin-set-change-before-it-is-applied)
> **Risk:** [RSK-BR-033](../gxp/03-risk-assessment.md#rsk-br-033), [RSK-BR-008](../gxp/03-risk-assessment.md#rsk-br-008)

```ts
// illustrative — not type-checked
interface ReconcilePlan {
  readonly hostId: string
  readonly revision: number                          // HostSnapshot.revision the plan was computed at
  readonly scope: string
  readonly prune: { readonly enabled: boolean; readonly drain?: Duration.Input | "forever"; readonly force: boolean }
                                                     // the prune options the plan was computed with (18, BEH-BR-155);
                                                     // `expect` compares drain and force only when `enabled` or `atomic`
                                                     // is true (BEH-BR-319, CCR-BR-030)
  readonly entries: readonly PlannedEntry[]          // in the order reconcile would act on them
  readonly unchanged: readonly { readonly id: string; readonly realm: string }[]
  readonly rejected: readonly {
    readonly id: string; readonly realm: string
    readonly reason: { readonly _tag: InstallError["_tag"]   // "DuplicatePlugin" | "DuplicateProvider" | "DependencyCycle"
                                                            // | "InvalidDefinition" | "UnknownRealm" | "IncompatibleContract"
                                                            // | "IncompatibleEngine" (03, BEH-BR-018)
                                     | "ConfigInvalid" | "PolicyMismatch"
                                     | "OperationRejected"   // a RefusalList refusal only; message "refused-digest: <reason>"
                       readonly message: string }   // core-written; never a value, never a cause
  }[]                                                 // validation-stage rejections and RefusalList refusals only
  readonly reasonRequiredFor: readonly Operation[]   // operations of the diff (and, when atomic, of its undo) listed in requireReason
  readonly atomic: boolean                           // the atomic option the plan was computed with (BEH-BR-322)
}

interface PlannedEntry {
  readonly target: { readonly id: string; readonly realm: string }
  readonly actions: readonly ("install" | "replace" | "reconfigure" | "disable" | "enable" | "remove")[]
  readonly expected: { readonly installed: false }
                   | { readonly installed: true; readonly registeredAt: number;
                       readonly version?: string; readonly digest?: string }
  readonly incoming?: { readonly version?: string; readonly digest?: string }
  readonly configChange?: { readonly paths: readonly string[] }     // paths only, as BEH-BR-197
  readonly stops?: readonly { readonly id: string; readonly realm: string }[]   // dependents an action would stop
  readonly consentDiff?: ConsentDiff     // installed vs. incoming manifest, when both carry one (27, BEH-BR-243)
  readonly policy?: { readonly mandatoryInterceptions: readonly string[]; readonly allowChildren: boolean }
                                         // install entries only: catalog ids and flag (18, BEH-BR-153)
  readonly undo?: readonly ("install" | "replace" | "reconfigure" | "disable" | "enable" | "remove")[]
                                         // atomic plans only: the undo actions, in issue order (BEH-BR-323)
}
```

```
REQUIREMENT: For each installed plugin the host MUST track `registeredAt`:
             the `HostSnapshot.revision` in which its definition, override,
             `disabled` flag or reconcile ownership last changed. The
             `disabled` flag tracked is the operator's: a move to `disabled`
             with reason "refused-digest" (28, BEH-BR-267) MUST NOT change
             `registeredAt`, and an operator `disable` that clears that
             reason MUST. The plan's
             `expected` MUST carry it for every entry whose plugin is
             installed, and `installed: false` otherwise.
```

```
REQUIREMENT: A plan MUST NOT contain a configuration value, a definition
             object, a key object, a service, a fiber or a cause. `incoming`
             MUST carry only the entry definition's `meta.version` and
             `meta.digest`, each absent when not declared; `configChange`
             MUST follow the path rule of BEH-BR-197 and MUST NOT carry
             fingerprints.
```

```
REQUIREMENT: A plan MUST be a plain serialisable value, so that it can be
             shown to a person, handed to an agent or stored by a companion.
             A rejection's `reason` MUST be the error's `_tag` and a message
             core writes from the tag and the identifiers involved, never
             the error object. The `_tag` MUST be the concrete tag of the
             error that rejected the entry: for a definition error, the
             tag of the `InstallError` member (03 — Installation,
             BEH-BR-018), never "InstallError", which names a union and is
             no error's tag; for a `replace` entry refused with
             `ReplaceError`, the tag of its `cause`, as `reconcile` reports
             it (18, BEH-BR-153).
```

```
REQUIREMENT: For an `install` or `replace` entry whose incoming definition
             carries a manifest — and, for `replace`, whose installed
             definition carries one — `consentDiff` MUST be the result of
             `consentDiff` (27 — Manifest and Lazy Activation, BEH-BR-243)
             between the installed manifest (none for `install`) and the
             incoming one. It MUST be computed from manifests only, without
             loading or evaluating code.
```

```
REQUIREMENT: `policy` MUST be present on every entry whose actions begin
             with `install`, carrying the entry's catalog ids in order and
             its `allowChildren`; it MUST NOT carry an interception value.
             When the plan is computed with `atomic: true`, `undo` MUST be
             present on every entry with actions and MUST list the undo
             actions BEH-BR-323 would issue if all the entry's actions
             completed, in the order they would be issued; it MUST be absent
             otherwise. `undo` is derived from `actions` and is not compared
             by `expect` on its own.
```

```
REQUIREMENT: `stops` MUST list the plugins that, against the planned state,
             would be stopped as dependents of the entry's actions. It is
             informational and MUST NOT be checked by `expect`
             (BEH-BR-319).
```

The plan answers the reviewer's questions — which plugins change, by which
actions, from which version to which, touching which configuration fields,
stopping which dependents — and nothing that would turn it into a channel
for secrets. `registeredAt` is the host's own expected version: an entry is
stale exactly when what the diff depends on has changed since the plan, and
not merely because something unrelated happened elsewhere in the host.

**Settled here.** (0) A plan's `rejected` and a `ReconcileReport`'s
`rejected` differ on purpose: the plan lists validation-stage rejections
and `RefusalList` refusals only (BEH-BR-317), as plain data with the realm; the report also lists entries that
passed validation and then failed operationally (BEH-BR-157), as error
values for the caller that made the call. (1) `registeredAt` is a revision number rather than a new
per-plugin counter, so that it can be correlated with snapshots and audit
records (`before.revision`). It is not added to `PluginSnapshot`; it appears
only in plans. (2) Plugin *state* (active, failed) is not an expectation:
the diff does not depend on it, and a plan that went stale every time a
plugin restarted would never be applicable on a busy host.

## BEH-BR-319: reconcile with expect applies a plan or nothing

> **Invariant:** [INV-BR-043](../invariants.md#inv-br-043-a-plan-changes-nothing-and-a-stale-plan-applies-nothing), [INV-BR-022](../invariants.md#inv-br-022-one-requested-and-one-terminal-record-per-mutating-call)
> **See:** [ADR-BR-047](../decisions/047-generic-gate-and-plan.md), [ADR-BR-023](../decisions/023-desired-state-reconcile.md)
> **Satisfies:** [URS-BR-037](../urs.md#urs-br-037-review-a-proposed-plugin-set-change-before-it-is-applied), [URS-BR-021](../urs.md#urs-br-021-know-who-changed-the-plugin-set-when-and-why)
> **Risk:** [RSK-BR-033](../gxp/03-risk-assessment.md#rsk-br-033)
> **Regulatory:** supports 21 CFR 11.10(f)

```ts
// illustrative — not type-checked
interface ReconcileOptions {
  readonly scope?: string
  readonly prune?: boolean
  readonly pruneDrain?: Duration.Input | "forever"   // 18, BEH-BR-155
  readonly pruneForce?: boolean
  readonly expect?: ReconcilePlan          // apply only if the diff still equals this plan
  readonly atomic?: boolean                // all entries or none, by undo (BEH-BR-322)
}

class PlanStale extends Schema.TaggedError<PlanStale>()("PlanStale", {
  mismatches: Schema.Array(Schema.Struct({
    id: Schema.optional(Schema.String),      // absent for a mismatch not about one entry
    realm: Schema.optional(Schema.String),
    reason: Schema.String
  }))
}) {}

// reconcile's call-level error union gains PlanStale:
//   Unattributed | ReasonRequired | AuditUnavailable | HostClosed | PlanStale
```

```
REQUIREMENT: With `expect`, `reconcile` MUST compare, at step 4 of BEH-BR-188
             (validation, once for the call), the diff it would compute with
             `expect`: same `hostId` and `scope`, the same `prune`, the same
             `pruneDrain` and `pruneForce` when `prune` or `atomic` is true
             (when neither is, they have no effect, BEH-BR-155, and MUST NOT
             be compared; CCR-BR-030, host-core prototype finding G-P23),
             the same entries with
             the same actions in the same order, each entry's
             `configChange.paths` and `policy` equal, the same `atomic`, the
             same `unchanged` and
             validation `rejected` sets, and each entry's `expected` equal
             to the plugin's current registration. On any difference it MUST
             fail with `PlanStale` listing every mismatch, MUST change
             nothing and MUST write no record. A mismatch about one entry —
             an entry present on one side only, in a different set, at a
             different place in the order, or with a different action,
             `configChange.paths`, `policy` or `expected` — MUST carry that
             entry's `id` and `realm`. A mismatch not about one entry
             (`hostId`, `scope`, a prune option, `atomic`) MUST carry no `id`
             and no `realm`, and a `reason` naming the field (CCR-BR-028).
```

```
REQUIREMENT: When the intent is recorded and the diff is recomputed
             (BEH-BR-156), `reconcile` MUST compare it with `expect` again.
             On any difference it MUST fail with `PlanStale`, MUST write the
             parent `failed` terminal record with that error
             (`children: 0`), and MUST issue no entry action.
```

```
REQUIREMENT: With `expect`, every entry action MUST still be gated, recorded
             and reported individually (BEH-BR-157, BEH-BR-158). An approved
             plan MUST NOT be a reason to skip or batch gate consultations.
```

```
REQUIREMENT: Without `expect`, `reconcile` MUST behave exactly as
             18 — Reconciliation and Confluence specifies.
```

The two comparisons mirror the `requireReason` rule of BEH-BR-158: a
provisional check before any record, so that the common case — someone
changed the host since the plan — leaves no trace and costs nothing; and a
final check at the intent, where the diff that will actually run is known,
answered with a recorded failure because the parent `requested` record
already exists. Between them, a plan is applied exactly as reviewed or not at
all.

**Settled here.** (1) Staleness fails the whole call, not the stale entries:
an approver approved a set of changes, and applying the part that still fits
is a different set nobody approved. (2) Entry-level outcomes after the check
— a gate refusal, an operational failure — remain per entry as today; the
plan describes what would be *attempted*, and the report says what happened.
With `atomic: true` an entry-level failure instead stops the apply and undoes
it (BEH-BR-322), so that the set is applied as approved or, failing that,
returned to where it was — or reported exactly as left (BEH-BR-324).

## BEH-BR-320: Propose, approve, apply

> **See:** [ADR-BR-047](../decisions/047-generic-gate-and-plan.md), [ADR-BR-032](../decisions/032-operation-gate.md)
> **Satisfies:** [URS-BR-037](../urs.md#urs-br-037-review-a-proposed-plugin-set-change-before-it-is-applied), [URS-BR-024](../urs.md#urs-br-024-require-approval-before-a-regulated-change)
> **Risk:** [RSK-BR-033](../gxp/03-risk-assessment.md#rsk-br-033), [RSK-BR-014](../gxp/03-risk-assessment.md#rsk-br-014)

```ts
// illustrative — not type-checked: an agent proposes a plugin set
const proposal = yield* host.plan(desired, { scope: "agent-tools" })
yield* approvals.request({ plan: proposal, requestedBy: agentActor })    // consumer / companion store
// ... later, after a person approves ...
yield* host.reconcile(desired, {
  scope: "agent-tools", expect: proposal,
  context: { actor: approver, reason: "approved change #42", correlationId: approvalId }
})
// Each entry action is gated; the consumer's gate answers from the recorded approval.
```

```
REQUIREMENT: Core documentation MUST describe this sequence as the way to
             make self-modification of a plugin set reviewable: `plan`,
             approval outside core, `reconcile` with `expect`, with each
             entry still gated.
```

```
REQUIREMENT: Core MUST NOT treat a plan, a draft or an approval as an
             authorisation. Only a wired `OperationGate` authorises host
             lifecycle operations (BEH-BR-222).
```

A system that changes its own plugin set — an agent adding a tool, an update
service applying a bundle — is safe to the extent that each change is seen
before it happens and applied exactly as seen. `plan` gives the "seen";
`expect` gives the "exactly"; the gate, consulted per entry, remains the
one place that says yes, so an approval store that is wrong, or a plan that
was never approved, still meets the gate.

## BEH-BR-321: Several gate pieces combine: all must allow, the first refusal wins

> **See:** [ADR-BR-047](../decisions/047-generic-gate-and-plan.md), [ADR-BR-032](../decisions/032-operation-gate.md)
> **Satisfies:** [URS-BR-037](../urs.md#urs-br-037-review-a-proposed-plugin-set-change-before-it-is-applied), [URS-BR-024](../urs.md#urs-br-024-require-approval-before-a-regulated-change)
> **Risk:** [RSK-BR-014](../gxp/03-risk-assessment.md#rsk-br-014), [RSK-BR-033](../gxp/03-risk-assessment.md#rsk-br-033)

```ts
// illustrative — not type-checked
declare const Gate: {
  // ...run
  all<Req>(pieces: readonly { readonly name: string; readonly gate: Gate<Req>;
                               readonly timeout: Duration.Input | "forever" }[]): Gate<Req>
}

// One host gate assembled from companion pieces, in a fixed order.
const gate = OperationGate.fromGate(Gate.all([
  { name: "signature", gate: loaderGate, timeout: "2 seconds" },          // never defers
  { name: "entitlement", gate: entitlementGate, timeout: "2 seconds" },    // never defers
  { name: "approval", gate: approvalGate, timeout: "5 seconds" }           // may defer
]))
```

```
REQUIREMENT: `Gate.all(pieces)` MUST consult the pieces one at a time, in
             list order, each through the rules of `Gate.run`
             (BEH-BR-314) with the piece's own `name` and `timeout`, so that
             a piece that dies or exceeds its `timeout` is a refusal. The
             composite's own bound is the caller's: a host gate built with
             `OperationGate.fromGate` is still bounded by `gateTimeout`
             (25 — Operation Gate, BEH-BR-221), which ends the consultation
             as a refusal "gate-timeout" whichever piece is running. The first `Refuse` MUST end the consultation and be
             the result, its reason prefixed with the piece's `name`
             (`"<name>: <reason>"`); the remaining pieces MUST NOT be
             consulted.
```

```
REQUIREMENT: When no piece refuses, the result MUST be the first `Defer`
             returned, if any — the pieces after it are still consulted, so
             that a later refusal wins over an earlier deferral — and
             `Allow` only when every piece allowed. An empty list MUST be
             rejected as a defect at `Gate.all`.
```

```
REQUIREMENT: Core documentation MUST state that pieces which are controls
             without an approval step (signature and revocation checks,
             entitlement) never return `Defer`, and SHOULD be listed before
             pieces that may defer.
```

A deployment rarely has one gate. A loader's signature check, an
entitlement check and an approval workflow each have a say over the same
request, and the host reads one port. Combining them conjunctively, with the
first refusal winning, keeps the property each piece was written for: no
piece can be overruled by another's yes. Consulting the remaining pieces
after a deferral means an approver is never asked to approve a request that
a later piece would refuse anyway.

**Settled here.** Pieces are consulted sequentially, not concurrently, so
that the order — and therefore which refusal is reported — is a function of
the list, and so that a refused request is not shown to pieces after the
refusal.

## BEH-BR-322: reconcile with atomic applies every entry or undoes what it applied

> **Invariant:** [INV-BR-048](../invariants.md#inv-br-048-an-atomic-apply-leaves-the-prior-plugin-set-or-reports-what-it-left)
> **See:** [ADR-BR-051](../decisions/051-atomic-bundle-apply.md), [ADR-BR-023](../decisions/023-desired-state-reconcile.md), [ADR-BR-004](../decisions/004-replace-is-stop-then-start.md)
> **Satisfies:** [URS-BR-051](../urs.md#urs-br-051-apply-a-reviewed-plugin-set-change-as-a-whole-or-not-at-all), [URS-BR-016](../urs.md#urs-br-016-drive-the-plugin-set-from-a-declarative-list)
> **Risk:** [RSK-BR-059](../gxp/03-risk-assessment.md#rsk-br-059), [RSK-BR-033](../gxp/03-risk-assessment.md#rsk-br-033)

```ts
// illustrative — not type-checked: switch a terminal's bundle at a safe point, as approved
const plan = yield* host.plan(bundle, { scope: "terminal", atomic: true })
// ... approval outside core ...
yield* host.reconcile(bundle, {
  scope: "terminal", expect: plan, atomic: true,
  context: { actor: operator, reason: "end-of-day bundle switch", correlationId: approvalId }
}).pipe(
  Effect.catchTag("ApplyRolledBack", (e) => report.rolledBack(e)),   // the previous set is registered again
  Effect.catchTag("PartialApply", (e) => report.needsOperator(e))    // e.notUndone says what stayed applied
)
```

```
REQUIREMENT: `ReconcileOptions.atomic` MUST default to false. Without it,
             `reconcile` MUST behave exactly as 18 — Reconciliation and
             Confluence and BEH-BR-319 specify.
```

```
REQUIREMENT: With `atomic: true`, `reconcile` MUST issue its forward actions
             in the order of BEH-BR-156 and MUST stop at the first forward
             action that does not complete — rejected at validation of that
             action, at configuration fingerprinting, by the `RefusalList`
             at step 4b (28 — Plugin Principal and Mandatory Policy,
             BEH-BR-267; reported in `failed` with `OperationRejected`, its
             `reason` "refused-digest: <reason>") or by the gate, or
             failing after step 6 of BEH-BR-188 (BEH-BR-157). It MUST then
             issue no further forward action and MUST undo, as BEH-BR-323
             specifies, every action of the call that completed, including
             the completed actions of the entry that failed.
```

```
REQUIREMENT: With `atomic: true`, a diff that holds a validation-stage
             rejection (the plan's `rejected`, BEH-BR-318, `PolicyMismatch`
             and a `RefusalList` refusal included) MUST apply nothing. Found at step 4 of BEH-BR-188, the
             call MUST fail with `ApplyRolledBack` (`undone` empty) and MUST
             write no record; found only in the diff recomputed at the
             intent, the call MUST fail with `ApplyRolledBack`, MUST write a
             parent `failed` terminal record with it (`children: 0`) and MUST
             issue no entry action.
```

```
REQUIREMENT: What `atomic` covers MUST be the host's plugin set as far as
             the diff addresses it: for each (id, realm) the call acts on,
             whether it is registered, its definition, its override, its
             `disabled` flag, its reconcile ownership, its mandatory
             interceptions and its `allowChildren`. An activation outcome
             after a completed action — a build or activation that fails —
             MUST NOT count as a failure of the apply and MUST NOT start an
             undo; it remains plugin state, as BEH-BR-157 states.
```

```
REQUIREMENT: Core documentation MUST state that an atomic apply is not a
             transaction: other host operations interleave with it
             (BEH-BR-156); the plugin set passes through every intermediate
             state, which snapshots, events and the trail show; external
             effects — writes, messages, anything a build, a finalizer or a
             served call did — and in-memory state outside a handoff are not
             undone; and an undo can itself fail (BEH-BR-324).
```

A bundle switch on a terminal is approved as one change. Before this
option, `reconcile` applied what it could and reported the rest, so a gate
refusal on the fifth of eight entries left four new plugins beside four old
ones — a set nobody approved, running until someone noticed. `atomic` makes
the outcome binary at the level of the plugin set: either every entry
completed, or the call issues, under the same call, the ordinary operations
that put back what it changed.

**Settled here.** (1) "Atomic" is scoped to registrations, the one thing the
host owns. A plugin that sent a message during its build has sent it; the
host cannot take it back and does not pretend to
([19 — Contribution Registry](./19-contribution-registry.md), BEH-BR-161).
(2) Activation failures do not trigger the undo. `reconcile` does not wait for
activations (BEH-BR-156), and an undo that depended on build timing would
make the outcome of one list on one state vary from run to run. (3) Validation
rejections are known before any action, so an atomic apply refuses them up
front instead of applying entries only to undo them. A `RefusalList`
answer is one of them: the list is synchronous and pure, so the diff can
ask it before any action, and a bundle that still lists a revoked digest is
refused whole instead of applied and rolled back (CCR-BR-029, agent review
R1-07). A digest listed after that check is refused at step 4b of its
action, which stops the apply like any refused forward action (R1-12).

## BEH-BR-323: Undo runs in reverse and restores the previous registration

> **Invariant:** [INV-BR-048](../invariants.md#inv-br-048-an-atomic-apply-leaves-the-prior-plugin-set-or-reports-what-it-left), [INV-BR-013](../invariants.md#inv-br-013-configuration-values-are-never-observable)
> **See:** [ADR-BR-051](../decisions/051-atomic-bundle-apply.md), [ADR-BR-004](../decisions/004-replace-is-stop-then-start.md), [ADR-BR-049](../decisions/049-state-handoff-on-replace.md)
> **Satisfies:** [URS-BR-051](../urs.md#urs-br-051-apply-a-reviewed-plugin-set-change-as-a-whole-or-not-at-all)
> **Risk:** [RSK-BR-059](../gxp/03-risk-assessment.md#rsk-br-059), [RSK-BR-008](../gxp/03-risk-assessment.md#rsk-br-008)

```ts
// illustrative — not type-checked: the undo action of each completed action
//   install       → remove        (drain: pruneDrain, force: pruneForce)
//   replace       → replace       with the previous definition (handoff applies, 34), then, when the
//                                 entry's previous override is not none, reconfigure with it
//                                 (replace drops the override, 11 — Configuration, BEH-BR-099)
//   reconfigure   → reconfigure   with the entry's previous override, or with none when there was none
//   disable       → enable
//   enable        → disable
//   remove        → install       the previous definition, with its previous override, `disabled`
//                                 flag, realm, mandatory interceptions, `allowChildren` and the
//                                 scope's ownership (a prune removal; a cold start)
```

```
REQUIREMENT: The undo MUST issue one undo step per completed action of
             the call, in the reverse of the order in which those actions
             completed, each completing or failing before the next is issued.
             An undo step MUST be one undo action, except for the undo of a
             `replace` when the entry's previous override is not none: that
             step MUST be two undo actions, `replace` with the previous
             definition and then `reconfigure` with the entry's previous
             override, the second issued only when the first completed.
             Each undo action of a step MUST be checked, gated, recorded and
             reported as any undo action (BEH-BR-325); `PlannedEntry.undo`
             MUST list both.
```

```
REQUIREMENT: When the first action of a two-action undo step completes and
             the second is not issued (its `ChangedSinceApply` check
             failed) or does not complete (refused or failed), the step
             MUST be reported once, in `PartialApply.notUndone`, with
             `action` the forward action (`replace`) and the reason of the
             second action (`ChangedSinceApply` when its check failed), and
             MUST NOT be listed in `undone`. When the first action does not
             complete, the second MUST NOT be issued and the step is
             reported once in `notUndone` with the first action's reason.
             Documentation MUST say that after the first case the previous
             definition is registered without its previous override
             (CCR-BR-030, host-core prototype finding G-P24).
```

```
REQUIREMENT: The *entry's previous override* of a plugin MUST be its
             override before the first action of its entry in this call,
             not before the individual action being undone; the same holds
             for the previous definition, `disabled` flag and ownership.
             For an entry `[replace, reconfigure]` the undo is therefore
             `reconfigure` with the entry's previous override, then
             `replace` with the previous definition, then, when that
             override is not none, `reconfigure` with it again, which
             leaves the override the plugin had before the entry
             (CCR-BR-029).
```

```
REQUIREMENT: For the duration of an atomic call, the host MUST keep, for
             each plugin an action of the call changed, what its undo needs:
             the previous definition object, the previous override, the
             `disabled` flag, the realm, the catalog ids and `allowChildren`,
             and the ownership. It MUST keep them in memory only, MUST NOT
             expose them — the override is a configuration value
             (INV-BR-013) — and MUST drop them when the call ends. It MUST
             NOT keep a plugin's exported handoff state for the undo
             (34 — State Handoff, BEH-BR-352).
```

```
REQUIREMENT: Before issuing an undo action, the host MUST check that the
             plugin is still as this call last left it: its `registeredAt`
             (BEH-BR-318) equals the revision produced by this call's most
             recent completed action on that plugin, forward or undo — the
             forward action being undone when no undo action of this call
             has yet completed on the plugin, otherwise the latest completed
             undo action on it — or, to undo a removal, the (id, realm) is
             not registered. When the check fails — another call changed the
             plugin in between — the undo action MUST NOT be issued, and the
             action MUST be reported as not undone with the reason tag
             `ChangedSinceApply`. An undo action that was refused or failed
             produced no revision, so the next check on that plugin compares
             with the revision before it (CCR-BR-029).
```

```
REQUIREMENT: An undo action MUST be the same operation, with the same
             legality, joins, supersession, conflicts, leases and drain, as
             the corresponding direct Host call (18 — Reconciliation and
             Confluence, BEH-BR-156). The undo of a `replace` of an active
             plugin MUST attempt the handoff of 34 — State Handoff from the
             activation being undone to the previous definition, as any
             `replace` does (BEH-BR-346).
```

```
REQUIREMENT: An undo action that is refused or fails — at validation
             (`DuplicatePlugin`, `IncompatibleContract`, …), by the gate, or
             operationally (`Conflict`, `Superseded`, `DrainTimeout`,
             `CleanupError`, `WouldDeadlock`) — MUST be reported as not undone
             with its error's tag and MUST NOT stop the remaining undo
             actions, except as BEH-BR-326 states for audit unavailability
             and shutdown. Core MUST NOT retry an undo action.
```

The undo is made only of operations a person could have issued by hand, in
the order that reverses the forward ones: a provider installed first is
removed last, after the dependents that came with it. Nothing about it is
special to the host: it is checked, gated, drained and recorded like any
call. That is why [ADR-BR-004](../decisions/004-replace-is-stop-then-start.md)
still holds — no `replace` is rolled back by the host in place; the apply as a
whole issues the opposite operations, each a new stop-then-start.

**Settled here.** (1) The undo of a removal is a reinstall, and so a cold
start: the removed activation's in-memory state is gone, and what its
finalizers did stays done. (2) An undo never overwrites a change someone else
made after the forward action. The `registeredAt` check is the expected
version of [BEH-BR-316](#beh-br-316-drafts-carry-expected-versions-and-a-stale-draft-is-re-planned)
applied to the undo: a plugin another operator replaced in the meantime is
reported, not reverted. (3) The undo goes on after a failed undo action, so
that as much as possible is put back and the report lists exactly what was
not. Undo actions that depend on a failed one may fail in turn (an
`IncompatibleContract` on a provider not restored), and are listed with their
own reason. (4) The expected revision moves with the undo: an entry
`[replace, reconfigure, enable]` is undone by `disable`, `reconfigure` and
`replace`, each changing `registeredAt`, so each check compares with the
revision the previous undo action on that plugin produced; comparing every
check with the forward revision would report `ChangedSinceApply` for every
multi-action entry (CCR-BR-029, agent review R1-02). (5) "Previous" is read
per entry, and the undo of a `replace` restores the override that `replace`
dropped; without it an undone `replace` would report `ApplyRolledBack` with
the override lost (R1-01). (6) An undo cannot restore the reason
"refused-digest" (28, BEH-BR-267). The diff never issues `enable` for a
registration so disabled (18, BEH-BR-154), but it can `disable` or `replace`
one: the undo `enable` or `replace` is submitted to the `RefusalList` at
step 4b like any call and, while the digest is still listed, is refused
(`OperationRejected`, "refused-digest: …") and reported as not undone, which
leaves the plugin `disabled` by the operator's flag or with the incoming
definition (R1-12).

## BEH-BR-324: An atomic apply ends applied, rolled back, or partial

> **Invariant:** [INV-BR-048](../invariants.md#inv-br-048-an-atomic-apply-leaves-the-prior-plugin-set-or-reports-what-it-left)
> **See:** [ADR-BR-051](../decisions/051-atomic-bundle-apply.md), [ADR-BR-008](../decisions/008-error-taxonomy.md), [ADR-BR-005](../decisions/005-failure-is-sticky.md)
> **Satisfies:** [URS-BR-051](../urs.md#urs-br-051-apply-a-reviewed-plugin-set-change-as-a-whole-or-not-at-all), [URS-BR-004](../urs.md#urs-br-004-know-why-a-plugin-is-not-running)
> **Risk:** [RSK-BR-059](../gxp/03-risk-assessment.md#rsk-br-059)

```ts
// illustrative — not type-checked
const ActionTag = Schema.Literal("install", "replace", "reconfigure", "disable", "enable", "remove")
const Reason = Schema.Struct({ _tag: Schema.String, message: Schema.String })   // core-written; never a cause
const Step = Schema.Struct({ id: Schema.String, realm: Schema.String, action: ActionTag })

class ApplyRolledBack extends Schema.TaggedError<ApplyRolledBack>()("ApplyRolledBack", {
  failed: Schema.Array(Schema.Struct({ ...Step.fields, reason: Reason })),   // what stopped the apply
  undone: Schema.Array(Step)                                                 // in the order undone
}) {}

class PartialApply extends Schema.TaggedError<PartialApply>()("PartialApply", {
  failed: Schema.Array(Schema.Struct({ ...Step.fields, reason: Reason })),
  undone: Schema.Array(Step),
  notUndone: Schema.Array(Schema.Struct({ ...Step.fields, reason: Reason }))   // left applied, with why
}) {}
```

```
REQUIREMENT: With `atomic: true`, when every forward action completed,
             `reconcile` MUST return its `ReconcileReport` as without the
             option, with `rejected` empty. When a forward action did not
             complete and every undo action completed, the call MUST fail
             with `ApplyRolledBack`. When at least one completed action was
             not undone, the call MUST fail with `PartialApply`, listing every
             such action in `notUndone` with its reason.
```

```
REQUIREMENT: `failed` MUST hold the forward action that stopped the apply —
             or, for a validation-stage refusal (BEH-BR-322), every
             validation rejection of the diff, with `action` the first action
             the entry would have issued. Each `reason` MUST be the error's
             `_tag` with a message core writes from the tag and the
             identifiers involved, never the error object, a cause, a
             configuration value or a plugin's text, so that both errors are
             plain serialisable values (as BEH-BR-318).
```

```
REQUIREMENT: A `PartialApply` MUST be logged at error level naming the scope,
             the `correlationId` and every (id, realm) in `notUndone`, and
             MUST be published as a `reconcile-partial { scope, correlationId,
             notUndone }` host event carrying (id, realm, action) triples
             only.
```

```
REQUIREMENT: After `PartialApply` the host MUST NOT re-run the undo or retry
             any action. The plugins in `notUndone` MUST stay as the call
             left them, for an operator to resolve with ordinary calls
             (ADR-BR-005).
```

The three outcomes are the ones an operator has to tell apart, and each is
a value, not a log line: "applied", "nothing changed in the end", and "this
is what is still different". `PartialApply` is the honest name for the last;
the alternative — reporting success or rollback while a plugin quietly kept
its new definition — is the silent half-applied state the option exists to
prevent.

**Settled here.** `ApplyRolledBack` and `PartialApply` are errors of the
call, not fields of the report: a caller that asked for all-or-nothing and
did not get "all" must handle it, and Effect's error channel makes that a
compile-time obligation for a caller that matches tags exhaustively.

## BEH-BR-325: Attribution, gate and records of an atomic apply and its undo

> **Invariant:** [INV-BR-022](../invariants.md#inv-br-022-one-requested-and-one-terminal-record-per-mutating-call), [INV-BR-027](../invariants.md#inv-br-027-a-refused-or-unauditable-mutation-changes-nothing), [INV-BR-048](../invariants.md#inv-br-048-an-atomic-apply-leaves-the-prior-plugin-set-or-reports-what-it-left)
> **See:** [ADR-BR-051](../decisions/051-atomic-bundle-apply.md), [ADR-BR-032](../decisions/032-operation-gate.md), [ADR-BR-030](../decisions/030-audit-sink-port.md)
> **Satisfies:** [URS-BR-051](../urs.md#urs-br-051-apply-a-reviewed-plugin-set-change-as-a-whole-or-not-at-all), [URS-BR-021](../urs.md#urs-br-021-know-who-changed-the-plugin-set-when-and-why), [URS-BR-024](../urs.md#urs-br-024-require-approval-before-a-regulated-change)
> **Risk:** [RSK-BR-014](../gxp/03-risk-assessment.md#rsk-br-014), [RSK-BR-004](../gxp/03-risk-assessment.md#rsk-br-004), [RSK-BR-059](../gxp/03-risk-assessment.md#rsk-br-059)
> **Regulatory:** supports 21 CFR 11.10(e), 11.10(f), 11.10(g); EU GMP Annex 11 §9, §10; ALCOA+ Attributable, Complete

```
parent   requested  op=reconcile  corr=C                                  (no target)
 fwd 1   requested  op=install    corr=C  cause=<parent requested>
         completed  op=install    corr=C  cause=<parent requested>
 fwd 2   rejected   op=replace    corr=C  cause=<parent requested>        (gate refused)
 undo 1  requested  op=remove     corr=C  cause=<parent requested>  undoes=<fwd 1 requested>
         completed  op=remove     corr=C  cause=<parent requested>  undoes=<fwd 1 requested>
parent   failed     op=reconcile  corr=C  children=3  error=ApplyRolledBack
```

```
REQUIREMENT: Every undo action MUST be attributed to the `reconcile` call's
             context — the same actor, reason and `correlationId` as the
             forward actions (18 — Reconciliation and Confluence,
             BEH-BR-158) — and MUST carry the same `onBehalfOf` as they do
             (28 — Plugin Principal and Mandatory Policy, BEH-BR-259).
```

```
REQUIREMENT: Every undo action MUST run steps 4–8 of BEH-BR-188 on its own:
             validation, configuration fingerprints (for an undo
             `reconfigure` with a value, or an undo `install` with an
             override), the gate — consulted once for that undo action, with
             `OperationRequest.undo: true` (25 — Operation Gate) — its own
             `requested` record, the transition and its own terminal record,
             or a single `rejected` record when the gate refuses it. An
             atomic apply MUST NOT skip the gate for an undo action and MUST
             NOT consult it once for the undo as a whole.
```

```
REQUIREMENT: With a sink wired, the records of an undo action MUST carry
             `causationId` set to the `recordId` of the parent `requested`
             record (23 — Audit Sink and Record, BEH-BR-201) and `undoes` set
             to the `recordId` of the `requested` record of the action it
             undoes. The parent terminal record MUST be `completed` when the
             call returns a report and `failed` with `ApplyRolledBack` or
             `PartialApply` otherwise; its `children` MUST count every forward
             and undo action that reached the gate.
```

```
REQUIREMENT: An undo action not issued because of `ChangedSinceApply`
             (BEH-BR-323) MUST write no record; it MUST appear in
             `PartialApply.notUndone` only.
```

An undo is an operator change like any other — a plugin removed, a version
put back — so it carries the operator's name and reason, meets the gate and
leaves its pair of records. `undoes` lets a reviewer read the trail as a
story: these changes were made, this one was refused, and these were the
opposite operations that followed, each pointing at the change it reversed.

An approval gate that answers from a recorded approval needs to recognise
the undo actions. The atomic plan lists them per entry (`PlannedEntry.undo`,
BEH-BR-318), so an approver approves the way back with the way forward, and
the gate matches each undo request by its `correlationId`, target, operation
and `undo` flag. A gate that refuses or defers undo actions makes every
failed atomic apply end in `PartialApply`, and the documentation of the
option states this.

**Settled here.** (1) No new audit phase and no new operation: an undo is
recorded as the operation it is, with `undoes` as its only mark. The record
schema stays `schemaVersion: 1` on the pre-release ground BEH-BR-195 gives
(its Settled 4 and 5). (2) The gate is never bypassed for an undo, even
though the undo restores a state that was itself approved once: the gate is
the one place that authorises a host change now (BEH-BR-320), and a host that
let "undo" through ungated would give any caller who can make a forward
action fail an ungated way to reinstall a definition.

## BEH-BR-326: Atomic apply with leases, drain, PlanStale, the legality table, the latch, interruption and shutdown

> **Invariant:** [INV-BR-029](../invariants.md#inv-br-029-the-audit-degraded-latch-blocks-operator-mutations), [INV-BR-017](../invariants.md#inv-br-017-every-drain-is-bounded-unless-declared-forever), [INV-BR-048](../invariants.md#inv-br-048-an-atomic-apply-leaves-the-prior-plugin-set-or-reports-what-it-left)
> **See:** [ADR-BR-051](../decisions/051-atomic-bundle-apply.md), [ADR-BR-013](../decisions/013-total-operation-legality.md), [ADR-BR-015](../decisions/015-leases-one-primitive.md)
> **Satisfies:** [URS-BR-051](../urs.md#urs-br-051-apply-a-reviewed-plugin-set-change-as-a-whole-or-not-at-all)
> **Risk:** [RSK-BR-059](../gxp/03-risk-assessment.md#rsk-br-059), [RSK-BR-015](../gxp/03-risk-assessment.md#rsk-br-015), [RSK-BR-019](../gxp/03-risk-assessment.md#rsk-br-019)

```
REQUIREMENT: An atomic apply MUST add no operation, plugin state or cell to
             the legality table of 08 — Operation Legality. Each forward and
             undo action MUST meet the linearization point of its plugin and
             the cell for that plugin's state, as the direct call does.
```

```
REQUIREMENT: Forward and undo removals MUST use `pruneDrain` and
             `pruneForce` (18 — Reconciliation and Confluence, BEH-BR-155),
             whatever `prune` is: with `atomic: true` and `prune: false` the
             undo of an `install` still removes with them, and `plan` and
             `expect` compare them whenever `atomic` is true (CCR-BR-029), as
             they do when `prune` is true, and only then (BEH-BR-319);
             every other stopping action MUST drain leases as the direct call
             does. A forward action that fails with `DrainTimeout` leaves its
             stop parked with its intent (06 — Removal, BEH-BR-045); the undo
             MUST still run for the completed actions, and the outcome MUST
             be `PartialApply` listing the parked action in `notUndone` with
             reason `DrainTimeout`, because its intent can still be resumed
             by a later call (08 — Operation Legality, BEH-BR-080). An undo
             action that fails with `DrainTimeout` MUST be reported in the
             same way.
```

```
REQUIREMENT: `PlanStale` MUST be decided before any action, as BEH-BR-319
             states; a stale atomic plan MUST apply nothing and MUST need no
             undo. Undo actions MUST NOT be compared with the plan's entries;
             they are derived from the forward actions that completed.
```

```
REQUIREMENT: When an entry action's `requested` record cannot be written,
             or the audit-degraded latch becomes set during an atomic apply,
             the host MUST issue no further forward action and no undo
             action — an undo is an operator mutation the latch blocks
             (INV-BR-029), and its records could not be written — and the
             call MUST fail with `PartialApply`, listing every completed
             action in `notUndone` with reason `AuditUnavailable`.
```

```
REQUIREMENT: An interruption of the caller after the intent MUST end only
             the caller's wait, as 18 — Reconciliation and Confluence,
             BEH-BR-156 states: the remaining forward actions, the undo and
             the parent terminal record MUST still be issued and written.
```

```
REQUIREMENT: When host shutdown begins during an atomic apply, the host
             MUST issue no further forward or undo action, and the call MUST
             fail with `PartialApply`, listing every completed action not yet
             undone in `notUndone` with reason `HostClosed`.
```

```
REQUIREMENT: The serialization of `reconcile` calls (BEH-BR-156) MUST cover
             the undo: the next `reconcile`'s intent MUST NOT be recorded
             before the undo of an atomic apply has ended.
```

Leases are the reason an atomic apply cannot promise more than it does: a
consumer holding a lease on a freshly installed provider keeps it alive
until the drain bound, and a removal that cannot drain is a removal that has
not happened. Rather than invent a forced path for undo, the apply uses the
drain options the caller already chose for removals, and reports what did
not drain. The latch and shutdown cases follow the same rule: when the host
cannot record or can no longer act, it stops and says exactly where.

**Settled here.** (1) A parked forward action makes the apply partial even
when every completed action was undone, because a parked intent is a change
that a later, unrelated call can still complete. (2) Shutdown does not try to
finish the undo: every plugin is about to be stopped, and on the next start the
application's own list decides what runs.

---

## Acceptance checks

These checks extend BEH-BR-184 (21 — Testing Host); their scenarios are
allocated in [traceability.md](../traceability.md) §5. Each will be a tagged
scenario once code exists; none has run.

| Scenario | Check | Behaviours |
| --- | --- | --- |
| REQ-BR-081 | `Gate.run` calls `decide` once with only "gate"-flow annotations, maps defects, timeouts and malformed drafts to `Refuse`, returns the draft and its `draftId` unchanged, and ends without a decision on caller interruption; `Gate.all` consults in order, the first refusal wins, a deferral yields to a later refusal; `Draft.check` reports every mismatch and nothing else | BEH-BR-313, BEH-BR-314, BEH-BR-316, BEH-BR-321 |
| REQ-BR-082 | `OperationGate.fromGate`: `Defer` reaches the host as `OperationRejected` with the defer reason and one `rejected` record; with and without the adapter, every host scenario of 25 — Operation Gate produces identical records | BEH-BR-315 |
| REQ-BR-083 | `Host.plan` equals the diff `reconcile` then applies, including the decoded `configChange.paths` of a `reconfigure` entry, writes no record, consults no gate or fingerprinter, emits no event and carries no value; `reconcile` with `expect` fails `PlanStale` with no record when stale at the call, with a parent `failed` record when stale at the intent, with host-level mismatches carrying no `id` or `realm`, compares `pruneDrain` and `pruneForce` only when `prune` or `atomic` is true, and otherwise gates every entry | BEH-BR-317, BEH-BR-318, BEH-BR-319, BEH-BR-320 |
| REQ-BR-099 | With `atomic: true`: actions in dependency order; the first refused or failed forward action stops the apply; completed actions are undone in reverse with the opposite operations, each attributed to the call, gated with `undo: true` and recorded with `undoes`; the call fails `ApplyRolledBack`; a validation-stage rejection applies nothing; an activation failure starts no undo; the plan lists `undo` and `atomic`, and `expect` compares `atomic`; a multi-action entry is undone in full, each check against the revision the previous undo action produced; an undone `replace` gets its previous override back, and a two-action undo step whose `reconfigure` fails or is skipped is one `notUndone` entry with `action` `replace` and is not in `undone`; undo removals use `pruneDrain`/`pruneForce` whatever `prune` is; a refused digest in the diff applies nothing and one refused at step 4b stops the apply | BEH-BR-317, BEH-BR-318, BEH-BR-319, BEH-BR-322, BEH-BR-323, BEH-BR-324, BEH-BR-325, BEH-BR-326 |
| REQ-BR-100 | An undo refused by the gate, failing, or skipped by `ChangedSinceApply` yields `PartialApply` with every action left applied and a `reconcile-partial` event; a parked forward `DrainTimeout`, a latch set mid-apply and shutdown each yield `PartialApply` with no further action; caller interruption after the intent still completes the undo and the parent record; an undo `replace` hands off state as any replace; the next reconcile waits for the undo | BEH-BR-323, BEH-BR-324, BEH-BR-326, BEH-BR-353 |

---

_Previous: [31 — Hook Points](./31-hook-points.md)_ · _Next: [33 — Realm Families](./33-realm-families.md)_
