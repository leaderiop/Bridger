# ADR-EN-003: Budgets are scoped reservations over opaque labels; exhaustion is a policy outcome

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-EN-ADR-003 |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record |
> | Change History | 0.1 (2026-11-08): Initial draft (CCR-EN-001)                 |

---

## Context

Quotas — calls per day, tokens per task, time per contribution — are usually
implemented as a counter incremented after the work. That shape charges
twice on retry, cannot refuse before starting, and leaks when work is
interrupted between start and count. Hook points
([31 — Hook points](../../core/behaviors/31-hook-points.md)) already bound
time with timeouts, deadlines and a per-contribution breaker; a quota must
not be confused with any of them.

## Decision

- `Budget.reserve(key, amount)` reserves before the work, against every limit
  whose labels are a subset of the key's, atomically
  ([03](../behaviors/03-budgets.md), BEH-EN-017, BEH-EN-018).
- A reservation is settled once — `commit(actual)` or `release` — idempotently
  by id, and released when its scope closes or its `ttl` passes (BEH-EN-019).
- Exhaustion is the typed `BudgetExhausted`, never a plugin failure, never a
  hook error, never a breaker count (BEH-EN-020, BEH-EN-023).
- Essential reservations always succeed and are counted as overdraft
  (BEH-EN-020).
- Labels and units are opaque; limits come from the application; there are no
  defaults (BEH-EN-017).
- Shared or persisted metering is an optional `BudgetLedger` port; the
  in-process `Budget` is not billing (BEH-EN-022).

## Alternatives considered

- **Count after use.** Rejected: double charge on retry, no refusal up front.
- **Exhaustion as a hook failure.** Rejected: would open breakers on
  contributions that are not faulty.
- **Hierarchical keys with fixed levels (org / plugin / task).** Rejected: fixes
  domain concepts in Bridger; label subsets express the same without naming
  them.

## Consequences

**Positive**:

- Retry-safe, interruption-safe metering with one primitive; quotas, deadlines
  and breakers stay distinct.

**Negative**:

- Callers must size reservations; overruns are counted, not prevented.
- Without a ledger, limits hold per process only.

**Trade-off accepted**: a reservation API that asks callers to estimate, at
the cost of some ceremony, rather than a counter that charges twice and
cannot refuse in advance.

## References

- Behaviours: [03 — Budgets](../behaviors/03-budgets.md)
- Invariants: [INV-EN-003](../invariants.md#inv-en-003-an-uncommitted-reservation-is-released-when-its-scope-closes), [INV-EN-004](../invariants.md#inv-en-004-reserved-plus-committed-never-exceeds-a-limit), [INV-EN-005](../invariants.md#inv-en-005-essential-uses-are-never-refused-by-entitlement-or-budget-helpers)
- Decisions: [ADR-BR-005](../../core/decisions/005-failure-is-sticky.md), [ADR-BR-025](../../core/decisions/025-deterministic-time-and-ids.md)
