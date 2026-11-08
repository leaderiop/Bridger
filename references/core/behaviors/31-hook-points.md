# 31 — Hook Points

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-BEH-31                                               |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.2 (2026-11-08): empty `codes` allowed, a veto registration then refused; `decisions` carries dispatch and breaker records; breaker transitions no longer host events; `who` before the registry's access check; unowned hooks run with no principal; a deadline interruption is outcome "deadline" and does not feed the breaker (CCR-BR-022)<br>0.1 (2026-11-08): Initial draft (CCR-BR-019) |

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
by a rule the application supplies, run in a deterministic order under a
per-hook timeout and a per-dispatch deadline, are skipped by a per-contribution
circuit breaker after repeated failure, and produce a decision record that
names the contribution that decided. The same file shows how several
implementations of one contract are selected per call site without a second
provider of one key ([ADR-BR-003](../decisions/003-one-provider-per-key-per-realm.md)).
It has no SPEC.md source section; it resolves two conflicts recorded by the
architecture review of 2026-11-08 — `waterfall` short-circuit without
registration rules, and per-call timeout with sticky failure but no budget or
breaker — without changing the bus, `failed` or `retry`
([ADR-BR-046](../decisions/046-hook-points.md)). This file owns
BEH-BR-297–312 and uses BEH-BR-297–308; numbers 309–312 of the block are reserved.

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
[30 — Operation Context Annotations](./30-operation-context-annotations.md).

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

type Hook<In, Enrich, Advice, Code extends string> =
  (input: In, context: HookContext) => Effect.Effect<HookResult<Enrich, Advice, Code>, unknown>

interface HookPointOptions<Enrich, Advice, Code extends string> {
  readonly codes: readonly Code[]                         // the closed set of veto codes
  readonly enrichment?: Schema.Schema<Enrich>             // checked on every Enrich result
  readonly advice?: Schema.Schema<Advice>                 // checked on every Advise result
  readonly who: AdmissionRule                             // BEH-BR-298; no default
  readonly labelsOf?: (owner: HookOwner) => Labels        // BEH-BR-298; default: no labels
  readonly timeout: Duration.Input                        // per hook call (BEH-BR-302)
  readonly deadline: Duration.Input                       // per dispatch (BEH-BR-303)
  readonly onError: "deny" | "skip"                       // veto-role failures (BEH-BR-302)
  readonly breaker?: BreakerOptions | "off"               // BEH-BR-304; default { failures: 5, window: "1 minute", cooldown: "30 seconds" }
  readonly drainTimeout?: Duration.Input | "forever"      // passed to the registry; default 30 seconds
  readonly skip?: SkipPolicy<In>                          // BEH-BR-302; e.g. entitlement or budget; default none
}

// Consulted before each hook call; Some(reason) skips the contribution without calling it.
type SkipPolicy<In> = (step: { readonly id: string; readonly role: HookRole; readonly owner?: HookOwner;
  readonly labels: Labels }, input: In) => Effect.Effect<Option.Option<string>>

interface HookPoint<In, Enrich, Advice, Code extends string> {
  readonly id: string
  readonly register: (
    id: string,
    hook: Hook<In, Enrich, Advice, Code>,
    options: { readonly role: HookRole; readonly priority?: number }
  ) => Effect.Effect<void, DuplicateContribution | HookRegistrationRefused, Scope.Scope>
  readonly dispatch: (input: In, options?: { readonly deadline?: Duration.Input }) =>
    Effect.Effect<HookOutcome<Enrich, Advice, Code>>             // never fails (BEH-BR-302)
  readonly view: Effect.Effect<HookPointView>                     // ids, roles, owners, priorities, breaker states
  readonly decisions: Stream.Stream<HookDecisionRecord | HookBreakerRecord>   // BEH-BR-304, BEH-BR-305; a feed, not a log
}

declare const HookPoint: {
  make<In, Enrich = never, Advice = never, Code extends string = never>(
    id: string, options: HookPointOptions<Enrich, Advice, Code>
  ): Effect.Effect<HookPoint<In, Enrich, Advice, Code>, never, Scope.Scope>
}

// Application setup: one hook point, provided as a stable base service.
class BeforeCheckout extends Context.Service<BeforeCheckout,
  HookPoint<Basket, LoyaltyLine, Card, "age-check" | "stock-hold">>()("example/BeforeCheckout") {}
```

```
REQUIREMENT: `HookPoint` MUST be a helper outside the `Host` interface. It
             MUST NOT read or change plugin state, and the host MUST NOT
             consult any hook point on any host operation.
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
             duration, or `timeout` exceeds `deadline`. An empty `codes` is
             valid: it makes a hook point without vetoes, and `register`
             with `role: "veto"` on it MUST fail with
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
type AdmissionRule = (contributor: Contributor, role: HookRole, hookPoint: string) => boolean

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
             call `who(contributor, role, id)` exactly once, before the
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
REQUIREMENT: The role, owner and labels of a contribution MUST be fixed when
             it is registered. A contribution MUST NOT change role; a plugin
             that wants another role registers another contribution, subject
             to the rule again.
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
replaced or removed for the change to take effect — which the loader's
revocation does through `reconcile`. (3) Registration by application code
(no owner) is allowed and goes through the same rule with
`pluginId` absent; the rule decides whether unowned code may veto.

## BEH-BR-299: Order is priority then id, over the view at the start of the dispatch

> **Invariant:** [INV-BR-040](../invariants.md#inv-br-040-only-an-admitted-veto-contribution-decides-a-hook-dispatch)
> **See:** [ADR-BR-046](../decisions/046-hook-points.md), [ADR-BR-024](../decisions/024-shared-state-helpers.md)
> **Satisfies:** [URS-BR-036](../urs.md#urs-br-036-let-several-plugins-take-part-in-one-decision-under-a-stated-failure-policy)

```
REQUIREMENT: A dispatch MUST take the registry view current at its start
             and MUST hold every contribution of that view for the duration
             of the dispatch, as `useAll` does (BEH-BR-166). A contribution
             added after the start MUST NOT take part; one whose removal
             begins after the start MUST be waited for, under the
             registry's `drainTimeout`, by that removal.
```

```
REQUIREMENT: Within each phase (BEH-BR-300, BEH-BR-301), contributions MUST
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
> **See:** [ADR-BR-046](../decisions/046-hook-points.md)
> **Satisfies:** [URS-BR-036](../urs.md#urs-br-036-let-several-plugins-take-part-in-one-decision-under-a-stated-failure-policy)
> **Risk:** [RSK-BR-032](../gxp/03-risk-assessment.md#rsk-br-032)

```ts
// illustrative — not type-checked
type HookVerdict<Code extends string> =
  | { readonly _tag: "Allowed" }
  | { readonly _tag: "Denied"; readonly by: string;                         // contribution id
      readonly cause: "veto" | "hook-failed" | "hook-timeout" | "breaker-open" | "deadline";
      readonly code?: Code;                                                   // present when cause = "veto"
      readonly params?: Readonly<Record<string, string | number | boolean>> }
```

```
REQUIREMENT: A dispatch MUST first run the veto-role contributions of its
             view one at a time, in order. The first that returns `Veto`
             MUST end the phase with `Denied { by, cause: "veto", code,
             params }`; the remaining veto-role contributions MUST NOT be
             called and MUST appear in the record as "not-run".
```

```
REQUIREMENT: A `Veto` whose `code` is not in `HookPointOptions.codes`, or
             whose `params` hold a value that is not a string, a finite
             number or a boolean, MUST be treated as an error of that hook
             (BEH-BR-302), never as a veto.
```

```
REQUIREMENT: Only a contribution registered with role "veto" MUST be able
             to produce `Denied`, whether by `Veto` or under
             `onError: "deny"`. No result or failure of an enrich or
             advisory contribution MUST change the verdict.
```

```
REQUIREMENT: When every veto-role contribution has returned `Pass` (or has
             been skipped under `onError: "skip"`), the verdict MUST be
             `Allowed`. An empty veto phase MUST be `Allowed`.
```

A veto carries a code from a closed set and primitive parameters, never free
text. The dispatcher renders the code through its own templates. This is how
an application keeps a hook from using a refusal as a message channel to the
operator — a review finding about veto texts used for phishing, generalised:
core cannot judge text, but it can refuse to carry any.

**Settled here.** Veto hooks run serially, not concurrently: the first veto
ends the phase, so a concurrent run would call hooks whose result cannot
matter, and their side effects would then depend on timing.

## BEH-BR-301: Enrich and advisory phases — namespaced, and unable to decide

> **See:** [ADR-BR-046](../decisions/046-hook-points.md)
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
REQUIREMENT: Only when the veto phase ends `Allowed` MUST the dispatch run
             the enrich-role and advisory-role contributions. They MUST run
             concurrently with each other, each receiving the dispatch input
             and never another contribution's result.
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
REQUIREMENT: When the verdict is `Denied`, no enrich or advisory hook MUST
             be called, and the outcome MUST carry empty `enrichments` and
             `advice`.
```

Keeping each enrichment under its contributor's id is the generic form of
"a hook writes only its own namespaced fields": core never lets one plugin's
result overwrite the input or another plugin's result, and what the
dispatcher does with the namespaced values is its own decision.

**Settled here.** (1) Enrich hooks do not see each other's results. A chain
in which each hook refines the previous one's output makes the result depend
on the order of unrelated plugins; a dispatcher that needs a pipeline builds
it explicitly. (2) Enrich and advisory hooks do not run when the dispatch is
denied: their results would describe a decision that is not going to happen.

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
REQUIREMENT: For a veto-role contribution, an error MUST be resolved by
             `onError`: with "deny", the phase MUST end with `Denied { by,
             cause: "hook-failed" | "hook-timeout" }`; with "skip", the
             contribution MUST be recorded as skipped and the phase MUST
             continue. For enrich-role and advisory-role contributions, an
             error MUST always be recorded and skipped.
```

```
REQUIREMENT: A hook error MUST NOT change the state of the owning plugin,
             MUST NOT call `reportFailure` on its behalf and MUST NOT cause
             any host operation. The hook point MUST NOT retry a failed hook
             call within a dispatch.
```

```
REQUIREMENT: When `skip` is given, the hook point MUST consult it before each
             hook call, within the effective deadline. `Some(reason)` MUST
             skip the contribution without calling it, record it as
             "skipped-policy" with `skipReason`, and MUST NOT be treated as
             an error: it MUST NOT deny under `onError: "deny"`, MUST NOT
             produce `Denied`, and MUST NOT count toward the contribution's
             breaker (BEH-BR-304). A `skip` that fails or dies MUST be
             treated as an error of that contribution under `onError`,
             recorded as "failed", and MUST NOT count toward its breaker.
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
a loyalty plugin that is down must never block a sale. `skip` is where an
entitlement or budget companion says "this contributor is not to be asked
now" — a decision about the contributor, not a failure of it — which is why
it is recorded apart from a pass and never feeds the breaker. The hook point owner
chooses one per hook point, because it is a property of what the hook point
decides, not of who contributes to it.

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
REQUIREMENT: When the effective deadline expires during the veto phase, the
             running hook MUST be interrupted and recorded as "deadline", the
             veto-role contributions not yet called MUST be recorded as
             "skipped-deadline", and the phase MUST end: with
             `onError: "deny"`, `Denied { by, cause: "deadline" }` where
             `by` is the contribution that was running or, if none, the next
             one not called; with `onError: "skip"`, `Allowed`, and the
             enrich and advisory phases MUST NOT run.
```

```
REQUIREMENT: When the effective deadline expires during the enrich and
             advisory phases, the hooks still running MUST be interrupted
             and recorded as "deadline"; the verdict MUST stay `Allowed` with
             the values completed so far.
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
cleanup is skipped. (2) A deadline that expires in the veto phase under
"skip" yields `Allowed` without running enrichers: there is no time left for
them, and running them late would break the bound.

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
             per contribution, starting "closed". It MUST open when the
             contribution has had `failures` errors (BEH-BR-302, timeouts
             included) within `window`, measured with the `Clock` service.
             An interruption by the dispatch's effective deadline (outcome
             "deadline", BEH-BR-303) is not an error of the contribution and
             MUST NOT count toward its breaker; an expiry of the per-hook
             `timeout` (outcome "timeout") counts.
```

```
REQUIREMENT: While a breaker is "open", its hook MUST NOT be called. The
             contribution MUST be treated as an error of kind
             "breaker-open": for a veto-role contribution under
             `onError: "deny"`, `Denied { by, cause: "breaker-open" }`;
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
REQUIREMENT: A breaker MUST belong to the contribution. When the
             contribution is removed, its breaker MUST be discarded; a
             contribution later added under the same id MUST start with a
             closed breaker.
```

```ts
// illustrative — not type-checked
interface HookBreakerRecord {
  readonly type: "breaker"
  readonly hookPoint: string
  readonly contribution: string
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
  readonly correlationId?: string                     // of the calling fiber's operation context, when present
  readonly startedAt: string                          // from Clock, ISO-8601 UTC with ms
  readonly elapsedMs: number
  readonly deadlineMs: number                         // the effective deadline
  readonly viewRevision: number
  readonly verdict: "allowed" | "denied" | "abandoned"
  readonly decidedBy?: { readonly id: string; readonly owner?: HookOwner; readonly cause: string; readonly code?: string }
  readonly steps: readonly {
    readonly id: string
    readonly owner?: HookOwner
    readonly role: HookRole
    readonly outcome: "pass" | "veto" | "enrich" | "advise" | "failed" | "timeout" | "deadline"
                    | "breaker-open" | "skipped-policy" | "skipped-deadline" | "not-run"
    readonly errorTag?: string
    readonly skipReason?: string                      // "skipped-policy" only: the policy's reason
    readonly elapsedMs?: number
  }[]
}
```

```
REQUIREMENT: Every dispatch MUST produce exactly one `HookDecisionRecord`
             (breaker records on the same stream are not dispatch records). `decidedBy`
             MUST be present exactly when the verdict is "denied", and MUST
             name the contribution that produced the `Denied` verdict and
             its cause.
```

```
REQUIREMENT: A record MUST list every contribution of the dispatch's view
             in view order, each with the outcome it had in this dispatch.
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
interface HookContext {
  readonly hookPoint: string
  readonly dispatchId: string
  readonly remaining: Effect.Effect<Duration.Duration>   // until the effective deadline
}
```

```
REQUIREMENT: A hook MUST run in the dispatcher's fiber context — tracing
             span, log annotations and `@bridger/core/HeldPlugins` — with
             `@bridger/core/CurrentActor` reset to `Actor.unattributed`, as
             a bus listener does (BEH-BR-144), and with the plugin principal
             of the contribution's owner (28 — Plugin Principal and
             Mandatory Policy). When the contribution has no owner, the hook
             MUST run with no plugin principal, whatever the dispatcher's
             fiber carries.
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
`WouldDeadlock` rather than hanging.

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
    choose: (view: ContributionRegistry.RegistryView<A>, site: Site) => readonly string[]   // pure
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
             MUST fail with `NoImplementation` without running `run`.
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

---

## Acceptance checks

These checks extend BEH-BR-184 (21 — Testing Host); their scenarios are
allocated in [traceability.md](../traceability.md) §5. Each will be a tagged
scenario once code exists; none has run.

| Scenario | Check | Behaviours |
| --- | --- | --- |
| REQ-BR-077 | A hook point admits registrations only through the application's rule over the principal's owner and labels; a refused role registers nothing; results outside the role are errors; order is priority then id whatever the activation order | BEH-BR-297, BEH-BR-298, BEH-BR-299 |
| REQ-BR-078 | The first admitted veto decides and later veto hooks are not run; codes outside the closed set and non-primitive params are errors; enrich and advisory results are namespaced, schema-checked, in view order, and never change the verdict | BEH-BR-300, BEH-BR-301 |
| REQ-BR-079 | Per-hook timeout and `onError` "deny" and "skip"; a `skip` policy's skips are recorded as "skipped-policy", never deny and never count toward the breaker; the dispatch returns within its effective deadline (least of hook point, call and context annotation) without waiting for finalizers; a breaker opens, half-opens once, closes or reopens, is discarded with its contribution, and never changes plugin state or writes an audit record | BEH-BR-302, BEH-BR-303, BEH-BR-304, BEH-BR-306 |
| REQ-BR-080 | Every dispatch yields one decision record naming the deciding contribution, with no input, value, message or params; a selector holds the chosen implementation for the call, fails with `NoImplementation` when none is chosen, never fails over, and never restarts a plugin | BEH-BR-305, BEH-BR-307, BEH-BR-308 |

---

_Previous: [30 — Operation Context Annotations](./30-operation-context-annotations.md)_ · _Next: [32 — Generic Gate and Plan](./32-generic-gate-and-plan.md)_
