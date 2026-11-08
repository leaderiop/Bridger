# 01 — Series and Ownership

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-SQ-BEH-01                                            |
> | Revision       | 0.3                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.3 (2026-11-08): BEH-SQ-002 loses the foreign-writer exception (a restore no longer writes in the old series, BEH-SQ-009); BEH-SQ-003 adds `WrongExpectedVersion` to `open` and `close` (CCR-SQ-002)<br>0.2 (2026-11-08): BEH-SQ-001, 004 and 005 cite URS-BR-057 (registered by core CCR-BR-027) (CCR-SQ-001)<br>0.1 (2026-11-08): Initial draft (CCR-SQ-001)                 |

---

This file specifies a series' identity, its single owner, `Series.open`,
`next()` within the caller's transaction, the contiguity and no-renumbering
rules, the hand-out obligation, `close(reason)` and attribution. This file
owns BEH-SQ-001–008 and uses all eight.

Planned source: `packages/sequence/src/Series.ts` *(Planned)*.

## BEH-SQ-001: A series is identified by its origin and name

> **See:** [ADR-SQ-002](../decisions/002-a-series-is-an-event-store-stream.md)
> **Satisfies:** [URS-BR-057](../../core/urs.md#urs-br-057-number-records-per-host-without-gaps-reuse-or-renumbering)
> **Depends on:** [BEH-DB-004](../../durable-bus/behaviors/01-events-and-envelope.md#beh-db-004-an-origin-is-an-incarnation-never-reused)

```ts
// illustrative — not type-checked
interface SeriesKey {
  readonly origin: string        // durable-bus origin, node + "#" + incarnation
  readonly name: string          // [A-Za-z0-9._-]{1,64}, chosen by the application
}
// seriesId  = origin + "/" + name                         e.g. "till-3#2/documents"
// stream    = "sq:" + node + ":" + incarnation + ":" + name   (event-store stream and chain series id)
```

```
REQUIREMENT: A series MUST be identified by `(origin, name)`; its `seriesId`
             and its event-store stream MUST be derived from them as above.
             A `name` outside the grammar MUST be refused with
             `SeriesNameInvalid { name }`.
```

The incarnation is part of the identity: a new incarnation is a new series,
which is what makes numbers after a restore distinct from numbers before it
(BEH-SQ-009).

## BEH-SQ-002: One owning host

> **Invariant:** [INV-SQ-004](../invariants.md#inv-sq-004-only-the-owning-origin-writes-a-series)
> **See:** [ADR-SQ-001](../decisions/001-numbers-are-issued-by-the-owning-host.md)
> **Risk:** [RSK-SQ-001](../risks.md#rsk-sq-001)

```
REQUIREMENT: `Series.open(origin, name)` MUST fail with `NotOwner { origin,
             configured }` unless `origin` equals this host's configured
             durable-bus origin. There is no exception: a later incarnation
             of the same node records the supersession of an old series in
             its own stream, never in the old series (BEH-SQ-009).
```

```
REQUIREMENT: The package MUST NOT offer an authority-side `next()`: an
             authority records series events it receives and never issues a
             number in another host's series.
```

## BEH-SQ-003: Series.open creates or resumes a series

> **See:** [ADR-SQ-002](../decisions/002-a-series-is-an-event-store-stream.md)

```ts
// illustrative — not type-checked
interface Series {
  readonly key: SeriesKey
  readonly seriesId: string
  readonly next: (options?: { subject?: { stream: string; eventId?: string }; context?: OperationContext }) =>
    Effect.Effect<{ readonly seriesId: string; readonly number: number }, SeriesClosed | WrongExpectedVersion | AppendError,
                  EventStore | StoreTransaction>
  readonly close: (reason: string) =>
    Effect.Effect<{ readonly last: number }, SeriesClosed | WrongExpectedVersion | AppendError, EventStore | StoreTransaction>
}
declare const Series: {
  readonly open: (origin: string, name: string) =>
    Effect.Effect<Series, NotOwner | SeriesNameInvalid | WrongExpectedVersion | LoadError | AppendError,
                  Sequence | EventStore | StoreTransaction>
}
// AppendError, LoadError and WrongExpectedVersion are event-store's (BEH-ES-003, BEH-ES-006);
// WrongExpectedVersion is not a member of AppendError and is listed wherever an append states an expected version
```

```
REQUIREMENT: When the stream of the series has no event, `open` MUST append
             `SeriesOpened { seriesId, origin, name, previous? }` with
             `expectedVersion: "no-stream"`. When it has, `open` MUST return
             the series without writing. Opening a closed series MUST
             succeed and its `next()` MUST fail with `SeriesClosed`. Two
             concurrent first `open`s MUST end with one commit and one
             `WrongExpectedVersion`, which the caller retries in a new
             transaction (the retry finds the series and writes nothing).
```

## BEH-SQ-004: next() reserves a number in the caller's transaction

> **Invariant:** [INV-SQ-001](../invariants.md#inv-sq-001-committed-numbers-are-1-to-n-each-once)
> **See:** [ADR-SQ-002](../decisions/002-a-series-is-an-event-store-stream.md)
> **Satisfies:** [URS-BR-057](../../core/urs.md#urs-br-057-number-records-per-host-without-gaps-reuse-or-renumbering)
> **Depends on:** [BEH-ES-005](../../event-store/behaviors/01-streams-and-append.md#beh-es-005-append-runs-inside-the-callers-storetransaction)
> **Risk:** [RSK-SQ-001](../risks.md#rsk-sq-001)

```
REQUIREMENT: `next()` MUST read the series stream's version v in the
             caller's `StoreTransaction` and append `NumberIssued {
             seriesId, number, subject? }` with `expectedVersion: v`, where
             `number` is the count of `NumberIssued` events before it plus
             one. It MUST NOT open, commit or retry a transaction.
```

```
REQUIREMENT: The number, the `NumberIssued` event and the application's
             event that carries the number MUST commit together or not at
             all (event-store INV-ES-002). A rolled-back transaction MUST
             leave the number free for the next `next()`.
```

A conflicting `next()` in another transaction fails with
`WrongExpectedVersion` and is retried by the caller, normally with event-store
`Aggregate.run` semantics (BEH-ES-012).

## BEH-SQ-005: Committed numbers are contiguous and never renumbered

> **Invariant:** [INV-SQ-001](../invariants.md#inv-sq-001-committed-numbers-are-1-to-n-each-once), [INV-SQ-002](../invariants.md#inv-sq-002-a-committed-number-is-never-changed-or-reassigned)
> **See:** [ADR-SQ-002](../decisions/002-a-series-is-an-event-store-stream.md)
> **Satisfies:** [URS-BR-057](../../core/urs.md#urs-br-057-number-records-per-host-without-gaps-reuse-or-renumbering)

```
REQUIREMENT: The committed `NumberIssued` events of a series MUST carry
             1 … n, each once, in stream order. The package MUST NOT change,
             reissue or skip a committed number, and MUST offer no operation
             that does.
```

## BEH-SQ-006: A number is handed out only after commit

> **Risk:** [RSK-SQ-002](../risks.md#rsk-sq-002)

```
REQUIREMENT: Documentation MUST state the obligation: a number returned by
             `next()` MUST NOT be shown, printed or sent outside the
             transaction until the transaction has committed. The testing
             entry point MUST offer a fixture that fails a test when a
             number is observed before commit (BEH-SQ-019).
```

The package cannot see a printer. It can make the rule explicit and testable.

## BEH-SQ-007: close(reason) ends a series

> **Invariant:** [INV-SQ-003](../invariants.md#inv-sq-003-no-number-after-closure)
> **See:** [ADR-SQ-003](../decisions/003-a-restore-closes-the-old-series.md)

```
REQUIREMENT: `close(reason)` MUST append `SeriesClosed { seriesId, last,
             reason, by }` with the expected version read, where `last` is
             the highest committed number (0 when none) and `by` is the
             closing origin. After it commits, `next()` MUST fail with
             `SeriesClosed { seriesId, last }`. Closing a closed series MUST
             fail with `SeriesClosed`. `reason` MUST be non-empty and
             documentation MUST state that it carries no personal data.
```

## BEH-SQ-008: Series events are attributed, and are not core audit records

> **Core seam:** [22 — Attributable Operations](../../core/behaviors/22-attributable-operations.md) (BEH-BR-187), [23 — Audit Sink and Record](../../core/behaviors/23-audit-sink-and-record.md) (BEH-BR-207), [29 — Capability Grants and Call Log](../../core/behaviors/29-capability-grants-and-call-log.md) (BEH-BR-273)
> **Satisfies:** [URS-BR-054](../../core/urs.md#urs-br-054-follow-one-request-through-everything-it-causes)

```
REQUIREMENT: Series events MUST be stored through the event store, so that
             they carry actor, `onBehalfOf`, `CurrentCorrelation` and wire
             annotations as event-store BEH-ES-007 specifies. The package
             MUST NOT write to core's `AuditSink`.
```

```
REQUIREMENT: The `Sequence` service MUST be a core contract provided by a
             plugin, so that grants on `next` and `close` apply per method
             (core BEH-BR-273).
```

**Settled here.** (1) The incarnation is part of a series' identity
(BEH-SQ-001). (2) Only the owning origin issues numbers; authorities never do
(BEH-SQ-002). (3) `next()` is an append with an expected version in the
caller's transaction (BEH-SQ-004). (4) Nothing is renumbered (BEH-SQ-005).
(5) Hand-out before commit is the application's to avoid, made testable
(BEH-SQ-006).

**Open.** (1) Reopening a series closed by mistake, which this revision
forbids (a new name is required). (2) Several series updated in one call.

---

_Previous: [Overview](../overview.md)_ · _Next: [02 — Incarnation and verification](./02-incarnation-and-verification.md)_
