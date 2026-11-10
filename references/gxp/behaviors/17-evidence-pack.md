# 17 — Evidence Pack

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-GX-BEH-17                                            |
> | Revision       | 0.4                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-GX-03 §5)           |
> | Approved by    | — (pending; single maintainer, see PROC-GX-03 §5)            |
> | Classification | Functional Specification                                     |
> | Change History | 0.4 (2026-11-10): BEH-GX-129 the layout lists `assessments.json` and `signatures.json`, written only by `assessDeviation` and `signEvidencePack`, outside the manifest's file list (audit round 3, Low) (CCR-GX-006)<br>0.3 (2026-11-10): BEH-GX-129 input `sinkStatus` and file `sink-status.json`, the trail sink's counts (BEH-GX-179) (H7); follow-up: `EvidenceWriteFailed`, `AssessmentRefused`, `EvidenceReadFailed` declared as `Schema.TaggedError`, as raised (CCR-GX-005)<br>0.2 (2026-11-09): Reference to sealing scope moved to BEH-GX-174 (C-09) (CCR-GX-002)<br>0.1 (2026-10-03): Initial draft (CCR-GX-001)                 |

---

Installation results ([15 — Installation Checks](./15-installation-checks.md)), operational
results ([16 — OQ Evidence](./16-oq-evidence.md)), conformance runs
([04 — Conformance Suite](./04-conformance-suite.md)) and check reports have to reach a
reviewer, be filed in a document system and be compared with the next run.
This file defines the evidence pack that carries them: a directory of
canonical JSON files with a manifest of digests, the attachments exactly as
read, derived human-readable reports, a pack digest that identifies the
whole, an optional QA signature, and a comparison of two packs
([ADR-GX-022](../decisions/022-evidence-pack-format.md)). This file owns BEH-GX-129–136 and uses all eight.

> **What a pack does not do — and who does**
>
> A pack records executed results and the gaps between them. It is not a
> qualification, an approval or a release decision, and its pass verdicts
> are the test runner's. Filing it under document control, assessing its
> deviations and deciding what it is sufficient for are the consumer's
> obligation.

Planned source: `packages/gxp/src/evidence/buildEvidencePack.ts`,
`packages/gxp/src/evidence/renderReport.ts` and
`packages/gxp/src/evidence/diffPacks.ts` *(Planned)*.

## BEH-GX-129: buildEvidencePack writes one directory with a fixed layout from the results it is given

> **Invariant:** [INV-GX-010](../invariants.md#inv-gx-010-evidence-results-come-only-from-runner-output-and-gaps-stay-gaps), [INV-GX-005](../invariants.md#inv-gx-005-no-configuration-value-or-key-material-appears-in-any-companion-output)
> **See:** [ADR-GX-022](../decisions/022-evidence-pack-format.md), [ADR-GX-020](../decisions/020-iq-proof-and-probe.md), [ADR-GX-021](../decisions/021-oq-from-runner-output.md)
> **Satisfies:** [URS-GX-013](../urs.md#urs-gx-013-produce-installation-evidence), [URS-GX-014](../urs.md#urs-gx-014-produce-operational-evidence-that-shows-gaps), [URS-GX-002](../urs.md#urs-gx-002-show-that-a-trail-adapter-conforms)
> **Risk:** [RSK-GX-016](../gxp/03-risk-assessment.md#rsk-gx-016), [RSK-BR-018](../../core/gxp/03-risk-assessment.md#rsk-br-018)
> **Regulatory:** supports EU GMP Annex 11 §4.4, §4.7; 21 CFR 11.10(a), 11.10(b) (as evidence the consumer evaluates)

```ts
// illustrative — not type-checked
declare function buildEvidencePack(q: {
  readonly iq?: IqReport                                   // BEH-GX-120
  readonly oq?: OqReport                                   // BEH-GX-121
  readonly checks?: readonly CheckReport[]                 // 05–07, 11
  readonly sinkStatus: TrailSinkStatusValue | "no-sink"     // read with TrailSinkStatus.current when the pack is made (22, BEH-GX-179)
  readonly adapterManifests: readonly unknown[]            // every wired port's manifest, copied unchanged (BEH-GX-016)
  readonly attachments: readonly { readonly path: string; readonly as: string }[]   // runner outputs, run and conformance manifests
  readonly outDir: string                                  // must not exist
}): Effect.Effect<{ readonly packDigest: string }, EvidenceWriteFailed>

class EvidenceWriteFailed extends Schema.TaggedError<EvidenceWriteFailed>()("EvidenceWriteFailed", {
  path: Schema.String,                    // the file that could not be written
  reason: Schema.String                   // the file system's error code, e.g. "ENOSPC", "EEXIST"; never file content
}) {}
```

```
<outDir>/
  manifest.json      format "bridger-gx-evidence/1"; a digest per file (BEH-GX-130)
  iq.json            the IQ report, when given
  oq.json            the OQ report, when given
  coverage.json      requirement → tests → outcome, behaviour → requirements (BEH-GX-131)
  checks.json        the check reports given, in input order (BEH-GX-131)
  sink-status.json   the trail sink's counts, labelled "counts since the sink was built", unless "no-sink" (BEH-GX-179)
  deviations.json    every deviation raised by IQ, OQ and the checks (BEH-GX-133)
  adapters.json      the port manifests, copied unchanged
  attachments/       input files, byte for byte
  report.md          derived rendering (BEH-GX-134)
  report.html        derived rendering (BEH-GX-134)
  assessments.json   added later by assessDeviation; outside the manifest's file list (BEH-GX-133)
  signatures.json    added later by signEvidencePack; outside the manifest's file list (BEH-GX-135)
```

```
REQUIREMENT: The pack MUST contain exactly the files of the layout, and a
             file for a part not given MUST be absent, not empty.
             `buildEvidencePack` MUST NOT write `assessments.json` or
             `signatures.json`; each exists only once its first entry is
             appended (BEH-GX-133, BEH-GX-135).
             `sinkStatus` MUST be stated explicitly, "no-sink" only for an
             assembly without a trail sink, and the renderings MUST then say
             that no sink status was given. `outDir`
             MUST NOT exist before the call; the pack MUST be written to a
             temporary sibling directory and renamed into place only when
             every file is written, so that no partial pack exists under
             `outDir`.
```

```
REQUIREMENT: The pack MUST carry results only as the IQ, OQ and check reports
             state them. A conformance case listed in a conformance manifest
             with no test in the runner output MUST appear as "not executed",
             and a failed one as "fail" (BEH-GX-031, BEH-GX-121).
```

```
REQUIREMENT: A failure to write any file MUST fail the call with
             `EvidenceWriteFailed { path, reason }` and leave nothing under
             `outDir`.
```

The pack is a container, not a computation: everything it says was said by
a report it was given, and every report can be traced to the attachments
beside it. Writing it whole or not at all means a reviewer never receives a
pack missing the file that held the failure.

## BEH-GX-130: manifest.json lists every file of the pack with its SHA-256, and attachments are kept byte for byte

> **Invariant:** [INV-GX-012](../invariants.md#inv-gx-012-the-canonical-form-is-deterministic-across-platforms), [INV-GX-010](../invariants.md#inv-gx-010-evidence-results-come-only-from-runner-output-and-gaps-stay-gaps)
> **See:** [ADR-GX-022](../decisions/022-evidence-pack-format.md), [ADR-GX-005](../decisions/005-jcs-and-sha256.md)
> **Satisfies:** [URS-GX-014](../urs.md#urs-gx-014-produce-operational-evidence-that-shows-gaps), [NFR-GX-001](../urs.md#nfr-gx-001-deterministic-outputs)
> **Risk:** [RSK-GX-016](../gxp/03-risk-assessment.md#rsk-gx-016)
> **Regulatory:** supports EU GMP Annex 11 §4.7, §8.1; ALCOA+ Original

```ts
// illustrative — not type-checked
interface PackManifest {
  readonly format: "bridger-gx-evidence/1"
  readonly package: { readonly name: "@bridger/gxp"; readonly version: string; readonly filesDigest: string }
  readonly core: { readonly version: string }
  readonly generatedAt: string                             // from Clock
  readonly inputs: readonly { readonly as: string; readonly digest: string }[]
  readonly files: readonly { readonly path: string; readonly digest: string; readonly bytes: number }[]
  readonly statement: string
}
```

```
REQUIREMENT: `files` MUST list every file of the pack except `manifest.json`,
             `signatures.json` and `assessments.json`, sorted by path in
             code-point order, each with "sha256:" and the lower-case hex
             SHA-256 of its bytes. `inputs` MUST list each attachment's
             digest as read, before it was copied.
```

```
REQUIREMENT: Each attachment MUST be copied without decoding, re-encoding,
             line-ending conversion or reformatting, and its digest in
             `files` MUST equal its digest in `inputs`.
```

```
REQUIREMENT: `statement` MUST be: "This pack records executed results and
             their gaps. It is not a qualification. Results are the test
             runner's."
```

Listing every file by digest makes the manifest a complete inventory: a file
added, removed or edited after generation no longer matches it. Keeping the
input digests beside the output digests shows that the attachments in the
pack are the files the generator actually read.

## BEH-GX-131: coverage.json maps every requirement to its tests and every behaviour to its requirements, and JSON files are canonical

> **Invariant:** [INV-GX-010](../invariants.md#inv-gx-010-evidence-results-come-only-from-runner-output-and-gaps-stay-gaps), [INV-GX-012](../invariants.md#inv-gx-012-the-canonical-form-is-deterministic-across-platforms)
> **See:** [ADR-GX-022](../decisions/022-evidence-pack-format.md), [ADR-GX-021](../decisions/021-oq-from-runner-output.md)
> **Satisfies:** [URS-GX-014](../urs.md#urs-gx-014-produce-operational-evidence-that-shows-gaps), [NFR-GX-001](../urs.md#nfr-gx-001-deterministic-outputs), [NFR-GX-003](../urs.md#nfr-gx-003-coverage)
> **Risk:** [RSK-GX-016](../gxp/03-risk-assessment.md#rsk-gx-016)
> **Regulatory:** supports EU GMP Annex 11 §4.4, §4.7 (traceability)

```
REQUIREMENT: `coverage.json` MUST hold, for every `REQ-BR` and `REQ-GX`
             requirement of the OQ report, its outcome and its tests; and,
             for every `BEH-BR` and `BEH-GX` behaviour that a requirement of
             either traceability file cites, the requirements citing it and
             the worst of their outcomes in the order "fail", "not covered",
             "skipped", "pass". A behaviour no requirement cites MUST be
             listed with outcome "not covered".
```

```
REQUIREMENT: Every JSON file the pack writes MUST be the RFC 8785 canonical
             form of its value (BEH-GX-002) followed by one line feed. Every
             array the pack builds MUST be sorted by its documented key:
             requirement id, check id, behaviour id, deviation id, path.
             Exempt, and kept in the caller's input order, are the reports
             and manifests the pack is given rather than builds: the
             top-level array of `checks.json`, because a `CheckReport` has
             no key of its own (its `scope` may name several hosts and it
             carries no time), the top-level array of `adapters.json`, whose
             manifests are copied unchanged, and every array inside a given
             report or manifest (a check report's `findings` are already
             ordered by 05 — Checks on read). Code-coverage percentages
             MAY be included only as a copied attachment, never computed by
             the pack.
```

Coverage by behaviour is the question a reviewer of a specification asks —
"which of these requirements has nothing behind it?" — and it is answered
from the traceability files and the runner output alone. Line coverage is a
floor for the consumer's own tooling (NFR-GX-003), not something the pack
should restate as if it were evidence of behaviour.

## BEH-GX-132: The pack digest is the SHA-256 of the manifest's canonical text

> **Invariant:** [INV-GX-012](../invariants.md#inv-gx-012-the-canonical-form-is-deterministic-across-platforms)
> **See:** [ADR-GX-022](../decisions/022-evidence-pack-format.md), [ADR-GX-005](../decisions/005-jcs-and-sha256.md)
> **Satisfies:** [NFR-GX-001](../urs.md#nfr-gx-001-deterministic-outputs), [URS-GX-014](../urs.md#urs-gx-014-produce-operational-evidence-that-shows-gaps)
> **Risk:** [RSK-GX-016](../gxp/03-risk-assessment.md#rsk-gx-016), [RSK-GX-004](../gxp/03-risk-assessment.md#rsk-gx-004)
> **Regulatory:** supports EU GMP Annex 11 §4.7, §8.1

```
REQUIREMENT: `packDigest` MUST be "sha256:" followed by the lower-case hex
             SHA-256 of the UTF-8 bytes of the manifest's RFC 8785 canonical
             text — the bytes of `manifest.json` without its final line feed.
```

```
REQUIREMENT: Building a pack twice from the same inputs, with the same
             `generatedAt` and package versions, MUST give byte-identical
             files and the same `packDigest` on every supported platform.
```

```
REQUIREMENT: `verifyEvidencePack(dir)` MUST recompute every file's digest and
             the pack digest and report each difference by path; it MUST NOT
             describe a pack with no difference as authentic or unaltered —
             only as "every file matches the manifest".
```

Because the manifest names every file by digest, one digest over the
manifest identifies the whole pack: the compatibility matrix can cite it,
a QA signature can sign it, and two packs can be compared by it. Like the
seal chain, it detects change only against a copy of the digest held
somewhere the pack's editor cannot reach ([BEH-GX-174](./21-sealing-through-audit-chain.md#beh-gx-174-sealing-covers-trail-entries-only)); the pack is
not sealed.

## BEH-GX-133: deviations.json holds every raised deviation, and the consumer's assessments are kept apart in assessments.json

> **Invariant:** [INV-GX-009](../invariants.md#inv-gx-009-a-finding-is-never-suppressed-or-upgraded), [INV-GX-010](../invariants.md#inv-gx-010-evidence-results-come-only-from-runner-output-and-gaps-stay-gaps)
> **See:** [ADR-GX-022](../decisions/022-evidence-pack-format.md), [ADR-GX-007](../decisions/007-checks-never-claim-integrity.md), [ADR-GX-021](../decisions/021-oq-from-runner-output.md)
> **Satisfies:** [URS-GX-014](../urs.md#urs-gx-014-produce-operational-evidence-that-shows-gaps), [URS-GX-016](../urs.md#urs-gx-016-know-which-obligations-remain-mine)
> **Risk:** [RSK-GX-016](../gxp/03-risk-assessment.md#rsk-gx-016), [RSK-GX-004](../gxp/03-risk-assessment.md#rsk-gx-004)
> **Regulatory:** supports EU GMP Annex 11 §4.7; GAMP 5 deviation handling; ALCOA+ Attributable

```ts
// illustrative — not type-checked
interface Deviation {
  readonly id: string                      // "DEV-" + the first 12 hex digits of SHA-256(JCS({ kind, source, subject }))
  readonly kind: string                    // BEH-GX-125 kinds, IQ "check-failed" / "check-not-executed",
                                           // "non-finite gateTimeout", "finding" (a check report's finding)
  readonly source: "iq" | "oq" | "checks"
  readonly subject: string                 // check id, requirement id, case number, or "<kind> <hostId> <auditSeq>"
  readonly detail: string                  // fixed template
  readonly state: "open"
}
declare function assessDeviation(
  packDir: string,
  a: { readonly deviationId: string; readonly by: Actor; readonly assessment: string; readonly reference?: string },
  deps: { readonly clock?: Clock.Clock }
): Effect.Effect<void, EvidenceWriteFailed | AssessmentRefused>

class AssessmentRefused extends Schema.TaggedError<AssessmentRefused>()("AssessmentRefused", {
  deviationId: Schema.String,
  reason: Schema.Literal("unknown-deviation", "reserved-actor", "blank-assessment")
}) {}
```

```
REQUIREMENT: `deviations.json` MUST hold one entry per deviation raised by
             the IQ report (BEH-GX-114, BEH-GX-120), the OQ report
             (BEH-GX-125) and every finding of every check report given, each
             with state "open". The generator MUST NOT drop, merge, close or
             re-word a deviation, and two runs over the same inputs MUST give
             the same ids.
```

```
REQUIREMENT: A consumer's assessment MUST be appended by `assessDeviation` to
             `assessments.json`, outside the manifest's file list, with the
             actor's `id` and `kind`, `at` from `Clock`, the deviation id and
             the text. It MUST refuse with `AssessmentRefused` an unknown
             deviation id, a reserved actor (BEH-BR-189) or a blank
             assessment, and it MUST NOT change any other file.
```

A finding of a check report, an IQ failure and an unknown tag are all
departures somebody has to look at; collecting them in one file, with stable
ids, gives the consumer's deviation procedure one list to work from. The
assessments live in their own file because they are later, attributed human
judgments: adding one must not change the pack's digest, and must never
alter the deviation it assesses ([BEH-GX-040](./05-checks-on-read.md#beh-gx-040-a-finding-is-never-suppressed-merged-or-upgraded)).

## BEH-GX-134: report.md and report.html are derived, deterministic renderings, marked as such

> **Invariant:** [INV-GX-015](../invariants.md#inv-gx-015-every-signed-binding-carries-a-manifestation), [INV-GX-005](../invariants.md#inv-gx-005-no-configuration-value-or-key-material-appears-in-any-companion-output)
> **See:** [ADR-GX-022](../decisions/022-evidence-pack-format.md), [ADR-GX-027](../decisions/027-claims-and-non-claims.md), [ADR-GX-014](../decisions/014-deny-by-default-policy.md)
> **Satisfies:** [URS-GX-013](../urs.md#urs-gx-013-produce-installation-evidence), [URS-GX-014](../urs.md#urs-gx-014-produce-operational-evidence-that-shows-gaps), [NFR-GX-001](../urs.md#nfr-gx-001-deterministic-outputs)
> **Risk:** [RSK-GX-020](../gxp/03-risk-assessment.md#rsk-gx-020), [RSK-GX-004](../gxp/03-risk-assessment.md#rsk-gx-004)
> **Regulatory:** supports 21 CFR 11.10(b) (human-readable form); EU GMP Annex 11 §4.4, §8.1

```
REQUIREMENT: The first line of each report MUST be "Derived rendering of
             evidence pack <packDigest>; the JSON files are the evidence." The
             reports MUST be generated from the pack's JSON files only, by a
             pure function, and MUST contain no result, count or statement
             not present in those files, other than the fixed headings.
```

```
REQUIREMENT: The reports MUST show, in this order: the manifest's
             statement; the IQ results with their kind, outcome, reason and
             `observedAt`; every exempt policy rule with its justification
             and the rule governing `acknowledgeAuditDegraded` (BEH-GX-059,
             BEH-GX-062); the OQ outcomes with their counts; every
             conformance case; every deviation; and, for every signature
             shown, its manifestation (BEH-GX-085).
```

```
REQUIREMENT: `report.html` MUST be a single self-contained file with no
             script, no external resource and no timestamp other than those
             in the JSON. Both reports MUST be byte-identical across runs over
             the same JSON files.
```

People read the rendering; the JSON is the record. Saying so on the first
line, and deriving the rendering mechanically from the record, means a
discrepancy between the two can only be a defect of the renderer, which a
test comparing the two can find ([RSK-GX-020](../gxp/03-risk-assessment.md#rsk-gx-020)). Exemptions are shown
because the person approving an installation should see every change that
needs no approval ([BEH-GX-059](./08-approval-policy.md#beh-gx-059-exemptions-are-explicit-rules-with-a-justification)).

## BEH-GX-135: A pack may carry QA signatures over its digest, captured through the signature port

> **Invariant:** [INV-GX-015](../invariants.md#inv-gx-015-every-signed-binding-carries-a-manifestation), [INV-GX-004](../invariants.md#inv-gx-004-the-approver-is-never-the-requester)
> **See:** [ADR-GX-022](../decisions/022-evidence-pack-format.md), [ADR-GX-016](../decisions/016-signature-port-and-manifestation.md), [ADR-GX-015](../decisions/015-separation-of-duties.md)
> **Satisfies:** [URS-GX-008](../urs.md#urs-gx-008-show-who-signed-when-and-with-what-meaning), [URS-GX-013](../urs.md#urs-gx-013-produce-installation-evidence)
> **Risk:** [RSK-GX-009](../gxp/03-risk-assessment.md#rsk-gx-009), [RSK-GX-020](../gxp/03-risk-assessment.md#rsk-gx-020)
> **Regulatory:** supports 21 CFR 11.50, 11.70; EU GMP Annex 11 §14

```ts
// illustrative — not type-checked
declare function signEvidencePack(
  q: { readonly packDir: string; readonly meaning: Meaning; readonly requester: { readonly id: string; readonly kind: "user" | "service" } },
  deps: { readonly signatures: SignatureCaptureShape; readonly clock?: Clock.Clock }
): Effect.Effect<SignatureRecord, SignatureDeclined | SignatureCaptureFailed | EvidenceReadFailed | EvidenceWriteFailed>
```

```
REQUIREMENT: The signature request MUST use `ticketId` "pack:" followed by
             the pack digest, `bindingDigest` the SHA-256 of the canonical
             form of `{ packDigest, assessmentsDigest }` (the digest of
             `assessments.json`, or of an empty array when there is none),
             and `rendered` the text of `report.md`. Every rule of 10 —
             Signature Capture Port applies: the companion stamps `signedAt`,
             refuses the requester as signer, and refuses a malformed answer.
```

```
REQUIREMENT: Accepted signatures MUST be appended to `signatures.json`,
             outside the manifest's file list, so that signing does not
             change the pack digest. `verifyEvidencePack` MUST report a
             signature whose `bindingDigest` no longer matches the pack and
             its assessments as "signature does not match the current pack".
```

A QA reviewer signs what they read — the rendering — and the signature
names exactly the pack and the assessments that existed when they signed. A
later assessment changes the second digest, so the earlier signature
visibly stops covering the pack as it now stands, which is how a reader
knows a new review is needed.

## BEH-GX-136: diffPacks reports every result that changed, appeared or disappeared between two packs

> **Invariant:** [INV-GX-009](../invariants.md#inv-gx-009-a-finding-is-never-suppressed-or-upgraded)
> **See:** [ADR-GX-022](../decisions/022-evidence-pack-format.md)
> **Satisfies:** [URS-GX-014](../urs.md#urs-gx-014-produce-operational-evidence-that-shows-gaps), [NFR-GX-001](../urs.md#nfr-gx-001-deterministic-outputs)
> **Risk:** [RSK-GX-016](../gxp/03-risk-assessment.md#rsk-gx-016), [RSK-GX-019](../gxp/03-risk-assessment.md#rsk-gx-019)
> **Regulatory:** supports EU GMP Annex 11 §10, §11 (comparison across changes and periodic evaluation)

```ts
// illustrative — not type-checked
declare function diffPacks(prev: string, next: string): Effect.Effect<PackDiff, EvidenceReadFailed>
class EvidenceReadFailed extends Schema.TaggedError<EvidenceReadFailed>()("EvidenceReadFailed", {
  path: Schema.String,                    // the pack directory, or the file that failed
  reason: Schema.Literal("unreadable", "manifest-mismatch")   // BEH-GX-132
}) {}
interface PackDiff {
  readonly format: "bridger-gx-pack-diff/1"
  readonly prev: string; readonly next: string                     // pack digests
  readonly versions: { readonly prev: VersionSet; readonly next: VersionSet }
  readonly changes: readonly {
    readonly area: "iq" | "requirement" | "conformance" | "deviation" | "attachment" | "policy" | "eligibility"
    readonly id: string
    readonly change: "changed" | "appeared" | "disappeared"
    readonly from?: string; readonly to?: string                   // outcomes or digests, never content
  }[]
}
```

```
REQUIREMENT: `diffPacks` MUST verify both packs as BEH-GX-132 states and fail
             with `EvidenceReadFailed` when either does not match its
             manifest. It MUST then list every IQ check, requirement,
             conformance case and deviation whose outcome or state differs,
             appeared or disappeared, every attachment whose digest differs,
             and a change of policy or eligibility digest, sorted by area
             and id.
```

```
REQUIREMENT: A requirement that passed before and is "not covered" now MUST
             be listed as changed, never omitted because nothing failed.
             `diffPacks` MUST NOT summarise the comparison as better, worse,
             equivalent or acceptable.
```

The useful question after a change is not "is the new pack green?" but "what
is different from the last one we accepted?" — including requirements that
quietly lost their tests. The diff answers it item by item and leaves the
judgment to the person reading it.

---

_Previous: [16 — OQ Evidence](./16-oq-evidence.md)_ · _Next: [18 — Archive and Export](./18-archive-and-export.md)_
