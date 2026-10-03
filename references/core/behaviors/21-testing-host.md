# 21 — Testing Host

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-BEH-21                                               |
> | Revision       | 0.6                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.6 (2026-10-02): The scheduling seam; `pending` at a settlement point; `awaitIdle` on a TestHost; the scope-close path runs on its own; faults through the TestHost's entry points; acceptance checks 53–54, check 52 extended (prototype findings G27–G32) (CCR-BR-011)<br>0.5 (2026-10-02): Acceptance checks 49–52 from the P4 prototype findings G19–G25 (CCR-BR-010)<br>0.4 (2026-10-02): Deterministic pending order, `pending` and `stepPlugin`; `PendingStep` owner, waiter and correlation; acceptance checks 45–48, check 45 split in two tests, check 33 reworded (CCR-BR-008)<br>0.3 (2026-10-02): Acceptance checks 43–45 for cross-plugin stop ordering (CCR-BR-006)<br>0.2 (2026-10-02): Consistency fixes from independent review (CCR-BR-002)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001) |

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
             which a `TestHost` reaches only through steps. Documentation
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
             MUST be the first identifier drawn.
```

```
REQUIREMENT: Two runs of the same test script against a `TestHost` MUST
             produce identical snapshots, identical event sequences, and —
             when a sink is wired — identical audit record sequences, field
             for field.
```

The last requirement is the one validation depends on: an executed test whose
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
               next activation.
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
REQUIREMENT: `memoryAuditSink` MUST treat a write whose `recordId` it has
             already stored as idempotent — it succeeds and stores nothing new
             — as 23 — Audit Sink and Record requires of every sink.
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
                callers.
             5. A background fiber failure and a failing health check each
                move the plugin to `failed` (phase `runtime`) after stopping
                dependents.
             6. Builds respect `concurrency`, dependency order and
                `buildTimeout`; `awaitIdle` times out when it must.
             7. A configuration decode failure fails activation without
                publishing; `reconfigure` restarts dependents.
             8. Shutdown reports cleanup failures and forced plugins;
                closing the scope runs the same path.
             9. `install` rejects duplicate ids, duplicate providers and
                cycles without registering anything; `replace` validates
                before stopping and leaves the running plugin untouched on
                `ReplaceError`; a replace that drops a provided key sends
                dependents to `waiting`.
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
                 retired values drain independently.
             23. Child plugins are removed with their parent in LIFO order; a
                 failing child leaves the parent running; group operations
                 are atomic.
             24. `optional` services never gate activation or appear in
                 `missingServiceIds`; `useOptional` returns `None` when
                 unavailable; `whenAvailable` runs, is interrupted and re-runs
                 as providers leave and return without changing plugin state,
                 and closes its scope before the provider.
             25. Events: each dispatch mode, priority and `prepend` order,
                 listener removal with its plugin, `emit` isolating listener
                 failures, `parallel` failing on the first typed failure, and
                 a typed listener mismatch failing to compile.
             26. Realms: an isolated key resolves only inside its realm; the
                 same definition installs in two realms; provider slots and
                 cycles are per resolution scope; interceptions wrap per
                 consumer in the fixed order without changing leases.
             27. `disable` keeps definition and configuration and frees the
                 provider slot; `enable` re-validates; `restart` keeps the
                 override and restarts dependents.
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
                 `performance.now()`, `crypto.randomUUID()`, `Math.random()`
                 or an argument-less `new Date()` outside the default
                 `IdGenerator` implementation (a static check). That is the
                 only exemption: the default `Clock` is Effect's own
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
                 snapshot of a direct install of the final set (05 —
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
                 carries the child's registration state and is caused by the
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
```

Checks 31–42 exist because the GxP hooks are only worth specifying if each
one is exercised through the path a consumer uses — through `Host`, with the
fixtures of BEH-BR-181 and BEH-BR-182 wired as a consumer would wire a real
sink and gate. A hook that is unit-tested in isolation but never reached from
the host's own operations is the specific failure this suite must not
reproduce.

---

_Previous: [20 — Generation](./20-generation.md)_ · _Next: [22 — Attributable Operations](./22-attributable-operations.md)_
