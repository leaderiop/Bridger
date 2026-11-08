# ADR-BR-020: A typed event bus as a base service

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ADR-020                                              |
> | Revision       | 0.3                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.3 (2026-11-08): References: hook points for policied dispatch (ADR-BR-046), the bus unchanged (CCR-BR-019); listeners run under their owner's principal and a wired access policy (CCR-BR-018); the companion `@bridger/durable-bus` is a separate contract (CCR-BR-021)<br>0.2 (2026-10-03): Listeners run with `CurrentActor` reset (BEH-BR-144) (consistency pass) (CCR-BR-013)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001) |
---

## Context

`Host.events` is lifecycle observation: the host produces it, it is bounded and lossy (a sliding `PubSub` whose loss shows as a gap in `seq`), and its audience is diagnostics. It is not a channel through which one plugin tells another that an invoice was posted. Plugin systems without a first-class event mechanism grow one per application, and the recurring defect in those home-grown buses is lifetime: a listener registered by a plugin outlives the plugin, and the next dispatch calls into a closed service.

Cordis, the parity reference ([ADR-BR-010](../decisions/010-cordis-parity.md)), offers `ctx.on`, `emit`, `parallel`, `serial`, `bail` and `waterfall`, typed through declaration merging of a global event map. Bridger needs the same capability with Effect's typed results and errors and with listener lifetime tied to the scope that registered it.

## Decision

The core provides a typed event bus as a **base service**, `Bridger.Events` (identifier `@bridger/core/Events`), supplied by `Bridger.layer`. Plugins list it in `requires` like any other service; because it is a base service, no plugin can replace it.

```ts
// illustrative — not type-checked
const InvoicePosted = Event.make<[invoiceId: string], void, PostingError>()("billing/invoice-posted")
yield* bus.on(InvoicePosted, (invoiceId) => notify(invoiceId))   // removed when the scope closes
yield* bus.emit(InvoicePosted, "INV-1")
```

- **Keys, not merged declarations.** An event is an `EventKey<Args, Result, E>` made by `Event.make`; its owner exports the key and consumers import it. A listener whose signature does not match is a compile error, and dispatch results and errors are typed.
- **Dispatch modes.** `emit` (fire and forget; each listener in a supervised fiber; failures become `listener-failed` events and never reach the emitter), `parallel` (all awaited; the first typed failure interrupts the rest), `serial` (priority order; the first defined result ends the chain), `waterfall` with `around` listeners (middleware over `final`). Cordis's `bail` is not adopted: Effect has no synchronous mode and `serial` covers the pattern.
- **Order and lifetime.** Listeners are ordered by `priority` ascending, then registration order; `prepend` puts a listener first among equals. The listener list for each event is a `ContributionRegistry` ([ADR-BR-024](../decisions/024-shared-state-helpers.md)), so a dispatch uses the list as of its start and a listener is removed, with drain and revocation, when its plugin's activation scope closes. There is no manual unregistration.
- **Environment.** A listener's environment is `never`: it closes over the services of the plugin that registered it. `serial`, `parallel` and `waterfall` run listeners in the dispatcher's fiber context; `emit` runs them in child fibers that inherit it — except that every listener runs with `@bridger/core/CurrentActor` reset to `Actor.unattributed` (BEH-BR-144).
- **No veto hooks over host operations.** Application events have no hook through which a listener can veto, delay or rewrite a host operation (Cordis's `internal/update` waterfall is not reproduced). Lifecycle observation stays on `Host.events`. [ADR-BR-032](../decisions/032-operation-gate.md) amends this for **host lifecycle operations only**, by adding a dedicated `OperationGate` port; it does not add a veto event, and application events keep no veto over the host.

## Alternatives considered

- **Declaration merging of a global event map (Cordis).** Rejected: an augmented global interface couples every plugin's types to every other's, and two bundled copies of one package collide. A key exported by its owner follows the same identity rules as service keys ([ADR-BR-011](../decisions/011-serviceid-is-key-identity.md)).
- **Reuse `Host.events` for application events.** Rejected: it is lossy by design and owned by the host. Making it lossless for application traffic would let a slow dashboard subscriber stall plugin communication.
- **An untyped string-keyed emitter.** Rejected: listener mismatches would surface only at runtime, which defeats the reason for building on Effect.
- **The bus as an ordinary plugin.** Rejected: it could then be removed, and every plugin that requires it would cascade to `waiting` with it.
- **Veto-style hooks over host operations on the bus.** Rejected: any of many prioritised listeners could veto; a plugin's listener could block the removal of its own plugin; `emit` isolates listener failures, so a failing veto listener would be logged rather than obeyed; and a veto delivered by an event is not one accountable decision that can be recorded. Where a host operation must be authorised, a single port does it (ADR-BR-032).

## Consequences

**Positive**:

- Plugins exchange typed events without inventing a bus, and a removed plugin's listeners cannot be called after it stops.
- The bus reuses the registry's ordering, snapshot and removal rules rather than defining a second set.
- Lifecycle observation and application messaging stay separate, so neither audience's guarantees are weakened for the other.

**Negative**:

- `emit` failures are visible only as `listener-failed` events; an emitter that must know a listener failed uses `parallel` or `serial`.
- Event identifiers follow the `domain/action` convention by agreement only; the core does not enforce naming or ownership.
- Bus dispatches are not host operations: they are not attributed and produce no audit records. An application that treats an event as a regulated record must record it itself.

**Trade-off accepted**: a base service that cannot veto host operations, at the cost of re-adding authorisation later as a separate port, rather than a veto hook whose failure semantics (isolated, prioritised, plural) are wrong for an accountable decision.

**Amendments (2026-11-08)**:

- Listeners run with `CurrentPlugin` set to their owner's principal, and registration and dispatch consult a wired `AccessPolicy` ([ADR-BR-043](../decisions/043-plugin-principal-and-mandatory-policy.md)).
- A dispatch that needs registration rules, a deadline or a record of who decided uses a hook point; the bus itself is unchanged ([ADR-BR-046](../decisions/046-hook-points.md)).
- Companion `@bridger/durable-bus` is a separate contract, never a mode of this bus ([ADR-DB-001](../../durable-bus/decisions/001-a-separate-contract-from-the-core-bus.md)).

## References

- Behaviours: [16 — Event bus](../behaviors/16-event-bus.md), [19 — Contribution registry](../behaviors/19-contribution-registry.md), [13 — Observability and diagnostics](../behaviors/13-observability-and-diagnostics.md)
- Requirements: [URS-BR-013](../urs.md#urs-br-013-exchange-typed-events-between-plugins)
- Decisions: [ADR-BR-010](../decisions/010-cordis-parity.md), [ADR-BR-011](../decisions/011-serviceid-is-key-identity.md), [ADR-BR-024](../decisions/024-shared-state-helpers.md), [ADR-BR-032](../decisions/032-operation-gate.md) (amends this ADR for host lifecycle operations only), [ADR-BR-043](../decisions/043-plugin-principal-and-mandatory-policy.md), [ADR-BR-046](../decisions/046-hook-points.md), [ADR-DB-001](../../durable-bus/decisions/001-a-separate-contract-from-the-core-bus.md) (durable-bus companion)
- Source: `docs/SPEC.md` — "Typed events and hooks", "Comparison with Cordis"
- External: Cordis API reference (events), DeepSeek Harness documentation.
