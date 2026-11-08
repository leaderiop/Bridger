# ADR-BR-049: State handoff on replace, with an audited cold start

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ADR-049                                              |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.1 (2026-11-08): Initial draft (CCR-BR-019)                 |

---

## Context

`replace` is stop-then-start with no rollback ([ADR-BR-004](./004-replace-is-stop-then-start.md)). The old activation's scope closes before the new build runs, so a plugin's in-memory state (a warmed cache, open sessions, unflushed counters) is lost on every upgrade. The review listed hot reload with state handoff as missing in every system it compared, Bridger included.

Erlang's `code_change(OldVsn, State, Extra)` is the reference design: the running process hands its state to the new code, which converts it from the old format. The question is how to get that without overlapping two activations, which ADR-BR-004 and [ADR-BR-003](./003-one-provider-per-key-per-realm.md) forbid.

## Decision

- **Declaration.** A definition may declare `handoff: { version, schema, export, import, accepts?, upgrade? }`. `export` and `import` require only the definition's own provided services. `accepts` and `upgrade` play the role of `code_change`, owned by the new version.
- **Scope.** A handoff is attempted only for a `replace` of an `active` plugin whose old and new definitions both declare one. No other stop hands off, and neither does a replace whose new definition is lazy and lands in `dormant` ([27 — Manifest and lazy activation](../behaviors/27-manifest-and-lazy-activation.md)).
- **Order unchanged.** Dependents stop and leases drain. Then `export` runs and its value is encoded with the old schema, before the scope closes and in the same step as the swap. The new build runs. Then upgrade, decode with the new schema (unknown fields ignored) and `import` run before publication. Each step is bounded by `handoffTimeout` (default 5 seconds).
- **Held state.** The host holds only the encoded value and old version, in memory, between export and import. It is never written to a record, event, log, snapshot or error, and is dropped as soon as it is imported or abandoned.
- **Failure.** An export, upgrade or decode failure, or an unaccepted version, gives a cold start: the new activation is published without the state. An import failure fails the activation (phase `activation`), because the import may have been partly applied. There is no retry and no cold restart. The handoff is abandoned when the new build fails, the plugin waits, is stopped, or shutdown begins.
- **Audit.** Each attempt yields one system record with `operation: "handoff"`, caused by the replace's `requested` record and written before `system-start`. It has no `error` when the state was imported, and a loss tag (`HandoffExportFailed`, `HandoffVersionUnaccepted`, `HandoffUpgradeFailed`, `HandoffDecodeFailed`, `HandoffImportFailed`, `HandoffAbandoned`) when it was lost. `SystemTransition` gains `"handoff"`. Host events `handoff-imported` and `handoff-lost` mirror the record.

## Alternatives considered

- **Build-then-swap with state transfer between live activations.** Rejected for the reasons of ADR-BR-004: two providers of one key, and both builds' side effects.
- **A runtime API inside the build (`runtime.handoff.offer`).** Rejected: a static declaration over provided services keeps the build a plain Layer and lets core check the declaration at `install`.
- **Persisting the state through a port.** Rejected: persistence across restarts is a plugin's own store; a core port would invite treating handoff as a backup.
- **Silent cold start.** Rejected: a plugin that lost its state looks healthy and behaves wrongly; the loss must be in the trail.
- **Retry the import, or restart cold after an import failure.** Rejected: an automatic second build or import is the unrequested repetition [ADR-BR-005](./005-failure-is-sticky.md) refuses.
- **Hand off on `restart` and `reconfigure` too.** Deferred: the same definition restarting is a persistence question. It is left as an open item.

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
