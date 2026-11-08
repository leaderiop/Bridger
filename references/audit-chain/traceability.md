# Traceability

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-AC-TRACE                                             |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Traceability Matrix (companion)                              |
> | Change History | 0.2 (2026-11-08): Rows and scenario summaries for the review resolutions; RSK-BR-020 and RSK-BR-045 notes (CCR-AC-002)<br>0.1 (2026-11-08): Initial draft (CCR-AC-001)                 |

---

The chain for this package is core URS → BEH-AC → INV-AC → ADR-AC → REQ-AC →
core RSK-BR → test. Every test is *Planned*; no row is evidence
([ADR-BR-036](../core/decisions/036-prospective-specification.md)).

## §1 Behaviour traceability

| Behaviour | Invariant | Decision | Core seam | Core URS | Acceptance |
| --------- | --------- | -------- | --------- | -------- | ---------- |
| BEH-AC-001 | INV-AC-002 | ADR-AC-001 | BEH-BR-193, BEH-BR-202, BEH-BR-205 | URS-BR-022, URS-BR-026 | REQ-AC-001 |
| BEH-AC-002 | INV-AC-003 | ADR-AC-001 | BEH-BR-195, BEH-BR-208 | URS-BR-022 | REQ-AC-001 |
| BEH-AC-003 | INV-AC-001 | ADR-AC-001 | — | URS-BR-022 | REQ-AC-002 |
| BEH-AC-004 | INV-AC-001, INV-AC-002 | ADR-AC-001 | BEH-BR-202 | URS-BR-022 | REQ-AC-003 |
| BEH-AC-005 | INV-AC-002 | ADR-AC-001 | BEH-BR-202, BEH-BR-212 | URS-BR-022 | REQ-AC-004 |
| BEH-AC-006 | INV-AC-003 | ADR-AC-001 | BEH-BR-193 | URS-BR-022 | REQ-AC-005 |
| BEH-AC-007 | INV-AC-001 | ADR-AC-002 | BEH-BR-212 | URS-BR-022 | REQ-AC-006 |
| BEH-AC-008 | — | ADR-AC-002, ADR-AC-003 | BEH-BR-194, BEH-BR-202, BEH-BR-205 | URS-BR-023, URS-BR-026 | REQ-AC-001 |
| BEH-AC-009 | INV-AC-005 | ADR-AC-002 | — | URS-BR-026 | REQ-AC-008 |
| BEH-AC-010 | INV-AC-004 | ADR-AC-002 | — | URS-BR-022 | REQ-AC-007 |
| BEH-AC-011 | INV-AC-005 | ADR-AC-003 | BEH-BR-204 | URS-BR-022 | REQ-AC-008 |
| BEH-AC-012 | — | ADR-AC-003 | — | URS-BR-026 | REQ-AC-009 |
| BEH-AC-013 | INV-AC-005 | ADR-AC-003 | BEH-BR-202, BEH-BR-313, BEH-BR-315, BEH-BR-321 | URS-BR-023 | REQ-AC-008 |
| BEH-AC-014 | — | ADR-AC-003 | — | URS-BR-022 | REQ-AC-007 |
| BEH-AC-015 | — | ADR-AC-003 | BEH-BR-208 | URS-BR-022 | REQ-AC-009 |
| BEH-AC-016 | — | ADR-AC-002 | — | URS-BR-026 | REQ-AC-011 |
| BEH-AC-017 | INV-AC-004 | ADR-AC-002 | BEH-BR-215 | URS-BR-022 | REQ-AC-010 |
| BEH-AC-018 | INV-AC-004 | — | BEH-BR-215 | URS-BR-022 | REQ-AC-010 |
| BEH-AC-019 | INV-AC-004 | ADR-AC-002 | — | URS-BR-022 | REQ-AC-011 |
| BEH-AC-020 | — | ADR-AC-002 | — | URS-BR-026 | REQ-AC-012 |
| BEH-AC-021 | — | ADR-AC-002 | — | URS-BR-022 | REQ-AC-012 |
| BEH-AC-022 | — | ADR-AC-002, ADR-AC-004 | — | URS-BR-026 | REQ-AC-012 |
| BEH-AC-023 | — | ADR-AC-002 | — | URS-BR-026 | REQ-AC-012 |
| BEH-AC-024 | — | — | — | URS-BR-022, URS-BR-025 | REQ-AC-001–012 |

Behaviours are in [01](./behaviors/01-hash-chain-sink.md),
[02](./behaviors/02-anchoring.md) and [03](./behaviors/03-verification.md);
invariants in [invariants.md](./invariants.md); core seams in
[23 — Audit Sink and Record](../core/behaviors/23-audit-sink-and-record.md)
and [24 — Time, Identifiers and Sequence](../core/behaviors/24-time-ids-and-sequence.md).

## §2 Acceptance scenarios

Each `REQ-AC` is the planned acceptance scenario for the numbered check of
[BEH-AC-024](./behaviors/03-verification.md#beh-ac-024-required-acceptance-checks).
Test files are *Planned* under `packages/audit-chain/test/` *(Planned)*.

| REQ | Check | Summary | Behaviours |
| --- | ----- | ------- | ---------- |
| <a id="req-ac-001"></a>REQ-AC-001 | 1 | Wrapping, record unchanged, only inner-store failures fail a write | BEH-AC-001, BEH-AC-002, BEH-AC-008 |
| <a id="req-ac-002"></a>REQ-AC-002 | 2 | Canonical form recomputed independently; escaped encoding for non-I-JSON records | BEH-AC-003 |
| <a id="req-ac-003"></a>REQ-AC-003 | 3 | Retry carries the identical link; differing retry marked | BEH-AC-004 |
| <a id="req-ac-004"></a>REQ-AC-004 | 4 | Host and order violations appended with a "chain-order" marker, never refused | BEH-AC-005 |
| <a id="req-ac-005"></a>REQ-AC-005 | 5 | `ChainSink.split` order and crash window | BEH-AC-006 |
| <a id="req-ac-006"></a>REQ-AC-006 | 6 | Keyed hasher and `continuesFrom` | BEH-AC-007 |
| <a id="req-ac-007"></a>REQ-AC-007 | 7 | Windows, Merkle root, ordered retries | BEH-AC-010, BEH-AC-014 |
| <a id="req-ac-008"></a>REQ-AC-008 | 8 | Off the write path; bounded memory without failed writes; `ChainGate` refusals | BEH-AC-009, BEH-AC-011, BEH-AC-013 |
| <a id="req-ac-009"></a>REQ-AC-009 | 9 | Status, log levels, final window on close | BEH-AC-012, BEH-AC-015 |
| <a id="req-ac-010"></a>REQ-AC-010 | 10 | `verifyChain` purity; sequence from core | BEH-AC-017, BEH-AC-018 |
| <a id="req-ac-011"></a>REQ-AC-011 | 11 | Detection matrix executed, including what is not detected; expected heads | BEH-AC-016, BEH-AC-019 |
| <a id="req-ac-012"></a>REQ-AC-012 | 12 | Receipts confirmed, inclusion proofs, wording, no shipped anchor | BEH-AC-020, BEH-AC-021, BEH-AC-022, BEH-AC-023 |

## §3 Risk notes

This package carries no risk series of its own; it is assessed against the
core register ([risk assessment](../core/gxp/03-risk-assessment.md)).

| Core risk | Relationship |
| --------- | ------------ |
| [RSK-BR-006](../core/gxp/03-risk-assessment.md#rsk-br-006) Undetected audit gap | Reduces, for the consumer's store: alteration, insertion, removal or reordering of chained records up to the last confirmed anchor become detectable (BEH-AC-019). Does not change core's own loss paths (overflow, close, process death), which are never chained. |
| [RSK-BR-018](../core/gxp/03-risk-assessment.md#rsk-br-018) Over-claiming qualification evidence | Controlled by the wording rules (BEH-AC-008, BEH-AC-016, BEH-AC-022), the absence of an overall pass/fail value, and the executed detection matrix (REQ-AC-011). |
| [RSK-BR-020](../core/gxp/03-risk-assessment.md#rsk-br-020) Slow audit sink blocks the host | Introduced partly: hashing and the inner store add write-path latency, and a failing inner store holds later records behind it as for any sink (core BEH-BR-202). Not increased by anchoring or by the sink's own checks: no anchoring condition, order violation, retry mismatch, unsupported schema or non-I-JSON string fails a write (BEH-AC-005, BEH-AC-008, BEH-AC-011); fail-closed anchoring refuses operator calls at the gate instead (BEH-AC-013). |
| [RSK-BR-045](../core/gxp/03-risk-assessment.md#rsk-br-045) Chain or anchor mistaken for tamper-proofing | Controls: BEH-AC-016, BEH-AC-020, BEH-AC-022, BEH-AC-023, executed matrix REQ-AC-011. The control-introduced risk the core entry names for failed-write fail-closed is avoided: fail-closed is the `ChainGate` piece (BEH-AC-013). Not detected by design, and stated: deletion of the newest anchored windows with their receipts unless an expected head is supplied (BEH-AC-019), and anything decided by a party controlling the process before the sink (BEH-AC-016). |

The hazard first proposed by this package (*chain or anchor mistaken for
tamper-proofing, or an anchor store that is not independent of the trail
store*) is registered in core as RSK-BR-045. Residual owner: Consumer
(independence of the anchor, an independent source of expected heads, review
procedure).

---

_Previous: [Invariants](./invariants.md)_ · _Next: [README](./README.md)_
