# Bridger Kit — Companion Specification

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-KT-00                                                |
> | Revision       | 0.7                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Companion Specification — Master Index                       |
> | Change History | 0.7 (2026-11-10): Register row CCR-KT-005 (audit round 2: error catalog completed, H11; catalog rows aligned with the round's fixes); follow-ups added to its row; `GuestTransportError` follow-up added (CCR-KT-005)<br>0.6 (2026-11-09): Register row CCR-KT-004 (audit of 2026-11-09: F-06, F-07, C-16, C-19, M-03, U-12 catalog row); CCR-KT-004 row extended with the catalog follow-ups (core CCR-BR-032, CCR-BR-033 and the data-plane records) and local contracts (BEH-KT-017, 020, 033); Promise SDK bullet and ADR-KT-004 title: never evaluated in the host's runtime (independent review); CCR-KT-004 row: resolutions of the independent review (guest and first-party wording, `CommandRefused` reasons) (CCR-KT-004)<br>0.5 (2026-11-08): CCR-KT-003 extended (round-2 integration: catalog rows for durable-bus and federation tags) (CCR-KT-003)<br>0.4 (2026-11-08): CCR-KT-003 extended with revision 2, resolutions of the round-2 agent review (R3-10–R3-13) (CCR-KT-003)<br>0.3 (2026-11-08): Register row CCR-KT-003; commands `countersign` and `verify-chain`; appendix B (round 2: recheck items 11, 14, 17; core alignment) (CCR-KT-003)<br>0.2 (2026-11-08): Register row for CCR-KT-002 (CCR-KT-002)<br>0.1 (2026-11-08): Initial draft (CCR-KT-001)                 |

---

**implementation: absent**

This is the specification of `@bridger/kit`, the developer-experience
companion of `@bridger/core`. It gives the people who adopt Bridger a shorter
path than the raw core API:

- a `definePlugin` facade that writes the `Layer` for the author, checks the
  declared keys against what the code uses with readable type errors, and
  removes the casts that the prototype's tests needed
  ([appendix A](./appendices/a-cast-inventory.md));
- `PluginTest.mount` and `it.plugin`, a test harness on top of core's
  `TestHost`;
- conformance kits (`Conformance.verify`) generated from versioned contracts;
- a `bridger` command line: `create`, `dev`, `test`, `check`, `pack`,
  `publish`, `countersign`, `verify-chain`, `inspect`;
- a Promise SDK, generated from contract schemas, for partners whose code runs
  behind the [remote companion](../remote/invariants.md), never evaluated in
  the host's runtime, and who never learn Effect;
- a read-only devtools inspector (dependency graph, why a plugin is waiting,
  leases, timeline, `inspect --json`);
- an error catalog: every error tag of core and of the companions, with cause,
  example and fix.

Human-facing guides built on this specification live in
[docs/guides/](../../docs/guides/README.md).

## Status: prospective

Nothing described here is implemented. Every document is a `Draft`, every
decision is `Proposed`, and every source or test path is marked *Planned*. The
line `implementation: absent` above has the meaning it has in the
[core README](../core/README.md): while it says `absent`, no document here may
call itself Effective and no decision may call itself Accepted
([ADR-BR-036](../core/decisions/036-prospective-specification.md)).

This specification is not evidence that the package behaves as described. A
requirement becomes evidence only when a test that exercises it has run and
passed ([ADR-BR-035](../core/decisions/035-evidence-from-executed-tests.md)).
The one exception in kind, not in status, is [appendix A](./appendices/a-cast-inventory.md):
its counts were taken by compiling a scratch copy of the prototype with the
casts removed. That is evidence about the prototype's types, not about the kit.

## The honest-claims rule

The [core rule](../core/README.md#the-honest-claims-rule) applies unchanged.
In particular this package makes **no** claim that:

- a plugin written with the facade is correct because it type-checks — the
  type check covers the keys a build uses, not what a returned method reaches
  at call time ([BEH-BR-002](../core/behaviors/01-plugin-definition.md));
- a conformance pass proves that a provider honours its contract — it proves
  that the executed cases passed;
- the Promise SDK, the remote companion or any process boundary is a sandbox —
  isolation is the deployment's (gap report §7 rule 1;
  [ADR-BR-019](../core/decisions/019-realms-are-resolution-namespaces.md));
- `pack` and `publish` make a package trustworthy — signing and verification
  are the [loader companion's](../loader/behaviors/01-package-and-digest.md);
- the devtools timeline is an audit trail — it is built on `Host.events`, a
  lossy diagnostic feed ([BEH-BR-113](../core/behaviors/13-observability-and-diagnostics.md)).

## What stays in core, in other companions and in the application

- **Core** keeps every semantic: lifecycle, leases, legality, attribution,
  audit, gate. The kit adds none ([ADR-KT-001](./decisions/001-kit-is-sugar-and-tools-over-core.md)).
  It needs one small new core type, `Plugin.Any`
  ([ADR-KT-002](./decisions/002-plugin-any-is-the-contravariant-top.md)), and
  uses the seams listed in the [overview](./overview.md#core-seams-used).
- **Remote** owns transports, sessions, epochs and `Guest.serve`; the SDK runs
  behind it. **Loader** owns the package format, digests, signing and
  revocation; `pack` and `publish` call it.
- **The application** decides whether and how the inspector is exposed, which
  partners exist, and its own release process.

## Reading order

| Step | Document | Purpose |
| ---- | -------- | ------- |
| 1 | [Overview](./overview.md) | Mission, package boundary, public API surface, worked example |
| 2 | [Behaviours](./behaviors/01-plugin-facade.md) | What the package must do, as `BEH-KT` requirements |
| 3 | [Invariants](./invariants.md) | Properties that hold for every execution |
| 4 | [Decisions](./decisions/001-kit-is-sugar-and-tools-over-core.md) | Why, as `ADR-KT` records |
| 5 | [Appendix A — cast inventory](./appendices/a-cast-inventory.md) | The evidence behind the facade types |
| 6 | [Guides](../../docs/guides/README.md) | Persona guides (informative) |

## Contents

### Behaviours

| # | File | Identifiers |
| - | ---- | ----------- |
| 01 | [Plugin facade](./behaviors/01-plugin-facade.md) | BEH-KT-001–008 |
| 02 | [Plugin test harness](./behaviors/02-plugin-test.md) | BEH-KT-009–016 |
| 03 | [Conformance kits](./behaviors/03-conformance-kits.md) | BEH-KT-017–024 |
| 04 | [Command line](./behaviors/04-cli.md) | BEH-KT-025–032 |
| 05 | [Promise SDK](./behaviors/05-promise-sdk.md) | BEH-KT-033–040 |
| 06 | [Devtools inspector](./behaviors/06-devtools-inspector.md) | BEH-KT-041–048 |
| 07 | [Error catalog](./behaviors/07-error-catalog.md) | BEH-KT-049–056 |
| 08 | [Required acceptance checks](./behaviors/08-required-acceptance-checks.md) | BEH-KT-057–064 |

Each file owns a block of eight identifiers; unused numbers at the end of a
block are reserved, not gaps, as in core
([identifier scheme](../core/process/requirement-id-scheme.md) §3).

### Decisions

| ADR | Title |
| --- | ----- |
| [ADR-KT-001](./decisions/001-kit-is-sugar-and-tools-over-core.md) | The kit is sugar and tools over core, never a second runtime |
| [ADR-KT-002](./decisions/002-plugin-any-is-the-contravariant-top.md) | `Plugin.Any` is the contravariant top of plugin definitions, with a phantom brand |
| [ADR-KT-003](./decisions/003-conformance-suites-from-versioned-contracts.md) | Conformance suites are generated from versioned contracts and run cumulatively within a major |
| [ADR-KT-004](./decisions/004-promise-sdk-for-out-of-process-partners.md) | Partners get a generated Promise SDK and run behind a transport, never in the host's runtime |
| [ADR-KT-005](./decisions/005-devtools-are-read-only.md) | Devtools are read-only views over core observation |

### Appendices (informative)

| Appendix | Purpose |
| -------- | ------- |
| [A — Cast inventory](./appendices/a-cast-inventory.md) | Every cast in the prototype's tests and `src/plugin.ts`, classified, with the facade type that removes it |
| [B — Partner publishing guide](./appendices/b-partner-publishing.md) | From a packed partner bundle to a package a host accepts: pack, publish, countersign, upload, refusals |

## Identifier scheme

| Prefix | Meaning |
| ------ | ------- |
| `BEH-KT-NNN` | Functional behaviour requirement (blocks of eight per file) |
| `INV-KT-NNN` | Runtime invariant |
| `ADR-KT-NNN` | Architecture decision |
| `REQ-KT-NNN` | Acceptance scenario (planned), defined in [08](./behaviors/08-required-acceptance-checks.md) |
| `CCR-KT-NNN` | Change control record |

Document IDs: `BRIDGER-KT-00` (this file), `BRIDGER-KT-OVW`, `BRIDGER-KT-INV`,
`BRIDGER-KT-BEH-NN`, `BRIDGER-KT-ADR-NNN`, `BRIDGER-KT-APP-A`, `BRIDGER-KT-APP-B`. The rules of the
[core identifier scheme](../core/process/requirement-id-scheme.md) apply with
the infix `KT`; changes follow [core change control](../core/process/change-control.md).

## Document history

| CCR | Date | Change |
| --- | ---- | ------ |
| CCR-KT-001 | 2026-11-08 | Initial draft of the `@bridger/kit` companion specification (gap report item 17, roadmap step B7, risk "Effect learning curve"): plugin facade, test harness, conformance kits, command line, Promise SDK, devtools inspector, error catalog; cast inventory of the host-core prototype (appendix A); persona guides under `docs/guides/`.<br>**Impact (PROC-03 §3).** (1) Identifiers: BEH-KT-001–006, 009–014, 017–022, 025–031, 033–038, 041–046, 049–052, 057; INV-KT-001–007; ADR-KT-001–005; REQ-KT-001–024 added; nothing withdrawn. Core: one new type `Plugin.Any` requested as an amendment to BEH-BR-001, BEH-BR-017, BEH-BR-127 and BEH-BR-153 (registered by the integration CCR, not here). (2) Risk: two new core risks proposed (development reload reaching a controlled host; a facade or generated SDK that hides a contract mismatch), owned Core + Companion; no existing score changes. (3) GxP impact: no for the kit's own behaviour — every host mutation it causes goes through core's attributed, gated and audited operations (INV-KT-004); yes, indirectly, in that `bridger dev` must never attach to a host with a sink or gate wired (BEH-KT-026). (4) Revalidation: none; nothing is implemented or qualified. (5) Compatibility: `Plugin.Any` widens what `install` accepts only for branded definitions; no public type of core is narrowed. |
| CCR-KT-002 | 2026-11-08 | Resolutions of the agent review of 2026-11-08 (finding R5-13; R5-23 in `docs/guides/plugin-author-guide.md`), aligned with core CCR-BR-022: BEH-KT-052 and `docs/guides/error-catalog.md` gain `AgentStepLimit`, `SessionNotFound`, `StoreError`, `TaskNotFound`, `TaskNotResumable`, `TaskAwaitTimeout`, `TaintDraftStoreError`, `SubagentFailed`, `SubagentToolNotInParent`, `SubagentParentUnattributed`, `ReplayDiverged`, `JsonSchemaUnsupported`, `ImportedToolFailed`, `DefinitionUnresolved`, `PlanUnknown` and `ApprovalMismatch`, and the other companions' tags found missing (`CallbackDenied`, `MethodNotServed`, `NotAPluginDefinition`, `LoadLogFailed`, `CatalogEntryRejected`, `NoMatchingEntry`, `EntitlementConfigError`, `HistoryUnavailable`, `KeyedHashFailed`, `RebootstrapFailed`) (the agent, MCP and command ones now declared as `Schema.TaggedError` in their behaviour files, so BEH-KT-051 sees them); `PluginNotFound` replaced by core `UnknownPlugin`; no new core tag found in CCR-BR-022; `bridger dev` digests follow core's lazy and manifest digest rules (BEH-KT-026); the guide's `reconcile` snippet carries `DesiredPlugin.id`.<br>**Impact (PROC-03 §3).** (1) Identifiers: none added or withdrawn; BEH-KT-026 and BEH-KT-052 amended. (2) Risk: none changed. (3) GxP impact: none. (4) Revalidation: none (implementation absent). (5) Compatibility: catalog entries added only. |
| CCR-KT-003 | 2026-11-08 | Round 2: recheck items 11 (kit side), 14 (kit side) and 17, contradiction X9 (G56, kit side), and alignment with core CCR-BR-024–026. `publish` signs through the loader's named step — `Statement.make`, `Statement.signingInput`, a `StatementSigner` adapter — and reports what the policy still needs with `SignaturePolicy.verify` (BEH-KT-030; loader BEH-LD-050, BEH-LD-054); new `bridger countersign` adds a second signer entry without changing the package (BEH-KT-032); new `bridger verify-chain <bundle>` runs the audit chain's pure `verifyBundle` offline and prints what was checked, with no overall verdict (BEH-KT-047); partner publishing guide as [appendix B](./appendices/b-partner-publishing.md) (informative; for `docs/guides/` linking by the guides owner). Error catalog rows for core `PolicyMismatch`, `AccessRefused`, `DigestRefused`, `CallLogUnavailable`, `InvalidCallEntry`, `ApplyRolledBack`, `PartialApply`, loader `PublisherMismatch`, `StatementRevoked`, `SigningFailed`, `DataPackStale`, `DataPackStoreFailed`, audit-chain `SeriesConfigInvalid`, `BundleExportFailed`; `EntitlementConfigError`, `SignatureRejected` and `Revoked` rows updated. Core alignment: emitted manifests carry `role`, `target` and `listens`; `dev --cold`, non-atomic reloads and G65; inspector renders "refused-digest", `plugin-idled`, `held-event-dropped`, `reconcile-partial` and breaker scope; core fixtures `scriptedRefusalList` and `memoryCallLog` re-exported.<br>**Impact (PROC-03 §3).** (1) Identifiers: BEH-KT-032, BEH-KT-047, REQ-KT-025–027 added; BEH-KT-013, 026, 029, 030, 045, 052, 057 and INV-KT-007 amended; appendix B added; nothing withdrawn. (2) Risk: bears on RSK-BR-043 (publisher binding and countersigning surfaced by tooling) and RSK-BR-045 (offline bundle checks worded as detection only); no score changed. (3) GxP impact: no for the kit's own behaviour — it changes no host and signs through an adapter; indirectly yes, since `verify-chain` is a tool an inspector may use and its wording rules apply. (4) Revalidation: none (implementation absent); REQ-KT-025–027 added. (5) Compatibility: commands and catalog entries added; `publish` output changes; no core type changed.<br>**Revision 2 (2026-11-08): resolutions of the round-2 agent review** (review R3, findings R3-10, R3-11, R3-12, R3-13). R3-10: `bridger verify-chain` loads offline receipt verifiers (`--verifier`) and chain profiles (`--profile`) from the inspector's machine, lists each by path and digest, and takes the inspector's own expected heads (`--expect-head`); without them only audit series are verified and no receipt can be confirmed offline. R3-11: exit code 4 when nothing inconsistent was found but the check is incomplete (carried roots, unchecked receipts, unconfirmed heads, unknown profiles). R3-12: `publish` and `countersign` print "policy unknown" and run no verification without the deployment's rules; with them they build a `StatementVerifier` with an explicit revocation source (or `unbounded`, with a warning) and no `LoadLog`. R3-13: `publish` takes `--signer`; appendix B follows. Catalog rows for the loader and audit-chain changes of the same review (`RevocationListMalformed`; `PackageRefused`, `SignatureRejected`, `Revoked`, `SeriesConfigInvalid`).<br>**Impact of revision 2 (PROC-03 §3).** (1) Identifiers: none added or withdrawn; BEH-KT-030, 032, 047, 052 and appendix B amended. (2) Risk: bears on RSK-BR-018 (a CI script can no longer read an incomplete bundle check as exit 0); no score changed. (3) GxP impact: yes — what `verify-chain`'s exit code says about an inspection. (4) Revalidation: nothing released (implementation absent). (5) Compatibility: draft CLI changes (new options and exit code 4).<br>**Integration extension (round-2 integration, CCR-BR-029).** BEH-KT-052 rows `OutboxFrozen` and `IncarnationUnavailable` (durable-bus BEH-DB-048, BEH-DB-004); `RebootstrapBlocked` gains "kept-needs-in-store" and "no-incarnation-source"; `RevocationListStale` raised on an `offer` answer `NotNewer`; a note that the federation status events `revocation-rejected`, `kill-held` and `rebootstrap-revision-mismatch` and remote `WireExit.InProgress` are not tags. Impact: (1) BEH-KT-052 amended, nothing added or withdrawn; (2) no risk or score changed; (3) GxP impact: none (catalog text); (4) none (implementation absent); (5) catalog rows only. |
| CCR-KT-004 | 2026-11-09 | Resolutions of the audit of 2026-11-09, kit side: findings F-06 (partner code reached through the catalog), F-07 (identity claims sent to partner processes by default), C-16 (catalog name collision), C-19 (callback clients generated from `requires`), M-03 (the bundle entry has no manifest key), and the catalog row for U-12 (agent drafts left pending). This is an agent review, not the independent review of PROC-03 §5. F-07: `CallContext.claims` carries exactly the identity claims the host's link discloses (`RemoteOptions.disclose`), none by default; the link records a disclosing link as a data transfer; claims are descriptions and grant nothing (BEH-KT-034, INV-KT-006, ADR-KT-004; remote BEH-RM-024). C-19: callback clients are generated from `requested.capabilities`, never from `requires`; a request the link has not granted is refused with `CallbackDenied` ("not-granted") (BEH-KT-035; remote BEH-RM-043). F-06 and M-03: the partner template's manifest has the guest shape (one `provides`, no `requires`, `optional`, `activation`, `contributions` or `listens`) and `pack` refuses anything else; `pack` writes the bundle entry to `extensions["@bridger/loader"].entry`; a partner package is never marked first-party and runs only as a guest through `LoaderRemote.link` (BEH-KT-029, BEH-KT-036; loader BEH-LD-001, BEH-LD-065–068); `bridger countersign --statement first-party` lets the application's own release authority mark its own code (BEH-KT-032); appendix B describes the guest path, per-session fetch and verification, and the opt-in identity disclosure. C-16: catalog row `ManifestMismatch` (loader) renamed `PackageManifestMismatch`, the core row unchanged; rows `NotFirstParty`, `GuestEntryInvalid` (loader 09) and `DraftWithdrawalFailed` (agent 02) added (BEH-KT-052). Check 28 covers the above. Persona guides (`docs/guides/partner-sdk-guide.md`, `docs/guides/error-catalog.md`) follow. Follow-up from core's CCR-BR-032 (C-02): the error catalog (BEH-KT-052) and `docs/guides/error-catalog.md` gain `InvalidRealm` (`defineRealm` refuses to isolate `Bridger.Host` or `Bridger.Events`; core BEH-BR-145). Follow-up from the data-plane records of the same audit: entries `CommitConflict` (CCR-DB-004), `SupersessionPending` (CCR-SQ-003) and `ShredUnattributed` (CCR-KR-003); `NotOwner` aligned with sequence BEH-SQ-002 (`current`, no exception); `CommandRefused` gains admission refusals ("admission-unavailable" and policy reasons such as "budget-exhausted", CCR-CM-004). Catalog completeness for the data-plane companions: `SnapshotFailed` (all reasons, "prepare-failed" of CCR-DB-004 included), `MalformedBatch`, `UnknownEnvelopeFormat`, `EvolveFailed`, `UpcasterRemoved` and `LedgerUnavailable`, each specified before this audit but missing from both catalogs, are added. Follow-ups of core CCR-BR-033: local contracts (core `Contract.local`, BEH-BR-225, 232) — `bridger sdk generate` refuses one with the remote companion's `LocalContractRefused` before writing (BEH-KT-033); a local contract's suite holds author cases only, and `Conformance.verify` refuses generated cases or a wire subject for it, while its author cases run against a plugin subject (BEH-KT-017, BEH-KT-020); acceptance check 29 and REQ-KT-029. Catalog: `InvalidDefinition` is raised by `enable` and is a phase "load" cause (core BEH-BR-246, BEH-BR-346); entry `LocalContractRefused`; `CallbackDenied` reason "local-contract". **Independent review of these changes.** Confirmed and fixed: appendix B, BEH-KT-036 and the partner SDK guide said a partner package is never marked first-party and never runs in the host's process; an application can sign a first-party statement for any package, and the `@bridger/worker` bundle runtime runs a guest in a worker thread of the host's process. They now say a partner cannot mark its own package first-party, an application can, and a guest is never evaluated in the host's runtime but runs where the deployment chose (appendix B §1 and §7, BEH-KT-036, the introduction of file 05, ADR-KT-004 title and context, this README; guides README rule 2, partner SDK guide). Confirmed and fixed in both catalogs: `CommandRefused` "receipts-unavailable" also covers a throwing or invalid `receiptPartition` (command BEH-CM-041), and "admission-unavailable" no longer says an `admit` can fail — its error type is `never` — but names a death, a timeout or an invalid reason (command BEH-CM-044).<br>**Impact (PROC-03 §3).** (1) Identifiers: REQ-KT-028 and REQ-KT-029 added; BEH-KT-017, 020, 029, 032, 033, 034, 035, 036, 052, 057, INV-KT-006, ADR-KT-004 (title) and appendix B amended; nothing withdrawn. (2) Risk: bears on RSK-BR-013 and RSK-BR-017 (third-party code in the host process; data sent to a partner process) — the tooling no longer produces a partner package a host could load in process, and no identity leaves the host unless the application chose it; no score changed here. (3) GxP impact: yes, indirectly — which user identity reaches a partner process is a data-transfer decision the application now records; the kit's own behaviour changes no host. (4) Revalidation: none; nothing is implemented or qualified. (5) Compatibility: draft API changes — `CallContext` gains `claims`; partner manifests that declared callbacks in `requires` must move them to `requested.capabilities`; `pack` refuses non-guest partner manifests; `countersign` gains `--statement`; catalog tag `ManifestMismatch` (loader) renamed; `bridger sdk generate` and `Conformance.verify` refuse a local contract. |
| CCR-KT-005 | 2026-11-10 | Round 2 findings of the specification audit of 2026-11-09: error catalog completed (H11) and catalog rows aligned with the round's fixes. This is an agent review, not the independent review of PROC-03 §5. H11: BEH-KT-049 requires one entry for every tag a Bridger companion specification defines, and the GxP companion's tags were missing from both catalogs. BEH-KT-052 and `docs/guides/error-catalog.md` gain the 27 GxP tags (`GxpLayerInvalid`, `GxpPlatformUnsupported`, `GxpCoreVersionUnsupported`, `CanonicalisationFailed`, `TrailWriteFailed`, `TrailReadFailed`, `CheckCapacityExceeded`, `AnchorWriteFailed`, `AnchorReadFailed`, `TicketWriteFailed`, `TicketReadFailed`, `TicketVersionConflict`, `IssueRefused`, `RevokeRefused`, `SignatureDeclined`, `SignatureCaptureFailed`, `GateAttachFailed`, `FingerprintProposalFailed`, `FingerprintKeyUnavailable`, `FingerprintMalformed`, `FingerprintCompareRefused`, `RunnerOutputUnreadable`, `EvidenceWriteFailed`, `EvidenceReadFailed`, `AssessmentRefused`, `ExportFailed`, `ArchiveUnreadable`; gxp/01–18, CCR-GX-005) and the other tags a sweep of every companion's error channels found missing: audit-chain `AnchorUnconfirmed` (BEH-AC-020), mcp `PlanAffectsCaller` (CCR-MC-005), agent `UnreachableViolation`, loader `SignatureInvalid` and `RevocationStoreFailed`, remote `GuestTransportError` and `DedupeUnavailable`, federation `ResolveFailed`, `DialFailed` and `ListenFailed`, and core's record-only handoff loss tags `HandoffExportFailed`, `HandoffVersionUnaccepted`, `HandoffUpgradeFailed`, `HandoffDecodeFailed`, `HandoffImportFailed` and `HandoffAbandoned` (core BEH-BR-350). No catalogued tag was found withdrawn. Rows aligned with the round's fixes, each checked against the specification text: core `DependencyCycle` (the reconcile entry that closes a cycle, BEH-BR-156), `HostClosed` (a non-atomic reconcile cut by shutdown, BEH-BR-157), `WouldDeadlock` (`shutdown` from a plugin's build, `load` or finalizer fiber, BEH-BR-105), `NoImplementation` (`Selector.use` when the chosen id left the view, BEH-BR-307), `PlanStale` (`incoming` version, digest and `consentDiff`, BEH-BR-319) and `ApplyRolledBack` (an atomic apply stopped before any action completed, BEH-BR-324) (core CCR-BR-034); `KeyedHashFailed` (`keyId`, `permanent`, reaches callers of a generic `ChainSink.append`) and `BundleExportFailed` (gxp `verifySeals`) (CCR-AC-005, CCR-GX-005); `EntitlementConfigError` (`Entitlement.layer`, CCR-EN-005); `RebootstrapBlocked` (`settle` only), `OutboxFrozen` (every event-store write during a whole-store freeze, `origin-unrecorded`) and `IncarnationUnavailable` (a whole-store install fails before `run`; federation step 3a) (CCR-DB-005, CCR-FD-005, CCR-ES-004); `PayloadDecodeFailed` (keyring codec with an unreadable key store, BEH-KR-012), `KeyShredded`, `KeyStoreUnavailable` and `SubjectInvalid` (`rotate`, `rewrap`, a blank shred `reason`) and `ShredUnattributed` (a received shred notice, BEH-KR-020) (CCR-KR-004). Low finding: `docs/guides/bridger-in-5-minutes.md` and `docs/guides/plugin-author-guide.md` now say, as BEH-KT-026 does, that `bridger dev` refuses an `AuditSink`, `OperationGate` or `ConfigFingerprinter` other than the kit's in-memory development doubles (guide entries under core CCR-BR-034).<br>**Impact (PROC-03 §3).** (1) Identifiers: none added or withdrawn; BEH-KT-052 amended. (2) Risk: none changed; the catalog now covers the GxP companion's failures, which an operator of a regulated host reads first. (3) GxP impact: none on behaviour (catalog text); indirectly yes, since the GxP companion's port failures and refusals now have a documented cause and fix. (4) Revalidation: none; nothing is implemented or qualified. (5) Compatibility: catalog entries added and amended only. **Follow-ups.** The Example lines of the 44 tags added that day (`docs/guides/error-catalog.md`) rewritten from placeholders into the calls and situations their defining behaviours describe, with the errors' declared fields; Fix lines that promised more than the specification aligned with its stated remedy in both catalogs (handoff loss tags — an import failure fails the activation, it does not start cold; `DialFailed`, `ListenFailed`, `ResolveFailed`, `SignatureInvalid`, `RevocationStoreFailed`, `UnreachableViolation`, `DedupeUnavailable`, `TrailWriteFailed`, `TicketWriteFailed`, `TicketVersionConflict`, `SignatureDeclined`, `FingerprintMalformed`, `RunnerOutputUnreadable`); causes of the GxP tags declared with fields since (`RevokeRefused`, `RunnerOutputUnreadable`, `EvidenceReadFailed`, `AssessmentRefused`, `ExportFailed`, `ArchiveUnreadable`, `AnchorWriteFailed`, `AnchorReadFailed`, `TicketWriteFailed`, `TicketReadFailed`, `TicketVersionConflict`) name them; new row `WrappedKeyChanged` (keyring BEH-KR-004) and `KeyShredded`, `KeyStoreUnavailable` raised by the `KeyStore` port's `replaceWrapped` and `wrappedUnder`. The `GuestTransportError` row's cause names the fields remote now declares (`reason` "accept-failed" or "no-dedupe", `message`; remote BEH-RM-049, CCR-RM-005). |

---

_Next: [Overview](./overview.md)_
