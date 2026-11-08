# ADR-BR-054: A correlation id in the fiber

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ADR-054                                              |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed — amends ADR-BR-029 and ADR-BR-044                  |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.1 (2026-11-08): Initial draft (CCR-BR-026)                 |

---

## Context

A correlation id joins the records of one request. Core generated one per mutating call and kept none in the fiber, so a chain such as command → hook → nested host call from served code broke at every hop unless each dispatcher passed the id by hand in `options.context` (URS gap G58; Bridger recheck 2026-11-08, item K6). `CallerContext` carried the invoker's actor and annotations but not its correlation, and call-log entries carried none.

## Decision

- **`CurrentCorrelation`**, a context reference (`@bridger/core/CurrentCorrelation`, default none) that any code may set with `CurrentCorrelation.with(id)`. A correlation is a caller's claim, like the actor, not an identity.
- **Resolution.** A call's `correlationId` is `options.context.correlationId`, else the fiber's `CurrentCorrelation`, else a generated one.
- **Set by the host** for everything it runs on a call's behalf — the gate, the transitions and the system transitions it causes, and the builds and finalizers they run. Root system records take the fiber's correlation when one is set.
- **Inherited** by forked fibers, provider methods and `use` callbacks; event listeners take the dispatcher's; `CallerContext` carries it and `serve` sets it.
- **Reset** for background fibers, health checks and `whenAvailable` runs, as `CurrentActor` is.
- **Reaches** the gate, the sink and the call log (`CallEntry.correlationId`), never the `ConfigFingerprinter`, snapshots, `Host.events`, logs, spans or metrics.
- This **amends ADR-BR-029** (the correlation of a call may come from the fiber) and **ADR-BR-044** (the call log receives the correlation as well as the actor).

## Alternatives considered

- **Every dispatcher passes the id in `options.context`.** Rejected: each companion would have to remember, and a forgotten hop breaks the chain silently.
- **Correlation follows the listener's owner.** Rejected: the event a listener handles is part of the dispatcher's request.
- **Background fibers inherit the correlation of the install that started them.** Rejected: work an hour later is not part of that install, which is why `CurrentActor` is reset there.
- **Put the correlation in logs and events.** Rejected for consistency with the rest of the attribution (BEH-BR-192).

## Consequences

**Positive**:

- A reviewer can follow one request through host records, gate requests, hook decisions and call-log entries.

**Negative**:

- A fiber forked during an operation and kept running carries its correlation; work that is not part of the request can be joined to it ([RSK-BR-063](../gxp/03-risk-assessment.md#rsk-br-063)).

**Trade-off accepted**: one more fiber reference with a precise reset rule, in exchange for unbroken correlation chains.

## References

- Behaviours: [22 — Attributable operations](../behaviors/22-attributable-operations.md) (BEH-BR-187), [23 — Audit sink and record](../behaviors/23-audit-sink-and-record.md) (BEH-BR-199), [30 — Operation context annotations](../behaviors/30-operation-context-annotations.md) (BEH-BR-292), [29 — Capability grants and call log](../behaviors/29-capability-grants-and-call-log.md) (BEH-BR-276)
- Invariants: [INV-BR-051](../invariants.md#inv-br-051-a-calls-correlation-follows-the-work-it-causes)
- Requirements: [URS-BR-054](../urs.md#urs-br-054-follow-one-request-through-everything-it-causes)
- Risks: [RSK-BR-063](../gxp/03-risk-assessment.md#rsk-br-063)
- Decisions: [ADR-BR-029](./029-attributable-mutations.md), [ADR-BR-044](./044-capability-policy-and-call-log-ports.md), [ADR-BR-045](./045-operation-context-annotations.md)
