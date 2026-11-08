# ADR-AC-005: One chain over any append-only stream, hashing the stored form

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-AC-ADR-005                                           |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.1 (2026-11-08): Initial draft (CCR-AC-003)                 |

---

## Context

The chain covered only core `AuditRecord`s, keyed by host id. Applications keep other append-only streams that need the same detection of alteration and the same anchoring: a numbered document series, a release log, a log of access to personal data. Some of these streams hold encrypted fields whose keys are destroyed on request (crypto-shredding, planned in a keyring companion); a chain over the plaintext could then no longer be recomputed. Inspectors also need to check a trail away from the systems that produced it.

## Decision

- One generic sink, `ChainSink<R>`, chains any append-only stream described by a `SeriesSpec<R>`; `HashChainSink` is its instance over core `AuditRecord`s and keeps every rule of 01 ([04 — Generic Chain](../behaviors/04-generic-chain.md), BEH-AC-025). The inner store port is renamed `ChainStore`.
- A series has its own id, chosen by the application and separate from any host id; the audit series keeps the host id (BEH-AC-026).
- Which bytes are hashed is a pure, named `Canonicaliser` port, recorded in every link (BEH-AC-027).
- Encrypted fields are hashed in their stored, encrypted form, never as plaintext, so destroying a key leaves every link recomputable (BEH-AC-028).
- A portable, canonical verification bundle — segments, anchors, receipts, trust roots — is produced by `exportBundle` and checked offline by the pure `verifyBundle`; the kit's `bridger verify-chain` renders its report ([05 — Verification Bundle](../behaviors/05-verification-bundle.md), BEH-AC-033, BEH-AC-034).

## Alternatives considered

- **A second package per stream type.** Rejected: link rules, anchoring and verification would be duplicated and drift.
- **Hash the plaintext and keep a separate commitment.** Rejected: shredding the key would make the link unverifiable, or the plaintext hash would keep information about shredded data.
- **Online-only verification.** Rejected: an inspector's check would depend on access to the producer's systems and services.

## Consequences

**Positive**:

- One mechanism, one verifier and one anchoring path for every chained stream.
- Shredding and chaining coexist.
- Offline inspection with a report that states what was checked.

**Negative**:

- The store port's name changes (`ChainSink` → `ChainStore`) in a draft API.
- A chain over ciphertext detects alteration of the stored form only; that the ciphertext decrypts to what was written is the encryption layer's property.

**Trade-off accepted**: a slightly more general API and a rename, rather than parallel chain packages.

## References

- Behaviours: [04 — Generic Chain](../behaviors/04-generic-chain.md), [05 — Verification Bundle](../behaviors/05-verification-bundle.md), [01 — Hash-chain sink](../behaviors/01-hash-chain-sink.md)
- Invariants: [INV-AC-006](../invariants.md#inv-ac-006-a-bundle-is-verified-from-the-bundle-alone), [INV-AC-007](../invariants.md#inv-ac-007-one-series-one-canonicaliser-and-one-algorithm)
- Core: [RSK-BR-045](../../core/gxp/03-risk-assessment.md#rsk-br-045)
