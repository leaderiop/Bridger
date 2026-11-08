# ADR-KR-001: Shred keys; never rewrite events

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-KR-ADR-001                                           |
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

The event store never rewrites stored events ([INV-ES-003](../../event-store/invariants.md#inv-es-003-stored-events-are-never-rewritten-or-deleted-by-the-package)), the outbox keeps envelopes until acknowledged, and chains break when a chained record changes. Removing a person's data by deleting or editing events would break all three.

## Decision

- Personal fields are encrypted with a per-subject key; removing the data means destroying the key copies the `KeyStore` holds and asking registered holders of plaintext to drop it.
- A shred touches the `KeyStore` and callbacks only; it changes no stored event, envelope or chain link.

## Alternatives considered

- **Delete or redact events in place.** Rejected: breaks append-only stores and chains, and must reach every replica and backup anyway.
- **Copy-transform the store without the data.** Not excluded for an application, but rejected as the package's mechanism: heavy, and it rewrites history.

## Consequences

**Positive**: streams and chains stay intact and verifiable.

**Negative**: ciphertext remains; its protection depends on the algorithm and on the absence of key copies.

**Trade-off accepted**: ciphertext that stays, in exchange for intact history.

## References

- Behaviours: [BEH-KR-014](../behaviors/02-field-encryption.md#beh-kr-014-chains-hash-ciphertext-only), [BEH-KR-017](../behaviors/03-shred-and-acceptance.md#beh-kr-017-shredsubject-runs-in-a-fixed-order)
- Invariant: [INV-KR-004](../invariants.md#inv-kr-004-a-shred-changes-no-stored-byte)
