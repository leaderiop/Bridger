# ADR-DB-009: Writers last for readers that cannot be upgraded first

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-DB-ADR-009                                           |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.2 (2026-11-08): Round-2 agent review (R4 F22) — the switch rests on reader-version reports from every host in scope (CCR-DB-003)<br>0.1 (2026-11-08): Initial draft — round 2: recheck item 22 (CCR-DB-003) |

---

## Context

BEH-DB-028 required readers to be deployed before any writer publishes a new
event version. In a fleet whose terminals may be offline for days, the
authority — usually the first host upgraded — writes downstream events that
offline terminals at N−1 will read when they return; they cannot be upgraded
first. Their envelopes at N then halt or park until the terminal is
upgraded: nothing is lost, but streams stop exactly where the fleet is most
fragile. The skew rules of protocol, contracts and events were also stated
separately.

## Decision

- One rule for every axis (federation [BEH-FD-046](../../federation/behaviors/06-kill-path-placement-and-skew.md#beh-fd-046-one-skew-model-for-every-version-axis)): N reads N−1; nothing writes what N−1 cannot read until every reader in scope runs N.
- For events, a writer may keep publishing N−1 after it learns N, through `publishVersion` and one declared `downcast[N]`, checked at publish by a round trip through `upcast[N−1]`; what the old version cannot carry fails with `DowncastRefused` ([BEH-DB-031](../behaviors/04-versions-and-upcasters.md#beh-db-031-one-skew-rule-for-events-writers-last-where-readers-cannot-go-first)).
- The switch to N is configuration (`publishVersions`, a manifest change in a federated fleet), made when the oldest version received per origin and the readers' versions — reported by every host in scope as "reader" reports that reach the authority — show every reader knows N ([BEH-DB-032](../behaviors/04-versions-and-upcasters.md#beh-db-032-the-oldest-version-received-per-origin-is-measured)).

## Alternatives considered

- **Readers first only.** Rejected for offline fleets: cannot be met.
- **Publish both versions.** Rejected: two envelopes per fact break one sequence per fact and double the backlog.
- **Free downcasting.** Rejected: silent loss; the round trip makes the one allowed step lossless or refused.

## Consequences

**Positive**: offline terminals keep processing downstream events across a release; the switch is signed, attributed and reversible desired state.

**Negative**: an event that gains information at N cannot be published with it until the switch; authors write and test one downcaster per raise.

## References

- Behaviours: [04](../behaviors/04-versions-and-upcasters.md)
- Federation: [06 — Kill path, placement and skew](../../federation/behaviors/06-kill-path-placement-and-skew.md), [ADR-FD-006](../../federation/decisions/006-n-minus-one-skew-window.md)
