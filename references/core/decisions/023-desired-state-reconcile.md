# ADR-BR-023: Desired-state reconcile is keyed, owned and idempotent

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ADR-023                                              |
> | Revision       | 0.4                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed — amended by ADR-BR-051                             |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.4 (2026-11-10): The `rejected` union defers to BEH-BR-157 instead of restating it (C24) (CCR-BR-034)<br>0.3 (2026-11-08): Amended by ADR-BR-051 (CCR-BR-025)<br>0.2 (2026-10-02): Consistency fixes from independent review (CCR-BR-002)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001) |

---

## Context

Applications usually keep the plugin set as data: a configuration file, a module registry row set, a profile. Driving the host from such a list with imperative calls means every application writes the same diff — what to install, replace, reconfigure, disable or remove — and gets the corner cases wrong in the same ways: removing plugins someone installed by hand, aborting the whole list on one bad entry, or reaching a different end state depending on the order of past edits. Cordis's loader solves this with keyed reconciliation over its own file format.

## Decision

`Host.reconcile(desired, options)` makes the host match a list of `DesiredPlugin` entries, with no file format of its own.

- **Keyed diff.** Entries are matched by `id` and realm. A missing entry is installed; a different definition is replaced; a different configuration is reconfigured (volatile-only differences do not restart, [ADR-BR-018](../decisions/018-configuration-decoded-before-build.md)); a flipped `disabled` flag disables or enables; anything else is unchanged. "Same definition" means the same object, or equal `meta.version` **and** `meta.digest` when both are present.
- **Ownership.** A reconcile owns the plugins it installed, tracked under `options.scope` (default `"default"`). With `prune` (default `true`), owned plugins absent from the list are removed. Plugins installed by hand or by another scope are never touched, so a profile and a manual override coexist.
- **Idempotent and convergent.** Running `reconcile(D)` twice is the same as running it once. Once it completes and the host is idle, the plugin set, configuration and enabled flags depend only on `D`, not on the edit history (`docs/SPEC.md` — "Confluence"); the deliberate exception is a sticky `failed` plugin ([ADR-BR-005](../decisions/005-failure-is-sticky.md)).
- **Errors are per entry.** An invalid entry is reported in `ReconcileReport.rejected` and does not stop the others, except when a change can no longer be recorded (below). Activation failures are state, as for `install`.
- **`Desired.overlay(base, patch)`** merges patches by (`id`, realm) in order (later wins; `config` merged deeply). It is pure and performs no I/O ([18 — Reconciliation and confluence](../behaviors/18-reconciliation-and-confluence.md), BEH-BR-153); how lists are stored, signed or fetched belongs to the application or a loader adapter.
- **GxP hooks.** `reconcile` is an `Operation` and takes `options?: OperationOptions`. With an `AuditSink` wired it writes one parent `requested`/terminal pair plus a pair per entry acted on, linked by `correlationId` ([ADR-BR-030](../decisions/030-audit-sink-port.md)). With an `OperationGate` wired the gate is consulted once per entry action, not once for the batch, and a refused entry appears in `ReconcileReport.rejected` ([ADR-BR-032](../decisions/032-operation-gate.md)). Attribution and the audit latch are checked once for the whole call, which fails with `Unattributed`, `ReasonRequired` or `AuditUnavailable` (or `HostClosed`). If a per-entry `requested` record cannot be written, reconcile stops there (fail closed) and returns `AuditUnavailable`; entries already applied stay applied and recorded. The same stop applies when the audit-degraded latch becomes set *while* the reconcile runs (a terminal or system record could not be written): no further entry action is issued and the call fails with `AuditUnavailable`, because continuing would make operator-initiated changes in the state the latch exists to block ([18 — Reconciliation and confluence](../behaviors/18-reconciliation-and-confluence.md), BEH-BR-157).
- **The `rejected` union.** `ReconcileReport.rejected[].reason` is the union fixed in [18 — Reconciliation and confluence](../behaviors/18-reconciliation-and-confluence.md), BEH-BR-157, which this ADR does not restate: when it was decided it was `InstallError | ConfigInvalid | OperationRejected | UnknownPlugin | Conflict | Superseded | CleanupError | DrainTimeout | WouldDeadlock`, and later decisions added members (`ConfigFingerprintUnavailable`, [ADR-BR-039](./039-config-fingerprint-port.md), CCR-BR-014; `PolicyMismatch`, CCR-BR-025). This deliberately widens the union of settlement S8 (`InstallError | ConfigInvalid | OperationRejected`; [SPEC.md migration map](../appendices/spec-md-migration-map.md)): an entry action that passes the gate, writes its `requested` record and then fails operationally is recorded as `failed` in the trail, and dropping it from the report would hide a change that was requested and not made. Every such entry must still be reported.

## Alternatives considered

- **Imperative calls only.** Rejected: each application re-derives the diff, and convergence becomes a property of application code that the core cannot test.
- **Prune everything not in the list.** Rejected: it deletes plugins installed by hand or by another profile; ownership by scope confines pruning to what this reconcile created.
- **All-or-nothing batches.** Rejected: there is no transaction over activation side effects ([ADR-BR-004](../decisions/004-replace-is-stop-then-start.md)), so a batch "rollback" would be a second set of stops and starts with its own failures. Per-entry reporting is honest about what happened.
- **Structural deep equality of definitions.** Rejected: a definition contains a `Layer` and functions, which have no meaningful structural equality. Identity, or an explicit version and digest, is what the author can control.
- **Gate the batch once.** Rejected: an approval is given for a change, and a batch is many changes; one approval for a list would approve entries the approver never examined.

## Consequences

**Positive**:

- A declarative source of truth drives the host directly, and the result is the same however the host got here.
- Manual and profile-driven plugins coexist without one deleting the other.
- Each entry action is attributed, gated and audited individually, so a regulated reviewer sees per-plugin changes rather than one opaque batch.

**Negative**:

- A new definition object whose code changed but whose `meta.version` and `meta.digest` did not is treated as the same definition and is not replaced. Equal version and digest are trusted, not verified: the core does not hash code ([ADR-BR-027](../decisions/027-core-exclusions.md)). Conversely, two equal definitions without `meta` that are different objects are always replaced.
- Convergence excludes `failed` plugins by design; a reconcile does not retry them.
- A reconcile over many entries produces many audit records and, with a gate, many authorisation requests.

**Trade-off accepted**: per-entry outcomes with scoped ownership, at the cost of no batch atomicity, in exchange for a reconcile that is idempotent, convergent and honest about partial results.

## References

- Behaviours: [18 — Reconciliation and confluence](../behaviors/18-reconciliation-and-confluence.md), [23 — Audit sink and record](../behaviors/23-audit-sink-and-record.md), [25 — Operation gate](../behaviors/25-operation-gate.md)
- Invariants: [INV-BR-021](../invariants.md#inv-br-021-reconcile-is-idempotent), [INV-BR-022](../invariants.md#inv-br-022-one-requested-and-one-terminal-record-per-mutating-call), [INV-BR-012](../invariants.md#inv-br-012-a-definition-error-registers-nothing)
- Requirements: [URS-BR-016](../urs.md#urs-br-016-drive-the-plugin-set-from-a-declarative-list), [URS-BR-028](../urs.md#urs-br-028-know-which-plugin-version-was-active-at-any-time)
- Decisions: [ADR-BR-004](../decisions/004-replace-is-stop-then-start.md), [ADR-BR-005](../decisions/005-failure-is-sticky.md), [ADR-BR-018](../decisions/018-configuration-decoded-before-build.md), [ADR-BR-030](../decisions/030-audit-sink-port.md), [ADR-BR-032](../decisions/032-operation-gate.md)
- Source: `docs/SPEC.md` — "Desired-state reconciliation", "Confluence"
- Amended by: [ADR-BR-051](./051-atomic-bundle-apply.md) — `reconcile` acts in dependency order, and `atomic: true` undoes a list that does not complete (CCR-BR-025).
