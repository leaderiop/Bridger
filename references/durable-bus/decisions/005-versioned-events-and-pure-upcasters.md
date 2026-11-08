# ADR-DB-005: Versioned events and pure upcasters

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-DB-ADR-005                                            |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.2 (2026-11-08): Resolutions of the agent review of 2026-11-08 — unknown versions halt or park per subscription (CCR-DB-002)<br>0.1 (2026-11-08): Initial draft (CCR-DB-001)                 |

---

## Context

Stored envelopes outlive the code that wrote them, and producers and consumers are upgraded at different times.

## Decision

- `DurableEvent.make(id, schema, { version, upcast })`: an integer version and a contiguous chain of pure, service-free upcasters on the encoded form ([BEH-DB-001](../behaviors/01-events-and-envelope.md#beh-db-001-durableeventmake-declares-a-versioned-event)).
- Read is upcast then decode; stored envelopes are never rewritten; publish uses the current version only.
- Unknown or too-old versions are stored and acknowledged, then halt the subscription's stream (default) or are parked under "park-and-continue", never dropped; readers are upgraded before writers raise a version.

## Alternatives considered

- **Rewrite stored events on upgrade.** Rejected: alters what the origin sent.
- **Downcasting for old readers.** Rejected: lossy and unrecorded.

## Consequences

**Positive**: deterministic replay; rolling upgrades lose nothing.

**Negative**: upcasters accumulate until the application can prove an old version is gone.

## References

- Behaviours: [04](../behaviors/04-versions-and-upcasters.md)
- Federation: [ADR-FD-006](../../federation/decisions/006-n-minus-one-skew-window.md)
