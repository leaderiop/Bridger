# Bridger Audit Chain — Specification

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-AC-00                                                |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification — Master Index (companion)          |
> | Change History | 0.2 (2026-11-08): Register row CCR-AC-002 (resolutions of the agent review of 2026-11-08); honest-claims limits extended; Open questions section; dependency on core 32 (CCR-AC-002)<br>0.1 (2026-11-08): Initial draft (CCR-AC-001)                 |

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

### Decisions

| ID | Title |
| -- | ----- |
| [ADR-AC-001](./decisions/001-chain-in-a-wrapping-sink.md) | The chain lives in a sink that wraps the store, not in the core record |
| [ADR-AC-002](./decisions/002-anchor-defends-against-insider.md) | Only an external anchor defends against an insider |
| [ADR-AC-003](./decisions/003-anchoring-off-the-write-path.md) | Anchoring runs off the write path; fail-closed only when declared, as a gate piece |
| [ADR-AC-004](./decisions/004-separate-from-gxp-companion.md) | A package separate from `@bridger/gxp` |

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

Residual questions this package cannot settle within the current core; each is
for core's change control, not decided here.

1. **Ill-formed strings in records.** Core does not guarantee that the strings
   it writes into records are well-formed UTF-16 (core gap G59,
   [urs.md](../core/urs.md) §7). The sink chains such a record with an escaped
   canonical form and a marker (BEH-AC-003) rather than refusing it; whether
   core should refuse ill-formed strings at the call is open in core.
2. **`auditDropped` is not visible to a sink.** Records core drops for queue
   overflow are never chained, and the sink cannot put their count into its
   statements (core gap G54).

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
| CCR-AC-002 | 2026-11-08 | Resolutions of the agent review of 2026-11-08 (review R4, findings AC-B1, AC-M1, AC-M2, AC-m1), aligned with core CCR-BR-022: the false claim that system transitions are still recorded under fail-closed anchoring is removed; fail-closed anchoring is the `ChainGate` gate piece reading the sink's status, refusing operator calls outside an explicit `allow` list, while the sink keeps accepting every record; no condition of the sink's own fails a write — order and host violations and retry mismatches are appended with break markers, unsupported schema versions with a marker; memory is bounded by compact ranges and queued statements instead of a failing backlog (AC-B1); the threat table gains the party controlling the host process or the sink before append (AC-M1) and the deletion of trailing anchored windows with their receipts, detected only with an independently learned head (`verifyChain` option `expectedHeads`, per-host `head` result) (AC-M2); records that are not I-JSON are chained with an escaped canonical form and a marker (AC-m1; core G59 open). Open questions recorded above.<br>**Impact (PROC-03 §3).** (1) Identifiers: none added or withdrawn; BEH-AC-001–005, 008, 011–014, 016, 017, 019, 022, 024, INV-AC-001–003, INV-AC-005, ADR-AC-001, ADR-AC-003 amended; headings of BEH-AC-005, BEH-AC-013, INV-AC-002 and INV-AC-005 changed. (2) Risk: removes the control-introduced risk RSK-BR-045 names for failed-write fail-closed and the permanent halt of recording RSK-BR-020 names for deterministic refusals; two undetected cases stated for RSK-BR-045; no score changed by this record. (3) GxP impact: yes — what the chain detects and when operator changes are refused change. (4) Revalidation: nothing released (implementation absent); REQ-AC-001–004, 008, 011 updated. (5) Compatibility: draft API changes (`failClosed` and `maxPending` options removed, `ChainGate` and `maxPendingWindows` added, `ChainLink` markers, `ChainReport.head` and `notices`); no core type changed; the package still consumes `AuditRecord` version 1 and now chains other versions with a marker. |
| CCR-AC-001 | 2026-11-08 | Initial draft: `HashChainSink` wrapping the core `AuditSink` port with an inner `ChainSink` store port and `ChainSink.split`; canonical encoding (RFC 8785) with domain separation; links identical across the core writer's retries; contiguity enforced per host; optional keyed hasher; `Anchor` port publishing Merkle roots of record windows off the write path, with an explicit fail-closed option; `verifyChain` (pure, total, built on `verifyAuditSequence`); inclusion proofs; the threat model stating why a chain alone can be rewritten and what the anchor adds. Gap item 13 of the Bridger gap analysis of 2026-11-08; roadmap step B4.<br>**Impact (PROC-03 §3).** (1) Identifiers: BEH-AC-001–024, INV-AC-001–005, ADR-AC-001–004 and REQ-AC-001–012 added; no core identifier changed (proposed core amendments are recorded separately for the core's change control). (2) Risk: no core risk re-scored by this record; a new core risk (chain or anchor mistaken for tamper-proofing; anchor store not independent) and a note on RSK-BR-006 are proposed for the core register. (3) GxP impact: yes — the package concerns detection of alteration of stored audit records (21 CFR 11.10(e), EU GMP Annex 11 §9); it changes no core record or behaviour. (4) Revalidation: no version has been released or qualified (implementation absent); none. (5) Compatibility: no core public type, record field or `schemaVersion` changes; the package consumes `AuditRecord` version 1 and refuses any other version. |

---

_Next: [Overview](./overview.md)_
