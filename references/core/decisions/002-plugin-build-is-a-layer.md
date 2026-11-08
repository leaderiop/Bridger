# ADR-BR-002: A plugin's build is an Effect Layer

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ADR-002                                              |
> | Revision       | 0.3                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.3 (2026-11-08): Heterogeneous lists use `Plugin.Any`; reference to ADR-KT-002 (CCR-BR-020)<br>0.2 (2026-10-02): Layer.effectContext and the memo-map behaviour confirmed (CCR-BR-003)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001) |
---

## Context

A plugin has to construct the services it provides, acquire resources that must be released when it stops, state which services it needs, and let the compiler catch a requirement it forgot to declare. Effect authors already do all of this with `Layer`: `Layer.effect`, `Layer.provide`, `Layer.merge`, scoped acquisition, typed input (`RIn`) and output (`ROut`).

What a `Layer` does not do is wire itself at runtime. `Layer.provide` connects layers statically, when the program is composed; Bridger's plugins arrive and leave while the program runs. So the question (SPEC.md "API decisions", row 5) is whether a plugin's construction contract should be a `Layer`, with a runtime resolver supplying its input, or a bespoke contract.

A second, subtler question is memoization. Layers are memoized by reference in a memo map. If one memo map were shared across activations, a restart would find the previous build in it and reuse a build whose scope has already closed: the restarted plugin would receive released resources.

## Decision

A plugin's `build` is an ordinary Effect `Layer`:

`Layer<IdentifiersOf<Provides>, E, IdentifiersOf<Requires> | Plugin.Runtime | Plugin.Config<C>>`

- `Plugin.define` infers `requires` and `provides` as `const` tuples. The layer's `RIn` may not exceed the declared requirements plus the host-provided `Plugin.Runtime` and `Plugin.Config`, and its `ROut` must cover every provided identifier; a mismatch is a compile error. This is the only type-level guarantee. Requirements hidden inside methods the layer returns are not tracked and remain an author contract.
- The runtime lists are still mandatory, because types are erased: the resolver needs `requires` and `provides` as values to wire plugins.
- Each activation builds the layer with `Layer.buildWithMemoMap(build, memoMap, activationScope)`, where `memoMap` is created **fresh for that activation** (`Layer.makeMemoMap`) and `activationScope` is `Scope.fork(hostScope, "sequential")`. Inside one activation, memoization applies as usual, so two sub-layers sharing a third build it once. The captured provider services, `Plugin.Runtime` and `Plugin.Config` are the layer's input.
- The provided services are published as one unit after the build succeeds; an omitted declared service is an activation failure and nothing is published.
- `Plugin.fromEffect` is sugar for authors who prefer an `Effect<Context<…>>`; it lifts the effect with `Layer.effectContext`, confirmed to exist in effect 4.0.0 (prototype checks E2a–E2b, [ADR-BR-001](../decisions/001-effect-v4-as-effect-system.md)). The prototype also confirmed the memo-map trap this ADR avoids: one shared `MemoMap` reuses a build across activations, a fresh one rebuilds (E4a–E4b).
- Bridger introduces no second resource abstraction beside `Scope` and `Layer`.

## Alternatives considered

- **A bespoke `Effect<Context>` contract as the primary form.** Rejected: it duplicates what `Layer` already gives (scoped construction, typed requirements, composition) and loses `RIn` checking for composed sub-layers. It survives only as sugar (`Plugin.fromEffect`).
- **A class or object with `start`/`stop` methods (Cordis-style).** Rejected: release order becomes the author's bookkeeping, and requirements are not typed through the construction.
- **One memo map per host.** Rejected: memoization by reference would make a restart reuse a build whose scope is closed.
- **One memo map per plugin, kept across activations.** Rejected for the same reason; the hazard is per activation, not per host.
- **Deriving `requires`/`provides` from the layer's types alone.** Rejected: types do not exist at runtime, so the resolver would have nothing to read.

## Consequences

**Positive**:

- Everything an Effect author knows about layers applies unchanged.
- An undeclared requirement of the layer itself fails to compile ([URS-BR-003](../urs.md#urs-br-003-catch-undeclared-dependencies-at-compile-time)).
- Restarting a plugin always runs its build again against fresh resources.

**Negative**:

- The runtime lists repeat information the types already carry, and a requirement reached only inside a returned method is invisible to both.
- A plugin cannot share a memoized sub-layer with another plugin or with its own previous activation; sharing goes through a provided service instead.

**Trade-off accepted**: reusing `Layer` costs a duplicated runtime key list and an untracked class of hidden requirements, in exchange for no second construction model and a compile-time check on the part that can be checked.

**Amendments (2026-11-08)**:

- Heterogeneous lists use `Plugin.Any`, whose `build` is `Layer<never, unknown, any>` because `Layer` is contravariant in its output ([ADR-KT-002](../../kit/decisions/002-plugin-any-is-the-contravariant-top.md)).

## References

- Behaviours: [01 — Plugin definition](../behaviors/01-plugin-definition.md), [05 — Activation](../behaviors/05-activation.md)
- Invariants: [INV-BR-003](../invariants.md#inv-br-003-publication-is-atomic), [INV-BR-014](../invariants.md#inv-br-014-every-activation-gets-a-fresh-scope-and-memo-map)
- Decisions: [ADR-BR-001](../decisions/001-effect-v4-as-effect-system.md), [ADR-BR-011](../decisions/011-serviceid-is-key-identity.md), [ADR-BR-018](../decisions/018-configuration-decoded-before-build.md), [ADR-KT-002](../../kit/decisions/002-plugin-any-is-the-contravariant-top.md) (kit companion)
- Source: `docs/SPEC.md` — "Plugin definition" (Activation paragraph), "The small public interface", "API decisions" row 5
