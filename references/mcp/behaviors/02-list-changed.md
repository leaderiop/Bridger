# 02 — List-changed Notifications

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-MC-BEH-02                                            |
> | Revision       | 0.3                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.3 (2026-11-09): Re-sync acts on the current session child and stops when its session ends (BEH-MC-012) (CCR-MC-004)<br>0.2 (2026-11-08): Notifications from the view's `changes` feed; re-sync waits for the removal's drain (CCR-MC-002)<br>0.1 (2026-11-08): Initial draft (CCR-MC-001)                 |

---

Plugins come and go while a client is connected; their commands enter and
leave the catalog. A client that is not told keeps offering the model tools
that no longer exist, or never learns of new ones. MCP's 2026-07-28 revision
pushes list changes through `subscriptions/listen`. This file specifies when
the server notifies: once per published toolset revision whose content
changed, after publication, never before. This file owns BEH-MC-009–016 and
uses 009–013; 014–016 are reserved.

Planned source: `packages/mcp/src/ListChanged.ts` *(Planned)*. The toolset
`Generation` and its republication rule are in the command companion
([03 — Toolsets](../../command/behaviors/03-toolsets.md)).

## BEH-MC-009: The server advertises listChanged and serves subscriptions/listen

> **See:** [ADR-MC-004](../decisions/004-target-mcp-2026-07-28.md)

```ts
// illustrative — not type-checked
// initialize result (server capabilities)
{ capabilities: { tools: { listChanged: true }, subscriptions: {} } }
// client → server:  subscriptions/listen { topics: ["tools/list_changed"] }
// server → client:  notifications/tools/list_changed { _meta: { "bridger/toolsetRevision": n } }
```

```
REQUIREMENT: The server MUST advertise `tools.listChanged: true` and MUST
             accept `subscriptions/listen` for tool-list changes. It MUST
             send `notifications/tools/list_changed` only to sessions that
             subscribed.
```

```
REQUIREMENT: Each notification MUST carry, in `_meta`, the toolset revision
             it announces. The value MUST be the revision of the session's
             toolset generation, as its view's `changes` feed reports it,
             not a server-local counter.
```

**Settled here.** The revision in `_meta` is optional for a client to read;
it lets a client that receives two notifications in quick succession skip
the first re-list.

**Open.** The exact topic string follows the 2026-07-28 revision; if the
published schema names it differently, the adapter follows the schema.

## BEH-MC-010: A notification follows a toolset publication whose content changed

> **Invariant:** [INV-MC-002](../invariants.md#inv-mc-002-a-list-changed-notification-follows-the-publication-it-announces)
> **See:** [ADR-MC-001](../decisions/001-server-projects-a-toolset.md)
> **Core seam:** [19 — Contribution registry](../../core/behaviors/19-contribution-registry.md), [20 — Generation](../../core/behaviors/20-generation.md)

```
REQUIREMENT: The server MUST derive notifications only from the `changes`
             feed of the session's toolset view (command BEH-CM-018; core
             `Generation.changes`, BEH-BR-169, BEH-BR-170). That feed gives
             an element for a revision only after its `publish` has
             completed, so a notification sent on receipt of an element is
             sent after the revision it announces has been published, and a
             `tools/list` the client sends on receipt is answered from that
             revision or a later one. The server MUST NOT poll `current`.
             The feed's first element (the revision current at subscription)
             MUST NOT be announced unless the client's last `tools/list`
             was answered from an older revision.
```

```
REQUIREMENT: The server MUST NOT notify for a catalog change that leaves the
             session's toolset fingerprint unchanged — a command added that
             the session's selector excludes, a contribution removed and
             re-added with the same descriptor digest.
```

The command companion republishes a principal's toolset only when its
fingerprint changes, so in the ordinary case every publication is a change.
The second requirement still holds the server to it, so that a selector
change in the application never produces a notification storm of identical
lists.

**Settled here.** Notification is driven by the toolset, not by the
registry's `changes` stream: the registry changes for every contributor,
including commands the session will never see.

**Open.** None.

## BEH-MC-011: Notifications coalesce and never regress

> **Invariant:** [INV-MC-002](../invariants.md#inv-mc-002-a-list-changed-notification-follows-the-publication-it-announces)
> **See:** [ADR-MC-001](../decisions/001-server-projects-a-toolset.md), [ADR-BR-007](../../core/decisions/007-observation-primitives.md)

```
REQUIREMENT: When several revisions are published faster than a session's
             transport can deliver, the server MAY skip intermediate
             revisions but MUST deliver a notification for the latest one.
             The announced revisions MUST increase strictly per session.
```

```
REQUIREMENT: A slow session MUST NOT delay publication of the toolset, other
             sessions' notifications, or any dispatch. The per-session
             buffer MUST be bounded (one pending notification suffices).
```

This is the state-feed rule of `Host.changes`, `RegistryView.changes` and
`Generation.changes`
(core [BEH-BR-165](../../core/behaviors/19-contribution-registry.md),
[BEH-BR-170](../../core/behaviors/20-generation.md)) applied
to the wire: a notification says "the list is now different", not "here is
every change".

**Settled here.** One pending notification per session is the bound. A
second publication while one is pending replaces it.

**Open.** A minimum interval between notifications (debounce) is not
specified; the coalescing above already bounds traffic to transport speed.

## BEH-MC-012: An imported server's list change re-synchronizes its contributions

> **See:** [ADR-MC-002](../decisions/002-imported-tools-are-tainted-remote-proxies.md)
> **Core seam:** [19 — Contribution registry](../../core/behaviors/19-contribution-registry.md)

```
REQUIREMENT: When an external server imported by `McpClient.import`
             (03 — Client import) sends a list-changed notification, the
             import MUST re-list its tools on that session and apply the
             difference to the contributions of that session's child
             (BEH-MC-017): remove the contributions of tools that left,
             add contributions for tools that arrived, and replace — remove
             then add — a contribution whose descriptor digest would change
             (input or output schema, title, description or external
             annotations; command BEH-CM-005).
```

```
REQUIREMENT: A replace MUST await the end of the removal — the old entry
             hidden and its holds drained or revoked at the registry's
             `drainTimeout` (core BEH-BR-167) — before it adds the new
             contribution, so that the add never meets
             `DuplicateContribution` for an id still being removed (command
             BEH-CM-003). Calls revoked at the limit fail with
             `LeaseRevoked` as dispatch reports it. When the add still fails,
             the tool MUST be left out and the failure reported as a
             contribution failure; the proxy MUST NOT retry it until the
             next list change.
```

```
REQUIREMENT: The re-synchronization MUST be serialized per import, and the
             commands it changes MUST reach served sessions only through the
             ordinary path: catalog change, toolset republication, then
             BEH-MC-010.
```

```
REQUIREMENT: A re-synchronization belongs to the session that announced the
             change. When that session ends, its pending and running
             re-synchronizations MUST stop, and the session child's
             withdrawal removes every imported command; the next session
             starts from its own first `tools/list`. A notification that
             arrives under another session's epoch MUST be discarded.
```

A removal waits for in-flight calls under the registry's drain rule
(core BEH-BR-167), so a re-sync never cuts off a call in progress before the
registry's `drainTimeout`; while it waits, the tool is absent from the
catalog, which is the honest state.

**Settled here.** (1) A re-sync acts only on the current session child
(CCR-MC-004): the commands exist only while a session does, so a re-sync
that outlived its session would add commands no session can serve.
(2) A changed tool is removed then added, never mutated in
place: the registry has no in-place update, and a changed definition gets a
new descriptor digest, so a pinned turn that listed the old one fails with
`ToolChanged` rather than calling the new one under the old description.

**Open.** Whether a burst of external notifications should be debounced
before re-listing. This draft re-lists once per notification, serially, and
drops notifications that arrive while a re-list for a later one is queued.

## BEH-MC-013: A session subscription ends with its session

> **See:** [ADR-MC-001](../decisions/001-server-projects-a-toolset.md)
> **Core seam:** [20 — Generation](../../core/behaviors/20-generation.md)

```
REQUIREMENT: A session's subscription and its toolset view (with its
             `changes` subscription) MUST be held in the session's scope and
             MUST end when the session ends or the server plugin stops.
             Ending them releases the session's reference only; the server
             holds a view, never the generation, so it cannot close the
             generation (command BEH-CM-018).
```

```
REQUIREMENT: The server MUST rely on the command companion's sharing of one
             generation per (principal id, selector name) and MUST release
             its reference when the session's scope closes.
```

**Settled here.** Sharing per principal keeps many sessions of one user from
rebuilding the same toolset on every catalog change.

**Open.** None.

---

_Previous: [01 — Server](./01-server.md)_ · _Next: [03 — Client import](./03-client-import.md)_
