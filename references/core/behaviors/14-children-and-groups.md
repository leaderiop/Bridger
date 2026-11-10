# 14 — Children and Groups

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-BEH-14                                               |
> | Revision       | 0.11                                                         |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.11 (2026-11-10): BEH-BR-121 the wait of a sub-scope finalizer or `unmount` on a removal the parent's stop began follows that stop's limits — parks with an operator call at its root, waits for the overall limit under shutdown, revokes at `drainTimeout` only on a path with no caller; BEH-BR-126 `unmount` waits the same way (H1) (CCR-BR-036)<br>0.10 (2026-11-10): BEH-BR-121 the wait of a sub-scope finalizer or `unmount` on a removal the parent's stop began is bounded by `drainTimeout`, then revokes; the resumption emits `stop-resumed` with `by` "sub-scope" or "unmount"; BEH-BR-126 `unmount` waits the same bound; BEH-BR-125 the list of what resumes a parked child stop names the sub-scope close and `unmount` (C11, C13) (CCR-BR-035)<br>0.9 (2026-11-10): BEH-BR-121 a sub-scope close or `unmount` resumes a parked child stop, ends its parked intent, revokes at `drainTimeout` and never parks, with causes the mount or `unmount-requested` record (C8); BEH-BR-127 `Plugin.group` error type is the mount errors, not `never` (audit round 2, Low) (CCR-BR-034)<br>0.8 (2026-11-09): BEH-BR-126 the mount record's `after.state` may be `starting`, the state a child with nothing missing is registered in, with its activation's `system-start` caused by the mount record (C-05) (CCR-BR-032)<br>0.7 (2026-11-08): BEH-BR-121 a refused digest refuses the mount (`ChildNotAllowed`); BEH-BR-126 `Plugin.Runtime.unmount`, an attributed child removal recorded by `unmount-requested` with `requestedBy` (G57) (CCR-BR-026)<br>0.6 (2026-11-08): BEH-BR-121: the sub-scope finalizer waits for the removal, a held lease is revoked at the limit, a removal begun by the parent's stop takes precedence (CCR-BR-022)<br>0.5 (2026-11-08): BEH-BR-121 a lazy child refused with `InvalidDefinition` (CCR-BR-017); BEH-BR-121 `ChildNotAllowed` and BEH-BR-122 mandatory interceptions always inherited (CCR-BR-018); BEH-BR-121 sub-scope mount removed when the sub-scope closes, BEH-BR-126 its `system-stop` record, `Plugin.Any` in `Plugin.Runtime.install` and BEH-BR-127 group members (CCR-BR-020)<br>0.4 (2026-10-03): A child's parked removal is also resumed by a cascade of another of its providers, as BEH-BR-080 gives it (consistency pass) (CCR-BR-013)<br>0.3 (2026-10-02): No mount once the parent's stop or shutdown has begun; a parked child removal resumes only as a removal; mount and activation records; a parent awaiting a child in its build can starve for a slot; a group member's install error fails the group with phase "build" (prototype findings G19–G22) (CCR-BR-010)<br>0.2 (2026-10-02): Child install fails with `DependencyCycle` (mount edges child→parent); children removed as dependents before the parent's scope begins to close, whatever they hold; a parked child operation ends; child causation per BEH-BR-190; shutdown never parks (CCR-BR-008)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001)                 |

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
// Plugin.Runtime member (behaviour 10); the second overload takes any definition (Plugin.Any, 01)
readonly install: {
  <R extends Keys, P extends Keys, E, C>(child: Plugin<R, P, E, C>, options?: InstallOptions):
    Effect.Effect<PluginHandle, InstallError | Conflict | HostClosed | ChildNotAllowed, Scope.Scope>
  (child: Plugin.Any, options?: InstallOptions):
    Effect.Effect<PluginHandle, InstallError | Conflict | HostClosed | ChildNotAllowed, Scope.Scope>
}
```

```
REQUIREMENT: `Plugin.Runtime.install(child, options)` MUST install `child` for
             the lifetime of the calling plugin's activation, and MUST
             require the activation `Scope`.
```

```
REQUIREMENT: When `Plugin.Runtime.install` is run under a scope that is a
             sub-scope of the calling plugin's activation scope (for example
             inside `Effect.scoped` within a `background` fiber), the child
             MUST be removed when that sub-scope closes, exactly as it is
             removed on the parent's stop (BEH-BR-125): its dependents first,
             drained under `BridgerOptions.drainTimeout`, revoked on expiry,
             never parked. If the activation scope closes first, the parent's
             stop removes the child as for any other child.
```

```
REQUIREMENT: The sub-scope's finalizer MUST wait until the child's removal
             has settled — bounded by `BridgerOptions.drainTimeout` for the
             drain, then by the revocation of the leases still held — so
             that a sub-scope never closes with its child still registered.
             A lease on the child held by the fiber that closes the
             sub-scope, or by a fiber it awaits, MUST NOT make the
             finalizer fail with `WouldDeadlock`: the drain runs under
             `drainTimeout` and revokes that lease at the limit, as a
             removal with no caller does (BEH-BR-125; 10 — Runtime Failure
             and Health, BEH-BR-095). When the parent's stop has already
             begun removing the child, that removal MUST take precedence:
             the sub-scope's finalizer waits for it, starts no second
             removal, and the child's `system-stop` record takes its cause
             from the parent's cascade (BEH-BR-126). That wait MUST follow
             the limits of the parent's stop and set none of its own
             (CCR-BR-036): when an operator call is the cascade root, the
             finalizer MUST NOT revoke a lease that call did not force —
             a drain that expires without the call's `force: true` parks
             the child's stop with the call (08 — Operation Legality,
             BEH-BR-080; 09 — Leases, BEH-BR-086), and the wait continues
             until the parked stop is resumed and settles (BEH-BR-125);
             under shutdown, the wait lasts until the removal settles, the
             leases being revoked only once the overall shutdown limit has
             passed (12 — Shutdown and Hosting, BEH-BR-107); and only when
             the parent's stop is itself on a path with no caller are the
             leases still held on the child revoked, when that stop's drain
             of the child expires at `BridgerOptions.drainTimeout` (10,
             BEH-BR-095).
```

```
REQUIREMENT: When the child's stop is parked as its sub-scope closes or
             `Plugin.Runtime.unmount` is called for it (BEH-BR-126), the
             removal MUST resume that stop as the parent's stop does
             (BEH-BR-125) — ending any parked operator intent, with its
             `intent-ended` record, running none of the parked operation's
             remaining actions, and setting `next` to "gone" — except that
             its drain, under `BridgerOptions.drainTimeout`, MUST revoke at
             the limit and never park again, so that the finalizer or the
             unmount waits no longer than that bound and the finalizers
             that follow it. The resumed stop's
             records and the `intent-ended` record MUST take as
             `causationId` the child's mount record for a sub-scope close,
             and the `unmount-requested` record for an unmount (22 —
             Attributable Operations, BEH-BR-190). The resumption MUST emit
             `stop-resumed` with `by` "sub-scope" or "unmount" (13 —
             Observability and Diagnostics); it is not a cascade.
```

```
REQUIREMENT: `Plugin.Runtime.install` MUST fail with `ChildNotAllowed` when
             the parent's `allowChildren`, a wired `AccessPolicy` or a wired
             `RefusalList` (BEH-BR-267) refuses the mount
             ([28 — Plugin Principal and Mandatory Policy](./28-plugin-principal-and-mandatory-policy.md),
             BEH-BR-263, BEH-BR-264), and with `InvalidDefinition` for a lazy
             definition ([27 — Manifest and Lazy Activation](./27-manifest-and-lazy-activation.md),
             BEH-BR-244); in both cases it MUST register nothing.
```

```
REQUIREMENT: When the parent stops, the host MUST remove each child as a
             dependent of the parent, before the parent's activation scope
             begins to close (06 — Removal, BEH-BR-043; 08 — Operation
             Legality, BEH-BR-079): the child's own dependents first, in
             reverse dependency order, as for any dependent.
```

```
REQUIREMENT: A child install that fails its definition checks MUST fail with
             the `InstallError` and register nothing, exactly as
             `Host.install` does.
```

```
REQUIREMENT: A child install whose dependency edges (dependent→provider) or
             mount edge (child→parent: a child depends on the parent that
             mounted it) would close a cycle in the plugin graph MUST fail
             with `DependencyCycle { path }`, where `path` begins with the
             child, and MUST register nothing. A child that requires its
             parent's services therefore closes no cycle; a parent that
             requires a service of its own child does.
```

```
REQUIREMENT: When the parent stops, each child MUST be removed — stopped,
             then unregistered — whatever services it holds, including
             services of plugins other than its parent. A child's stop MUST
             NOT end in `waiting` or `starting`. The intent of an operator
             operation parked on a child (08 — Operation Legality,
             BEH-BR-074) MUST end with its `intent-ended` record
             (BEH-BR-080), and the child MUST be removed when its stop
             completes.
```

```
REQUIREMENT: Once the parent's stop has begun — the parent is `stopping`,
             or a runtime failure of the parent is being handled — a call to
             `Plugin.Runtime.install` MUST fail with
             `Conflict { id: <parent ID>, pending }`, `pending` naming the
             stop's reason, and once shutdown has begun with `HostClosed`;
             in both cases it MUST register nothing.
```

Tying the child to the activation means there is no separate list of
children for anyone to keep in step with the parent: whatever ends the
activation removes its children first, in the dependents-first order every
stop follows. Whether an `InstallError`
from a child — `DependencyCycle` included — fails the parent's `build` is the
parent author's choice — it propagates like any other failure in the build
layer, and is caught like one.

**Settled here.** A child mount that would close a cycle through mount and
dependency edges is refused at the child's install, not by failing the
parent: the graph of [INV-BR-002](../invariants.md#inv-br-002-the-dependency-graph-is-acyclic-per-resolution-scope)
includes mount edges, child→parent, because a child depends on the parent
that mounted it, and the parent's code is what decides whether the parent can
run without that child (CCR-BR-008). Children are removed as dependents,
before the parent's scope begins to close, not by the parent's own finalizers:
a child stopped from inside the closing scope would run its finalizers after
the parent's resources had begun to go, and its stop would sit outside the
dependents-first order of 06. A parked operation on a child does not survive
the parent's stop: the child's lifetime is the parent's activation, so the
parked intent ends, the child is removed, and the child's records are caused
by the cascade root's record (BEH-BR-126).

**Settled here.** A fiber of the parent — a `background` fiber, a
`whenAvailable` run — keeps running while the parent drains, after its
children have been removed and before its scope closes. A child it mounted
then would be removed by nothing: it is not a dependent of the stop already
under way, and the parent's next activation does not know it. The mount is
therefore refused once the stop has begun, with the `Conflict` an operation
on a stopping plugin gets (URS gap G19, CCR-BR-010).

**Settled here (CCR-BR-020).** A sub-scope mount lets a parent bind a child
to less than its whole activation — a session, a lease, a period of
reachability — without an operator operation. It adds no state and no
operation: the child leaves exactly as it leaves on its parent's stop, so the
legality table is unchanged. It was requested for the remote companion's
withdrawal of a session child
([references/remote/](../../remote/README.md), ADR-RM-002); acceptance check
89 of BEH-BR-184 covers it.

**Settled here (CCR-BR-036).** A finalizer that waits for a removal the
parent's stop already began sets no limit of its own. Revoking at its own
`drainTimeout` would let a sub-scope close override an operator's
`force: false`, or revoke before the overall limit under shutdown
(09 — Leases, BEH-BR-086; INV-BR-017). The wait therefore follows the
stop it waits for; only a removal the sub-scope close or `unmount` begins
itself is a path with no caller.

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
             `intercept` explicitly. Mandatory interceptions are always
             inherited ([28 — Plugin Principal and Mandatory Policy](./28-plugin-principal-and-mandatory-policy.md),
             BEH-BR-260), and `allowChildren` may refuse the mount
             (BEH-BR-263).
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

```
REQUIREMENT: Documentation MUST state that a parent awaiting a child's
             `awaitActive` inside its own build holds a build slot while the
             child's build waits for one (05 — Activation, BEH-BR-034).
             Parents SHOULD await their children after their build returns.
```

A parent that awaits `awaitActive` *inside its own build* on a child that
requires the parent's services would wait for itself: the child cannot start
until the parent publishes, and the parent does not publish until its build
returns. The parent's `buildTimeout` bounds that mistake; authors who need
the child active await it after the build, for example from a `background`
fiber.

The same wait can starve even when the child needs nothing of its parent: the
parent's build holds a slot, and the child's build needs one. With
`concurrency` 1, or with as many such parents building at once as there are
slots, the parent fails at `buildTimeout` every time, and its children are
removed with the failed activation (URS gap G21, CCR-BR-010).

## BEH-BR-125: Stopping the parent removes its children

> **See:** [ADR-BR-021](../decisions/021-children-and-groups.md)
> **Satisfies:** [URS-BR-017](../urs.md#urs-br-017-bind-sub-plugins-to-the-lifetime-of-a-parent)

```
REQUIREMENT: Any transition that closes the parent's activation scope —
             `remove`, `replace`, `disable`, `restart`, a non-volatile
             `reconfigure`, dependency loss, runtime failure, shutdown — MUST
             remove its children, whatever services they hold, before its
             activation scope begins to close. When a child's stop is
             parked, the parent's stop MUST resume it and MUST end any
             parked operator intent, with its `intent-ended` record
             (08 — Operation Legality, BEH-BR-080): the snapshot MUST show
             the child `stopping` with `next` "gone", the parked operation's
             remaining actions MUST NOT run, and the child MUST be removed
             when its stop completes. If that resumed drain expires again,
             the child's stop MUST become a parked system stop with `next`
             "gone".
```

```
REQUIREMENT: A parked child stop whose `next` is "gone" MUST be resumed only
             by a cascade — its parent's stop, or the stop of another of its
             providers (08 — Operation Legality, BEH-BR-080) — by shutdown,
             by an operator `remove` of the child, by the close of the
             sub-scope it was mounted under or by `Plugin.Runtime.unmount`
             of it (BEH-BR-121, BEH-BR-126), and MUST end with the child
             removed. Any other operation addressed to the child MUST fail
             with `Conflict { id, pending: "remove" }` and change nothing.
```

```
REQUIREMENT: The parent's stop MUST drain each child under the rules of the
             parent's stop: a cascading call's `drain` and `force` when an
             operator call is the cascade root (08 — Operation Legality,
             BEH-BR-080), and otherwise `BridgerOptions.drainTimeout`,
             revoking on expiry and never parking (10 — Runtime Failure and
             Health, BEH-BR-095). Under shutdown a child drains under
             `drainTimeout`, is revoked only once the overall shutdown limit
             has passed, and never parks (12 — Shutdown and Hosting,
             BEH-BR-105, BEH-BR-107).
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
parent later stops, it finds the child gone and does nothing.

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
             the child. A mount's `causationId` MUST be the record id of the
             parent's triggering record (the operation or system transition
             that activated the parent). An unmount's `causationId` MUST be
             the cascade root's record as 22 — Attributable Operations,
             BEH-BR-190, gives it — when the parent was stopped directly by
             an operator call, that call's `requested` record.
```

```
REQUIREMENT: A child removed because a sub-scope it was mounted under closed
             (BEH-BR-121) MUST be treated as unmounted by its parent's
             activation lifecycle: no attribution, no `OperationGate`, and,
             with an `AuditSink`, a `system-stop` record attributed to
             `Actor.system` whose `target` is the child and whose
             `causationId` is the record id of the child's mount record.
```

```
REQUIREMENT: The mount record's `after.state` MUST be the state in which the
             child is registered: `starting` when its requirements are all
             available (03 — Installation, BEH-BR-017), `waiting` when one
             is missing, or `disabled` when it is installed disabled (a
             mount the `RefusalList` refuses registers nothing, BEH-BR-121).
             When the child is registered in `starting`, the
             `system-start` record of that activation attempt — its
             success or its failure — MUST carry the mount record's
             `recordId` as `causationId`. A child registered `waiting` or
             `disabled` starts later, if at all, by a cause of its own
             (22 — Attributable Operations, BEH-BR-190).
```

```ts
// illustrative — not type-checked
// Plugin.Runtime member (10 — Runtime Failure and Health, BEH-BR-089)
readonly unmount: (child: PluginRef, options: { readonly context: OperationContext }) =>
  Effect.Effect<void, UnknownPlugin | HostClosed>
```

```
REQUIREMENT: `Plugin.Runtime.unmount(child, { context })` MUST remove a
             child mounted by the calling activation exactly as the close of
             a sub-scope removes it (BEH-BR-121): its dependents first,
             drained under `BridgerOptions.drainTimeout`, revoked at the
             limit, never parked, and MUST complete when the removal has
             settled. A `child` that is not a child of this activation MUST
             fail with `UnknownPlugin`. A child whose removal has already
             begun — by its parent's stop or its sub-scope — MUST NOT be
             removed twice: the call waits for that removal under the
             limits of the removal that began it, as the sub-scope's
             finalizer waits (BEH-BR-121) — parking with an operator call
             that roots the parent's stop, the overall limit under
             shutdown, revocation at `drainTimeout` only on a path with no
             caller — and writes no record of its own.
```

```
REQUIREMENT: With an `AuditSink` wired, the unmount MUST be recorded as
             22 — Attributable Operations, BEH-BR-190, states: one
             `unmount-requested` record carrying `requestedBy` (the
             context's actor and reason), then the `system-stop` records of
             the removal, caused by it. It MUST NOT consult the
             `OperationGate`, and MUST NOT fail for missing attribution.
             A sub-scope closed after its child was unmounted finds the
             child gone and removes nothing.
```

**Settled here (CCR-BR-026).** A companion that removes a child on
someone's request — the remote companion revoking a boundary for an
operator, say — needs that person and reason in the trail, and the stops of
the child's dependents need a cause that leads back to them (URS gap G57).
Closing the sub-scope cannot carry either. `unmount` carries them without
making the removal an operator call: it is not gated, because removing code
is the safe direction, and its records stay system records attributed to
`Actor.system`, with the requester in `requestedBy` beside the actor, so
that "the host did this" and "on whose request" are never confused.

**Settled here.** SPEC.md is silent on attribution and approval of
children. Mounting a child is a consequence of a decision already taken —
installing or starting the parent — not a new decision, so it is treated as
a system transition: audited, never gated
([25 — Operation Gate](./25-operation-gate.md)). A consumer who requires
approval for every piece of code that can run approves the parent's
definition, whose `meta.digest` covers the code that mounts the children.
Operations a caller addresses to a child directly (BEH-BR-125) are ordinary
operator calls and are attributed, gated and audited as such.

A child's mount and its activation are both `system-start` records. They are
told apart by `after.state` and by the causation chain: the activation points
at the mount, the mount at the parent's activation (URS gap G20,
CCR-BR-010).

## BEH-BR-127: A group is a plugin that mounts members as children

> **See:** [ADR-BR-021](../decisions/021-children-and-groups.md)
> **Satisfies:** [URS-BR-017](../urs.md#urs-br-017-bind-sub-plugins-to-the-lifetime-of-a-parent)

```ts
Plugin.group(
  id: string,
  members: readonly Plugin.Any[]            // any definition fits, no cast (01, BEH-BR-001)
): Plugin<readonly [], readonly [], InstallError | Conflict | HostClosed | ChildNotAllowed, void>
   // the build's error: a member's mount failing (BEH-BR-121, BEH-BR-128)
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
             build, the group's activation MUST fail with phase "build" —
             the `InstallError` fails the group's build Layer (05 —
             Activation, BEH-BR-037; BEH-BR-121) — and members already
             mounted in that activation MUST be removed, so that no partial
             group remains mounted.
```

The SPEC's acceptance list asks that "group operations are atomic". Here
that means: one transition on one plugin, with all members mounted or none.
It does not mean that every member becomes `active` together — a member may
still be `waiting` or `failed` as a child may, and `awaitActive` is how a
caller waits for all of them.

**Settled here.** The all-or-none mount on a member's `InstallError`
settles a case SPEC.md does not cover; a group in which some members were
silently missing would contradict the reason for grouping them. The phase is
"build", as for any parent whose build lets a child's `InstallError`
propagate: a group is sugar over children, and a separate phase for groups
would be a second mechanism (URS gap G22, CCR-BR-010).

---

_Previous: [13 — Observability and Diagnostics](./13-observability-and-diagnostics.md)_ · _Next: [15 — Optional and Reactive Dependencies](./15-optional-and-reactive.md)_
