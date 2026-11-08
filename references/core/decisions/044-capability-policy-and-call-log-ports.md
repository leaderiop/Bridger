# ADR-BR-044: CapabilityPolicy and CallLog ports in core

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ADR-044                                              |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed — amends ADR-BR-029                                 |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.2 (2026-11-08): the port never receives an actor (stated with the route for companions); `contract` is `{ name, version }`; one member set for narrowing (CCR-BR-022)<br>0.1 (2026-11-08): Initial draft (CCR-BR-018) |

---

## Context

Deployments want to narrow what each consumer can call on a service and to keep a data-access log of the calls made. Both can be written today as interceptions, one per key, but a companion cannot do them generically: it is not consulted when a consumer resolves a service, and it does not see the calls. A remote companion also needs, inside a proxy plugin's service, to know which consumer called which member under which grant, so it can mint a short-lived per-call token. Core must not learn what any service means, must store nothing, and must not claim that a narrowed object stops hostile in-process code ([ADR-BR-027](./027-core-exclusions.md)).

## Decision

- **`CapabilityPolicy` port.** Optional, read once at construction. `resolve(ResolutionRequest)` returns a `Grant` (`Grant.all(Key)` or `Grant.of(Key, { methods })`) or `ResolutionRefused`. Consulted once per capture on every route — required, optional, `whenAvailable`, `use`, `useAll`, `lease` — base services included, never cached. Fails closed on death, other errors or `resolutionTimeout` (default 5 s).
- **Refusal per route.** Required: activation fails, phase `activation`. Optional: none. `whenAvailable`: run held back. `use`/`useAll`/`lease`: typed `ResolutionRefused`.
- **Narrowing is a core-built interception**, outside every mandatory interception ([ADR-BR-043](./043-plugin-principal-and-mandatory-policy.md)); ungranted function members die with `CapabilityDenied`; shallow; never widening.
- **`CallLog` port.** `select` per capture, `record` once per call of a function member of a selected capture, including denied ones. Entries carry identifiers, the caller's actor, member, outcome, error tag, `Clock` timing and "callLog" annotations — never arguments, results or messages. `record` runs on the caller's fiber after the call, bounded by `callLogTimeout` (default 1 s); failure never changes the outcome; core keeps no copy.
- **`CurrentCall`** is the only seam for tokens and egress: a core-minted reference set around each intercepted call. Tokens, epochs, expiries and egress are the remote companion's.
- **No actor in the policy.** `resolve` decides for code (the consumer), never for a person: core never passes it an actor. A companion that admits work by actor decides that in its own layer, with its own error, before the host's capture; actor information reaches the policy only as a "policy"-flow annotation.
- **No implementation shipped** for either port, beyond test fixtures.
- **This amends ADR-BR-029** in one respect: the actor of the calling fiber reaches the call log as well as the gate and the sink.

## Alternatives considered

- **Grants declared on the plugin definition.** Rejected for core: a declaration is the plugin's request, and the decision belongs to the deployment. A manifest companion can turn declarations into policy input.
- **A refused required key leaves the plugin `waiting`.** Rejected: `waiting` would stop meaning "a dependency is missing".
- **A core-owned queue for call entries.** Rejected: a queue is a store; the port's premise is that core stores nothing.
- **Argument-level grants.** Rejected: they need the meaning of arguments; mandatory interceptions or the provider apply them.

## Consequences

**Positive**:

- A companion can narrow and log every consumer's access generically, and a remote companion has one seam for per-call tokens.
- Unwired, nothing changes.

**Negative**:

- A wired policy adds a decision to every capture and every `Host.use`; a recorded capture adds a `record` call to every call.
- The call log sees only calls made through captured services.

**Trade-off accepted**: two small ports with no default, in exchange for grants and logs that only become a boundary where the consumer runs out of process.

## References

- Behaviours: [29 — Capability grants and call log](../behaviors/29-capability-grants-and-call-log.md), [28 — Plugin principal and mandatory policy](../behaviors/28-plugin-principal-and-mandatory-policy.md), [17 — Realms and interception](../behaviors/17-realms-and-interception.md)
- Invariants: [INV-BR-037](../invariants.md#inv-br-037-an-unwired-policy-port-changes-nothing), [INV-BR-038](../invariants.md#inv-br-038-a-grant-never-widens-what-a-consumer-receives)
- Requirements: [URS-BR-034](../urs.md#urs-br-034-narrow-and-log-what-each-plugin-can-call)
- Risks: [RSK-BR-029](../gxp/03-risk-assessment.md#rsk-br-029), [RSK-BR-030](../gxp/03-risk-assessment.md#rsk-br-030)
- Decisions: [ADR-BR-019](./019-realms-are-resolution-namespaces.md), [ADR-BR-027](./027-core-exclusions.md), [ADR-BR-029](./029-attributable-mutations.md), [ADR-BR-043](./043-plugin-principal-and-mandatory-policy.md)
