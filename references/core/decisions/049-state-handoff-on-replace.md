# ADR-BR-049: State handoff on replace, with an audited cold start

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ADR-049                                              |
> | Revision       | 0.8                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed — amends ADR-BR-029                                 |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.8 (2026-11-11): A superseding `restart` or `reconfigure` keeps the held value, and the record keeps the attempting call's cause, unless the superseding call passes `cold: true` (C6); the `cold` mismatch `Conflict` carries `reason` "cold-mismatch" and `inspect().pending.cold` shows the operation's `cold` (CL1) (SPEC-AUDIT-08) (CCR-BR-040)<br>0.7 (2026-11-11): `cold` is part of the operation: a join needs equal `cold`, a `cold: true` superseding call abandons the handoff with the skip record, the plan carries `cold` (C7, C8); Audit: events mirror the imported and lost outcomes, a skip has none (CL5) (SPEC-AUDIT-07) (CCR-BR-039)<br>0.6 (2026-11-11): Audit: a `cold: true` skip yields one `handoff` record marked `cold: true`, and `cold` reaches the gate request and the call's records (C7) (SPEC-AUDIT-06) (CCR-BR-038)<br>0.5 (2026-11-11): Scope: `replace` and `reconcile` take `cold` (H9) (SPEC-AUDIT-05) (CCR-BR-037)<br>0.4 (2026-11-10): Status names the ADRs this one amends (ADR-BR-029), pairing their "amended by" (C22) (CCR-BR-034)<br>0.3 (2026-11-09): Amended to follow BEH-BR-346, 347, 350, 351 and 353: scope includes `restart` and a restarting `reconfigure` under `alsoOn`; export as the stop's final step, in the step that closes the scope (and, for a `replace`, swaps the definition); a `restart` or `reconfigure` superseding the new build keeps the value; the record is caused by the attempting call's `requested` record (C-14, U-02) (CCR-BR-033)<br>0.2 (2026-11-08): Alternative "Hand off on restart and reconfigure too" adopted as an opt-in (BEH-BR-353) (CCR-BR-025)<br>0.1 (2026-11-08): Initial draft (CCR-BR-019)                 |

---

## Context

`replace` is stop-then-start with no rollback ([ADR-BR-004](./004-replace-is-stop-then-start.md)). The old activation's scope closes before the new build runs, so a plugin's in-memory state (a warmed cache, open sessions, unflushed counters) is lost on every upgrade. The review listed hot reload with state handoff as missing in every system it compared, Bridger included.

Erlang's `code_change(OldVsn, State, Extra)` is the reference design: the running process hands its state to the new code, which converts it from the old format. The question is how to get that without overlapping two activations, which ADR-BR-004 and [ADR-BR-003](./003-one-provider-per-key-per-realm.md) forbid.

## Decision

- **Declaration.** A definition may declare `handoff: { version, schema, export, import, accepts?, upgrade? }`. `export` and `import` require only the definition's own provided services. `accepts` and `upgrade` play the role of `code_change`, owned by the new version.
- **Scope.** A handoff is attempted for a `replace` of an `active` plugin whose old and new definitions both declare one, and — since CCR-BR-025, as an opt-in — for a `restart` or a restarting `reconfigure` of an `active` plugin whose definition declares `alsoOn` for it, unless the call passes `cold: true` ([34 — State handoff](../behaviors/34-state-handoff.md), BEH-BR-353). Since CCR-BR-037 `replace` and `reconcile` take `cold` too, so a development reload skips a declared handoff without changing the definition. No other stop hands off, and neither does a replace whose new definition is lazy and lands in `dormant` ([27 — Manifest and lazy activation](../behaviors/27-manifest-and-lazy-activation.md)).
- **Order unchanged.** Dependents stop and leases drain. Then `export` runs and its value is encoded with the old schema, as the stop's final step: before the scope begins to close, in the transition step that closes it and, for a `replace`, swaps the definition (BEH-BR-347). The new build runs. Then upgrade, decode with the new schema (unknown fields ignored) and `import` run before publication. Each step is bounded by `handoffTimeout` (default 5 seconds).
- **Held state.** The host holds only the encoded value and old version, in memory, between export and import. It is never written to a record, event, log, snapshot or error, and is dropped as soon as it is imported or abandoned.
- **Failure.** An export, upgrade or decode failure, or an unaccepted version, gives a cold start: the new activation is published without the state. An import failure fails the activation (phase `activation`), because the import may have been partly applied. There is no retry and no cold restart. The handoff is abandoned when the held value can no longer reach an import into a build that will be published: the new build fails, the plugin waits, is removed, disabled or replaced again before publication, or shutdown begins. A `restart` or `reconfigure` that supersedes the new build does not abandon it, unless it passes `cold: true` (below): that build is discarded without the value, which stays held for the next build (BEH-BR-351).
- **`cold` is part of the operation** (CCR-BR-039). A call joins an operation in flight only when both carry the same `cold`; a different one is a `Conflict` with `reason` "cold-mismatch", and `inspect().pending.cold` shows the `cold` of the operation in flight (CCR-BR-040). A call with `cold: true` that supersedes an operation or build whose handoff is attempted abandons it: no export runs, or the held value is dropped, and the handoff's one record is the `cold: true` skip record, caused by the superseding call. A `ReconcilePlan` carries the `cold` it was computed with, and `expect` fails `PlanStale` on a different one (BEH-BR-351, BEH-BR-353; [32 — Generic gate and plan](../behaviors/32-generic-gate-and-plan.md), BEH-BR-318, BEH-BR-319).
- **Audit.** Each attempt yields one system record with `operation: "handoff"`, caused by the `requested` record of the `replace`, `restart` or `reconfigure` that attempted it — kept when a later call supersedes the build, unless the superseding call passes `cold: true`, whose `requested` record then causes the one skip record — and written before `system-start` (BEH-BR-350, BEH-BR-351). It has no `error` when the state was imported, and a loss tag (`HandoffExportFailed`, `HandoffVersionUnaccepted`, `HandoffUpgradeFailed`, `HandoffDecodeFailed`, `HandoffImportFailed`, `HandoffAbandoned`) when it was lost. `SystemTransition` gains `"handoff"`. Host events `handoff-imported` and `handoff-lost` mirror the imported and lost outcomes of the record. A handoff skipped because the call passed `cold: true` is not a silent cold start either: it yields one `handoff` record marked `cold: true`, with no `error` and no host event, and `cold: true` is carried on the call's gate request and records (CCR-BR-038).

## Alternatives considered

- **Build-then-swap with state transfer between live activations.** Rejected for the reasons of ADR-BR-004: two providers of one key, and both builds' side effects.
- **A runtime API inside the build (`runtime.handoff.offer`).** Rejected: a static declaration over provided services keeps the build a plain Layer and lets core check the declaration at `install`.
- **Persisting the state through a port.** Rejected: persistence across restarts is a plugin's own store; a core port would invite treating handoff as a backup.
- **Silent cold start.** Rejected: a plugin that lost its state looks healthy and behaves wrongly; the loss must be in the trail.
- **Retry the import, or restart cold after an import failure.** Rejected: an automatic second build or import is the unrequested repetition [ADR-BR-005](./005-failure-is-sticky.md) refuses.
- **Hand off on `restart` and `reconfigure` too.** Deferred at first; adopted as an opt-in per definition (`alsoOn`) with a per-call `cold` option, none on a volatile-only `reconfigure` (CCR-BR-025, BEH-BR-353).

## Consequences

**Positive**:

- Upgrades keep in-memory state when old and new versions agree on it, with an explicit conversion path when they do not.
- Every lost handoff is visible, with its cause, next to the version that became active.

**Negative**:

- `SystemTransition` gains a value (pre-release, `schemaVersion` stays 1).
- A replace's stop takes up to `handoffTimeout` longer, and the activation up to three times `handoffTimeout`.
- State is held in memory between stop and activation; a large state costs memory for that time.

**Trade-off accepted**: a bounded delay on replace and one more system record, in exchange for upgrades that keep state without overlapping activations or hiding a loss.

## References

- Behaviours: [34 — State handoff](../behaviors/34-state-handoff.md), [07 — Replacement and reactivation](../behaviors/07-replacement-and-reactivation.md), [05 — Activation](../behaviors/05-activation.md), [23 — Audit sink and record](../behaviors/23-audit-sink-and-record.md)
- Invariants: [INV-BR-045](../invariants.md#inv-br-045-handed-off-state-is-never-observable-and-its-loss-is-recorded), [INV-BR-003](../invariants.md#inv-br-003-publication-is-atomic), [INV-BR-007](../invariants.md#inv-br-007-failure-is-sticky)
- Requirements: [URS-BR-040](../urs.md#urs-br-040-keep-a-plugins-state-across-a-replacement)
- Risks: [RSK-BR-035](../gxp/03-risk-assessment.md#rsk-br-035), [RSK-BR-008](../gxp/03-risk-assessment.md#rsk-br-008)
- Decisions: [ADR-BR-002](./002-plugin-build-is-a-layer.md), [ADR-BR-003](./003-one-provider-per-key-per-realm.md), [ADR-BR-004](./004-replace-is-stop-then-start.md), [ADR-BR-005](./005-failure-is-sticky.md), [ADR-BR-033](./033-no-config-values-in-audit.md)
- Source: architecture review of 2026-11-08 (gap analysis), §5 item 15. Precedent: Erlang/OTP `code_change/3`. No SPEC.md section.
