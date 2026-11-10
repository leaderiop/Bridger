# ADR-BR-042: Lazy plugins are registered from their manifest and loaded on a trigger

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ADR-042                                              |
> | Revision       | 0.4                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed — amends ADR-BR-014, ADR-BR-027 and ADR-BR-029; amended by ADR-BR-050 |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.4 (2026-11-10): Status names the ADRs this one amends (ADR-BR-014, ADR-BR-027 and ADR-BR-029), pairing their "amended by" (C22) (CCR-BR-034)<br>0.3 (2026-11-08): Amended by ADR-BR-050 (CCR-BR-024)<br>0.2 (2026-11-08): the lazy definition's digest is supplied beside the manifest (`Plugin.lazy({ manifest, load, digest })`) and is its identity for loading, reconcile and the gate (CCR-BR-022)<br>0.1 (2026-11-08): Initial draft (CCR-BR-017) |

---

## Context

Every installed plugin is built as soon as its requirements are available. A host with many plugins, most of them rarely used — commands, report generators, integrations — pays for all of them at start, imports all their code, and must have all of it on hand. Plugin ecosystems that scale (VS Code activation events, OSGi lazy bundles) defer activation until something needs the plugin.

Deferral can be done outside core: a companion holds manifests, watches snapshots for a missing `ServiceId`, then imports and installs the plugin. That design fails three ways. Provider slots are not reserved, so another plugin can take the key meanwhile and the conflict appears at load. The install happens at a moment no operator chose, so the gate is consulted then — an approval demanded in the middle of a sale. And `reconcile` cannot hold an entry for a plugin that is not installed, so a desired list could not mention lazy plugins at all.

## Decision

- **`Plugin.lazy({ manifest, load })`** is a definition the host registers from its manifest alone ([27 — Manifest and lazy activation](../behaviors/27-manifest-and-lazy-activation.md), BEH-BR-244). `load` is an Effect the caller supplies — typically built by the loader companion, which checks digest and signatures before evaluating code. The digest that identifies the code is supplied beside the manifest (`digest` option; a manifest signed inside its own package cannot carry that package's digest) and, with the manifest's `version`, is the lazy definition's identity `meta`: the loaded definition's `meta.digest` must equal it, `reconcile` compares by it, and the gate request carries it.
- **A seventh state, `dormant`.** Registered, slots reserved from the manifest, cycles and contract ranges checked from the manifest, nothing loaded, nothing provided. A snapshot variant lists its triggers.
- **Three triggers.** `OnService` (implicit for each provided key: a dependent that is neither dormant nor disabled requires it, or `Host.wake` names it), `OnContribution` (implicit for each declared contribution, through `wake`) and `OnEvent` (declared; any dispatch of that event, without redelivery). Reads never trigger (BEH-BR-245).
- **Leaving `dormant` is a system transition**, recorded as `lazy-triggered` and not gated: the gated decision was the install or replace of the lazy definition with its manifest (BEH-BR-248).
- **Loading is part of the build step**: same slot, same `buildTimeout`, same in-flight rules. A load that fails, or a loaded definition that does not match its manifest, leaves the plugin `failed` with a new sticky phase, "load" (BEH-BR-246).
- **A total legality row for `dormant`**; every operation on a dormant plugin completes at once (BEH-BR-247).
- **Reconcile compares manifests without evaluating code** (BEH-BR-248).

## Alternatives considered

- **A companion-only lazy registry.** Rejected for the three failures above: unreserved slots, gating at load time, and no place in `reconcile`.
- **`dormant` as a flag on `waiting` or `disabled`.** Rejected: a dormant plugin may have nothing missing (unlike `waiting`) and holds its slots and starts without an operator (unlike `disabled`); a flag would recreate the impossible combinations [ADR-BR-014](../decisions/014-discriminated-plugin-snapshot.md) removed.
- **Trigger on `use` or `lease`.** Rejected: a read would become a lifecycle change with unbounded latency and no caller to attribute it to.
- **Buffer the triggering event.** Rejected: it would turn a fire-and-forget bus ([ADR-BR-020](../decisions/020-typed-event-bus.md)) into a queue for plugins that do not exist yet.
- **Gate the load.** Rejected: an approval demanded at an unpredictable moment, possibly in the middle of a user's task, is the failure the in-core design exists to avoid.
- **Return to `dormant` when idle.** Deferred (Open): it would deactivate behaviour but could not reclaim imported code (BEH-BR-008).

## Consequences

**Positive**:

- A host can register many plugins and load only what is used; a terminal can reconcile a list of plugins it has never loaded.
- Slots, cycles and contract ranges are decided at registration for lazy and eager plugins alike.
- Marketplaces and agents can discover what a host could do without loading it.

**Negative**:

- A seventh state widens the snapshot union, the legality table, the transition diagram and the audit record (`dormant`, `lazy-triggered`, phase "load", `trigger`).
- A plugin's first use pays its load and build latency; an application that cannot accept that installs it eagerly.
- A lazily loaded plugin runs in-process with full privileges, like an eager one; laziness is not isolation.

**Trade-off accepted**: a new state in core, at the cost of a wider legality table, because only the host can reserve slots, gate at the operator's moment and reconcile what it has not loaded.

## References

- Behaviours: [27 — Manifest and lazy activation](../behaviors/27-manifest-and-lazy-activation.md), [04 — States and snapshots](../behaviors/04-states-and-snapshots.md), [05 — Activation](../behaviors/05-activation.md), [08 — Operation legality](../behaviors/08-operation-legality.md), [18 — Reconciliation and confluence](../behaviors/18-reconciliation-and-confluence.md), [23 — Audit sink and record](../behaviors/23-audit-sink-and-record.md)
- Invariants: [INV-BR-032](../invariants.md#inv-br-032-a-dormant-plugin-has-run-none-of-its-code), [INV-BR-033](../invariants.md#inv-br-033-a-loaded-definition-is-published-only-if-it-matches-its-manifest), [INV-BR-034](../invariants.md#inv-br-034-comparing-and-checking-manifests-evaluates-no-plugin-code), [INV-BR-011](../invariants.md#inv-br-011-every-state-and-operation-pair-has-a-defined-outcome)
- Requirements: [URS-BR-031](../urs.md#urs-br-031-start-a-plugin-only-when-it-is-needed)
- Risks: [RSK-BR-026](../gxp/03-risk-assessment.md#rsk-br-026), [RSK-BR-017](../gxp/03-risk-assessment.md#rsk-br-017)
- Decisions: [ADR-BR-005](../decisions/005-failure-is-sticky.md), [ADR-BR-013](../decisions/013-total-operation-legality.md), [ADR-BR-014](../decisions/014-discriminated-plugin-snapshot.md), [ADR-BR-020](../decisions/020-typed-event-bus.md), [ADR-BR-027](../decisions/027-core-exclusions.md), [ADR-BR-032](../decisions/032-operation-gate.md), [ADR-BR-041](../decisions/041-manifest-as-data.md)
- Source: none in `docs/SPEC.md`; architecture review of 2026-11-08, gap item 4
- Precedent: VS Code activation events; OSGi lazy activation policy
- Amended by: [ADR-BR-050](./050-dormant-veto-and-hook-phases.md) — the triggering event of an `OnEvent` wake is held; idle return to `dormant`; root wake records carry `onBehalfOf` (CCR-BR-024).
