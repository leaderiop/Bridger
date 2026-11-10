# 02 — Gate and Runtime

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-EN-BEH-02                                            |
> | Revision       | 0.7                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.7 (2026-11-10): BEH-EN-014: `Entitlement.guard` takes the activation's `Plugin.Runtime` as `options.runtime`, decides only on its `entitled` and names the plugin from its `principal`, never the fiber's (E1); its essential labels are the application's list from `Entitlement.layer`, to which `options.essential` may only add (E2); `checkTimeout` (default 4 seconds) bounds the wait for the first state, after which it fails `NotEntitled` with mode "unknown" (E3); `noPrincipal` removed; BEH-EN-013: the derived `watch` may serve "unknown"; BEH-EN-016: a hook point using `Entitlement.contributionPolicy` is made by application code (E4) (SPEC-AUDIT-04) (CCR-EN-007)<br>0.6 (2026-11-10): BEH-EN-014: `Entitlement.guard` reads the mode from the activation's `Plugin.Runtime.entitled`, passed as `options.entitled`, takes the essential labels as `options.essential`, counts in the package's process-local `inspect` counters, which gain `essentialOverdraft` and `narrowed` for the counts 03 and 04 require, and does not require the `Entitlement` service; core's modes "unmetered" and "unknown" allow only essential uses (M25); BEH-EN-009 names the `Entitlement` service and the application's `EntitlementAdapter` (low finding) (CCR-EN-006)<br>0.5 (2026-11-10): BEH-EN-009 declares `EntitlementGate.check(request, options)`, which the text already required; BEH-EN-011 reads `checkTimeout` from the `Entitlement` service's options (01, BEH-EN-001); BEH-EN-014 defines `EntitlementInspection` (P13) (CCR-EN-005)<br>0.4 (2026-11-08): Round 2: recheck item 16; core alignment — BEH-EN-016 uses core `HookPointOptions.policy` (`ContributionPolicy`, `Run`/`Skip`/`Deny`) with `Entitlement.contributionPolicy` (`onNotEntitled: "skip" \| "deny"`) and `Policies.first`, replacing `Entitlement.skipPolicy`, `SkipPolicy` and `Skip.first` (G62 closed in core); G64 limit stated; BEH-EN-009 allows `undo` requests and ignores `allowChildren` and `mandatoryInterceptions`; BEH-EN-015 points to grant narrowing (CCR-EN-003)<br>0.3 (2026-11-08): `enable` not entitlement-gated; `replace` consulted only under the required `onReplace` option; `EntitlementGate.piece` checks `checkTimeout` against its own timeout and documents the composite `gateTimeout`; core modes `unmetered` and `unknown`; hook entitlement is `Entitlement.skipPolicy` for `HookPointOptions.skip`, replacing `hookPolicy` (CCR-EN-002)<br>0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-EN-001)<br>0.1 (2026-11-08): Initial draft (CCR-EN-001)                 |

---

An entitlement answer is useful in two places: before the host grants a
plugin something, and inside a running plugin that must adapt to what it
is entitled to. This file specifies both. The **entitlement gate** is a gate
piece consulted for the host operations that add a plugin's behaviour to the
host — and for no other. The **`Plugin.Runtime.entitled` stream** tells a
running plugin its own entitlement, so it can switch itself to read-only.
Between them sits one rule: a lapse changes what a plugin may do, never
whether it runs ([ADR-EN-001](../decisions/001-entitlement-changes-modes-not-state.md),
[ADR-EN-002](../decisions/002-runtime-stream-and-gate-only.md)). The file
also specifies how entitlement applies to hook-point contributions. This
file owns BEH-EN-009–016 and uses all eight.

> **What this package does not do — and who does**
>
> It does not enforce read-only mode inside plugin code: in-process code is
> trusted and not isolated, and a plugin that ignores its mode is a defect of
> that plugin. What it can do without the plugin's cooperation is narrow the
> services the plugin captured (04 — Grant narrowing and usage), which is not
> isolation either. Code that must be prevented from writing runs out of process
> behind a proxy plugin ([references/remote/](../../remote/README.md)). It
> does not remove, disable or restart plugins; an application that wants a
> lapsed plugin removed does so through its own `reconcile`, gated and
> audited by core.

Planned source: `packages/entitlement/src/EntitlementGate.ts`,
`packages/entitlement/src/EntitlementView.ts`,
`packages/entitlement/src/guard.ts` *(Planned)*.

## BEH-EN-009: The entitlement gate is a gate piece for granting operations

> **Invariant:** [INV-EN-001](../invariants.md#inv-en-001-taking-a-plugin-away-is-never-refused-for-entitlement)
> **See:** [ADR-EN-002](../decisions/002-runtime-stream-and-gate-only.md), [ADR-BR-032](../../core/decisions/032-operation-gate.md)
> **Core seam:** [32 — Generic gate and plan](../../core/behaviors/32-generic-gate-and-plan.md) (BEH-BR-313–321), [25 — Operation gate](../../core/behaviors/25-operation-gate.md)
> **Satisfies:** [URS-BR-024](../../core/urs.md#urs-br-024-require-approval-before-a-regulated-change)
> **Risk:** [RSK-BR-014](../../core/gxp/03-risk-assessment.md#rsk-br-014)

```ts
// illustrative — not type-checked
declare const EntitlementGate: {
  // a Gate<OperationRequest> piece (32 — Generic gate and plan); never returns Defer
  readonly gate: (options: EntitlementGateOptions) => Effect.Effect<Gate<OperationRequest>, never, Entitlement>
  // the entry for Gate.all, named "entitlement", with its required timeout (32, BEH-BR-321)
  readonly piece: (options: EntitlementGateOptions & { readonly timeout: Duration.Input }) =>
    Effect.Effect<{ readonly name: string; readonly gate: Gate<OperationRequest>; readonly timeout: Duration.Input },
                  EntitlementConfigError, Entitlement>
  // provides the host's OperationGate when this is the deployment's only gate
  readonly layer: (options: EntitlementGateOptions & { readonly gateTimeout: Duration.Input }) =>
    Layer.Layer<OperationGate, EntitlementConfigError, Entitlement>
  // the piece's decision, for an application's own authorize (below)
  readonly check: (request: OperationRequest, options: EntitlementGateOptions) =>
    Effect.Effect<void, OperationRejected, Entitlement>
}
interface EntitlementGateOptions {
  readonly onReplace: "consult" | "allow"   // required, no default (BEH-EN-009)
  readonly refuseReadOnly?: boolean         // default false: a read-only plugin may be installed and run read-only
}
```

```
REQUIREMENT: The gate MUST consult the `Entitlement` service (the
             application's `EntitlementAdapter`, 01) for `install`
             requests — the operation that adds a plugin's behaviour to the
             host — and, when `onReplace` is "consult", for `replace`
             requests, which add a new version of it; including each such
             entry action of `reconcile`, which core submits to the gate once
             per entry (core BEH-BR-222). `onReplace` MUST be stated
             explicitly.
```

```
REQUIREMENT: For every other request the gate MUST answer Allow at once,
             without calling the port.
```

```
REQUIREMENT: A request with `undo: true` — an undo action of an atomic
             `reconcile` (core BEH-BR-219, BEH-BR-325) — MUST be allowed
             without calling the port, even when it is an `install` or a
             `replace`: it restores the registration the apply changed,
             and refusing it would turn a rollback into a `PartialApply`.
             The gate MUST ignore `allowChildren` and
             `mandatoryInterceptions`; they are not entitlement questions.
```

```
REQUIREMENT: The gate MUST NOT return Defer. Where the generic gate of
             32 — Generic gate and plan is not available, the
             piece MUST be usable from an application's own `authorize`
             through `EntitlementGate.check(request, options)`, which fails
             with `OperationRejected` exactly when the piece built with the
             same options would refuse.
```

Granting is where an entitlement check belongs at the host: installing a
plugin the deployment has not paid for is a decision an approver would refuse
too. `enable` is not a grant: the plugin was installed, and a plugin disabled
for maintenance must be re-enabled to run its essential work even in mode
`none`, exactly as `retry` and `restart` recover a failed one (BEH-EN-012).
`replace` sits between: an upgrade a licence does not cover is a grant, but a
security fix to a lapsed plugin is not, and refusing it keeps the vulnerable
version running ([RSK-BR-046](../../core/gxp/03-risk-assessment.md#rsk-br-046)).
The package cannot tell the two apart, so the application states which reading
it wants (`onReplace`), and an essential label on the target lets a replace
through in either reading (BEH-EN-010). Being a
piece rather than the gate keeps it composable with the application's
approval gate; Defer is for decisions a person can still make, and an
entitlement answer is not one.

## BEH-EN-010: The decision rule and its refusal reasons

> **Invariant:** [INV-EN-005](../invariants.md#inv-en-005-essential-uses-are-never-refused-by-entitlement-or-budget-helpers)
> **See:** [ADR-EN-002](../decisions/002-runtime-stream-and-gate-only.md)
> **Satisfies:** [URS-BR-024](../../core/urs.md#urs-br-024-require-approval-before-a-regulated-change), [URS-BR-021](../../core/urs.md#urs-br-021-know-who-changed-the-plugin-set-when-and-why)
> **Risk:** [RSK-BR-014](../../core/gxp/03-risk-assessment.md#rsk-br-014)

```
REQUIREMENT: The subject MUST be built from the request: `pluginId` and
             `realm` from `request.target`, `version` from
             `request.definition.version` (the incoming definition for
             `install` and `replace`, core BEH-BR-219), and labels from
             `EntitlementOptions.labels` for that target.
```

```
REQUIREMENT: The gate MUST refuse with `OperationRejected` when the effective
             mode (01, BEH-EN-004) is `none`, with reason
             "not-entitled: <adapter reason>"; and, when `refuseReadOnly` is
             true, when it is `read-only`, with reason "read-only". In every
             other mode it MUST allow.
```

```
REQUIREMENT: The gate MUST allow, without consulting the mode, a request
             whose target's labels contain an essential label (01,
             BEH-EN-007), and MUST count it as an essential pass.
```

A refusal reaches the trail as core's single `rejected` record of the call,
carrying this reason (core BEH-BR-220). A reviewer who reads "not-entitled:
expired" knows who asked, for what, and why the host refused, without the
package writing a record of its own (01, BEH-EN-008).

## BEH-EN-011: Unavailability refuses a grant, and never stops anything

> **See:** [ADR-EN-001](../decisions/001-entitlement-changes-modes-not-state.md)
> **Satisfies:** [URS-BR-024](../../core/urs.md#urs-br-024-require-approval-before-a-regulated-change)
> **Risk:** [RSK-BR-014](../../core/gxp/03-risk-assessment.md#rsk-br-014)

```
REQUIREMENT: The gate MUST ask the port for a fresh answer (`check`), bounded
             by `checkTimeout`. When the port is unavailable, the gate MAY
             use a last-known state only if it is not stale (01,
             BEH-EN-005) and its mode is `full` or `grace`; otherwise it MUST
             refuse with reason "entitlement-unavailable".
```

```
REQUIREMENT: `EntitlementGate.piece` MUST fail with `EntitlementConfigError`
             when the `checkTimeout` in the options of the `Entitlement`
             service it is built over (01, BEH-EN-001, BEH-EN-005) is not
             shorter than the piece's `timeout`;
             `EntitlementGate.layer` MUST fail likewise against the stated
             `gateTimeout`. Documentation MUST state that, inside `Gate.all`,
             each piece's `timeout` bounds that piece and the host's
             `gateTimeout` still bounds the whole composite (core
             BEH-BR-321, BEH-BR-221), so the timeouts of the pieces listed
             before and including this one should add up to less than
             `gateTimeout`; the package cannot check that sum, because a
             piece never sees the other pieces or the host's options.
```

A grant is the direction in which failing closed costs least: a new install
waits for the licence service, while everything already running keeps
running under 01's `onUnavailable` rule. The timeout ordering keeps the
reason readable — "entitlement-unavailable", not a generic "gate-timeout" —
as far as the piece can see: it checks its own bound, which it is given, and
documents the composite bound, which it is not.

## BEH-EN-012: Removal, disabling, recovery and shutdown are never refused

> **Invariant:** [INV-EN-001](../invariants.md#inv-en-001-taking-a-plugin-away-is-never-refused-for-entitlement)
> **See:** [ADR-EN-001](../decisions/001-entitlement-changes-modes-not-state.md), [ADR-BR-032](../../core/decisions/032-operation-gate.md)
> **Satisfies:** [URS-BR-006](../../core/urs.md#urs-br-006-recover-from-failure-explicitly-and-never-silently), [URS-BR-002](../../core/urs.md#urs-br-002-remove-or-replace-a-plugin-safely-while-it-is-in-use)

```
REQUIREMENT: The gate MUST allow `remove`, `disable`, `enable`, `retry`,
             `restart`, `reconfigure`, `defineRealm`, `reconcile` (the parent
             request), `acknowledgeAuditDegraded`, and `replace` when
             `onReplace` is "allow", whatever the entitlement. A lazy
             plugin's leaving `dormant` (`Host.wake`, triggers) is a system
             transition and never reaches the gate (core BEH-BR-245).
             `shutdown` and system transitions never reach a gate (core
             BEH-BR-223), and nothing in this package MAY ask core to change
             that.
```

```
REQUIREMENT: No component of this package MAY refuse, delay or condition an
             operation that removes or stops a plugin.
```

Taking something away is the safe direction, as core argues for shutdown.
Recovery — `enable`, `retry`, `restart`, `reconfigure` — is allowed too,
because a plugin in mode `none` still runs its essential work (01,
BEH-EN-003), and an entitlement check that blocked recovering it would turn a
lapse into an outage of the very work that must never stop.

## BEH-EN-013: Plugin.Runtime.entitled — the core seam

> **See:** [ADR-EN-002](../decisions/002-runtime-stream-and-gate-only.md), [ADR-BR-007](../../core/decisions/007-observation-primitives.md)
> **Core seam:** [10 — Runtime failure and health](../../core/behaviors/10-runtime-failure-and-health.md) (BEH-BR-089, specified under CCR-BR-020), [28 — Plugin principal and mandatory policy](../../core/behaviors/28-plugin-principal-and-mandatory-policy.md) (BEH-BR-257, alternative)
> **Satisfies:** [URS-BR-006](../../core/urs.md#urs-br-006-recover-from-failure-explicitly-and-never-silently)

```ts
// illustrative — not type-checked
// Specified in core (10 — Runtime failure and health, BEH-BR-089; CCR-BR-020):
interface PluginRuntime {
  // ...
  readonly entitled: Stream.Stream<EntitlementState>     // latest-wins; first element is the current state
}
// Optional core port, read with Effect.serviceOption at host construction:
interface EntitlementViewShape {
  readonly watch: (target: { readonly id: string; readonly realm: string; readonly version?: string }) =>
    Stream.Stream<EntitlementState>
}
class EntitlementView extends Context.Service<EntitlementView, EntitlementViewShape>()("@bridger/core/EntitlementView") {}
// Core adds two modes of its own to EntitlementState.mode (BEH-BR-089, CCR-BR-022):
//   "unmetered" — no EntitlementView is wired: `entitled` emits { mode: "unmetered", asOf } once and stays open;
//   "unknown"   — the port ended before giving any state.
// This package's port never produces "unmetered"; its derived watch serves "unknown" with stale: true
// only under onUnavailable "last-known" before any answer was ever known (01, BEH-EN-005).
```

```
REQUIREMENT: `EntitlementView.layer` MUST provide the core port from the
             package's derived `watch` (01, BEH-EN-006) for the activation's
             own id, realm and installed `meta.version`. The target MUST be
             the activation's, supplied by the host; plugin code MUST NOT be
             able to ask for another plugin's stream through it.
```

```
REQUIREMENT: The stream MUST end when the activation's scope closes, as
             every member of `Plugin.Runtime` does (core BEH-BR-089). The
             package's derived `watch` MUST NOT end or fail while the scope
             is open: unavailability is served as 01, BEH-EN-005, specifies,
             so that core's "port ended" state (`stale: true`, reason
             "entitlement-view-ended", or mode "unknown") arises only from a
             defect.
```

```
REQUIREMENT: The package's documentation MUST state that core's mode
             "unmetered" means "no entitlement port is wired", never
             "entitled", and that "unknown" means that no answer is known:
             the port ended before answering, or it has been unavailable
             under "last-known" since before its first answer (01,
             BEH-EN-005); a plugin MUST NOT treat either as `full`.
```

The stream lives on `Plugin.Runtime` because that is where the host already
binds per-activation facilities to the plugin's identity and scope; the
plugin cannot forge whose entitlement it reads. The core change is small and
domain-free: an optional port, read once, whose absence changes nothing
(the pattern of core [INV-BR-026](../../core/invariants.md#inv-br-026-an-unwired-sink-or-gate-changes-nothing)).
Core gives the unwired answer its own mode, `unmetered`, outside the port's
vocabulary, so that a plugin testing `mode === "full"` does not mistake "no
port" for a licence.

## BEH-EN-014: A plugin switches itself to read-only, and guard helps it

> **Invariant:** [INV-EN-005](../invariants.md#inv-en-005-essential-uses-are-never-refused-by-entitlement-or-budget-helpers)
> **See:** [ADR-EN-001](../decisions/001-entitlement-changes-modes-not-state.md)
> **Core seam:** [28 — Plugin principal and mandatory policy](../../core/behaviors/28-plugin-principal-and-mandatory-policy.md) (BEH-BR-257–266)
> **Satisfies:** [URS-BR-026](../../core/urs.md#urs-br-026-know-which-compliance-obligations-remain-mine)

```ts
// illustrative — not type-checked
declare const Entitlement: {
  readonly guard: <A, E, R>(
    effect: Effect.Effect<A, E, R>,
    options: {
      readonly requires: "full" | "read-only"
      readonly labels?: readonly string[]
      // the calling activation's own Plugin.Runtime: `entitled` gives the mode (BEH-EN-013), `principal.id` the plugin
      readonly runtime: Pick<PluginRuntime, "entitled" | "principal">
      readonly essential?: readonly string[]               // added to the application's list given to Entitlement.layer (01, BEH-EN-007); never removes one
      readonly checkTimeout?: Duration.Input               // default 4 seconds: the bound on the wait for the first state
    }
  ) => Effect.Effect<A, E | NotEntitled, R>                // requires no service of this package
  readonly inspect: Effect.Effect<EntitlementInspection>    // essential passes per label, refusals per plugin
}
interface EntitlementInspection {                            // process-local counters of the package, not of the service (01, BEH-EN-007; BEH-EN-014)
  readonly essentialPasses: Readonly<Record<string, number>>  // per essential label
  readonly refusals: Readonly<Record<string, number>>         // per plugin id: gate refusals and NotEntitled
  // essential reservations beyond what a limit can cover (03, BEH-EN-020); `limit` is the
  // limit's position in the list given to Budget.layer
  readonly essentialOverdraft: readonly { readonly limit: number; readonly label: string; readonly amount: number }[]
  // narrowed capability answers (04, BEH-EN-027)
  readonly narrowed: readonly { readonly pluginId: string; readonly serviceId: string; readonly mode: string; readonly count: number }[]
}
class NotEntitled extends Schema.TaggedError<NotEntitled>()("NotEntitled", {
  pluginId: Schema.String,
  mode: Schema.String,
  requires: Schema.String
}) {}
```

```
REQUIREMENT: `guard` MUST decide only on `options.runtime.entitled` and
             MUST take the plugin it names in `NotEntitled` and in its
             counters from `options.runtime.principal.id`, never from the
             calling fiber's principal: a provided method runs under its
             caller's principal, or none for application code (core
             BEH-BR-258), so the fiber does not tell whose method is
             guarded.
```

```
REQUIREMENT: `guard` MUST take the current mode from the first element of
             `options.runtime.entitled`, the latest state core holds for the
             activation (core BEH-BR-089), and MUST NOT require the
             `Entitlement` service or any other service of this package, so
             that plugin code can call it. It MUST run the effect, without
             waiting for a state, when `labels` contains an essential
             label; otherwise it MUST run the effect when that mode allows
             `requires` (01, BEH-EN-003) and fail with `NotEntitled`
             without running the effect when it does not. Core's modes
             "unmetered" and "unknown" (BEH-EN-013) MUST allow only
             essential uses, as `none` does. The essential labels MUST be
             the application's list given to `Entitlement.layer` (01,
             BEH-EN-001, BEH-EN-007), which the layer records in the
             package's process-local state when it is built (the union of
             the lists when the process builds more than one), together
             with any label in `options.essential`; `options.essential`
             MAY add labels and MUST NOT remove one. `guard` MUST count its
             essential passes and its `NotEntitled` refusals in the
             package's process-local counters that `Entitlement.inspect`
             reads, which belong to the package, not to the `Entitlement`
             service. Documentation MUST tell authors to pass their own
             activation's `Plugin.Runtime`.
```

```
REQUIREMENT: Core does not bound the wait for the port's first state (core
             BEH-BR-089), so `guard` MUST bound it by `options.checkTimeout`,
             4 seconds when absent: when `options.runtime.entitled` has
             given no element within it, `guard` MUST fail with
             `NotEntitled` with mode "unknown", without running the effect,
             and count the refusal.
```

```
REQUIREMENT: Documentation MUST state that `guard` is a convenience for
             plugin authors, that a plugin can bypass it, and that read-only
             mode is not isolation.
```

Read-only means something different in every plugin: a report plugin keeps
showing reports and stops exporting; a connector keeps reading and stops
sending. The plugin knows; the package gives it one checkable call that
makes the common case a one-liner and counts what it refused.

## BEH-EN-015: A lapse never changes plugin state

> **Invariant:** [INV-EN-002](../invariants.md#inv-en-002-a-lapse-never-changes-plugin-state-by-itself)
> **See:** [ADR-EN-001](../decisions/001-entitlement-changes-modes-not-state.md), [ADR-BR-005](../../core/decisions/005-failure-is-sticky.md)
> **Satisfies:** [URS-BR-005](../../core/urs.md#urs-br-005-never-lose-a-provider-in-the-middle-of-a-call), [URS-BR-006](../../core/urs.md#urs-br-006-recover-from-failure-explicitly-and-never-silently)

```
REQUIREMENT: No change of entitlement MAY cause any component of this
             package to call a host operation, `reportFailure`, or to
             interrupt a lease, a background fiber or a call in progress.
```

```
REQUIREMENT: When the application wires `Entitlement.capabilityPolicy`
             (04, BEH-EN-025), a lapse MUST reach the plugin's captures only
             through core's re-resolution (core BEH-BR-281), which narrows
             later calls and changes no plugin state (04, BEH-EN-028).
```

```
REQUIREMENT: A plugin's own reaction to `entitled` MUST be documented as the
             plugin's responsibility: a plugin that chooses to fail itself
             on a lapse calls `reportFailure`, and the core's runtime-failure
             transition and records apply as for any failure.
```

```
REQUIREMENT: Documentation MUST show how an application removes plugins on
             lapse when it wants that: by excluding them from its desired
             list and calling `reconcile` under its own `Actor`, so that the
             removal is gated and audited by core like any other.
```

Stopping a plugin when its licence lapses would end calls in flight at an
arbitrary moment — a payment half-recorded, a document half-written — and
would do so with no operator decision in the trail. Keeping state changes on
the operator's path keeps both the lease guarantees and the record intact.

## BEH-EN-016: Entitlement of hook-point contributions is a contribution policy of the hook point

> **Invariant:** [INV-EN-005](../invariants.md#inv-en-005-essential-uses-are-never-refused-by-entitlement-or-budget-helpers)
> **See:** [ADR-EN-001](../decisions/001-entitlement-changes-modes-not-state.md)
> **Core seam:** [31 — Hook points](../../core/behaviors/31-hook-points.md) (BEH-BR-297–312; `HookPointOptions.policy` and `settle`, BEH-BR-302; `Deny` and "denied-policy", BEH-BR-312; decision record, BEH-BR-305)
> **Satisfies:** [URS-BR-014](../../core/urs.md#urs-br-014-contribute-to-a-shared-extension-point-safely)

```ts
// illustrative — not type-checked
// What a policy contributes to HookPointOptions: core's ContributionPolicy and, optionally, a SettleStep (BEH-BR-302).
interface ContributionPolicyBundle<In, Target = unknown, Sel = unknown> {
  readonly policy: ContributionPolicy<In, Target, Sel>
  readonly settle?: SettleStep<In, Target>
  readonly reserves: boolean                       // true when the policy holds a budget reservation (04, BEH-EN-030)
}
declare const Entitlement: {
  readonly contributionPolicy: <In>(options: {
    readonly requires?: "full" | "read-only"       // default "full"
    readonly onNotEntitled: "skip" | "deny"        // required, no default
  }) => Effect.Effect<ContributionPolicyBundle<In>, never, Entitlement>
}
declare const Policies: {
  // Consults the bundles in order; the first Skip or Deny decides and later bundles are not consulted.
  // Settle steps run for every bundle (each settles only what it reserved). Fails when a reserving bundle is not last.
  readonly first: <In, Target, Sel>(...bundles: readonly ContributionPolicyBundle<In, Target, Sel>[]) =>
    Effect.Effect<{ readonly policy: ContributionPolicy<In, Target, Sel>; readonly settle?: SettleStep<In, Target> }, EntitlementConfigError>
}

// The hook point owner, application code, wires entitlement (and budgets, 03, BEH-EN-023) as its policy:
const checkout = Effect.gen(function* () {
  const entitled = yield* Entitlement.contributionPolicy<Sale>({ requires: "full", onNotEntitled: "skip" })
  const quota = yield* Budget.contributionPolicy<Sale>({ key: perOwner, perCall: 1 })
  const { policy, settle } = yield* Policies.first(entitled, quota)   // entitlement first: no budget held when not entitled
  return yield* HookPoint.make<Sale, never, never, "blocked">("checkout", {
    codes: ["blocked"], who: admission, timeout: "200 millis", deadline: "1 second", onError: "deny",
    policy, settle
  })
})
```

```
REQUIREMENT: The policy MUST answer `Run` when the effective mode (01,
             BEH-EN-004) of the contribution's owning plugin —
             `step.owner.pluginId` and `step.owner.realm` — allows
             `requires`. Otherwise it MUST answer
             `Skip { reason: "not-entitled" }` under `onNotEntitled: "skip"`,
             and `Deny { reason: "not-entitled" }` under "deny". Core then
             records a skip as "skipped-policy" and, for a veto-role
             contribution, a deny as "denied-policy", ending the dispatch
             with `Denied { cause: "denied-policy", reason }`; a `Deny` for
             an enrich-role or advisory-role contribution is recorded as
             "skipped-policy" (core BEH-BR-302, BEH-BR-305, BEH-BR-312).
             The same answer MUST be given for a declaration of a plugin not
             yet loaded (`step.declared`), so that a not-entitled
             declaration is not woken (core BEH-BR-309).
```

```
REQUIREMENT: The policy MUST answer `Run` when `step.labels` holds an
             essential label (01, BEH-EN-007), counting it as an essential
             pass, and when `step.owner` has no `pluginId` (a contribution
             registered by application code, not a plugin).
```

```
REQUIREMENT: Documentation MUST state that `Entitlement.contributionPolicy`
             requires the `Entitlement` service, which a plugin's `build`
             cannot require (core BEH-BR-002), so a hook point that uses it
             MUST be made by application code (`HookPoint.make` outside any
             plugin), not by a plugin; a hook point a plugin owns cannot
             use it.
```

```
REQUIREMENT: The policy MUST NOT fail or die: an unavailable port is
             answered from the state 01, BEH-EN-005, serves. A policy that
             failed would be treated by core as an error of the
             contribution under `onError` (core BEH-BR-302).
```

```
REQUIREMENT: The package MUST NOT wrap a contributor's hook so that it
             returns `Pass` or `Veto` on the contributor's behalf.
             Documentation MUST state that a not-entitled contribution is
             skipped or, under "deny", denied by the hook point's policy —
             recorded as the point's decision with the policy's reason,
             never as a pass and never as the contributor's veto.
```

```
REQUIREMENT: Documentation MUST state the limit of core gap G64: a veto
             plugin that is loaded but not active (`waiting`, `failed`,
             `disabled`) has no hook and no declaration, so the policy is
             never consulted for it and a dispatch can be `Allowed` without
             its veto. An owner that relies on an entitled veto
             contributor MUST keep it active or monitored; the policy cannot
             detect its absence.
```

`onNotEntitled` is the owner's choice because it depends on what the point
decides. For a feature — a loyalty discount — a contributor whose licence
lapsed steps aside ("skip"). For a control whose owner sells the veto as a
licensed check, a lapsed licence must not silently remove the check, so the
point denies ("deny"), and the record names the policy, not the contributor,
as the reason (core closed URS gap G62 with this outcome). A wrapper inside
the contributor's hook could only return a result core records as the
contributor's own. The policy belongs to the hook point's owner because
whether entitlement applies at a hook point is a property of what that hook
point decides, as is its failure policy.

**Settled here.** (1) The gate consults the port for `install`, and for
`replace` when the application says so; `enable` and the recovery operations
are not entitlement-gated. (2) The gate never defers. (3) `checkTimeout`
must be shorter than the piece's own `timeout`, checked when the piece is
built; the composite bound is the host's `gateTimeout`, documented. (4) The
runtime stream is the core seam on `Plugin.Runtime` (BEH-BR-089), with core's
own `unmetered` mode when unwired. (5) A not-entitled hook contribution is
skipped or denied by the hook point's `policy`, as its owner states, recorded
by core as "skipped-policy" or "denied-policy", never an error and never a
result attributed to the contributor. (6) An `undo` request of an atomic
`reconcile` is allowed without consulting the port (BEH-EN-009).

**Settled at integration.** The core seam of BEH-EN-013 is specified in
core BEH-BR-089 (CCR-BR-020, CCR-BR-022), so the alternative of a package
service reading `CurrentPlugin` (BEH-BR-257) is not needed.

---

_Previous: [01 — Entitlement Port](./01-entitlement-port.md)_ · _Next: [03 — Budgets](./03-budgets.md)_
