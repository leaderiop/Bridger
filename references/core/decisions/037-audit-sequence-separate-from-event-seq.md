# ADR-BR-037: The audit sequence is separate from the event seq

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ADR-037                                              |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.2 (2026-10-03): Example corrected: an acknowledgement emits `audit-acknowledged` (consistency pass) (CCR-BR-013)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001)                 |

---

## Context

`Host.events` already carries a monotonic `seq` per host. It is a diagnostic counter: the events feed is a sliding `PubSub`, a slow subscriber loses the oldest events, and a gap in `seq` is how it learns it lost them. Most events (`build-started`, `plugin-stalled`, `listener-failed`) are never audit records, and many audit records (`requested`, `rejected`, `joined`) correspond to no event.

The audit trail needs a sequence with the opposite meaning. A reviewer, or `verifyAuditSequence`, must be able to treat any gap as a lost record. That only works if the sequence handed to the sink is contiguous by construction, so that every gap is a defect and none is expected. Timestamps cannot serve: clocks step under NTP, and two records can share a millisecond ([ADR-BR-025](../decisions/025-deterministic-time-and-ids.md)).

## Decision

- **Two counters.** `HostEvent.seq` stays a lossy diagnostic sequence. `AuditRecord.auditSeq` is a separate counter with its own rules; neither is derived from the other.
- **Contiguous and never reused.** `auditSeq` starts at 1 for each host and increases by one per record written.
- **Assigned at the write.** The number is assigned at the single serialisation point immediately before the sink write; records are written one at a time in `auditSeq` order ([ADR-BR-030](../decisions/030-audit-sink-port.md)).
- **A failed write does not consume its number.** The next attempt reuses it, so the sequence the sink accepts has no gaps of the core's making.
- **Order authority.** `auditSeq` is authoritative for order within a host; `timestamp` is informative. Records are identified across hosts by `hostId` plus `auditSeq`, and individually by `recordId`.
- **Verification, honestly named.** `verifyAuditSequence(records)` returns `{ gaps, duplicates, outOfOrder }`. It is pure and reports sequence anomalies only. It is not tamper evidence: anyone able to rewrite stored records can renumber them, and the function will report nothing.

## Alternatives considered

- **One sequence for events and audit.** Rejected. If events stay lossy, audit numbers inherit gaps from events that were never audited, so a real lost record is indistinguishable from an expected gap. If events become lossless to protect the audit sequence, a slow dashboard stalls the host.
- **Order by timestamp.** Rejected: wall clocks step backwards and collide within a millisecond; time-stamping is required, but not as the order key.
- **Use `HostSnapshot.revision`.** Rejected: revisions count state changes, while `requested` and `rejected` records change no state, and one revision can produce several records.
- **Per-plugin sequences.** Rejected: a host-wide completeness check needs one sequence; per-plugin counters cannot reveal a lost record for a plugin whose records are all missing.
- **Consume the number on a failed write.** Rejected: every sink hiccup would leave a permanent gap that a reviewer must investigate and that is, by construction, not a lost record.
- **Hash-chain the records in core.** Rejected for the core: it needs key and algorithm choices per deployment and implies a tamper-evidence claim the core cannot support alone; it is left to the companion and consumer ([ADR-BR-034](../decisions/034-gxp-companion-scope.md)).

## Consequences

**Positive**:

- Any gap in a stored trail is a real anomaly, never an artefact of buffering or of a failed write.
- Diagnostics keep their non-blocking, lossy feed without weakening the trail.

**Negative**:

- A write that timed out but landed in the store is retried with the same `recordId` and `auditSeq`, so a sink that is idempotent on `recordId` (an obligation on the consumer and companion) stores it once; a sink that is not will hold a duplicate, which `verifyAuditSequence` reports ([ADR-BR-031](../decisions/031-audit-failure-policy.md)).
- The sequence is per host instance. A restarted host starts at 1 under a new `hostId`, so the loss of an entire host's records, or of the tail after the last stored record, is not detectable from `auditSeq` alone; continuity across hosts is the consumer's or companion's check.
- `verifyAuditSequence` is detection only, and a reader who mistakes it for integrity protection over-trusts the trail; every document that mentions it states the limit.

**Trade-off accepted**: two counters with different meanings, at the cost of explaining the difference everywhere, in exchange for an audit sequence whose every gap means something.

## References

- Behaviours: [24 — Time, ids and sequence](../behaviors/24-time-ids-and-sequence.md), [23 — Audit sink and record](../behaviors/23-audit-sink-and-record.md), [13 — Observability and diagnostics](../behaviors/13-observability-and-diagnostics.md)
- Invariants: [INV-BR-023](../invariants.md#inv-br-023-the-audit-sequence-is-contiguous-per-host), [INV-BR-024](../invariants.md#inv-br-024-time-and-identifiers-come-only-from-services), [INV-BR-008](../invariants.md#inv-br-008-snapshot-revisions-never-regress)
- Requirements: [URS-BR-022](../urs.md#urs-br-022-obtain-a-complete-ordered-and-gap-detectable-lifecycle-record)
- Risks: [RSK-BR-006](../gxp/03-risk-assessment.md#rsk-br-006), [RSK-BR-012](../gxp/03-risk-assessment.md#rsk-br-012), [RSK-BR-021](../gxp/03-risk-assessment.md#rsk-br-021)
- Decisions: [ADR-BR-007](../decisions/007-observation-primitives.md), [ADR-BR-025](../decisions/025-deterministic-time-and-ids.md), [ADR-BR-030](../decisions/030-audit-sink-port.md), [ADR-BR-031](../decisions/031-audit-failure-policy.md), [ADR-BR-034](../decisions/034-gxp-companion-scope.md)
- Source: `docs/SPEC.md` — "Observability"
- Precedent: Qadi ADR-QD-056 (gap-and-duplicate detection named as not tamper evidence; cited by name).
- External: 21 CFR Part 11 §11.10(e); EU GMP Annex 11 (2011) §9; PIC/S PI 041 (ALCOA+, complete, consistent).
