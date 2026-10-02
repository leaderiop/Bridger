# ADR-BR-014: PluginSnapshot is a discriminated union

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ADR-014                                              |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.1 (2026-10-02): Initial draft (CCR-BR-001)                 |

---

## Context

SPEC.md's `HostSnapshot.plugins[number]` is one flat record: `state`, plus `missingServiceIds` and `providerIds` always present, and `health` and `failure` optional. That shape can represent states that cannot occur: an `active` plugin with a `failure`, a `waiting` plugin with no missing service, a `failed` plugin reporting `health: "healthy"`, a `stopping` plugin with no indication of why or where it is going. Every adapter must then check fields defensively, and an adapter that trusts the wrong field shows an operator a false state.

The flat shape also omits two things consumers need. During `stopping`, an adapter cannot tell a removal from a restart, so it cannot say whether the plugin will come back. And `meta` carries `version` and `description` but not `digest`, although `reconcile` compares digests and a regulated user must be able to tell which build of a plugin was active at a given time ([URS-BR-028](../urs.md#urs-br-028-know-which-plugin-version-was-active-at-any-time)).

## Decision

`PluginSnapshot` is a discriminated union on `state`. `HostSnapshot.plugins` is `readonly PluginSnapshot[]`, and `PluginHandle.changes` emits `PluginSnapshot`.

```ts
// illustrative — not type-checked
type PluginSnapshot = PluginCommon & (
  | { readonly state: "waiting";  readonly missingServiceIds: readonly [ServiceId, ...ServiceId[]] }
  | { readonly state: "starting"; readonly providerIds: readonly string[] }
  | { readonly state: "active";   readonly providerIds: readonly string[]; readonly health: "healthy" | "degraded" | "unknown" }
  | { readonly state: "stopping"; readonly reason: StopReason; readonly next: "waiting" | "starting" | "disabled" | "gone" | "failed" }
  | { readonly state: "failed";   readonly failure: { readonly phase: "build" | "activation" | "runtime" | "cleanup"; readonly message: string }; readonly missingServiceIds: readonly ServiceId[] }
  | { readonly state: "disabled" }
)
interface PluginCommon { readonly id: string; readonly realm: string; readonly parentId?: string; readonly meta?: { readonly version?: string; readonly digest?: string; readonly description?: string } }
type StopReason = "dependency-loss" | "remove" | "replace" | "restart" | "reconfigure" | "disable" | "runtime-failure" | "shutdown"
```

What each variant encodes:

- `waiting` carries a **non-empty** tuple of missing service IDs: waiting means at least one declared service is unavailable, so an empty list is unrepresentable. Optional keys never appear in it.
- `starting` and `active` carry `providerIds` (plugin IDs, or `"base"` for base services), the captured bindings. Only `active` carries `health`.
- `stopping` carries the `reason` and the expected `next` state (`"gone"` for a removal), so an adapter can say whether the plugin will return.
- `failed` carries the failure phase and message, and keeps `missingServiceIds` current (possibly empty) so an adapter can show whether `retry` would start the plugin or land in `waiting` ([ADR-BR-005](../decisions/005-failure-is-sticky.md)).
- `disabled` carries nothing beyond the common fields.
- `meta` adds `digest`. No variant carries configuration values, keys, fibers or raw causes.

`HostSnapshot` keeps `hostId`, `revision`, `availableServiceIds` and `realms`, and gains `auditDegraded: boolean` and `audit: "wired" | "unwired"` ([ADR-BR-030](../decisions/030-audit-sink-port.md), [ADR-BR-031](../decisions/031-audit-failure-policy.md)).

## Alternatives considered

- **Keep the flat record with optional fields.** Rejected: illegal combinations stay representable, and every consumer re-derives which fields are meaningful.
- **A class hierarchy per state.** Rejected: snapshots must be plain, immutable data that encodes and compares structurally; classes add identity and prototypes for no gain.
- **Separate collections per state in `HostSnapshot`.** Rejected: plugin order and the per-plugin feed (`PluginHandle.changes`) would need reassembly, and a transition would move an entry between collections.

## Consequences

**Positive**:

- Narrowing on `state` gives exactly the fields that are meaningful; illegal snapshots do not type-check.
- Adapters can explain `stopping` and can show the active build's digest.

**Negative**:

- The shape departs from SPEC.md's flat record; adapter sketches written against it (REACT-API.md, FOLDKIT-API.md) need revising.
- Consumers must switch on `state` rather than read fields directly.

**Trade-off accepted**: a slightly more demanding consumer API, in exchange for snapshots that cannot describe an impossible plugin.

## References

- Behaviours: [04 — States and snapshots](../behaviors/04-states-and-snapshots.md), [13 — Observability and diagnostics](../behaviors/13-observability-and-diagnostics.md)
- Invariants: [INV-BR-007](../invariants.md#inv-br-007-failure-is-sticky), [INV-BR-008](../invariants.md#inv-br-008-snapshot-revisions-never-regress), [INV-BR-013](../invariants.md#inv-br-013-configuration-values-are-never-observable), [INV-BR-019](../invariants.md#inv-br-019-optional-dependencies-never-gate-activation)
- Requirements: [URS-BR-004](../urs.md#urs-br-004-know-why-a-plugin-is-not-running), [URS-BR-028](../urs.md#urs-br-028-know-which-plugin-version-was-active-at-any-time)
- Decisions: [ADR-BR-005](../decisions/005-failure-is-sticky.md), [ADR-BR-007](../decisions/007-observation-primitives.md), [ADR-BR-030](../decisions/030-audit-sink-port.md)
- Source: `docs/SPEC.md` — "Host interface" (`HostSnapshot`, `PluginState`), "State and lifecycle"
