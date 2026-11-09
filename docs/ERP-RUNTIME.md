# Bridger ERP: how the ERP runs on the Bridger core

Status: **proposal for review, not implemented or type-checked**. Date: 2026-10-02. Names, interfaces and numbers below are proposed. This document joins the generic runtime of the [core reference](../references/core/README.md) (`Host`, [scoped leases](../references/core/behaviors/09-leases.md), [`Generation`](../references/core/behaviors/20-generation.md)) to the ERP contracts in [ERP-SPEC.md](ERP-SPEC.md), [ERP-DISTRIBUTION.md](ERP-DISTRIBUTION.md) and [ERP-STORAGE.md](ERP-STORAGE.md). It **supersedes** the earlier statements that the ERP keeps one Bridger Host per tenant. Policy: all packages target the latest stable Effect 4.x (4.1 at the time of the 2026-11-08 revision; this replaces the earlier 4.0 target).

> **Status banner (2026-11-08): example application, not normative.** This document describes an example ERP application built on Bridger with a server CRUD design: a database row is the source of truth and one server transaction commits each write. It is **not normative** for `@bridger/core` or any companion package, and it is **not the domain layer for local-first or event-sourced systems**; its row-as-truth write path conflicts with event-sourced, offline-first write paths. Such systems build on the [core specification](../references/core/README.md) and the companion specs ([command](../references/command/README.md), [durable-bus](../references/durable-bus/README.md), [federation](../references/federation/README.md), [loader](../references/loader/README.md), [audit-chain](../references/audit-chain/README.md)), and on the event-sourcing companions ([event-store](../references/event-store/README.md), [sequence](../references/sequence/README.md), [keyring](../references/keyring/README.md); Drafts like the others). Where this document and a spec disagree, the spec governs; the [supersession table](ERP-INDEX.md#supersession-table) maps each ERP concept to the spec that now governs it. Nothing here is implemented.

## 1. Decision

| Concern | Decision |
| --- | --- |
| Hosts | **One Bridger `Host` per process.** There is no host per tenant. |
| Module code | A module is activated **once per process and dependency closure**, as one Bridger plugin, and shared by every tenant that uses that closure. Module code is tenant-independent: tenant, company and actor arrive in the request context at call time and are never captured in `build`. |
| Tenant state | Each tenant has a small immutable **tenant generation** held in a `Generation` (core [20 — Generation](../references/core/behaviors/20-generation.md)). Generations are created lazily, evicted when idle, and share their compiled registry with other tenants that have the same module set. |
| Lifetime coupling | A tenant generation holds **scoped leases** (`Host.lease`) on the module activations it references, so a module cannot close while a generation that uses it is current or still draining. |
| Reclaiming code | Module activations that no generation references are removed after an idle grace period. Module code that was imported stays in memory until restart (Node limitation, [ERP-DISTRIBUTION.md](ERP-DISTRIBUTION.md) §5). |

This keeps activation cost proportional to the number of distinct module closures and keeps per-tenant memory small, so the process scales with tenants without scaling Bridger hosts.

## 2. What lives where

```mermaid
flowchart TB
    subgraph Process[One process, one Bridger Host]
        subgraph Platform[Platform plugins]
            Storage[erp.platform/storage]
            Identity[erp.platform/identity]
            Artifacts[erp.platform/artifacts]
            Workers[erp.platform/workers: outbox, jobs, scheduler]
            Coord[erp.platform/coordinator]
        end
        subgraph Modules[Module activations, shared by tenants]
            M1[erp.module/todo@c1]
            M2[erp.module/planning@c2]
        end
        subgraph Tenants[Tenant generations, lazy and evictable]
            TA[Tenant A: Generation]
            TB[Tenant B: Generation]
        end
        Reg[(Compiled registries, shared by module set)]
    end
    Coord --> TA
    Coord --> TB
    TA -.scoped leases.-> M1
    TA -.-> M2
    TB -.-> M1
    TA --> Reg
    TB --> Reg
    M2 -->|requires| M1
```

### Platform plugins

Ordinary Bridger plugins installed at start-up in dependency order: storage (provides the `Storage` adapter), identity (awthaq assembly), artifact store and loader, workers, and the **coordinator** (provides the `ErpCoordinator` service used by the gateway and Module Manager). They use the process-level `config` mechanism of the core (core [11 — Configuration](../references/core/behaviors/11-configuration.md), BEH-BR-097–104).

### Module activations

One plugin per **dependency closure**: ID `erp.module/<moduleId>@<closureDigest12>` and one provided service key `ModuleRuntime` whose identity string is `erp/module/<moduleId>@<closureDigest>`. Keys are created by the loader when an artifact is loaded; they are not compile-time classes. The plugin `requires` the runtime keys of the modules in its `dependsOn` closure, so the core stops dependents before dependencies and a dependency cannot be removed under a live dependent.

## 3. Closure digest

```text
closureDigest(M) = SHA-256 of the sorted list of (moduleId, artifactDigest)
                   for M and every module in its resolved transitive dependsOn set
```

- Optional dependencies (`dependsOn[].optional`) are part of the closure only when present and enabled for the tenant; an absent optional dependency is not `required` by the activation, and callers use `Services.callOptional` ([ERP-RECORDS.md](ERP-RECORDS.md) §7).
- Two tenants whose resolved closure for a module is identical share one activation. If tenant A runs Planning with Todo 1.0 and tenant B runs the same Planning build with Todo 1.1, they have different closures and therefore two Planning activations.
- Resolution happens in the Module Manager from the tenant's desired state (`bridger_module_desired`) and the dependency ranges in the manifests ([ERP-DISTRIBUTION.md](ERP-DISTRIBUTION.md) §3 and §8). A tenant whose desired set has no consistent closure cannot be enabled (`DependencyMissing`).
- The number of simultaneous closures is bounded by `maxResidentClosures` (default 16). Activating a closure beyond the limit fails with `ResidentLimit` until idle closures are reclaimed or the process is restarted.

## 4. The module runtime

What the module's `build` effect produces, under the module activation's scope:

```ts
interface ModuleRuntime {
  readonly moduleId: string
  readonly version: string
  readonly digest: string
  readonly closureDigest: string
  readonly models: readonly ModelRuntime[]           // validators, constraints, hooks, computed functions ([ERP-RECORDS.md](ERP-RECORDS.md))
  readonly extensions: readonly ExtensionRuntime[]
  readonly operations: ReadonlyMap<string, OperationHandler>   // commands and queries
  readonly services: ReadonlyMap<string, ServiceHandler>        // inter-module services
  readonly subscribers: readonly SubscriberRuntime[]
  readonly jobs: readonly JobRuntime[]
  readonly workflows: readonly WorkflowRuntime[]
  readonly sequences: readonly SequenceDef[]
  readonly settings: readonly SettingsDef[]
  readonly ui: UiModule                                // declarative descriptors
  readonly routes: readonly ApiRoute[]                 // public API routes and OpenAPI fragments ([ERP-BUSINESS.md](ERP-BUSINESS.md) §9)
  readonly reports: readonly ReportRuntime[]
  readonly connectors: readonly ConnectorRuntime[]
  readonly approvals: readonly ApprovalPolicy[]
  readonly notifications: readonly NotificationRuntime[]
}
```

Everything in it is immutable and tenant-independent. Module-scoped resources (caches, compiled regular expressions, background fibers started with `Plugin.Runtime.background`) live in the activation scope and are released when the activation closes. Per-tenant state is never stored here.

## 5. The tenant generation

> **Superseded in part (2026-11-08).** A per-key realm created lazily and evicted when idle through lease drain is governed by core [33 — Realm families](../references/core/behaviors/33-realm-families.md) (BEH-BR-329–338). The ERP registry content below remains an application design; re-expressing the tenant generation as a member of a realm family keyed by tenant is open.

```ts
interface TenantGeneration {
  readonly tenantId: string
  readonly revision: number
  readonly modules: ReadonlyMap<string, ModuleRuntime>   // enabled modules for this tenant
  readonly registry: CompiledRegistry                    // shared across tenants with the same key
  readonly activation: ReadonlyMap<string, ExtensionReadiness> // tenant-specific extension readiness
  readonly catalogRevision: number                      // durable: read from and written to bridger_tenant_state, monotonic across evictions and nodes
}

interface CompiledRegistry {                             // immutable, shared
  readonly key: string                                   // hash of sorted closure digests + enabled extension ids
  readonly models: ReadonlyMap<string, ComposedModel>    // base + active extensions, field map, constraint and hook order
  readonly access: ReadonlyMap<string, CompiledAccess>   // per model and operation ([ERP-IDENTITY.md](ERP-IDENTITY.md) §9)
  readonly operations: ReadonlyMap<string, OperationHandler>
  readonly routes: ReadonlyMap<string, ApiRoute>        // method + path; a collision fails compilation (RouteConflict)
  readonly events: EventTable
  readonly catalog: CatalogTemplate                      // filtered per caller at request time
}
```

The catalog revision is persisted per tenant (`bridger_tenant_state (tenant_id, catalog_revision, updated_at)`) and incremented when a generation is published, a grant or policy change alters catalog visibility, or the selected-company generation changes, so it never regresses on eviction or across nodes ([ERP-BROWSER.md](ERP-BROWSER.md) §4).

Tenant-specific overlays that are **not** part of the generation: role grants, settings values, the authorized catalog for a caller, and sessions. They are loaded per request (with revision-based caches) so changing them never republishes a generation.

### Building a generation

`coordinator.tenant(tenantId)` returns the tenant's `Generation<TenantGeneration>`, creating it on first use (single-flight per tenant):

1. Read the tenant's desired and observed module state and extension readiness from the database.
2. Resolve each enabled module to its closure; make sure each closure's activation exists (`host.install` of `erp.module/...` if absent; await `active` or fail).
3. Open a new `Scope`; call `host.lease` (scoped) for all the tenant's module runtime keys in that scope.
4. Look up or compile the `CompiledRegistry` for the registry key; compilation validates conflicts, ownership and operation references exactly as in [ERP-SPEC.md](ERP-SPEC.md) §3.
5. Create the `Generation` holding the `TenantGeneration` value, remembering the scope that owns the leases.

### Changing a generation (enable, disable, upgrade, extension readiness)

1. Build the next `TenantGeneration` value in a **new scope** (new leases, new activations if needed). Nothing is visible yet.
2. If the change is incompatible ([ERP-MODELS.md](ERP-MODELS.md) §4), `closeAdmission` first.
3. `publish` the new value; `retired.drain({ timeout, force })` (bounded; `force` revokes requests still holding the old value, so a stuck request cannot block the change or a later module removal).
4. Close the old scope, which releases its leases on module activations; `reopenAdmission` if it was closed.
5. The coordinator's reference counts notice any module activation that is now unreferenced (§7).

At no point can a call run against a mix of old and new modules, because the call holds one generation value, and that value holds its own leases.

## 6. The request path

1. The gateway authenticates and resolves the tenant ([ERP-IDENTITY.md](ERP-IDENTITY.md)).
2. `coordinator.tenant(tenantId)`; if the tenant's generation is not resident, it is loaded (§5). Loads run under `tenantLoadConcurrency` (default 8) so a burst cannot stampede the database.
3. `generation.acquire` (a scoped lease on the current generation value). Admission closed (tenant draining or module change in progress) fails with `ModuleUnavailable`, for that tenant only.
4. The registry resolves the operation handler; the gateway runs the transaction pipeline ([ERP-SPEC.md](ERP-SPEC.md) §4) with the request context provided as Effect services.
5. The lease is released when the request scope closes.

Because only generation leases are taken per request, no per-request work touches the Bridger host's lease table.

## 7. Module activation lifecycle across tenants

- **On demand.** An activation is installed when a generation needs a closure that is not resident. `ensure` for a tenant also forces activation so the receipt is truthful ([ERP-DISTRIBUTION.md](ERP-DISTRIBUTION.md) §7).
- **Reference counting.** The coordinator counts, per activation, the generations that hold leases on it, including retired generations still draining. When the count reaches zero it starts an idle timer (`moduleIdleGrace`, default 10 minutes). If still zero at expiry it calls `host.remove(activationId)`; the core waits for leases (none) and closes the scope. A new demand re-installs it (its imported code is already loaded, so this is cheap).
- **Upgrade per tenant.** A tenant moving from closure `c1` to `c2` gets a new activation `c2` installed alongside `c1`, a new generation published, and `c1` reclaimed when the last generation using it is gone. Tenants therefore upgrade independently and a rollout can be staged by tenant.
- **Disable per tenant.** A new generation without the module is published and the old one drains with a bound (BEH-BR-173), which releases that tenant's leases on the activation. Disable never closes the activation itself, because other tenants may share it. The activation is reclaimed by the reference count above, once no generation of any tenant and no running workflow references it; running workflows of the disabled module drain for at most `workflowDisableGrace` and are then suspended (§7a rule 5).
- **Runtime failure of an activation** (core `failed`, phase `runtime`): the coordinator observes the host's events, republishes affected tenant generations **without** that module and without modules that depend on it (after drain), marks the module `failed` in the observed state, and raises an alert. `retry` re-activates it and republishes. Operations of the excluded modules return `ModuleUnavailable`; other modules of the tenant keep working.
- **Activation fails to build** (phase `build`): tenants requiring it cannot enable it (`ActivationFailed` on `ensure`). A tenant already enabled keeps its current generation if the new closure fails.
- **Forced removal** (`force: true`) is reserved for artifact revocation quarantine ([ERP-DISTRIBUTION.md](ERP-DISTRIBUTION.md) §9) and shutdown (core [12 — Shutdown and hosting](../references/core/behaviors/12-shutdown-and-hosting.md), BEH-BR-105–107; forced revocation, BEH-BR-086).

## 7a. Coordination rules with the core

These rules close the gaps between the coordinator and the core's semantics ([core behaviors](../references/core/behaviors/index.yaml)).

1. **Reacting to module failure.** The coordinator subscribes to `Host.events` and reacts to `runtime-failure` and to `state-changed` into `stopping`, not to the final `failed` state. It republishes affected tenant generations without the module and its dependents, then closes the old generation scopes, which releases the leases the failing activation is waiting on. If the coordinator is slow, the core's drain limit then revokes the remaining leases (core [10 — Runtime failure and health](../references/core/behaviors/10-runtime-failure-and-health.md), BEH-BR-094, BEH-BR-095).
2. **Shutdown order.** `Erp.make` registers the coordinator's shutdown **after** the host is created, so it runs first: it closes admission on every resident generation, awaits their drain, closes their scopes (releasing all module leases), then lets `Host.shutdown` stop plugins. Module activations therefore stop with no leases held.
3. **Single-flight activation.** `ensureActivation(closure)` is serialized per closure by a mutex, and the reference count is incremented **before** the coordinator decides to install or remove. If `host.install` fails with `DuplicatePlugin`, or a lease with `ServiceUnavailable`, because a removal is in flight, the coordinator awaits that removal (through `changes`) and installs again. Idle-grace removal re-checks the count under the same mutex.
4. **Awaiting activation.** The coordinator never calls `awaitIdle` (it would wait on unrelated builds and can fail with `WouldDeadlock`). It waits for one specific plugin to reach `active` or `failed` through `Host.changes`. Lease-holding generation scopes are owned by a dedicated supervisor fiber; `install`, `remove` and `replace` are issued from the coordinator's own fiber, which holds no lease context.
5. **Running workflows keep their module.** A workflow instance that is `running` holds a reference on its module closure (counted like a generation); a `suspended` instance holds none and re-activates the closure on resume ([ERP-BUSINESS.md](ERP-BUSINESS.md) §4, §5). A module therefore cannot be reclaimed under running workflows. Disabling a module for a tenant lets its running instances continue for at most `workflowDisableGrace`; the engine then suspends the ones still running, which drops their references, so a disabled module's activation is never held longer than the larger of that grace and the generation drain, plus `moduleIdleGrace` (ERP-BUSINESS §4).
6. **Seeds and data migrations run against a staged value.** The `data` install phase builds a private, unpublished `TenantGeneration` with its own scoped leases and runs the system `Records` against it. After the phase completes, the real generation is built and published; the private value is discarded ([ERP-RECORDS.md](ERP-RECORDS.md) §6).

## 8. Scaling model

| Quantity | Grows with | Bound / knob |
| --- | --- | --- |
| Module activations | distinct dependency closures in use | `maxResidentClosures` (16) |
| Compiled registries | distinct module+extension sets | `registryCacheSize` (64) |
| Resident tenant generations | tenants active recently | `maxResidentTenants` (2,000), `idleEvictAfter` (15 minutes) |
| Per-tenant caches (grants, settings, catalog) | tenant activity | size and TTL limits per cache |
| Load concurrency | cold tenants | `tenantLoadConcurrency` (8) |

Numbers are initial defaults to be tuned after a prototype; the structure is the requirement: **per-tenant memory is a shell plus bounded caches, and cost that depends on module code is paid once per closure.**

- **Eviction.** When a tenant has been idle for `idleEvictAfter` (or the resident limit is reached, least recently used first): `closeAdmission`, `awaitDrained({ timeout, force })`, close the scope (releasing leases), drop the entry. Nothing durable changes. The next request reloads (§5). Evicted tenants are not visited by anything except workers, which load a generation only when a delivery needs one.
- **Cold start.** Reads: desired state, module closures (usually already active), extension readiness, compiled registry (usually cached by key). Two to three small queries in the common case.
- **Fairness.** The gateway applies a per-tenant concurrency limit (`PartitionedSemaphore`, [ERP-BUSINESS.md](ERP-BUSINESS.md) §3) so one tenant cannot consume all request slots.
- **Workers.** The outbox, job and scheduler workers iterate tenants from the database; they take a generation lease only for work that needs the registry (subscriber execution, job handlers).
- **Capacity targets** (tenants per node, cold-start latency) are recorded after the first prototype ([ERP-OPERATIONS.md](ERP-OPERATIONS.md) §12).

## 9. Multiple nodes

> **Superseded in part (2026-11-08).** Multi-host rollout is governed by [`@bridger/federation`](../references/federation/README.md). The rule below applies only to nodes that share one ERP database.

Each node has its own Host, activations and generation cache; the database holds the desired state. The rollout protocol of [ERP-OPERATIONS.md](ERP-OPERATIONS.md) §3 applies **per (tenant, module) on nodes where the tenant is resident**:

- A node where the tenant is resident acknowledges the target generation after publishing its new `TenantGeneration` (drained).
- A node where the tenant is **not** resident needs no acknowledgement: it reads the desired state when it next loads the tenant and compares the stored target generation with its cache version stamp.
- A change counts as complete when every live node with a resident generation for that tenant has acknowledged.

## 10. Changes to the other specifications

| Earlier statement | Now |
| --- | --- |
| "`Erp.make` ... owns tenant-specific Bridger Hosts" ([ERP-SPEC.md](ERP-SPEC.md) §5) | One process host; per-tenant `Generation`s owned by the coordinator. |
| "A tenant Host owns the active module set" ([ERP-SPEC.md](ERP-SPEC.md) §5) | A tenant generation owns the active module set; module code is shared. |
| "Loader → Tenant Bridger Host" ([ERP-DISTRIBUTION.md](ERP-DISTRIBUTION.md) §2) | Loader → process host (module activations). |
| Install procedure step "runtime" ([ERP-DISTRIBUTION.md](ERP-DISTRIBUTION.md) §7) | Ensure the module activation exists, then build and publish the tenant generation (§5). |
| "Hosts may be cached/evicted" ([ERP-SPEC.md](ERP-SPEC.md) §5) | Generations are evictable by policy (§8). |
| "`modules.disable` closes activation scopes" ([ERP-SPEC.md](ERP-SPEC.md) §5 and §6, [ERP-DISTRIBUTION.md](ERP-DISTRIBUTION.md) §7, [ERP-TODO-WALKTHROUGH.md](ERP-TODO-WALKTHROUGH.md) §11) | Disable publishes a tenant generation without the module and drains the old one; the activation is shared and is reclaimed only by the reference count (§7). Those documents now say so. |
| "Disabling a module lets running workflows drain" with no bound ([ERP-BUSINESS.md](ERP-BUSINESS.md) §4) | Running workflows drain for at most `workflowDisableGrace`, then are suspended and release the activation (§7a rule 5). |

## 11. Acceptance checks

- Two tenants with the same module set share one activation and one compiled registry; a third with a different closure adds exactly one activation.
- A module cannot close while a request or a draining generation holds it; the core's `remove` waits (or fails with `DrainTimeout` at the limit).
- Enabling a module for tenant A does not affect an in-flight request of tenant B or A's other modules.
- An incompatible change closes admission for that tenant only, drains, publishes, reopens.
- An activation unreferenced for `moduleIdleGrace` is removed; a new request re-activates it without reloading code.
- Tenants A and B share an activation; disabling the module for A leaves B's in-flight and new requests served by the same activation, and A's operations return `ModuleUnavailable`.
- Disabling a module with a running workflow returns before the workflow ends; after `workflowDisableGrace` the workflow is suspended and, if no other tenant uses the closure, the activation is removed after `moduleIdleGrace`.
- A runtime failure of one module removes it (and its dependents) from affected generations and leaves other modules serving.
- Loading 2,000 evicted tenants in a burst respects `tenantLoadConcurrency` and does not exceed the pool.
- Evicting a tenant and reloading it yields the same registry key and behavior; durable state is unchanged.
- A node where the tenant is not resident does not block rollout completion, and serves the new version on first load.
- Staged per-tenant upgrade: tenants on the old and new closure run side by side and old code is reclaimed after the last old tenant moves.

These are design acceptance scenarios, not tests already executed.

## 12. Decisions and remaining items

| # | Item | Decision |
| --- | --- | --- |
| 1 | Host per tenant vs shared host | **Shared host and shared activations; tenant generations** (this document). |
| 2 | Numeric defaults | **Initial values in §8**, to be tuned after a prototype. |
| 3 | Dynamic service keys | The loader creates `ModuleRuntime` keys per closure; if Effect's key identity proves unsuitable for runtime-created keys, an indirection (one key, a closure-indexed map) is the fallback. To be settled in the loader prototype. |
| 4 | Cross-tenant module state | **Not allowed.** Module activations hold no tenant data; module-level caches may hold only tenant-independent data (compiled artifacts, regexes). |

Change log: 2026-11-08, round-2 agent review fixes — status banner links the event-store, sequence and keyring companions instead of calling event-store "planned, not yet drafted" (R5-20).

Change log: 2026-11-09, audit fixes — §7 and §10: disable drains the tenant's generation and never closes a shared activation; §10 records which documents changed (E-02). §7a rule 5 bounds running workflows on disable by `workflowDisableGrace`, then suspends them (E-09). Citations of the superseded SPEC.md point to the core reference behaviors (E-04).
