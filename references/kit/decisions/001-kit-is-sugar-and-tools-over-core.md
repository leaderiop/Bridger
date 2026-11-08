# ADR-KT-001: The kit is sugar and tools over core, never a second runtime

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-KT-ADR-001                                           |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.1 (2026-11-08): Initial draft (CCR-KT-001)                 |

---

## Context

Core is deliberately strict: a `Layer` per plugin, declared keys checked at
compile time, every mutation attributed and audited. Adoption suffers when the
strictness is felt as ceremony, and the gap report ranks "the Effect learning
curve" among Bridger's risks. Two ways out exist: relax the core, or put an
easier surface in front of it.

## Decision

`@bridger/kit` adds authoring sugar, test helpers, generators and tools, and
no runtime semantics:

- `definePlugin` returns a core `PluginDefinition` derived by fixed rules
  (BEH-KT-001); a host cannot tell it from `Plugin.define` (INV-KT-001).
- Test helpers drive core's `TestHost` only (INV-KT-002).
- Tools change a host only through core operations, attributed and audited
  (INV-KT-004); `dev` owns its host and refuses a wired sink or gate
  (BEH-KT-026).
- The kit exports its own names (`Conformance.verify`, not `Contract.verify`)
  rather than extending core namespaces, because core must not depend on the
  kit.
- The one core change the kit needs is a type, `Plugin.Any`
  ([ADR-KT-002](./002-plugin-any-is-the-contravariant-top.md)).

## Alternatives considered

- **Relax core** (untyped `install`, implicit requires). Rejected: it removes
  the compile-time checks (BEH-BR-002) that make lifecycle errors visible
  before run time.
- **A separate "simple host".** Rejected: two hosts with different semantics
  would split every guarantee and every test.
- **Decorators or code generation for plugins.** Rejected for v0.1: plain
  functions type-check without a build step; generation is reserved for the
  SDK, where the consumer must not see Effect at all.

## Consequences

**Positive**:

- Everything specified for core holds for kit users; the kit can be learned
  and dropped without changing behaviour.

**Negative**:

- The facade cannot hide every Effect concept: `make` is still an `Effect`.
  Partners who must not see Effect use the SDK instead.

**Trade-off accepted**: a thinner simplification, in exchange for no second
set of semantics.

## References

- Behaviours: [01](../behaviors/01-plugin-facade.md), [02](../behaviors/02-plugin-test.md), [04](../behaviors/04-cli.md)
- Invariants: [INV-KT-001](../invariants.md#inv-kt-001-a-facade-plugin-behaves-as-its-core-equivalent), [INV-KT-002](../invariants.md#inv-kt-002-test-helpers-run-only-through-testhost), [INV-KT-004](../invariants.md#inv-kt-004-tooling-changes-a-host-only-through-host-operations)
- Decisions: [ADR-BR-002](../../core/decisions/002-plugin-build-is-a-layer.md), [ADR-BR-027](../../core/decisions/027-core-exclusions.md)
- Source: gap report 2026-11-08, §5 item 17 and §9
