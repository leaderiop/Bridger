# 21 — Sealing through audit-chain

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-GX-BEH-21                                            |
> | Revision       | 0.5                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-GX-03 §5)           |
> | Approved by    | — (pending; single maintainer, see PROC-GX-03 §5)            |
> | Classification | Functional Specification                                     |
> | Change History | 0.5 (2026-11-11): BEH-GX-171 the two mappings of `readArchive` that leave an item without its own finding (an archive above `auditSeq` 1; a window ending above an archive's `requested` range) are named as exceptions, as INV-GX-009 names them (G7); BEH-GX-172 `chainLinkUnchecked` among the seal kinds listed as not checked (PL23); BEH-GX-170 audit-chain's sink gets the companion's observing wrapper of `keyed` and is wrapped in the companion's sink, which classifies and counts a keyed-hash failure (G2) (CCR-GX-008)<br>0.4 (2026-11-10): BEH-GX-171 an `anchorMismatch` finding carries audit-chain's mismatch `kind` as `detail`, as check 11 asserts for "window-not-in-entries" (PL6) ; `chainLinkUnchecked` maps a "key-unavailable" break, which audit-chain now calls an unchecked link, not a `chainBreak`, and the internally-consistent statement needs none of them (follow-up of A1) (CCR-GX-007)<br>0.3 (2026-11-10): BEH-GX-171 `sealing.keyed` is a pure MAC function or `{ mac }`, an effectful one turned into the pure function by audit-chain's `precomputeMacs` (audit-chain CCR-AC-006 follow-up); BEH-GX-170 passes `SealingOptions.keyed` to the sink as `HashChainOptions.keyed` (M19); BEH-GX-171 reads every receipt the reader holds for the host (`toSeq` `Number.MAX_SAFE_INTEGER`), not only up to the store's last entry, so a window above a cut-off tail is reported "window-not-in-entries" (H6); BEH-GX-172 does not apply to a range archive above `auditSeq` 1 (M2) (CCR-GX-006)<br>0.2 (2026-11-10): BEH-GX-170 names the sink built for each anchoring choice and that it serves one host; BEH-GX-171 reads receipts through audit-chain's `ReceiptReader`, reports unconfirmed receipts as `anchorUnconfirmed`, passes `continuesFrom`, maps the new break and notice kinds, gives chain-derived findings their own names and bounds the entries held (`maxEntries`); BEH-GX-175 `gate` required, and "not-used" with an unanchored chain (H4, H6, P7, P14, P16, P17, P19); follow-up: BEH-GX-171 passes `expectKeyed: true` with `sealing.keyed`, so an unkeyed link in a keyed trail is a `chainBreak` "unkeyed-link" (audit-chain CCR-AC-005 follow-up) (CCR-GX-005)<br>0.1 (2026-11-09): Initial draft; replaces the withdrawn companion seal chain of 07 by `@bridger/audit-chain` (CCR-GX-002) |

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
import type { HashChainOptions, ChainStoreShape, AnchorShape, ReceiptStoreShape, ReceiptReaderShape, KeyedHasherShape } from "@bridger/audit-chain"

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
REQUIREMENT: With sealing on, `trailSink` (BEH-GX-022) MUST build
             audit-chain's sink with `@bridger/audit-chain`'s
             `HashChainSink.make(trailChainStore(store), { ...options.chain,
             keyed: k })`, given `anchoring.anchor` and
             `anchoring.receipts` as its `Anchor` and `ReceiptStore`, when
             `anchoring` names them; and with
             `HashChainSink.layerUnanchored({ ...options.chain, keyed: k })`
             over `trailChainStore(store)` when `anchoring` is
             "unanchored", where `k` is the companion's observing wrapper of
             `options.keyed` (BEH-GX-022), absent when `options.keyed` is.
             It MUST provide as core's `AuditSink` the companion's sink
             around the one audit-chain builds (BEH-GX-022), never
             audit-chain's sink directly. `options.keyed`, when given, thus
             computes every link through `k` (`HashChainOptions.keyed`,
             BEH-AC-007), and every link it writes carries a `keyId`. Only
             the first returns the sink's `ChainStatusView` (BEH-AC-012),
             which `ChainGate` reads (BEH-GX-175); the second exposes no
             status. Like the trail sink it is part of, the chain sink serves
             exactly one host (BEH-AC-001, BEH-GX-017). `trailChainStore`'s
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
    readonly receipts: ReceiptReaderShape          // audit-chain 05, the read side of the ReceiptStore; series id = hostId
    readonly verifier: AnchorVerifierShape         // audit-chain 03, BEH-AC-020
    readonly keyed?:                               // BEH-AC-019; never SealingOptions.keyed itself, which is the sink's KeyedHasherShape
      | ((keyId: string, input: Uint8Array) => Uint8Array | undefined)                          // a pure MAC
      | { readonly mac: (keyId: string, input: Uint8Array) => Effect.Effect<Uint8Array, KeyedHashFailed> }   // an effectful MAC (a hardware module, a MAC service)
  },
  options: {
    readonly hostId: string
    readonly continuesFrom?: HashChainOptions["continuesFrom"]   // as the host's sink was built with (BEH-AC-007)
    readonly pageSize?: number
    readonly maxEntries?: number                   // default 1,000,000 (NFR-GX-006)
  }
): Effect.Effect<CheckReport & { readonly chain: ChainReport },
                 TrailReadFailed | AnchorReadFailed | BundleExportFailed | CheckCapacityExceeded>   // BundleExportFailed: audit-chain 05, ReceiptReader
```

| Finding kind | From audit-chain |
| --- | --- |
| `chainBreak` | each entry of the `ChainReport`'s `breaks` but those of kind "key-unavailable", whatever its `kind` ("canon-changed", "counter-decreased" and "unkeyed-link" included), with the `kind` as `detail` |
| `chainLinkUnchecked` | each entry of `breaks` of kind "key-unavailable": the link was not checked, not found inconsistent (BEH-AC-019), with `detail` "link not checked: key unavailable" |
| `anchorMismatch` | each entry of `anchorMismatches`, with its `kind` ("root-mismatch", "head-mismatch", "window-not-in-entries", "previous-mismatch" or "window-gap") as `detail` |
| `chainUnanchoredTail` | `hosts[].unanchoredTail`, when present: entries above the last confirmed anchor |
| `headMismatch` | `hosts[].head` "head-short" or "head-mismatch" against the expected head taken from the host's highest high-water mark |
| `chainNonCanonical` | each entry of `notices` of kind "non-canonical-encoding" |
| `chainLossCounterRose` | each entry of `notices` of kind "loss-counter-rose": the record's `auditDropped` rose (BEH-AC-030) |
| `anchorUnconfirmed` | each entry of `confirmAnchors`'s `unconfirmed`, with the window of its statement as `auditSeq` and `toSeq` and `detail` "statement <statementHash> not confirmed"; the verifier's `reason` is not copied (NFR-GX-007) |

```
REQUIREMENT: `verifySeals` MUST read every statement and receipt the
             receipt reader holds for the host, with
             `sealing.receipts.read(hostId, 1, Number.MAX_SAFE_INTEGER)`,
             and MUST NOT bound the read by the highest `auditSeq` read from
             the store: a window above the store's last entry (its entries
             removed, its receipt kept) MUST reach `verifyChain`, which
             reports it as an `anchorMismatches` entry of kind
             "window-not-in-entries" (BEH-AC-019). It MUST confirm them with
             audit-chain's `confirmAnchors`, and then call `verifyChain` over
             the host's entries as `{ record, link }`, in ascending
             `auditSeq`, with
             the confirmed statements, the default profile (`auditProfile`,
             BEH-AC-031), `continuesFrom` keyed by `hostId` when given, and
             `expectedHeads` set from the host's highest high-water mark
             (BEH-GX-042) when one exists. It MUST NOT recompute, re-derive or
             reinterpret any link itself.
```

```
REQUIREMENT: When `sealing.keyed` is given, `verifySeals` MUST pass a pure
             MAC function to `verifyChain` as `keyed` together with
             `expectKeyed: true` (BEH-AC-019): `sealing.keyed` itself when it
             is a function, and when it is `{ mac }` the function returned by
             audit-chain's `precomputeMacs(entries, mac, { profile:
             auditProfile })` over the entries it holds, run before
             `verifyChain`. A `KeyedHashFailed` for a link leaves that link
             reported "key-unavailable" (BEH-AC-019), which maps to
             `chainLinkUnchecked`, never to `chainBreak`. A caller holding the
             sink's `KeyedHasherShape` `h` (BEH-GX-170) passes `{ mac }` that
             answers `h.mac(input)` for `keyId` equal to `h.keyId` and fails
             with `KeyedHashFailed` for any other `keyId`. This is so that an entry whose link carries no `keyId` is
             a `chainBreak` with detail "unkeyed-link". The caller MUST give
             `sealing.keyed` for every host whose sink was built with
             `SealingOptions.keyed` (BEH-GX-170); documentation MUST state
             that without it a keyed trail rewritten with unkeyed links that
             recompute is not reported.
```

```
REQUIREMENT: Every item the table names MUST become exactly one finding of
             the kind shown, and the `ChainReport` MUST be attached unchanged
             as `chain`. No item MAY be dropped, merged or upgraded
             (BEH-GX-040), with exactly the two exceptions INV-GX-009 names,
             both made by `readArchive` (BEH-GX-140): (1) over an archive
             whose `requested` range starts above `auditSeq` 1, where
             audit-chain checks no link and confirms no anchor, no item but
             an unconfirmed receipt becomes a finding and the other kinds
             are listed in `notCheckedKinds`; (2) an `anchorMismatches`
             entry whose window ends above an archive's `requested` `toSeq`
             becomes one `anchorUnconfirmed` finding, not `anchorMismatch`.
             In both, the item stays in the attached report unchanged. The table covers every break and notice kind of
             the pinned audit-chain revision; a kind added by a later
             revision is assessed and mapped under a CCR-GX before that
             revision is adopted (change control §7).
```

```
REQUIREMENT: `verifyChain` takes the entries as one synchronous `Iterable`
             and returns one report (BEH-AC-017), so `verifySeals` MUST hold
             the host's entries in memory to call it. It MUST read them
             through `store.read` and fail with `CheckCapacityExceeded {
             hostId, auditSeq }`, `auditSeq` the first entry it could not
             hold, as soon as more than `maxEntries` would be held; it MUST
             NOT verify part of a host's entries. This is the bound of
             NFR-GX-006 for seal verification.
```

```
REQUIREMENT: When the host's sink was built with `continuesFrom`, the caller
             MUST pass the same value. Without it the first link is checked
             against the host's own genesis value and reported as a
             `chainBreak` at the first entry; the report MUST NOT be read as
             showing an alteration until it is rerun with the value.
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
A finding taken from the chain has a name of its own wherever the companion
already has a kind for a similar fact from another source — `unanchoredTail`
is measured against high-water marks (BEH-GX-046), `chainUnanchoredTail`
against confirmed anchors; `nonCanonical` and `auditDropped` are read from the
entry (BEH-GX-034, BEH-GX-038), `chainNonCanonical` and `chainLossCounterRose`
from its link — so that a reader can tell which evidence each rests on. A
receipt that could not be confirmed is reported rather than dropped: an
anchor service that was unreachable at verification would otherwise look
like a window that was never anchored.

## BEH-GX-172: Without a confirmed anchor, a consistent chain shows only consistency

> **Invariant:** [INV-GX-009](../invariants.md#inv-gx-009-a-finding-is-never-suppressed-or-upgraded)
> **See:** [ADR-GX-029](../decisions/029-sealing-through-audit-chain.md), [ADR-GX-007](../decisions/007-checks-never-claim-integrity.md)
> **Satisfies:** [URS-GX-005](../urs.md#urs-gx-005-optionally-detect-alteration-of-sealed-records), [URS-GX-016](../urs.md#urs-gx-016-know-which-obligations-remain-mine)
> **Risk:** [RSK-GX-004](../gxp/03-risk-assessment.md#rsk-gx-004), [RSK-GX-005](../gxp/03-risk-assessment.md#rsk-gx-005)
> **Regulatory:** supports (by delimiting) 21 CFR 11.10(e)

```
REQUIREMENT: When `verifiedThrough` is 0 for the host and the report has no
             `chainBreak` and no `chainLinkUnchecked`, the report MUST state "The chain is internally
             consistent; no anchor confirms it." and MUST report
             `chainUnanchoredTail` for the whole trail. This does not apply
             to an archive of a range starting above `auditSeq` 1, whose
             chain report checks no link (BEH-GX-140).
```

```
REQUIREMENT: When the receipt reader or the high-water mark store cannot be
             read, `verifySeals` MUST fail with the read error rather than
             report chain consistency alone.
```

```
REQUIREMENT: When sealing is off, or the sealing inputs are not given, every
             check that offers seal verification MUST list `chainBreak`,
             `chainLinkUnchecked`, `anchorMismatch`, `chainUnanchoredTail`,
             `headMismatch`, `chainNonCanonical`, `chainLossCounterRose` and
             `anchorUnconfirmed` in `notCheckedKinds` (BEH-GX-033).
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
  readonly gate: Parameters<typeof ChainGate.make>[1] | "not-used"    // audit-chain 02, BEH-AC-013
}
```

```
REQUIREMENT: When `sealing.gate` is a configuration, `GxpLayer.make` MUST build
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

```
REQUIREMENT: With `anchoring` "unanchored", `sealing.gate` MUST be
             "not-used": the unanchored sink exposes no status for `ChainGate`
             to read (BEH-GX-170), and `GxpLayer.make` MUST fail with
             `GxpLayerInvalid` (section "trail") when a configuration is
             given.
```

Audit-chain already says how an anchoring outage or a chain break should stop
operator changes without stopping the trail (BEH-AC-013), in the same way the
companion's own conditions do ([22 — Trail Status and Gate](./22-trail-status-and-gate.md)). Composing its piece rather than
copying it keeps one definition of each condition.

---

_Previous: [20 — Required Acceptance Checks](./20-required-acceptance-checks.md)_ · _Next: [22 — Trail Status and Gate](./22-trail-status-and-gate.md)_
