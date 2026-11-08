# Bridger Command — Companion Specification

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-CM-00                                                |
> | Revision       | 0.3                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Companion Specification — Master Index                       |
> | Change History | 0.3 (2026-11-08): Contents, seams and open questions aligned with the resolutions of the agent review; ADR-CM-005 listed (CCR-CM-002)<br>0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-CM-001)<br>0.1 (2026-11-08): Initial draft (CCR-CM-001)                 |

---

**implementation: absent**

This is the specification of `@bridger/command`, a companion package of
[`@bridger/core`](../core/README.md). It gives a host a **command catalog**:
typed commands, described with Effect Schema, contributed to a registry by
plugins, dispatched through one path that consults the gate and the hook
points of core, and projected into **toolsets** — ordered, per-principal,
atomically published lists of commands with JSON Schema 2020-12 descriptions
that an agent loop, an MCP server or a UI can offer.

The package provides the catalog, not the rules. What a command means, which
commands a given product treats as regulated, who may run them and whether a
draft needs a second person are decided by the application, through the gate
it wires and the selectors it passes. Bridger carries the labels and enforces
only that every dispatch passes the gate.

## Status: prospective

Nothing described here is implemented. Every document is a `Draft`, every
decision is `Proposed`, and every source or test path is marked *Planned*.
The line `implementation: absent` above has the meaning it has in core
([ADR-BR-036](../core/decisions/036-prospective-specification.md)): while it
says `absent`, no document here may call itself Effective and no decision may
call itself Accepted.

**This specification is not evidence that the package behaves as described.**
A requirement becomes evidence only when a test that exercises it has run and
passed ([ADR-BR-035](../core/decisions/035-evidence-from-executed-tests.md)).

## The honest-claims rule

The rule of the core specification applies unchanged
([core README](../core/README.md#the-honest-claims-rule)). In particular this
package makes **no** claim that a toolset is an authorization: a command that
is offered can still be refused by the gate, and a command that is not offered
is not thereby unreachable to in-process code that holds its handler. Plugins
in one process are trusted code
([ADR-BR-019](../core/decisions/019-realms-are-resolution-namespaces.md));
nothing here is an isolation boundary.

## Reading order

| Step | Document | Purpose |
| ---- | -------- | ------- |
| 1 | [Overview](./overview.md) | Mission, package boundary, public API surface, worked example |
| 2 | [Behaviours](./behaviors/01-command-definition.md) | What the package must do, as `BEH-CM` requirements |
| 3 | [Invariants](./invariants.md) | Properties that hold for every execution |
| 4 | [Decisions](./decisions/001-commands-are-contributions.md) | Why, as `ADR-CM` records |
| 5 | [Acceptance checks](./behaviors/05-required-acceptance-checks.md) | Required tests and their `REQ-CM` scenarios |

Readers should know core files 16, 19, 20, 22 and 25 first, and the core
seams this package depends on (below).

## Contents

### Behaviours

| # | File | Identifiers |
| - | ---- | ----------- |
| 01 | [Command definition](./behaviors/01-command-definition.md) | BEH-CM-001–005 |
| 02 | [Dispatch](./behaviors/02-dispatch.md) | BEH-CM-009–016 |
| 03 | [Toolsets](./behaviors/03-toolsets.md) | BEH-CM-017–022 |
| 04 | [JSON Schema projection](./behaviors/04-json-schema-projection.md) | BEH-CM-025–029 |
| 05 | [Required acceptance checks](./behaviors/05-required-acceptance-checks.md) | BEH-CM-033 |

Each file owns a block of eight identifiers; unused numbers at the end of a
block are reserved, not gaps (core
[identifier scheme](../core/process/requirement-id-scheme.md) §3).

### Decisions

| ADR | Title |
| --- | ----- |
| [ADR-CM-001](./decisions/001-commands-are-contributions.md) | Commands are registry contributions, not a core primitive |
| [ADR-CM-002](./decisions/002-catalog-not-rules.md) | The catalog carries labels; the application owns the rules |
| [ADR-CM-003](./decisions/003-toolset-is-a-generation.md) | A toolset is a generation per principal, pinned per turn |
| [ADR-CM-004](./decisions/004-json-schema-from-encoded-side.md) | JSON Schema 2020-12 is projected from the encoded side |
| [ADR-CM-005](./decisions/005-taint-floor-in-dispatch.md) | The taint floor is part of dispatch, not an interception |

## Core seams this package needs

| Seam | Core file | Defined by |
| ---- | --------- | ---------- |
| `ContributionRegistry` | [19 — Contribution registry](../core/behaviors/19-contribution-registry.md) | existing |
| `Generation`, `GenerationView`, `changes` | [20 — Generation](../core/behaviors/20-generation.md) | existing; view and feed CCR-BR-022 |
| `Actor`, `OperationContext` | [22 — Attributable operations](../core/behaviors/22-attributable-operations.md) | existing |
| `OperationGate` (as model) | [25 — Operation gate](../core/behaviors/25-operation-gate.md) | existing |
| `Contract.make`, versions | [26 — Versioned contracts](../core/behaviors/26-versioned-contracts.md) | CCR-BR-017 |
| `CurrentPlugin`, `onBehalfOf`, registry access rules (mandatory interceptions do not reach the gate, BEH-CM-011) | [28 — Plugin principal and mandatory policy](../core/behaviors/28-plugin-principal-and-mandatory-policy.md) | CCR-BR-018 |
| `CapabilityPolicy`, `CallLog` | [29 — Capability grants and call log](../core/behaviors/29-capability-grants-and-call-log.md) | CCR-BR-018 |
| Annotation bag on `OperationContext`; `CallerContext` for served calls | [30 — Operation context annotations](../core/behaviors/30-operation-context-annotations.md) | CCR-BR-018; `CallerContext` CCR-BR-022 |
| `HookPoint` | [31 — Hook points](../core/behaviors/31-hook-points.md) | CCR-BR-019 |
| `Gate<Req>` with Allow / Refuse / Defer, drafts | [32 — Generic gate and plan](../core/behaviors/32-generic-gate-and-plan.md) | CCR-BR-019 |

Where a seam's final signature differs from what a behaviour here assumes,
the core file wins and the behaviour here is amended under change control.

## Open questions

- **Correlation of host calls made by a handler.** A nested dispatch inherits
  the outer correlation id through the package's `DispatchCorrelation`
  reference (BEH-CM-009), but core keeps no correlation id in the fiber, so a
  host call made by a handler carries it only when the handler passes it in
  `options.context` (core gap G58, open).

## Identifier scheme

| Prefix | Meaning |
| ------ | ------- |
| `BEH-CM-NNN` | Functional behaviour requirement |
| `INV-CM-NNN` | Runtime invariant |
| `ADR-CM-NNN` | Architecture decision |
| `REQ-CM-NNN` | Acceptance scenario (planned) |
| `CCR-CM-NNN` | Change control record |

The rules of the core [identifier scheme](../core/process/requirement-id-scheme.md)
apply with the infix `CM`. Changes follow core
[change control](../core/process/change-control.md).

## Document history

| CCR | Date | Change |
| --- | ---- | ------ |
| CCR-CM-001 | 2026-11-08 | Initial draft of the `@bridger/command` companion specification (gap analysis of 2026-11-08, item 11; roadmap step B6): command definition, dispatch through the gate and hook points, toolsets per principal published as generations and pinned per turn, JSON Schema 2020-12 projection, deterministic order.<br>**Impact (PROC-03 §3).** (1) Identifiers: BEH-CM-001–005, 009–015, 017–022, 025–028 and 033; INV-CM-001–005; ADR-CM-001–004; REQ-CM-001–012 added; nothing withdrawn. (2) Risk: no core risk re-scored; new risks proposed to core (toolset taken for authorization; dispatch path bypassed by a held handler) in the integration notes. (3) GxP impact: yes, indirectly — dispatch reports to the core `CallLog` port and consults a gate, so a regulated user may rely on it for attribution of command executions once implemented and tested; no core audit record changes. (4) Revalidation: nothing released or qualified (implementation absent); none. (5) Compatibility: new package; no core public type changes beyond the seams named above, which are registered by their own core CCRs. |
| CCR-CM-002 | 2026-11-08 | Resolutions of the agent review of 2026-11-08 (findings R5-01, R5-02, R5-03, R5-04, R5-06, R5-07, R5-09, R5-14, R5-18, R5-22; command side of R5-05, R5-08, R5-10, R5-13), aligned with core CCR-BR-022: taint floor in dispatch (BEH-CM-016, ADR-CM-005, INV-CM-006) with application gate wrappers and a draft source, replacing reliance on mandatory interceptions; handlers run as served calls with `CallerContext.serve` (BEH-CM-003) and nested dispatches inherit the correlation id; `ApprovalRef.inputDigest` and `ApprovalMismatch`; `Toolsets.forPrincipal` returns a `GenerationView` whose `changes` feed followers read; supplied JSON Schema (BEH-CM-029); `title` and `externalAnnotations` on descriptors and digests; `Annotations` type; core `TestHost.scriptedGateOf` in the checks.<br>**Impact (PROC-03 §3).** (1) Identifiers: BEH-CM-016, BEH-CM-029, INV-CM-006, ADR-CM-005, REQ-CM-013 added; BEH-CM-001, 003, 005, 009–011, 014, 018, 019, 022 and 033 amended; nothing withdrawn. (2) Risk: closes the gap behind the proposed "taint bypass" risk for dispatch; no core score changed. (3) GxP impact: indirect — the floor withholds automatic approval for tainted requests; no audit record changes. (4) Revalidation: none (implementation absent). (5) Compatibility: `CommandCatalog.layer` options widened; `ApprovalRef` gains a required field; `forPrincipal` returns a narrower type (the view). |
