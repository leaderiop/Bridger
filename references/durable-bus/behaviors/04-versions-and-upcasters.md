# 04 — Versions and upcasters

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-DB-BEH-04                                            |
> | Revision       | 0.4                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.4 (2026-11-08): Round-2 agent review (R4 F22, F25) — readers' versions reported per event type as "reader" reports that reach the authority; `DowncastRefused` fails the caller's transaction, with round-trip defaults recommended (CCR-DB-003)<br>0.3 (2026-11-08): round 2: recheck item 22 — writers last where readers cannot go first: `publishVersion`, round-trip-checked `downcast`, `DowncastRefused` (BEH-DB-031); oldest version received per origin (BEH-DB-032); BEH-DB-028 heading changed (old anchor kept); BEH-DB-029 open item settled; BEH-DB-030 amended (CCR-DB-003)<br>0.2 (2026-11-08): Resolutions of the agent review of 2026-11-08 — an unknown version halts or parks per the subscription's `onPoison` (CCR-DB-002)<br>0.1 (2026-11-08): Initial draft (CCR-DB-001)                 |

---

Envelopes outlive the code that wrote them: a terminal offline for days
delivers events written by last week's release to this week's authority.
This file specifies how a stored envelope is read at the current version,
what happens to versions the reader does not know, and how long upcasters
must be kept. This file owns BEH-DB-025–032 and uses all eight.

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

## BEH-DB-028: Readers know a version before any writer publishes it

<a id="beh-db-028-consumers-are-upgraded-before-producers-raise-a-version"></a>

> **See:** [ADR-DB-005](../decisions/005-versioned-events-and-pure-upcasters.md)
> **Depends on:** [ADR-FD-006](../../federation/decisions/006-n-minus-one-skew-window.md) (N/N−1 window of the federation companion)

```
REQUIREMENT: A release that raises an event's `version` from N−1 to N MUST
             keep `upcast[N−1]`. Documentation MUST state the rollout order:
             readers that know N are deployed before any writer publishes N.
             Where every reader can be upgraded before the writer (an
             online fleet), readers first is enough. Where some readers
             cannot (hosts offline when the release reaches the writer),
             the writer goes last: it keeps `publishVersion` at N−1 until
             the oldest-version reports show every reader in scope knows N
             (BEH-DB-031, BEH-DB-032). In either case, envelopes at N
             reaching an older reader halt or are parked (BEH-DB-026),
             never lost.
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

The bus cannot know every origin's backlog; the application, or a
federation authority that sees every host's status, decides when an old
version is gone, from the oldest version received per origin (BEH-DB-032,
federation [BEH-FD-047](../../federation/behaviors/06-kill-path-placement-and-skew.md#beh-fd-047-the-oldest-version-received-per-origin-is-reported-to-the-authority)).

## BEH-DB-030: Encoding uses the current version only

> **See:** [ADR-DB-005](../decisions/005-versioned-events-and-pure-upcasters.md)

```
REQUIREMENT: `publish` MUST encode at the event's `publishVersion`, which
             defaults to its current `version`. A `publishVersion` lower than
             `version` MUST be allowed only for N−1 and only with a declared
             `downcast[N]` (BEH-DB-031); the package MUST NOT offer any other
             publishing at an older version.
```

**Settled here.** A free downcast would let a new writer produce old-format
events through lossy transformations whose loss nobody records. The one
allowed step is checked by a round trip and refuses what it cannot carry
(BEH-DB-031), so nothing is lost silently.

## BEH-DB-031: One skew rule for events: writers last where readers cannot go first

> **See:** [ADR-DB-009](../decisions/009-writers-last-for-offline-readers.md), [ADR-DB-005](../decisions/005-versioned-events-and-pure-upcasters.md)
> **Depends on:** federation skew model ([BEH-FD-046](../../federation/behaviors/06-kill-path-placement-and-skew.md#beh-fd-046-one-skew-model-for-every-version-axis))

```ts
// illustrative — not type-checked
interface DurableEventOptions<A> {
  // ... BEH-DB-001
  readonly publishVersion?: number                        // N or N−1; default `version`
  readonly downcast?: Readonly<Record<number, Downcaster>> // only key N: encoded v(N) -> encoded v(N−1); pure
}
type Downcaster = (encoded: unknown) => Effect.Effect<unknown, DowncastRefused>   // no services: R = never
// DurableBus.plugin options gain: publishVersions?: Readonly<Record<string, number>>  // per event id, from desired state
class DowncastRefused extends Schema.TaggedError<DowncastRefused>()("DowncastRefused", {
  type: Schema.String, from: Schema.Number, reason: Schema.String
}) {}
```

```
REQUIREMENT: Events follow the one rule of the federation skew model: a
             reader at N reads every version from `minVersion` to N, and no
             writer publishes N until every reader in scope reads N.
             `DurableEvent.make` MUST reject a `publishVersion` other than
             `version` or `version − 1`, and a `publishVersion` of
             `version − 1` without `downcast[version]`.
```

```
REQUIREMENT: With `publishVersion` N−1, `publish` MUST encode at N, apply
             `downcast[N]`, then apply `upcast[N−1]` to the result and
             compare it with the encoding at N. When they differ, or the
             downcaster fails, `publish` MUST fail with `DowncastRefused`
             and write nothing: a value that N−1 cannot carry is refused,
             never truncated. Otherwise the envelope carries `version` N−1
             and the downcast payload.
```

```
REQUIREMENT: Documentation MUST state that a `DowncastRefused` fails the
             caller's transaction like every `publish` error (02,
             BEH-DB-009): during the writers-last window, a business write
             whose event carries a value N−1 cannot hold is refused as a
             whole unless the caller handles the error. It MUST recommend
             that a field added at N have a default that survives the round
             trip (absent at N−1, restored by `upcast[N−1]`), so that only
             values N−1 genuinely cannot express are refused.
```

```
REQUIREMENT: The bus option `publishVersions` MUST override an event's
             `publishVersion` within the same two values, so that the switch
             from N−1 to N is configuration — for a federated fleet, a
             manifest change (BEH-FD-046) — and needs no new release.
```

**Settled here.** Writers last is the order an offline fleet can keep: the
release that teaches every reader N ships first, with writers still on N−1;
the writer switches by configuration once the reports of BEH-DB-032 show no
reader below N. The round trip makes the one allowed downcast lossless by
construction: what cannot survive it is refused at publish, where the
author sees it, instead of being lost at a reader.

## BEH-DB-032: The oldest version received per origin is measured

> **See:** [ADR-DB-009](../decisions/009-writers-last-for-offline-readers.md), [ADR-DB-006](../decisions/006-bounded-replay-and-snapshots.md)
> **Satisfies:** [URS-BR-004](../../core/urs.md#urs-br-004-know-why-a-plugin-is-not-running)

```ts
// illustrative — not type-checked
interface VersionSeen {
  readonly type: string; readonly origin: string
  readonly oldest: number; readonly newest: number      // envelope `version`s stored by this inbox since `since`
  readonly since: string
}
interface ReaderVersion {
  readonly type: string
  readonly reads: number                                // the lowest `version` any registered subscription of this host reads for `type`
}
// DurableBus.status.versions: readonly VersionSeen[]; DurableBus.status.readers: readonly ReaderVersion[]
// DurableBus.versionReports: the federation VersionReports source — kind "received" from VersionSeen,
//   kind "reader" from ReaderVersion (federation BEH-FD-047)
```

```
REQUIREMENT: The inbox MUST keep, per (event type, origin), the lowest and
             highest envelope `version` it has stored, updated in the
             receipt transaction, and `DurableBus.status` MUST expose them
             as `versions`. `resetVersions(type, origin, context)` MUST be
             an attributed operator action that restarts the window.
```

```
REQUIREMENT: The bus MUST offer the same values as a federation
             `VersionReports` source (axis "event", kind "received"). It
             MUST also report, per event type, the lowest `version` that
             any subscription registered on this host reads — the event's
             current `version` as declared by the subscribing plugin's
             code — in `DurableBus.status.readers` and as reports of kind
             "reader" on the same source, so that the readers' versions
             reach the authority through the federation status report and
             it can tell when every reader in scope knows N, and when no
             origin still sends below a `minVersion` it wants to raise.
```

**Settled here.** A metric of what arrived is the evidence both rollout
decisions need: switching a writer (no reader below N) and dropping an
upcaster (no origin below the new minimum, BEH-DB-029). Deployment records
say what was installed; only the inbox knows what an origin's backlog still
holds.

---

_Previous: [03 — Delivery and inbox](./03-delivery-and-inbox.md)_ · _Next: [05 — Order and hybrid logical clocks](./05-order-and-clocks.md)_
