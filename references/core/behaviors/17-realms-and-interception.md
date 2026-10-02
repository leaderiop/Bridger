# 17 — Realms and Interception

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-BEH-17                                               |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.2 (2026-10-02): A child's own `intercept` replaces the interceptions it inherits; realm interceptors are never inherited; composition order restated (prototype finding G24) (CCR-BR-010)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001)                 |

---

The core rule is one provider per service key. Some applications need the same
plugin twice — once per tenant, once per database — and each copy must see its
own provider of a key while sharing everything else. A realm is the answer: a
named service-resolution namespace that makes the rule "one provider per key
**per realm**". An interception is the companion mechanism that decorates a
service for the consumers in its scope. This file converts SPEC.md "Realms and
interception", and the realm parts of "Host interface" (`PluginRef`,
`InstallOptions.realm`, `InstallOptions.intercept`, `HostSnapshot.realms`).
This file owns BEH-BR-145–152 and uses all eight.

Planned source: `packages/core/src/Realm.ts` and `packages/core/src/Resolver.ts`
*(Planned)*. How `defineRealm` is attributed, gated and audited is in
[22 — Attributable Operations](./22-attributable-operations.md),
[23 — Audit Sink and Record](./23-audit-sink-and-record.md) and
[25 — Operation Gate](./25-operation-gate.md).

## BEH-BR-145: A realm is a named resolution namespace, and "default" always exists

> **Invariant:** [INV-BR-020](../invariants.md#inv-br-020-a-realm-changes-resolution-only)
> **See:** [ADR-BR-019](../decisions/019-realms-are-resolution-namespaces.md), [ADR-BR-003](../decisions/003-one-provider-per-key-per-realm.md)
> **Satisfies:** [URS-BR-011](../urs.md#urs-br-011-run-the-same-plugin-once-per-tenant-or-database)

```ts
// illustrative — not type-checked
interface RealmOptions {
  readonly isolate: readonly Context.Key<any, any>[]     // keys that resolve inside this realm
  readonly interceptors?: readonly Interception<any>[]   // applied to every plugin installed in the realm
}

interface Host {
  defineRealm(id: string, options: RealmOptions, operation?: OperationOptions):
    Effect.Effect<
      void,
      | DuplicateRealm | HostClosed
      | Unattributed | ReasonRequired | AuditUnavailable | OperationRejected
    >
}

host.defineRealm("tenant-a", { isolate: [Database] })
host.install(repository, { realm: "tenant-a" })
```

```
REQUIREMENT: Every host MUST have a realm with id "default" from construction
             until close. It isolates no key and needs no `defineRealm` call.
```

```
REQUIREMENT: `defineRealm(id, options)` MUST register a realm with the given
             isolated keys and interceptors. Defining an id that already
             exists — including "default" — MUST fail with
             `DuplicateRealm { id }` and MUST leave the existing realm
             unchanged.
```

```
REQUIREMENT: A realm's `isolate` and `interceptors` MUST be fixed when it is
             defined. No operation changes or deletes a realm; a realm lives
             as long as its host.
```

```
REQUIREMENT: `defineRealm` is a mutating host operation. It MUST follow the
             call order of BEH-BR-188 (attribution, latch, validation, gate,
             audit) like every other mutating operation; `DuplicateRealm` is
             its validation step.
```

A realm only decides *which provider a key resolves to*. It has no
lifecycle of its own beyond its definition, which is why there is no
`removeRealm`: removing a realm would mean deciding what happens to plugins
still installed in it, and the plugins are already removed individually by
the operations that own them. A realm that is no longer used costs one
entry in `HostSnapshot.realms`.

`defineRealm` takes its attribution as a third parameter rather than inside
`RealmOptions`, because `RealmOptions` describes the realm and is the same
value whoever defines it.

**Settled here.** (1) Redefining `"default"` fails with `DuplicateRealm`,
like any existing id; SPEC.md says only that the default realm "always
exists". (2) Realm definitions are immutable; SPEC.md gives no operation that
changes one, and an operation that silently re-resolved every installed
plugin would be a lifecycle change nobody asked for.

## BEH-BR-146: A key resolves inside a realm only when the realm isolates it

> **Invariant:** [INV-BR-020](../invariants.md#inv-br-020-a-realm-changes-resolution-only)
> **See:** [ADR-BR-019](../decisions/019-realms-are-resolution-namespaces.md)
> **Satisfies:** [URS-BR-011](../urs.md#urs-br-011-run-the-same-plugin-once-per-tenant-or-database)

```ts
// The resolution scope of a key K for a plugin installed in realm R:
//   scopeOf(R, K) = K ∈ isolate(R) ? R : "default"
```

```
REQUIREMENT: For a plugin installed in realm R, each required or optional
             key K MUST resolve only against providers in the resolution
             scope scopeOf(R, K): providers installed in R when R isolates K,
             and providers in the default realm (including base services)
             otherwise.
```

```
REQUIREMENT: A key isolated by realm R MUST NOT resolve, for any consumer
             outside R, to a provider installed in R. Isolated keys never
             leak out of their realm.
```

```
REQUIREMENT: A key K provided by a plugin installed in realm R MUST occupy
             the provider slot of scopeOf(R, K): R's own slot when R
             isolates K, otherwise the default realm's slot.
```

```
REQUIREMENT: When R isolates a key that the base Context or base Layer also
             provides, plugins in R MUST NOT resolve that key to the base
             service; inside R only providers installed in R count.
```

The resolution scope is the one concept the rest of the core uses: provider
slots, `DuplicateProvider`, dependency-cycle detection, lease admission and
removal ordering all work "per resolution scope", and `scopeOf` defines it.

**Settled here.** (1) SPEC.md states the resolution rule for *consumers* but
not where a non-isolated key provided from inside a realm is published. It is
published into the default realm's slot. This is the only reading that keeps
SPEC.md decision 4 true — "a definition that must run twice is installed into
two realms **that isolate its keys**": without isolation, the second install
collides with the first in the default slot (`DuplicateProvider`). (2) A
realm may isolate a key that is also a base service; inside that realm the
base service is invisible. This is how a tenant realm gets its own
`Database` while the default realm keeps the application's.

## BEH-BR-147: Plugin ids and provider slots are unique per realm

> **Invariant:** [INV-BR-001](../invariants.md#inv-br-001-one-provider-per-service-key-per-realm)
> **See:** [ADR-BR-006](../decisions/006-one-instance-per-id-per-realm.md), [ADR-BR-003](../decisions/003-one-provider-per-key-per-realm.md)
> **Satisfies:** [URS-BR-011](../urs.md#urs-br-011-run-the-same-plugin-once-per-tenant-or-database)

```ts
type PluginRef = string | { readonly id: string; readonly realm: string }   // a bare string means "default"

interface InstallOptions extends OperationOptions {
  readonly realm?: string                          // default: "default"
  readonly config?: unknown
  readonly disabled?: boolean
  readonly intercept?: readonly Interception<any>[]
}
```

```
REQUIREMENT: A plugin's identity MUST be the pair (id, realm). Installing an
             id already installed in the same realm MUST fail with
             `DuplicatePlugin`; installing it into a different realm MUST be
             allowed.
```

```
REQUIREMENT: `install` into a realm that has not been defined MUST fail with
             `UnknownRealm { id }` and MUST register nothing.
```

```
REQUIREMENT: Every plugin-addressed operation MUST take a `PluginRef`; a bare
             string MUST mean the plugin of that id in the default realm.
             `use`, `useAll` and `lease` MUST take a `realm` option whose
             default is "default", and resolve their keys with scopeOf of
             that realm.
```

```
REQUIREMENT: `use`, `useAll` and `lease` naming a realm that has not been
             defined MUST fail with `UnknownRealm { id }` without admitting
             any lease or running any callback; `UnknownRealm` is part of
             their error unions.
```

```
REQUIREMENT: Base services MUST belong to the default realm.
```

This is the proper replacement for SPEC.md's "factory with distinct IDs and
keys" workaround: the same definition object can be installed into
`tenant-a` and `tenant-b`, each copy publishing its isolated keys into its own
realm's slot.

## BEH-BR-148: Duplicate-provider and cycle checks run per resolution scope

> **Invariant:** [INV-BR-002](../invariants.md#inv-br-002-the-dependency-graph-is-acyclic-per-resolution-scope)
> **See:** [ADR-BR-003](../decisions/003-one-provider-per-key-per-realm.md)

```
REQUIREMENT: `DuplicateProvider` MUST be decided against the provider slot of
             scopeOf(R, K) for each provided key K, and against nothing else.
```

```
REQUIREMENT: Dependency-cycle detection MUST run over the graph whose edges
             join a consumer to the provider its key resolves to under
             scopeOf. A cycle that exists only across two realms' isolated
             slots is not a cycle unless resolution actually connects it.
```

```
REQUIREMENT: Removal ordering, lease admission and dependents-first stopping
             MUST follow the same resolved edges, so a provider in the
             default realm that serves consumers in several realms stops only
             after all of those consumers.
```

Because a non-isolated key provided from inside a realm lands in the default
slot (BEH-BR-146), the graph can cross realms. Running every check over the
*resolved* graph, not over a per-realm partition, is what keeps the ordering
guarantees true across that crossing.

## BEH-BR-149: Snapshots record realm membership

> **See:** [ADR-BR-014](../decisions/014-discriminated-plugin-snapshot.md)
> **Satisfies:** [URS-BR-004](../urs.md#urs-br-004-know-why-a-plugin-is-not-running)

```ts
interface HostSnapshot {
  // ...
  readonly availableServiceIds: readonly ServiceId[]   // the default realm's list, including base services
  readonly realms: readonly {
    readonly id: string
    readonly isolatedServiceIds: readonly ServiceId[]
    readonly availableServiceIds: readonly ServiceId[]
  }[]
}
// PluginCommon.realm: "default" unless installed into a realm
```

```
REQUIREMENT: Every `PluginSnapshot` MUST carry its realm. `HostSnapshot.realms`
             MUST list every defined realm, including "default", with its
             isolated service ids and the service ids available in it.
```

```
REQUIREMENT: The top-level `HostSnapshot.availableServiceIds` MUST remain the
             default realm's list, so that an adapter written before realms
             existed keeps its meaning.
```

```
REQUIREMENT: A realm's `availableServiceIds` MUST be computed with scopeOf:
             the keys it isolates that have an active provider in it, plus
             the default realm's available keys that it does not isolate.
```

Snapshots hold service identifiers, never keys (SPEC.md "Host interface").
`RealmOptions.isolate` holds key objects; the snapshot shows their `key.key`.

## BEH-BR-150: A realm is not a security boundary

> **Invariant:** [INV-BR-020](../invariants.md#inv-br-020-a-realm-changes-resolution-only)
> **See:** [ADR-BR-019](../decisions/019-realms-are-resolution-namespaces.md), [ADR-BR-027](../decisions/027-core-exclusions.md)
> **Risk:** [RSK-BR-013](../gxp/03-risk-assessment.md#rsk-br-013)

```
REQUIREMENT: A realm MUST change service resolution only. It MUST NOT be
             described, in documentation, types, errors or events, as
             isolation, sandboxing, tenancy enforcement or access control.
```

```
REQUIREMENT: Plugins in different realms share one process, one host scope,
             one event bus and one heap. Core MUST NOT claim otherwise.
```

The failure this prevents is a tenant-separation argument built on the word
"isolate". A plugin in `tenant-a` can import a module that holds
`tenant-b`'s database handle, read a global, or simply be handed the other
service by a wrapper. A consumer that needs tenant data separation must build
it in the services themselves (separate credentials, separate connections),
and in a regulated deployment must justify it in its own risk assessment. The
word `isolate` in `RealmOptions` names the resolution rule, nothing more.

## BEH-BR-151: An interception wraps a service per consumer at capture

> **See:** [ADR-BR-019](../decisions/019-realms-are-resolution-namespaces.md), [ADR-BR-010](../decisions/010-cordis-parity.md)

```ts
interface Interception<S> {
  readonly key: Context.Key<any, S>
  readonly wrap: (service: S, consumer: { readonly pluginId: string; readonly realm: string }) => S
}
```

```
REQUIREMENT: When the host captures a provider's service for a consumer
             plugin that is in scope of an interception for that key, the
             consumer MUST receive `wrap(service, consumer)` instead of the
             service. This applies to every capture made for that consumer:
             required keys at activation, and optional keys read through
             `Plugin.Runtime.optional`, `useOptional` and `whenAvailable`.
```

```
REQUIREMENT: A consumer is in scope of an interception set by its realm's
             `interceptors`, by its own `InstallOptions.intercept`, or
             inherited from its parent plugin. A child inherits the
             interceptions its parent inherited and those of the parent's
             own `InstallOptions.intercept` — never the parent's realm
             interceptors, which reach a child only through the child's own
             realm — unless the child's install options set `intercept`,
             which then replaces the inherited interceptions.
```

```
REQUIREMENT: When several interceptions apply to one key, they MUST compose
             in this fixed order, each wrapping the result of the previous:
             realm interceptors (in list order), then the consumer's
             inherited interceptions or, when it has them, those of its own
             `InstallOptions.intercept` (in list order). The realm's
             interceptors are therefore always the innermost.
```

```
REQUIREMENT: `wrap` MUST be applied once per capture per activation. A
             restart captures again and therefore wraps again.
```

```
REQUIREMENT: Interception MUST NOT apply to `Host.use`, `useAll` or `lease`
             called by application code that is not a plugin activation;
             those callers receive the provider's service unwrapped.
```

Typical uses are a per-plugin logger with annotations, a rate-limiting
wrapper and tracing. The `consumer` argument carries the plugin id and realm
so a wrapper can label what it wraps without a per-plugin service.

**Settled here.** (1) SPEC.md lists three sources of interception but no
composition order; the order above is fixed so that a wrapped service is the
same for the same configuration on every host. (2) SPEC.md does not say
whether optional and reactive captures are intercepted; they are, because a
service reached optionally is still that consumer's view of the provider.
(3) Application callers of `Host.use` are not "consumers" in SPEC.md's sense
(a consumer is a plugin) and are not wrapped. (4) Revision 0.1 composed
"realm, then inherited, then own", but BEH-BR-122 lets a child's own
`intercept` replace what it inherits, so the two middle terms never applied
together, and it did not say whether a parent's realm interceptors were
inherited. They are not: a child in another realm would otherwise carry the
first realm's decoration into the second (URS gap G24, CCR-BR-010).

## BEH-BR-152: An interception changes neither leases nor other consumers

> **Invariant:** [INV-BR-006](../invariants.md#inv-br-006-a-leased-provider-does-not-close-under-its-lease)
> **See:** [ADR-BR-019](../decisions/019-realms-are-resolution-namespaces.md)
> **Risk:** [RSK-BR-013](../gxp/03-risk-assessment.md#rsk-br-013)

```
REQUIREMENT: Leases, drain and removal ordering MUST be on the provider, not
             on the wrapper. Wrapping a service MUST NOT create, extend or
             shorten a lease.
```

```
REQUIREMENT: A wrapper MUST be created per consumer. It MUST NOT be shared
             with, and MUST NOT be able to change what is delivered to, any
             other consumer of the same provider.
```

```
REQUIREMENT: A `wrap` that throws or dies MUST fail the consumer's
             activation with phase `activation`; the consumer MUST NOT be
             published and the provider MUST be unaffected.
```

```
REQUIREMENT: An authorization or rate-limiting wrapper MUST NOT be described
             as an access-control boundary: a wrapper that leaks the
             underlying object, and code that reaches the provider by another
             route, are outside what core can prevent.
```

A wrapper is ordinary code that holds a reference to the real service, so
whatever it returns can expose that reference. That is the author's
responsibility, exactly as for any service. Core's promise is narrower and
checkable: the right wrapper reaches the right consumer, once per activation,
and the provider's lifecycle does not notice it.

**Settled here.** SPEC.md does not say what happens when `wrap` fails. Failing
the consumer's activation (phase `activation`) is the conservative choice: a
consumer that would otherwise receive an unwrapped service has lost the
decoration its configuration asked for (perhaps a rate limit), and running it
anyway would hide that.

---

_Previous: [16 — Event Bus](./16-event-bus.md)_ · _Next: [18 — Reconciliation and Confluence](./18-reconciliation-and-confluence.md)_
