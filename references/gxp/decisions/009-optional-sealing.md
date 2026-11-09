# ADR-GX-009: Optional sealing: a per-host hash chain with separately held anchors

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-GX-ADR-009                                           |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Superseded                                                   |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-GX-03 §5)           |
> | Approved by    | — (pending; single maintainer, see PROC-GX-03 §5)            |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.2 (2026-11-09): Superseded by ADR-GX-029 (C-09) (CCR-GX-002)<br>0.1 (2026-10-03): Initial draft (CCR-GX-001)                 |

---

> **Superseded** by [ADR-GX-029](./029-sealing-through-audit-chain.md) (CCR-GX-002). The companion adopts `@bridger/audit-chain` as its only sealing mechanism; the chain, envelope, anchors and verifier below are not to be implemented. The record is kept unchanged below for history; ADR-GX-009, INV-GX-013 and BEH-GX-049–056 stay reserved.

## Context

Entry digests ([ADR-GX-004](../decisions/004-append-only-trail-store.md)) show that `canonical` and `digest` agree; anyone who can rewrite an entry can rewrite both. Checks on read ([ADR-GX-007](../decisions/007-checks-never-claim-integrity.md)) and high-water marks ([ADR-GX-008](../decisions/008-high-water-anchors.md)) do not see an altered middle record. [ADR-BR-034](../../core/decisions/034-gxp-companion-scope.md) puts "optional trail sealing" in the companion's scope, and its narrowed non-claim #5 fixes how far it may be described: core provides no tamper evidence; the companion's optional sealing detects alteration, insertion, removal or reordering of sealed records up to the last verified anchor, only against a party that cannot also rewrite the separately held anchor store; no Bridger package prevents tampering.

## Decision

- **A per-host chain.** For host `h`, entry `n` (its `auditSeq`) has
  `seal_n = "sha256:" + hex(SHA-256(JCS({ v: 1, hostId: h, auditSeq: n, prev: seal_{n-1}, digest: digest_n })))`,
  where `digest_n` is the entry digest and `seal_0` is the constant `GENESIS`, `"sha256:"` followed by 64 zeros. The chain is linear over exactly the stored sequence `1..N` of that host ([INV-GX-013](../invariants.md#inv-gx-013-a-hosts-seal-chain-is-linear-over-exactly-the-stored-sequence-withdrawn)).
- **Held in the envelope, never in the record.** The seal is held in `TrailEntry.seal`, an envelope `{ v: 1, prev, seal }`. The `AuditRecord`, its `canonical` text and its `digest` are unchanged by sealing, so sealing can be turned on without changing what core produces.
- **Computed by the sink, in order.** `trailSink(store, { sealing: { anchorEvery: { records, interval } } })` computes `seal_n` before `append` from the seal of entry `n − 1`, held in memory once acknowledged. Core writes one record at a time in `auditSeq` order ([BEH-BR-202](../../core/behaviors/23-audit-sink-and-record.md)), so the previous seal is known; when it is not in memory, the sink reads it from the store, and if that entry is missing, unsealed or unreadable, the write fails and core latches. A retried write recomputes the same seal, so the store's byte comparison still returns `"already-stored"`.
- **Anchors every N, every T and at close.** An anchor is a high-water mark carrying `seal` ([ADR-GX-008](../decisions/008-high-water-anchors.md)), put by the high-water recorder in the same separately held `AnchorStore`: when an entry whose `auditSeq` is a multiple of `anchorEvery.records` (default 1000) has been acknowledged, when `anchorEvery.interval` (default 15 minutes) has passed with the position moved, and at close. Sealing therefore needs `anchors`; `GxpLayer.make` refuses sealing with `anchors: "not-used"`.
- **Verification is detection only.** `verifySeals(store, anchors, { hostId })` recomputes the chain and compares it with every anchor, reporting `chainBreak`, `anchorMismatch` and `unanchoredTail`. Nothing is repaired, re-sealed or rejected on read.
- **Off by default.** Sealing runs only when `SealingOptions` are passed explicitly, and is fixed for the life of a host. Without it, `TrailEntry.seal` is absent and every check offering seal verification lists `chainBreak` and `anchorMismatch` in `notCheckedKinds`.
- **Wording.** The feature is called "seal verification". Its result may say only that it "detects alteration, insertion, removal or reordering of sealed records up to the last verified anchor, against a party that cannot also rewrite the anchor store", as ADR-BR-034 #5 has it.

## Alternatives considered

- **Digital signatures on each record.** Rejected for this CCR: they need signing keys under the user's custody and a key-lifecycle procedure, and they add no detection over a chain with separately held anchors against the stated adversary. A later CCR-GX may add signed anchors.
- **A Merkle tree over batches.** Rejected: better for proofs of inclusion, which nobody here asks for; a linear chain fits records that are written one at a time in order.
- **Seal inside the record.** Rejected: it would change core's record and require a core CCR, and the seal would then be part of what it seals.

## Consequences

**Positive**:

- Alteration, insertion, removal or reordering of sealed records before the last verified anchor is reported, against a party without write access to the anchor store.
- The unanchored tail is reported, so the window of no detection is visible.

**Negative**:

- One hash per write, and a read of the previous entry's seal when it is not in memory; an anchor-store outage leaves a growing unanchored tail.
- Against a party who can rewrite both the trail store and the anchor store, sealing detects nothing; that is the stated limit.

**Trade-off accepted**: an opt-in chain whose reach is stated exactly, in exchange for detecting changes to the middle of a trail that no other check sees.

## References

- Behaviours: [07 — Optional sealing](../behaviors/07-optional-sealing.md), [06 — High-water marks and anchors](../behaviors/06-high-water-marks-and-anchors.md)
- Invariants: [INV-GX-013](../invariants.md#inv-gx-013-a-hosts-seal-chain-is-linear-over-exactly-the-stored-sequence-withdrawn)
- Risks: [RSK-GX-004](../gxp/03-risk-assessment.md#rsk-gx-004), [RSK-GX-005](../gxp/03-risk-assessment.md#rsk-gx-005)
- Decisions: [ADR-GX-004](../decisions/004-append-only-trail-store.md), [ADR-GX-005](../decisions/005-jcs-and-sha256.md), [ADR-GX-008](../decisions/008-high-water-anchors.md), [ADR-GX-027](../decisions/027-claims-and-non-claims.md)
- Core: [ADR-BR-034](../../core/decisions/034-gxp-companion-scope.md), [BEH-BR-202](../../core/behaviors/23-audit-sink-and-record.md), [BEH-BR-212](../../core/behaviors/24-time-ids-and-sequence.md)
