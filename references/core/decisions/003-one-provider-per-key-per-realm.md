# ADR-BR-003: One provider per service key per realm

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ADR-003                                              |
> | Revision       | 0.3                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.3 (2026-11-11): `DuplicateProvider` shows `providerRealm` (CL2) (SPEC-AUDIT-06) (CCR-BR-038)<br>0.2 (2026-11-08): Contract versions do not change the one-provider rule (ADR-BR-040) (CCR-BR-017); several implementations per site through a registry and `Selector` (CCR-BR-019)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001) |
---

## Context

When a plugin starts, the host captures the identity of the provider of each key it requires; that captured binding is the plugin's dependency view until it stops (SPEC.md, "Install and activation flow"). Removal ordering stops a provider's dependents first, and a lease holds a provider open during a call. All three mechanisms need one answer to "who provides this key here?".

If two plugins may provide the same key in the same resolution scope, that answer becomes a policy (priority, last installed, first installed), and every policy has a moment where the answer silently changes: a higher-priority provider arrives and dependents of the old one must either keep a stale binding or be restarted against a provider they never asked for. Removal of one of two providers has no clear set of dependents to stop first.

The legitimate need behind multiple providers is multiplexing: several implementations behind one extension point (routes, commands, validators). SPEC.md "API decisions" row 1 notes that the ERP layer already models such points as registries.

## Decision

**At most one active or reserved provider exists per service key per resolution scope (realm).** Concretely:

- A second provider of a key already provided in the plugin's resolution scope, by an installed plugin or by the base `Context`, is rejected at `install` with `DuplicateProvider { serviceId, providerId, providerRealm? }` (`providerId` is a plugin ID or `"base"`; `providerRealm` the provider's realm, absent for `"base"`), and nothing is registered.
- The same check applies to the keys a `replace` adds (checked against the installed set excluding the old definition, before anything stops) and to `enable`, which re-checks a disabled plugin against plugins that may have claimed its keys meanwhile.
- A `disabled` plugin reserves no provider slot, so another plugin may provide its keys while it is disabled; `enable` then fails with `DuplicateProvider`.
- Base services occupy their slot in the default realm for the life of the host and cannot be replaced by a plugin.
- The "resolution scope" is the realm ([ADR-BR-019](../decisions/019-realms-are-resolution-namespaces.md)): slots for keys a realm isolates are per realm; all other keys resolve in the default realm. Dependency-cycle detection runs per resolution scope too.
- Multiplexing is an application service: typically a `ContributionRegistry` provided as a base service, into which implementations register ([ADR-BR-024](../decisions/024-shared-state-helpers.md)).

## Alternatives considered

- **Several providers with a selection policy (priority or last-wins).** Rejected: dependents capture an ambiguous identity, and a new provider either leaves dependents on a stale binding or restarts them without any operation naming them.
- **Allow duplicates and fail at resolution time.** Rejected: the error surfaces when some unrelated dependent starts, far from the install that caused it, and as state rather than as the installer's error.
- **Shadowing by a later install, restoring the earlier on removal.** Rejected: removal of the shadowing plugin would restart dependents against a provider that may have been idle for a long time, and two providers' scopes would be open for one key.
- **No base-service protection.** Rejected: base services are the application's stable ground; a plugin replacing one would change the meaning of every other plugin's requirements.

## Consequences

**Positive**:

- Each dependent's binding, each removal order and each lease has one owner.
- A provider conflict is reported to the caller who caused it, at the call.

**Negative**:

- Because checks run against the definitions installed at the time, the outcome of a set of installs can depend on their order (who claims a key first).
- Applications that want several implementations must route them through a registry rather than through the key itself.
- Safe switching between two implementations of one key cannot overlap them; [ADR-BR-004](../decisions/004-replace-is-stop-then-start.md) accepts the stop-then-start gap and points to `Generation` for the cases that cannot.

**Trade-off accepted**: install-order sensitivity and an explicit registry for multiplexing, in exchange for an unambiguous provider for every dependency, removal and lease.

**Amendments (2026-11-08)**:

- The major of a contract is part of its `ServiceId`, so versions never create a second provider slot for one key ([ADR-BR-040](../decisions/040-versioned-contracts-in-core.md)).
- Several implementations per site: a registry provider plus `Selector` ([ADR-BR-046](../decisions/046-hook-points.md)).

## References

- Behaviours: [03 — Installation](../behaviors/03-installation.md), [05 — Activation](../behaviors/05-activation.md), [07 — Replacement and reactivation](../behaviors/07-replacement-and-reactivation.md), [17 — Realms and interception](../behaviors/17-realms-and-interception.md), [19 — Contribution registry](../behaviors/19-contribution-registry.md)
- Invariants: [INV-BR-001](../invariants.md#inv-br-001-one-provider-per-service-key-per-realm), [INV-BR-002](../invariants.md#inv-br-002-the-dependency-graph-is-acyclic-per-resolution-scope), [INV-BR-012](../invariants.md#inv-br-012-a-definition-error-registers-nothing)
- Decisions: [ADR-BR-004](../decisions/004-replace-is-stop-then-start.md), [ADR-BR-006](../decisions/006-one-instance-per-id-per-realm.md), [ADR-BR-019](../decisions/019-realms-are-resolution-namespaces.md), [ADR-BR-024](../decisions/024-shared-state-helpers.md), [ADR-BR-040](../decisions/040-versioned-contracts-in-core.md), [ADR-BR-046](../decisions/046-hook-points.md)
- Source: `docs/SPEC.md` — "Host interface" (install outcomes), "Disable, enable and restart", "Realms and interception", "API decisions" row 1
