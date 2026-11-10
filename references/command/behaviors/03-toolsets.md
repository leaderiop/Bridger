# 03 — Toolsets

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-CM-BEH-03                                            |
> | Revision       | 0.4                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.4 (2026-11-10): BEH-CM-019 prose: a pinned tool never runs a different definition (INV-CM-003); a command contributed again by another plugin with an identical descriptor runs without `ToolChanged`, since the owner is not in the digest (M12) (CCR-CM-006)<br>0.3 (2026-11-08): `forPrincipal` returns a `GenerationView`; followers read its `changes` feed (CCR-CM-002)<br>0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-CM-001)<br>0.1 (2026-11-08): Initial draft (CCR-CM-001)                 |

---

An agent, an MCP client or a command palette does not want the whole
catalog: it wants the commands one principal may be offered, in an order that
does not change between two identical requests, and — for an agent — a list
that does not change under it in the middle of a turn. A **toolset** is that
list: an immutable value computed from the catalog by a selector, published
per principal through core's [`Generation`](../../core/behaviors/20-generation.md)
and pinned by a lease for the length of a turn. This file owns
BEH-CM-017–024 and uses BEH-CM-017–022; 023–024 are reserved.

Planned source: `packages/command/src/Toolsets.ts` *(Planned)*.

## BEH-CM-017: A toolset is an immutable, ordered value

> **Invariant:** [INV-CM-002](../invariants.md#inv-cm-002-a-toolsets-order-depends-only-on-its-contents)
> **See:** [ADR-CM-003](../decisions/003-toolset-is-a-generation.md)
> **Core seam:** [20 — Generation](../../core/behaviors/20-generation.md)

```ts
// illustrative — not type-checked
interface Toolset {
  readonly revision: number                     // the generation revision it was published at (0 for the first)
  readonly principal: Actor
  readonly selector: string                     // ToolsetSelector.name
  readonly catalogRevision: number              // CatalogView.revision it was computed from
  readonly tools: ReadonlyArray<CommandDescriptor>
  readonly fingerprint: string                  // "sha256:" + hex of JCS([tools[i].digest ...])
}
```

```
REQUIREMENT: A `Toolset` MUST be built in full from one `CatalogView` before
             it is published, and MUST NOT change afterwards. Building MUST
             NOT run any handler.
```

```
REQUIREMENT: `fingerprint` MUST be "sha256:" followed by the lower-case
             hexadecimal SHA-256 of the RFC 8785 canonical JSON of the array
             of the tools' digests, in toolset order.
```

The fingerprint is a cheap equality: two toolsets with the same fingerprint
offer the same commands with the same descriptions in the same order. MCP
uses it to decide whether a list-changed notification is due
([`@bridger/mcp` list changes](../../mcp/behaviors/02-list-changed.md)).

## BEH-CM-018: A toolset per principal is published as a generation

> **Invariant:** [INV-CM-002](../invariants.md#inv-cm-002-a-toolsets-order-depends-only-on-its-contents)
> **See:** [ADR-CM-003](../decisions/003-toolset-is-a-generation.md)
> **Core seam:** [20 — Generation](../../core/behaviors/20-generation.md), [19 — Contribution registry](../../core/behaviors/19-contribution-registry.md)

```ts
// illustrative — not type-checked
declare const Toolsets: {
  forPrincipal(principal: Actor, selector?: ToolsetSelector):
    Effect.Effect<GenerationView<Toolset>, never, Scope.Scope | CommandCatalog>   // core BEH-BR-169: acquire, use, current, changes
  pin(principal: Actor, selector?: ToolsetSelector):
    Effect.Effect<PinnedToolset, AdmissionClosed, Scope.Scope | CommandCatalog>
  readonly defaultSelector: ToolsetSelector
}
```

```
REQUIREMENT: `forPrincipal` MUST return the `view` (core BEH-BR-169) of a
             `Generation<Toolset>` whose owner is the package — never the
             generation itself — so that no caller can `publish`, close or
             reopen admission, or drain it. The package MUST keep at most one
             such generation per (principal id, selector name) for as long as
             any caller's scope references it, and MUST release it when the
             last reference closes.
```

```
REQUIREMENT: On every `CatalogView` received from `CommandCatalog.changes`,
             the package MUST compute the toolset for the principal and
             selector, and MUST `publish` it only when its fingerprint
             differs from the current toolset's. A catalog change that does
             not change the toolset MUST NOT publish.
```

```
REQUIREMENT: The package MUST NOT force the drain of a retired toolset.
             Retired toolsets MUST drain as their pins end (core BEH-BR-173,
             BEH-BR-175); only the closing of the generation's own scope
             drains with revocation at the limit (BEH-BR-169).
```

```
REQUIREMENT: Two principals with the same actor id MUST share the
             generation; the package MUST NOT compare `kind` or `display`
             when keying generations.
```

```
REQUIREMENT: A caller that must follow the toolset — an MCP server's
             list-changed notifications, a UI's tool palette — MUST read the
             view's `changes` feed (core BEH-BR-169, BEH-BR-170), which
             delivers the current revision first, then each later revision
             only after its `publish` has completed, latest-wins and never
             regressing. The package MUST NOT offer a second feed of its
             own.
```

Publishing only when the fingerprint changes keeps the generation's revision
meaningful: it counts changes that a holder of the toolset could notice, not
every catalog event. Never forcing a drain means that publishing a new
toolset never interrupts an agent turn that pinned the old one.

**Settled here.** (1) The registry's `changes` stream may skip intermediate
views (BEH-BR-165); a toolset is computed from the latest view, so a skipped
revision never appears as a toolset. (2) Handing out the view, as core
recommends for every generation given to other code, keeps the package the
generation's only owner: an MCP session or an agent loop could otherwise
publish a toolset of its own choosing, bypassing the selector, or close
admission for every other session sharing the generation. (3) The selector's `name` is its
identity: two selectors with one name are assumed equal, and a selector that
changes behaviour must change its name.

## BEH-CM-019: Pinning a toolset for a turn

> **Invariant:** [INV-CM-003](../invariants.md#inv-cm-003-a-pinned-tool-never-runs-a-different-definition)
> **See:** [ADR-CM-003](../decisions/003-toolset-is-a-generation.md)
> **Core seam:** [20 — Generation](../../core/behaviors/20-generation.md)
> **Risk:** [RSK-BR-002](../../core/gxp/03-risk-assessment.md#rsk-br-002)

```ts
// illustrative — not type-checked
interface PinnedToolset {
  readonly toolset: Toolset                      // the value admitted at pin time
  readonly lease: Lease<Toolset>                 // core BEH-BR-169
}
```

```
REQUIREMENT: `pin` MUST `acquire` a lease on the principal's generation, as
             `forPrincipal`'s view does, for the caller's scope (core
             BEH-BR-172). For the life of that
             scope the pinned toolset MUST stay the value admitted at pin
             time, whatever is published meanwhile.
```

```
REQUIREMENT: A dispatch given `options.toolset` MUST fail at step 1 with
             `ToolNotInToolset { id, toolsetRevision }` when the command id
             is not among the pinned tools, and with `ToolChanged { id,
             expected, actual }` when the catalog entry's digest differs from
             the pinned descriptor's digest. A pinned tool whose command has
             left the catalog MUST fail with `CommandNotFound`.
```

```
REQUIREMENT: `pin` MUST fail with `AdmissionClosed` when the generation's
             admission is closed. The package closes admission only while
             the generation's scope is closing.
```

The pin stabilises what was **shown**, not what exists: an agent turn sees one
list from its first model call to its last, so the model is never offered a
tool in one step that is gone or different in the next without an error that
says so. A pinned tool whose plugin was removed mid-turn fails with a typed
error; it never runs a different definition under the same id
([INV-CM-003](../invariants.md#inv-cm-003-a-pinned-tool-never-runs-a-different-definition)).
That is the property a turn needs — the model's choice is executed as
described, or not at all. It is a property of the description, not of the
code: the owner is not in the digest (BEH-CM-005), so the same id contributed
again by another plugin with an identical descriptor runs that plugin's
handler without `ToolChanged`.

**Settled here.** A pin does not hold the command's contribution: holding
every contribution of a toolset for the length of a turn would let a long
turn block the removal of every plugin it might call. The handler is held
only while it runs (BEH-CM-013).

## BEH-CM-020: Order depends only on content

> **Invariant:** [INV-CM-002](../invariants.md#inv-cm-002-a-toolsets-order-depends-only-on-its-contents)
> **See:** [ADR-CM-003](../decisions/003-toolset-is-a-generation.md)

```
REQUIREMENT: `Toolset.tools` MUST be ordered by command id in code-unit
             order. The order MUST NOT depend on activation order,
             contribution order, registry priority, realm, owning plugin or
             time.
```

```
REQUIREMENT: Two toolsets built from catalog views with equal descriptor
             sets, for the same principal and selector, MUST have equal
             `tools` arrays and equal fingerprints.
```

A deterministic order is required by the MCP revision this package targets for
`tools/list`, helps model prompt caching (the tool block of a prompt is
byte-identical across turns when nothing changed), and makes agent tests
reproducible. Ordering by id, with ids unique in the catalog, gives a total
order with no tie to break.

## BEH-CM-021: Selection is the application's, and the default excludes regulated commands

> **Invariant:** [INV-CM-005](../invariants.md#inv-cm-005-toolset-membership-grants-nothing)
> **See:** [ADR-CM-002](../decisions/002-catalog-not-rules.md)
> **Core seam:** [29 — Capability grants and call log](../../core/behaviors/29-capability-grants-and-call-log.md)

```ts
// illustrative — not type-checked
interface ToolsetSelector {
  readonly name: string
  readonly include: (descriptor: CommandDescriptor, principal: Actor) => boolean   // pure
}

// Toolsets.defaultSelector
const defaultSelector: ToolsetSelector = {
  name: "bridger:default",
  include: (d) => !d.regulated
}
```

```
REQUIREMENT: `include` MUST be called with each descriptor of the view and
             the principal. A selector that throws MUST make the computation
             fail; the package MUST then keep the current toolset, MUST NOT
             publish, and MUST log the failure at error level with the
             selector's name.
```

```
REQUIREMENT: When no selector is given, `Toolsets.defaultSelector` MUST be
             used. It MUST exclude every descriptor with `regulated: true`
             and include every other descriptor.
```

```
REQUIREMENT: A selector name beginning with "bridger:" MUST be reserved for
             selectors exported by Bridger packages.
```

The application knows which commands an agent principal may be offered — by
its own roles, by tags, by grants of [core file 29](../../core/behaviors/29-capability-grants-and-call-log.md) it has already resolved — and
expresses that in `include`. The default is the one place where the package
reads `regulated`, and it reads it conservatively: forgetting to pass a
selector can never offer a regulated command.

**Settled here.** `include` is synchronous and pure. An effectful selector
would make toolset computation depend on the timing of external calls and
break BEH-CM-020; a selector that needs data (a role table, a grant set)
receives it when it is constructed, and is renamed when that data changes.

**Open.** A helper that builds a selector from [core file 29](../../core/behaviors/29-capability-grants-and-call-log.md) grants
(`Toolsets.fromGrants`) is open until that file's `CapabilityPolicy` shape is
settled.

## BEH-CM-022: Toolset membership grants nothing

> **Invariant:** [INV-CM-005](../invariants.md#inv-cm-005-toolset-membership-grants-nothing)
> **See:** [ADR-CM-002](../decisions/002-catalog-not-rules.md)
> **Risk:** [RSK-BR-014](../../core/gxp/03-risk-assessment.md#rsk-br-014)

```
REQUIREMENT: A dispatch of a command that is in a pinned toolset MUST pass
             every step of BEH-CM-009, including the gate. Membership MUST
             NOT be passed to the gate as a decision, and the package MUST
             NOT describe a toolset as an authorization or a permission.
```

```
REQUIREMENT: A dispatch without `options.toolset` MUST NOT be checked
             against any toolset. Callers that must be confined to a
             toolset — an agent's tool runner, an MCP session — MUST pass
             it.
```

A toolset narrows what is offered; it does not decide what is allowed. Two
mechanisms that both "decide" drift apart, and the one an auditor finds is
rarely the one that ran. The gate decides; the toolset is a projection for a
consumer that should not see more than it can use.

**Settled here.** Confinement is the caller's: `@bridger/agent`'s tool runner
and `@bridger/mcp`'s server always pass a pinned toolset — pinned for the
turn by the agent, for the single call by the MCP server ([`@bridger/agent` seams](../../agent/behaviors/01-agent-seams.md),
[`@bridger/mcp` server](../../mcp/behaviors/01-server.md)).

---

_Previous: [02 — Dispatch](./02-dispatch.md)_ · _Next: [04 — JSON Schema projection](./04-json-schema-projection.md)_
