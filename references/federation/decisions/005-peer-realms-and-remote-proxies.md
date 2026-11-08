# ADR-FD-005: Each peer in its own realm, imports as remote proxies

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-FD-ADR-005                                            |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.2 (2026-11-08): resolutions of the agent review of 2026-11-08 — one peer realm per import (realms are immutable); imports one major each; links on the remote multiplexer, exports on `Remote.serve`; asserted actors as provenance (R3-01, R3-02, R3-18, R3-23) (CCR-FD-002)<br>0.1 (2026-11-08): Initial draft (CCR-FD-001)                 |

---

## Context

A host imports services from several peers; two peers may export the same contract. The core allows one provider per key per realm ([ADR-BR-003](../../core/decisions/003-one-provider-per-key-per-realm.md)) and realms are resolution namespaces, not boundaries ([ADR-BR-019](../../core/decisions/019-realms-are-resolution-namespaces.md)). The review's rule is that a remote plugin is a local proxy plugin, and that third-party code never runs in-process.

## Decision

- Each import of key K at major M from peer P gets its own realm `peer:P:K@M`, defined with `defineRealm` isolating exactly that key and retired with `retireRealm` once the import is removed; a realm never changes, as core requires (core BEH-BR-145) ([BEH-FD-022](../behaviors/03-links-and-skew-handshake.md#beh-fd-022-each-import-has-its-own-peer-realm)).
- Each import is a remote proxy plugin of the remote companion, built with `Remote.define` for one contract major, with a mandatory timeout and no grants, installed by the federation reconcile; one proxy per (peer, key, major) ([BEH-FD-026](../behaviors/04-exports-and-imports.md#beh-fd-026-an-import-is-a-remote-proxy-plugin-installed-by-reconcile)).
- A link is one physical connection split by the remote companion's multiplexer into a control endpoint, owned by this package, and one remote session per import; exports are served with the remote companion's `Remote.serve`, one core lease per call.
- A peer's assertions (its host id, its actor, its digests) are claims; authentication is the transport's. A served call runs as the peer's service actor, with the asserted actor recorded as provenance.

## Alternatives considered

- **All imports in the default realm.** Rejected: two peers exporting one key would collide.
- **A realm per peer described as isolation.** Rejected: realms do not isolate; the code of a peer never runs locally anyway.
- **One realm per peer, isolating every key imported from it.** Rejected: realm options are fixed at definition, so a later import from the same peer could not be added without removing every import of that peer.
- **Peer realms as members of a `Realm.family`.** Rejected: family members get family-formed ids (core gap G47) and are created lazily, not the fixed id this decision needs.

## Consequences

**Positive**: several peers coexist; every local rule (leases, drain, legality) holds for imports because they are ordinary plugins.

**Negative**: a consumer in the default realm cannot see a peer realm's import; choosing among peers needs a provider selector that is not specified yet.

## References

- Behaviours: [03](../behaviors/03-links-and-skew-handshake.md), [04](../behaviors/04-exports-and-imports.md)
- Remote companion: [INV-RM-001](../../remote/invariants.md#inv-rm-001-a-remote-plugin-adds-no-state-operation-or-transition), [INV-RM-004](../../remote/invariants.md#inv-rm-004-a-stale-epoch-is-refused-at-the-boundary)
