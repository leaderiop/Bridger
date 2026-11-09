# Requirement Identifier Scheme

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-GX-PROC-01                                           |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-GX-03 §5)           |
> | Approved by    | — (pending; single maintainer, see PROC-GX-03 §5)            |
> | Classification | Procedure                                                    |
> | Change History | 0.2 (2026-11-09): §5: eighteen checks; check 17 covers the record vector of file 03, the I-JSON number form and vector blocks outside the listed files; check 18 pinned core and audit-chain revisions (F-01) (CCR-GX-002)<br>0.1 (2026-10-03): Initial draft (CCR-GX-001)                 |

---

This procedure is self-contained: it governs `references/gxp/` and nothing
else. Core's scheme ([BRIDGER-PROC-01](../../core/process/requirement-id-scheme.md)) is its model and
is cited only where the two trees meet.

## 1. Package infix

Every identifier in this specification uses the infix **`GX`** (GxP
companion). The infix keeps these identifiers distinct from core's `BR`
series, which this tree cites constantly, and from the sibling `qadi`
specification (`QD`). Document IDs use the prefix `BRIDGER-GX-`, because core
already uses `BRIDGER-GXP-NN` for its own GxP documents
([ADR-GX-002](../decisions/002-own-tree-and-gx-series.md)).

## 2. Identifier registry

| Prefix | Meaning | Defined in | Range |
| ------ | ------- | ---------- | ----- |
| `URS-GX-NNN` | User requirement | `urs.md` §3 headings | 001– |
| `NFR-GX-NNN` | Non-functional requirement | `urs.md` §4 headings | 001– |
| `BEH-GX-NNN` | Functional behaviour requirement | `behaviors/NN-*.md` headings | 001– |
| `INV-GX-NNN` | Runtime invariant | `invariants.md` headings | 001– |
| `ADR-GX-NNN` | Architecture decision | `decisions/NNN-*.md` | 001– |
| `REQ-GX-NNN` | Acceptance scenario (planned `.feature` or test tag `@REQ-GX-NNN`) | `traceability.md` §5 | 001– |
| `RSK-GX-NNN` | Risk (ICH Q9(R1) / GAMP 5 FMEA) | `gxp/03-risk-assessment.md` | 001– |
| `CCR-GX-NNN` | Change control record | `README.md` Document history | 001– |
| `BRIDGER-GX-*` | Document ID | Document Control headers | — |

Core identifiers (`URS-BR`, `NFR-BR`, `BEH-BR`, `INV-BR`, `ADR-BR`, `REQ-BR`,
`RSK-BR`, `CCR-BR`) are never defined here. They are cited as links into
`../core` (or `../../core` from a subdirectory), and every one cited must be
listed in the [core interface map](../appendices/core-interface-map.md) (check 14).

Rows of the compliance matrix (`gxp/02-compliance-matrix.md`) are keyed by the
regulatory clause itself, as in core. A clause is a requirement on a regulated
user's system, not on this package.

### Document IDs

| Document ID | File |
| ----------- | ---- |
| `BRIDGER-GX-00` | `README.md` |
| `BRIDGER-GX-OVW` | `overview.md` |
| `BRIDGER-GX-GLOSSARY` | `glossary.md` |
| `BRIDGER-GX-URS` | `urs.md` |
| `BRIDGER-GX-INV` | `invariants.md` |
| `BRIDGER-GX-TRACE` | `traceability.md` |
| `BRIDGER-GX-ROADMAP` | `roadmap.md` |
| `BRIDGER-GX-BEH-NN` | `behaviors/NN-*.md` |
| `BRIDGER-GX-ADR-NNN` | `decisions/NNN-*.md` |
| `BRIDGER-GX-GXP-NN` | `gxp/NN-*.md` |
| `BRIDGER-GX-PROC-NN` | `process/*.md` (01 this document, 02 Definitions of Done, 03 Change control) |
| `BRIDGER-GX-APP-NN` | `appendices/*.md` (01 core interface map, 02 Qadi audit comparison) |

In running text the procedures are cited as PROC-GX-01, PROC-GX-02 and
PROC-GX-03, and core's as PROC-03 (never unqualified in this tree when the
core document is meant: write "core's PROC-03").

## 3. Allocation rules

```
REQUIREMENT: Identifiers are permanent. A withdrawn requirement keeps its
             identifier and is marked "Withdrawn"; the number MUST NOT be
             reused. Reuse would silently repoint every existing
             cross-reference, in this tree and in core's interface records.
```

```
REQUIREMENT: BEH-GX identifiers are allocated in blocks of eight per
             behaviour file (sixteen for file 20). A file MUST use its block
             contiguously from the first number; the unused remainder of the
             block is reserved for later insertion and is not a gap.
             `behaviors/index.yaml` records each file's block.
```

```
REQUIREMENT: All other GX series are allocated contiguously from 001. A gap
             is permitted only where an identifier has been withdrawn, and
             the withdrawal MUST be recorded in the document that defined it.
```

## 4. Document Control

```
REQUIREMENT: Every Markdown document in this specification MUST begin with a
             Document Control table carrying, in this order: Document ID,
             Revision, Effective Date, Status, Author, Reviewed by, Approved
             by, Classification, Change History.
```

```
REQUIREMENT: Document Status MUST be one of Draft, In Review, Approved,
             Effective, Superseded, Withdrawn. ADR Status MUST be one of
             Proposed, Accepted, Superseded, Withdrawn (optionally followed
             by " — " and a note, for example "Proposed — amends ADR-GX-013").
```

```
REQUIREMENT: While `implementation: absent` is declared in the README, no
             document may be Effective and no ADR may be Accepted. A decision
             is accepted when the code and the test that demonstrate it exist
             ([ADR-GX-026](../decisions/026-prospective-specification.md)).
```

The Reviewed by and Approved by rows exist so that the gap is visible rather
than implied. This specification has a single maintainer, who authors and
approves; independent review sits with the regulated user's quality unit
until a second reviewer exists ([change control](./change-control.md) §5).

## 5. Cross-reference obligations

`scripts/verify-traceability.sh` checks the following mechanically
([ADR-GX-028](../decisions/028-checker-copy-and-adapt.md)). Checks 1–11 carry over core's checks of
the same number, adapted to the `GX` series, check 11 with a stricter lint;
checks 12–18 are new or changed: 12 and 13 extend core's link and register
checks into core's tree, 14–18 are the companion's own, and core's check 14
(SPEC.md coverage) has no counterpart.

1. The root `index.yaml` names the package `bridger-gxp` and the infix `GX`, and each of the root, `behaviors`, `decisions`, `gxp`, `process` and `appendices` has an `index.yaml` for package `bridger-gxp` that matches the Markdown files on disk.
2. Every `INV-GX-NNN` has a row in `traceability.md` §2; every ADR file has a row in §3 and an entry in `decisions/index.yaml` with the same status.
3. Every `URS-GX` and `NFR-GX` heading in `urs.md` has a row in its §6 traceability table.
4. Every `RSK-GX` cites at least one defined `BEH-GX` or `INV-GX` as its control and has a row in `traceability.md` §7.
5. Every compliance-matrix allocation is one of `Core`, `Companion`, `Consumer`, `N/A` (or a `+`-joined combination), and every `GX` identifier cited anywhere is defined.
6. Identifiers are unique; each `BEH-GX` lies inside its file's registered block; other series are contiguous.
7. Every `BEH-GX` heading carries a reference blockquote and at least one `REQUIREMENT:` block using RFC 2119 keywords.
8. Every document carries a complete Document Control table with a Document ID beginning `BRIDGER-GX-` and an allowed status, and none claims `Effective` or `Accepted` while the implementation is absent.
9. Source and test paths marked *(Planned)* report `PLANNED`; a path marked Planned that exists on disk fails, and so does a path marked Exists that is missing.
10. Every `REQ-GX` is defined once in `traceability.md` §5 and cites defined `BEH-GX` identifiers.
11. Claims lint, stricter than core's (below).
12. Every relative link resolves, including its `#anchor`, and links into `../core` are followed and their anchors checked against the core document.
13. Every `CCR-GX` cited is in this README's document history; every `CCR-BR` cited is in core's README document history.
14. Every `URS`, `NFR`, `BEH`, `INV`, `ADR`, `REQ` or `RSK` identifier with the `BR` infix cited anywhere is defined in core and listed in `appendices/core-interface-map.md`; with `--strict`, an identifier listed in the map that no other document cites also fails.
15. Core's checker, `bash references/core/scripts/verify-traceability.sh --strict`, runs and succeeds.
16. Every `**Regulatory:**` line begins with the verb "supports" and uses no verb of conformance ("satisfies", "meets", "complies", "compliant", "fulfils", "ensures", "achieves", "conforms").
17. The test vectors in ```` ```vector ```` blocks of `behaviors/03-trail-sink.md`, `behaviors/09-approval-tickets.md` and `behaviors/13-config-fingerprints.md` recompute, every fingerprint string in them has the format of BEH-GX-099, and no other file holds a ```` ```vector ```` block.
18. Every row of the core interface map's §6 names a document of `references/core` or `references/audit-chain` whose Document Control shows the same Document ID and Revision as the row, and every core document the map links to has a row (change control §7).

**Check 11, claims lint.** The restricted words are *validated*, *qualified*,
*compliant*, *compliance-ready*, *tamper-evident*, *tamper-proof*, *durable*,
*durability*, *integrity*, *intact*, *immutable*, *authentic* and its forms
other than those of "authenticate" and "authentication" (*authentic*,
*authenticity*), *non-repudiation* and its forms, *legally binding*,
*guarantee* and its forms, and *secure*. A sentence that contains one passes
only if the same sentence contains one of the escape words *not*, *no*,
*never*, *nor*, *neither*, *without*, *cannot*, *does not*, *makes no*, *out of
scope*, *consumer* or *regulated user*, or if the line is listed in
`scripts/claims-allowlist.txt`. Unlike core's lint, "companion", "claim" and
"responsib…" are not escape words, and a negation on a preceding sentence does
not count. *Tamper-proof* fails even when negated, except in
[ADR-GX-027](../decisions/027-claims-and-non-claims.md) and on allowlisted lines. The lint reads
prose, table rows and `REQUIREMENT:` blocks; it skips ```` ```ts ````,
```` ```typescript ````, ```` ```vector ````, ```` ```json ````, ```` ```yaml ````,
```` ```bash ```` and ```` ```sh ```` blocks, whose identifiers are code. Every allowlist entry
must still match a line, or the check fails.

**Settled here.** The words of "authenticate" are exempt from the lint because
21 CFR 11.200 and the signature port use "authentication" as a technical term
for an event the implementer performs (method, components, re-authentication);
the restricted claim is that a record or signature *is authentic*, which the
companion never asserts ([ADR-GX-016](../decisions/016-signature-port-and-manifestation.md)).

**Check 17, test vectors.** Each ```` ```vector ```` block holds one JSON
object. In files 03 and 09 it has the keys `input`, `canonical` and `sha256`; in file
13 it has `key_hex`, `input`, `canonical` and `hmac_b64url`. The checker
canonicalises `input` with RFC 8785 over the I-JSON domain —
object keys sorted by UTF-16 code units, separators `,` and `:` with no whitespace,
strings escaped as JSON with non-ASCII characters left literal, numbers written
as ECMAScript's Number-to-String writes them (RFC 8785 §3.2.2.3) — and requires the result to equal `canonical`; it then
requires `sha256` (bare, or after a `sha256:` prefix) to equal the lower-case
hex SHA-256 of the UTF-8 bytes of `canonical`, or `hmac_b64url` to equal the unpadded base64url HMAC-SHA256 of
those bytes under the key `key_hex`. A vector whose input contains a
non-finite number or an integer beyond ±(2^53 − 1) fails, because I-JSON does
not define its form ([ADR-GX-005](../decisions/005-jcs-and-sha256.md)); revision 0.1 also failed non-integer
numbers, which core records may now carry.

**Check 18, pinned revisions.** The core interface map's §6 pins the revision
of every core document it relies on, and of the `@bridger/audit-chain`
documents the adopted sealing relies on, as rows `` `tree/path` `` | Document ID |
Revision. The check reads each document's Document Control and fails on any
difference, so that a core or audit-chain change that has not been assessed
under the coupling rule cannot go unnoticed; a re-pin is made only in a
CCR-GX that records the assessment ([change control](./change-control.md) §7). Every string in a vector that begins `fp1:`, and
every value of a `fingerprint` key, must have the format of [BEH-GX-099](../behaviors/13-config-fingerprints.md#beh-gx-099-a-fingerprint-is-hmac-sha256-over-the-canonical-form-of-scope-plugin-path-form-and-value-written-as-fp1hmac-sha256keyidmac): the prefix
`fp1:hmac-sha256:`, a key id matching `^[A-Za-z0-9._:-]{1,64}$`, and, after
the last `:`, 43 base64url characters that encode 32 bytes.

## 6. Reference syntax

Cross-references are relative Markdown links whose text is the identifier. The
anchor is the GitHub slug of the heading: lower case, every character other
than a letter, digit, space or hyphen removed, spaces replaced by hyphens.

```markdown
[INV-GX-002](../invariants.md#inv-gx-002-a-binding-is-consumed-at-most-once)
[ADR-GX-013](../decisions/013-single-use-tickets.md)
[RSK-GX-006](../gxp/03-risk-assessment.md#rsk-gx-006)
[BEH-BR-219](../../core/behaviors/25-operation-gate.md)
```

Each `## BEH-GX-NNN` heading carries a reference blockquote directly beneath
it, with the lines `**Invariant:**`, `**See:**`, `**Satisfies:**`,
`**Risk:**` and, for behaviours that bear on a regulation,
`**Regulatory:** supports …`. The verb is fixed by check 16: the companion
supports a regulated user's compliance; it does not satisfy a regulation.
Core identifiers a behaviour builds on appear in its `**See:**` line.

## 7. Directory registries

Every specification directory contains an `index.yaml`, in core's format with
the companion's package and infix:

```yaml
kind: behaviors
package: bridger-gxp
infix: GX
entries:
  - file: "09-approval-tickets.md"
    id: "BRIDGER-GX-BEH-09"
    title: "Approval tickets"
    range: "BEH-GX-065..072"
```

The registry is the authoritative list. A file on disk but absent from
`index.yaml`, or the reverse, fails verification (check 1).

---

_Next: [Definitions of Done](./definitions-of-done.md)_
