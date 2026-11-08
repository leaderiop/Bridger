# 02 — Sync, offline and re-bootstrap

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-FD-BEH-02                                            |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.2 (2026-11-08): resolutions of the agent review of 2026-11-08 — the offline cap measured from a first-activation time kept in the store; re-bootstrap suspends links (imports and exports) instead of an undefined admission switch; transient retries at each sync; status gains `pending` and peer links (R3-19, R3-20, R3-25) (CCR-FD-002)<br>0.1 (2026-11-08): Initial draft (CCR-FD-001)                 |

---

A federated host must start and keep running when the authority is out of
reach, must not drift without limit while it is, and must recover cleanly
when it comes back too far behind. This file specifies the federation
plugin, how it boots, how it syncs, the freshness of a manifest, the offline
cap, the snapshot re-bootstrap, the status it reports, and where its time
comes from. This file owns BEH-FD-009–016 and uses all eight.

Planned source: `packages/federation/src/Federation.ts`,
`packages/federation/src/Sync.ts` and `packages/federation/src/Freshness.ts`
*(Planned)*.

## BEH-FD-009: The federation plugin, and a build that never waits on the network

> **Invariant:** [INV-FD-008](../invariants.md#inv-fd-008-no-host-transition-waits-on-the-network)
> **See:** [ADR-FD-001](../decisions/001-federation-is-a-companion-over-reconcile.md)
> **Satisfies:** [URS-BR-016](../../core/urs.md#urs-br-016-drive-the-plugin-set-from-a-declarative-list)

```ts
// illustrative — not type-checked
interface FederationOptions {
  readonly id?: string                         // plugin id, default "@bridger/federation"
  readonly host: string
  readonly authority: string
  readonly signatures: Context.Key<any, SignaturePolicy>
  readonly source: Context.Key<any, ManifestSource>
  readonly store: Context.Key<any, ManifestStore>
  readonly resolver: Context.Key<any, PluginResolver>
  readonly contracts: readonly Contract.Any[]          // contracts this host can import or export, by name and major (BEH-FD-020)
  readonly dialer?: Context.Key<any, LinkDialer>       // required when the manifest names imports
  readonly listener?: Context.Key<any, LinkListener>   // required when the manifest names exports
  readonly reporter?: Context.Key<any, StatusReporter>
  readonly rebootstrap?: Context.Key<any, Rebootstrap>
  readonly boot?: SignedManifest                        // boot bundle (BEH-FD-010)
  readonly syncEvery?: Duration.Input                   // default 1 minute
  readonly syncTimeout?: Duration.Input                 // default 30 seconds
  readonly maxOffline?: Duration.Input | "forever"      // default 72 hours (BEH-FD-013)
  readonly skewTolerance?: Duration.Input               // default 5 minutes (BEH-FD-016)
}

interface ManifestSource {
  readonly latest: (q: { readonly host: string; readonly known: number }) =>
    Effect.Effect<Option.Option<SignedManifest> | ResyncRequired, ManifestUnavailable>
}

interface ManifestStore {
  readonly highest: Effect.Effect<Option.Option<SignedManifest>, StoreUnavailable>
  readonly putHighest: (m: SignedManifest, revision: number) => Effect.Effect<void, StoreUnavailable>
  readonly lastApplied: Effect.Effect<Option.Option<{ revision: number; at: string }>, StoreUnavailable>
  readonly putLastApplied: (revision: number, at: string) => Effect.Effect<void, StoreUnavailable>
  readonly lastContact: Effect.Effect<Option.Option<string>, StoreUnavailable>
  readonly putLastContact: (at: string) => Effect.Effect<void, StoreUnavailable>
  readonly firstActivation: Effect.Effect<Option.Option<string>, StoreUnavailable>   // BEH-FD-013
  readonly putFirstActivation: (at: string) => Effect.Effect<void, StoreUnavailable> // written once, never lowered or replaced
  readonly fences: Effect.Effect<ReadonlyArray<{ readonly key: string; readonly fence: ExportFence }>, StoreUnavailable>   // BEH-FD-029
  readonly putFence: (key: string, fence: ExportFence) => Effect.Effect<void, StoreUnavailable>
}

declare const Federation: {
  plugin(options: FederationOptions): PluginDefinition<"@bridger/federation", /* requires */ any, /* provides */ any, never>
}
```

```
REQUIREMENT: `Federation.plugin` MUST return an ordinary plugin definition
             that requires `Bridger.Host` and the ports named in its options,
             and provides `Federation.Status`. It MUST be installed by the
             application, outside the federation reconcile scope.
```

```
REQUIREMENT: The plugin's build MUST NOT call the `ManifestSource`, the
             `LinkDialer` or any other network port, and MUST NOT call
             `reconcile`. It MUST only read the `ManifestStore`, verify, and
             fork the boot apply (BEH-FD-010) and the sync loop
             (BEH-FD-011) with `Plugin.Runtime.background`.
```

```
REQUIREMENT: A failure of the background sync loop MUST NOT be reported as
             a runtime failure of the plugin. Unavailability of the source or
             the store MUST be reflected in `Federation.Status` and retried;
             only a defect of the plugin's own code MAY end it in `failed`.
```

**Settled here.** The build does local work only, so a terminal starts in the
time it takes to read one row, and a dead WAN never holds the host in
`starting`. This applies the rule of the review's §7 that a lifecycle step
never waits on a peer. Treating source outages as status rather than failure
keeps the plugin `active` — failure is sticky in core
([ADR-BR-005](../../core/decisions/005-failure-is-sticky.md)) and a sticky
failure for a routine outage would need an operator to `retry` every
terminal after every outage.

## BEH-FD-010: Boot applies the highest verified manifest, else the boot bundle

> **Invariant:** [INV-FD-001](../invariants.md#inv-fd-001-applied-manifest-revisions-never-decrease), [INV-FD-004](../invariants.md#inv-fd-004-a-host-always-has-a-defined-desired-state)
> **See:** [ADR-FD-007](../decisions/007-offline-cap-and-rebootstrap.md)
> **Satisfies:** [URS-BR-016](../../core/urs.md#urs-br-016-drive-the-plugin-set-from-a-declarative-list)

```
REQUIREMENT: At activation the plugin MUST read the highest verified manifest
             from the `ManifestStore`, verify it again (BEH-FD-002), and
             apply it (BEH-FD-008) in the background before the first sync.
```

```
REQUIREMENT: When the store holds no manifest, or holds one that fails
             verification, and `options.boot` is set, the boot bundle MUST be
             verified and treated as a received manifest (BEH-FD-004). Its
             revision is a floor: no manifest with a lower revision is
             accepted afterwards.
```

```
REQUIREMENT: When neither a valid stored manifest nor a boot bundle exists,
             the plugin MUST apply nothing, MUST report the status
             `unprovisioned`, and MUST wait for the first sync.
```

```
REQUIREMENT: A stored manifest that fails verification MUST be reported as a
             `store-invalid` event; it MUST NOT be deleted by this package.
```

**Settled here.** Not deleting an invalid stored copy keeps the evidence for
whoever investigates why it changed. A host that boots with nothing applied
still runs what the application installed directly; federation adds to that
set, it does not own it.

## BEH-FD-011: The sync loop

> **Invariant:** [INV-FD-008](../invariants.md#inv-fd-008-no-host-transition-waits-on-the-network)
> **See:** [ADR-FD-002](../decisions/002-authority-is-the-only-source-of-desired-state.md)
> **Satisfies:** [URS-BR-016](../../core/urs.md#urs-br-016-drive-the-plugin-set-from-a-declarative-list)

```
REQUIREMENT: Every `syncEvery`, and on each `Federation.sync` call, the
             plugin MUST call `ManifestSource.latest({ host, known })` where
             `known` is the highest verified revision, bounded by
             `syncTimeout`. A timeout MUST be `ManifestUnavailable`.
```

```
REQUIREMENT: A successful answer of any kind (a manifest, none newer, or
             `ResyncRequired`) MUST update `lastContact` to the current
             `Clock` time. A `ManifestUnavailable` MUST NOT.
```

```
REQUIREMENT: A received manifest MUST pass BEH-FD-002, BEH-FD-003 and
             BEH-FD-004 in that order and, when accepted, be applied
             (BEH-FD-008). `ResyncRequired` MUST start the re-bootstrap
             (BEH-FD-014).
```

```
REQUIREMENT: Consecutive `ManifestUnavailable` results MUST back off from
             `syncEvery` up to ten times `syncEvery`, with jitter drawn from
             Effect's `Random` service. A successful answer MUST reset the
             interval.
```

```
REQUIREMENT: `Federation.sync` MUST return the outcome of the attempt it
             triggered: `{ applied: revision } | { unchanged } |
             ManifestRejected | ManifestUnavailable | ResyncRequired`. Two
             concurrent calls MUST share one attempt.
```

Jitter keeps a fleet that lost the authority at the same moment from
reconnecting at the same moment. Drawing it from `Random` keeps the loop
reproducible under `TestFederation`, as core requires of its own randomness
([24 — Time, identifiers and sequence](../../core/behaviors/24-time-ids-and-sequence.md)).

## BEH-FD-012: Freshness, and plugins that require a fresh manifest

> **Invariant:** [INV-FD-009](../invariants.md#inv-fd-009-staleness-and-the-offline-cap-are-never-silent)
> **See:** [ADR-FD-007](../decisions/007-offline-cap-and-rebootstrap.md)
> **Satisfies:** [URS-BR-016](../../core/urs.md#urs-br-016-drive-the-plugin-set-from-a-declarative-list)

```
REQUIREMENT: The applied manifest MUST be `fresh` while the `Clock` reads
             before its `validUntil` (or always, when `validUntil` is
             absent) and the offline cap (BEH-FD-013) is not exceeded;
             otherwise `stale`.
```

```
REQUIREMENT: On the transition from `fresh` to `stale`, the plugin MUST
             re-apply the same revision with `fresh: false`, so that every
             entry marked `requiresFresh` is listed with `disabled: true`.
             On the transition back, it MUST re-apply with `fresh: true`.
             Both re-applies MUST be attributed as in BEH-FD-008, with a
             reason naming the freshness change.
```

```
REQUIREMENT: Staleness MUST NOT remove, replace or reconfigure any entry,
             and MUST NOT disable an entry not marked `requiresFresh`.
```

**Settled here.** A stale manifest keeps the host running what it ran; only
entries the authority marked as unsafe to run on old instructions stop. The
classic case is a plugin whose correctness depends on prices or rules the
authority refreshes: the authority, not this package, knows which plugins
those are. Disabling goes through core `disable`, so leases drain first.

## BEH-FD-013: The offline cap

> **Invariant:** [INV-FD-009](../invariants.md#inv-fd-009-staleness-and-the-offline-cap-are-never-silent)
> **See:** [ADR-FD-007](../decisions/007-offline-cap-and-rebootstrap.md)
> **Satisfies:** [URS-BR-016](../../core/urs.md#urs-br-016-drive-the-plugin-set-from-a-declarative-list)

```
REQUIREMENT: The host MUST be `offline-capped` when the `Clock` reads more
             than `maxOffline` after `lastContact`, or, when no contact was
             ever recorded, after `firstActivation`. At its first activation
             with no `firstActivation` stored, the plugin MUST store the
             current `Clock` time as `firstActivation` before the boot
             apply; it MUST NOT overwrite it afterwards, so that restarting
             a host that never reached the authority does not restart the
             cap. `maxOffline: "forever"` MUST be explicit; the default is
             72 hours.
```

```
REQUIREMENT: While `offline-capped`, the applied manifest MUST be `stale`
             (BEH-FD-012), the status MUST say so, and a `offline-capped`
             event MUST be published once on entry.
```

```
REQUIREMENT: The first successful contact after the cap was exceeded MUST
             require a re-bootstrap (BEH-FD-014) before any newer manifest is
             applied, unless the source answers that the host is current
             (`known` equals the authority's latest revision and the
             authority does not return `ResyncRequired`).
```

The cap bounds how long a host may run on instructions nobody has confirmed:
how long a kill entry may go unseen, how far its clock may drift unobserved,
and how much application data it may accumulate before a replay would be a
storm. Its value is the application's — a point-of-sale fleet may choose
the 72 hours payment networks commonly allow for offline transactions — and
the outbox bus companion should use the same bound for its replay horizon
([references/durable-bus/](../../durable-bus/README.md)).

## BEH-FD-014: A host too far behind re-bootstraps from a snapshot

> **Invariant:** [INV-FD-004](../invariants.md#inv-fd-004-a-host-always-has-a-defined-desired-state)
> **See:** [ADR-FD-007](../decisions/007-offline-cap-and-rebootstrap.md)
> **Satisfies:** [URS-BR-016](../../core/urs.md#urs-br-016-drive-the-plugin-set-from-a-declarative-list)

```ts
// illustrative — not type-checked
interface Rebootstrap {
  // The application restores its own state (projections, caches, event-delivery positions —
  // for the event delivery companion, the inbox watermarks its HistorySource reads resume from)
  // from a snapshot the authority serves, and returns the manifest revision it matches.
  readonly run: (q: { readonly host: string; readonly since: string; readonly revision: number }) =>
    Effect.Effect<{ readonly revision: number }, RebootstrapFailed>
}
```

```
REQUIREMENT: On `ResyncRequired`, or when BEH-FD-013 requires it, the plugin
             MUST: (1) set the status `rebootstrapping`; (2) suspend every
             link — close every outgoing and incoming link, stop accepting
             new ones and stop dialling — so that no remote call starts in
             either direction; (3) call `Rebootstrap.run`; (4) fetch and
             apply the latest manifest; (5) resume links: accept and dial
             again, with a new offer exchange on each. Steps run in that
             order.
```

```
REQUIREMENT: Suspending links MUST NOT be a host operation: the import
             proxies stay installed and `active`; their sessions end with
             the links, so their session children are withdrawn and their
             dependents wait as on a partition (BEH-FD-021), audited by core
             as system transitions. Calls in flight when a link is closed
             fail with the remote companion's `SessionLost` (`outcome:
             "unknown"`), and calls served to peers are cut as on a link
             loss. Every link MUST show `suspended` in `Federation.Status`
             while the re-bootstrap runs.
```

```
REQUIREMENT: Without a wired `Rebootstrap`, `ResyncRequired` MUST be
             reported as status `resync-required` and the host MUST keep its
             applied manifest; newer manifests MUST still be applied, since
             desired state never needs replay (BEH-FD-001).
```

```
REQUIREMENT: A `RebootstrapFailed` MUST leave the applied manifest in force,
             MUST keep links suspended, MUST be reported, and MUST be retried
             at the next sync.
```

```
REQUIREMENT: The package MUST NOT define the snapshot's content, transfer or
             storage.
```

**Settled here.** Manifests are full documents, so desired state never needs
replay; what needs a snapshot is the application's data — catalogues,
projections, the cursors of the outbox bus companion — which after a long absence is
cheaper to replace than to replay, and replaying it would load the authority
and every peer at once ([ADR-FD-007](../decisions/007-offline-cap-and-rebootstrap.md)).
Suspending links during the restore avoids remote calls, in either
direction, against state that is being replaced, and needs no admission
switch of its own: from the proxies' point of view it is a partition, which
already has a defined outcome everywhere.

For the event delivery companion, the positions a snapshot restores are the
inbox watermarks from which its pull port, `HistorySource`, resumes
([BEH-DB-047](../../durable-bus/behaviors/06-replay-and-snapshots.md#beh-db-047-historysource--the-pull-port-for-downstream-history));
a source that no longer retains them answers `SnapshotRequired`, which is
where this re-bootstrap starts.

**Open.** Whether facts recorded locally while offline (an outbox) must be
delivered before the snapshot is installed is a rule of the bus companion
(upstream facts are never truncated), not a federation one; the ordering of
the two is left to the application's `Rebootstrap`.

## BEH-FD-015: Federation.Status reports what the host follows

> **Invariant:** [INV-FD-009](../invariants.md#inv-fd-009-staleness-and-the-offline-cap-are-never-silent)
> **See:** [ADR-BR-007](../../core/decisions/007-observation-primitives.md)
> **Satisfies:** [URS-BR-004](../../core/urs.md#urs-br-004-know-why-a-plugin-is-not-running), [URS-BR-028](../../core/urs.md#urs-br-028-know-which-plugin-version-was-active-at-any-time)

```ts
// illustrative — not type-checked
interface FederationStatus {
  readonly state: "unprovisioned" | "following" | "rebootstrapping" | "resync-required"
  readonly freshness: "fresh" | "stale" | "offline-capped"
  readonly highestVerified?: number
  readonly lastApplied?: { readonly revision: number; readonly at: string }
  readonly lastContact?: string
  readonly dropped: readonly { readonly id: string; readonly reason: string }[]
  readonly rejected: ReconcileReport["rejected"]
  readonly pending: readonly { readonly id: string; readonly realm: string; readonly reason: string }[]   // retried at each sync (BEH-FD-008), kill-pending included
  readonly links: readonly PeerLinkStatus[]      // 03
  readonly conflicts: readonly ExportConflict[]  // 04
}
// Federation.Status: { current: Effect<FederationStatus>; changes: Stream<FederationEvent> }
```

```
REQUIREMENT: `Federation.Status` MUST expose the current status and a stream
             of events (`applied`, `rejected`, `manifest-equivocation`,
             `store-invalid`, `stale`, `fresh`, `offline-capped`,
             `rebootstrap-*`, `kill-unowned`, `kill-pending`, `realm-changed`,
             link and export events). The
             stream MUST be a sliding feed, like `Host.events`; it is not a
             record.
```

```
REQUIREMENT: When a `StatusReporter` is wired, each apply outcome MUST be
             reported to it in the background, best effort, with the
             revision, the dropped entries and the reconcile rejections by
             id and tag only — never configuration values.
```

The audit record of what changed is core's (23); this status is the
operational view of why. Reporting ids and tags only follows the core rule
that configuration values never leave the host through observation
([INV-BR-013](../../core/invariants.md#inv-br-013-configuration-values-are-never-observable)).

## BEH-FD-016: Time comes from Clock, and a clock that went backwards is stale

> **Invariant:** [INV-FD-009](../invariants.md#inv-fd-009-staleness-and-the-offline-cap-are-never-silent)
> **See:** [ADR-BR-025](../../core/decisions/025-deterministic-time-and-ids.md), [ADR-FD-007](../decisions/007-offline-cap-and-rebootstrap.md)
> **Satisfies:** [URS-BR-027](../../core/urs.md#urs-br-027-reproduce-time-and-identifiers-during-validation)

```
REQUIREMENT: Every time this package reads MUST come from Effect's `Clock`;
             every random draw from `Random`. Ambient time and randomness
             MUST NOT be used.
```

```
REQUIREMENT: When the `Clock` reads earlier than the applied manifest's
             `issuedAt` minus `skewTolerance`, or earlier than `lastContact`
             minus `skewTolerance`, the plugin MUST treat the manifest as
             `stale` and report a `clock-skew` event, until the clock reads
             consistently again.
```

```
REQUIREMENT: Freshness and the offline cap MUST NOT be computed from a
             peer's clock.
```

**Settled here.** A local clock set backwards would otherwise extend
`validUntil` and the offline cap at will; treating it as stale fails toward
the restricted state. A clock set *forwards* only makes the host stale
earlier. Clock accuracy itself stays the consumer's, as in core
([BEH-BR-216](../../core/behaviors/24-time-ids-and-sequence.md)).

---

_Previous: [01 — Host manifest](./01-host-manifest.md)_ · _Next: [03 — Links and the skew handshake](./03-links-and-skew-handshake.md)_
