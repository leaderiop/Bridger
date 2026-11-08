# Bridger Durable Bus — Specification

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-DB-00                                                |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification — Companion Master Index            |
> | Change History | 0.2 (2026-11-08): Resolutions of the agent review of 2026-11-08 (CCR-DB-002)<br>0.1 (2026-11-08): Initial draft (CCR-DB-001)                 |

---

**implementation: absent**

This is the specification of the companion package `@bridger/durable-bus`.
It moves versioned, schema-described events between plugins and between
hosts through a **transactional outbox** written in the caller's own storage
transaction, delivers them at least once, and deduplicates them in an
**inbox** on the receiving side, preserving order per origin, stream and
sequence. Envelopes carry a hybrid logical clock, the actor and the
operation-context annotations. It covers gap item 9 of the architecture
review of 2026-11-08 and the replay-storm and clock-skew hazards of its §9.

## Status: prospective

Nothing described here is implemented. Every document is a `Draft`, every
decision is `Proposed`, and every source or test path is marked *Planned*.
The core rule applies unchanged
([ADR-BR-036](../core/decisions/036-prospective-specification.md),
[ADR-BR-035](../core/decisions/035-evidence-from-executed-tests.md)).

## The honest-claims rule, and the package name

This companion inherits the core's honest-claims rule
([core README](../core/README.md#the-honest-claims-rule)). The word in the
package name is a statement of intent, not a claim
([ADR-DB-007](./decisions/007-the-name-is-not-a-claim.md)):

- The package owns **no** storage. Whether an event survives a crash, a power
  loss or a disk failure depends entirely on the storage adapter and its
  configuration, which are the consumer's; this specification states the
  adapter's obligations and makes no persistence claim of its own.
- It makes **no** exactly-once claim. Delivery is at least once; an effect
  happens once only when the handler writes it in the same storage
  transaction as the inbox mark ([ADR-DB-003](./decisions/003-at-least-once-with-a-deduplicating-inbox.md)).
- It makes **no** claim that envelopes are authentic or tamper-evident. The
  actor and annotations in an envelope are claims of the origin; transport
  authentication is the transport's, and a hash chain is the audit-chain
  companion's business, not this one's.
- It is **not** the core event bus and not a mode of it
  ([ADR-DB-001](./decisions/001-a-separate-contract-from-the-core-bus.md)).

## Reading order

| Step | Document | Purpose |
| ---- | -------- | ------- |
| 1 | [Overview](./overview.md) | Mission, package boundary, public API surface, worked example |
| 2 | [Behaviours](./behaviors/01-events-and-envelope.md) | What the package must do, as `BEH-DB` requirements |
| 3 | [Invariants](./invariants.md) | Properties that hold for every execution |
| 4 | [Decisions](./decisions/001-a-separate-contract-from-the-core-bus.md) | Why, as `ADR-DB` records |
| 5 | [Traceability](./traceability.md) | BEH → INV → ADR → REQ |

## Contents

### Behaviours

| # | File | Identifiers |
| - | ---- | ----------- |
| 01 | [Events and the envelope](./behaviors/01-events-and-envelope.md) | BEH-DB-001–008 |
| 02 | [Transactional outbox](./behaviors/02-transactional-outbox.md) | BEH-DB-009–016 |
| 03 | [Delivery and inbox](./behaviors/03-delivery-and-inbox.md) | BEH-DB-017–024 |
| 04 | [Versions and upcasters](./behaviors/04-versions-and-upcasters.md) | BEH-DB-025–032 |
| 05 | [Order and hybrid logical clocks](./behaviors/05-order-and-clocks.md) | BEH-DB-033–040 |
| 06 | [Replay, backpressure and snapshots](./behaviors/06-replay-and-snapshots.md) | BEH-DB-041–048 |
| 07 | [Core bus, plugin packaging and storage adapters](./behaviors/07-core-bus-and-adapters.md) | BEH-DB-049–056 |
| 08 | [Testing and acceptance](./behaviors/08-testing-and-acceptance.md) | BEH-DB-057–064 |

### Decisions

| ADR | Title |
| --- | ----- |
| [ADR-DB-001](./decisions/001-a-separate-contract-from-the-core-bus.md) | A separate contract from the core event bus |
| [ADR-DB-002](./decisions/002-outbox-through-a-storage-port.md) | A transactional outbox through a storage port |
| [ADR-DB-003](./decisions/003-at-least-once-with-a-deduplicating-inbox.md) | At-least-once delivery with a deduplicating inbox |
| [ADR-DB-004](./decisions/004-order-per-origin-stream-sequence.md) | Order per origin, stream and sequence; clocks for causality only |
| [ADR-DB-005](./decisions/005-versioned-events-and-pure-upcasters.md) | Versioned events and pure upcasters |
| [ADR-DB-006](./decisions/006-bounded-replay-and-snapshots.md) | Bounded replay, and snapshots past the horizon |
| [ADR-DB-007](./decisions/007-the-name-is-not-a-claim.md) | The package name is not a claim |
| [ADR-DB-008](./decisions/008-actor-and-annotations-are-claims.md) | Actor and annotations travel as claims |

## Identifier scheme

The core scheme applies with the infix **`DB`**: `BEH-DB`, `INV-DB`,
`ADR-DB`, `REQ-DB` (in `traceability.md` §4), `CCR-DB`, and Document IDs
`BRIDGER-DB-*`. User requirements and risks are registered in the core
`urs.md` and `gxp/03-risk-assessment.md`. Changes follow core
[change control](../core/process/change-control.md).

## Open questions

These need a decision outside this tree; until then the behaviours are
designed within the current core.

1. **Risks to register in the core risk assessment.** Besides the risks
   named by CCR-DB-001: (a) origin reuse after a restore whose incarnation
   was not raised is not detectable by the package (BEH-DB-004,
   INV-DB-002) — operator obligation; (b) a receiver regression beyond the
   sender's retention loses envelopes, reported on both sides and repaired
   only by an attributed `acceptGap` or a re-bootstrap (BEH-DB-019);
   (c) past the inbox's retention a repeated (origin, stream, sequence) is
   absorbed without the equivocation check (BEH-DB-018).

## Document history

| CCR | Date | Change |
| --- | ---- | ------ |
| CCR-DB-001 | 2026-11-08 | Initial draft of the durable-bus companion: `DurableEvent.make(id, schema, { version, upcast })`; envelope with origin, stream, sequence, hybrid logical clock, actor and annotations; transactional outbox through a consumer storage port; at-least-once relay; deduplicating inbox; upcasters; order per origin/stream/sequence; replay bounds and snapshot re-bootstrap; separation from the core event bus; storage adapter obligations (SQLite first). Impact assessment (PROC-03 §3): (1) adds BEH-DB-001–007, 009–015, 017–030, 033–038, 041–046, 049–058 (the rest of each block reserved), INV-DB-001–008, ADR-DB-001–008, REQ-DB-001–027; no core identifier changed by this CCR — the core URS, RSK, glossary and overview rows it needs are proposed to the core change that registers this companion. (2) Risk: introduces event-delivery risks (lost or duplicated effects, disorder, origin equivocation, replay storms, skewed clocks) to be registered in the core risk assessment. (3) GxP impact: yes — envelopes carry the actor and annotations of the operation that produced them; the package changes no core audit record, gate or sequence. (4) Revalidation: none (nothing qualified exists). (5) Compatibility: new package; no core public type changes. |
| CCR-DB-002 | 2026-11-08 | Resolutions of the agent review of 2026-11-08 (R3 findings R3-27, R3-28, R3-29, R3-30, R3-31, R3-32, R3-33, R3-34, R3-35, R3-36, R3-37). Annotations carried as `Annotations.encode(Annotations.filter(bag, "wire"))` entries plus `annotationsOmitted`, decoded with `Annotations.decode` and combined through `CallerContext.serve`; the deadline never carried (BEH-DB-002, BEH-DB-007; core BEH-BR-296). HLC stamped inside the adapter's serialized append; start clock = max(outbox highest HLC, saved receipt clock); merged order agrees with sequences and with causation except after a `skewed` cause (BEH-DB-011, BEH-DB-034, BEH-DB-035, BEH-DB-037). Receiver regression detected from the acknowledgement watermark, resent from `OutboxStore.retained` or reported as `envelopes-lost`; attributed `acceptGap` (BEH-DB-019). Two parking levels: inbox-level stops (`UnknownEnvelopeFormat`, `EnvelopeConflict`, `releaseStream`) and subscription-level halts and parks (`resume`, `unpark` processed out of order) (BEH-DB-018, 021, 022, 026). Check 6 and INV-DB-002 restate origin uniqueness as an operator obligation (BEH-DB-004). New pull port `HistorySource` and `follow` (BEH-DB-047); `SnapshotRequired` removed from `DeliveryTransport.send` (BEH-DB-017, 044, 045). Duplicate check bounded by inbox retention (BEH-DB-018). `Ack.retryAfter` (BEH-DB-017, 041). No self-lease in `publish` (BEH-DB-052). Impact assessment (PROC-03 §3): (1) adds BEH-DB-047 and REQ-DB-028–030; amends BEH-DB-002, 004, 007, 011, 012, 017–022, 026, 034, 035, 037, 041, 044, 045, 051, 052, 054, 058, INV-DB-002, 005, 006, 007, 008, ADR-DB-004, 005, 006, 008; the BEH-DB-007 heading (and anchor) changed; no core identifier changed. (2) Risk: reduces silent-stall and ordering risks; three residual risks proposed for the core register (Open questions §1). (3) GxP impact: yes — `acceptGap`, `releaseStream`, `resume` and `unpark` are attributed operator actions; no core audit record, gate or sequence changes. (4) Revalidation: none (nothing qualified exists). (5) Compatibility: draft-to-draft; `DeliveryTransport.send`, `OutboxStore`, `InboxStore`, the subscription handler and the envelope's `annotations` field change shape. |
