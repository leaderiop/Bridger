# ADR-RM-005: Per-call capability tokens; guests reach granted contracts only

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-RM-ADR-005                                            |
> | Revision       | 0.5                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.5 (2026-11-10): Specification audit of 2026-11-10 (SPEC-AUDIT-04) — the callback admission order includes steps 4a (placement) and 4b (budget) of BEH-RM-043 (PL17) (CCR-RM-007)<br>0.4 (2026-11-09): Specification audit of 2026-11-09 (F-07): identity claims cross only when the link discloses them, default none; the earlier always-send reading recorded as a rejected alternative (CCR-RM-004)<br>0.3 (2026-11-08): resolutions of the agent review of 2026-11-08 — tokens carry core-encoded wire annotations, not labels; the core policy decides through the host's own capture; admission by actor in a companion `CallbackAdmission` with `CallbackDenied` (R3-10, R3-11) (CCR-RM-002)<br>0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-RM-001)<br>0.1 (2026-11-08): Initial draft (CCR-RM-001)                 |

---

## Context

A guest serving a call often needs host services. Giving it the host, or a
session-long credential, would give ambient authority: any service, at any
time, for any actor. The core plans a `CapabilityPolicy` port with
`Grant.of(Key, { methods })` and a `CallLog` port ([core behaviour 29](../../core/behaviors/29-capability-grants-and-call-log.md),
BEH-BR-273–278), and an annotation bag on `OperationContext` (core behaviour
30, BEH-BR-289–295). These core seams are registered as CCR-BR-018.

## Decision

- The link mints one **token per host-to-guest call** (actor, `onBehalfOf`,
  the caller's "wire" annotations encoded by core, correlation, plugin ID,
  realm, version, digest, contract version, epoch, call ID, grant digest,
  issued, expires ≤ the call's deadline). The token dies when the call ends.
- The token stays on the host. The `call` frame carries a copy of the link
  claims (plugin ID, realm, version, contract version) and, of the identity
  claims (actor, `onBehalfOf`, organisation, correlation), **only those the
  link lists in `disclose`; the default is none** (CCR-RM-004). A link that
  discloses is recorded as a data transfer to its peer (`LinkStatus`, the
  session log, and the call log once core can carry it).
- Tokens are minted and checked through a `TokenAuthority` port; the default
  is an in-process table of opaque references. Bridger implements no
  signature scheme.
- A callback is admitted by epoch, revocation, token, duplicate check, the
  residency label against the link's transport (step 4a), the
  `PrincipalBudget` when one is provided (step 4b), the link's static grants
  and an optional companion `CallbackAdmission` (the only place an actor is
  judged), in that order (BEH-RM-043); it then reaches the service with
  `Host.use`, whose capture is where the core `CapabilityPolicy` decides,
  with the link as consumer (core BEH-BR-273). Every crossing is offered to
  the core `CallLog`.
- The guest receives typed clients for granted contracts and methods only.
  Egress is just another granted contract.
- Revocation refuses at the boundary at once; removal is a separate core
  operation.

## Alternatives considered

- **Session-scoped credentials.** Rejected: a guest could act for one actor
  under another call's authority, and after the call ended.
- **Bundled cryptographic tokens.** Rejected: key custody and algorithms are
  deployment decisions ([ADR-BR-027](../../core/decisions/027-core-exclusions.md)).
- **Policy only, no static grants.** Rejected: a link definition could not be
  read on its own to see what it may reach.
- **Send every identity claim with every call** (revisions up to 0.3).
  Rejected by CCR-RM-004: a guest or peer that receives user identities
  becomes a processor of them, which is the application's decision per
  link, as the MCP companion already treats it (BEH-MC-022); and the partner
  documentation said a guest receives no user identity. Host-side controls
  read the token and lose nothing.
- **Keep sending them and change the documentation.** Rejected: it makes
  every partner a processor of every caller's identity by default.

## Consequences

**Positive**: every guest action is attributable to a call and an actor, and
limited by both the definition and the application's policy.

**Negative**: a guest cannot act outside a call (no webhooks, no timers on
the guest); such work enters through a host plugin that calls the guest.

**Trade-off accepted**: no guest-initiated work, for no ambient authority
through Bridger. A guest that must know whom it serves gets that only when
the integrator discloses it, link by link.

## References

- Behaviours: [06](../behaviors/06-capability-tokens-and-call-log.md), [BEH-RM-014](../behaviors/02-sessions-and-epochs.md), [BEH-RM-036](../behaviors/05-guest-serve.md)
- Invariants: [INV-RM-007](../invariants.md#inv-rm-007-a-guest-reaches-only-granted-contracts-under-a-live-token), [INV-RM-012](../invariants.md#inv-rm-012-a-call-carries-no-identity-claim-its-link-did-not-disclose)
- Claims on the wire: [BEH-RM-024](../behaviors/03-remote-calls.md); risk [RSK-RM-016](../risks.md#rsk-rm-016)
- Core decisions: [ADR-BR-027](../../core/decisions/027-core-exclusions.md), [ADR-BR-033](../../core/decisions/033-no-config-values-in-audit.md)
