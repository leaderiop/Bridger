# Runtime Invariants

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-MC-INV                                               |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.2 (2026-11-08): INV-MC-003 narrowed to the external mark; INV-MC-002 and INV-MC-005 sources aligned (CCR-MC-002)<br>0.1 (2026-11-08): Initial draft (CCR-MC-001)                 |

---

Properties of `@bridger/mcp` that hold for every execution. The shape is the
core's ([invariants](../core/invariants.md)): statement, **Source**,
**Implication**, **Verification**, **Related**. Nothing below is implemented;
every Source and Verification is *(Planned)*, and no invariant may be cited as
evidence until a test that checks it has run
([ADR-BR-035](../core/decisions/035-evidence-from-executed-tests.md)).

## INV-MC-001: tools/list order is the toolset order

For every session and every toolset revision, the tools listed — across all
pages — are exactly the tools of that revision, in the toolset's order, and
the same revision always yields the same bytes.

**Source**: `packages/mcp/src/McpServer.ts` *(Planned)* — pages are cut from
one toolset value; cursors bind revision and fingerprint.

**Implication**: a client's cache and a model's prompt cache over the tool
list are valid exactly as long as the revision is; no list depends on
activation order.

**Verification** *(Planned)*: property test over random contribution and
activation orders comparing listed bytes; stale-cursor scenarios.

**Related**: [BEH-MC-003](behaviors/01-server.md#beh-mc-003-toolslist-follows-the-toolset-order-and-binds-cursors-to-its-revision), [ADR-MC-001](decisions/001-server-projects-a-toolset.md), [ADR-MC-004](decisions/004-target-mcp-2026-07-28.md)

## INV-MC-002: A list-changed notification follows the publication it announces

No session receives a notification for a toolset revision before that
revision is published, announced revisions strictly increase per session, and
the latest published revision with a changed fingerprint is always announced
to every subscribed session that remains open.

**Source**: `packages/mcp/src/ListChanged.ts` *(Planned)* — notifications are
derived from the `changes` feed of the session's toolset view (core
`Generation.changes`, which delivers a revision only after its `publish`),
with a one-slot per-session buffer.

**Implication**: a client that re-lists on notification never sees an older
list than announced, and never misses the last change.

**Verification** *(Planned)*: `TestHost` scenarios with held steps between
publication and delivery; property test over bursts of contributions.

**Related**: [BEH-MC-010](behaviors/02-list-changed.md#beh-mc-010-a-notification-follows-a-toolset-publication-whose-content-changed), [BEH-MC-011](behaviors/02-list-changed.md#beh-mc-011-notifications-coalesce-and-never-regress)

## INV-MC-003: Every imported command is marked external

Every command contributed by `McpClient.import` carries the tag "external"
and has the proxy plugin as `owner`, and no option removes the tag.

**Source**: `packages/mcp/src/McpClient.ts` *(Planned)* — the spec of every
imported command is built in one place that always adds the tag.

**Implication**: a consumer can always tell that a command's output was
written by an external party; `@bridger/agent` taints a session that reads
it (BEH-AG-019), and the command catalog's taint floor then withholds
automatic approval. The mark is on the descriptor, not on the returned value:
a consumer that ignores the tag receives the text unmarked.

**Verification** *(Planned)*: a test that every imported descriptor carries
the tag for every `ImportMapping`; a static check that no public option
removes it; an agent scenario in which reading an imported result taints the
session.

**Related**: [BEH-MC-020](behaviors/03-client-import.md#beh-mc-020-imported-commands-are-always-marked-external-and-consumers-taint-by-descriptor), [ADR-MC-002](decisions/002-imported-tools-are-tainted-remote-proxies.md)

## INV-MC-004: Host tools never return configuration values

No output of `bridger.host.snapshot`, `bridger.host.inspect`,
`bridger.host.reconcile-plan` or `bridger.host.reconcile-apply` contains a
configuration value, and none of their inputs accepts one.

**Source**: `packages/mcp/src/HostTools.ts` *(Planned)* — outputs are
encodings of core values that already carry none
([INV-BR-013](../core/invariants.md#inv-br-013-configuration-values-are-never-observable));
inputs name overrides by `configRef`.

**Implication**: secrets never pass through a model's context or transcript
by way of the host tools.

**Verification** *(Planned)*: secret-canary test over all four commands.

**Related**: [BEH-MC-026](behaviors/04-host-tools.md#beh-mc-026-snapshot-returns-the-host-snapshot-which-carries-no-configuration-values), [BEH-MC-027](behaviors/04-host-tools.md#beh-mc-027-inspect-returns-names-and-counts-only), [BEH-MC-028](behaviors/04-host-tools.md#beh-mc-028-reconcile-plan-returns-a-plan-and-changes-nothing)

## INV-MC-005: Every tools/call is a command dispatch

Every `tools/call` the server admits for a name in the session's toolset
results in exactly one `Commands.dispatch`, with a toolset pinned for that
call, and no other call of a handler;
every host lifecycle change made through host tools passes the command gate
and, per entry, the `OperationGate`.

**Source**: `packages/mcp/src/McpServer.ts`, `packages/mcp/src/HostTools.ts`
*(Planned)* — the server holds no handler reference; reconcile-apply calls
core `reconcile`, which gates each entry
([BEH-BR-158](../core/behaviors/18-reconciliation-and-confluence.md)).

**Implication**: MCP is not a back door around the gate, the hooks or the
call log.

**Verification** *(Planned)*: scripted-gate scenarios counting gate calls per
`tools/call` and per reconcile entry.

**Related**: [BEH-MC-004](behaviors/01-server.md#beh-mc-004-toolscall-is-a-command-dispatch), [BEH-MC-029](behaviors/04-host-tools.md#beh-mc-029-reconcile-apply-applies-a-plan-only-through-both-gates), [ADR-MC-003](decisions/003-host-self-service-is-plan-first.md)
