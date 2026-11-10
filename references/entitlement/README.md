# Bridger Entitlement — Specification

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-EN-00                                                |
> | Revision       | 0.9                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification — Master Index (companion)          |
> | Change History | 0.9 (2026-11-10): CCR-EN-007 registered (round 4 findings of the specification audit of 2026-11-10: E1, E2, E3, E4) (CCR-EN-007)<br>0.8 (2026-11-10): CCR-EN-006 registered (round 3 findings of the specification audit of 2026-11-10: M25, M26 and a low finding) (CCR-EN-006)<br>0.7 (2026-11-10): CCR-EN-005 registered (round 2 findings of the specification audit of 2026-11-09: P13; ADR-EN-002 citation); CCR register rows put in ascending order, as in the other trees (CCR-EN-005)<br>0.6 (2026-11-09): CCR-EN-004 registered (specification audit of 2026-11-09, C-10) (CCR-EN-004)<br>0.5 (2026-11-08): CCR-EN-003 extended with revision 2, resolution of the round-2 agent review (R3-17) (CCR-EN-003)<br>0.4 (2026-11-08): Register row CCR-EN-003 (round 2: recheck item 16; core alignment); contents row 04 and ADR-EN-004; dependency rows for core 29 and 31 (`policy`, `settle`); open questions 1 and 2 answered by core (CCR-EN-003)<br>0.3 (2026-11-08): Register row CCR-EN-002 (resolutions of the agent review of 2026-11-08); dependency rows corrected (CCR-BR-020 typo); Open questions section (CCR-EN-002)<br>0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-EN-001)<br>0.1 (2026-11-08): Initial draft (CCR-EN-001)                 |

---

**implementation: absent**

This is the specification of `@bridger/entitlement`, an optional companion
package of `@bridger/core`. It gives an application three things on top of
the core's seams: an `Entitlement` port that says whether a plugin may run
fully, read-only or not at all; a gate that consults it before a host
operation would grant a plugin more than it is entitled to; and `Budget`, a
reservation-based meter for quotas keyed by labels the application chooses
(an organisation, a plugin, a task). It depends on `@bridger/core`;
`@bridger/core` never depends on it.

## Status: prospective

Nothing described here is implemented. Every document is a `Draft`, every
decision is `Proposed`, and every source or test path is marked *Planned*.
The rules of the core specification apply unchanged
([ADR-BR-036](../core/decisions/036-prospective-specification.md)): this
specification is not evidence that the package behaves as described; a
requirement becomes evidence only when a test that exercises it has run and
passed ([ADR-BR-035](../core/decisions/035-evidence-from-executed-tests.md)).

## The honest-claims rule

The core's honest-claims rule ([core README](../core/README.md#the-honest-claims-rule))
applies. In particular this package:

- does **not** verify licences, payments or contracts — whether a subject is
  entitled is the answer of the application's `EntitlementAdapter`, which
  this package passes through and never second-guesses;
- does **not** enforce read-only mode inside plugin code — in-process code is
  trusted and is not isolated; a plugin switches itself to read-only, and the
  helpers here make that easy and checkable, not unavoidable; grant
  narrowing takes members out of the services a lapsed plugin captured, which
  is narrowing, not isolation
  ([04](./behaviors/04-grant-narrowing-and-usage.md));
- does **not** provide billing, invoicing or exact metering across
  processes — `Budget` is process-local accounting with an optional ledger
  port, and the consumer is responsible for anything that is charged;
- makes no claim that a deployment using it is compliant with any licence
  term, regulation or contract.

## Reading order

| Step | Document | Purpose |
| ---- | -------- | ------- |
| 1 | [Overview](./overview.md) | Mission, package boundary, public API surface, worked example |
| 2 | [Behaviours](./behaviors/01-entitlement-port.md) | What the package must do, as `BEH-EN` requirements |
| 3 | [Invariants](./invariants.md) | Properties that hold for every execution |
| 4 | [Decisions](./decisions/001-entitlement-changes-modes-not-state.md) | Why, as `ADR-EN` records |
| 5 | [Traceability](./traceability.md) | BEH → INV → ADR → REQ, and risk notes |

## Contents

### Behaviours

| # | File | Identifiers |
| - | ---- | ----------- |
| 01 | [Entitlement port](./behaviors/01-entitlement-port.md) | BEH-EN-001–008 |
| 02 | [Gate and runtime](./behaviors/02-gate-and-runtime.md) | BEH-EN-009–016 |
| 03 | [Budgets](./behaviors/03-budgets.md) | BEH-EN-017–024 |
| 04 | [Grant narrowing and usage](./behaviors/04-grant-narrowing-and-usage.md) | BEH-EN-025–032 |

### Decisions

| ID | Decision |
| -- | -------- |
| [ADR-EN-001](./decisions/001-entitlement-changes-modes-not-state.md) | Entitlement changes a plugin's mode, never its lifecycle state |
| [ADR-EN-002](./decisions/002-runtime-stream-and-gate-only.md) | Entitlement reaches plugins through `Plugin.Runtime.entitled` and host operations only through the gate |
| [ADR-EN-003](./decisions/003-budgets-are-scoped-reservations.md) | Budgets are scoped reservations over opaque labels; exhaustion is a policy outcome |
| [ADR-EN-004](./decisions/004-a-lapse-narrows-capability-grants.md) | A lapse narrows a plugin's capability grants to read-only members, never refusing and never changing state |

## Dependencies on core

| Core seam | What this package uses | Defined by |
| --------- | ---------------------- | ---------- |
| [25 — Operation gate](../core/behaviors/25-operation-gate.md) | `OperationGate`, `OperationRequest` (including `undo`, BEH-BR-219), `OperationRejected`; fail-closed on gate defects | core (existing), CCR-BR-025 |
| [32 — Generic gate and plan](../core/behaviors/32-generic-gate-and-plan.md) | `Gate<Req>` with Allow / Refuse / Defer; composition of gates; `OperationGate` as one instance | CCR-BR-019 |
| [31 — Hook points](../core/behaviors/31-hook-points.md) | `HookPoint`, failure policy, roles, per-contribution breaker, decision record; `HookPointOptions.policy` (`ContributionPolicy`, `Run`/`Skip`/`Deny`) with the "skipped-policy" and "denied-policy" outcomes (BEH-BR-302, BEH-BR-312) for the contribution policies; `HookPointOptions.settle` (BEH-BR-302) for budget settlement | CCR-BR-019, CCR-BR-024, CCR-BR-026 |
| [29 — Capability grants and call log](../core/behaviors/29-capability-grants-and-call-log.md) | `CapabilityPolicy`, `Grant.of`, the narrowing layer per capture, `changes` / `ResolveAgain` re-resolution of live captures (BEH-BR-273–275, BEH-BR-281) for grant narrowing | CCR-BR-018, CCR-BR-026 |
| [28 — Plugin principal and mandatory policy](../core/behaviors/28-plugin-principal-and-mandatory-policy.md) | `CurrentPlugin` (for the alternative of BEH-EN-013, Open) | CCR-BR-018 |
| [10 — Runtime failure and health](../core/behaviors/10-runtime-failure-and-health.md) | `Plugin.Runtime` and its `entitled` member with the optional `EntitlementView` port, core modes `unmetered` and `unknown` (BEH-BR-089; see BEH-EN-013) | CCR-BR-020, CCR-BR-022 |
| [18 — Reconciliation and confluence](../core/behaviors/18-reconciliation-and-confluence.md) | per-entry gating of `reconcile` | core (existing) |

## Open questions

Revision 0.3 recorded two questions for core; both are now answered by core
and settled here.

1. **A policy denial of a hook dispatch** — answered by core's
   `ContributionPolicy` `Deny` and the "denied-policy" outcome (BEH-BR-312,
   URS gap G62 closed, CCR-BR-024): `Entitlement.contributionPolicy` takes
   `onNotEntitled: "skip" | "deny"` (BEH-EN-016).
2. **Charging a hook call after it ends** — answered by core's `settle` step
   (BEH-BR-302, URS gap G63 closed, CCR-BR-026): `Budget.contributionPolicy`
   reserves at admission and settles after the call (BEH-EN-030).

One limit of core remains and is stated, not decided here: a veto plugin that
is loaded but not active has no hook, so a dispatch can be allowed without its
veto (URS gap G64; BEH-EN-016).

## Identifier scheme

| Prefix | Meaning |
| ------ | ------- |
| `BEH-EN-NNN` | Functional behaviour requirement |
| `INV-EN-NNN` | Runtime invariant |
| `ADR-EN-NNN` | Architecture decision |
| `REQ-EN-NNN` | Acceptance scenario (planned) |
| `CCR-EN-NNN` | Change control record |

Rules follow the core [identifier scheme](../core/process/requirement-id-scheme.md):
behaviour identifiers are allocated in blocks of eight per file; other series
are contiguous. Risks are not numbered here: hazards this package introduces
are proposed for the core register (`RSK-BR`) under change control
([traceability §3](./traceability.md#3-risk-notes)).

## Document history

| CCR | Date | Change |
| --- | ---- | ------ |
| CCR-EN-001 | 2026-11-08 | Initial draft of the companion: `Entitlement` port with opaque subject labels and a full → grace → read-only → none state read from `Clock`; `onUnavailable` policy; no default implementation; entitlement gate consulted for granting operations only, never for `remove`, `disable`, `shutdown` or system transitions; `Plugin.Runtime.entitled` stream (proposed core seam); `Entitlement.guard` and application-declared essential labels; `Budget.reserve` with scoped commit and release over opaque labels, `BudgetExhausted`, optional `BudgetLedger`; interplay with hook points. Behaviours BEH-EN-001–024, invariants INV-EN-001–005, decisions ADR-EN-001–003, acceptance scenarios REQ-EN-001–016.<br>**Impact (PROC-03 §3).** (1) Identifiers: all added; nothing amended or withdrawn in this tree; the core amendment it needs (`Plugin.Runtime.entitled`, an optional core port) is proposed for registration under a `CCR-BR` by the integration agent and is not made here. (2) Risk: new hazards proposed for the core register (an entitlement lapse that blocks an essential operation or stops a plugin; a stale entitlement answer granting too much) — see [traceability §3](./traceability.md#3-risk-notes); no core score changed. (3) GxP impact: indirect — entitlement refusals of host operations are gate refusals and so produce core `rejected` records (BEH-BR-220); no record field or `schemaVersion` changes. (4) Revalidation: no version has been released or qualified (implementation absent); none. (5) Compatibility: no core public type changes until the proposed `entitled` member is accepted; a host with no entitlement port wired behaves as before. |
| CCR-EN-002 | 2026-11-08 | Resolutions of the agent review of 2026-11-08 (review R4, findings EN-M1, EN-m1, EN-m2, EN-m3), aligned with core CCR-BR-022: hook entitlement and quotas are `Entitlement.skipPolicy` and `Budget.skipPolicy` for the hook point's `HookPointOptions.skip`, combined with `Skip.first`, recorded by core as "skipped-policy"; the `hookPolicy` and `hookQuota` wrappers and their deny variant are withdrawn (EN-M1); `enable` is no longer entitlement-gated and `replace` is consulted only under the required `onReplace` option (EN-m1); `checkTimeout` is checked against the piece's own `timeout` by `EntitlementGate.piece`, and the composite `gateTimeout` bound is documented (EN-m2); the overview no longer calls the core seam missing, and the dependency row cites CCR-BR-020 (EN-m3); core's `unmetered` and `unknown` modes replace the `unmetered: true` flag (core BEH-BR-089). Open questions recorded above.<br>**Impact (PROC-03 §3).** (1) Identifiers: none added or withdrawn; BEH-EN-007, 009, 011–013, 016, 023, 024, INV-EN-001, INV-EN-005, ADR-EN-002 amended; the heading of BEH-EN-016 changed. (2) Risk: bears on RSK-BR-046 (fewer operations refusable for entitlement; a security-fix replace refusable only by the application's choice); no score changed by this record. (3) GxP impact: indirect — which host operations the gate piece can refuse changes, and hook skips are recorded as policy skips. (4) Revalidation: nothing released (implementation absent); REQ-EN-008–011 and REQ-EN-014 updated. (5) Compatibility: draft API changes (`hookPolicy`, `hookQuota` replaced; `EntitlementGateOptions.onReplace` required; `piece` added; `layer` takes `gateTimeout`); no core type changed. |
| CCR-EN-003 | 2026-11-08 | Round 2: recheck item 16 (entitlement narrows grants on lapse; refund after a hook call; usage export) and alignment with core CCR-BR-024–026: new file [04 — Grant narrowing and usage](./behaviors/04-grant-narrowing-and-usage.md) — `Entitlement.capabilityPolicy` wraps the application's `CapabilityPolicy` and, on a lapse, re-resolves the plugin's live captures through core `CapabilityPolicy.changes` (`ResolveAgain`, BEH-BR-281) so that later calls reach only the members the application classed read-only (`ReadOnly` classifier, no default), never refusing a capture and never changing plugin state (INV-EN-002 now holds without the plugin's cooperation for the services it captured); `Budget.contributionPolicy` reserves at admission and settles through core's `settle` step (G63 closed in core); `Budget.usage` export; BEH-EN-016 moved from `HookPointOptions.skip` to `policy` — `Entitlement.skipPolicy`, `SkipPolicy`, `Skip.first` and `Budget.skipPolicy` replaced by `Entitlement.contributionPolicy` (`onNotEntitled: "skip" \| "deny"`, G62 closed in core), `Policies.first` and `Budget.contributionPolicy`; G64 limit stated; the gate allows `undo` requests and ignores `allowChildren` and `mandatoryInterceptions`; README open questions answered. Recheck item 16 closed.<br>**Impact (PROC-03 §3).** (1) Identifiers: BEH-EN-025–032, INV-EN-006–007, ADR-EN-004, REQ-EN-017–023 added; BEH-EN-007, 009, 015, 016, 023, 024, INV-EN-002, INV-EN-005, ADR-EN-001–003 amended; the heading of BEH-EN-016 changed; nothing withdrawn. (2) Risk: bears on RSK-BR-046 and RSK-BR-029 (a control added that does not rest on plugin cooperation for captured services; one control-introduced hazard, a wrong read-only classification, stated in [traceability §3](./traceability.md#3-risk-notes)); no score changed by this record. (3) GxP impact: indirect — hook decisions may now be recorded by core as "denied-policy" for not-entitled veto contributors, and denied calls of narrowed captures appear in core's call log when wired; no record field or `schemaVersion` changes. (4) Revalidation: nothing released (implementation absent); REQ-EN-014 updated, REQ-EN-017–023 added. (5) Compatibility: draft API changes (`skipPolicy` and `Skip.first` replaced; `Budget.contributionPolicy` reserves instead of committing at admission; `BudgetShape.usage` added); no core type changed.<br>**Revision 2 (2026-11-08): resolution of the round-2 agent review** (review R3, finding R3-17). A reservation for a declaration that `policy` answered `Run` and whose wake then failed or timed out reaches no `settle` and is released at `ttl`, counted "expired"; documentation recommends a `ttl` just above the longest wake window plus the hook `timeout`; the package relies on core asking `policy` once per declaration of a dispatch; whether core should settle such declarations with a "wake-failed" outcome is an open question put to core.<br>**Impact of revision 2 (PROC-03 §3).** (1) Identifiers: none added or withdrawn; BEH-EN-030 and check 22 amended. (2) Risk: no change to RSK-BR-012; no score changed. (3) GxP impact: no. (4) Revalidation: nothing released (implementation absent); REQ-EN-022 covers the added case. (5) Compatibility: none (documentation and a stated expiry case only). |
| CCR-EN-004 | 2026-11-09 | Specification audit of 2026-11-09, finding C-10 (entitlement side). This is an agent review, not the independent review of PROC-03 §5. BEH-EN-023 said a per-command budget was called by `@bridger/command` around the command, while the command companion forbids reading `costClass` and had no budget step. Resolved together with command CCR-CM-004: a per-command budget is an application admission policy of the command catalog (command BEH-CM-044) that reserves in `admit`, commits or releases in `settle`, and refuses with `CommandRefused { reason: "budget-exhausted" }`; this package stays independent of `@bridger/command` and ships no admission. **Impact (PROC-03 §3).** (1) Identifiers: BEH-EN-023 amended (requirement added; heading and anchor unchanged); none added or withdrawn. (2) Risk: removes a contradiction between two companions; no score changed. (3) GxP impact: none — no record, gate or audit change. (4) Revalidation: none (implementation absent). (5) Compatibility: no type change in this package; depends on command CCR-CM-004 for `CommandAdmission`. |
| CCR-EN-005 | 2026-11-10 | Round 2 findings of the specification audit of 2026-11-09 (SPEC-AUDIT-02), finding P13 and a low finding. This is an agent review, not the independent review of PROC-03 §5. P13: `EntitlementOptions`, whose `onUnavailable` is required, had no way to reach the package, so the gate's check of `checkTimeout` "of the `Entitlement` service" had nothing to read; the adapter's fallback mode had no field; `EntitlementGate.check` and `Entitlement.inspect` were required but not declared or listed. Resolved: the application's adapter is `EntitlementAdapter`, and `Entitlement.layer(adapter, options)` provides the `Entitlement` service with the adapter's `check` and `watch` unchanged and its `options`, failing with `EntitlementConfigError` for "last-known" without `staleAfter` (BEH-EN-001); `EntitlementState.fallbackMode` (BEH-EN-003, BEH-EN-004); `EntitlementGate.check(request, options)` declared (BEH-EN-009) and `EntitlementInspection` defined (BEH-EN-014); overview rows and worked example completed. Low: ADR-EN-002 no longer cites a settled open item of 02 as a live fallback. **Impact (PROC-03 §3).** (1) Identifiers: none added or withdrawn; BEH-EN-001, 003, 004, 009, 011, 014 and 024 (checks 1, 4, 8) amended; ADR-EN-002 amended. (2) Risk: no score changed; RSK-BR-014's control (no default answer, `onUnavailable` stated) now has a place to be stated. (3) GxP impact: none — no record, gate decision or audit change; the gate refuses and allows exactly as before. (4) Revalidation: none (implementation absent). (5) Compatibility: draft-to-draft; the port the application implements is renamed `EntitlementAdapter`, the `Entitlement` service gains `options` and is built only by `Entitlement.layer`; `EntitlementState` gains `fallbackMode`; `EntitlementGate` gains `check`. |
| CCR-EN-006 | 2026-11-10 | Round 3 findings of the specification audit of 2026-11-10 (SPEC-AUDIT-03; this is an agent review, not the independent review of PROC-03 §5). M25: `Entitlement.guard` had to require the `Entitlement` service, but its signature did not and plugins, where the overview calls it, cannot require it; `guard` now reads the mode from the activation's `Plugin.Runtime.entitled`, passed as `options.entitled`, takes the application's essential labels as `options.essential` (it cannot check they are the application's), counts in the package's process-local `inspect` counters (`EntitlementInspection` gains `essentialOverdraft` and `narrowed`, the counts 03 and 04 already required), requires no service of this package, and treats core's "unmetered" and "unknown" as allowing only essential uses; it leaves BEH-EN-001's list of components that require the service, and the overview example passes `rt.entitled` (BEH-EN-001, BEH-EN-014). M26: with defaults `Entitlement.capabilityPolicy` always failed to build, `checkTimeout` defaulting to 5 seconds while it must be shorter than core's 5-second `resolutionTimeout`; the default is now 4 seconds (BEH-EN-005, BEH-EN-025). Low finding: naming drift after the rename to `EntitlementAdapter` corrected (BEH-EN-009, BEH-EN-024, BEH-EN-032, README).<br>**Impact (PROC-03 §3).** (1) Identifiers: none added or withdrawn; BEH-EN-001, 005, 009, 014, 024 (check 12), 025 and 032 (check 17) amended. (2) Risk: bears on RSK-BR-014 (a plugin's own read-only switch no longer depends on a service it cannot require); no risk added or re-scored. (3) GxP impact: none. (4) Revalidation: nothing released (implementation absent); the planned checks 12 and 17 cover the changes. (5) Compatibility: draft API changes — `guard` takes `options.entitled`; `checkTimeout` default 4 seconds; no core type changed. |
| CCR-EN-007 | 2026-11-10 | Round 4 findings of the specification audit of 2026-11-10 (SPEC-AUDIT-04), entitlement side. This is an agent review, not the independent review of PROC-03 §5. **Findings resolved.** E1 (`guard` named the plugin from the fiber's principal, but a provided method runs under its caller's, none for application code): `guard` takes the activation's `Plugin.Runtime` as `options.runtime`, decides only on its `entitled` and names the plugin from its `principal`; the "no-principal" path and counter are removed (BEH-EN-014). E2 (`guard` trusted an optional caller-supplied essential list while INV-EN-005 promised essential uses are never refused): `Entitlement.layer` records the application's `essential` list in the package's process-local state, `guard` reads it, and `options.essential` may only add labels (BEH-EN-001, BEH-EN-014, INV-EN-005). E3 (`guard` waited without bound for the first state, and "last-known" had no first state): `guard` takes `checkTimeout`, default 4 seconds, after which it fails `NotEntitled` with mode "unknown"; under "last-known" with no answer ever known the derived `watch` serves mode "unknown" with `stale: true`, which allows only essential uses and narrows grants as `none` (BEH-EN-003, BEH-EN-005, BEH-EN-013, BEH-EN-014, BEH-EN-027). E4 (`Entitlement.contributionPolicy` and `Budget.contributionPolicy` require services a plugin cannot require): a hook point that uses them is made by application code, stated as a documentation requirement (BEH-EN-016, BEH-EN-023). Check 12 amended (BEH-EN-024).<br>**Impact (PROC-03 §3).** (1) Identifiers: none added or withdrawn; BEH-EN-001, 003, 005, 013, 014, 016, 023, 024 (check 12) and 027, INV-EN-005 amended. (2) Risk: bears on RSK-BR-014 (a guarded call can no longer hang or be attributed to the wrong plugin, and the essential list is the application's); no risk added or re-scored. (3) GxP impact: none; no record changes. (4) Revalidation: nothing released (implementation absent); check 12 covers the changes. (5) Compatibility: draft API changes — `guard` takes `runtime` in place of `entitled`, and `checkTimeout`; `EntitlementInspection.noPrincipal` removed; `EntitlementState.mode` may be "unknown" from the package; no core type changed. |
