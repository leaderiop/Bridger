# ADR-FD-007: A cap on offline duration, and snapshot re-bootstrap

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-FD-ADR-007                                            |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.2 (2026-11-08): resolutions of the agent review of 2026-11-08 — the cap runs from a stored first activation when no contact was made; re-bootstrap suspends links instead of closing admission (R3-20, R3-25) (CCR-FD-002)<br>0.1 (2026-11-08): Initial draft (CCR-FD-001)                 |

---

## Context

A host must keep working offline, but unbounded offline operation means a kill entry may never arrive, the clock may drift unobserved, and the backlog of application data grows until reconnecting causes a replay storm against the authority and peers (review §9).

## Decision

- A host boots from the last verified manifest it stored, and keeps running it offline ([BEH-FD-010](../behaviors/02-sync-offline-and-rebootstrap.md#beh-fd-010-boot-applies-the-highest-verified-manifest-else-the-boot-bundle)).
- Freshness: past `validUntil`, or past `maxOffline` (default 72 hours) since the last contact — or, with no contact ever, since the first activation stored in the `ManifestStore` — the manifest is stale and the entries marked `requiresFresh` are disabled; nothing else changes. A clock earlier than known times is treated as stale.
- After the cap, or on the authority's `ResyncRequired`, the host re-bootstraps from a snapshot through an application `Rebootstrap` port before applying newer state; every link is suspended meanwhile, so imports wait as on a partition and exports serve nothing, with no host operation ([BEH-FD-014](../behaviors/02-sync-offline-and-rebootstrap.md#beh-fd-014-a-host-too-far-behind-re-bootstraps-from-a-snapshot)).

## Alternatives considered

- **Halt the host at the cap.** Rejected as a default: stopping sales or operations is the application's call, expressible with `requiresFresh` on the relevant entries.
- **Replay everything on reconnect.** Rejected: unbounded load; desired state never needs it (manifests are complete), and data is cheaper to snapshot past a horizon.

## Consequences

**Positive**: bounded exposure to missed kills and drift; predictable reconnect cost.

**Negative**: the snapshot's content and transfer are the application's; a host without a `Rebootstrap` stays in `resync-required`.

## References

- Behaviours: [02](../behaviors/02-sync-offline-and-rebootstrap.md)
- Bus companion: [references/durable-bus/](../../durable-bus/README.md) (replay horizon)
