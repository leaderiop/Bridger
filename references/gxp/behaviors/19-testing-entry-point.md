# 19 — Testing Entry Point

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-GX-BEH-19                                            |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-GX-03 §5)           |
> | Approved by    | — (pending; single maintainer, see PROC-GX-03 §5)            |
> | Classification | Functional Specification                                     |
> | Change History | 0.2 (2026-11-09): `memoryTrailStore` keeps collisions beside the primary; `brokenTrailStore` variants "overwrite-on-collision" and "drop-on-collision"; `GxpTestHost.make` takes `trailGate` (F-02) (CCR-GX-002)<br>0.1 (2026-10-03): Initial draft (CCR-GX-001)                 |

---

Every port of the companion is caller-supplied and has no default
([BEH-GX-003](./01-companion-boundary.md#beh-gx-003-no-port-that-stores-authenticates-signs-holds-keys-or-decides-has-a-default)). Tests still need working implementations — of the stores, the
signature port and the key provider — and the conformance suite needs
deliberately broken ones to show it can fail. This file specifies
`@bridger/gxp/testing`: the fixtures it exports, the marker every fixture
carries and the installation checks refuse, the broken store variants of
the suite's self-test, and how the fixtures sit on core's own `TestHost`,
`Fault`, `memoryAuditSink` and `scriptedGate` ([ADR-GX-024](../decisions/024-fixtures-are-marked.md),
[ADR-GX-006](../decisions/006-conformance-through-testhost.md)). This file owns BEH-GX-145–152 and uses all eight.

> **What the fixtures are not**
>
> Every fixture keeps its data in process memory, for the life of a test
> scope, and offers no storage, retention, durability, access control,
> authentication or key protection. None of them is a starting point for a
> production adapter. Supplying production ports is the consumer's
> obligation.

Planned source: `packages/gxp/src/testing/index.ts`,
`packages/gxp/src/testing/memoryStores.ts`,
`packages/gxp/src/testing/brokenTrailStore.ts`,
`packages/gxp/src/testing/scriptedSignatureCapture.ts`,
`packages/gxp/src/testing/testKeyProvider.ts` and
`packages/gxp/src/testing/GxpTestHost.ts` *(Planned)*.

## BEH-GX-145: @bridger/gxp/testing exports the fixtures, and every fixture carries fixture: true in its manifest

> **Invariant:** [INV-GX-014](../invariants.md#inv-gx-014-test-fixtures-are-detectable), [INV-GX-001](../invariants.md#inv-gx-001-no-decision-port-has-a-default-outside-the-testing-entry-point)
> **See:** [ADR-GX-024](../decisions/024-fixtures-are-marked.md), [ADR-GX-003](../decisions/003-ports-without-defaults.md), [ADR-BR-026](../../core/decisions/026-deterministic-test-host.md)
> **Satisfies:** [URS-GX-016](../urs.md#urs-gx-016-know-which-obligations-remain-mine), [URS-GX-002](../urs.md#urs-gx-002-show-that-a-trail-adapter-conforms)
> **Risk:** [RSK-GX-017](../gxp/03-risk-assessment.md#rsk-gx-017)
> **Regulatory:** supports EU GMP Annex 11 §4.7 (test tools identified as such); 21 CFR 11.10(d)

| Export | Port | Defined in |
| --- | --- | --- |
| `memoryTrailStore()` | `TrailStore` | [BEH-GX-146](#beh-gx-146-memorytrailstore-keeps-every-trail-store-rule-in-memory-and-faultytrailstore-wraps-any-store) |
| `faultyTrailStore(inner, plan)` | `TrailStore` | [BEH-GX-027](./04-conformance-suite.md#beh-gx-027-faultytrailstore-injects-commit-then-hang-commit-then-fail-fail-before-commit-and-die) |
| `brokenTrailStore(defect)` | `TrailStore` | [BEH-GX-147](#beh-gx-147-brokentrailstore-variants-make-the-conformance-suite-fail-and-the-suite-must-catch-each-one) |
| `memoryTicketStore()`, `memoryAnchorStore({ custodian })` | `TicketStore`, `AnchorStore` | [BEH-GX-148](#beh-gx-148-memoryticketstore-and-memoryanchorstore-keep-their-ports-rules-compare-and-set-included) |
| `scriptedSignatureCapture(decide)` | `SignatureCapture` | [BEH-GX-149](#beh-gx-149-scriptedsignaturecapture-requires-its-decide-function-and-has-no-approve-all-form) |
| `testKeyProvider(seed)` | `FingerprintKeyProvider` | [BEH-GX-150](#beh-gx-150-testkeyprovider-derives-keys-from-a-seed-under-test-key-ids) |
| `GxpTestHost.make(options)` | — (assembles the above on core's `TestHost`) | [BEH-GX-151](#beh-gx-151-gxptesthost-assembles-the-fixtures-on-cores-testhost-with-deterministic-time-and-identifiers) |
| `runTrailStoreConformance` | — (the suite) | [BEH-GX-025](./04-conformance-suite.md#beh-gx-025-runtrailstoreconformance-registers-the-numbered-cases-with-the-callers-test-runner) |

```
REQUIREMENT: The testing entry point MUST export exactly the members of the
             table. Every port value it builds MUST have a `manifest` with
             `fixture: true` and a `name` beginning "@bridger/gxp/testing/";
             the main entry point MUST export none of them, and a check in the
             companion's build MUST fail if a main-entry module imports one.
```

```
REQUIREMENT: The type documentation of every export MUST begin: "Test
             fixture. Keeps data in process memory for the life of the test
             scope. Not for production use; the installation checks refuse
             it."
```

```
REQUIREMENT: Data a fixture produces MUST be recognisable as fixture data
             where the port's shape allows: signatures carry the method
             "test-fixture" (BEH-GX-149), fingerprints a key id beginning
             "test:" (BEH-GX-150), trail store manifests `commit:
             "in-memory"`.
```

The marker is a field of the manifest every port already publishes
([BEH-GX-016](./02-trail-store-port.md#beh-gx-016-every-adapter-publishes-a-manifest-of-its-commit-semantics-and-limits), [BEH-GX-041](./06-high-water-marks-and-anchors.md#beh-gx-041-the-anchorstore-port-is-append-only-and-has-no-default), [BEH-GX-068](./09-approval-tickets.md#beh-gx-068-the-ticketstore-is-an-append-only-event-log-with-its-own-sequence-and-compare-and-set), [BEH-GX-073](./10-signature-capture-port.md#beh-gx-073-the-signaturecapture-port-captures-one-signature-per-request-and-has-no-default), [BEH-GX-105](./14-fingerprint-keys.md#beh-gx-105-the-fingerprintkeyprovider-port-returns-the-current-key-and-any-key-by-id-and-has-no-default)),
so the installation checks can find a fixture by reading what is wired,
without trusting an import list ([BEH-GX-118](./15-installation-checks.md#beh-gx-118-ports-are-wired-as-declared-and-no-fixture-is-wired)). Core takes the same
approach for its own fixtures by keeping them in a testing entry point
([BEH-BR-181](../../core/behaviors/21-testing-host.md), [BEH-BR-182](../../core/behaviors/21-testing-host.md)); the companion adds the marker because its
fixtures are full port implementations that would otherwise look real.

## BEH-GX-146: memoryTrailStore keeps every trail store rule in memory, and faultyTrailStore wraps any store

> **Invariant:** [INV-GX-006](../invariants.md#inv-gx-006-one-primary-entry-per-record-and-per-host-sequence-number-and-no-stored-record-is-displaced), [INV-GX-008](../invariants.md#inv-gx-008-no-companion-api-rewrites-a-stored-entry)
> **See:** [ADR-GX-024](../decisions/024-fixtures-are-marked.md), [ADR-GX-004](../decisions/004-append-only-trail-store.md), [ADR-GX-006](../decisions/006-conformance-through-testhost.md)
> **Satisfies:** [URS-GX-002](../urs.md#urs-gx-002-show-that-a-trail-adapter-conforms)
> **Risk:** [RSK-GX-017](../gxp/03-risk-assessment.md#rsk-gx-017), [RSK-GX-002](../gxp/03-risk-assessment.md#rsk-gx-002)
> **Regulatory:** supports EU GMP Annex 11 §4.7

```ts
// illustrative — not type-checked
declare function memoryTrailStore(options?: { readonly maxEntryBytes?: number }):     // default 65536
  Effect.Effect<TrailStoreShape & { readonly reopen: Effect.Effect<TrailStoreShape> }, never, Scope.Scope>
```

```
REQUIREMENT: `memoryTrailStore` MUST implement every requirement of
             02 — Trail Store Port: idempotence on `recordId` with content
             comparison, one primary entry per `recordId` and per `(hostId,
             auditSeq)`, collision entries kept beside and never over it, ranged reads in ascending order, exact
             read-back of `canonical`, and `hosts` extents. Its manifest MUST
             be `{ name: "@bridger/gxp/testing/memoryTrailStore", version:
             the companion's version, commit: "in-memory", isolation:
             "single-writer-log", maxEntryBytes: the option's value,
             fixture: true }` (BEH-GX-016).
```

```
REQUIREMENT: Its `reopen` MUST return a store over the same entries, for
             conformance case 12 within one test scope. `memoryTrailStore`
             MUST pass every case of the conformance suite (BEH-GX-028), and
             the run MUST be marked a self-test (BEH-GX-032).
```

The memory store is the reference against which the suite is calibrated: if
it fails a case, the case or the store is wrong, and the self-test says
which before any consumer runs the suite against their own adapter.
`faultyTrailStore` is specified with the suite ([BEH-GX-027](./04-conformance-suite.md#beh-gx-027-faultytrailstore-injects-commit-then-hang-commit-then-fail-fail-before-commit-and-die)) and exported
here; its plan argument is required, like core's fault plans
([BEH-BR-180](../../core/behaviors/21-testing-host.md)).

## BEH-GX-147: brokenTrailStore variants make the conformance suite fail, and the suite must catch each one

> **Invariant:** [INV-GX-010](../invariants.md#inv-gx-010-evidence-results-come-only-from-runner-output-and-gaps-stay-gaps)
> **See:** [ADR-GX-006](../decisions/006-conformance-through-testhost.md), [ADR-GX-024](../decisions/024-fixtures-are-marked.md)
> **Satisfies:** [URS-GX-002](../urs.md#urs-gx-002-show-that-a-trail-adapter-conforms), [NFR-GX-004](../urs.md#nfr-gx-004-mutation-testing)
> **Risk:** [RSK-GX-016](../gxp/03-risk-assessment.md#rsk-gx-016), [RSK-GX-001](../gxp/03-risk-assessment.md#rsk-gx-001), [RSK-GX-002](../gxp/03-risk-assessment.md#rsk-gx-002)
> **Regulatory:** supports EU GMP Annex 11 §4.7 (adequacy of test tools)

| `defect` | What the variant does wrong | Cases that MUST fail against it |
| --- | --- | --- |
| "duplicate-on-repeat" | appends a repeated `recordId` again and answers "stored" | 3, 4, 5 |
| "unchecked-already-stored" | answers "already-stored" for a repeated `recordId` without comparing content, storing nothing | 8 |
| "overwrite-on-collision" | replaces the stored entry with the new one and answers "stored" | 8, 9 |
| "drop-on-collision" | answers "stored-collision" for a colliding entry and stores nothing | 8, 9, 11 |
| "no-sequence-check" | stores a second `recordId` at an occupied `(hostId, auditSeq)` as a primary entry | 9, 11 |
| "ack-without-store" | answers "stored" for the first append of each `recordId` and stores nothing | 1, 2, 6, 7 |

```
REQUIREMENT: `brokenTrailStore(defect)` MUST behave as `memoryTrailStore`
             except for the one defect named, and MUST carry `fixture: true`
             and the defect in its manifest `name`.
```

```
REQUIREMENT: The companion's own test suite MUST run the conformance suite
             against each variant and MUST assert that every case listed for
             it fails, and that every case from 3 to 9 fails against at least
             one variant. A listed case that passes against its variant MUST
             fail the companion's build.
```

A suite that never fails proves nothing about the adapters that pass it. The
variants are the naive implementations the suite exists to catch — a plain
insert without a unique key, an upsert, a write-behind cache — and each must
be caught by the case designed for it ([RSK-GX-016](../gxp/03-risk-assessment.md#rsk-gx-016)). The table is the
self-test that [BEH-GX-032](./04-conformance-suite.md#beh-gx-032-the-suites-limits-are-stated-in-its-output) refers to; its results are evidence about the
suite, and the evidence generator never counts them for a production
adapter.

## BEH-GX-148: memoryTicketStore and memoryAnchorStore keep their ports' rules, compare-and-set included

> **Invariant:** [INV-GX-002](../invariants.md#inv-gx-002-a-binding-is-consumed-at-most-once), [INV-GX-014](../invariants.md#inv-gx-014-test-fixtures-are-detectable)
> **See:** [ADR-GX-024](../decisions/024-fixtures-are-marked.md), [ADR-GX-013](../decisions/013-single-use-tickets.md), [ADR-GX-008](../decisions/008-high-water-anchors.md)
> **Satisfies:** [URS-GX-006](../urs.md#urs-gx-006-approve-a-change-before-it-is-made), [URS-GX-004](../urs.md#urs-gx-004-detect-loss-of-the-newest-records)
> **Risk:** [RSK-GX-017](../gxp/03-risk-assessment.md#rsk-gx-017), [RSK-GX-006](../gxp/03-risk-assessment.md#rsk-gx-006)
> **Regulatory:** supports EU GMP Annex 11 §4.7

```ts
// illustrative — not type-checked
declare function memoryTicketStore(options?: {
  readonly behave?: (call: { readonly method: "append" | "ticket" | "events"; readonly n: number }) =>
    "pass" | "fail" | "die" | "hang" | "commit-then-fail"            // default: always "pass"
}): Effect.Effect<TicketStoreShape, never, Scope.Scope>
declare function memoryAnchorStore(options: { readonly custodian: string }): Effect.Effect<AnchorStoreShape, never, Scope.Scope>
```

```
REQUIREMENT: `memoryTicketStore` MUST implement BEH-GX-068 exactly: the check
             of `expectedVersion` and the write MUST be one atomic step, so
             that of any number of concurrent appends at one version exactly
             one succeeds. `memoryAnchorStore` MUST implement BEH-GX-041. Both
             manifests MUST carry `fixture: true`.
```

```
REQUIREMENT: The `behave` outcomes of `memoryTicketStore` MUST let a test
             reach every refusal of the gate that depends on the store: a
             failed read, a failed append, a defect, a hang past the gate's
             deadline, and an append that is stored but answered with a
             failure ("commit-then-fail").
```

The gate's rules — one consumption per binding, refusal on any store
failure, a refusal at the deadline — are only testable against a store whose
behaviour a test controls. A `behave` default of "pass" is safe here: unlike
a signature fixture, a store that works correctly approves nothing.

## BEH-GX-149: scriptedSignatureCapture requires its decide function and has no approve-all form

> **Invariant:** [INV-GX-001](../invariants.md#inv-gx-001-no-decision-port-has-a-default-outside-the-testing-entry-point), [INV-GX-014](../invariants.md#inv-gx-014-test-fixtures-are-detectable)
> **See:** [ADR-GX-024](../decisions/024-fixtures-are-marked.md), [ADR-GX-016](../decisions/016-signature-port-and-manifestation.md)
> **Satisfies:** [URS-GX-008](../urs.md#urs-gx-008-show-who-signed-when-and-with-what-meaning), [URS-GX-016](../urs.md#urs-gx-016-know-which-obligations-remain-mine)
> **Risk:** [RSK-GX-017](../gxp/03-risk-assessment.md#rsk-gx-017), [RSK-GX-009](../gxp/03-risk-assessment.md#rsk-gx-009)
> **Regulatory:** supports 21 CFR 11.10(d), 11.200 (by keeping the fixture out of production); EU GMP Annex 11 §14

```ts
// illustrative — not type-checked
declare function scriptedSignatureCapture(
  decide: (request: SignatureRequest, index: number) =>
    | { readonly sign: { readonly id: string; readonly printedName: string } }
    | "decline" | "fail" | "die" | "hang"
    | { readonly answer: unknown }                    // a raw, possibly malformed answer, for refusal tests
): Effect.Effect<SignatureCaptureShape & { readonly requests: Effect.Effect<readonly SignatureRequest[]> }>
```

```
REQUIREMENT: `decide` MUST be required. There MUST be no overload, default,
             constant or helper that signs every request, signs as a
             configured identity, or signs without `decide` naming the signer.
```

```
REQUIREMENT: A signature the fixture returns for `{ sign }` MUST echo the
             request's meaning code and rendered digest, use the method
             "test-fixture" with `components: 2` and `reauthenticated: true`,
             and an `event` of "test-fixture:" followed by the call's index.
             Its manifest MUST list the method "test-fixture" and carry
             `fixture: true`.
```

```
REQUIREMENT: `requests` MUST return every `SignatureRequest` received, in
             order, so that tests can assert what a signer would have been
             shown (BEH-GX-074).
```

Core's scripted gate takes the same position ([BEH-BR-182](../../core/behaviors/21-testing-host.md)): a fixture
that approves everything is one import away from a production assembly. A
test that wants every request signed writes that decision itself, visibly,
and names who signs. The fixed method and event make every signature the
fixture produced recognisable wherever it is stored.

## BEH-GX-150: testKeyProvider derives keys from a seed under test: key ids

> **Invariant:** [INV-GX-014](../invariants.md#inv-gx-014-test-fixtures-are-detectable), [INV-GX-012](../invariants.md#inv-gx-012-the-canonical-form-is-deterministic-across-platforms)
> **See:** [ADR-GX-024](../decisions/024-fixtures-are-marked.md), [ADR-GX-019](../decisions/019-key-provider-and-rotation.md)
> **Satisfies:** [URS-GX-012](../urs.md#urs-gx-012-manage-fingerprint-keys), [NFR-GX-001](../urs.md#nfr-gx-001-deterministic-outputs)
> **Risk:** [RSK-GX-017](../gxp/03-risk-assessment.md#rsk-gx-017), [RSK-GX-013](../gxp/03-risk-assessment.md#rsk-gx-013)
> **Regulatory:** supports EU GMP Annex 11 §4.7

```ts
// illustrative — not type-checked
declare function testKeyProvider(seed: string): Effect.Effect<FingerprintKeyProviderShape & {
  readonly rotate: Effect.Effect<string>               // makes key n + 1 current; returns its id
  readonly destroy: (keyId: string) => Effect.Effect<void>   // byId then answers None, for BEH-GX-108 tests
  readonly behave: (outcome: "pass" | "fail" | "die" | "hang") => Effect.Effect<void>
}>
// key n (n = 1, 2, …): bytes SHA-256(UTF-8("bridger-gx/test-key/" + seed + "/" + n)); id "test:" + seed + ":" + n
```

```
REQUIREMENT: `testKeyProvider` MUST derive key n from the seed exactly as
             shown, so that the same seed gives the same keys and the same
             fingerprints on every platform, and MUST issue only key ids
             beginning "test:". `seed` MUST match `^[A-Za-z0-9._-]{1,32}$`.
```

```
REQUIREMENT: Its manifest MUST carry `fixture: true` and `custodian`
             "test fixture". `byId` MUST return every key it has made current
             and not destroyed.
```

A key derived from a published seed is known to anyone who reads the test,
which is harmless in a test and disastrous in production; the "test:" prefix
puts that fact into every fingerprint the key makes ([BEH-GX-106](./14-fingerprint-keys.md#beh-gx-106-every-fingerprint-names-its-key-and-the-test-key-ids-belong-to-fixtures)),
and IQ-15 refuses it ([BEH-GX-119](./15-installation-checks.md#beh-gx-119-stores-and-the-key-provider-are-probed-and-the-policy-and-eligibility-list-are-recorded-by-digest)). `rotate` and `destroy` exist so
that stale tickets and unavailable keys can be tested.

## BEH-GX-151: GxpTestHost assembles the fixtures on core's TestHost with deterministic time and identifiers

> **See:** [ADR-GX-006](../decisions/006-conformance-through-testhost.md), [ADR-BR-026](../../core/decisions/026-deterministic-test-host.md), [ADR-BR-025](../../core/decisions/025-deterministic-time-and-ids.md)
> **Satisfies:** [URS-GX-002](../urs.md#urs-gx-002-show-that-a-trail-adapter-conforms), [NFR-GX-001](../urs.md#nfr-gx-001-deterministic-outputs)
> **Risk:** [RSK-GX-016](../gxp/03-risk-assessment.md#rsk-gx-016), [RSK-BR-018](../../core/gxp/03-risk-assessment.md#rsk-br-018)
> **Regulatory:** supports EU GMP Annex 11 §4.7 (reproducible tests through the production code path)

```ts
// illustrative — not type-checked
declare const GxpTestHost: {
  make(options: {
    readonly trail: TrailStoreShape | "memory"
    readonly sealing: SealingOptions | "off"                // 21; audit-chain's testing anchor when given
    readonly trailGate: Parameters<typeof trailGate>[1] | "not-used"     // 22
    readonly approvals: { readonly policy: ApprovalPolicy; readonly decide: ScriptedDecide } | "not-used"
    readonly fingerprints: { readonly eligibility: FingerprintEligibility; readonly seed: string } | "not-used"
    readonly scope: string
  }): Effect.Effect<{
    readonly host: TestHost                              // core's, BEH-BR-177
    readonly stores: { readonly trail: TrailStoreShape; readonly tickets?: TicketStoreShape; readonly anchors: AnchorStoreShape }
    readonly keys?: ReturnType<typeof testKeyProvider>
  }, GxpLayerInvalid, Scope.Scope>
}
```

```
REQUIREMENT: `GxpTestHost.make` MUST build a core `TestHost` (BEH-BR-177)
             with `GxpLayer.make` over the fixtures of this file, with
             `TestClock` and the counter `IdGenerator` (BEH-BR-179), and
             MUST attach the approval gate and start the high-water recorder
             before returning. It MUST NOT replace, wrap or stub any part of
             core.
```

```
REQUIREMENT: Every fixture of this file MUST take time only from `Clock` and
             identifiers only from core's `IdGenerator`, and MUST NOT read
             ambient time or randomness, so that a test run under `TestClock`
             is repeatable record for record (BEH-BR-179).
```

```
REQUIREMENT: Tests that need a sink or gate other than the companion's MUST
             use core's own fixtures, `memoryAuditSink` and `scriptedGate`
             from `@bridger/core/testing` (BEH-BR-181, BEH-BR-182), and fault
             injection on plugins MUST use core's `Fault` (BEH-BR-180). The
             companion MUST NOT re-export or re-implement them.
```

The acceptance checks of [20 — Required Acceptance Checks](./20-required-acceptance-checks.md) run
through this assembly, so that every companion behaviour is exercised on
core's production code path under deterministic scheduling — the property
core's own checks rely on ([BEH-BR-177](../../core/behaviors/21-testing-host.md)). Re-using core's fixtures rather than
copying them keeps one definition of each.

## BEH-GX-152: Fixtures are refused wherever they would stand in for a production port

> **Invariant:** [INV-GX-014](../invariants.md#inv-gx-014-test-fixtures-are-detectable), [INV-GX-001](../invariants.md#inv-gx-001-no-decision-port-has-a-default-outside-the-testing-entry-point)
> **See:** [ADR-GX-024](../decisions/024-fixtures-are-marked.md), [ADR-GX-020](../decisions/020-iq-proof-and-probe.md), [ADR-GX-021](../decisions/021-oq-from-runner-output.md)
> **Satisfies:** [URS-GX-013](../urs.md#urs-gx-013-produce-installation-evidence), [URS-GX-016](../urs.md#urs-gx-016-know-which-obligations-remain-mine)
> **Risk:** [RSK-GX-017](../gxp/03-risk-assessment.md#rsk-gx-017)
> **Regulatory:** supports EU GMP Annex 11 §4.4, §4.7; 21 CFR 11.10(d)

```
REQUIREMENT: A port carrying `fixture: true` MUST make the installation
             checks fail (BEH-GX-118); a conformance run against one MUST be
             marked a self-test and MUST NOT count as evidence for a
             production adapter (BEH-GX-032, BEH-GX-121); and an evidence
             pack whose IQ report saw one wired MUST show it through the
             failing IQ-11 result and its deviation (BEH-GX-114,
             BEH-GX-133). The manifest's `statement` stays the fixed text of
             BEH-GX-130.
```

```
REQUIREMENT: `GxpLayer.make` MUST accept fixtures, so that tests exercise the
             production assembly, and MUST log once at warning level, with
             the fixture names only, that fixtures are wired.
```

```
REQUIREMENT: Documentation MUST state that the marker detects the
             companion's own fixtures only: a consumer's hand-written stub
             carries no marker, and keeping such stubs out of production is
             the consumer's obligation.
```

The fixtures are usable everywhere a test needs them and refused everywhere
evidence is produced. That split keeps tests on the real assembly while
making sure no IQ result, conformance record or evidence pack can rest on a
fixture without saying so.

---

_Previous: [18 — Archive and Export](./18-archive-and-export.md)_ · _Next: [20 — Required Acceptance Checks](./20-required-acceptance-checks.md)_
