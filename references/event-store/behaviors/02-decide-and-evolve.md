# 02 — Decide and Evolve

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ES-BEH-02                                            |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.2 (2026-11-08): BEH-ES-013 retries under an adapter savepoint, maps conflicts to `StoreContention`, gives commit-time conflicts to the transaction owner and adds `Aggregate.recordFact`; BEH-ES-015 stores the fact identifier in `factId`, never in `eventId` (CCR-ES-002)<br>0.1 (2026-11-08): Initial draft (CCR-ES-001)                 |

---

This file specifies the decider — `evolve` folds events into state, `decide`
turns a command into events — and the two ways of running it: commands, which
may be refused, and facts, which may not. This file owns BEH-ES-009–016 and
uses all eight.

Planned source: `packages/event-store/src/Aggregate.ts` *(Planned)*.

## BEH-ES-009: A decider has an initial state, evolve and decide

> **See:** [ADR-ES-001](../decisions/001-the-application-keeps-the-domain.md)

```ts
// illustrative — not type-checked
interface Decider<S, C, E, Err> {
  readonly initial: S
  readonly evolve: (state: S, event: E) => S
  readonly decide: (state: S, command: C) => Effect.Effect<readonly E[], Err>   // R = never
  readonly streamOf: (command: C) => string
  readonly snapshot?: SnapshotPolicy<S>                                          // 03, BEH-ES-023
}
interface FactDecider<S, F, E> {
  readonly initial: S
  readonly evolve: (state: S, event: E) => S
  readonly accept: (state: S, fact: F) => readonly [E, ...E[]]                  // no error channel
  readonly streamOf: (fact: F) => string
  readonly factId: (fact: F) => string                                           // BEH-ES-015
  readonly snapshot?: SnapshotPolicy<S>
}
```

```
REQUIREMENT: The package MUST treat `initial`, `evolve`, `decide` and
             `accept` as the application's: it MUST NOT inspect state,
             commands or events beyond calling these functions and encoding
             the events with their `DurableEvent`.
```

```
REQUIREMENT: `decide` MUST have no service requirement (`R = never`), so
             that it cannot read the store, the clock or the network; time
             and identifiers it needs MUST arrive in the command.
```

## BEH-ES-010: evolve is pure and total

> **Invariant:** [INV-ES-005](../invariants.md#inv-es-005-a-snapshot-is-a-cache)
> **Risk:** [RSK-ES-005](../risks.md#rsk-es-005)

```
REQUIREMENT: The package MUST compute state only as the left fold of
             `evolve` over the stream's events from `initial`, or from a
             snapshot taken by the same fold (BEH-ES-023). Documentation MUST
             state that `evolve` must be pure and total: an event that is
             stored happened, and `evolve` must not throw on it.
```

```
REQUIREMENT: When `evolve` throws or dies, the load MUST fail with
             `EvolveFailed { stream, streamVersion, type }` as a defect, and
             MUST NOT skip the event or return partial state.
```

## BEH-ES-011: Aggregate.handle runs inside the caller's transaction

> **Invariant:** [INV-ES-002](../invariants.md#inv-es-002-an-append-and-its-outbox-entries-commit-together-or-not-at-all)
> **See:** [ADR-ES-004](../decisions/004-optimistic-concurrency-per-stream.md)
> **Risk:** [RSK-ES-001](../risks.md#rsk-es-001)

```ts
// illustrative — not type-checked
declare const Aggregate: {
  readonly handle: <S, C, E, Err>(decider: Decider<S, C, E, Err>, command: C, options?: { context?: OperationContext }) =>
    Effect.Effect<{ readonly state: S; readonly result: AppendResult },
      Err | WrongExpectedVersion | LoadError | AppendError, EventStore | StoreTransaction>
}
```

```
REQUIREMENT: `handle` MUST read the stream named by `streamOf(command)`
             within the caller's `StoreTransaction`, fold it (BEH-ES-010),
             call `decide`, and append the returned events with
             `expectedVersion` equal to the version it read. It MUST return
             the new state, folded over the appended events.
```

```
REQUIREMENT: `handle` MUST NOT retry. A `WrongExpectedVersion` MUST be
             returned to the caller, whose transaction then fails or rolls
             back by the caller's own handling.
```

Retrying inside a transaction is unsafe on engines that mark a transaction
failed after an error, and it would hide the conflict from the caller who
owns the transaction.

## BEH-ES-012: Aggregate.run retries the whole transaction on a conflict

> **See:** [ADR-ES-004](../decisions/004-optimistic-concurrency-per-stream.md)
> **Risk:** [RSK-ES-001](../risks.md#rsk-es-001)

```
REQUIREMENT: `Aggregate.run(decider, command, { retries, context? })` MUST
             open a transaction with the adapter's combinator, run
             `handle` in it, and, when the transaction fails with
             `WrongExpectedVersion`, run a new transaction from the read,
             at most `retries` more times (default 0). Every other failure
             MUST end `run` at once.
```

```
REQUIREMENT: Each retry MUST read the stream again and call `decide`
             again; the package MUST NOT reuse events decided against an
             older state.
```

## BEH-ES-013: Facts are recorded through Aggregate.record, which cannot reject

> **Invariant:** [INV-ES-006](../invariants.md#inv-es-006-recording-a-fact-cannot-fail-for-a-rule)
> **See:** [ADR-ES-005](../decisions/005-offline-facts-are-recorded-never-rejected.md)
> **Satisfies:** [URS-BR-043](../../core/urs.md#urs-br-043-deliver-business-events-across-hosts-and-outages-without-loss-or-duplication-of-effect)
> **Risk:** [RSK-ES-004](../risks.md#rsk-es-004)

```ts
// illustrative — not type-checked
class StoreContention extends Data.TaggedError("StoreContention")<{
  readonly stream: string
  readonly attempts: number
  readonly detected: "insert" | "commit"        // where the last conflict was seen (BEH-ES-004)
}> {}
declare const Aggregate: {
  // inside the caller's transaction; retries under a savepoint (BEH-ES-033)
  readonly record: <S, F, E>(decider: FactDecider<S, F, E>, fact: F, options?: { context?: OperationContext; retries?: number }) =>
    Effect.Effect<{ readonly state: S; readonly result: AppendResult | "already-recorded" },
      LoadError | AppendError | StoreContention, EventStore | StoreTransaction>     // no rule error, no WrongExpectedVersion
  // owns the transaction, as `run` does for commands; retries whole transactions
  readonly recordFact: <S, F, E>(decider: FactDecider<S, F, E>, fact: F, options?: { context?: OperationContext; retries?: number }) =>
    Effect.Effect<{ readonly state: S; readonly result: AppendResult | "already-recorded" },
      LoadError | AppendError | StoreContention | StoreUnavailable, EventStore>
}
```

```
REQUIREMENT: `record` MUST append the events `accept` returns. Its error
             type MUST contain no rule error and no `WrongExpectedVersion`.
             It MUST run its read, `accept` and append inside a savepoint of
             the caller's transaction (`EventStoreAdapter.savepoint`,
             BEH-ES-033). When the append fails with `WrongExpectedVersion`
             at insert, `record` MUST roll back to that savepoint — undoing
             only its own read and append, never another write of the
             caller's transaction — and read the stream again, call `accept`
             again and append again, up to `retries` (default 3). Past them
             it MUST fail with `StoreContention { detected: "insert" }`, an
             operational error, never a refusal of the fact. The caller's
             transaction stays usable after `StoreContention`; the caller
             decides whether to commit its other writes or roll back.
```

```
REQUIREMENT: On an adapter that declares `savepoints: false`, or that
             detects conflicts only at commit (BEH-ES-004), `record` MUST NOT
             retry inside the transaction: it MUST map an insert-time
             `WrongExpectedVersion` to `StoreContention { attempts: 1 }`.
             A commit-time `WrongExpectedVersion { actual: "unknown" }` is
             raised by the transaction combinator, outside `record`, to the
             owner of the transaction. Documentation MUST say so, and the two
             owners the package provides MUST retry it in a new transaction:
             `recordFact` opens the adapter's transaction, runs `record` in
             it, and on `WrongExpectedVersion` or `StoreContention` from the
             transaction runs a new one from the read, up to `retries`
             (default 3), then fails with `StoreContention { detected }`;
             `EventStore.receive` relies on durable-bus, which retries a
             failed handler transaction in a new transaction and halts the
             subscription after its attempts (BEH-ES-030, BEH-DB-021).
```

```
REQUIREMENT: `accept` MUST return at least one event. Documentation MUST
             state that the first event records the fact itself and that
             any broken rule is expressed by further events, never by
             failing.
```

The savepoint is what makes the in-transaction retry possible on Postgres,
where a unique-constraint violation aborts the whole transaction unless it
happens under a savepoint that is then rolled back; on SQLite, where the
write lock is held from the start of the transaction (BEH-ES-035), no other
writer can commit in between and the retry is never taken. `handle`
(BEH-ES-011) does not retry, because a refused command is the caller's to
handle; `record` retries because a fact must not be lost to contention.
What a caller sees in every case is the fact recorded, "already-recorded",
or an operational error (`StoreContention`, `StoreUnavailable`, an encoding
error) — never a rule refusal and never a conflict it must interpret.

## BEH-ES-014: Rule violations are events — a pattern the store supports

> **See:** [ADR-ES-005](../decisions/005-offline-facts-are-recorded-never-rejected.md)
> **Risk:** [RSK-ES-004](../risks.md#rsk-es-004)

```
REQUIREMENT: Documentation MUST describe the pattern: input that happened
             while offline — the customer has left, the goods are gone — is
             a fact; a host that receives it later (an authority) records
             it with `record`, and any rule it breaks (a limit, a balance
             below zero, a missing approval) is emitted as a violation event
             for review, never thrown. Only commands made online, before the
             effect, are refused (`handle`).
```

```
REQUIREMENT: The package MUST NOT decide which input is a fact. Choosing
             `record` or `handle` for an input type MUST remain the
             application's, and the package MUST NOT convert one into the
             other.
```

The package supports the pattern by giving it a type that has no failure
channel for rules; it cannot make an application use it.

## BEH-ES-015: Recording a fact is idempotent by its fact identifier

> **Invariant:** [INV-ES-006](../invariants.md#inv-es-006-recording-a-fact-cannot-fail-for-a-rule)
> **Depends on:** [BEH-DB-018](../../durable-bus/behaviors/03-delivery-and-inbox.md#beh-db-018-the-inbox-accepts-the-next-sequence-ignores-repeats-and-stops-at-gaps)
> **Risk:** [RSK-ES-004](../risks.md#rsk-es-004)

```
REQUIREMENT: The first event of a recorded fact MUST be stored with
             `factId = decider.factId(fact)`; `eventId` follows BEH-ES-002 and
             is never the fact identifier. When the stream already holds an
             event with that `factId`, `record` MUST append nothing and
             return "already-recorded".
```

```
REQUIREMENT: The adapter MUST enforce one `factId` per stream with a
             constraint of the engine and MUST be able to answer, within the
             transaction, whether a stream holds a `factId` (`hasFact`,
             BEH-ES-033), so that a fact redelivered after its inbox entry was
             pruned, or reaching the host by a second path, is still recorded
             once.
```

```
REQUIREMENT: Documentation MUST recommend that the fact identifier be part
             of the fact's payload, assigned once where the fact happened, so
             that it survives re-publication by intermediate hosts (each of
             which gives the event a new `eventId`, BEH-ES-028). A `toFact`
             that takes the received envelope's `eventId` as fact identifier
             MUST be documented as idempotent for one hop only.
```

Keeping the fact's identity apart from the event's own id gives one rule for
both: `eventId` names this store's event and, when published, its envelope;
`factId` names the fact on every host that records it. A host that records a
received fact and publishes it again therefore needs no id that is both the
sender's and fresh.

## BEH-ES-016: A refused command appends nothing

> **See:** [ADR-ES-004](../decisions/004-optimistic-concurrency-per-stream.md)

```
REQUIREMENT: When `decide` fails with `Err`, `handle` and `run` MUST append
             nothing and return `Err` unchanged. When `decide` returns no
             event, they MUST append nothing and succeed.
```

```
REQUIREMENT: The package MUST NOT record refusals itself. An application
             that keeps refused commands records them as its own events or
             through core's gate and audit, which concern plugin lifecycle,
             not business commands (core BEH-BR-207).
```

**Settled here.** (1) `decide` has no services (BEH-ES-009). (2) State is the
fold of `evolve` only (BEH-ES-010). (3) `handle` never retries; `run` retries
whole transactions (BEH-ES-011, BEH-ES-012). (4) `record` has no rule error
and no conflict error, and is idempotent by fact id (BEH-ES-013, BEH-ES-015).
(5) The fact pattern is supported, not enforced (BEH-ES-014). (6) `record`
retries under a savepoint; commit-time conflicts belong to the transaction's
owner, and `recordFact` and `receive` retry them in a new transaction
(BEH-ES-013). (7) `factId` and `eventId` are separate fields (BEH-ES-015).

**Open.** (1) Deciders that write several streams in one decision (a process
manager), which this revision leaves to the application with several
appends in one transaction. (2) A standard shape for violation events, which
this revision leaves to the application.

---

_Previous: [01 — Streams and append](./01-streams-and-append.md)_ · _Next: [03 — Projections and snapshots](./03-projections-and-snapshots.md)_
