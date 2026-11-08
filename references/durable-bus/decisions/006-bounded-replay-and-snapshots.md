# ADR-DB-006: Bounded replay, and snapshots past the horizon

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-DB-ADR-006                                            |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.2 (2026-11-08): Resolutions of the agent review of 2026-11-08 — downstream history is pulled through `HistorySource` (CCR-DB-002)<br>0.1 (2026-11-08): Initial draft (CCR-DB-001)                 |

---

## Context

After a long outage, backlogs and catch-up reads hit receivers simultaneously (replay storms, review §9). Some history a subscriber missed may no longer be retained by its source.

## Decision

- Receivers grant credit; relays obey it, back off with full jitter, and interleave streams by priority without breaking per-stream order ([BEH-DB-041](../behaviors/06-replay-and-snapshots.md#beh-db-041-the-receiver-grants-credit)).
- Upstream facts (a node's own outbox) are never truncated before acknowledgement and never answered with a snapshot demand.
- Downstream history is pulled through the `HistorySource` port ([BEH-DB-047](../behaviors/06-replay-and-snapshots.md#beh-db-047-historysource--the-pull-port-for-downstream-history)); a follower behind a source's retained history gets `SnapshotRequired` and restores through the application's `SnapshotProvider`, atomically with its watermarks and cursors ([BEH-DB-044](../behaviors/06-replay-and-snapshots.md#beh-db-044-a-subscriber-behind-the-retained-history-needs-a-snapshot)). The horizon should be at least the federation offline cap.

## Alternatives considered

- **Unbounded replay.** Rejected: storms.
- **Drop old upstream events.** Rejected: they are facts.

## Consequences

**Positive**: bounded load; gaps are explicit.

**Negative**: snapshot content is the application's to define.

## References

- Behaviours: [06](../behaviors/06-replay-and-snapshots.md)
- Federation: [ADR-FD-007](../../federation/decisions/007-offline-cap-and-rebootstrap.md)
