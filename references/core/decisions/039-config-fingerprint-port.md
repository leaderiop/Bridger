# ADR-BR-039: Configuration fingerprints come from a consumer port

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ADR-039                                              |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.2 (2026-11-08): File restored: it was registered in decisions/index.yaml and cited across core but missing from the repository; its content reconstructed from what BEH-BR-011, 015, 103, 188, 192, 197 and 219, ADR-BR-008, 018, 033 and 034, INV-BR-013, 026 and 028, RSK-BR-008 and RSK-BR-024, the CCR-BR-014 and CCR-BR-015 register entries and `prototypes/host-core` already state; no decision changed (CCR-BR-016)<br>0.1 (2026-10-03): Initial draft: an optional `ConfigFingerprinter` port asked at step 4a of BEH-BR-188, after validation and before the gate; core computes no fingerprint; fingerprints ordered by `configChange.paths`, whatever order the port answers in (CCR-BR-014, CCR-BR-015) |

---

## Context

[ADR-BR-033](../decisions/033-no-config-values-in-audit.md) keeps configuration values out of the audit trail: a record that concerns configuration carries the changed paths, never a value, old or new, plain or `Redacted`. [ADR-BR-018](../decisions/018-configuration-decoded-before-build.md) and [INV-BR-013](../invariants.md#inv-br-013-configuration-values-are-never-observable) keep them out of every other observable surface.

Paths alone leave one need unmet. An approver who authorizes a reconfiguration through the `OperationGate` ([ADR-BR-032](../decisions/032-operation-gate.md)) may have to bind the approval to the value it covers, and not only to its path; a reviewer may have to tell, from the trail, that the value put in place is the one that was approved. That needs something derived from the value that can be compared without revealing it — for example a keyed hash.

Core cannot produce it. A plain hash of a low-entropy value (a port number, a short password, an enum) is reversible by enumeration; a keyed hash needs a key core has no way to manage; and which fields are low-entropy, or secret, is a judgement about the consumer's configuration that core cannot make ([ADR-BR-033](../decisions/033-no-config-values-in-audit.md), alternatives). Key management and that choice belong to the consumer, or to the `@bridger/gxp` companion for any fingerprinting it specifies ([ADR-BR-034](../decisions/034-gxp-companion-scope.md)).

The question is therefore where, and under what limits, a consumer-supplied component may see a configuration value — the one place a value would leave core.

## Decision

Fingerprints come only from an optional consumer port, `ConfigFingerprinter`. Core ships no implementation and computes no fingerprint or hash itself.

```ts
// illustrative — not type-checked
interface Fingerprint { readonly path: string; readonly fingerprint: string }
interface FingerprintQuery {
  readonly operation: "install" | "reconfigure"
  readonly target: { readonly id: string; readonly realm: string }
}
class ConfigFingerprinter extends Context.Service<ConfigFingerprinter, {
  readonly select: (q: FingerprintQuery & { readonly paths: ReadonlyArray<string> })
    => Effect.Effect<ReadonlyArray<string>>
  readonly fingerprint: (q: FingerprintQuery & {
      readonly form: "raw" | "decoded"
      readonly entries: ReadonlyArray<{ readonly path: string; readonly value: unknown }>
    }) => Effect.Effect<ReadonlyArray<Fingerprint>, ConfigFingerprintFailed>
}>()("@bridger/core/ConfigFingerprinter") {}

interface ConfigChange {
  readonly paths: ReadonlyArray<string>
  readonly fingerprints?: ReadonlyArray<Fingerprint>   // a subset of paths, in the order of paths
}
```

- **Resolved once.** The host reads the port with `Effect.serviceOption` at construction, like `AuditSink` and `OperationGate`, and never re-resolves it ([02 — Host construction](../behaviors/02-host-construction.md), BEH-BR-015). `Host.controls` reports `wired.fingerprinter` and `fingerprintTimeout` ([24 — Time, identifiers and sequence](../behaviors/24-time-ids-and-sequence.md), BEH-BR-212).
- **Asked at step 4a, after validation and before the gate** ([22 — Attributable operations](../behaviors/22-attributable-operations.md), BEH-BR-188). After validation, so the port is never handed the value of a call that cannot happen; before the gate, so the `OperationRequest` the approver sees and the records the reviewer reads carry the same fingerprints ([25 — Operation gate](../behaviors/25-operation-gate.md), BEH-BR-219; [23 — Audit sink and record](../behaviors/23-audit-sink-and-record.md), BEH-BR-197).
- **Only for a new override value.** Step 4a runs for `install` with `config` (form `"raw"`, candidate paths the top-level keys of the undecoded value), for `reconfigure` with a value (form `"decoded"`, candidate paths the changed paths), and for a `reconcile` entry whose action is one of these. It never runs for a clear, for the revert of an override when an intent ends, for a call that resumes a parked operation, at activation, for values read from a configuration source or a default, or for any system transition. Fingerprints accepted at step 4a are stored with the override and reused, without calling the port, where those records need them.
- **Selection before values.** Core calls `select` first, with the operation, the target and the candidate paths and no value; its answer must be a subset of the candidates without duplicates. An empty selection ends step 4a with no `fingerprints`. Core then calls `fingerprint` once, handing it only the selected entries, in the order of `configChange.paths`. A port that fingerprints only non-secret fields never receives a secret.
- **No attribution.** Neither call receives the actor, the reason, the `correlationId` or any other part of the call's attribution ([22 — Attributable operations](../behaviors/22-attributable-operations.md), BEH-BR-192): the one port that sees values must not be able to join them to people.
- **Answers checked, then carried unchanged.** The answer of `fingerprint` must name exactly the selected paths, each once, each with a string matching `^[A-Za-z0-9._:-]{1,200}$`. Core orders the accepted fingerprints by the order of `configChange.paths`, whatever order the port answers in, and does not alter them. A fingerprint is not a configuration value; core claims no property for it beyond carrying it unchanged.
- **Bounded.** `select` and `fingerprint` together are bounded by `fingerprintTimeout` (a positive duration, default 5 seconds, with no "forever"; [02 — Host construction](../behaviors/02-host-construction.md), BEH-BR-011).
- **Fail closed, with a core-written message.** When `select` or `fingerprint` fails or dies, when the timeout passes, or when an answer is refused, the call fails with `ConfigFingerprintUnavailable { operation, message }`, changes nothing, writes no record, and the gate is not called. The message is written by core — `"configuration fingerprints unavailable: <why>"`, where `<why>` is `"selection outside the changed paths"`, `"malformed answer"`, `"timeout"`, the port error's `_tag`, or `"defect"` — and never carries the port's own text, which could quote a value. The port's `ConfigFingerprintFailed` never reaches a caller; `reconcile` reports the failure per entry in `ReconcileReport.rejected` ([ADR-BR-008](../decisions/008-error-taxonomy.md)). The failure is logged by operation and target, never by value.
- **Unwired changes nothing.** With no `ConfigFingerprinter` wired, step 4a is skipped, `configChange` carries paths only, no call fails with `ConfigFingerprintUnavailable`, `fingerprintTimeout` has no effect, and every call behaves as specified without the port ([INV-BR-026](../invariants.md#inv-br-026-an-unwired-sink-or-gate-changes-nothing)).

## Alternatives considered

- **Core computes a hash of each changed value.** Rejected in [ADR-BR-033](../decisions/033-no-config-values-in-audit.md): an unkeyed hash of a low-entropy value is reversible by enumeration, and a keyed hash needs a key core cannot manage.
- **Hand the port every changed value in one call.** Rejected: values would leave core before anyone had decided which fields are safe to fingerprint. Asking for a selection by path first means only the values of chosen paths ever leave core.
- **Fingerprint the effective configuration at activation.** Rejected: it would hand source values to the port on every activation, including values no operator changed ([22 — Attributable operations](../behaviors/22-attributable-operations.md), BEH-BR-188).
- **Fingerprint after the gate, for the records only.** Rejected: an approval could not bind to a fingerprint the approver never saw, and the request and the records could disagree.
- **Proceed without fingerprints when the port fails.** Rejected: an approval meant to bind to a fingerprint would then be asked for without one. A port that cannot answer fails the call before the gate, as a sink that cannot record fails it before the intent ([RSK-BR-024](../gxp/03-risk-assessment.md#rsk-br-024)).
- **Forward the port's error text, or pass it the call's attribution.** Rejected: the port's text could quote the value it was given, and an error message reaches callers, logs and the trail; attribution would let the port join values to people.
- **Resolve the port per call.** Rejected for the reason given for the other GxP ports (BEH-BR-015): fingerprints that appeared on some changes and not on others would leave approvals bound to some values and not to others, with nothing showing why.

## Consequences

**Positive**:

- An approval and a record can be bound to the value of a change without the value entering the gate request or the trail.
- Values leave core only to the consumer's own port, only for the paths it selects, only for a new override value, before the gate and without attribution.
- A host without the port behaves exactly as before; nothing is fingerprinted by default.

**Negative**:

- Configuration values now may leave core. Core limits what reaches the port and what comes back, but cannot control what the port does with the values it selects, nor whether its fingerprints reveal them; that residual is the regulated user's ([RSK-BR-024](../gxp/03-risk-assessment.md#rsk-br-024), [RSK-BR-008](../gxp/03-risk-assessment.md#rsk-br-008)).
- Fail closed is an availability cost: while the port fails, every `install` with `config` and every `reconfigure` with a value fails, bounded per call by `fingerprintTimeout`; clears and shutdown stay available.
- The format check cannot tell a fingerprint from a value that happens to fit the format, and selection is the port's: a port that selects a secret path receives that secret.
- The error unions of `install`, `reconfigure` and the per-entry `reconcile` outcomes gain `ConfigFingerprintUnavailable`; `AuditRecord` and `OperationRequest` gain `configChange.fingerprints?`.

**Trade-off accepted**: one narrow, consumer-owned exit for selected configuration values, so that approvals can bind to values, rather than either core managing keys it cannot hold or approvals that can name only paths.

## References

- Behaviours: [22 — Attributable operations](../behaviors/22-attributable-operations.md) (BEH-BR-188 step 4a, BEH-BR-192), [23 — Audit sink and record](../behaviors/23-audit-sink-and-record.md) (BEH-BR-195, BEH-BR-197), [25 — Operation gate](../behaviors/25-operation-gate.md) (BEH-BR-219), [02 — Host construction](../behaviors/02-host-construction.md) (BEH-BR-011, BEH-BR-015), [11 — Configuration](../behaviors/11-configuration.md) (BEH-BR-103), [18 — Reconciliation and confluence](../behaviors/18-reconciliation-and-confluence.md), [24 — Time, identifiers and sequence](../behaviors/24-time-ids-and-sequence.md) (BEH-BR-212)
- Invariants: [INV-BR-013](../invariants.md#inv-br-013-configuration-values-are-never-observable), [INV-BR-026](../invariants.md#inv-br-026-an-unwired-sink-or-gate-changes-nothing), [INV-BR-028](../invariants.md#inv-br-028-audit-records-carry-no-configuration-values)
- Requirements: [URS-BR-007](../urs.md#urs-br-007-configure-plugins-safely-including-secrets-and-live-changes), [URS-BR-021](../urs.md#urs-br-021-know-who-changed-the-plugin-set-when-and-why), [URS-BR-024](../urs.md#urs-br-024-require-approval-before-a-regulated-change); acceptance checks 55 and 56 ([traceability](../traceability.md), REQ-BR-055, REQ-BR-056)
- Risks: [RSK-BR-008](../gxp/03-risk-assessment.md#rsk-br-008), [RSK-BR-024](../gxp/03-risk-assessment.md#rsk-br-024)
- Decisions: [ADR-BR-008](../decisions/008-error-taxonomy.md), [ADR-BR-018](../decisions/018-configuration-decoded-before-build.md), [ADR-BR-030](../decisions/030-audit-sink-port.md), [ADR-BR-032](../decisions/032-operation-gate.md), [ADR-BR-033](../decisions/033-no-config-values-in-audit.md), [ADR-BR-034](../decisions/034-gxp-companion-scope.md)
- GxP documents: [../gxp/03-risk-assessment.md](../gxp/03-risk-assessment.md), [../gxp/04-validation-plan.md](../gxp/04-validation-plan.md) (installation check 7)
- Prototype: `prototypes/host-core/src/gxp.ts` (`ConfigFingerprinter`, `ConfigFingerprintUnavailable`, `ConfigFingerprintFailed`, `FINGERPRINT_FORMAT`) and `prototypes/host-core/src/host.ts` (step 4a, `fingerprintTimeout`), CCR-BR-014; the prototype evidences no requirement.
- External: 21 CFR Part 11 §11.10(e); EU GMP Annex 11 (2011) §10, §12.
