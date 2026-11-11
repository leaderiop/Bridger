# Bridger ERP: permissions and policies with `@qadi/core`

Status: **proposal for review, not implemented or type-checked**. Date: 2026-10-02. The `@bridger/qadi` wrapper and every `Access.*` name below are proposed. `@qadi/core`, `@qadi/predicate-sql` and `@qadi/audit` are existing packages; their signatures below were read from `@qadi/core@0.8.0` and its npm metadata, not executed. This document refines the access parts of [ERP-SPEC.md](ERP-SPEC.md).

> **Status banner (2026-11-08): example application, not normative.** This document describes an example ERP application built on Bridger with a server CRUD design: a database row is the source of truth and one server transaction commits each write. It is **not normative** for `@bridger/core` or any companion package, and it is **not the domain layer for local-first or event-sourced systems**; its row-as-truth write path conflicts with event-sourced, offline-first write paths. Such systems build on the [core specification](../references/core/README.md) and the companion specs ([command](../references/command/README.md), [durable-bus](../references/durable-bus/README.md), [federation](../references/federation/README.md), [loader](../references/loader/README.md), [audit-chain](../references/audit-chain/README.md)), and on the event-sourcing companions ([event-store](../references/event-store/README.md), [sequence](../references/sequence/README.md), [keyring](../references/keyring/README.md); Drafts like the others). Where this document and a spec disagree, the spec governs; the [supersession table](ERP-INDEX.md#supersession-table) maps each ERP concept to the spec that now governs it. Nothing here is implemented.

## 1. Decision

Authorization uses [`@qadi/core`](https://github.com/leaderiop/qadi): permission tokens, a role DAG, a serializable policy ADT, an Effect evaluator that returns a `Decision` with a trace, and `toPredicate` for compiling row rules. Bridger does not define a second policy language. `@bridger/qadi` is a thin wrapper that maps Bridger concepts (module permissions, model access, tenant/company scope, request context, errors) onto qadi.

| Package | Role |
| --- | --- |
| `@qadi/core` | Policy ADT, evaluator, `toPredicate`, `project`, `CurrentSubject`. |
| `@qadi/predicate-sql` | Compiles a qadi `Predicate` to a PostgreSQL, MySQL or SQLite `WHERE` fragment. Storage adapters for other dialects supply their own `PredicateRenderer`, certified against qadi's reference interpreter by the differential suite ([ERP-STORAGE.md](ERP-STORAGE.md) §4). |
| `@qadi/audit` | Optional audit trail composed onto `DecisionSink`. |
| `@awthaq/*` | Authentication, sessions, organizations (tenant); supplies the principal. See [ERP-IDENTITY.md](ERP-IDENTITY.md). |
| `@bridger/qadi` | Proposed wrapper described here. Peer dependencies: `effect`, `@qadi/core`. |
| `@bridger/erp` | Imports `@bridger/qadi` only; plugin authors do not import `@qadi/*` directly unless they write custom policies. |

`@bridger/erp/contracts` re-exports only the token-level subset of `Access` (`Access.permissions`, which builds plain permission data) so that contracts stay browser-safe. `Access.role`, `Access.owner`, `Access.fields` and the evaluator come from `@bridger/qadi` and are server-only.

Tenant and company scope is **not** a qadi policy. Records always adds it to the SQL, so no plugin policy can widen it.

## 2. Declaring permissions and roles

```ts
import { Access } from "@bridger/qadi"

// resource + action; ":" is rejected by qadi in either segment
export const TodoPerms = Access.permissions("todo.task", ["read", "write"])
//   TodoPerms.read  -> permission("todo.task", "read")   key "todo.task:read"

export const TodoUser = Access.role("todo.user", {
  permissions: [TodoPerms.read, TodoPerms.write],
  inherits: [],                        // by-value role DAG
})
```

`Access.permissions` wraps `createPermissionGroup`; `Access.role` wraps `role`. `Module.define` takes the resulting tokens (defined in the contract) and roles (`access: { permissions, roles }`) instead of string-keyed maps. Permission keys are `resource:action`; the earlier `"todo.read"` style names no longer exist.

Roles only add permissions. They never bypass the tenant/company scope or an owner rule. Declaring a permission or role grants it to nobody; provisioning assigns grants.

## 3. Model access

Access is attached on the server to a browser-safe model contract (see [ERP-SPEC.md](ERP-SPEC.md) §3):

```ts
// contract.ts (browser-safe)         // server.ts (server only)
export const Task = Model.define(      const TaskServed = Model.serve(Task, {
  "todo.task", { scope, fields })        access: Access.owner(TodoPerms, {
                                           read: "read", create: "write",
                                           update: "write", delete: "write",
                                         }),
                                       })
```

Permission tokens (`Access.permissions`) are plain data and live in the contract; policies, roles and the evaluator are server-only, and `@bridger/erp/contracts` has no dependency on `@bridger/qadi`'s evaluator.

`Access.owner` returns one qadi `Policy` per model operation. For `read`:

```ts
allOf([
  hasPermission(TodoPerms.read),
  hasResourceAttribute("createdBy", eq(subjectId())),
])
```

Creation assigns `createdBy` from the subject, and generated CRUD cannot change it.

Other helpers:

| Helper | Meaning |
| --- | --- |
| `Access.model({ read, create, update, delete })` | Explicit qadi `Policy` per operation. |
| `Access.fields({ salary: policy })` | Field-level rules, kept separate from row rules (see section 5). |
| `Access.permit(...)`, `Access.deny(...)` | Qadi `permitWhen` / `denyWhen` rules with a declared combining mode. |

Compilation at Module activation splits each operation into a **gate** (operation-level policy), a **row policy** (translatable to SQL) and a **field policy** (visible columns). A model whose row policy cannot be translated is allowed only when it also declares that the fallback in section 5 is acceptable; otherwise activation fails.

## 4. The request subject

```ts
Access.subject(context, grants, roles)   // context: { actorId, tenantId, companyId, … } from the Identity adapter
//  -> AuthSubject via fromRoles({ id, roles, attributes: { tenantId, companyId } })
//  -> provided with currentSubjectLayer(subject) for the request
```

Authentication is awthaq's: its `Authentication` middleware yields `CurrentPrincipal`, and Bridger's `Identity` adapter turns it into a request context with tenant and selected company ([ERP-IDENTITY.md](ERP-IDENTITY.md) §3). Bridger stores grants per actor, tenant and company (`bridger_grants`). The gateway builds the subject from the principal and those grants after company validation, then provides it as an immutable Effect context value for that request. A missing subject resolves to qadi's anonymous subject, which holds nothing and denies.

## 5. How Records applies policies

| Operation | Behavior |
| --- | --- |
| `list` | Gate with `check`. Row policy goes through `toPredicate` and `@qadi/predicate-sql`, then is ANDed with the tenant and company scope by the storage adapter's renderer. A requested projection containing fields the caller may not read is rejected with `Forbidden` (never silently omitted); permitted fields are projected with `project`. A filter, sort, search or aggregate over a field the caller may not read gives `InvalidQuery { reason: "field-not-allowed" }`, the same error as an unknown field ([ERP-RECORDS.md](ERP-RECORDS.md) §5). A `False` predicate skips the query. |
| `get` | Same pushdown. A row outside the authorized scope returns `RecordNotFound`. |
| `create` | `enforce` the gate, then set `createdBy` from the subject. |
| `update`, `delete` | One statement: `WHERE id AND scope AND <row predicate> AND revision = ?`. Zero rows resolves to `RecordNotFound` or `RevisionConflict` only after authorization. |
| Custom `Command` | Wrapped in `enforce(permission)`. It still goes through `Records`, so model rules apply. |

`toPredicate` fails rather than approximates, and it refuses a policy that restricts fields. When a plugin row policy cannot be translated, if the model declared `rowFallback: "load-and-enforce"` (otherwise activation fails, §3), Records falls back to loading the row with a write lock (`rowLocking`) and calling `enforce(policy, { resource: row })`. It never treats an untranslatable node as allowed.

Qadi's `filter` runs over fetched data and is not used for paginated lists.

Open points that need tests before the design is accepted:

1. **Column mapping.** `toPredicate` emits `column: "createdBy"`. The wrapper must map resource attribute paths to physical columns, and extension fields such as `planning.task.priority` to an expression over the extension table's left join, `COALESCE(column, absent)`, so a record with no extension row is judged on the field's absent value and never on NULL. It rejects unknown paths.
2. **Row/field split.** Every operation needs separate row and field policies. The wrapper must produce them without changing meaning.
3. **Revision in the same statement.** The SQL fragment from `predicate-sql` must compose with the `revision = ?` and scope clauses in one parameterized statement.

## 6. Error mapping

| Qadi result | Bridger error |
| --- | --- |
| `AccessDenied` on the operation gate | The gate answers `Refuse` with a reason starting `access-denied` (dispatch ends with `CommandRefused`, BEH-CM-011); the gateway maps it to `Forbidden`, using the public form (`toAccessDeniedPublic`) ([ERP-SPEC.md](ERP-SPEC.md) §5). |
| Denied on a specific row | `RecordNotFound`. |
| `AttributeResolveError`, `RelationshipResolveError`, `CustomPredicateError` | `InternalError` with a correlation ID. A broken lookup is a failure, not a denial. |
| `PolicyNotTranslatable` | Activation error when found at Module compile time; otherwise the fallback in section 5. |
| `PolicyTooDeep`, decode failures | Activation error for plugin policies; `InternalError` otherwise. |
| `UndischargedObligation` | `InternalError`. |
| No subject | `Unauthenticated`, produced by the gateway before qadi runs. |

## 7. Audit and obligations

A `DecisionSink` layer records each decision trace with the command's audit entry in the same transaction. `@qadi/audit` can be composed on top for retention and e-signature needs. Obligations (`obliged(...)`) are discharged by a handler that writes outbox or audit rows inside the transaction; with no handler, qadi refuses the allow.

## 8. UI and catalog

The catalog filters visible modules and views with `check(hasPermission(...))` for the current subject. Policies and role graphs stay server-side. The browser never evaluates them, so visible UI remains a convenience, not authorization. `@qadi/react` is not required by this design.

## 9. Version policy

All Bridger packages target the latest stable Effect 4.x (4.1 at the time of the 2026-11-08 revision; this replaces the earlier 4.0 target). `@qadi/core@0.8.0` and awthaq currently pin `effect@4.0.0-rc.116` exactly; the browser shell's FoldKit copy of Effect is separate and talks to the server only over HTTP ([ERP-BROWSER.md](ERP-BROWSER.md) §1), so it does not need to match. See [knowledge/README.md](knowledge/README.md).

## 10. Acceptance checks

- Alice and Bob in one company: each lists only their own rows, in SQL, with correct pagination.
- The same actor in two companies sees only the selected company's rows.
- A plugin policy that cannot be translated is rejected at activation or uses the row-lock fallback, and never returns denied rows.
- A failed attribute lookup surfaces as `InternalError`, not `Forbidden`.
- A permission segment containing `:` is rejected at declaration.
- Extension fields appear in row predicates only while their extension is active.
- Removing a role from an actor changes the next request's decisions; cached decisions never outlive a generation change.
- Examples remain design sketches until the pinned dependencies exist.

Change log: 2026-11-08, round-2 agent review fixes — status banner links the event-store, sequence and keyring companions instead of calling event-store "planned, not yet drafted" (R5-20).

Change log: 2026-11-09, audit fixes — §5 `list` row: filters, sorts, searches and aggregates over a field the caller may not read give `InvalidQuery`, as in ERP-RECORDS §5, so list and aggregate agree; `Forbidden` stays for a requested projection (E-11). §6: the gate's refusal reason `access-denied` is what the gateway maps to `Forbidden` (review fix).

Change log: 2026-11-11, extension tables — §5 open point 1: an extension field in a row policy maps to an expression with the field's absent value, not to a bare column.
