# ADR-BR-051: Atomic bundle apply by ordered actions and reverse undo

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ADR-051                                              |
> | Revision       | 0.3                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed — amends ADR-BR-023 and ADR-BR-030                  |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.3 (2026-11-10): Outcomes and limits: a latch or shutdown before any forward action completed, with nothing parked, ends as `ApplyRolledBack`, as BEH-BR-324 and BEH-BR-326 state (C15) (CCR-BR-035)<br>0.2 (2026-11-10): Status names the ADRs this one amends (ADR-BR-023 and ADR-BR-030), pairing their "amended by" (C22) (CCR-BR-034)<br>0.1 (2026-11-08): Initial draft (CCR-BR-025)                 |

---

## Context

`reconcile` with `expect` ([ADR-BR-047](./047-generic-gate-and-plan.md)) applies a reviewed plan "or nothing", but only at the level of the diff: once the plan is found fresh, the entries run one by one and each failure stays in that entry ([ADR-BR-023](./023-desired-state-reconcile.md)). A gate refusal on the fifth of eight entries leaves the host with a set nobody approved. The entries also ran in list order, so a list that upgrades a provider and installs a dependent needing the upgrade was refused with `IncompatibleContract` unless the author sorted it by hand (URS gap G36). A consumer that switches a terminal's whole plugin bundle at a safe point, after closing, needs the switch to land as approved or not at all.

Two constraints frame the answer. `replace` is stop-then-start with no rollback ([ADR-BR-004](./004-replace-is-stop-then-start.md)), and two providers of one key never coexist ([ADR-BR-003](./003-one-provider-per-key-per-realm.md)). Every change must stay attributed, gated and recorded ([ADR-BR-029](./029-attributable-mutations.md), [ADR-BR-032](./032-operation-gate.md)).

## Decision

- **Order by declarations, always.** `reconcile` acts in two phases: removals (prune removals and entries that begin with `disable`) with dependents first, then every other change with providers first, read from `requires` declarations and manifests. List order is only the tie-break. This applies with or without the new option, and `Host.plan` shows the same order ([18 — Reconciliation and confluence](../behaviors/18-reconciliation-and-confluence.md), BEH-BR-156). It closes G36.
- **`atomic: true`.** The first forward action that does not complete stops the apply. Every completed action is then undone in reverse completion order, by the opposite ordinary operation: `remove` for `install`; `replace` with the previous definition for `replace`, with the state handoff of [ADR-BR-049](./049-state-handoff-on-replace.md); the previous override for `reconfigure`; `enable`/`disable` swapped; and a cold reinstall of the previous registration for a prune removal ([32 — Generic gate and plan](../behaviors/32-generic-gate-and-plan.md), BEH-BR-322–326).
- **Outcomes.** The call returns its report when every action completed, fails with `ApplyRolledBack` when every undo action completed — also when nothing had completed and nothing is parked, so nothing needed undoing — and fails with `PartialApply` naming each action left applied, with its reason, otherwise. Core never retries an undo.
- **Scope of "atomic".** The host's plugin set as the diff addresses it: whether each plugin is registered, its definition, override, `disabled` flag, ownership, mandatory interceptions and `allowChildren`. It does not cover activation outcomes, external effects, or in-memory state outside a handoff. Other operations interleave, and intermediate states are visible.
- **Undo is an ordinary change.** Each undo action is attributed to the call's context, gated on its own (the request marked `undo: true`), and recorded with its own records, linked by `undoes` to the action it reverses. The plan lists the undo actions per entry so that an approval covers them. An undo action is skipped and reported (`ChangedSinceApply`) when another call changed the plugin after the forward action.
- **Limits stated.** A parked `DrainTimeout` ends the apply as `PartialApply`. A latch set mid-apply and shutdown end it with no further action: as `PartialApply` once a forward action has completed, and as `ApplyRolledBack` with nothing undone when none had and nothing is parked (BEH-BR-324, BEH-BR-326). A provider *narrowed* under a listed dependent's current definition still needs two runs.

## Alternatives considered

- **A staging realm with a switch.** Build the whole new set in a staging realm, check it there, then switch resolution from the live realm to the staged one in one step. Rejected. Realms are resolution namespaces, not deployment slots ([ADR-BR-019](./019-realms-are-resolution-namespaces.md)). Building the new set beside the old one runs two versions' builds and side effects at once, which ADR-BR-004 refuses. A single-step switch of every consumer's captures would need a host-wide linearization point that core does not have. Ownership, leases and the audit model would all have to learn a "staged" registration. It would also cover external effects no better than the undo does.
- **Checking the final set as a whole before acting.** Rejected for the same reason: every check of core (provider slots, contract compatibility, cycles) is defined against registered definitions at an action's linearization point, so a whole-set check would be a second checker that can disagree with the first.
- **Ungated undo.** Rejected: the gate is the one place that authorises a host change, and an ungated undo would give anyone who can make a forward action fail an ungated way to reinstall a definition.
- **Undo on activation failure too.** Rejected: `reconcile` does not wait for activations, so the outcome would depend on build timing.
- **Keep list order and document it.** Rejected: the outcome would keep depending on how the author sorted the list.
- **Report rollback as a field of the report.** Rejected: a caller who asked for all-or-nothing and did not get "all" must handle that, and the error channel makes it an obligation.

## Consequences

**Positive**:

- A reviewed bundle lands as approved, is undone, or is reported exactly as left, and each of the three is a value.
- Lists no longer have to be sorted by hand. The order is visible in the plan.
- Every undo is in the trail as an attributed, gated operation pointing at what it reversed.

**Negative**:

- `ReconcilePlan` gains `atomic`, `undo` and `policy`. `AuditRecord` gains `undoes` and `OperationRequest` gains `undo` (pre-release, `schemaVersion` stays 1).
- An atomic call holds previous definitions and overrides in memory until it ends.
- A gate that refuses undo actions turns every failed atomic apply into `PartialApply`.
- The order change alters the sequence of a non-atomic `reconcile` for lists that were not already in dependency order.

**Trade-off accepted**: an undo that can itself fail, and says so, in exchange for keeping stop-then-start, one provider per key and per-action gating unchanged.

## References

- Behaviours: [18 — Reconciliation and confluence](../behaviors/18-reconciliation-and-confluence.md), [32 — Generic gate and plan](../behaviors/32-generic-gate-and-plan.md), [34 — State handoff](../behaviors/34-state-handoff.md), [26 — Versioned contracts](../behaviors/26-versioned-contracts.md)
- Invariants: [INV-BR-048](../invariants.md#inv-br-048-an-atomic-apply-leaves-the-prior-plugin-set-or-reports-what-it-left), [INV-BR-021](../invariants.md#inv-br-021-reconcile-is-idempotent), [INV-BR-029](../invariants.md#inv-br-029-the-audit-degraded-latch-blocks-operator-mutations)
- Requirements: [URS-BR-051](../urs.md#urs-br-051-apply-a-reviewed-plugin-set-change-as-a-whole-or-not-at-all), [URS-BR-016](../urs.md#urs-br-016-drive-the-plugin-set-from-a-declarative-list), [URS-BR-037](../urs.md#urs-br-037-review-a-proposed-plugin-set-change-before-it-is-applied)
- Risks: [RSK-BR-059](../gxp/03-risk-assessment.md#rsk-br-059), [RSK-BR-033](../gxp/03-risk-assessment.md#rsk-br-033), [RSK-BR-014](../gxp/03-risk-assessment.md#rsk-br-014)
- Decisions: [ADR-BR-003](./003-one-provider-per-key-per-realm.md), [ADR-BR-004](./004-replace-is-stop-then-start.md), [ADR-BR-019](./019-realms-are-resolution-namespaces.md), [ADR-BR-023](./023-desired-state-reconcile.md), [ADR-BR-047](./047-generic-gate-and-plan.md), [ADR-BR-049](./049-state-handoff-on-replace.md)
- Source: Bridger recheck of 2026-11-08, §4 item K2 and §8 item X2; URS gap G36. No SPEC.md section.
