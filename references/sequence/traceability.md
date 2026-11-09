# Traceability

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-SQ-TRACE                                             |
> | Revision       | 0.3                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Traceability Matrix (companion)                              |
> | Change History | 0.3 (2026-11-09): REQ-SQ-011 and REQ-SQ-012; BEH-SQ-002, 003, 008, 009, 010, 019 and 020 rows extended (CCR-SQ-003)<br>0.2 (2026-11-08): §1 Core URS column: URS-BR-056–059 cited where the behaviours now cite them (core CCR-BR-027) (CCR-SQ-001)<br>0.1 (2026-11-08): Initial draft (CCR-SQ-001)                 |

---

The chain is core URS → BEH-SQ → INV-SQ → ADR-SQ → REQ-SQ → RSK-SQ / core
RSK-BR → test. Every test is *Planned*; no row is evidence
([ADR-BR-036](../core/decisions/036-prospective-specification.md)).

## §1 Behaviour traceability

| Behaviour | Invariant | Decision | Core seam | Core URS | Acceptance |
| --------- | --------- | -------- | --------- | -------- | ---------- |
| BEH-SQ-001 | — | ADR-SQ-002 | — | URS-BR-043, URS-BR-057 | REQ-SQ-001 |
| BEH-SQ-002 | INV-SQ-004 | ADR-SQ-001 | — | URS-BR-043 | REQ-SQ-001, REQ-SQ-011 |
| BEH-SQ-003 | — | ADR-SQ-002 | — | — | REQ-SQ-002, REQ-SQ-012 |
| BEH-SQ-004 | INV-SQ-001 | ADR-SQ-002 | — | URS-BR-043, URS-BR-057 | REQ-SQ-003 |
| BEH-SQ-005 | INV-SQ-001, INV-SQ-002 | ADR-SQ-002 | — | URS-BR-057 | REQ-SQ-004 |
| BEH-SQ-006 | — | — | — | — | REQ-SQ-005 |
| BEH-SQ-007 | INV-SQ-003 | ADR-SQ-003 | — | — | REQ-SQ-006 |
| BEH-SQ-008 | — | — | BEH-BR-187, BEH-BR-207, BEH-BR-225, BEH-BR-273 | URS-BR-054, URS-BR-034 | REQ-SQ-002, REQ-SQ-012 |
| BEH-SQ-009 | INV-SQ-003, INV-SQ-004 | ADR-SQ-003 | — | — | REQ-SQ-007, REQ-SQ-011 |
| BEH-SQ-010 | — | ADR-SQ-003 | — | URS-BR-026 | REQ-SQ-007, REQ-SQ-011 |
| BEH-SQ-011 | — | ADR-SQ-002 | — | URS-BR-043 | REQ-SQ-003 |
| BEH-SQ-012 | INV-SQ-005 | — | BEH-BR-215 | URS-BR-022 | REQ-SQ-008 |
| BEH-SQ-013 | INV-SQ-005 | — | — | URS-BR-022 | REQ-SQ-008 |
| BEH-SQ-014 | — | ADR-SQ-003 | — | — | REQ-SQ-008 |
| BEH-SQ-015 | — | ADR-SQ-001 | — | — | REQ-SQ-008 |
| BEH-SQ-016 | — | — | — | URS-BR-022 | REQ-SQ-009 |
| BEH-SQ-017 | — | ADR-SQ-004 | — | — | REQ-SQ-010 |
| BEH-SQ-018 | — | ADR-SQ-002 | — | — | REQ-SQ-010 |
| BEH-SQ-019 | — | — | BEH-BR-209, BEH-BR-210 | URS-BR-027 | REQ-SQ-005, REQ-SQ-011 |
| BEH-SQ-020 | — | — | — | URS-BR-025 | REQ-SQ-001–012 |

## §2 Acceptance scenarios

Each `REQ-SQ` is the planned scenario for the numbered check of
[BEH-SQ-020](./behaviors/03-formats-testing-and-acceptance.md#beh-sq-020-required-acceptance-checks).
Test files are *Planned* under `packages/sequence/test/` *(Planned)*.

| REQ | Check | Summary | Behaviours |
| --- | ----- | ------- | ---------- |
| <a id="req-sq-001"></a>REQ-SQ-001 | 1 | Identity and ownership | BEH-SQ-001, BEH-SQ-002 |
| <a id="req-sq-002"></a>REQ-SQ-002 | 2 | Open, create once, resume | BEH-SQ-003, BEH-SQ-008 |
| <a id="req-sq-003"></a>REQ-SQ-003 | 3 | Reservation in the caller's transaction | BEH-SQ-004, BEH-SQ-011 |
| <a id="req-sq-004"></a>REQ-SQ-004 | 4 | Contiguity under commits and rollbacks | BEH-SQ-005 |
| <a id="req-sq-005"></a>REQ-SQ-005 | 5 | Hand-out before commit detected by the fixture | BEH-SQ-006, BEH-SQ-019 |
| <a id="req-sq-006"></a>REQ-SQ-006 | 6 | Close | BEH-SQ-007 |
| <a id="req-sq-007"></a>REQ-SQ-007 | 7 | Restore with and without a new incarnation | BEH-SQ-009, BEH-SQ-010, BEH-SQ-013 |
| <a id="req-sq-008"></a>REQ-SQ-008 | 8 | Verification categories, purity, registry, retirement | BEH-SQ-012–015 |
| <a id="req-sq-009"></a>REQ-SQ-009 | 9 | Chaining by stream version | BEH-SQ-016 |
| <a id="req-sq-010"></a>REQ-SQ-010 | 10 | Integers only; no storage of its own | BEH-SQ-017, BEH-SQ-018 |
| <a id="req-sq-011"></a>REQ-SQ-011 | 11 | Re-bootstrap on a running host: old handles refused, old series superseded from the replaced store | BEH-SQ-002, BEH-SQ-009, BEH-SQ-010 |
| <a id="req-sq-012"></a>REQ-SQ-012 | 12 | Grants on the `Sequence` members decide calls through a handle | BEH-SQ-003, BEH-SQ-008 |

## §3 Risk notes

Package risks are in [risks.md](./risks.md) (RSK-SQ-001–004).

| Core risk | Relationship |
| --------- | ------------ |
| [RSK-BR-018](../core/gxp/03-risk-assessment.md#rsk-br-018) Over-claiming qualification evidence | Controlled by the report without verdict and the honest-claims rule (BEH-SQ-012). |
| [RSK-BR-021](../core/gxp/03-risk-assessment.md#rsk-br-021) Wall-clock step reorders records | Not applicable to numbers: order is the stream version, never the clock. |

One core risk (a number issued twice under one series id) is proposed for the
core register in the integration notes.

---

_Previous: [Risks](./risks.md)_ · _Next: [README](./README.md)_
