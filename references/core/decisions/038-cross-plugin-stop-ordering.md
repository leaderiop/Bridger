# ADR-BR-038: Cross-plugin stops wait only along dependency edges

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ADR-038                                              |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.1 (2026-10-02): Initial draft; closes URS gap G11 (CCR-BR-006) |

---

## Context

[ADR-BR-012](../decisions/012-intent-and-linearization.md) linearizes operations per plugin and rejects one host-wide lock. It leaves one ordering open (URS gap G11). Stopping a provider *P* must first stop each live dependent *D* ([06 — Removal](../behaviors/06-removal.md), BEH-BR-043). That stop of *D* is a system transition, and it can meet an operator operation already in flight on *D*: a `restart` of *D* draining its leases, a `replace` of *D*, or a `remove` of *D* parked after `DrainTimeout`. BEH-BR-073 covers the opposite direction only, an operator call arriving while a system stop runs.

The host-core prototype avoided the question by running operator operations one at a time across the whole host. That held up, but it showed the cost ADR-BR-012 predicted, and a worse one. Unrelated operations queued behind any drain. And a lease callback on *D* that called a mutating operation, while another operation waited for *D*'s lease, blocked until that drain timed out. It should have failed fast with `WouldDeadlock`. A per-plugin design has to say:

- whom a cross-plugin stop waits for;
- what it does to an operation already in flight on the dependent;
- what happens to a stop that a `DrainTimeout` parked;
- why no two host transitions can wait on each other.

## Decision

1. **No host-wide operation order.** Calls on one plugin are admitted (steps 1–7 of BEH-BR-188) and linearized in arrival order, as ADR-BR-012 says. Calls on different plugins never wait for each other's admission or linearization. The single audit writer orders *records*, not operations; the writer's queue is the only host-wide point a call passes.
2. **Waits follow dependency edges, from provider to dependent.** A *step* is one build, or one stop (drain, then scope close), of one plugin. Each plugin runs at most one step at a time. A transition on *P* may wait for:
   - its own step;
   - a step of a plugin that depends on *P* (one that captured a service of *P*, a child of *P*, or a `whenAvailable` block holding a service of *P*), directly or transitively;
   - leases on these plugins.

   It never waits for a step of a provider of *P*, nor of an unrelated plugin. Stopping a `whenAvailable` block interrupts a fiber inside its plugin's activation; it is not a step and waits for none. A build captures its providers when it starts and never waits for another plugin's transition. Dependency edges form an acyclic graph ([INV-BR-002](../invariants.md#inv-br-002-the-dependency-graph-is-acyclic-per-resolution-scope)), and a child mount that would close a cycle through parent–child edges is refused (BEH-BR-078). The wait-for relation between host transitions is therefore acyclic too, and host transitions cannot deadlock among themselves. Only a lease callback can close a cycle. `WouldDeadlock` covers that for the calling fiber's tree ([ADR-BR-016](../decisions/016-reentrancy-detection.md)), and `DrainTimeout` bounds every other case.
3. **A cascade waits for the dependent's step, never for its operation.** When stopping *P* needs dependent *D* stopped:
   - **No step running on *D*:** the host starts a dependency-loss stop of *D*.
   - **A step running on *D*** (a build or a stop, whether an operator operation, a system transition or another cascade owns it): the cascade waits for that step to settle. It then stops *D* only if *D* still holds a service of *P*.
   - **An operator operation in flight on *D* that still has a waiting caller:** the cascade never joins, supersedes or cancels it. That operation continues after its step. *P* was hidden in the revision in which its stop began (BEH-BR-042), so no later build of *D* can capture *P*, and *D* lands by availability.
4. **A parked stop is resumed by the next call that needs it.** A stop parked by `DrainTimeout` (BEH-BR-074) resumes, under the arriving call's `drain` and `force` (or the host default), when any of these arrives:
   - a call on that plugin joins or supersedes the parked operation;
   - an operator call arrives on that plugin while the parked stop is a system stop;
   - a cascade from one of the plugin's providers needs the plugin stopped.

   **When a cascade resumes a parked operator operation:** that operation's caller has already returned `DrainTimeout`. Its intent ends with this stop: the dependent lands where a dependency-loss stop leads (`waiting`, or `starting` when another provider is available). The stop is recorded as a `system-stop` whose `causationId` is the cascading call's `requested` record. The parked intent is not carried out on the operator's behalf. To finish what it asked for (unregistering, disabling), the operator issues the call again, and it is decided from the landed state.

   **When the resumed drain expires again:** the cascading call fails with `DrainTimeout`, whose `id` names the plugin whose leases did not drain. The dependent's stop stays parked, now owned by the cascade.
5. **`WouldDeadlock` is decided before any wait.** A call's re-entrancy check (step 7 of BEH-BR-188) runs before the call waits for anything that a held lease could block: a step on its target, a step on a dependent, or the call in flight it would join. A lease holder that calls an operation on an unrelated plugin is not delayed by any drain.

## Alternatives considered

- **One host-wide operation lock** (what the prototype did first). Rejected, as in ADR-BR-012: unrelated plugins queue behind a slow drain. The prototype also showed that a lease holder calling any mutating operation blocks until an unrelated drain times out, instead of failing fast or succeeding.
- **The cascade supersedes an operator operation in flight on the dependent.** Rejected: a system stop has no caller to own the outcome. The operator's caller would get `Superseded` for a change it never conflicted with, and the dependent's transition would be redirected mid-way.
- **The cascade waits for the dependent's whole operation, not just its step.** Rejected: a dependent's `replace` or `restart` ends with a build, and a parked operation never ends by itself. The provider's removal would then wait on a build it does not need, or forever.
- **A cascade that resumes a parked operation completes it** (unregisters a parked `remove`, disables a parked `disable`). Rejected: the trail would show a dependent unregistered or disabled under a different operator's call, attributed only through a causation link. Ending the parked intent with the stop keeps each lasting change tied to a call that asked for it.
- **Ordered locks over plugin IDs** (acquire every affected plugin's lock in ID order). Rejected: a cascade's set of dependents is known only as it walks the graph, and holding every lock through a drain recreates the host-wide wait locally.

## Consequences

**Positive**:

- An operation on one plugin never waits for a drain on an unrelated plugin.
- Freedom from deadlock among host transitions follows from an acyclic graph the host already enforces at `install` (and, for children, at mount), rather than from a lock order to maintain.
- A cascade cannot overrule a running operator operation, and a parked intent is never completed under another operator's call.
- A lease holder's re-entrant call fails at once in every case the carried reference can see.

**Negative**:

- A cascade can wait for the dependent's running step and then for its own drain. Its total wait is bounded by the sum of the two limits, not by one.
- An operator who parked a `remove` of a dependent, and whose dependent was then stopped by a provider's removal, finds the dependent `waiting`, not gone, and must call `remove` again. The trail shows why.

**Trade-off accepted**: a cascade bounded by two drain limits, and parked intents that a provider's removal ends rather than completes, in exchange for no host-wide order, no deadlock among transitions, and no lasting change made under the wrong call.

## References

- Behaviours: [08 — Operation legality](../behaviors/08-operation-legality.md) (BEH-BR-073, 074, 078–080), [06 — Removal](../behaviors/06-removal.md), [09 — Leases](../behaviors/09-leases.md)
- Invariants: [INV-BR-030](../invariants.md#inv-br-030-host-transitions-never-wait-on-each-other-in-a-cycle), [INV-BR-002](../invariants.md#inv-br-002-the-dependency-graph-is-acyclic-per-resolution-scope), [INV-BR-009](../invariants.md#inv-br-009-at-most-one-transition-in-flight-per-plugin), [INV-BR-016](../invariants.md#inv-br-016-a-re-entrant-wait-fails-fast)
- Risks: [RSK-BR-023](../gxp/03-risk-assessment.md#rsk-br-023), [RSK-BR-011](../gxp/03-risk-assessment.md#rsk-br-011), [RSK-BR-019](../gxp/03-risk-assessment.md#rsk-br-019)
- Decisions: [ADR-BR-012](../decisions/012-intent-and-linearization.md), [ADR-BR-015](../decisions/015-leases-one-primitive.md), [ADR-BR-016](../decisions/016-reentrancy-detection.md), [ADR-BR-017](../decisions/017-runtime-failure-one-transition.md)
- Evidence: `prototypes/host-core` (CCR-BR-006). Throwaway; it evidences no requirement ([ADR-BR-035](../decisions/035-evidence-from-executed-tests.md)).
