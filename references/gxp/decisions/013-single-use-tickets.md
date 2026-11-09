# ADR-GX-013: Bindings are single-use and consumed at authorize by compare-and-set

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-GX-ADR-013                                           |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-GX-03 §5)           |
> | Approved by    | — (pending; single maintainer, see PROC-GX-03 §5)            |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.1 (2026-10-03): Initial draft (CCR-GX-001)                 |

---

## Context

A signed binding approves one change. If it can be presented twice, one approval authorises two changes (replay); if two hosts or two concurrent calls can both pass the check before either records the use, both are allowed (RSK-GX-006). The gate sees the call before it happens and is told nothing afterwards: core gives `authorize` no callback for the outcome, and the terminal record goes to the sink, not the gate ([BEH-BR-198](../../core/behaviors/23-audit-sink-and-record.md), [BEH-BR-220](../../core/behaviors/25-operation-gate.md)).

## Decision

- **Lifecycle.** A ticket is `{ id, scope, requester, policyDigest, ruleId, bindings, notBefore, notAfter, state, signatures }`. Its state moves `issued → signed` (when the ticket holds the signatures its rule requires; a declined or failed capture leaves it `issued` for good) and then each binding is consumed once; the ticket is `consumed` when all its bindings are, `expired` after `notAfter`, or `revoked` by an explicit, attributed revoke. No state moves backwards.
- **Append-only event log.** `TicketStore` records the lifecycle as events (`issued`, `signed`, `consumed`, `revoked`, and the gate's `policy-activated` and `exempted`) with a per-ticket `version` and a store-wide `eventSeq`; state is derived from the log. The port has no update or delete of a past event.
- **Consumed at authorize, by compare-and-set.** After every other check passes, the gate calls `append({ ticketId, expectedVersion, at, event: { type: "consumed", bindingDigest, hostId, correlationId, policyDigest } })`. The store appends the event only if the ticket's current `version` equals `expectedVersion`; otherwise it fails with `TicketVersionConflict`, and the gate re-reads and re-evaluates, refusing when the binding is now consumed. The gate allows only once the event is stored; a failure or a timeout refuses ([INV-GX-002](../invariants.md#inv-gx-002-a-binding-is-consumed-at-most-once), [INV-GX-011](../invariants.md#inv-gx-011-every-port-failure-on-a-decision-path-refuses)). A read-then-write without the version check is a conformance failure of the ticket store.
- **A call that fails after the gate burns its binding.** If core goes on to fail the change (a build failure, an audit write failure, an interruption), the binding stays consumed and a new approval is needed. The reasons: the gate is not told the outcome, and inferring it later from the trail would make the gate depend on the sink; a failed call may already have had external effects that core does not undo ([ADR-BR-034](../../core/decisions/034-gxp-companion-scope.md), non-claim 11), so a retry is a second change that deserves its own approval; and an "un-consume" operation would be a path by which one approval authorises two attempts.
- **Burned bindings are visible.** `linkApprovals` reports every consumed binding whose call ended in a failed terminal record, or in a `rejected` record, with the status `"burned"` ([BEH-GX-087](../behaviors/11-signature-linking.md)), so the rate of re-approvals is measurable and not hidden in a workaround ([RSK-GX-007](../gxp/03-risk-assessment.md#rsk-gx-007)).

## Alternatives considered

- **Consume at the terminal record.** Rejected: between allow and record, a second call could pass the same check; and the gate cannot see the record.
- **Allow N uses per binding.** Rejected: an approval of one change would become an approval of a class of changes, which is what the policy, not a ticket, is for.
- **Re-arm a binding when the call fails.** Rejected for the reasons above; it also needs a trusted signal of failure that the gate does not have.

## Consequences

**Positive**:

- One signed binding allows at most one call, across hosts and concurrent calls, provided the ticket store implements compare-and-set as specified.
- The consumption event records which host and correlation used it, which completes the approval-to-record join ([ADR-GX-011](../decisions/011-ticket-cited-by-correlation-id.md)).

**Negative**:

- A transient failure after the gate costs a fresh approval and signature.
- Pressure to avoid that cost can push users towards exemptions ([RSK-GX-007](../gxp/03-risk-assessment.md#rsk-gx-007)); the burned list and the policy digest in records make that visible, not impossible.

**Trade-off accepted**: re-approval after a failed call, in exchange for a binding that can never authorise two attempts.

## References

- Behaviours: [09 — Approval tickets](../behaviors/09-approval-tickets.md), [12 — Approval gate](../behaviors/12-approval-gate.md)
- Invariants: [INV-GX-002](../invariants.md#inv-gx-002-a-binding-is-consumed-at-most-once), [INV-GX-011](../invariants.md#inv-gx-011-every-port-failure-on-a-decision-path-refuses)
- Risks: [RSK-GX-006](../gxp/03-risk-assessment.md#rsk-gx-006), [RSK-GX-007](../gxp/03-risk-assessment.md#rsk-gx-007), [RSK-GX-018](../gxp/03-risk-assessment.md#rsk-gx-018)
- Decisions: [ADR-GX-010](../decisions/010-sign-first-then-call.md), [ADR-GX-011](../decisions/011-ticket-cited-by-correlation-id.md), [ADR-GX-014](../decisions/014-deny-by-default-policy.md)
- Core: [ADR-BR-034](../../core/decisions/034-gxp-companion-scope.md), [BEH-BR-198](../../core/behaviors/23-audit-sink-and-record.md), [BEH-BR-220](../../core/behaviors/25-operation-gate.md)
