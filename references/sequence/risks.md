# Risk Assessment — Sequence Companion

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-SQ-RISK                                              |
> | Revision       | 0.3                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Risk Assessment                                              |
> | Change History | 0.3 (2026-11-09): RSK-SQ-001 and RSK-SQ-003 cover a whole-store re-bootstrap on a running host (handles of the old origin refused, old series read from the replaced store and superseded); scores unchanged (CCR-SQ-003)<br>0.2 (2026-11-08): RSK-SQ-001 and RSK-SQ-003 controls follow the supersession stream and the inbox conflict (CCR-SQ-002)<br>0.1 (2026-11-08): Initial draft (CCR-SQ-001)                 |

---

Hazards that `@bridger/sequence` could introduce into a consumer's system,
scored with the method and anchors of the core risk assessment
([core §2](../core/gxp/03-risk-assessment.md#2-scoring)). Every control is
specified, not implemented
([ADR-BR-036](../core/decisions/036-prospective-specification.md)).

<a id="rsk-sq-001"></a>
### RSK-SQ-001: One number issued twice under one series id

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | Two hosts write one series, or a host restored from backup continues its old series and reissues numbers, or a handle opened before a whole-store re-bootstrap keeps appending to its old series under the new origin. |
| Initial scoring | S 3 · P 2 · D 3 → class **High** (6) · priority **High** (9) |
| Controls | One owning origin, checked against the bus's current origin at every call (BEH-SQ-002); expected version per `next()` (BEH-SQ-004); `SupersessionPending` until the step has committed after an origin change (BEH-SQ-009); incarnation in the identity and a supersession recorded in the new incarnation's stream (BEH-SQ-001, BEH-SQ-009); the receiving inbox's `EnvelopeConflict` for a missed bump (BEH-DB-004, BEH-SQ-013); INV-SQ-001, INV-SQ-004. |
| Residual scoring | S 3 · P 1 · D 2 → class Medium (3) · priority Medium (4) |
| Residual risk and acceptability | A restore whose incarnation was not raised, detected only by an inbox that still holds the first event ids; past its retention the reissued envelopes are absorbed as repeats and the reissued numbers stay on the restored host's documents only. Operator obligation (BEH-DB-004). |
| Owner | Consumer + Companion |

<a id="rsk-sq-002"></a>
### RSK-SQ-002: A number handed out before commit, then rolled back

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | The application prints a number, the transaction rolls back, and the next record takes the same number. |
| Initial scoring | S 3 · P 2 · D 3 → class **High** (6) · priority **High** (9) |
| Controls | Documented obligation and test fixture (BEH-SQ-006, BEH-SQ-019). |
| Residual scoring | S 3 · P 1 · D 3 → class Medium (3) · priority High (6) |
| Residual risk and acceptability | Application code that ignores the rule; not detectable by the package. Owned by the consumer. |
| Owner | Consumer |

<a id="rsk-sq-003"></a>
### RSK-SQ-003: Numbers lost with a restored host go unnoticed

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | Numbers issued after the last backup, never delivered, vanish with the host. |
| Initial scoring | S 2 · P 2 · D 3 → class **Medium** (4) · priority **High** (6) |
| Controls | Stated limit and `lastKnownOnly` supersession, written for every open series at the new incarnation's start and at every origin change, never in the old series; at a whole-store re-bootstrap the series are read from the replaced store, so a snapshot without them hides none (BEH-SQ-009, BEH-SQ-010); `receivedBeyondClosure` and the registry (BEH-SQ-013, BEH-SQ-014). |
| Residual scoring | S 2 · P 2 · D 2 → class Medium (4) · priority Medium (4) |
| Residual risk and acceptability | Acceptable with frequent delivery and backups sized by the consumer; numbers are never reused, so the records remain unique. A process that stops between the re-bootstrap read and the supersession leaves those series without a closure record (stated, BEH-SQ-009). |
| Owner | Consumer |

<a id="rsk-sq-004"></a>
### RSK-SQ-004: Verification or chaining read as proof of completeness or integrity

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | A clean report is presented as proof that no number is missing, or a chained series as unalterable. |
| Initial scoring | S 3 · P 2 · D 3 → class **High** (6) · priority **High** (9) |
| Controls | No overall verdict, `receivedThrough` as a lower bound (BEH-SQ-012, BEH-SQ-013); chaining only through the audit-chain companion and its limits (BEH-SQ-016); honest-claims rule (README); INV-SQ-005. |
| Residual scoring | S 3 · P 1 · D 2 → class Medium (3) · priority Medium (4) |
| Residual risk and acceptability | Misreading despite the documentation. Acceptable. |
| Owner | Companion + Consumer |

---

_Previous: [Invariants](./invariants.md)_ · _Next: [Traceability](./traceability.md)_
