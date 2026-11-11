# Overview

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-FD-OVW                                               |
> | Revision       | 0.11                                                         |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.11 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-07) — `RebootstrapOutbox.none` withdrawn for `outbox: "none"` (F4); `ManifestStore` keeps the acceptance time; `Manifest.toDesired` takes the placement policy and host labels (L3, PL6); `SignaturePolicyMissing` added (PL16); the example's `acceptedDigests` comment names the per-plugin source (PL7) (CCR-FD-010)<br>0.10 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-06) — the plugin uses the `outbox` port if present instead of requiring it, and the example wires `acceptedDigests` (H7, H9); errors table: `RebootstrapBlocked` names a hand-installed dependent and a missing outbox port, `DeliveryImportRefused` keeps only "not-an-import-id" (H8, PL11), `RevocationSourceMissing` added (PL12) (CCR-FD-009)<br>0.9 (2026-11-11): errors table gains `DeliveryImportRefused`; Specification audit of 2026-11-11 (SPEC-AUDIT-05) — errors table gains `RebootstrapFailed`, `ResolveFailed`, `DialFailed` and `ListenFailed` (PL11); `IncompatibleContract` by `"^" + V` (F4); `PeerLinkStatus` names `delivery-only` (H4) (CCR-FD-008)<br>0.8 (2026-11-10): Specification audit of 2026-11-10 (SPEC-AUDIT-04) — `LinkConnection` and the profile on dialled and accepted connections in the API table (H4) (CCR-FD-007)<br>0.7 (2026-11-10): errors: the event delivery companion's `SnapshotFailed` and `IncarnationUnavailable` reused for `OutboxSettlement.install` (BEH-FD-014, P1) (CCR-FD-005)<br>0.6 (2026-11-09): errors: the remote companion's `LocalContractRefused` is reused for a local contract in `contracts` (BEH-FD-009, core CCR-BR-033) (CCR-FD-004)<br>0.5 (2026-11-08): Round-2 agent review (R3-01; R4 F1–F4, F8–F10, F22) — API rows for the extended `ManifestStore`, `OutboxSettlement`, `releaseRevocation` and the loader's `RevocationSource.offer` (the `revocationFeed` row withdrawn), reader-version reports; worked example wires the required `revocation` and the outbox port (CCR-FD-003)<br>0.4 (2026-11-08): round 2: recheck items 18–20 and 22 — API rows for `RebootstrapOutbox`, `Federation.revocationFeed`, `VersionReports`; errors `RebootstrapBlocked`, `RevocationListStale`; `PlacementRefused` reused; core seams used (CCR-FD-003)<br>0.3 (2026-11-08): resolutions of the agent review of 2026-11-08 — links on the remote companion's multiplexer and `Remote.serve`; single-major imports; per-import peer realms; listener port and `contracts` option; worked example updated (R3-01, R3-02, R3-18) (CCR-FD-002)<br>0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-FD-001)<br>0.1 (2026-11-08): Initial draft (CCR-FD-001)                 |

---

## Mission

A deployment of many hosts — a cloud service, an optional hub per site, a
fleet of point-of-sale terminals or kiosks — needs three things the core
does not give:

1. **One place that says what each host should run.** Each host receives a
   signed *host manifest* from an authority and converges on it with the
   core's `reconcile`. The manifest is data: plugin entries by digest, their
   configuration overrides, realms, links to peers, exports, imports and
   kill entries.
2. **Continuity without the authority.** A host keeps the last manifest it
   applied and boots from it while offline, for at most a declared offline
   cap, after which it degrades in a declared way and, when it reconnects too
   far behind, re-bootstraps from a snapshot.
3. **Services across hosts.** A host exports a contract to named peers,
   serving its local provider through the remote companion's `Remote.serve`;
   a peer imports it, one contract major at a time, as a remote proxy plugin
   installed in a realm reserved for that import. An offer exchange fixes,
   per link, a federation protocol version inside an N/N−1 window, and
   accepts or refuses each import.

None of this changes the core host interface. Federation is one plugin that
holds `Bridger.Host` and calls `reconcile`; every change it makes is an
ordinary host operation, attributed to the federation actor, consulted with
the operation gate and recorded by the audit sink exactly as a direct call
would be ([ADR-FD-001](./decisions/001-federation-is-a-companion-over-reconcile.md)).

## Package boundary

| Concern | Where it lives |
| ------- | -------------- |
| Diff and convergence of the plugin set; ownership by reconcile scope; `Desired.overlay` | Core — [18 — Reconciliation and confluence](../core/behaviors/18-reconciliation-and-confluence.md) |
| Realms as resolution namespaces | Core — [17 — Realms and interception](../core/behaviors/17-realms-and-interception.md) |
| Attribution, gate and audit of each change the manifest causes | Core — [22](../core/behaviors/22-attributable-operations.md), [23](../core/behaviors/23-audit-sink-and-record.md), [25](../core/behaviors/25-operation-gate.md) |
| Contract identity, version ranges, `IncompatibleContract` | Core — [core 26 — Versioned contracts](../core/behaviors/26-versioned-contracts.md) (BEH-BR-225–232) |
| Manifest as data; reconcile of lazy plugins without evaluating their code | Core — [core 27 — Manifest and lazy activation](../core/behaviors/27-manifest-and-lazy-activation.md) (BEH-BR-241–249) |
| Annotations on `OperationContext` (provenance of a cross-host call) | Core — [core 30 — Operation context annotations](../core/behaviors/30-operation-context-annotations.md) (BEH-BR-289–295) |
| Plan (dry run) of a reconcile, for previewing a manifest | Core — [core 32 — Generic gate and plan](../core/behaviors/32-generic-gate-and-plan.md) (BEH-BR-313–321), optional |
| Realm families with idle eviction, used for peer realms | Core — [core 33 — Realm families](../core/behaviors/33-realm-families.md) (BEH-BR-329–338), optional |
| Remote proxy plugins, the host-side serving end `Remote.serve`, transports and the endpoint multiplexer, session epochs, heartbeats, mandatory call timeouts | `@bridger/remote` — [references/remote/](../remote/README.md) |
| Digest check before evaluation, `SignaturePolicy` (N-of-M signers), revocation, definition resolution by digest | `@bridger/loader` — [references/loader/](../loader/README.md) |
| Event exchange between hosts that outlives a process (outbox, inbox, upcasters, `HistorySource`) | `@bridger/durable-bus` — [references/durable-bus/](../durable-bus/README.md) |
| **Host manifests, sync, offline cap, re-bootstrap trigger, links, skew handshake, exports and imports, fencing** | **This package** |
| Running the authority service, issuing and signing manifests, key custody, the transport's authentication, the snapshot content, storage of the manifest copy | The application |

## Public API surface

All signatures are illustrative until code exists.

| Export | Kind | Purpose | Behaviour |
| ------ | ---- | ------- | --------- |
| `HostManifest`, `ManifestPlugin`, `ManifestRealm`, `ManifestPeer`, `ManifestExport`, `ManifestImport`, `KillEntry` | Schemas, types | The manifest as data, decoded with Effect Schema | [01](./behaviors/01-host-manifest.md) |
| `SignedManifest` | type | Canonical bytes plus signatures, as received | [01](./behaviors/01-host-manifest.md) |
| `Manifest.toDesired` | function | Pure projection of a verified manifest and local patches to `DesiredPlugin[]`, given freshness, the delivery imports, the `PlacementPolicy` and `hostResidency` | [01](./behaviors/01-host-manifest.md) |
| `Federation.plugin` | function | The federation plugin; requires `Bridger.Host` and the ports below, but uses the `outbox` port only if present | [02](./behaviors/02-sync-offline-and-rebootstrap.md) |
| `Federation.Status` | service | `current`, `changes`: applied revision, freshness, links, conflicts | [02](./behaviors/02-sync-offline-and-rebootstrap.md) |
| `Federation.sync` | method | Fetch, verify and apply now | [02](./behaviors/02-sync-offline-and-rebootstrap.md) |
| `ManifestSource` | port | Fetches the latest signed manifest for this host from the authority | [02](./behaviors/02-sync-offline-and-rebootstrap.md) |
| `ManifestStore` | port | Keeps the highest verified manifest and the last applied manifest's bytes, each with its acceptance time (`acceptedAt`, for re-verification under `reverify`), pending kills and the re-bootstrap marker | [02](./behaviors/02-sync-offline-and-rebootstrap.md) |
| `StatusReporter` | port | Optional: reports apply outcomes to the authority | [02](./behaviors/02-sync-offline-and-rebootstrap.md) |
| `Rebootstrap` | port | The application's snapshot re-bootstrap, invoked on `ResyncRequired` | [02](./behaviors/02-sync-offline-and-rebootstrap.md) |
| `LinkDialer`, `LinkListener`, `LinkConnection` | ports, type | Open, and accept, one physical connection (a remote-companion `Connection`, with the `TransportProfile` of the end that made it) per link | [03](./behaviors/03-links-and-skew-handshake.md) |
| `ControlFrame`, `PeerOffer`, `LinkAgreement`, `PeerLinkStatus` | types | The offer exchange on the control endpoint, its outcome, and a link's status (`delivery-only` in step 1 of a re-bootstrap retry) | [03](./behaviors/03-links-and-skew-handshake.md) |
| `ExportFence` | type | Fencing token of a single-owner export | [04](./behaviors/04-exports-and-imports.md) |
| `RebootstrapOutbox`, `OutboxSettlement` | port, types | Step 1 of a re-bootstrap: push or keep local facts; the settlement's `install` is the only path to `Rebootstrap.install`; `FederationOptions.outbox: "none"` states that the application holds no local facts | [02](./behaviors/02-sync-offline-and-rebootstrap.md) |
| `Federation.releaseRevocation`; the loader's `SignedRevocationList` and `RevocationSource.offer` | method; loader type and method | Kill-frame lists handed to the loader's revocation source; release of a revision held by the blast-radius guard | [06](./behaviors/06-kill-path-placement-and-skew.md) |
| `VersionReports`, `OldestVersionReport` | port, type | The oldest version received per origin and axis, and each host's reader versions, reported to the authority | [06](./behaviors/06-kill-path-placement-and-skew.md) |
| `TestFederation` | testing | Authority fixture, test signer, partitions, clock | [05](./behaviors/05-testing-and-acceptance.md) |

### Errors

| Tag | Raised when |
| --- | ----------- |
| `ManifestRejected { host, revision, reason }` | A received manifest is not applied: signature refused, wrong host, revision regressed or reused with different content, undecodable, self-reference |
| `ManifestUnavailable { cause }` | The source could not be reached; never fatal, the host keeps its applied state |
| `IncompatiblePeer { peer, local, remote }` | No federation protocol version is common to both sides of a link inside the window |
| `ExportConflict { key, owners }` | Two owners present the same fence for one single-owner export |
| `StaleExport { key, fence, highest }` | An owner presents a fence lower than the highest the importer has seen |
| `ResyncRequired { host, since }` | The authority, or the offline cap, demands a snapshot re-bootstrap |
| `RebootstrapBlocked { pending, reason }` | Step 1 of a re-bootstrap could neither push nor keep the local facts, found no outbox port, or found a hand-installed dependent of a delivery import (`pending` 0 for those two); nothing was fetched or replaced |
| `RebootstrapFailed { reason }` | The application's `Rebootstrap.fetch` (step 2) or `install` (step 3a) failed; the applied manifest stays in force and the re-bootstrap is retried on its own backoff, with links resumed only when no install had begun |
| `DeliveryImportRefused { entry, reason }` | A `FederationOptions.deliveryImports` entry is not an import id; the federation plugin's build fails (BEH-FD-014) |
| `RevocationSourceMissing` | `FederationOptions.revocation` is not wired; the federation plugin's build fails (BEH-FD-041) |
| `SignaturePolicyMissing` | `FederationOptions.signatures` is not wired; the federation plugin's build fails before it reads the store (BEH-FD-002) |
| `ResolveFailed { digest, message }` | The `PluginResolver` could not resolve an entry's digest; the entry is dropped, an installed plugin is not pruned |
| `DialFailed { peer, message }` | The `LinkDialer` could not open a link to a peer; redialled with backoff |
| `ListenFailed { message }` | The `LinkListener` failed to accept links; retried |
| `RevocationListStale { revision, held, from }` | A revocation list received in a `kill` frame is not newer than the one held; not applied, not relayed |

`IncompatibleContract` ([core 26](../core/behaviors/26-versioned-contracts.md)) is reused as the cause of an import whose
peer does not export its major at a version satisfying `"^" + V` (for major 0,
the same minor and v ≥ V); the session-level
errors of the remote companion (stale epoch, call timeout, session loss)
pass through unchanged, and its `PlacementRefused` is reused for an import
or export refused on placement (BEH-FD-045). Its `LocalContractRefused` is
reused when `contracts` holds a local contract (core `Contract.local`): the
federation plugin's build fails before anything is synced (BEH-FD-009).
The event delivery companion's `SnapshotFailed` and `IncarnationUnavailable`
are reused as the errors of `OutboxSettlement.install`, each handled at step
3a of a re-bootstrap (BEH-FD-014).

## Worked example

```ts
// illustrative — not type-checked
const federation = Federation.plugin({
  host: "site-04/terminal-03",
  authority: "cloud",
  source: HttpManifestSource.layer({ url: authorityUrl }),   // application adapter
  store: SqliteManifestStore.layer({ file: "federation.db" }), // application adapter
  signatures: "@app/ManifestSignatures",                     // a loader SignaturePolicy key
  resolver: Loader.resolver,                                  // digest -> PluginDefinition (loader)
  contracts: [StockQuery3, ReceiptPrinter2],                  // contracts this host imports or exports
  dialer: AppLinks.dialer,                                    // application adapter over a remote-companion transport
  listener: AppLinks.listener,
  syncEvery: "1 minute",
  maxOffline: "72 hours",
  revocation: "@app/Revocation",                             // the loader's RevocationSource key (required)
  outbox: "@app/RebootstrapOutbox",                           // DurableBus.rebootstrapOutbox() (event delivery companion); optional, resolved at step 1
  acceptedDigests: "@bridger/loader/AcceptedDigests",          // the loader's shared store; import proxies' digests pinned there under "@bridger/federation:" + id (BEH-FD-007)
  rebootstrap: AppSnapshot.rebootstrap                        // application; declares `replaces`
})

// The host boots from a small static list holding only the federation plugin.
yield* host.install(federation, { context: { actor: Actor.system } })
```

The authority issues revision 41 for `site-04/terminal-03`:

```jsonc
{
  "format": "bridger.host-manifest/1",
  "authority": "cloud", "host": "site-04/terminal-03",
  "revision": 41, "issuedAt": "2026-11-08T08:00:00Z", "validUntil": "2026-11-11T08:00:00Z",
  "plugins": [
    { "id": "pos-core", "digest": "sha256:…", "version": "3.2.0" },
    { "id": "loyalty", "digest": "sha256:…", "version": "1.4.1", "requiresFresh": true }
  ],
  "peers":   [ { "id": "site-04/hub", "address": "wss://hub.local", "protocol": [2, 3] } ],
  "imports": [ { "key": "stock/StockQuery", "from": "site-04/hub", "version": "3.1.0" } ],
  "exports": [ { "key": "pos/ReceiptPrinter", "to": ["site-04/hub"], "version": 2 } ],
  "kill":    [ { "digest": "sha256:…", "reason": "advisory 2026-17" } ]
}
```

The plugin verifies the bytes with the `SignaturePolicy`, records revision 41
in the `ManifestStore` as the highest verified, projects it to a desired list
(`pos-core`, `loyalty`, and an import proxy for `stock/StockQuery` at major
3 in realm `peer:site-04/hub:stock/StockQuery@3`), removes anything matching
a kill entry, and calls
`host.reconcile(list, { scope: "federation:cloud", context })`. When the WAN
drops, the terminal keeps running revision 41; after `validUntil` passes
without a newer manifest, `loyalty` (marked `requiresFresh`) is disabled; the
import proxy provides nothing while its link is down, so its dependents wait,
as the remote companion specifies for a partition, rather than failing. In
the other direction the hub, whose own manifest imports
`pos/ReceiptPrinter` from the terminal, dials it; the terminal accepts that
link through its `LinkListener` and serves the printer with `Remote.serve`,
one core lease per call.

## What stays in core, and what stays in the application

- **Core** keeps one plugin set per host, decided by `reconcile` and the
  legality table. Federation adds no host operation and no state to the host.
  It uses core's `RefusalList` (BEH-BR-267) for the kill path, carries
  `mandatoryInterceptions` and `allowChildren` as manifest data
  (BEH-BR-153), and needs no new core seam for residency: core only carries
  the label.
- **The application** runs the authority: it decides what each host should
  run, holds signing keys, signs manifests and revocation lists, issues export fences, serves
  snapshots, labels routes and plugins for residency, decides when to switch
  writers to a new version, and decides what a site does when its hub is down
  (failover policy is not automatic here; see
  [ADR-FD-008](./decisions/008-fenced-single-owner-exports.md)).
- Domain concepts (sites, terminals, tenants) are names the application puts
  in manifest fields; this package treats every identifier as opaque.

---

_Next: [01 — Host manifest](./behaviors/01-host-manifest.md)_
