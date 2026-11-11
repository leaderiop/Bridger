# Traceability

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-DB-TRACE                                             |
> | Revision       | 0.10                                                         |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Traceability Matrix                                          |
> | Change History | 0.10 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-07) — REQ-DB-044: store-swap `apply` steps; REQ-DB-045: `onEnd` given the outcome (H4, K3); SPEC-AUDIT-07 residual — REQ-DB-044, 045 and 046: the `apply-pending` hold (CCR-DB-010)<br>0.9 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-05) — INV-DB-009 row cites REQ-DB-045 (PL12); REQ-DB-045: an admission ends when its transaction commits or rolls back (H2, B1); REQ-DB-046: subscriptions paused while `origin-unrecorded` holds (B2) (CCR-DB-008)<br>0.8 (2026-11-10): Specification audit of 2026-11-10 (SPEC-AUDIT-04) — REQ-DB-045 and REQ-DB-046 restated (H3, F4, PL19) (CCR-DB-007)<br>0.7 (2026-11-10): Specification audit of 2026-11-10 (SPEC-AUDIT-03) — REQ-DB-045, 046; REQ-DB-006, 024 and 037 restated (CCR-DB-006)<br>0.6 (2026-11-10): Specification audit of 2026-11-09, round 2 — REQ-DB-024 and REQ-DB-044 restated (CCR-DB-005)<br>0.5 (2026-11-09): Specification audit of 2026-11-09 — REQ-DB-042–044; INV-DB-002, 004, 005 and 009 rows extended (CCR-DB-004)<br>0.4 (2026-11-08): Round-2 agent review — REQ-DB-039–041; REQ-DB-031, 033, 034, 037, 038 restated; INV-DB-006, 009, 011 rows extended (CCR-DB-003)<br>0.3 (2026-11-08): round 2: recheck items 19–22, 24 and 25 — BEH-DB-008, 016, 031, 032, 048, INV-DB-009–011, ADR-DB-009, REQ-DB-031–038 (CCR-DB-003)<br>0.2 (2026-11-08): Resolutions of the agent review of 2026-11-08 — BEH-DB-047; REQ-DB-028–030; check texts aligned with BEH-DB-058 (CCR-DB-002)<br>0.1 (2026-11-08): Initial draft (CCR-DB-001)                 |

---

The chain for this companion is BEH-DB → INV-DB → ADR-DB → REQ-DB. User
requirements and risks are registered in the core `urs.md` and
`gxp/03-risk-assessment.md`. Nothing here has run.

## §1 Behaviour to source

| Behaviours | Planned source | Planned tests |
| --- | --- | --- |
| BEH-DB-001–008 ([01](behaviors/01-events-and-envelope.md)) | `packages/durable-bus/src/DurableEvent.ts`, `Envelope.ts`, `Codec.ts` *(Planned)* | `packages/durable-bus/test/acceptance/envelope.test.ts` *(Planned)* |
| BEH-DB-009–016 ([02](behaviors/02-transactional-outbox.md)) | `packages/durable-bus/src/Outbox.ts` *(Planned)* | `packages/durable-bus/test/acceptance/outbox.test.ts` *(Planned)* |
| BEH-DB-017–024 ([03](behaviors/03-delivery-and-inbox.md)) | `packages/durable-bus/src/Relay.ts`, `Inbox.ts`, `Subscription.ts` *(Planned)* | `packages/durable-bus/test/acceptance/delivery.test.ts` *(Planned)* |
| BEH-DB-025–032 ([04](behaviors/04-versions-and-upcasters.md)) | `packages/durable-bus/src/Upcast.ts` *(Planned)* | `packages/durable-bus/test/acceptance/upcast.test.ts` *(Planned)* |
| BEH-DB-033–038 ([05](behaviors/05-order-and-clocks.md)) | `packages/durable-bus/src/Hlc.ts` *(Planned)* | `packages/durable-bus/test/acceptance/hlc.test.ts` *(Planned)* |
| BEH-DB-041–048 ([06](behaviors/06-replay-and-snapshots.md)) | `packages/durable-bus/src/Relay.ts`, `Snapshot.ts`, `History.ts` *(Planned)* | `packages/durable-bus/test/acceptance/replay.test.ts` *(Planned)* |
| BEH-DB-049–056 ([07](behaviors/07-core-bus-and-adapters.md)) | `packages/durable-bus/src/Plugin.ts`, `Forward.ts`, `testing/AdapterSuite.ts` *(Planned)* | `packages/durable-bus/test/acceptance/plugin.test.ts` *(Planned)* |
| BEH-DB-057–058 ([08](behaviors/08-testing-and-acceptance.md)) | `packages/durable-bus/src/testing/TestStore.ts`, `TestDelivery.ts` *(Planned)* | all of the above |

## §2 Invariant traceability

| Invariant | Behaviours | Decisions | Scenarios |
| --- | --- | --- | --- |
| [INV-DB-001](invariants.md#inv-db-001-an-envelope-is-in-the-outbox-exactly-when-its-transaction-committed) | BEH-DB-009, 010, 054 | ADR-DB-002 | REQ-DB-003, 004, 027 |
| [INV-DB-002](invariants.md#inv-db-002-sequence-is-contiguous-per-origin-and-stream) | BEH-DB-002, 003, 004, 011 | ADR-DB-004 | REQ-DB-004, 005, 006, 042, 044 |
| [INV-DB-003](invariants.md#inv-db-003-an-envelope-is-acknowledged-only-after-the-receiver-committed-it) | BEH-DB-017, 019, 052 | ADR-DB-003 | REQ-DB-009, 010, 027 |
| [INV-DB-004](invariants.md#inv-db-004-an-inbox-records-each-envelope-processed-at-most-once-per-subscription) | BEH-DB-015, 018, 020, 021 | ADR-DB-003 | REQ-DB-009, 011, 043 |
| [INV-DB-005](invariants.md#inv-db-005-handlers-see-each-stream-in-sequence-without-skipping) | BEH-DB-018, 020, 021, 022, 033 | ADR-DB-004 | REQ-DB-009, 015, 029, 043 |
| [INV-DB-006](invariants.md#inv-db-006-no-envelope-is-dropped-silently) | BEH-DB-008, 014, 016, 018, 019, 022, 026, 044, 045, 047 | ADR-DB-005, ADR-DB-006 | REQ-DB-013, 014, 024, 025, 028, 029, 031, 038, 040 |
| [INV-DB-007](invariants.md#inv-db-007-hlc-timestamps-issued-under-one-origin-strictly-increase) | BEH-DB-034, 035 | ADR-DB-004 | REQ-DB-017, 018 |
| [INV-DB-008](invariants.md#inv-db-008-in-flight-delivery-is-bounded-by-the-receivers-credit) | BEH-DB-041, 042, 047 | ADR-DB-006 | REQ-DB-021, 022, 023, 030 |
| [INV-DB-009](invariants.md#inv-db-009-no-snapshot-restore-removes-an-unacknowledged-outbox-envelope) | BEH-DB-004, 044, 048 | ADR-DB-006 | REQ-DB-033, 034, 039, 044, 045 |
| [INV-DB-010](invariants.md#inv-db-010-a-payload-reaches-storage-and-the-wire-only-through-the-payload-codec) | BEH-DB-008 | ADR-DB-008 | REQ-DB-031 |
| [INV-DB-011](invariants.md#inv-db-011-no-envelope-is-delivered-to-a-subscriber-the-access-policy-denied) | BEH-DB-047, 053 | ADR-DB-001 | REQ-DB-035, 040 |

## §3 Decision traceability

| Decision | Status | Behaviours |
| --- | --- | --- |
| [ADR-DB-001](decisions/001-a-separate-contract-from-the-core-bus.md) | Proposed | 01, 07 |
| [ADR-DB-002](decisions/002-outbox-through-a-storage-port.md) | Proposed | 02, 07 |
| [ADR-DB-003](decisions/003-at-least-once-with-a-deduplicating-inbox.md) | Proposed | 02, 03, 07 |
| [ADR-DB-004](decisions/004-order-per-origin-stream-sequence.md) | Proposed | 01, 02, 05 |
| [ADR-DB-005](decisions/005-versioned-events-and-pure-upcasters.md) | Proposed | 01, 03, 04 |
| [ADR-DB-006](decisions/006-bounded-replay-and-snapshots.md) | Proposed | 02, 04, 06 |
| [ADR-DB-007](decisions/007-the-name-is-not-a-claim.md) | Proposed | 07 |
| [ADR-DB-008](decisions/008-actor-and-annotations-are-claims.md) | Proposed | 01 |
| [ADR-DB-009](decisions/009-writers-last-for-offline-readers.md) | Proposed | 04 |

## §4 Acceptance scenario traceability

One scenario per required acceptance check of [BEH-DB-058](behaviors/08-testing-and-acceptance.md#beh-db-058-required-acceptance-checks), in the same order.

| Scenario | Check | Behaviours | Status |
| --- | --- | --- | --- |
| REQ-DB-001 | 1. `DurableEvent.make` rejects a non-integer version and a broken upcaster chain at the call | [BEH-DB-001](behaviors/01-events-and-envelope.md) | Not run |
| REQ-DB-002 | 2. Every published envelope carries all required fields, ids from `IdGenerator` and times from `Clock` | [BEH-DB-002](behaviors/01-events-and-envelope.md) | Not run |
| REQ-DB-003 | 3. Publishing outside a `StoreTransaction` does not type-check (type-level test) | [BEH-DB-009](behaviors/02-transactional-outbox.md) | Not run |
| REQ-DB-004 | 4. A rolled-back transaction leaves no envelope, no sequence gap and nothing the relay can send; a commit makes it pending | [BEH-DB-009](behaviors/02-transactional-outbox.md), [BEH-DB-010](behaviors/02-transactional-outbox.md), [BEH-DB-011](behaviors/02-transactional-outbox.md) | Not run |
| REQ-DB-005 | 5. Concurrent transactions on one stream commit contiguous unique sequences | [BEH-DB-011](behaviors/02-transactional-outbox.md) | Not run |
| REQ-DB-006 | 6. A configured incarnation lower than the one recorded for its node refuses to start; another node's record never blocks; a restored store with its recorded incarnation starts, and reused sequences stop the stream at a receiver that still holds the first envelopes, with `EnvelopeConflict` | [BEH-DB-004](behaviors/01-events-and-envelope.md), [BEH-DB-012](behaviors/02-transactional-outbox.md) | Not run |
| REQ-DB-007 | 7. The actor is the publishing fiber's; on receipt the handler sees it with a provenance annotation naming the origin | [BEH-DB-006](behaviors/01-events-and-envelope.md) | Not run |
| REQ-DB-008 | 8. Envelopes carry the "wire" filter encoded (taint and provenance always, never the deadline); decode rejects undeclared keys; the handler runs inside `CallerContext.serve` and cannot remove received taint | [BEH-DB-007](behaviors/01-events-and-envelope.md) | Not run |
| REQ-DB-009 | 9. Under generated schedules of drop, dropAck, duplicate, reorder and partition, every committed envelope is eventually stored once by the receiver and processed once per subscription, in sequence order per (origin, stream) | [BEH-DB-017](behaviors/03-delivery-and-inbox.md), [BEH-DB-018](behaviors/03-delivery-and-inbox.md), [BEH-DB-019](behaviors/03-delivery-and-inbox.md), [BEH-DB-020](behaviors/03-delivery-and-inbox.md) | Not run |
| REQ-DB-010 | 10. An acknowledgement is never returned for an inbox transaction that did not commit; the sender keeps the envelopes pending | [BEH-DB-018](behaviors/03-delivery-and-inbox.md), [BEH-DB-019](behaviors/03-delivery-and-inbox.md) | Not run |
| REQ-DB-011 | 11. A handler's writes, its cursor advance and envelopes it publishes commit or roll back together | [BEH-DB-015](behaviors/02-transactional-outbox.md), [BEH-DB-020](behaviors/03-delivery-and-inbox.md) | Not run |
| REQ-DB-012 | 12. Envelopes recorded at every version from `minVersion` to the current one read correctly through the upcaster chain; stored envelopes are not rewritten | [BEH-DB-025](behaviors/04-versions-and-upcasters.md), [BEH-DB-028](behaviors/04-versions-and-upcasters.md) | Not run |
| REQ-DB-013 | 13. A newer version than the reader knows is stored and acknowledged; it halts the stream under "halt" (processed in order after upgrade) or is parked under "park-and-continue" (processed after upgrade and `unpark`) | [BEH-DB-022](behaviors/03-delivery-and-inbox.md), [BEH-DB-026](behaviors/04-versions-and-upcasters.md) | Not run |
| REQ-DB-014 | 14. An upcaster failure parks with `UpcastFailed`; nothing is deleted | [BEH-DB-022](behaviors/03-delivery-and-inbox.md), [BEH-DB-027](behaviors/04-versions-and-upcasters.md) | Not run |
| REQ-DB-015 | 15. A poison handler halts its stream by default and `resume` retries it; with "park-and-continue" it parks and continues | [BEH-DB-021](behaviors/03-delivery-and-inbox.md) | Not run |
| REQ-DB-016 | 16. A subscription withdrawn by its plugin's stop resumes from its cursor when a handler registers again | [BEH-DB-023](behaviors/03-delivery-and-inbox.md) | Not run |
| REQ-DB-017 | 17. HLCs issued by one node strictly increase across publishes, receipts and a restart with the clock set backwards, including right after a receipt | [BEH-DB-034](behaviors/05-order-and-clocks.md), [BEH-DB-035](behaviors/05-order-and-clocks.md) | Not run |
| REQ-DB-018 | 18. A received HLC beyond `maxDrift` is stored with `skewed: true`, reported, and not adopted by the local HLC | [BEH-DB-035](behaviors/05-order-and-clocks.md) | Not run |
| REQ-DB-019 | 19. Deduplication ignores HLCs: two envelopes with equal HLCs and different sequences are both stored | [BEH-DB-036](behaviors/05-order-and-clocks.md) | Not run |
| REQ-DB-020 | 20. Merged reads are in HLC order, consistent with every stream's sequence order under concurrent publishers, and with causation except after a `skewed` cause | [BEH-DB-011](behaviors/02-transactional-outbox.md), [BEH-DB-037](behaviors/05-order-and-clocks.md) | Not run |
| REQ-DB-021 | 21. The relay never exceeds the receiver's credit; zero credit waits `Ack.retryAfter` | [BEH-DB-041](behaviors/06-replay-and-snapshots.md) | Not run |
| REQ-DB-022 | 22. Reconnect backoff uses seeded full jitter between `retryMin` and `retryMax` | [BEH-DB-042](behaviors/06-replay-and-snapshots.md) | Not run |
| REQ-DB-023 | 23. A high-priority stream is delivered while a large low-priority backlog drains, with order kept in each stream | [BEH-DB-043](behaviors/06-replay-and-snapshots.md) | Not run |
| REQ-DB-024 | 24. A follower behind the source's retained history receives `SnapshotRequired` from `HistorySource.read`; restore, watermark and cursor resets commit together; a watermark moved past unstored sequences is recorded as a `GapRecord` ("snapshot:" or "rebootstrap:" reason, attributed); without a provider following stays stopped | [BEH-DB-019](behaviors/03-delivery-and-inbox.md), [BEH-DB-044](behaviors/06-replay-and-snapshots.md), [BEH-DB-047](behaviors/06-replay-and-snapshots.md) | Not run |
| REQ-DB-025 | 25. The push path carries no `SnapshotRequired`; an inbox accepts a backlog however old | [BEH-DB-045](behaviors/06-replay-and-snapshots.md) | Not run |
| REQ-DB-026 | 26. `forward` emits on the core bus after commit; a failing core listener leaves the cursor advanced; the bus never touches `Bridger.Events` otherwise | [BEH-DB-049](behaviors/07-core-bus-and-adapters.md), [BEH-DB-050](behaviors/07-core-bus-and-adapters.md) | Not run |
| REQ-DB-027 | 27. Stopping the bus plugin mid-batch leaves unacknowledged envelopes pending and rolls back running handlers; the build makes no transport call; a caller's `publish` is not interrupted | [BEH-DB-051](behaviors/07-core-bus-and-adapters.md), [BEH-DB-052](behaviors/07-core-bus-and-adapters.md) | Not run |
| REQ-DB-028 | 28. A regressed receiver is resent to from its lower watermark, or `envelopes-lost` is reported and the stream proceeds only after an attributed `acceptGap` | [BEH-DB-017](behaviors/03-delivery-and-inbox.md), [BEH-DB-019](behaviors/03-delivery-and-inbox.md) | Not run |
| REQ-DB-029 | 29. Unknown envelope formats and conflicts stop the stream at the inbox until `releaseStream`; a batch with an unidentifiable element is refused whole; parks are per subscription and an unparked envelope is processed out of order | [BEH-DB-002](behaviors/01-events-and-envelope.md), [BEH-DB-018](behaviors/03-delivery-and-inbox.md), [BEH-DB-022](behaviors/03-delivery-and-inbox.md) | Not run |
| REQ-DB-030 | 30. `follow` pulls bounded pages with one read in flight per source, backs off with seeded jitter, and feeds pages through the inbox rules | [BEH-DB-047](behaviors/06-replay-and-snapshots.md) | Not run |
| REQ-DB-031 | 31. Payloads pass through the `PayloadCodec`; nothing else changes; `PayloadUnreadable` handled under `onUnreadable`, never dropped; rotation through `decodes` | [BEH-DB-008](behaviors/01-events-and-envelope.md) | Not run |
| REQ-DB-032 | 32. `onBehalfOf` is `PrincipalRef.encode`; correlation from `CurrentCorrelation` reaches a handler's mutating calls | [BEH-DB-002](behaviors/01-events-and-envelope.md), [BEH-DB-005](behaviors/01-events-and-envelope.md), [BEH-DB-007](behaviors/01-events-and-envelope.md) | Not run |
| REQ-DB-033 | 33. `rebootstrapOutbox().settle` pushes or keeps, blocks under "pushed" (the default), refuses "kept" for a whole-store install, acknowledges nothing itself | [BEH-DB-048](behaviors/06-replay-and-snapshots.md) | Not run |
| REQ-DB-034 | 34. A restore or in-store install that touches the outbox is rolled back with "outbox-touched" | [BEH-DB-044](behaviors/06-replay-and-snapshots.md) | Not run |
| REQ-DB-035 | 35. `AccessPolicy.ask` on publish, subscribe and every delivery; denied deliveries park, never run | [BEH-DB-053](behaviors/07-core-bus-and-adapters.md) | Not run |
| REQ-DB-036 | 36. `publishVersion` N−1 with a round-trip-checked downcast; `DowncastRefused`; switch by configuration | [BEH-DB-030](behaviors/04-versions-and-upcasters.md), [BEH-DB-031](behaviors/04-versions-and-upcasters.md) | Not run |
| REQ-DB-037 | 37. Oldest and newest version stored per (type, origin), reader versions per type and the own origin's backlog, offered as version reports | [BEH-DB-029](behaviors/04-versions-and-upcasters.md), [BEH-DB-032](behaviors/04-versions-and-upcasters.md) | Not run |
| REQ-DB-038 | 38. Routes and inboxes refuse envelopes whose residency label they do not offer; a skipped destination gets a `Withheld` marker and no gap | [BEH-DB-016](behaviors/02-transactional-outbox.md), [BEH-DB-018](behaviors/03-delivery-and-inbox.md) | Not run |
| REQ-DB-039 | 39. A whole-store re-bootstrap freezes the outbox and raises the incarnation | [BEH-DB-004](behaviors/01-events-and-envelope.md), [BEH-DB-048](behaviors/06-replay-and-snapshots.md) | Not run |
| REQ-DB-040 | 40. A `HistorySource` checks placement and access per reader and withholds what it refuses | [BEH-DB-047](behaviors/06-replay-and-snapshots.md) | Not run |
| REQ-DB-041 | 41. Every `publish` error writes nothing and rolls back the caller's write if unhandled | [BEH-DB-009](behaviors/02-transactional-outbox.md), [BEH-DB-031](behaviors/04-versions-and-upcasters.md) | Not run |
| REQ-DB-042 | 42. `publish` options: a given stream (own sequence), an empty one refused as a defect, causation outside a handler | [BEH-DB-003](behaviors/01-events-and-envelope.md), [BEH-DB-005](behaviors/01-events-and-envelope.md), [BEH-DB-009](behaviors/02-transactional-outbox.md) | Not run |
| REQ-DB-043 | 43. A commit conflict is retried in a new transaction and, when the attempts end on one, halts without parking; `receive` stores nothing on a conflict | [BEH-DB-018](behaviors/03-delivery-and-inbox.md), [BEH-DB-021](behaviors/03-delivery-and-inbox.md), [BEH-DB-054](behaviors/07-core-bus-and-adapters.md) | Not run |
| REQ-DB-044 | 44. `origin` and `originChanges`; store-swap participants' `prepare` runs before a whole-store install, and a failing one stops it; their `apply` runs after `run` and commits before the `OriginChange`, and a failing one fails the install "apply-failed" and holds `apply-pending` (writes refused, readers paused, `settle` refused) until its retries commit; the incarnation is raised before `run`, a failing raise stops the install, and the old origin is never used after a raise | [BEH-DB-004](behaviors/01-events-and-envelope.md), [BEH-DB-048](behaviors/06-replay-and-snapshots.md) | Not run |
| REQ-DB-045 | 45. `DurableBus.fence` refuses writes inside a transaction during a whole-store freeze and while `apply-pending` holds, and admits an admitted transaction again; the freeze refuses new admissions, then waits for the admitted ones to end, each when its transaction commits or rolls back, `onEnd` given the outcome | [BEH-DB-048](behaviors/06-replay-and-snapshots.md), [BEH-DB-054](behaviors/07-core-bus-and-adapters.md) | Not run |
| REQ-DB-046 | 46. `follow` paused while a settlement is held or `apply-pending` holds, subscriptions paused during a whole-store one and while `origin-unrecorded` or `apply-pending` holds, with `OutboxFrozen` not counted, both shown paused; pulled pages outside the asked (origin, stream) or `origins` refused | [BEH-DB-021](behaviors/03-delivery-and-inbox.md), [BEH-DB-046](behaviors/06-replay-and-snapshots.md), [BEH-DB-047](behaviors/06-replay-and-snapshots.md), [BEH-DB-048](behaviors/06-replay-and-snapshots.md) | Not run |
