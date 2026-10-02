# Overview

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-OVW                                                  |
> | Revision       | 0.3                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification — Overview                          |
> | Change History | 0.3 (2026-10-02): Parked stops, `DrainTimeout` fields, `Interrupted` record-only tag, TestHost members; `intent-ended` record and `resumes` (CCR-BR-008)<br>0.2 (2026-10-02): Consistency fixes from independent review (CCR-BR-002)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001) |

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
set can be attributed to an actor and recorded through an `AuditSink`, and can
be refused by an `OperationGate`. The core makes no compliance claim it has not
assembled and tested ([ADR-BR-028](./decisions/028-gxp-scope.md)).

## Packages

| Package | Status | Contents |
| ------- | ------ | -------- |
| `@bridger/core` | Specified here; not implemented | Host, plugin definition, leases, events, realms, reconcile, ContributionRegistry, Generation, GxP ports |
| `@bridger/core/testing` | Specified here; not implemented | `TestHost`, `Fault.*`, test clock and identifier fixtures, in-memory audit sink and scripted gate fixtures |
| `@bridger/gxp` | Planned; specified later in `references/gxp/` | Durable audit-trail adapter contract, approval and e-signature through `OperationGate`, IQ/OQ evidence from executed tests |
| `@bridger/react`, `@bridger/foldkit`, loader adapters | Out of this specification | Consumers of the core's public API (`docs/REACT-API.md`, `docs/FOLDKIT-API.md`) |

## Public API surface

All signatures are illustrative until code exists.

### Plugin definition — [behaviour 01](./behaviors/01-plugin-definition.md)

| Export | Kind | Purpose |
| ------ | ---- | ------- |
| `Plugin.define` | function | Declares a plugin; infers `requires`/`provides` as const tuples and checks the `build` layer against them |
| `Plugin.fromEffect` | function | Builds the `Layer` from an Effect that returns a `Context` |
| `Plugin.group` | function | A plugin that mounts members as one unit |
| `Plugin.Runtime` | service | `background`, `reportFailure`, `optional`, `useOptional`, `whenAvailable`, `install` |
| `Plugin.Config` | service | `{ value, current, changes }` for the decoded configuration |
| `PluginDefinition`, `Keys`, `IdentifiersOf`, `ServicesOf` | types | Definition shape and type helpers |

### Host — behaviours [02](./behaviors/02-host-construction.md)–[13](./behaviors/13-observability-and-diagnostics.md)

| Export | Kind | Purpose |
| ------ | ---- | ------- |
| `Bridger.layer`, `Bridger.make` | functions | Construct a host (Layer first; `make` for scoped code) |
| `Bridger.Host` | service | The host |
| `Host.install`, `remove`, `replace`, `retry`, `reconfigure`, `restart`, `disable`, `enable` | methods | Lifecycle operations, linearized per plugin, all attributable |
| `Host.reconcile`, `defineRealm` | methods | Desired-state convergence, realm definition |
| `Host.use`, `useAll`, `lease` | methods | Leased access to services |
| `Host.snapshot`, `changes`, `events`, `inspect`, `awaitIdle` | members | Observation and diagnostics; a parked stop shows as `parked` in the snapshot and `inspect`, with `stop-parked` and `stop-resumed` events |
| `Host.shutdown`, `acknowledgeAuditDegraded` | methods | Shutdown with `CloseReport`; leaving the audit latch |
| `PluginHandle`, `PluginRef`, `PluginState`, `PluginSnapshot`, `HostSnapshot`, `CloseReport`, `HostEvent`, `PluginInspection` | types | Handles, references, snapshots, reports |
| `BridgerOptions`, `InstallOptions`, `RemoveOptions`, `ReplaceOptions`, `OperationOptions`, `ConfigSource` | types | Options |

### Composition — behaviours [14](./behaviors/14-children-and-groups.md)–[20](./behaviors/20-generation.md)

| Export | Kind | Purpose |
| ------ | ---- | ------- |
| `Bridger.Events`, `Event.make`, `EventKey`, `EventBus` | service, function, types | Typed event bus |
| `RealmOptions`, `Interception` | types | Realms and per-consumer service wrapping |
| `DesiredPlugin`, `ReconcileOptions`, `ReconcileReport`, `Desired.overlay` | types, function | Declarative plugin lists |
| `ContributionRegistry.make`, `ContributionRegistry.Registry` | function, type | Shared extension points |
| `Generation.make`, `Generation`, `Retired`, `Lease`, `DrainOptions`, `GenerationOptions` | function, types | Atomic publication with admission control |

### GxP hooks — behaviours [22](./behaviors/22-attributable-operations.md)–[25](./behaviors/25-operation-gate.md)

| Export | Kind | Purpose |
| ------ | ---- | ------- |
| `Actor`, `Actor.system`, `Actor.unattributed` | type, constants | Who performed an operation |
| `OperationContext`, `CurrentActor` | type, reference | Actor, reason and correlation for a call |
| `AuditSink`, `AuditRecord`, `AuditPhase` | port, types | Sequenced lifecycle records handed to a sink, including the `intent-ended` system record (`endsIntentOf`) and `resumes` on a resuming call's terminal record; losses are signalled by the latch |
| `OperationGate`, `OperationRequest` | port, type | Refuse or approve a lifecycle operation |
| `IdGenerator` | service | Identifiers for records and hosts |
| `verifyAuditSequence` | function | Gap and duplicate detection over records — not tamper evidence |

### Testing — [behaviour 21](./behaviors/21-testing-host.md)

`TestHost` (with `step`, `stepPlugin`, `pending` and `runUntilIdle` over a
deterministic order of pending transition steps and waits), `PendingStep`,
`Fault.buildFails`, `Fault.stopFails`, `Fault.holdLease`,
`Fault.runtimeFailure`, and fixtures for the clock, identifiers, audit sink and
gate.

## Errors

Every error is a `Schema.TaggedError` carrying identifiers and messages, never
configuration values, keys, fibers or raw causes
([ADR-BR-008](./decisions/008-error-taxonomy.md)).

| Group | Errors |
| ----- | ------ |
| Definition (`InstallError`) | `DuplicatePlugin`, `DuplicateProvider`, `DependencyCycle`, `InvalidDefinition`, `UnknownRealm` |
| Operations | `ReplaceError`, `UnknownPlugin`, `Conflict`, `Superseded`, `HostClosed`, `ConfigInvalid`, `CleanupError`, `IdleTimeout`, `DuplicateRealm` |
| Leases | `ServiceUnavailable`, `LeaseRevoked`, `LeaseTimeout`, `DrainTimeout`, `WouldDeadlock`, `KeyMismatch` |
| Handles | `ActivationFailed`, `PluginRemoved`, `WaitTimeout` |
| Helpers | `AdmissionClosed`, `DuplicateContribution`, `ContributionUnavailable` |
| GxP | `Unattributed`, `ReasonRequired`, `AuditUnavailable`, `AuditWriteFailed`, `OperationRejected` |

`DrainTimeout { id, leases, target? }` names in `id` the plugin (or
`Generation`) whose leases did not drain, or whose running transition step the
call was waiting for (`leases` is 0 when that step is a build), and, in
`target`, the plugin the call named when the two differ. `Interrupted` is a
record-only tag: it appears only in `AuditRecord.error`, for a call
interrupted after its `requested` record is enqueued and before its intent,
and is never a member of an error union.

## Core exclusions

The core does not fetch, verify, version or sandbox plugin code; does not
manipulate the module cache; has no domain model, database, tenant or migration
interface; has no HTTP, UI or CLI integration; has no file watcher or hot
module replacement policy; does not compensate external effects; and does not
authenticate, store, retain or protect audit records
([ADR-BR-027](./decisions/027-core-exclusions.md)). Realms and interceptions
change service resolution only; they are not isolation boundaries.

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
