# Bridger MCP — Companion Specification

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-MC-00                                                |
> | Revision       | 0.6                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Companion Specification — Master Index                       |
> | Change History | 0.6 (2026-11-09): CCR-MC-004 registered: import as a remote link, lost-session outcomes, identity by `disclose`; honest-claims bullet on identity; seams to core 14/28 and remote; CCR-MC-004 row extended for core CCR-BR-033 (disclosed claims in the call log, local contracts); CCR-MC-004 row: resolutions of the independent review (reconnect rule, `McpClientStatus`, ADR-MC-002, BEH-MC-033) (CCR-MC-004)<br>0.5 (2026-11-08): CCR-MC-003 extended with the resolutions of the round-2 agent review (A-05, A-06, A-07, A-17, A-18) (CCR-MC-003)<br>0.4 (2026-11-08): ADR-MC-005, resources and inbound taint listed; seams aligned with core round 2 (`CurrentCorrelation`, `offerCallEntry`, atomic reconcile) (CCR-MC-003, round 2: recheck items 1, 6–9; X7, X8)<br>0.3 (2026-11-08): Seams aligned (`GenerationView`, `CallerContext`); ADR-MC-002 title (CCR-MC-002)<br>0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-MC-001)<br>0.1 (2026-11-08): Initial draft (CCR-MC-001)                 |

---

**implementation: absent**

This is the specification of `@bridger/mcp`, a companion package of
`@bridger/core` that connects a Bridger host to the Model Context Protocol
(MCP). It does three things:

1. **Serve** a command toolset of `@bridger/command` to MCP clients, with a
   deterministic `tools/list` order, list-changed notifications driven by
   the command catalog, calls pinned to the definition each session listed,
   read-only commands as resources, and inbound sessions tainted unless the
   application trusts them.
2. **Import** the tools of an external MCP server as command contributions,
   through a remote link — the session runs in the background, the commands
   live on a session child — whose output is always marked untrusted.
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
- does **not** send the caller's identity to an imported server unless the
  import's `disclose` option lists it; with it, the server becomes a
  processor of what it receives, and that is the application's decision
  ([BEH-MC-022](./behaviors/03-client-import.md#beh-mc-022-the-proxy-forwards-no-identity-unless-the-import-discloses-it-and-never-annotations));
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
| 01 | [Server](./behaviors/01-server.md) | BEH-MC-001–007 (block 001–008) |
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
| [ADR-MC-005](./decisions/005-inbound-sessions-are-tainted-and-calls-pinned-to-the-listed-digest.md) | Inbound sessions are tainted by default, and calls are pinned to the listed digest |

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
| `reconcile`, per-entry gate, providers-first order | [18 — Reconciliation and confluence](../core/behaviors/18-reconciliation-and-confluence.md) | existing; order CCR-BR-025 |
| `CurrentCorrelation` (host tools' calls carry the dispatch's correlation) | [22 — Attributable operations](../core/behaviors/22-attributable-operations.md) | CCR-BR-026 |
| `OperationGate` | [25 — Operation gate](../core/behaviors/25-operation-gate.md) | existing |
| `CurrentPlugin`, `onBehalfOf` | [28 — Plugin principal and mandatory policy](../core/behaviors/28-plugin-principal-and-mandatory-policy.md) | CCR-BR-018 |
| `CallLog` port, `Host.offerCallEntry` (imported calls as outbound crossings) | [29 — Capability grants and call log](../core/behaviors/29-capability-grants-and-call-log.md) | CCR-BR-018; `offerCallEntry` CCR-BR-026 |
| Taint and provenance annotations; `CallerContext` (host tools run as served calls) | [30 — Operation context annotations](../core/behaviors/30-operation-context-annotations.md) | CCR-BR-018; `CallerContext` CCR-BR-022 |
| `Gate<Req>`, Defer, `Host.plan` and `reconcile` with `expect`, `atomic`, `ApplyRolledBack`, `PartialApply`, undo requests | [32 — Generic gate and plan](../core/behaviors/32-generic-gate-and-plan.md) | CCR-BR-019; atomic apply CCR-BR-025 |
| Session children, `allowChildren`, `ChildNotAllowed` (an import's session child) | [14 — Children and groups](../core/behaviors/14-children-and-groups.md), [28 — Plugin principal and mandatory policy](../core/behaviors/28-plugin-principal-and-mandatory-policy.md) (BEH-BR-263) | existing |
| Link lifecycle, session child, `SessionLost` outcomes, `RemoteUnavailable`, `disclose`, `Transport` | [`@bridger/remote`](../remote/README.md) (BEH-RM-001–003, 013, 020, 021, 024) | RM companion; CCR-RM-004 |

## Document history

| CCR | Date | Change |
| --- | ---- | ------ |
| CCR-MC-001 | 2026-11-08 | Initial draft of the `@bridger/mcp` companion specification (gap analysis of 2026-11-08, item 11; roadmap step B6): server projecting a `@bridger/command` toolset with deterministic order and cursors bound to the toolset revision; list-changed notifications through `subscriptions/listen`; client import of external tools as remote proxy contributions with tainted output and untrusted annotations; host tools `snapshot`, `inspect`, `reconcile-plan` and the regulated `reconcile-apply`; ADR-MC-001–004; INV-MC-001–005; acceptance checks with REQ-MC-001–012.<br>**Impact (PROC-03 §3).** (1) Identifiers: BEH-MC-001–006, 009–013, 017–022, 025–030, 033; INV-MC-001–005; ADR-MC-001–004; REQ-MC-001–012 added; nothing amended or withdrawn. (2) Risk: new risks proposed for the core register (tool output used as instruction; host self-service used to change the plugin set without approval); none re-scored. (3) GxP impact: yes, indirectly — `reconcile-apply` is a route to host lifecycle operations, which remain gated and audited by core per entry (BEH-BR-158). (4) Revalidation: nothing released or qualified (implementation absent); none. (5) Compatibility: new package; no core public type, record field or `schemaVersion` changes. |
| CCR-MC-002 | 2026-11-08 | Resolutions of the agent review of 2026-11-08 (findings R5-06, R5-08, R5-09, R5-10, R5-11, R5-12, R5-14, R5-17, R5-18, R5-19, R5-20; MCP side of R5-02 and R5-13), aligned with core CCR-BR-022: `tools/call` pins the toolset per call and passes it to dispatch (BEH-MC-004); deferred direct calls are `isError` results with the draft id, no MCP task (BEH-MC-005); list-changed from the toolset view's `changes` feed (BEH-MC-010, BEH-MC-013); import uses supplied JSON Schema, a declared `ImportedToolError` and dispatch's timeout, and marks commands external instead of claiming tainted values (BEH-MC-017–021, INV-MC-003 renamed and narrowed); re-sync waits for the removal's drain (BEH-MC-012); `PlanStore`, `PlanUnknown` and served host calls (BEH-MC-025, 028, 029); `UnknownPlugin` and inspect iteration (BEH-MC-027); branded `Plugin` return types.<br>**Impact (PROC-03 §3).** (1) Identifiers: no new BEH/INV/ADR; INV-MC-003 heading and statement changed; BEH-MC-002–005, 010, 012, 013, 017–021, 025, 027–029 and 033 amended; nothing withdrawn. (2) Risk: INV-MC-003 claims less (descriptor mark only); no core score changed. (3) GxP impact: none beyond CCR-MC-001. (4) Revalidation: none (implementation absent). (5) Compatibility: `HostTools.plugin` options widened; `reconcile-apply` result becomes `{ report, proposedBy }`. |
| CCR-MC-003 | 2026-11-08 | Round 2: recheck items 1, 6, 7, 8 and 9 (MCP side) and contradictions X7 and X8 (Bridger recheck of 2026-11-08), aligned with core round 2 (CCR-BR-024–026) and command CCR-CM-003. Closed: (6) inbound sessions tainted by default with "mcp-inbound:<server id>", exempted only by the resolver's `trusted` (BEH-MC-002; X8); a per-session listing record whose digests reach dispatch as `expectDigest`, `ToolChanged` and "unlisted-tool" (BEH-MC-003, BEH-MC-004; X7); (9) resources as projections of read-only commands, `readOnlyHint` from the descriptor (BEH-MC-007, BEH-MC-003, BEH-MC-006); (1) `_meta["bridger/idempotency-key"]` to dispatch, `IdempotencyConflict` mapped; (7) long commands awaited or bridged as MCP tasks; (8) imported commands declare their whole output untrusted. Also: new dispatch outcomes mapped (`CommandBreakerOpen`, `CommandWrapperFailed`, `CommandDraftStale`); host tools leave correlation to core's `CurrentCorrelation`, take `atomic`, report `ApplyRolledBack`/`PartialApply` and refused digests; imported calls offered as outbound "crossing" call-log entries. Extended by the round-2 agent review (findings A-05, A-06, A-07, A-17, A-18): what a default (tainted) session can do is stated — declared reads and resources on the gate's decision, through the command catalog's read-only exemption (command BEH-CM-016), every other call a draft or refusal the client never applies (BEH-MC-002, BEH-MC-007, ADR-MC-005, INV-MC-006; A-05); BEH-MC-005 Settled (2) no longer contradicts BEH-MC-004 — a deferred call never becomes an MCP task, a command task does (A-06); item 8 closed at the server edge — the `content` text of results and resource reads is `Command.envelope` capped by `maxResultBytes`, `structuredContent` capped by `maxStructuredBytes` (A-07); a long command awaited with `timeout: "forever"` (A-17); `reconcile-plan` no longer declared `readOnly` (A-18). Amended: BEH-MC-002, 004, 005, 007, 025 (table), 030, REQ-MC-004, 005, 011, 014, INV-MC-006, 007, ADR-MC-005; no identifier added. Compatibility: Draft-level — `McpServerOptions` gains `maxResultBytes`, `maxStructuredBytes`; the `content` text of a success is the envelope, not the raw JSON; `reconcile-plan` loses `readOnlyHint`.<br>**Impact (PROC-03 §3).** (1) Identifiers: BEH-MC-007, INV-MC-006, INV-MC-007, ADR-MC-005, REQ-MC-013, REQ-MC-014 added; BEH-MC-002–006, 020, 022, 025, 026, 028–030, 033, INV-MC-005 and ADR-MC-004 amended; nothing withdrawn. (2) Risk: no core score changed; the proposed core risk "tool output used as instruction" gains the inbound-taint control (integration notes). (3) GxP impact: indirect — imported calls now reach the core `CallLog` as offered crossing entries; no audit record changes. (4) Revalidation: none (implementation absent). (5) Compatibility: Draft-level — `McpSessionPrincipal.resolve` gains `trusted`; a call for an unlisted name is now refused; `McpClient.import` requires `Bridger.Host`; `McpServerOptions` gains `resources`; `ReconcileInput` gains `atomic`. |
| CCR-MC-004 | 2026-11-09 | Resolutions of the specification audit of 2026-11-09 for the MCP import (findings C-03, C-04; MCP side of F-07), aligned with remote CCR-RM-004. This is an agent review, not the independent review of PROC-03 §5. C-03: `McpClient.import` is a remote link — its build opens nothing, the session (connect, `initialize`, first `tools/list`) runs in the background on a `reconnect` schedule bounded by `handshakeTimeout`, each established session mounts one session child carrying the imported commands, a lost session withdraws them, a failed handshake is reported and retried and never fails the build, a refused child mount ends the session as remote BEH-RM-002 states (BEH-MC-017); re-sync acts on the current session child (BEH-MC-012); `owner` is the session child (BEH-MC-020, INV-MC-003). C-04: calls in flight on a lost session fail with `SessionLost` under remote's outcome rule, calls after it with `RemoteUnavailable` (BEH-MC-018). F-07: the undefined `ImportMapping` `_meta` projection is replaced by the import option `disclose` (actor, onBehalfOf, correlationId; default none), sent in `_meta` under "bridger/claims" and recorded as remote records a disclosing link (BEH-MC-022). ADR-MC-002 restated with two rejected alternatives; checks 8–10 amended. Follow-ups of core CCR-BR-033: an import's call-log entry now names in `crossing.disclosed` the claims sent with the call, never their values, with no condition left (BEH-MC-022); BEH-MC-001 states that no entry point accepts a service contract object, so a local contract (core `Contract.local`, BEH-BR-225, 232) never crosses through this package — the server projects commands from their own schemas and an import contributes commands — and that exposing such a service takes a command written for it. A refusal error was considered and rejected: there is no point at which this package is given a contract to refuse. Acceptance check 15 added. **Independent review of these changes.** Confirmed and fixed: BEH-MC-017 said the import reconnects after every session end, against its own refused-mount rule and remote BEH-RM-013 — it now reconnects except when stopping or after a refused mount; it reported to remote's `RemoteStatus`, which lists only `Remote.define` links and has no seam for another package — the import now has its own `McpClientStatus`, a base service of the new `McpClient.layer`, chosen over a registration seam in remote because an import's session has its own stages (connect, `initialize`, `tools/list`) and remote's status fields (`version`, `withdrawals`, `revoked`) do not describe it (BEH-MC-017, BEH-MC-022, check 9); ADR-MC-002 named the proxy as `owner`, now the session child; this row omitted BEH-MC-033, whose checks 8–10 and 15 changed.<br>**Impact (PROC-03 §3).** (1) Identifiers: REQ-MC-015 added; no new BEH, INV or ADR; BEH-MC-001, 012, 017, 018, 020, 022 and 033 (checks 8–10, 15) amended (017 and 022 headings changed); INV-MC-003 statement changed (`owner`); ADR-MC-002 amended; REQ-MC-008–010 amended; nothing withdrawn. (2) Risk: an unreachable server no longer leaves a sticky failure; in-flight outcomes no longer overstate "not executed"; identity sent only on a recorded decision (remote RSK-RM-016); no core score changed. (3) GxP impact: none beyond CCR-MC-001; disclosure to a server is a data transfer the application decides and documents. (4) Revalidation: none (implementation absent). (5) Compatibility: `McpClient.import` options widened (`reconnect`, `handshakeTimeout`, `disclose`); new `McpClient.layer` and `McpClientStatus`; the plugin becomes `active` before its commands exist, and a dependent that expected the commands at activation must wait on the catalog; failure of `initialize` is no longer a build failure. |
