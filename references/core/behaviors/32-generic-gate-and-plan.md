# 32 — Generic Gate and Plan

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-BEH-32                                               |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.2 (2026-11-08): `plan` may decode `reconfigure` values to compute paths (never exposed); `configChange.paths` and the prune options are part of the `expect` comparison; plan `rejected` reasons are `{ _tag, message }`; `Gate.all` pieces take a timeout (CCR-BR-022)<br>0.1 (2026-11-08): Initial draft (CCR-BR-019) |

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
BEH-BR-313–328 and uses BEH-BR-313–321; numbers 322–328 of the block are reserved.

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
             build, stop or reserve anything. It MAY decode a `reconfigure`
             entry's value with the loaded definition's schema to compute
             `configChange.paths` as `reconcile` will record them
             (BEH-BR-197; for a registration not yet loaded, the top-level
             keys of the raw value, 27 — Manifest and Lazy Activation,
             BEH-BR-247); the decoded value MUST NOT leave the call. A value
             that does not decode MUST make the entry a validation
             rejection (`ConfigInvalid`), as it would in `reconcile`. It MUST NOT take an
             `OperationContext` and MUST NOT be attributed (BEH-BR-186).
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
                                                     // the prune options the plan was computed with (18, BEH-BR-155)
  readonly entries: readonly PlannedEntry[]          // in the order reconcile would act on them
  readonly unchanged: readonly { readonly id: string; readonly realm: string }[]
  readonly rejected: readonly {
    readonly id: string; readonly realm: string
    readonly reason: { readonly _tag: "InstallError" | "InvalidDefinition" | "DuplicatePlugin" | "UnknownRealm" | "ConfigInvalid"
                       readonly message: string }   // core-written; never a value, never a cause
  }[]                                                 // validation-stage rejections only
  readonly reasonRequiredFor: readonly Operation[]   // operations of the diff listed in requireReason
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
}
```

```
REQUIREMENT: For each installed plugin the host MUST track `registeredAt`:
             the `HostSnapshot.revision` in which its definition, override,
             `disabled` flag or reconcile ownership last changed. The plan's
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
             the error object.
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
only, as plain data with the realm; the report also lists entries that
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
}

class PlanStale extends Schema.TaggedError<PlanStale>()("PlanStale", {
  mismatches: Schema.Array(Schema.Struct({ id: Schema.String, realm: Schema.String, reason: Schema.String }))
}) {}

// reconcile's call-level error union gains PlanStale:
//   Unattributed | ReasonRequired | AuditUnavailable | HostClosed | PlanStale
```

```
REQUIREMENT: With `expect`, `reconcile` MUST compare, at step 4 of BEH-BR-188
             (validation, once for the call), the diff it would compute with
             `expect`: same `hostId` and `scope`, the same prune options
             (`prune`, `pruneDrain`, `pruneForce`), the same entries with
             the same actions in the same order, each entry's
             `configChange.paths` equal, the same `unchanged` and
             validation `rejected` sets, and each entry's `expected` equal
             to the plugin's current registration. On any difference it MUST
             fail with `PlanStale` listing every mismatch, MUST change
             nothing and MUST write no record.
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

---

## Acceptance checks

These checks extend BEH-BR-184 (21 — Testing Host); their scenarios are
allocated in [traceability.md](../traceability.md) §5. Each will be a tagged
scenario once code exists; none has run.

| Scenario | Check | Behaviours |
| --- | --- | --- |
| REQ-BR-081 | `Gate.run` calls `decide` once with only "gate"-flow annotations, maps defects, timeouts and malformed drafts to `Refuse`, returns the draft and its `draftId` unchanged, and ends without a decision on caller interruption; `Gate.all` consults in order, the first refusal wins, a deferral yields to a later refusal; `Draft.check` reports every mismatch and nothing else | BEH-BR-313, BEH-BR-314, BEH-BR-316, BEH-BR-321 |
| REQ-BR-082 | `OperationGate.fromGate`: `Defer` reaches the host as `OperationRejected` with the defer reason and one `rejected` record; with and without the adapter, every host scenario of 25 — Operation Gate produces identical records | BEH-BR-315 |
| REQ-BR-083 | `Host.plan` equals the diff `reconcile` then applies, writes no record, consults no gate or fingerprinter, emits no event and carries no value; `reconcile` with `expect` fails `PlanStale` with no record when stale at the call, with a parent `failed` record when stale at the intent, and otherwise gates every entry | BEH-BR-317, BEH-BR-318, BEH-BR-319, BEH-BR-320 |

---

_Previous: [31 — Hook Points](./31-hook-points.md)_ · _Next: [33 — Realm Families](./33-realm-families.md)_
