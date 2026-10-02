# ADR-BR-016: Re-entrancy is detected through a carried reference

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ADR-016                                              |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.1 (2026-10-02): Initial draft (CCR-BR-001)                 |

---

## Context

Bounded leases ([ADR-BR-015](../decisions/015-leases-one-primitive.md)) create a self-deadlock. A callback running under a lease on plugin *P* calls `remove(P)`. The removal waits for every lease on *P* to drain, including the one held by the very fiber that is waiting. The callback can never return. The drain limit eventually fails the call with `DrainTimeout`, but only after the full limit, with a misleading error, and never if the drain is `"forever"`.

The same happens indirectly: removing a provider *Q* that *P* depends on must stop *P* first, which drains *P*'s leases; and `awaitIdle` from inside the callback waits for transitions that wait for the callback.

These waits are the caller's own fault and are fully determined at call time, if the host can know which plugins the calling fiber holds.

## Decision

- A fiber that holds a lease on a plugin carries the held plugin IDs in a `Context.Reference<ReadonlySet<string>>` with identifier `@bridger/core/HeldPlugins` (default: the empty set). Forked fibers inherit it, and the supervised child of `use`/`useAll` inherits it from the caller.
- A call from such a fiber that would wait for a held plugin *P* to drain fails immediately with `WouldDeadlock { id }`. This covers `remove`, `replace`, `restart` and `disable` of *P*; the same operations on any provider whose stop must first stop *P* (because *P* depends on it, directly or transitively); and `awaitIdle`.
- `use` of other services remains allowed.
- **Limit.** The check follows the carried reference only. A wait that goes through another fiber that does not inherit the reference (a callback that hands work to a queue worker which then calls `remove`, or awaits a fiber started elsewhere) cannot be detected. `DrainTimeout` is the only backstop for it, exactly as for any stuck lease. This limit is a named risk ([RSK-BR-011](../gxp/03-risk-assessment.md#rsk-br-011)).

## Alternatives considered

- **A host-wide wait-for graph with cycle detection.** Rejected: it would have to track every await across every fiber, which Effect does not expose, and would cost on every call.
- **Tracking fiber IDs instead of a reference.** Rejected: forked fibers have new IDs, so a callback that forks and awaits would escape the check; an inherited reference follows the fiber tree naturally.
- **No detection; rely on `DrainTimeout`.** Rejected: the failure arrives late, names the wrong cause, and never arrives under `drain: "forever"`.

## Consequences

**Positive**:

- The common self-deadlock fails at once, with an error naming the plugin.
- The same carried-reference pattern serves `@bridger/core/ActivePlugin` and `@bridger/core/CurrentActor`.

**Negative**:

- Detection is incomplete by design: cross-fiber hand-offs are invisible to it.
- `awaitIdle` cannot be called from inside a lease callback.

**Trade-off accepted**: detection limited to the fiber tree, with `DrainTimeout` as the backstop, in exchange for a check that is cheap and exact for the cases it covers.

## References

- Behaviours: [09 — Leases](../behaviors/09-leases.md), [08 — Operation legality](../behaviors/08-operation-legality.md)
- Invariants: [INV-BR-016](../invariants.md#inv-br-016-a-re-entrant-wait-fails-fast), [INV-BR-017](../invariants.md#inv-br-017-every-drain-is-bounded-unless-declared-forever)
- Risks: [RSK-BR-011](../gxp/03-risk-assessment.md#rsk-br-011)
- Decisions: [ADR-BR-015](../decisions/015-leases-one-primitive.md), [ADR-BR-008](../decisions/008-error-taxonomy.md)
- Source: `docs/SPEC.md` — "Leases: limits, supervision and re-entrancy" (Re-entrancy)
