# 01 — Command Definition

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-CM-BEH-01                                            |
> | Revision       | 0.6                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.6 (2026-11-09): Specification audit of 2026-11-09 (ERP alignment) — `retryable`: tags of typed errors a retry may overturn, carried on the descriptor and digested, read only to keep them out of receipts (06, BEH-CM-041) (CCR-CM-004)<br>0.5 (2026-11-08): BEH-CM-006: the taint floor reads `readOnly` (exemption of declared reads, BEH-CM-016), and a batch reads `readOnly` and `long` (round-2 agent review A-05, A-09) (CCR-CM-003)<br>0.4 (2026-11-08): Id grammar admits mixed case and `_`, tag grammar `.` and `:`; typed metadata `permission`, `compensatedBy`, `costClass`, `readOnly`, `long` and `untrusted` output paths, all digested (BEH-CM-006); `HandlerContext` gains `idempotencyKey`, `enrichments` and `progress` (CCR-CM-003, round 2: recheck items 1, 2, 3, 7, 8)<br>0.3 (2026-11-08): Handler run as a served call with `CallerContext.serve`; `title`, `jsonSchema`, `externalAnnotations` on spec, descriptor and digest; `Annotations` type (CCR-CM-002)<br>0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-CM-001)<br>0.1 (2026-11-08): Initial draft (CCR-CM-001)                 |

---

A command is the unit of the catalog: a named, typed request that some plugin
knows how to carry out. This file specifies the command value, the labels it
carries, how a plugin contributes a handler for it, what the catalog exposes
and how a definition is identified. This file owns BEH-CM-001–008 and uses
BEH-CM-001–006; 007–008 are reserved.

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
  readonly jsonSchema?: { readonly input: JsonSchema; readonly output: JsonSchema; readonly error?: JsonSchema
                                readonly untrusted?: boolean }   // true: the whole output is untrusted (BEH-CM-030)
  // Data some other party said about the command (for example an imported MCP tool's annotations).
  // Carried on the descriptor and digested; never read by the package (BEH-CM-002).
  readonly externalAnnotations?: Json
  // Typed metadata (BEH-CM-006): carried and digested, read by the application's gate,
  // selectors and wrappers, never by dispatch except `long`.
  readonly permission?: string                  // e.g. "stock:write"; the application's vocabulary
  readonly compensatedBy?: string               // the id of the command that undoes this one (07, BEH-CM-050)
  readonly costClass?: string                   // e.g. "free", "metered"; the application's vocabulary
  readonly readOnly?: boolean                   // default false; the author's declaration, not enforced
  readonly long?: boolean                       // default false; true: run as a task (07, BEH-CM-052)
  // `_tag`s of typed errors a later attempt may not meet (a lock timeout, a conflict): never stored
  // in a receipt (06, BEH-CM-041); carried on the descriptor and digested (BEH-CM-006).
  readonly retryable?: ReadonlyArray<string>
}

interface Command<I, O, E, Long extends boolean = false> {   // Long: spec.long (07, BEH-CM-052)
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
REQUIREMENT: The id MUST match /^[A-Za-z][A-Za-z0-9_-]*(\.[A-Za-z0-9_-]+)*$/
             and be at most 64 characters long (for example
             `catalog.rename-item` or `smart-buy.generateBasket`). Any other
             id MUST be rejected by `Command.make` as a defect. Ids are
             compared by code unit; `contribute` MUST refuse, with
             `DuplicateContribution`, an id that equals a registered id
             when ASCII case is ignored.
```

```
REQUIREMENT: `tags` MUST be stored deduplicated and sorted by code unit;
             each tag MUST match /^[a-z][a-z0-9-]*([.:][a-z0-9-]+)*$/ and be
             at most 64 characters long (for example `write` or
             `stock:write`), and an invalid tag MUST be rejected as a
             defect. `regulated` MUST default to false.
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
`.`, and nothing else, which is why `:` is admitted in tags but not in ids.
Mixed case is admitted because existing command vocabularies use it
(`smart-buy.generateBasket`); refusing two ids that differ only in case keeps
an approval screen and a log from showing two commands a reader cannot tell
apart. Tags take `.` and `:` so that a vocabulary of the form
`resource:action` (`stock:write`) is a tag, and hook contributions can target
a tag prefix (02, BEH-CM-012). Tags are normalised so that a descriptor's digest does not depend on
the order a developer happened to write them in.

**Settled here.** (1) The default timeout is 30 seconds, as for core leases'
drains, because a dispatch with no bound would hold a contribution lease
without end. (2) `error` is optional; a handler with no `error` schema may
fail only with dispatch errors, and any other failure is reported as a defect.

**Open.** Whether a command may declare a stream output is open; the first
version allows a single output only. Progress of a long command is reported
on its task, not as output (07, BEH-CM-053).

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
  readonly correlationId: string                // also the fiber's CurrentCorrelation (core BEH-BR-187)
  readonly annotations: Annotations             // core file 30 (BEH-BR-289), read-only here
  readonly idempotencyKey?: string              // DispatchOptions.idempotencyKey (06, BEH-CM-041)
  // Values of the before-hooks' enrich phase, under each contributor's id, in view order
  // (02, BEH-CM-012; core BEH-BR-301); never merged into `input`.
  readonly enrichments: ReadonlyArray<{ readonly id: string; readonly value: unknown }>
  // Long commands only (07, BEH-CM-053); a no-op for other commands.
  readonly progress: (report: { readonly done?: number; readonly total?: number; readonly note?: string }) => Effect.Effect<void>
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
             the dispatch's resolved actor, annotations and `correlationId`
             (BEH-CM-010), so that the handler's fiber carries that
             correlation as core's `CurrentCorrelation` (BEH-BR-187) —
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
rules, configured by the application; this package defines none. (3) The
catalog's private registry is made without a contract (core BEH-BR-233): a
command handler is not an implementation of a versioned contract, so no
`implements` is stated and no `IncompatibleContract` can arise from it;
`spec.contract` is a label carried for the gate (BEH-CM-001).

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
  readonly permission?: string                        // BEH-CM-006
  readonly compensatedBy?: string                     // BEH-CM-006
  readonly costClass?: string                         // BEH-CM-006
  readonly readOnly: boolean                          // BEH-CM-006
  readonly long: boolean                              // BEH-CM-006
  readonly retryable: ReadonlyArray<string>           // BEH-CM-006; sorted
  readonly untrustedOutput: ReadonlyArray<string>     // output paths marked untrusted (04, BEH-CM-030); sorted
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
             outputSchema, errorSchema, contract, externalAnnotations,
             permission, compensatedBy, costClass, readOnly, long,
             retryable, untrustedOutput }, absent members omitted
             (`readOnly` and `long` present only when true, `retryable`
             and `untrustedOutput` only when non-empty). `owner` MUST NOT
             enter the digest.
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

## BEH-CM-006: Typed metadata is carried, digested and read by the application

> **Invariant:** [INV-CM-004](../invariants.md#inv-cm-004-projection-and-digest-are-deterministic)
> **See:** [ADR-CM-002](../decisions/002-catalog-not-rules.md), [ADR-CM-007](../decisions/007-batches-are-admitted-whole-and-undone-by-compensation.md)
> **Core seam:** [32 — Generic gate and plan](../../core/behaviors/32-generic-gate-and-plan.md), [31 — Hook points](../../core/behaviors/31-hook-points.md)

```ts
// illustrative — not type-checked
const AdjustStock = Command.make("stock.adjust", {
  input: AdjustInput, output: AdjustOutput,
  tags: ["stock", "stock:write"],
  permission: "stock:write",          // read by the application's gate
  compensatedBy: "stock.adjust-undo", // run by a batch rollback (07, BEH-CM-050)
  costClass: "free"
})
const SearchItems = Command.make("catalog.search", { input: SearchInput, output: SearchOutput, readOnly: true })
```

```
REQUIREMENT: `permission` and `costClass`, when present, MUST match the tag
             grammar of BEH-CM-001; `compensatedBy`, when present, MUST
             match the id grammar and MUST differ from the command's own
             id. Any other value MUST be rejected by `Command.make` as a
             defect. `readOnly` and `long` MUST default to false.
```

```
REQUIREMENT: `retryable`, when present, MUST hold unique strings of 1 to
             128 characters from U+0021 to U+007E, and MUST be empty when
             the spec has no `error` schema; `Command.make` MUST reject any
             other value as a defect. The package MUST carry it, sorted in
             code-unit order, on the descriptor (BEH-CM-004) and in the
             digest (BEH-CM-005), and MUST read it only to keep a listed
             typed error out of a receipt (06, BEH-CM-041). A listed tag
             that the `error` schema never produces matches nothing.
```

```
REQUIREMENT: The package MUST carry `permission`, `compensatedBy`,
             `costClass`, `readOnly` and `long` verbatim on the descriptor
             (BEH-CM-004), in the digest (BEH-CM-005), on every
             `CommandRequest` (02, BEH-CM-011) and in the target descriptor
             of the command hook points (02, BEH-CM-012).
```

```
REQUIREMENT: The package MUST NOT read `permission` or `costClass` to
             decide anything. It MUST read `readOnly` only for the taint
             floor's exemption (02, BEH-CM-016) and to skip the undo of a
             batch item that changed nothing (07, BEH-CM-050); it MUST read
             `compensatedBy` only to plan and run a batch's undo (07,
             BEH-CM-050), and `long` only to choose the task path (07,
             BEH-CM-052) and to refuse a long item in a batch (07,
             BEH-CM-049). `contribute`
             MUST NOT check that the command named by `compensatedBy`
             exists: it may be contributed later or by another plugin.
```

```
REQUIREMENT: The package MUST NOT describe `readOnly` as enforced. It is the
             command author's declaration that the handler changes no state;
             consumers that rely on it (the taint floor's exemption, an
             MCP `readOnlyHint`, an MCP resource, BEH-MC-007) MUST state
             that it is a declaration.
```

These five fields are the metadata every product with a command bus ends up
inventing as free tags, and then parsing: who may run the command, how it is
undone, what it costs, whether it reads only, whether it runs long. Typing
them makes them part of the definition — digested, so an approval given for
"stock:write" is stale for a definition that now says "stock:admin" — while
the rules that read them stay the application's
([ADR-CM-002](../decisions/002-catalog-not-rules.md)).

**Settled here.** (1) `permission` is one string, not a list: a command that
needs several permissions names a composite one, which the gate expands.
(2) `compensatedBy` names a command, not a function, so that it can be
digested, shown to an approver and dispatched through the same path as any
command. (3) `long` changes how dispatch delivers the outcome, never the
gate, hooks or taint floor (07, BEH-CM-052); it is the second built-in
consequence of a field, after `regulated` in the default selector.
(4) `readOnly` has one built-in consequence for safety: the taint floor
lets a declared read through on the gate's decision (02, BEH-CM-016).
Because that consequence rests on the declaration, a wrong declaration is a
defect of the command with a safety effect, and is reviewed as such.

**Open.** Whether `costClass` should be a structured value (a unit and an
amount) for the entitlement companion's budgets; v0.1 carries a label.

---

_Next: [02 — Dispatch](./02-dispatch.md)_
