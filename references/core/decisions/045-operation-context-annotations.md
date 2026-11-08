# ADR-BR-045: An extensible, typed annotation bag on OperationContext

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ADR-045                                              |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.2 (2026-11-08): flow "wire" and `Annotations.decode` for host boundaries (`Deadline` never crosses); `CallerContext` for served calls; a deadline shortens only a given per-call timeout of `use`/`useAll` (CCR-BR-022)<br>0.1 (2026-11-08): Initial draft (CCR-BR-018) |

---

## Context

Companions need to carry labels along a chain of work — taint and provenance for agent runtimes, a deadline for a request, site or tenant labels for an application — and need them to reach the gate, the call log, the audit trail and event listeners in one shape. Private fiber references per companion would reach none of these. Core must not interpret domain labels, and nothing derived from configuration may reach the trail ([ADR-BR-033](./033-no-config-values-in-audit.md)).

## Decision

- **Typed keys declared by their owner**, each with a schema, a mandatory `combine`, a `monotonic` flag and a fixed list of flows: `events`, `gate`, `policy`, `callLog`, `audit`, `wire`. Core carries a key only along its declared flows; `wire` decides what a companion may send to another host or process, as `Annotations.encode` entries rebuilt by `Annotations.decode` and combined into the receiver's bag (BEH-BR-296).
- **One immutable bag**, on `OperationContext.annotations` for host mutations and ambient in `@bridger/core/CurrentAnnotations` for everything else.
- **Three core keys**: `Deadline` (earlier wins; the only one core reads, to shorten the per-call timeout of `use`/`useAll` when one is given, the gate and the capability policy — never audit, drain, build or shutdown bounds; never sent across a host boundary), `Taint` (union) and `Provenance` (append, bounded), both carried but never interpreted.
- **Propagation** follows the rule of BEH-BR-187: inherited through service calls, emptied at every entry point of plugin code, filtered to "events" keys across the bus, filtered per flow into gate and policy requests. A supplied context cannot remove a monotonic key. Code served on behalf of an invoker with a captured context (a registry handler) runs inside `CallerContext.serve`, which carries the invoker's actor and annotations and leaves the principal alone (BEH-BR-292).
- **Audit**: "audit" keys, encoded and sorted, on the `requested`, `rejected` and terminal records of the call; values that fail to encode, contain a `Redacted`, or exceed 16 entries or 4096 bytes are omitted and named. System records carry none.

## Alternatives considered

- **Free-form string map.** Rejected: no type, no combining rule, no per-key decision about what may reach the trail.
- **Per-call choice of flows.** Rejected: whether a label may reach the trail is a property of the label, to be reviewed once where it is defined.
- **Core enforcement on taint.** Rejected: the meaning of a taint is the companion's; core refusing calls on labels it does not understand would be a policy nobody chose.
- **Carry annotations into plugin builds.** Rejected for the reason BEH-BR-187 resets the actor: an operator call's labels would leak into work done hours later.

## Consequences

**Positive**:

- Companions interoperate on taint, provenance and deadline without depending on each other.
- The trail can show the labels of the call behind a change.

**Negative**:

- Monotonicity holds only through the API; in-process code can start from an empty bag.
- Each record may grow by up to 4096 bytes.

**Trade-off accepted**: labels carried faithfully and bounded, with enforcement left to the companions that understand them.

## References

- Behaviours: [30 — Operation context annotations](../behaviors/30-operation-context-annotations.md), [22 — Attributable operations](../behaviors/22-attributable-operations.md), [23 — Audit sink and record](../behaviors/23-audit-sink-and-record.md), [16 — Event bus](../behaviors/16-event-bus.md)
- Invariants: [INV-BR-039](../invariants.md#inv-br-039-annotations-reach-records-only-through-declared-flows), [INV-BR-028](../invariants.md#inv-br-028-audit-records-carry-no-configuration-values)
- Requirements: [URS-BR-035](../urs.md#urs-br-035-carry-labels-such-as-taint-provenance-and-deadline-across-calls)
- Risks: [RSK-BR-031](../gxp/03-risk-assessment.md#rsk-br-031)
- Decisions: [ADR-BR-029](./029-attributable-mutations.md), [ADR-BR-033](./033-no-config-values-in-audit.md), [ADR-BR-044](./044-capability-policy-and-call-log-ports.md)
