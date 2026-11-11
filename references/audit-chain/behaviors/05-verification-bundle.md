# 05 — Verification Bundle

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-AC-BEH-05                                            |
> | Revision       | 0.6                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.6 (2026-11-11): BEH-AC-034 heads and `continuesFrom` passed to `verifyChain` in its form, `seq` as `auditSeq` and the series id as `hostId` (PL22) (SPEC-AUDIT-07) (CCR-AC-009)<br>0.5 (2026-11-10): BEH-AC-039: one `precomputeMacs` call per keyed series, the results merged, and the kit's `--keyed` and `--expect-keyed` named (A1, PL1); check 20 extended (SPEC-AUDIT-04) (CCR-AC-007)<br>0.4 (2026-11-10): BEH-AC-034: `BundleReport.chain` is one `ChainReport` per series, each from its own `verifyChain` run under the series' profile, and `options.expectKeyed` takes `true` (every series) or the set of series ids whose sinks were keyed (M21); BEH-AC-039: an effectful MAC reaches `verifyBundle` through `precomputeMacs` (03, BEH-AC-019) (M20) (CCR-AC-006)<br>0.3 (2026-11-10): `verifyBundle` takes `options.keyed`, the pure MAC function BEH-AC-039 relies on, and passes it and each series' profile to `verifyChain` (`options.keyed`, `options.profile`); follow-up: `options.expectKeyed`, passed to `verifyChain`; check 20 extended (CCR-AC-005)<br>0.2 (2026-11-08): Round-2 agent review (R3-08, R3-16): expected heads carried in a bundle are always "head-unconfirmed", only the inspector's own heads confirm; the bundle signature uses the loader's reserved "chain-bundle" statement type and its `id`/`version` convention; check 19 extended (CCR-AC-003)<br>0.1 (2026-11-08): Initial draft (CCR-AC-003)                 |

---

An inspector who is handed a trail wants to check it with their own tools, on
their own machine, without network access to the application or its anchor
services. File 03 gives a pure `verifyChain`, but its inputs — entries,
confirmed statements, expected heads — come from the application's stores
and from `confirmAnchors`, which calls anchor services. This file specifies a
**verification bundle**: one self-contained file holding chain segments,
anchor statements, receipts and the trust roots needed to check the receipts,
exported by `exportBundle` and checked offline by `verifyBundle`, a pure
function. The kit's command `bridger verify-chain <bundle>` runs
`verifyBundle` and prints its report ([kit 04 — Command line](../../kit/behaviors/04-cli.md)).
This file owns BEH-AC-033–040 and uses all eight.

> **What this package does not do — and who does**
>
> A bundle is checked against the trust roots it carries, unless the
> inspector pins their own. The package does **not** establish that those
> roots belong to the anchor services they name, that the anchor services
> are independent of whoever produced the bundle, or that the bundle holds
> every record the application wrote. Choosing what to export, handing it
> over, and the inspector's own evidence about trust roots are the
> application's and the inspector's. A bundle report does not make a
> trail tamper-proof; the words of
> [BEH-AC-022](./03-verification.md#beh-ac-022-the-words-a-report-and-its-documentation-may-use)
> apply.

Planned source: `packages/audit-chain/src/Bundle.ts`,
`packages/audit-chain/src/verifyBundle.ts` and
`packages/audit-chain/src/OfflineReceipt.ts` *(Planned)*.

## BEH-AC-033: A verification bundle is a self-contained export, made by exportBundle

> **Invariant:** [INV-AC-003](../invariants.md#inv-ac-003-the-stored-record-is-the-record-core-handed-over)
> **See:** [ADR-AC-002](../decisions/002-anchor-defends-against-insider.md), [ADR-AC-005](../decisions/005-one-chain-over-any-stream-hashing-the-stored-form.md)
> **Satisfies:** [URS-BR-022](../../core/urs.md#urs-br-022-obtain-a-complete-ordered-and-gap-detectable-lifecycle-record), [URS-BR-026](../../core/urs.md#urs-br-026-know-which-compliance-obligations-remain-mine)
> **Risk:** [RSK-BR-045](../../core/gxp/03-risk-assessment.md#rsk-br-045)
> **Regulatory:** supports the consumer's controls under 21 CFR 11.10(b) (accurate and complete copies for inspection) and EU GMP Annex 11 §8 (detection only)

```ts
// illustrative — not type-checked
interface VerificationBundle {
  readonly format: "bridger-chain-bundle/v1"
  readonly createdAt: string                                 // from Clock, ISO-8601 UTC with ms
  readonly series: readonly {
    readonly seriesId: string
    readonly canon: string                                   // canonicaliser id (04, BEH-AC-027)
    readonly profile: "audit" | string                       // which ChainProfile reads it (04, BEH-AC-031)
    readonly alg: "sha-256" | "sha-512"
    readonly continuesFrom?: { readonly seriesId: string; readonly seq: number; readonly hash: string }
  }[]
  readonly segments: readonly {                              // chain segments: contiguous runs of entries
    readonly seriesId: string
    readonly fromSeq: number
    readonly toSeq: number
    readonly entries: readonly { readonly record: unknown; readonly link: ChainLink }[]
  }[]
  readonly inclusions?: readonly InclusionProof[]            // selective disclosure (03, BEH-AC-021)
  readonly anchors: readonly { readonly statement: AnchorStatement; readonly receipt: AnchorReceipt }[]
  readonly trustRoots: readonly TrustRoot[]                  // BEH-AC-035
  readonly expectedHeads?: readonly { readonly seriesId: string; readonly seq: number; readonly hash?: string; readonly source: string }[]
  readonly digest: string                                    // BEH-AC-037
}

type TrustRoot =
  | { readonly kind: "anchor-key"; readonly anchor: string; readonly alg: string; readonly publicKey: string }   // statement-signing anchors
  | { readonly kind: "log-key"; readonly anchor: string; readonly alg: string; readonly publicKey: string }      // transparency logs: signed tree heads
  | { readonly kind: "tsa-certificate"; readonly anchor: string; readonly chainPem: readonly string[] }          // RFC 3161 authorities
  | { readonly kind: string; readonly anchor: string; readonly material: unknown }                              // an adapter's own kind

declare function exportBundle(request: {
  readonly series: readonly string[]
  readonly range?: ReadonlyMap<string, { readonly fromSeq: number; readonly toSeq: number }>   // default: the whole series
  readonly disclose?: "segments" | "inclusions"            // default "segments"
  readonly trustRoots: readonly TrustRoot[]
  readonly expectedHeads?: VerificationBundle["expectedHeads"]
}): Effect.Effect<VerificationBundle, BundleExportFailed, ChainReader | ReceiptReader | Clock.Clock>

interface ChainReaderShape {                               // read side of the application's ChainStore
  readonly read: (seriesId: string, fromSeq: number, toSeq: number) => Stream.Stream<ChainEntry<unknown>, BundleExportFailed>
  readonly describe: (seriesId: string) => Effect.Effect<VerificationBundle["series"][number], BundleExportFailed>
}
interface ReceiptReaderShape {
  readonly read: (seriesId: string, fromSeq: number, toSeq: number) =>
    Stream.Stream<{ readonly statement: AnchorStatement; readonly receipt: AnchorReceipt }, BundleExportFailed>
}

class BundleExportFailed extends Schema.TaggedError<BundleExportFailed>()("BundleExportFailed", {
  seriesId: Schema.optional(Schema.String),
  reason: Schema.Literal("store-unreadable", "receipts-unreadable", "unknown-series", "range-invalid"),
  message: Schema.String
}) {}
```

```
REQUIREMENT: `exportBundle` MUST copy entries, statements and receipts as
             stored, without recomputing, repairing or omitting anything in
             the requested range: a link with a break marker, a missing link
             or a gap MUST appear in the bundle as it appears in the store.
             It MUST NOT verify; verification is `verifyBundle`'s.
```

```
REQUIREMENT: The bundle MUST include every anchor statement and receipt the
             receipt store holds for windows that overlap the exported
             range, and the trust roots the request names. It MUST NOT
             include a trust root read from the chain store, the receipt
             store or a receipt.
```

```
REQUIREMENT: With `disclose: "inclusions"`, the bundle MUST carry, for each
             requested record, the record, its link and an inclusion proof
             (03, BEH-AC-021), and no other record. Documentation MUST state
             that such a bundle shows those records were part of anchored
             windows and nothing about the records it does not disclose.
```

```
REQUIREMENT: `exportBundle` MUST fail with `BundleExportFailed` only when it
             could not read what was requested; it MUST NOT produce a partial
             bundle that omits the unreadable part silently.
```

Copying what is stored, breaks included, is what makes the bundle worth
checking: an export that tidied the chain would be checked against itself.
Trust roots come from the request, never from the stores being exported,
for the reason the loader states for its own trust roots
([loader](../../loader/README.md)): material fetched from the place it is
meant to judge judges nothing.

## BEH-AC-034: verifyBundle is pure, total and offline

> **Invariant:** [INV-AC-004](../invariants.md#inv-ac-004-verification-never-reports-more-than-it-checked), [INV-AC-006](../invariants.md#inv-ac-006-a-bundle-is-verified-from-the-bundle-alone)
> **See:** [ADR-AC-002](../decisions/002-anchor-defends-against-insider.md)
> **Satisfies:** [URS-BR-022](../../core/urs.md#urs-br-022-obtain-a-complete-ordered-and-gap-detectable-lifecycle-record), [URS-BR-026](../../core/urs.md#urs-br-026-know-which-compliance-obligations-remain-mine)
> **Risk:** [RSK-BR-018](../../core/gxp/03-risk-assessment.md#rsk-br-018), [RSK-BR-045](../../core/gxp/03-risk-assessment.md#rsk-br-045)
> **Regulatory:** supports the inspector's review under 21 CFR 11.10(b), (e); EU GMP Annex 11 §9 (detection only)

```ts
// illustrative — not type-checked
declare function verifyBundle(
  bundle: unknown,                                           // parsed JSON; validated here, never trusted
  options?: {
    readonly pinnedTrustRoots?: readonly TrustRoot[]         // the inspector's own; replaces the bundle's (BEH-AC-035)
    readonly expectedHeads?: ReadonlyMap<string, { readonly seq: number; readonly hash?: string }>   // the inspector's own
    readonly profiles?: ReadonlyMap<string, ChainProfile<unknown>>   // beyond "audit"
    readonly receiptVerifiers?: readonly OfflineReceiptVerifier[]    // BEH-AC-036
    readonly keyed?: (keyId: string, input: Uint8Array) => Uint8Array | undefined   // a pure MAC function, for keyed links (BEH-AC-039)
    // true: every series; a set: those series ids, whose sinks were built with a keyed hasher (03, BEH-AC-019)
    readonly expectKeyed?: boolean | ReadonlySet<string>
  }
): BundleReport

interface BundleReport {
  readonly format: "bridger-chain-bundle-report/v1"
  readonly bundleDigest: { readonly stated: string; readonly computed: string; readonly matches: boolean }
  readonly trustRoots: { readonly source: "pinned" | "bundle"; readonly fingerprints: readonly string[] }
  readonly receipts: readonly {
    readonly seriesId: string
    readonly statementHash: string
    readonly result: "confirmed-offline" | "not-checked" | "failed"
    readonly reason?: string                                 // "needs-online-check", "no-verifier", "no-trust-root", "signature-invalid", …
  }[]
  // per series id: verifyChain over that series' segments, with offline-confirmed statements only (03)
  readonly chain: Readonly<Record<string, ChainReport>>
  readonly inclusions: readonly { readonly seriesId: string; readonly seq: number; readonly result: "included" | "not-included" | "not-checked" }[]
  readonly malformed: readonly { readonly path: string; readonly problem: string }[]
}
```

```
REQUIREMENT: `verifyBundle` MUST be a pure, total function: no effects, no
             clock, no network, no file system and no environment; the same
             report for the same inputs. A malformed bundle MUST yield a
             report listing what is malformed (`malformed`), never a thrown
             error, and MUST verify whatever well-formed parts remain.
```

```
REQUIREMENT: `verifyBundle` MUST confirm receipts only with offline receipt
             verifiers (BEH-AC-036) against the effective trust roots, MUST
             pass only offline-confirmed statements to `verifyChain` (03,
             BEH-AC-017), and MUST report every other receipt as
             "not-checked" or "failed" with its reason. A receipt that would
             need an online check MUST be reported "not-checked" with reason
             "needs-online-check", and MUST NEVER be reported as confirmed.
```

```
REQUIREMENT: `chain` MUST hold, for each series of the bundle, under its
             series id, the `ChainReport` of one `verifyChain` run over that
             series' segments, with the profile the series names as
             `options.profile`, the series' `continuesFrom`, `options.keyed`
             when given, `expectKeyed: true` when `options.expectKeyed` is
             `true` or contains the series id, and `expectedHeads` taken from the
             options when given, otherwise from the bundle — in which case
             each head's `head` result MUST be reported as
             "head-unconfirmed", whatever its `source` says. Only heads
             given in `options.expectedHeads` (the inspector's own) MAY
             confirm a head. `source` is a label written by the bundle's
             producer; `verifyBundle` MUST NOT treat it as evidence, and the
             rendering MUST print it as "stated by the bundle".
             `verifyBundle` MUST pass each head and the series'
             `continuesFrom` in `verifyChain`'s form (03, BEH-AC-017), keyed
             by the series id: a head `{ seq, hash }` as `{ auditSeq: seq,
             hash }` and `continuesFrom` `{ seriesId, seq, hash }` as
             `{ hostId: seriesId, auditSeq: seq, hash }`, `auditSeq` and
             `hostId` there naming the series' `seq` and series id for every
             profile.
```

```
REQUIREMENT: A series whose profile is neither "audit" nor supplied in
             `profiles` MUST be reported as not verified (every entry
             "not-checked" in `malformed` with problem "unknown-profile"),
             never verified with a guessed canonicaliser.
```

Offline is the point: an inspector can run the check years later, on a
machine with no access to the application or its anchor services, and get
the same answer each time. A receipt whose evidence can only be checked by
asking the service — an object-version id in another party's store, say —
cannot be checked here; saying "not checked" keeps the report honest, and the
inspector can still run `confirmAnchors` (03, BEH-AC-020) where they have
network access.

## BEH-AC-035: Trust roots, and the difference between pinned and carried

> **Invariant:** [INV-AC-006](../invariants.md#inv-ac-006-a-bundle-is-verified-from-the-bundle-alone)
> **See:** [ADR-AC-002](../decisions/002-anchor-defends-against-insider.md)
> **Satisfies:** [URS-BR-026](../../core/urs.md#urs-br-026-know-which-compliance-obligations-remain-mine)
> **Risk:** [RSK-BR-045](../../core/gxp/03-risk-assessment.md#rsk-br-045)

```
REQUIREMENT: When `pinnedTrustRoots` is given, `verifyBundle` MUST use only
             those and MUST ignore the bundle's `trustRoots`; otherwise it
             MUST use the bundle's and report `trustRoots.source: "bundle"`.
             In both cases it MUST report the SHA-256 fingerprint of each
             root it used.
```

```
REQUIREMENT: Every report rendering, including the kit's `verify-chain`
             output, MUST state, when the source is "bundle", that the
             trust roots were supplied by the party that produced the bundle
             and that a bundle producer able to forge receipts could supply
             matching roots; the fingerprints MUST be printed so that the
             inspector can compare them with roots obtained independently.
```

A bundle that carries its own roots can be checked for internal consistency
by anyone; it defends against an insider only when the inspector compares the
roots with ones they obtained elsewhere — from the anchor service's
publication, from a previous inspection. Pinning makes that comparison part
of the check; the fingerprints make it possible by hand.

## BEH-AC-036: Receipts are confirmed offline by pure verifier adapters

> **See:** [ADR-AC-002](../decisions/002-anchor-defends-against-insider.md)
> **Satisfies:** [URS-BR-026](../../core/urs.md#urs-br-026-know-which-compliance-obligations-remain-mine)
> **Risk:** [RSK-BR-045](../../core/gxp/03-risk-assessment.md#rsk-br-045)

```ts
// illustrative — not type-checked
interface OfflineReceiptVerifier {
  readonly anchorKind: string                                // matches the prefix of AnchorReceipt.anchor, e.g. "rfc3161", "ct-log"
  readonly confirm: (statement: AnchorStatement, statementHash: string, receipt: AnchorReceipt, roots: readonly TrustRoot[]) =>
    { readonly _tag: "Confirmed"; readonly by: string } | { readonly _tag: "Failed"; readonly reason: string } | { readonly _tag: "NeedsOnline" }
}
```

```
REQUIREMENT: An `OfflineReceiptVerifier` MUST be a pure, total function of
             its arguments. It MUST return "Confirmed" only when the
             receipt's evidence verifies against one of the roots it is
             given — for example an RFC 3161 token whose signature chains to
             a "tsa-certificate" root and whose message imprint equals
             `statementHash`, or a transparency-log inclusion proof that
             leads to a tree head signed by a "log-key" root — and MUST
             return "NeedsOnline" when the evidence cannot be checked
             without contacting the service.
```

```
REQUIREMENT: The package MUST recompute `statementHash` from each statement
             before calling a verifier and MUST report a receipt whose
             `statementHash` differs as "failed", as `confirmAnchors` does
             (03, BEH-AC-020). Receipts issued by the testing fixtures
             (`anchor: "testing:scripted"`) MUST be reported "not-checked"
             unless a testing verifier is passed explicitly (03, BEH-AC-023).
```

```
REQUIREMENT: The main entry point MUST export no offline verifier that
             confirms a receipt without checking evidence against a trust
             root. Verifiers for particular services MAY be published as
             separate packages, each stating what its check rests on.
```

The same reasoning that keeps an anchor out of the package (03, BEH-AC-023)
keeps a permissive verifier out: a verifier that confirmed every receipt
would turn every bundle into a pass.

## BEH-AC-037: The bundle format is canonical JSON with a digest

> **Invariant:** [INV-AC-006](../invariants.md#inv-ac-006-a-bundle-is-verified-from-the-bundle-alone)
> **See:** [ADR-AC-005](../decisions/005-one-chain-over-any-stream-hashing-the-stored-form.md)
> **Satisfies:** [URS-BR-022](../../core/urs.md#urs-br-022-obtain-a-complete-ordered-and-gap-detectable-lifecycle-record)
> **Risk:** [RSK-BR-006](../../core/gxp/03-risk-assessment.md#rsk-br-006)

```ts
// illustrative — not type-checked
// file: <name>.bridger-bundle.json, media type "application/vnd.bridger.chain-bundle+json"
// bytes(bundle)  = RFC 8785 (JCS) of the bundle without its `digest` field, UTF-8
// digest         = "sha256:" + hex(SHA-256(D || "bundle\n" || bytes(bundle)))   (D as in 01, BEH-AC-003)
// binary values (receipt evidence, ciphertext) are base64url without padding
```

```
REQUIREMENT: A bundle MUST be serialised as the RFC 8785 form of the
             structure of BEH-AC-033, with binary values in base64url, and
             MUST carry `digest` computed as above. `verifyBundle` MUST
             recompute the digest and report whether it matches; a mismatch
             MUST NOT stop the rest of the check.
```

```
REQUIREMENT: The format MUST be documented in the package so that an
             independent tool can read a bundle and recompute every link,
             Merkle root and digest without this package (RFC 8785,
             RFC 6962 §2.1, the hash inputs of 01 and 02).
```

```
REQUIREMENT: Documentation MUST state that the bundle digest detects
             accidental corruption in transit only: anyone who changes a
             bundle can recompute its digest. A bundle MAY be accompanied by
             a signed statement over its digest, checked by the loader
             companion's signed-statement verification under the reserved
             statement type "chain-bundle", with subject `{ digest }` the
             bundle's `digest`, `id` the RFC 8785 form of the sorted JSON
             array of its series ids, and `version` its `createdAt`
             ([loader 07](../../loader/behaviors/07-signed-statements.md),
             BEH-LD-049); `verifyBundle` MUST NOT depend on the loader, and
             reports such a signature only when the caller passes the
             loader's result in.
```

A digest without a key protects against a damaged file, not against an
editor; it is described as exactly that. Whoever needs to know who produced a
bundle can sign its digest with the application's signing step, which is
the loader's, not this package's.

## BEH-AC-038: What a bundle report may say

> **Invariant:** [INV-AC-004](../invariants.md#inv-ac-004-verification-never-reports-more-than-it-checked)
> **See:** [ADR-AC-002](../decisions/002-anchor-defends-against-insider.md), [ADR-BR-034](../../core/decisions/034-gxp-companion-scope.md)
> **Satisfies:** [URS-BR-026](../../core/urs.md#urs-br-026-know-which-compliance-obligations-remain-mine)
> **Risk:** [RSK-BR-018](../../core/gxp/03-risk-assessment.md#rsk-br-018)
> **Regulatory:** supports 21 CFR 11.10(e) (by never implying protection that does not exist)

```
REQUIREMENT: A `BundleReport` MUST NOT contain a single overall pass/fail
             value. Its rendering MUST give, per series, `verifiedThrough`,
             `linksCheckedThrough`, the unanchored tail, the `head` result,
             counts of receipts "confirmed-offline", "not-checked" and
             "failed", the trust-root source and fingerprints, and every
             break, notice and anchor mismatch.
```

```
REQUIREMENT: The wording rules of 03, BEH-AC-022 MUST apply to the report,
             to its rendering by `bridger verify-chain`, and to their
             documentation. In addition the rendering MUST say that the
             report covers only the records in the bundle, and that records
             the bundle does not contain are not checked by it.
```

```
REQUIREMENT: The JSON encoding of a `BundleReport` MUST be stable and
             versioned by `format`, so that `bridger verify-chain --json`
             output can be archived next to the bundle it describes.
```

"Anchored through 1 000 of series `documents:outlet-17:2026`; receipts: 3
confirmed offline, 1 not checked (needs online check); trust roots from the
bundle, fingerprints …" is long. It is the statement the check supports.

## BEH-AC-039: Bundles stay free of content beyond the stored records, and of keys

> **See:** [ADR-AC-005](../decisions/005-one-chain-over-any-stream-hashing-the-stored-form.md)
> **Satisfies:** [URS-BR-026](../../core/urs.md#urs-br-026-know-which-compliance-obligations-remain-mine)
> **Risk:** [RSK-BR-045](../../core/gxp/03-risk-assessment.md#rsk-br-045)

```
REQUIREMENT: A bundle MUST contain only stored records, links, statements,
             receipts, trust roots (public material only), expected heads
             and the series descriptions. It MUST NOT contain a private key,
             a `KeyedHasher` key, a data key or a decrypted field.
```

```
REQUIREMENT: For a series with keyed links (01, BEH-AC-007), `verifyBundle`
             MUST report every link as "key-unavailable" (03, BEH-AC-019)
             unless the caller supplies a pure MAC function as
             `options.keyed`, which it passes to `verifyChain`; a caller
             whose key is reachable only through an effect calls
             `precomputeMacs` (03, BEH-AC-019) once for each keyed series,
             with that series' segment entries and profile, and passes the
             functions it returns merged into one as 03, BEH-AC-019, states.
             The kit's `bridger verify-chain` takes this function from its
             `--keyed <module>` and `expectKeyed` from `--expect-keyed` (kit
             BEH-KT-047). The rendering MUST say that a keyed chain can be
             recomputed only by a holder of the key.
```

```
REQUIREMENT: For a series canonicalised over ciphertext (04, BEH-AC-028),
             the bundle MUST carry the stored ciphertext, and `verifyBundle`
             MUST recompute links from it without any key; a subject whose
             key was destroyed MUST verify exactly as before.
```

An inspector receives the stored form, which for an encrypted series is the
ciphertext. Recomputing the chain from it needs no key, which is what makes a
shredded subject verifiable and a bundle safe to hand over without handing
over personal data that the store itself does not expose.

## BEH-AC-040: Required acceptance checks for the verification bundle

> **See:** [ADR-BR-035](../../core/decisions/035-evidence-from-executed-tests.md)
> **Satisfies:** [URS-BR-025](../../core/urs.md#urs-br-025-generate-qualification-evidence-from-executed-tests)
> **Risk:** [RSK-BR-018](../../core/gxp/03-risk-assessment.md#rsk-br-018)

```
REQUIREMENT: The package's test suite MUST contain at least one test for
             each of the following (planned acceptance scenarios
             REQ-AC-017–020, traceability §2):
             17. Export: a store with a marked break, a missing link and a
                 gap exports them unchanged; receipts for overlapping
                 windows are included; trust roots come only from the
                 request; an unreadable store fails with
                 `BundleExportFailed`, never a partial bundle; inclusion
                 disclosure carries only the requested records
                 (BEH-AC-033, BEH-AC-039).
             18. Offline and pure: `verifyBundle` run with network, clock
                 and file system unavailable gives the same report twice;
                 malformed bundles yield `malformed` entries, never a throw;
                 an independent RFC 8785 implementation recomputes the
                 digest; a changed byte is reported as a digest mismatch and
                 the rest is still checked (BEH-AC-034, BEH-AC-037).
             19. Receipts and trust roots: an RFC 3161 test token and a
                 transparency-log test proof confirm offline against
                 matching roots and fail against others; an evidence kind
                 that needs the service is "not-checked", never confirmed;
                 testing receipts stay "not-checked"; pinned roots replace
                 the bundle's and fingerprints are reported; a carried
                 expected head whose `source` names a pinned root's anchor
                 is still "head-unconfirmed", and the same head passed in
                 `options.expectedHeads` confirms (BEH-AC-034, BEH-AC-035,
                 BEH-AC-036).
             20. Report wording: the report has no overall pass/fail; the
                 detection matrix of check 11 run through bundles gives the
                 same `verifiedThrough` as `verifyChain`; a bundle over an
                 encrypted series verifies after key destruction; keyed
                 links are "key-unavailable" without a MAC function, and
                 unkeyed links are "unkeyed-link" breaks with `expectKeyed`;
                 a bundle holding an audit series and a generic series gives
                 one `ChainReport` per series under its own profile, and
                 `expectKeyed` given as a set marks unkeyed links only in
                 the series it names; two keyed series under different
                 profiles verify with the merged `precomputeMacs`
                 functions of both (BEH-AC-034, BEH-AC-038, BEH-AC-039).
```

**Settled here.** (1) The bundle is a self-contained, canonical JSON export of
what is stored, breaks included, with trust roots from the request only
(BEH-AC-033, BEH-AC-037). (2) `verifyBundle` is pure and offline, and a receipt
that needs an online check is "not-checked", never confirmed (BEH-AC-034,
BEH-AC-036); an expected head carried in the bundle is never confirmed. (3) Pinned trust roots replace carried ones, and carried roots
are reported as such with fingerprints (BEH-AC-035). (4) The kit's
`bridger verify-chain` renders the report under the same wording rules
(BEH-AC-038).

**Open.** (1) Whether bundles too large for memory need a streaming
`verifyBundle` with the same result (as 03's open item 1 for `verifyChain`).
(2) Whether to define offline verifier adapters for specific transparency-log
formats in this package's testing entry point only, or leave all of them to
separate packages. (3) Whether the expected heads carried in a bundle should
themselves be signed statements, so that a carried head could be confirmed;
until such a form is specified, carried heads are never confirmed
(BEH-AC-034).

---

_Previous: [04 — Generic Chain](./04-generic-chain.md)_ · _Next: [Invariants](../invariants.md)_
