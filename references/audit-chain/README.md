# Bridger Audit Chain — Specification

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-AC-00                                                |
> | Revision       | 0.7                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification — Master Index (companion)          |
> | Change History | 0.7 (2026-11-10): CCR-AC-006 registered (round 3 findings of the specification audit of 2026-11-10: M19, M20, M21 and a low finding) (CCR-AC-006)<br>0.6 (2026-11-10): CCR-AC-005 registered (round 2 findings of the specification audit of 2026-11-09: P7, P8, P9 and low findings); CCR register rows put in ascending order, as in the other trees; follow-ups registered (`expectKeyed`, `lossCounterUnanchored`); `AnchorUnconfirmed` follow-up registered (CCR-AC-005)<br>0.5 (2026-11-09): CCR-AC-004 registered (store idempotence for equal entries only; adoption by the GxP companion recorded) (CCR-AC-004)<br>0.4 (2026-11-08): CCR-AC-003 extended with revision 2, resolutions of the round-2 agent review (R3-06–R3-09, R3-16; R5-08) (CCR-AC-003)<br>0.3 (2026-11-08): Register row CCR-AC-003; contents 04, 05 and ADR-AC-005; open questions answered (G54, G59 closed) (round 2: recheck items 13, 14; core alignment) (CCR-AC-003)<br>0.2 (2026-11-08): Register row CCR-AC-002 (resolutions of the agent review of 2026-11-08); honest-claims limits extended; Open questions section; dependency on core 32 (CCR-AC-002)<br>0.1 (2026-11-08): Initial draft (CCR-AC-001)                 |

---

**implementation: absent**

This is the specification of `@bridger/audit-chain`, an optional companion
package of `@bridger/core`. It links the records that core hands to its
`AuditSink` port into a hash chain, publishes the roots of that chain to an
external `Anchor`, and verifies stored records against both. It depends on
`@bridger/core`; `@bridger/core` never depends on it.

## Status: prospective

Nothing described here is implemented. Every document is a `Draft`, every
decision is `Proposed`, and every source or test path is marked *Planned*.
The rules of the core specification apply unchanged
([ADR-BR-036](../core/decisions/036-prospective-specification.md),
[ADR-BR-035](../core/decisions/035-evidence-from-executed-tests.md)): this
specification is not evidence that the package behaves as described, and a
requirement becomes evidence only when a test that exercises it has run and
passed.

## The honest-claims rule

This package is specified to **detect** certain changes to stored records,
within limits stated in every document that describes it. It makes **no**
claim that it prevents tampering, that a trail it seals is tamper-proof, or
that adopting it makes a deployment compliant with 21 CFR Part 11, EU GMP
Annex 11 or any other regulation. Its limits are those of non-claim 5 of
[ADR-BR-034](../core/decisions/034-gxp-companion-scope.md): detection of
alteration, insertion, removal or reordering of chained records *up to the
last verified anchor*, and only against a party that cannot also rewrite the
separately held anchor store. It detects nothing against a party that
controls what reaches the sink — the host process, or in-process plugin code
— and it detects the deletion of the newest anchored windows together with
their receipts only when the verifier learns the expected head elsewhere.

Two statements recur throughout because they are the ones most easily lost:

1. **A hash chain alone can be rewritten.** The chain uses no secret. Anyone
   who can write the store can recompute every link from the first changed
   record onwards and produce a chain that verifies. On its own, the chain
   detects accidental corruption and careless edits, nothing more
   ([ADR-AC-002](./decisions/002-anchor-defends-against-insider.md)).
2. **The anchor is what defends against an insider** — and only an insider
   who cannot also rewrite the anchor store. Records written after the last
   anchor are not covered by it.

## Reading order

| Step | Document | Purpose |
| ---- | -------- | ------- |
| 1 | [Overview](./overview.md) | Mission, package boundary, public API surface, worked example, limits |
| 2 | [Behaviours](./behaviors/01-hash-chain-sink.md) | What the package must do, as `BEH-AC` requirements |
| 3 | [Invariants](./invariants.md) | Properties that hold for every execution |
| 4 | [Decisions](./decisions/001-chain-in-a-wrapping-sink.md) | Why, as `ADR-AC` records |
| 5 | [Traceability](./traceability.md) | BEH → INV → ADR → REQ, and risk notes |

Readers new to Bridger should first read the core's
[23 — Audit Sink and Record](../core/behaviors/23-audit-sink-and-record.md)
and [24 — Time, Identifiers and Sequence](../core/behaviors/24-time-ids-and-sequence.md).

## Contents

### Behaviours

| # | File | Identifiers |
| - | ---- | ----------- |
| 01 | [Hash-chain sink](./behaviors/01-hash-chain-sink.md) | BEH-AC-001–008 |
| 02 | [Anchoring](./behaviors/02-anchoring.md) | BEH-AC-009–016 |
| 03 | [Verification](./behaviors/03-verification.md) | BEH-AC-017–024 |
| 04 | [Generic chain](./behaviors/04-generic-chain.md) | BEH-AC-025–032 |
| 05 | [Verification bundle](./behaviors/05-verification-bundle.md) | BEH-AC-033–040 |

### Decisions

| ID | Title |
| -- | ----- |
| [ADR-AC-001](./decisions/001-chain-in-a-wrapping-sink.md) | The chain lives in a sink that wraps the store, not in the core record |
| [ADR-AC-002](./decisions/002-anchor-defends-against-insider.md) | Only an external anchor defends against an insider |
| [ADR-AC-003](./decisions/003-anchoring-off-the-write-path.md) | Anchoring runs off the write path; fail-closed only when declared, as a gate piece |
| [ADR-AC-004](./decisions/004-separate-from-gxp-companion.md) | A package separate from `@bridger/gxp` |
| [ADR-AC-005](./decisions/005-one-chain-over-any-stream-hashing-the-stored-form.md) | One chain over any append-only stream, hashing the stored form |

## Dependencies on core

| Core document | What this package uses | Owner |
| ------------- | ---------------------- | ----- |
| [23 — Audit Sink and Record](../core/behaviors/23-audit-sink-and-record.md) | The `AuditSink` port (BEH-BR-193), the `AuditRecord` shape (BEH-BR-195), the single in-order writer that retries the same record (BEH-BR-202), `AuditWriteFailed` and the latch (BEH-BR-203, BEH-BR-205) | Core (existing) |
| [24 — Time, Identifiers and Sequence](../core/behaviors/24-time-ids-and-sequence.md) | `auditSeq` contiguous from 1 per host (BEH-BR-212), `verifyAuditSequence` (BEH-BR-215), `Clock` (BEH-BR-209), `Host.controls` audit position | Core (existing) |
| [32 — Generic Gate and Plan](../core/behaviors/32-generic-gate-and-plan.md) | `Gate<OperationRequest>`, `Gate.all`, `OperationGate.fromGate` for the optional `ChainGate` piece (BEH-BR-313, BEH-BR-315, BEH-BR-321) | CCR-BR-019, CCR-BR-022 |
| [ADR-BR-034](../core/decisions/034-gxp-companion-scope.md) | Non-claim 5, whose limits this package adopts word for word | Core (existing) |

No new core seam is needed. The package is an `AuditSink` implementation like
any other; core does not know it exists.

## Open questions

Both questions this package recorded for core are answered by core
CCR-BR-026:

1. **Ill-formed strings in records** (core gap G59, closed). Core replaces
   lone surrogates with U+FFFD and marks the record `sanitized: true` (core
   BEH-BR-196). The sink keeps its escaped encoding and marker (BEH-AC-003)
   for records that do not come from a conforming core.
2. **`auditDropped` is visible to a sink** (core gap G54, closed). Every record
   carries core's non-decreasing `auditDropped` counter (core BEH-BR-195);
   statements carry the last value of their window and reports show where it
   rose ([04](./behaviors/04-generic-chain.md), BEH-AC-030).

## Identifier scheme

| Prefix | Meaning |
| ------ | ------- |
| `BEH-AC-NNN` | Functional behaviour requirement (blocks of eight per file) |
| `INV-AC-NNN` | Runtime invariant |
| `ADR-AC-NNN` | Architecture decision |
| `REQ-AC-NNN` | Acceptance scenario (planned) |
| `CCR-AC-NNN` | Change control record of this package |
| `BRIDGER-AC-*` | Document ID |

The rules of the core [identifier scheme](../core/process/requirement-id-scheme.md)
apply, with infix `AC`. Risks are not given an `AC` series: hazards this
package introduces or reduces are carried in the core register
([traceability](./traceability.md) §3).

## Document history

| CCR | Date | Change |
| --- | ---- | ------ |
| CCR-AC-001 | 2026-11-08 | Initial draft: `HashChainSink` wrapping the core `AuditSink` port with an inner `ChainSink` store port and `ChainSink.split`; canonical encoding (RFC 8785) with domain separation; links identical across the core writer's retries; contiguity enforced per host; optional keyed hasher; `Anchor` port publishing Merkle roots of record windows off the write path, with an explicit fail-closed option; `verifyChain` (pure, total, built on `verifyAuditSequence`); inclusion proofs; the threat model stating why a chain alone can be rewritten and what the anchor adds. Gap item 13 of the Bridger gap analysis of 2026-11-08; roadmap step B4.<br>**Impact (PROC-03 §3).** (1) Identifiers: BEH-AC-001–024, INV-AC-001–005, ADR-AC-001–004 and REQ-AC-001–012 added; no core identifier changed (proposed core amendments are recorded separately for the core's change control). (2) Risk: no core risk re-scored by this record; a new core risk (chain or anchor mistaken for tamper-proofing; anchor store not independent) and a note on RSK-BR-006 are proposed for the core register. (3) GxP impact: yes — the package concerns detection of alteration of stored audit records (21 CFR 11.10(e), EU GMP Annex 11 §9); it changes no core record or behaviour. (4) Revalidation: no version has been released or qualified (implementation absent); none. (5) Compatibility: no core public type, record field or `schemaVersion` changes; the package consumes `AuditRecord` version 1 and refuses any other version. |
| CCR-AC-002 | 2026-11-08 | Resolutions of the agent review of 2026-11-08 (review R4, findings AC-B1, AC-M1, AC-M2, AC-m1), aligned with core CCR-BR-022: the false claim that system transitions are still recorded under fail-closed anchoring is removed; fail-closed anchoring is the `ChainGate` gate piece reading the sink's status, refusing operator calls outside an explicit `allow` list, while the sink keeps accepting every record; no condition of the sink's own fails a write — order and host violations and retry mismatches are appended with break markers, unsupported schema versions with a marker; memory is bounded by compact ranges and queued statements instead of a failing backlog (AC-B1); the threat table gains the party controlling the host process or the sink before append (AC-M1) and the deletion of trailing anchored windows with their receipts, detected only with an independently learned head (`verifyChain` option `expectedHeads`, per-host `head` result) (AC-M2); records that are not I-JSON are chained with an escaped canonical form and a marker (AC-m1; core G59 open). Open questions recorded above.<br>**Impact (PROC-03 §3).** (1) Identifiers: none added or withdrawn; BEH-AC-001–005, 008, 011–014, 016, 017, 019, 022, 024, INV-AC-001–003, INV-AC-005, ADR-AC-001, ADR-AC-003 amended; headings of BEH-AC-005, BEH-AC-013, INV-AC-002 and INV-AC-005 changed. (2) Risk: removes the control-introduced risk RSK-BR-045 names for failed-write fail-closed and the permanent halt of recording RSK-BR-020 names for deterministic refusals; two undetected cases stated for RSK-BR-045; no score changed by this record. (3) GxP impact: yes — what the chain detects and when operator changes are refused change. (4) Revalidation: nothing released (implementation absent); REQ-AC-001–004, 008, 011 updated. (5) Compatibility: draft API changes (`failClosed` and `maxPending` options removed, `ChainGate` and `maxPendingWindows` added, `ChainLink` markers, `ChainReport.head` and `notices`); no core type changed; the package still consumes `AuditRecord` version 1 and now chains other versions with a marker. |
| CCR-AC-003 | 2026-11-08 | Round 2: recheck items 13 and 14, and alignment with core CCR-BR-024–026. Item 13: generic `ChainSink<R>` over any append-only stream, with a `SeriesSpec<R>` naming a series id separate from the host id, a pluggable, named `Canonicaliser`, and the rule that stored ciphertext is hashed, never plaintext, so that shredding by the planned keyring companion leaves every link recomputable; `HashChainSink` is its audit instance and keeps every rule of 01; the inner store port is renamed `ChainStore` (`ChainStore.split`, `memoryChainStore`); verification profiles and a generic sequence check. Item 14 (audit-chain side): portable verification bundle — `exportBundle` copies segments, anchors, receipts and request-supplied trust roots as stored into a canonical `bridger-chain-bundle/v1`; `verifyBundle` is pure, total and offline, confirms receipts only with offline verifiers, and reports online-only evidence as "not-checked"; the kit's `bridger verify-chain` renders the report. Core alignment: `auditDropped` carried into statements and reports (G54 closed); `sanitized` records from core (G59 closed); `requestedBy`, `undoes`, new system transitions and `lazy-triggered` `onBehalfOf` chained as fields; open questions answered.<br>**Impact (PROC-03 §3).** (1) Identifiers: BEH-AC-025–040, INV-AC-006–007, ADR-AC-005, REQ-AC-013–020 added; BEH-AC-001–008 prose and BEH-AC-006 heading amended for the store rename; nothing withdrawn. (2) Risk: bears on RSK-BR-045 (offline inspection states what was checked; ciphertext hashing keeps detection after shredding) and RSK-BR-018 (bundle report wording); no score changed by this record. (3) GxP impact: yes — inspectors' offline review of chained records and of non-audit streams; no claim that a chain or bundle prevents alteration. (4) Revalidation: nothing released (implementation absent); REQ-AC-013–020 added. (5) Compatibility: draft API rename `ChainSink` (store) → `ChainStore`; `ChainSink<R>` now names the generic sink; no core type changed.<br>**Revision 2 (2026-11-08): resolutions of the round-2 agent review** (review R3, findings R3-06, R3-07, R3-08, R3-09, R3-16; review R5, finding R5-08 on the audit-chain side). R3-06: a series resumes across hosts from `ChainSinkOptions.resumeFrom` or the store's optional `head` read; `continuesFrom` stays for a different predecessor series; new `SeriesConfigInvalid` reasons "resume-and-continue" and "resume-mismatch"; a resumed writer's windows start after the resumed head. R3-07: generic series write `ChainLinkV2` (`seriesId`, `seq`, `recordId`, `canon`, `origin`) under the domain string "bridger-audit-chain/v2/", with the canonicaliser id and position in every record hash; the audit instance keeps `ChainLinkV1` links unchanged; every series writes `AnchorStatement` version 2 with `seriesId`, `canon` and `dropped`, and version 1 statements are read and reported as anchoring no loss counter (G54 now closed in the types as well); the store shape of 01 renamed `ChainStoreShape`. R3-08: expected heads carried in a bundle are always "head-unconfirmed"; only the inspector's own heads confirm. R3-09 and R5-08: key destruction is no longer described as erasure; fields stored in clear remain, the ciphertext is unreadable only to holders with no other key copy (keyring BEH-KR-022), and whether that meets an erasure obligation is the application's determination. R3-16: the bundle signature uses the loader's reserved "chain-bundle" type and its `id`/`version` convention.<br>**Impact of revision 2 (PROC-03 §3).** (1) Identifiers: none added or withdrawn; BEH-AC-001, 009, 010, 025–028, 032 (checks 13–16), 034, 037, 040 (check 19) and REQ-AC-013–016, 019 amended. (2) Risk: bears on RSK-BR-045 (a bundle producer can no longer confirm a head by naming a root; a loss counter is now anchored) and RSK-BR-006; no score changed by this record. (3) GxP impact: yes — what an anchor commits to and what a bundle report may confirm change; no claim that a chain prevents alteration or that shredding erases. (4) Revalidation: nothing released (implementation absent); REQ-AC-013–016 and 019 updated. (5) Compatibility: draft API changes (`ChainLink` union, `AnchorStatement` version 2, `ChainStoreShape` rename in 01, `resumeFrom`, `ChainStoreShape.head`, `ChainSink.make` error type); no core type changed. |
| CCR-AC-004 | 2026-11-09 | Alignment with core CCR-BR-031 and the GxP companion's CCR-GX-002 (phase 1 of the specification audit of 2026-11-09; an agent review, not an independent review). BEH-AC-006 copied core's rule that a store "MUST NOT store a second copy" under a stored `recordId`, which let a store drop a different record under a repeated id while reporting success; following core BEH-BR-193 as amended, only an equal entry is an idempotent repeat, and a different one is kept with its link or refused; `ChainStore.split` states the same of both stores. ADR-AC-004 and the overview record that the GxP companion adopts this package as its only sealing mechanism, and the consequence "two sealing designs may exist in draft" is removed. **Impact.** (1) Identifiers: none added or withdrawn; BEH-AC-006 amended; ADR-AC-004 amended. (2) Risk: no risk added or re-scored. (3) GxP impact: yes, the store obligations behind the chain. (4) Revalidation: none (nothing implemented). (5) Compatibility: a `ChainStore` that compared `recordId` only must compare the record too; no public type changes. |
| CCR-AC-005 | 2026-11-10 | Round 2 findings of the specification audit of 2026-11-09 (SPEC-AUDIT-02; an agent review, not an independent review). P7 (audit-chain side): 04 required a break for a changed canonicaliser and a notice or break for a loss counter that rose or fell, which `ChainReport` could not express; `breaks.kind` gains "canon-changed" and "counter-decreased", `notices.kind` gains "loss-counter-rose", and BEH-AC-019 states when each is reported. P8: `verifyChain` gains `options.profile` (BEH-AC-031) and `verifyBundle` gains `options.keyed`, a pure MAC function passed to `verifyChain` (BEH-AC-039). P9: a `KeyedHasher` key had no lifecycle; a sink now reads `keyId` once and keeps it, a key is changed by rebuilding the sink (`continuesFrom` for the audit instance, a resumed series for a generic one), `KeyedHashFailed` carries `keyId` and `permanent`, and links written under several keys verify in one run, a key the verifier cannot use giving "key-unavailable" (BEH-AC-007, BEH-AC-019). Low findings: `ChainStatus` gains `dropped` (BEH-AC-012, BEH-AC-030); open questions already settled are closed (02 item 3, 03 item 2, 04 item 1); the overview and BEH-AC-029 restate store idempotence for an equal entry only (CCR-AC-004). Follow-ups: BEH-AC-026 required a version 1 statement to be reported as anchoring no loss counter, which `ChainReport` could not express; `hosts[].lossCounterUnanchored` lists the windows of such statements (BEH-AC-019, check 16). A link does not show that its writer was keyed, so a party without the key could rewrite a keyed series with unkeyed links that recompute; `verifyChain` and `verifyBundle` gain `options.expectKeyed`, under which an unkeyed link is an "unkeyed-link" break, and BEH-AC-016's keyed column states that it is required (checks 6 and 20). `AnchorUnconfirmed`, the error of `AnchorVerifier.confirm`, was never declared; it is declared with `anchor` and `reason`, the reason `confirmAnchors` lists for an unconfirmed pair (BEH-AC-020).<br>**Impact (PROC-03 §3).** (1) Identifiers: none added or withdrawn; BEH-AC-001 (prose), 007, 012, 016, 018, 019, 024 (check 6), 026, 027, 029, 030, 031, 032 (checks 15, 16), 034, 039 and 040 (check 20) amended. (2) Risk: bears on RSK-BR-006 (canonicaliser changes and falling loss counters now reported) and RSK-BR-020 (a permanently unusable key fails writes until the sink is rebuilt, stated rather than left undefined); no risk added or re-scored. (3) GxP impact: yes — what a chain report shows to a reviewer, and how a keyed audit chain behaves when its key is revoked; the GxP companion consumes the new kinds and options. (4) Revalidation: nothing released (implementation absent); REQ-AC-006, REQ-AC-011, REQ-AC-016 and REQ-AC-020 cover the changes. (5) Compatibility: draft API changes — `ChainReport` kinds widened, `verifyChain` generic over `R` with `profile`, `verifyBundle` option `keyed`, `ChainStatus.dropped`, option `expectKeyed` and break kind "unkeyed-link" on both verifiers, `ChainReport.hosts[].lossCounterUnanchored`, `KeyedHashFailed` fields `keyId` and `permanent`; no core type changed. |
| CCR-AC-006 | 2026-11-10 | Round 3 findings of the specification audit of 2026-11-10 (SPEC-AUDIT-03; this is an agent review, not the independent review of PROC-03 §5). M19 (audit-chain side): a `KeyedHasher` had no path into a sink; `HashChainOptions` and `ChainSinkOptions` gain `keyed`, the `KeyedHasherShape` the sink hashes with, and the `KeyedHasher` service is only a tag the sink never reads (BEH-AC-001, BEH-AC-007, BEH-AC-025). M20: keyed verification took only a pure MAC, while custody is a hardware module or a MAC service; `precomputeMacs` runs the effectful MAC before the check and returns the pure `keyed` function, and `verifyChain` and `verifyBundle` stay pure (BEH-AC-019, BEH-AC-039). M21: `verifyBundle` ran one `verifyChain` per profile but returned one report; `BundleReport.chain` is one `ChainReport` per series and `expectKeyed` takes `true` or a set of series ids (BEH-AC-034). Low finding: INV-AC-007 required a break for a changed algorithm that the report could not express; `breaks.kind` gains "alg-changed" (BEH-AC-019, BEH-AC-027).<br>**Impact (PROC-03 §3).** (1) Identifiers: none added or withdrawn; BEH-AC-001, 007, 019, 024 (check 6), 025, 027, 034, 039 and 040 (check 20) amended. (2) Risk: bears on RSK-BR-006 (a keyed hasher now reaches the sink; an algorithm change is reported) and RSK-BR-045 (a keyed series in a mixed bundle is checked with `expectKeyed`); no risk added or re-scored. (3) GxP impact: yes — the GxP companion's `sealing.keyed` now reaches the sink, and a chain report of an archive bundle is per series. (4) Revalidation: nothing released (implementation absent); REQ-AC-006 and REQ-AC-016–020 cover the changes. (5) Compatibility: draft API changes — `HashChainOptions.keyed`, `ChainSinkOptions.keyed`, `precomputeMacs`, `BundleReport.chain` now a record per series id, `verifyBundle` `expectKeyed` widened to a set, `breaks.kind` widened; no core type changed. |

---

_Next: [Overview](./overview.md)_
