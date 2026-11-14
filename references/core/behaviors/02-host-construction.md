# 02 — Host Construction

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-BEH-02                                               |
> | Revision       | 0.13                                                         |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.13 (2026-11-11): BEH-BR-013 `ReplaceOptions.cold`, and `ReconcileOptions.cold` noted beside `HandoffCallOptions` (H9); BEH-BR-011 no timeout option accepts "forever" (CL6); BEH-BR-014 `OperationContext` carries `annotations` (CL5) (SPEC-AUDIT-05) (CCR-BR-037)<br>0.12 (2026-11-10): BEH-BR-010 `HeldPlugins` and `CurrentTransition` hold canonical keys `JSON.stringify([realm, id])`; BEH-BR-013 plugins in different realms are distinct for the re-entrancy check, `WouldDeadlock` carries `realm` (C1); BEH-BR-010 the `ActivePlugin` reference carries `Option<ActivePlugin>` (`pluginId`, `realm`, `report`) (C12) (CCR-BR-036)<br>0.11 (2026-11-10): BEH-BR-010 the `CurrentTransition` reference, exported for hand-offs, `HeldPlugins` for leases only (H1); BEH-BR-014 `shutdown`'s union includes `WouldDeadlock` (H2), and `declaredContributions` and `offerCallEntry` are listed as not mutating (audit round 3, Low) (CCR-BR-035)<br>0.10 (2026-11-10): BEH-BR-011 a `baseContracts` entry naming a key the base does not provide fails construction once the base is built, the other option checks before (audit round 2, Low); BEH-BR-010 `HostLink` is set in every fiber running plugin or callback code (Low); BEH-BR-013 `shutdown` gains `WouldDeadlock` (C6) (CCR-BR-034)<br>0.9 (2026-11-09): BEH-BR-016 the `hostId` is unique among the hosts that share a store, by the uniqueness rule of BEH-BR-210 (F-03) (CCR-BR-033)<br>0.8 (2026-11-09): BEH-BR-012 the base-key rule scoped to the default realm's resolution scope, an isolating realm may provide a base key, the host-owned keys `Bridger.Host` and `Bridger.Events` never provided or isolated (C-02); BEH-BR-013 made the single source of host signatures: `restart` and `reconfigure` take `HandoffCallOptions`, `reconcile` adds `ApplyRolledBack` and `PartialApply`, `defineRealm` adds `InvalidRealm`, Settled note (C-01) (CCR-BR-032)<br>0.7 (2026-11-08): BEH-BR-010 `HostLink` reference and BEH-BR-013 `declaredContributions` and `link` (CCR-BR-024); BEH-BR-011 option `mandatoryCatalog` and its domain rule (CCR-BR-025)<br>0.6 (2026-11-08): BEH-BR-010 `CurrentCorrelation` reference; BEH-BR-013 `offerCallEntry`, Settled item 8; BEH-BR-015 the `RefusalList` port and the `CallLog` fields read at construction (CCR-BR-026)<br>0.5 (2026-11-08): `wake` takes no `OperationContext` and is a class of its own (system transitions only); generic `install`/`replace` overloads take the branded `Plugin` (CCR-BR-022)<br>0.4 (2026-11-08): BEH-BR-011 options `mandatory`, `resolutionTimeout`, `callLogTimeout` (CCR-BR-018), `baseContracts` (CCR-BR-017), `handoffTimeout` (CCR-BR-019); BEH-BR-013 `Plugin.Any` overloads (CCR-BR-020), `wake` (CCR-BR-017), `plan`, `retireRealm`, `PlanStale` (CCR-BR-019), `ResolutionRefused` (CCR-BR-018); BEH-BR-014 `retireRealm` operation; BEH-BR-015 policy ports, context references (CCR-BR-018) and `EntitlementView` (CCR-BR-020)<br>0.3 (2026-10-03): BEH-BR-011 `fingerprintTimeout` option and its domain rule; BEH-BR-013 `controls()` observation member and `ConfigFingerprintUnavailable` in the `install` and `reconfigure` unions (per entry for `reconcile`), Settled item 7; BEH-BR-014 `controls` is not mutating; BEH-BR-015 `ConfigFingerprinter` read once at construction, and an unwired fingerprinter changes nothing (CCR-BR-014)<br>0.2 (2026-10-02): HeldPlugins also carried by builds and finalizers; `concurrency` bounds builds only; `retry` and `enable` add `WouldDeadlock` (CCR-BR-008)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001)                 |

---

This file specifies how a host comes into existence and what it exposes:
`Bridger.layer` and `Bridger.make`, `BridgerOptions`, base services supplied as
a `Context` or a `Layer`, the service keys and context references the package
defines, the complete `Host` interface, and how every mutating method carries
an `OperationOptions` and the GxP errors. It converts the SPEC.md section
"Host interface" (its signatures, `BridgerOptions`, the base-service paragraph
and the service keys); the semantics of the individual operations are
specified in the files that own them, named beside each member. This file
owns BEH-BR-009–016 and uses all eight.

The planned source locations are `packages/core/src/Bridger.ts` and
`packages/core/src/Host.ts` *(Planned)*.

## BEH-BR-009: Bridger.layer is the primary constructor; Bridger.make is its body

> **See:** [ADR-BR-001](../decisions/001-effect-v4-as-effect-system.md), [ADR-BR-009](../decisions/009-managedruntime-hosting.md)
> **Satisfies:** [URS-BR-001](../urs.md#urs-br-001-install-plugins-at-runtime-without-ordering-providers), [URS-BR-018](../urs.md#urs-br-018-host-plugins-from-code-that-does-not-use-effect)

```ts
// illustrative — not type-checked
// Bridger.Host is a service key: Context.Service<Bridger.Host, Host>, identifier "@bridger/core/Host".
Bridger.layer<EBase = never>(options?: BridgerOptions<EBase>): Layer.Layer<Bridger.Host, EBase>
Bridger.make<EBase = never>(options?: BridgerOptions<EBase>): Effect.Effect<Host, EBase, Scope.Scope>
```

```
REQUIREMENT: `Bridger.layer` MUST be the primary constructor of a host, and
             `Bridger.make` MUST be its body for code that already holds a
             `Scope`. Both MUST produce a host with identical behaviour.
```

```
REQUIREMENT: Closing the owning scope, or releasing the layer, MUST close
             every installed plugin through the shutdown path of
             12 — Shutdown and Hosting.
```

```
REQUIREMENT: Constructing a host MUST NOT install, build or start any
             plugin. A new host has an empty plugin set.
```

```
REQUIREMENT: When a `Layer` base fails to build, `Bridger.layer` and
             `Bridger.make` MUST fail with that failure, and no host MUST
             exist.
```

A layer is the Effect-native way to give a service a lifetime, so the host is
one: an application composes `Bridger.layer(...)` into its own layer graph,
or holds it through `ManagedRuntime` when it is not an Effect program
([12 — Shutdown and Hosting](./12-shutdown-and-hosting.md)). `make` exists for
scoped code and tests that do not want a layer.

**Settled here.** SPEC.md typed `Bridger.layer` as `Layer.Layer<Bridger.Host>`
with no error channel, while also requiring that "a base build failure fails
`Bridger.layer`". This specification gives both constructors the base
layer's error type `EBase` (default `never`), so the failure the SPEC.md
requires is representable in the type rather than surfacing as a defect.

## BEH-BR-010: Service keys and context references

> **See:** [ADR-BR-001](../decisions/001-effect-v4-as-effect-system.md)

```ts
// illustrative — not type-checked
// Context.Service keys (identifiers are exact)
Bridger.Host       // "@bridger/core/Host"            — the host, provided by Bridger.layer
Plugin.Runtime     // "@bridger/core/Plugin.Runtime"  — per activation, input of `build` (10)
Plugin.Config      // "@bridger/core/Plugin.Config"   — per activation, input of `build` (11)
                   //   shape { value: C; current: Effect<C>; changes: Stream<C> }
Bridger.Events     // "@bridger/core/Events"          — typed event bus, a base service (16)

// Context.Reference values (identifiers and defaults are exact)
HeldPlugins        // "@bridger/core/HeldPlugins"   ReadonlySet<string>, default: empty set (09; leases); elements are canonical keys JSON.stringify([realm, id])
CurrentTransition  // "@bridger/core/CurrentTransition"  Option<string>, default: none (09, BEH-BR-088; builds, `load`, finalizers; exported for hand-offs like HeldPlugins); a canonical key JSON.stringify([realm, id])
ActivePlugin       // "@bridger/core/ActivePlugin"  Option<ActivePlugin> ({ pluginId, realm, report }), default: none (13, BEH-BR-119)
CurrentActor       // "@bridger/core/CurrentActor"  default: Actor.unattributed (22)
CurrentCorrelation // "@bridger/core/CurrentCorrelation"  default: none (22, BEH-BR-187)
HostLink           // "@bridger/core/HostLink"      Option<HostLink>, default: none (27, BEH-BR-250; set by the host in every fiber it runs plugin or callback code in)
```

```
REQUIREMENT: Each service key and context reference above MUST use exactly
             the identifier shown, and each reference MUST have exactly the
             default shown.
```

```
REQUIREMENT: `Plugin.Runtime` and `Plugin.Config` MUST be provided by the
             host to each `build` as part of its input, afresh for each
             activation. They MUST NOT appear in the host's static
             environment.
```

```
REQUIREMENT: `Bridger.Events` MUST be available to every plugin as a base
             service of the host, so that a plugin may list it in
             `requires` like any other key.
```

Fixed string identifiers are what make keys work across bundles
([01 — Plugin Definition](./01-plugin-definition.md), BEH-BR-006); a second
copy of `@bridger/core` loaded by a plugin must name the same services. The
references are read by the core for re-entrancy detection, ownership
reporting and attribution; their semantics are specified in the files named
beside them.

## BEH-BR-011: BridgerOptions and their defaults

> **See:** [ADR-BR-025](../decisions/025-deterministic-time-and-ids.md)
> **Satisfies:** [URS-BR-021](../urs.md#urs-br-021-know-who-changed-the-plugin-set-when-and-why)

```ts
// illustrative — not type-checked
interface BridgerOptions<EBase = never> {
  readonly base?: Context.Context<any> | Layer.Layer<any, EBase>  // stable application services (BEH-BR-012)
  readonly config?: ConfigSource                       // default: the ambient ConfigProvider (11)
  readonly concurrency?: number | "unbounded"          // concurrent builds only; stops take no slot; default 4 (05, 06)
  readonly buildTimeout?: Duration.Input               // per build; default 60 seconds (05)
  readonly drainTimeout?: Duration.Input | "forever"   // lease drain on stop; default 30 seconds (09)
  readonly shutdownTimeout?: Duration.Input            // host close; default 60 seconds (12)
  readonly eventBuffer?: number                        // events PubSub capacity; default 1024 (13)
  readonly stallWarning?: Duration.Input | "never"     // waiting-too-long report; default 30 seconds (13)
  readonly onClose?: (report: CloseReport) => Effect.Effect<void>   // (12)
  readonly attribution?: {                             // (22)
    readonly require?: boolean                         // default false
    readonly requireReason?: readonly Operation[]      // default []
  }
  readonly auditTimeout?: Duration.Input               // per audit write; default 10 seconds (23)
  readonly gateTimeout?: Duration.Input | "forever"    // per OperationGate.authorize; default 60 seconds (25)
  readonly fingerprintTimeout?: Duration.Input         // per ConfigFingerprinter call; default 5 seconds (22)
  readonly baseContracts?: readonly (Contract | ContractProvision)[]  // contract versions the base implements; default [] (26)
  readonly mandatory?: readonly MandatoryInterception<any>[]          // host-wide mandatory interceptions; default [] (28)
  readonly mandatoryCatalog?: readonly RegisteredInterception<any>[]  // interceptions a desired list names by id; default [] (18, BEH-BR-153)
  readonly resolutionTimeout?: Duration.Input          // per CapabilityPolicy decision; default 5 seconds (29)
  readonly callLogTimeout?: Duration.Input             // per CallLog.record; default 1 second (29)
  readonly handoffTimeout?: Duration.Input             // per handoff export, upgrade and import; default 5 seconds (34)
}

type ConfigSource = ConfigProvider.ConfigProvider | ((id: string) => Effect.Effect<unknown>)
```

```
REQUIREMENT: An omitted option MUST take exactly the default shown. A host
             constructed with no options MUST behave as if every default
             were given explicitly.
```

```
REQUIREMENT: Construction MUST reject an option value outside its domain —
             a `concurrency` that is not a positive integer or "unbounded";
             an `eventBuffer` that is not a positive integer; a
             `buildTimeout`, `shutdownTimeout`, `auditTimeout`,
             `fingerprintTimeout`, `resolutionTimeout`, `callLogTimeout` or
             `handoffTimeout` that is not a positive duration ("forever" is
             accepted by none of them); a `baseContracts` entry that
             is invalid (26 — Versioned Contracts); a
             `drainTimeout`, `gateTimeout` or `stallWarning` that is
             neither a positive duration nor its named keyword; a
             `mandatoryCatalog` entry with an empty id, or two entries with
             one id (18 — Reconciliation and Confluence, BEH-BR-153) — by failing with a defect that names the option, before
             any base layer is built. A `baseContracts` entry that names a
             `ServiceId` the base does not provide can be found only once
             the base is built: construction MUST then fail with a defect
             that names the option, before the host is provided and before
             any plugin is installed.
```

```
REQUIREMENT: `drainTimeout: "forever"` and `gateTimeout: "forever"` MUST be
             accepted only when stated explicitly; no default and no
             computed value may produce either.
```

Each option bounds something that could otherwise hang or grow without limit,
and each is specified where it acts. Rejecting an out-of-domain value at
construction matters because the failure modes are silent otherwise: a
`concurrency` of `0` would let no plugin ever build, a `NaN` timeout would
compare false and never fire, and either would surface as a host that simply
never becomes idle.

**Settled here.** SPEC.md gave defaults but no rule for invalid values. This
specification rejects them at construction with a defect rather than clamping
them, because a clamped value is a configuration the operator did not ask
for, and because a misconfigured host is a programming error, not a
recoverable condition. `attribution`, `auditTimeout`, `gateTimeout` and
`fingerprintTimeout` are new options from the GxP hooks
([22](../behaviors/22-attributable-operations.md),
[23](../behaviors/23-audit-sink-and-record.md),
[25](./25-operation-gate.md)); a gate that times out is treated as a refusal,
so approvals are meant to be obtained before the call, not by holding it open.
`fingerprintTimeout` (CCR-BR-014) bounds the `ConfigFingerprinter` at step 4a
of [22](../behaviors/22-attributable-operations.md) (BEH-BR-188); it has no
"forever", because a fingerprint is computed by the consumer's own code and a
port that does not answer within a bounded time fails the call closed.
`baseContracts` (CCR-BR-017, [26](./26-versioned-contracts.md)), `mandatory`,
`resolutionTimeout` and `callLogTimeout` (CCR-BR-018,
[28](./28-plugin-principal-and-mandatory-policy.md),
[29](./29-capability-grants-and-call-log.md)) and `handoffTimeout`
(CCR-BR-019, [34](./34-state-handoff.md)) follow the same rule: none of the
timeouts has "forever". `mandatoryCatalog` (CCR-BR-025,
[18](./18-reconciliation-and-confluence.md)) names mandatory interceptions by
id so that a desired list can cite them as data.

## BEH-BR-012: Base services are a Context or a Layer

> **Invariant:** [INV-BR-001](../invariants.md#inv-br-001-one-provider-per-service-key-per-realm)
> **See:** [ADR-BR-003](../decisions/003-one-provider-per-key-per-realm.md)
> **Satisfies:** [URS-BR-001](../urs.md#urs-br-001-install-plugins-at-runtime-without-ordering-providers)

```
REQUIREMENT: Services supplied through `base` MUST be available to every
             plugin in the default realm's resolution scope from the moment
             the host exists, and MUST be listed in
             `HostSnapshot.availableServiceIds`.
```

```
REQUIREMENT: A plugin MUST NOT provide a key K that `base` provides when K
             resolves, for that plugin, in the default realm's resolution
             scope — scopeOf(R, K) = "default" for its realm R
             (17 — Realms and Interception, BEH-BR-146). `install` MUST
             reject such a definition with
             `DuplicateProvider { serviceId, providerId: "base" }`.
```

```
REQUIREMENT: A plugin installed in a realm R that isolates a key K that
             `base` provides MAY provide K. It occupies R's own provider
             slot for K; the base service stays the default realm's
             provider of K and is invisible inside R (BEH-BR-146).
```

```
REQUIREMENT: The host-owned keys `Bridger.Host` and `Bridger.Events`
             (BEH-BR-010) MUST be base services of every host and of every
             resolution scope. A plugin MUST NOT provide them in any scope,
             and a realm MUST NOT isolate them: `defineRealm` MUST refuse such
             a realm with `InvalidRealm` (17 — Realms and Interception,
             BEH-BR-145).
```

```
REQUIREMENT: A `Layer` base MUST be built in the host scope before any
             plugin starts, and MUST be released only after every plugin has
             stopped.
```

```
REQUIREMENT: A `Context` base MUST be used as given. The host MUST NOT
             finalise or otherwise manage the lifetime of anything in it.
```

Base services are the stable part of the application: a database pool, a
logger, a `ContributionRegistry` many plugins contribute to. They cannot be
replaced by a plugin because dependents capture one provider identity and
removal ordering needs an unambiguous owner; a base service has no plugin to
order.

**Settled here (CCR-BR-032).** The rule against providing a base key is a
rule of one resolution scope, not of the host. A realm that isolates a key
has its own provider slot for it, and that is how a tenant realm gets its
own `Database` while the default realm keeps the application's
(17 — Realms and Interception, BEH-BR-146, Settled (2)). Before CCR-BR-032
this behaviour forbade it outright and so contradicted file 17. Two keys are
not the application's to divide: the host itself and its event bus. A realm
that isolated `Bridger.Events` would let a plugin in it provide a second bus,
and one that isolated `Bridger.Host` would let a plugin in it provide a host
of its own; both break [INV-BR-020](../invariants.md#inv-br-020-a-realm-changes-resolution-only)
(one host scope, one event bus), so `defineRealm` refuses them.

A `Layer` base exists for the lifecycle a bare `Context` cannot give: it is
acquired before the first plugin needs it and released after the last plugin
that used it has stopped, so no plugin's finalizer ever runs against a closed
base resource. A `Context` base is the caller's to manage, and the host
promises nothing about it beyond using it.

## BEH-BR-013: The Host interface

> **See:** [ADR-BR-008](../decisions/008-error-taxonomy.md), [ADR-BR-012](../decisions/012-intent-and-linearization.md)
> **Satisfies:** [URS-BR-001](../urs.md#urs-br-001-install-plugins-at-runtime-without-ordering-providers), [URS-BR-002](../urs.md#urs-br-002-remove-or-replace-a-plugin-safely-while-it-is-in-use)

```ts
// illustrative — not type-checked
// G abbreviates the GxP errors every mutating operation adds (BEH-BR-014):
//   Unattributed | ReasonRequired | AuditUnavailable | OperationRejected
interface Host {
  // — mutating operations —
  install<R extends Keys, P extends Keys, E, C>(plugin: Plugin<R, P, E, C>, options?: InstallOptions):
    Effect.Effect<PluginHandle, InstallError | ConfigFingerprintUnavailable | HostClosed | G>     // 03
  install(plugin: Plugin.Any | LazyPluginDefinition, options?: InstallOptions):
    Effect.Effect<PluginHandle, InstallError | ConfigFingerprintUnavailable | HostClosed | G>     // 01, 27
  remove(ref: PluginRef, options?: RemoveOptions):
    Effect.Effect<void, UnknownPlugin | CleanupError | DrainTimeout | WouldDeadlock | HostClosed | G>   // 06
  replace<R extends Keys, P extends Keys, E, C>(plugin: Plugin<R, P, E, C>, options?: ReplaceOptions):
    Effect.Effect<void, ReplaceError | UnknownPlugin | Conflict | Superseded | CleanupError
      | DrainTimeout | WouldDeadlock | HostClosed | G>                                           // 07
  replace(plugin: Plugin.Any | LazyPluginDefinition, options?: ReplaceOptions):
    Effect.Effect<void, ReplaceError | UnknownPlugin | Conflict | Superseded | CleanupError
      | DrainTimeout | WouldDeadlock | HostClosed | G>                                           // 01, 27
  retry(ref: PluginRef, options?: OperationOptions):
    Effect.Effect<void, UnknownPlugin | Conflict | WouldDeadlock | HostClosed | G>               // 07
  reconfigure(ref: PluginRef, config?: unknown, options?: OperationOptions & HandoffCallOptions):
    Effect.Effect<void, UnknownPlugin | ConfigInvalid | ConfigFingerprintUnavailable | Conflict
      | Superseded | CleanupError | DrainTimeout | WouldDeadlock | HostClosed | G>               // 11, 34
  restart(ref: PluginRef, options?: RemoveOptions & HandoffCallOptions):
    Effect.Effect<void, UnknownPlugin | Conflict | Superseded | CleanupError
      | DrainTimeout | WouldDeadlock | HostClosed | G>                                           // 07, 34
  disable(ref: PluginRef, options?: RemoveOptions):
    Effect.Effect<void, UnknownPlugin | Conflict | Superseded | CleanupError
      | DrainTimeout | WouldDeadlock | HostClosed | G>                                           // 07
  enable(ref: PluginRef, options?: OperationOptions):
    Effect.Effect<void, UnknownPlugin | Conflict | InstallError | WouldDeadlock | HostClosed | G> // 07
  reconcile(desired: readonly DesiredPlugin[], options?: ReconcileOptions & OperationOptions):
    Effect.Effect<ReconcileReport, Unattributed | ReasonRequired | AuditUnavailable | PlanStale
      | ApplyRolledBack | PartialApply | HostClosed>                                             // 18, 32; gate refusals are per entry;
                                                                                                 // the last two only with atomic: true (BEH-BR-324)
  defineRealm(id: string, options: RealmOptions, operation?: OperationOptions):
    Effect.Effect<void, InvalidRealm | DuplicateRealm | HostClosed | G>                          // 17
  retireRealm(id: string, operation?: OperationOptions):
    Effect.Effect<void, UnknownRealm | RealmInUse | HostClosed | G>                              // 33
  shutdown(options?: OperationOptions & { readonly timeout?: Duration.Input }):
    Effect.Effect<CloseReport, Unattributed | ReasonRequired | WouldDeadlock>   // 12; never gated, never blocked by the
                                                                 // latch or by an unwritable record
  acknowledgeAuditDegraded(options: { readonly context: OperationContext }):
    Effect.Effect<void, HostClosed | G>                                                          // 23

  // — observation and diagnostics (not mutating) —
  snapshot(): Effect.Effect<HostSnapshot>                                                        // 04
  readonly changes: Stream.Stream<HostSnapshot>                                                  // 04
  readonly events: Stream.Stream<HostEvent>                                                      // 13
  awaitIdle(options?: { readonly timeout?: Duration.Input }):
    Effect.Effect<HostSnapshot, IdleTimeout | WouldDeadlock | HostClosed>                        // 05
  inspect(ref: PluginRef): Effect.Effect<PluginInspection, UnknownPlugin | HostClosed>           // 13
  controls(): Effect.Effect<HostControls>                                                        // 24
  plan(desired: readonly DesiredPlugin[], options?: ReconcileOptions):
    Effect.Effect<ReconcilePlan, HostClosed>                                                     // 32; read-only
  wake(trigger: LazyTrigger, options?: { readonly realm?: string; readonly correlationId?: string }):
    Effect.Effect<WakeReport, UnknownRealm | HostClosed>                                         // 27
  offerCallEntry(entry: OfferedCallEntry, options?: { readonly onFailure?: "drop" | "refuse" }):
    Effect.Effect<void, CallLogUnavailable | InvalidCallEntry>                                   // 29; not mutating
  declaredContributions(registry: string):
    Effect.Effect<readonly DeclaredContribution[], HostClosed>                                   // 27, BEH-BR-250; read-only
  readonly link: HostLink                                                                        // 27, BEH-BR-250

  // — leases (not mutating) —
  use<Service, A, E, R>(key: Context.Key<any, Service>, run: (service: Service) => Effect.Effect<A, E, R>,
    options?: { readonly timeout?: Duration.Input; readonly realm?: string }):
    Effect.Effect<A, E | ServiceUnavailable | UnknownRealm | LeaseRevoked | LeaseTimeout
      | ResolutionRefused, R>                                                                    // 09, 29
  useAll<Ks extends readonly Context.Key<any, any>[], A, E, R>(keys: Ks,
    run: (services: ServicesOf<Ks>) => Effect.Effect<A, E, R>,
    options?: { readonly timeout?: Duration.Input; readonly realm?: string }):
    Effect.Effect<A, E | ServiceUnavailable | UnknownRealm | LeaseRevoked | LeaseTimeout
      | ResolutionRefused, R>                                                                    // 09, 29
  lease<Ks extends readonly Context.Key<any, any>[]>(keys: Ks, options?: { readonly realm?: string }):
    Effect.Effect<ServicesOf<Ks>, ServiceUnavailable | UnknownRealm | ResolutionRefused,
      Scope.Scope>                                                                               // 09, 29
}

// A plugin is addressed by ID within a realm. A bare string means the default realm.
type PluginRef = string | { readonly id: string; readonly realm: string }

interface OperationOptions { readonly context?: OperationContext }                              // 22

interface RemoveOptions extends OperationOptions {
  readonly drain?: Duration.Input | "forever"   // lease wait (default: BridgerOptions.drainTimeout) (09)
  readonly force?: boolean                      // revoke leases still held after `drain` (09)
}

interface ReplaceOptions extends RemoveOptions {
  readonly realm?: string                       // realm of the plugin being replaced (default "default")
  readonly cold?: boolean                       // skip a handoff (34, BEH-BR-353); default false
}

interface HandoffCallOptions { readonly cold?: boolean }  // 34, BEH-BR-353; default false
// ReconcileOptions (18, BEH-BR-153) also carries `cold?: boolean`, applied to every
// replace and restarting reconfigure the reconcile issues (34, BEH-BR-353)

type ServicesOf<Ks extends readonly Context.Key<any, any>[]> =
  { readonly [I in keyof Ks]: Ks[I] extends Context.Key<any, infer S> ? S : never }
```

```
REQUIREMENT: The host MUST expose exactly the members above, with the error
             unions shown. The semantics of each member are those of the
             behaviour file named in its trailing comment.
```

```
REQUIREMENT: This behaviour MUST be the single source of every `Host`
             member's parameters and error union, and of `PluginHandle`'s
             `remove` and `restart`, which take the options and have the
             unions of `Host.remove` and `Host.restart` (03 — Installation,
             BEH-BR-024). A signature repeated in another behaviour file
             MUST equal the one here; where one differs, this behaviour
             governs and the copy is a defect of that file.
```

```
REQUIREMENT: Every operation that names a plugin MUST take a `PluginRef`. A
             bare string MUST mean the plugin of that ID in the "default"
             realm. Two plugins with the same ID in different realms MUST be
             distinct plugins for every operation, and for every check that
             names plugins, `WouldDeadlock` included: the re-entrancy
             references name a plugin by its canonical key
             `JSON.stringify([realm, id])`, and `WouldDeadlock` carries `id` and
             `realm` (09 — Leases, BEH-BR-088; CCR-BR-036).
```

```
REQUIREMENT: Every named error MUST be a `Schema.TaggedError` that carries
             identifiers and messages only — never configuration values,
             keys, fibers or raw causes.
```

`InstallOptions`, `PluginHandle` and `InstallError` are specified in
[03 — Installation](./03-installation.md); `HostSnapshot`, `PluginSnapshot` and
`PluginState` in [04 — States and Snapshots](./04-states-and-snapshots.md).
The library's leverage sits behind `install`, `remove` and `replace`: callers
never order providers, dependents or finalizers themselves. `use`, `useAll`
and `lease` carry no `HostClosed`: after shutdown begins every provider is
stopping or gone, and they fail with `ServiceUnavailable`
([09 — Leases](./09-leases.md)).

**Settled here.** The error unions differ from SPEC.md in eight places, each to
make a reachable outcome representable rather than leave it to a defect or to
a silent success:

1. `replace` adds `UnknownPlugin` (replacing an ID that is not installed has
   no other error to report; the settled legality table of
   [08 — Operation Legality](./08-operation-legality.md) requires it).
2. `restart`, `disable` and `reconfigure` add `Superseded`, because the
   settled legality table lets a later `remove` (and, for `restart` and
   `reconfigure`, a later `replace` or `disable`, and for `reconfigure` a
   later `reconfigure` with a different value) supersede them.
3. `replace`, `restart`, `disable` and `reconfigure` add `CleanupError`:
   each stops an activation, and when that stop's cleanup fails the plugin
   ends `failed` with phase `cleanup` ([07 — Replacement and
   Reactivation](./07-replacement-and-reactivation.md)). Reporting success to
   a caller whose stop leaked a resource would hide the leak (RSK-BR-009).
4. `reconfigure` adds `DrainTimeout` and `WouldDeadlock`, as
   [11 — Configuration](./11-configuration.md) also settles.
5. `awaitIdle` and `inspect` add `HostClosed`; `use`, `useAll` and `lease`
   add `UnknownRealm` for an undefined `realm`; `retry`, `enable`,
   `reconfigure` and `defineRealm` gain an `OperationOptions` parameter and
   `reconcile`'s options become `ReconcileOptions & OperationOptions`, with
   the union fixed by [18 — Reconciliation and
   Confluence](./18-reconciliation-and-confluence.md) (gate refusals are
   reported per entry in `ReconcileReport.rejected`, never as an error of the
   call); every other mutating operation adds the GxP errors (BEH-BR-014).
6. `retry` and `enable` add `WouldDeadlock` (CCR-BR-008): either can wait
   for a running system stop of the plugin it names (08 — Operation
   Legality, BEH-BR-073), and a call from a fiber that holds that plugin
   would wait for itself ([09 — Leases](./09-leases.md), BEH-BR-088).
7. `install` and `reconfigure` add `ConfigFingerprintUnavailable`
   (CCR-BR-014): when a `ConfigFingerprinter` is wired, `install` with
   `config` and `reconfigure` with a value ask it for fingerprints before the
   gate, and a port that fails, times out or answers outside its contract
   fails the call closed ([22 — Attributable
   Operations](../behaviors/22-attributable-operations.md), BEH-BR-188, step
   4a; [ADR-BR-039](../decisions/039-config-fingerprint-port.md)). For
   `reconcile` it is a per-entry failure reported in the report, not an error
   of the call ([18 — Reconciliation and
   Confluence](./18-reconciliation-and-confluence.md)). The host also gains
   `controls()`, a read-only observation of its wiring, its GxP limits and
   its audit position ([24 — Time, Identifiers and
   Sequence](./24-time-ids-and-sequence.md), BEH-BR-212); it has no error,
   and it stays readable after the host has closed.
8. The host gains `offerCallEntry` (CCR-BR-026): a companion's way to put an
   entry of its own — a remote crossing, a boundary refusal, a revocation —
   into the wired `CallLog` under the same queue and failure policy as
   core's entries ([29 — Capability Grants and Call
   Log](./29-capability-grants-and-call-log.md), BEH-BR-280). It is not a
   mutating operation: it changes no plugin and writes no audit record.
   No error union of a mutating operation changes for the `RefusalList`
   ([28 — Plugin Principal and Mandatory
   Policy](./28-plugin-principal-and-mandatory-policy.md), BEH-BR-267),
   whose refusals are reported as `OperationRejected`.

**Settled here (CCR-BR-032).** The owning files had drifted from this
interface in six places, so that `cold: true` could not be passed through
the interface that called itself canonical. The interface now carries what
the owning files had added: `restart` and `reconfigure` take
`HandoffCallOptions` (34 — State Handoff, BEH-BR-353), and so does
`PluginHandle.restart`; `reconcile` adds `ApplyRolledBack` and
`PartialApply`, raised only with `atomic: true` (32 — Generic Gate and Plan,
BEH-BR-324). The owning files now carry what only this interface had:
`install` adds `ConfigFingerprintUnavailable` in 03 and `reconfigure` in 11
(item 7 above), and `use`, `useAll` and `lease` add `ResolutionRefused` in
09 (29 — Capability Grants and Call Log, BEH-BR-274). `defineRealm` adds
`InvalidRealm` for a realm that isolates a host-owned key (BEH-BR-012;
17 — Realms and Interception, BEH-BR-145).

## BEH-BR-014: Every mutating operation takes OperationOptions and reports the GxP errors

> **Invariant:** [INV-BR-025](../invariants.md#inv-br-025-no-mutation-proceeds-without-required-attribution), [INV-BR-027](../invariants.md#inv-br-027-a-refused-or-unauditable-mutation-changes-nothing)
> **See:** [ADR-BR-029](../decisions/029-attributable-mutations.md), [ADR-BR-030](../decisions/030-audit-sink-port.md), [ADR-BR-032](../decisions/032-operation-gate.md)
> **Satisfies:** [URS-BR-021](../urs.md#urs-br-021-know-who-changed-the-plugin-set-when-and-why), [URS-BR-023](../urs.md#urs-br-023-prevent-a-change-that-cannot-be-recorded), [URS-BR-024](../urs.md#urs-br-024-require-approval-before-a-regulated-change)
> **Risk:** [RSK-BR-004](../gxp/03-risk-assessment.md#rsk-br-004), [RSK-BR-005](../gxp/03-risk-assessment.md#rsk-br-005), [RSK-BR-014](../gxp/03-risk-assessment.md#rsk-br-014)

```ts
// illustrative — not type-checked
type Operation =
  | "install" | "remove" | "replace" | "retry" | "reconfigure" | "restart"
  | "disable" | "enable" | "reconcile" | "defineRealm" | "retireRealm" | "shutdown"
  | "acknowledgeAuditDegraded"

interface Actor { readonly id: string; readonly kind: "user" | "service" | "system"; readonly display?: string }
interface OperationContext {
  readonly actor: Actor
  readonly reason?: string
  readonly correlationId?: string
  readonly annotations?: Annotations   // typed labels (30 — Operation Context Annotations, BEH-BR-289)
}
interface OperationOptions { readonly context?: OperationContext }
```

```
REQUIREMENT: The Host method of every `Operation` MUST accept an
             `OperationContext`, either through options that extend
             `OperationOptions` or through a trailing `OperationOptions`
             parameter, as shown in BEH-BR-013.
```

```
REQUIREMENT: The error union of every mutating operation MUST include
             `Unattributed | ReasonRequired | AuditUnavailable |
             OperationRejected`, except `reconcile`, whose union is fixed by
             18 — Reconciliation and Confluence, and `shutdown`, whose
             union is `Unattributed | ReasonRequired | WouldDeadlock`
             because it MUST NOT be gated or blocked by the audit latch or
             by an unwritable audit record, and fails `WouldDeadlock` only
             from a build, `load` or finalizer fiber (12 — Shutdown and
             Hosting, BEH-BR-105).
```

```
REQUIREMENT: `snapshot`, `changes`, `events`, `awaitIdle`, `inspect`,
             `controls`, `plan`, `declaredContributions`, `offerCallEntry`,
             `use`, `useAll` and `lease` are not mutating operations. They
             MUST NOT require attribution, consult the `OperationGate`, or
             write audit records.
```

```
REQUIREMENT: `wake` is neither mutating nor read-only: it MUST NOT require
             attribution, take an `OperationContext` or consult the
             `OperationGate`, and it writes no record of its own; the
             transitions it causes are system transitions, recorded as
             `lazy-triggered` roots carrying the `correlationId` of its
             options when one is given (27 — Manifest and Lazy Activation,
             BEH-BR-248; 22 — Attributable Operations, BEH-BR-190).
```

The rules these hooks enforce — the order of the attribution, latch, gate and
`requested`-record checks, the one-terminal-record rule, and what each GxP
error means — are specified in
[22 — Attributable Operations](../behaviors/22-attributable-operations.md),
[23 — Audit Sink and Record](../behaviors/23-audit-sink-and-record.md) and
[25 — Operation Gate](./25-operation-gate.md), and are not repeated in this
or any other lifecycle file. When a caller supplies no `correlationId`, the
host generates one with `IdGenerator`, so every audit record carries one
([22](../behaviors/22-attributable-operations.md)). What this file fixes is the surface: there is no
mutating method that cannot be attributed, and no mutating method whose type
hides that it can be refused for an attribution, audit or approval reason.

## BEH-BR-015: Optional GxP ports are resolved once, at construction

> **Invariant:** [INV-BR-026](../invariants.md#inv-br-026-an-unwired-sink-or-gate-changes-nothing)
> **See:** [ADR-BR-030](../decisions/030-audit-sink-port.md), [ADR-BR-032](../decisions/032-operation-gate.md), [ADR-BR-025](../decisions/025-deterministic-time-and-ids.md), [ADR-BR-039](../decisions/039-config-fingerprint-port.md)
> **Risk:** [RSK-BR-014](../gxp/03-risk-assessment.md#rsk-br-014), [RSK-BR-006](../gxp/03-risk-assessment.md#rsk-br-006)

```
REQUIREMENT: The host MUST read `AuditSink`, `OperationGate`,
             `ConfigFingerprinter`, `AccessPolicy`
             (`@bridger/core/AccessPolicy`), `RefusalList`
             (`@bridger/core/RefusalList`), `CapabilityPolicy`
             (`@bridger/core/CapabilityPolicy`), `CallLog`
             (`@bridger/core/CallLog`) and `EntitlementView`
             (`@bridger/core/EntitlementView`) with `Effect.serviceOption`
             from the environment in which `Bridger.layer` or `Bridger.make`
             runs, once, at construction. It MUST NOT re-resolve them for
             the lifetime of the host, and none of them MAY appear in the
             requirements of `Bridger.layer` or `Bridger.make`. The
             `CallLog` fields `onFailure` and `queue` MUST be read and
             checked at the same moment (29 — Capability Grants and Call
             Log, BEH-BR-279).
```

```
REQUIREMENT: The context references `CurrentPlugin`
             (`@bridger/core/CurrentPlugin`; its key is not exported for
             providing; default none), `CurrentAnnotations`
             (`@bridger/core/CurrentAnnotations`; default
             `Annotations.empty`) and `CurrentCall`
             (`@bridger/core/CurrentCall`; default none) are set only by the
             host (28 — Plugin Principal and Mandatory Policy, BEH-BR-257;
             29 — Capability Grants and Call Log, BEH-BR-277;
             30 — Operation Context Annotations, BEH-BR-292).
             `CurrentCorrelation` (`@bridger/core/CurrentCorrelation`;
             default none) is set by the host for the work of a call and by
             any code through `CurrentCorrelation.with` (22 — Attributable
             Operations, BEH-BR-187).
```

```
REQUIREMENT: The host MUST obtain identifiers from the `IdGenerator` service
             and time from Effect's `Clock`, as resolved at construction
             (24 — Time, Identifiers and Sequence).
```

```
REQUIREMENT: `HostSnapshot.audit` MUST be "wired" when an `AuditSink` was
             resolved and "unwired" otherwise, for the host's whole lifetime.
```

```
REQUIREMENT: A host constructed without an `AuditSink`, without an
             `OperationGate` or without a `ConfigFingerprinter` MUST behave,
             in every lifecycle respect, exactly as a host for which those
             ports do not exist. Without a `ConfigFingerprinter`, step 4a
             of BEH-BR-188 MUST be skipped and `configChange` MUST carry
             paths only (22 — Attributable Operations).
```

**Settled here.** SPEC.md predates the GxP ports and so says nothing about
when they are read. This specification reads them once, at construction.
Resolving them per call would let a host be audited for part of its life and
not for the rest, with nothing in the record showing where the gap began
(RSK-BR-006); and a gate that could appear or vanish between calls would make
"cannot be bypassed through the Host it guards" untestable (RSK-BR-014). A
host's wiring is therefore a fixed fact of that host, reported in its
snapshot. The `ConfigFingerprinter` (CCR-BR-014,
[ADR-BR-039](../decisions/039-config-fingerprint-port.md)) is read under the
same rule, for the same reason: fingerprints that appeared on some changes
and not on others would leave approvals bound to some values and not to
others with nothing showing why. Which ports are wired is also reported by
`Host.controls` (24 — Time, Identifiers and Sequence, BEH-BR-212). The
policy ports of [28](./28-plugin-principal-and-mandatory-policy.md) and
[29](./29-capability-grants-and-call-log.md) (CCR-BR-018) and the
`EntitlementView` of [10](./10-runtime-failure-and-health.md), BEH-BR-089
(CCR-BR-020), are read under the same rule.

## BEH-BR-016: Each host has a distinct hostId

> **Invariant:** [INV-BR-024](../invariants.md#inv-br-024-time-and-identifiers-come-only-from-services)
> **See:** [ADR-BR-025](../decisions/025-deterministic-time-and-ids.md)
> **Satisfies:** [URS-BR-027](../urs.md#urs-br-027-reproduce-time-and-identifiers-during-validation)
> **Risk:** [RSK-BR-007](../gxp/03-risk-assessment.md#rsk-br-007)

```
REQUIREMENT: A host MUST obtain its `hostId` from `IdGenerator` once, at
             construction, and MUST keep it for its whole lifetime. The
             `hostId` MUST differ from that of every other host whose
             records, events or snapshots reach a common store; it does
             when the generator keeps the uniqueness rule of 24 — Time,
             Identifiers and Sequence (BEH-BR-210).
```

```
REQUIREMENT: The `hostId` MUST appear in every `HostSnapshot`, every host
             event and every audit record the host produces.
```

Several hosts can run in one process (one per test, one per tenant
application) and several processes can write to one audit store. The host ID
is what keeps their snapshots, events and records apart. Taking it from
`IdGenerator` rather than from `crypto.randomUUID()` directly means a test host
produces the same ID on every run.

**Settled here.** SPEC.md shows `hostId` in `HostSnapshot` without saying
where it comes from. It comes from `IdGenerator`, under the same rule as every
other identifier ([24 — Time, Identifiers and
Sequence](./24-time-ids-and-sequence.md)), uniqueness included (CCR-BR-033):
core takes the generator's value and checks no other host's, so the
distinctness this behaviour's title states rests on the generator.

---

_Previous: [01 — Plugin Definition](./01-plugin-definition.md)_ · _Next: [03 — Installation](./03-installation.md)_
