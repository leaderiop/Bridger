# ADR-BR-022: Optional and reactive dependencies never gate activation

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ADR-022                                              |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.2 (2026-11-22): Non-goal stated: no "required at install, tolerate later loss" form (report 02 X3, D-11)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001)                 |

---

## Context

`requires` is all-or-nothing: a plugin starts only when every required key has an active provider, and it stops when any provider leaves. That is the right rule for a service the plugin cannot work without. It is the wrong rule for a service the plugin merely uses when present: a metrics exporter that sends to a remote collector if one is installed, a module that registers a menu entry when the menu service exists. Declaring such a service in `requires` makes its absence stop the plugin, and its removal cascades a stop through every dependent of the plugin, for a feature that was never essential.

Cordis distinguishes `ctx.get` (optional, point-in-time) from `ctx.inject` (reactive: run while the dependencies are present).

## Decision

Two forms cover soft dependencies, and neither ever gates activation.

**`optional`** is a definition field listing keys the plugin uses when present.

- Optional keys never gate activation, never appear in `missingServiceIds`, and take no part in dependency-cycle detection or start ordering.
- A key listed in both `requires` and `optional` is an `InvalidDefinition`.
- `Plugin.Runtime.optional(key)` returns an existence witness `Option<void>` as of that moment and does not track later changes; the service is reached only through `useOptional`, inside its lease (report 01, R8).
- `Plugin.Runtime.useOptional(key, run)` runs the callback under a lease and returns `None` when the service is unavailable. A lease on an optional provider delays that provider's removal like any lease; it never stops the optional consumer.

**`whenAvailable(keys, run)`** is the reactive form. Inside an activation it runs `run` in a child scope while *all* `keys` are available: it takes a scoped lease, runs `run`, and when any provider starts leaving it interrupts the run, closes the child scope (finalizers run) and releases the lease; when the keys return it runs `run` again.

- The plugin's own state does not change as the keys come and go.
- A registered `whenAvailable` counts as a dependent in removal ordering: its child scope closes before the provider closes, so the guarded-withdrawal guarantee of [ADR-BR-015](../decisions/015-leases-one-primitive.md) holds for it.
- A failure in `run` follows the same `onFailure` policy as `Plugin.Runtime.background` (default `fail-plugin`).

**Non-goal: a required key that tolerates its own later loss.** `requires` is strict at install *and* afterwards: when its provider leaves, the plugin stops (the Cordis rule, kept on purpose). There is no third form meaning "required to start, tolerate a temporary loss". A plugin that can tolerate the loss declares the key `optional` (it then never gates activation); one that needs a service continuously across provider swaps requires a *broker* facade, so the provider behind it can change without a stop ([19 — Contribution Registry](../behaviors/19-contribution-registry.md), BEH-BR-168). A third form would make `missingServiceIds`, start ordering and the stop cascade depend on a per-key mode, for a case the two forms already cover.

## Alternatives considered

- **A soft flag on `requires` entries.** Rejected: it keeps optional keys inside the gating and cycle machinery, so the resolver would have to special-case them everywhere `requires` is read. A separate field keeps `requires` meaning exactly one thing.
- **Restart the plugin when an optional provider arrives or leaves.** Rejected: it reintroduces the cascade the feature exists to avoid, and repeats `build` side effects for a non-essential change.
- **Include optional keys in cycle detection.** Rejected: an optional edge cannot block a start, so it cannot form a deadlock, and counting it would reject legitimate mutual soft use (two plugins that each enhance the other when present).
- **Unleased optional access only (`optional` without `useOptional`).** Rejected: a caller that uses the returned reference after its provider started stopping would call a closing service, the failure leases exist to prevent.

- **A "required, tolerate loss" mode on `requires`.** Rejected: see the non-goal above; `optional` and a broker cover its cases without a third mode of gating.

## Consequences

**Positive**:

- A non-essential dependency can come and go without stopping its consumer or anything downstream of it.
- `missingServiceIds` keeps meaning "what blocks this plugin", so the snapshot does not report soft dependencies as problems.
- Reactive code gets the same dependents-first teardown as a full plugin without being one.

**Negative**:

- `Plugin.Runtime.optional` returns a point-in-time witness with no service, so there is no reference to hold beyond the moment; a plugin that needs the service uses `useOptional`.
- Because optional edges are excluded from cycle detection, two plugins may use each other optionally; each must tolerate the other's absence.
- A plugin's observable behaviour now depends on which optional providers happen to be present, which the snapshot shows only indirectly (through the other plugins' states).

**Trade-off accepted**: soft dependencies are invisible to gating, ordering and cycle checks, at the cost of behaviour that varies with what else is installed, in exchange for no cascading stops over non-essential services.

## References

- Behaviours: [15 — Optional and reactive dependencies](../behaviors/15-optional-and-reactive.md), [09 — Leases](../behaviors/09-leases.md), [10 — Runtime failure and health](../behaviors/10-runtime-failure-and-health.md)
- Invariants: [INV-BR-019](../invariants.md#inv-br-019-optional-dependencies-never-gate-activation), [INV-BR-002](../invariants.md#inv-br-002-the-dependency-graph-is-acyclic-per-resolution-scope), [INV-BR-005](../invariants.md#inv-br-005-dependents-stop-before-their-providers), [INV-BR-006](../invariants.md#inv-br-006-a-leased-provider-does-not-close-under-its-lease)
- Requirements: [URS-BR-012](../urs.md#urs-br-012-use-a-dependency-when-it-is-present-without-requiring-it)
- Decisions: [ADR-BR-010](../decisions/010-cordis-parity.md), [ADR-BR-015](../decisions/015-leases-one-primitive.md), [ADR-BR-017](../decisions/017-runtime-failure-one-transition.md)
- Source: `docs/SPEC.md` — "Optional and reactive dependencies"
