# ADR-BR-016: Re-entrancy is detected through a carried reference

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ADR-016                                              |
> | Revision       | 0.3                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.3 (2026-11-10): Builds, `load` and finalizers carry their plugin in `@bridger/core/CurrentTransition`, `HeldPlugins` keeps leases, and both references are exported for companion hand-offs; every other call reads both, `shutdown` reads `CurrentTransition` only, before its `requested` record; two alternatives added (H1) (CCR-BR-035)<br>0.2 (2026-10-02): The carried reference extended to builds and activation-scope finalizers; check run before any wait and again at the intent; second pass: which forked fibers carry a build's or finalizer's plugin, `retry` and `enable` covered (CCR-BR-008)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001) |

---

## Context

Bounded leases ([ADR-BR-015](../decisions/015-leases-one-primitive.md)) create a self-deadlock. A callback running under a lease on plugin *P* calls `remove(P)`. The removal waits for every lease on *P* to drain, including the one held by the very fiber that is waiting. The callback can never return. The drain limit eventually fails the call with `DrainTimeout`, but only after the full limit, with a misleading error, and never if the drain is `"forever"`.

The same happens indirectly: removing a provider *Q* that *P* depends on must stop *P* first, which drains *P*'s leases; and `awaitIdle` from inside the callback waits for transitions that wait for the callback.

A lease callback is not the only code that runs inside a plugin's transition and can call the host. *P*'s `build` runs inside *P*'s build step, and a finalizer of *P*'s activation scope runs inside *P*'s stop step. A `restart(P)` from the build, or a `remove(Q)` of a provider of *P* from a finalizer, waits for the very transition step that is waiting for the calling fiber (CCR-BR-008 review of [ADR-BR-038](../decisions/038-cross-plugin-stop-ordering.md)).

These waits are the caller's own fault and are fully determined at call time, if the host can know which plugins the calling fiber holds.

## Decision

- A fiber that holds a lease on a plugin carries the held plugin IDs in a `Context.Reference<ReadonlySet<string>>` with identifier `@bridger/core/HeldPlugins` (default: the empty set). Forked fibers inherit it, and the supervised child of `use`/`useAll` inherits it from the caller.
- A call from such a fiber that would wait for a held plugin *P* to drain fails immediately with `WouldDeadlock { id }`. This covers `remove`, `replace`, `restart`, `reconfigure` and `disable` of *P*; `retry` and `enable` of *P* while a system stop of *P* runs, which they wait for ([08 — Operation legality](../behaviors/08-operation-legality.md), BEH-BR-073); the same stopping operations on any provider whose stop must first stop *P* (because *P* depends on it, directly or transitively); and `awaitIdle`.
- A fiber running *P*'s `build` or `load`, or one of *P*'s finalizers, carries *P*'s ID in a reference of its own, `Context.Reference<Option<string>>` with identifier `@bridger/core/CurrentTransition` (default: none; set by core, and exported only so that a companion can carry it across a hand-off on the rules that apply to `HeldPlugins`), and so does every fiber it forks and awaits before returning. `HeldPlugins` keeps leases only. Fibers forked into the activation scope (`background`, `whenAvailable`) carry no plugin in `CurrentTransition` and only the leases they hold in `HeldPlugins`: they outlive the build and are not part of its transition step. A mutating call from a fiber carrying *P* in either reference that would wait for *P* to drain or for a transition step of *P* fails with `WouldDeadlock { id }` in the same way, so for every call but `shutdown` the two references are read together and what is refused is what one reference refused before (CCR-BR-035).
- **`shutdown` reads `CurrentTransition` only.** A `shutdown` from a fiber carrying *P* in `CurrentTransition` fails at once with `WouldDeadlock { id }` naming *P*, after attribution and before its `requested` record: it writes no record, begins nothing and does not join a shutdown in progress ([12 — Shutdown and Hosting](../behaviors/12-shutdown-and-hosting.md), BEH-BR-105; [22 — Attributable Operations](../behaviors/22-attributable-operations.md), BEH-BR-188). A lease holder's `shutdown` is not refused: the overall shutdown limit forces its lease and ends its wait.
- **When it is checked.** For every mutating call but `shutdown`, the check runs at step 7 of BEH-BR-188, before the call waits for anything, and again at the linearization point immediately before the intent is recorded, because whether the call joins or supersedes an operation in flight — and so waits for that operation's stop — is known only there. `shutdown`'s check depends on the calling fiber alone and runs before its `requested` record, as above.
- `use` of other services remains allowed.
- **Limit.** The check follows the carried references only. A wait that goes through another fiber that does not inherit the reference (a callback, build or finalizer that hands work to a queue worker which then calls `remove`, or awaits a fiber started elsewhere) cannot be detected. Such a cycle can be closed only by code that runs inside a lease, a build or a finalizer and calls the host; within the fiber tree the reference catches it, and a hand-off to another fiber remains the residual of [RSK-BR-011](../gxp/03-risk-assessment.md#rsk-br-011), bounded by the drain limits and `buildTimeout`, exactly as for any stuck lease or build.

## Alternatives considered

- **A host-wide wait-for graph with cycle detection.** Rejected: it would have to track every await across every fiber, which Effect does not expose, and would cost on every call.
- **Tracking fiber IDs instead of a reference.** Rejected: forked fibers have new IDs, so a callback that forks and awaits would escape the check; an inherited reference follows the fiber tree naturally.
- **No detection; rely on `DrainTimeout`.** Rejected: the failure arrives late, names the wrong cause, and never arrives under `drain: "forever"`.
- **Carry the reference only in lease callbacks** (the first version of this decision). Rejected: a build or a finalizer that calls the host closes the same cycle, and would be caught only by `buildTimeout` or a drain limit, late and under the wrong error.
- **Check only once, at step 7.** Rejected: a call that turns out to join an operation in flight on a held plugin would wait for that operation's stop, and the join is decided only at the linearization point.
- **One reference for leases and transition steps** (this decision until CCR-BR-035). Rejected: `shutdown` must refuse a build, `load` or finalizer and allow a lease callback, and one set cannot tell the two apart. Every other guarded call treats both alike, so splitting the reference changes nothing for them.
- **Decide `shutdown`'s `WouldDeadlock` at step 7, after its `requested` record, like the others.** Rejected: at step 7 a shutdown on a closing host joins the one in progress, and a refused shutdown must not wait for it; the answer depends on the calling fiber only, so nothing is gained by deciding it later.

## Consequences

**Positive**:

- The common self-deadlock fails at once, with an error naming the plugin, whether it starts in a lease callback, a build, a `load` or a finalizer.
- The same carried-reference pattern serves `@bridger/core/ActivePlugin` and `@bridger/core/CurrentActor`.

**Negative**:

- Detection is incomplete by design: cross-fiber hand-offs are invisible to it.
- `awaitIdle` cannot be called from inside a lease callback, a build, a `load` or a finalizer; `shutdown` cannot be called from a build, a `load` or a finalizer.

**Trade-off accepted**: detection limited to the fiber tree, with `DrainTimeout` and `buildTimeout` as the backstops, in exchange for a check that is cheap and exact for the cases it covers.

## References

- Behaviours: [09 — Leases](../behaviors/09-leases.md), [08 — Operation legality](../behaviors/08-operation-legality.md), [12 — Shutdown and hosting](../behaviors/12-shutdown-and-hosting.md), [22 — Attributable operations](../behaviors/22-attributable-operations.md)
- Invariants: [INV-BR-016](../invariants.md#inv-br-016-a-re-entrant-wait-fails-fast), [INV-BR-017](../invariants.md#inv-br-017-every-drain-is-bounded-unless-declared-forever)
- Risks: [RSK-BR-011](../gxp/03-risk-assessment.md#rsk-br-011)
- Decisions: [ADR-BR-015](../decisions/015-leases-one-primitive.md), [ADR-BR-008](../decisions/008-error-taxonomy.md), [ADR-BR-038](../decisions/038-cross-plugin-stop-ordering.md)
- Source: `docs/SPEC.md` — "Leases: limits, supervision and re-entrancy" (Re-entrancy)
