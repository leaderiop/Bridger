# 05 — Required Acceptance Checks

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-MC-BEH-05                                            |
> | Revision       | 0.9                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.9 (2026-11-11): Check 12: a subagent's dispatch of a plan that stops its parent's loop, listed under "@bridger/agent/spawned-by", fails `PlanAffectsCaller` (SPEC-AUDIT-08 A1) (CCR-MC-009)<br>0.8 (2026-11-11): Check 12: a plan stopping a call-path plugin's parent, transitively, fails `PlanAffectsCaller` (SPEC-AUDIT-07 MC1) (CCR-MC-008)<br>0.7 (2026-11-10): Check 12: `PlanStale` at step 3 when a stored ref re-resolves to another digest (low finding), and the plugin in `CurrentTransition` on the call path (H4, final review); check 16 and REQ-MC-016: the `McpTasks` port, task subscriptions, its `notifications/tasks` channel and `ended` signal (BEH-MC-008, M8) (CCR-MC-006)<br>0.6 (2026-11-10): Check 1: server removal interrupts in-flight calls; check 12: the host calls' actor and `PlanAffectsCaller` (P22, P24) (CCR-MC-005)<br>0.5 (2026-11-09): Checks 8, 9 and 10 follow the import as a link: session child, background handshake, `SessionLost` outcomes, disclosure; check 15 and REQ-MC-015: no contract object, local contracts, call-log `disclosed` (core CCR-BR-033); check 9: `McpClientStatus` and no session after a refused mount (independent review) (CCR-MC-004)<br>0.4 (2026-11-08): Checks 4, 5, 11, 13 and 14 follow the round-2 agent review: long-command wait without timeout, envelope and size caps, `reconcile-plan` not read-only, reads and resources from a tainted session (CCR-MC-003)<br>0.3 (2026-11-08): Checks 2–6, 10 and 12 extended (taint by default, listing record and `ToolChanged`, idempotency key, resources, untrusted mark, atomic apply); checks 13 and 14 (CCR-MC-003, round 2: recheck items 1, 6, 7, 8, 9)<br>0.2 (2026-11-08): Checks aligned with per-call pins, change feed, external mark, plan store (CCR-MC-002)<br>0.1 (2026-11-08): Initial draft (CCR-MC-001)                 |

---

The checks every implementation of `@bridger/mcp` must pass before any
behaviour of this companion may be cited as evidence
([ADR-BR-035](../../core/decisions/035-evidence-from-executed-tests.md)).
They run on core's `TestHost` with the testing fixtures of the command
companion and an in-memory MCP transport pair, so that every check is
deterministic. This file owns BEH-MC-033–040 and uses 033; 034–040 are
reserved.

Planned tests: `packages/mcp/test/*.test.ts` *(Planned)*.

## BEH-MC-033: Required acceptance checks

> **See:** [ADR-MC-001](../decisions/001-server-projects-a-toolset.md), [ADR-MC-002](../decisions/002-imported-tools-are-tainted-remote-proxies.md), [ADR-MC-003](../decisions/003-host-self-service-is-plan-first.md), [ADR-MC-004](../decisions/004-target-mcp-2026-07-28.md), [ADR-BR-026](../../core/decisions/026-deterministic-test-host.md)
> **Core seam:** [21 — Testing host](../../core/behaviors/21-testing-host.md)
> **Risk:** [RSK-BR-018](../../core/gxp/03-risk-assessment.md#rsk-br-018)

```
REQUIREMENT: The package test suite MUST contain at least one test for each
             of the following:
             1. The server is a plugin: removal stops accepting requests,
                interrupts in-flight calls (each dispatch ends interrupted)
                and closes the transport; no tool table outside the
                toolset.
             2. A session with no principal, or a refused or failing
                resolver, lists and calls nothing; every call carries the
                session actor and an MCP-session provenance entry; a session
                is tainted with "mcp-inbound:<server id>" unless the
                resolver answered `trusted: true`, and no client field can
                change that.
             3. `tools/list` order equals the toolset order for random
                contribution and activation orders (property test); pages
                never mix revisions; a stale cursor fails with -32602
                "toolset-changed"; annotations absent without a mapping,
                except `readOnlyHint` from the descriptor; the listing
                record keeps the latest digest per listed name.
             4. `tools/call` pins the current toolset for the call and
                dispatches exactly once with it; a name outside the toolset
                fails at dispatch step 1 and never reaches the gate; a
                republication during the call does not change what runs;
                client cancellation interrupts the handler and awaits its
                finalizers; an unlisted name fails with "unlisted-tool"; a
                definition changed since listing fails with `ToolChanged`
                before the gate; `_meta["bridger/idempotency-key"]` reaches
                dispatch; a long command is awaited with no await timeout
                (cancelled with the request) or bridged as a task, and a
                keyed repeat gets the same task.
             5. Every dispatch outcome maps as the table of BEH-MC-005,
                including a deferral (an `isError` result with the draft id,
                with and without the tasks extension, and no task created);
                the `content` text of a success and a resource read is the
                envelope of the output, capped by `maxResultBytes`, while
                `structuredContent` is the raw output, and an output over
                `maxStructuredBytes` is the "too-large" result; no cause or
                configuration value appears on the wire.
             6. No prompts capability; no resources capability without the
                option; a listed tool refused by the gate is refused.
             7. Notifications go only to subscribers, are derived from the
                toolset view's `changes` feed, follow the publication
                they announce, carry its revision, strictly increase,
                coalesce for a slow session without delaying others, and are
                not sent for an unchanged fingerprint.
             8. An imported server's list change adds, removes and replaces
                the session child's contributions serially, a replace
                waiting for the removal's drain; a re-sync stops when its
                session ends; subscriptions end with the session and the shared
                toolset is released after the last session; the server
                holds a view and cannot publish.
             9. Import: id normalization and collision exclusion; the
                import is `active` with an unreachable server and opens
                nothing in its build; a failed initialize or first
                `tools/list` is reported in `McpClientStatus` with its stage
                and retried on the schedule, never a build failure; commands
                mount with the session child and are withdrawn when the
                session ends, and the import reconnects; a refused child
                mount ends the session, is reported "mount-refused" and
                opens no further session; calls
                bounded by dispatch's timeout with cancellation sent; a
                call in flight on a lost session fails with `SessionLost`,
                outcome "unknown" once sent and "not-executed" if never
                sent, and a call after the session ended with
                `RemoteUnavailable`, without retry; a stale-epoch response
                is discarded.
             10. Import: input refused by the external schema never leaves;
                 an uncompilable schema, another dialect or a non-object
                 root excludes the tool; the descriptor's schemas are the
                 external ones; output checked against `outputSchema`;
                 every imported descriptor tagged "external", with
                 `untrustedOutput` the root and never `readOnly`; each
                 external call offered as an outbound "crossing" entry;
                 annotations
                 carried as `externalAnnotations` change no tag, flag or
                 gate input; title and descriptions bounded and digested;
                 no identity forwarded with `disclose` empty; each
                 disclosed claim, and only those, in `_meta` under
                 "bridger/claims", with the claim names in status and log.
             11. Host tools: `snapshot` and `inspect` return no
                 configuration value (secret-canary test); `inspect` of an
                 unknown plugin is `UnknownPlugin` and without `id` iterates
                 one snapshot in realm-then-id order; `reconcile-plan`
                 changes nothing on the host, accepts no configuration
                 value and is not declared `readOnly`;
                 `reconcile-apply` is absent without `apply: true` and
                 always regulated.
             12. `reconcile-apply` passes the command gate, fails with
                 `PlanUnknown` for an unknown, expired, evicted or
                 pre-restart `planId`, fails with `PlanStale` at step 3
                 when a stored ref re-resolves to a definition with another
                 digest (one mismatch per changed entry, no `reconcile`
                 called), fails with
                 `PlanStale` after a host change that alters the plan's diff, and then
                 consults the `OperationGate` once per entry action; a
                 refused entry appears in `rejected`; with `atomic`, a
                 failed entry yields `ApplyRolledBack` or `PartialApply` and
                 undo requests reach the gate; host calls carry the
                 dispatch's correlation and a context `{ actor, reason }`
                 whose actor is the dispatching actor, recorded as the
                 actor of every lifecycle record (never unattributed or
                 `Actor.system`); a plan whose entry action would stop the
                 host-tools plugin, the dispatching plugin (`onBehalfOf`), a
                 plugin the fiber holds or builds (`CurrentTransition`), a
                 plugin listed under "@bridger/agent/spawned-by" (a
                 subagent's dispatch stopping its parent's loop), or
                 a provider or the parent of one of them, transitively
                 (a plan stopping the parent of the server, the loop or the
                 host-tools plugin included), fails
                 with `PlanAffectsCaller` naming them and calls no
                 `reconcile`; host tools write no `AuditSink` record of
                 their own.
             13. Resources: templates only for read-only commands tagged
                 "mcp-resource" of the session's toolset, in toolset order;
                 a read is one dispatch with the listed digest and the
                 session's context, refused by the gate like a call; an
                 unknown URI fails with "unknown-resource"; no
                 subscription.
             14. A tainted session's call of a command not declared
                 `readOnly` is deferred or refused by the command catalog's
                 taint floor, never allowed on an automatic decision; its
                 declared reads and resource reads succeed as the gate
                 decides (and with no gate), and are deferred or refused
                 under `taintFloor.readOnly: "floor"`; a trusted session's
                 calls are judged by the gate alone.
             15. Local contracts: no exported function of the package has a
                 parameter typed as a contract (type-level test); a command
                 whose handler uses a service under a local contract is
                 listed and called as a tool whose schemas are the
                 command's alone, and the service's `ServiceId` and members
                 appear nowhere on the wire (BEH-MC-001); an import's
                 call-log entry names in `disclosed` exactly the claims
                 sent with the call, and omits it when none was
                 (BEH-MC-022).
             16. Tasks port: the tasks extension is advertised only while
                 `McpTasks` is resolvable; every `tasks/*` request of a
                 negotiating session, and every long command's task, reaches
                 the port with the session's info and bound actor, and the
                 port's answer is returned as given; a client field never
                 replaces the actor; with the port gone or failing,
                 `tasks/*` gets an internal error and a long command is
                 awaited; a session that did not negotiate gets "method not
                 found"; a `subscriptions/listen` with `taskIds` reaches the
                 port and only the ids it admits are acknowledged, none
                 with the port gone while the rest of the subscription
                 proceeds; a
                 `notifications/tasks` sent through `notify` reaches only
                 its session, in order, without delaying another session,
                 `notify` after the session ended does nothing, and `ended`
                 completes when it ends.
```

| REQ | Check | Behaviours | Status |
| --- | ----- | ---------- | ------ |
| REQ-MC-001 | 1. Server is a plugin; no own tool table | [BEH-MC-001](./01-server.md#beh-mc-001-the-mcp-server-is-an-ordinary-plugin) | Not run |
| REQ-MC-002 | 2. Session principal from the application only | [BEH-MC-002](./01-server.md#beh-mc-002-a-session-has-one-principal-supplied-by-the-application) | Not run |
| REQ-MC-003 | 3. Deterministic `tools/list`, revision-bound cursors | [BEH-MC-003](./01-server.md#beh-mc-003-toolslist-follows-the-toolset-order-and-binds-cursors-to-its-revision) | Not run |
| REQ-MC-004 | 4. `tools/call` is one dispatch; membership first; cancellation | [BEH-MC-004](./01-server.md#beh-mc-004-toolscall-is-a-command-dispatch) | Not run |
| REQ-MC-005 | 5. Outcome mapping; nothing internal on the wire | [BEH-MC-005](./01-server.md#beh-mc-005-outcomes-map-to-results-and-errors-one-way) | Not run |
| REQ-MC-006 | 6. No wider surface than the catalog | [BEH-MC-006](./01-server.md#beh-mc-006-the-server-never-widens-what-the-command-companion-allows) | Not run |
| REQ-MC-007 | 7. List-changed notifications | [BEH-MC-009](./02-list-changed.md#beh-mc-009-the-server-advertises-listchanged-and-serves-subscriptionslisten), [BEH-MC-010](./02-list-changed.md#beh-mc-010-a-notification-follows-a-toolset-publication-whose-content-changed), [BEH-MC-011](./02-list-changed.md#beh-mc-011-notifications-coalesce-and-never-regress) | Not run |
| REQ-MC-008 | 8. Import re-sync; subscription lifetime | [BEH-MC-012](./02-list-changed.md#beh-mc-012-an-imported-servers-list-change-re-synchronizes-its-contributions), [BEH-MC-013](./02-list-changed.md#beh-mc-013-a-session-subscription-ends-with-its-session) | Not run |
| REQ-MC-009 | 9. Import as a link; session child; timeouts; call outcomes; no retry; epochs | [BEH-MC-017](./03-client-import.md#beh-mc-017-an-import-is-a-link-whose-session-child-carries-the-imported-commands), [BEH-MC-018](./03-client-import.md#beh-mc-018-an-imported-call-is-a-lease-on-the-proxy-and-always-has-a-timeout) | Not run |
| REQ-MC-010 | 10. Import: schemas, taint, untrusted annotations, identity only as disclosed | [BEH-MC-019](./03-client-import.md#beh-mc-019-input-is-checked-against-the-external-json-schema-before-it-leaves), [BEH-MC-020](./03-client-import.md#beh-mc-020-imported-commands-are-always-marked-external-and-consumers-taint-by-descriptor), [BEH-MC-021](./03-client-import.md#beh-mc-021-external-annotations-and-descriptions-are-data-never-policy), [BEH-MC-022](./03-client-import.md#beh-mc-022-the-proxy-forwards-no-identity-unless-the-import-discloses-it-and-never-annotations) | Not run |
| REQ-MC-011 | 11. Host reads and plan change nothing and expose no values | [BEH-MC-025](./04-host-tools.md#beh-mc-025-host-tools-are-commands-contributed-by-one-plugin), [BEH-MC-026](./04-host-tools.md#beh-mc-026-snapshot-returns-the-host-snapshot-which-carries-no-configuration-values), [BEH-MC-027](./04-host-tools.md#beh-mc-027-inspect-returns-names-and-counts-only), [BEH-MC-028](./04-host-tools.md#beh-mc-028-reconcile-plan-returns-a-plan-and-changes-nothing) | Not run |
| REQ-MC-012 | 12. Apply through both gates; stale plans refused | [BEH-MC-029](./04-host-tools.md#beh-mc-029-reconcile-apply-applies-a-plan-only-through-both-gates), [BEH-MC-030](./04-host-tools.md#beh-mc-030-host-tools-write-nothing-core-does-not-already-write) | Not run |
| REQ-MC-013 | 13. Resources as projections of read-only commands | [BEH-MC-007](./01-server.md#beh-mc-007-read-models-are-served-as-resources-each-read-a-dispatch) | Not run |
| REQ-MC-014 | 14. Inbound taint reaches the taint floor | [BEH-MC-002](./01-server.md#beh-mc-002-a-session-has-one-principal-supplied-by-the-application), [BEH-MC-004](./01-server.md#beh-mc-004-toolscall-is-a-command-dispatch) | Not run |
| REQ-MC-015 | 15. No contract object accepted; a local contract never crosses; disclosed claims named in the call log | [BEH-MC-001](./01-server.md#beh-mc-001-the-mcp-server-is-an-ordinary-plugin), [BEH-MC-022](./03-client-import.md#beh-mc-022-the-proxy-forwards-no-identity-unless-the-import-discloses-it-and-never-annotations) | Not run |
| REQ-MC-016 | 16. Tasks extension through the `McpTasks` port | [BEH-MC-008](./01-server.md#beh-mc-008-the-server-passes-the-tasks-extension-to-the-mcptasks-port) | Not run |

Every `BEH-MC` identifier of this companion appears in at least one row;
BEH-MC-033 is this list itself.

**Settled here.** The checks run against an in-memory transport pair, not a
network socket, so that ordering and cancellation are under `TestHost`
control. A separate, non-required suite runs the server against an external
MCP conformance client; its results are recorded but are not cited as
evidence for any behaviour here until that suite is itself specified.

**Open.** Which external MCP conformance suite, if any, to adopt.

---

_Previous: [04 — Host tools](./04-host-tools.md)_
