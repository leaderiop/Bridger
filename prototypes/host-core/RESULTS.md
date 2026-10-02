# Host-core prototype — results (phases P1 and P3, G11, in-flight table, CCR-BR-008)

Throwaway prototype of the Bridger host core — behaviours 01–09 of
`references/core/` (definition, installation, states and snapshots,
activation, removal, replacement and reactivation, operation legality,
leases) — on `effect@4.0.0`. Its purpose is to find where the specification
is wrong or incomplete before the real implementation starts. It is **not**
the implementation and evidences no requirement (CCR-BR-004).

Run: `npm install && npm run check && npm test` (Node 22). `src/host.ts` is
about 870 lines; `src/legality.ts` is the total state × operation table.

## What is covered

| Acceptance check (BEH-BR-183) | Test |
| --- | --- |
| 1 dependents stop first; providers usable from dependents' finalizers | lifecycle › removal |
| 2 drain, `DrainTimeout`, `force` with `LeaseRevoked` | leases |
| 3 `WouldDeadlock` (own provider, provider of a leased dependent, `awaitIdle`) | leases |
| 4 every settled cell of the state × operation table, plus live no-ops | leases › legality |
| 8 shutdown order and report; `HostClosed` afterwards | lifecycle › snapshots |
| 9 duplicates and cycles register nothing; replace validates before stopping; dropped key strands dependents | lifecycle |
| 10 failure is sticky through dependency loss and return; retry lands by availability | lifecycle |
| 11 `KeyMismatch` | lifecycle |
| 12 caller interruption: child finalizers before lease release | leases |
| 16 fresh memo map per activation | lifecycle |
| 18 `useAll` all-or-nothing, same drain path | leases |
| 19 install order independence; `awaitActive` | lifecycle |
| 27 disable frees the slot; enable re-validates | lifecycle |
| BEH-BR-039 stale build never published | lifecycle |
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

## Output of the run recorded on 2026-10-02

```

 RUN  v3.2.7 /Users/mohammadalmechkor/Documents/ChatGPT/Bridger/prototypes/host-core

 ✓ test/gxp.test.ts > attribution (behaviour 22) > check 31: unattributed or reason-less calls fail before any record or change; a per-call context wins 75ms
 ✓ test/inflight.test.ts > in-flight table (BEH-BR-072) > the table is total and matches the specification 1ms
 ✓ test/inflight.test.ts > in-flight table (BEH-BR-072) > live: install while remove is in flight → duplicate-plugin 50ms
 ✓ test/inflight.test.ts > in-flight table (BEH-BR-072) > live: remove while remove is in flight → join 36ms
 ✓ test/review.test.ts > CCR-BR-008: parked operations (check 47) > R2, T2: a call that joins a parked operation resumes and owns it; the parked call's record is final 98ms
 ✓ test/leases.test.ts > leases > check 2 / BEH-BR-085, 086: removal waits for a lease, fails with DrainTimeout, succeeds with force 63ms
 ✓ test/leases.test.ts > leases > check 3 / BEH-BR-088: a callback that removes its own provider fails at once with WouldDeadlock 7ms
 ✓ test/leases.test.ts > leases > check 12 / BEH-BR-084: interrupting the caller interrupts the child and runs its finalizers before the lease is released 10ms
 ✓ test/leases.test.ts > leases > BEH-BR-087: a per-call timeout interrupts the callback and fails with LeaseTimeout 16ms
 ✓ test/ordering.test.ts > cross-plugin stop ordering (ADR-BR-038) > check 43 / BEH-BR-078, 088: a lease holder's calls never wait on the drain its lease blocks 54ms
 ✓ test/ordering.test.ts > cross-plugin stop ordering (ADR-BR-038) > check 44 / BEH-BR-079: a removal that meets a dependent's restart waits for its step, not its operation 32ms
 ✓ test/lifecycle.test.ts > installation and activation > check 19 / BEH-BR-017, 021, 033: install order does not matter; a missing requirement is state, not an error 18ms
 ✓ test/lifecycle.test.ts > installation and activation > check 9 / BEH-BR-018–020: duplicate ids, duplicate providers and cycles register nothing 3ms
 ✓ test/lifecycle.test.ts > installation and activation > check 11 / BEH-BR-038: two key objects with one ServiceId fail the activation with KeyMismatch 17ms
 ✓ test/lifecycle.test.ts > installation and activation > check 16 / BEH-BR-036: every activation builds its layer again (fresh memo map) 5ms
 ✓ test/lifecycle.test.ts > installation and activation > BEH-BR-039: a build in flight when the plugin is removed is never published 54ms
 ✓ test/confluence.test.ts > confluence > seed 1: a random history settles to the same states as a fresh install of the final set 66ms
 ✓ test/confluence.test.ts > confluence > seed 7: a random history settles to the same states as a fresh install of the final set 22ms
 ✓ test/confluence.test.ts > confluence > seed 42: a random history settles to the same states as a fresh install of the final set 27ms
 ✓ test/leases.test.ts > leases > check 18 / BEH-BR-082, 083: useAll is all-or-nothing and goes through the same drain path 20ms
 ✓ test/leases.test.ts > legality (BEH-BR-071) > check 4: the table is total and matches the specification for every settled row 2ms
 ✓ test/leases.test.ts > legality (BEH-BR-071) > no-op cells succeed and change nothing (live host) 4ms
 ✓ test/lifecycle.test.ts > removal > check 1 / BEH-BR-043, 044: dependents stop first and can use their provider in their finalizers 4ms
 ✓ test/lifecycle.test.ts > removal > BEH-BR-046, 047: a cleanup failure is reported, and removing the plugin acknowledges the leak 6ms
 ✓ test/lifecycle.test.ts > replacement and reactivation > check 9 / BEH-BR-050, 051: replace validates before stopping; dropping a provided key strands dependents 6ms
 ✓ test/lifecycle.test.ts > replacement and reactivation > check 10 / BEH-BR-031, 056, 057: failure is sticky through dependency loss; retry lands by availability 9ms
 ✓ test/lifecycle.test.ts > replacement and reactivation > check 27 / BEH-BR-060–062: disable frees the provider slot; enable re-validates 3ms
 ✓ test/lifecycle.test.ts > snapshots > BEH-BR-029, 030: revisions never regress and `changes` emits the current snapshot first 4ms
 ✓ test/lifecycle.test.ts > snapshots > check 8 / BEH-BR-105, 106: shutdown stops in reverse dependency order and reports cleanup failures 3ms
 ✓ test/confluence.test.ts > confluence > seed 99: a random history settles to the same states as a fresh install of the final set 25ms
 ✓ test/confluence.test.ts > confluence > seed 2026: a random history settles to the same states as a fresh install of the final set 28ms
 ✓ test/gxp.test.ts > audit records (behaviours 23, 24) > check 33: exactly one requested and one terminal record per admitted call, including no-ops 26ms
 ✓ test/gxp.test.ts > audit records (behaviours 23, 24) > check 39: system transitions carry Actor.system and the causation of their trigger, and are never gated 25ms
 ✓ test/inflight.test.ts > in-flight table (BEH-BR-072) > live: replace while remove is in flight → conflict 16ms
 ✓ test/inflight.test.ts > in-flight table (BEH-BR-072) > live: retry while remove is in flight → conflict 18ms
 ✓ test/inflight.test.ts > in-flight table (BEH-BR-072) > live: restart while remove is in flight → conflict 18ms
 ✓ test/inflight.test.ts > in-flight table (BEH-BR-072) > live: disable while remove is in flight → conflict 16ms
 ✓ test/inflight.test.ts > in-flight table (BEH-BR-072) > live: enable while remove is in flight → conflict 21ms
 ✓ test/inflight.test.ts > in-flight table (BEH-BR-072) > live: install while replace is in flight → duplicate-plugin 22ms
 ✓ test/ordering.test.ts > cross-plugin stop ordering (ADR-BR-038) > check 45 / BEH-BR-080: a removal resumes a dependent's parked stop and ends the parked intent 108ms
 ✓ test/review.test.ts > CCR-BR-008: parked operations (check 47) > R8, R10: retry and enable conflict with a parked system stop; a stopping operation resumes and owns it 55ms
 ✓ test/review.test.ts > CCR-BR-008: parked operations (check 47) > R9, V, T1: a cascade that resumes a parked operation ends its intent; on re-expiry it is a parked system stop; endsIntentOf links the trail 93ms
 ✓ test/inflight.test.ts > in-flight table (BEH-BR-072) > live: remove while replace is in flight → supersede 38ms
 ✓ test/inflight.test.ts > in-flight table (BEH-BR-072) > live: replace while replace is in flight → supersede 36ms
 ✓ test/inflight.test.ts > in-flight table (BEH-BR-072) > live: retry while replace is in flight → conflict 17ms
 ✓ test/inflight.test.ts > in-flight table (BEH-BR-072) > live: restart while replace is in flight → conflict 21ms
 ✓ test/review.test.ts > CCR-BR-008: re-entrancy and the cascade's drain limit (check 48) > R11: a build and a finalizer that call back into the host fail with WouldDeadlock instead of hanging 6ms
 ✓ test/review.test.ts > CCR-BR-008: re-entrancy and the cascade's drain limit (check 48) > R12: a cascade's own drain limit runs while it waits for another call's drain: "forever" step 38ms
 ✓ test/review.test.ts > CCR-BR-008: interruption at the gate (check 46) > R1: a caller interrupted while the gate decides leaves one rejected (caller-interrupted) record and no requested record 33ms
 ✓ test/gxp.test.ts > audit records (behaviours 23, 24) > check 35 / 36: auditSeq is contiguous from 1; a failed write is retried in place with the same id and number 279ms
 ✓ test/inflight.test.ts > in-flight table (BEH-BR-072) > live: disable while replace is in flight → conflict 17ms
 ✓ test/inflight.test.ts > in-flight table (BEH-BR-072) > live: enable while replace is in flight → conflict 16ms
 ✓ test/inflight.test.ts > in-flight table (BEH-BR-072) > live: install while restart is in flight → duplicate-plugin 18ms
 ✓ test/inflight.test.ts > in-flight table (BEH-BR-072) > live: remove while restart is in flight → supersede 34ms
 ✓ test/inflight.test.ts > in-flight table (BEH-BR-072) > live: replace while restart is in flight → supersede 38ms
 ✓ test/gxp.test.ts > audit records (behaviours 23, 24) > check 36: verifyAuditSequence reports gaps, duplicates and disorder only 1ms
 ✓ test/gxp.test.ts > fail closed and the latch (behaviour 23) > check 32: a requested record that cannot be written fails the call with AuditUnavailable and changes nothing 52ms
 ✓ test/inflight.test.ts > in-flight table (BEH-BR-072) > live: retry while restart is in flight → conflict 18ms
 ✓ test/inflight.test.ts > in-flight table (BEH-BR-072) > live: restart while restart is in flight → join 40ms
 ✓ test/inflight.test.ts > in-flight table (BEH-BR-072) > live: disable while restart is in flight → supersede 36ms
 ✓ test/inflight.test.ts > in-flight table (BEH-BR-072) > live: enable while restart is in flight → conflict 22ms
 ✓ test/inflight.test.ts > in-flight table (BEH-BR-072) > live: install while disable is in flight → duplicate-plugin 18ms
 ✓ test/inflight.test.ts > in-flight table (BEH-BR-072) > live: remove while disable is in flight → supersede 39ms
 ✓ test/inflight.test.ts > in-flight table (BEH-BR-072) > live: replace while disable is in flight → conflict 15ms
 ✓ test/inflight.test.ts > in-flight table (BEH-BR-072) > live: retry while disable is in flight → conflict 21ms
 ✓ test/inflight.test.ts > in-flight table (BEH-BR-072) > live: restart while disable is in flight → conflict 18ms
 ✓ test/inflight.test.ts > in-flight table (BEH-BR-072) > live: disable while disable is in flight → join 34ms
 ✓ test/inflight.test.ts > in-flight table (BEH-BR-072) > live: enable while disable is in flight → conflict 15ms
 ✓ test/inflight.test.ts > intent and parking (BEH-BR-067, 074) > BEH-BR-067: interrupting the caller does not cancel the transition 17ms
 ✓ test/inflight.test.ts > intent and parking (BEH-BR-067, 074) > BEH-BR-074: a call that supersedes a parked operation resumes it under its own options 47ms
 ✓ test/inflight.test.ts > intent and parking (BEH-BR-067, 074) > BEH-BR-072: a superseding replace that fails its definition checks fails alone 18ms
 ✓ test/gxp.test.ts > fail closed and the latch (behaviour 23) > check 34: an unwritten terminal record latches; mutations are refused; shutdown and acknowledgement are allowed 504ms
 ✓ test/inflight.test.ts > interruption before intent (BEH-BR-067, 188) > a caller interrupted while waiting for its turn changes nothing and ends with a failed (Interrupted) record 88ms
 ✓ test/inflight.test.ts > audit links of joins and supersession (BEH-BR-200) > joined and superseded calls write their own requested and a linked terminal record 85ms
 ✓ test/gxp.test.ts > operation gate (behaviour 25) > check 32: validation failures reach neither gate nor sink; refusals, gate defects and timeouts leave one rejected record and change nothing 78ms
 ✓ test/gxp.test.ts > operation gate (behaviour 25) > check 42: gate requests and records carry the definition version and digest; a gate can refuse by digest 23ms
 ✓ test/gxp.test.ts > hooks are optional (BEH-BR-194, 217) > check 38: with no sink and no gate, outcomes and snapshots equal those with a sink and an allow-all gate (except `audit`) 19ms
 ✓ test/gxp.test.ts > hooks are optional (BEH-BR-194, 217) > check 41: no core source reads ambient time or randomness outside the default IdGenerator 1ms

 Test Files  7 passed (7)
      Tests  78 passed (78)
   Start at  20:50:52
   Duration  1.90s (transform 762ms, setup 0ms, collect 3.25s, tests 3.00s, environment 1ms, prepare 865ms)
```
