# Host-core prototype — results (phases P1 and P3, and G11)

Throwaway prototype of the Bridger host core — behaviours 01–09 of
`references/core/` (definition, installation, states and snapshots,
activation, removal, replacement and reactivation, operation legality,
leases) — on `effect@4.0.0`. Its purpose is to find where the specification
is wrong or incomplete before the real implementation starts. It is **not**
the implementation and evidences no requirement (CCR-BR-004).

Run: `npm install && npm run check && npm test` (Node 22). `src/host.ts` is
about 650 lines; `src/legality.ts` is the total state × operation table.

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
in-flight operation table (joins and supersession — a call on a plugin with an
operation in flight queues behind it here), and, in phase P1, the GxP hooks
(covered in phase P3 below).

## Findings fed back into the specification

| # | Finding | Specification change |
| --- | --- | --- |
| G10 | `IdentifiersOf` as written yields `unknown` for an empty tuple, so `provides: []` could not type-check (found by `tsc`) | BEH-BR-002 now requires the distributive form |
| G11 | A provider's removal must stop a dependent that may have its own operator operation in flight; the spec orders operations per plugin but not across plugins | Closed by ADR-BR-038 and BEH-BR-078–080 (CCR-BR-006); see the G11 section below |
| G12 | "Revoke remaining scoped leases" named no mechanism; a scoped lease has no child fiber, so revocation interrupts the acquiring fiber | BEH-BR-086 states it |
| — | Confirmed in practice: the prototype finding G9 fix (interrupt and await the child) gives the required order — the callback's finalizer runs before the provider closes | none |

## Deliberate simplifications

- Operations are admitted and linearized per plugin (ADR-BR-038), but a call that meets another operator operation on the same plugin queues behind it rather than being decided by the in-flight table (BEH-BR-072); joins and supersession are not implemented.
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

## Output of the run recorded on 2026-10-02

```

 RUN  v3.2.7 /Users/mohammadalmechkor/Documents/ChatGPT/Bridger/prototypes/host-core

 ✓ test/leases.test.ts > leases > check 2 / BEH-BR-085, 086: removal waits for a lease, fails with DrainTimeout, succeeds with force 51ms
 ✓ test/leases.test.ts > leases > check 3 / BEH-BR-088: a callback that removes its own provider fails at once with WouldDeadlock 7ms
 ✓ test/leases.test.ts > leases > check 12 / BEH-BR-084: interrupting the caller interrupts the child and runs its finalizers before the lease is released 10ms
 ✓ test/leases.test.ts > leases > BEH-BR-087: a per-call timeout interrupts the callback and fails with LeaseTimeout 16ms
 ✓ test/leases.test.ts > leases > check 18 / BEH-BR-082, 083: useAll is all-or-nothing and goes through the same drain path 17ms
 ✓ test/lifecycle.test.ts > installation and activation > check 19 / BEH-BR-017, 021, 033: install order does not matter; a missing requirement is state, not an error 11ms
 ✓ test/lifecycle.test.ts > installation and activation > check 9 / BEH-BR-018–020: duplicate ids, duplicate providers and cycles register nothing 4ms
 ✓ test/lifecycle.test.ts > installation and activation > check 11 / BEH-BR-038: two key objects with one ServiceId fail the activation with KeyMismatch 4ms
 ✓ test/lifecycle.test.ts > installation and activation > check 16 / BEH-BR-036: every activation builds its layer again (fresh memo map) 9ms
 ✓ test/lifecycle.test.ts > installation and activation > BEH-BR-039: a build in flight when the plugin is removed is never published 53ms
 ✓ test/lifecycle.test.ts > removal > check 1 / BEH-BR-043, 044: dependents stop first and can use their provider in their finalizers 5ms
 ✓ test/lifecycle.test.ts > removal > BEH-BR-046, 047: a cleanup failure is reported, and removing the plugin acknowledges the leak 5ms
 ✓ test/lifecycle.test.ts > replacement and reactivation > check 9 / BEH-BR-050, 051: replace validates before stopping; dropping a provided key strands dependents 8ms
 ✓ test/lifecycle.test.ts > replacement and reactivation > check 10 / BEH-BR-031, 056, 057: failure is sticky through dependency loss; retry lands by availability 5ms
 ✓ test/leases.test.ts > legality (BEH-BR-071) > check 4: the table is total and matches the specification for every settled row 1ms
 ✓ test/leases.test.ts > legality (BEH-BR-071) > no-op cells succeed and change nothing (live host) 4ms
 ✓ test/lifecycle.test.ts > replacement and reactivation > check 27 / BEH-BR-060–062: disable frees the provider slot; enable re-validates 3ms
 ✓ test/lifecycle.test.ts > snapshots > BEH-BR-029, 030: revisions never regress and `changes` emits the current snapshot first 3ms
 ✓ test/lifecycle.test.ts > snapshots > check 8 / BEH-BR-105, 106: shutdown stops in reverse dependency order and reports cleanup failures 2ms
 ✓ test/confluence.test.ts > confluence > seed 1: a random history settles to the same states as a fresh install of the final set 25ms
 ✓ test/confluence.test.ts > confluence > seed 7: a random history settles to the same states as a fresh install of the final set 16ms
 ✓ test/confluence.test.ts > confluence > seed 42: a random history settles to the same states as a fresh install of the final set 24ms
 ✓ test/confluence.test.ts > confluence > seed 99: a random history settles to the same states as a fresh install of the final set 21ms
 ✓ test/confluence.test.ts > confluence > seed 2026: a random history settles to the same states as a fresh install of the final set 24ms
 ✓ test/ordering.test.ts > cross-plugin stop ordering (ADR-BR-038) > check 43 / BEH-BR-078, 088: a lease holder's calls never wait on the drain its lease blocks 31ms
 ✓ test/ordering.test.ts > cross-plugin stop ordering (ADR-BR-038) > check 44 / BEH-BR-079: a removal that meets a dependent's restart waits for its step, not its operation 35ms
 ✓ test/gxp.test.ts > attribution (behaviour 22) > check 31: unattributed or reason-less calls fail before any record or change; a per-call context wins 94ms
 ✓ test/gxp.test.ts > audit records (behaviours 23, 24) > check 33: exactly one requested and one terminal record per admitted call, including no-ops 25ms
 ✓ test/ordering.test.ts > cross-plugin stop ordering (ADR-BR-038) > check 45 / BEH-BR-080: a removal resumes a dependent's parked stop and ends the parked intent 111ms
 ✓ test/gxp.test.ts > audit records (behaviours 23, 24) > check 39: system transitions carry Actor.system and the causation of their trigger, and are never gated 28ms
 ✓ test/gxp.test.ts > audit records (behaviours 23, 24) > check 35 / 36: auditSeq is contiguous from 1; a failed write is retried in place with the same id and number 279ms
 ✓ test/gxp.test.ts > audit records (behaviours 23, 24) > check 36: verifyAuditSequence reports gaps, duplicates and disorder only 0ms
 ✓ test/gxp.test.ts > fail closed and the latch (behaviour 23) > check 32: a requested record that cannot be written fails the call with AuditUnavailable and changes nothing 55ms
 ✓ test/gxp.test.ts > fail closed and the latch (behaviour 23) > check 34: an unwritten terminal record latches; mutations are refused; shutdown and acknowledgement are allowed 501ms
 ✓ test/gxp.test.ts > operation gate (behaviour 25) > check 32: validation failures reach neither gate nor sink; refusals, gate defects and timeouts leave one rejected record and change nothing 79ms
 ✓ test/gxp.test.ts > operation gate (behaviour 25) > check 42: gate requests and records carry the definition version and digest; a gate can refuse by digest 23ms
 ✓ test/gxp.test.ts > hooks are optional (BEH-BR-194, 217) > check 38: with no sink and no gate, outcomes and snapshots equal those with a sink and an allow-all gate (except `audit`) 10ms
 ✓ test/gxp.test.ts > hooks are optional (BEH-BR-194, 217) > check 41: no core source reads ambient time or randomness outside the default IdGenerator 1ms

 Test Files  5 passed (5)
      Tests  38 passed (38)
   Start at  18:39:09
   Duration  1.96s (transform 493ms, setup 0ms, collect 2.09s, tests 1.61s, environment 1ms, prepare 759ms)
```
