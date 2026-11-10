# ADR-BR-010: Cordis feature parity and what is not adopted

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ADR-010                                              |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed — amended by ADR-BR-032                             |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.2 (2026-11-10): Status names ADR-BR-032, which amends this ADR, pairing its "amends" (Low) (CCR-BR-035)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001)                 |

---

## Context

Bridger's core rests on the same paradigm as Cordis, the plugin framework of DeepSeek Harness: revertible effects in time and reactive coeffects in space (Shi, Zhang and Cui, *A Programming Paradigm for Spatiotemporal Composability*). Cordis is a working reference with a published feature set, reviewed for parity in SPEC.md "Comparison with Cordis".

A minimal core (install, remove, replace, use) would push every adapter to reinvent children, reactive dependencies, events and declarative loading, and each reinvention would need the host's internals (removal order, leases) to be correct. Full parity, on the other hand, would import features that exist because of JavaScript's dynamism and would weaken Effect's static typing.

## Decision

Bridger covers each Cordis capability with an Effect-native form (SPEC.md "API decisions" row 8), and deliberately does not adopt the ones that depend on JavaScript dynamics.

**Adopted** (each specified in its own behaviour file):

| Cordis | Bridger |
| --- | --- |
| fiber handle (`dispose`, `restart`, `await`) | `PluginHandle` with `awaitActive` failing fast |
| child plugins, groups | `Plugin.Runtime.install`, `Plugin.group` ([ADR-BR-021](../decisions/021-children-and-groups.md)) |
| `ctx.get`, `ctx.inject` | `optional`, `useOptional`, `whenAvailable` ([ADR-BR-022](../decisions/022-optional-and-reactive-dependencies.md)) |
| events (`on`, `emit`, `parallel`, `serial`, `waterfall`) | `Bridger.Events` with typed `EventKey`s ([ADR-BR-020](../decisions/020-typed-event-bus.md)) |
| `ctx.isolate`, `ctx.intercept` | realms and `Interception` ([ADR-BR-019](../decisions/019-realms-are-resolution-namespaces.md)) |
| loader `disabled`, update, reload | `disable`, `enable`, `restart`, `reconfigure` |
| config schema, `.volatile()` | `config` Schema, `volatile` ([ADR-BR-018](../decisions/018-configuration-decoded-before-build.md)) |
| loader entries, patches | `reconcile`, `Desired.overlay` ([ADR-BR-023](../decisions/023-desired-state-reconcile.md)) |
| `ctx.registry`, `fiber.getEffects()` | `snapshot`, `changes`, `inspect` (names and counts only) |
| silent `PENDING` stalls | the `plugin-stalled` event |

**Not adopted:**

- `ctx.mixin`, `ctx.accessor`, `Service.invoke`, `ctx.extend`: Effect services are reached through typed keys, and scoping is `Context`/`Scope`. Grafting properties onto a shared context object would bypass both.
- `bail`: Effect has no synchronous dispatch mode, and `serial` covers the decision pattern.
- Veto-style hooks over host operations (Cordis's `internal/update` waterfall): configuration is checked by its schema and by `reconfigure` before anything restarts. [ADR-BR-032](../decisions/032-operation-gate.md) later amends this for host lifecycle operations only, through a single `OperationGate` port; application events keep no veto.
- Session log, profiles and bundles: application layer. Loader file formats and fetching: the loader adapter. Automatic private-state migration on hot reload: not provided (as in Cordis).

**Beyond Cordis**, the Effect form adds typed requirements and errors, bounded leases with drain, force and re-entrancy detection, a specified operation-race table, supervised background work and health checks, atomic `Generation` publication, schema-checked and redacted configuration, and a deterministic test host.

## Alternatives considered

- **A minimal core without parity features.** Rejected: each adapter would rebuild children, reconcile and reactive dependencies without access to removal ordering and leases, and would get them subtly wrong.
- **Full parity including `mixin`/`accessor`/`invoke`.** Rejected: dynamic property injection defeats typed keys and typed requirements.
- **Each parity feature as a separate package.** Rejected: children, reactive dependencies and events need the host's removal order and lease path, which are internal.

## Consequences

**Positive**:

- Applications familiar with Cordis find each capability, typed.
- Every parity feature shares the one removal, lease and failure model.

**Negative**:

- The core surface is larger than a minimal host, with more behaviour to specify, test and keep consistent.
- Authors porting Cordis plugins that use `mixin` or `accessor` must restructure them around service keys.

**Trade-off accepted**: a larger core, in exchange for parity features that are correct with respect to removal order and leases, and no dynamic features that would undercut static typing.

## References

- Behaviours: [14 — Children and groups](../behaviors/14-children-and-groups.md), [15 — Optional and reactive](../behaviors/15-optional-and-reactive.md), [16 — Event bus](../behaviors/16-event-bus.md), [17 — Realms and interception](../behaviors/17-realms-and-interception.md), [18 — Reconciliation and confluence](../behaviors/18-reconciliation-and-confluence.md), [13 — Observability and diagnostics](../behaviors/13-observability-and-diagnostics.md)
- Invariants: [INV-BR-019](../invariants.md#inv-br-019-optional-dependencies-never-gate-activation), [INV-BR-020](../invariants.md#inv-br-020-a-realm-changes-resolution-only), [INV-BR-021](../invariants.md#inv-br-021-reconcile-is-idempotent)
- Decisions: [ADR-BR-019](../decisions/019-realms-are-resolution-namespaces.md) through [ADR-BR-023](../decisions/023-desired-state-reconcile.md), [ADR-BR-027](../decisions/027-core-exclusions.md), [ADR-BR-032](../decisions/032-operation-gate.md)
- Source: `docs/SPEC.md` — "Comparison with Cordis", "Typed events and hooks", "API decisions" row 8, "Source notes"
