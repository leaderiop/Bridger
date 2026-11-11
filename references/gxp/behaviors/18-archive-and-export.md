# 18 — Archive and Export

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-GX-BEH-18                                            |
> | Revision       | 0.9                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-GX-03 §5)           |
> | Approved by    | — (pending; single maintainer, see PROC-GX-03 §5)            |
> | Classification | Functional Specification                                     |
> | Change History | 0.9 (2026-11-11): BEH-GX-140 exception (1) applies to the host's first confirmed statement, the lowest `verifyBundle` passes to `verifyChain` (G1) (SPEC-AUDIT-08) (CCR-GX-011)<br>0.8 (2026-11-11): BEH-GX-140 over a range starting above `auditSeq` 1 the first archived entry's "prev-mismatch" is a `chainLinkUnchecked` and the first statement's "previous-mismatch" or "window-gap" an `anchorUnconfirmed`, each with a detail (G1) (SPEC-AUDIT-07) (CCR-GX-010)<br>0.7 (2026-11-11): BEH-GX-140 `readArchive` takes the inspector's own `expectedHeads` and passes no head taken from the archive, `headMismatch` not checked without them (G2); over a range starting above `auditSeq` 1 only the items resting on `auditSeq` 1 give no finding, and a window starting below the range is an unconfirmed anchor like one ending above it (G3); `verifyBundle` confirms only with the verifiers given (PL3) (SPEC-AUDIT-06) (CCR-GX-009)<br>0.6 (2026-11-11): BEH-GX-140 `readArchive` takes `receiptVerifiers` and `pinnedTrustRoots` and passes them to `verifyBundle`, with expected heads from the archive's own high-water marks, so an archived anchor can be confirmed and a head mismatch reported (H10); `chainLinkUnchecked` among the kinds a range archive above `auditSeq` 1 lists as not checked (PL23); the mapping of a range archive above `auditSeq` 1 and of a window ending above the `requested` range are named as exceptions (1) and (2) of INV-GX-009 (G7); BEH-GX-137 `exportBundle`'s `range` is a map keyed by series id (PL25) (CCR-GX-008)<br>0.5 (2026-11-10): BEH-GX-137 with `range: "all"` the bundle is exported up to `Number.MAX_SAFE_INTEGER`, so receipts of windows above the last stored entry reach `readArchive` and are reported "window-not-in-entries", as BEH-GX-171 does (G1); BEH-GX-140 an anchor mismatch of a window ending above a range archive's `requested` `toSeq` is reported as `anchorUnconfirmed`, not `anchorMismatch` (G2) (CCR-GX-007)<br>0.4 (2026-11-10): BEH-GX-140 `readArchive` returns the bundle's chain reports as `chain`; `expectKeyed: true` only with `keyed`; `keyed` takes a pure or an effectful MAC, the latter through audit-chain's `precomputeMacs`, and each series' `ChainReport` of `BundleReport.chain` is mapped (audit-chain CCR-AC-006 follow-up); a range archive starting above `auditSeq` 1 maps no chain-derived finding but `anchorUnconfirmed` and lists the others as not checked, since audit-chain verifies links and anchors from `auditSeq` 1; seal verification of an archive needs a range from 1 (M2) (CCR-GX-006)<br>0.3 (2026-11-10): BEH-GX-137 `sealing` inputs for `chain-bundle.json` and a bound on the entries it holds; BEH-GX-138 manifest `requested`; BEH-GX-140 option `keyed`, bundle entries compared with the archived entries (`bundleMismatch`), unconfirmed receipts reported, checks bounded to the requested range, memory bound of the bundle stated (P15, P20); BEH-GX-138 heading names format bridger-gx-archive/2, as its requirement does; follow-up: BEH-GX-140 passes `expectKeyed` with `keyed`, as `verifySeals` does (BEH-GX-171); follow-up: `ExportFailed`, `ArchiveUnreadable` declared as `Schema.TaggedError`, as raised (CCR-GX-005)<br>0.2 (2026-11-09): Archive format "bridger-gx-archive/2": `seals.jsonl` lines carry `marks`, `collision` and audit-chain's `link`; sealed trails carry audit-chain's verification bundle, re-verified with `verifyBundle` (F-02, C-09) (CCR-GX-002)<br>0.1 (2026-10-03): Initial draft (CCR-GX-001)                 |

---

A trail is exported to hand it to an inspector, to move it between systems,
or to keep it after the live store is retired. Digests, chain links and binding
digests were computed over specific bytes; an exporter that parsed and
re-wrote the records would produce bytes that no longer match them. This file
specifies `exportTrail`, which writes one host's entries as their original
canonical text with their marks and, when sealed, their audit-chain links and
verification bundle, the tickets they cite, the high-water marks,
a check report, a manifest and a human-readable rendering that shows every
signature's manifestation; and `readArchive`, which re-verifies an archive
from its bytes alone ([ADR-GX-023](../decisions/023-archives-keep-original-bytes.md)). This file owns BEH-GX-137–144 and
uses all eight.

> **What export does not do — and who does**
>
> An archive is a copy taken at one time. The companion does not retain it,
> decide how long it is kept, protect it, remove anything from the live
> store, or provide a tool for reviewing it. Retention, storage of archives,
> disposal of live entries and the review of the trail are the consumer's
> obligation ([ADR-BR-034](../../core/decisions/034-gxp-companion-scope.md) non-claim 12).

Planned source: `packages/gxp/src/archive/exportTrail.ts`,
`packages/gxp/src/archive/readArchive.ts` and
`packages/gxp/src/archive/renderTrail.ts` *(Planned)*.

## BEH-GX-137: exportTrail writes one host's range, with the tickets it cites, as an archive directory

> **Invariant:** [INV-GX-008](../invariants.md#inv-gx-008-no-companion-api-rewrites-a-stored-entry), [INV-GX-005](../invariants.md#inv-gx-005-no-configuration-value-or-key-material-appears-in-any-companion-output)
> **See:** [ADR-GX-023](../decisions/023-archives-keep-original-bytes.md), [ADR-GX-004](../decisions/004-append-only-trail-store.md)
> **Satisfies:** [URS-GX-015](../urs.md#urs-gx-015-export-and-archive-a-trail-with-its-approvals)
> **Risk:** [RSK-GX-004](../gxp/03-risk-assessment.md#rsk-gx-004), [RSK-GX-019](../gxp/03-risk-assessment.md#rsk-gx-019), [RSK-BR-006](../../core/gxp/03-risk-assessment.md#rsk-br-006)
> **Regulatory:** supports 21 CFR 11.10(b), 11.10(c), 11.10(e); EU GMP Annex 11 §8.1, §17

```ts
// illustrative — not type-checked
declare function exportTrail(q: {
  readonly store: TrailStoreShape
  readonly tickets: TicketStoreShape | "not-used"
  readonly anchors: AnchorStoreShape | "not-used"
  readonly hostId: string
  readonly range: { readonly fromSeq: number; readonly toSeq: number } | "all"
  readonly scope: string                               // for re-linking approvals (BEH-GX-083)
  readonly policy: ApprovalPolicy | "not-used"
  readonly sealing: {                                  // a sealed trail (21); "not-used" otherwise
    readonly chain: ChainReaderShape                   // audit-chain 05, read side of the chain store; series id = hostId
    readonly receipts: ReceiptReaderShape              // audit-chain 05
    readonly trustRoots: readonly TrustRoot[]          // audit-chain 05, BEH-AC-035; never read from a store
  } | "not-used"
  readonly maxEntries?: number                         // default 1,000,000, as verifySeals (BEH-GX-171)
  readonly outDir: string                              // must not exist
}): Effect.Effect<ArchiveManifest, ExportFailed | CheckCapacityExceeded>

class ExportFailed extends Schema.TaggedError<ExportFailed>()("ExportFailed", {
  reason: Schema.Literal("read-failed", "bundle-export-failed", "write-failed", "entry-not-canonical"),
  auditSeq: Schema.optional(Schema.Number),   // with "entry-not-canonical" (BEH-GX-139)
  message: Schema.String                      // fixed template; never entry content
}) {}
```

```
REQUIREMENT: `exportTrail` MUST read the host's entries in the range through
             `store.read` as a stream, in ascending `auditSeq`, and MUST write
             every entry it reads. A read that fails MUST fail the export
             with `ExportFailed`; the archive MUST be written to a temporary
             sibling and renamed into place only when complete.
```

```
REQUIREMENT: With a ticket store, the archive MUST contain every stored event
             of every ticket whose id equals the `correlationId` of an
             exported entry, and every event of the stream "gate:<hostId>"
             (BEH-GX-095), as stored. With an anchor store, it MUST contain
             every high-water mark of the host.
```

```
REQUIREMENT: It MUST hold in memory at most one page of entries, the set of
             ticket ids seen and the state the checks of BEH-GX-140 need, so
             that a host of any length can be exported (NFR-GX-006).
```

```
REQUIREMENT: With `sealing`, the archive MUST contain `chain-bundle.json`,
             written by audit-chain's `exportBundle({ series: [hostId],
             range: new Map([[hostId, r]]), disclose: "segments", trustRoots })`
             with `sealing.chain` and `sealing.receipts` as its `ChainReader`
             and `ReceiptReader` — `range` is keyed by series id (BEH-AC-033)
             — where `r` is `q.range` when it is a range
             and, with "all", `{ fromSeq: 1, toSeq: Number.MAX_SAFE_INTEGER }`,
             so that, as for `verifySeals` (BEH-GX-171), the bundle holds
             every statement and receipt the reader holds for the host,
             including those of windows above the last stored entry (their
             entries removed, their receipts kept), which `readArchive` then
             reports as `anchorMismatch` "window-not-in-entries"; a
             `BundleExportFailed` MUST fail the export with `ExportFailed`. `exportBundle` returns the whole bundle, so
             a sealed export MUST fail with `CheckCapacityExceeded` before
             calling it when the range holds more than `maxEntries` entries.
             With "not-used" the file MUST be absent.
```

Exporting a trail without its approvals would cut the link of 11.70 at the
moment the trail leaves the system ([11 — Signature Linking](./11-signature-linking.md)); the
archive therefore carries every ticket the exported records cite. The export
must be taken before entries are removed from a live store
([BEH-GX-013](./02-trail-store-port.md#beh-gx-013-the-port-offers-no-update-and-no-delete)), since the companion offers no other copy.

## BEH-GX-138: An archive has a fixed layout and a manifest of digests in format bridger-gx-archive/2

> **Invariant:** [INV-GX-012](../invariants.md#inv-gx-012-the-canonical-form-is-deterministic-across-platforms)
> **See:** [ADR-GX-023](../decisions/023-archives-keep-original-bytes.md), [ADR-GX-022](../decisions/022-evidence-pack-format.md)
> **Satisfies:** [URS-GX-015](../urs.md#urs-gx-015-export-and-archive-a-trail-with-its-approvals), [NFR-GX-001](../urs.md#nfr-gx-001-deterministic-outputs)
> **Risk:** [RSK-GX-019](../gxp/03-risk-assessment.md#rsk-gx-019), [RSK-GX-020](../gxp/03-risk-assessment.md#rsk-gx-020)
> **Regulatory:** supports 21 CFR 11.10(b); EU GMP Annex 11 §17

```
<outDir>/
  manifest.json       format "bridger-gx-archive/2"
  trail.jsonl         one line per entry: its canonical text exactly as stored (BEH-GX-139)
  seals.jsonl         one line per entry: { hostId, auditSeq, recordId, digest, marks?, collision?, link? }
  chain-bundle.json   sealed trails only: @bridger/audit-chain's verification bundle (BEH-AC-033)
  tickets.jsonl       one line per ticket-store event, as stored, in eventSeq order
  anchors.jsonl       one line per high-water mark, in the order `list` returned them
  check-report.json   the reports run at export (BEH-GX-140)
  trail.html          derived rendering (BEH-GX-141)
```

```ts
// illustrative — not type-checked
interface ArchiveManifest {
  readonly format: "bridger-gx-archive/2"
  readonly hostId: string
  readonly range: { readonly fromSeq: number; readonly toSeq: number }   // as read
  readonly requested: { readonly fromSeq: number; readonly toSeq: number } | "all"   // q.range, copied (BEH-GX-140)
  readonly entries: number
  readonly supportedSchemaVersions: readonly number[]                   // BEH-GX-142
  readonly exportedAt: string                                           // from Clock
  readonly exporter: { readonly name: "@bridger/gxp"; readonly version: string }
  readonly sources: { readonly trail: unknown; readonly tickets?: unknown; readonly anchors?: unknown }  // port manifests, copied
  readonly files: readonly { readonly path: string; readonly digest: string; readonly bytes: number }[]
  readonly statement: string
}
```

```
REQUIREMENT: `files` MUST list every file except `manifest.json`, with the
             SHA-256 of its bytes, sorted by path. The archive digest MUST be
             the SHA-256 of the manifest's canonical text, as for an evidence
             pack (BEH-GX-132). A file for a store given as "not-used" MUST be
             absent and the manifest MUST say so.
```

```
REQUIREMENT: Every line of every `.jsonl` file MUST end with one line feed
             (U+000A) and contain no other line feed. Lines of
             `seals.jsonl`, `tickets.jsonl` and `anchors.jsonl` MUST be the
             canonical form of their value; `trail.jsonl` follows
             BEH-GX-139.
```

```
REQUIREMENT: `statement` MUST be: "This archive is a copy of the stored trail
             taken at <exportedAt>. trail.jsonl holds the entries as stored;
             trail.html is a derived rendering."
```

Plain files with one value per line can be read in ten years with nothing
but a JSON parser and a SHA-256 tool. The manifest's digests let a reader
confirm the archive is the one written; the digests inside `seals.jsonl` let
them confirm each entry is the one stored.

## BEH-GX-139: The original canonical text of each entry is written verbatim and never re-serialised

> **Invariant:** [INV-GX-008](../invariants.md#inv-gx-008-no-companion-api-rewrites-a-stored-entry), [INV-GX-012](../invariants.md#inv-gx-012-the-canonical-form-is-deterministic-across-platforms)
> **See:** [ADR-GX-023](../decisions/023-archives-keep-original-bytes.md), [ADR-GX-005](../decisions/005-jcs-and-sha256.md)
> **Satisfies:** [URS-GX-015](../urs.md#urs-gx-015-export-and-archive-a-trail-with-its-approvals)
> **Risk:** [RSK-GX-015](../gxp/03-risk-assessment.md#rsk-gx-015), [RSK-GX-019](../gxp/03-risk-assessment.md#rsk-gx-019)
> **Regulatory:** supports 21 CFR 11.10(b), 11.10(e); EU GMP Annex 11 §8.1, §17; ALCOA+ Original

```
REQUIREMENT: Line n of `trail.jsonl` MUST be the UTF-8 encoding of the n-th
             exported entry's `canonical` string, exactly as `read` returned
             it (BEH-GX-010, BEH-GX-014), followed by one line feed. The
             exporter MUST NOT parse, normalise, re-escape or re-serialise
             it, and MUST NOT use the entry's structured `record` to produce
             the line.
```

```
REQUIREMENT: When a `canonical` string contains a raw line feed — which RFC
             8785 text never does, since it escapes U+000A — the export MUST
             fail with `ExportFailed { reason: "entry-not-canonical",
             auditSeq }` rather than write a line that would split the entry.
```

```
REQUIREMENT: The digest written for an entry in `seals.jsonl` MUST be the
             stored `digest`, copied; the exporter MUST NOT recompute and
             substitute it. A mismatch between the two is a
             `digestMismatch` finding of the export's check report, and the
             entry MUST still be written as stored.
```

Keeping the stored text means a digest computed in 2026 still matches in
2036, whatever JSON library the reader uses. An entry whose text and digest
disagree is exported as it is, with the finding, because an archive that
silently "fixed" it would destroy the evidence that something changed.

## BEH-GX-140: readArchive re-verifies an archive from its bytes and runs the checks afresh

> **Invariant:** [INV-GX-009](../invariants.md#inv-gx-009-a-finding-is-never-suppressed-or-upgraded), [INV-GX-012](../invariants.md#inv-gx-012-the-canonical-form-is-deterministic-across-platforms)
> **See:** [ADR-GX-023](../decisions/023-archives-keep-original-bytes.md), [ADR-GX-007](../decisions/007-checks-never-claim-integrity.md), [ADR-GX-029](../decisions/029-sealing-through-audit-chain.md)
> **Satisfies:** [URS-GX-015](../urs.md#urs-gx-015-export-and-archive-a-trail-with-its-approvals), [URS-GX-003](../urs.md#urs-gx-003-detect-lost-duplicated-reordered-or-altered-stored-records), [NFR-GX-006](../urs.md#nfr-gx-006-bounded-memory-on-read)
> **Risk:** [RSK-GX-004](../gxp/03-risk-assessment.md#rsk-gx-004), [RSK-GX-019](../gxp/03-risk-assessment.md#rsk-gx-019)
> **Regulatory:** supports 21 CFR 11.10(b), 11.10(e); EU GMP Annex 11 §17 (accessibility, readability and accuracy of archived data)

```ts
// illustrative — not type-checked
declare function readArchive(dir: string, options?: {
  readonly scope?: string; readonly policy?: ApprovalPolicy
  readonly pageSize?: number                           // default 1000, as checkStoredTrail (BEH-GX-035)
  readonly maxOpenRequests?: number                    // default 100000, as checkStoredTrail
  readonly maxEntries?: number                         // default 1,000,000, as verifySeals (BEH-GX-171)
  readonly keyed?:                                     // for keyed links, in either form verifySeals takes (BEH-GX-171)
    | ((keyId: string, input: Uint8Array) => Uint8Array | undefined)
    | { readonly mac: (keyId: string, input: Uint8Array) => Effect.Effect<Uint8Array, KeyedHashFailed> }
  readonly receiptVerifiers?: readonly OfflineReceiptVerifier[]   // audit-chain 05, BEH-AC-036; passed to verifyBundle unchanged
  readonly pinnedTrustRoots?: readonly TrustRoot[]                // audit-chain 05, BEH-AC-035; the inspector's own, passed to verifyBundle unchanged
  readonly expectedHeads?: ReadonlyMap<string, { readonly seq: number; readonly hash?: string }>   // audit-chain 05, BEH-AC-034; the inspector's own, passed to verifyBundle unchanged
}): Effect.Effect<{ readonly manifest: ArchiveManifest; readonly files: readonly FileCheck[]
                    readonly report: CheckReport; readonly links?: ApprovalLinkReport
                    readonly chain?: Readonly<Record<string, ChainReport>> },   // BundleReport.chain, unchanged; present exactly when chain-bundle.json is
                  ArchiveUnreadable | CheckCapacityExceeded>

class ArchiveUnreadable extends Schema.TaggedError<ArchiveUnreadable>()("ArchiveUnreadable", {
  reason: Schema.Literal("manifest-unparseable", "format-unsupported")   // any other defect is a finding (BEH-GX-140)
}) {}
```

```
REQUIREMENT: `readArchive` MUST recompute the digest of every file and
             compare it with the manifest, reporting each difference, a file
             missing and a file not listed. It MUST then rebuild trail
             entries from `trail.jsonl` and `seals.jsonl` — `canonical` from
             the line's bytes, `record` by parsing them — and run
             `checkTrailEntries` (BEH-GX-034) bounded by the `requested`
             range; audit-chain's `verifyBundle` over `chain-bundle.json`
             when present (BEH-AC-034), with `options.receiptVerifiers` and
             `options.pinnedTrustRoots`, when given, as its options of the
             same names, `expectedHeads` as the next requirement states, and
             `keyed`, when given, as
             `options.keyed` — itself when it is a function, else the
             function audit-chain's `precomputeMacs` returns over the
             bundle's segment entries — and, when `keyed` is given,
             `expectKeyed: true`; the high-water comparison (BEH-GX-045);
             and, with `scope` and `policy`, `linkApprovals` over the
             archived tickets (BEH-GX-087). It MUST map each series'
             `ChainReport` in `BundleReport.chain` as BEH-GX-171 maps a chain
             report (an archive's bundle holds one series, the manifest's
             `hostId`) and return `BundleReport.chain` unchanged as `chain`,
             present exactly when `chain-bundle.json` is.
```

```
REQUIREMENT: `readArchive` MUST pass `options.expectedHeads`, when given, to
             `verifyBundle` as its `expectedHeads`, unchanged: heads the
             inspector learned apart from the archive, the only heads that
             may confirm a head (BEH-AC-034). It MUST NOT pass heads taken
             from the archive — neither the marks of `anchors.jsonl` nor the
             bundle's own `expectedHeads` — since the archive is not signed
             and would confirm itself. Without `options.expectedHeads` it
             MUST pass no `expectedHeads` and list `headMismatch` in
             `notCheckedKinds`. Documentation MUST state that the
             inspector's heads should come from a copy the archive's writer
             cannot alter (a high-water mark or a `CloseTail` held apart),
             that `headMismatch` then shows the archived entries ending
             below that head (for an archive of a range, an expected head
             above its `toSeq` gives a `headMismatch`), and that without
             `receiptVerifiers`
             every receipt is reported `anchorUnconfirmed` and no anchor is
             confirmed, since `verifyBundle` confirms receipts only with the
             offline verifiers it is given and audit-chain's main entry
             exports none that confirms without a trust root (BEH-AC-034,
             BEH-AC-036).
```

```
REQUIREMENT: When `chain-bundle.json` is present, `readArchive` MUST compare
             its segment entries with the archived entries: an entry whose
             `record` does not give the line of `trail.jsonl` at the same
             `auditSeq` when encoded as BEH-GX-018 encodes it, whose `link`
             differs from the `seals.jsonl` link at that `auditSeq`, or
             whose `auditSeq` is on one side only, MUST be reported as one
             `bundleMismatch` finding. Receipts `verifyBundle` reports
             "not-checked" or "failed" MUST be reported as
             `anchorUnconfirmed`, as BEH-GX-171 reports unconfirmed receipts.
```

```
REQUIREMENT: Audit-chain counts `linksCheckedThrough` and `verifiedThrough`
             from `auditSeq` 1, checks the first link against the genesis
             value or `continuesFrom`, and checks statements for contiguity
             from `auditSeq` 1 (BEH-AC-018, BEH-AC-019); it still recomputes
             every link of the segment and the root and head of every window
             whose entries it holds. When the manifest's `requested` range
             has a `fromSeq` above 1, `readArchive` MUST run `verifyBundle`,
             the comparison above and the mapping of BEH-GX-171, and attach
             the chain reports unchanged, except that the items resting on
             `auditSeq` 1 MUST NOT become findings of their mapped kinds: the
             "prev-mismatch" break of the first archived entry MUST be
             reported as one `chainLinkUnchecked` with `detail` "link not
             checked: previous entry outside the archive"; an
             `anchorMismatches` entry of kind "previous-mismatch" or
             "window-gap" for the host's first confirmed statement (the
             lowest statement `verifyBundle` passes to `verifyChain`; an
             unconfirmed receipt before it is not passed) MUST be
             reported as one `anchorUnconfirmed` with the window as
             `auditSeq` and `toSeq` and `detail` "statement <statementHash>
             not confirmed: previous statement outside the archive"; and
             `hosts[].unanchoredTail` MUST become no finding, with
             `chainUnanchoredTail` listed in `notCheckedKinds`. Every other
             item — the breaks of later entries and the first entry's other
             breaks, the notices, `head`, and the mismatches of windows
             inside the range — MUST be mapped as BEH-GX-171 maps it; a
             window that crosses an end of the range is the next
             requirement's. This is exception (1) of INV-GX-009, named also
             in BEH-GX-171: items of the attached report stated as not
             checked or not confirmed, or as a kind not checked, because
             they rest on entries and statements the archive does not hold;
             an empty finding list therefore never covers them. Documentation MUST state that the link of the
             first archived entry to its predecessor, the statements before
             the range and `verifiedThrough` are verified only by an archive
             whose range starts at `auditSeq` 1, or "all".
```

```
REQUIREMENT: When the manifest's `requested` range is a range, the bundle
             holds the statement of a window that overlaps it but only the
             entries inside it (BEH-AC-033). An `anchorMismatches` entry of
             kind "root-mismatch", "head-mismatch" or
             "window-not-in-entries" whose statement's window ends above
             the `requested` `toSeq`, or starts below a `requested` `fromSeq`
             above 1, MUST NOT be mapped to `anchorMismatch`, since the
             archive does not hold all of that window's entries; it MUST
             be reported as one `anchorUnconfirmed` finding with the window
             as `auditSeq` and `toSeq` and `detail` "statement
             <statementHash> not confirmed: window ends above the archived
             range" or, for a window starting below it, "statement
             <statementHash> not confirmed: window starts below the
             archived range", and kept unchanged in the attached chain
             report. This
             is exception (2) of INV-GX-009, named also in BEH-GX-171: the
             mismatch is stated as an unconfirmed anchor because the archive
             cannot show which side differs. Documentation MUST state that a
             window crossing an end of the
             range is verified only by an archive whose range covers it.
```

```
REQUIREMENT: The checks MUST be bounded by the manifest's `requested` range.
             When it is a range, the report MUST equal that of
             `checkStoredTrail` with its `fromSeq` and `toSeq` (BEH-GX-035,
             BEH-GX-037): no `gap` below `fromSeq`, the end-of-range rule
             for open requests; and the high-water comparison MUST NOT
             report `tailLoss` or `unanchoredTail` above `toSeq`. With
             "all" the archive is checked as the whole host.
```

```
REQUIREMENT: The report MUST be produced by these runs alone. `readArchive`
             MUST NOT read, trust or copy findings from the archived
             `check-report.json`; it MAY list where the fresh report and the
             archived one differ.
```

```
REQUIREMENT: An archive whose manifest does not parse, or whose format is not
             "bridger-gx-archive/2", MUST fail with `ArchiveUnreadable`; any
             other defect MUST be reported, not raised, so that a damaged
             archive is still read as far as it can be.
```

```
REQUIREMENT: `readArchive` MUST read each file as a stream, computing its
             digest as it reads, and MUST hold in memory at most one page of
             `pageSize` lines of `trail.jsonl` with their `seals.jsonl`
             lines, the last entry of the previous page, the open
             `requested` records (BEH-GX-037), the state that the
             high-water comparison keeps (BEH-GX-045) and, for linking, only the ticket events
             `listConsumptions` holds (BEH-GX-084), so that
             its memory is bounded by these settings and not by the length
             of the archive (NFR-GX-006). Its report MUST equal, finding for
             finding, that of the checks bounded by the `requested` range
             over all archived entries at once (BEH-GX-035). When the open
             `requested` records exceed `maxOpenRequests` it MUST fail with
             `CheckCapacityExceeded`, never return a partial report.
```

```
REQUIREMENT: `verifyBundle` takes the parsed bundle whole (BEH-AC-034), so
             `readArchive` MUST fail with `CheckCapacityExceeded` before
             parsing `chain-bundle.json` when the manifest's `entries`
             exceeds `maxEntries`, and MUST NOT parse a bundle whose size or
             digest differs from the manifest's; such a file is reported as
             a file difference and the seal kinds are listed as not checked.
```

An archive is opened years after it was written, by someone who did not
write it. Re-deriving every result from the bytes means its findings depend
only on what is in the archive now, not on what an exporter once claimed;
the comparison with the archived report then shows whether anything changed
in between.

## BEH-GX-141: trail.html renders every record and every approval's manifestations, and is marked as derived

> **Invariant:** [INV-GX-015](../invariants.md#inv-gx-015-every-signed-binding-carries-a-manifestation), [INV-GX-005](../invariants.md#inv-gx-005-no-configuration-value-or-key-material-appears-in-any-companion-output)
> **See:** [ADR-GX-023](../decisions/023-archives-keep-original-bytes.md), [ADR-GX-016](../decisions/016-signature-port-and-manifestation.md)
> **Satisfies:** [URS-GX-015](../urs.md#urs-gx-015-export-and-archive-a-trail-with-its-approvals), [URS-GX-008](../urs.md#urs-gx-008-show-who-signed-when-and-with-what-meaning)
> **Risk:** [RSK-GX-020](../gxp/03-risk-assessment.md#rsk-gx-020)
> **Regulatory:** supports 21 CFR 11.10(b) (human-readable copies), 11.50; EU GMP Annex 11 §8.1, §14

```
REQUIREMENT: The first line of `trail.html` MUST state "Derived rendering of
             archive <archiveDigest>; trail.jsonl is the record." It MUST be
             generated from the archive's files only, by a pure function, as
             one self-contained file with no script and no external resource,
             and MUST be byte-identical across runs over the same files.
```

```
REQUIREMENT: It MUST render every exported record in `auditSeq` order with
             each field the record carries, under the field names of
             BEH-BR-195, without translating or summarising them. For every
             record linked to an approval it MUST show the ticket id, the
             rendered binding (BEH-GX-074) and `renderManifestation` of every
             counted signature (BEH-GX-085), and for a fingerprinted path the
             word "fingerprinted" only (BEH-GX-104).
```

```
REQUIREMENT: It MUST show the export's check report, link report and the
             statements those reports carry, unabridged.
```

Part 11 asks for copies in human-readable form; an inspector reads the
rendering, not JSON lines. Deriving it from the archive alone, with the
record's own field names and meanings ([BEH-BR-196](../../core/behaviors/23-audit-sink-and-record.md)), keeps the two comparable; showing every signature
with its manifestation next to the change it approved keeps 11.50 and 11.70
together on one page ([RSK-GX-020](../gxp/03-risk-assessment.md#rsk-gx-020)).

## BEH-GX-142: The archive states the schema versions its exporter understood, and keeps every other entry verbatim

> **Invariant:** [INV-GX-009](../invariants.md#inv-gx-009-a-finding-is-never-suppressed-or-upgraded), [INV-GX-008](../invariants.md#inv-gx-008-no-companion-api-rewrites-a-stored-entry)
> **See:** [ADR-GX-023](../decisions/023-archives-keep-original-bytes.md), [ADR-GX-025](../decisions/025-core-version-range.md)
> **Satisfies:** [URS-GX-015](../urs.md#urs-gx-015-export-and-archive-a-trail-with-its-approvals), [URS-GX-003](../urs.md#urs-gx-003-detect-lost-duplicated-reordered-or-altered-stored-records)
> **Risk:** [RSK-GX-019](../gxp/03-risk-assessment.md#rsk-gx-019)
> **Regulatory:** supports EU GMP Annex 11 §4.8, §17 (migration and retrievability after system changes)

```
REQUIREMENT: `supportedSchemaVersions` MUST equal the exporter's exported
             `SUPPORTED_SCHEMA_VERSIONS` (BEH-GX-007). An entry of another
             version MUST be exported verbatim like every other entry and
             reported as `unknownSchemaVersion` (BEH-GX-036); it MUST NOT be
             skipped, converted or rendered as if understood.
```

```
REQUIREMENT: The companion MUST offer no function that converts an archived
             or stored record to another schema version. A migration made by
             the consumer MUST produce a new archive, whose manifest the
             consumer may make refer to the old archive's digest; the old
             archive MUST NOT be modified.
```

A schema change is the moment old data is most at risk of quiet rewriting
(Annex 11 §4.8). Stating the versions the exporter understood, and carrying
the rest untouched with a finding, lets a later reader with a newer companion
interpret what this one could not, from the same bytes.

## BEH-GX-143: Retention and disposal are the consumer's, and the companion deletes nothing

> **Invariant:** [INV-GX-008](../invariants.md#inv-gx-008-no-companion-api-rewrites-a-stored-entry)
> **See:** [ADR-GX-023](../decisions/023-archives-keep-original-bytes.md), [ADR-GX-004](../decisions/004-append-only-trail-store.md), [ADR-BR-034](../../core/decisions/034-gxp-companion-scope.md)
> **Satisfies:** [URS-GX-016](../urs.md#urs-gx-016-know-which-obligations-remain-mine), [URS-GX-015](../urs.md#urs-gx-015-export-and-archive-a-trail-with-its-approvals)
> **Risk:** [RSK-GX-004](../gxp/03-risk-assessment.md#rsk-gx-004)
> **Regulatory:** supports (by delimiting) 21 CFR 11.10(c); EU GMP Annex 11 §7.1, §17

```
REQUIREMENT: Neither `exportTrail` nor `readArchive` nor any other companion
             function MAY delete, truncate or mark as exported an entry of a
             trail store, an event of a ticket store or a high-water mark.
             An export MUST leave every store exactly as it found it.
```

```
REQUIREMENT: Documentation MUST state that how long archives and live
             entries are kept, where archives are stored, how their storage
             is protected and checked for readability, and when live entries
             may be disposed of after an export are decided and performed by
             the consumer under their own procedures. This is the consumer's
             obligation.
```

```
REQUIREMENT: No companion output MAY describe an archive as permanent,
             tamper-resistant or a substitute for the live store's backups.
```

Core keeps no copy of a record ([BEH-BR-208](../../core/behaviors/23-audit-sink-and-record.md)), and the companion keeps
none of an archive. Leaving every removal to the consumer keeps the decision
— and its record — in the consumer's quality system, where retention
periods are set.

## BEH-GX-144: Export supports reading the trail; it is not a review tool

> **See:** [ADR-GX-027](../decisions/027-claims-and-non-claims.md), [ADR-GX-023](../decisions/023-archives-keep-original-bytes.md), [ADR-BR-034](../../core/decisions/034-gxp-companion-scope.md)
> **Satisfies:** [URS-GX-016](../urs.md#urs-gx-016-know-which-obligations-remain-mine), [URS-GX-015](../urs.md#urs-gx-015-export-and-archive-a-trail-with-its-approvals)
> **Risk:** [RSK-GX-004](../gxp/03-risk-assessment.md#rsk-gx-004)
> **Regulatory:** supports (by delimiting) EU GMP Annex 11 §9 (regular review is the consumer's); 21 CFR 11.10(e)

```
REQUIREMENT: The companion MUST NOT offer search, filtering, querying,
             annotation, sign-off of a review, or review scheduling over a
             trail or an archive. `trail.html` MUST NOT contain interactive
             controls.
```

```
REQUIREMENT: Documentation of export MUST state: "Export and readArchive
             produce and re-check a copy of the trail. Reviewing the trail,
             and recording that review, is done with the consumer's own
             tools and procedures."
```

Both packages decline to be a review tool ([ADR-BR-034](../../core/decisions/034-gxp-companion-scope.md) non-claim 12):
review needs workflow, access control and records of its own that belong to
the consumer's systems. The archive is built to feed such a tool — plain
files, stable digests, a rendering a person can read — without becoming one.

---

_Previous: [17 — Evidence Pack](./17-evidence-pack.md)_ · _Next: [19 — Testing Entry Point](./19-testing-entry-point.md)_
