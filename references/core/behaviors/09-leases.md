# 09 — Leases

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-BEH-09                                               |
> | Revision       | 0.11                                                         |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.11 (2026-11-10): BEH-BR-086 a sub-scope close or `unmount` that removes a child itself is a path with no caller, and one that waits for a removal the parent's stop began follows that stop's limits (H1); BEH-BR-088 `HeldPlugins` and `CurrentTransition` name plugins by the canonical key `JSON.stringify([realm, id])`, never a separator join, which two (realm, id) pairs could share since neither name has a grammar, `WouldDeadlock` carries `realm` (C1); an untracked fiber a step forks keeps `CurrentTransition` for life, a documented false positive (C2) (CCR-BR-036)<br>0.10 (2026-11-10): BEH-BR-088 builds, `load` and finalizers carry their plugin in the new `@bridger/core/CurrentTransition` reference, `HeldPlugins` keeps leases only, and `CurrentTransition` is exported for companions to carry across a hand-off on the rules of `HeldPlugins`; `shutdown` fails `WouldDeadlock` from `CurrentTransition` alone, before its `requested` record (H1); BEH-BR-084 the child inherits `CurrentTransition`; BEH-BR-086 a refused background restart is a no-caller revocation (C3) (CCR-BR-035)<br>0.9 (2026-11-09): BEH-BR-081–083 the unions of `use`, `useAll` and `lease` add `ResolutionRefused`, as BEH-BR-013 (C-01) (CCR-BR-032)<br>0.8 (2026-11-08): BEH-BR-087: a deadline shortens only a given per-call timeout, never `lease`; BEH-BR-088: `HeldPlugins` provided only with a holder's set (CCR-BR-022)<br>0.7 (2026-11-08): BEH-BR-087 lease wait shortened by `Annotation.Deadline` (CCR-BR-018); BEH-BR-088 `HeldPlugins` exported for companions (CCR-BR-020)<br>0.6 (2026-10-02): Builds and finalizers carry HeldPlugins (forks they await too, not fibers forked into the activation scope); WouldDeadlock rechecked at linearization and raised by `retry`/`enable`; DrainTimeout `id`/`target`, `leases` 0 while waiting on a build; one parking rule; no-caller cascades revoke (CCR-BR-008)<br>0.5 (2026-10-02): WouldDeadlock decided before any wait (ADR-BR-038) (CCR-BR-006)<br>0.4 (2026-10-02): Scoped-lease revocation mechanism stated (prototype finding G12) (CCR-BR-004)<br>0.3 (2026-10-02): Prototype finding on supervised-child interruption ordering (CCR-BR-003)<br>0.2 (2026-10-02): Consistency fixes from independent review (CCR-BR-002)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001) |

---

A plugin can be removed while another part of the program is calling it. A
lease is how Bridger keeps that call safe: while a lease is held, the provider
it names does not close. This file converts SPEC.md "Leases: limits,
supervision and re-entrancy" together with the `use`, `useAll` and `lease`
paragraphs of "Host interface". It covers the one lease primitive, the
supervised child that makes a callback interruptible, the bounded drain, the
explicit force, the per-call timeout, and re-entrancy detection with its
limit. This file owns BEH-BR-081–088 and uses all eight.

Removal ordering itself (dependents first, hide from new consumers) is in
[06 — Removal](./06-removal.md); the state × operation table is in
[08 — Operation Legality](./08-operation-legality.md).

## BEH-BR-081: A lease holds an active provider for the duration of a call

> **Invariant:** [INV-BR-006](../invariants.md#inv-br-006-a-leased-provider-does-not-close-under-its-lease)
> **See:** [ADR-BR-015](../decisions/015-leases-one-primitive.md)
> **Satisfies:** [URS-BR-005](../urs.md#urs-br-005-never-lose-a-provider-in-the-middle-of-a-call)
> **Risk:** [RSK-BR-001](../gxp/03-risk-assessment.md#rsk-br-001)

```ts
// illustrative — not type-checked
interface Host {
  use<Service, A, E, R>(
    key: Context.Key<any, Service>,
    run: (service: Service) => Effect.Effect<A, E, R>,
    options?: { readonly timeout?: Duration.Input; readonly realm?: string }
  ): Effect.Effect<A, E | ServiceUnavailable | UnknownRealm | LeaseRevoked | LeaseTimeout
      | ResolutionRefused, R>                                    // ResolutionRefused: 29, BEH-BR-274
  // useAll and lease: see BEH-BR-082 and BEH-BR-083
}
```

```
REQUIREMENT: `use` MUST admit a lease only on a provider that is `active` in
             the resolution scope named by `options.realm` (default
             "default"). When no such provider exists it MUST fail with
             `ServiceUnavailable { serviceId }` and MUST NOT run `run`.
```

```
REQUIREMENT: When `options.realm` names a realm that has not been defined
             (17 — Realms and Interception), `use`, `useAll` and `lease` MUST
             fail with `UnknownRealm { id }`, admit no lease, and MUST NOT run
             `run`.
```

```
REQUIREMENT: While a lease admitted by `use` is held, the provider's
             activation scope MUST NOT begin to close. The lease is held
             from the moment the callback is admitted until the callback
             and its finalizers have ended.
```

```
REQUIREMENT: A provider that is `stopping`, failing (BEH-BR-094) or hidden
             from new consumers by a removal in progress MUST be treated as
             not `active` for admission: new leases on it fail with
             `ServiceUnavailable`, while leases admitted earlier keep it
             open until they end or are revoked.
```

```
REQUIREMENT: `use`, `useAll` and `lease` are not mutating operations. They
             MUST NOT require attribution, MUST NOT consult the
             `OperationGate`, and MUST NOT write audit records.
```

The lease protects the **provider**, not every value derived from it. A
service reference stored in a variable, or a fiber forked outside the
callback, can outlive the lease, and TypeScript cannot prevent that. Callers
must keep such work inside the callback, inside a scoped lease
(BEH-BR-083), or inside a plugin activation scope. This is an author
contract, stated here so that nobody reads the lease as a guarantee it is not.

Leases are reads of the provider table, not changes to the plugin set, so the
GxP hooks of [22](./22-attributable-operations.md) to
[25](./25-operation-gate.md) do not apply to them. A forced revocation of a
lease is a change and is audited (BEH-BR-086).

**Settled here.** (1) After shutdown has begun, `use`, `useAll` and `lease`
fail with `ServiceUnavailable`, not `HostClosed`: their error unions in
SPEC.md do not include `HostClosed`, every provider is by then stopping or
gone, and `ServiceUnavailable` is the accurate statement. (2) A key served
by the base Context or base Layer can be leased like any provider; such a
lease never delays the removal of any plugin, and base services remain
available until every plugin has stopped during shutdown. (3) An undefined
`realm` fails with `UnknownRealm`, as in the `Host` interface of
[02 — Host Construction](./02-host-construction.md), rather than with
`ServiceUnavailable`: a misspelt realm name is a caller error, and reporting
it as an absent provider would send the caller looking for a plugin that was
never meant to be there.

## BEH-BR-082: useAll is all-or-nothing in a canonical key order

> **Invariant:** [INV-BR-006](../invariants.md#inv-br-006-a-leased-provider-does-not-close-under-its-lease)
> **See:** [ADR-BR-015](../decisions/015-leases-one-primitive.md)
> **Satisfies:** [URS-BR-005](../urs.md#urs-br-005-never-lose-a-provider-in-the-middle-of-a-call)

```ts
useAll<Keys extends readonly Context.Key<any, any>[], A, E, R>(
  keys: Keys,
  run: (services: ServicesOf<Keys>) => Effect.Effect<A, E, R>,
  options?: { readonly timeout?: Duration.Input; readonly realm?: string }
): Effect.Effect<A, E | ServiceUnavailable | UnknownRealm | LeaseRevoked | LeaseTimeout
    | ResolutionRefused, R>                                      // ResolutionRefused: 29, BEH-BR-274

type ServicesOf<Keys extends readonly Context.Key<any, any>[]> =
  { readonly [I in keyof Keys]: Keys[I] extends Context.Key<any, infer S> ? S : never }
```

```
REQUIREMENT: `useAll` MUST lease every listed key or none. If any key has no
             `active` provider it MUST fail with `ServiceUnavailable` naming
             one unavailable `serviceId`, MUST hold no lease afterwards, and
             MUST NOT run `run`.
```

```
REQUIREMENT: Leases for several keys MUST be acquired in one canonical order
             that does not depend on the order the caller listed them, so
             that two concurrent `useAll` calls over overlapping keys cannot
             deadlock each other.
```

```
REQUIREMENT: Removing, replacing, restarting or disabling any provider that a
             running `useAll` callback leases MUST wait for that callback,
             under the drain rules of BEH-BR-085.
```

```
REQUIREMENT: `useAll` MUST NOT extend a lease to services that a leased
             provider reaches internally. A component that needs that
             guarantee MUST use `Generation` (behaviour 20).
```

`services` is delivered in the caller's order; only acquisition follows the
canonical order. The failure to "extend" is deliberate: a provider's own
dependencies are already protected by dependents-first removal
([INV-BR-005](../invariants.md#inv-br-005-dependents-stop-before-their-providers)),
and anything subtler — a registry generation that references several plugins'
handlers — is what [20 — Generation](./20-generation.md) exists for.

**Settled here.** The canonical order is ascending `ServiceId` compared by
UTF-16 code units, which is total, stable across processes and independent of
bundling. A key listed twice in `keys` is leased once and delivered at both
positions.

## BEH-BR-083: One primitive — the scoped lease

> **See:** [ADR-BR-015](../decisions/015-leases-one-primitive.md)
> **Satisfies:** [URS-BR-005](../urs.md#urs-br-005-never-lose-a-provider-in-the-middle-of-a-call)
> **Risk:** [RSK-BR-001](../gxp/03-risk-assessment.md#rsk-br-001)

```ts
lease<Keys extends readonly Context.Key<any, any>[]>(
  keys: Keys,
  options?: { readonly realm?: string }
): Effect.Effect<ServicesOf<Keys>, ServiceUnavailable | UnknownRealm | ResolutionRefused,
    Scope.Scope>                                                 // ResolutionRefused: 29, BEH-BR-274

// use and useAll are defined in terms of it:
//   Effect.scoped(lease(keys)), then Effect.forkChild for the callback, then join —
//   with the child interrupted and awaited on caller interruption (BEH-BR-084).
```

```
REQUIREMENT: `lease(keys)` MUST be the only lease primitive. `use` and
             `useAll` MUST be `lease` scoped to the callback plus the
             supervised child of BEH-BR-084, so that there is exactly one
             admission, one drain and one revocation path.
```

```
REQUIREMENT: `lease(keys)` MUST be all-or-nothing as `useAll` is, MUST hold
             the services for the lifetime of the caller's `Scope`, and MUST
             release them when that scope closes.
```

```
REQUIREMENT: The drain and force rules of BEH-BR-085 and BEH-BR-086 MUST apply
             to scoped leases. A forced revocation MUST close the lease's
             contribution to the holder's scope, so that the holder observes
             interruption of fibers it forked under the lease.
```

A scoped lease is for components that hold providers beyond one callback,
such as a tenant registry generation. Two lease mechanisms would mean two
drain implementations that could disagree about when a provider is free;
the SPEC's acceptance check "`use` and `useAll` go through the same admission,
drain and revocation path as `lease`" is the observable form of this rule.

A scoped-lease holder has no callback to fail, so it never receives
`LeaseRevoked` as a value; it observes revocation as interruption.

## BEH-BR-084: Callbacks run in a supervised child

> **See:** [ADR-BR-015](../decisions/015-leases-one-primitive.md)
> **Satisfies:** [URS-BR-005](../urs.md#urs-br-005-never-lose-a-provider-in-the-middle-of-a-call)
> **Risk:** [RSK-BR-001](../gxp/03-risk-assessment.md#rsk-br-001)

```
REQUIREMENT: `use` and `useAll` MUST run the callback in a child fiber
             supervised by the host and joined by the caller. The host MUST
             NOT interrupt the caller's own fiber.
```

```
REQUIREMENT: If the caller is interrupted while the callback runs, the host
             MUST interrupt the child, await the child's finalizers, and only
             then release the lease. The caller's interruption MUST complete
             after that, not before.
```

```
REQUIREMENT: The child MUST inherit the caller's fiber references — at least
             the tracing span, the logger annotations,
             `@bridger/core/HeldPlugins` and
             `@bridger/core/CurrentTransition` — and the caller's `R`
             environment.
```

```
REQUIREMENT: The callback's own failures and defects MUST propagate to the
             caller unchanged. `LeaseRevoked` and `LeaseTimeout` MUST be
             produced only when the host interrupted the child.
```

```
REQUIREMENT: Fibers the callback forks outside the child's scope MUST NOT be
             treated as part of the lease.
```

Running the callback in a child is what makes a force or a timeout possible
without the host reaching into a fiber it does not own. If the host
interrupted the caller instead, an unrelated `use` deep inside an
application request handler could abort the whole request. The ordering on
caller interruption (child finalizers, then lease release) is what keeps the
provider open for the child's own cleanup.

Inheriting `HeldPlugins` is not cosmetic: without it, a callback that calls
`remove` on its own provider would wait on itself (BEH-BR-088).

**Prototype finding (CCR-BR-003).** The obvious implementation — fork the
callback with `forkChild` inside the lease and `join` it — does **not** meet
the second requirement above: when the caller is interrupted, the lease's
release runs first and the child's finalizers only afterwards, when the
child is reaped with its parent. The implementation must handle the
interruption explicitly — interrupt the child and await it (for example
`Fiber.join(child).pipe(Effect.onInterrupt(() => Fiber.interrupt(child)))`)
before the release step runs. Both behaviours were observed on effect 4.0.0
(prototype checks E7a–E7b); the acceptance check for this requirement
(BEH-BR-183, check 12) must exercise exactly this interruption.

## BEH-BR-085: Draining is bounded unless declared forever

> **Invariant:** [INV-BR-017](../invariants.md#inv-br-017-every-drain-is-bounded-unless-declared-forever)
> **See:** [ADR-BR-015](../decisions/015-leases-one-primitive.md)
> **Satisfies:** [URS-BR-002](../urs.md#urs-br-002-remove-or-replace-a-plugin-safely-while-it-is-in-use), [URS-BR-010](../urs.md#urs-br-010-detect-a-plugin-that-waits-forever)
> **Risk:** [RSK-BR-001](../gxp/03-risk-assessment.md#rsk-br-001)

```ts
interface RemoveOptions extends OperationOptions {
  readonly drain?: Duration.Input | "forever"   // default: BridgerOptions.drainTimeout (30 seconds)
  readonly force?: boolean                      // interrupt leases still held after `drain`
}
```

```
REQUIREMENT: `remove`, `replace`, `restart` and `disable` MUST wait for the
             leases on a stopping plugin for at most `drain`, which defaults
             to `BridgerOptions.drainTimeout` (default 30 seconds).
```

```
REQUIREMENT: When the drain limit expires without `force`, the call MUST fail
             with `DrainTimeout { id, leases, target? }`, where `id` names the
             plugin (or `Generation`) whose leases did not drain, or whose
             running transition step the call was waiting for, `leases` is
             the number still held on it (0 when the call was waiting for a
             build step), and `target` names the plugin the call named,
             present exactly when it differs from `id`. The plugin MUST
             remain `stopping` and unavailable to new consumers, its stop
             parked (08 — Operation Legality, BEH-BR-074), and the operation
             MAY be repeated with a longer `drain` or with `force: true`.
```

```
REQUIREMENT: When a call fails with `DrainTimeout`, every stop it drives that
             has not settled — its own stop and every dependency-loss stop
             it started, at any depth — MUST park in the same revision
             (08 — Operation Legality, BEH-BR-079). Only the call under whose
             options the drain ran MUST fail; another cascade waiting on that
             stop MUST then find it parked and resume it under its own
             options (BEH-BR-080).
```

```
REQUIREMENT: While a stopping call waits for a dependent's running
             transition step — a build or a stop (08 — Operation Legality,
             BEH-BR-079) — its own drain limit MUST run. When the limit
             expires without `force`, the call MUST fail with `DrainTimeout`
             naming that dependent in `id` (`leases` 0 when the step is a
             build), and every stop it drives that has not settled MUST park
             as the previous requirement states; the dependent's step
             continues under its owner's options. With `force`, the
             dependent's remaining leases MUST be revoked (BEH-BR-086). For a
             cascade with no caller at its root, an expiry while it waits for
             a build step MUST continue the wait under `buildTimeout`.
```

```
REQUIREMENT: An unbounded drain MUST be requested explicitly with
             `drain: "forever"` (per call or as `drainTimeout`). A default MUST
             NOT be unbounded.
```

```
REQUIREMENT: A `DrainTimeout` MUST emit a `drain-timeout` host event whose
             `pluginId` is the error's `id` and whose `target` is the error's
             `target`, and each stop that parks MUST emit a `stop-parked`
             event whose `target` names the plugin named by the one failing
             call (13 — Observability and Diagnostics).
```

A lease is held for as long as a callback runs, so a stuck callback would
otherwise hold a removal forever — the failure mode
[URS-BR-010](../urs.md#urs-br-010-detect-a-plugin-that-waits-forever) exists
to rule out. `DrainTimeout` leaves the plugin `stopping` rather than rolling
back to `active`: the provider has already been hidden from new consumers and
its dependents have already stopped, and silently republishing it would undo
a removal the caller asked for.

How a `DrainTimeout` interacts with the per-plugin operation order and with a
repeated call is specified in [08 — Operation Legality](./08-operation-legality.md).
A cascading call's total wait is bounded by its own drain limit for the
plugin it named and for each plugin on the dependency path below it, plus
`buildTimeout` for each build step it waits for: its own limit runs while it
waits, so another call's limit — even `drain: "forever"` — does not add to it.
Finalizer running time is not bounded by the core
([12 — Shutdown and Hosting](./12-shutdown-and-hosting.md), BEH-BR-107), so
the bound holds for finalizers that return.

**Settled here.** When a call fails with `DrainTimeout`, every stop it was
driving parks with it, at any depth (CCR-BR-008). A dependency-loss stop that
the failing call started and left running would have no call driving it and
no limit of its own; parking it makes it visible (`parked` true) and lets the
next call, cascade or shutdown resume it. Only the call whose options the
drain ran under fails: another cascade waiting on the same stop is not told
`DrainTimeout` for a limit it did not set, and resumes the parked stop under
its own options.

## BEH-BR-086: Force revokes leases, and revocation is reported and audited

> **Invariant:** [INV-BR-006](../invariants.md#inv-br-006-a-leased-provider-does-not-close-under-its-lease)
> **See:** [ADR-BR-015](../decisions/015-leases-one-primitive.md), [ADR-BR-030](../decisions/030-audit-sink-port.md)
> **Satisfies:** [URS-BR-002](../urs.md#urs-br-002-remove-or-replace-a-plugin-safely-while-it-is-in-use), [URS-BR-021](../urs.md#urs-br-021-know-who-changed-the-plugin-set-when-and-why)
> **Risk:** [RSK-BR-015](../gxp/03-risk-assessment.md#rsk-br-015), [RSK-BR-004](../gxp/03-risk-assessment.md#rsk-br-004)

```
REQUIREMENT: With `force: true`, after the drain limit the host MUST interrupt
             the remaining lease callbacks (and revoke remaining scoped
             leases), MUST wait for their finalizers, and only then MUST close
             the plugin's activation scope.
```

```
REQUIREMENT: A scoped lease taken with `lease(keys)` has no child fiber of its
             own, so revoking it MUST interrupt the fiber that acquired it
             (and with it the fibers forked under the lease). Documentation of
             `lease` MUST say so; a holder for whom that is unacceptable uses
             `use` or `useAll`, whose callback runs in a child.
```

**Prototype finding G12 (CCR-BR-004).** "Revoke remaining scoped leases"
named no mechanism. A scoped lease is held by the fiber that called
`lease(keys)`; there is no child to interrupt instead, so a forced removal can
only interrupt that fiber. The prototype does exactly that. This is the same
trade-off `Generation.acquire` makes against `Generation.use` (behaviour 20),
and it is now stated rather than implied.

```
REQUIREMENT: An interrupted `use` or `useAll` callback MUST fail its caller
             with `LeaseRevoked`. The caller's own fiber MUST NOT be
             interrupted.
```

```
REQUIREMENT: Every revocation MUST be reported as a `lease-revoked` host
             event. When an `AuditSink` is wired, it MUST also be audited as
             the system transition `lease-revoked`, attributed to
             `Actor.system`, with `causationId` set to the record id of the
             operation (or system event) that forced it.
```

```
REQUIREMENT: `force` MUST NOT be applied unless the caller passed
             `force: true`, except where this specification names a path
             with no caller: the runtime failure transition (BEH-BR-095),
             the overall shutdown limit (behaviour 12), a refused background
             restart (28 — Plugin Principal and Mandatory Policy,
             BEH-BR-267), the close of a sub-scope or a
             `Plugin.Runtime.unmount` that itself removes a child or resumes
             its parked stop (14 — Children and Groups, BEH-BR-121,
             BEH-BR-126), and a cascade whose root is a runtime failure, a
             dependency-loss stop with no operator call at its root, a
             refused background restart, or shutdown (08 — Operation
             Legality, BEH-BR-080). On such a path the host MUST revoke the
             leases still held when the drain limit expires — for shutdown,
             only once the overall shutdown limit has passed (BEH-BR-107) —
             and MUST NOT park the stop, including a parked stop that the
             path resumes.
```

```
REQUIREMENT: A path whose cascade root is an operator call MUST NOT revoke
             without that call's `force: true`: on expiry it MUST fail the
             call with `DrainTimeout` and park the stop (BEH-BR-085).
```

```
REQUIREMENT: A sub-scope close or `Plugin.Runtime.unmount` that waits for a
             child removal its parent's stop has already begun MUST NOT
             revoke on its own: the wait MUST follow the limits of that
             stop — parked with an operator call at its root, the overall
             limit under shutdown, revocation at the drain limit only on a
             path with no caller (14 — Children and Groups, BEH-BR-121;
             CCR-BR-036).
```

Interruption does **not** undo external effects. A callback interrupted
halfway through writing a batch to an external system leaves that batch
however the external system leaves interrupted writes; Bridger promises only
that the callback's finalizers have run before the provider closes. That is
why force is never a default: a consumer whose callbacks perform regulated
writes sets `drainTimeout` long enough for the longest such write, or uses
`drain: "forever"`, and treats `force` as an operator decision.

SPEC.md said "forcing is audited as a host event". That conflated two
channels. `Host.events` is a lossy diagnostic feed, not an audit trail
([13 — Observability and Diagnostics](./13-observability-and-diagnostics.md));
the audit trail is the `AuditSink` record of
[23 — Audit Sink and Record](./23-audit-sink-and-record.md). Forcing is
therefore *reported* on the event feed and, when a sink is wired, *also*
recorded through the sink.

## BEH-BR-087: A per-call timeout bounds one callback

> **See:** [ADR-BR-015](../decisions/015-leases-one-primitive.md)
> **Satisfies:** [URS-BR-010](../urs.md#urs-br-010-detect-a-plugin-that-waits-forever)

```
REQUIREMENT: When `options.timeout` is given to `use` or `useAll`, expiry MUST
             interrupt the supervised child, await its finalizers, release
             the lease, and fail the caller with
             `LeaseTimeout { serviceId, timeout }`.
```

```
REQUIREMENT: The timeout MUST be measured from admission, using the `Clock`
             service, and MUST be applied to the supervised child (for
             example `Effect.timeoutOrElse`), never by interrupting the
             caller's fiber.
```

```
REQUIREMENT: A `LeaseTimeout` MUST emit a `lease-timeout` host event. It is
             not a revocation and MUST NOT be audited as one.
```

The per-call timeout is the caller's own bound and the drain limit is the
remover's; they are independent. A short `timeout` protects a request
handler from a slow provider; a `drainTimeout` protects a removal from a slow
callback. For `useAll`, `serviceId` names the first key in canonical order.

```
REQUIREMENT: When `options.timeout` is given to `use` or `useAll` and the
             calling fiber carries `Annotation.Deadline`, the effective
             per-call timeout MUST be the earlier of `options.timeout` and
             the deadline, with the same outcome (`LeaseTimeout`); a
             deadline already past fails at once
             ([30 — Operation Context Annotations](./30-operation-context-annotations.md),
             BEH-BR-291). A deadline alone, with no `options.timeout`, MUST
             NOT bound the call; it MUST NOT affect `lease`, whose
             admission does not wait; and it MUST NOT shorten a drain.
```

## BEH-BR-088: A re-entrant wait fails fast, within a stated limit

> **Invariant:** [INV-BR-016](../invariants.md#inv-br-016-a-re-entrant-wait-fails-fast)
> **See:** [ADR-BR-016](../decisions/016-reentrancy-detection.md)
> **Satisfies:** [URS-BR-010](../urs.md#urs-br-010-detect-a-plugin-that-waits-forever)
> **Risk:** [RSK-BR-011](../gxp/03-risk-assessment.md#rsk-br-011)

```ts
// Context.Reference<ReadonlySet<string>>, identifier "@bridger/core/HeldPlugins",
// default: the empty set. Inherited by forked fibers. Exported (CCR-BR-020).
// Each element is a plugin's canonical key, JSON.stringify([realm, id]) (CCR-BR-036).

// Context.Reference<Option<string>>, identifier "@bridger/core/CurrentTransition",
// default: none. The canonical key of the plugin whose build, `load` or
// finalizer step the fiber runs. Inherited by forked fibers. Exported for
// carrying across a hand-off, on the rules of HeldPlugins (CCR-BR-035).
```

```
REQUIREMENT: A plugin MUST be named in `@bridger/core/HeldPlugins` and in
             `@bridger/core/CurrentTransition` by its canonical key, the
             string `JSON.stringify([realm, id])`, the default realm spelled
             "default" (17 — Realms and Interception, BEH-BR-147), so that a
             lease on or a step of plugin `repo` in one realm never refuses
             an operation on `repo` in another. No separator join is used
             because neither a realm id (a family member's is `${id}/${K}`)
             nor a plugin id has a grammar: with `realm + "/" + id`, realm
             "a/b" with plugin "c" and realm "a" with plugin "b/c" would
             collide and refuse a call that waits for no held plugin.
             Every check of this behaviour MUST compare canonical keys.
             `WouldDeadlock` MUST carry the refused plugin's `id` and its
             `realm` (CCR-BR-036).
```

```
REQUIREMENT: A fiber holding a lease on plugin P, and every fiber it forks,
             MUST carry P's canonical key in `@bridger/core/HeldPlugins`.
```

```
REQUIREMENT: A fiber running plugin P's `build` or `load`
             (27 — Manifest and Lazy Activation), or one of the finalizers
             of P's activation scope, MUST carry P's canonical key in
             `@bridger/core/CurrentTransition`, and so MUST every fiber it
             forks and awaits before returning. Such a fiber MUST carry in
             `@bridger/core/HeldPlugins` only the leases it holds. Fibers
             forked into the activation scope (`background`,
             `whenAvailable`) MUST carry no plugin in `CurrentTransition`
             and only the leases they hold in `HeldPlugins`.
```

```
REQUIREMENT: From a fiber that carries P in `HeldPlugins` or in
             `CurrentTransition`, any call that would wait for P to drain,
             or for a transition step of P, MUST fail immediately with
             `WouldDeadlock { id, realm }` without recording intent: `remove`,
             `replace`, `restart`, `disable` or `reconfigure` of P; `retry`
             or `enable` of P while a system stop of P is running
             (08 — Operation Legality, BEH-BR-073); `remove`, `replace`,
             `restart`, `disable` or `reconfigure` of any provider whose
             stopping would first stop P; and `awaitIdle`.
```

```
REQUIREMENT: `shutdown` called from a fiber that carries a plugin P in
             `@bridger/core/CurrentTransition` MUST fail at once with
             `WouldDeadlock { id, realm }` naming P, before its `requested` record:
             it MUST write no record, MUST NOT begin shutdown and MUST NOT
             join one in progress (12 — Shutdown and Hosting, BEH-BR-105;
             22 — Attributable Operations, BEH-BR-188). `HeldPlugins` MUST
             NOT be read for this check: a lease holder's `shutdown` MUST
             NOT fail with `WouldDeadlock`.
```

```
REQUIREMENT: For a mutating call other than `shutdown`, the check MUST be
             made at step 7 of BEH-BR-188, before the call waits for
             anything a carried plugin can block — a step on its target, a
             step on a dependent, or the call in flight it would join — and
             MUST be made again at the linearization point, before the
             intent is recorded, since only there is it known whether the
             call joins an operation in flight. A call from such a fiber on
             a plugin whose stop would not wait for P MUST NOT wait for P's
             drain or step (08 — Operation Legality, BEH-BR-078).
```

```
REQUIREMENT: `use`, `useAll` and `lease` of other services MUST remain allowed
             from such a fiber.
```

```
REQUIREMENT: The check MUST follow the carried references only. This
             specification MUST NOT be read as claiming that every re-entrant
             deadlock is detected.
```

```
REQUIREMENT: A fiber that P's build, `load` or finalizer forks without
             awaiting it, other than through `background` or
             `whenAvailable` — for example with `Effect.forkScoped` or
             `Effect.forkDaemon` — inherits P in `CurrentTransition` and
             keeps it for its whole life, since the host does not track it
             (10 — Runtime Failure and Health, BEH-BR-090). Its guarded
             calls on P, its `awaitIdle` and its `shutdown` MUST fail with
             `WouldDeadlock` after the step has returned as well, although
             no cycle remains. This false positive is a documented limit,
             carried by no step token (RSK-BR-011; CCR-BR-036): work that
             outlives the step belongs in `background`.
```

A cycle of waits can be closed only by code that runs inside a lease, a build
or a finalizer and calls the host: the host's own transitions wait only along
dependency edges (08 — Operation Legality, BEH-BR-078). The carried reference
catches such a call anywhere in the fiber tree that inherited it. The limit is
real and stated: a wait that goes through another fiber — a callback that
hands work to a fiber which did not inherit the reference and which then
calls `remove` — cannot be detected. That residual is RSK-BR-011's; it is
bounded by the drain limits (BEH-BR-085) and by `buildTimeout`, exactly as
for any stuck lease or build. Failing fast where the reference makes the cycle
visible turns the commonest cases — a callback that removes its own provider,
a build or finalizer that restarts its own plugin — from a hang into a typed
error.

**Settled here.** SPEC.md's re-entrancy list did not name `reconfigure`.
Because `reconfigure` restarts through the same stop path as `replace`
([11 — Configuration](./11-configuration.md)), it waits for P to drain and is
included. For a mutating call, `WouldDeadlock` is decided after the
`requested` record and before intent is recorded (step 7 of the order in
[22 — Attributable Operations](./22-attributable-operations.md), BEH-BR-188,
and again at the linearization point), so the call changes nothing
and, with a sink wired, ends with a `failed` terminal record; this keeps one
`requested` and one terminal record per call
([INV-BR-022](../invariants.md#inv-br-022-one-requested-and-one-terminal-record-per-mutating-call)).

**Settled here.** SPEC.md attached `HeldPlugins` to lease holders only. A
`build` that calls `restart` on its own plugin, or a finalizer that calls
`remove` on it, waits for its own transition step just as a callback that
removes its own provider waits for its own drain. Builds and finalizers
therefore carry their plugin's ID as well (CCR-BR-008) — since CCR-BR-035 in
`CurrentTransition`, together with `load` — and the check is
repeated at the linearization point because a join, which waits for the
step in flight, is decided only there. The ID passes to the fibers a build or
finalizer forks and awaits, since their wait is the step's wait; it does not
pass to the fibers forked into the activation scope (`background`,
`whenAvailable`), which outlive the build and do not hold up its step — they
carry only the leases they hold. `retry` and `enable` are on the list because
they wait for a running system stop of their plugin.

**Settled here (CCR-BR-035).** Builds and finalizers used to carry their
plugin in `HeldPlugins`, the lease holders' set. `shutdown` must refuse a
build, `load` or finalizer fiber and allow a lease callback (12 — Shutdown and
Hosting, BEH-BR-105), and one set could not tell them apart. The transition
steps therefore carry their plugin in a reference of their own,
`CurrentTransition`, and `HeldPlugins` keeps leases only. Every other guarded
call reads both references, so what it refuses is unchanged. `shutdown` reads
`CurrentTransition` alone, and decides before its `requested` record, since
it neither queues behind a turn nor joins as a plugin operation does, and a
refused shutdown must not join the one in progress.
`CurrentTransition` is exported on the same terms as `HeldPlugins`: a
companion that hands work to another fiber — a remote call whose guest calls
back while P's build awaits it — must carry it, or a callback's
`restart(P)` would wait for the build that waits for it instead of failing
with `WouldDeadlock`.

```
REQUIREMENT: Core MUST export the `@bridger/core/HeldPlugins` reference so
             that a companion that runs work on another fiber on behalf of
             a lease holder (for example a remote callback,
             [BEH-RM-022](../../remote/behaviors/03-remote-calls.md)) can
             carry the holder's set. Core MUST NOT read the reference from
             any source other than the calling fiber. A companion MAY
             provide the reference only with a set it read from a holder's
             fiber (a copy or a union of such sets), and MUST NOT provide an
             empty or reduced set to a fiber that carries one.
```

```
REQUIREMENT: Core MUST export the `@bridger/core/CurrentTransition`
             reference on the same terms, so that a companion that runs
             work on another fiber on behalf of a fiber of a build, `load`
             or finalizer step (for example a remote callback, BEH-RM-022)
             can carry its value. Core MUST NOT read the reference from any
             source other than the calling fiber. A companion MAY provide
             it only with a value it read from such a fiber, and MUST NOT
             provide none, or another plugin's key, to a fiber that carries
             one.
```

**Settled here (CCR-BR-020; CCR-BR-035 for `CurrentTransition`).** Exporting
a reference does not widen what it detects: a companion that hands work to
another fiber without carrying both leaves that wait undetected, the residual of
[RSK-BR-011](../gxp/03-risk-assessment.md#rsk-br-011). Exporting it lets a
companion close that gap for its own hand-offs.

---

_Previous: [08 — Operation Legality](./08-operation-legality.md)_ · _Next: [10 — Runtime Failure and Health](./10-runtime-failure-and-health.md)_
