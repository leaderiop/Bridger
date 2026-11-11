# ADR-BR-012: Operations record intent and are linearized per plugin

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ADR-012                                              |
> | Revision       | 0.5                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.5 (2026-11-11): Item 5: a join also requires equal `cold`, a different one failing `Conflict` with `reason` "cold-mismatch" (BEH-BR-072, BEH-BR-353) (CL12, CL1) (SPEC-AUDIT-08) (CCR-BR-040)<br>0.4 (2026-10-02): Interruption before intent by stage; one transition step and one operator operation per plugin; resumption of a parked operation records its own outcome; `WouldDeadlock` re-checked at the intent; second pass: the only waits before the intent, `resumes` link and `intent-ended` record, `concurrency` bounds builds only (CCR-BR-008)<br>0.3 (2026-10-02): Cross-plugin ordering delegated to ADR-BR-038 (CCR-BR-006)<br>0.2 (2026-10-02): Consistency fixes from independent review (CCR-BR-002)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001) |

---

## Context

A lifecycle operation is not instantaneous. `remove` stops dependents, drains leases and closes a scope; `replace` does that and then builds. While one is running, another caller may issue a second operation on the same plugin: an operator clicks twice, a reconcile and a manual action overlap, a dev adapter fires `restart` on every file save.

Without a rule, two transitions on one plugin can interleave: a second build starts while the first scope is still closing, or a `remove` completes while a `replace` publishes. And if the caller's fiber is interrupted mid-operation (a request timeout, a user cancelling), stopping the transition halfway leaves dependents stopped and a provider neither closed nor running.

## Decision

1. **Linearization.** Operations that name a plugin (`install`, `remove`, `replace`, `retry`, `reconfigure`, `restart`, `disable`, `enable`) are linearized per plugin (ID within its realm) in call order. A single plugin runs at most one *transition step* (one build, or one stop) at a time and has at most one operator operation in flight; a stop parked after `DrainTimeout` stays in flight but runs no step until resumed ([08 — Operation legality](../behaviors/08-operation-legality.md), BEH-BR-065, BEH-BR-074). Independent plugins proceed concurrently; `concurrency` bounds their builds only, and stops take no slot.
2. **Intent.** Each operation records its *intent* when it is called and passes the pre-checks of item 6 below. The transition then runs asynchronously in the reconciler; the caller waits for its outcome.
3. **Interruption stops the wait only — once the intent is recorded.** Interrupting the waiting caller after its intent is recorded does not cancel the transition. A caller that wants to undo it issues the opposite operation (for example a new `replace`, or `retry`). Before the intent, an interruption changes nothing and ends the call by the stage it reached (BEH-BR-067, BEH-BR-188): during steps 1–4 of BEH-BR-188, with no record; during step 5 while the gate decides, with the gate's `rejected` record ("caller-interrupted", BEH-BR-221); after its `requested` record is enqueued — including while it waits for its turn or for a running system stop (BEH-BR-073), the only waits before the intent — with a `failed` record whose `error._tag` is "Interrupted", written by the call's own interruption finalizer. A call that waits after its intent (for a running build on its target to settle, or for an operation it joined) is past its intent, and an interruption ends only its wait. The passage from the gate's approval to the enqueue of the `requested` record cannot be interrupted, so an approval is never consumed without a record, and the first terminal cause wins: a call interrupted while its `requested` record waits to be written ends "Interrupted", with no later `AuditUnavailable`.
4. **Across plugins.** How a stop that crosses plugins — a provider's stop that must stop its dependents — is ordered against operations on those dependents, and why no two transitions wait on each other, is decided in [ADR-BR-038](../decisions/038-cross-plugin-stop-ordering.md).
5. **Overlap outcomes.** An operation arriving while another is in flight *joins* it (both callers get the same result), *supersedes* it (the later wins; the earlier caller gets `Superseded`), or is refused with `Conflict { id, pending }`. Which applies to each pair is fixed by the total table of [ADR-BR-013](../decisions/013-total-operation-legality.md) and, for a join, by equal `cold`: a call whose cell is a join but whose `cold` differs fails with `Conflict { id, pending, reason: "cold-mismatch" }` (BEH-BR-072, BEH-BR-353).
6. **Where intent sits in a regulated call.** Intent is recorded at step 7 of the eight-step order of a mutating call fixed in [22 — Attributable operations](../behaviors/22-attributable-operations.md) (BEH-BR-188): only after the host-closed check, the attribution check, the audit-degraded latch check, validation, the `OperationGate` and the `requested` audit record (each when applicable) have passed ([ADR-BR-029](../decisions/029-attributable-mutations.md), [ADR-BR-031](../decisions/031-audit-failure-policy.md), [ADR-BR-032](../decisions/032-operation-gate.md)), and after the `WouldDeadlock` check that follows the `requested` record — run before the call waits for anything, and again at the linearization point immediately before the intent, where whether the call joins an operation in flight is first known. A call refused before that point has no intent and changes nothing; one refused after its `requested` record (`WouldDeadlock`, or validation that fails when repeated at the intent) ends with a `failed` terminal record. A call whose intent was recorded ends in exactly one terminal audit record: `completed`, `failed`, `superseded` or `joined`; a joined call's record links to the call it joined. A call that joins or supersedes a parked operation resumes it instead, owns it, and writes its own `completed` or `failed` record, never `joined` or `superseded`, with `resumes` naming the parked call's `requested` record; the parked call, already answered, writes nothing more (BEH-BR-074). A parked intent that a cascade or shutdown ends writes no terminal record for any call: its end is the `intent-ended` system record (BEH-BR-080).

## Alternatives considered

- **One host-wide lock for all operations.** Rejected: unrelated plugins would queue behind a slow drain, and `concurrency` would be meaningless.
- **Cancelling the transition when the caller is interrupted.** Rejected: it leaves half-done transitions (dependents stopped, provider open), and a request timeout would become a lifecycle decision.
- **Last-writer-wins without telling the earlier caller.** Rejected: the earlier caller would believe its operation took effect.
- **Strict FIFO without joins.** Rejected: two `remove`s would run twice (the second failing with `UnknownPlugin`), and repeated `restart`s from a file-watcher would rebuild once per save.

## Consequences

**Positive**:

- No two transitions on one plugin interleave, so there is never a stale publication or a double close.
- A caller's timeout or interruption cannot leave a plugin half-stopped.
- Each call that passed its `requested` record has exactly one recorded outcome, whether it was interrupted before its intent or not.

**Negative**:

- Callers must handle `Superseded` and `Conflict` as normal outcomes.
- "I interrupted the call but it still happened" surprises users who expect cancellation; the documentation must say so plainly.

**Trade-off accepted**: callers handle join, supersede and conflict outcomes, and interruption is not cancellation, in exchange for transitions that always complete coherently and a single recorded outcome per call.

## References

- Behaviours: [08 — Operation legality](../behaviors/08-operation-legality.md), [05 — Activation](../behaviors/05-activation.md), [22 — Attributable operations](../behaviors/22-attributable-operations.md), [23 — Audit sink and record](../behaviors/23-audit-sink-and-record.md)
- Invariants: [INV-BR-009](../invariants.md#inv-br-009-at-most-one-transition-in-flight-per-plugin), [INV-BR-010](../invariants.md#inv-br-010-intent-survives-caller-interruption), [INV-BR-022](../invariants.md#inv-br-022-one-requested-and-one-terminal-record-per-mutating-call), [INV-BR-027](../invariants.md#inv-br-027-a-refused-or-unauditable-mutation-changes-nothing)
- Risks: [RSK-BR-019](../gxp/03-risk-assessment.md#rsk-br-019)
- Decisions: [ADR-BR-038](../decisions/038-cross-plugin-stop-ordering.md), [ADR-BR-013](../decisions/013-total-operation-legality.md), [ADR-BR-029](../decisions/029-attributable-mutations.md), [ADR-BR-031](../decisions/031-audit-failure-policy.md), [ADR-BR-032](../decisions/032-operation-gate.md)
- Source: `docs/SPEC.md` — "Operation semantics and races", "State and lifecycle", "Concurrency and scheduling"
