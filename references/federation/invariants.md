# Runtime Invariants

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-FD-INV                                               |
> | Revision       | 0.4                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.4 (2026-11-08): Round-2 agent review (R4 F1, F3, F5, F9, F10) — INV-FD-003 covers pending kills and every apply path; INV-FD-010 conditional on a wired revocation source and the topology, guard holds stated; INV-FD-011 covers the guarded install and resumption (CCR-FD-003)<br>0.3 (2026-11-08): round 2: recheck items 18, 19 and 20 — INV-FD-010 (kill path), INV-FD-011 (outbox before snapshot), INV-FD-012 (residency) added (CCR-FD-003)<br>0.2 (2026-11-08): resolutions of the agent review of 2026-11-08 — INV-FD-003 limited to desired lists with pending kills reported; INV-FD-005 one realm per import; INV-FD-006 single-major imports and symmetric agreement; INV-FD-007 fences checked per link, deposed owners not stopped (R3-02, R3-18, R3-19, R3-21, R3-26) (CCR-FD-002)<br>0.1 (2026-11-08): Initial draft (CCR-FD-001)                 |

---

Properties of `@bridger/federation` that hold for every execution, in the
shape of the core [invariants](../core/invariants.md). Nothing below is
implemented; every **Source** and **Verification** is *(Planned)*, and no
invariant may be cited as evidence until a test that checks it has run
([ADR-BR-035](../core/decisions/035-evidence-from-executed-tests.md)).

## INV-FD-001: Applied manifest revisions never decrease

For one (authority, host), the revision a host applies is never lower than a
revision it has verified before, across restarts.

**Source**: `packages/federation/src/Manifest.ts` *(Planned)* — revision
comparison against the `ManifestStore` highest, written before apply; boot
applies the stored highest.

**Implication**: an old signed manifest cannot be replayed, and a crash cannot
bring back a plugin a kill entry removed.

**Verification** *(Planned)*: checks 4 and 5 of BEH-FD-034; a property test
over generated sequences of issue, deliver, crash and boot.

**Related**: [BEH-FD-004](behaviors/01-host-manifest.md#beh-fd-004-revisions-are-monotonic-and-a-reused-revision-is-refused), [BEH-FD-008](behaviors/01-host-manifest.md#beh-fd-008-a-manifest-is-applied-through-one-attributed-reconcile), [BEH-FD-010](behaviors/02-sync-offline-and-rebootstrap.md#beh-fd-010-boot-applies-the-highest-verified-manifest-else-the-boot-bundle), [ADR-FD-003](decisions/003-monotonic-manifest-revisions.md).

## INV-FD-002: No unverified manifest is applied

Every manifest that reaches `reconcile` was accepted by the wired
`SignaturePolicy` as received bytes, in this process, and names this host and
authority.

**Source**: `packages/federation/src/Manifest.ts` *(Planned)* — verify, then
decode, then bind; the decoded type is produced only by the verifying path.

**Implication**: neither a forged manifest nor a locally edited stored copy
changes what the host runs.

**Verification** *(Planned)*: checks 1–3 of BEH-FD-034; a type-level test
that `Manifest.toDesired` accepts only the verified type.

**Related**: [BEH-FD-001](behaviors/01-host-manifest.md#beh-fd-001-a-host-manifest-is-data-with-a-fixed-schema), [BEH-FD-002](behaviors/01-host-manifest.md#beh-fd-002-the-signed-bytes-are-verified-before-they-are-decoded), [BEH-FD-003](behaviors/01-host-manifest.md#beh-fd-003-a-manifest-is-for-one-host-from-one-authority), [ADR-FD-004](decisions/004-signatures-delegated-to-loader.md).

## INV-FD-003: A killed plugin is never in a desired list

No desired list handed to `reconcile` contains an entry matching a kill entry
of the applied manifest, a pending kill of a newer verified manifest not yet
applied in full, or a digest revoked by the newest released revocation set,
whatever the local patches and whichever apply — full, kill-only, freshness
re-apply, retry or boot — builds it.

**Source**: `packages/federation/src/Manifest.ts` *(Planned)* — kill filter
applied after the overlay, not overridable.

**Implication**: the kill switch cannot be undone locally. This is a property
of the desired list, not of the running host: a killed plugin whose removal
was refused for a transient reason keeps running until a later sync removes
it, and is reported `kill-pending` in `Federation.Status` until it is no
longer installed ([BEH-FD-008](behaviors/01-host-manifest.md#beh-fd-008-a-manifest-is-applied-through-one-attributed-reconcile)).

**Verification** *(Planned)*: checks 8, 9, 28, 34 and 40 of BEH-FD-034; a
property test over generated manifests and patches.

**Related**: [BEH-FD-007](behaviors/01-host-manifest.md#beh-fd-007-a-kill-entry-removes-matching-plugins-at-the-next-apply), [BEH-FD-027](behaviors/04-exports-and-imports.md#beh-fd-027-killed-digests-are-neither-imported-nor-exported).

## INV-FD-004: A host always has a defined desired state

At every moment, the federation scope's desired state is the highest verified
manifest, else the boot bundle, else empty — never a partially decoded or
unverified document.

**Source**: `packages/federation/src/Federation.ts` *(Planned)* — boot order
and re-bootstrap keep the applied manifest in force on every failure.

**Implication**: outages of the authority, the store or the snapshot service
leave the host running a known state.

**Verification** *(Planned)*: checks 2, 12 and 16 of BEH-FD-034.

**Related**: [BEH-FD-010](behaviors/02-sync-offline-and-rebootstrap.md#beh-fd-010-boot-applies-the-highest-verified-manifest-else-the-boot-bundle), [BEH-FD-014](behaviors/02-sync-offline-and-rebootstrap.md#beh-fd-014-a-host-too-far-behind-re-bootstraps-from-a-snapshot-outbox-first), [ADR-FD-007](decisions/007-offline-cap-and-rebootstrap.md).

## INV-FD-005: A peer's imports resolve only in the realm named for them

An import proxy for key K at major M from peer P is installed only in the
realm its manifest entry names, by default the peer realm
`peer:P:K@M`, which isolates exactly that key and is never redefined.

**Source**: `packages/federation/src/Import.ts` *(Planned)* — the projection
sets the realm; core decides resolution.

**Implication**: two peers exporting one contract never contend for one
provider slot. This is resolution only, not isolation
([BEH-BR-150](../core/behaviors/17-realms-and-interception.md)).

**Verification** *(Planned)*: checks 21 and 27 of BEH-FD-034.

**Related**: [BEH-FD-022](behaviors/03-links-and-skew-handshake.md#beh-fd-022-each-import-has-its-own-peer-realm), [BEH-FD-026](behaviors/04-exports-and-imports.md#beh-fd-026-an-import-is-a-remote-proxy-plugin-installed-by-reconcile), [ADR-FD-005](decisions/005-peer-realms-and-remote-proxies.md).

## INV-FD-006: A link uses only versions both ends support

No remote session starts on a link's import endpoints before the offer
exchange has agreed a protocol version inside both ends' windows, both ends
reach the same agreement from the same two offers, and an import's proxy
serves only the major its manifest entry names, from a peer export at that
major and at least its version.

**Source**: `packages/federation/src/Handshake.ts` *(Planned)* — a pure
agreement function over both offers and both windows; an import's endpoint
transport opens only for accepted imports.

**Implication**: untested version pairs never run; outside the window the
failure is a typed `IncompatiblePeer` or `IncompatibleContract`.

**Verification** *(Planned)*: checks 18, 19, 24 and 31 of BEH-FD-034; a
property test of agreement symmetry over generated offers and windows.

**Related**: [BEH-FD-018](behaviors/03-links-and-skew-handshake.md#beh-fd-018-the-handshake-offer), [BEH-FD-019](behaviors/03-links-and-skew-handshake.md#beh-fd-019-the-federation-protocol-version-highest-common-inside-the-window), [BEH-FD-020](behaviors/03-links-and-skew-handshake.md#beh-fd-020-each-import-names-one-major-and-the-offer-accepts-or-refuses-it), [ADR-FD-006](decisions/006-n-minus-one-skew-window.md).

## INV-FD-007: Stale epochs and stale fences are refused at the boundary

A reply or offer carrying a previous session's epoch, or a fence token lower
than the highest the importer has seen for that (key, scope), is never
delivered to a consumer.

**Source**: remote companion epoch check
([INV-RM-004](../remote/invariants.md#inv-rm-004-a-stale-epoch-is-refused-at-the-boundary));
`packages/federation/src/Fence.ts` *(Planned)* — highest-token table kept in
the `ManifestStore`; offers checked against it, and the endpoints of a
superseded fence closed before a higher token is recorded.

**Implication**: a deposed owner's answers do not reach an importer once
that importer knows of the deposition (split-brain on exports). It does not
stop the deposed owner from acting for importers that do not know yet;
single-writer effects check the fence where they land (application).

**Verification** *(Planned)*: checks 20 and 23 of BEH-FD-034.

**Related**: [BEH-FD-021](behaviors/03-links-and-skew-handshake.md#beh-fd-021-a-partition-makes-imports-wait-a-new-session-gets-a-new-epoch), [BEH-FD-028](behaviors/04-exports-and-imports.md#beh-fd-028-a-single-owner-export-carries-a-fence), [BEH-FD-029](behaviors/04-exports-and-imports.md#beh-fd-029-importers-refuse-stale-fences-and-stop-on-equal-ones), [BEH-FD-031](behaviors/04-exports-and-imports.md#beh-fd-031-an-export-withdrawn-or-moved-is-refused-at-once), [ADR-FD-008](decisions/008-fenced-single-owner-exports.md).

## INV-FD-008: No host transition waits on the network

No build, finalizer or host transition of any plugin waits for the authority,
a peer, the signature policy's network dependencies, or a link.

**Source**: `packages/federation/src/Federation.ts` *(Planned)* — build reads
the store only; sync, apply and links run in `Plugin.Runtime.background`
fibers. Restates
[INV-RM-002](../remote/invariants.md#inv-rm-002-no-lifecycle-step-waits-on-a-peer)
per federated host.

**Implication**: a dead WAN never holds a host in `starting` or `stopping`.

**Verification** *(Planned)*: check 12 of BEH-FD-034 with the authority and
every peer partitioned.

**Related**: [BEH-FD-008](behaviors/01-host-manifest.md#beh-fd-008-a-manifest-is-applied-through-one-attributed-reconcile), [BEH-FD-009](behaviors/02-sync-offline-and-rebootstrap.md#beh-fd-009-the-federation-plugin-and-a-build-that-never-waits-on-the-network), [BEH-FD-017](behaviors/03-links-and-skew-handshake.md#beh-fd-017-the-manifest-names-the-links), [BEH-FD-024](behaviors/03-links-and-skew-handshake.md#beh-fd-024-applying-a-manifest-changes-links-in-a-fixed-order), [ADR-FD-001](decisions/001-federation-is-a-companion-over-reconcile.md).

## INV-FD-009: Staleness and the offline cap are never silent

Every transition to `stale`, `offline-capped` or `clock-skew`, and every
refused or equivocating manifest, is visible in `Federation.Status` and its
event stream.

**Source**: `packages/federation/src/Freshness.ts` *(Planned)*.

**Implication**: an operator can tell a host running on old instructions from
one that is current.

**Verification** *(Planned)*: checks 14, 15 and 17 of BEH-FD-034.

**Related**: [BEH-FD-012](behaviors/02-sync-offline-and-rebootstrap.md#beh-fd-012-freshness-and-plugins-that-require-a-fresh-manifest), [BEH-FD-013](behaviors/02-sync-offline-and-rebootstrap.md#beh-fd-013-the-offline-cap), [BEH-FD-015](behaviors/02-sync-offline-and-rebootstrap.md#beh-fd-015-federationstatus-reports-what-the-host-follows), [BEH-FD-016](behaviors/02-sync-offline-and-rebootstrap.md#beh-fd-016-time-comes-from-clock-and-a-clock-that-went-backwards-is-stale).

## INV-FD-010: A kill never waits on a manifest apply, the offline cap or a re-bootstrap

Given a wired `RevocationSource` with a trust root (not the loader's
constant source), a revocation list with a greater revision that the source
accepts — from the application's feed or from a `kill` frame on any link,
in any state that has links — leads to a `disable` of every owned plugin it
revokes without waiting for a sync, a manifest or a re-bootstrap, unless the
blast-radius guard holds the revision, which is then reported `kill-held`;
the kill entries of a newer verified manifest are applied by a kill-only
apply while a re-bootstrap is pending, and stay applied until a full apply
of that revision.

**Source**: `packages/federation/src/Revocation.ts` *(Planned)*.

**Implication**: contradiction X10 of the recheck of 2026-11-08 is closed: a
host past its offline cap, or stuck before a snapshot, still loses a revoked
plugin, provided a list reaches it — through its `RevocationSource` feed, or
over a link of the applied manifest's topology. An `unprovisioned` host has
no links. A gate refusal or drain timeout still delays it, reported as
`kill-pending`.

**Verification** *(Planned)*: checks 32–35, 40 and 41 of BEH-FD-034.

**Related**: [BEH-FD-041](behaviors/06-kill-path-placement-and-skew.md#beh-fd-041-revocation-lists-travel-on-their-own-channel-and-are-verified-as-signed-statements), [BEH-FD-042](behaviors/06-kill-path-placement-and-skew.md#beh-fd-042-a-revocation-list-is-applied-at-once-before-re-bootstrap-and-before-any-manifest), [BEH-FD-043](behaviors/06-kill-path-placement-and-skew.md#beh-fd-043-revocation-lists-are-relayed-on-links), [ADR-FD-009](decisions/009-revocation-travels-apart-from-desired-state.md).

## INV-FD-011: A re-bootstrap never replaces state while local facts are neither pushed nor kept

No `Rebootstrap.fetch` or `install` runs unless `RebootstrapOutbox.settle`
succeeded in the same re-bootstrap, or the application wired
`RebootstrapOutbox.none` explicitly; `install` runs only through the
settlement's guarded `install`, and a re-bootstrap interrupted after its
install began resumes from the persisted marker with links suspended.

**Source**: `packages/federation/src/Sync.ts` *(Planned)*.

**Implication**: facts recorded offline survive a re-bootstrap; a host that
cannot push or keep them stays on its last state, reported
`rebootstrap-blocked`.

**Verification** *(Planned)*: checks 16, 36 and 42 of BEH-FD-034.

**Related**: [BEH-FD-014](behaviors/02-sync-offline-and-rebootstrap.md#beh-fd-014-a-host-too-far-behind-re-bootstraps-from-a-snapshot-outbox-first), [BEH-FD-044](behaviors/06-kill-path-placement-and-skew.md#beh-fd-044-re-bootstrap-pushes-or-keeps-the-outbox-before-it-touches-the-snapshot), [ADR-FD-007](decisions/007-offline-cap-and-rebootstrap.md).

## INV-FD-012: No import or export runs over a route that does not offer its residency label

An import or export with a `residency` label is opened or served only over a
route whose offered labels the `PlacementPolicy` accepts for it.

**Source**: `packages/federation/src/Placement.ts` *(Planned)*.

**Implication**: a comparison of the authority's and operator's strings, not
evidence of where a peer runs ([RSK-RM-014](../remote/risks.md#rsk-rm-014)).

**Verification** *(Planned)*: check 37 of BEH-FD-034.

**Related**: [BEH-FD-045](behaviors/06-kill-path-placement-and-skew.md#beh-fd-045-imports-and-exports-are-refused-on-a-route-that-does-not-offer-their-residency-label), [ADR-RM-010](../remote/decisions/010-placement-labels-compared-at-the-boundary.md).
