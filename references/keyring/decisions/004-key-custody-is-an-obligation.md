# ADR-KR-004: Key storage, rotation and backup are obligations of the adapter and the consumer

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-KR-ADR-004                                           |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.1 (2026-11-08): Initial draft (CCR-KR-001)                 |

---

## Context

What a shred is worth depends on where key copies live: the database, its files after deletion, its backups, a hardware module, a key-management service. The package cannot see or control these.

## Decision

- Keys are stored wrapped through `KeyStore` and `KeyWrapper` ports; the package states their obligations (no live copy after destroy, documented compaction, wrapper key outside the database recommended, bounded backup retention, tombstones re-applied after restore) and provides no production adapter.
- Every receipt lists what a shred did not reach (`notStated`).
- No claim of irreversibility, erasure or legal sufficiency is made.

## Alternatives considered

- **Ship a key store.** Rejected: custody is deployment-specific, and a shipped store would invite the claim that keys are handled correctly.

## Consequences

**Positive**: the limits are explicit and travel with every receipt.

**Negative**: the consumer must design and evidence key custody.

**Trade-off accepted**: consumer work, in exchange for honest limits.

## References

- Behaviours: [BEH-KR-004](../behaviors/01-keys-and-subjects.md#beh-kr-004-keystore-obligations), [BEH-KR-005](../behaviors/01-keys-and-subjects.md#beh-kr-005-keywrapper--the-key-encryption-key-stays-outside-the-store), [BEH-KR-006](../behaviors/01-keys-and-subjects.md#beh-kr-006-rotation-of-data-keys-and-of-the-wrapping-key), [BEH-KR-007](../behaviors/01-keys-and-subjects.md#beh-kr-007-backup-obligations), [BEH-KR-022](../behaviors/03-shred-and-acceptance.md#beh-kr-022-the-limits-of-a-shred-are-stated-in-every-receipt)
