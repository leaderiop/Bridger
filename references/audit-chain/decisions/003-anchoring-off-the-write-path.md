# ADR-AC-003: Anchoring runs off the write path; fail-closed only when declared

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-AC-ADR-003                                           |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.2 (2026-11-08): Fail-closed through the `ChainGate` gate piece instead of failed writes; memory bounded without refusing writes; the sink's own conditions marked, not refused; failed-write alternative recorded as rejected (CCR-AC-002)<br>0.1 (2026-11-08): Initial draft (CCR-AC-001)                 |

---

## Context

Core's audit writer sits on the path of every operator change, bounded by `auditTimeout`; a write that fails past that bound sets the audit-degraded latch and stops operator changes ([BEH-BR-204, BEH-BR-205](../../core/behaviors/23-audit-sink-and-record.md), [ADR-BR-031](../../core/decisions/031-audit-failure-policy.md)). An anchor service is a remote call, often to another organisation, with its own latency and outages. Some regulated users will want changes to stop when too much of the trail is unanchored; others will not. Core's writer retries a refused record in place: while a write fails, every later record — system records included — waits behind it, and past its 1024-record queue later records are dropped; a refusal that never clears stops recording until restart ([BEH-BR-202](../../core/behaviors/23-audit-sink-and-record.md#beh-br-202-one-writer-in-order-retrying-in-place), Settled item 0). Core recommends that a companion refuse operator changes on a condition of its own through a gate piece reading its status, and keep accepting records.

## Decision

- **Off the write path by default.** Windows close by record count or interval (read from `Clock`) and are published by a fiber owned by the sink's scope. `record` never waits on `publish` or on the receipt store.
- **Bounded memory without refusing writes.** The open window is held as an RFC 6962 compact range; closed windows are held as statements, up to `maxPendingWindows`, beyond which windows stop closing. No anchoring condition fails `record`.
- **Fail-closed is an explicit gate piece.** `ChainGate`, built over the sink's status before the host, refuses operator calls outside an explicit `allow` list while anchoring is overdue ("anchor-overdue") or the chain carries a marked break ("chain-break"); the limits must exceed the anchoring schedule. The sink keeps accepting every record.
- **The sink's own conditions are never write failures.** Order violations, retry mismatches, unsupported schema versions and strings that are not I-JSON are chained with a marker; only failures of the inner store or keyed hasher, which can clear, fail a write.
- **Order and retries.** Windows are published in order and retried unchanged; later windows close on schedule and queue behind an unanchored one; windows are never merged.
- **Visible status.** `HashChainSink.status` reports head, last anchored window, unanchored count and age, consecutive failures, queued windows and marked links.

## Alternatives considered

- **Anchor every record synchronously.** Rejected: every operator change would wait on an external service, and an outage would trigger the latch at once.
- **Fail-closed by default.** Rejected: whether an anchor outage should stop changes is a risk decision of the regulated user, not of a library.
- **Never fail-closed.** Rejected: a deployment that has decided changes must not outrun anchoring needs a way to say so.
- **Fail-closed by failing writes, through core's latch** (this record's first draft). Rejected: core retries the refused record in place, so an anchor outage would hold system records behind it and drop records past the queue — the mode chosen to improve coverage would lose records; a deterministic refusal would stop recording for good.

## Consequences

**Positive**:

- The host's availability does not depend on the anchor service unless the consumer chooses so.
- Anchoring failures are visible in status and logs before a review finds a long unanchored tail.

**Negative**:

- By default, a long anchor outage leaves a long tail covered by the chain alone.
- Fail-closed refuses operator changes during an anchor outage, and after a chain break until the host is rebuilt; the consumer's continuity planning must cover both, and must choose which operations stay allowed.
- A marked record is stored rather than refused, so a wiring defect is found by reading the status or running `verifyChain`, not by a halted host.

**Trade-off accepted**: availability by default with an explicit stricter mode, rather than one fixed policy for every deployment.

## References

- Behaviours: [02 — Anchoring](../behaviors/02-anchoring.md)
- Invariants: [INV-AC-005](../invariants.md#inv-ac-005-anchoring-never-delays-or-fails-a-write)
- Core decisions: [ADR-BR-031](../../core/decisions/031-audit-failure-policy.md), [ADR-BR-030](../../core/decisions/030-audit-sink-port.md), [ADR-BR-047](../../core/decisions/047-generic-gate-and-plan.md)
- Core risks: [RSK-BR-020](../../core/gxp/03-risk-assessment.md#rsk-br-020), [RSK-BR-045](../../core/gxp/03-risk-assessment.md#rsk-br-045)
