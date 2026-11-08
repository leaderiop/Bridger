# ADR-ES-005: Offline facts are recorded, never rejected; rule violations are events

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ES-ADR-005                                           |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.2 (2026-11-08): Decision states the savepoint retry, the transaction owner's retry, `factId`, and recording without keys (marker or verbatim) (CCR-ES-002)<br>0.1 (2026-11-08): Initial draft (CCR-ES-001)                 |

---

## Context

In a local-first system a host acts while offline: the effect has happened before any authority sees it. An authority that rejects such input loses a record of something that happened; an authority that accepts it silently loses the rule that was broken.

## Decision

- The package distinguishes commands (`Decider`, `Aggregate.handle`/`run`, refusable before the effect) from facts (`FactDecider`, `Aggregate.record`, never refused).
- `accept` has no error channel: a broken rule is expressed as further events that the application reviews. `record` retries version conflicts itself under a savepoint, and a commit-time conflict is retried in a new transaction by the transaction's owner (`recordFact`, or durable-bus for `receive`); recording is idempotent by a `factId` kept apart from the event's own `eventId`.
- A received fact is recorded even when the receiver cannot read all of it: a field of a shredded subject is recorded as its `Shredded` marker, and a host without the subject keys records the payload verbatim; a fact is halted on, never parked or dropped.
- Which input is a fact is the application's decision; the package supports the pattern and does not enforce it.

## Alternatives considered

- **Reject at the authority and compensate later.** Rejected: the rejection itself loses the fact.
- **Conflict-free merging.** Rejected: rules such as limits and balances are not expressible as merges.

## Consequences

**Positive**: no fact is lost to a rule; violations are visible, attributable events.

**Negative**: the application must model and review violation events.

**Trade-off accepted**: a review workload, in exchange for a complete record.

## References

- Behaviours: [BEH-ES-013](../behaviors/02-decide-and-evolve.md#beh-es-013-facts-are-recorded-through-aggregaterecord-which-cannot-reject), [BEH-ES-014](../behaviors/02-decide-and-evolve.md#beh-es-014-rule-violations-are-events--a-pattern-the-store-supports), [BEH-ES-030](../behaviors/04-versions-publication-and-chaining.md#beh-es-030-received-envelopes-are-recorded-as-facts-in-the-inboxs-transaction)
- Invariant: [INV-ES-006](../invariants.md#inv-es-006-recording-a-fact-cannot-fail-for-a-rule)
