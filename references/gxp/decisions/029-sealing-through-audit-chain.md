# ADR-GX-029: Sealing is @bridger/audit-chain, adopted as the companion's only sealing mechanism

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-GX-ADR-029                                           |
> | Revision       | 0.3                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-GX-03 §5)           |
> | Approved by    | — (pending; single maintainer, see PROC-GX-03 §5)            |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.3 (2026-11-11): the sink is the companion's sink around audit-chain's, given a wrapper of `keyed` that notes keyed-hash failures (G2) (CCR-GX-008)<br>0.2 (2026-11-10): the sink is built with `SealingOptions.keyed` passed as `HashChainOptions.keyed`, as BEH-GX-170 requires (M19) (CCR-GX-006)<br>0.1 (2026-11-09): Initial draft (supersedes ADR-GX-009) (CCR-GX-002) |

---

## Context

Revision 0.1 of the companion specified its own seal chain ([ADR-GX-009](./009-optional-sealing.md)): an envelope per entry, anchors of the latest seal in the companion's anchor store, and a `verifySeals` that recomputed the chain. Since then `@bridger/audit-chain` has been specified as a separate package ([audit-chain ADR-AC-004](../../audit-chain/decisions/004-separate-from-gxp-companion.md)): a sink that wraps an inner store and chains every record, marks rather than refuses what it cannot chain as expected (BEH-AC-005), anchors windows of the chain to an external `Anchor` off the write path (BEH-AC-011), offers a gate piece for fail-closed anchoring (BEH-AC-013), and verifies with a pure function that reports how far the chain is confirmed (BEH-AC-017–022). ADR-AC-004 left open whether the companion adopts it, and noted that until it says so two sealing designs exist in draft. Core's ADR-BR-034 (revision 0.7, CCR-BR-031) now records that the companion adopts audit-chain and that non-claim 5 names audit-chain as the sealing specification ([ADR-BR-034](../../core/decisions/034-gxp-companion-scope.md)).

The companion's own chain also had a defect the specification audit of 2026-11-09 found (F-02): it failed a write when the previous entry was missing or unsealed, so that a gap stopped recording for the life of the host, where audit-chain marks the break and keeps recording.

## Decision

- **Adopt.** `@bridger/audit-chain` is the companion's only sealing mechanism. The companion specifies no chain, envelope, seal format, anchoring schedule or chain verifier of its own. ADR-GX-009, INV-GX-013 and BEH-GX-049–056 are withdrawn and their identifiers reserved.
- **The trail store is the inner store.** With sealing on, `trailSink` is the companion's sink around `HashChainSink.make(trailChainStore(store), { ...options.chain, keyed: k })`, `k` the companion's wrapper of `options.keyed` that notes a `KeyedHashFailed` so that the outer sink counts it as "keyed-hash-failed" (BEH-GX-022, BEH-GX-170); `trailChainStore` performs the companion's sink steps on the record and stores audit-chain's link beside it in `TrailEntry.link` ([BEH-GX-170](../behaviors/21-sealing-through-audit-chain.md)).
- **Verification wraps audit-chain's.** `verifySeals` confirms receipts and calls `verifyChain`, passing the companion's high-water marks as expected heads, and maps every item of the `ChainReport` to one finding, attaching the report unchanged ([BEH-GX-171](../behaviors/21-sealing-through-audit-chain.md)).
- **Anchoring and its gate are audit-chain's.** Audit-chain's `Anchor` and `ReceiptStore` ports hold the chain's anchors; the companion's `AnchorStore` holds high-water marks only ([ADR-GX-008](./008-high-water-anchors.md)). Fail-closed anchoring is audit-chain's `ChainGate`, composed into the companion's host gate ([BEH-GX-175](../behaviors/21-sealing-through-audit-chain.md)).
- **Optional peer dependency.** `@bridger/audit-chain` is imported only by the entry `@bridger/gxp/sealing` ([BEH-GX-001](../behaviors/01-companion-boundary.md)); a consumer who does not seal does not install it.
- **Words.** Seal verification is described in core's non-claim 5 words, with audit-chain named as the specification ([BEH-GX-173](../behaviors/21-sealing-through-audit-chain.md)).

## Alternatives considered

- **Keep the companion's own chain.** Rejected: two chains for one purpose, two verifiers and two sets of vectors, and the companion's refused to record over a gap.
- **Let audit-chain wrap the companion's `trailSink` from outside (two sinks in series).** Rejected: audit-chain's sink must be the one core calls, and its inner store must hold the link with the record; a wrapped `AuditSink` would store the record without the link, or need `ChainStore.split` and a second store.
- **Make audit-chain a hard dependency.** Rejected: sealing is optional, and the minimal-dependency requirement ([NFR-GX-002](../urs.md#nfr-gx-002-minimal-dependencies)) should hold for a consumer who does not seal.

## Consequences

**Positive**:

- One sealing design across the specification; core, audit-chain and the companion describe its limit in the same words.
- Recording never stops for a chain condition; operator changes can be refused by `ChainGate` instead.
- High-water marks become audit-chain's expected heads, which lets one report show removal of the newest anchored windows.

**Negative**:

- The companion depends on audit-chain's specification for the part of URS-GX-005 it covers; a change to audit-chain's link, store obligations or report is a change the companion must assess (pinned in the [core interface map](../appendices/core-interface-map.md) §6).
- Two anchor-like stores remain: audit-chain's `Anchor` for the chain and the companion's `AnchorStore` for high-water marks. The glossary and 06 say which is which; the companion's port keeps its name to avoid an interface change without a functional reason.

**Trade-off accepted**: a dependency on a sibling specification, in exchange for one chain and one set of words.

## References

- Behaviours: [21 — Sealing through audit-chain](../behaviors/21-sealing-through-audit-chain.md), [03 — Trail Sink](../behaviors/03-trail-sink.md), [06 — High-Water Marks and Anchors](../behaviors/06-high-water-marks-and-anchors.md), [07 — Optional Sealing (withdrawn)](../behaviors/07-optional-sealing.md)
- Decisions: [ADR-GX-009](./009-optional-sealing.md) (superseded), [ADR-GX-008](./008-high-water-anchors.md), [ADR-GX-027](./027-claims-and-non-claims.md), [ADR-GX-030](./030-sink-marks-and-gate-refuses.md)
- Risks: [RSK-GX-004](../gxp/03-risk-assessment.md#rsk-gx-004), [RSK-GX-005](../gxp/03-risk-assessment.md#rsk-gx-005)
- Core: [ADR-BR-034](../../core/decisions/034-gxp-companion-scope.md) non-claim 5
- Audit-chain: [01 — Hash Chain Sink](../../audit-chain/behaviors/01-hash-chain-sink.md), [02 — Anchoring](../../audit-chain/behaviors/02-anchoring.md), [03 — Verification](../../audit-chain/behaviors/03-verification.md), [ADR-AC-004](../../audit-chain/decisions/004-separate-from-gxp-companion.md)
