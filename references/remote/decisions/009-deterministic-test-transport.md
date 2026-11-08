# ADR-RM-009: A deterministic test transport, and the core suites re-run through proxies

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-RM-ADR-009                                            |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.1 (2026-11-08): Initial draft (CCR-RM-001)                 |

---

## Context

The claim that a proxy keeps every local rule (gap report §8, step B1) can be
evidenced only by executed tests
([ADR-BR-035](../../core/decisions/035-evidence-from-executed-tests.md)), and
network faults are not reproducible on a real network. The core's
`TestHost` keeps its scheduling seam internal (BEH-BR-177).

## Decision

- `TestTransport` is an in-process adapter with scripted, scoped faults
  (drop, delay, reorder, duplicate, partition, close), time from the core
  `Clock`, randomness from a seed, and a frame log.
- It keeps its own delivery queue; `RemoteTest.settle` alternates it with
  `TestHost.runUntilIdle`. No core change.
- The core's acceptance checks 1, 2, 3, 4, 10, 12, 18 and 23 are re-run
  through proxies, also with a partition injected, as the exit criterion of
  step B1.
- The fault suite doubles as the transport conformance suite every adapter
  runs against its real runtime.

## Alternatives considered

- **Join the `TestHost` step order.** Rejected: needs exporting the internal
  seam.
- **Test against real adapters only.** Rejected: faults are not scriptable.

## Consequences

**Positive**: the riskiest claim has a defined test; adapters share one
conformance suite.

**Negative**: two queues to drive in tests.

**Trade-off accepted**: a small test helper instead of a core change.

## References

- Behaviours: [08](../behaviors/08-test-transport-and-acceptance.md), [BEH-RM-052](../behaviors/07-transports-and-adapters.md)
- Core: [21 — Testing Host](../../core/behaviors/21-testing-host.md), [ADR-BR-026](../../core/decisions/026-deterministic-test-host.md)
