# 03 — Budgets

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-EN-BEH-03                                            |
> | Revision       | 0.9                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.9 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-05) — check 12: `guard` names the plugin by `pluginId` and `realm`, and counts refusals under the canonical key (PL15) (CCR-EN-008)<br>0.8 (2026-11-10): BEH-EN-023: a hook point using `Budget.contributionPolicy` is made by application code (E4); BEH-EN-024: check 12 covers `guard` on the passed runtime, the layer's essential list and `checkTimeout`, and "unknown" under "last-known" (E1-E3) (SPEC-AUDIT-04) (CCR-EN-007)<br>0.7 (2026-11-10): BEH-EN-024: check 12 covers `guard` reading the mode from `Plugin.Runtime.entitled` without the `Entitlement` service (M25); checks run with the scripted `EntitlementAdapter` (low finding) (CCR-EN-006)<br>0.6 (2026-11-10): Acceptance checks 1, 4 and 8 cover `Entitlement.layer` and its option checks, `fallbackMode` and `EntitlementGate.check` (P13) (CCR-EN-005)<br>0.5 (2026-11-09): Specification audit of 2026-11-09 (C-10) — BEH-EN-023: a per-command budget is an application admission policy of the command companion (command BEH-CM-044), reserving at admission and committing or releasing at its settlement, with exhaustion surfaced as `CommandRefused { reason: "budget-exhausted" }`; the package stays independent of `@bridger/command` (CCR-EN-004)<br>0.4 (2026-11-08): Round 2: recheck item 16; core alignment — BEH-EN-023 uses core `HookPointOptions.policy` and `settle` through `Budget.contributionPolicy`, which reserves at admission and settles after the call (04, BEH-EN-030), replacing `Budget.skipPolicy` (G63 closed in core); check 14 updated; Open (3) settled (CCR-EN-003)<br>0.3 (2026-11-08): `Budget.skipPolicy` for `HookPointOptions.skip` replaces `hookQuota`, charged at admission; acceptance checks 8–11 and 14 updated (CCR-EN-002)<br>0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-EN-001)<br>0.1 (2026-11-08): Initial draft (CCR-EN-001)                 |

---

Entitlement says whether a plugin may do something; a budget says how much.
A partner integration allowed so many calls a day, an agent task allowed so
many model tokens, a contribution allowed so much time per period: each is a
quantity drawn down by use. This file specifies `Budget`, a meter built on
**reservations**: reserve before the work, commit what was used, release
the rest — automatically when the reservation's scope closes. Keys are
opaque labels the application chooses, and exhaustion is a typed outcome the
caller handles, not a failure of the plugin
([ADR-EN-003](../decisions/003-budgets-are-scoped-reservations.md)). The file
ends with the package's required acceptance checks for files 01–03; file 04
adds its own (BEH-EN-032). This file owns
BEH-EN-017–024 and uses all eight.

> **What this package does not do — and who does**
>
> `Budget` is **not billing**. Without a ledger it counts per process, so two
> hosts can together spend twice a limit; with a ledger, exactness is the
> ledger's. Anything charged to anyone, prices, invoices and reconciliation
> with a payment system are the consumer's responsibility. Time bounds on a
> hook dispatch are the hook point's deadline (31 — Hook points), not a
> budget.

Planned source: `packages/entitlement/src/Budget.ts`,
`packages/entitlement/src/BudgetLedger.ts` *(Planned)*.

## BEH-EN-017: Budget keys are opaque labels and a unit

> **See:** [ADR-EN-003](../decisions/003-budgets-are-scoped-reservations.md)
> **Satisfies:** [URS-BR-026](../../core/urs.md#urs-br-026-know-which-compliance-obligations-remain-mine)

```ts
// illustrative — not type-checked
interface BudgetKey {
  readonly labels: Readonly<Record<string, string>>     // opaque: e.g. { org: "o-1", plugin: "p", task: "t-9" }
  readonly unit: string                                 // opaque: e.g. "tokens", "calls", "ms"
}
interface BudgetLimit {
  readonly match: Readonly<Record<string, string>>      // a limit applies to every key whose labels include these
  readonly unit: string
  readonly amount: number                               // ≥ 0, per period
  readonly period?: Duration.Input                      // absent: never resets
}
interface BudgetShape {
  readonly reserve: (key: BudgetKey, amount: number, options?: ReserveOptions) =>
    Effect.Effect<Reservation, BudgetExhausted | BudgetUnavailable, Scope.Scope>
  readonly tryReserve: (key: BudgetKey, amount: number, options?: ReserveOptions) =>
    Effect.Effect<Option.Option<Reservation>, BudgetUnavailable, Scope.Scope>
  readonly remaining: (key: BudgetKey) => Effect.Effect<readonly LimitRemaining[]>
  readonly changes: Stream.Stream<BudgetChange>           // latest-wins per limit
}
class Budget extends Context.Service<Budget, BudgetShape>()("@bridger/entitlement/Budget") {}
```

```
REQUIREMENT: The package MUST treat label keys, label values and units as
             opaque strings, compared for equality only. A limit applies to a
             key when the units are equal and every label of `match` is
             present in the key with an equal value.
```

```
REQUIREMENT: `Budget.layer(limits)` MUST take its limits from the
             application. The package MUST NOT ship default limits, and a
             key to which no limit applies MUST be reserved without limit
             and counted as "unlimited" in `remaining`.
```

Matching by label subset is what makes one reservation count against
several budgets at once — an organisation's total, a plugin's share of it,
a task's share of that — without Bridger knowing which label is an
organisation and which a task.

## BEH-EN-018: A reservation debits every applicable limit, atomically

> **Invariant:** [INV-EN-004](../invariants.md#inv-en-004-reserved-plus-committed-never-exceeds-a-limit)
> **See:** [ADR-EN-003](../decisions/003-budgets-are-scoped-reservations.md)
> **Satisfies:** [URS-BR-026](../../core/urs.md#urs-br-026-know-which-compliance-obligations-remain-mine)

```ts
// illustrative — not type-checked
interface ReserveOptions {
  readonly essential?: readonly string[]     // essential labels of this use (01, BEH-EN-007)
  readonly ttl?: Duration.Input              // default 5 minutes
}
```

```
REQUIREMENT: `reserve` MUST either debit `amount` from every limit that
             applies to the key, or debit none. It MUST fail with
             `BudgetExhausted` when any applicable limit has less than
             `amount` remaining (limit minus reserved minus committed in the
             current period).
```

```
REQUIREMENT: Concurrent reservations against the same limit MUST be
             linearized: no interleaving MAY let the sum of reserved and
             committed amounts exceed a limit, except as BEH-EN-020 allows
             for essential uses.
```

```
REQUIREMENT: `amount` MUST be a finite number ≥ 0; anything else MUST fail
             with a defect, not with `BudgetExhausted`.
```

Reserving before the work, rather than counting after it, is what lets a
caller know before it starts whether it may — an agent turn is not started
only to be cut off half-way because the meter ran out.

## BEH-EN-019: Commit, release, and release on scope close

> **Invariant:** [INV-EN-003](../invariants.md#inv-en-003-an-uncommitted-reservation-is-released-when-its-scope-closes)
> **See:** [ADR-EN-003](../decisions/003-budgets-are-scoped-reservations.md)
> **Satisfies:** [URS-BR-005](../../core/urs.md#urs-br-005-never-lose-a-provider-in-the-middle-of-a-call)

```ts
// illustrative — not type-checked
interface Reservation {
  readonly id: string                                   // from IdGenerator
  readonly amount: number
  readonly commit: (actual: number) => Effect.Effect<CommitResult>
  readonly release: Effect.Effect<void>
}
interface CommitResult { readonly committed: number; readonly overrun: number }
```

```
REQUIREMENT: `commit(actual)` MUST debit `min(actual, amount)` as committed
             and return the remainder of the reservation to every limit.
             When `actual` exceeds `amount`, the excess MUST be debited as
             far as every applicable limit allows and the rest MUST be
             reported as `overrun` and counted per limit; no limit MAY go
             below zero.
```

```
REQUIREMENT: `commit` and `release` MUST be idempotent per reservation id:
             the first one to complete decides, and later calls MUST return
             the first result without debiting again.
```

```
REQUIREMENT: When the reservation's scope closes before `commit` or
             `release`, the whole reservation MUST be released. A
             reservation not settled within its `ttl`, read from `Clock`,
             MUST be released and counted as "expired".
```

The scope is what makes a reservation leak-proof in the ordinary sense: an
interrupted call, a failed model request, a plugin stopped mid-work — each
closes the scope, and the reserved amount returns. Idempotence per
reservation id is what keeps a retried commit from charging twice, the error
the mission names.

## BEH-EN-020: Exhaustion is a typed outcome; essential uses are never refused

> **Invariant:** [INV-EN-005](../invariants.md#inv-en-005-essential-uses-are-never-refused-by-entitlement-or-budget-helpers), [INV-EN-004](../invariants.md#inv-en-004-reserved-plus-committed-never-exceeds-a-limit)
> **See:** [ADR-EN-003](../decisions/003-budgets-are-scoped-reservations.md), [ADR-EN-001](../decisions/001-entitlement-changes-modes-not-state.md)
> **Satisfies:** [URS-BR-006](../../core/urs.md#urs-br-006-recover-from-failure-explicitly-and-never-silently)

```ts
// illustrative — not type-checked
class BudgetExhausted extends Schema.TaggedError<BudgetExhausted>()("BudgetExhausted", {
  match: Schema.Record({ key: Schema.String, value: Schema.String }),   // the limit that refused
  unit: Schema.String,
  requested: Schema.Number,
  remaining: Schema.Number,
  resetsAt: Schema.optional(Schema.String)                              // ISO-8601 UTC, from Clock
}) {}
```

```
REQUIREMENT: `BudgetExhausted` MUST name the first applicable limit, in the
             application's order, that could not cover the amount. The
             package MUST NOT retry, wait for a reset, or change plugin
             state on exhaustion; the caller decides whether to refuse,
             degrade or wait.
```

```
REQUIREMENT: A reservation whose `essential` labels contain an essential
             label MUST succeed whatever remains. The part of it no limit
             can cover MUST be counted as an essential overdraft per limit
             and label, visible in `remaining` and `Entitlement.inspect`,
             and MUST NOT be debited below zero.
```

Exhaustion is a policy outcome, like a refusal by an approver, not a fault:
nothing is broken, the quota is used up. Keeping it typed lets each caller
choose its degradation — a cheaper model, a cached answer, a message to the
user — and keeping essential uses out of it is the same guarantee 01 gives
for entitlement.

## BEH-EN-021: Periods reset from Clock

> **See:** [ADR-EN-003](../decisions/003-budgets-are-scoped-reservations.md), [ADR-BR-025](../../core/decisions/025-deterministic-time-and-ids.md)
> **Satisfies:** [URS-BR-027](../../core/urs.md#urs-br-027-reproduce-time-and-identifiers-during-validation)
> **Risk:** [RSK-BR-007](../../core/gxp/03-risk-assessment.md#rsk-br-007)

```
REQUIREMENT: A limit with a `period` MUST reset its committed amount at
             each period boundary, measured from the time the `Budget` was
             constructed, read from `Clock`. Outstanding reservations MUST
             carry over into the new period.
```

```
REQUIREMENT: The package MUST NOT read ambient time. Under `TestClock`, a
             reset MUST happen exactly when the test clock crosses the
             boundary.
```

Calendar periods ("per calendar month in a time zone") are deliberately not
offered: they need time-zone rules that differ per deployment, and a
ledger adapter that needs them can implement them behind BEH-EN-022.

## BEH-EN-022: The optional BudgetLedger port

> **See:** [ADR-EN-003](../decisions/003-budgets-are-scoped-reservations.md)
> **Satisfies:** [URS-BR-026](../../core/urs.md#urs-br-026-know-which-compliance-obligations-remain-mine)

```ts
// illustrative — not type-checked
interface BudgetLedgerShape {
  readonly reserve: (r: { id: string; key: BudgetKey; amount: number; essential: boolean }) =>
    Effect.Effect<void, BudgetExhausted | LedgerUnavailable>
  readonly commit: (id: string, actual: number) => Effect.Effect<CommitResult, LedgerUnavailable>
  readonly release: (id: string) => Effect.Effect<void, LedgerUnavailable>
}
class BudgetLedger extends Context.Service<BudgetLedger, BudgetLedgerShape>()("@bridger/entitlement/BudgetLedger") {}
```

```
REQUIREMENT: `Budget` MUST read `BudgetLedger` with `Effect.serviceOption`.
             When wired, every reserve, commit and release MUST go to the
             ledger, keyed by reservation id, and the ledger MUST treat a
             repeated call with the same id as idempotent.
```

```
REQUIREMENT: `onLedgerUnavailable` MUST be stated explicitly when a ledger
             is wired: "refuse" (fail with `BudgetUnavailable`) or "local"
             (account in process and count every such reservation as
             "unreconciled"). Essential reservations MUST succeed under both.
```

```
REQUIREMENT: Documentation MUST state that the in-process `Budget` is not
             billing, and that cross-process exactness, persistence and
             reconciliation are properties of the consumer's ledger.
```

The ledger is where a shared or persisted meter lives — a database row per
limit, a central quota service. Idempotence by id is what makes the same
retry-safety hold across processes as within one.

## BEH-EN-023: Budgets, hook points and per-command budgets

> **See:** [ADR-EN-003](../decisions/003-budgets-are-scoped-reservations.md)
> **Core seam:** [31 — Hook points](../../core/behaviors/31-hook-points.md) (BEH-BR-297–312; `HookPointOptions.policy` and `settle`, BEH-BR-302), [32 — Generic gate and plan](../../core/behaviors/32-generic-gate-and-plan.md) (BEH-BR-313–321)
> **Satisfies:** [URS-BR-014](../../core/urs.md#urs-br-014-contribute-to-a-shared-extension-point-safely)

```ts
// illustrative — not type-checked
declare const Budget: {
  // A ContributionPolicyBundle (02, BEH-EN-016) for HookPointOptions.policy and settle (core 31, BEH-BR-302),
  // given by the hook point's owner. `reserves` is true.
  readonly contributionPolicy: <In>(options: BudgetContributionOptions) =>   // 04, BEH-EN-030
    Effect.Effect<ContributionPolicyBundle<In>, never, Budget>
}
```

```
REQUIREMENT: Before each hook call, the policy MUST reserve `perCall`
             against `key(step.owner)` and MUST answer `Run` when the
             reservation succeeds and `Skip { reason: "budget-exhausted" }`
             when it fails with `BudgetExhausted`. Core then skips the
             contribution without calling it and records it as
             "skipped-policy" with that `skipReason` (core BEH-BR-302,
             BEH-BR-305). The bundle's `settle` step commits or releases the
             reservation after the call (04, BEH-EN-030). A contribution
             whose `step.labels` hold an essential label MUST be reserved
             as an essential reservation (BEH-EN-020) and never skipped.
```

```
REQUIREMENT: The policy MUST NOT fail or die: an unavailable ledger is
             handled by `onLedgerUnavailable` (BEH-EN-022), and with
             "refuse" the policy MUST answer
             `Skip { reason: "budget-unavailable" }`. It MUST NOT answer
             `Deny`. Exhaustion MUST NOT be a hook error, so it is never
             counted by the contribution's circuit breaker (core
             BEH-BR-304).
```

```
REQUIREMENT: The package MUST NOT offer a wrapper around a contributor's
             hook to reserve across the call, which would return results
             core records as the contributor's own (02, BEH-EN-016); the
             reservation spans the call through core's `policy` and
             `settle` steps instead.
```

```
REQUIREMENT: Documentation MUST state that `Budget.contributionPolicy`
             requires the `Budget` service, which a plugin's `build` cannot
             require (core BEH-BR-002), so a hook point that uses it MUST be
             made by application code, as for
             `Entitlement.contributionPolicy` (02, BEH-EN-016).
```

```
REQUIREMENT: The package MUST NOT use a budget to bound time inside a
             dispatch; per-call timeout and per-dispatch deadline remain the
             hook point's. The entitlement gate MUST NOT consult budgets.
```

The three mechanisms answer different questions and stay apart: the
deadline asks "how long may this decision take?", the breaker "is this
contribution faulty?", the quota "has this contribution used its share?". When
a hook point uses both entitlement and a budget, the owner lists the
entitlement bundle first in `Policies.first` (02, BEH-EN-016), so that a
contribution that is not entitled holds no budget; `Policies.first` refuses a
reserving bundle that is not last. Reserving at admission and settling after
the call (04, BEH-EN-030) charges only calls that did their work, through the
`settle` step with which core closed URS gap G63.

```
REQUIREMENT: The package MUST NOT depend on `@bridger/command` and MUST
             NOT ship a command admission. Documentation MUST show a
             per-command budget — a time or cost quota per command
             invocation — as an admission policy the application fixes in
             the command catalog layer (command BEH-CM-044): its `admit`
             calls `reserve` in the admission's scope, with the essential
             labels of the use (BEH-EN-020), and answers `Refuse { reason:
             "budget-exhausted" }` on `BudgetExhausted`; its `settle`
             commits the reservation for a dispatch that did its work and
             releases it otherwise. What a `BudgetUnavailable` answers —
             a refusal "budget-unavailable" or an admission — is the
             application's choice, stated in its policy.
```

The command dispatch then ends with `CommandRefused { reason:
"budget-exhausted" }`, a refusal at the catalog's boundary: never a handler
wrapper failure, never a breaker count, and never a host gate decision. The
reservation lives in the admission's scope, so a dispatch that is
interrupted or never runs its handler returns the amount (BEH-EN-019).

## BEH-EN-024: Required acceptance checks

> **See:** [ADR-EN-001](../decisions/001-entitlement-changes-modes-not-state.md), [ADR-EN-002](../decisions/002-runtime-stream-and-gate-only.md), [ADR-EN-003](../decisions/003-budgets-are-scoped-reservations.md), [ADR-BR-035](../../core/decisions/035-evidence-from-executed-tests.md)
> **Satisfies:** [URS-BR-019](../../core/urs.md#urs-br-019-test-plugin-lifecycles-deterministically-with-injected-faults)
> **Risk:** [RSK-BR-018](../../core/gxp/03-risk-assessment.md#rsk-br-018)

```
REQUIREMENT: The package's test suite MUST contain at least one test for
             each of the following, run on a `TestHost` under `TestClock`
             with the scripted `EntitlementAdapter`:
             1.  The package exports no `EntitlementAdapter`
                 implementation; every component fails to build without the
                 `Entitlement` service; `Entitlement.layer` fails with
                 `EntitlementConfigError` for "last-known" without
                 `staleAfter`, and every component reads the options it was
                 given (BEH-EN-001).
             2.  Labels are compared for equality only; `pluginId` and
                 `realm` come from the target, never from plugin code
                 (BEH-EN-002).
             3.  Mode ordering and "allows" for each mode (BEH-EN-003).
             4.  `full` → `grace` → `fallbackMode` (`read-only` when
                 absent) at `validUntil` and `graceUntil` under `TestClock`,
                 emitted without asking the
                 adapter; no extension of adapter dates (BEH-EN-004).
             5.  `onUnavailable` and `staleAfter` are required; a stale
                 last-known state is served `read-only` with `stale: true`;
                 unavailability never raises a mode (BEH-EN-005, BEH-EN-006).
             6.  Essential labels pass every component in every mode and
                 are counted (BEH-EN-007, BEH-EN-020).
             7.  An entitlement refusal produces exactly one core
                 `rejected` record with the reason, and the package writes
                 nothing to the `AuditSink` (BEH-EN-008, BEH-EN-010).
             8.  The gate consults the port for `install`, and for
                 `replace` only with `onReplace: "consult"`, including
                 `reconcile` entries; it is a core `Gate<OperationRequest>`
                 composed with `Gate.all`; it never returns Defer;
                 `EntitlementGate.check` refuses exactly when the piece does
                 (BEH-EN-009).
             9.  Port unavailability refuses a grant with
                 "entitlement-unavailable" and changes nothing running;
                 `EntitlementGate.piece` fails when `checkTimeout` is not
                 shorter than its `timeout`, and `EntitlementGate.layer`
                 when it is not shorter than the stated `gateTimeout`
                 (BEH-EN-011).
             10. `remove`, `disable`, `enable`, `retry`, `restart`,
                 `reconfigure`, `replace` under `onReplace: "allow"` and the
                 other operations of BEH-EN-012 are allowed in mode `none`
                 (BEH-EN-012).
             11. `Plugin.Runtime.entitled` emits the activation's own state
                 first, follows changes latest-wins, ends with the scope;
                 the package's derived `watch` never ends while the scope is
                 open; an unwired host yields core's mode "unmetered"
                 (BEH-EN-013).
             12. `guard` names the plugin, by `pluginId` and `realm` in
                 `NotEntitled` and by the canonical key in `inspect`'s
                 `refusals`, from the principal of the
                 runtime it is given, also inside a provided method called
                 by application code, reads the mode only from that
                 runtime's `entitled`, in a plugin that does not require the
                 `Entitlement` service, fails with `NotEntitled` without
                 running the effect, under "unmetered" and "unknown" too,
                 and with mode "unknown" when no state arrives within
                 `checkTimeout`; it runs uses labelled with an essential
                 label given to `Entitlement.layer` without waiting, even
                 when its own `essential` option omits that label; under
                 "last-known" with no answer ever known, `watch` serves
                 mode "unknown" with `stale: true` (BEH-EN-005,
                 BEH-EN-014).
             13. A lapse to `none` while calls hold leases changes no
                 plugin state, interrupts nothing, and calls no host
                 operation (BEH-EN-015).
             14. `Entitlement.contributionPolicy` and
                 `Budget.contributionPolicy` as a hook point's `policy`: a
                 not-entitled contribution under `onNotEntitled: "skip"` or
                 an exhausted one is not called and is recorded
                 "skipped-policy" with its `skipReason`, distinct from a
                 pass; a not-entitled veto contribution under "deny" ends
                 the dispatch with `Denied { cause: "denied-policy" }` and
                 an enrich or advisory one is recorded "skipped-policy";
                 a not-entitled declaration is not woken; no breaker count;
                 no denial from `onError: "deny"`; essential labels never
                 skipped or denied; `Policies.first` consults in order and
                 an entitlement answer other than `Run` holds no budget;
                 neither policy fails when its port is unavailable
                 (BEH-EN-016, BEH-EN-023).
             15. `reserve` debits every matching limit or none, under
                 concurrent reservations never exceeding a limit;
                 `BudgetExhausted` names the limit (BEH-EN-017, BEH-EN-018,
                 BEH-EN-020).
             16. Commit and release are idempotent; scope close and `ttl`
                 release; overrun is counted and no limit goes below zero;
                 periods reset under `TestClock`; ledger idempotence and
                 `onLedgerUnavailable` (BEH-EN-019, BEH-EN-021,
                 BEH-EN-022).
```

These checks are the acceptance scenarios `REQ-EN-001`–`REQ-EN-016` of
[traceability §2](../traceability.md#2-acceptance-scenarios). None has been
written or run; none is evidence yet.

**Settled here.** (1) Budgets are reservations with scoped release and
idempotent settlement. (2) Limits match by label subset; no default limits.
(3) Exhaustion is a typed outcome, never a plugin failure, never a breaker
count. (4) Essential reservations always succeed and are counted as
overdraft. (5) Periods are durations from construction, not calendar
periods.

**Open.** (1) Whether a reservation may be extended (`reserveMore`) for
streaming work whose cost is not known up front. (2) Whether a gate piece
for host operations should ever consult budgets (for example, a cap on
installs per period); this file says no. (3) Refunding a hook call's charge,
open in revision 0.3, is settled by core's `settle` step (04, BEH-EN-030).

---

_Previous: [02 — Gate and Runtime](./02-gate-and-runtime.md)_
