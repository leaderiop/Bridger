# Change history

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-FD-CHG                                               |
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

## BRIDGER-FD-00

`federation/README.md`

- 0.5 (2026-11-08): CCR-FD-003 extended with the resolutions of the round-2 agent review; claims line on statement and list verification; open questions on the blast-radius helper and kill reach without links (CCR-FD-003)
- 0.4 (2026-11-08): round 2: recheck items 18–20 and 22 (X10) — file 06, ADR-FD-009, honest-claims lines for statements and residency, open question on the `RefusalList`, register row CCR-FD-003 (CCR-FD-003)
- 0.3 (2026-11-08): resolutions of the agent review of 2026-11-08; register row and open questions added (CCR-FD-002)
- 0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-FD-001)
- 0.1 (2026-11-08): Initial draft (CCR-FD-001)                

## BRIDGER-FD-INV

`federation/invariants.md`

- 0.3 (2026-11-08): round 2: recheck items 18, 19 and 20 — INV-FD-010 (kill path), INV-FD-011 (outbox before snapshot), INV-FD-012 (residency) added (CCR-FD-003)
- 0.2 (2026-11-08): resolutions of the agent review of 2026-11-08 — INV-FD-003 limited to desired lists with pending kills reported; INV-FD-005 one realm per import; INV-FD-006 single-major imports and symmetric agreement; INV-FD-007 fences checked per link, deposed owners not stopped (R3-02, R3-18, R3-19, R3-21, R3-26) (CCR-FD-002)
- 0.1 (2026-11-08): Initial draft (CCR-FD-001)                

## BRIDGER-FD-OVW

`federation/overview.md`

- 0.9 (2026-11-11): errors table gains `DeliveryImportRefused`; Specification audit of 2026-11-11 (SPEC-AUDIT-05) — errors table gains `RebootstrapFailed`, `ResolveFailed`, `DialFailed` and `ListenFailed` (PL11); `IncompatibleContract` by `"^" + V` (F4); `PeerLinkStatus` names `delivery-only` (H4) (CCR-FD-008)
- 0.8 (2026-11-10): Specification audit of 2026-11-10 (SPEC-AUDIT-04) — `LinkConnection` and the profile on dialled and accepted connections in the API table (H4) (CCR-FD-007)
- 0.7 (2026-11-10): errors: the event delivery companion's `SnapshotFailed` and `IncarnationUnavailable` reused for `OutboxSettlement.install` (BEH-FD-014, P1) (CCR-FD-005)
- 0.6 (2026-11-09): errors: the remote companion's `LocalContractRefused` is reused for a local contract in `contracts` (BEH-FD-009, core CCR-BR-033) (CCR-FD-004)
- 0.5 (2026-11-08): Round-2 agent review (R3-01; R4 F1–F4, F8–F10, F22) — API rows for the extended `ManifestStore`, `OutboxSettlement`, `releaseRevocation` and the loader's `RevocationSource.offer` (the `revocationFeed` row withdrawn), reader-version reports; worked example wires the required `revocation` and the outbox port (CCR-FD-003)
- 0.4 (2026-11-08): round 2: recheck items 18–20 and 22 — API rows for `RebootstrapOutbox`, `Federation.revocationFeed`, `VersionReports`; errors `RebootstrapBlocked`, `RevocationListStale`; `PlacementRefused` reused; core seams used (CCR-FD-003)
- 0.3 (2026-11-08): resolutions of the agent review of 2026-11-08 — links on the remote companion's multiplexer and `Remote.serve`; single-major imports; per-import peer realms; listener port and `contracts` option; worked example updated (R3-01, R3-02, R3-18) (CCR-FD-002)
- 0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-FD-001)
- 0.1 (2026-11-08): Initial draft (CCR-FD-001)                

## BRIDGER-FD-TRACE

`federation/traceability.md`

- 0.5 (2026-11-09): REQ-FD-044; REQ-FD-045 (core CCR-BR-033) (CCR-FD-004)
- 0.4 (2026-11-08): Round-2 agent review — BEH-FD-048; REQ-FD-040–043; REQ-FD-016, 032–036, 038 restated; INV-FD-003, 010, 011 rows extended (CCR-FD-003)
- 0.3 (2026-11-08): round 2: recheck items 18–20 and 22 — BEH-FD-041–047, INV-FD-010–012, ADR-FD-009, REQ-FD-032–039 (CCR-FD-003)
- 0.2 (2026-11-08): resolutions of the agent review of 2026-11-08 — REQ-FD-025–031; invariant scenarios updated (CCR-FD-002)
- 0.1 (2026-11-08): Initial draft (CCR-FD-001)                

## BRIDGER-FD-BEH-01

`federation/behaviors/01-host-manifest.md`

- 0.9 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-07) — BEH-FD-002: a missing `signatures` fails the build with the declared `SignaturePolicyMissing`, not core's `InvalidDefinition` (PL16); a stored manifest is re-verified with `reverify: { acceptedAt }`, the acceptance time stored with it (L3); BEH-FD-004: the `ManifestStore` keeps `acceptedAt` with the highest manifest (L3); BEH-FD-005: `Manifest.toDesired` takes `placement` and `hostResidency` (PL6); BEH-FD-007: the proxies' digests are published under the source "@bridger/federation:" + the plugin id, and `LoaderGate` admits their `install` and `replace` (loader admission (c)); "the application passes nothing more" dropped; the trust stated; the list cleared when the plugin stops (H2, PL7); BEH-FD-008: the gate's "revocation-stale" and "revocation-unavailable" refusals are transient, retried at every sync and on each new revocation set (F2); follow-up: BEH-FD-007 states as a rule that trust in a proxy lives with the federation plugin that pinned it — once it stops, its installed proxies are judged as unpinned digests and keep running until removed or re-pinned; BEH-FD-002: a stored manifest without `acceptedAt` is re-verified without `reverify` and a refusal follows the ordinary path (SPEC-AUDIT-07 residual); second follow-up: BEH-FD-007: the source is "@bridger/federation:" + `JSON.stringify([realm, id])`, core's canonical key of the plugin from its activation's principal, so two federation plugins with one id in different realms keep distinct lists (SPEC-AUDIT-07 residual) (CCR-FD-010)
- 0.8 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-06) — BEH-FD-005: the projection drops, at every apply, a manifest plugin that depends on a delivery import ("delivery-import-dependent"), and `Manifest.toDesired` takes `deliveryImports` (H8); BEH-FD-007: the import proxies' synthesized digests are passed in `filterDesired`'s `pinned` and published with `AcceptedDigests.setPinned("@bridger/federation", digests)` for the gate, the view and the kill switch (H9) (CCR-FD-009)
- 0.7 (2026-11-10): round 2 follow-up: `ResolveFailed` declared (BEH-FD-005) (CCR-FD-005)
- 0.6 (2026-11-09): `ManifestImport.disclose` (BEH-FD-001) (CCR-FD-004)
- 0.5 (2026-11-08): Round-2 agent review (R3-01; R4 F1, F2) — `SignedManifest` is the loader's `SignedStatement` ("host-manifest", id JCS([authority, host]), version the decimal revision, loader `Signature` shape) verified by exactly the loader's call, with the envelope checked against the decoded manifest; revocation lists no longer verified here; a newer manifest held behind a re-bootstrap records pending kills; every apply subtracts pending kills and passes `Revocation.filterDesired`; the last applied manifest's bytes are recorded (CCR-FD-003)
- 0.4 (2026-11-08): round 2: recheck items 18 and 20, CORE-DECISIONS-2 — verification through the loader's `SignaturePolicy.verify({ statementType: "host-manifest" })`; kill entries are no longer the only kill path (BEH-FD-041); `residency` on imports, exports and peers; `mandatoryInterceptions` and `allowChildren` carried as manifest data; `atomic` off by default with `PartialApply` reported; core reconcile order and G65 stated (CCR-FD-003)
- 0.3 (2026-11-08): resolutions of the agent review of 2026-11-08 — `window` split into `protocolWindow` and `contractWindow`; an import names one major through `version`; resolved definitions kept and offline resolution stated as the loader cache's; transiently rejected entries and pending kills retried at each sync and reported until gone (R3-02, R3-19, R3-21, R3-24) (CCR-FD-002)
- 0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-FD-001)
- 0.1 (2026-11-08): Initial draft (CCR-FD-001)                

## BRIDGER-FD-BEH-02

`federation/behaviors/02-sync-offline-and-rebootstrap.md`

- 0.11 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-07) — BEH-FD-009: `FederationOptions.outbox` accepts the literal "none" in place of the value `RebootstrapOutbox.none` (F4); `ManifestStore` keeps `acceptedAt` with the highest and the last applied manifest (L3); `acceptedDigests` comment names the source "@bridger/federation:" + id (PL7); the build registers the finalizer that clears its pinned list before forking (H2); BEH-FD-010: the stored manifest is re-verified under `reverify` (L3); BEH-FD-014: step 3b sends the marker's `installedRevision` as `known`, and a step-3b `ResyncRequired` once the backoff has reached `rebootstrapRetryMax` restarts from step 1 (F1); step 3a handles `SnapshotFailed` "apply-failed" (whole-store, after the raise) as a failure of `run` after the raise (durable-bus BEH-DB-048 handoff); the delivery transport maps `LeaseRevoked` and `LeaseTimeout` of `useOptional` to `DeliveryFailed` (PL5); follow-up: the `acceptedDigests` comment names the source "@bridger/federation:" + `JSON.stringify([realm, id])` (SPEC-AUDIT-07 residual) (CCR-FD-010)
- 0.10 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-06) — BEH-FD-009: the plugin no longer requires the `outbox` port, it lists it in `optional` and resolves it at step 1 with `useOptional` (absent: `RebootstrapBlocked` "no-outbox-port"); the build no longer reads the host's plugin set; `acceptedDigests` option (H7, H8, H9); BEH-FD-011: a `ResyncRequired` while a marker is stored neither rewrites it nor restarts, and one from step 3b's fetch is a step-3b failure (F2); BEH-FD-014: the relay reaches a delivery import through `optional` and a per-send `useOptional`, "depends on" means `requires` on its contract key, a delivery import has no local dependent, the projection refuses manifest dependents and step 1 still blocks on a hand-installed one; `DeliveryImportRefused` keeps only "not-an-import-id"; `pending` is 0 for the reasons this plugin raises itself (H7, H8, PL11) (CCR-FD-009)
- 0.9 (2026-11-11): the build refusal of a `deliveryImports` entry is the declared `DeliveryImportRefused`, not core's `InvalidDefinition`, which is an install error of the host (follow-up); Specification audit of 2026-11-11 (SPEC-AUDIT-05) — BEH-FD-014: an attempt that starts with links suspended (the marker's `installAttempted` true) moves only the links of the delivery imports to `delivery-only`, whose offer lists only those imports and no export, and step 2 returns them to `suspended` (H4, F1); a step-2 `RebootstrapFailed` resumes links only when no install has begun (F2); `deliveryImports` holds import ids, a delivery import may have no local dependent but the event delivery companion's relay, checked at build (`DeliveryImportRefused`) and before step 1 (`RebootstrapBlocked` "delivery-import-dependents") (PL8, F3); `installAttempted` stored with step "installing" (H6); BEH-FD-009: the build reads the host's plugin set for that check; `RebootstrapFailed` declared (PL11) (CCR-FD-008)
- 0.8 (2026-11-10): Specification audit of 2026-11-10 (SPEC-AUDIT-04) — BEH-FD-014: `FederationOptions.deliveryImports`; an attempt that starts with links suspended reopens only those imports in step 1, so the outbox can be pushed over a peer link, and step 2 closes them again (F2); "links stay up" in steps 0 and 1 and the step-1 failure rule limited to a first attempt, and `suspended` shown through the retries (F3) (CCR-FD-007)
- 0.7 (2026-11-10): Specification audit of 2026-11-10 (SPEC-AUDIT-03) — BEH-FD-014: a step-1 failure on a retry after a failed step 3a keeps links suspended, only a first attempt has none suspended (M18); step 3a runs the install under the federation actor, recorded on its `GapRecord`s with reason "rebootstrap:" + `replaces` (Low); the event delivery companion's `follow` is paused from step 1 to the end of step 3a and backs off over suspended links until step 4 (Low, seen not assessed) (CCR-FD-006)
- 0.6 (2026-11-10): Specification audit of 2026-11-09, round 2 — BEH-FD-014: `OutboxSettlement.install` restated with the event delivery companion's error union and `InstallContext` (its `StoreTransaction`); what step 3a does for each error (P1); the outcome of a call cut by a link suspension follows the remote companion's frame-state rule (CCR-FD-005)
- 0.5 (2026-11-09): BEH-FD-009 `contracts` rejects a local contract at compile time, and one passed untyped fails the plugin's build with the remote companion's `LocalContractRefused` before the store is read (core CCR-BR-033) (CCR-FD-004)
- 0.4 (2026-11-08): Round-2 agent review (R4 F1–F3, F6, F8–F12) — `revocation` required, `maxDisabledPerRevision`, `rebootstrapRetryMax`; `ManifestStore` keeps the last applied manifest's bytes, pending kills and the re-bootstrap marker; boot and freshness re-applies use the last applied manifest minus pending kills; re-bootstrap re-ordered — settle with links up, suspend only for fetch and install (control endpoint kept for kills), install only through `OutboxSettlement.install` (guarded, `replaces` declared), install revision mismatch defined, per-step retry points with their own backoff; install must not roll back the manifest, revocation or fence stores (CCR-FD-003)
- 0.3 (2026-11-08): round 2: recheck items 18, 19 and 20 (X10) — a kill never waits on the cap or a re-bootstrap; re-bootstrap order fixed as outbox, snapshot fetch, projection replace, link resume, with `RebootstrapOutbox` and `RebootstrapBlocked`; `Rebootstrap` split into `fetch` and `install`; options and status for revocation, placement and atomic applies; heading of BEH-FD-014 changed (old anchor kept) (CCR-FD-003)
- 0.2 (2026-11-08): resolutions of the agent review of 2026-11-08 — the offline cap measured from a first-activation time kept in the store; re-bootstrap suspends links (imports and exports) instead of an undefined admission switch; transient retries at each sync; status gains `pending` and peer links (R3-19, R3-20, R3-25) (CCR-FD-002)
- 0.1 (2026-11-08): Initial draft (CCR-FD-001)                

## BRIDGER-FD-BEH-03

`federation/behaviors/03-links-and-skew-handshake.md`

- 0.8 (2026-11-10): Specification audit of 2026-11-10 (SPEC-AUDIT-04) — BEH-FD-017: `LinkDialer.dial` and `LinkListener.accept` yield a `LinkConnection` with the `TransportProfile` of the end that made it, passed to both `multiplex` calls (H4); BEH-FD-018: `LinkAgreement.refused` gains "placement-refused" (PL16); BEH-FD-020: the accepted range is `"^" + V` (C9) (CCR-FD-007)
- 0.7 (2026-11-10): round 2 follow-up: `DialFailed` and `ListenFailed` declared (BEH-FD-017) (CCR-FD-005)
- 0.6 (2026-11-09): BEH-FD-023 reads identity claims only when present; provenance entry without `ref` when no actor is disclosed (CCR-FD-004)
- 0.5 (2026-11-08): Round-2 agent review (R4 F5) — the `kill` frame precedes the offer on every new link; a suspended link keeps its control endpoint open for kill frames only; `SignedRevocationList` is the loader's (CCR-FD-003)
- 0.4 (2026-11-08): round 2: recheck item 18 and CORE-DECISIONS-2 — `kill` control frame with one schema across protocol versions; asserted principals decoded with `PrincipalRef.decode` and kept as provenance; served calls carry the peer's correlation; peer selection through core `Selector.make` with a range (CCR-FD-003)
- 0.3 (2026-11-08): resolutions of the agent review of 2026-11-08 — links built on the remote companion's `Transport`, endpoint multiplexer and `Remote.serve`; federation's own control endpoint carries the offers; incoming connections accepted only from listed peers; `PeerLinkStatus` with string identifiers; symmetric protocol window carried in the offer; one import per (peer, contract, major), accepted or refused, never a major picked; one realm per import, retired when empty; peer-asserted actors as provenance (R3-01, R3-02, R3-18, R3-21, R3-22, R3-23) (CCR-FD-002)
- 0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-FD-001)
- 0.1 (2026-11-08): Initial draft (CCR-FD-001)                

## BRIDGER-FD-BEH-04

`federation/behaviors/04-exports-and-imports.md`

- 0.3 (2026-11-08): resolutions of the agent review of 2026-11-08 — exports served with the remote companion's `Remote.serve` (one core lease per call, `method-not-served` and `unavailable` refusals), no `Grant.of`; one import proxy per (peer, contract, major) over a federation endpoint transport opened only for accepted imports; fences bound to the link and checked before delivery by closing superseded endpoints; a fence does not stop a deposed owner (R3-01, R3-02, R3-03, R3-26) (CCR-FD-002)
- 0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-FD-001)
- 0.1 (2026-11-08): Initial draft (CCR-FD-001)                

## BRIDGER-FD-BEH-05

`federation/behaviors/05-testing-and-acceptance.md`

- 0.11 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-07) — check 2: a stored manifest is re-verified under `reverify` with its stored `acceptedAt`, so an offline host past `maxAge` still boots on it (L3); check 20: an incoming connection while suspended is identified from the offer's `host` and `authority` only (F3); check 28: "revocation-stale" and "revocation-unavailable" are retried at every sync and on a new set (F2); check 33: `SignaturePolicyMissing` (PL16); check 36: `outbox: "none"` (F4); check 37: the projection uses the policy and `hostResidency` passed to `Manifest.toDesired` (PL6); check 40: the `reverify` form for a stored manifest (L3) and the source "@bridger/federation:" + id (PL7); check 43: `LeaseRevoked` and `LeaseTimeout` are a `DeliveryFailed` (PL5); check 46: `SnapshotFailed` "apply-failed" (durable-bus BEH-DB-048 handoff); check 47: step 3b sends `installedRevision` and falls back to step 1 (F1); check 48 added: `LoaderGate` admits a proxy's install and replace, two federation plugins keep their own lists (H2, PL7); follow-up: check 2: a stored manifest without `acceptedAt` re-verified without `reverify`; check 48: a stopped plugin's installed proxies refused `restart` "verification-unknown" under a signer revocation, kept running, and pinned again at its next start (SPEC-AUDIT-07 residual); second follow-up: checks 40 and 48: sources keyed by `JSON.stringify([realm, id])`, two plugins with one id in different realms keeping distinct lists (SPEC-AUDIT-07 residual) (CCR-FD-010)
- 0.10 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-06) — check 19 names every version outside "^" + V, the major-0 higher minor included (PL13); check 20 covers a link that drops while suspended (F3); check 33 names `RevocationSourceMissing` (PL12); check 35 relays on `delivery-only` links (PL9); check 37 drops a placement-refused import in the projection and opens an import endpoint with the peer's labels or none (F1, PL10); check 40 covers the proxies' pinned digests, published to `AcceptedDigests` (H9); check 43: the relay reaches the delivery import through an optional key, the projection drops manifest dependents and step 1 blocks on a hand-installed one (H7, H8); check 47 covers a `ResyncRequired` while a marker is stored and from step 3b (F2) (CCR-FD-009)
- 0.9 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-05) — checks 16, 31 and 43 restated for `delivery-only` links, import ids and the relay-only dependent rule (H4, F1, F3, PL8); check 37 split by direction, imports by `ManifestPeer.residency` (H5); check 47 added: `installAttempted` across retries and restarts (H6, F2) (CCR-FD-008)
- 0.8 (2026-11-10): Specification audit of 2026-11-10 (SPEC-AUDIT-04) — check 16 and 43: links stay up in step 1 of a first attempt only, a retry reopens only the `deliveryImports` (F2, F3); check 37: export endpoints carry the route's labels and the profile from the dialer or listener supplies them otherwise (H4, F1) (CCR-FD-007)
- 0.7 (2026-11-10): Specification audit of 2026-11-10 (SPEC-AUDIT-03) — checks 36 and 43 narrowed to first attempts (M18); check 38 covers "backlog" reports (M16); check 46 added: the step-3a failure paths and the install actor (Low); check 36 covers `follow` paused during settle and install (Low, seen not assessed) (CCR-FD-006)
- 0.6 (2026-11-09): Check 44: identity disclosure on imports; check 45: local contracts refused at the plugin's build (core CCR-BR-033); introduction names check 45 (independent review) (CCR-FD-004)
- 0.5 (2026-11-08): Round-2 agent review (R3-01; R4 F1–F5, F7–F11, F15, F21, F22, F24) — checks 16, 32–38 restated; checks 40–43 added (CCR-FD-003)
- 0.4 (2026-11-08): round 2: recheck items 18, 19, 20 and 22, CORE-DECISIONS-2 — checks 32–39 (CCR-FD-003)
- 0.3 (2026-11-08): resolutions of the agent review of 2026-11-08 — checks 16 and 18–23 aligned with links over the remote multiplexer, single-major imports and per-link fences; checks 25–31 added (R3-01, R3-02, R3-18, R3-19, R3-20, R3-21, R3-25, R3-26) (CCR-FD-002)
- 0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-FD-001)
- 0.1 (2026-11-08): Initial draft (CCR-FD-001)                

## BRIDGER-FD-BEH-06

`federation/behaviors/06-kill-path-placement-and-skew.md`

- 0.8 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-07) — BEH-FD-045: the projection evaluates the `PlacementPolicy` and `hostResidency` passed to `Manifest.toDesired` (PL6); BEH-FD-042: `maxDisabledPerRevision` stays per set revision, the loader's guard it is modelled on now counting per kill-switch run (handoff of loader L2); BEH-FD-048: the last applied manifest is kept with its `acceptedAt` and re-verified under `reverify` (L3); a resumption at step 3b sends the marker's `installedRevision` as `known` (F1) (CCR-FD-010)
- 0.7 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-06) — BEH-FD-041: a missing `revocation` fails the build with the declared `RevocationSourceMissing`, not core's `InvalidDefinition` (PL12); BEH-FD-042: an import proxy, whose digest is pinned, is revoked by digest only, and `filterDesired` gets the proxies' digests in `pinned` (H9); BEH-FD-043: lists are relayed on `delivery-only` links too (PL9); BEH-FD-045: a placement-refused import is dropped in the projection, as "peer-residency-missing" (F1), and an import's endpoint opens with `ManifestPeer.residency ?? []` (PL10); BEH-FD-048: a `ResyncRequired` while a marker is stored writes no new marker (F2) (CCR-FD-009)
- 0.6 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-05) — BEH-FD-048: `RebootstrapMarker.installAttempted`, kept true from the first install call until the marker is cleared, keeps links suspended at activation whatever the step; restart behaviour stated for every step (H6); BEH-FD-044: `TestFederation` asserts the `delivery-only` step 1 (H4); BEH-FD-045: an import's offered labels are its `ManifestPeer.residency`, required when it carries a `residency` (else dropped "peer-residency-missing"); exports keep the dialer or listener fallback (H5); skew table: contract minor by `"^" + V` (F4) (CCR-FD-008)
- 0.5 (2026-11-10): Specification audit of 2026-11-10 (SPEC-AUDIT-04) — BEH-FD-044: the `TestFederation` assertion on step 1 limited to a first attempt, and a retry reopens only the `deliveryImports` (F3); BEH-FD-045: the route's labels fall back to the profile the dialer or listener yielded (H4), and export endpoints are opened with them (F1) (CCR-FD-007)
- 0.4 (2026-11-10): Specification audit of 2026-11-10 (SPEC-AUDIT-03, M16) — BEH-FD-047: report kind "backlog" (axis "event", this host's origin and `pending`, no versions); `oldest` and `newest` absent on it; an authority raising `minVersion` counts only the current incarnation of each node and uses the evidence of durable-bus BEH-DB-029 (reset windows, then an empty backlog) (CCR-FD-006)
- 0.3 (2026-11-10): Specification audit of 2026-11-09, round 2 — BEH-FD-046: the upcaster row adds the event store's stored-version constraint; the offline-cap exclusion applies to the writer switch only, never to dropping an upcaster (P4) (CCR-FD-005)
- 0.2 (2026-11-08): Round-2 agent review (R4 F1–F7, F11, F15, F21–F24; R3-01) — kill frames handed to the loader's `RevocationSource.offer` (no federation-side list verification, no feed, no cycle); `revocation` required; `kill-unowned` for list matches; `maxDisabledPerRevision` guard with `releaseRevocation`, `KillSwitch.run` excluded from the scope, `filterDesired` on every apply; kill frame sent before the offer and accepted on suspended links; `unprovisioned` limit stated; BEH-FD-041 and BEH-FD-044 headings changed (old anchors kept) with new step events; import endpoints carry the route's labels; skew rule reconciled with upcaster ranges and park-never-drop; writers-last gated on "reader" reports, offline-capped hosts excludable; wire axis negotiated; BEH-FD-048 added: last applied manifest bytes, pending kills and re-bootstrap marker kept in the store (CCR-FD-003)
- 0.1 (2026-11-08): Initial draft — round 2: recheck items 18, 19, 20 and 22, contradiction X10 (CCR-FD-003)
