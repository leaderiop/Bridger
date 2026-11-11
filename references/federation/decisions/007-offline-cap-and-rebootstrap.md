# ADR-FD-007: A cap on offline duration, and snapshot re-bootstrap

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-FD-ADR-007                                            |
> | Revision       | 0.7                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.7 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-06) — a delivery import has no dependent: the relay reaches it through an optional key at each send and the projection drops manifest dependents (H7, H8) (CCR-FD-009)<br>0.6 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-05) — a retry with links suspended moves only the delivery imports' links to `delivery-only`, by import id and with the relay as only dependent; the marker records that an install began (H4, H6, F2, F3, PL8) (CCR-FD-008)<br>0.5 (2026-11-10): Specification audit of 2026-11-10 (SPEC-AUDIT-04) — links stay up in step 1 of a first attempt only; a retry after a failed install keeps them suspended and reopens only the `deliveryImports` (F2, F3) (CCR-FD-007)<br>0.4 (2026-11-08): Round-2 agent review (R4 F8–F11) — links suspended only for fetch and install; guarded install; persisted marker and separate retry backoff (CCR-FD-003)<br>0.3 (2026-11-08): round 2: recheck items 18 and 19 (X10) — fixed re-bootstrap order with the outbox first; the cap never delays a kill (CCR-FD-003)<br>0.2 (2026-11-08): resolutions of the agent review of 2026-11-08 — the cap runs from a stored first activation when no contact was made; re-bootstrap suspends links instead of closing admission (R3-20, R3-25) (CCR-FD-002)<br>0.1 (2026-11-08): Initial draft (CCR-FD-001)                 |

---

## Context

A host must keep working offline, but unbounded offline operation means a kill entry may never arrive, the clock may drift unobserved, and the backlog of application data grows until reconnecting causes a replay storm against the authority and peers (review §9).

## Decision

- A host boots from the last verified manifest it stored, and keeps running it offline ([BEH-FD-010](../behaviors/02-sync-offline-and-rebootstrap.md#beh-fd-010-boot-applies-the-highest-verified-manifest-else-the-boot-bundle)).
- Freshness: past `validUntil`, or past `maxOffline` (default 72 hours) since the last contact — or, with no contact ever, since the first activation stored in the `ManifestStore` — the manifest is stale and the entries marked `requiresFresh` are disabled; nothing else changes. A clock earlier than known times is treated as stale.
- After the cap, or on the authority's `ResyncRequired`, the host re-bootstraps from a snapshot through an application `Rebootstrap` port before applying newer state; every link is suspended during the fetch and the install (control endpoints stay open for kill frames), so imports wait as on a partition and exports serve nothing, with no host operation ([BEH-FD-014](../behaviors/02-sync-offline-and-rebootstrap.md#beh-fd-014-a-host-too-far-behind-re-bootstraps-from-a-snapshot-outbox-first)).
- The re-bootstrap order is fixed: (1) push or keep the outbox, links up on a first attempt (a retry that starts with links suspended moves only the links of the imports `deliveryImports` names, by import id, to `delivery-only`, so that the outbox can still be pushed; no plugin may depend on such an import — the relay reaches it through an optional key at each send, and the projection drops a manifest plugin that requires it), (2) suspend links and fetch the snapshot, (3) install through the outbox port's guarded settlement and apply the latest manifest, (4) resume links. A failure in step 1 stops it before anything is fetched, with `RebootstrapBlocked` and no fact dropped; on a first attempt no link is suspended, and on a retry after a failed install links stay suspended. Each step is persisted in a marker, which also records that an install began (`installAttempted`), so that no retry, step-2 failure or restart resumes links over half-replaced state; retries back off on their own schedule ([BEH-FD-048](../behaviors/06-kill-path-placement-and-skew.md#beh-fd-048-pending-kills-the-last-applied-manifest-and-the-re-bootstrap-marker-are-kept-in-the-store)).
- The cap never delays a kill: revocation lists travel on their own channel and are applied at once, and a pending re-bootstrap gets a kill-only apply of a newer manifest's kill entries ([ADR-FD-009](./009-revocation-travels-apart-from-desired-state.md), [BEH-FD-042](../behaviors/06-kill-path-placement-and-skew.md#beh-fd-042-a-revocation-list-is-applied-at-once-before-re-bootstrap-and-before-any-manifest)).

## Alternatives considered

- **Halt the host at the cap.** Rejected as a default: stopping sales or operations is the application's call, expressible with `requiresFresh` on the relevant entries.
- **Replay everything on reconnect.** Rejected: unbounded load; desired state never needs it (manifests are complete), and data is cheaper to snapshot past a horizon.

## Consequences

**Positive**: bounded exposure to drift and to unconfirmed desired state; kills unaffected by the cap; offline facts never traded for a snapshot; predictable reconnect cost.

**Negative**: the snapshot's content and transfer are the application's; a host without a `Rebootstrap` stays in `resync-required`; a host whose outbox cannot be pushed or kept stays `rebootstrap-blocked`.

## References

- Behaviours: [02](../behaviors/02-sync-offline-and-rebootstrap.md)
- Bus companion: [references/durable-bus/](../../durable-bus/README.md) (replay horizon)
