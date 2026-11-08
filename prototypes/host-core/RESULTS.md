# Host-core prototype — results (phases P1–P5, G11, in-flight table, CCR-BR-008, CCR-BR-012, CCR-BR-014)

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
