# 03 — Projections and Snapshots

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ES-BEH-03                                            |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.2 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-09) — BEH-ES-020: a batch refused during a whole-store install or its holds (`StoreUnavailable` "store-swap") is retried once `whenReadable` completes, uncounted (H5); second pass (cleanest design): the refusal is the dedicated `StoreSwapInProgress` (or `OutboxFrozen`), no longer `StoreUnavailable` "store-swap" (CCR-ES-011)<br>0.1 (2026-11-08): Initial draft (CCR-ES-001)                 |

---

A projection is a read model built from events; a snapshot is folded state
kept to shorten a load. This file specifies both, with the rule that neither
may skip an event or outrank the events it was built from. This file owns
BEH-ES-017–024 and uses all eight.

Planned source: `packages/event-store/src/Projection.ts`,
`packages/event-store/src/Snapshot.ts` *(Planned)*.

## BEH-ES-017: A projection is declared with a name, a version and its events

> **See:** [ADR-ES-001](../decisions/001-the-application-keeps-the-domain.md)

```ts
// illustrative — not type-checked
interface ProjectionSpec {
  readonly name: string                                  // unique per store
  readonly version: number                               // the projection's schema version (BEH-ES-022)
  readonly events: readonly DurableEvent<any, any>[] | "all"
  readonly apply: (e: ReadEvent<unknown>) => Effect.Effect<void, ProjectionFailed, StoreTransaction>
  readonly reset: Effect.Effect<void, ProjectionFailed, StoreTransaction>
}
declare const Projection: { readonly make: (spec: ProjectionSpec) => Projection }
```

```
REQUIREMENT: Projection tables, their schema and `apply` MUST be the
             application's. The package MUST store only the checkpoint
             `{ name, version, position }` and the projection's status.
```

## BEH-ES-018: Inline projections commit with the append

> **Invariant:** [INV-ES-002](../invariants.md#inv-es-002-an-append-and-its-outbox-entries-commit-together-or-not-at-all)

```
REQUIREMENT: A projection run with `Projections.inline` MUST have `apply`
             called for each matching event of every append, inside the
             append's `StoreTransaction`, after the events are written. A
             failure of `apply` MUST fail the append, so that events and the
             inline read model commit together or not at all.
```

Inline projections give read-your-writes at the cost of making every append
depend on them; documentation MUST say so and recommend them only for small,
local read models.

## BEH-ES-019: Async projections follow positions with a checkpoint in the same transaction

> **Invariant:** [INV-ES-004](../invariants.md#inv-es-004-a-projection-never-skips-a-committed-event)
> **Risk:** [RSK-ES-002](../risks.md#rsk-es-002)

```
REQUIREMENT: A projection run with `Projections.follow` MUST read
             committed events in `position` order after its checkpoint, in
             batches, and for each batch MUST call `apply` for every
             matching event and write the new checkpoint in one
             `StoreTransaction`.
```

```
REQUIREMENT: The follower MUST be a background fiber in the scope of the
             plugin that runs it, MUST stop when that scope closes, and MUST
             resume from the stored checkpoint, so that an event is applied
             once for every committed checkpoint — exactly once in effect
             for writes in the store, at least once for any effect outside
             it.
```

## BEH-ES-020: A failing projection halts and reports — it never skips

> **Invariant:** [INV-ES-004](../invariants.md#inv-es-004-a-projection-never-skips-a-committed-event)
> **Risk:** [RSK-ES-002](../risks.md#rsk-es-002)

```
REQUIREMENT: When `apply` fails, or an event cannot be read
             (`UnknownEventVersion`, BEH-ES-006), the follower MUST roll back
             the batch, retry with bounded backoff (`maxAttempts`, default
             5), and then halt at that position with status `halted { at,
             cause }`. It MUST NOT advance the checkpoint past an event it
             did not apply. A batch refused during a whole-store install or
             its holds (`StoreSwapInProgress` or `OutboxFrozen`, BEH-ES-034) rolls
             back without counting toward `maxAttempts` and is retried once
             durable-bus `DurableBus.whenReadable` completes.
```

```
REQUIREMENT: `Projections.status` MUST report, per projection, `running`,
             `halted` or `rebuilding`, the checkpoint, the store's head
             position and the lag between them, as a current value and a
             stream.
```

The event delivery companion can park one envelope and continue (BEH-DB-021); a projection
cannot, because a read model missing one event is wrong without saying so.

## BEH-ES-021: Rebuild resets and replays

> **Invariant:** [INV-ES-004](../invariants.md#inv-es-004-a-projection-never-skips-a-committed-event)

```
REQUIREMENT: `Projections.rebuild(name)` MUST stop the follower, run
             `reset` and set the checkpoint to 0 in one transaction, set the
             status to `rebuilding`, and follow from position 0 to the head,
             then report `running`.
```

```
REQUIREMENT: Readers of a rebuilding projection MUST be able to see its
             status; the package MUST NOT present a rebuilding projection as
             current.
```

A rebuild into a shadow table that replaces the live one when caught up is an
application technique the package does not prevent; it is Open below.

## BEH-ES-022: A projection version change requires a rebuild

> **Risk:** [RSK-ES-005](../risks.md#rsk-es-005)

```
REQUIREMENT: When a projection starts with a `version` different from its
             stored checkpoint's, the follower MUST NOT apply events onto the
             old read model: it MUST rebuild (BEH-ES-021) when the projection
             was declared with `onVersionChange: "rebuild"` (the default),
             and otherwise halt with cause `version-changed`.
```

## BEH-ES-023: Snapshots — policy, write and load

> **Invariant:** [INV-ES-005](../invariants.md#inv-es-005-a-snapshot-is-a-cache)

```ts
// illustrative — not type-checked
interface SnapshotPolicy<S> {
  readonly every: number                                  // write after every n events of a stream
  readonly stateVersion: number                           // raised whenever S or evolve changes meaning
  readonly schema: Schema.Codec<S, unknown>
}
interface StoredSnapshot { readonly stream: string; readonly streamVersion: number; readonly stateVersion: number; readonly state: unknown }
```

```
REQUIREMENT: A load with a snapshot policy MUST read the newest snapshot of
             the stream whose `stateVersion` equals the policy's, fold the
             events after its `streamVersion`, and otherwise fold from
             `initial`. A snapshot MUST be written only with state obtained
             by the fold, MAY be written in the append's transaction or
             after it, and its write failure MUST NOT fail the append.
```

## BEH-ES-024: A snapshot is a cache, never a source of truth

> **Invariant:** [INV-ES-005](../invariants.md#inv-es-005-a-snapshot-is-a-cache)
> **Risk:** [RSK-ES-005](../risks.md#rsk-es-005)

```
REQUIREMENT: Deleting every snapshot MUST change no state the package
             returns, only the time it takes. Snapshots of another
             `stateVersion`, or that fail to decode, MUST be ignored and
             logged at warning level.
```

```
REQUIREMENT: `Snapshots.verify(decider, stream)` MUST fold the stream from
             `initial` and report whether the newest usable snapshot equals
             the fold at its `streamVersion`; it MUST NOT repair anything.
```

**Settled here.** (1) The checkpoint commits with the projection's writes
(BEH-ES-019). (2) A failing projection halts; it never skips (BEH-ES-020).
(3) A version change rebuilds or halts (BEH-ES-022). (4) Snapshots are caches,
versioned by `stateVersion` (BEH-ES-023, BEH-ES-024).

**Open.** (1) Shadow rebuild with an atomic switch. (2) Snapshot retention
(how many to keep). (3) Projections that read events of several stores.

---

_Previous: [02 — Decide and evolve](./02-decide-and-evolve.md)_ · _Next: [04 — Versions, publication and chaining](./04-versions-publication-and-chaining.md)_
