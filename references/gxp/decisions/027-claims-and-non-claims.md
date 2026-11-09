# ADR-GX-027: Claims and non-claims of the companion

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-GX-ADR-027                                           |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-GX-03 §5)           |
> | Approved by    | — (pending; single maintainer, see PROC-GX-03 §5)            |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.2 (2026-11-09): Claims follow the sink that never refuses a record and sealing by `@bridger/audit-chain`; inherited non-claim 5 as worded in ADR-BR-034 revision 0.7 (F-02, C-09) (CCR-GX-002)<br>0.1 (2026-10-03): Initial draft (CCR-GX-001)                 |

---

## Context

A companion for regulated users invites over-claiming: a trail store becomes "durable", a check becomes "verified", a hash chain becomes "tamper-proof", a pack becomes "validation". Each such word moves a responsibility from the regulated user to the library without the library being able to carry it (RSK-GX-004). [ADR-BR-034](../../core/decisions/034-gxp-companion-scope.md) lists twelve claims no Bridger document may make, with non-claim 5 narrowed by CCR-BR-014 to the exact reach of optional sealing. The companion inherits them and adds its own. This is the one document that names the forbidden words, so the checker can allow them here and only here.

## Decision

**What the companion is specified to do.** Within its prospective status ([ADR-GX-026](../decisions/026-prospective-specification.md)): pass records to a user-supplied store and acknowledge only what the store reports stored; store every record handed to it, keeping a colliding one beside the stored one without overwriting either, and refuse operator changes through a gate piece rather than refuse a record; report findings of named kinds on read; report tail loss below an anchor and, with sealing on, changes to sealed records before the last verified anchor; refuse a gated call that holds no valid, unconsumed, separately signed binding with an equal digest; record each signature with its manifestation and attestation; compute keyed fingerprints for allow-listed paths; and assemble IQ/OQ evidence from executed tests, with gaps shown.

**Inherited non-claims.** Non-claims 1–12 of ADR-BR-034 apply to `@bridger/gxp` as written there, including non-claim 5 as narrowed: `@bridger/core` provides no tamper evidence; the optional sealing, specified by `@bridger/audit-chain` and adopted by the companion ([ADR-GX-029](./029-sealing-through-audit-chain.md)), detects alteration, insertion, removal or reordering of sealed records up to the last verified anchor, only against a party that cannot also rewrite the separately held anchor store; no Bridger package prevents tampering or calls a trail tamper-proof.

**Companion non-claims.** In addition, no companion document may state that the companion:

13. establishes that a trail is whole, unaltered or has integrity — checks on read report "no findings of the checked kinds" over a stated range, and nothing more ([ADR-GX-007](../decisions/007-checks-never-claim-integrity.md));
14. detects anything with sealing or high-water marks when the anchor store is under the same custody as the trail, or after the last verified anchor; the companion cannot check custody ([ADR-GX-008](../decisions/008-high-water-anchors.md), [ADR-GX-029](../decisions/029-sealing-through-audit-chain.md));
15. shows that a store commits what it reports stored, beyond the conformance cases executed against it ([ADR-GX-006](../decisions/006-conformance-through-testhost.md));
16. verifies a signer's identity, their re-authentication, the distinctness of their identification components, or that two distinct identifiers are two people ([ADR-GX-015](../decisions/015-separation-of-duties.md), [ADR-GX-016](../decisions/016-signature-port-and-manifestation.md));
17. makes a signature or an approval legally binding, or provides non-repudiation;
18. hides a value from the holder of the fingerprint key, or hides a low-entropy value at all; or manages, stores, backs up or rotates keys ([ADR-GX-017](../decisions/017-hmac-through-the-core-port.md)–[ADR-GX-019](../decisions/019-key-provider-and-rotation.md));
19. qualifies or validates a system: an evidence pack is test evidence for the companion's components in one installation, and "not covered" stays not covered ([ADR-GX-020](../decisions/020-iq-proof-and-probe.md)–[ADR-GX-022](../decisions/022-evidence-pack-format.md));
20. retains or archives records: an archive is a file set the user stores ([ADR-GX-023](../decisions/023-archives-keep-original-bytes.md));
21. supplies the user's procedures (training, access control, change control, deviation handling, periodic review) or replaces them.

**Words.** No companion document may describe the companion, a store, a trail, a seal, a signature or a pack as validated, qualified, compliant, durable, tamper-evident, tamper-proof, intact, immutable, authentic, secure, legally binding or non-repudiable, nor ascribe integrity or non-repudiation to it, nor say that it guarantees anything, except in a sentence that negates the word. The word "tamper-proof" may appear only in this document and on lines listed in `scripts/claims-allowlist.txt`, and only negated. `**Regulatory:**` lines say "supports" and nothing stronger. The GX checker's claims lint enforces this, with no escape words for "companion", "claim" or "responsib…" ([ADR-GX-028](../decisions/028-checker-copy-and-adapt.md)).

**Where the obligations go.** Each non-claim maps to a Consumer row in the companion's compliance matrix and to URS-GX-016, so a user can list what remains theirs.

## Alternatives considered

- **Restate only the core list.** Rejected: signatures, fingerprints and evidence add over-claim risks core does not have.
- **State limits in each behaviour only.** Kept as well, not instead: limits belong beside the behaviour, and a single list is what a reviewer and the lint can check.

## Consequences

**Positive**:

- A reader has one list of what the companion does not do, and every behaviour's wording is checked against it.
- Obligations that stay with the user are explicit and traceable.

**Negative**:

- Product descriptions must stay plain; the lint will fail common marketing phrasing.

**Trade-off accepted**: modest, checkable wording, in exchange for never transferring a regulated responsibility by an adjective.

## References

- Decisions: [ADR-GX-006](../decisions/006-conformance-through-testhost.md)–[ADR-GX-008](../decisions/008-high-water-anchors.md), [ADR-GX-029](../decisions/029-sealing-through-audit-chain.md), [ADR-GX-030](../decisions/030-sink-marks-and-gate-refuses.md), [ADR-GX-015](../decisions/015-separation-of-duties.md)–[ADR-GX-023](../decisions/023-archives-keep-original-bytes.md), [ADR-GX-026](../decisions/026-prospective-specification.md), [ADR-GX-028](../decisions/028-checker-copy-and-adapt.md)
- Risks: [RSK-GX-004](../gxp/03-risk-assessment.md#rsk-gx-004), [RSK-GX-005](../gxp/03-risk-assessment.md#rsk-gx-005), [RSK-GX-020](../gxp/03-risk-assessment.md#rsk-gx-020)
- Core: [ADR-BR-034](../../core/decisions/034-gxp-companion-scope.md), [ADR-BR-036](../../core/decisions/036-prospective-specification.md)
- External: 21 CFR Part 11; EU GMP Annex 11; GAMP 5 (second edition).
