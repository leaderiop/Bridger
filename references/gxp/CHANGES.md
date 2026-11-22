# Change history

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-GX-CHG                                               |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Change Record                                                |
> | Change History | 0.1 (2026-11-22): Older Change History lines moved out of the Document Control tables (improvement report 07, R6) |

---

A Document Control cell keeps its newest revisions; older lines are moved here, newest first, under the Document ID of
the document they belong to (`python3 references/core/scripts/split-history.py`). Nothing is rewritten: a line moves whole.

## BRIDGER-GX-00

`gxp/README.md`

- 0.5 (2026-11-10): CCR-GX-005 registered (round 2 findings of the specification audit of 2026-11-09, GxP side; coupling answer to core CCR-BR-034 and audit-chain CCR-AC-005); follow-ups: undeclared error tags declared, `expectKeyed` adopted, ADR-BR-039 re-pinned (CCR-GX-005)
- 0.4 (2026-11-09): CCR-GX-004 registered (coupling answer to core CCR-BR-033: installation check 8 packaged as IQ-22 and IQ-U10; interface map re-pinned); CCR-GX-004 extended with the independent review fixes (check 26 generator types, IQ-22 reason, two more pins) (CCR-GX-004)
- 0.3 (2026-11-09): CCR-GX-003 registered (coupling answer to core CCR-BR-032; interface map re-pinned) (CCR-GX-003)
- 0.2 (2026-11-09): Re-baseline against core through CCR-BR-031: contents rows for files 20 (to BEH-GX-169), 21 and 22, 07 withdrawn; sealing through `@bridger/audit-chain`; eighteen checks; register row (F-01, F-02, C-08, C-09) (CCR-GX-002)
- 0.1 (2026-10-03): Initial draft (CCR-GX-001)                

## BRIDGER-GX-APP-01

`gxp/appendices/core-interface-map.md`

- 0.12 (2026-11-11): §6 re-pinned for core 22 (0.18) and audit-chain README (0.12); §8 row for CCR-AC-011 (`packageSelf`), audit-chain range through CCR-AC-011; §6 re-pinned to the CCR-BR-041 revisions and its intro range extended to CCR-BR-041; §8 row for core CCR-BR-041 (take-over waits only for the stop step; a child whose cleanup failed unregistered outside shutdown, re-mount succeeding; cascade waits; "begun" from a failed activation; background fibers re-forked; lease inheritance; fewer `unmount-requested` records; assessed: nothing the companion relies on) (CCR-GX-012); second pass (cleanest design): §1 BEH-BR-195 row (Settled (2)–(7), `leak-acknowledged`) and BEH-BR-199 row; §7 OQ run evidence relies on core's `PackageSelf`/`packageSelf` and audit-chain's `packageSelf`, the core range starting at CCR-BR-041; §8 CCR-BR-041 row restates core's system acknowledgement (`pruneAcknowledgeLeaks`, `leak-acknowledged`) and `packageSelf`, and the CCR-GX-012 answer assesses them (CCR-GX-012)
- 0.11 (2026-11-11): §8 CCR-AC-009 row names `continuesFrom.seriesId` (the predecessor's id) as `hostId` (PL7); CCR-BR-038 and CCR-BR-039 rows limit "only" to the close-flush log (PL8) (SPEC-AUDIT-08); §8 rows for core CCR-BR-040 (`unmount`'s `CleanupError`, a scoped lease in `HeldPlugins`, `inspect().pending.cold`, `Conflict.reason` "cold-mismatch", the "begun" rule and take-over causes; assessed: nothing the companion relies on) and audit-chain CCR-AC-010 (wording only); §6 re-pinned (core README 0.35, 11, 21, 22, 23, 24, 28, invariants, traceability, risk assessment, ADR-BR-008; audit-chain README 0.11, 05 0.7), §6–§8 ranges to CCR-BR-040 and CCR-AC-010 (CCR-GX-011)
- 0.10 (2026-11-11): audit-chain 03 re-pinned at 0.8 (check 1 names the keyed-hasher failure; assessed: wording only, no change to what the GxP companion relies on) (CCR-AC-009); §8 rows for core CCR-BR-039 (`HostControlsData` encoding, `cold` part of the operation, `ReconcilePlan.cold`, the `shutdown` latch rule, the `unmount` changes) and audit-chain CCR-AC-009; the CCR-BR-038 row names the cold skip record in core's `cold` exclusion and the CCR-BR-039 join and supersede rules (C6), and `recordClose` logs only for `lastWritten` below `lastNumbered` (PL19); §1 BEH-BR-212 row: the JSON encoding (CL3); §6 re-pinned (core README 0.34, 12, 21, 22, 23, 24, 28, 32, invariants, traceability, gxp/02, gxp/03, ADR-BR-008, ADR-BR-030; audit-chain README, 04, 05); §7 range from CCR-BR-039 (SPEC-AUDIT-07) (CCR-GX-010)
- 0.9 (2026-11-11): §8 the CCR-BR-037 row corrected: `closed` reached `IqReport.controls`, now `HostControlsData` (G1); rows for core CCR-BR-038 (`HostControlsData`, `cold` bound, the close-flush latch rule assessed) and audit-chain CCR-AC-008 (G5, PL7); §1 BEH-BR-212 row names `HostControlsData`, BEH-BR-195 and BEH-BR-219 rows `cold`; §6 fourteen core documents and the audit-chain README, files 01 and 03 re-pinned; §7 ranges from CCR-BR-038 and CCR-AC-008 (SPEC-AUDIT-06) (CCR-GX-009)
- 0.8 (2026-11-11): §1 rows for `HostControls.closed`, `CloseTail`, `auditPosition.lastNumbered` and `select`'s `form` (G4, G3), BEH-BR-247 mapped; §8 CCR-BR-022 reassessed (G3), CCR-AC-007 answer names `chainLinkUnchecked` (G1), row for core CCR-BR-037; §7 core range from CCR-BR-037 and audit-chain range from CCR-AC-007 (PL26); §6 re-pinned (CCR-GX-008)
- 0.7 (2026-11-10): §6 re-pinned and §8 rows for core CCR-BR-036 and audit-chain CCR-AC-007, both assessed with no change to the companion's behaviours beyond those of CCR-GX-007; §6, §7 and §8 headings and ranges to CCR-BR-036 and CCR-AC-007 (CCR-GX-007)
- 0.6 (2026-11-10): §7 an `@bridger/audit-chain` column: one audit-chain minor line, checked by IQ-24 (M3); §6 re-pinned and §8 rows for core CCR-BR-035 and audit-chain CCR-AC-006, both assessed with no change to the companion's behaviours beyond those of CCR-GX-006; §7 core range starts at CCR-BR-035 (CCR-GX-006)
- 0.5 (2026-11-10): §6 audit-chain pinned through CCR-AC-005 (the text named CCR-AC-003 while the pins were CCR-AC-004's), files 04 and 05 pinned; §7 the core version is read from `Bridger.version`; §8 row for CCR-AC-005 and its heading extended (low, P7); coupling answer to core CCR-BR-034: §8 row, twenty-three core documents re-pinned, §6 and §8 headings to CCR-BR-034, §7 row starts at the first core release that includes CCR-BR-034; the zero-progress atomic stop is no longer attributed to BEH-BR-201/325; follow-ups: ADR-BR-039 re-pinned to 0.3 (CCR-BR-034 follow-up C22); §8 CCR-AC-005 row assesses `expectKeyed`, "unkeyed-link" and `lossCounterUnanchored` (CCR-GX-005)
- 0.4 (2026-11-09): §1 BEH-BR-016 and BEH-BR-210 rows: identifier uniqueness across hosts sharing the trail store, packaged as IQ-22 and IQ-U10; §4 RSK-BR-007 row; §6 fifteen core documents re-pinned after CCR-BR-033; §7 row starts at the first core release that includes CCR-BR-033; §8 row for CCR-BR-033 and its heading extended; files 12 (0.9) and ADR-BR-008 (0.8) re-pinned, and the §8 row extended, after the review fixes folded into CCR-BR-033 (CCR-GX-004)
- 0.3 (2026-11-09): §6 thirteen core documents re-pinned after CCR-BR-032; §7 row starts at the first core release that includes CCR-BR-032; §8 row for CCR-BR-032 (answer: none) and its heading extended (CCR-GX-003)
- 0.2 (2026-11-09): §§1–5 re-baselined against core through CCR-BR-031 (record fields, binding version 2 request fields, gate pieces, non-claim 5 naming audit-chain); rows for BEH-BR-248, 259, 260, 263, 292, 293, 313, 315, 321, 325 and ADR-BR-047; §6 pins every linked core document and the adopted audit-chain documents; §7 row requires CCR-BR-031; §8 coupling assessment of CCR-BR-015–031 (F-01, C-09) (CCR-GX-002)
- 0.1 (2026-10-03): Initial draft (CCR-GX-001)                

## BRIDGER-GX-BEH-09

`gxp/behaviors/09-approval-tickets.md`

- 0.3 (2026-11-10): BEH-GX-069 `ProposedRequest` carries the request fields binding version 2 digests (`definition.manifest`, `onBehalfOf`, `undo`, `allowChildren`, `mandatoryInterceptions`); BEH-GX-067 a late or surplus `signed` event is refused by the companion before appending, the store enforcing the version only (H5, low); follow-up: `TicketWriteFailed`, `TicketReadFailed`, `TicketVersionConflict`, `IssueRefused`, `RevokeRefused` declared as `Schema.TaggedError`, as raised (CCR-GX-005)
- 0.2 (2026-11-09): BEH-GX-065, 066: binding version 2 binds `onBehalfOf`, `undo` and the request-only fields `manifestDigest`, `allowChildren` and `mandatoryInterceptions`; gate-flow annotations and `previousManifest` deliberately unbound; a version 2 vector (F-01) (CCR-GX-002)
- 0.1 (2026-10-03): Initial draft (CCR-GX-001)                

## BRIDGER-GX-BEH-15

`gxp/behaviors/15-installation-checks.md`

- 0.2 (2026-11-09): Core's installation check 8 (identifier uniqueness of a provided `IdGenerator`, core CCR-BR-033) packaged: IQ-22, a probe drawing from the consumer's per-host generator instances given in the new option `idDraw`, and IQ-U10, the generator's design review listed as not executed; BEH-GX-116 retitled to core's eight checks; deviation range IQ-01 to IQ-22; `idDraw.generators` are `IdGenerator` service values; IQ-22's "not-applicable" reason names the default's random bound (CCR-GX-004)
- 0.1 (2026-10-03): Initial draft (CCR-GX-001)                

## BRIDGER-GX-BEH-16

`gxp/behaviors/16-oq-evidence.md`

- 0.4 (2026-11-10): BEH-GX-121, BEH-GX-126 `installed` is the IQ report's `installed`, produced by IQ-01, IQ-03, IQ-08 and IQ-24 (G3); BEH-GX-124 the generator takes no mutation report: the mutation kill rule is a review criterion outside the generated evidence (C14) (CCR-GX-007)
- 0.3 (2026-11-10): BEH-GX-126 the installed identity a run must match includes `@bridger/audit-chain` when sealing is on (M3) (CCR-GX-006)
- 0.2 (2026-11-10): BEH-GX-121: `RunnerOutputUnreadable` declared as `Schema.TaggedError`, raised but never declared before (CCR-GX-005)
- 0.1 (2026-10-03): Initial draft (CCR-GX-001)                

## BRIDGER-GX-BEH-18

`gxp/behaviors/18-archive-and-export.md`

- 0.6 (2026-11-11): BEH-GX-140 `readArchive` takes `receiptVerifiers` and `pinnedTrustRoots` and passes them to `verifyBundle`, with expected heads from the archive's own high-water marks, so an archived anchor can be confirmed and a head mismatch reported (H10); `chainLinkUnchecked` among the kinds a range archive above `auditSeq` 1 lists as not checked (PL23); the mapping of a range archive above `auditSeq` 1 and of a window ending above the `requested` range are named as exceptions (1) and (2) of INV-GX-009 (G7); BEH-GX-137 `exportBundle`'s `range` is a map keyed by series id (PL25) (CCR-GX-008)
- 0.5 (2026-11-10): BEH-GX-137 with `range: "all"` the bundle is exported up to `Number.MAX_SAFE_INTEGER`, so receipts of windows above the last stored entry reach `readArchive` and are reported "window-not-in-entries", as BEH-GX-171 does (G1); BEH-GX-140 an anchor mismatch of a window ending above a range archive's `requested` `toSeq` is reported as `anchorUnconfirmed`, not `anchorMismatch` (G2) (CCR-GX-007)
- 0.4 (2026-11-10): BEH-GX-140 `readArchive` returns the bundle's chain reports as `chain`; `expectKeyed: true` only with `keyed`; `keyed` takes a pure or an effectful MAC, the latter through audit-chain's `precomputeMacs`, and each series' `ChainReport` of `BundleReport.chain` is mapped (audit-chain CCR-AC-006 follow-up); a range archive starting above `auditSeq` 1 maps no chain-derived finding but `anchorUnconfirmed` and lists the others as not checked, since audit-chain verifies links and anchors from `auditSeq` 1; seal verification of an archive needs a range from 1 (M2) (CCR-GX-006)
- 0.3 (2026-11-10): BEH-GX-137 `sealing` inputs for `chain-bundle.json` and a bound on the entries it holds; BEH-GX-138 manifest `requested`; BEH-GX-140 option `keyed`, bundle entries compared with the archived entries (`bundleMismatch`), unconfirmed receipts reported, checks bounded to the requested range, memory bound of the bundle stated (P15, P20); BEH-GX-138 heading names format bridger-gx-archive/2, as its requirement does; follow-up: BEH-GX-140 passes `expectKeyed` with `keyed`, as `verifySeals` does (BEH-GX-171); follow-up: `ExportFailed`, `ArchiveUnreadable` declared as `Schema.TaggedError`, as raised (CCR-GX-005)
- 0.2 (2026-11-09): Archive format "bridger-gx-archive/2": `seals.jsonl` lines carry `marks`, `collision` and audit-chain's `link`; sealed trails carry audit-chain's verification bundle, re-verified with `verifyBundle` (F-02, C-09) (CCR-GX-002)
- 0.1 (2026-10-03): Initial draft (CCR-GX-001)                

## BRIDGER-GX-BEH-20

`gxp/behaviors/20-required-acceptance-checks.md`

- 0.7 (2026-11-11): Check 10 the close mark from `HostControls.closed` (G4); check 11 `chainLinkUnchecked` for a link whose key is unavailable, and no consistency statement while one is reported (PL23); check 28 `readArchive` with receipt verifiers, pinned trust roots and expected heads from the archive's marks, and the two named exceptions of INV-GX-009 (H10, G7); check 39 a fixed heap bound for the streaming paths only, the paths that take the chain whole tested against `maxEntries`, withdrawn BEH-GX-052 no longer cited (G6); check 40 cites BEH-GX-172 and BEH-GX-173 in place of withdrawn BEH-GX-054 and BEH-GX-055 (PL24) (CCR-GX-008)
- 0.6 (2026-11-10): Check 29 `@bridger/audit-chain` is an optional peer with the compatibility row's audit-chain range, imported only by the sealing entry (PL7); check 44 the consumer's `gatePieces` through `GxpTestHost.make`: order, refusal, a `Defer` refused as "<name>: deferred" without consuming a binding, and validation (PL4, G5) (CCR-GX-007)
- 0.5 (2026-11-10): Check 11 a window whose entries were removed with its receipt kept is reported "window-not-in-entries" (H6); check 12 five vectors (H7); check 15 the rendered `onBehalfOf`, `undo` and `requestOnly` fields (M1); check 26 IQ-01 to IQ-24 (M3); check 34 a rule naming `reconcile` (M4) (CCR-GX-006)
- 0.4 (2026-11-10): Check 11: `chainUnanchoredTail`, `anchorUnconfirmed` and `chainLossCounterRose`; check 26: IQ-01 to IQ-23; check 47: IQ-23 and `sink-status.json` (H7, P7, P14, P16); follow-up: check 11 adds the "unkeyed-link" `chainBreak` of a keyed trail rewritten with unkeyed links (CCR-GX-005)
- 0.3 (2026-11-09): Check 26 amended: IQ-22 and IQ-U10 in the reported order; IQ-22 fails on two counter generators under one prefix and passes under two (core CCR-BR-033); the generators drawn are the `IdGenerator` services built from `TestHost.counterIdGenerator` layers (CCR-GX-004)
- 0.2 (2026-11-09): Checks 1, 2, 3, 8, 11, 12 and 42 amended (store and mark instead of refuse, collisions kept, `auditDropped`, sealing through audit-chain, the version 2 vector); BEH-GX-169 added with checks 43–47 (F-01, F-02, C-08, C-09) (CCR-GX-002)
- 0.1 (2026-10-03): Initial draft (CCR-GX-001)                

## BRIDGER-GX-BEH-21

`gxp/behaviors/21-sealing-through-audit-chain.md`

- 0.4 (2026-11-10): BEH-GX-171 an `anchorMismatch` finding carries audit-chain's mismatch `kind` as `detail`, as check 11 asserts for "window-not-in-entries" (PL6) ; `chainLinkUnchecked` maps a "key-unavailable" break, which audit-chain now calls an unchecked link, not a `chainBreak`, and the internally-consistent statement needs none of them (follow-up of A1) (CCR-GX-007)
- 0.3 (2026-11-10): BEH-GX-171 `sealing.keyed` is a pure MAC function or `{ mac }`, an effectful one turned into the pure function by audit-chain's `precomputeMacs` (audit-chain CCR-AC-006 follow-up); BEH-GX-170 passes `SealingOptions.keyed` to the sink as `HashChainOptions.keyed` (M19); BEH-GX-171 reads every receipt the reader holds for the host (`toSeq` `Number.MAX_SAFE_INTEGER`), not only up to the store's last entry, so a window above a cut-off tail is reported "window-not-in-entries" (H6); BEH-GX-172 does not apply to a range archive above `auditSeq` 1 (M2) (CCR-GX-006)
- 0.2 (2026-11-10): BEH-GX-170 names the sink built for each anchoring choice and that it serves one host; BEH-GX-171 reads receipts through audit-chain's `ReceiptReader`, reports unconfirmed receipts as `anchorUnconfirmed`, passes `continuesFrom`, maps the new break and notice kinds, gives chain-derived findings their own names and bounds the entries held (`maxEntries`); BEH-GX-175 `gate` required, and "not-used" with an unanchored chain (H4, H6, P7, P14, P16, P17, P19); follow-up: BEH-GX-171 passes `expectKeyed: true` with `sealing.keyed`, so an unkeyed link in a keyed trail is a `chainBreak` "unkeyed-link" (audit-chain CCR-AC-005 follow-up) (CCR-GX-005)
- 0.1 (2026-11-09): Initial draft; replaces the withdrawn companion seal chain of 07 by `@bridger/audit-chain` (CCR-GX-002)

## BRIDGER-GX-INV

`gxp/invariants.md`

- 0.2 (2026-11-09): INV-GX-006 amended (a colliding entry is kept beside the primary), INV-GX-007 (acknowledgement of "stored-collision"; failure only when the store does not hold the record), INV-GX-012 (I-JSON domain, escaped encoding for records); INV-GX-013 withdrawn (sealing adopted from `@bridger/audit-chain`); INV-GX-016 added (F-02, C-09) (CCR-GX-002)
- 0.1 (2026-10-03): Initial draft (CCR-GX-001)                
