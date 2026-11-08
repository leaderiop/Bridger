# ADR-LD-001: Verify before evaluate, and evaluate the verified bytes

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-LD-ADR-001                                           |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.2 (2026-11-08): `LoaderGate` described as a core gate piece built before the host (CCR-LD-002)<br>0.1 (2026-11-08): Initial draft (CCR-LD-001)                 |

---

## Context

Core accepts any `PluginDefinition`, including one produced by a dynamic `import()`, and leaves fetching and verifying to an optional loader ([ADR-BR-027](../../core/decisions/027-core-exclusions.md), core [BEH-BR-008](../../core/behaviors/01-plugin-definition.md#beh-br-008-a-plugin-entry-has-no-import-time-side-effects)). In JavaScript, evaluating a module runs its top-level code; a check performed after `import()` returns is a check performed after the code ran. And a check performed on a file that is then imported by path leaves a window in which the file can change.

## Decision

- The loader's pipeline is fixed: fetch, check paths and digests, compare the expected digest, evaluate the acceptance rule (signatures or pinned digests), check revocation, run the application's predicates, and only then evaluate ([02 — Load Pipeline](../behaviors/02-load-pipeline.md), BEH-LD-009).
- No option, flag or overload skips a verification step. Unsigned development loading is expressed as a pinned-digest rule.
- The evaluator evaluates from the bytes held after verification, never re-reads the source, and resolves imports only to the package's own files or to application-supplied externals (BEH-LD-011).
- Every verification failure, timeout or defect is a refusal (BEH-LD-013). When a `LoadLog` is wired, code is not evaluated if its acceptance cannot be recorded (BEH-LD-016).
- The loader never installs. It returns a stamped definition; the host's operator call installs it, attributed, gated and audited by core (BEH-LD-014). A core gate piece, `LoaderGate`, built before the host over a shared store of accepted digests, lets a deployment refuse installs whose digest the loader did not accept, and operator restarts of revoked digests (BEH-LD-015).

## Alternatives considered

- **Import, then check the exported definition's `meta.digest`.** Rejected: the code has already run, and the label is whatever the module says.
- **Verify the file on disk, then `import()` it by path.** Rejected: time-of-check to time-of-use; anything able to write the path decides what runs.
- **A "skip verification in development" flag.** Rejected: flags reach production; pinning the developer's own build digest serves the same need.
- **The loader installs into the host directly.** Rejected: it would be a second path for changing the plugin set, and the place where shortcuts accumulate.

## Consequences

**Positive**:

- The central property — no unverified byte is evaluated — is testable with a recording evaluator.
- Installation keeps one path, the host's, with core's records and gate.

**Negative**:

- A runtime-specific evaluator is needed per platform (Node.js, browser, worker), and evaluating from memory is less convenient than importing a path.
- Every load pays for digest computation and signature verification, even of resident code.

**Trade-off accepted**: a fixed, slower pipeline with no bypass, rather than a fast one whose checks can be skipped.

## References

- Behaviours: [01 — Package and Digest](../behaviors/01-package-and-digest.md), [02 — Load Pipeline](../behaviors/02-load-pipeline.md), [03 — Signature Policy](../behaviors/03-signature-policy.md)
- Invariants: [INV-LD-001](../invariants.md#inv-ld-001-no-code-is-evaluated-before-its-digest-and-signatures-are-accepted), [INV-LD-002](../invariants.md#inv-ld-002-the-evaluated-bytes-are-the-verified-bytes)
- Core: [ADR-BR-027](../../core/decisions/027-core-exclusions.md), [ADR-BR-032](../../core/decisions/032-operation-gate.md), [RSK-BR-017](../../core/gxp/03-risk-assessment.md#rsk-br-017)
