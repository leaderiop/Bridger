# ADR-CM-004: JSON Schema 2020-12 is projected from the encoded side

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-CM-ADR-004                                           |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.1 (2026-11-08): Initial draft (CCR-CM-001)                 |

---

## Context

Commands are described with Effect Schema. Models, MCP clients and form
generators read JSON Schema. A codec has two sides; some schemas have no JSON
Schema representation; and digests, fingerprints and list-changed decisions
need the projection to be byte-stable.

## Decision

- **Dialect 2020-12**, stated by `$schema` on every document; input and output
  roots are objects, as MCP requires (BEH-CM-025).
- **The encoded side** is projected — what crosses the wire. Inexpressible
  refinements are omitted and still checked by the decoder at dispatch;
  schemas with no representation are refused at contribution, naming the
  offending path (BEH-CM-026, BEH-CM-003).
- **Byte-stable**: canonical JSON (RFC 8785), path-derived `$defs` names, no
  timestamps or versions (BEH-CM-027). Labels stay on the descriptor, never
  in the schema (BEH-CM-028).

## Alternatives considered

- **Project the decoded (type) side.** Rejected: it describes values a caller
  never sends.
- **Accept unprojectable commands and leave them out of toolsets.** Rejected:
  the failure would surface far from its cause.
- **Earlier JSON Schema drafts.** Rejected: MCP and current tooling use
  2020-12.

## Consequences

**Positive**:

- One description per command, stable across processes and restarts.

**Negative**:

- Command authors must wrap scalar inputs in structs and avoid opaque types
  in command schemas.
- The projection depends on Effect Schema's generator, whose output may
  change across Effect versions; golden files catch that.

**Trade-off accepted**: a narrower set of describable commands, in exchange
for descriptions every consumer can rely on byte for byte.

## References

- Behaviours: [04 — JSON Schema projection](../behaviors/04-json-schema-projection.md), [01 — Command definition](../behaviors/01-command-definition.md)
- Invariants: [INV-CM-004](../invariants.md#inv-cm-004-projection-and-digest-are-deterministic)
- Core: [26 — Versioned contracts](../../core/behaviors/26-versioned-contracts.md)
- External: JSON Schema 2020-12; RFC 8785 (JSON Canonicalization Scheme); MCP specification 2026-07-28, tools.
