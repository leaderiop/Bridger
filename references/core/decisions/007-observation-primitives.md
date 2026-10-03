# ADR-BR-007: SubscriptionRef state feed and sliding PubSub event log

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ADR-007                                              |
> | Revision       | 0.4                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.4 (2026-10-03): Stale "unconfirmed" consequence removed; confirmed by CCR-BR-003 (consistency pass) (CCR-BR-013)<br>0.3 (2026-10-02): Sliding PubSub lag confirmed per subscriber (CCR-BR-003)<br>0.2 (2026-10-02): Consistency fixes from independent review (CCR-BR-002)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001) |

---

## Context

Two kinds of consumer watch a host, and they want opposite things.

A **user interface or adapter** (the React and FoldKit adapters) wants the current state of every plugin. It does not care about each intermediate step; it cares that it never misses the latest state, that it gets the current state immediately on subscribing, and that a slow render does not make it fall further and further behind.

A **diagnostic consumer** (a log shipper, a test, an admin timeline) wants the transitions themselves, in order: `build-started`, `state-changed`, `lease-revoked`. Coalescing them would destroy the information it wants. But an unbounded log grows without limit when a subscriber stalls, and a back-pressured log would let a stalled subscriber stall the host.

A third consumer, the regulated audit reader, wants an ordered, gap-detectable and attributable record of every change, with no silent loss. Neither of the first two feeds can be that: one is latest-wins by design and the other drops under pressure by design. Treating either as an audit trail is a named risk ([RSK-BR-012](../gxp/03-risk-assessment.md#rsk-br-012)).

## Decision

Two feeds, each built on the existing Effect primitive for its shape (SPEC.md "API decisions" row 6):

- **State feed — `Host.changes`.** `SubscriptionRef.changes` over a `SubscriptionRef<HostSnapshot>`. Each subscription receives the current snapshot first and registers without a gap, so no later revision is missed. `revision` increases on every state change within one host and never regresses; a slow subscriber may skip intermediate revisions and receives the latest. `snapshot()` is a one-time read of the same value. `PluginHandle.changes` is this feed filtered to one plugin. Closing the host ends the stream.
- **Event log — `Host.events`.** Backed by `PubSub.sliding(eventBuffer)` (default 1024). Not coalesced, but bounded: a subscriber that falls behind loses the *oldest* events. Every event carries the host ID, the plugin ID where one applies, a timestamp read from `Clock`, and a monotonic `seq`, so a loss is always visible as a gap in `seq`, never as silent reordering.
- **Neither feed is an audit trail.** Snapshots and events are diagnostics. The audit record is a separate, optional port with its own contiguous sequence ([ADR-BR-030](../decisions/030-audit-sink-port.md), [ADR-BR-037](../decisions/037-audit-sequence-separate-from-event-seq.md)). No document, log line or adapter may describe `Host.events` as an audit trail.
- **Confirmed (CCR-BR-003).** A sliding `PubSub` drops per subscriber: a slow subscriber loses only its own oldest events, a fast one loses nothing, and publishing never blocks (prototype checks E1a–E1c, [ADR-BR-001](../decisions/001-effect-v4-as-effect-system.md)). A gap in `seq` therefore means that this subscriber fell behind.

## Alternatives considered

- **One stream for both purposes.** Rejected: a state feed must be latest-wins and a transition log must not coalesce; one stream cannot be both.
- **An unbounded `PubSub`.** Rejected: a stalled subscriber grows memory without limit (NFR-BR-007, bounded memory).
- **A back-pressured bounded `PubSub`.** Rejected: a slow subscriber would block publication and, through it, lifecycle transitions. Observation must never gate the host.
- **A dropping `PubSub` (drop newest).** Rejected: a subscriber that falls behind would keep stale events and lose the most recent ones, which are the ones a diagnostic reader needs.
- **Making `Host.events` the audit trail by enlarging the buffer.** Rejected: any finite buffer still drops, events carry no actor or reason, and the feed has no failure policy; a bigger buffer only makes the gap rarer.

## Consequences

**Positive**:

- Adapters get the current state on subscription and can never miss the latest revision.
- Diagnostic readers can always tell that they lost events and how many.
- Neither feed can block a lifecycle transition.

**Negative**:

- A slow state subscriber does not see intermediate revisions; a slow event subscriber loses events. Consumers needing persistent history persist the events themselves, or wire an audit sink.

**Trade-off accepted**: two lossy-by-design diagnostic feeds, each explicit about its loss, in exchange for observation that never slows the host; the audit record is a separate port, with its own sequence and its own failure policy, whose losses are signalled by the audit-degraded latch rather than hidden ([ADR-BR-031](../decisions/031-audit-failure-policy.md)).

## References

- Behaviours: [04 — States and snapshots](../behaviors/04-states-and-snapshots.md), [13 — Observability and diagnostics](../behaviors/13-observability-and-diagnostics.md), [23 — Audit sink and record](../behaviors/23-audit-sink-and-record.md)
- Invariants: [INV-BR-008](../invariants.md#inv-br-008-snapshot-revisions-never-regress), [INV-BR-013](../invariants.md#inv-br-013-configuration-values-are-never-observable)
- Risks: [RSK-BR-012](../gxp/03-risk-assessment.md#rsk-br-012)
- Decisions: [ADR-BR-001](../decisions/001-effect-v4-as-effect-system.md), [ADR-BR-014](../decisions/014-discriminated-plugin-snapshot.md), [ADR-BR-030](../decisions/030-audit-sink-port.md), [ADR-BR-031](../decisions/031-audit-failure-policy.md), [ADR-BR-037](../decisions/037-audit-sequence-separate-from-event-seq.md)
- Source: `docs/SPEC.md` — "Host interface" (`changes` paragraph), "Observability", "API decisions" row 6
