# 04 — Grant Narrowing and Usage

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-EN-BEH-04                                            |
> | Revision       | 0.5                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification (companion)                         |
> | Change History | 0.5 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-06) — BEH-EN-027: narrowed answers are counted per plugin id and realm; check 19 follows (PL15) (CCR-EN-009)<br>0.4 (2026-11-10): BEH-EN-027: mode "unknown" (no answer known) narrows as `none` (E3) (SPEC-AUDIT-04) (CCR-EN-007)<br>0.3 (2026-11-10): BEH-EN-025 notes that the default `checkTimeout` of 4 seconds is shorter than core's default `resolutionTimeout` (M26); BEH-EN-032: check 17 builds with the defaults (M26), checks run with the scripted `EntitlementAdapter` (low finding) (CCR-EN-006)<br>0.2 (2026-11-08): BEH-EN-030: a reservation for a declaration whose wake fails or times out is released at `ttl` and counted "expired", with `ttl` recommended just above the wake window plus the hook `timeout`; the package relies on core asking `policy` once per declaration per dispatch; check 22 extended (round-2 agent review R3-17) (CCR-EN-003)<br>0.1 (2026-11-08): Initial draft (CCR-EN-003)                 |

---

Files 01–03 tell a running plugin its mode and leave read-only to the plugin.
This file adds the half that does not depend on the plugin's cooperation:
**grant narrowing**. When a plugin's effective mode falls to `read-only` or
`none`, the package re-resolves the plugin's live captures through core's
`CapabilityPolicy.changes`
([29 — Capability grants and call log](../../core/behaviors/29-capability-grants-and-call-log.md),
BEH-BR-273, BEH-BR-275, BEH-BR-281), so that later calls the plugin makes
through the services it captured reach only the members the application
classed as read-only; renewal restores them. It never refuses a capture and
never changes plugin state, so [INV-EN-002](../invariants.md#inv-en-002-a-lapse-never-changes-plugin-state-by-itself)
still holds ([ADR-EN-004](../decisions/004-a-lapse-narrows-capability-grants.md)).
The file also specifies the refund of a hook call's budget charge through
core's `settle` step (BEH-BR-302) and a usage export of `Budget`. This file
owns BEH-EN-025–032 and uses all eight.

> **What this package does not do — and who does**
>
> Narrowing changes the objects core built for a plugin's captures. It is
> not isolation: in-process plugin code can hold references obtained
> elsewhere, values a granted member returns are delivered as returned, and
> code in the host's process can defeat any in-process check (core
> BEH-BR-275, BEH-BR-278, BEH-BR-281). A plugin whose writes must be
> prevented runs out of process behind a proxy plugin
> ([references/remote/](../../remote/README.md)); the proxy's own captures
> are what this file narrows. Which members are read-only is the
> application's classification, never the package's guess.

Planned source: `packages/entitlement/src/CapabilityPolicy.ts`,
`packages/entitlement/src/readOnly.ts`, `packages/entitlement/src/policies.ts`,
`packages/entitlement/src/usage.ts` *(Planned)*.

## BEH-EN-025: Entitlement.capabilityPolicy wraps the application's policy and never refuses for entitlement

> **Invariant:** [INV-EN-006](../invariants.md#inv-en-006-grant-narrowing-never-refuses-a-capture-and-never-widens-a-grant), [INV-EN-002](../invariants.md#inv-en-002-a-lapse-never-changes-plugin-state-by-itself)
> **See:** [ADR-EN-004](../decisions/004-a-lapse-narrows-capability-grants.md), [ADR-BR-044](../../core/decisions/044-capability-policy-and-call-log-ports.md)
> **Core seam:** [29 — Capability grants and call log](../../core/behaviors/29-capability-grants-and-call-log.md) (BEH-BR-273, BEH-BR-274, BEH-BR-275, BEH-BR-281)
> **Satisfies:** [URS-BR-034](../../core/urs.md#urs-br-034-narrow-and-log-what-each-plugin-can-call)
> **Risk:** [RSK-BR-029](../../core/gxp/03-risk-assessment.md#rsk-br-029), [RSK-BR-046](../../core/gxp/03-risk-assessment.md#rsk-br-046)

```ts
// illustrative — not type-checked
declare const Entitlement: {
  // Provides the host's CapabilityPolicy: the application's policy (inner), narrowed by entitlement.
  readonly capabilityPolicy: (options: EntitlementCapabilityOptions) =>
    Layer.Layer<CapabilityPolicy, EntitlementConfigError, Entitlement>
}
interface EntitlementCapabilityOptions {
  readonly inner?: CapabilityPolicy["Type"]   // the application's own policy; absent: Grant.all for every request
  readonly readOnly: ReadOnlyClassifier        // required, no default (BEH-EN-026)
  readonly onUnclassified: "no-members" | "all" // required: a service the classifier does not know, in read-only
  readonly onNone: "read-only" | "no-members"   // required: what mode `none` narrows to (BEH-EN-027)
  readonly resolutionTimeout?: Duration.Input   // the host's, when not core's default of 5 seconds
}
// The package's construction error, shared with EntitlementGate.piece and .layer (02, BEH-EN-011) and Policies.first:
class EntitlementConfigError extends Schema.TaggedError<EntitlementConfigError>()("EntitlementConfigError", {
  component: Schema.String,      // "EntitlementGate.piece", "Entitlement.capabilityPolicy", "ReadOnly.fromContracts", "Policies.first", …
  reason: Schema.String          // e.g. "checkTimeout not shorter than resolutionTimeout", "missing onNone"
}) {}
```

```
REQUIREMENT: `Entitlement.capabilityPolicy` MUST provide core's
             `CapabilityPolicy` (`@bridger/core/CapabilityPolicy`), whose
             `resolve` first calls `inner.resolve` (or answers `Grant.all`
             when `inner` is absent) and then narrows the inner grant by
             the rule of BEH-EN-027, and whose `changes` is the merge of
             `inner.changes` (when declared) and the package's own
             re-resolution stream (BEH-EN-028). `readOnly`,
             `onUnclassified` and `onNone` MUST be stated; a missing one
             MUST fail the layer with `EntitlementConfigError`.
```

```
REQUIREMENT: An inner refusal (`ResolutionRefused`) MUST be passed through
             unchanged. The package MUST NOT itself fail `resolve` with
             `ResolutionRefused`, die or exceed core's
             `resolutionTimeout`: entitlement narrows with a grant, which
             may name no member, and never refuses. A refusal of a
             `required` capture would fail the plugin's activation (core
             BEH-BR-274), which is a state change INV-EN-002 forbids.
```

```
REQUIREMENT: `resolve` MUST answer from the subject's latest effective
             state held by the package (BEH-EN-028). For a subject seen for
             the first time it MUST call the port's `check` bounded by
             `checkTimeout` (01, BEH-EN-005) and, when the port cannot
             answer in time, use the state 01, BEH-EN-005, serves for an
             unavailable port. `checkTimeout` MUST be shorter than core's
             `resolutionTimeout`; the package cannot read the host's option,
             so the layer MUST take it as `resolutionTimeout` in its options
             when it differs from core's default of 5 seconds (the default
             `checkTimeout` of 4 seconds is shorter), and MUST fail
             with `EntitlementConfigError` when `checkTimeout` is not
             shorter.
```

```
REQUIREMENT: Only plugin consumers (`consumer.kind` plugin, identified as
             "plugin:<id>@<realm>") MUST be narrowed. Application consumers
             MUST receive the inner grant unchanged. The subject MUST be
             built from the consumer's id and realm and the labels
             `EntitlementOptions.labels` gives for it (01, BEH-EN-002),
             never from the service, the provider or annotations.
```

Core accepts one `CapabilityPolicy` per host; an application that has its
own rules (a partner may read `Inventory` but not `Payments`) keeps them in
`inner`, and entitlement only takes members away from what `inner` granted.
Answering with a grant instead of a refusal is what keeps a lapse from
becoming a failure: a required capture narrowed to nothing leaves the plugin
`active` and its calls die with `CapabilityDenied`, exactly as core specifies
for a re-resolution that answers nothing (BEH-BR-281).

## BEH-EN-026: Read-only members are classified by the application

> **See:** [ADR-EN-004](../decisions/004-a-lapse-narrows-capability-grants.md)
> **Core seam:** [26 — Versioned contracts](../../core/behaviors/26-versioned-contracts.md) (BEH-BR-225), [29](../../core/behaviors/29-capability-grants-and-call-log.md) (BEH-BR-273)
> **Satisfies:** [URS-BR-034](../../core/urs.md#urs-br-034-narrow-and-log-what-each-plugin-can-call)

```ts
// illustrative — not type-checked
interface ReadOnlyClassifier {
  // The members of this service that stay callable in read-only mode; undefined: not classified.
  readonly members: (service: {
    readonly serviceId: ServiceId
    readonly contract?: { readonly name: string; readonly version: string }   // from the ResolutionRequest
  }) => "all" | readonly string[] | undefined
}
declare const ReadOnly: {
  // By contract name: method names that only read. Checked against each contract's methods at layer build.
  readonly fromContracts: (table: ReadonlyArray<readonly [Contract<any, any, any>, readonly string[]]>) => ReadOnlyClassifier
  // By service id, for keys that are not contracts.
  readonly fromServices: (table: ReadonlyArray<readonly [Context.Key<any, any>, readonly string[]]>) => ReadOnlyClassifier
  readonly combine: (...classifiers: readonly ReadOnlyClassifier[]) => ReadOnlyClassifier  // first defined answer wins
}
```

```
REQUIREMENT: The package MUST NOT infer read-only members from names,
             schemas, stream flags or any other property of a service or
             contract, and MUST NOT ship a default classifier. Core's
             `MethodSpec` has no read-only marker (BEH-BR-225); the
             classification is the application's statement.
```

```
REQUIREMENT: `ReadOnly.fromContracts` and `ReadOnly.fromServices` MUST fail
             the layer with `EntitlementConfigError` when a listed name is
             not a method of the contract, or when a contract or key is
             listed twice. A classifier's answer MUST be a pure function of
             its argument.
```

```
REQUIREMENT: The `Bridger.Host` base service MUST be classified like any
             other key when a plugin captures it; documentation MUST show
             a classification that keeps `snapshot` and withholds the
             mutating members (core BEH-BR-275).
```

"Read-only" is what each plugin's services mean by it: `Inventory.get` and
`list` read, `adjust` writes; a report service's `render` reads, `schedule`
writes. Only the application knows, and a guess based on a method named
`get…` would be a control that looks like one and is not.

## BEH-EN-027: The grant rule for each mode

> **Invariant:** [INV-EN-006](../invariants.md#inv-en-006-grant-narrowing-never-refuses-a-capture-and-never-widens-a-grant), [INV-EN-005](../invariants.md#inv-en-005-essential-uses-are-never-refused-by-entitlement-or-budget-helpers)
> **See:** [ADR-EN-004](../decisions/004-a-lapse-narrows-capability-grants.md), [ADR-EN-001](../decisions/001-entitlement-changes-modes-not-state.md)
> **Core seam:** [29](../../core/behaviors/29-capability-grants-and-call-log.md) (BEH-BR-273, BEH-BR-275)
> **Satisfies:** [URS-BR-034](../../core/urs.md#urs-br-034-narrow-and-log-what-each-plugin-can-call), [URS-BR-026](../../core/urs.md#urs-br-026-know-which-compliance-obligations-remain-mine)

```
REQUIREMENT: Given the inner grant `G` and the subject's effective mode
             (01, BEH-EN-004, including a stale state served read-only by
             BEH-EN-005), the answer MUST be:
             - `full` or `grace`: `G` unchanged;
             - `read-only`: the members of `G` that the classifier returns
               for the service (all of `G` when it returns "all"); when it
               returns undefined, `G` under `onUnclassified: "all"` and no
               member under "no-members";
             - `none`, and "unknown" (no answer known, 01, BEH-EN-005): as
               `read-only` under `onNone: "read-only"`, and no member under
               "no-members".
             An answer of no member MUST be `Grant.of(key, { methods: [] })`.
```

```
REQUIREMENT: The answer MUST NOT name a member that `G` does not name: when
             `G` is `Grant.all`, the classified list is the answer; when `G`
             names members, the answer is the intersection. The package
             MUST NOT widen a grant in any mode.
```

```
REQUIREMENT: A subject whose labels contain an essential label (01,
             BEH-EN-007) MUST receive `G` unchanged in every mode, and each
             such resolution in mode `read-only` or `none` MUST be counted
             as an essential pass in `Entitlement.inspect`.
```

```
REQUIREMENT: Every narrowed answer MUST be counted per plugin (its id and
             realm, core BEH-BR-147), service id and mode in
             `Entitlement.inspect`. The package MUST NOT write
             an audit record (01, BEH-EN-008); core's call log, when wired,
             records each denied call as an entry with outcome "denied"
             (core BEH-BR-276).
```

`onNone` exists because "none" means different things to different
deployments: for one, a plugin whose licence ended may still show what it
holds; for another, it may call nothing outside its essential work. Either
way the plugin stays installed and active, and the gate (02, BEH-EN-009)
still refuses granting it more.

## BEH-EN-028: A lapse re-resolves the plugin's live captures, and renewal restores them

> **Invariant:** [INV-EN-002](../invariants.md#inv-en-002-a-lapse-never-changes-plugin-state-by-itself), [INV-EN-006](../invariants.md#inv-en-006-grant-narrowing-never-refuses-a-capture-and-never-widens-a-grant)
> **See:** [ADR-EN-004](../decisions/004-a-lapse-narrows-capability-grants.md)
> **Core seam:** [29](../../core/behaviors/29-capability-grants-and-call-log.md) (BEH-BR-281: `ResolveAgain { consumers?, serviceIds? }`)
> **Satisfies:** [URS-BR-034](../../core/urs.md#urs-br-034-narrow-and-log-what-each-plugin-can-call), [URS-BR-005](../../core/urs.md#urs-br-005-never-lose-a-provider-in-the-middle-of-a-call)

```
REQUIREMENT: On the first `resolve` for a plugin subject, the package MUST
             start following that subject's derived `watch` (01,
             BEH-EN-006) in the policy layer's scope, once per subject.
             Whenever the subject's effective mode changes the answer of
             BEH-EN-027 — in either direction — the package MUST emit, on
             its re-resolution stream, one
             `ResolveAgain { consumers: ["plugin:<id>@<realm>"] }` for that
             subject, after updating the state `resolve` answers from.
             Changes that leave the answer unchanged (`full` to `grace`)
             MUST NOT emit.
```

```
REQUIREMENT: The package's re-resolution stream MUST NOT fail or end while
             the layer's scope is open: an unavailable port is served as
             01, BEH-EN-005, specifies. Core makes no further
             re-resolution after `changes` ends (BEH-BR-281), so a
             stream that ended would freeze every grant.
```

```
REQUIREMENT: Documentation MUST state what core then does and does not do
             (BEH-BR-281): every live capture of that plugin is
             re-resolved, and calls that begin afterwards see the new
             grant; calls already in progress finish under the grant they
             began with; a granted member delegates and an ungranted one
             dies with `CapabilityDenied`; non-function members stay as they
             were at capture; the plugin's state, leases, background fibers
             and calls in progress are untouched.
```

```
REQUIREMENT: The policy's `changes` MUST be declared whenever this layer
             is used, so that core adds the narrowing layer even for
             `Grant.all` (BEH-BR-275); documentation MUST state that this
             costs one delegating layer per capture.
```

The plugin's cooperation is no longer needed for the services it captured:
the object it holds stops forwarding `Inventory.adjust` the moment the lapse
is seen, and starts again on renewal, while the plugin keeps running, keeps
its leases and keeps receiving its `entitled` stream (02, BEH-EN-013). What
it computes inside itself, and what it reaches by other means, is still its
own (BEH-EN-029).

## BEH-EN-029: What narrowing does not cover

> **See:** [ADR-EN-004](../decisions/004-a-lapse-narrows-capability-grants.md), [ADR-BR-019](../../core/decisions/019-realms-are-resolution-namespaces.md)
> **Core seam:** [29](../../core/behaviors/29-capability-grants-and-call-log.md) (BEH-BR-275, BEH-BR-278)
> **Risk:** [RSK-BR-046](../../core/gxp/03-risk-assessment.md#rsk-br-046), [RSK-BR-029](../../core/gxp/03-risk-assessment.md#rsk-br-029)

```
REQUIREMENT: Documentation of `Entitlement.capabilityPolicy` MUST state, in
             one place, that narrowing:
             (1) acts on calls through services the plugin captured from
             the host, not on code the plugin runs itself, values a granted
             member returns (narrowing is shallow), or anything it reaches
             outside the host;
             (2) is not isolation for in-process code (core BEH-BR-278);
             (3) acts on an out-of-process guest through the captures of
             its proxy plugin, which is where it limits what a guest can
             call back;
             (4) does not touch the services the plugin provides to
             others — consumers of a lapsed plugin keep calling it, and its
             own `entitled` stream and `guard` (02, BEH-EN-014) decide what
             it serves.
```

```
REQUIREMENT: `guard` and the `entitled` stream MUST remain available and
             unchanged when the policy layer is used; documentation MUST
             recommend both, since narrowing covers what a plugin calls and
             not what it serves.
```

A lapsed export plugin cannot reach the ledger's write members any more, but
whether it still answers `export` to its own consumers is its decision, read
from its stream. Saying so keeps the control from being read as more than it
is ([RSK-BR-046](../../core/gxp/03-risk-assessment.md#rsk-br-046)).

## BEH-EN-030: A hook call's budget is reserved at admission and settled after the call

> **Invariant:** [INV-EN-007](../invariants.md#inv-en-007-a-hook-calls-reservation-is-settled-once-by-its-outcome), [INV-EN-003](../invariants.md#inv-en-003-an-uncommitted-reservation-is-released-when-its-scope-closes)
> **See:** [ADR-EN-003](../decisions/003-budgets-are-scoped-reservations.md)
> **Core seam:** [31 — Hook points](../../core/behaviors/31-hook-points.md) (`HookPointOptions.policy` and `settle`, BEH-BR-302; BEH-BR-312)
> **Satisfies:** [URS-BR-014](../../core/urs.md#urs-br-014-contribute-to-a-shared-extension-point-safely)

```ts
// illustrative — not type-checked
type SettleOutcome = "passed" | "vetoed" | "enriched" | "advised" | "failed" | "timeout" | "interrupted" | "revoked"
// Budget.contributionPolicy (03, BEH-EN-023) takes:
interface BudgetContributionOptions {
  readonly key: (owner: HookOwner) => BudgetKey
  readonly perCall: number
  readonly refundOn?: readonly SettleOutcome[]   // default ["failed", "timeout", "interrupted", "revoked"]
}
```

```
REQUIREMENT: When the bundle's policy answers `Run`, it MUST hold a
             reservation of `perCall` against `key(step.owner)` (03,
             BEH-EN-018), not commit it. The bundle's `settle` step, which
             core calls exactly once after each hook call the combined
             policy answered `Run` (core BEH-BR-302), MUST then settle one
             outstanding reservation of that contribution id and key: by
             `release` when the call's outcome is in `refundOn`, counted as
             "refunded" per limit, and otherwise by `commit(perCall)`.
             Because every reservation of one contribution and key holds
             the same amount, which outstanding one is settled does not
             change any limit.
```

```
REQUIREMENT: A reservation held by the policy MUST carry the reservation
             `ttl` (BEH-EN-019); one that no `settle` reaches — the
             combined policy answered `Skip` or `Deny` after it, or the
             host closed, or the declaration's wake failed or timed out, so
             that core made no hook call (core BEH-BR-309) — MUST be
             released at `ttl` and counted as "expired". `Policies.first`
             (02, BEH-EN-016) MUST refuse, with
             `EntitlementConfigError`, a combination in which a reserving
             bundle is not the last, so that no later policy can pass over
             a call this bundle already reserved for.
```

```
REQUIREMENT: The policy and the settle step MUST NOT fail or die; with a
             wired ledger (BEH-EN-022) the reservation, commit and release
             go to the ledger by reservation id, and an unavailable ledger
             MUST be handled by `onLedgerUnavailable` and counted. An
             essential charge (BEH-EN-020) is reserved and settled like any
             other, its uncovered part counted as essential overdraft.
             Core runs the step uninterruptibly, outside the dispatch's
             deadline, and ignores its failure (BEH-BR-302).
```

```
REQUIREMENT: Documentation MUST state that core consults `policy` before
             any wake (core BEH-BR-309) and calls `settle` only after a hook
             call, so a declaration that was answered `Run` and then not
             woken in time holds its reservation until `ttl`; it MUST
             recommend a reservation `ttl` just above the longest wake
             window plus the point's `timeout`, so that such reservations
             are released soon after the dispatch ends. The package MUST
             rely on core asking `policy` once for each declaration of a
             dispatch, the woken contribution included; were core to ask
             again after the wake, the second reservation would find no
             `settle` and expire at `ttl`, and documentation MUST say so.
```

Core closes URS gap G63 with this step. Reserving at admission keeps calls
running in parallel from spending a quota twice; settling after the call
charges only calls that did the work they paid for. A veto or an enrichment
is the work; a timeout is not.

## BEH-EN-031: Usage export

> **See:** [ADR-EN-003](../decisions/003-budgets-are-scoped-reservations.md)
> **Satisfies:** [URS-BR-026](../../core/urs.md#urs-br-026-know-which-compliance-obligations-remain-mine)
> **Risk:** [RSK-BR-012](../../core/gxp/03-risk-assessment.md#rsk-br-012)

```ts
// illustrative — not type-checked
interface BudgetShape {
  // ... (03, BEH-EN-017)
  readonly usage: (options?: { readonly match?: Readonly<Record<string, string>>; readonly periods?: number }) =>
    Effect.Effect<UsageExport>
}
interface UsageExport {
  readonly schemaVersion: 1
  readonly source: "process" | "process-with-ledger"   // never "ledger": the ledger's own figures are the ledger's
  readonly at: string                                    // ISO-8601 UTC, from Clock
  readonly limits: readonly {
    readonly match: Readonly<Record<string, string>>
    readonly unit: string
    readonly amount: number
    readonly periods: readonly {
      readonly from: string; readonly until?: string      // from Clock; `until` absent for the current period
      readonly reserved: number; readonly committed: number; readonly released: number
      readonly expired: number; readonly refunded: number
      readonly overrun: number; readonly essentialOverdraft: number; readonly unreconciled: number
    }[]
  }[]
  readonly unlimited: readonly { readonly labels: Readonly<Record<string, string>>; readonly unit: string; readonly committed: number }[]
}
```

```
REQUIREMENT: `usage` MUST return, per limit in the application's order,
             the amounts and counts of the current period and of at most
             `periods` earlier periods (default 1, bounded by what the
             process kept), read without changing any amount. It MUST carry
             only limits' labels and units, amounts and counts: no
             reservation id, actor, input, argument or result.
```

```
REQUIREMENT: Periods MUST be the `Clock` periods of BEH-EN-021; an export
             MUST be deterministic under `TestClock`. The package MUST NOT
             write the export anywhere; the application decides where it
             goes.
```

```
REQUIREMENT: With a wired `BudgetLedger`, `source` MUST be
             "process-with-ledger" and documentation MUST state that the
             export is this process's view, that the ledger's figures are
             authoritative for anything charged, and that "unreconciled"
             counts reservations accounted locally under
             `onLedgerUnavailable: "local"` (BEH-EN-022).
```

```
REQUIREMENT: Documentation MUST state that the export is a diagnostic
             report, not an audit record and not billing (03, BEH-EN-022),
             and that limit labels SHOULD carry no personal data, since the
             export repeats them.
```

An operator asking "how much of the partner's daily allowance went to
failed calls?" needs committed, refunded and overrun side by side, per
period; a dashboard needs the same as data. The export gives both without
turning the meter into a ledger.

## BEH-EN-032: Required acceptance checks of grant narrowing and usage

> **See:** [ADR-EN-004](../decisions/004-a-lapse-narrows-capability-grants.md), [ADR-EN-003](../decisions/003-budgets-are-scoped-reservations.md), [ADR-BR-035](../../core/decisions/035-evidence-from-executed-tests.md)
> **Satisfies:** [URS-BR-019](../../core/urs.md#urs-br-019-test-plugin-lifecycles-deterministically-with-injected-faults)
> **Risk:** [RSK-BR-018](../../core/gxp/03-risk-assessment.md#rsk-br-018)

```
REQUIREMENT: The package's test suite MUST contain at least one test for
             each of the following, run on a `TestHost` under `TestClock`
             with the scripted `EntitlementAdapter` and core's scripted
             `CapabilityPolicy` fixture as `inner`:
             17. `Entitlement.capabilityPolicy` passes inner refusals
                 through, never refuses or dies for entitlement, answers
                 within `resolutionTimeout`, narrows only plugin consumers,
                 and fails to build without `readOnly`, `onUnclassified` or
                 `onNone`, or with `checkTimeout` not shorter than
                 `resolutionTimeout`, and builds with the default
                 `checkTimeout` and core's default `resolutionTimeout`
                 (BEH-EN-005, BEH-EN-025).
             18. The classifier is the application's: no default, listed
                 names checked against contract methods, duplicates
                 refused; `Bridger.Host` classified like any key
                 (BEH-EN-026).
             19. The grant rule for every mode and option, never naming a
                 member the inner grant does not; essential subjects
                 unchanged and counted; narrowed answers counted per
                 plugin id and realm; no audit
                 record written (BEH-EN-027).
             20. A lapse to `read-only` while calls hold leases emits one
                 `ResolveAgain` for the plugin; later calls to a write
                 member die with `CapabilityDenied`, calls in progress
                 complete, the plugin stays `active` with unchanged
                 snapshot; renewal restores the members; `full` → `grace`
                 emits nothing; the stream survives port unavailability
                 (BEH-EN-028, INV-EN-002).
             21. A plugin's provided services are not narrowed by its own
                 lapse; `guard` and `entitled` behave as without the layer
                 (BEH-EN-029).
             22. `Budget.contributionPolicy` reserves at admission; its
                 settle step releases on each outcome in `refundOn` and
                 commits on every other, once per call; an unsettled
                 reservation expires at `ttl`, including one for a
                 declaration whose wake failed or timed out, counted
                 "expired"; `Policies.first` refuses a
                 reserving bundle that is not last; neither step fails
                 when the ledger is unavailable (BEH-EN-030).
             23. `usage` reports each counter per limit and period,
                 deterministically under `TestClock`, with no reservation
                 id or input, and `source` "process-with-ledger" with a
                 ledger (BEH-EN-031).
```

These checks are the acceptance scenarios `REQ-EN-017`–`REQ-EN-023` of
[traceability §2](../traceability.md#2-acceptance-scenarios). None has been
written or run; none is evidence yet.

**Settled here.** (1) A lapse narrows a plugin's grants through core's
`CapabilityPolicy.changes`; it never refuses a capture and never changes
plugin state. (2) Read-only members are classified by the application; the
package infers nothing. (3) A hook call's budget is reserved at admission and
settled by `settle`: committed for outcomes that did the work, released for
the others. (4) The usage export
is a process-local diagnostic, not a ledger.

**Open.** (0) Whether core should call `settle` with an outcome such as
"wake-failed" for a declaration that `policy` answered `Run` but that was
never called, so that its reservation is refunded at once rather than expiring
at `ttl` (a core change, requested of core; not made here). (1) Whether core's `MethodSpec` should gain an optional read-only
marker so that a contract states its own classification; the package would
then read it as the default classifier for contracts that declare it (a core
change, not made here). (2) Whether `onNone: "no-members"` should keep
members the application marks essential per service, rather than only per
subject.

---

_Previous: [03 — Budgets](./03-budgets.md)_
