# ADR-BR-046: Hook points are a policied dispatch over a contribution registry

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ADR-046                                              |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.2 (2026-11-08): breaker transitions on the hook point's `decisions` stream only, not host events; deadline interruptions do not feed the breaker (CCR-BR-022)<br>0.1 (2026-11-08): Initial draft (CCR-BR-019) |

---

## Context

An architecture review of 2026-11-08 compared Bridger with other plugin systems and with one consuming application. It recorded three conflicts in this area:

- **`waterfall` short-circuit.** Any `around` listener of a `waterfall` dispatch may short-circuit the chain, and the bus has no registration rule ([16 — Event Bus](../behaviors/16-event-bus.md), BEH-BR-143). An application whose regulated commands may be vetoed only by code it ships cannot use it for that decision.
- **Per-call timeout and sticky failure.** `use` has a per-call timeout and plugin failure is sticky with no automatic retry ([ADR-BR-005](./005-failure-is-sticky.md)). The application needs a time budget per decision and a circuit breaker per contributor, so that one failing extension never blocks a sale.
- **One provider per key.** At most one provider per key per realm ([ADR-BR-003](./003-one-provider-per-key-per-realm.md)), while the application has several implementations of one contract (several suppliers behind one ordering API) chosen per site.

Each could be answered by changing the bus, the failure model or the provider rule. Each such change would weaken a property other behaviours rely on: the bus's simplicity, the operator-cleared failure state, the unambiguous provider for removal ordering and leases.

## Decision

Add one helper, `HookPoint`, and one function, `Selector`, beside `ContributionRegistry` and `Generation` ([ADR-BR-024](./024-shared-state-helpers.md)). Change nothing in the bus, the failure model or the provider rule.

- **Built on the registry.** A hook point stores contributions in a `ContributionRegistry`, inheriting uniqueness, scope-bound removal, bounded drain, revisioned views and ownership reporting.
- **Roles.** Each contribution declares a role at registration: `veto` (may end the decision), `enrich` (adds a value under its own id), `advisory` (adds advice). A result outside the role is an error.
- **Admission by the application's rule.** `who(contributor, role, hookPoint)` runs once at registration over the owner, read from the plugin principal ([28 — Plugin Principal and Mandatory Policy](../behaviors/28-plugin-principal-and-mandatory-policy.md)), and labels the application supplies. Core knows no tiers and ships no default rule.
- **Deterministic order.** Priority then id, over the view at the start of the dispatch, held for its duration.
- **Phases.** Veto hooks run serially; the first admitted veto decides. Only if allowed, enrich and advisory hooks run concurrently, each on the input alone; their values stay namespaced by contribution id.
- **Closed veto vocabulary.** A veto carries a code from the hook point's declared set and primitive parameters, never free text.
- **Failure policy.** A per-hook `timeout`; `onError: "deny" | "skip"` for veto hooks; enrich and advisory errors are always skipped. An optional `skip` policy (for example entitlement or budget) skips a contribution before its call; such a skip is recorded as `skipped-policy`, never denies and never counts toward the breaker. `dispatch` never fails: its result is a verdict.
- **Deadline.** A per-dispatch deadline (the least of the hook point's, the call's and the context's `Deadline` annotation) bounds the whole decision; the dispatch does not wait for interrupted hooks' finalizers.
- **Breaker.** One circuit breaker per contribution (closed, open, half-open). It is hook-level state, discarded with the contribution. It never changes plugin state and is not audited. Its transitions are published on the hook point's own `decisions` stream, never on `Host.events`; an interruption by the dispatch deadline is not counted as an error.
- **Decision record.** Every dispatch yields one record naming the deciding contribution and every step's outcome, without input, values, messages or parameters. It is returned to the dispatcher and published on a lossy feed; core never writes it to the `AuditSink`.
- **Selection.** A contract with several implementations is one provider — a registry — with implementations as contributions. `Selector.make(registry, choose)` picks per call by a pure policy and holds the chosen implementation for the call. There is no automatic failover.
- **Boundaries.** The host never consults a hook point. Host lifecycle operations are authorised only by `OperationGate` ([ADR-BR-032](./032-operation-gate.md)). A hook point restricts authority over a decision, not capability: an admitted in-process hook is not sandboxed.

## Alternatives considered

- **Registration rules and a deadline on `waterfall`.** Rejected: the bus would grow a policy surface every listener pays for, and middleware (tracing, logging) does not want veto semantics or a record.
- **A breaker that moves the plugin to `failed`.** Rejected: one failing hook would take down every service the plugin provides, and leaving `failed` needs an operator ([ADR-BR-005](./005-failure-is-sticky.md)). A plugin that wants that calls `reportFailure` itself.
- **A retry budget per hook.** Rejected: retrying a hook within a dispatch repeats its side effects inside a time budget meant for one answer.
- **A default "anyone may veto" rule.** Rejected for the reason [ADR-BR-032](./032-operation-gate.md) gives for a permissive gate.
- **Several providers of one key with a selection policy.** Rejected again for the reasons of [ADR-BR-003](./003-one-provider-per-key-per-realm.md); the selector gives the per-site choice without the ambiguity.
- **Automatic failover in the selector.** Rejected: a call that timed out may have taken effect; repeating it elsewhere is safe only when the contract says so, which core cannot know.
- **Writing decision records to the `AuditSink`.** Rejected: the sink records host lifecycle changes ([ADR-BR-030](./030-audit-sink-port.md)); a decision belongs to the dispatcher's operation, and a hot-path dispatch must not wait on a sink.

## Consequences

**Positive**:

- An application can restrict who decides, bound how long a decision takes, and name who decided, without touching the bus, failure or provider rules.
- A failing extension costs at most its timeout, then nothing while its breaker is open.
- Several implementations of one contract can come and go without restarting dependents.

**Negative**:

- Two dispatch helpers exist for "many listeners": `waterfall` for middleware and hook points for policy. Documentation must point policy to the second.
- A dispatch holds every contribution of its view for up to one deadline, so a removal can wait that long.
- Labels are evaluated at registration; changing a contributor's labels requires replacing or removing it.

**Trade-off accepted**: one more helper, and a decision record the dispatcher must store itself, in exchange for leaving the bus, sticky failure and one provider per key unchanged.

## References

- Behaviours: [31 — Hook points](../behaviors/31-hook-points.md), [16 — Event bus](../behaviors/16-event-bus.md), [19 — Contribution registry](../behaviors/19-contribution-registry.md), [28 — Plugin principal and mandatory policy](../behaviors/28-plugin-principal-and-mandatory-policy.md), [30 — Operation context annotations](../behaviors/30-operation-context-annotations.md)
- Invariants: [INV-BR-040](../invariants.md#inv-br-040-only-an-admitted-veto-contribution-decides-a-hook-dispatch), [INV-BR-041](../invariants.md#inv-br-041-a-hook-dispatch-returns-within-its-deadline), [INV-BR-042](../invariants.md#inv-br-042-hook-level-failure-never-changes-plugin-state), [INV-BR-001](../invariants.md#inv-br-001-one-provider-per-service-key-per-realm)
- Requirements: [URS-BR-036](../urs.md#urs-br-036-let-several-plugins-take-part-in-one-decision-under-a-stated-failure-policy)
- Risks: [RSK-BR-032](../gxp/03-risk-assessment.md#rsk-br-032), [RSK-BR-014](../gxp/03-risk-assessment.md#rsk-br-014)
- Decisions: [ADR-BR-003](./003-one-provider-per-key-per-realm.md), [ADR-BR-005](./005-failure-is-sticky.md), [ADR-BR-020](./020-typed-event-bus.md), [ADR-BR-024](./024-shared-state-helpers.md), [ADR-BR-030](./030-audit-sink-port.md), [ADR-BR-032](./032-operation-gate.md)
- Source: architecture review of 2026-11-08 (gap analysis), §4 conflicts and §5 item 6. No SPEC.md section.
