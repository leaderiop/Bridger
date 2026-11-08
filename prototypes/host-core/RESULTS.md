# Host-core prototype — results (phases P1–P5, G11, in-flight table, CCR-BR-008, CCR-BR-012, CCR-BR-014, P7 round 2)

Throwaway prototype of the Bridger host core — behaviours 01–09 of
`references/core/` (definition, installation, states and snapshots,
activation, removal, replacement and reactivation, operation legality,
leases) — on `effect@4.0.0`. Its purpose is to find where the specification
is wrong or incomplete before the real implementation starts. It is **not**
the implementation and evidences no requirement (CCR-BR-004).

Run: `npm install && npm run check && npm test` (Node 22). `src/host.ts` is
about 1,700 lines; `src/legality.ts` is the total state × operation table.
Phases P4 (behaviours 14–18) and P5 (behaviours 19–21) are recorded in their own sections below.
Since CCR-BR-012 every suite below runs on `TestHost` (see the last section before the run output).

## What is covered

| Acceptance check (BEH-BR-183) | Test |
| --- | --- |
| 1 dependents stop first; providers usable from dependents' finalizers | lifecycle › removal |
| 2 drain, `DrainTimeout`, `force` with `LeaseRevoked` | leases |
| 3 `WouldDeadlock` (own provider, provider of a leased dependent, `awaitIdle`) | leases |
| 4 every settled cell of the state × operation table, as a pure table and live on a `TestHost` (56 cells) | leases › legality |
| 8 shutdown order and report; `HostClosed` afterwards | lifecycle › snapshots |
| 9 duplicates and cycles register nothing; replace validates before stopping; dropped key strands dependents | lifecycle |
| 10 failure is sticky through dependency loss and return; retry lands by availability | lifecycle |
| 11 `KeyMismatch` | lifecycle |
| 12 caller interruption: child finalizers before lease release | leases |
| 16 fresh memo map per activation | lifecycle |
| 18 `useAll` all-or-nothing, same drain path | leases |
| 19 install order independence; `awaitActive` | lifecycle |
| 27 disable frees the slot; enable re-validates | lifecycle |
| BEH-BR-034 a build still waiting for a slot is cancelled by a stop; BEH-BR-039 a begun stale build is never published | lifecycle |
| BEH-BR-046/047 cleanup failure; remove acknowledges the leak | lifecycle |
| BEH-BR-087 per-call `LeaseTimeout` | leases |
| BEH-BR-160 confluence over seeded random histories (5 seeds × 40 operations) | confluence |

Not covered (later phases): configuration and `reconfigure`, runtime failure
and health, events, children, optional dependencies, realms, reconcile, the
`reconfigure` (and so its row and column of the in-flight table), and, in
phase P1, the GxP hooks (covered in phase P3 below). The in-flight table is
covered in its own section below.

## Findings fed back into the specification

| # | Finding | Specification change |
| --- | --- | --- |
| G10 | `IdentifiersOf` as written yields `unknown` for an empty tuple, so `provides: []` could not type-check (found by `tsc`) | BEH-BR-002 now requires the distributive form |
| G11 | A provider's removal must stop a dependent that may have its own operator operation in flight; the spec orders operations per plugin but not across plugins | Closed by ADR-BR-038 and BEH-BR-078–080 (CCR-BR-006); see the G11 section below |
| G12 | "Revoke remaining scoped leases" named no mechanism; a scoped lease has no child fiber, so revocation interrupts the acquiring fiber | BEH-BR-086 states it |
| — | Confirmed in practice: the prototype finding G9 fix (interrupt and await the child) gives the required order — the callback's finalizer runs before the provider closes | none |

## Deliberate simplifications

- A second `shutdown` call fails with `HostClosed` instead of joining the shutdown in progress (BEH-BR-075).
- `awaitIdle` and `awaitActive` poll every millisecond instead of waiting on a signal.
- A scoped `lease()` revocation interrupts the acquiring fiber (now the specified behaviour, G12).
- Errors carry only identifiers; no events, spans, metrics or audit records are emitted.

## Phase P3 — GxP hooks (CCR-BR-005)

`src/gxp.ts` adds attribution (`Actor`, `OperationContext`, `CurrentActor`,
`attribution.require`/`requireReason`), the `AuditSink` port with a single
writer (sequence assigned at the serialization point, retry in place with the
same `recordId` and `auditSeq`, bounded queue, overflow counted and latched),
the audit-degraded latch and `acknowledgeAuditDegraded`, the `OperationGate`
port (a defect or timeout is a refusal), `IdGenerator`, and
`verifyAuditSequence`. Every mutating operation goes through one wrapper in
`src/host.ts` that applies the eight-step order of BEH-BR-188.

| Acceptance check (BEH-BR-184) | Test |
| --- | --- |
| 31 attribution required; reason required; per-call context wins over `CurrentActor` | gxp › attribution |
| 32 validation reaches neither gate nor sink; refusal, gate defect and gate timeout leave one `rejected` record and change nothing; unwritable `requested` record fails with `AuditUnavailable` | gxp › gate, latch |
| 33 exactly one `requested` and one terminal record per admitted call, including no-ops | gxp › records |
| 34 the latch: set by an unwritten terminal record, refuses mutations, allows shutdown, acknowledgement needs a reason and a drained backlog | gxp › latch |
| 35 `auditSeq` contiguous from 1; failed writes retried in place | gxp › records |
| 36 `verifyAuditSequence` gaps, duplicates, disorder | gxp › records |
| 38 unwired hooks change nothing (snapshot equality with an allow-all gate and a sink) | gxp › optional |
| 39 system transitions: `Actor.system`, causation of the trigger, never gated | gxp › records |
| 41 no ambient time or randomness in `src/` outside the default `IdGenerator` (static check) | gxp › optional |
| 42 gate requests and records carry definition version and digest; refusal by digest | gxp › gate |

Not covered: check 37 (no configuration values — the prototype has no
configuration yet), check 40 (`reconcile`), the `droppedSinceAck` field on the
acknowledgement record, and audit records for `reconfigure`.

Findings: **G13** — acknowledging the latch succeeds only once the backlog has
drained, because the acknowledgement's own record queues behind it (now a
requirement in BEH-BR-206). **G11 extended** — with host-wide linearization, a
lease holder that calls a mutating operation while another operation waits
on its lease blocks until that drain times out rather than failing fast with
`WouldDeadlock`; the per-plugin design that resolves G11 must also resolve
this.

## G11 — cross-plugin stop ordering (CCR-BR-006)

The host-wide operation lock is gone. `src/host.ts` now has three per-plugin
orders: an *admission* order for steps 1–7 of BEH-BR-188 (so `WouldDeadlock`
is decided before any wait), an *operation* order for the linearization point
and the transition, and a *step* order under which each stop runs. A stop
hides its plugin before stopping dependents (BEH-BR-042), and a cascade takes
a dependent's step lock — waiting for whatever step is running there — and
then stops the dependent only if it still holds the provider. Step locks are
always taken from a provider to its dependents, so they cannot cycle
(INV-BR-030).

| Acceptance check (BEH-BR-184) | Test |
| --- | --- |
| 43 while a removal waits on a lease, the lease holder installs an unrelated plugin at once, its `remove` of its own plugin fails at once with `WouldDeadlock`, and a call on the provider settles at once | ordering |
| 44 a removal that meets a dependent's `restart` waits for its step: one close, the restart completes for its caller, no rebuild against the removed provider | ordering |
| 45 a removal resumes a dependent's parked stop under its options, fails with `DrainTimeout` naming the dependent without `force`, ends the parked intent (dependent `waiting`), and records a `system-stop` caused by the removal | ordering |

All three fail against the previous prototype (host-wide lock), each on a
real defect rather than on timing:

- **43:** the lease holder's unrelated `install` blocked behind the drain, and
  the provider was not hidden until its dependents had stopped.
- **44:** the dependent's `restart` rebuilt it against the provider being
  removed (the provider was still visible), and the cascade then closed it a
  second time. The spec already required hiding first (BEH-BR-042); the
  prototype had deviated.
- **45:** the cascade skipped a dependent whose stop was parked, because only
  `active` and `starting` plugins counted as dependents. The provider's
  removal therefore did not stop that dependent first, although it still held
  the provider. BEH-BR-080 now says what must happen.

## In-flight operation table (CCR-BR-007)

An operator operation that stops its plugin (`remove`, `replace`, `restart`,
`disable`) becomes a *flight* at its linearization point: its operation,
target, drain options, callers and whether it is parked. A host fiber runs
the transition, so interrupting a caller ends only its wait (BEH-BR-067). The
stop step settles first and the target is read afterwards, so a superseding
call redirects the transition without interrupting a step (BEH-BR-069).
Completion is decided under the plugin's operation order, so no call is
linearized between the end of a transition and its callers' results. A call
arriving while a flight exists is decided by the BEH-BR-072 table: it joins
(same result; a `joined` record linked to the call it joined), supersedes
(earlier callers, joined ones included, get `Superseded` and a `superseded`
record caused by the superseding call), or fails with `Conflict`. A parked
flight resumes under the options of the call that joins or supersedes it.

| Scenario | Test |
| --- | --- |
| the in-flight table is total and matches BEH-BR-072 (without `reconfigure`) | inflight › table |
| all 28 live cells: duplicate, conflict at once, join (both succeed), supersede (earlier caller `Superseded`, later target wins); one close of the old activation in every cell | inflight › live |
| BEH-BR-067 caller interruption does not cancel the transition | inflight › intent |
| BEH-BR-074 a parked operation is still in flight (`enable` conflicts), does not block `awaitIdle`, and a superseding `remove --force` resumes it | inflight › intent |
| BEH-BR-072 a superseding `replace` that fails its definition checks fails alone | inflight › intent |
| BEH-BR-188 a caller interrupted while waiting for its turn (behind a call waiting for a system stop) changes nothing and ends `failed` (`Interrupted`) | inflight › interruption |
| BEH-BR-200 joined and superseded calls: own `requested` record, linked terminal record | inflight › audit links |

Two tests were checked against deliberate defects: treating *supersede* as
*join* fails 8 tests, and removing the interruption handler fails the
interruption test.

Findings: **G14**: BEH-BR-188 made the span from the `requested` record to
the intent uninterruptible. Per-plugin ordering puts a wait for the plugin's
turn inside that span, and the turn can be held by a call waiting for a
system stop to drain. Interruption is now allowed there: the call changes
nothing and ends with a `failed` (`Interrupted`) record. **G15**: a call that
parked an operation keeps its `failed` (`DrainTimeout`) record as its only
terminal record, whatever later happens to the parked operation.

## Review resolutions (CCR-BR-008)

A review of CCR-BR-003..007 by three agent reviewers, and a second review of the fix, found contradictions and
undefined cases in the G11, G14 and G15 amendments. The specification was
corrected as CCR-BR-008. The prototype now follows the corrected rules
wherever it can reach them:

| Rule | Prototype | Test |
| --- | --- | --- |
| R1 a caller interrupted while the gate decides leaves one `rejected` ("caller-interrupted") record; gate approval to `requested` enqueue is uninterruptible | `mutating` | review › check 46 |
| R2, T2 joining a parked operation resumes it; the resumer owns it and writes its own `completed`/`failed` with `resumes` = the parked call's `requested` record; the parked call's record is final | `flightOp` | review › check 47 |
| R8, R10 `retry`/`enable` on a parked system stop fail with `Conflict` "dependency-loss"; a stopping operation resumes and owns it | `awaitSystemStop`, `flightOp`, `startOp` | review › check 47 |
| R9, V, T1 a cascade resumes a parked operation and ends its intent, writing an `intent-ended` record (`endsIntentOf` = the parked call's `requested` record) at that moment; on re-expiry the dependent's stop is a parked system stop; `parked` in the snapshot | `stopStep` | review › check 47 |
| R11 a build and a finalizer carry their plugin in `HeldPlugins`; calls back into the host fail with `WouldDeadlock` | `runBuild` | review › check 48 |
| R12 a cascade's own drain limit runs while it waits for another call's running step; `DrainTimeout { id, leases, target }` | `stopTree` | review › check 48 |

Not reached here: runtime-failure and shutdown cascades that revoke (R6),
children (R7), replace reservations and `reconfigure` reverts (R13), the
`stop-parked`/`stop-resumed` events and `PluginInspection` (no events or
inspection in this prototype), and the precedence of `Interrupted` over a
later `AuditUnavailable` (R4), which holds by construction: once a caller is
interrupted, the path that would write `AuditUnavailable` never runs.

The interruption scenario of the in-flight section now waits on a *running*
system stop: under R8, `retry` on a parked one fails at once.

## Phase P2 — runtime failure, health, configuration, shutdown, events (prototype)

`src/runtime.ts`, `src/config.ts`, `src/events.ts` and `host.ts` add Plugin.Runtime (`background`
with fail-plugin/restart/ignore, `reportFailure`), the runtime-failure transition (a cascade with no
caller: revokes, never parks), health checks, configuration (decode before build, overrides,
`reconfigure` incl. its legality cells, volatile-only updates, revert of an ended intent), shutdown
(`CloseReport`, overall limit, joins, scope-close path, `onClose`), `Host.events` (sliding PubSub,
`seq`), `inspect`, and `layer` for ManagedRuntime. `test/p2.test.ts`: 18 scenarios (several under
TestClock). Suite: 96 passed, five consecutive runs.

Findings for the specification (written into references/core as CCR-BR-009):
- **G17** BEH-BR-092 (a health check is a short lease the drain waits for) vs BEH-BR-093 (leaving
  `active` interrupts it): the prototype interrupts the check when the stop begins, so its lease ends
  at once (BEH-BR-092 amended).
- **G18** On the scope-close path the audit writer closes with the host scope, so shutdown's terminal
  record can be lost; the prototype flushes the queue first, bounded by `auditTimeout` (BEH-BR-108
  amended).
- Implementation note: activation scopes must sit under a scope forked before the shutdown finalizer,
  or closing the host scope closes plugins before the dependents-first shutdown runs.

Not covered: ConfigProvider default source, per-path `ConfigInvalid` messages, `plugin-stalled`,
spans and metrics, replace reservations.

## Phase P4 — children, optional and reactive dependencies, event bus, realms, reconcile (prototype)

`src/host.ts` adds realms (`defineRealm`, scopeOf resolution, per-slot `DuplicateProvider`, cycle
detection over resolved and mount edges, `PluginRef`, realm options on leases), interception,
children (`Plugin.Runtime.install`, removal as dependents, `Plugin.group`), optional keys
(`optional`, `useOptional`, `whenAvailable`), and `reconcile` with ownership scopes. `src/bus.ts` is the
`Bridger.Events` base service; `src/desired.ts` is `Desired.overlay`. A plugin's (id, realm) is one
internal key (`id@realm` outside the default realm). Suite: 146 passed in each of four consecutive full runs.

| Behaviour | Scenario | Test |
| --- | --- | --- |
| BEH-BR-121, 122, 126 | a child is mounted by the parent's build, prefixed, ungated; its mount is a `system-start` caused by the record that began the parent's activation | children |
| BEH-BR-121, 125, 126 | the parent's removal removes the child first, before the parent's scope closes; the child's `system-stop` is caused by the cascade root | children |
| BEH-BR-121 | a mount edge closes a cycle through the parent's own definition: a `replace` that requires its child's service fails with `DependencyCycle` | children |
| BEH-BR-123, 124 | a failing child leaves its parent active; a child requiring the parent's service starts after publication and stops first | children |
| BEH-BR-125 | a new activation mounts again; a child removed directly stays removed until then; a forced parent removal ends a parked child operation (`intent-ended`); a child whose drain expires parks with `next` "gone" | children |
| BEH-BR-127, 128 | group `awaitActive` waits for every member and fails fast; a member that fails its install checks fails the group and leaves no member mounted | children › groups |
| BEH-BR-129–131 | optional keys gate nothing and form no cycle; `optional` is a point-in-time, unleased read (undeclared → None); `useOptional` leases and delays removal | optional |
| BEH-BR-132–136 | `whenAvailable` runs when its keys arrive, ends before the provider closes (finalizer uses the service), re-runs on return; drains under the provider's limit with `DrainTimeout`/`force`; failure policies; `inspect`; `WouldDeadlock` from inside a run | optional |
| BEH-BR-137–144 | base service (`DuplicateProvider` "base"); priority/registration/prepend order; listeners leave with their plugin; `emit` fire-and-forget with `listener-failed`; `parallel`, `serial`, `waterfall`; `HeldPlugins` inherited and `CurrentActor` reset; a listener removed mid-dispatch | bus |
| BEH-BR-145–150 | `DuplicateRealm`; one definition per realm that isolates its keys; isolated keys stay inside; a non-isolated key provided from a realm takes the default slot; an isolated base key is hidden; a default provider stops after consumers in every realm; snapshot realms; `UnknownRealm` before any callback; `defineRealm` gated and audited as `{ id: R, realm: R }` | realms |
| BEH-BR-151, 152 | composition realm → inherited → own; application `use` unwrapped; optional captures wrapped; a throwing wrap fails only the consumer (phase activation), no lease | realms › interception |
| BEH-BR-153–159, 201 | install, idempotent second run (`noop`, `children: 0`); action order with version/digest identity; ownership and pruning (dependents first); invalid and duplicate entries; per-entry gate and `children`; `requireReason` on the provisional diff (no record) and on the recomputed diff (recorded `failed`); interruption after the intent; serialization; `AuditUnavailable` stops the batch; convergence of two histories; `Desired.overlay` | reconcile |
| BEH-BR-160 (P4 exit criterion) | 100 seeded random histories over two realms, optional consumers and a parent with a child, with racing operations, end in the same snapshot as a direct install of the final set | confluence-p4 |

Mutation checks (each run against the full suite, then reverted): children not treated as
dependents (4 fail); no realm isolation (5); interception order reversed (1); a `whenAvailable` run
not interrupted when its provider's stop begins (1); a vanished requirement failing the plugin, i.e.
G25 reverted (1, the confluence test); `replace` after `reconfigure` in a reconcile (1); reconcile
adopting a plugin it does not own (1); a removed child left registered (6).

Findings for the specification (written into references/core as CCR-BR-010):
- **G19** `Plugin.Runtime.install` is not defined once the parent's stop has begun. A background
  fiber of the parent can mount a child after the parent's children were removed and before its
  scope closes; nothing would remove that child. The prototype refuses the mount with `Conflict`.
  Related: a parked child removal (`next` "gone") resumed by an operator call other than `remove`
  has no defined target; the prototype refuses it with `Conflict`.
- **G20** A child's mount and its activation are both `system-start` records, told apart only by
  `after.state`; the activation's cause is not stated. The prototype causes the activation record by
  the mount record.
- **G21** A parent that awaits a child inside its build holds a build slot the child's build needs;
  with `concurrency` 1 (or `concurrency` such parents) it always fails at `buildTimeout`. BEH-BR-124
  names only the self-wait on a child that requires the parent's services.
- **G22** BEH-BR-128 gives a member's `InstallError` phase "activation"; it fails the group's
  build Layer, which BEH-BR-037 and BEH-BR-121 call phase "build". The prototype reports "build".
- **G23** The outcome of `parallel`, `serial` and `waterfall` when a listener is interrupted because
  its plugin was removed during the dispatch is unspecified. The prototype dies with
  `ListenerRemoved`; under `emit` such an interruption is not reported as `listener-failed`.
- **G24** BEH-BR-122 lets a child's `intercept` option replace inheritance, so the order "realm →
  inherited → own" of BEH-BR-151 never has both middle terms; it also does not say whether the
  parent's realm interceptors are inherited. The prototype: own replaces inherited; inherited is the
  parent's inherited and own, never its realm's.
- **G25** (found by the confluence property test) A `starting` plugin whose requirement becomes
  unavailable before its build begins — it waits for a slot, or an operator operation hides the
  provider before the provider's stop reaches it — has no defined outcome; capture happens "when a
  build begins" (BEH-BR-035). The prototype first failed it (phase activation), which made the settled
  state depend on scheduling. It now returns to `waiting`, and a stop cancels a build that holds no
  slot rather than waiting for one (BEH-BR-034).
- Observation, not written into the specification (for the next review): the BEH-BR-121 rule that a
  child install fails with `DependencyCycle` cannot fire at install time — a parent mounts only while
  every provider it requires is active, so no path from the parent can reach a child that is not yet
  registered. It fires at a later `replace` of the parent by a definition that requires its child's
  service, and that check counts the children the replace would itself remove.
- Implementation notes (no specification change): a fiber forked into the host scope while that
  scope closes never runs, so the interruption of a `whenAvailable` run on the scope-close path must
  be detached; the build slot must be released before a discarded activation unmounts its children,
  or a child's build waiting for the slot deadlocks the discard (consistent with "stops take no
  slot").

Not covered: the ContributionRegistry itself (the bus keeps an equivalent ordered list; phase P5),
`@bridger/core/ActivePlugin` ownership in `inspect`, spans and log annotations of `whenAvailable` runs,
`ReplaceOptions` beyond `realm`, the audit latch becoming set during a reconcile (only an unwritable
`requested` record is exercised).

## Phase P5 — ContributionRegistry, Generation, `@bridger/core/testing` (prototype)

`src/registry.ts` (ContributionRegistry), `src/generation.ts` (Generation) and `src/active.ts`
(`@bridger/core/ActivePlugin`) are new; the event bus now keeps each event's listeners in a registry
named after the event. `src/testing.ts` is the testing entry point: `TestHost`, `Fault`,
`counterIdGenerator`, `memoryAuditSink`, `scriptedGate`. `TestHost` is the production host built by
`Host.makeWith` with a `Scheduling` that holds every transition step (a build, a stop) and every
contended wait until the test steps it; `Host.make` passes the same steps and waits through
`immediate`, which runs them at once. Suite: 170 passed in each of the five full runs made once the P5 code was in place.

| Behaviour | Scenario | Test |
| --- | --- | --- |
| BEH-BR-163 | duplicate, concurrent duplicate and non-finite priority register nothing | registry |
| BEH-BR-164, 165 | scope close removes last in, first out; others intact; priority-then-id order; revisions step by one and never regress | registry |
| BEH-BR-166, 167 | `use` holds; removal hides at once, waits for the holder, keeps the id reserved until done; at `drainTimeout` holders fail with `LeaseRevoked` after their finalizers | registry |
| BEH-BR-163, 168 | contributions added in an activation (a registry entry, a bus listener) are owned by the plugin in `inspect`, names and ids only, withdrawn and re-added across a restart | registry |
| BEH-BR-170–175 | atomic publish (no mixture); revisions; admission close/reopen; publish keeps admission; `awaitDrained`; repeatable `DrainTimeout`; force revokes `use` callbacks after their finalizers; retired values drain independently; scope close drains with revocation | generation |
| BEH-BR-174 | a forced drain of a generation made in an activation is a `lease-revoked` host event naming the generation | generation |
| BEH-BR-178 | an operation returns with its transition pending; pending order (arrival, then ready-set or (realm, id)); `stepPlugin` picks another order; a cascade that meets a dependent's restart is a pending wait; `concurrency` holds while a build sleeps on the clock; `step` returns false when nothing can progress | testhost |
| BEH-BR-179 | two runs of one script give identical snapshots, events and audit records field for field; host id "test-1"; timestamps from `TestClock` | testhost |
| BEH-BR-180 | `buildFails`, `stopFails`, `holdLease` (with `DrainTimeout` under the clock, then force), `runtimeFailure` (through the real runtime-failure path) | testhost |
| BEH-BR-181, 182 | sink idempotent on `recordId` with scripted outcomes; gate records every request and needs a decision | testhost |
| BEH-BR-160, 178 (P5 exit criterion, prototype form) | 40 seeded random histories on a `TestHost` whose step order is itself chosen at random (`stepPlugin` on random pending items) settle to the snapshot of a direct install on the production host | confluence-p5 |

The P4 suites (`test/p4fixtures.ts`) took their sink, gate and identifier generator from the
testing entry point; the P1–P3 suites used their own fixtures and ran on `Host.make` (changed by
CCR-BR-012, below).

Mutation checks (full suite, each reverted): removal not waiting for holders (3 fail); an id freed
when hidden (1); registry ordered by id only (2); `publish` reopening admission (1); `step` picking
the last item (2); stops bypassing the scheduler (2); G25 reverted (2, now also through `TestHost`).
One mutant survived and is equivalent: `acquire` returning the newest value instead of the admitted
one — admission and the read are one synchronous step, so no publish can fall between them.

Findings for the specification (written into references/core as CCR-BR-011):
- **G26** BEH-BR-174 closes "lease scopes" of `acquire` leases with a `LeaseRevoked` cause, but a
  `Scope` from the environment is not closeable by a third party in Effect 4 (`Effect.scope` gives a
  `Scope`, not a `Scope.Closeable`). The prototype interrupts the acquiring fiber, as BEH-BR-086 settled
  for host leases (G12); its scope closes as it unwinds.
- **G27** A test cannot step its `TestHost`'s scope-close shutdown, which runs in a finalizer after the
  test body; the prototype lets transitions run on their own from the moment that scope begins to
  close. A lease still held then hangs the close for good: drain and shutdown limits read `TestClock`,
  which only the test advances (confirmed with a probe that was not kept as a test).
- **G28** `awaitIdle` on a `TestHost` waits for an idleness only stepping reaches; called from the test's
  own fiber it never returns. `runUntilIdle` is the stepping form.
- **G29** `pending` must be read at a settlement point, like `step`: right after an operation returns,
  the transition it started may not yet have reached the scheduler. Detecting a settlement point
  needs a quiescence signal Effect does not expose; the prototype yields until the observable state
  (revision, pending items) is unchanged for 64 yields — a heuristic that user code which yields
  without changing anything could defeat.
- **G30** BEH-BR-177 forbids an alternate scheduling path yet has `TestHost` own the scheduling. The
  prototype's resolution: one internal `Scheduling` interface through which the production host runs
  every transition step and contended wait; production's form runs them at once; it is not exported
  from the main entry point.
- **G31** Faults are injected by decorating definitions at the `TestHost`'s own entry points
  (`install`, `replace`, `reconcile`), which needs no production hook; the decoration must keep one
  object per (definition, realm), or `reconcile` (which compares definitions by object) replaces on
  every run. A child mounted by `Plugin.Runtime.install` passes through no such entry point, so a fault
  cannot target it.
- **G32** BEH-BR-142 (as amended for G23) covers a listener interrupted by its plugin's removal; a
  listener whose contribution is withdrawn after the dispatch began but before its turn is not
  covered. The prototype treats both alike (a `ListenerRemoved` defect).

Not covered: a slow `changes` subscriber skipping registry revisions; "keeps no reference" of
BEH-BR-175 (not observable without `WeakRef`); `TestHost.layer`; `PendingStep` for waits on the call
order (admission, linearization). The acceptance checks of BEH-BR-183 and BEH-BR-184 now run on a
`TestHost` (next section).

## P5 exit criterion — the suites of P1–P4 on `TestHost` (CCR-BR-012)

Every suite of P1–P4 now builds its host with `Testing.make` and takes its sink, gate and identifier
generator from the testing entry point (`test/fixtures.ts`: `withHost`, `memorySink`,
`scriptedGate`; `test/p4fixtures.ts`: `run`). Two exceptions stay on `Host.make` on purpose: check 20
(`ManagedRuntime` hosting), which concerns `Bridger.make` itself, as BEH-BR-183 allows; and
`confluence-p4` (100 seeded histories), kept as the production-host counterpart of `confluence-p5`.

A test that awaits a mutating call or a handle now uses `drive(host, effect)`: fork it, `step` until it
settles, and only yield while nothing can be stepped (it reads no clock, so it also runs under
`TestClock`). `idle(host)` is `drive(host, host.awaitIdle)`. This is the pattern BEH-BR-178 describes,
written once. Where a test used to wait for a transition to begin with `Effect.sleep(10)` or a
polling loop, it now steps that plugin (`stepPlugin`) and asserts the state. That replaced 15
timing waits and polling loops.

New: check 4 live, with every cell of the state × operation table (7 settled rows × 8 operations).
Each row is reached on a `TestHost`:
- `starting`: the build is left unstepped;
- `waiting`: a requirement is missing;
- `failed`: through `Fault.buildFails`;
- `failed-cleanup`: through `Fault.stopFails` and a restart.

The faults are scoped so that they end once the row is reached. Each cell is classified from the
call's exit and its terminal audit record (`noop`). A mutation of each of four rows of
`src/legality.ts` failed exactly the matching cell (4 of 4 caught).

Finding for the specification (CCR-BR-012):
- **G33** BEH-BR-040 defined idle as "no transition is running". A stop requested by the host, not
  by an operation, had no flight and no state change until it began. Examples are the unmount of a
  failed activation's children and a cascade. While a `TestHost` held such a stop, `awaitIdle`
  returned with the child still `active`. Found by the P4 children and group tests once they ran on
  `TestHost`. In the prototype, the host now counts stop steps from the moment they are requested
  (`stopsRequested` in `src/host.ts`). With that count reverted, 2 tests fail. On the production
  host a requested stop begins at once, so nothing observable changes there.

Observations, not changes:
- BEH-BR-034's cancellation of a build that has not begun is reachable on a `TestHost` only through
  the slot limit. `step` and `stepPlugin` release a plugin's items in arrival order, so a stop
  requested after a build always finds the build begun. The test uses `concurrency: 1`. A step API
  that selects by item kind would reach the cell directly; none is specified.
- `CloseReport.durationMs` counts clock time advanced while a step is pending. The shutdown test
  therefore advances the clock to exactly the overall limit before stepping the last stop.
- `drive` (above) is what nearly every converted test needed. It is a candidate for the testing
  entry point, but it is not specified and was not added there.

Suite: 227 passed in each of six full runs; `tsc --noEmit` clean.

## CCR-BR-014 — configuration fingerprint port, Host.controls, presented definition (prototype)

The core prerequisite of P6, prototyped before the specification was amended. What was built:
- `src/gxp.ts`: the optional `ConfigFingerprinter` port (`select`, then `fingerprint`), its error
  `ConfigFingerprintFailed`, the call error `ConfigFingerprintUnavailable { operation, message }`,
  the fingerprint format `/^[A-Za-z0-9._:-]{1,200}$/`, `ConfigChange { paths, fingerprints? }` on
  `AuditRecord` and `OperationRequest`, `AuditRecord.definition?`, and the writer's `lastWritten`.
- `src/host.ts`: step 4a (`fingerprintsOf`), after validation and before the gate. `install` with
  `config` hands over the raw top-level keys (form "raw"), `reconfigure` with a value the changed
  decoded paths (form "decoded"); a clear calls nothing. `select` must return a subset of the
  changed paths without duplicates, and `fingerprint` must answer exactly the selected paths in the
  format; anything else, a failure, a defect or `fingerprintTimeout` (default 5 s) fails the call
  with `ConfigFingerprintUnavailable`, whose message core writes ("selection outside the changed
  paths", "malformed answer", "timeout", or the port error's `_tag`), logged at error level by
  operation and target. Fingerprints are stored with the override and reused, without calling the
  port, on the `intent-ended` record of a reverted override. `host.controls` returns `HostControls`
  (`hostId`, `wired`, `attribution`, the three timeouts, `idGenerator`, and `auditPosition` with a
  sink), readable after close; `CloseReport.auditLastSeq` with a sink; `requested` and `rejected`
  records of plugin-addressed operations carry `definition`, terminal records do not.

Scenarios (`test/ccr14.test.ts`, 11 tests):

| Scenario | Behaviours |
| -------- | ---------- |
| `reconfigure` with a value: only the selected changed paths are fingerprinted, before the gate; request and records carry equal `configChange`, never the value | BEH-BR-188, 197, 219 |
| `install` with `config`: raw top-level keys; clearing the override calls nothing | BEH-BR-188, 197 |
| A fingerprinter that fails, dies, hangs, answers an unselected path or answers a malformed fingerprint (5 tests): no gate, no record, no change, no port text | BEH-BR-188 |
| No fingerprinter wired: paths only, nothing else changes | BEH-BR-015, INV-BR-026 |
| An ended intent restores the earlier override's stored fingerprints without calling the port | BEH-BR-188, 197 |
| `Host.controls` reports wiring and limits; `lastWritten` follows the writer; `CloseReport.auditLastSeq`; readable after close | BEH-BR-106, 212 |
| `requested` and `rejected` records carry the presented definition, so a refused `replace` keeps its incoming digest | BEH-BR-195, 219 |

Mutations, each applied alone and reverted (7 of 7 caught): the gate request without
fingerprints; all changed paths handed over instead of the selected ones; malformed answers
accepted; the port's text forwarded in the error; stored fingerprints dropped on `intent-ended`;
`definition` missing on `rejected`; `lastWritten` not reported.

Finding for the specification (CCR-BR-014):
- **G34** The `CloseReport` is produced before the shutdown's own terminal record is written, so
  `CloseReport.auditLastSeq` cannot include that record. The specification now defines
  `auditLastSeq` as the highest number written when the report is produced (BEH-BR-106) and
  requires `Host.controls` to stay readable after close, so the final position can be read once
  the writer has flushed (BEH-BR-212).

Prototype defect fixed along the way (not a specification finding): `install` with `config` did
not record `configChange.paths`, although BEH-BR-197 required it; it now does.

Not covered: fingerprints on a resumer's terminal record (BEH-BR-200); `reconcile` entries (they
pass through the same call path, untested); the contents of `controls.attribution` beyond its
presence.

Suite: 238 passed; `tsc --noEmit` clean.

## P7 (round 2): core 26–34

**This prototype evidences no requirement (CCR-BR-004, ADR-BR-035).** Its tests find specification
defects; passing them shows nothing about `@bridger/core`. Work done for round 2, phase 2, workstream WS8.

### Baseline and Effect version

- Baseline on 2026-11-08 before any change: `npm ci`, `tsc --noEmit` clean, **227 tests in 18 files, all
  passing**. The previous section records 238 tests in 19 files; the difference is `test/ccr14.test.ts`, which
  is absent from the working tree (its code in `src/gxp.ts` and `src/host.ts` is present). It was never committed
  and is lost; the second pass **reconstructed** it (see below).
- Effect stays at **4.0.0**. Owner decision D5 asks for 4.1, but on 2026-11-08 `npm view effect time` gives
  4.1.0 = 2026-10-29, 4.1.1 = 2026-10-30, 4.1.2 = 2026-11-02: no 4.1.x release is two weeks old yet. Under the
  two-week rule 4.1.0 becomes eligible on **2026-11-12** (4.1.2 on 2026-11-16).
- After the first pass: 274 tests in 25 files. **After the second pass: 319 tests in 29 files, all passing**
  (repeated full runs), `tsc --noEmit` clean. The
  227 earlier tests pass unchanged; the only edits that touch them are additive fields (`auditDropped` on every
  record, `registeredAt` on entries) and the reconcile order of BEH-BR-156, which the P4 reconcile suite accepts.

### What was built

| Area | Files | What |
| --- | --- | --- |
| core 26 | `src/contract.ts`, `src/host.ts`, `src/registry.ts` | `Contract.make`/`method`/`at`/`range`, grammar, `satisfies`, `maxSatisfying`, descriptor with `timeouts`, `parseOptions`; validation of references in `requires`/`optional`/`provides`; `IncompatibleContract` after `DependencyCycle` (dependent side, then provider side by id); `KeyMismatch` relaxed between two contract references; `baseContracts`; optional incompatible = absent; contract registries (`contract`, `range`, `implements`, `within`) (K3) |
| core 27 | `src/manifest.ts`, `src/host.ts` | manifest decode (path-naming, value-free), agreement with an eager definition, `engines` / `IncompatibleEngine`, `consentDiff`, `Plugin.lazy`, `dormant` state and row, triggers (`OnService` from waiting dependents, `wake` for all three kinds), `load` in the build slot under `buildTimeout` with `LoadFailed`/`ManifestMismatch` (phase "load", sticky, `retry` reloads), `lazy-triggered` record before `system-start`, `plugin-triggered`, `declaredContributions`, `Host.link`, `HostLink.reference`/`none` |
| core 31 | `src/hooks.ts` | hook points over a registry: `who`, roles, effective `onError`, targets, phases enrich → veto → advise, per-hook timeout in supervised fibers, deadline, policy `Run`/`Skip`/`Deny`, `settle`, breaker per contribution or per plugin, decision and breaker records, the dormant wake step (K1) with `wake`/`deny`/`skip`, `declared-refused`, `wake-failed`/`wake-timeout`, `no-host-link`, `target-failed` |
| core 32 | `src/gate.ts`, `src/host.ts` | `Gate.run`, `Gate.all`, `Draft.check`, `OperationGate.fromGate`/`asGate`; `Host.plan`; reconcile order of BEH-BR-156; `expect` (at the call and at the intent); `atomic` with undo in reverse, `undo: true` on the gate request, `undoes` on records, `ChangedSinceApply`, `ApplyRolledBack`, `PartialApply`, `reconcile-partial` |
| core 30 (part) | `src/annotations.ts` | keys with flows, branded immutable bag, combine/monotonic, `filter`, `encode`, `resolve`, the three core keys; read by `Gate.run` only |
| core 33 (part) | `src/actor.ts` | `Actor.narrow`, `Actor.isWithin` |
| core 34 | `src/host.ts`, `src/plugin.ts` | `handoff` on definitions; export after drain and before scope close on `replace` of an active plugin (and `restart` under `alsoOn`, unless `cold`); upgrade/decode/import before publication; one `handoff` record before `system-start`; `handoff-imported`/`handoff-lost`; loss tags |
| K4, K10 | `src/gxp.ts`, `src/host.ts` | `RefusalList` at step 4b (one `rejected` record, no gate) and at system starts and triggers (`disabled`, reason "refused-digest", `start-refused`); `auditDropped` on every record; lone-surrogate sanitising with `sanitized: true`; `HostControls.buildTimeout` |

Deliberate simplifications: durations are milliseconds; the hook point reads the owner from `ActivePlugin`
(no plugin principal); `PlanStale` carries a message, not `mismatches`; the plan's `configChange.paths` for a
`reconfigure` entry are computed from raw values; `registeredAt` is set in `commit` when the definition, override,
disabled flag or ownership object changes; `replace` with a lazy definition is not supported; handoff
abandonment on `waiting`, removal and shutdown is not implemented (the held value then waits for the next build).

### Acceptance checks 59–111

Covered (test files `test/p7-*.test.ts`; "partial" names what is missing):

| Check | Status | Test / what is missing |
| --- | --- | --- |
| 59 | covered | p7-contracts (install and replace; `enable` goes through the same `validate`) |
| 60 | covered | p7-contracts |
| 61 | partial | p7-contracts; `whenAvailable` not exercised |
| 62 | partial | p7-lazy; unknown properties are kept by construction, `inspect().manifest` not implemented |
| 63 | partial | p7-lazy; slots, triggers, dormant row; cycle detection and contract checks from the manifest, `reconfigure` paths and form "raw" not asserted |
| 64 | partial | p7-lazy; eager dependent wakes, `wake` kinds, reads wake nothing; event dispatch wakes not implemented |
| 65 | partial | p7-lazy; operations during a load and the `loading` flag not asserted |
| 66 | partial | p7-lazy; gate request `definition.manifest` / `previousManifest` not implemented |
| 74 | partial | p7-gate; bag rules only, no host integration |
| 77, 78, 94 | covered | p7-hooks |
| 79 | partial | p7-hooks; the no-owner principal rule not testable without core 28 |
| 80 | partial | p7-hooks; `Selector` not implemented |
| 81 | covered | p7-gate |
| 82 | partial | p7-gate; the 25 — Operation Gate scenarios were not rerun through the adapter |
| 83 | covered | p7-reconcile (plan, stale at the call, stale at the intent, recorded paths for an install entry) |
| 86 | partial | p7-gate; `Actor.narrow`/`isWithin` only, not `Realm.ephemeral` |
| 87 | covered | p7-handoff |
| 88 | partial | p7-handoff; abandonment on `waiting`/removal/shutdown, cascade-ended parked replace, replace into `dormant` |
| 92 | covered | p7-hooks (with a real host and lazy plugins) |
| 93 | covered | p7-hooks |
| 95 | covered | p7-hooks |
| 98, 99 | covered | p7-reconcile |
| 100 | partial | p7-reconcile; only `ChangedSinceApply` — parked `DrainTimeout`, latch, shutdown, interruption, next reconcile waiting not tested |
| 102 | covered | p7-contracts (except the `Selector` range) |
| 103 | partial | p7-handoff; `restart` and `cold`; `reconfigure` under `alsoOn` and dependents not tested |
| 104 | partial | p7-gate; operator call and lazy trigger; cascade and background restarts and mounts not implemented |
| 108 | covered | p7-gate |

The two tests the recheck names: "a lazy veto plugin denies on its first dispatch" and "a failing wake denies"
(p7-hooks, with a real `TestHost`, `Plugin.lazy` and `host.link`); "an atomic bundle switch applies in either
list order, or not at all with `ApplyRolledBack`" (p7-reconcile). The confluence property is extended in
`test/p7-confluence.test.ts`: 30 seeded random histories mixing lazy installs, `wake`, `plan` (asserted to change
nothing), `replace` with handoff, restarts and random step orders.

(First pass; superseded by the second pass below.) Not covered, with the reason: **67–70, 105, 109** (core 28: principals, `onBehalfOf`, mandatory interceptions,
`allowChildren`, `AccessPolicy`) — a per-activation principal threads through every fiber the host starts and
was out of reach in this pass; **71–73, 107, 110, 111** (core 29: `CapabilityPolicy`, grants, `CallLog`,
`offerCallEntry`, `PrincipalRef`) — they depend on the principal; **75, 76, 106** (annotation propagation,
audit keys, `CurrentCorrelation`) — need host-wide context plumbing; **84, 85** (realm families, idle eviction,
`retireRealm`); **89** (sub-scope child mount); **90** (`Plugin.Any`, a compile-time check); **91**
(`Plugin.Runtime.entitled`); **96** (held event); **97** (idle return); **101** (`mandatoryCatalog`). All: time.

### Mutation checks

Each mutation applied alone by a script, the named P7 suite run, then the file restored. 14 of 14 caught.

| # | Mutation | Result |
| --- | --- | --- |
| M1 | contract condition 3 applied below the dependent's copy | caught (2 tests) |
| M2 | reconcile change phase in list order | caught (3) |
| M3 | atomic: no undo | caught (2) |
| M4 | undo gated without `undo: true` | caught (1) |
| M5 | `ChangedSinceApply` check skipped | caught (1) |
| M6 | `OnService` triggers not applied | caught (1) |
| M7 | loaded digest not compared | caught (1) |
| M8 | hook wake step never calls `wake` | caught (3); a first M8 (drop the first registry poll) survived and is an equivalent mutation: the loop finds the contribution on the next branch |
| M9 | enrichments not passed to veto hooks | caught (1) |
| M10 | deadline expiry ignores `onError: "deny"` of uncompleted vetoes | caught (1) |
| M11 | `RefusalList` step 4b skipped | caught (1) |
| M12 | handoff import skipped | caught (3) |
| M13 | `Gate.all` returns the first deferral at once | caught (1) |
| M14 | a refused dormant plugin is still triggered | caught (1) |

### Findings for the specification (G-P1 … G-P12)

Exact proposed edits are in the round-2 notes (`P2-WS8.md`); none was applied here.

| # | Finding | Where |
| --- | --- | --- |
| G-P1 | `Contract extends Context.Key` but declares `key: Context.Key`: in Effect 4 every key already has `key: string`, read by `Context.add`/`get`. Built on a class key, `name` also collides with the read-only `Function.name`. Not implementable as written | BEH-BR-225 |
| G-P2 | Whether `install` with `disabled: true` is checked for `IncompatibleContract` is not said (it forms no registered pair) | BEH-BR-228 |
| G-P3 | The wake window is "deadline less one `timeout`", but `timeout = deadline` is valid: the window is empty and every dormant veto declaration ends "wake-timeout" (shown by a test). A call `deadline` or a `Deadline` annotation can empty it too | BEH-BR-297, 309 |
| G-P4 | A woken contribution takes part as soon as it is in the registry, while its plugin is still `starting`; its build may then fail. Not stated either way | BEH-BR-309 |
| G-P5 | A manifest `RequiredRef` with `range` but no `version` is unclassified (contract or plain key?) | BEH-BR-241 |
| G-P6 | `consentDiff` does not classify an egress `purpose` change on an unchanged host, nor give the shape of `methods` going from a list to absent | BEH-BR-243 |
| G-P7 | Confluence does not hold for lazy plugins: a history that woke one ends with it loaded and `active`, a direct install leaves it `dormant` (shown by the property test) | BEH-BR-160, 252 |
| G-P8 | `Actor.isWithin` treats an actor whose own id contains "/" as a narrowing ("acme/alice" is within "acme") | BEH-BR-337 |
| G-P9 | `PlanStale.mismatches` items need `id` and `realm`, but host-level mismatches (`hostId`, `scope`, prune options, `atomic`, `unchanged`/`rejected` sets) have none | BEH-BR-319 |
| G-P10 | `plan` MAY decode a `reconfigure` value, yet check 83 requires the plan's `configChange.paths` to equal the recorded (decoded) ones: MAY must be MUST | BEH-BR-317, check 83 |
| G-P11 | `settle`'s outcome for a hook interrupted by the dispatch deadline is not named ("interrupted"? "timeout"?); the record says "deadline" | BEH-BR-302, 303 |
| G-P12 | "every record carries `sanitized: true`" — every record of the call, or also system records caused by it (which carry its sanitised correlation)? | BEH-BR-185, check 108 |

### Second pass (round 2, WS8): every check 59–111 has a passing test

Built (all in `prototypes/host-core`):

| Area | Files | What |
| --- | --- | --- |
| core 28 | `src/policy.ts`, `src/host.ts`, `src/bus.ts`, `src/registry.ts` | `CurrentPlugin` (`get`, `require`, minted per activation, `PrincipalForged`, `PrincipalRetired` after the scope closes), `Plugin.Runtime.principal`/`asSelf`, `onBehalfOf` on requests and records (also reconcile entries and root `lazy-triggered`), mandatory interceptions at host, realm and installation level in the order of BEH-BR-261 (Host.use/useAll/lease get "all" layers only), `allowChildren` (`ChildNotAllowed`, `child-refused`), `AccessPolicy` on listen/emit/contribute/child (`AccessDenied`, "policy-defect"), `declaredOnly`, `ask`, `RefusalList` on child mounts, `mandatoryCatalog` with `DesiredPlugin.mandatoryInterceptions`/`allowChildren` and `PolicyMismatch`, request fields `allowChildren`/`mandatoryInterceptions`, `controls.policy` |
| core 29 | `src/policy.ts`, `src/host.ts` | `CapabilityPolicy` on every route with `resolutionTimeout`, `Grant.of`/`all`, the grant proxy (`CapabilityDenied`), `changes` re-resolving live captures, `CallLog` (`select`, bounded queue, `onFailure` drop/refuse, `CallLogUnavailable`, counters in `controls.callLog`, `callLogTimeout`), `CurrentCall`, `offerCallEntry` with entry kinds and `InvalidCallEntry`, `PrincipalRef` encode/decode |
| core 30, 22 | `src/policy.ts`, `src/host.ts`, `src/bus.ts` | annotations resolved at step 2, gate-flow on the request, audit-flow (encoded, sorted, `annotationsOmitted`) on records, events-flow for listeners, empty in builds, `Deadline` shortening the gate and a `use` with a timeout; `CurrentCorrelation` (context, else fiber, else generated; set for the call's work; listeners follow); `CallerContext.current`/`serve` |
| core 27 rest | `src/host.ts`, `src/bus.ts` | event dispatches wake `OnEvent` plugins and hold the event (delivery once to the woken plugin's `on` listeners; drops `no-listener`, `activation-failed`, `ended`, `timeout`); idle return with `lazy-idle` and `plugin-idled` |
| core 33 | `src/realms.ts`, `src/host.ts` | `Realm.family` (lazy creation per key, shared, invalid key, options changed, failed until reset, idle eviction through reconcile with `pruneDrain`/`pruneForce: false`, family events), `Realm.ephemeral`, `Host.retireRealm` (`RealmInUse`) |
| core 10, 14, 01 | `src/host.ts`, `src/plugin.ts` | `Plugin.Runtime.entitled` with the optional `EntitlementView`, `Plugin.Runtime.unmount` (`unmount-requested`, `requestedBy`), children under a sub-scope removed at its close, `Plugin.Any` (compile-time brand) |

**`test/ccr14.test.ts` was reconstructed.** The original was never committed and is lost. Its 11 scenario tests
were rebuilt from acceptance checks 55–58 in `references/core/behaviors/21-testing-host.md` and the CCR-BR-014
table above, against the source code that had survived. They pass without any change to that code. They are a
reconstruction, not the original file.

New test files: `test/p7-principal.test.ts` (10), `test/p7-capability.test.ts` (10), `test/p7-lifecycle.test.ts`
(14), `test/ccr14.test.ts` (11).

Coverage of checks 59–111 after the second pass. Every check has at least one passing test; "partial" names what
is still not exercised.

| Check | Status | Missing |
| --- | --- | --- |
| 59, 60, 77, 78, 81, 83, 87, 92–95, 98, 99, 102, 108 | covered | — |
| 64, 69, 71, 73, 86, 90, 101, 105, 107, 109, 110, 111 | covered (second pass) | — |
| 67, 68, 70 | covered | 67: a finalizer that removes a child; 70: the "a child cannot widen it" case is only the trivial one |
| 61 | partial | `whenAvailable` with an incompatible optional contract |
| 62, 63, 65, 66 | partial | as in the first pass (inspect manifest, cycle and contract checks from manifests, operations during a load, gate `definition.manifest`) |
| 72 | partial | a grant on `Bridger.Host` itself (the generic narrowing is tested) |
| 74, 75, 76 | partial | `Annotations.decode` and the "wire" filter (75); a `Redacted` value and size limits (76) |
| 79, 80 | partial | the no-owner principal of hooks (hooks read `ActivePlugin`); `Selector` |
| 82 | partial | the operation-gate scenarios were not all rerun through the adapter |
| 84, 85 | partial | 85: a use arriving during an eviction |
| 88, 100, 103 | partial | as in the first pass |
| 89 | partial | dependents of the child, drain and revocation at the scope close |
| 91 | partial | a `watch` that fails or dies (ending early is tested) |
| 96 | partial | `parallel`/`serial`/`waterfall` triggering dispatches; "ended" by replace, disable, idle and host close (removal while `waiting` is tested) |
| 97 | partial | a trigger applied during the idle stop |
| 104 | partial | cascade restarts and background restarts of a refused digest |
| 106 | partial | system transitions and the diagnostic channels |

Second-pass mutations (each applied alone, the named suite run, then the file restored): **13 of 13 caught**.
One mutation (N9) first survived because the test's application listener was never registered (it ran in a
`use` callback with no scope). The test was fixed, and N9 is now caught.

| # | Mutation | Result |
| --- | --- | --- |
| N1 | `onBehalfOf` not recorded | caught (2) |
| N2 | forged principal accepted | caught (1) |
| N3 | host mandatory before realm mandatory | caught (1) |
| N4 | `allowChildren` ignored | caught (1) |
| N5 | grant narrowing lets every member through | caught (2) |
| N6 | call-log "refuse" treated as "drop" | caught (1) |
| N7 | fiber correlation ignored by mutations | caught (2) |
| N8 | listener not run under its owner's principal | caught (1) |
| N9 | held event delivered to every `on` listener | caught after the test fix |
| N10 | idle ignores leases | caught (1) |
| N11 | `retireRealm` retires a non-empty realm | caught (1) |
| N12 | sub-scope child not removed at scope close | caught (1) |
| N13 | a refused required capture does not fail the activation | caught (1) |

New findings (G-P13 … G-P18). The exact proposed edits are in the notes.

| # | Finding | Where |
| --- | --- | --- |
| G-P13 | "`Grant.all` adds no layer" contradicts `changes`, which must narrow *later calls* of a live capture: without a layer the host cannot narrow a captured object. The prototype adds a layer when the policy has `changes` | BEH-BR-275, 281 |
| G-P14 | A `remove` or `disable` that arrives while a lazy plugin is loading waits for the load (the `starting` rows), so the held event is delivered or dropped "activation-failed", never "ended". The reason for this race is not defined | BEH-BR-251, 246 |
| G-P15 | `Plugin.Any` cannot be written as `PluginDefinition<any, any, any>`, nor with a `Layer<any, any, any>` build: Layer's output is declared `in out` in Effect 4, so a `Layer<never>` is not assignable to it. The type must erase the build | BEH-BR-001, 017 |
| G-P16 | For `Host.use`/`useAll`/`lease` from plugin code, it is not said whose realm's mandatory layers apply: the call's `realm` option or the caller's realm. The prototype uses the call's realm | BEH-BR-262 |
| G-P17 | Idle return's conditions "no contribution it added is held by a registry `use`/`useAll` or dispatch" and "no listener of it is running" cannot be observed by the host: registries and hook points live outside it, and `ActivePlugin` reports contributions, not holds. Unimplementable as written; the prototype checks leases, children and dependents only | BEH-BR-252 |
| G-P18 | `CallLog` "refuse" does not say when capacity is judged. Before the call, the call is refused. After it, the call has already run and only the entry is lost, which is "drop". The prototype judges before the call | BEH-BR-279 |

### P7 third pass (CCR-BR-029 alignment)

Round 2, WS8c. The prototype follows the core text as amended by CCR-BR-029 (behaviours 18, 25–29, 31, 32). It
evidences no requirement. **After the third pass: 340 tests in 32 files, all passing (three full runs), `tsc
--noEmit` clean.** The 319 earlier tests pass. Three were edited because they relied on behaviour the
amendment changed: in `p7-hooks`, unit points dispatched with `HostLink.none` now set `allowNoLink: true`, and the
G-P3 test now expects `make` to refuse `timeout = deadline` when a veto may be woken; in `p7-capability` (check 107),
the first half now expects a "refuse" call to wait for its record. New files: `test/p7-ccr29-reconcile.test.ts` (7),
`test/p7-ccr29-hooks.test.ts` (8), `test/p7-ccr29-policy.test.ts` (6).

| Item | Change (files) | Tests |
| --- | --- | --- |
| R1-01 | The undo of `replace` is `replace` and then, when the entry's previous override is not none, `reconfigure` with it. "Previous" is read per entry, from before the entry's first action. `PlannedEntry.undo` and `reasonRequiredFor` list both actions (`host.ts`) | regression: an undone `[replace]` builds again with `{n:1}` and the plan lists `["replace","reconfigure"]` |
| R1-02 | Each undo check compares `registeredAt` with the revision this call last produced on the plugin (`lastRev`, moved by forward and undo actions). The second action of a two-action step is checked too (`host.ts`) | regression: `[replace, reconfigure]` is undone in full (`ApplyRolledBack`, three undo records) instead of `PartialApply`/`ChangedSinceApply` |
| R1-03 | `declaredContributions` reports `idling` for a loaded plugin under an idle stop. `wake` and `OnEvent` dispatches keep a trigger that reaches it and apply it at `dormant`, the event held. The hook wakes an "idling" declaration and waits as for "dormant" (`host.ts`, `hooks.ts`) | a dispatch during the idle stop is decided by the woken veto, which is loaded twice |
| R1-04 | `refused` for a lazy registration `disabled` with "refused-digest"; an operator's disable is not reported. The hook records "wake-failed" without a wake and lets `onError` decide | deny and skip; no `lazy-triggered` record |
| R1-05 | Declarations are matched by id, owner and role. A same-id contribution of another owner or role keeps the declaration and tags its step `DuplicateContribution`. A wake completes only with the declaring owner's contribution (`hooks.ts`) | regression: an advisory squatter under the veto's id no longer hides it (`wake-failed`, not `Allowed`) |
| R1-06 | `HostLink.hostId`, set on `Host.link` and absent on `HostLink.none`. Records carry `link`: the hostId, "none", or absent with no link. `HookPointOptions.allowNoLink` (default false) lets `HostLink.none` through (`host.ts`, `hooks.ts`) | none denies; with `allowNoLink` it is allowed and recorded "none"; the host link is recorded by its hostId |
| R1-07 | The diff reads the operator's `disabled` flag. `registeredAt` tracks that flag. An operator `disable` of a refused registration clears the reason and moves `registeredAt`. `plan` and atomic validation ask the `RefusalList` for each action step 4b would submit and list `OperationRejected` "refused-digest: …" in `rejected` (one shared `refusalOf` with step 4b). Plan rejections carry their real realm (`host.ts`) | plan, atomic (no record), non-atomic (one `rejected` record), stale plan when the list changes; refused registration: no `enable`, `registeredAt` unchanged, operator takeover |
| R1-08 | The wake window is reduced by one more `timeout` when the view has an enrich contribution or an enrich declaration is to be woken (`hooks.ts`) | the same 250 ms load is woken without enrich work and is "wake-timeout" with it |
| R1-09 | A declarations read that fails, dies or outlasts the effective deadline denies `no-host-link` on a point with codes. On a point without codes it is "unseen" | dying and never-ending links |
| R1-10 | A declaration seen "waking" through a whole, non-empty window is recorded "wake-timeout" at once until its status changes (hook-level state per (pluginId, realm, id)) | the second dispatch takes < 50 ms |
| R1-11 | Undo removals already used `pruneDrain`/`pruneForce` whatever `prune` is. This is now tested | `prune: false`: forced removal → `ApplyRolledBack`; unforced → `PartialApply` `DrainTimeout` |
| R1-12 | A step-4b refusal of a forward action stops an atomic apply. Its `failed` reason keeps the message "refused-digest: …" (`reasonOf`) | a digest listed by the gate during the first action stops the apply and undoes it |
| G-P3 (CCR-BR-028, not yet built) | `HookPoint.make` refuses `timeout = deadline` when codes are non-empty and the veto dormant policy is "wake" | the old G-P3 test |
| G-P14 | A stop that waits for a running load or build keeps the held event: a failure drops it "activation-failed". A success is discarded by the `starting` row, so "ended" is used (G-P19). A published activation now delivers its held event inside the publishing turn, before any waiting stop. The other activation-failure paths also drop "activation-failed" (`host.ts`) | load fails during `remove` → "activation-failed"; load succeeds → one "ended" drop, nothing delivered |
| G-P16 (not adopted) | `Host.use`/`useAll`/`lease` from plugin code applies the plugin's installation set, then its registration realm's set, then the call realm's set when the call names another realm, then the host's set. "plugins" layers apply to every plugin consumer (`host.ts` `deliver`) | trails `install, realm-t, (realm-u,) host, host-plugins`; the application gets `realm-u, host` |
| G-P17 | Idle conditions: leases (which cover `use`/`useAll` callbacks), running `Bridger.Events` listeners (counted by the bus per owner), children, dependents. Registry holds are not conditions (`bus.ts`, `host.ts`) | a 150 ms listener run keeps an `idle: 20` plugin active; it then idles |
| G-P18 | Call-log slots last from queue or reservation until `record` returns. "refuse" reserves before the member runs and waits for `record`; a failed or timed-out record dies `record-failed`/`record-timeout`. Waiting calls die `host-closing` at close. "drop" is judged after the call (`host.ts`) | an offered entry is dropped while a reserved call runs, and the call completes; a failing record withholds the value |

The note on G-P15 in `src/plugin.ts` was corrected: G-P15 was not adopted, and effect 4.0.0 declares
`Layer<in ROut, out E, out RIn>`.

Third-pass mutations: each was applied alone by a script, the named new suite was run, and the file was restored. **14
of 14 caught.**

| # | Mutation | Result |
| --- | --- | --- |
| Q1 | undo of `replace` without the `reconfigure` (R1-01) | caught (2) |
| Q2 | `lastRev` not moved by undo actions (R1-02) | caught (2) |
| Q3 | declarations matched by id only (R1-05) | caught (1) |
| Q4 | `HostLink.none` accepted without `allowNoLink` (R1-06) | caught (1) |
| Q5 | `plan` does not ask the `RefusalList` for installs (R1-07) | caught (1) |
| Q6 | "refused" not reported (R1-04) | caught (1) |
| Q7 | plugin `Host.use` without its installation set (G-P16) | caught (1) |
| Q8 | listener runs not an idle condition (G-P17) | caught (1) |
| Q9 | no enrich allowance in the window (R1-08) | caught (1) |
| Q10 | a long "waking" declaration waited for again (R1-10) | caught (1) |
| Q11 | "refuse" call does not wait for its record (G-P18) | caught (2) |
| Q12 | "idling" not reported (R1-03) | caught (1) |
| Q13 | held event not kept across a waiting stop (G-P14) | caught (1) |
| Q14 | diff reads `disabled` including "refused-digest" (R1-07) | caught (1) |

Deliberate simplifications: a `HostLink` with no `hostId` is treated as `HostLink.none` (G-P20). Prune options
are compared by `expect` whether or not `prune` or `atomic` is set (G-P23). A `WakeReport` returned during an
idle stop does not list the kept trigger, as BEH-BR-245 implies (G-P22). An `offerCallEntry` under "refuse" still does not wait for
`record`.

New findings (G-P19 … G-P24). The exact proposed edits are in the round-2 notes (`P2-WS8c.md`). None was applied here.

| # | Finding | Where |
| --- | --- | --- |
| G-P19 | "If it publishes, the held event MUST be delivered before the stop begins" cannot happen. The `starting` row of 08 discards a build that settles under `remove`, `replace` or `disable`, so it never publishes. The reason for a successful discarded build is then undefined, because "ended" is excluded while a build runs | BEH-BR-251, BEH-BR-071 (08 table) |
| G-P20 | `HostLink.hostId` is optional, but only `HostLink.none` is named. What is recorded as `link`, and whether a veto point denies, for a link that is not `HostLink.none` and has no `hostId`, is not said | BEH-BR-250, 305, 309 |
| G-P21 | "Waited for through one whole wake window": the text does not say whether a window that a call `deadline` or a `Deadline` annotation shortened counts as whole | BEH-BR-309 |
| G-P22 | A trigger kept during an idle stop has not moved the plugin out of `dormant` when `wake` returns. BEH-BR-245 therefore implies that `WakeReport.triggered` leaves it out, and a caller cannot tell "kept" from "matched nothing". This is a documentation gap only | BEH-BR-252, 245 |
| G-P23 | BEH-BR-319 compares `pruneDrain`/`pruneForce` without condition. BEH-BR-155 says they are ignored when `prune` is false, and BEH-BR-326 says `plan` and `expect` compare them "whenever `atomic` is true". It is not said whether they are compared with `prune: false` and no `atomic` | BEH-BR-155, 319, 326 |
| G-P24 | Two-action undo step: when its `replace` completes and the `reconfigure` is refused, fails or is skipped by `ChangedSinceApply`, the text does not say how the step is reported (`undone`, `notUndone` or both) or which action the reason names | BEH-BR-323, 324 |

## Output of the run recorded on 2026-10-03

```

 RUN  v3.2.7 /Users/mohammadalmechkor/Documents/ChatGPT/Bridger/prototypes/host-core

stdout | test/ccr14.test.ts > CCR-BR-014: the ConfigFingerprinter port (step 4a) > a fingerprinter that fails fails the call closed: no gate, no record, no change, no port text
[15:27:46.935] ERROR (#76): config fingerprinter: reconfigure x/cfg@default: configuration fingerprints unavailable: ConfigFingerprintFailed

stdout | test/ccr14.test.ts > CCR-BR-014: the ConfigFingerprinter port (step 4a) > a fingerprinter that dies fails the call closed: no gate, no record, no change, no port text
[15:27:46.990] ERROR (#99): config fingerprinter: reconfigure x/cfg@default: configuration fingerprints unavailable: defect

stdout | test/ccr14.test.ts > CCR-BR-014: the ConfigFingerprinter port (step 4a) > a fingerprinter that hangs fails the call closed: no gate, no record, no change, no port text
[15:27:47.071] ERROR (#122): config fingerprinter: reconfigure x/cfg@default: configuration fingerprints unavailable: timeout

stdout | test/testhost.test.ts > TestHost: faults (BEH-BR-180) > stopFails: closing the activation fails — phase cleanup, CleanupError to the caller
[01:00:00.000] ERROR (#168): shutdown: example/logger cleanup: injected fault: stopFails

stdout | test/ccr14.test.ts > CCR-BR-014: the ConfigFingerprinter port (step 4a) > a fingerprinter that answers an unselected path fails the call closed: no gate, no record, no change, no port text
[15:27:47.120] ERROR (#146): config fingerprinter: reconfigure x/cfg@default: configuration fingerprints unavailable: malformed answer

 ✓ test/testhost.test.ts (12 tests) 351ms
stdout | test/ccr14.test.ts > CCR-BR-014: the ConfigFingerprinter port (step 4a) > a fingerprinter that answers a malformed fingerprint fails the call closed: no gate, no record, no change, no port text
[15:27:47.169] ERROR (#169): config fingerprinter: reconfigure x/cfg@default: configuration fingerprints unavailable: malformed answer

 ✓ test/confluence-p4.test.ts (1 test) 511ms
   ✓ confluence (BEH-BR-160, P4 exit criterion) > random histories ending in the same installed set settle to equal snapshots  510ms
stdout | test/leases.test.ts > leases > check 18 / BEH-BR-082, 083: useAll is all-or-nothing and goes through the same drain path
[15:27:47.328] ERROR (#47): shutdown: example/audit drain: 1 lease(s) still held at the drain limit

 ✓ test/children.test.ts (12 tests) 565ms
 ✓ test/ccr14.test.ts (11 tests) 603ms
stdout | test/optional.test.ts > optional dependencies (BEH-BR-129–131) > BEH-BR-129, 130: optional is a point-in-time, unleased read; the provider leaving changes nothing; an undeclared key is None
[15:27:47.426] WARN (#17): undeclared optional dependency example/Metrics { plugin: 'ui' }

stdout | test/p2.test.ts > runtime failure (behaviour 10) > BEH-BR-090: restart restarts only the fiber; ignore logs and changes nothing; inspect reports them
[15:27:47.460] ERROR (#105): background loop failed Error: boom
    at causePrettyError (file:///Users/mohammadalmechkor/Documents/ChatGPT/Bridger/prototypes/host-core/node_modules/effect/src/internal/effect.ts:387:13) { plugin: 'x/worker' }

 ✓ test/reconcile.test.ts (12 tests) 757ms
 ✓ test/confluence.test.ts (5 tests) 874ms
 ✓ test/inflight.test.ts (34 tests) 1001ms
 ✓ test/realms.test.ts (10 tests) 207ms
stdout | test/optional.test.ts > reactive dependencies: whenAvailable (BEH-BR-132–136) > BEH-BR-134: a failed run follows the background policy — fail-plugin fails the plugin; ignore leaves it active
[15:27:47.876] ERROR (#126): whenAvailable whenAvailable#1: run failed { plugin: 'ui' }

 ✓ test/lifecycle.test.ts (13 tests) 329ms
 ✓ test/optional.test.ts (8 tests) 563ms
   ✓ reactive dependencies: whenAvailable (BEH-BR-132–136) > BEH-BR-133: a run's finalizers drain under the provider's limit, with DrainTimeout and force; the run's plugin is never stopped  328ms
stdout | test/bus.test.ts > event bus (behaviour 16) > BEH-BR-141: emit returns once listeners are started; a failure never reaches the emitter and is reported as listener-failed
[15:27:47.986] WARN (#41): listener of billing/invoice-posted failed Error: posting failed
    at causePrettyError (file:///Users/mohammadalmechkor/Documents/ChatGPT/Bridger/prototypes/host-core/node_modules/effect/src/internal/effect.ts:387:13)

 ✓ test/review.test.ts (6 tests) 400ms
 ✓ test/ordering.test.ts (3 tests) 220ms
 ✓ test/gxp.test.ts (11 tests) 1313ms
   ✓ fail closed and the latch (behaviour 23) > check 34: an unwritten terminal record latches; mutations are refused; shutdown and acknowledgement are allowed  531ms
 ✓ test/registry.test.ts (5 tests) 65ms
stdout | test/generation.test.ts > Generation (behaviour 20) > BEH-BR-173–175: a retired value's drain times out repeatably, force revokes and awaits finalizers; retired values drain independently
[15:27:48.154] WARN (#10): generation model: 1 lease(s) revoked

 ✓ test/bus.test.ts (7 tests) 238ms
stdout | test/generation.test.ts > Generation (behaviour 20) > finding G26: a forced drain of an `acquire` lease interrupts the acquiring fiber — a caller's Scope cannot be closed from outside
[15:27:48.162] WARN (#20): generation generation: 1 lease(s) revoked

stdout | test/generation.test.ts > Generation (behaviour 20) > BEH-BR-169: closing the generation's scope closes admission and drains everything, revoking at the limit
[15:27:48.185] WARN (#24): generation generation: 1 lease(s) revoked

 ✓ test/generation.test.ts (6 tests) 91ms
stdout | test/leases.test.ts > legality (BEH-BR-071) > live: install on failed-cleanup → duplicate-plugin
[15:27:48.533] ERROR (#827): shutdown: x/subject cleanup: injected fault: stopFails

stdout | test/leases.test.ts > legality (BEH-BR-071) > live: replace on failed-cleanup → conflict:cleanup-failure
[15:27:48.589] ERROR (#877): shutdown: x/subject cleanup: injected fault: stopFails

stdout | test/leases.test.ts > legality (BEH-BR-071) > live: retry on failed-cleanup → conflict:cleanup-failure
[15:27:48.619] ERROR (#900): shutdown: x/subject cleanup: injected fault: stopFails

stdout | test/leases.test.ts > legality (BEH-BR-071) > live: reconfigure on failed-cleanup → conflict:cleanup-failure
[15:27:48.649] ERROR (#923): shutdown: x/subject cleanup: injected fault: stopFails

stdout | test/leases.test.ts > legality (BEH-BR-071) > live: restart on failed-cleanup → conflict:cleanup-failure
[15:27:48.678] ERROR (#946): shutdown: x/subject cleanup: injected fault: stopFails

stdout | test/leases.test.ts > legality (BEH-BR-071) > live: disable on failed-cleanup → conflict:cleanup-failure
[15:27:48.708] ERROR (#969): shutdown: x/subject cleanup: injected fault: stopFails

stdout | test/leases.test.ts > legality (BEH-BR-071) > live: enable on failed-cleanup → conflict:cleanup-failure
[15:27:48.736] ERROR (#992): shutdown: x/subject cleanup: injected fault: stopFails

 ✓ test/leases.test.ts (63 tests) 2182ms
   ✓ leases > check 18 / BEH-BR-082, 083: useAll is all-or-nothing and goes through the same drain path  379ms
stdout | test/p2.test.ts > observability (behaviour 13) > BEH-BR-118: inspect shows parked and pending during a parked removal
[15:27:49.029] ERROR (#633): shutdown: example/logger drain: 1 lease(s) still held at the drain limit

 ✓ test/p2.test.ts (18 tests) 2235ms
   ✓ runtime failure (behaviour 10) > BEH-BR-090: restart restarts only the fiber; ignore logs and changes nothing; inspect reports them  326ms
   ✓ shutdown and hosting (behaviour 12) > BEH-BR-105 (T1, T7): shutdown resumes a parked stop, ends its intent with intent-ended caused by shutdown, and never parks  348ms
   ✓ observability (behaviour 13) > BEH-BR-118: inspect shows parked and pending during a parked removal  327ms
 ✓ test/confluence-p5.test.ts (1 test) 2374ms
   ✓ confluence through TestHost (BEH-BR-160, BEH-BR-178; P5 exit criterion) > random histories with randomly chosen step orders settle to the snapshot of a direct install  2373ms

 Test Files  19 passed (19)
      Tests  238 passed (238)
   Start at  15:27:46
   Duration  3.05s (transform 970ms, setup 0ms, collect 5.61s, tests 14.88s, environment 2ms, prepare 1.21s)
```

#### Follow-up after CCR-BR-030

`staleness` in `src/host.ts` now compares `prune.enabled` always and `pruneDrain`/`pruneForce` only when `prune` or
`atomic` is true (G-P23, BEH-BR-319). Suite: 340 tests in 32 files, all passing; `tsc` clean. Still open in the
prototype: `offerCallEntry` under "refuse" does not wait for its record. The prototype evidences no requirement.
