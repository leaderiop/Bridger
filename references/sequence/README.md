# Bridger Sequence — Specification

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-SQ-00                                                |
> | Revision       | 0.8                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification — Master Index (companion)          |
> | Change History | 0.8 (2026-11-11): CCR-SQ-007 registered (specification audit of 2026-11-11, round 5: H2, transaction-bound durable-bus fence) (CCR-SQ-007)<br>0.7 (2026-11-10): CCR-SQ-006 registered (specification audit of 2026-11-10, round 4: scoped durable-bus fence) (CCR-SQ-006)<br>0.6 (2026-11-10): CCR-SQ-005 registered (specification audit of 2026-11-10, round 3: supersession actor) (CCR-SQ-005)<br>0.5 (2026-11-10): CCR-SQ-004 registered (specification audit of 2026-11-09, round 2: P5, series events under the plugin's principal) (CCR-SQ-004)<br>0.4 (2026-11-09): CCR-SQ-003 registered (specification audit of 2026-11-09: U-10, M-05, F-05); dependency rows for core 26 and the delivery companion restated; a core seam requested, then provided by core CCR-BR-033 (CCR-SQ-003)<br>0.3 (2026-11-08): CCR-SQ-002 registered (round-2 agent review); summary states the supersession stream (CCR-SQ-002)<br>0.2 (2026-11-08): CCR-SQ-001 extended: `SQ` infix registered by core, URS-BR-057 cited (CCR-SQ-001)<br>0.1 (2026-11-08): Initial draft (CCR-SQ-001)                 |

---

**implementation: absent**

This is the specification of `@bridger/sequence`, an optional companion
package of `@bridger/core`. It keeps **per-origin number series**: a series
is owned by one host (one origin), issues the numbers 1, 2, 3 … without
holes, can be closed, and never renumbers a number it issued. `next()`
reserves a number inside the caller's local storage transaction, together
with the event-store append that uses it, so a number exists exactly when the
record that carries it was committed. An authority verifies the series it
receives — gaps, duplicates, closure — and a host restored from a backup
starts a new origin incarnation, which closes its old series by events in
its own stream, never by writing in the old series. It depends on
`@bridger/core`, `@bridger/event-store` and `@bridger/durable-bus`. It covers
item 27 of the Bridger recheck of 2026-11-08.

## Status: prospective

Nothing described here is implemented. Every document is a `Draft`, every
decision is `Proposed`, and every source or test path is marked *Planned*.
The rules of the core specification apply unchanged
([ADR-BR-036](../core/decisions/036-prospective-specification.md),
[ADR-BR-035](../core/decisions/035-evidence-from-executed-tests.md)).

## The honest-claims rule

This companion inherits the core's honest-claims rule
([core README](../core/README.md#the-honest-claims-rule)). In particular:

- "Contiguous" means: the numbers **committed** in one series are 1 … n, each
  once. A number handed to a person before its transaction committed is
  outside that statement; not doing so is the application's obligation
  ([BEH-SQ-006](./behaviors/01-series-and-ownership.md#beh-sq-006-a-number-is-handed-out-only-after-commit)).
- The package **cannot detect** a restore from backup by itself. Starting a
  new incarnation after a restore is the operator's obligation, as it is in
  the event delivery companion
  ([BEH-DB-004](../durable-bus/behaviors/01-events-and-envelope.md#beh-db-004-an-origin-is-an-incarnation-never-reused)).
  Numbers issued after the backup and lost with the host are not detectable
  by the series alone ([BEH-SQ-010](./behaviors/02-incarnation-and-verification.md#beh-sq-010-the-lost-tail-is-a-stated-limit)).
- Verification reports what it checked and no overall pass value. It is
  **not** evidence that a series is complete beyond what the authority
  received.
- Chaining a series is the audit-chain companion's, through `ChainSink<R>`,
  within that companion's limits. Nothing here makes a series unalterable.
- Number formats (prefixes, years, padding, check digits) and what a number
  means are the **application's**
  ([ADR-SQ-004](./decisions/004-formats-and-meaning-stay-in-the-application.md)).

## Reading order

| Step | Document | Purpose |
| ---- | -------- | ------- |
| 1 | [Overview](./overview.md) | Mission, boundary, API surface, worked example, limits |
| 2 | [Behaviours](./behaviors/01-series-and-ownership.md) | `BEH-SQ` requirements |
| 3 | [Invariants](./invariants.md) | Properties that hold for every execution |
| 4 | [Decisions](./decisions/001-numbers-are-issued-by-the-owning-host.md) | `ADR-SQ` records |
| 5 | [Risks](./risks.md) | Hazards, scored with the core method |
| 6 | [Traceability](./traceability.md) | BEH → INV → ADR → REQ |

Read the [event-store companion](../event-store/README.md) first: a series is
an event-store stream.

## Contents

### Behaviours

| # | File | Identifiers |
| - | ---- | ----------- |
| 01 | [Series and ownership](./behaviors/01-series-and-ownership.md) | BEH-SQ-001–008 |
| 02 | [Incarnation and verification](./behaviors/02-incarnation-and-verification.md) | BEH-SQ-009–016 |
| 03 | [Formats, testing and acceptance](./behaviors/03-formats-testing-and-acceptance.md) | BEH-SQ-017–020 (021–024 reserved) |

### Decisions

| ID | Title |
| -- | ----- |
| [ADR-SQ-001](./decisions/001-numbers-are-issued-by-the-owning-host.md) | Numbers are issued by the owning host, never by the authority |
| [ADR-SQ-002](./decisions/002-a-series-is-an-event-store-stream.md) | A series is an event-store stream; contiguity comes from stream versions |
| [ADR-SQ-003](./decisions/003-a-restore-closes-the-old-series.md) | A restore starts a new incarnation and closes the old series; numbers are never reused |
| [ADR-SQ-004](./decisions/004-formats-and-meaning-stay-in-the-application.md) | Formats and meaning stay in the application |

## Dependencies on core and on other companions

| Document | What this package uses | Owner |
| -------- | ---------------------- | ----- |
| [22 — Attributable Operations](../core/behaviors/22-attributable-operations.md) | Actor and `CurrentCorrelation` on series events (BEH-BR-185, BEH-BR-187), through the event store | Core |
| [23 — Audit Sink and Record](../core/behaviors/23-audit-sink-and-record.md), [24 — Time, Identifiers and Sequence](../core/behaviors/24-time-ids-and-sequence.md) | `Clock`, `IdGenerator`; the model of `verifyAuditSequence` (BEH-BR-215) for `verifySeries`; series events are not core audit records (BEH-BR-207) | Core |
| [26 — Versioned Contracts](../core/behaviors/26-versioned-contracts.md) | The `Sequence` service as a local contract with the members `open`, `next` and `close` (BEH-BR-225; BEH-SQ-003, BEH-SQ-008) | Core |
| [28 — Plugin Principal and Mandatory Policy](../core/behaviors/28-plugin-principal-and-mandatory-policy.md), [29 — Capability Grants and Call Log](../core/behaviors/29-capability-grants-and-call-log.md) | `onBehalfOf`, `AccessPolicy.ask` for series streams (BEH-BR-259, BEH-BR-269); grants on `next` and `close` (BEH-BR-273) | Core |
| [30 — Operation Context Annotations](../core/behaviors/30-operation-context-annotations.md) | Annotations carried by series events (BEH-BR-296), through the event store | Core |
| [Event-store companion](../event-store/README.md) | Streams, expected versions, the shared transaction, publication, `seriesSpec` for chaining | Companion ES |
| [Event delivery companion](../durable-bus/README.md) | The origin `node#incarnation` and its rules, `DurableBus.origin` and `originChanges` (BEH-DB-004); the store-swap participant of a whole-store re-bootstrap (BEH-DB-048); delivery in order per origin and stream (BEH-DB-033) | Companion DB |
| [Audit-chain companion](../audit-chain/README.md) | `ChainSink<R>` (BEH-AC-025, CCR-AC-003) | Companion AC |

The local `Sequence` contract is declared with core `Contract.local` (BEH-BR-225, added by core CCR-BR-033 at the request of CCR-SQ-003), so that it carries no codecs and a boundary companion refuses it (BEH-BR-232).

## Open questions

1. **Several writers in one origin.** A host with several local processes
   writing one series relies on the engine's write lock (event-store
   BEH-ES-035); a series shared by processes on different machines is not
   supported.
2. **Pre-allocated blocks.** Handing a host a block of numbers from the
   authority (for devices that must print before any local commit) is not
   specified; it contradicts ADR-SQ-001 and would need its own decision.

## Identifier scheme

| Prefix | Meaning |
| ------ | ------- |
| `BEH-SQ-NNN` | Functional behaviour requirement (blocks of eight per file) |
| `INV-SQ-NNN` | Runtime invariant |
| `ADR-SQ-NNN` | Architecture decision |
| `REQ-SQ-NNN` | Acceptance scenario (planned) |
| `RSK-SQ-NNN` | Risk of this package ([risks](./risks.md)) |
| `CCR-SQ-NNN` | Change control record of this package |
| `BRIDGER-SQ-*` | Document ID |

The rules of the core [identifier scheme](../core/process/requirement-id-scheme.md)
apply, with infix `SQ`, registered in core's change control (CCR-BR-027;
core identifier scheme).

## Document history

| CCR | Date | Change |
| --- | ---- | ------ |
| CCR-SQ-001 | 2026-11-08 | Initial draft: per-origin series owned by one host; `Series.open(origin, name)`, `next()` reserving within the caller's transaction together with the event-store append, `close(reason)`; contiguity from event-store stream versions, no renumbering; publication to an authority; `verifySeries` (gaps, duplicates, closure, foreign writer, lost-tail limit); incarnation bump on restore closing the old series ("superseded"); chaining through audit-chain `ChainSink<R>`; formats in the application. Recheck item 27 of 2026-11-08.<br>**Impact (PROC-03 §3).** (1) Identifiers: BEH-SQ-001–020, INV-SQ-001–005, ADR-SQ-001–004, REQ-SQ-001–010 and RSK-SQ-001–004 added; BEH-SQ-021–024 reserved; no core identifier changed. (2) Risk: four package risks scored with the core method; one core risk proposed for the core register; no core score changed. (3) GxP impact: indirect — numbered business records of the application; no core record, gate or legality change, and no completeness or tamper-evidence claim. (4) Revalidation: no version has been released or qualified (implementation absent); none. (5) Compatibility: no core public type changes; depends on the event-store companion (CCR-ES-001), durable-bus origins and audit-chain `ChainSink<R>` (CCR-AC-003). Extended after integration: the `SQ` infix and URS-BR-057 are registered by core CCR-BR-027; BEH-SQ-001, 004 and 005 cite URS-BR-057. |
| CCR-SQ-002 | 2026-11-08 | Resolutions of the round-2 agent review (R5-03, R5-06, R5-17, R5-18): a restore's supersession is recorded as `SeriesSuperseded` in the new incarnation's own stream, never appended to the old series (no forked stream or chain, no foreign writer); the plugin closes every open series of lower incarnations at start, including names never reopened; `verifySeries` takes decoded series events and orders by number; what a restore without a raised incarnation looks like at the authority (an inbox `EnvelopeConflict`, not duplicates); series event types are not field-encrypted; `WrongExpectedVersion` on `open` and `close`.<br>**Impact (PROC-03 §3).** (1) Identifiers: none added or withdrawn; BEH-SQ-002, 003, 009–013, 020, INV-SQ-004, ADR-SQ-003 (revision 0.2) and RSK-SQ-001, RSK-SQ-003 revised. (2) Risk: controls of RSK-SQ-001 and RSK-SQ-003 restated; no score changed. (3) GxP impact: indirect, unchanged. (4) Revalidation: none (implementation absent). (5) Compatibility: new event `SeriesSuperseded` and incarnation stream; `verifySeries` input type changed; `open` and `close` error unions widened. |
| CCR-SQ-003 | 2026-11-09 | Specification audit of 2026-11-09, data-plane findings on the sequence side. This is an agent review, not the independent review of PROC-03 §5. **Findings resolved.** U-10 (a re-bootstrap switches the origin on a running host while open `Series` handles keep appending to the old incarnation's streams under the new origin): `open`, `next` and `close` check the series' origin against durable-bus `DurableBus.origin` at every call and fail with `NotOwner { origin, current }` otherwise (BEH-SQ-002, INV-SQ-004); the supersession step of BEH-SQ-009 runs again on every origin change (`originChanges`, CCR-DB-004), calls under the new origin fail with the new `SupersessionPending` until it commits, and the plugin registers a durable-bus store-swap participant that reads the open series from the store being replaced, so that series the snapshot does not hold are superseded too, with exact numbers and `lastKnownOnly: false` (BEH-SQ-009, BEH-SQ-010, BEH-SQ-012, ADR-SQ-003). The snapshot rule is stated: a re-bootstrap snapshot may hold series streams of this node or of others, which the package never writes, and the package does not rely on it to hold this node's. Running supersession only over what the new store holds was rejected: the snapshot comes from another host and normally holds none of this node's series streams, so they would end at the authority without a closure. The remaining limit, a process that stops between the read and the commit of the step, is stated (BEH-SQ-009, RSK-SQ-003). M-05 (grantable members of `Sequence` never defined): BEH-SQ-003 defines the contract members `open`, `next` and `close`, each taking one request and running in the caller's `StoreTransaction`; `Series` is a handle over them with no store access of its own, so a grant on the members decides every call made through a handle; the plugin appends through its own `EventStore` capture, so a caller no longer needs one; BEH-SQ-008 states that the contract is local. F-05 (delivery stream): BEH-SQ-011 registers the series types with `publish: true`, which publishes each on the stream it was appended to (event-store BEH-ES-028 as amended by CCR-ES-003). **ERP alignment** (an item raised while aligning the ERP storage and records documents): whether the package should offer a generic restore epoch for series an application keeps itself, as the ERP's `restoreEpoch` does. Decided no: the durable-bus incarnation already is the package's restore epoch — part of every series' identity, kept outside backups by `IncarnationSource`, refused at start when lower than recorded (BEH-DB-004) — and a second counter with the same meaning could disagree with it. The overview states the limit (limit 5) and the application's duty for series it keeps outside the package. **Core follow-up.** Core CCR-BR-033 added the requested form; `Sequence` is declared with `Contract.local`, every major stays local, and a boundary companion refuses it (core BEH-BR-225, BEH-BR-232).<br>**Impact (PROC-03 §3).** (1) Identifiers: REQ-SQ-011 and REQ-SQ-012 added; BEH-SQ-002, 003, 008, 009, 010, 011, 012, 016, 019 and 020, INV-SQ-004, ADR-SQ-003, RSK-SQ-001 and RSK-SQ-003 amended; traceability rows REQ-SQ-001, 002, 005 and 007 amended; nothing withdrawn. (2) Risk: RSK-SQ-001 and RSK-SQ-003 failure modes, controls and residual extended; no score changed. (3) GxP impact: indirect — number series that identify records stay single-writer and closed across a whole-store re-bootstrap; no core record, gate or legality row changes. (4) Revalidation trigger: none; nothing is implemented, released or qualified (implementation absent). (5) Compatibility: draft to draft — `NotOwner` carries `current` instead of `configured`; `SupersessionPending` added; `SeriesSuperseded.lastKnownOnly` widens from `true` to `boolean`; `Sequence` members defined and `EventStore` dropped from the callers' environment; depends on durable-bus CCR-DB-004 (`origin`, `originChanges`, `onStoreSwap`) and event-store CCR-ES-003. **Requested of core (satisfied):** a form for a local contract, or local members without codecs, in core 26 (BEH-BR-225), and a rule that the remote companion refuses to serve or proxy one. Core CCR-BR-033 added `Contract.local` and the boundary refusal (BEH-BR-232); BEH-SQ-008 now declares the contract with it, and no member codecs are needed. |
| CCR-SQ-004 | 2026-11-10 | Round 2 findings of the specification audit of 2026-11-09, sequence side. This is an agent review, not the independent review of PROC-03 §5. **Findings resolved.** P5 (verification relied on authority-side recording with no decider, stream or fact identifier, so the authority's fresh `eventId`s could not be compared): the package ships `SeriesFacts` — `toFact` takes the envelope's stream and `eventId`; the decider keeps each event on the issuer's stream, uses the issuer's `eventId` as fact identifier (one hop, event-store BEH-ES-015) and accepts the event unchanged — and the authority records with `SeriesFacts.receive` under `EventStore.receiveOptions` (BEH-SQ-011); `SeriesEventInput.of` gives the issuer's `eventId`, read from `causationId` for a recorded received fact, so that `duplicates` and `foreignWriter` compare the issuer's ids (BEH-SQ-012). Low (series events published under the caller's principal): the plugin appends inside `Plugin.Runtime.asSelf`, so the series events' `onBehalfOf` and durable-bus's `emit` question name the `Sequence` plugin and only it needs an `emit` grant for the series types; the actor stays the caller's (BEH-SQ-008). Acceptance checks 8 and 12 extended.<br>**Impact (PROC-03 §3).** (1) Identifiers: BEH-SQ-008, 011, 012 and 020 amended; traceability rows BEH-SQ-008 and 011 and REQ-SQ-008 and 012 restated; nothing added or withdrawn. (2) Risk: no risk added and no score changed; the risks file is unchanged. (3) GxP impact: indirect — series checks at the authority compare the issuing host's identities, and series events name the plugin that wrote them; no core record, gate or legality row changes. (4) Revalidation trigger: none; nothing is implemented, released or qualified (implementation absent). (5) Compatibility: draft to draft — `SeriesFacts` added; `SeriesEventInput.of` reads `causationId` for received facts; series events' `onBehalfOf` becomes the `Sequence` plugin. |
| CCR-SQ-005 | 2026-11-10 | Round 3 of the specification audit of 2026-11-10 (SPEC-AUDIT-03), sequence side: an item the report listed as seen, not assessed. This is an agent review, not the independent review of PROC-03 §5. **Finding resolved.** The background supersession step had no actor: it runs in the plugin's own fiber, where core leaves `CurrentActor` unattributed, so under a durable-bus made with `requireActor: true` every attempt failed with `Unattributed` and `open`, `next` and `close` stayed `SupersessionPending`. The step now runs inside `CallerContext.serve` with `Annotations.empty`, no correlation, and the service actor `{ kind: "service", id: "sequence:" + node }`, the federation companion's idiom, under the plugin's own principal; `requireActor` accepts it as attributed (BEH-SQ-009; check 11).<br>**Impact (PROC-03 §3).** (1) Identifiers: BEH-SQ-009 amended; check 11 and REQ-SQ-011 restated; traceability row BEH-SQ-009 cites core BEH-BR-292; nothing added or withdrawn. (2) Risk: no risk added and no score changed. (3) GxP impact: indirect — `SeriesSuperseded` events are attributed to a named service actor; no core record, gate or legality row changes. (4) Revalidation trigger: none; nothing is implemented, released or qualified (implementation absent). (5) Compatibility: draft to draft — `SeriesSuperseded` events carry the service actor instead of an unattributed one. |
| CCR-SQ-006 | 2026-11-10 | Round 4 findings of the specification audit of 2026-11-10 (SPEC-AUDIT-04), sequence side. This is an agent review, not the independent review of PROC-03 §5. **Finding resolved.** H3 (durable-bus): `DurableBus.fence` is now scoped to the write transaction's `Scope`, which the adapter's `transaction` provides with `StoreTransaction`; the type of `SeriesFacts.receive`, an event-store `receive` handler, carries that `Scope` like event-store's own (BEH-SQ-011).<br>**Impact (PROC-03 §3).** (1) Identifiers: BEH-SQ-011's illustrative type amended; nothing added or withdrawn. (2) Risk: no risk added and no score changed. (3) GxP impact: none. (4) Revalidation trigger: none; nothing is implemented, released or qualified (implementation absent). (5) Compatibility: draft to draft — a type parameter only. |
| CCR-SQ-007 | 2026-11-11 | Round 5 findings of the specification audit of 2026-11-11 (SPEC-AUDIT-05), sequence side. This is an agent review, not the independent review of PROC-03 §5. **Finding resolved.** H2 (durable-bus): a `DurableBus.fence` admission is now bound to the transaction handle, not a `Scope`, so no write helper carries a `Scope` for it; `SeriesFacts.receive` requires `StoreTransaction` only again, as event-store's `receive` handler does (BEH-SQ-011). `open`, `next` and `close` keep their signatures.<br>**Impact (PROC-03 §3).** (1) Identifiers: BEH-SQ-011's illustrative type amended; nothing added or withdrawn. (2) Risk: no risk added and no score changed. (3) GxP impact: none. (4) Revalidation trigger: none; nothing is implemented, released or qualified (implementation absent). (5) Compatibility: draft to draft — a type parameter only, reverting CCR-SQ-006; depends on durable-bus CCR-DB-008. |

---

_Next: [Overview](./overview.md)_
