# ADR-GX-030: The sink stores and marks; a gate piece refuses operator changes

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-GX-ADR-030                                           |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-GX-03 §5)           |
> | Approved by    | — (pending; single maintainer, see PROC-GX-03 §5)            |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.1 (2026-11-09): Initial draft (F-02) (CCR-GX-002) |

---

## Context

Revision 0.1 of the companion's sink refused, with `AuditWriteFailed`, a record of an unsupported `schemaVersion` or with a field the schema did not define, a record it could not canonicalise, and an `append` the store answered with "conflict"; the risk assessment counted the resulting latch as the control. Core retries a failed record in place, with every later record waiting behind it, until the latch stops operator changes ([BEH-BR-202](../../core/behaviors/23-audit-sink-and-record.md), [BEH-BR-205](../../core/behaviors/23-audit-sink-and-record.md)). A record refused for a reason of the sink's own is refused on every retry, so the trail stops for the life of the host and later records, system transitions included, are dropped past the writer's queue. Core states the rule the companion broke: a sink should fail only when it did not store the record ([BEH-BR-193](../../core/behaviors/23-audit-sink-and-record.md)), and a sink that wants operator changes refused for a condition of its own should use a gate piece reading its status and keep accepting records (BEH-BR-202, Settled (0)). Since CCR-BR-018 core records may carry annotation values the companion's integer-only canonical form could not represent, so the defect would have been reached by ordinary use.

## Decision

- **Store and mark.** The sink stores every record it is handed. An unsupported schema is marked `schema: "unsupported"`; a record that is not I-JSON is stored with the escaped encoding and marked `canonical: "jcs-escaped"` — the same marks audit-chain puts in its link (BEH-AC-002, BEH-AC-003). The canonical domain is the whole of I-JSON ([BEH-GX-018](../behaviors/03-trail-sink.md)).
- **Keep collisions.** The store answers "stored-collision" and keeps a different entry under a stored `recordId` or `(hostId, auditSeq)` beside the primary, never over it; the "conflict" failure is withdrawn ([BEH-GX-012](../behaviors/02-trail-store-port.md)).
- **Fail only for the store.** The sink fails a write only when the store did not, or cannot be shown to, hold the record ([BEH-GX-019](../behaviors/03-trail-sink.md), [INV-GX-016](../invariants.md#inv-gx-016-the-sink-never-refuses-a-record-for-a-condition-of-its-own)).
- **Refuse changes at the gate.** The sink counts its conditions in `TrailSinkStatus`; `trailGate`, a core gate piece (BEH-BR-313), refuses operator changes while a count it is configured for is above zero, and `GxpLayer.make` composes it before audit-chain's `ChainGate` and the approval gate with `Gate.all` ([22 — Trail Status and Gate](../behaviors/22-trail-status-and-gate.md)).

## Alternatives considered

- **Keep refusing, and let the latch be the control.** Rejected: it trades a marked record for a stopped trail and dropped later records, the outcome core's rule exists to prevent.
- **Store and mark, with no gate.** Rejected: a marked entry would be found only by a later check on read, while changes continue; some deployments need changes stopped. The gate is configurable and "not-used" is an explicit, recorded consumer decision ([BEH-GX-179](../behaviors/22-trail-status-and-gate.md)).
- **Clear counts by an operator call.** Rejected: an in-host reset would be an acknowledgement without a record; counts clear when the sink is rebuilt, as audit-chain's chain breaks do.

## Consequences

**Positive**:

- No condition of the companion's own can stop recording; the trail keeps the record that caused the condition and the `rejected` records of the changes refused because of it.
- The companion's sink and audit-chain's sink follow one rule, so sealing adds no refusal of its own.

**Negative**:

- A marked entry is stored and must be reviewed: the checks report it, and the gate stops changes, but the trail now holds records the companion cannot interpret field by field.
- Refusal reasons in `rejected` records carry a piece-name prefix ("approval: …") once the gate is composed.

**Trade-off accepted**: a stored, marked and counted record and refused changes, in place of a refused record and a stopped trail.

## References

- Behaviours: [03 — Trail Sink](../behaviors/03-trail-sink.md), [02 — Trail Store Port](../behaviors/02-trail-store-port.md), [05 — Checks on Read](../behaviors/05-checks-on-read.md), [22 — Trail Status and Gate](../behaviors/22-trail-status-and-gate.md)
- Invariants: [INV-GX-006](../invariants.md#inv-gx-006-one-primary-entry-per-record-and-per-host-sequence-number-and-no-stored-record-is-displaced), [INV-GX-016](../invariants.md#inv-gx-016-the-sink-never-refuses-a-record-for-a-condition-of-its-own)
- Risks: [RSK-GX-019](../gxp/03-risk-assessment.md#rsk-gx-019), [RSK-GX-023](../gxp/03-risk-assessment.md#rsk-gx-023)
- Core: [BEH-BR-193](../../core/behaviors/23-audit-sink-and-record.md), [BEH-BR-202](../../core/behaviors/23-audit-sink-and-record.md), [BEH-BR-313](../../core/behaviors/32-generic-gate-and-plan.md), [BEH-BR-321](../../core/behaviors/32-generic-gate-and-plan.md), [ADR-BR-047](../../core/decisions/047-generic-gate-and-plan.md)
- Audit-chain: [BEH-AC-013 in 02 — Anchoring](../../audit-chain/behaviors/02-anchoring.md)
