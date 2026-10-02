# 14 — Children and Groups

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-BEH-14                                               |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.1 (2026-10-02): Initial draft (CCR-BR-001)                 |

---

Some plugins are made of other plugins: a module that mounts its own
sub-features, a bundle that should be switched on and off as one. This file
converts the children and groups parts of SPEC.md "Plugin handles, children
and groups": mounting a child for the lifetime of a parent's activation, the
child's identity and realm, failure isolation, parent-provided services,
removal with the parent, and `Plugin.group`. `PluginHandle` and
`awaitActive` themselves are specified in
[03 — Installation](./03-installation.md). This file owns BEH-BR-121–128 and
uses all eight.

## BEH-BR-121: A child lives for the parent's activation

> **Invariant:** [INV-BR-005](../invariants.md#inv-br-005-dependents-stop-before-their-providers)
> **See:** [ADR-BR-021](../decisions/021-children-and-groups.md)
> **Satisfies:** [URS-BR-017](../urs.md#urs-br-017-bind-sub-plugins-to-the-lifetime-of-a-parent)

```ts
// illustrative — not type-checked
// Plugin.Runtime member (behaviour 10)
readonly install: <R extends Keys, P extends Keys, E, C>(
  child: PluginDefinition<R, P, E, C>,
  options?: InstallOptions
) => Effect.Effect<PluginHandle, InstallError, Scope.Scope>
```

```
REQUIREMENT: `Plugin.Runtime.install(child, options)` MUST install `child` for
             the lifetime of the calling plugin's activation, and MUST
             require the activation `Scope`.
```

```
REQUIREMENT: When the activation scope closes, the host MUST remove each child
             (the child's own dependents first), in last-in-first-out order
             with the parent's other finalizers.
```

```
REQUIREMENT: A child install that fails its definition checks MUST fail with
             the `InstallError` and register nothing, exactly as
             `Host.install` does.
```

Tying the child to the activation scope means there is no separate list of
children for anyone to keep in step with the parent: the scope already
records what must be undone and in what order. Whether an `InstallError`
from a child fails the parent's `build` is the parent author's choice — it
propagates like any other failure in the build layer, and is caught like
one.

## BEH-BR-122: A child is an ordinary plugin with a prefixed identity

> **Invariant:** [INV-BR-001](../invariants.md#inv-br-001-one-provider-per-service-key-per-realm)
> **See:** [ADR-BR-021](../decisions/021-children-and-groups.md)
> **Satisfies:** [URS-BR-017](../urs.md#urs-br-017-bind-sub-plugins-to-the-lifetime-of-a-parent), [URS-BR-004](../urs.md#urs-br-004-know-why-a-plugin-is-not-running)

```
REQUIREMENT: A child's ID MUST be the parent's ID, a "/", and the child
             definition's `id` (`parent/child`), and its snapshot MUST record
             `parentId`.
```

```
REQUIREMENT: A child MUST install into the parent's realm and inherit the
             parent's interceptions unless `options` set `realm` or
             `intercept` explicitly.
```

```
REQUIREMENT: Apart from its lifetime, a child MUST be an ordinary plugin: its
             own state, requirements, provides, leases, configuration and
             failure, subject to every install check in its resolution
             scope.
```

The prefix makes a child's provenance visible in every snapshot, event and
log line, and keeps two parents that mount children with the same short ID
from colliding.

**Settled here.** (1) The prefix is always applied, even if the child's own
`id` already begins with the parent's ID; the rule is mechanical so that it
can never be ambiguous. (2) A child's configuration path is its prefixed ID
([11 — Configuration](./11-configuration.md)).

## BEH-BR-123: A failing child does not fail its parent

> **See:** [ADR-BR-021](../decisions/021-children-and-groups.md)
> **Satisfies:** [URS-BR-017](../urs.md#urs-br-017-bind-sub-plugins-to-the-lifetime-of-a-parent), [URS-BR-006](../urs.md#urs-br-006-recover-from-failure-explicitly-and-never-silently)
> **Risk:** [RSK-BR-016](../gxp/03-risk-assessment.md#rsk-br-016)

```
REQUIREMENT: A child that becomes `failed` MUST NOT change its parent's
             state. The failure MUST be visible in the snapshot under the
             child's own ID.
```

```
REQUIREMENT: A parent that must not run without a child MUST await the
             child's `handle.awaitActive` and report the failure itself
             (`Plugin.Runtime.reportFailure` or a failing build); the host
             MUST NOT do it implicitly.
```

Failure propagation upward would turn every optional sub-feature into a
single point of failure for its parent. Making the parent opt in, through
`awaitActive`, keeps the dependency explicit in the parent's code.

## BEH-BR-124: A child may require what its parent provides

> **Invariant:** [INV-BR-005](../invariants.md#inv-br-005-dependents-stop-before-their-providers), [INV-BR-003](../invariants.md#inv-br-003-publication-is-atomic)
> **See:** [ADR-BR-021](../decisions/021-children-and-groups.md)
> **Satisfies:** [URS-BR-017](../urs.md#urs-br-017-bind-sub-plugins-to-the-lifetime-of-a-parent)

```
REQUIREMENT: A child MAY require services its parent provides. Such a child
             MUST stay `waiting` until the parent publishes, which happens
             only after the parent's `build` succeeds.
```

```
REQUIREMENT: When the parent stops, a child that depends on the parent's
             services MUST stop first, so that the parent's services stay
             available for the child's teardown.
```

A parent that awaits `awaitActive` *inside its own build* on a child that
requires the parent's services would wait for itself: the child cannot start
until the parent publishes, and the parent does not publish until its build
returns. The parent's `buildTimeout` bounds that mistake; authors who need
the child active await it after the build, for example from a `background`
fiber.

## BEH-BR-125: Stopping the parent removes its children

> **See:** [ADR-BR-021](../decisions/021-children-and-groups.md)
> **Satisfies:** [URS-BR-017](../urs.md#urs-br-017-bind-sub-plugins-to-the-lifetime-of-a-parent)

```
REQUIREMENT: Any transition that closes the parent's activation scope —
             `remove`, `replace`, `disable`, `restart`, a non-volatile
             `reconfigure`, dependency loss, runtime failure, shutdown — MUST
             remove its children.
```

```
REQUIREMENT: A new activation of the parent MUST mount its children again by
             running its build; children MUST NOT persist across parent
             activations.
```

```
REQUIREMENT: `reconcile` MUST NOT prune a child: a child is owned by its
             parent's activation, never by a reconcile scope.
```

A child's state belongs to one activation of its parent. Keeping children
across a parent restart would let a child run against a parent that has not
finished building, and would leave the child's resources outside any scope
that is about to close.

**Settled here.** SPEC.md does not say what Host operations addressed
directly to a child do. Because a child is an ordinary plugin
(BEH-BR-122), operations on it follow the state table of
[08 — Operation Legality](./08-operation-legality.md). A child removed
directly stays removed for the rest of the parent's activation; when the
parent's scope later closes, its finalizer finds the child gone and does
nothing.

## BEH-BR-126: Mounting and unmounting children is a system transition

> **See:** [ADR-BR-021](../decisions/021-children-and-groups.md), [ADR-BR-029](../decisions/029-attributable-mutations.md)
> **Satisfies:** [URS-BR-021](../urs.md#urs-br-021-know-who-changed-the-plugin-set-when-and-why)
> **Risk:** [RSK-BR-004](../gxp/03-risk-assessment.md#rsk-br-004)

```
REQUIREMENT: A child installed or removed because of its parent's activation
             lifecycle MUST NOT require attribution and MUST NOT consult the
             `OperationGate`.
```

```
REQUIREMENT: When an `AuditSink` is wired, each such mount and unmount MUST
             be audited as the system transition `system-start` or
             `system-stop`, attributed to `Actor.system`, whose `target` is
             the child and whose `causationId` is the record id of the
             parent's triggering record (the operation or system transition
             that activated or stopped the parent).
```

**Settled here.** SPEC.md is silent on attribution and approval of
children. Mounting a child is a consequence of a decision already taken —
installing or starting the parent — not a new decision, so it is treated as
a system transition: audited, never gated
([25 — Operation Gate](./25-operation-gate.md)). A consumer who requires
approval for every piece of code that can run approves the parent's
definition, whose `meta.digest` covers the code that mounts the children.
Operations a caller addresses to a child directly (BEH-BR-125) are ordinary
operator calls and are attributed, gated and audited as such.

## BEH-BR-127: A group is a plugin that mounts members as children

> **See:** [ADR-BR-021](../decisions/021-children-and-groups.md)
> **Satisfies:** [URS-BR-017](../urs.md#urs-br-017-bind-sub-plugins-to-the-lifetime-of-a-parent)

```ts
Plugin.group(
  id: string,
  members: readonly PluginDefinition<any, any, any, any>[]
): PluginDefinition<readonly [], readonly [], never, void>
```

```
REQUIREMENT: `Plugin.group(id, members)` MUST produce a plugin that provides
             nothing and whose build mounts each member as a child
             (BEH-BR-121).
```

```
REQUIREMENT: A group MUST be sugar over children, not a second mechanism:
             every rule for children MUST apply to its members.
```

```
REQUIREMENT: The group's handle `awaitActive` MUST resolve only when every
             member is `active`, and MUST fail fast with `ActivationFailed`
             naming the first member that becomes `failed`.
```

One mechanism means one set of removal, ordering and audit rules. A group
that had its own lifecycle would need its own answers to every question this
file already answers for children.

## BEH-BR-128: Group operations act on the group as one unit

> **Invariant:** [INV-BR-009](../invariants.md#inv-br-009-at-most-one-transition-in-flight-per-plugin)
> **See:** [ADR-BR-021](../decisions/021-children-and-groups.md)
> **Satisfies:** [URS-BR-017](../urs.md#urs-br-017-bind-sub-plugins-to-the-lifetime-of-a-parent)

```
REQUIREMENT: `remove`, `disable`, `enable` and `restart` of a group MUST act on
             the group plugin as one linearized transition, which removes or
             mounts all members through the group's activation scope.
```

```
REQUIREMENT: If any member fails its install checks during the group's
             build, the group's activation MUST fail with phase "activation"
             and members already mounted in that activation MUST be removed,
             so that no partial group remains mounted.
```

The SPEC's acceptance list asks that "group operations are atomic". Here
that means: one transition on one plugin, with all members mounted or none.
It does not mean that every member becomes `active` together — a member may
still be `waiting` or `failed` as a child may, and `awaitActive` is how a
caller waits for all of them.

**Settled here.** The all-or-none mount on a member's `InstallError`
settles a case SPEC.md does not cover; a group in which some members were
silently missing would contradict the reason for grouping them.

---

_Previous: [13 — Observability and Diagnostics](./13-observability-and-diagnostics.md)_ · _Next: [15 — Optional and Reactive Dependencies](./15-optional-and-reactive.md)_
