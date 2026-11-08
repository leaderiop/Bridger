# Overview

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-SQ-OVW                                               |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification — Overview (companion)              |
> | Change History | 0.2 (2026-11-08): Restore closure in the new incarnation's stream; `SeriesSuperseded` and decoded `verifySeries` inputs; limit 3 states the inbox conflict (CCR-SQ-002)<br>0.1 (2026-11-08): Initial draft (CCR-SQ-001)                 |

---

## Mission

Many records carry a number that a person already holds when the record
reaches anyone else: a printed document, a receipt, a ticket. In a local-first
system the host that printed it may be offline. If the number were assigned
later by an authority, the number in the person's hand would be wrong; if two
hosts drew from one counter, they would collide. `@bridger/sequence`
specifies the alternative:

- every **series** belongs to one **origin** — the host's durable-bus origin
  `node#incarnation` — and only that host issues its numbers;
- `next()` takes the next number **inside the caller's transaction**, the same
  one that appends the event carrying the number, so a rolled-back record
  releases its number and committed numbers have no holes;
- a series can be **closed**, after which it issues nothing; nothing is ever
  renumbered;
- the series is published to an **authority**, which verifies it — gaps,
  duplicates, numbers after closure, a foreign writer;
- a host **restored from a backup** starts a new incarnation; when the plugin
  starts, every open series under the old incarnation is closed as superseded
  by an event in the new incarnation's own stream (the old series is never
  written again), and numbering restarts
  under a new series id, so no number is ever issued twice under one id;
- a series may be **chained** through audit-chain's `ChainSink<R>`.

## Package boundary

| Package | Relationship |
| ------- | ------------ |
| `@bridger/core` | Dependency: attribution, contracts, grants, `AccessPolicy`. Core does not know series exist. |
| `@bridger/event-store` | Dependency: a series is a stream; `next()` is an append with an expected version in the caller's `StoreTransaction`. |
| `@bridger/durable-bus` | Dependency: the configured origin and incarnation; publication of series events to the authority. |
| `@bridger/audit-chain` | Optional: `ChainSink<R>` over series events. |
| Application | Number formats, which records take a number, the authority's response to a finding. |

Planned source: `packages/sequence/src/` *(Planned)*, testing entry point
`@bridger/sequence/testing` *(Planned)*.

## Public API surface

All signatures are illustrative until code exists.

| Export | Kind | Purpose | Behaviour |
| ------ | ---- | ------- | --------- |
| `Sequence` | service (contract) | Provided by the sequence plugin | [01](./behaviors/01-series-and-ownership.md) |
| `Series.open(origin, name)` | function | Open (or create) the series this host owns | [01](./behaviors/01-series-and-ownership.md) |
| `Series#next(options?)` | member | Reserve the next number in the caller's transaction | [01](./behaviors/01-series-and-ownership.md) |
| `Series#close(reason)` | member | Close the series | [01](./behaviors/01-series-and-ownership.md) |
| `SeriesOpened`, `NumberIssued`, `SeriesClosed` | events | The package's own `DurableEvent`s | [01](./behaviors/01-series-and-ownership.md) |
| `SeriesSuperseded` | event | Supersession of an old incarnation's series, in the new incarnation's stream | [02](./behaviors/02-incarnation-and-verification.md) |
| `verifySeries`, `SeriesEventInput.of` | functions | Pure check of decoded series events, ordered by number | [02](./behaviors/02-incarnation-and-verification.md) |
| `SeriesRegistry` | function | Authority view across incarnations of a node | [02](./behaviors/02-incarnation-and-verification.md) |
| `Series.chainSpec` | function | The `SeriesSpec` for `ChainSink.make` | [02](./behaviors/02-incarnation-and-verification.md) |
| `memorySequence`, `SeriesFixtures` | fixtures | Testing entry point only | [03](./behaviors/03-formats-testing-and-acceptance.md) |

## Worked example

```ts
// illustrative — not type-checked
import { Series } from "@bridger/sequence"
import { Stream } from "@bridger/event-store"

const issueDocument = (doc: DocumentDraft) =>
  adapter.transaction(Effect.gen(function* () {
    const series = yield* Series.open(yield* Origin.current, "documents")    // this host's origin only
    const { number } = yield* series.next({ subject: { stream: `doc-${doc.id}` } })
    yield* Stream.append(`doc-${doc.id}`, [DocumentIssued.of({ ...doc, number })], { expectedVersion: "no-stream" })
    return number                                    // printed only after the transaction commits
  }))

// The application formats the number; the package stores an integer.
const label = (n: number) => `D-${String(n).padStart(6, "0")}`

// At the authority:
const report = verifySeries(readSeriesEvents.map(SeriesEventInput.of).filter(isDefined))   // decoded reads, any order
// report.series[id].receivedThrough, .gaps, .duplicates, .issuedAfterClose, .closure
```

## What stays in core

Attribution, `CurrentCorrelation`, `Clock`, `IdGenerator`, contracts and
policy. Core's `auditSeq` numbers lifecycle records of one host
([BEH-BR-212](../core/behaviors/24-time-ids-and-sequence.md)); it is not a
business number series and the package does not reuse it.

## What stays in the application

- Number formats and their rendering (ADR-SQ-004).
- Which records take a number from which series, and never handing a number
  out before commit.
- Raising the incarnation after a restore (operator obligation).
- What the authority does with a finding (review, a report to a regulator,
  a correction event).

## Limits

1. A number printed before commit and then rolled back is outside the
   contiguity statement (RSK-SQ-002).
2. Numbers issued after the last backup and lost with the host cannot be
   found from the series alone (BEH-SQ-010).
3. A restore without a raised incarnation reissues numbers under the same
   series id; the authority's inbox stops the stream with `EnvelopeConflict`
   while it still holds the first event ids, and otherwise absorbs the
   resends without recording them (BEH-SQ-013, durable-bus BEH-DB-004).
4. Verification covers what the authority received; delivery is in order per
   stream, so "received through n" is a lower bound, not the series' end.

---

_Previous: [README](./README.md)_ · _Next: [01 — Series and ownership](./behaviors/01-series-and-ownership.md)_
