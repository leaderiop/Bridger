# ADR-GX-008: Tail loss is detected against external high-water marks

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-GX-ADR-008                                           |
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

A trail that loses its newest records looks, to every check over the stored entries, like a shorter trail: `auditSeq` is still contiguous from 1, digests still match, and a seal chain without an anchor past the cut is still linear. Detecting tail loss needs a number recorded somewhere else: the highest `auditSeq` the host had written at some moment, held where the party that truncates the trail cannot also lower it (RSK-GX-003, RSK-GX-005).

CCR-BR-014 gave core two sources for that number. `Host.controls` returns `auditPosition: { lastWritten }`, the highest `auditSeq` acknowledged by the sink, readable at any time without a snapshot revision ([BEH-BR-013](../../core/behaviors/02-host-construction.md)). `CloseReport.auditLastSeq` gives the highest `auditSeq` written when the close report is produced; the shutdown's own terminal record comes after it and is read from `Host.controls` (prototype finding G34; [BEH-BR-106](../../core/behaviors/12-shutdown-and-hosting.md)).

## Decision

- **An `AnchorStore` port under separate custody.** High-water marks are written to `AnchorStore` (planned at `packages/gxp/src/AnchorStore.ts` *(Planned)*), a caller-supplied port with no default ([ADR-GX-003](../decisions/003-ports-without-defaults.md)). It is append-only, like the trail store: `put(mark) → "stored" | "already-stored" | AnchorWriteFailed`, `list({ hostId }) → Stream<HighWaterMark>` and `latest({ hostId }) → Option<HighWaterMark>`, with a manifest naming the declared `custodian`. The user is told, in the API docs and the IQ check, that it must sit under custody separate from the trail store (different system, different credentials, different administrators); the companion cannot check custody, so IQ reports it as a probe ([ADR-GX-020](../decisions/020-iq-proof-and-probe.md)).
- **What a mark holds.** `HighWaterMark { v: 1, hostId, lastWritten, at, source: "periodic" | "close", seal? }`. `at` comes from the `Clock` and orders nothing; `lastWritten` is the mark. `seal` is present only when the host's trail is sealed, and is then the seal of the entry at `lastWritten` ([ADR-GX-009](../decisions/009-optional-sealing.md)).
- **When marks are taken.** `recordHighWater(host, anchors, { every })` reads `Host.controls.auditPosition.lastWritten` once per `every` (1 second to 1 hour) and puts a mark when it has advanced. At close, `recordClose(report)` puts a `"close"` mark with `Host.controls` read once after shutdown has returned and the writer's final flush is done; `CloseReport.auditLastSeq` is only a lower bound, since the shutdown's terminal record is written after the report (G34). A failed periodic `put` is logged, counted in the recorder's status and retried at the next tick; it never blocks the host, because marks detect and do not gate.
- **What is reported.** `checkHighWater(store, anchors, { hostId })` reports `tailLoss` (from the stored `lastSeq` + 1 to the highest mark's `lastWritten`) when a mark exceeds the highest stored `auditSeq`, and `unanchoredTail` (from the highest mark's `lastWritten` + 1 to the stored `lastSeq`) for stored entries above the last mark. The second is a statement of coverage, not a fault.
- **Limits stated.** Tail loss is detected only up to the last anchor written, and only against a party that cannot also lower or delete anchors. Records written after the last anchor and lost with it are not detectable by this mechanism.

## Alternatives considered

- **Store the high-water mark in the trail store.** Rejected: whoever truncates the trail truncates the mark with it.
- **Derive the mark from `HostSnapshot` revisions.** Rejected: core keeps audit position out of the snapshot deliberately, to avoid one revision per write; `Host.controls` exists for this read.
- **Gate writes on a successful anchor.** Rejected: an anchor outage would stop every regulated change for a detection aid. The anchor gap shows up as `unanchored-tail` instead.

## Consequences

**Positive**:

- Truncation below an anchored mark is reported, with the anchored and stored numbers.
- The unanchored range is reported, so a reader knows exactly which records the mechanism does not cover.

**Negative**:

- The user must run and administer a second store under separate custody; the companion cannot check that custody.
- The protection window depends on the anchoring interval; a short interval means more anchor writes.

**Trade-off accepted**: a second, separately held store and a stated unanchored window, in exchange for detecting a loss that no check over the trail alone can see.

## References

- Behaviours: [06 — High-water marks and anchors](../behaviors/06-high-water-marks-and-anchors.md)
- Risks: [RSK-GX-003](../gxp/03-risk-assessment.md#rsk-gx-003), [RSK-GX-005](../gxp/03-risk-assessment.md#rsk-gx-005)
- Decisions: [ADR-GX-003](../decisions/003-ports-without-defaults.md), [ADR-GX-007](../decisions/007-checks-never-claim-integrity.md), [ADR-GX-009](../decisions/009-optional-sealing.md), [ADR-GX-020](../decisions/020-iq-proof-and-probe.md)
- Core: [BEH-BR-106](../../core/behaviors/12-shutdown-and-hosting.md), [BEH-BR-013](../../core/behaviors/02-host-construction.md), [BEH-BR-212](../../core/behaviors/24-time-ids-and-sequence.md), [ADR-BR-034](../../core/decisions/034-gxp-companion-scope.md)
