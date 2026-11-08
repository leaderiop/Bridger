# ADR-FD-003: Manifest revisions are monotonic per host

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-FD-ADR-003                                            |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.1 (2026-11-08): Initial draft (CCR-FD-001)                 |

---

## Context

A signed manifest stays validly signed forever. Without ordering, an attacker or a misbehaving cache could replay an older signed manifest and bring back a plugin a kill entry removed. A crash in the middle of an apply could equally bring back an older state at boot.

## Decision

- Each manifest carries a positive integer `revision`, strictly increasing per (authority, host). A host accepts only a higher revision than the highest it has verified; an equal revision with a different payload is refused as equivocation ([BEH-FD-004](../behaviors/01-host-manifest.md#beh-fd-004-revisions-are-monotonic-and-a-reused-revision-is-refused)).
- The highest verified manifest is stored before it is applied; boot applies it.
- Rollback is a new, higher revision with older content. The kill switch is a manifest entry, so it is subject to the same ordering.

## Alternatives considered

- **Order by `issuedAt`.** Rejected: authority clocks can step; an integer is unambiguous.
- **Store after apply.** Rejected: a crash during apply would revert a kill at the next boot.
- **A separate kill channel.** Rejected: a second channel whose loss silently disables the kill switch, with its own ordering problem.

## Consequences

**Positive**: replay of old manifests and crash-time reversion are refused by construction ([INV-FD-001](../invariants.md#inv-fd-001-applied-manifest-revisions-never-decrease)).

**Negative**: erasing the host's store resets the floor to the boot bundle's revision; protecting the store is the consumer's.

## References

- Behaviours: [01](../behaviors/01-host-manifest.md), [02](../behaviors/02-sync-offline-and-rebootstrap.md)
