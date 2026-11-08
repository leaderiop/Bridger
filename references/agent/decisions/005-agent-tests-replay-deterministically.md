# ADR-AG-005: Agent tests replay deterministically; no live model in the required suite

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-AG-ADR-005                                           |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.1 (2026-11-08): Initial draft (CCR-AG-001)                 |

---

## Context

Agent behaviour depends on a model whose answers vary. A suite that calls a
live model cannot be evidence for anything, and cannot run in CI cheaply.
Core already provides `TestHost`, `TestClock` and counter identifiers
(ADR-BR-025, ADR-BR-026).

## Decision

- **`ScriptedModel`** answers only scripted requests and fails on any other;
  it has no implicit response (BEH-AG-033).
- **`Transcript` and `ReplayModel`** record a run and replay only the model;
  tool calls run through the real tool runner and dispatch on `TestHost`, and
  a difference fails with `ReplayDiverged` (BEH-AG-034, BEH-AG-035).
- **`EvalHook`** is an advisory hook point per turn for the application's
  evaluations (BEH-AG-036); a static check shows excluded commands are not
  offered to a principal (BEH-AG-037).
- **The required suite runs with no live model** (BEH-AG-038).

## Alternatives considered

- **Live-model tests in the required suite.** Rejected: non-deterministic
  and not evidence.
- **Replay tool results as well.** Rejected: replaying through real dispatch
  is what makes a gate or tool change visible.

## Consequences

**Positive**:

- Agent regressions are caught deterministically, and gate changes show at
  the call they affect.

**Negative**:

- Model quality is not tested by this package; that is the application's
  evaluation work.

**Trade-off accepted**: deterministic replay as the required suite, with
quality evaluation left to the application.

## References

- Behaviours: [05 — Agent testing](../behaviors/05-agent-testing.md), [06 — Required acceptance checks](../behaviors/06-required-acceptance-checks.md)
- Invariants: [INV-AG-006](../invariants.md#inv-ag-006-a-replayed-run-is-identical-to-its-recording)
- Core: [21 — Testing host](../../core/behaviors/21-testing-host.md), [ADR-BR-025](../../core/decisions/025-deterministic-time-and-ids.md), [ADR-BR-026](../../core/decisions/026-deterministic-test-host.md), [ADR-BR-035](../../core/decisions/035-evidence-from-executed-tests.md)
