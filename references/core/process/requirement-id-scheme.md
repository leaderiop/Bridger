# Requirement Identifier Scheme

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-PROC-01                                              |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Process Specification                                        |
> | Change History | 0.1 (2026-10-02): Initial draft (CCR-BR-001)                 |

---

## 1. Package infix

Every identifier in this specification uses the infix **`BR`** (Bridger). The
infix keeps these identifiers distinct from the sibling `qadi` specification
(`QD`), which is frequently read alongside this one because Bridger's ERP layer
uses qadi for authorization.

## 2. Identifier registry

| Prefix | Meaning | Defined in | Range |
| ------ | ------- | ---------- | ----- |
| `URS-BR-NNN` | User requirement | `urs.md` §3 headings | 001– |
| `NFR-BR-NNN` | Non-functional requirement | `urs.md` §4 headings | 001– |
| `BEH-BR-NNN` | Functional behaviour requirement | `behaviors/NN-*.md` headings | 001– |
| `INV-BR-NNN` | Runtime invariant | `invariants.md` headings | 001– |
| `ADR-BR-NNN` | Architecture decision | `decisions/NNN-*.md` | 001– |
| `REQ-BR-NNN` | Acceptance scenario (planned `.feature` tag) | `traceability.md` §5 | 001– |
| `RSK-BR-NNN` | Risk (ICH Q9(R1) / GAMP 5 FMEA) | `gxp/03-risk-assessment.md` | 001– |
| `CCR-BR-NNN` | Change control record | `README.md` Document history | 001– |
| `BRIDGER-*` | Document ID | Document Control headers | — |

Rows of the compliance matrix (`gxp/02-compliance-matrix.md`) are keyed by the
regulatory clause itself (for example `21 CFR 11.10(e)` or `Annex 11 §9`), not
by a Bridger series. A clause is not a requirement of this library; it is a
requirement on a regulated user's system, and the matrix records how this
library's identifiers support it.

### Document IDs

| Document ID | File |
| ----------- | ---- |
| `BRIDGER-00` | `README.md` |
| `BRIDGER-OVW` | `overview.md` |
| `BRIDGER-GLOSSARY` | `glossary.md` |
| `BRIDGER-URS` | `urs.md` |
| `BRIDGER-INV` | `invariants.md` |
| `BRIDGER-TRACE` | `traceability.md` |
| `BRIDGER-ROADMAP` | `roadmap.md` |
| `BRIDGER-BEH-NN` | `behaviors/NN-*.md` |
| `BRIDGER-ADR-NNN` | `decisions/NNN-*.md` |
| `BRIDGER-GXP-NN` | `gxp/NN-*.md` |
| `BRIDGER-PROC-NN` | `process/*.md` (01 this document, 02 Definitions of Done, 03 Change control) |
| `BRIDGER-APP-NN` | `appendices/*.md` |

## 3. Allocation rules

```
REQUIREMENT: Identifiers are permanent. A withdrawn requirement keeps its
             identifier and is marked "Withdrawn"; the number is never reused.
             Reuse would silently repoint every existing cross-reference and
             invalidate the traceability matrix.
```

```
REQUIREMENT: BEH-BR identifiers are allocated in blocks per behaviour file
             (eight, or sixteen for large files). A file uses its block
             contiguously from the first number; the unused remainder of the
             block is reserved for later insertion and is not a gap.
             `behaviors/index.yaml` records each file's block.
```

```
REQUIREMENT: All other series are allocated contiguously. A gap is permitted
             only where an identifier has been withdrawn, and the withdrawal
             must be recorded in the document that defined it.
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
             Proposed, Accepted, Superseded, Withdrawn (optionally qualified,
             for example "Proposed — amends ADR-BR-020").
```

```
REQUIREMENT: While `implementation: absent` is declared in the README, no
             document may be Effective and no ADR may be Accepted. A decision
             is accepted when the code and the test that demonstrate it exist
             ([ADR-BR-036](../decisions/036-prospective-specification.md)).
```

The Reviewed by and Approved by rows exist so that the gap is visible rather
than implied. This specification currently has a single maintainer, who
authors and approves; independent review is therefore an obligation that sits
with the regulated user's quality unit until a second reviewer exists. See
[change control](./change-control.md) §5.

## 5. Cross-reference obligations

Every identifier participates in the traceability chain. The following are
checked mechanically by `scripts/verify-traceability.sh`:

1. Every directory's `index.yaml` matches the files present on disk.
2. Every `INV-BR-NNN` in `invariants.md` has a row in `traceability.md` §2; every ADR file has a row in §3 and an entry in `decisions/index.yaml` with the same status.
3. Every `URS-BR` and `NFR-BR` heading in `urs.md` has a row in its §6 traceability table.
4. Every `RSK-BR` cites at least one defined `BEH-BR` or `INV-BR` as its control and has a row in `traceability.md` §7.
5. Every compliance-matrix allocation is one of `Core`, `Companion`, `Consumer`, `N/A` (or a `+`-joined combination), and every identifier it cites is defined.
6. Identifiers are unique; each `BEH-BR` lies inside its file's registered block; other series are contiguous.
7. Every `BEH-BR` heading carries a reference blockquote and at least one `REQUIREMENT:` block using RFC 2119 keywords.
8. Every document carries a complete Document Control table with an allowed status, and none claims `Effective` or `Accepted` while the implementation is absent.
9. Source and test paths marked *(Planned)* report `PLANNED`; a path marked Planned that exists on disk fails, forcing the status to be updated.
10. Every `REQ-BR` is defined once in `traceability.md` §5 and cites defined `BEH-BR` identifiers.
11. Restricted claim words (*validated*, *qualified*, *compliant*, *tamper-evident*, *durable*) appear only on lines listed in `scripts/claims-allowlist.txt`, and every allowlisted line still exists.
12. Every relative link resolves, including its `#anchor`.
13. Every `CCR-BR` cited anywhere is in the README document history.
14. Every heading of `docs/SPEC.md` appears in `appendices/spec-md-migration-map.md`, and `docs/SPEC.md` carries its superseded banner.

## 6. Reference syntax

Cross-references are relative Markdown links whose text is the identifier. The
anchor is the GitHub slug of the heading: lower case, every character other
than a letter, digit, space or hyphen removed, spaces replaced by hyphens.

```markdown
[INV-BR-003](../invariants.md#inv-br-003-publication-is-atomic)
[ADR-BR-002](../decisions/002-plugin-build-is-a-layer.md)
[URS-BR-005](../urs.md#urs-br-005-never-lose-a-provider-in-the-middle-of-a-call)
```

Unlike qadi's scheme, anchors **are** verified (check 12): an anchor that names
no heading fails the gate.

Each `## BEH-BR-NNN` heading carries a reference blockquote directly beneath it:

```markdown
## BEH-BR-081: A lease is the one admission primitive

> **Invariant:** [INV-BR-006](../invariants.md#inv-br-006-a-leased-provider-does-not-close-under-its-lease)
> **See:** [ADR-BR-015](../decisions/015-leases-one-primitive.md)
> **Satisfies:** [URS-BR-005](../urs.md#urs-br-005-never-lose-a-provider-in-the-middle-of-a-call)
> **Risk:** [RSK-BR-001](../gxp/03-risk-assessment.md#rsk-br-001)
```

GxP behaviours add a `**Regulatory:**` line naming the clauses they *support*.
The verb is deliberate: a library supports a regulated user's compliance; it
does not satisfy a regulation.

## 7. Directory registries

Every specification directory contains an `index.yaml`:

```yaml
kind: behaviors
package: bridger-core
infix: BR
entries:
  - file: "09-leases.md"
    id: "BRIDGER-BEH-09"
    title: "Leases"
    range: "BEH-BR-081..088"
```

The registry is the authoritative list. A file on disk but absent from
`index.yaml`, or the reverse, fails verification.

---

_Next: [Definitions of Done](./definitions-of-done.md)_
