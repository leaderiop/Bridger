# ADR-EN-004: A lapse narrows a plugin's capability grants to read-only members, never refusing and never changing state

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-EN-ADR-004 |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record |
> | Change History | 0.1 (2026-11-08): Initial draft (CCR-EN-003)                 |

---

## Context

Until this record, read-only on a lapse was the plugin's to honour
([ADR-EN-001](./001-entitlement-changes-modes-not-state.md)): the package told
the plugin its mode and counted `guard` refusals. A review of the companions
on 2026-11-08 (recheck item 16) asked for read-only that does not depend on
the plugin's cooperation, above all for code that runs out of process behind
a proxy plugin, where the proxy's captures are what the guest can reach.
Core has since specified `CapabilityPolicy.changes`
([29 — Capability grants and call log](../../core/behaviors/29-capability-grants-and-call-log.md),
BEH-BR-281): a stream of `ResolveAgain` elements that makes the host
re-resolve live captures and apply the new grant to calls that begin
afterwards, leaving the consumer's state, leases and calls in progress as
they are.

## Decision

- `Entitlement.capabilityPolicy` provides the host's `CapabilityPolicy` by
  wrapping the application's own (`inner`) and taking members away from what
  `inner` granted, never adding any
  ([04](../behaviors/04-grant-narrowing-and-usage.md), BEH-EN-025,
  BEH-EN-027).
- In `read-only`, and in `none` under `onNone: "read-only"`, a plugin keeps
  only the members the application classified as read-only; the package
  infers nothing (BEH-EN-026).
- Entitlement answers with a grant, possibly of no member, and never with
  `ResolutionRefused`: a refused required capture fails an activation, which
  would be the state change ADR-EN-001 rules out (BEH-EN-025).
- A change of effective mode emits one `ResolveAgain` for that plugin;
  renewal restores members up to `inner`'s grant (BEH-EN-028).
- Plugins carrying an essential label are never narrowed (BEH-EN-027).

## Alternatives considered

- **Refuse resolution while not entitled.** Rejected: fails required
  activations and makes a lapse an outage.
- **A package wrapper around each service.** Rejected: bypassable, and it
  would duplicate the narrowing layer core already builds per capture.
- **Infer read-only methods from names or schemas.** Rejected: a guess that
  looks like a control.
- **Remove or disable the plugin on lapse.** Rejected for the reasons of
  ADR-EN-001.

## Consequences

**Positive**:

- Read-only no longer depends on the plugin's cooperation for the services
  it captured; for an out-of-process guest, its proxy's calls are narrowed.
- No plugin state changes; calls in progress finish under the grant they
  began with.

**Negative**:

- The application must classify read-only members per service, and keep the
  classification current as contracts gain methods.
- One delegating layer per capture, since core adds it whenever `changes` is
  declared (BEH-BR-275).
- Narrowing is shallow and is not isolation for in-process code
  (BEH-EN-029).

**Trade-off accepted**: an application-maintained classification and one
extra layer per capture, rather than read-only that rests on each plugin
honouring its mode.

## References

- Behaviours: [04 — Grant narrowing and usage](../behaviors/04-grant-narrowing-and-usage.md), [02 — Gate and runtime](../behaviors/02-gate-and-runtime.md)
- Core: [29 — Capability grants and call log](../../core/behaviors/29-capability-grants-and-call-log.md)
- Invariants: [INV-EN-002](../invariants.md#inv-en-002-a-lapse-never-changes-plugin-state-by-itself), [INV-EN-006](../invariants.md#inv-en-006-grant-narrowing-never-refuses-a-capture-and-never-widens-a-grant)
- Decisions: [ADR-EN-001](./001-entitlement-changes-modes-not-state.md), [ADR-BR-044](../../core/decisions/044-capability-policy-and-call-log-ports.md), [ADR-BR-019](../../core/decisions/019-realms-are-resolution-namespaces.md)
