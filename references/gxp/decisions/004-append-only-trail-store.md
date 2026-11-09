# ADR-GX-004: The trail store is append-only, idempotent on recordId and unique per host sequence

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-GX-ADR-004                                           |
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

Core hands each `AuditRecord` to one sink, one at a time, in `auditSeq` order, and retries a failed write in place with the same record ([BEH-BR-202](../../core/behaviors/23-audit-sink-and-record.md)). A write whose outcome is unknown (the store committed, then the connection dropped) is therefore retried, so the store sees the same record twice. A store that appends blindly duplicates it; a store that upserts by key silently replaces whatever was there before, including a different record that collided on the key by mistake. Core keeps no copy ([BEH-BR-208](../../core/behaviors/23-audit-sink-and-record.md)), so whatever the store holds is the trail.

`auditSeq` starts at 1 per host and is contiguous over written records ([BEH-BR-212](../../core/behaviors/24-time-ids-and-sequence.md)); `recordId` comes from the host's `IdGenerator` ([BEH-BR-210](../../core/behaviors/24-time-ids-and-sequence.md)). Both are therefore usable as uniqueness keys.

## Decision

- **The port.** The store is the port `TrailStore` (planned at `packages/gxp/src/TrailStore.ts` *(Planned)*):

  ```ts
  // illustrative — not type-checked
  interface TrailStoreShape {
    readonly manifest: TrailStoreManifest  // commit semantics and limits (BEH-GX-016)
    readonly append: (entry: TrailEntry) => Effect<"stored" | "already-stored", TrailWriteFailed>
    readonly read: (q: { hostId: string; fromSeq?: number; toSeq?: number }) => Stream<TrailEntry, TrailReadFailed>
    readonly hosts: Effect<ReadonlyArray<HostExtent>, TrailReadFailed>   // { hostId, firstSeq, lastSeq, count }
  }
  interface TrailEntry {
    readonly hostId: string; readonly auditSeq: number; readonly recordId: string   // equal to the record's
    readonly record: AuditRecord          // as core produced it
    readonly canonical: string            // RFC 8785 JCS of record (ADR-GX-005)
    readonly digest: string               // "sha256:" + lower-case hex SHA-256 of the UTF-8 canonical bytes
    readonly seal?: SealEnvelope          // only with sealing on (ADR-GX-009)
  }
  ```

- **Two uniqueness keys.** A store holds at most one entry per `record.recordId` and at most one per `(record.hostId, record.auditSeq)` ([INV-GX-006](../invariants.md#inv-gx-006-at-most-one-stored-entry-per-record-and-per-host-sequence-number)). Both are enforced by the store itself (a unique index, a conditional put, a transaction), not by a read-then-write in the adapter.
- **Same bytes is success.** If an entry already exists under either key and its `canonical` is byte-for-byte equal to the incoming one (and the seal, if any, is equal), `append` returns `"already-stored"`. The sink treats it as acknowledged ([ADR-GX-003](../decisions/003-ports-without-defaults.md), [03 — Trail sink](../behaviors/03-trail-sink.md)).
- **Different bytes is a failure, never an overwrite.** If an entry exists under either key with different bytes, `append` fails with `TrailWriteFailed { reason: "conflict", message }`. The stored entry is left as it was. The message carries identifiers only, never record content.
- **"stored" means committed.** `append` returns only after the store has committed the entry, as the user's store defines a commit; returning earlier is a conformance failure (RSK-GX-001).
- **No update, no delete.** The port has no update, delete, truncate or upsert operation, and no companion API rewrites a stored entry ([INV-GX-008](../invariants.md#inv-gx-008-no-companion-api-rewrites-a-stored-entry)). Retention and disposal are the user's, outside the port.
- **Reads return what was stored.** `read` yields entries of one host in ascending `auditSeq`, with `canonical` exactly as appended. It never re-serialises `record`.

## Alternatives considered

- **Upsert by `recordId`.** Rejected: a retry is harmless, but a key collision or a bug overwrites a stored record without anyone seeing it.
- **Idempotency on `recordId` only.** Rejected: two different records with the same `(hostId, auditSeq)` (a host restarted with a reused id, two writers) would both be stored and the sequence check would only see a duplicate after the fact. The store refuses the second at write time.
- **Store the record object and canonicalise on read.** Rejected: a store that reorders keys, normalises numbers or rewrites strings would change the digest; storing the canonical text keeps the bytes that were hashed ([ADR-GX-023](../decisions/023-archives-keep-original-bytes.md)).

## Consequences

**Positive**:

- A retry after an unknown outcome stores one entry; a conflicting record fails loudly and core latches ([ADR-BR-031](../../core/decisions/031-audit-failure-policy.md)).
- Nothing in the companion can replace a stored entry, so a changed entry can only come from outside the companion, where checks on read and sealing look for it.

**Negative**:

- The store must support two unique constraints and a byte comparison; some stores need a transaction for that.
- A genuine conflict stops the host's mutations until a person resolves it; that is the intended fail-closed outcome.

**Trade-off accepted**: a stricter adapter contract, in exchange for retries that never duplicate and conflicts that never overwrite.

## References

- Behaviours: [02 — Trail store port](../behaviors/02-trail-store-port.md), [03 — Trail sink](../behaviors/03-trail-sink.md), [04 — Conformance suite](../behaviors/04-conformance-suite.md)
- Invariants: [INV-GX-006](../invariants.md#inv-gx-006-at-most-one-stored-entry-per-record-and-per-host-sequence-number), [INV-GX-007](../invariants.md#inv-gx-007-the-sink-acknowledges-only-what-the-store-reports-stored), [INV-GX-008](../invariants.md#inv-gx-008-no-companion-api-rewrites-a-stored-entry)
- Risks: [RSK-GX-001](../gxp/03-risk-assessment.md#rsk-gx-001), [RSK-GX-002](../gxp/03-risk-assessment.md#rsk-gx-002)
- Decisions: [ADR-GX-005](../decisions/005-jcs-and-sha256.md), [ADR-GX-009](../decisions/009-optional-sealing.md), [ADR-GX-023](../decisions/023-archives-keep-original-bytes.md)
- Core: [ADR-BR-030](../../core/decisions/030-audit-sink-port.md), [ADR-BR-031](../../core/decisions/031-audit-failure-policy.md), [BEH-BR-202](../../core/behaviors/23-audit-sink-and-record.md), [BEH-BR-208](../../core/behaviors/23-audit-sink-and-record.md), [BEH-BR-210](../../core/behaviors/24-time-ids-and-sequence.md), [BEH-BR-212](../../core/behaviors/24-time-ids-and-sequence.md)
