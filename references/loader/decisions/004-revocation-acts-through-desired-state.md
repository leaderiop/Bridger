# ADR-LD-004: Revocation acts through desired state and reconcile

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-LD-ADR-004                                           |
> | Revision       | 0.6                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.6 (2026-11-11): Decision: no run judges a withdrawn catalog acceptance's digest "verification-unknown" (L2) (SPEC-AUDIT-08) (CCR-LD-011)<br>0.5 (2026-11-11): The scope's plugins are those core reports owned by it; the kill switch is not run for a catalog withdrawal; `drain` and `force` are `KillSwitch.run` options (L1, L4, PL15) (SPEC-AUDIT-07); follow-up: plugins outside the scope are reported, never removed or counted (SPEC-AUDIT-07 residual) (CCR-LD-010)<br>0.4 (2026-11-11): A revocation removes the dropped installed plugins with `Host.remove` instead of reconciling (H6) (SPEC-AUDIT-06) (CCR-LD-009)<br>0.3 (2026-11-11): A digest whose dependence on a revoked signer cannot be ruled out is dropped unless pinned or exempt by digest (PL17); the revocation reconcile keeps every entry still installed (H8) (SPEC-AUDIT-05) (CCR-LD-008)<br>0.2 (2026-11-08): The kill switch is its scope's one reconciler, with separate actors for revocation removals and desired-list changes; signers revoked by identity (CCR-LD-002)<br>0.1 (2026-11-08): Initial draft (CCR-LD-001)                 |

---

## Context

A kill switch per digest must stop a defective or compromised release on every host that runs it, including hosts that are offline for a while. Core already has a declarative path for changing the plugin set — `reconcile` over a desired list, with ownership scopes, per-entry gating and per-entry audit records ([ADR-BR-023](../../core/decisions/023-desired-state-reconcile.md)) — and a gate that cannot be bypassed through the host ([ADR-BR-032](../../core/decisions/032-operation-gate.md)).

## Decision

- Revocation is delivered as signed, monotonically numbered sets of revoked digests and signers, persisted by the application's store and re-verified at start ([04 — Revocation and Kill Switch](../behaviors/04-revocation-and-kill-switch.md), BEH-LD-025, BEH-LD-026).
- Loads check revocation; a set older than an explicitly stated `maxAge` refuses new loads (BEH-LD-027).
- The kill switch is `Revocation.filterDesired` followed by `Host.reconcile` for desired-list changes, and is the only reconciler of its scope. Removals caused by a revocation are attributed to an application-named revocation actor, with a reason naming the revision; desired-list changes are attributed to the application's own actor and name no revocation; incomplete entries are reported and retried (BEH-LD-028, BEH-LD-029). A revocation does not reconcile: the kill switch calls `Host.remove` for each installed plugin of its scope whose digest the new set drops, so its only actions are the removals of the dropped entries and an operator's direct changes stay in place (BEH-LD-029). The scope's plugins are those core reports owned by the scope (`PluginSnapshot.scope`); the kill switch judges them at start, at each revocation change and at each load-record or pinned change of `AcceptedDigests`, never for a catalog withdrawal, which reaches the plugin set through the desired list under the application's actor, and no run judges a digest whose catalog acceptance was withdrawn "verification-unknown" (the store keeps it, withdrawn) (BEH-LD-029). Signers are revoked by identity, and a digest whose dependence on a revoked signer cannot be ruled out is dropped, unless the acceptance rule pins it or `LoaderGate` exempts it by digest (BEH-LD-025, BEH-LD-028, BEH-LD-030).
- Plugins outside the kill switch's scope are reported, with their scope and dropped digest, never removed and never counted against the blast-radius cap; revoked code still resident is reported (BEH-LD-031).
- The kill switch changes the plugin set only through `Host.reconcile` and `Host.remove`: gated, drained and audited like any operator change (BEH-LD-032).

## Alternatives considered

- **A privileged removal path for revocations.** Rejected: the most powerful path would be the least reviewed; it would also cut in-flight calls and leave no ordinary records.
- **Disable instead of remove.** Deferred (Open in file 04): useful for data that must stay readable, but it needs the manifest to say so.
- **Stop all plugins when the revocation set is stale.** Rejected: staleness is a reason not to load new code, not evidence that running code is revoked.

## Consequences

**Positive**:

- A revocation leaves the same records as an operator's removal, and the trail says which revision removed which digest.
- The kill switch inherits reconcile's idempotence and ownership rules for desired-list changes; its revocation removals are ordinary removals.

**Negative**:

- A wired gate can delay a revocation; the application must decide whether its gate allows kill-switch removals without a human.
- A drain limit can delay a revocation; `drain` and `force` for revocations are the application's explicit choice, given to `KillSwitch.run` and passed as the `RemoveOptions` of every removal (BEH-LD-032).

**Trade-off accepted**: a kill switch that is no stronger than an operator's removal, so that it is never a back door.

## References

- Behaviours: [04 — Revocation and Kill Switch](../behaviors/04-revocation-and-kill-switch.md), [05 — Catalog and Lazy Loading](../behaviors/05-catalog-and-lazy-loading.md)
- Invariants: [INV-LD-004](../invariants.md#inv-ld-004-a-revoked-digest-is-never-newly-loaded), [INV-LD-005](../invariants.md#inv-ld-005-the-kill-switch-acts-only-through-hostreconcile-and-hostremove)
- Core: [ADR-BR-023](../../core/decisions/023-desired-state-reconcile.md), [ADR-BR-029](../../core/decisions/029-attributable-mutations.md), [ADR-BR-032](../../core/decisions/032-operation-gate.md)
