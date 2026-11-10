# Bridger Loader — Specification

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-LD-00                                                |
> | Revision       | 0.7                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification — Master Index (companion)          |
> | Change History | 0.7 (2026-11-10): Register row CCR-LD-005 (round 2 findings of the specification audit of 2026-11-09: P23) (CCR-LD-005)<br>0.6 (2026-11-09): Register row CCR-LD-004 (specification audit of 2026-11-09: F-06, M-02, M-03, M-06, C-16); contents row 09 and ADR-LD-008; honest-claims limit 3 and the remote dependency restated; honest-claims limit 3, ADR-LD-005 title and the remote row: guests run outside the host's runtime, not necessarily in another process (independent review); CCR-LD-004 row: resolutions of the independent review (guest wording, `stampRemote` error) (CCR-LD-004)<br>0.5 (2026-11-08): CCR-LD-003 extended with revision 2, resolutions of the round-2 agent review (R3-01–R3-05, R3-14–R3-16; offline review F3, F4, F29) (CCR-LD-003)<br>0.4 (2026-11-08): Register row CCR-LD-003; contents 07 and 08, ADR-LD-006–007; core dependencies 24 and 28; open questions answered (G60, G61) and G56 answered (round 2: recheck items 11, 12, 15; core alignment) (CCR-LD-003)<br>0.3 (2026-11-08): Register row CCR-LD-002 (resolutions of the agent review of 2026-11-08); Open questions section; dependencies on core updated (CCR-LD-002)<br>0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-LD-001)<br>0.1 (2026-11-08): Initial draft (CCR-LD-001)                 |

---

**implementation: absent**

This is the specification of `@bridger/loader`, an optional companion package
of `@bridger/core`. It fetches plugin packages, checks their digest, their
signatures and their revocation status **before** any of their code is
evaluated, evaluates exactly the bytes it checked, and fills the
`meta.version` and `meta.digest` labels that core carries but never computes
([ADR-BR-027](../core/decisions/027-core-exclusions.md)). It feeds revocations
into the desired state so that `reconcile` removes revoked digests — a kill
switch per digest — and publishes a catalog of signed manifests that can be
read without loading code. It depends on `@bridger/core`; `@bridger/core`
never depends on it.

## Status: prospective

Nothing described here is implemented. Every document is a `Draft`, every
decision is `Proposed`, and every source or test path is marked *Planned*.
The rules of the core specification apply unchanged
([ADR-BR-036](../core/decisions/036-prospective-specification.md),
[ADR-BR-035](../core/decisions/035-evidence-from-executed-tests.md)): this
specification is not evidence that the package behaves as described.

## The honest-claims rule

The loader is specified to **refuse to evaluate** packages whose digest,
signatures or revocation status do not satisfy the application's rules. It
makes **no** claim that loaded code is safe, that plugins are isolated from
one another or from the host, that removed code is reclaimed from memory, or
that adopting it makes a deployment compliant with any regulation. Three
limits recur in every document because they are the easiest to lose:

1. **Verification is provenance, not containment.** Code evaluated in the
   host's process has the host's authority and can defeat any in-process
   check ([BEH-LD-041](./behaviors/06-limits-and-acceptance.md#beh-ld-041-verification-establishes-provenance-not-containment)).
2. **No reclamation.** Replacing, removing or revoking a plugin leaves its
   module in memory until the process restarts; the loader reports which
   revoked code is still resident
   ([BEH-LD-042](./behaviors/06-limits-and-acceptance.md#beh-ld-042-no-reclamation-and-no-control-of-run-time-code-fetching)).
3. **In-process loading is for first-party code.** The loader evaluates a
   package in the host's process only under a "first-party" statement that
   the application's own rule accepts; every other package is fetched and
   verified here and run by `@bridger/remote` behind a proxy plugin, outside
   the host's runtime, in the bundle runtime the deployment chose — which may
   be a worker thread of the same process and confines nothing by itself ([ADR-LD-005](./decisions/005-in-process-loading-is-for-first-party-code.md),
   [ADR-LD-008](./decisions/008-in-process-eligibility-is-a-signed-statement.md)).

## Reading order

| Step | Document | Purpose |
| ---- | -------- | ------- |
| 1 | [Overview](./overview.md) | Mission, package boundary, public API surface, worked example, limits |
| 2 | [Behaviours](./behaviors/01-package-and-digest.md) | What the package must do, as `BEH-LD` requirements |
| 3 | [Invariants](./invariants.md) | Properties that hold for every execution |
| 4 | [Decisions](./decisions/001-verify-before-evaluate.md) | Why, as `ADR-LD` records |
| 5 | [Traceability](./traceability.md) | BEH → INV → ADR → REQ, and risk notes |

Readers new to Bridger should first read core's
[01 — Plugin definition](../core/behaviors/01-plugin-definition.md),
[18 — Reconciliation and confluence](../core/behaviors/18-reconciliation-and-confluence.md)
and [25 — Operation gate](../core/behaviors/25-operation-gate.md).

## Contents

### Behaviours

| # | File | Identifiers |
| - | ---- | ----------- |
| 01 | [Package and digest](./behaviors/01-package-and-digest.md) | BEH-LD-001–008 |
| 02 | [Load pipeline](./behaviors/02-load-pipeline.md) | BEH-LD-009–016 |
| 03 | [Signature policy](./behaviors/03-signature-policy.md) | BEH-LD-017–024 |
| 04 | [Revocation and kill switch](./behaviors/04-revocation-and-kill-switch.md) | BEH-LD-025–032 |
| 05 | [Catalog and lazy loading](./behaviors/05-catalog-and-lazy-loading.md) | BEH-LD-033–040 |
| 06 | [Limits and acceptance](./behaviors/06-limits-and-acceptance.md) | BEH-LD-041–048 |
| 07 | [Signed statements](./behaviors/07-signed-statements.md) | BEH-LD-049–056 |
| 08 | [Data packs](./behaviors/08-data-packs.md) | BEH-LD-057–064 |
| 09 | [Trust class and guest links](./behaviors/09-trust-class-and-guest-links.md) | BEH-LD-065–072 (065–071 used) |

### Decisions

| ID | Title |
| -- | ----- |
| [ADR-LD-001](./decisions/001-verify-before-evaluate.md) | Verify before evaluate, and evaluate the verified bytes |
| [ADR-LD-002](./decisions/002-package-digest-commits-to-manifest-sbom-and-files.md) | The package digest commits to the manifest, the SBOM and the files |
| [ADR-LD-003](./decisions/003-n-of-m-signature-policy-with-no-default.md) | An N-of-M signature policy over verifier adapters, with no default |
| [ADR-LD-004](./decisions/004-revocation-acts-through-desired-state.md) | Revocation acts through desired state and reconcile |
| [ADR-LD-005](./decisions/005-in-process-loading-is-for-first-party-code.md) | In-process loading is for first-party code; other code is fetched for guests run outside the host's runtime |
| [ADR-LD-006](./decisions/006-one-verification-step-for-every-signed-statement.md) | One verification step for every signed statement |
| [ADR-LD-007](./decisions/007-data-packs-are-verified-never-evaluated.md) | Data packs are verified and served as bytes, never evaluated |
| [ADR-LD-008](./decisions/008-in-process-eligibility-is-a-signed-statement.md) | In-process eligibility is a signed statement of its own, and guests reach the host as remote links |

## Dependencies on core

| Core document | What this package uses | Owner |
| ------------- | ---------------------- | ----- |
| [01 — Plugin definition](../core/behaviors/01-plugin-definition.md), [11 — Configuration](../core/behaviors/11-configuration.md) | Definitions accepted from a dynamic import (BEH-BR-008); `meta` opaque, `version` and `digest` compared, never verified by core (BEH-BR-104) | Core (existing) |
| [18 — Reconciliation and confluence](../core/behaviors/18-reconciliation-and-confluence.md) | `reconcile`, ownership scopes, "same definition" by version and digest (BEH-BR-154) | Core (existing) |
| [19 — Contribution registry](../core/behaviors/19-contribution-registry.md) | The catalog registry | Core (existing) |
| [02 — Host construction](../core/behaviors/02-host-construction.md) | `AcceptedDigests` and `RevocationSource` given to the host as a `Context` base (BEH-BR-012) | Core (existing) |
| [22 — Attributable operations](../core/behaviors/22-attributable-operations.md), [23 — Audit sink and record](../core/behaviors/23-audit-sink-and-record.md), [25 — Operation gate](../core/behaviors/25-operation-gate.md) | Kill-switch actors; `definition.digest` on records and on gate requests, installed digest for plugin-addressed operations (BEH-BR-219); system transitions never gated (BEH-BR-223) | Core (existing) |
| [26 — Versioned contracts](../core/behaviors/26-versioned-contracts.md) | Version range syntax for catalog resolution | CCR-BR-017 |
| [27 — Manifest and lazy activation](../core/behaviors/27-manifest-and-lazy-activation.md) | Manifest schema, `Plugin.lazy({ manifest, load, digest })` with the digest beside the manifest, loading in the build step, triggers, reconcile without evaluating code | CCR-BR-017, CCR-BR-022 |
| [28 — Plugin principal and mandatory policy](../core/behaviors/28-plugin-principal-and-mandatory-policy.md) | `RefusalList` backed by the revocation set (BEH-BR-267); `AccessPolicy.declaredOnly` compares registrations with signed manifest declarations (BEH-BR-268) | CCR-BR-026 |
| [24 — Time, ids and sequence](../core/behaviors/24-time-ids-and-sequence.md) | `Host.controls.buildTimeout` read by the loader plugin (BEH-BR-212) | CCR-BR-026 |
| [32 — Generic gate and plan](../core/behaviors/32-generic-gate-and-plan.md) | `Gate<OperationRequest>`, `Gate.all` with a timeout per piece, `OperationGate.fromGate` for `LoaderGate` | CCR-BR-019, CCR-BR-022 |
| [references/remote/](../remote/README.md) | Running verified guest bundles outside the host's runtime: `Remote.define` with `RemoteOptions.manifest`, `Transport.fromBundle` and `BundleRuntime` (remote BEH-RM-072) for `LoaderRemote.link`; the remote boundary reads `RevokedDigests` (remote BEH-RM-014); an optional peer dependency of the entry point `@bridger/loader/remote` only | CCR-RM-001, CCR-RM-004 (Draft) |

No new core seam is needed for the behaviours specified here. The entry file
and export are carried in core's `extensions` record under the loader's own
key, `extensions["@bridger/loader"]`, which core keeps and never reads (core
BEH-BR-241); the loader's mismatch error is named `PackageManifestMismatch`,
so it no longer shares a tag with core's `ManifestMismatch` (core BEH-BR-246).

## Open questions

The two questions this package recorded for core are answered:

1. **System starts of a revoked digest** (core gap G60, closed by CCR-BR-026).
   Core's `RefusalList` is consulted before every start, system starts
   included (core BEH-BR-267); the loader backs it with its revocation set
   ([07](./behaviors/07-signed-statements.md), BEH-LD-056). An `active`
   plugin is still stopped only by `disable` or `remove` (the kill switch).
2. **`buildTimeout` is observable** (core gap G61, closed by CCR-BR-026).
   `Host.controls` reports it (core BEH-BR-212), and the loader plugin reads
   it ([06](./behaviors/06-limits-and-acceptance.md), BEH-LD-046).

Core gap G56 (a named signing and verification step for the kit and the
federation companion) is answered by `SignaturePolicy.verify`, `Statement` and
`StatementSigner` ([07](./behaviors/07-signed-statements.md), BEH-LD-050,
BEH-LD-054); closing it is for core's change control.

## Identifier scheme

| Prefix | Meaning |
| ------ | ------- |
| `BEH-LD-NNN` | Functional behaviour requirement (blocks of eight per file) |
| `INV-LD-NNN` | Runtime invariant |
| `ADR-LD-NNN` | Architecture decision |
| `REQ-LD-NNN` | Acceptance scenario (planned) |
| `CCR-LD-NNN` | Change control record of this package |
| `BRIDGER-LD-*` | Document ID |

The rules of the core [identifier scheme](../core/process/requirement-id-scheme.md)
apply, with infix `LD`. Risks are not given an `LD` series: hazards this
package introduces or reduces are carried in the core register
([traceability](./traceability.md) §3).

## Document history

| CCR | Date | Change |
| --- | ---- | ------ |
| CCR-LD-005 | 2026-11-10 | Round 2 findings of the specification audit of 2026-11-09, loader side. This is an agent review, not the independent review of PROC-03 §5. **Finding resolved.** P23 (`LoaderGate` refused subagent and model-family installs, with an id exemption as the only workaround): BEH-LD-015 now states that installs made by core realm families and ephemeral realms are ordinary installs, and documents the two supported wirings — definitions returned by a load of the current loader instance, or bundled definitions with an application-set `meta.digest` listed in `exempt.digests`; an id exemption is not to be documented for them, and no exemption by realm is offered, because a realm is not a boundary (core BEH-BR-150). Check 6 (REQ-LD-006) gains the cross-companion scenario with the agent companion (subagent spawn and model family member). No new option or identifier.<br>**Impact (PROC-03 §3).** (1) Identifiers: BEH-LD-015 and BEH-LD-048 (check 6) amended; REQ-LD-006 summary amended; none added or withdrawn. (2) Risk: none new; keeps RSK-BR-017 controls intact by refusing a realm exemption; no score changed. (3) GxP impact: no — documentation and a test scenario; the gate's decisions are unchanged. (4) Revalidation: none (implementation absent); REQ-LD-006 covers the change. (5) Compatibility: none; no type or behaviour changes. |
| CCR-LD-004 | 2026-11-09 | Specification audit of 2026-11-09, loader side. This is an agent review, not the independent review of PROC-03 §5. **Findings resolved.** F-06 (partner code could run in the host's process through the catalog): a reserved statement type "first-party", signed by the application's own release authority under its own rule with no default, is the only way a package becomes eligible for in-process evaluation (file 09, BEH-LD-065, INV-LD-009, ADR-LD-008); `load` verifies it at step 4 after the "package" statement, `fetchVerified` does not; catalog entries carry its signatures and a trust class derived from them alone, demoted to "guest" when the statement is revoked (BEH-LD-066); `Loader.lazy` fails with `NotFirstParty` for a guest entry (BEH-LD-067); `LoaderRemote.link` (entry point `@bridger/loader/remote`) is the catalog-to-guest path: a remote link built from the verified entry alone, whose transport runs `fetchVerified` at each session attempt and hands the verified bytes to a bundle runtime of the remote companion (BEH-LD-068, remote BEH-RM-072); the worked example maps entries by trust class. Alternatives rejected (ADR-LD-008): a `trust` field in the signed manifest, which a partner could set; classes inferred from which signers satisfied the "package" rule; an unsigned feed marker; fetching guest bundles once at sync; a lazy guest link, whose manifest could not agree with a link that provides nothing. M-02 (the signed manifest never reached eager definitions): the stamped definition carries the signed manifest, replacing one the code declared, and the loader's agreement check now covers what core's covers (`optional`, contract versions and methods) (BEH-LD-007); a link carries a manifest derived from its guest's — resolution fields re-shaped, every label kept — set by `LoaderRemote.link` and `stampRemote` (BEH-LD-069). M-03 (no manifest field named the entry file): confirmed that core's `PluginManifest.extensions`, "namespaced by the companion that owns them" and never read by core (core BEH-BR-241), carries it with no core change; the entry file and export are the reserved key `extensions["@bridger/loader"]`, decoded with `LoaderManifestExtension`, refused at step 2 with `PackageMalformed` ("entry") (BEH-LD-001, BEH-LD-014). M-06 (signer and statement revocations did not reach the remote boundary): the `RevokedDigests` view computes, once, the package digests revoked by digest, statement digest or signer, and serves the refusal list, `filterDesired`, `LoaderGate` and the remote boundary (BEH-LD-070, BEH-LD-056; remote BEH-RM-014 under CCR-RM-004). C-16 (two errors tagged `ManifestMismatch`): the loader's is renamed `PackageManifestMismatch` (BEH-LD-007, BEH-LD-014, BEH-LD-039; kit error catalog under CCR-KT-004). Acceptance checks 5, 15 and 16 amended and 25–30 added (BEH-LD-071, REQ-LD-025–030). **Independent review of these changes.** Confirmed and fixed: the text said a guest runs "out of process", which the remote companion's `@bridger/worker` bundle runtime — a worker thread of the host's own process — makes false, and that only the application's own code can be marked first-party, which nothing enforces. The guest path keeps every bundle runtime, and the wording is now exact: a guest is never evaluated in the host's runtime (its heap, module graph and globals) and runs in the bundle runtime the deployment chose, possibly in the host's process; a package is evaluated in the host's runtime exactly when the application's "first-party" rule accepts a statement for it, which the application may sign for any package (file 09 introduction and BEH-LD-065 documentation; BEH-LD-039 heading and text, the note of file 02, INV-LD-009, ADR-LD-005 title and context, ADR-LD-008, overview, honest-claims limit 3). Forbidding the worker runtime for guests was rejected: other runtimes share a process too (isolates), so "process" is not the unit the loader can promise, and what confines a guest is the deployment's in every case. Confirmed and fixed: `stampRemote` reported a manifest without the guest shape as `PackageManifestMismatch`, whose `field` cannot name `activation`, `contributions` or `listens`; it now fails with `GuestEntryInvalid`, as `LoaderRemote.link` does (BEH-LD-039, check 16).<br>**Impact (PROC-03 §3).** (1) Identifiers: added BEH-LD-065–071 (BEH-LD-072 reserved), INV-LD-009, ADR-LD-008, REQ-LD-025–030; amended BEH-LD-001, 004, 007, 009, 014, 033, 034, 037, 038, 039 (heading changed), 043, 048 (checks 5, 15, 16), 049, 051, 056, 065, INV-LD-001, INV-LD-004, INV-LD-009 (text), ADR-LD-005 (title), ADR-LD-008, REQ-LD-005, 016; nothing withdrawn. (2) Risk: strengthens the controls of RSK-BR-013 (third-party code evaluated in-process), RSK-BR-017, RSK-BR-043 (a key accepted for "package" never makes code in-process) and RSK-BR-044 (one revocation answer for every consumer, the remote boundary included); no score changed by this record; one residual stated, not scored: revoking only a first-party statement does not stop an in-process plugin already running, which takes revoking its package digest (BEH-LD-065). (3) GxP impact: yes — which code may run in the host's process becomes a recorded, signed decision, and the manifest that reaches the gate request, `consentDiff` and `declaredOnly` is the signed one. (4) Revalidation trigger: none; nothing is implemented, released or qualified (implementation absent); REQ-LD-005 and REQ-LD-016 updated and REQ-LD-025–030 added. (5) Compatibility: draft to draft only — `Loader.lazy` returns an `Effect` failing with `NotFirstParty`; `ManifestMismatch` (loader) becomes `PackageManifestMismatch` and gains field "optional"; `PackageRef.firstParty`, `CatalogEntry.firstParty`, `VerifiedEntry.trust`; every package manifest must carry `extensions["@bridger/loader"].entry`; in-process loads need a "first-party" rule; `Revocation.refusalList` requires `RevokedDigests`; `stampRemote` sets `manifest` and fails with `GuestEntryInvalid` for a manifest without the guest shape; new entry point `@bridger/loader/remote` with an optional peer dependency on `@bridger/remote`; no core type changed. |
| CCR-LD-003 | 2026-11-08 | Round 2: recheck items 11, 12 and 15, contradiction X9 (G56), and alignment with core CCR-BR-024–026. Item 11: typed signed statements (`package`, `host-manifest`, `data-pack`, `licence`, `revocation-list`, or an application's own type) with the type inside the signed bytes; `SignaturePolicy.verify({ statementType, subject: digest \| bytes })` as the one verification step used by the load pipeline, the catalog, data packs, the kit and the federation companion; one acceptance rule per statement type with no fallback; revocation of any statement by subject digest, statement digest or signer, with the pure `Revocation.check`; `Statement.signingInput` and the `StatementSigner` port as the signing step, countersigning as an added signer entry outside every digest (closes X9; G56 answered). Item 12: data packs — a package kind with a manifest (`schemaId`, `issuedAt`, `effectiveFrom`, `effectiveUntil`, `maxAge`) and a payload, its own digest domain, verified as a "data-pack" statement, served as held bytes and never evaluated, window and freshness reported with `DataPackStale`, no rollback, withdrawal on revocation. Item 15: the manifest `publisher` must match a verified signer's configured `publishers` or `identity`, otherwise `PublisherMismatch`. Core alignment: `Revocation.refusalList` backs core's `RefusalList` (K4; G60 closed); the loader plugin reads `Host.controls.buildTimeout` (G61 closed); undo requests judged by `LoaderGate` as the operations they issue; catalog carries manifest `role`, `target` and `listens`; lazy `idle`/`holdTimeout` passed through with a fresh check on each reload; refused lazy starts; open questions answered.<br>**Impact (PROC-03 §3).** (1) Identifiers: BEH-LD-049–064, INV-LD-007–008, ADR-LD-006–007, REQ-LD-017–024 added; BEH-LD-009, 014, 015, 016, 017, 019, 021, 025, 026, 034, 037, 040, 043, 046 amended; nothing withdrawn. (2) Risk: bears on RSK-BR-043 (per-type rules, publisher binding), RSK-BR-044 (system starts refused through core's `RefusalList`), RSK-BR-017; one hazard proposed (stale reference data used as current, [traceability](./traceability.md) §3); no score changed by this record. (3) GxP impact: yes — the loader's record now covers every signed statement, and revocation reaches system starts through core; activating a data pack is not a host operation and is recorded by the loader only. (4) Revalidation: nothing released (implementation absent); REQ-LD-017–024 added, REQ-LD-006 and 015 still apply. (5) Compatibility: draft API changes (`PackageStatement` becomes the generic `Statement` with `statementType: "package"`; signed payload type `application/vnd.bridger.statement+json`; `TrustedSigner.publishers`; `SignatureRejected` gains `statementType` and reason "no-rule"; `VerificationRecord` gains statement fields; `LoaderPlugin` loses the `buildTimeout` option and provides `StatementVerifier`); no core type changed.<br>**Revision 2 (2026-11-08): resolutions of the round-2 agent review** (review R3, findings R3-01–R3-05, R3-14, R3-15, R3-16; review R4, findings F3, F4 and F29 on the loader side). R3-01: `SignedStatement` envelope; one fixed subject, `id` and `version` convention per reserved type (host-manifest id = JCS of [authority, host], revision in decimal; revocation-list id = issuer); the exact `verify` call shape every caller, the federation companion included, MUST use; readers compare decoded id and version with the envelope's. R3-02: revocation lists verified only by the revocation source, under a separate revocation trust root, with steps 1–4 and 6 and no revocation step; `StatementRules` may hold no "revocation-list" rule; a list may revoke its own signers, effective from the next list; recorded as the one exception in ADR-LD-006. R3-03: revocation by statement digest reaches `filterDesired`, the kill switch and `Revocation.refusalList` through the `AcceptedDigests` record, since core submits only the definition's own digest to `RefusalList` (core BEH-BR-267, CCR-BR-029) and the mapping is the loader's; `Revoked.by` gains "statement-digest". R3-04: the data-pack store keeps manifest bytes, payload and signatures; restart re-verification uses `reverify` (held revocations apply, `maxAge` does not) and withheld packs are listed in `DataPacks.restored`. R3-05: an equal data-pack version with a different digest is refused ("equivocation"). R3-14: publisher binding on the first satisfied branch of `anyOf`, no fallback after `PublisherMismatch`. R3-15: statement-digest revocation scope stated. R3-16: "chain-bundle" reserved. F3/F29: `SignedRevocationList`, `RevocationSet.encode`/`decode`, `RawRevocationFeed` and `RevocationSource.offer` defined here, breaking the wiring cycle with federation. F4: the kill switch's scope excludes other revocation actuators.<br>**Impact of revision 2 (PROC-03 §3).** (1) Identifiers: none added or withdrawn; BEH-LD-025–029, 049, 050, 052, 053, 055, 056, 059, 062, 064 (checks 17–19, 22–24), BEH-LD-048 (check 10), ADR-LD-006 and REQ-LD-010, 017–019, 022–024 amended. (2) Risk: strengthens the controls for RSK-BR-043 and RSK-BR-044 (one statement shape for every signer and verifier, statement-digest revocation on system starts, no circular trust in revocation lists); no score changed by this record. (3) GxP impact: yes — which revocations stop which starts, and which data packs survive a restart, change. (4) Revalidation: nothing released (implementation absent); REQ-LD-010, 017–019, 022–024 updated. (5) Compatibility: draft API changes (`RevocationSource.verified` options, `RevocationSourceShape.offer`, `RevocationSource.constant`, `RevocationSet.issuer`, `VerifyRequest.reverify`, `VerificationRecord.reverified`, `VerifiedDataPack` and `DataPackStore` shapes, `Revoked.by`, new tag `RevocationListMalformed`); the federation companion's calls must change to the stated shape (requested of its owner); no core type changed. |
| CCR-LD-002 | 2026-11-08 | Resolutions of the agent review of 2026-11-08 (review R4, findings LD-B1, LD-M1–LD-M6, LD-m1–LD-m8): `Loader.lazy` builds with core's `Plugin.lazy({ manifest, load, digest })` and package manifests carry no `digest` (LD-B1); `LoaderGate` is a core `Gate<OperationRequest>` piece built before the host over a shared `AcceptedDigests` base service, with explicit exemptions for bootstrap and bundled plugins and a stated effect of replacing the loader (LD-M1); verified catalog entries count as accepted for lazy installs (LD-M2); `enable`, `retry`, `restart` and `reconfigure` of a revoked installed digest are refused, with the limit of ungated system transitions stated (LD-M3); direct loads stay outside transitions, lazy loads run in the build slot with the loader's timeouts inside `buildTimeout` (LD-M4); missing verification records fail closed and re-evaluation uses the acceptance time (LD-M5); the kill switch is the one reconciler of its scope, with the application's actor for desired-list changes and the revocation actor for removals only (LD-M6); double signing means two signer entries (LD-m1); Sigstore log evidence checked against a pinned log key (LD-m2); signers revoked by identity (LD-m3); blast-radius guard and threshold recommendation (LD-m4); evaluator option narrowed (LD-m5); `Loader.stampRemote` (LD-m6); `VerificationRecord` fields per step and refusal-record failures (LD-m7); un-revocation and store rollback stated (LD-m8). Open questions for core recorded above.<br>**Impact (PROC-03 §3).** (1) Identifiers: no identifier added or withdrawn; BEH-LD-001, 015, 016, 018–020, 025, 026, 028–032, 037–039, 043, 046, 048, INV-LD-003, INV-LD-005, ADR-LD-001, 003, 004 amended; the heading of BEH-LD-029 changed. (2) Risk: bears on RSK-BR-043 and RSK-BR-044 (controls strengthened; one control-introduced hazard, the revocation channel's blast radius, stated with its mitigation); no score changed by this record. (3) GxP impact: yes — attribution of kill-switch changes (21 CFR 11.10(e)) and the gate piece's decisions change. (4) Revalidation: nothing released (implementation absent); REQ-LD-005–007, 012, 013, 015, 016 updated. (5) Compatibility: draft API changes (`LoaderGate.check` replaced by `make`/`piece`; `KillSwitch.run` options; `filterDesired` signature; `VerificationRecord` fields); no core type changed. |
| CCR-LD-001 | 2026-11-08 | Initial draft: package of manifest, SBOM and files with a digest committing to three sub-digests; fixed pipeline fetch → digest → acceptance rule → revocation → predicates → evaluate from held bytes, with no bypass; `meta.version` and `meta.digest` stamped; `LoaderGate` gate piece; `LoadLog` port; N-of-M signature policy with roles (double signing), Ed25519 and Sigstore verifier adapters, no default rule; signed, monotonic revocation sets with explicit `maxAge`; kill switch as desired-state filter plus `reconcile`; catalog of signed manifests verified without code on a core `ContributionRegistry`; `Loader.lazy` over `Plugin.lazy`; `fetchVerified` for out-of-process guests; limits (no containment, no reclamation). BEH-LD-001–048, INV-LD-001–006, ADR-LD-001–005, REQ-LD-001–016.<br>**Impact (PROC-03 §3).** (1) Identifiers: all listed are new; no core identifier changed by this record (core edits are proposed separately to the core change control). (2) Risk: bears on RSK-BR-017 (primary control once adopted), RSK-BR-013, RSK-BR-014, RSK-BR-018; three new hazards proposed for the core register ([traceability](./traceability.md) §3); no score changed by this record. (3) GxP impact: yes — the package decides which code may run in a host whose changes are audited, and adds its own verification record. (4) Revalidation: nothing released or qualified (implementation absent); REQ-LD-001–016 are to cover it. (5) Compatibility: new package; no core public type, record field or `schemaVersion` changes. |

---

_Next: [Overview](./overview.md)_
