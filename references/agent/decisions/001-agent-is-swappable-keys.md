# ADR-AG-001: The agent is a set of replaceable keys, not a framework

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-AG-ADR-001                                           |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.2 (2026-11-11): Decision names the one exception to "no private path": the loop's `spawnSubagent` call for the reserved spawn tool, no command, its host mutations gated under the parent's actor (SPEC-AUDIT-08 PL3) (CCR-AG-011)<br>0.1 (2026-11-08): Initial draft (CCR-AG-001)                 |

---

## Context

Agent harnesses built on plugin runtimes (DeepSeek Harness on Cordis is the
example the gap analysis cites) make every part of the loop — model, loop
policy, memory, tool execution — a replaceable seam. Applications differ on
each part: model vendors, where sessions are kept, how a turn is shaped.
A Bridger agent framework would pick one answer for all of them.

## Decision

- **Five service keys** — `ModelAdapter`, `AgentLoop`, `SessionStore`,
  `MemoryStore`, `ToolRunner` — each with one provider per realm, replaced
  with core's `replace` under lease and drain rules (BEH-AG-001).
- **`Budget` is the entitlement companion's** and is cited, not redefined
  (BEH-AG-006).
- **A turn pins one toolset** and every tool call is a `Commands.dispatch`
  with that pin (BEH-AG-003, BEH-AG-005): agents get no private path. The
  one named exception is the loop's own `spawnSubagent` call, answering the
  model's call of the reserved spawn tool: it is no command, and its host
  mutations — the ephemeral realm and its installs — pass the
  `OperationGate` under the parent's actor (BEH-AG-003, BEH-AG-025).
- **Reference `AgentLoop` and `ToolRunner` plugins are shipped and
  replaceable; no `ModelAdapter` implementation is shipped.**

## Alternatives considered

- **A full agent framework.** Rejected: it would fix choices applications
  need to make, and grow Bridger's surface far beyond seams.
- **No package, leave agents to applications.** Rejected: every application
  would re-invent pinning, taint and task states, and the unsafe parts
  (auto-allow after untrusted text) would be re-invented unsafely.

## Consequences

**Positive**:

- Each part can be replaced by a plugin; agent calls look like any other
  caller to the gate and the call log.

**Negative**:

- Applications assemble a model adapter and prompts themselves.

**Trade-off accepted**: seams plus a small reference loop, rather than a
framework.

## References

- Behaviours: [01 — Agent seams](../behaviors/01-agent-seams.md)
- Invariants: [INV-AG-002](../invariants.md#inv-ag-002-a-turn-sees-one-toolset)
- Companions: [`@bridger/command`](../../command/README.md), [entitlement](../../entitlement/README.md)
- Core: [ADR-BR-003](../../core/decisions/003-one-provider-per-key-per-realm.md), [ADR-BR-004](../../core/decisions/004-replace-is-stop-then-start.md)
- Source: gap analysis of 2026-11-08, item 12.
