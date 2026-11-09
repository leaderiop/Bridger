# ADR-GX-010: Approval is signed before the call; the gate only checks a ticket

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-GX-ADR-010                                           |
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

Core consults a wired `OperationGate` once per mutating call (once per entry action for `reconcile`), after attribution, validation and fingerprints and before any record ([BEH-BR-218](../../core/behaviors/25-operation-gate.md)). `authorize` is bounded by `gateTimeout` (default 60 seconds); a gate that fails, hangs or is abandoned is a refusal, and a refusal changes nothing and leaves one `rejected` record ([BEH-BR-220](../../core/behaviors/25-operation-gate.md), [BEH-BR-221](../../core/behaviors/25-operation-gate.md)). Core names the gate as the seam for approvals and electronic signatures ([BEH-BR-224](../../core/behaviors/25-operation-gate.md)).

Two shapes are possible. In the first, the gate itself asks a person to sign while the call waits. In the second, the approval is gathered beforehand, stored as a ticket, and the gate only checks it.

## Decision

- **Sign first.** An approval is a ticket ([ADR-GX-013](../decisions/013-single-use-tickets.md)) issued with one or more bindings ([ADR-GX-012](../decisions/012-binding-contents.md)) and signed through the `SignatureCapture` port ([ADR-GX-016](../decisions/016-signature-port-and-manifestation.md)) before the operation is called. Issuing and signing happen outside the host, in the user's own workflow, at whatever pace people need.
- **Then call.** The requester calls the host operation with `correlationId` set to the ticket id ([ADR-GX-011](../decisions/011-ticket-cited-by-correlation-id.md)) and the same attribution as the binding.
- **The gate only checks.** `approvalGate({ policy, tickets, scope })` provides `OperationGate` and `ApprovalGateLink` ([BEH-GX-089](../behaviors/12-approval-gate.md)). Its `authorize` performs, in order: policy lookup, ticket lookup, state and time window, binding digest recomputed from the request, separation of duties, consume by compare-and-set, allow. It never prompts a person, never calls `SignatureCapture`, never issues or extends a ticket, and never caches a decision between calls.
- **An internal deadline below `gateTimeout`.** The gate runs its steps under its own deadline, `deadline`, fixed when `ApprovalGateLink.attach(host)` reads the host's `gateTimeout` from `Host.controls` ([BEH-BR-013](../../core/behaviors/02-host-construction.md)) right after the host is built. The default is `gateTimeout` minus 5 seconds, and `attach` fails with `GateAttachFailed` "deadline-too-long" when that leaves less than 1 second; an explicit `deadline` must be at least 1 second and at least 1 second shorter than `gateTimeout`, or `attach` fails the same way ([BEH-GX-094](../behaviors/12-approval-gate.md#beh-gx-094-the-gate-decides-under-its-own-deadline-set-below-the-hosts-gatetimeout)). Until it is attached the gate refuses every request. When the deadline passes, the gate itself refuses with `ticket-store-unavailable`, so the `rejected` record carries the companion's precise reason rather than core's generic timeout. With `gateTimeout: "forever"`, `deadline` is required (`attach` otherwise fails with "deadline-required"), and the IQ check reports a deviation ([ADR-GX-020](../decisions/020-iq-proof-and-probe.md)).
- **Refusals are reasons, not exceptions.** Every negative outcome is a refusal with one of the reason tags defined in [12 — Approval gate](../behaviors/12-approval-gate.md), from `no-ticket` to `ticket-store-unavailable`. A port failure on this path refuses ([INV-GX-011](../invariants.md#inv-gx-011-every-port-failure-on-a-decision-path-refuses)).

## Alternatives considered

- **Capture the signature inside `authorize`.** Rejected: a person's response time would be bounded by `gateTimeout`, a slow signer would turn into a refusal, and the host's single writer would wait on a human. It would also make the gate a user interface.
- **Raise `gateTimeout` to "forever" and wait for a signature.** Rejected: a hung approval would hold a mutation open indefinitely, and IQ treats a non-finite gate deadline as a deviation.
- **Let the gate allow and record the approval afterwards.** Rejected: the change would happen before the approval exists, which is the opposite of approving a change before it is made (URS-GX-006).

## Consequences

**Positive**:

- The gate's work is a few store reads and one compare-and-set, well inside its deadline (NFR-GX-008).
- People sign at their own pace; a call made without a valid ticket is refused at once, with a reason, and recorded by core.

**Negative**:

- Two steps for the user instead of one: issue and sign, then call. A call whose attribution or content differs from the binding is refused and needs a new ticket.
- A slow ticket store produces refusals ([RSK-GX-021](../gxp/03-risk-assessment.md#rsk-gx-021)); the deadline makes them precise, not fewer.

**Trade-off accepted**: a two-step workflow, in exchange for a gate that decides quickly, never waits on a person and records why it refused.

## References

- Behaviours: [09 — Approval tickets](../behaviors/09-approval-tickets.md), [12 — Approval gate](../behaviors/12-approval-gate.md)
- Invariants: [INV-GX-003](../invariants.md#inv-gx-003-an-allowed-call-holds-a-valid-binding-with-an-equal-digest), [INV-GX-011](../invariants.md#inv-gx-011-every-port-failure-on-a-decision-path-refuses)
- Risks: [RSK-GX-010](../gxp/03-risk-assessment.md#rsk-gx-010), [RSK-GX-021](../gxp/03-risk-assessment.md#rsk-gx-021)
- Decisions: [ADR-GX-011](../decisions/011-ticket-cited-by-correlation-id.md), [ADR-GX-012](../decisions/012-binding-contents.md), [ADR-GX-013](../decisions/013-single-use-tickets.md), [ADR-GX-016](../decisions/016-signature-port-and-manifestation.md), [ADR-GX-020](../decisions/020-iq-proof-and-probe.md)
- Core: [ADR-BR-032](../../core/decisions/032-operation-gate.md), [BEH-BR-013](../../core/behaviors/02-host-construction.md), [BEH-BR-218](../../core/behaviors/25-operation-gate.md), [BEH-BR-220](../../core/behaviors/25-operation-gate.md), [BEH-BR-221](../../core/behaviors/25-operation-gate.md), [BEH-BR-224](../../core/behaviors/25-operation-gate.md)
