# 31 — Hook Points

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-BEH-31                                               |
> | Revision       | 0.13                                                         |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.13 (2026-11-11): Settled (2) the loader's kill switch removes a revoked plugin only when it is of its scope and reports it otherwise (loader BEH-LD-031) (CL3) (SPEC-AUDIT-08) (CCR-BR-040)<br>0.12 (2026-11-11): BEH-BR-298 Settled (2): the loader's kill switch removes a revoked plugin with `Host.remove`, not through `reconcile` (CL12) (SPEC-AUDIT-07) (CCR-BR-039)<br>0.11 (2026-11-11): BEH-BR-302 `settle` runs in a hook-point-supervised fiber that the dispatch never awaits; BEH-BR-303 Settled (4) (C8) (SPEC-AUDIT-05) (CCR-BR-037)<br>0.10 (2026-11-10): BEH-BR-306 a hook inherits `CurrentTransition` beside `HeldPlugins` (H1) (CCR-BR-035)<br>0.9 (2026-11-10): BEH-BR-307 `Selector.use` fails `NoImplementation` when the chosen id leaves the view before its hold is taken (audit round 2, Low) (CCR-BR-034)<br>0.8 (2026-11-08): BEH-BR-305 and BEH-BR-309 a link without `hostId` counts as `HostLink.none` and is recorded "none" (host-core prototype finding G-P20); BEH-BR-309 a "waking" declaration is skipped only after a wait that ran to the end of a non-empty wake window (G-P21); check REQ-BR-092 amended (CCR-BR-030)<br>0.7 (2026-11-08): BEH-BR-302 `policy` consulted once per contribution or declaration per dispatch, a woken contribution reuses its pre-wake decision; no `settle` for a declaration answered `Run` and never called, recorded as URS gap G70 (agent review R3-17) (CCR-BR-029)<br>0.6 (2026-11-08): BEH-BR-297 option `allowNoLink`; BEH-BR-305 record field `link`; BEH-BR-309 declarations matched by id, owner and role, "idling" and "refused" statuses, `HostLink.none` and failed or late reads deny on a veto point, enrich allowance in the wake window, a long "waking" declaration not waited for again, Settled (5)–(7); BEH-BR-312 G63 closed by `settle` (agent review R1-03–R1-06, R1-08–R1-10, R1-13) (CCR-BR-029)<br>0.5 (2026-11-08): BEH-BR-297 `timeout` equal to `deadline` refused when a veto may be woken (host-core prototype finding G-P3); BEH-BR-309 an empty wake window wakes and records "wake-timeout" without waiting (G-P3), a woken contribution takes part while its plugin is `starting` (G-P4); BEH-BR-302 `settle` outcomes for timeout, deadline, interruption and revocation (G-P11) (CCR-BR-028)<br>0.4 (2026-11-08): BEH-BR-307 `Selector.make` takes a contract `range` (26, BEH-BR-233) (CCR-BR-025); BEH-BR-302 `settle` step, closing URS gap G63; BEH-BR-305 record `correlationId` from `CurrentCorrelation` and BEH-BR-306 hook calls run with it; check 79 covers `settle` (CCR-BR-026)<br>0.3 (2026-11-08): declared contributions of plugins not yet loaded are read through the `HostLink` and woken or denied (BEH-BR-309); per-contribution `onError` within what the point allows and `breakerScope` (BEH-BR-310); ordered phases enrich → veto → advise, veto hooks see the enrichments (BEH-BR-311, BEH-BR-300, BEH-BR-301, BEH-BR-303); targets seen by admission and a policy deny recorded as "denied-policy", option `skip` renamed `policy` (BEH-BR-312); checks 92–95 (CCR-BR-024)<br>0.2 (2026-11-08): empty `codes` allowed, a veto registration then refused; `decisions` carries dispatch and breaker records; breaker transitions no longer host events; `who` before the registry's access check; unowned hooks run with no principal; a deadline interruption is outcome "deadline" and does not feed the breaker (CCR-BR-022)<br>0.1 (2026-11-08): Initial draft (CCR-BR-019) |

---

Applications regularly need several plugins to take part in one decision:
may this command run, what should be added to it, what should the operator
be told about it. The event bus has a dispatch for that shape — `waterfall`
— but it lets any `around` listener short-circuit the chain, it has no
registration rule, no time budget for the whole dispatch, and no record of
which listener decided ([16 — Event Bus](./16-event-bus.md), BEH-BR-143).
Those are the right properties for middleware and the wrong ones for policy.
A hook point is the helper for policy: a named extension point, built on a
`ContributionRegistry` ([19 — Contribution Registry](./19-contribution-registry.md)),
whose contributions declare a role (veto, enrich or advisory), are admitted
by a rule the application supplies, run in three ordered phases (enrich,
then veto, then advise) in a deterministic order under a per-hook timeout and
a per-dispatch deadline, are skipped by a circuit breaker after repeated
failure, and produce a decision record that names the contribution that
decided. A contribution that a plugin not yet loaded declares in its manifest
is not passed over: the dispatch wakes it or denies
([27 — Manifest and Lazy Activation](./27-manifest-and-lazy-activation.md),
[ADR-BR-050](../decisions/050-dormant-veto-and-hook-phases.md)). The same file shows how several
implementations of one contract are selected per call site without a second
provider of one key ([ADR-BR-003](../decisions/003-one-provider-per-key-per-realm.md)).
It has no SPEC.md source section; it resolves two conflicts recorded by the
architecture review of 2026-11-08 — `waterfall` short-circuit without
registration rules, and per-call timeout with sticky failure but no budget or
breaker — without changing the bus, `failed` or `retry`
([ADR-BR-046](../decisions/046-hook-points.md)). This file owns
BEH-BR-297–312 and uses all sixteen: BEH-BR-309–312, reserved until revision
0.3, close the gaps a recheck of 2026-11-08 found (a dormant veto skipped, an
`onError` per point only, a breaker per contribution only, no veto after
enrichment, an admission rule blind to targets, no policy deny — URS gap G62).

> **What core does not do — and who does**
>
> Core defines no tiers, no publishers, no certification and no label keys.
> Who may veto is a rule the application writes over labels the application
> supplies. Core does not render veto messages, store decision records, or
> write them to the `AuditSink`: a decision record is returned to the
> dispatcher, which records it in its own trail if it must. A hook point is
> not consulted by the host and cannot veto a host lifecycle operation; that
> is the `OperationGate` port alone ([25 — Operation Gate](./25-operation-gate.md)).
> A hook point running in-process code is not a sandbox: an admitted hook can
> do anything its plugin can do ([BEH-BR-150](./17-realms-and-interception.md#beh-br-150-a-realm-is-not-a-security-boundary)).

Planned source: `packages/core/src/HookPoint.ts` and
`packages/core/src/Selector.ts` *(Planned)*. The owner identity a hook point
reads comes from the plugin principal of
[28 — Plugin Principal and Mandatory Policy](./28-plugin-principal-and-mandatory-policy.md);
the deadline annotation it honours comes from
[30 — Operation Context Annotations](./30-operation-context-annotations.md);
the declared contributions of plugins not yet loaded, and the wake it asks
for, come through the `HostLink` of
[27 — Manifest and Lazy Activation](./27-manifest-and-lazy-activation.md)
(BEH-BR-250).

## BEH-BR-297: A hook point is a helper over a registry, outside the Host

> **See:** [ADR-BR-046](../decisions/046-hook-points.md), [ADR-BR-024](../decisions/024-shared-state-helpers.md)
> **Satisfies:** [URS-BR-036](../urs.md#urs-br-036-let-several-plugins-take-part-in-one-decision-under-a-stated-failure-policy)

```ts
// illustrative — not type-checked
type HookRole = "veto" | "enrich" | "advisory"

type HookResult<Enrich, Advice, Code extends string> =
  | { readonly _tag: "Pass" }                                                // any role
  | { readonly _tag: "Veto"; readonly code: Code;
      readonly params?: Readonly<Record<string, string | number | boolean>> } // role "veto" only
  | { readonly _tag: "Enrich"; readonly value: Enrich }                       // role "enrich" only
  | { readonly _tag: "Advise"; readonly value: Advice }                       // role "advisory" only

type Hook<In, Enrich, Advice, Code extends string, Target = never> =
  (input: In, context: HookContext<Enrich, Target>) => Effect.Effect<HookResult<Enrich, Advice, Code>, unknown>

interface HookPointOptions<In, Enrich, Advice, Code extends string, Target = never, Sel = never> {
  readonly codes: readonly Code[]                         // the closed set of veto codes
  readonly enrichment?: Schema.Schema<Enrich>             // checked on every Enrich result
  readonly advice?: Schema.Schema<Advice>                 // checked on every Advise result
  readonly who: AdmissionRule<Sel>                        // BEH-BR-298; no default
  readonly labelsOf?: (owner: HookOwner) => Labels        // BEH-BR-298; default: no labels
  readonly timeout: Duration.Input                        // per hook call (BEH-BR-302)
  readonly deadline: Duration.Input                       // per dispatch (BEH-BR-303)
  readonly onError: OnErrorPolicy                         // veto-role failures (BEH-BR-302, BEH-BR-310)
  readonly breaker?: BreakerOptions | "off"               // BEH-BR-304; default { failures: 5, window: "1 minute", cooldown: "30 seconds" }
  readonly breakerScope?: "contribution" | "plugin"       // BEH-BR-310; default "contribution"
  readonly dormant?: DormantPolicy                        // BEH-BR-309; default { veto: "wake", enrich: "skip", advisory: "skip" }
  readonly targets?: TargetOptions<In, Target, Sel>       // BEH-BR-312; default: no targets (every contribution matches)
  readonly drainTimeout?: Duration.Input | "forever"      // passed to the registry; default 30 seconds
  readonly policy?: ContributionPolicy<In, Target, Sel>   // BEH-BR-302, BEH-BR-312; e.g. entitlement or budget; default none
                                                          // (named `skip` before revision 0.3)
  readonly settle?: SettleStep<In, Target>                // BEH-BR-302; runs after each call the policy let run; default none
  readonly allowNoLink?: boolean                          // BEH-BR-309; default false: HostLink.none counts as no link
                                                          // on a point with codes (CCR-BR-029)
}

// "deny" and "skip" are a default with nothing else allowed; the object form lets a
// contribution choose its own `onError` from `allow` (BEH-BR-310).
type OnErrorPolicy =
  | "deny" | "skip"
  | { readonly default: "deny" | "skip"; readonly allow: readonly ("deny" | "skip")[] }

// A string sets the veto role only (BEH-BR-309).
type DormantPolicy =
  | "wake" | "deny"
  | { readonly veto?: "wake" | "deny"; readonly enrich?: "wake" | "skip"; readonly advisory?: "wake" | "skip" }

interface TargetOptions<In, Target, Sel> {                // BEH-BR-312
  readonly descriptor: (input: In) => Target              // pure: what this dispatch is about (a command id, tags, an owner)
  readonly selector: Schema.Schema<Sel>                   // what a contribution may name at registration
  readonly matches: (selector: Sel, target: Target) => boolean   // pure
}

// Consulted once per contribution or declaration per dispatch, before its hook call (or before a
// declared contribution is woken; the woken contribution reuses that decision):
// Run calls the hook, Skip passes it over, Deny ends a veto phase as "denied-policy".
type ContributionPolicy<In, Target, Sel> = (step: {
  readonly id: string; readonly role: HookRole; readonly owner?: HookOwner; readonly labels: Labels
  readonly declared: boolean                              // true for a declaration of a plugin not yet loaded (BEH-BR-309)
  readonly selector?: Sel                                 // the contribution's target selector, when it named one
}, input: In, target: Target | undefined) => Effect.Effect<PolicyDecision>
type PolicyDecision =
  | { readonly _tag: "Run" }
  | { readonly _tag: "Skip"; readonly reason: string }
  | { readonly _tag: "Deny"; readonly reason: string }    // veto role only; BEH-BR-312

// Called once after each hook call that `policy` answered with Run; never for Skip, Deny or calls not made.
// A declaration answered Run whose wake failed or timed out is not called and gets no settle (URS gap G70).
type SettleStep<In, Target> = (step: {
  readonly id: string; readonly role: HookRole; readonly owner?: HookOwner; readonly labels: Labels
  readonly outcome: "passed" | "vetoed" | "enriched" | "advised" | "failed" | "timeout" | "interrupted" | "revoked"
}, input: In, target: Target | undefined) => Effect.Effect<void>
// outcome "timeout": ended by the per-hook `timeout`; "interrupted": by the dispatcher's
// interruption or the effective deadline (recorded "deadline", BEH-BR-303); "revoked": its
// contribution was revoked (CCR-BR-028)

interface HookPoint<In, Enrich, Advice, Code extends string, Target = never, Sel = never> {
  readonly id: string
  readonly register: (
    id: string,
    hook: Hook<In, Enrich, Advice, Code, Target>,
    options: {
      readonly role: HookRole
      readonly priority?: number
      readonly onError?: "deny" | "skip"                  // BEH-BR-310; default: the point's default
      readonly target?: Sel                               // BEH-BR-312; default: every target
    }
  ) => Effect.Effect<void, DuplicateContribution | HookRegistrationRefused, Scope.Scope>
  readonly dispatch: (input: In, options?: { readonly deadline?: Duration.Input }) =>
    Effect.Effect<HookOutcome<Enrich, Advice, Code>>             // never fails (BEH-BR-302)
  readonly view: Effect.Effect<HookPointView>                     // ids, roles, owners, priorities, onError, targets, breaker states
  readonly decisions: Stream.Stream<HookDecisionRecord | HookBreakerRecord>   // BEH-BR-304, BEH-BR-305; a feed, not a log
}

declare const HookPoint: {
  make<In, Enrich = never, Advice = never, Code extends string = never, Target = never, Sel = never>(
    id: string, options: HookPointOptions<In, Enrich, Advice, Code, Target, Sel>
  ): Effect.Effect<HookPoint<In, Enrich, Advice, Code, Target, Sel>, never, Scope.Scope>
}

// Application setup: one hook point, provided as a stable base service.
class BeforeCheckout extends Context.Service<BeforeCheckout,
  HookPoint<Basket, LoyaltyLine, Card, "age-check" | "stock-hold">>()("example/BeforeCheckout") {}
```

```
REQUIREMENT: `HookPoint` MUST be a helper outside the `Host` interface. It
             MUST NOT change plugin state, and MUST NOT read it except the
             declared contributions a `HostLink` returns (BEH-BR-309; 27 —
             Manifest and Lazy Activation, BEH-BR-250). Its only effect on
             the host MUST be the `wake` that BEH-BR-309 asks for through
             that link. The host MUST NOT consult any hook point on any host
             operation.
```

```
REQUIREMENT: A hook point MUST store its contributions in a
             `ContributionRegistry` made with `make`, named after the hook
             point's `id`, so that contribution uniqueness, scope-bound
             removal, LIFO cleanup, revisioned views, ownership reporting to
             `inspect` and bounded removal (BEH-BR-161–168) apply unchanged.
             `register` MUST add one contribution under `id` for the
             lifetime of the caller's `Scope`.
```

```
REQUIREMENT: The lifetime of a hook point MUST be the scope given to
             `make`. When that scope closes, the hook point MUST stop
             admitting dispatches (a dispatch begun afterwards returns the
             outcome of an empty hook point) and its registry MUST close as
             BEH-BR-162 specifies.
```

```
REQUIREMENT: `HookPoint.make` MUST reject, as a defect, options in which a
             code repeats, `timeout` or `deadline` is not a positive finite
             duration, or `timeout` exceeds `deadline`, or `timeout` equals
             `deadline` while `codes` is non-empty and the veto role's
             `dormant` policy is "wake" (the default; BEH-BR-309, whose wake
             window would be empty), or the object form
             of `onError` has an empty `allow` or a `default` not in
             `allow`, or `dormant` is a string while `codes` is empty. An
             empty `codes` is valid: it makes a hook point without vetoes,
             and `register` with `role: "veto"` on it MUST fail with
             `HookRegistrationRefused` and register nothing.
```

A hook point is normally provided as a base service, like a registry, so
that it outlives every contributor and every plugin that dispatches it
resolves the same instance. The type parameters are the gap report's
`HookPoint.make<In, Decision>` spelled out: the decision a hook may return is
the union `HookResult<Enrich, Advice, Code>`, constrained by the role it was
registered with.

**Settled here.** (1) A hook point is a third helper beside
`ContributionRegistry` and `Generation`, not a mode of the bus: the bus's
`waterfall` keeps its behaviour (BEH-BR-308). (2) `dispatch` never fails: a
policy decision is a value (`Allowed` or `Denied`), and every error of a hook
is converted into that value under the failure policy, so a dispatcher cannot
forget to handle a hook outage. A defect of the hook point itself (a bug in
core) still propagates as a defect.

## BEH-BR-298: Registration declares a role and is admitted by the application's rule

> **Invariant:** [INV-BR-040](../invariants.md#inv-br-040-only-an-admitted-veto-contribution-decides-a-hook-dispatch)
> **See:** [ADR-BR-046](../decisions/046-hook-points.md)
> **Satisfies:** [URS-BR-036](../urs.md#urs-br-036-let-several-plugins-take-part-in-one-decision-under-a-stated-failure-policy)
> **Risk:** [RSK-BR-032](../gxp/03-risk-assessment.md#rsk-br-032)

```ts
// illustrative — not type-checked
interface HookOwner {
  readonly pluginId?: string        // absent when registered by application code, not a plugin
  readonly realm?: string
}
type Labels = Readonly<Record<string, string>>
interface Contributor extends HookOwner { readonly labels: Labels }
type AdmissionRule<Sel = never> =
  (contributor: Contributor, role: HookRole, hookPoint: string, request: AdmissionRequest<Sel>) => boolean
interface AdmissionRequest<Sel> {                // what the contribution asks for (BEH-BR-310, BEH-BR-312)
  readonly onError?: "deny" | "skip"             // its effective onError; veto role only
  readonly target?: Sel                          // its decoded target selector; absent = every target
  readonly declared: boolean                     // true when evaluated for a declaration of a plugin not yet loaded (BEH-BR-309)
}

class HookRegistrationRefused extends Schema.TaggedError<HookRegistrationRefused>()("HookRegistrationRefused", {
  hookPoint: Schema.String, id: Schema.String, role: Schema.String
}) {}

// An application's rule: only code it labels "shipped" may veto; anyone may advise.
const who: AdmissionRule = (c, role) => role === "advisory" || c.labels["origin"] === "shipped"
```

```
REQUIREMENT: `register` MUST determine the owner from the plugin principal
             of the calling fiber (28 — Plugin Principal and Mandatory
             Policy) when one is set, and MUST record no owner when the
             caller is not plugin code. The owner MUST NOT be taken from an
             argument of `register`.
```

```
REQUIREMENT: `register` MUST compute the contributor's labels with
             `labelsOf(owner)` (no labels when `labelsOf` is absent) and MUST
             call `who(contributor, role, id, request)` exactly once, with
             `request` carrying the contribution's effective `onError`
             (BEH-BR-310), its decoded target selector when it named one
             (BEH-BR-312) and `declared: false`, before the
             contribution is added to the hook point's registry; only when
             `who` allows does `register` call the registry's `add`, which
             consults a wired `AccessPolicy` (28 — Plugin Principal and
             Mandatory Policy, BEH-BR-264) and dies with `AccessDenied` on a
             denial. When `who` returns false, `register`
             MUST fail with `HookRegistrationRefused` and MUST register
             nothing. When `labelsOf` or `who` fails or dies, `register` MUST
             fail with `HookRegistrationRefused` and MUST register nothing.
```

```
REQUIREMENT: The role, owner, labels, effective `onError` and target selector
             of a contribution MUST be fixed when it is registered. A
             contribution MUST NOT change any of them; a plugin that wants
             another registers another contribution, subject to the rule
             again.
```

```
REQUIREMENT: `HookPointOptions.who` MUST be required. Core MUST NOT export a
             default rule, an "allow everyone" constant or a tier vocabulary.
```

```
REQUIREMENT: A hook MUST be able to return only the results of its role
             (BEH-BR-297). A result outside its role — a `Veto` from an
             enrich or advisory hook, an `Enrich` from a veto hook — MUST be
             treated as an error of that hook (BEH-BR-302).
```

The rule runs at registration, not at dispatch, so that a refused hook never
appears in a view and a dispatch never has to evaluate policy under its
deadline. Reading the owner from the principal rather than from an argument
is what makes the rule meaningful: a plugin cannot register "as" another
plugin. Labels are the application's vocabulary — an origin, a publisher, a
review status read from a manifest
([27 — Manifest and Lazy Activation](./27-manifest-and-lazy-activation.md)) —
and core passes them through without interpreting a single key.

**Settled here.** (1) There is no default rule, for the reason
[ADR-BR-032](../decisions/032-operation-gate.md) gives for the gate: a
shipped "anyone" rule is a control that does nothing and looks like one. An
application that genuinely wants anyone to veto writes `() => true`, and the
choice is visible in its code. (2) Labels are evaluated once, at
registration. A plugin whose labels change (a publisher revoked) must be
replaced or removed for the change to take effect — which the loader's kill
switch does by removing it with `Host.remove` when it is of the kill switch's
scope, never through `reconcile`, and only reports it otherwise (loader
BEH-LD-029, BEH-LD-031). (3) Registration by application code
(no owner) is allowed and goes through the same rule with
`pluginId` absent; the rule decides whether unowned code may veto. (4) The
rule sees what the contribution asks for as well as who asks: a role, a
failure policy and a target. "Only shipped code may veto with `onError:
"deny"`" and "no plugin may hook commands of another publisher" are rules
over that request (BEH-BR-310, BEH-BR-312). The same rule is evaluated for a
contribution a plugin not yet loaded declares in its manifest, with
`declared: true` (BEH-BR-309), so a declaration never has more authority
than the registration it stands for.

## BEH-BR-299: Order is priority then id, over the view at the start of the dispatch

> **Invariant:** [INV-BR-040](../invariants.md#inv-br-040-only-an-admitted-veto-contribution-decides-a-hook-dispatch)
> **See:** [ADR-BR-046](../decisions/046-hook-points.md), [ADR-BR-024](../decisions/024-shared-state-helpers.md)
> **Satisfies:** [URS-BR-036](../urs.md#urs-br-036-let-several-plugins-take-part-in-one-decision-under-a-stated-failure-policy)

```
REQUIREMENT: A dispatch MUST take the registry view current when its wake
             step ends (BEH-BR-309) — at its start when the step wakes
             nothing — and MUST hold every contribution of that view for
             the rest of the dispatch, as `useAll` does (BEH-BR-166). A
             contribution added after the view is taken MUST NOT take part;
             one whose removal begins after it MUST be waited for, under
             the registry's `drainTimeout`, by that removal.
```

```
REQUIREMENT: Within each phase (BEH-BR-300, BEH-BR-301, BEH-BR-311), contributions MUST
             be taken in the view's order: `priority` ascending, ties broken
             by `id` in code-unit order (BEH-BR-165). Registration order and
             timing MUST NOT affect the order.
```

```
REQUIREMENT: The decision record (BEH-BR-305) MUST carry the registry
             revision of the view the dispatch used.
```

Priority then id, rather than the bus's priority then registration order,
makes the order a function of what is registered, not of when: two hosts
that activate the same plugins in a different order dispatch a hook point
identically. That is the property the confluence rule of
[18 — Reconciliation and Confluence](./18-reconciliation-and-confluence.md)
asks of everything else.

**Settled here.** Holding the snapshot for the whole dispatch costs a removal
at most one deadline (BEH-BR-303), and removes the bus's "withdrawn before
its turn" case (BEH-BR-142) from hook points. A contribution revoked by the
registry's `drainTimeout` during a dispatch (possible only when
`drainTimeout` is shorter than the deadline) is an error of that hook.

## BEH-BR-300: The veto phase — the first admitted veto decides

> **Invariant:** [INV-BR-040](../invariants.md#inv-br-040-only-an-admitted-veto-contribution-decides-a-hook-dispatch)
> **See:** [ADR-BR-046](../decisions/046-hook-points.md), [ADR-BR-050](../decisions/050-dormant-veto-and-hook-phases.md)
> **Satisfies:** [URS-BR-036](../urs.md#urs-br-036-let-several-plugins-take-part-in-one-decision-under-a-stated-failure-policy)
> **Risk:** [RSK-BR-032](../gxp/03-risk-assessment.md#rsk-br-032)

```ts
// illustrative — not type-checked
type HookVerdict<Code extends string> =
  | { readonly _tag: "Allowed" }
  | { readonly _tag: "Denied";
      readonly by?: string;                         // contribution or declaration id; absent only for "no-host-link" and "target-failed"
      readonly cause:
        | "veto" | "hook-failed" | "hook-timeout" | "breaker-open" | "deadline"
        | "denied-policy"                           // BEH-BR-312
        | "dormant" | "wake-failed" | "wake-timeout" | "no-host-link"   // BEH-BR-309
        | "target-failed";                          // BEH-BR-312
      readonly code?: Code;                         // present when cause = "veto"
      readonly params?: Readonly<Record<string, string | number | boolean>>
      readonly reason?: string }                    // present when cause = "denied-policy": the policy's reason
```

```
REQUIREMENT: After the enrich phase (BEH-BR-311), a dispatch MUST run the
             veto-role contributions of its view one at a time, in order,
             each receiving the dispatch input and the enrichments of the
             enrich phase (BEH-BR-306, BEH-BR-311). The first that returns
             `Veto` MUST end the phase with `Denied { by, cause: "veto",
             code, params }`; the remaining veto-role contributions MUST NOT
             be called and MUST appear in the record as "not-run".
```

```
REQUIREMENT: A `Veto` whose `code` is not in `HookPointOptions.codes`, or
             whose `params` hold a value that is not a string, a finite
             number or a boolean, MUST be treated as an error of that hook
             (BEH-BR-302), never as a veto.
```

```
REQUIREMENT: Only a veto-role contribution admitted by the rule — registered
             with role "veto", or declared with it by a plugin not yet
             loaded (BEH-BR-309) — MUST be able to produce `Denied`, whether
             by `Veto`, under an effective `onError: "deny"` (BEH-BR-310),
             by the deadline (BEH-BR-303), by a failed or late wake, or by
             the point's policy denying it (BEH-BR-312). The exceptions
             are "no-host-link" (BEH-BR-309) and "target-failed"
             (BEH-BR-312), which the hook point itself produces, failing
             closed, when it cannot see declarations or compute the
             target. No result or failure
             of an enrich or advisory contribution MUST change the verdict.
```

```
REQUIREMENT: When every veto-role contribution has returned `Pass` (or has
             been skipped under an effective `onError: "skip"` or by the
             policy), the verdict MUST be `Allowed`. An empty veto phase
             MUST be `Allowed`.
```

A veto carries a code from a closed set and primitive parameters, never free
text. The dispatcher renders the code through its own templates. This is how
an application keeps a hook from using a refusal as a message channel to the
operator — a review finding about veto texts used for phishing, generalised:
core cannot judge text, but it can refuse to carry any.

**Settled here.** Veto hooks run serially, not concurrently: the first veto
ends the phase, so a concurrent run would call hooks whose result cannot
matter, and their side effects would then depend on timing.

## BEH-BR-301: Enrich and advise phases — namespaced, and unable to decide

> **See:** [ADR-BR-046](../decisions/046-hook-points.md), [ADR-BR-050](../decisions/050-dormant-veto-and-hook-phases.md)
> **Satisfies:** [URS-BR-036](../urs.md#urs-br-036-let-several-plugins-take-part-in-one-decision-under-a-stated-failure-policy)

```ts
// illustrative — not type-checked
interface HookOutcome<Enrich, Advice, Code extends string> {
  readonly verdict: HookVerdict<Code>
  readonly enrichments: readonly { readonly id: string; readonly value: Enrich }[]   // view order
  readonly advice: readonly { readonly id: string; readonly value: Advice }[]        // view order
  readonly record: HookDecisionRecord
}
```

```
REQUIREMENT: The enrich-role contributions MUST run first, before any veto
             hook (BEH-BR-311), concurrently with each other, each receiving
             the dispatch input and never another contribution's result.
             Only when the veto phase ends `Allowed` MUST the dispatch run
             the advisory-role contributions, concurrently with each other,
             each receiving the dispatch input and the enrichments
             (BEH-BR-306), and never another advisory contribution's
             result.
```

```
REQUIREMENT: Each `Enrich` value MUST be checked against
             `HookPointOptions.enrichment` and each `Advise` value against
             `HookPointOptions.advice`; a value that does not conform MUST be
             treated as an error of that hook. Conforming values MUST be
             returned keyed by contribution id, in view order, whatever the
             order of completion.
```

```
REQUIREMENT: The hook point MUST NOT merge enrichments into the input or
             into each other. Each enrichment MUST stay under the id of the
             contribution that produced it.
```

```
REQUIREMENT: When the verdict is `Denied`, no advisory hook MUST be called
             and the outcome MUST carry empty `advice`. Its `enrichments`
             MUST be the conforming values the enrich phase produced — the
             values the veto hooks saw — or empty when the dispatch was
             denied before the enrich phase (BEH-BR-309, BEH-BR-312).
```

Keeping each enrichment under its contributor's id is the generic form of
"a hook writes only its own namespaced fields": core never lets one plugin's
result overwrite the input or another plugin's result, and what the
dispatcher does with the namespaced values is its own decision.

**Settled here.** (1) Enrich hooks do not see each other's results. A chain
in which each hook refines the previous one's output makes the result depend
on the order of unrelated plugins; a dispatcher that needs a pipeline builds
it explicitly. (2) Advisory hooks do not run when the dispatch is denied:
their results would describe a decision that is not going to happen.
(3) Revision 0.2 ran the veto phase first and enrichment only after an
`Allowed`, so a veto could never see what enrichers proposed. Revision 0.3
runs enrichment first (BEH-BR-311): a veto that must have the final say over
an enriched value — a pricing plugin that refuses a discount another plugin
proposed — can now be expressed, and the enrichments of a denied dispatch
are returned because they are part of what was decided on.

## BEH-BR-302: Per-hook timeout and the failure policy

> **Invariant:** [INV-BR-040](../invariants.md#inv-br-040-only-an-admitted-veto-contribution-decides-a-hook-dispatch), [INV-BR-042](../invariants.md#inv-br-042-hook-level-failure-never-changes-plugin-state)
> **See:** [ADR-BR-046](../decisions/046-hook-points.md), [ADR-BR-005](../decisions/005-failure-is-sticky.md)
> **Satisfies:** [URS-BR-036](../urs.md#urs-br-036-let-several-plugins-take-part-in-one-decision-under-a-stated-failure-policy)
> **Risk:** [RSK-BR-032](../gxp/03-risk-assessment.md#rsk-br-032)

```
REQUIREMENT: Each hook call MUST run in a child fiber supervised by the hook
             point, under `HookPointOptions.timeout` measured from the call
             with the `Clock` service, with the edge rules of a registry
             `use` (BEH-BR-166): on expiry the child is interrupted. The
             dispatcher's fiber MUST NOT be interrupted by the hook point.
```

```
REQUIREMENT: An error of a hook is any of: a typed failure, a defect, an
             interruption that the dispatcher did not cause, expiry of
             `timeout`, revocation of its contribution, a result outside its
             role (BEH-BR-298), a non-conforming value (BEH-BR-300,
             BEH-BR-301). Each MUST be recorded with its kind ("failed",
             "timeout") and MUST NOT reach the dispatcher as an error.
```

```
REQUIREMENT: For a veto-role contribution, an error MUST be resolved by its
             effective `onError` (BEH-BR-310): with "deny", the phase MUST
             end with `Denied { by, cause: "hook-failed" | "hook-timeout" }`;
             with "skip", the contribution MUST be recorded as skipped and
             the phase MUST continue. For enrich-role and advisory-role
             contributions, an error MUST always be recorded and skipped.
```

```
REQUIREMENT: A hook error MUST NOT change the state of the owning plugin,
             MUST NOT call `reportFailure` on its behalf and MUST NOT cause
             any host operation. The hook point MUST NOT retry a failed hook
             call within a dispatch.
```

```
REQUIREMENT: When `policy` is given, the hook point MUST consult it before
             each hook call, within the effective deadline. `Skip { reason }`
             MUST skip the contribution without calling it, record it as
             "skipped-policy" with `skipReason`, and MUST NOT be treated as
             an error: it MUST NOT deny under `onError: "deny"`, MUST NOT
             produce `Denied`, and MUST NOT count toward the contribution's
             breaker (BEH-BR-304). `Deny` is specified by BEH-BR-312. A
             `policy` that fails or dies MUST be treated as an error of that
             contribution under its effective `onError`, recorded as
             "failed", and MUST NOT count toward its breaker. `policy` MUST
             be consulted at most once per contribution or declaration per
             dispatch: a declaration answered `Run` before its wake
             (BEH-BR-309) MUST take part, once woken, under that same
             decision and MUST NOT be consulted again (CCR-BR-029).
```

```
REQUIREMENT: When `settle` is given, the hook point MUST call it exactly once
             for each hook call that `policy` answered with `Run` (or every
             call, when no `policy` is given), after the call has ended —
             returned, failed, timed out, been revoked or been interrupted,
             including by the dispatcher's interruption or the deadline —
             with that call's outcome. It MUST run uninterruptibly, bounded
             by the point's `timeout`, under no principal, and outside the
             dispatch's deadline, in a fiber supervised by the hook point
             that the dispatch never awaits: neither the next hook call, nor
             a later phase, nor the verdict, nor the return of `dispatch`
             MUST wait for any `settle` (INV-BR-041; CCR-BR-037). Its failure, death or timeout MUST be
             logged at warning level and MUST NOT change the dispatch's
             outcome, the decision record or the contribution's breaker.
             The outcome MUST be "timeout" for a call ended by the per-hook
             `timeout`, "interrupted" for one interrupted by the dispatch's
             effective deadline (recorded "deadline", BEH-BR-303) or by the
             dispatcher's interruption, "revoked" for one whose
             contribution was revoked, "failed" for any other error of
             BEH-BR-302, and otherwise the kind of its result ("passed",
             "vetoed", "enriched", "advised") (CCR-BR-028).
```

```
REQUIREMENT: An error's message MUST NOT be copied into the outcome or the
             decision record; only its kind and, for a typed failure, its
             `_tag` MAY appear.
```

```
REQUIREMENT: When the dispatcher is interrupted, every running hook MUST be
             interrupted, and the dispatch MUST end without an outcome; a
             record with verdict "abandoned" MUST be published on
             `decisions` (BEH-BR-305).
```

"deny" is the failure policy of a control: a hook that guards something and
cannot answer has not allowed it. "skip" is the failure policy of a feature:
a loyalty plugin that is down must never block a sale. `policy` is where an
entitlement or budget companion says "this contributor is not to be asked
now" — a decision about the contributor, not a failure of it — which is why
it is recorded apart from a pass and never feeds the breaker. `settle` is
where a budget the policy charged is returned when the call it paid for did
not do its work (entitlement BEH-EN-023, URS gap G63, CCR-BR-026). The hook point
owner chooses the default per hook point, because it is a property of what
the hook point decides; since revision 0.3 the owner may let each
contribution choose within a set it allows (BEH-BR-310).

**Settled here.** The architecture review recorded a conflict between a
per-call timeout with sticky failure and the need for a budget and a breaker.
It is resolved by keeping the two apart: a hook error is a fact about one
call of one callback, resolved inside the dispatch; plugin failure remains
the sticky, operator-cleared state of
[ADR-BR-005](../decisions/005-failure-is-sticky.md). A plugin that wants its
failing hook to fail the plugin calls `reportFailure` itself (10 — Runtime
Failure and Health).

## BEH-BR-303: A per-dispatch deadline bounds the whole decision

> **Invariant:** [INV-BR-041](../invariants.md#inv-br-041-a-hook-dispatch-returns-within-its-deadline)
> **See:** [ADR-BR-046](../decisions/046-hook-points.md)
> **Satisfies:** [URS-BR-036](../urs.md#urs-br-036-let-several-plugins-take-part-in-one-decision-under-a-stated-failure-policy)
> **Risk:** [RSK-BR-032](../gxp/03-risk-assessment.md#rsk-br-032)

```
REQUIREMENT: The effective deadline of a dispatch MUST be the least of
             `HookPointOptions.deadline`, the `deadline` option of
             `dispatch` when given, and the time remaining before the
             deadline annotation of the calling fiber's operation context
             (`Annotation.Deadline`, id `bridger:deadline`, value `{ at }` in
             epoch milliseconds from `Clock`) when one is present
             (30 — Operation Context Annotations, BEH-BR-290, BEH-BR-291). It
             MUST be measured from the start of the dispatch with the
             `Clock` service.
```

```
REQUIREMENT: When the effective deadline expires during the enrich or the
             veto phase, every running hook MUST be interrupted and recorded
             as "deadline", the veto-role contributions not yet called MUST
             be recorded as "skipped-deadline", the advise phase MUST NOT
             run, and the verdict MUST be decided from the veto-role
             contributions that had not completed (the one running, if any,
             and those not called): when one of them has the effective
             `onError` "deny" (BEH-BR-310), `Denied { by, cause: "deadline" }`
             where `by` is the first such in order, the running one first;
             otherwise `Allowed`.
```

```
REQUIREMENT: When the effective deadline expires during the advise phase,
             the hooks still running MUST be interrupted and recorded as
             "deadline"; the verdict MUST stay `Allowed` with the values
             completed so far.
```

```
REQUIREMENT: `dispatch` MUST return no later than the effective deadline
             plus the time needed to build the outcome. It MUST NOT wait for
             the finalizers of interrupted hooks: those finish in fibers
             supervised by the hook point, and each keeps its contribution
             held until its finalizers end.
```

The deadline is a budget for the decision, not for each hook. A
per-hook timeout alone cannot bound a dispatch: ten hooks at the limit take
ten limits. With a deadline, a counter that asks "may this sale go ahead"
gets an answer in the time it can afford, whatever the contributors do.

**Settled here.** (1) The dispatch does not wait for interrupted hooks'
finalizers. Waiting would hand the bound to the slowest finalizer of any
contributor; not waiting keeps the bound, while the held contribution still
makes a removal of that plugin wait for the finalizer (BEH-BR-167), so no
cleanup is skipped. (2) A deadline that expires before the veto phase has
finished, with no remaining veto contribution under "deny", yields `Allowed`
without running advisers: there is no time left for them, and running them
late would break the bound. (3) Because the enrich phase runs concurrently
and each call is bounded by `timeout`, it takes at most one `timeout`; a hook
point with both enrichers and vetoes SHOULD set `timeout` well below
`deadline`, so that the veto phase has time left after enrichment. (4) `settle`
runs beside the dispatch, never in its path (CCR-BR-037): awaited, each of N
serial vetoes would add up to one `timeout` after the deadline, and a
budget's refund has no bearing on the verdict.

## BEH-BR-304: A circuit breaker per contribution is hook-level state

> **Invariant:** [INV-BR-042](../invariants.md#inv-br-042-hook-level-failure-never-changes-plugin-state)
> **See:** [ADR-BR-046](../decisions/046-hook-points.md), [ADR-BR-005](../decisions/005-failure-is-sticky.md)
> **Satisfies:** [URS-BR-036](../urs.md#urs-br-036-let-several-plugins-take-part-in-one-decision-under-a-stated-failure-policy)
> **Risk:** [RSK-BR-032](../gxp/03-risk-assessment.md#rsk-br-032)

```ts
// illustrative — not type-checked
interface BreakerOptions {
  readonly failures: number          // errors within `window` that open the breaker (≥ 1)
  readonly window: Duration.Input
  readonly cooldown: Duration.Input  // open → half-open after this long
}
type BreakerState = "closed" | "open" | "half-open"
```

```
REQUIREMENT: Unless `breaker` is "off", the hook point MUST keep one breaker
             per contribution — or per owner under `breakerScope: "plugin"`
             (BEH-BR-310), where "the contribution" below reads "the owner's
             contributions at this hook point" — starting "closed". It MUST
             open when the contribution has had `failures` errors (BEH-BR-302, timeouts
             included) within `window`, measured with the `Clock` service.
             An interruption by the dispatch's effective deadline (outcome
             "deadline", BEH-BR-303) is not an error of the contribution and
             MUST NOT count toward its breaker; an expiry of the per-hook
             `timeout` (outcome "timeout") counts.
```

```
REQUIREMENT: While a breaker is "open", its hook MUST NOT be called. The
             contribution MUST be treated as an error of kind
             "breaker-open": for a veto-role contribution whose effective
             `onError` is "deny", `Denied { by, cause: "breaker-open" }`;
             otherwise skipped.
```

```
REQUIREMENT: After `cooldown`, the breaker MUST become "half-open": the next
             dispatch MUST call the hook once. A success MUST close the
             breaker and clear its error count; an error MUST reopen it for
             another `cooldown`. Concurrent dispatches MUST NOT make more
             than one half-open call at a time; the others MUST treat the
             contribution as "breaker-open".
```

```
REQUIREMENT: Under `breakerScope: "contribution"`, a breaker MUST belong to
             the contribution. When the contribution is removed, its breaker
             MUST be discarded; a contribution later added under the same id
             MUST start with a closed breaker. Under `breakerScope:
             "plugin"`, BEH-BR-310 states when the owner's breaker is
             discarded.
```

```ts
// illustrative — not type-checked
interface HookBreakerRecord {
  readonly type: "breaker"
  readonly hookPoint: string
  readonly scope: "contribution" | "plugin"           // BEH-BR-310
  readonly contribution: string                       // the contribution whose call caused the transition
  readonly owner?: HookOwner
  readonly state: BreakerState
  readonly at: string                                 // from Clock, ISO-8601 UTC with ms
}
```

```
REQUIREMENT: Every breaker transition MUST be published on the hook point's
             `decisions` stream as a `HookBreakerRecord` naming the hook
             point, the contribution, its owner and the new state, and MUST
             be logged at warning level. It MUST NOT be published on
             `Host.events`: a hook point is a helper outside the `Host`
             (13 — Observability and Diagnostics, BEH-BR-115).
```

```
REQUIREMENT: A breaker transition MUST NOT change plugin state, MUST NOT be
             written to the `AuditSink` and MUST NOT be described as a
             plugin failure or as audited.
```

A breaker protects the dispatcher from paying the timeout of a hook that is
known to be failing. It is a fact about one contribution at one hook point,
which is why it lives there and not in the plugin's state: the same plugin
may be healthy at every other hook point and in every service it provides.

**Settled here.** A half-open probe calls a hook again on a later dispatch.
That is not the automatic retry [ADR-BR-005](../decisions/005-failure-is-sticky.md)
forbids: no build runs, no failed call is repeated — each dispatch is a new
call with a new input — and the plugin's state is untouched. A breaker that
should never close on its own is expressed by removing the contribution,
which is a plugin's or an operator's decision.

## BEH-BR-305: The decision record names the contribution that decided

> **See:** [ADR-BR-046](../decisions/046-hook-points.md), [ADR-BR-007](../decisions/007-observation-primitives.md)
> **Satisfies:** [URS-BR-036](../urs.md#urs-br-036-let-several-plugins-take-part-in-one-decision-under-a-stated-failure-policy)
> **Risk:** [RSK-BR-032](../gxp/03-risk-assessment.md#rsk-br-032)

```ts
// illustrative — not type-checked
interface HookDecisionRecord {
  readonly hookPoint: string
  readonly dispatchId: string                         // from IdGenerator
  readonly correlationId?: string                     // the dispatching fiber's CurrentCorrelation, when set (22, BEH-BR-187)
  readonly startedAt: string                          // from Clock, ISO-8601 UTC with ms
  readonly elapsedMs: number
  readonly deadlineMs: number                         // the effective deadline
  readonly viewRevision: number
  readonly declarations?: "unseen"                    // BEH-BR-309: no HostLink and no veto codes
  readonly link?: string                              // BEH-BR-309: the hostId of the HostLink read, or "none" for
                                                      // HostLink.none; absent when there was no link (CCR-BR-029);
                                                      // a link without hostId is recorded as "none" (CCR-BR-030)
  readonly verdict: "allowed" | "denied" | "abandoned"
  readonly decidedBy?: { readonly id?: string; readonly owner?: HookOwner; readonly cause: string; readonly code?: string }
  readonly steps: readonly {
    readonly id: string
    readonly owner?: HookOwner
    readonly role: HookRole
    readonly declared?: true                          // BEH-BR-309: a declaration of a plugin not yet loaded
    readonly woken?: true                             // BEH-BR-309: registered by the wake step of this dispatch
    readonly outcome: "pass" | "veto" | "enrich" | "advise" | "failed" | "timeout" | "deadline"
                    | "breaker-open" | "skipped-policy" | "skipped-deadline" | "not-run"
                    | "denied-policy" | "not-targeted"                               // BEH-BR-312
                    | "dormant" | "wake-failed" | "wake-timeout" | "skipped-dormant"
                    | "declared-refused"                                             // BEH-BR-309
    readonly errorTag?: string
    readonly skipReason?: string                      // "skipped-policy" and "denied-policy" only: the policy's reason
    readonly elapsedMs?: number
  }[]
}
```

```
REQUIREMENT: Every dispatch MUST produce exactly one `HookDecisionRecord`
             (breaker records on the same stream are not dispatch records). `decidedBy`
             MUST be present exactly when the verdict is "denied", and MUST
             name the contribution or declaration that produced the
             `Denied` verdict and its cause; its `id` MUST be absent only
             for causes "no-host-link" (BEH-BR-309) and "target-failed"
             (BEH-BR-312).
```

```
REQUIREMENT: A record MUST list every contribution of the dispatch's view
             in view order, each with the outcome it had in this dispatch,
             then every declaration the wake step kept that did not become
             a contribution of the view, in code-unit order of id, with
             `declared: true` and its outcome (BEH-BR-309).
```

```
REQUIREMENT: A record MUST NOT contain the dispatch input, an enrichment or
             advice value, an error message, a cause or a stack. It MAY
             contain veto `code`s; it MUST NOT contain veto `params`.
```

```
REQUIREMENT: The record MUST be returned in `HookOutcome.record` and
             published on `decisions`, a stream with the rules of
             `Host.events` (a sliding buffer; a slow subscriber loses its
             oldest records). Core MUST NOT write a decision record to the
             `AuditSink`, and MUST NOT describe `decisions` as an audit
             trail.
```

The record is what a reviewer needs to answer "why was this refused, and by
whom": the deciding contribution and its owner, the view revision, and what
every other contribution did. The dispatcher — a command catalog, a
companion — is the party with an operation to attach it to, so it is the
party that stores it, through its own trail.

**Settled here.** (1) `params` are left out of the record because they are
the hook's data: a code is part of a closed vocabulary the application
reviewed; parameters may carry anything the input held. (2) The
`decisions` stream follows `Host.events`, not the audit writer: a hook point
on a counter's hot path must not wait on a sink, and the stream says
plainly that it can lose records.

## BEH-BR-306: The context a hook runs in

> **Invariant:** [INV-BR-016](../invariants.md#inv-br-016-a-re-entrant-wait-fails-fast)
> **See:** [ADR-BR-046](../decisions/046-hook-points.md), [ADR-BR-029](../decisions/029-attributable-mutations.md)
> **Satisfies:** [URS-BR-036](../urs.md#urs-br-036-let-several-plugins-take-part-in-one-decision-under-a-stated-failure-policy)

```ts
// illustrative — not type-checked
interface HookContext<Enrich, Target> {
  readonly hookPoint: string
  readonly dispatchId: string
  readonly remaining: Effect.Effect<Duration.Duration>   // until the effective deadline
  readonly phase: "enrich" | "veto" | "advise"            // BEH-BR-311
  readonly enrichments: readonly { readonly id: string; readonly value: Enrich }[]   // empty in the enrich phase
  readonly missing: readonly string[]                    // enrich contributions of the view with no conforming value; empty in the enrich phase
  readonly target?: Target                               // the dispatch's target descriptor, when the point has targets (BEH-BR-312)
}
```

```
REQUIREMENT: In the veto and advise phases, `HookContext.enrichments` MUST
             be the conforming enrichments of the enrich phase in view
             order, frozen, and `missing` MUST list, in view order, the ids
             of the enrich-role contributions of the view that produced no
             conforming value (failed, timed out, skipped, breaker-open, not
             targeted or interrupted by the deadline). In the enrich phase
             both MUST be empty. A hook MUST NOT be able to change either.
```

```
REQUIREMENT: A hook MUST run in the dispatcher's fiber context — tracing
             span, log annotations, `@bridger/core/HeldPlugins` and
             `@bridger/core/CurrentTransition` (09 — Leases, BEH-BR-088) — with
             `@bridger/core/CurrentActor` reset to `Actor.unattributed`, as
             a bus listener does (BEH-BR-144), and with the plugin principal
             of the contribution's owner (28 — Plugin Principal and
             Mandatory Policy). When the contribution has no owner, the hook
             MUST run with no plugin principal, whatever the dispatcher's
             fiber carries.
```

```
REQUIREMENT: Each hook call MUST run with the dispatcher's
             `CurrentCorrelation` (22 — Attributable Operations,
             BEH-BR-187); a host call a hook makes therefore records the
             dispatcher's correlation.
```

```
REQUIREMENT: A hook MUST receive the calling fiber's operation-context
             annotations read-only (30 — Operation Context Annotations). It
             MUST NOT be able to change the dispatcher's annotations.
```

```
REQUIREMENT: A hook point MUST be able to be dispatched from inside a hook
             of another hook point, and from a hook of the same hook point;
             each dispatch is bounded by its own deadline. Core MUST NOT
             detect recursion between hook points.
```

Resetting `CurrentActor` keeps an operator's identity out of plugin code
(BEH-BR-187). Setting the owner's principal means a host call a hook makes
is recorded on behalf of the plugin that owns the hook, not the plugin that
dispatched it. Inheriting `HeldPlugins` means a hook that, under a dispatcher
holding a lease, removes that dispatcher's provider fails with
`WouldDeadlock` rather than hanging; inheriting `CurrentTransition` does the
same for a hook dispatched from a build or a finalizer.

## BEH-BR-307: Several implementations of one contract: a registry and a selector per site

> **Invariant:** [INV-BR-001](../invariants.md#inv-br-001-one-provider-per-service-key-per-realm), [INV-BR-006](../invariants.md#inv-br-006-a-leased-provider-does-not-close-under-its-lease)
> **See:** [ADR-BR-046](../decisions/046-hook-points.md), [ADR-BR-003](../decisions/003-one-provider-per-key-per-realm.md)
> **Satisfies:** [URS-BR-014](../urs.md#urs-br-014-contribute-to-a-shared-extension-point-safely), [URS-BR-036](../urs.md#urs-br-036-let-several-plugins-take-part-in-one-decision-under-a-stated-failure-policy)

```ts
// illustrative — not type-checked
interface Selector<A, Site> {
  readonly candidates: (site: Site) => Effect.Effect<readonly string[]>      // ordered ids chosen by the policy
  readonly use: <B, E, R>(
    site: Site,
    run: (implementation: A, id: string) => Effect.Effect<B, E, R>,
    options?: { readonly timeout?: Duration.Input }
  ) => Effect.Effect<B, E | NoImplementation | LeaseRevoked | LeaseTimeout, R>
}

declare const Selector: {
  make<A, Site>(
    registry: ContributionRegistry.Registry<A>,
    choose: (view: ContributionRegistry.RegistryView<A>, site: Site) => readonly string[],  // pure
    options?: { readonly range?: ContractRange }   // contract registries only: `choose` sees only registry.within(range) (26, BEH-BR-233)
  ): Selector<A, Site>
}

class NoImplementation extends Schema.TaggedError<NoImplementation>()("NoImplementation", {
  registry: Schema.String
}) {}

// The contract key has one provider: the registry. Implementations contribute to it.
class Wholesalers extends Context.Service<Wholesalers, ContributionRegistry.Registry<OrderingApi>>()("example/Wholesalers") {}
const pick = Selector.make(wholesalers, (view, site: { readonly branch: string }) =>
  preferenceTable[site.branch] ?? view.entries.map((e) => e.id))
yield* pick.use({ branch: "north" }, (api) => api.placeOrder(order), { timeout: "5 seconds" })
```

```
REQUIREMENT: A contract with several implementations MUST be expressed as
             one provider of the contract's key — a registry, provided as a
             base service or by one plugin — into which the implementations
             contribute. Core MUST NOT allow two providers of one key in one
             resolution scope to express it (ADR-BR-003).
```

```
REQUIREMENT: `Selector.use(site, run)` MUST evaluate `choose(view, site)`
             against the current view, take the first returned id that is in
             the view, and run `run` through the registry's `use` for that
             id, so that the chosen implementation is held against removal
             for the call (BEH-BR-166). When no returned id is in the view it
             MUST fail with `NoImplementation` without running `run`. When
             the chosen id has left the view by the time the registry's
             `use` takes its hold (`ContributionUnavailable`, BEH-BR-166),
             `use` MUST likewise fail with `NoImplementation`, without
             running `run` and without trying another id; that error never
             leaves `Selector.use`.
```

```
REQUIREMENT: A selector MUST NOT fall back to another implementation when
             `run` fails, times out or is revoked. Core MUST NOT provide
             automatic failover. `candidates(site)` MUST return the chosen
             ids that are in the view, in the policy's order, for a caller
             that implements failover itself.
```

```
REQUIREMENT: `choose` MUST be a pure function of the view and the site. The
             selector MUST NOT cache a choice across calls.
```

```
REQUIREMENT: Selecting, removing or adding an implementation MUST NOT stop,
             restart or rebind any plugin. A dependent captures the
             registry, never an implementation.
```

The architecture review asked for "several implementations behind one
contract, plus a provider selector per site". One provider per key stays
exactly as it is: the provider is the registry, which removal ordering and
leases need to be unambiguous, and each implementation is a contribution,
which can come and go without restarting anyone. The selection is per call,
so changing the policy table changes the next call and nothing else.

**Settled here.** (1) No automatic failover. A call that timed out against
one implementation may have taken effect there; sending it to a second
implementation could perform it twice. Whether a call is safe to repeat
elsewhere is a property of the contract, which only the application knows;
`candidates` gives it what it needs to decide. (2) The selector is a function
over a registry, not a new kind of service, so a hook point can also be the
"registry" behind a site: an application that wants hooks to *advise* the
choice dispatches a hook point first and passes the advice to `choose`
through the site value.

## BEH-BR-308: What a hook point is not

> **See:** [ADR-BR-046](../decisions/046-hook-points.md), [ADR-BR-020](../decisions/020-typed-event-bus.md), [ADR-BR-032](../decisions/032-operation-gate.md)
> **Satisfies:** [URS-BR-024](../urs.md#urs-br-024-require-approval-before-a-regulated-change), [URS-BR-036](../urs.md#urs-br-036-let-several-plugins-take-part-in-one-decision-under-a-stated-failure-policy)
> **Risk:** [RSK-BR-014](../gxp/03-risk-assessment.md#rsk-br-014), [RSK-BR-032](../gxp/03-risk-assessment.md#rsk-br-032)

```
REQUIREMENT: The behaviour of `Bridger.Events` — including `waterfall`,
             whose `around` listeners may short-circuit without a
             registration rule — MUST remain as 16 — Event Bus specifies.
             Core documentation MUST direct a dispatcher that needs
             registration rules, a deadline or a decision record to a hook
             point, not to `waterfall`.
```

```
REQUIREMENT: Core MUST NOT describe a hook point as a means of authorising
             host lifecycle operations. A consumer's `OperationGate` MAY
             dispatch a hook point; the gate's answer remains the single
             decision the host acts on and records (25 — Operation Gate).
```

```
REQUIREMENT: Core MUST NOT describe the admission rule as isolation,
             sandboxing or code verification. It decides which contributions
             may take which role; it does not limit what an admitted hook
             can do.
```

A hook point restricts *authority over a decision*: which contributions may
end it, under what failure policy, within what time, with what record. It
does not restrict *capability*: an admitted in-process hook can read globals
and call anything its plugin can reach. Code that must not have that
capability does not run in the process (the remote companion's proxy
plugins); its proxy is what registers the hook, under the same rule.

## BEH-BR-309: A contribution declared by a plugin not yet loaded is woken or decides

> **Invariant:** [INV-BR-040](../invariants.md#inv-br-040-only-an-admitted-veto-contribution-decides-a-hook-dispatch), [INV-BR-046](../invariants.md#inv-br-046-a-declared-veto-of-a-plugin-not-yet-loaded-is-never-passed-over-unrecorded), [INV-BR-041](../invariants.md#inv-br-041-a-hook-dispatch-returns-within-its-deadline)
> **See:** [ADR-BR-050](../decisions/050-dormant-veto-and-hook-phases.md), [ADR-BR-042](../decisions/042-lazy-activation.md), [ADR-BR-046](../decisions/046-hook-points.md)
> **Satisfies:** [URS-BR-049](../urs.md#urs-br-049-keep-a-policy-decision-closed-while-a-contributor-to-it-is-not-yet-loaded), [URS-BR-036](../urs.md#urs-br-036-let-several-plugins-take-part-in-one-decision-under-a-stated-failure-policy)
> **Risk:** [RSK-BR-057](../gxp/03-risk-assessment.md#rsk-br-057), [RSK-BR-032](../gxp/03-risk-assessment.md#rsk-br-032)

A lazy plugin registers its hooks in its build, and its build runs only after
a trigger; reads never trigger ([27 — Manifest and Lazy Activation](./27-manifest-and-lazy-activation.md),
BEH-BR-245). Until revision 0.3, a dispatch therefore saw nothing of a
`dormant` plugin's veto and returned `Allowed`: a lazy veto failed open. The
manifest already declares the contribution (`contributions`, BEH-BR-241), and
the host can report it without running code (BEH-BR-250). A dispatch now
reads those declarations first, in a *wake step*, and either wakes the
plugin and waits for its hook within the deadline, or denies.

```ts
// illustrative — not type-checked
// From 27 (BEH-BR-250): read through the HostLink of the calling fiber.
interface DeclaredContribution {
  readonly registry: string; readonly id: string
  readonly role?: HookRole                       // from the manifest entry
  readonly target?: unknown                      // from the manifest entry; decoded with TargetOptions.selector
  readonly pluginId: string; readonly realm: string
  readonly status: "dormant" | "waking" | "load-failed" | "idling" | "refused"
}

// A veto point over plugins that may be lazy: the default wakes and waits.
const priceChange = yield* HookPoint.make<PriceChange, never, never, "below-cost">("example/price-change", {
  codes: ["below-cost"], who, timeout: "300 millis", deadline: "2 seconds", onError: "deny"
  // dormant omitted: { veto: "wake", enrich: "skip", advisory: "skip" }
})
```

```
REQUIREMENT: At the start of every dispatch, the hook point MUST read the
             declarations of the registry named after its `id` through the
             `HostLink` of the calling fiber (27 — Manifest and Lazy
             Activation, BEH-BR-250), within the effective deadline, and
             MUST record the link's `hostId` as `link` ("none" for
             `HostLink.none` and for any link without a `hostId`). It MUST keep each declaration unless the
             registry's current view holds a contribution with the same `id`
             whose `owner` (BEH-BR-163) is the declaration's `pluginId` and
             `realm` and whose role is the declaration's role. A contribution
             with the declared `id` but another owner or role MUST NOT
             remove the declaration: the declaration is kept and its step
             MUST carry `errorTag` "DuplicateContribution", and its wake
             (below) can complete only with a contribution of the declaring
             owner and role (CCR-BR-029).
```

```
REQUIREMENT: A point with a non-empty `codes` MUST end the dispatch at once
             with `Denied { cause: "no-host-link" }`, calling no hook and
             waking nothing, when the calling fiber has no `HostLink`; when
             the link is `HostLink.none` and the point was made without
             `allowNoLink: true` — a link without a `hostId` counts as
             `HostLink.none` for this rule, whatever it declares
             (CCR-BR-030, host-core prototype finding G-P20); and when the read fails (`HostClosed`, any
             other error or a defect) or does not finish within the
             effective deadline. In each of these cases a point with an
             empty `codes` MUST proceed without declarations and mark its
             record `declarations: "unseen"`. With `allowNoLink: true`,
             `HostLink.none` is a link that declares nothing (BEH-BR-250),
             and the declarations of any other link without a `hostId` are
             read as from any link;
             the option exists for unit tests of a point with no host, and
             documentation MUST say that it lets a dispatcher hide every
             declaration (CCR-BR-029).
```

```
REQUIREMENT: For each kept declaration, the hook point MUST take its role
             from the declaration, and "veto" when the declaration has none
             and `codes` is non-empty (a declaration without a role on a
             point without codes MUST be ignored and not recorded). It MUST
             then evaluate `who` once for it, with the contributor built
             from the declaration's `pluginId` and `realm` as BEH-BR-298
             builds it from a principal (labels from `labelsOf`), and with
             `request` carrying the point's default `onError` for a veto
             declaration, the target selector decoded from the
             declaration's `target` (absent when missing or not decodable:
             every target), and `declared: true`. A declaration `who`
             refuses, or for which `labelsOf` or `who` fails, MUST be
             recorded as "declared-refused" and MUST NOT be woken or
             decide anything. A declaration whose selector does not match
             the dispatch's target (BEH-BR-312) MUST be recorded as
             "not-targeted" and MUST NOT be woken.
```

```
REQUIREMENT: For each admitted declaration, the hook point MUST then consult
             `policy` when given (BEH-BR-312), before any wake: `Skip`
             records "skipped-policy" and wakes nothing; `Deny` on a veto
             declaration ends the dispatch with `Denied { by, cause:
             "denied-policy", reason }` and wakes nothing. Otherwise it MUST
             apply the `dormant` policy of the declaration's role:
             - "wake": call the link's `wake` with `OnContribution {
               registry: id, id }` in the declaration's realm, unless its
               status is "waking" (already woken), "load-failed" or
               "refused", and wait until a contribution with that id, the
               declaring owner and the declared role is in the registry,
               until the declaration's registration ends (load failed,
               removed, disabled, or failed in any phase) or `wake` fails,
               or until the wake window ends, whichever is first. A
               declaration with status "idling" MUST be woken (the trigger
               is kept and applied when the plugin reaches `dormant`, 27,
               BEH-BR-252) and waited for as one with status "dormant". The
               wake window is the effective deadline less one `timeout`, and
               less one more `timeout` when the registry's view at the start
               of the dispatch holds an enrich-role contribution or an
               enrich declaration is to be woken, measured from the start of
               the dispatch. A declaration with status "refused" MUST be
               recorded "wake-failed" without a wake. A declaration with
               status "waking" for which this hook point has already
               waited, in this or an earlier dispatch, until a non-empty
               wake window ended with no contribution arriving, MUST be
               recorded "wake-timeout" without waiting, until a dispatch
               reads it with another status; the window is that dispatch's
               own, whatever its length, and time alone never counts as
               such a wait. The point keeps that fact per (pluginId, realm,
               id), as hook-level state like a breaker (BEH-BR-304)
               (CCR-BR-029; CCR-BR-030, host-core prototype finding G-P21). A declaration whose contribution arrives
               in time MUST take part as a contribution of the view (step
               flag `woken`). Otherwise it MUST be recorded as
               "wake-failed" (registration ended, status "load-failed", or
               `wake` failed) or "wake-timeout" (window ended). When the
               window is empty or already over as the wake step begins — a
               call's `deadline` option or a `Deadline` annotation can leave
               less than one `timeout` — the hook point MUST still call
               `wake` as for "deny" and MUST record the declaration
               "wake-timeout" without waiting. A woken contribution MUST
               take part as soon as it is in the registry, while its plugin
               is still `starting`; when that activation later fails, the
               contribution leaves with the activation scope (BEH-BR-297,
               BEH-BR-162) and a decision it took stands. Documentation MUST
               say so (CCR-BR-028).
             - "deny" (veto only): call the link's `wake` as above without
               waiting, and record "dormant".
             - "skip" (enrich and advisory only): record "skipped-dormant";
               call nothing.
```

```
REQUIREMENT: A veto declaration recorded "dormant" MUST end the dispatch with
             `Denied { by, cause: "dormant" }`. A veto declaration recorded
             "wake-failed" or "wake-timeout" MUST be resolved by the point's
             default `onError` (a declaration has no `onError` of its own):
             "deny" ends the dispatch with `Denied { by, cause:
             "wake-failed" | "wake-timeout" }`; "skip" records it and the
             dispatch continues. An enrich or advisory declaration that was
             not woken in time MUST be recorded and skipped, never deny.
```

```
REQUIREMENT: The wake step MUST run before the enrich phase, waking every
             declaration to be woken concurrently. When it ends in `Denied`,
             no hook MUST be called, and `by` MUST be the first denying
             declaration in code-unit order of id, so the verdict does not
             depend on the order in which wakes settle. The dispatch's view
             (BEH-BR-299) MUST be taken when the step ends.
```

```
REQUIREMENT: Every `wake` a hook point calls MUST be made from the
             dispatcher's fiber, so that its `lazy-triggered` record carries
             the dispatcher's principal (27, BEH-BR-253). A hook point MUST
             NOT wake a plugin for any declaration other than those it kept
             and admitted, and MUST NOT interrupt or undo a wake when the
             dispatch ends: the plugin keeps starting and takes part in
             later dispatches.
```

```
REQUIREMENT: A declaration MUST NOT count toward any breaker (BEH-BR-304,
             BEH-BR-310) and MUST NOT be described as a contribution's
             error.
```

The wake window leaves one `timeout` for the woken hook to be called, and
one more for the enrich phase when it has anything to run, since that phase
now runs between the wake step and the vetoes; a point whose `timeout`
equals its `deadline` would have no window at all, so `make` refuses it when
a veto may be woken (host-core prototype finding G-P3). The window does not
guarantee a call: veto contributions ordered before the woken one also take
time, and a woken veto reached after the deadline is resolved as "deadline"
(BEH-BR-303); a window that the enrich allowance empties is handled as any
empty window (CCR-BR-029, agent review R1-08). A declaration whose owner stays
`waiting` (its providers never come) costs a full window once per hook
point, not on every dispatch (R1-10). A woken hook is asked as soon as it registers, before its plugin's
build has finished (finding G-P4): the alternative, waiting for `active`,
would put the rest of the build inside the window. A
plugin whose load and build take longer than the window is denied on the
first dispatch under "deny" and takes part from the next one: a point on a
counter's hot path, with a two-second deadline, will usually deny the first
request after a cold start. That is the cost of failing closed; an
application that cannot pay it keeps the veto's owner eager, or chooses
`dormant: "deny"` to deny at once without waiting.

**Settled here.** (1) The default for the veto role is "wake", the owner
decision D3 of the completion plan: a declared veto is asked, not assumed.
"deny" is for points that cannot afford the wait, and still wakes the plugin
for later dispatches. There is no "skip" for veto declarations: a hook point
that wants a lazy veto to be optional says so with `onError: "skip"`, which
covers a late wake as it covers a slow hook. (2) Enrich and advisory
declarations default to "skip": they cannot decide, and waking every
enricher on every dispatch would turn a hot path into a loader. (3) A
declaration is admitted by the same rule as a registration. A plugin whose
manifest declares a veto it would not be admitted for cannot block anything
by declaring it. (4) Declarations without a `HostLink` fail closed on a point
with vetoes: such a dispatch cannot know whether a lazy veto exists. Code
outside the host's fibers passes the host's link explicitly (BEH-BR-250).
(5) Registrations not yet loaded are read, and two states the host chose
for the plugin: "idling" (an idle return under way) and "refused" (disabled
by the `RefusalList`), which 27 reports so that neither the idle timer nor a
revocation opens a veto without a trace (CCR-BR-029). Another loaded plugin
that is not `active` (`waiting`, `failed`, `disabled` by an operator,
`stopping` for another cause) has no hook at the point, exactly as an eager
one, and its veto is absent; whether such an absence should deny is **Open**
(URS gap G64). (6) A declaration is matched to a registered contribution by
id, owner and role, not by id alone: otherwise any plugin admitted to
register under the same id — typically in the advisory role, which `who`
often admits freely — would hide the declared veto and satisfy its wake
(R1-05). (7) The link is recorded, and `HostLink.none` denies on a veto
point unless the point opts in: a dispatcher, often the party a veto
restrains, could otherwise provide an empty link and get a record that
looks like an ordinary dispatch (R1-06). A link object forged by in-process
code is not detected; that residual is stated in RSK-BR-057.

## BEH-BR-310: A contribution's own failure policy, and a breaker per plugin

> **Invariant:** [INV-BR-040](../invariants.md#inv-br-040-only-an-admitted-veto-contribution-decides-a-hook-dispatch), [INV-BR-042](../invariants.md#inv-br-042-hook-level-failure-never-changes-plugin-state)
> **See:** [ADR-BR-050](../decisions/050-dormant-veto-and-hook-phases.md), [ADR-BR-046](../decisions/046-hook-points.md)
> **Satisfies:** [URS-BR-036](../urs.md#urs-br-036-let-several-plugins-take-part-in-one-decision-under-a-stated-failure-policy)
> **Risk:** [RSK-BR-032](../gxp/03-risk-assessment.md#rsk-br-032)

```ts
// illustrative — not type-checked
// The point defaults to "skip" and lets a contribution ask for "deny";
// the rule decides who may ask for it.
const point = yield* HookPoint.make<Order, never, never, "credit-limit">("example/order-check", {
  codes: ["credit-limit"], timeout: "200 millis", deadline: "1 second",
  onError: { default: "skip", allow: ["skip", "deny"] },
  breakerScope: "plugin",
  who: (c, role, _point, request) =>
    role !== "veto" || request.onError !== "deny" || c.labels["origin"] === "shipped"
})
yield* point.register("credit/limit", checkLimit, { role: "veto", onError: "deny" })
```

```
REQUIREMENT: A contribution's effective `onError` MUST be its `register`
             option `onError` when given, and otherwise the point's default
             (the string form of `HookPointOptions.onError`, or `default` of
             the object form). `register` MUST fail with
             `HookRegistrationRefused` and register nothing when the option
             is given and is not allowed by the point (the string form
             allows only itself; the object form allows `allow`), or when it
             is "deny" on an enrich or advisory contribution. The check MUST
             be made before `who` is called; `who` MUST receive the
             effective `onError` of a veto contribution in its `request`.
```

```
REQUIREMENT: Wherever BEH-BR-302, BEH-BR-303 and BEH-BR-304 resolve an error,
             a deadline or an open breaker of a veto-role contribution by
             `onError`, the contribution's effective `onError` MUST be used.
             `HookPointView` MUST show each contribution's effective
             `onError`.
```

```
REQUIREMENT: Under `breakerScope: "plugin"`, the hook point MUST keep one
             breaker per owner (`pluginId`, `realm`), shared by every
             contribution of that owner at this hook point: an error of any
             of them counts toward it; while it is "open", every
             contribution of the owner MUST be treated as "breaker-open";
             when it is "half-open", at most one call among the owner's
             contributions MUST be made as the probe, and its result closes
             or reopens the breaker for all of them. The breaker MUST be
             discarded when the owner's last contribution at the hook point
             is removed. A contribution without an owner MUST keep a breaker
             of its own under either scope.
```

```
REQUIREMENT: A breaker transition under `breakerScope: "plugin"` MUST be
             published as one `HookBreakerRecord` with `scope: "plugin"`,
             the owner, and the contribution whose call caused it. All other
             rules of BEH-BR-304 apply unchanged: no plugin state change, no
             `AuditSink` record, no host event.
```

A per-point `onError` cannot express a point where most contributors are
features ("skip") and one is a control ("deny"). Letting each contribution
choose, within what the point allows and under the admission rule, gives the
owner of the point the last word on who may turn an outage into a refusal.
A breaker per plugin answers a different question from a breaker per
contribution: a plugin with ten contributions to one point, all failing for
the same reason, should cost one timeout window, not ten.

**Settled here.** (1) Under the string form a contribution cannot change the
policy in either direction. A contribution that asks for "deny" on a "skip"
point asks for more authority — its outage blocks the decision — so the
point owner must allow it explicitly. (2) The breaker scope stops at the hook
point: a breaker across all hook points of a plugin is state about the
plugin, which core keeps only as plugin state ([ADR-BR-005](../decisions/005-failure-is-sticky.md)).
A companion that wants it can consult its own counter from `policy`.

## BEH-BR-311: The phases run in order: enrich, then veto, then advise

> **Invariant:** [INV-BR-040](../invariants.md#inv-br-040-only-an-admitted-veto-contribution-decides-a-hook-dispatch), [INV-BR-041](../invariants.md#inv-br-041-a-hook-dispatch-returns-within-its-deadline)
> **See:** [ADR-BR-050](../decisions/050-dormant-veto-and-hook-phases.md), [ADR-BR-046](../decisions/046-hook-points.md)
> **Satisfies:** [URS-BR-036](../urs.md#urs-br-036-let-several-plugins-take-part-in-one-decision-under-a-stated-failure-policy)
> **Risk:** [RSK-BR-032](../gxp/03-risk-assessment.md#rsk-br-032)

```
wake step (BEH-BR-309) ─► enrich (concurrent) ─► veto (serial) ─► advise (concurrent, only if Allowed)
                           input only              input + enrichments   input + enrichments
```

```
REQUIREMENT: A dispatch MUST run, in this order: the wake step (BEH-BR-309);
             the enrich phase, in which the enrich-role contributions run
             concurrently on the input alone (BEH-BR-301); the veto phase,
             in which the veto-role contributions run one at a time, in
             order, on the input and the enrichments (BEH-BR-300); and,
             only when the verdict is `Allowed`, the advise phase, in which
             the advisory-role contributions run concurrently on the input
             and the enrichments (BEH-BR-301). No phase MUST begin before
             the previous one has ended.
```

```
REQUIREMENT: The enrichments a veto or advisory hook receives MUST be
             passed beside the input, under their contributors' ids
             (BEH-BR-306); the hook point MUST NOT merge them into the
             input. The input MUST be the same value in every phase.
```

```
REQUIREMENT: The verdict MUST NOT depend on the enrichments except through
             what veto hooks return. An enrich hook's failure, timeout or
             skip MUST only remove its id from `enrichments` and add it to
             `missing`; it MUST NOT deny.
```

```ts
// illustrative — not type-checked
// "Final say": the pricing plugin vetoes a discount an enricher proposed; when the loyalty
// enrichment is missing there is nothing to judge, and it passes.
yield* point.register("pricing/final", (basket, ctx) =>
  Effect.succeed(
    ctx.missing.includes("loyalty/discount") ? { _tag: "Pass" } :
    ctx.enrichments.some((e) => e.value.discount > basket.margin)
      ? { _tag: "Veto", code: "below-cost" } : { _tag: "Pass" }),
  { role: "veto", priority: 100 })
```

A veto that runs before enrichment can only judge the raw input. The case
that motivated revision 0.3 — a plugin that must have the final say over a
value other plugins propose — needs the veto to see the proposals. Running
enrichment first and passing its results to veto hooks expresses it without
letting any enricher decide, and without a pipeline in which each enricher
rewrites the input.

**Settled here.** (1) Enrichers now run on dispatches that end `Denied`.
Their calls cost time inside the deadline and may have side effects; an
enricher must be written so that its value may be discarded. In exchange,
the vetoes that decide see what they decide about. (2) Advisers still run
only on `Allowed`: advice is about a decision that will happen.
(3) Enrichers do not see the verdict, and vetoes do not see advice: each
phase sees only what came before it.

## BEH-BR-312: Admission sees the target, and the policy can deny

> **Invariant:** [INV-BR-040](../invariants.md#inv-br-040-only-an-admitted-veto-contribution-decides-a-hook-dispatch)
> **See:** [ADR-BR-050](../decisions/050-dormant-veto-and-hook-phases.md), [ADR-BR-046](../decisions/046-hook-points.md)
> **Satisfies:** [URS-BR-036](../urs.md#urs-br-036-let-several-plugins-take-part-in-one-decision-under-a-stated-failure-policy)
> **Risk:** [RSK-BR-032](../gxp/03-risk-assessment.md#rsk-br-032)

```ts
// illustrative — not type-checked
// A command point: each dispatch is about one command; a contribution names the commands it hooks.
type CommandTarget = { readonly commandId: string; readonly tags: readonly string[]; readonly ownerPluginId?: string }
type CommandSelector = { readonly commandIds?: readonly string[]; readonly tags?: readonly string[] }

const beforeCommand = yield* HookPoint.make<Command, never, Note, "not-licensed" | "policy", CommandTarget, CommandSelector>(
  "example/before-command", {
    codes: ["not-licensed", "policy"], timeout: "200 millis", deadline: "1 second", onError: "deny",
    targets: {
      descriptor: (cmd) => ({ commandId: cmd.id, tags: cmd.tags, ownerPluginId: cmd.owner }),
      selector: CommandSelector,
      matches: (sel, t) => (sel.commandIds?.includes(t.commandId) ?? true) && (sel.tags?.every((x) => t.tags.includes(x)) ?? true)
    },
    // No hooks on a competitor's commands: a selector must name commands, and only the commands' owner may veto them.
    who: (c, role, _p, req) => role === "advisory" || (req.target?.commandIds !== undefined && c.labels["vendor"] === "own"),
    policy: (step) => entitlement.check(step.owner)   // Run, Skip { reason } or Deny { reason }
  })
```

```
REQUIREMENT: When `targets` is given, `register` MUST decode its `target`
             option with `targets.selector`; a value that does not decode
             MUST fail `register` with `HookRegistrationRefused` and
             register nothing. The decoded selector MUST be passed to `who`
             in `request.target`. A contribution registered without
             `target` matches every target. When `targets` is not given, a
             `target` option MUST fail `register` with
             `HookRegistrationRefused`.
```

```
REQUIREMENT: At the start of each dispatch, the hook point MUST compute the
             dispatch's target once with `targets.descriptor(input)`, and
             MUST pass it to `policy`, to every hook in
             `HookContext.target`, and to `matches`. A contribution or
             declaration whose selector does not match MUST NOT be called or
             woken and MUST be recorded as "not-targeted"; it is not an
             error and MUST NOT count toward a breaker. When `descriptor`
             or `matches` throws, a point with a non-empty `codes` MUST end
             the dispatch with `Denied { cause: "target-failed" }`, without
             `by`, and call no hook; a point without
             codes MUST return `Allowed` with no hook called. The target
             MUST NOT appear in the decision record.
```

```
REQUIREMENT: `policy` returning `Deny { reason }` for a veto-role
             contribution — registered or declared — MUST end the dispatch
             with `Denied { by, cause: "denied-policy", reason }` at that
             contribution's turn: in the wake step for a declaration
             (BEH-BR-309), in the veto phase, in order, for a registered
             contribution, after the earlier veto contributions have
             passed. The contribution MUST NOT be called or woken, MUST be
             recorded as "denied-policy" with `skipReason`, and the outcome
             MUST NOT count toward any breaker or be resolved by
             `onError`. `Deny` for an enrich-role or advisory-role
             contribution MUST be recorded as "skipped-policy": it cannot
             decide (BEH-BR-300).
```

The admission rule decides at registration who may hook what; the target
makes "what" more precise than the whole hook point. A command catalog with
one `before-command` point can let a plugin veto its own commands and only
advise on others, and can refuse a contribution that asks to hook every
command. The policy deny closes URS gap G62: a hook point owner who wants an
unlicensed veto contributor to block the decision — not to be passed over —
can say so, and the record shows it as a decision of the point's policy
("denied-policy", with the policy's reason), never as the contributor's veto.

**Settled here.** (1) The descriptor is computed from the input by a pure
function the point owner writes; core interprets no field of it. (2) The
selector of a declaration comes from its manifest entry's `target`, which
core carries without interpreting (27, BEH-BR-241); a declaration whose
`target` does not decode is treated as hooking every target, so a malformed
manifest cannot hide a veto. (3) `skip` was renamed `policy` because it can
now deny; this is a change to a Draft that no code implements. The question
recorded as URS gap G63 — a step after a hook call to return a charged
budget — is closed by `settle` (BEH-BR-302, CCR-BR-026).

---

## Acceptance checks

These checks extend BEH-BR-184 (21 — Testing Host); their scenarios are
allocated in [traceability.md](../traceability.md) §5. Each will be a tagged
scenario once code exists; none has run.

| Scenario | Check | Behaviours |
| --- | --- | --- |
| REQ-BR-077 | A hook point admits registrations only through the application's rule over the principal's owner and labels; a refused role registers nothing; results outside the role are errors; order is priority then id whatever the activation order | BEH-BR-297, BEH-BR-298, BEH-BR-299 |
| REQ-BR-078 | The first admitted veto decides and later veto hooks are not run; codes outside the closed set and non-primitive params are errors; enrich and advisory results are namespaced, schema-checked, in view order, and never change the verdict | BEH-BR-300, BEH-BR-301 |
| REQ-BR-079 | Per-hook timeout and `onError` "deny" and "skip"; a `skip` policy's skips are recorded as "skipped-policy", never deny and never count toward the breaker; the dispatch returns within its effective deadline (least of hook point, call and context annotation) without waiting for finalizers; a breaker opens, half-opens once, closes or reopens, is discarded with its contribution, and never changes plugin state or writes an audit record; `settle` is called once per call `policy` let run, with its outcome, also on timeout ("timeout"), revocation ("revoked") and interruption by the dispatcher or the deadline ("interrupted"), never for skipped or denied contributions, and its failure changes nothing | BEH-BR-302, BEH-BR-303, BEH-BR-304, BEH-BR-306 |
| REQ-BR-080 | Every dispatch yields one decision record naming the deciding contribution, with no input, value, message or params; a selector holds the chosen implementation for the call, fails with `NoImplementation` when none is chosen, never fails over, and never restarts a plugin | BEH-BR-305, BEH-BR-307, BEH-BR-308 |
| REQ-BR-092 | A veto declared by a `dormant` plugin is woken from the dispatcher's fiber and runs when it registers within the wake window; a late or failed wake denies under `onError: "deny"` and is recorded under "skip"; `dormant: "deny"` denies at once and still wakes; declarations are admitted by `who` with `declared: true` and refused ones wake nothing; enrich and advisory declarations are skipped by default; no `HostLink` denies a point with codes; the verdict does not depend on the order wakes settle; a woken contribution takes part while its plugin is `starting`; an empty wake window wakes and records "wake-timeout" without waiting; `make` rejects a `timeout` equal to `deadline` when a veto may be woken; "idling" and "refused" declarations are decided, never passed over; declarations match by id, owner and role; `HostLink.none` denies without `allowNoLink` and the record names the link; a link without `hostId` denies and is recorded as `HostLink.none`; a failed or late read denies; the enrich allowance shortens the window; a "waking" declaration is not waited for again after a wait that ran to the end of a non-empty window, and is waited for when it was only seen earlier | BEH-BR-309, BEH-BR-297, BEH-BR-305, BEH-BR-250, BEH-BR-253 |
| REQ-BR-093 | A contribution's `onError` outside what the point allows, or "deny" on a non-veto role, refuses the registration; the effective `onError` decides errors, deadline and open breakers; under `breakerScope: "plugin"` one owner's contributions share one breaker, one probe, and one record per transition | BEH-BR-310, BEH-BR-302, BEH-BR-304 |
| REQ-BR-094 | Phases run enrich, veto, advise: veto and advisory hooks receive the frozen enrichments and `missing`; an enrich failure never denies; a denied dispatch returns its enrichments and runs no adviser; a deadline in the enrich or veto phase denies only when an uncompleted veto contribution has effective `onError` "deny" | BEH-BR-311, BEH-BR-300, BEH-BR-301, BEH-BR-303, BEH-BR-306 |
| REQ-BR-095 | Targets: a selector that does not decode refuses the registration; `who` sees the selector; non-matching contributions and declarations are "not-targeted" and never called or woken; a throwing descriptor denies a point with codes; `policy` `Deny` on a veto contribution or declaration yields "denied-policy" with its reason, never calls or wakes it, never feeds a breaker, and on a non-veto role is "skipped-policy" | BEH-BR-312, BEH-BR-302, BEH-BR-305 |

---

_Previous: [30 — Operation Context Annotations](./30-operation-context-annotations.md)_ · _Next: [32 — Generic Gate and Plan](./32-generic-gate-and-plan.md)_
