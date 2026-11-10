# Runtime Invariants

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-DB-INV                                               |
> | Revision       | 0.5                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.5 (2026-11-10): Specification audit of 2026-11-09, round 2 — INV-DB-006 admits the `GapRecord` of a snapshot restore or re-bootstrap install (P3); INV-DB-007 scoped to one origin on one store (heading changed, old anchor kept) (CCR-DB-005)<br>0.4 (2026-11-08): Round-2 agent review (R4 F9, F13, F16, F26; R5-04/05) — INV-DB-006 covers `Withheld` markers and undecoded delivery through `subscribeEnvelopes`; INV-DB-009 covers both install paths; INV-DB-010 narrowed to copies the bus stores or sends; INV-DB-011 covers out-of-host readers (CCR-DB-003)<br>0.3 (2026-11-08): round 2: recheck items 19, 21 and 24 — INV-DB-009 (outbox survives a restore), INV-DB-010 (payload codec), INV-DB-011 (access policy at delivery) added (CCR-DB-003)<br>0.2 (2026-11-08): Resolutions of the agent review of 2026-11-08 — INV-DB-002 origin uniqueness restated as an operator obligation; INV-DB-005 unpark exception; INV-DB-006 receiver regression; INV-DB-007 saved receipt clock (CCR-DB-002)<br>0.1 (2026-11-08): Initial draft (CCR-DB-001)                 |

---

Properties of the durable-bus companion that hold for every execution with
an adapter meeting [BEH-DB-054](behaviors/07-core-bus-and-adapters.md#beh-db-054-storage-adapter-obligations)
(1–6), in the shape of the core [invariants](../core/invariants.md). Nothing
below is implemented; every **Source** and **Verification** is *(Planned)*,
and none may be cited as evidence until a test that checks it has run
([ADR-BR-035](../core/decisions/035-evidence-from-executed-tests.md)). None
of them speaks about surviving a power loss; that is the adapter's property 7.

## INV-DB-001: An envelope is in the outbox exactly when its transaction committed

An envelope is readable by the relay, or by anything else, if and only if the caller's storage transaction that published it committed.

**Source**: `packages/durable-bus/src/Outbox.ts` *(Planned)* — `publish` requires `StoreTransaction` and appends through the adapter; the relay reads committed rows only.

**Implication**: no event without its state change, no state change without its event (the dual-write problem).

**Verification** *(Planned)*: checks 3, 4 and 27 of BEH-DB-058; the adapter conformance suite.

**Related**: [BEH-DB-009](behaviors/02-transactional-outbox.md#beh-db-009-publish-runs-inside-the-callers-transaction), [BEH-DB-010](behaviors/02-transactional-outbox.md#beh-db-010-the-envelope-exists-exactly-when-the-transaction-commits), [BEH-DB-054](behaviors/07-core-bus-and-adapters.md#beh-db-054-storage-adapter-obligations), [ADR-DB-002](decisions/002-outbox-through-a-storage-port.md).

## INV-DB-002: Sequence is contiguous per origin and stream

Committed envelopes of one store incarnation and (origin, stream) carry sequences 1, 2, 3, … with no gap and no repeat. That an origin is never reused across store incarnations is an operator obligation, not a property of the package: a store restored from a backup restores its recorded incarnation too, and only the operator, by raising the configured incarnation, starts a new origin (BEH-DB-004). The package refuses a configured incarnation lower than the recorded one, and a receiver that still holds the first envelope of a reused (origin, stream, sequence) stops that stream with `EnvelopeConflict`.

**Source**: `packages/durable-bus/src/Outbox.ts` *(Planned)* — allocation in the transaction by the adapter; incarnation check at start.

**Implication**: receivers can deduplicate and detect gaps with one watermark per stream, provided the operator followed the incarnation rule.

**Verification** *(Planned)*: checks 4, 5 and 6 of BEH-DB-058.

**Related**: [BEH-DB-002](behaviors/01-events-and-envelope.md#beh-db-002-the-envelope), [BEH-DB-004](behaviors/01-events-and-envelope.md#beh-db-004-an-origin-is-an-incarnation-never-reused), [BEH-DB-011](behaviors/02-transactional-outbox.md#beh-db-011-sequence-numbers-are-allocated-in-the-transaction), [ADR-DB-004](decisions/004-order-per-origin-stream-sequence.md).

## INV-DB-003: An envelope is acknowledged only after the receiver committed it

A sender stops treating an envelope as pending for a destination only when that destination returned a watermark covering it, computed after its inbox transaction committed.

**Source**: `packages/durable-bus/src/Relay.ts`, `Inbox.ts` *(Planned)*.

**Implication**: no envelope is forgotten by the sender that the receiver has not stored.

**Verification** *(Planned)*: checks 9, 10 and 27 of BEH-DB-058.

**Related**: [BEH-DB-017](behaviors/03-delivery-and-inbox.md#beh-db-017-the-relay-delivers-at-least-once-in-order), [BEH-DB-019](behaviors/03-delivery-and-inbox.md#beh-db-019-acknowledgement-follows-the-receivers-commit), [BEH-DB-052](behaviors/07-core-bus-and-adapters.md#beh-db-052-stopping-the-bus-loses-nothing), [ADR-DB-003](decisions/003-at-least-once-with-a-deduplicating-inbox.md).

## INV-DB-004: An inbox records each envelope processed at most once per subscription

For each subscription, the cursor passes each stored envelope once, in the same transaction as the handler's store writes.

**Source**: `packages/durable-bus/src/Subscription.ts` *(Planned)* — cursor advance and handler in one `InboxStore` transaction; inbox watermark deduplication.

**Implication**: repeated deliveries do not repeat effects that live in the same store; effects elsewhere are at least once (BEH-DB-024).

**Verification** *(Planned)*: checks 9 and 11 of BEH-DB-058.

**Related**: [BEH-DB-015](behaviors/02-transactional-outbox.md#beh-db-015-publishing-from-a-handler-uses-the-handlers-transaction), [BEH-DB-018](behaviors/03-delivery-and-inbox.md#beh-db-018-the-inbox-accepts-the-next-sequence-ignores-repeats-and-stops-at-gaps), [BEH-DB-020](behaviors/03-delivery-and-inbox.md#beh-db-020-subscriptions-process-each-stored-envelope-once-in-order).

## INV-DB-005: Handlers see each stream in sequence without skipping

A subscription processes the envelopes of one (origin, stream) in increasing sequence, and passes one only after the previous one was processed or, under "park-and-continue", parked. The single exception is an envelope released by `unpark`, which is processed after envelopes of its stream that followed it (BEH-DB-022).

**Source**: `packages/durable-bus/src/Inbox.ts`, `Subscription.ts` *(Planned)*.

**Implication**: projections built from a stream are never built out of order.

**Verification** *(Planned)*: checks 9, 15 and 29 of BEH-DB-058.

**Related**: [BEH-DB-022](behaviors/03-delivery-and-inbox.md#beh-db-022-parked-envelopes-are-visible-and-can-be-released), [BEH-DB-018](behaviors/03-delivery-and-inbox.md#beh-db-018-the-inbox-accepts-the-next-sequence-ignores-repeats-and-stops-at-gaps), [BEH-DB-020](behaviors/03-delivery-and-inbox.md#beh-db-020-subscriptions-process-each-stored-envelope-once-in-order), [BEH-DB-033](behaviors/05-order-and-clocks.md#beh-db-033-the-only-guaranteed-order-is-per-origin-and-stream).

## INV-DB-006: No envelope is dropped silently

An envelope that cannot be processed halts its stream, is parked with a reason, stops its stream at the inbox, or — for a subscriber reading through `subscribeEnvelopes` — reaches its handler undecoded, as received, and each is listed; a sequence withheld from a destination or reader arrives as a counted `Withheld` marker, never as a gap; upstream envelopes are never truncated before acknowledgement; a receiver whose watermark regressed is resent to or, when the sender no longer retains the range, reported on both sides; an inbox watermark passes unstored sequences only through an attributed `acceptGap`, or through a snapshot restore or re-bootstrap install that records the passed range as an attributed `GapRecord`; a gap in downstream history is answered with `SnapshotRequired`, never skipped.

**Source**: `packages/durable-bus/src/Inbox.ts`, `Relay.ts`, `Snapshot.ts` *(Planned)*.

**Implication**: no fact disappears without a visible trace.

**Verification** *(Planned)*: checks 13, 14, 24, 25, 28, 29, 31, 38 and 40 of BEH-DB-058.

**Related**: [BEH-DB-014](behaviors/02-transactional-outbox.md#beh-db-014-the-outbox-is-never-truncated-before-acknowledgement), [BEH-DB-019](behaviors/03-delivery-and-inbox.md#beh-db-019-acknowledgement-follows-the-receivers-commit), [BEH-DB-022](behaviors/03-delivery-and-inbox.md#beh-db-022-parked-envelopes-are-visible-and-can-be-released), [BEH-DB-026](behaviors/04-versions-and-upcasters.md#beh-db-026-unknown-versions-are-parked-not-dropped), [BEH-DB-044](behaviors/06-replay-and-snapshots.md#beh-db-044-a-subscriber-behind-the-retained-history-needs-a-snapshot), [BEH-DB-045](behaviors/06-replay-and-snapshots.md#beh-db-045-upstream-facts-are-slowed-never-truncated).

## INV-DB-007: HLC timestamps issued under one origin strictly increase

<a id="inv-db-007-hlc-timestamps-issued-by-a-node-strictly-increase"></a>

Every HLC a node writes into a committed envelope, or saves as its clock after a committed receipt, under one origin (one incarnation, BEH-DB-004), is greater than every such HLC before it under that origin, across restarts on the same store. Ticks of transactions that rolled back are not observable and are not covered. A store restored from a backup, or replaced by a whole-store re-bootstrap, starts a new origin and is not covered: its highest HLC may be lower than one the old origin issued, and its first HLC then rests on the `Clock` alone.

**Source**: `packages/durable-bus/src/Hlc.ts` *(Planned)* — send and receive rules, stamping in the adapter's serialized append, start from the higher of the outbox's highest HLC and the saved receipt clock, drift bound.

**Implication**: causal reading order holds even with a clock set backwards or a peer clock far ahead.

**Verification** *(Planned)*: checks 17 and 18 of BEH-DB-058; a property test over generated clock schedules.

**Related**: [BEH-DB-034](behaviors/05-order-and-clocks.md#beh-db-034-the-hlc-and-its-send-rule), [BEH-DB-035](behaviors/05-order-and-clocks.md#beh-db-035-the-receive-rule-and-the-drift-bound).

## INV-DB-008: In-flight delivery is bounded by the receiver's credit

A relay never has more unacknowledged batches, or larger batches, to a destination than that destination's last credit allows; a follower never has more than one history read in flight per source, nor asks for more than the source's page bound.

**Source**: `packages/durable-bus/src/Relay.ts` *(Planned)*.

**Implication**: reconnecting fleets cannot overload a receiver (replay storms).

**Verification** *(Planned)*: checks 21–23 and 30 of BEH-DB-058.

**Related**: [BEH-DB-047](behaviors/06-replay-and-snapshots.md#beh-db-047-historysource--the-pull-port-for-downstream-history), [BEH-DB-041](behaviors/06-replay-and-snapshots.md#beh-db-041-the-receiver-grants-credit), [BEH-DB-042](behaviors/06-replay-and-snapshots.md#beh-db-042-reconnection-is-spread-out), [ADR-DB-006](decisions/006-bounded-replay-and-snapshots.md).

## INV-DB-009: No snapshot restore removes an unacknowledged outbox envelope

The pending set of every destination and the highest outbox sequence of every (origin, stream) are the same after a snapshot restore, or an in-store re-bootstrap install, as before it; a restore that would change them rolls back. A whole-store re-bootstrap runs only after every pending envelope was pushed, with the outbox frozen until the install ends, and starts a new incarnation.

**Source**: `packages/durable-bus/src/Snapshot.ts` *(Planned)* — the before-and-after comparison inside the restore transaction (BEH-DB-044); `rebootstrapOutbox` reports what is kept (BEH-DB-048).

**Implication**: facts recorded offline survive a re-bootstrap on either install path, because the federation companion calls the application's install only through `OutboxSettlement.install` (BEH-DB-048); what the bus cannot check — an install that bypasses that call — is outside this invariant.

**Verification** *(Planned)*: checks 33, 34 and 39 of BEH-DB-058.

**Related**: [BEH-DB-044](behaviors/06-replay-and-snapshots.md#beh-db-044-a-subscriber-behind-the-retained-history-needs-a-snapshot), [BEH-DB-048](behaviors/06-replay-and-snapshots.md#beh-db-048-before-a-snapshot-the-outbox-is-pushed-or-kept), [ADR-DB-006](decisions/006-bounded-replay-and-snapshots.md).

## INV-DB-010: A payload reaches storage and the wire only through the payload codec

Every committed envelope's `payload` is the output of the wired `PayloadCodec` (the identity when none is wired), and no other envelope field is changed by it.

**Source**: `packages/durable-bus/src/Envelope.ts` *(Planned)* (BEH-DB-008).

**Implication**: a codec that encrypts payloads covers every copy the bus stores or sends — outbox, inbox, history, resends — while order, deduplication and access checks keep working on payloads nobody can read. The decoded value a handler receives, and what `forward` emits on the core bus (BEH-DB-050), are outside the codec's reach.

**Verification** *(Planned)*: check 31 of BEH-DB-058.

**Related**: [BEH-DB-008](behaviors/01-events-and-envelope.md#beh-db-008-a-payloadcodec-encodes-payloads-and-records-carry-no-personal-data), [ADR-DB-008](decisions/008-actor-and-annotations-are-claims.md).

## INV-DB-011: No envelope is delivered to a subscriber the access policy denied

With a wired core `AccessPolicy`, a subscription handler runs for an envelope only after `AccessPolicy.ask` allowed its delivery, for local, received and pulled envelopes alike; a `HistorySource` returns an envelope to an out-of-host reader only after its `HistoryAccess` allowed it, or when the operator wrote `access: "open"`.

**Source**: `packages/durable-bus/src/Subscription.ts` *(Planned)* (BEH-DB-053).

**Implication**: withdrawing a plugin's access to an event type stops deliveries to its existing subscriptions, including events from other hosts.

**Verification** *(Planned)*: checks 35 and 40 of BEH-DB-058.

**Related**: [BEH-DB-053](behaviors/07-core-bus-and-adapters.md#beh-db-053-who-may-publish-and-subscribe-the-hosts-accesspolicy), [ADR-DB-001](decisions/001-a-separate-contract-from-the-core-bus.md).
