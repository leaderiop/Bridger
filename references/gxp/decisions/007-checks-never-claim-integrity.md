# ADR-GX-007: Checks on read report findings and never claim integrity

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-GX-ADR-007                                           |
> | Revision       | 0.3                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-GX-03 §5)           |
> | Approved by    | — (pending; single maintainer, see PROC-GX-03 §5)            |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.3 (2026-11-10): Seal kinds from audit-chain named apart from the companion's own (`chainUnanchoredTail`, `chainNonCanonical`, `chainLossCounterRose`, `anchorUnconfirmed`), and the archive kind `bundleMismatch` (P14, P15, P16) (CCR-GX-005)<br>0.2 (2026-11-09): Finding kinds `nonCanonical`, `collision`, `auditDropped`, `headMismatch`; seal findings mapped from audit-chain (F-01, F-02, C-09) (CCR-GX-002)<br>0.1 (2026-10-03): Initial draft (CCR-GX-001)                 |

---

## Context

Core's `verifyAuditSequence` detects gaps, duplicates and disorder in `auditSeq`, and nothing more ([BEH-BR-215](../../core/behaviors/24-time-ids-and-sequence.md), [ADR-BR-037](../../core/decisions/037-audit-sequence-separate-from-event-seq.md)). It cannot see a record whose content was changed, a trail truncated after its last record, or a sequence rebuilt by someone who renumbered it. The companion adds further checks over stored entries, but each check, too, sees only what it checks for. A report that says "trail verified" or "no tampering" turns a narrow, honest result into a claim nobody can support (RSK-GX-004).

## Decision

- **Two entry points.** `checkTrailEntries(entries, { expectClosed })` is a pure function over entries in memory. `checkStoredTrail(store, { hostId, expectClosed, ... })` streams one host's entries from a `TrailStore`, holding at most one page, the last entry of the previous page and the open `requested` records, up to `maxOpenRequests` (NFR-GX-006). Both build on core's `verifyAuditSequence` and return the same `CheckReport`.
- **Checked kinds are listed.** A `CheckReport` names every kind it ran. The kinds are: core's `gap`, `duplicate` and `outOfOrder` findings; `digestMismatch` (the stored `digest` does not equal "sha256:" followed by the lower-case hex SHA-256 of the UTF-8 bytes of `canonical`); `canonicalMismatch` (`record` does not canonicalise to `canonical`, or the entry's identifiers differ from the record's); `unknownSchemaVersion` (reported, the entry still counted, never skipped); `nonCanonical` and `collision` (entries the sink stored marked, or the store kept beside a primary, [ADR-GX-030](./030-sink-marks-and-gate-refuses.md)); `requestedWithoutTerminal`; `droppedSinceAck`; `auditDropped`; `noCleanClose`; and, from `checkApprovals` with a ticket store, `approvalWithoutRecord` and `recordWithoutApproval` between consumed bindings and `requested`/`rejected` records ([ADR-GX-011](../decisions/011-ticket-cited-by-correlation-id.md)). Tail loss (`tailLoss`, `unanchoredTail`) and seals (`chainBreak`, `anchorMismatch`, `headMismatch`, `chainUnanchoredTail`, `chainNonCanonical`, `chainLossCounterRose` and `anchorUnconfirmed`, mapped from `@bridger/audit-chain`'s results and named apart from the companion's own kinds for similar facts, [ADR-GX-029](./029-sealing-through-audit-chain.md)) come from separate checks ([ADR-GX-008](../decisions/008-high-water-anchors.md), [ADR-GX-029](../decisions/029-sealing-through-audit-chain.md)), as does `bundleMismatch`, an archive's chain bundle disagreeing with its entries ([ADR-GX-023](./023-archives-keep-original-bytes.md)); a kind a run did not look for is listed in `notCheckedKinds`.
- **Findings, not verdicts.** A report is `{ format: "bridger-gx-check/1", scope: { hostId, fromSeq, toSeq }[], checkedKinds, notCheckedKinds, findings, statement }`. With no findings, `statement` is "No findings of the checked kinds.", followed by "Kinds not checked: <list>." when any kind was not checked. It produces no boolean named `valid`, `ok` or `intact`, and no wording that says the trail is whole, unaltered or has integrity.
- **Never suppressed, never upgraded.** Every finding the checks produce is in the report. A finding cannot be filtered, downgraded or marked accepted by an option of the check; acceptance is a separate, recorded act by the user outside the check ([INV-GX-009](../invariants.md#inv-gx-009-a-finding-is-never-suppressed-or-upgraded)). A read failure fails the check with `TrailReadFailed`; no report is produced for a range only partly read, and never an empty, finding-free one.
- **No content in findings.** A finding names `hostId`, `auditSeq`, `recordId` and the kind. It quotes no record content, so a report can be shared without carrying configuration paths or reasons beyond what identifiers reveal.

## Alternatives considered

- **A `verified: true` summary when there are no findings.** Rejected: it reads as a statement about the trail, when it is a statement about the checks.
- **Skip entries with an unknown `schemaVersion`.** Rejected: skipping hides exactly the entries a reader cannot interpret; they are counted and reported.
- **Let callers configure severities and suppressions.** Rejected: a suppression option is the mechanism by which an inconvenient finding disappears.

## Consequences

**Positive**:

- A report says precisely what was looked for and over which range, so a reviewer can tell what it does not cover.
- The same wording rule applies in archives and evidence packs, which reuse `CheckReport`.

**Negative**:

- Users who want a single green light get a list of checked kinds instead.
- A trail rebuilt consistently by someone with write access to the store produces no findings of these kinds; only high-water marks and sealing with separate custody narrow that.

**Trade-off accepted**: less reassuring output, in exchange for output that never says more than the checks established.

## References

- Behaviours: [05 — Checks on read](../behaviors/05-checks-on-read.md)
- Invariants: [INV-GX-009](../invariants.md#inv-gx-009-a-finding-is-never-suppressed-or-upgraded)
- Risks: [RSK-GX-004](../gxp/03-risk-assessment.md#rsk-gx-004), [RSK-GX-019](../gxp/03-risk-assessment.md#rsk-gx-019)
- Decisions: [ADR-GX-008](../decisions/008-high-water-anchors.md), [ADR-GX-029](../decisions/029-sealing-through-audit-chain.md), [ADR-GX-011](../decisions/011-ticket-cited-by-correlation-id.md), [ADR-GX-027](../decisions/027-claims-and-non-claims.md)
- Core: [ADR-BR-037](../../core/decisions/037-audit-sequence-separate-from-event-seq.md), [BEH-BR-198](../../core/behaviors/23-audit-sink-and-record.md), [BEH-BR-215](../../core/behaviors/24-time-ids-and-sequence.md)
