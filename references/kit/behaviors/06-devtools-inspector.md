# 06 — Devtools Inspector

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-KT-BEH-06                                            |
> | Revision       | 0.3                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.3 (2026-11-08): BEH-KT-047 `--profile` and `--verifier` pass profiles and offline receipt verifiers from the inspector's machine; exit code 4 when nothing inconsistent was found but the check is incomplete (carried roots, unchecked receipts, unconfirmed heads, unknown profiles) (round-2 agent review R3-10, R3-11) (CCR-KT-003)<br>0.2 (2026-11-08): BEH-KT-047 `bridger verify-chain` over the audit chain's `verifyBundle`; inspector renders "refused-digest", `plugin-idled`, `held-event-dropped`, `reconcile-partial` and breaker scope (round 2: recheck item 14; core alignment) (CCR-KT-003)<br>0.1 (2026-11-08): Initial draft (CCR-KT-001)                 |

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
owns BEH-KT-041–048 and uses BEH-KT-041–047; 048 is reserved.

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

```
REQUIREMENT: The inspector MUST render the states and events core added in
             CCR-BR-024–026 by name: a `disabled` plugin with reason
             "refused-digest" (core BEH-BR-027, BEH-BR-267) is shown as
             refused by the refusal list, not as disabled by an operator;
             `plugin-idled` (core BEH-BR-252), `held-event-dropped` (core
             BEH-BR-251) and `reconcile-partial` with its `notUndone`
             entries (core BEH-BR-324) appear in the timeline as such; a
             hook breaker shows its `scope` (core BEH-BR-310). An event or
             state it does not know MUST be shown with its raw tag, never
             dropped.
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

## BEH-KT-047: verify-chain checks a verification bundle offline and prints what was checked

> **Invariant:** [INV-KT-003](../invariants.md#inv-kt-003-tooling-output-carries-names-and-counts-never-values)
> **See:** [ADR-KT-005](../decisions/005-devtools-are-read-only.md)
> **Core seam:** [references/audit-chain/](../../audit-chain/behaviors/05-verification-bundle.md) (AC; BEH-AC-033, BEH-AC-034, BEH-AC-038)

```text
$ bridger verify-chain trail-2026-q3.bundle.json --trust-roots inspector-roots.json \
    --verifier ./verifiers/rfc3161.js --profile release-log=./profiles/release-log.js
bundle    bridger-chain-bundle/v1  digest matches
roots     pinned (2 fingerprints)
loaded    verifier ./verifiers/rfc3161.js (sha256:5d…07); profile release-log ./profiles/release-log.js (sha256:a2…9c)
series    host-7f…  seq 1–48210  links recomputed through 48210, no break
series    release-log  seq 1–212  links recomputed through 212, no break
receipts  12 confirmed offline, 1 not checked (needs-online-check)
heads     none given by you; 1 stated by the bundle (unconfirmed)
dropped   auditDropped 0 → 3 at seq 31877 (notice)
no overall verdict is given; read each line
exit 4: nothing checked was found inconsistent; the check is incomplete (1 receipt not checked, 1 head unconfirmed)
```

```
REQUIREMENT: `verify-chain` MUST read the bundle file, decode it as JSON and
             call the audit-chain companion's `verifyBundle` (BEH-AC-034)
             with no network, clock or file access beyond reading the
             bundle, the `--trust-roots` file, whose roots MUST be passed
             as `pinnedTrustRoots` (BEH-AC-035), and the modules named by
             `--verifier` and `--profile`. It MUST NOT verify anything
             itself and MUST NOT contact an anchor service.
```

```
REQUIREMENT: `--verifier <module>` (repeatable) MUST load an
             `OfflineReceiptVerifier` (BEH-AC-036) from a module on the
             inspector's machine and pass it in `receiptVerifiers`;
             `--profile <name>=<module>` (repeatable) MUST load a
             `ChainProfile` and pass it in `profiles` under that name
             (BEH-AC-031, BEH-AC-034). The output MUST list every loaded
             module by path and SHA-256 digest of its file. A module MUST
             NOT be read from the bundle or from a location the bundle
             names. Without these options, documentation MUST state that
             only series with the "audit" profile are verified and that no
             receipt can be "confirmed offline", because the kit's main
             entry point ships no verifier that confirms one.
```

```
REQUIREMENT: Expected heads MUST be passed from `--expect-head
             <seriesId>=<seq>[:<hash>]` (repeatable) as
             `options.expectedHeads`; heads carried in the bundle MUST be
             printed as "stated by the bundle (unconfirmed)" (BEH-AC-034).
```

```
REQUIREMENT: The output MUST render the `BundleReport` under the wording
             rules of the audit-chain companion (BEH-AC-022, BEH-AC-038):
             counts and positions, which trust roots were used (pinned or
             carried, by fingerprint), each receipt as "confirmed offline",
             "not checked" with its reason, or "failed", and no overall
             pass or fail. With `--json` it MUST print exactly the report's
             JSON encoding. It MUST NOT print record contents.
```

```
REQUIREMENT: Exit codes: 1 when the report has a break, a failed receipt,
             an anchor mismatch, a bundle digest mismatch or a malformed
             entry; otherwise 4 when the check is incomplete — trust roots
             carried by the bundle (no `--trust-roots`), any receipt "not
             checked", any head "head-unconfirmed" or not given, or any
             series not verified ("unknown-profile"); otherwise 0; 2 for a
             usage error; 3 when the bundle, the trust-root file or a module
             cannot be read or loaded. Documentation MUST state that exit
             code 0 means "nothing checked was found inconsistent, and every
             check the report offers was made with pinned roots", not that
             the trail is complete or unaltered, and that scripts which
             treat 4 as success accept a check the producer could have
             satisfied alone.
```

An inspector checks a trail on a machine that never talks to the producer's
systems; the tool's only job is to run the companion's pure check and say,
line by line, what it covered.

---

_Previous: [05 — Promise SDK](./05-promise-sdk.md)_ · _Next: [07 — Error catalog](./07-error-catalog.md)_
