# ADR-MC-005: Inbound sessions are tainted by default, and calls are pinned to the listed digest

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-MC-ADR-005                                           |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.2 (2026-11-08): Consequences state what a default session can do: declared reads and resources on the gate's decision, through the command catalog's read-only exemption; every other call is a draft or a refusal (round-2 agent review A-05) (CCR-MC-003)<br>0.1 (2026-11-08): Initial draft (CCR-MC-003)                 |

---

## Context

The recheck of 2026-11-08 found two contradictions at the MCP edge (§8). X7:
the command companion promises that what a model was shown is what runs
(INV-CM-003), but the server pinned the toolset current at call time, so a
client that listed tools hours ago ran whatever the command had since become.
X8: the agent companion promises that a session steered by untrusted text is
never auto-allowed, but an inbound MCP session — usually a model on another
machine — carried no taint, so its writes were judged as an operator's.

The recheck also asked for read models and search to be offered as MCP
resources (§5 item 9), which revision 0.2 excluded.

## Decision

- **Taint by default.** At `initialize` the session's annotations gain core's
  `Annotation.Taint` label "mcp-inbound:<server id>", unless the application's
  resolver answers `trusted: true` (BEH-MC-002).
- **A listing record per session.** The server keeps, for each tool name it
  listed to the session, the digest it listed, and passes it to dispatch as
  `expectDigest`; a changed definition fails with `ToolChanged`, an unlisted
  name with "unlisted-tool" (BEH-MC-003, BEH-MC-004).
- **Resources as projections.** Read-only commands tagged "mcp-resource" are
  listed as resource templates; each read is one dispatch, under the same
  pin, digest check, gate and floor as a call (BEH-MC-007).
- **Reads work for a default session (revision 0.2).** The command
  catalog's taint floor keeps the gate's decision for commands declared
  `readOnly` (command [ADR-CM-005](../../command/decisions/005-taint-floor-in-dispatch.md),
  BEH-CM-016), so a tainted session can call declared reads and read
  resources; the taint stays, and nothing the session reads can lead to an
  automatic change. Without that exemption, revision 0.1 left a default
  session unable to get any successful result.

## Alternatives considered

- **Pin the toolset from `tools/list` to the next list.** Rejected: an idle
  client would keep a retired toolset alive indefinitely, and the pin would
  still not tell which page the client actually read.
- **Trust inbound sessions unless tainted by the application.** Rejected:
  the safe default must be the one that holds when the application forgets.
- **Resources as a separate registry.** Rejected: it would be a second path
  around the gate, which BEH-MC-006 exists to forbid.

## Consequences

**Positive**:

- The two companion promises hold at the MCP edge without new core seams.
- Clients get resources without a new authorization model, and a default
  session can read them, as the gate decides.

**Negative**:

- Every call from an untrusted client to a command not declared `readOnly`
  becomes a draft or a refusal, and the client never applies the draft: the
  application re-dispatches an approved draft. That is the intent; a
  default session is a read-only session in effect.
- The read exemption rests on the command author's `readOnly` declaration,
  which is not enforced (command BEH-CM-006); imported commands cannot carry
  it (BEH-MC-020). A deployment that wants reads released by a person sets
  `taintFloor.readOnly: "floor"`, and its default sessions then get no
  successful result.
- A client that calls without listing first is refused.

**Trade-off accepted**: a stricter edge, with the exemption visible in the
application's resolver.

## References

- Behaviours: [01 — Server](../behaviors/01-server.md) (BEH-MC-002–007)
- Invariants: [INV-MC-006](../invariants.md#inv-mc-006-an-inbound-session-is-tainted-unless-the-application-trusts-it), [INV-MC-007](../invariants.md#inv-mc-007-a-toolscall-runs-the-definition-the-session-listed)
- Command companion: [02 — Dispatch](../../command/behaviors/02-dispatch.md) (`expectDigest`, taint floor)
- Source: Bridger recheck of 2026-11-08, §5 items 6 and 9; §8 X7, X8.
