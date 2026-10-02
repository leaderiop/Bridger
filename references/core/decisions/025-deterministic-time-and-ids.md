# ADR-BR-025: Time and identifiers come from services

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ADR-025                                              |
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

The host stamps time on events, measures build and drain durations, fires `buildTimeout`, `drainTimeout`, `stallWarning` and `auditTimeout`, and mints identifiers: the host ID and, with an `AuditSink` wired, every audit record ID. If any of these come from ambient calls (`Date.now()`, `performance.now()`, `crypto.randomUUID()`), no test can predict them, so assertions degrade to "a string exists" and timeout behaviour can only be tested by sleeping.

The precedent is direct. Qadi's ADR-QD-012 (Time and identifiers come from services) records that its predecessor called `performance.now()`, `new Date()` and `crypto.randomUUID()` in the evaluator, and shipped a trace feature with no assertions on its content because nothing in it was reproducible.

For a regulated user the cost is higher. Operational qualification reruns scripted scenarios and compares outputs; a record whose timestamp and ID differ on every run cannot be compared against an expected result, and an audit trail's time-stamping (21 CFR Part 11 §11.10(e), EU GMP Annex 11 §12.4) is only as trustworthy as the clock the consumer supplies.

## Decision

- **Time comes from Effect's `Clock`.** Every timestamp (events, audit records), every duration and every timeout in the core reads `Clock`. Audit timestamps are ISO-8601 UTC with milliseconds.
- **Identifiers come from `IdGenerator`** (service `@bridger/core/IdGenerator`). Its default implementation is backed by `crypto.randomUUID`; that default is the single sanctioned location for the call.
- **Ambient sources are prohibited in core.** `Date.now()`, `new Date()` without an argument, `performance.now()` and `crypto.randomUUID()` outside the `IdGenerator` default are forbidden in `packages/core/src/` *(Planned)*, and a house-style check *(Planned)* fails the build on them.
- **Tests replace both.** `TestHost` runs under `TestClock` and an `IdGenerator` that yields a counter sequence ([ADR-BR-026](../decisions/026-deterministic-test-host.md)), so a scripted scenario produces the same timestamps and IDs on every run.
- **Order is not time.** Where order matters (the audit trail), the authority is `auditSeq`, not the clock ([ADR-BR-037](../decisions/037-audit-sequence-separate-from-event-seq.md)); a wall-clock step under NTP cannot reorder records.
- **Accuracy is the consumer's.** The core reads the `Clock` it is given. Synchronising that clock to a trusted source, and documenting it, is the regulated user's responsibility.

## Alternatives considered

- **Ambient calls with test-runner fake timers.** Rejected: fake timers patch globals, do not reach Effect's scheduler consistently, and leave identifiers random.
- **Pass `now` and IDs as parameters.** Rejected: every internal path would thread them, and one forgotten call site silently reintroduces nondeterminism. Services make the source explicit once.
- **No default `IdGenerator`.** Rejected: non-regulated users would provide a layer to get anything working. A default that every test overrides keeps the simple path simple and the nondeterminism in one named place.
- **Use the clock for audit order.** Rejected: clocks step backwards, and two records in one millisecond have no order.

## Consequences

**Positive**:

- Every output of a scripted scenario is reproducible, so tests and qualification scripts assert exact values.
- The nondeterminism boundary is one named service and one named file, enforced by a check rather than by convention.

**Negative**:

- Contributors must route every timestamp and identifier through services; a direct call is a build failure, which is friction for small changes.
- The core cannot detect a wrong or unsynchronised clock; a regulated deployment that supplies one gets wrong timestamps faithfully recorded.

**Trade-off accepted**: a prohibition and a check, at the cost of contributor friction, in exchange for outputs that a test can predict and a validation exercise can compare.

## References

- Behaviours: [24 — Time, ids and sequence](../behaviors/24-time-ids-and-sequence.md), [21 — Testing host](../behaviors/21-testing-host.md), [13 — Observability and diagnostics](../behaviors/13-observability-and-diagnostics.md)
- Invariants: [INV-BR-024](../invariants.md#inv-br-024-time-and-identifiers-come-only-from-services), [INV-BR-023](../invariants.md#inv-br-023-the-audit-sequence-is-contiguous-per-host)
- Requirements: [URS-BR-027](../urs.md#urs-br-027-reproduce-time-and-identifiers-during-validation)
- Risks: [RSK-BR-007](../gxp/03-risk-assessment.md#rsk-br-007), [RSK-BR-021](../gxp/03-risk-assessment.md#rsk-br-021)
- Decisions: [ADR-BR-026](../decisions/026-deterministic-test-host.md), [ADR-BR-037](../decisions/037-audit-sequence-separate-from-event-seq.md)
- Source: `docs/SPEC.md` — "Observability", "Testing the core"
- Precedent: Qadi ADR-QD-012, *Time and identifiers come from services* (precedent; cited by name).
- External: 21 CFR Part 11 §11.10(e); EU GMP Annex 11 (2011) §12.4.
