# 06 — Kill path, placement and skew

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-FD-BEH-06                                            |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.2 (2026-11-08): Round-2 agent review (R4 F1–F7, F11, F15, F21–F24; R3-01) — kill frames handed to the loader's `RevocationSource.offer` (no federation-side list verification, no feed, no cycle); `revocation` required; `kill-unowned` for list matches; `maxDisabledPerRevision` guard with `releaseRevocation`, `KillSwitch.run` excluded from the scope, `filterDesired` on every apply; kill frame sent before the offer and accepted on suspended links; `unprovisioned` limit stated; BEH-FD-041 and BEH-FD-044 headings changed (old anchors kept) with new step events; import endpoints carry the route's labels; skew rule reconciled with upcaster ranges and park-never-drop; writers-last gated on "reader" reports, offline-capped hosts excludable; wire axis negotiated; BEH-FD-048 added: last applied manifest bytes, pending kills and re-bootstrap marker kept in the store (CCR-FD-003)<br>0.1 (2026-11-08): Initial draft — round 2: recheck items 18, 19, 20 and 22, contradiction X10 (CCR-FD-003) |

---

Three things a fleet needs do not fit the manifest cycle of files 01–05. A
kill must reach a host that is past its offline cap, waiting for a
re-bootstrap, or cut off from the authority but still linked to a hub — a
manifest cannot, because it waits behind all of these (contradiction X10 of
the recheck of 2026-11-08). Data labelled for one place must not be served
or imported over a route that leads elsewhere. And versions skew on four
axes at once — federation protocol, contract majors, event versions,
upcaster chains — which until now had four separate rules. This file owns
BEH-FD-041–048 and uses all eight.

Planned source: `packages/federation/src/Revocation.ts`,
`packages/federation/src/Placement.ts`, `packages/federation/src/Skew.ts`
*(Planned)*.

## BEH-FD-041: Revocation lists travel on their own channel and are verified by the loader's revocation source

<a id="beh-fd-041-revocation-lists-travel-on-their-own-channel-and-are-verified-as-signed-statements"></a>

> **Invariant:** [INV-FD-010](../invariants.md#inv-fd-010-a-kill-never-waits-on-a-manifest-apply-the-offline-cap-or-a-re-bootstrap)
> **See:** [ADR-FD-009](../decisions/009-revocation-travels-apart-from-desired-state.md), [ADR-FD-004](../decisions/004-signatures-delegated-to-loader.md)
> **Depends on:** loader `RevocationSource`, `RevocationSource.offer`, `SignedRevocationList` ([references/loader/](../../loader/README.md), [04 — Revocation and kill switch](../../loader/behaviors/04-revocation-and-kill-switch.md), BEH-LD-025, BEH-LD-026)
> **Satisfies:** [URS-BR-053](../../core/urs.md#urs-br-053-keep-a-revoked-plugin-version-from-running-again-whatever-starts-it), [URS-BR-002](../../core/urs.md#urs-br-002-remove-or-replace-a-plugin-safely-while-it-is-in-use)

```ts
// illustrative — not type-checked
// The list is the loader's SignedRevocationList (loader BEH-LD-025): a SignedStatement of type
// "revocation-list", id = issuer, version = revision in decimal, payload = RevocationSet.encode(set).
// This package never verifies it itself: "revocation-list" has no SignaturePolicy rule (loader BEH-LD-050);
// it hands each list to RevocationSource.offer(list, from) and reads the OfferOutcome.
class RevocationListStale extends Schema.TaggedError<RevocationListStale>()("RevocationListStale", {
  revision: Schema.Number, held: Schema.Number, from: Schema.String    // "peer:<id>"
}) {}
```

```
REQUIREMENT: `FederationOptions.revocation` MUST be wired; without it
             `Federation.plugin` MUST fail to build with `InvalidDefinition
             { reason: "no-revocation-source" }`. An application with no
             revocation channel wires the loader's explicit
             `RevocationSource.constant` (loader BEH-LD-026), which rejects
             every offer, so that a kill path that cannot act is a written
             decision and every refused kill frame is reported, never
             silently dropped.
```

```
REQUIREMENT: A revocation list MUST reach the host on a channel that does
             not depend on a manifest: (a) the loader's `RevocationSource`,
             which the application fills from the authority or any other
             feed and which verifies, orders and persists lists (loader
             BEH-LD-026); and (b) a `kill` control frame on any federation
             link (03, BEH-FD-018). The plugin MUST follow
             `RevocationSource.changes`, and MUST hand every list received
             in a kill frame to `RevocationSource.offer(list, "peer:" +
             peer)`, unchanged and before decoding anything in it.
```

```
REQUIREMENT: The plugin MUST read the `OfferOutcome`: `Accepted` — the list
             reaches the kill path through `changes` (BEH-FD-042) and is
             relayed (BEH-FD-043); `NotNewer` — report `revocation-stale`
             with `RevocationListStale { revision, held, from }` and do not
             relay; `Rejected` — report `revocation-rejected` with its
             reason and do not relay. A `RevocationStoreFailed` MUST be
             reported and the list offered again when it is next received;
             it MUST NOT be acted on, because an unsaved list is not
             published (loader BEH-LD-026).
```

```
REQUIREMENT: The plugin MUST accept a `kill` frame on any link whose peer
             passed the listing check of BEH-FD-017, in every state that
             has links — `following`, `rebootstrapping`,
             `rebootstrap-blocked`, `resync-required`, fresh, stale or
             `offline-capped` — including on a link it holds suspended for
             a re-bootstrap (BEH-FD-014) and on a link it is about to refuse
             as `incompatible`, before sending the refusal. Documentation
             MUST state that an `unprovisioned` host has no links and
             receives lists only through the `RevocationSource`, and that a
             host receives kill frames only from peers the applied
             manifest's topology links it to.
```

**Settled here.** (1) The list is the loader's, signed by the issuer and
verified by the revocation source under its own trust root, so a list
relayed by a peer is worth exactly what it is worth from the authority: the
peer is a courier, not a signer. (2) One store and one verifier: `offer` is
the loader's one entry point for lists, so a host has one newest list
whatever channel brought it, and a replayed older list is refused by
revision — provided the `RevocationStore` itself is not rolled back, which
is the consumer's control (loader BEH-LD-026) and which a re-bootstrap must
not do (BEH-FD-014). (3) `offer` breaks the dependency cycle a feed would
create: the plugin depends on the source and calls it, and the source does
not depend on the plugin. (4) `RevocationListStale` names a list that is
not newer than the one held; it is distinct from the loader's
`RevocationStale`, which refuses a load when the held list is older than its
`maxAge`.

## BEH-FD-042: A revocation list is applied at once, before re-bootstrap and before any manifest

> **Invariant:** [INV-FD-010](../invariants.md#inv-fd-010-a-kill-never-waits-on-a-manifest-apply-the-offline-cap-or-a-re-bootstrap), [INV-FD-003](../invariants.md#inv-fd-003-a-killed-plugin-is-never-in-a-desired-list)
> **See:** [ADR-FD-009](../decisions/009-revocation-travels-apart-from-desired-state.md), [ADR-BR-053](../../core/decisions/053-refusal-list.md)
> **Depends on:** core [28 — Plugin principal and mandatory policy](../../core/behaviors/28-plugin-principal-and-mandatory-policy.md) (`RefusalList`, BEH-BR-267); loader `Revocation.filterDesired` and the blast-radius guard (BEH-LD-028, BEH-LD-032)
> **Satisfies:** [URS-BR-053](../../core/urs.md#urs-br-053-keep-a-revoked-plugin-version-from-running-again-whatever-starts-it), [URS-BR-021](../../core/urs.md#urs-br-021-know-who-changed-the-plugin-set-when-and-why)
> **Regulatory:** supports 21 CFR 11.10(e) (through core attribution and audit)

```ts
// illustrative — not type-checked
// FederationOptions.maxDisabledPerRevision?: number        — blast-radius guard, semantics of loader BEH-LD-032; no default
// Federation.releaseRevocation(revision, context): Effect<void, Unattributed | ReasonRequired>
```

```
REQUIREMENT: Each time `RevocationSource.changes` yields a set with a
             greater revision, the plugin MUST, without waiting for a sync,
             a manifest or a re-bootstrap: for every plugin owned by the
             federation scope that is not `disabled` and whose `meta.digest`
             the set revokes by digest, or that the loader reports revoked
             by signer or statement digest (loader BEH-LD-028, BEH-LD-030),
             call `host.disable(ref, { context })` with `context.actor` the
             `revocationActor`, `context.reason` naming the set's revision
             and the digest, and `context.correlationId` derived from
             (authority, host, set revision). Each refusal or transient
             failure MUST be reported as `kill-pending` and retried at every
             sync and at each new set, as BEH-FD-008 retries transient
             rejections. The plugin MUST NOT evaluate signature policies
             itself.
```

```
REQUIREMENT: A set that revokes a running plugin outside the federation
             scope MUST NOT cause any host operation on it; each such
             plugin MUST be reported as `kill-unowned { id, realm, reason }`,
             as for a manifest kill entry (BEH-FD-007).
```

```
REQUIREMENT: When `maxDisabledPerRevision` is given and one set revision
             would disable more owned plugins than it allows, the plugin
             MUST disable none of them for that revision, MUST report each
             as `kill-held` with the revision, and MUST act on them only
             after `Federation.releaseRevocation(revision, context)`, an
             attributed call made through the application's own access
             rules. While a revision is held, every apply (BEH-FD-007,
             BEH-FD-048) MUST use the newest released set, so that the
             next apply does not remove what the guard holds back.
             Documentation MUST recommend a threshold trust root for
             revocation lists together with this guard (loader BEH-LD-032).
```

```
REQUIREMENT: The plugin MUST be the only component that reconciles,
             removes or disables plugins of the scope `federation:` +
             authority in response to revocation. Documentation MUST state
             that the loader's `KillSwitch.run` MUST NOT be given that scope
             (loader BEH-LD-029), and that every desired list this plugin
             hands to `reconcile` passes through the loader's
             `Revocation.filterDesired` with the newest released set, which
             gives the scope the kill switch's filtering without a second
             reconciler.
```

```
REQUIREMENT: Documentation MUST state that the deployment's `RefusalList`
             (core BEH-BR-267) must refuse every digest of the newest
             accepted set — the loader derives one from the same
             `RevocationSource` (loader BEH-LD-056) — so that a disabled
             plugin is not started again by an operator `enable`, a later
             reconcile, a dependency returning or a lazy trigger. Without a
             wired `RefusalList`, a disabled plugin stays disabled only
             until something enables it, and the next apply removes it
             (BEH-FD-007).
```

```
REQUIREMENT: The newest released set MUST be applied before step 1 of
             every re-bootstrap (BEH-FD-014) and before every manifest
             apply; a set and a manifest received in one sync MUST be
             applied set first.
```

```
REQUIREMENT: While a re-bootstrap is required but has not completed — the
             persisted marker of BEH-FD-048 is present — and a newer
             verified manifest has been received, the plugin MUST run a
             kill-only apply: one `reconcile` of the last applied manifest
             (kept in the `ManifestStore`, BEH-FD-048) minus the pending
             kills (by digest, or by id and realm), with `context.actor` the
             federation actor and `context.reason` naming the newer
             revision's kills. It MUST NOT record that revision as applied,
             MUST NOT apply any other change of it, and MUST report
             `kill-only-apply`. The kill entries stay subtracted from every
             later apply until a full apply of a revision at least as high
             succeeds (BEH-FD-048).
```

**Settled here.** (1) `disable`, not `remove`: it acts at once through one
attributed, gated core call per plugin, drains leases first, keeps the
configuration for the investigation, and needs no desired list, so it
cannot carry along changes nobody reviewed. Removal follows at the next
apply. (2) The `RefusalList` closes the gap a `disable` leaves: core
consults it on every start, system starts included, so a revoked digest
stays down whatever tries to start it. (3) The guard is the loader's,
restated here because this plugin is the actuator of its scope and the
kill switch is excluded from it: without a cap, one compromised revocation
key and an auto-allowing gate could disable every plugin of the scope at
once. (4) The kill-only apply closes the id-based half of X10, and the
persisted pending kills keep it closed across the re-applies that would
otherwise bring the plugin back: freshness changes, retries, clock-skew
handling and boot all reconcile the last applied manifest.

## BEH-FD-043: Revocation lists are relayed on links

> **Invariant:** [INV-FD-010](../invariants.md#inv-fd-010-a-kill-never-waits-on-a-manifest-apply-the-offline-cap-or-a-re-bootstrap)
> **See:** [ADR-FD-009](../decisions/009-revocation-travels-apart-from-desired-state.md)

```
REQUIREMENT: On every new link, each end MUST send its newest accepted list
             in a `kill` frame as the first `ControlFrame` on the "control"
             endpoint, before its offer, so that a peer which refuses and
             closes on the offer has already received it. Each time a list
             with a greater revision is accepted, the plugin MUST send it in
             a `kill` frame on every link that is up or suspended, except
             the link it came from.
```

```
REQUIREMENT: A list MUST be relayed only once per link and revision, and
             only after `offer` answered `Accepted` or `changes` yielded it;
             a refused or stale list MUST NOT be relayed.
```

**Settled here.** A terminal that cannot reach the authority but reaches its
shop hub gets the newest list as the first frame of every reconnection,
before any offer or manifest — so the kill arrives along whatever path the
topology provides. Relaying only newer accepted lists bounds the traffic:
each list crosses each link at most once, and the revision rule stops loops.

## BEH-FD-044: Re-bootstrap steps are observable and testable

<a id="beh-fd-044-re-bootstrap-pushes-or-keeps-the-outbox-before-it-touches-the-snapshot"></a>

> **Invariant:** [INV-FD-011](../invariants.md#inv-fd-011-a-re-bootstrap-never-replaces-state-while-local-facts-are-neither-pushed-nor-kept)
> **See:** [ADR-FD-007](../decisions/007-offline-cap-and-rebootstrap.md)
> **Depends on:** event delivery companion `DurableBus.rebootstrapOutbox` ([BEH-DB-048](../../durable-bus/behaviors/06-replay-and-snapshots.md#beh-db-048-before-a-snapshot-the-outbox-is-pushed-or-kept))

```
REQUIREMENT: The steps of BEH-FD-014 MUST be observable as
             `rebootstrap-outbox` (with `pushed` and `kept`),
             `rebootstrap-suspended`, `rebootstrap-fetched`,
             `rebootstrap-installed`, `rebootstrap-applied` and
             `rebootstrap-resumed` events, in that order, or
             `rebootstrap-blocked` and `rebootstrap-failed` with the step
             that failed, and `rebootstrap-revision-mismatch` when the
             installed snapshot's revision differs from the applied
             manifest's, so that an operator can see where a host stopped.
```

```
REQUIREMENT: `TestFederation` MUST let a test script `settle` to push,
             keep, block and time out, and `install` to fail and to crash
             the host, and MUST assert that no `fetch` or `install` is
             called after a blocked step 1, that links are not suspended
             during step 1, that `install` is called only through the
             settlement, and that a restart after a crash in step 3 resumes
             with links suspended (BEH-FD-048).
```

**Settled here.** The order itself is BEH-FD-014's; this behaviour makes it
visible and testable, which is what turns "left to the application" into a
rule an implementation can be held to.

## BEH-FD-045: Imports and exports are refused on a route that does not offer their residency label

> **Invariant:** [INV-FD-012](../invariants.md#inv-fd-012-no-import-or-export-runs-over-a-route-that-does-not-offer-its-residency-label)
> **See:** [ADR-RM-010](../../remote/decisions/010-placement-labels-compared-at-the-boundary.md)
> **Depends on:** remote companion `PlacementPolicy`, `Placement.Residency` ([BEH-RM-068](../../remote/behaviors/09-placement-budgets-and-adapters.md#beh-rm-068-transports-and-routes-declare-the-residency-labels-they-offer), [BEH-RM-069](../../remote/behaviors/09-placement-budgets-and-adapters.md#beh-rm-069-the-residency-label-travels-as-a-wire-annotation-and-is-checked-by-the-serving-end))
> **Satisfies:** [URS-BR-026](../../core/urs.md#urs-br-026-know-which-compliance-obligations-remain-mine)

```
REQUIREMENT: A route's offered labels MUST be the `residency` of its
             `ManifestPeer`, or, absent that, the `residency` of the
             transport profile of the link's connection; with neither, the
             route offers none. The plugin MUST evaluate the
             `PlacementPolicy` (default `PlacementPolicy.exact`):
             - for each import with a `residency`, with `subject.kind`
               "import", against the route to its `from` peer; a refusal
               MUST list the import in `LinkAgreement.refused` with reason
               "placement-refused", so its endpoint never opens and its
               dependents wait (BEH-FD-020);
             - for each export with a `residency`, with `subject.kind`
               "export", against the route to each peer it is offered to; a
               refusal MUST leave the export out of that peer's offer and
               refuse its calls at the boundary with "placement-refused".
             Each refusal MUST be reported as `placement-refused` with the
             error `PlacementRefused` of the remote companion.
```

```
REQUIREMENT: The endpoint transport of each import, taken from the link's
             multiplexer, MUST be opened with the route's offered labels
             (`Multiplexed.endpoint(name, { residency })`, remote
             BEH-RM-056), so that the import proxy's own placement check
             (remote BEH-RM-068) compares against the labels this package
             compared, and a route that federation accepts is not refused
             again by the proxy's build.
```

```
REQUIREMENT: Import proxies MUST be defined with `RemoteOptions.residency`
             set to the import's `residency`, so that every call carries the
             `placement/residency` annotation and the exporting end checks
             it again (BEH-RM-069).
```

```
REQUIREMENT: The projection (BEH-FD-005) MUST evaluate the policy for a
             `ManifestPlugin` whose manifest declares a `residency`, with
             `subject.kind` "route" and the labels `FederationOptions`
             declares for this host (`hostResidency`, default none); a
             refusal MUST drop the entry with reason "placement-refused".
```

**Settled here.** The labels are the authority's and the operator's
statements; this package compares them with the remote companion's policy,
so a host and a link refuse on the same rule. Core only carries the label
([ADR-BR-041](../../core/decisions/041-manifest-as-data.md)).

## BEH-FD-046: One skew model for every version axis

> **Invariant:** [INV-FD-006](../invariants.md#inv-fd-006-a-link-uses-only-versions-both-ends-support)
> **See:** [ADR-FD-006](../decisions/006-n-minus-one-skew-window.md), [ADR-DB-009](../../durable-bus/decisions/009-writers-last-for-offline-readers.md)

| Axis | Who declares it | N/N−1 rule applied | Where |
| --- | --- | --- | --- |
| Federation protocol | each host, `protocol` range and `protocolWindow` | highest common version within each end's window; empty → `IncompatiblePeer` | [BEH-FD-019](./03-links-and-skew-handshake.md#beh-fd-019-the-federation-protocol-version-highest-common-inside-the-window) |
| Remote wire version | the remote package, `Frame.wire` | negotiated per session: `hello` lists N and N−1, `welcome` picks the highest common | [BEH-RM-009](../../remote/behaviors/02-sessions-and-epochs.md#beh-rm-009-the-handshake-fixes-wire-contract-version-and-grants) |
| Contract major | the contract (`ServiceId`), `contractWindow` | an import names one major; majors older than highest − window are dropped | [BEH-FD-020](./03-links-and-skew-handshake.md#beh-fd-020-each-import-names-one-major-and-the-offer-accepts-or-refuses-it) |
| Contract minor | the provision's `version` V | a peer at v ≥ V within the major is accepted; add-only evolution (core 26) | BEH-FD-020, core BEH-BR-232 |
| Event version | `DurableEvent.version`, `publishVersion` | readers read N and N−1; writers write N only after every reader in scope reads it (writers last) | [BEH-DB-031](../../durable-bus/behaviors/04-versions-and-upcasters.md#beh-db-031-one-skew-rule-for-events-writers-last-where-readers-cannot-go-first) |
| Upcaster chain | `DurableEvent.minVersion` | kept until the oldest version received from every origin is ≥ the new minimum | [BEH-DB-029](../../durable-bus/behaviors/04-versions-and-upcasters.md#beh-db-029-upcasters-are-kept-for-as-long-as-old-envelopes-can-arrive), BEH-DB-032 |
| Manifest and envelope formats | `format` literals | a new format only for changes older readers must not ignore; unknown fields ignored | BEH-FD-001, BEH-DB-002 |

```
REQUIREMENT: Every version axis above MUST follow one rule: a release N
             MUST read everything release N−1 writes on that axis, and MUST
             NOT start writing anything release N−1 cannot read until every
             reader in scope runs release N or later. Reading versions older
             than N−1 is not required; an axis that supports them (event
             upcasters down to `minVersion`, durable-bus BEH-DB-031) MAY.
             A version an axis cannot read MUST be refused on the link axes
             (protocol, wire, contract) and parked or halted on the event
             axis (durable-bus BEH-DB-026) — never dropped and never guessed
             at.
```

```
REQUIREMENT: For a fleet with hosts that can be offline when a release
             reaches the authority, the rollout MUST be writers last:
             (1) the release that teaches readers a new version is
             delivered to every host first; (2) writers keep writing the
             previous version until every host in scope has reported, in
             its version reports of kind "reader" (BEH-FD-047), that every
             reader on it reads N — an applied manifest revision is not
             such evidence, since a revision is recorded as applied even
             when entries were rejected or are pending (BEH-FD-008); (3) only
             then does the authority switch writers, by a manifest change
             (for events, `publishVersion`; for contracts, a new import
             major; for the protocol, a raised `protocol` minimum).
```

```
REQUIREMENT: Documentation MUST state that the authority MAY exclude from
             "in scope" a host whose last contact is older than its offline
             cap (BEH-FD-013): such a host must re-bootstrap before it
             follows again, and it receives the reader release with that
             re-bootstrap's manifest before it reads downstream history.
             Without this, one lost or decommissioned host would hold every
             writer back for ever.
```

**Settled here.** Readers-first (BEH-DB-028 as first written) assumes every
reader can be upgraded before a writer moves; a terminal offline for three
days cannot, and the authority writes downstream in the meantime. Writers
last keeps the writer on the old version until the fleet has said, through
reports this package already collects, that it can read the new one. The
switch is desired state, so it is signed, revisioned and attributed like
every other change, and a rollback is a new revision.

## BEH-FD-047: The oldest version received per origin is reported to the authority

> **Invariant:** [INV-FD-009](../invariants.md#inv-fd-009-staleness-and-the-offline-cap-are-never-silent)
> **See:** [ADR-DB-009](../../durable-bus/decisions/009-writers-last-for-offline-readers.md)
> **Depends on:** event delivery companion metric ([BEH-DB-032](../../durable-bus/behaviors/04-versions-and-upcasters.md#beh-db-032-the-oldest-version-received-per-origin-is-measured))

```ts
// illustrative — not type-checked
interface OldestVersionReport {
  readonly axis: "event" | "contract" | "protocol" | "wire"
  readonly kind: "received" | "reader" // received: versions that arrived; reader: the version this host's readers read
  readonly subject: string             // event type, contract name, "federation" or "remote"
  readonly origin?: string             // kind "received": the origin or peer the version was received from
  readonly oldest: number | string     // lowest version received since `since`, or the lowest version read
  readonly newest: number | string
  readonly since: string               // Clock, ISO 8601
}
// Context.Service "@bridger/federation/VersionReports" — optional; the event delivery companion provides one
```

```
REQUIREMENT: When a `VersionReports` source is wired, the plugin MUST
             include its current reports in `Federation.Status.oldestVersions`
             and send them to the `StatusReporter` with each apply outcome
             and at least once per `syncEvery` while contact lasts, so that
             the readers' versions of every host reach the authority. The
             plugin MUST add its own reports for the protocol agreed on
             each link and for each import's agreed contract version.
```

```
REQUIREMENT: Reports MUST carry identifiers, versions and times only —
             never payloads, configuration values or annotation values.
```

**Settled here.** The authority decides when the fleet is ready to move a
writer (BEH-FD-046) and when an upcaster may go (BEH-DB-029); this report is
the evidence it decides on. Reports of kind "reader" say what each host's
readers can read, which is what the writers-last switch needs; reports of
kind "received" say what still arrives, which is what dropping an upcaster
needs — they catch what deployment records miss: an origin still holding an
unsent backlog at an old version.

## BEH-FD-048: Pending kills, the last applied manifest and the re-bootstrap marker are kept in the store

> **Invariant:** [INV-FD-003](../invariants.md#inv-fd-003-a-killed-plugin-is-never-in-a-desired-list), [INV-FD-011](../invariants.md#inv-fd-011-a-re-bootstrap-never-replaces-state-while-local-facts-are-neither-pushed-nor-kept)
> **See:** [ADR-FD-007](../decisions/007-offline-cap-and-rebootstrap.md), [ADR-FD-009](../decisions/009-revocation-travels-apart-from-desired-state.md)

```ts
// illustrative — not type-checked; ManifestStore members added to 02 (BEH-FD-009)
interface PendingKill { readonly revision: number; readonly kill: readonly KillEntry[] }
interface RebootstrapMarker {
  readonly reason: "resync-required" | "offline-capped"
  readonly step: "required" | "settled" | "fetched" | "installing" | "installed"
  readonly startedAt: string                      // Clock
  readonly installedRevision?: number             // set with step "installed"
}
// ManifestStore:
//   lastApplied → Option<{ manifest: SignedManifest; revision: number; at: string }>   (the bytes, not only the number)
//   pendingKills / putPendingKills(readonly PendingKill[])
//   rebootstrap / putRebootstrap(Option<RebootstrapMarker>)
```

```
REQUIREMENT: The `ManifestStore` MUST keep the last applied manifest's
             signed bytes (`putLastApplied(manifest, revision, at)`),
             separately from the highest verified manifest. Every apply
             that is not a full apply of a newer revision — a freshness
             re-apply (BEH-FD-012), a retry (BEH-FD-008), a clock-skew
             re-apply (BEH-FD-016), a kill-only apply (BEH-FD-042) and the
             boot apply while a re-bootstrap is pending (BEH-FD-010) — MUST
             reconcile that manifest, verified again (BEH-FD-002).
```

```
REQUIREMENT: When a verified manifest newer than the last applied one is
             stored as highest but not applied in full, its kill entries
             MUST be added to `pendingKills` in the same store write, before
             any kill-only apply. Every desired list handed to `reconcile`
             MUST have every entry matching a pending kill removed, after
             the overlay and with the manifest's own kill entries
             (BEH-FD-007). A pending kill MUST be cleared only when a full
             apply of a revision at least as high as its own has returned a
             report.
```

```
REQUIREMENT: Before the first step of a re-bootstrap (BEH-FD-014), and at
             the first successful contact after the offline cap that
             requires one (BEH-FD-013) — before a newer manifest is stored
             as highest — the plugin MUST store a `RebootstrapMarker` with
             step "required". It MUST store each later step before acting
             on it ("installing" before calling the install, "installed"
             with the installed revision after it returned) and MUST clear
             the marker only after links resumed (step 4).
```

```
REQUIREMENT: At activation, a stored marker MUST put the plugin in
             `rebootstrapping`: the boot apply MUST use the last applied
             manifest minus the pending kills, never the highest; a marker
             at "installing" or "installed" MUST keep every link suspended
             from the start (03, BEH-FD-017), and the re-bootstrap MUST
             resume — from step 1 for "installing", from step 3b for
             "installed" — before the first sync.
```

**Settled here.** Every path that re-applies the last applied manifest —
freshness changes, retries of transient rejections, clock-skew handling,
boot — would otherwise reinstall a plugin that a kill-only apply removed,
because that manifest still lists it; and a restart would otherwise apply
the highest manifest in full, skipping the re-bootstrap it must wait for.
Keeping the bytes, the pending kills and the marker in the one store the
plugin already writes makes these decisions survive a crash. A marker past
"installing" means local state may be half replaced, so links stay closed
until the install has run again to completion.

---

_Previous: [05 — Testing and acceptance](./05-testing-and-acceptance.md)_
