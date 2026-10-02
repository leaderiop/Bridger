# 09 — Leases

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-BEH-09                                               |
> | Revision       | 0.5                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.5 (2026-10-02): WouldDeadlock decided before any wait (ADR-BR-038) (CCR-BR-006)<br>0.4 (2026-10-02): Scoped-lease revocation mechanism stated (prototype finding G12) (CCR-BR-004)<br>0.3 (2026-10-02): Prototype finding on supervised-child interruption ordering (CCR-BR-003)<br>0.2 (2026-10-02): Consistency fixes from independent review (CCR-BR-002)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001) |

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
  ): Effect.Effect<A, E | ServiceUnavailable | UnknownRealm | LeaseRevoked | LeaseTimeout, R>
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
): Effect.Effect<A, E | ServiceUnavailable | UnknownRealm | LeaseRevoked | LeaseTimeout, R>

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
): Effect.Effect<ServicesOf<Keys>, ServiceUnavailable | UnknownRealm, Scope.Scope>

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
             the tracing span, the logger annotations and
             `@bridger/core/HeldPlugins` — and the caller's `R` environment.
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
             with `DrainTimeout { id, leases }`, where `leases` is the number
             still held. The plugin MUST remain `stopping` and unavailable to
             new consumers, and the operation MAY be repeated with a longer
             `drain` or with `force: true`.
```

```
REQUIREMENT: An unbounded drain MUST be requested explicitly with
             `drain: "forever"` (per call or as `drainTimeout`). A default MUST
             NOT be unbounded.
```

```
REQUIREMENT: A `DrainTimeout` MUST emit a `drain-timeout` host event.
```

A lease is held for as long as a callback runs, so a stuck callback would
otherwise hold a removal forever — the failure mode
[URS-BR-010](../urs.md#urs-br-010-detect-a-plugin-that-waits-forever) exists
to rule out. `DrainTimeout` leaves the plugin `stopping` rather than rolling
back to `active`: the provider has already been hidden from new consumers and
its dependents have already stopped, and silently republishing it would undo
a removal the caller asked for.

How a `DrainTimeout` interacts with the per-plugin operation lock and with a
repeated call is specified in [08 — Operation Legality](./08-operation-legality.md).

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
             with no caller: the runtime failure transition (BEH-BR-095)
             and the overall shutdown limit (behaviour 12).
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

## BEH-BR-088: A re-entrant wait fails fast, within a stated limit

> **Invariant:** [INV-BR-016](../invariants.md#inv-br-016-a-re-entrant-wait-fails-fast)
> **See:** [ADR-BR-016](../decisions/016-reentrancy-detection.md)
> **Satisfies:** [URS-BR-010](../urs.md#urs-br-010-detect-a-plugin-that-waits-forever)
> **Risk:** [RSK-BR-011](../gxp/03-risk-assessment.md#rsk-br-011)

```ts
// Context.Reference<ReadonlySet<string>>, identifier "@bridger/core/HeldPlugins",
// default: the empty set. Inherited by forked fibers.
```

```
REQUIREMENT: A fiber holding a lease on plugin P, and every fiber it forks,
             MUST carry P's ID in `@bridger/core/HeldPlugins`.
```

```
REQUIREMENT: From such a fiber, any call that would wait for P to drain MUST
             fail immediately with `WouldDeadlock { id }` without recording
             intent: `remove`, `replace`, `restart`, `disable` or
             `reconfigure` of P; the same operations on any provider whose
             stopping would first stop P; and `awaitIdle`.
```

```
REQUIREMENT: The check MUST be decided before the call waits for anything a
             held lease can block: a step on its target, a step on a
             dependent, or the call in flight it would join. A call from
             such a fiber on a plugin whose stop would not wait for P MUST
             NOT wait for P's drain (08 — Operation Legality, BEH-BR-078).
```

```
REQUIREMENT: `use`, `useAll` and `lease` of other services MUST remain allowed
             from such a fiber.
```

```
REQUIREMENT: The check MUST follow the carried reference only. This
             specification MUST NOT be read as claiming that every re-entrant
             deadlock is detected.
```

The limit is real and stated: a wait that goes through another fiber — a
callback that awaits a fiber which did not inherit the reference and which
then calls `remove` — cannot be detected. `DrainTimeout` (BEH-BR-085) is the
only backstop for it, exactly as for any stuck lease. Failing fast where the
reference makes the cycle visible turns the commonest case (a callback that
removes its own provider) from a hang into a typed error.

**Settled here.** SPEC.md's re-entrancy list did not name `reconfigure`.
Because `reconfigure` restarts through the same stop path as `replace`
([11 — Configuration](./11-configuration.md)), it waits for P to drain and is
included. For a mutating call, `WouldDeadlock` is decided after the
`requested` record and before intent is recorded (step 7 of the order in
[22 — Attributable Operations](./22-attributable-operations.md), BEH-BR-188),
so the call changes nothing
and, with a sink wired, ends with a `failed` terminal record; this keeps one
`requested` and one terminal record per call
([INV-BR-022](../invariants.md#inv-br-022-one-requested-and-one-terminal-record-per-mutating-call)).

---

_Previous: [08 — Operation Legality](./08-operation-legality.md)_ · _Next: [10 — Runtime Failure and Health](./10-runtime-failure-and-health.md)_
