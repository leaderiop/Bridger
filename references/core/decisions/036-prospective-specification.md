# ADR-BR-036: This specification is prospective

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ADR-036                                              |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.1 (2026-10-02): Initial draft (CCR-BR-001)                 |

---

## Context

This specification is written before any Bridger code exists. Its style is borrowed from a project (Qadi) whose specification describes code that does exist, where ADRs are Accepted, behaviours name their source files and tests, and documents carry effective dates. Copying that style without adjustment would make a design read like a description of working software: a behaviour would cite `packages/core/src/Host.ts` as if it could be opened, an invariant would appear to be enforced, a compliance matrix would appear to be backed by evidence.

In a GxP context that misreading is not harmless. A regulated reader treats an approved, effective document that names a test as a statement that the test exists and passed ([ADR-BR-035](../decisions/035-evidence-from-executed-tests.md)).

## Decision

Until code and tests exist, the specification is marked and written as prospective.

- **Status.** Every document is `Draft`, Revision `0.1`, Effective Date `— (pending approval)`. Every ADR is `Proposed`. The initial drafts are recorded under change control record `CCR-BR-001`.
- **Review and approval are stated as absent.** Reviewed by and Approved by name no person while there is a single maintainer and no independent reviewer (PROC-03 §5). A status changes only through a recorded review and approval.
- **Planned paths.** Every source or test path is written with the marker *(Planned)*, for example `packages/core/src/Host.ts` *(Planned)*. The marker is removed in the same change that adds the file.
- **Illustrative code.** TypeScript blocks are illustrative and not type-checked; the first block in each file says so on its first line.
- **Verification tolerance.** The specification's verification script under `scripts/` checks identifiers, links and anchors between specification documents strictly. It tolerates the absence of a path marked *(Planned)*, and only of such a path; an unmarked path that does not exist is an error.
- **Nothing is evidence yet.** No requirement, invariant or compliance-matrix row is cited as satisfied, enforced or covered until the code and an executed test exist. Until then the matrix says *specified*, not *met*.
- **Words that claim.** "Effective", "Accepted", "implemented", "ships", "validated", "qualified", "compliant", "tamper-evident" and "durable" appear only negated or scoped to someone other than Bridger (for example "durability is the consumer's responsibility").
- **Transition.** When code lands, each affected document is revised under a new change control record: paths lose *(Planned)*, behaviours gain their test references, and statuses change only after review and approval.

## Alternatives considered

- **Write the specification as if implemented, and fix it later.** Rejected: "later" is when a regulated reader has already relied on it; the predecessor failure in [ADR-BR-028](../decisions/028-gxp-scope.md) began with documentation that described properties the code did not have.
- **Omit paths until code exists.** Rejected: the planned module layout is part of the design and is useful to reviewers; the marker keeps it without asserting it.
- **Mark `Effective` once the single maintainer approves.** Rejected: self-approval is not independent review, and the documents say so rather than imply otherwise.

## Consequences

**Positive**:

- A reader can tell at a glance what is designed and what exists, which is the distinction a regulated reader needs most.
- The transition to a described system is mechanical and auditable: each *(Planned)* marker and each status is a visible item to change.

**Negative**:

- The documents carry markers and hedged wording that make them heavier to read.
- The verification script's tolerance for *(Planned)* paths means a mistyped planned path is not caught until the code lands.
- None of these documents can be used as validation input until the transition happens.

**Trade-off accepted**: heavier, explicitly provisional documents, rather than documents that read as evidence for software that does not yet exist.

## References

- Decisions: [ADR-BR-028](../decisions/028-gxp-scope.md), [ADR-BR-034](../decisions/034-gxp-companion-scope.md), [ADR-BR-035](../decisions/035-evidence-from-executed-tests.md)
- Requirements: [URS-BR-025](../urs.md#urs-br-025-generate-qualification-evidence-from-executed-tests), [URS-BR-026](../urs.md#urs-br-026-know-which-compliance-obligations-remain-mine)
- Risks: [RSK-BR-018](../gxp/03-risk-assessment.md#rsk-br-018)
- GxP documents: [../gxp/02-compliance-matrix.md](../gxp/02-compliance-matrix.md), [../gxp/04-validation-plan.md](../gxp/04-validation-plan.md)
- Process: PROC-03 §5 (review and approval with a single maintainer); NFR-BR-005 (Specification integrity).
- Source: `docs/SPEC.md` — status line ("API proposal for review … No implementation is included").
- External: ISPE GAMP 5 Second Edition (2022), specification and verification life cycle; EU GMP Annex 11 (2011) §4.
