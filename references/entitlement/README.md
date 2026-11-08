# Bridger Entitlement — Specification

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-EN-00                                                |
> | Revision       | 0.3                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification — Master Index (companion)          |
> | Change History | 0.3 (2026-11-08): Register row CCR-EN-002 (resolutions of the agent review of 2026-11-08); dependency rows corrected (CCR-BR-020 typo); Open questions section (CCR-EN-002)<br>0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-EN-001)<br>0.1 (2026-11-08): Initial draft (CCR-EN-001)                 |

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
  entitled is the answer of the application's `Entitlement` adapter, which
  this package passes through and never second-guesses;
- does **not** enforce read-only mode inside plugin code — in-process code is
  trusted and is not isolated; a plugin switches itself to read-only, and the
  helpers here make that easy and checkable, not unavoidable;
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

### Decisions

| ID | Decision |
| -- | -------- |
| [ADR-EN-001](./decisions/001-entitlement-changes-modes-not-state.md) | Entitlement changes a plugin's mode, never its lifecycle state |
| [ADR-EN-002](./decisions/002-runtime-stream-and-gate-only.md) | Entitlement reaches plugins through `Plugin.Runtime.entitled` and host operations only through the gate |
| [ADR-EN-003](./decisions/003-budgets-are-scoped-reservations.md) | Budgets are scoped reservations over opaque labels; exhaustion is a policy outcome |

## Dependencies on core

| Core seam | What this package uses | Defined by |
| --------- | ---------------------- | ---------- |
| [25 — Operation gate](../core/behaviors/25-operation-gate.md) | `OperationGate`, `OperationRequest`, `OperationRejected`; fail-closed on gate defects | core (existing) |
| [32 — Generic gate and plan](../core/behaviors/32-generic-gate-and-plan.md) | `Gate<Req>` with Allow / Refuse / Defer; composition of gates; `OperationGate` as one instance | CCR-BR-019 |
| [31 — Hook points](../core/behaviors/31-hook-points.md) | `HookPoint`, failure policy, veto/advisory, per-contribution breaker, decision record; `HookPointOptions.skip` and the "skipped-policy" outcome (BEH-BR-302) for the skip policies | CCR-BR-019 |
| [28 — Plugin principal and mandatory policy](../core/behaviors/28-plugin-principal-and-mandatory-policy.md) | `CurrentPlugin` (for the alternative of BEH-EN-013, Open) | CCR-BR-018 |
| [10 — Runtime failure and health](../core/behaviors/10-runtime-failure-and-health.md) | `Plugin.Runtime` and its `entitled` member with the optional `EntitlementView` port, core modes `unmetered` and `unknown` (BEH-BR-089; see BEH-EN-013) | CCR-BR-020, CCR-BR-022 |
| [18 — Reconciliation and confluence](../core/behaviors/18-reconciliation-and-confluence.md) | per-entry gating of `reconcile` | core (existing) |

## Open questions

Residual questions this package cannot settle within the current core; each is
for core's change control, not decided here.

1. **A policy denial of a hook dispatch.** Core's skip policy can only skip a
   contribution (BEH-BR-302); its decision record has no outcome such as
   "denied-policy". A hook point whose owner wants an unlicensed veto
   contribution to block the dispatch, recorded as a policy decision rather
   than as the contributor's veto, cannot express it; this package skips
   (BEH-EN-016).
2. **Charging a hook call after it ends.** The skip policy runs before a hook
   call and core offers no step after it, so a budget charge cannot be
   returned when the call fails or times out (BEH-EN-023).

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
| CCR-EN-002 | 2026-11-08 | Resolutions of the agent review of 2026-11-08 (review R4, findings EN-M1, EN-m1, EN-m2, EN-m3), aligned with core CCR-BR-022: hook entitlement and quotas are `Entitlement.skipPolicy` and `Budget.skipPolicy` for the hook point's `HookPointOptions.skip`, combined with `Skip.first`, recorded by core as "skipped-policy"; the `hookPolicy` and `hookQuota` wrappers and their deny variant are withdrawn (EN-M1); `enable` is no longer entitlement-gated and `replace` is consulted only under the required `onReplace` option (EN-m1); `checkTimeout` is checked against the piece's own `timeout` by `EntitlementGate.piece`, and the composite `gateTimeout` bound is documented (EN-m2); the overview no longer calls the core seam missing, and the dependency row cites CCR-BR-020 (EN-m3); core's `unmetered` and `unknown` modes replace the `unmetered: true` flag (core BEH-BR-089). Open questions recorded above.<br>**Impact (PROC-03 §3).** (1) Identifiers: none added or withdrawn; BEH-EN-007, 009, 011–013, 016, 023, 024, INV-EN-001, INV-EN-005, ADR-EN-002 amended; the heading of BEH-EN-016 changed. (2) Risk: bears on RSK-BR-046 (fewer operations refusable for entitlement; a security-fix replace refusable only by the application's choice); no score changed by this record. (3) GxP impact: indirect — which host operations the gate piece can refuse changes, and hook skips are recorded as policy skips. (4) Revalidation: nothing released (implementation absent); REQ-EN-008–011 and REQ-EN-014 updated. (5) Compatibility: draft API changes (`hookPolicy`, `hookQuota` replaced; `EntitlementGateOptions.onReplace` required; `piece` added; `layer` takes `gateTimeout`); no core type changed. |
| CCR-EN-001 | 2026-11-08 | Initial draft of the companion: `Entitlement` port with opaque subject labels and a full → grace → read-only → none state read from `Clock`; `onUnavailable` policy; no default implementation; entitlement gate consulted for granting operations only, never for `remove`, `disable`, `shutdown` or system transitions; `Plugin.Runtime.entitled` stream (proposed core seam); `Entitlement.guard` and application-declared essential labels; `Budget.reserve` with scoped commit and release over opaque labels, `BudgetExhausted`, optional `BudgetLedger`; interplay with hook points. Behaviours BEH-EN-001–024, invariants INV-EN-001–005, decisions ADR-EN-001–003, acceptance scenarios REQ-EN-001–016.<br>**Impact (PROC-03 §3).** (1) Identifiers: all added; nothing amended or withdrawn in this tree; the core amendment it needs (`Plugin.Runtime.entitled`, an optional core port) is proposed for registration under a `CCR-BR` by the integration agent and is not made here. (2) Risk: new hazards proposed for the core register (an entitlement lapse that blocks an essential operation or stops a plugin; a stale entitlement answer granting too much) — see [traceability §3](./traceability.md#3-risk-notes); no core score changed. (3) GxP impact: indirect — entitlement refusals of host operations are gate refusals and so produce core `rejected` records (BEH-BR-220); no record field or `schemaVersion` changes. (4) Revalidation: no version has been released or qualified (implementation absent); none. (5) Compatibility: no core public type changes until the proposed `entitled` member is accepted; a host with no entitlement port wired behaves as before. |
