# 01 — Regulatory Scope

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-GX-GXP-01                                            |
> | Revision       | 0.3                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-GX-03 §5)           |
> | Approved by    | — (pending; single maintainer, see PROC-GX-03 §5)            |
> | Classification | GxP Compliance Document                                      |
> | Change History | 0.3 (2026-11-11): §8 describes core's companion row, "Companion" allocation and non-claim 5 as CCR-BR-015 and CCR-BR-031 left them; open item 3 closed (PL27) (CCR-GX-008)<br>0.2 (2026-11-09): Sealing is `@bridger/audit-chain`'s, adopted by the companion (C-09) (CCR-GX-002)<br>0.1 (2026-10-03): Initial draft (CCR-GX-001)                 |

---

This document states what `@bridger/gxp` — the companion — is for in a regulated setting, how it differs from the computerized system it is built into, what input it gives a regulated user's GAMP 5 categorization, which regulations and guidance it is written against, and what it can and cannot claim. It is the first of four GxP documents of the companion: the [compliance matrix](./02-compliance-matrix.md) answers each clause core allocated to the companion, the [risk assessment](./03-risk-assessment.md) scores the companion's hazards, and the [validation plan](./04-validation-plan.md) states how the companion and its evidence generator are themselves to be verified. It extends, and does not repeat, core's [regulatory scope](../../core/gxp/01-regulatory-scope.md) (§8).

## 1. Status: nothing is implemented

There is no companion code. No package `packages/gxp` exists, so nothing is verified, and the companion is not validated — nor could it be on its own (§3). Every statement in these documents is a statement of **intent**: what the companion is specified to do and which obligations it is specified to leave to others ([ADR-GX-026](../decisions/026-prospective-specification.md)). A requirement becomes evidence only when a test that exercises it has run against the installed package and passed, and its result was produced from runner output under [ADR-GX-021](../decisions/021-oq-from-runner-output.md). Until then every evidence cell in the compliance matrix reads *Planned*, and every verification entry in the risk register reads *Planned*.

## 2. Intended use

`@bridger/gxp` is a library that plugs into the optional ports `@bridger/core` leaves open for regulated use ([ADR-BR-034](../../core/decisions/034-gxp-companion-scope.md)) and supplies the companion's scope as core fixed it:

- **a trail adapter contract with conformance tests** — the `TrailStore` port, a sink that acknowledges core's writes only when the store reports them stored, and a suite that shows how a given adapter behaves under core's retry and fault paths ([02](../behaviors/02-trail-store-port.md)–[04](../behaviors/04-conformance-suite.md));
- **checks on read** — findings of named kinds over stored records, loss of the newest records against high-water marks held elsewhere, and optional seal verification through `@bridger/audit-chain` ([05](../behaviors/05-checks-on-read.md), [06](../behaviors/06-high-water-marks-and-anchors.md), [21](../behaviors/21-sealing-through-audit-chain.md));
- **approval and electronic-signature capture through core's gate** — a deny-by-default policy, signed single-use tickets, a signature port with a mandatory manifestation, and a gate that only checks a ticket ([08](../behaviors/08-approval-policy.md)–[12](../behaviors/12-approval-gate.md));
- **optional value fingerprints** — keyed fingerprints of allow-listed configuration values through core's `ConfigFingerprinter` port, so an approval can bind to a value without revealing it ([13](../behaviors/13-config-fingerprints.md)–[14](../behaviors/14-fingerprint-keys.md), [ADR-BR-039](../../core/decisions/039-config-fingerprint-port.md));
- **IQ/OQ evidence** — installation checks and operational evidence generated from executed tests, packed with their gaps, and trail export ([15](../behaviors/15-installation-checks.md)–[18](../behaviors/18-archive-and-export.md)).

**Intended use in a regulated setting.** The companion is a **set of components that a regulated user, or their supplier, assembles into the computerized system that embeds `@bridger/core`**, in order to *support* that system's obligations for plugin-lifecycle changes: recording them in a store the user owns, checking what was stored, approving a change before it is made, and producing test evidence for the components in the user's installation. Every store, identity, signature and key it uses is a port the user supplies ([ADR-GX-003](../decisions/003-ports-without-defaults.md)).

**Not intended uses.** The companion is not intended, and must not be relied on, to:

- store, retain, back up or archive records itself — every store is the user's, and an archive is a file set the user keeps ([ADR-GX-023](../decisions/023-archives-keep-original-bytes.md));
- authenticate a person, verify re-authentication, or bind an actor identifier to a person — the signature port attests these and the companion does not verify them ([ADR-GX-016](../decisions/016-signature-port-and-manifestation.md));
- prevent tampering, or show that a trail has not been altered beyond the reach of seal verification stated in §6;
- manage, rotate, store or back up keys ([ADR-GX-019](../decisions/019-key-provider-and-rotation.md));
- record or approve the application's own GMP data — the trail covers plugin-lifecycle changes only, as core's does;
- review audit trails, or supply performance qualification for any system (core non-claim 12, [ADR-BR-034](../../core/decisions/034-gxp-companion-scope.md)).

## 3. The companion and the computerized system

GxP obligations attach to a **computerized system** in its intended use. The companion is never such a system and never one on its own:

| Aspect | `@bridger/gxp` | The regulated user's computerized system |
| ------ | -------------- | ---------------------------------------- |
| Business function | None. It has no GMP function of its own. | Supports a GMP process; that use is what makes it regulated |
| Users and accounts | None. It never sees a password or a credential. | Users, accounts, roles and identity provider |
| Storage | None. It holds no record after acknowledging it and keeps no state across restarts. | Trail store, anchor store, ticket store, key store, backups |
| Signatures | Captures nothing itself; calls the user's `SignatureCapture` port and records what it attests, with a manifestation | Signature components, their controls, and the people behind them |
| Time | Takes every timestamp from Effect `Clock` | Clock source, its synchronisation and monitoring |
| Validation | Specified to supply test evidence for its components in one installation | Validated by the regulated user, in their intended use, under their quality system |

Because the companion has no intended use apart from the system that embeds it, the user's intended use of that system decides which of the companion's behaviours are GxP-relevant, and how much of the companion's evidence the user leverages. Validation applies to that system; the companion's evidence pack is an input to it and never a substitute ([ADR-GX-027](../decisions/027-claims-and-non-claims.md) non-claim 19).

## 4. GAMP 5 positioning

The companion follows the same life cycle as core: user requirements ([urs.md](../urs.md)), functional specification (the [behaviours](../behaviors/01-companion-boundary.md)), design decisions (the ADRs), invariants, risk assessment, verification planning and traceability ([traceability.md](../traceability.md)).

### 4.1 Category input for a regulated user

GAMP 5 software categories classify the software of a **system** as configured and used by the regulated user. The companion does not categorize itself; this section gives input to the user's categorization.

| Consideration | Input from this specification |
| ------------- | ----------------------------- |
| Nature of the software | A source-level library of ports, a sink, a gate, a fingerprinter and checking and evidence functions, called from the user's own code. It is not a configured product with a fixed function and not infrastructure software in the GAMP sense. |
| What the user writes | The adapters behind every port: trail store, anchor store, ticket store, signature capture, key provider; the approval policy and the fingerprint eligibility list; the code that assembles them with `GxpLayer.make`. |
| Normal outcome | When built into a regulated user's system, the companion's behaviour inside that system, together with the user's adapters, is normally treated as **Category 5 (custom software)**, as core's is. |
| Configuration elements | The approval policy and the eligibility list are configuration with GxP impact; each is identified by a digest that IQ records ([BEH-GX-061](../behaviors/08-approval-policy.md), [BEH-GX-113–BEH-GX-120](../behaviors/15-installation-checks.md)). A user who treats the companion as a configurable component must still assure the adapters as custom code. |
| What changes that outcome | Only the regulated user's assessment of their own system. Leveraging the companion's supplier testing is theirs to justify and record. |

The specification is written to Category 5 depth so that a user who treats the companion as custom software has the supplier-side material they need.

### 4.2 Supplier and regulated user

| Role | Who | Responsible for |
| ---- | --- | --------------- |
| Supplier — companion | Bridger maintainers (`@bridger/gxp`) | This specification and its change control ([PROC-GX-03](../process/change-control.md)); the behaviours and invariants; the conformance suite, installation checks and evidence generator; the planned automated test suite; honest documentation of limits ([ADR-GX-027](../decisions/027-claims-and-non-claims.md)) |
| Supplier — core | Bridger maintainers (`@bridger/core`) | The ports the companion plugs into, under core's own change control; the coupling rule binds the two ([PROC-GX-03](../process/change-control.md) §7) |
| Regulated user | The organisation operating the computerized system | Intended use, categorization, system risk assessment, supplier assessment; every adapter and its store; identity, authentication and re-authentication; signature controls; key custody; anchor-store custody; retention, review and archiving; clock synchronisation; IQ/OQ execution in their environment and PQ; procedures, training, periodic review |

Supplier documentation and testing may reduce the user's effort; they never transfer the user's accountability. The supplier has one maintainer and no independent reviewer ([change control](../process/change-control.md) §5); a user must weigh that in supplier assessment ([validation plan](./04-validation-plan.md) §10).

## 5. Regulations and guidance cited

The companion is written against the same instruments and editions as core ([core regulatory scope](../../core/gxp/01-regulatory-scope.md) §4). Each is cited by edition; where the exact date of an edition is not certain to the authors, only the year is given.

| Instrument | Edition and status | How the companion uses it |
| ---------- | ------------------ | ------------------------- |
| 21 CFR Part 11, *Electronic Records; Electronic Signatures* (US FDA) | Current codified text (rule of 1997), read with FDA's guidance *Part 11, Electronic Records; Electronic Signatures — Scope and Application* (2003) | Subpart B rows allocated to the companion, and Subpart C (11.50, 11.70, 11.200), in [compliance matrix](./02-compliance-matrix.md) §1 |
| EU GMP Annex 11, *Computerised Systems* (EudraLex Volume 4) | 2011 revision — **in force** | Rows allocated to the companion in [compliance matrix](./02-compliance-matrix.md) §2 |
| EU GMP Annex 11, draft revision | 2025 draft for public consultation — **not in force**; tracked only | Not mapped. Finalisation is a revalidation trigger ([validation plan](./04-validation-plan.md) §9) |
| PIC/S PI 041-1, *Good Practices for Data Management and Integrity in Regulated GMP/GDP Environments* | 2021 | ALCOA+ rows in [compliance matrix](./02-compliance-matrix.md) §3; the companion makes no data-integrity claim of its own from it |
| MHRA, *'GXP' Data Integrity Guidance and Definitions* | Revision 1, 2018 | ALCOA+ definitions; expectations on audit-trail review and on signature manifestation; no claim of meeting them is made |
| ICH Q9(R1), *Quality Risk Management* | 2023 | The process of the [risk assessment](./03-risk-assessment.md) §1 |
| ISPE GAMP 5, *A Risk-Based Approach to Compliant GxP Computerized Systems*, Second Edition | 2022 | Life cycle, categories, supplier roles, FMEA scoring; the title's word is not a claim about the companion |
| US FDA, *Computer Software Assurance for Production and Quality System Software* | Final guidance, 2025 | Risk-based rigour in the [validation plan](./04-validation-plan.md) §4 |
| IETF RFC 8785, *JSON Canonicalization Scheme (JCS)* | 2020 | Canonical form of every digested value ([ADR-GX-005](../decisions/005-jcs-and-sha256.md)) |
| NIST FIPS 180-4, *Secure Hash Standard*; FIPS 198-1, *The Keyed-Hash Message Authentication Code (HMAC)* | 2015; 2008 | SHA-256 digests; HMAC-SHA256 fingerprints ([ADR-GX-017](../decisions/017-hmac-through-the-core-port.md)). The titles are the standards' own; no property is claimed from them beyond the functions they define. |

Regulation text is paraphrased, never quoted at length. The user works from the official text.

## 6. The honest-claims rule

The companion assembles controls and tests them; it never makes a system compliant or validated. The rule is core's ([core regulatory scope](../../core/gxp/01-regulatory-scope.md) §5), inherited with its qadi precedent, and made stricter here because a companion for regulated users invites over-claiming ([RSK-GX-004](./03-risk-assessment.md#rsk-gx-004)):

1. **The verb is "supports".** A companion behaviour *supports* a user's compliance with a clause; it does not satisfy the clause. Every `**Regulatory:**` line of a behaviour says "supports" and nothing stronger (checker check 16).
2. **No status words.** No document may describe the companion, a store, a trail, a seal, a signature or a pack as validated, qualified, compliant, durable, tamper-evident, intact, immutable, authentic, secure, legally binding or non-repudiable, or say that it guarantees anything, except in a sentence that negates the word. The checker's claims lint enforces this sentence by sentence, with no escape word for "companion" (check 11, [ADR-GX-028](../decisions/028-checker-copy-and-adapt.md)).
3. **Checks state what they checked.** Checks on read report "no findings of the checked kinds" over a stated range, never that a trail is complete or unaltered ([ADR-GX-007](../decisions/007-checks-never-claim-integrity.md)).
4. **Sealing is "seal verification".** It detects alteration, insertion, removal or reordering of sealed records up to the last verified anchor, against a party that cannot also rewrite the separately held anchor store — and nothing else. The mechanism is `@bridger/audit-chain`'s, adopted by the companion ([ADR-GX-029](../decisions/029-sealing-through-audit-chain.md)).
5. **Attested is not verified.** Re-authentication and the §11.200 controls behind a signature are attested by the user's signature port; the companion records the attestation and does not verify it ([ADR-GX-016](../decisions/016-signature-port-and-manifestation.md)).
6. **No control in name only.** No port that stores, authenticates, signs, holds keys or decides has a default, not even a no-op; fixtures live only in `@bridger/gxp/testing`, are marked, and fail IQ ([INV-GX-001](../invariants.md#inv-gx-001-no-decision-port-has-a-default-outside-the-testing-entry-point), [INV-GX-014](../invariants.md#inv-gx-014-test-fixtures-are-detectable)).
7. **Evidence is runner output only, and gaps stay gaps** ([INV-GX-010](../invariants.md#inv-gx-010-evidence-results-come-only-from-runner-output-and-gaps-stay-gaps)).
8. **Limits are enumerated.** Core's non-claims 1–12 and the companion's 13–21 are listed in [ADR-GX-027](../decisions/027-claims-and-non-claims.md), the only document in which the forbidden words may be named.

## 7. Allocation vocabulary

The companion's [compliance matrix](./02-compliance-matrix.md) uses core's allocation values (`Core`, `Companion`, `Consumer`, `N/A`) with one change of meaning: **Companion** here means that this specification names the `BEH-GX`, `INV-GX` and `ADR-GX` identifiers that are specified to support the clause. It still means *specified*, not *implemented* and not *met*. Any clause that names the Consumer remains the regulated user's to demonstrate.

## 8. Relation to core's regulatory scope

| Topic | Core's [gxp/01](../../core/gxp/01-regulatory-scope.md) | This document |
| ----- | ------------------------------------------------------ | ------------- |
| Subject | `@bridger/core`, a plugin runtime | `@bridger/gxp`, the components that plug into core's audit, gate and fingerprinter ports |
| Intended use | Attributable, recordable, ordered, gateable plugin-set changes | Store, check, approve and evidence those changes through user-supplied ports |
| Companion row of the supplier table | Specified as a Draft in `references/gxp/`, linked here (CCR-BR-015, restored by CCR-BR-031) | That scope, specified (Draft) |
| Allocation "Companion" | Specified only as a Draft, not approved and not implemented; a plan that evidences nothing yet (URS gap G8 closed by CCR-BR-015) | Answered row by row with GX identifiers in the [compliance matrix](./02-compliance-matrix.md); still prospective |
| Non-claims | ADR-BR-034, non-claims 1–12, with non-claim 5 narrowed by CCR-BR-014 and, since CCR-BR-031, naming `@bridger/audit-chain` as the sealing specification the companion adopts | Inherited unchanged, plus non-claims 13–21 of ADR-GX-027 |
| Regulations | §4 table | The same instruments and editions, plus RFC 8785 and the FIPS hash and HMAC standards |

Core's documents are relied on at the revisions listed in the [core interface map](../appendices/core-interface-map.md) §6. Updating core's "Companion" rows to point here is a core change (CCR-BR) made under the coupling rule, not by this document.

## 9. Open items

| # | Item | Status |
| - | ---- | ------ |
| 1 | No implementation; no evidence | Open by design of this phase ([ADR-GX-026](../decisions/026-prospective-specification.md)) |
| 2 | Annex 11 2025 draft revision | Tracked; re-assessment under a CCR-GX when the final text is published |
| 3 | Core's "Companion" rows still read as unspecified | Closed: core's rows point to this Draft (CCR-BR-015, restored by CCR-BR-031) |
| 4 | Independent review of this specification | Not available (single maintainer); see [change control](../process/change-control.md) §5 |

---

_Next: [Compliance matrix](./02-compliance-matrix.md)_
