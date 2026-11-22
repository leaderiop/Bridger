# Change history

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-SQ-CHG                                               |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Change Record                                                |
> | Change History | 0.1 (2026-11-22): Older Change History lines moved out of the Document Control tables (improvement report 07, R6) |

---

A Document Control cell keeps its newest revisions; older lines are moved here, newest first, under the Document ID of
the document they belong to (`python3 references/core/scripts/split-history.py`). Nothing is rewritten: a line moves whole.

## BRIDGER-SQ-BEH-02

`sequence/behaviors/02-incarnation-and-verification.md`

- 0.5 (2026-11-10): Specification audit of 2026-11-10 (SPEC-AUDIT-03, Low "seen, not assessed") — BEH-SQ-009: the supersession step runs under the service actor `{ kind: "service", id: "sequence:" + node }` through `CallerContext.serve` with `Annotations.empty` and no correlation, so it commits under durable-bus `requireActor: true` (CCR-SQ-005)
- 0.4 (2026-11-10): Specification audit of 2026-11-09, round 2 — BEH-SQ-011: the package ships `SeriesFacts` (decider, `toFact`, `receive`) for authority-side recording, keeping the issuer's stream and the issuer's `eventId` as fact identifier; BEH-SQ-012: `SeriesEventInput.of` takes the issuer's `eventId` from `causationId` for a recorded received fact (P5) (CCR-SQ-004)
- 0.3 (2026-11-09): Specification audit of 2026-11-09 — BEH-SQ-009 runs the supersession step again when the durable-bus origin changes on a running host, takes the old series from the store being replaced through a durable-bus store-swap participant, refuses calls under the new origin with `SupersessionPending` until the step has committed, and states what a re-bootstrap snapshot may hold (U-10); `lastKnownOnly` is false for series read from the live store at a re-bootstrap (BEH-SQ-009, BEH-SQ-010, BEH-SQ-012); BEH-SQ-011 publishes on the event-store stream by event-store's default (F-05) (CCR-SQ-003)
- 0.2 (2026-11-08): BEH-SQ-009 records a supersession in the new incarnation's own stream, never in the old series, and closes every open series of lower incarnations when the plugin starts; BEH-SQ-011 publishes `SeriesSuperseded`; BEH-SQ-012 takes decoded series events and orders by number; BEH-SQ-013 states what a restore without a raised incarnation looks like at the authority and drops the foreign-writer exemption (CCR-SQ-002)
- 0.1 (2026-11-08): Initial draft (CCR-SQ-001)                
