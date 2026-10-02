# 01 — Plugin Definition

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-BEH-01                                               |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.2 (2026-10-02): IdentifiersOf made distributive (prototype finding G10) (CCR-BR-004)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001)                 |

---

This file specifies what a plugin *is* before any host sees it: the
`PluginDefinition` record, the compile-time bond between its declared keys and
its `build` Layer, how a service key is identified and versioned, and what a
dynamically loaded plugin entry may do when it is imported. It converts the
SPEC.md sections "Plugin definition" (except the activation paragraph, which
[05 — Activation](./05-activation.md) converts), its "Key identity and
versioning" paragraph, and "Dynamic code loading". This file owns
BEH-BR-001–008 and uses all eight.

Nothing here describes an implementation. The planned source location is
`packages/core/src/Plugin.ts` *(Planned)*.

## BEH-BR-001: A plugin definition is an inert, declarative record

> **See:** [ADR-BR-002](../decisions/002-plugin-build-is-a-layer.md)
> **Satisfies:** [URS-BR-001](../urs.md#urs-br-001-install-plugins-at-runtime-without-ordering-providers)

```ts
// illustrative — not type-checked
type Keys = readonly Context.Key<any, any>[]

type PluginDefinition<Requires extends Keys, Provides extends Keys, E, C = void> = {
  readonly id: string
  readonly requires: Requires                          // const tuple; the type-level source of truth
  readonly provides: Provides
  readonly config?: Schema.Codec<C, unknown>           // 11 — Configuration
  readonly volatile?: readonly (keyof C & string)[]    // 11 — Configuration
  readonly optional?: Keys                             // 15 — Optional and Reactive Dependencies
  readonly meta?: {
    readonly version?: string
    readonly digest?: string
    readonly description?: string
    readonly tags?: readonly string[]
  }                                                    // 11 — Configuration (meta)
  readonly health?: {                                  // 10 — Runtime Failure and Health
    readonly check: Effect.Effect<void, unknown, IdentifiersOf<Requires>>
    readonly every: Duration.Input
    readonly timeout: Duration.Input
    readonly failureThreshold: number
  }
  readonly build: Layer.Layer<
    IdentifiersOf<Provides>,
    E,
    IdentifiersOf<Requires> | Plugin.Runtime | Plugin.Config<C>
  >
}

type IdentifiersOf<K extends Keys> =                       // union of key identifiers
  K[number] extends infer X ? (X extends Context.Key<infer I, any> ? I : never) : never

Plugin.define<const Requires extends Keys, const Provides extends Keys, E, C = void>(
  definition: PluginDefinition<Requires, Provides, E, C>
): PluginDefinition<Requires, Provides, E, C>
```

```
REQUIREMENT: A plugin MUST be described by a `PluginDefinition` carrying
             `id`, `requires`, `provides` and `build`. The fields `config`,
             `volatile`, `optional`, `meta` and `health` are optional and are
             specified in the behaviour files named beside them above.
```

```
REQUIREMENT: `Plugin.define` MUST infer `requires` and `provides` as `const`
             tuples. It MUST NOT perform effects, allocate resources, run
             `build`, or register the definition anywhere.
```

```
REQUIREMENT: A definition MUST be inert data. Holding, passing or comparing a
             definition MUST NOT cause any of its services to be built; only
             a host activation builds it (05 — Activation).
```

A definition is a value a loader can produce, a reconcile list can hold and a
test can construct, so it must be safe to create and discard freely. Because
`build` is an Effect `Layer` — a description of construction, not the
construction itself — a definition that is never installed costs nothing and
leaks nothing. Everything an Effect author knows about `Layer.effect`,
`Layer.provide`, `Layer.merge` and scoped acquisition applies to `build`
unchanged; Bridger adds the runtime wiring that `Layer.provide` does
statically.

`Plugin.Runtime` and `Plugin.Config` are `Context.Service`s the host supplies
to `build` as part of its input; their identifiers are fixed in
[02 — Host Construction](./02-host-construction.md).

## BEH-BR-002: The build Layer is bounded by the declared keys at compile time

> **See:** [ADR-BR-002](../decisions/002-plugin-build-is-a-layer.md)
> **Satisfies:** [URS-BR-003](../urs.md#urs-br-003-catch-undeclared-dependencies-at-compile-time)

```
REQUIREMENT: The type of `Plugin.define` MUST reject, as a compile error, a
             `build` whose input (`RIn`) exceeds
             `IdentifiersOf<Requires> | Plugin.Runtime | Plugin.Config<C>`.
```

```
REQUIREMENT: The type of `Plugin.define` MUST reject, as a compile error, a
             `build` whose output (`ROut`) does not cover every identifier in
             `IdentifiersOf<Provides>`.
```

```
REQUIREMENT: `IdentifiersOf` MUST distribute over the members of the tuple,
             so that an empty tuple yields `never`. A plugin that provides
             nothing MUST type-check with a `build` of `Layer<never, …>`.
```

The non-distributive form `K[number] extends Context.Key<infer I, any> ? I :
never`, which SPEC.md used, yields `unknown` for an empty tuple: `K[number]`
is `never`, the check is not distributed, and `I` is inferred as `unknown`. A
plugin with `provides: []` would then have to build a layer providing
`unknown`. The prototype's compiler found this (prototype finding G10,
`prototypes/host-core`).

```
REQUIREMENT: A service that `build` does not need but that a method it
             returns reaches at call time MUST still be declared in
             `requires` by the author. Documentation MUST state that the
             type-level check does not see such a requirement.
```

This is the only type-level guarantee Bridger offers, and it is stated
narrowly so that nobody reads more into it. The constraint follows `RIn` and
`ROut` of the Layer: a plugin that yields a key in `build` without declaring
it fails to compile. A requirement hidden inside a returned method — a closure
that calls `yield* Mailer` only when invoked — is invisible to the Layer's
types. If the author omits it from `requires`, the plugin may start without
its dependency and fail later inside a caller's operation. That is an author
contract, and the specification says so rather than implying coverage it does
not have.

## BEH-BR-003: Runtime key lists are required and must be well-formed

> **Invariant:** [INV-BR-012](../invariants.md#inv-br-012-a-definition-error-registers-nothing)
> **Satisfies:** [URS-BR-001](../urs.md#urs-br-001-install-plugins-at-runtime-without-ordering-providers)

```
REQUIREMENT: `requires` and `provides` MUST be present at runtime as lists of
             Context keys. The host MUST resolve plugins from these lists,
             never from the Layer's types, which do not exist at runtime.
```

```
REQUIREMENT: `install` (and `replace`, and `enable` where it re-checks) MUST
             reject a definition with `InvalidDefinition { id, reason }`
             when any of the following holds:
             (a) `id` is not a non-empty string, or has leading or trailing
                 whitespace;
             (b) an element of `requires`, `provides` or `optional` is not a
                 Context key with a string identifier;
             (c) one `ServiceId` appears twice within `requires`, within
                 `provides`, or within `optional`;
             (d) one `ServiceId` appears in both `requires` and `provides`;
             (e) one `ServiceId` appears in both `requires` and `optional`;
             (f) one `ServiceId` appears in both `provides` and `optional`;
             (g) `volatile` is declared without `config`, or names
                 something that is not a top-level field of the `config`
                 schema (11 — Configuration);
             (h) `health` is declared with a `failureThreshold` below 1
                 (10 — Runtime Failure and Health).
```

The type erasure is the reason the lists exist at all: the resolver wires
plugins dynamically while the program runs, and it can only read values. The
Layer's types and the lists must agree, which BEH-BR-002 enforces at compile
time for the common case; the runtime checks catch what a type cannot, such as
a definition produced by an untyped loader. `reason` names which rule failed;
it carries identifiers only (see [ADR-BR-008](../decisions/008-error-taxonomy.md)).

A rejected definition registers nothing — that rule belongs to `install` and
is specified in [03 — Installation](./03-installation.md).

**Settled here.** SPEC.md said `InvalidDefinition` covers "malformed `id`,
`requires` or `provides`, a plugin that requires a key it also provides, or a
key listed in both `requires` and `optional`", without defining "malformed".
This specification defines it as rules (a)–(c) and adds (f): a plugin that
lists a key it provides as optional would resolve against itself, which is the
same self-dependency rule (d) forbids for `requires`. Rules (g) and (h) are
the install-time checks that [11 — Configuration](./11-configuration.md) and
[10 — Runtime Failure and Health](./10-runtime-failure-and-health.md) settle,
listed here so that the complete set of `InvalidDefinition` causes is in one
place. The rules are
deliberately strict; relaxing one later is compatible, tightening one after
release would not be.

## BEH-BR-004: Plugin.fromEffect is sugar, not a second mechanism

> **See:** [ADR-BR-002](../decisions/002-plugin-build-is-a-layer.md)

```ts
// illustrative — not type-checked
// For authors who prefer an Effect that returns a Context
// (built with Layer.effectContext or equivalent).
Plugin.fromEffect<Requires extends Keys, Provides extends Keys, E>(
  build: Effect.Effect<
    Context.Context<IdentifiersOf<Provides>>,
    E,
    IdentifiersOf<Requires> | Scope.Scope | Plugin.Runtime
  >
): Layer.Layer<IdentifiersOf<Provides>, E, IdentifiersOf<Requires> | Plugin.Runtime>
```

```
REQUIREMENT: `Plugin.fromEffect` MUST return an ordinary `Layer` equivalent
             to `Layer.effectContext` over the given Effect. A plugin built
             this way MUST be activated, published and stopped by exactly
             the same rules as any other `build`.
```

One activation path means one set of guarantees to test. The sugar exists for
readability only; it must never become a route around fresh memo maps,
forked scopes or atomic publication ([05 — Activation](./05-activation.md)).

## BEH-BR-005: A plugin's identity is its ID within a realm

> **See:** [ADR-BR-006](../decisions/006-one-instance-per-id-per-realm.md)
> **Satisfies:** [URS-BR-011](../urs.md#urs-br-011-run-the-same-plugin-once-per-tenant-or-database)

```
REQUIREMENT: A plugin ID MUST be stable within one host and realm. The pair
             (realm, `id`) MUST be the plugin's instance identity; `install`
             MUST NOT accept a separate instance key.
```

```
REQUIREMENT: A second installation of an ID already known in the same realm
             MUST fail with `DuplicatePlugin` (03 — Installation). The same
             definition MAY be installed into two different realms
             (17 — Realms and Interception).
```

With one provider per key per realm
([ADR-BR-003](../decisions/003-one-provider-per-key-per-realm.md)), a second
instance in the same resolution scope could not publish its services anyway.
Making the ID-within-realm the identity lets every operation, snapshot entry,
error and audit record name a plugin unambiguously with two strings.

## BEH-BR-006: Service keys are matched by ServiceId

> **Invariant:** [INV-BR-015](../invariants.md#inv-br-015-key-identity-is-checked-by-identifier-and-by-object)
> **See:** [ADR-BR-011](../decisions/011-serviceid-is-key-identity.md)

```ts
// illustrative — not type-checked
type ServiceId = string // the key's identifier: `key.key` of a Context.Service
```

```
REQUIREMENT: The host MUST match a required key to a provider by its
             `ServiceId`, the key's own string identifier (`key.key`).
```

```
REQUIREMENT: When a required key and the active provider's key share a
             `ServiceId` but are different key objects, the host MUST NOT
             assume their shapes agree; the activation MUST fail with
             `KeyMismatch` as specified in 05 — Activation.
```

```
REQUIREMENT: Snapshots, events, errors, inspection results and audit
             records MUST identify services by `ServiceId`, never by key
             object.
```

Matching by identifier is what lets keys work across separately bundled
plugins, where the same package can be loaded twice and produce two key
objects. Matching by identifier alone, though, would silently wire a consumer
to a service of whatever shape the other copy of the package defines. The
second check — same identifier, different object, fail — turns that silent
mismatch into a visible activation failure. Both checks together are the
invariant.

## BEH-BR-007: A changed service shape needs a new ServiceId

> **See:** [ADR-BR-011](../decisions/011-serviceid-is-key-identity.md)
> **Risk:** [RSK-BR-010](../gxp/03-risk-assessment.md#rsk-br-010)

```
REQUIREMENT: Documentation MUST state that the core cannot detect a changed
             service shape under an unchanged `ServiceId`.
```

```
REQUIREMENT: An author who makes a breaking change to a service SHOULD give
             it a new identifier carrying the major version (for example
             `example/Audit@2`).
```

```
REQUIREMENT: The core MUST NOT perform API-version checks on services. Such
             checks belong to a distribution or loader layer outside core.
```

The `KeyMismatch` check catches two *objects* with one identifier; it cannot
catch one identifier whose meaning changed between releases when only one copy
is loaded. Nothing at runtime carries the shape. The residual risk is
recorded as RSK-BR-010, and the mitigation is a naming convention plus the
manifest-level checks a distribution layer may add (see `docs/ERP-DISTRIBUTION.md`
in the source design). The core claims nothing beyond identifier and object
identity.

## BEH-BR-008: A plugin entry has no import-time side effects

> **See:** [ADR-BR-027](../decisions/027-core-exclusions.md)
> **Satisfies:** [URS-BR-020](../urs.md#urs-br-020-load-plugin-definitions-dynamically-while-running)
> **Risk:** [RSK-BR-017](../gxp/03-risk-assessment.md#rsk-br-017)

```ts
// illustrative — not type-checked
const { plugin } = await import(pluginEntryUrl)
await Effect.runPromise(host.install(plugin))
```

```
REQUIREMENT: A host that is not closed MUST accept a `PluginDefinition` at
             any time, including one produced by a dynamic `import()` while
             the host is running.
```

```
REQUIREMENT: The core MUST NOT fetch, verify, version or sandbox plugin
             packages, and MUST NOT read or modify any module cache. These
             belong to an optional loader adapter.
```

```
REQUIREMENT: A plugin entry module MUST have no import-time side effects;
             its runtime work MUST be performed in the scoped `build`. This
             is an author obligation that the core cannot enforce, and
             documentation MUST say so.
```

```
REQUIREMENT: Documentation MUST NOT claim that `remove` or `replace`
             reclaims imported code from the JavaScript runtime. They
             deactivate behaviour and release tracked resources only.
```

Work done at import time happens before any host exists to scope it: it runs
once per import, is never finalised, and survives every `remove`. Keeping all
runtime work in `build` is what makes a definition removable at all.

The core performs no integrity check on loaded code. `meta.digest` is opaque
to it except for `reconcile`'s comparison ([18 — Reconciliation and
Confluence](./18-reconciliation-and-confluence.md)); the core neither computes
nor verifies it. Verifying what was loaded — signature, digest, provenance —
is the loader adapter's and the consumer's responsibility (RSK-BR-017), and
nothing in this specification should be read as Bridger performing it.

---

_Previous: [Invariants](../invariants.md)_ · _Next: [02 — Host Construction](./02-host-construction.md)_
