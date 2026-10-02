# Runtime Invariants

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-INV                                                  |
> | Revision       | 0.5                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.5 (2026-10-02): INV-BR-002 graph includes mount edges, child→parent; INV-BR-009 per transition step and operation in flight, a parked stop resumed by a call, a cascade or shutdown; INV-BR-010 interruption outcomes per stage; INV-BR-016 and INV-BR-030 cover builds and finalizers (and the fibers a build or finalizer forks and awaits), INV-BR-016 also `retry` and `enable`; INV-BR-017 parks every unsettled stop a failing operator call drives, revokes paths with no caller, never parks once shutdown has begun; INV-BR-022 no record for a `requested` record dropped for overflow, verification pairs records by call and covers resumption and `Interrupted`; INV-BR-025 `reconcile` re-checks `requireReason` on the diff recomputed at its intent; INV-BR-030 bound per cascade drain limit plus `buildTimeout` per build step, finalizers that return, stops take no `concurrency` slot (CCR-BR-008, both review passes)<br>0.4 (2026-10-02): INV-BR-010 source: interruption before intent writes a failed (Interrupted) record (CCR-BR-007)<br>0.3 (2026-10-02): INV-BR-030 added (CCR-BR-006)<br>0.2 (2026-10-02): Consistency fixes from independent review (CCR-BR-002)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001) |

---

Properties that hold for every execution. Each names the mechanism that will
enforce it, because an invariant nobody enforces is a wish.

This specification is prospective
([ADR-BR-036](decisions/036-prospective-specification.md)): nothing below is
implemented. Every **Source** names a planned module and the mechanism it is
to carry, marked *(Planned)*; every **Verification** names the kind of check
that is to exercise the property, also *(Planned)*. No test cited here exists
yet, and no invariant here may be cited as evidence until a test that checks
it has been written and executed
([ADR-BR-035](decisions/035-evidence-from-executed-tests.md)).

Each invariant has the same shape: a one-sentence statement; the **Source**
that will enforce it; the **Implication** — the failure it prevents; the
**Verification** that will check it; and the **Related** behaviours and
decisions that motivate it. The behaviours are normative in detail; an
invariant is the property those behaviours together must never break.

## INV-BR-001: One provider per service key per realm

In every resolution scope, each `ServiceId` is held at every revision by at
most one provider: the base services, or one installed plugin that is not
`disabled`.

**Source**: `packages/core/src/Host.ts` *(Planned)* — `install`, `replace` and
`enable` decide `DuplicateProvider` against a provider-slot table keyed by
(resolution scope, `ServiceId`), re-checked at the linearization point.
`packages/core/src/Realm.ts` *(Planned)* — `scopeOf(R, K)` chooses the slot:
realm R's own when R isolates K, the default realm's otherwise. A slot is
reserved from the revision in which its plugin is registered until the
revision in which it is unregistered or disabled, whether or not the plugin
is `active`; the base services hold their slots for the host's lifetime.

**Implication**: a consumer never resolves a key to one of two providers
chosen by start order. Reserving the slot of a `waiting` or `failed` provider
prevents a second provider from occupying it while the first is down and the
two from contending when the first returns. Ambiguity is refused at the call
that would create it, not discovered at resolution.

**Verification** *(Planned)*: a property test over generated sequences of
`install`, `replace`, `disable`, `enable` and `remove` across several realms,
asserting slot uniqueness in every published snapshot; scenarios for
`DuplicateProvider` with `providerId: "base"`, with a plugin id, after
`replace` adds a key, and on `enable` of a plugin whose key was taken while it
was disabled.

**Related**: [BEH-BR-012](behaviors/02-host-construction.md), [BEH-BR-019](behaviors/03-installation.md), [BEH-BR-051](behaviors/07-replacement-and-reactivation.md), [BEH-BR-061](behaviors/07-replacement-and-reactivation.md), [BEH-BR-062](behaviors/07-replacement-and-reactivation.md), [BEH-BR-122](behaviors/14-children-and-groups.md), [BEH-BR-147](behaviors/17-realms-and-interception.md), [ADR-BR-003](decisions/003-one-provider-per-key-per-realm.md), [ADR-BR-006](decisions/006-one-instance-per-id-per-realm.md), [ADR-BR-019](decisions/019-realms-are-resolution-namespaces.md).

---

## INV-BR-002: The dependency graph is acyclic per resolution scope

The graph whose edges join each installed, non-`disabled` plugin to the
provider each of its required keys resolves to under `scopeOf` (dependency
edges, dependent→provider), and each child to the parent that mounted it
(mount edges, child→parent), contains no cycle.

**Source**: `packages/core/src/Resolver.ts` *(Planned)* — cycle detection over
the resolved-edge graph with its child→parent mount edges — a child depends
on the parent that mounted it, so a child that requires its parent's services
is legal and a parent that requires a service of its own child is a cycle —
run by `install`,
`replace` (whose `requires` are evaluated afresh) and `enable` in
`packages/core/src/Host.ts` *(Planned)*, and by `Plugin.Runtime.install` of a
child in `packages/core/src/PluginRuntime.ts` *(Planned)*, before any state
changes. A child install that would close a cycle fails with
`DependencyCycle { path }`, the path beginning with the child, and registers
nothing; whether that fails the parent's build is the parent author's choice
(BEH-BR-121). Keys listed in `optional` and the base services contribute no
edges; a disabled plugin contributes none.

**Implication**: a cycle would leave every plugin on it `waiting` for another
forever and would make dependents-first stopping
([INV-BR-005](#inv-br-005-dependents-stop-before-their-providers)) undefined.
Refusing it at install with a `DependencyCycle { path }` that begins at the
plugin being installed names the culprit at the moment it is introduced. A
cycle that exists only across two realms' isolated slots is not a cycle
unless resolution actually connects it, so realms do not produce false
refusals.

**Verification** *(Planned)*: a property test over generated definition
graphs and realm layouts, asserting that `install` succeeds exactly when the
resolved graph stays acyclic and that `path` starts with the installed id;
scenarios for a cycle closed by `replace` and by `enable`, for a child install
whose dependency or mount edges would close a cycle (it fails, the path
begins with the child, and nothing is registered), for a child that requires
its parent's services (legal), and for a cross-realm layout that is not a
cycle.

**Related**: [BEH-BR-020](behaviors/03-installation.md), [BEH-BR-052](behaviors/07-replacement-and-reactivation.md), [BEH-BR-062](behaviors/07-replacement-and-reactivation.md), [BEH-BR-078](behaviors/08-operation-legality.md), [BEH-BR-121](behaviors/14-children-and-groups.md), [BEH-BR-148](behaviors/17-realms-and-interception.md), [ADR-BR-003](decisions/003-one-provider-per-key-per-realm.md), [ADR-BR-019](decisions/019-realms-are-resolution-namespaces.md), [ADR-BR-022](decisions/022-optional-and-reactive-dependencies.md).

---

## INV-BR-003: Publication is atomic

The services a plugin provides become visible together, in the same revision
in which the plugin becomes `active` and only after its build has succeeded,
and a failed activation publishes nothing.

**Source**: `packages/core/src/Lifecycle.ts` *(Planned)* — an activation ends
in one state update of the host's `SubscriptionRef<HostSnapshot>`
(`packages/core/src/Snapshot.ts` *(Planned)*) that writes the provider-table
entries and the `active` state together; a build output missing a declared
key, a `ConfigInvalid` or a `KeyMismatch` fails the activation before that
update. `packages/core/src/Generation.ts` *(Planned)* — `publish` replaces the
current value in a single `Ref` update, so a lease admitted before it keeps
the old value and one admitted after it receives the new.

**Implication**: no consumer sees half a plugin — some of its keys present and
others missing — and no consumer leases a service from a plugin whose build
then fails. A parent's provided services and its children's view of them,
and a group of behaviours switched through one `Generation`, change in one
step or not at all.

**Verification** *(Planned)*: a property test on the test host with
`Fault.buildFails` and builds whose output omits a declared key, asserting
that every snapshot shows either all of a plugin's provided keys with the
plugin `active` or none of them; a property test of `Generation` asserting no
lease observes a mixture of two published values.

**Related**: [BEH-BR-033](behaviors/05-activation.md), [BEH-BR-037](behaviors/05-activation.md), [BEH-BR-097](behaviors/11-configuration.md), [BEH-BR-124](behaviors/14-children-and-groups.md), [BEH-BR-170](behaviors/20-generation.md), [ADR-BR-002](decisions/002-plugin-build-is-a-layer.md), [ADR-BR-018](decisions/018-configuration-decoded-before-build.md), [ADR-BR-024](decisions/024-shared-state-helpers.md).

---

## INV-BR-004: No stale build is published

A build whose plugin's target changed while it ran — an operation applied to
the plugin, or one of its captured providers beginning to stop — is allowed
to settle and its result is never published.

**Source**: `packages/core/src/Lifecycle.ts` *(Planned)* — every activation
carries an attempt token; the publication step compares it with the plugin's
current target under the per-plugin linearization of
`packages/core/src/Host.ts` *(Planned)*, and on a mismatch closes the
build's scope through `stopping` and proceeds toward the latest target. The
build is not interrupted for that reason.

**Implication**: a service built against a provider that has since left, or
against a configuration or definition that has since been superseded, never
becomes visible. Letting the build settle rather than interrupting it keeps
its acquisition and release paired, so discarding it cannot strand a
half-acquired resource.

**Verification** *(Planned)*: scenarios on the steppable test host that hold
a build open, apply each of `remove`, `replace`, `restart`, `reconfigure` and
`disable` (and stop a captured provider), release the build, and assert the
stale result is never `active`; a property test over generated interleavings
of builds and operations.

**Related**: [BEH-BR-039](behaviors/05-activation.md), [ADR-BR-004](decisions/004-replace-is-stop-then-start.md), [ADR-BR-013](decisions/013-total-operation-legality.md).

---

## INV-BR-005: Dependents stop before their providers

A provider's activation scope does not begin to close until every live
dependent of it — every plugin that captured one of its services, every child
plugin and every `whenAvailable` run holding one of its services — has
closed, transitively, and its binding leaves the provider table only after
its own cleanup has completed.

**Source**: `packages/core/src/Lifecycle.ts` *(Planned)* — the stop sequence
(become `stopping`, drain leases, close scope) is scheduled in reverse
dependency order over the resolved edges computed by
`packages/core/src/Resolver.ts` *(Planned)*; stops along one dependency path
run one after another, and only independent subtrees run concurrently. The
same ordering serves `remove`, `replace`, `restart`, `reconfigure`, runtime
failure, a parent's stop and `shutdown` in `packages/core/src/Host.ts`
*(Planned)*.

**Implication**: a dependent's finalizers can still use the provider services
they captured and always find the provider open (the spatial guarantee). No
finalizer runs against a closed provider, and a provider in the default realm
serving consumers in several realms stops only after all of them.

**Verification** *(Planned)*: a property test over generated dependency
graphs that records finalizer order and asserts every dependent's finalizers
complete before its provider's begin; scenarios in which a dependent's
finalizer calls its captured provider during `remove`, runtime failure and
`shutdown`.

**Related**: [BEH-BR-035](behaviors/05-activation.md), [BEH-BR-043](behaviors/06-removal.md), [BEH-BR-044](behaviors/06-removal.md), [BEH-BR-051](behaviors/07-replacement-and-reactivation.md), [BEH-BR-094](behaviors/10-runtime-failure-and-health.md), [BEH-BR-101](behaviors/11-configuration.md), [BEH-BR-105](behaviors/12-shutdown-and-hosting.md), [BEH-BR-121](behaviors/14-children-and-groups.md), [BEH-BR-124](behaviors/14-children-and-groups.md), [BEH-BR-133](behaviors/15-optional-and-reactive.md), [ADR-BR-004](decisions/004-replace-is-stop-then-start.md), [ADR-BR-015](decisions/015-leases-one-primitive.md), [ADR-BR-017](decisions/017-runtime-failure-one-transition.md), [ADR-BR-021](decisions/021-children-and-groups.md).

---

## INV-BR-006: A leased provider does not close under its lease

While a lease admitted on a provider is held, that provider's activation
scope does not begin to close; it closes only after every lease has ended or
been revoked and the revoked callbacks' finalizers have run.

**Source**: `packages/core/src/Lease.ts` *(Planned)* — one scoped-lease
primitive: admission only while the provider is `active` and not hidden by a
removal or failing, a per-activation holder count, and a drain that waits for
the count to reach zero or, under `force` or a path with no caller, revokes
the remaining callbacks and awaits their finalizers.
`packages/core/src/Lifecycle.ts` *(Planned)* closes a scope only after that
drain. `packages/core/src/ContributionRegistry.ts` *(Planned)* and
`packages/core/src/Generation.ts` *(Planned)* use the same primitive; an
interception wraps the service but leases the provider.

**Implication**: a provider is never closed in the middle of a call that
leased it ([RSK-BR-001](gxp/03-risk-assessment.md#rsk-br-001)). A revoked
caller fails with `LeaseRevoked` after its finalizers have run, never with a
closed resource. A reference that escapes its lease (`Runtime.optional`,
`ContributionRegistry.get`, a value read out of a `Generation`) is not covered
and is never described as protected.

**Verification** *(Planned)*: a property test on the test host with
`Fault.holdLease`, asserting that no provider scope's first finalizer starts
while a lease on it is held; scenarios for forced revocation, runtime failure
at the drain limit and the overall shutdown limit, asserting `LeaseRevoked`
and finalizer order; the same property for registry contributions and
generation values.

**Related**: [BEH-BR-042](behaviors/06-removal.md), [BEH-BR-043](behaviors/06-removal.md), [BEH-BR-076](behaviors/08-operation-legality.md), [BEH-BR-081](behaviors/09-leases.md), [BEH-BR-082](behaviors/09-leases.md), [BEH-BR-086](behaviors/09-leases.md), [BEH-BR-094](behaviors/10-runtime-failure-and-health.md), [BEH-BR-131](behaviors/15-optional-and-reactive.md), [BEH-BR-133](behaviors/15-optional-and-reactive.md), [BEH-BR-152](behaviors/17-realms-and-interception.md), [BEH-BR-166](behaviors/19-contribution-registry.md), [BEH-BR-172](behaviors/20-generation.md), [BEH-BR-176](behaviors/20-generation.md), [ADR-BR-015](decisions/015-leases-one-primitive.md), [ADR-BR-017](decisions/017-runtime-failure-one-transition.md), [ADR-BR-024](decisions/024-shared-state-helpers.md).

---

## INV-BR-007: Failure is sticky

A `failed` plugin holds no live activation scope, publishes nothing, and
leaves `failed` only through an explicit `retry`, `restart`, `replace`,
`reconfigure`, `disable` or `remove` — with phase "cleanup", only `remove` —
and the host never retries it on its own.

**Source**: `packages/core/src/Lifecycle.ts` *(Planned)* — the transition
function has no edge out of `failed` other than those operations, and
dependency loss changes only `starting` and `active` plugins.
`packages/core/src/Host.ts` *(Planned)* schedules nothing against a failed
plugin: no timer, no retry policy, no reaction to its requirements
disappearing and returning. A background fiber's "restart" policy restarts
that fiber only.

**Implication**: a build or runtime failure is never silently repeated, so a
side effect a failed build performed is not performed again behind the
operator's back ([RSK-BR-003](gxp/03-risk-assessment.md#rsk-br-003)), and a
plugin that failed at runtime stays visibly failed rather than flapping
([RSK-BR-016](gxp/03-risk-assessment.md#rsk-br-016)). Confluence is allowed
to break on exactly this exception rather than be restored by retrying.

**Verification** *(Planned)*: a property test over generated sequences in
which a failed plugin's providers appear, disappear and return, asserting the
plugin stays `failed` with no live scope; scenarios for each failure phase
leaving `failed` through each permitted operation, and for `failed(cleanup)`
refusing every operation except `remove`.

**Related**: [BEH-BR-021](behaviors/03-installation.md), [BEH-BR-024](behaviors/03-installation.md), [BEH-BR-031](behaviors/04-states-and-snapshots.md), [BEH-BR-046](behaviors/06-removal.md), [BEH-BR-053](behaviors/07-replacement-and-reactivation.md), [BEH-BR-055](behaviors/07-replacement-and-reactivation.md), [BEH-BR-056](behaviors/07-replacement-and-reactivation.md), [BEH-BR-071](behaviors/08-operation-legality.md), [BEH-BR-073](behaviors/08-operation-legality.md), [BEH-BR-096](behaviors/10-runtime-failure-and-health.md), [BEH-BR-160](behaviors/18-reconciliation-and-confluence.md), [ADR-BR-005](decisions/005-failure-is-sticky.md), [ADR-BR-014](decisions/014-discriminated-plugin-snapshot.md), [ADR-BR-017](decisions/017-runtime-failure-one-transition.md).

---

## INV-BR-008: Snapshot revisions never regress

Each applied state change produces exactly one snapshot whose `revision` is
greater than every earlier revision of the same host, and no subscriber ever
receives a lower revision after a higher one.

**Source**: `packages/core/src/Snapshot.ts` *(Planned)* — one
`SubscriptionRef<HostSnapshot>` per host, written only from the host's single
state-update section, which increments `revision` in the same update as the
change it describes; `changes` is that ref's `changes` stream and
`snapshot()` reads the same ref. A change that affects several plugins at
once is one update. `packages/core/src/ContributionRegistry.ts` *(Planned)*
keeps registry view revisions under the same rule.

**Implication**: a reader can compare two revisions and discard the older
view; equal revisions mean equal snapshots; `awaitIdle`'s "first idle
revision at or after the call" is well defined. A slow subscriber may skip
revisions but never goes backwards, so a state feed never shows a plugin
returning to a state it has left.

**Verification** *(Planned)*: a property test over generated operation
sequences with several concurrent subscribers, asserting strictly increasing
revisions per subscriber, equality of snapshots with equal revisions, and
`snapshot()` agreeing with `changes`; the same property for registry views.

**Related**: [BEH-BR-029](behaviors/04-states-and-snapshots.md), [BEH-BR-030](behaviors/04-states-and-snapshots.md), [BEH-BR-165](behaviors/19-contribution-registry.md), [ADR-BR-007](decisions/007-observation-primitives.md), [ADR-BR-014](decisions/014-discriminated-plugin-snapshot.md).

---

## INV-BR-009: At most one transition in flight per plugin

Operations on one plugin — the pair (realm, ID) — are linearized in call
order; the plugin runs at most one transition step (one build, or one stop)
at a time, whether the step serves an operator or the system; and it has at
most one operator operation in flight (BEH-BR-072). A parked stop — a parked
operation or a parked system stop — is the one case of a stop in flight with
no step running: it runs none until a call, a cascade or shutdown resumes it
(BEH-BR-074, BEH-BR-080, BEH-BR-105).

**Source**: `packages/core/src/Host.ts` *(Planned)* — a per-plugin operation
order keyed by (realm, ID), owned by the reconciler, through which every route
passes: `Host` methods, `PluginHandle`, group operations as one unit, and each
`reconcile` entry action. `packages/core/src/Lifecycle.ts` *(Planned)* starts
transition steps only from that order; system transitions (automatic starts,
dependency-loss and runtime-failure stops, child mounts) take the same slot.
An operator call that arrives while a system stop is running waits for it to
settle — before its intent, so the wait is interruptible — and is then decided
against the state the plugin landed in (BEH-BR-073); a call that arrives on a
parked system stop, or whose awaited system stop parks while it waits,
resumes it, or, for `retry` and `enable`, fails with
`Conflict { pending: "dependency-loss" }` (BEH-BR-073, BEH-BR-074). Once
shutdown has begun, no stop parks: shutdown takes over every stop under its
own limits (BEH-BR-105, BEH-BR-107).

**Implication**: two builds, or a build and a stop, of the same plugin never
race, so a plugin's resources are never acquired twice or released while
being acquired. Concurrent operator actions on one plugin resolve to a stated
outcome instead of interleaving
([RSK-BR-019](gxp/03-risk-assessment.md#rsk-br-019)).

**Verification** *(Planned)*: a property test on the test host with many
concurrent callers per plugin, asserting at every step at most one transition
step running and at most one operator operation in flight per plugin, no step
running for a parked stop, and linearization in arrival order; scenarios for
an operator call arriving while a system stop is running, and for each call
arriving on a parked system stop.

**Related**: [BEH-BR-026](behaviors/04-states-and-snapshots.md), [BEH-BR-065](behaviors/08-operation-legality.md), [BEH-BR-072](behaviors/08-operation-legality.md), [BEH-BR-073](behaviors/08-operation-legality.md), [BEH-BR-074](behaviors/08-operation-legality.md), [BEH-BR-080](behaviors/08-operation-legality.md), [BEH-BR-128](behaviors/14-children-and-groups.md), [ADR-BR-012](decisions/012-intent-and-linearization.md), [ADR-BR-013](decisions/013-total-operation-legality.md).

---

## INV-BR-010: Intent survives caller interruption

Once a call's intent is recorded, interrupting the caller ends only the
caller's wait — the transition and its terminal audit record proceed — and
interrupting it before that point leaves the host unchanged, with no record,
one `rejected` record (interrupted while the gate decides), or a `requested`
record answered by one `failed` (`Interrupted`) record.

**Source**: `packages/core/src/Host.ts` *(Planned)* — the passage from the
gate's approval (or from validation, when no gate is wired) to the enqueue of
the `requested` record is uninterruptible; from that enqueue until the intent
is recorded, an interruption runs an interruption finalizer on the call path
that writes a `failed` terminal record (`Interrupted`), which is then the
call's only terminal record, and changes nothing; deciding the outcome at the
linearization point is uninterruptible; the transition then runs in the
reconciler's fibers, and the caller awaits its outcome through a `Deferred`.
`packages/core/src/Audit.ts` *(Planned)* — the terminal record of a call
whose intent was recorded is written by the reconciler, not by the caller.
Core offers no cancel operation; undoing a request is the opposite operation.

**Implication**: an interrupted caller never leaves a half-applied operation —
a plugin stopped but not restarted, a definition swapped but not built — and
never leaves a `requested` record with no outcome after it. Whether a change
happened is decided by the host, not by how long a caller was willing to
wait.

**Verification** *(Planned)*: scenarios on the steppable test host that
interrupt the caller at each step of the call order and at each step of the
transition; a property test asserting that for every interruption point
exactly one of these holds: the host is unchanged with no record; the host is
unchanged with one `rejected` record ("caller-interrupted"); the host is
unchanged with a `requested` record followed by one `failed` (`Interrupted`)
record; or the transition completes and exactly one terminal record follows
the `requested` record. A scenario interrupts a caller whose `requested`
record is still being retried and asserts that no `failed`
(`AuditUnavailable`) record follows the `Interrupted` one (acceptance check
46 of BEH-BR-184).

**Related**: [BEH-BR-066](behaviors/08-operation-legality.md), [BEH-BR-067](behaviors/08-operation-legality.md), [BEH-BR-074](behaviors/08-operation-legality.md), [BEH-BR-101](behaviors/11-configuration.md), [BEH-BR-156](behaviors/18-reconciliation-and-confluence.md), [BEH-BR-188](behaviors/22-attributable-operations.md), [BEH-BR-203](behaviors/23-audit-sink-and-record.md), [BEH-BR-221](behaviors/25-operation-gate.md), [ADR-BR-012](decisions/012-intent-and-linearization.md), [ADR-BR-008](decisions/008-error-taxonomy.md).

---

## INV-BR-011: Every state and operation pair has a defined outcome

For every plugin state (including unknown, `failed` with phase "cleanup", and
a closing host), every operation, and every operation in flight, the call has
exactly one outcome — proceed, no-op, join, supersede, conflict or a named
error — and every route to an operation uses the same tables.

**Source**: `packages/core/src/Lifecycle.ts` *(Planned)* — the state ×
operation table and the in-flight table as total maps, typed so that a
missing cell is a compile error. `packages/core/src/Host.ts` *(Planned)*,
`PluginHandle` and `packages/core/src/Reconcile.ts` *(Planned)* decide every
call through those maps only, at the linearization point.

**Implication**: no combination of state and request falls into behaviour
nobody specified. The gaps the predecessor design left open — `restart` of a
`starting` plugin, `remove` of a plugin whose cleanup failed, `retry` during a
stop — each have one written answer, and a handle, an adapter and `reconcile`
cannot disagree with the `Host` about it.

**Verification** *(Planned)*: a type-level check that both tables are total
over their key unions; one scenario per cell of each table, as the acceptance
checks of the core require; a property test asserting that the same operation
issued through `Host`, `PluginHandle` and `reconcile` has the same outcome.

**Related**: [BEH-BR-047](behaviors/06-removal.md), [BEH-BR-069](behaviors/08-operation-legality.md), [BEH-BR-071](behaviors/08-operation-legality.md), [BEH-BR-072](behaviors/08-operation-legality.md), [BEH-BR-077](behaviors/08-operation-legality.md), [BEH-BR-109](behaviors/12-shutdown-and-hosting.md), [ADR-BR-013](decisions/013-total-operation-legality.md), [ADR-BR-005](decisions/005-failure-is-sticky.md), [ADR-BR-026](decisions/026-deterministic-test-host.md).

---

## INV-BR-012: A definition error registers nothing

An `install` or `replace` that fails with an `InstallError` or `ReplaceError`
leaves no trace in the host: no snapshot entry, no revision increment, no
reserved provider slot, no stored override and no event. It leaves no audit
record when the failure is decided before the gate (BEH-BR-188 step 4); a
definition re-validation failure at intent is recorded `failed`, because a
`requested` record already exists by then.

**Source**: `packages/core/src/Plugin.ts` *(Planned)* — definition rules
checked as a pure function of the definition.
`packages/core/src/Host.ts` *(Planned)* — the realm, definition, duplicate,
provider and cycle checks run before the gate and before any record or state
update, and again at the linearization point; a failure returns before the
single state update, so there is nothing to undo. `replace` checks the new
definition before anything about the old plugin stops.

**Implication**: a rejected install never leaves a half-registered plugin
holding a provider slot or an id, which would make the corrected retry fail
with `DuplicatePlugin` or `DuplicateProvider`; a rejected replace never stops
a working plugin to make room for a definition that cannot run.

**Verification** *(Planned)*: a property test over generated invalid
definitions asserting the snapshot and revision before and after the call are
equal and that no event or record was produced; a scenario in which the
installed set changes between validation and intent, asserting the call
changes nothing and ends with a `failed` terminal record; one scenario per
`InstallError` variant, and one for `replace` with an invalid definition
leaving the old plugin `active`.

**Related**: [BEH-BR-003](behaviors/01-plugin-definition.md), [BEH-BR-018](behaviors/03-installation.md), [BEH-BR-050](behaviors/07-replacement-and-reactivation.md), [BEH-BR-070](behaviors/08-operation-legality.md), [ADR-BR-008](decisions/008-error-taxonomy.md), [ADR-BR-004](decisions/004-replace-is-stop-then-start.md), [ADR-BR-006](decisions/006-one-instance-per-id-per-realm.md).

---

## INV-BR-013: Configuration values are never observable

No configuration value — raw, decoded, override or source, secret or not —
appears in a snapshot, host event, log, span, metric, error value, `inspect`
result, audit record or `OperationRequest`.

**Source**: `packages/core/src/Config.ts` *(Planned)* — the decoded value is
delivered only as the activation's `Plugin.Config` service; the only
derivative that leaves the module is a list of changed field paths, and
`ConfigInvalid.message` is formatted from issue paths and expected forms
alone. `packages/core/src/Snapshot.ts`, `packages/core/src/Events.ts` and
`packages/core/src/Audit.ts` *(all Planned)* define their types with no field
that can hold a configuration value.

**Implication**: a secret supplied through configuration cannot leak through
the library's own diagnostics, errors or records
([RSK-BR-008](gxp/03-risk-assessment.md#rsk-br-008)). Redaction is not relied
upon: a redacted value is still withheld, because a redaction that fails open
is invisible until it has leaked.

**Verification** *(Planned)*: a property test that supplies configurations
containing sentinel strings (in plain and `Redacted` fields), drives every
operation including decode failures, and scans every observable output for
the sentinels; a type-level check that the snapshot, event, error,
`AuditRecord` and `OperationRequest` types carry no configuration value.

**Related**: [BEH-BR-028](behaviors/04-states-and-snapshots.md), [BEH-BR-103](behaviors/11-configuration.md), [BEH-BR-118](behaviors/13-observability-and-diagnostics.md), [BEH-BR-192](behaviors/22-attributable-operations.md), [BEH-BR-197](behaviors/23-audit-sink-and-record.md), [BEH-BR-219](behaviors/25-operation-gate.md), [ADR-BR-018](decisions/018-configuration-decoded-before-build.md), [ADR-BR-033](decisions/033-no-config-values-in-audit.md), [ADR-BR-008](decisions/008-error-taxonomy.md).

---

## INV-BR-014: Every activation gets a fresh scope and memo map

Every activation builds its Layer with a memo map created for that activation
alone, in a scope forked from the host scope for that activation alone.

**Source**: `packages/core/src/Lifecycle.ts` *(Planned)* — each activation
runs `Layer.buildWithMemoMap(build, memoMap, activationScope)` with
`memoMap` from `Layer.makeMemoMap` and `activationScope` from
`Scope.fork(hostScope, "sequential")`, and supplies exactly the captured
provider services, that activation's `Plugin.Runtime` and its
`Plugin.Config`.

**Implication**: `restart`, `retry`, `reconfigure` and `replace` acquire
resources again instead of receiving memoized values whose scope has already
closed, and one plugin's resources never live in, or are released with,
another plugin's scope. Stopping one activation releases exactly what it
acquired.

**Verification** *(Planned)*: scenarios in which a layer counts its
acquisitions, asserting one acquisition per activation across `restart` and
`retry` and none shared between plugins; a property test asserting that
closing one activation runs exactly that activation's finalizers.

**Related**: [BEH-BR-036](behaviors/05-activation.md), [BEH-BR-058](behaviors/07-replacement-and-reactivation.md), [BEH-BR-099](behaviors/11-configuration.md), [ADR-BR-002](decisions/002-plugin-build-is-a-layer.md), [ADR-BR-001](decisions/001-effect-v4-as-effect-system.md), [ADR-BR-021](decisions/021-children-and-groups.md).

---

## INV-BR-015: Key identity is checked by identifier and by object

Service keys are matched by `ServiceId`, and when a required key and the key
its provider supplies share a `ServiceId` but are different objects, the
activation fails with `KeyMismatch` before `build` runs.

**Source**: `packages/core/src/Resolver.ts` *(Planned)* — the provider table
is keyed by `ServiceId` and stores the key object each provider declared;
capture compares the consumer's key object with that stored object by
reference. `packages/core/src/Plugin.ts` *(Planned)* keeps the declared key
objects in the definition. No shape comparison or coercion is performed.

**Implication**: two copies of a package — typically after dynamic loading —
whose keys share an identifier but whose service shapes may differ cannot be
silently wired together
([RSK-BR-010](gxp/03-risk-assessment.md#rsk-br-010)). The mismatch surfaces
as a `failed` plugin with phase "activation" and a named key, instead of as a
call on the wrong shape at some later time.

**Verification** *(Planned)*: scenarios with two distinct key objects for one
`ServiceId` (provider plugin and base), asserting `KeyMismatch` and that
`build` never ran; a property test asserting that activation succeeds
whenever every required key is the very object its provider declared.

**Related**: [BEH-BR-006](behaviors/01-plugin-definition.md), [BEH-BR-038](behaviors/05-activation.md), [ADR-BR-011](decisions/011-serviceid-is-key-identity.md).

---

## INV-BR-016: A re-entrant wait fails fast

A call that would wait for a transition step of plugin P — P's drain, its
build or its stop — made from a fiber that carries P in
`@bridger/core/HeldPlugins`, fails immediately with `WouldDeadlock` without
recording intent.

**Source**: `packages/core/src/Lease.ts` *(Planned)* — admitting a lease adds
the provider's ID to the `HeldPlugins` fiber reference of the callback's
fiber, inherited by every fiber it forks, by `useOptional` callbacks and
`whenAvailable` runs. `packages/core/src/Lifecycle.ts` *(Planned)* runs each
build of P, and each finalizer of P's activation scope, in a fiber that
carries P in the same reference, and so does every fiber that build or
finalizer forks and awaits before returning. Fibers forked into the
activation scope (`background`, `whenAvailable`) carry only the leases they
hold, not P. `packages/core/src/EventBus.ts` *(Planned)*
dispatches listeners in the dispatcher's fiber context, so the reference
follows the call. `packages/core/src/Host.ts` *(Planned)* checks the
reference for `remove`, `replace`, `restart`, `disable`, `reconfigure` of P
or of a provider whose stopping would first stop P, and for `retry` and
`enable` of P while a system stop of P is running, at step 7 of the call
order (BEH-BR-188): before the call waits for anything, and again at the
linearization point before the intent, where a join — and so a wait for the
joined operation's step — first becomes known. Both checks follow the
`requested` record and precede the intent, so that a refused call changes
nothing and, with a sink wired, ends with a `failed` terminal record. For
`awaitIdle`, which is not a mutating call, it checks the reference when the
call is made.

**Implication**: a lease callback, a build or a finalizer that asks the host
to stop the plugin it belongs to or is using fails at once instead of waiting
for its own step or lease to end. The check follows the carried reference
only: a request relayed through a fiber that does not inherit it is not
detected, and this invariant does not claim it is
([RSK-BR-011](gxp/03-risk-assessment.md#rsk-br-011)).

**Verification** *(Planned)*: one scenario per guarded operation and for
`awaitIdle` from a lease callback, a forked fiber, a `whenAvailable` run, an
event listener, a build, a fiber a build forks and awaits, and a finalizer of
the activation scope (acceptance check 48 of BEH-BR-184); a scenario in which
the join that would make the call wait is known only at the linearization
point; with a sink wired, a scenario asserting that a mutating call refused
with `WouldDeadlock` leaves exactly one `requested` and one `failed` record
and an unchanged snapshot; a scenario pinning the stated limit, in which the
request is relayed through an unrelated fiber and is not detected.

**Related**: [BEH-BR-040](behaviors/05-activation.md), [BEH-BR-078](behaviors/08-operation-legality.md), [BEH-BR-088](behaviors/09-leases.md), [BEH-BR-136](behaviors/15-optional-and-reactive.md), [BEH-BR-144](behaviors/16-event-bus.md), [BEH-BR-188](behaviors/22-attributable-operations.md), [ADR-BR-016](decisions/016-reentrancy-detection.md).

---

## INV-BR-017: Every drain is bounded unless declared forever

Every wait for leases or holders to end — on a stopping plugin, on runtime
failure, at shutdown, on a registry contribution and on a retired generation
value — has a finite limit unless the caller declared `"forever"` explicitly.

**Source**: `packages/core/src/Lease.ts` *(Planned)* — every drain takes a
`Duration | "forever"` limit measured with `Clock`, defaulting to
`BridgerOptions.drainTimeout` (30 seconds); no default is unbounded. On
expiry without `force`, the outcome depends on whether an operator call is at
the root of the path. On a path rooted in an operator call — the call's own
stop, or a cascade whose root is that call — the call under whose options the
drain ran fails with `DrainTimeout`, and every stop it drives that has not
settled — its own stop and every dependency-loss stop it started, at any
depth — parks in the same revision, leaving those plugins `stopping`
(BEH-BR-074, BEH-BR-079, BEH-BR-080); a dependent's stop parked this way is a
parked system stop (`reason` "dependency-loss"). The cascading call's drain
limit also runs while it waits for a dependent's running build step, and
expires as `DrainTimeout` with `leases` 0. A path with no caller — a runtime
failure, a cascade whose root is a runtime failure, or a dependency-loss stop
with no operator call at its root — never parks: it revokes the remaining
leases, including those on dependents (BEH-BR-086, BEH-BR-095), and an expiry
while it waits for a build continues the wait under `buildTimeout`. Shutdown,
whose limits are in `packages/core/src/Host.ts` *(Planned)*, never parks
either: once it has begun, no drain expiry parks a stop; shutdown takes the
stop over, drains under `drainTimeout` and revokes only once its overall limit
has passed (BEH-BR-105, BEH-BR-107). A parked stop met by a path with no
caller, or by shutdown, is resumed under those limits and revoked on
expiry. `packages/core/src/ContributionRegistry.ts` and
`packages/core/src/Generation.ts` *(both Planned)* apply the same rule.

**Implication**: a lease that is never released cannot hang an operator call,
a runtime-failure transition, a cascade or shutdown indefinitely. An unbounded
wait is a visible decision in the caller's code, not an accident of a
default.

**Verification** *(Planned)*: a type-level check that drain options admit only
a duration or the literal `"forever"`; scenarios on the test host with
`Fault.holdLease` and `TestClock` advanced past each limit, asserting
`DrainTimeout` with the held count, the plugin left `stopping` and parked on
operator-rooted paths, including a cascade whose dependent's stop becomes a
parked system stop; and revocation on every path with no caller, including a
runtime-failure cascade and a parked stop it meets (acceptance check 47 of
BEH-BR-184).

**Related**: [BEH-BR-045](behaviors/06-removal.md), [BEH-BR-074](behaviors/08-operation-legality.md), [BEH-BR-079](behaviors/08-operation-legality.md), [BEH-BR-080](behaviors/08-operation-legality.md), [BEH-BR-085](behaviors/09-leases.md), [BEH-BR-086](behaviors/09-leases.md), [BEH-BR-095](behaviors/10-runtime-failure-and-health.md), [BEH-BR-105](behaviors/12-shutdown-and-hosting.md), [BEH-BR-107](behaviors/12-shutdown-and-hosting.md), [BEH-BR-167](behaviors/19-contribution-registry.md), [BEH-BR-173](behaviors/20-generation.md), [BEH-BR-174](behaviors/20-generation.md), [BEH-BR-176](behaviors/20-generation.md), [ADR-BR-015](decisions/015-leases-one-primitive.md), [ADR-BR-017](decisions/017-runtime-failure-one-transition.md), [ADR-BR-024](decisions/024-shared-state-helpers.md).

---

## INV-BR-018: Shutdown reports every failure

Every cleanup failure and every drain that overran its limit during shutdown,
and every plugin already `failed` with phase "cleanup" when shutdown began,
appears in the `CloseReport`.

**Source**: `packages/core/src/Host.ts` *(Planned)* — `shutdown` collects the
outcome of every plugin's stop into `CloseReport.failed` (with `cause`
"cleanup" or "drain") and `CloseReport.forced`, and sets
`CloseReport.auditDegraded` from the latch; the scope-close path builds the
same report, passes it to `BridgerOptions.onClose` and logs each failure at
error level. `packages/core/src/Lifecycle.ts` *(Planned)* never abandons a
running finalizer to meet the limit.

**Implication**: a resource that failed to release during shutdown is never
silent ([RSK-BR-009](gxp/03-risk-assessment.md#rsk-br-009)), including on the
scope-close path where no caller receives a return value. A leak already
known before shutdown is reported again rather than assumed resolved.

**Verification** *(Planned)*: scenarios with `Fault.stopFails` and
`Fault.holdLease` on several plugins, asserting each appears in `failed` with
the right `cause`; a property test asserting the number of `failed` entries
equals the number of injected cleanup and drain failures, on both the
explicit and the scope-close path.

**Related**: [BEH-BR-075](behaviors/08-operation-legality.md), [BEH-BR-106](behaviors/12-shutdown-and-hosting.md), [BEH-BR-108](behaviors/12-shutdown-and-hosting.md), [ADR-BR-009](decisions/009-managedruntime-hosting.md), [ADR-BR-005](decisions/005-failure-is-sticky.md).

---

## INV-BR-019: Optional dependencies never gate activation

A key listed in `optional` never keeps a plugin from activating, never
appears in `missingServiceIds`, takes no part in cycle detection or start
ordering, and its provider leaving never changes the state of the plugin that
lists it.

**Source**: `packages/core/src/Resolver.ts` *(Planned)* — optional keys are
excluded from the requirement set and from the resolved-edge graph.
`packages/core/src/Lifecycle.ts` *(Planned)* — `whenAvailable` runs live in
child scopes of the activation whose start, completion and interruption do
not touch the plugin's own state; `Runtime.optional` is a point-in-time read.
`packages/core/src/Plugin.ts` *(Planned)* rejects a key listed in both
`requires` and `optional`.

**Implication**: an optional integration cannot leave a plugin `waiting`,
`failed` or restarting. A plugin that uses another when present keeps running
when it is absent, which is the whole point of declaring it optional.

**Verification** *(Planned)*: a property test over generated graphs with
optional edges, asserting the plugin's state sequence is the same with the
optional provider present, absent or flapping; scenarios for `whenAvailable`
interruption leaving the plugin `active`, and for `InvalidDefinition` on a
key that is both required and optional.

**Related**: [BEH-BR-129](behaviors/15-optional-and-reactive.md), [BEH-BR-130](behaviors/15-optional-and-reactive.md), [BEH-BR-132](behaviors/15-optional-and-reactive.md), [ADR-BR-022](decisions/022-optional-and-reactive-dependencies.md), [ADR-BR-010](decisions/010-cordis-parity.md).

---

## INV-BR-020: A realm changes resolution only

A realm changes which provider a key resolves to, and nothing else: plugins
in different realms share one process, one host scope, one event bus and one
heap.

**Source**: `packages/core/src/Realm.ts` *(Planned)* — a realm is a fixed
record of its id, isolated keys and interceptors, consulted only by
`scopeOf` in `packages/core/src/Resolver.ts` *(Planned)*. No other module
branches on a realm except to form the plugin identity (id, realm). No type,
error or event calls a realm isolation, sandboxing, tenancy enforcement or
access control.

**Implication**: nobody is led to rely on a realm to contain untrusted or
tenant-separated code ([RSK-BR-013](gxp/03-risk-assessment.md#rsk-br-013)). A
plugin in one realm can still reach another realm's objects through the
event bus, a shared module or the heap, and the specification says so rather
than implying a boundary that does not exist.

**Verification** *(Planned)*: scenarios showing a key isolated in a realm
never resolves outside it, and showing that plugins in two realms exchange
events and share base services; a documentation check that the API reference
and guides do not describe realms as a security boundary.

**Related**: [BEH-BR-145](behaviors/17-realms-and-interception.md), [BEH-BR-146](behaviors/17-realms-and-interception.md), [BEH-BR-150](behaviors/17-realms-and-interception.md), [ADR-BR-019](decisions/019-realms-are-resolution-namespaces.md), [ADR-BR-027](decisions/027-core-exclusions.md).

---

## INV-BR-021: Reconcile is idempotent

Running `reconcile(D, o)` again after it has completed issues no action, and
once the host is idle the plugins owned by `o.scope` depend only on `D`, not on
the edit history that led there.

**Source**: `packages/core/src/Reconcile.ts` *(Planned)* — a keyed diff by
(id, realm) between `D` and the plugins owned by `o.scope`, an ownership map
per scope, definition sameness decided by object identity or by equal
`meta.version` and `meta.digest`, and overrides compared structurally; each
derived action is issued as an ordinary operation through
`packages/core/src/Host.ts` *(Planned)*. Plugins the scope does not own are
never acted on.

**Implication**: a control loop can re-apply the same desired list on every
tick without restarting anything or repeating any side effect. The only
permitted divergence is a plugin that failed, which reconcile does not retry
([INV-BR-007](#inv-br-007-failure-is-sticky)).

**Verification** *(Planned)*: a property test over generated desired lists
and edit histories, asserting that a second run reports every entry
`unchanged` and that the owned set after idle depends only on `D`; a scenario
asserting that, with a sink wired, the second run still writes its parent
pair, the terminal record carrying `noop: true` and `children: 0`.

**Related**: [BEH-BR-154](behaviors/18-reconciliation-and-confluence.md), [BEH-BR-155](behaviors/18-reconciliation-and-confluence.md), [BEH-BR-159](behaviors/18-reconciliation-and-confluence.md), [BEH-BR-160](behaviors/18-reconciliation-and-confluence.md), [BEH-BR-201](behaviors/23-audit-sink-and-record.md), [ADR-BR-023](decisions/023-desired-state-reconcile.md), [ADR-BR-010](decisions/010-cordis-parity.md).

---

## INV-BR-022: One requested and one terminal record per mutating call

Every mutating call that passes attribution, latch and gate checks produces
exactly one `requested` and one terminal record. A call refused at the gate
produces exactly one `rejected` record and no `requested` record. A call
refused for attribution or by the latch produces no record.

This holds when an `AuditSink` is wired; with none, no call produces a record
([INV-BR-026](#inv-br-026-an-unwired-sink-or-gate-changes-nothing)). A call
that fails `HostClosed` or validation — checks that precede the gate — also
produces no record, and so does a call whose `requested` record is dropped
because the writer's queue is full: it fails at once with `AuditUnavailable`,
and the latch and the drop count record the loss (BEH-BR-202). The terminal
record is one of `completed`, `failed`, `superseded` or `joined`, and a no-op
is recorded as `completed` with `noop: true`. `reconcile` produces one such
pair for the call and one pair (or one `rejected` record) per entry action.
`shutdown` is not gated; its `requested` record is attempted, and when it
cannot be written shutdown proceeds and the latch is set
([INV-BR-029](#inv-br-029-the-audit-degraded-latch-blocks-operator-mutations)).

**Source**: `packages/core/src/Host.ts` *(Planned)* — the fixed call pipeline
(`HostClosed`, attribution, latch, validation, gate, `requested` record,
intent). `packages/core/src/OperationGate.ts` *(Planned)* creates the
`rejected` record on refusal. `packages/core/src/Audit.ts` *(Planned)* creates
the `requested` record before intent and the terminal record from the
reconciler once the outcome is known, after every system record the
transition produced, so neither caller interruption nor a failed transition
can skip it; for a call interrupted before its intent, the call path's
interruption finalizer creates the `failed` (`Interrupted`) record instead
(BEH-BR-188). The first terminal cause wins, so no call receives a second
terminal record (BEH-BR-198).

**Implication**: every lifecycle change an operator requested is bracketed in
the trail by its request and its outcome
([RSK-BR-004](gxp/03-risk-assessment.md#rsk-br-004)), and a request with no
outcome, or an outcome with no request, signals a defect rather than a normal
case ([RSK-BR-006](gxp/03-risk-assessment.md#rsk-br-006)). A refusal is
recorded as a refusal, never as a request that was later abandoned.

**Verification** *(Planned)*: a property test on the test host with the
in-memory sink fixture over generated operation sequences (each generated
call with its own `correlationId`), refusals and caller interruptions,
pairing each `requested` record with the terminal record of the same call —
the record of that call's `correlationId`, `operation` and `target` that
follows it; a `joined` record, which carries the joined operation's
`correlationId`, is linked to its call as BEH-BR-200 states — and asserting
exactly one terminal record for every call that passed step 6 of BEH-BR-188,
exactly one `rejected` record for gate refusals and none for attribution,
latch, `HostClosed` or validation failures, or for a call whose `requested`
record was dropped for overflow; scenarios for join, supersession, no-op,
`reconcile` and `shutdown`; for a resumption of a parked operation, whose
caller's terminal record carries `resumes` and the parked call receives no
further record; for a caller interrupted before its intent (`failed`,
`Interrupted`); and for an interruption while the `requested` record is being
retried, where `Interrupted` is the only terminal record and no
`AuditUnavailable` record follows.

**Related**: [BEH-BR-158](behaviors/18-reconciliation-and-confluence.md), [BEH-BR-188](behaviors/22-attributable-operations.md), [BEH-BR-190](behaviors/22-attributable-operations.md), [BEH-BR-195](behaviors/23-audit-sink-and-record.md), [BEH-BR-196](behaviors/23-audit-sink-and-record.md), [BEH-BR-198](behaviors/23-audit-sink-and-record.md), [BEH-BR-199](behaviors/23-audit-sink-and-record.md), [BEH-BR-200](behaviors/23-audit-sink-and-record.md), [BEH-BR-201](behaviors/23-audit-sink-and-record.md), [BEH-BR-218](behaviors/25-operation-gate.md), [BEH-BR-220](behaviors/25-operation-gate.md), [ADR-BR-030](decisions/030-audit-sink-port.md), [ADR-BR-031](decisions/031-audit-failure-policy.md), [ADR-BR-012](decisions/012-intent-and-linearization.md), [ADR-BR-023](decisions/023-desired-state-reconcile.md), [ADR-BR-028](decisions/028-gxp-scope.md).

---

## INV-BR-023: The audit sequence is contiguous per host

The `auditSeq` values a host hands to its sink start at 1 and run 1, 2, 3, …
with no gap, each number belonging to exactly one record for the life of the
host.

**Source**: `packages/core/src/AuditSequence.ts` *(Planned)* — a counter
owned by the host's single audit writer in `packages/core/src/Audit.ts`
*(Planned)*, assigned at the serialization point immediately before a
record's first write attempt. A failed or timed-out write is retried with the
same record — same `recordId`, same `auditSeq` — before any other record is
handed over, so a failed write does not consume its number. The counter is
independent of the event `seq` and of `HostSnapshot.revision`, and a new host
starts again at 1 with a new `hostId`.

**Implication**: a reviewer can order records by `auditSeq` rather than by a
wall clock that may step ([RSK-BR-021](gxp/03-risk-assessment.md#rsk-br-021)),
and a missing number between two present ones reveals a lost record
([RSK-BR-006](gxp/03-risk-assessment.md#rsk-br-006)). The guarantee has stated
limits: a record dropped for writer overflow, or left unwritten when the
process ends, was never numbered and leaves no gap; those losses are signalled
by the latch, the error log and `CloseReport.auditDegraded`.
`verifyAuditSequence` detects gaps, duplicates and disorder only — it is not
tamper evidence, and records altered, renumbered consistently or removed from
the end of the trail pass it.

**Verification** *(Planned)*: a property test with a sink fixture that fails
and times out on a generated schedule, asserting the sequence of distinct
`auditSeq` values handed over is 1…n in order and that every retry repeats
the same `recordId`; a property test of `verifyAuditSequence` over generated
traces with injected gaps, duplicates and reorderings, and over a traced
alteration it must not detect.

**Related**: [BEH-BR-202](behaviors/23-audit-sink-and-record.md), [BEH-BR-212](behaviors/24-time-ids-and-sequence.md), [BEH-BR-213](behaviors/24-time-ids-and-sequence.md), [BEH-BR-214](behaviors/24-time-ids-and-sequence.md), [BEH-BR-215](behaviors/24-time-ids-and-sequence.md), [ADR-BR-037](decisions/037-audit-sequence-separate-from-event-seq.md), [ADR-BR-030](decisions/030-audit-sink-port.md), [ADR-BR-025](decisions/025-deterministic-time-and-ids.md).

---

## INV-BR-024: Time and identifiers come only from services

Every time core reads comes from Effect's `Clock`, and every identifier core
creates comes from the `IdGenerator` service.

**Source**: `packages/core/src/IdGenerator.ts` *(Planned)* — the
`@bridger/core/IdGenerator` service, read with `Effect.serviceOption` at
construction, with a default backed by `crypto.randomUUID`, the one recorded
exemption. `packages/core/src/Host.ts` *(Planned)* draws the `hostId`, every
`recordId` and every generated `correlationId` from it, and reads every
timestamp, duration, timeout and schedule from `Clock`; ordering counters
(`revision`, event `seq`, `auditSeq`, registry revisions) are host-owned
deterministic counters. `packages/core/src/testing/TestHost.ts` *(Planned)*
supplies `TestClock` and a counter-backed `IdGenerator`. An automated static
check in the core's build is to reject `Date.now()`, `performance.now()`,
`crypto.randomUUID()`, `crypto.getRandomValues()`, `Math.random()` and
argument-less `new Date()` outside the default `IdGenerator`.

**Implication**: two runs of the same script on the test host produce the
same timestamps, identifiers and records, so a lifecycle — and its audit
trail — can be reproduced exactly
([RSK-BR-007](gxp/03-risk-assessment.md#rsk-br-007)). The static check is a
drift guard against the ordinary form of ambient time and randomness; being
textual, it cannot see an aliased or indexed call, and is not described as
proof.

**Verification** *(Planned)*: the static source check, run in the build; a
scenario running one operation script twice on fresh test hosts and asserting
byte-identical snapshots, events and audit records; a scenario asserting
`AuditRecord.timestamp` follows `TestClock` exactly in ISO-8601 UTC with
milliseconds.

**Related**: [BEH-BR-016](behaviors/02-host-construction.md), [BEH-BR-120](behaviors/13-observability-and-diagnostics.md), [BEH-BR-179](behaviors/21-testing-host.md), [BEH-BR-195](behaviors/23-audit-sink-and-record.md), [BEH-BR-209](behaviors/24-time-ids-and-sequence.md), [BEH-BR-210](behaviors/24-time-ids-and-sequence.md), [BEH-BR-211](behaviors/24-time-ids-and-sequence.md), [ADR-BR-025](decisions/025-deterministic-time-and-ids.md), [ADR-BR-026](decisions/026-deterministic-test-host.md).

---

## INV-BR-025: No mutation proceeds without required attribution

A mutating call whose resolved context does not meet the attribution policy
fails with `Unattributed` or `ReasonRequired` before the latch, the gate or
any record, and changes nothing. The one check made later is a `reconcile`'s:
`requireReason` is applied at step 2 to the diff computed at the call, and
again to the diff recomputed at its intent; when the recomputed diff adds an
operation that needs a reason the call lacks, the call fails with
`ReasonRequired`, a parent `failed` terminal record, and no entry action, so
it still changes nothing. The one exemption is the host-originated
`shutdown` performed when the host scope closes: it is attributed to
`Actor.system` and is not subject to `attribution.require` or
`attribution.requireReason`. An explicit `shutdown()` call is checked.

**Source**: `packages/core/src/Attribution.ts` *(Planned)* — resolves the
call's context (a per-call `options.context` wins over the
`@bridger/core/CurrentActor` reference) and applies the policy: an actor with
a blank `id` always fails; with `attribution.require: true`,
`Actor.unattributed`, `Actor.system` and any `bridger:`-prefixed actor fail;
an operation listed in `attribution.requireReason` fails without a non-blank
`reason`; `acknowledgeAuditDegraded` always requires a non-reserved actor and
a non-blank reason. `packages/core/src/Host.ts` *(Planned)* runs this check
second in the call order, immediately after `HostClosed`, and skips it only
for the scope-close `shutdown`, which it attributes to `Actor.system` with no
reason (otherwise `require` would refuse the reserved actor and the host scope
could not close). For `reconcile`, `requireReason` is applied to the
operations of a provisional diff at step 2, and
`packages/core/src/Reconcile.ts` *(Planned)* applies it again to the diff
recomputed at the intent, before any entry action (BEH-BR-158). Actor identity
is never inferred from a fiber, a plugin id or `ActivePlugin`, and core does
not authenticate.

**Implication**: when a deployment requires attribution, no lifecycle change
is made without an actor and, where demanded, a reason
([RSK-BR-005](gxp/03-risk-assessment.md#rsk-br-005)). Binding that actor to an
authenticated person remains the consumer's job; the defaults change nothing
for a deployment that requires neither.

**Verification** *(Planned)*: a property test over generated contexts,
operations and policies, asserting the call fails at step 2 exactly when the
policy says so, with an unchanged snapshot and no record; scenarios for
per-call override of `CurrentActor`, reserved actors, blank reasons,
`acknowledgeAuditDegraded` with the default policy, and closing the host
scope under `require: true` and `requireReason: ["shutdown"]` (the shutdown
runs, attributed to `Actor.system`) while an explicit `shutdown()` under the
same policy is refused; and a `reconcile` with no reason whose recomputed diff
adds a prune `remove` under `requireReason: ["remove"]`, which fails with
`ReasonRequired`, a `requested` and a `failed` parent record, and no entry
action.

**Related**: [BEH-BR-014](behaviors/02-host-construction.md), [BEH-BR-185](behaviors/22-attributable-operations.md), [BEH-BR-186](behaviors/22-attributable-operations.md), [BEH-BR-187](behaviors/22-attributable-operations.md), [BEH-BR-189](behaviors/22-attributable-operations.md), [BEH-BR-190](behaviors/22-attributable-operations.md), [BEH-BR-108](behaviors/12-shutdown-and-hosting.md), [BEH-BR-158](behaviors/18-reconciliation-and-confluence.md), [BEH-BR-206](behaviors/23-audit-sink-and-record.md), [ADR-BR-029](decisions/029-attributable-mutations.md), [ADR-BR-028](decisions/028-gxp-scope.md).

---

## INV-BR-026: An unwired sink or gate changes nothing

A host constructed with no `AuditSink`, no `OperationGate` and default
`attribution` behaves exactly as files 02–21 specify — the same outcomes,
errors, snapshots and events, with no added waiting — and nothing in it
claims an audit exists.

**Source**: `packages/core/src/Host.ts` *(Planned)* — `AuditSink`,
`OperationGate` and `IdGenerator` are read once, at construction, with
`Effect.serviceOption`, and are not in the requirements of `Bridger.layer` or
`Bridger.make`. With no sink, `packages/core/src/Audit.ts` *(Planned)* creates
no record, `auditTimeout` has no effect and the latch is never set; with no
gate, `packages/core/src/OperationGate.ts` *(Planned)* skips step 5.
`HostSnapshot.audit` is fixed at "wired" or "unwired" for the host's
lifetime. Core exports no gate implementation, not even an allow-all one.

**Implication**: the GxP hooks cost a deployment that does not use them
nothing, so they need no feature flag and cannot regress the lifecycle core.
An unwired host cannot be mistaken for an audited one: no snapshot, event,
log, `CloseReport` or document implies its changes are recorded. A permissive
default gate would have been a control that does nothing while appearing to
be one, so there is none.

**Verification** *(Planned)*: the acceptance scenarios of files 02–21 run on
a host with no ports; a differential property test comparing, for generated
operation scripts, a host with no ports against one wired with the in-memory
sink fixture and a scripted gate that allows every request, asserting equal
outcomes, snapshots and events apart from audit fields; a type-level check
that `Bridger.layer`'s requirements exclude `AuditSink` and `OperationGate`.

**Related**: [BEH-BR-015](behaviors/02-host-construction.md), [BEH-BR-192](behaviors/22-attributable-operations.md), [BEH-BR-193](behaviors/23-audit-sink-and-record.md), [BEH-BR-194](behaviors/23-audit-sink-and-record.md), [BEH-BR-217](behaviors/25-operation-gate.md), [ADR-BR-030](decisions/030-audit-sink-port.md), [ADR-BR-032](decisions/032-operation-gate.md), [ADR-BR-028](decisions/028-gxp-scope.md).

---

## INV-BR-027: A refused or unauditable mutation changes nothing

A mutating call refused for attribution, by the latch, by validation or by
the gate, or whose `requested` record cannot be written within
`auditTimeout`, records no intent and changes no plugin's state, definition,
override or provider slots, and no revision.

**Source**: `packages/core/src/Host.ts` *(Planned)* — the call order of
BEH-BR-188, in which intent is recorded only after every check has passed and
the `requested` record has been written; every check is a pure decision taken
before the single state update. `packages/core/src/OperationGate.ts`
*(Planned)* fails closed: a gate that dies, is interrupted by anything other
than the caller, or exceeds `gateTimeout` is a refusal.
`packages/core/src/Audit.ts` *(Planned)* fails the call with
`AuditUnavailable` when the `requested` record is not written in time, and
follows the eventual write with a `failed` terminal record. For `reconcile`,
an entry whose `requested` record cannot be written stops the call; entries
already applied remain applied and recorded.

**Implication**: a change the gate refused cannot happen anyway through a
side route of the `Host` it guards
([RSK-BR-014](gxp/03-risk-assessment.md#rsk-br-014)), and a change that cannot
be recorded is not made ([RSK-BR-004](gxp/03-risk-assessment.md#rsk-br-004)).
A slow or broken gate denies rather than permits.

**Verification** *(Planned)*: a property test that injects a refusal at each
step of the call order — attribution, latch, validation, scripted gate
refusal, gate defect, gate timeout, sink failure — across every mutating
operation and every route (`Host`, `PluginHandle`, group, `reconcile` entry),
asserting the snapshot and revision are unchanged; scenarios for a caller
interrupted while the gate is deciding.

**Related**: [BEH-BR-014](behaviors/02-host-construction.md), [BEH-BR-066](behaviors/08-operation-legality.md), [BEH-BR-070](behaviors/08-operation-legality.md), [BEH-BR-158](behaviors/18-reconciliation-and-confluence.md), [BEH-BR-188](behaviors/22-attributable-operations.md), [BEH-BR-203](behaviors/23-audit-sink-and-record.md), [BEH-BR-218](behaviors/25-operation-gate.md), [BEH-BR-220](behaviors/25-operation-gate.md), [BEH-BR-221](behaviors/25-operation-gate.md), [BEH-BR-222](behaviors/25-operation-gate.md), [ADR-BR-031](decisions/031-audit-failure-policy.md), [ADR-BR-032](decisions/032-operation-gate.md), [ADR-BR-029](decisions/029-attributable-mutations.md), [ADR-BR-012](decisions/012-intent-and-linearization.md).

---

## INV-BR-028: Audit records carry no configuration values

No `AuditRecord` and no `OperationRequest` contains a configuration value —
raw, decoded, redacted, hashed or summarized — in any field; a configuration
change is described only by `configChange: { paths }`.

**Source**: `packages/core/src/Config.ts` *(Planned)* — for `reconfigure`,
whose value is decoded at the call, computes the paths of the decoded fields
that differ from the configuration in effect; for `install`, whose
`options.config` is not decoded at the call (an override that does not decode
is an activation failure), takes the top-level keys of the raw override
object, never its values. It returns nothing else.
`packages/core/src/Audit.ts` and
`packages/core/src/OperationGate.ts` *(both Planned)* build records and
requests from those paths only, and core-produced `error.message` text is
drawn from errors that themselves carry no value
([INV-BR-013](#inv-br-013-configuration-values-are-never-observable)).

**Implication**: an audit trail is kept long and read widely; a secret that
reached it would be exposed for the trail's whole retention
([RSK-BR-008](gxp/03-risk-assessment.md#rsk-br-008)). Hashing is excluded
too, because a hash of a low-entropy secret can be reversed by guessing.

**Verification** *(Planned)*: a property test supplying configurations
containing sentinel strings in plain and `Redacted` fields through `install`,
`reconfigure` and `reconcile`, asserting no record or request contains a
sentinel or a value derived from it, and that `paths` lists exactly the
changed fields (for `reconfigure`) or exactly the raw override's top-level
keys (for `install`); a type-level check that `AuditRecord` and `OperationRequest`
have no field typed to hold a configuration value.

**Related**: [BEH-BR-022](behaviors/03-installation.md), [BEH-BR-103](behaviors/11-configuration.md), [BEH-BR-197](behaviors/23-audit-sink-and-record.md), [BEH-BR-219](behaviors/25-operation-gate.md), [ADR-BR-033](decisions/033-no-config-values-in-audit.md), [ADR-BR-018](decisions/018-configuration-decoded-before-build.md).

---

## INV-BR-029: The audit-degraded latch blocks operator mutations

Once the audit-degraded latch is set, every mutating call except `shutdown`
and `acknowledgeAuditDegraded` fails with `AuditUnavailable` until an
`acknowledgeAuditDegraded` call succeeds.

**Source**: `packages/core/src/Audit.ts` *(Planned)* — the latch is a host
`Ref` set when a terminal, `rejected` or system record is not written within
`auditTimeout`, when `shutdown`'s `requested` record is not written, and when
a record is dropped for writer overflow; setting it publishes
`HostSnapshot.auditDegraded: true` (`packages/core/src/Snapshot.ts`
*(Planned)*) and emits one `audit-degraded` event
(`packages/core/src/Events.ts` *(Planned)*). `packages/core/src/Host.ts`
*(Planned)* checks it third in the call order. `shutdown` skips the check, so
stopping is never refused; `acknowledgeAuditDegraded` skips it, requires an
attributed actor and a reason, is gated and audited, and clears the latch
only once its own `requested` record — and so every record queued before it
— has been written. The latch never clears itself when the sink recovers.
Reads, leases and system transitions continue while it is set.

**Implication**: after the trail has lost a record, no further operator
change is made unrecorded on top of that loss
([RSK-BR-006](gxp/03-risk-assessment.md#rsk-br-006)); a person must take
attributed note of the loss before changes resume. The change whose record
failed is not undone, and the host does not stop serving: the latch blocks
decisions, not running plugins. A slow sink therefore blocks operator
mutations rather than the host
([RSK-BR-020](gxp/03-risk-assessment.md#rsk-br-020)), and acknowledgement does
not claim that records dropped for overflow were recovered.

**Verification** *(Planned)*: scenarios with a sink fixture that fails a
terminal, a `rejected` and a system record in turn, asserting the latch, the
event, `AuditUnavailable` for every operator mutation, success for
`shutdown`, and continued leases and system transitions; scenarios for
`acknowledgeAuditDegraded` failing while the sink is still down and clearing
the latch once its `requested` record is written; a property test that the
latch never clears without a successful acknowledgement.

**Related**: [BEH-BR-110](behaviors/12-shutdown-and-hosting.md), [BEH-BR-205](behaviors/23-audit-sink-and-record.md), [BEH-BR-206](behaviors/23-audit-sink-and-record.md), [BEH-BR-220](behaviors/25-operation-gate.md), [ADR-BR-031](decisions/031-audit-failure-policy.md).

## INV-BR-030: Host transitions never wait on each other in a cycle

A transition on a plugin waits only for its own transition step, for steps of
plugins that depend on it (through captured services or as children), and for
leases on those plugins; no operation that names a plugin waits for a call on
an unrelated plugin, the serialization of `reconcile` calls and `awaitIdle`
aside.

**Source**: `packages/core/src/Lifecycle.ts` *(Planned)* — one step runner per
plugin; the stop path walks dependents from a provider and, for each, waits
for the dependent's running step before stopping it (BEH-BR-079), and resumes
a parked stop under the cascading call's options, or the no-caller limits
(BEH-BR-080). There is no host-wide operation lock in
`packages/core/src/Host.ts` *(Planned)*; builds capture providers when they
start and wait for no transition of another plugin (a free `concurrency` slot
aside), and stops take no `concurrency` slot and never wait for one
(BEH-BR-078). Each build and each finalizer of an activation scope runs with
its plugin's ID in `HeldPlugins`, and so does every fiber it forks and awaits
before returning. The child-install cycle check is in
`packages/core/src/PluginRuntime.ts` *(Planned)*.

**Implication**: the wait-for relation between host transitions follows the
edges of a graph that is acyclic
([INV-BR-002](#inv-br-002-the-dependency-graph-is-acyclic-per-resolution-scope),
whose graph includes child→parent mount edges), so host transitions cannot
deadlock among themselves. A cycle can be closed only by code that runs inside
a lease, a build or a finalizer and calls the host. The carried reference
catches such a call within the fiber tree, which fails fast with
`WouldDeadlock` ([INV-BR-016](#inv-br-016-a-re-entrant-wait-fails-fast)); a
hand-off to another fiber remains the residual of
[RSK-BR-011](gxp/03-risk-assessment.md#rsk-br-011), bounded by the drain
limits
([INV-BR-017](#inv-br-017-every-drain-is-bounded-unless-declared-forever)) and
`buildTimeout`.

**Verification** *(Planned)*: a property test over random operation histories
on random acyclic graphs, with leases held and released at random points and
re-entrant calls issued from leases, builds and finalizers, asserting that no
wait-for cycle forms among host fibers and that, with finite drain limits,
finite `buildTimeout` and finalizers that return, every call returns within
its bound: for a cascading call, its own drain limit for the plugin it named
and for each plugin on the dependency path below it, plus `buildTimeout` for
each build step it waits for (BEH-BR-079). Finalizer running time is not
bounded by the core (BEH-BR-107), so the bound is asserted only for
finalizers that return. Scenarios for acceptance checks 43–45 and 48 of
BEH-BR-184.

**Related**: [BEH-BR-040](behaviors/05-activation.md), [BEH-BR-078](behaviors/08-operation-legality.md), [BEH-BR-079](behaviors/08-operation-legality.md), [BEH-BR-080](behaviors/08-operation-legality.md), [BEH-BR-088](behaviors/09-leases.md), [BEH-BR-107](behaviors/12-shutdown-and-hosting.md), [BEH-BR-121](behaviors/14-children-and-groups.md), [ADR-BR-016](decisions/016-reentrancy-detection.md), [ADR-BR-038](decisions/038-cross-plugin-stop-ordering.md).
