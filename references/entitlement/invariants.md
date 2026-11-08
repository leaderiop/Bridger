# Runtime Invariants

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-EN-INV                                               |
> | Revision       | 0.3                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification (companion)                         |
> | Change History | 0.3 (2026-11-08): Round 2: recheck item 16; core alignment — INV-EN-002 covers grant narrowing; INV-EN-005 names the contribution policies and grant narrowing; INV-EN-006 and INV-EN-007 added (CCR-EN-003)<br>0.2 (2026-11-08): INV-EN-001: `enable` never refused, `replace` only under `onReplace: "consult"`; INV-EN-005 names the skip policies (CCR-EN-002)<br>0.1 (2026-11-08): Initial draft (CCR-EN-001)                 |

---

Properties of `@bridger/entitlement` that hold for every execution. As in
core ([invariants](../core/invariants.md)), nothing below is implemented:
every **Source** is *(Planned)*, every **Verification** is *(Planned)*, and no
invariant may be cited as evidence until a test that checks it has been
written and executed
([ADR-BR-035](../core/decisions/035-evidence-from-executed-tests.md)).

## INV-EN-001: Taking a plugin away is never refused for entitlement

No component of the package refuses, delays or conditions `remove`,
`disable`, `enable`, `retry`, `restart`, `reconfigure` or any operation other
than `install` and — only when the application states `onReplace:
"consult"` — `replace`; `shutdown` and system transitions never reach it.

**Source**: `packages/entitlement/src/EntitlementGate.ts` *(Planned)* — the
gate piece answers Allow for every operation outside a fixed list of two
(`install`, and `replace` under `onReplace: "consult"`), before any call to the
port.

**Implication**: a lapse or an outage of the licence service can never keep
a plugin installed against an operator's decision to remove it, nor prevent
recovery of a failed plugin whose essential work must continue.

**Verification** *(Planned)*: a table-driven test over every `Operation` with
the port scripted to `none` and to unavailable; a mutation test that adds an
operation to the gated list must fail it.

**Related**: [BEH-EN-009](behaviors/02-gate-and-runtime.md#beh-en-009-the-entitlement-gate-is-a-gate-piece-for-granting-operations), [BEH-EN-012](behaviors/02-gate-and-runtime.md#beh-en-012-removal-disabling-recovery-and-shutdown-are-never-refused), [ADR-EN-001](decisions/001-entitlement-changes-modes-not-state.md), [ADR-EN-002](decisions/002-runtime-stream-and-gate-only.md).

---

## INV-EN-002: A lapse never changes plugin state by itself

No change of entitlement state — including to `none`, and including
unavailability — causes the package to call a host operation or
`reportFailure`, or to interrupt a lease, fiber or call.

**Source**: `packages/entitlement/src/Entitlement.ts` and
`EntitlementView.ts` *(Planned)* — the package holds no reference to
`Bridger.Host` and no access to `Plugin.Runtime.reportFailure`; mode changes
are published on streams only.

When grants are narrowed (INV-EN-006), the package's only effect on a
running plugin is a `ResolveAgain` element on core's `CapabilityPolicy`
stream; core keeps the plugin's state and calls in progress as they are
(core BEH-BR-281).

**Implication**: calls in flight finish under the lease guarantees of core,
and every plugin-set change in the trail has an accountable operator call
behind it.

**Verification** *(Planned)*: a `TestHost` scenario that lapses a plugin to
`none` while leases are held and asserts unchanged snapshots and no new audit
records; a dependency check that the package's runtime code does not import
the host's mutating API.

**Related**: [BEH-EN-003](behaviors/01-entitlement-port.md#beh-en-003-the-entitlementstate-and-its-four-modes), [BEH-EN-004](behaviors/01-entitlement-port.md#beh-en-004-expiry-and-grace-are-evaluated-against-clock), [BEH-EN-015](behaviors/02-gate-and-runtime.md#beh-en-015-a-lapse-never-changes-plugin-state), [ADR-EN-001](decisions/001-entitlement-changes-modes-not-state.md).

---

## INV-EN-003: An uncommitted reservation is released when its scope closes

Every reservation is settled exactly once — committed, released, or released
on scope close or `ttl` expiry — and a reservation whose scope closes
unsettled returns its whole amount.

**Source**: `packages/entitlement/src/Budget.ts` *(Planned)* — `reserve` is an
`Effect.acquireRelease` whose release settles the reservation if not yet
settled; settlement is a compare-and-set on the reservation's state, keyed by
its id.

**Implication**: interrupted work, failed calls and stopped plugins never
leak budget, and a retried commit never charges twice.

**Verification** *(Planned)*: property test over generated interleavings of
reserve, commit, release, interruption and `ttl` expiry under `TestClock`,
asserting conservation of each limit.

**Related**: [BEH-EN-019](behaviors/03-budgets.md#beh-en-019-commit-release-and-release-on-scope-close), [BEH-EN-023](behaviors/03-budgets.md#beh-en-023-budgets-hook-points-and-per-command-budgets), [ADR-EN-003](decisions/003-budgets-are-scoped-reservations.md).

---

## INV-EN-004: Reserved plus committed never exceeds a limit

For every limit and period, the sum of outstanding reservations and committed
amounts never exceeds the limit's amount, and no remaining amount goes below
zero; overruns and essential overdrafts are counted separately, never hidden.

**Source**: `packages/entitlement/src/Budget.ts` *(Planned)* — all limits that
apply to a key are updated in one atomic step (`Ref`/`STM`-style
transaction), refusing when any would be exceeded.

**Implication**: concurrent callers cannot together overspend a limit inside
one `Budget`, and every excess that did happen is visible.

**Verification** *(Planned)*: concurrent property test with many fibers
reserving against overlapping label sets; unit tests of overrun and essential
overdraft counters.

**Related**: [BEH-EN-018](behaviors/03-budgets.md#beh-en-018-a-reservation-debits-every-applicable-limit-atomically), [BEH-EN-019](behaviors/03-budgets.md#beh-en-019-commit-release-and-release-on-scope-close), [BEH-EN-020](behaviors/03-budgets.md#beh-en-020-exhaustion-is-a-typed-outcome-essential-uses-are-never-refused), [ADR-EN-003](decisions/003-budgets-are-scoped-reservations.md).

---

## INV-EN-005: Essential uses are never refused by entitlement or budget helpers

A use that carries an application-declared essential label is never refused,
degraded, skipped, denied or narrowed by the gate piece, `guard`,
`Entitlement.contributionPolicy`, `Entitlement.capabilityPolicy`, `reserve` or
`Budget.contributionPolicy`, and every such pass in a mode or budget state that would
otherwise refuse is counted.

**Source**: `packages/entitlement/src/essential.ts` *(Planned)* — one shared
predicate consulted first by every component, with a per-label counter.

**Implication**: work the application declares it must always perform cannot
be blocked by a lapse, an outage or an exhausted quota, and the application
can see how often it relied on that.

**Verification** *(Planned)*: one parameterised test per component in modes
`none` and `read-only` and with exhausted budgets; mutation test removing the
predicate from any component must fail.

**Related**: [BEH-EN-007](behaviors/01-entitlement-port.md#beh-en-007-essential-labels-are-never-refused-by-this-package), [BEH-EN-010](behaviors/02-gate-and-runtime.md#beh-en-010-the-decision-rule-and-its-refusal-reasons), [BEH-EN-014](behaviors/02-gate-and-runtime.md#beh-en-014-a-plugin-switches-itself-to-read-only-and-guard-helps-it), [BEH-EN-016](behaviors/02-gate-and-runtime.md#beh-en-016-entitlement-of-hook-point-contributions-is-a-contribution-policy-of-the-hook-point), [BEH-EN-020](behaviors/03-budgets.md#beh-en-020-exhaustion-is-a-typed-outcome-essential-uses-are-never-refused), [ADR-EN-001](decisions/001-entitlement-changes-modes-not-state.md).

---

## INV-EN-006: Grant narrowing never refuses a capture and never widens a grant

`Entitlement.capabilityPolicy` answers every resolution with the inner
policy's answer — its refusal unchanged, or a grant whose members are a subset
of the inner grant's — and never with a refusal or a defect of its own; its
re-resolution stream never ends while its scope is open.

**Source**: `packages/entitlement/src/CapabilityPolicy.ts` *(Planned)* — the
answer is computed as an intersection with the inner grant; no code path
constructs `ResolutionRefused`.

**Implication**: a lapse cannot fail a plugin's activation or give it a member
the application's own policy withheld, and grants keep following the
entitlement state for the host's life.

**Verification** *(Planned)*: property test over generated inner grants,
classifications and modes asserting the subset relation; a scripted port that
fails and hangs asserting no refusal and a live stream.

**Related**: [BEH-EN-025](behaviors/04-grant-narrowing-and-usage.md#beh-en-025-entitlementcapabilitypolicy-wraps-the-applications-policy-and-never-refuses-for-entitlement), [BEH-EN-027](behaviors/04-grant-narrowing-and-usage.md#beh-en-027-the-grant-rule-for-each-mode), [BEH-EN-028](behaviors/04-grant-narrowing-and-usage.md#beh-en-028-a-lapse-re-resolves-the-plugins-live-captures-and-renewal-restores-them), [ADR-EN-004](decisions/004-a-lapse-narrows-capability-grants.md).

---

## INV-EN-007: A hook call's reservation is settled once, by its outcome

Each reservation `Budget.contributionPolicy` holds for a hook call is settled
exactly once: committed when the call's outcome is not in `refundOn`, released
when it is, or released and counted as expired at `ttl` when no `settle`
reaches it.

**Source**: `packages/entitlement/src/policies.ts` *(Planned)* — the settle
step takes one outstanding reservation of the contribution and key and settles
it through the idempotent `commit`/`release` of BEH-EN-019.

**Implication**: a quota is charged only for hook calls that did their work,
and never charged twice for one call.

**Verification** *(Planned)*: `TestHost` scenarios for each settle outcome and
for a later policy that passes over a reserved call; conservation property of
each limit across generated dispatches.

**Related**: [BEH-EN-030](behaviors/04-grant-narrowing-and-usage.md#beh-en-030-a-hook-calls-budget-is-reserved-at-admission-and-settled-after-the-call), [BEH-EN-023](behaviors/03-budgets.md#beh-en-023-budgets-hook-points-and-per-command-budgets), [ADR-EN-003](decisions/003-budgets-are-scoped-reservations.md).
