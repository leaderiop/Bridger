# 16 — Event Bus

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-BEH-16                                               |
> | Revision       | 0.9                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.9 (2026-11-09): BEH-BR-137 `Bridger.Events` cannot be provided in any resolution scope and no realm may isolate it (`InvalidRealm`) (C-02) (CCR-BR-032)<br>0.8 (2026-11-08): BEH-BR-144: listeners run with the dispatcher's `CurrentCorrelation` (CCR-BR-026)<br>0.7 (2026-11-08): BEH-BR-141: the event that applies an `OnEvent` trigger is held for the plugin it wakes and delivered once, with `emit` semantics, to that plugin's `on` listeners when it becomes `active` (27, BEH-BR-251); the dispatch reads the emitter's principal for the `lazy-triggered` record (27, BEH-BR-253) (CCR-BR-024)<br>0.6 (2026-11-08): BEH-BR-141: `OnEvent` triggers apply only after the emit access decision allows the dispatch (CCR-BR-022)<br>0.5 (2026-11-08): BEH-BR-141 dispatch applies `OnEvent` triggers without redelivery (CCR-BR-017); BEH-BR-139/141 consult a wired `AccessPolicy`, BEH-BR-144 listener principal and "events" annotations (CCR-BR-018); BEH-BR-143 points to hook points (CCR-BR-019)<br>0.4 (2026-10-02): A listener withdrawn after a dispatch began, before its turn, fails the dispatch like one interrupted (prototype finding G32) (CCR-BR-011)<br>0.3 (2026-10-02): A listener interrupted by its plugin's removal fails a `parallel`, `serial` or `waterfall` dispatch with a defect and is not reported by `emit` (prototype finding G23) (CCR-BR-010)<br>0.2 (2026-10-02): Consistency fixes from independent review (CCR-BR-002)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001) |

---

Plugins need to tell each other things — an invoice was posted, a document
was signed — without requiring each other's services. This file converts
SPEC.md "Typed events and hooks": the `Bridger.Events` base service, typed
`EventKey`s, listener registration and order, the four dispatch modes, the
context listeners run in, and the absence of veto hooks over host
operations. This file owns BEH-BR-137–144 and uses all eight.

Lifecycle observation is not on this bus; it is `Host.events`
([13 — Observability and Diagnostics](./13-observability-and-diagnostics.md)).

## BEH-BR-137: Bridger.Events is a base service

> **See:** [ADR-BR-020](../decisions/020-typed-event-bus.md)
> **Satisfies:** [URS-BR-013](../urs.md#urs-br-013-exchange-typed-events-between-plugins)

```ts
// illustrative — not type-checked
// Bridger.Events: Context.Service with identifier "@bridger/core/Events"
interface EventBus {
  // Registers for the lifetime of the caller's Scope; closing the scope removes the listener.
  readonly on: <Args extends readonly unknown[], Result, E>(
    event: EventKey<Args, Result, E>,
    listener: (...args: Args) => Effect.Effect<Result, E>,
    options?: { readonly priority?: number; readonly prepend?: boolean }
  ) => Effect.Effect<void, never, Scope.Scope>
  readonly around: <Args extends readonly unknown[], Result, E>(          // waterfall listener (middleware)
    event: EventKey<Args, Result, E>,
    listener: (args: Args, next: Effect.Effect<Result, E>) => Effect.Effect<Result, E>,
    options?: { readonly priority?: number; readonly prepend?: boolean }
  ) => Effect.Effect<void, never, Scope.Scope>
  readonly emit: <Args extends readonly unknown[], R, E>(event: EventKey<Args, R, E>, ...args: Args) => Effect.Effect<void>
  readonly parallel: <Args extends readonly unknown[], R, E>(event: EventKey<Args, R, E>, ...args: Args) => Effect.Effect<readonly R[], E>
  readonly serial: <Args extends readonly unknown[], R, E>(event: EventKey<Args, R, E>, ...args: Args) => Effect.Effect<Option.Option<R>, E>
  readonly waterfall: <Args extends readonly unknown[], R, E>(
    event: EventKey<Args, R, E>, args: Args, final: Effect.Effect<R, E>) => Effect.Effect<R, E>
}
```

```
REQUIREMENT: `Bridger.layer` MUST provide the event bus as the base service
             `Bridger.Events` (identifier `@bridger/core/Events`). Plugins
             MUST obtain it by listing it in `requires` like any service.
```

```
REQUIREMENT: Because it is a host-owned base service (02 — Host
             Construction, BEH-BR-012), a plugin MUST NOT be able to provide
             or replace `Bridger.Events` in any resolution scope; an attempt
             MUST fail at install with `DuplicateProvider`
             (`providerId: "base"`).
```

```
REQUIREMENT: A realm MUST NOT isolate `Bridger.Events`: `defineRealm` MUST
             refuse a realm whose `isolate` lists it with `InvalidRealm`
             (17 — Realms and Interception, BEH-BR-145), so that every
             plugin of every realm resolves the one bus of its host.
```

A bus that was an ordinary plugin could be removed, and every plugin
requiring it would cascade to `waiting` with it. A realm that isolated the
bus would let a plugin in it provide a second one, and plugins in different
realms would no longer share one bus, which INV-BR-020 states they do
(CCR-BR-032).

## BEH-BR-138: Events are typed keys

> **See:** [ADR-BR-020](../decisions/020-typed-event-bus.md), [ADR-BR-011](../decisions/011-serviceid-is-key-identity.md)
> **Satisfies:** [URS-BR-013](../urs.md#urs-br-013-exchange-typed-events-between-plugins), [URS-BR-003](../urs.md#urs-br-003-catch-undeclared-dependencies-at-compile-time)
> **Risk:** [RSK-BR-010](../gxp/03-risk-assessment.md#rsk-br-010)

```ts
interface EventKey<Args extends readonly unknown[], Result, E> { readonly id: string }

const InvoicePosted = Event.make<[invoiceId: string], void, PostingError>()("billing/invoice-posted")
//                               ^ args             ^ result ^ error type of listeners and dispatch
```

```
REQUIREMENT: An event MUST be an `EventKey<Args, Result, E>` made by
             `Event.make`, carrying its argument tuple, result and error
             types. A listener whose signature does not match MUST be a
             compile error, and dispatch results and errors MUST be typed.
```

```
REQUIREMENT: Events MUST NOT be declared by declaration merging. The owner of
             an event exports its key and consumers import it.
```

```
REQUIREMENT: Event identifiers SHOULD follow `domain/action`. A breaking
             change to an event's arguments, result or error SHOULD use a new
             identifier carrying the major version.
```

**Settled here.** The bus matches listeners to dispatches by `EventKey.id`.
Unlike service keys, there is no activation at which two key objects could
be compared, so the bus does not fail on two key objects that share an `id`;
it cannot detect a changed shape under an unchanged identifier, exactly as
the core cannot for services ([RSK-BR-010](../gxp/03-risk-assessment.md#rsk-br-010)).
The versioned-identifier convention is the mitigation.

## BEH-BR-139: Listener lifetime is the registering scope

> **See:** [ADR-BR-020](../decisions/020-typed-event-bus.md), [ADR-BR-024](../decisions/024-shared-state-helpers.md)
> **Satisfies:** [URS-BR-013](../urs.md#urs-br-013-exchange-typed-events-between-plugins)

```
REQUIREMENT: `on` and `around` MUST register the listener for the lifetime of
             the caller's `Scope` and MUST remove it when that scope closes.
             There MUST be no separate unregistration API.
```

```
REQUIREMENT: A listener registered in a plugin's activation scope MUST
             disappear when the plugin stops.
```

```
REQUIREMENT: A listener's environment MUST be `never`: it closes over the
             services of the plugin that registered it.
```

The recurring defect of home-grown buses is a listener that outlives its
plugin and is called into a closed service. Tying registration to the scope
removes the bookkeeping that defect comes from. Ownership is reported to
`inspect` through `@bridger/core/ActivePlugin`
([13 — Observability and Diagnostics](./13-observability-and-diagnostics.md)).
When an `AccessPolicy` is wired, registering a listener consults it first and
a refusal registers nothing
([28 — Plugin Principal and Mandatory Policy](./28-plugin-principal-and-mandatory-policy.md),
BEH-BR-264).

## BEH-BR-140: Listener order and the dispatch snapshot

> **See:** [ADR-BR-020](../decisions/020-typed-event-bus.md), [ADR-BR-024](../decisions/024-shared-state-helpers.md)
> **Satisfies:** [URS-BR-013](../urs.md#urs-br-013-exchange-typed-events-between-plugins)

```
REQUIREMENT: Listeners MUST be ordered by `priority` ascending (default 0),
             then by registration order. `prepend` MUST place a listener
             first among listeners of equal priority.
```

```
REQUIREMENT: The listener list of each event MUST be stored in a
             `ContributionRegistry`, with each listener given a zero-padded,
             monotonically increasing contribution ID (descending for
             `prepend`), so that the registry's priority-then-ID order is
             exactly the order above.
```

```
REQUIREMENT: A dispatch MUST use the listener list as of its start. A
             listener whose plugin is removed during a dispatch MUST either
             already have completed or be interrupted under the registry's
             `drainTimeout`.
```

Reusing the registry means the bus inherits its snapshot and removal rules
([19 — Contribution Registry](./19-contribution-registry.md)) instead of
defining a second, subtly different set. A dispatch that saw listeners added
mid-flight would make its results depend on timing.

## BEH-BR-141: emit is fire and forget

> **See:** [ADR-BR-020](../decisions/020-typed-event-bus.md), [ADR-BR-050](../decisions/050-dormant-veto-and-hook-phases.md)
> **Satisfies:** [URS-BR-013](../urs.md#urs-br-013-exchange-typed-events-between-plugins), [URS-BR-050](../urs.md#urs-br-050-let-a-plugin-started-by-an-event-receive-that-event)
> **Risk:** [RSK-BR-016](../gxp/03-risk-assessment.md#rsk-br-016), [RSK-BR-058](../gxp/03-risk-assessment.md#rsk-br-058)

```
REQUIREMENT: `emit` MUST run each `on` listener in its own supervised fiber
             and MUST NOT let any listener failure or defect reach the
             emitter.
```

```
REQUIREMENT: Each listener failure under `emit` MUST be logged and reported
             as a `listener-failed` host event naming the event identifier.
```

An emitter that must know whether a listener failed uses `parallel` or
`serial`; `emit` is for notifications whose sender should not care. When an
`AccessPolicy` is wired, every dispatch consults it for the emitter before
any listener runs (28, BEH-BR-264). A dispatch applies the `OnEvent`
triggers of `dormant` plugins declaring the event at once, without delay;
the event is held for each plugin it wakes and delivered to that plugin once
it is `active`, and to no one else
([27 — Manifest and Lazy Activation](./27-manifest-and-lazy-activation.md),
BEH-BR-245, BEH-BR-251).

```
REQUIREMENT: A dispatch MUST apply `OnEvent` triggers only after the emit
             access decision (28 — Plugin Principal and Mandatory Policy,
             BEH-BR-264) has allowed it. A dispatch denied by a wired
             `AccessPolicy` MUST wake no plugin and hold no event.
```

```
REQUIREMENT: A dispatch that applies an `OnEvent` trigger MUST hand the
             event to the host to hold for the plugin it wakes (27 —
             Manifest and Lazy Activation, BEH-BR-251), and MUST read the
             emitter's principal for that plugin's `lazy-triggered` record
             (27, BEH-BR-253). When the woken plugin becomes `active`, the
             bus MUST deliver the held event once, with the semantics of
             `emit`, to the `on` listeners that plugin registered for the
             event during that activation, and to no other listener. The
             delivery MUST NOT be a second run of the triggering dispatch:
             listeners that received the event from the triggering dispatch
             MUST NOT receive it again.
```

**Settled here.** (1) `emit` completes once every listener fiber has been
started, not when they finish. (2) The listener fibers are supervised by the
bus, so they are interrupted when the host closes, and each running listener
holds its registry contribution as a `use` does, so its plugin's removal
waits for it under the registry's `drainTimeout`. A listener fiber does not
belong to the emitter, so interrupting the emitter does not interrupt the
listeners it started. (3) A listener interrupted because its plugin was
removed (BEH-BR-140) has not failed: it is not reported as `listener-failed`
(URS gap G23, CCR-BR-010).

## BEH-BR-142: parallel and serial

> **See:** [ADR-BR-020](../decisions/020-typed-event-bus.md)
> **Satisfies:** [URS-BR-013](../urs.md#urs-br-013-exchange-typed-events-between-plugins)

```
REQUIREMENT: `parallel` MUST run all `on` listeners concurrently, await all,
             and return their results. The first typed failure MUST
             interrupt the remaining listeners and fail the dispatch with
             that error.
```

```
REQUIREMENT: `serial` MUST run `on` listeners one at a time in order. The
             first listener that returns a defined result MUST end the chain
             with `Option.some(result)`; if none does, the result MUST be
             `Option.none()`. A typed failure MUST end the chain and fail the
             dispatch.
```

```
REQUIREMENT: Cordis's `bail` MUST NOT be provided: Effect has no synchronous
             dispatch, and `serial` covers the decision pattern.
```

```
REQUIREMENT: When a listener of a `parallel`, `serial` or `waterfall`
             dispatch is interrupted because its plugin was removed during
             the dispatch (BEH-BR-140), or its contribution was withdrawn
             after the dispatch began and before the listener's turn, the
             dispatch MUST fail with a defect naming the event identifier.
             It MUST NOT skip the listener or substitute a result for it.
```

**Settled here.** (1) `parallel` returns results in listener order, not
completion order, so the result is deterministic. (2) "Defined" in `serial`
means not `undefined`; `null` is a result. (3) A listener defect in
`parallel` or `serial` propagates as a defect of the dispatch, as a callback
defect does under `use`. (4) A listener cut off by its plugin's removal is
treated the same way: its result is missing, and a dispatch that skipped it
would return a result that depends on when the removal happened (URS gap
G23, CCR-BR-010).

## BEH-BR-143: waterfall composes around listeners

> **See:** [ADR-BR-020](../decisions/020-typed-event-bus.md)
> **Satisfies:** [URS-BR-013](../urs.md#urs-br-013-exchange-typed-events-between-plugins)

```
REQUIREMENT: `waterfall(event, args, final)` MUST compose the event's
             `around` listeners in order over `final`: each receives `args`
             and a `next` that runs the rest of the chain.
```

```
REQUIREMENT: A listener that does not run `next` MUST short-circuit the
             chain; its result is the dispatch result. A listener that only
             observes MUST run `next`.
```

**Settled here.** (1) `waterfall` runs only `around` listeners, and `emit`,
`parallel` and `serial` run only `on` listeners; a listener is registered
for one style of dispatch. (2) `next` is an ordinary `Effect` and is not
memoised: running it twice runs the rest of the chain twice. Listeners
should run it at most once.

`waterfall` is for middleware. A dispatch that needs registration rules, a
deadline or a record of who decided uses a hook point
([31 — Hook Points](./31-hook-points.md)).

## BEH-BR-144: Dispatch context, and no veto over host operations

> **Invariant:** [INV-BR-016](../invariants.md#inv-br-016-a-re-entrant-wait-fails-fast)
> **See:** [ADR-BR-020](../decisions/020-typed-event-bus.md), [ADR-BR-032](../decisions/032-operation-gate.md)
> **Satisfies:** [URS-BR-013](../urs.md#urs-br-013-exchange-typed-events-between-plugins), [URS-BR-024](../urs.md#urs-br-024-require-approval-before-a-regulated-change)
> **Risk:** [RSK-BR-014](../gxp/03-risk-assessment.md#rsk-br-014)

```
REQUIREMENT: `serial`, `parallel` and `waterfall` MUST run listeners in the
             dispatcher's fiber context — tracing span, log annotations and
             `@bridger/core/HeldPlugins`. `emit` MUST run them in child fibers
             that inherit the same. The one exception: every listener MUST
             run with `@bridger/core/CurrentActor` reset to
             `Actor.unattributed` (22 — Attributable Operations,
             BEH-BR-187), with `CurrentPlugin` set to the listener owner's
             principal (28 — Plugin Principal and Mandatory Policy,
             BEH-BR-258) and `CurrentAnnotations` filtered to flow "events"
             (30 — Operation Context Annotations, BEH-BR-292). Each listener
             MUST run with the dispatcher's `CurrentCorrelation`, taken when
             the dispatch starts (22 — Attributable Operations, BEH-BR-187).
```

```
REQUIREMENT: The bus MUST NOT offer any hook through which a listener can
             veto, delay or rewrite a host operation. Lifecycle observation
             MUST stay on `Host.events`.
```

```
REQUIREMENT: Authorisation of host lifecycle operations MUST go through the
             `OperationGate` port only (behaviour 25), never through an
             event. Application events MUST keep no veto over the host.
```

Inheriting `HeldPlugins` means a listener that, under a dispatcher holding a
lease, tries to remove that dispatcher's provider fails with `WouldDeadlock`
rather than hanging. `CurrentActor` is not inherited because a listener is
plugin code: an operator's identity carried into it would let a host call the
listener makes be recorded as that operator's action. A listener that mutates
the host states its own actor.

SPEC.md says veto-style hooks over host operations are not provided.
[ADR-BR-032](../decisions/032-operation-gate.md) amends that for **host
lifecycle operations only**, by adding one dedicated port rather than a veto
event: a decision that can refuse a regulated change must be one accountable
call, recorded as such, which a prioritised list of listeners — any of which
could be removed, fail silently under `emit`, or belong to the plugin being
changed — cannot be.

---

_Previous: [15 — Optional and Reactive Dependencies](./15-optional-and-reactive.md)_ · _Next: [17 — Realms and Interception](./17-realms-and-interception.md)_
