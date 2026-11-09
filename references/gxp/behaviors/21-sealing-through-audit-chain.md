# 21 — Sealing through audit-chain

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-GX-BEH-21                                            |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-GX-03 §5)           |
> | Approved by    | — (pending; single maintainer, see PROC-GX-03 §5)            |
> | Classification | Functional Specification                                     |
> | Change History | 0.1 (2026-11-09): Initial draft; replaces the withdrawn companion seal chain of 07 by `@bridger/audit-chain` (CCR-GX-002) |

---

The digest of each entry ([BEH-GX-010](./02-trail-store-port.md#beh-gx-010-a-trailentry-carries-the-record-its-canonical-text-and-its-digest)) shows whether an entry's bytes
still match the digest stored beside them. It cannot show that someone who
changed both did so. Sealing adds a hash chain over each host's records and
anchors of its head held apart from the trail, so that verification detects
an alteration, insertion, removal or reordering of sealed records up to the
last verified anchor, provided the party who made the change could not also
rewrite the anchor store. That proviso is the whole of the claim; nothing
here prevents a change ([ADR-BR-034](../../core/decisions/034-gxp-companion-scope.md) non-claim 5).

The companion does not specify that chain. It adopts `@bridger/audit-chain`
as its only sealing mechanism ([ADR-GX-029](../decisions/029-sealing-through-audit-chain.md), superseding [ADR-GX-009](../decisions/009-optional-sealing.md)):
the hash chain sink, its links, its anchoring and its verification are
audit-chain's ([audit-chain 01–03](../../audit-chain/behaviors/01-hash-chain-sink.md)), and this file says only
how the companion wires them to its trail store, its high-water marks and its
reports. The companion's own seal chain of revision 0.1
([07 — Optional Sealing](./07-optional-sealing.md), BEH-GX-049–056) is withdrawn. Sealing is off by
default. This file owns BEH-GX-170–175 and uses all six.

Planned source: `packages/gxp/src/sealing/trailChainStore.ts` and
`packages/gxp/src/checks/verifySeals.ts` *(Planned)*.

## BEH-GX-170: With sealing on, the trail store is audit-chain's inner store, and sealing is fixed for the life of a host

> **Invariant:** [INV-GX-007](../invariants.md#inv-gx-007-the-sink-acknowledges-only-what-the-store-reports-stored), [INV-GX-016](../invariants.md#inv-gx-016-the-sink-never-refuses-a-record-for-a-condition-of-its-own)
> **See:** [ADR-GX-029](../decisions/029-sealing-through-audit-chain.md), [ADR-GX-004](../decisions/004-append-only-trail-store.md), [ADR-BR-030](../../core/decisions/030-audit-sink-port.md)
> **Satisfies:** [URS-GX-005](../urs.md#urs-gx-005-optionally-detect-alteration-of-sealed-records)
> **Risk:** [RSK-GX-002](../gxp/03-risk-assessment.md#rsk-gx-002), [RSK-GX-004](../gxp/03-risk-assessment.md#rsk-gx-004)
> **Regulatory:** supports 21 CFR 11.10(e); EU GMP Annex 11 §4.4, §9 (detection only)

```ts
// illustrative — not type-checked
import type { HashChainOptions, ChainStoreShape, AnchorShape, ReceiptStoreShape, KeyedHasherShape } from "@bridger/audit-chain"

interface SealingOptions {
  readonly chain: HashChainOptions                                   // audit-chain 01, BEH-AC-001; alg, anchorEvery, …
  readonly anchoring:
    | { readonly anchor: AnchorShape; readonly receipts: ReceiptStoreShape }   // audit-chain 02, BEH-AC-009
    | "unanchored"                                                   // chain only (BEH-AC-016): consistency, no anchor
  readonly keyed?: KeyedHasherShape                                  // audit-chain 01, BEH-AC-007
}

// The companion's adapter: audit-chain's ChainStore over a TrailStore.
declare function trailChainStore(store: TrailStoreShape): ChainStoreShape
```

```
REQUIREMENT: With sealing on, `trailSink` (BEH-GX-022) MUST build its
             `AuditSink` with `HashChainSink.make(trailChainStore(store),
             options.chain)` — or the unanchored variant when `anchoring` is
             "unanchored" — of `@bridger/audit-chain`. `trailChainStore`'s
             `append({ record, link })` MUST perform the steps of BEH-GX-018
             to BEH-GX-021 on `record` and store `link` in the entry's `link`
             field, unchanged; it MUST fail with `AuditWriteFailed` in, and
             only in, the cases of BEH-GX-019.
```

```
REQUIREMENT: A `trailChainStore` MUST meet audit-chain's `ChainStore`
             obligations (BEH-AC-006): an `append` of a record already stored
             with an equal digest MUST succeed and store nothing; a different
             record under a stored `recordId` MUST be stored beside the first
             as a collision entry (BEH-GX-012), never dropped.
```

```
REQUIREMENT: Sealing MUST be enabled only by passing `SealingOptions`
             explicitly; `trailSink` without `sealing`, and `GxpLayer.make`
             with `sealing: "off"`, MUST write no `link`. Whether a host's
             trail is sealed MUST be decided by the sink configuration in
             force when the host writes its first record and MUST NOT change
             while the host lives; each host construction has a new `hostId`
             (BEH-BR-016), so a change takes effect with the next host.
```

```
REQUIREMENT: `@bridger/audit-chain` MUST be an optional peer dependency of
             the companion, imported only by the sealing entry
             `@bridger/gxp/sealing` (BEH-GX-001). The main entry point MUST
             NOT import it.
```

Being audit-chain's inner store is what makes the adoption cheap: the
companion keeps one entry per record, with the link beside it, and the checks
of [05 — Checks on Read](./05-checks-on-read.md) read the same entries audit-chain verifies. A per-host
constant keeps every chain linear from its first entry, as audit-chain's
genesis rule requires (BEH-AC-003).

## BEH-GX-171: verifySeals runs audit-chain's verification over the stored entries, with high-water marks as expected heads

> **Invariant:** [INV-GX-009](../invariants.md#inv-gx-009-a-finding-is-never-suppressed-or-upgraded)
> **See:** [ADR-GX-029](../decisions/029-sealing-through-audit-chain.md), [ADR-GX-008](../decisions/008-high-water-anchors.md), [ADR-GX-007](../decisions/007-checks-never-claim-integrity.md)
> **Satisfies:** [URS-GX-005](../urs.md#urs-gx-005-optionally-detect-alteration-of-sealed-records), [URS-GX-004](../urs.md#urs-gx-004-detect-loss-of-the-newest-records), [NFR-GX-006](../urs.md#nfr-gx-006-bounded-memory-on-read)
> **Risk:** [RSK-GX-004](../gxp/03-risk-assessment.md#rsk-gx-004), [RSK-GX-003](../gxp/03-risk-assessment.md#rsk-gx-003)
> **Regulatory:** supports the consumer's review under 21 CFR 11.10(e) and EU GMP Annex 11 §9 (detection only)

```ts
// illustrative — not type-checked
declare function verifySeals(
  store: TrailStoreShape,
  marks: AnchorStoreShape,                         // the companion's high-water marks (06)
  sealing: {
    readonly receipts: ReceiptStoreShape           // audit-chain 02
    readonly verifier: AnchorVerifierShape         // audit-chain 03, BEH-AC-020
    readonly keyed?: (keyId: string, input: Uint8Array) => Uint8Array | undefined
  },
  options: { readonly hostId: string; readonly pageSize?: number }
): Effect.Effect<CheckReport & { readonly chain: ChainReport },
                 TrailReadFailed | AnchorReadFailed | ReceiptStoreFailed>   // ReceiptStoreFailed: audit-chain 02
```

| Finding kind | From audit-chain's `ChainReport` |
| --- | --- |
| `chainBreak` | each entry of `breaks`, with its `kind` as `detail` |
| `anchorMismatch` | each entry of `anchorMismatches` |
| `unanchoredTail` | `hosts[].unanchoredTail`, when present |
| `headMismatch` | `hosts[].head` "head-short" or "head-mismatch" against the expected head taken from the host's highest high-water mark |
| `nonCanonical` | each entry of `notices` |

```
REQUIREMENT: `verifySeals` MUST confirm the receipts with audit-chain's
             `confirmAnchors` and then call `verifyChain` over the host's
             entries as `{ record, link }`, in ascending `auditSeq`, with
             `expectedHeads` set from the host's highest high-water mark
             (BEH-GX-042) when one exists. It MUST NOT recompute, re-derive or
             reinterpret any link itself.
```

```
REQUIREMENT: Every item of the `ChainReport` that the table names MUST become
             exactly one finding of the kind shown, and the `ChainReport`
             MUST be attached unchanged as `chain`. No item MAY be dropped,
             merged or upgraded (BEH-GX-040).
```

```
REQUIREMENT: `verifySeals` MUST NOT recompute an entry's digest from
             `canonical`; that is `checkTrailEntries`'s `digestMismatch`
             (BEH-GX-034), and a full verification MUST run both.
```

High-water marks are the companion's independent knowledge of how far each
host wrote ([06 — High-Water Marks and Anchors](./06-high-water-marks-and-anchors.md)). Passing them as audit-chain's
expected heads lets the same report show what audit-chain alone cannot: that
the newest anchored windows were removed together with their receipts. The
findings are named in the companion's vocabulary so that one report lists
every kind; the attached `ChainReport` is the evidence they were taken from.

## BEH-GX-172: Without a confirmed anchor, a consistent chain shows only consistency

> **Invariant:** [INV-GX-009](../invariants.md#inv-gx-009-a-finding-is-never-suppressed-or-upgraded)
> **See:** [ADR-GX-029](../decisions/029-sealing-through-audit-chain.md), [ADR-GX-007](../decisions/007-checks-never-claim-integrity.md)
> **Satisfies:** [URS-GX-005](../urs.md#urs-gx-005-optionally-detect-alteration-of-sealed-records), [URS-GX-016](../urs.md#urs-gx-016-know-which-obligations-remain-mine)
> **Risk:** [RSK-GX-004](../gxp/03-risk-assessment.md#rsk-gx-004), [RSK-GX-005](../gxp/03-risk-assessment.md#rsk-gx-005)
> **Regulatory:** supports (by delimiting) 21 CFR 11.10(e)

```
REQUIREMENT: When `verifiedThrough` is 0 for the host and the report has no
             `chainBreak`, the report MUST state "The chain is internally
             consistent; no anchor confirms it." and MUST report
             `unanchoredTail` for the whole trail.
```

```
REQUIREMENT: When the receipt store or the high-water mark store cannot be
             read, `verifySeals` MUST fail with the read error rather than
             report chain consistency alone.
```

```
REQUIREMENT: When sealing is off, or the sealing inputs are not given, every
             check that offers seal verification MUST list `chainBreak`,
             `anchorMismatch`, `headMismatch` and `nonCanonical` in
             `notCheckedKinds` (BEH-GX-033).
```

A chain recomputed end to end by whoever changed an entry is consistent; only
a head held outside their reach can show it is not the chain that was
written. The report says which of the two the reader has.

## BEH-GX-173: Seal verification is described in exactly one way

> **See:** [ADR-GX-027](../decisions/027-claims-and-non-claims.md), [ADR-GX-029](../decisions/029-sealing-through-audit-chain.md), [ADR-BR-034](../../core/decisions/034-gxp-companion-scope.md)
> **Satisfies:** [URS-GX-016](../urs.md#urs-gx-016-know-which-obligations-remain-mine), [URS-GX-005](../urs.md#urs-gx-005-optionally-detect-alteration-of-sealed-records)
> **Risk:** [RSK-GX-004](../gxp/03-risk-assessment.md#rsk-gx-004)
> **Regulatory:** supports (by delimiting) 21 CFR 11.10(e); EU GMP Annex 11 §9

```
REQUIREMENT: Documentation, type documentation and every report MUST call the
             function "seal verification" and MUST describe what it does in
             these words, or a strict subset of them: "Seal verification
             detects alteration, insertion, removal or reordering of sealed
             records up to the last verified anchor, against a party that
             cannot also rewrite the anchor store."
```

```
REQUIREMENT: Every report containing seal verification MUST add: "Entries
             above the last verified anchor are not covered. Sealing does not
             prevent any change. Sealing is specified by @bridger/audit-chain."
             It MUST list what audit-chain's verification cannot detect
             (BEH-AC-022) and MUST NOT describe a sealed trail with any term
             on the list of claims that ADR-GX-027 forbids.
```

The sentence is core's narrowed non-claim ([ADR-BR-034](../../core/decisions/034-gxp-companion-scope.md) #5), which now
names audit-chain as the sealing specification, so that the three trees cannot
drift apart. Each of its qualifications is a real limit: "up to the last
verified anchor" — the tail is open; "against a party that cannot also
rewrite the anchor store" — custody is the consumer's; "detects" — nothing is
prevented.

## BEH-GX-174: Sealing covers trail entries only

> **See:** [ADR-GX-029](../decisions/029-sealing-through-audit-chain.md), [ADR-GX-013](../decisions/013-single-use-tickets.md), [ADR-GX-022](../decisions/022-evidence-pack-format.md)
> **Satisfies:** [URS-GX-016](../urs.md#urs-gx-016-know-which-obligations-remain-mine)
> **Risk:** [RSK-GX-004](../gxp/03-risk-assessment.md#rsk-gx-004)
> **Regulatory:** supports (by delimiting) 21 CFR 11.10(e), 11.70

```
REQUIREMENT: The chain MUST cover trail entries and nothing else.
             Documentation MUST state that tickets and their event log
             (BEH-GX-068), high-water marks and evidence packs are not sealed;
             an evidence pack is identified by its own digest (BEH-GX-132).
```

```
REQUIREMENT: An entry marked `schema: "unsupported"` or `canonical:
             "jcs-escaped"` (BEH-GX-018), and a collision entry (BEH-GX-012),
             MUST still be chained by audit-chain when it is stored and
             verified by `verifySeals`; the companion MUST NOT exclude a
             marked entry from the chain.
```

Saying where the chain stops prevents a reader from extending it in their
mind to approvals: a ticket's link to the change it approved is checked by
the digest rules of [11 — Signature Linking](./11-signature-linking.md), not
by the trail's chain.

## BEH-GX-175: Fail-closed anchoring is audit-chain's gate piece, composed into the companion's gate

> **Invariant:** [INV-GX-016](../invariants.md#inv-gx-016-the-sink-never-refuses-a-record-for-a-condition-of-its-own)
> **See:** [ADR-GX-029](../decisions/029-sealing-through-audit-chain.md), [ADR-GX-030](../decisions/030-sink-marks-and-gate-refuses.md), [ADR-BR-047](../../core/decisions/047-generic-gate-and-plan.md)
> **Satisfies:** [URS-GX-005](../urs.md#urs-gx-005-optionally-detect-alteration-of-sealed-records), [URS-GX-006](../urs.md#urs-gx-006-approve-a-change-before-it-is-made)
> **Risk:** [RSK-GX-005](../gxp/03-risk-assessment.md#rsk-gx-005), [RSK-GX-023](../gxp/03-risk-assessment.md#rsk-gx-023)
> **Regulatory:** supports 21 CFR 11.10(e), 11.10(f); EU GMP Annex 11 §9

```ts
// illustrative — not type-checked
interface SealingOptions {
  // ...chain, anchoring, keyed (BEH-GX-170)
  readonly gate?: Parameters<typeof ChainGate.make>[1] | "not-used"   // audit-chain 02, BEH-AC-013
}
```

```
REQUIREMENT: When `sealing.gate` is given, `GxpLayer.make` MUST build
             audit-chain's `ChainGate` over the sealing sink's status and
             place it in the companion's host gate as the piece named
             "chain", after "trail" and before "approval" (BEH-GX-178). The
             companion MUST NOT add conditions of its own to that piece, and
             MUST NOT turn an anchoring condition or a chain break into a
             failed write.
```

```
REQUIREMENT: `sealing.gate` MUST be stated explicitly, as a configuration or
             "not-used", whenever sealing is on; a missing value MUST be a
             type error (BEH-GX-004).
```

Audit-chain already says how an anchoring outage or a chain break should stop
operator changes without stopping the trail (BEH-AC-013), in the same way the
companion's own conditions do ([22 — Trail Status and Gate](./22-trail-status-and-gate.md)). Composing its piece rather than
copying it keeps one definition of each condition.

---

_Previous: [20 — Required Acceptance Checks](./20-required-acceptance-checks.md)_ · _Next: [22 — Trail Status and Gate](./22-trail-status-and-gate.md)_
