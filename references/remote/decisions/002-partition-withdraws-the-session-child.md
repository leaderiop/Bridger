# ADR-RM-002: A partition withdraws the session child

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-RM-ADR-002                                            |
> | Revision       | 0.3                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.3 (2026-11-08): resolutions of the agent review of 2026-11-08 — consequence: dependents' finalizers after a session loss find the provider unreachable (R3-09); the scoped-mount seam is specified (CCR-RM-002)<br>0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-RM-001)<br>0.1 (2026-11-08): Initial draft (CCR-RM-001)                 |

---

## Context

When the peer stops answering, dependents of the contract must **wait, not
fail** (gap report §7). The core has a state that means "a requirement has
no active provider" — `waiting` — and a system path into and out of it:
dependency loss (`active → stopping → waiting`) and return
(`waiting → starting`). It has no automatic exit from `failed`
([ADR-BR-005](../../core/decisions/005-failure-is-sticky.md)), and the
legality table must not change.

## Decision

- On session loss (missed heartbeats, transport closure, an undecodable
  envelope, revocation), the link fails calls in flight with
  `SessionLost`, then **unmounts the session child**. Dependents follow the
  core's dependency-loss path to `waiting`.
- On a new session the link mounts a new child under a new epoch; dependents
  return through `waiting → starting → active`.
- The unmount uses the core's **scoped-mount seam** (specified in core
  BEH-BR-121 and BEH-BR-126 under CCR-BR-020, as requested here): a child
  mounted under a sub-scope of the activation scope is removed, when that
  sub-scope closes, exactly as on its parent's stop (BEH-BR-125), recorded
  as `system-stop` by `Actor.system` (BEH-BR-126), never gated.
- `"hold"` mode keeps the child mounted and fails calls fast instead, for
  consumers that prefer an error to a stop.

## Alternatives considered

- **Runtime failure of the link or child** (`reportFailure`). Rejected:
  sticky; recovery would need an operator `retry` after every network blip.
- **Operator `remove` of the child from the link.** Rejected: a partition
  would become an attributed, gated decision; a gate could refuse it and
  leave the contract published over a dead session.
- **A new plugin state (`partitioned`).** Rejected: it changes the state
  diagram and the legality table, which this companion must not do.
- **Keep the proxy active and block calls until reconnection.** Rejected as
  the default: calls would wait on the peer; kept as `"hold"` with
  fail-fast calls.

## Consequences

**Positive**:

- A partition reads as `waiting` with the contract's `ServiceId` missing —
  the existing meaning — and heals without an operator.
- No core state or legality change.

**Negative**:

- Every partition stops and restarts every dependent; flapping networks
  cause churn (damped by `stableFor`, [RSK-RM-010](../risks.md#rsk-rm-010)).
- Dependents stop before the session child, as core orders it, but the calls
  in flight have already failed: a dependent's finalizers find the provider
  unreachable after a session loss, which core's local guarantee (core
  BEH-BR-043) does not allow for a local provider. Core check 1 is exempted
  under partition ([BEH-RM-060](../behaviors/08-test-transport-and-acceptance.md),
  [RSK-RM-012](../risks.md#rsk-rm-012)).
- Depends on the core's scoped mount (core BEH-BR-121, BEH-BR-126, specified
  under CCR-BR-020 and CCR-BR-022).

**Trade-off accepted**: dependents' restarts on partition, for a partition
model that is entirely existing core behaviour.

## References

- Behaviours: [04](../behaviors/04-heartbeat-and-partition.md), [BEH-RM-002](../behaviors/01-remote-proxy-plugin.md)
- Invariants: [INV-RM-005](../invariants.md#inv-rm-005-a-partition-withdraws-the-provider-and-fails-no-dependent), [INV-RM-001](../invariants.md#inv-rm-001-a-remote-plugin-adds-no-state-operation-or-transition)
- Core: [BEH-BR-125](../../core/behaviors/14-children-and-groups.md), [BEH-BR-126](../../core/behaviors/14-children-and-groups.md), [ADR-BR-032](../../core/decisions/032-operation-gate.md)
