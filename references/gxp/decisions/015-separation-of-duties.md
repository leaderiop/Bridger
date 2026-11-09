# ADR-GX-015: Separation of duties is enforced on actor identifiers

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-GX-ADR-015                                           |
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

An approval is worth something only if someone other than the requester gave it (URS-GX-010). Core identifies the caller by an `Actor { id, kind, display? }` taken from the call's `OperationContext`; it does not authenticate and does not infer identity ([BEH-BR-185](../../core/behaviors/22-attributable-operations.md), [BEH-BR-191](../../core/behaviors/22-attributable-operations.md)). Identifiers that begin with `bridger:` are reserved for the host itself (`bridger:system`, `bridger:unattributed`). A signer's identity reaches the companion through `SignatureCapture` as `signer.id` ([ADR-GX-016](../decisions/016-signature-port-and-manifestation.md)). The companion therefore has two strings to compare, both asserted by the user's own systems.

## Decision

- **Compare identifiers, exactly.** Separation of duties is checked on actor identifiers as strings, compared by code point with no normalisation. The companion does not case-fold, trim or map aliases; a user whose identity system has aliases must resolve them before the identifier reaches core or the signature port.
- **The rules, checked at signing and again at the gate.**
  1. Every `signer.id` differs from the binding's `requester` ([INV-GX-004](../invariants.md#inv-gx-004-the-approver-is-never-the-requester)).
  2. For a rule with `signatures: n > 1`, the `n` signatures on the ticket come from `n` distinct `signer.id`s.
  3. No `signer.id` and no `requester` begins with `bridger:`; a call attributed to `bridger:system` or `bridger:unattributed` never matches a ticket and is refused unless exempt by policy ([ADR-GX-014](../decisions/014-deny-by-default-policy.md)).
  4. At the gate, `request.actor.id` equals the binding's `requester`; this is part of the digest ([ADR-GX-012](../decisions/012-binding-contents.md)). When the call's actor is one of the ticket's signers, or a counted signer is the ticket's requester, the gate refuses with the reason `same-person` rather than the generic `binding-mismatch`, so a reviewer sees why ([BEH-GX-078](../behaviors/10-signature-capture-port.md), [12 — Approval Gate](../behaviors/12-approval-gate.md)).
- **Checked twice.** The issuer refuses to attach a signature that breaks rules 1–3 (the capture fails with `SignatureCaptureFailed` "malformed"), so no ticket the issuer wrote holds one. The gate re-checks rules 1–4 from the stored signatures, so a ticket store written by something other than the issuer cannot bypass them. A failure is the refusal `same-person`.
- **What it does not establish.** The check shows that two different identifier strings appear. It does not show that two different people acted; that depends on the user's identity system and on the re-authentication the signature port attests ([ADR-GX-016](../decisions/016-signature-port-and-manifestation.md)). The companion says so in its API documentation and in the compliance matrix (RSK-GX-008).

## Alternatives considered

- **Compare `display` names or e-mail addresses.** Rejected: they are not identifiers and change over time.
- **Normalise identifiers (lower-case, trim).** Rejected: the companion would decide that two identifiers are the same person, which is the identity system's call; a normalisation bug would be a bypass.
- **Check only at the gate.** Rejected: a ticket that could never be used would sit in the store as a signed approval; refusing at signing keeps the store free of them.

## Consequences

**Positive**:

- No binding is consumed for a call made by one of its signers, and multi-signature rules need distinct signer identifiers.
- Reserved host identifiers can neither request nor approve.

**Negative**:

- Aliases in the user's identity system can defeat the rule; the user owns alias resolution.
- An unauthenticated actor identifier on the call (core does not authenticate) lets a person claim to be someone else; the rule is only as strong as the user's attribution ([RSK-GX-008](../gxp/03-risk-assessment.md#rsk-gx-008)).

**Trade-off accepted**: an exact, checkable rule over identifiers, with its dependence on the user's identity system stated, in exchange for not pretending to know who a person is.

## References

- Behaviours: [10 — Signature capture port](../behaviors/10-signature-capture-port.md), [12 — Approval gate](../behaviors/12-approval-gate.md)
- Invariants: [INV-GX-004](../invariants.md#inv-gx-004-the-approver-is-never-the-requester)
- Risks: [RSK-GX-008](../gxp/03-risk-assessment.md#rsk-gx-008)
- Decisions: [ADR-GX-012](../decisions/012-binding-contents.md), [ADR-GX-014](../decisions/014-deny-by-default-policy.md), [ADR-GX-016](../decisions/016-signature-port-and-manifestation.md)
- Core: [BEH-BR-185](../../core/behaviors/22-attributable-operations.md), [BEH-BR-191](../../core/behaviors/22-attributable-operations.md), [ADR-BR-029](../../core/decisions/029-attributable-mutations.md)
- External: 21 CFR Part 11 §11.10(g); EU GMP Annex 11 §12.
