# ADR-GX-026: This specification is prospective

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-GX-ADR-026                                           |
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

Roadmap phase P6 requires the companion's specification to be approved before any companion code exists. No package `@bridger/gxp` exists, no test has run against it, and no reviewer other than the single maintainer has read the specification. A document that reads as if the companion were built, tested or approved would mislead a reader in exactly the domain where that matters most. Core faced the same position and settled it in [ADR-BR-036](../../core/decisions/036-prospective-specification.md); the companion follows the same rules, with its own register and checker.

## Decision

Until code and tests exist, this specification is marked and written as prospective, mirroring ADR-BR-036.

- **Status.** Every document is `Draft`, Revision `0.1`, Effective Date `— (pending approval)`. Every ADR is `Proposed`. The initial drafts are recorded under `CCR-GX-001`. The README states `**implementation: absent**`.
- **Review and approval are stated as absent.** Reviewed by and Approved by name no person while there is a single maintainer and no independent reviewer (PROC-GX-03 §5). A status changes only through a recorded review and approval.
- **Planned paths.** Every source or test path carries *(Planned)*, for example `packages/gxp/src/TrailStore.ts` *(Planned)* or `packages/gxp/src/testing/conformance.ts` *(Planned)*. The marker is removed in the change that adds the file.
- **Illustrative code.** TypeScript blocks begin with `// illustrative — not type-checked`. Test vectors are the exception: they are exact, and check 17 recomputes them ([ADR-GX-028](../decisions/028-checker-copy-and-adapt.md)).
- **Verification tolerance.** The checker tolerates the absence of a path marked *(Planned)*, and only of such a path.
- **Nothing is evidence yet.** No GX requirement, invariant or compliance-matrix row is cited as satisfied, enforced or covered. The companion's compliance matrix says *specified*, not *met*. Invariants carry **Source** and **Verification** marked *(Planned)*.
- **Words that claim.** The claim words of [ADR-GX-027](../decisions/027-claims-and-non-claims.md) appear only negated in the same sentence, and the stricter lint of the GX checker enforces it.
- **Transition.** When code lands, each affected document is revised under a new CCR-GX: paths lose *(Planned)*, behaviours gain test references, and statuses change only after review and approval.
- **Depends on core's state.** The companion cannot move beyond prospective before the core interfaces it relies on exist in code; the core-interface map records the core document revisions it was written against ([ADR-GX-025](../decisions/025-core-version-range.md)).

## Alternatives considered

- **Write the specification as if implemented, with a disclaimer.** Rejected for the reason core rejected it: a disclaimer is read once, the requirements are read every day.
- **Wait for code before writing.** Rejected: P6 requires specification first, and the core change CCR-BR-014 was derived from this specification's needs.
- **Leave statuses blank.** Rejected: a blank status invites the reader to assume the best one.

## Consequences

**Positive**:

- A reader can tell at any line that nothing described here exists yet, and which statements are design choices awaiting review.
- The transition to implemented is a recorded change, not a gradual drift of wording.

**Negative**:

- Wording is heavier ("MUST", "Planned", "specified") than a reader of product documentation expects.
- Two trees in the prospective state must transition in a coordinated way.

**Trade-off accepted**: heavier wording, in exchange for a specification that never reads as evidence before evidence exists.

## References

- Decisions: [ADR-GX-002](../decisions/002-own-tree-and-gx-series.md), [ADR-GX-025](../decisions/025-core-version-range.md), [ADR-GX-027](../decisions/027-claims-and-non-claims.md), [ADR-GX-028](../decisions/028-checker-copy-and-adapt.md)
- Core: [ADR-BR-034](../../core/decisions/034-gxp-companion-scope.md), [ADR-BR-035](../../core/decisions/035-evidence-from-executed-tests.md), [ADR-BR-036](../../core/decisions/036-prospective-specification.md)
- External: GAMP 5 (second edition), specification before build.
