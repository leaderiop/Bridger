# 15 — Optional and Reactive Dependencies

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-BEH-15                                               |
> | Revision       | 0.6                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.6 (2026-11-10): BEH-BR-131 `useOptional` takes `options.timeout`, without which `LeaseTimeout` cannot occur (CL6); BEH-BR-134 a `whenAvailable` re-run under "restart" consults the `RefusalList` as a background restart does (C11); BEH-BR-136 `HeldPlugins` and `CurrentTransition` carry canonical keys `JSON.stringify([realm, id])` (C1) (CCR-BR-036)<br>0.5 (2026-11-10): BEH-BR-136 a `whenAvailable` run carries no plugin in `CurrentTransition` (H1) (CCR-BR-035)<br>0.4 (2026-11-09): BEH-BR-130 a key is declared for the optional members only when listed in `optional`; BEH-BR-132 `whenAvailable` with an undeclared key never runs and warns once (U-13); BEH-BR-134 a failing `wrap` fails the run under `onFailure` (U-06) (CCR-BR-032)<br>0.3 (2026-11-08): BEH-BR-129 an incompatible optional contract provider is absent; optional keys never trigger a lazy plugin (CCR-BR-017)<br>0.2 (2026-10-02): A `whenAvailable` run is drained as a lease on its provider; P's stop does not stop the run's plugin on account of the run; a run carries only the leases it holds (CCR-BR-008)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001)                 |

---

`requires` is all-or-nothing: a plugin that requires a service does not run
without it, and stops when it leaves. Many dependencies are softer than that
— a metrics exporter used when present, a search index that enhances but is
not needed. This file converts SPEC.md "Optional and reactive dependencies":
the `optional` definition field, `Plugin.Runtime.optional`, `useOptional`,
and the reactive `whenAvailable`. This file owns BEH-BR-129–136 and uses all
eight.

## BEH-BR-129: Optional dependencies never gate activation

> **Invariant:** [INV-BR-019](../invariants.md#inv-br-019-optional-dependencies-never-gate-activation)
> **See:** [ADR-BR-022](../decisions/022-optional-and-reactive-dependencies.md)
> **Satisfies:** [URS-BR-012](../urs.md#urs-br-012-use-a-dependency-when-it-is-present-without-requiring-it)

```ts
// illustrative — not type-checked
// PluginDefinition field (behaviour 01)
readonly optional?: Keys   // services used if present
```

```
REQUIREMENT: Keys listed in `optional` MUST NOT gate activation, MUST NOT
             appear in `missingServiceIds`, and MUST NOT take part in
             dependency-cycle detection or start ordering.
```

```
REQUIREMENT: A provider of an optional key leaving MUST NOT stop, restart or
             otherwise change the state of the plugin that lists it as
             optional.
```

```
REQUIREMENT: A key listed in both `requires` and `optional` MUST be rejected
             at install with `InvalidDefinition`.
```

Because optional keys are invisible to ordering, two plugins may each list
the other's service as optional without forming a cycle, and either may
start first. The price is that an optional consumer has no guarantee the
service is present at any moment; that is what `useOptional` and
`whenAvailable` address.

```
REQUIREMENT: For an optional contract key, a provider whose declared version
             does not satisfy the consumer's range MUST be treated as
             absent by `optional`, `useOptional` and `whenAvailable`, and
             MUST fail no operation
             ([26 — Versioned Contracts](./26-versioned-contracts.md),
             BEH-BR-229). An optional key MUST NOT trigger a `dormant`
             provider ([27 — Manifest and Lazy Activation](./27-manifest-and-lazy-activation.md),
             BEH-BR-245).
```

## BEH-BR-130: Runtime.optional is a point-in-time read

> **Invariant:** [INV-BR-019](../invariants.md#inv-br-019-optional-dependencies-never-gate-activation)
> **See:** [ADR-BR-022](../decisions/022-optional-and-reactive-dependencies.md)
> **Satisfies:** [URS-BR-012](../urs.md#urs-br-012-use-a-dependency-when-it-is-present-without-requiring-it)
> **Risk:** [RSK-BR-001](../gxp/03-risk-assessment.md#rsk-br-001)

```ts
readonly optional: <S>(key: Context.Key<any, S>) => Effect.Effect<Option.Option<S>>
```

```
REQUIREMENT: `Plugin.Runtime.optional(key)` MUST return `Some(service)` when
             the key has an `active` provider in the plugin's resolution
             scope at the moment of the call, and `None` otherwise. It MUST
             NOT track later changes.
```

```
REQUIREMENT: The returned service MUST NOT be leased. Documentation MUST state
             that a caller needing the provider to stay open during use MUST
             call `useOptional` instead.
```

```
REQUIREMENT: Interceptions in scope for the consumer MUST apply to the
             returned service as they do to required services.
```

```
REQUIREMENT: A key is *declared* for `optional`, `useOptional` and
             `whenAvailable` exactly when the definition lists it in
             `optional`. A key listed only in `requires`, or in neither,
             is undeclared for them. `optional` and `useOptional` called
             with an undeclared key MUST return `None` — `useOptional`
             without running `run` — and MUST log a warning naming the
             undeclared `ServiceId`; `whenAvailable` with an undeclared key
             is specified in BEH-BR-132.
```

**Settled here.** SPEC.md does not say what happens when `optional` or
`useOptional` is called with a key the definition did not list in `optional`.
Such a call returns `None` (for `useOptional`, without running the callback)
and logs a warning naming the undeclared `ServiceId`. Granting an undeclared
dependency would make `inspect` and the definition lie about what the plugin
uses; failing would turn a declaration slip into a runtime failure of a
plugin that was designed to work without the service. A key in `requires`
is not declared for these members (CCR-BR-032): the build already receives
its service in its context, captured and held for the whole activation, so
reaching it again through the optional route would add a second, differently
leased path to one provider.

## BEH-BR-131: useOptional leases when present

> **Invariant:** [INV-BR-006](../invariants.md#inv-br-006-a-leased-provider-does-not-close-under-its-lease)
> **See:** [ADR-BR-022](../decisions/022-optional-and-reactive-dependencies.md), [ADR-BR-015](../decisions/015-leases-one-primitive.md)
> **Satisfies:** [URS-BR-012](../urs.md#urs-br-012-use-a-dependency-when-it-is-present-without-requiring-it), [URS-BR-005](../urs.md#urs-br-005-never-lose-a-provider-in-the-middle-of-a-call)

```ts
readonly useOptional: <S, A, E, R>(
  key: Context.Key<any, S>,
  run: (service: S) => Effect.Effect<A, E, R>,
  options?: { readonly timeout?: Duration.Input }    // as Host.use (09, BEH-BR-087)
) => Effect.Effect<Option.Option<A>, E | LeaseRevoked | LeaseTimeout, R>
```

```
REQUIREMENT: `useOptional(key, run)` MUST return `None` without running `run`
             when the service is unavailable, and otherwise MUST run `run`
             under a lease, through the same lease primitive and supervised
             child as `Host.use`, returning `Some` of its result.
             `options.timeout` MUST bound the callback as it bounds
             `Host.use`, failing with `LeaseTimeout`, and a deadline MUST
             shorten only a given timeout (09 — Leases, BEH-BR-087); without
             `options.timeout` the call MUST NOT fail with `LeaseTimeout`
             (CCR-BR-036).
```

```
REQUIREMENT: A lease taken by `useOptional` MUST delay the provider's removal
             like any lease, and MUST NOT stop the optional consumer.
```

Unavailability is a normal outcome for an optional service, so it is `None`
rather than `ServiceUnavailable`. Revocation and timeout are not normal —
the service was present and was taken away mid-call — so they stay errors.

## BEH-BR-132: whenAvailable runs while all its keys are available

> **Invariant:** [INV-BR-019](../invariants.md#inv-br-019-optional-dependencies-never-gate-activation)
> **See:** [ADR-BR-022](../decisions/022-optional-and-reactive-dependencies.md)
> **Satisfies:** [URS-BR-012](../urs.md#urs-br-012-use-a-dependency-when-it-is-present-without-requiring-it)

```ts
readonly whenAvailable: <const Keys extends readonly Context.Key<any, any>[], A, E, R>(
  keys: Keys,
  run: (services: ServicesOf<Keys>) => Effect.Effect<A, E, R | Scope.Scope>,
  options?: { readonly name?: string; readonly onFailure?: "fail-plugin" | "restart" | "ignore" }
) => Effect.Effect<void, never, Scope.Scope>
```

```
REQUIREMENT: Inside a plugin's activation, `whenAvailable(keys, run)` MUST,
             whenever all `keys` are available, take a scoped lease on them,
             open a child scope, and run `run` in it.
```

```
REQUIREMENT: When the provider of any of the keys starts leaving, the host
             MUST interrupt the run, close the child scope (running its
             finalizers) and then release the lease. When all keys are
             available again, it MUST run `run` again in a new child scope.
```

```
REQUIREMENT: A run, its completion and its interruption MUST NOT change the
             plugin's own state.
```

```
REQUIREMENT: A registration MUST end when the plugin's activation scope
             closes.
```

```
REQUIREMENT: When any of `keys` is undeclared (BEH-BR-130) — listed only in
             `requires`, or not listed at all — the registration MUST be
             made and listed by `inspect` with `running: false`, MUST never
             run `run` and MUST take no lease, and the host MUST log, once
             at registration, a warning naming each undeclared `ServiceId`.
             It MUST NOT fail the call, the build or the plugin.
```

`whenAvailable` is the reactive form (Cordis's `ctx.inject`): a plugin can
light up a feature when its dependencies arrive and dim it when they leave,
without itself going through `stopping`.

**Settled here.** A registration without `options.name` is named
`whenAvailable#n`, where `n` counts registrations in that activation from 1,
so that `inspect` never shows an anonymous entry.

**Settled here (CCR-BR-032).** An undeclared key gets the answer `optional`
and `useOptional` give it (BEH-BR-130): the reactive form behaves as if the
key were never available, and says why once. A registration error would
fail the build of a plugin designed to work without the service, and the
signature has no error to carry one; running anyway would make the
definition and `inspect` misstate what the plugin uses.

## BEH-BR-133: A whenAvailable run is a dependent in removal ordering

> **Invariant:** [INV-BR-005](../invariants.md#inv-br-005-dependents-stop-before-their-providers), [INV-BR-006](../invariants.md#inv-br-006-a-leased-provider-does-not-close-under-its-lease)
> **See:** [ADR-BR-022](../decisions/022-optional-and-reactive-dependencies.md)
> **Satisfies:** [URS-BR-005](../urs.md#urs-br-005-never-lose-a-provider-in-the-middle-of-a-call)
> **Risk:** [RSK-BR-001](../gxp/03-risk-assessment.md#rsk-br-001)

```
REQUIREMENT: A registered `whenAvailable` MUST count as a dependent of each
             of its keys' providers in removal ordering: its child scope MUST
             close before the provider's scope closes.
```

```
REQUIREMENT: The run's interruption MUST begin as soon as the provider starts
             leaving, without waiting for the drain limit; the finalizers of
             its child scope MUST be awaited under the provider's drain limit,
             with the `DrainTimeout` and `force` rules of behaviour
             09 applying on expiry.
```

```
REQUIREMENT: In the provider P's stop, a `whenAvailable` run that holds a
             service of P MUST be treated as a lease on P: it is interrupted
             and its finalizers awaited as part of P's drain. P's stop MUST
             NOT wait for a transition step of the run's own plugin, and
             MUST NOT stop that plugin on account of the run (08 — Operation
             Legality, BEH-BR-078). The run's plugin MUST still be stopped,
             or removed, when it is otherwise a dependent or a child of P
             (06 — Removal, BEH-BR-043).
```

This is the guarded-withdrawal guarantee extended to the reactive form: a
`whenAvailable` run may use its services in its finalizers, because the
provider closes only after them.

**Settled here.** "Counts as a dependent" means it is closed before the
provider, not that it is a cascade: the run's plugin keeps its state
(BEH-BR-132), so P waits for the run as it waits for any lease, under its own
drain limit, and never for a build or stop of the run's plugin (CCR-BR-008).
The run alone does not make its plugin a dependent of P; a plugin that also
captured a service of P, or that is P's child, is stopped or removed for that
reason, as any dependent or child is.

## BEH-BR-134: whenAvailable failures follow the background policy

> **See:** [ADR-BR-022](../decisions/022-optional-and-reactive-dependencies.md), [ADR-BR-017](../decisions/017-runtime-failure-one-transition.md)
> **Satisfies:** [URS-BR-006](../urs.md#urs-br-006-recover-from-failure-explicitly-and-never-silently)
> **Risk:** [RSK-BR-016](../gxp/03-risk-assessment.md#rsk-br-016)

```
REQUIREMENT: A failure of `run` MUST be handled by `options.onFailure` with
             the same meanings as for `Plugin.Runtime.background`, default
             "fail-plugin" (behaviour 10).
```

```
REQUIREMENT: Under "restart", each re-run of a failed `run` MUST be preceded
             by the `RefusalList` consultation that precedes a `background`
             restart, and a refusal MUST leave the run stopped and stop the
             plugin into `disabled` with reason "refused-digest", as a
             refused background restart does (28 — Plugin Principal and
             Mandatory Policy, BEH-BR-267; 10, BEH-BR-090).
```

```
REQUIREMENT: An interruption of `run` caused by a provider leaving, or by the
             activation scope closing, MUST NOT be treated as a failure.
```

```
REQUIREMENT: An interception `wrap` that throws or dies when a run's
             services are captured MUST fail that run before `run` starts,
             with the lease released and the child scope closed, and the
             failure MUST be handled by `options.onFailure` like a failure
             of `run` (17 — Realms and Interception, BEH-BR-152).
```

**Settled here.** `whenAvailable` options carry no `restart` schedule. Under
"restart", a failed run is re-run (while its keys remain available) under the
same bounded, spaced default schedule that `background` uses when none is
given, and an exhausted schedule is handled as "fail-plugin". An immediate,
unbounded re-run would turn a deterministic failure into a busy loop.

## BEH-BR-135: Inspection shows optional and reactive use

> **See:** [ADR-BR-022](../decisions/022-optional-and-reactive-dependencies.md)
> **Satisfies:** [URS-BR-004](../urs.md#urs-br-004-know-why-a-plugin-is-not-running)

```
REQUIREMENT: `inspect` MUST list a plugin's `optional` keys by `ServiceId`,
             and each `whenAvailable` registration by name, keys and whether
             a run is in progress.
```

```
REQUIREMENT: The snapshot MUST NOT report an optional key as missing, and
             MUST NOT change the plugin's state when a `whenAvailable` run
             starts or stops.
```

Since optional and reactive dependencies are deliberately absent from
`missingServiceIds`, `inspect` is where an operator answers "why is this
feature not lit up": the registration is there, `running: false`, and its
keys say which provider is absent.

## BEH-BR-136: Re-entrancy and context apply inside optional and reactive use

> **Invariant:** [INV-BR-016](../invariants.md#inv-br-016-a-re-entrant-wait-fails-fast)
> **See:** [ADR-BR-016](../decisions/016-reentrancy-detection.md)
> **Satisfies:** [URS-BR-010](../urs.md#urs-br-010-detect-a-plugin-that-waits-forever)
> **Risk:** [RSK-BR-011](../gxp/03-risk-assessment.md#rsk-br-011)

```
REQUIREMENT: Fibers running a `useOptional` callback or a `whenAvailable` run
             MUST carry the leased providers' canonical keys
             (`JSON.stringify([realm, id])`) in `@bridger/core/HeldPlugins`, so that the `WouldDeadlock` rules
             of behaviour 09 apply to them. A `whenAvailable` run is forked
             into the activation scope, so it MUST carry only the leases it
             holds in `HeldPlugins` and no plugin in
             `@bridger/core/CurrentTransition`, not the canonical key of
             the plugin whose build registered it (09 — Leases,
             BEH-BR-088).
```

```
REQUIREMENT: A `whenAvailable` run MUST carry the log annotations `plugin`
             and `realm` and run inside the span of its plugin's activation.
```

A `whenAvailable` run that tries to remove the provider it is running
against would otherwise wait for its own child scope to close — the same
self-wait that `WouldDeadlock` exists to turn into an error.

---

_Previous: [14 — Children and Groups](./14-children-and-groups.md)_ · _Next: [16 — Event Bus](./16-event-bus.md)_
