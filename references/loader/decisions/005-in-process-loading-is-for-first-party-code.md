# ADR-LD-005: In-process loading is for first-party code; other code is fetched for out-of-process guests

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-LD-ADR-005                                           |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.1 (2026-11-08): Initial draft (CCR-LD-001)                 |

---

## Context

Core runs plugins in the host's process and states that realms are not isolation ([ADR-BR-019](../../core/decisions/019-realms-are-resolution-namespaces.md)) and that it provides no sandbox ([ADR-BR-027](../../core/decisions/027-core-exclusions.md)). A loader that verifies signatures can make it tempting to evaluate a partner's signed code next to the host, as if a signature were containment. The architecture review that led to this companion fixed the rule that third-party code never runs in-process: it runs out of process behind a proxy plugin (references/remote/).

## Decision

- `Loader.load` evaluates code in the host's process and is documented as being for the application's own first-party and system plugins ([06 — Limits and Acceptance](../behaviors/06-limits-and-acceptance.md), BEH-LD-041).
- `Loader.fetchVerified` runs the same verification and returns bytes without evaluating them, for `@bridger/remote` to run as a guest out of process ([05 — Catalog and Lazy Loading](../behaviors/05-catalog-and-lazy-loading.md), BEH-LD-039).
- The loader states its limits: no reclamation of evaluated code, one evaluation per digest per process, no control of code fetched at run time, and resident revoked code reported until restart (BEH-LD-012, BEH-LD-031, BEH-LD-042).

## Alternatives considered

- **Evaluate signed third-party code in-process.** Rejected: a signature establishes who vouched for the code, not what it can reach.
- **An in-process "sandbox" (a `vm` context, a frozen realm).** Rejected: not a containment boundary for hostile code in the same process, and claiming one is worse than stating none exists.
- **Separate packages for in-process loading and guest fetching.** Rejected: verification, policy and revocation are identical; one package keeps them one implementation.

## Consequences

**Positive**:

- Partners' bundles are signed and revocable exactly like first-party packages, and are contained by the remote companion's process boundary.
- The loader's documentation cannot be read as promising isolation.

**Negative**:

- Applications need the remote companion for any third-party code.
- Long-running hosts accumulate resident modules and need scheduled restarts.

**Trade-off accepted**: verification for all code, in-process evaluation only for first-party code, rather than one path that would treat a signature as a boundary.

## References

- Behaviours: [02 — Load Pipeline](../behaviors/02-load-pipeline.md), [05 — Catalog and Lazy Loading](../behaviors/05-catalog-and-lazy-loading.md), [06 — Limits and Acceptance](../behaviors/06-limits-and-acceptance.md)
- Core: [ADR-BR-019](../../core/decisions/019-realms-are-resolution-namespaces.md), [ADR-BR-027](../../core/decisions/027-core-exclusions.md), [RSK-BR-013](../../core/gxp/03-risk-assessment.md#rsk-br-013)
- Companion: [references/remote/](../../remote/README.md) (RM)
