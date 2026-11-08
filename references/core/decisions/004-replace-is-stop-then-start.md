# ADR-BR-004: Replace is stop-then-start with no rollback

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ADR-004                                              |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.2 (2026-11-08): In-memory state can cross a replace through a declared handoff (CCR-BR-019)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001) |
---

## Context

`replace` swaps the definition of an installed plugin under the same ID: a hot reload, an upgrade, a configuration-schema change. Two shapes are possible. **Build-then-swap** builds the new definition beside the running one and switches dependents over when it succeeds. **Stop-then-start** stops the old activation (dependents first), swaps the definition, and builds the new one.

Build-then-swap looks safer but cannot be had here. The new activation would provide the same keys as the old one while both run, which is two providers of one key ([ADR-BR-003](../decisions/003-one-provider-per-key-per-realm.md)). Dependents captured the old provider's identity, so they would have to stop and restart against the new one anyway. And "keep the old one if the new build fails" means the old one was never stopped, so a definition whose build has side effects (a migration, a registration with an external system) would have run both builds.

A failed new build then raises the rollback question: should the host restore the previous definition? Restoring means running the old build again, which is an automatic retry of a build with its own side effects ([ADR-BR-005](../decisions/005-failure-is-sticky.md)), and rollback across external effects is not something a host can promise.

## Decision

`replace` is **explicit stop-then-start with no rollback** (SPEC.md "API decisions" row 2):

1. **Check before stop.** The new definition is checked with the `install` checks against the installed set *excluding the old definition of that ID*. A rejected definition fails with `ReplaceError { id, cause: InstallError }` and leaves the running plugin untouched. Nothing is stopped first.
2. **Stop.** Dependents stop first, then the old activation drains its leases (bounded by `drain`; `force` as for `remove`) and closes its scope.
3. **Swap and start.** The definition is swapped; the plugin starts when its (possibly changed) requirements are available and otherwise waits.
4. **Failure.** If the new build fails, the plugin is `failed` with the *new* definition. The old definition is not retained. A caller wanting rollback calls `replace(previous)` itself.
5. **Changed keys.** A key the old definition provided and the new one does not becomes unavailable; its dependents go `waiting` with it in `missingServiceIds`. A key the new definition adds is subject to `DuplicateProvider`. Changed `requires` are evaluated afresh.
6. **Configuration override.** A `reconfigure` override held for the ID is dropped by `replace`, because the new definition may have a different configuration schema ([ADR-BR-018](../decisions/018-configuration-decoded-before-build.md)).
7. **Disabled.** `replace` of a `disabled` plugin swaps the definition and leaves it disabled.

Hosts that must switch several behaviours without a gap use `Generation`, which publishes the new value before the old one drains ([ADR-BR-024](../decisions/024-shared-state-helpers.md)).

## Alternatives considered

- **Build-then-swap.** Rejected: two providers of one key, dependents restart regardless, and both builds' side effects run.
- **Automatic rollback to the previous definition on failure.** Rejected: it is a silent re-run of a build, contradicting [ADR-BR-005](../decisions/005-failure-is-sticky.md), and it implies a reversal of external effects the host cannot perform.
- **Checking after stop.** Rejected: an invalid definition would take the working plugin down and leave nothing running.
- **Keeping the override across `replace`.** Rejected: an override checked against the old schema may not decode under the new one.

## Consequences

**Positive**:

- One provider per key holds through the whole replacement.
- A malformed replacement is refused with the running plugin intact.
- The outcome of a failed replace is visible state, not a hidden recovery.

**Negative**:

- Between stop and start the plugin's services are unavailable and its dependents restart, even when the new build succeeds.
- A failed replace leaves the plugin `failed` until someone acts.

**Trade-off accepted**: a visible availability gap and an operator-driven rollback, in exchange for never running two providers of one key and never silently re-running a build.

**Amendments (2026-11-08)**:

- In-memory state can cross a replace through a declared handoff, without overlapping activations ([ADR-BR-049](../decisions/049-state-handoff-on-replace.md)).

## References

- Behaviours: [06 — Removal](../behaviors/06-removal.md), [07 — Replacement and reactivation](../behaviors/07-replacement-and-reactivation.md), [08 — Operation legality](../behaviors/08-operation-legality.md), [20 — Generation](../behaviors/20-generation.md)
- Invariants: [INV-BR-001](../invariants.md#inv-br-001-one-provider-per-service-key-per-realm), [INV-BR-004](../invariants.md#inv-br-004-no-stale-build-is-published), [INV-BR-005](../invariants.md#inv-br-005-dependents-stop-before-their-providers), [INV-BR-012](../invariants.md#inv-br-012-a-definition-error-registers-nothing)
- Risks: [RSK-BR-003](../gxp/03-risk-assessment.md#rsk-br-003)
- Decisions: [ADR-BR-003](../decisions/003-one-provider-per-key-per-realm.md), [ADR-BR-005](../decisions/005-failure-is-sticky.md), [ADR-BR-013](../decisions/013-total-operation-legality.md), [ADR-BR-024](../decisions/024-shared-state-helpers.md), [ADR-BR-049](../decisions/049-state-handoff-on-replace.md)
- Source: `docs/SPEC.md` — "Host interface" (`replace` paragraphs), "API decisions" row 2, "Generations"
