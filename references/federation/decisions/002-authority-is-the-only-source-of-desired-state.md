# ADR-FD-002: The authority is the only source of desired state

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-FD-ADR-002                                            |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.1 (2026-11-08): Initial draft (CCR-FD-001)                 |

---

## Context

Local-first systems choose between server-authoritative designs (one authority orders and decides; replicas converge on it) and peer-to-peer merging (CRDTs, consensus among replicas). For the *configuration* of a host — which code runs, which peers it talks to, who owns an export — merging is unsafe: two concurrent "decisions" about which plugin version runs have no meaningful merge, and a quorum is often unavailable on a site whose WAN is down.

## Decision

- Each host follows exactly one authority. Its desired state is the latest verified manifest that authority issued for it, plus local patches restricted to fields the manifest makes overridable.
- Hosts never negotiate desired state with each other: no election, no gossip of manifests, no automatic failover of fenced exports ([BEH-FD-030](../behaviors/04-exports-and-imports.md#beh-fd-030-no-automatic-takeover)).
- The topology (peers, exports, imports) is part of the manifest.

## Alternatives considered

- **Gossip of manifests between peers.** Rejected: a peer could then shape another host's state; the signature would still need the authority, so gossip adds only a delivery path, which the application may add itself as a `ManifestSource`.
- **Consensus among the hosts of a site.** Rejected: needs a quorum the typical site (one hub, two terminals) does not have during the outage it is meant for.

## Consequences

**Positive**: one reviewable place for each host's desired state; no split decisions inside the package.

**Negative**: no automatic failover; during an authority outage, nothing in the desired state can change. A `ManifestSource` adapter that delivers pre-signed manifests over a local channel is the application's way around it.

**Trade-off accepted**: availability of *changes* is sacrificed during an outage; availability of the *running* state is kept (02).

## References

- Behaviours: [01](../behaviors/01-host-manifest.md), [03](../behaviors/03-links-and-skew-handshake.md), [04](../behaviors/04-exports-and-imports.md)
- Decisions: [ADR-FD-008](./008-fenced-single-owner-exports.md)
