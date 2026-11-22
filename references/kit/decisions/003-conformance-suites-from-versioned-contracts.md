# ADR-KT-003: Conformance suites are generated from versioned contracts and run cumulatively within a major

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-KT-ADR-003                                           |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.2 (2026-11-22): compatibility includes per-method schema digests (core BEH-BR-228 clause 3b; improvement report 02, R1)<br>0.1 (2026-11-08): Initial draft (CCR-KT-001)                 |

---

## Context

Core checks that a provider's version satisfies a dependent's range and that
method names are present and per-method schema digests are equal
(BEH-BR-228 clause 3b), and compares no schema structure beyond those opaque
digests (BEH-BR-230).
Whether a provider honours the contract is a testing question. Hand-written
suites drift from the contract; suites edited at each release cannot test the
add-only promise.

## Decision

- A suite is bound to one contract version; generated cases come from the
  contract's schemas, author cases carry the version that introduced them
  (BEH-KT-017).
- Suites ship with the contract package, one per version; earlier suites are
  frozen and `bridger check` fails if they change (BEH-KT-021).
- `Conformance.verify` runs every suite of the subject's major up to its
  version (BEH-KT-018), against a mounted plugin or an HTTP endpoint reached
  through the remote companion (BEH-KT-019, BEH-KT-020).
- Reports state executed counts only (BEH-KT-022).
- The export is `Conformance.verify`; core's `Contract` namespace is not
  extended.

## Alternatives considered

- **Only the latest suite.** Rejected: it would not test that 2.3 still keeps
  2.0's promises.
- **Schema comparison only (no behaviour cases).** Rejected: schemas cannot
  express ordering or effects.

## Consequences

**Positive**: the same suite runs against a proxy plugin and against the
partner's endpoint; the add-only rule becomes testable.

**Negative**: contract packages grow with every version; generated cases
depend on schema-derived arbitraries, which Effect marks unstable.

**Trade-off accepted**: larger contract packages for a testable evolution
rule.

## References

- Behaviours: [03](../behaviors/03-conformance-kits.md), [BEH-KT-028](../behaviors/04-cli.md#beh-kt-028-check-finds-a-second-copy-of-effect-and-breaking-contract-changes)
- Core: [26 — Versioned contracts](../../core/behaviors/26-versioned-contracts.md)
- Invariants: [INV-KT-005](../invariants.md#inv-kt-005-a-conformance-pass-comes-only-from-executed-cases)
