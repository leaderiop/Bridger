# ADR-BR-001: Effect v4 as the effect system

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ADR-001                                              |
> | Revision       | 0.3                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.3 (2026-10-03): Consequence aligned with the prototype items closed by CCR-BR-003 (consistency pass) (CCR-BR-013)<br>0.2 (2026-10-02): Prototype items closed with evidence from the Effect API prototype (CCR-BR-003)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001)                 |

---

## Context

Bridger installs, removes and replaces plugins while an application runs. Every concern that implies has to be answered somewhere: scoped acquisition and release of a plugin's resources, finalizers that run in a known order, typed service requirements, interruption of work that must not outlive its provider, typed failures, configuration with secrets, a state feed, a bounded event log, a deterministic clock for tests, and hosting from code that is not an Effect program.

Each of those has an existing Effect mechanism: `Scope` and `Layer` for resources, `Context.Service` keys for requirements, fibers and supervision for interruption, tagged errors for failures, `ConfigProvider` and `Redacted` for configuration, `SubscriptionRef` and `PubSub` for observation, `TestClock` for time and `ManagedRuntime` for non-Effect hosts. A plugin runtime written without them would rebuild each one by hand and then have to prove that the rebuilt pieces compose. The source design (SPEC.md, "Purpose" and the technology policy under it) is written against Effect v4 throughout: `Context.Service` keys, `Layer.buildWithMemoMap`, `Scope.fork`.

SPEC.md's technology policy is "the latest stable Effect 4.x release (4.0.0 or later)", with unstable-module imports allowed where a feature needs them, each recorded with an explicit compatibility version. SPEC.md also states that its examples and signatures have not been type-checked. It flags one Effect behaviour as needing confirmation at prototype time (sliding `PubSub` lag), hedges another ("`Layer.effectContext` or equivalent"), and assumes a third (that a `ManagedRuntime` build can be forced) without evidence.

## Decision

Effect v4 is Bridger's effect system and its only runtime dependency (NFR-BR-006). Concretely:

1. **Baseline version.** The specification is written against `effect@4.0.0`. The policy is "latest stable 4.x": a later 4.x minor is adopted only when the planned API smoke test `packages/core/test/v4-api-smoke.test.ts` *(Planned)*, which names every Effect API this specification relies on, still compiles and passes against it. A 5.x release is a new decision, not a policy update.
2. **Unstable imports.** Any import from an Effect unstable module is listed in a register (planned in `packages/core/UNSTABLE-IMPORTS.md` *(Planned)*) with the module path, the feature that needs it and the exact Effect version it was confirmed against. None is recorded yet. An unstable import without a register entry is a review failure.
3. **Prototype items — closed by CCR-BR-003.** The three facts this specification relied on without confirmation were checked against the real `effect@4.0.0` runtime in `prototypes/effect-v4-api` (effect 4.0.0, Node 22; see its `RESULTS.md`):
   - *Sliding `PubSub` lag* is **per subscriber**: a subscriber that keeps up receives every message, a slow one loses only its own oldest messages, and publishing never blocks (E1a–E1c). [ADR-BR-007](../decisions/007-observation-primitives.md)'s `seq` rule is therefore exact: a gap means *this* subscriber fell behind.
   - *`Layer.effectContext`* **exists** with the signature `(effect: Effect<Context<A>, E, R>) => Layer<A, E, Exclude<R, Scope>>`; resources acquired inside are released when the build scope closes (E2a–E2b). `Plugin.fromEffect` uses it directly.
   - *Forcing a `ManagedRuntime` build*: `runtime.context()` forces the build **without running an effect**, the result is cached, and a failing layer makes it reject (E3a–E3e). [ADR-BR-009](../decisions/009-managedruntime-hosting.md) uses `context()` rather than `runPromise(Effect.void)`.
4. **Every other API name** taken from SPEC.md (`Layer.buildWithMemoMap`, `Layer.makeMemoMap`, `Scope.fork(scope, "sequential")`, `Effect.forkIn`, `Effect.forkChild`, `Effect.timeoutOrElse`, `Effect.serviceOption`, `Context.Reference`, `Schema.TaggedError`) is declared in effect 4.0.0, and the behaviours the specification relies on were exercised by the same prototype (E4–E9): a shared `MemoMap` reuses a build across activations while a fresh one rebuilds (the reason for a fresh memo map per activation); closing a host scope closes forked scopes; `SubscriptionRef.changes` emits the current value then every change; a `Context.Reference` is inherited by forked children; `Schema.TaggedError` narrows with `catchTag`; two key objects with one identifier resolve the same `Context` entry (why `KeyMismatch` is an explicit check). One name differs from SPEC.md's prose: `Effect.timeoutOrElse` takes `{ duration, orElse }`. These remain entries of the planned smoke test, which re-checks them on every Effect upgrade.

## Alternatives considered

- **Effect v3.** Rejected: the design is written in v4 vocabulary (`Context.Service`, v4 `Layer` and `Scope` signatures). Starting on v3 would mean a migration before the first release.
- **A hand-rolled lifecycle on Promises and `AbortController`.** Rejected: it rebuilds scopes, LIFO finalizers, supervision, typed errors and a test clock, each needing its own proof, and it gives plugin authors a second resource model beside the one their services already use.
- **Pinning an exact pre-release.** Rejected: a pre-release can change without a deprecation path; the policy targets stable releases only.
- **Floating on any 4.x without a gate.** Rejected: a subtle behavioural change (for example in memo-map or scope semantics) would surface far from its cause.
- **Forbidding unstable modules.** Rejected: it would block features whose only Effect form is unstable. Recording the version keeps the exposure visible.

## Consequences

**Positive**:

- One error channel, one dependency mechanism and one concurrency model for the host and for plugin authors.
- Tracing, logging and metrics follow the fiber without a Bridger-specific port.
- `TestClock` and injected services make lifecycle tests deterministic ([ADR-BR-026](../decisions/026-deterministic-test-host.md)).

**Negative**:

- Effect is a large dependency with a real learning curve.
- A defect in the Effect runtime becomes a defect in every host ([RSK-BR-022](../gxp/03-risk-assessment.md#rsk-br-022)); Bridger cannot mitigate it except by pinning and by its own tests.
- The three behaviours the design leaned on were confirmed against effect 4.0.0 only by a throwaway prototype (CCR-BR-003); the planned smoke test re-checks them on every upgrade.

**Trade-off accepted**: depending on one large, versioned runtime, gated by a smoke test and an unstable-import register, is a smaller and more visible risk than re-deriving scope, interruption and typed-error semantics by hand.

## References

- Behaviours: [01 — Plugin definition](../behaviors/01-plugin-definition.md), [05 — Activation](../behaviors/05-activation.md), [12 — Shutdown and hosting](../behaviors/12-shutdown-and-hosting.md), [13 — Observability and diagnostics](../behaviors/13-observability-and-diagnostics.md), [21 — Testing host](../behaviors/21-testing-host.md)
- Invariants: [INV-BR-014](../invariants.md#inv-br-014-every-activation-gets-a-fresh-scope-and-memo-map), [INV-BR-024](../invariants.md#inv-br-024-time-and-identifiers-come-only-from-services)
- Decisions: [ADR-BR-002](../decisions/002-plugin-build-is-a-layer.md), [ADR-BR-007](../decisions/007-observation-primitives.md), [ADR-BR-008](../decisions/008-error-taxonomy.md), [ADR-BR-009](../decisions/009-managedruntime-hosting.md)
- Source: `docs/SPEC.md` — "Purpose" (technology policy), "Plugin definition", "Observability", "Hosting from non-Effect code", "API decisions" rows 5–7
- Precedent (cited, not linked): qadi ADR-QD-001, "Effect v4 is the effect system" — the API smoke-test pattern
