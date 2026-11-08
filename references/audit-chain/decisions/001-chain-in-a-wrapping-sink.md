# ADR-AC-001: The chain lives in a sink that wraps the store, not in the core record

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-AC-ADR-001                                           |
> | Revision       | 0.3                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.3 (2026-11-08): Store port renamed `ChainStore`; the wrapping sink is the audit instance of `ChainSink<R>` (ADR-AC-005) (CCR-AC-003)<br>0.2 (2026-11-08): Order and host violations are marked, not failed; the cost of a failing inner store stated (CCR-AC-002)<br>0.1 (2026-11-08): Initial draft (CCR-AC-001)                 |

---

## Context

Core hands each `AuditRecord` to one `AuditSink`, one at a time, in `auditSeq` order, and retries the same record until the sink accepts it ([BEH-BR-202](../../core/behaviors/23-audit-sink-and-record.md)). The record has "exactly these fields" and a `schemaVersion` that must change whenever a field is added ([BEH-BR-195](../../core/behaviors/23-audit-sink-and-record.md)). Core computes no hash and provides no tamper evidence ([ADR-BR-027](../../core/decisions/027-core-exclusions.md)). A consumer that wants its stored records linked must put the link somewhere.

## Decision

- **A wrapping sink.** `HashChainSink` implements the core `AuditSink` port and wraps an inner `ChainStore` port that stores a `ChainEntry { record, link }`. Core does not know the chain exists.
- **The link beside the record.** The record reaches the store unchanged; the link is a separate value with its own version (`v: 1`). `ChainStore.split` lets an existing `AuditSink` adapter keep storing records while links go to a `LinkStore`.
- **One link per record.** The head advances only after a successful append; a retried record is re-sent with its pending link unchanged; order and host are checked, and a violation is appended with a break marker — never a failed write, because core's writer retries a refused record in place and a violation never clears (BEH-AC-005, BEH-AC-008).
- **Canonical form.** RFC 8785 over the record, with a domain string, the algorithm name and a type tag in every hash input.

## Alternatives considered

- **A `chain` field on the core record.** Rejected: it would change the core record for every consumer, require a new `schemaVersion`, and put a companion's concern into core, against ADR-BR-027.
- **Chaining inside the consumer's store (database triggers).** Not excluded — a consumer may do so — but rejected as the package's mechanism: it would be specific to each store, and the sink is the one place every record passes in order.
- **Chaining from `Host.events`.** Rejected: the event feed is lossy by design ([BEH-BR-207](../../core/behaviors/23-audit-sink-and-record.md)).
- **A batching chain that links records after the fact.** Rejected: it would open a window in which stored records have no link, and a retried record could be linked twice.

## Consequences

**Positive**:

- No core change; any deployment that already has an `AuditSink` can add the chain by wrapping it.
- Every core rule for a failing sink (retry in place, latch, refusal of operator changes) applies when the inner store cannot be written — with the cost core states: later records wait behind the failing one and are dropped past core's queue.
- A reader who ignores the chain reads the same records as before.

**Negative**:

- The chain sits on the write path: hashing and the inner store's latency count against `auditTimeout`.
- A store that cannot write record and link together must use `split`, whose crash window leaves a record without a link (reported, not hidden).

**Trade-off accepted**: a sink-side chain that core never sees, at the cost of the chain sharing the write path's availability, rather than a core record change.

## References

- Behaviours: [01 — Hash-chain sink](../behaviors/01-hash-chain-sink.md)
- Invariants: [INV-AC-001](../invariants.md#inv-ac-001-one-link-per-record-identical-across-retries), [INV-AC-002](../invariants.md#inv-ac-002-the-head-advances-only-on-a-successful-append-and-an-unexpected-record-is-marked), [INV-AC-003](../invariants.md#inv-ac-003-the-stored-record-is-the-record-core-handed-over)
- Core decisions: [ADR-BR-027](../../core/decisions/027-core-exclusions.md), [ADR-BR-030](../../core/decisions/030-audit-sink-port.md), [ADR-BR-031](../../core/decisions/031-audit-failure-policy.md)
- External: RFC 8785 (JSON Canonicalization Scheme).
