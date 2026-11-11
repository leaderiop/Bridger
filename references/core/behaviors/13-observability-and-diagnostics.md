# 13 — Observability and Diagnostics

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-BEH-13                                               |
> | Revision       | 0.11                                                         |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.11 (2026-11-11): BEH-BR-114 `stop-resumed` `by` "sub-scope" or "unmount" only for a child stop parked outside its parent's stop (H1); BEH-BR-119 each registration is reported once, an event listener as `listener` only (CL9) (SPEC-AUDIT-05); `audit-degraded` lists the lost reconcile parent record, and none is emitted after the final snapshot (CL11, C3) (SPEC-AUDIT-05); `drain-timeout` and `stop-parked` name `target` by `{ id, realm }`, as `DrainTimeout.target` does (residual of C2) (SPEC-AUDIT-05) (CCR-BR-037)<br>0.10 (2026-11-10): BEH-BR-119 `ActivePlugin` is typed `Option<ActivePlugin>` with `pluginId`, `realm` and a scoped `report` operation, the only way a registry built before the host reaches it; `report` publishes no event and does nothing after the activation ends (C12) (CCR-BR-036)<br>0.9 (2026-11-10): BEH-BR-114 `stop-resumed.by` gains "sub-scope" and "unmount" for a child stop resumed by its sub-scope close or `Plugin.Runtime.unmount` (C13) (CCR-BR-035)<br>0.8 (2026-11-10): BEH-BR-114 `Generation` joins the helpers that publish on their own streams, never on `Host.events` (C7) (CCR-BR-034)<br>0.7 (2026-11-08): `plugin-idled` and `held-event-dropped` events (27, BEH-BR-251, BEH-BR-252) (CCR-BR-024); `reconcile-partial` event (32, BEH-BR-324) (CCR-BR-025)<br>0.6 (2026-11-08): `hook-breaker` and `family-eviction` leave `HostEvent`; helpers outside the `Host` publish on their own streams (CCR-BR-022)<br>0.5 (2026-11-08): `plugin-triggered` event, `contracts` and `manifest` in `PluginInspection` (CCR-BR-017); `child-refused` and `resolution-refused` events, BEH-BR-119 `ActivePlugin` is not the principal (CCR-BR-018); `hook-breaker`, `family-eviction`, `handoff-imported` and `handoff-lost` events (CCR-BR-019)<br>0.4 (2026-10-02): `parked`/`pending` (with `requestedRecordId?`) in inspection; `stop-parked` (one per parked stop, `target` from the one failing call), `stop-resumed`; `drain-timeout` `pluginId`/`target`; ended intents shown by the `intent-ended` record (CCR-BR-008)<br>0.3 (2026-10-02): Sliding PubSub lag confirmed per subscriber (CCR-BR-003)<br>0.2 (2026-10-02): Consistency fixes from independent review (CCR-BR-002)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001) |

---

Bridger has three observation channels with three different promises, and
the most dangerous mistake a reader can make is to take one for another.
This file converts SPEC.md "Observability" (events, `seq`, the sliding
`PubSub`, spans, metrics, logs) and "Inspection and diagnostics" (`inspect`,
stall warnings, log and span context). This file owns BEH-BR-113–120 and
uses all eight.

| Channel | Promise | Not |
| --- | --- | --- |
| `Host.changes` / `snapshot()` | Latest state; revisions never regress; may skip intermediate revisions | A history |
| `Host.events` | Every transition, in order, while the subscriber keeps up; loss is visible as a `seq` gap | An audit trail |
| `AuditSink` ([23](./23-audit-sink-and-record.md)) | One `requested` and one terminal record per mutating call, contiguous `auditSeq`, fail-closed | A diagnostic feed |

## BEH-BR-113: Host.events is a diagnostic feed, not an audit trail

> **See:** [ADR-BR-007](../decisions/007-observation-primitives.md), [ADR-BR-030](../decisions/030-audit-sink-port.md), [ADR-BR-037](../decisions/037-audit-sequence-separate-from-event-seq.md)
> **Satisfies:** [URS-BR-009](../urs.md#urs-br-009-see-plugin-lifecycle-in-existing-tracing-logs-and-metrics), [URS-BR-022](../urs.md#urs-br-022-obtain-a-complete-ordered-and-gap-detectable-lifecycle-record)
> **Risk:** [RSK-BR-012](../gxp/03-risk-assessment.md#rsk-br-012)

```
REQUIREMENT: `Host.events` MUST be specified, documented and named as a
             diagnostic feed. A document, API description or example MUST NOT
             describe it, or anything persisted from it, as an audit trail.
```

```
REQUIREMENT: The audit trail of host mutations MUST be the records written
             to the `AuditSink` (behaviour 23), ordered by their own
             `auditSeq`. The event `seq` and `auditSeq` MUST be independent
             counters; one MUST NOT be derived from the other.
```

```
REQUIREMENT: A host with no `AuditSink` wired MUST NOT present `Host.events`
             as a substitute for one.
```

Plainly: `Host.events` is lossy by design. It is bounded, it drops the
oldest events for a slow subscriber, it is written whether or not anyone is
listening, and its writing never blocks or refuses a host operation. Those
are the right properties for a diagnostic feed and the wrong ones for an
audit trail, which must be complete, must not lose a record silently, and
must stop a change it cannot record
([ADR-BR-031](../decisions/031-audit-failure-policy.md)). A consumer that
persists `Host.events` gets a useful operational log; it does not get a
record of who changed what, and a gap in `seq` tells it only that it fell
behind.

The two counters are separate
([ADR-BR-037](../decisions/037-audit-sequence-separate-from-event-seq.md))
because they count different things: `seq` counts diagnostic events, most of
which are not audited (`build-started`, `plugin-stalled`), and `auditSeq`
counts audit records, some of which have no event. Sharing one counter would
put gaps in the audit sequence that `verifyAuditSequence` could not tell
apart from lost records.

## BEH-BR-114: The event catalogue

> **See:** [ADR-BR-007](../decisions/007-observation-primitives.md)
> **Satisfies:** [URS-BR-009](../urs.md#urs-br-009-see-plugin-lifecycle-in-existing-tracing-logs-and-metrics), [URS-BR-004](../urs.md#urs-br-004-know-why-a-plugin-is-not-running)
> **Risk:** [RSK-BR-008](../gxp/03-risk-assessment.md#rsk-br-008)

```ts
// illustrative — not type-checked
interface HostEventCommon {
  readonly hostId: string
  readonly seq: number                 // BEH-BR-115
  readonly timestamp: string           // from the Clock service
  readonly pluginId?: string           // where one applies
  readonly realm?: string              // where one applies
}
type HostEvent = HostEventCommon & (
  | { readonly type: "plugin-installed" }
  | { readonly type: "plugin-removed" }
  | { readonly type: "build-started" }
  | { readonly type: "build-finished"; readonly durationMs: number; readonly outcome: "success" | "failure" | "interrupted" }
  | { readonly type: "state-changed"; readonly from: PluginState; readonly to: PluginState; readonly reason?: StopReason }
  | { readonly type: "runtime-failure"; readonly message: string }
  | { readonly type: "lease-timeout"; readonly serviceId: ServiceId }
  | { readonly type: "lease-revoked"; readonly leases: number }
  | { readonly type: "drain-timeout"; readonly leases: number; readonly target?: { readonly id: string; readonly realm: string } }   // pluginId, realm = DrainTimeout.id, realm
  | { readonly type: "stop-parked"; readonly leases: number; readonly target?: { readonly id: string; readonly realm: string } }
  | { readonly type: "stop-resumed"; readonly by: "operator" | "cascade" | "shutdown" | "sub-scope" | "unmount"; readonly endsIntent?: string }
  | { readonly type: "config-rejected"; readonly message: string }
  | { readonly type: "config-updated"; readonly paths: readonly string[] }
  | { readonly type: "plugin-stalled"; readonly missingServiceIds: readonly ServiceId[] }
  | { readonly type: "listener-failed"; readonly event: string; readonly message: string }
  | { readonly type: "closed" }
  | { readonly type: "audit-degraded"; readonly message: string }
  | { readonly type: "audit-acknowledged" }
  | { readonly type: "plugin-triggered"; readonly trigger: LazyTrigger }                        // 27, BEH-BR-245
  | { readonly type: "plugin-idled" }                                                          // 27, BEH-BR-252
  | { readonly type: "held-event-dropped"; readonly event: string; readonly reason: "no-listener" | "activation-failed" | "ended" | "timeout" } // 27, BEH-BR-251
  | { readonly type: "child-refused"; readonly childId: string }                                // 28, BEH-BR-263; pluginId = parent
  | { readonly type: "resolution-refused"; readonly serviceId: ServiceId; readonly route: string } // 29, BEH-BR-274
  | { readonly type: "handoff-imported" }                                                      // 34, BEH-BR-350
  | { readonly type: "handoff-lost"; readonly tag: string }                                    // 34, BEH-BR-350
  | { readonly type: "reconcile-partial"; readonly scope: string; readonly correlationId: string
      readonly notUndone: readonly { readonly id: string; readonly realm: string; readonly action: string }[] }   // 32, BEH-BR-324
)
```

```
REQUIREMENT: `Host.events` MUST emit, without coalescing: `plugin-installed`,
             `plugin-removed`, `build-started`, `build-finished` (with
             duration and outcome), `state-changed` (from, to, reason),
             `runtime-failure`, `lease-timeout`, `lease-revoked`,
             `drain-timeout`, `stop-parked`, `stop-resumed`,
             `config-rejected`, `config-updated`, `plugin-stalled`,
             `listener-failed`, `closed`, `audit-degraded` and
             `audit-acknowledged`; and, as the files that introduce them
             specify, `plugin-triggered`
             ([27](./27-manifest-and-lazy-activation.md), BEH-BR-245),
             `plugin-idled` and `held-event-dropped`
             ([27](./27-manifest-and-lazy-activation.md), BEH-BR-251,
             BEH-BR-252), `child-refused`
             ([28](./28-plugin-principal-and-mandatory-policy.md),
             BEH-BR-263), `resolution-refused`
             ([29](./29-capability-grants-and-call-log.md), BEH-BR-274),
             `handoff-imported` and `handoff-lost`
             ([34](./34-state-handoff.md), BEH-BR-350), and
             `reconcile-partial`
             ([32](./32-generic-gate-and-plan.md), BEH-BR-324).
```

```
REQUIREMENT: Helpers outside the `Host` interface — hook points
             ([31](./31-hook-points.md)), realm families
             ([33](./33-realm-families.md)) and `Generation`
             ([20](./20-generation.md)) — MUST NOT publish on
             `Host.events`, whose `seq` only the host assigns: a hook
             point's breaker transitions go on its own `decisions` stream
             (BEH-BR-304), a family's eviction outcomes on its own
             `events` stream (BEH-BR-333), and a generation's forced
             revocations on its own `revocations` stream as
             `GenerationRevoked` (BEH-BR-169, BEH-BR-174).
```

```
REQUIREMENT: A `drain-timeout` event MUST be emitted for each call that
             fails with `DrainTimeout`, with `pluginId` and `realm` set to
             the error's `id` and `realm` and `target` set to the error's `target` (present exactly
             when the call named another plugin) (09 — Leases, BEH-BR-085).
```

```
REQUIREMENT: A `stop-parked` event MUST be emitted for each stop that parks
             — a parked operation or a parked system stop (08 — Operation
             Legality, BEH-BR-074), including every stop that parks with the
             one call that failed with `DrainTimeout` (BEH-BR-079) — with
             `pluginId` the plugin whose stop parked, `leases` the number of
             leases still held on it, and `target` the plugin named by that
             one failing call, present when it differs from `pluginId`.
             A `stop-resumed` event MUST be emitted when a parked stop
             resumes, with `by` naming what resumed it: an operator call
             ("operator"), a cascade ("cascade"), shutdown ("shutdown"), the
             close of the sub-scope a child was mounted under ("sub-scope")
             or `Plugin.Runtime.unmount` of the child ("unmount"; 14 —
             Children and Groups, BEH-BR-121, BEH-BR-126) (CCR-BR-035) —
             the last two only for a child stop parked outside its parent's
             stop, since they never resume one the parent's stop parked
             (CCR-BR-037).
             When the resumption ends a parked operator intent (BEH-BR-080),
             `endsIntent` MUST name that operation (for example "remove");
             when a call resumes a parked operation, the operation in flight
             is the one BEH-BR-072's row names (the in-flight operation for a
             join, the incoming one for a supersede).
```

```
REQUIREMENT: Every event MUST carry the host ID, the plugin ID where one
             applies, a timestamp read from the `Clock` service, and `seq`.
```

```
REQUIREMENT: Events MUST carry identifiers, counts, states and messages only:
             never configuration values, service implementations, keys,
             fibers or raw causes.
```

`audit-degraded` is emitted when the audit latch is set — a terminal,
`rejected` or system record was not written within `auditTimeout`,
`shutdown`'s `requested` record was not written, a record was dropped for
writer-queue overflow, or a running `reconcile`'s parent terminal record was
lost because shutdown's wait for it ended (the full list of
[23 — Audit Sink and Record](./23-audit-sink-and-record.md), BEH-BR-205) —
except during shutdown once the final snapshot has been published, when the
latch is set without an event and reported by `Host.controls().closed`
(24 — Time, Identifiers and Sequence, BEH-BR-212) — and `audit-acknowledged` when
`Host.acknowledgeAuditDegraded` clears it; both are specified in
[23 — Audit Sink and Record](./23-audit-sink-and-record.md). They appear on
the diagnostic feed so that monitoring notices a degraded audit channel; the
feed reporting them does not make it part of the audit trail. Fields beyond
the common ones are illustrative and are fixed with the implementation,
except the `drain-timeout`, `stop-parked` and `stop-resumed` fields, which
the requirements above fix.

**Settled here.** `drain-timeout` reports a call's failure; `stop-parked`
reports what that failure leaves behind — a stop waiting for an operator —
and `stop-resumed` reports when that wait ends and by whom (CCR-BR-008). The
two are separate because they differ in number: one call that fails with
`DrainTimeout` parks every stop it was driving — its own and each
dependency-loss stop it started — so one `drain-timeout` can come with several
`stop-parked` events, all with the same `target`; and a cascade with no caller
resumes a parked stop with no `drain-timeout` at all. Which operator intent a
resumption ended is recorded in the audit trail by the `intent-ended` record,
whose `endsIntentOf` is the `recordId` of the parked call's `requested` record
([23 — Audit Sink and Record](./23-audit-sink-and-record.md)); the event's
`endsIntent` only names the operation, for monitoring.

## BEH-BR-115: seq is monotonic, and loss shows as a gap

> **See:** [ADR-BR-007](../decisions/007-observation-primitives.md), [ADR-BR-037](../decisions/037-audit-sequence-separate-from-event-seq.md)
> **Satisfies:** [URS-BR-009](../urs.md#urs-br-009-see-plugin-lifecycle-in-existing-tracing-logs-and-metrics)
> **Risk:** [RSK-BR-012](../gxp/03-risk-assessment.md#rsk-br-012)

```
REQUIREMENT: `events` MUST be backed by `PubSub.sliding(eventBuffer)`, with
             `BridgerOptions.eventBuffer` defaulting to 1024, so that a
             subscriber that falls behind loses the oldest events and never
             blocks the host.
```

```
REQUIREMENT: `seq` MUST start at 1 for each host and increase by exactly one
             per published event, in the order the host applied the changes
             the events describe.
```

```
REQUIREMENT: A subscriber MUST observe loss only as a gap in `seq`, never as
             reordering or as a repeated `seq`.
```

`events` is not coalesced, unlike `changes`: a subscriber that keeps up sees
every transition. It is bounded, unlike an audit sink: one that does not
keep up loses the oldest and can tell from the gap. Consumers who need a
lasting history of diagnostic events persist them themselves.

**Confirmed (CCR-BR-003).** A sliding `PubSub` drops per subscriber: each
subscriber loses only what *it* failed to read, a fast subscriber is not
affected by a slow one, and publishing never blocks (prototype checks
E1a–E1c, [ADR-BR-001](../decisions/001-effect-v4-as-effect-system.md)). A gap
in `seq` therefore means that this subscriber fell behind.

**Settled here.** SPEC.md says only that `seq` is monotonic. Starting at 1
per host and stepping by exactly one is what makes a gap detectable at all;
a counter that could skip values on its own would make every gap ambiguous.

## BEH-BR-116: Spans and logs carry plugin identity

> **Satisfies:** [URS-BR-009](../urs.md#urs-br-009-see-plugin-lifecycle-in-existing-tracing-logs-and-metrics)
> **Risk:** [RSK-BR-008](../gxp/03-risk-assessment.md#rsk-br-008)

```
REQUIREMENT: The host MUST create the spans `bridger.plugin.build`,
             `bridger.plugin.stop` and `bridger.lease`.
```

```
REQUIREMENT: The host MUST log each plugin state change.
```

```
REQUIREMENT: Every activation, background fiber, `whenAvailable` run and
             event listener MUST run with the log annotations `plugin` and
             `realm` and inside the span of the operation that started it.
```

```
REQUIREMENT: Full failure causes MUST be available in the core's logs at the
             point of failure, and MUST NOT be placed in snapshots, events
             or error values.
```

Annotating at the source means every log line a plugin writes carries its
identity without a per-plugin logger service, and tracing follows the fiber
into lease callbacks because the supervised child inherits the caller's span
([09 — Leases](./09-leases.md)).

**Settled here.** Logging a plugin's failure cause can only print what the
plugin put into it. The core never inserts configuration values into a cause
and renders `Redacted` values redacted; the content of a plugin's own errors
is its author's responsibility.

## BEH-BR-117: Metrics have bounded labels

> **Satisfies:** [URS-BR-009](../urs.md#urs-br-009-see-plugin-lifecycle-in-existing-tracing-logs-and-metrics)
> **Risk:** [RSK-BR-008](../gxp/03-risk-assessment.md#rsk-br-008)

```
REQUIREMENT: The host MUST record: plugin count by state, build duration,
             transition counts by kind, lease wait duration, lease hold
             duration, and drain timeouts.
```

```
REQUIREMENT: Metric labels MUST be drawn from bounded sets (for example state
             and outcome). Plugin IDs MUST NOT be metric labels; they appear
             in spans, events and logs only.
```

Plugin IDs are unbounded in a host that installs plugins at runtime, and an
unbounded label set is a memory leak in every metrics backend that receives
it ([NFR-BR-007](../urs.md#nfr-br-007-bounded-memory)).

## BEH-BR-118: inspect returns names and counts only

> **Invariant:** [INV-BR-013](../invariants.md#inv-br-013-configuration-values-are-never-observable)
> **See:** [ADR-BR-018](../decisions/018-configuration-decoded-before-build.md)
> **Satisfies:** [URS-BR-004](../urs.md#urs-br-004-know-why-a-plugin-is-not-running)
> **Risk:** [RSK-BR-008](../gxp/03-risk-assessment.md#rsk-br-008)

```ts
inspect(ref: PluginRef): Effect.Effect<PluginInspection, UnknownPlugin | HostClosed>

interface PluginInspection {
  readonly id: string; readonly realm: string; readonly state: PluginState
  readonly requires: readonly ServiceId[]; readonly optional: readonly ServiceId[]; readonly provides: readonly ServiceId[]
  readonly children: readonly string[]
  readonly background: readonly { readonly name: string; readonly policy: string; readonly restarts: number; readonly running: boolean }[]
  readonly whenAvailable: readonly { readonly name: string; readonly keys: readonly ServiceId[]; readonly running: boolean }[]
  readonly listeners: readonly { readonly event: string; readonly priority: number }[]
  readonly leases: number
  readonly contributions: readonly { readonly registry: string; readonly id: string }[]
  readonly lastBuildMs?: number
  readonly parked: boolean                                                            // the plugin's stop is parked (BEH-BR-074)
  readonly pending?: {                                                               // the operator operation in flight, if any
    readonly operation: string
    readonly correlationId: string
    readonly requestedRecordId?: string                                              // present only with an AuditSink wired
  }
  readonly contracts: { /* requires, provides */ }                                   // 26, BEH-BR-232
  readonly manifest?: PluginManifest                                                 // 27, BEH-BR-249; read without loading
}
```

```
REQUIREMENT: `inspect(ref)` MUST return the owned-resources view above for
             the plugin, carrying names, identifiers and counts only — never
             values, keys, fibers, implementations or configuration.
```

```
REQUIREMENT: `inspect` MUST fail with `UnknownPlugin` for an unknown
             reference, and with `HostClosed` once shutdown has started.
```

```
REQUIREMENT: `parked` MUST equal the `parked` field of the plugin's
             `stopping` snapshot entry, and MUST be false in every other
             state (04 — States and Snapshots, BEH-BR-027). `pending` MUST be
             present exactly while an operator operation is in flight on the
             plugin (08 — Operation Legality, BEH-BR-072), parked or not —
             including a call that has resumed a parked system stop — naming
             the operation BEH-BR-072's row names and the `correlationId` of
             the call that owns it; it MUST be absent while only a system
             stop runs or is parked. When an `AuditSink` is wired,
             `requestedRecordId` MUST be the `recordId` of the owning call's
             `requested` record (23 — Audit Sink and Record), the identifier
             that `endsIntentOf` and `resumes` use; without a sink it MUST be
             absent.
```

```
REQUIREMENT: `inspect` is not a mutating operation: it MUST NOT require
             attribution, consult the gate, or write audit records.
```

`inspect` is the counterpart of Cordis's effect tree: it answers "what does
this plugin own right now". SPEC.md's signature omitted `HostClosed`; it is
added, consistent with every other host read that waits on host state
([12 — Shutdown and Hosting](./12-shutdown-and-hosting.md)). `parked` and
`pending` (CCR-BR-008) answer the operator's question after a `DrainTimeout`
— "is this plugin waiting for me, and on whose call?" — without the audit
trail; a `correlationId` is an identifier, not a value, so it does not widen
what `inspect` exposes. `requestedRecordId` identifies the owning call the way
the audit trail does: a later `intent-ended` record names it in
`endsIntentOf`, and the terminal record of a call that resumes the operation
names it in `resumes`, so an operator can match the inspection to both.

## BEH-BR-119: Ownership is reported through ActivePlugin

> **Satisfies:** [URS-BR-004](../urs.md#urs-br-004-know-why-a-plugin-is-not-running)

```ts
// Context.Reference<Option<ActivePlugin>>, identifier "@bridger/core/ActivePlugin", default: none
interface ActivePlugin {
  readonly pluginId: string
  readonly realm: string
  // lists one registration under this plugin in `inspect` until the calling scope closes;
  // does nothing once the activation has ended; never fails
  readonly report: (registration:
    | { readonly kind: "contribution"; readonly registry: string; readonly id: string }
    | { readonly kind: "listener"; readonly event: string; readonly priority: number }
  ) => Effect.Effect<void, never, Scope.Scope>
}
```

```
REQUIREMENT: The host MUST set `@bridger/core/ActivePlugin` to the plugin's
             identity for every fiber running in a plugin's activation.
```

```
REQUIREMENT: `ContributionRegistry` and the event bus MUST report
             registrations to the host by calling the `report` operation of
             the `ActivePlugin` value the registering fiber carries, in the
             scope of the registration, when a value is present, so that
             `inspect` lists them under the owning plugin until the
             registration ends. The host MUST make that value per
             activation; it is the only way a registry, built before the
             host and holding no reference to it, reaches the host (19 —
             Contribution Registry, BEH-BR-163). `report` MUST NOT publish
             an event and MUST do nothing once the activation has ended.
             When it is absent, the registration MUST still succeed and MUST
             NOT be attributed to any plugin.
```

```
REQUIREMENT: Each registration MUST be reported once. An event listener
             MUST be reported by the event bus as `listener` only: the
             registries the bus keeps its listener lists in MUST NOT report
             it as a `contribution` (16 — Event Bus, BEH-BR-140), so that
             `inspect` lists it under `listeners` and not also under
             `contributions` (CCR-BR-037).
```

The reference is ambient so that a registry, which is a base service with no
knowledge of plugins
([19 — Contribution Registry](./19-contribution-registry.md)), can still
tell the host who registered what without a plugin-specific API.

**Settled here.** `ActivePlugin` is diagnostic attribution only. It is never
used as the `Actor` of an audit record: actor identity is not inferred from a
fiber or a plugin ([22 — Attributable Operations](./22-attributable-operations.md)).
`ActivePlugin` is not the plugin principal either: the principal that core
records as `onBehalfOf` and checks on every read is `CurrentPlugin`
([28 — Plugin Principal and Mandatory Policy](./28-plugin-principal-and-mandatory-policy.md),
BEH-BR-257).

## BEH-BR-120: A stalled plugin is reported once per stall

> **Invariant:** [INV-BR-024](../invariants.md#inv-br-024-time-and-identifiers-come-only-from-services)
> **Satisfies:** [URS-BR-010](../urs.md#urs-br-010-detect-a-plugin-that-waits-forever), [URS-BR-004](../urs.md#urs-br-004-know-why-a-plugin-is-not-running)

```ts
// BridgerOptions
readonly stallWarning?: Duration.Input | "never"   // default 30 seconds
```

```
REQUIREMENT: A plugin that stays `waiting` longer than `stallWarning`
             (default 30 seconds) MUST produce exactly one
             `plugin-stalled { id, missingServiceIds }` event for that stall.
             `"never"` MUST disable the warning.
```

```
REQUIREMENT: A stall MUST end when the plugin leaves `waiting`. A later entry
             into `waiting` MUST start a new stall, which MAY produce a new
             event.
```

```
REQUIREMENT: Stall time MUST be measured with the `Clock` service.
```

A missing provider is never a silent hang: `awaitIdle` deliberately does not
wait for it, and this event is what tells an operator that a plugin is
waiting for something that has not arrived. One event per stall keeps a
plugin that waits for hours from flooding the bounded feed and pushing out
the events around it.

---

_Previous: [12 — Shutdown and Hosting](./12-shutdown-and-hosting.md)_ · _Next: [14 — Children and Groups](./14-children-and-groups.md)_
