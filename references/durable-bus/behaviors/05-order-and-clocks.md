# 05 — Order and hybrid logical clocks

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-DB-BEH-05                                            |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.2 (2026-11-08): Resolutions of the agent review of 2026-11-08 — the clock after a receipt is saved in the inbox transaction and the start value is the higher of it and the outbox's highest HLC; the publish tick happens in the adapter's serialized append; merged order claims restated with the skew exception (CCR-DB-002)<br>0.1 (2026-11-08): Initial draft (CCR-DB-001)                 |

---

Wall clocks on a fleet of nodes disagree, and some are set wrong. This file
says which order the bus guarantees (per origin and stream, by sequence),
and what the hybrid logical clock (HLC) in each envelope is for: a
timestamp close to physical time that never contradicts causality, used to
merge streams for reading — never to decide authority or identity. This file
owns BEH-DB-033–040 and uses BEH-DB-033–038; BEH-DB-039–040 are reserved.

Planned source: `packages/durable-bus/src/Hlc.ts` *(Planned)*.

## BEH-DB-033: The only guaranteed order is per origin and stream

> **Invariant:** [INV-DB-005](../invariants.md#inv-db-005-handlers-see-each-stream-in-sequence-without-skipping)
> **See:** [ADR-DB-004](../decisions/004-order-per-origin-stream-sequence.md)

```
REQUIREMENT: The bus MUST guarantee to each subscription that envelopes of
             one (origin, stream) are processed in `sequence` order without
             skipping (except parked envelopes under "park-and-continue").
             It MUST NOT promise any order between different origins or
             different streams.
```

```
REQUIREMENT: A global order across origins, where an application needs one,
             MUST be assigned by the application's authority (for example as
             its own sequence when it processes inbox envelopes) and MUST NOT
             be derived by this package from HLCs or wall clocks.
```

**Settled here.** Server-authoritative designs order events at the authority;
a clock-derived global order would let a terminal with a fast clock jump the
queue.

## BEH-DB-034: The HLC and its send rule

> **Invariant:** [INV-DB-007](../invariants.md#inv-db-007-hlc-timestamps-issued-by-a-node-strictly-increase)
> **See:** [ADR-DB-004](../decisions/004-order-per-origin-stream-sequence.md), [ADR-BR-025](../../core/decisions/025-deterministic-time-and-ids.md)

```ts
// illustrative — not type-checked
interface Hlc {
  readonly wall: number       // milliseconds since the epoch, from Clock
  readonly logical: number    // counter for events within one `wall`
  readonly node: string       // the origin id; breaks ties
}
// Total order: (wall, logical, node), lexicographic.
```

```
REQUIREMENT: On each publish, with `pt` read from core's `Clock` and `(l, c)`
             the node's last HLC: if `pt > l` the new HLC MUST be `(pt, 0)`,
             otherwise `(l, c + 1)`. The node's last HLC MUST then be the new
             one. The tick MUST be the `stamp` effect that
             `OutboxStore.append` calls inside its serialized step
             (BEH-DB-011), and the node's clock MUST be updated atomically
             (one in-memory reference), so that ticks are totally ordered.
```

```
REQUIREMENT: At start, the node's last HLC MUST be the higher of the
             highest HLC among its committed outbox envelopes
             (`OutboxStore.highestHlc`) and the clock saved by the last
             committed receipt (`InboxStore.savedClock`, BEH-DB-035), so that
             a restart with a clock set backwards cannot issue an HLC lower
             than one it issued, or adopted, before the restart.
```

## BEH-DB-035: The receive rule, and the drift bound

> **Invariant:** [INV-DB-007](../invariants.md#inv-db-007-hlc-timestamps-issued-by-a-node-strictly-increase)
> **See:** [ADR-DB-004](../decisions/004-order-per-origin-stream-sequence.md)

```
REQUIREMENT: When the inbox stores an envelope with HLC `(m, cm)`, the node's
             HLC MUST become `(l', c')` with `l' = max(l, m, pt)` and
             `c' = max(c, cm) + 1` if `l' = l = m`, `c + 1` if `l' = l ≠ m`,
             `cm + 1` if `l' = m ≠ l`, else 0 — unless the drift bound below
             applies. The inbox transaction that stores the envelope MUST
             also save the node's resulting HLC through
             `InboxStore.saveClock`; a receive transaction that rolls back
             leaves the in-memory clock advanced and nothing saved.
```

```
REQUIREMENT: When `m − pt > maxDrift` (default 5 minutes), the envelope MUST
             still be stored, the node's HLC MUST NOT adopt `m` (it advances
             as for a local event), and a `clock-skew` event naming the origin
             and the drift MUST be reported. The inbox MUST store the
             envelope with a receipt flag `skewed: true`, given to its
             handlers as `Receipt.skewed` (BEH-DB-020). This flag is a field
             of the stored receipt, not a core annotation.
```

**Settled here.** A fact is not refused because its sender's clock is wrong —
the sale happened. What the drift bound prevents is one bad clock dragging
every node's HLC into the future, which would make later local timestamps
meaningless. The standard HLC literature refuses such messages; here
storing-and-flagging is preferred because the events are facts.

## BEH-DB-036: HLCs are never identity

> **See:** [ADR-DB-004](../decisions/004-order-per-origin-stream-sequence.md)

```
REQUIREMENT: Deduplication MUST use (origin, stream, sequence) and `eventId`
             only. The HLC MUST NOT be used as a key, a dedup criterion or a
             tiebreaker for authority.
```

## BEH-DB-037: Merged reading order

> **See:** [ADR-DB-004](../decisions/004-order-per-origin-stream-sequence.md)

```
REQUIREMENT: `DurableBus.read({ streams, origins, after })`, a read of stored
             envelopes across origins for display or reporting, MUST return
             them in HLC order (wall, logical, node). With an adapter meeting
             BEH-DB-054 this order agrees with every per-(origin, stream)
             sequence order (the HLC is stamped in the serialized append,
             BEH-DB-011). It agrees with `causationId` — an envelope published
             by a handler sorts after the envelope it handled — except when
             the handled envelope was stored with `skewed: true`, whose HLC
             the node did not adopt; documentation MUST state this
             exception.
```

The merged order is "what happened before what, as far as any node could
tell", close to wall time when clocks are good. It is useful for timelines;
it is not a ledger order. Causation outside the bus (a remote call, a person
reading a screen) is not tracked and may appear in either order.

## BEH-DB-038: occurredAt is informational

> **See:** [ADR-BR-025](../../core/decisions/025-deterministic-time-and-ids.md)
> **Satisfies:** [URS-BR-027](../../core/urs.md#urs-br-027-reproduce-time-and-identifiers-during-validation)

```
REQUIREMENT: `occurredAt` MUST be the origin's `Clock` reading at publish and
             MUST NOT be used by this package for ordering, deduplication or
             freshness. Clock accuracy is the consumer's, as in core
             ([BEH-BR-216](../../core/behaviors/24-time-ids-and-sequence.md)).
```

---

_Previous: [04 — Versions and upcasters](./04-versions-and-upcasters.md)_ · _Next: [06 — Replay, backpressure and snapshots](./06-replay-and-snapshots.md)_
