# Host-core prototype — results (phases P1–P5, G11, in-flight table, CCR-BR-008, CCR-BR-012)

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

## Output of the run recorded on 2026-10-03

```

 RUN  v3.2.7 /Users/mohammadalmechkor/Documents/ChatGPT/Bridger/prototypes/host-core

stdout | test/optional.test.ts > optional dependencies (BEH-BR-129–131) > BEH-BR-129, 130: optional is a point-in-time, unleased read; the provider leaving changes nothing; an undeclared key is None
[02:48:52.237] WARN (#17): undeclared optional dependency example/Metrics { plugin: 'ui' }

 ✓ test/children.test.ts > children (behaviour 14) > BEH-BR-121, 122, 126: a child is mounted by the parent's build, prefixed, ungated, and its mount record is caused by the parent's activation 53ms
 ✓ test/reconcile.test.ts > reconcile (behaviour 18) > BEH-BR-153, 159, 201: a list installs what is missing; running it again issues nothing and still leaves a noop parent pair 60ms
 ✓ test/optional.test.ts > optional dependencies (BEH-BR-129–131) > BEH-BR-129: an optional key gates nothing, is never missing, takes no part in cycles, and cannot also be required 36ms
 ✓ test/optional.test.ts > optional dependencies (BEH-BR-129–131) > BEH-BR-129, 130: optional is a point-in-time, unleased read; the provider leaving changes nothing; an undeclared key is None 27ms
 ✓ test/optional.test.ts > optional dependencies (BEH-BR-129–131) > BEH-BR-131: useOptional is None when absent and otherwise runs under a lease that delays the provider's removal 30ms
 ✓ test/leases.test.ts > leases > check 2 / BEH-BR-085, 086: removal waits for a lease, fails with DrainTimeout, succeeds with force 80ms
 ✓ test/inflight.test.ts > in-flight table (BEH-BR-072) > the table is total and matches the specification 3ms
 ✓ test/inflight.test.ts > in-flight table (BEH-BR-072) > live: install while remove is in flight → duplicate-plugin 46ms
 ✓ test/inflight.test.ts > in-flight table (BEH-BR-072) > live: remove while remove is in flight → join 51ms
 ✓ test/inflight.test.ts > in-flight table (BEH-BR-072) > live: replace while remove is in flight → conflict 26ms
 ✓ test/gxp.test.ts > attribution (behaviour 22) > check 31: unattributed or reason-less calls fail before any record or change; a per-call context wins 78ms
 ✓ test/gxp.test.ts > audit records (behaviours 23, 24) > check 33: exactly one requested and one terminal record per admitted call, including no-ops 46ms
 ✓ test/lifecycle.test.ts > installation and activation > check 19 / BEH-BR-017, 021, 033: install order does not matter; a missing requirement is state, not an error 35ms
 ✓ test/lifecycle.test.ts > installation and activation > check 9 / BEH-BR-018–020: duplicate ids, duplicate providers and cycles register nothing 3ms
 ✓ test/lifecycle.test.ts > installation and activation > check 11 / BEH-BR-038: two key objects with one ServiceId fail the activation with KeyMismatch 17ms
 ✓ test/lifecycle.test.ts > installation and activation > check 16 / BEH-BR-036: every activation builds its layer again (fresh memo map) 23ms
 ✓ test/lifecycle.test.ts > installation and activation > BEH-BR-034: a build still waiting for a slot when the plugin is removed is cancelled before it begins 61ms
 ✓ test/leases.test.ts > leases > check 3 / BEH-BR-088: a callback that removes its own provider fails at once with WouldDeadlock 22ms
 ✓ test/leases.test.ts > leases > check 12 / BEH-BR-084: interrupting the caller interrupts the child and runs its finalizers before the lease is released 17ms
 ✓ test/leases.test.ts > leases > BEH-BR-087: a per-call timeout interrupts the callback and fails with LeaseTimeout 24ms
 ✓ test/children.test.ts > children (behaviour 14) > BEH-BR-121, 125, 126: removing the parent removes the child first, before the parent's scope begins to close 55ms
 ✓ test/children.test.ts > children (behaviour 14) > BEH-BR-121: a mount edge closes a cycle only through the parent's own definition — a replace that requires its child's service 23ms
 ✓ test/children.test.ts > children (behaviour 14) > BEH-BR-123: a failing child does not fail its parent; its failure shows under its own id 16ms
 ✓ test/children.test.ts > children (behaviour 14) > BEH-BR-124: a child requiring its parent's service waits for publication and stops first, using it in its finalizer 40ms
 ✓ test/reconcile.test.ts > reconcile (behaviour 18) > BEH-BR-154: an entry needing several actions gets them in the fixed order, so it builds at most once 56ms
 ✓ test/reconcile.test.ts > reconcile (behaviour 18) > BEH-BR-155: a scope prunes only what it installed; an entry naming someone else's plugin is rejected, not adopted 42ms
 ✓ test/inflight.test.ts > in-flight table (BEH-BR-072) > live: retry while remove is in flight → conflict 28ms
 ✓ test/inflight.test.ts > in-flight table (BEH-BR-072) > live: restart while remove is in flight → conflict 33ms
 ✓ test/inflight.test.ts > in-flight table (BEH-BR-072) > live: disable while remove is in flight → conflict 39ms
 ✓ test/optional.test.ts > reactive dependencies: whenAvailable (BEH-BR-132–136) > BEH-BR-132, 133: a run starts when its keys arrive, ends before the provider closes, and runs again when they return; the plugin's state never moves 52ms
 ✓ test/lifecycle.test.ts > installation and activation > BEH-BR-039: a build in flight when the plugin is removed is never published 59ms
 ✓ test/lifecycle.test.ts > removal > check 1 / BEH-BR-043, 044: dependents stop first and can use their provider in their finalizers 40ms
 ✓ test/lifecycle.test.ts > removal > BEH-BR-046, 047: a cleanup failure is reported, and removing the plugin acknowledges the leak 15ms
 ✓ test/confluence.test.ts > confluence > seed 1: a random history settles to the same states as a fresh install of the final set 286ms
 ✓ test/reconcile.test.ts > reconcile (behaviour 18) > BEH-BR-153, 156: invalid and duplicate entries are rejected, their plugin untouched and unpruned; prunes run dependents first 89ms
 ✓ test/reconcile.test.ts > reconcile (behaviour 18) > BEH-BR-157, 158, 201: the gate is consulted per entry action; a refusal rejects that entry only and is counted in children 36ms
 ✓ test/reconcile.test.ts > reconcile (behaviour 18) > BEH-BR-158: requireReason applies to the operations a provisional diff would issue — a prune needs a reason, refused with no record 37ms
 ✓ test/children.test.ts > children (behaviour 14) > BEH-BR-125: a new activation mounts again; a child removed directly stays removed until then 51ms
 ✓ test/children.test.ts > children (behaviour 14) > BEH-BR-121, 125: a parent's forced removal ends a parked operation on its child and removes the child 86ms
 ✓ test/p2.test.ts > runtime failure (behaviour 10) > check 5 / BEH-BR-090, 094, 096: a failing background fiber stops dependents first and ends failed(runtime), sticky until retry 85ms
 ✓ test/p2.test.ts > runtime failure (behaviour 10) > BEH-BR-095: with no caller, a lease on a dependent is revoked at the drain limit; nothing parks 240ms
 ✓ test/inflight.test.ts > in-flight table (BEH-BR-072) > live: enable while remove is in flight → conflict 19ms
 ✓ test/inflight.test.ts > in-flight table (BEH-BR-072) > live: install while replace is in flight → duplicate-plugin 30ms
 ✓ test/inflight.test.ts > in-flight table (BEH-BR-072) > live: remove while replace is in flight → supersede 34ms
 ✓ test/lifecycle.test.ts > replacement and reactivation > check 9 / BEH-BR-050, 051: replace validates before stopping; dropping a provided key strands dependents 41ms
 ✓ test/lifecycle.test.ts > replacement and reactivation > check 10 / BEH-BR-031, 056, 057: failure is sticky through dependency loss; retry lands by availability 27ms
 ✓ test/lifecycle.test.ts > replacement and reactivation > check 27 / BEH-BR-060–062: disable frees the provider slot; enable re-validates 17ms
 ✓ test/lifecycle.test.ts > snapshots > BEH-BR-029, 030: revisions never regress and `changes` emits the current snapshot first 7ms
 ✓ test/lifecycle.test.ts > snapshots > check 8 / BEH-BR-105, 106: shutdown stops in reverse dependency order and reports cleanup failures 16ms
 ✓ test/confluence.test.ts > confluence > seed 7: a random history settles to the same states as a fresh install of the final set 127ms
 ✓ test/inflight.test.ts > in-flight table (BEH-BR-072) > live: replace while replace is in flight → supersede 38ms
 ✓ test/inflight.test.ts > in-flight table (BEH-BR-072) > live: retry while replace is in flight → conflict 18ms
 ✓ test/inflight.test.ts > in-flight table (BEH-BR-072) > live: restart while replace is in flight → conflict 19ms
 ✓ test/inflight.test.ts > in-flight table (BEH-BR-072) > live: disable while replace is in flight → conflict 16ms
 ✓ test/inflight.test.ts > in-flight table (BEH-BR-072) > live: enable while replace is in flight → conflict 17ms
 ✓ test/inflight.test.ts > in-flight table (BEH-BR-072) > live: install while restart is in flight → duplicate-plugin 16ms
 ✓ test/gxp.test.ts > audit records (behaviours 23, 24) > check 39: system transitions carry Actor.system and the causation of their trigger, and are never gated 54ms
 ✓ test/gxp.test.ts > audit records (behaviours 23, 24) > check 35 / 36: auditSeq is contiguous from 1; a failed write is retried in place with the same id and number 291ms
 ✓ test/optional.test.ts > reactive dependencies: whenAvailable (BEH-BR-132–136) > BEH-BR-133: a run's finalizers drain under the provider's limit, with DrainTimeout and force; the run's plugin is never stopped 329ms
stdout | test/leases.test.ts > leases > check 18 / BEH-BR-082, 083: useAll is all-or-nothing and goes through the same drain path
[02:48:52.681] ERROR (#47): shutdown: example/audit drain: 1 lease(s) still held at the drain limit

 ✓ test/leases.test.ts > leases > check 18 / BEH-BR-082, 083: useAll is all-or-nothing and goes through the same drain path 355ms
stdout | test/optional.test.ts > reactive dependencies: whenAvailable (BEH-BR-132–136) > BEH-BR-134: a failed run follows the background policy — fail-plugin fails the plugin; ignore leaves it active
[02:48:52.697] ERROR (#126): whenAvailable whenAvailable#1: run failed { plugin: 'ui' }

 ✓ test/reconcile.test.ts > reconcile (behaviour 18) > BEH-BR-158, 201: a diff recomputed at the intent that newly needs a reason fails the call with a recorded ReasonRequired and no entry action 55ms
 ✓ test/reconcile.test.ts > reconcile (behaviour 18) > BEH-BR-156: after its intent, an interrupted caller stops waiting; the remaining entries still run and the parent record still closes 142ms
 ✓ test/children.test.ts > children (behaviour 14) > BEH-BR-125: a child whose drain expires under the parent's removal parks with next "gone" and is removed when resumed 83ms
 ✓ test/children.test.ts > children (behaviour 14) > finding G19: a parent whose stop has begun mounts nothing, so no child outlives the activation 13ms
 ✓ test/children.test.ts > children (behaviour 14) > finding G21: a parent that awaits its child inside its build starves when the child needs the build slot it holds 109ms
 ✓ test/confluence-p4.test.ts > confluence (BEH-BR-160, P4 exit criterion) > random histories ending in the same installed set settle to equal snapshots 518ms
 ✓ test/inflight.test.ts > in-flight table (BEH-BR-072) > live: remove while restart is in flight → supersede 33ms
 ✓ test/inflight.test.ts > in-flight table (BEH-BR-072) > live: replace while restart is in flight → supersede 35ms
 ✓ test/inflight.test.ts > in-flight table (BEH-BR-072) > live: retry while restart is in flight → conflict 16ms
 ✓ test/inflight.test.ts > in-flight table (BEH-BR-072) > live: restart while restart is in flight → join 39ms
 ✓ test/confluence.test.ts > confluence > seed 42: a random history settles to the same states as a fresh install of the final set 151ms
 ✓ test/optional.test.ts > reactive dependencies: whenAvailable (BEH-BR-132–136) > BEH-BR-134: a failed run follows the background policy — fail-plugin fails the plugin; ignore leaves it active 63ms
 ✓ test/optional.test.ts > reactive dependencies: whenAvailable (BEH-BR-132–136) > BEH-BR-135: inspect lists optional keys and each registration by name, keys and whether it runs 17ms
 ✓ test/optional.test.ts > reactive dependencies: whenAvailable (BEH-BR-132–136) > BEH-BR-136: a run carries only the leases it holds — removing its own provider from inside it fails with WouldDeadlock 14ms
 ✓ test/children.test.ts > groups (BEH-BR-127, 128) > BEH-BR-127: awaitActive resolves when every member is active and fails fast naming a failed member 28ms
 ✓ test/children.test.ts > groups (BEH-BR-127, 128) > BEH-BR-128: a member that fails its install checks fails the group's activation and leaves no member mounted 40ms
 ✓ test/leases.test.ts > legality (BEH-BR-071) > check 4: the table is total and matches the specification for every settled row 1ms
 ✓ test/leases.test.ts > legality (BEH-BR-071) > no-op cells succeed and change nothing (live host) 14ms
 ✓ test/leases.test.ts > legality (BEH-BR-071) > live: install on unknown → proceed 30ms
 ✓ test/leases.test.ts > legality (BEH-BR-071) > live: remove on unknown → unknown-plugin 26ms
 ✓ test/leases.test.ts > legality (BEH-BR-071) > live: replace on unknown → unknown-plugin 25ms
 ✓ test/leases.test.ts > legality (BEH-BR-071) > live: retry on unknown → unknown-plugin 25ms
 ✓ test/gxp.test.ts > audit records (behaviours 23, 24) > check 36: verifyAuditSequence reports gaps, duplicates and disorder only 0ms
 ✓ test/gxp.test.ts > fail closed and the latch (behaviour 23) > check 32: a requested record that cannot be written fails the call with AuditUnavailable and changes nothing 151ms
stdout | test/p2.test.ts > runtime failure (behaviour 10) > BEH-BR-090: restart restarts only the fiber; ignore logs and changes nothing; inspect reports them
[02:48:52.827] ERROR (#105): background loop failed Error: boom
    at causePrettyError (file:///Users/mohammadalmechkor/Documents/ChatGPT/Bridger/prototypes/host-core/node_modules/effect/src/internal/effect.ts:387:13) { plugin: 'x/worker' }

 ✓ test/p2.test.ts > runtime failure (behaviour 10) > BEH-BR-090: restart restarts only the fiber; ignore logs and changes nothing; inspect reports them 328ms
 ✓ test/inflight.test.ts > in-flight table (BEH-BR-072) > live: disable while restart is in flight → supersede 36ms
 ✓ test/inflight.test.ts > in-flight table (BEH-BR-072) > live: enable while restart is in flight → conflict 21ms
 ✓ test/inflight.test.ts > in-flight table (BEH-BR-072) > live: install while disable is in flight → duplicate-plugin 16ms
 ✓ test/inflight.test.ts > in-flight table (BEH-BR-072) > live: remove while disable is in flight → supersede 40ms
 ✓ test/reconcile.test.ts > reconcile (behaviour 18) > BEH-BR-156: reconciles are serialized — the second's entries run only after the first's parent record closes 23ms
 ✓ test/reconcile.test.ts > reconcile (behaviour 18) > BEH-BR-157: a requested record that cannot be written stops the batch with AuditUnavailable; completed actions stay 154ms
 ✓ test/leases.test.ts > legality (BEH-BR-071) > live: reconfigure on unknown → unknown-plugin 25ms
 ✓ test/leases.test.ts > legality (BEH-BR-071) > live: restart on unknown → unknown-plugin 25ms
 ✓ test/leases.test.ts > legality (BEH-BR-071) > live: disable on unknown → unknown-plugin 27ms
 ✓ test/leases.test.ts > legality (BEH-BR-071) > live: enable on unknown → unknown-plugin 25ms
 ✓ test/confluence.test.ts > confluence > seed 99: a random history settles to the same states as a fresh install of the final set 162ms
 ✓ test/p2.test.ts > runtime failure (behaviour 10) > BEH-BR-091: a failure reported during the build fails the activation and publishes nothing 9ms
 ✓ test/p2.test.ts > runtime failure (behaviour 10) > check 14 / BEH-BR-092, 093: health degrades, then fails at the threshold; an in-flight check is not counted when the plugin leaves active 37ms
 ✓ test/p2.test.ts > configuration (behaviour 11) > check 7 / BEH-BR-097, 099: decode before build; an invalid value publishes nothing; the source is read at every activation 28ms
 ✓ test/inflight.test.ts > in-flight table (BEH-BR-072) > live: replace while disable is in flight → conflict 16ms
 ✓ test/inflight.test.ts > in-flight table (BEH-BR-072) > live: retry while disable is in flight → conflict 23ms
 ✓ test/inflight.test.ts > in-flight table (BEH-BR-072) > live: restart while disable is in flight → conflict 19ms
 ✓ test/inflight.test.ts > in-flight table (BEH-BR-072) > live: disable while disable is in flight → join 38ms
 ✓ test/inflight.test.ts > in-flight table (BEH-BR-072) > live: enable while disable is in flight → conflict 41ms
 ✓ test/reconcile.test.ts > reconcile (behaviour 18) > BEH-BR-159: two edit histories that end in one list converge on the same owned set 112ms
 ✓ test/reconcile.test.ts > Desired.overlay (BEH-BR-153) > is pure, matches by (id, realm), merges config deeply, keeps base order and appends only entries with a plugin 0ms
 ✓ test/leases.test.ts > legality (BEH-BR-071) > live: install on waiting → duplicate-plugin 29ms
 ✓ test/leases.test.ts > legality (BEH-BR-071) > live: remove on waiting → proceed 26ms
 ✓ test/leases.test.ts > legality (BEH-BR-071) > live: replace on waiting → proceed 40ms
 ✓ test/leases.test.ts > legality (BEH-BR-071) > live: retry on waiting → noop 29ms
 ✓ test/review.test.ts > CCR-BR-008: parked operations (check 47) > R2, T2: a call that joins a parked operation resumes and owns it; the parked call's record is final 114ms
 ✓ test/p2.test.ts > configuration (behaviour 11) > check 13 / BEH-BR-099, 101: an override wins over the source; reconfigure without a value clears it; ConfigInvalid leaves the plugin running 69ms
 ✓ test/p2.test.ts > configuration (behaviour 11) > check 28 / BEH-BR-102: a volatile-only change updates in place; a non-volatile change restarts with configChange paths 70ms
 ✓ test/inflight.test.ts > intent and parking (BEH-BR-067, 074) > BEH-BR-067: interrupting the caller does not cancel the transition 35ms
 ✓ test/inflight.test.ts > intent and parking (BEH-BR-067, 074) > BEH-BR-074: a call that supersedes a parked operation resumes it under its own options 71ms
 ✓ test/confluence.test.ts > confluence > seed 2026: a random history settles to the same states as a fresh install of the final set 218ms
 ✓ test/review.test.ts > CCR-BR-008: parked operations (check 47) > R8, R10: retry and enable conflict with a parked system stop; a stopping operation resumes and owns it 103ms
 ✓ test/leases.test.ts > legality (BEH-BR-071) > live: reconfigure on waiting → proceed 28ms
 ✓ test/leases.test.ts > legality (BEH-BR-071) > live: restart on waiting → noop 26ms
 ✓ test/leases.test.ts > legality (BEH-BR-071) > live: disable on waiting → proceed 26ms
 ✓ test/leases.test.ts > legality (BEH-BR-071) > live: enable on waiting → noop 28ms
 ✓ test/testhost.test.ts > TestHost (BEH-BR-177, 178) > BEH-BR-178: an operation records its intent and returns; its transition waits as a pending item until stepped 41ms
 ✓ test/testhost.test.ts > TestHost (BEH-BR-177, 178) > BEH-BR-178: builds made ready together are pending in registration order, owned by the system start 27ms
 ✓ test/testhost.test.ts > TestHost (BEH-BR-177, 178) > BEH-BR-178: a cascade that meets a dependent's restart is a pending wait; step order is arrival order among items that can progress 48ms
 ✓ test/p2.test.ts > configuration (behaviour 11) > check 37 / BEH-BR-103: no configuration value appears in any record, event, snapshot or error 38ms
 ✓ test/inflight.test.ts > intent and parking (BEH-BR-067, 074) > BEH-BR-072: a superseding replace that fails its definition checks fails alone 31ms
 ✓ test/inflight.test.ts > interruption before intent (BEH-BR-067, 188) > a caller interrupted while waiting for its turn changes nothing and ends with a failed (Interrupted) record 89ms
 ✓ test/ordering.test.ts > cross-plugin stop ordering (ADR-BR-038) > check 43 / BEH-BR-078, 088: a lease holder's calls never wait on the drain its lease blocks 77ms
 ✓ test/ordering.test.ts > cross-plugin stop ordering (ADR-BR-038) > check 44 / BEH-BR-079: a removal that meets a dependent's restart waits for its step, not its operation 45ms
 ✓ test/leases.test.ts > legality (BEH-BR-071) > live: install on starting → duplicate-plugin 30ms
 ✓ test/leases.test.ts > legality (BEH-BR-071) > live: remove on starting → proceed 47ms
 ✓ test/leases.test.ts > legality (BEH-BR-071) > live: replace on starting → proceed 39ms
 ✓ test/realms.test.ts > realms (BEH-BR-145–150) > BEH-BR-145, 147: "default" always exists; realms are defined once; one definition runs once per realm that isolates its keys 65ms
 ✓ test/realms.test.ts > realms (BEH-BR-145–150) > BEH-BR-146: isolated keys resolve and stay inside the realm; a non-isolated key provided from a realm takes the default slot 44ms
 ✓ test/review.test.ts > CCR-BR-008: parked operations (check 47) > R9, V, T1: a cascade that resumes a parked operation ends its intent; on re-expiry it is a parked system stop; endsIntentOf links the trail 134ms
 ✓ test/review.test.ts > CCR-BR-008: re-entrancy and the cascade's drain limit (check 48) > R11: a build and a finalizer that call back into the host fail with WouldDeadlock instead of hanging 30ms
 ✓ test/review.test.ts > CCR-BR-008: re-entrancy and the cascade's drain limit (check 48) > R12: a cascade's own drain limit runs while it waits for another call's drain: "forever" step 58ms
 ✓ test/p2.test.ts > configuration (behaviour 11) > BEH-BR-072 (reconfigure cells): joins a restart in flight; equal value joins; a different value supersedes; remove supersedes 95ms
 ✓ test/review.test.ts > CCR-BR-008: interruption at the gate (check 46) > R1: a caller interrupted while the gate decides leaves one rejected (caller-interrupted) record and no requested record 36ms
 ✓ test/inflight.test.ts > audit links of joins and supersession (BEH-BR-200) > joined and superseded calls write their own requested and a linked terminal record 98ms
 ✓ test/testhost.test.ts > TestHost (BEH-BR-177, 178) > BEH-BR-178: the concurrency limit holds while a build is suspended on the clock; a step that cannot progress returns false 36ms
 ✓ test/testhost.test.ts > TestHost (BEH-BR-177, 178) > finding G28: awaitIdle on a TestHost waits until the test steps; runUntilIdle steps 11ms
 ✓ test/testhost.test.ts > TestHost (BEH-BR-177, 178) > finding G27: a test that ends with pending items still closes: from the scope's close on, transitions run on their own 4ms
 ✓ test/testhost.test.ts > TestHost: time, identifiers and determinism (BEH-BR-179) > two runs of one script give identical snapshots, events and audit records, field for field; the host id is the first identifier 127ms
 ✓ test/gxp.test.ts > fail closed and the latch (behaviour 23) > check 34: an unwritten terminal record latches; mutations are refused; shutdown and acknowledgement are allowed 546ms
 ✓ test/realms.test.ts > realms (BEH-BR-145–150) > BEH-BR-146: a realm that isolates a base key hides the base service from its plugins 29ms
 ✓ test/realms.test.ts > realms (BEH-BR-145–150) > BEH-BR-148: a default provider serving consumers in several realms stops after all of them 59ms
 ✓ test/realms.test.ts > realms (BEH-BR-145–150) > BEH-BR-149: snapshots record each plugin's realm and every realm's isolated and available ids 11ms
 ✓ test/realms.test.ts > realms (BEH-BR-145–150) > BEH-BR-147: use, useAll and lease naming an undefined realm fail with UnknownRealm before any callback 1ms
 ✓ test/leases.test.ts > legality (BEH-BR-071) > live: retry on starting → noop 28ms
 ✓ test/leases.test.ts > legality (BEH-BR-071) > live: reconfigure on starting → proceed 43ms
 ✓ test/leases.test.ts > legality (BEH-BR-071) > live: restart on starting → proceed 34ms
stdout | test/testhost.test.ts > TestHost: faults (BEH-BR-180) > stopFails: closing the activation fails — phase cleanup, CleanupError to the caller
[01:00:00.000] ERROR (#168): shutdown: example/logger cleanup: injected fault: stopFails

 ✓ test/ordering.test.ts > cross-plugin stop ordering (ADR-BR-038) > check 45 / BEH-BR-080: a removal resumes a dependent's parked stop and ends the parked intent 160ms
 ✓ test/testhost.test.ts > TestHost: faults (BEH-BR-180) > buildFails: every build fails while active (phase build, an injected message); retry succeeds once it ends 14ms
 ✓ test/testhost.test.ts > TestHost: faults (BEH-BR-180) > stopFails: closing the activation fails — phase cleanup, CleanupError to the caller 16ms
 ✓ test/testhost.test.ts > TestHost: faults (BEH-BR-180) > holdLease: a held lease makes a removal time out under the clock; force revokes it 27ms
 ✓ test/testhost.test.ts > TestHost: faults (BEH-BR-180) > runtimeFailure: one runtime failure, travelling the real path — dependents stop, the plugin ends failed (runtime) 43ms
 ✓ test/testhost.test.ts > fixtures (BEH-BR-181, 182) > memoryAuditSink: idempotent on recordId; scripted outcomes; scriptedGate records every request and needs a decision 2ms
stdout | test/bus.test.ts > event bus (behaviour 16) > BEH-BR-141: emit returns once listeners are started; a failure never reaches the emitter and is reported as listener-failed
[02:48:53.439] WARN (#41): listener of billing/invoice-posted failed Error: posting failed
    at causePrettyError (file:///Users/mohammadalmechkor/Documents/ChatGPT/Bridger/prototypes/host-core/node_modules/effect/src/internal/effect.ts:387:13)

 ✓ test/gxp.test.ts > operation gate (behaviour 25) > check 32: validation failures reach neither gate nor sink; refusals, gate defects and timeouts leave one rejected record and change nothing 76ms
 ✓ test/realms.test.ts > realms (BEH-BR-145–150) > BEH-BR-145, 196: defineRealm is gated and audited, its records naming the realm as { id: R, realm: R } 25ms
 ✓ test/realms.test.ts > interception (BEH-BR-151, 152) > BEH-BR-151: interceptions compose realm → inherited → own, per consumer; a child's own intercept replaces inheritance 39ms
 ✓ test/realms.test.ts > interception (BEH-BR-151, 152) > BEH-BR-151: optional captures are intercepted too 14ms
 ✓ test/realms.test.ts > interception (BEH-BR-151, 152) > BEH-BR-152: a wrap that throws fails only the consumer's activation, with phase activation 13ms
 ✓ test/bus.test.ts > event bus (behaviour 16) > BEH-BR-137: the bus is a base service, obtained by requiring it, which no plugin can provide 23ms
 ✓ test/bus.test.ts > event bus (behaviour 16) > BEH-BR-139, 140: listeners run by priority, then registration, `prepend` first among equals; a stopped plugin's listeners are gone 39ms
 ✓ test/bus.test.ts > event bus (behaviour 16) > BEH-BR-141: emit returns once listeners are started; a failure never reaches the emitter and is reported as listener-failed 54ms
 ✓ test/leases.test.ts > legality (BEH-BR-071) > live: disable on starting → proceed 32ms
 ✓ test/leases.test.ts > legality (BEH-BR-071) > live: enable on starting → noop 30ms
 ✓ test/leases.test.ts > legality (BEH-BR-071) > live: install on active → duplicate-plugin 35ms
 ✓ test/leases.test.ts > legality (BEH-BR-071) > live: remove on active → proceed 34ms
 ✓ test/p2.test.ts > configuration (behaviour 11) > BEH-BR-101, 080 (T1, T13): a parked reconfigure ended by a cascade reverts the override; intent-ended carries the paths 313ms
stdout | test/generation.test.ts > Generation (behaviour 20) > BEH-BR-173–175: a retired value's drain times out repeatably, force revokes and awaits finalizers; retired values drain independently
[02:48:53.520] WARN (#10): generation model: 1 lease(s) revoked

stdout | test/generation.test.ts > Generation (behaviour 20) > finding G26: a forced drain of an `acquire` lease interrupts the acquiring fiber — a caller's Scope cannot be closed from outside
[02:48:53.527] WARN (#20): generation generation: 1 lease(s) revoked

 ✓ test/gxp.test.ts > operation gate (behaviour 25) > check 42: gate requests and records carry the definition version and digest; a gate can refuse by digest 28ms
 ✓ test/gxp.test.ts > hooks are optional (BEH-BR-194, 217) > check 38: with no sink and no gate, outcomes and snapshots equal those with a sink and an allow-all gate (except `audit`) 73ms
 ✓ test/gxp.test.ts > hooks are optional (BEH-BR-194, 217) > check 41: no core source reads ambient time or randomness outside the default IdGenerator 2ms
stdout | test/generation.test.ts > Generation (behaviour 20) > BEH-BR-169: closing the generation's scope closes admission and drains everything, revoking at the limit
[02:48:53.550] WARN (#24): generation generation: 1 lease(s) revoked

 ✓ test/generation.test.ts > Generation (behaviour 20) > BEH-BR-170: publish replaces the value in one step; earlier leases keep the old value; revisions count publishes 4ms
 ✓ test/generation.test.ts > Generation (behaviour 20) > BEH-BR-171, 173: admission closes and reopens without touching admitted leases; awaitDrained neither closes admission nor waits for later leases 2ms
 ✓ test/generation.test.ts > Generation (behaviour 20) > BEH-BR-173–175: a retired value's drain times out repeatably, force revokes and awaits finalizers; retired values drain independently 37ms
 ✓ test/generation.test.ts > Generation (behaviour 20) > finding G26: a forced drain of an `acquire` lease interrupts the acquiring fiber — a caller's Scope cannot be closed from outside 7ms
 ✓ test/generation.test.ts > Generation (behaviour 20) > BEH-BR-169: closing the generation's scope closes admission and drains everything, revoking at the limit 22ms
 ✓ test/generation.test.ts > Generation (behaviour 20) > BEH-BR-174: a forced drain of a generation made in an activation is a lease-revoked host event naming it 21ms
 ✓ test/leases.test.ts > legality (BEH-BR-071) > live: replace on active → proceed 39ms
 ✓ test/leases.test.ts > legality (BEH-BR-071) > live: retry on active → noop 37ms
 ✓ test/leases.test.ts > legality (BEH-BR-071) > live: reconfigure on active → proceed 31ms
 ✓ test/bus.test.ts > event bus (behaviour 16) > BEH-BR-142: parallel returns results in listener order and fails on the first typed failure; serial stops at the first defined result 46ms
 ✓ test/bus.test.ts > event bus (behaviour 16) > BEH-BR-143: waterfall composes around-listeners over the final effect; a listener that skips next short-circuits 7ms
 ✓ test/bus.test.ts > event bus (behaviour 16) > BEH-BR-144: listeners keep the dispatcher's HeldPlugins but run with CurrentActor reset to unattributed 22ms
 ✓ test/bus.test.ts > event bus (behaviour 16) > BEH-BR-140: a listener whose plugin is removed mid-dispatch is drained, then interrupted under the drain limit 57ms
 ✓ test/registry.test.ts > ContributionRegistry (behaviour 19) > BEH-BR-163: ids are unique — a duplicate, a concurrent duplicate and a non-finite priority register nothing 4ms
 ✓ test/registry.test.ts > ContributionRegistry (behaviour 19) > BEH-BR-164, 165: scope close removes last-in-first-out, leaves others intact; order is priority then id; revisions step by one 5ms
 ✓ test/registry.test.ts > ContributionRegistry (behaviour 19) > BEH-BR-166, 167: use holds a contribution; removal hides it at once, waits for the holder, and the id stays reserved until it ends 3ms
 ✓ test/registry.test.ts > ContributionRegistry (behaviour 19) > BEH-BR-167: at drainTimeout the holders are interrupted, fail with LeaseRevoked, and their finalizers run before removal completes 31ms
 ✓ test/registry.test.ts > ContributionRegistry (behaviour 19) > BEH-BR-163, 168: contributions added inside an activation are owned by that plugin in inspect — names and ids only 27ms
 ✓ test/leases.test.ts > legality (BEH-BR-071) > live: restart on active → proceed 32ms
 ✓ test/leases.test.ts > legality (BEH-BR-071) > live: disable on active → proceed 28ms
 ✓ test/leases.test.ts > legality (BEH-BR-071) > live: enable on active → noop 27ms
 ✓ test/leases.test.ts > legality (BEH-BR-071) > live: install on failed → duplicate-plugin 26ms
 ✓ test/leases.test.ts > legality (BEH-BR-071) > live: remove on failed → proceed 27ms
 ✓ test/leases.test.ts > legality (BEH-BR-071) > live: replace on failed → proceed 28ms
 ✓ test/leases.test.ts > legality (BEH-BR-071) > live: retry on failed → proceed 28ms
 ✓ test/leases.test.ts > legality (BEH-BR-071) > live: reconfigure on failed → proceed 27ms
 ✓ test/leases.test.ts > legality (BEH-BR-071) > live: restart on failed → proceed 28ms
 ✓ test/leases.test.ts > legality (BEH-BR-071) > live: disable on failed → proceed 26ms
 ✓ test/leases.test.ts > legality (BEH-BR-071) > live: enable on failed → noop 26ms
stdout | test/leases.test.ts > legality (BEH-BR-071) > live: install on failed-cleanup → duplicate-plugin
[02:48:53.931] ERROR (#827): shutdown: x/subject cleanup: injected fault: stopFails

 ✓ test/p2.test.ts > shutdown and hosting (behaviour 12) > check 8 / BEH-BR-105–107: the report lists cleanup failures, drain shortfalls and forced plugins; durationMs from the Clock 26ms
 ✓ test/p2.test.ts > shutdown and hosting (behaviour 12) > BEH-BR-109: concurrent shutdowns join; after completion the original report returns and nothing is recorded; HostClosed, changes and events end 61ms
 ✓ test/p2.test.ts > shutdown and hosting (behaviour 12) > BEH-BR-108, 110: closing the scope shuts down as Actor.system despite required attribution and a set latch; onClose gets the report once 6ms
 ✓ test/p2.test.ts > shutdown and hosting (behaviour 12) > BEH-BR-105 (T1, T7): shutdown resumes a parked stop, ends its intent with intent-ended caused by shutdown, and never parks 353ms
stdout | test/leases.test.ts > legality (BEH-BR-071) > live: replace on failed-cleanup → conflict:cleanup-failure
[02:48:53.987] ERROR (#877): shutdown: x/subject cleanup: injected fault: stopFails

stdout | test/leases.test.ts > legality (BEH-BR-071) > live: retry on failed-cleanup → conflict:cleanup-failure
[02:48:54.016] ERROR (#900): shutdown: x/subject cleanup: injected fault: stopFails

 ✓ test/leases.test.ts > legality (BEH-BR-071) > live: install on failed-cleanup → duplicate-plugin 29ms
 ✓ test/leases.test.ts > legality (BEH-BR-071) > live: remove on failed-cleanup → proceed 29ms
 ✓ test/leases.test.ts > legality (BEH-BR-071) > live: replace on failed-cleanup → conflict:cleanup-failure 28ms
 ✓ test/leases.test.ts > legality (BEH-BR-071) > live: retry on failed-cleanup → conflict:cleanup-failure 29ms
stdout | test/leases.test.ts > legality (BEH-BR-071) > live: reconfigure on failed-cleanup → conflict:cleanup-failure
[02:48:54.045] ERROR (#923): shutdown: x/subject cleanup: injected fault: stopFails

 ✓ test/p2.test.ts > shutdown and hosting (behaviour 12) > check 20 / BEH-BR-111: ManagedRuntime hosting forces the build, and dispose after shutdown keeps the report 1ms
stdout | test/leases.test.ts > legality (BEH-BR-071) > live: restart on failed-cleanup → conflict:cleanup-failure
[02:48:54.074] ERROR (#946): shutdown: x/subject cleanup: injected fault: stopFails

stdout | test/leases.test.ts > legality (BEH-BR-071) > live: disable on failed-cleanup → conflict:cleanup-failure
[02:48:54.102] ERROR (#969): shutdown: x/subject cleanup: injected fault: stopFails

stdout | test/leases.test.ts > legality (BEH-BR-071) > live: enable on failed-cleanup → conflict:cleanup-failure
[02:48:54.130] ERROR (#992): shutdown: x/subject cleanup: injected fault: stopFails

 ✓ test/leases.test.ts > legality (BEH-BR-071) > live: reconfigure on failed-cleanup → conflict:cleanup-failure 29ms
 ✓ test/leases.test.ts > legality (BEH-BR-071) > live: restart on failed-cleanup → conflict:cleanup-failure 29ms
 ✓ test/leases.test.ts > legality (BEH-BR-071) > live: disable on failed-cleanup → conflict:cleanup-failure 28ms
 ✓ test/leases.test.ts > legality (BEH-BR-071) > live: enable on failed-cleanup → conflict:cleanup-failure 27ms
 ✓ test/p2.test.ts > observability (behaviour 13) > check 15 / BEH-BR-114, 115: seq starts at 1 and steps by one; a slow subscriber sees loss only as a gap 233ms
 ✓ test/leases.test.ts > legality (BEH-BR-071) > live: install on disabled → duplicate-plugin 29ms
 ✓ test/leases.test.ts > legality (BEH-BR-071) > live: remove on disabled → proceed 28ms
 ✓ test/leases.test.ts > legality (BEH-BR-071) > live: replace on disabled → proceed 28ms
 ✓ test/leases.test.ts > legality (BEH-BR-071) > live: retry on disabled → conflict:disabled 28ms
 ✓ test/leases.test.ts > legality (BEH-BR-071) > live: reconfigure on disabled → proceed 29ms
 ✓ test/leases.test.ts > legality (BEH-BR-071) > live: restart on disabled → conflict:disabled 28ms
 ✓ test/leases.test.ts > legality (BEH-BR-071) > live: disable on disabled → noop 28ms
 ✓ test/leases.test.ts > legality (BEH-BR-071) > live: enable on disabled → proceed 33ms
stdout | test/p2.test.ts > observability (behaviour 13) > BEH-BR-118: inspect shows parked and pending during a parked removal
[02:48:54.509] ERROR (#633): shutdown: example/logger drain: 1 lease(s) still held at the drain limit

 ✓ test/p2.test.ts > observability (behaviour 13) > BEH-BR-118: inspect shows parked and pending during a parked removal 327ms
 ✓ test/confluence-p5.test.ts > confluence through TestHost (BEH-BR-160, BEH-BR-178; P5 exit criterion) > random histories with randomly chosen step orders settle to the snapshot of a direct install 2646ms

 Test Files  18 passed (18)
      Tests  227 passed (227)
   Start at  02:48:51
   Duration  3.45s (transform 733ms, setup 0ms, collect 7.16s, tests 15.30s, environment 2ms, prepare 1.20s)
```
