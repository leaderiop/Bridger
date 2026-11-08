# ADR-BR-029: Every host mutation is attributable

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ADR-029                                              |
> | Revision       | 0.5                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.5 (2026-11-08): The actor also reaches the `CallLog`; `onBehalfOf` is recorded beside the actor, never an actor (CCR-BR-018); `Actor.narrow` is a caller-invoked derivation (CCR-BR-019)<br>0.4 (2026-10-03): `reconcile` options merged, reserved actors and blank ids refused, step 7 in full (consistency pass) (CCR-BR-013)<br>0.3 (2026-10-02): `intent-ended` added to the system transitions (CCR-BR-008)<br>0.2 (2026-10-02): Consistency fixes from independent review (CCR-BR-002)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001) |
---

## Context

The first ALCOA+ attribute is *attributable*: a record must show who performed an action. 21 CFR Part 11 §11.10(e) requires audit trails of operator entries and actions, and EU GMP Annex 11 §12.4 requires systems to record the identity of operators entering, changing, confirming or deleting data, with date and time. SPEC.md's host operations take no actor: `host.remove("billing")` says what happened and not who did it or why.

Two shortcuts are tempting and both produce confident, wrong attribution. Inferring the actor from the fiber or from the plugin whose code made the call names a plugin or a thread as the person responsible. Attributing a system transition (a runtime failure, a dependency-loss stop) to the last operator who touched the host names a person for something no person did.

## Decision

```ts
// illustrative — not type-checked
type Actor = { readonly id: string; readonly kind: "user" | "service" | "system"; readonly display?: string }
type OperationContext = { readonly actor: Actor; readonly reason?: string; readonly correlationId?: string }
interface OperationOptions { readonly context?: OperationContext }
```

- **Every mutating `Host` method accepts an `OperationContext`.** Each one's options type extends `OperationOptions`; `retry`, `enable`, `reconfigure` and `defineRealm`, which had no options in SPEC.md, gain an `options?: OperationOptions` parameter, and `reconcile`'s options become `ReconcileOptions & OperationOptions`. The `Operation` set is `install`, `remove`, `replace`, `retry`, `reconfigure`, `restart`, `disable`, `enable`, `reconcile`, `defineRealm`, `shutdown` and `acknowledgeAuditDegraded`.
- **Two sources, one precedence.** The `Context.Reference` `@bridger/core/CurrentActor` (default `Actor.unattributed`) supplies an actor for every call in its fiber; a per-call `options.context` wins over it. Handle methods take the same options: `PluginHandle.restart(options?)` and `PluginHandle.remove(options?)` accept `RemoveOptions`, which extends `OperationOptions`. When a caller supplies no `correlationId`, the host generates one with `IdGenerator`, so every record carries one.
- **Requirement is opt-in.** `BridgerOptions.attribution = { require?: boolean; requireReason?: readonly Operation[] }`, defaults `false` and `[]`. With `require`, a call whose effective actor is `Actor.unattributed`, `Actor.system` or any other `bridger:`-prefixed actor fails with `Unattributed { operation }`, and an actor with a blank `id` fails whatever `require` says (BEH-BR-189); a call to an operation listed in `requireReason` without a reason fails with `ReasonRequired { operation }`. `acknowledgeAuditDegraded` always requires a reason ([ADR-BR-031](../decisions/031-audit-failure-policy.md)). The one exemption is the `shutdown` the host performs itself when its scope closes: it has no caller to supply a context, so it is attributed to `Actor.system` and is not checked against `require` or `requireReason`; an explicit `shutdown()` call is checked like any other.
- **Checked early, nothing recorded, nothing changed.** Attribution is step 2 of the eight-step order of a mutating call fixed in [22 — Attributable operations](../behaviors/22-attributable-operations.md) (BEH-BR-188): (1) `HostClosed`, (2) attribution, (3) audit-degraded latch, (4) validation, (5) gate, (6) `requested` record, (7) `WouldDeadlock` check, the turn at the plugin's linearization point, `WouldDeadlock` again, re-validation and legality, then intent and transition, (8) terminal record. Only the host-closed check precedes it. A call refused here writes no audit record and changes nothing.
- **System transitions are attributed to `Actor.system`.** `system-start`, `system-stop`, `runtime-failure`, `lease-revoked`, `health-degraded` and `intent-ended` (a parked operator intent ended by a cascade or by shutdown, [08 — Operation legality](../behaviors/08-operation-legality.md), BEH-BR-080) are recorded with `Actor.system` and a `causationId` — the record ID of the triggering operation's record, or of the system record that caused it — or none for a root system record, one with no cause in the trail (a runtime failure the plugin reports, a health check entering `degraded`).
- **Never inferred, never authenticated.** The core does not derive an actor from a fiber, a plugin, `@bridger/core/ActivePlugin` or anything else, and it does not authenticate. The `Actor` it records is the one it is given. Binding that value to an authenticated identity, and controlling identification codes and passwords, is the consumer's job (Part 11 §11.10(d), §11.300).

## Alternatives considered

- **Infer the actor from the calling plugin or fiber.** Rejected: a plugin is not a person, and an inferred actor is indistinguishable in the trail from a declared one.
- **A mandatory actor parameter on every call.** Rejected: it breaks every non-regulated caller. `Actor.unattributed` as a default, plus an opt-in `require`, keeps them unaffected while making a regulated deployment's omission a typed failure rather than a silent gap.
- **Omit the actor field when absent.** Rejected: an absent field is ambiguous; `Actor.unattributed` states the fact.
- **Record refused, unattributed attempts.** Rejected: the record would itself be unattributed. The refusal is returned to the caller, whose own context can log it.
- **Authenticate in core.** Rejected: identity providers differ per deployment, and authentication is outside the core's competence ([ADR-BR-027](../decisions/027-core-exclusions.md)).

## Consequences

**Positive**:

- Every audit record names an actor, explicitly, and system-caused changes are distinguishable from operator-caused ones and linked to their cause.
- A regulated deployment turns missing attribution into a typed failure with one option.

**Negative**:

- The core records whatever `Actor` it is handed; an application that sets `CurrentActor` from an unauthenticated source produces well-formed but untrustworthy records. That control is the consumer's.
- Every mutating error union grows by `Unattributed | ReasonRequired`, even for users who never enable `require`.
- `CurrentActor` is a fiber reference; work forked by an application inherits it, so an application that forks long-lived fibers under a user's actor attributes their later calls to that user unless it resets the reference.

**Trade-off accepted**: attribution as recorded, unverified input with an opt-in requirement, at the cost of trusting the consumer's identity binding, rather than inferred or authenticated identity that the core cannot make correct.

**Amendments (2026-11-08)**:

- The actor of the calling fiber also reaches the `CallLog` ([ADR-BR-044](../decisions/044-capability-policy-and-call-log-ports.md)). `onBehalfOf` ([ADR-BR-043](../decisions/043-plugin-principal-and-mandatory-policy.md)) is a host-established fact recorded beside the actor, never an actor.
- `Actor.narrow` is a caller-invoked derivation; core still derives no actor itself ([ADR-BR-048](../decisions/048-realm-families-and-retirement.md)).

## References

- Behaviours: [22 — Attributable operations](../behaviors/22-attributable-operations.md), [23 — Audit sink and record](../behaviors/23-audit-sink-and-record.md)
- Invariants: [INV-BR-025](../invariants.md#inv-br-025-no-mutation-proceeds-without-required-attribution), [INV-BR-027](../invariants.md#inv-br-027-a-refused-or-unauditable-mutation-changes-nothing)
- Requirements: [URS-BR-021](../urs.md#urs-br-021-know-who-changed-the-plugin-set-when-and-why)
- Risks: [RSK-BR-005](../gxp/03-risk-assessment.md#rsk-br-005), [RSK-BR-004](../gxp/03-risk-assessment.md#rsk-br-004)
- Decisions: [ADR-BR-028](../decisions/028-gxp-scope.md), [ADR-BR-030](../decisions/030-audit-sink-port.md), [ADR-BR-031](../decisions/031-audit-failure-policy.md), [ADR-BR-032](../decisions/032-operation-gate.md), [ADR-BR-043](../decisions/043-plugin-principal-and-mandatory-policy.md), [ADR-BR-044](../decisions/044-capability-policy-and-call-log-ports.md), [ADR-BR-048](../decisions/048-realm-families-and-retirement.md)
- GxP documents: [../gxp/02-compliance-matrix.md](../gxp/02-compliance-matrix.md)
- Source: `docs/SPEC.md` — "Host interface" (SPEC.md has no attribution; this ADR extends it)
- External: 21 CFR Part 11 §11.10(d), §11.10(e), §11.300; EU GMP Annex 11 (2011) §12.4; PIC/S PI 041 (ALCOA+, attributable).
