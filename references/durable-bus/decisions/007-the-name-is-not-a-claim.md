# ADR-DB-007: The package name is not a claim

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-DB-ADR-007                                            |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.1 (2026-11-08): Initial draft (CCR-DB-001)                 |

---

## Context

The package is named `@bridger/durable-bus` in the architecture review and roadmap. The core honest-claims rule lists the word in that name among restricted claim words: the core makes no persistence claim because it owns no storage, and this companion owns none either.

## Decision

- The name is kept as a label of intent: events written through it are meant to outlive a process.
- Every property of this package is stated relative to a storage adapter: an envelope exists when its transaction commits ([INV-DB-001](../invariants.md#inv-db-001-an-envelope-is-in-the-outbox-exactly-when-its-transaction-committed)); whether that commit survives a crash or a power loss is the adapter's documented property and the consumer's responsibility ([BEH-DB-054](../behaviors/07-core-bus-and-adapters.md#beh-db-054-storage-adapter-obligations), property 7).
- Text in this tree uses the word only in the package name or in sentences that disclaim it, so that the core claims lint would accept it.

## Alternatives considered

- **Rename to `@bridger/outbox`.** Viable; left open for the integration of this companion, since the name is already used by the review and roadmap.

## Consequences

**Positive**: no claim is made that storage this package does not own is reliable.

**Negative**: readers may still infer a guarantee from the name; the README states otherwise at the top.

## References

- Core: [ADR-BR-027](../../core/decisions/027-core-exclusions.md), [ADR-BR-028](../../core/decisions/028-gxp-scope.md)
