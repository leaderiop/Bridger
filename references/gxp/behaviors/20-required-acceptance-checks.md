# 20 — Required Acceptance Checks

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-GX-BEH-20                                            |
> | Revision       | 0.10                                                         |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-GX-03 §5)           |
> | Approved by    | — (pending; single maintainer, see PROC-GX-03 §5)            |
> | Classification | Functional Specification                                     |
> | Change History | 0.10 (2026-11-11): Check 28 names the host's first confirmed statement, also when the first held receipt is unconfirmed (G1); check 27 covers `captureRunEnvironment`'s `resolve` rule (PL4) (SPEC-AUDIT-08) (CCR-GX-011)<br>0.9 (2026-11-11): Check 28 asserts the `chainLinkUnchecked` and `anchorUnconfirmed` of an archive above `auditSeq` 1 (G1) (SPEC-AUDIT-07) (CCR-GX-010)<br>0.8 (2026-11-11): Check 11 the keyed-hash-failed path: `AuditWriteFailed` with its message, no `store.append`, one "keyed-hash-failed" count (PL5); check 28 heads only from the inspector's `expectedHeads` (G2), an archive above `auditSeq` 1 maps breaks inside the range and lists `chainUnanchoredTail` as not checked, a window starting below the range is unconfirmed (G3); checks 15 and 46 a bound and rendered `cold` (core CCR-BR-038 coupling) (SPEC-AUDIT-06) (CCR-GX-009)<br>0.7 (2026-11-11): Check 10 the close mark from `HostControls.closed` (G4); check 11 `chainLinkUnchecked` for a link whose key is unavailable, and no consistency statement while one is reported (PL23); check 28 `readArchive` with receipt verifiers, pinned trust roots and expected heads from the archive's marks, and the two named exceptions of INV-GX-009 (H10, G7); check 39 a fixed heap bound for the streaming paths only, the paths that take the chain whole tested against `maxEntries`, withdrawn BEH-GX-052 no longer cited (G6); check 40 cites BEH-GX-172 and BEH-GX-173 in place of withdrawn BEH-GX-054 and BEH-GX-055 (PL24) (CCR-GX-008)<br>0.6 (2026-11-10): Check 29 `@bridger/audit-chain` is an optional peer with the compatibility row's audit-chain range, imported only by the sealing entry (PL7); check 44 the consumer's `gatePieces` through `GxpTestHost.make`: order, refusal, a `Defer` refused as "<name>: deferred" without consuming a binding, and validation (PL4, G5) (CCR-GX-007)<br>0.5 (2026-11-10): Check 11 a window whose entries were removed with its receipt kept is reported "window-not-in-entries" (H6); check 12 five vectors (H7); check 15 the rendered `onBehalfOf`, `undo` and `requestOnly` fields (M1); check 26 IQ-01 to IQ-24 (M3); check 34 a rule naming `reconcile` (M4) (CCR-GX-006)<br>0.4 (2026-11-10): Check 11: `chainUnanchoredTail`, `anchorUnconfirmed` and `chainLossCounterRose`; check 26: IQ-01 to IQ-23; check 47: IQ-23 and `sink-status.json` (H7, P7, P14, P16); follow-up: check 11 adds the "unkeyed-link" `chainBreak` of a keyed trail rewritten with unkeyed links (CCR-GX-005)<br>0.3 (2026-11-09): Check 26 amended: IQ-22 and IQ-U10 in the reported order; IQ-22 fails on two counter generators under one prefix and passes under two (core CCR-BR-033); the generators drawn are the `IdGenerator` services built from `TestHost.counterIdGenerator` layers (CCR-GX-004)<br>0.2 (2026-11-09): Checks 1, 2, 3, 8, 11, 12 and 42 amended (store and mark instead of refuse, collisions kept, `auditDropped`, sealing through audit-chain, the version 2 vector); BEH-GX-169 added with checks 43–47 (F-01, F-02, C-08, C-09) (CCR-GX-002)<br>0.1 (2026-10-03): Initial draft (CCR-GX-001)                 |

---

The behaviours of files 01–19 say what the companion must do; this file says
which of them must be shown by an executed test before any version is
released, in the numbered style of core's required checks ([BEH-BR-183](../../core/behaviors/21-testing-host.md),
[BEH-BR-184](../../core/behaviors/21-testing-host.md)). Each numbered check is one observable pass condition and becomes
the acceptance scenario `REQ-GX-nnn` with the same number, in order, in
[traceability](../traceability.md) §5. Checks 1–11 cover storage, conformance, checks on
read, anchors and sealing; checks 12–28 tickets, signatures, the gate,
fingerprints, evidence and export; checks 29–42 the cross-cutting rules; and
checks 43–47, added by CCR-GX-002, the sink's marks, the trail gate, record
pairing and binding version 2
([ADR-GX-021](../decisions/021-oq-from-runner-output.md), [ADR-BR-035](../../core/decisions/035-evidence-from-executed-tests.md)). This file owns BEH-GX-153–169 and uses all
seventeen.

> **What these checks do not show**
>
> A passing check shows that the companion behaved as specified in the
> companion's own test environment, against its fixtures and the real core.
> It shows nothing about the consumer's adapters, identity system, key
> management or infrastructure, which the consumer tests with the
> conformance suite and their own procedures. This is the consumer's
> obligation.

Planned tests: `packages/gxp/test/acceptance/` *(Planned)*, run against the
installed package through `GxpTestHost` ([19 — Testing Entry Point](./19-testing-entry-point.md)).
Every test carries the tag `@REQ-GX-nnn` of the check it evidences, and the
OQ evidence of [16 — OQ Evidence](./16-oq-evidence.md) reports each check as pass, fail,
skipped or not covered.

## BEH-GX-153: Required acceptance checks — storage, conformance, checks on read, anchors and sealing

> **Invariant:** [INV-GX-006](../invariants.md#inv-gx-006-one-primary-entry-per-record-and-per-host-sequence-number-and-no-stored-record-is-displaced), [INV-GX-007](../invariants.md#inv-gx-007-the-sink-acknowledges-only-what-the-store-reports-stored), [INV-GX-008](../invariants.md#inv-gx-008-no-companion-api-rewrites-a-stored-entry), [INV-GX-009](../invariants.md#inv-gx-009-a-finding-is-never-suppressed-or-upgraded), [INV-GX-016](../invariants.md#inv-gx-016-the-sink-never-refuses-a-record-for-a-condition-of-its-own)
> **See:** [ADR-GX-004](../decisions/004-append-only-trail-store.md), [ADR-GX-006](../decisions/006-conformance-through-testhost.md), [ADR-GX-007](../decisions/007-checks-never-claim-integrity.md), [ADR-GX-008](../decisions/008-high-water-anchors.md), [ADR-GX-029](../decisions/029-sealing-through-audit-chain.md), [ADR-BR-035](../../core/decisions/035-evidence-from-executed-tests.md)
> **Satisfies:** [URS-GX-001](../urs.md#urs-gx-001-store-audit-records-with-honest-acknowledgement), [URS-GX-002](../urs.md#urs-gx-002-show-that-a-trail-adapter-conforms), [URS-GX-003](../urs.md#urs-gx-003-detect-lost-duplicated-reordered-or-altered-stored-records), [URS-GX-004](../urs.md#urs-gx-004-detect-loss-of-the-newest-records), [URS-GX-005](../urs.md#urs-gx-005-optionally-detect-alteration-of-sealed-records)
> **Risk:** [RSK-GX-001](../gxp/03-risk-assessment.md#rsk-gx-001), [RSK-GX-002](../gxp/03-risk-assessment.md#rsk-gx-002), [RSK-GX-003](../gxp/03-risk-assessment.md#rsk-gx-003), [RSK-GX-004](../gxp/03-risk-assessment.md#rsk-gx-004), [RSK-GX-016](../gxp/03-risk-assessment.md#rsk-gx-016)
> **Regulatory:** supports 21 CFR 11.10(a), 11.10(c), 11.10(e); EU GMP Annex 11 §4.7, §7.1, §9

```
REQUIREMENT: The companion's test suite MUST contain at least one test, run
             against the installed package through `GxpTestHost` unless the
             check concerns a pure function, for each of the following:
             1. `trailSink` acknowledges a record only after `append` answered
                "stored" or "stored-collision", or "already-stored" for an
                entry equal to the one written; a store that fails or dies
                reaches core as
                `AuditWriteFailed` carrying no record content, a hung
                `append` is interrupted, and the call fails with
                `AuditUnavailable` after `auditTimeout` (BEH-GX-017 to
                BEH-GX-021; BEH-BR-203).
             2. A repeated append of a stored entry answers "already-stored"
                and stores nothing; an entry with the same `recordId` or the
                same `(hostId, auditSeq)` and different content answers
                "stored-collision" and is read back after the primary with
                `collision` set, and the first entry reads back
                byte-identical (BEH-GX-011, BEH-GX-012).
             3. The sink stores a record whose `schemaVersion` is not
                supported, or which has a field the schema does not define,
                marked `schema: "unsupported"`, and a record holding a lone
                surrogate with the escaped encoding, marked `canonical:
                "jcs-escaped"`; each call succeeds, core's latch is not set,
                and the record vector of BEH-GX-018 is reproduced
                (BEH-GX-007, BEH-GX-018, BEH-GX-019).
             4. Every conformance case 1 to 16 passes against
                `memoryTrailStore`; every `brokenTrailStore` variant fails
                each case listed for it; a store declared without reopen
                registers case 12 as a failing test, never as skipped
                (BEH-GX-025, BEH-GX-028, BEH-GX-146, BEH-GX-147).
             5. Two conformance runs with the same seed hand the store records
                equal in every field, and `conformance-manifest.json` lists
                every registered case and contains no result (BEH-GX-030,
                BEH-GX-031).
             6. Over a seeded corpus with defects at known positions,
                `checkTrailEntries` reports each `gap`, `duplicate` and
                `outOfOrder` through core's `verifyAuditSequence`, and each
                `digestMismatch` and `canonicalMismatch` independently
                (BEH-GX-034).
             7. `checkStoredTrail` gives the report of `checkTrailEntries`
                over the same range, finding for finding, with defects split
                across page boundaries; and fails with `TrailReadFailed` or
                `CheckCapacityExceeded` instead of reporting part of a range
                (BEH-GX-035).
             8. An entry of an unknown schema version is reported as
                `unknownSchemaVersion` and still takes part in the sequence
                and digest checks; `requestedWithoutTerminal`,
                `droppedSinceAck`, `auditDropped` (a rise and a decrease) and
                `noCleanClose` are reported; and the
                report's `statement` is exactly the text of BEH-GX-033, with
                the kinds not checked listed (BEH-GX-033, BEH-GX-036 to
                BEH-GX-038).
             9. `checkApprovals` reports `approvalWithoutRecord` for a
                consumed binding with no linked record and
                `recordWithoutApproval` for a gated record with no consumed
                binding, and reports nothing for the `rejected` record of a
                gate refusal for a missing or invalid ticket (BEH-GX-039).
             10. `recordHighWater` writes a mark when
                 `Host.controls.auditPosition` moves, and at close one from
                 the `CloseTail` of `HostControls.closed`, not from
                 `CloseReport.auditLastSeq`, covering the shutdown's terminal
                 record written after the report; after the newest entries
                 are removed from the store, `checkHighWater` reports
                 `tailLoss` for exactly that range, and `unanchoredTail` above
                 the highest mark (BEH-GX-042 to BEH-GX-046).
             11. With sealing on through `@bridger/audit-chain`, every stored
                 entry carries the link audit-chain computed and nothing of
                 the companion's own; `verifySeals` reports `chainBreak` at
                 an altered entry, `anchorMismatch` for each anchor that no
                 longer matches, `chainUnanchoredTail` above the last
                 confirmed anchor, `anchorUnconfirmed` for a receipt its
                 verifier cannot confirm, `chainLossCounterRose` (and no
                 `chainNonCanonical`) where `auditDropped` rises, and
                 `headMismatch` when the newest anchored windows
                 and receipts are removed below a high-water mark,
                 `anchorMismatch` "window-not-in-entries" when the newest
                 entries are removed and their receipts kept, and, with
                 `sealing.keyed` given, a `chainBreak` "unkeyed-link" for a
                 keyed trail rewritten with unkeyed links and a
                 `chainLinkUnchecked`, not a `chainBreak`, for a link whose
                 key `keyed` cannot supply, each with
                 the `ChainReport` attached unchanged; with no confirmed
                 anchor, no `chainBreak` and no `chainLinkUnchecked` it
                 states "The chain is internally consistent; no anchor
                 confirms it.", and with a `chainLinkUnchecked` and no
                 `chainBreak` it does not; with sealing off the seal kinds,
                 `chainLinkUnchecked` among them, are listed as not checked;
                 with `SealingOptions.keyed` whose `mac` fails with
                 `KeyedHashFailed`, the call fails with `AuditWriteFailed`
                 whose message is "keyed hasher unavailable
                 (@bridger/audit-chain)", `store.append` is not called, and
                 the sink counts one "keyed-hash-failed" outcome and nothing
                 else for the attempt (BEH-GX-019, BEH-GX-022, BEH-GX-024,
                 BEH-GX-170 to BEH-GX-174).
```

These are the checks the trail side of the companion depends on: an
acknowledgement that means stored, a retry that cannot duplicate, a suite that
can fail, and checks that name each defect they find. Each one exercises the
path a consumer's host takes — core's writer, its retries and its latch —
rather than the companion's functions in isolation.

## BEH-GX-154: Required acceptance checks — tickets, signatures, the gate, fingerprints, evidence and export

> **Invariant:** [INV-GX-002](../invariants.md#inv-gx-002-a-binding-is-consumed-at-most-once), [INV-GX-003](../invariants.md#inv-gx-003-an-allowed-call-holds-a-valid-binding-with-an-equal-digest), [INV-GX-004](../invariants.md#inv-gx-004-the-approver-is-never-the-requester), [INV-GX-010](../invariants.md#inv-gx-010-evidence-results-come-only-from-runner-output-and-gaps-stay-gaps), [INV-GX-011](../invariants.md#inv-gx-011-every-port-failure-on-a-decision-path-refuses), [INV-GX-015](../invariants.md#inv-gx-015-every-signed-binding-carries-a-manifestation)
> **See:** [ADR-GX-010](../decisions/010-sign-first-then-call.md), [ADR-GX-013](../decisions/013-single-use-tickets.md), [ADR-GX-016](../decisions/016-signature-port-and-manifestation.md), [ADR-GX-017](../decisions/017-hmac-through-the-core-port.md), [ADR-GX-020](../decisions/020-iq-proof-and-probe.md), [ADR-GX-022](../decisions/022-evidence-pack-format.md), [ADR-GX-023](../decisions/023-archives-keep-original-bytes.md)
> **Satisfies:** [URS-GX-006](../urs.md#urs-gx-006-approve-a-change-before-it-is-made), [URS-GX-007](../urs.md#urs-gx-007-bind-an-approval-to-exactly-the-change-approved), [URS-GX-008](../urs.md#urs-gx-008-show-who-signed-when-and-with-what-meaning), [URS-GX-009](../urs.md#urs-gx-009-link-each-signature-to-the-change-it-approved), [URS-GX-010](../urs.md#urs-gx-010-keep-requester-and-approver-apart), [URS-GX-011](../urs.md#urs-gx-011-compare-configuration-values-without-revealing-them), [URS-GX-012](../urs.md#urs-gx-012-manage-fingerprint-keys), [URS-GX-013](../urs.md#urs-gx-013-produce-installation-evidence), [URS-GX-014](../urs.md#urs-gx-014-produce-operational-evidence-that-shows-gaps), [URS-GX-015](../urs.md#urs-gx-015-export-and-archive-a-trail-with-its-approvals)
> **Risk:** [RSK-GX-006](../gxp/03-risk-assessment.md#rsk-gx-006), [RSK-GX-008](../gxp/03-risk-assessment.md#rsk-gx-008), [RSK-GX-009](../gxp/03-risk-assessment.md#rsk-gx-009), [RSK-GX-010](../gxp/03-risk-assessment.md#rsk-gx-010), [RSK-GX-013](../gxp/03-risk-assessment.md#rsk-gx-013), [RSK-GX-015](../gxp/03-risk-assessment.md#rsk-gx-015), [RSK-GX-016](../gxp/03-risk-assessment.md#rsk-gx-016), [RSK-GX-021](../gxp/03-risk-assessment.md#rsk-gx-021), [RSK-GX-022](../gxp/03-risk-assessment.md#rsk-gx-022)
> **Regulatory:** supports 21 CFR 11.10(b), 11.10(f), 11.10(g), 11.50, 11.70; EU GMP Annex 11 §4.4, §4.7, §14, §17

```
REQUIREMENT: The companion's test suite MUST also contain at least one test,
             run as BEH-GX-153 states, for each of the following:
             12. `bindingDigest` reproduces the five vectors of BEH-GX-066,
                 and `bindingOf` over a proposal, the request core passes to
                 the gate and the call's `requested` or `rejected` record
                 gives one digest, and over a terminal record gives None
                 (BEH-GX-066, BEH-GX-082).
             13. `issueTicket` refuses each case of `IssueRefused`, stores the
                 `issued` event and one `signed` event per accepted signature,
                 and after a declined or failed capture leaves the ticket
                 `issued` with earlier signatures kept (BEH-GX-069,
                 BEH-GX-077).
             14. A captured signature is refused, and nothing recorded, when
                 its signer is the requester, a repeated signer or begins with
                 "bridger:", when its meaning or rendered digest differs from
                 the request, when `components` is below 2 for a non-biometric
                 method, or when `reauthenticated` is not `true`; an accepted
                 one has `signedAt` equal to the `TestClock` reading
                 (BEH-GX-075, BEH-GX-076, BEH-GX-078).
             15. The rendered text shows each binding's operation, target,
                 bound definition, paths, requester id, bound `onBehalfOf`,
                 `undo`, `cold` and `requestOnly` fields and bound reason,
                 ends with the meaning text and `notAfter`, and shows only
                 the word "fingerprinted" for a fingerprinted path, and
                 `renderManifestation` gives exactly the sentence of
                 BEH-GX-085 (BEH-GX-074, BEH-GX-085).
             16. The gate refuses with each of the eleven reasons when, and
                 only when, its condition holds, with the first in step order
                 when several hold; each refusal reaches core as
                 `OperationRejected` with the bare code and leaves one
                 `rejected` record (BEH-GX-090, BEH-GX-091; BEH-BR-220).
             17. Two concurrent calls citing one binding, on one host and on
                 two hosts sharing the ticket store, give exactly one allow
                 and one stored `consumed` event; the other is refused
                 "binding-consumed"; a binding stays consumed after its call
                 fails (BEH-GX-071, BEH-GX-093).
             18. With a ticket store that fails, dies, hangs past the deadline
                 or answers "commit-then-fail", the gate refuses
                 "ticket-store-unavailable" no later than its deadline and
                 before core's `gateTimeout`; an unattached gate refuses
                 every request (BEH-GX-089, BEH-GX-091, BEH-GX-093,
                 BEH-GX-094).
             19. A `reconcile` citing a bundle consumes one binding per
                 matching entry, refuses a non-matching entry alone so that it
                 appears in `ReconcileReport.rejected`, and leaves the unused
                 bindings open (BEH-GX-072, BEH-GX-096; BEH-BR-222).
             20. An exempt rule allows only after the `exempted` event is
                 stored and refuses "ticket-store-unavailable" when that
                 append fails; `attach` stores one `policy-activated` event
                 (BEH-GX-095).
             21. `linkApprovals` links each consumption to its record by the
                 triple of BEH-GX-081, reports "burned" for a call that failed
                 and for a consumption linked to a `rejected` record, and
                 reports a signature copied into another ticket as
                 `signatureTransferred` without counting it (BEH-GX-081 to
                 BEH-GX-087; REQ-BR-058).
             22. `hmacFingerprinter` reproduces the three vectors of
                 BEH-GX-101; `select` returns only eligible paths in candidate
                 order; and on a `TestHost` the call's request and both
                 records carry those fingerprints (BEH-GX-097 to BEH-GX-101;
                 REQ-BR-055).
             23. A value outside the domain, a path not selected, a failing
                 key provider, an invalid key id and a test key without the
                 fixture marker each fail with their fixed tag, and core fails
                 the call with `ConfigFingerprintUnavailable` before the gate,
                 writing no record (BEH-GX-100, BEH-GX-106, BEH-GX-107;
                 REQ-BR-056).
             24. `proposeFingerprints` equals the call's fingerprints for the
                 vectors and a seeded sample of schemas; after `rotate`, a
                 ticket binding fingerprints signed before it is refused
                 "stale-fingerprint-key" and is listed by `staleTickets`
                 (BEH-GX-102, BEH-GX-109).
             25. `matchesFingerprint` answers "match" and "no-match" under the
                 key that made a fingerprint, "key-retired-unavailable" after
                 that key is destroyed, and refuses a path the eligibility
                 list does not admit and a malformed fingerprint (BEH-GX-108,
                 BEH-GX-110).
             26. `runInstallationChecks` on a `GxpTestHost` reports IQ-01 to
                 IQ-24 and IQ-U1 to IQ-U10 in order, with IQ-10, IQ-11 and
                 IQ-15 failing because fixtures are wired, and the
                 `Host.controls` snapshot recorded; on a host with
                 `gateTimeout: "forever"` and an explicit gate deadline,
                 IQ-19 fails; on a host reporting `idGenerator` "provided",
                 IQ-22 is "not-executed" without `idDraw`, fails with the
                 first repeated value when `idDraw.generators` holds the
                 `IdGenerator` services of two `TestHost.counterIdGenerator`
                 layers built with one prefix, and passes with two distinct
                 prefixes (BEH-GX-113 to
                 BEH-GX-120; REQ-BR-057; core BEH-BR-210).
             27. `collectOqEvidence` gives the exact outcome of every item of
                 the known-bad corpus; `buildEvidencePack` run twice on the
                 same inputs and `generatedAt` gives byte-identical packs
                 with one pack digest; `diffPacks` lists a requirement
                 that lost its only test as changed; and
                 `captureRunEnvironment` leaves a package out of `packages`
                 when `resolve` throws for it, or when `resolve` points at a
                 different real path than the one resolved from
                 `packageRoot`, and that run raises `package-mismatch`
                 (BEH-GX-121 to BEH-GX-136).
             28. Every line of `trail.jsonl` equals the stored `canonical`
                 text byte for byte; after one line is edited, `readArchive`
                 reports the file's digest difference and a `digestMismatch`
                 for that entry, from its own run, whatever the archived check
                 report says. For a sealed archive with `range: "all"`,
                 `readArchive` given an offline receipt verifier and pinned
                 trust roots that confirm the receipts reports no
                 `anchorUnconfirmed` and a `verifiedThrough` above 0, and
                 without them reports every receipt as `anchorUnconfirmed`;
                 after the newest entries are removed from the store with the
                 receipts of their windows before export, it reports `headMismatch`
                 against the `expectedHeads` the inspector passes, and
                 without them it lists `headMismatch` as not checked, whatever
                 `anchors.jsonl` holds; over an archive whose `requested`
                 range starts above `auditSeq` 1 it reports a `chainBreak` at
                 an altered entry inside the range and none at the first
                 archived entry, a `chainLinkUnchecked` "link not checked:
                 previous entry outside the archive" at that first entry, an
                 `anchorUnconfirmed` "... previous statement outside the
                 archive" for the host's first confirmed statement when
                 audit-chain reports it "previous-mismatch" or "window-gap",
                 also when the first receipt the bundle holds is not
                 confirmed,
                 and lists `chainUnanchoredTail` as not
                 checked, and a window ending above the `requested` `toSeq`
                 or starting below its `fromSeq` is one `anchorUnconfirmed`,
                 both with the chain report attached unchanged (BEH-GX-137
                 to BEH-GX-140, BEH-GX-171).
```

These are the approval, fingerprint and evidence paths. Several of them only
make sense end to end: an approval is worth something only if the gate refuses
everything but the approved change and the link report shows afterwards which
change it was, so the checks drive the issuer, the gate, core and the checks
on read in one test wherever the behaviour spans them.

## BEH-GX-155: Required acceptance checks — dependencies and the main entry point

> **Invariant:** [INV-GX-001](../invariants.md#inv-gx-001-no-decision-port-has-a-default-outside-the-testing-entry-point)
> **See:** [ADR-GX-001](../decisions/001-separate-package.md), [ADR-GX-003](../decisions/003-ports-without-defaults.md), [ADR-GX-025](../decisions/025-core-version-range.md)
> **Satisfies:** [URS-GX-016](../urs.md#urs-gx-016-know-which-obligations-remain-mine), [NFR-GX-002](../urs.md#nfr-gx-002-minimal-dependencies)
> **Risk:** [RSK-GX-017](../gxp/03-risk-assessment.md#rsk-gx-017), [RSK-GX-019](../gxp/03-risk-assessment.md#rsk-gx-019)
> **Regulatory:** supports GAMP 5 supplier documentation of software components; EU GMP Annex 11 §4.5

```
REQUIREMENT: The companion's test suite MUST contain at least one test, run as
             BEH-GX-153 states, for the following:
             29. The packed `@bridger/gxp` declares `effect` and
                 `@bridger/core` as its only runtime dependencies, both as
                 peers, with the core range of the compatibility row, and
                 `@bridger/audit-chain` as an optional peer with the
                 audit-chain range of that row, imported only by
                 `@bridger/gxp/sealing`, the main entry point loading without
                 it installed; no core
                 source file imports the companion; and the main entry point
                 exports no implementation of `TrailStore`, `AnchorStore`,
                 `TicketStore`, `SignatureCapture`, `FingerprintKeyProvider`
                 or `FingerprintEligibility`, and no policy (BEH-GX-001,
                 BEH-GX-003, BEH-GX-170).
```

A static check over the packed artifact, not the source tree, is the only test
of what a consumer actually installs; it is the companion's half of core's own
dependency check.

## BEH-GX-156: Required acceptance checks — GxpLayer assembly

> **Invariant:** [INV-GX-001](../invariants.md#inv-gx-001-no-decision-port-has-a-default-outside-the-testing-entry-point), [INV-GX-011](../invariants.md#inv-gx-011-every-port-failure-on-a-decision-path-refuses)
> **See:** [ADR-GX-003](../decisions/003-ports-without-defaults.md)
> **Satisfies:** [URS-GX-016](../urs.md#urs-gx-016-know-which-obligations-remain-mine), [URS-GX-006](../urs.md#urs-gx-006-approve-a-change-before-it-is-made)
> **Risk:** [RSK-GX-017](../gxp/03-risk-assessment.md#rsk-gx-017), [RSK-GX-011](../gxp/03-risk-assessment.md#rsk-gx-011)
> **Regulatory:** supports EU GMP Annex 11 §4.4 (a stated configuration)

```
REQUIREMENT: The companion's test suite MUST contain at least one test, run as
             BEH-GX-153 states, for the following:
             30. Omitting any key of `GxpLayer.make`'s options, or of a used
                 section, fails to compile (a type-level test); a section
                 given as "not-used" provides no port, and a scripted run then
                 produces the same outcomes, snapshots and events as on a host
                 with that core port unwired (BEH-GX-004; INV-BR-026).
```

"not-used" is the line in an assembly a reviewer reads; the check shows both
that it cannot be forgotten silently and that it changes nothing in core.

## BEH-GX-157: Required acceptance checks — no value, key or port text in any output

> **Invariant:** [INV-GX-005](../invariants.md#inv-gx-005-no-configuration-value-or-key-material-appears-in-any-companion-output)
> **See:** [ADR-GX-017](../decisions/017-hmac-through-the-core-port.md), [ADR-GX-019](../decisions/019-key-provider-and-rotation.md)
> **Satisfies:** [URS-GX-011](../urs.md#urs-gx-011-compare-configuration-values-without-revealing-them), [NFR-GX-007](../urs.md#nfr-gx-007-no-secrets-in-any-output)
> **Risk:** [RSK-GX-014](../gxp/03-risk-assessment.md#rsk-gx-014), [RSK-GX-013](../gxp/03-risk-assessment.md#rsk-gx-013)
> **Regulatory:** supports EU GMP Annex 11 §12.1; 21 CFR 11.10(d)

```
REQUIREMENT: The companion's test suite MUST contain at least one test, run as
             BEH-GX-153 states, for the following:
             31. With a `Redacted` canary value on an eligible "high" path, a
                 canary key in the key provider, and every port answering
                 errors whose text contains a canary marker, a scripted run
                 through approvals, fingerprinting, checks, IQ, OQ, an
                 evidence pack and an export leaves none of the three canaries
                 (the key in hexadecimal or base64 too) in any log line,
                 span, metric, error, record, ticket, report, pack or archive
                 (BEH-GX-006, BEH-GX-103, BEH-GX-111).
```

One run with three canaries covers the three ways a secret can leave: the
value itself, the key, and a port's error message quoting either.

## BEH-GX-158: Required acceptance checks — fail closed on every decision path

> **Invariant:** [INV-GX-011](../invariants.md#inv-gx-011-every-port-failure-on-a-decision-path-refuses)
> **See:** [ADR-GX-003](../decisions/003-ports-without-defaults.md), [ADR-GX-010](../decisions/010-sign-first-then-call.md)
> **Satisfies:** [URS-GX-006](../urs.md#urs-gx-006-approve-a-change-before-it-is-made), [NFR-GX-008](../urs.md#nfr-gx-008-gate-decision-within-its-deadline)
> **Risk:** [RSK-GX-010](../gxp/03-risk-assessment.md#rsk-gx-010), [RSK-GX-021](../gxp/03-risk-assessment.md#rsk-gx-021)
> **Regulatory:** supports 21 CFR 11.10(e), 11.10(f); EU GMP Annex 11 §12.1

```
REQUIREMENT: The companion's test suite MUST contain at least one test, run as
             BEH-GX-153 states, for the following:
             32. For each path of the table of BEH-GX-005, a port that fails,
                 dies, hangs or answers malformed data ends in the refusal
                 shown — `AuditWriteFailed`, "ticket-store-unavailable",
                 `ConfigFingerprintFailed`, `SignatureCaptureFailed` — and
                 never in an acknowledgement, an allow, a fingerprint or a
                 recorded signature; no companion function retries a call
                 whose first attempt may have taken effect, except
                 `TrailStore.append` through core (BEH-GX-005).
```

This is the property every other control rests on; it is checked path by path
because a single path that fails open is enough to make the rest decorative.

## BEH-GX-159: Required acceptance checks — core version and record shape

> **See:** [ADR-GX-025](../decisions/025-core-version-range.md)
> **Satisfies:** [URS-GX-016](../urs.md#urs-gx-016-know-which-obligations-remain-mine), [URS-GX-003](../urs.md#urs-gx-003-detect-lost-duplicated-reordered-or-altered-stored-records)
> **Risk:** [RSK-GX-019](../gxp/03-risk-assessment.md#rsk-gx-019)
> **Regulatory:** supports EU GMP Annex 11 §10

```
REQUIREMENT: The companion's test suite MUST contain at least one test, run as
             BEH-GX-153 states, for the following:
             33. Building `GxpLayer` against a core whose exported version
                 lies outside the compatibility row fails with
                 `GxpCoreVersionUnsupported` naming the version found and the
                 supported range, and starts nothing (BEH-GX-004,
                 BEH-GX-007).
```

The range is narrow on purpose; this check makes sure it is enforced where the
layer is built, not only in the package manager's resolution.

## BEH-GX-160: Required acceptance checks — policy validation and matching

> **Invariant:** [INV-GX-003](../invariants.md#inv-gx-003-an-allowed-call-holds-a-valid-binding-with-an-equal-digest)
> **See:** [ADR-GX-014](../decisions/014-deny-by-default-policy.md)
> **Satisfies:** [URS-GX-006](../urs.md#urs-gx-006-approve-a-change-before-it-is-made)
> **Risk:** [RSK-GX-011](../gxp/03-risk-assessment.md#rsk-gx-011), [RSK-GX-007](../gxp/03-risk-assessment.md#rsk-gx-007)
> **Regulatory:** supports 21 CFR 11.10(f); EU GMP Annex 11 §10, §12.1

```
REQUIREMENT: The companion's test suite MUST contain at least one test, run as
             BEH-GX-153 states, for the following:
             34. Each invalid policy of 08 — a field missing; an exempt rule
                 with a justification under 20 characters or covering every
                 operation; a rule naming `shutdown`, `reconcile` or a
                 system transition;
                 no rule for `acknowledgeAuditDegraded`; `requireDigest` with
                 `defineRealm` or `acknowledgeAuditDegraded`;
                 `requireFingerprints` misplaced; `signatures`, `meanings` or
                 `validity` out of range; duplicate rule ids — fails the
                 layer with `GxpLayerInvalid` naming the rule `id`, where
                 there is one, and the field; a request no
                 rule matches requires a ticket under the defaults; and the
                 first matching rule decides (BEH-GX-057 to BEH-GX-064).
```

The policy is the place where a deny-by-default design is most easily undone;
each refusal here is a configuration mistake caught before the host exists.

## BEH-GX-161: Required acceptance checks — ticket lifecycle and window

> **Invariant:** [INV-GX-002](../invariants.md#inv-gx-002-a-binding-is-consumed-at-most-once)
> **See:** [ADR-GX-013](../decisions/013-single-use-tickets.md)
> **Satisfies:** [URS-GX-006](../urs.md#urs-gx-006-approve-a-change-before-it-is-made)
> **Risk:** [RSK-GX-006](../gxp/03-risk-assessment.md#rsk-gx-006), [RSK-GX-018](../gxp/03-risk-assessment.md#rsk-gx-018)
> **Regulatory:** supports 21 CFR 11.10(e), 11.10(f); EU GMP Annex 11 §12.1

```
REQUIREMENT: The companion's test suite MUST contain at least one test, run as
             BEH-GX-153 states, for the following:
             35. A ticket's state follows from its events alone; it is usable
                 at `notAfter` minus 1 ms and refused at `notAfter` and before
                 `notBefore` under `TestClock`; `revokeTicket` refuses a
                 reserved actor, a blank reason and a final ticket, and leaves
                 already-consumed bindings consumed; and concurrent appends at
                 one version store exactly one event (BEH-GX-067, BEH-GX-068,
                 BEH-GX-070).
```

The window is exact, without tolerance, so the test places the clock on both
sides of each boundary.

## BEH-GX-162: Required acceptance checks — caller interruption at the gate

> **Invariant:** [INV-GX-002](../invariants.md#inv-gx-002-a-binding-is-consumed-at-most-once), [INV-GX-003](../invariants.md#inv-gx-003-an-allowed-call-holds-a-valid-binding-with-an-equal-digest)
> **See:** [ADR-GX-010](../decisions/010-sign-first-then-call.md), [ADR-GX-013](../decisions/013-single-use-tickets.md)
> **Satisfies:** [URS-GX-006](../urs.md#urs-gx-006-approve-a-change-before-it-is-made), [URS-GX-009](../urs.md#urs-gx-009-link-each-signature-to-the-change-it-approved)
> **Risk:** [RSK-GX-006](../gxp/03-risk-assessment.md#rsk-gx-006), [RSK-GX-022](../gxp/03-risk-assessment.md#rsk-gx-022)
> **Regulatory:** supports 21 CFR 11.10(e), 11.70

```
REQUIREMENT: The companion's test suite MUST contain at least one test, run as
             BEH-GX-153 states, for the following:
             36. A caller interrupted while the gate decides gets core's
                 `rejected` record "caller-interrupted" and no change; the
                 gate starts no append after the interruption; and a
                 consumption whose append was already in flight is reported
                 "burned" by `linkApprovals` (BEH-GX-096, BEH-GX-087;
                 BEH-BR-221).
```

Interruption is the one moment where the gate's record and core's record can
disagree; the check makes the disagreement visible rather than impossible to
observe.

## BEH-GX-163: Required acceptance checks — no caching at the gate

> **Invariant:** [INV-GX-003](../invariants.md#inv-gx-003-an-allowed-call-holds-a-valid-binding-with-an-equal-digest)
> **See:** [ADR-GX-010](../decisions/010-sign-first-then-call.md)
> **Satisfies:** [URS-GX-006](../urs.md#urs-gx-006-approve-a-change-before-it-is-made)
> **Risk:** [RSK-GX-006](../gxp/03-risk-assessment.md#rsk-gx-006)
> **Regulatory:** supports 21 CFR 11.10(f)

```
REQUIREMENT: The companion's test suite MUST contain at least one test, run as
             BEH-GX-153 states, for the following:
             37. Two identical calls are each decided from the ticket store at
                 their own time: a ticket revoked between them refuses the
                 second as "ticket-revoked", and a store that fails between
                 them refuses the second as "ticket-store-unavailable"
                 (BEH-GX-096; BEH-BR-218).
```

A cache is the simplest optimisation and the simplest bypass; two calls with a
change in between show that none exists.

## BEH-GX-164: Required acceptance checks — the canonical form across platforms

> **Invariant:** [INV-GX-012](../invariants.md#inv-gx-012-the-canonical-form-is-deterministic-across-platforms)
> **See:** [ADR-GX-005](../decisions/005-jcs-and-sha256.md)
> **Satisfies:** [NFR-GX-001](../urs.md#nfr-gx-001-deterministic-outputs)
> **Risk:** [RSK-GX-015](../gxp/03-risk-assessment.md#rsk-gx-015)
> **Regulatory:** supports EU GMP Annex 11 §4.7

```
REQUIREMENT: The companion's test suite MUST contain at least one test, run as
             BEH-GX-153 states, for the following:
             38. On every runtime of the companion's test matrix, the vectors
                 of BEH-GX-066 and BEH-GX-101 reproduce, canonicalisation
                 refuses each value outside the domain of BEH-GX-002 with
                 `CanonicalisationFailed` naming its position only, and a
                 seeded sample of records gives the same canonical text and
                 digest everywhere (BEH-GX-002, BEH-GX-066, BEH-GX-101).
```

Issuer and gate, sink and checker may run on different runtimes; the vectors
are the shared ground truth they are tested against.

## BEH-GX-165: Required acceptance checks — bounded memory on read

> **Invariant:** [INV-GX-009](../invariants.md#inv-gx-009-a-finding-is-never-suppressed-or-upgraded)
> **See:** [ADR-GX-007](../decisions/007-checks-never-claim-integrity.md)
> **Satisfies:** [URS-GX-003](../urs.md#urs-gx-003-detect-lost-duplicated-reordered-or-altered-stored-records), [URS-GX-015](../urs.md#urs-gx-015-export-and-archive-a-trail-with-its-approvals), [NFR-GX-006](../urs.md#nfr-gx-006-bounded-memory-on-read)
> **Risk:** [RSK-GX-004](../gxp/03-risk-assessment.md#rsk-gx-004)
> **Regulatory:** supports EU GMP Annex 11 §9, §17

```
REQUIREMENT: The companion's test suite MUST contain at least one test, run as
             BEH-GX-153 states, for the following:
             39. `checkStoredTrail`, `listConsumptions`, and `exportTrail`
                 and `readArchive` of an unsealed export, over a seeded trail
                 of 1,000,000 entries and a ticket log of 1,000,000 events
                 citing few tickets, complete with heap growth below a fixed
                 bound set in the test, independent of the trail's and the
                 log's length. The paths that take the chain whole —
                 `verifySeals`, and a sealed `exportTrail` and `readArchive` —
                 complete over `maxEntries` entries and fail with
                 `CheckCapacityExceeded`, producing no partial report or
                 archive, over `maxEntries` + 1 (BEH-GX-035, BEH-GX-084,
                 BEH-GX-137, BEH-GX-140, BEH-GX-171).
```

A check that works on a test trail and exhausts memory on a production one
fails exactly when it is needed; the bound is measured, not assumed.

## BEH-GX-166: Required acceptance checks — wording of every report

> **See:** [ADR-GX-027](../decisions/027-claims-and-non-claims.md), [ADR-GX-007](../decisions/007-checks-never-claim-integrity.md)
> **Satisfies:** [URS-GX-016](../urs.md#urs-gx-016-know-which-obligations-remain-mine)
> **Risk:** [RSK-GX-004](../gxp/03-risk-assessment.md#rsk-gx-004)
> **Regulatory:** supports (by delimiting) 21 CFR 11.10, 11.50, 11.70; EU GMP Annex 11 §9

```
REQUIREMENT: The companion's test suite MUST contain at least one test, run as
             BEH-GX-153 states, for the following:
             40. Every report, statement and rendering a scripted run produces
                 contains the fixed sentences its behaviour requires —
                 BEH-GX-032, BEH-GX-033, BEH-GX-036, BEH-GX-047, BEH-GX-062,
                 BEH-GX-088, BEH-GX-104, BEH-GX-115, BEH-GX-120, BEH-GX-124,
                 BEH-GX-130, BEH-GX-134, BEH-GX-138, BEH-GX-141, BEH-GX-172,
                 BEH-GX-173 — and, outside a negated sentence, none of the
                 words ADR-GX-027 forbids (BEH-GX-008).
```

The honest-claims rule is checked in the specification by the checker; this
check carries it into the outputs the software writes, where a reader actually
meets it.

## BEH-GX-167: Required acceptance checks — fixtures

> **Invariant:** [INV-GX-014](../invariants.md#inv-gx-014-test-fixtures-are-detectable), [INV-GX-001](../invariants.md#inv-gx-001-no-decision-port-has-a-default-outside-the-testing-entry-point)
> **See:** [ADR-GX-024](../decisions/024-fixtures-are-marked.md)
> **Satisfies:** [URS-GX-016](../urs.md#urs-gx-016-know-which-obligations-remain-mine), [URS-GX-013](../urs.md#urs-gx-013-produce-installation-evidence)
> **Risk:** [RSK-GX-017](../gxp/03-risk-assessment.md#rsk-gx-017)
> **Regulatory:** supports EU GMP Annex 11 §4.7; 21 CFR 11.10(d)

```
REQUIREMENT: The companion's test suite MUST contain at least one test, run as
             BEH-GX-153 states, for the following:
             41. Every port built by `@bridger/gxp/testing` has `fixture:
                 true` in its manifest; `scriptedSignatureCapture` without
                 `decide` fails to compile; `testKeyProvider` gives the same
                 key ids and fingerprints for the same seed, all beginning
                 "test:"; and an installation wiring any companion fixture
                 fails IQ-11 (BEH-GX-118, BEH-GX-145 to BEH-GX-152).
```

The fixtures are the parts most likely to reach production by accident; the
check shows each is marked and that the mark is acted on.

## BEH-GX-168: Required acceptance checks — the acceptance suite's own evidence

> **Invariant:** [INV-GX-010](../invariants.md#inv-gx-010-evidence-results-come-only-from-runner-output-and-gaps-stay-gaps)
> **See:** [ADR-GX-021](../decisions/021-oq-from-runner-output.md), [ADR-GX-028](../decisions/028-checker-copy-and-adapt.md)
> **Satisfies:** [URS-GX-014](../urs.md#urs-gx-014-produce-operational-evidence-that-shows-gaps), [NFR-GX-003](../urs.md#nfr-gx-003-coverage), [NFR-GX-004](../urs.md#nfr-gx-004-mutation-testing), [NFR-GX-005](../urs.md#nfr-gx-005-specification-integrity)
> **Risk:** [RSK-GX-016](../gxp/03-risk-assessment.md#rsk-gx-016)
> **Regulatory:** supports EU GMP Annex 11 §4.7; GAMP 5 supplier testing

```
REQUIREMENT: The companion's test suite MUST contain at least one test, run as
             BEH-GX-153 states, for the following:
             42. Running the companion's suite against the installed package
                 and passing its output to `collectOqEvidence` reports every
                 requirement REQ-GX-001 to REQ-GX-047 as pass, with no
                 deviation of kind `unknown-requirement`, `package-mismatch`
                 or `environment-incomplete`; line and branch coverage
                 of `packages/gxp` reach 95% and the mutation score 80%
                 (BEH-GX-121 to BEH-GX-128; NFR-GX-003, NFR-GX-004).
```

The last check closes the loop: the companion's own release evidence is
produced by the generator it specifies, from the runner's output, and a check
of this file with no executed test appears as "not covered" rather than
disappearing.

## BEH-GX-169: Required acceptance checks — the sink's marks, the trail gate, record pairing and binding version 2

> **Invariant:** [INV-GX-016](../invariants.md#inv-gx-016-the-sink-never-refuses-a-record-for-a-condition-of-its-own), [INV-GX-006](../invariants.md#inv-gx-006-one-primary-entry-per-record-and-per-host-sequence-number-and-no-stored-record-is-displaced), [INV-GX-003](../invariants.md#inv-gx-003-an-allowed-call-holds-a-valid-binding-with-an-equal-digest), [INV-GX-009](../invariants.md#inv-gx-009-a-finding-is-never-suppressed-or-upgraded)
> **See:** [ADR-GX-030](../decisions/030-sink-marks-and-gate-refuses.md), [ADR-GX-029](../decisions/029-sealing-through-audit-chain.md), [ADR-GX-012](../decisions/012-binding-contents.md), [ADR-BR-035](../../core/decisions/035-evidence-from-executed-tests.md)
> **Satisfies:** [URS-GX-001](../urs.md#urs-gx-001-store-audit-records-with-honest-acknowledgement), [URS-GX-003](../urs.md#urs-gx-003-detect-lost-duplicated-reordered-or-altered-stored-records), [URS-GX-007](../urs.md#urs-gx-007-bind-an-approval-to-exactly-the-change-approved), [URS-GX-009](../urs.md#urs-gx-009-link-each-signature-to-the-change-it-approved)
> **Risk:** [RSK-GX-019](../gxp/03-risk-assessment.md#rsk-gx-019), [RSK-GX-023](../gxp/03-risk-assessment.md#rsk-gx-023), [RSK-GX-003](../gxp/03-risk-assessment.md#rsk-gx-003), [RSK-GX-006](../gxp/03-risk-assessment.md#rsk-gx-006)
> **Regulatory:** supports 21 CFR 11.10(e), 11.10(f), 11.70; EU GMP Annex 11 §9, §14

```
REQUIREMENT: The companion's test suite MUST contain at least one test, run as
             BEH-GX-153 states, for each of the following:
             43. With `trailGate` used, a stored entry marked
                 `schema: "unsupported"`, one marked `canonical:
                 "jcs-escaped"`, a "stored-collision" answer and an
                 unconfirmed "already-stored" answer each raise their count
                 in `TrailSinkStatus`; the next operator call not in `allow`
                 is refused with "trail: <reason>" and leaves one `rejected`
                 record, which the sink stores; system transitions and the
                 refused call's records are stored; with every piece
                 "not-used" no `OperationGate` is provided (BEH-GX-176 to
                 BEH-GX-178).
             44. A call refused by "trail" or "chain" consumes no binding: a
                 later call citing the same ticket, after the host is rebuilt,
                 is allowed by "approval"; with `GxpTestHost.make` given
                 `gatePieces`, the consumer's pieces are consulted after
                 "chain" and before "approval", a piece that refuses or
                 returns `Defer` ends the consultation with "<name>: <reason>"
                 or "<name>: deferred" and consumes no binding, and a piece
                 with a blank or reserved `name` or a non-finite `timeout`
                 fails the layer with `GxpLayerInvalid` "gatePieces"
                 (BEH-GX-178, BEH-GX-089, BEH-GX-151).
             45. Over seeded traces, a `superseded` terminal pairs with its
                 request whatever its `causationId`, a `joined` terminal pairs
                 by its `causationId` and a resumer's `completed` record by
                 its own correlation, and none of them is reported as
                 `requestedWithoutTerminal` (BEH-GX-037; BEH-BR-200).
             46. `bindingOf` gives one version 2 digest from a proposal and a
                 request carrying `onBehalfOf`, `undo: true`, `cold: true`, a
                 manifest, `allowChildren` and `mandatoryInterceptions`;
                 changing any one of them refuses the call, and a ticket
                 approved without `cold` is refused for a cold call; the record-side link holds with
                 `requestOnly` taken from the consumed binding and its
                 rendering says those fields were matched by the gate only;
                 changing a gate-flow annotation or `previousManifest` changes
                 nothing (BEH-GX-065, BEH-GX-082, BEH-GX-083).
             47. The installation check IQ-23 reports whether `trailGate` and
                 audit-chain's `ChainGate` are used, failing when either
                 differs from `expected.sections`, with the fixed statement
                 for a `trailGate` given "not-used", and an evidence pack
                 built with the sink's status carries its counts in
                 `sink-status.json` (BEH-GX-179, BEH-GX-175, BEH-GX-118,
                 BEH-GX-129).
```

These checks are the executable form of the re-baseline of CCR-GX-002: a sink
that keeps recording through conditions it used to refuse, a gate that stops
changes instead, a pairing rule that follows core's records, and a binding
that covers the fields core added to the request.

---

_Previous: [19 — Testing Entry Point](./19-testing-entry-point.md)_ · _Next: [Invariants](../invariants.md)_
