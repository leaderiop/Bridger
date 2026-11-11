# Risk Assessment — Keyring Companion

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-KR-RISK                                              |
> | Revision       | 0.5                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Risk Assessment                                              |
> | Change History | 0.5 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-06) — RSK-KR-001: controls add the fence on keyring writes and the refusal until the store-swap re-apply commits (H4, K1); the residual names the store-swap crash window of INV-KR-002 (K2); scores unchanged (CCR-KR-008)<br>0.4 (2026-11-10): RSK-KR-001: a notice that meets a key-store outage halts the receiving subscription and is never parked (BEH-KR-020); RSK-KR-006: acknowledgements are covered by the `AccessPolicy` obligation and counted by the envelope's origin (BEH-KR-020) (CCR-KR-005)<br>0.3 (2026-11-10): RSK-KR-002 control restated as BEH-KR-012 specifies (a lost key fails the decode with `PayloadUnreadable`, an unreachable store with `PayloadDecodeFailed`) and re-scored, scores unchanged; RSK-KR-006 covers a received notice that no attributed shred made (P11, P12) (CCR-KR-004)<br>0.2 (2026-11-09): RSK-KR-006 added: a shred that leaves no attributable, reasoned record (M-01) (CCR-KR-003)<br>0.1 (2026-11-08): Initial draft (CCR-KR-001)                 |

---

Hazards that `@bridger/keyring` could introduce into a consumer's system,
scored with the method and anchors of the core risk assessment
([core §2](../core/gxp/03-risk-assessment.md#2-scoring)). Every control is
specified, not implemented
([ADR-BR-036](../core/decisions/036-prospective-specification.md)).

<a id="rsk-kr-001"></a>
### RSK-KR-001: Plaintext remains after a shred

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | A projection, cache, log, export, backup or another host keeps the plaintext or the key after the subject was shredded. |
| Initial scoring | S 3 · P 3 · D 3 → class **High** (9) · priority **High** (9) |
| Controls | Redaction callbacks with their own cursor (BEH-KR-019); notices to other hosts, halted rather than parked when the receiving `KeyStore` cannot be read, so that none is skipped (BEH-KR-020); on a `KeyStore` sharing the outbox's database, keyring writes take the durable-bus fence, and a whole-store swap's participant re-applies tombstones with `decrypt` and the codec refused until it commits (BEH-KR-017, BEH-KR-020); status pending until every acknowledgement (BEH-KR-021); backup obligations (BEH-KR-007); `assertNoPlaintext` (BEH-KR-023); INV-KR-001, INV-KR-005. |
| Residual scoring | S 3 · P 2 · D 2 → class High (6) · priority High (6) |
| Residual risk and acceptability | Plaintext copies outside registered callbacks and unexpired backups; on a receiving host whose notice subscription is halted, the subject stays readable until it resumes; the store-swap crash window of INV-KR-002: a process that stops between a whole-store swap and the keyring's re-apply restarts without the tombstones the replaced store held, and those subjects decrypt again until the restored-host rule re-applies them (BEH-KR-007, BEH-KR-020). Owned by the consumer; stated in every receipt (BEH-KR-022). |
| Owner | Consumer + Companion |

<a id="rsk-kr-002"></a>
### RSK-KR-002: Keys lost before any shred was intended

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | The `KeyStore` or the wrapping key is lost, and every encrypted field becomes unreadable — a record loss. |
| Initial scoring | S 3 · P 2 · D 1 → class **High** (6) · priority Medium (3) |
| Controls | Backup obligations as availability control (BEH-KR-007); wrapper and store obligations (BEH-KR-004, BEH-KR-005); a field whose key is absent without a tombstone is never read as shredded: the decode fails with `PayloadUnreadable`, and with `PayloadDecodeFailed` while the store cannot be read, so the reader halts, parks or ends the read and the loss surfaces as a typed error (BEH-KR-012). |
| Residual scoring | S 3 · P 1 · D 1 → class Medium (3) · priority Low (2). Re-scored under CCR-KR-004 against the restated control: D 1 rests on the typed decode failure, not on markers; scores unchanged. |
| Residual risk and acceptability | Simultaneous loss of store and backups. Owned by the consumer. |
| Owner | Consumer |

<a id="rsk-kr-003"></a>
### RSK-KR-003: A shred over-claimed as erasure

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | A shred is reported to a requester or reviewer as erasure, irreversible or legally sufficient. |
| Initial scoring | S 3 · P 2 · D 3 → class **High** (6) · priority **High** (9) |
| Controls | `notStated` in every receipt and the wording rule (BEH-KR-022); honest-claims rule (README). |
| Residual scoring | S 3 · P 1 · D 2 → class Medium (3) · priority Medium (4) |
| Residual risk and acceptability | Misstatement by the consumer despite the receipt. Acceptable. |
| Owner | Companion + Consumer |

<a id="rsk-kr-004"></a>
### RSK-KR-004: Personal data left in unencrypted metadata

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | A subject id, stream id, actor, annotation or unselected field carries personal data, which stays readable — and chained — after a shred. |
| Initial scoring | S 3 · P 2 · D 3 → class **High** (6) · priority **High** (9) |
| Controls | Subject grammar and guidance (BEH-KR-001); list of what is not encrypted (BEH-KR-016); no plaintext in core flows (BEH-KR-008). |
| Residual scoring | S 3 · P 2 · D 2 → class High (6) · priority High (6) |
| Residual risk and acceptability | Depends on the application's data design, which the package cannot inspect. Owned by the consumer. |
| Owner | Consumer |

<a id="rsk-kr-005"></a>
### RSK-KR-005: A copied key makes a shred ineffective

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | A key, or the wrapping key with a copy of the database, was copied before the shred and still decrypts. |
| Initial scoring | S 3 · P 2 · D 3 → class **High** (6) · priority **High** (9) |
| Controls | No public key material (BEH-KR-002); wrapped storage with the wrapper key outside the database recommended (BEH-KR-004, BEH-KR-005); grants on `decrypt` (BEH-KR-008). |
| Residual scoring | S 3 · P 1 · D 3 → class Medium (3) · priority High (6) |
| Residual risk and acceptability | Undetectable by design; bounded by the consumer's key custody. Stated in every receipt. |
| Owner | Consumer |

<a id="rsk-kr-006"></a>
### RSK-KR-006: A shred leaves no attributable, reasoned record

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | A shred makes fields of retained records unreadable, and nothing on the shredding host or on a receiving host says who asked for it, on whose behalf, when, why or from which host; or it was made under a reserved or anonymous actor; or a receiving host applies a notice that no attributed, granted shred produced. |
| Initial scoring | S 3 · P 2 · D 3 → class **High** (6) · priority **High** (9) |
| Controls | A shred by a reserved or blank actor is refused with `ShredUnattributed` (BEH-KR-017); the tombstone keeps actor, `onBehalfOf`, correlation, reason and origin, written once with step 1 and never changed by the `KeyStore` (BEH-KR-004, BEH-KR-018); the notice carries reason and time under the shred's context, and receiving hosts keep the origin's attribution as a claim and do not apply a notice under a reserved or blank actor (BEH-KR-020); the consumer's `AccessPolicy` keeps publishing the notice and its acknowledgement to the keyring plugin and receiving them to accepted origins, and an acknowledgement counts for the node of its envelope's origin, never a payload field (BEH-KR-020); the receipt exposes it (BEH-KR-017). |
| Residual scoring | S 3 · P 1 · D 2 → class Medium (3) · priority High (6) |
| Residual risk and acceptability | The tombstone lives in the consumer's `KeyStore`, is not a core audit record and is not protected against change or deletion by the store's administrators; a received actor is the origin's claim, and the `AccessPolicy` rules are the consumer's to configure. Owned by the consumer, who writes shreds to its own audit trail where it must. |
| Owner | Companion + Consumer |

---

_Previous: [Invariants](./invariants.md)_ · _Next: [Traceability](./traceability.md)_
