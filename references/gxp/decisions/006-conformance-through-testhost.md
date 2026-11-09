# ADR-GX-006: Adapter conformance runs against the real core through TestHost

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-GX-ADR-006                                           |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-GX-03 §5)           |
> | Approved by    | — (pending; single maintainer, see PROC-GX-03 §5)            |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.2 (2026-11-09): link to INV-GX-006 updated for its new title (CCR-GX-002)<br>0.1 (2026-10-03): Initial draft (CCR-GX-001)                 |

---

## Context

A user writes a `TrailStore` adapter for their own database ([ADR-GX-004](../decisions/004-append-only-trail-store.md)) and needs to show that it behaves as the contract says: one entry per record, conflicts refused, acknowledgement only after commit, read-back byte-identical. The interesting failures happen at the boundary with core: a write that commits and then hangs past `auditTimeout`, a retry in place ([BEH-BR-202](../../core/behaviors/23-audit-sink-and-record.md), [BEH-BR-204](../../core/behaviors/23-audit-sink-and-record.md)), a latch after an unwritten record ([BEH-BR-205](../../core/behaviors/23-audit-sink-and-record.md)). A suite that drives the adapter with a hand-written imitation of core tests the imitation; when core's retry or ordering changes, the imitation does not.

Core already ships a deterministic `TestHost` with steppable time and identifiers ([BEH-BR-177](../../core/behaviors/21-testing-host.md), [BEH-BR-179](../../core/behaviors/21-testing-host.md)) and scoped, visible fault injection through `Fault.*` ([BEH-BR-180](../../core/behaviors/21-testing-host.md)), as part of its contract ([ADR-BR-026](../../core/decisions/026-deterministic-test-host.md)).

## Decision

- **Real core, never a mock.** `runTrailStoreConformance(makeStore, { test, reopen, seed, evidenceDir })` (planned at `packages/gxp/src/testing/conformance.ts` *(Planned)*) builds a core `TestHost` with `trailSink(store)` wired as its `AuditSink` and drives real operations through it. No part of the suite stubs, mocks or re-implements core behaviour; the records the store receives are the records core produced.
- **Faults through core's mechanisms.** Timeouts, interruptions and defects on the core side are injected with `Fault.*` on the `TestHost`. Faults on the store side come from `faultyTrailStore(inner, plan)` in the testing entry point, which wraps the adapter under test and can, per numbered attempt, commit then hang, commit then fail, fail before commit, or die. The wrapper never alters the entry.
- **Numbered cases.** The suite runs fixed, numbered cases, each with a REQ-GX tag: append order; retry after commit returns `"already-stored"`; conflicting bytes under `recordId` and under `(hostId, auditSeq)` fail and leave the stored entry; two hosts in one store; byte-identical read-back of `canonical`; reopen (the caller's `reopen` over the same backing data reads the same entries, or the case is reported "not-supported"); Unicode outside the BMP; no partial entry after a failure; an `append` that hangs past `auditTimeout` and later commits.
- **Fresh store per case.** `makeStore` is called once per case (and again for the reopen case); cases do not share state, so order does not matter and one failure does not mask another.
- **Output is evidence.** The suite runs under the user's test runner and its runner output is the only result ([ADR-GX-021](../decisions/021-oq-from-runner-output.md)); the evidence pack ([ADR-GX-022](../decisions/022-evidence-pack-format.md)) records the core version the `TestHost` came from.

## Alternatives considered

- **A mock `AuditSink` caller that imitates core's retries.** Rejected: it drifts from core silently and cannot reproduce latch behaviour.
- **Run conformance only against a real production host.** Rejected: faults cannot be injected deterministically, and the cases would depend on timing.
- **A property-based suite with random faults only.** Deferred: useful as an addition, but numbered cases are what a reviewer can trace to a requirement. A later CCR-GX may add a seeded random phase.

## Consequences

**Positive**:

- A passing run shows the adapter working with the core release it is installed with, through core's own retry and latch paths.
- A core change that alters retry or ordering is caught by the suite rather than hidden by a stale imitation.

**Negative**:

- The suite depends on core's testing entry point, which becomes part of the interface map and the version range ([ADR-GX-025](../decisions/025-core-version-range.md)).
- Conformance shows the cases pass in the run that was executed; it does not show the adapter correct for every input or every deployment.

**Trade-off accepted**: a dependency on core's test host, in exchange for conformance results that are about the real core and not about a model of it.

## References

- Behaviours: [04 — Conformance suite](../behaviors/04-conformance-suite.md), [19 — Testing entry point](../behaviors/19-testing-entry-point.md)
- Invariants: [INV-GX-006](../invariants.md#inv-gx-006-one-primary-entry-per-record-and-per-host-sequence-number-and-no-stored-record-is-displaced), [INV-GX-007](../invariants.md#inv-gx-007-the-sink-acknowledges-only-what-the-store-reports-stored)
- Risks: [RSK-GX-001](../gxp/03-risk-assessment.md#rsk-gx-001), [RSK-GX-002](../gxp/03-risk-assessment.md#rsk-gx-002)
- Decisions: [ADR-GX-004](../decisions/004-append-only-trail-store.md), [ADR-GX-021](../decisions/021-oq-from-runner-output.md), [ADR-GX-022](../decisions/022-evidence-pack-format.md), [ADR-GX-025](../decisions/025-core-version-range.md)
- Core: [ADR-BR-026](../../core/decisions/026-deterministic-test-host.md), [BEH-BR-177](../../core/behaviors/21-testing-host.md), [BEH-BR-179](../../core/behaviors/21-testing-host.md), [BEH-BR-180](../../core/behaviors/21-testing-host.md), [BEH-BR-202](../../core/behaviors/23-audit-sink-and-record.md), [BEH-BR-204](../../core/behaviors/23-audit-sink-and-record.md), [BEH-BR-205](../../core/behaviors/23-audit-sink-and-record.md)
