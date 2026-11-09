# 03 — Formats, Testing and Acceptance

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-SQ-BEH-03                                            |
> | Revision       | 0.3                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.3 (2026-11-09): BEH-SQ-019 adds a `rebootstrap` fixture; BEH-SQ-020 check 1 covers handles of an earlier origin, checks 11 (re-bootstrap on a running host) and 12 (grants on the `Sequence` members) added (CCR-SQ-003)<br>0.2 (2026-11-08): BEH-SQ-020 checks 7 and 8 follow the supersession stream and decoded `verifySeries` inputs (CCR-SQ-002)<br>0.1 (2026-11-08): Initial draft (CCR-SQ-001)                 |

---

This file specifies where number formats live, the package's storage
footprint, test fixtures and the acceptance checks. This file owns
BEH-SQ-017–024 and uses BEH-SQ-017–020; the remaining four identifiers of the
block are reserved.

Planned source: `packages/sequence/testing/` *(Planned)*.

## BEH-SQ-017: Number formats stay in the application

> **See:** [ADR-SQ-004](../decisions/004-formats-and-meaning-stay-in-the-application.md)

```
REQUIREMENT: The package MUST store and return numbers as positive integers
             only. It MUST NOT format, prefix, pad or reset numbers by date;
             a series that restarts per period is a new series name chosen
             by the application.
```

## BEH-SQ-018: No storage of its own

> **Depends on:** [BEH-ES-033](../../event-store/behaviors/05-storage-port-and-acceptance.md#beh-es-033-the-eventstoreadapter-port)

```
REQUIREMENT: The package MUST keep series only as event-store streams and
             MUST NOT define a storage port. Any cache of the current number
             MUST be rebuilt from the stream and MUST NOT be read by
             `next()` in place of the stream version.
```

## BEH-SQ-019: Test fixtures

> **Core seam:** [24 — Time, Identifiers and Sequence](../../core/behaviors/24-time-ids-and-sequence.md) (BEH-BR-209, BEH-BR-210)

```
REQUIREMENT: The testing entry point MUST export `memorySequence` (over
             event-store `memoryEventStore`), a `restore` fixture that rolls a
             store back to an earlier copy and raises or keeps the
             incarnation, a `rebootstrap` fixture that runs a durable-bus
             whole-store install over memory stores on a running host, and
             `assertNotHandedOutBeforeCommit`, which fails
             a test when a number is observed by a probe before its
             transaction commits.
```

## BEH-SQ-020: Required acceptance checks

> **See:** [ADR-BR-035](../../core/decisions/035-evidence-from-executed-tests.md)
> **Satisfies:** [URS-BR-025](../../core/urs.md#urs-br-025-generate-qualification-evidence-from-executed-tests)
> **Risk:** [RSK-BR-018](../../core/gxp/03-risk-assessment.md#rsk-br-018)

```
REQUIREMENT: The package's test suite MUST contain at least one test for
             each of the following (planned acceptance scenarios
             REQ-SQ-001–012, traceability §2):
             1. Identity and ownership: name grammar; `NotOwner` for another
                origin, at `open`, `next` and `close`; no authority-side
                `next()` (BEH-SQ-001, BEH-SQ-002).
             2. Open: created once, resumed without writing (BEH-SQ-003).
             3. Reservation: number, `NumberIssued` and the application's
                event commit together; rollback frees the number; two
                concurrent `next()` produce one commit and one
                `WrongExpectedVersion` (BEH-SQ-004).
             4. Contiguity: generated sequences of commits and rollbacks
                leave 1 … n each once (BEH-SQ-005).
             5. Hand-out fixture detects a number observed before commit
                (BEH-SQ-006, BEH-SQ-019).
             6. Close: `next()` after close fails; double close fails
                (BEH-SQ-007).
             7. Restore: with a raised incarnation, the plugin's start
                appends one `SeriesSuperseded` per open series of lower
                incarnations (including a per-period name never reopened) to
                the new incarnation stream, writes nothing in any old series
                stream, and numbering restarts under a new id; a chain over
                the old series verifies without a break; without a raised
                incarnation the authority's inbox stops the stream with
                `EnvelopeConflict` and the store records no reissued number
                (BEH-SQ-009, BEH-SQ-010, BEH-SQ-013).
             8. Verification: purity and totality over decoded inputs in any
                order (property test); gaps, duplicates, after-close, foreign
                writer (including a `SeriesSuperseded` from another node),
                missing previous, retirement (BEH-SQ-012–015).
             9. Chaining: chain `seq` equals stream version; series id is not
                a host id (BEH-SQ-016).
             10. Formats and storage: integers only; no storage port; no
                 cache read by `next()` (BEH-SQ-017, BEH-SQ-018).
             11. Re-bootstrap on a running host: after a whole-store install
                 (`rebootstrap` fixture) whose snapshot holds none of this
                 node's series, a handle opened before it fails `next` and
                 `close` with `NotOwner` and writes nothing; calls under the
                 new origin fail with `SupersessionPending` until the step
                 commits; every series open in the replaced store is
                 superseded once, with its highest number and
                 `lastKnownOnly: false`; a series also present in the
                 snapshot is not superseded twice; a name reopened writes
                 `previous` (BEH-SQ-002, BEH-SQ-009, BEH-SQ-010).
             12. Grants: a capture of `Sequence` granted `open` and `next`
                 issues numbers through a `Series` handle and is refused
                 `close`; the plugin appends through its own `EventStore`
                 capture (BEH-SQ-003, BEH-SQ-008).
```

**Settled here.** (1) Integers only (BEH-SQ-017). (2) The event store is the
only storage (BEH-SQ-018). (3) The hand-out rule is testable (BEH-SQ-019).

**Open.** None in this revision beyond those of 01 and 02.

---

_Previous: [02 — Incarnation and verification](./02-incarnation-and-verification.md)_ · _Next: [Invariants](../invariants.md)_
