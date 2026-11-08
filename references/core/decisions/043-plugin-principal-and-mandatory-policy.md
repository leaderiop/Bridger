# ADR-BR-043: A host-minted plugin principal and mandatory policy

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ADR-043                                              |
> | Revision       | 0.3                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed — amends ADR-BR-019 and ADR-BR-021                  |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.3 (2026-11-08): Extended by AccessPolicy.declaredOnly, AccessPolicy.ask and the RefusalList port (CCR-BR-026)<br>0.2 (2026-11-08): `onBehalfOf` is the principal of the calling fiber (the provider case stated); retirement after finalizers; mandatory interceptions are application-wired and cover host captures only (CCR-BR-022)<br>0.1 (2026-11-08): Initial draft (CCR-BR-018) |

---

## Context

The audit trail records the `Actor` a caller states ([ADR-BR-029](./029-attributable-mutations.md)). When plugin code calls a mutating host operation, nothing records *which plugin* made the call: `@bridger/core/ActivePlugin` is a provided, diagnostic reference, and an identity that any code can provide is not evidence. A host composing many plugins also needs policies that a plugin cannot switch off. Three gaps are concrete: a child's own `intercept` replaces the interceptions it inherits (BEH-BR-151), so a policy wrapper placed on a parent can be shed by the parent's children; nothing stops a plugin from mounting children, which are system transitions and never gated; and the event bus and registries, which carry no service key, have no rule on who may emit, listen or contribute. Interception does not apply to `Host.use` from application code at all.

All of this sits inside one process of trusted code. Realms are resolution namespaces, not isolation ([ADR-BR-019](./019-realms-are-resolution-namespaces.md)), and a sandbox is excluded from core ([ADR-BR-027](./027-core-exclusions.md)). The question is what core can honestly offer short of isolation.

## Decision

- **A principal only the host mints.** One frozen `PluginPrincipal { id, realm, version?, digest?, revision }` per activation, recorded in a registry private to `@bridger/core`, carried in a fiber reference whose key is not exported for providing, and read through `CurrentPlugin.get` / `require`. Any value not in the registry is a forgery and the reading operation dies (`PrincipalForged`); a principal used to act after its activation ends dies (`PrincipalRetired`).
- **Set where core runs code for a plugin.** Builds, finalizers, background fibers, health checks, `whenAvailable` runs and the plugin's own listeners run under its principal; a provider's method runs under its caller's. `Plugin.Runtime.asSelf` is the explicit switch to the plugin's own principal.
- **`onBehalfOf`, not an actor.** A mutating call made under a principal carries `onBehalfOf` on its `OperationRequest` and its records. It names the principal of the calling fiber — on whose behalf the code ran — so a provider's method serving consumer A records A unless it uses `asSelf`; a provider acting on its own account must use `asSelf`. A principal is retired only after its activation's finalizers and fibers have finished. It is not settable through `OperationContext`, does not satisfy `attribution.require`, and never appears in system records or diagnostic channels.
- **Mandatory interceptions.** From `BridgerOptions`, `RealmOptions` and `InstallOptions` only, given by the code that builds the host, defines the realm or makes the install (a plugin cannot install one over other plugins); applied to host captures only, never to base-service or layer-to-layer reads; fixed when given; inherited by every descendant; never replaced by a child's `intercept`; outside every ordinary interception; and, unless restricted to plugins, applied to `Host.use`, `useAll` and `lease` from any caller.
- **`allowChildren`.** An install option, default `true`, that a child may narrow and never widen; a refused mount fails `Plugin.Runtime.install` with `ChildNotAllowed`.
- **An `AccessPolicy` port.** Optional, synchronous and total, consulted for listener registration, dispatch, contribution and child mounts; denials are defects; no implementation is shipped.
- **Attribution and policy, not isolation.** Every document says so, and third-party code runs out of process behind a proxy plugin.

This amends ADR-BR-019 (interception now also covers `Host.use` for mandatory interceptions, and is ordered with policy layers) and ADR-BR-021 (a child cannot shed a mandatory interception, and may be refused).

## Alternatives considered

- **Upgrade `ActivePlugin` into the principal.** Rejected: it is a provided reference with a diagnostic contract that helpers rely on; changing it in place would make both its old and new uses ambiguous.
- **Use the principal as the `Actor` of plugin calls.** Rejected: ADR-BR-029 forbids inferring an actor, and mixing a stated claim with a host-established fact would make every record ambiguous about which it carries.
- **Change the principal on entry to every provider method.** Rejected: core does not see method entry; doing it would mean wrapping every service for every consumer.
- **Make `AccessPolicy` effectful, like the gate.** Rejected for the bus: it sits on the dispatch path of every event. Decisions needing I/O precompute a table the policy reads.
- **Typed `AccessDenied` errors.** Rejected: they would change the signatures of `on`, `emit` and `add` for every host, wired or not.

## Consequences

**Positive**:

- The trail names both the person and the plugin on whose behalf the code ran; a gate can refuse plugin-initiated changes.
- A policy wrapper can no longer be shed by a child or bypassed through `Host.use`.

**Negative**:

- Mandatory interceptions on `Host.use` cost one wrap per call.
- Code that leaks its `Plugin.Runtime`, keeps references or imports another plugin's module is outside these controls.

**Trade-off accepted**: an honest, testable "no plugin can remove this through Bridger's API", in place of an isolation claim core cannot make in one process.

## References

- Behaviours: [28 — Plugin principal and mandatory policy](../behaviors/28-plugin-principal-and-mandatory-policy.md), [17 — Realms and interception](../behaviors/17-realms-and-interception.md), [14 — Children and groups](../behaviors/14-children-and-groups.md), [22 — Attributable operations](../behaviors/22-attributable-operations.md)
- Invariants: [INV-BR-035](../invariants.md#inv-br-035-only-the-host-mints-a-plugin-principal), [INV-BR-036](../invariants.md#inv-br-036-a-mandatory-interception-reaches-every-capture-in-its-scope), [INV-BR-037](../invariants.md#inv-br-037-an-unwired-policy-port-changes-nothing)
- Requirements: [URS-BR-032](../urs.md#urs-br-032-know-which-plugin-made-a-change-and-for-whom), [URS-BR-033](../urs.md#urs-br-033-enforce-a-policy-wrapper-that-no-plugin-can-remove)
- Risks: [RSK-BR-028](../gxp/03-risk-assessment.md#rsk-br-028), [RSK-BR-029](../gxp/03-risk-assessment.md#rsk-br-029)
- Decisions: [ADR-BR-019](./019-realms-are-resolution-namespaces.md), [ADR-BR-021](./021-children-and-groups.md), [ADR-BR-027](./027-core-exclusions.md), [ADR-BR-029](./029-attributable-mutations.md), [ADR-BR-032](./032-operation-gate.md), [ADR-BR-044](./044-capability-policy-and-call-log-ports.md)
- Extended by CCR-BR-026: `AccessPolicy.declaredOnly` and `AccessPolicy.ask` (BEH-BR-268, BEH-BR-269); the `RefusalList` port ([ADR-BR-053](./053-refusal-list.md)).
