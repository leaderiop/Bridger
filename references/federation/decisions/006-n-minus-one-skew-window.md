# ADR-FD-006: An N/N−1 skew window with the highest common version

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-FD-ADR-006                                            |
> | Revision       | 0.4                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.4 (2026-11-08): round 2: recheck item 22 — one skew model across axes and writers-last rollout (CCR-FD-003)<br>0.3 (2026-11-08): resolutions of the agent review of 2026-11-08 — both windows in the offer so both ends agree; imports name one major and are accepted or refused, never negotiated (R3-02, R3-21) (CCR-FD-002)<br>0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-FD-001)<br>0.1 (2026-11-08): Initial draft (CCR-FD-001)                 |

---

## Context

Fleets are upgraded gradually: for some time, a hub at release N talks to terminals at N−1, and the reverse during a rollback. Accepting any pair of versions means running combinations nobody tested; accepting only equal versions makes every upgrade an outage.

## Decision

- Each link agrees on a federation protocol version: the highest in `[max(minA, minB, maxA − wA, maxB − wB), min(maxA, maxB)]`, with both ranges and both `protocolWindow`s (default 1) carried in the offers, so both ends compute the same answer. Empty → `IncompatiblePeer` on both ends ([BEH-FD-019](../behaviors/03-links-and-skew-handshake.md#beh-fd-019-the-federation-protocol-version-highest-common-inside-the-window)).
- Each import names one contract major through its version V; the offer accepts it when the peer exports that major at v ≥ V, and otherwise refuses that import alone with core `IncompatibleContract` as cause. No major is chosen at link time: the major is part of the contract's `ServiceId` and a provision is fixed at registration (core BEH-BR-232). An import older than `contractWindow` majors (default 1) is dropped at projection ([BEH-FD-020](../behaviors/03-links-and-skew-handshake.md#beh-fd-020-each-import-names-one-major-and-the-offer-accepts-or-refuses-it)).
- The offer exchange repeats on every link. The N/N−1 pair is a required acceptance check (check 24 of BEH-FD-034).
- One skew model covers every version axis — federation protocol, remote wire, contract major and minor, event version, upcaster chain, formats — with one rule (N reads N−1; nothing writes what N−1 cannot read until every reader runs N) and a writers-last rollout for fleets with offline hosts, gated on the oldest version received per origin ([BEH-FD-046](../behaviors/06-kill-path-placement-and-skew.md#beh-fd-046-one-skew-model-for-every-version-axis), [BEH-FD-047](../behaviors/06-kill-path-placement-and-skew.md#beh-fd-047-the-oldest-version-received-per-origin-is-reported-to-the-authority)).

## Alternatives considered

- **Best-effort with any version.** Rejected: untested combinations at runtime.
- **Lowest common version.** Rejected: pins the fleet to its oldest member longer than needed.
- **Choosing the highest common major per session.** Rejected: the provision would change key between sessions, stranding dependents and bypassing core's registration-time check (core BEH-BR-232).
- **Each end applying only its own window.** Rejected: with different windows one end agrees and the other refuses.

## Consequences

**Positive**: rolling upgrades and one-step rollbacks without outages; failures outside the window are typed and immediate.

**Negative**: a host two releases behind is cut off until upgraded; widening `protocolWindow` is possible but each extra step needs its own replay suite.

## References

- Behaviours: [03](../behaviors/03-links-and-skew-handshake.md), [05](../behaviors/05-testing-and-acceptance.md)
- Core: [core 26 — Versioned contracts](../../core/behaviors/26-versioned-contracts.md) (BEH-BR-225–232)
