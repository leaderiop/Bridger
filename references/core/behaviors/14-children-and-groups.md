# 14 — Children and Groups

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-BEH-14                                               |
> | Revision       | 0.15                                                         |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.15 (2026-11-11): BEH-BR-121 "the parent's stop has begun" counts from the parent becoming `stopping` or shutdown beginning, whichever comes first, and from then the child's stop is the parent's stop's or shutdown's, whose limits a sub-scope close or `unmount` never shortens; a stop begun outside the parent's stop is any stop the parent's stop or shutdown did not begin, the child's own system stop included; the take-over never cancels the owning operation and waits for its stop step under `drainTimeout` and for a build it then runs under `buildTimeout` (bound `drainTimeout` + `buildTimeout`), then removes a child still registered; a child whose cleanup fails during any of these removals stays `failed` (cleanup), the sub-scope close logs it, `unmount` fails with `CleanupError`, a re-mount fails `DuplicatePlugin` until an operator `remove`; BEH-BR-125 the resumer list carries "before the parent's stop has begun"; BEH-BR-126 `unmount` also refuses on `CurrentTransition`, adds `CleanupError` to its union, and fails `HostClosed` once the host has closed, waiting under shutdown's limits while shutdown runs (H1, C1, C2, C3, CL5, CL11) (SPEC-AUDIT-08) (CCR-BR-040)<br>0.14 (2026-11-11): BEH-BR-126 the dependents a sub-scope close stops first take the child's mount record as cause (SPEC-AUDIT-07 residual of round 6); BEH-BR-121 defines the child's removal set (the child and its dependents, transitively, the set BEH-BR-088 guards), a held lease (its own or inherited from the forking fiber, "or a fiber it awaits" removed) and "the parent's stop has begun" (from the revision in which the parent becomes `stopping`); the finalizer's lease check covers the whole removal set; a stop begun outside the parent's stop and still draining is taken over as a no-caller cascade takes over a dependent's running step, under `drainTimeout` counted from meeting it; BEH-BR-126 `unmount` fails with `WouldDeadlock` at the call whenever the caller holds a lease in the removal set, otherwise waits under the limits of the removal it joins or begins, and writes `unmount-requested` only when it begins or takes over a removal (H1, C1, C3, C4, C5, CL7) (SPEC-AUDIT-07) (CCR-BR-039)<br>0.13 (2026-11-11): BEH-BR-121 a sub-scope finalizer never fails and never waits on a lease held by the closing fiber or a fiber it awaits: read from its `HeldPlugins` at the start, such a lease makes it hand a removal it would run itself (or a resumption of a stop parked outside the parent's stop) to the host as a removal with no caller, forked outside the closing fiber, leave a removal the parent's stop began to that stop, log a warning naming the child, and close with the child still registered until the removal settles; the "finalizer MUST fail with `WouldDeadlock`" rule removed; BEH-BR-126 `unmount` fails with `WouldDeadlock` at the call, before any wait, when the parent's operator-rooted stop has begun removing the child (draining or parked) and the caller holds a lease on it (H1, H2, C1); BEH-BR-122 `parentId` is the parent's `{ id, realm }` (C5) (SPEC-AUDIT-06) (CCR-BR-038)<br>0.12 (2026-11-11): BEH-BR-121 a child stop the parent's stop parked stays the parent's: the sub-scope finalizer only waits, never resumes or revokes, and fails with `WouldDeadlock` when the closing fiber holds a lease on the child while that stop is parked with an operator call; the bound by `drainTimeout` and the revocation of the closing fiber's lease apply only to a removal the finalizer begins itself; resume-and-revoke applies only to a stop parked outside the parent's stop, showing `reason` "remove"; BEH-BR-125 the resumer list says so; BEH-BR-126 `unmount` waits the same way and may fail with `WouldDeadlock` (H1) (SPEC-AUDIT-05) (CCR-BR-037)<br>0.11 (2026-11-10): BEH-BR-121 the wait of a sub-scope finalizer or `unmount` on a removal the parent's stop began follows that stop's limits — parks with an operator call at its root, waits for the overall limit under shutdown, revokes at `drainTimeout` only on a path with no caller; BEH-BR-126 `unmount` waits the same way (H1) (CCR-BR-036)<br>0.10 (2026-11-10): BEH-BR-121 the wait of a sub-scope finalizer or `unmount` on a removal the parent's stop began is bounded by `drainTimeout`, then revokes; the resumption emits `stop-resumed` with `by` "sub-scope" or "unmount"; BEH-BR-126 `unmount` waits the same bound; BEH-BR-125 the list of what resumes a parked child stop names the sub-scope close and `unmount` (C11, C13) (CCR-BR-035)<br>0.9 (2026-11-10): BEH-BR-121 a sub-scope close or `unmount` resumes a parked child stop, ends its parked intent, revokes at `drainTimeout` and never parks, with causes the mount or `unmount-requested` record (C8); BEH-BR-127 `Plugin.group` error type is the mount errors, not `never` (audit round 2, Low) (CCR-BR-034)<br>0.8 (2026-11-09): BEH-BR-126 the mount record's `after.state` may be `starting`, the state a child with nothing missing is registered in, with its activation's `system-start` caused by the mount record (C-05) (CCR-BR-032)<br>0.7 (2026-11-08): BEH-BR-121 a refused digest refuses the mount (`ChildNotAllowed`); BEH-BR-126 `Plugin.Runtime.unmount`, an attributed child removal recorded by `unmount-requested` with `requestedBy` (G57) (CCR-BR-026)<br>0.6 (2026-11-08): BEH-BR-121: the sub-scope finalizer waits for the removal, a held lease is revoked at the limit, a removal begun by the parent's stop takes precedence (CCR-BR-022)<br>0.5 (2026-11-08): BEH-BR-121 a lazy child refused with `InvalidDefinition` (CCR-BR-017); BEH-BR-121 `ChildNotAllowed` and BEH-BR-122 mandatory interceptions always inherited (CCR-BR-018); BEH-BR-121 sub-scope mount removed when the sub-scope closes, BEH-BR-126 its `system-stop` record, `Plugin.Any` in `Plugin.Runtime.install` and BEH-BR-127 group members (CCR-BR-020)<br>0.4 (2026-10-03): A child's parked removal is also resumed by a cascade of another of its providers, as BEH-BR-080 gives it (consistency pass) (CCR-BR-013)<br>0.3 (2026-10-02): No mount once the parent's stop or shutdown has begun; a parked child removal resumes only as a removal; mount and activation records; a parent awaiting a child in its build can starve for a slot; a group member's install error fails the group with phase "build" (prototype findings G19–G22) (CCR-BR-010)<br>0.2 (2026-10-02): Child install fails with `DependencyCycle` (mount edges child→parent); children removed as dependents before the parent's scope begins to close, whatever they hold; a parked child operation ends; child causation per BEH-BR-190; shutdown never parks (CCR-BR-008)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001)                 |

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
REQUIREMENT: For the rules of this behaviour and of BEH-BR-126 (CCR-BR-039):
             - the child's *removal set* MUST be the child and every plugin
               its removal stops first — its dependents, transitively — the
               set that 09 — Leases, BEH-BR-088, already guards ("any
               provider whose stopping would first stop P");
             - a *held lease* of a fiber MUST be a lease named in that
               fiber's `@bridger/core/HeldPlugins` (BEH-BR-088): its own,
               or one inherited from the fiber that forked it;
             - the parent's stop MUST count as *begun* from the revision in
               which the parent becomes `stopping` (04 — States and Snapshots,
               BEH-BR-026), or in which shutdown begins (12 — Shutdown and
               Hosting, BEH-BR-105), whichever comes first, whether or not
               that stop has reached the child (CCR-BR-040). From that
               revision the child's stop belongs to the parent's stop or to
               shutdown and is waited for under their limits; a removal or
               take-over that a sub-scope close or `unmount` began before
               then continues under its own limits (08 — Operation
               Legality, BEH-BR-079), except that shutdown takes it over
               under its own (12, BEH-BR-107): a sub-scope close or
               `unmount` never shortens shutdown's limits;
             - a stop of the child *begun outside its parent's stop* MUST be
               any stop of it that neither the parent's stop nor shutdown
               began: one begun by an operator call addressed to the child
               itself, by a cascade from another of its providers, or the
               child's own system stop (08 — Operation Legality,
               BEH-BR-073).
```

```
REQUIREMENT: The sub-scope's finalizer MUST NOT fail and MUST NOT wait on a
             held lease of the closing fiber that is in the child's removal
             set (CCR-BR-038, CCR-BR-039). At the start of the finalizer the
             host MUST read the closing fiber's `HeldPlugins`, the child's
             removal set and whether the parent's stop has begun, and:
             (a) before the parent's stop has begun, when the finalizer
                 would begin the child's removal itself, or take over a
                 stop of the child begun outside its parent's stop —
                 draining or parked, as a requirement below states — and a
                 held lease of the closing fiber is in the removal set, it
                 MUST hand that removal or take-over to the host as a
                 removal with no caller (BEH-BR-125; 10 — Runtime Failure
                 and Health, BEH-BR-095) — drained under
                 `BridgerOptions.drainTimeout`, the leases still held
                 revoked at the limit, and a take-over under the bound the
                 take-over requirement below states — run in a fiber forked
                 outside the
                 closing fiber, with the records BEH-BR-126 gives a
                 sub-scope close, and MUST NOT wait for it;
             (b) once the parent's stop has begun, the child's removal MUST
                 be the parent's stop's or shutdown's, under the rules of
                 the next requirement —
                 parked and resumed with an operator call at its root,
                 taken over by shutdown, revoked at the drain limit on a
                 path with no caller — and the finalizer MUST start no
                 removal of its own; when a held lease of the closing fiber
                 is in the removal set, it MUST NOT wait for that removal;
             (c) a removal of the child already begun by
                 `Plugin.Runtime.unmount` (BEH-BR-126) MUST NOT be begun
                 again: the finalizer MUST
                 NOT wait for it when a held lease of the closing fiber is
                 in the removal set.
             Whenever it does not wait, the finalizer MUST log at warning
             level, naming the child `{ id, realm }`, and the sub-scope
             closes with the child still registered until that removal
             settles.
```

```
REQUIREMENT: When no held lease of the closing fiber is in the child's
             removal set, the sub-scope's finalizer MUST wait until the
             child's removal has settled, so that the sub-scope does not
             close with its child still registered. Before the parent's
             stop has begun, it MUST take over a stop of the child begun
             outside its parent's stop, draining or parked, as a
             requirement below states, or else begin the child's removal
             itself, or wait for a removal already begun by an `unmount`;
             for a removal the finalizer begins, the wait is bounded by
             `BridgerOptions.drainTimeout` for the drain, then by the
             revocation of the leases still held, as for a removal with no
             caller (BEH-BR-125; 10 — Runtime Failure and Health,
             BEH-BR-095), and for a take-over by the bound the take-over
             requirement below states. Once the parent's stop has begun,
             the removal of the child by that stop or by shutdown MUST take
             precedence: the sub-scope's finalizer waits for it, starts no
             second removal, and the child's `system-stop` record takes its
             cause from the parent's cascade, or from shutdown's
             `requested` record (BEH-BR-126). That wait MUST follow the
             limits of the parent's stop or of shutdown and set none of its
             own (CCR-BR-036, CCR-BR-040): when an
             operator call is the cascade root, the finalizer MUST NOT
             revoke a lease that call did not force — a drain that expires
             without the call's `force: true` parks the child's stop with
             the call (08 — Operation Legality, BEH-BR-080; 09 — Leases,
             BEH-BR-086), the stop stays the parent's, the finalizer never
             resumes it, and the wait continues until something that
             resumes the parent's parked operation — a call, a cascade or
             shutdown (08, BEH-BR-074) — resumes the child's stop and it
             settles; under shutdown, the wait lasts until the removal
             settles, the leases being revoked only once the overall
             shutdown limit has passed (12 — Shutdown and Hosting,
             BEH-BR-107); and only when the parent's stop is itself on a
             path with no caller are the leases still held on the child
             revoked, when that stop's drain of the child expires at
             `BridgerOptions.drainTimeout` (10, BEH-BR-095).
```

```
REQUIREMENT: When, before the parent's stop has begun, the child's sub-scope
             closes or `Plugin.Runtime.unmount` is called for it
             (BEH-BR-126) while a stop of the child begun outside its
             parent's stop is still draining — whatever began it: an
             operator call addressed to the child itself, a cascade from
             another of its providers, or the child's own system stop — the
             removal MUST take that stop over (CCR-BR-039, CCR-BR-040). It
             MUST NOT join, supersede, redirect or cancel the operation that
             owns the stop, which continues after its step and is decided
             against where the child landed, and it MUST wait for that
             operation to settle: for its stop step under
             `BridgerOptions.drainTimeout`, counted from when it meets the
             stop, revoking the leases still held when that limit expires,
             as a cascade with no caller waits for a running stop step of a
             dependent (08 — Operation Legality, BEH-BR-079; 09 — Leases,
             BEH-BR-086); and, when that operation then builds the child —
             a `restart`, `replace`, `reconfigure` or `enable` — for that
             build under `buildTimeout` (05 — Activation, BEH-BR-040). The
             take-over's wait is thereby bounded by `drainTimeout` +
             `buildTimeout`. If that stop parks first, it is resumed as the
             next requirement states, the same drain limit still counting.
             Once the operation has settled, a child still registered MUST
             be removed by the removal itself, as a removal it begins
             (`reason` "remove", `next` "gone"), bounded as such. A
             revocation it forces, and the removal it then runs, MUST take
             as `causationId` the child's mount record for a sub-scope
             close and the `unmount-requested` record for an unmount.
```

```
REQUIREMENT: When the child's stop was parked outside the parent's stop —
             by an operator call addressed to the child itself, such as a
             `remove` without `force`, or by a cascade from another of its
             providers — and, before the parent's stop has begun, its
             sub-scope closes or `Plugin.Runtime.unmount` is called for it
             (BEH-BR-126), the removal MUST resume that stop as the parent's
             stop does
             (BEH-BR-125) — ending any parked operator intent, with its
             `intent-ended` record, running none of the parked operation's
             remaining actions, setting `reason` "remove" and `next` "gone"
             (04 — States and Snapshots, BEH-BR-027) — except that its
             drain, under `BridgerOptions.drainTimeout`, MUST revoke at
             the limit and never park again, so that the finalizer or the
             unmount waits no longer than that bound and the finalizers
             that follow it. The resumed stop's
             records and the `intent-ended` record MUST take as
             `causationId` the child's mount record for a sub-scope close,
             and the `unmount-requested` record for an unmount (22 —
             Attributable Operations, BEH-BR-190). The resumption MUST emit
             `stop-resumed` with `by` "sub-scope" or "unmount" (13 —
             Observability and Diagnostics); it is not a cascade. A child
             stop that the parent's stop parked is never resumed this way:
             it stays the parent's, and the sub-scope close waits for it or
             leaves it to the parent's stop as the requirements above state,
             the `unmount` as BEH-BR-126 states (CCR-BR-037, CCR-BR-038).
```

```
REQUIREMENT: When the child's cleanup fails during its removal — by the
             parent's stop, by its sub-scope close, by `unmount` or by a
             take-over — the child MUST stay registered in `failed` with
             phase "cleanup" (06 — Removal, BEH-BR-046), as under shutdown
             (12 — Shutdown and Hosting, BEH-BR-105), and the removal MUST
             otherwise complete (CCR-BR-040): the parent's stop continues
             as for a dependent's cleanup failure (BEH-BR-046), the
             sub-scope close completes, logging at error level the child's
             `{ id, realm }`, and `unmount` fails with
             `CleanupError { id, realm, message }` naming the child. Until
             an operator `remove` of the child (06, BEH-BR-047), a later
             mount of the same id — by the parent's next activation or any
             other `Plugin.Runtime.install` — MUST fail with
             `DuplicatePlugin` and register nothing (03 — Installation).
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
             services of plugins other than its parent; a child whose
             cleanup fails stays registered in `failed` (cleanup), as
             BEH-BR-121 states. A child's stop MUST
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

**Settled here (CCR-BR-037).** A child stop the parent's stop parked stays
the parent's: a sub-scope close or an `unmount` never resumes it, since
resuming it under `drainTimeout` would revoke leases the operator's
`force: false` kept — the outcome the rule above exists to
prevent. Resuming with revocation is kept for a child stop parked outside
the parent's stop, by an operator call on the child or a cascade from
another provider, whose finalizer has no other bound to wait under. Taking
the stop over instead was rejected: a finalizer would then override an
operator's `force: false`.

**Settled here (CCR-BR-038).** A scope finalizer can neither fail — nothing
receives its error, and a defect there would be a failure of the parent —
nor be interrupted, so revoking a lease held by the fiber that runs it would
never take effect. Whether such a lease is held is a standing condition,
read once from `HeldPlugins` at the start of the finalizer, not a state of
the child's stop that may arrive later: a wait entered while the parent's
operator-rooted stop is still draining could otherwise hang once that stop
parks, or forever under `drain: "forever"`. With such a lease the finalizer
therefore never waits: a removal it would run itself goes to the host as a
removal with no caller, forked outside the closing fiber, so that its
revocation can interrupt that fiber once the finalizer has returned; a
removal the parent's stop began stays the parent's, under that stop's
limits. The sub-scope then closes with its child still registered until the
removal settles, and the warning says so. A caller that must know the
outcome uses `Plugin.Runtime.unmount`, an ordinary effect that can fail
with `WouldDeadlock` (BEH-BR-126). Failing the finalizer with `WouldDeadlock`
(the CCR-BR-037 rule) was rejected: the error had nowhere to go.

**Settled here (CCR-BR-039).** The CCR-BR-038 check looked only at a lease
on the child, but the child's removal stops its dependents first, and
revoking a lease on one of them interrupts its holder just the same: a
closing fiber that leased a dependent passed the check and hung. The check
therefore reuses the set BEH-BR-088 already guards, the child's removal set,
and reads only what `HeldPlugins` can show — the fiber's own leases and
those inherited from the fiber that forked it; a fiber that merely awaits
the closing fiber is not visible there, and a wait relayed through it stays
the residual of RSK-BR-011. "The parent's stop has begun" means from the
revision in which the parent becomes `stopping`, not from when that stop
reaches the child: a sub-scope close in that window that began its own
removal would revoke at `drainTimeout` and override an operator's
`force: false`, the outcome CCR-BR-036 rejected. A stop begun outside the
parent's stop and still draining is taken over as a cascade with no caller
takes over a dependent's running step (BEH-BR-079), so that neither a
draining nor a parked outside stop leaves the finalizer without a bound;
taking over its operation instead was rejected, as BEH-BR-079 rejects it
for a cascade.

**Settled here (CCR-BR-040).** Ownership of a child's stop is decided by one
rule instead of per trigger. Once the parent's stop or shutdown has begun,
the child's stop is theirs: counting "begun" from the parent's `stopping`
alone left a child that shutdown stopped while the parent was still
building with no owner, so that a sub-scope close would either revoke at
`drainTimeout`, before shutdown's overall limit, or begin a second removal.
Before then, a sub-scope close or `unmount` takes over any stop of the child
begun elsewhere, the child's own system stops included. The take-over still
never cancels the operation that owns the stop: a `restart`, `replace`,
`reconfigure` or `enable` builds after its stop step, and ending it like a
parked intent would let a sub-scope close cancel a running operator call,
which BEH-BR-079 refuses a cascade. The take-over therefore waits for that
build too, and its bound is `drainTimeout` + `buildTimeout`. A child whose
cleanup fails stays `failed` (cleanup), as everywhere else, so that its leak
stays visible; the sub-scope close cannot report it and logs it, `unmount`
returns it, and the child's id stays taken until an operator removes it.

## BEH-BR-122: A child is an ordinary plugin with a prefixed identity

> **Invariant:** [INV-BR-001](../invariants.md#inv-br-001-one-provider-per-service-key-per-realm)
> **See:** [ADR-BR-021](../decisions/021-children-and-groups.md)
> **Satisfies:** [URS-BR-017](../urs.md#urs-br-017-bind-sub-plugins-to-the-lifetime-of-a-parent), [URS-BR-004](../urs.md#urs-br-004-know-why-a-plugin-is-not-running)

```
REQUIREMENT: A child's ID MUST be the parent's ID, a "/", and the child
             definition's `id` (`parent/child`), and its snapshot MUST record
             `parentId`, the parent's `{ id, realm }`, since a child may sit
             in another realm (17 — Realms and Interception, BEH-BR-147).
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
             by an operator `remove` of the child, or — when the stop was
             parked outside the parent's stop, and before the parent's stop
             has begun (from the revision in which the parent becomes
             `stopping` or shutdown begins, BEH-BR-121) — by the close of
             the sub-scope it was mounted under or by
             `Plugin.Runtime.unmount` of it (BEH-BR-121, BEH-BR-126), and
             MUST end with the child
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
             `causationId` is the record id of the child's mount record;
             the `system-stop` records of the child's dependents that the
             removal stops first take the same `causationId` (22,
             BEH-BR-190).
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
  Effect.Effect<void, UnknownPlugin | HostClosed | WouldDeadlock | CleanupError>
```

```
REQUIREMENT: `Plugin.Runtime.unmount(child, { context })` MUST remove a
             child mounted by the calling activation exactly as the close of
             a sub-scope removes it (BEH-BR-121): its dependents first,
             drained under `BridgerOptions.drainTimeout`, revoked at the
             limit, never parked, and MUST complete when the removal has
             settled. A `child` that is not a child of this activation MUST
             fail with `UnknownPlugin`.
```

```
REQUIREMENT: When the calling fiber has a held lease in the child's removal
             set (BEH-BR-121), read from its `@bridger/core/HeldPlugins`
             (09 — Leases, BEH-BR-088) at the call, or carries a plugin of
             that set in its `@bridger/core/CurrentTransition` — it runs, or
             was forked by, a build, `load` or finalizer step of that
             plugin (BEH-BR-088) — `unmount` MUST fail with
             `WouldDeadlock { id, realm }` naming the child, at the call,
             before any wait, writing no record and changing nothing,
             whatever removal of the child is under way or would begin —
             the parent's stop, under any root, shutdown, a sub-scope
             close, or the call's own removal — uniformly with the
             stopping calls of BEH-BR-088 (CCR-BR-038, CCR-BR-039,
             CCR-BR-040). The child's removal is left to whatever began it,
             or to its sub-scope close.
```

```
REQUIREMENT: Otherwise, a child whose removal has already begun — by its
             parent's stop or by shutdown (from the revision in which the
             parent becomes `stopping` or shutdown begins, BEH-BR-121), by
             its sub-scope close or by an
             earlier `unmount` — MUST NOT be removed twice: the call waits
             for that removal under the limits of the removal it joins —
             parking with an operator call that roots the parent's stop,
             the overall limit under shutdown, revocation at `drainTimeout`
             only on a path with no caller — never resumes a child stop the
             parent's stop parked, and writes no record of its own. Before
             the parent's stop has begun, the call MUST take over a stop of
             the child begun outside its parent's stop, draining or parked,
             as BEH-BR-121 states, or else begin the child's removal itself.
             When the child's cleanup fails, `unmount` fails with
             `CleanupError` as BEH-BR-121 states.
```

```
REQUIREMENT: `unmount` MUST fail with `HostClosed`, writing no record and
             changing nothing, once the host has closed (12 — Shutdown and
             Hosting). Called while shutdown runs, it MUST wait for the
             child's removal under shutdown's limits, as the requirement
             above states, and complete when that removal settles
             (CCR-BR-040).
```

```
REQUIREMENT: With an `AuditSink` wired, an unmount that begins the child's
             removal or takes over a stop of it (BEH-BR-121) MUST be
             recorded as 22 — Attributable Operations, BEH-BR-190, states:
             one `unmount-requested` record carrying `requestedBy` (the
             context's actor and reason), written when it begins or takes
             over the removal, then the `system-stop` records of the
             removal, caused by it. An unmount that fails — with
             `WouldDeadlock`, `UnknownPlugin` or `HostClosed` — or that
             waits for a removal begun by the parent's stop, shutdown, a
             sub-scope close or another unmount MUST write no record
             (CCR-BR-039, CCR-BR-040); one that fails with `CleanupError`
             keeps the records its removal wrote.
             It MUST NOT consult the
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
