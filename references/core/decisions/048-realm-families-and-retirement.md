# ADR-BR-048: Realm families, ephemeral realms and realm retirement

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ADR-048                                              |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed — amends ADR-BR-019                                 |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.2 (2026-11-08): eviction through `reconcile` with `pruneDrain`/`pruneForce`; per-realm turn for retirement; family events on the family's own stream (CCR-BR-022)<br>0.1 (2026-11-08): Initial draft (CCR-BR-019) |

---

## Context

Realms run the same plugin once per resolution namespace and live as long as their host ([ADR-BR-019](./019-realms-are-resolution-namespaces.md)). Two needs do not fit that:

- A realm **per key**, for keys learnt at run time (a customer organisation, a workspace), most of them idle at any moment. Creating every realm at start-up wastes memory; creating them by hand repeats the same code in every application, usually without a drain on eviction.
- A realm **per task**, such as a sub-agent with its own tools, that must disappear when the task ends, together with an attribution that shows the task acted on someone's behalf.

Both need a realm to be given back. With realms immortal, every ephemeral realm, and every family key ever seen, leaves an entry in `HostSnapshot.realms` for the life of the host (NFR-BR-007).

The review warned that core must never offer a "tenant" option that would read as isolation.

## Decision

- **`Realm.family(host, { id, realm, plugins, context, idleEvict })`**, a helper outside `Host`. On first use of a key it calls `defineRealm(${id}/${key})` and `reconcile(plugins(key), { scope: family:${id}/${key} })` under the family's `OperationContext`, so every change is attributed, gated and audited. Creation is lazy and serialized per key.
- **Idle eviction only through lease drain.** An idle member is evicted by `reconcile([], { scope, pruneDrain, pruneForce: false })` — a bounded drain, never forced (BEH-BR-155). Retirement and registrations into a realm are serialised on a per-realm turn (BEH-BR-335). Eviction outcomes go on the family's own `events` stream, never on `Host.events`. A `DrainTimeout` abandons the eviction, which is re-issued later. The family's scope close is the one path that forces at the limit, as a generation's scope close does.
- **A failed member is not recreated by itself.** Recreating it would re-run its build without an operator ([ADR-BR-005](./005-failure-is-sticky.md)); `family.reset(key, { context })` is the explicit path.
- **`Host.retireRealm(id)`**, a new mutating operation (`Operation` gains `"retireRealm"`). It retires a realm only when no plugin in any state is installed in it, never `"default"`, and never stops, removes or revokes anything. A retired id may be defined again. This amends ADR-BR-019's "realms live as long as the host" for empty realms only.
- **`Realm.ephemeral(host, { realm, plugins, context })`**, bound to a scope. It defines, installs and activates; at scope close it prunes (drain, then force at the limit, reported) and retires.
- **`Actor.narrow(parent, segment)`** returns `{ id: parent.id + "/" + segment, kind: "service" }`. It is a pure function the caller invokes, and it confers and restricts nothing. The parent stays recognisable at every depth: `Actor.isWithin(actor, ancestor)` is offered for a consumer's gate, for example to refuse an approval given by an agent or any narrowing of it. Core itself never parses an actor id. Restriction is the consumer's gate or capability policy.
- **Vocabulary.** No "tenant", "tenancy", "isolation" or "sandbox" in names, types, errors, events or documentation of families. Members are realms and are subject to BEH-BR-150.

## Alternatives considered

- **A `tenant` option on `install` or `defineRealm`.** Rejected: it would read as data separation, which a realm cannot provide ([RSK-BR-013](../gxp/03-risk-assessment.md#rsk-br-013)).
- **Realm removal that removes the plugins in it.** Rejected: it would be a second removal path with its own ordering and drain rules. Retirement of an empty realm adds no lifecycle.
- **Keep realms immortal and let families reuse them.** Rejected for ephemeral realms, whose ids never repeat; acceptable for families, which still retire so that a churning key set is bounded.
- **Forced eviction at the drain limit.** Rejected: idleness is a guess, and a guess must not interrupt a call.
- **A host-internal family primitive.** Rejected: a helper over public operations keeps every change reviewable and leaves the `Host` interface one operation larger, not a subsystem larger.
- **A parent-actor field on `Actor`.** Rejected: `Actor` stays a plain three-field value ([ADR-BR-029](./029-attributable-mutations.md)); the id carries the chain for a reviewer to read.

## Consequences

**Positive**:

- Per-key and per-task plugin sets with no hand-written lifecycle code, and no realm left behind.
- Evictions are ordinary, recorded removals that never cut off a call.

**Negative**:

- `Operation` gains a value, which every consumer of the audit record must accept; on the pre-release ground of BEH-BR-195 `schemaVersion` stays 1.
- An eviction can stall behind a long lease and leave a member parked until the next attempt.
- Actor ids of narrowed actors contain "/", which a consumer's id scheme must allow.

**Trade-off accepted**: one new host operation and an exception to "core does not derive an actor", in exchange for bounded realm bookkeeping and attributable delegated work, without any isolation claim.

## References

- Behaviours: [33 — Realm families](../behaviors/33-realm-families.md), [17 — Realms and interception](../behaviors/17-realms-and-interception.md), [18 — Reconciliation and confluence](../behaviors/18-reconciliation-and-confluence.md), [22 — Attributable operations](../behaviors/22-attributable-operations.md)
- Invariants: [INV-BR-044](../invariants.md#inv-br-044-a-realm-is-retired-only-when-empty-and-eviction-never-forces), [INV-BR-020](../invariants.md#inv-br-020-a-realm-changes-resolution-only), [INV-BR-007](../invariants.md#inv-br-007-failure-is-sticky)
- Requirements: [URS-BR-038](../urs.md#urs-br-038-create-a-plugin-set-per-key-on-demand-and-reclaim-it-when-idle), [URS-BR-039](../urs.md#urs-br-039-run-a-short-lived-plugin-set-for-delegated-work)
- Risks: [RSK-BR-034](../gxp/03-risk-assessment.md#rsk-br-034), [RSK-BR-013](../gxp/03-risk-assessment.md#rsk-br-013), [RSK-BR-005](../gxp/03-risk-assessment.md#rsk-br-005)
- Decisions: [ADR-BR-005](./005-failure-is-sticky.md), [ADR-BR-019](./019-realms-are-resolution-namespaces.md) (amended for retirement of empty realms), [ADR-BR-023](./023-desired-state-reconcile.md), [ADR-BR-027](./027-core-exclusions.md), [ADR-BR-029](./029-attributable-mutations.md)
- Source: architecture review of 2026-11-08 (gap analysis), §5 items 12 (ephemeral realm, narrowed actor) and 14. No SPEC.md section.
