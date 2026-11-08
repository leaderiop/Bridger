# ADR-LD-003: An N-of-M signature policy over verifier adapters, with no default

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-LD-ADR-003                                           |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.2 (2026-11-08): Distinct signer entries are not necessarily distinct people (CCR-LD-002)<br>0.1 (2026-11-08): Initial draft (CCR-LD-001)                 |

---

## Context

A release process that requires a publisher's signature and an independent reviewer's countersignature ("double signing") must be expressible, and so must a simple "any two of these three maintainers". Signature schemes differ: some deployments pin Ed25519 keys on devices that are often offline; others use Sigstore identities with a transparency log. Core's own precedent ([ADR-BR-032](../../core/decisions/032-operation-gate.md)) refuses to ship a permissive default control.

## Decision

- What is signed is a statement the loader builds from what it computed: package digest, id and version ([03 — Signature Policy](../behaviors/03-signature-policy.md), BEH-LD-017).
- Each scheme is a verifier adapter that returns the trusted signer a signature verified against; Ed25519 verifies against pinned keys, Sigstore against a pinned root and identity with an inclusion proof carried in the bundle (BEH-LD-018).
- A policy is a requirement tree of thresholds, role thresholds and `allOf`, satisfied by an assignment in which no signer is counted twice anywhere in the tree (BEH-LD-020). Policy evaluation is pure; every verified signer is recorded, so the policy can be re-evaluated when a signer is revoked.
- There is no default rule and no rule that accepts everything; unsigned loading is a list of pinned digests (BEH-LD-022). Trust roots are configuration, changed only by replacing the loader (BEH-LD-023).

## Alternatives considered

- **A single signature.** Rejected: it cannot express double signing, and one stolen key suffices.
- **Count signatures rather than signers.** Rejected: one key signing twice would meet a threshold of two.
- **Let one signer satisfy several role branches.** Rejected: a signer entry that holds both the publisher and the reviewer role would double-sign alone. Counting distinct entries does not make them distinct people; one person holding two listed keys is excluded only by the application's trust configuration (BEH-LD-020).
- **Trust keys carried in the signature or the package.** Rejected: material fetched from the place it judges judges nothing.
- **A permissive development policy.** Rejected for the reason core gives for its gate.

## Consequences

**Positive**:

- Double signing, thresholds and scheme diversity are one mechanism; adding a scheme is an adapter.
- Signer revocation is exact (BEH-LD-030).

**Negative**:

- Applications must manage keys, identities and roots themselves.
- An offline Sigstore check cannot learn of later certificate problems; revocation lists cover that.

**Trade-off accepted**: an explicit, application-owned trust configuration with no defaults, at the cost of setup work, rather than a loader that trusts something on the application's behalf.

## References

- Behaviours: [03 — Signature Policy](../behaviors/03-signature-policy.md), [04 — Revocation and Kill Switch](../behaviors/04-revocation-and-kill-switch.md)
- Invariants: [INV-LD-006](../invariants.md#inv-ld-006-no-load-without-an-explicit-acceptance-rule)
- Core: [ADR-BR-032](../../core/decisions/032-operation-gate.md), [RSK-BR-017](../../core/gxp/03-risk-assessment.md#rsk-br-017)
- External: RFC 8032 (Ed25519); RFC 8785 (JSON Canonicalization Scheme); DSSE envelope; Sigstore bundle format.
