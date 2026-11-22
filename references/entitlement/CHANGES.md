# Change history

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-EN-CHG                                               |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Change Record                                                |
> | Change History | 0.1 (2026-11-22): Older Change History lines moved out of the Document Control tables (improvement report 07, R6) |

---

A Document Control cell keeps its newest revisions; older lines are moved here, newest first, under the Document ID of
the document they belong to (`python3 references/core/scripts/split-history.py`). Nothing is rewritten: a line moves whole.

## BRIDGER-EN-BEH-02

`entitlement/behaviors/02-gate-and-runtime.md`

- 0.6 (2026-11-10): BEH-EN-014: `Entitlement.guard` reads the mode from the activation's `Plugin.Runtime.entitled`, passed as `options.entitled`, takes the essential labels as `options.essential`, counts in the package's process-local `inspect` counters, which gain `essentialOverdraft` and `narrowed` for the counts 03 and 04 require, and does not require the `Entitlement` service; core's modes "unmetered" and "unknown" allow only essential uses (M25); BEH-EN-009 names the `Entitlement` service and the application's `EntitlementAdapter` (low finding) (CCR-EN-006)
- 0.5 (2026-11-10): BEH-EN-009 declares `EntitlementGate.check(request, options)`, which the text already required; BEH-EN-011 reads `checkTimeout` from the `Entitlement` service's options (01, BEH-EN-001); BEH-EN-014 defines `EntitlementInspection` (P13) (CCR-EN-005)
- 0.4 (2026-11-08): Round 2: recheck item 16; core alignment — BEH-EN-016 uses core `HookPointOptions.policy` (`ContributionPolicy`, `Run`/`Skip`/`Deny`) with `Entitlement.contributionPolicy` (`onNotEntitled: "skip" \| "deny"`) and `Policies.first`, replacing `Entitlement.skipPolicy`, `SkipPolicy` and `Skip.first` (G62 closed in core); G64 limit stated; BEH-EN-009 allows `undo` requests and ignores `allowChildren` and `mandatoryInterceptions`; BEH-EN-015 points to grant narrowing (CCR-EN-003)
- 0.3 (2026-11-08): `enable` not entitlement-gated; `replace` consulted only under the required `onReplace` option; `EntitlementGate.piece` checks `checkTimeout` against its own timeout and documents the composite `gateTimeout`; core modes `unmetered` and `unknown`; hook entitlement is `Entitlement.skipPolicy` for `HookPointOptions.skip`, replacing `hookPolicy` (CCR-EN-002)
- 0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-EN-001)
- 0.1 (2026-11-08): Initial draft (CCR-EN-001)                

## BRIDGER-EN-BEH-03

`entitlement/behaviors/03-budgets.md`

- 0.5 (2026-11-09): Specification audit of 2026-11-09 (C-10) — BEH-EN-023: a per-command budget is an application admission policy of the command companion (command BEH-CM-044), reserving at admission and committing or releasing at its settlement, with exhaustion surfaced as `CommandRefused { reason: "budget-exhausted" }`; the package stays independent of `@bridger/command` (CCR-EN-004)
- 0.4 (2026-11-08): Round 2: recheck item 16; core alignment — BEH-EN-023 uses core `HookPointOptions.policy` and `settle` through `Budget.contributionPolicy`, which reserves at admission and settles after the call (04, BEH-EN-030), replacing `Budget.skipPolicy` (G63 closed in core); check 14 updated; Open (3) settled (CCR-EN-003)
- 0.3 (2026-11-08): `Budget.skipPolicy` for `HookPointOptions.skip` replaces `hookQuota`, charged at admission; acceptance checks 8–11 and 14 updated (CCR-EN-002)
- 0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-EN-001)
- 0.1 (2026-11-08): Initial draft (CCR-EN-001)                
