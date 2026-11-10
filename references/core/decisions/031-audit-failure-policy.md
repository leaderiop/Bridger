# ADR-BR-031: Audit failure fails closed and latches

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ADR-031                                              |
> | Revision       | 0.3                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.3 (2026-11-10): The latch triggers name a running `reconcile`'s parent terminal record lost at shutdown (BEH-BR-108) (C4) (CCR-BR-036)<br>0.2 (2026-10-02): Consistency fixes from independent review (CCR-BR-002)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001) |

---

## Context

With an `AuditSink` wired ([ADR-BR-030](../decisions/030-audit-sink-port.md)), every mutating call writes a `requested` record before it changes anything and a terminal record after its transition settles. The sink is the consumer's code talking to the consumer's store, and it will sometimes fail or hang. The policy for that case decides whether the trail can be trusted: a policy that lets changes proceed when the sink fails produces exactly the undetected gap the trail exists to prevent.

The two writes differ in one essential way. When the `requested` record fails, nothing has happened yet, so refusing the operation loses nothing. When the terminal record fails, the transition has already run: a plugin has stopped, a build has published or failed, external effects may have been emitted. It cannot be undone ([ADR-BR-004](../decisions/004-replace-is-stop-then-start.md)). The same holds for the records of system transitions, which have no caller at all.

## Decision

- **One writer, retrying in place.** Each host has a single audit writer that hands records to the sink one at a time, in creation order. Records waiting behind it are held in a bounded in-memory queue of at most **1024** records. A failed attempt (`AuditWriteFailed`, a defect, or an attempt not completed within `auditTimeout`) is retried *in place* — the same record, same `recordId` and `auditSeq` — on a `Clock` schedule starting at 100 ms and doubling, before any other record is handed over ([23 — Audit sink and record](../behaviors/23-audit-sink-and-record.md), BEH-BR-202). A sink that refuses once therefore costs a retry, not an operator's change.
- **Fail closed on the requested record.** If the `requested` record has not been written within `BridgerOptions.auditTimeout` (default **10 seconds**), measured from when it was queued, the call fails with `AuditUnavailable { operation, message }` and nothing changes: no intent is recorded and no transition runs. The unwritten record stays in the writer and is retried; when it is eventually written, the host follows it with a `failed` terminal record carrying `AuditUnavailable`, so the trail shows a request that did nothing rather than an orphan (BEH-BR-203).
- **Latch.** The host sets the latch — `HostSnapshot.auditDegraded` becomes `true` and the event `audit-degraded` is emitted on `Host.events` — when any of these happens: a terminal record (`completed`, `failed`, `superseded`, `joined`), a `rejected` record or a `system` record is not written within `auditTimeout`; `shutdown`'s `requested` record is not written; a record is dropped because the writer queue is full; or a running `reconcile`'s parent terminal record is lost because shutdown's wait for it ended without it ([12 — Shutdown and hosting](../behaviors/12-shutdown-and-hosting.md), BEH-BR-108) (BEH-BR-205; CCR-BR-036). The change being recorded is not reversed; it already happened. A dropped record is never numbered, so it leaves no gap in `auditSeq`; it is logged at error level, counted in `HostSnapshot.auditDropped`, and reported as `droppedSinceAck` on the acknowledgement that follows.
- **While latched, operator mutations are refused.** Every mutating call fails with `AuditUnavailable` at the latch check, before the gate and before any record, except `shutdown` and `acknowledgeAuditDegraded`. System transitions are not blocked (a runtime failure cannot be refused); their records are still attempted.
- **Clearing the latch is an attributed, audited act.** `Host.acknowledgeAuditDegraded({ context })` requires an actor and **always** requires a reason, regardless of `attribution.requireReason`. It writes its own `requested` and terminal records like any operation; if the sink still fails, the acknowledgement fails with `AuditUnavailable` and the latch stays. Its `requested` record is queued behind every record still waiting in the writer, so the latch clears only once those have been written too ([23 — Audit sink and record](../behaviors/23-audit-sink-and-record.md), BEH-BR-206); on success the event `audit-acknowledged` is emitted. The trail therefore contains, in sequence, the records that were late, followed by an attributed acknowledgement that states why and, in `droppedSinceAck`, how many records were dropped.
- **`shutdown` is never blocked by audit.** It is exempt from the latch and is not gated. Its `requested` record is attempted; if that write fails, shutdown proceeds anyway, the latch is set, and `CloseReport.auditDegraded` is `true`. Stopping is the safe direction; refusing to stop a host because its trail is unavailable would keep plugins running that nobody can now account for. Closing the host's scope performs the same shutdown, attributed to `Actor.system` ([12 — Shutdown and hosting](../behaviors/12-shutdown-and-hosting.md), [23 — Audit sink and record](../behaviors/23-audit-sink-and-record.md)).
- **Why 10 seconds.** It allows a remote store a round trip with a retry, stays well below `drainTimeout` (30 s) and `buildTimeout` (60 s) so the audit bound never dominates an operation, and is configurable. A sink that needs longer should buffer locally with its own durability rather than hold the host.

## Alternatives considered

- **Best effort** (log the failure and continue, as Qadi's decision sink does). Rejected: changes land unrecorded, the gap is visible only in a log line, and the trail no longer records every operator action (Part 11 §11.10(e)). For a decision sink whose failure must not change a decision this is right; for a change-control trail it is the failure mode.
- **Fail closed on the request only, no latch.** Rejected: a sink that fails intermittently produces `requested` records with no outcome while later operations succeed, and nobody is told. The latch converts an invisible gap into a stopped host that a named person must acknowledge, with a reason, in the trail itself.
- **Undo the transition when its terminal record fails.** Rejected: there is no rollback over external effects; an "undo" would be a second transition with its own failures and its own records.
- **Skip the record and continue.** Rejected: moving on past a record that could not be written, and handing its number to the next, would turn a sink hiccup into a silent hole in the trail and let a number belong to two records. The writer retries the same record in place instead, and a record that stays unwritten sets the latch.
- **No timeout.** Rejected: a hung sink would hold every mutation indefinitely and, through drains, the host.

## Consequences

**Positive**:

- No operator change proceeds unless its request is recorded; while the host runs, no recording failure after the fact goes unnoticed or unacknowledged.
- The gap a terminal failure leaves is itself documented in the trail by an attributed acknowledgement.

**Negative**:

- A sink outage stops operator changes host-wide until the sink recovers and someone acknowledges. This is intended, and it is an availability cost.
- A write that times out may still have landed in the store. The operation was refused, yet the store may hold its `requested` record. A retried write reuses the same `recordId` and `auditSeq`, and an `AuditSink` must treat a write with an already-stored `recordId` as idempotent (a consumer and companion obligation, [ADR-BR-037](../decisions/037-audit-sequence-separate-from-event-seq.md)); a sink that does not will hold a duplicate, which `verifyAuditSequence` reports.
- Each mutation waits for a sink round trip, bounded by `auditTimeout`.
- Records waiting in the writer queue live only in process memory. If the process dies abruptly they are lost, and no library running inside that process can prevent it; the core keeps no copy beyond the hand-over ([ADR-BR-030](../decisions/030-audit-sink-port.md)). A queue overflow during a long sink outage also drops records; that loss is latched and counted, but it is a loss.

**Trade-off accepted**: availability of operator changes is sacrificed during an audit outage, in exchange for a trail in which every loss the running host can detect is either prevented or acknowledged by a named person.

## References

- Behaviours: [23 — Audit sink and record](../behaviors/23-audit-sink-and-record.md), [22 — Attributable operations](../behaviors/22-attributable-operations.md), [12 — Shutdown and hosting](../behaviors/12-shutdown-and-hosting.md)
- Invariants: [INV-BR-027](../invariants.md#inv-br-027-a-refused-or-unauditable-mutation-changes-nothing), [INV-BR-029](../invariants.md#inv-br-029-the-audit-degraded-latch-blocks-operator-mutations), [INV-BR-022](../invariants.md#inv-br-022-one-requested-and-one-terminal-record-per-mutating-call)
- Requirements: [URS-BR-023](../urs.md#urs-br-023-prevent-a-change-that-cannot-be-recorded)
- Risks: [RSK-BR-004](../gxp/03-risk-assessment.md#rsk-br-004), [RSK-BR-006](../gxp/03-risk-assessment.md#rsk-br-006), [RSK-BR-020](../gxp/03-risk-assessment.md#rsk-br-020)
- Decisions: [ADR-BR-004](../decisions/004-replace-is-stop-then-start.md), [ADR-BR-029](../decisions/029-attributable-mutations.md), [ADR-BR-030](../decisions/030-audit-sink-port.md), [ADR-BR-037](../decisions/037-audit-sequence-separate-from-event-seq.md)
- GxP documents: [../gxp/03-risk-assessment.md](../gxp/03-risk-assessment.md)
- Precedent: Qadi ADR-QD-044, *An optional decision sink* (contrasting policy; cited by name).
- External: 21 CFR Part 11 §11.10(e); EU GMP Annex 11 (2011) §9, §12.4.
