# ADR-BR-012: Operations record intent and are linearized per plugin

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ADR-012                                              |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.2 (2026-10-02): Consistency fixes from independent review (CCR-BR-002)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001) |

---

## Context

A lifecycle operation is not instantaneous. `remove` stops dependents, drains leases and closes a scope; `replace` does that and then builds. While one is running, another caller may issue a second operation on the same plugin: an operator clicks twice, a reconcile and a manual action overlap, a dev adapter fires `restart` on every file save.

Without a rule, two transitions on one plugin can interleave: a second build starts while the first scope is still closing, or a `remove` completes while a `replace` publishes. And if the caller's fiber is interrupted mid-operation (a request timeout, a user cancelling), stopping the transition halfway leaves dependents stopped and a provider neither closed nor running.

## Decision

1. **Linearization.** Operations that name a plugin (`install`, `remove`, `replace`, `retry`, `reconfigure`, `restart`, `disable`, `enable`) are linearized per plugin (ID within its realm) in call order. A single plugin has at most one transition in flight; independent plugins proceed concurrently within `concurrency`.
2. **Intent.** Each operation records its *intent* when it is called and passes the pre-checks of step 5 below. The transition then runs asynchronously in the reconciler; the caller waits for its outcome.
3. **Interruption stops the wait only.** Interrupting the waiting caller does not cancel the transition. A caller that wants to undo it issues the opposite operation (for example a new `replace`, or `retry`).
4. **Overlap outcomes.** An operation arriving while another is in flight *joins* it (both callers get the same result), *supersedes* it (the later wins; the earlier caller gets `Superseded`), or is refused with `Conflict { id, pending }`. Which applies to each pair is fixed by the total table of [ADR-BR-013](../decisions/013-total-operation-legality.md).
5. **Where intent sits in a regulated call.** Intent is recorded at step 7 of the eight-step order of a mutating call fixed in [22 — Attributable operations](../behaviors/22-attributable-operations.md) (BEH-BR-188): only after the host-closed check, the attribution check, the audit-degraded latch check, validation, the `OperationGate` and the `requested` audit record (each when applicable) have passed ([ADR-BR-029](../decisions/029-attributable-mutations.md), [ADR-BR-031](../decisions/031-audit-failure-policy.md), [ADR-BR-032](../decisions/032-operation-gate.md)), and after the `WouldDeadlock` check that follows the `requested` record. A call refused before that point has no intent and changes nothing; one refused after its `requested` record (`WouldDeadlock`, or validation that fails when repeated at the intent) ends with a `failed` terminal record. A call whose intent was recorded ends in exactly one terminal audit record: `completed`, `failed`, `superseded` or `joined`; a joined call's record links to the call it joined.

## Alternatives considered

- **One host-wide lock for all operations.** Rejected: unrelated plugins would queue behind a slow drain, and `concurrency` would be meaningless.
- **Cancelling the transition when the caller is interrupted.** Rejected: it leaves half-done transitions (dependents stopped, provider open), and a request timeout would become a lifecycle decision.
- **Last-writer-wins without telling the earlier caller.** Rejected: the earlier caller would believe its operation took effect.
- **Strict FIFO without joins.** Rejected: two `remove`s would run twice (the second failing with `UnknownPlugin`), and repeated `restart`s from a file-watcher would rebuild once per save.

## Consequences

**Positive**:

- No two transitions on one plugin interleave, so there is never a stale publication or a double close.
- A caller's timeout or interruption cannot leave a plugin half-stopped.
- Each call whose intent was recorded has exactly one recorded outcome.

**Negative**:

- Callers must handle `Superseded` and `Conflict` as normal outcomes.
- "I interrupted the call but it still happened" surprises users who expect cancellation; the documentation must say so plainly.

**Trade-off accepted**: callers handle join, supersede and conflict outcomes, and interruption is not cancellation, in exchange for transitions that always complete coherently and a single recorded outcome per call.

## References

- Behaviours: [08 — Operation legality](../behaviors/08-operation-legality.md), [05 — Activation](../behaviors/05-activation.md), [22 — Attributable operations](../behaviors/22-attributable-operations.md), [23 — Audit sink and record](../behaviors/23-audit-sink-and-record.md)
- Invariants: [INV-BR-009](../invariants.md#inv-br-009-at-most-one-transition-in-flight-per-plugin), [INV-BR-010](../invariants.md#inv-br-010-intent-survives-caller-interruption), [INV-BR-022](../invariants.md#inv-br-022-one-requested-and-one-terminal-record-per-mutating-call), [INV-BR-027](../invariants.md#inv-br-027-a-refused-or-unauditable-mutation-changes-nothing)
- Risks: [RSK-BR-019](../gxp/03-risk-assessment.md#rsk-br-019)
- Decisions: [ADR-BR-013](../decisions/013-total-operation-legality.md), [ADR-BR-029](../decisions/029-attributable-mutations.md), [ADR-BR-031](../decisions/031-audit-failure-policy.md), [ADR-BR-032](../decisions/032-operation-gate.md)
- Source: `docs/SPEC.md` — "Operation semantics and races", "State and lifecycle", "Concurrency and scheduling"
