# ADR-BR-006: One instance per plugin ID per realm

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ADR-006                                              |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.2 (2026-11-08): Reference to ADR-BR-040: versions never create a second instance (CCR-BR-017)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001) |
---

## Context

Some applications want the same plugin definition running more than once: a repository plugin per database, a connector per tenant. Plugin frameworks usually answer with an instance key on `install`. Bridger's provider rule ([ADR-BR-003](../decisions/003-one-provider-per-key-per-realm.md)) makes that answer incomplete: a second instance of a definition provides the same keys as the first, so in one resolution scope it could never publish them. An instance key would only work if keys were also scoped per instance, and a key scope is exactly what a realm is ([ADR-BR-019](../decisions/019-realms-are-resolution-namespaces.md)).

The identity of a plugin also matters outside resolution. Operations address it (`PluginRef`), `reconcile` matches desired entries to it, snapshots and events name it, and an audit record's `target` is `{ id, realm }`. An identity that is generated or suffixed at install time would differ between runs and between hosts, and a declarative list could not name it.

## Decision

**A plugin's identity is its ID within its realm; there is one instance per plugin ID per realm** (SPEC.md "API decisions" row 4, as revised by the Realms section):

- `install` takes no instance key. A second `install` of a known ID in the same realm fails with `DuplicatePlugin { id }` and registers nothing.
- Plugins are addressed by `PluginRef = string | { id, realm }`; a bare string means the `"default"` realm.
- Differences between instances that are not keys (connection strings, options) come through the plugin's `config` schema, not through identity.
- A definition that must run twice is installed into two realms that isolate its provided keys. Without realms, the alternative is a factory that yields definitions with distinct IDs and distinct keys.
- Multi-tenant products do not create a host or an activation per tenant by default: they share plugin activations and give each tenant a registry value (SPEC.md refers to the ERP runtime for this pattern). The ERP uses only the default realm.
- Child plugins get prefixed IDs (`parent/child`) and so remain unique within the parent's realm ([ADR-BR-021](../decisions/021-children-and-groups.md)).

## Alternatives considered

- **An instance key on `install`.** Rejected: the second instance still could not publish the same keys in the same scope; per-instance key scoping would re-introduce realms under another name.
- **A host per tenant.** Rejected as the default: it multiplies activations, resources and connections, and loses the shared base services.
- **Auto-suffixed IDs on duplicate install.** Rejected: identities would not be stable across runs or hosts, so `reconcile`, events and audit records could not name a plugin reliably.

## Consequences

**Positive**:

- Every reference to a plugin (operation, snapshot, event, audit target, desired-state entry) uses one stable pair.
- Duplicate installs fail at the call that caused them.

**Negative**:

- Running a definition twice needs a realm, or a factory that produces distinct IDs and keys, rather than a one-line option.
- Tenancy by registry value puts tenant separation in application code.

**Trade-off accepted**: a slightly heavier path to "run it twice", in exchange for a plugin identity that is stable, declarative and the same in every record.

## References

- Behaviours: [01 — Plugin definition](../behaviors/01-plugin-definition.md), [03 — Installation](../behaviors/03-installation.md), [17 — Realms and interception](../behaviors/17-realms-and-interception.md), [18 — Reconciliation and confluence](../behaviors/18-reconciliation-and-confluence.md)
- Invariants: [INV-BR-001](../invariants.md#inv-br-001-one-provider-per-service-key-per-realm), [INV-BR-012](../invariants.md#inv-br-012-a-definition-error-registers-nothing), [INV-BR-020](../invariants.md#inv-br-020-a-realm-changes-resolution-only)
- Requirements: [URS-BR-011](../urs.md#urs-br-011-run-the-same-plugin-once-per-tenant-or-database)
- Decisions: [ADR-BR-003](../decisions/003-one-provider-per-key-per-realm.md), [ADR-BR-019](../decisions/019-realms-are-resolution-namespaces.md), [ADR-BR-021](../decisions/021-children-and-groups.md), [ADR-BR-040](../decisions/040-versioned-contracts-in-core.md)
- Source: `docs/SPEC.md` — "Plugin definition" (`id`), "Realms and interception", "API decisions" row 4
