# Risk Assessment — Keyring Companion

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-KR-RISK                                              |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Risk Assessment                                              |
> | Change History | 0.1 (2026-11-08): Initial draft (CCR-KR-001)                 |

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
| Controls | Redaction callbacks with their own cursor (BEH-KR-019); notices to other hosts (BEH-KR-020); status pending until every acknowledgement (BEH-KR-021); backup obligations (BEH-KR-007); `assertNoPlaintext` (BEH-KR-023); INV-KR-001, INV-KR-005. |
| Residual scoring | S 3 · P 2 · D 2 → class High (6) · priority High (6) |
| Residual risk and acceptability | Plaintext copies outside registered callbacks and unexpired backups. Owned by the consumer; stated in every receipt (BEH-KR-022). |
| Owner | Consumer + Companion |

<a id="rsk-kr-002"></a>
### RSK-KR-002: Keys lost before any shred was intended

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | The `KeyStore` or the wrapping key is lost, and every encrypted field becomes unreadable — a record loss. |
| Initial scoring | S 3 · P 2 · D 1 → class **High** (6) · priority Medium (3) |
| Controls | Backup obligations as availability control (BEH-KR-007); wrapper and store obligations (BEH-KR-004, BEH-KR-005); reads yield `Shredded`-like markers rather than failing, so loss is visible (BEH-KR-012). |
| Residual scoring | S 3 · P 1 · D 1 → class Medium (3) · priority Low (2) |
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

---

_Previous: [Invariants](./invariants.md)_ · _Next: [Traceability](./traceability.md)_
