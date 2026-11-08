# 20 — Generation

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-BEH-20                                               |
> | Revision       | 0.3                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.3 (2026-11-08): `changes` feed of published revisions and the read-only `GenerationView` for non-owners (CCR-BR-022)<br>0.2 (2026-10-02): A forced drain revokes an `acquire` lease by interrupting the acquiring fiber, as host leases are revoked (prototype finding G26) (CCR-BR-011)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001)                 |

---

Some hosts must switch *several* behaviours at once and must not let an old
call mix with the new state. An ERP's active model registry is the standing
example: validators from one version must not run against storage mappings
from another. A per-plugin `provides` cannot express that, because each plugin
publishes on its own. `Generation` is the helper for it: one immutable value,
published atomically, with admission control and bounded draining of the
values it replaces. This file converts SPEC.md "Generations: atomic
publication and admission control". This file owns BEH-BR-169–176 and uses
all eight.

Planned source: `packages/core/src/Generation.ts` *(Planned)*.

## BEH-BR-169: A generation is a helper with one owner

> **See:** [ADR-BR-024](../decisions/024-shared-state-helpers.md)
> **Satisfies:** [URS-BR-015](../urs.md#urs-br-015-switch-several-behaviours-atomically)

```ts
// illustrative — not type-checked
interface Generation<A> {
  readonly acquire: Effect.Effect<Lease<A>, AdmissionClosed, Scope.Scope>
  readonly publish: (next: A) => Effect.Effect<Retired<A>>
  readonly closeAdmission: Effect.Effect<void>
  readonly reopenAdmission: Effect.Effect<void>
  readonly awaitDrained: (options?: DrainOptions) => Effect.Effect<void, DrainTimeout>
  readonly use: <B, E, R>(run: (value: A) => Effect.Effect<B, E, R>) =>
    Effect.Effect<B, E | AdmissionClosed | LeaseRevoked, R>
  readonly current: Effect.Effect<{ readonly revision: number; readonly open: boolean }>
  // gap-free, latest-wins feed of published revisions (BEH-BR-170); first element: the current one
  readonly changes: Stream.Stream<GenerationChange<A>>
  // what a non-owner may hold: no publish, no admission control, no drain
  readonly view: GenerationView<A>
}

interface GenerationChange<A> { readonly revision: number; readonly value: A; readonly open: boolean }
interface GenerationView<A> {
  readonly acquire: Generation<A>["acquire"]
  readonly use: Generation<A>["use"]
  readonly current: Generation<A>["current"]
  readonly changes: Generation<A>["changes"]
}

interface Lease<A> { readonly value: A; readonly revision: number }

interface Retired<A> {
  readonly value: A
  readonly drained: Effect.Effect<void>                                 // unbounded
  readonly drain: (options?: DrainOptions) => Effect.Effect<void, DrainTimeout>
  readonly holders: Effect.Effect<number>
}

interface DrainOptions {
  readonly timeout?: Duration.Input   // default: GenerationOptions.drainTimeout
  readonly force?: boolean            // after `timeout`, revoke the leases still held
}

interface GenerationOptions {
  readonly name?: string                               // identifies the generation in DrainTimeout and reports
  readonly drainTimeout?: Duration.Input | "forever"   // default 30 seconds
}

Generation.make<A>(initial: A, options?: GenerationOptions):
  Effect.Effect<Generation<A>, never, Scope.Scope>
```

```
REQUIREMENT: `Generation` MUST be a helper outside the `Host` interface. It
             MUST NOT read or modify plugin state.
```

```
REQUIREMENT: A generation MUST assume one owner — a coordinator plugin or
             application code — that calls `publish`, `closeAdmission`,
             `reopenAdmission` and the drain operations. Concurrent `publish`
             calls MUST still be linearized, each producing its own
             `Retired` value, but core MUST NOT attempt to arbitrate between
             competing owners.
```

```
REQUIREMENT: `view` MUST expose exactly `acquire`, `use`, `current` and
             `changes` of the same generation, and nothing through which a
             holder could publish, change admission or drain. An owner that
             hands a generation to other code SHOULD hand its `view`.
```

```
REQUIREMENT: When the scope given to `make` closes, the generation MUST close
             admission, and MUST drain every value still held — current and
             retired — under `drainTimeout`, revoking at the limit as in
             BEH-BR-174, before the scope finishes closing.
```

**Settled here.** SPEC.md does not say what closing a generation's own scope
does to outstanding leases. A scope finalizer cannot fail and must end, so it
drains with the same bound as every other drain and revokes at the limit,
rather than waiting without bound or abandoning holders silently.

## BEH-BR-170: Publication is atomic

> **Invariant:** [INV-BR-003](../invariants.md#inv-br-003-publication-is-atomic)
> **See:** [ADR-BR-024](../decisions/024-shared-state-helpers.md)
> **Satisfies:** [URS-BR-015](../urs.md#urs-br-015-switch-several-behaviours-atomically)

```
REQUIREMENT: `publish(next)` MUST replace the current value in one step. A
             caller admitted after the step MUST receive `next`; a caller
             admitted before it MUST keep the old value for the life of its
             lease. No caller MAY observe a mixture.
```

```
REQUIREMENT: `current.revision` MUST start at 0 for the initial value and
             MUST increase by exactly one on every `publish`.
             `Lease.revision` MUST be the revision of the value it holds.
```

```
REQUIREMENT: `changes` MUST be a state feed with the rules of
             04 — States and Snapshots, BEH-BR-030: each subscriber MUST
             first receive the current revision, value and admission state,
             then every later change in revision order, never a revision
             lower than one already delivered; a slow subscriber MAY skip
             intermediate revisions and MUST then receive the latest. An
             element for revision n MUST be delivered only after the
             `publish` that made n has completed its step, so that a
             subscriber that sees n and then calls `acquire` (with admission
             open) receives n or a later revision. A change of admission
             (`closeAdmission`, `reopenAdmission`) MUST also be delivered,
             with the unchanged revision. The feed MUST end when the
             generation's scope closes.
```

```
REQUIREMENT: `publish` MUST NOT change admission. Publishing while admission
             is closed MUST leave it closed.
```

```
REQUIREMENT: `publish` MUST return the replaced value as a `Retired`.
```

The value is meant to be an immutable description built *before* publication.
Building it may fail; when it does, nothing was published and the current
generation is untouched. That is the difference from `replace`, which stops
the old activation before the new build runs
([ADR-BR-004](../decisions/004-replace-is-stop-then-start.md)): here the new
value exists in full before any caller can see it.

**Settled here.** (1) SPEC.md gives no starting revision; it is 0, and the
first publish yields 1. (2) SPEC.md does not say whether `publish` reopens
admission. It does not: an owner that closed admission to evict did so on
purpose, and a publish that reopened it silently would admit callers into a
state the owner has not finished preparing.

## BEH-BR-171: Admission control

> **See:** [ADR-BR-024](../decisions/024-shared-state-helpers.md)
> **Satisfies:** [URS-BR-015](../urs.md#urs-br-015-switch-several-behaviours-atomically)

```
REQUIREMENT: After `closeAdmission`, `acquire` and `use` MUST fail with
             `AdmissionClosed { name }` until `reopenAdmission`. Leases
             already admitted MUST continue unaffected.
```

```
REQUIREMENT: `current.open` MUST report whether admission is open.
             `closeAdmission` on a closed generation and `reopenAdmission` on
             an open one MUST be no-ops.
```

Closing admission and then waiting for the current value to drain gives the
"close admission, drain, then change" sequence an eviction needs, without
involving unrelated plugins. `AdmissionClosed` carries `GenerationOptions.name`
so a caller can tell which generation refused it.

## BEH-BR-172: Leases on a generation, and the supervised use

> **Invariant:** [INV-BR-006](../invariants.md#inv-br-006-a-leased-provider-does-not-close-under-its-lease)
> **See:** [ADR-BR-015](../decisions/015-leases-one-primitive.md), [ADR-BR-024](../decisions/024-shared-state-helpers.md)
> **Satisfies:** [URS-BR-005](../urs.md#urs-br-005-never-lose-a-provider-in-the-middle-of-a-call)
> **Risk:** [RSK-BR-001](../gxp/03-risk-assessment.md#rsk-br-001)

```
REQUIREMENT: `acquire` MUST admit a lease on the value current at the moment
             of admission and hold it until the caller's `Scope` closes.
```

```
REQUIREMENT: `use(run)` MUST take a lease, run `run` in a child fiber
             supervised by the generation and joined by the caller, and
             release the lease when the child ends. The caller's own fiber
             MUST NOT be interrupted by the generation; caller interruption
             MUST interrupt the child and await its finalizers before the
             lease is released.
```

```
REQUIREMENT: A value reference that escapes its lease MUST NOT be described
             as protected.
```

`use` exists because a forced drain (BEH-BR-174) interrupts a holder. A holder
that took its lease with `acquire` is interrupted itself — its fiber, and with
it the scope it is unwinding and the fibers it forked into that scope; a
holder for whom that is unacceptable uses `use`, so that only the callback is
interrupted.

## BEH-BR-173: Draining is bounded unless declared forever

> **Invariant:** [INV-BR-017](../invariants.md#inv-br-017-every-drain-is-bounded-unless-declared-forever)
> **See:** [ADR-BR-024](../decisions/024-shared-state-helpers.md)
> **Satisfies:** [URS-BR-015](../urs.md#urs-br-015-switch-several-behaviours-atomically)

```
REQUIREMENT: `Retired.drained` MUST complete only when every lease admitted
             against that value has ended. Nothing MAY wait on a lease that
             was never admitted.
```

```
REQUIREMENT: `Retired.drain(options)` and `awaitDrained(options)` MUST wait at
             most `options.timeout` (default `GenerationOptions.drainTimeout`,
             itself defaulting to 30 seconds) and then fail with
             `DrainTimeout { id: name, leases }`, where `leases` is the
             number still held.
```

```
REQUIREMENT: After a `DrainTimeout` the value MUST remain retired (or, for
             `awaitDrained`, current) and the call MUST be repeatable with a
             longer timeout or with `force`.
```

```
REQUIREMENT: `awaitDrained` MUST wait for the leases on the value that is
             current when it is called. It MUST NOT close admission itself;
             with admission open, it completes at the first instant no lease
             on that value is held.
```

```
REQUIREMENT: An unbounded wait MUST be explicit: either `drained`, which is
             documented as unbounded and meant for tests and callers applying
             their own timeout, or `drainTimeout: "forever"`.
```

**Settled here.** SPEC.md does not say whether `awaitDrained` closes admission
or what it does when new leases keep arriving. It neither closes admission nor
waits for a quiet period: the owner pairs it with `closeAdmission`, as SPEC.md
describes, and the operation does exactly one thing.

## BEH-BR-174: Force revokes held leases and waits for their finalizers

> **Invariant:** [INV-BR-017](../invariants.md#inv-br-017-every-drain-is-bounded-unless-declared-forever)
> **See:** [ADR-BR-015](../decisions/015-leases-one-primitive.md), [ADR-BR-024](../decisions/024-shared-state-helpers.md)
> **Risk:** [RSK-BR-015](../gxp/03-risk-assessment.md#rsk-br-015)

```
REQUIREMENT: With `force: true`, after `timeout` the generation MUST revoke
             every lease still held on that value: the fiber that took a
             lease with `acquire` MUST be interrupted, as a forced removal
             revokes a scoped host lease (09 — Leases, BEH-BR-086);
             callbacks started through `use` MUST be interrupted and fail
             with `LeaseRevoked`; and the call MUST wait for their finalizers
             before completing.
```

```
REQUIREMENT: Force MUST NOT be applied unless the caller passed
             `force: true`, except in the scope-close path of BEH-BR-169.
```

```
REQUIREMENT: Every forced revocation MUST be reported. When the generation
             was made inside a plugin's activation (the
             `@bridger/core/ActivePlugin` reference was set at `make`), it
             MUST be reported as a `lease-revoked` host event naming the
             generation and the owning plugin; otherwise it MUST be logged at
             warning level with the generation name and the number of
             revoked leases.
```

```
REQUIREMENT: Core MUST NOT write an `AuditSink` record for a generation's
             forced revocation, and MUST NOT describe it as audited. It is
             the owner's call, not a host lifecycle transition.
```

Interruption does not undo external effects. A callback interrupted halfway
through a batch of regulated writes leaves that batch however the external
system leaves an interrupted write. That is why force is never the default,
and why an owner whose generation callbacks write GMP data must record its own
forced drains: core has no host operation to attach that record to.

**Settled here.** Revision 0.1 closed an `acquire` lease's scope with a
`LeaseRevoked` cause. The scope an `acquire` runs in belongs to its caller,
and Effect gives a third party no way to close it; the host-core prototype
therefore interrupts the acquiring fiber, which is how BEH-BR-086 revokes a
scoped host lease (URS gaps G12 and G26, CCR-BR-011).

SPEC.md says forcing "emits a `lease-revoked` event through
the owning coordinator", but a generation has no reference to a host.
Routing through the `ActivePlugin` reference when it exists, and logging
otherwise, keeps the revocation visible in both cases. Not auditing it is the
conservative reading: core does not claim a record it cannot attribute to an
operation, and the owner is the party that decided to force.

## BEH-BR-175: Several retired values drain independently

> **See:** [ADR-BR-024](../decisions/024-shared-state-helpers.md)
> **Satisfies:** [URS-BR-015](../urs.md#urs-br-015-switch-several-behaviours-atomically)

```
REQUIREMENT: Several retired values MAY be draining at once. Draining,
             forcing or timing out one MUST NOT affect another.
```

```
REQUIREMENT: `Retired.holders` MUST report the number of leases still held on
             that value. Once it reaches zero the generation MUST keep no
             reference to the value.
```

Keeping no reference matters for memory: an owner that publishes on every
configuration change would otherwise accumulate every model it ever built.

## BEH-BR-176: Publish, drain, then remove the plugin

> **Invariant:** [INV-BR-006](../invariants.md#inv-br-006-a-leased-provider-does-not-close-under-its-lease), [INV-BR-017](../invariants.md#inv-br-017-every-drain-is-bounded-unless-declared-forever)
> **See:** [ADR-BR-024](../decisions/024-shared-state-helpers.md)
> **Satisfies:** [URS-BR-015](../urs.md#urs-br-015-switch-several-behaviours-atomically), [URS-BR-002](../urs.md#urs-br-002-remove-or-replace-a-plugin-safely-while-it-is-in-use)
> **Risk:** [RSK-BR-001](../gxp/03-risk-assessment.md#rsk-br-001)

```
REQUIREMENT: Where a generation's value references resources owned by
             plugins (validators, handlers), the owner MUST publish the
             replacement generation first, then drain the retired one, and
             only then remove the plugin whose resources it referenced.
```

```
REQUIREMENT: The owner MUST drain with a timeout, and with `force` where the
             plugin's removal must not be blocked, so that a stuck generation
             lease cannot hold a plugin removal hostage.
```

This ordering replaces any need for a base-model call to lease an extension
plugin. The generation's value is what the call reads; the plugin is removed
only after no admitted call can still reach anything it owned. Core cannot
enforce this ordering — it does not know which plugins a value references —
so it is an obligation on the owner, stated here so that it can be tested in
the owner's own suite.

---

_Previous: [19 — Contribution Registry](./19-contribution-registry.md)_ · _Next: [21 — Testing Host](./21-testing-host.md)_
