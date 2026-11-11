# Bridger Federation — Specification

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-FD-00                                                |
> | Revision       | 0.10                                                         |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification — Companion Master Index            |
> | Change History | 0.10 (2026-11-11): CCR-FD-008 registered (specification audit of 2026-11-11, round 5: H4, H5, H6, F1, F2, F3, F4, PL8, PL9, PL11) (CCR-FD-008)<br>0.9 (2026-11-10): CCR-FD-007 registered (specification audit of 2026-11-10, round 4: H4, F1, F2, F3, PL16, C9) (CCR-FD-007)<br>0.8 (2026-11-10): CCR-FD-006 registered (specification audit of 2026-11-10, round 3: M16, M18, Low) (CCR-FD-006)<br>0.7 (2026-11-10): CCR-FD-005 registered (specification audit of 2026-11-09, round 2: P1, P4, identity through envelopes, link-suspend outcome); honest-claims bullet on identity narrowed to import proxies; follow-ups added to row CCR-FD-005 (CCR-FD-005)<br>0.6 (2026-11-09): CCR-FD-004 registered; honest-claims bullet on identity sent to peers; CCR-FD-004 row extended for core CCR-BR-033 (local contracts, disclosed claims); CCR-FD-004 row: file 05 introduction (independent review) (CCR-FD-004)<br>0.5 (2026-11-08): CCR-FD-003 extended with the resolutions of the round-2 agent review; claims line on statement and list verification; open questions on the blast-radius helper and kill reach without links (CCR-FD-003)<br>0.4 (2026-11-08): round 2: recheck items 18–20 and 22 (X10) — file 06, ADR-FD-009, honest-claims lines for statements and residency, open question on the `RefusalList`, register row CCR-FD-003 (CCR-FD-003)<br>0.3 (2026-11-08): resolutions of the agent review of 2026-11-08; register row and open questions added (CCR-FD-002)<br>0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-FD-001)<br>0.1 (2026-11-08): Initial draft (CCR-FD-001)                 |

---

**implementation: absent**

This is the specification of `@bridger/federation`, a companion package of
`@bridger/core`. It lets many Bridger hosts — a cloud service, a shop hub, a
fleet of terminals — each converge on a desired state that an **authority**
issues for it, keep running on the last state it applied while offline, and
call each other's services across **links**, each peer resolved in its own
realm. It covers gap item 8 of the architecture review of 2026-11-08 and the
distributed-systems hazards named in its §9 (clock skew, split-brain on
exports, replay after long offline periods).

## Status: prospective

Nothing described here is implemented. Every document is a `Draft`, every
decision is `Proposed`, and every source or test path is marked *Planned*.
The rule of the core specification applies unchanged
([ADR-BR-036](../core/decisions/036-prospective-specification.md)): this
specification is not evidence that the package behaves as described. A
requirement becomes evidence only when a test that exercises it has run and
passed ([ADR-BR-035](../core/decisions/035-evidence-from-executed-tests.md)).

## The honest-claims rule

This companion inherits the core's honest-claims rule
([core README](../core/README.md#the-honest-claims-rule)). In particular:

- It makes **no** claim that a federation of hosts is secure, isolated or
  sandboxed. A peer realm is a resolution namespace, not a boundary
  ([BEH-BR-150](../core/behaviors/17-realms-and-interception.md)); code of a
  peer never runs in the local process — a peer's services are reached through
  remote proxy plugins, and the guarantees of the transport (authentication,
  confidentiality) are the transport's and the consumer's.
- It performs **no** cryptography. Manifest signatures are verified by the
  loader companion's `SignaturePolicy.verify` with `statementType`
  "host-manifest", and revocation lists by the loader's `RevocationSource`
  under its own trust root ([references/loader/](../loader/README.md)); this
  package only refuses what those did not accept.
- Its import proxies send **no** caller identity to a peer unless the
  authority's signed manifest lists the claims for that import
  (`ManifestImport.disclose`,
  [BEH-FD-026](./behaviors/04-exports-and-imports.md#beh-fd-026-an-import-is-a-remote-proxy-plugin-installed-by-reconcile)).
  A peer that receives them becomes a processor of them; that is the
  authority's decision, recorded in the manifest. `disclose` does not cover
  events: an envelope of the event delivery companion routed to a peer
  carries the publisher's actor, `onBehalfOf` and correlation id, and which
  streams reach a peer is that companion's routing.
- It makes **no** residency claim. Residency labels on plugins, imports,
  exports and routes are the authority's and operator's strings; this package
  compares them and refuses on a mismatch.
- It keeps **no** storage of its own. The last applied manifest is kept
  through a `ManifestStore` port that the consumer implements; whether that
  copy survives a power loss or a disk replacement is the consumer's
  obligation.
- It provides **no** consensus and **no** automatic failover. Desired state
  comes from the authority alone; two hosts never elect an owner between
  themselves ([ADR-FD-002](./decisions/002-authority-is-the-only-source-of-desired-state.md)).

## Reading order

| Step | Document | Purpose |
| ---- | -------- | ------- |
| 1 | [Overview](./overview.md) | Mission, package boundary, public API surface, worked example |
| 2 | [Behaviours](./behaviors/01-host-manifest.md) | What the package must do, as `BEH-FD` requirements |
| 3 | [Invariants](./invariants.md) | Properties that hold for every execution |
| 4 | [Decisions](./decisions/001-federation-is-a-companion-over-reconcile.md) | Why, as `ADR-FD` records |
| 5 | [Traceability](./traceability.md) | BEH → INV → ADR → REQ |

The core specification is a prerequisite: [reconcile](../core/behaviors/18-reconciliation-and-confluence.md),
[realms](../core/behaviors/17-realms-and-interception.md),
[attributable operations](../core/behaviors/22-attributable-operations.md)
and the [operation gate](../core/behaviors/25-operation-gate.md) are used
here without restatement.

## Contents

### Behaviours

| # | File | Identifiers |
| - | ---- | ----------- |
| 01 | [Host manifest](./behaviors/01-host-manifest.md) | BEH-FD-001–008 |
| 02 | [Sync, offline and re-bootstrap](./behaviors/02-sync-offline-and-rebootstrap.md) | BEH-FD-009–016 |
| 03 | [Links and the skew handshake](./behaviors/03-links-and-skew-handshake.md) | BEH-FD-017–024 |
| 04 | [Exports and imports](./behaviors/04-exports-and-imports.md) | BEH-FD-025–032 |
| 05 | [Testing and acceptance](./behaviors/05-testing-and-acceptance.md) | BEH-FD-033–040 |
| 06 | [Kill path, placement and skew](./behaviors/06-kill-path-placement-and-skew.md) | BEH-FD-041–048 |

Each file owns a block of eight identifiers; unused numbers at the end of a
block are reserved, not gaps (core
[identifier scheme](../core/process/requirement-id-scheme.md) §3).

### Decisions

| ADR | Title |
| --- | ----- |
| [ADR-FD-001](./decisions/001-federation-is-a-companion-over-reconcile.md) | Federation is a companion layered on reconcile |
| [ADR-FD-002](./decisions/002-authority-is-the-only-source-of-desired-state.md) | The authority is the only source of desired state |
| [ADR-FD-003](./decisions/003-monotonic-manifest-revisions.md) | Manifest revisions are monotonic per host |
| [ADR-FD-004](./decisions/004-signatures-delegated-to-loader.md) | Signature verification is delegated to the loader companion |
| [ADR-FD-005](./decisions/005-peer-realms-and-remote-proxies.md) | Each peer in its own realm, imports as remote proxies |
| [ADR-FD-006](./decisions/006-n-minus-one-skew-window.md) | An N/N−1 skew window with the highest common version |
| [ADR-FD-007](./decisions/007-offline-cap-and-rebootstrap.md) | A cap on offline duration, and snapshot re-bootstrap |
| [ADR-FD-008](./decisions/008-fenced-single-owner-exports.md) | Fenced single-owner exports against split-brain |
| [ADR-FD-009](./decisions/009-revocation-travels-apart-from-desired-state.md) | Revocation travels apart from desired state |

## Open questions

Residuals this revision cannot settle alone. None needs a core behaviour
change; the first two are risk rows for the core risk assessment, where this
companion's risks are registered.

- **Deposed owner still acting.** A fence protects each importer, not the
  owner side; two owners can serve different importers until every importer
  has seen the higher token (BEH-FD-028, ADR-FD-008). Proposed core risk row:
  split-brain effects of a deposed owner, owner Consumer.
- **Offline boot depends on the loader cache.** After a restart, an entry the
  resolver cannot resolve locally is dropped, not run (BEH-FD-005). Proposed
  core risk row, owner Consumer + loader companion.
- **Who wires the `RefusalList`.** The kill path (BEH-FD-042) relies on the
  deployment's `RefusalList` refusing every digest of the newest list; the
  loader derives one from its `RevocationSource` (loader BEH-LD-056), which
  the deployment must still wire into core.
- **A shared blast-radius helper.** The kill path restates the loader's
  per-revision cap and release (BEH-FD-042) because the kill switch is
  excluded from the federation scope; whether the loader should offer the
  guard as a helper both use is loader open item 2.
- **Kill reach without links.** An `unprovisioned` host, and a host the
  manifest links to no peer, receives lists only through its
  `RevocationSource` feed (ADR-FD-009 limits).
- **Peer realm ids and family ids.** Peer realm ids contain the peer and
  contract ids, which may contain "/"; family member ids are formed with "/"
  too (core gap G47).

## Identifier scheme

The core scheme applies with the infix **`FD`**.

| Prefix | Meaning | Defined in |
| ------ | ------- | ---------- |
| `BEH-FD-NNN` | Functional behaviour requirement | `behaviors/NN-*.md` headings |
| `INV-FD-NNN` | Runtime invariant | `invariants.md` headings |
| `ADR-FD-NNN` | Architecture decision | `decisions/NNN-*.md` |
| `REQ-FD-NNN` | Acceptance scenario (planned) | `traceability.md` §4 |
| `CCR-FD-NNN` | Change control record | this README, Document history |
| `BRIDGER-FD-*` | Document ID | Document Control headers |

User requirements and risks are not duplicated here: this companion's needs
and risks are registered in the core `urs.md` and `gxp/03-risk-assessment.md`
under the `BR` infix, so that one risk register covers the core and its
companions. Changes follow core
[change control](../core/process/change-control.md).

## Document history

| CCR | Date | Change |
| --- | ---- | ------ |
| CCR-FD-001 | 2026-11-08 | Initial draft of the federation companion: signed per-host desired-state manifests applied through core `reconcile` and `Desired.overlay`; last applied manifest kept through a consumer port for offline boot; kill switch as a manifest entry; offline cap and snapshot re-bootstrap; links with an N/N−1 skew handshake (`IncompatiblePeer`); exports and imports across links, each peer in its own realm, imports as remote proxies; fenced single-owner exports against split-brain; monotonic revisions. Impact assessment (PROC-03 §3): (1) adds BEH-FD-001–034, INV-FD-001–009, ADR-FD-001–008, REQ-FD-001–024; no core identifier changed by this CCR — the core URS, RSK, glossary and overview rows it needs are proposed to the core change that registers this companion. (2) Risk: introduces distributed-systems risks (stale or rolled-back desired state, split-brain on exports, skewed clocks, unverified manifests) to be registered in the core risk assessment. (3) GxP impact: yes — the package drives operator mutations through `reconcile`, which are attributed, gated and audited by core; it does not change core's audit record or gate. (4) Revalidation: none (nothing qualified exists). (5) Compatibility: new package; no core public type changes. |
| CCR-FD-002 | 2026-11-08 | Resolutions of the agent review of 2026-11-08 (report R3), findings R3-01 (federation part), R3-02, R3-03, R3-18, R3-19, R3-20, R3-21, R3-22, R3-23, R3-24, R3-25, R3-26, and R3-33 (citation side): links rebuilt on the remote companion's `Transport`, endpoint multiplexer (BEH-RM-056) and host-side serving end `Remote.serve` (BEH-RM-039), with this package's own control endpoint for offers, `LinkListener` and acceptance of listed peers only, `PeerLinkStatus` with string identifiers, fences bound to the link and enforced by closing superseded endpoints, no cross-host `TokenAuthority` needed; one import proxy per (peer, contract, major), accepted or refused by the offer, never a major chosen (core BEH-BR-232); method restriction and unavailable providers through `Remote.serve` refusals instead of `Grant.of`; one immutable peer realm per import, retired when empty, no realm family; transient reconcile rejections and pending kills retried at each sync and reported; re-bootstrap suspends links; symmetric protocol window in the offer, `protocolWindow` and `contractWindow`; wording of waiting proxies; resolver cache dependency stated and resolved definitions kept; offline cap from a stored first activation; fence limits stated; event delivery positions cited through `HistorySource` (BEH-DB-047). Impact assessment (PROC-03 §3): (1) adds REQ-FD-025–031; changes the manifest fields `window` (split) and `ManifestImport.range` (now `version`); renames `LinkStatus` to `PeerLinkStatus`; adds `LinkListener`, `ControlFrame`, `FederationOptions.contracts` and `listener`, `ManifestStore` first-activation and fence methods; headings of BEH-FD-020 and BEH-FD-022 changed; no identifier withdrawn. (2) Risk: two risk rows proposed for the core register (Open questions). (3) GxP impact: yes — peer realms are now retired with the attributed `retireRealm`, and transient retries add attributed reconciles under the federation actor; no core record, gate or legality cell changed. (4) Revalidation: none (nothing qualified exists). (5) Compatibility: manifest format `bridger.host-manifest/1` changed within a Draft; no core change. |
| CCR-FD-003 | 2026-11-08 | Round 2: recheck items 18, 19, 20 and 22, contradiction X10, and alignment with CORE-DECISIONS-2 (CCR-BR-024–026). Item 18 / X10: revocation lists travel apart from manifests — a `kill` control frame on every link (one schema across protocol versions, relayed hub to terminal) and the loader's `RevocationSource` — verified with the loader's `SignaturePolicy.verify({ statementType: "revocation-list" })`, applied at once in any state by an attributed `disable` per owned plugin with the core `RefusalList` keeping it down, before every re-bootstrap and manifest; a kill-only apply of a newer manifest's kill entries while a re-bootstrap is pending; `RevocationListStale` (BEH-FD-041–043, INV-FD-010, ADR-FD-009). Item 19: re-bootstrap order fixed — push or keep the outbox (`RebootstrapOutbox`), fetch the snapshot, replace projections, resume links; a step-1 failure stops with `RebootstrapBlocked` and drops nothing; `Rebootstrap` split into `fetch` and `install` (BEH-FD-014, BEH-FD-044, INV-FD-011). Item 20: residency labels on imports, exports, peers and plugins compared with the remote companion's `PlacementPolicy`; `PlacementRefused`; labels carried as the `placement/residency` annotation (BEH-FD-045, INV-FD-012). Item 22: one skew model across protocol, wire, contract major and minor, event version and upcaster chain; writers-last rollout; oldest version received per origin reported (BEH-FD-046, BEH-FD-047). Alignment: `mandatoryInterceptions` and `allowChildren` as manifest data, `PolicyMismatch` not retried; `atomic` off by default with `PartialApply` reported; core reconcile order and G65; asserted principals through `PrincipalRef.decode`; served calls carry the peer's correlation; peer selection through `Selector.make` with a range. Impact assessment (PROC-03 §3): (1) adds BEH-FD-041–047, INV-FD-010–012, ADR-FD-009, REQ-FD-032–039; amends BEH-FD-001, 002, 005, 007, 008, 009, 013, 014 (heading and anchor changed), 015, 018, 022, 023, 034, ADR-FD-004, 006, 007; no identifier withdrawn. (2) Risk: closes the unbounded kill delay of offline hosts and the loss of offline facts at re-bootstrap; residency labels add the hazard registered as remote RSK-RM-014. (3) GxP impact: yes — revocation-driven `disable` calls and kill-only applies are attributed, gated and audited operator calls under the revocation and federation actors; no core record, gate or legality cell changed. (4) Revalidation: none (nothing qualified exists). (5) Compatibility: draft-to-draft; `HostManifest` fields added within `bridger.host-manifest/1`, `ControlFrame` gains `kill`, `Rebootstrap` changes shape, `FederationOptions` and `FederationStatus` gain fields. **Extension (2026-11-08, resolutions of the round-2 agent review):** findings R4-offline F1–F11, F15, F21–F24 and R3-01. Kill path: the loader's exact `SignaturePolicy.verify` call and `SignedStatement` envelope for host manifests (id JCS([authority, host]), version the decimal revision), checked against the decoded manifest; revocation lists never verified here but handed to `RevocationSource.offer` (`revocationFeed` withdrawn, cycle and undefined type gone); `revocation` required; `kill-unowned` for list matches; `maxDisabledPerRevision` with `releaseRevocation`; `KillSwitch.run` excluded from the scope and `filterDesired` on every apply; kill frame before the offer and accepted on suspended links; reach restated. Persistence: new BEH-FD-048 — the last applied manifest's bytes, pending kills (subtracted from every apply until a full apply) and a re-bootstrap marker in the `ManifestStore`; boot honours them. Re-bootstrap: settle with links up, links suspended only for fetch and install (control kept), install only through `OutboxSettlement.install` with a declared `replaces`, revision mismatch defined, per-step retry points on their own backoff, install must not roll back the manifest, revocation or fence stores. Placement: import endpoints carry the route's labels. Skew: rule reconciled with upcaster ranges and park-never-drop; writers last gated on "reader" reports; offline-capped hosts excludable; wire axis negotiated. Impact: adds BEH-FD-048, REQ-FD-040–043; amends BEH-FD-002, 004, 007, 008, 009, 010, 012–015, 018, 041–047 (BEH-FD-044 heading changed, old anchor kept), INV-FD-003, 010, 011, ADR-FD-004, 007, 009; `ManifestStore`, `Rebootstrap`, `RebootstrapOutbox`, `FederationOptions`, `FederationStatus`, `OldestVersionReport` change shape (draft to draft). GxP impact: yes — guard releases are attributed operator calls; no core record, gate or legality cell changed. Revalidation: none. |
| CCR-FD-004 | 2026-11-09 | Resolutions of the specification audit of 2026-11-09, federation side of finding F-07, aligned with remote CCR-RM-004. This is an agent review, not the independent review of PROC-03 §5. `ManifestImport.disclose` names the identity claims ("actor", "onBehalfOf", "org", "correlationId") an import sends to its peer, default none, set only by the signed manifest (BEH-FD-001); it is passed as `RemoteOptions.disclose`, enters the import's deterministic `meta.version`/`meta.digest` together with `residency`, and an unknown claim name drops the import "unknown-claim" (BEH-FD-026); a served call reads `correlationId` and `onBehalfOf` only when present and records a provenance entry without `ref` when no actor is disclosed (BEH-FD-023); ADR-FD-005 decision bullet; check 44 and REQ-FD-044 added; honest-claims bullet on identity. Follow-ups of core CCR-BR-033: the claims an import sends are now named in each call-log crossing entry by the remote companion (`CrossingInfo.disclosed`, remote BEH-RM-024). Local contracts (core `Contract.local`, BEH-BR-225, 232): `FederationOptions.contracts` rejects a local contract at compile time, and one passed untyped fails the plugin's build with the remote companion's `LocalContractRefused` (site "federation-contracts") before the store is read, so nothing is applied, imported or served (BEH-FD-009); a manifest entry can then never name a local contract, which is dropped "unknown-contract". Failing the build was chosen over dropping the contract at each projection, because the fault is in the application's code, is the same on every start and cannot be repaired by a manifest. Acceptance check 45 added. Independent review: file 05's introduction now names check 45.<br>**Impact (PROC-03 §3).** (1) Identifiers: REQ-FD-044 and REQ-FD-045 added; BEH-FD-001, 009, 023 and 026 amended; ADR-FD-005 amended; no BEH, INV or ADR added or withdrawn. (2) Risk: a peer no longer receives user identities without a recorded decision (remote RSK-RM-016); no core score changed. (3) GxP impact: none beyond CCR-FD-001; disclosure to a peer is a data transfer the authority decides in a signed, attributed manifest. (4) Revalidation: none (implementation absent). (5) Compatibility: a manifest schema field added, ignored by older hosts on decode — an older host keeps sending every claim, so a mixed fleet discloses as before until upgraded; the digest of every existing import changes once, so the first apply after upgrade replaces each import proxy (calls in flight drain under remote's rules); a `contracts` list holding a local contract now fails the plugin's build. |
| CCR-FD-005 | 2026-11-10 | Round 2 findings of the specification audit of 2026-11-09, federation side. This is an agent review, not the independent review of PROC-03 §5. **Findings resolved.** P1 (`OutboxSettlement.install` typed differently on the two sides): the port is the event delivery companion's (BEH-DB-048); BEH-FD-014 restates it with that companion's error union, `E | SnapshotFailed | IncarnationUnavailable`, and `InstallContext` as its `StoreTransaction`; `RebootstrapBlocked`, which only `settle` raises, leaves `install`'s union; step 3a states, for `RebootstrapFailed`, `SnapshotFailed` "outbox-touched" and "prepare-failed", `IncarnationUnavailable` and a defect, what local state is left, that each is reported `rebootstrap-failed` with step "install" and is retried from step 1 with links suspended; `RebootstrapOutbox.none` defines its settlement's `install`. H8 (federation side): step 3a relies on durable-bus CCR-DB-005, which raises the incarnation before `run`. P4 (upcaster drop vs the event store's `UpcasterRemoved`; the offline cap does not bound backlog age): the skew table's upcaster row adds the stored-version constraint, and BEH-FD-046 states that the offline-cap exclusion applies to the writer switch only and that a `minVersion` raise is not rolled out to a host whose store holds older events. Low (identity reaches peers through envelopes): BEH-FD-026 and the honest-claims bullet narrow the no-identity statement to proxy calls and say what an envelope routed to a peer carries. Low (outcome of a call cut by a link suspension): BEH-FD-014 defers to the remote companion's rule, "not-executed" only when the frame was never handed to the transport, else "unknown" (remote BEH-RM-020); remote is unchanged.<br>**Impact (PROC-03 §3).** (1) Identifiers: BEH-FD-014, BEH-FD-026 and BEH-FD-046 amended; nothing added or withdrawn. (2) Risk: no core risk added and no score changed; dropping an upcaster on the strength of the offline cap, which would have parked or halted old envelopes, is no longer permitted. (3) GxP impact: none beyond CCR-FD-001; the disclosure statement now matches what envelopes carry. (4) Revalidation trigger: none; nothing is implemented, released or qualified (implementation absent). (5) Compatibility: draft to draft — `OutboxSettlement.install`'s error union and excluded context change to the event delivery companion's; a step 3a failure is reported `rebootstrap-failed` per error. **Follow-ups.** `ResolveFailed` (01, BEH-FD-005), `DialFailed` and `ListenFailed` (03, BEH-FD-017) stood in error positions and were never declared; they are declared with the fields their requirements use (`digest`; `peer`, the `ManifestPeer`'s id; `message`); no behaviour changed. |
| CCR-FD-006 | 2026-11-10 | Round 3 findings of the specification audit of 2026-11-10 (SPEC-AUDIT-03), federation side. This is an agent review, not the independent review of PROC-03 §5. **Findings resolved.** M16 (raising `minVersion` needed every origin's backlog, but only "received" and "reader" reports existed and a replaced origin never reports again): `OldestVersionReport` gains kind "backlog" — axis "event", the host's current origin and `pending`, no versions — supplied by the event delivery companion, and an authority raising `minVersion` counts only the current incarnation of each node, on the evidence of reset version windows free of the old version and a later empty backlog (BEH-FD-047, durable-bus BEH-DB-029, BEH-DB-032, CCR-DB-006; check 38). M18 (a step-1 failure on a retry after a failed install claimed that no link was suspended): only a first attempt has none suspended; a retry after a failed step 3a keeps links suspended (BEH-FD-014; checks 36 and 43 narrowed). Low (install `GapRecord` unattributed): step 3a runs the install under the federation actor, which the event delivery companion records with reason "rebootstrap:" + `replaces` (durable-bus BEH-DB-044). Low (no checks for the step-3a failure paths): check 46 added. Low (seen, not assessed: whether `follow` pulls while links are suspended): the event delivery companion pauses `follow` while the settlement is held, from step 1 to the end of step 3a, so no receipt races the install; during step 3b a source reached through a suspended link answers `HistoryUnavailable` and `follow` backs off until step 4 (BEH-FD-014 note, durable-bus BEH-DB-047; check 36).<br>**Impact (PROC-03 §3).** (1) Identifiers: BEH-FD-014 and BEH-FD-047 amended; check 46 and REQ-FD-046 added; checks 36, 38 and 43 and their rows restated; INV-FD-011 row extended; nothing withdrawn. (2) Risk: no risk added and no score changed. (3) GxP impact: indirect — upcasters are dropped only on evidence that no current origin holds old envelopes, and an install's watermark moves are attributed; no core record, gate or legality row changes. (4) Revalidation trigger: none; nothing is implemented, released or qualified (implementation absent). (5) Compatibility: draft to draft — `OldestVersionReport.oldest` and `newest` become optional (absent only on "backlog"); depends on durable-bus CCR-DB-006. |
| CCR-FD-007 | 2026-11-10 | Round 4 findings of the specification audit of 2026-11-10 (SPEC-AUDIT-04), federation side. This is an agent review, not the independent review of PROC-03 §5. **Findings resolved.** H4 (`multiplex` takes the physical end's `TransportProfile`, but federation's links had none to pass): `LinkDialer.dial` and `LinkListener.accept` yield a `LinkConnection` — the `Connection` with the profile of the end that made it — and BEH-FD-017 passes that profile to both `multiplex` calls; a route's offered labels fall back to it (BEH-FD-017, BEH-FD-045). F1 (export endpoints were opened without residency, so `Remote.serve` refused every call of an accepted route): export endpoints are opened with `MultiplexedGuest.endpoint(name, { residency })` and the route's offered labels, like imports (BEH-FD-025, BEH-FD-045; check 37). F2 (a retry after a failed install kept links suspended, so a deployment delivering its outbox over a peer link blocked "outbox-unsettled" for ever): `FederationOptions.deliveryImports` names the imports that carry the outbox's delivery; an attempt that starts with links suspended reopens only those in step 1, and step 2 closes them again; without the option such a retry stays blocked, which documentation states (BEH-FD-014; checks 16 and 43). F3 (ADR-FD-007, BEH-FD-044 and BEH-FD-014's step text still said links stay up in step 1): each statement limited to a first attempt (BEH-FD-014, BEH-FD-044, ADR-FD-007). PL16: `LinkAgreement.refused` gains "placement-refused" (BEH-FD-018). C9 (copy of a core finding): an import is accepted when the export's version satisfies `"^" + V`, inside the `ContractRange` grammar (BEH-FD-020; core BEH-BR-232).<br>**Impact (PROC-03 §3).** (1) Identifiers: BEH-FD-014, 017, 018, 020, 025, 044 and 045 and ADR-FD-007 amended; checks 16, 37 and 43 and their rows restated; `LinkConnection` and `FederationOptions.deliveryImports` added; nothing withdrawn. (2) Risk: no risk added and no score changed. (3) GxP impact: indirect — facts held offline can be pushed on a retried re-bootstrap; no core record, gate or legality row changes. (4) Revalidation trigger: none; nothing is implemented, released or qualified (implementation absent). (5) Compatibility: draft to draft — `LinkDialer` and `LinkListener` yield `LinkConnection` in place of `Connection`; for major 0 an export at a higher minor is now refused. |
| CCR-FD-008 | 2026-11-11 | Round 5 findings of the specification audit of 2026-11-11 (SPEC-AUDIT-05), federation side. This is an agent review, not the independent review of PROC-03 §5. **Findings resolved.** H4 (a retry's step 1 reopened delivery imports that could not open while their link was suspended): new `PeerLinkStatus` state `delivery-only`, used only in step 1 of an attempt that starts with links suspended; `open` succeeds on it for an import named in `deliveryImports`, and step 2 returns the link to `suspended` (BEH-FD-014, BEH-FD-017, BEH-FD-026; checks 31 and 43). F1 (step 1's offer ran on a suspended control endpoint, which ignores offers, and would have listed exports): BEH-FD-018 states the step-1 exception, an offer listing only the delivery imports and no export. H6 (the marker forgot that an install began, so a crash during a retry could resume links over half-replaced state): `RebootstrapMarker.installAttempted`, stored true before the first install call and kept until the marker is cleared, keeps every link suspended at activation whatever the step; the restart behaviour of every step is stated (BEH-FD-048, INV-FD-011; check 47). F2 (a step-2 failure resumed links a retry must keep suspended): a `RebootstrapFailed` from step 2 resumes links only when `installAttempted` is false (BEH-FD-014). F3 (reopening a delivery import woke every local dependent): a delivery import may have no local dependent but the event delivery companion's relay, refused at build with `DeliveryImportRefused` and checked again before step 1 opens it (`RebootstrapBlocked` "delivery-import-dependents") (BEH-FD-009, BEH-FD-014; check 43). PL8 (`deliveryImports` held serviceIds, which do not identify one import): it holds import ids, "import:" + from + ":" + K + "@" + M. PL9: the error catalog's `RebootstrapBlocked` and `RebootstrapFailed` are restated by attempt and step, with the `deliveryImports` warning BEH-FD-014 requires (docs/guides/error-catalog.md, kit BEH-KT-052 rows). H5 (confirmed in the source: an import proxy is built in step (3) of an apply, before any link is dialled, so the dialer-profile fallback could not reach its placement check): an import with a `residency` requires `ManifestPeer.residency` for its peer, else it is dropped "peer-residency-missing"; the proxy's federation endpoint transport declares that residency from its build; exports keep the dialer or listener fallback (BEH-FD-026, BEH-FD-045, INV-FD-012; check 37 split by direction); remote BEH-RM-068 needed no change. F4 (the `"^" + V` range had not reached every statement): INV-FD-006, ADR-FD-006, BEH-FD-025, the skew table of BEH-FD-046 and the overview state it (for major 0, the same minor and v ≥ V). PL11: REQ-FD-037 and INV-FD-012 cite BEH-FD-017, 025, 026 and 045 as check 37 does; the overview's errors table gains `RebootstrapFailed` (now declared in 02), `ResolveFailed`, `DialFailed` and `ListenFailed`.<br>**Impact (PROC-03 §3).** (1) Identifiers: BEH-FD-009, 014, 017, 018, 025, 026, 044, 045, 046 and 048, INV-FD-006, 011 and 012, ADR-FD-006 and 007 amended; check 47 and REQ-FD-047 added; checks 16, 31, 37 and 43 and their rows restated; nothing withdrawn. (2) Risk: no risk added and no score changed; links can no longer resume over a half-replaced store after a retry, a step-2 failure or a restart. (3) GxP impact: indirect — offline facts can still be pushed on a retried re-bootstrap without waking other dependents against half-replaced state; no core record, gate or legality row changes. (4) Revalidation trigger: none; nothing is implemented, released or qualified (implementation absent). (5) Compatibility: draft to draft — `PeerLinkStatus.state` gains `delivery-only`, `RebootstrapMarker` gains `installAttempted`, `deliveryImports` entries change from serviceIds to import ids, and an import with a `residency` whose peer declares none is now dropped. |
