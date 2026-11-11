# Traceability

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-KR-TRACE                                             |
> | Revision       | 0.5                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Traceability Matrix (companion)                              |
> | Change History | 0.5 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-06) — REQ-KR-003 cites BEH-KR-023, as check 3 now does (PL14) (CCR-KR-008)<br>0.4 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-05) — REQ-KR-010 cites BEH-KR-008 and REQ-KR-011 BEH-KR-004, as checks 10 and 11 do (PL12); BEH-KR-020 traces to INV-KR-002 and REQ-KR-011 (B5, B6) (CCR-KR-007)<br>0.3 (2026-11-09): BEH-KR-017 and BEH-KR-018 trace to core BEH-BR-185, BEH-BR-187 and BEH-BR-189; REQ-KR-010 and REQ-KR-012 summaries name the shred's attribution; RSK-KR-006 listed (M-01) (CCR-KR-003)<br>0.2 (2026-11-08): §1 Core URS column: URS-BR-056–059 cited where the behaviours now cite them (core CCR-BR-027) (CCR-KR-001)<br>0.1 (2026-11-08): Initial draft (CCR-KR-001)                 |

---

The chain is core URS → BEH-KR → INV-KR → ADR-KR → REQ-KR → RSK-KR / core
RSK-BR → test. Every test is *Planned*; no row is evidence
([ADR-BR-036](../core/decisions/036-prospective-specification.md)).

## §1 Behaviour traceability

| Behaviour | Invariant | Decision | Core seam | Core URS | Acceptance |
| --------- | --------- | -------- | --------- | -------- | ---------- |
| BEH-KR-001 | — | ADR-KR-005 | — | URS-BR-026 | REQ-KR-001 |
| BEH-KR-002 | INV-KR-003 | ADR-KR-003 | — | URS-BR-058 | REQ-KR-001 |
| BEH-KR-003 | INV-KR-002 | — | — | — | REQ-KR-002 |
| BEH-KR-004 | — | ADR-KR-004 | — | URS-BR-026 | REQ-KR-003, REQ-KR-011 |
| BEH-KR-005 | — | ADR-KR-004 | — | URS-BR-026 | REQ-KR-003 |
| BEH-KR-006 | — | ADR-KR-004 | — | — | REQ-KR-004 |
| BEH-KR-007 | — | ADR-KR-004 | — | URS-BR-026 | REQ-KR-012 |
| BEH-KR-008 | INV-KR-001 | — | BEH-BR-196, BEH-BR-273, BEH-BR-276, BEH-BR-281, BEH-BR-293 | URS-BR-034, URS-BR-058 | REQ-KR-005, REQ-KR-010 |
| BEH-KR-009 | — | ADR-KR-002 | — | URS-BR-058, URS-BR-059 | REQ-KR-006 |
| BEH-KR-010 | INV-KR-001 | ADR-KR-002 | — | — | REQ-KR-006 |
| BEH-KR-011 | — | ADR-KR-002 | — | — | REQ-KR-002 |
| BEH-KR-012 | INV-KR-002 | ADR-KR-003 | — | URS-BR-058, URS-BR-059 | REQ-KR-007 |
| BEH-KR-013 | — | ADR-KR-005 | — | URS-BR-026 | REQ-KR-006 |
| BEH-KR-014 | INV-KR-004 | ADR-KR-001 | — | URS-BR-022 | REQ-KR-008 |
| BEH-KR-015 | — | — | BEH-BR-211 | URS-BR-027 | REQ-KR-009 |
| BEH-KR-016 | — | ADR-KR-005 | — | URS-BR-026 | REQ-KR-006 |
| BEH-KR-017 | INV-KR-002, INV-KR-004 | ADR-KR-001 | BEH-BR-185, BEH-BR-187, BEH-BR-189 | URS-BR-054, URS-BR-058 | REQ-KR-010 |
| BEH-KR-018 | INV-KR-003 | ADR-KR-003 | BEH-BR-185, BEH-BR-207 | URS-BR-058 | REQ-KR-010 |
| BEH-KR-019 | INV-KR-005 | — | — | — | REQ-KR-011 |
| BEH-KR-020 | INV-KR-002 | — | — | URS-BR-043 | REQ-KR-011, REQ-KR-012 |
| BEH-KR-021 | INV-KR-005 | — | — | — | REQ-KR-011 |
| BEH-KR-022 | — | ADR-KR-004 | — | URS-BR-026 | REQ-KR-012 |
| BEH-KR-023 | — | — | — | URS-BR-025 | REQ-KR-003, REQ-KR-012 |
| BEH-KR-024 | — | — | — | URS-BR-025 | REQ-KR-001–012 |

## §2 Acceptance scenarios

Each `REQ-KR` is the planned scenario for the numbered check of
[BEH-KR-024](./behaviors/03-shred-and-acceptance.md#beh-kr-024-required-acceptance-checks).
Test files are *Planned* under `packages/keyring/test/` *(Planned)*.

| REQ | Check | Summary | Behaviours |
| --- | ----- | ------- | ---------- |
| <a id="req-kr-001"></a>REQ-KR-001 | 1 | Subjects and handles | BEH-KR-001, BEH-KR-002 |
| <a id="req-kr-002"></a>REQ-KR-002 | 2 | Authenticated encryption and data | BEH-KR-003, BEH-KR-011 |
| <a id="req-kr-003"></a>REQ-KR-003 | 3 | KeyStore and KeyWrapper obligations, the transaction and its `onEnd`, `memoryKeyStore` | BEH-KR-004, BEH-KR-005, BEH-KR-023 |
| <a id="req-kr-004"></a>REQ-KR-004 | 4 | Rotation and rewrap | BEH-KR-006 |
| <a id="req-kr-005"></a>REQ-KR-005 | 5 | Grants and call log without plaintext | BEH-KR-008 |
| <a id="req-kr-006"></a>REQ-KR-006 | 6 | Field codec, no plaintext in sinks | BEH-KR-009, BEH-KR-010, BEH-KR-013, BEH-KR-016 |
| <a id="req-kr-007"></a>REQ-KR-007 | 7 | Reads after a shred | BEH-KR-012 |
| <a id="req-kr-008"></a>REQ-KR-008 | 8 | Chains verify before and after a shred | BEH-KR-014 |
| <a id="req-kr-009"></a>REQ-KR-009 | 9 | Determinism with fixed nonces | BEH-KR-015 |
| <a id="req-kr-010"></a>REQ-KR-010 | 10 | Shred order, attribution, retry, idempotence | BEH-KR-008, BEH-KR-017, BEH-KR-018 |
| <a id="req-kr-011"></a>REQ-KR-011 | 11 | Callbacks and status | BEH-KR-004, BEH-KR-019, BEH-KR-020, BEH-KR-021 |
| <a id="req-kr-012"></a>REQ-KR-012 | 12 | Notices with the origin's attribution, restore, store swap, limits, wording | BEH-KR-007, BEH-KR-020, BEH-KR-022, BEH-KR-023 |

## §3 Risk notes

Package risks are in [risks.md](./risks.md) (RSK-KR-001–006).

| Core risk | Relationship |
| --------- | ------------ |
| [RSK-BR-008](../core/gxp/03-risk-assessment.md#rsk-br-008) Secret leaks into logs or audit | Related: key material never leaves the API and the call log carries no plaintext (BEH-KR-002, BEH-KR-008); core's audit `reason` and annotations remain the application's discipline. |
| [RSK-BR-018](../core/gxp/03-risk-assessment.md#rsk-br-018) Over-claiming qualification evidence | Controlled by `notStated` and the wording rule (BEH-KR-022). |

One core risk (plaintext personal data remains after a shred, or a shred is
presented as erasure) is proposed for the core register in the integration
notes.

---

_Previous: [Risks](./risks.md)_ · _Next: [README](./README.md)_
