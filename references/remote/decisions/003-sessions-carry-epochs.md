# ADR-RM-003: Every session carries an epoch, compared by equality

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-RM-ADR-003                                            |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.1 (2026-11-08): Initial draft (CCR-RM-001)                 |

---

## Context

After a partition heals, frames from the old session can still arrive: a
delayed call, a late reply, a callback from a guest invocation that
outlived its session. Acting on any of them under the new session is
split-brain at the boundary. Guests may be stateless and evicted at any time
([ADR-RM-007](./007-stateless-guests.md)).

## Decision

- The link allocates a fresh epoch per session from the core `IdGenerator`.
- Every frame after the handshake carries the epoch; tokens carry it too.
- Both ends compare by **equality** with the open session's epoch; anything
  else is refused (guest: `StaleEpoch`, not executed) or dropped (host:
  late results), and counted.
- Within a session the guest deduplicates by `callId`.

## Alternatives considered

- **Ordered epochs (monotonic counters) checked by the guest.** Rejected: a
  stateless guest cannot remember the highest epoch; ordering adds nothing
  on the host side over equality.
- **No epoch; rely on connection identity.** Rejected: transports such as
  per-invocation loaders have no connection identity that spans a session.

## Consequences

**Positive**: stale frames never take effect; deterministic in tests.

**Negative**: a late result is lost to the caller, who already received
`outcome: "unknown"`; reconciling it is the application's job.

**Trade-off accepted**: discard late results rather than deliver them across
sessions.

## References

- Behaviours: [02](../behaviors/02-sessions-and-epochs.md), [BEH-RM-035](../behaviors/05-guest-serve.md), [BEH-RM-044](../behaviors/06-capability-tokens-and-call-log.md), [BEH-RM-051](../behaviors/07-transports-and-adapters.md)
- Invariants: [INV-RM-004](../invariants.md#inv-rm-004-a-stale-epoch-is-refused-at-the-boundary), [INV-RM-009](../invariants.md#inv-rm-009-within-one-session-a-call-executes-at-most-once-on-a-conforming-guest)
- Core decisions: [ADR-BR-025](../../core/decisions/025-deterministic-time-and-ids.md)
