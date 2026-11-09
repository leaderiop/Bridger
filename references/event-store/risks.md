# Risk Assessment — Event Store Companion

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ES-RISK                                              |
> | Revision       | 0.3                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Risk Assessment                                              |
> | Change History | 0.3 (2026-11-09): RSK-ES-003 failure mode and controls cover a stored event and its envelope that disagree on attribution or stream; RSK-ES-005 failure mode and controls cover a field added without a version raise; scores unchanged (CCR-ES-003)<br>0.2 (2026-11-08): RSK-ES-004 controls follow the round-2 review fixes (CCR-ES-002)<br>0.1 (2026-11-08): Initial draft (CCR-ES-001)                 |

---

Hazards that `@bridger/event-store` could introduce into a consumer's system,
scored with the method and anchors of the core risk assessment
([core §2](../core/gxp/03-risk-assessment.md#2-scoring)): Severity,
Probability and Detectability 1–3, risk class = S × P, priority from class
and D. Controls cite this companion's behaviours and invariants. Nothing
here is verified; every control is specified, not implemented
([ADR-BR-036](../core/decisions/036-prospective-specification.md)). The
integration of these risks into the core register is proposed in CCR-ES-001.

<a id="rsk-es-001"></a>
### RSK-ES-001: Lost update on a stream

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | Two writers decide against the same state and both append; one decision is based on state that no longer exists. |
| Initial scoring | S 3 · P 2 · D 3 → class **High** (6) · priority **High** (9) |
| Controls | Mandatory expected version (BEH-ES-003); typed refusal writing nothing (BEH-ES-004); no retry inside a transaction, re-decide on retry (BEH-ES-011, BEH-ES-012); engine constraint (BEH-ES-033); INV-ES-001. |
| Residual scoring | S 3 · P 1 · D 1 → class Medium (3) · priority Low (2) |
| Residual risk and acceptability | An application that uses "any" on a stream with several writers, contrary to the documentation. Acceptable. |
| Owner | Companion + Consumer |

<a id="rsk-es-002"></a>
### RSK-ES-002: A projection skips an event

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | A transaction commits an event at a position below a follower's checkpoint (out-of-order commit), or a failing event is stepped over; the read model is silently incomplete. |
| Initial scoring | S 3 · P 2 · D 3 → class **High** (6) · priority **High** (9) |
| Controls | Position rule (BEH-ES-008) and Postgres obligation (BEH-ES-036); checkpoint in the batch's transaction (BEH-ES-019); halt, never skip (BEH-ES-020); conformance test under concurrent commits (BEH-ES-037); INV-ES-004. |
| Residual scoring | S 3 · P 1 · D 2 → class Medium (3) · priority Medium (4) |
| Residual risk and acceptability | A non-conforming adapter used without running the conformance suite. Acceptable when the consumer runs the suite on its engine. |
| Owner | Companion + Consumer |

<a id="rsk-es-003"></a>
### RSK-ES-003: Stored and published events diverge

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | An event is stored but never published, or published without being stored (dual write); or a stored event and its envelope name different actors, correlations or streams, so that a reviewer matching them by `eventId` reads two accounts. |
| Initial scoring | S 3 · P 3 · D 3 → class **High** (9) · priority **High** (9) |
| Controls | Append only inside `StoreTransaction` (BEH-ES-005); outbox written in the append (BEH-ES-028); one database (BEH-ES-034); INV-ES-002; one resolved context per append and the published event's attribution taken from its envelope, on the event-store stream by default (BEH-ES-007, BEH-ES-028). |
| Residual scoring | S 3 · P 1 · D 2 → class Medium (3) · priority Medium (4) |
| Residual risk and acceptability | An application that writes events outside the package. Acceptable. |
| Owner | Companion |

<a id="rsk-es-004"></a>
### RSK-ES-004: An offline fact is rejected or lost at the receiving host

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | A fact recorded offline is refused by a rule at the authority, or recorded twice after redelivery. |
| Initial scoring | S 3 · P 2 · D 2 → class **High** (6) · priority **High** (6) |
| Controls | `record` without rule or conflict error, retried under a savepoint and by the transaction's owner (BEH-ES-013); violations as events (BEH-ES-014); idempotency by `factId` (BEH-ES-015); receipt in the inbox's transaction, halting subscription options, marker or verbatim recording without keys (BEH-ES-030); INV-ES-006. |
| Residual scoring | S 3 · P 1 · D 2 → class Medium (3) · priority Medium (4) |
| Residual risk and acceptability | An application that models offline input as commands; the pattern is supported, not enforced. Owned by the consumer. |
| Owner | Consumer |

<a id="rsk-es-005"></a>
### RSK-ES-005: History misread through an upcaster or a stale snapshot

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | An upcaster changes the meaning of old events, an upcaster is removed while old events are stored, or a snapshot of an older state shape is used; or a field added without a version raise is dropped by an older host that decodes and records or re-publishes the event. |
| Initial scoring | S 3 · P 2 · D 3 → class **High** (6) · priority **High** (9) |
| Controls | Upcast then decode, stop on unknown versions (BEH-ES-006, BEH-ES-026); every payload change raises the version (BEH-ES-025, durable-bus BEH-DB-001); retention refusal (BEH-ES-027); `stateVersion` and `Snapshots.verify` (BEH-ES-023, BEH-ES-024); projection version change (BEH-ES-022); INV-ES-005. |
| Residual scoring | S 3 · P 1 · D 2 → class Medium (3) · priority Medium (4) |
| Residual risk and acceptability | A semantically wrong but type-correct upcaster. Owned by the consumer's review and tests. |
| Owner | Consumer |

<a id="rsk-es-006"></a>
### RSK-ES-006: The store mistaken for a persistence, audit or tamper-detection guarantee

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | A consumer treats the event store as keeping every acknowledged write, as the core audit trail, or as unalterable. |
| Initial scoring | S 3 · P 2 · D 3 → class **High** (6) · priority **High** (9) |
| Controls | Honest-claims rule (README); adapter obligations and conformance scope (BEH-ES-035–037); chaining only through the audit-chain companion with its limits (BEH-ES-031); stored events are not core audit records (overview). |
| Residual scoring | S 3 · P 1 · D 2 → class Medium (3) · priority Medium (4) |
| Residual risk and acceptability | Misreading despite the documentation. Acceptable. |
| Owner | Companion + Consumer |

---

_Previous: [Invariants](./invariants.md)_ · _Next: [Traceability](./traceability.md)_
