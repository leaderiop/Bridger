# ADR-MC-002: Imported tools are remote proxies; their output is always tainted and their annotations untrusted

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-MC-ADR-002                                           |
> | Revision       | 0.3                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.3 (2026-11-09): Import is a link with a session child; lost-session outcomes; identity by `disclose`; two rejected alternatives; `owner` is the session child (independent review) (CCR-MC-004)<br>0.2 (2026-11-08): Output mark restated as a descriptor mark (CCR-MC-002)<br>0.1 (2026-11-08): Initial draft (CCR-MC-001)                 |

---

## Context

An MCP client lets a host use tools served by another process — often written
by a third party. Their descriptions, annotations and outputs are text a model
will read. Bridger's rule is that third-party code never runs in-process and
that a remote plugin is a local proxy plugin (gap analysis §7).

## Decision

- **An import is a link** of [`@bridger/remote`](../../remote/README.md):
  its build opens nothing remote, the plugin is `active` at once, and the
  MCP session runs in the background on the reconnect schedule. Each
  established session mounts one session child that carries the imported
  commands; a lost session withdraws them (BEH-MC-017). Calls in flight are
  leases, every call has a timeout, a lost session fails calls in flight with
  `SessionLost` under remote's outcome rule and later calls with
  `RemoteUnavailable`, without retry, and a stale epoch is discarded
  (BEH-MC-018). (Revision 0.2 opened the session in the build; an
  unreachable server then failed the plugin, against remote BEH-RM-003.)
- **Each external tool becomes a command contribution** under a prefix, its
  input checked against the external JSON Schema before it leaves the host
  (BEH-MC-019); list changes re-synchronise contributions (BEH-MC-012).
- **Every imported command is marked external** on its descriptor (tag
  "external", `owner` the import's session child, BEH-MC-020). Core annotations belong to a fiber, not to
  a value, so the output itself carries no annotation; a consumer taints by
  descriptor, as `@bridger/agent` does, and the command catalog's taint floor
  then forbids automatic approval for that session's requests (BEH-MC-020).
  (Revision 0.1 said the output was "returned with" a taint annotation; no
  core mechanism attaches one to a value.)
- **Annotations and descriptions are data, never policy**: they change no
  tag, no `regulated` flag and no gate input (BEH-MC-021). The host's
  annotations are never forwarded, and its identity only as the import's
  `disclose` option lists, default none, as for every remote link
  (BEH-MC-022; remote BEH-RM-024).

## Alternatives considered

- **Trust annotations such as `readOnlyHint`.** Rejected: MCP itself defines
  them as untrusted.
- **Taint only when the server is unknown.** Rejected: "known" is a
  deployment judgement; the package cannot verify a server, so it marks every
  imported command and lets the application's gate decide with that knowledge.
- **Open the session in the build** (revision 0.2). Rejected (CCR-MC-004):
  an unreachable server became a sticky build failure needing an operator
  `retry`, and the build held a slot on the network, which remote's
  BEH-RM-003 forbids for every link.
- **Forward identity through a per-tool mapping.** Rejected: identity is a
  property of the connection to one server, not of one tool; the import's
  `disclose` option carries it, with remote's default of none.
- **Run imported tools in-process.** Not possible by construction and
  against the gap analysis §7.

## Consequences

**Positive**:

- External text reaches an agent's model through a command marked external,
  and a session that read it cannot be auto-allowed.

**Negative (scope)**:

- A consumer other than `@bridger/agent` that ignores the "external" tag
  receives the text with no mark.

**Negative**:

- Every session that uses an imported tool needs human approval for writes;
  that is the intended friction.

**Trade-off accepted**: a conservative mark on every imported command, at the
cost of approval friction.

## References

- Behaviours: [03 — Client import](../behaviors/03-client-import.md), [02 — List-changed notifications](../behaviors/02-list-changed.md)
- Invariants: [INV-MC-003](../invariants.md#inv-mc-003-every-imported-command-is-marked-external)
- Companions: [`@bridger/remote`](../../remote/README.md), [`@bridger/agent` taint](../../agent/behaviors/03-taint-and-provenance.md)
- Core: [30 — Operation context annotations](../../core/behaviors/30-operation-context-annotations.md), [ADR-BR-019](../../core/decisions/019-realms-are-resolution-namespaces.md)
