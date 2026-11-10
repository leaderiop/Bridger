# Overview

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-OVW                                                  |
> | Revision       | 0.12                                                         |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification — Overview                          |
> | Change History | 0.12 (2026-11-10): `@bridger/gxp` row: specified as a Draft (C20); `@bridger/audit-chain` row cites CCR-AC-001–004 (audit round 2, Low) (CCR-BR-034)<br>0.11 (2026-11-09): `Contract.local` and `LocalMember` (local contracts, never across a host); `InvalidDefinition` among the load causes (U-05) (CCR-BR-033)<br>0.10 (2026-11-09): `InvalidRealm` in the operation errors (C-02) (CCR-BR-032)<br>0.9 (2026-11-08): Companion rows updated for round 2 (CCR-RM/FD/DB/LD/AC/EN/CM/MC/AG/KT-003); `@bridger/workers-for-platforms` adapter row; `@bridger/event-store`, `@bridger/sequence`, `@bridger/keyring` rows; API rows for the call-log kind "dispatch", string epochs, registry entry `owner` and `Registry.revocations` (CCR-BR-027)<br>0.8 (2026-11-08): Hook point, lazy and Host rows: declarations, `HostLink`, held event, idle return, phases, targets, policy deny (CCR-BR-024); `ReconcileOptions.atomic`, desired-entry policy, `mandatoryCatalog`, contract registries, `MethodSpec.timeout`, handoff `alsoOn` and `cold`, errors `PolicyMismatch`, `ApplyRolledBack`, `PartialApply` (CCR-BR-025); `RefusalList`, `AccessPolicy.declaredOnly`/`ask`, `CurrentCorrelation`, `offerCallEntry`, `Plugin.Runtime.unmount`, `settle`, call-log failure policy, `buildTimeout` (CCR-BR-026)<br>0.7 (2026-11-08): `CurrentPlugin` row: "on whose behalf" (CCR-BR-022)<br>0.6 (2026-11-08): Contracts and manifests API, loading errors, `baseContracts` (CCR-BR-017); principal, policy and annotations API and errors (CCR-BR-018); hook points, gates, plans, realm families and handoff API and errors (CCR-BR-019); `Plugin.Any`, `HeldPlugins`, `EntitlementView`, `Plugin.Runtime.entitled` (CCR-BR-020); companion package rows, guides pointer, core exclusions extended (CCR-BR-021)<br>0.5 (2026-10-03): API surface: `Host.controls` and `HostControls`, the `ConfigFingerprinter` port and `ConfigChange`, `ConfigFingerprintUnavailable` and `ConfigFingerprintFailed`, the `fingerprintTimeout` option, `CloseReport.auditLastSeq` (CCR-BR-014)<br>0.4 (2026-10-03): The gate covers operator mutations other than `shutdown`; system transitions are recorded, never gated (consistency pass) (CCR-BR-013)<br>0.3 (2026-10-02): Parked stops, `DrainTimeout` fields, `Interrupted` record-only tag, TestHost members; `intent-ended` record and `resumes` (CCR-BR-008)<br>0.2 (2026-10-02): Consistency fixes from independent review (CCR-BR-002)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001) |

---

## Mission

`@bridger/core` lets an Effect v4 application install, remove and replace
plugins while it runs. A plugin declares the services it requires and provides;
the host starts it when its requirements are available, owns its Effect scope,
stops its dependents before it leaves, and never lets a provider close under a
call that is using it.

The host knows nothing about what plugins mean. It contains no domain model,
database, tenant, UI framework, package manager or deployment format. The
Bridger ERP is one application of it.

New readers can start with the [guides](../../docs/guides/README.md) —
"Bridger in 5 minutes" and one guide per persona — which use the
developer-experience companion [`@bridger/kit`](../kit/README.md). The guides are
informative; this specification is normative.

## Design philosophy

**Effect is the substrate, not a dependency to hide.** A plugin's `build` is an
ordinary Effect `Layer` ([ADR-BR-002](./decisions/002-plugin-build-is-a-layer.md)).
Scopes, finalizers, `Context` services, `Schema` errors, `ConfigProvider`,
`SubscriptionRef` and `PubSub` are used as Effect defines them. Bridger adds
what Effect does not have: dynamic wiring of layers that arrive and leave at
runtime.

**Guarded withdrawal.** Removing a provider stops its dependents first, waits
for the leases on it, and only then closes it. A dependent can still use its
provider in its own finalizers. Waiting is bounded, and forcing is explicit
for an operator's call: a call whose drain expires fails with `DrainTimeout`
and leaves every stop it was driving parked for an operator to resume, while a
stop that no caller waits for revokes at the limit rather than hang
([ADR-BR-015](./decisions/015-leases-one-primitive.md)). When a cascade or
shutdown ends a parked operator intent instead, an `intent-ended` audit record
says so; a call that resumes a parked operation names it in `resumes` on its
own terminal record.

**State is data, failure is visible.** Every plugin's state is published as an
immutable, discriminated snapshot. A failed plugin stays failed until someone
acts ([ADR-BR-005](./decisions/005-failure-is-sticky.md)); every operation in
every state has a defined outcome ([ADR-BR-013](./decisions/013-total-operation-legality.md)).

**Attributable by construction, honest by rule.** Every mutation of the plugin
set can be attributed to an actor and recorded through an `AuditSink`, and every
operator mutation except `shutdown` can be refused by an `OperationGate`;
system transitions are recorded, never gated. The core makes no compliance claim it has not
assembled and tested ([ADR-BR-028](./decisions/028-gxp-scope.md)).

## Packages

| Package | Status | Contents |
| ------- | ------ | -------- |
| `@bridger/core` | Specified here; not implemented | Host, plugin definition, leases, events, realms, reconcile, ContributionRegistry, Generation, GxP ports |
| `@bridger/core/testing` | Specified here; not implemented | `TestHost`, `Fault.*`, test clock and identifier fixtures, in-memory audit sink and scripted gate fixtures |
| `@bridger/gxp` | Companion; specified as a Draft in [references/gxp/](../gxp/README.md) (CCR-GX-001–004); not implemented | Durable audit-trail adapter contract, approval and e-signature through `OperationGate`, IQ/OQ evidence from executed tests |
| `@bridger/remote` | Companion; specified as a Draft in [references/remote/](../remote/README.md) (CCR-RM-001–003); not implemented | Remote proxy plugins (`Remote.define`), `Guest.serve`, sessions and epochs, heartbeats and withdrawal, call deadlines, per-call tokens, the `Transport` interface, `TestTransport`; placement by residency label, per-principal budgets, `DedupeStore`; `Transport.postMessage` for sandboxed browser frames (BEH-RM-070) |
| `@bridger/worker`, `@bridger/worker-loader`, `@bridger/workerd`, `@bridger/wasm` | Transport adapters of `@bridger/remote`; obligations specified in [references/remote/behaviors/07](../remote/behaviors/07-transports-and-adapters.md); not implemented | `worker_threads` (first), Worker Loader / service binding, self-hosted workerd behind an operator VM or container, later WebAssembly. Isolation, where any exists, is provided by the host mechanism, never by Bridger |
| `@bridger/workers-for-platforms` | Remote transport adapter for a provider dispatch namespace; obligations specified in [remote BEH-RM-071](../remote/behaviors/09-placement-budgets-and-adapters.md) (CCR-RM-003); not implemented | Adapter of `@bridger/remote`; isolation, where any exists, is the provider's, never Bridger's |
| `@bridger/federation` | Companion; specified as a Draft in [references/federation/](../federation/README.md) (CCR-FD-001–003); not implemented | Signed per-host desired-state manifests applied through `reconcile`; offline boot, offline cap and re-bootstrap; links with an N/N−1 skew handshake; exports and imports across hosts, each peer in its own realm; fenced single-owner exports; a kill path apart from desired state, outbox pushed before a re-bootstrap snapshot, one version-skew model |
| `@bridger/durable-bus` | Companion; specified as a Draft in [references/durable-bus/](../durable-bus/README.md) (CCR-DB-001–003); not implemented; the name is intent, not a claim (ADR-DB-007) | Versioned events (`DurableEvent.make`), transactional outbox through a storage port, at-least-once delivery, deduplicating inbox, upcasters, order per origin, stream and sequence, hybrid logical clocks; a separate contract from `Bridger.Events`; makes no persistence claim of its own — that is the storage adapter's and the consumer's; `PayloadCodec` for payload encoding (for example field encryption), `AccessPolicy.ask` at delivery, `publishVersion` with round-trip-checked downcasts |
| `@bridger/loader` | Companion; specified as a Draft in [references/loader/](../loader/README.md) (CCR-LD-001–003); not implemented | Fetch, digest and signature verification before evaluation, revocation and kill switch, catalog of signed manifests; builds the `load` Effect of a lazy plugin; typed signed statements and one verification step (`SignaturePolicy.verify`); signed data packs, never evaluated; backs `RefusalList` from its revocation set |
| `@bridger/audit-chain` | Companion; specified as a Draft in [references/audit-chain/](../audit-chain/README.md) (CCR-AC-001–004); not implemented | `HashChainSink` wrapping the `AuditSink` port, `Anchor` port publishing Merkle roots off the write path, `verifyChain` (built on `verifyAuditSequence`) and inclusion proofs; detection only, within ADR-BR-034 non-claim 5; generic `ChainSink<R>` over any append-only stream; offline verification bundles |
| `@bridger/entitlement` | Companion; specified as a Draft in [references/entitlement/](../entitlement/README.md) (CCR-EN-001–003); not implemented | `Entitlement` port, entitlement gate piece, the view behind `Plugin.Runtime.entitled`, `Entitlement.guard`, `Budget` reservations, optional `BudgetLedger`; grant narrowing on lapse through `CapabilityPolicy.changes`, budget refunds through `settle`, usage export |
| `@bridger/command` | Companion; specified as a Draft in [references/command/](../command/README.md) (CCR-CM-001–003); not implemented | Command catalog, dispatch through a gate and hook points, idempotency receipts, handler wrappers, breakers, batches, long-command tasks, toolsets, JSON Schema projection, model-facing envelope |
| `@bridger/mcp` | Companion; specified as a Draft in [references/mcp/](../mcp/README.md) (CCR-MC-001–003); not implemented | MCP server and client over toolsets; inbound taint, calls pinned to listed digests, resources from read-only commands; host tools with plan-first reconcile |
| `@bridger/agent` | Companion; specified as a Draft in [references/agent/](../agent/README.md) (CCR-AG-001–003); not implemented | Agent keys, model per session, tasks and bridges, taint and provenance, envelopes, batches of tool calls, subagents, agent testing |
| `@bridger/kit` | Companion; specified as a Draft in [references/kit/](../kit/README.md) (CCR-KT-001–003); not implemented | Authoring facade, test harness, conformance kits, CLI, Promise SDK generator, devtools inspector, error catalog; `countersign`, `verify-chain` |
| `@bridger/event-store` | Companion; specified as a Draft in [references/event-store/](../event-store/README.md) (CCR-ES-001); not implemented | `Stream.append` with expected versions and `WrongExpectedVersion`, deciders (`Aggregate.handle`/`run`), facts never rejected (`Aggregate.record`), projections with checkpoints and rebuild, snapshots as a cache, `DurableEvent` versions and upcasters, outbox in the append's transaction, optional `ChainSink<R>` chaining; `EventStoreAdapter` port with SQLite and Postgres obligations; makes no persistence claim |
| `@bridger/sequence` | Companion; specified as a Draft in [references/sequence/](../sequence/README.md) (CCR-SQ-001); not implemented | `Series.open(origin, name)`, `next()` in the caller's transaction, `close(reason)`, `verifySeries`, incarnation bump closing superseded series; formats stay in the application |
| `@bridger/keyring` | Companion; specified as a Draft in [references/keyring/](../keyring/README.md) (CCR-KR-001); not implemented | `Keyring.key(subject)`, `Keyring.fields` as a `PayloadCodec`, `shred(subject)` with tombstone, key destruction, redaction callbacks and notices; `KeyStore`/`KeyWrapper` obligations; no erasure claim |
| `@bridger/react`, `@bridger/foldkit` | Out of this specification | Consumers of the core's public API (`docs/REACT-API.md`, `docs/FOLDKIT-API.md`) |

## Public API surface

All signatures are illustrative until code exists.

### Plugin definition — [behaviour 01](./behaviors/01-plugin-definition.md)

| Export | Kind | Purpose |
| ------ | ---- | ------- |
| `Plugin.define` | function | Declares a plugin; infers `requires`/`provides` as const tuples and checks the `build` layer against them |
| `Plugin.fromEffect` | function | Builds the `Layer` from an Effect that returns a `Context` |
| `Plugin.group` | function | A plugin that mounts members as one unit |
| `Plugin.Runtime` | service | `background`, `reportFailure`, `optional`, `useOptional`, `whenAvailable`, `install`, `principal`, `asSelf`, `entitled` |
| `Plugin.Config` | service | `{ value, current, changes }` for the decoded configuration |
| `PluginDefinition`, `Plugin`, `Plugin.Any`, `Keys`, `IdentifiersOf`, `ServicesOf` | types | Definition shape, the branded result of `define`, the type every definition fits (heterogeneous lists, `install`), and type helpers |

### Host — behaviours [02](./behaviors/02-host-construction.md)–[13](./behaviors/13-observability-and-diagnostics.md)

| Export | Kind | Purpose |
| ------ | ---- | ------- |
| `Bridger.layer`, `Bridger.make` | functions | Construct a host (Layer first; `make` for scoped code) |
| `Bridger.Host` | service | The host |
| `Host.install`, `remove`, `replace`, `retry`, `reconfigure`, `restart`, `disable`, `enable` | methods | Lifecycle operations, linearized per plugin, all attributable |
| `Host.reconcile`, `plan`, `defineRealm`, `retireRealm`, `wake`, `declaredContributions` | methods | Desired-state convergence and its read-only plan, realm definition and retirement of empty realms, waking lazy plugins, reading what plugins not yet loaded declare |
| `Host.use`, `useAll`, `lease` | methods | Leased access to services |
| `Host.snapshot`, `changes`, `events`, `inspect`, `awaitIdle`, `controls` | members | Observation and diagnostics; `controls` reports the host's wiring, GxP limits (`auditTimeout`, `gateTimeout`, `fingerprintTimeout`, `buildTimeout`), call-log counters and audit position, and stays readable after close; a parked stop shows as `parked` in the snapshot and `inspect`, with `stop-parked` and `stop-resumed` events |
| `Host.shutdown`, `acknowledgeAuditDegraded` | methods | Shutdown with `CloseReport`; leaving the audit latch |
| `PluginHandle`, `PluginRef`, `PluginState`, `PluginSnapshot`, `HostSnapshot`, `CloseReport`, `HostEvent`, `PluginInspection`, `HostControls` | types | Handles, references, snapshots, reports (`CloseReport.auditLastSeq` with a sink) |
| `BridgerOptions`, `InstallOptions`, `RemoveOptions`, `ReplaceOptions`, `OperationOptions`, `ConfigSource` | types | Options (`BridgerOptions` includes `fingerprintTimeout`, default 5 seconds, `baseContracts`, `mandatory`, `mandatoryCatalog`, `resolutionTimeout`, `callLogTimeout` and `handoffTimeout`) |
| `Host.offerCallEntry`, `OfferedCallEntry`, `CallLogUnavailable`, `InvalidCallEntry`, `PrincipalRef.encode`/`decode` | member, types, errors | Companion call-log entries, fail-closed logging, principal encoding across hosts (29) |
| `DispatchInfo`, entry kind "dispatch"; `CrossingInfo.epoch` / `RevocationInfo.epoch` as strings | type, value, fields | A companion dispatch that ran or replayed a stored outcome, offered to the call log; opaque session epochs (29, BEH-BR-280; CCR-BR-027) |
| `HeldPlugins` | reference | `@bridger/core/HeldPlugins` (BEH-BR-088), exported so that companions that run work on another fiber on behalf of a lease holder can carry it |

### Composition — behaviours [14](./behaviors/14-children-and-groups.md)–[20](./behaviors/20-generation.md)

| Export | Kind | Purpose |
| ------ | ---- | ------- |
| `Bridger.Events`, `Event.make`, `EventKey`, `EventBus` | service, function, types | Typed event bus |
| `RealmOptions`, `Interception` | types | Realms and per-consumer service wrapping |
| `DesiredPlugin`, `ReconcileOptions`, `ReconcileReport`, `Desired.overlay` | types, function | Declarative plugin lists |
| `ContributionRegistry.make`, `ContributionRegistry.Registry` | function, type | Shared extension points |
| `Plugin.Runtime.unmount` | member | Attributed removal of a child (14) |
| `Generation.make`, `Generation`, `Retired`, `Lease`, `DrainOptions`, `GenerationOptions` | function, types | Atomic publication with admission control |

### GxP hooks — behaviours [22](./behaviors/22-attributable-operations.md)–[25](./behaviors/25-operation-gate.md)

| Export | Kind | Purpose |
| ------ | ---- | ------- |
| `Actor`, `Actor.system`, `Actor.unattributed` | type, constants | Who performed an operation |
| `OperationContext`, `CurrentActor` | type, reference | Actor, reason and correlation for a call |
| `CurrentCorrelation` | reference | Correlation id of the request in the fiber (22) |
| `AuditSink`, `AuditRecord`, `AuditPhase` | port, types | Sequenced lifecycle records handed to a sink, including the `intent-ended` system record (`endsIntentOf`) and `resumes` on a resuming call's terminal record; losses are signalled by the latch |
| `OperationGate`, `OperationRequest` | port, type | Refuse or approve a lifecycle operation |
| `ConfigFingerprinter`, `ConfigChange` | port, type | Optional: opaque fingerprints of selected configuration values, taken at step 4a before the gate and carried with the changed paths; core computes no fingerprint ([ADR-BR-039](./decisions/039-config-fingerprint-port.md)) |
| `IdGenerator` | service | Identifiers for records and hosts |
| `verifyAuditSequence` | function | Gap and duplicate detection over records — not tamper evidence |
| `EntitlementView`, `EntitlementState` | port, type | Optional: per-activation entitlement stream behind `Plugin.Runtime.entitled`; core interprets nothing ([entitlement companion](../entitlement/README.md)) |

### Contracts and manifests — behaviours [26](./behaviors/26-versioned-contracts.md)–[27](./behaviors/27-manifest-and-lazy-activation.md)

| Export | Kind | Purpose |
| ------ | ---- | ------- |
| `Contract.make`, `Contract.method`, `Contract.at` | functions | A versioned service key with a Schema description of its methods; a provision of a lower version of one major |
| `Contract.local`, `LocalMember` | function, type | A versioned service key whose members are named without codecs, for a service that never crosses a host; boundary companions refuse it (BEH-BR-225) |
| `Contract.satisfies`, `Contract.maxSatisfying`, `Contract.parseOptions` | functions, constant | Range matching within one major; the decoding rule every companion codec uses (unknown fields ignored) |
| `Contract`, `ContractRequirement`, `ContractProvision`, `ContractDescriptor`, `ContractVersion`, `ContractRange`, `MethodSpec` | types | Contract references and their plain-data descriptor; optional per-method `timeout`, read by companion proxies, never enforced by core |
| `ContributionRegistry.make({ contract, range })`, `Registry.within`, `AddOptions.implements` | function, method, option | Contract-checked registries; read by range |
| `RegistryView` entry `owner`, `Registry.revocations`, `HoldRevoked` | field, stream, type | The contributing plugin of an entry (diagnostic); notices when a removal revokes holders at `drainTimeout` (19, BEH-BR-165, BEH-BR-167; CCR-BR-027) |
| `PluginManifest`, `Manifest.consentDiff`, `ConsentDiff` | schema, function, type | The manifest as data; a pure diff of what an upgrade asks for |
| `Plugin.lazy`, `LazyPluginDefinition`, `LazyTrigger`, `Host.wake`, `WakeReport`, `Host.declaredContributions`, `DeclaredContribution`, `HostLink` | function, types, method, reference | Register a plugin from its manifest; load it when a trigger applies; hold the triggering event; return it to dormant when idle; read declared contributions without loading |
| `Bridger.version` | constant | The version of `@bridger/core`, checked against `engines["@bridger/core"]` |

### Principal, policy and annotations — behaviours [28](./behaviors/28-plugin-principal-and-mandatory-policy.md)–[30](./behaviors/30-operation-context-annotations.md)

| Export | Kind | Purpose |
| ------ | ---- | ------- |
| `CurrentPlugin`, `PluginPrincipal`, `PrincipalRef` | reference, types | Host-minted identity of the plugin on whose behalf a fiber runs; `onBehalfOf` on records — attribution, not isolation |
| `MandatoryInterception`, `Consumer` | types | Interceptions no child or operation can remove, also covering `Host.use` |
| `AccessPolicy`, `AccessRequest`, `AccessDecision` | port, types | Optional: who may listen, emit, contribute or mount children |
| `AccessPolicy.declaredOnly`, `AccessPolicy.ask`, `AccessRefused`, `DeclaredAccess` | helpers, error, type | Compare access with the manifest; companion buses consult the same policy (28) |
| `RefusalList`, `RefusalSubject` | port, type | Optional: digests the host must not start, consulted on every start (28) |
| `CapabilityPolicy`, `ResolutionRequest`, `Grant` | port, types | Optional: per-capture grants narrowing a service to named members; `changes` re-resolves live captures |
| `CallLog`, `CallEntry`, `CurrentCall` | port, types, reference | Optional: one entry per intercepted call; seam for per-call tokens (remote companion); failure policy drop or refuse (BEH-BR-279); entry kinds |
| `Annotation`, `Annotations`, `AnnotationKey`, `CurrentAnnotations` | functions, types, reference | Typed labels (`Deadline`, `Taint`, `Provenance`, companion keys) carried along declared flows |

### Decisions, plans, realm families and handoff — behaviours [31](./behaviors/31-hook-points.md)–[34](./behaviors/34-state-handoff.md)

| Export | Kind | Purpose |
| ------ | ---- | ------- |
| `HookPoint.make`, `HookPoint`, `HookRole`, `HookResult`, `HookOutcome`, `HookDecisionRecord`, `AdmissionRule`, `OnErrorPolicy`, `DormantPolicy`, `TargetOptions`, `ContributionPolicy`, `PolicyDecision`, `SettleStep` | function, types | Policied multi-plugin decisions: roles, application admission rule over owner, labels and request, phases enrich → veto → advise, timeout, deadline, breaker per contribution or plugin, targets, policy skip and deny, a settle step after each call, declarations of plugins not yet loaded, decision record |
| `Selector.make`, `Selector` | function, type | Per-call choice among implementations contributed to one registry, optionally within a contract range |
| `Gate`, `Gate.run`, `Gate.all`, `GateContext`, `GateDecision`, `Draft`, `Draft.check`, `OperationGate.fromGate`, `OperationGate.asGate` | types, functions | Generic Allow/Refuse/Defer gate; drafts with expected versions; adapters to the host port |
| `Host.plan`, `ReconcilePlan`, `ReconcileOptions.expect`, `ReconcileOptions.atomic` | method, types | Read-only dry run of `reconcile`; apply a plan or nothing; apply all entries or undo them |
| `DesiredPlugin.mandatoryInterceptions`, `DesiredPlugin.allowChildren`, `RegisteredInterception` | fields, type | Mandatory policy in a desired list, by catalog id |
| `Realm.family`, `Realm.ephemeral`, `Host.retireRealm`, `Actor.narrow`, `Actor.isWithin` | functions, method | Per-key and per-task realms created and retired through public operations; a narrowed actor label |
| `Handoff` (definition field, incl. `alsoOn`), `HandoffCallOptions.cold`, `BridgerOptions.handoffTimeout` | type, option | In-memory state handoff on replace, and on restart or a restarting reconfigure when declared, with an audited cold start |

### Testing — [behaviour 21](./behaviors/21-testing-host.md)

`TestHost` (with `step`, `stepPlugin`, `pending` and `runUntilIdle` over a
deterministic order of pending transition steps and waits), `PendingStep`,
`Fault.buildFails`, `Fault.stopFails`, `Fault.holdLease`,
`Fault.runtimeFailure`, `Fault.loadFails`, handoff faults, and fixtures for the
clock, identifiers, audit sink, gate (`OperationGate` and `Gate<Req>`), access
and capability policies, the refusal list and the call log.

## Errors

Every error is a `Schema.TaggedError` carrying identifiers and messages, never
configuration values, keys, fibers or raw causes
([ADR-BR-008](./decisions/008-error-taxonomy.md)).

| Group | Errors |
| ----- | ------ |
| Definition (`InstallError`) | `DuplicatePlugin`, `DuplicateProvider`, `DependencyCycle`, `InvalidDefinition`, `UnknownRealm`, `IncompatibleContract`, `IncompatibleEngine` |
| Loading (activation causes, phase "load") | `LoadFailed`, `ManifestMismatch`, `InvalidDefinition` (a loaded definition breaking BEH-BR-003) |
| Operations | `ReplaceError`, `UnknownPlugin`, `Conflict`, `Superseded`, `HostClosed`, `ConfigInvalid`, `CleanupError`, `IdleTimeout`, `DuplicateRealm`, `InvalidRealm` |
| Policy | `ResolutionRefused`, `ChildNotAllowed`, `NoPluginPrincipal`, `AccessRefused`, `CallLogUnavailable`, `InvalidCallEntry`; defects `PrincipalForged`, `PrincipalRetired`, `AccessDenied`, `CapabilityDenied`, `DuplicateAnnotationKey`, `MonotonicAnnotation` |
| Decisions, plans, realms, handoff | `HookRegistrationRefused`, `NoImplementation`, `PlanStale`, `PolicyMismatch`, `ApplyRolledBack`, `PartialApply`, `RealmInUse`, `FamilyMemberUnavailable`, `FamilyEvictionError`, `HandoffError` |
| Leases | `ServiceUnavailable`, `LeaseRevoked`, `LeaseTimeout`, `DrainTimeout`, `WouldDeadlock`, `KeyMismatch` |
| Handles | `ActivationFailed`, `PluginRemoved`, `WaitTimeout` |
| Helpers | `AdmissionClosed`, `DuplicateContribution`, `ContributionUnavailable`, `IncompatibleContract` (contract registries) |
| GxP | `Unattributed`, `ReasonRequired`, `AuditUnavailable`, `AuditWriteFailed`, `OperationRejected`, `ConfigFingerprintUnavailable` (call error), `ConfigFingerprintFailed` (port error) |

`DrainTimeout { id, leases, target? }` names in `id` the plugin (or
`Generation`) whose leases did not drain, or whose running transition step the
call was waiting for (`leases` is 0 when that step is a build), and, in
`target`, the plugin the call named when the two differ. `Interrupted` is a
record-only tag: it appears only in `AuditRecord.error`, for a call
interrupted after its `requested` record is enqueued and before its intent,
and is never a member of an error union.

## Core exclusions

The core does not fetch, verify or sandbox plugin code (it matches contract
versions and ranges, and runs the `load` Effect a lazy plugin is given); does not
manipulate the module cache; has no domain model, database, tenant or migration
interface; has no HTTP, UI or CLI integration; has no file watcher or hot
module replacement policy; does not compensate external effects; and does not
authenticate, store, retain or protect audit records
([ADR-BR-027](./decisions/027-core-exclusions.md)). Realms and interceptions
change service resolution only; they are not isolation boundaries. The
plugin principal, mandatory interceptions, grants and the access policy are
attribution and policy among trusted code, not enforcement against hostile
code; realm families are not tenancy; handoff is not persistence; core
interprets no annotation and acts on no consent diff.

Companions hold what the core excludes, and none adds a host operation,
storage dependency or sandbox claim to it: out-of-process hosting is the
`@bridger/remote` companion
([ADR-RM-001](../remote/decisions/001-remote-plugin-is-a-local-proxy.md)),
which provides no isolation either; host federation and cross-host event
delivery are `@bridger/federation` and `@bridger/durable-bus`; loading and
signature checks are `@bridger/loader`; hash chaining is
`@bridger/audit-chain`; the command catalog, MCP and agent seams, and the CLI,
watcher and development reload are their companions (see the
[README](./README.md#companion-specifications)).

## Worked example

```ts
// illustrative — not type-checked
import { Context, Effect, Layer } from "effect"
import { Actor, Bridger, Plugin } from "@bridger/core"

class Logger extends Context.Service<Logger, {
  readonly log: (message: string) => Effect.Effect<void>
}>()("example/Logger") {}

class Audit extends Context.Service<Audit, {
  readonly record: (event: string) => Effect.Effect<void>
}>()("example/Audit") {}

const logger = Plugin.define({
  id: "example/logger",
  requires: [] as const,
  provides: [Logger] as const,
  build: Layer.effect(Logger, Effect.gen(function* () {
    const sink = yield* Effect.acquireRelease(openLogSink, (s) => s.close)
    return { log: (m) => sink.write(m) }
  }))
})

const audit = Plugin.define({
  id: "example/audit",
  requires: [Logger] as const,
  provides: [Audit] as const,
  build: Layer.effect(Audit, Effect.gen(function* () {
    const log = yield* Logger
    return { record: (e) => log.log(`audit: ${e}`) }
  }))
})

const operator: Actor = { id: "user-42", kind: "user", display: "J. Doe" }

const program = Effect.scoped(Effect.gen(function* () {
  const host = yield* Bridger.make({ attribution: { require: true, requireReason: ["remove"] } })
  const ctx = { context: { actor: operator, reason: "initial deployment" } }

  yield* host.install(audit, ctx)     // waiting: Logger missing
  yield* host.install(logger, ctx)    // Logger starts, then Audit
  yield* host.awaitIdle()

  yield* host.use(Audit, (a) => a.record("started"))

  yield* host.remove("example/logger", { context: { actor: operator, reason: "CR-1234" } })
  // Audit stops first (its finalizers may still use Logger), then Logger closes;
  // Audit remains installed and waits for Logger.
}))
```

With an `AuditSink` wired, each of the three operations above produces one
`requested` and one terminal record, plus `system` records for the automatic
start of Audit and its stop on Logger's removal, and for Logger's own
`system-start` (its activation settling) and `system-stop` (its stop
settling), all sequenced by `auditSeq`
([behaviour 23](./behaviors/23-audit-sink-and-record.md)). When the scope
closes, the host-originated `shutdown` is recorded too, attributed to
`Actor.system` — it is exempt from `attribution.require`
([behaviour 22](./behaviors/22-attributable-operations.md)).

---

_Next: [Glossary](./glossary.md)_
