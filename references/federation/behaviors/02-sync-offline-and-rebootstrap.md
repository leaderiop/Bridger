# 02 — Sync, offline and re-bootstrap

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-FD-BEH-02                                            |
> | Revision       | 0.8                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.8 (2026-11-10): Specification audit of 2026-11-10 (SPEC-AUDIT-04) — BEH-FD-014: `FederationOptions.deliveryImports`; an attempt that starts with links suspended reopens only those imports in step 1, so the outbox can be pushed over a peer link, and step 2 closes them again (F2); "links stay up" in steps 0 and 1 and the step-1 failure rule limited to a first attempt, and `suspended` shown through the retries (F3) (CCR-FD-007)<br>0.7 (2026-11-10): Specification audit of 2026-11-10 (SPEC-AUDIT-03) — BEH-FD-014: a step-1 failure on a retry after a failed step 3a keeps links suspended, only a first attempt has none suspended (M18); step 3a runs the install under the federation actor, recorded on its `GapRecord`s with reason "rebootstrap:" + `replaces` (Low); the event delivery companion's `follow` is paused from step 1 to the end of step 3a and backs off over suspended links until step 4 (Low, seen not assessed) (CCR-FD-006)<br>0.6 (2026-11-10): Specification audit of 2026-11-09, round 2 — BEH-FD-014: `OutboxSettlement.install` restated with the event delivery companion's error union and `InstallContext` (its `StoreTransaction`); what step 3a does for each error (P1); the outcome of a call cut by a link suspension follows the remote companion's frame-state rule (CCR-FD-005)<br>0.5 (2026-11-09): BEH-FD-009 `contracts` rejects a local contract at compile time, and one passed untyped fails the plugin's build with the remote companion's `LocalContractRefused` before the store is read (core CCR-BR-033) (CCR-FD-004)<br>0.4 (2026-11-08): Round-2 agent review (R4 F1–F3, F6, F8–F12) — `revocation` required, `maxDisabledPerRevision`, `rebootstrapRetryMax`; `ManifestStore` keeps the last applied manifest's bytes, pending kills and the re-bootstrap marker; boot and freshness re-applies use the last applied manifest minus pending kills; re-bootstrap re-ordered — settle with links up, suspend only for fetch and install (control endpoint kept for kills), install only through `OutboxSettlement.install` (guarded, `replaces` declared), install revision mismatch defined, per-step retry points with their own backoff; install must not roll back the manifest, revocation or fence stores (CCR-FD-003)<br>0.3 (2026-11-08): round 2: recheck items 18, 19 and 20 (X10) — a kill never waits on the cap or a re-bootstrap; re-bootstrap order fixed as outbox, snapshot fetch, projection replace, link resume, with `RebootstrapOutbox` and `RebootstrapBlocked`; `Rebootstrap` split into `fetch` and `install`; options and status for revocation, placement and atomic applies; heading of BEH-FD-014 changed (old anchor kept) (CCR-FD-003)<br>0.2 (2026-11-08): resolutions of the agent review of 2026-11-08 — the offline cap measured from a first-activation time kept in the store; re-bootstrap suspends links (imports and exports) instead of an undefined admission switch; transient retries at each sync; status gains `pending` and peer links (R3-19, R3-20, R3-25) (CCR-FD-002)<br>0.1 (2026-11-08): Initial draft (CCR-FD-001)                 |

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
  readonly contracts: readonly Contract.Any[]          // contracts this host can import or export, by name and major (BEH-FD-020);
                                                       // typed to reject a local contract (core Contract.local), see below
  readonly dialer?: Context.Key<any, LinkDialer>       // required when the manifest names imports
  readonly listener?: Context.Key<any, LinkListener>   // required when the manifest names exports
  readonly reporter?: Context.Key<any, StatusReporter>
  readonly rebootstrap?: Context.Key<any, Rebootstrap>
  readonly outbox?: Context.Key<any, RebootstrapOutbox>  // step 1 of a re-bootstrap (BEH-FD-014, BEH-FD-044)
  readonly deliveryImports?: readonly string[]          // serviceIds of imports that carry the outbox's delivery; default none (BEH-FD-014)
  readonly revocation: Context.Key<any, RevocationSource>    // the loader's; required — RevocationSource.constant when none (BEH-FD-041)
  readonly maxDisabledPerRevision?: number              // blast-radius guard of the kill path, no default (BEH-FD-042)
  readonly revocationActor?: Actor                      // kind "service"; default { kind: "service", id: "federation-revocation:" + authority }
  readonly placement?: Context.Key<any, PlacementPolicy> // remote companion's; default PlacementPolicy.exact (BEH-FD-045)
  readonly atomic?: boolean                             // ReconcileOptions.atomic for applies, default false (BEH-FD-008)
  readonly hostResidency?: readonly string[]            // labels this host offers to plugins it installs (BEH-FD-045)
  readonly rebootstrapOutboxTimeout?: Duration.Input    // default 2 minutes (BEH-FD-014)
  readonly rebootstrapRetryMax?: Duration.Input         // default 30 minutes; re-bootstrap retries back off apart from sync (BEH-FD-014)
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
  readonly lastApplied: Effect.Effect<Option.Option<{ manifest: SignedManifest; revision: number; at: string }>, StoreUnavailable>
  readonly putLastApplied: (manifest: SignedManifest, revision: number, at: string) => Effect.Effect<void, StoreUnavailable>
  readonly pendingKills: Effect.Effect<ReadonlyArray<PendingKill>, StoreUnavailable>                 // BEH-FD-048
  readonly putPendingKills: (kills: ReadonlyArray<PendingKill>) => Effect.Effect<void, StoreUnavailable>
  readonly rebootstrap: Effect.Effect<Option.Option<RebootstrapMarker>, StoreUnavailable>            // BEH-FD-048
  readonly putRebootstrap: (marker: Option.Option<RebootstrapMarker>) => Effect.Effect<void, StoreUnavailable>
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
REQUIREMENT: `FederationOptions.contracts` MUST be typed so that a local
             contract (`Contract.local`, core BEH-BR-225) is a compile
             error. A contract object in it whose `local` is true MUST make
             the plugin's build fail with the remote companion's
             `LocalContractRefused { serviceId, site:
             "federation-contracts" }` (remote BEH-RM-007) before the build
             reads the `ManifestStore`, so that `install` leaves the plugin
             `failed` with that tag and nothing is applied, imported or
             served. A local contract must not cross a host boundary (core
             BEH-BR-232), and every contract in `contracts` exists to cross
             one; a manifest entry can therefore never name a local
             contract: its (key, major) finds no contract and is dropped
             "unknown-contract" (03, BEH-FD-020).
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
terminal after every outage. A local contract in `contracts` is the
opposite case: a fault in the application's own code, the same on every
start, which no manifest can repair. Failing the build makes it visible at
`install` instead of as imports that never appear.

## BEH-FD-010: Boot applies the highest verified manifest, else the boot bundle

> **Invariant:** [INV-FD-001](../invariants.md#inv-fd-001-applied-manifest-revisions-never-decrease), [INV-FD-004](../invariants.md#inv-fd-004-a-host-always-has-a-defined-desired-state)
> **See:** [ADR-FD-007](../decisions/007-offline-cap-and-rebootstrap.md)
> **Satisfies:** [URS-BR-016](../../core/urs.md#urs-br-016-drive-the-plugin-set-from-a-declarative-list)

```
REQUIREMENT: At activation the plugin MUST read the highest verified manifest
             from the `ManifestStore`, verify it again (BEH-FD-002), and
             apply it (BEH-FD-008) in the background before the first sync
             — unless a re-bootstrap marker is stored, in which case it MUST
             apply the last applied manifest minus the pending kills, and
             resume the re-bootstrap as BEH-FD-048 states.
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
             Both re-applies MUST reconcile the last applied manifest minus
             the pending kills (BEH-FD-048) and MUST be attributed as in
             BEH-FD-008, with a reason naming the freshness change.
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
             applied — the marker of BEH-FD-048 stored before that newer
             manifest is stored as highest — unless the source answers that the host is current
             (`known` equals the authority's latest revision and the
             authority does not return `ResyncRequired`).
```

```
REQUIREMENT: Neither the cap nor a pending re-bootstrap MUST delay a kill:
             a revocation list received in any state is applied at once
             (BEH-FD-042), and the kill entries of a newer verified manifest
             are applied by a kill-only apply while the re-bootstrap it must
             wait for has not completed (BEH-FD-042).
```

The cap bounds how long a host may run on instructions nobody has confirmed:
how long a desired-state change may go unseen (a kill does not wait for it,
BEH-FD-042), how far its clock may drift unobserved,
and how much application data it may accumulate before a replay would be a
storm. Its value is the application's — a point-of-sale fleet may choose
the 72 hours payment networks commonly allow for offline transactions — and
the outbox bus companion should use the same bound for its replay horizon
([references/durable-bus/](../../durable-bus/README.md)).

## BEH-FD-014: A host too far behind re-bootstraps from a snapshot, outbox first

<a id="beh-fd-014-a-host-too-far-behind-re-bootstraps-from-a-snapshot"></a>

> **Invariant:** [INV-FD-004](../invariants.md#inv-fd-004-a-host-always-has-a-defined-desired-state), [INV-FD-011](../invariants.md#inv-fd-011-a-re-bootstrap-never-replaces-state-while-local-facts-are-neither-pushed-nor-kept)
> **See:** [ADR-FD-007](../decisions/007-offline-cap-and-rebootstrap.md)
> **Satisfies:** [URS-BR-016](../../core/urs.md#urs-br-016-drive-the-plugin-set-from-a-declarative-list)

```ts
// illustrative — not type-checked
interface Rebootstrap {
  // The application fetches a snapshot the authority serves (projections, caches, event-delivery
  // positions — for the event delivery companion, the inbox watermarks its HistorySource reads resume from).
  readonly fetch: (q: { readonly host: string; readonly since: string; readonly revision: number }) =>
    Effect.Effect<SnapshotHandle, RebootstrapFailed, Scope.Scope>
  // ... and replaces its local state with it, returning the manifest revision it matches. Called only through
  // OutboxSettlement.install (step 3a); `InstallContext` is what that settlement provides: the event delivery
  // companion's StoreTransaction, live when `replaces` is "in-store" and never usable when it is "whole-store"
  // (BEH-DB-048). It MUST be re-runnable over a partly installed state, and MUST NOT replace the ManifestStore,
  // the RevocationStore or the fence table.
  readonly install: (snapshot: SnapshotHandle) => Effect.Effect<{ readonly revision: number }, RebootstrapFailed, InstallContext>
  readonly replaces: "in-store" | "whole-store"   // no default: how install replaces local state (BEH-DB-048)
}
type SnapshotHandle = unknown          // opaque to this package

interface RebootstrapOutbox {          // step 1; the event delivery companion supplies one (BEH-DB-048)
  readonly settle: (q: { readonly timeout: Duration.Duration; readonly replaces: "in-store" | "whole-store" }) =>
    Effect.Effect<OutboxSettlement, RebootstrapBlocked, Scope.Scope>   // held until the install ends or fails
}
// The settlement, its errors and InstallContext are the event delivery companion's (BEH-DB-048), restated here.
type InstallContext = StoreTransaction                  // @bridger/durable-bus
interface OutboxSettlement {           // the guarded install path (BEH-DB-048)
  readonly pushed: number
  readonly kept: number
  readonly install: <A, E, R>(run: Effect.Effect<A, E, R>) =>
    Effect.Effect<A, E | SnapshotFailed | IncarnationUnavailable, Exclude<R, InstallContext>>
}
class RebootstrapBlocked extends Schema.TaggedError<RebootstrapBlocked>()("RebootstrapBlocked", {
  pending: Schema.Number, reason: Schema.String       // e.g. "outbox-unsettled", "outbox-unavailable", "no-outbox-port"
}) {}
```

```
REQUIREMENT: On `ResyncRequired`, or when BEH-FD-013 requires it, the plugin
             MUST act in this order, MUST NOT start a step before the
             previous one succeeded, and MUST persist each step in the
             re-bootstrap marker before acting on it (BEH-FD-048):
             (0) store the marker (step "required"), set the status
                 `rebootstrapping` and apply the newest released revocation
                 set (BEH-FD-042); on a first attempt links stay up;
             (1) push or keep the outbox: call `RebootstrapOutbox.settle`
                 with `rebootstrapOutboxTimeout` (default 2 minutes) and
                 the `Rebootstrap`'s `replaces`, in a scope held until step
                 3a ends; on a first attempt links stay up, since pushing
                 needs no suspension; on an attempt that starts with links
                 suspended (a retry after a failed step 3a, or a restart that
                 resumes with links suspended, BEH-FD-048), the plugin MUST
                 first reopen the endpoints of the imports named in
                 `FederationOptions.deliveryImports`, with an offer exchange
                 on their links as in step 4, and nothing else — no other
                 import and no export — so that the outbox can be pushed;
             (2) suspend every link — close every "import:" endpoint (the
                 ones step 1 reopened included), stop
                 serving exports and stop opening new imports — keeping each
                 link's "control" endpoint open for `kill` frames only
                 (06, BEH-FD-041), then fetch the snapshot with
                 `Rebootstrap.fetch`;
             (3a) install: call `Rebootstrap.install` only through
                 `OutboxSettlement.install`, so that the guarded path of the
                 event delivery companion (outbox comparison in one
                 transaction, or frozen outbox and a raised incarnation)
                 covers it, with `CurrentActor` set to the federation actor
                 `{ kind: "service", id: "federation:" + authority }`
                 (BEH-FD-008), which the event delivery companion records
                 on every `GapRecord` of the install, with reason
                 "rebootstrap:" + `replaces` (durable-bus BEH-DB-044);
                 record the returned revision in the marker
                 (step "installed");
             (3b) fetch and apply the latest manifest in full, which clears
                 pending kills up to its revision (BEH-FD-048); when its
                 revision differs from the installed revision, report
                 `rebootstrap-revision-mismatch { installed, applied }`
                 and apply it anyway — the install is never repeated
                 because of the difference;
             (4) resume links: open imports and serve exports again, with a
                 new offer exchange on each, and clear the marker.
```

```
REQUIREMENT: A failure of step 1 — `RebootstrapBlocked`, a timeout, a
             defect — MUST stop the re-bootstrap before step 2: no snapshot
             is fetched or installed and no local fact is dropped. On a
             first attempt no link was suspended, and links stay up; on a
             retry after a failed step 3a, links stay suspended, since
             local state may be half replaced. The plugin MUST report status
             `rebootstrap-blocked` with the pending count and reason, keep
             the applied manifest in force and keep applying kills
             (BEH-FD-042). On a retry, the imports step 1 reopened for
             delivery are closed again.
```

```
REQUIREMENT: A failure of step 3a MUST leave the applied manifest in force,
             keep links suspended, be reported as `rebootstrap-failed` with
             step "install", the error's tag and its `reason` when it has
             one, and be retried from step 1 by the rule below. For each
             error `OutboxSettlement.install` can return:
             - `RebootstrapFailed` (the application's `install`): local
               state may be half replaced; `install` runs again over it;
             - `SnapshotFailed` "outbox-touched" (in-store): the install
               transaction rolled back and local state is as before it;
             - `SnapshotFailed` "prepare-failed" (whole-store): a store-swap
               participant failed before the incarnation was raised;
               nothing was raised or replaced;
             - `IncarnationUnavailable` (whole-store): the incarnation
               could not be raised; nothing was replaced.
             A defect is handled as `RebootstrapFailed`. Whichever store the
             install left, the event delivery companion has already moved
             to the raised origin when the failure came after the raise
             (BEH-DB-048), so the retry pushes the outbox of that origin.
```

```
REQUIREMENT: Retries of a re-bootstrap MUST back off on their own schedule,
             not at every sync: from `syncEvery`, doubling up to
             `rebootstrapRetryMax` (default 30 minutes), with jitter from
             `Random`, reset when a re-bootstrap completes. A failure of
             step 1 or 2 retries from step 1; a failure of step 3a retries
             from step 1 with links kept suspended (local state may be half
             replaced, so `install` runs again over it), but for the
             delivery imports step 1 reopens; a failure of step
             3b retries step 3b only, with links kept suspended.
```

```
REQUIREMENT: When the application wires a `Rebootstrap` but no
             `RebootstrapOutbox`, step 1 MUST fail with `RebootstrapBlocked
             { reason: "no-outbox-port" }` unless `FederationOptions.outbox`
             is explicitly set to `RebootstrapOutbox.none` — a value whose
             `settle` returns `{ pushed: 0, kept: 0 }` and documents that the
             application holds no local facts, and whose settlement's
             `install` runs `run` and fails with nothing of its own,
             providing an `InstallContext` whose every use dies with a
             defect — so that skipping the outbox is a written decision.
```

```
REQUIREMENT: Suspending links MUST NOT be a host operation: the import
             proxies stay installed and `active`; their sessions end with
             their endpoints, so their session children are withdrawn and their
             dependents wait as on a partition (BEH-FD-021), audited by core
             as system transitions. Calls in flight when a link is closed
             fail with the remote companion's `SessionLost`, whose `outcome`
             the remote companion sets by its own rule: "not-executed" only
             when the call's frame was never handed to the transport,
             "unknown" otherwise (remote BEH-RM-020); calls served to peers
             are cut as on a link loss. Every link MUST show `suspended` in `Federation.Status`
             from step 2 until step 4, and through every retry of the same
             re-bootstrap that keeps links suspended, the delivery imports
             step 1 reopens included. The outbox's own delivery transport
             is not a federation link and is never suspended; a deployment
             that carries it over a peer link, through an import, pushes in
             step 1 of a first attempt, before any suspension, and MUST
             name that import in `FederationOptions.deliveryImports` so
             that step 1 of a retry can push too. Documentation MUST state
             that, without that option, such a deployment's retry after a
             failed step 3a stays blocked with "outbox-unsettled" under
             `require` "pushed".
```

```
REQUIREMENT: Without a wired `Rebootstrap`, `ResyncRequired` MUST be
             reported as status `resync-required` and the host MUST keep its
             applied manifest; newer manifests MUST still be applied, since
             desired state never needs replay (BEH-FD-001).
```

```
REQUIREMENT: A `RebootstrapFailed` from step 2 MUST leave the applied
             manifest in force and resume links; from step 3a or 3b it MUST
             leave the applied manifest in force and keep links suspended.
             Either MUST be reported and retried as the retry rule above
             states.
```

```
REQUIREMENT: Documentation MUST state that `Rebootstrap.install` MUST NOT
             replace or roll back the `ManifestStore`, the loader's
             `RevocationStore` or the fence table: doing so is exactly the
             store rollback that defeats revision monotonicity (BEH-FD-004)
             and revocation monotonicity, whose protection the loader leaves
             to the consumer (loader BEH-LD-026).
```

```
REQUIREMENT: The package MUST NOT define the snapshot's content, transfer or
             storage.
```

**Settled here.** (1) Manifests are full documents, so desired state never
needs replay; what needs a snapshot is the application's data — catalogues,
projections, the cursors of the outbox bus companion — which after a long
absence is cheaper to replace than to replay
([ADR-FD-007](../decisions/007-offline-cap-and-rebootstrap.md)).
(2) Outbox first: a terminal that ran offline for days holds facts — sales,
movements — that exist nowhere else. Installing a snapshot first could
replace the store that holds them, or make the authority's next snapshot
miss them. Pushing them before fetching the snapshot means the snapshot can
already include them; keeping them where the install cannot reach is the
fallback when the push cannot finish. Failing closed, with links resumed
and kills still applied, keeps the host running on its last state rather
than trading facts for freshness. (3) Fetch and install are separate steps
so that a failed fetch leaves local state untouched and links can resume.
Suspending links only for fetch and install avoids remote calls, in either
direction, against state being replaced without tearing down every link at
each attempt to push a long backlog; the control endpoint stays open so a
kill still arrives. It needs no admission switch: from the proxies' point
of view it is a partition. (4) The install goes through the outbox port's
settlement, so that "kept" facts are protected by a check the bus runs
rather than by the application's choice of restore path, and a
whole-store swap gets a frozen outbox and a new origin incarnation
(durable-bus BEH-DB-004, BEH-DB-048).

For the event delivery companion, the positions a snapshot restores are the
inbox watermarks from which its pull port, `HistorySource`, resumes
([BEH-DB-047](../../durable-bus/behaviors/06-replay-and-snapshots.md#beh-db-047-historysource--the-pull-port-for-downstream-history)).
Its `follow` pulls are paused by the bus while the settlement of step 1 is
held, that is from step 1 to the end of step 3a, and resume from the
watermarks the install left. During step 3b, until links resume in step 4,
a `HistorySource` reached through a suspended link answers
`HistoryUnavailable` and `follow` backs off; one reached by another route is
not suspended. Between a failed step 3a and the retry's settlement,
`follow` may pull into a half-replaced store; the next install's watermarks
replace what it pulled, which is pulled again afterwards;
a source that no longer retains them answers `SnapshotRequired`, which is
where this re-bootstrap starts. Its `RebootstrapOutbox` is
`DurableBus.rebootstrapOutbox` ([BEH-DB-048](../../durable-bus/behaviors/06-replay-and-snapshots.md#beh-db-048-before-a-snapshot-the-outbox-is-pushed-or-kept)).

## BEH-FD-015: Federation.Status reports what the host follows

> **Invariant:** [INV-FD-009](../invariants.md#inv-fd-009-staleness-and-the-offline-cap-are-never-silent)
> **See:** [ADR-BR-007](../../core/decisions/007-observation-primitives.md)
> **Satisfies:** [URS-BR-004](../../core/urs.md#urs-br-004-know-why-a-plugin-is-not-running), [URS-BR-028](../../core/urs.md#urs-br-028-know-which-plugin-version-was-active-at-any-time)

```ts
// illustrative — not type-checked
interface FederationStatus {
  readonly state: "unprovisioned" | "following" | "rebootstrapping" | "rebootstrap-blocked" | "resync-required"
  readonly revocation?: { readonly revision: number; readonly issuedAt: string }   // newest accepted list (BEH-FD-041)
  readonly oldestVersions?: readonly OldestVersionReport[]                         // BEH-FD-047
  readonly freshness: "fresh" | "stale" | "offline-capped"
  readonly highestVerified?: number
  readonly lastApplied?: { readonly revision: number; readonly at: string }
  readonly pendingKills?: readonly { readonly revision: number; readonly count: number }[]   // BEH-FD-048
  readonly rebootstrap?: { readonly step: string; readonly startedAt: string }              // BEH-FD-048
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
             `rebootstrap-*` (including `rebootstrap-blocked` and
             `rebootstrap-revision-mismatch`), `kill-unowned`,
             `kill-pending`, `kill-held`, `revocation-applied`,
             `revocation-stale`, `revocation-rejected`, `kill-only-apply`,
             `apply-partial`,
             `placement-refused`, `realm-changed`, link and export
             events). The
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
