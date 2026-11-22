# Change history

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-LD-CHG                                               |
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

## BRIDGER-LD-00

`loader/README.md`

- 0.6 (2026-11-09): Register row CCR-LD-004 (specification audit of 2026-11-09: F-06, M-02, M-03, M-06, C-16); contents row 09 and ADR-LD-008; honest-claims limit 3 and the remote dependency restated; honest-claims limit 3, ADR-LD-005 title and the remote row: guests run outside the host's runtime, not necessarily in another process (independent review); CCR-LD-004 row: resolutions of the independent review (guest wording, `stampRemote` error) (CCR-LD-004)
- 0.5 (2026-11-08): CCR-LD-003 extended with revision 2, resolutions of the round-2 agent review (R3-01–R3-05, R3-14–R3-16; offline review F3, F4, F29) (CCR-LD-003)
- 0.4 (2026-11-08): Register row CCR-LD-003; contents 07 and 08, ADR-LD-006–007; core dependencies 24 and 28; open questions answered (G60, G61) and G56 answered (round 2: recheck items 11, 12, 15; core alignment) (CCR-LD-003)
- 0.3 (2026-11-08): Register row CCR-LD-002 (resolutions of the agent review of 2026-11-08); Open questions section; dependencies on core updated (CCR-LD-002)
- 0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-LD-001)
- 0.1 (2026-11-08): Initial draft (CCR-LD-001)                

## BRIDGER-LD-OVW

`loader/overview.md`

- 0.5 (2026-11-09): "first-party" statement, trust class, `Loader.lazy` refusing guest entries, `LoaderRemote.link` and `linkManifest`, `RevokedDigests`, the manifest's `extensions["@bridger/loader"]` entry, `PackageManifestMismatch`, `NotFirstParty`, `GuestEntryInvalid`; worked example maps entries by trust class (specification audit F-06, M-02, M-03, M-06, C-16); guest wording: outside the host's runtime, in the deployment's bundle runtime (independent review) (CCR-LD-004)
- 0.4 (2026-11-08): `SignedStatement`, `SignedRevocationList`, `RevocationSet.encode`/`decode`, `RevocationSource.offer` and `.constant`, "chain-bundle" and `RevocationListMalformed` in the API surface (round-2 agent review) (CCR-LD-003)
- 0.3 (2026-11-08): Signed statements, `SignaturePolicy.verify`, `StatementSigner`, `Revocation.refusalList` and data packs in the API surface and errors (round 2: recheck items 11, 12, 15) (CCR-LD-003)
- 0.2 (2026-11-08): API surface: `AcceptedDigests`, `LoaderGate.make`/`piece`, `Loader.stampRemote`, `KillSwitch.release`; worked example wires the gate before the host and leaves the scope to the kill switch alone (CCR-LD-002)
- 0.1 (2026-11-08): Initial draft (CCR-LD-001)                

## BRIDGER-LD-TRACE

`loader/traceability.md`

- 0.3 (2026-11-08): Rows and scenario summaries for the review resolutions; RSK-BR-043 and RSK-BR-044 notes (CCR-LD-002)
- 0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-LD-001)
- 0.1 (2026-11-08): Initial draft (CCR-LD-001)                

## BRIDGER-LD-BEH-02

`loader/behaviors/02-load-pipeline.md`

- 0.10 (2026-11-11): BEH-LD-015: `AcceptedDigests.pinnedFrom(prefix)` tells sources apart; each federation plugin publishes under "@bridger/federation:" + its plugin id (PL7); `install`/`replace` admission (c): a digest published under a "@bridger/federation:" source and not revoked by digest (H2); documentation states the trust it rests on — `AcceptedDigests` is a host-base service only the application wires, whose every holder can already admit an install through `record` (H2); the further pinned digests and `exempt.digests` reach `KillSwitch.run` as its `pinned` (PL13) (SPEC-AUDIT-07); follow-up: each `Loader` publishes under "@bridger/loader:" + its plugin id (`LoaderOptions.id`, default "@bridger/loader") and clears that source when it stops, the example exempting that default id; admission (c) states that a proxy's trust lives with the federation plugin that pinned it (SPEC-AUDIT-07 residual); second follow-up: each acceptance carries the `source` of the `Loader` that recorded it (`record`'s `source`, `AcceptedDigest.source`, `Loader.source`) and `markNotCurrent(source)` marks only that source's acceptances, so one loader's construction no longer makes another's not current; a loader's and a federation plugin's source is the prefix followed by core's canonical key `JSON.stringify([realm, id])` (core BEH-BR-147), so two plugins with one id in different realms never share a source (SPEC-AUDIT-07 residual) (CCR-LD-010)
- 0.9 (2026-11-11): BEH-LD-015: each `Loader` publishes its `pinnedDigests` to `AcceptedDigests` (`setPinned`, keyed by source: "@bridger/loader"; federation's proxies under "@bridger/federation"; `pinned` is the union), and the piece reads them live from `AcceptedDigests.pinned`, `LoaderGateOptions.pinned` now naming further pinned digests only (L2); `LoaderGateOptions.maxAge` (L4); a `reconfigure` is not refused "verification-unknown" (PL17); BEH-LD-016: `policyId` names the accepting branch and each signer carries its `policyId` and `publisherBound` (L1, H5) (SPEC-AUDIT-06) (CCR-LD-009)
- 0.8 (2026-11-11): BEH-LD-015: `AcceptedDigests` declares `record`, `remove`, `markNotCurrent` and `entries`, acceptances keyed by (digest, `via`) (L2); `lookup` prefers a current acceptance (L1); a digest is revoked for the piece as `RevokedDigests.refused` answers, from the record `lookup` returns, which carries the signer identities and requirement (H7); `enable`, `retry`, `restart` and `reconfigure` refused "verification-unknown" unless the digest is pinned or exempt, and `LoaderGateOptions.pinned` (L3); `Loader.pinnedDigests` (H7); BEH-LD-016: `VerificationRecord` keeps `RecordedSigner` values and `require` (H7) (SPEC-AUDIT-05) (CCR-LD-008)
- 0.7 (2026-11-10): BEH-LD-015: an exempt digest is never refused "verification-unknown" and the same `exempt.digests` reach `RevokedDigests.layer` and `filterDesired` (L1); `AcceptedDigests` keeps one acceptance per digest and origin, so a catalog withdrawal leaves a load's acceptance in place (PL12) (SPEC-AUDIT-04) (CCR-LD-007)
- 0.6 (2026-11-10): BEH-LD-015: installs by core realm families and ephemeral realms (agent model adapters, subagents) are judged as any install; the supported wirings are a loader load or an exemption by digest, never by realm (round 2 findings of the specification audit of 2026-11-09, P23); follow-up: `FetchError`, the error of `fetchVerified`, defined as the errors of steps 1–6 (it was used and never defined) (CCR-LD-005)
- 0.5 (2026-11-09): Step 4 also verifies the "first-party" statement, so no package is evaluated in the host's process without it (F-06); the entry is read from `extensions["@bridger/loader"]` (M-03); `PackageManifestMismatch` and `StatementRevoked` in `LoadError` (C-16); guest wording (independent review) (CCR-LD-004)
- 0.4 (2026-11-08): Steps 4 and 5 run through `SignaturePolicy.verify` with the publisher binding; system starts of revoked digests refused by core's `RefusalList` backed by the loader (G60 closed); undo requests judged as the operation they issue (round 2: recheck items 11, 15; core alignment) (CCR-LD-003)
- 0.3 (2026-11-08): `LoaderGate` is a core `Gate<OperationRequest>` piece built before the host over a shared `AcceptedDigests` store, with bootstrap exemptions, verified catalog entries accepted for lazy installs, and revoked digests refused for every operation that restarts code; `VerificationRecord` fields defined per step reached; refusal-record write failures; evaluator option narrowed (CCR-LD-002)
- 0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-LD-001)
- 0.1 (2026-11-08): Initial draft (CCR-LD-001)                

## BRIDGER-LD-BEH-03

`loader/behaviors/03-signature-policy.md`

- 0.2 (2026-11-08): Sigstore offline verification checks the log's signed checkpoint or entry timestamp against a pinned log key and uses its time; signers carry a scheme-defined `identity` used by revocation lists; re-evaluation uses the acceptance time; double signing means two distinct signer entries, not two people (CCR-LD-002)
- 0.1 (2026-11-08): Initial draft (CCR-LD-001)                

## BRIDGER-LD-BEH-04

`loader/behaviors/04-revocation-and-kill-switch.md`

- 0.10 (2026-11-11): BEH-LD-029: the scope's plugins are those `Host.snapshot` reports owned by it (`PluginSnapshot.scope`, core BEH-BR-155) (L4); a run is made at start, at each revocation change, and at each `AcceptedDigests` change only for the digests a load record or the pinned digests changed, never for a catalog-entry removal (L1); `KillSwitch.run` loses `Loader` (PL12), takes `pinned` (exempt and further pinned digests, the list `RevokedDigests.layer` is given) in place of `exemptDigests` (PL13), and `drain` and `force`, passed as the `RemoveOptions` of every removal (PL15); BEH-LD-031: outside the scope means not owned by it (L4); BEH-LD-032: the blast-radius guard counts per run (`maxDroppedPerRun`, `held[].run`, `release(run)`) and `release` covers exactly that run's held plugins (L2); Settled (3) restated (SPEC-AUDIT-07); follow-up: BEH-LD-031: a run removes only plugins of its scope — `outsideScope` withdrawn; an installed plugin outside it whose digest the set drops is reported in the new `status.outsideScope` (run, `{ id, realm }`, its scope, the dropped digest) and logged, never removed and never counted against `maxDroppedPerRun` (BEH-LD-032); Settled (6) restated (SPEC-AUDIT-07 residual) (CCR-LD-010)
- 0.9 (2026-11-11): BEH-LD-029: a revocation no longer reconciles: the kill switch calls `Host.remove`, under `revocationActor`, for each installed plugin of its scope whose digest the new set drops, skips entries not installed, and keeps no `ReconcileResult` (H6, PL19); it also runs on `AcceptedDigests.changes`, pinned changes included (L3); BEH-LD-028: the rule's pinned digests are read live from `AcceptedDigests.pinned`, the union over its sources (L2); BEH-LD-030: re-evaluation counts the signers of the record's `policyId` and re-checks the publisher binding from `publisherBound` (L1, H5); BEH-LD-026: `RevocationStore` keeps `acceptedAt`, against which a saved list's signer windows are re-checked (PL20); BEH-LD-032 and Settled restated (SPEC-AUDIT-06) (CCR-LD-009)
- 0.8 (2026-11-11): BEH-LD-028 and BEH-LD-030: re-evaluation reads the recorded signer identities, roles and requirement of the record `AcceptedDigests.lookup` returns, never a policy; the kill switch reads the rule's pinned digests from `Loader.pinnedDigests` (H7, L1, L2); BEH-LD-029: the revocation reconcile keeps every entry installed in `Host.snapshot`, as its last completed action left it, whatever its pending status, and leaves out only entries absent from the snapshot (H8); `KillSwitchStatus` names plugins by `{ id, realm }` records (PL2); Settled (4) states the pinned and exempt exemption (PL17) (SPEC-AUDIT-05) (CCR-LD-008)
- 0.7 (2026-11-10): BEH-LD-028: `pinned` includes `LoaderGate`'s exempt digests and `KillSwitch.run` takes `exemptDigests` (L1); BEH-LD-029: the revocation reconcile is built from the scope's current contents (completed entries still installed) minus the dropped entries, not from the last applied list (L2) (SPEC-AUDIT-04) (CCR-LD-007)
- 0.6 (2026-11-10): round 2 follow-up: `RevocationStoreFailed` declared (BEH-LD-026) (CCR-LD-005)
- 0.5 (2026-11-08): Round-2 agent review (R3-01, R3-02, R3-03; offline review F3, F4, F29): `SignedRevocationList`, its canonical encoding and `issuer` defined here; lists verified under a separate revocation trust root with no revocation step, ending the cycle with `StatementVerifier`; a list may revoke its own signers for later lists; `RevocationSource.offer` replaces the constructor-time feed as the way other companions hand lists in; statement digests reach `filterDesired`; `Revoked.by` gains "statement-digest"; the kill switch's scope is exclusive of other actuators (CCR-LD-003)
- 0.4 (2026-11-08): Revocation digests match subject and statement digests of every statement type; revocation lists verified as "revocation-list" statements; the set backs core's `RefusalList` (round 2: recheck item 11; core alignment K4) (CCR-LD-003)
- 0.3 (2026-11-08): Signers revoked by identity; un-revocation and store rollback stated; `filterDesired` drops digests with no verification record when a signer is revoked; re-evaluation at acceptance time; the kill switch is the scope's one reconciler, with the application's actor for desired-list changes and the revocation actor for removals only; blast-radius guard (CCR-LD-002)
- 0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-LD-001)
- 0.1 (2026-11-08): Initial draft (CCR-LD-001)                

## BRIDGER-LD-BEH-05

`loader/behaviors/05-catalog-and-lazy-loading.md`

- 0.4 (2026-11-08): Entries verified through `SignaturePolicy.verify` with the publisher binding; manifest roles, targets and `listens` carried for `declaredContributions` and `AccessPolicy.declaredOnly`; `idle`/`holdTimeout` passed through, fresh check on each reload, refused lazy starts (round 2: recheck items 11, 15; core alignment) (CCR-LD-003)
- 0.3 (2026-11-08): `Loader.lazy` uses core's `Plugin.lazy({ manifest, load, digest })` with the package digest beside a digest-free manifest; catalog entries recorded in `AcceptedDigests`; two digests at one version are different definitions; `Loader.stampRemote` for proxy definitions (CCR-LD-002)
- 0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-LD-001)
- 0.1 (2026-11-08): Initial draft (CCR-LD-001)                

## BRIDGER-LD-BEH-06

`loader/behaviors/06-limits-and-acceptance.md`

- 0.10 (2026-11-11): Check 6: install and replace of a digest published under a "@bridger/federation:<id>" source admitted, refused once revoked by digest (H2, PL7); check 9: an `anyOf` repeating an `id` refused (PL14); check 12: a catalog withdrawal removes nothing under `revocationActor` and a catalog update is one `replace` (L1), a plugin reinstalled by hand is outside the scope (L4), a start run, `drain` and `force` (PL15), the cap and `release` per run (L2), the kill switch's `pinned` option (PL13) (SPEC-AUDIT-07); follow-up: check 6: two loaders keep their own "@bridger/loader:<id>" lists and a stopped one clears its own (C1); second follow-up: check 6: sources keyed by `JSON.stringify([realm, id])`, two plugins with one id in different realms keeping distinct lists, and a loader's construction leaving another loader's acceptances current; check 12: plugins outside the scope reported in `status.outsideScope`, never removed or counted (C4) (SPEC-AUDIT-07 residual) (CCR-LD-010)
- 0.9 (2026-11-11): Check 6: a `reconfigure` is not refused "verification-unknown", and a set older than the piece's `maxAge` refuses install "revocation-stale" (PL17, L4); check 10: a saved list whose signer window closed after acceptance is still restored (PL20); check 12: a revocation removes the dropped installed plugins with `Host.remove`, reconciles nothing, leaves an operator's direct changes in place, and runs on `AcceptedDigests` and pinned changes (H6, L3); check 13: re-evaluation counts the accepting branch's signers and re-checks the publisher binding (L1, H5) (SPEC-AUDIT-06) (CCR-LD-009)
- 0.8 (2026-11-11): Check 6: `enable`/`restart` of an installed digest with no record refused "verification-unknown" after a signer revocation unless pinned or exempt (L3), and a current catalog acceptance admits an install after a loader replacement (L1); check 12: a pending entry still installed survives a revocation reconcile (H8); check 13: re-evaluation from the record alone, after the accepting loader was replaced (H7) (SPEC-AUDIT-05) (CCR-LD-008)
- 0.7 (2026-11-10): Checks 6 and 12 (BEH-LD-048): exempt digests after a signer revocation, per-origin acceptances, and the revocation reconcile with pending or hand-removed entries (L1, L2, PL12) (SPEC-AUDIT-04) (CCR-LD-007)
- 0.6 (2026-11-10): Check 6 adds the cross-companion scenario: subagent and model-family installs under `LoaderGate` (P23) (CCR-LD-005)
- 0.5 (2026-11-09): Checks 5, 15 and 16 follow `PackageManifestMismatch`, the stamped manifest, the entry key, `Loader.lazy`'s refusal of guest entries and the link manifest; checks 25–30 are in file 09; `statementRules` carries the "first-party" rule (specification audit F-06, M-02, M-03, C-16); check 16: `stampRemote` refuses a non-guest manifest with `GuestEntryInvalid` (independent review) (CCR-LD-004)
- 0.4 (2026-11-08): Check 10 covers first boot, the separate revocation trust root, self-revocation and envelope mismatch (round-2 agent review R3-02) (CCR-LD-003)
- 0.3 (2026-11-08): The loader plugin reads `buildTimeout` from `Host.controls` (G61 closed) and provides `StatementVerifier`; open question 2 answered (core alignment) (CCR-LD-003)
- 0.2 (2026-11-08): BEH-LD-046 limited to direct loads; a lazy load runs in the build slot with the loader's timeouts inside `buildTimeout`; `LoaderPlugin` requires `AcceptedDigests`; acceptance checks 5, 6, 7, 12, 13, 15 and 16 extended (CCR-LD-002)
- 0.1 (2026-11-08): Initial draft (CCR-LD-001)                

## BRIDGER-LD-BEH-07

`loader/behaviors/07-signed-statements.md`

- 0.4 (2026-11-10): BEH-LD-056: digests in `LoaderGate`'s `exempt.digests` are not refused "verification-unknown"; wiring passes `pinned` to `RevokedDigests.layer` (L1) (SPEC-AUDIT-04) (CCR-LD-007)
- 0.3 (2026-11-09): "first-party" reserved for in-process eligibility (file 09, F-06); `Revocation.refusalList` built over the `RevokedDigests` view (M-06) (CCR-LD-004)
- 0.2 (2026-11-08): Round-2 agent review (R3-01, R3-02, R3-03, R3-14, R3-15, R3-16): `SignedStatement` envelope and the exact `id`/`version` convention and call shape for every reserved type; "chain-bundle" reserved; "revocation-list" verified only by the revocation source, with no step 5; `reverify` for statements accepted before a restart; statement-digest revocation reaches `refusalList`; publisher binding under composite rules; statement-digest revocation scope reworded (CCR-LD-003)
- 0.1 (2026-11-08): Initial draft (CCR-LD-003)                

## BRIDGER-LD-BEH-09

`loader/behaviors/09-trust-class-and-guest-links.md`

- 0.1 (2026-11-09): Initial draft: the "first-party" statement, the trust class of catalog entries, `Loader.lazy` refusing unmarked entries, `LoaderRemote.link` as the catalog-to-guest path, the link manifest derived from the guest's, the `RevokedDigests` view, checks 25–30 (specification audit F-06, M-02, M-06); introduction defines evaluation in the host's process and states where a guest runs, `@bridger/worker` included; BEH-LD-065 documentation states both without an isolation claim (independent review) (CCR-LD-004)
