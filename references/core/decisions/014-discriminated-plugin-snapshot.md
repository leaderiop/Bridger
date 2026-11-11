# ADR-BR-014: PluginSnapshot is a discriminated union

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ADR-014                                              |
> | Revision       | 0.6                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed — amended by ADR-BR-042, ADR-BR-050 and ADR-BR-053  |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.6 (2026-11-11): `providerIds` name plugins as `{ id, realm }` (C2); a child's sub-scope close or unmount shows `reason` "remove" and resumes only a stop parked outside its parent's stop (H1, CL1) (SPEC-AUDIT-05) (CCR-BR-037)<br>0.5 (2026-11-10): Amended by ADR-BR-042, ADR-BR-050 and ADR-BR-053 marked; the union and `StopReason` defer to BEH-BR-027 (C22, C5) (CCR-BR-034)<br>0.4 (2026-11-08): The snapshot union gains `dormant` (ADR-BR-042) (CCR-BR-017); state handoff adds no snapshot field (CCR-BR-019)<br>0.3 (2026-10-03): `HostSnapshot.auditDropped` listed (consistency pass) (CCR-BR-013)<br>0.2 (2026-10-02): `stopping` gains `parked`; `reason` and `next` of a resumed or parked stop (CCR-BR-008)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001) |
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
  | { readonly state: "starting"; readonly providerIds: readonly ({ readonly id: string; readonly realm: string } | "base")[] }
  | { readonly state: "active";   readonly providerIds: readonly ({ readonly id: string; readonly realm: string } | "base")[]; readonly health: "healthy" | "degraded" | "unknown" }
  | { readonly state: "stopping"; readonly reason: StopReason; readonly next: "waiting" | "starting" | "disabled" | "gone" | "failed"; readonly parked: boolean }
  | { readonly state: "failed";   readonly failure: { readonly phase: "build" | "activation" | "runtime" | "cleanup"; readonly message: string }; readonly missingServiceIds: readonly ServiceId[] }
  | { readonly state: "disabled" }
)
interface PluginCommon { readonly id: string; readonly realm: string; readonly parentId?: string; readonly meta?: { readonly version?: string; readonly digest?: string; readonly description?: string } }
type StopReason = "dependency-loss" | "remove" | "replace" | "restart" | "reconfigure" | "disable" | "runtime-failure" | "shutdown"
```

What each variant encodes:

- `waiting` carries a **non-empty** tuple of missing service IDs: waiting means at least one declared service is unavailable, so an empty list is unrepresentable. Optional keys never appear in it.
- `starting` and `active` carry `providerIds` (each provider as the record `{ id, realm }`, or `"base"` for base services, since CCR-BR-037), the captured bindings. Only `active` carries `health`.
- `stopping` carries the `reason` and the expected `next` state (`"gone"` for a removal), so an adapter can say whether the plugin will return. `reason` names what began the stop, except where the stop is taken over: a cascade that ends a parked operator intent makes it "dependency-loss", a call that resumes a parked stop makes it that call's operation, shutdown makes it "shutdown", and a child's sub-scope close or unmount makes it "remove" ([08 — Operation legality](../behaviors/08-operation-legality.md), BEH-BR-074, BEH-BR-075, BEH-BR-080; [14 — Children and groups](../behaviors/14-children-and-groups.md), BEH-BR-121).
- `stopping` also carries `parked`: true while the stop waits for a call, a cascade or shutdown to resume it — or, for a child whose stop was parked outside its parent's stop, its sub-scope close or unmount (BEH-BR-121) — a *parked operation* or a *parked system stop* (BEH-BR-074). By `state`, `reason` and `next` alone a parked stop looks exactly like one still draining; only the second needs no operator. A parked system stop's `next` is the destination of the dependency-loss stop (`"waiting"` or `"starting"`, `"gone"` for a child), kept current while it stays parked.
- `failed` carries the failure phase and message, and keeps `missingServiceIds` current (possibly empty) so an adapter can show whether `retry` would start the plugin or land in `waiting` ([ADR-BR-005](../decisions/005-failure-is-sticky.md)).
- `disabled` carries nothing beyond the common fields.
- `meta` adds `digest`. No variant carries configuration values, keys, fibers or raw causes.

`HostSnapshot` keeps `hostId`, `revision`, `availableServiceIds` and `realms`, and gains `auditDegraded: boolean`, `auditDropped: number` and `audit: "wired" | "unwired"` ([ADR-BR-030](../decisions/030-audit-sink-port.md), [ADR-BR-031](../decisions/031-audit-failure-policy.md)).

## Alternatives considered

- **Keep the flat record with optional fields.** Rejected: illegal combinations stay representable, and every consumer re-derives which fields are meaningful.
- **A class hierarchy per state.** Rejected: snapshots must be plain, immutable data that encodes and compares structurally; classes add identity and prototypes for no gain.
- **Separate collections per state in `HostSnapshot`.** Rejected: plugin order and the per-plugin feed (`PluginHandle.changes`) would need reassembly, and a transition would move an entry between collections.

## Consequences

**Positive**:

- Narrowing on `state` gives exactly the fields that are meaningful; illegal snapshots do not type-check.
- Adapters can explain `stopping`, tell a stop waiting for an operator from one still draining, and show the active build's digest.

**Negative**:

- The shape departs from SPEC.md's flat record; adapter sketches written against it (REACT-API.md, FOLDKIT-API.md) need revising.
- Consumers must switch on `state` rather than read fields directly.

**Trade-off accepted**: a slightly more demanding consumer API, in exchange for snapshots that cannot describe an impossible plugin.

**Amendments (2026-11-08)**:

- The discriminated union gains a `dormant` variant, `starting.loading` and failure phase "load" for lazy plugins ([ADR-BR-042](../decisions/042-lazy-activation.md)).
- A held handoff value never appears in a snapshot ([ADR-BR-049](../decisions/049-state-handoff-on-replace.md)).

**Amendments (2026-11-10)**:

- The union and the `StopReason` list in the Decision above are the ones first decided and are not kept current here: the current ones are in [04 — States and snapshots](../behaviors/04-states-and-snapshots.md), BEH-BR-027. Since then `stopping.next` has gained `"dormant"` ([ADR-BR-042](../decisions/042-lazy-activation.md)), `disabled` an optional `reason` "refused-digest" ([ADR-BR-053](../decisions/053-refusal-list.md)), and `StopReason` the members "idle" ([ADR-BR-050](../decisions/050-dormant-veto-and-hook-phases.md)) and "refused-digest" (ADR-BR-053) (CCR-BR-034).

## References

- Behaviours: [04 — States and snapshots](../behaviors/04-states-and-snapshots.md), [08 — Operation legality](../behaviors/08-operation-legality.md), [13 — Observability and diagnostics](../behaviors/13-observability-and-diagnostics.md)
- Invariants: [INV-BR-007](../invariants.md#inv-br-007-failure-is-sticky), [INV-BR-008](../invariants.md#inv-br-008-snapshot-revisions-never-regress), [INV-BR-013](../invariants.md#inv-br-013-configuration-values-are-never-observable), [INV-BR-019](../invariants.md#inv-br-019-optional-dependencies-never-gate-activation)
- Requirements: [URS-BR-004](../urs.md#urs-br-004-know-why-a-plugin-is-not-running), [URS-BR-028](../urs.md#urs-br-028-know-which-plugin-version-was-active-at-any-time)
- Decisions: [ADR-BR-005](../decisions/005-failure-is-sticky.md), [ADR-BR-007](../decisions/007-observation-primitives.md), [ADR-BR-030](../decisions/030-audit-sink-port.md), [ADR-BR-042](../decisions/042-lazy-activation.md), [ADR-BR-049](../decisions/049-state-handoff-on-replace.md)
- Source: `docs/SPEC.md` — "Host interface" (`HostSnapshot`, `PluginState`), "State and lifecycle"
- Amended by: [ADR-BR-042](./042-lazy-activation.md) — `dormant`, `next: "dormant"`, `starting.loading` and failure phase "load" (CCR-BR-017); [ADR-BR-050](./050-dormant-veto-and-hook-phases.md) — `StopReason` "idle" (CCR-BR-024); [ADR-BR-053](./053-refusal-list.md) — `disabled.reason` and `StopReason` "refused-digest" (CCR-BR-026, CCR-BR-034).
