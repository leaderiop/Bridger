# 02 — Host Construction

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-BEH-02                                               |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.1 (2026-10-02): Initial draft (CCR-BR-001)                 |

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
HeldPlugins        // "@bridger/core/HeldPlugins"   ReadonlySet<string>, default: empty set (09)
ActivePlugin       // "@bridger/core/ActivePlugin"  default: none (13)
CurrentActor       // "@bridger/core/CurrentActor"  default: Actor.unattributed (22)
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
  readonly concurrency?: number | "unbounded"          // concurrent builds and independent stops; default 4 (05)
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
             `buildTimeout`, `shutdownTimeout` or `auditTimeout` that is not
             a positive duration; a `drainTimeout`, `gateTimeout` or
             `stallWarning` that is neither a positive duration nor its named
             keyword — by failing with a defect that names the option, before
             any base layer is built.
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
recoverable condition. `attribution`, `auditTimeout` and `gateTimeout` are new
options from the GxP hooks ([22](../behaviors/22-attributable-operations.md),
[23](../behaviors/23-audit-sink-and-record.md),
[25](./25-operation-gate.md)); a gate that times out is treated as a refusal,
so approvals are meant to be obtained before the call, not by holding it open.

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
REQUIREMENT: A plugin MUST NOT provide a key that `base` provides. `install`
             MUST reject such a definition with
             `DuplicateProvider { serviceId, providerId: "base" }`.
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
  install<R extends Keys, P extends Keys, E, C>(plugin: PluginDefinition<R, P, E, C>, options?: InstallOptions):
    Effect.Effect<PluginHandle, InstallError | HostClosed | G>                                    // 03
  remove(ref: PluginRef, options?: RemoveOptions):
    Effect.Effect<void, UnknownPlugin | CleanupError | DrainTimeout | WouldDeadlock | HostClosed | G>   // 06
  replace<R extends Keys, P extends Keys, E, C>(plugin: PluginDefinition<R, P, E, C>, options?: ReplaceOptions):
    Effect.Effect<void, ReplaceError | UnknownPlugin | Conflict | Superseded | CleanupError
      | DrainTimeout | WouldDeadlock | HostClosed | G>                                           // 07
  retry(ref: PluginRef, options?: OperationOptions):
    Effect.Effect<void, UnknownPlugin | Conflict | HostClosed | G>                               // 07
  reconfigure(ref: PluginRef, config?: unknown, options?: OperationOptions):
    Effect.Effect<void, UnknownPlugin | ConfigInvalid | Conflict | Superseded | CleanupError
      | DrainTimeout | WouldDeadlock | HostClosed | G>                                           // 11
  restart(ref: PluginRef, options?: RemoveOptions):
    Effect.Effect<void, UnknownPlugin | Conflict | Superseded | CleanupError
      | DrainTimeout | WouldDeadlock | HostClosed | G>                                           // 07
  disable(ref: PluginRef, options?: RemoveOptions):
    Effect.Effect<void, UnknownPlugin | Conflict | Superseded | CleanupError
      | DrainTimeout | WouldDeadlock | HostClosed | G>                                           // 07
  enable(ref: PluginRef, options?: OperationOptions):
    Effect.Effect<void, UnknownPlugin | Conflict | InstallError | HostClosed | G>                // 07
  reconcile(desired: readonly DesiredPlugin[], options?: ReconcileOptions & OperationOptions):
    Effect.Effect<ReconcileReport, Unattributed | ReasonRequired | AuditUnavailable | HostClosed> // 18; gate refusals are per entry
  defineRealm(id: string, options: RealmOptions, operation?: OperationOptions):
    Effect.Effect<void, DuplicateRealm | HostClosed | G>                                         // 17
  shutdown(options?: OperationOptions & { readonly timeout?: Duration.Input }):
    Effect.Effect<CloseReport, Unattributed | ReasonRequired>   // 12; never gated, never blocked by the
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

  // — leases (not mutating) —
  use<Service, A, E, R>(key: Context.Key<any, Service>, run: (service: Service) => Effect.Effect<A, E, R>,
    options?: { readonly timeout?: Duration.Input; readonly realm?: string }):
    Effect.Effect<A, E | ServiceUnavailable | UnknownRealm | LeaseRevoked | LeaseTimeout, R>     // 09
  useAll<Ks extends readonly Context.Key<any, any>[], A, E, R>(keys: Ks,
    run: (services: ServicesOf<Ks>) => Effect.Effect<A, E, R>,
    options?: { readonly timeout?: Duration.Input; readonly realm?: string }):
    Effect.Effect<A, E | ServiceUnavailable | UnknownRealm | LeaseRevoked | LeaseTimeout, R>     // 09
  lease<Ks extends readonly Context.Key<any, any>[]>(keys: Ks, options?: { readonly realm?: string }):
    Effect.Effect<ServicesOf<Ks>, ServiceUnavailable | UnknownRealm, Scope.Scope>                // 09
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
}

type ServicesOf<Ks extends readonly Context.Key<any, any>[]> =
  { readonly [I in keyof Ks]: Ks[I] extends Context.Key<any, infer S> ? S : never }
```

```
REQUIREMENT: The host MUST expose exactly the members above, with the error
             unions shown. The semantics of each member are those of the
             behaviour file named in its trailing comment.
```

```
REQUIREMENT: Every operation that names a plugin MUST take a `PluginRef`. A
             bare string MUST mean the plugin of that ID in the "default"
             realm. Two plugins with the same ID in different realms MUST be
             distinct plugins for every operation.
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

**Settled here.** The error unions differ from SPEC.md in five places, each to
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

## BEH-BR-014: Every mutating operation takes OperationOptions and reports the GxP errors

> **Invariant:** [INV-BR-025](../invariants.md#inv-br-025-no-mutation-proceeds-without-required-attribution), [INV-BR-027](../invariants.md#inv-br-027-a-refused-or-unauditable-mutation-changes-nothing)
> **See:** [ADR-BR-029](../decisions/029-attributable-mutations.md), [ADR-BR-030](../decisions/030-audit-sink-port.md), [ADR-BR-032](../decisions/032-operation-gate.md)
> **Satisfies:** [URS-BR-021](../urs.md#urs-br-021-know-who-changed-the-plugin-set-when-and-why), [URS-BR-023](../urs.md#urs-br-023-prevent-a-change-that-cannot-be-recorded), [URS-BR-024](../urs.md#urs-br-024-require-approval-before-a-regulated-change)
> **Risk:** [RSK-BR-004](../gxp/03-risk-assessment.md#rsk-br-004), [RSK-BR-005](../gxp/03-risk-assessment.md#rsk-br-005), [RSK-BR-014](../gxp/03-risk-assessment.md#rsk-br-014)

```ts
// illustrative — not type-checked
type Operation =
  | "install" | "remove" | "replace" | "retry" | "reconfigure" | "restart"
  | "disable" | "enable" | "reconcile" | "defineRealm" | "shutdown" | "acknowledgeAuditDegraded"

interface Actor { readonly id: string; readonly kind: "user" | "service" | "system"; readonly display?: string }
interface OperationContext { readonly actor: Actor; readonly reason?: string; readonly correlationId?: string }
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
             union is `Unattributed | ReasonRequired` because it MUST NOT be
             gated or blocked by the audit latch or by an unwritable audit
             record (12 — Shutdown and Hosting).
```

```
REQUIREMENT: `snapshot`, `changes`, `events`, `awaitIdle`, `inspect`,
             `use`, `useAll` and `lease` are not mutating operations. They
             MUST NOT require attribution, consult the `OperationGate`, or
             write audit records.
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
> **See:** [ADR-BR-030](../decisions/030-audit-sink-port.md), [ADR-BR-032](../decisions/032-operation-gate.md), [ADR-BR-025](../decisions/025-deterministic-time-and-ids.md)
> **Risk:** [RSK-BR-014](../gxp/03-risk-assessment.md#rsk-br-014), [RSK-BR-006](../gxp/03-risk-assessment.md#rsk-br-006)

```
REQUIREMENT: The host MUST read `AuditSink` and `OperationGate` with
             `Effect.serviceOption` from the environment in which
             `Bridger.layer` or `Bridger.make` runs, once, at construction.
             It MUST NOT re-resolve them for the lifetime of the host.
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
REQUIREMENT: A host constructed without an `AuditSink` or without an
             `OperationGate` MUST behave, in every lifecycle respect, exactly
             as a host for which those ports do not exist.
```

**Settled here.** SPEC.md predates the GxP ports and so says nothing about
when they are read. This specification reads them once, at construction.
Resolving them per call would let a host be audited for part of its life and
not for the rest, with nothing in the record showing where the gap began
(RSK-BR-006); and a gate that could appear or vanish between calls would make
"cannot be bypassed through the Host it guards" untestable (RSK-BR-014). A
host's wiring is therefore a fixed fact of that host, reported in its
snapshot.

## BEH-BR-016: Each host has a distinct hostId

> **Invariant:** [INV-BR-024](../invariants.md#inv-br-024-time-and-identifiers-come-only-from-services)
> **See:** [ADR-BR-025](../decisions/025-deterministic-time-and-ids.md)
> **Satisfies:** [URS-BR-027](../urs.md#urs-br-027-reproduce-time-and-identifiers-during-validation)
> **Risk:** [RSK-BR-007](../gxp/03-risk-assessment.md#rsk-br-007)

```
REQUIREMENT: A host MUST obtain its `hostId` from `IdGenerator` once, at
             construction, and MUST keep it for its whole lifetime.
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
Sequence](./24-time-ids-and-sequence.md)).

---

_Previous: [01 — Plugin Definition](./01-plugin-definition.md)_ · _Next: [03 — Installation](./03-installation.md)_
