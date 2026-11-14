# ADR-CM-006: Receipts, handler wrappers and breakers are fixed in the catalog layer

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-CM-ADR-006                                           |
> | Revision       | 0.4                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.4 (2026-11-11): Port calls and handler wrappers receive the caller services of one dispatch (`DispatchOptions.services`); the `receiptContext` alternative recorded as rejected (SPEC-AUDIT-09, third pass) (CCR-CM-011)<br>0.3 (2026-11-09): Admission policies fixed in the layer, consulted at step 6 and settled after step 7 (C-10); receipts scoped by an application partition, port calls given explicit `services`, `retryable` typed errors never stored (M-04, ERP alignment); alternatives for admissions recorded (CCR-CM-004)<br>0.2 (2026-11-08): Receipts carry the dispatch digest and a task id and are compared actor first; `void` for undone batch items; failures completed outside the wrappers, claims expire (round-2 agent review A-02, A-04, A-09, A-10, A-14) (CCR-CM-003)<br>0.1 (2026-11-08): Initial draft (CCR-CM-003)                 |

---

## Context

The recheck of 2026-11-08 found that every caller of the command catalog
retries — agents, MCP clients, HTTP clients, job runners — and that revision
0.3 of dispatch had no idempotency key (recheck §5 item 1). It also found that
a product which wants one path for every state change needs that path to
carry the same transaction, business audit row and outbox message whoever
calls, so that a UI gateway, an HTTP API and jobs are adapters over one
`Commands.dispatch` (item 4), and that the only circuit breaker in view was
core's, on hook contributions (item 10).

Each of these could be left to every adapter. Then each adapter would
implement them slightly differently, and the one an auditor reads would not
be the one that ran — the argument [ADR-CM-002](./002-catalog-not-rules.md)
makes for the gate.

## Decision

- **Idempotency is a key on the dispatch and a receipts port.** A key reaches
  the request, the handler context and core's call log (as an annotation of
  flow "callLog"); the application's `CommandReceipts` port stores
  `(partition, command, key) → (actor, inputDigest, digest, taskId?,
  outcome)`, the partition computed by the application from the request.
  Every port call receives its context explicitly (`services`), built
  from the caller services the dispatch is given (`DispatchOptions.services`),
  so a receipt joins a transaction only through a transaction it is handed; a
  typed error the command lists as `retryable` is never stored. The
  claim is made after the gate and the hooks; a success is completed
  innermost in the handler wrappers, a typed failure after them; a claim
  that does not end with its completed outcome is released, and an
  in-flight claim expires after the dispatch timeout and a grace. Another
  actor, input, definition digest or mode under a key is
  `IdempotencyConflict`, the actor compared first; a repeated task returns
  its handle; a receipt whose effect a batch undid is voided (BEH-CM-041,
  BEH-CM-050).
- **Handler wrappers are fixed when the layer is built.** An ordered list,
  outermost first, around the handler, the output encoding and the receipt
  completion; no plugin can change it (BEH-CM-042). Each wrapper receives
  the caller services as an argument, so a transaction wrapper joins the
  caller's transaction only when the call passed one and opens its own
  otherwise. Batches have their own list (BEH-CM-050).
- **A breaker per command or provider**, off by default, with core's hook
  breaker semantics, answering at step 6 with `CommandBreakerOpen`
  (BEH-CM-043).
- **Admission policies are fixed when the layer is built.** An ordered list
  consulted at step 6 after the claim and the breaker; each admits with a
  settlement or refuses with `CommandRefused`, and every admission that
  admitted is settled once after step 7, outside the wrappers (BEH-CM-044).
  A per-command budget of the entitlement companion is one such policy.

## Alternatives considered

- **Receipt lookup before the gate.** Rejected: a repeat would return an
  outcome without the gate seeing the request, so a revoked permission or a
  newly tainted session would not stop it.
- **Receipts as an ordinary wrapper.** Rejected as the only form: the
  package must answer a replay before step 7 and must know the claim to
  release it; the port gives that, and an application that wants receipts in
  its transaction implements the port over it.
- **Budgets in the gate.** Rejected: a gate decides allow, refuse or defer
  and has no step after the handler, so a reservation could not be
  committed or released by outcome.
- **Budgets as a handler wrapper.** Rejected: a wrapper's failure is
  `CommandWrapperFailed`, which a breaker may count, and a wrapper runs
  inside the application's transaction, so a rollback would undo the
  settlement.
- **A fiber-bound transaction found by the port.** Rejected: the port would
  join whatever transaction encloses the dispatch, including one the
  application did not mean to share; explicit `services` name it.
- **A catalog-wide list of keys read from the dispatching fiber**
  (`receiptContext`, added by CCR-CM-004 and withdrawn by CCR-CM-011), with a transaction wrapper
  that joins whatever transaction it finds in that fiber. Rejected: whether
  a dispatch joins a transaction was then decided by what happened to be in
  the environment — a handler's nested dispatch joined the handler's
  transaction without saying so. The caller now passes the services of one
  dispatch in `DispatchOptions.services`, and nothing reads the fiber to
  decide.
- **Breakers in core.** Not needed: core's breaker belongs to a hook point
  ([BEH-BR-310](../../core/behaviors/31-hook-points.md)); a command breaker is
  state about a command, which this package owns.

## Consequences

**Positive**:

- One place recognises retries, encloses handlers and fails fast, for every
  caller.
- Adapters shrink to input mapping: header or `_meta` to `idempotencyKey`, a
  rendered descriptor's digest to `expectDigest`.

**Negative**:

- Two more ports and options in the catalog layer, a receipt round trip
  on every keyed dispatch, and one admission round trip per applying
  policy.
- Exactly-once effects still depend on the application writing receipts in
  the same transaction as the domain change.

**Trade-off accepted**: the package states the narrower guarantee it can keep
— a completed receipt never runs again (INV-CM-007) — and leaves atomicity to
the application's wrappers and stores.

## References

- Behaviours: [06 — Receipts, wrappers and breakers](../behaviors/06-receipts-wrappers-and-breakers.md), [02 — Dispatch](../behaviors/02-dispatch.md)
- Invariants: [INV-CM-007](../invariants.md#inv-cm-007-a-completed-receipt-never-runs-its-handler-again)
- Core: [29 — Capability grants and call log](../../core/behaviors/29-capability-grants-and-call-log.md), [30 — Operation context annotations](../../core/behaviors/30-operation-context-annotations.md), [31 — Hook points](../../core/behaviors/31-hook-points.md)
- Source: Bridger recheck of 2026-11-08, §5 items 1, 4 and 10.
