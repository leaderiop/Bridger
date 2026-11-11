# ADR-BR-015: Leases are one bounded primitive with a supervised child

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ADR-015                                              |
> | Revision       | 0.4                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.4 (2026-11-11): The paths with no caller name the refused background restart and a child's sub-scope close or unmount (CL3); `DrainTimeout` carries `realm` (C2) (SPEC-AUDIT-05) (CCR-BR-037)<br>0.3 (2026-10-03): Scoped-lease revocation interrupts the acquiring fiber (G12, BEH-BR-086); paths with no caller revoke without `force` (consistency pass) (CCR-BR-013)<br>0.2 (2026-10-02): `DrainTimeout` fields and parking aligned with BEH-BR-074 and BEH-BR-085; second pass: `id` also names a dependent whose build the call waited for, every unsettled stop of a failing call parks, shutdown never parks (CCR-BR-008)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001) |

---

## Context

A caller that obtains a plugin's service and then calls it must not have the provider's scope closed in the middle of the call ([RSK-BR-001](../gxp/03-risk-assessment.md#rsk-br-001)). So removal must wait for in-flight calls: a lease. But a lease held by a stuck callback would then block removal, replacement and shutdown forever, so leases must be bounded, and a bound that is reached must be able to end the callback.

Ending a callback means interrupting a fiber. If the callback runs on the caller's own fiber, the host would interrupt the caller: a request handler, a UI action, a fiber with its own unrelated work and finalizers. The host must be able to stop the leased work without reaching into the caller.

SPEC.md also offers three entry points: `use` (one key, one callback), `useAll` (several keys, one callback) and `lease` (several keys, for the life of a `Scope`). If each had its own admission, drain and revocation logic, they would drift apart.

## Decision

1. **One primitive.** `lease(keys, { realm })` is the primitive: all-or-nothing, it returns the services for the lifetime of the caller's `Scope` and releases them when the scope closes; if any key is unavailable it fails with `ServiceUnavailable` and holds nothing. `use` and `useAll` are `Effect.scoped(lease(keys))` plus a supervised child: the callback runs via `Effect.forkChild` and the caller joins it. There is one admission, drain and revocation path.
2. **Canonical order.** Multi-key leases are acquired in a canonical key order, so two concurrent `useAll` calls cannot deadlock each other.
3. **Bounded drain.** `remove`, `replace`, `restart` and `disable` wait for leases up to `drain` (default the host's `drainTimeout`, 30 seconds). On expiry the call fails with `DrainTimeout { id, realm?, leases, target? }` — `id` and `realm` name the plugin whose leases did not drain, or whose running transition step the call was waiting for (`leases` 0 for a build), `target` the plugin the call named, as `{ id, realm }`, when that differs (CCR-BR-037) — and every stop the call drives that has not settled parks: each plugin stays `stopping`, hidden from new consumers, until a call, a cascade or shutdown resumes it ([08 — Operation legality](../behaviors/08-operation-legality.md), BEH-BR-074, BEH-BR-079). The operator resumes it by repeating the call with a longer `drain` or with `force`. Paths with no caller revoke instead of parking ([ADR-BR-017](../decisions/017-runtime-failure-one-transition.md)); shutdown never parks and revokes only once its overall limit has passed. `drain: "forever"` is allowed only when written explicitly.
4. **Force.** With `force: true`, after the drain limit the host interrupts the remaining callbacks, waits for their finalizers, then closes the scope. Interrupted callbacks fail with `LeaseRevoked`. Forcing is *reported* as a host event (`lease-revoked`); with an `AuditSink` wired it is *also* an audit record (system transition `lease-revoked`). (SPEC.md said "audited as a host event"; a host event is a diagnostic, not an audit record, so the wording is corrected.) Interruption does not undo external effects.
5. **Supervised child edge rules.** The host never interrupts the caller's own fiber. If the caller is interrupted while the callback runs, the host interrupts the child, awaits its finalizers, and only then releases the lease. The child inherits the caller's fiber references (span, log annotations, `@bridger/core/HeldPlugins`, `@bridger/core/CurrentActor`) and `R` environment. The callback's own failures and defects propagate unchanged; `LeaseRevoked` and `LeaseTimeout` appear only when the host interrupted the child. Fibers the callback forks outside the child's scope are not leased.
6. **Per-call timeout.** `options.timeout` bounds one callback; expiry interrupts the child and fails with `LeaseTimeout { serviceId, timeout }` (built on `Effect.timeoutOrElse` over the supervised child).
7. **Scoped leases** follow the same drain and force rules; a forced revocation of a scoped lease interrupts the fiber that acquired it, and with it the fibers forked under the lease (BEH-BR-086); a holder for whom that is unacceptable uses `use` or `useAll`.

## Alternatives considered

- **Reference counting on the caller's fiber, no child.** Rejected: force would have to interrupt the caller's own fiber and everything else it was doing.
- **Unbounded drain by default.** Rejected: one stuck callback would hold removal and shutdown hostage ([INV-BR-017](../invariants.md#inv-br-017-every-drain-is-bounded-unless-declared-forever)).
- **No leases; trust callers.** Rejected: a provider could close mid-call, and nothing would show it.
- **Separate mechanisms for `use`/`useAll` and `lease`.** Rejected: two paths for admission, drain and revocation would diverge.

## Consequences

**Positive**:

- No provider closes under an admitted call unless the drain limit is reached and `force` was chosen, or the path has no caller (runtime failure, a refused background restart — a refused `whenAvailable` re-run included — a cascade with no caller, the overall shutdown limit, and a child's sub-scope close or `Plugin.Runtime.unmount` that removes the child itself or resumes a stop of it parked outside its parent's stop; one that waits for a removal its parent's stop began follows that stop's limits, BEH-BR-121).
- Every drain ends, either in success, `DrainTimeout`, or a forced, reported revocation.

**Negative**:

- A service reference or task that escapes the callback is not protected; TypeScript cannot prevent it.
- Each `use` costs a child fiber.
- A forced revocation can interrupt a write halfway ([RSK-BR-015](../gxp/03-risk-assessment.md#rsk-br-015)); regulated consumers choose drain limits that make forcing exceptional, and make writes idempotent or transactional.

**Trade-off accepted**: an extra fiber per call and an unprotected escape hatch, in exchange for leases that are always bounded and a revocation that never reaches the caller's own fiber under `use` or `useAll`.

## References

- Behaviours: [09 — Leases](../behaviors/09-leases.md), [06 — Removal](../behaviors/06-removal.md), [10 — Runtime failure and health](../behaviors/10-runtime-failure-and-health.md)
- Invariants: [INV-BR-005](../invariants.md#inv-br-005-dependents-stop-before-their-providers), [INV-BR-006](../invariants.md#inv-br-006-a-leased-provider-does-not-close-under-its-lease), [INV-BR-017](../invariants.md#inv-br-017-every-drain-is-bounded-unless-declared-forever)
- Requirements: [URS-BR-005](../urs.md#urs-br-005-never-lose-a-provider-in-the-middle-of-a-call), [URS-BR-002](../urs.md#urs-br-002-remove-or-replace-a-plugin-safely-while-it-is-in-use)
- Risks: [RSK-BR-001](../gxp/03-risk-assessment.md#rsk-br-001), [RSK-BR-015](../gxp/03-risk-assessment.md#rsk-br-015)
- Decisions: [ADR-BR-016](../decisions/016-reentrancy-detection.md), [ADR-BR-017](../decisions/017-runtime-failure-one-transition.md), [ADR-BR-024](../decisions/024-shared-state-helpers.md)
- Source: `docs/SPEC.md` — "Leases: limits, supervision and re-entrancy", "Host interface" (`use`, `useAll`, `lease`)
