# 15 — Optional and Reactive Dependencies

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-BEH-15                                               |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.1 (2026-10-02): Initial draft (CCR-BR-001)                 |

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

**Settled here.** SPEC.md does not say what happens when `optional` or
`useOptional` is called with a key the definition did not list in `optional`.
Such a call returns `None` (for `useOptional`, without running the callback)
and logs a warning naming the undeclared `ServiceId`. Granting an undeclared
dependency would make `inspect` and the definition lie about what the plugin
uses; failing would turn a declaration slip into a runtime failure of a
plugin that was designed to work without the service.

## BEH-BR-131: useOptional leases when present

> **Invariant:** [INV-BR-006](../invariants.md#inv-br-006-a-leased-provider-does-not-close-under-its-lease)
> **See:** [ADR-BR-022](../decisions/022-optional-and-reactive-dependencies.md), [ADR-BR-015](../decisions/015-leases-one-primitive.md)
> **Satisfies:** [URS-BR-012](../urs.md#urs-br-012-use-a-dependency-when-it-is-present-without-requiring-it), [URS-BR-005](../urs.md#urs-br-005-never-lose-a-provider-in-the-middle-of-a-call)

```ts
readonly useOptional: <S, A, E, R>(
  key: Context.Key<any, S>,
  run: (service: S) => Effect.Effect<A, E, R>
) => Effect.Effect<Option.Option<A>, E | LeaseRevoked | LeaseTimeout, R>
```

```
REQUIREMENT: `useOptional(key, run)` MUST return `None` without running `run`
             when the service is unavailable, and otherwise MUST run `run`
             under a lease, through the same lease primitive and supervised
             child as `Host.use`, returning `Some` of its result.
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

`whenAvailable` is the reactive form (Cordis's `ctx.inject`): a plugin can
light up a feature when its dependencies arrive and dim it when they leave,
without itself going through `stopping`.

**Settled here.** A registration without `options.name` is named
`whenAvailable#n`, where `n` counts registrations in that activation from 1,
so that `inspect` never shows an anonymous entry.

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

This is the guarded-withdrawal guarantee extended to the reactive form: a
`whenAvailable` run may use its services in its finalizers, because the
provider closes only after them.

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
REQUIREMENT: An interruption of `run` caused by a provider leaving, or by the
             activation scope closing, MUST NOT be treated as a failure.
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
             MUST carry the leased providers' IDs in
             `@bridger/core/HeldPlugins`, so that the `WouldDeadlock` rules
             of behaviour 09 apply to them.
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
