# 27 — Manifest and Lazy Activation

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-BEH-27                                               |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.2 (2026-11-08): a lazy definition's identity digest is supplied to `Plugin.lazy` beside the manifest (a signed manifest cannot carry its own package's digest); manifest `digest` compared only when present; a loaded definition's own manifest ignored; contract references with a version require `methods`; manifest decoding first within the `InvalidDefinition` check; `reconfigure` on any registration not yet loaded is treated like `install` with `config`; `wake` takes no `OperationContext`; checks 62–66 (CCR-BR-022)<br>0.1 (2026-11-08): Initial draft (CCR-BR-017) |

---

A plugin definition is inert data ([01 — Plugin Definition](./01-plugin-definition.md),
BEH-BR-001), but to obtain one the host's caller must first import the
plugin's code. A marketplace listing, a consent screen, an agent choosing a
tool, or a `reconcile` deciding whether anything changed all need to know
what a plugin *declares* — what it provides and requires, which versions,
what it asks for — without running it. This file adds two things:

- a **manifest**: a data record describing a plugin, which core reads only
  for the fields it needs to resolve, and otherwise carries unchanged; with a
  pure `consentDiff` between two manifests;
- **lazy activation**: `Plugin.lazy({ manifest, load })`, a definition the
  host registers from its manifest alone — reserving provider slots, checking
  cycles and contract ranges — and whose code is loaded only when a trigger
  fires: `onService`, `onContribution` or `onEvent`.

The decisions are [ADR-BR-041](../decisions/041-manifest-as-data.md) and
[ADR-BR-042](../decisions/042-lazy-activation.md); this file has no SPEC.md
source section. It adds a seventh plugin state, `dormant`, and amends files
04, 08, 13, 18 and 23 as stated in each behaviour below. It owns
BEH-BR-241–256 and uses BEH-BR-241–249; 250–256 are reserved.

> **What core does not do — and who does**
>
> Core does not **fetch**, **verify**, **sign**, **unpack** or **cache across
> hosts** plugin code; it calls the `load` Effect it is given, and does not
> know where that Effect gets its code. Checking a digest or a signature
> *before code is evaluated*, revocation and the manifest registry belong to
> the loader companion (`@bridger/loader`, [`references/loader/`](../../loader/README.md)). Core does
> not **enforce** a manifest's requested capabilities, egress or residency:
> they are labels to core, which a policy port may act on ([29 — Capability
> Grants and Call Log](./29-capability-grants-and-call-log.md), BEH-BR-273) and a remote boundary may enforce ([`references/remote/`](../../remote/README.md)).
> A lazily loaded plugin runs in the host's process with the host's
> privileges, exactly like an eager one: **lazy activation is not isolation,
> and in-process code is never sandboxed** ([ADR-BR-027](../decisions/027-core-exclusions.md)).
> Third-party code belongs out of process, behind a proxy plugin.

Planned source: `packages/core/src/Manifest.ts` *(Planned)*,
`packages/core/src/Lazy.ts` *(Planned)*. The required acceptance checks are
62–66 of BEH-BR-184 ([21 — Testing Host](./21-testing-host.md)).

## BEH-BR-241: A manifest is data, and core reads only its resolution fields

> **Invariant:** [INV-BR-034](../invariants.md#inv-br-034-comparing-and-checking-manifests-evaluates-no-plugin-code)
> **See:** [ADR-BR-041](../decisions/041-manifest-as-data.md)
> **Satisfies:** [URS-BR-030](../urs.md#urs-br-030-know-what-a-plugin-declares-before-running-its-code)
> **Risk:** [RSK-BR-027](../gxp/03-risk-assessment.md#rsk-br-027)

```ts
// illustrative — not type-checked
const ProvidedRef = Schema.Struct({                     // a contract provision, or a plain key (serviceId only)
  serviceId: Schema.String,
  version: Schema.optional(Schema.String),             // present for contracts (26, BEH-BR-226)
  methods: Schema.optional(Schema.Array(Schema.String))
})
const RequiredRef = Schema.Struct({
  serviceId: Schema.String,
  range: Schema.optional(Schema.String),               // present for contracts
  version: Schema.optional(Schema.String),             // version of the dependent's copy of the contract
  methods: Schema.optional(Schema.Array(Schema.String))
})
const LazyTrigger = Schema.Union(
  Schema.TaggedStruct("OnService",      { serviceId: Schema.String }),
  Schema.TaggedStruct("OnContribution", { registry: Schema.String, id: Schema.String }),
  Schema.TaggedStruct("OnEvent",        { eventId: Schema.String })
)

const PluginManifest = Schema.Struct({
  manifestVersion: Schema.Literal(1),
  // resolution fields — read by core
  id: Schema.String,
  version: Schema.String,                              // the plugin's version (meta.version)
  digest: Schema.optional(Schema.String),              // opaque label; when present it must equal meta.digest (BEH-BR-242).
                                                       // A manifest signed inside the package it describes cannot carry
                                                       // that package's digest and omits it (BEH-BR-244)
  provides: Schema.Array(ProvidedRef),
  requires: Schema.Array(RequiredRef),
  optional: Schema.optional(Schema.Array(RequiredRef)),
  engines: Schema.optional(Schema.Record(Schema.String, Schema.String)),   // core reads "@bridger/core" only
  activation: Schema.optional(Schema.Array(LazyTrigger)),
  contributions: Schema.optional(Schema.Array(Schema.Struct({ registry: Schema.String, id: Schema.String }))),
  // labels — carried, compared by consentDiff, never interpreted
  description: Schema.optional(Schema.String),
  publisher: Schema.optional(Schema.String),
  tier: Schema.optional(Schema.String),
  requested: Schema.optional(Schema.Struct({
    capabilities: Schema.optional(Schema.Array(Schema.Struct({
      serviceId: Schema.String, methods: Schema.optional(Schema.Array(Schema.String)) }))),
    permissions: Schema.optional(Schema.Array(Schema.String)),
    egress: Schema.optional(Schema.Array(Schema.Struct({ host: Schema.String, purpose: Schema.optional(Schema.String) })))
  })),
  residency: Schema.optional(Schema.String),
  config: Schema.optional(Schema.Struct({ schema: Schema.Unknown, volatile: Schema.optional(Schema.Array(Schema.String)) })),
  extensions: Schema.optional(Schema.Record(Schema.String, Schema.Unknown))   // namespaced by the companion that owns them
})
type PluginManifest = typeof PluginManifest.Encoded
```

```
REQUIREMENT: Core MUST export `PluginManifest` as a Schema with exactly the
             fields above. Core MUST read only the resolution fields — `id`,
             `version`, `digest`, `provides`, `requires`, `optional`,
             `engines["@bridger/core"]`, `activation`, `contributions` — and
             MUST NOT branch on any other field, except in `consentDiff`
             (BEH-BR-243), which compares them as data.
```

```
REQUIREMENT: Core MUST decode a manifest with `PluginManifest` at `install`,
             `replace` and `enable` of a definition that carries one, first
             within the `InvalidDefinition` check (after `UnknownRealm`, in
             the order of 26 — Versioned Contracts, BEH-BR-228). A manifest that fails to decode
             MUST fail the call with `InvalidDefinition { id, reason }`,
             `reason` beginning "manifest:" and naming the path, never
             quoting a value.
```

```
REQUIREMENT: Core MUST keep the manifest object it was given, unchanged and
             including properties the schema does not name, and MUST hand
             that object — never a re-encoded copy — wherever this file says
             the manifest is passed on.
```

```
REQUIREMENT: In `provides`, `requires` and `optional`, a reference that has
             a `version` MUST also have `methods`; a reference with a
             `version` and no `methods` MUST fail the call with
             `InvalidDefinition`, `reason` beginning "manifest:" and naming
             the path. A reference without `version` (a plain key) MUST NOT
             have `methods`, under the same failure.
```

```
REQUIREMENT: Core MUST NOT validate a configuration override against
             `config.schema`, and MUST NOT interpret `publisher`, `tier`,
             `requested`, `residency` or `extensions`. A manifest MUST NOT
             contain configuration values; documentation MUST say so.
```

The manifest is the plugin's declaration, read by many parties: the loader
checks `digest`, a consent screen reads `requested`, a marketplace shows
`publisher` and `tier`, an agent reads `contributions`, and core resolves
from `provides`/`requires`. Defining the schema once, in core, means they all
read the same record; reading only the resolution fields means a new label —
a new tier name, a residency class — never needs a core release. The label
fields are deliberately strings: what "tier" or "residency" means is the
application's ([ADR-BR-041](../decisions/041-manifest-as-data.md)).

**Settled here.** (1) `requested.capabilities` has the shape of a grant
request — a `ServiceId` and optional method names — so that the policy port
of [29 — Capability Grants and Call Log](./29-capability-grants-and-call-log.md) (BEH-BR-273, `Grant.of`) can compare a request with a grant without a translation;
the port, not core, decides what is granted. (2) Unknown properties are kept,
not dropped and not an error: a newer manifest read by an older core keeps
what it does not understand, and `consentDiff` still sees it.

## BEH-BR-242: A manifest's resolution fields must agree with what core resolves

> **Invariant:** [INV-BR-031](../invariants.md#inv-br-031-a-registered-contract-requirement-is-satisfied-by-its-registered-provider), [INV-BR-012](../invariants.md#inv-br-012-a-definition-error-registers-nothing)
> **See:** [ADR-BR-041](../decisions/041-manifest-as-data.md), [ADR-BR-040](../decisions/040-versioned-contracts-in-core.md)
> **Satisfies:** [URS-BR-030](../urs.md#urs-br-030-know-what-a-plugin-declares-before-running-its-code)

```ts
// illustrative — not type-checked
interface PluginDefinition<R, P, E, C> {
  // ... (01 — Plugin Definition)
  readonly manifest?: PluginManifest                 // optional on an eager definition; required by Plugin.lazy
}

class IncompatibleEngine extends Schema.TaggedError<IncompatibleEngine>()("IncompatibleEngine", {
  id: Schema.String, engine: Schema.String, range: Schema.String, actual: Schema.String
}) {}

declare const Bridger: { readonly version: string /* the version of @bridger/core */ }
```

```
REQUIREMENT: For an eager definition that carries a `manifest`, `install`,
             `replace` and `enable` MUST fail with `InvalidDefinition` unless
             the manifest agrees with the definition: equal `id`; `version`
             equal to `meta.version`; when the manifest has `digest`, a
             `meta.digest` equal to it (a manifest without `digest` agrees
             with any `meta.digest`); the same `ServiceId`s
             in `provides`, `requires` and `optional`; and for each contract
             reference the same version or range and the same method names
             (26 — Versioned Contracts, BEH-BR-227).
```

```
REQUIREMENT: When `engines["@bridger/core"]` is present, `install`,
             `replace` and `enable` MUST fail with `IncompatibleEngine`
             unless `Contract.satisfies(Bridger.version, range)` is true.
             A range outside the grammar of BEH-BR-226 MUST fail with
             `InvalidDefinition`. Every other key of `engines` MUST be
             ignored by core.
```

```
REQUIREMENT: For a lazy definition (BEH-BR-244), every check of BEH-BR-018,
             BEH-BR-019, BEH-BR-020 and BEH-BR-228 MUST be made from the
             manifest: `provides` reserves the provider slots, `requires`
             gives the dependency edges and the contract ranges, and
             `optional` is excluded from cycle detection.
```

```
REQUIREMENT: A trigger in `activation` and a `contributions` entry MUST be
             well formed per the schema; core MUST NOT check that a
             contribution's registry or an event's key exists.
```

A manifest that disagreed with its own definition would let a consent
screen, a gate or a reconcile decide about one plugin while the host ran
another. For an eager definition both are present, so the check is
immediate; for a lazy one the definition does not exist yet, and the same
comparison is made when it is loaded (BEH-BR-246). `engines` is checked by
core only for core itself: other engines (`node`, a companion, a browser)
are checked by whoever knows their versions.

## BEH-BR-243: consentDiff is a pure function of two manifests

> **Invariant:** [INV-BR-034](../invariants.md#inv-br-034-comparing-and-checking-manifests-evaluates-no-plugin-code)
> **See:** [ADR-BR-041](../decisions/041-manifest-as-data.md)
> **Satisfies:** [URS-BR-030](../urs.md#urs-br-030-know-what-a-plugin-declares-before-running-its-code)
> **Risk:** [RSK-BR-027](../gxp/03-risk-assessment.md#rsk-br-027)

```ts
// illustrative — not type-checked
declare const Manifest: {
  consentDiff(previous: PluginManifest | undefined, next: PluginManifest): ConsentDiff
}

interface ConsentDiff {
  readonly widened: readonly ConsentChange[]       // asks for more than before
  readonly narrowed: readonly ConsentChange[]      // asks for less than before
  readonly relabelled: readonly ConsentChange[]    // publisher, tier, residency changed
  readonly unclassified: readonly ConsentChange[]  // any other property that differs, extensions included
  readonly requiresConsent: boolean                // widened, relabelled or unclassified is non-empty
}
interface ConsentChange {
  readonly path: string                            // "requested.egress", "requested.capabilities[example/Audit@2].methods", "tier"
  readonly added?: readonly string[]
  readonly removed?: readonly string[]
  readonly from?: string
  readonly to?: string
}
```

| Field | Widened when | Narrowed when |
| --- | --- | --- |
| `requested.capabilities` | a `ServiceId` is added; a method is added; `methods` goes from a list to absent (all methods) | the reverse |
| `requested.permissions` | an entry is added | an entry is removed |
| `requested.egress` | a `host` is added | a `host` is removed |
| `requires`, `optional` | a `ServiceId` is added | a `ServiceId` is removed |
| `publisher`, `tier`, `residency` | — (relabelled whenever the value differs) | — |

```
REQUIREMENT: `Manifest.consentDiff` MUST be pure and total: no I/O, no host,
             clock or identifier service, no mutation of its arguments, and
             no failure. Equal inputs MUST give equal outputs; every list in
             the result MUST be sorted by `path`, and `added` and `removed`
             by code unit.
```

```
REQUIREMENT: Changes MUST be classified exactly as the table states. A
             difference in any other property — `extensions`, `config`,
             `contributions`, `activation`, `engines`, `provides`, a
             property the schema does not name — MUST be reported in
             `unclassified`, except `version`, `digest`, `description` and
             `manifestVersion`, which MUST NOT be reported.
```

```
REQUIREMENT: With `previous` undefined, every entry of `requested`, every
             `ServiceId` of `requires` and `optional`, and every label
             present in `next` MUST be reported as widened or relabelled.
```

```
REQUIREMENT: Core MUST NOT act on a `ConsentDiff`: no operation consults
             it, and nothing is refused because `requiresConsent` is true.
```

`consentDiff` answers one question for whoever asks for consent: "what does
this upgrade ask for that the previous version did not?". It is pure so that
the same answer can be computed by a marketplace before download, by a
consent screen, by a gate deciding whether an approval covers the change
(BEH-BR-248), and by a reviewer later, from the manifests alone. It is
classified generically — more, less, different label — and leaves wording,
severity and the decision to the application. Anything core cannot classify
is reported as `unclassified` and counts towards `requiresConsent`: an
unknown change is treated as needing a look, never as harmless
([RSK-BR-027](../gxp/03-risk-assessment.md#rsk-br-027)).

## BEH-BR-244: Plugin.lazy registers a plugin in the dormant state

> **Invariant:** [INV-BR-032](../invariants.md#inv-br-032-a-dormant-plugin-has-run-none-of-its-code), [INV-BR-001](../invariants.md#inv-br-001-one-provider-per-service-key-per-realm)
> **See:** [ADR-BR-042](../decisions/042-lazy-activation.md), [ADR-BR-014](../decisions/014-discriminated-plugin-snapshot.md)
> **Satisfies:** [URS-BR-031](../urs.md#urs-br-031-start-a-plugin-only-when-it-is-needed), [URS-BR-030](../urs.md#urs-br-030-know-what-a-plugin-declares-before-running-its-code)

```ts
// illustrative — not type-checked
interface LazyPluginDefinition {
  readonly _tag: "LazyPlugin"
  readonly id: string                               // manifest.id
  readonly manifest: PluginManifest
  readonly meta: { readonly version: string; readonly digest?: string }   // the identity: version from the manifest,
                                                                          // digest from options.digest ?? manifest.digest
  readonly load: Effect.Effect<AnyPluginDefinition, unknown>
}
declare const Plugin: {
  lazy(options: {
    readonly manifest: PluginManifest
    readonly load: Effect.Effect<AnyPluginDefinition, unknown>
    readonly digest?: string        // the digest of the code `load` will return, supplied beside the manifest
  }): LazyPluginDefinition
  // ...
}

type PluginState = "dormant" | "waiting" | "starting" | "active" | "stopping" | "failed" | "disabled"

type PluginSnapshot = PluginCommon & (
  | { readonly state: "dormant"; readonly triggers: readonly LazyTrigger[] }
  | { readonly state: "starting"; readonly providerIds: readonly string[]; readonly loading: boolean }
  // waiting, active, stopping (next gains "dormant"), disabled: unchanged (04, BEH-BR-027)
  | { readonly state: "failed"; readonly failure: { readonly phase: "load" | "build" | "activation" | "runtime" | "cleanup"; readonly message: string }; readonly missingServiceIds: readonly ServiceId[] }
)
interface PluginCommon {
  // ... (04, BEH-BR-027)
  readonly lazy?: { readonly loaded: boolean }      // present exactly for a registration made from a lazy definition
}
```

```
REQUIREMENT: `Plugin.lazy` MUST be pure: it MUST NOT run `load`, decode the
             manifest or register anything. The lazy definition's `meta`
             MUST be its identity: `version` equal to `manifest.version`,
             and `digest` equal to `options.digest` when given, otherwise to
             `manifest.digest` when present, otherwise absent. When both
             `options.digest` and `manifest.digest` are present and differ,
             `install`, `replace` and `reconcile` MUST fail the definition
             with `InvalidDefinition`, `reason` beginning "manifest:
             digest". `install`, `replace`,
             `reconcile` and `inspect` MUST accept a `LazyPluginDefinition`
             wherever they accept a `PluginDefinition`.
             `Plugin.Runtime.install` MUST reject one with
             `InvalidDefinition` (a child's parent is already running; a
             lazy child adds nothing).
```

```
REQUIREMENT: `install` of a lazy definition that passes every check MUST
             register the plugin in `dormant`, unless a trigger applies at
             once (BEH-BR-245), and MUST NOT call `load`. A `dormant` plugin
             MUST reserve the provider slots of its manifest's `provides`,
             MUST provide nothing, MUST hold no scope and no lease, and MUST
             NOT appear in `availableServiceIds`.
```

```
REQUIREMENT: The `dormant` snapshot variant MUST list in `triggers` every
             trigger that can wake the plugin: one `OnService` per
             `ServiceId` of `provides`, one `OnContribution` per
             `contributions` entry, then the `activation` entries, without
             duplicates, in that order. `meta` MUST be the lazy
             definition's `meta` (`version`, `digest`) with the manifest's
             `description`. `lazy.loaded`
             MUST be false until a load succeeds and true afterwards, for
             the rest of the registration.
```

```
REQUIREMENT: The transitions of 04 — States and Snapshots (BEH-BR-026) MUST
             gain exactly these edges: `[*] → dormant` (install of a lazy
             definition); `dormant → starting` and `dormant → waiting`
             (triggered, by requirement availability); `dormant → disabled`
             (disable); `dormant → [*]` (remove); `disabled → dormant`
             (enable of a registration not yet loaded); `waiting → dormant`
             and `failed → dormant` (replace with a lazy definition); and
             `stopping → dormant` (a replace with a lazy definition
             completes). `starting` MUST cover loading as well as queued and
             building.
```

`dormant` is a seventh state rather than a flag on `waiting` or `disabled`
because it has its own meaning and its own legality: unlike `waiting`, it may
have nothing missing and still not start; unlike `disabled`, it holds its
provider slots and starts without an operator. Making it a variant keeps the
snapshot union honest ([ADR-BR-014](../decisions/014-discriminated-plugin-snapshot.md)):
a `dormant` entry has triggers and nothing else, and a screen can say "not
loaded" without inferring it.

**Settled here.** (0) The digest that identifies a lazy plugin's code lives
beside the manifest, not necessarily in it: a manifest that is signed and
digested as part of the package it describes cannot contain that package's
digest, so whoever builds the lazy definition from a verified package (the
loader companion, [`references/loader/`](../../loader/README.md)) passes the
package digest as `options.digest`. A manifest may still carry `digest` when
its author knows it; then the two must agree. (1) A lazy plugin's slots are reserved from its manifest at
registration, as an eager plugin's are (BEH-BR-019): otherwise another
plugin could take a key while the first is dormant, and the conflict would
appear at load, at a moment no operator chose. (2) Once loaded, the loaded
definition is kept for the registration — through `restart`, `retry` after a
build failure, `reconfigure`, `disable` and `enable` — and dropped only by
`remove` and `replace`. Returning a loaded plugin to `dormant` when idle is
**Open**: it would deactivate behaviour but could not reclaim the imported
code (BEH-BR-008).

## BEH-BR-245: Triggers wake a dormant plugin

> **Invariant:** [INV-BR-032](../invariants.md#inv-br-032-a-dormant-plugin-has-run-none-of-its-code), [INV-BR-030](../invariants.md#inv-br-030-host-transitions-never-wait-on-each-other-in-a-cycle)
> **See:** [ADR-BR-042](../decisions/042-lazy-activation.md), [ADR-BR-020](../decisions/020-typed-event-bus.md)
> **Satisfies:** [URS-BR-031](../urs.md#urs-br-031-start-a-plugin-only-when-it-is-needed)
> **Risk:** [RSK-BR-026](../gxp/03-risk-assessment.md#rsk-br-026)

```ts
// illustrative — not type-checked
interface Host {
  // ...
  wake(trigger: LazyTrigger, options?: { readonly realm?: string; readonly correlationId?: string }):
    Effect.Effect<WakeReport, UnknownRealm | HostClosed>
}
interface WakeReport { readonly triggered: readonly { readonly id: string; readonly realm: string }[] }
```

A trigger *applies* to a `dormant` plugin as follows:

| Trigger | Applies when |
| --- | --- |
| `OnService` (implicit) | a registered plugin that is neither `dormant` nor `disabled` has, in `requires`, a key whose provider under `scopeOf` is the dormant plugin — at once when both are registered, or when the dependent later becomes neither `dormant` nor `disabled`; or `wake({ _tag: "OnService", serviceId })` names a key the dormant plugin provides in the call's realm scope |
| `OnContribution` (implicit) | `wake` names a `{ registry, id }` listed in the plugin's `contributions`, in the call's realm |
| `OnEvent` (declared) | an `emit`, `parallel`, `serial` or `waterfall` dispatch on `Bridger.Events` of an event whose id appears in the plugin's `activation`, in any realm, once a wired `AccessPolicy` has allowed the dispatch (16, BEH-BR-141); or `wake` names it, in the call's realm |

```
REQUIREMENT: When a trigger applies, the host MUST move the plugin out of
             `dormant` as a system transition: to `starting` when every key
             in its manifest's `requires` has an `active` provider, to
             `waiting` otherwise. The transition MUST be taken at the
             plugin's linearization point, after any operation already
             linearized there; a trigger that reaches a plugin no longer
             `dormant` MUST do nothing.
```

```
REQUIREMENT: A dependent that leaves `dormant` for `waiting` MUST in turn
             apply `OnService` to each dormant provider of its `requires`.
             Keys in `optional` MUST NOT trigger anything.
```

```
REQUIREMENT: `use`, `useAll`, `lease`, `useOptional`, `whenAvailable`,
             `awaitActive`, `snapshot` and `inspect` MUST NOT trigger: a
             read of a dormant provider's key fails with
             `ServiceUnavailable` as for any provider that is not `active`
             (08 — Operation Legality, BEH-BR-076).
```

```
REQUIREMENT: The dispatch that fires an `OnEvent` trigger MUST NOT be
             delayed by it and MUST NOT be delivered to the plugin it wakes,
             which has no listener yet. Core MUST NOT buffer or replay the
             event.
```

```
REQUIREMENT: `wake` MUST return once the triggers it applied have been
             linearized, listing in `triggered` the plugins that left
             `dormant` because of it, and MUST NOT wait for them to become
             `active`. It MUST NOT be submitted to the gate and is not one of
             the mutating operations of 08 — Operation Legality.
```

`wake` is the explicit entry for a caller that knows something the host does
not: a menu companion showing a contribution declared in a manifest, a
command catalog asked to run a command of a dormant plugin, an application
that wants a service and will wait on `awaitActive`. The implicit `OnService`
rule propagates need along `requires`: an eager dependent wakes its
providers as soon as it is registered, and a lazy dependent wakes them only
once it is woken itself, so a chain of lazy plugins loads only as far as
something needs it.

**Settled here.** (1) Reads never trigger. A `use` that loaded code would turn
a read into a lifecycle change with no caller to attribute it to and no
bound on its latency; the caller that wants a load asks for one. (2) The
event that fires `OnEvent` is not redelivered: the event bus is fire and
forget (BEH-BR-141), and buffering for plugins that do not exist yet would
make it a queue. A plugin that must see the event that woke it needs a
companion that retains events ([`references/durable-bus/`](../../durable-bus/README.md)) or an `OnService`
trigger instead. (3) Leaving `dormant` is not gated: the operator decision
was the `install` or `replace` of the lazy definition, with its manifest,
which was gated (BEH-BR-248); loading on demand is its consequence, as a
`system-start` after a provider returns is (BEH-BR-223).

## BEH-BR-246: Loading runs in the build step, and the loaded definition must match the manifest

> **Invariant:** [INV-BR-033](../invariants.md#inv-br-033-a-loaded-definition-is-published-only-if-it-matches-its-manifest), [INV-BR-007](../invariants.md#inv-br-007-failure-is-sticky)
> **See:** [ADR-BR-042](../decisions/042-lazy-activation.md), [ADR-BR-005](../decisions/005-failure-is-sticky.md)
> **Satisfies:** [URS-BR-031](../urs.md#urs-br-031-start-a-plugin-only-when-it-is-needed), [URS-BR-006](../urs.md#urs-br-006-recover-from-failure-explicitly-and-never-silently)
> **Risk:** [RSK-BR-026](../gxp/03-risk-assessment.md#rsk-br-026), [RSK-BR-017](../gxp/03-risk-assessment.md#rsk-br-017)

```ts
// illustrative — not type-checked
class LoadFailed extends Schema.TaggedError<LoadFailed>()("LoadFailed", { id: Schema.String, message: Schema.String }) {}
class ManifestMismatch extends Schema.TaggedError<ManifestMismatch>()("ManifestMismatch", { id: Schema.String, field: Schema.String }) {}
```

```
REQUIREMENT: For a registration not yet loaded, the build step of an
             activation (05 — Activation, BEH-BR-034) MUST run `load` first,
             in the same build slot and under the same `buildTimeout`, with
             `loading` true on the `starting` snapshot until it settles.
             `load` MUST be run at most once per activation attempt.
```

```
REQUIREMENT: When `load` fails, dies or exceeds `buildTimeout`, the plugin
             MUST become `failed` with phase "load" and a `LoadFailed` cause
             whose message core writes from the cause's kind, never from
             text `load` returned. Nothing MUST be published.
```

```
REQUIREMENT: When `load` succeeds, before configuration is decoded, the host
             MUST compare the loaded definition with the registered manifest
             as BEH-BR-242 compares an eager definition with its manifest,
             except for the digest: the loaded definition's `meta.digest`
             MUST equal the lazy definition's `meta.digest` (BEH-BR-244),
             both absent or both present and equal. On any difference the
             plugin MUST become `failed` with phase "load" and a
             `ManifestMismatch { id, field }` cause naming the first
             differing field, and the loaded definition MUST be discarded.
             A loaded definition that is itself lazy MUST be a mismatch
             (field "lazy"). A `manifest` the loaded definition carries
             MUST be ignored: the registered manifest is the one in effect
             for the registration, and the loaded definition is compared
             with it.
```

```
REQUIREMENT: Failure phase "load" MUST be sticky and MUST have the legality
             of phases "build" and "activation" (08 — Operation Legality,
             BEH-BR-071). `retry`, `restart`, `reconfigure` and `enable`
             from it MUST run `load` again; `retry` after a build or
             activation failure of a loaded registration MUST NOT.
```

```
REQUIREMENT: Configuration for a registration not yet loaded MUST be read and
             decoded after the load, with the loaded definition's schema; a
             decode failure fails the activation with phase "activation"
             (11 — Configuration, BEH-BR-097).
```

Running the load inside the build step means nothing new is needed to bound,
step or interrupt it: one transition step per plugin (INV-BR-009), one slot,
one timeout, and the in-flight table's rows for `starting` cover an operation
that arrives while code is loading. The manifest comparison is the one check
core can make on what was loaded: that it declares what was registered,
approved and resolved. It cannot tell whether the code is the code the
digest names — that is the job of the `load` the loader companion builds,
which checks the digest and signatures before the code is evaluated
([`references/loader/`](../../loader/README.md), [RSK-BR-017](../gxp/03-risk-assessment.md#rsk-br-017)).

**Settled here.** Phase "load" is separate from "build" so that an operator
can tell "the code could not be obtained or did not match its manifest" from
"the code ran and failed", which call for different people. A loaded plugin
that contributes to a registry or listens to an event its manifest did not
declare is not detected by core; contribution and bus access rules are those of
[28 — Plugin Principal and Mandatory Policy](./28-plugin-principal-and-mandatory-policy.md) (BEH-BR-264).

## BEH-BR-247: The dormant row of the legality table

> **Invariant:** [INV-BR-011](../invariants.md#inv-br-011-every-state-and-operation-pair-has-a-defined-outcome), [INV-BR-032](../invariants.md#inv-br-032-a-dormant-plugin-has-run-none-of-its-code)
> **See:** [ADR-BR-042](../decisions/042-lazy-activation.md), [ADR-BR-013](../decisions/013-total-operation-legality.md)
> **Satisfies:** [URS-BR-031](../urs.md#urs-br-031-start-a-plugin-only-when-it-is-needed), [URS-BR-002](../urs.md#urs-br-002-remove-or-replace-a-plugin-safely-while-it-is-in-use)
> **Risk:** [RSK-BR-019](../gxp/03-risk-assessment.md#rsk-br-019)
> **Regulatory:** supports 21 CFR 11.10(f)

| State | install | remove | replace | retry | reconfigure | restart | disable | enable |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **dormant** | `DuplicatePlugin` | unregisters at once; nothing was loaded | swap → `dormant` (lazy) or starting/waiting (eager); triggers re-applied | no-op | stores or clears the raw override; not decoded until load | no-op | → `disabled` | no-op |

```
REQUIREMENT: The state by operation table of 08 — Operation Legality
             (BEH-BR-071) MUST gain the row above, and every cell of it MUST
             be an acceptance check of the core.
```

```
REQUIREMENT: In the `disabled` row, `enable` MUST land in `dormant` when the
             registration is lazy and not loaded, unless a trigger applies at
             once. In every row, a `replace` with a lazy definition MUST land
             in `dormant` where the table says starting/waiting, and the
             triggers MUST then be applied.
```

```
REQUIREMENT: Every operation on a `dormant` plugin MUST complete in one
             revision with no transition step: none waits for a build, a
             drain or a scope close. A `remove` or `replace` of a `dormant`
             plugin MUST write no `system-stop` record.
```

```
REQUIREMENT: A registration is *not yet loaded* when its
             `PluginCommon.lazy.loaded` is false: `dormant`, `disabled` or
             `waiting` before a load succeeded, and `failed` with phase
             "load". `reconfigure` with a value on such a registration MUST
             be treated as `install` with `config` is (03 — Installation,
             BEH-BR-022): the raw value is stored without decoding, since
             the schema is in code not loaded, and `ConfigInvalid` is an
             activation outcome; `configChange.paths` on the request and on
             every record MUST be the top-level keys of the raw value (23 —
             Audit Sink and Record, BEH-BR-197); and step 4a of BEH-BR-188
             MUST hand a wired `ConfigFingerprinter` the form "raw" with
             those keys as candidate paths.
```

```
REQUIREMENT: Shutdown MUST unregister `dormant` plugins without a stop step,
             as it does `waiting` plugins (12 — Shutdown and Hosting,
             BEH-BR-105); they MUST NOT appear in `CloseReport.stopped`,
             `forced` or `failed`.
```

The in-flight table (BEH-BR-072) needs no new row: no operation is ever in
flight on a `dormant` plugin, because every operation on it completes at
once, and a plugin that is loading is `starting`, whose rows already decide
an operation that arrives during the step. `restart` and `retry` do not wake
a dormant plugin: there is nothing to restart and nothing failed, and
loading is the business of triggers.

## BEH-BR-248: Reconcile, gate and audit work from manifests without evaluating code

> **Invariant:** [INV-BR-034](../invariants.md#inv-br-034-comparing-and-checking-manifests-evaluates-no-plugin-code), [INV-BR-021](../invariants.md#inv-br-021-reconcile-is-idempotent), [INV-BR-022](../invariants.md#inv-br-022-one-requested-and-one-terminal-record-per-mutating-call)
> **See:** [ADR-BR-042](../decisions/042-lazy-activation.md), [ADR-BR-023](../decisions/023-desired-state-reconcile.md), [ADR-BR-032](../decisions/032-operation-gate.md)
> **Satisfies:** [URS-BR-016](../urs.md#urs-br-016-drive-the-plugin-set-from-a-declarative-list), [URS-BR-028](../urs.md#urs-br-028-know-which-plugin-version-was-active-at-any-time), [URS-BR-030](../urs.md#urs-br-030-know-what-a-plugin-declares-before-running-its-code)
> **Risk:** [RSK-BR-004](../gxp/03-risk-assessment.md#rsk-br-004), [RSK-BR-026](../gxp/03-risk-assessment.md#rsk-br-026), [RSK-BR-027](../gxp/03-risk-assessment.md#rsk-br-027)
> **Regulatory:** supports 21 CFR 11.10(e); EU GMP Annex 11 §9, §10

```ts
// illustrative — not type-checked
interface DesiredPlugin { readonly plugin: PluginDefinition<any, any, any, any> | LazyPluginDefinition /* ... (18) */ }

interface OperationRequest {
  // ... (25, BEH-BR-219)
  readonly definition?: { readonly version?: string; readonly digest?: string; readonly manifest?: PluginManifest }
  readonly previousManifest?: PluginManifest          // replace only: the manifest of the definition being replaced
}

interface AuditRecord {
  // ... (23, BEH-BR-195)
  readonly trigger?: LazyTrigger                      // lazy-triggered records only
}
// SystemTransition gains "lazy-triggered"; PluginState in before/after gains "dormant".
// HostEvent gains { type: "plugin-triggered"; trigger: LazyTrigger } (13).
```

```
REQUIREMENT: `reconcile` MUST NOT call `load`. A lazy definition's `meta`
             for the "same definition" rule of BEH-BR-154 MUST be its
             identity `meta` (BEH-BR-244: the manifest's `version` and the
             digest supplied beside or in the manifest); an installed
             registration MUST be compared by the definition it was
             registered with, loaded or not. Two lazy definitions are the
             same only when they are the same object or both `meta` carry
             `version` and `digest` and both pairs are equal (BEH-BR-154);
             two packages with one version and different digests
             are different definitions.
```

```
REQUIREMENT: For a lazy definition, `OperationRequest.definition.version`
             and `definition.digest` MUST be its identity `meta`
             (BEH-BR-244). `OperationRequest.definition.manifest` MUST be the presented
             definition's manifest object (BEH-BR-241) whenever that
             definition carries one, and `previousManifest` MUST be present
             on a `replace` exactly when the replaced definition carries
             one, so that a gate can compute `consentDiff` itself. Audit
             records MUST NOT carry manifests.
```

```
REQUIREMENT: With a sink wired, when a plugin leaves `dormant` because a
             trigger applied, the host MUST write one `system` record with
             operation `lazy-triggered`, `before.state` "dormant",
             `after.state` "starting" or "waiting", and `trigger`. Its
             `causationId` MUST be the `recordId` of the record of the call
             or system transition that made the trigger apply (an install,
             replace or enable of a dependent; a dependent's own
             `lazy-triggered` record), and it MUST be a root otherwise
             (`wake`, an event dispatch), with the `correlationId` of
             `wake`'s options when one is given.
```

```
REQUIREMENT: The activation that follows MUST settle with a `system-start`
             record as BEH-BR-199 requires, with `after.state` "active" or
             "failed", including failure phase "load", and with the
             `lazy-triggered` record as its cause.
```

```
REQUIREMENT: `Host.events` MUST emit `plugin-triggered` with the trigger in
             the revision in which a plugin leaves `dormant`.
```

A desired list of lazy entries can be reconciled on a terminal that has never
loaded any of them: the host compares manifests, reserves slots and records
what changed, and code arrives only when something needs it. The gate sees
the manifest of what it is approving and, for a replace, the one it replaces,
so "approve upgrades that ask for nothing new" is a gate rule over
`consentDiff`, not a core feature. Records stay small: they carry the version
and digest as before, and the manifest itself is the companion's to retain.

## BEH-BR-249: Discovery without code

> **Invariant:** [INV-BR-034](../invariants.md#inv-br-034-comparing-and-checking-manifests-evaluates-no-plugin-code)
> **See:** [ADR-BR-041](../decisions/041-manifest-as-data.md), [ADR-BR-042](../decisions/042-lazy-activation.md)
> **Satisfies:** [URS-BR-030](../urs.md#urs-br-030-know-what-a-plugin-declares-before-running-its-code)

```ts
// illustrative — not type-checked
interface PluginInspection {
  // ... (13 — Observability and Diagnostics; 26, BEH-BR-232)
  readonly manifest?: PluginManifest                  // the registered definition's manifest, when it carries one
}
```

```
REQUIREMENT: `inspect` MUST return the registered definition's manifest
             object when it carries one, in every state, and MUST NOT call
             `load` to do so.
```

```
REQUIREMENT: Documentation MUST state that discovery across plugins that
             are not installed — a catalog, a search, a marketplace listing,
             an agent's tool list — is built from manifests by companions
             (the loader's manifest registry, `references/loader/`; the
             command catalog, `references/command/`), and that core keeps
             no catalog of its own.
```

Within one host, a `dormant` registration answers "what would this plugin
provide, need and contribute?" from data, so an admin screen or an agent can
list capabilities that have not been loaded and decide whether to wake one.
Beyond the host, the same record travels on its own: it is a Schema-described
value, and the loader companion is to keep and serve it next to the package
it describes.

---

_Previous: [26 — Versioned Contracts](./26-versioned-contracts.md)_ · _Next: [28 — Plugin Principal and Mandatory Policy](./28-plugin-principal-and-mandatory-policy.md)_
