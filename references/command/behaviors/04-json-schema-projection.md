# 04 — JSON Schema Projection

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-CM-BEH-04                                            |
> | Revision       | 0.3                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.3 (2026-11-08): BEH-CM-029 supplied JSON Schema replaces the projection (CCR-CM-002)<br>0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-CM-001)<br>0.1 (2026-11-08): Initial draft (CCR-CM-001)                 |

---

A command described with Effect Schema is typed for TypeScript callers. A
model, an MCP client or a form generator needs the same description as JSON
Schema. This file fixes the projection: which side of a codec is projected,
which dialect, what is refused and how the output is made byte-stable. This
file owns BEH-CM-025–032 and uses BEH-CM-025–029; 030–032 are reserved.

Planned source: `packages/command/src/JsonSchema.ts` *(Planned)*. The
generator is Effect Schema's own JSON Schema output (Effect v4 knowledge base,
item E22, in `docs/knowledge/EFFECT-V4.md`); this package fixes the options
and the checks around it.

## BEH-CM-025: Input and output are projected to JSON Schema 2020-12

> **Invariant:** [INV-CM-004](../invariants.md#inv-cm-004-projection-and-digest-are-deterministic)
> **See:** [ADR-CM-004](../decisions/004-json-schema-from-encoded-side.md)

```ts
// illustrative — not type-checked
type JsonSchema = { readonly [key: string]: Json }

declare const Command: {
  jsonSchema(command: Command<any, any, any>):
    Result.Result<{ readonly input: JsonSchema; readonly output: JsonSchema; readonly error?: JsonSchema },
                  CommandSchemaNotProjectable>
}

class CommandSchemaNotProjectable extends Schema.TaggedError<CommandSchemaNotProjectable>()(
  "CommandSchemaNotProjectable",
  { id: Schema.String, side: Schema.Literals(["input", "output", "error"]), reason: Schema.String }
) {}
// `Command.jsonSchema` returns the supplied documents of BEH-CM-029, after their checks, when
// `spec.jsonSchema` is given.
```

```
REQUIREMENT: Each projected document MUST be a JSON Schema of the 2020-12
             dialect and MUST carry "$schema":
             "https://json-schema.org/draft/2020-12/schema" at its root.
```

```
REQUIREMENT: The input and output documents MUST describe a JSON object at
             the root ("type": "object"). A command whose input or output
             does not encode to an object MUST fail projection with
             `reason` "root-not-object".
```

```
REQUIREMENT: `Command.jsonSchema` MUST be pure and total: it MUST return a
             result or a `CommandSchemaNotProjectable`, never throw.
```

The object root is required by the MCP tool definition for both
`inputSchema` and `outputSchema`, and it costs a command author nothing: a
command with one scalar argument wraps it in a struct, which also leaves room
to add an optional field later without breaking callers.

## BEH-CM-026: The encoded side is projected, and what cannot be described is refused

> **See:** [ADR-CM-004](../decisions/004-json-schema-from-encoded-side.md)
> **Core seam:** [26 — Versioned contracts](../../core/behaviors/26-versioned-contracts.md)

```
REQUIREMENT: The projection MUST describe the encoded side of each codec —
             the JSON a caller sends and receives — not the decoded type.
```

```
REQUIREMENT: A schema with no JSON Schema representation — a declared or
             opaque type, a function, a symbol, a bigint not encoded to a
             string or number, a transformation whose encoded side is not
             JSON — MUST fail projection with a `reason` that names the
             first offending path.
```

```
REQUIREMENT: Recursive schemas MUST be projected with "$defs" and "$ref";
             they MUST NOT be refused for being recursive.
```

```
REQUIREMENT: Refinements that JSON Schema can express (length, pattern,
             range, enum, const) MUST be projected; a refinement it cannot
             express MUST be omitted from the document, and the input MUST
             still be decoded with the full schema at dispatch step 2.
```

Projecting the encoded side is the only choice that describes what crosses
the wire: a `Date` decoded from an ISO string is a string to a model. Omitting
inexpressible refinements, rather than refusing the command, keeps the
document honest about what it describes — a JSON Schema is a description for
the caller; the decoder at dispatch remains the check.

**Settled here.** Unknown fields: a projected object schema states
"additionalProperties": false only when the Schema itself rejects excess
properties; otherwise it states nothing. This follows the add-only evolution
of [core file 26](../../core/behaviors/26-versioned-contracts.md), where decoders ignore unknown fields.

## BEH-CM-027: Projection is byte-stable

> **Invariant:** [INV-CM-004](../invariants.md#inv-cm-004-projection-and-digest-are-deterministic)
> **See:** [ADR-CM-004](../decisions/004-json-schema-from-encoded-side.md)

```
REQUIREMENT: Projecting the same schema twice, in any process, MUST yield
             documents whose RFC 8785 canonical JSON is identical.
```

```
REQUIREMENT: Names under "$defs" MUST be derived from the schema's
             `identifier` annotation when present and otherwise from the
             path of the first occurrence, never from a counter that
             depends on traversal timing or a global registry.
```

```
REQUIREMENT: The projection MUST NOT include timestamps, random values,
             source locations or the package version.
```

The digest of BEH-CM-005, the toolset fingerprint of BEH-CM-017 and the
list-changed decision of `@bridger/mcp` all rest on this property: if a
re-projection could differ, every restart would look like a toolset change.

## BEH-CM-028: Descriptions come from annotations, and labels stay out of the schema

> **See:** [ADR-CM-002](../decisions/002-catalog-not-rules.md), [ADR-CM-004](../decisions/004-json-schema-from-encoded-side.md)

```
REQUIREMENT: The Schema annotations `title`, `description`, `examples` and
             `default` MUST be projected as the JSON Schema keywords of the
             same name. Other annotations MUST NOT be projected.
```

```
REQUIREMENT: `tags`, `regulated`, `owner` and `contract` MUST appear on the
             descriptor only. They MUST NOT be written into the JSON Schema
             documents, not even as "x-" extension keywords.
```

```
REQUIREMENT: A `default` or `examples` annotation is shown to every caller
             of a toolset that contains the command. The package MUST NOT
             project an annotation from a schema field marked redacted
             (`Schema.Redacted` or an equivalent marker); such a field MUST
             be projected without `default` and `examples`.
```

Keeping labels out of the schema keeps the schema a description of data. An
MCP client renders the schema to a model; a `regulated` flag inside it would
be a hint to the model, which is not where a rule belongs, and MCP treats
everything a server says about a tool as untrusted by the client anyway.

**Open.** Whether descriptions should be localisable (a `description` per
language) is open; the first version projects one description.

## BEH-CM-029: A supplied JSON Schema replaces the projection, under the same checks

> **Invariant:** [INV-CM-004](../invariants.md#inv-cm-004-projection-and-digest-are-deterministic)
> **See:** [ADR-CM-004](../decisions/004-json-schema-from-encoded-side.md)

```
REQUIREMENT: When `CommandSpec.jsonSchema` is given (BEH-CM-001), the
             package MUST use its documents as the descriptor's
             `inputSchema`, `outputSchema` and `errorSchema` instead of
             projecting the codecs, and MUST digest them as it digests
             projected documents (BEH-CM-005, canonical JSON under
             RFC 8785).
```

```
REQUIREMENT: A supplied document MUST pass these checks, and a failing one
             MUST fail `contribute` with `CommandSchemaNotProjectable`
             naming the side and the `reason`: it MUST be a JSON object;
             its `$schema`, when present, MUST be
             "https://json-schema.org/draft/2020-12/schema" (otherwise
             `reason` "dialect"), and when absent the package MUST add that
             value; the input and output documents MUST describe an object
             at the root (`reason` "root-not-object"); and it MUST NOT
             contain the descriptor-only labels of BEH-CM-028 as "x-"
             keywords (`reason` "label-in-schema").
```

```
REQUIREMENT: A supplied document describes; it does not check. The
             command's codecs MUST still decode the input at dispatch step 2
             and encode the output at step 7, and the author of a command
             with supplied documents MUST make the codecs enforce what the
             documents say (for example a codec refined by a validator
             compiled from the same document).
```

Some commands cannot describe themselves through Effect Schema: a tool
imported from another protocol arrives with a JSON Schema and no codec, and
the codec built for it (`Schema.Json` refined by a validator) projects to
nothing useful. Supplying the document keeps the descriptor honest about
what the caller must send, while the same checks as for a projection keep
every descriptor a 2020-12 document with an object root.

**Settled here.** (1) A document in another dialect is refused, not
converted: a conversion the package invented would be a description nobody
wrote. A consumer that imports such schemas converts them itself or excludes
the command (`@bridger/mcp`, [client import](../../mcp/behaviors/03-client-import.md)).
(2) The supplied documents enter the digest exactly as projected ones do, so
a change to them is a new definition (BEH-CM-019).

---

_Previous: [03 — Toolsets](./03-toolsets.md)_ · _Next: [05 — Required acceptance checks](./05-required-acceptance-checks.md)_
