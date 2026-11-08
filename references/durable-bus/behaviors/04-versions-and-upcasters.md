# 04 — Versions and upcasters

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-DB-BEH-04                                            |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.2 (2026-11-08): Resolutions of the agent review of 2026-11-08 — an unknown version halts or parks per the subscription's `onPoison` (CCR-DB-002)<br>0.1 (2026-11-08): Initial draft (CCR-DB-001)                 |

---

Envelopes outlive the code that wrote them: a terminal offline for days
delivers events written by last week's release to this week's authority.
This file specifies how a stored envelope is read at the current version,
what happens to versions the reader does not know, and how long upcasters
must be kept. This file owns BEH-DB-025–032 and uses BEH-DB-025–030;
BEH-DB-031–032 are reserved.

Planned source: `packages/durable-bus/src/Upcast.ts` *(Planned)*.

## BEH-DB-025: Read is upcast, then decode

> **See:** [ADR-DB-005](../decisions/005-versioned-events-and-pure-upcasters.md)

```
REQUIREMENT: To read an envelope of `version` v for an event at version N,
             the bus MUST apply `upcast[v]`, `upcast[v+1]`, …, `upcast[N−1]`
             in order to the encoded payload, then decode the result once
             with the event's schema. For v = N no upcaster runs.
```

```
REQUIREMENT: Stored envelopes MUST NOT be rewritten to a newer version, in
             the outbox or in the inbox. Upcasting MUST happen at read.
```

**Settled here.** Not rewriting keeps what the origin sent as the record; an
upcaster defect found later is fixed by fixing the upcaster, and every read
after that is correct.

## BEH-DB-026: Unknown versions are parked, not dropped

> **Invariant:** [INV-DB-006](../invariants.md#inv-db-006-no-envelope-is-dropped-silently)
> **See:** [ADR-DB-005](../decisions/005-versioned-events-and-pure-upcasters.md)

```
REQUIREMENT: An envelope whose `version` is greater than the reader's N, or
             lower than its `minVersion`, or whose `type` the reader does not
             declare at all while a subscription asks for it, MUST still be
             stored by the inbox and acknowledged, since the inbox stores
             envelopes, not decoded values. For each subscription that asks
             for its type, it MUST be handled as unreadable with
             `UnknownEventVersion` under that subscription's `onPoison`
             (BEH-DB-021, BEH-DB-022): under "halt" the subscription's
             (origin, stream) halts at it; under "park-and-continue" it is
             parked and the subscription continues.
```

```
REQUIREMENT: When the reader is upgraded and declares the version, a halted
             subscription MUST process the envelope in order when its handler
             registers again or on `resume`; a parked one MUST be processable
             after `unpark`, out of order (BEH-DB-022).
```

A newer producer than consumer is an expected moment of a rolling upgrade.
Storing, then halting or parking, keeps the fact without guessing at its
meaning.

## BEH-DB-027: Upcasters are pure

> **See:** [ADR-DB-005](../decisions/005-versioned-events-and-pure-upcasters.md)

```
REQUIREMENT: An upcaster MUST be a function of the encoded payload alone: no
             services, no clock, no random, no I/O. Its result for one input
             MUST be the same on every call.
```

```
REQUIREMENT: An upcaster failure MUST park the envelope with
             `UpcastFailed { type, from }`; an upcaster defect MUST be treated
             the same way and logged.
```

Purity makes every replay produce the same values, which is what lets an
authority rebuild a projection from the same envelopes and get the same
result.

## BEH-DB-028: Consumers are upgraded before producers raise a version

> **See:** [ADR-DB-005](../decisions/005-versioned-events-and-pure-upcasters.md)
> **Depends on:** [ADR-FD-006](../../federation/decisions/006-n-minus-one-skew-window.md) (N/N−1 window of the federation companion)

```
REQUIREMENT: A release that raises an event's `version` from N−1 to N MUST
             keep `upcast[N−1]`. Documentation MUST state the rollout order:
             readers that know N are deployed before any writer publishes N;
             during the window, envelopes at N reaching an older reader halt
             or are parked (BEH-DB-026), never lost.
```

```
REQUIREMENT: The acceptance suite MUST replay envelopes recorded at every
             version from `minVersion` to N through the current read path
             (check 12 of BEH-DB-058).
```

## BEH-DB-029: Upcasters are kept for as long as old envelopes can arrive

> **See:** [ADR-DB-006](../decisions/006-bounded-replay-and-snapshots.md)
> **Depends on:** [BEH-FD-013](../../federation/behaviors/02-sync-offline-and-rebootstrap.md#beh-fd-013-the-offline-cap) (offline cap)

```
REQUIREMENT: Raising `minVersion` (dropping upcasters) MUST be treated as a
             breaking change of the event. It SHOULD happen only when no
             origin can still hold an unacknowledged envelope below the new
             `minVersion`: at least the offline cap after the last release
             that published that version, plus the longest outbox backlog
             reported by `backlog`.
```

**Open.** The bus cannot know every origin's backlog; the application, or a
federation authority that sees every host's status, decides when an old
version is gone. A metric of the oldest version received per origin is
proposed but not specified.

## BEH-DB-030: Encoding uses the current version only

> **See:** [ADR-DB-005](../decisions/005-versioned-events-and-pure-upcasters.md)

```
REQUIREMENT: `publish` MUST encode at the event's current `version`. The
             package MUST NOT offer publishing at an older version
             (downcasting).
```

**Settled here.** Downcasting would let a new writer produce old-format
events for old readers, but it requires lossy transformations whose loss
nobody records. The consumers-first rollout of BEH-DB-028 avoids the need.

---

_Previous: [03 — Delivery and inbox](./03-delivery-and-inbox.md)_ · _Next: [05 — Order and hybrid logical clocks](./05-order-and-clocks.md)_
