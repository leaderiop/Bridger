# ADR-GX-014: The approval policy denies by default; exemptions are explicit

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-GX-ADR-014                                           |
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

Not every gated operation needs the same approval. Installing a regulated plugin may need two signatures with fingerprints; restarting a reporting plugin may need none. Once a gate is wired, core submits every mutating call to it ([BEH-BR-222](../../core/behaviors/25-operation-gate.md)), and a gate that allows by default turns every forgotten rule into an unapproved change (RSK-GX-011). Exemptions also tend to grow when approvals are costly ([RSK-GX-007](../gxp/03-risk-assessment.md#rsk-gx-007)). One operation needs care of its own: `acknowledgeAuditDegraded` clears the audit latch ([BEH-BR-206](../../core/behaviors/23-audit-sink-and-record.md)), and if it requires a ticket from a ticket store that is down, nothing can be changed until the store returns ([RSK-GX-010](../gxp/03-risk-assessment.md#rsk-gx-010)).

## Decision

- **Rules keyed by operation and target.** An `ApprovalPolicy` is `{ v: 1, name, version, rules, defaults }`, where `rules` is an ordered list `{ id, operations, target?: { id?: Pattern, realm?: Pattern }, decision, ... }`; a `Pattern` is an exact string or a `*`-glob. The first rule whose operations and target match applies. Rule ids are unique; a rule that an earlier rule always shadows is reported as a warning in the installation evidence.
- **Deny by default.** A call that matches no rule requires a ticket under the policy's explicit `defaults` requirements; the default is never "allow", and the companion never fills in an omitted field. There is no option that changes the default.
- **What a ticket rule sets.** `signatures: n` (1 to 5), `meanings` (`{ code, text }`, one per signature, from the user's list), `validity` (the longest ticket window, at most 30 days), `bindReason`, `requireDigest` (the request must carry `definition.digest`), `requireFingerprints` (every changed path must carry a fingerprint).
- **Exemptions are explicit.** A rule `{ decision: "exempt", justification }` lets matching calls through without a ticket. `justification` is required, at least 20 characters. An exempt allow is recorded before it is returned: the gate appends `exempted { hostId, correlationId, operation, target, ruleId, policyDigest }` to the ticket store, and refuses if that append fails.
- **A policy digest.** `policyDigest = "sha256:" + hex(SHA-256(JCS(policy)))`, with `validity` normalised to milliseconds. The gate appends `policy-activated { hostId, policyDigest, deadlineMs }` when `ApprovalGateLink.attach(host)` attaches it, and every `consumed` and `exempted` event carries it. IQ records the digest of the installed policy ([ADR-GX-020](../decisions/020-iq-proof-and-probe.md)), so a policy change between qualification and use is visible.
- **`acknowledgeAuditDegraded` is a deliberate rule.** Policy construction fails unless one rule names `acknowledgeAuditDegraded` explicitly, either requiring a ticket or exempting it with a justification. The user chooses, in writing, between "the latch needs an approval" and "the latch can be cleared while the ticket store is down".
- **Pure and inspectable.** A policy is plain data, checked once when `GxpLayer.make` builds the gate and fixed for the gate's life; its rule evaluation is pure, and the installation evidence prints every rule, exemption and justification for review.

## Alternatives considered

- **Allow by default, require approval on listed operations.** Rejected: an operation added in a later core release, or a forgotten target, would be unapproved without anyone deciding so.
- **Exemptions without a recorded event.** Rejected: an exempt change would leave a core record with no trace that the policy, and which rule, allowed it.
- **Most-specific-match instead of first-match.** Rejected: specificity between globs is hard to read in review; first-match in a reviewed order is what the reviewer sees.

## Consequences

**Positive**:

- Every allowed call is either tied to a consumed binding or to a recorded exemption naming its rule and policy digest.
- The latch acknowledgement is a decision the user has written down, not a side effect of a default.

**Negative**:

- A new policy must cover every operation that should not need a ticket, which takes review effort.
- An exempt call depends on the ticket store being writable; a user who wants exempt calls to survive a ticket-store outage has to run that store accordingly.

**Trade-off accepted**: explicit rules and recorded exemptions, in exchange for no change being allowed by an omission.

## References

- Behaviours: [08 — Approval policy](../behaviors/08-approval-policy.md), [12 — Approval gate](../behaviors/12-approval-gate.md)
- Invariants: [INV-GX-003](../invariants.md#inv-gx-003-an-allowed-call-holds-a-valid-binding-with-an-equal-digest), [INV-GX-011](../invariants.md#inv-gx-011-every-port-failure-on-a-decision-path-refuses)
- Risks: [RSK-GX-007](../gxp/03-risk-assessment.md#rsk-gx-007), [RSK-GX-010](../gxp/03-risk-assessment.md#rsk-gx-010), [RSK-GX-011](../gxp/03-risk-assessment.md#rsk-gx-011)
- Decisions: [ADR-GX-010](../decisions/010-sign-first-then-call.md), [ADR-GX-012](../decisions/012-binding-contents.md), [ADR-GX-020](../decisions/020-iq-proof-and-probe.md)
- Core: [ADR-BR-032](../../core/decisions/032-operation-gate.md), [BEH-BR-206](../../core/behaviors/23-audit-sink-and-record.md), [BEH-BR-222](../../core/behaviors/25-operation-gate.md)
