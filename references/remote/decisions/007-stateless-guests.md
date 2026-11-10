# ADR-RM-007: Guests are stateless per invocation

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-RM-ADR-007                                            |
> | Revision       | 0.3                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.3 (2026-11-10): Specification audit of 2026-11-10 (SPEC-AUDIT-04) — deduplication across invocations comes from the `DedupeStore` of BEH-RM-067; one invocation only applies to a guest served with "idempotent-handlers" (PL18) (CCR-RM-007)<br>0.2 (2026-11-08): resolutions of the agent review of 2026-11-08 — per-call transports: a host-side logical session, no guest table between invocations, idempotent handlers (R3-05) (CCR-RM-002)<br>0.1 (2026-11-08): Initial draft (CCR-RM-001)                 |

---

## Context

Per-invocation runtimes evict isolates at will and cap how many dynamic
workers a request may create. A guest that keeps application state between
calls loses it unpredictably; a proxy that assumes a long-lived guest
misreads eviction as a result.

## Decision

- A guest handler receives its input, its context and granted clients, and
  nothing carried from a previous invocation by the runtime.
- The guest runtime's own session state (epoch, seen call IDs) is
  discardable; losing it ends the session, which the host learns from the
  guest's "stale-epoch" refusal.
- On per-call transports the session is a logical session held on the host;
  each invocation carries its epoch and contract version, and the guest
  keeps no table of its own between invocations. Deduplication across
  invocations comes from a `DedupeStore` the deployment supplies, which
  keeps a claimed key for its retention (BEH-RM-067); a guest served
  without one must be given the explicit value "idempotent-handlers",
  and then deduplication covers one invocation only, so handlers reached
  that way must be idempotent.
- State lives in host services reached through granted clients.

## Alternatives considered

- **Sticky guest sessions.** Rejected: not available on every adapter and
  fragile under eviction.

## Consequences

**Positive**: the same guest runs on every adapter; eviction is a transport
failure with a defined outcome.

**Negative**: guests pay a round trip for state.

**Trade-off accepted**: round trips for portability and defined outcomes.

## References

- Behaviours: [BEH-RM-034](../behaviors/05-guest-serve.md), [BEH-RM-054](../behaviors/07-transports-and-adapters.md)
- Risks: [RSK-RM-007](../risks.md#rsk-rm-007)
