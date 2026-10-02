# Bridger ERP — core and public API design

Status: **proposal for review, not implemented or type-checked**. Date: 2026-10-02. Package names, exports, descriptors and signatures in this document are proposed. We retain the project's existing spelling, **Bridger ERP**. The target is the latest stable Effect 4.x; unstable modules are used only where a feature needs them.

Read [the complete Todo walkthrough](ERP-TODO-WALKTHROUGH.md) first to see the author experience. Permissions and policies are specified in [ERP-ACCESS.md](ERP-ACCESS.md). [Odoo core research](knowledge/ODOO-CORE.md) records the source evidence behind this proposal. The existing [Bridger core spec](SPEC.md) remains the generic plugin runtime. Area specifications: [storage](ERP-STORAGE.md), [identity and tenants](ERP-IDENTITY.md), [module distribution](ERP-DISTRIBUTION.md), [browser shell](ERP-BROWSER.md), [business platform services](ERP-BUSINESS.md), [operations](ERP-OPERATIONS.md), [developer experience](ERP-DX.md); see the [index](ERP-INDEX.md). Authentication is provided by awthaq ([ERP-IDENTITY.md](ERP-IDENTITY.md)); where this document and an area specification differ, the area specification is more detailed.

## 1. What the framework provides

An ERP plugin declares its models, permissions, migrations and screens. Bridger ERP supplies tenant/company context, authorized record access, transactions, audited writes, a versioned operation gateway, and the UI catalog. Effect supplies execution and resource machinery; Bridger supplies plugin activation and service leases; FoldKit or React renders the application (a deployment picks one renderer).

The initial reference topology is a long-lived server process with a relational database and a browser UI rendered with FoldKit or React. The core is dialect-neutral and reaches the database through storage adapters; PostgreSQL is the reference adapter ([ERP-STORAGE.md](ERP-STORAGE.md)). This makes the proposed trusted, in-process hot-install behavior concrete. Multiple replicas and Cloudflare Worker Loader remain supported design directions with additional coordination/transport adapters. Alchemy can provision the deployment independently.

### Package surfaces

| Package or subpath | Caller | Responsibility |
| --- | --- | --- |
| `@bridger/core` | Runtime authors | Generic service dependency graph, activation scopes and leases. |
| `@bridger/erp/contracts` | Plugin authors, browser, clients | **Browser-safe, pure data.** `Model.define` (fields, scope, schemas, operation references), `Model.extend`, `Field`, `Command.contract` / `Query.contract`, permission tokens (`Access.permissions`). No policies, storage, migrations, handlers or database types. |
| `@bridger/erp` | Plugin authors and application assembly (server) | Re-exports contracts and adds `Module`, `Model.serve`, `Command.implement`, `Query.implement`, `Migration`, `Records`, `Erp`. |
| `@bridger/qadi` | Plugin authors and `@bridger/erp` | Thin wrapper over `@qadi/core`: `Access` permissions, roles, model policies, request subject and error mapping. See [ERP-ACCESS.md](ERP-ACCESS.md). |
| `@bridger/erp/ui` | Plugin UI authors | Browser-safe `UiModule` and `View` descriptors; depends only on contracts. |
| `@bridger/erp/client` | Browser or external TypeScript clients | Typed `ErpClient`, commands and queries over the operation gateway; accepts contract references only. |
| `@bridger/erp-storage` | Adapter authors, application assembly | The `StorageAdapter` interface, capability model, portable statement and DDL IR, platform schema, planner, receipts, outbox and the storage conformance suite. No dialect code. |
| `@bridger/erp-postgres` (reference), `-mysql`, `-mssql`, `-sqlite`, … | Application assembly | Dialect adapters: rendering, execution, capabilities, error classification. Any adapter passing the conformance suite can be used. |
| `@bridger/erp-node` | Application assembly | HTTP hosting, authenticated execution context, static assets and process shutdown. |
| `@bridger/erp-ui` | Renderer authors, application UI assembly | Framework-neutral UI core: session and catalog stores, pure state machines (list, form, settings, navigation), effect descriptors, widget descriptors, UI conformance fixtures. No FoldKit or React dependency. |
| `@bridger/erp-foldkit` | Application UI assembly | FoldKit renderer for the ERP shell and built-in widgets, built on `@bridger/foldkit`. |
| `@bridger/erp-react` | Application UI assembly | React renderer for the same shell and widgets, built on `@bridger/react`. A deployment uses one renderer. |

These are conceptual package seams; the final published packaging is open. Browser exports must not pull migration execution, database drivers or server credentials into a bundle. The seam is enforced structurally: `contracts`, `ui` and `client` have no dependency edge to the server entry, `@bridger/qadi`'s policy evaluator or `@qadi/core` policies, and a package-export check in CI fails if one appears. A plugin therefore has a shared contracts module imported by both browser and server, and a server module that attaches access and storage to it (see the Todo layout). `@bridger/erp-foldkit` builds on the generic ideas in [@bridger/foldkit](FOLDKIT-API.md), adding ERP metadata and operations.

## 2. Core modules and seams

```mermaid
flowchart TB
    Author[Plugin definitions] --> Manager[Module Manager]
    Manager --> Installer[Migration and installation journal]
    Manager --> Host[Bridger Host]
    Host --> Registry[Active ERP Registry]
    Registry --> Models[Model metadata]
    Registry --> Operations[Command and Query descriptors]
    Registry --> Catalog[Authorized UI Catalog]
    Browser[Browser UI: FoldKit or React] --> Gateway[Operation Gateway]
    Catalog --> Browser
    Gateway --> Identity[Identity and Policy]
    Identity --> Execute[Execution and service lease]
    Operations --> Execute
    Execute --> Records[Records]
    Models --> Records
    Records --> Tx[Database Transaction]
    Tx --> DB[(Business records and audit)]
    Tx --> Outbox[(Outbox and command receipts)]
    Outbox --> Jobs[Integration and workflow workers]
    Installer --> DB
```

| Module | Small public interface | Behavior it owns |
| --- | --- | --- |
| Module Manager | `ensure`, `disable`, `upgrade`, `status` | Durable desired installation state, dependency resolution, schema readiness, activation, retries and generation publication. |
| ERP Registry | Immutable generation snapshot and typed descriptor lookup | Conflict detection, model/operation ownership and consistent publication of available capabilities. |
| Operation Gateway | `query` and `command` | Decode input, authenticate, check enabled generation, authorize, lease, execute, encode results and correlate diagnostics. |
| Records | `list`, `get`, `create`, `update`, `delete` | Scope filters, field rules, parameterized queries, optimistic concurrency and standard record metadata. |
| Policy (`@bridger/qadi` over `@qadi/core`) | Permission tokens, qadi policies, request subject | Operation gates, row predicates compiled to SQL, field projection and consistent enforcement across all entry points. Tenant/company scope is added by Records and is not a plugin policy. See [ERP-ACCESS.md](ERP-ACCESS.md). |
| Transaction | Execute one command unit | Record mutation, command receipt, audit and outbox share one SQL transaction. |
| UI Catalog | Authorized descriptors and revision changes | Available navigation/screens and compatible UI artifacts; no live server values enter the catalog. |

Every asynchronous method returns an Effect unless explicitly shown as a pure descriptor or Promise-free browser configuration. Pure definition calls never contact a database or install code.

## 3. The plugin author's interface

### Model and fields

Effect Schema is the value-contract foundation. `Field.make(schema, metadata)` accepts a schema directly; the helpers below compile to that same representation. [Schema integration design](ERP-SCHEMA-DESIGN.md) explains Effect Model variants, storage codecs, defaults and partial updates.

A model is defined in two parts. The **contract** is shared pure data; the **server binding** adds access and is the only part that carries policy.

```ts
// contract.ts — browser-safe, imported by server, UI and clients
const TodoPerms = Access.permissions("todo.task", ["read", "write"])

const Task = Model.define("todo.task", {
  scope: "company",
  fields: {
    title: Field.text({ label: "Title", trim: true, minLength: 1, maxLength: 200 }),
    done: Field.boolean({ label: "Done", default: false }),
  },
})

// server.ts — server only
const TaskServed = Model.serve(Task, {
  access: Access.owner(TodoPerms, {
    read: "read", create: "write", update: "write", delete: "write",
  }),
})
```

`TodoPerms` (permission tokens are plain data) comes from `Access.permissions`; see [ERP-ACCESS.md](ERP-ACCESS.md). A `Module` lists served models; a model with no `Model.serve` binding fails module validation, so no model can be exposed without access rules.

`Model.define` produces immutable metadata, schemas `Id` / `Row` / `Create` / `Changes`, and typed operation references:

| Reference | Input | Result |
| --- | --- | --- |
| `Task.queries.list` | `ListQuery`: filter expression (`where`), `search`, up to three sort keys, bounded `limit`, optional `cursor`, optional `expand` and bounded `count` ([ERP-RECORDS.md](ERP-RECORDS.md) §5) | `{ items, nextCursor }`; no count by default. |
| `Task.queries.get` | `{ id }` | One readable row or `RecordNotFound`. |
| `Task.commands.create` | Writable fields; fields with defaults are optional | Created row, starting at revision 1. |
| `Task.commands.update` | `{ id, expectedRevision, changes }` | Updated row with incremented revision. |
| `Task.commands.delete` | `{ id, expectedRevision }` | `{ id }` after deletion. |

The full `Records` interface, constraints, computed fields, hooks, relations, queries and aggregates, module data, inter-module services, sequences, settings, money and translations are specified in [ERP-RECORDS.md](ERP-RECORDS.md). The reserved names also include the envelope key `i18n` for translations.

Every model also gets reserved server-owned fields: `id`, `tenantId`, `companyId` for company scope, `revision`, `createdAt`, `updatedAt`, `createdBy`, and `updatedBy`. IDs are opaque strings, timestamps are UTC values with schema-defined transport encoding, and revision is an integer. Client input cannot set reserved fields. Unknown fields are rejected.

Field definitions default to required unless they declare a default or optionality. `trim` runs before title length validation. The database adapter generates appropriate constraints as part of a reviewed migration, not in an ordinary record write.

`scope: "company"` requires exact tenant and selected-company filtering on every operation. `scope: "tenant"` omits company ownership but still requires tenant filtering. Cross-company reporting uses a separate authorized query; an ordinary filter cannot widen scope.

### Policy semantics

Policies are `@qadi/core` policy values, wrapped by `@bridger/qadi` (see [ERP-ACCESS.md](ERP-ACCESS.md)). `Access.owner` means the actor must hold the specified permission token **and** pass the owner rule, expressed as `allOf([hasPermission(p), hasResourceAttribute("createdBy", eq(subjectId()))])`. Reads, updates and deletes select only rows whose `createdBy` equals the authenticated actor, and the row rule is compiled to SQL (`toPredicate` plus `@qadi/predicate-sql`) rather than filtered after fetch. Creation assigns that actor. Ownership cannot be changed through generated CRUD. Tenant/company restrictions are always additional conditions added by Records, not plugin policies.

Permissions are `resource:action` tokens (for example `todo.task:read`); `:` is not allowed inside either segment. Roles come from qadi's role DAG and only grant permissions. They do not bypass owner or tenant rules. A future manager policy must be explicit. No permission declaration grants itself to a user; provisioning or an administrator assigns a role.

A broken attribute or relationship lookup is a failure (`InternalError`), never a denial. Qadi fails closed: a missing subject holds nothing, and an unwired resolver denies.

Field restrictions apply to filters, sorting, projections, exports and writes. A request for an unauthorized field is rejected; the gateway does not accidentally leak it through a full-row response. A row absent from the caller's authorized scope returns `RecordNotFound` whether it does not exist or belongs to someone else.

### Module

```ts
const TodoModule = Module.define({
  id: "todo",
  version: "1.0.0",
  apiVersion: "1",
  dependsOn: [],
  models: [TaskServed],        // Model.serve(Task, { access })
  migrations: [CreateTasks],
  ui: TodoUi,
  access: {
    permissions: TodoPerms,         // Access.permissions("todo.task", ["read", "write"])
    roles: [TodoUser],              // Access.role("todo.user", { permissions: [...] })
  },
})
```

Models contribute their standard operation references automatically. `ui` attaches a declarative UiModule whose validated descriptors can be sent to the browser as data. A module may additionally declare `commands`, `queries`, `events`, `jobs`, `workflows`, `services`, `sequences`, `settings` and `data` (seeds, enable hooks and data migrations), and `Model.serve` attaches constraints, computed functions and hooks ([ERP-RECORDS.md](ERP-RECORDS.md)). It declares any non-platform Effect requirements for custom handlers; activation must not infer hidden dependencies from runtime failures.

`version` identifies immutable code/schema packaging. `apiVersion` identifies the client operation contract. `dependsOn` declares ERP module version dependencies, whereas generic Bridger `requires` declares live Effect service dependencies. The ERP compiler translates the former into the necessary registry/activation dependencies without conflating the two.

Definitions are validated before publication: duplicate IDs, incompatible fields, missing permissions, unresolved references, dependency cycles and invalid operation result schemas fail activation. Publication changes one registry generation; partially registered routes or screens are not visible. The ERP coordinator builds the complete next registry as an immutable value, then publishes it with core's [`Generation`](SPEC.md) helper: new calls get the new value atomically, calls already admitted finish under the old one, and `closeAdmission` plus the retired value's `drained` effect give the close-drain-switch sequence for incompatible changes. A plugin whose validators or handlers an old generation references is removed only after that generation has drained.

## 4. Request execution and transactions

```mermaid
sequenceDiagram
    participant UI as Browser screen (FoldKit or React)
    participant API as Gateway
    participant Host as Bridger Host
    participant Policy as Policy
    participant DB as Database

    UI->>API: create task with command ID and idempotency key
    API->>API: authenticate and validate selected tenant and company
    API->>Host: acquire lease on the tenant's current registry generation
    API->>Policy: check operation permission
    API->>DB: begin transaction
    API->>DB: reserve scoped idempotency key and validate input hash
    API->>Policy: apply record and field rules
    API->>DB: insert task and audit and outbox and receipt
    API->>DB: commit
    API->>Host: release lease after cleanup
    API-->>UI: typed created row
    UI->>UI: result Message updates Model
```

The database adapter serializes concurrent uses of the same idempotency key with a unique receipt identity. The identity includes tenant, company, actor, stable command ID and client key. Repeating the same request returns its retained result; reusing the key with different input is `IdempotencyConflict`. A retry of a recorded success is authorized against current policy before its result is disclosed. The receipt records the original contract and artifact version so upgrades do not silently reinterpret it. Receipt retention and expired-key behavior must be configured.

Each write command has one SQL commit point. Standard writes include actor/company metadata, an audit record, and a durable model-change outbox entry. Failure before commit rolls them back together. Success-before-response network failure is resolved by retrying the same key. A rolled-back revision conflict is not a committed receipt; a deliberately new command uses a new key.

Queries are read-only, permission-filtered and bounded. Their cursor is opaque and tied to scope, ordering and filter shape. The default list order is `createdAt` descending and then `id`; pagination is a live view unless the caller explicitly requests a snapshot export. `nextCursor` is null at the end.

Commands issued together by the UI (FoldKit Commands or React effects) can run concurrently. Optimistic updates use `expectedRevision`, implemented as a scoped compare-and-update. Two writes against one revision produce one success and one `RevisionConflict`; no silent last-write-wins overwrite. Revision mismatch details are only available after row authorization.

An outbox worker leases an event for delivery after commit. Delivery may repeat, so subscribers deduplicate. Sending mail or charging a payment provider inside a SQL transaction is not rolled back by the database; those integrations need recorded intent and their own reconciliation policy.

## 5. Application assembly and trusted administration

```ts
const storage = yield* Postgres.make({ url: databaseUrl }) // any StorageAdapter, e.g. MySql.make, SqlServer.make
const erp = yield* Erp.make({ storage, loader: ErpNode.moduleLoader() })

yield* erp.tenants.ensure({ id: "demo", name: "Demo" })
yield* erp.companies.ensure({ tenantId: "demo", id: "main", name: "Main" })
yield* erp.modules.ensure({ tenantId: "demo", module: TodoModule })
yield* erp.access.grantRole({
  tenantId: "demo", actorId: "alice", role: "todo.user", companyIds: ["main"],
})
```

`Erp.make` is scoped and owns an ERP coordinator and the process's single Bridger Host, with module activations shared across tenants and one registry `Generation` per tenant ([ERP-RUNTIME.md](ERP-RUNTIME.md)). Administrative methods above are server composition interfaces, not automatically exposed public RPC methods. The HTTP adapter creates a restricted operation gateway. An admin UI needs separately authorized management commands.

`ensure` is idempotent for an already-active identical artifact/version. A different artifact under the same version fails; a different version requires explicit `upgrade`. It returns an installation receipt only when the local tenant generation is ready; on a multi-node deployment it additionally waits for the cluster acknowledgements defined in [ERP-RUNTIME.md](ERP-RUNTIME.md) §9 and [ERP-OPERATIONS.md](ERP-OPERATIONS.md) §3 (a timeout reports lagging nodes as `RolloutIncomplete` and the change continues). Missing module dependencies or failed migrations are typed errors with a durable status entry; an install receipt never means merely "definition recorded". This deliberately differs from generic `Host.install`, which can leave a plugin waiting.


### Administrative operation contracts

All methods return Effects with typed errors; installation receipts include tenant/module identity, version, provenance, artifact digest (nullable for local definitions), and runtime generation.

| Operation | Input | Completion guarantee |
| --- | --- | --- |
| `modules.ensure` | `tenantId` and exactly one of `module` or `artifact` | Requested module is active in the local runtime; identical active installation is reused. |
| `modules.disable` | `tenantId`, `moduleId`, optional `cascade` | Admission closed, admitted server calls settled, activation scopes closed; durable data retained. Default cascade is false. |
| `modules.upgrade` | `tenantId`, `moduleId`, approved target `artifact` | Compatibility and migration plan applied, target generation active; shared database schema constraints apply to all affected tenants. |
| `modules.status` | `tenantId`, `moduleId` | Current durable desired/observed state, phase, version, generation and failure details; does not wait for activation. |

An approved artifact descriptor carries module ID, version, immutable URL, content digest and compatibility metadata. `ErpNode.moduleLoader()` verifies bytes before evaluation, resolves shared dependencies and validates the exported module. The descriptor comes from trusted administrative orchestration. It is not accepted from ordinary operation requests. Restart recovery resolves the stored approved artifact references before reopening admission.

The inline `{ module: TodoModule }` form is convenient for source-defined local development. It records local provenance and no artifact digest; a metadata fingerprint is not code integrity verification. Re-running `ensure` with the same version and a changed definition fails with `ArtifactMismatch` unless `{ dev: { replace: true } }` is passed, and production mode refuses inline modules (`InlineModuleForbidden`); see [ERP-DISTRIBUTION.md](ERP-DISTRIBUTION.md) §5. Production artifact identity uses the loader path. The demo bootstrap intentionally reasserts its installation on restart; production bootstrap instead restores persisted desired state after separate provisioning.

The reference design uses one Bridger Host per process. Module code is activated once per dependency closure and shared by tenants; each tenant has a small evictable registry generation that owns its active module set ([ERP-RUNTIME.md](ERP-RUNTIME.md)). Request actor, selected company and authorization state are immutable Effect context values per request, never mutable globals on a module activation. Tenant generations may be evicted while durable desired state remains in the database. In-process trusted code has process privileges; the host layout is resource organization, not a security sandbox.

Many tenants share one process host and one physical database. The schema migration ledger is per physical database and module; enablement is per tenant. Initial table creation happens once, and enabling another tenant does not rerun it. An upgrade must account for every enabled tenant's compatible code/schema window. Database-per-tenant storage adapters use separate migration ledgers.

## 6. Durable installation versus runtime activation

```mermaid
stateDiagram-v2
    [*] --> available: approved artifact
    available --> installing: ensure
    installing --> active: migrations and activation succeed
    installing --> failed: migration or activation fails
    active --> disabling: disable
    disabling --> disabled: server leases and local resources drained
    disabling --> failed: cleanup fails
    disabled --> installing: ensure same artifact
    active --> upgrading: upgrade explicit target
    upgrading --> active: compatible schema and new generation ready
    upgrading --> failed: upgrade fails
    failed --> installing: explicit resume after diagnosis
```

The state machine belongs to the ERP Module Manager. Generic plugin state still follows [SPEC.md](SPEC.md). Durable status also stores phase, artifact digest, schema version, runtime generation and the underlying cause; it must distinguish migrated-but-not-active from a migration failure.

An install follows this order:

1. Load the approved immutable artifact and validate manifest, dependencies and platform compatibility.
2. Acquire the deployment/module migration lock; record the attempt.
3. Verify immutable migration checksums and execute unapplied migrations under their declared transaction policy.
4. Apply module data: required seeds, enable hooks and data migrations, as the module's system subject ([ERP-RECORDS.md](ERP-RECORDS.md) §6).
5. Ensure the module activation exists in the process host and stage the module's model, operation and UI metadata references for the tenant ([ERP-RUNTIME.md](ERP-RUNTIME.md)).
6. Validate the assembled registry and atomically publish a new tenant generation; mark the installation active.

SQL migration commit and runtime activation cannot be one database transaction. A failure after migration leaves durable recovery state and no falsely active module. Retrying can reuse the completed migration ledger.

`disable` closes admission on the module's generation before waiting for server leases: it publishes a registry generation without the module, then awaits the retired generation's `drained` effect, then closes the module's activation scopes. It stops dependents or returns `DependentsActive` unless a reviewed cascade was requested. It unpublishes contributions and closes activation scopes. Rows, migrations, command receipts and audit history remain. There is no destructive `uninstall` shortcut in this proposal; data purge is a separate administrative workflow.

UI catalog changes notify browsers. A remote browser does not hold a permanent server lease and cannot block disable forever. Stale browser calls fail with `ModuleUnavailable` or `ContractMismatch`. A browser's own local plugin host coordinates its local widgets and resources; custom-widget unmount completion matters for those local resources. Disconnected clients reconcile the latest catalog before submitting new work.

Upgrades use expansion/migration plus a controlled generation switch. This draft does not promise zero downtime for incompatible upgrades. Cross-replica installation requires desired-generation propagation, admission fencing and readiness acknowledgements before declaring rollout complete; the one-process Todo example does not implement that protocol.

## 7. Migrations are explicit

```ts
const CreateTasks = Migration.createModel("001-create-task", {
  model: "todo.task",
  scope: "company",
  fields: {
    title: Field.text({ trim: true, minLength: 1, maxLength: 200 }),
    done: Field.boolean({ default: false }),
  },
})
```

This is an immutable schema operation descriptor, translated by the storage adapter. It adds standard system fields, tenant/company indexes and the modeled field constraints. The migration definition contains its historical field snapshot; it must not import a live `Task.fields` object that changes in later releases. UI labels do not affect physical schema compatibility.

The module manager checks declared model storage compatibility against migration results. It never silently synchronizes changed model definitions into production tables. SQL migrations use a transaction where supported; online index creation and other nontransactional operations require explicit resumable steps. Failed checks or checksum changes stop activation.

## 8. UI descriptors and custom business operations

```ts
const TodoUi = UiModule.define({
  moduleId: "todo",
  apiVersion: "1",
  views: [View.collection("todo.tasks", {
    model: Task,
    title: "Tasks",
    navigation: { label: "Tasks", order: 100 },
    columns: ["title", "done"],
    form: ["title", "done"],
    actions: ["create", "edit", "delete"],
  })],
})
```

A generated collection supplies list loading, pagination, a create/edit form, delete confirmation, validation errors, pending state and revision-conflict refresh. It calls model operations; it never accesses storage directly. The client generates one idempotency key per user intent and preserves it across transport retries. An explicit new edit is a new intent.

The generic renderers (FoldKit and React) already understand collection descriptors and the supported field catalog. A newly installed Todo plugin therefore appears through catalog data without rebuilding the browser. Only public field schemas and UI metadata cross this seam; policies, migration code and handler functions remain server-side. Unsupported custom field codecs require an explicit renderer contract rather than arbitrary function serialization. Custom executable UI artifacts use a separate approved artifact manifest and local lifecycle adapter.

The server checks the UI module's model/operation references and filters catalog visibility by grants. Visible UI is a convenience, not authorization. A session/company change clears scoped client data, cancels in-flight queries and ignores stale responses using a context generation.

For custom logic, use a named ERP command:

A command is also two parts. The **contract** (name, input and output schemas) is browser-safe and lives in contracts; the **implementation** (permission, `execute`) is server-only.

```ts
// contract.ts — browser-safe
const CompleteTask = Command.contract("todo.task.complete", {
  input: Schema.Struct({ id: Task.Id, expectedRevision: Schema.Number }),
  output: Task.Row,
})

// server.ts — server only
const CompleteTaskImpl = Command.implement(CompleteTask, {
  permission: TodoPerms.write,
  execute: ({ id, expectedRevision }) => Effect.gen(function* () {
    const records = yield* Records
    return yield* records.update(Task, {
      id, expectedRevision, changes: { done: true },
    })
  }),
})
```

Register the implementation in the owning Module's `commands` array; the client calls the contract. A contract with no implementation in an active module returns `ModuleUnavailable`. ERP `Command` is a server operation descriptor, distinct from FoldKit `Command`, which describes UI work. The gateway supplies its transaction, request context and scoped `Records` interface. Nested record writes share that command transaction. `Records` still enforces model permissions and ownership; adding a command permission does not bypass model rules.

Custom queries follow the same split (`Query.contract` and `Query.implement`) and may only use read interfaces. Custom screens use the UI core's machines and `ErpClient` from either renderer (ordinary FoldKit Model/Message/update/Command code, or React components); schema-typed Ports are the seam for separately loaded UI runtimes. There is no mutation of the shell's static Message union at runtime.

## 9. Extending an existing ERP model

Multiple plugins can contribute to **the same physical table**. One module owns the base model; other modules register named `Model.extend` contributions in their `extensions` array. `Model.compose` produces a typed projection for callers that know those extensions. Full interfaces, storage rules, lifecycle diagrams and a Planning extension for Todo are in [Shared models and database ownership](ERP-MODELS.md).

The registry compiles the base model and all enabled contributions into one immutable tenant model generation. Every write, including a base-only `Records.update(Task, ...)`, executes that generation's active constraints. A caller's typed projection limits fields it may request; it does not bypass contributed invariants. All columns of a record share one ID and revision.

Extension fields use qualified identities and nested transport names, while the storage adapter maps them to ordinary typed columns in the base table. Ownership conflicts fail compilation. Contributors cannot silently replace fields, change model scope, weaken authorization or override commands by load order.

Physical schema is shared across tenants; enabled contributions are tenant-specific. Extension columns can remain nullable for inactive tenants, with logical requiredness enforced only after tenant backfill and activation. Database constraints must remain valid for all tenants. Schema migrations serialize by affected physical model. Disabling an extension drains calls leasing the composed model and removes its runtime contribution while retaining columns and data.

Computed fields declare dependencies and recomputation plans. Relation definitions specify scope and deletion semantics. Incompatible field changes require explicit migrations and dependent-contract checks. These are proposed ERP responsibilities above the generic Bridger Host.

## 10. Error and recovery contract

| Error | Meaning | Caller behavior |
| --- | --- | --- |
| `Unauthenticated` | No valid identity | Sign in again. |
| `Forbidden` | Scope or operation permission denied (qadi `AccessDenied`, public form) | Show denial; do not retry automatically. |
| `DependentsActive` | Disable refused because dependent modules are active | Disable dependents first or request a reviewed cascade. |
| `ExtensionUnavailable` | Requested extension is disabled or absent | Refresh catalog; request a supported projection. |
| `ModelOwnershipConflict` / `FieldOwnershipConflict` | Module compilation found a duplicate owner | Fix the module definitions; activation fails. |
| `ServiceUnavailable` / `UnknownPlugin` | Generic Bridger host errors surfaced by an adapter | Retry after the provider is active; check the plugin ID. |
| `InvalidInput` | Schema or field validation failed | Show field errors and preserve input. |
| `RecordNotFound` | No row visible in the authorized scope | Refresh or show missing. |
| `RevisionConflict` | Authorized row changed since the supplied revision | Reload and let the user reconcile. |
| `IdempotencyConflict` | One retained key used for different input | Correct client intent/key handling. |
| `ContextRequired` / `ContextChanged` | No company selected for a company-scoped call, or the call carried an older context generation | Select a company or reload the session; resubmit as a new intent ([ERP-IDENTITY.md](ERP-IDENTITY.md) §4). |
| `ConstraintViolation` / `ReferenceInvalid` / `ReferenceInUse` / `InvalidQuery` | Application constraint, reference rule or query validation failed ([ERP-RECORDS.md](ERP-RECORDS.md) §13) | Show field errors and preserve input. |
| `ModuleUnavailable` | Disabled, stopping or failed generation | Refresh catalog and preserve unsent input. |
| `ContractMismatch` | Client operation contract incompatible | Load a compatible UI artifact. |
| `MigrationFailed` / `ActivationFailed` / `CleanupFailed` | Installation phase failed | Inspect durable phase/cause and explicitly resume. |
| `InternalError` | Unexpected defect, or a failed attribute/relationship lookup or undischarged obligation (never reported as a denial) | Return a correlation ID; retain detailed cause on the server. |

A timeout after commit is an ambiguous result, not proof of failure. Retrying a command must use the original idempotency key. No library finalizer substitutes for compensating a completed business action.

## 11. Deliberate relationship to Odoo

The inspected mechanisms are documented in [ODOO-CORE.md](knowledge/ODOO-CORE.md). The principal mappings are:

| Odoo concept | Bridger ERP proposal |
| --- | --- |
| Addon manifest and module graph | Immutable Module descriptor plus versioned artifact/dependency validation. |
| Registry and Environment | Immutable active registry generation plus per-request Effect context. |
| Models and fields | Typed Model/Field definitions, schemas and authorized Records operations. |
| Access controls and record rules | `@qadi/core` permission tokens and policies (via `@bridger/qadi`), row rules compiled to SQL, plus explicit tenant/company scope. |
| Views, actions and menus | Versioned View descriptors rendered by the ERP browser UI (FoldKit or React renderer). |
| Module schema/data upgrades | Migration journal separated from runtime activation and disable. |
| Python model inheritance | Explicit field/constraint/event/action extension contracts with conflict checking. |

The details are design choices, not a compatibility layer. Odoo has online module operations, but that alone does not prove the code-loading and lease semantics proposed for Bridger.

## 12. Review gates for this API proposal

- The Todo walkthrough must use exactly these interfaces without privileged database shortcuts.
- Verify schema-derived input/output inference, especially defaults, system fields and extension types.
- Exercise two actors and two companies; owner and company filtering must hold for queries and writes.
- Race identical idempotency keys and competing record revisions.
- Fail after migration commit but before activation; ensure the next run recovers without duplicate migration.
- Disable with an in-flight command; the admitted transaction settles before the server activation closes.
- A stale or disconnected browser cannot keep a server generation alive or bypass current policy.
- Render diagrams and type-check illustrative programs when implementation prototypes are authorized. At this stage, verification is document consistency and source review.
