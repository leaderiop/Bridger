# 04 — Exports and imports

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-FD-BEH-04                                            |
> | Revision       | 0.3                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.3 (2026-11-08): resolutions of the agent review of 2026-11-08 — exports served with the remote companion's `Remote.serve` (one core lease per call, `method-not-served` and `unavailable` refusals), no `Grant.of`; one import proxy per (peer, contract, major) over a federation endpoint transport opened only for accepted imports; fences bound to the link and checked before delivery by closing superseded endpoints; a fence does not stop a deposed owner (R3-01, R3-02, R3-03, R3-26) (CCR-FD-002)<br>0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-FD-001)<br>0.1 (2026-11-08): Initial draft (CCR-FD-001)                 |

---

An export makes a contract provided on one host callable by named peers; an
import makes a peer's export available on this host as a remote proxy
plugin. Some services must have exactly one owner in a federation — a shop
hub that orders a site's events, say — and a network partition can leave
two hosts each believing it is that owner. This file specifies exports,
imports, and the fencing that keeps an importer from acting on two owners
at once; fencing protects each importer, and does not stop a deposed owner
from acting for importers that have not yet learnt of the change
(BEH-FD-028). This file owns BEH-FD-025–032 and uses all
eight.

Planned source: `packages/federation/src/Export.ts`,
`packages/federation/src/Import.ts` and `packages/federation/src/Fence.ts`
*(Planned)*.

## BEH-FD-025: An export serves a listed contract to listed peers

> **See:** [ADR-FD-005](../decisions/005-peer-realms-and-remote-proxies.md)
> **Depends on:** remote companion host-side serving end `Remote.serve` ([BEH-RM-039](../../remote/behaviors/05-guest-serve.md#beh-rm-039-remoteserve-serves-a-local-provider-from-inside-a-host)) and multiplexer ([BEH-RM-056](../../remote/behaviors/07-transports-and-adapters.md#beh-rm-056-several-endpoints-may-share-one-physical-connection)); [core 29 — Capability grants and call log](../../core/behaviors/29-capability-grants-and-call-log.md) (`CallLog`; BEH-BR-276)

```
REQUIREMENT: On an incoming link from peer P whose offer exchange has
             accepted P, the plugin MUST serve exactly the contracts of the
             applied manifest's `exports` whose `to` is "*" or contains P.
             Each export of key K at major M MUST be served by one
             `Remote.serve(contract, { transport, realm: "default",
             methods, context })`, where `contract` is the contract of the
             plugin's `contracts` with that name and major, `transport` is
             the link's "import:" + K + "@" + M endpoint, `methods` is the
             entry's `methods` (all when absent), and `context` is that of
             BEH-FD-023. `Remote.serve` reaches the provider with a core
             lease per call (BEH-RM-039).
```

```
REQUIREMENT: A call to a method outside the entry's `methods` MUST be
             refused by `Remote.serve` with "method-not-served" before the
             provider is leased; an endpoint for a key or major not exported
             to P MUST NOT be accepted at all, so a session for it never
             completes its handshake (BEH-RM-056).
```

```
REQUIREMENT: An export whose local provider is not `active`, or whose
             provision is below the contract's version, MUST be offered
             without `version` (unavailable) and its calls MUST be refused
             by `Remote.serve` with "unavailable"; this package MUST NOT
             cause the local provider to be started.
```

```
REQUIREMENT: When a `CallLog` port (core 29) is wired, each served call is
             offered to it by `Remote.serve` (BEH-RM-046, direction
             "served"), naming the peer through the served call's actor and
             the session epoch, the key and the method — never arguments or
             results.
```

Serving takes a core lease per call, so a local `remove` or `replace` of the
exporting plugin drains the peer's calls exactly as it drains local ones
([09 — Leases](../../core/behaviors/09-leases.md)). A served call is not a
host operation: it is not gated or audited by core unless it reaches a
mutating host call, which is then attributed to the peer's service actor;
the application's own contract decides what else of it to record. The
`CapabilityPolicy` decides each capture with the federation plugin as
consumer, since `Remote.serve` runs in the federation plugin's fiber.

## BEH-FD-026: An import is a remote proxy plugin installed by reconcile

> **Invariant:** [INV-FD-005](../invariants.md#inv-fd-005-a-peers-imports-resolve-only-in-the-realm-named-for-them)
> **See:** [ADR-FD-005](../decisions/005-peer-realms-and-remote-proxies.md)
> **Depends on:** remote companion `Remote.define` ([references/remote/](../../remote/README.md)); [INV-RM-001](../../remote/invariants.md#inv-rm-001-a-remote-plugin-adds-no-state-operation-or-transition), [INV-RM-003](../../remote/invariants.md#inv-rm-003-every-remote-call-is-bounded-by-a-timeout)

```
REQUIREMENT: Each `ManifestImport` of key K at version V (major M) MUST
             become one `DesiredPlugin` in the projection of BEH-FD-005: a
             proxy definition built with the remote companion's
             `Remote.define` for the contract of the plugin's `contracts`
             with name K and major M, at V (`Contract.at`, core BEH-BR-227),
             with no `grants`, with id "import:" + from + ":" + K + "@" + M,
             realm `realm ?? "peer:" + from + ":" + K + "@" + M`
             (BEH-FD-022), and `meta.version`/`meta.digest` derived
             deterministically from (from, K, V, timeout) so that an
             unchanged import is the same definition to core reconcile
             (BEH-BR-154). Two imports of one (from, K, M) MUST be dropped
             as "duplicate-import".
```

```
REQUIREMENT: The proxy's `transport` MUST be a federation endpoint transport
             for (from, K, M): its `open` MUST return the logical connection
             of the "import:" + K + "@" + M endpoint on the current outgoing
             link to `from` only while that link is `up` and its agreement
             lists the import in `accepted`; otherwise `open` MUST fail at
             once with the remote companion's `TransportError`, naming the
             reason, so that the link retries on its own schedule and
             provides nothing meanwhile.
```

```
REQUIREMENT: Every import proxy MUST have a call timeout: the entry's
             `timeout`, or the remote companion's default. An import without
             any timeout MUST NOT be constructible.
```

```
REQUIREMENT: While the link is not `up`, or the import is not accepted by
             the agreement (BEH-FD-020), the proxy MUST provide nothing (no
             session child), so that its dependents wait. When a new offer
             withdraws an accepted import, the plugin MUST close that
             import's logical connection, which ends its remote session.
```

```
REQUIREMENT: Importing a key that the local host also provides in the same
             realm MUST surface as core's `DuplicateProvider` in the
             reconcile report; the package MUST NOT resolve it.
```

The proxy is the remote companion's ordinary local proxy plugin; federation
only decides, from the manifest, which proxies exist and where. Its leases,
drain, epochs and partition behaviour are the remote companion's
([INV-RM-005](../../remote/invariants.md#inv-rm-005-a-partition-withdraws-the-provider-and-fails-no-dependent)).

**Open.** Several peers may export one contract (two hubs, several suppliers).
Each lands in its own peer realm; choosing one for a consumer in the default
realm is the "contract as a registry, with a provider selector" piece of the
architecture review (§4), which is not specified here. Until it is, an
import that must be visible in the default realm names `realm: "default"`
and at most one such import per key is possible.

## BEH-FD-027: Killed digests are neither imported nor exported

> **Invariant:** [INV-FD-003](../invariants.md#inv-fd-003-a-killed-plugin-is-never-in-a-desired-list)
> **See:** [ADR-FD-003](../decisions/003-monotonic-manifest-revisions.md)

```
REQUIREMENT: An export whose local provider's definition carries a digest
             named by a kill entry (or revoked by a wired `RevocationSource`)
             MUST NOT be served; its calls MUST be refused at the boundary.
```

```
REQUIREMENT: When a peer's offer reports, for an export, the digest of the
             definition serving it, and that digest is killed on the
             importing host, the import MUST be refused (BEH-FD-020), with
             reason "killed".
```

A peer's reported digest is a claim (BEH-FD-023); refusing on it is a
convenience that stops a known-bad peer early, not a guarantee. The peer's
own authority kills the digest on the peer.

## BEH-FD-028: A single-owner export carries a fence

> **Invariant:** [INV-FD-007](../invariants.md#inv-fd-007-stale-epochs-and-stale-fences-are-refused-at-the-boundary)
> **See:** [ADR-FD-008](../decisions/008-fenced-single-owner-exports.md)

```ts
// illustrative — not type-checked
interface ExportFence {
  readonly scope: string        // opaque name of the ownership domain, e.g. a site
  readonly owner: string        // host id the authority designated as owner
  readonly token: number        // positive integer, strictly increasing per (key, scope)
}
```

```
REQUIREMENT: An export entry carrying a `fence` MUST be served only by the
             host named `fence.owner`; a host whose id differs MUST NOT serve
             it and MUST report `fence-not-owner`.
```

```
REQUIREMENT: The fence MUST be presented in the offer (BEH-FD-018). It binds
             the link: every reply received on that export's endpoint is a
             reply from the owner the offer's fence names, and is delivered
             only while that fence is still the highest the importer has
             seen (BEH-FD-029).
```

```
REQUIREMENT: Fences MUST be issued by the authority only. The package MUST
             NOT offer a way for a host to create, raise or transfer a fence.
```

The fence token is the classic fencing token: the authority raises it each
time it moves ownership, and every importer remembers the highest it has
seen. An old owner that comes back from a partition still presents the old
token and is refused, even though it has not yet learnt that it was replaced.

**Settled here.** A fence protects each importer, not the owner side. Until
every importer has seen the higher token, a deposed owner keeps serving the
importers that have not, while the new owner serves those that have: two
owners can be live at once for different importers. An effect that needs a
single writer across the federation must check the fence where the effect
lands — the owner's storage, a sequence it allocates — which is the
application's job ([ADR-FD-008](../decisions/008-fenced-single-owner-exports.md)).

## BEH-FD-029: Importers refuse stale fences and stop on equal ones

> **Invariant:** [INV-FD-007](../invariants.md#inv-fd-007-stale-epochs-and-stale-fences-are-refused-at-the-boundary)
> **See:** [ADR-FD-008](../decisions/008-fenced-single-owner-exports.md)

```
REQUIREMENT: For each (key, fence.scope) an importer MUST keep the highest
             token seen — from its own manifest's import entries, offers and
             replies — in the `ManifestStore`, and MUST NOT lower it.
```

```
REQUIREMENT: An offer whose token is lower than the highest seen MUST be
             refused for that export with `StaleExport { key, fence,
             highest }` (the import is not accepted, BEH-FD-020). When a
             higher token for (key, scope) becomes known — from a manifest
             or from another link's offer — the plugin MUST close the
             logical connection of every import endpoint whose agreed fence
             for (key, scope) is lower, and MUST drop every frame received
             on it afterwards, before recording the higher token as in
             force; calls in flight on it then fail with the remote
             companion's `SessionLost` (`outcome: "unknown"`), and no reply
             under the lower fence is delivered after that point.
```

```
REQUIREMENT: Two offers for one (key, scope) with the same token and
             different owners MUST raise `ExportConflict { key, owners }`:
             every import of that (key, scope) MUST provide nothing (its
             dependents wait), the conflict MUST appear in
             `Federation.Status.conflicts` and be reported to the
             `StatusReporter`, and it MUST persist until a manifest or offer
             with a higher token arrives.
```

```
REQUIREMENT: A higher token seen in an offer before this host's manifest
             names it MUST be honoured (the old owner is refused) even though
             the new owner is not yet imported.
```

**Settled here.** (1) A reply under a stale fence is not delivered: the
endpoint it would arrive on is closed before the higher token takes effect,
so a deposed owner's answer cannot reach a consumer after the importer
learnt that the authority moved ownership. The fence is checked per link
rather than carried in every reply, so the remote envelope needs no
federation field. The call's effect on the
deposed owner may have happened; it is reported, never retried (the remote
companion's rule for an unknown outcome,
[INV-RM-008](../../remote/invariants.md#inv-rm-008-an-unknown-outcome-is-reported-as-unknown-and-never-retried)).
(2) Equal tokens with two owners mean the authority itself equivocated; an
importer cannot pick the right one and stops using both.

## BEH-FD-030: No automatic takeover

> **See:** [ADR-FD-002](../decisions/002-authority-is-the-only-source-of-desired-state.md), [ADR-FD-008](../decisions/008-fenced-single-owner-exports.md)

```
REQUIREMENT: The package MUST NOT move ownership of a fenced export from one
             host to another on its own — not on partition, not on missed
             heartbeats, not by election among peers. Ownership changes only
             with a manifest carrying a higher fence token.
```

```
REQUIREMENT: When the owner of a fenced export is partitioned from an
             importer, the import MUST wait (BEH-FD-021) and the status MUST
             show the owner as unreachable.
```

**Settled here.** Automatic failover between peers needs a quorum to be
correct, and a site with a hub and two terminals has none when the WAN is
down. Waiting is the outcome a partition already has everywhere else in
Bridger. An application that needs a site to continue with its hub gone
pre-issues, through the authority, the manifest that moves the fence, and
delivers it by whatever local means it trusts; that policy is the
application's.

## BEH-FD-031: An export withdrawn or moved is refused at once

> **Invariant:** [INV-FD-007](../invariants.md#inv-fd-007-stale-epochs-and-stale-fences-are-refused-at-the-boundary)
> **See:** [ADR-FD-008](../decisions/008-fenced-single-owner-exports.md)

```
REQUIREMENT: When an applied manifest no longer lists an export to a peer, or
             lists it with a fence naming another owner, the host MUST stop
             serving it before the reconcile of that apply (BEH-FD-024 step
             2). Calls already admitted MUST complete under their leases;
             new calls MUST be refused.
```

```
REQUIREMENT: A host that learns from an offer that its own fence for (key,
             scope) is lower than a peer's MUST stop serving that export and
             report `fence-superseded`, without waiting for its manifest.
```

The second rule lets the deposed owner stop itself as soon as any peer tells
it, which shortens the split-brain window when the deposed owner is
reachable but its authority is not.

## BEH-FD-032: Exports and imports never change the core legality table

> **See:** [ADR-FD-001](../decisions/001-federation-is-a-companion-over-reconcile.md)
> **Depends on:** [INV-RM-001](../../remote/invariants.md#inv-rm-001-a-remote-plugin-adds-no-state-operation-or-transition)

```
REQUIREMENT: Import proxies MUST be installed, replaced and removed only by
             the federation reconcile; exports MUST be served only from
             providers resolved by the core. Neither MAY add a plugin state,
             a host operation, or a transition to the core.
```

```
REQUIREMENT: A failed import proxy MUST be `failed` under core's sticky
             failure rule; the package MUST NOT retry it except by a new
             manifest revision that replaces it.
```

Keeping the legality table intact is the point of the review's rule that a
remote plugin is a local proxy plugin: every state and operation of a
federated host has the same defined outcome as on a lone host.

---

_Previous: [03 — Links and the skew handshake](./03-links-and-skew-handshake.md)_ · _Next: [05 — Testing and acceptance](./05-testing-and-acceptance.md)_
