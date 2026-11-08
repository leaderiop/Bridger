# 01 — Command Definition

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-CM-BEH-01                                            |
> | Revision       | 0.3                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.3 (2026-11-08): Handler run as a served call with `CallerContext.serve`; `title`, `jsonSchema`, `externalAnnotations` on spec, descriptor and digest; `Annotations` type (CCR-CM-002)<br>0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-CM-001)<br>0.1 (2026-11-08): Initial draft (CCR-CM-001)                 |

---

A command is the unit of the catalog: a named, typed request that some plugin
knows how to carry out. This file specifies the command value, the labels it
carries, how a plugin contributes a handler for it, what the catalog exposes
and how a definition is identified. This file owns BEH-CM-001–008 and uses
BEH-CM-001–005; 006–008 are reserved.

Planned source: `packages/command/src/Command.ts`,
`packages/command/src/CommandCatalog.ts` *(Planned)*.

## BEH-CM-001: A command is a value with an id and schemas

> **Invariant:** [INV-CM-004](../invariants.md#inv-cm-004-projection-and-digest-are-deterministic)
> **See:** [ADR-CM-001](../decisions/001-commands-are-contributions.md), [ADR-CM-004](../decisions/004-json-schema-from-encoded-side.md)
> **Core seam:** [19 — Contribution registry](../../core/behaviors/19-contribution-registry.md), [26 — Versioned contracts](../../core/behaviors/26-versioned-contracts.md)

```ts
// illustrative — not type-checked
interface CommandSpec<I, IE, O, OE, E, EE> {
  readonly input: Schema.Codec<I, IE>
  readonly output: Schema.Codec<O, OE>
  readonly error?: Schema.Codec<E, EE>          // domain failures the handler may return
  readonly title?: string                       // a short display name; enters the digest (BEH-CM-005)
  readonly description?: string
  readonly tags?: ReadonlyArray<string>         // free labels, e.g. "read", "write", "catalog"
  readonly regulated?: boolean                  // default false; a label, see BEH-CM-002
  readonly timeout?: Duration.Input             // default 30 seconds (BEH-CM-013)
  readonly contract?: { readonly name: string; readonly version: string }  // when the command belongs to a Contract (core file 26)
  // A ready-made JSON Schema used instead of projection (04, BEH-CM-029); for commands whose codec
  // cannot describe itself, such as a tool imported from another protocol.
  readonly jsonSchema?: { readonly input: JsonSchema; readonly output: JsonSchema; readonly error?: JsonSchema }
  // Data some other party said about the command (for example an imported MCP tool's annotations).
  // Carried on the descriptor and digested; never read by the package (BEH-CM-002).
  readonly externalAnnotations?: Json
}

interface Command<I, O, E> {
  readonly _tag: "Command"
  readonly id: string
  readonly spec: CommandSpec<I, unknown, O, unknown, E, unknown>
}

declare const Command: {
  make<I, IE, O, OE, E = never, EE = never>(id: string, spec: CommandSpec<I, IE, O, OE, E, EE>): Command<I, O, E>
}
```

```
REQUIREMENT: `Command.make` MUST be pure: it MUST NOT register anything,
             resolve any service or read the time. Two calls with equal
             arguments MUST yield values with equal descriptors (BEH-CM-005).
```

```
REQUIREMENT: The id MUST match /^[a-z][a-z0-9-]*(\.[a-z0-9-]+)*$/ and be at
             most 64 characters long. Any other id MUST be rejected by
             `Command.make` as a defect.
```

```
REQUIREMENT: `tags` MUST be stored deduplicated and sorted by code unit;
             each tag MUST match /^[a-z][a-z0-9-]{0,31}$/, and an invalid tag
             MUST be rejected as a defect. `regulated` MUST default to false.
```

```
REQUIREMENT: When `contract` is present, it MUST name a contract and version
             as defined by core file 26; the catalog MUST carry them on the
             descriptor and MUST NOT check them against any installed
             contract. Version negotiation is core's and the contract
             package's concern.
```

The id grammar is chosen so that the id can be used unchanged as a tool name
by every protocol in view: MCP tool names allow letters, digits, `_`, `-` and
`.`, and a dotted lower-case id stays readable in logs and in an approval
screen. Tags are normalised so that a descriptor's digest does not depend on
the order a developer happened to write them in.

**Settled here.** (1) The default timeout is 30 seconds, as for core leases'
drains, because a dispatch with no bound would hold a contribution lease
without end. (2) `error` is optional; a handler with no `error` schema may
fail only with dispatch errors, and any other failure is reported as a defect.

**Open.** Whether a command may declare a stream output (progress events) is
open; the first version allows a single output only.

## BEH-CM-002: Tags and the regulated label are carried, not interpreted

> **See:** [ADR-CM-002](../decisions/002-catalog-not-rules.md)
> **Core seam:** [32 — Generic gate and plan](../../core/behaviors/32-generic-gate-and-plan.md)

```
REQUIREMENT: The package MUST carry `tags` and `regulated` verbatim on the
             command's descriptor, on every `CommandRequest` submitted to the
             gate (BEH-CM-011) and on every hook input (BEH-CM-012).
```

```
REQUIREMENT: Apart from the default toolset selector (BEH-CM-021), the
             package MUST NOT change behaviour on any tag or on `regulated`:
             dispatch order, timeouts, retries and error mapping MUST be the
             same for every command.
```

```
REQUIREMENT: The package MUST NOT export a list of regulated commands, a
             policy that decides what is regulated, or any rule that grants
             or refuses a command on its labels.
```

`regulated` is a label with one built-in consequence, deliberately
conservative: the default selector leaves regulated commands out of a toolset
unless the selector opts in. Everything else — whether a regulated command
needs a second approver, may be drafted by an agent, or may never be offered
to an agent at all — is the application's gate and selector
([ADR-CM-002](../decisions/002-catalog-not-rules.md)).

**Settled here.** The label is a boolean, not a level. A product with several
levels expresses them as tags (for example `class-a`), which its gate reads.

## BEH-CM-003: A handler is contributed for the lifetime of a scope

> **Invariant:** [INV-CM-001](../invariants.md#inv-cm-001-the-catalog-runs-a-handler-only-through-dispatch)
> **See:** [ADR-CM-001](../decisions/001-commands-are-contributions.md)
> **Core seam:** [19 — Contribution registry](../../core/behaviors/19-contribution-registry.md), [28 — Plugin principal and mandatory policy](../../core/behaviors/28-plugin-principal-and-mandatory-policy.md)

```ts
// illustrative — not type-checked
type Handler<I, O, E, R> = (input: I, context: HandlerContext) => Effect.Effect<O, E, R>

interface HandlerContext {
  readonly actor: Actor                         // the dispatch's resolved actor (core file 22)
  readonly onBehalfOf?: PrincipalRef            // the dispatching fiber's plugin principal (core file 28, BEH-BR-258), when it has one
  readonly correlationId: string
  readonly annotations: Annotations             // core file 30 (BEH-BR-289), read-only here
}

declare const Command: {
  contribute<I, O, E, R>(command: Command<I, O, E>, handler: Handler<I, O, E, R>):
    Effect.Effect<void, DuplicateContribution | CommandSchemaNotProjectable, Scope.Scope | CommandCatalog | R>
}
```

```
REQUIREMENT: `contribute` MUST add one entry to the catalog's private
             `ContributionRegistry` under the command's id, for the lifetime
             of the caller's `Scope`, with the rules of core BEH-BR-163 and
             BEH-BR-164: a second contribution under a registered id — or an
             id still being removed — MUST fail with `DuplicateContribution`
             and register nothing; the entry MUST be removed when the scope
             closes.
```

```
REQUIREMENT: `contribute` MUST project the command's schemas (04 — JSON
             Schema projection) before registering — or, when
             `spec.jsonSchema` is given, check the supplied documents
             instead (BEH-CM-029) — and MUST fail with
             `CommandSchemaNotProjectable` and register nothing when either
             side cannot be projected or a supplied document fails its
             checks.
```

```
REQUIREMENT: The handler's requirements `R` MUST be captured from the
             contributing fiber's context at `contribute`. A dispatch MUST
             run the handler with that captured context, not the
             dispatcher's, and MUST run it as a *served call* of core
             BEH-BR-292: inside `CallerContext.serve(ctx)`, where `ctx` is
             the dispatch's resolved actor and annotations (BEH-CM-010) —
             `CallerContext.current` read in the dispatching fiber, with
             the actor and annotations of `options.context` applied as
             BEH-CM-010 resolves them. The plugin principal MUST stay the
             captured one (the contributor's); the package MUST NOT set
             `CurrentActor` or `CurrentAnnotations` by any other means.
```

```
REQUIREMENT: When `contribute` is called inside a plugin activation, the
             owning plugin MUST be recorded on the descriptor (`owner`) as
             core reports contribution ownership (BEH-BR-163, BEH-BR-168),
             and the registry access rules of core file 28 MUST be applied
             to the contribution; a contribution they refuse MUST register
             nothing and MUST fail with the error core file 28 defines.
```

Capturing the handler's context at contribution is what lets the plugin that
owns the handler use its own services: the dispatcher — a UI adapter, an MCP
session, an agent loop — does not require the plugin's private keys and must
not be able to substitute them. Serving the call is what keeps the request's
identity: the captured context carries the reset actor and empty annotations
core gives every activation (BEH-BR-187, BEH-BR-292), so without
`CallerContext.serve` a nested dispatch or host call made by the handler would
be unattributed and untainted. With it, a nested call carries the invoker's
actor and taint, and its `onBehalfOf` is the contributor
([28 — Plugin principal and mandatory policy](../../core/behaviors/28-plugin-principal-and-mandatory-policy.md), BEH-BR-258). Because the entry is a registry contribution,
everything core says about removal applies: when the plugin stops, its
commands are hidden first, then drained (BEH-BR-167).

**Settled here.** (1) Contribution is refused, not deferred, when a schema
cannot be projected: a command that cannot be described cannot be offered,
and discovering that only when a toolset is built would make the failure
appear far from its cause. (2) Access rules — which plugins may contribute
commands at all, or under which id prefixes — are [core file 28](../../core/behaviors/28-plugin-principal-and-mandatory-policy.md)'s registry
rules, configured by the application; this package defines none.

## BEH-CM-004: The catalog exposes descriptors, never handlers

> **Invariant:** [INV-CM-001](../invariants.md#inv-cm-001-the-catalog-runs-a-handler-only-through-dispatch)
> **See:** [ADR-CM-001](../decisions/001-commands-are-contributions.md)
> **Core seam:** [19 — Contribution registry](../../core/behaviors/19-contribution-registry.md)
> **Risk:** [RSK-BR-013](../../core/gxp/03-risk-assessment.md#rsk-br-013)

```ts
// illustrative — not type-checked
interface CommandDescriptor {
  readonly id: string
  readonly title?: string
  readonly description?: string
  readonly tags: ReadonlyArray<string>
  readonly regulated: boolean
  readonly inputSchema: JsonSchema                    // 04, BEH-CM-025, or supplied (BEH-CM-029)
  readonly outputSchema: JsonSchema
  readonly errorSchema?: JsonSchema
  readonly contract?: { readonly name: string; readonly version: string }
  readonly owner?: { readonly pluginId: string; readonly realm: string }
  readonly externalAnnotations?: Json                 // carried as data, never interpreted
  readonly digest: string                             // BEH-CM-005
}

interface CatalogView { readonly revision: number; readonly entries: ReadonlyArray<CommandDescriptor> }

class CommandCatalog extends Context.Service<CommandCatalog, {
  readonly descriptors: Effect.Effect<CatalogView>
  readonly describe: (id: string) => Effect.Effect<Option.Option<CommandDescriptor>>
  readonly changes: Stream.Stream<CatalogView>
}>()("@bridger/command/CommandCatalog") {
  static layer(options?: CommandCatalogOptions): Layer.Layer<CommandCatalog>   // options: 02, BEH-CM-011
}
```

```
REQUIREMENT: `CommandCatalog` MUST be provided as a base service, so that
             every plugin and every dispatcher in the host resolves the same
             instance and the catalog outlives every contributor.
```

```
REQUIREMENT: The package's exported functions MUST NOT return a handler,
             the private registry, or a value from which a handler can be
             called. `descriptors`, `describe` and `changes` MUST return
             descriptors only.
```

```
REQUIREMENT: `CatalogView.entries` MUST be ordered by `id` (code-unit
             order), and `CatalogView.revision` MUST be the revision of the
             underlying registry view (core BEH-BR-165), so that it starts at
             0 and never regresses.
```

```
REQUIREMENT: `changes` MUST follow core BEH-BR-165: the current view first,
             no gap at registration, later views afterwards; a slow
             subscriber MAY skip intermediate revisions.
```

Hiding handlers is what makes "one dispatch path" more than a convention for
callers that only hold the catalog. It is not an isolation boundary: the
plugin that wrote the handler, and any in-process code it hands the function
to, can call it directly. The guarantee is narrower and stated as such in
[INV-CM-001](../invariants.md#inv-cm-001-the-catalog-runs-a-handler-only-through-dispatch).

**Settled here.** The catalog orders by id and ignores the registry's
`priority`: commands have no meaningful priority, and an order that depends
only on ids is the order a toolset and an MCP listing need (BEH-CM-020).

## BEH-CM-005: A descriptor digest identifies a definition

> **Invariant:** [INV-CM-004](../invariants.md#inv-cm-004-projection-and-digest-are-deterministic), [INV-CM-003](../invariants.md#inv-cm-003-a-pinned-tool-never-runs-a-different-definition)
> **See:** [ADR-CM-003](../decisions/003-toolset-is-a-generation.md), [ADR-CM-004](../decisions/004-json-schema-from-encoded-side.md)

```
REQUIREMENT: `CommandDescriptor.digest` MUST be "sha256:" followed by the
             lower-case hexadecimal SHA-256 of the RFC 8785 (JCS) canonical
             JSON of { id, title, description, tags, regulated, inputSchema,
             outputSchema, errorSchema, contract, externalAnnotations },
             absent members omitted. `owner` MUST NOT enter the digest.
```

```
REQUIREMENT: The digest MUST be computed once, at `contribute`, and MUST
             NOT change for the life of the contribution.
```

```
REQUIREMENT: The digest MUST NOT be described as a signature, an integrity
             protection or a proof of origin. It identifies what was
             described to a caller, nothing more.
```

The digest answers one question: is the command a caller is about to run the
one it was shown? A toolset pinned at the start of an agent turn carries the
digests it showed the model; dispatch compares them with the current entry and
refuses a changed definition (BEH-CM-019). Leaving `owner` out means a plugin
that is replaced by a new version with an identical command keeps the same
digest, which is the behaviour a caller expects.

**Settled here.** SHA-256 over JCS is fixed so that two implementations — the
TypeScript package and, later, a generated SDK — compute the same digest.

**Open.** Whether the digest should include the handler's plugin version
(`definition.version`, core BEH-BR-219) so that an approval is bound to code as
well as to the description is open; the first version binds to the
description only, and a gate that needs the plugin version reads
`CommandRequest.owner`.

---

_Next: [02 — Dispatch](./02-dispatch.md)_
