# ADR-BR-008: Schema.TaggedError taxonomy carrying identifiers only

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ADR-008                                              |
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

Bridger's errors cross several boundaries. Callers narrow them with `Effect.catchTag`. Adapters render them. An audit record carries `error: { _tag, message }`, and a sink may persist it and re-read it in another process. An error that crosses those boundaries must be encodable, and it must not carry anything that should not leave the core: configuration values (which may be secrets), `Context` keys, fibers or raw `Cause`s.

A second distinction matters as much as the encoding: which outcomes are errors at all. A plugin whose build fails has not made `install` fail; it is a plugin in state `failed`. Mixing the two would make `install` non-total and would lose failures that happen later, with no caller.

## Decision

Every named error is a `Schema.TaggedError` (the v4 constructor name, as SPEC.md writes it, is in the API smoke test of [ADR-BR-001](../decisions/001-effect-v4-as-effect-system.md)). Errors carry identifiers and messages only. The complete list:

| Error | Fields | Raised by |
| --- | --- | --- |
| `DuplicatePlugin` | `id` | `install` of a known ID in the realm |
| `DuplicateProvider` | `serviceId`, `providerId` (plugin ID or `"base"`) | `install`, `replace`, `enable` |
| `DependencyCycle` | `path` (plugin IDs) | `install`, `replace`, `enable` |
| `InvalidDefinition` | `id`, `reason` | `install`, `replace` |
| `UnknownRealm` | `id` | `install` into an undefined realm; `replace` (as cause); `use`, `useAll`, `lease` with an undefined `realm` |
| `ReplaceError` | `id`, `cause: InstallError` | `replace` |
| `UnknownPlugin` | `id` | every operation on an unknown ref |
| `Conflict` | `id`, `pending` | illegal pairs ([ADR-BR-013](../decisions/013-total-operation-legality.md)) |
| `Superseded` | `id` | an earlier caller overtaken by a later operation |
| `HostClosed` | — | every operation once shutdown begins |
| `ConfigInvalid` | `id`, `message` | `reconfigure`; activation failure cause |
| `CleanupError` | `id`, `message` | `remove`, `replace`, `restart`, `disable`, `reconfigure` |
| `DrainTimeout` | `id` (plugin or generation name), `leases` | `remove`, `replace`, `restart`, `disable`, `reconfigure`, `Generation` |
| `WouldDeadlock` | `id` | re-entrant waits ([ADR-BR-016](../decisions/016-reentrancy-detection.md)) |
| `IdleTimeout` | `snapshot` | `awaitIdle` |
| `ServiceUnavailable` | `serviceId` | `use`, `useAll`, `lease` |
| `LeaseRevoked` | `serviceId` or `id` | forced revocation |
| `LeaseTimeout` | `serviceId`, `timeout` | per-call timeout |
| `KeyMismatch` | `serviceId` | activation failure cause ([ADR-BR-011](../decisions/011-serviceid-is-key-identity.md)) |
| `AdmissionClosed` | `name` | `Generation.acquire`, `Generation.use` |
| `ActivationFailed` | `id`, `phase`, `message` | `PluginHandle.awaitActive` |
| `PluginRemoved` | `id` | `PluginHandle.awaitActive` |
| `WaitTimeout` | `id`, `timeout` | `PluginHandle.awaitActive` |
| `DuplicateRealm` | `id` | `defineRealm` |
| `DuplicateContribution` | `id` | `ContributionRegistry.add` |
| `ContributionUnavailable` | `id` | `ContributionRegistry.use` |
| `Unattributed` | `operation` | every mutating operation, including `shutdown` and `reconcile` ([ADR-BR-029](../decisions/029-attributable-mutations.md)) |
| `ReasonRequired` | `operation` | every mutating operation listed in `attribution.requireReason`, including `shutdown` and `reconcile`; `acknowledgeAuditDegraded` always |
| `AuditUnavailable` | `operation`, `message` | every mutating operation except `shutdown` ([ADR-BR-031](../decisions/031-audit-failure-policy.md)) |
| `AuditWriteFailed` | `message` | `AuditSink.record` (the port's own error) |
| `OperationRejected` | `operation`, `target` (`{ id, realm }`, as in `OperationRequest`), `reason` | every mutating operation except `shutdown` and `reconcile`; for `reconcile`, per entry in `ReconcileReport.rejected` ([ADR-BR-032](../decisions/032-operation-gate.md)) |

- `InstallError = DuplicatePlugin | DuplicateProvider | DependencyCycle | InvalidDefinition | UnknownRealm`.
- Every mutating operation's error union additionally includes `Unattributed | ReasonRequired | AuditUnavailable | OperationRejected`, with two exceptions. `shutdown` adds only `Unattributed | ReasonRequired`: it skips the latch, is not gated, and proceeds when its `requested` record cannot be written. `reconcile` fails only with `Unattributed | ReasonRequired | AuditUnavailable | HostClosed`; gate refusals are per entry and are reported in `ReconcileReport.rejected`, not as the call's error ([ADR-BR-023](../decisions/023-desired-state-reconcile.md)). `AuditWriteFailed` never reaches an operation's caller; the host maps it to `AuditUnavailable` or to the audit-degraded latch.
- **Activation outcomes are state, not errors.** Missing requirements leave a plugin `waiting`; a build or activation failure leaves it `failed`. `KeyMismatch` and `ConfigInvalid` appear as the cause recorded in that failure, and `install` does not fail for them.
- **Consistency fixes to SPEC.md.** `PluginHandle.restart` has the same error union as `Host.restart` (SPEC.md omitted `DrainTimeout | WouldDeadlock`); `awaitIdle` and `inspect` also fail with `HostClosed`.
- **No values.** No field carries a configuration value, a key object, a fiber or a raw cause; full causes stay in the core's diagnostics. A `ConfigInvalid.message` names paths and expected forms and omits the offending values ([ADR-BR-018](../decisions/018-configuration-decoded-before-build.md)).

## Alternatives considered

- **`Data.TaggedError`.** Rejected: it has no schema, so the audit record and any adapter crossing a process boundary would need a second, hand-kept encoding of every error.
- **Plain `Error` subclasses with numeric codes.** Rejected: no `catchTag` narrowing, and hand-allocated codes collide (the precedent qadi ADR-QD-008 records).
- **One `BridgerError` with a `code` field.** Rejected: unions could not narrow per operation, so callers would handle impossible cases.
- **Carrying the raw `Cause` in errors.** Rejected: causes may embed configuration values or service objects, and they do not encode.

## Consequences

**Positive**:

- Every error is narrowable and encodable, and safe to log or audit as is.
- Each operation's union states exactly what can go wrong.

**Negative**:

- Error unions are wide once the four GxP errors are added to every mutating operation, even on hosts with no sink, gate or attribution requirement.
- Diagnosing a build failure needs `inspect` or logs; the error alone carries only a message.
- `LeaseRevoked` carries `serviceId` *or* `id` (a plugin's or a generation's), so consumers must branch on which field is present.

**Trade-off accepted**: wider unions and thinner errors, in exchange for errors that can cross any boundary without leaking a value.

## References

- Behaviours: [03 — Installation](../behaviors/03-installation.md), [08 — Operation legality](../behaviors/08-operation-legality.md), [09 — Leases](../behaviors/09-leases.md), [22 — Attributable operations](../behaviors/22-attributable-operations.md), [23 — Audit sink and record](../behaviors/23-audit-sink-and-record.md), [25 — Operation gate](../behaviors/25-operation-gate.md)
- Invariants: [INV-BR-012](../invariants.md#inv-br-012-a-definition-error-registers-nothing), [INV-BR-013](../invariants.md#inv-br-013-configuration-values-are-never-observable), [INV-BR-028](../invariants.md#inv-br-028-audit-records-carry-no-configuration-values)
- Risks: [RSK-BR-008](../gxp/03-risk-assessment.md#rsk-br-008)
- Decisions: [ADR-BR-013](../decisions/013-total-operation-legality.md), [ADR-BR-023](../decisions/023-desired-state-reconcile.md), [ADR-BR-029](../decisions/029-attributable-mutations.md), [ADR-BR-031](../decisions/031-audit-failure-policy.md), [ADR-BR-032](../decisions/032-operation-gate.md)
- Source: `docs/SPEC.md` — "Errors", "Host interface", "API decisions" row 6
