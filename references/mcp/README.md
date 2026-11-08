# Bridger MCP — Companion Specification

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-MC-00                                                |
> | Revision       | 0.3                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Companion Specification — Master Index                       |
> | Change History | 0.3 (2026-11-08): Seams aligned (`GenerationView`, `CallerContext`); ADR-MC-002 title (CCR-MC-002)<br>0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-MC-001)<br>0.1 (2026-11-08): Initial draft (CCR-MC-001)                 |

---

**implementation: absent**

This is the specification of `@bridger/mcp`, a companion package of
`@bridger/core` that connects a Bridger host to the Model Context Protocol
(MCP). It does three things:

1. **Serve** a command toolset of `@bridger/command` to MCP clients, with a
   deterministic `tools/list` order and list-changed notifications driven by
   the command catalog.
2. **Import** the tools of an external MCP server as command contributions,
   through a remote proxy plugin whose output is always marked untrusted.
3. **Serve the host itself** — `snapshot`, `inspect`, and a reconcile *plan* —
   as commands behind the command gate, with applying a plan kept as a
   separate, regulated command that also passes the host's `OperationGate`.

It is item 11 of the gap analysis of 2026-11-08 (roadmap step B6), together
with [`@bridger/command`](../command/README.md) and
[`@bridger/agent`](../agent/README.md).

## Status: prospective

Nothing described here is implemented. Every document is a `Draft`, every
decision is `Proposed`, and every source or test path is marked *Planned*.
The line `implementation: absent` above has the same meaning as in the core
README ([ADR-BR-036](../core/decisions/036-prospective-specification.md)):
while it says `absent`, no document here may be Effective and no decision
Accepted.

**This specification is not evidence that the package behaves as
described.** A requirement becomes evidence only when a test that exercises it
has run and passed ([ADR-BR-035](../core/decisions/035-evidence-from-executed-tests.md)).

## The honest-claims rule

The core's honest-claims rule applies unchanged ([core README](../core/README.md)).
In particular this package:

- does **not** authenticate MCP clients or servers; the transport adapter and
  the application do, and hand the package a principal
  ([BEH-MC-002](./behaviors/01-server.md#beh-mc-002-a-session-has-one-principal-supplied-by-the-application));
- does **not** isolate imported tools; an external MCP server runs in its own
  process by construction, and Bridger neither confines nor inspects it;
- does **not** make a tool's annotations, descriptions or output trustworthy;
  imported content is carried as data and every imported command is marked
  external, so that a consumer such as `@bridger/agent` taints what it reads
  ([ADR-MC-002](./decisions/002-imported-tools-are-tainted-remote-proxies.md));
- does **not** claim conformance to any MCP revision until a conformance
  suite has been run against an implementation.

## Reading order

| Step | Document | Purpose |
| ---- | -------- | ------- |
| 1 | [Overview](./overview.md) | Mission, package boundary, public API surface, worked example |
| 2 | [Behaviours](./behaviors/01-server.md) | What the package must do, as `BEH-MC` requirements |
| 3 | [Invariants](./invariants.md) | Properties that hold for every execution |
| 4 | [Decisions](./decisions/001-server-projects-a-toolset.md) | Why, as `ADR-MC` records |
| 5 | [Acceptance checks](./behaviors/05-required-acceptance-checks.md) | Required tests and their `REQ-MC` scenarios |

Read the [command companion](../command/README.md) first: this package has no
tool model of its own.

## Contents

### Behaviours

| # | File | Identifiers |
| - | ---- | ----------- |
| 01 | [Server](./behaviors/01-server.md) | BEH-MC-001–006 (block 001–008) |
| 02 | [List-changed notifications](./behaviors/02-list-changed.md) | BEH-MC-009–013 (block 009–016) |
| 03 | [Client import](./behaviors/03-client-import.md) | BEH-MC-017–022 (block 017–024) |
| 04 | [Host tools](./behaviors/04-host-tools.md) | BEH-MC-025–030 (block 025–032) |
| 05 | [Required acceptance checks](./behaviors/05-required-acceptance-checks.md) | BEH-MC-033 (block 033–040) |

Each file owns a block of eight identifiers; unused numbers at the end of a
block are reserved, not gaps (core [identifier scheme](../core/process/requirement-id-scheme.md) §3).

### Decisions

| ID | Decision |
| -- | -------- |
| [ADR-MC-001](./decisions/001-server-projects-a-toolset.md) | The MCP server projects a command toolset; it keeps no tool registry of its own |
| [ADR-MC-002](./decisions/002-imported-tools-are-tainted-remote-proxies.md) | Imported tools are remote proxies; they are always marked external and their annotations untrusted |
| [ADR-MC-003](./decisions/003-host-self-service-is-plan-first.md) | Host self-service is plan-first; applying a plan is a separate regulated command behind both gates |
| [ADR-MC-004](./decisions/004-target-mcp-2026-07-28.md) | Target the MCP 2026-07-28 revision; tasks are bridged by `@bridger/agent` |

## Identifier scheme

| Prefix | Meaning | Defined in |
| ------ | ------- | ---------- |
| `BEH-MC-NNN` | Functional behaviour requirement | `behaviors/NN-*.md` headings |
| `INV-MC-NNN` | Runtime invariant | `invariants.md` headings |
| `ADR-MC-NNN` | Architecture decision | `decisions/NNN-*.md` |
| `REQ-MC-NNN` | Acceptance scenario (planned) | `behaviors/05-required-acceptance-checks.md` |
| `CCR-MC-NNN` | Change control record | this README, Document history |

The allocation rules, Document Control rules and reference syntax are the
core's ([identifier scheme](../core/process/requirement-id-scheme.md)); the
infix is `MC`. Changes follow core [change control](../core/process/change-control.md).
Core identifiers (`BEH-BR`, `ADR-BR`, `INV-BR`, `RSK-BR`) are cited, never
redefined. Risks are kept in the core risk register; this package proposes
entries there rather than keeping its own.

## Core seams this package needs

| Seam | Core file | Defined by |
| ---- | --------- | ---------- |
| Contribution registry, `changes` stream | [19 — Contribution registry](../core/behaviors/19-contribution-registry.md) | existing |
| `GenerationView` and its `changes` feed (toolset per principal, held as a view) | [20 — Generation](../core/behaviors/20-generation.md) | existing; view and feed CCR-BR-022 |
| `inspect`, names and counts only | [13 — Observability and diagnostics](../core/behaviors/13-observability-and-diagnostics.md) | existing |
| `reconcile`, per-entry gate | [18 — Reconciliation and confluence](../core/behaviors/18-reconciliation-and-confluence.md) | existing |
| `OperationGate` | [25 — Operation gate](../core/behaviors/25-operation-gate.md) | existing |
| `CurrentPlugin`, `onBehalfOf` | [28 — Plugin principal and mandatory policy](../core/behaviors/28-plugin-principal-and-mandatory-policy.md) | CCR-BR-018 |
| `CallLog` port | [29 — Capability grants and call log](../core/behaviors/29-capability-grants-and-call-log.md) | CCR-BR-018 |
| Taint and provenance annotations; `CallerContext` (host tools run as served calls) | [30 — Operation context annotations](../core/behaviors/30-operation-context-annotations.md) | CCR-BR-018; `CallerContext` CCR-BR-022 |
| `Gate<Req>`, Defer, `Host.plan` and `reconcile` with `expect` | [32 — Generic gate and plan](../core/behaviors/32-generic-gate-and-plan.md) | CCR-BR-019 |
| Remote proxy plugin, `Transport` | [`@bridger/remote`](../remote/README.md) | RM companion |

## Document history

| CCR | Date | Change |
| --- | ---- | ------ |
| CCR-MC-001 | 2026-11-08 | Initial draft of the `@bridger/mcp` companion specification (gap analysis of 2026-11-08, item 11; roadmap step B6): server projecting a `@bridger/command` toolset with deterministic order and cursors bound to the toolset revision; list-changed notifications through `subscriptions/listen`; client import of external tools as remote proxy contributions with tainted output and untrusted annotations; host tools `snapshot`, `inspect`, `reconcile-plan` and the regulated `reconcile-apply`; ADR-MC-001–004; INV-MC-001–005; acceptance checks with REQ-MC-001–012.<br>**Impact (PROC-03 §3).** (1) Identifiers: BEH-MC-001–006, 009–013, 017–022, 025–030, 033; INV-MC-001–005; ADR-MC-001–004; REQ-MC-001–012 added; nothing amended or withdrawn. (2) Risk: new risks proposed for the core register (tool output used as instruction; host self-service used to change the plugin set without approval); none re-scored. (3) GxP impact: yes, indirectly — `reconcile-apply` is a route to host lifecycle operations, which remain gated and audited by core per entry (BEH-BR-158). (4) Revalidation: nothing released or qualified (implementation absent); none. (5) Compatibility: new package; no core public type, record field or `schemaVersion` changes. |
| CCR-MC-002 | 2026-11-08 | Resolutions of the agent review of 2026-11-08 (findings R5-06, R5-08, R5-09, R5-10, R5-11, R5-12, R5-14, R5-17, R5-18, R5-19, R5-20; MCP side of R5-02 and R5-13), aligned with core CCR-BR-022: `tools/call` pins the toolset per call and passes it to dispatch (BEH-MC-004); deferred direct calls are `isError` results with the draft id, no MCP task (BEH-MC-005); list-changed from the toolset view's `changes` feed (BEH-MC-010, BEH-MC-013); import uses supplied JSON Schema, a declared `ImportedToolError` and dispatch's timeout, and marks commands external instead of claiming tainted values (BEH-MC-017–021, INV-MC-003 renamed and narrowed); re-sync waits for the removal's drain (BEH-MC-012); `PlanStore`, `PlanUnknown` and served host calls (BEH-MC-025, 028, 029); `UnknownPlugin` and inspect iteration (BEH-MC-027); branded `Plugin` return types.<br>**Impact (PROC-03 §3).** (1) Identifiers: no new BEH/INV/ADR; INV-MC-003 heading and statement changed; BEH-MC-002–005, 010, 012, 013, 017–021, 025, 027–029 and 033 amended; nothing withdrawn. (2) Risk: INV-MC-003 claims less (descriptor mark only); no core score changed. (3) GxP impact: none beyond CCR-MC-001. (4) Revalidation: none (implementation absent). (5) Compatibility: `HostTools.plugin` options widened; `reconcile-apply` result becomes `{ report, proposedBy }`. |
