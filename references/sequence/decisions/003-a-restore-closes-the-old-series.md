# ADR-SQ-003: A restore starts a new incarnation and closes the old series; numbers are never reused

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-SQ-ADR-003                                           |
> | Revision       | 0.3                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.3 (2026-11-09): Decision extended to a whole-store re-bootstrap on a running host: old handles refused, old series read from the replaced store and superseded with `lastKnownOnly: false` (CCR-SQ-003)<br>0.2 (2026-11-08): The supersession is recorded in the new incarnation's own stream at plugin start, never appended to the old series; consequences and alternatives updated (CCR-SQ-002)<br>0.1 (2026-11-08): Initial draft (CCR-SQ-001)                 |

---

## Context

A host restored from yesterday's backup would issue again the numbers it issued since the backup. The event delivery companion already requires a new incarnation after a restore, as an operator obligation it cannot detect ([BEH-DB-004](../../durable-bus/behaviors/01-events-and-envelope.md#beh-db-004-an-origin-is-an-incarnation-never-reused)).

## Decision

- The incarnation is part of a series' identity. When the sequence plugin starts under a new incarnation, it closes every open series of lower incarnations of the node as superseded, with the last number the restored store knows and `lastKnownOnly: true`, by `SeriesSuperseded` events in the new incarnation's own stream. It never appends to an old series: the old series' stream versions after the backup may already have been used by the lost tail, and writing them again would fork the series and any chain over it.
- A whole-store re-bootstrap changes the incarnation while the plugin runs (durable-bus [BEH-DB-048](../../durable-bus/behaviors/06-replay-and-snapshots.md#beh-db-048-before-a-snapshot-the-outbox-is-pushed-or-kept-and-the-install-goes-through-the-bus)). The plugin then refuses every handle of the old origin, reads the open series from the store being replaced through a store-swap participant, and supersedes them in the new incarnation's stream with `lastKnownOnly: false`, since that store was drained and frozen when it was read. Calls under the new origin wait for that step (`SupersessionPending`).
- Numbering restarts at 1 under the new series id; no number is ever issued twice under one id.
- The authority links incarnations through `previous` and reports what it cannot know: numbers issued after the backup and never received.

## Alternatives considered

- **Continue the old series after a restore.** Rejected: reissues numbers.
- **Append the closure to the old series (revision 0.1 of this decision).** Rejected in revision 0.2: the closure would take a stream version the lost tail may already have used, which forks the series and its chain, and it is never written for a name that is not reopened.
- **Ask the authority for the last number before resuming.** Rejected: requires connectivity at exactly the moment a host was just repaired, and the authority may not have received the tail either.

## Consequences

**Positive**: no number is reused, even after a restore.

**Negative**: a re-bootstrap's supersession depends on the plugin's memory between the read of the old store and the commit of the step; a lost tail stays unknown until its records surface; a restore without a raised incarnation is detected only by the receiving inbox (`EnvelopeConflict`, BEH-DB-004), and only while it still holds the first event ids; the start step scans the series types of the store once per start.

**Trade-off accepted**: a stated limit, in exchange for never reusing a number.

## References

- Behaviours: [BEH-SQ-009](../behaviors/02-incarnation-and-verification.md#beh-sq-009-a-new-incarnation-closes-the-old-series-as-superseded), [BEH-SQ-010](../behaviors/02-incarnation-and-verification.md#beh-sq-010-the-lost-tail-is-a-stated-limit), [BEH-SQ-014](../behaviors/02-incarnation-and-verification.md#beh-sq-014-the-authoritys-registry-links-incarnations)
