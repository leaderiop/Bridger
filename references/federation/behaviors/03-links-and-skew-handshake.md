# 03 — Links and the skew handshake

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-FD-BEH-03                                            |
> | Revision       | 0.3                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.3 (2026-11-08): resolutions of the agent review of 2026-11-08 — links built on the remote companion's `Transport`, endpoint multiplexer and `Remote.serve`; federation's own control endpoint carries the offers; incoming connections accepted only from listed peers; `PeerLinkStatus` with string identifiers; symmetric protocol window carried in the offer; one import per (peer, contract, major), accepted or refused, never a major picked; one realm per import, retired when empty; peer-asserted actors as provenance (R3-01, R3-02, R3-18, R3-21, R3-22, R3-23) (CCR-FD-002)<br>0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-FD-001)<br>0.1 (2026-11-08): Initial draft (CCR-FD-001)                 |

---

A link is one physical connection between two federated hosts, opened with
a transport of the remote companion and split by the remote companion's
endpoint multiplexer ([BEH-RM-056](../../remote/behaviors/07-transports-and-adapters.md#beh-rm-056-several-endpoints-may-share-one-physical-connection))
into one **control endpoint**, owned by this package, and one endpoint per
import, each carrying an ordinary remote session with its own epoch. Hosts
in a fleet are upgraded one at a time, so the two ends of a link routinely
run different versions. This file specifies which links exist, the offer
exchange that fixes a federation protocol version and accepts or refuses
each import, what a partition does, the realm reserved for each import, and
what a peer's claims are worth. This file owns BEH-FD-017–024 and uses all
eight.

Planned source: `packages/federation/src/Link.ts` and
`packages/federation/src/Handshake.ts` *(Planned)*.

## BEH-FD-017: The manifest names the links

> **See:** [ADR-FD-002](../decisions/002-authority-is-the-only-source-of-desired-state.md), [ADR-FD-005](../decisions/005-peer-realms-and-remote-proxies.md)
> **Depends on:** remote companion `Connection`, `Transport.multiplex` and `GuestTransport.multiplex` ([BEH-RM-049](../../remote/behaviors/07-transports-and-adapters.md#beh-rm-049-the-transport-interface-moves-frames-and-reports-closure), [BEH-RM-056](../../remote/behaviors/07-transports-and-adapters.md#beh-rm-056-several-endpoints-may-share-one-physical-connection))

```ts
// illustrative — not type-checked
interface LinkDialer {
  // Opens one physical connection to a peer's opaque address (remote companion `Connection`).
  readonly dial: (peer: ManifestPeer) => Effect.Effect<Connection, DialFailed, Scope.Scope>
}
interface LinkListener {
  // Physical connections dialled by peers. Who they claim to be is learnt from the offer (BEH-FD-018).
  readonly accept: Stream.Stream<Connection, ListenFailed, Scope.Scope>
}

// endpoints of one link (names passed to the remote multiplexer)
//   "control"                   — this package's ControlFrame exchange (BEH-FD-018)
//   "import:" + serviceId       — one remote session per import, serviceId = "<contract name>@<major>"

interface PeerLinkStatus {                      // named apart from the remote companion's LinkStatus
  readonly peer: string
  readonly direction: "outgoing" | "incoming"
  readonly state: "connecting" | "up" | "partitioned" | "incompatible" | "suspended" | "closed"
  readonly connection?: string                  // id of the physical connection, from the core IdGenerator
  readonly agreement?: LinkAgreement
}
```

```
REQUIREMENT: The federation plugin MUST keep one outgoing link to each peer
             of the applied manifest's `peers` that at least one import
             names in `from`, dialled with the `LinkDialer`, and MUST accept
             incoming links through the `LinkListener` only from peers that
             the applied manifest lists in `peers` and that at least one
             export names in `to` (or with `to: "*"`). A peer added by a
             newer manifest MUST be dialled after that manifest is applied;
             a link no longer needed MUST be closed after the imports over
             it are removed by the same apply.
```

```
REQUIREMENT: Each link MUST be split with the remote companion's multiplexer:
             `Transport.multiplex` on the dialling end, `GuestTransport.multiplex`
             on the accepting end. The "control" endpoint MUST carry only
             this package's `ControlFrame` schema; every "import:" endpoint
             MUST carry only remote sessions of the remote companion.
```

```
REQUIREMENT: The accepting end MUST serve no "import:" endpoint of a link
             until its offer exchange has completed and accepted the peer.
             When the dialler's offer names a `host` not listed in the
             applied manifest's `peers`, or one no export is made to, the
             accepting end MUST answer with a `ControlFrame` refusal
             `IncompatiblePeer { reason: "not-a-peer" }` and close the
             physical connection, before any remote session starts.
```

```
REQUIREMENT: A link MUST be opened, retried and closed in fibers of the
             federation plugin; no host transition MAY wait for a link.
```

Links are desired state like plugins: the authority decides which hosts talk
to each other. That keeps the topology reviewable in one place and means a
compromised or misconfigured host cannot add itself as a peer of another.

## BEH-FD-018: The handshake offer

> **Invariant:** [INV-FD-006](../invariants.md#inv-fd-006-a-link-uses-only-versions-both-ends-support)
> **See:** [ADR-FD-006](../decisions/006-n-minus-one-skew-window.md)
> **Depends on:** [core 26 — Versioned contracts](../../core/behaviors/26-versioned-contracts.md) (contract identity and major versions; BEH-BR-225–232)

```ts
// illustrative — not type-checked
interface PeerOffer {
  readonly host: string
  readonly authority: string
  readonly revision: number                       // the offering host's applied manifest revision
  readonly protocol: readonly [min: number, max: number]
  readonly protocolWindow: number                 // the offering host's applied `protocolWindow` (BEH-FD-019)
  readonly exports: readonly {                    // what this host serves to the receiving peer
    readonly key: string                          // contract name
    readonly major: number
    readonly version?: string                     // the local provision's version; absent = unavailable now
    readonly digest?: string                      // meta.digest of the serving plugin, a claim (BEH-FD-027)
    readonly fence?: ExportFence
  }[]
  readonly imports: readonly {                    // what this host imports from the receiver
    readonly key: string; readonly version: string
    readonly highestFence?: ExportFence           // the highest fence this host has seen for that key (BEH-FD-031)
  }[]
}

type ControlFrame =
  | { readonly t: "offer"; readonly offer: PeerOffer }
  | { readonly t: "refuse"; readonly error: IncompatiblePeer }
  | { readonly t: "goodbye"; readonly reason: string }

interface LinkAgreement {
  readonly protocol: number
  readonly accepted: readonly { readonly serviceId: string; readonly version: string; readonly fence?: ExportFence }[]
  readonly refused: readonly { readonly serviceId: string; readonly reason: "no-export" | "unavailable" | "incompatible-contract" | "killed" | "stale-export" | "export-conflict"; readonly cause?: IncompatibleContract }[]
}
```

```
REQUIREMENT: On every new link, before any remote session starts on an
             "import:" endpoint, each end MUST send a `ControlFrame` offer on
             the "control" endpoint and MUST decode the other's with an
             Effect Schema that ignores unknown fields. A later offer on the
             same link (sent when the sender applies a new manifest) MUST be
             handled as a new offer for that link.
```

```
REQUIREMENT: An end MUST refuse the link with `IncompatiblePeer
             { reason: "wrong-host" }` when the offer's `host` is not the
             peer id the manifest names for this link, and with
             `IncompatiblePeer { reason: "wrong-authority" }` when its
             `authority` differs from its own.
```

```
REQUIREMENT: The offer's `exports` MUST list only what the offering host's
             applied manifest exports to this peer (04), with the contract
             majors its exporting plugin actually serves.
```

**Settled here.** (1) The offer is exchanged on every new link, not once per
peer: a peer may have been upgraded while the link was down, and its new
offer is the only reliable statement of what it now serves. (2) The offer
travels on an endpoint of this package's own, not in the remote envelope:
the remote protocol stays one contract per session, and the remote
companion carries the control endpoint's bytes without reading them. (3)
Unknown fields are ignored so a newer peer can add offer fields without
breaking an older one.

## BEH-FD-019: The federation protocol version: highest common, inside the window

> **Invariant:** [INV-FD-006](../invariants.md#inv-fd-006-a-link-uses-only-versions-both-ends-support)
> **See:** [ADR-FD-006](../decisions/006-n-minus-one-skew-window.md)

```
REQUIREMENT: Each end MUST compute the agreed protocol as the highest version
             in [max(minA, minB, maxA − wA, maxB − wB), min(maxA, maxB)],
             where [minX, maxX] is end X's `protocol` range and wX its
             `protocolWindow` (the applied manifest's `protocolWindow`,
             default 1), all four values taken from the two offers.
```

```
REQUIREMENT: When that set is empty, both ends MUST send a `ControlFrame`
             refusal and close the link with
             `IncompatiblePeer { peer, local: [min, max], remote: [min, max] }`,
             the link MUST be `incompatible`, no call MUST cross it, and the
             link MUST NOT be redialled until a newer manifest is applied on
             this host or the peer's offer on a later link differs.
```

```
REQUIREMENT: Both ends MUST compute the same result from the same two offers;
             the computation MUST be a pure function of the offers and the
             window.
```

**Settled here.** "N/N−1" is read from each end's own maximum: a host at
protocol N works with peers at N and N−1, and refuses N−2. Both windows
travel in the offers, so both ends compute over the same interval and reach
the same answer even when their manifests set different windows. Refusing
is preferred to running an untested combination: the N−1 pair is the one a
release is expected to test (BEH-FD-034), and nothing older is.

## BEH-FD-020: Each import names one major, and the offer accepts or refuses it

> **Invariant:** [INV-FD-006](../invariants.md#inv-fd-006-a-link-uses-only-versions-both-ends-support)
> **See:** [ADR-FD-006](../decisions/006-n-minus-one-skew-window.md)
> **Depends on:** core [26 — Versioned contracts](../../core/behaviors/26-versioned-contracts.md) (major in the `ServiceId` BEH-BR-225, `Contract.satisfies` BEH-BR-226, `IncompatibleContract` BEH-BR-228, provisions fixed at registration BEH-BR-232)

```
REQUIREMENT: Each import names one contract major through its `version` V
             (BEH-FD-001), and is served by one import proxy providing that
             contract at V (04). For each import from the peer, the
             importing end MUST accept it in `LinkAgreement.accepted` only
             when the peer's offer lists an export of the same key and
             major whose `version` v satisfies `>= V < (major+1).0.0`, whose
             digest is not killed (BEH-FD-027) and whose fence is not stale
             or in conflict (BEH-FD-029); otherwise it MUST list it in
             `LinkAgreement.refused` with the reason, with an
             `IncompatibleContract` cause for a version mismatch. The
             handshake MUST NOT choose a major.
```

```
REQUIREMENT: A refused import MUST NOT fail anything: the federation end of
             its endpoint does not open (04, BEH-FD-026), so its proxy
             provides nothing (no session child), its dependents stay
             `waiting`, and the other imports on the link proceed.
```

```
REQUIREMENT: The projection (BEH-FD-005) MUST drop, with reason
             "outside-contract-window", an import whose major is lower than
             the highest major of that contract name in the plugin's
             `contracts` minus the manifest's `contractWindow` (default 1),
             and with reason "unknown-contract" an import or export whose
             (key, major) is not in `contracts`.
```

**Settled here.** (1) A contract's major is part of its `ServiceId`, and a
provision is fixed at registration (core BEH-BR-232): a proxy whose major
changed between sessions would publish under a different key and strand
the dependents bound to the old one. To follow a peer across majors the
authority lists two imports, one per major, side by side. (2) A protocol
mismatch makes the whole link meaningless and refuses it; a contract
mismatch concerns one import and refuses only that one, which waits rather
than fails because the remedy — an upgrade of one end, delivered by a
manifest — is expected and should not require an operator to `retry` the
proxy.

## BEH-FD-021: A partition makes imports wait; a new session gets a new epoch

> **Invariant:** [INV-FD-007](../invariants.md#inv-fd-007-stale-epochs-and-stale-fences-are-refused-at-the-boundary), [INV-FD-008](../invariants.md#inv-fd-008-no-host-transition-waits-on-the-network)
> **See:** [ADR-FD-005](../decisions/005-peer-realms-and-remote-proxies.md)
> **Depends on:** remote companion heartbeat, epoch and partition semantics ([references/remote/](../../remote/README.md))
> **Satisfies:** [URS-BR-012](../../core/urs.md#urs-br-012-use-a-dependency-when-it-is-present-without-requiring-it)

```
REQUIREMENT: When a link's physical connection closes, or every remote
             session over it reports a missed heartbeat, the link MUST
             become `partitioned`; every remote session over it ends with it
             (BEH-RM-056), and the import proxies MUST behave as the remote
             companion specifies for a session loss: their session children
             are withdrawn and their dependents wait; this package fails
             none of them.
```

```
REQUIREMENT: A redial MUST open a new physical connection, MUST repeat the
             offer exchange, and the remote sessions over it MUST each start
             with a new epoch (a string from the dialling host's core
             `IdGenerator`, BEH-RM-010). Calls and replies carrying the epoch
             of a previous session MUST be refused at the boundary, as the
             remote companion specifies.
```

```
REQUIREMENT: Redials MUST back off with jitter drawn from `Random`, as in
             BEH-FD-011.
```

This restates per host the rules of the review's §7: availability across
hosts is eventually consistent; a partition makes plugins wait instead of
failing; a stale epoch is refused at the boundary; remote calls always have a
timeout. They are the remote companion's to enforce; this package only
ensures it does not undo them, for example by failing a proxy on partition.

## BEH-FD-022: Each import has its own peer realm

> **Invariant:** [INV-FD-005](../invariants.md#inv-fd-005-a-peers-imports-resolve-only-in-the-realm-named-for-them)
> **See:** [ADR-FD-005](../decisions/005-peer-realms-and-remote-proxies.md), [ADR-BR-019](../../core/decisions/019-realms-are-resolution-namespaces.md)
> **Depends on:** core [17 — Realms and interception](../../core/behaviors/17-realms-and-interception.md) (realm options fixed at definition, BEH-BR-145); core [33 — Realm families](../../core/behaviors/33-realm-families.md) (`retireRealm` and the realm turn, BEH-BR-335)
> **Satisfies:** [URS-BR-011](../../core/urs.md#urs-br-011-run-the-same-plugin-once-per-tenant-or-database)

```
REQUIREMENT: For each import of key K at major M from peer P that does not
             name a `realm`, the plugin MUST ensure a realm with the id
             "peer:" + P + ":" + K + "@" + M exists, defined with
             `host.defineRealm` isolating exactly that contract's key,
             before the apply that installs the import, and attributed as in
             BEH-FD-008. Because a realm's options are fixed at definition
             (core BEH-BR-145), a realm isolates one import and never needs
             to change; a later manifest that adds an import from P defines
             a new realm for it.
```

```
REQUIREMENT: After the reconcile of an apply has removed an import, the
             plugin MUST retire that import's peer realm with
             `host.retireRealm` (core BEH-BR-335), attributed as in
             BEH-FD-008. A `RealmInUse` (something else was installed into
             it) MUST be reported and the realm left defined; it MUST be
             retried at the next apply.
```

```
REQUIREMENT: A `ManifestRealm` whose `isolate` differs from that of a realm
             of the same id already defined on the host MUST be reported as
             `realm-changed` and MUST NOT be redefined; entries naming it are
             applied into the existing realm. A changed realm takes a new id
             in the manifest.
```

```
REQUIREMENT: Documentation and status of this package MUST NOT describe a peer
             realm as isolation, a sandbox or a trust boundary.
```

**Settled here.** (1) One realm per import gives each peer its own provider
slot for each key (core [INV-BR-001](../../core/invariants.md#inv-br-001-one-provider-per-service-key-per-realm)),
so two peers that both export `stock/StockQuery` can both be imported
without a `DuplicateProvider`, and a realm never has to change its isolated
keys, which core forbids. (2) Peer realms are plain realms defined with
`defineRealm`, not members of a `Realm.family`: family members get ids
formed by the family (core gap G47) and are created lazily by it, which
would not give the fixed, readable id an operator finds in snapshots.
Choosing between two peers for a local consumer is a provider-selection
question this package does not answer (see 04).

## BEH-FD-023: A peer's claims are claims

> **See:** [ADR-FD-005](../decisions/005-peer-realms-and-remote-proxies.md)
> **Depends on:** [core 30 — Operation context annotations](../../core/behaviors/30-operation-context-annotations.md) (`Annotation.Provenance`, `CallerContext`, flow "wire"; BEH-BR-289–296); remote companion `Remote.serve` ([BEH-RM-039](../../remote/behaviors/05-guest-serve.md#beh-rm-039-remoteserve-serves-a-local-provider-from-inside-a-host))
> **Satisfies:** [URS-BR-021](../../core/urs.md#urs-br-021-know-who-changed-the-plugin-set-when-and-why)

```
REQUIREMENT: The package MUST NOT authenticate a peer. That a link really
             comes from the host its offer names is established by the
             transport the `LinkDialer` and `LinkListener` supply, or not at
             all; this package's checks (BEH-FD-017, BEH-FD-018) compare
             names only.
```

```
REQUIREMENT: Every call served to peer P (04) MUST run, through the
             `context` option of `Remote.serve`, as the service actor
             `{ kind: "service", id: "peer:" + P }`, with the call's decoded
             wire annotations combined with one `Annotation.Provenance`
             entry `{ source: "peer:" + P, ref: <the asserted actor's id> }`
             (core BEH-BR-290). The actor the peer asserts in the call's
             claims MUST NOT become the served call's actor.
```

```
REQUIREMENT: Exports serve no callbacks (BEH-RM-039), so a link MUST NOT
             need a cross-host `TokenAuthority`; import proxies MUST be
             defined with no `grants`.
```

This is the core's position on identity applied to hosts
([BEH-BR-191](../../core/behaviors/22-attributable-operations.md)): core
records the actor it is given and never establishes who that actor is.

## BEH-FD-024: Applying a manifest changes links in a fixed order

> **Invariant:** [INV-FD-008](../invariants.md#inv-fd-008-no-host-transition-waits-on-the-network)
> **See:** [ADR-FD-001](../decisions/001-federation-is-a-companion-over-reconcile.md)

```
REQUIREMENT: An apply that changes peers, imports or exports MUST act in this
             order: (1) define the peer realms of new imports; (2) stop
             serving exports no longer listed and refuse their calls at the
             boundary; (3) run the reconcile (which installs and removes
             import proxies); (4) retire the peer realms of removed imports;
             (5) close links no longer needed; (6) send a new offer on links
             that stay, and dial new peers.
```

```
REQUIREMENT: Closing a link MUST wait for the import proxies on it to be
             removed by the reconcile of step (3); their removal drains their
             leases under core rules, bounded by `drainTimeout`.
```

**Settled here.** Serving stops before the reconcile so that a peer can no
longer reach an export the authority withdrew, even while the local reconcile
is still running; links close after the reconcile so that removing a proxy
never races the loss of its transport.

---

_Previous: [02 — Sync, offline and re-bootstrap](./02-sync-offline-and-rebootstrap.md)_ · _Next: [04 — Exports and imports](./04-exports-and-imports.md)_
