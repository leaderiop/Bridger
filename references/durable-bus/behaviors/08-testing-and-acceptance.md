# 08 — Testing and acceptance

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-DB-BEH-08                                            |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.2 (2026-11-08): Resolutions of the agent review of 2026-11-08 — checks 6, 8, 13, 15, 17, 20, 21, 24, 25 and 27 restated; checks 28–30 added (receiver regression, two parking levels, history pulls) (CCR-DB-002)<br>0.1 (2026-11-08): Initial draft (CCR-DB-001)                 |

---

This file specifies the in-memory store and faulty delivery used to test the
bus deterministically, and the acceptance checks an implementation must
pass. This file owns BEH-DB-057–064 and uses BEH-DB-057–058; BEH-DB-059–064
are reserved.

Planned source: `packages/durable-bus/src/testing/TestStore.ts`,
`packages/durable-bus/src/testing/TestDelivery.ts`; planned tests:
`packages/durable-bus/test/acceptance/*.test.ts` *(Planned)*.

## BEH-DB-057: TestStore and TestDelivery

> **See:** [ADR-BR-026](../../core/decisions/026-deterministic-test-host.md)
> **Depends on:** core [21 — Testing host](../../core/behaviors/21-testing-host.md)
> **Satisfies:** [URS-BR-019](../../core/urs.md#urs-br-019-test-plugin-lifecycles-deterministically-with-injected-faults)

```ts
// illustrative — not type-checked
interface TestStore {           // an in-memory adapter meeting BEH-DB-054 (1–6)
  readonly layer: Layer.Layer<StoreTransaction | OutboxStore | InboxStore>
  readonly crashBeforeCommit: Effect.Effect<void>   // next commit fails as if the process died
  readonly restoreFrom: (snapshot: TestStoreSnapshot) => Effect.Effect<void>   // simulate a restored backup
  readonly dump: Effect.Effect<TestStoreSnapshot>
}
interface TestDelivery {        // a DeliveryTransport between buses in one process
  readonly drop: (n: number) => Effect.Effect<void>          // lose the next n batches
  readonly dropAck: (n: number) => Effect.Effect<void>       // deliver, then lose the acknowledgement
  readonly duplicate: (n: number) => Effect.Effect<void>
  readonly reorder: Effect.Effect<void>                      // swap the next two batches
  readonly partition: Effect.Effect<void>
  readonly heal: Effect.Effect<void>
}
```

```
REQUIREMENT: `TestStore` MUST pass the adapter conformance suite
             (BEH-DB-056). `TestDelivery` MUST run under `TestClock` and a
             seeded `Random`, so that every fault schedule is reproducible.
```

## BEH-DB-058: Required acceptance checks

> **See:** [ADR-DB-003](../decisions/003-at-least-once-with-a-deduplicating-inbox.md), [ADR-DB-004](../decisions/004-order-per-origin-stream-sequence.md)
> **Satisfies:** [URS-BR-019](../../core/urs.md#urs-br-019-test-plugin-lifecycles-deterministically-with-injected-faults), [URS-BR-013](../../core/urs.md#urs-br-013-exchange-typed-events-between-plugins)

```
REQUIREMENT: An implementation MUST pass the checks below with `TestStore`
             and `TestDelivery` before any behaviour of this companion is
             described as implemented. Each check is a planned scenario
             REQ-DB-NNN, numbered as listed (traceability.md §4).
```

1. `DurableEvent.make` rejects a non-integer version and a broken upcaster chain at the call (BEH-DB-001).
2. Every published envelope carries all required fields, ids from `IdGenerator` and times from `Clock` (BEH-DB-002).
3. Publishing outside a `StoreTransaction` does not type-check (type-level test) (BEH-DB-009).
4. A rolled-back transaction leaves no envelope, no sequence gap and nothing the relay can send; a commit makes it pending (BEH-DB-009, BEH-DB-010, BEH-DB-011).
5. Concurrent transactions on one stream commit contiguous unique sequences (BEH-DB-011).
6. A configured incarnation lower than the one the store recorded refuses to start; a store restored with its recorded incarnation starts (the package cannot detect it), and when it reuses sequences under one origin, a receiver that still holds the first envelopes stops that stream at the inbox with `EnvelopeConflict` and keeps the first (BEH-DB-004).
7. The actor is the publishing fiber's; on receipt the handler sees it with a provenance annotation naming the origin (BEH-DB-006).
8. Envelopes carry `Annotations.encode` of the "wire" filter: taint and provenance always, never the deadline, other keys only with "wire" and within `carry`; on receipt `Annotations.decode` rejects undeclared keys (listed in the receipt) and the handler runs inside `CallerContext.serve` with the received taint, which it cannot remove (BEH-DB-007).
9. Under generated schedules of drop, dropAck, duplicate, reorder and partition, every committed envelope is eventually stored once by the receiver and processed once per subscription, in sequence order per (origin, stream) (BEH-DB-017, BEH-DB-018, BEH-DB-019, BEH-DB-020).
10. An acknowledgement is never returned for an inbox transaction that did not commit; the sender keeps the envelopes pending (BEH-DB-018, BEH-DB-019).
11. A handler's writes, its cursor advance and envelopes it publishes commit or roll back together (BEH-DB-015, BEH-DB-020).
12. Envelopes recorded at every version from `minVersion` to the current one read correctly through the upcaster chain; stored envelopes are not rewritten (BEH-DB-025, BEH-DB-028).
13. A newer version than the reader knows is stored and acknowledged; under "halt" the subscription's stream halts at it and processes it in order after upgrade and re-registration; under "park-and-continue" it is parked with `UnknownEventVersion` and processed after upgrade and `unpark` (BEH-DB-026, BEH-DB-022).
14. An upcaster failure parks with `UpcastFailed`; nothing is deleted (BEH-DB-027, BEH-DB-022).
15. A poison handler halts its stream by default, with the cursor before it, and `resume` retries it; with "park-and-continue" it parks and continues (BEH-DB-021).
16. A subscription withdrawn by its plugin's stop resumes from its cursor when a handler registers again (BEH-DB-023).
17. HLCs issued by one node strictly increase across publishes, receipts and a restart with the clock set backwards, including a restart right after a receipt with no publish since (the saved receipt clock) (BEH-DB-034, BEH-DB-035).
18. A received HLC beyond `maxDrift` is stored with `skewed: true`, reported, and not adopted by the local HLC (BEH-DB-035).
19. Deduplication ignores HLCs: two envelopes with equal HLCs and different sequences are both stored (BEH-DB-036).
20. Merged reads are in HLC order and consistent with every stream's sequence order under concurrent publishers to one stream; an envelope published by a handler sorts after its cause unless the cause was stored `skewed` (BEH-DB-011, BEH-DB-037).
21. The relay never exceeds the receiver's credit; zero credit waits `Ack.retryAfter` (BEH-DB-041).
22. Reconnect backoff uses seeded full jitter between `retryMin` and `retryMax` (BEH-DB-042).
23. A high-priority stream is delivered while a large low-priority backlog drains, with order kept in each stream (BEH-DB-043).
24. A follower behind the source's retained history receives `SnapshotRequired` from `HistorySource.read`; the restore, the watermark reset and the cursor resets commit together; without a provider following stays stopped (BEH-DB-044, BEH-DB-047).
25. The push path carries no `SnapshotRequired`: an inbox accepts a relay's backlog however old (BEH-DB-045).
26. `forward` emits on the core bus after commit; a failing core listener leaves the cursor advanced; the bus never touches `Bridger.Events` otherwise (BEH-DB-049, BEH-DB-050).
27. Stopping the bus plugin mid-batch leaves unacknowledged envelopes pending and rolls back running handlers; the build makes no transport call; a `publish` in a caller's transaction is not interrupted by the stop (BEH-DB-051, BEH-DB-052).
28. A receiver restored to an older store reports a lower watermark; the relay reports `receiver-regressed` and resends from it out of `retained`; when the outbox purged part of the range it reports `envelopes-lost`, and the stream proceeds only after an attributed `acceptGap` (BEH-DB-017, BEH-DB-019).
29. An unknown envelope format and a conflicting event id stop the (origin, stream) at the inbox — watermark unchanged, later envelopes not acknowledged, no subscription sees them — until `releaseStream`; a batch with an element lacking origin, stream or sequence is refused whole; a parked envelope is per subscription, and after `unpark` it is processed after the envelopes that followed it (BEH-DB-002, BEH-DB-018, BEH-DB-022).
30. `follow` pulls pages of at most `maxPage` with one read in flight per source, backs off with seeded jitter, and feeds pages through the inbox rules (duplicates and gaps absorbed) (BEH-DB-047).

---

_Previous: [07 — Core bus, plugin packaging and storage adapters](./07-core-bus-and-adapters.md)_
