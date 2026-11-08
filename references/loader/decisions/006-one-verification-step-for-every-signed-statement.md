# ADR-LD-006: One verification step for every signed statement

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-LD-ADR-006                                           |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.2 (2026-11-08): Revocation lists recorded as the one exception, verified by the revocation source under its own trust root with no revocation step; one call shape per reserved type (round-2 agent review R3-01, R3-02) (CCR-LD-003)<br>0.1 (2026-11-08): Initial draft (CCR-LD-003)                 |

---

## Context

The loader's signature policy judged one kind of statement: a package digest with an id and a version ([03 — Signature Policy](../behaviors/03-signature-policy.md)). Other companions needed the same judgement for other bytes and cited a step the loader did not define: the developer-experience kit's `publish` needed a named signing step, and the federation companion needed to verify the bytes of a signed desired-state manifest (core URS gap G56). Reference data shipped as signed data packs and licence tokens need it too. Separately, a manifest's `publisher` label was shown to people without anything tying it to who signed.

## Decision

- Every signed thing is a typed `Statement` about a subject digest; the statement type is part of the signed bytes, so a signature counts only for the type it was made for ([07 — Signed Statements](../behaviors/07-signed-statements.md), BEH-LD-049).
- `SignaturePolicy.verify({ statementType, subject: digest | bytes, … })` is the one verification step. The load pipeline, the catalog, data packs, the kit and the federation companion all call it (BEH-LD-050).
- Each statement type has its own acceptance rule, with no default and no fallback between types (BEH-LD-051).
- One revocation channel covers subject digests, statement digests and signers for every type; readers re-check held statements with the pure `Revocation.check` (BEH-LD-052).
- A manifest's `publisher` must match a verified signer configured for it, otherwise `PublisherMismatch` (BEH-LD-053).
- Signing goes through a `StatementSigner` adapter over `Statement.signingInput`; signatures sit outside every digest, so a countersignature adds a signer entry without changing any digest (BEH-LD-054).
- The revocation set backs core's `RefusalList`, so a revoked digest does not start again whatever starts it (BEH-LD-056).

- **One exception: revocation lists.** A revocation list establishes the revocation set that step 5 of `verify` consults, so it cannot be checked by that step. The revocation source verifies lists with steps 1–4 and 6 of the same implementation, under a revocation trust root given to the source as configuration and kept out of `StatementRules`, with the list's monotonic revision in place of step 5; `verify` refuses the type ("no-rule"). The only source state that enters a list's check is the signer revocations of the list it holds (BEH-LD-026, BEH-LD-050).
- Each reserved type has one fixed subject, `id` and `version` convention and one call shape, and a `SignedStatement` envelope carries other signed things; no companion defines its own request or signature shape (BEH-LD-049, BEH-LD-050).

## Alternatives considered

- **A separate verifier per companion.** Rejected: thresholds, windows, timeouts and revocation would be implemented several times and drift.
- **Untyped statements (digest only).** Rejected: a signature over data could be replayed as a signature over code with the same name.
- **A signing service inside the loader.** Rejected: the loader would hold keys; the adapter keeps key custody with whoever signs.
- **Revocation lists through `verify`, with a revocation-free mode chosen by the caller.** Rejected: any caller could then skip step 5 for any type; keeping the exception inside the revocation source, with its own trust root, confines it to the one type that needs it.
- **Leave `publisher` uninterpreted.** Rejected: a label shown to people as the source of code must say something the trust configuration backs.

## Consequences

**Positive**:

- G56 has a citable step; the kit and federation call the same function the loader uses for packages.
- One revocation channel and one `maxAge` decision for every signed thing.

**Negative**:

- The revocation channel speaks for more than code, which raises the weight of its keys (BEH-LD-032's threshold recommendation applies).
- Applications must configure a rule per statement type they use.

**Trade-off accepted**: one general mechanism with per-type rules, at the cost of more configuration, rather than per-companion verifiers.

## References

- Behaviours: [07 — Signed Statements](../behaviors/07-signed-statements.md), [03 — Signature Policy](../behaviors/03-signature-policy.md), [04 — Revocation and Kill Switch](../behaviors/04-revocation-and-kill-switch.md)
- Invariants: [INV-LD-008](../invariants.md#inv-ld-008-a-signature-counts-only-for-the-statement-type-it-was-made-for)
- Core: [ADR-BR-053](../../core/decisions/053-refusal-list.md), [RSK-BR-043](../../core/gxp/03-risk-assessment.md#rsk-br-043), [RSK-BR-044](../../core/gxp/03-risk-assessment.md#rsk-br-044)
- External: DSSE envelope; RFC 8785 (JSON Canonicalization Scheme).
