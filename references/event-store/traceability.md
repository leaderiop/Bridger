# Traceability

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ES-TRACE                                             |
> | Revision       | 0.3                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Traceability Matrix (companion)                              |
> | Change History | 0.3 (2026-11-09): REQ-ES-017 (grants on the `EventStore` members); BEH-ES-007 cites BEH-BR-292 and REQ-ES-013; BEH-ES-028 and BEH-ES-030 add REQ-ES-006 and REQ-ES-013; BEH-ES-034 adds REQ-ES-008; BEH-ES-038 cites URS-BR-034 and REQ-ES-017 (CCR-ES-003)<br>0.2 (2026-11-08): §1 Core URS column: URS-BR-056–059 cited where the behaviours now cite them (core CCR-BR-027) (CCR-ES-001)<br>0.1 (2026-11-08): Initial draft (CCR-ES-001)                 |

---

The chain for this package is core URS → BEH-ES → INV-ES → ADR-ES → REQ-ES →
RSK-ES / core RSK-BR → test. Every test is *Planned*; no row is evidence
([ADR-BR-036](../core/decisions/036-prospective-specification.md)).

## §1 Behaviour traceability

| Behaviour | Invariant | Decision | Core seam | Core URS | Acceptance |
| --------- | --------- | -------- | --------- | -------- | ---------- |
| BEH-ES-001 | — | ADR-ES-002 | — | URS-BR-043, URS-BR-056 | REQ-ES-001 |
| BEH-ES-002 | INV-ES-003 | ADR-ES-002 | BEH-BR-209, BEH-BR-210 | URS-BR-043, URS-BR-056 | REQ-ES-002 |
| BEH-ES-003 | INV-ES-001, INV-ES-002 | ADR-ES-004 | — | URS-BR-043, URS-BR-056 | REQ-ES-003 |
| BEH-ES-004 | INV-ES-001 | ADR-ES-004 | — | URS-BR-043 | REQ-ES-003 |
| BEH-ES-005 | INV-ES-002 | ADR-ES-003 | — | URS-BR-043, URS-BR-056 | REQ-ES-004 |
| BEH-ES-006 | — | ADR-ES-002 | — | URS-BR-029 | REQ-ES-005 |
| BEH-ES-007 | — | — | BEH-BR-185, BEH-BR-187, BEH-BR-259, BEH-BR-280, BEH-BR-292, BEH-BR-296 | URS-BR-054, URS-BR-035 | REQ-ES-006, REQ-ES-013 |
| BEH-ES-008 | INV-ES-004 | ADR-ES-006 | — | URS-BR-043 | REQ-ES-016 |
| BEH-ES-009 | — | ADR-ES-001 | — | — | REQ-ES-007 |
| BEH-ES-010 | INV-ES-005 | ADR-ES-001 | — | — | REQ-ES-007 |
| BEH-ES-011 | INV-ES-002 | ADR-ES-004 | — | — | REQ-ES-007 |
| BEH-ES-012 | — | ADR-ES-004 | — | — | REQ-ES-007 |
| BEH-ES-013 | INV-ES-006 | ADR-ES-005 | — | URS-BR-043 | REQ-ES-008 |
| BEH-ES-014 | — | ADR-ES-005 | — | — | REQ-ES-008 |
| BEH-ES-015 | INV-ES-006 | ADR-ES-005 | — | URS-BR-043 | REQ-ES-008 |
| BEH-ES-016 | — | ADR-ES-004 | BEH-BR-207 | — | REQ-ES-007 |
| BEH-ES-017 | — | ADR-ES-001 | — | — | REQ-ES-009 |
| BEH-ES-018 | INV-ES-002 | ADR-ES-003 | — | — | REQ-ES-004 |
| BEH-ES-019 | INV-ES-004 | — | — | — | REQ-ES-009 |
| BEH-ES-020 | INV-ES-004 | — | — | — | REQ-ES-009 |
| BEH-ES-021 | INV-ES-004 | — | — | — | REQ-ES-010 |
| BEH-ES-022 | — | — | — | — | REQ-ES-010 |
| BEH-ES-023 | INV-ES-005 | — | — | — | REQ-ES-011 |
| BEH-ES-024 | INV-ES-005 | — | — | — | REQ-ES-011 |
| BEH-ES-025 | INV-ES-003 | ADR-ES-002 | BEH-BR-230, BEH-BR-231 | URS-BR-029 | REQ-ES-012 |
| BEH-ES-026 | — | ADR-ES-002 | — | URS-BR-029 | REQ-ES-005 |
| BEH-ES-027 | — | ADR-ES-002 | — | URS-BR-029 | REQ-ES-012 |
| BEH-ES-028 | INV-ES-002 | ADR-ES-003 | — | URS-BR-043, URS-BR-056 | REQ-ES-006, REQ-ES-013 |
| BEH-ES-029 | — | ADR-ES-003 | BEH-BR-269 | URS-BR-043 | REQ-ES-013 |
| BEH-ES-030 | INV-ES-006 | ADR-ES-005 | — | URS-BR-043 | REQ-ES-008, REQ-ES-013, REQ-ES-014 |
| BEH-ES-031 | INV-ES-003 | ADR-ES-007 | — | URS-BR-022 | REQ-ES-015 |
| BEH-ES-032 | — | ADR-ES-007 | — | URS-BR-059 | REQ-ES-015 |
| BEH-ES-033 | INV-ES-001, INV-ES-003 | ADR-ES-006 | — | — | REQ-ES-016 |
| BEH-ES-034 | INV-ES-002 | ADR-ES-003 | — | URS-BR-043, URS-BR-056 | REQ-ES-008, REQ-ES-016 |
| BEH-ES-035 | — | ADR-ES-006 | — | — | REQ-ES-016 |
| BEH-ES-036 | INV-ES-004 | ADR-ES-006 | — | — | REQ-ES-016 |
| BEH-ES-037 | — | ADR-ES-006 | — | URS-BR-025 | REQ-ES-016 |
| BEH-ES-038 | — | — | BEH-BR-225, BEH-BR-244, BEH-BR-251, BEH-BR-269, BEH-BR-273 | URS-BR-029, URS-BR-034 | REQ-ES-016, REQ-ES-017 |
| BEH-ES-039 | — | — | BEH-BR-209, BEH-BR-210 | URS-BR-027 | REQ-ES-016 |
| BEH-ES-040 | — | — | — | URS-BR-025 | REQ-ES-001–017 |

## §2 Acceptance scenarios

Each `REQ-ES` is the planned acceptance scenario for the numbered check of
[BEH-ES-040](./behaviors/05-storage-port-and-acceptance.md#beh-es-040-required-acceptance-checks).
Test files are *Planned* under `packages/event-store/test/` *(Planned)*.

| REQ | Check | Summary | Behaviours |
| --- | ----- | ------- | ---------- |
| <a id="req-es-001"></a>REQ-ES-001 | 1 | Registration refusals | BEH-ES-001 |
| <a id="req-es-002"></a>REQ-ES-002 | 2 | Stored form and its sources | BEH-ES-002 |
| <a id="req-es-003"></a>REQ-ES-003 | 3 | Expected versions and `WrongExpectedVersion` | BEH-ES-003, BEH-ES-004 |
| <a id="req-es-004"></a>REQ-ES-004 | 4 | All-or-nothing transaction | BEH-ES-005, BEH-ES-018, BEH-ES-028 |
| <a id="req-es-005"></a>REQ-ES-005 | 5 | Reads: upcast, decode, stop on unknown version | BEH-ES-006, BEH-ES-026 |
| <a id="req-es-006"></a>REQ-ES-006 | 6 | Attribution and correlation | BEH-ES-007 |
| <a id="req-es-007"></a>REQ-ES-007 | 7 | Deciders, `handle`, `run`, refusals | BEH-ES-009–012, BEH-ES-016 |
| <a id="req-es-008"></a>REQ-ES-008 | 8 | Facts never rejected; idempotent | BEH-ES-013–015 |
| <a id="req-es-009"></a>REQ-ES-009 | 9 | Followers: checkpoint, halt | BEH-ES-017, BEH-ES-019, BEH-ES-020 |
| <a id="req-es-010"></a>REQ-ES-010 | 10 | Rebuild and version change | BEH-ES-021, BEH-ES-022 |
| <a id="req-es-011"></a>REQ-ES-011 | 11 | Snapshots as cache | BEH-ES-023, BEH-ES-024 |
| <a id="req-es-012"></a>REQ-ES-012 | 12 | Versions and upcaster retention | BEH-ES-025, BEH-ES-027 |
| <a id="req-es-013"></a>REQ-ES-013 | 13 | Publication in the append | BEH-ES-028, BEH-ES-029 |
| <a id="req-es-014"></a>REQ-ES-014 | 14 | Receipt as a fact in the inbox's transaction | BEH-ES-030 |
| <a id="req-es-015"></a>REQ-ES-015 | 15 | Chain receives stored form; codec | BEH-ES-031, BEH-ES-032 |
| <a id="req-es-016"></a>REQ-ES-016 | 16 | Adapter conformance on SQLite and Postgres | BEH-ES-008, BEH-ES-033–039 |
| <a id="req-es-017"></a>REQ-ES-017 | 17 | Grants name the `EventStore` members; helpers reach the store only through them | BEH-ES-038 |

## §3 Risk notes

Package risks are in [risks.md](./risks.md) (RSK-ES-001–006). Relationship to
the core register ([risk assessment](../core/gxp/03-risk-assessment.md)):

| Core risk | Relationship |
| --------- | ------------ |
| [RSK-BR-003](../core/gxp/03-risk-assessment.md#rsk-br-003) Silent retry repeats side effects | Not increased: `append` and `handle` never retry; `run` re-decides on retry (BEH-ES-011, BEH-ES-012). |
| [RSK-BR-012](../core/gxp/03-risk-assessment.md#rsk-br-012) Lossy event feed mistaken for audit trail | Related: stored events are business records, not the core trail; documentation says so (overview). |
| [RSK-BR-018](../core/gxp/03-risk-assessment.md#rsk-br-018) Over-claiming qualification evidence | Controlled by the honest-claims rule and the conformance scope statement (BEH-ES-037). |

Two core risks are proposed for the core register in the integration notes
(stored and published events diverge; a projection skips events).

---

_Previous: [Risks](./risks.md)_ · _Next: [README](./README.md)_
