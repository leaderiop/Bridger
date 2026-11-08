# ADR-DB-005: Versioned events and pure upcasters

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-DB-ADR-005                                            |
> | Revision       | 0.3                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.3 (2026-11-08): round 2: recheck items 21 and 22 — codec decode before upcasting; writers last with one round-trip-checked downcast (CCR-DB-003)<br>0.2 (2026-11-08): Resolutions of the agent review of 2026-11-08 — unknown versions halt or park per subscription (CCR-DB-002)<br>0.1 (2026-11-08): Initial draft (CCR-DB-001)                 |

---

## Context

Stored envelopes outlive the code that wrote them, and producers and consumers are upgraded at different times.

## Decision

- `DurableEvent.make(id, schema, { version, upcast })`: an integer version and a contiguous chain of pure, service-free upcasters on the encoded form ([BEH-DB-001](../behaviors/01-events-and-envelope.md#beh-db-001-durableeventmake-declares-a-versioned-event)).
- Read is codec-decode, upcast, then decode; stored envelopes are never rewritten; publish uses the current version, or N−1 during a writers-last window through one round-trip-checked downcast ([ADR-DB-009](./009-writers-last-for-offline-readers.md)).
- Unknown or too-old versions are stored and acknowledged, then halt the subscription's stream (default) or are parked under "park-and-continue", never dropped; readers know a version before any writer publishes it — readers first where they can be upgraded first, writers last otherwise.

## Alternatives considered

- **Rewrite stored events on upgrade.** Rejected: alters what the origin sent.
- **Free downcasting for old readers.** Rejected: lossy and unrecorded. One N→N−1 step checked by a round trip is accepted (ADR-DB-009).

## Consequences

**Positive**: deterministic replay; rolling upgrades lose nothing.

**Negative**: upcasters accumulate until the application can prove an old version is gone.

## References

- Behaviours: [04](../behaviors/04-versions-and-upcasters.md)
- Federation: [ADR-FD-006](../../federation/decisions/006-n-minus-one-skew-window.md)
