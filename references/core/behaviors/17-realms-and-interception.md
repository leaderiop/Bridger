# 17 — Realms and Interception

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-BEH-17                                               |
> | Revision       | 0.7                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.7 (2026-11-11): `InvalidRealm` comment names the `Realm.ephemeral` segment and owner-actor reasons beside the host-owned `ServiceId` (CL8) (SPEC-AUDIT-06) (CCR-BR-038)<br>0.6 (2026-11-11): BEH-BR-147 the structured fields of errors, reports and snapshots name a plugin as `{ id, realm }` (or `id` and `realm` side by side); the canonical key only where one string is required, map keys included (C2) (SPEC-AUDIT-05) (CCR-BR-037)<br>0.5 (2026-11-10): BEH-BR-147 a plugin named by one string outside a `PluginRef` (`HeldPlugins`, `CurrentTransition`) uses the canonical key `JSON.stringify([realm, id])`, not a separator join (C1); BEH-BR-151 ordinary interception never applies to `Host.use`, `useAll` or `lease`, from plugin code included, as BEH-BR-262 states, Settled (3) (CL9) (CCR-BR-036)<br>0.4 (2026-11-09): BEH-BR-145 `defineRealm` refuses a realm that isolates a host-owned key with `InvalidRealm`, Settled (3); BEH-BR-146 Settled (2) a plugin in an isolating realm may provide a base key (C-02); BEH-BR-152 the outcome of a failing `wrap` on an optional or reactive capture, Settled note (U-06) (CCR-BR-032)<br>0.3 (2026-11-08): BEH-BR-145 `RealmOptions.mandatory`, BEH-BR-151 mandatory interceptions never replaced, composed outside, and applied to `Host.use` (CCR-BR-018); BEH-BR-145 a realm may be retired while empty by `retireRealm` (CCR-BR-019)<br>0.2 (2026-10-02): A child's own `intercept` replaces the interceptions it inherits; realm interceptors are never inherited; composition order restated (prototype finding G24) (CCR-BR-010)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001)                 |

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
> **See:** [ADR-BR-019](../decisions/019-realms-are-resolution-namespaces.md), [ADR-BR-003](../decisions/003-one-provider-per-key-per-realm.md), [ADR-BR-048](../decisions/048-realm-families-and-retirement.md)
> **Satisfies:** [URS-BR-011](../urs.md#urs-br-011-run-the-same-plugin-once-per-tenant-or-database)

```ts
// illustrative — not type-checked
interface RealmOptions {
  readonly isolate: readonly Context.Key<any, any>[]     // keys that resolve inside this realm
  readonly interceptors?: readonly Interception<any>[]   // applied to every plugin installed in the realm
  readonly mandatory?: readonly MandatoryInterception<any>[]   // cannot be replaced or removed (28, BEH-BR-260)
}

interface Host {
  defineRealm(id: string, options: RealmOptions, operation?: OperationOptions):
    Effect.Effect<
      void,
      | InvalidRealm | DuplicateRealm | HostClosed
      | Unattributed | ReasonRequired | AuditUnavailable | OperationRejected
    >
}

class InvalidRealm extends Schema.TaggedError<InvalidRealm>()("InvalidRealm",
  { id: Schema.String, reason: Schema.String }) {}               // reason names the host-owned ServiceId the realm would
                                                                 // isolate, or the segment or owner-actor rule a
                                                                 // Realm.ephemeral id breaks (33, BEH-BR-336)

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
REQUIREMENT: `defineRealm` MUST fail with `InvalidRealm { id, reason }`,
             registering nothing, when `options.isolate` lists a host-owned
             key — `Bridger.Host` or `Bridger.Events` (02 — Host
             Construction, BEH-BR-012) — with `reason` naming its
             `ServiceId`. When both errors apply, `InvalidRealm` MUST be
             reported, as `InvalidDefinition` precedes `DuplicatePlugin` for
             `install` (03 — Installation, BEH-BR-018).
```

```
REQUIREMENT: A realm's `isolate`, `interceptors` and `mandatory` MUST be
             fixed when it is defined. No operation changes a realm. A realm
             lives until its host closes or until `retireRealm` retires it
             while empty
             ([33 — Realm Families](./33-realm-families.md), BEH-BR-335).
```

```
REQUIREMENT: `defineRealm` is a mutating host operation. It MUST follow the
             call order of BEH-BR-188 (attribution, latch, validation, gate,
             audit) like every other mutating operation; `InvalidRealm` and
             `DuplicateRealm` are its validation step.
```

A realm only decides *which provider a key resolves to*. It has no
lifecycle of its own beyond its definition, which is why there is no
`removeRealm`: removing a realm would mean deciding what happens to plugins
still installed in it, and the plugins are already removed individually by
the operations that own them. `retireRealm` retires only an empty realm and
decides nothing about plugins (33, BEH-BR-335). A realm that is no longer used costs one
entry in `HostSnapshot.realms`.

`defineRealm` takes its attribution as a third parameter rather than inside
`RealmOptions`, because `RealmOptions` describes the realm and is the same
value whoever defines it.

**Settled here.** (1) Redefining `"default"` fails with `DuplicateRealm`,
like any existing id; SPEC.md says only that the default realm "always
exists". (2) Realm definitions are immutable; SPEC.md gives no operation that
changes one, and an operation that silently re-resolved every installed
plugin would be a lifecycle change nobody asked for. (3) A realm cannot
isolate the host or its bus (CCR-BR-032): plugins of every realm share one
host scope and one event bus (BEH-BR-150, INV-BR-020), and a realm that
isolated either would let a plugin installed in it provide its own.

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
`Database` while the default realm keeps the application's: a plugin
installed in that realm provides `Database` into the realm's own slot, and
the base rule of 02 — Host Construction, BEH-BR-012, which forbids a plugin
to provide a base key, applies only where the key resolves in the default
realm's scope (CCR-BR-032). The host-owned keys `Bridger.Host` and
`Bridger.Events` are the exception: no realm may isolate them
(BEH-BR-145).

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
             allowed. These structured fields of errors, reports and
             snapshots MUST name a plugin with both strings, as the record
             `{ readonly id: string; readonly realm: string }` (the shape of
             `FingerprintQuery.target`) or as `id` and `realm` fields side
             by side: `WouldDeadlock`, `DrainTimeout` (and its `target`),
             `CleanupError`, `DuplicateProvider` (`providerId` and
             `providerRealm`), `DependencyCycle.path`, the entries of
             `CloseReport` and `ReconcileReport`,
             `PluginSnapshot.providerIds` and the `TestHost`'s
             `PendingStep.waiter` (CCR-BR-037); a field added later that
             names a plugin other than the call's own target MUST do the
             same.
             Only where one string is required — the entries of
             `@bridger/core/HeldPlugins` and
             `@bridger/core/CurrentTransition`, and a key of a map or
             record — MUST the host use the canonical key
             `JSON.stringify([realm, id])`, with the default realm
             spelled "default" (09 — Leases, BEH-BR-088), never the bare id
             nor a separator join, since neither a realm id nor a plugin id
             has a grammar that would keep a separator out (CCR-BR-036).
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

> **See:** [ADR-BR-019](../decisions/019-realms-are-resolution-namespaces.md), [ADR-BR-010](../decisions/010-cordis-parity.md), [ADR-BR-043](../decisions/043-plugin-principal-and-mandatory-policy.md)

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
             which then replaces the inherited interceptions. A child's own
             `intercept` never replaces a mandatory interception (BEH-BR-260).
```

```
REQUIREMENT: When several interceptions apply to one key, they MUST compose
             in this fixed order, each wrapping the result of the previous:
             realm interceptors (in list order), then the consumer's
             inherited interceptions or, when it has them, those of its own
             `InstallOptions.intercept` (in list order). The realm's
             interceptors are therefore always the innermost. Mandatory
             interceptions and the capability layers compose outside these,
             in the order of BEH-BR-261.
```

```
REQUIREMENT: `wrap` MUST be applied once per capture per activation. A
             restart captures again and therefore wraps again.
```

```
REQUIREMENT: Interception MUST NOT apply to `Host.use`, `useAll` or `lease`,
             whoever calls them — application code or code running in a
             plugin activation; those callers receive the provider's
             service unwrapped (CCR-BR-036) — except
             mandatory interceptions, which apply to these calls as
             [28 — Plugin Principal and Mandatory Policy](./28-plugin-principal-and-mandatory-policy.md),
             BEH-BR-262, specifies.
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
(a consumer is a plugin) and are not wrapped; a plugin's own `Host.use` call
is not a capture and is not wrapped by ordinary interceptions either (28,
BEH-BR-262). (4) Revision 0.1 composed
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
REQUIREMENT: A `wrap` that throws or dies on a capture made at activation —
             a required key — MUST fail the consumer's activation with phase
             `activation`; the consumer MUST NOT be published and the
             provider MUST be unaffected.
```

```
REQUIREMENT: A `wrap` that throws or dies on an optional or reactive
             capture (BEH-BR-151) MUST NOT deliver the service, wrapped or
             not, and MUST leave the provider and the consumer's state
             unaffected:
             - `Plugin.Runtime.optional` MUST die with the wrap's defect;
             - `useOptional` MUST release its lease, MUST NOT run `run`,
               and MUST die with the wrap's defect;
             - a `whenAvailable` run MUST fail before `run` starts, with its
               lease released and its child scope closed, and the failure
               MUST be handled by the registration's `onFailure` policy
               (15 — Optional and Reactive Dependencies, BEH-BR-134).
             A capture made by code the consumer's `build` runs fails that
             build as any defect in it does.
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

**Settled here (CCR-BR-032).** The rule above could not apply to a capture
made after activation, when the consumer is already `active`; such a
capture had no outcome. It now fails the call that made it, as the same
failure of a mandatory wrap fails `Host.use` (28 — Plugin Principal and
Mandatory Policy, BEH-BR-262): a throwing `wrap` is a programming defect,
so it is a defect of the call, not a typed error every caller of `optional`
would have to handle, and the service is never handed over without the
decoration its configuration asked for. A `whenAvailable` run has no caller,
so its failure goes to the policy the registration chose.

---

_Previous: [16 — Event Bus](./16-event-bus.md)_ · _Next: [18 — Reconciliation and Confluence](./18-reconciliation-and-confluence.md)_
