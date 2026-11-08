# ADR-CM-007: A batch is admitted whole and undone by compensation

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-CM-ADR-007                                           |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.2 (2026-11-08): Admission in three phases; compensations bound into the batch approval; receipts of undone items voided; `long` items refused in a batch; task records through `CommandTaskStore`; the consequences no longer over-claim (round-2 agent review A-01, A-02, A-03, A-08, A-09, A-15) (CCR-CM-003)<br>0.1 (2026-11-08): Initial draft (CCR-CM-003)                 |

---

## Context

Core drafts hold one or more requests, applied together or not at all by the
consumer ([BEH-BR-316](../../core/behaviors/32-generic-gate-and-plan.md)), but
revision 0.3 of dispatch and the agent companion applied exactly one request
per draft (recheck §8 X6). An agent's plan of several edits, or an operator's
bulk change, was approved one command at a time, and nothing stopped half of
a plan from running. The recheck also asked for long commands with progress
and a wait (§5 item 7) and for typed compensation metadata (item 3).

The package cannot make handlers atomic: they write to stores it does not
control. Core met the same limit for host changes and answered it with an
atomic apply that runs in order, undoes in reverse and reports what it could
not undo ([BEH-BR-322](../../core/behaviors/32-generic-gate-and-plan.md)–BEH-BR-324).

## Decision

- **Admission is whole.** `Commands.batch` runs steps 1–6 for every item
  before any handler, in three phases — gate and floor for all, then hooks
  for all, then receipt claims and breakers for all — so that a rejected,
  vetoed or deferred batch holds no claim; a rejection rejects the batch, a
  deferral defers it as one draft; a `long` item is refused (BEH-CM-049).
- **Execution is ordered, undo is compensation.** Items run in order; at the
  first failure, an atomic batch wrapper (one transaction) undoes everything,
  or else each succeeded item's `compensatedBy` command is dispatched in
  reverse; the result is `CommandBatchRolledBack` or `CommandBatchPartial`,
  never retried; the receipts of undone items are voided, and a replayed
  item is never compensated (BEH-CM-050).
- **Approval is all or none.** A batch draft binds every item's digest and
  input digest and its planned compensation's digest, as core's plan binds
  `undo` (BEH-BR-325); its expected versions are checked with core
  `Draft.check` before any gate; a stale draft is refused with
  `CommandDraftStale` for the proposer to re-plan. The compensations of an
  approved batch carry an `ApprovalRef` derived from its approval, so the
  undo of a tainted batch has an approval path (BEH-CM-051).
- **Long work is a task.** A command made with `long: true`, or any command
  started with `Commands.start`, returns a handle after admission and runs in
  the catalog's scope, with progress, `CommandTasks.await` and cancel
  (BEH-CM-052, BEH-CM-053). Its record is kept through a `CommandTaskStore`
  port, in memory by default; a task cut off by a restart is reported
  `failed` with `TaskLost`, never resumed (BEH-CM-054).

## Alternatives considered

- **One gate call per batch with a batch request type.** Rejected: it would
  need a second gate port, and a gate written for single commands would not
  see the items of a batch. Items are judged one by one and carry
  `batch` so the gate knows they belong together.
- **Claim atomicity.** Rejected by the honest-claims rule: without the
  application's transaction, a crash between two handlers leaves the first
  done; the package reports such a batch as partial.
- **Tasks only for agent runs.** Rejected: a long import started from a UI
  needs the same handle and wait as an agent run, and herdr's `wait` should
  observe both.

## Consequences

**Positive**:

- A plan is approved as one and admitted as one, or not at all, and a moved
  state is detected before anything runs. Its effects are undone only by an
  atomic batch wrapper or by compensations, and what was not undone is
  reported (BEH-CM-050).
- Compensations are commands: gated, hooked, logged and idempotent.

**Negative**:

- A batch without an atomic wrapper or compensations can end partial; the
  report says so.
- A task's work does not survive the process; with a persistent
  `CommandTaskStore` its record does, and a cut-off task is reported lost.

**Trade-off accepted**: admission is fixed by the package; effects are
all-or-nothing as far as the application's transaction or compensations make
them, and the remainder is reported.

## References

- Behaviours: [07 — Batches and long commands](../behaviors/07-batches-and-long-commands.md)
- Invariants: [INV-CM-008](../invariants.md#inv-cm-008-no-handler-of-a-batch-runs-before-every-item-is-admitted)
- Core: [32 — Generic gate and plan](../../core/behaviors/32-generic-gate-and-plan.md)
- Companion: [`@bridger/agent` tasks](../../agent/behaviors/02-tasks.md)
- Source: Bridger recheck of 2026-11-08, §5 items 3, 5 and 7; §8 X6.
