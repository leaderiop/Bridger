# ADR-FD-009: Revocation travels apart from desired state

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-FD-ADR-009                                           |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.2 (2026-11-08): Round-2 agent review (R3-01; R4 F1, F4, F5) — lists verified only by the loader's revocation source; blast-radius cap; pending kills; reach restated as the topology or the source feed, limits stated (CCR-FD-003)<br>0.1 (2026-11-08): Initial draft — round 2: recheck item 18, contradiction X10 (CCR-FD-003) |

---

## Context

Revision 0.3 made the kill switch a manifest entry, with "no separate push
channel whose loss would silently disable it". But a manifest waits: behind
the sync interval, behind the offline cap (after which the first contact
needs a re-bootstrap before any newer manifest), and behind a re-bootstrap
that may fail for days. A kill issued for a defective or compromised release
could therefore wait forever on exactly the hosts that were offline longest
(recheck 2026-11-08, X10). Meanwhile core gained a `RefusalList` port that
keeps a refused digest from starting, system starts included (core
BEH-BR-267), and the loader already defines signed, monotonic revocation
lists.

## Decision

- A revocation list is a signed statement of its own (the loader's
  `SignedRevocationList`), verified, ordered and persisted only by the
  loader's `RevocationSource` under its own trust root; kill-frame lists
  reach it through `RevocationSource.offer`.
- It reaches a host on its own channels: the loader's `RevocationSource`
  (any feed the application wires) and a `kill` frame on every federation
  link, with one schema across protocol versions, relayed hub to terminal
  ([BEH-FD-041](../behaviors/06-kill-path-placement-and-skew.md#beh-fd-041-revocation-lists-travel-on-their-own-channel-and-are-verified-as-signed-statements), [BEH-FD-043](../behaviors/06-kill-path-placement-and-skew.md#beh-fd-043-revocation-lists-are-relayed-on-links)).
- It is applied at once, in any state, before a re-bootstrap and before any
  manifest: an attributed `disable` per owned plugin, the `RefusalList`
  keeping it down, removal at the next apply, with a per-revision cap and an
  attributed release as the loader's kill switch has. Manifest kill entries
  reach a host waiting for a re-bootstrap through a kill-only apply, kept as
  pending kills in the store until a full apply
  ([BEH-FD-042](../behaviors/06-kill-path-placement-and-skew.md#beh-fd-042-a-revocation-list-is-applied-at-once-before-re-bootstrap-and-before-any-manifest)).

## Alternatives considered

- **Keep kills in manifests only, and exempt kill entries from the cap.**
  Rejected: the manifest still has to reach the host, which needs the
  authority; a hub cannot relay a manifest signed for another host.
- **Apply revocation through a reconcile.** Rejected for the immediate path:
  a reconcile needs a desired list, and building one while desired state is
  unconfirmed would carry changes nobody reviewed. `disable` touches only the
  revoked plugins.
- **Unsigned kill frames from trusted peers.** Rejected: a peer's word is a
  claim (BEH-FD-023); the issuer's signature makes the courier irrelevant.

## Consequences

**Positive**: a kill reaches every host linked by the applied manifest's
topology or fed by its `RevocationSource`, whatever its freshness or
re-bootstrap state; one store and one ordering for every list.

**Limits**: an `unprovisioned` host has no links and depends on its
`RevocationSource` feed; a revision held by the blast-radius guard waits for
a person's release.

**Negative**: two kill paths to explain (list by digest, entry by id); an
urgent id-based kill must be issued as a digest list to take the fast path.

## References

- Behaviours: [06](../behaviors/06-kill-path-placement-and-skew.md), [01](../behaviors/01-host-manifest.md) (BEH-FD-007)
- Loader: [04 — Revocation and kill switch](../../loader/behaviors/04-revocation-and-kill-switch.md)
- Core: [28 — Plugin principal and mandatory policy](../../core/behaviors/28-plugin-principal-and-mandatory-policy.md) (BEH-BR-267)
