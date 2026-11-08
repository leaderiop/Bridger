# ADR-KR-003: A shredded subject is closed, never given a new key

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-KR-ADR-003                                           |
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

After a shred, a write for the same subject id could either fail or silently create a fresh key. A fresh key would make new data readable under an id the application believes shredded, and would mix pre- and post-shred data under one subject.

## Decision

- A tombstone is kept for the life of the `KeyStore`; `key`, `encrypt` and the codec's encode fail with `KeyShredded` for the subject.
- New data about the same person requires a new subject id, chosen by the application.

## Alternatives considered

- **Re-key on demand.** Rejected for the confusion above.

## Consequences

**Positive**: a shred has one clear meaning; no new plaintext appears under a shredded id.

**Negative**: tombstones accumulate; writes for a shredded subject fail until the application uses a new id.

**Trade-off accepted**: failing writes, in exchange for an unambiguous shred.

## References

- Behaviours: [BEH-KR-002](../behaviors/01-keys-and-subjects.md#beh-kr-002-keyringkeysubject-returns-a-handle-never-key-material), [BEH-KR-018](../behaviors/03-shred-and-acceptance.md#beh-kr-018-the-tombstone-closes-the-subject)
- Invariant: [INV-KR-003](../invariants.md#inv-kr-003-a-shredded-subject-never-gets-a-new-key)
