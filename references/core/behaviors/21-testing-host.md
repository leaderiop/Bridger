# 21 — Testing Host

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-BEH-21                                               |
> | Revision       | 0.19                                                         |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.19 (2026-11-09): BEH-BR-179 the counter is unique within one `TestHost`, and `TestHost`s whose records meet in one sink need distinct prefixes (F-03); checks 59 (local contracts, `descriptor.local`), 65 (a loaded definition breaking BEH-BR-003 fails phase "load" with `InvalidDefinition`), 83 (the plan's rejection tags), 84 (member readiness, timeout and the next `use`), 86 (`EphemeralRealm.use` is `Host.useAll`), 87 (handoff on `restart` and `reconfigure` under `alsoOn`, the stop's final step, principal, annotations, lazy registrations), 88 (a superseded build keeps the held value; a call during the import waits) and 112 (`CrossingInfo.disclosed`) amended; check 114 added (identifier uniqueness); check 8: a plugin whose build is queued when shutdown begins is unregistered without a stop step or record (CCR-BR-033)<br>0.18 (2026-11-09): Checks 4 (idle return under BEH-BR-073), 8 (shutdown: no start, cancelled and discarded builds, destination "gone", final snapshot), 9 and 24 (dependents' exceptions; undeclared keys of the optional members), 26 (base key in an isolating realm, `InvalidRealm`, failing `wrap` after activation), 27 (`enable` precedence, `replace` of a disabled plugin), 51 (mount record in `starting`) and 103 (`PluginHandle.restart` options) amended (BEH-BR-183, BEH-BR-184) (CCR-BR-032)<br>0.17 (2026-11-09): `memoryAuditSink` keeps a different record under a stored `recordId` beside the first, following BEH-BR-193 (CCR-BR-031)<br>0.16 (2026-11-08): Checks amended for the host-core prototype third pass: 83 (prune drain and force compared only when they take effect, G-P23), 92 (link without `hostId`, wait to the end of a non-empty window, G-P20, G-P21), 96 (a discarded successful build drops "ended", G-P19), 97 (kept trigger not in `triggered`, G-P22), 99 (half-finished two-action undo step, G-P24) (CCR-BR-030)<br>0.15 (2026-11-08): Checks amended for the round-2 agent review and prototype second pass: 72 (`Grant.all` layer with `changes`, G-P13), 92 (idling and refused declarations, owner matching, `HostLink.none`, failed reads, wake window, long waking), 96 (held-event drop reason during a load, G-P14), 97 (registry holds not idle conditions, G-P17), 99 (multi-action undo, override restore, prune options, refused digests), 104 (refused-digest and the reconcile diff, plan) (CCR-BR-029)<br>0.14 (2026-11-08): Checks amended for the resolutions of the host-core prototype findings G-P1..G-P12: 49 (lazy registrations in the confluence comparison), 59 (`serviceKey`), 60 (`disabled: true`), 62 (`consentDiff` shapes), 63 (`range` with `version`), 79 (`settle` outcomes), 83 (decoded paths, host-level mismatches), 86 (delimiter rule), 92 (empty wake window, woken while `starting`, `make` refusal), 108 (which records carry `sanitized`) (CCR-BR-028)<br>0.13 (2026-11-08): BEH-BR-184 checks 112 (call-log kind "dispatch", string epochs) and 113 (registry entry owner, `HoldRevoked` feed) (CCR-BR-027)<br>0.12 (2026-11-08): Check 64 amended, checks 92–97 (CCR-BR-024); checks 98–103 (CCR-BR-025); `memoryCallLog` `onFailure` and `queue`, `scriptedRefusalList` fixture, check 79 renamed to `policy` and covers `settle`, checks 104–111 (CCR-BR-026)<br>0.11 (2026-11-08): check 22 (generation `changes` and `view`); checks 63, 65, 66 (lazy digest, not-yet-loaded `reconfigure`, `methods`); copies of checks 67, 68, 70, 75 and 76 aligned with files 28 and 30; checks 77, 79, 81, 83 and 85 aligned with files 31–33; check 91 (entitlement failure modes, mode `unmetered`) (CCR-BR-022)<br>0.10 (2026-11-08): Acceptance checks 59–66 (CCR-BR-017), 67–76 (CCR-BR-018), 77–88 (CCR-BR-019) and 89–91 (CCR-BR-020); `Fault.loadFails` and `Fault.handoffFails`; scripted `AccessPolicy`, `CapabilityPolicy` and `Gate<Req>` fixtures, in-memory `CallLog` fixture and `heldHandoff` (CCR-BR-017, CCR-BR-018, CCR-BR-019)<br>0.9 (2026-10-03): Acceptance checks 55–58: configuration fingerprints at step 4a and equal in request and records, a fail-closed fingerprinter, `Host.controls` with the audit position and `CloseReport.auditLastSeq`, the presented definition on `requested` and `rejected` records (CCR-BR-014)<br>0.8 (2026-10-03): A parked stop does not count against `awaitIdle`; acceptance checks 23 (children removed as dependents) and 41 (`crypto.getRandomValues()`, the one `IdGenerator` exemption) follow their behaviours (consistency pass) (CCR-BR-013)<br>0.7 (2026-10-03): A held step counts against `awaitIdle`; acceptance check 6 extended (prototype finding G33) (CCR-BR-012)<br>0.6 (2026-10-02): The scheduling seam; `pending` at a settlement point; `awaitIdle` on a TestHost; the scope-close path runs on its own; faults through the TestHost's entry points; acceptance checks 53–54, check 52 extended (prototype findings G27–G32) (CCR-BR-011)<br>0.5 (2026-10-02): Acceptance checks 49–52 from the P4 prototype findings G19–G25 (CCR-BR-010)<br>0.4 (2026-10-02): Deterministic pending order, `pending` and `stepPlugin`; `PendingStep` owner, waiter and correlation; acceptance checks 45–48, check 45 split in two tests, check 33 reworded (CCR-BR-008)<br>0.3 (2026-10-02): Acceptance checks 43–45 for cross-plugin stop ordering (CCR-BR-006)<br>0.2 (2026-10-02): Consistency fixes from independent review (CCR-BR-002)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001) |

---

A lifecycle library is tested at its races: a removal that meets a lease, a
build that outlives a dependency, a cleanup that fails during shutdown. Tests
of those races are only worth having if they give the same answer every time.
`@bridger/core/testing` provides a deterministic host for that purpose — a
steppable reconciler, time from the test clock, identifiers from a counter,
and injectable faults — plus two fixtures, an in-memory `AuditSink` and a
scripted `OperationGate`, for testing the GxP hooks of files 22–25. This file
converts SPEC.md "Testing the core" and the testing consequences of the GxP
hooks. This file owns BEH-BR-177–184 and uses all eight.

Planned source: `packages/core/src/testing/TestHost.ts` and
`packages/core/test/` *(Planned)*. Nothing in this file claims that any test
has been written or run; the acceptance checks below are what the suite is
required to contain. How executed test results become qualification evidence
is governed by [ADR-BR-035](../decisions/035-evidence-from-executed-tests.md).

## BEH-BR-177: TestHost is a Host with deterministic scheduling

> **See:** [ADR-BR-026](../decisions/026-deterministic-test-host.md)
> **Satisfies:** [URS-BR-019](../urs.md#urs-br-019-test-plugin-lifecycles-deterministically-with-injected-faults)

```ts
// illustrative — not type-checked
// import { TestHost, Fault } from "@bridger/core/testing"
interface TestHost extends Host {
  readonly step: Effect.Effect<boolean>                  // false when nothing can progress without the clock
  readonly stepPlugin: (ref: PluginRef) => Effect.Effect<boolean>   // advance the first pending item whose pluginId is that plugin
  readonly pending: Effect.Effect<ReadonlyArray<PendingStep>>       // pending items, in step order
  readonly runUntilIdle: Effect.Effect<HostSnapshot>
  readonly inject: (fault: Fault) => Effect.Effect<void, never, Scope.Scope>
}

interface PendingStep {
  readonly kind: "build" | "stop" | "wait"   // a transition step, or a wait of a call or cascade
  readonly pluginId: string                  // the plugin stepped; for "wait", the plugin waited on
  readonly realm: string
  readonly waiter?: string                   // for "wait" only: the plugin whose call or cascade waits
  readonly owner: string                     // the operation or system transition it belongs to, e.g. "remove", "dependency-loss"
  readonly correlationId?: string            // the owner's, when the owner is an operator call
  readonly parked: boolean                   // a parked stop: not advanced by `step` (BEH-BR-178)
}

TestHost.make(options?: BridgerOptions): Effect.Effect<TestHost, never, Scope.Scope>
TestHost.layer(options?: BridgerOptions): Layer.Layer<Bridger.Host>   // provides TestHost as Bridger.Host
```

```
REQUIREMENT: `TestHost` MUST implement the full `Host` contract of files
             02–20 and 22–25. A behaviour that holds for a host made by
             `Bridger.make` MUST hold for a `TestHost`, apart from the
             scheduling rule of BEH-BR-178.
```

```
REQUIREMENT: `TestHost`, `Fault` and the fixtures of BEH-BR-181 and BEH-BR-182
             MUST be exported only from the `@bridger/core/testing` entry
             point, never from `@bridger/core`.
```

```
REQUIREMENT: The production host MUST contain no fault-injection hook, test
             switch or alternate scheduling path. `TestHost` MUST reach its
             determinism through the same services a consumer can replace
             (`Clock`, `IdGenerator`) and through owning the reconciler's
             scheduling, not through branches inside the production path.
```

```
REQUIREMENT: The host MUST run every transition step and every wait of
             BEH-BR-178 through one internal scheduling interface. The
             production host's implementation MUST run each at once;
             `TestHost` supplies one that holds each until stepped. The
             interface MUST NOT be exported from `@bridger/core`.
```

**Settled here.** "No alternate scheduling path" and "`TestHost` owns the
scheduling" are reconciled by a seam that the production path always goes
through: the production host does not branch on whether it is being tested,
it hands each step to a scheduler that runs it at once. The host-core
prototype built `TestHost` this way (URS gap G30, CCR-BR-011).

A test host that runs different code from the production host tests the
wrong thing. Keeping the difference to scheduling and injected services keeps
a passing `TestHost` test meaningful for `Bridger.make`.

## BEH-BR-178: The reconciler is steppable

> **See:** [ADR-BR-026](../decisions/026-deterministic-test-host.md)
> **Satisfies:** [URS-BR-019](../urs.md#urs-br-019-test-plugin-lifecycles-deterministically-with-injected-faults)

```
REQUIREMENT: In a `TestHost`, transitions MUST NOT advance on their own.
             Operations record their intent as usual (and, with a sink wired,
             their `requested` record), and the resulting transitions advance
             only when the test calls `step` or `runUntilIdle`.
```

```
REQUIREMENT: The `TestHost` MUST keep a total, deterministic order over its
             pending items — pending transition steps (one build, or one
             stop, of one plugin) and pending waits (of a call or a cascade,
             on a transition step, a drain or the call order of
             22 — Attributable Operations): items are ordered by the arrival
             of the call or transition that created them, and ties are
             broken by (realm, id) of the plugin. Builds made ready together
             MUST follow the ready-set order of 05 — Activation. `pending`
             MUST return the items in that order.
```

```
REQUIREMENT: `step` MUST advance exactly one pending item — the first in
             that order that can make progress — to its next settlement
             point: a published state change, the end of a wait, or a
             suspension on the clock or on a lease. It MUST return `false`
             when no item can make progress without advancing the clock. A
             parked stop MUST NOT be advanced by `step`; it advances only
             when a call, a cascade or shutdown resumes it.
```

```
REQUIREMENT: `stepPlugin(ref)` MUST do what `step` does, restricted to the
             first item in that order whose `pluginId` is the named plugin,
             and MUST return `false` when no such item can make progress
             without advancing the clock.
```

```
REQUIREMENT: Each `PendingStep` MUST describe its item: for a transition step,
             `pluginId` is the plugin stepped; for a wait (`kind` "wait"),
             `pluginId` is the plugin waited on and `waiter` names the plugin
             whose call or cascade waits. `owner` MUST name the operation or
             system transition the item belongs to, and `correlationId` MUST
             be the owner's, present exactly when the owner is an operator
             call.
```

```
REQUIREMENT: `runUntilIdle` MUST call `step` until it returns `false`, and
             return the snapshot at that point.
```

```
REQUIREMENT: `pending` MUST be read at a settlement point, as `step` is: a
             transition that an operation started before `pending` was
             called MUST be listed.
```

```
REQUIREMENT: `awaitIdle` on a `TestHost` MUST keep the meaning of
             05 — Activation, BEH-BR-040: it waits for an idle revision,
             which a `TestHost` reaches only through steps. Every pending
             transition step that is not a parked stop counts as a
             transition, whether or not an operation is in flight on its
             plugin. Documentation
             MUST state that a test awaiting it in its own fiber, without
             stepping, waits for ever, and that `runUntilIdle` is the
             stepping form.
```

```
REQUIREMENT: Once the scope of a `TestHost` begins to close, its pending
             and later transitions MUST advance without steps, so that the
             scope-close shutdown (12 — Shutdown and Hosting, BEH-BR-108)
             completes. Documentation MUST state that drain and shutdown
             limits still read `TestClock`, so a lease still held when the
             scope closes holds the close until the test's clock advances.
```

```
REQUIREMENT: The `concurrency` limit MUST still hold: the number of builds
             started and not yet settled (including builds suspended on the
             clock) MUST never exceed it. Stops take no slot
             (05 — Activation, BEH-BR-034).
```

A test that awaits a mutating call forks it, steps the host, and then joins
it. That is more ceremony than calling the operation directly, and it is the
point: every interleaving a test exercises is one the test chose.

**Settled here.** A settlement point is a property of observable state, but
detecting one needs the host to know when its own fibers have nothing left
to run, which Effect does not report. The host-core prototype polls the
observable state until it stops changing; a real implementation should track
the host's own runnable work instead (URS gap G29). The test's scope closing
cannot be stepped — its finalizers run after the test body — which is why
transitions then run on their own (URS gaps G27 and G28, CCR-BR-011).

**Settled here.** SPEC.md names `step` and `runUntilIdle` but not what one
step is. A step ends at the next point where something observable happens
(a revision) or where nothing can happen without the test's say (the clock, a
held lease), so one test script always produces one sequence of revisions.
Since operations on different plugins no longer share one host-wide order
(08 — Operation Legality, BEH-BR-078), several transition steps and waits
can be pending at once; the arrival order with a (realm, id) tie-break makes
`step` pick among them the same way on every run, and `pending` and
`stepPlugin` let a test that needs a particular interleaving — a cascade that
meets a dependent's build, say — choose it explicitly (CCR-BR-008).

## BEH-BR-179: Time comes from TestClock and identifiers from a counter

> **Invariant:** [INV-BR-024](../invariants.md#inv-br-024-time-and-identifiers-come-only-from-services)
> **See:** [ADR-BR-025](../decisions/025-deterministic-time-and-ids.md), [ADR-BR-026](../decisions/026-deterministic-test-host.md)
> **Satisfies:** [URS-BR-027](../urs.md#urs-br-027-reproduce-time-and-identifiers-during-validation), [URS-BR-019](../urs.md#urs-br-019-test-plugin-lifecycles-deterministically-with-injected-faults)
> **Risk:** [RSK-BR-007](../gxp/03-risk-assessment.md#rsk-br-007)

```ts
TestHost.counterIdGenerator(prefix?: string): Layer.Layer<IdGenerator>   // "test-1", "test-2", ...
```

```
REQUIREMENT: A `TestHost` MUST read every time — build and drain timeouts,
             stall warnings, health-check schedules, event timestamps,
             audit timestamps, durations — from Effect's `Clock`, run under
             `TestClock`, so that time advances only when the test adjusts
             it.
```

```
REQUIREMENT: Unless the test supplies its own `IdGenerator`, a `TestHost`
             MUST use a counter `IdGenerator` that returns `prefix + n`
             (default prefix "test-", n from 1, in call order). The host id
             MUST be the first identifier drawn. Each `TestHost` MUST have
             its own counter, so its values are unique within it
             (24 — Time, Identifiers and Sequence, BEH-BR-210).
```

```
REQUIREMENT: Documentation of `counterIdGenerator` MUST state that two
             `TestHost`s with one prefix draw the same values, so tests whose
             hosts write to one sink, or whose records are compared as one
             trail, MUST give each host a distinct prefix; that a counter is
             never a production generator (validation plan §5.1, check 5);
             and that a prefix MUST be non-empty, since an empty prefix
             makes the values bare numbers that a second, unprefixed
             counter repeats.
```

```
REQUIREMENT: Two runs of the same test script against a `TestHost` MUST
             produce identical snapshots, identical event sequences, and —
             when a sink is wired — identical audit record sequences, field
             for field.
```

Within one `TestHost` the counter meets the uniqueness rule of BEH-BR-210
by construction; across `TestHost`s it meets it only through distinct
prefixes, which is why the default prefix is stated as a limit rather than
hidden (CCR-BR-033).

The reproducibility requirement is the one validation depends on: an executed test whose
records can be reproduced is evidence; one whose records differ on every run
(random ids, wall-clock timestamps) can only ever be compared approximately.
The production `IdGenerator` and clock rules are in
[24 — Time, Identifiers and Sequence](./24-time-ids-and-sequence.md).

## BEH-BR-180: Faults are injected, scoped and visible as faults

> **See:** [ADR-BR-026](../decisions/026-deterministic-test-host.md)
> **Satisfies:** [URS-BR-019](../urs.md#urs-br-019-test-plugin-lifecycles-deterministically-with-injected-faults)
> **Risk:** [RSK-BR-016](../gxp/03-risk-assessment.md#rsk-br-016)

```ts
Fault.buildFails(ref: PluginRef): Fault
Fault.stopFails(ref: PluginRef): Fault
Fault.holdLease(ref: PluginRef): Fault
Fault.runtimeFailure(ref: PluginRef): Fault
Fault.loadFails(ref: PluginRef): Fault            // lazy registrations (27)
Fault.handoffFails(ref: PluginRef, step: "export" | "upgrade" | "import",
                   how: "fail" | "delay" | "hang"): Fault   // state handoff (34)
```

```
REQUIREMENT: A fault MUST be active from `inject(fault)` until the scope
             passed to `inject` closes.
```

```
REQUIREMENT: While active:
             - `buildFails(ref)`: every build of that plugin MUST fail, and
               the plugin MUST end `failed` with phase `build`;
             - `stopFails(ref)`: closing that plugin's activation scope MUST
               fail, and the plugin MUST end `failed` with phase `cleanup`
               (with `CleanupError` to the operation's caller);
             - `holdLease(ref)`: whenever the plugin is `active`, the test
               host MUST hold a lease on every service it provides, released
               only by revocation or by the fault's scope closing;
             - `runtimeFailure(ref)`: the plugin MUST receive one runtime
               failure — at injection if it is `active`, otherwise at its
               next activation;
             - `loadFails(ref)`: the next `load` of that lazy registration
               MUST fail, and the plugin MUST end `failed` with phase
               `load` (`LoadFailed`) and publish nothing
               (27 — Manifest and Lazy Activation, BEH-BR-246);
             - `handoffFails(ref, step, how)`: that step of the plugin's
               state handoff MUST fail, be delayed past `handoffTimeout`,
               or hang, and the outcome MUST be the cold start or failed
               activation 34 — State Handoff specifies for it, with its
               record (BEH-BR-349, BEH-BR-350, BEH-BR-351).
```

```
REQUIREMENT: Every injected failure MUST carry a message that identifies it
             as injected (for example "injected fault: buildFails"), so that
             a test failure caused by a real defect cannot be mistaken for an
             expected fault.
```

```
REQUIREMENT: An injected fault MUST travel the same path as the real failure
             it imitates: the same state, events, audit records and errors.
```

```
REQUIREMENT: A fault MUST apply to plugins installed through the
             `TestHost`'s own `install`, `replace` and `reconcile`. Whatever
             it adds to a definition MUST keep one definition object per
             (definition, realm), so that `reconcile` still finds the same
             definition the same (18 — Reconciliation and Confluence,
             BEH-BR-154). Documentation MUST state that a child mounted by
             `Plugin.Runtime.install` is outside a fault's reach.
```

**Settled here.** SPEC.md names the four faults without their duration.
`buildFails`, `stopFails` and `holdLease` are conditions that last while
their scope is open, because the checks that need them (retry after a fixed
build, a drain that times out) depend on turning them off. `runtimeFailure`
is an event, so it fires once.

## BEH-BR-181: An in-memory AuditSink fixture, for tests only

> **See:** [ADR-BR-030](../decisions/030-audit-sink-port.md), [ADR-BR-026](../decisions/026-deterministic-test-host.md)
> **Satisfies:** [URS-BR-025](../urs.md#urs-br-025-generate-qualification-evidence-from-executed-tests)
> **Risk:** [RSK-BR-018](../gxp/03-risk-assessment.md#rsk-br-018)

```ts
TestHost.memoryAuditSink(options?: {
  // Decides what each write attempt does. Default: "store".
  readonly behave?: (attempt: number, record: AuditRecord) =>
    | "store"            // keep the record, succeed
    | "fail"             // keep nothing, fail with AuditWriteFailed
    | "die"              // keep nothing, die
    | "hang"             // keep nothing, never complete
    | "store-and-hang"   // keep the record, never complete
}): Effect.Effect<{
  readonly layer: Layer.Layer<AuditSink>
  readonly records: Effect.Effect<readonly AuditRecord[]>   // stored records, in the order received
  readonly attempts: Effect.Effect<number>
}, never, Scope.Scope>
```

```
REQUIREMENT: `memoryAuditSink` MUST be documented, in its type
             documentation and in every guide that mentions it, as a test
             fixture: it keeps records in process memory, unbounded, for the
             life of the test scope, and offers no storage, retention,
             durability, access control or review.
```

```
REQUIREMENT: `memoryAuditSink` MUST treat a write of a record equal to one
             it has already stored under the same `recordId` as idempotent —
             it succeeds and stores nothing new — and MUST keep a different
             record under a stored `recordId` beside the first, as 23 — Audit
             Sink and Record requires of every sink (BEH-BR-193).
```

```
REQUIREMENT: Its `behave` outcomes MUST let a test reach every audit path of
             23 — Audit Sink and Record and 24 — Time, Identifiers and
             Sequence: a refused write, a dying sink, a write that exceeds
             `auditTimeout`, and a write whose outcome is unknown to core.
```

The fixture exists so that the GxP hooks can be tested without a consumer's
storage. It is not a starting point for one. A regulated deployment that
wired it would have an audit trail that vanishes on restart — and because it
is not exported from `@bridger/core`, wiring it requires importing the
testing entry point, which a review of production imports will show.

## BEH-BR-182: A scripted OperationGate fixture, with no implicit decision

> **See:** [ADR-BR-032](../decisions/032-operation-gate.md), [ADR-BR-026](../decisions/026-deterministic-test-host.md)
> **Satisfies:** [URS-BR-025](../urs.md#urs-br-025-generate-qualification-evidence-from-executed-tests)
> **Risk:** [RSK-BR-014](../gxp/03-risk-assessment.md#rsk-br-014), [RSK-BR-018](../gxp/03-risk-assessment.md#rsk-br-018)

```ts
TestHost.scriptedGate(
  decide: (request: OperationRequest, index: number) =>
    | "allow"
    | { readonly refuse: string }   // fail with OperationRejected and this reason
    | "die"
    | "hang"
): Effect.Effect<{
  readonly layer: Layer.Layer<OperationGate>
  readonly requests: Effect.Effect<readonly OperationRequest[]>   // every request received, in order
}>
```

```
REQUIREMENT: `scriptedGate` MUST require its `decide` function. There MUST be
             no overload, default or constant that allows every request.
```

```
REQUIREMENT: `scriptedGate` MUST be documented as a test fixture: it records
             requests so that tests can assert what the gate saw, and it is
             not an approval mechanism.
```

Core provides no default `OperationGate`, not even a permissive one
([25 — Operation Gate](./25-operation-gate.md)), because an allow-all gate
is a control that does nothing and looks like one. A testing helper that
offered `scriptedGate.allowAll` would be that same object one import away.
Making the test write its decision — even `() => "allow"` — keeps the
permissiveness visible in the test that relies on it.

### Policy, call-log, refusal-list and gate fixtures (files 28, 29, 32)

```ts
TestHost.scriptedAccessPolicy(
  decide: (request: AccessRequest, index: number) => AccessDecision
): Effect.Effect<{ readonly layer: Layer.Layer<AccessPolicy>; readonly requests: Effect.Effect<readonly AccessRequest[]> }>
TestHost.scriptedCapabilityPolicy(
  resolve: (request: ResolutionRequest, index: number) => Grant | { readonly refuse: string } | "die" | "hang"
): Effect.Effect<{ readonly layer: Layer.Layer<CapabilityPolicy>; readonly requests: Effect.Effect<readonly ResolutionRequest[]> }>
TestHost.memoryCallLog(options?: {
  readonly behave?: (attempt: number, entry: CallEntry) => "store" | "fail" | "die" | "hang"
  readonly onFailure?: "drop" | "refuse"                  // the port's failure policy (29, BEH-BR-279); default "drop"
  readonly queue?: number                                 // hand-off queue capacity (29, BEH-BR-279)
}):
  Effect.Effect<{ readonly layer: Layer.Layer<CallLog>; readonly entries: Effect.Effect<readonly CallEntry[]> }, never, Scope.Scope>
TestHost.scriptedGateOf<Req>(
  decide: (request: Req, index: number) => GateDecision<Req> | "die" | "hang"
): Effect.Effect<{ readonly gate: Gate<Req>; readonly requests: Effect.Effect<readonly Req[]> }>
TestHost.heldHandoff(ref: PluginRef): Effect.Effect<Option.Option<unknown>>   // the held value of a replace in progress (34)
TestHost.scriptedRefusalList(
  refused: (subject: RefusalSubject, index: number) => Option.Option<string> | "die"
): Effect.Effect<{ readonly layer: Layer.Layer<RefusalList>; readonly subjects: Effect.Effect<readonly RefusalSubject[]> }>   // 28, BEH-BR-267
```

```
REQUIREMENT: The policy and gate fixtures MUST require their decision
             function, with no overload, default or constant that allows
             every request, as BEH-BR-182 requires of `scriptedGate`; they
             are the only helpers core offers for `AccessPolicy`
             (28 — Plugin Principal and Mandatory Policy, BEH-BR-264),
             `CapabilityPolicy` (29 — Capability Grants and Call Log,
             BEH-BR-273) and `Gate<Req>` (32 — Generic Gate and Plan,
             BEH-BR-313). `memoryCallLog` MUST be documented, like
             `memoryAuditSink`, as a test fixture that keeps entries in
             process memory for the test scope and is not a record store
             (BEH-BR-276). `heldHandoff` MUST be exported only from
             `@bridger/core/testing` (34 — State Handoff, BEH-BR-348).
             `scriptedRefusalList` MUST require its function, with no
             constant that refuses nothing, and MUST be documented as a test
             fixture, not a revocation feed (28, BEH-BR-267).
```

## BEH-BR-183: Required acceptance checks — the lifecycle core

> **See:** [ADR-BR-026](../decisions/026-deterministic-test-host.md), [ADR-BR-035](../decisions/035-evidence-from-executed-tests.md)
> **Satisfies:** [URS-BR-019](../urs.md#urs-br-019-test-plugin-lifecycles-deterministically-with-injected-faults), [URS-BR-025](../urs.md#urs-br-025-generate-qualification-evidence-from-executed-tests)

```
REQUIREMENT: The core test suite MUST contain at least one test, run against
             a `TestHost` unless the check concerns `Bridger.make` itself,
             for each of the following:
             1. Dependents stop before providers, and providers are usable
                from dependents' finalizers.
             2. A removal waits for leases, fails with `DrainTimeout` at the
                limit, and succeeds with `force`, interrupting callbacks with
                `LeaseRevoked`.
             3. A callback that removes its own provider fails with
                `WouldDeadlock`.
             4. Every cell of both tables of 08 — Operation Legality — the
                state × operation table (BEH-BR-071) and the in-flight
                operation table (BEH-BR-072) — including joins,
                supersession, conflicts, no-op successes and interrupted
                callers, and an operator call that meets a running system
                stop of each reason, an idle return included, waits for it
                and is decided against where it landed (BEH-BR-073).
             5. A background fiber failure and a failing health check each
                move the plugin to `failed` (phase `runtime`) after stopping
                dependents.
             6. Builds respect `concurrency`, dependency order and
                `buildTimeout`; `awaitIdle` times out when it must, and
                does not return while a transition step is requested and
                not yet begun.
             7. A configuration decode failure fails activation without
                publishing; `reconfigure` restarts dependents.
             8. Shutdown reports cleanup failures and forced plugins;
                closing the scope runs the same path. Once shutdown begins
                no plugin enters `starting` and no build begins: a
                `waiting` plugin whose provider returns stays `waiting`, a
                plugin whose build is queued is unregistered without a
                stop step or a record of its own, and a build
                in flight settles and is discarded; every stop ends "gone",
                or `failed` with phase "cleanup" when its cleanup fails;
                plugins with nothing to stop are unregistered in the first
                revision; the final snapshot holds exactly the plugins
                `failed` with phase "cleanup" (BEH-BR-105, BEH-BR-109).
             9. `install` rejects duplicate ids, duplicate providers and
                cycles without registering anything; `replace` validates
                before stopping and leaves the running plugin untouched on
                `ReplaceError`; a replace that drops a provided key sends
                dependents to `waiting`, except a dependent whose own stop
                fails its cleanup, which ends `failed` (BEH-BR-041).
             10. A `failed` plugin stays `failed` through dependency loss and
                 return; `retry` lands in `starting` or `waiting` according
                 to requirements.
             11. `KeyMismatch` fails activation when two key objects share a
                 `ServiceId`.
             12. Interrupting a caller inside `use` interrupts the child,
                 awaits its finalizers, then releases the lease; the child
                 inherits the caller's fiber references.
             13. `reconfigure` with and without a value, `retry` and
                 `replace` follow the source and override rules;
                 `ConfigInvalid` on `reconfigure` leaves the plugin running.
             14. A health check in flight when the plugin leaves `active` is
                 interrupted and not counted.
             15. A slow `events` subscriber that overflows the buffer
                 observes a gap in `seq`, never silent reordering.
             16. Restarting a plugin runs its layer build again (a fresh
                 memo map per activation); two layers inside one activation
                 that share a sub-layer build it once.
             17. A `Layer` base is built before and released after every
                 plugin; a base build failure fails `Bridger.layer`.
             18. `use` and `useAll` go through the same admission, drain and
                 revocation path as `lease`.
             19. `install` returns a handle: `awaitActive` resolves on
                 activation, fails fast on `failed`, and fails with
                 `PluginRemoved` on removal.
             20. Hosting through `ManagedRuntime`: the build is forced
                 before the client is ready, and dispose runs `shutdown()`
                 first so the `CloseReport` is not lost.
```

These are SPEC.md's required behaviours, numbered so that the traceability
matrix can point at each one. A check that is listed here and has no executed
test is a gap in the evidence, and it must be reported as such rather than
covered by a test of something nearby.

## BEH-BR-184: Required acceptance checks — extensions and GxP hooks

> **See:** [ADR-BR-026](../decisions/026-deterministic-test-host.md), [ADR-BR-035](../decisions/035-evidence-from-executed-tests.md)
> **Satisfies:** [URS-BR-019](../urs.md#urs-br-019-test-plugin-lifecycles-deterministically-with-injected-faults), [URS-BR-025](../urs.md#urs-br-025-generate-qualification-evidence-from-executed-tests), [URS-BR-027](../urs.md#urs-br-027-reproduce-time-and-identifiers-during-validation)
> **Risk:** [RSK-BR-018](../gxp/03-risk-assessment.md#rsk-br-018)

```
REQUIREMENT: The core test suite MUST also contain at least one test for each
             of the following:
             21. `ContributionRegistry`: collisions, ordering by priority
                 then id, removal waiting on `use` and revoking at
                 `drainTimeout`.
             22. `Generation`: `drain` fails with `DrainTimeout` and succeeds
                 with `force`, revoking `acquire` and `use` holders; several
                 retired values drain independently; `changes` delivers the
                 current revision first, then each publication after its
                 step and each admission change, latest-wins without
                 regression; `view` offers no publish, admission or drain
                 (20 — Generation, BEH-BR-169, BEH-BR-170).
             23. Child plugins are removed with their parent, as its
                 dependents, in reverse dependency order and before the
                 parent's scope begins to close; a failing child leaves the
                 parent running; group operations are atomic.
             24. `optional` services never gate activation or appear in
                 `missingServiceIds`; `useOptional` returns `None` when
                 unavailable; `whenAvailable` runs, is interrupted and re-runs
                 as providers leave and return without changing plugin state,
                 and closes its scope before the provider; `optional`,
                 `useOptional` and `whenAvailable` on a key not listed in
                 `optional` — listed only in `requires`, or not at all —
                 return `None` or never run, with a warning
                 (BEH-BR-130, BEH-BR-132).
             25. Events: each dispatch mode, priority and `prepend` order,
                 listener removal with its plugin, `emit` isolating listener
                 failures, `parallel` failing on the first typed failure, and
                 a typed listener mismatch failing to compile.
             26. Realms: an isolated key resolves only inside its realm; the
                 same definition installs in two realms; provider slots and
                 cycles are per resolution scope; a plugin in a realm that
                 isolates a base key provides it there, and fails with
                 `DuplicateProvider` ("base") where the key resolves in the
                 default realm; `defineRealm` refuses to isolate
                 `Bridger.Host` or `Bridger.Events` with `InvalidRealm`;
                 interceptions wrap per consumer in the fixed order without
                 changing leases; a throwing `wrap` fails an activation, makes
                 `optional` and `useOptional` die without delivering the
                 service, and fails a `whenAvailable` run under its
                 `onFailure` policy (BEH-BR-012, BEH-BR-145, BEH-BR-152).
             27. `disable` keeps definition and configuration and frees the
                 provider slot; `enable` re-validates and reports the first
                 failing check in the order of BEH-BR-018; `replace` of a
                 disabled plugin runs only the disabled-install checks and
                 reserves no slot; `restart` keeps the override and restarts
                 dependents (BEH-BR-050, BEH-BR-062).
             28. A volatile-only `reconfigure` publishes to
                 `Plugin.Config.changes` without a state change; a mixed
                 change restarts.
             29. `reconcile` is idempotent, prunes only plugins it owns,
                 reports per-entry rejections, and gives the same result
                 from different histories. This check also covers
                 `Desired.overlay`: patches merge by (id, realm) in order,
                 later wins, `config` merges deeply, and the inputs are not
                 mutated.
             30. `inspect` returns names and counts only; a plugin `waiting`
                 past `stallWarning` yields one `plugin-stalled` event.
             31. Attribution: an unattributed or reason-less call under
                 `attribution` fails before any record or change; a per-call
                 context wins over `CurrentActor`.
             32. Call order: a call failing validation reaches neither the
                 gate nor the sink; the gate sees a request before any
                 `requested` record; a refusal — including a gate that dies
                 or exceeds `gateTimeout` — writes one `rejected` record and
                 changes nothing; a `requested` write failure or timeout
                 fails with `AuditUnavailable` and changes nothing.
             33. Exactly one `requested` and one terminal record per
                 call that passed step 6, including joins, supersession,
                 no-ops, interrupted callers and reconcile entries.
             34. A failed terminal or system write sets the latch, emits
                 `audit-degraded`, refuses operator mutations, allows
                 `shutdown` and `acknowledgeAuditDegraded`; acknowledgement
                 requires a reason and a writable sink.
             35. `auditSeq` is contiguous from 1; a failed or timed-out write
                 is retried with the same `recordId` and `auditSeq`, so no
                 number is skipped; a timed-out write that reached the sink
                 does not produce a duplicate with an idempotent sink.
             36. `verifyAuditSequence` reports gaps, duplicates and
                 out-of-order records, and is documented as not being tamper
                 evidence.
             37. No configuration value — including a `Redacted` canary —
                 appears in any audit record, gate request, event, log or
                 snapshot.
             38. With no sink and no gate wired, every outcome, snapshot and
                 event equals the outcome of the same script run with a
                 `memoryAuditSink` that accepts every write and an allow-all
                 `scriptedGate(() => "allow")` fixture wired, except
                 `HostSnapshot.audit`.
             39. System transitions are recorded with `Actor.system` and the
                 `causationId` of their cause; they are never gated.
             40. `reconcile` consults the gate once per entry action, and a
                 refused entry appears in `ReconcileReport.rejected`.
             41. No source file of the core reads `Date.now()`,
                 `performance.now()`, `crypto.randomUUID()`,
                 `crypto.getRandomValues()`, `Math.random()` or an
                 argument-less `new Date()`, except `crypto.randomUUID()`
                 inside the default `IdGenerator` implementation (a static
                 check; 24 — Time, Identifiers and Sequence, BEH-BR-211). That
                 is the only exemption: the default `Clock` is Effect's own
                 implementation, not a file of the core.
             42. `OperationRequest` and audit records carry the
                 definition's `version` and `digest`; a gate can refuse a
                 definition by its digest (25 — Operation Gate,
                 BEH-BR-219; 23 — Audit Sink and Record, BEH-BR-196).
             43. While a stop of one plugin waits on a lease, an operation
                 on an unrelated plugin completes without waiting, and a
                 lease callback that calls a mutating operation either
                 fails at once with `WouldDeadlock` or proceeds without
                 waiting for the drain (08 — Operation Legality,
                 BEH-BR-078).
             44. A provider's removal that meets an operator operation in
                 flight on a dependent waits for the dependent's step only:
                 the dependent's scope closes once, its operation completes
                 for its own caller, and its rebuild does not capture the
                 removed provider (BEH-BR-079).
             45. Two tests of a provider's removal that meets a dependent
                 whose operation is parked (BEH-BR-080). (a) The removal
                 resumes the dependent's stop under the removal's options,
                 and the resumed drain succeeds: the dependent lands
                 `waiting` (or `starting` when another provider is
                 available), the parked intent ends without its remaining
                 actions, and an `intent-ended` record caused by the
                 removal's `requested` record carries `endsIntentOf` naming
                 the parked call's `requested` record. (b) The resumed drain
                 expires again without `force`: the removal fails with
                 `DrainTimeout { id, target }`, `id` naming the dependent and
                 `target` the removed plugin; the dependent stays `stopping`
                 as a parked system stop with `reason` "dependency-loss",
                 `parked` true and `next` the dependency-loss destination;
                 and the `intent-ended` record was already written when the
                 removal resumed the stop.
             46. Interruption records: a caller interrupted while the gate
                 decides gets the `rejected` record ("caller-interrupted")
                 and changes nothing; one interrupted after its `requested`
                 record and before its intent ends `failed` with
                 `error._tag` "Interrupted" and changes nothing; when the
                 interruption comes while the `requested` record is still
                 being written, no `AuditUnavailable` record follows it,
                 and an `auditTimeout` that expired first ends the call with
                 `AuditUnavailable` instead; one interrupted after its intent
                 ends only its wait, and the transition completes
                 (BEH-BR-188, BEH-BR-067).
             47. Parked operations: a call that joins or supersedes a
                 parked operation resumes it and writes its own terminal
                 record, carrying `resumes` set to the parked call's
                 `requested` record, and the parked call writes nothing more;
                 `retry` and `enable` on a plugin whose system stop is parked
                 fail with `Conflict` "dependency-loss"; a cascade rooted in
                 a runtime failure revokes on expiry and never parks; a
                 parent's stop removes a child that has a parked operation
                 (BEH-BR-072, BEH-BR-073, BEH-BR-074, BEH-BR-080,
                 BEH-BR-095, BEH-BR-125).
             48. Re-entrancy and cascade limits: a `build` that calls
                 `restart` on its own plugin, and a finalizer that calls
                 `remove` on its plugin's provider, each fail with
                 `WouldDeadlock`; a cascade that waits on another call's
                 transition step running under `drain: "forever"` fails with
                 `DrainTimeout` when its own drain limit expires (BEH-BR-088,
                 BEH-BR-079, BEH-BR-085).
             49. Capture at build begin: a `starting` plugin whose
                 provider is hidden by an operation before its build begins
                 returns to `waiting` and is not `failed`; a stop of a
                 `starting` plugin whose build holds no slot completes
                 without waiting for one; and seeded random operation
                 histories, with racing operations, across realms, optional
                 dependencies and a parent with a child, settle to the
                 snapshot of a direct install of the final set, lazy
                 registrations compared with `dormant` and `active` as one
                 class and eager ones exactly (05 —
                 Activation, BEH-BR-034, BEH-BR-035; 18 — Reconciliation and
                 Confluence, BEH-BR-160).
             50. A child's lifetime edges: a mount attempted by a fiber of
                 the parent after the parent's stop began fails with
                 `Conflict` and registers nothing; a child whose drain
                 expires under its parent's removal shows `parked` true and
                 `next` "gone", a `restart` of it fails with `Conflict`
                 "remove", and a forced removal of the parent removes it
                 (14 — Children and Groups, BEH-BR-121, BEH-BR-125).
             51. Child and group records: a mount's `system-start` record
                 carries the child's registration state — `starting`,
                 `waiting` or `disabled` — and is caused by the
                 record that began the parent's activation; the child's
                 activation that begins in the mount's revision is caused by
                 the mount record; a group whose member fails its install
                 checks is `failed` with phase "build" and keeps no member
                 mounted (BEH-BR-126, BEH-BR-128).
             52. A listener whose plugin is removed during a `serial`
                 dispatch — while it runs, or before its turn — fails the
                 dispatch with a defect naming the event, and one cut off
                 under `emit` is not reported as `listener-failed`; a child
                 whose install options set `intercept` receives its realm's
                 interceptors and its own, not its parent's (16 — Event Bus,
                 BEH-BR-141, BEH-BR-142; 17 — Realms and Interception,
                 BEH-BR-151).
             53. A generation's forced drain interrupts the fiber that took
                 an `acquire` lease and fails a `use` callback with
                 `LeaseRevoked` after its finalizers; made inside an
                 activation, the generation reports the revocation as a
                 `lease-revoked` host event naming it (20 — Generation,
                 BEH-BR-172, BEH-BR-174).
             54. `TestHost` edges: `pending` lists the transition an
                 operation just started; `awaitIdle` completes only once the
                 test steps; a test that ends with pending items closes its
                 scope; and seeded random histories whose step order is
                 itself chosen at random settle to the snapshot of a direct
                 install of the final set on `Bridger.make` (BEH-BR-177,
                 BEH-BR-178; 18 — Reconciliation and Confluence,
                 BEH-BR-160).
             55. Configuration fingerprints: with a `ConfigFingerprinter`
                 wired, `install` with `config` and `reconfigure` with a
                 value compute fingerprints at step 4a, after validation and
                 before the gate; only the values of the paths `select`
                 returned are handed to `fingerprint`; the
                 `OperationRequest` and the call's records carry equal
                 `configChange` values, fingerprints included; a clear and a
                 system transition hand nothing to the port; and no actor,
                 reason or correlation reaches the port (22 — Attributable
                 Operations, BEH-BR-188; 23 — Audit Sink and Record,
                 BEH-BR-197; 25 — Operation Gate, BEH-BR-219).
             56. A fingerprinter that fails, dies, exceeds
                 `fingerprintTimeout` or answers malformed — a selection
                 outside the changed paths, a missing or extra path, a
                 fingerprint outside the format — fails the call with
                 `ConfigFingerprintUnavailable` before the gate: no record
                 is written, nothing changes, and the error's `message` is
                 written by core, not taken from the port (BEH-BR-188).
             57. `Host.controls` reports the host's wiring and limits; its
                 `auditPosition.lastWritten` follows the writer and never
                 decreases; it stays readable after the host closes; and the
                 `CloseReport` carries `auditLastSeq`, the highest `auditSeq`
                 written when the report is produced (12 — Shutdown and
                 Hosting, BEH-BR-106; 24 — Time, Identifiers and Sequence,
                 BEH-BR-212).
             58. The `requested` and `rejected` records of a
                 plugin-addressed operation carry the presented definition,
                 equal to `OperationRequest.definition`; its terminal records
                 do not (BEH-BR-195, BEH-BR-219).
             59. Contracts: a `ServiceId` without `@<major>`, with a major
                 other than `version`'s, a `version` outside the grammar or
                 empty `methods` makes `install`, `replace` and `enable`
                 fail with `InvalidDefinition`; `Contract.satisfies` and
                 `maxSatisfying` follow the table of BEH-BR-226 and return
                 `false`/`None` for input outside the grammar; a range
                 leaving the major fails with `InvalidDefinition`; a
                 contract's `key` is its `ServiceId` string and `serviceKey`
                 the key passed to `Contract.make`, also for a contract
                 built on a class key; `Contract.local` gives a contract
                 with `local` and `descriptor.local` true, one member per
                 listed name, no timeouts, and the same validity rules,
                 a repeated or empty member list making it invalid, while
                 `Contract.make` gives `local` false
                 (26 — Versioned Contracts, BEH-BR-225–227).
             60. `IncompatibleContract`: a dependent installed against a
                 registered provider whose version does not satisfy its
                 range; a provider installed, replaced or enabled under a
                 registered dependent it does not satisfy; a provider
                 missing a method of a dependent's older copy; a base
                 service with and without a `baseContracts` entry; the
                 first incompatible pair named; the check order of
                 BEH-BR-228; nothing registered; an `install` with
                 `disabled: true` never fails with `IncompatibleContract`
                 and its `enable` checks its pairs (BEH-BR-228).
             61. Two separately built copies of one contract at compatible
                 versions bind without `KeyMismatch`; a plain key against a
                 contract of another object fails with `KeyMismatch`; an
                 incompatible provider of an `optional` contract key is
                 absent to `useOptional` and `whenAvailable` and fails no
                 operation (BEH-BR-229).
             62. Manifests: a manifest that fails to decode, or disagrees
                 with its eager definition, fails with `InvalidDefinition`;
                 properties the schema does not name are kept and passed on
                 unchanged; `engines["@bridger/core"]` unsatisfied fails with
                 `IncompatibleEngine`; `consentDiff` classifies each field of
                 its table, reports other differences as unclassified, sets
                 `requiresConsent`, and is deterministic and non-mutating;
                 `methods` going from a list to absent is widened from
                 "list" to "all" and the reverse narrowed, and an egress
                 `purpose` change on an unchanged host is unclassified
                 (27 — Manifest and Lazy Activation, BEH-BR-241–243).
             63. A lazy definition installs as `dormant` with `load` never
                 called: its manifest's keys reserve slots
                 (`DuplicateProvider`), take part in cycle detection and in
                 contract checks; the `dormant` snapshot lists its triggers
                 and `lazy.loaded` false; every cell of the dormant row of
                 BEH-BR-247; `reconfigure` with a value on a registration
                 not yet loaded (`dormant`, `disabled` unloaded, `failed`
                 with phase "load") is not decoded at the call, records the
                 raw value's top-level keys as paths and hands a wired
                 fingerprinter form "raw"; a reference with `version` and no
                 `methods`, or a required reference with `range` and no
                 `version` or `version` and no `range`, fails with
                 `InvalidDefinition` (BEH-BR-241,
                 BEH-BR-244, BEH-BR-247).
             64. Triggers: an eager dependent registered while its provider
                 is dormant wakes it; a lazy dependent wakes its providers
                 only once woken; `wake` with `OnService`, `OnContribution`
                 and `OnEvent` reports the plugins it woke; an event
                 dispatch wakes plugins declaring it, and is delivered to
                 each only as the held event of check 96; `use`, `lease`, `useOptional`, `awaitActive`,
                 `restart`, `retry` and optional keys wake nothing
                 (BEH-BR-245).
             65. Loading: `load` runs in the build slot under
                 `buildTimeout`, with `loading` true; a failing, dying or
                 timed-out `load`, and a loaded definition differing from
                 its manifest in any compared field or whose `meta.digest`
                 differs from the digest supplied to `Plugin.lazy`, or a
                 loaded definition that breaks a rule of BEH-BR-003 — an
                 invalid `handoff` among them — leave the plugin
                 `failed` with phase "load" (`LoadFailed`,
                 `ManifestMismatch` naming the field, `InvalidDefinition`
                 naming the rule) and nothing published;
                 the failure is sticky and `retry` reloads, while `retry`
                 after a build failure of a loaded plugin does not; an
                 operation arriving during the load follows the `starting`
                 rows; a `lazy-triggered` record with its trigger and cause
                 precedes the `system-start` record (BEH-BR-246,
                 BEH-BR-248).
             66. `reconcile` of lazy entries calls no `load` and compares
                 lazy definitions by their identity `meta` (manifest
                 `version`, digest supplied beside or in the manifest), so
                 that a lazy definition built from a signed manifest without
                 `digest` loads and matches, and two digests at one version
                 are different definitions; the
                 gate request carries `definition.manifest` and, on
                 `replace`, `previousManifest`; no record carries a
                 manifest; `inspect` returns the manifest without loading;
                 shutdown unregisters dormant plugins without a stop step
                 and lists them in no `CloseReport` list (BEH-BR-247–249).
             67. A principal is minted per activation and read by plugin
                 code; a reference provided with the same identifier makes
                 the reader die with `PrincipalForged`; a principal used
                 after its activation ends dies with `PrincipalRetired`; a
                 finalizer that emits under a wired `AccessPolicy`, or
                 removes a child, does not die (retirement follows the
                 finalizers); a
                 listener runs under its owner's principal and a provider's
                 method under its caller's; `asSelf` switches to the
                 activation's own (BEH-BR-257, BEH-BR-258).
             68. A mutating call from plugin code carries `onBehalfOf` on
                 the `OperationRequest` and on its `requested`, `rejected`
                 or terminal record, and on each `reconcile` entry's
                 records; a call from application code carries none; no
                 option sets it; under `attribution.require` a plugin call
                 with no actor still fails with `Unattributed`; system
                 records carry none; a provider method serving consumer A
                 that mutates the host records `onBehalfOf` A, and records
                 the provider only inside `asSelf` (BEH-BR-258,
                 BEH-BR-259).
             69. Mandatory interceptions: a child mounted with
                 `intercept: []` still receives every inherited mandatory
                 wrapper; a child in another realm receives its own realm's;
                 the composition order of BEH-BR-261 holds; `Host.use`,
                 `useAll` and `lease` from application code and from plugin
                 code are wrapped by "all" interceptions and not by ordinary
                 ones; a throwing mandatory wrap fails the activation or
                 kills the call with the lease released (BEH-BR-260 to
                 BEH-BR-262).
             70. `allowChildren: false` refuses `Plugin.Runtime.install`
                 with `ChildNotAllowed`, registers nothing, writes no record
                 and publishes `child-refused`; a child cannot widen it; an
                 `AccessPolicy` denies listen, emit, contribute and child
                 requests as specified, a `child` request from a provider
                 method serving another plugin carries the parent
                 activation's principal, a throwing `decide` denies with
                 "policy-defect", and `Host.controls` reports the wiring;
                 with nothing wired, the suites of files 02–25 pass with
                 only the additive fields of BEH-BR-266 added to the values
                 they compare (BEH-BR-263 to BEH-BR-266).
             71. A wired `CapabilityPolicy` is consulted once per capture on
                 every route, never cached; a refusal fails a required
                 activation with phase `activation`, returns none for an
                 optional read, holds back a `whenAvailable` run, and fails
                 `use`, `useAll` and `lease` with `ResolutionRefused` with
                 the lease released; a dying, failing or slow policy is a
                 refusal; refusals on optional routes publish
                 `resolution-refused` (BEH-BR-273, BEH-BR-274).
             72. A grant naming members delivers an object whose ungranted
                 members die with `CapabilityDenied`; `Grant.all` adds no
                 layer when the policy declares no `changes`, and a
                 delegating layer when it does; the narrowed object exposes nothing the wrapped one
                 does not; leases are unaffected; a grant on `Bridger.Host`
                 withholds its mutating members (BEH-BR-275).
             73. A selected capture yields exactly one `CallEntry` per call,
                 including denied ones, with `Clock` timing, the caller's
                 actor and principal and no argument, result or message;
                 a failing or slow `record` changes no outcome and is
                 counted; `CurrentCall` is set only around intercepted
                 calls and a provided one dies with `PrincipalForged`; with
                 nothing wired, the suites of files 02–25 pass unchanged
                 (BEH-BR-276 to BEH-BR-278).
             74. Keys combine as declared; a monotonic key cannot be
                 replaced through the API nor removed by a supplied
                 `options.context`; a bag not made by core is treated as
                 empty; the three core keys have the shapes of BEH-BR-290
                 (BEH-BR-289, BEH-BR-290, BEH-BR-292).
             75. Propagation: a provider's method sees its caller's
                 annotations; builds, finalizers, background fibers, health
                 checks and `whenAvailable` runs start empty; listeners of
                 every dispatch mode see only "events" keys; the gate sees
                 only "gate" keys and the policy only "policy" keys; a
                 `Deadline` shortens the per-call timeout of `use` and
                 `useAll`, the gate and the policy with their own outcomes,
                 bounds no `use` without a timeout and no `lease`, and leaves
                 audit, drain, build and shutdown bounds unchanged; a served
                 call run inside `CallerContext.serve` sees the invoker's
                 actor and annotations and keeps the contributor's principal,
                 and a nested host call from it records both; `encode` of
                 the "wire" filter carries taint and provenance and never
                 the deadline, and `decode` rejects unknown keys and combines
                 into the receiver's bag (BEH-BR-291, BEH-BR-292,
                 BEH-BR-296).
             76. Records of a mutating call carry the "audit" keys,
                 encoded, sorted and equal on every record of the call;
                 system records carry none; an unencodable value, a
                 `Redacted` value or one beyond the limits is omitted and
                 named in `annotationsOmitted`; the entry records of a
                 `reconcile` carry the `reconcile` call's "audit" keys; call-log entries carry
                 "callLog" keys; no annotation appears in snapshots,
                 events or logs; with none set, the suites of files 02–29
                 pass unchanged (BEH-BR-293, BEH-BR-295).
             77. A hook point admits registrations only through the
                 application's rule over the principal's owner and labels; a
                 refused role registers nothing; results outside the role are
                 errors; order is priority then id whatever the activation
                 order; `who` runs before the registry's access check; a veto
                 registration on a hook point with empty `codes` is refused
                 (31 — Hook Points, BEH-BR-297, BEH-BR-298, BEH-BR-299).
             78. The first admitted veto decides and later veto hooks are not
                 run; codes outside the closed set and non-primitive params
                 are errors; enrich and advisory results are namespaced,
                 schema-checked, in view order, and never change the verdict
                 (BEH-BR-300, BEH-BR-301).
             79. Per-hook timeout and `onError` "deny" and "skip"; a
                 `policy` `Skip` is recorded as "skipped-policy", never denies
                 and never count toward the breaker; the dispatch returns
                 within its effective deadline (least of hook point, call and
                 context annotation) without waiting for finalizers; a hook
                 interrupted by that deadline is recorded "deadline" and does
                 not count toward its breaker; a breaker opens, half-opens
                 once, closes or reopens, is discarded with its contribution,
                 is published on `decisions` as a breaker record and not on
                 `Host.events`, and never changes plugin state or writes an
                 audit record; a contribution with no owner runs with no
                 principal; `settle` is called once per call `policy` let
                 run, with its outcome, also on timeout ("timeout"),
                 revocation ("revoked") and interruption by the dispatcher
                 or the deadline ("interrupted"), never for skipped or
                 denied contributions,
                 and its failure changes nothing (BEH-BR-302, BEH-BR-303,
                 BEH-BR-304, BEH-BR-306).
             80. Every dispatch yields one decision record naming the deciding
                 contribution, with no input, value, message or params; a
                 selector holds the chosen implementation for the call, fails
                 with `NoImplementation` when none is chosen, never fails
                 over, and never restarts a plugin (BEH-BR-305, BEH-BR-307,
                 BEH-BR-308).
             81. `Gate.run` calls `decide` once with only "gate"-flow
                 annotations, maps defects, timeouts and malformed drafts to
                 `Refuse`, returns the draft and its `draftId` unchanged, and
                 ends without a decision on caller interruption; `Gate.all`
                 consults in order, each piece bounded by its own `timeout`,
                 the first refusal wins, a deferral yields to a later
                 refusal; `Draft.check` reports every mismatch and
                 nothing else (32 — Generic Gate and Plan, BEH-BR-313,
                 BEH-BR-314, BEH-BR-316, BEH-BR-321).
             82. `OperationGate.fromGate`: `Defer` reaches the host as
                 `OperationRejected` with the defer reason and one `rejected`
                 record; with and without the adapter, every host scenario of
                 25 — Operation Gate produces identical records (BEH-BR-315).
             83. `Host.plan` equals the diff `reconcile` then applies,
                 including the recorded `configChange.paths` of a
                 `reconfigure` entry, decoded with the loaded definition's
                 schema, writes no record, consults no gate or
                 fingerprinter, emits no event and carries no value (its
                 rejections are `{ _tag, message }`, `_tag` the concrete
                 tag of the error — an `InstallError` member's own tag,
                 never "InstallError"); `reconcile` with
                 `expect` fails `PlanStale` with no record when stale at the
                 call — also when `configChange.paths` or the prune options
                 differ, `pruneDrain` and `pruneForce` counting only when
                 `prune` or `atomic` is true — with a
                 parent `failed` record when stale at the intent, and a
                 mismatch of `hostId`, `scope`, a prune option or `atomic`
                 carrying no `id` or `realm`, and
                 otherwise gates every entry (BEH-BR-317, BEH-BR-318,
                 BEH-BR-319, BEH-BR-320).
             84. A family creates a member once per key on first use through
                 attributed, gated, audited `defineRealm` and `reconcile`;
                 concurrent uses share one creation; invalid keys and changed
                 options are refused; a member is "ready" when every plugin
                 is `active`, `dormant` or disabled by an operator, so a
                 lazy or `disabled: true` entry does not hold creation
                 back, and a plugin disabled "refused-digest" fails it
                 ("rejected"); after `activationTimeout` the member stays
                 "creating", the next `use` waits again without a host
                 call, and idle eviction can evict it; a failed member is
                 not recreated until reset (33 — Realm Families,
                 BEH-BR-329, BEH-BR-330, BEH-BR-331, BEH-BR-333,
                 BEH-BR-334).
             85. Idle eviction prunes through `reconcile` with `pruneDrain`
                 and `pruneForce: false`: a held host lease makes it time out
                 and leaves the member parked, retried at the next check; a
                 use during eviction waits and recreates; outcomes appear on
                 the family's `events` stream and not on `Host.events`;
                 `retireRealm` refuses a non-empty realm and "default",
                 retires an empty one in one revision, and allows
                 redefinition; an `install` into a realm retired between its
                 validation and its linearization point fails with
                 `UnknownRealm` and registers nothing (18 — Reconciliation
                 and Confluence, BEH-BR-155; BEH-BR-332, BEH-BR-333,
                 BEH-BR-335, BEH-BR-338).
             86. `Realm.ephemeral` defines, installs and activates under the
                 owner's context, undoes on failure, tears down at scope close
                 (forcing only at the limit, reported) and retires its realm;
                 `EphemeralRealm.use` behaves as `Host.useAll` with the
                 realm, with its callback shape and error union;
                 `Actor.narrow` returns the documented value at every depth,
                 refuses invalid input and reserved actors, and is recorded as
                 any actor; `Actor.isWithin` recognises the actor itself and
                 every narrowing of it, and nothing else, among ids that
                 keep the delimiter rule (BEH-BR-336,
                 BEH-BR-337).
             87. A replace of an active plugin with handoff on both sides —
                 or a `restart` or restarting `reconfigure` under `alsoOn`
                 (BEH-BR-353) — exports after the drain and before scope
                 close, as the stop's final step, under the old
                 activation's principal; upgrades through
                 `accepts`/`upgrade` and imports before publication under
                 the new activation's principal, each step with
                 `Actor.unattributed` and an empty annotation bag whatever
                 the calling fiber carries; and writes one `handoff` record
                 before `system-start`; no other operation or state hands
                 off; a lazy registration hands off only from its loaded
                 definition; keys are never provided twice;
                 the held value appears in no record, event, log, snapshot or
                 error (34 — State Handoff, BEH-BR-345, BEH-BR-346,
                 BEH-BR-347, BEH-BR-348, BEH-BR-349; 28, BEH-BR-258; 30,
                 BEH-BR-292).
             88. Export failure, unaccepted version, upgrade or decode failure
                 each give a cold start with the matching loss record and
                 event; import failure fails the activation with no retry;
                 new-build failure, `waiting`, removal and shutdown abandon
                 the handoff with a record; a `restart` or `reconfigure`
                 that supersedes the new build discards it without
                 importing, and the next build imports the value with one
                 record caused by the original call; an operator call
                 arriving during the import waits and is decided against
                 the published or failed plugin (08, BEH-BR-071); a
                 cascade-ended parked replace,
                 and a replace into `dormant`, export nothing and write no
                 record (BEH-BR-347, BEH-BR-349, BEH-BR-350, BEH-BR-351,
                 BEH-BR-352).
             89. A child mounted by `Plugin.Runtime.install` under a sub-scope
                 of its parent's activation scope is removed when that
                 sub-scope closes, its dependents first, drained under
                 `drainTimeout` and revoked on expiry, never parked; the
                 removal passes no `OperationGate` and, with a sink, writes a
                 `system-stop` record attributed to `Actor.system` whose
                 `target` is the child and whose `causationId` is the child's
                 mount record (14 — Children and Groups, BEH-BR-121,
                 BEH-BR-126).
             90. `Plugin.Any`: every value returned by `Plugin.define`,
                 including one with `provides: []`, is assignable to
                 `Plugin.Any` and accepted by `install`, `replace`, group
                 members, `Plugin.Runtime.install` and `DesiredPlugin.plugin`
                 without a cast; an object literal not produced by
                 `Plugin.define` is not assignable; `Plugin.define` adds no
                 property at run time (a compile-time test plus one run-time
                 check) (01 — Plugin Definition, BEH-BR-001; 03 —
                 Installation, BEH-BR-017).
             91. `Plugin.Runtime.entitled`: with no `EntitlementView` wired it
                 emits exactly one state `{ mode: "unmetered", asOf }` read
                 from `Clock` and stays open; with one wired, `watch` is
                 called once per activation with the activation's id, realm
                 and installed version, its elements are shared latest-wins
                 among subscribers, and the stream ends when the activation's
                 scope closes; a `watch` that fails, dies or ends early
                 yields the last state marked stale (or mode "unknown") with
                 reason "entitlement-view-ended", once, and no further call; no mode changes a plugin's state, calls an
                 operation or writes a record; `EntitlementView` is not in the
                 requirements of `Bridger.layer` (10 — Runtime Failure and
                 Health, BEH-BR-089).
             92. Dormant declarations at a hook point: a veto declared in
                 the manifest of a `dormant` plugin is read by
                 `declaredContributions` without `load`; the dispatch
                 admits it with `who` (`declared: true`), wakes it from the
                 dispatcher's fiber and runs it when its contribution
                 registers within the deadline less one `timeout`; a wake
                 that is late, fails, or meets a "load-failed" registration
                 is resolved by the point's `onError` ("deny" denies with
                 cause "wake-timeout" or "wake-failed", "skip" records it);
                 `dormant: "deny"` denies with cause "dormant" and still
                 wakes; a refused declaration is "declared-refused" and
                 wakes nothing; enrich and advisory declarations are
                 "skipped-dormant" by default; a dispatch with no
                 `HostLink` on a point with codes is `Denied` with cause
                 "no-host-link"; with several denying declarations `by` is
                 the first by id whatever order the wakes settle in; a
                 woken contribution takes part while its plugin is
                 `starting`; a wake window already empty at the start of
                 the dispatch still wakes and records "wake-timeout"
                 without waiting; `make` rejects a `timeout` equal to
                 `deadline` on a point with codes whose veto `dormant` is
                 "wake"; a veto owner in an idle return is reported
                 "idling", woken and waited for, so a dispatch during the
                 idle drain never ends `Allowed` without it; a veto owner
                 disabled by the `RefusalList` is reported "refused" and
                 resolved by `onError` without a wake; a contribution of
                 another owner or role under the declared id leaves the
                 declaration kept (`errorTag` "DuplicateContribution") and
                 does not complete its wake; `HostLink.none` denies a point
                 with codes unless `allowNoLink`, and the record names the
                 link; a failed or late declarations read denies with cause
                 "no-host-link"; an enrich contribution in the view shortens
                 the wake window by one `timeout`; a declaration still
                 "waking" after a wait that ran to the end of a non-empty
                 window records "wake-timeout" without waiting, and one
                 only seen "waking" earlier is waited for; a link without
                 `hostId` denies a point with codes unless `allowNoLink`
                 and is recorded as "none"
                 (31 — Hook Points, BEH-BR-297, BEH-BR-305, BEH-BR-309; 27,
                 BEH-BR-250, BEH-BR-253).
             93. Contribution failure policy: a `register` `onError` not
                 allowed by the point, or "deny" on an enrich or advisory
                 contribution, fails with `HookRegistrationRefused` and
                 registers nothing; `who` receives the effective `onError`;
                 errors, deadline expiry and open breakers of a veto
                 contribution follow its effective `onError`; under
                 `breakerScope: "plugin"` the errors of one owner's
                 contributions open one breaker that makes all of them
                 "breaker-open", one probe call closes or reopens it, one
                 `HookBreakerRecord` with `scope: "plugin"` is published per
                 transition, and an unowned contribution keeps its own
                 breaker (BEH-BR-310, BEH-BR-302, BEH-BR-304).
             94. Phase order: enrich hooks complete before the first veto
                 hook is called; veto and advisory hooks receive the
                 conforming enrichments in view order and the ids of
                 enrichers with no value in `missing`, and cannot change
                 them; an enrich failure never denies; a denied dispatch
                 returns its enrichments, empty advice and calls no
                 adviser; a deadline expiring in the enrich or veto phase
                 denies only when an uncompleted veto contribution has
                 effective `onError` "deny", naming the first such
                 (BEH-BR-311, BEH-BR-300, BEH-BR-301, BEH-BR-303,
                 BEH-BR-306).
             95. Targets and policy deny: a `target` that does not decode
                 with the selector, or a `target` on a point without
                 `targets`, refuses the registration; `who` receives the
                 decoded selector; contributions and declarations whose
                 selector does not match are "not-targeted", not called or
                 woken, and feed no breaker; a throwing `descriptor` on a
                 point with codes denies with "target-failed" and no hook
                 call; `policy` `Deny` on a veto contribution or
                 declaration ends the dispatch "denied-policy" with its
                 reason at that contribution's turn, without calling or
                 waking it, feeding a breaker or applying `onError`, and on
                 an enrich or advisory contribution is "skipped-policy"
                 (BEH-BR-312, BEH-BR-302, BEH-BR-305).
             96. Held event: an `emit`, `parallel`, `serial` or `waterfall`
                 dispatch that wakes a plugin returns without waiting for
                 it; once the plugin is `active` its `on` listeners for the
                 event registered during that activation receive the event
                 exactly once, other listeners and `around` listeners never;
                 the event is dropped, logged and reported as
                 `held-event-dropped` with reason "no-listener",
                 "activation-failed" (including phase "load", and a
                 `remove`, `replace` or `disable` that waited for a load or
                 build that then failed), "ended" (removed, replaced or
                 disabled while no load or build runs, idled, host closed,
                 and a `remove` that waited for a load and build that
                 succeeded and were discarded, with no listener receiving
                 the event)
                 or
                 "timeout" (`holdTimeout` under `TestClock`); a `wake`
                 naming `OnEvent` holds nothing; a sentinel argument value
                 appears in no record, event, log, span or snapshot
                 (27 — Manifest and Lazy Activation, BEH-BR-251; 16,
                 BEH-BR-141).
             97. Idle return and wake attribution: with `idle` set, a
                 loaded `active` plugin with no lease or `use` callback
                 holding its keys, no running `Bridger.Events` listener, no
                 child and no non-dormant dependent becomes
                 `dormant` after `idle` under `TestClock`, through a stop
                 whose finalizers run, keeping its slots, with one
                 `lazy-idle` record (no `system-stop`) and `plugin-idled`;
                 any of those conditions resets the idle time; a registry
                 hold of one of its contributions does not prevent the idle
                 return and drains under the registry's `drainTimeout`; a
                 trigger
                 applied during the idle stop wakes it again on arrival in
                 `dormant` and is not listed in that `wake`'s `triggered`; the next activation calls `load` again; a `wake`
                 from plugin code, and an event dispatch from plugin code,
                 write root `lazy-triggered` records carrying that plugin's
                 principal as `onBehalfOf` and `Actor.system` as actor,
                 caused `lazy-triggered` records carry none, and a forged
                 principal makes `wake` die with `PrincipalForged`
                 (BEH-BR-252, BEH-BR-253).
             98. `reconcile` orders its actions by declarations: prune
                 removals and disable-first entries dependents first, every
                 other change providers first, ties in list order; a list
                 that installs a dependent before the provider replacement
                 it needs converges in one run in any list order;
                 `Host.plan` shows the same order and no lazy `load` runs
                 (18 — Reconciliation and Confluence, BEH-BR-156; 32,
                 BEH-BR-317).
             99. With `atomic: true` the first refused or failed forward
                 action stops the apply and every completed action is
                 undone in reverse by the opposite operation, each
                 attributed to the call, gated with `undo: true` and
                 recorded with `undoes`; the call fails `ApplyRolledBack`;
                 a validation-stage rejection applies nothing; an activation
                 failure starts no undo; the plan carries `atomic` and
                 per-entry `undo`; a multi-action entry (`[replace,
                 reconfigure, enable]`, `[disable, replace, reconfigure]`)
                 is undone in full with each `registeredAt` check made
                 against the revision the previous undo action produced;
                 the undo of a `replace` of a plugin that had an override
                 puts that override back, and when that `reconfigure` fails
                 or is skipped the step is one `notUndone` entry with
                 `action` `replace`, not in `undone`; with `prune: false` the undo of an
                 `install` removes with `pruneDrain` and `pruneForce`; a
                 refused digest in the diff applies nothing, and one refused
                 at step 4b stops the apply with `OperationRejected`
                 (32 — Generic Gate and Plan, BEH-BR-317, BEH-BR-318,
                 BEH-BR-319, BEH-BR-322–326).
            100. An undo refused, failing or skipped by `ChangedSinceApply`,
                 a parked forward `DrainTimeout`, a latch set mid-apply and
                 shutdown each end in `PartialApply` naming what stayed
                 applied, with a `reconcile-partial` event and no retry;
                 caller interruption after the intent still completes the
                 undo; an undo `replace` hands off state as any replace; the
                 next reconcile waits for the undo (BEH-BR-323, BEH-BR-324,
                 BEH-BR-326; 34, BEH-BR-353).
            101. Desired-entry policy: `mandatoryInterceptions` reach
                 `InstallOptions.mandatory` from `mandatoryCatalog` in
                 order, with `allowChildren`; unknown or repeated ids give
                 `InvalidDefinition`; a difference on an installed entry
                 gives `PolicyMismatch` and no action; a catalog with an
                 empty or repeated id fails construction (18, BEH-BR-153,
                 BEH-BR-154).
            102. A contract registry refuses an `add` without `implements`,
                 below its range or missing a method with
                 `IncompatibleContract` (`dependentId` "registry:<name>")
                 and registers nothing; `within(range)` and a selector range
                 hide out-of-range entries; `implements` on a plain registry
                 is a defect; `MethodSpec.timeout` appears in
                 `descriptor.timeouts`, is never enforced in-process and
                 fails no check; an invalid timeout makes the contract
                 invalid (26 — Versioned Contracts, BEH-BR-233, BEH-BR-234;
                 19, BEH-BR-163, BEH-BR-165).
            103. With `handoff.alsoOn`, an active plugin's `restart` and
                 restarting `reconfigure` hand off state with one `handoff`
                 record caused by that call; `cold: true`, an unlisted
                 operation, a non-active plugin, its dependents and a
                 volatile-only `reconfigure` hand nothing off and write no
                 record; `PluginHandle.restart` takes the same options with
                 the same outcome (34 — State Handoff, BEH-BR-346,
                 BEH-BR-350, BEH-BR-353).
            104. RefusalList: operator calls of a refused digest fail with
                 `OperationRejected` ("refused-digest: ...") and one
                 `rejected` record without the gate; system starts, cascade
                 restarts, lazy triggers and background restarts of a
                 refused digest land in `disabled` with reason
                 "refused-digest" and one `start-refused` record, loading
                 and building nothing; a refused mount fails with
                 `ChildNotAllowed`; row "disabled (refused-digest)" holds;
                 such a registration counts as not disabled for the diff
                 and `registeredAt`, so a second `reconcile` issues nothing
                 for it; `Host.plan` lists a refused entry in `rejected`
                 (28 — Plugin Principal and Mandatory Policy, BEH-BR-267;
                 18, BEH-BR-154, BEH-BR-159; 32, BEH-BR-317, BEH-BR-318).
            105. The `OperationRequest` of plugin-addressed operations
                 carries `allowChildren` and `mandatoryInterceptions` equal
                 to the registration's effective values (25 — Operation
                 Gate, BEH-BR-219; 28, BEH-BR-263).
            106. `CurrentCorrelation`: resolution order, set for the work of
                 a call and its system transitions, reset for background
                 work, followed by listeners and served calls, recorded on
                 root system records and call entries, never seen by the
                 fingerprinter or the diagnostic channels (22 —
                 Attributable Operations, BEH-BR-187; 30, BEH-BR-292).
            107. Call-log failure policy "drop" and "refuse", bounded
                 queue, `CallLogUnavailable`, counters and close (29 —
                 Capability Grants and Call Log, BEH-BR-279).
            108. Every record carries `auditDropped` equal to the overflow
                 count when it was numbered, never decreasing; a lone
                 surrogate in an actor, reason or correlation is replaced by
                 U+FFFD on the gate request and on every record of the call
                 (`requested`, `rejected`, terminal), each carrying
                 `sanitized: true`, while a system record the call causes
                 carries the replaced correlation without `sanitized`;
                 `Host.controls` reports `buildTimeout`
                 (23 — Audit Sink and Record, BEH-BR-195, BEH-BR-196,
                 BEH-BR-202; 22, BEH-BR-185; 24, BEH-BR-212).
            109. `AccessPolicy.declaredOnly` and `AccessPolicy.ask` (28,
                 BEH-BR-268, BEH-BR-269).
            110. `Plugin.Runtime.unmount` writes `unmount-requested` with
                 `requestedBy` before the removal's records, which it
                 causes; call-log entry kinds, `Host.offerCallEntry` and
                 the `PrincipalRef` encoding (14 — Children and Groups,
                 BEH-BR-126; 22, BEH-BR-190; 29, BEH-BR-280).
            111. `CapabilityPolicy.changes` re-resolves live captures,
                 narrowing later calls without changing plugin state (29,
                 BEH-BR-281).
            112. Offered entries of kind "dispatch" and string epochs on
                 crossing and revocation entries; a crossing's `disclosed`
                 claim names recorded unchanged, and an empty or repeated
                 name failing with `InvalidCallEntry` (29, BEH-BR-276,
                 BEH-BR-280).
            113. A registry view entry carries `owner` (plugin id and
                 realm) when `add` ran in a plugin's activation and none
                 for an application contribution, also through
                 `within(range)`; a removal that revokes holders at
                 `drainTimeout` publishes one `HoldRevoked` with the
                 number of holders to current `revocations` subscribers
                 after their finalizers and writes no audit record; a
                 removal that revokes none publishes nothing (19 —
                 Contribution Registry, BEH-BR-163, BEH-BR-165,
                 BEH-BR-167).
            114. Identifier uniqueness: every `hostId`, `recordId`,
                 generated `correlationId`, `callId` and `dispatchId` a
                 host produces over a scripted run is drawn from its
                 `IdGenerator`, and no value repeats within the host; the
                 default generator returns no repeat across many draws in
                 several hosts of one process; `counterIdGenerator` repeats
                 no value within one `TestHost`, and two `TestHost`s with
                 distinct prefixes draw disjoint values into one
                 `memoryAuditSink`, while with one prefix the sink keeps the
                 colliding record beside the first, never dropping it
                 (24 — Time, Identifiers and Sequence, BEH-BR-210;
                 02, BEH-BR-016; 23, BEH-BR-193; BEH-BR-179, BEH-BR-181).
```

Checks 31–42 exist because the GxP hooks are only worth specifying if each
one is exercised through the path a consumer uses — through `Host`, with the
fixtures of BEH-BR-181 and BEH-BR-182 wired as a consumer would wire a real
sink and gate. A hook that is unit-tested in isolation but never reached from
the host's own operations is the specific failure this suite must not
reproduce.

---

_Previous: [20 — Generation](./20-generation.md)_ · _Next: [22 — Attributable Operations](./22-attributable-operations.md)_
