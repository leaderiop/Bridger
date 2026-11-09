# ADR-AC-004: A package separate from @bridger/gxp

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-AC-ADR-004                                           |
> | Revision       | 0.3                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.3 (2026-11-09): The GxP companion adopts this package as its only sealing mechanism (CCR-GX-002); the consequence that two sealing designs may exist is removed (CCR-AC-004)<br>0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-AC-001)<br>0.1 (2026-11-08): Initial draft (CCR-AC-001)                 |

---

## Context

[ADR-BR-034](../../core/decisions/034-gxp-companion-scope.md) places "optional trail sealing (a hash chain over stored records with separately held anchors)" in the scope of the `@bridger/gxp` companion, and rejected, "for now", splitting that companion into several packages. The gap analysis of 2026-11-08 (item 13) lists tamper-evident audit as `@bridger/audit-chain` "or part of `@bridger/gxp`". Hash chaining and anchoring are useful outside regulated deployments — any operator that wants to detect changes to its lifecycle records may want them — and the GxP companion's draft is not available to this specification.

## Decision

- **A separate, optional package.** `@bridger/audit-chain` depends on `@bridger/core` only. Core never depends on it; it does not depend on `@bridger/gxp`, and this specification relies on nothing in that companion's draft.
- **Adoption, not ownership.** The GxP companion may adopt this package as its sealing mechanism; whether and how it does is specified by that companion. It does: it adopts this package as its only sealing mechanism and withdraws its own chain (its ADR-GX-029, CCR-GX-002). The limits stated here are those of ADR-BR-034 non-claim 5, so adoption adds no claim.
- **An amendment to ADR-BR-034**, registered by the core's change control as CCR-BR-021: sealing may be provided by `@bridger/audit-chain`, and the "several companion packages" alternative is revisited for sealing only.

## Alternatives considered

- **Sealing inside `@bridger/gxp` only.** Rejected: it would tie a generic mechanism to a regulated-use package and make non-GxP users adopt a companion whose other contents they do not need.
- **Wait for the GxP companion's draft.** Rejected: the mechanism and its limits can be specified against the core port alone, which both packages share.

## Consequences

**Positive**:

- One mechanism, usable with or without the GxP companion, with one statement of its limits.
- The GxP companion can cite this package's acceptance checks instead of restating them.

**Negative**:

- A further package to version and keep aligned with the core record's `schemaVersion`.

**Trade-off accepted**: a separate package with a narrow scope, at the cost of one more package, rather than a generic mechanism bundled into a regulated-use companion.

## References

- Behaviours: [03 — Verification](../behaviors/03-verification.md) (BEH-AC-022)
- Core decisions: [ADR-BR-034](../../core/decisions/034-gxp-companion-scope.md), [ADR-BR-028](../../core/decisions/028-gxp-scope.md), [ADR-BR-027](../../core/decisions/027-core-exclusions.md)
