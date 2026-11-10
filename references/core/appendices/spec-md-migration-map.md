# Appendix — SPEC.md migration map

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-APP-01                                               |
> | Revision       | 0.5                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Appendix — Informative                                       |
> | Change History | 0.5 (2026-11-10): Item 22: `shutdown`'s union includes `WouldDeadlock` (H2, independent review of the round-3 fixes) (CCR-BR-035)<br>0.4 (2026-10-03): The review recorded as CCR-BR-002 was not the independent review of PROC-03 §5 (consistency pass) (CCR-BR-013)<br>0.3 (2026-10-02): Items 31 and 72 and the Concurrency and scheduling row widened; items 12 and 24 narrowed (callers already answered; child causation); ended intents and `resumes` in item 72 (CCR-BR-008)<br>0.2 (2026-10-02): Consistency fixes from independent review (CCR-BR-002)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001) |

---

This appendix is informative. [`docs/SPEC.md`](../../../docs/SPEC.md) was the
design document for `@bridger/core` before this specification existed. It is
superseded by `references/core/` under CCR-BR-001 and is kept only as design
history; where the two differ, `references/core/` governs. This map lets a
reader who knows SPEC.md find where each part of it went.

- **§1** has one row for every `##` and `###` heading of SPEC.md, in document
  order, with the heading text written exactly as SPEC.md writes it. It names
  the behaviour files, decisions, overview or appendix that now hold that
  content, the identifiers that hold it, and whether it was converted, split
  or dropped.
- **§2** lists every place where `references/core/` deliberately says
  something different from SPEC.md, or settles something SPEC.md left open
  in a way that changes what a reader of SPEC.md would expect. Each item gives
  what SPEC.md said, what this specification says, and where.

SPEC.md's title and the lines above its first `##` heading are not mapped as
rows: the status line ("API proposal for review … No implementation is
included") became [ADR-BR-036](../decisions/036-prospective-specification.md),
and the pointer to the ERP documents is outside this specification's scope.

This specification is prospective. Nothing in this map states that any
behaviour has been built or tested; it records where requirements are written,
not whether anything meets them.

## 1. Heading map

| SPEC.md heading | New location | Identifiers | Notes |
| --- | --- | --- | --- |
| Purpose | [Overview](../overview.md) (Mission, Packages); [ADR-BR-001](../decisions/001-effect-v4-as-effect-system.md); [ADR-BR-027](../decisions/027-core-exclusions.md) | ADR-BR-001, ADR-BR-027 | Split. Mission text → overview "Mission". The technology policy (latest stable Effect 4.x, unstable imports recorded with a version) → ADR-BR-001, which adds an unstable-import register. "No ERP entities, tenants, UI framework…" → ADR-BR-027 and overview "Core exclusions". The FoldKit adapter remark → overview "Packages" (adapters are out of this specification). |
| Modules and seams | [Overview](../overview.md) (Design philosophy, Packages, Public API surface); [02](../behaviors/02-host-construction.md); [01](../behaviors/01-plugin-definition.md); [19](../behaviors/19-contribution-registry.md); [20](../behaviors/20-generation.md); [ADR-BR-002](../decisions/002-plugin-build-is-a-layer.md); [ADR-BR-027](../decisions/027-core-exclusions.md) | BEH-BR-001, BEH-BR-008, BEH-BR-013, BEH-BR-162, BEH-BR-169; ADR-BR-002, ADR-BR-024, ADR-BR-027 | Split. The public seams (Host, `PluginDefinition`, `ContributionRegistry`, `Generation`) → overview "Public API surface" and the named behaviours; the loader-adapter seam → BEH-BR-008 and ADR-BR-027. The module diagram and the internal module names (Dependency resolver, Lifecycle coordinator, Provider table) were dropped as normative content because they describe internal structure, not observable behaviour; "Dependency resolver" and "Provider table" survive only as participants in the sequence diagrams of [05](../behaviors/05-activation.md) and [06](../behaviors/06-removal.md). |
| The small public interface | [Overview](../overview.md) (Worked example); [01](../behaviors/01-plugin-definition.md); [02](../behaviors/02-host-construction.md); [05](../behaviors/05-activation.md); [06](../behaviors/06-removal.md); [ADR-BR-002](../decisions/002-plugin-build-is-a-layer.md) | BEH-BR-001, BEH-BR-002, BEH-BR-009, BEH-BR-033, BEH-BR-043; ADR-BR-002 | Converted. The Logger/Audit example → overview "Worked example" (extended with an `Actor`) and reused as the running example of 05 and 06. "A plugin's build is an ordinary Effect Layer" → ADR-BR-002. |
| Plugin definition | [01](../behaviors/01-plugin-definition.md); [05](../behaviors/05-activation.md) (Activation paragraph); [11](../behaviors/11-configuration.md), [15](../behaviors/15-optional-and-reactive.md), [10](../behaviors/10-runtime-failure-and-health.md) (optional fields); [ADR-BR-002](../decisions/002-plugin-build-is-a-layer.md); [ADR-BR-011](../decisions/011-serviceid-is-key-identity.md) | BEH-BR-001–008, BEH-BR-036, BEH-BR-038; ADR-BR-002, ADR-BR-011 | Split. Type shape, `define`, `fromEffect`, runtime key lists, `id`, ServiceId matching and the versioning convention → BEH-BR-001–007. The **Activation** paragraph (fresh memo map, forked scope) → BEH-BR-036. **Key identity and versioning**: `KeyMismatch` → BEH-BR-038; ServiceId rule → BEH-BR-006, BEH-BR-007. `InvalidDefinition` is defined as explicit rules (see §2). |
| Host interface | [02](../behaviors/02-host-construction.md); [03](../behaviors/03-installation.md); [04](../behaviors/04-states-and-snapshots.md); [06](../behaviors/06-removal.md); [07](../behaviors/07-replacement-and-reactivation.md); [09](../behaviors/09-leases.md); [ADR-BR-003](../decisions/003-one-provider-per-key-per-realm.md), [ADR-BR-004](../decisions/004-replace-is-stop-then-start.md), [ADR-BR-007](../decisions/007-observation-primitives.md), [ADR-BR-011](../decisions/011-serviceid-is-key-identity.md), [ADR-BR-014](../decisions/014-discriminated-plugin-snapshot.md), [ADR-BR-029](../decisions/029-attributable-mutations.md) | BEH-BR-009–016, BEH-BR-017–024, BEH-BR-028, BEH-BR-030, BEH-BR-041, BEH-BR-049–054, BEH-BR-081–083; ADR-BR-003, ADR-BR-004, ADR-BR-007, ADR-BR-011, ADR-BR-014, ADR-BR-029 | Split. `Host` interface, `BridgerOptions`, `layer`/`make`, base Context vs Layer → 02. `install` paragraphs, `InstallOptions`, `PluginHandle` → 03. `HostSnapshot`, `PluginState`, `changes`/`snapshot()` → 04 (BEH-BR-028, BEH-BR-030). `remove` → BEH-BR-041. `replace` paragraphs → BEH-BR-049–054. `use`/`useAll`/`lease` → BEH-BR-081–083. Error unions, `PluginSnapshot` shape and `PluginHandle.restart` changed (see §2). |
| Errors | [Overview](../overview.md) (Errors); [02](../behaviors/02-host-construction.md); [ADR-BR-008](../decisions/008-error-taxonomy.md) | BEH-BR-013, BEH-BR-014; ADR-BR-008 | Converted. The error table → ADR-BR-008 and overview "Errors"; each error's trigger is stated in the behaviour that raises it. The GxP errors `Unattributed`, `ReasonRequired`, `AuditUnavailable`, `AuditWriteFailed`, `OperationRejected` are new. |
| Install and activation flow | [05](../behaviors/05-activation.md); [03](../behaviors/03-installation.md) | BEH-BR-033–040, BEH-BR-017, BEH-BR-021; ADR-BR-002 | Converted. The sequence diagram is kept in 05; "provided services become visible together" → BEH-BR-037; "provider identities captured … until stopped" → BEH-BR-035. |
| State and lifecycle | [04](../behaviors/04-states-and-snapshots.md); [05](../behaviors/05-activation.md); [06](../behaviors/06-removal.md); [08](../behaviors/08-operation-legality.md); [12](../behaviors/12-shutdown-and-hosting.md); [ADR-BR-005](../decisions/005-failure-is-sticky.md); [ADR-BR-012](../decisions/012-intent-and-linearization.md); [ADR-BR-014](../decisions/014-discriminated-plugin-snapshot.md) | BEH-BR-025–032, BEH-BR-033, BEH-BR-035, BEH-BR-037, BEH-BR-039, BEH-BR-043, BEH-BR-046, BEH-BR-065, BEH-BR-105; ADR-BR-005, ADR-BR-012, ADR-BR-014 | Split. State table and diagram → BEH-BR-025, BEH-BR-026 (three edges changed, see §2). Implicit rules (sticky failure, exits from `failed`, dependency loss) → BEH-BR-031, BEH-BR-032. Numbered rules 1–6: 1 → 03 (BEH-BR-018–020); 2 → BEH-BR-033, BEH-BR-035; 3 → BEH-BR-037; 4 → BEH-BR-043; 5 → BEH-BR-039; 6 → BEH-BR-105. Cleanup-failure paragraph → BEH-BR-046, BEH-BR-047. |
| Removal ordering | [06](../behaviors/06-removal.md) | BEH-BR-042, BEH-BR-043, BEH-BR-044 | Converted. Hiding from new consumers → BEH-BR-042; dependents first (diagram kept) → BEH-BR-043; the spatial guarantee → BEH-BR-044. |
| Operation semantics and races | [08](../behaviors/08-operation-legality.md); [ADR-BR-012](../decisions/012-intent-and-linearization.md); [ADR-BR-013](../decisions/013-total-operation-legality.md) | BEH-BR-065–077; ADR-BR-012, ADR-BR-013 | Converted and completed. Linearization and intent → BEH-BR-065, BEH-BR-066; caller interruption → BEH-BR-067. The race table became two total tables: state × operation (BEH-BR-071) and in-flight × incoming (BEH-BR-072). Several rows changed meaning (see §2). |
| Leases: limits, supervision and re-entrancy | [09](../behaviors/09-leases.md); [ADR-BR-015](../decisions/015-leases-one-primitive.md); [ADR-BR-016](../decisions/016-reentrancy-detection.md) | BEH-BR-081–088; ADR-BR-015, ADR-BR-016 | Converted. Drain limit → BEH-BR-085; force → BEH-BR-086; supervised callbacks and edge rules → BEH-BR-084; per-call timeout → BEH-BR-087; one primitive and scoped leases → BEH-BR-083; re-entrancy → BEH-BR-088. "Forcing is audited as a host event" reworded (see §2). |
| Runtime failure and health | [10](../behaviors/10-runtime-failure-and-health.md); [15](../behaviors/15-optional-and-reactive.md); [14](../behaviors/14-children-and-groups.md); [ADR-BR-017](../decisions/017-runtime-failure-one-transition.md); [ADR-BR-005](../decisions/005-failure-is-sticky.md) | BEH-BR-089–096, BEH-BR-129–134, BEH-BR-121; ADR-BR-017, ADR-BR-005 | Split. `Plugin.Runtime`, `background`, `reportFailure`, health checks, the transition and host revocation → BEH-BR-089–096. The `optional`/`useOptional`/`whenAvailable` members → 15; the `install` member → BEH-BR-121. Exit list now includes `disable` (see §2). |
| Concurrency and scheduling | [05](../behaviors/05-activation.md); [06](../behaviors/06-removal.md); [08](../behaviors/08-operation-legality.md); [ADR-BR-012](../decisions/012-intent-and-linearization.md); [ADR-BR-038](../decisions/038-cross-plugin-stop-ordering.md) | BEH-BR-034, BEH-BR-040, BEH-BR-043, BEH-BR-073, BEH-BR-074, BEH-BR-078–080; ADR-BR-012, ADR-BR-038 | Split. Ready set and FIFO → BEH-BR-034 (tie-break added); stops in reverse dependency order → BEH-BR-043; build timeout, idle, `awaitIdle` and fairness → BEH-BR-040 (a parked stop does not count as a running transition). The per-plugin order was widened (CCR-BR-006–008): operations on different plugins never wait for each other, a cascade waits for a dependent's transition step under its own drain limit, and parked stops, system stops and their resumption are ruled → BEH-BR-073, BEH-BR-074, BEH-BR-078–080, ADR-BR-038. |
| Configuration and metadata | [11](../behaviors/11-configuration.md); [07](../behaviors/07-replacement-and-reactivation.md); [18](../behaviors/18-reconciliation-and-confluence.md); [ADR-BR-018](../decisions/018-configuration-decoded-before-build.md); [ADR-BR-033](../decisions/033-no-config-values-in-audit.md) | BEH-BR-097–104, BEH-BR-054, BEH-BR-154; ADR-BR-018, ADR-BR-033 | Converted. Decode before build → BEH-BR-097; `ConfigSource` → BEH-BR-098; read at every activation and override → BEH-BR-099; `reconfigure` → BEH-BR-101; values never observable → BEH-BR-103 (stricter, see §2); `meta` → BEH-BR-104. Override dropped by `replace` → BEH-BR-054; `meta` comparison by `reconcile` → BEH-BR-154. |
| Shutdown | [12](../behaviors/12-shutdown-and-hosting.md); [ADR-BR-031](../decisions/031-audit-failure-policy.md) | BEH-BR-105–110; ADR-BR-031 | Converted. Reverse-order bounded stop → BEH-BR-105; `CloseReport` → BEH-BR-106 (`phase` renamed `cause`, `auditDegraded` added); force after the overall limit → BEH-BR-107; scope-close path and `onClose` → BEH-BR-108; `HostClosed` → BEH-BR-109; shutdown under the audit latch → BEH-BR-110 (new). |
| Observability | [13](../behaviors/13-observability-and-diagnostics.md); [23](../behaviors/23-audit-sink-and-record.md); [ADR-BR-007](../decisions/007-observation-primitives.md); [ADR-BR-030](../decisions/030-audit-sink-port.md); [ADR-BR-037](../decisions/037-audit-sequence-separate-from-event-seq.md) | BEH-BR-113–117, BEH-BR-207; ADR-BR-007, ADR-BR-030, ADR-BR-037 | Converted. Events as a diagnostic feed → BEH-BR-113; event catalogue → BEH-BR-114 (adds `audit-degraded`, `audit-acknowledged`); `seq` and sliding PubSub → BEH-BR-115; spans and logs → BEH-BR-116; metrics → BEH-BR-117. That the event feed is not an audit trail is now a requirement (BEH-BR-207). The prototype-time caveat on sliding-PubSub lag → ADR-BR-001 smoke test. |
| Testing the core | [21](../behaviors/21-testing-host.md); [ADR-BR-026](../decisions/026-deterministic-test-host.md); [ADR-BR-025](../decisions/025-deterministic-time-and-ids.md); [ADR-BR-035](../decisions/035-evidence-from-executed-tests.md) | BEH-BR-177–184; ADR-BR-025, ADR-BR-026, ADR-BR-035 | Converted. Deterministic host, steppable reconciler, `TestClock`, `Fault.*` → BEH-BR-177–180. The bulleted required behaviours → numbered acceptance checks in BEH-BR-183 (lifecycle core) and BEH-BR-184 (extensions and GxP hooks). Audit-sink and gate fixtures are new (BEH-BR-181, BEH-BR-182). |
| Revertibility and shared state | [19](../behaviors/19-contribution-registry.md); [ADR-BR-024](../decisions/024-shared-state-helpers.md) | BEH-BR-161–168; ADR-BR-024 | Converted. What revertibility covers → BEH-BR-161; registry as base service → BEH-BR-162; registration, ordering, removal and leased use → BEH-BR-163–167; generic extension point → BEH-BR-168. |
| Generations: atomic publication and admission control | [20](../behaviors/20-generation.md); [ADR-BR-024](../decisions/024-shared-state-helpers.md) | BEH-BR-169–176; ADR-BR-024 | Converted. Atomic publication → BEH-BR-170; admission control → BEH-BR-171; leases and `use` → BEH-BR-172; draining and force → BEH-BR-173, BEH-BR-174; retired values → BEH-BR-175; ordering rule for resources → BEH-BR-176. |
| Dynamic code loading | [01](../behaviors/01-plugin-definition.md); [06](../behaviors/06-removal.md); [ADR-BR-027](../decisions/027-core-exclusions.md); [ADR-BR-011](../decisions/011-serviceid-is-key-identity.md) | BEH-BR-008, BEH-BR-048; ADR-BR-027, ADR-BR-011 | Split. Entry purity (no import-time side effects) → BEH-BR-008; "cannot promise reclamation of imported code" → BEH-BR-048; fetch/verify/version/sandbox exclusions → ADR-BR-027. |
| Plugin handles, children and groups | [03](../behaviors/03-installation.md) (handles); [14](../behaviors/14-children-and-groups.md); [ADR-BR-021](../decisions/021-children-and-groups.md) | BEH-BR-024, BEH-BR-121–128; ADR-BR-021 | Split. `PluginHandle` and `awaitActive` → BEH-BR-024. Children → BEH-BR-121–126; groups → BEH-BR-127, BEH-BR-128. Child mounting is now a system transition in the audit trail (see §2). |
| Optional and reactive dependencies | [15](../behaviors/15-optional-and-reactive.md); [ADR-BR-022](../decisions/022-optional-and-reactive-dependencies.md) | BEH-BR-129–136; ADR-BR-022 | Converted. |
| Typed events and hooks | [16](../behaviors/16-event-bus.md); [ADR-BR-020](../decisions/020-typed-event-bus.md); [ADR-BR-032](../decisions/032-operation-gate.md) | BEH-BR-137–144; ADR-BR-020, ADR-BR-032 | Converted. The dispatch-mode table → BEH-BR-141–143; the Cordis column → [Cordis comparison](./cordis-comparison.md). "Veto-style hooks over host operations are not provided" → BEH-BR-144, amended for host lifecycle operations only by ADR-BR-032 (see §2). |
| Realms and interception | [17](../behaviors/17-realms-and-interception.md); [03](../behaviors/03-installation.md); [ADR-BR-019](../decisions/019-realms-are-resolution-namespaces.md); [ADR-BR-006](../decisions/006-one-instance-per-id-per-realm.md); [ADR-BR-003](../decisions/003-one-provider-per-key-per-realm.md) | BEH-BR-145–152, BEH-BR-022; ADR-BR-019, ADR-BR-006, ADR-BR-003 | Converted. `InstallOptions.intercept` → BEH-BR-022. Publication of non-isolated keys from a realm settled (see §2). |
| Disable, enable and restart | [07](../behaviors/07-replacement-and-reactivation.md); [03](../behaviors/03-installation.md); [08](../behaviors/08-operation-legality.md); [ADR-BR-013](../decisions/013-total-operation-legality.md) | BEH-BR-058–062, BEH-BR-023, BEH-BR-071; ADR-BR-013 | Converted. `restart` → BEH-BR-058, BEH-BR-059; `disable` → BEH-BR-060, BEH-BR-061; `enable` → BEH-BR-062; `install` with `disabled` → BEH-BR-023; per-state outcomes → BEH-BR-071. |
| Volatile configuration | [11](../behaviors/11-configuration.md); [ADR-BR-018](../decisions/018-configuration-decoded-before-build.md) | BEH-BR-100, BEH-BR-102; ADR-BR-018 | Converted. `Plugin.Config` and `volatile` → BEH-BR-100; the volatile-only `reconfigure` → BEH-BR-102. |
| Desired-state reconciliation | [18](../behaviors/18-reconciliation-and-confluence.md); [ADR-BR-023](../decisions/023-desired-state-reconcile.md) | BEH-BR-153–159; ADR-BR-023 | Converted and extended. Desired list → BEH-BR-153; keyed diff → BEH-BR-154; ownership → BEH-BR-155; execution order → BEH-BR-156; per-entry errors → BEH-BR-157; per-entry gate and audit → BEH-BR-158 (new); idempotence → BEH-BR-159. `Desired.overlay`, described only in prose in SPEC.md, moved to a REQUIREMENT in BEH-BR-153 and is covered by acceptance check 29 of BEH-BR-184 (see §2 item 101). |
| Inspection and diagnostics | [13](../behaviors/13-observability-and-diagnostics.md); [15](../behaviors/15-optional-and-reactive.md) | BEH-BR-116, BEH-BR-118–120, BEH-BR-135 | Converted. `inspect` → BEH-BR-118; `ActivePlugin` → BEH-BR-119; stall diagnostics → BEH-BR-120; log and span context → BEH-BR-116; optional and reactive entries → BEH-BR-135. |
| Confluence | [18](../behaviors/18-reconciliation-and-confluence.md); [ADR-BR-005](../decisions/005-failure-is-sticky.md); [ADR-BR-023](../decisions/023-desired-state-reconcile.md) | BEH-BR-160; ADR-BR-005, ADR-BR-023 | Converted. The sticky-failure exception is kept. |
| Comparison with Cordis | [Cordis comparison](./cordis-comparison.md) (BRIDGER-APP-02); [ADR-BR-010](../decisions/010-cordis-parity.md) | ADR-BR-010 | Moved as an informative appendix; the parity decision is ADR-BR-010. |
| Hosting from non-Effect code (ManagedRuntime) | [12](../behaviors/12-shutdown-and-hosting.md); [ADR-BR-009](../decisions/009-managedruntime-hosting.md) | BEH-BR-111, BEH-BR-112; ADR-BR-009 | Converted. Force the build and shut down before dispose → BEH-BR-111; the runtime holds the static part only → BEH-BR-112. |
| Core exclusions | [Overview](../overview.md) (Core exclusions); [ADR-BR-027](../decisions/027-core-exclusions.md); [17](../behaviors/17-realms-and-interception.md) | ADR-BR-027, BEH-BR-150 | Converted. Extended with the GxP exclusions (core does not authenticate, store, retain or protect audit records). "Realms are not isolation boundaries" → BEH-BR-150. |
| API decisions | [ADR-BR-001](../decisions/001-effect-v4-as-effect-system.md) … [ADR-BR-010](../decisions/010-cordis-parity.md) | ADR-BR-001–010 | Dropped as a table because each decision is now an ADR: row 1 → ADR-BR-003; row 2 → ADR-BR-004; row 3 → ADR-BR-005; row 4 → ADR-BR-006 (with ADR-BR-019); row 5 → ADR-BR-002; row 6 → ADR-BR-007 and ADR-BR-008; row 7 → ADR-BR-009; row 8 → ADR-BR-010. ADR-BR-001 records the technology policy the table assumed. The pointers to `REACT-API.md` and `FOLDKIT-API.md` → overview "Packages". |
| Source notes | ADR "References" sections, for example [ADR-BR-001](../decisions/001-effect-v4-as-effect-system.md) and [ADR-BR-010](../decisions/010-cordis-parity.md); [Cordis comparison](./cordis-comparison.md) | ADR-BR-001, ADR-BR-010 | Dropped as a section because sources are now cited where they are used: Effect v4 documentation in ADR-BR-001; Shi, Zhang and Cui and the Cordis material in ADR-BR-010 and BRIDGER-APP-02. The FoldKit embedding note → overview "Packages" (adapters out of scope). The ERP research index (`knowledge/README.md`) is not cited, because it does not bear on the core. |

34 headings are mapped above.

## 2. Changes in meaning

Each item reads: **what SPEC.md said** → **what `references/core/` says** —
*where*. Items 1–12 are the settled legality decisions; 13 the snapshot shape;
14–19 the consistency fixes; 20–37 the additional settlements S1–S18; 38–49 the
GxP additions; 50–96 the notable "Settled here" decisions recorded in the
behaviour files; 97 onward the consistency fixes from the review recorded as
CCR-BR-002 (an agent review, not the independent review of PROC-03 §5).

### 2.1 Operation legality

1. **Coverage of the race table.** SPEC.md's race table named some pairs and
   left most unstated → the state × operation table and the in-flight ×
   incoming table are total; any in-flight/incoming pair not otherwise named
   is `Conflict { pending: <in-flight operation> }` — *BEH-BR-071, BEH-BR-072,
   ADR-BR-013*.
2. **Unknown ID.** SPEC.md listed `UnknownPlugin` in the error unions with no
   table row → for an unknown ID, `install` registers and every other operation
   fails with `UnknownPlugin` — *BEH-BR-071*.
3. **`waiting` plugin.** SPEC.md gave only `retry` (no-op) and `restart`
   (no-op) → `remove`, `replace`, `disable` proceed; `retry`, `restart`,
   `enable` are no-op successes; `reconfigure` stores and checks the value with
   no build to restart — *BEH-BR-071, BEH-BR-101*.
4. **`starting` plugin.** SPEC.md gave only `retry` (no-op) → `remove`
   proceeds and the in-flight build's result is discarded; `replace`
   supersedes the target; `reconfigure` rebuilds once the build settles;
   `restart` supersedes the in-flight build, which settles and is discarded
   before building again; `retry` and `enable` are no-ops — *BEH-BR-071,
   BEH-BR-058*.
5. **`active` plugin.** SPEC.md did not tabulate it → every operation proceeds
   except `retry` and `enable`, which are no-op successes — *BEH-BR-071*.
6. **`failed` plugin (non-cleanup phase).** SPEC.md allowed `retry`,
   `restart`, `replace`, `remove`, `reconfigure`, `disable` and was silent on
   `enable` → the same six proceed (restarting ones land in `starting` or
   `waiting` by requirement availability) and `enable` is a no-op success —
   *BEH-BR-071, BEH-BR-057*.
7. **`failed` with phase `cleanup`.** SPEC.md: `retry` and `replace` are
   `Conflict`, and "`remove` retries the cleanup" → `remove` unregisters the
   plugin and records the leak as acknowledged, without re-running cleanup
   (Effect cannot re-run the finalizers of a closed scope); `replace`, `retry`,
   `reconfigure`, `restart`, `disable` and `enable` all fail with
   `Conflict { pending: "cleanup-failure" }` — *BEH-BR-047, BEH-BR-071,
   ADR-BR-013*.
8. **`disabled` plugin.** SPEC.md: `retry` is `Conflict`, `enable`, `remove`,
   `replace` allowed, `restart` fails with `Conflict`, and the override
   survives `reconfigure` → as before, plus `disable` is a no-op that joins,
   `reconfigure` stores the override for the next `enable`, and `restart`'s
   conflict names `pending: "disabled"` — *BEH-BR-071, BEH-BR-058*.
9. **In-flight `restart`/`reconfigure`.** SPEC.md: an incoming `restart` or
   `reconfigure` joins; `remove`, `replace`, `disable` supersede → kept, and
   an incoming `retry` or `enable` is `Conflict`; an incoming `reconfigure`
   with a different value supersedes (see item 33) — *BEH-BR-072*.
10. **In-flight `replace` and `retry`.** SPEC.md did not name the pair → an
    incoming `retry` during an in-flight `replace` is `Conflict` —
    *BEH-BR-072*.
11. **No-op successes are audited.** SPEC.md had no audit → a no-op success
    is still an admitted call and, with a sink wired, produces a `completed`
    record with `noop: true` — *BEH-BR-069, BEH-BR-200*.
12. **Closing host.** SPEC.md: "any operation → `HostClosed`" → every
    operation fails with `HostClosed` except `shutdown`, which joins a
    shutdown in progress (and after completion returns the original report);
    an operation already in flight lets its step settle and its caller
    receives `HostClosed`, unless its caller had already received its
    terminal outcome (including a call that parked); once shutdown has begun
    no stop parks, and shutdown takes over a stop whose drain expires —
    *BEH-BR-075, BEH-BR-105, BEH-BR-109*.

### 2.2 Snapshot shape

13. **`PluginSnapshot`.** SPEC.md: one flat record per plugin (`state`,
    `missingServiceIds` and `providerIds` always present; `health` and
    `failure` optional; `meta` with `version` and `description`) → a union
    discriminated on `state`: `waiting` carries a non-empty
    `missingServiceIds`; `starting` carries `providerIds`; `active` carries
    `providerIds` and `health`; `stopping` carries `reason: StopReason` and
    `next`; `failed` carries `failure` and `missingServiceIds`; `disabled`
    carries nothing more; every variant shares `id`, `realm`, `parentId?`,
    and `meta?` now includes `digest` — *BEH-BR-027, ADR-BR-014*.

### 2.3 Consistency fixes

14. **`PluginHandle.restart` error union.** SPEC.md:
    `Effect<void, UnknownPlugin | Conflict | HostClosed>` → exactly
    `Host.restart`'s union, including `DrainTimeout`, `WouldDeadlock`,
    `Superseded`, `CleanupError` and the GxP errors — *BEH-BR-024,
    BEH-BR-059, ADR-BR-008*.
15. **Exits from runtime failure.** SPEC.md's runtime-failure paragraph
    omitted `disable` from the operations that leave `failed`, while its state
    rules included it → all six (`retry`, `restart`, `replace`,
    `reconfigure`, `disable`, `remove`) leave every non-cleanup phase —
    *BEH-BR-031, BEH-BR-096, ADR-BR-005, ADR-BR-017*.
16. **`awaitIdle` and `inspect`.** SPEC.md's signatures omitted `HostClosed`
    → both also fail with `HostClosed` — *BEH-BR-040, BEH-BR-109,
    BEH-BR-118*.
17. **Forcing "audited as a host event".** SPEC.md conflated the event feed
    with an audit trail → forcing is *reported* as the `lease-revoked` host
    event; with an `AuditSink` wired it is *also* an audit record
    (SystemTransition `lease-revoked`) — *BEH-BR-086, BEH-BR-199*.
18. **Removing after a cleanup failure.** See item 7 — *BEH-BR-047*.
19. **`CloseReport.failed[].phase`.** SPEC.md: `phase: "cleanup" | "drain"`
    → renamed `cause: "cleanup" | "drain"`, so the report does not reuse the
    plugin failure-phase vocabulary — *BEH-BR-106*.

### 2.4 Additional settlements S1–S18

20. **S1 — record count per call.** SPEC.md had no audit → every mutating call
    that passes the attribution, latch and gate checks produces exactly one
    `requested` and one terminal record; a call refused at the gate produces
    one `rejected` record and no `requested` record; a call refused for
    attribution or by the latch produces no record — *BEH-BR-198,
    BEH-BR-220*.
21. **S2 — unwritable `rejected` record.** New → the call still fails with
    `OperationRejected`, and the latch is set — *BEH-BR-205, BEH-BR-220*.
22. **S3 — shutdown is never blocked by audit.** SPEC.md: `shutdown` returns
    `Effect<CloseReport>` and cannot fail → `shutdown` skips the latch and is
    not gated; its `requested` record is attempted, and if that write fails
    shutdown proceeds, sets the latch and reports
    `CloseReport.auditDegraded: true`. Its error union is
    `Unattributed | ReasonRequired | WouldDeadlock` (attribution policy
    still applies to an explicit call; `WouldDeadlock` only from a build,
    `load` or finalizer fiber, BEH-BR-105) — *BEH-BR-106, BEH-BR-110, ADR-BR-031*.
23. **S4 — scope-close shutdown.** SPEC.md: closing the scope performs the
    same shutdown → it does, attributed to `Actor.system` with no reason and
    audited with operation `shutdown` — *BEH-BR-108*.
24. **S5 — children.** SPEC.md was silent on attribution → mounting a child
    through `Plugin.Runtime.install` and removing it with its parent are
    system transitions (`system-start` / `system-stop`) whose `target` is the
    child and whose `causationId` is the parent's triggering record for a
    mount and the cascade root's record (BEH-BR-190) for a removal; they are
    not gated — *BEH-BR-126, ADR-BR-021*.
25. **S6 — `PluginHandle.restart` is a function.** SPEC.md: a bare `Effect`
    value → `(options?: RemoveOptions) => Effect<void, …>`, so it can carry
    `drain`, `force` and an `OperationContext` — *BEH-BR-024, BEH-BR-059*.
26. **S7 — correlation id.** New → when the caller supplies none, the host
    generates a `correlationId` with `IdGenerator`, so every record carries
    one; reconcile parent and entry records share it; a `joined` record
    carries the joined call's `correlationId` and its own in `causationId` —
    *BEH-BR-187, BEH-BR-195, BEH-BR-200, BEH-BR-201*.
27. **S8 — reconcile errors.** SPEC.md:
    `reconcile(desired, options?): Effect<ReconcileReport, HostClosed>`, with
    errors per entry → attribution and the latch are checked once for the
    call (`Unattributed`, `ReasonRequired`, `AuditUnavailable`); the gate is
    consulted per entry action and refusals appear in
    `ReconcileReport.rejected`; if a per-entry `requested` record cannot be
    written, reconcile stops and fails with `AuditUnavailable`, leaving the
    entries already applied applied and recorded. Signature
    `reconcile(desired, options?: ReconcileOptions & OperationOptions)` —
    *BEH-BR-157, BEH-BR-158, BEH-BR-201*.
28. **S9 — gate timeout.** New → `BridgerOptions.gateTimeout` (default 60
    seconds, `"forever"` only when explicit); a gate timeout or defect is a
    refusal with reason `"gate-timeout"` / `"gate-defect"` — *BEH-BR-011,
    BEH-BR-221*.
29. **S10 — idempotent rewrite.** New → a retried write reuses the same
    `recordId` and `auditSeq`, and a sink must treat a write with an
    already-stored `recordId` as idempotent (a consumer or companion
    obligation); `verifyAuditSequence` detects gaps, duplicates and disorder
    and is not tamper evidence — *BEH-BR-193, BEH-BR-202, BEH-BR-213,
    BEH-BR-215*.
30. **S11 — in-flight `disable`.** SPEC.md: an in-flight `disable` joins an
    incoming `disable`; other pairs open → an incoming `remove` supersedes it
    (earlier caller → `Superseded`); incoming `replace`, `reconfigure`,
    `restart` and `enable` fail with `Conflict { pending: "disable" }` —
    *BEH-BR-072*.
31. **S12 — system-induced `stopping`.** SPEC.md was silent → an operator
    operation that arrives while a system stop (dependency loss or runtime
    failure) is running waits, before its intent, for that stop to settle and
    is then decided against the state the plugin lands in; on a parked system
    stop, `remove`, `replace`, `restart`, `disable` and `reconfigure` resume
    it as their intent, while `retry` and `enable` fail with
    `Conflict { pending: "dependency-loss" }` (also when the stop parks while
    they wait); only stops driven by an operator call — its own stop, or a
    cascade whose root is an operator call — park, and stops with no caller
    revoke on expiry —
    *BEH-BR-073, BEH-BR-074, BEH-BR-080, BEH-BR-095*.
32. **S13 — `restart` on `disabled`.** SPEC.md: `Conflict` →
    `Conflict { pending: "disabled" }` — *BEH-BR-058, BEH-BR-071*.
33. **S14 — competing `reconfigure`.** SPEC.md: an in-flight `reconfigure`
    is joined by an incoming `reconfigure` → only when the values are equal;
    a different value supersedes (earlier caller → `Superseded`, the later
    value is the target) — *BEH-BR-072*.
34. **S15 — `ConfigInvalid` content.** SPEC.md: decode issues "with
    `Redacted` values omitted" → paths and expected forms only, never any
    configuration value, redacted or not — *BEH-BR-103, ADR-BR-018*.
35. **S16 — realm publication.** SPEC.md stated resolution for consumers
    only → a key not isolated in realm R, provided by a plugin installed in
    R, is published in the default realm's slot and is subject to
    `DuplicateProvider` there — *BEH-BR-146, ADR-BR-019*.
36. **S17 — undefined realm on leases.** SPEC.md: `use`, `useAll`, `lease`
    fail only with `ServiceUnavailable` (and lease errors) → an undefined
    `realm` fails with `UnknownRealm`, added to their unions — *BEH-BR-147,
    BEH-BR-013*.
37. **S18 — check order.** New → a mutating call checks `HostClosed`, then
    attribution, then the latch, then `UnknownPlugin` and definition checks,
    then the gate, then writes the `requested` record, then records intent —
    *BEH-BR-188, BEH-BR-218*.

### 2.5 GxP additions (no SPEC.md source)

38. **Attribution.** SPEC.md had no notion of who acted → `Actor`
    (`Actor.system`, `Actor.unattributed`), `OperationContext`,
    `CurrentActor` reference, per-call `options.context` overriding the
    reference, and `BridgerOptions.attribution` (`require`,
    `requireReason`); core never authenticates and never infers identity
    from a fiber or a plugin — *BEH-BR-185–192, ADR-BR-029*.
39. **`OperationOptions` on every mutating operation.** SPEC.md: `retry`,
    `enable`, `reconfigure`, `defineRealm` and `reconcile` had no options
    parameter → each gains `options?: OperationOptions`, and every other
    mutating operation's options extend it — *BEH-BR-014, BEH-BR-186*.
40. **GxP errors in every mutating union.** SPEC.md's unions ended at the
    lifecycle errors → every mutating operation's union adds
    `Unattributed | ReasonRequired | AuditUnavailable | OperationRejected`
    (with the `shutdown` and `reconcile` exceptions in items 22 and 27) —
    *BEH-BR-014, ADR-BR-008*.
41. **`AuditSink` and `AuditRecord`.** SPEC.md: `Host.changes` and
    `Host.events` only, both lossy → an optional, write-only `AuditSink` port
    distinct from `Host.events`, with a fixed `AuditRecord` schema; an
    unwired sink changes nothing — *BEH-BR-193–208, ADR-BR-030*.
42. **Fail closed.** New → a change whose `requested` record cannot be
    written within `BridgerOptions.auditTimeout` (default 10 seconds) is not
    made and fails with `AuditUnavailable` — *BEH-BR-203, BEH-BR-204,
    ADR-BR-031*.
43. **The audit latch.** New → an unwritten terminal, `rejected` or system
    record sets `auditDegraded` and emits `audit-degraded`; operator
    mutations other than `shutdown` and `acknowledgeAuditDegraded` then fail
    with `AuditUnavailable` until `Host.acknowledgeAuditDegraded` (attributed,
    reason always required, audited) clears it and emits
    `audit-acknowledged` — *BEH-BR-205, BEH-BR-206, BEH-BR-114, ADR-BR-031*.
44. **`OperationGate`.** SPEC.md: "veto-style hooks over host operations are
    not provided" → an optional `OperationGate` port, with no default
    implementation, consulted on every operator mutation; refusal changes
    nothing; system transitions and `shutdown` are audited, not gated. This
    amends the no-veto rule for host lifecycle operations only; application
    events keep no veto — *BEH-BR-217–224, BEH-BR-144, ADR-BR-032,
    ADR-BR-020*.
45. **Time and identifiers from services.** SPEC.md: events carry "a
    timestamp", and `hostId` had no stated source → every timestamp comes
    from `Clock`, every identifier (including `hostId`, `recordId`,
    `correlationId`) from `IdGenerator` (default `crypto.randomUUID`, a
    counter in `TestHost`); ambient `Date.now()`, `performance.now()` and
    `crypto.randomUUID()` are prohibited in core — *BEH-BR-209–211,
    BEH-BR-016, ADR-BR-025*.
46. **`auditSeq` and `verifyAuditSequence`.** New → a per-host sequence
    starting at 1, separate from the event `seq`, contiguous for records
    handed to the sink; `verifyAuditSequence` reports gaps, duplicates and
    disorder only — *BEH-BR-212–215, ADR-BR-037*.
47. **`HostSnapshot` audit fields.** SPEC.md's `HostSnapshot` had none →
    `audit: "wired" | "unwired"`, `auditDegraded: boolean` and
    `auditDropped: number` — *BEH-BR-028, BEH-BR-015, BEH-BR-194,
    BEH-BR-202*.
48. **`CloseReport.auditDegraded`.** New → the report states whether the
    latch was set when it was produced — *BEH-BR-106, BEH-BR-110*.
49. **System transitions are audited.** New → `system-start`,
    `system-stop`, `runtime-failure`, `lease-revoked`, `health-degraded`
    and `intent-ended` (CCR-BR-008) are recorded with `Actor.system` and a `causationId`; only the entry
    into `degraded` health is recorded, not each failed check —
    *BEH-BR-190, BEH-BR-199, BEH-BR-092*.

### 2.6 Settled in the behaviour files

50. **`InvalidDefinition`.** SPEC.md said "malformed `id`, `requires` or
    `provides`" without a definition → explicit rules, plus a plugin listing
    a key it provides as `optional`, a `volatile` name that is not a
    top-level field of `config` (or `volatile` without `config`), and a
    `health.failureThreshold` below 1 — *BEH-BR-003, BEH-BR-100,
    BEH-BR-092*.
51. **Constructor error type.** SPEC.md typed `Bridger.layer` as
    `Layer.Layer<Bridger.Host>` while requiring a base build failure to fail
    it → both constructors carry the base layer's error type `EBase`
    (default `never`) — *BEH-BR-009*.
52. **Invalid option values.** SPEC.md gave defaults only → invalid
    `BridgerOptions` values are rejected at construction with a defect, not
    clamped — *BEH-BR-011*.
53. **Error unions.** SPEC.md's unions → `replace` adds `UnknownPlugin`;
    `restart`, `disable`, `reconfigure` add `Superseded`; `replace`,
    `restart`, `disable`, `reconfigure` add `CleanupError`; `reconfigure`
    adds `DrainTimeout` and `WouldDeadlock` — *BEH-BR-013, BEH-BR-055,
    BEH-BR-101*.
54. **Ports read once.** New → `AuditSink`, `OperationGate` and
    `IdGenerator` are resolved once at construction; a host's wiring does
    not change during its life — *BEH-BR-015*.
55. **Entry state at install.** SPEC.md's diagram enters every plugin through
    `waiting` → a plugin whose requirements are all available is registered
    directly in `starting` — *BEH-BR-017, BEH-BR-026*.
56. **`InstallError` precedence.** SPEC.md listed five errors with no order →
    a fixed order, so the same inputs give the same rejection — *BEH-BR-018*.
57. **Who holds a provider slot.** SPEC.md: "already provided by an
    installed plugin" → every registered, non-disabled plugin holds its slots,
    active or not — *BEH-BR-019*.
58. **Undecodable `InstallOptions.config`.** SPEC.md: "initial override (as
    reconfigure would set)" with no `ConfigInvalid` in `install`'s union → it
    is an activation outcome, not an `install` error — *BEH-BR-022*.
59. **Checks for a disabled install.** SPEC.md: registers "directly in this
    state" → identity and definition checks apply at install; slot and cycle
    checks apply at `enable` — *BEH-BR-023*.
60. **Handles.** SPEC.md was silent → a handle is bound to its own
    installation and never acts on a later plugin with the same ID;
    "superseded first" means the definition was replaced before activation;
    `awaitActive` keeps waiting on a `disabled` plugin — *BEH-BR-024*.
61. **Meaning of `starting`.** SPEC.md: "the plugin's `build` effect is
    running" → `starting` covers both queued behind `concurrency` and
    building — *BEH-BR-025*.
62. **State diagram edges.** SPEC.md's diagram → adds `[*] → starting` and
    `disabled → starting`; withholds `failed → disabled` after a cleanup
    failure — *BEH-BR-026*.
63. **Revision increments.** SPEC.md: "increases on every state change" →
    on every change to any snapshot field (including `missingServiceIds`,
    `health`, `next`, `meta`, realms and `auditDegraded`) — *BEH-BR-029*.
64. **FIFO tie-break.** SPEC.md: "FIFO order of becoming ready" → ties are
    broken by registration order — *BEH-BR-034*.
65. **Failed activation phases.** SPEC.md: an omitted provided service "is an
    activation error"; silent on a cleanup failure after a failed activation
    → phase `activation` for the former; phase `cleanup` for the latter —
    *BEH-BR-037*.
66. **Stale build that failed.** SPEC.md: "let that step settle, close its
    stale scope, and reevaluate" → when an operator asked for something else,
    that operation decides the destination; when a provider simply left, the
    failure is kept sticky — *BEH-BR-039*.
67. **Dependent cleanup failure during a provider's removal.** SPEC.md was
    silent → the failure is recorded on the dependent; the provider's
    `remove` does not fail because of it — *BEH-BR-046*.
68. **Slot reservation during `replace`.** SPEC.md checks the new definition
    before stopping, without a reservation → both the old and new slot sets
    are reserved for the stop window — *BEH-BR-050*.
69. **Cleanup failure during `replace`, `restart`, `disable`,
    `reconfigure`.** SPEC.md gave `CleanupError` to `remove` only → each fails
    with `CleanupError`, the plugin ends `failed` with phase `cleanup`, and
    for `replace` the old definition stays registered — *BEH-BR-055*.
70. **Arrival order through the checks.** SPEC.md: linearized in call order
    → calls on one plugin pass through the GxP checks to their
    linearization points in arrival order — *BEH-BR-065*.
71. **Completion points.** SPEC.md fixed only `remove` ("after cleanup") →
    every operation completes when the state it asked for has been entered —
    *BEH-BR-068*.
72. **After `DrainTimeout`.** SPEC.md: "the plugin stays `stopping` … the
    operation can be repeated" → the intent stays pending and the stop parks
    (`parked` true in the snapshot): it does not complete on its own, and
    repeating the operation (or a superseding one) resumes it, the resuming
    call writing its own terminal record with `resumes` naming the parked
    call's `requested` record; every stop the failing call drives that has
    not settled parks with it; a provider's stop that needs the dependent
    resumes it and ends the parked intent, and shutdown resumes it under its
    own limits, either writing an `intent-ended` record when it ends an
    intent; `DrainTimeout` carries `{ id, leases, target? }` —
    *BEH-BR-074, BEH-BR-078–080, BEH-BR-085, BEH-BR-105; ADR-BR-038*.
73. **Leases after shutdown begins.** SPEC.md was silent → `use`, `useAll`
    and `lease` fail with `ServiceUnavailable`, not `HostClosed`; base-service
    leases never delay plugin removal — *BEH-BR-081*.
74. **Canonical key order.** SPEC.md: "a canonical key order" → ascending
    `ServiceId` by UTF-16 code units; a key listed twice is leased once —
    *BEH-BR-082*.
75. **Re-entrancy covers `reconfigure`.** SPEC.md's list omitted it → a
    re-entrant `reconfigure` fails with `WouldDeadlock`, decided after the
    `requested` record and before intent — *BEH-BR-088*.
76. **Background restart schedule.** SPEC.md: `restart` with an optional
    `Schedule` → a bounded, spaced default schedule when none is given; an
    exhausted schedule is handled as `fail-plugin` (the same applies to
    `whenAvailable`) — *BEH-BR-090, BEH-BR-134*.
77. **Runtime-failure signals outside `active`.** SPEC.md was silent → a
    signal while `starting` fails the activation (phase `activation`); a
    signal while already `stopping` is logged and emitted but does not
    redirect the stop — *BEH-BR-091*.
78. **Health per activation.** SPEC.md was silent → each activation starts
    at `health: "unknown"` with a zero count — *BEH-BR-092*.
79. **Cleanup failure during a runtime-failure stop.** SPEC.md: ends
    `failed` with phase `runtime` → phase `cleanup` when closing the scope
    fails — *BEH-BR-094*.
80. **Host revocation with `drainTimeout: "forever"`.** SPEC.md: the host
    revokes at the drain limit → with `"forever"` the runtime-failure
    transition waits and does not revoke — *BEH-BR-095*.
81. **Configuration details.** SPEC.md was silent → a plugin without
    `config` receives `Plugin.Config<void>`; a source failure is
    `ConfigInvalid` (phase `activation`); the source path is the plugin ID
    only, not the realm (a child uses its prefixed ID) — *BEH-BR-097,
    BEH-BR-098*.
82. **`reconfigure` drain behaviour.** SPEC.md was silent → `reconfigure`
    takes no `drain`/`force`, drains under `drainTimeout` and never forces;
    an unchanged value is a no-op success — *BEH-BR-101, BEH-BR-102*.
83. **Shutdown details.** SPEC.md was silent → `shutdown` never fails with
    `WouldDeadlock`; `CloseReport` lists are not exclusive; a finalizer that
    never completes delays the report; `onClose` runs exactly once; a
    `shutdown` after completion returns the original report — *BEH-BR-105,
    BEH-BR-106, BEH-BR-107, BEH-BR-108, BEH-BR-109*.
84. **Event `seq` origin.** SPEC.md: "a monotonic `seq`" → starts at 1 per
    host and steps by exactly one — *BEH-BR-115*.
85. **`ActivePlugin` is not an actor.** New → the `ActivePlugin` reference is
    diagnostic only and never used as an audit `Actor` — *BEH-BR-119,
    BEH-BR-191*.
86. **Children.** SPEC.md was silent → the ID prefix is always applied;
    Host operations addressed to a child follow the ordinary tables, and a
    child removed directly stays removed for the parent's activation; a group
    mounts its members all or none — *BEH-BR-122, BEH-BR-125, BEH-BR-128*.
87. **Undeclared optional key.** SPEC.md was silent → `optional` /
    `useOptional` on a key not listed in `optional` returns `None` and logs a
    warning — *BEH-BR-130*.
88. **Event bus details.** SPEC.md was silent → listeners match by
    `EventKey.id`; `emit` completes when every listener fiber has started;
    `parallel` returns results in listener order; `null` counts as a defined
    result in `serial`; `waterfall` runs only `around` listeners and `next`
    is not memoised — *BEH-BR-138, BEH-BR-141, BEH-BR-142, BEH-BR-143*.
89. **Realm details.** SPEC.md: "the default realm always exists" →
    redefining `"default"` fails with `DuplicateRealm`; realm definitions are
    immutable; a realm may isolate a base-service key — *BEH-BR-145,
    BEH-BR-146*.
90. **Interception details.** SPEC.md listed three sources without order →
    a fixed composition order; optional and reactive captures are
    intercepted; application callers of `Host.use` are not wrapped; a `wrap`
    failure fails the consumer's activation — *BEH-BR-151, BEH-BR-152*.
91. **Reconcile details.** SPEC.md was silent → duplicate entries reject the
    whole list; "same definition" needs `version` and `digest` on both
    definitions; a desired entry naming a plugin installed by hand or another
    scope is rejected with `DuplicatePlugin`; reconciles are serialized per
    host; an admitted entry that then fails operationally is reported in
    `rejected` with that error (union extended) — *BEH-BR-153, BEH-BR-154,
    BEH-BR-155, BEH-BR-156, BEH-BR-157*.
92. **Reconcile under audit failure.** SPEC.md: an invalid entry "does not
    stop the others" → reversed for audit unavailability and for a latch set
    during the call: reconcile stops, and applied entries are not undone —
    *BEH-BR-157*.
93. **Registry details.** SPEC.md listed `LeaseTimeout` with no way to set a
    timeout → `use`/`useAll` take a per-call `timeout`; `Options.name` added;
    a `NaN` or infinite priority is refused; a removed id is reserved until
    its removal completes — *BEH-BR-162, BEH-BR-163, BEH-BR-164*.
94. **Generation details.** SPEC.md was silent → closing a generation's
    scope drains with a bound and then revokes; the revision starts at 0;
    `publish` does not reopen admission; `awaitDrained` does not close
    admission; forced revocation is routed through `ActivePlugin` or logged,
    and is not audited — *BEH-BR-169, BEH-BR-170, BEH-BR-173, BEH-BR-174*.
95. **Test host details.** SPEC.md named `step` and the faults only → a step
    ends at the next revision or at a point that needs the test's input;
    `buildFails`, `stopFails`, `holdLease` last while their scope is open, and
    `runtimeFailure` fires once — *BEH-BR-178, BEH-BR-180*.
96. **Audit writer details.** New → a failed write is retried in place; the
    writer queue holds 1024 records, and a record dropped for overflow is
    never numbered, so it shows in `auditDropped`, the error log and the latch
    rather than as an `auditSeq` gap; `auditTimeout` has no `"forever"` form —
    *BEH-BR-202, BEH-BR-204*.

### 2.7 Consistency fixes from the review recorded as CCR-BR-002

97. **When `WouldDeadlock` is decided.** SPEC.md: calls from a fiber that
    would wait for a plugin it holds "fail immediately with `WouldDeadlock`"
    → a mutating call is checked for re-entrancy after its `requested` record
    is written and before its intent is recorded, so the refusal is not a
    pre-gate check; the call ends with a `failed` terminal record carrying
    `WouldDeadlock` — *BEH-BR-188 (step 7), BEH-BR-066, BEH-BR-088,
    INV-BR-016*.
98. **Scope-close shutdown and the attribution policy.** SPEC.md: closing the
    host scope performs the same shutdown → the host-originated `shutdown`
    performed by closing the scope is exempt from `attribution.require` and
    `attribution.requireReason` and is attributed to `Actor.system`; an
    explicit `shutdown()` call is still checked (see item 23) —
    *BEH-BR-189, BEH-BR-108, INV-BR-025*.
99. **`install` does not decode its configuration override.** SPEC.md:
    `InstallOptions.config` is an "initial override (as reconfigure would
    set)" → configuration values are decoded at the call for `reconfigure`
    only; an undecodable `install` override is an activation failure with
    phase `activation` (see item 58), and the `configChange.paths` of an
    `install` (in its audit records and its gate request) are the raw
    override's top-level keys, never values — *BEH-BR-022, BEH-BR-188,
    BEH-BR-197, BEH-BR-219, INV-BR-028*.
100. **`droppedSinceAck` on the acknowledgement record.** New → `AuditRecord`
     gains an optional `droppedSinceAck: number`, present only on
     `acknowledgeAuditDegraded` records, carrying the overflow drops since
     the previous acknowledgement (see item 96). `schemaVersion` stays `1`:
     the specification is pre-release, so no record of the earlier shape has
     been produced and no version bump is needed — *BEH-BR-195, BEH-BR-196,
     BEH-BR-202, BEH-BR-206*.
101. **`Desired.overlay` is specified.** SPEC.md described it in prose only:
     merges patches by `id` in order, later wins, `config` merged deeply →
     a REQUIREMENT in BEH-BR-153: `Desired.overlay` is pure, merges patches
     by `(id, realm)` in order, later wins, merges `config` deeply and
     performs no I/O; acceptance check 29 of BEH-BR-184 also covers it —
     *BEH-BR-153, BEH-BR-184*.
102. **Gating by definition digest.** SPEC.md used `meta.version` and
     `meta.digest` only for `reconcile`'s "same definition" comparison → the
     `OperationRequest` and the audit records carry the definition's
     `version` and `digest`, so a gate can refuse a definition by digest;
     acceptance check 42 of BEH-BR-184 covers it — *BEH-BR-184, BEH-BR-196,
     BEH-BR-219*.

_Previous: [README](../README.md)_ · _Next: [Cordis comparison](./cordis-comparison.md)_
