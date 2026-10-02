# Host-core prototype — results (phases P1 and P3)

Throwaway prototype of the Bridger host core — behaviours 01–09 of
`references/core/` (definition, installation, states and snapshots,
activation, removal, replacement and reactivation, operation legality,
leases) — on `effect@4.0.0`. Its purpose is to find where the specification
is wrong or incomplete before the real implementation starts. It is **not**
the implementation and evidences no requirement (CCR-BR-004).

Run: `npm install && npm run check && npm test` (Node 22). `src/host.ts` is
about 450 lines; `src/legality.ts` is the total state × operation table.

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
in-flight operation table (joins and supersession — unreachable here because
operations are serialized), and all GxP hooks.

## Findings fed back into the specification

| # | Finding | Specification change |
| --- | --- | --- |
| G10 | `IdentifiersOf` as written yields `unknown` for an empty tuple, so `provides: []` could not type-check (found by `tsc`) | BEH-BR-002 now requires the distributive form |
| G11 | A provider's removal must stop a dependent that may have its own operator operation in flight; the spec orders operations per plugin but not across plugins | Open design item in URS §7; the prototype linearizes operator operations host-wide instead |
| G12 | "Revoke remaining scoped leases" named no mechanism; a scoped lease has no child fiber, so revocation interrupts the acquiring fiber | BEH-BR-086 states it |
| — | Confirmed in practice: the prototype finding G9 fix (interrupt and await the child) gives the required order — the callback's finalizer runs before the provider closes | none |

## Deliberate simplifications

- Operator operations are linearized host-wide (stronger than the spec's per-plugin rule).
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

## Output of the run recorded on 2026-10-02

```

 RUN  v3.2.7 /Users/mohammadalmechkor/Documents/ChatGPT/Bridger/prototypes/host-core

 ✓ test/confluence.test.ts > confluence > seed 1: a random history settles to the same states as a fresh install of the final set 32ms
 ✓ test/confluence.test.ts > confluence > seed 7: a random history settles to the same states as a fresh install of the final set 17ms
 ✓ test/confluence.test.ts > confluence > seed 42: a random history settles to the same states as a fresh install of the final set 17ms
 ✓ test/confluence.test.ts > confluence > seed 99: a random history settles to the same states as a fresh install of the final set 15ms
 ✓ test/confluence.test.ts > confluence > seed 2026: a random history settles to the same states as a fresh install of the final set 13ms
 ✓ test/lifecycle.test.ts > installation and activation > check 19 / BEH-BR-017, 021, 033: install order does not matter; a missing requirement is state, not an error 11ms
 ✓ test/lifecycle.test.ts > installation and activation > check 9 / BEH-BR-018–020: duplicate ids, duplicate providers and cycles register nothing 5ms
 ✓ test/lifecycle.test.ts > installation and activation > check 11 / BEH-BR-038: two key objects with one ServiceId fail the activation with KeyMismatch 4ms
 ✓ test/lifecycle.test.ts > installation and activation > check 16 / BEH-BR-036: every activation builds its layer again (fresh memo map) 3ms
 ✓ test/lifecycle.test.ts > installation and activation > BEH-BR-039: a build in flight when the plugin is removed is never published 56ms
 ✓ test/lifecycle.test.ts > removal > check 1 / BEH-BR-043, 044: dependents stop first and can use their provider in their finalizers 5ms
 ✓ test/lifecycle.test.ts > removal > BEH-BR-046, 047: a cleanup failure is reported, and removing the plugin acknowledges the leak 2ms
 ✓ test/lifecycle.test.ts > replacement and reactivation > check 9 / BEH-BR-050, 051: replace validates before stopping; dropping a provided key strands dependents 7ms
 ✓ test/lifecycle.test.ts > replacement and reactivation > check 10 / BEH-BR-031, 056, 057: failure is sticky through dependency loss; retry lands by availability 8ms
 ✓ test/gxp.test.ts > attribution (behaviour 22) > check 31: unattributed or reason-less calls fail before any record or change; a per-call context wins 55ms
 ✓ test/gxp.test.ts > audit records (behaviours 23, 24) > check 33: exactly one requested and one terminal record per admitted call, including no-ops 28ms
 ✓ test/gxp.test.ts > audit records (behaviours 23, 24) > check 39: system transitions carry Actor.system and the causation of their trigger, and are never gated 29ms
 ✓ test/leases.test.ts > leases > check 2 / BEH-BR-085, 086: removal waits for a lease, fails with DrainTimeout, succeeds with force 56ms
 ✓ test/leases.test.ts > leases > check 3 / BEH-BR-088: a callback that removes its own provider fails at once with WouldDeadlock 8ms
 ✓ test/leases.test.ts > leases > check 12 / BEH-BR-084: interrupting the caller interrupts the child and runs its finalizers before the lease is released 18ms
 ✓ test/leases.test.ts > leases > BEH-BR-087: a per-call timeout interrupts the callback and fails with LeaseTimeout 16ms
 ✓ test/leases.test.ts > leases > check 18 / BEH-BR-082, 083: useAll is all-or-nothing and goes through the same drain path 16ms
 ✓ test/lifecycle.test.ts > replacement and reactivation > check 27 / BEH-BR-060–062: disable frees the provider slot; enable re-validates 2ms
 ✓ test/lifecycle.test.ts > snapshots > BEH-BR-029, 030: revisions never regress and `changes` emits the current snapshot first 3ms
 ✓ test/lifecycle.test.ts > snapshots > check 8 / BEH-BR-105, 106: shutdown stops in reverse dependency order and reports cleanup failures 4ms
 ✓ test/leases.test.ts > legality (BEH-BR-071) > check 4: the table is total and matches the specification for every settled row 2ms
 ✓ test/leases.test.ts > legality (BEH-BR-071) > no-op cells succeed and change nothing (live host) 3ms
 ✓ test/gxp.test.ts > audit records (behaviours 23, 24) > check 35 / 36: auditSeq is contiguous from 1; a failed write is retried in place with the same id and number 279ms
 ✓ test/gxp.test.ts > audit records (behaviours 23, 24) > check 36: verifyAuditSequence reports gaps, duplicates and disorder only 0ms
 ✓ test/gxp.test.ts > fail closed and the latch (behaviour 23) > check 32: a requested record that cannot be written fails the call with AuditUnavailable and changes nothing 52ms
 ✓ test/gxp.test.ts > fail closed and the latch (behaviour 23) > check 34: an unwritten terminal record latches; mutations are refused; shutdown and acknowledgement are allowed 504ms
 ✓ test/gxp.test.ts > operation gate (behaviour 25) > check 32: validation failures reach neither gate nor sink; refusals, gate defects and timeouts leave one rejected record and change nothing 75ms
 ✓ test/gxp.test.ts > operation gate (behaviour 25) > check 42: gate requests and records carry the definition version and digest; a gate can refuse by digest 24ms
 ✓ test/gxp.test.ts > hooks are optional (BEH-BR-194, 217) > check 38: with no sink and no gate, outcomes and snapshots equal those with a sink and an allow-all gate (except `audit`) 11ms
 ✓ test/gxp.test.ts > hooks are optional (BEH-BR-194, 217) > check 41: no core source reads ambient time or randomness outside the default IdGenerator 1ms

 Test Files  4 passed (4)
      Tests  35 passed (35)
   Start at  18:16:31
   Duration  1.59s (transform 314ms, setup 0ms, collect 1.22s, tests 1.39s, environment 0ms, prepare 293ms)

```
