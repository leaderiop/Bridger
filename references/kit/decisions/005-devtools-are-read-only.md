# ADR-KT-005: Devtools are read-only views over core observation

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-KT-ADR-005                                           |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.1 (2026-11-08): Initial draft (CCR-KT-001)                 |

---

## Context

Developers need host-wide views: dependency graph, why a plugin waits, leases,
recent history. Core provides per-plugin `inspect`, snapshots and a lossy
event feed. A devtools surface that could also act (restart, remove) would be
a second control path around the gate and the audit trail.

## Decision

- The inspector is a plugin providing `Inspector`, built only on `snapshot`,
  `changes`, `events`, `inspect` and `controls`, with no mutating operation
  (BEH-KT-041).
- Reports are tied to a snapshot revision and marked inconsistent when it
  moves (BEH-KT-042); `why` builds a chain from `missingServiceIds`
  (BEH-KT-043); leases are counts (BEH-KT-044); the timeline shows gaps and
  is labelled as a diagnostic feed (BEH-KT-045).
- The kit ships no network endpoint for the inspector; exposing it is the
  application's decision.

## Alternatives considered

- **An interactive console with actions.** Rejected: actions belong to the
  host's operations, with an actor and the gate; the CLI's `dev` already uses
  them on a development host.
- **A core `inspectAll`.** Deferred: composing per-plugin `inspect` with a
  revision check is enough for v0.1.

## Consequences

**Positive**: the inspector can be enabled without changing who can change
the host.

**Negative**: a report may be inconsistent under heavy churn; it says so.

**Trade-off accepted**: views without controls.

## References

- Behaviours: [06](../behaviors/06-devtools-inspector.md), [BEH-KT-031](../behaviors/04-cli.md#beh-kt-031-inspect-prints-the-inspector-report)
- Core: [13 — Observability](../../core/behaviors/13-observability-and-diagnostics.md)
- Invariants: [INV-KT-003](../invariants.md#inv-kt-003-tooling-output-carries-names-and-counts-never-values)
