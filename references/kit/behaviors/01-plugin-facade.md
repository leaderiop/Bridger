# 01 — Plugin Facade

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-KT-BEH-01                                            |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-KT-001)<br>0.1 (2026-11-08): Initial draft (CCR-KT-001)                 |

---

`definePlugin` is the authoring entry point of the kit. It produces exactly
what core's `Plugin.define` produces — an inert `PluginDefinition` — but the
author writes an `Effect` that returns a service implementation instead of a
`Layer`, never writes `as const`, and gets type errors that name the plugin
and the offending key. Its types are chosen from the evidence of
[appendix A](../appendices/a-cast-inventory.md): the prototype's 43 casts to
`AnyPlugin` trace to one variance mistake and to object literals that bypass
`define`. This file owns BEH-KT-001–008 and uses BEH-KT-001–006; 007 and 008
are reserved.

Planned source: `packages/kit/src/definePlugin.ts`, `packages/kit/src/TypeErrors.ts` *(Planned)*.

## BEH-KT-001: definePlugin returns a core definition and nothing more

> **Invariant:** [INV-KT-001](../invariants.md#inv-kt-001-a-facade-plugin-behaves-as-its-core-equivalent)
> **See:** [ADR-KT-001](../decisions/001-kit-is-sugar-and-tools-over-core.md), [ADR-BR-002](../../core/decisions/002-plugin-build-is-a-layer.md)
> **Core seam:** [01 — Plugin definition](../../core/behaviors/01-plugin-definition.md) (BEH-BR-001, BEH-BR-002)

```ts
// illustrative — not type-checked
type KeyRef = Context.Key<any, any> | Contract.Any | ContractRequirement<any, any>   // 26, BEH-BR-227

// Form 1 — one service
definePlugin<const Id extends string, const R extends readonly KeyRef[], K extends KeyRef, E, C = void>(spec: {
  readonly id: Id
  readonly requires?: R                                   // default []
  readonly optional?: readonly KeyRef[]
  readonly provides: K
  readonly config?: Schema.Codec<C, unknown>
  readonly volatile?: readonly (keyof C & string)[]
  readonly meta?: PluginDefinition<any, any, any, any>["meta"]
  readonly health?: HealthSpec<R>
  readonly make: MakeFn<ShapeOf<K>, E, IdentifiersOf<R> | Plugin.Runtime | Scope.Scope, C>
}): Plugin<R, readonly [K], E, C>

// Form 2 — several services: a record of keys, `make` returns a record of implementations
definePlugin<..., const P extends Readonly<Record<string, KeyRef>>>(spec: {
  ...; readonly provides: P
  readonly make: MakeFn<{ readonly [N in keyof P]: ShapeOf<P[N]> }, E, IdentifiersOf<R> | Plugin.Runtime | Scope.Scope, C>
}): Plugin<R, ValuesTuple<P>, E, C>

// Form 3 — no service: `run` performs registrations (listeners, contributions, background work)
definePlugin<...>(spec: { ...; readonly provides?: never; readonly run: MakeFn<void, E, IdentifiersOf<R> | Plugin.Runtime | Scope.Scope, C> })
  : Plugin<R, readonly [], E, C>

// Form 4 — escape hatch: a core build Layer, checked exactly as Plugin.define checks it
definePlugin<...>(spec: { ...; readonly provides: readonly KeyRef[]; readonly build: Layer.Layer<...> }): Plugin<R, P, E, C>

type MakeFn<A, E, R, C> = Effect.Effect<A, E, R> | ((ctx: { readonly config: C }) => Effect.Effect<A, E, R>)
```

```
REQUIREMENT: `definePlugin` MUST return a value that is a core
             `PluginDefinition` with the same `id`, `requires`, `optional`,
             `provides`, `config`, `volatile`, `meta` and `health` as the
             spec, and a `build` Layer derived as follows: Form 1
             `Layer.effect(K, make)`; Form 2 a `Layer.effectContext` that
             runs `make` once and adds each implementation under its key;
             Form 3 `Layer.effectDiscard(run)`; Form 4 the given `build`.
             When `make` or `run` is a function, it MUST receive the value of
             `Plugin.Config` read inside the build, never a raw override.
```

```
REQUIREMENT: `definePlugin` MUST NOT perform effects, run `make`, `run` or
             `build`, register the definition anywhere, or add any field to
             the definition that core does not specify. The returned value
             MUST pass core's `InvalidDefinition` checks exactly when the
             equivalent `Plugin.define` value would.
```

```
REQUIREMENT: A Form 2 `make` that returns a record missing a key of
             `provides`, or carrying an extra key, MUST be a compile error.
             At run time the derived build MUST add exactly the keys of
             `provides`, in their declaration order.
```

The four forms cover what the prototype's plugins actually do: most provide
one service, a few provide two, and about a third of the test plugins provide
nothing and only register listeners or children — the case where the
prototype's casts were *necessary* (appendix A, family F1). Form 3 makes that
case first-class.

**Settled here.** `make` may receive `{ config }` so that the common case of
reading configuration does not require `yield* Plugin.Config`; the value is
the one core decoded before build ([BEH-BR-097](../../core/behaviors/11-configuration.md)),
so the facade adds no configuration path.

**Open.** Whether Form 2 should also accept a tuple of keys with a tuple of
implementations; v0.1 keeps the record, whose names make errors readable.

## BEH-KT-002: requires and provides are inferred as tuples, without as const

> **See:** [ADR-KT-001](../decisions/001-kit-is-sugar-and-tools-over-core.md)
> **Core seam:** [01 — Plugin definition](../../core/behaviors/01-plugin-definition.md) (BEH-BR-001)

```
REQUIREMENT: `requires`, `optional` and `provides` MUST be inferred through
             `const` type parameters, so that an array literal written
             without `as const` is typed as a readonly tuple of its keys.
             Documentation and generated code MUST NOT write `as const` on
             these fields.
```

```
REQUIREMENT: An omitted `requires` MUST be typed as `readonly []`, and the
             derived definition MUST carry `requires: []` at run time.
```

Appendix A records 81 `as const` annotations on `requires`/`provides` in the
prototype's tests and shows, by removing all of them, that the prototype's
`define` already inferred them through `const` type parameters. They are
habit, not need; the facade's documentation removes the habit.

## BEH-KT-003: The keys a build uses are checked against requires, with a readable error

> **Invariant:** [INV-KT-001](../invariants.md#inv-kt-001-a-facade-plugin-behaves-as-its-core-equivalent)
> **See:** [ADR-KT-001](../decisions/001-kit-is-sugar-and-tools-over-core.md)
> **Core seam:** [01 — Plugin definition](../../core/behaviors/01-plugin-definition.md) (BEH-BR-002)

```ts
// illustrative — not type-checked
interface KitTypeError<Message extends string, Detail = never> {
  readonly "~kitTypeError": Message
  readonly detail: Detail
}
```

```
REQUIREMENT: When the requirement type of `make`, `run` or `build` exceeds
             `IdentifiersOf<R> | Plugin.Runtime | Plugin.Config | Scope.Scope`,
             the facade MUST make the call a compile error whose reported
             type is `KitTypeError<"<id>: make uses a service that requires
             does not declare", X>`, where `<id>` is the literal plugin id
             and `X` the undeclared identifiers (`run` and `build` name
             themselves in place of `make`).
```

```
REQUIREMENT: The facade MUST report, in the same way: a `provides` key whose
             implementation `make` does not return ("<id>: make does not
             return a service that provides declares"); a key declared in
             both `requires` and `provides` ("<id>: a key is both required
             and provided"); a `volatile` name that is not a top-level field
             of `config` ("<id>: volatile names a field the config schema
             does not have"); and a non-literal `id` ("plugin id must be a
             string literal").
```

```
REQUIREMENT: Documentation MUST state, next to these errors, that a service
             reached only at call time by a method that `make` returns is
             not seen by the check and must still be declared (BEH-BR-002).
```

Core already rejects an undeclared requirement (BEH-BR-002), but the error a
user sees is a `Layer` assignability failure several lines long. The facade
does not check more than core; it checks the same thing and says what is wrong
in one line. The literal id is part of the message because plugins are often
defined side by side in one file.

**Settled here.** Errors are carried by a type, not by overload resolution
tricks, so the message survives in editor hovers and `tsc` output alike.

**Open.** The exact rendering differs between TypeScript versions; the
acceptance check (REQ-KT-003) compares the message string, not the full
diagnostic text.

## BEH-KT-004: Plugin.Any accepts every definition and only definitions

> **See:** [ADR-KT-002](../decisions/002-plugin-any-is-the-contravariant-top.md)
> **Core seam:** amendment to [01 — Plugin definition](../../core/behaviors/01-plugin-definition.md), [03 — Installation](../../core/behaviors/03-installation.md), [14 — Children and groups](../../core/behaviors/14-children-and-groups.md), [18 — Reconciliation](../../core/behaviors/18-reconciliation-and-confluence.md)

```ts
// illustrative — not type-checked (core type, requested by ADR-KT-002)
declare const PluginTypeId: unique symbol
interface PluginAny {                                    // exported by core as Plugin.Any
  readonly [PluginTypeId]: typeof PluginTypeId          // phantom: never present at run time
  readonly id: string
  readonly requires: Keys
  readonly provides: Keys
  readonly optional?: Keys
  readonly config?: Schema.Codec<any, unknown>
  readonly volatile?: readonly string[]
  readonly meta?: PluginDefinition<any, any, any, any>["meta"]
  readonly health?: unknown
  readonly build: Layer.Layer<never, unknown, any>      // `in ROut`: never is the top
}
type Plugin<R extends Keys, P extends Keys, E, C> = PluginDefinition<R, P, E, C> & { readonly [PluginTypeId]: typeof PluginTypeId }
```

```
REQUIREMENT: Every value returned by `definePlugin` (and, once core adopts
             the amendment, by `Plugin.define`) MUST be assignable to
             `Plugin.Any` without a cast, whatever its `requires`,
             `provides`, error and configuration types, including a
             definition that provides nothing.
```

```
REQUIREMENT: An object literal that was not produced by `definePlugin` or
             `Plugin.define` MUST NOT be assignable to `Plugin.Any`. The
             brand MUST be phantom: no property, symbol or prototype is
             added to the definition at run time.
```

```
REQUIREMENT: Every kit API that accepts a heterogeneous plugin —
             `PluginTest.mount`'s `provide`, the `dev` desired list, group
             members — MUST accept `Plugin.Any`.
```

Effect v4 declares `Layer<in ROut, out E, out RIn>`: the output parameter is
contravariant. The prototype's `AnyPlugin = PluginDefinition<Keys, Keys,
unknown>` gives `build` the type `Layer<any, unknown, any>`, and a layer that
provides nothing (`Layer<never, …>`) is not assignable to it — TypeScript
reports "Type 'any' is not assignable to type 'never'". Core's own
`PluginDefinition<any, any, any, any>` (BEH-BR-127, BEH-BR-153) has the same
defect. The top of a contravariant parameter is `never`. Replacing that one
type in a scratch copy of the prototype removed 42 of its 43 `AnyPlugin`
casts with no other change (appendix A §3). The brand closes the hole the
wider type would otherwise open: with `build: Layer<never, …>` alone, a
literal claiming `provides: [Events]` with an empty build would type-check.

## BEH-KT-005: A data-dependent key list is two definitions

> **See:** [ADR-KT-002](../decisions/002-plugin-any-is-the-contravariant-top.md)

```
REQUIREMENT: Documentation MUST state that a definition whose `requires` or
             `provides` depends on a run-time value (for example
             `cond ? [Feature] : []`) is not supported by the type check, and
             MUST show the supported form: one definition per shape, chosen
             by the caller.
```

```
REQUIREMENT: `definePlugin` MUST reject a union of tuples in `provides` or
             `requires` with `KitTypeError<"<id>: requires and provides must
             be fixed tuples; write one definition per shape">`.
```

The one prototype cast that survived the `Plugin.Any` fix (`children.test.ts`,
appendix A family F3) is a definition whose `provides` is `[Feature]` or `[]`
depending on an option. No sound type for `build` exists for that union
without a run-time check, and adding one would give the facade semantics core
does not have.

**Open.** A typed `definePlugin.variants({ ... })` helper returning one
definition per named shape; deferred until a real plugin needs it.

## BEH-KT-006: The facade accepts contracts wherever core does

> **See:** [ADR-KT-001](../decisions/001-kit-is-sugar-and-tools-over-core.md)
> **Core seam:** [26 — Versioned contracts](../../core/behaviors/26-versioned-contracts.md) (BEH-BR-227)

```
REQUIREMENT: `requires`, `optional` and `provides` MUST accept every form
             core accepts there — plain keys, `Contract` objects and
             `contract.range(r)` requirements — and MUST pass them through
             unchanged. The facade MUST NOT interpret ranges or versions.
```

```
REQUIREMENT: When `provides` is a `Contract`, the type of `make` MUST be the
             contract's service shape, so that a missing method is a compile
             error naming the method.
```

Version semantics are core's (BEH-BR-226–229). The facade only makes the
service shape the target type of `make`, which is where an author first
notices a missing method.

---

_Previous: [Overview](../overview.md)_ · _Next: [02 — Plugin test harness](./02-plugin-test.md)_
