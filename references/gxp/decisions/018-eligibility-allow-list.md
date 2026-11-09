# ADR-GX-018: Fingerprint eligibility is an allow-list, deny by default

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-GX-ADR-018                                           |
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

Core asks the fingerprinter which paths to fingerprint before handing over any value ([ADR-BR-039](../../core/decisions/039-config-fingerprint-port.md)); a path the port does not select never leaves core. That makes selection the companion's main exposure control. A fingerprint is a keyed MAC ([ADR-GX-017](../decisions/017-hmac-through-the-core-port.md)): anyone who can obtain fingerprints for chosen inputs, or who holds the key, can test guesses. For a value with few possible states (a PIN, a short password, a boolean feature flag that is secret, an enum of four account names), testing every guess is cheap, so a fingerprint of it reveals the value to that party (RSK-GX-012). Some paths also carry secrets whose exposure to any extra code is unwanted, whatever their entropy.

## Decision

- **An allow-list.** `eligibility` is `{ v: 1, entries }`, each entry `{ pluginId, realm?, path, form?: "raw" | "decoded", entropy: "high" | "public", note }`: `pluginId` and `realm` are exact or use `*` for any run of characters, a `path` segment `*` matches exactly one segment, and `note` states why the path is eligible. `select` returns the candidate paths that match an entry for the target plugin, realm and form, in candidate order, without duplicates. Everything else is denied; an empty list selects nothing and core then carries paths only.
- **Two admissible kinds of value.** `entropy: "public"` marks values that are not secret (a version, a URL without credentials, a numeric limit), where the fingerprint is a compact, comparable stand-in. `entropy: "high"` marks secrets generated with at least 128 bits of entropy (generated API keys, random tokens). The user asserts the kind; the companion cannot measure it, so the installation checks print the list (IQ-18) and list the asserted entropy as not executed (IQ-U7) ([ADR-GX-020](../decisions/020-iq-proof-and-probe.md)).
- **Low-entropy secrets are never eligible.** Human-chosen passwords, PINs, passphrases and any secret drawn from a small set have no admissible kind. The list has no `entropy: "low"` value and no override. Approvals involving such values bind to the path only, and the policy rule for them must not set `requireFingerprints` ([ADR-GX-014](../decisions/014-deny-by-default-policy.md)).
- **Denied paths are not an error.** A changed path outside the list is not fingerprinted and the call goes on; if the policy rule requires fingerprints for every changed path, the gate refuses the call with `unbound-config-value`, a reason naming the policy requirement, not the value.
- **Reviewable as data.** `describeEligibility(list)` renders the list for review, and its digest is recorded with the policy digest in IQ.

## Alternatives considered

- **A deny-list of secret paths.** Rejected: a new secret path added to a plugin's schema would be fingerprinted until someone noticed.
- **Fingerprint everything and rely on the key.** Rejected: every value, including low-entropy secrets, would pass through the port and become testable by the key holder.
- **Detect low entropy automatically.** Rejected: entropy is a property of how a value was generated, not of the string, and a heuristic would be wrong in both directions.

## Consequences

**Positive**:

- A secret reaches the fingerprinter only when someone listed its path and asserted its kind.
- The exposure surface is one reviewed list, not a property spread over plugin schemas.

**Negative**:

- Each new path that should be bound must be added to the list; until then approvals bind to its path only.
- The entropy kind is an assertion; a wrongly marked low-entropy secret is exposed to the key holder ([RSK-GX-012](../gxp/03-risk-assessment.md#rsk-gx-012)).

**Trade-off accepted**: maintaining an explicit list, in exchange for no value being fingerprinted by omission.

## References

- Behaviours: [13 — Config fingerprints](../behaviors/13-config-fingerprints.md)
- Invariants: [INV-GX-005](../invariants.md#inv-gx-005-no-configuration-value-or-key-material-appears-in-any-companion-output)
- Risks: [RSK-GX-012](../gxp/03-risk-assessment.md#rsk-gx-012), [RSK-GX-014](../gxp/03-risk-assessment.md#rsk-gx-014)
- Decisions: [ADR-GX-014](../decisions/014-deny-by-default-policy.md), [ADR-GX-017](../decisions/017-hmac-through-the-core-port.md), [ADR-GX-020](../decisions/020-iq-proof-and-probe.md)
- Core: [ADR-BR-033](../../core/decisions/033-no-config-values-in-audit.md), [ADR-BR-039](../../core/decisions/039-config-fingerprint-port.md), [RSK-BR-024](../../core/gxp/03-risk-assessment.md#rsk-br-024)
