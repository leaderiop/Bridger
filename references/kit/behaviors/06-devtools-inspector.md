# 06 — Devtools Inspector

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-KT-BEH-06                                            |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.1 (2026-11-08): Initial draft (CCR-KT-001)                 |

---

Core answers questions one plugin at a time: `snapshot` gives every plugin's
state and `missingServiceIds`, `inspect(ref)` gives one plugin's owned
resources as names and counts, `events` gives a bounded diagnostic feed
([04](../../core/behaviors/04-states-and-snapshots.md),
[13](../../core/behaviors/13-observability-and-diagnostics.md)). A developer
asks host-wide questions: what depends on what, why is this plugin waiting,
who holds leases, what happened in the last minute. The inspector computes
those answers from core's observation API and nothing else, and it changes
nothing ([ADR-KT-005](../decisions/005-devtools-are-read-only.md)). This file
owns BEH-KT-041–048 and uses BEH-KT-041–046; 047 and 048 are reserved.

Planned source: `packages/kit/src/devtools/*.ts` *(Planned)*.

## BEH-KT-041: The inspector is a plugin over core observation only

> **Invariant:** [INV-KT-003](../invariants.md#inv-kt-003-tooling-output-carries-names-and-counts-never-values)
> **See:** [ADR-KT-005](../decisions/005-devtools-are-read-only.md)
> **Core seam:** [13 — Observability](../../core/behaviors/13-observability-and-diagnostics.md) (BEH-BR-113, BEH-BR-118)

```ts
// illustrative — not type-checked
class Inspector extends Context.Service<Inspector, {
  readonly report: Effect.Effect<InspectorReport, HostClosed>
  readonly why: (ref: PluginRef) => Effect.Effect<WhyReport, UnknownPlugin | HostClosed>
  readonly timeline: Stream.Stream<TimelineEntry>
}>()("@bridger/kit/Inspector") {}

Devtools.plugin(options?: { readonly timelineSize?: number }): Plugin<readonly [], readonly [typeof Inspector], never, void>
```

```
REQUIREMENT: The inspector MUST read the host only through `snapshot`,
             `changes`, `events`, `inspect` and `controls`. It MUST NOT call
             a mutating operation, and its service MUST expose no operation
             that changes the host.
```

```
REQUIREMENT: The inspector MUST NOT be installed by default by any kit
             template other than `dev`. Exposing it outside the process is
             the application's decision; the kit ships no network endpoint
             for it.
```

## BEH-KT-042: The dependency graph is consistent with one snapshot revision

> **See:** [ADR-KT-005](../decisions/005-devtools-are-read-only.md)
> **Core seam:** [04 — States and snapshots](../../core/behaviors/04-states-and-snapshots.md) (BEH-BR-028, BEH-BR-029)

```ts
// illustrative — not type-checked
interface InspectorReport {
  readonly schemaVersion: 1
  readonly hostId: string
  readonly revision: number                      // HostSnapshot revision the report describes
  readonly consistent: boolean
  readonly plugins: readonly { readonly id: string; readonly realm: string; readonly state: PluginState
                               readonly leases: number; readonly parked: boolean; readonly pending?: string }[]
  readonly edges: readonly { readonly from: string; readonly to: string; readonly serviceId: string
                             readonly kind: "requires" | "optional"; readonly bound: boolean }[]   // from: dependent "id@realm", to: provider or "base" or "missing"
  readonly controls: HostControls
}
```

```
REQUIREMENT: `report` MUST read the snapshot, then `inspect` each plugin,
             then read the snapshot again. When the two revisions differ it
             MUST retry, at most three times, and then return the last
             attempt with `consistent: false`. A report with
             `consistent: true` MUST describe exactly one revision.
```

```
REQUIREMENT: An edge MUST be drawn from each plugin to the provider of each
             required and optional service identifier in its resolution
             scope, and to `"missing"` when no plugin or base service
             provides it.
```

Core snapshots are atomic per revision (BEH-BR-029) but `inspect` is per
plugin; re-reading the revision is the cheapest way to know whether the
graph was assembled from one state.

## BEH-KT-043: why explains a waiting plugin as a chain

> **See:** [ADR-KT-005](../decisions/005-devtools-are-read-only.md)
> **Core seam:** [04 — States and snapshots](../../core/behaviors/04-states-and-snapshots.md) (BEH-BR-032), [13 — Observability](../../core/behaviors/13-observability-and-diagnostics.md) (BEH-BR-120)

```ts
// illustrative — not type-checked
type WhyStep =
  | { readonly kind: "no-provider"; readonly serviceId: string; readonly realm: string }
  | { readonly kind: "provider-waiting"; readonly serviceId: string; readonly provider: string }     // continues with the provider's chain
  | { readonly kind: "provider-failed"; readonly serviceId: string; readonly provider: string; readonly phase: string; readonly message: string }
  | { readonly kind: "provider-disabled"; readonly serviceId: string; readonly provider: string }
  | { readonly kind: "provider-starting"; readonly serviceId: string; readonly provider: string }
  | { readonly kind: "stop-parked"; readonly provider: string; readonly leases: number }
interface WhyReport { readonly ref: string; readonly state: PluginState; readonly since?: string; readonly chain: readonly WhyStep[] }
```

```
REQUIREMENT: For a `waiting` plugin, `why` MUST produce one step per
             missing service identifier, in the order of
             `missingServiceIds`, and MUST follow a `provider-waiting` step
             into that provider's own missing services, depth first, visiting
             each plugin at most once.
```

```
REQUIREMENT: For a plugin in any other state, `why` MUST return an empty
             chain and the state. The `message` of a `provider-failed` step
             MUST be the failure message core already exposes in the
             snapshot, never a cause.
```

This is the question the gap report singles out ("why a plugin is waiting").
Core gives the first hop (`missingServiceIds`) and the stall event; the chain
is the inspector's.

## BEH-KT-044: Leases are counts per plugin, never holders

> **Invariant:** [INV-KT-003](../invariants.md#inv-kt-003-tooling-output-carries-names-and-counts-never-values)
> **Core seam:** [13 — Observability](../../core/behaviors/13-observability-and-diagnostics.md) (BEH-BR-118)

```
REQUIREMENT: The inspector MUST report leases as the count `inspect` returns
             for each plugin, and parked stops with their lease count. It
             MUST NOT attempt to identify the fibers or callers holding a
             lease.
```

## BEH-KT-045: The timeline is the event feed, with gaps shown

> **See:** [ADR-KT-005](../decisions/005-devtools-are-read-only.md)
> **Core seam:** [13 — Observability](../../core/behaviors/13-observability-and-diagnostics.md) (BEH-BR-114, BEH-BR-115)

```ts
// illustrative — not type-checked
type TimelineEntry = { readonly kind: "event"; readonly event: HostEvent } | { readonly kind: "gap"; readonly fromSeq: number; readonly toSeq: number }
```

```
REQUIREMENT: The timeline MUST keep the last `timelineSize` (default 500)
             host events in `seq` order and MUST insert a `gap` entry where
             `seq` jumps. Every rendering of the timeline MUST carry the
             label "diagnostic feed — not an audit trail".
```

## BEH-KT-046: The JSON report is versioned and stable

> **See:** [ADR-KT-005](../decisions/005-devtools-are-read-only.md)

```
REQUIREMENT: `InspectorReport` MUST be defined by an Effect `Schema` with
             `schemaVersion`; `bridger inspect --json` MUST print its JSON
             encoding with keys in schema order and plugins sorted by
             (realm, id). A field may be added in a minor kit release;
             removing or changing one MUST increment `schemaVersion`.
```

---

_Previous: [05 — Promise SDK](./05-promise-sdk.md)_ · _Next: [07 — Error catalog](./07-error-catalog.md)_
