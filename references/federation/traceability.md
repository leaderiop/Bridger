# Traceability

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-FD-TRACE                                             |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Traceability Matrix                                          |
> | Change History | 0.2 (2026-11-08): resolutions of the agent review of 2026-11-08 — REQ-FD-025–031; invariant scenarios updated (CCR-FD-002)<br>0.1 (2026-11-08): Initial draft (CCR-FD-001)                 |

---

The chain for this companion is BEH-FD → INV-FD → ADR-FD → REQ-FD. User
requirements and risks are registered in the core `urs.md` and
`gxp/03-risk-assessment.md`. Nothing here has run.

## §1 Behaviour to source

| Behaviours | Planned source | Planned tests |
| --- | --- | --- |
| BEH-FD-001–008 ([01](behaviors/01-host-manifest.md)) | `packages/federation/src/Manifest.ts`, `Apply.ts` *(Planned)* | `packages/federation/test/acceptance/manifest.test.ts` *(Planned)* |
| BEH-FD-009–016 ([02](behaviors/02-sync-offline-and-rebootstrap.md)) | `packages/federation/src/Federation.ts`, `Sync.ts`, `Freshness.ts` *(Planned)* | `packages/federation/test/acceptance/sync.test.ts` *(Planned)* |
| BEH-FD-017–024 ([03](behaviors/03-links-and-skew-handshake.md)) | `packages/federation/src/Link.ts`, `Handshake.ts` *(Planned)* | `packages/federation/test/acceptance/links.test.ts` *(Planned)* |
| BEH-FD-025–032 ([04](behaviors/04-exports-and-imports.md)) | `packages/federation/src/Export.ts`, `Import.ts`, `Fence.ts` *(Planned)* | `packages/federation/test/acceptance/exports.test.ts` *(Planned)* |
| BEH-FD-033–034 ([05](behaviors/05-testing-and-acceptance.md)) | `packages/federation/src/testing/TestFederation.ts` *(Planned)* | all of the above |

## §2 Invariant traceability

| Invariant | Behaviours | Decisions | Scenarios |
| --- | --- | --- | --- |
| [INV-FD-001](invariants.md#inv-fd-001-applied-manifest-revisions-never-decrease) | BEH-FD-004, 008, 010 | ADR-FD-003 | REQ-FD-004, 005 |
| [INV-FD-002](invariants.md#inv-fd-002-no-unverified-manifest-is-applied) | BEH-FD-001, 002, 003 | ADR-FD-004 | REQ-FD-001, 002, 003 |
| [INV-FD-003](invariants.md#inv-fd-003-a-killed-plugin-is-never-in-a-desired-list) | BEH-FD-007, 008, 027 | ADR-FD-003 | REQ-FD-008, 009, 028 |
| [INV-FD-004](invariants.md#inv-fd-004-a-host-always-has-a-defined-desired-state) | BEH-FD-010, 014 | ADR-FD-007 | REQ-FD-002, 012, 016 |
| [INV-FD-005](invariants.md#inv-fd-005-a-peers-imports-resolve-only-in-the-realm-named-for-them) | BEH-FD-022, 026 | ADR-FD-005 | REQ-FD-021, 027 |
| [INV-FD-006](invariants.md#inv-fd-006-a-link-uses-only-versions-both-ends-support) | BEH-FD-018, 019, 020, 026 | ADR-FD-006 | REQ-FD-018, 019, 024, 031 |
| [INV-FD-007](invariants.md#inv-fd-007-stale-epochs-and-stale-fences-are-refused-at-the-boundary) | BEH-FD-021, 028, 029, 031 | ADR-FD-008 | REQ-FD-020, 023 |
| [INV-FD-008](invariants.md#inv-fd-008-no-host-transition-waits-on-the-network) | BEH-FD-008, 009, 014, 017, 024 | ADR-FD-001 | REQ-FD-012, 016 |
| [INV-FD-009](invariants.md#inv-fd-009-staleness-and-the-offline-cap-are-never-silent) | BEH-FD-012, 013, 015, 016 | ADR-FD-007 | REQ-FD-014, 015, 017, 029 |

## §3 Decision traceability

| Decision | Status | Behaviours |
| --- | --- | --- |
| [ADR-FD-001](decisions/001-federation-is-a-companion-over-reconcile.md) | Proposed | 01, 02, 04 |
| [ADR-FD-002](decisions/002-authority-is-the-only-source-of-desired-state.md) | Proposed | 01, 02, 03, 04 |
| [ADR-FD-003](decisions/003-monotonic-manifest-revisions.md) | Proposed | 01, 04 |
| [ADR-FD-004](decisions/004-signatures-delegated-to-loader.md) | Proposed | 01 |
| [ADR-FD-005](decisions/005-peer-realms-and-remote-proxies.md) | Proposed | 03, 04 |
| [ADR-FD-006](decisions/006-n-minus-one-skew-window.md) | Proposed | 03, 05 |
| [ADR-FD-007](decisions/007-offline-cap-and-rebootstrap.md) | Proposed | 02 |
| [ADR-FD-008](decisions/008-fenced-single-owner-exports.md) | Proposed | 04 |

## §4 Acceptance scenario traceability

One scenario per required acceptance check of [BEH-FD-034](behaviors/05-testing-and-acceptance.md#beh-fd-034-required-acceptance-checks), in the same order.

| Scenario | Check | Behaviours | Status |
| --- | --- | --- | --- |
| REQ-FD-001 | 1. A manifest whose signature the policy refuses is neither stored nor applied; the store's highest revision is unchanged | [BEH-FD-002](behaviors/01-host-manifest.md) | Not run |
| REQ-FD-002 | 2. A stored manifest edited locally fails re-verification at boot, is reported `store-invalid`, and the boot bundle (or nothing) is applied | [BEH-FD-002](behaviors/01-host-manifest.md), [BEH-FD-010](behaviors/02-sync-offline-and-rebootstrap.md) | Not run |
| REQ-FD-003 | 3. A manifest for another host or authority is refused after verification | [BEH-FD-003](behaviors/01-host-manifest.md) | Not run |
| REQ-FD-004 | 4. Revisions: higher accepted and stored before apply; equal and identical is a no-op; equal and different raises `manifest-equivocation` and changes nothing; lower is refused | [BEH-FD-004](behaviors/01-host-manifest.md) | Not run |
| REQ-FD-005 | 5. A crash injected between storing the highest revision and the end of `reconcile` re-applies that revision at boot, and a plugin it killed does not come back | [BEH-FD-004](behaviors/01-host-manifest.md), [BEH-FD-010](behaviors/02-sync-offline-and-rebootstrap.md) | Not run |
| REQ-FD-006 | 6. A resolver failure drops the entry without pruning an installed plugin; a digest mismatch drops it with "digest-mismatch" | [BEH-FD-005](behaviors/01-host-manifest.md) | Not run |
| REQ-FD-007 | 7. A re-applied identical manifest leaves every entry `unchanged` and restarts nothing | [BEH-FD-005](behaviors/01-host-manifest.md) | Not run |
| REQ-FD-008 | 8. Local patches change only overridable fields; a patch cannot add an entry or revive a killed one | [BEH-FD-006](behaviors/01-host-manifest.md), [BEH-FD-007](behaviors/01-host-manifest.md) | Not run |
| REQ-FD-009 | 9. A kill entry by digest and by id removes the owned plugin through core `remove` (leases drain first), and reports an unowned match without acting | [BEH-FD-007](behaviors/01-host-manifest.md) | Not run |
| REQ-FD-010 | 10. Each apply produces one reconcile with the federation actor, a reason naming the revision, and per-entry gate requests; a gate refusal lands in the status without blocking the record of the applied revision | [BEH-FD-008](behaviors/01-host-manifest.md) | Not run |
| REQ-FD-011 | 11. A manifest listing the federation plugin or one of its providers drops that entry as "self-reference" and applies the rest | [BEH-FD-008](behaviors/01-host-manifest.md) | Not run |
| REQ-FD-012 | 12. Activation with the authority down completes with no network call in the build, and the host runs the stored manifest | [BEH-FD-009](behaviors/02-sync-offline-and-rebootstrap.md), [BEH-FD-010](behaviors/02-sync-offline-and-rebootstrap.md) | Not run |
| REQ-FD-013 | 13. Repeated `ManifestUnavailable` backs off with seeded jitter up to ten intervals and resets on success | [BEH-FD-011](behaviors/02-sync-offline-and-rebootstrap.md) | Not run |
| REQ-FD-014 | 14. Passing `validUntil` disables exactly the `requiresFresh` entries and nothing else; a newer manifest restores them | [BEH-FD-012](behaviors/02-sync-offline-and-rebootstrap.md) | Not run |
| REQ-FD-015 | 15. Exceeding `maxOffline` reports `offline-capped` once; the next contact requires re-bootstrap before applying a newer manifest | [BEH-FD-013](behaviors/02-sync-offline-and-rebootstrap.md), [BEH-FD-014](behaviors/02-sync-offline-and-rebootstrap.md) | Not run |
| REQ-FD-016 | 16. `ResyncRequired` suspends every link, runs `Rebootstrap`, applies the latest manifest and resumes links, in that order; a failing re-bootstrap keeps links suspended and retries | [BEH-FD-014](behaviors/02-sync-offline-and-rebootstrap.md) | Not run |
| REQ-FD-017 | 17. A clock set back before `issuedAt − skewTolerance` makes the manifest stale and reports `clock-skew` | [BEH-FD-016](behaviors/02-sync-offline-and-rebootstrap.md) | Not run |
| REQ-FD-018 | 18. Protocol handshake over generated ranges and windows: both ends agree on the same version; N against N−2 yields `IncompatiblePeer` on both ends and no remote session starts | [BEH-FD-019](behaviors/03-links-and-skew-handshake.md) | Not run |
| REQ-FD-019 | 19. An import not exported at its major and version is refused alone (proxy provides nothing, `IncompatibleContract` listed); two majors run as two proxies | [BEH-FD-020](behaviors/03-links-and-skew-handshake.md) | Not run |
| REQ-FD-020 | 20. A partition makes import dependents wait, not fail; healing opens a new link, repeats the offer exchange, new epochs per session, and a reply of an old epoch is refused | [BEH-FD-021](behaviors/03-links-and-skew-handshake.md) | Not run |
| REQ-FD-021 | 21. Two peers exporting one key are imported into their own peer realms without `DuplicateProvider` | [BEH-FD-022](behaviors/03-links-and-skew-handshake.md), [BEH-FD-026](behaviors/04-exports-and-imports.md) | Not run |
| REQ-FD-022 | 22. An export restricted to some methods refuses the others with method-not-served before any lease; an unavailable provider is refused, not started; a withdrawn export is refused before the reconcile of its apply | [BEH-FD-025](behaviors/04-exports-and-imports.md), [BEH-FD-031](behaviors/04-exports-and-imports.md) | Not run |
| REQ-FD-023 | 23. Split-brain: after the authority moves a fence, a partitioned old owner that reconnects is refused with `StaleExport` on offer and its endpoint is closed before a higher token takes effect; equal tokens from two owners raise `ExportConflict` and both imports wait until a higher token arrives | [BEH-FD-028](behaviors/04-exports-and-imports.md), [BEH-FD-029](behaviors/04-exports-and-imports.md), [BEH-FD-031](behaviors/04-exports-and-imports.md) | Not run |
| REQ-FD-024 | 24. N−1 replay: the acceptance suite of the remote companion and checks 18–23 pass with one host at release N and the other at release N−1 of this package | [BEH-FD-019](behaviors/03-links-and-skew-handshake.md), [BEH-FD-020](behaviors/03-links-and-skew-handshake.md) | Not run |
| REQ-FD-025 | 25. An incoming link from a host that is not a listed peer is refused before any remote session | [BEH-FD-017](behaviors/03-links-and-skew-handshake.md) | Not run |
| REQ-FD-026 | 26. Served calls run as the peer's service actor with provenance; no TokenAuthority needed | [BEH-FD-023](behaviors/03-links-and-skew-handshake.md) | Not run |
| REQ-FD-027 | 27. One peer realm per import, defined before and retired after; changed realms reported | [BEH-FD-022](behaviors/03-links-and-skew-handshake.md), [BEH-FD-024](behaviors/03-links-and-skew-handshake.md) | Not run |
| REQ-FD-028 | 28. Transient rejections and pending kills retried at each sync; merit refusals not retried | [BEH-FD-007](behaviors/01-host-manifest.md), [BEH-FD-008](behaviors/01-host-manifest.md) | Not run |
| REQ-FD-029 | 29. The offline cap runs from the first activation across restarts without contact | [BEH-FD-013](behaviors/02-sync-offline-and-rebootstrap.md) | Not run |
| REQ-FD-030 | 30. Offline boot after a restart runs only what the resolver holds locally | [BEH-FD-005](behaviors/01-host-manifest.md) | Not run |
| REQ-FD-031 | 31. An import's endpoint opens only for an accepted import on an up link | [BEH-FD-026](behaviors/04-exports-and-imports.md) | Not run |
