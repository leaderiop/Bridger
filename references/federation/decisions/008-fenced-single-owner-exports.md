# ADR-FD-008: Fenced single-owner exports against split-brain

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-FD-ADR-008                                            |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.2 (2026-11-08): resolutions of the agent review of 2026-11-08 — fences checked per link by closing superseded endpoints; consequence: a fence does not stop a deposed owner, single-writer effects check the fence where they land (R3-01, R3-26) (CCR-FD-002)<br>0.1 (2026-11-08): Initial draft (CCR-FD-001)                 |

---

## Context

Some exported services must have exactly one owner (a site hub that orders events, say). After a partition, an old owner may come back unaware it was replaced, and importers could act on two owners (split-brain on exports, review §9).

## Decision

- A single-owner export carries an `ExportFence { scope, owner, token }` issued by the authority only. Tokens rise strictly per (key, scope) each time ownership moves ([BEH-FD-028](../behaviors/04-exports-and-imports.md#beh-fd-028-a-single-owner-export-carries-a-fence)).
- Importers remember the highest token per (key, scope), refuse lower tokens on offers with `StaleExport`, and close the endpoint of a superseded owner before recording a higher token, so no later reply from it is delivered; equal tokens from two owners raise `ExportConflict` and stop the import until a higher token arrives ([BEH-FD-029](../behaviors/04-exports-and-imports.md#beh-fd-029-importers-refuse-stale-fences-and-stop-on-equal-ones)).
- No automatic takeover: ownership moves only with a manifest.

## Alternatives considered

- **Leases with timeouts between peers.** Rejected: needs synchronised clocks the package does not assume.
- **Peer election.** Rejected: no quorum on small sites ([ADR-FD-002](./002-authority-is-the-only-source-of-desired-state.md)).

## Consequences

**Positive**: an importer never delivers a result from a deposed owner whose fence it knows to be stale.

**Negative**: an importer that has seen neither the new manifest nor any offer with the new token still trusts the old owner; the window closes at the first message carrying the new token. A fence protects each importer, not the owner side: a deposed owner keeps serving the importers that have not yet learnt of the change while the new owner serves the others, so two owners can be live at once for different importers. An effect that needs one writer must check the fence where it lands (the owner's storage), which is the application's job. Effects already executed by a deposed owner are reported, not undone.

## References

- Behaviours: [04](../behaviors/04-exports-and-imports.md)
- Invariants: [INV-FD-007](../invariants.md#inv-fd-007-stale-epochs-and-stale-fences-are-refused-at-the-boundary)
