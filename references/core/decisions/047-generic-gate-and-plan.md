# ADR-BR-047: A generic gate with a deferred outcome, and a read-only plan of reconcile

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ADR-047                                              |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.1 (2026-11-08): Initial draft (CCR-BR-019)                 |

---

## Context

`OperationGate` ([ADR-BR-032](./032-operation-gate.md)) authorises host lifecycle operations with a yes or a no. Applications need the same seam for their own requests, and they need a third answer: "not yet — hold this until it is approved". Systems that change their own plugin set (an agent adding a tool, an update service applying a bundle) also need to show what a change would do before doing it, and to apply exactly what was shown or nothing. Today a caller can only run `reconcile` and read the report afterwards.

An approval given against one state of the host may be wrong against another. Nothing currently lets a caller say "apply this only if the host is still as it was when I planned it".

## Decision

- **`Gate<Req>`** with `decide(req) → Allow | Refuse { reason } | Defer { draft }`, and `Gate.run` that consults once, passes only the caller's "gate"-flow annotations ([30 — Operation context annotations](../behaviors/30-operation-context-annotations.md)) and fails closed (a defect, a timeout or a malformed draft is `Refuse`). Core ships no gate implementation.
- **Composition.** `Gate.all(pieces)` consults pieces in order: all must allow, the first refusal wins, and a deferral yields to a later refusal. Pieces that are controls without an approval step (signature, revocation, entitlement) never defer.
- **`OperationGate` is the `Gate<OperationRequest>` instance.** The host's port, its position in the call order, its timeout, failure rules and records are unchanged. `OperationGate.fromGate(gate)` maps `Defer` to `OperationRejected` with a reason from the adapter (default `"deferred"`), so a deferred host operation leaves exactly one `rejected` record and is applied later by issuing it again, gated again.
- **Drafts** carry `draftId`, one or more requests and `expected` versions (opaque key/version strings). `Draft.check` reports every mismatch. A stale draft is re-planned and approved again, never applied. `draftId` is returned to the caller unchanged, so a dispatcher can hand it back (for example as a command's deferred result) and the approved request can be re-submitted with a reference to it. Core stores no draft and defines no approval reference.
- **`Host.plan(desired, options)`** is a read-only dry run of `reconcile`. It runs the same diff computation at one revision and returns a serialisable `ReconcilePlan`: entries with actions in execution order, the expected registration of each plugin (`registeredAt`), incoming `version`/`digest`, configuration paths only, the dependents each action would stop, and the `consentDiff` of installed and incoming manifests when both exist ([27 — Manifest and lazy activation](../behaviors/27-manifest-and-lazy-activation.md)). It records nothing, consults no gate or fingerprinter, emits nothing and reserves nothing.
- **`reconcile(desired, { expect: plan })`** applies a plan or nothing. The diff is compared with the plan at validation (stale: `PlanStale`, no record) and again at the intent (stale: `PlanStale` with the parent `failed` record, no entry action). Every entry action is still gated and recorded individually.

## Alternatives considered

- **`reconcile(desired, { plan: true })`, as the review wrote it.** Rejected: a flag that makes the one mutating batch operation read-only splits it across the attributed/gated/audited partition of BEH-BR-186. A dropped flag would apply what was meant to be shown. A separate method shares the diff code without that hazard.
- **Hold a deferred host operation open until approval.** Rejected: BEH-BR-221 already places approval before the call; a parked lifecycle operation would hold its plugin's linearization point for as long as a person takes.
- **A new audit phase `deferred`.** Rejected: the `rejected` record already states that the request reached the gate and did not proceed, and adding a phase would change the record schema for no new information.
- **Apply the still-fresh part of a stale plan.** Rejected: the approver approved a set; a subset is a different change nobody approved.
- **Expected versions as the whole host revision.** Rejected: any unrelated change would make every plan stale on a busy host. `registeredAt` per plugin tracks exactly what the diff depends on.
- **Treat an approved plan as authorisation and skip the gate.** Rejected: the gate stays the one place that authorises, so a wrong approval store still meets it.

## Consequences

**Positive**:

- One vocabulary and one set of fail-closed rules for every gate in an application, with the host's gate unchanged.
- Self-modifying systems can propose, have reviewed, and apply exactly the reviewed change.

**Negative**:

- The host must track `registeredAt` per installed plugin.
- `reconcile`'s call-level error union gains `PlanStale`.
- A deferred host operation appears in the trail as a `rejected` record; the draft itself is found only in the consumer's store.

**Trade-off accepted**: a second read-only method and one more call-level error, in exchange for dry runs and stale-plan protection that cannot be confused with applying.

## References

- Behaviours: [32 — Generic gate and plan](../behaviors/32-generic-gate-and-plan.md), [25 — Operation gate](../behaviors/25-operation-gate.md), [18 — Reconciliation and confluence](../behaviors/18-reconciliation-and-confluence.md), [22 — Attributable operations](../behaviors/22-attributable-operations.md)
- Invariants: [INV-BR-043](../invariants.md#inv-br-043-a-plan-changes-nothing-and-a-stale-plan-applies-nothing), [INV-BR-026](../invariants.md#inv-br-026-an-unwired-sink-or-gate-changes-nothing), [INV-BR-027](../invariants.md#inv-br-027-a-refused-or-unauditable-mutation-changes-nothing)
- Requirements: [URS-BR-037](../urs.md#urs-br-037-review-a-proposed-plugin-set-change-before-it-is-applied), [URS-BR-024](../urs.md#urs-br-024-require-approval-before-a-regulated-change)
- Risks: [RSK-BR-033](../gxp/03-risk-assessment.md#rsk-br-033), [RSK-BR-014](../gxp/03-risk-assessment.md#rsk-br-014)
- Decisions: [ADR-BR-023](./023-desired-state-reconcile.md), [ADR-BR-032](./032-operation-gate.md), [ADR-BR-033](./033-no-config-values-in-audit.md)
- Source: architecture review of 2026-11-08 (gap analysis), §5 item 7. No SPEC.md section.
