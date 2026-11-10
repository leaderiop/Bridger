# ADR-BR-005: Failure is sticky and retry is never automatic

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ADR-005                                              |
> | Revision       | 0.4                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.4 (2026-11-10): Shutdown's unregistration named as the one exit from `failed` that is not an operation (audit round 3, Low) (CCR-BR-035)<br>0.3 (2026-11-08): Failure phase "load" of a lazy plugin is sticky (CCR-BR-017); a capability policy fails closed (CCR-BR-018); a hook point's breaker is hook-level state, not plugin failure (CCR-BR-019)<br>0.2 (2026-10-03): Dependency loss of a `starting` plugin whose build has not begun (BEH-BR-035) (consistency pass) (CCR-BR-013)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001) |
---

## Context

A plugin's `build` is arbitrary effectful code. It may write to a database, register a webhook, send a message. When it fails, the host must decide whether to try again by itself: after a delay, when a dependency comes back, or when anything else changes.

Automatic retry is attractive for transient faults, but it repeats whatever side effects the failed build performed before failing, invisibly to the operator. Tied to dependency changes it can loop: a provider that flaps makes a failing dependent rebuild on every return. In a regulated setting an unrecorded repetition of a side effect is the failure that matters ([RSK-BR-003](../gxp/03-risk-assessment.md#rsk-br-003)).

A plugin that merely *lost a dependency* is a different case. It did not fail; its requirements went away. When they return, starting it is a normal start, not a retry, and requiring an operator for it would make every provider restart a manual cascade.

## Decision

**`failed` is sticky, and the host never retries by itself** (SPEC.md "API decisions" row 3):

- A `failed` plugin holds no live scope. If its requirements disappear or return while it is failed, it stays `failed`; its snapshot keeps `missingServiceIds` current so an adapter can show whether `retry` would land in `starting` or in `waiting`.
- A plugin leaves `failed` only through an explicit operation: `retry`, `restart`, `replace`, `reconfigure`, `disable` or `remove`, or — with any phase other than `cleanup` — by being unregistered when shutdown begins, which ends the host rather than recovering the plugin ([12 — Shutdown and hosting](../behaviors/12-shutdown-and-hosting.md), BEH-BR-105; CCR-BR-035). This holds for every failure phase, including `runtime`. (SPEC.md's runtime-failure section omits `disable` from this list; its state-and-lifecycle section and the state diagram include it. This ADR resolves the inconsistency in favour of including `disable`.)
- `retry`, `restart`, `replace` and `reconfigure` on a failed plugin go to `starting` when its requirements are available and to `waiting` otherwise.
- A failure with phase `cleanup` is narrower still: the scope is already closed and its finalizers cannot run again, so only `remove` is allowed, and it records the leak as acknowledged rather than claiming recovery ([ADR-BR-013](../decisions/013-total-operation-legality.md)).
- Dependency loss moves only `starting` and `active` plugins to `waiting` — directly when a `starting` plugin's build has not begun (BEH-BR-035), otherwise through `stopping`; a `waiting` plugin whose requirements appear starts by itself.
- Retry policy, where an application wants one, is built outside the core on `Host.changes` and `retry`, where its decisions are the application's own attributable operations ([ADR-BR-029](../decisions/029-attributable-mutations.md)).

## Alternatives considered

- **Automatic retry with back-off.** Rejected: repeats `build` side effects without an operator decision and without a record of who decided.
- **Retry when a dependency returns.** Rejected: couples a failing plugin to an unrelated provider's lifecycle and can loop on a flapping provider.
- **A configurable retry budget in core.** Rejected: it is still automatic from the operator's point of view, and policy belongs to the application, which can build it on `changes` and `retry`.
- **Clearing `failed` when requirements are lost (treating it as `waiting`).** Rejected: it would erase the failure and its message, and the next provider return would amount to an automatic retry.

## Consequences

**Positive**:

- No build side effect is repeated without an explicit, attributable call.
- Failure stays visible with its phase and message until someone acts.

**Negative**:

- Confluence has a deliberate exception: two histories that differ in a past build failure can differ until `retry` (SPEC.md "Confluence").
- A transient fault needs a human or an application policy to recover.

**Trade-off accepted**: manual recovery of transient faults, in exchange for never repeating a side effect silently.

**Amendments (2026-11-08)**:

- A lazy plugin whose `load` fails, or whose loaded definition does not match its manifest, fails with phase "load"; that failure is sticky like any other ([ADR-BR-042](../decisions/042-lazy-activation.md)).
- A capability policy that fails, dies or times out refuses the capture; it never fails a plugin by itself ([ADR-BR-044](../decisions/044-capability-policy-and-call-log-ports.md)).
- A hook point's per-contribution breaker is hook-level state, not plugin failure ([ADR-BR-046](../decisions/046-hook-points.md)).

## References

- Behaviours: [04 — States and snapshots](../behaviors/04-states-and-snapshots.md), [07 — Replacement and reactivation](../behaviors/07-replacement-and-reactivation.md), [10 — Runtime failure and health](../behaviors/10-runtime-failure-and-health.md)
- Invariants: [INV-BR-007](../invariants.md#inv-br-007-failure-is-sticky), [INV-BR-011](../invariants.md#inv-br-011-every-state-and-operation-pair-has-a-defined-outcome)
- Requirements: [URS-BR-006](../urs.md#urs-br-006-recover-from-failure-explicitly-and-never-silently)
- Risks: [RSK-BR-003](../gxp/03-risk-assessment.md#rsk-br-003), [RSK-BR-016](../gxp/03-risk-assessment.md#rsk-br-016)
- Decisions: [ADR-BR-004](../decisions/004-replace-is-stop-then-start.md), [ADR-BR-013](../decisions/013-total-operation-legality.md), [ADR-BR-017](../decisions/017-runtime-failure-one-transition.md), [ADR-BR-042](../decisions/042-lazy-activation.md), [ADR-BR-044](../decisions/044-capability-policy-and-call-log-ports.md), [ADR-BR-046](../decisions/046-hook-points.md)
- Source: `docs/SPEC.md` — "State and lifecycle", "Runtime failure and health", "Confluence", "API decisions" row 3
