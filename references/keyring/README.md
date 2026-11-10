# Bridger Keyring — Specification

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-KR-00                                                |
> | Revision       | 0.7                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification — Master Index (companion)          |
> | Change History | 0.7 (2026-11-10): CCR-KR-005 registered (round 3 findings of the specification audit of 2026-11-10: M22, M23, M24) (CCR-KR-005)<br>0.6 (2026-11-10): CCR-KR-004 registered (round 2 findings of the specification audit of 2026-11-09: P10, P11, P12, key-store outage on decode); dependency row for core 28 names `AccessPolicy` for shred notices; follow-up: `KeyStore` members for `rewrap` (CCR-KR-004)<br>0.5 (2026-11-09): CCR-KR-003 registered (specification audit of 2026-11-09, M-01 keyring side; C-13 checked); dependency rows for core 22, 23 and 26 restated (CCR-KR-003)<br>0.4 (2026-11-08): CCR-KR-002 registered (round-2 agent review); key distribution stated as a limit in the honest-claims rule and open question 2 (CCR-KR-002)<br>0.3 (2026-11-08): CCR-KR-001 extended: `KR` infix registered by core, URS-BR-058 and 059 cited (CCR-KR-001)<br>0.2 (2026-11-08): `PayloadCodec` dependency cites durable-bus BEH-DB-008; open question 1 answered by the alignment of BEH-KR-009 and BEH-KR-012 (CCR-KR-001, revision bump)<br>0.1 (2026-11-08): Initial draft (CCR-KR-001)                 |

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
| [22 — Attributable Operations](../core/behaviors/22-attributable-operations.md) | Actor, `onBehalfOf` and `CurrentCorrelation` resolved for a shred and kept in its tombstone (BEH-BR-185, BEH-BR-187); the reserved actors refused for a shred as core refuses them for `acknowledgeAuditDegraded` (BEH-BR-189) | Core |
| [23 — Audit Sink and Record](../core/behaviors/23-audit-sink-and-record.md) | Guidance: core's audit `reason` must carry no personal data (BEH-BR-196); the tombstone is the keyring's attributable record of a shred, not a core audit record (BEH-BR-193, BEH-BR-207); a core compliance-matrix row allocating it is requested from core (CCR-KR-003) | Core |
| [24 — Time, Identifiers and Sequence](../core/behaviors/24-time-ids-and-sequence.md) | `Clock`, `IdGenerator`; nonces and key material from the package's own `NonceSource` port, which tests replace, following the rule against ambient randomness (BEH-BR-211) | Core |
| [26 — Versioned Contracts](../core/behaviors/26-versioned-contracts.md) | The `Keyring` service as a local contract, `Contract.local` (BEH-BR-225, core CCR-BR-033), refused at every host boundary (BEH-BR-232) | Core |
| [28 — Plugin Principal and Mandatory Policy](../core/behaviors/28-plugin-principal-and-mandatory-policy.md), [29 — Capability Grants and Call Log](../core/behaviors/29-capability-grants-and-call-log.md) | `onBehalfOf` (BEH-BR-259); `AccessPolicy` rules that keep shred notices to the keyring plugin and accepted origins (BEH-BR-269, BEH-KR-020); grants on `decrypt`, `rotate`, `rewrap` and `shred` (BEH-BR-273); call-log entries without plaintext (BEH-BR-276, BEH-BR-280); `CapabilityPolicy.changes` to narrow live captures after a grant change (BEH-BR-281) | Core |
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
| CCR-KR-003 | 2026-11-09 | Specification audit of 2026-11-09, finding M-01 (keyring side) and a check of C-13. This is an agent review, not the independent review of PROC-03 §5. M-01: a shred resolved its actor and correlation but kept only `{ subject, shredId, shreddedAt, keyIds }`, so nothing recorded who made retained fields unreadable, or why. Resolved: a shred by a reserved or blank actor fails with `ShredUnattributed` (BEH-KR-017); the tombstone carries `attribution` — actor, `onBehalfOf`, correlation, reason and the durable-bus origin — written with step 1 and never changed, `markStep` changing step state only (BEH-KR-004, BEH-KR-018); the notice carries `reason` and `shreddedAt` and is published under the shred's context, and a receiving host keeps the origin's attribution as a claim with `received` (BEH-KR-020); the receipt exposes it (BEH-KR-017); new RSK-KR-006. The tombstone is stated not to be a core audit record and not protected against the store's administrators. Follow-up of core CCR-BR-033: `Keyring` is declared with `Contract.local` — `onShred` takes a callback and a scope, and `decrypt` would put plaintext on a wire the package does not control (BEH-KR-008). C-13: BEH-KR-012 is correct as written; the contradiction was in core's RSK-BR-070 control text, which core CCR-BR-033 aligned with BEH-KR-012. **Impact (PROC-03 §3).** (1) Identifiers: RSK-KR-006 added; BEH-KR-004, 008, 017, 018, 020, 024 amended; traceability rows REQ-KR-010 and 012 amended; none withdrawn. (2) Risk: RSK-KR-006 scored (initial High/High, residual Medium/High); no core score changed; core RSK-BR-070 controls aligned and the compliance-matrix row allocating the recording of a crypto-shred to this companion were added by core CCR-BR-033 (core gxp/03-risk-assessment.md, gxp/02-compliance-matrix.md §4). (3) GxP impact: yes, indirect — a shred, which can make fields of retained records unreadable, now leaves an attributable, reasoned record on every host that applies it; no core record, gate or legality change; no completeness, tamper-evidence or erasure claim. (4) Revalidation: none (implementation absent). (5) Compatibility: draft-to-draft; `Tombstone`, `SubjectShredded` and `ShredReceipt` gain fields; `shred` gains the error `ShredUnattributed`; a shred by `Actor.system` that core would allow is refused; `Keyring` can no longer be served by the remote companion. |
| CCR-KR-004 | 2026-11-10 | Round 2 findings of the specification audit of 2026-11-09 (SPEC-AUDIT-02, P10, P11, P12 and a low finding; an agent review, not the independent review of PROC-03 §5). P10: BEH-KR-006 required `Keyring.rotate` and `Keyring.rewrap`, but neither was in `KeyringShape`, the contract's members or the overview; both are added (BEH-KR-002, BEH-KR-008, overview), so they are granted and logged like the other members. P11: RSK-KR-002's control said reads yield `Shredded`-like markers, while BEH-KR-012 fails a decode with `PayloadUnreadable` when a key is absent without a tombstone; the control is restated and the risk re-scored, with unchanged scores because the typed failure is at least as visible. P12: a received `SubjectShredded` notice skipped the attribution rule and the grant of a local shred; a notice under a reserved or blank actor, or with a blank reason, is now parked and never applied (`ShredUnattributed`), and the consumer's `AccessPolicy` must keep publishing the notice to the keyring plugin and receiving it to accepted origins (BEH-KR-020, RSK-KR-006). Low: a decode that meets `KeyStoreUnavailable` fails with `PayloadDecodeFailed`, which the reader retries, never with `PayloadUnreadable` or a marker (BEH-KR-012). Follow-ups: `Keyring.rewrap` had no `KeyStore` member to find or replace the stored key versions it must re-wrap; the port gains `wrappedUnder(kekId)` and a compare-and-set `replaceWrapped` that fails with the new `WrappedKeyChanged` and changes nothing when the stored wrapped key is no longer the one read (BEH-KR-004), and `rewrap` skips a version re-wrapped or shredded meanwhile and lists again until no version is left under `kekId` (BEH-KR-006); checks 3 and 4 extended (BEH-KR-024).<br>**Impact (PROC-03 §3).** (1) Identifiers: none added or withdrawn; BEH-KR-002, 004, 006, 008, 012, 020 and 024 (checks 3, 4, 7 and 12) amended; RSK-KR-002 and RSK-KR-006 amended. (2) Risk: RSK-KR-002 re-scored with unchanged scores; RSK-KR-006 failure mode and controls extended to forged or unattributed notices, scores unchanged; no core risk changed. (3) GxP impact: yes, indirect — a shred applied on a receiving host now requires the attribution a local shred requires, and an outage of the key store no longer risks a read that looks like a shred; no core record, gate or legality change; no erasure claim. (4) Revalidation: none (implementation absent); REQ-KR-003, 004, 005, 007 and 012 cover the changes. (5) Compatibility: draft-to-draft; `KeyringShape` gains `rotate` and `rewrap`; the `Keyring` contract lists two more members; the field codec's decode error under a key-store outage is `PayloadDecodeFailed`; the notice subscription parks refused notices; `ShredUnattributed` is also raised by the notice handler; `KeyStore` gains `wrappedUnder` and `replaceWrapped`, which every adapter must implement, and the error `WrappedKeyChanged`. |
| CCR-KR-005 | 2026-11-10 | Round 3 findings of the specification audit of 2026-11-10 (SPEC-AUDIT-03; this is an agent review, not the independent review of PROC-03 §5). M22: a received shred notice that met a key-store outage was parked after `maxAttempts` and never applied, leaving the subject readable; notices are now received by an applying subscription under `onPoison: "halt"` and a refusal subscription under "park-and-continue", so only an unattributed notice is parked, and a notice that meets `KeyStoreUnavailable` halts the applying subscription until the plugin starts again or `DurableBus.resume` is called (BEH-KR-020). M23: shred acknowledgements could be forged, `host` being a payload field and the `AccessPolicy` obligation covering only `SubjectShredded`; `SubjectShredAcknowledged` loses `host`, the acknowledging host is the node of the envelope's origin, counted only for the keyring's own `shredId`, `holders` names hosts by the same node ids, and the obligation covers the acknowledgement (BEH-KR-020). M24: `KeyWrapper`, `WrappedKey` and `SubjectKeys` were never declared, a wrap failure had no outcome, and `rewrap`'s repeated listing might never end; the types are declared, a wrapper failure is `KeyStoreUnavailable`, and `rewrap` handles the versions of one listing taken at its start and returns a `RewrapReport` naming the versions it could not re-wrap (BEH-KR-002, BEH-KR-004, BEH-KR-005, BEH-KR-006).<br>**Impact (PROC-03 §3).** (1) Identifiers: none added or withdrawn; BEH-KR-002, 004, 005, 006, 020 and 024 (checks 4 and 12) amended; RSK-KR-001 and RSK-KR-006 controls restated. (2) Risk: bears on RSK-KR-001 (no notice is skipped for an outage; a halted host keeps the subject readable until resumed, stated) and RSK-KR-006 (forged acknowledgements); no score changed. (3) GxP impact: none beyond the keyring's own records. (4) Revalidation: nothing released (implementation absent); REQ-KR-003, REQ-KR-004 and REQ-KR-012 cover the changes. (5) Compatibility: draft API changes — `Keyring.rewrap` returns `RewrapReport`; `SubjectShredAcknowledged` loses `host`; a second notice subscription; no core type changed. |

---

_Next: [Overview](./overview.md)_
