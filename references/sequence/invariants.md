# Runtime Invariants

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-SQ-INV                                               |
> | Revision       | 0.3                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.3 (2026-11-09): INV-SQ-004 source: the origin is checked against `DurableBus.origin` at every `open`, `next` and `close`, so a handle of an earlier origin never writes (CCR-SQ-003)<br>0.2 (2026-11-08): INV-SQ-004 has no exception: a supersession is written in the new incarnation's own stream (CCR-SQ-002)<br>0.1 (2026-11-08): Initial draft (CCR-SQ-001)                 |

---

Properties of `@bridger/sequence` that hold for every execution. Every
**Source** and **Verification** is *(Planned)*; nothing here is implemented
and no invariant is evidence until a test that checks it has run
([ADR-BR-035](../core/decisions/035-evidence-from-executed-tests.md)).

## INV-SQ-001: Committed numbers are 1 to n, each once

The committed `NumberIssued` events of a series carry 1 … n, each exactly once.

**Source**: `packages/sequence/src/Series.ts` *(Planned)* — number derived
from the stream version; append with the expected version read.

**Implication**: a gap or duplicate seen by the authority is a defect,
an alteration or a restore without a new incarnation — never normal operation.

**Verification** *(Planned)*: property test over commits, rollbacks and
concurrent `next()`.

**Related**: [BEH-SQ-004](behaviors/01-series-and-ownership.md#beh-sq-004-next-reserves-a-number-in-the-callers-transaction), [BEH-SQ-005](behaviors/01-series-and-ownership.md#beh-sq-005-committed-numbers-are-contiguous-and-never-renumbered), [ADR-SQ-002](decisions/002-a-series-is-an-event-store-stream.md).

---

## INV-SQ-002: A committed number is never changed or reassigned

**Source**: event-store INV-ES-003 (no rewrite); no package operation
changes a `NumberIssued` event *(Planned)*.

**Implication**: a number a person holds keeps meaning the record it was
issued with.

**Verification** *(Planned)*: API surface test; byte comparison of series
streams across closure and incarnation changes.

**Related**: [BEH-SQ-005](behaviors/01-series-and-ownership.md#beh-sq-005-committed-numbers-are-contiguous-and-never-renumbered).

---

## INV-SQ-003: No number after closure

Once `SeriesClosed` has committed, no `NumberIssued` commits in that series.

**Source**: `next()` reads the closure in the same transaction and the
append's expected version excludes a concurrent closure *(Planned)*.

**Implication**: a closure's `last` is final for this host's view of the series.

**Verification** *(Planned)*: concurrent `next()` and `close()` scenario.

**Related**: [BEH-SQ-007](behaviors/01-series-and-ownership.md#beh-sq-007-closereason-ends-a-series), [BEH-SQ-009](behaviors/02-incarnation-and-verification.md#beh-sq-009-a-new-incarnation-closes-the-old-series-as-superseded).

---

## INV-SQ-004: Only the owning origin writes a series

Every event of a series stream is written by its origin, with no exception;
the supersession of a series after a restore is written by the new
incarnation in its own incarnation stream (BEH-SQ-009).

**Source**: origin check against durable-bus `DurableBus.origin` in `open`,
`next` and `close`, read at every call *(Planned)*; a handle opened before a
whole-store re-bootstrap is refused afterwards (BEH-SQ-002).

**Implication**: two hosts cannot draw from one series through this package.

**Verification** *(Planned)*: `NotOwner` scenarios, including a handle kept
across a re-bootstrap; `verifySeries` foreign writer report.

**Related**: [BEH-SQ-002](behaviors/01-series-and-ownership.md#beh-sq-002-one-owning-host), [BEH-SQ-009](behaviors/02-incarnation-and-verification.md#beh-sq-009-a-new-incarnation-closes-the-old-series-as-superseded), [ADR-SQ-001](decisions/001-numbers-are-issued-by-the-owning-host.md).

---

## INV-SQ-005: Verification reports only what it checked

`receivedThrough` never exceeds the highest n with 1 … n all received, and
the report carries no overall verdict.

**Source**: `packages/sequence/src/verifySeries.ts` *(Planned)*.

**Implication**: a report cannot be read as proof that a series is complete.

**Verification** *(Planned)*: property test over generated received sets.

**Related**: [BEH-SQ-012](behaviors/02-incarnation-and-verification.md#beh-sq-012-verifyseries-is-a-pure-total-function), [BEH-SQ-013](behaviors/02-incarnation-and-verification.md#beh-sq-013-what-verification-reports).

---

_Previous: [03 — Formats, testing and acceptance](./behaviors/03-formats-testing-and-acceptance.md)_ · _Next: [Risks](./risks.md)_
