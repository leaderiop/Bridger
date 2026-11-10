# 27 — Manifest and Lazy Activation

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-BEH-27                                               |
> | Revision       | 0.13                                                         |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.13 (2026-11-10): BEH-BR-246 `enable` from phase "load" is a no-op, as from any `failed` phase; `retry`, `restart` and `reconfigure` run `load` again (C7) (CCR-BR-036)<br>0.12 (2026-11-10): BEH-BR-251 a held event's listeners run with no `CurrentTransition` (H1); BEH-BR-250 settled note: a registration the `RefusalList` disabled may have been loaded before a refused start or background restart (audit round 3, Low) (CCR-BR-035)<br>0.11 (2026-11-10): BEH-BR-245 the `RefusalList` is consulted on every trigger that moves a `dormant` plugin, to `waiting` too (C14); BEH-BR-247 `reconfigure` without a value on a registration not yet loaded clears the override undecoded (C4); BEH-BR-250 `HostLink` fiber list made open and extended (`load`, `whenAvailable`, health checks, handoff steps, forks) (audit round 2, Low); BEH-BR-252 an idle return whose cleanup fails ends `failed(cleanup)` with a `system-stop` record and no `lazy-idle` (C15) (CCR-BR-034)<br>0.10 (2026-11-09): BEH-BR-242 the registered manifest of an eager definition is the `manifest` it carries when it is installed or replaced; a definition stamped by the loader companion carries the signed package manifest, which core does not verify (M-02, core side); BEH-BR-246 a loaded definition that breaks a rule of BEH-BR-003, an invalid `handoff` among them, fails the load with `InvalidDefinition` (U-05) (CCR-BR-033)<br>0.9 (2026-11-09): BEH-BR-252 an operator operation during an idle return waits for it and is decided against `dormant`, under BEH-BR-073 (C-06) (CCR-BR-032)<br>0.8 (2026-11-08): BEH-BR-251 a load and build that succeed for a stop that waited are discarded and drop the held event "ended" (prototype finding G-P19); BEH-BR-252 a trigger kept during an idle return is not listed in `WakeReport.triggered` (G-P22); BEH-BR-250 a link without `hostId` counts as `HostLink.none` at a hook point (G-P20) (CCR-BR-030)<br>0.7 (2026-11-08): BEH-BR-250 declarations also reported "idling" (idle return under way) and "refused" (disabled by the `RefusalList`), `HostLink.hostId`, the link is no longer called harmless (agent review R1-03, R1-04, R1-06); BEH-BR-251 drop reason when a removal waits for a running load (G-P14); BEH-BR-252 idle conditions limited to what the host observes (G-P17) (CCR-BR-029)<br>0.6 (2026-11-08): BEH-BR-241 `range` and `version` of a required reference appear together (prototype finding G-P5); BEH-BR-243 shapes of `methods` going from a list to absent and of an egress `purpose` change (G-P6); BEH-BR-252 Settled (4), loaded or not is history for confluence (G-P7) (CCR-BR-028)<br>0.5 (2026-11-08): BEH-BR-241 note: the loader companion binds `publisher` to a configured signer (`PublisherMismatch`, loader BEH-LD-053); core's reading unchanged (CCR-BR-027)<br>0.4 (2026-11-08): manifest `listens`; BEH-BR-246 Settled cites `AccessPolicy.declaredOnly`; BEH-BR-245 refused starts are not triggered (CCR-BR-026)<br>0.3 (2026-11-08): manifest `contributions` entries carry an optional hook `role` and `target`; `Host.declaredContributions` and the `HostLink` reference (BEH-BR-250); an `OnEvent` wake holds its triggering event for the woken plugin's listeners (BEH-BR-251, amends BEH-BR-245); `Plugin.lazy` `idle` returns an idle loaded plugin to `dormant` through a normal drain (BEH-BR-252, closes URS gap G37); the root `lazy-triggered` record of a `wake` or a dispatch carries the caller's principal as `onBehalfOf` (BEH-BR-253, closes URS gap G39); checks 92, 96 and 97 (CCR-BR-024)<br>0.2 (2026-11-08): a lazy definition's identity digest is supplied to `Plugin.lazy` beside the manifest (a signed manifest cannot carry its own package's digest); manifest `digest` compared only when present; a loaded definition's own manifest ignored; contract references with a version require `methods`; manifest decoding first within the `InvalidDefinition` check; `reconfigure` on any registration not yet loaded is treated like `install` with `config`; `wake` takes no `OperationContext`; checks 62–66 (CCR-BR-022)<br>0.1 (2026-11-08): Initial draft (CCR-BR-017) |

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
BEH-BR-241–256 and uses BEH-BR-241–253; 254–256 are reserved. BEH-BR-250–253
(revision 0.3, [ADR-BR-050](../decisions/050-dormant-veto-and-hook-phases.md))
let a hook point see contributions declared by plugins not yet loaded, hold
the event that woke a plugin, return an idle plugin to `dormant`, and record
on whose behalf a plugin was woken.

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
62–66, 92, 96 and 97 of BEH-BR-184 ([21 — Testing Host](./21-testing-host.md)).

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
  contributions: Schema.optional(Schema.Array(Schema.Struct({
    registry: Schema.String, id: Schema.String,
    role: Schema.optional(Schema.Literal("veto", "enrich", "advisory")),   // read by hook points only (31, BEH-BR-309)
    target: Schema.optional(Schema.Unknown)                                 // a hook target selector, carried uninterpreted (31, BEH-BR-312)
  }))),
  listens: Schema.optional(Schema.Array(Schema.String)),   // event ids the plugin listens to; compared by AccessPolicy.declaredOnly (28, BEH-BR-268)
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
             have `methods`, under the same failure. In `requires` and
             `optional`, `range` and `version` MUST appear together: a
             reference with one and not the other MUST fail the call with
             `InvalidDefinition`, `reason` beginning "manifest:" and naming
             the path (CCR-BR-028).
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

Core does not interpret `publisher`. The loader companion accepts a package
whose manifest carries a `publisher` only when a verified signer is
configured for that name, otherwise it refuses the package with
`PublisherMismatch`
([`references/loader/`](../../loader/behaviors/07-signed-statements.md),
BEH-LD-053); under a pinned-digest acceptance the label is reported as
unbound. Core's reading of the field is unchanged (CCR-BR-027).

**Settled here.** (1) `requested.capabilities` has the shape of a grant
request — a `ServiceId` and optional method names — so that the policy port
of [29 — Capability Grants and Call Log](./29-capability-grants-and-call-log.md) (BEH-BR-273, `Grant.of`) can compare a request with a grant without a translation;
the port, not core, decides what is granted. (2) Unknown properties are kept,
not dropped and not an error: a newer manifest read by an older core keeps
what it does not understand, and `consentDiff` still sees it. (3) A
`contributions` entry may say which hook role and which target it will
register with (revision 0.3). Core does not check either against what the
plugin later registers; it hands both to the hook point named by `registry`
through `declaredContributions` (BEH-BR-250), which admits the declaration
by its own rule ([31 — Hook Points](./31-hook-points.md), BEH-BR-309). A
change to either is reported by `consentDiff` as `unclassified`, like any
change to `contributions`.

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
REQUIREMENT: The *registered manifest* of a registration MUST be, for an
             eager definition, the `manifest` the definition carries when
             it is installed or replaced — none when it carries none —
             and, for a lazy definition, the lazy definition's
             `manifest`. It MUST stay fixed until the registration's
             definition is next replaced; `restart`, `reconfigure`,
             `disable`, `enable` and a load MUST NOT change it. Every rule
             that reads "the registered manifest" — the gate request
             (25, BEH-BR-219), `consentDiff` (BEH-BR-243), `declared` on
             access requests (28, BEH-BR-268) — MUST read this one.
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
REQUIREMENT: A trigger in `activation`, a `contributions` entry and a
             `listens` entry MUST be well formed per the schema; core MUST
             NOT check that a contribution's registry or an event's key
             exists.
```

A manifest that disagreed with its own definition would let a consent
screen, a gate or a reconcile decide about one plugin while the host ran
another. For an eager definition both are present, so the check is
immediate; for a lazy one the definition does not exist yet, and the same
comparison is made when it is loaded (BEH-BR-246).

Core reads a manifest; it does not know who wrote it. An eager definition's
manifest is whatever object its `manifest` field holds, so for code that
declares its own manifest the registered manifest is the code's claim about
itself. The loader companion closes that gap for the code it loads: it
returns the evaluated definition with `manifest` set to the package's
signed manifest, replacing any the code declared
([`references/loader/`](../../loader/README.md), BEH-LD-007), so for a
loader-stamped eager definition the registered manifest is the signed one,
and the agreement check above compares the code with what was signed. Core
verifies no signature and cannot tell a stamped manifest from a declared
one; a deployment that requires signed manifests refuses definitions the
loader did not stamp at its gate (loader BEH-LD-015). `engines` is checked by
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
REQUIREMENT: For `requested.capabilities`, `methods` going from a list to
             absent MUST be reported in `widened` as `{ path:
             "requested.capabilities[<serviceId>].methods", from: "list",
             to: "all" }`, and from absent to a list in `narrowed` with
             `from: "all", to: "list"`; method names added to or removed
             from a list present in both manifests MUST be reported under
             the same path with `added` or `removed`. For
             `requested.egress`, a change of `purpose` on a `host` present
             in both manifests MUST be reported in `unclassified` with path
             `requested.egress[<host>].purpose`, `from` the previous
             purpose and `to` the next, each absent when that manifest has
             none (CCR-BR-028).
```

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
  readonly idle?: Duration.Duration                 // BEH-BR-252
  readonly holdTimeout: Duration.Duration           // BEH-BR-251
}
declare const Plugin: {
  lazy(options: {
    readonly manifest: PluginManifest
    readonly load: Effect.Effect<AnyPluginDefinition, unknown>
    readonly digest?: string        // the digest of the code `load` will return, supplied beside the manifest
    readonly idle?: Duration.Input  // BEH-BR-252: return to `dormant` after this long idle; default: never
    readonly holdTimeout?: Duration.Input   // BEH-BR-251: how long a triggering event is held; default 60 seconds
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
             MUST be false until a load succeeds and true afterwards, until
             the registration ends or an idle return releases the loaded
             definition (BEH-BR-252).
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
             completes, or an idle return completes, BEH-BR-252). An idle
             return MUST use the existing edge `active → stopping` with
             `next: "dormant"`. `starting` MUST cover loading as well as
             queued and building.
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
`remove` and `replace`, or released by an idle return. Returning a loaded
plugin to `dormant` when idle was **Open** until revision 0.3 (URS gap G37);
it is specified by BEH-BR-252, which deactivates behaviour and releases the
loaded definition but cannot reclaim imported code (BEH-BR-008).

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
             delayed by it, and MUST NOT wait for the plugin it wakes, which
             has no listener yet. The triggering event MUST be held for that
             plugin and delivered to it as BEH-BR-251 specifies; core MUST
             NOT buffer or replay any other event. (Amended by revision 0.3;
             revisions 0.1–0.2 dropped the triggering event.)
```

```
REQUIREMENT: `wake` MUST return once the triggers it applied have been
             linearized, listing in `triggered` the plugins that left
             `dormant` because of it, and MUST NOT wait for them to become
             `active`. It MUST NOT be submitted to the gate and is not one of
             the mutating operations of 08 — Operation Legality.
```

```
REQUIREMENT: A plugin whose start a wired `RefusalList` refuses (28 — Plugin
             Principal and Mandatory Policy, BEH-BR-267) MUST NOT be
             triggered: it moves to `disabled` with reason
             "refused-digest", writes no `lazy-triggered` record, and MUST
             NOT be listed in `WakeReport.triggered`. The host MUST consult
             the list each time a trigger applies to a `dormant` plugin,
             whether the plugin would leave for `starting` or for
             `waiting`, in addition to the points BEH-BR-267 lists.
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
bound on its latency; the caller that wants a load asks for one. A hook
point that finds a declared contribution of a plugin not yet loaded is such
a caller: it calls `wake` itself (31 — Hook Points, BEH-BR-309). (2) The
event that fires `OnEvent` is held — that one event, for the plugin it woke,
for a bounded time — and delivered once the plugin is `active` (BEH-BR-251).
Revision 0.2 dropped it, so a lazy consumer always missed the first event it
existed for. Other events dispatched while the plugin starts are not held:
holding them would make the bus a queue. A plugin that must see every event
needs a companion that retains events ([`references/durable-bus/`](../../durable-bus/README.md)). (3) Leaving `dormant` is not gated: the operator decision
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
REQUIREMENT: When `load` succeeds, the loaded definition MUST first pass the
             rules of BEH-BR-003 (01 — Plugin Definition), which a manifest
             cannot carry and `install` could not check — among them the
             `volatile`, `health` and `handoff` rules (34 — State Handoff,
             BEH-BR-345). A loaded definition that breaks one MUST make the
             plugin `failed` with phase "load" and an `InvalidDefinition
             { id, reason }` cause, `reason` naming the rule as `install`
             would, and MUST be discarded; nothing MUST be published.
```

```
REQUIREMENT: When `load` succeeds and the rules above hold, before
             configuration is decoded, the host
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
             BEH-BR-071). `retry`, `restart` and `reconfigure` from it
             MUST run `load` again, and `enable` from it is a no-op as
             from any `failed` phase; `retry` after a build or activation
             failure of a loaded registration MUST NOT run `load`.
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
declare is refused when the deployment wires `AccessPolicy.declaredOnly`
([28 — Plugin Principal and Mandatory Policy](./28-plugin-principal-and-mandatory-policy.md),
BEH-BR-268); otherwise contribution and bus access rules are those of
BEH-BR-264.

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
             those keys as candidate paths. `reconfigure` without a value on
             such a registration MUST clear the stored override without
             reading or decoding the configuration source (11 —
             Configuration, BEH-BR-101); the source is decoded at the next
             build, where `ConfigInvalid` is an activation outcome.
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
// SystemTransition gains "lazy-triggered" and "lazy-idle" (BEH-BR-252); PluginState in before/after gains "dormant".
// HostEvent gains { type: "plugin-triggered"; trigger: LazyTrigger } (13),
//   { type: "plugin-idled" } (BEH-BR-252) and
//   { type: "held-event-dropped"; event: string; reason: HeldEventDropReason } (BEH-BR-251).
// A root lazy-triggered record carries onBehalfOf when the caller had a principal (BEH-BR-253).
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
             `wake`'s options when one is given. A root record carries the
             caller's principal as `onBehalfOf` (BEH-BR-253).
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

## BEH-BR-250: Declared contributions are readable without loading, through a HostLink

> **Invariant:** [INV-BR-034](../invariants.md#inv-br-034-comparing-and-checking-manifests-evaluates-no-plugin-code), [INV-BR-032](../invariants.md#inv-br-032-a-dormant-plugin-has-run-none-of-its-code)
> **See:** [ADR-BR-050](../decisions/050-dormant-veto-and-hook-phases.md), [ADR-BR-041](../decisions/041-manifest-as-data.md)
> **Satisfies:** [URS-BR-049](../urs.md#urs-br-049-keep-a-policy-decision-closed-while-a-contributor-to-it-is-not-yet-loaded), [URS-BR-030](../urs.md#urs-br-030-know-what-a-plugin-declares-before-running-its-code)
> **Risk:** [RSK-BR-057](../gxp/03-risk-assessment.md#rsk-br-057)

```ts
// illustrative — not type-checked
interface DeclaredContribution {
  readonly registry: string
  readonly id: string
  readonly role?: "veto" | "enrich" | "advisory"     // the manifest entry's role, when present
  readonly target?: unknown                           // the manifest entry's target, the object as given
  readonly pluginId: string                           // the registration's id
  readonly realm: string                              // the registration's realm
  readonly status: "dormant" | "waking" | "load-failed"
                | "idling"                                    // stopping toward dormant by an idle return (BEH-BR-252)
                | "refused"                                   // disabled with reason "refused-digest" (28, BEH-BR-267)
}

interface Host {
  // ...
  declaredContributions(registry: string): Effect.Effect<readonly DeclaredContribution[], HostClosed>
  readonly link: HostLink
}

interface HostLink {
  readonly hostId?: string                            // the host's hostId (02, BEH-BR-016); absent on HostLink.none;
                                                      // a link without hostId counts as HostLink.none at a hook point (31, BEH-BR-309)
  readonly declaredContributions: (registry: string) => Effect.Effect<readonly DeclaredContribution[], HostClosed>
  readonly wake: Host["wake"]
}

declare const HostLink: {
  // Context.Reference, identifier "@bridger/core/HostLink", default Option.none()
  readonly reference: Context.Reference<Option.Option<HostLink>>
  readonly none: HostLink                             // declares nothing; its wake applies nothing
}

// Application code outside the host's fibers dispatches a hook point with the host's link:
yield* point.dispatch(input).pipe(Effect.provideService(HostLink.reference, Option.some(host.link)))
```

```
REQUIREMENT: `declaredContributions(registry)` MUST return one entry per
             `contributions` entry whose `registry` equals the argument, of
             every registration in any realm whose registered definition is
             lazy and that is in one of these states: status "dormant" for
             a `dormant` registration, "waking" for one in `waiting` or
             `starting` before its load succeeded, "load-failed" for one
             `failed` with phase "load" — these three not yet loaded
             (BEH-BR-247) — "idling" for a loaded one `stopping` with
             `next: "dormant"` because of an idle return (BEH-BR-252), from
             the revision in which the stop begins, and "refused" for one
             `disabled` with reason "refused-digest" (28 — Plugin Principal
             and Mandatory Policy, BEH-BR-267). A registration `disabled`
             by an operator MUST NOT be reported (CCR-BR-029). Entries MUST be ordered by realm, then plugin id, then
             contribution id, in code-unit order. `role` and `target` MUST
             be those of the manifest entry, `target` being the object of
             the manifest kept by BEH-BR-241, unchanged.
```

```
REQUIREMENT: `declaredContributions` MUST be a read: it MUST NOT call
             `load`, apply a trigger, write a record, consult the gate or
             emit a host event, and it MUST NOT be attributed. Like
             `inspect`, which already returns each manifest (BEH-BR-249), it
             MUST NOT consult the `AccessPolicy`.
```

```
REQUIREMENT: `Host.link` MUST be a `HostLink` whose two members are the
             host's `declaredContributions` and `wake`. The host MUST set
             `HostLink.reference` to `Some(link)` in every fiber in which it
             runs plugin or callback code, and in every fiber such a fiber
             forks — among them builds and `load`, finalizers, background
             and `whenAvailable` fibers, health checks, handoff steps, bus
             listeners, hooks (which inherit the dispatcher's
             fiber context, 31 — Hook Points, BEH-BR-306), and the callbacks
             of `Host.use`, `useAll` and `lease`. `Host.link.hostId` MUST be
             the host's `hostId`. `HostLink.none` MUST have no `hostId`,
             return an empty list and a `WakeReport` with nothing
             triggered, and touch no host.
```

```
REQUIREMENT: Documentation MUST state that `HostLink.reference` may be
             provided by any code, and that the link a dispatch reads
             selects which declarations it sees: in-process code can provide
             `HostLink.none` or a link of its own that reports nothing, and
             a hook point cannot tell such a link from the host's. A link
             grants no more than a read of declarations (data `inspect`
             already returns) and `wake` (which any holder of the `Host` may
             call, and which records the caller's real principal,
             BEH-BR-253, not one taken from the link); the hook point
             records which link answered (31 — Hook Points, BEH-BR-305,
             BEH-BR-309) and treats `HostLink.none` as no link on a point
             with veto codes unless the point opts in with `allowNoLink`.
             It MUST also state that declarations are
             matched to a registry by name, so hook point ids SHOULD be
             unique within a host.
```

A hook point is a helper outside the host and made before it (it is usually
passed to `Bridger.make` as a base service), so it cannot hold the host. The
link reaches it the way `HeldPlugins` does: through the fiber of whoever
dispatches. Plugin code — the usual dispatcher — always has one; application
code at the edge provides `host.link`; a unit test of a hook point with no
host provides `HostLink.none` and says so in its code.

**Settled here.** (1) Registrations not yet loaded are reported, and two
loaded or never-loaded states in which the host, not an operator, has taken
the plugin out of the decision. A loaded plugin has otherwise already
registered what it registers, or has failed to; its manifest is no longer
the best account of what it contributes. An idle return hides the plugin's
contributions as soon as its stop begins (19, BEH-BR-167), while it is still
loaded, so without "idling" a veto would be neither in the view nor declared
for up to a registry's `drainTimeout` — a routine, unrecorded fail-open
(CCR-BR-029, agent review R1-03). A registration the `RefusalList` disabled
runs no code — it was never loaded, or its code was stopped by a refused
start or background restart (28, BEH-BR-267; CCR-BR-035) — and has no
contributions in force; leaving it out would turn the revocation of a veto's owner into
an open decision with no trace, so it is reported "refused" and the point's
`onError` decides (R1-04). (2) A registration `disabled` by an operator is
left out: disabling is an operator's decision that the plugin take no part,
as it is for an eager plugin; the trail records that decision. (3) The link
is not the principal and carries no identity, unlike `CurrentPlugin`
([28 — Plugin Principal and Mandatory Policy](./28-plugin-principal-and-mandatory-policy.md), BEH-BR-257).
It is not harmless either: whoever provides the link chooses what the
dispatch sees. Core records the link's `hostId` and refuses `HostLink.none`
on veto points; a forged link remains possible for in-process code and is a
residual of RSK-BR-057 (R1-06).

## BEH-BR-251: An OnEvent wake holds its triggering event for the plugin it woke

> **Invariant:** [INV-BR-047](../invariants.md#inv-br-047-a-held-triggering-event-is-delivered-at-most-once-only-to-the-plugin-it-woke), [INV-BR-032](../invariants.md#inv-br-032-a-dormant-plugin-has-run-none-of-its-code)
> **See:** [ADR-BR-050](../decisions/050-dormant-veto-and-hook-phases.md), [ADR-BR-042](../decisions/042-lazy-activation.md), [ADR-BR-020](../decisions/020-typed-event-bus.md)
> **Satisfies:** [URS-BR-050](../urs.md#urs-br-050-let-a-plugin-started-by-an-event-receive-that-event), [URS-BR-031](../urs.md#urs-br-031-start-a-plugin-only-when-it-is-needed)
> **Risk:** [RSK-BR-058](../gxp/03-risk-assessment.md#rsk-br-058)

```ts
// illustrative — not type-checked
type HeldEventDropReason =
  | "no-listener"          // the plugin became active with no `on` listener for the event
  | "activation-failed"    // its load, build or activation failed
  | "ended"                // removed, replaced, disabled, returned to dormant, or the host closed, before it became active,
                           // or the build a stop waited for succeeded and was discarded (CCR-BR-030)
  | "timeout"              // holdTimeout elapsed before it became active
```

```
REQUIREMENT: When a dispatch on `Bridger.Events` applies an `OnEvent` trigger
             that moves a plugin out of `dormant` (BEH-BR-245), the host
             MUST hold that event for that plugin: the event's id, its
             arguments as given, and the dispatch's operation-context
             annotations filtered to flow "events" (30 — Operation Context
             Annotations, BEH-BR-292). It MUST hold at most one event per
             trigger application, and none for a trigger that reaches a
             plugin no longer `dormant`, for an `OnEvent` named by `wake`,
             or for any other event dispatched while the plugin starts.
```

```
REQUIREMENT: When the activation the trigger started reaches `active`, after
             the revision in which it is published, the bus MUST deliver the
             held event exactly once, with the semantics of `emit`
             (16 — Event Bus, BEH-BR-141), to the `on` listeners for that
             event id that the plugin registered in that activation's scope
             before it became `active`, in listener order, and to no other
             listener; `around` listeners MUST NOT receive it. Each
             listener MUST run as BEH-BR-144 states, with the held
             annotations, an empty `HeldPlugins`, no `CurrentTransition`
             and the listener owner's principal; a failure MUST be reported
             as `listener-failed`.
             No new access decision is made for the emitter: the dispatch
             was allowed when it applied the trigger (16, BEH-BR-141).
```

```
REQUIREMENT: When the plugin becomes `active` with no such listener, or when
             it does not become `active` because its activation fails, it
             leaves the path to `active` (removed, replaced, disabled,
             returned to `dormant`, or the host closes), or `holdTimeout`
             (default 60 seconds, measured with `Clock` from the trigger)
             elapses first, the host MUST drop the held event, log the drop
             at warning level with the plugin id and event id, and emit
             `held-event-dropped { event, reason }` on `Host.events`
             (13 — Observability and Diagnostics). The held value MUST be
             released at delivery or drop.
```

```
REQUIREMENT: A `remove`, `replace` or `disable` that reaches the plugin while
             its load or build is running follows the `starting` rows of
             08 — Operation Legality (BEH-BR-071, BEH-BR-246) and waits for
             that activation. If the activation then fails, the reason MUST
             be "activation-failed". If its load and build succeed, their
             result is discarded (BEH-BR-071) and nothing is published, so
             the held event MUST be dropped once with reason "ended" when
             the result is discarded, and no listener of that activation
             receives it. "ended" MUST otherwise apply only when the
             registration leaves the path to `active` while no load or
             build of it is running — removed, replaced or disabled while
             `waiting`, returned to `dormant`, or the host closing
             (CCR-BR-029, host-core prototype finding G-P14; CCR-BR-030,
             finding G-P19).
```

```
REQUIREMENT: A held event's arguments and annotations MUST NOT appear in any
             audit record, host event, log, span, snapshot, inspection or
             error; only the event id and the drop reason may. The
             triggering dispatch MUST NOT be delayed and its result MUST NOT
             change: the delivery is a separate notification, never a
             re-run of a `parallel`, `serial` or `waterfall` dispatch.
```

A lazy consumer of an event exists to handle that event, and before revision
0.3 it never saw the first one: the dispatch that woke it ended before it had
a listener. Holding exactly the triggering event, for exactly the plugin it
woke, until that plugin is ready, fixes that case without turning the bus
into a queue. Delivery waits for `active` so that the listener's plugin has
published its services and every listener it registers in its build is in
place.

**Settled here.** (1) Only the triggering event is held. An event dispatched
while the plugin is loading reaches whatever listeners exist at that moment,
as for any plugin, and is lost to the plugin if it has none yet; the
event delivery companion ([`references/durable-bus/`](../../durable-bus/README.md))
is for consumers that must see every event. (2) The delivery uses `emit`
semantics whatever the triggering dispatch was: the dispatcher of a
`parallel`, `serial` or `waterfall` has already received its result, so
there is nobody to return a listener's result to. (3) The hold is bounded in
space (one event per wake) and in time (`holdTimeout`, a property of the lazy
definition, so the plugin's author can size it to its load). A held value
lives in memory only and is lost if the process ends.

## BEH-BR-252: An idle loaded plugin returns to dormant through a normal drain

> **Invariant:** [INV-BR-032](../invariants.md#inv-br-032-a-dormant-plugin-has-run-none-of-its-code), [INV-BR-006](../invariants.md#inv-br-006-a-leased-provider-does-not-close-under-its-lease), [INV-BR-001](../invariants.md#inv-br-001-one-provider-per-service-key-per-realm)
> **See:** [ADR-BR-050](../decisions/050-dormant-veto-and-hook-phases.md), [ADR-BR-042](../decisions/042-lazy-activation.md), [ADR-BR-015](../decisions/015-leases-one-primitive.md)
> **Satisfies:** [URS-BR-031](../urs.md#urs-br-031-start-a-plugin-only-when-it-is-needed)
> **Risk:** [RSK-BR-058](../gxp/03-risk-assessment.md#rsk-br-058), [RSK-BR-026](../gxp/03-risk-assessment.md#rsk-br-026)

```ts
// illustrative — not type-checked
const reports = Plugin.lazy({ manifest, load, digest, idle: "15 minutes" })
```

```
REQUIREMENT: `idle`, when given, MUST be a positive finite duration;
             otherwise `install`, `replace` and `reconcile` MUST fail the
             definition with `InvalidDefinition`. Without `idle`, a loaded
             registration MUST NOT return to `dormant` except by `replace`
             with a lazy definition.
```

```
REQUIREMENT: A loaded, `active` registration of a lazy definition with
             `idle` is *idle* while all of the following hold: no lease and
             no `use` or `useAll` callback holds a key it provides; no
             listener of it on `Bridger.Events` is running (16 — Event Bus);
             it has no mounted child (14 — Children and Groups); and no
             registration that is neither `dormant` nor `disabled` has, in
             `requires`, a key whose provider under `scopeOf` is this
             plugin. Holds of its contributions in a registry, and hook
             calls on them, MUST NOT be conditions: registries and hook
             points are helpers outside the host, and `ActivePlugin`
             reports contributions added and withdrawn, not holds (19 —
             Contribution Registry, BEH-BR-168). Documentation MUST state
             that an idle return can therefore withdraw a contribution a
             registry `use` or a hook dispatch holds; the hold drains under
             the registry's `drainTimeout` and is then revoked (BEH-BR-167),
             as for any stop (CCR-BR-029, host-core prototype finding
             G-P17). Idle time MUST be measured with `Clock` from the latest
             moment one of these conditions stopped holding, or from the
             revision in which the plugin became `active`.
```

```
REQUIREMENT: When a registration has been idle for `idle`, the host MUST
             take an *idle return* at the plugin's linearization point,
             after any operation already linearized there, and only if the
             plugin is still `active` and idle at that point: a system
             transition `active → stopping` with `next: "dormant"`, carried
             out as a system stop (06 — Removal): its providers are hidden
             at once, its contributions and listeners are removed under
             their registries' `drainTimeout`, its finalizers run, and its
             principal is retired (28, BEH-BR-257). It MUST NOT be forced
             beyond what a system stop forces, and MUST NOT be gated.
```

```
REQUIREMENT: When the stop completes, the plugin MUST be `dormant`: its
             loaded definition released, `lazy.loaded` false, its provider
             slots still reserved (they MUST NOT be released at any point of
             the idle return), its stored configuration override kept raw,
             and its `triggers` listed as BEH-BR-244 states. The next
             activation MUST run `load` again (BEH-BR-246) under a new
             principal.
```

```
REQUIREMENT: A trigger that applies while the plugin is `stopping` with
             `next: "dormant"` because of an idle return MUST be kept and
             applied once the plugin reaches `dormant`, with its event held
             if it is an `OnEvent` trigger from a dispatch (BEH-BR-251). Such
             a trigger MUST NOT be listed in the `WakeReport.triggered` of
             the `wake` that applied it, since the plugin has not left
             `dormant` when that `wake` returns (BEH-BR-245), and the later
             application lists it in no `WakeReport`. Documentation MUST say
             that an empty `triggered` list does not mean that no start
             will follow while an idle return is under way (CCR-BR-030,
             host-core prototype finding G-P22). An
             operator operation that reaches the plugin during the idle
             return MUST follow the `stopping` row of 08 — Operation
             Legality (BEH-BR-071): it waits for the idle return to settle
             and is then decided against `dormant`, as BEH-BR-073 states
             for every system stop.
```

```
REQUIREMENT: With a sink wired, an idle return MUST write one `system`
             record with operation `lazy-idle`, attributed to
             `Actor.system`, `before.state` "active", `after.state`
             "dormant", as a root, without `onBehalfOf`, when the plugin
             reaches `dormant`; it MUST NOT also write a `system-stop`
             record. `Host.events` MUST emit `plugin-idled` in that
             revision.
```

```
REQUIREMENT: When the cleanup of an idle return fails, the plugin MUST end
             `failed` with phase "cleanup", as any stop whose cleanup fails
             (06 — Removal, BEH-BR-046): it MUST NOT reach `dormant`, MUST NOT emit `plugin-idled`, and
             with a sink wired MUST write, as a root, the `system-stop`
             record of that settled stop (`after.state` "failed") in place
             of `lazy-idle` (23 — Audit Sink and Record, BEH-BR-199). A
             trigger kept during the idle return MUST then be dropped, and
             its held event, if any, dropped with reason "ended"
             (BEH-BR-251).
```

An idle return is the reverse of a trigger: a plugin nothing needs any more
gives back its scope, fibers and listeners, and the next need loads it
again. The conditions are chosen so that the return disturbs no one the
host can see: no dependent would cascade to `waiting`, no call through a
lease or `use` callback and no listener run is in progress. A contribution
held in a registry is outside the host's sight and drains as on any stop. A plugin reached only through `Host.use` by application code has no
dependent to keep it awake and will idle out; its caller must `wake` it, as
for any lazy provider (BEH-BR-245). Because the stop removes its hook
contributions and listeners, a hook dispatch finds its declaration — as
"idling" while the stop runs, "dormant" after it (BEH-BR-250; 31 — Hook
Points, BEH-BR-309) and a later event wakes it with the
event held (BEH-BR-251).

**Settled here.** (1) The loaded definition is released and the next
activation loads again. Keeping it would make a `dormant` registration that
already ran code look like one that never did; reloading gives the loader
companion a fresh check at every wake, so a digest revoked meanwhile is
refused at load. Neither choice reclaims imported code from the process
(BEH-BR-008). (2) `idle` is not part of a lazy definition's identity
(BEH-BR-248): two definitions with equal `meta` and different `idle` are the
same to `reconcile`, and changing `idle` takes a `replace`. (3) The return
is a system transition, not gated: the gated decision was the `install` or
`replace` of a definition with `idle`, as for `lazy-triggered`. It is
recorded as `lazy-idle`, not as a `system-stop`, so that a trail reader can
tell an idle return from a stop caused by a provider leaving. (4) Whether a
lazy plugin is loaded is history, not state the installed set determines: a
history that woke it ends with it `active`, a direct install of the same set
with it `dormant`. Confluence compares the two under the map of
[18 — Reconciliation and Confluence](./18-reconciliation-and-confluence.md),
BEH-BR-160 (CCR-BR-028, host-core prototype finding G-P7).

## BEH-BR-253: A wake records on whose behalf it was made

> **Invariant:** [INV-BR-035](../invariants.md#inv-br-035-only-the-host-mints-a-plugin-principal)
> **See:** [ADR-BR-050](../decisions/050-dormant-veto-and-hook-phases.md), [ADR-BR-043](../decisions/043-plugin-principal-and-mandatory-policy.md), [ADR-BR-029](../decisions/029-attributable-mutations.md)
> **Satisfies:** [URS-BR-032](../urs.md#urs-br-032-know-which-plugin-made-a-change-and-for-whom), [URS-BR-031](../urs.md#urs-br-031-start-a-plugin-only-when-it-is-needed)
> **Risk:** [RSK-BR-028](../gxp/03-risk-assessment.md#rsk-br-028)
> **Regulatory:** supports 21 CFR 11.10(e); ALCOA+ Attributable

```
REQUIREMENT: `wake`, and a dispatch on `Bridger.Events` that applies an
             `OnEvent` trigger, MUST read the principal of the calling fiber
             as a mutating host call does at step 2 of BEH-BR-188 (28 —
             Plugin Principal and Mandatory Policy, BEH-BR-257): a forged
             principal MUST make the call die with `PrincipalForged`, and a
             retired one MUST make it die with `PrincipalRetired`.
```

```
REQUIREMENT: The `lazy-triggered` record of each plugin that a `wake` or such
             a dispatch moves out of `dormant` — a root record (BEH-BR-248) —
             MUST carry `onBehalfOf` naming that principal, with the fields
             of BEH-BR-259, and MUST carry none when the caller has no
             principal. A `lazy-triggered` record that has a cause (an
             install, replace or enable of a dependent, or a dependent's own
             `lazy-triggered` record) MUST NOT carry `onBehalfOf`.
```

```
REQUIREMENT: The record MUST stay attributed to `Actor.system`;
             `onBehalfOf` MUST NOT count as an actor, MUST NOT be settable
             through `wake`'s options, and MUST NOT appear in
             `plugin-triggered`, logs, spans or metrics (BEH-BR-259).
             `WakeReport` MUST NOT change.
```

Core 28 states that system records carry no `onBehalfOf` (BEH-BR-259),
because a system transition is a consequence and its cause record names
the call. A root `lazy-triggered` record has no cause record: before this
revision, a wake by a command catalog, a hook point (31 — Hook Points,
BEH-BR-309) or an emitting plugin was recorded as the system's, with nobody
named (URS gap G39). Recording the caller's principal on exactly those
records names the plugin that asked, without pretending it was an actor.

**Settled here.** (1) This is the one exception to the rule of BEH-BR-259
that system records carry no `onBehalfOf`; 28 is amended to say so
(CCR-BR-024). (2) Records with a cause do not repeat the principal: the call
record they lead to already carries it, and carrying it twice would let the
two disagree. (3) `wake` stays ungated and not attributed (22 — Attributable
Operations): the principal is recorded, not authorised.

---

_Previous: [26 — Versioned Contracts](./26-versioned-contracts.md)_ · _Next: [28 — Plugin Principal and Mandatory Policy](./28-plugin-principal-and-mandatory-policy.md)_
