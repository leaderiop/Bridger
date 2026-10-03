# ADR-BR-024: ContributionRegistry and Generation are core helpers

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ADR-024                                              |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.2 (2026-10-03): A forced Generation drain interrupts `acquire` holders (G26) (consistency pass) (CCR-BR-013)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001)                 |

---

## Context

Two earlier decisions leave gaps that applications would otherwise fill themselves, badly.

[ADR-BR-003](../decisions/003-one-provider-per-key-per-realm.md) allows one provider per key per realm. Extension points where many plugins contribute (routes, commands, menu entries, event listeners) therefore need a shared service that plugins register into. A hand-rolled `Map` in a base service gets three things wrong: a contribution outlives the plugin that made it, a consumer iterating it sees a half-removed entry, and removal does not wait for a callback still using the contribution.

[ADR-BR-004](../decisions/004-replace-is-stop-then-start.md) makes `replace` stop-then-start, so a set of behaviours that must switch together (an ERP model registry where validators of one version must not run against storage mappings of another) cannot be expressed through per-plugin `provides`. It needs one value published atomically, with old callers allowed to finish against the old value.

Effect's `Scope` gives cleanup within one plugin; neither gap is about one plugin.

## Decision

The core provides two helpers beside the `Host`, neither part of the `Host` interface and neither reading or changing plugin state.

**`ContributionRegistry`** — a stable base service, made with `ContributionRegistry.make`.

- `add(id, value, { priority })` registers for the lifetime of the caller's `Scope`; a duplicate ID fails with `DuplicateContribution` and registers nothing.
- Entries are ordered by `priority` ascending, then by ID; the order is stable between revisions. `view` and `changes` follow the same gap-free, latest-wins rules as `Host.changes`.
- On scope close, a contribution is first hidden from `get`, `view`, `use` and `useAll`, then removal waits for callbacks holding it through `use`/`useAll`, up to `drainTimeout`, and then revokes them with `LeaseRevoked`. `get` and `view` return plain, unleased references.

**`Generation<A>`** — made with `Generation.make(initial, options)`, owned by one coordinator.

- `publish(next)` replaces the value in one step; a new caller sees the old value or the new one, never a mixture. It returns a `Retired<A>` for the old value.
- `acquire` and `use` admit callers to the current value under a lease; `closeAdmission` makes `acquire` fail with `AdmissionClosed`, and `reopenAdmission` reverses it.
- `drain(options)` and `awaitDrained(options)` are bounded and fail with `DrainTimeout`; with `force` they interrupt the fiber of each `acquire` holder, fail each `use` callback with `LeaseRevoked`, and wait for their finalizers (BEH-BR-174). Several retired values may drain at once.
- Ordering rule: the owner publishes the replacement generation, drains the old one, and only then removes plugins whose resources the old generation referenced.

The event bus is built on `ContributionRegistry` ([ADR-BR-020](../decisions/020-typed-event-bus.md)).

## Alternatives considered

- **Leave both to applications.** Rejected: the drain-and-revoke rules are the same as the host's leases and are the hard part; each application would get them subtly wrong, and the event bus needs the registry anyway.
- **Allow several providers per key instead of a registry.** Rejected in ADR-BR-003: dependents capture one provider identity, and removal ordering needs an unambiguous owner.
- **Make `Generation` a `Host` operation.** Rejected: it would tie a value-level switch to plugin state and to the per-plugin linearisation of [ADR-BR-012](../decisions/012-intent-and-linearization.md), although the switch spans no single plugin.
- **Leased `get`/`view`.** Rejected: most reads are momentary; forcing a lease on every read would make removal wait on renderers that only looked. Callers who need a contribution to outlive a read use `use`/`useAll` or a scoped lease.

## Consequences

**Positive**:

- Many-contributor extension points and atomic multi-behaviour switches have one tested implementation of drain, revocation and ordering.
- Contributions disappear with the plugin that made them, without bookkeeping.

**Negative**:

- `Generation` assumes a single owner that calls `publish`; two owners racing on one generation are outside its contract.
- A reference obtained from `get`, `view` or a lease that escapes its callback is unprotected, as with `use`.
- Registry and generation calls are not host `Operation`s. They are not attributed, gated or audited by the core; an application that switches regulated behaviour through a `Generation` records that switch itself.

**Trade-off accepted**: two more public helpers in core, at the cost of a larger surface, in exchange for one correct implementation of the drain-and-revoke rules that the event bus, routes and model registries all depend on.

## References

- Behaviours: [19 — Contribution registry](../behaviors/19-contribution-registry.md), [20 — Generation](../behaviors/20-generation.md), [09 — Leases](../behaviors/09-leases.md)
- Invariants: [INV-BR-001](../invariants.md#inv-br-001-one-provider-per-service-key-per-realm), [INV-BR-006](../invariants.md#inv-br-006-a-leased-provider-does-not-close-under-its-lease), [INV-BR-017](../invariants.md#inv-br-017-every-drain-is-bounded-unless-declared-forever)
- Requirements: [URS-BR-014](../urs.md#urs-br-014-contribute-to-a-shared-extension-point-safely), [URS-BR-015](../urs.md#urs-br-015-switch-several-behaviours-atomically)
- Decisions: [ADR-BR-003](../decisions/003-one-provider-per-key-per-realm.md), [ADR-BR-004](../decisions/004-replace-is-stop-then-start.md), [ADR-BR-015](../decisions/015-leases-one-primitive.md), [ADR-BR-020](../decisions/020-typed-event-bus.md)
- Source: `docs/SPEC.md` — "Revertibility and shared state", "Generations: atomic publication and admission control"
