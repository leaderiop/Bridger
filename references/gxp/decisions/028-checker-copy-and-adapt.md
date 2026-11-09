# ADR-GX-028: The traceability checker is copied and adapted from core's

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-GX-ADR-028                                           |
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

Core's `references/core/scripts/verify-traceability.sh` keeps the core tree consistent with fourteen checks: registries, traceability of invariants and decisions, URS sections, risks, allocations, identifier uniqueness and contiguity, behaviour structure, Document Control, planned paths, REQ identifiers, a claims lint, links and anchors, the CCR register, and SPEC.md coverage. The companion tree ([ADR-GX-002](../decisions/002-own-tree-and-gx-series.md)) needs the same discipline plus checks that only arise across trees: links into `../core`, core identifiers it relies on, and test vectors. A shared engine for both trees would be cleaner, but changing core's script now would put core's checker under a companion change.

## Decision

- **Copy, then adapt.** `references/gxp/scripts/verify-traceability.sh` starts as a copy of core's script. Patterns use `-GX-`; directories and files are read from the `index.yaml` files (`package: bridger-gxp, infix: GX`). A shared engine is deferred to a later CCR on both sides (a CCR-GX with a CCR-BR cross-reference).
- **Checks 1–11 carried over, adapted.**
  1. `index.yaml` registries list exactly the files present.
  2. Every INV-GX and ADR-GX has a row in traceability; every ADR-GX has the same status in its Document Control and in `decisions/index.yaml`.
  3. Every URS-GX and NFR-GX appears in the URS traceability section.
  4. Every RSK-GX cites at least one defined BEH-GX or INV-GX as its control and has a row in traceability.
  5. Allocations: every compliance-matrix allocation is `Core`, `Companion`, `Consumer`, `N/A` or a `+`-joined combination, and every cited GX identifier is defined.
  6. Identifiers are unique, within their allocated blocks (BEH-GX eight per file, sixteen in file 20) and contiguous.
  7. Behaviour structure: heading, reference blockquote, at least one `REQUIREMENT:` block with RFC 2119 capitals.
  8. Document Control: all nine rows, an allowed status, and no `Effective` or `Accepted` while the implementation is absent.
  9. Planned paths: an absent path must carry *(Planned)* ([ADR-GX-026](../decisions/026-prospective-specification.md)).
  10. REQ-GX identifiers are defined and traced.
  11. Claims lint, stricter than core's: "companion", "claim" and "responsib…" are not escape words; the negation must be in the same sentence; the word list is that of the "Words" paragraph of [ADR-GX-027](../decisions/027-claims-and-non-claims.md) with their forms, as listed in the identifier scheme (§5), a superset of core's; and the hyphenated "tamper" compound ending in "proof" (unlike "tamper-evident") fails even when negated, except in ADR-GX-027 and on lines listed in `scripts/claims-allowlist.txt`.
- **Checks 12–17 are new or changed.**
  12. Links and anchors, including links into `../core/...`, whose target files and GitHub-slug anchors must exist.
  13. CCR references: a CCR-GX must be in this tree's register; a CCR-BR is accepted only if core's register defines it.
  14. Every cited `ADR-BR`, `BEH-BR`, `INV-BR`, `RSK-BR`, `URS-BR`, `NFR-BR` or `REQ-BR` identifier is defined in core and listed in `appendices/core-interface-map.md` ([ADR-GX-025](../decisions/025-core-version-range.md)).
  15. Core's checker is run and must pass, so the companion is never checked against an inconsistent core.
  16. Every `**Regulatory:**` line uses "supports" and no stronger verb.
  17. Test vectors in behaviours 09 (binding digests) and 13 (fingerprints) are recomputed with an independent JCS, SHA-256 and HMAC-SHA256 implementation and must match byte for byte ([ADR-GX-005](../decisions/005-jcs-and-sha256.md), [ADR-GX-012](../decisions/012-binding-contents.md), [ADR-GX-017](../decisions/017-hmac-through-the-core-port.md)).
- **Not carried over.** Core's check 14 (SPEC.md coverage) has no counterpart; the companion has no SPEC.md.
- **Generator.** `scripts/gen-traceability.py` regenerates `traceability.md` from the documents; the checker is run afterwards, and checks 2, 4 and 10 read the regenerated tables.
- **Exit status.** The script exits non-zero on any failed check and prints every failure, not only the first; CI runs it on every change to either tree.

## Alternatives considered

- **Extend core's script with a `--tree gxp` mode.** Rejected for now: it would change core's checker under a companion CCR.
- **Write a new checker from scratch.** Rejected: core's script encodes conventions both trees share; copying keeps them identical where they should be.
- **Skip check 15.** Rejected: a companion check that passes against a core tree that fails its own checks proves little.

## Consequences

**Positive**:

- The companion tree is held to core's discipline, plus the cross-tree checks it needs.
- Vectors in the specification are checked, so a typo in a digest fails the build.

**Negative**:

- Two copies of the same logic can drift until the shared engine exists.
- Check 17 needs a JCS and HMAC implementation in the checker's environment.

**Trade-off accepted**: a duplicated script for a while, in exchange for leaving core's checker untouched by companion work.

## References

- Decisions: [ADR-GX-002](../decisions/002-own-tree-and-gx-series.md), [ADR-GX-005](../decisions/005-jcs-and-sha256.md), [ADR-GX-012](../decisions/012-binding-contents.md), [ADR-GX-017](../decisions/017-hmac-through-the-core-port.md), [ADR-GX-025](../decisions/025-core-version-range.md), [ADR-GX-026](../decisions/026-prospective-specification.md), [ADR-GX-027](../decisions/027-claims-and-non-claims.md)
- Behaviours: [09 — Approval tickets](../behaviors/09-approval-tickets.md), [13 — Config fingerprints](../behaviors/13-config-fingerprints.md)
- Core: [ADR-BR-036](../../core/decisions/036-prospective-specification.md)
- Appendix: [Core interface map](../appendices/core-interface-map.md)
