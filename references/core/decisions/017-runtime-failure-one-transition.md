# ADR-BR-017: Three runtime failure signals and one transition

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ADR-017                                              |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.2 (2026-10-02): Consistency fixes from independent review (CCR-BR-002)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001) |

---

## Context

A plugin can fail after it became `active`: a background consumer dies, a connection it depends on stops answering, or the plugin itself detects an unrecoverable condition. If the host does not see this, the plugin stays `active` in every snapshot while serving nothing ([RSK-BR-016](../gxp/03-risk-assessment.md#rsk-br-016)).

The ways a failure can be detected differ (a fiber exits, a probe stops succeeding, the plugin says so), but what must follow is the same: stop handing out the service, stop dependents, let in-flight calls finish within a bound, close the scope, and show the failure. Three signals with three different consequences would give adapters three failure models and operators three recovery rules.

There is also no caller. A runtime failure is not an operation; if draining its leases times out, there is nobody to receive `DrainTimeout`.

## Decision

**Three signals** (SPEC.md "Runtime failure and health"):

1. **Supervised background work.** `Plugin.Runtime.background(name, effect, { onFailure, restart })` forks `effect` into the activation scope (`Effect.forkIn`). `onFailure` is `"fail-plugin"` (default; reports through `reportFailure`), `"restart"` (retries that fiber with the given `Schedule` and never changes plugin state) or `"ignore"`. Fibers forked without `background` are not tracked. `whenAvailable` uses the same policy.
2. **Health check.** If declared, `check` runs every `every`, bounded by `timeout`, only while the plugin is `active`, in its activation scope, against its captured services. A timeout counts as a failed check. `failureThreshold` consecutive failures is a runtime failure; fewer show `health: "degraded"`. A check is a short lease on the plugin itself, so a drain waits for at most one in-flight check. When the plugin leaves `active`, an in-flight check is interrupted and not counted. Checks are not transitions; `awaitIdle` ignores them.
3. **`Plugin.Runtime.reportFailure(cause)`**: immediate runtime failure.

**One transition.** The plugin is marked failing (hidden from new consumers; new leases and dependents blocked), its dependents stop first, its leases drain under the normal drain limit, its scope closes, and it ends `failed` with `failure.phase = "runtime"`. If the drain limit expires, the host revokes the remaining leases (`LeaseRevoked`, event `lease-revoked`) and completes the transition, so a failing plugin cannot hold the host hostage.

**Exit is explicit.** The plugin stays `failed` until `retry`, `restart`, `replace`, `reconfigure`, `disable` or `remove` ([ADR-BR-005](../decisions/005-failure-is-sticky.md)). SPEC.md's runtime-failure section omits `disable`; it is included here, consistent with SPEC.md's state rules.

**Attribution.** A runtime failure, a forced `lease-revoked` and a `health-degraded` change are system transitions: with an `AuditSink` wired they are audited with `Actor.system` and a `causationId`, or none for a root system record (a failure the plugin reports or a health check entering `degraded` has no cause in the trail), and they are never gated ([ADR-BR-029](../decisions/029-attributable-mutations.md), [ADR-BR-032](../decisions/032-operation-gate.md)).

## Alternatives considered

- **A distinct state or path per signal.** Rejected: three failure models for adapters and operators, with no behavioural difference worth the cost.
- **Restarting the plugin automatically on runtime failure.** Rejected: it is an automatic retry of `build` ([ADR-BR-005](../decisions/005-failure-is-sticky.md)).
- **Closing the scope immediately, without draining.** Rejected: a provider would close mid-call ([RSK-BR-001](../gxp/03-risk-assessment.md#rsk-br-001)).
- **Draining without a bound.** Rejected: the failing plugin's stuck callers would block the host indefinitely.
- **Counting an interrupted health check as a failure.** Rejected: a check interrupted because the plugin was being removed says nothing about health.

## Consequences

**Positive**:

- Every detected runtime failure produces the same visible, sticky state.
- A failing plugin is always fully stopped in bounded time.

**Negative**:

- Revocation at the drain limit can interrupt in-flight work of a failing plugin; external effects are not undone.
- Work forked outside `background` is invisible to the host.
- A health check takes a lease slot and can delay a drain by up to its `timeout`.

**Trade-off accepted**: forced revocation of a failing plugin's callers at the drain limit, in exchange for a single failure model and a host that cannot be held hostage by a failing plugin.

## References

- Behaviours: [10 — Runtime failure and health](../behaviors/10-runtime-failure-and-health.md), [09 — Leases](../behaviors/09-leases.md), [22 — Attributable operations](../behaviors/22-attributable-operations.md)
- Invariants: [INV-BR-005](../invariants.md#inv-br-005-dependents-stop-before-their-providers), [INV-BR-006](../invariants.md#inv-br-006-a-leased-provider-does-not-close-under-its-lease), [INV-BR-007](../invariants.md#inv-br-007-failure-is-sticky), [INV-BR-017](../invariants.md#inv-br-017-every-drain-is-bounded-unless-declared-forever)
- Requirements: [URS-BR-006](../urs.md#urs-br-006-recover-from-failure-explicitly-and-never-silently)
- Risks: [RSK-BR-016](../gxp/03-risk-assessment.md#rsk-br-016), [RSK-BR-015](../gxp/03-risk-assessment.md#rsk-br-015)
- Decisions: [ADR-BR-005](../decisions/005-failure-is-sticky.md), [ADR-BR-015](../decisions/015-leases-one-primitive.md), [ADR-BR-029](../decisions/029-attributable-mutations.md)
- Source: `docs/SPEC.md` — "Runtime failure and health", "State and lifecycle"
