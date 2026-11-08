# ADR-RM-004: Remote calls always time out; lifecycle steps never wait on a peer

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-RM-ADR-004                                            |
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

The core bounds drains and builds, but not finalizers that block
(BEH-BR-107), and a lease held by a call that never returns holds a removal
until the drain limit. A peer is outside the host's control: it can be slow,
gone or hostile.

## Decision

- Every remote call has a finite deadline: the smallest of method, link and
  `OperationContext` deadline; `"forever"` is not expressible.
- Callbacks are bounded by the call they serve.
- No build, finalizer or stop of a link or session child waits on the peer:
  connection, handshake and heartbeat run in `background` fibers; finalizers
  send `goodbye` without awaiting a reply; blocking local close is bounded by
  the adapter's `closeTimeout`.
- In-flight calls per session are bounded and excess calls fail, not queue.

## Alternatives considered

- **Optional timeouts with an unbounded default.** Rejected: one forgotten
  option re-creates the hang the core's drain rules exist to prevent.
- **Await the peer's acknowledgement of `goodbye`.** Rejected: puts the peer
  inside a finalizer.

## Consequences

**Positive**: a peer can delay a call but never a lifecycle step.

**Negative**: long-running remote work must be modelled as a job the guest
reports on through the host, not as one long call.

**Trade-off accepted**: no unbounded remote call, at the cost of modelling
long work explicitly.

## References

- Behaviours: [BEH-RM-003](../behaviors/01-remote-proxy-plugin.md), [BEH-RM-005](../behaviors/01-remote-proxy-plugin.md), [BEH-RM-012](../behaviors/02-sessions-and-epochs.md), [BEH-RM-017](../behaviors/03-remote-calls.md), [BEH-RM-028](../behaviors/04-heartbeat-and-partition.md), [BEH-RM-045](../behaviors/06-capability-tokens-and-call-log.md)
- Invariants: [INV-RM-002](../invariants.md#inv-rm-002-no-lifecycle-step-waits-on-a-peer), [INV-RM-003](../invariants.md#inv-rm-003-every-remote-call-is-bounded-by-a-timeout)
- Core: [INV-BR-017](../../core/invariants.md#inv-br-017-every-drain-is-bounded-unless-declared-forever)
