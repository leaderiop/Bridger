# 04 — States and Snapshots

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-BEH-04                                               |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.1 (2026-10-02): Initial draft (CCR-BR-001)                 |

---

This file specifies the plugin state machine and the values through which it
is observed: the six `PluginState`s and their permitted transitions, the
discriminated-union `PluginSnapshot`, `HostSnapshot`, its revision, the
`changes` feed and `snapshot()`, the stickiness of `failed`, and the rule that
`missingServiceIds` is kept current. It converts the SPEC.md section "State
and lifecycle" (its state table, diagram and implicit rules, but not the
numbered activation and removal rules, which [05 — Activation](./05-activation.md)
and [06 — Removal](./06-removal.md) convert), and the `HostSnapshot`,
`changes` and `ServiceId` paragraphs of "Host interface". This file owns
BEH-BR-025–032 and uses all eight.

## BEH-BR-025: A registered plugin is in exactly one of six states

> **See:** [ADR-BR-005](../decisions/005-failure-is-sticky.md)
> **Satisfies:** [URS-BR-004](../urs.md#urs-br-004-know-why-a-plugin-is-not-running)

```ts
// illustrative — not type-checked
type PluginState = "waiting" | "starting" | "active" | "stopping" | "failed" | "disabled"
```

| State | Meaning |
| --- | --- |
| `waiting` | At least one required service has no active provider in the plugin's resolution scope. |
| `starting` | Every required service is available; the plugin is queued for a build slot or its `build` is running. |
| `active` | The build succeeded and every provided service is published. |
| `stopping` | The plugin accepts no new dependents or leases; its dependents, leases and activation scope are being closed. |
| `failed` | Activation, runtime or cleanup failed; the phase and a message are visible. It holds no live scope. |
| `disabled` | Registered with definition and configuration retained, deliberately not activated. It provides nothing and reserves no provider slot. |

```
REQUIREMENT: Every registered plugin MUST be in exactly one of the six
             states at every snapshot revision. A plugin that has been
             removed MUST have no state and no snapshot entry.
```

```
REQUIREMENT: Within this specification, "failed(cleanup)" denotes a plugin
             in `failed` whose `failure.phase` is "cleanup". It is not a
             seventh state; it is the one failure phase with different
             legality (08 — Operation Legality).
```

The machine is the same as Cordis's fiber states, with `disabled` added and
with removal ending in no state rather than a `DISPOSED` marker: a removed
plugin's ID is free to be installed again, and keeping a tombstone would make
that a special case.

**Settled here.** SPEC.md defined `starting` as "the plugin's `build` effect
is running". A plugin whose requirements are available but which is queued
behind the `concurrency` limit fitted no state: it is not `waiting` (nothing is
missing, and the settled `PluginSnapshot` requires a `waiting` entry to name
at least one missing service) and its build is not yet running. `starting` now
covers both queued and building. Idle detection is unaffected: a queued plugin
is ready, and a ready plugin already made the host non-idle
([05 — Activation](./05-activation.md)).

## BEH-BR-026: Only the listed transitions occur

> **Invariant:** [INV-BR-009](../invariants.md#inv-br-009-at-most-one-transition-in-flight-per-plugin)
> **See:** [ADR-BR-005](../decisions/005-failure-is-sticky.md), [ADR-BR-013](../decisions/013-total-operation-legality.md)

```mermaid
stateDiagram-v2
    [*] --> waiting: install, a requirement missing
    [*] --> starting: install, requirements available
    [*] --> disabled: install with disabled
    waiting --> starting: requirements available (also replace, reconfigure)
    waiting --> disabled: disable
    waiting --> [*]: remove
    starting --> active: build succeeds and is published
    starting --> failed: build or activation fails, or build times out
    starting --> stopping: target changes; the in-flight step settles first
    active --> stopping: dependency loss, remove, replace, restart, reconfigure, disable, runtime failure, shutdown
    stopping --> waiting: requirements missing
    stopping --> starting: requirements available (replace, restart, reconfigure, provider returned)
    stopping --> failed: cleanup fails, or runtime failure completes
    stopping --> disabled: disable completes
    stopping --> [*]: removal completes
    failed --> starting: retry, restart, replace or reconfigure, requirements available
    failed --> waiting: retry, restart, replace or reconfigure, requirements missing
    failed --> disabled: disable (not after a cleanup failure)
    failed --> [*]: remove
    disabled --> starting: enable, requirements available
    disabled --> waiting: enable, requirements missing
    disabled --> [*]: remove
```

```
REQUIREMENT: The host MUST NOT move a plugin between states except along a
             transition in the diagram above.
```

```
REQUIREMENT: A plugin in `failed` with phase "cleanup" MUST leave `failed`
             only by `remove`.
```

```
REQUIREMENT: A plugin that has entered `starting` MUST leave it only to
             `active`, `failed` or `stopping`. When it leaves for `stopping`
             before its build has begun, the stop MUST complete without
             running any finalizer, since none exists.
```

Which operation causes which transition, and what each operation does in each
state, is the business of the total table in
[08 — Operation Legality](./08-operation-legality.md); the diagram here is
the set of edges that table may use. Changes that keep the state —
`replace` of a `disabled` plugin, `reconfigure` of a `waiting` one, a health
check result — are not transitions, though they may change the snapshot.

**Settled here.** Three edges differ from SPEC.md's diagram. `[*] → starting`
and `disabled → starting` are added because a plugin with nothing missing
cannot be a `waiting` entry (BEH-BR-025); SPEC.md's prose already said
`enable` "moves the plugin to `waiting` or `starting`". `failed → disabled` is
withheld after a cleanup failure, because settled legality allows only
`remove` there (BEH-BR-030).

## BEH-BR-027: PluginSnapshot is a discriminated union on state

> **See:** [ADR-BR-014](../decisions/014-discriminated-plugin-snapshot.md)
> **Satisfies:** [URS-BR-004](../urs.md#urs-br-004-know-why-a-plugin-is-not-running), [URS-BR-028](../urs.md#urs-br-028-know-which-plugin-version-was-active-at-any-time)

```ts
// illustrative — not type-checked
type PluginSnapshot = PluginCommon & (
  | { readonly state: "waiting";  readonly missingServiceIds: readonly [ServiceId, ...ServiceId[]] }
  | { readonly state: "starting"; readonly providerIds: readonly string[] }
  | { readonly state: "active";   readonly providerIds: readonly string[]; readonly health: "healthy" | "degraded" | "unknown" }
  | { readonly state: "stopping"; readonly reason: StopReason; readonly next: "waiting" | "starting" | "disabled" | "gone" | "failed" }
  | { readonly state: "failed";   readonly failure: { readonly phase: "build" | "activation" | "runtime" | "cleanup"; readonly message: string }; readonly missingServiceIds: readonly ServiceId[] }
  | { readonly state: "disabled" }
)
interface PluginCommon {
  readonly id: string
  readonly realm: string
  readonly parentId?: string
  readonly meta?: { readonly version?: string; readonly digest?: string; readonly description?: string }
}
type StopReason = "dependency-loss" | "remove" | "replace" | "restart" | "reconfigure" | "disable" | "runtime-failure" | "shutdown"
```

```
REQUIREMENT: Every entry of `HostSnapshot.plugins` MUST be a
             `PluginSnapshot` of exactly this shape. A field MUST be present
             only on the variant that declares it.
```

```
REQUIREMENT: `realm` MUST be "default" unless the plugin was installed into
             another realm; `parentId` MUST be set exactly for child plugins
             (14 — Children and Groups); `meta` MUST carry the version,
             digest and description of the definition currently registered
             under the ID, and nothing else from it.
```

```
REQUIREMENT: `providerIds` MUST list, without duplicates and in the order of
             first appearance in `requires`, the provider of each required
             key — a plugin ID, or "base" for a base service — as captured
             for the activation, or, before the build has begun, as it would
             be captured now.
```

```
REQUIREMENT: `health` MUST be "unknown" when no check is declared or none
             has completed in this activation (10 — Runtime Failure and
             Health).
```

```
REQUIREMENT: On a `stopping` entry, `reason` MUST name what began the stop
             and `next` MUST name where the plugin will go when the stop
             completes ("gone" for removal). `next` MUST be updated in the
             same revision as any change to the stop's destination.
```

```
REQUIREMENT: `failure.message` MUST be a message only. It MUST NOT contain
             configuration values, key objects, fibers or a raw `Cause`; full
             causes stay in the core's diagnostics.
```

**Why a union.** SPEC.md gave every entry one flat shape — `state`,
`missingServiceIds`, `providerIds`, optional `health` and optional `failure`
side by side. That shape can represent states that cannot occur: an `active`
plugin with a `failure`, a `waiting` plugin with an empty `missingServiceIds`
(waiting for nothing), a `failed` plugin with a `health`, a `disabled` plugin
with providers. Each impossible combination is a branch every consumer — the
React and FoldKit adapters, an admin screen, an operator script — must either
handle or silently get wrong. The union makes them unrepresentable: TypeScript
narrows on `state`, and the fields that exist are the fields that mean
something in that state. Two pieces of information the flat shape could not
carry at all are added where they belong: a `stopping` entry says *why* and
*where to* (`reason`, `next`), so a screen can say "restarting" instead of
"stopping", and `meta.digest` is shown so that which build of a plugin was
registered at a given revision can be read from the record
([URS-BR-028](../urs.md#urs-br-028-know-which-plugin-version-was-active-at-any-time)).
A failure with phase "cleanup" stays distinguishable by its phase. The full
rationale and alternatives are in
[ADR-BR-014](../decisions/014-discriminated-plugin-snapshot.md).

## BEH-BR-028: HostSnapshot

> **Invariant:** [INV-BR-013](../invariants.md#inv-br-013-configuration-values-are-never-observable)
> **See:** [ADR-BR-007](../decisions/007-observation-primitives.md)
> **Satisfies:** [URS-BR-004](../urs.md#urs-br-004-know-why-a-plugin-is-not-running)
> **Risk:** [RSK-BR-008](../gxp/03-risk-assessment.md#rsk-br-008)

```ts
// illustrative — not type-checked
interface HostSnapshot {
  readonly hostId: string
  readonly revision: number                            // BEH-BR-029
  readonly plugins: readonly PluginSnapshot[]
  readonly availableServiceIds: readonly ServiceId[]   // the default realm's list; includes base services
  readonly realms: readonly {
    readonly id: string
    readonly isolatedServiceIds: readonly ServiceId[]
    readonly availableServiceIds: readonly ServiceId[]
  }[]
  readonly auditDegraded: boolean                      // the audit latch (23)
  readonly auditDropped: number                        // records dropped for writer-queue overflow (23, BEH-BR-202)
  readonly audit: "wired" | "unwired"                  // whether an AuditSink is wired (02, 23)
}
```

```
REQUIREMENT: `availableServiceIds` MUST list exactly the `ServiceId`s with
             an `active` provider in the default realm, including base
             services. Each entry of `realms` MUST list the realm's isolated
             keys and the `ServiceId`s available to a plugin installed in it
             (17 — Realms and Interception).
```

```
REQUIREMENT: A snapshot MUST hold identifiers, states, counts and messages
             only. It MUST NOT hold configuration values, key objects,
             service implementations, fibers or raw causes.
```

```
REQUIREMENT: `auditDegraded` MUST be true exactly while the audit latch of
             23 — Audit Sink and Record is set, and `audit` MUST report the
             wiring fixed at construction (BEH-BR-015).
```

Adapters answer "is this service available?" by mapping a key to `key.key` and
looking it up; they never need the key object from the host. Keeping causes
and values out of the snapshot is what lets the snapshot be logged, sent to a
browser or rendered on an admin screen without a redaction step anyone could
forget ([INV-BR-013](../invariants.md#inv-br-013-configuration-values-are-never-observable)).
`auditDegraded` is in the snapshot because an operator whose changes are being
refused must be able to see why without reading logs.

## BEH-BR-029: Snapshot revisions never regress

> **Invariant:** [INV-BR-008](../invariants.md#inv-br-008-snapshot-revisions-never-regress)
> **See:** [ADR-BR-007](../decisions/007-observation-primitives.md)

```
REQUIREMENT: State changes MUST be applied atomically in a single order per
             host. Each applied change MUST produce exactly one new snapshot
             whose `revision` is greater than every earlier revision of the
             same host.
```

```
REQUIREMENT: Any change to any field of the `HostSnapshot` MUST increase
             `revision`. Two snapshots of one host with equal revisions MUST
             be equal.
```

```
REQUIREMENT: A change that affects several plugins at once — a provider
             published together with its plugin becoming `active`, a
             `waiting` plugin's last missing service appearing — MUST be
             applied in one revision, so that no snapshot shows a partial
             change.
```

A revision is the host's single order of events. An adapter can drop any
snapshot whose revision is not greater than the last one it rendered, and two
observers comparing notes can tell which saw the later state. Without the
rule that equal revisions mean equal content, a revision could not be used as
a cache key or a version in a UI.

**Settled here.** SPEC.md said the revision "increases on every state change".
It increases on every change to any snapshot field — including
`missingServiceIds`, `health`, `next`, `meta`, the realms list and
`auditDegraded` — because a field that changes without a new revision would
be invisible to any consumer that compares revisions.

## BEH-BR-030: changes is a gap-free, latest-wins state feed; snapshot() reads the same value

> **Invariant:** [INV-BR-008](../invariants.md#inv-br-008-snapshot-revisions-never-regress)
> **See:** [ADR-BR-007](../decisions/007-observation-primitives.md)
> **Satisfies:** [URS-BR-004](../urs.md#urs-br-004-know-why-a-plugin-is-not-running)
> **Risk:** [RSK-BR-012](../gxp/03-risk-assessment.md#rsk-br-012)

```ts
// illustrative — not type-checked
snapshot(): Effect.Effect<HostSnapshot>
readonly changes: Stream.Stream<HostSnapshot>   // SubscriptionRef.changes over SubscriptionRef<HostSnapshot>
```

```
REQUIREMENT: `changes` MUST be `SubscriptionRef.changes` over the host's
             `SubscriptionRef<HostSnapshot>`. Each subscription MUST receive
             the current snapshot first and MUST register without a gap, so
             that no later revision can be missed between the first value
             and the subscription.
```

```
REQUIREMENT: A subscriber MUST never receive a snapshot with a lower
             revision after one with a higher revision. A slow subscriber
             MAY skip intermediate revisions and MUST then receive the
             latest.
```

```
REQUIREMENT: `changes` MUST end when the host closes. `snapshot()` MUST
             return the same value `changes` would deliver at that moment.
```

```
REQUIREMENT: Documentation MUST describe `changes` as a state feed, and
             MUST NOT describe it, or `Host.events`, as an audit log or
             audit trail.
```

This is the observation stream the React and FoldKit adapters consume. "Latest
wins" is the right contract for rendering — a UI that falls behind wants the
current state, not a backlog — and the wrong one for a record of what
happened, because a skipped revision is gone. A lossy feed mistaken for an
audit trail (RSK-BR-012) is exactly the failure the GxP hooks exist to
prevent; the lifecycle record is the `AuditSink` of
[23 — Audit Sink and Record](../behaviors/23-audit-sink-and-record.md), and
nothing else.

## BEH-BR-031: Failure is sticky

> **Invariant:** [INV-BR-007](../invariants.md#inv-br-007-failure-is-sticky)
> **See:** [ADR-BR-005](../decisions/005-failure-is-sticky.md)
> **Satisfies:** [URS-BR-006](../urs.md#urs-br-006-recover-from-failure-explicitly-and-never-silently)
> **Risk:** [RSK-BR-003](../gxp/03-risk-assessment.md#rsk-br-003), [RSK-BR-016](../gxp/03-risk-assessment.md#rsk-br-016)

```
REQUIREMENT: A `failed` plugin MUST hold no live activation scope and MUST
             publish nothing.
```

```
REQUIREMENT: A `failed` plugin MUST stay `failed` when its requirements
             disappear or return. It MUST leave `failed` only through an
             explicit operation — `retry`, `restart`, `replace`,
             `reconfigure`, `disable` or `remove` — for every failure phase,
             "runtime" included; with phase "cleanup", only `remove`.
```

```
REQUIREMENT: Dependency loss MUST change only `starting` and `active`
             plugins, each through `stopping`. It MUST NOT change the state
             of a `waiting`, `failed` or `disabled` plugin.
```

```
REQUIREMENT: The host MUST NOT retry a failed activation on its own, on any
             trigger.
```

Automatic retries on dependency changes hide repeated side effects of `build`
— a migration run twice, a message sent twice — and can loop. A failure that
stays put is a failure somebody sees and decides about. A plugin that merely
*lost a dependency* is different: it is `waiting`, not `failed`, and starts by
itself when the dependency returns, because that is a normal start
([05 — Activation](./05-activation.md)). The difference between the two is
the difference between "nothing went wrong yet" and "something went wrong".

**Settled here.** SPEC.md's runtime-failure paragraph omitted `disable` from
the operations that leave `failed`, while its state rules included it. The
state rules govern: all six operations leave every non-cleanup phase.

## BEH-BR-032: missingServiceIds is kept current

> **Satisfies:** [URS-BR-004](../urs.md#urs-br-004-know-why-a-plugin-is-not-running), [URS-BR-010](../urs.md#urs-br-010-detect-a-plugin-that-waits-forever)

```
REQUIREMENT: For every `waiting` and `failed` entry, `missingServiceIds`
             MUST equal, at every revision, the `ServiceId`s in the plugin's
             `requires` that have no `active` provider in its resolution
             scope, in `requires` order.
```

```
REQUIREMENT: A `waiting` plugin whose `missingServiceIds` would become empty
             MUST leave `waiting` in the same revision. Keys in `optional`
             MUST NEVER appear in `missingServiceIds`.
```

For a `waiting` plugin the list says what it waits for. For a `failed` plugin
it says what `retry` would do: an empty list means `retry` lands in
`starting`, a non-empty one means it lands in `waiting`. Keeping the list
current while the plugin is failed is what lets an adapter show that before
the operator acts. Optional keys never gate activation, so listing one would
claim a wait that does not exist
([15 — Optional and Reactive Dependencies](./15-optional-and-reactive.md)).

---

_Previous: [03 — Installation](./03-installation.md)_ · _Next: [05 — Activation](./05-activation.md)_
