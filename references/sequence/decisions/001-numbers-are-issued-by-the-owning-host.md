# ADR-SQ-001: Numbers are issued by the owning host, never by the authority

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-SQ-ADR-001                                           |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.1 (2026-11-08): Initial draft (CCR-SQ-001)                 |

---

## Context

A host that works offline hands numbered records to people before any authority sees them. A provisional number replaced later by an authority-assigned one makes the copy in the person's hand disagree with the record. A counter shared by several hosts collides when they cannot reach each other.

## Decision

- Each series belongs to one origin (durable-bus `node#incarnation`); only that host issues its numbers.
- An authority receives, records and verifies series; it never issues a number in a host's series, and records its own decisions (retirement) in its own stream.

## Alternatives considered

- **Authority-assigned numbers with provisional local ones.** Rejected: renumbering a number already handed out.
- **Pre-allocated blocks from the authority.** Not chosen for this revision (README open question 2): blocks leave holes when a host dies, and contiguity per series would no longer hold.

## Consequences

**Positive**: numbers are final when issued; offline work needs no authority.

**Negative**: a deployment has as many series as hosts; global ordering across hosts is not given by numbers.

**Trade-off accepted**: one series per host, in exchange for numbers that never change.

## References

- Behaviours: [BEH-SQ-002](../behaviors/01-series-and-ownership.md#beh-sq-002-one-owning-host), [BEH-SQ-015](../behaviors/02-incarnation-and-verification.md#beh-sq-015-the-authority-may-record-a-closure-it-decided)
- Invariant: [INV-SQ-004](../invariants.md#inv-sq-004-only-the-owning-origin-writes-a-series)
