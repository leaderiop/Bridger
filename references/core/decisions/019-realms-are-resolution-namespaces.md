# ADR-BR-019: Realms are resolution namespaces, not security boundaries

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ADR-019                                              |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.2 (2026-10-02): Consistency fixes from independent review (CCR-BR-002)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001) |

---

## Context

One provider per key ([ADR-BR-003](../decisions/003-one-provider-per-key-per-realm.md)) and one instance per ID ([ADR-BR-006](../decisions/006-one-instance-per-id-per-realm.md)) leave no way to run a repository plugin against two databases in one host. Cordis answers with `isolate`, which lets one service name resolve to different providers in different parts of the plugin tree, and `intercept`, which decorates a service for a subtree.

The same mechanism invites a dangerous reading. A word like "realm" or "isolate" suggests a boundary: that a plugin in tenant A's realm cannot reach tenant B's data. Within one JavaScript process that is not true: plugins share memory, globals, the module graph and every base service. The name also collides with ECMAScript's own "realm" (a separate global environment), which Bridger realms are not.

## Decision

**A realm is a named service-resolution namespace and nothing more.**

- `defineRealm(id, { isolate, interceptors })` creates a realm; `DuplicateRealm` if it exists. The `"default"` realm always exists. Installing into an undefined realm fails with `UnknownRealm`. Realms live as long as the host; their plugins are removed individually.
- **Resolution rule.** A plugin installed in realm *R* resolves each required or optional key as follows: if the key is in *R*'s `isolate` list, only providers installed in *R* count; otherwise providers in the default realm count. Isolated keys never leak out of *R*. Base services belong to the default realm.
- **Per-realm uniqueness.** Plugin IDs are unique per realm, and so are provider slots for isolated keys; dependency-cycle and `DuplicateProvider` checks run per resolution scope. The same definition can therefore be installed in two realms that isolate its provided keys.
- **Addressing.** Plugin-addressed operations take a `PluginRef` (`string` for the default realm, or `{ id, realm }`); `use`, `useAll` and `lease` take a `realm` option. Snapshots record each plugin's `realm`; `HostSnapshot.realms` lists each realm's isolated keys and available service IDs.
- **Interception.** An `Interception<S>` (`{ key, wrap(service, consumer) }`), set by `InstallOptions.intercept`, by the realm, or inherited from a parent plugin, makes the consumer receive `wrap(service, { pluginId, realm })` when its provider is captured. It is applied once per activation and cannot see other consumers. Leases stay on the provider, not on the wrapper.
- **Not a security boundary.** A realm changes resolution only. It does not isolate memory, globals, modules or base services, and it is not an access-control mechanism; an interception wrapper that leaks the underlying object is the author's responsibility. Process or browser sandboxing of untrusted code is a core exclusion ([ADR-BR-027](../decisions/027-core-exclusions.md)).
- **Publication of non-isolated keys (settled).** SPEC.md does not state where a non-isolated key provided by a plugin installed in a non-default realm is published. Read together with "a definition that must run twice is installed into two realms that isolate its keys" (API decisions row 4), the consistent reading is adopted: a key that is not isolated in realm *R*, provided by a plugin installed in *R*, is published in the default realm's provider slot, and is subject to `DuplicateProvider` there. [17 — Realms and interception](../behaviors/17-realms-and-interception.md) specifies it.

## Alternatives considered

- **Realms as a security boundary.** Rejected: it cannot be delivered inside one process; claiming it would be a false control ([RSK-BR-013](../gxp/03-risk-assessment.md#rsk-br-013)).
- **Hierarchical realms with inheritance chains.** Rejected for the first release: a flat set of named realms with fallback to the default covers the per-database and per-tenant cases, and a chain makes resolution harder to predict.
- **An instance key on `install`.** Rejected in [ADR-BR-006](../decisions/006-one-instance-per-id-per-realm.md).
- **A host per database or tenant.** Rejected as the default: duplicated activations and base services.

## Consequences

**Positive**:

- The same definition can run once per database or tenant, with stable identities.
- Per-consumer decoration (annotated loggers, rate limits, tracing) needs no change to the provider.

**Negative**:

- The name invites a security reading; every document and adapter must state that a realm is not a boundary.
- Resolution now depends on the realm's `isolate` list, so a misconfigured list silently resolves to the default realm's provider.

**Trade-off accepted**: a resolution feature that must be explained carefully, in exchange for multi-instance plugins without instance keys and without pretending to isolate anything.

## References

- Behaviours: [17 — Realms and interception](../behaviors/17-realms-and-interception.md), [03 — Installation](../behaviors/03-installation.md), [09 — Leases](../behaviors/09-leases.md)
- Invariants: [INV-BR-020](../invariants.md#inv-br-020-a-realm-changes-resolution-only), [INV-BR-001](../invariants.md#inv-br-001-one-provider-per-service-key-per-realm), [INV-BR-002](../invariants.md#inv-br-002-the-dependency-graph-is-acyclic-per-resolution-scope)
- Requirements: [URS-BR-011](../urs.md#urs-br-011-run-the-same-plugin-once-per-tenant-or-database)
- Risks: [RSK-BR-013](../gxp/03-risk-assessment.md#rsk-br-013)
- Decisions: [ADR-BR-003](../decisions/003-one-provider-per-key-per-realm.md), [ADR-BR-006](../decisions/006-one-instance-per-id-per-realm.md), [ADR-BR-010](../decisions/010-cordis-parity.md), [ADR-BR-027](../decisions/027-core-exclusions.md)
- Source: `docs/SPEC.md` — "Realms and interception", "Core exclusions", "API decisions" rows 1 and 4
