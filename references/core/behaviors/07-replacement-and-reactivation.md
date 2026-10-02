# 07 — Replacement and Reactivation

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-BEH-07                                               |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.2 (2026-10-02): Replace reservations end with an ended intent; `retry`/`enable` on a parked system stop, or one that parks while they wait, fail with `Conflict`; their unions gain `WouldDeadlock` (CCR-BR-008)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001)                 |

---

This file specifies the operations that stop a plugin and start it again, or
keep it registered without running it: `replace` (a new definition under the
same ID), `retry` (after a failure), `restart` (the same definition again),
`disable` and `enable`. It converts the `replace` paragraphs of the SPEC.md
section "Host interface", decision 2 of "API decisions", the `retry` rules of
"State and lifecycle", and the section "Disable, enable and restart".
`reconfigure` is specified in [11 — Configuration](./11-configuration.md);
what every operation does in every state and against every in-flight
operation is tabulated in [08 — Operation Legality](./08-operation-legality.md),
which this file follows. This file owns BEH-BR-049–064; it uses 049–062, and
063–064 are reserved.

Every operation in this file is a mutating operation. Each is attributed,
gated and audited as specified in
[22 — Attributable Operations](../behaviors/22-attributable-operations.md) and
[23 — Audit Sink and Record](../behaviors/23-audit-sink-and-record.md); those
rules are not repeated here.

## BEH-BR-049: replace is stop-then-start under the same ID, with no rollback

> **See:** [ADR-BR-004](../decisions/004-replace-is-stop-then-start.md)
> **Satisfies:** [URS-BR-002](../urs.md#urs-br-002-remove-or-replace-a-plugin-safely-while-it-is-in-use)
> **Risk:** [RSK-BR-004](../gxp/03-risk-assessment.md#rsk-br-004)

```ts
// illustrative — not type-checked
replace<R extends Keys, P extends Keys, E, C>(plugin: PluginDefinition<R, P, E, C>, options?: ReplaceOptions):
  Effect.Effect<void,
    | ReplaceError | UnknownPlugin | Conflict | Superseded | CleanupError | DrainTimeout | WouldDeadlock | HostClosed
    | Unattributed | ReasonRequired | AuditUnavailable | OperationRejected>

interface ReplaceOptions extends RemoveOptions {
  readonly realm?: string   // realm of the plugin being replaced (default "default")
}
```

```
REQUIREMENT: `replace` MUST address the plugin whose ID is `plugin.id` in
             `options.realm` (default "default"), and MUST fail with
             `UnknownPlugin` when no such plugin is installed.
```

```
REQUIREMENT: For a plugin with a live activation, `replace` MUST stop it
             through the stop path of 06 — Removal (dependents first, leases
             drained, scope closed), then swap the definition under the same
             ID, then let the new definition start when its requirements are
             met.
```

```
REQUIREMENT: `replace` MUST complete once the new definition is registered
             and the plugin has entered `starting`, `waiting` or (for a
             disabled plugin) `disabled`. It MUST NOT wait for the new build.
```

```
REQUIREMENT: The old definition MUST NOT be retained or restored after a
             replace has passed validation. A caller wanting rollback MUST
             issue `replace(previous)` itself.
```

Keeping the old activation alive while the new one builds would need two
providers of one key — which [ADR-BR-003](../decisions/003-one-provider-per-key-per-realm.md)
forbids — and would still force every dependent to stop and recapture.
Rollback across external effects is an application concern; layers that need
to switch behaviour without a gap use `Generation`
([20 — Generation](./20-generation.md)), which publishes the new value before
draining the old. `replace` is not a transaction over external effects.

## BEH-BR-050: replace checks the new definition before anything stops

> **Invariant:** [INV-BR-012](../invariants.md#inv-br-012-a-definition-error-registers-nothing)
> **See:** [ADR-BR-004](../decisions/004-replace-is-stop-then-start.md)
> **Satisfies:** [URS-BR-002](../urs.md#urs-br-002-remove-or-replace-a-plugin-safely-while-it-is-in-use)

```
REQUIREMENT: `replace` MUST check the new definition with the `install`
             checks (03 — Installation) against the installed set excluding
             the definition currently registered under that ID, before
             anything is stopped.
```

```
REQUIREMENT: A definition that fails a check MUST fail the call with
             `ReplaceError { id, cause }`, where `cause` is the
             `InstallError`, and MUST leave the running plugin, its
             definition, its override and its dependents untouched.
```

```
REQUIREMENT: From the moment a replace is accepted until it completes or
             its intent is ended (08 — Operation Legality, BEH-BR-080), the
             host MUST reserve both the old and the new definition's provider
             slots and dependency edges, so that a concurrent `install`,
             `enable` or `replace` that would conflict with either fails its
             own checks. A parked `replace` (BEH-BR-074) MUST keep its
             reservations while it is parked.
```

```
REQUIREMENT: When a cascade, whatever its root, or shutdown ends a parked
             `replace`'s intent (08 — Operation Legality, BEH-BR-080;
             12 — Shutdown and Hosting, BEH-BR-105), the reservations of the
             new definition MUST be released in the same revision in which
             the intent ends, the revision of its `intent-ended` record
             (23 — Audit Sink and Record); the definition registered under
             the ID MUST stay the old one, and the swap MUST NOT happen.
```

Checking first is what makes a rejected replace harmless: a typo in the new
definition's `provides` does not cost the running plugin its activation. The
old definition is excluded so that the new one does not collide with the slots
it is about to take over.

**Settled here.** SPEC.md checks the new definition at the call but stops the
old activation afterwards, which can take up to the drain limit. Without a
reservation, another `install` could claim a key the new definition provides
during that window, and the replace would then publish a duplicate provider or
fail at a point where the old activation is already gone. Reserving both sets
of slots for the window closes it; the reservation of the old set ends with the
swap. When the window ends without a swap — a cascade ends a parked `replace`
(CCR-BR-008) — the new set's reservation ends at once, in the same revision,
so that no slot stays held for a definition that will never be registered.

## BEH-BR-051: Changed provides: dropped keys strand dependents, added keys are checked

> **Invariant:** [INV-BR-001](../invariants.md#inv-br-001-one-provider-per-service-key-per-realm), [INV-BR-005](../invariants.md#inv-br-005-dependents-stop-before-their-providers)
> **Satisfies:** [URS-BR-002](../urs.md#urs-br-002-remove-or-replace-a-plugin-safely-while-it-is-in-use), [URS-BR-004](../urs.md#urs-br-004-know-why-a-plugin-is-not-running)

```
REQUIREMENT: A key the old definition provided and the new one does not
             MUST become unavailable when the swap is applied: each of its
             dependents MUST end `waiting` with that key in
             `missingServiceIds`.
```

```
REQUIREMENT: A key the new definition adds MUST be subject to
             `DuplicateProvider` exactly as in `install`.
```

```
REQUIREMENT: Dependents of a key both definitions provide MUST be stopped
             before the old activation and MUST start again against the new
             one once it is `active` (05 — Activation).
```

`replace` may change `requires` and `provides`; nothing about the ID ties a
plugin's surface down. Dependents do not survive a replace even when the key
is kept, because they captured the old activation's service objects
([05 — Activation](./05-activation.md), BEH-BR-035).

## BEH-BR-052: Changed requires are evaluated afresh

> **Invariant:** [INV-BR-002](../invariants.md#inv-br-002-the-dependency-graph-is-acyclic-per-resolution-scope)
> **Satisfies:** [URS-BR-001](../urs.md#urs-br-001-install-plugins-at-runtime-without-ordering-providers)

```
REQUIREMENT: After the swap, the new definition's `requires` MUST be
             evaluated against the providers then active: the plugin MUST
             enter `starting` when all are available and `waiting`
             otherwise.
```

```
REQUIREMENT: A new `requires` that would close a dependency cycle MUST be
             rejected by the check of BEH-BR-050 with
             `ReplaceError { cause: DependencyCycle }`.
```

## BEH-BR-053: A failed new build leaves the new definition failed

> **Invariant:** [INV-BR-007](../invariants.md#inv-br-007-failure-is-sticky)
> **See:** [ADR-BR-004](../decisions/004-replace-is-stop-then-start.md), [ADR-BR-005](../decisions/005-failure-is-sticky.md)
> **Satisfies:** [URS-BR-006](../urs.md#urs-br-006-recover-from-failure-explicitly-and-never-silently)
> **Risk:** [RSK-BR-003](../gxp/03-risk-assessment.md#rsk-br-003)

```
REQUIREMENT: When the new definition's build fails, the plugin MUST be
             `failed` with the new definition registered. The host MUST NOT
             restore the old definition or retry the new one.
```

The new build's outcome is state, as for `install`
([03 — Installation](./03-installation.md), BEH-BR-021): `replace` has already
completed by then, and the caller learns the outcome from the snapshot or
from a handle's `awaitActive`. The snapshot's `meta` then shows the new
version and digest, so an operator sees which definition failed.

## BEH-BR-054: replace drops the override and follows the plugin's state

> **Satisfies:** [URS-BR-002](../urs.md#urs-br-002-remove-or-replace-a-plugin-safely-while-it-is-in-use), [URS-BR-007](../urs.md#urs-br-007-configure-plugins-safely-including-secrets-and-live-changes)

```
REQUIREMENT: `replace` MUST drop the plugin's configuration override; the
             new definition's first activation MUST read the configuration
             source (11 — Configuration).
```

```
REQUIREMENT: `replace` MUST, by state:
             - `waiting` or `failed` (other than phase "cleanup"): swap the
               definition and enter `starting` or `waiting`;
             - `starting`: let a running build settle, discard its result,
               swap, and enter `starting` or `waiting`;
             - `active`: stop as in BEH-BR-049, swap, and enter `starting`
               or `waiting`;
             - `disabled`: swap the definition and stay `disabled`;
             - `failed` with phase "cleanup": fail with
               `Conflict { pending: "cleanup-failure" }`.
```

The override is dropped because the new definition may declare a different
schema: an old override decoded against it would fail, or decode into
something nobody intended. A disabled plugin stays disabled because disabling
was a decision about the plugin, not about one version of its code.

## BEH-BR-055: A stop that fails its cleanup ends in failed(cleanup) and reports CleanupError

> **Invariant:** [INV-BR-007](../invariants.md#inv-br-007-failure-is-sticky)
> **Satisfies:** [URS-BR-006](../urs.md#urs-br-006-recover-from-failure-explicitly-and-never-silently)
> **Risk:** [RSK-BR-009](../gxp/03-risk-assessment.md#rsk-br-009)

```
REQUIREMENT: When the cleanup of the plugin's own activation fails during
             `replace`, `restart`, `disable` or `reconfigure`, the plugin
             MUST end `failed` with phase "cleanup", the operation MUST NOT
             proceed past the stop, and the caller MUST receive
             `CleanupError { id, message }`.
```

```
REQUIREMENT: In that case `replace` MUST NOT swap the definition: the
             definition whose cleanup failed MUST remain registered.
```

**Settled here.** SPEC.md gave `CleanupError` only to `remove`, although
`replace`, `restart`, `disable` and `reconfigure` stop an activation through
the same path and can fail the same way. Completing them successfully would
tell the caller the change happened while a resource leaked (RSK-BR-009);
continuing to start the new activation would build over the leak.
`CleanupError` is added to each of their unions
([02 — Host Construction](./02-host-construction.md)), the stop halts in phase
"cleanup", and — for `replace` — the old definition stays registered, so the
snapshot names the code that leaked rather than code that never ran.

## BEH-BR-056: retry restarts a failed plugin, and only on request

> **Invariant:** [INV-BR-007](../invariants.md#inv-br-007-failure-is-sticky)
> **See:** [ADR-BR-005](../decisions/005-failure-is-sticky.md)
> **Satisfies:** [URS-BR-006](../urs.md#urs-br-006-recover-from-failure-explicitly-and-never-silently)
> **Risk:** [RSK-BR-003](../gxp/03-risk-assessment.md#rsk-br-003)

```ts
// illustrative — not type-checked
retry(ref: PluginRef, options?: OperationOptions):
  Effect.Effect<void,
    | UnknownPlugin | Conflict | WouldDeadlock | HostClosed
    | Unattributed | ReasonRequired | AuditUnavailable | OperationRejected>
```

```
REQUIREMENT: `retry` of a plugin `failed` with phase "build",
             "activation" or "runtime" MUST move it to `starting` when its
             requirements are available and to `waiting` otherwise, and
             MUST complete once it has entered that state.
```

```
REQUIREMENT: `retry` MUST be a no-op success on a `waiting`, `starting` or
             `active` plugin; MUST fail with `Conflict { pending:
             "cleanup-failure" }` on a plugin failed with phase "cleanup";
             and MUST fail with `Conflict { pending: "disabled" }` on a
             `disabled` plugin.
```

```
REQUIREMENT: `retry` on a `stopping` plugin whose system stop is parked MUST
             fail with `Conflict { id, pending: "dependency-loss" }`; on a
             running system stop it MUST wait for the stop to settle; if
             that stop parks while it waits, it MUST fail with
             `Conflict { id, pending: "dependency-loss" }`; otherwise it is
             decided against the state the plugin landed in (08 — Operation
             Legality, BEH-BR-073). A `retry` from a fiber that holds the
             plugin MUST fail with `WouldDeadlock` instead of waiting
             (09 — Leases, BEH-BR-088).
```

```
REQUIREMENT: The host MUST NEVER issue a retry by itself.
```

`retry` is deliberately narrow: it acts only on a failure, so a script that
retries everything cannot accidentally restart healthy plugins. A failure is
sticky because automatic retries hide repeated side effects of `build` and can
loop; an application that wants a retry policy builds it on `changes` and
`retry`, where it is visible and audited. The retried activation reads the
configuration source afresh, keeping any override
([11 — Configuration](./11-configuration.md)).

## BEH-BR-057: Reactivating operations land by requirement availability

> **Satisfies:** [URS-BR-004](../urs.md#urs-br-004-know-why-a-plugin-is-not-running), [URS-BR-006](../urs.md#urs-br-006-recover-from-failure-explicitly-and-never-silently)

```
REQUIREMENT: Every operation that starts a plugin again — `retry`,
             `restart`, `replace`, `reconfigure`, `enable` — MUST land it in
             `starting` when every required key has an active provider in
             its resolution scope, and in `waiting` otherwise, in the same
             revision in which the operation's stop (if any) completes.
```

```
REQUIREMENT: Each such activation MUST be a fresh activation: a new scope, a
             new memo map, freshly captured providers and freshly read
             configuration (05 — Activation).
```

A failed plugin whose requirements have meanwhile disappeared is a common case
after a cascade; `retry` then lands it in `waiting` rather than failing,
which is what the `missingServiceIds` kept on `failed` entries lets an operator
predict ([04 — States and Snapshots](./04-states-and-snapshots.md)).

## BEH-BR-058: restart runs the same definition again

> **Invariant:** [INV-BR-014](../invariants.md#inv-br-014-every-activation-gets-a-fresh-scope-and-memo-map)
> **See:** [ADR-BR-004](../decisions/004-replace-is-stop-then-start.md)
> **Satisfies:** [URS-BR-002](../urs.md#urs-br-002-remove-or-replace-a-plugin-safely-while-it-is-in-use), [URS-BR-006](../urs.md#urs-br-006-recover-from-failure-explicitly-and-never-silently)

```ts
// illustrative — not type-checked
restart(ref: PluginRef, options?: RemoveOptions):
  Effect.Effect<void,
    | UnknownPlugin | Conflict | Superseded | CleanupError | DrainTimeout | WouldDeadlock | HostClosed
    | Unattributed | ReasonRequired | AuditUnavailable | OperationRejected>
```

```
REQUIREMENT: `restart` of an `active` plugin MUST stop it and its dependents
             through the stop path of 06 — Removal (with `reason`
             "restart"), keep its definition and its configuration override,
             and start it again as a fresh activation; its dependents MUST
             start again once it is `active`.
```

```
REQUIREMENT: `restart` MUST, by state:
             - `waiting`: succeed as a no-op;
             - `starting`: supersede the in-flight build — let it settle,
               discard its result, and build again;
             - `failed` (phase "build", "activation" or "runtime"): behave
               exactly as `retry`;
             - `failed` with phase "cleanup": fail with
               `Conflict { pending: "cleanup-failure" }`;
             - `disabled`: fail with `Conflict { pending: "disabled" }`.
```

```
REQUIREMENT: `restart` MUST complete once the plugin has re-entered
             `starting` or `waiting`. It MUST NOT wait for the new build.
```

`restart` is the hot-reload primitive for a development adapter whose plugin's
external state changed but whose definition did not; a changed definition uses
`replace`. Because every activation gets a fresh memo map, the layer really is
built again rather than served from memo
([INV-BR-014](../invariants.md#inv-br-014-every-activation-gets-a-fresh-scope-and-memo-map)).
Children of the plugin are removed with the old activation and mounted again
by the new one ([14 — Children and Groups](./14-children-and-groups.md)).

**Settled here.** SPEC.md gave `restart` rules for `failed`, `waiting` and
`disabled` only, none for a `starting` plugin or after a cleanup failure. A
restart of a
`starting` plugin supersedes the build in flight — the caller asked for a
fresh build, and the one running began before the request. A restart after a
cleanup failure is refused like every restarting operation, because the
resource the old activation held may still be held.

## BEH-BR-059: PluginHandle.restart is Host.restart

> **See:** [ADR-BR-021](../decisions/021-children-and-groups.md)

```ts
// illustrative — not type-checked
interface PluginHandle {
  // ...
  readonly restart: (options?: RemoveOptions) => Effect.Effect<void,
    | UnknownPlugin | Conflict | Superseded | CleanupError | DrainTimeout | WouldDeadlock | HostClosed
    | Unattributed | ReasonRequired | AuditUnavailable | OperationRejected>
}
```

```
REQUIREMENT: `PluginHandle.restart` MUST be a function taking
             `RemoveOptions` (which extend `OperationOptions`) and MUST have
             exactly the error union, legality, completion point and audit
             behaviour of `Host.restart` for the handle's installation.
```

**Settled here.** SPEC.md typed `PluginHandle.restart` as a bare
`Effect<void, UnknownPlugin | Conflict | HostClosed>`. The handle's restart is
the host's restart, which drains leases and can be re-entrant, so its union
must include `DrainTimeout` and `WouldDeadlock` (and, as settled here,
`Superseded` and `CleanupError`, plus the GxP errors); a narrower type would
let those failures escape as defects. Making it a function lets it carry
`drain`, `force` and an `OperationContext`, without which a handle-initiated
restart could not be attributed except through the ambient `CurrentActor`.

## BEH-BR-060: disable stops a plugin but keeps it registered

> **See:** [ADR-BR-003](../decisions/003-one-provider-per-key-per-realm.md)
> **Satisfies:** [URS-BR-002](../urs.md#urs-br-002-remove-or-replace-a-plugin-safely-while-it-is-in-use)

```ts
// illustrative — not type-checked
disable(ref: PluginRef, options?: RemoveOptions):
  Effect.Effect<void,
    | UnknownPlugin | Conflict | Superseded | CleanupError | DrainTimeout | WouldDeadlock | HostClosed
    | Unattributed | ReasonRequired | AuditUnavailable | OperationRejected>
```

```
REQUIREMENT: `disable` MUST stop the plugin through the same
             dependents-first, drain and `force` path as `remove`, MUST keep
             its definition and configuration override, and MUST end in
             `disabled`. It MUST complete once the plugin is `disabled`.
```

```
REQUIREMENT: `disable` MUST, by state:
             - `waiting` or `failed` (phase "build", "activation" or
               "runtime"): move to `disabled` at once;
             - `starting`: let a running build settle, discard its result,
               and move to `disabled`;
             - `disabled`: succeed as a no-op;
             - `failed` with phase "cleanup": fail with
               `Conflict { pending: "cleanup-failure" }`.
```

```
REQUIREMENT: A disabled plugin MUST be skipped by shutdown reports, since
             there is nothing to stop (12 — Shutdown and Hosting).
```

Disabling is for "not now, but keep it": a feature switched off without losing
its definition or its configuration. Leaving `failed` through `disable` is
allowed for every non-cleanup phase; it clears the failure, which the audit
record of the call makes attributable.

## BEH-BR-061: A disabled plugin provides nothing and reserves no slot

> **Invariant:** [INV-BR-001](../invariants.md#inv-br-001-one-provider-per-service-key-per-realm)
> **See:** [ADR-BR-003](../decisions/003-one-provider-per-key-per-realm.md)

```
REQUIREMENT: A `disabled` plugin MUST publish nothing, MUST NOT occupy a
             provider slot, and MUST NOT contribute edges to cycle
             detection. Its former dependents MUST end `waiting`.
```

```
REQUIREMENT: Another plugin MAY provide a key the disabled plugin provides
             while it stays disabled.
```

```
REQUIREMENT: `reconfigure` of a disabled plugin MUST store or clear the
             override for the next `enable` and MUST NOT start it.
             `replace` of a disabled plugin MUST keep it disabled.
```

Freeing the slot is what makes disable useful for switching implementations:
disable the old provider, install or enable another of the same key. The price
is that `enable` must check again (BEH-BR-062).

## BEH-BR-062: enable checks again, then starts

> **Invariant:** [INV-BR-001](../invariants.md#inv-br-001-one-provider-per-service-key-per-realm), [INV-BR-002](../invariants.md#inv-br-002-the-dependency-graph-is-acyclic-per-resolution-scope)
> **Satisfies:** [URS-BR-002](../urs.md#urs-br-002-remove-or-replace-a-plugin-safely-while-it-is-in-use)

```ts
// illustrative — not type-checked
enable(ref: PluginRef, options?: OperationOptions):
  Effect.Effect<void,
    | UnknownPlugin | Conflict | InstallError | WouldDeadlock | HostClosed
    | Unattributed | ReasonRequired | AuditUnavailable | OperationRejected>
```

```
REQUIREMENT: `enable` of a `disabled` plugin MUST check its definition
             against the installed set with the `DuplicateProvider` and
             `DependencyCycle` checks of 03 — Installation. On failure it
             MUST fail with that `InstallError` and leave the plugin
             `disabled` and unchanged.
```

```
REQUIREMENT: On success, `enable` MUST reserve the plugin's provider slots
             and move it to `starting` or `waiting` (BEH-BR-057), and MUST
             complete once it has entered that state.
```

```
REQUIREMENT: `enable` MUST be a no-op success on a `waiting`, `starting`,
             `active` or `failed` (phase "build", "activation" or "runtime")
             plugin, and MUST fail with `Conflict { pending:
             "cleanup-failure" }` on a plugin failed with phase "cleanup".
```

```
REQUIREMENT: `enable` on a `stopping` plugin whose system stop is parked
             MUST fail with `Conflict { id, pending: "dependency-loss" }`; on
             a running system stop it MUST wait for the stop to settle; if
             that stop parks while it waits, it MUST fail with
             `Conflict { id, pending: "dependency-loss" }`; otherwise it is
             decided against the state the plugin landed in (08 — Operation
             Legality, BEH-BR-073). An `enable` from a fiber that holds the
             plugin MUST fail with `WouldDeadlock` instead of waiting
             (09 — Leases, BEH-BR-088).
```

A competing provider may have appeared while the plugin was disabled — that is
what disabling permits. Enabling over it would create two providers of one
key, so the check runs again and the plugin stays disabled until the conflict
is resolved. `enable` on a `failed` plugin does not clear the failure; that is
`retry`'s job, and keeping the two apart means "enable everything" never
silently retries a failure.

**Settled here.** `retry` and `enable` start a plugin that is not running;
neither carries a `drain` or `force` that could resume a parked system stop,
and resuming one only to leave the plugin where the dependency loss puts it
would not be what either asked for. On a parked system stop they therefore
fail with `Conflict { pending: "dependency-loss" }` (CCR-BR-008), and so does
one that was waiting for a running system stop that then parked; `remove`,
`replace`, `restart`, `disable` and `reconfigure` are the calls that resume it.
`Conflict` is already a member of their unions. Waiting for a running system
stop is a wait for that plugin's transition step, so a `retry` or `enable`
issued from that plugin's own lease, build or finalizer would wait for itself;
their unions therefore gain `WouldDeadlock`.

---

_Previous: [06 — Removal](./06-removal.md)_ · _Next: [08 — Operation Legality](./08-operation-legality.md)_
