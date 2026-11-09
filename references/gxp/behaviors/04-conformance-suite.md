# 04 — Conformance Suite

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-GX-BEH-04                                            |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-GX-03 §5)           |
> | Approved by    | — (pending; single maintainer, see PROC-GX-03 §5)            |
> | Classification | Functional Specification                                     |
> | Change History | 0.2 (2026-11-09): BEH-GX-028, 029: cases 8, 9 and 11 expect collision entries kept beside the primary ("stored-collision") instead of a "conflict" failure (F-02) (CCR-GX-002)<br>0.1 (2026-10-03): Initial draft (CCR-GX-001)                 |

---

A `TrailStore` is written by the consumer, against their own database, and
the companion cannot inspect it. What the companion can do is drive it: run
the real core host against it through `TestHost`, inject the faults that
break naive adapters — a commit whose answer is lost, a write that hangs
after committing, two writers racing for one sequence number — and check
what ends up stored. This file defines that suite, the fault wrapper it uses,
its numbered cases with their pass conditions, and what passing it does and
does not show ([ADR-GX-006](../decisions/006-conformance-through-testhost.md)). This file owns BEH-GX-025–032 and uses all
eight.

> **What the suite does not show**
>
> A passing run shows that the adapter answered correctly under the faults
> the suite injected, against the store instance the suite was given. It
> does not show that the store survives a power loss, a disk failure or a
> failover, that it is backed up, or that a production instance is
> configured like the tested one. Those are properties of the consumer's
> infrastructure and are qualified by the consumer. This is the consumer's
> obligation.

Planned source: `packages/gxp/src/testing/conformance.ts` and
`packages/gxp/src/testing/faultyTrailStore.ts` *(Planned)*, exported from
`@bridger/gxp/testing` ([19 — Testing Entry Point](./19-testing-entry-point.md)).

## BEH-GX-025: runTrailStoreConformance registers the numbered cases with the caller's test runner

> **Invariant:** [INV-GX-010](../invariants.md#inv-gx-010-evidence-results-come-only-from-runner-output-and-gaps-stay-gaps)
> **See:** [ADR-GX-006](../decisions/006-conformance-through-testhost.md), [ADR-GX-021](../decisions/021-oq-from-runner-output.md), [ADR-BR-035](../../core/decisions/035-evidence-from-executed-tests.md)
> **Satisfies:** [URS-GX-002](../urs.md#urs-gx-002-show-that-a-trail-adapter-conforms)
> **Risk:** [RSK-GX-001](../gxp/03-risk-assessment.md#rsk-gx-001), [RSK-GX-002](../gxp/03-risk-assessment.md#rsk-gx-002), [RSK-GX-016](../gxp/03-risk-assessment.md#rsk-gx-016)
> **Regulatory:** supports EU GMP Annex 11 §4.4, §4.7; GAMP 5 supplier testing of a configured component

```ts
// illustrative — not type-checked
declare function runTrailStoreConformance(
  makeStore: Effect.Effect<TrailStoreShape, unknown, Scope.Scope>,   // a fresh, empty store per case
  options: {
    readonly test: (name: string, body: () => Promise<void>, timeoutMs: number) => void   // the runner's `it`/`test`
    readonly reopen: ((store: TrailStoreShape) => Effect.Effect<TrailStoreShape, unknown, Scope.Scope>) | "not-supported"
    readonly seed: number                     // drives every random choice of the suite
    readonly scale?: { readonly records: number; readonly writers: number }   // default { records: 500, writers: 8 }
    readonly evidenceDir: string              // where conformance-manifest.json is written (BEH-GX-031)
  }
): void
```

```
REQUIREMENT: `runTrailStoreConformance` MUST register, through `options.test`,
             one test per case of BEH-GX-028, named "GX-CONF-NN <title>
             @REQ-GX-nnn", where NN is the case number and REQ-GX-nnn the
             acceptance check that the case evidences (20 — Required
             Acceptance Checks). It MUST NOT run a case outside the runner.
```

```
REQUIREMENT: Each case MUST obtain a new store from `makeStore` inside its own
             scope and MUST close that scope at the end of the case. A case
             MUST NOT depend on entries left by another case or on the order
             in which the runner executes cases.
```

```
REQUIREMENT: A case whose prerequisite the caller declared unavailable
             (`reopen: "not-supported"`) MUST still be registered, and MUST
             fail with the message "not executed: reopen not supported by the
             adapter". It MUST NOT be registered as skipped or omitted, so
             that the gap reaches the evidence as a failure the consumer must
             justify in a deviation (BEH-GX-125).
```

The suite registers tests rather than returning a verdict because a verdict
the companion computed would be the companion vouching for the adapter; the
evidence rules require results to come from a test runner's own output
([ADR-GX-021](../decisions/021-oq-from-runner-output.md), [ADR-BR-035](../../core/decisions/035-evidence-from-executed-tests.md)). The consumer runs the suite in their own
pipeline, against their own store, and the runner's report is the record.

**Settled here.** An unsupported reopen is a failure, not a skip. A skipped
test reads as "nothing wrong" in most reports, and reopen is exactly the case
that catches adapters which only work while a cache is warm.

## BEH-GX-026: The suite drives the real core through TestHost, never a mock of core

> **See:** [ADR-GX-006](../decisions/006-conformance-through-testhost.md), [ADR-BR-026](../../core/decisions/026-deterministic-test-host.md), [ADR-BR-035](../../core/decisions/035-evidence-from-executed-tests.md)
> **Satisfies:** [URS-GX-002](../urs.md#urs-gx-002-show-that-a-trail-adapter-conforms)
> **Risk:** [RSK-GX-016](../gxp/03-risk-assessment.md#rsk-gx-016), [RSK-BR-018](../../core/gxp/03-risk-assessment.md#rsk-br-018)
> **Regulatory:** supports EU GMP Annex 11 §4.4; GAMP 5 integration testing

```
REQUIREMENT: Every case that involves records MUST obtain them by running
             operations on a `TestHost` of the installed `@bridger/core`
             (BEH-BR-177) with `trailSink(store)` wired as its `AuditSink`.
             The suite MUST NOT construct `AuditRecord` values by hand, stub
             `AuditSink`, or re-implement any part of core's writer, retry or
             latch.
```

```
REQUIREMENT: The `TestHost` MUST use `TestClock` and the counter `IdGenerator`
             (BEH-BR-179), and its `auditTimeout` MUST be set to 10 seconds of
             `TestClock` time. Faults on plugins MUST be injected with core's
             `Fault` (BEH-BR-180); faults on the store with `faultyTrailStore`
             (BEH-GX-027).
```

```
REQUIREMENT: Cases 8, 9 and 11 of BEH-GX-028, which need entries that core
             never produces (a reused `recordId`, a reused sequence number),
             MUST build them from entries that core did produce in the same
             case, by changing one field and recomputing `canonical` and
             `digest` with the companion's own functions.
```

The value of the suite is that it exercises the interaction an adapter will
see in production: core's writer retrying the same record after a lost
answer, the latch after a failure, the late `failed` record of a timed-out
call ([BEH-BR-203](../../core/behaviors/23-audit-sink-and-record.md)). A mock of core would test the adapter against the
suite author's idea of core. `TestHost` runs core's production path with a
held scheduler ([BEH-BR-177](../../core/behaviors/21-testing-host.md)), so the sequence of attempts the adapter sees
is the one the production host would produce; because the reconciler is
steppable ([BEH-BR-178](../../core/behaviors/21-testing-host.md)), each case orders its steps and settles with
`awaitIdle` deterministically.

## BEH-GX-027: faultyTrailStore injects commit-then-hang, commit-then-fail, fail-before-commit and die

> **See:** [ADR-GX-006](../decisions/006-conformance-through-testhost.md), [ADR-GX-024](../decisions/024-fixtures-are-marked.md), [ADR-BR-026](../../core/decisions/026-deterministic-test-host.md)
> **Satisfies:** [URS-GX-002](../urs.md#urs-gx-002-show-that-a-trail-adapter-conforms)
> **Risk:** [RSK-GX-001](../gxp/03-risk-assessment.md#rsk-gx-001), [RSK-GX-002](../gxp/03-risk-assessment.md#rsk-gx-002), [RSK-GX-017](../gxp/03-risk-assessment.md#rsk-gx-017)
> **Regulatory:** supports EU GMP Annex 11 §4.4 (challenge testing)

```ts
// illustrative — not type-checked
type TrailFault =
  | "pass"                // forward to the inner store
  | "commit-then-hang"    // forward; after the inner store answers, never complete
  | "commit-then-fail"    // forward; after the inner store answers, fail with TrailWriteFailed "unavailable"
  | "fail-before-commit"  // do not forward; fail with TrailWriteFailed "unavailable"
  | "die"                 // do not forward; die with a defect

declare function faultyTrailStore(
  inner: TrailStoreShape,
  plan: (attempt: { readonly n: number; readonly recordId: string; readonly auditSeq: number }) => TrailFault
): Effect.Effect<{
  readonly store: TrailStoreShape                  // manifest: inner's, with fixture: true
  readonly attempts: Effect.Effect<readonly { readonly recordId: string; readonly fault: TrailFault }[]>
}>
```

```
REQUIREMENT: `plan` MUST be required; there MUST be no default plan. `n` MUST
             count `append` attempts on the wrapper from 1, across all
             records.
```

```
REQUIREMENT: For "commit-then-hang" and "commit-then-fail" the wrapper MUST
             forward the entry to `inner.append` and wait for its answer
             before hanging or failing, so that the entry is committed in the
             inner store. For "fail-before-commit" and "die" it MUST NOT call
             `inner.append`.
```

```
REQUIREMENT: Every injected failure MUST carry a message beginning "injected
             fault: " followed by the fault's name, and every defect MUST be
             an `Error` with that message, so that an injected failure cannot
             be mistaken for a real one (BEH-BR-180).
```

```
REQUIREMENT: `read` and `hosts` MUST be forwarded unchanged. The wrapper's
             manifest MUST be the inner manifest with `fixture: true`
             (BEH-GX-145).
```

The four faults are the four ways a store can disagree with what its caller
believes. Commit-then-hang and commit-then-fail are the dangerous ones: the
entry is stored but the caller has no "stored" answer, so the retry meets an
existing entry. An adapter that inserts without a unique constraint passes
every happy-path test and fails these two.

## BEH-GX-028: The numbered conformance cases and their pass conditions

> **Invariant:** [INV-GX-006](../invariants.md#inv-gx-006-one-primary-entry-per-record-and-per-host-sequence-number-and-no-stored-record-is-displaced), [INV-GX-007](../invariants.md#inv-gx-007-the-sink-acknowledges-only-what-the-store-reports-stored), [INV-GX-008](../invariants.md#inv-gx-008-no-companion-api-rewrites-a-stored-entry), [INV-GX-012](../invariants.md#inv-gx-012-the-canonical-form-is-deterministic-across-platforms)
> **See:** [ADR-GX-006](../decisions/006-conformance-through-testhost.md), [ADR-GX-004](../decisions/004-append-only-trail-store.md)
> **Satisfies:** [URS-GX-002](../urs.md#urs-gx-002-show-that-a-trail-adapter-conforms), [URS-GX-001](../urs.md#urs-gx-001-store-audit-records-with-honest-acknowledgement)
> **Risk:** [RSK-GX-001](../gxp/03-risk-assessment.md#rsk-gx-001), [RSK-GX-002](../gxp/03-risk-assessment.md#rsk-gx-002), [RSK-GX-015](../gxp/03-risk-assessment.md#rsk-gx-015)
> **Regulatory:** supports 21 CFR 11.10(e); EU GMP Annex 11 §4.4, §7.1, §9

| # | Case | Setup | Pass condition |
| --- | --- | --- | --- |
| 1 | Order | One host performs `scale.records` mutating calls (install, reconfigure, restart, remove, reconcile) with no fault | `read` returns entries with `auditSeq` 1..N, ascending, each once; `verifyAuditSequence` over the records reports no gap, duplicate or disorder ([BEH-BR-215](../../core/behaviors/24-time-ids-and-sequence.md)) |
| 2 | Byte-identical read-back | As case 1 | for every entry, `canonical` and `digest` read back equal those appended, and `digest` recomputed from `canonical` equals the stored `digest` |
| 3 | Repeat of a stored entry | Append an entry, then the same entry again | answers "stored" then "already-stored"; `hosts` shows `count` 1 |
| 4 | Retry after commit-then-hang | `faultyTrailStore` plans "commit-then-hang" for the first attempt of a call's `requested` record | the call fails with `AuditUnavailable` after 10 s of `TestClock`; the store holds the `requested` entry exactly once, followed by that call's `failed` (`AuditUnavailable`) entry ([BEH-BR-203](../../core/behaviors/23-audit-sink-and-record.md)); no other entry for the call |
| 5 | Retry after commit-then-fail | "commit-then-fail" on the first attempt of a `requested` record | the call completes; the second attempt answers "already-stored"; the entry is stored once |
| 6 | Retry after fail-before-commit | "fail-before-commit" on the first attempt | the call completes; the second attempt answers "stored"; the entry is stored once |
| 7 | Retry after a defect | "die" on the first attempt | as case 6; the sink answered core with `AuditWriteFailed`, not a defect ([BEH-GX-019](./03-trail-sink.md#beh-gx-019-the-sink-fails-a-write-only-when-the-store-did-not-store-the-record-and-every-failure-is-auditwritefailed-without-record-content)) |
| 8 | Colliding content under one recordId | Append an entry, then an entry with the same `recordId`, a changed `reason` and recomputed digest; then the second entry again | second append answers "stored-collision", third "already-stored"; read-back returns the first entry byte-identical as primary, then the second once, with `collision` `{ reason: "record-id", with: <first digest> }`; `hosts` shows `count` 1 and `collisions` 1 |
| 9 | Colliding entry at one sequence number | Append an entry, then one with another `recordId` at the same `(hostId, auditSeq)` | as case 8, with `collision.reason` "host-seq" |
| 10 | Two hosts, one store | Two `TestHost`s with distinct `hostId`s write concurrently, `scale.records` calls each | `hosts` lists both with `firstSeq` 1, `lastSeq` = `count`; each host's `read` returns only its entries, contiguous from 1 |
| 11 | Racing appends | `scale.writers` fibers append distinct entries at the same `(hostId, auditSeq)` at once, released together | exactly one append answers "stored" and every other "stored-collision"; one primary entry and `scale.writers` − 1 collision entries naming its digest are stored |
| 12 | Reopen | After case 1's writes, close the store's scope and call `reopen` | the reopened store returns the same entries byte-identical; appending a stored entry again answers "already-stored" |
| 13 | Unicode exactness | Calls whose `reason` contains an astral character, a combining sequence and its precomposed form in separate calls, U+2028, U+0000-escaped text and a 4,000-character string | every entry reads back byte-identical; the NFC and NFD reasons stay distinct entries with distinct digests |
| 14 | No partial entries | For seeded random attempts, "fail-before-commit" or "die" | after each fault, `read` returns for that `recordId` either nothing or the whole entry with every field equal |
| 15 | Size limit | An entry of exactly `manifest.maxEntryBytes` and one of one byte more, built from a core record with a padded `reason` | the first answers "stored"; the second fails "too-large" and nothing is stored for it |
| 16 | Ranges and extents | After case 1, reads with `fromSeq`/`toSeq` at 1, N, interior values, `fromSeq > toSeq` and beyond N | each read returns exactly the inclusive range (empty when it is empty); `hosts` equals the extent of what `read` returns |

```
REQUIREMENT: The suite MUST implement every case of the table, with the setup
             and pass condition stated. A case MUST fail when any part of its
             pass condition does not hold, and its failure message MUST name
             the part that did not hold.
```

```
REQUIREMENT: Case numbers MUST NOT be reused or renumbered. A case added later
             MUST take the next free number; a case withdrawn MUST keep its
             number, registered as a test that fails with "withdrawn in
             <companion version>" until the next major version.
```

Cases 4 to 7 are the ones core's design depends on: the retry in place
([BEH-BR-202](../../core/behaviors/23-audit-sink-and-record.md)) is only safe if a store absorbs a repeat. Case 4 checks the
whole chain at once — a lost answer, a call that failed closed, its late
`failed` record — because a store that passes 5 but not 4 would leave the
trail with a `requested` record and no terminal one.

## BEH-GX-029: Fault cases end in the outcome core specifies, not merely a stored entry

> **See:** [ADR-GX-006](../decisions/006-conformance-through-testhost.md), [ADR-BR-031](../../core/decisions/031-audit-failure-policy.md)
> **Satisfies:** [URS-GX-002](../urs.md#urs-gx-002-show-that-a-trail-adapter-conforms), [URS-GX-001](../urs.md#urs-gx-001-store-audit-records-with-honest-acknowledgement)
> **Risk:** [RSK-GX-001](../gxp/03-risk-assessment.md#rsk-gx-001), [RSK-BR-004](../../core/gxp/03-risk-assessment.md#rsk-br-004)
> **Regulatory:** supports 21 CFR 11.10(e); EU GMP Annex 11 §9

```
REQUIREMENT: Cases 4 to 7 and 14 MUST also check the host's side: the
             operation's result, `HostSnapshot.auditDegraded`, and the records
             of the call. Case 4 MUST find the latch not set once the late
             records are written; cases 5 to 7 MUST find the operation's
             normal result and the latch not set.
```

```
REQUIREMENT: Every case MUST end by running `checkTrailEntries` (BEH-GX-033)
             over everything the store holds and MUST fail when it reports any
             finding other than those the case expects. Cases 8, 9 and 11
             expect exactly one `collision` finding per collision entry
             (BEH-GX-034) and the `duplicate` findings core's sequence check
             reports for them, and nothing else.
```

Checking the host as well as the store catches an adapter that stores
correctly but answers wrongly: an adapter that commits and then answers
"stored" late enough to exceed `auditTimeout` on every call would pass a
store-only check and leave the host failing every change.

## BEH-GX-030: A run is deterministic for its seed

> **Invariant:** [INV-GX-012](../invariants.md#inv-gx-012-the-canonical-form-is-deterministic-across-platforms)
> **See:** [ADR-GX-006](../decisions/006-conformance-through-testhost.md), [ADR-BR-025](../../core/decisions/025-deterministic-time-and-ids.md), [ADR-BR-026](../../core/decisions/026-deterministic-test-host.md)
> **Satisfies:** [NFR-GX-001](../urs.md#nfr-gx-001-deterministic-outputs), [URS-GX-002](../urs.md#urs-gx-002-show-that-a-trail-adapter-conforms)
> **Risk:** [RSK-GX-016](../gxp/03-risk-assessment.md#rsk-gx-016)
> **Regulatory:** supports EU GMP Annex 11 §4.7 (reproducible test results)

```
REQUIREMENT: Every random choice of the suite — operation mix, fault points of
             case 14, the release order of case 11's fibers where the runtime
             allows it — MUST be drawn from a generator seeded with
             `options.seed`. Time MUST come only from `TestClock`, identifiers
             only from the counter `IdGenerator`.
```

```
REQUIREMENT: For the same seed, scale, companion version and core version, the
             records handed to the store MUST be identical in every field
             across runs, so that a failing run can be repeated exactly.
```

```
REQUIREMENT: The seed MUST appear in every test name's failure message and in
             the conformance manifest (BEH-GX-031).
```

The adapter itself may be nondeterministic — a database decides which of
case 11's racing writers wins — and the pass conditions are written so that
any legal outcome passes. Only the input is fixed by the seed.

## BEH-GX-031: The output of a run is evidence for the pack, not a verdict

> **Invariant:** [INV-GX-010](../invariants.md#inv-gx-010-evidence-results-come-only-from-runner-output-and-gaps-stay-gaps)
> **See:** [ADR-GX-021](../decisions/021-oq-from-runner-output.md), [ADR-GX-022](../decisions/022-evidence-pack-format.md)
> **Satisfies:** [URS-GX-002](../urs.md#urs-gx-002-show-that-a-trail-adapter-conforms), [URS-GX-014](../urs.md#urs-gx-014-produce-operational-evidence-that-shows-gaps)
> **Risk:** [RSK-GX-016](../gxp/03-risk-assessment.md#rsk-gx-016)
> **Regulatory:** supports EU GMP Annex 11 §4.4; 21 CFR 11.10(a) (as evidence the consumer evaluates)

```ts
// illustrative — not type-checked
// <evidenceDir>/conformance-manifest.json
interface ConformanceManifest {
  readonly format: "bridger-gx-conformance/1"
  readonly adapter: TrailStoreManifest                 // copied unchanged (BEH-GX-016)
  readonly companion: { readonly name: "@bridger/gxp"; readonly version: string }
  readonly core: { readonly name: "@bridger/core"; readonly version: string }
  readonly seed: number
  readonly scale: { readonly records: number; readonly writers: number }
  readonly reopen: "supported" | "not-supported"
  readonly cases: readonly { readonly number: number; readonly testName: string; readonly requirement: string }[]
}
```

```
REQUIREMENT: Before registering its tests, the suite MUST write
             `conformance-manifest.json` to `evidenceDir`, listing every case
             it registers. The manifest MUST NOT contain a result.
```

```
REQUIREMENT: The results of a run MUST be taken only from the test runner's
             own report, by the evidence generator (BEH-GX-121), which matches
             the runner's test names against the manifest's `cases`. A case in
             the manifest with no test in the report MUST appear in the pack
             as not executed; a test that failed MUST appear as failed
             (BEH-GX-129).
```

```
REQUIREMENT: The manifest MUST be included as an attachment of the evidence
             pack, with its SHA-256 recorded in the pack manifest
             (BEH-GX-130).
```

Separating the list of what should have run from the record of what did is
what lets a pack show a gap: a runner that crashed half-way, a filter that
excluded a case, a case renamed so that it no longer matches. Each surfaces as
"not executed" rather than vanishing.

## BEH-GX-032: The suite's limits are stated in its output

> **See:** [ADR-GX-027](../decisions/027-claims-and-non-claims.md), [ADR-GX-006](../decisions/006-conformance-through-testhost.md), [ADR-BR-034](../../core/decisions/034-gxp-companion-scope.md)
> **Satisfies:** [URS-GX-016](../urs.md#urs-gx-016-know-which-obligations-remain-mine), [URS-GX-002](../urs.md#urs-gx-002-show-that-a-trail-adapter-conforms)
> **Risk:** [RSK-GX-004](../gxp/03-risk-assessment.md#rsk-gx-004), [RSK-GX-001](../gxp/03-risk-assessment.md#rsk-gx-001)
> **Regulatory:** supports (by delimiting) EU GMP Annex 11 §4, §7

```
REQUIREMENT: The conformance manifest, the suite's documentation and every
             report rendered from them MUST state: "Conformance shows how the
             adapter answered under the faults the suite injected, on the
             store instance it was given. It does not show durability, backup,
             failover, access control or the configuration of any other
             instance."
```

```
REQUIREMENT: No companion output MAY describe a store that passed the suite as
             certified, approved, durable or qualified. It MAY say only that
             the named cases passed for the named adapter version, store
             instance, seed, companion version and core version.
```

```
REQUIREMENT: A run against an adapter whose manifest has `commit: "in-memory"`
             or `fixture: true` MUST be marked in the conformance manifest as
             a self-test of the suite, and the evidence generator MUST NOT
             count it as evidence for a production adapter (BEH-GX-145).
```

The companion uses its own `memoryTrailStore` to test the suite itself — the
same cases must pass against it, and a deliberately broken variant must fail
cases 3 to 9 ([BEH-GX-147](./19-testing-entry-point.md)). That self-test is evidence about the suite,
not about any store a consumer uses, and the marking keeps the two apart.

---

_Previous: [03 — Trail Sink](./03-trail-sink.md)_ · _Next: [05 — Checks on Read](./05-checks-on-read.md)_
