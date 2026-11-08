# ADR-FD-001: Federation is a companion layered on reconcile

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-FD-ADR-001                                            |
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

A fleet of hosts needs each host to run what a central authority decides. The core already has a declarative mechanism — `reconcile` with ownership by scope and `Desired.overlay` ([ADR-BR-023](../../core/decisions/023-desired-state-reconcile.md)) — and already attributes, gates and audits each change it makes. The alternatives are a new host operation ("apply manifest"), a second lifecycle for remote plugins, or a companion that drives the existing one.

## Decision

- `@bridger/federation` is a companion package. It is one plugin that requires `Bridger.Host` and applies each manifest as exactly one `reconcile` call under the scope `federation:<authority>` and the actor `federation:<authority>` ([BEH-FD-008](../behaviors/01-host-manifest.md#beh-fd-008-a-manifest-is-applied-through-one-attributed-reconcile)).
- It adds no host operation, no plugin state and no transition. Imports are remote proxy plugins installed by that reconcile; exports are served from providers the core resolves, under core leases.
- Its build reads local state only; sync, links and applies run in background fibers, so no host transition waits on the network.

## Alternatives considered

- **A core `applyManifest` operation.** Rejected: it would duplicate reconcile, enlarge the `Host` interface, and bring signatures and networking into core against [ADR-BR-027](../../core/decisions/027-core-exclusions.md).
- **A separate lifecycle for remote plugins.** Rejected: it would break the legality table's totality and the review's rule that a remote plugin is a local proxy plugin.

## Consequences

**Positive**:

- Every manifest change inherits the core's attribution, gate, audit, legality and convergence ([INV-BR-021](../../core/invariants.md#inv-br-021-reconcile-is-idempotent)).
- A host without federation is unaffected.

**Negative**:

- A manifest is applied entry by entry, not atomically; a partially applied manifest is visible in the reconcile report and converges at the next apply.
- The federation plugin cannot manage itself or its providers (BEH-FD-008).

**Trade-off accepted**: per-entry convergence instead of an atomic switch, because reconcile already defines it and the review asks for no new core operation.

## References

- Behaviours: [01 — Host manifest](../behaviors/01-host-manifest.md), [02 — Sync, offline and re-bootstrap](../behaviors/02-sync-offline-and-rebootstrap.md), [04 — Exports and imports](../behaviors/04-exports-and-imports.md)
- Invariants: [INV-FD-008](../invariants.md#inv-fd-008-no-host-transition-waits-on-the-network)
- Core: [18 — Reconciliation and confluence](../../core/behaviors/18-reconciliation-and-confluence.md), [ADR-BR-023](../../core/decisions/023-desired-state-reconcile.md), [ADR-BR-032](../../core/decisions/032-operation-gate.md)
