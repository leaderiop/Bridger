# 04 — States and Snapshots

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-BEH-04                                               |
> | Revision       | 0.13                                                         |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.13 (2026-11-11): BEH-BR-027 `parentId` is the parent's `{ id, realm }` (C5); a child stop the parent's stop parked keeps `reason` "dependency-loss" (CL1) (SPEC-AUDIT-06) (CCR-BR-038)<br>0.12 (2026-11-11): BEH-BR-026 the `active → stopping` edge names the refused `whenAvailable` re-run and a child's sub-scope close or unmount (CL8), and the settled legality of `failed` (cleanup) cites BEH-BR-071 (CL7); BEH-BR-027 a child removal by its sub-scope close or unmount shows `reason` "remove", `parked` is cleared by them only for a stop parked outside the parent's stop (H1, CL1), `providerIds` name plugins as `{ id, realm }` (C2) (SPEC-AUDIT-05) (CCR-BR-037)<br>0.11 (2026-11-10): BEH-BR-027 `StopReason` "refused-digest" also covers a refused `whenAvailable` re-run (C11) (CCR-BR-036)<br>0.10 (2026-11-10): BEH-BR-031 dependency loss leaves a `dormant` plugin unchanged, and shutdown's unregistration is named as the one other exit from `failed` (audit round 3, Low) (CCR-BR-035)<br>0.9 (2026-11-10): BEH-BR-026 `starting` may also be left by unregistration when shutdown begins before its build (C2); diagram edge `active → stopping` for a refused background restart; BEH-BR-027 `StopReason` gains "refused-digest" (C5) (CCR-BR-034)<br>0.8 (2026-11-09): BEH-BR-026 edge `starting` → unregistered when shutdown begins while its build has not begun (12, BEH-BR-105) (review of CCR-BR-032) (CCR-BR-033)<br>0.7 (2026-11-09): BEH-BR-026 the unregistration edges name shutdown; BEH-BR-027 under shutdown every `stopping` entry shows `reason` "shutdown" and `next` "gone" (U-01) (CCR-BR-032)<br>0.6 (2026-11-08): idle return edges and `StopReason` "idle" (27, BEH-BR-252) (CCR-BR-024); disabled reason "refused-digest" and start-refused edges (CCR-BR-026)<br>0.5 (2026-11-08): `PluginCommon` gains `allowChildren` and `mandatoryServiceIds` (28); a lazy registration's `meta` is the lazy definition's identity (27) (CCR-BR-022)<br>0.4 (2026-11-08): Seventh state `dormant`, its edges, snapshot variant, `starting.loading`, failure phase "load", `PluginCommon.lazy` (CCR-BR-017)<br>0.3 (2026-10-03): The `starting` → `waiting` edge of BEH-BR-035 added to the meaning of `starting`, the diagram, the leave rule and dependency loss; `reconfigure` removed from the `waiting` → `starting` label (consistency pass) (CCR-BR-013)<br>0.2 (2026-10-02): `stopping` gains `parked`; `reason` and `next` when a cascade, a call or shutdown resumes a parked stop; parked per the single parking rule (CCR-BR-008)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001)                 |

---

This file specifies the plugin state machine and the values through which it
is observed: the seven `PluginState`s (`dormant` added by [27](./27-manifest-and-lazy-activation.md)) and their permitted transitions, the
discriminated-union `PluginSnapshot`, `HostSnapshot`, its revision, the
`changes` feed and `snapshot()`, the stickiness of `failed`, and the rule that
`missingServiceIds` is kept current. It converts the SPEC.md section "State
and lifecycle" (its state table, diagram and implicit rules, but not the
numbered activation and removal rules, which [05 — Activation](./05-activation.md)
and [06 — Removal](./06-removal.md) convert), and the `HostSnapshot`,
`changes` and `ServiceId` paragraphs of "Host interface". This file owns
BEH-BR-025–032 and uses all eight.

## BEH-BR-025: A registered plugin is in exactly one of seven states

> **See:** [ADR-BR-005](../decisions/005-failure-is-sticky.md)
> **Satisfies:** [URS-BR-004](../urs.md#urs-br-004-know-why-a-plugin-is-not-running)

```ts
// illustrative — not type-checked
type PluginState = "dormant" | "waiting" | "starting" | "active" | "stopping" | "failed" | "disabled"
```

| State | Meaning |
| --- | --- |
| `dormant` | Registered from its manifest; code not loaded; provider slots reserved; provides nothing; starts only when a trigger applies (27 — Manifest and Lazy Activation). |
| `waiting` | At least one required service has no active provider in the plugin's resolution scope. |
| `starting` | Every required service was available when it entered `starting`; the plugin is queued for a build slot, its code is loading, or its `build` is running. A requirement gone before its build begins returns it to `waiting` (05 — Activation, BEH-BR-035). |
| `active` | The build succeeded and every provided service is published. |
| `stopping` | The plugin accepts no new dependents or leases; its dependents, leases and activation scope are being closed. |
| `failed` | Activation, runtime or cleanup failed; the phase and a message are visible. It holds no live scope. |
| `disabled` | Registered with definition and configuration retained, deliberately not activated. It provides nothing and reserves no provider slot. With reason `refused-digest` the host, not an operator, disabled it, because a wired `RefusalList` refused a start (28 — Plugin Principal and Mandatory Policy, BEH-BR-267). |

```
REQUIREMENT: Every registered plugin MUST be in exactly one of the seven
             states at every snapshot revision. A plugin that has been
             removed MUST have no state and no snapshot entry.
```

```
REQUIREMENT: Within this specification, "failed(cleanup)" denotes a plugin
             in `failed` whose `failure.phase` is "cleanup". It is not an
             eighth state; it is the one failure phase with different
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
    waiting --> starting: requirements available (also replace)
    waiting --> disabled: disable
    waiting --> [*]: remove, or shutdown begins (12, BEH-BR-105)
    starting --> active: build succeeds and is published
    starting --> failed: build or activation fails, or build times out
    starting --> stopping: target changes; the in-flight step settles first
    starting --> waiting: a requirement is gone when the build would begin (05, BEH-BR-035)
    starting --> [*]: shutdown begins while its build has not begun (12, BEH-BR-105)
    active --> stopping: dependency loss, remove, replace, restart, reconfigure, disable, runtime failure, shutdown, refused background restart or whenAvailable re-run (15, 28), a child's sub-scope close or unmount (14)
    stopping --> waiting: requirements missing
    stopping --> starting: requirements available (replace, restart, reconfigure, provider returned)
    stopping --> failed: cleanup fails, or runtime failure completes
    stopping --> disabled: disable completes
    stopping --> [*]: removal completes, or a stop under shutdown completes (12, BEH-BR-105)
    failed --> starting: retry, restart, replace or reconfigure, requirements available
    failed --> waiting: retry, restart, replace or reconfigure, requirements missing
    failed --> disabled: disable (not after a cleanup failure)
    failed --> [*]: remove; or shutdown begins, except after a cleanup failure (12, BEH-BR-105)
    disabled --> starting: enable, requirements available
    disabled --> waiting: enable, requirements missing
    disabled --> [*]: remove, or shutdown begins (12, BEH-BR-105)
    [*] --> dormant: install of a lazy definition (27)
    dormant --> starting: triggered, requirements available (27)
    dormant --> waiting: triggered, requirements missing (27)
    dormant --> disabled: disable (27)
    dormant --> [*]: remove, or shutdown begins (27; 12, BEH-BR-105)
    disabled --> dormant: enable, not yet loaded (27)
    waiting --> dormant: replace with a lazy definition (27)
    failed --> dormant: replace with a lazy definition (27)
    stopping --> dormant: replace with a lazy definition completes (27)
    active --> stopping: idle return of a loaded lazy plugin, next dormant (27, BEH-BR-252)
    stopping --> dormant: idle return completes (27, BEH-BR-252)
    waiting --> disabled: start refused (28)
    dormant --> disabled: start refused (28)
    stopping --> disabled: start refused (28)
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
             `active`, `failed` or `stopping`; to `waiting` when a key in
             its `requires` has no `active` provider at the moment its build
             would begin (05 — Activation, BEH-BR-035); or out of the
             snapshot, unregistered without a stop step, when shutdown
             begins before its build has begun (12 — Shutdown and Hosting,
             BEH-BR-105). When it leaves for
             `stopping` before its build has begun, the stop MUST complete
             without running any finalizer, since none exists.
```

Which operation causes which transition, and what each operation does in each
state, is the business of the total table in
[08 — Operation Legality](./08-operation-legality.md); the diagram here is
the set of edges that table may use. Changes that keep the state —
`replace` of a `disabled` plugin, `reconfigure` of a `waiting` one, a health
check result — are not transitions, though they may change the snapshot.

**Settled here.** Four edges differ from SPEC.md's diagram. `[*] → starting`
and `disabled → starting` are added because a plugin with nothing missing
cannot be a `waiting` entry (BEH-BR-025); SPEC.md's prose already said
`enable` "moves the plugin to `waiting` or `starting`". `failed → disabled` is
withheld after a cleanup failure, because settled legality allows only
`remove` there (08 — Operation Legality, BEH-BR-071). `starting → waiting` was added by CCR-BR-010: a
`starting` plugin whose requirement is gone when its build would begin returns
to `waiting` without a stop (05 — Activation, BEH-BR-035). The nine `dormant`
edges were added by CCR-BR-017 ([27 — Manifest and Lazy
Activation](./27-manifest-and-lazy-activation.md), BEH-BR-244).

## BEH-BR-027: PluginSnapshot is a discriminated union on state

> **See:** [ADR-BR-014](../decisions/014-discriminated-plugin-snapshot.md)
> **Satisfies:** [URS-BR-004](../urs.md#urs-br-004-know-why-a-plugin-is-not-running), [URS-BR-028](../urs.md#urs-br-028-know-which-plugin-version-was-active-at-any-time)

```ts
// illustrative — not type-checked
type PluginSnapshot = PluginCommon & (
  | { readonly state: "dormant";  readonly triggers: readonly LazyTrigger[] }                      // 27
  | { readonly state: "waiting";  readonly missingServiceIds: readonly [ServiceId, ...ServiceId[]] }
  | { readonly state: "starting"; readonly providerIds: readonly ({ readonly id: string; readonly realm: string } | "base")[]; readonly loading: boolean }   // loading: 27
  | { readonly state: "active";   readonly providerIds: readonly ({ readonly id: string; readonly realm: string } | "base")[]; readonly health: "healthy" | "degraded" | "unknown" }
  | { readonly state: "stopping"; readonly reason: StopReason; readonly next: "waiting" | "starting" | "disabled" | "dormant" | "gone" | "failed"; readonly parked: boolean }
  | { readonly state: "failed";   readonly failure: { readonly phase: "load" | "build" | "activation" | "runtime" | "cleanup"; readonly message: string }; readonly missingServiceIds: readonly ServiceId[] }
  | { readonly state: "disabled"; readonly reason?: "refused-digest" }   // absent: disabled by an operator (28, BEH-BR-267)
)
interface PluginCommon {
  readonly id: string
  readonly realm: string
  readonly parentId?: { readonly id: string; readonly realm: string }   // the parent, as a record: a child may sit in another realm (17, BEH-BR-147)
  readonly meta?: { readonly version?: string; readonly digest?: string; readonly description?: string }
  readonly lazy?: { readonly loaded: boolean }   // exactly for a registration made from a lazy definition (27, BEH-BR-244)
  readonly allowChildren: boolean                // effective value (28, BEH-BR-263)
  readonly mandatoryServiceIds: readonly ServiceId[]   // installation-mandatory interceptions, own and inherited (28, BEH-BR-265)
}
type StopReason = "dependency-loss" | "remove" | "replace" | "restart" | "reconfigure" | "disable" | "runtime-failure" | "shutdown" | "idle"   // idle: 27, BEH-BR-252
  // "remove" also: a child's removal by its sub-scope close or Plugin.Runtime.unmount (14, BEH-BR-121)
  | "refused-digest"   // a background restart or `whenAvailable` re-run the RefusalList refused; `next` "disabled" (28, BEH-BR-267)
```

```
REQUIREMENT: Every entry of `HostSnapshot.plugins` MUST be a
             `PluginSnapshot` of exactly this shape. A field MUST be present
             only on the variant that declares it.
```

```
REQUIREMENT: `realm` MUST be "default" unless the plugin was installed into
             another realm; `parentId` MUST be set exactly for child plugins,
             as the parent's `{ id, realm }` (14 — Children and Groups); `meta` MUST carry the version,
             digest and description of the definition currently registered
             under the ID, and nothing else from it.
```

```
REQUIREMENT: `providerIds` MUST list, without duplicates and in the order of
             first appearance in `requires`, the provider of each required
             key — a plugin as the record `{ id, realm }` (17 — Realms and
             Interception, BEH-BR-147), or "base" for a base service — as
             captured
             for the activation, or, before the build has begun, as it would
             be captured now.
```

```
REQUIREMENT: `health` MUST be "unknown" when no check is declared or none
             has completed in this activation (10 — Runtime Failure and
             Health).
```

```
REQUIREMENT: On a `stopping` entry, `reason` MUST name what began the stop,
             except as the following requirements state (a cascade's
             takeover of a parked operation → "dependency-loss"; a call's
             resumption → its operation; shutdown → "shutdown"). A child's
             removal by the close of its sub-scope or by
             `Plugin.Runtime.unmount` MUST show "remove" with `next`
             "gone", both when it begins the child's stop and when it
             resumes a stop parked outside the parent's stop, from the
             revision in which it begins or resumes it (14 — Children and
             Groups, BEH-BR-121); a child stop the parent's stop parked —
             a parked system stop of the cascade (08 — Operation Legality,
             BEH-BR-080) — keeps `reason` "dependency-loss"; a sub-scope
             close or an `unmount` does not change it. `next` MUST
             name where the plugin will go when the stop completes ("gone"
             for removal), and MUST be updated in the same revision as any
             change to the stop's destination, parked or not.
```

```
REQUIREMENT: On a `stopping` entry, `parked` MUST be true exactly while the
             stop is parked — its drain expired without `force`, or the call
             that drove it failed with `DrainTimeout` and left it unsettled,
             and it waits for a call, a cascade or shutdown to resume it,
             or, for a child whose stop was parked outside its parent's
             stop, the close of its sub-scope or its `unmount` (14 —
             Children and Groups, BEH-BR-121) —
             whether it is a parked operation or a parked system stop
             (08 — Operation Legality, BEH-BR-074). When a call fails with
             `DrainTimeout`, every stop it drives that has not settled — its
             own stop and every dependency-loss stop it started, at any depth
             — parks in the same revision (BEH-BR-079), and `parked` MUST
             become true on each of them in that revision. It MUST become
             false in the revision in which a call, a cascade, shutdown, or
             a child's sub-scope close or `unmount` resumes the stop.
```

```
REQUIREMENT: When a cascade resumes a parked operation's stop and so ends
             the parked operator intent (08 — Operation Legality,
             BEH-BR-080), `reason` MUST become "dependency-loss" and `next`
             MUST become the destination of a dependency-loss stop —
             "waiting" or "starting", or "gone" for a child (14 — Children
             and Groups, BEH-BR-125) — in the revision in which the cascade
             resumes it. When that resumed drain expires again, the stop
             MUST stay `stopping` as a parked system stop with `reason`
             "dependency-loss", `parked` true, and `next` the destination of
             the dependency-loss stop — "waiting" or "starting", or "gone"
             for a child — kept current while it stays parked.
```

```
REQUIREMENT: When a call resumes a parked stop, `reason` MUST become, in the
             revision in which it resumes it, the operation the call is in
             flight for: for a parked operation, the operation BEH-BR-072's
             row names (the in-flight operation for a join, the incoming one
             for a supersede), with `next` its destination; for a parked
             system stop, the call's operation, with `next` the
             dependency-loss destination until the stop settles and the call
             is decided (08 — Operation Legality, BEH-BR-074).
```

```
REQUIREMENT: Once shutdown has begun, every `stopping` entry MUST show
             `reason` "shutdown" and `next` "gone", the destination of every
             stop under shutdown (12 — Shutdown and Hosting, BEH-BR-105):
             a stop that shutdown begins, from the revision in which it
             begins; a stop already running, parked or not, from the
             revision in which shutdown takes it over or resumes it. A stop
             whose cleanup then fails still ends in `failed` with phase
             "cleanup" (06 — Removal, BEH-BR-046).
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

**Settled here.** A parked stop looks, by `state`, `reason` and `next` alone,
exactly like a stop still draining; only the second needs no operator. The
`stopping` variant therefore carries `parked`, so a screen or script can tell
"waiting for leases" from "waiting for you" without reading the audit trail
(CCR-BR-008). When a cascade takes over a parked operation, the operator's
destination no longer applies, and `reason` and `next` say so in the same
revision rather than naming an intent that will not complete. When a call
resumes a stop, `reason` names that call's operation — the one now in flight —
while `next` still says where the stop itself will land, since the call is
decided only once the stop settles; shutdown's takeover is shown as
"shutdown". `reason` therefore names what the stop is now for, which is what
began it except across a resumption.

For a lazy registration, `meta` is the lazy definition's identity `meta` (the
manifest's `version`, the digest supplied beside or in the manifest, the
manifest's `description`), and `loading` is
true while its `load` runs in the build step ([27 — Manifest and Lazy
Activation](./27-manifest-and-lazy-activation.md), BEH-BR-244, BEH-BR-246).

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
             "runtime" included; with phase "cleanup", only `remove`. The
             one other exit is shutdown, which unregisters a `failed`
             plugin of any phase but "cleanup" when it begins
             (12 — Shutdown and Hosting, BEH-BR-105).
```

```
REQUIREMENT: Dependency loss MUST change only `starting` and `active` plugins,
             each through `stopping`, except a `starting` plugin whose build
             has not begun when its requirement is gone, which returns to
             `waiting` directly (05 — Activation, BEH-BR-035). It MUST NOT
             change the state of a `dormant`, `waiting`, `failed` or
             `disabled` plugin.
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
