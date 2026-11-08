# ADR-DB-001: A separate contract from the core event bus

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-DB-ADR-001                                            |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.1 (2026-11-08): Initial draft (CCR-DB-001)                 |

---

## Context

The core event bus ([ADR-BR-020](../../core/decisions/020-typed-event-bus.md)) is an in-memory, typed dispatcher with four modes, results and middleware, whose listeners live in plugin scopes. Applications also need events that survive a process and cross hosts. Making the core bus persistent, or adding a mode to it, is tempting.

## Decision

- `@bridger/durable-bus` defines its own service (`@bridger/durable-bus/DurableBus`), its own event declarations (`DurableEvent`), and its own delivery contract (transactional, one-way, at least once).
- It never registers on, emits on, wraps or replaces `Bridger.Events`; the core bus gains no persistence mode. The only bridge is the explicit, after-commit `DurableBus.forward` ([BEH-DB-050](../behaviors/07-core-bus-and-adapters.md#beh-db-050-forward-is-an-explicit-after-commit-bridge)).

## Alternatives considered

- **A persistence option on `emit`.** Rejected: results, `waterfall` middleware and synchronous failure have no meaning across a crash; callers would mix contracts unknowingly.
- **Core owns an outbox.** Rejected: core owns no storage ([ADR-BR-027](../../core/decisions/027-core-exclusions.md)).

## Consequences

**Positive**: each bus keeps one clear contract; the core stays storage-free.

**Negative**: two event APIs to learn; a domain event that must also notify in-process listeners needs `forward`.

## References

- Behaviours: [07](../behaviors/07-core-bus-and-adapters.md), [01](../behaviors/01-events-and-envelope.md)
- Core: [16 — Event bus](../../core/behaviors/16-event-bus.md)
