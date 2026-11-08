# ADR-KT-002: Plugin.Any is the contravariant top of plugin definitions, with a phantom brand

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-KT-ADR-002                                           |
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

A host, a group and a desired list hold plugins of different types, so they
need one type that every definition fits. The prototype used
`AnyPlugin = PluginDefinition<Keys, Keys, unknown>`; core writes
`PluginDefinition<any, any, any, any>` (BEH-BR-127, BEH-BR-153). Both give
`build` a type like `Layer<any, …>` or `Layer<unknown, …>`.

Effect v4 declares `Layer<in ROut, out E, out RIn>`. Because `ROut` is
contravariant, a layer that provides nothing (`Layer<never, …>`) is not
assignable to `Layer<any, …>` ("Type 'any' is not assignable to type
'never'"). Appendix A shows the consequence: the prototype's tests carry 43
casts to `AnyPlugin`; 11 of them, all on plugins that provide nothing, are
necessary, and the rest were written defensively. Replacing the one type with
a `build` of type `Layer<never, unknown, any>` in a scratch copy removed 42 of
the 43 with no other edit (appendix A §3).

A wider type alone is unsound for object literals: a literal declaring
`provides: [Events]` with an empty build would then type-check, though
`Plugin.define` rejects it.

## Decision

- Core exports `Plugin.Any`: the definition fields with `build:
  Layer.Layer<never, unknown, any>` and a phantom brand
  `readonly [PluginTypeId]: typeof PluginTypeId` (BEH-KT-004).
- `Plugin.define` and `definePlugin` return types that include the brand. The
  brand exists only in types: nothing is added at run time, so definitions
  stay inert data (BEH-BR-001).
- `install`, `replace`, `Plugin.group` members, `Plugin.Runtime.install` and
  `DesiredPlugin.plugin` accept `Plugin.Any` (alongside the existing generic
  signatures).
- A definition whose key lists depend on a run-time value is written as one
  definition per shape (BEH-KT-005).

## Alternatives considered

- **Keep `any` and cast.** Rejected: casts hide real errors; appendix A shows
  most were not needed and nobody could tell which.
- **`Layer.Any` from Effect.** Considered; equivalent where it is
  `Layer<never, any, any>`. Bridger names its own type so that its meaning is
  fixed by this specification rather than by a library alias.
- **A run-time brand (symbol property).** Rejected: it would add a field to a
  definition that loaders and reconcile lists compare, for no type benefit.

## Consequences

**Positive**:

- No cast is needed to put any definition into a host or a list.
- Literals that bypass `define` are rejected, closing the hole in both the
  old and the widened type.

**Negative**:

- Core gains one exported type and amended signatures in four behaviour files
  (integration note; registered by the integration CCR).
- Hand-built definitions (tests constructing literals) must go through
  `Plugin.define` or `definePlugin`.

**Trade-off accepted**: one new core type for the removal of a whole family
of casts.

## References

- Behaviours: [BEH-KT-004](../behaviors/01-plugin-facade.md#beh-kt-004-pluginany-accepts-every-definition-and-only-definitions), [BEH-KT-005](../behaviors/01-plugin-facade.md#beh-kt-005-a-data-dependent-key-list-is-two-definitions); core [01](../../core/behaviors/01-plugin-definition.md), [03](../../core/behaviors/03-installation.md), [14](../../core/behaviors/14-children-and-groups.md), [18](../../core/behaviors/18-reconciliation-and-confluence.md)
- Evidence: [appendix A](../appendices/a-cast-inventory.md)
- Decisions: [ADR-BR-002](../../core/decisions/002-plugin-build-is-a-layer.md)
