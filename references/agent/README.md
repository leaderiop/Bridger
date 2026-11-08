# Bridger Agent — Companion Specification

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-AG-00                                                |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Companion Specification — Master Index                       |
> | Change History | 0.2 (2026-11-08): Register row for CCR-AG-002 (CCR-AG-002)<br>0.1 (2026-11-08): Initial draft (CCR-AG-001)                 |

---

**implementation: absent**

This is the specification of `@bridger/agent`, a companion package of
`@bridger/core`. It gives an application that runs language-model agents on a
Bridger host a small set of replaceable service keys (`ModelAdapter`,
`AgentLoop`, `SessionStore`, `MemoryStore`, `ToolRunner`), a task state feed
(`TaskSnapshot`, `Tasks.await`) with bridges to external observers, taint and
provenance carried in the operation context, subagents in ephemeral realms
with narrowed actors, and helpers for testing agents deterministically.

It sits on top of [`@bridger/command`](../command/README.md), which provides
the command catalog, dispatch and toolsets, and next to
[`@bridger/mcp`](../mcp/README.md), which exposes and imports tools over the
Model Context Protocol. Budgets are defined by the
[entitlement companion](../entitlement/README.md) and only consumed here.

## Status: prospective

Nothing described here is implemented. Every document is a `Draft`, every
decision is `Proposed`, and every source or test path is marked *Planned*. The
line `implementation: absent` above has the meaning it has in the
[core README](../core/README.md): while it says `absent`, no document here may
call itself Effective and no decision may call itself Accepted
([ADR-BR-036](../core/decisions/036-prospective-specification.md)).

This specification is not evidence that the package behaves as described. A
requirement becomes evidence only when a test that exercises it has run and
passed ([ADR-BR-035](../core/decisions/035-evidence-from-executed-tests.md)).

## The honest-claims rule

The [core rule](../core/README.md#the-honest-claims-rule) applies unchanged.
In particular this package makes **no** claim that an agent built with it is
safe, that its taint tracking catches every untrusted input, that a subagent's
realm isolates anything, or that the package is validated or compliant with
any regulation. Taint is a label the package propagates by the rules stated
here; it is only as complete as the sources the application declares
([03 — Taint and provenance](./behaviors/03-taint-and-provenance.md)). An
ephemeral realm is a resolution namespace, not a boundary
([ADR-BR-019](../core/decisions/019-realms-are-resolution-namespaces.md)).
Model output is never trusted by the package; every effect it causes passes
through command dispatch and its gate.

## What stays in the application

- Which commands an agent may see, and the rules that decide a regulated
  command (the application's toolset selector and gate; see
  [`@bridger/command`](../command/README.md)).
- Model choice, prompts, skills, and any model vendor adapter.
- Which inputs are untrusted beyond the defaults of BEH-AG-019, and how an
  approval is obtained from a person.
- Budget amounts and grace rules (the entitlement companion's ports, the
  application's numbers).
- Personal-data filtering before a model call.

## Reading order

| Step | Document | Purpose |
| ---- | -------- | ------- |
| 1 | [Overview](./overview.md) | Mission, package boundary, public API surface, worked example |
| 2 | [Behaviours](./behaviors/01-agent-seams.md) | What the package must do, as `BEH-AG` requirements |
| 3 | [Invariants](./invariants.md) | Properties that hold for every execution |
| 4 | [Decisions](./decisions/001-agent-is-swappable-keys.md) | Why, as `ADR-AG` records |

## Contents

### Behaviours

| # | File | Identifiers |
| - | ---- | ----------- |
| 01 | [Agent seams](./behaviors/01-agent-seams.md) | BEH-AG-001–008 |
| 02 | [Tasks](./behaviors/02-tasks.md) | BEH-AG-009–016 |
| 03 | [Taint and provenance](./behaviors/03-taint-and-provenance.md) | BEH-AG-017–024 |
| 04 | [Subagents](./behaviors/04-subagents.md) | BEH-AG-025–032 |
| 05 | [Agent testing](./behaviors/05-agent-testing.md) | BEH-AG-033–040 |
| 06 | [Required acceptance checks](./behaviors/06-required-acceptance-checks.md) | BEH-AG-041–048 |

Each file owns a block of eight identifiers; unused numbers at the end of a
block are reserved, not gaps, as in core
([identifier scheme](../core/process/requirement-id-scheme.md) §3).

### Decisions

| ADR | Title |
| --- | ----- |
| [ADR-AG-001](./decisions/001-agent-is-swappable-keys.md) | The agent is a set of replaceable keys, not a framework |
| [ADR-AG-002](./decisions/002-task-snapshot-is-a-state-feed.md) | `TaskSnapshot` is a state feed; bridges map, never extend |
| [ADR-AG-003](./decisions/003-taint-is-monotone-and-forbids-auto-allow.md) | Taint is monotone per session and forbids automatic allow |
| [ADR-AG-004](./decisions/004-subagent-is-ephemeral-realm-and-narrowed-actor.md) | A subagent is an ephemeral realm and a narrowed actor, never wider |
| [ADR-AG-005](./decisions/005-agent-tests-replay-deterministically.md) | Agent tests replay deterministically; no live model in the required suite |

## Identifier scheme

| Prefix | Meaning |
| ------ | ------- |
| `BEH-AG-NNN` | Functional behaviour requirement (blocks of eight per file) |
| `INV-AG-NNN` | Runtime invariant |
| `ADR-AG-NNN` | Architecture decision |
| `REQ-AG-NNN` | Acceptance scenario (planned), defined in [06](./behaviors/06-required-acceptance-checks.md) |
| `CCR-AG-NNN` | Change control record |

Document IDs: `BRIDGER-AG-00` (this file), `BRIDGER-AG-OVW`, `BRIDGER-AG-INV`,
`BRIDGER-AG-BEH-NN`, `BRIDGER-AG-ADR-NNN`. The rules of the
[core identifier scheme](../core/process/requirement-id-scheme.md) apply with
the infix `AG`; changes follow [core change control](../core/process/change-control.md).

## Document history

| CCR | Date | Change |
| --- | ---- | ------ |
| CCR-AG-001 | 2026-11-08 | Initial draft of the `@bridger/agent` companion specification (gap report item 12, roadmap step B6): agent service keys, task state feed and bridges, taint and provenance, subagents, agent testing helpers.<br>**Impact (PROC-03 §3).** (1) Identifiers: BEH-AG-001–006, 009–014, 017–022, 025–030, 033–038, 041; INV-AG-001–006; ADR-AG-001–005; REQ-AG-001–012 added; nothing withdrawn. (2) Risk: new risks proposed for the core register by the integration notes (taint bypass, subagent widening, task state misreported); no core score changed. (3) GxP impact: indirect — an agent's writes reach the host or the application only through command dispatch and its gate; no audit record or core behaviour changes. (4) Revalidation: nothing released or qualified (implementation absent); none. (5) Compatibility: new package, no existing public type changed; depends on core seams of files 28, 29, 30, 32 and 33 and on the entitlement companion's `Budget`. |
| CCR-AG-002 | 2026-11-08 | Resolutions of the agent review of 2026-11-08 (findings R5-01, R5-03, R5-05, R5-12, R5-13, R5-14, R5-15, R5-16, R5-21, R5-23; agent side of R5-04), aligned with core CCR-BR-022: the no-auto-allow rule now rests on the command catalog's taint floor (command BEH-CM-016) and `TaintGuard` is a draft source (`TaintGuard.drafts`), not a plugin installing a mandatory interception (BEH-AG-020, INV-AG-001, ADR-AG-003); approvals bound to digest and input digest; tainted sessions narrow tools only through `StartRequest.taintedSelector` (BEH-AG-022); `ResumeInput` defined (BEH-AG-003, BEH-AG-012); provenance entries `{ source, ref }` (BEH-AG-021); subagent parent relation through `Actor.narrow` and `SubagentParentUnattributed` (BEH-AG-026); MCP bridge exposes agent tasks only (BEH-AG-014); error classes declared; neutral example input.<br>**Impact (PROC-03 §3).** (1) Identifiers: none added or withdrawn; BEH-AG-003, 004, 005, 010–012, 014, 017, 020–022, 025–027, 035 and 041, INV-AG-001 and ADR-AG-003 amended. (2) Risk: the proposed "taint bypass" risk is now mitigated by a stated mechanism; no core score changed. (3) GxP impact: none beyond CCR-AG-001. (4) Revalidation: none (implementation absent). (5) Compatibility: `TaintGuard.plugin` removed in favour of `TaintGuard.drafts`; `MemoryEntry` gains `taint`. |
