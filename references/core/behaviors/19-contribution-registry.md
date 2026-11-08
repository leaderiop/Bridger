# 19 — Contribution Registry

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-BEH-19                                               |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.2 (2026-11-08): BEH-BR-163 `add` consults a wired `AccessPolicy` (CCR-BR-018); BEH-BR-168 points to `Selector` and hook points (CCR-BR-019)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001)                 |

---

Effect's `Scope` cleans up *within* one plugin, and Bridger orders cleanup
*between* plugins. Neither proves that two plugins' changes to one shared
object can be undone independently. `ContributionRegistry` is the small helper
for the common case where they can: an extension point that plugins add
uniquely identified values to for the lifetime of a scope, and that removes
each value cleanly when its scope closes. This file converts SPEC.md
"Revertibility and shared state", including the `ContributionRegistry`
namespace and its rules. This file owns BEH-BR-161–168 and uses all eight.

Planned source: `packages/core/src/ContributionRegistry.ts` *(Planned)*. The
event bus stores its listeners in registries
([16 — Event Bus](./16-event-bus.md)); `Generation`, the second helper, is in
[20 — Generation](./20-generation.md).

## BEH-BR-161: What revertibility covers, and what it does not

> **See:** [ADR-BR-024](../decisions/024-shared-state-helpers.md), [ADR-BR-027](../decisions/027-core-exclusions.md)
> **Satisfies:** [URS-BR-014](../urs.md#urs-br-014-contribute-to-a-shared-extension-point-safely)
> **Risk:** [RSK-BR-009](../gxp/03-risk-assessment.md#rsk-br-009)

```
REQUIREMENT: Core MUST guarantee only the cleanup of tracked resources and
             registrations: scope finalizers within a plugin (last in, first
             out) and dependency-ordered cleanup between plugins. It MUST NOT
             claim that arbitrary mutations of a shared service commute or can
             be undone.
```

```
REQUIREMENT: Core MUST NOT claim to compensate external emissions — messages
             sent, transactions committed, writes another process has seen.
             Compensation is application-defined.
```

A plugin that pushes into a shared array, patches a shared map or registers a
global handler without a finalizer leaves that change behind when it stops,
and no amount of ordering fixes it. A plugin's acquired resource needs a
correct finalizer; an operation on shared state needs an independence
contract. `ContributionRegistry` *is* such a contract for one common shape —
keyed, independent additions — and the rest of this file specifies it.

## BEH-BR-162: A registry is a stable base service, independent of plugin state

> **See:** [ADR-BR-024](../decisions/024-shared-state-helpers.md)
> **Satisfies:** [URS-BR-014](../urs.md#urs-br-014-contribute-to-a-shared-extension-point-safely)

```ts
// illustrative — not type-checked
namespace ContributionRegistry {
  interface Registry<A> {
    readonly add: (id: string, value: A, options?: { readonly priority?: number }) =>
      Effect.Effect<void, DuplicateContribution, Scope.Scope>
    readonly get: (id: string) => Effect.Effect<Option.Option<A>>
    readonly view: Effect.Effect<RegistryView<A>>                 // not protected by a lease
    readonly changes: Stream.Stream<RegistryView<A>>
    readonly use: <B, E, R>(id: string, run: (value: A) => Effect.Effect<B, E, R>,
      options?: { readonly timeout?: Duration.Input }) =>
      Effect.Effect<B, E | ContributionUnavailable | LeaseRevoked | LeaseTimeout, R>
    readonly useAll: <B, E, R>(run: (view: RegistryView<A>) => Effect.Effect<B, E, R>,
      options?: { readonly timeout?: Duration.Input }) =>
      Effect.Effect<B, E | LeaseRevoked | LeaseTimeout, R>
  }
  interface RegistryView<A> {
    readonly revision: number
    readonly entries: readonly { readonly id: string; readonly priority: number; readonly value: A }[]
  }
  interface Options {
    readonly drainTimeout?: Duration.Input | "forever"   // default 30 seconds
    readonly name?: string                               // shown by inspect; default "registry"
  }
  function make<A>(options?: Options): Effect.Effect<Registry<A>, never, Scope.Scope>
}

// Application setup: one registry, provided as a stable base service.
class Routes extends Context.Service<Routes, ContributionRegistry.Registry<Route>>()("example/Routes") {}
const routes = yield* ContributionRegistry.make<Route>()
const host = yield* Bridger.make({ base: Context.make(Routes, routes) })
```

```
REQUIREMENT: A registry MUST be independent of any plugin. It MUST NOT read
             or change plugin state, and its lifetime MUST be the scope given
             to `make`, not any plugin's activation.
```

```
REQUIREMENT: The registry MUST NOT interpret contributed values. Bridger MUST
             NOT define what a route, command, menu item or handler means.
```

A registry is normally provided as a base service, so every plugin that
requires its key resolves to the same instance and the registry outlives
every contributor.

**Settled here.** (1) `use` and `useAll` take an optional per-call
`timeout`. SPEC.md lists `LeaseTimeout` in their error unions but gives no way
to set a timeout, which would leave the error unreachable; the option mirrors
`Host.use`. (2) `Options.name` is added so that `PluginInspection.contributions[].registry`
(13 — Observability and Diagnostics) has something to show; the event bus
names each per-event registry after the event id.

## BEH-BR-163: Registration is unique and scope-bound

> **See:** [ADR-BR-024](../decisions/024-shared-state-helpers.md)
> **Satisfies:** [URS-BR-014](../urs.md#urs-br-014-contribute-to-a-shared-extension-point-safely)

```
REQUIREMENT: `add(id, value)` MUST register `value` under `id` for the
             lifetime of the caller's `Scope`. When `id` is already
             registered — or is still being removed (BEH-BR-164) — `add` MUST
             fail with `DuplicateContribution { id }` and MUST register
             nothing.
```

```
REQUIREMENT: Two concurrent `add` calls with one `id` MUST result in exactly
             one registration; the other MUST fail with
             `DuplicateContribution`.
```

```
REQUIREMENT: A `priority` that is not a finite number MUST be rejected at
             `add` (as a defect) and MUST register nothing. The default
             priority is 0.
```

```
REQUIREMENT: When `add` is called inside a plugin's activation (the
             `@bridger/core/ActivePlugin` reference is set), the registry
             MUST report the contribution's owner to the host for
             `inspect`. It MUST NOT use the reference for anything else.
```

```
REQUIREMENT: When an `AccessPolicy` was in the environment of `make`, `add`
             MUST consult it before reserving the id, and a refusal MUST
             register nothing
             ([28 — Plugin Principal and Mandatory Policy](./28-plugin-principal-and-mandatory-policy.md),
             BEH-BR-264).
```

A collision fails rather than replaces because two plugins contributing the
same id is a conflict between them, and "last one wins" would make the
outcome depend on activation order — the dependency on history that
[18 — Reconciliation and Confluence](./18-reconciliation-and-confluence.md)
exists to remove.

**Settled here.** SPEC.md does not say what a `NaN` or infinite priority does.
Either would make the ordering of BEH-BR-165 undefined (every comparison with
`NaN` is false), so it is refused at the boundary.

## BEH-BR-164: Removal on scope close is last-in-first-out and leaves others intact

> **See:** [ADR-BR-024](../decisions/024-shared-state-helpers.md)
> **Satisfies:** [URS-BR-014](../urs.md#urs-br-014-contribute-to-a-shared-extension-point-safely)

```
REQUIREMENT: When the scope a contribution was added in closes, that
             contribution MUST be removed. Contributions added in one scope
             MUST be removed in last-in-first-out order.
```

```
REQUIREMENT: Removing one contribution MUST leave every other contribution
             intact, whoever added it.
```

```
REQUIREMENT: An id MUST stay reserved from the moment its contribution starts
             being removed until its removal completes (drained or revoked,
             BEH-BR-167). Only then MAY the id be added again.
```

**Settled here.** SPEC.md does not say when a removed id can be reused.
Reserving it until removal completes means a value and its successor are
never both reachable under one id — a `use` holder of the old value and a new
reader of the new one would otherwise disagree about what the id means. A
plugin restart is unaffected: its old activation scope closes, and its
contributions drain, before the new activation runs `add` again.

## BEH-BR-165: Views are ordered, revisioned and observable

> **Invariant:** [INV-BR-008](../invariants.md#inv-br-008-snapshot-revisions-never-regress)
> **See:** [ADR-BR-024](../decisions/024-shared-state-helpers.md), [ADR-BR-007](../decisions/007-observation-primitives.md)
> **Satisfies:** [URS-BR-014](../urs.md#urs-br-014-contribute-to-a-shared-extension-point-safely)

```
REQUIREMENT: `view` and `useAll` MUST present entries ordered by `priority`
             ascending, ties broken by `id` (code-unit order). The order of
             two entries MUST NOT change between revisions while both remain.
```

```
REQUIREMENT: `RegistryView.revision` MUST start at 0 for an empty registry
             and MUST increase by exactly one each time an entry enters the
             view (add) or leaves it (removal begins). It MUST NOT change
             otherwise.
```

```
REQUIREMENT: `changes` MUST follow the rules of `Host.changes`: each
             subscriber first receives the current view, registers without a
             gap, and afterwards receives later views; a slow subscriber MAY
             skip intermediate revisions and receives the latest. Revisions
             MUST never regress.
```

`changes` is a state feed, not a log. A consumer that must see every add and
removal cannot rely on it, for the same reason `Host.changes` is not an audit
trail.

## BEH-BR-166: Leased use holds a contribution; reads do not

> **Invariant:** [INV-BR-006](../invariants.md#inv-br-006-a-leased-provider-does-not-close-under-its-lease)
> **See:** [ADR-BR-024](../decisions/024-shared-state-helpers.md), [ADR-BR-015](../decisions/015-leases-one-primitive.md)
> **Satisfies:** [URS-BR-005](../urs.md#urs-br-005-never-lose-a-provider-in-the-middle-of-a-call)
> **Risk:** [RSK-BR-001](../gxp/03-risk-assessment.md#rsk-br-001)

```
REQUIREMENT: `use(id, run)` MUST hold the contribution against removal for
             the duration of `run`, and MUST fail with
             `ContributionUnavailable { id }` without running `run` when the
             id is not in the view.
```

```
REQUIREMENT: `useAll(run)` MUST hold every contribution in the view it passes
             to `run` against removal for the duration of `run`.
```

```
REQUIREMENT: `use` and `useAll` MUST run `run` in a supervised child fiber,
             with the edge rules of `Host.use` (09 — Leases): caller
             interruption interrupts the child and awaits its finalizers
             before the hold is released; the child inherits the caller's
             fiber references; the caller's own fiber is never interrupted by
             the registry.
```

```
REQUIREMENT: A value returned by `get` or `view` MUST be a plain reference
             with no hold. Core MUST NOT describe it as protected.
```

A renderer that reads the view and later calls a contributed handler has
read a value that may have been removed in between. A consumer that needs the
contribution to outlive a read uses `use` or `useAll`; a renderer that mounts
contributed UI uses a scoped lease on the owning plugin instead (see the
React adapter).

## BEH-BR-167: Removal waits for holders, bounded by drainTimeout, then revokes

> **Invariant:** [INV-BR-017](../invariants.md#inv-br-017-every-drain-is-bounded-unless-declared-forever)
> **See:** [ADR-BR-024](../decisions/024-shared-state-helpers.md), [ADR-BR-015](../decisions/015-leases-one-primitive.md)
> **Satisfies:** [URS-BR-005](../urs.md#urs-br-005-never-lose-a-provider-in-the-middle-of-a-call)
> **Risk:** [RSK-BR-015](../gxp/03-risk-assessment.md#rsk-br-015)

```
REQUIREMENT: When a contribution's scope closes, the registry MUST first hide
             it — new `get` calls return `None`, new `view`s omit it, new
             `use` calls fail with `ContributionUnavailable`, new `useAll`
             calls receive a view without it — and only then wait for the
             `use` and `useAll` callbacks that hold it.
```

```
REQUIREMENT: The wait MUST be bounded by `Options.drainTimeout` (default
             30 seconds). When it expires, the callbacks still holding the
             contribution MUST be interrupted and MUST fail with
             `LeaseRevoked`; the registry MUST wait for their finalizers and
             then complete the removal.
```

```
REQUIREMENT: `drainTimeout: "forever"` MUST be accepted only when stated
             explicitly; it is never a default.
```

The removal runs inside a scope finalizer, and a finalizer cannot fail. Without
a bound, one stuck callback holding a menu entry would block the stop of the
plugin that contributed it, and through dependents-first ordering possibly the
stop of the whole host. Revocation at the limit is therefore not a policy
choice but the only way a finalizer can end. A consumer whose `use` callbacks
perform regulated writes sets `drainTimeout` long enough for the longest
such write, because interruption does not undo a half-finished external
write.

## BEH-BR-168: A generic extension point that reports ownership

> **See:** [ADR-BR-024](../decisions/024-shared-state-helpers.md), [ADR-BR-003](../decisions/003-one-provider-per-key-per-realm.md)
> **Satisfies:** [URS-BR-014](../urs.md#urs-br-014-contribute-to-a-shared-extension-point-safely)

```
REQUIREMENT: Multiplexing — several implementations behind one service key —
             MUST be expressed as a registry the implementations contribute
             to, not as several providers of one key.
```

```
REQUIREMENT: A registry MUST report each contribution's owning plugin and
             registry name to the host so that `inspect` lists
             `{ registry, id }` for that plugin. It MUST report names and ids
             only, never values.
```

One provider per key ([ADR-BR-003](../decisions/003-one-provider-per-key-per-realm.md))
and a registry for everything that needs many are two halves of one design:
the provider is the unambiguous owner that removal ordering and leases need,
and the registry is where many plugins meet without any of them owning the
others. Selection among contributions per call site is `Selector`, and a
policied decision over contributions is a hook point
([31 — Hook Points](./31-hook-points.md), BEH-BR-307).

---

_Previous: [18 — Reconciliation and Confluence](./18-reconciliation-and-confluence.md)_ · _Next: [20 — Generation](./20-generation.md)_
