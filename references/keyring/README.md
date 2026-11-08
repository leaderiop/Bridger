# Bridger Keyring — Specification

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-KR-00                                                |
> | Revision       | 0.4                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification — Master Index (companion)          |
> | Change History | 0.4 (2026-11-08): CCR-KR-002 registered (round-2 agent review); key distribution stated as a limit in the honest-claims rule and open question 2 (CCR-KR-002)<br>0.3 (2026-11-08): CCR-KR-001 extended: `KR` infix registered by core, URS-BR-058 and 059 cited (CCR-KR-001)<br>0.2 (2026-11-08): `PayloadCodec` dependency cites durable-bus BEH-DB-008; open question 1 answered by the alignment of BEH-KR-009 and BEH-KR-012 (CCR-KR-001, revision bump)<br>0.1 (2026-11-08): Initial draft (CCR-KR-001)                 |

---

**implementation: absent**

This is the specification of `@bridger/keyring`, an optional companion
package of `@bridger/core`. It supports **crypto-shredding** in append-only
systems: each data subject gets its own data key (`Keyring.key(subject)`),
selected payload fields are encrypted with it through the event delivery
companion's `PayloadCodec`, and `shred(subject)` destroys the key and calls
redaction callbacks so that projections and caches drop the plaintext they
hold. Stored events, envelopes and hash chains keep their ciphertext
unchanged, so chains that hash ciphertext stay verifiable after a shred. Key
storage, rotation and backup are specified as obligations. It depends on
`@bridger/core` and `@bridger/durable-bus`. It covers item 28 of the Bridger
recheck of 2026-11-08.

## Status: prospective

Nothing described here is implemented. Every document is a `Draft`, every
decision is `Proposed`, and every source or test path is marked *Planned*.
The rules of the core specification apply unchanged
([ADR-BR-036](../core/decisions/036-prospective-specification.md),
[ADR-BR-035](../core/decisions/035-evidence-from-executed-tests.md)).

## The honest-claims rule

This companion inherits the core's honest-claims rule
([core README](../core/README.md#the-honest-claims-rule)). What a shred does
is specified exactly, and nothing beyond it is claimed:

- A shred **destroys the key copies the keyring's `KeyStore` holds** and asks
  every registered redaction callback to drop plaintext. It does **not**
  reach copies of a key outside the `KeyStore` (backups not managed through
  it, exports, memory of a running process), plaintext copies the
  application made (logs, files, screens, reports, third-party systems), or
  plaintext held by a projection that registered no callback.
- The package makes **no** claim that a shred is irreversible, that data is
  erased, or that using it satisfies any data-protection law. Whether
  ciphertext stays unreadable depends on the algorithm, the key custody and
  the absence of copies — obligations stated in
  [behaviour 01](./behaviors/01-keys-and-subjects.md) and
  [behaviour 03](./behaviors/03-shred-and-acceptance.md).
- Which fields are personal data, which subject they belong to, and when to
  shred are the **application's** decisions
  ([ADR-KR-005](./decisions/005-the-application-chooses-personal-fields.md)).
- The subject identifier, stream ids, event types and other unencrypted
  metadata stay readable after a shred; they must not themselves be personal
  data (BEH-KR-001, BEH-KR-016).
- The package **distributes no key** and keeps no record of which hosts hold
  one. A shred reaches another host only through its notice, and a receipt
  speaks only for hosts that acknowledged or that the consumer's `KeyStore`
  declares (BEH-KR-020, BEH-KR-021).

## Reading order

| Step | Document | Purpose |
| ---- | -------- | ------- |
| 1 | [Overview](./overview.md) | Mission, boundary, API, worked example, limits |
| 2 | [Behaviours](./behaviors/01-keys-and-subjects.md) | `BEH-KR` requirements |
| 3 | [Invariants](./invariants.md) | Properties that hold for every execution |
| 4 | [Decisions](./decisions/001-shred-keys-never-rewrite-events.md) | `ADR-KR` records |
| 5 | [Risks](./risks.md) | Hazards, scored with the core method |
| 6 | [Traceability](./traceability.md) | BEH → INV → ADR → REQ |

## Contents

### Behaviours

| # | File | Identifiers |
| - | ---- | ----------- |
| 01 | [Keys and subjects](./behaviors/01-keys-and-subjects.md) | BEH-KR-001–008 |
| 02 | [Field encryption](./behaviors/02-field-encryption.md) | BEH-KR-009–016 |
| 03 | [Shred and acceptance](./behaviors/03-shred-and-acceptance.md) | BEH-KR-017–024 |

### Decisions

| ID | Title |
| -- | ----- |
| [ADR-KR-001](./decisions/001-shred-keys-never-rewrite-events.md) | Shred keys; never rewrite events |
| [ADR-KR-002](./decisions/002-field-encryption-through-the-payload-codec.md) | Field encryption through the durable-bus `PayloadCodec`, one codec for storage and wire |
| [ADR-KR-003](./decisions/003-a-shredded-subject-is-closed.md) | A shredded subject is closed, never given a new key |
| [ADR-KR-004](./decisions/004-key-custody-is-an-obligation.md) | Key storage, rotation and backup are obligations of the adapter and the consumer |
| [ADR-KR-005](./decisions/005-the-application-chooses-personal-fields.md) | Which fields are personal data stays with the application |

## Dependencies on core and on other companions

| Document | What this package uses | Owner |
| -------- | ---------------------- | ----- |
| [22 — Attributable Operations](../core/behaviors/22-attributable-operations.md) | Actor and `CurrentCorrelation` on shred records (BEH-BR-185, BEH-BR-187) | Core |
| [23 — Audit Sink and Record](../core/behaviors/23-audit-sink-and-record.md) | Guidance: core's audit `reason` must carry no personal data (BEH-BR-196); shred records are not core audit records (BEH-BR-207) | Core |
| [24 — Time, Identifiers and Sequence](../core/behaviors/24-time-ids-and-sequence.md) | `Clock`, `IdGenerator`; nonces and key material from the package's own `NonceSource` port, which tests replace, following the rule against ambient randomness (BEH-BR-211) | Core |
| [26 — Versioned Contracts](../core/behaviors/26-versioned-contracts.md) | The `Keyring` service as a contract (BEH-BR-225) | Core |
| [28 — Plugin Principal and Mandatory Policy](../core/behaviors/28-plugin-principal-and-mandatory-policy.md), [29 — Capability Grants and Call Log](../core/behaviors/29-capability-grants-and-call-log.md) | `onBehalfOf` (BEH-BR-259); grants on `decrypt` and `shred` (BEH-BR-273); call-log entries without plaintext (BEH-BR-276, BEH-BR-280); `CapabilityPolicy.changes` to narrow live captures after a grant change (BEH-BR-281) | Core |
| [30 — Operation Context Annotations](../core/behaviors/30-operation-context-annotations.md) | Guidance: no personal data in annotations (BEH-BR-289, BEH-BR-293) | Core |
| [Event delivery companion](../durable-bus/README.md) | `PayloadCodec` ([BEH-DB-008](../durable-bus/behaviors/01-events-and-envelope.md#beh-db-008-a-payloadcodec-encodes-payloads-and-records-carry-no-personal-data), CCR-DB-003); publication of shred notices | Companion DB |
| [Event-store companion](../event-store/README.md) | Stored payloads through the codec (BEH-ES-032); projections that register redaction callbacks | Companion ES |
| [Audit-chain companion](../audit-chain/README.md) | Chains over the stored form hash ciphertext (BEH-AC-025, CCR-AC-003) | Companion AC |

No new core seam is needed.

## Open questions

1. **`PayloadCodec` — aligned.** BEH-KR-009 and BEH-KR-012 implement the
   `PayloadCodec` of durable-bus BEH-DB-008 as written (revision 0.2): codec
   id "bridger-keyring/v1", encode failures surfaced as `PayloadEncodeFailed`,
   shredded fields decoded as `Shredded` markers, `PayloadUnreadable` only
   when nothing can be restored or marked. BEH-KR-010 and BEH-KR-011 needed no
   change.
2. **Subjects across hosts — now a stated limit, not an open question.** Keys
   needed on several hosts (a terminal that must show a customer's name
   offline, an authority that must apply rules to a received fact) are
   distributed by the consumer's `KeyStore`, if at all; `Keyring.key` creates
   keys in the local `KeyStore` only. Consequence: a host without the subject
   keys cannot decode selected fields; it records received events verbatim
   (event-store BEH-ES-030) or its receiving subscription halts, and it
   applies no rule to those fields (BEH-KR-012). A key-distribution protocol
   is not specified here.

## Identifier scheme

| Prefix | Meaning |
| ------ | ------- |
| `BEH-KR-NNN` | Functional behaviour requirement (blocks of eight per file) |
| `INV-KR-NNN` | Runtime invariant |
| `ADR-KR-NNN` | Architecture decision |
| `REQ-KR-NNN` | Acceptance scenario (planned) |
| `RSK-KR-NNN` | Risk of this package ([risks](./risks.md)) |
| `CCR-KR-NNN` | Change control record of this package |
| `BRIDGER-KR-*` | Document ID |

The rules of the core [identifier scheme](../core/process/requirement-id-scheme.md)
apply, with infix `KR`, registered in core's change control (CCR-BR-027;
core identifier scheme).

## Document history

| CCR | Date | Change |
| --- | ---- | ------ |
| CCR-KR-001 | 2026-11-08 | Initial draft: per-subject data keys (`Keyring.key(subject)`), envelope encryption with authenticated data, the `KeyStore` and `KeyWrapper` ports with storage, rotation and backup obligations; field encryption as a durable-bus `PayloadCodec` with an encrypted-field form, a `Shredded` marker after a shred, and chains hashing ciphertext only; `shred(subject)` with a tombstone, key destruction, redaction callbacks, shred notices across hosts and a receipt; the honest limits of a shred. Recheck item 28 of 2026-11-08.<br>**Impact (PROC-03 §3).** (1) Identifiers: BEH-KR-001–024, INV-KR-001–005, ADR-KR-001–005, REQ-KR-001–012 and RSK-KR-001–005 added; no core identifier changed. (2) Risk: five package risks scored with the core method; one core risk proposed for the core register; no core score changed. (3) GxP impact: indirect — a shred makes encrypted fields of stored records unreadable, which a regulated consumer must weigh against record-retention duties; no core record, gate or legality change; no erasure or irreversibility claim. (4) Revalidation: no version has been released or qualified (implementation absent); none. (5) Compatibility: no core public type changes; depends on durable-bus `PayloadCodec` as it is being specified (CCR-DB-003). Extended after integration: the `KR` infix and URS-BR-058 and URS-BR-059 are registered by core CCR-BR-027; BEH-KR-002, 008 and 017 cite URS-BR-058, BEH-KR-009 and 012 cite URS-BR-058 and URS-BR-059. |
| CCR-KR-002 | 2026-11-08 | Resolutions of the round-2 agent review (R5-04, R5-05, R5-07, R5-08, R5-19, R5-26): an existing `Shredded` marker is stored as a marker without a key, so a late fact about a shredded subject is recorded; the key precondition is a stated limit with its consequence (verbatim recording or a halted subscription, never a parked fact); a shred persists its step state, is resumed at plugin start and on a repeated `shred`, opens its own transactions and commits its notice with the tombstone when the `KeyStore` shares the outbox's database; receipts list acknowledging and `KeyStore`-declared hosts only; `Keyring.Field` is `Codec<A \| Shredded, I \| Shredded>` and upcasters pass markers through. No erasure wording was found in this tree (R5-08 concerns core, durable-bus and audit-chain text and is requested there).<br>**Impact (PROC-03 §3).** (1) Identifiers: none added or withdrawn; BEH-KR-004, 009, 010, 012, 017, 020, 021, 022 and 024 revised. (2) Risk: no score changed. (3) GxP impact: indirect, unchanged; no erasure or irreversibility claim. (4) Revalidation: none (implementation absent). (5) Compatibility: `KeyStore` gains `markStep` and `incompleteShreds`, and optional `holders` and `transaction`; `ShredReceipt` gains `steps` and `hosts`; the `Field` codec's encoded side changes. |

---

_Next: [Overview](./overview.md)_
