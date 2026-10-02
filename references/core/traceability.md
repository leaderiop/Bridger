# Traceability

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-TRACE                                                |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Traceability Matrix                                          |
> | Change History | 0.2 (2026-10-02): Regenerated after consistency fixes; REQ-BR-042 added (CCR-BR-002)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001) |

---

## Traceability chain

```
  URS-BR / NFR-BR ──► BEH-BR ──► INV-BR ──► source (Planned)
         │              │  ▲         │
         │              │  └ ADR-BR  └──► test (Planned)
         │              ▼
         │           REQ-BR (acceptance scenario, Planned) ──► executed evidence (none yet)
         ▼
  RSK-BR ──► control (BEH/INV) ──► verification (REQ/test)
  Regulatory clause ──► allocation (Core/Companion/Consumer) ──► BEH/INV/ADR
```

Nothing is implemented. Every source and test path below is marked *(Planned)*;
`scripts/verify-traceability.sh` fails if a path marked Planned exists, so the
marking cannot silently go stale. A row in this matrix is a commitment, not
evidence ([ADR-BR-036](decisions/036-prospective-specification.md)).

User requirements trace forward to behaviours in [urs.md §6](urs.md#6-traceability).
This document carries the rest of the chain.

## §1 Behaviour to source

| Behaviours | File | Planned source |
| --- | --- | --- |
| BEH-BR-001–008 | [01-plugin-definition.md](behaviors/01-plugin-definition.md) | `packages/core/src/Plugin.ts` *(Planned)* |
| BEH-BR-009–016 | [02-host-construction.md](behaviors/02-host-construction.md) | `packages/core/src/Bridger.ts` *(Planned)*, `packages/core/src/Host.ts` *(Planned)* |
| BEH-BR-017–024 | [03-installation.md](behaviors/03-installation.md) | `packages/core/src/Host.ts` *(Planned)*, `packages/core/src/Resolver.ts` *(Planned)* |
| BEH-BR-025–032 | [04-states-and-snapshots.md](behaviors/04-states-and-snapshots.md) | `packages/core/src/Snapshot.ts` *(Planned)* |
| BEH-BR-033–040 | [05-activation.md](behaviors/05-activation.md) | `packages/core/src/Lifecycle.ts` *(Planned)*, `packages/core/src/Resolver.ts` *(Planned)* |
| BEH-BR-041–048 | [06-removal.md](behaviors/06-removal.md) | `packages/core/src/Lifecycle.ts` *(Planned)* |
| BEH-BR-049–062 | [07-replacement-and-reactivation.md](behaviors/07-replacement-and-reactivation.md) | `packages/core/src/Lifecycle.ts` *(Planned)* |
| BEH-BR-065–077 | [08-operation-legality.md](behaviors/08-operation-legality.md) | `packages/core/src/Legality.ts` *(Planned)*, `packages/core/src/Lifecycle.ts` *(Planned)* |
| BEH-BR-081–088 | [09-leases.md](behaviors/09-leases.md) | `packages/core/src/Lease.ts` *(Planned)* |
| BEH-BR-089–096 | [10-runtime-failure-and-health.md](behaviors/10-runtime-failure-and-health.md) | `packages/core/src/PluginRuntime.ts` *(Planned)*, `packages/core/src/Health.ts` *(Planned)* |
| BEH-BR-097–104 | [11-configuration.md](behaviors/11-configuration.md) | `packages/core/src/Config.ts` *(Planned)* |
| BEH-BR-105–112 | [12-shutdown-and-hosting.md](behaviors/12-shutdown-and-hosting.md) | `packages/core/src/Host.ts` *(Planned)*, `packages/core/src/Shutdown.ts` *(Planned)* |
| BEH-BR-113–120 | [13-observability-and-diagnostics.md](behaviors/13-observability-and-diagnostics.md) | `packages/core/src/Events.ts` *(Planned)*, `packages/core/src/Inspect.ts` *(Planned)* |
| BEH-BR-121–128 | [14-children-and-groups.md](behaviors/14-children-and-groups.md) | `packages/core/src/PluginRuntime.ts` *(Planned)* |
| BEH-BR-129–136 | [15-optional-and-reactive.md](behaviors/15-optional-and-reactive.md) | `packages/core/src/PluginRuntime.ts` *(Planned)* |
| BEH-BR-137–144 | [16-event-bus.md](behaviors/16-event-bus.md) | `packages/core/src/EventBus.ts` *(Planned)* |
| BEH-BR-145–152 | [17-realms-and-interception.md](behaviors/17-realms-and-interception.md) | `packages/core/src/Realm.ts` *(Planned)* |
| BEH-BR-153–160 | [18-reconciliation-and-confluence.md](behaviors/18-reconciliation-and-confluence.md) | `packages/core/src/Reconcile.ts` *(Planned)* |
| BEH-BR-161–168 | [19-contribution-registry.md](behaviors/19-contribution-registry.md) | `packages/core/src/ContributionRegistry.ts` *(Planned)* |
| BEH-BR-169–176 | [20-generation.md](behaviors/20-generation.md) | `packages/core/src/Generation.ts` *(Planned)* |
| BEH-BR-177–184 | [21-testing-host.md](behaviors/21-testing-host.md) | `packages/core/src/testing/TestHost.ts` *(Planned)* |
| BEH-BR-185–192 | [22-attributable-operations.md](behaviors/22-attributable-operations.md) | `packages/core/src/Attribution.ts` *(Planned)* |
| BEH-BR-193–208 | [23-audit-sink-and-record.md](behaviors/23-audit-sink-and-record.md) | `packages/core/src/Audit.ts` *(Planned)* |
| BEH-BR-209–216 | [24-time-ids-and-sequence.md](behaviors/24-time-ids-and-sequence.md) | `packages/core/src/AuditSequence.ts` *(Planned)*, `packages/core/src/IdGenerator.ts` *(Planned)* |
| BEH-BR-217–224 | [25-operation-gate.md](behaviors/25-operation-gate.md) | `packages/core/src/OperationGate.ts` *(Planned)* |

## §2 Invariant traceability

| Invariant | Enforced by behaviours | Planned verification |
| --- | --- | --- |
| [INV-BR-001](invariants.md#inv-br-001-one-provider-per-service-key-per-realm) | [BEH-BR-012](behaviors/02-host-construction.md), [BEH-BR-019](behaviors/03-installation.md), [BEH-BR-051](behaviors/07-replacement-and-reactivation.md), [BEH-BR-061](behaviors/07-replacement-and-reactivation.md), [BEH-BR-062](behaviors/07-replacement-and-reactivation.md), [BEH-BR-122](behaviors/14-children-and-groups.md), [BEH-BR-147](behaviors/17-realms-and-interception.md) | scenario tests *(Planned)* |
| [INV-BR-002](invariants.md#inv-br-002-the-dependency-graph-is-acyclic-per-resolution-scope) | [BEH-BR-020](behaviors/03-installation.md), [BEH-BR-052](behaviors/07-replacement-and-reactivation.md), [BEH-BR-062](behaviors/07-replacement-and-reactivation.md), [BEH-BR-148](behaviors/17-realms-and-interception.md) | scenario tests *(Planned)* |
| [INV-BR-003](invariants.md#inv-br-003-publication-is-atomic) | [BEH-BR-033](behaviors/05-activation.md), [BEH-BR-037](behaviors/05-activation.md), [BEH-BR-097](behaviors/11-configuration.md), [BEH-BR-124](behaviors/14-children-and-groups.md), [BEH-BR-170](behaviors/20-generation.md) | scenario tests *(Planned)* |
| [INV-BR-004](invariants.md#inv-br-004-no-stale-build-is-published) | [BEH-BR-039](behaviors/05-activation.md) | property test over random operation histories *(Planned)* |
| [INV-BR-005](invariants.md#inv-br-005-dependents-stop-before-their-providers) | [BEH-BR-035](behaviors/05-activation.md), [BEH-BR-043](behaviors/06-removal.md), [BEH-BR-044](behaviors/06-removal.md), [BEH-BR-051](behaviors/07-replacement-and-reactivation.md), [BEH-BR-094](behaviors/10-runtime-failure-and-health.md), [BEH-BR-101](behaviors/11-configuration.md), [BEH-BR-105](behaviors/12-shutdown-and-hosting.md), [BEH-BR-121](behaviors/14-children-and-groups.md), [BEH-BR-124](behaviors/14-children-and-groups.md), [BEH-BR-133](behaviors/15-optional-and-reactive.md) | property test over random operation histories *(Planned)* |
| [INV-BR-006](invariants.md#inv-br-006-a-leased-provider-does-not-close-under-its-lease) | [BEH-BR-042](behaviors/06-removal.md), [BEH-BR-043](behaviors/06-removal.md), [BEH-BR-076](behaviors/08-operation-legality.md), [BEH-BR-081](behaviors/09-leases.md), [BEH-BR-082](behaviors/09-leases.md), [BEH-BR-086](behaviors/09-leases.md), [BEH-BR-094](behaviors/10-runtime-failure-and-health.md), [BEH-BR-131](behaviors/15-optional-and-reactive.md), [BEH-BR-133](behaviors/15-optional-and-reactive.md), [BEH-BR-152](behaviors/17-realms-and-interception.md), [BEH-BR-166](behaviors/19-contribution-registry.md), [BEH-BR-172](behaviors/20-generation.md), [BEH-BR-176](behaviors/20-generation.md) | property test over random operation histories *(Planned)* |
| [INV-BR-007](invariants.md#inv-br-007-failure-is-sticky) | [BEH-BR-021](behaviors/03-installation.md), [BEH-BR-024](behaviors/03-installation.md), [BEH-BR-031](behaviors/04-states-and-snapshots.md), [BEH-BR-046](behaviors/06-removal.md), [BEH-BR-053](behaviors/07-replacement-and-reactivation.md), [BEH-BR-055](behaviors/07-replacement-and-reactivation.md), [BEH-BR-056](behaviors/07-replacement-and-reactivation.md), [BEH-BR-071](behaviors/08-operation-legality.md), [BEH-BR-073](behaviors/08-operation-legality.md), [BEH-BR-096](behaviors/10-runtime-failure-and-health.md), [BEH-BR-160](behaviors/18-reconciliation-and-confluence.md) | scenario tests *(Planned)* |
| [INV-BR-008](invariants.md#inv-br-008-snapshot-revisions-never-regress) | [BEH-BR-029](behaviors/04-states-and-snapshots.md), [BEH-BR-030](behaviors/04-states-and-snapshots.md), [BEH-BR-165](behaviors/19-contribution-registry.md) | property test over random operation histories *(Planned)* |
| [INV-BR-009](invariants.md#inv-br-009-at-most-one-transition-in-flight-per-plugin) | [BEH-BR-026](behaviors/04-states-and-snapshots.md), [BEH-BR-065](behaviors/08-operation-legality.md), [BEH-BR-072](behaviors/08-operation-legality.md), [BEH-BR-073](behaviors/08-operation-legality.md), [BEH-BR-128](behaviors/14-children-and-groups.md) | property test over random operation histories *(Planned)* |
| [INV-BR-010](invariants.md#inv-br-010-intent-survives-caller-interruption) | [BEH-BR-066](behaviors/08-operation-legality.md), [BEH-BR-067](behaviors/08-operation-legality.md), [BEH-BR-074](behaviors/08-operation-legality.md), [BEH-BR-101](behaviors/11-configuration.md), [BEH-BR-188](behaviors/22-attributable-operations.md) | property test over random operation histories *(Planned)* |
| [INV-BR-011](invariants.md#inv-br-011-every-state-and-operation-pair-has-a-defined-outcome) | [BEH-BR-047](behaviors/06-removal.md), [BEH-BR-069](behaviors/08-operation-legality.md), [BEH-BR-071](behaviors/08-operation-legality.md), [BEH-BR-072](behaviors/08-operation-legality.md), [BEH-BR-077](behaviors/08-operation-legality.md), [BEH-BR-109](behaviors/12-shutdown-and-hosting.md) | property test over random operation histories *(Planned)* |
| [INV-BR-012](invariants.md#inv-br-012-a-definition-error-registers-nothing) | [BEH-BR-003](behaviors/01-plugin-definition.md), [BEH-BR-018](behaviors/03-installation.md), [BEH-BR-050](behaviors/07-replacement-and-reactivation.md), [BEH-BR-070](behaviors/08-operation-legality.md) | scenario tests *(Planned)* |
| [INV-BR-013](invariants.md#inv-br-013-configuration-values-are-never-observable) | [BEH-BR-028](behaviors/04-states-and-snapshots.md), [BEH-BR-103](behaviors/11-configuration.md), [BEH-BR-118](behaviors/13-observability-and-diagnostics.md), [BEH-BR-192](behaviors/22-attributable-operations.md), [BEH-BR-197](behaviors/23-audit-sink-and-record.md), [BEH-BR-219](behaviors/25-operation-gate.md) | scenario tests *(Planned)* |
| [INV-BR-014](invariants.md#inv-br-014-every-activation-gets-a-fresh-scope-and-memo-map) | [BEH-BR-036](behaviors/05-activation.md), [BEH-BR-058](behaviors/07-replacement-and-reactivation.md), [BEH-BR-099](behaviors/11-configuration.md) | scenario tests *(Planned)* |
| [INV-BR-015](invariants.md#inv-br-015-key-identity-is-checked-by-identifier-and-by-object) | [BEH-BR-006](behaviors/01-plugin-definition.md), [BEH-BR-038](behaviors/05-activation.md) | type-level and scenario tests *(Planned)* |
| [INV-BR-016](invariants.md#inv-br-016-a-re-entrant-wait-fails-fast) | [BEH-BR-040](behaviors/05-activation.md), [BEH-BR-088](behaviors/09-leases.md), [BEH-BR-136](behaviors/15-optional-and-reactive.md), [BEH-BR-144](behaviors/16-event-bus.md) | scenario tests *(Planned)* |
| [INV-BR-017](invariants.md#inv-br-017-every-drain-is-bounded-unless-declared-forever) | [BEH-BR-045](behaviors/06-removal.md), [BEH-BR-074](behaviors/08-operation-legality.md), [BEH-BR-085](behaviors/09-leases.md), [BEH-BR-095](behaviors/10-runtime-failure-and-health.md), [BEH-BR-105](behaviors/12-shutdown-and-hosting.md), [BEH-BR-107](behaviors/12-shutdown-and-hosting.md), [BEH-BR-167](behaviors/19-contribution-registry.md), [BEH-BR-173](behaviors/20-generation.md), [BEH-BR-174](behaviors/20-generation.md), [BEH-BR-176](behaviors/20-generation.md) | property test over random operation histories *(Planned)* |
| [INV-BR-018](invariants.md#inv-br-018-shutdown-reports-every-failure) | [BEH-BR-075](behaviors/08-operation-legality.md), [BEH-BR-106](behaviors/12-shutdown-and-hosting.md), [BEH-BR-108](behaviors/12-shutdown-and-hosting.md) | scenario tests *(Planned)* |
| [INV-BR-019](invariants.md#inv-br-019-optional-dependencies-never-gate-activation) | [BEH-BR-129](behaviors/15-optional-and-reactive.md), [BEH-BR-130](behaviors/15-optional-and-reactive.md), [BEH-BR-132](behaviors/15-optional-and-reactive.md) | scenario tests *(Planned)* |
| [INV-BR-020](invariants.md#inv-br-020-a-realm-changes-resolution-only) | [BEH-BR-145](behaviors/17-realms-and-interception.md), [BEH-BR-146](behaviors/17-realms-and-interception.md), [BEH-BR-150](behaviors/17-realms-and-interception.md) | scenario tests *(Planned)* |
| [INV-BR-021](invariants.md#inv-br-021-reconcile-is-idempotent) | [BEH-BR-154](behaviors/18-reconciliation-and-confluence.md), [BEH-BR-155](behaviors/18-reconciliation-and-confluence.md), [BEH-BR-159](behaviors/18-reconciliation-and-confluence.md), [BEH-BR-160](behaviors/18-reconciliation-and-confluence.md), [BEH-BR-201](behaviors/23-audit-sink-and-record.md) | property test over random operation histories *(Planned)* |
| [INV-BR-022](invariants.md#inv-br-022-one-requested-and-one-terminal-record-per-mutating-call) | [BEH-BR-158](behaviors/18-reconciliation-and-confluence.md), [BEH-BR-188](behaviors/22-attributable-operations.md), [BEH-BR-190](behaviors/22-attributable-operations.md), [BEH-BR-195](behaviors/23-audit-sink-and-record.md), [BEH-BR-196](behaviors/23-audit-sink-and-record.md), [BEH-BR-198](behaviors/23-audit-sink-and-record.md), [BEH-BR-199](behaviors/23-audit-sink-and-record.md), [BEH-BR-200](behaviors/23-audit-sink-and-record.md), [BEH-BR-201](behaviors/23-audit-sink-and-record.md), [BEH-BR-218](behaviors/25-operation-gate.md), [BEH-BR-220](behaviors/25-operation-gate.md) | property test over random operation histories *(Planned)* |
| [INV-BR-023](invariants.md#inv-br-023-the-audit-sequence-is-contiguous-per-host) | [BEH-BR-202](behaviors/23-audit-sink-and-record.md), [BEH-BR-212](behaviors/24-time-ids-and-sequence.md), [BEH-BR-213](behaviors/24-time-ids-and-sequence.md), [BEH-BR-214](behaviors/24-time-ids-and-sequence.md), [BEH-BR-215](behaviors/24-time-ids-and-sequence.md) | property test over random operation histories *(Planned)* |
| [INV-BR-024](invariants.md#inv-br-024-time-and-identifiers-come-only-from-services) | [BEH-BR-016](behaviors/02-host-construction.md), [BEH-BR-120](behaviors/13-observability-and-diagnostics.md), [BEH-BR-179](behaviors/21-testing-host.md), [BEH-BR-195](behaviors/23-audit-sink-and-record.md), [BEH-BR-209](behaviors/24-time-ids-and-sequence.md), [BEH-BR-210](behaviors/24-time-ids-and-sequence.md), [BEH-BR-211](behaviors/24-time-ids-and-sequence.md) | static check plus property test *(Planned)* |
| [INV-BR-025](invariants.md#inv-br-025-no-mutation-proceeds-without-required-attribution) | [BEH-BR-014](behaviors/02-host-construction.md), [BEH-BR-185](behaviors/22-attributable-operations.md), [BEH-BR-186](behaviors/22-attributable-operations.md), [BEH-BR-187](behaviors/22-attributable-operations.md), [BEH-BR-189](behaviors/22-attributable-operations.md), [BEH-BR-206](behaviors/23-audit-sink-and-record.md) | scenario tests *(Planned)* |
| [INV-BR-026](invariants.md#inv-br-026-an-unwired-sink-or-gate-changes-nothing) | [BEH-BR-015](behaviors/02-host-construction.md), [BEH-BR-192](behaviors/22-attributable-operations.md), [BEH-BR-193](behaviors/23-audit-sink-and-record.md), [BEH-BR-194](behaviors/23-audit-sink-and-record.md), [BEH-BR-217](behaviors/25-operation-gate.md) | scenario tests *(Planned)* |
| [INV-BR-027](invariants.md#inv-br-027-a-refused-or-unauditable-mutation-changes-nothing) | [BEH-BR-014](behaviors/02-host-construction.md), [BEH-BR-066](behaviors/08-operation-legality.md), [BEH-BR-070](behaviors/08-operation-legality.md), [BEH-BR-158](behaviors/18-reconciliation-and-confluence.md), [BEH-BR-188](behaviors/22-attributable-operations.md), [BEH-BR-203](behaviors/23-audit-sink-and-record.md), [BEH-BR-218](behaviors/25-operation-gate.md), [BEH-BR-220](behaviors/25-operation-gate.md), [BEH-BR-221](behaviors/25-operation-gate.md), [BEH-BR-222](behaviors/25-operation-gate.md) | property test over random operation histories *(Planned)* |
| [INV-BR-028](invariants.md#inv-br-028-audit-records-carry-no-configuration-values) | [BEH-BR-103](behaviors/11-configuration.md), [BEH-BR-197](behaviors/23-audit-sink-and-record.md), [BEH-BR-219](behaviors/25-operation-gate.md) | scenario tests *(Planned)* |
| [INV-BR-029](invariants.md#inv-br-029-the-audit-degraded-latch-blocks-operator-mutations) | [BEH-BR-110](behaviors/12-shutdown-and-hosting.md), [BEH-BR-205](behaviors/23-audit-sink-and-record.md), [BEH-BR-206](behaviors/23-audit-sink-and-record.md), [BEH-BR-220](behaviors/25-operation-gate.md) | scenario tests *(Planned)* |

## §3 Decision traceability

| Decision | Status | Cited by behaviours |
| --- | --- | --- |
| [ADR-BR-001](decisions/001-effect-v4-as-effect-system.md) — Effect v4 as the effect system | Proposed | BEH-BR-009–010 |
| [ADR-BR-002](decisions/002-plugin-build-is-a-layer.md) — A plugin's build is an Effect Layer | Proposed | BEH-BR-001–002, BEH-BR-004, BEH-BR-036 |
| [ADR-BR-003](decisions/003-one-provider-per-key-per-realm.md) — One provider per service key per realm | Proposed | BEH-BR-012, BEH-BR-019, BEH-BR-023, BEH-BR-060–061, BEH-BR-145, BEH-BR-147–148, BEH-BR-168 |
| [ADR-BR-004](decisions/004-replace-is-stop-then-start.md) — Replace is stop-then-start with no rollback | Proposed | BEH-BR-049–050, BEH-BR-053, BEH-BR-058 |
| [ADR-BR-005](decisions/005-failure-is-sticky.md) — Failure is sticky and retry is never automatic | Proposed | BEH-BR-025–026, BEH-BR-031, BEH-BR-033, BEH-BR-037, BEH-BR-053, BEH-BR-056, BEH-BR-096, BEH-BR-159–160 |
| [ADR-BR-006](decisions/006-one-instance-per-id-per-realm.md) — One instance per plugin ID per realm | Proposed | BEH-BR-005, BEH-BR-017, BEH-BR-041, BEH-BR-147 |
| [ADR-BR-007](decisions/007-observation-primitives.md) — SubscriptionRef state feed and sliding PubSub event log | Proposed | BEH-BR-028–030, BEH-BR-113–115, BEH-BR-165, BEH-BR-207 |
| [ADR-BR-008](decisions/008-error-taxonomy.md) — Schema.TaggedError taxonomy carrying identifiers only | Proposed | BEH-BR-013, BEH-BR-018, BEH-BR-186, BEH-BR-196 |
| [ADR-BR-009](decisions/009-managedruntime-hosting.md) — Non-Effect hosting through ManagedRuntime | Proposed | BEH-BR-009, BEH-BR-111–112 |
| [ADR-BR-010](decisions/010-cordis-parity.md) — Cordis feature parity and what is not adopted | Proposed | BEH-BR-151 |
| [ADR-BR-011](decisions/011-serviceid-is-key-identity.md) — ServiceId is key identity and mismatched key objects fail | Proposed | BEH-BR-006–007, BEH-BR-038, BEH-BR-138 |
| [ADR-BR-012](decisions/012-intent-and-linearization.md) — Operations record intent and are linearized per plugin | Proposed | BEH-BR-013, BEH-BR-017, BEH-BR-034, BEH-BR-065–068, BEH-BR-072, BEH-BR-156, BEH-BR-200 |
| [ADR-BR-013](decisions/013-total-operation-legality.md) — The state by operation table is total | Proposed | BEH-BR-026, BEH-BR-047, BEH-BR-069, BEH-BR-071–072, BEH-BR-200 |
| [ADR-BR-014](decisions/014-discriminated-plugin-snapshot.md) — PluginSnapshot is a discriminated union | Proposed | BEH-BR-027, BEH-BR-149 |
| [ADR-BR-015](decisions/015-leases-one-primitive.md) — Leases are one bounded primitive with a supervised child | Proposed | BEH-BR-045, BEH-BR-074, BEH-BR-081–087, BEH-BR-095, BEH-BR-107, BEH-BR-131, BEH-BR-166–167, BEH-BR-172, BEH-BR-174 |
| [ADR-BR-016](decisions/016-reentrancy-detection.md) — Re-entrancy is detected through a carried reference | Proposed | BEH-BR-088, BEH-BR-136, BEH-BR-187 |
| [ADR-BR-017](decisions/017-runtime-failure-one-transition.md) — Three runtime failure signals and one transition | Proposed | BEH-BR-073, BEH-BR-089–095, BEH-BR-134, BEH-BR-190, BEH-BR-199 |
| [ADR-BR-018](decisions/018-configuration-decoded-before-build.md) — Configuration is decoded before build and never observable | Proposed | BEH-BR-097–104, BEH-BR-118, BEH-BR-197 |
| [ADR-BR-019](decisions/019-realms-are-resolution-namespaces.md) — Realms are resolution namespaces, not security boundaries | Proposed | BEH-BR-145–146, BEH-BR-150–152 |
| [ADR-BR-020](decisions/020-typed-event-bus.md) — A typed event bus as a base service | Proposed | BEH-BR-137–144, BEH-BR-224 |
| [ADR-BR-021](decisions/021-children-and-groups.md) — Children and groups are scope-owned plugins | Proposed | BEH-BR-059, BEH-BR-121–128, BEH-BR-190, BEH-BR-199, BEH-BR-223 |
| [ADR-BR-022](decisions/022-optional-and-reactive-dependencies.md) — Optional and reactive dependencies never gate activation | Proposed | BEH-BR-129–135 |
| [ADR-BR-023](decisions/023-desired-state-reconcile.md) — Desired-state reconcile is keyed, owned and idempotent | Proposed | BEH-BR-153–160, BEH-BR-201, BEH-BR-222 |
| [ADR-BR-024](decisions/024-shared-state-helpers.md) — ContributionRegistry and Generation are core helpers | Proposed | BEH-BR-139–140, BEH-BR-161–176 |
| [ADR-BR-025](decisions/025-deterministic-time-and-ids.md) — Time and identifiers come from services | Proposed | BEH-BR-011, BEH-BR-015–016, BEH-BR-179, BEH-BR-209–211, BEH-BR-214, BEH-BR-216 |
| [ADR-BR-026](decisions/026-deterministic-test-host.md) — A deterministic test host is part of the core contract | Proposed | BEH-BR-177–184 |
| [ADR-BR-027](decisions/027-core-exclusions.md) — Core exclusions | Proposed | BEH-BR-008, BEH-BR-048, BEH-BR-150, BEH-BR-161 |
| [ADR-BR-028](decisions/028-gxp-scope.md) — GxP scope: process, core hooks and a companion | Proposed | BEH-BR-191, BEH-BR-194, BEH-BR-208, BEH-BR-216 |
| [ADR-BR-029](decisions/029-attributable-mutations.md) — Every host mutation is attributable | Proposed | BEH-BR-014, BEH-BR-126, BEH-BR-185–190, BEH-BR-192, BEH-BR-198–199, BEH-BR-218, BEH-BR-223 |
| [ADR-BR-030](decisions/030-audit-sink-port.md) — An optional AuditSink port distinct from Host.events | Proposed | BEH-BR-014–015, BEH-BR-086, BEH-BR-113, BEH-BR-158, BEH-BR-181, BEH-BR-192–196, BEH-BR-198, BEH-BR-201–202, BEH-BR-207 |
| [ADR-BR-031](decisions/031-audit-failure-policy.md) — Audit failure fails closed and latches | Proposed | BEH-BR-110, BEH-BR-188, BEH-BR-203–206, BEH-BR-213, BEH-BR-220 |
| [ADR-BR-032](decisions/032-operation-gate.md) — An OperationGate port in core | Proposed — amends ADR-BR-020 | BEH-BR-014–015, BEH-BR-066, BEH-BR-110, BEH-BR-144, BEH-BR-158, BEH-BR-182, BEH-BR-188, BEH-BR-217–224 |
| [ADR-BR-033](decisions/033-no-config-values-in-audit.md) — Audit records carry configuration paths, never values | Proposed | BEH-BR-103, BEH-BR-197, BEH-BR-219 |
| [ADR-BR-034](decisions/034-gxp-companion-scope.md) — The @bridger/gxp companion scope and its limits | Proposed | BEH-BR-191, BEH-BR-208, BEH-BR-215, BEH-BR-217, BEH-BR-224 |
| [ADR-BR-035](decisions/035-evidence-from-executed-tests.md) — Qualification evidence comes only from executed tests | Proposed | BEH-BR-183–184 |
| [ADR-BR-036](decisions/036-prospective-specification.md) — This specification is prospective | Proposed | — (process or scope decision) |
| [ADR-BR-037](decisions/037-audit-sequence-separate-from-event-seq.md) — The audit sequence is separate from the event seq | Proposed | BEH-BR-113, BEH-BR-115, BEH-BR-195, BEH-BR-202, BEH-BR-207, BEH-BR-212–215 |

## §4 Test file map

Every path is planned. Type-level tests use `tstyche` (`*.tst.ts`); property tests use `@effect/vitest` with `fast-check` over operation histories.

| Behaviour file | Planned tests |
| --- | --- |
| [01-plugin-definition.md](behaviors/01-plugin-definition.md) | `packages/core/test/01-plugin-definition.test.ts` *(Planned)*, `packages/core/test/01-plugin-definition.tst.ts` *(Planned)* |
| [02-host-construction.md](behaviors/02-host-construction.md) | `packages/core/test/02-host-construction.test.ts` *(Planned)* |
| [03-installation.md](behaviors/03-installation.md) | `packages/core/test/03-installation.test.ts` *(Planned)* |
| [04-states-and-snapshots.md](behaviors/04-states-and-snapshots.md) | `packages/core/test/04-states-and-snapshots.test.ts` *(Planned)* |
| [05-activation.md](behaviors/05-activation.md) | `packages/core/test/05-activation.test.ts` *(Planned)* |
| [06-removal.md](behaviors/06-removal.md) | `packages/core/test/06-removal.test.ts` *(Planned)* |
| [07-replacement-and-reactivation.md](behaviors/07-replacement-and-reactivation.md) | `packages/core/test/07-replacement-and-reactivation.test.ts` *(Planned)* |
| [08-operation-legality.md](behaviors/08-operation-legality.md) | `packages/core/test/08-operation-legality.test.ts` *(Planned)* |
| [09-leases.md](behaviors/09-leases.md) | `packages/core/test/09-leases.test.ts` *(Planned)* |
| [10-runtime-failure-and-health.md](behaviors/10-runtime-failure-and-health.md) | `packages/core/test/10-runtime-failure-and-health.test.ts` *(Planned)* |
| [11-configuration.md](behaviors/11-configuration.md) | `packages/core/test/11-configuration.test.ts` *(Planned)* |
| [12-shutdown-and-hosting.md](behaviors/12-shutdown-and-hosting.md) | `packages/core/test/12-shutdown-and-hosting.test.ts` *(Planned)* |
| [13-observability-and-diagnostics.md](behaviors/13-observability-and-diagnostics.md) | `packages/core/test/13-observability-and-diagnostics.test.ts` *(Planned)* |
| [14-children-and-groups.md](behaviors/14-children-and-groups.md) | `packages/core/test/14-children-and-groups.test.ts` *(Planned)* |
| [15-optional-and-reactive.md](behaviors/15-optional-and-reactive.md) | `packages/core/test/15-optional-and-reactive.test.ts` *(Planned)* |
| [16-event-bus.md](behaviors/16-event-bus.md) | `packages/core/test/16-event-bus.test.ts` *(Planned)*, `packages/core/test/16-event-bus.tst.ts` *(Planned)* |
| [17-realms-and-interception.md](behaviors/17-realms-and-interception.md) | `packages/core/test/17-realms-and-interception.test.ts` *(Planned)* |
| [18-reconciliation-and-confluence.md](behaviors/18-reconciliation-and-confluence.md) | `packages/core/test/18-reconciliation-and-confluence.test.ts` *(Planned)* |
| [19-contribution-registry.md](behaviors/19-contribution-registry.md) | `packages/core/test/19-contribution-registry.test.ts` *(Planned)* |
| [20-generation.md](behaviors/20-generation.md) | `packages/core/test/20-generation.test.ts` *(Planned)* |
| [21-testing-host.md](behaviors/21-testing-host.md) | `packages/core/test/21-testing-host.test.ts` *(Planned)* |
| [22-attributable-operations.md](behaviors/22-attributable-operations.md) | `packages/core/test/22-attributable-operations.test.ts` *(Planned)* |
| [23-audit-sink-and-record.md](behaviors/23-audit-sink-and-record.md) | `packages/core/test/23-audit-sink-and-record.test.ts` *(Planned)* |
| [24-time-ids-and-sequence.md](behaviors/24-time-ids-and-sequence.md) | `packages/core/test/24-time-ids-and-sequence.test.ts` *(Planned)* |
| [25-operation-gate.md](behaviors/25-operation-gate.md) | `packages/core/test/25-operation-gate.test.ts` *(Planned)* |

## §5 Acceptance scenario traceability

One scenario per required acceptance check of [BEH-BR-183](behaviors/21-testing-host.md) (checks 1–20) and [BEH-BR-184](behaviors/21-testing-host.md) (checks 21–42), in the same order. Each will be a tagged scenario in `features/` once code exists; until then none has run.

| Scenario | Check | Behaviours | Status |
| --- | --- | --- | --- |
| REQ-BR-001 | 1. Dependents stop before providers; providers usable from dependents' finalizers | [BEH-BR-043](behaviors/06-removal.md), [BEH-BR-044](behaviors/06-removal.md) | Not run |
| REQ-BR-002 | 2. Removal waits for leases, DrainTimeout at the limit, force revokes with LeaseRevoked | [BEH-BR-045](behaviors/06-removal.md), [BEH-BR-085](behaviors/09-leases.md), [BEH-BR-086](behaviors/09-leases.md) | Not run |
| REQ-BR-003 | 3. A callback removing its own provider fails with WouldDeadlock | [BEH-BR-088](behaviors/09-leases.md) | Not run |
| REQ-BR-004 | 4. Every cell of the state by operation and in-flight tables | [BEH-BR-069](behaviors/08-operation-legality.md), [BEH-BR-071](behaviors/08-operation-legality.md), [BEH-BR-072](behaviors/08-operation-legality.md) | Not run |
| REQ-BR-005 | 5. Background failure and failing health check end in failed (runtime) after dependents stop | [BEH-BR-090](behaviors/10-runtime-failure-and-health.md), [BEH-BR-092](behaviors/10-runtime-failure-and-health.md), [BEH-BR-094](behaviors/10-runtime-failure-and-health.md) | Not run |
| REQ-BR-006 | 6. Builds respect concurrency, dependency order and buildTimeout; awaitIdle times out | [BEH-BR-034](behaviors/05-activation.md), [BEH-BR-040](behaviors/05-activation.md) | Not run |
| REQ-BR-007 | 7. Configuration decode failure publishes nothing; reconfigure restarts dependents | [BEH-BR-097](behaviors/11-configuration.md), [BEH-BR-101](behaviors/11-configuration.md) | Not run |
| REQ-BR-008 | 8. Shutdown reports cleanup failures and forced plugins; scope close runs the same path | [BEH-BR-105](behaviors/12-shutdown-and-hosting.md), [BEH-BR-106](behaviors/12-shutdown-and-hosting.md), [BEH-BR-108](behaviors/12-shutdown-and-hosting.md) | Not run |
| REQ-BR-009 | 9. install rejects duplicates and cycles registering nothing; replace validates before stopping | [BEH-BR-018](behaviors/03-installation.md), [BEH-BR-019](behaviors/03-installation.md), [BEH-BR-020](behaviors/03-installation.md), [BEH-BR-050](behaviors/07-replacement-and-reactivation.md), [BEH-BR-051](behaviors/07-replacement-and-reactivation.md) | Not run |
| REQ-BR-010 | 10. A failed plugin stays failed through dependency loss; retry lands by availability | [BEH-BR-031](behaviors/04-states-and-snapshots.md), [BEH-BR-056](behaviors/07-replacement-and-reactivation.md), [BEH-BR-057](behaviors/07-replacement-and-reactivation.md) | Not run |
| REQ-BR-011 | 11. KeyMismatch when two key objects share a ServiceId | [BEH-BR-038](behaviors/05-activation.md) | Not run |
| REQ-BR-012 | 12. Caller interruption inside use interrupts the child before releasing the lease | [BEH-BR-084](behaviors/09-leases.md) | Not run |
| REQ-BR-013 | 13. Configuration source and override rules across reconfigure, retry and replace | [BEH-BR-099](behaviors/11-configuration.md), [BEH-BR-101](behaviors/11-configuration.md) | Not run |
| REQ-BR-014 | 14. A health check in flight when the plugin leaves active is not counted | [BEH-BR-092](behaviors/10-runtime-failure-and-health.md) | Not run |
| REQ-BR-015 | 15. A slow events subscriber observes a gap in seq | [BEH-BR-115](behaviors/13-observability-and-diagnostics.md) | Not run |
| REQ-BR-016 | 16. A restart rebuilds the layer with a fresh memo map | [BEH-BR-036](behaviors/05-activation.md) | Not run |
| REQ-BR-017 | 17. A Layer base is built before and released after every plugin | [BEH-BR-012](behaviors/02-host-construction.md) | Not run |
| REQ-BR-018 | 18. use and useAll share the lease admission, drain and revocation path | [BEH-BR-083](behaviors/09-leases.md) | Not run |
| REQ-BR-019 | 19. install returns a handle and awaitActive resolves or fails as specified | [BEH-BR-024](behaviors/03-installation.md) | Not run |
| REQ-BR-020 | 20. ManagedRuntime hosting forces the build and shuts down before dispose | [BEH-BR-111](behaviors/12-shutdown-and-hosting.md) | Not run |
| REQ-BR-021 | 21. ContributionRegistry collisions, ordering, drain and revocation | [BEH-BR-163](behaviors/19-contribution-registry.md), [BEH-BR-164](behaviors/19-contribution-registry.md), [BEH-BR-167](behaviors/19-contribution-registry.md) | Not run |
| REQ-BR-022 | 22. Generation drain, force and independent retired values | [BEH-BR-173](behaviors/20-generation.md), [BEH-BR-174](behaviors/20-generation.md), [BEH-BR-175](behaviors/20-generation.md) | Not run |
| REQ-BR-023 | 23. Children are removed with their parent; groups act as one unit | [BEH-BR-121](behaviors/14-children-and-groups.md), [BEH-BR-125](behaviors/14-children-and-groups.md), [BEH-BR-128](behaviors/14-children-and-groups.md) | Not run |
| REQ-BR-024 | 24. Optional dependencies never gate; whenAvailable runs, stops and re-runs | [BEH-BR-129](behaviors/15-optional-and-reactive.md), [BEH-BR-131](behaviors/15-optional-and-reactive.md), [BEH-BR-132](behaviors/15-optional-and-reactive.md), [BEH-BR-133](behaviors/15-optional-and-reactive.md) | Not run |
| REQ-BR-025 | 25. Event dispatch modes, ordering, listener removal and typing | [BEH-BR-138](behaviors/16-event-bus.md), [BEH-BR-140](behaviors/16-event-bus.md), [BEH-BR-141](behaviors/16-event-bus.md), [BEH-BR-142](behaviors/16-event-bus.md), [BEH-BR-143](behaviors/16-event-bus.md) | Not run |
| REQ-BR-026 | 26. Realm resolution, per-realm identity and interception | [BEH-BR-146](behaviors/17-realms-and-interception.md), [BEH-BR-147](behaviors/17-realms-and-interception.md), [BEH-BR-148](behaviors/17-realms-and-interception.md), [BEH-BR-151](behaviors/17-realms-and-interception.md), [BEH-BR-152](behaviors/17-realms-and-interception.md) | Not run |
| REQ-BR-027 | 27. disable keeps registration and frees the slot; enable re-validates; restart keeps the override | [BEH-BR-058](behaviors/07-replacement-and-reactivation.md), [BEH-BR-060](behaviors/07-replacement-and-reactivation.md), [BEH-BR-061](behaviors/07-replacement-and-reactivation.md), [BEH-BR-062](behaviors/07-replacement-and-reactivation.md) | Not run |
| REQ-BR-028 | 28. A volatile-only reconfigure does not restart | [BEH-BR-102](behaviors/11-configuration.md) | Not run |
| REQ-BR-029 | 29. reconcile is idempotent, prunes only what it owns, and is confluent | [BEH-BR-155](behaviors/18-reconciliation-and-confluence.md), [BEH-BR-157](behaviors/18-reconciliation-and-confluence.md), [BEH-BR-159](behaviors/18-reconciliation-and-confluence.md), [BEH-BR-160](behaviors/18-reconciliation-and-confluence.md) | Not run |
| REQ-BR-030 | 30. inspect returns names and counts; a stalled plugin is reported once | [BEH-BR-118](behaviors/13-observability-and-diagnostics.md), [BEH-BR-120](behaviors/13-observability-and-diagnostics.md) | Not run |
| REQ-BR-031 | 31. Attribution is required where configured; per-call context wins | [BEH-BR-187](behaviors/22-attributable-operations.md), [BEH-BR-189](behaviors/22-attributable-operations.md) | Not run |
| REQ-BR-032 | 32. Call order: validation, gate, requested record, intent; refusals change nothing | [BEH-BR-188](behaviors/22-attributable-operations.md), [BEH-BR-203](behaviors/23-audit-sink-and-record.md), [BEH-BR-218](behaviors/25-operation-gate.md), [BEH-BR-220](behaviors/25-operation-gate.md), [BEH-BR-221](behaviors/25-operation-gate.md) | Not run |
| REQ-BR-033 | 33. Exactly one requested and one terminal record per admitted call | [BEH-BR-198](behaviors/23-audit-sink-and-record.md), [BEH-BR-200](behaviors/23-audit-sink-and-record.md), [BEH-BR-201](behaviors/23-audit-sink-and-record.md) | Not run |
| REQ-BR-034 | 34. The audit-degraded latch: set, refusals, exemptions and acknowledgement | [BEH-BR-110](behaviors/12-shutdown-and-hosting.md), [BEH-BR-205](behaviors/23-audit-sink-and-record.md), [BEH-BR-206](behaviors/23-audit-sink-and-record.md) | Not run |
| REQ-BR-035 | 35. auditSeq is contiguous; failed writes retry in place | [BEH-BR-202](behaviors/23-audit-sink-and-record.md), [BEH-BR-212](behaviors/24-time-ids-and-sequence.md), [BEH-BR-213](behaviors/24-time-ids-and-sequence.md) | Not run |
| REQ-BR-036 | 36. verifyAuditSequence reports gaps, duplicates and disorder only | [BEH-BR-215](behaviors/24-time-ids-and-sequence.md) | Not run |
| REQ-BR-037 | 37. No configuration value appears in any record, request, event, log or snapshot | [BEH-BR-103](behaviors/11-configuration.md), [BEH-BR-197](behaviors/23-audit-sink-and-record.md), [BEH-BR-219](behaviors/25-operation-gate.md) | Not run |
| REQ-BR-038 | 38. An unwired sink and gate change nothing | [BEH-BR-192](behaviors/22-attributable-operations.md), [BEH-BR-194](behaviors/23-audit-sink-and-record.md) | Not run |
| REQ-BR-039 | 39. System transitions are recorded with Actor.system and a causation link, never gated | [BEH-BR-190](behaviors/22-attributable-operations.md), [BEH-BR-199](behaviors/23-audit-sink-and-record.md), [BEH-BR-223](behaviors/25-operation-gate.md) | Not run |
| REQ-BR-040 | 40. reconcile consults the gate once per entry action | [BEH-BR-158](behaviors/18-reconciliation-and-confluence.md) | Not run |
| REQ-BR-041 | 41. No ambient time or randomness in core sources (static check) | [BEH-BR-211](behaviors/24-time-ids-and-sequence.md) | Not run |
| REQ-BR-042 | 42. Gate requests and audit records carry the definition version and digest | [BEH-BR-196](behaviors/23-audit-sink-and-record.md), [BEH-BR-219](behaviors/25-operation-gate.md) | Not run |

## §6 Coverage targets

| Target | Threshold | Source |
| --- | --- | --- |
| Line and branch coverage, `packages/core` | ≥ 95% | [NFR-BR-003](urs.md#nfr-br-003-coverage) |
| Mutation score, `packages/core` (and `packages/gxp` when it exists) | ≥ 80% | [NFR-BR-008](urs.md#nfr-br-008-mutation-testing) |
| Acceptance scenarios | every REQ-BR in §5 executed and passing | [BEH-BR-183](behaviors/21-testing-host.md), [BEH-BR-184](behaviors/21-testing-host.md) |
| Legality table | one test per cell | [BEH-BR-071](behaviors/08-operation-legality.md) |
| Invariants | at least one test per INV-BR, property-based where §2 says so | §2 |

None of these is measured yet.

## §7 Risk traceability

Each risk's controls are the behaviours and invariants cited in its entry of the [risk assessment](gxp/03-risk-assessment.md); verification is through the scenarios of §5 that exercise those behaviours.

| Risk | Hazard | Controls | Verified by |
| --- | --- | --- | --- |
| [RSK-BR-001](gxp/03-risk-assessment.md#rsk-br-001) | Provider closed mid-call | BEH-BR-042, BEH-BR-043, BEH-BR-044, BEH-BR-076, BEH-BR-081, BEH-BR-082, BEH-BR-083, BEH-BR-084, BEH-BR-085, BEH-BR-130, BEH-BR-183, INV-BR-005, INV-BR-006, INV-BR-017 | REQ-BR-001, REQ-BR-002, REQ-BR-012, REQ-BR-018 |
| [RSK-BR-002](gxp/03-risk-assessment.md#rsk-br-002) | Stale build published | BEH-BR-036, BEH-BR-037, BEH-BR-039, BEH-BR-065, BEH-BR-066, BEH-BR-072, BEH-BR-196, INV-BR-003, INV-BR-004, INV-BR-009, INV-BR-014 | REQ-BR-004, REQ-BR-016, REQ-BR-042 |
| [RSK-BR-003](gxp/03-risk-assessment.md#rsk-br-003) | Silent retry repeats side effects | BEH-BR-031, BEH-BR-053, BEH-BR-056, BEH-BR-096, BEH-BR-160, BEH-BR-183, BEH-BR-198, INV-BR-007 | REQ-BR-010, REQ-BR-029, REQ-BR-033 |
| [RSK-BR-004](gxp/03-risk-assessment.md#rsk-br-004) | Unaudited lifecycle change | BEH-BR-067, BEH-BR-077, BEH-BR-086, BEH-BR-110, BEH-BR-126, BEH-BR-158, BEH-BR-184, BEH-BR-188, BEH-BR-194, BEH-BR-198, BEH-BR-199, BEH-BR-203, BEH-BR-205, INV-BR-022, INV-BR-027, INV-BR-029 | REQ-BR-002, REQ-BR-032, REQ-BR-033, REQ-BR-034, REQ-BR-038, REQ-BR-039, REQ-BR-040 |
| [RSK-BR-005](gxp/03-risk-assessment.md#rsk-br-005) | Unattributed change | BEH-BR-184, BEH-BR-185, BEH-BR-186, BEH-BR-187, BEH-BR-189, BEH-BR-191, BEH-BR-192, INV-BR-025 | REQ-BR-031, REQ-BR-038 |
| [RSK-BR-006](gxp/03-risk-assessment.md#rsk-br-006) | Undetected audit gap | BEH-BR-184, BEH-BR-198, BEH-BR-202, BEH-BR-205, BEH-BR-208, BEH-BR-212, BEH-BR-213, BEH-BR-215, INV-BR-022, INV-BR-023, INV-BR-029 | REQ-BR-033, REQ-BR-034, REQ-BR-035, REQ-BR-036 |
| [RSK-BR-007](gxp/03-risk-assessment.md#rsk-br-007) | Non-reproducible or wrong time | BEH-BR-016, BEH-BR-179, BEH-BR-209, BEH-BR-210, BEH-BR-211, BEH-BR-216, INV-BR-024 | REQ-BR-041 |
| [RSK-BR-008](gxp/03-risk-assessment.md#rsk-br-008) | Secret leaks into logs or audit | BEH-BR-028, BEH-BR-103, BEH-BR-114, BEH-BR-116, BEH-BR-117, BEH-BR-118, BEH-BR-184, BEH-BR-192, BEH-BR-197, BEH-BR-219, INV-BR-013, INV-BR-028 | REQ-BR-030, REQ-BR-037, REQ-BR-038, REQ-BR-042 |
| [RSK-BR-009](gxp/03-risk-assessment.md#rsk-br-009) | Silent resource leak on cleanup failure | BEH-BR-046, BEH-BR-047, BEH-BR-055, BEH-BR-071, BEH-BR-106, BEH-BR-108, BEH-BR-161, BEH-BR-183, INV-BR-007, INV-BR-011, INV-BR-018 | REQ-BR-004, REQ-BR-008 |
| [RSK-BR-010](gxp/03-risk-assessment.md#rsk-br-010) | Changed service shape under unchanged ServiceId | BEH-BR-002, BEH-BR-006, BEH-BR-007, BEH-BR-038, BEH-BR-138, BEH-BR-183, BEH-BR-219, INV-BR-015 | REQ-BR-011, REQ-BR-025, REQ-BR-037, REQ-BR-042 |
| [RSK-BR-011](gxp/03-risk-assessment.md#rsk-br-011) | Re-entrant deadlock via another fiber | BEH-BR-040, BEH-BR-085, BEH-BR-088, BEH-BR-120, BEH-BR-136, BEH-BR-183, INV-BR-016, INV-BR-017 | REQ-BR-002, REQ-BR-003, REQ-BR-006, REQ-BR-030 |
| [RSK-BR-012](gxp/03-risk-assessment.md#rsk-br-012) | Lossy event feed mistaken for audit trail | BEH-BR-030, BEH-BR-113, BEH-BR-115, BEH-BR-183, BEH-BR-192, BEH-BR-207, INV-BR-008 | REQ-BR-015, REQ-BR-038 |
| [RSK-BR-013](gxp/03-risk-assessment.md#rsk-br-013) | Realm mistaken for security boundary | BEH-BR-145, BEH-BR-146, BEH-BR-150, BEH-BR-152, BEH-BR-184, INV-BR-020 | REQ-BR-026 |
| [RSK-BR-014](gxp/03-risk-assessment.md#rsk-br-014) | Approval bypass through the raw Host | BEH-BR-015, BEH-BR-077, BEH-BR-144, BEH-BR-158, BEH-BR-182, BEH-BR-184, BEH-BR-217, BEH-BR-218, BEH-BR-221, BEH-BR-222, INV-BR-026, INV-BR-027 | REQ-BR-032, REQ-BR-040 |
| [RSK-BR-015](gxp/03-risk-assessment.md#rsk-br-015) | Forced revocation interrupts a GMP write | BEH-BR-045, BEH-BR-085, BEH-BR-086, BEH-BR-095, BEH-BR-107, BEH-BR-167, BEH-BR-174, BEH-BR-199, INV-BR-006, INV-BR-017 | REQ-BR-002, REQ-BR-021, REQ-BR-022, REQ-BR-039 |
| [RSK-BR-016](gxp/03-risk-assessment.md#rsk-br-016) | Hidden runtime failure | BEH-BR-021, BEH-BR-031, BEH-BR-090, BEH-BR-091, BEH-BR-092, BEH-BR-094, BEH-BR-096, BEH-BR-123, BEH-BR-134, BEH-BR-141, BEH-BR-183, BEH-BR-199, BEH-BR-223, INV-BR-007 | REQ-BR-005, REQ-BR-010, REQ-BR-014, REQ-BR-025, REQ-BR-039 |
| [RSK-BR-017](gxp/03-risk-assessment.md#rsk-br-017) | Unverified dynamically loaded code | BEH-BR-001, BEH-BR-008, BEH-BR-048, BEH-BR-104, BEH-BR-196, BEH-BR-219 | REQ-BR-037, REQ-BR-042 |
| [RSK-BR-018](gxp/03-risk-assessment.md#rsk-br-018) | Over-claiming qualification evidence | BEH-BR-181, BEH-BR-182, BEH-BR-183, BEH-BR-184, BEH-BR-194, BEH-BR-208, BEH-BR-215, BEH-BR-224 | REQ-BR-036, REQ-BR-038 |
| [RSK-BR-019](gxp/03-risk-assessment.md#rsk-br-019) | Conflicting concurrent operator actions | BEH-BR-065, BEH-BR-069, BEH-BR-071, BEH-BR-072, BEH-BR-155, BEH-BR-156, BEH-BR-183, BEH-BR-200, INV-BR-009, INV-BR-011 | REQ-BR-004, REQ-BR-029, REQ-BR-033 |
| [RSK-BR-020](gxp/03-risk-assessment.md#rsk-br-020) | Slow audit sink blocks the host | BEH-BR-110, BEH-BR-184, BEH-BR-202, BEH-BR-204, BEH-BR-205, BEH-BR-206, INV-BR-029 | REQ-BR-034, REQ-BR-035 |
| [RSK-BR-021](gxp/03-risk-assessment.md#rsk-br-021) | Wall-clock step reorders records | BEH-BR-202, BEH-BR-209, BEH-BR-212, BEH-BR-214, BEH-BR-216, INV-BR-023 | REQ-BR-035 |
| [RSK-BR-022](gxp/03-risk-assessment.md#rsk-br-022) | Defect in the Effect runtime | BEH-BR-036, BEH-BR-037, BEH-BR-177, BEH-BR-183, BEH-BR-184, INV-BR-003, INV-BR-014 | REQ-BR-016 |

## §8 Regulatory clause traceability

Clause-level allocation — 21 CFR Part 11, EU GMP Annex 11 and ALCOA+, each to
Core, Companion, Consumer or N/A with the Bridger identifiers that support it —
is maintained in one place, the [compliance matrix](gxp/02-compliance-matrix.md),
and not duplicated here. Behaviours that support a clause name it in their
`**Regulatory:**` line ([behaviours 22–25](behaviors/22-attributable-operations.md)).

---

_Next: [Roadmap](roadmap.md)_

