# Traceability

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-EN-TRACE                                             |
> | Revision       | 0.4                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Traceability Matrix (companion)                              |
> | Change History | 0.4 (2026-11-08): Round 2: recheck item 16; core alignment — rows BEH-EN-025–032, REQ-EN-017–023, INV-EN-006–007, ADR-EN-004; BEH-EN-016 and 023 cite core `policy` and `settle`; risk note 3 updated (CCR-EN-003)<br>0.3 (2026-11-08): Rows for the skip policies and the piece timeout; RSK-BR-046 named (CCR-EN-002)<br>0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-EN-001)<br>0.1 (2026-11-08): Initial draft (CCR-EN-001)                 |

---

The chain is core URS → BEH-EN → INV-EN → ADR-EN → REQ-EN → core RSK. Every
source and test is *(Planned)*; nothing below is evidence
([ADR-BR-036](../core/decisions/036-prospective-specification.md)).

## §1 Behaviour traceability

| Behaviour | Invariant | Decision | Core seam | Planned source |
| --------- | --------- | -------- | --------- | -------------- |
| BEH-EN-001 | — | ADR-EN-001 | 25 (gate pattern) | `packages/entitlement/src/Entitlement.ts` *(Planned)* |
| BEH-EN-002 | — | ADR-EN-001 | — | `Entitlement.ts` *(Planned)* |
| BEH-EN-003 | INV-EN-002 | ADR-EN-001 | — | `Entitlement.ts` *(Planned)* |
| BEH-EN-004 | INV-EN-002 | ADR-EN-001 | 24 (`Clock`) | `Entitlement.ts` *(Planned)* |
| BEH-EN-005 | — | ADR-EN-001 | — | `Entitlement.ts` *(Planned)* |
| BEH-EN-006 | — | ADR-EN-002 | — | `Entitlement.ts` *(Planned)* |
| BEH-EN-007 | INV-EN-005 | ADR-EN-001 | — | `essential.ts` *(Planned)* |
| BEH-EN-008 | — | ADR-EN-002 | 23, 25 | `Entitlement.ts` *(Planned)* |
| BEH-EN-009 | INV-EN-001 | ADR-EN-002 | 25, 32 | `EntitlementGate.ts` *(Planned)* |
| BEH-EN-010 | INV-EN-005 | ADR-EN-002 | 25 | `EntitlementGate.ts` *(Planned)* |
| BEH-EN-011 | — | ADR-EN-001 | 25 (`gateTimeout`), 32 (piece `timeout`) | `EntitlementGate.ts` *(Planned)* |
| BEH-EN-012 | INV-EN-001 | ADR-EN-001 | 25 | `EntitlementGate.ts` *(Planned)* |
| BEH-EN-013 | — | ADR-EN-002 | 10 (BEH-BR-089, CCR-BR-020, CCR-BR-022), 28 | `EntitlementView.ts` *(Planned)* |
| BEH-EN-014 | INV-EN-005 | ADR-EN-001 | 28 | `guard.ts` *(Planned)* |
| BEH-EN-015 | INV-EN-002 | ADR-EN-001 | 09, 10 | `Entitlement.ts` *(Planned)* |
| BEH-EN-016 | INV-EN-005 | ADR-EN-001 | 31 (`HookPointOptions.policy`, BEH-BR-302, BEH-BR-312; G64 limit) | `policies.ts` *(Planned)* |
| BEH-EN-017 | — | ADR-EN-003 | — | `Budget.ts` *(Planned)* |
| BEH-EN-018 | INV-EN-004 | ADR-EN-003 | — | `Budget.ts` *(Planned)* |
| BEH-EN-019 | INV-EN-003 | ADR-EN-003 | — | `Budget.ts` *(Planned)* |
| BEH-EN-020 | INV-EN-004, INV-EN-005 | ADR-EN-003 | — | `Budget.ts` *(Planned)* |
| BEH-EN-021 | — | ADR-EN-003 | 24 (`Clock`) | `Budget.ts` *(Planned)* |
| BEH-EN-022 | — | ADR-EN-003 | — | `BudgetLedger.ts` *(Planned)* |
| BEH-EN-023 | INV-EN-005, INV-EN-007 | ADR-EN-003 | 31 (`HookPointOptions.policy` and `settle`, BEH-BR-302), 32 | `Budget.ts`, `policies.ts` *(Planned)* |
| BEH-EN-024 | — | ADR-EN-001–003 | 21 (`TestHost`) | `packages/entitlement/test/*.test.ts` *(Planned)* |
| BEH-EN-025 | INV-EN-006, INV-EN-002 | ADR-EN-004 | 29 (`CapabilityPolicy`, BEH-BR-273, BEH-BR-274) | `CapabilityPolicy.ts` *(Planned)* |
| BEH-EN-026 | — | ADR-EN-004 | 26 (BEH-BR-225), 29 (BEH-BR-273) | `readOnly.ts` *(Planned)* |
| BEH-EN-027 | INV-EN-006, INV-EN-005 | ADR-EN-004, ADR-EN-001 | 29 (BEH-BR-275) | `CapabilityPolicy.ts` *(Planned)* |
| BEH-EN-028 | INV-EN-002, INV-EN-006 | ADR-EN-004 | 29 (`changes`, `ResolveAgain`, BEH-BR-281) | `CapabilityPolicy.ts` *(Planned)* |
| BEH-EN-029 | — | ADR-EN-004 | 29 (BEH-BR-275, BEH-BR-278) | documentation *(Planned)* |
| BEH-EN-030 | INV-EN-007, INV-EN-003 | ADR-EN-003 | 31 (`policy`, `settle`, BEH-BR-302) | `policies.ts`, `Budget.ts` *(Planned)* |
| BEH-EN-031 | — | ADR-EN-003 | 24 (`Clock`) | `usage.ts` *(Planned)* |
| BEH-EN-032 | — | ADR-EN-003, ADR-EN-004 | 21 (`TestHost`), 29 (scripted `CapabilityPolicy` fixture) | `packages/entitlement/test/*.test.ts` *(Planned)* |

## §2 Acceptance scenarios

Each scenario is the acceptance check of the same number in
[BEH-EN-024](./behaviors/03-budgets.md#beh-en-024-required-acceptance-checks)
(checks 1–16) or
[BEH-EN-032](./behaviors/04-grant-narrowing-and-usage.md#beh-en-032-required-acceptance-checks-of-grant-narrowing-and-usage)
(checks 17–23).

| REQ | Check | Behaviours covered |
| --- | ----- | ------------------ |
| <a id="req-en-001"></a>REQ-EN-001 | 1 | BEH-EN-001 |
| <a id="req-en-002"></a>REQ-EN-002 | 2 | BEH-EN-002 |
| <a id="req-en-003"></a>REQ-EN-003 | 3 | BEH-EN-003 |
| <a id="req-en-004"></a>REQ-EN-004 | 4 | BEH-EN-004 |
| <a id="req-en-005"></a>REQ-EN-005 | 5 | BEH-EN-005, BEH-EN-006 |
| <a id="req-en-006"></a>REQ-EN-006 | 6 | BEH-EN-007, BEH-EN-020 |
| <a id="req-en-007"></a>REQ-EN-007 | 7 | BEH-EN-008, BEH-EN-010 |
| <a id="req-en-008"></a>REQ-EN-008 | 8 | BEH-EN-009 |
| <a id="req-en-009"></a>REQ-EN-009 | 9 | BEH-EN-011 |
| <a id="req-en-010"></a>REQ-EN-010 | 10 | BEH-EN-012 |
| <a id="req-en-011"></a>REQ-EN-011 | 11 | BEH-EN-013 |
| <a id="req-en-012"></a>REQ-EN-012 | 12 | BEH-EN-014 |
| <a id="req-en-013"></a>REQ-EN-013 | 13 | BEH-EN-015 |
| <a id="req-en-014"></a>REQ-EN-014 | 14 | BEH-EN-016, BEH-EN-023 |
| <a id="req-en-015"></a>REQ-EN-015 | 15 | BEH-EN-017, BEH-EN-018, BEH-EN-020 |
| <a id="req-en-016"></a>REQ-EN-016 | 16 | BEH-EN-019, BEH-EN-021, BEH-EN-022 |
| <a id="req-en-017"></a>REQ-EN-017 | 17 | BEH-EN-025 |
| <a id="req-en-018"></a>REQ-EN-018 | 18 | BEH-EN-026 |
| <a id="req-en-019"></a>REQ-EN-019 | 19 | BEH-EN-027 |
| <a id="req-en-020"></a>REQ-EN-020 | 20 | BEH-EN-028 |
| <a id="req-en-021"></a>REQ-EN-021 | 21 | BEH-EN-029 |
| <a id="req-en-022"></a>REQ-EN-022 | 22 | BEH-EN-030 |
| <a id="req-en-023"></a>REQ-EN-023 | 23 | BEH-EN-031 |

## §3 Risk notes

Core risks cited by this package's behaviours:
[RSK-BR-007](../core/gxp/03-risk-assessment.md#rsk-br-007) (time; expiry and
periods read from `Clock`),
[RSK-BR-012](../core/gxp/03-risk-assessment.md#rsk-br-012) (a diagnostic log
mistaken for a record),
[RSK-BR-014](../core/gxp/03-risk-assessment.md#rsk-br-014) (the gate seam the
entitlement piece composes into),
[RSK-BR-018](../core/gxp/03-risk-assessment.md#rsk-br-018) (over-claiming
evidence).

Hazards this package introduces, proposed for the core register under change
control; the first is registered in core as
[RSK-BR-046](../core/gxp/03-risk-assessment.md#rsk-br-046). `enable` is not
entitlement-gated and a security-fix `replace` of a lapsed plugin is refused
only when the application chose `onReplace: "consult"` (BEH-EN-009,
BEH-EN-012), which bears on RSK-BR-046:

1. **Entitlement lapse blocks an essential operation or stops a plugin.** A
   lapse, an outage of the entitlement service or an exhausted budget refuses
   work the system must always perform, or a plugin is stopped mid-call.
   Controls: BEH-EN-003, BEH-EN-007, BEH-EN-012, BEH-EN-015, BEH-EN-020;
   INV-EN-001, INV-EN-002, INV-EN-005.
2. **A stale or unavailable entitlement answer grants too much.** An outage
   leaves a plugin running fully past its end date, or a grant is approved on
   an old answer. Controls: BEH-EN-004 (local expiry), BEH-EN-005
   (`staleAfter`, never raising a mode), BEH-EN-011 (fresh check for grants).
3. **Read-only mistaken for isolation.** A deployment relies on a plugin
   honouring read-only as if it were enforced, or reads grant narrowing as
   isolation. Controls: BEH-EN-014 documentation requirement; grant narrowing
   of a lapsed plugin's captures through core `CapabilityPolicy.changes`
   (BEH-EN-025–028, INV-EN-006), with its limits stated (BEH-EN-029);
   out-of-process execution for code that must not write.
4. **A wrong read-only classification.** The application classes a writing
   member as read-only, so narrowing leaves it callable. Controls: no
   inferred or default classification (BEH-EN-026); classification checked
   against contract methods at build; the call log, when wired, shows which
   members were called (core BEH-BR-276). Proposed for the core register
   under RSK-BR-046's review, not scored here.
