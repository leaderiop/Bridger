# 24 — Time, Identifiers and Sequence

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-BEH-24                                               |
> | Revision       | 0.8                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.8 (2026-11-10): BEH-BR-213 a record mid-retry when the host closes holds its number and leaves no gap, rather than "was never numbered" (CL7); a record unwritten at close is signalled by the error log and `auditPosition`, not `CloseReport.auditDegraded` (C5) (CCR-BR-036)<br>0.7 (2026-11-10): The GxP companion is cited as a Draft, not as specified later (C20) (CCR-BR-034)<br>0.6 (2026-11-09): BEH-BR-210 every value an `IdGenerator` returns is unique within its host and across every host whose identified outputs reach a common store; a provided generator carries that obligation, the default meets it with high probability only, and the testing counter within one `TestHost` (F-03); the requirement states what a conforming design is — unique by construction, or at least 122 bits per value drawn independently and uniformly from a cryptographically secure source — so that the default conforms (CCR-BR-033)<br>0.5 (2026-11-08): BEH-BR-212 `HostControls` gains `buildTimeout` (G61), `policy.refusal` and the call-log counters `dropped` and `refused` with the effective `onFailure` and `queue` (CCR-BR-026)<br>0.4 (2026-11-08): BEH-BR-215 prose points to the audit-chain companion's `verifyChain` (CCR-BR-021); BEH-BR-212 `HostControls` gains the `policy` block of BEH-BR-265 and the `callLog.failed` counter of BEH-BR-276 (CCR-BR-018)<br>0.3 (2026-10-03): BEH-BR-212 `HostControls` through `Host.controls`, with the audit position `lastWritten` (highest `auditSeq` the sink accepted; per host; never decreases); `Host.controls` stays readable after close (prototype finding G34) (CCR-BR-014)<br>0.2 (2026-10-02): Consistency fixes from independent review (CCR-BR-002)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001) |

---

An audit record is only as good as its time, its identity and its place in
order. This file fixes where core gets each of them — time from Effect's
`Clock`, identifiers from an `IdGenerator` service, order from a per-host
`auditSeq` — and what `verifyAuditSequence` can and cannot tell a reader about
a stored trail. It has no SPEC.md source section beyond "Testing the core"
(test clock): it is a GxP hook added to the core design
([ADR-BR-025](../decisions/025-deterministic-time-and-ids.md),
[ADR-BR-037](../decisions/037-audit-sequence-separate-from-event-seq.md)). This
file owns BEH-BR-209–216 and uses all eight.

> **What core does not do — and who does**
>
> Core reads time; it does not make the clock **accurate** or
> **synchronised** — that is the consumer's platform and procedures. It
> numbers records; it does not **store**, **retain**, make **durable** or
> **review** them, and `verifyAuditSequence` is **not tamper evidence**. It
> does not authenticate actors or manifest **electronic signatures**. Those
> obligations belong to the consumer, or to the `@bridger/gxp` companion where
> adopted, specified as a Draft in [`references/gxp/`](../../gxp/README.md).

Planned source: `packages/core/src/IdGenerator.ts` and
`packages/core/src/verifyAuditSequence.ts` *(Planned)*. The writer that
assigns `auditSeq` is [BEH-BR-202](./23-audit-sink-and-record.md) in
23 — Audit Sink and Record.

## BEH-BR-209: Every timestamp comes from Clock

> **Invariant:** [INV-BR-024](../invariants.md#inv-br-024-time-and-identifiers-come-only-from-services)
> **See:** [ADR-BR-025](../decisions/025-deterministic-time-and-ids.md)
> **Satisfies:** [URS-BR-027](../urs.md#urs-br-027-reproduce-time-and-identifiers-during-validation), [URS-BR-021](../urs.md#urs-br-021-know-who-changed-the-plugin-set-when-and-why)
> **Risk:** [RSK-BR-007](../gxp/03-risk-assessment.md#rsk-br-007)
> **Regulatory:** supports 21 CFR 11.10(e) (time-stamped); EU GMP Annex 11 §9, §12.4; ALCOA+ Contemporaneous

```ts
// illustrative — not type-checked
const timestamp = Clock.currentTimeMillis.pipe(
  Effect.map((ms) => new Date(ms).toISOString())    // "2026-10-02T09:15:00.123Z"
)
```

```
REQUIREMENT: Every time core reads — audit `timestamp`, event timestamps,
             build and lease durations, `CloseReport.durationMs`, and every
             timeout and schedule (`buildTimeout`, `drainTimeout`,
             `shutdownTimeout`, `stallWarning`, `auditTimeout`, `gateTimeout`,
             health-check intervals) — MUST come from Effect's `Clock`.
```

```
REQUIREMENT: `AuditRecord.timestamp` MUST be formatted as ISO-8601 in UTC with
             millisecond precision and a literal "Z" suffix
             (YYYY-MM-DDTHH:mm:ss.sssZ), converted from
             `Clock.currentTimeMillis` with no local time-zone involved.
```

A single time source is what lets a test hold time still, and what lets a
reviewer compare a record's `timestamp` with the event's and the span's
without wondering which clock each came from. UTC with an explicit `Z` keeps a
trail merged from hosts in different time zones readable without metadata.

## BEH-BR-210: Every identifier comes from IdGenerator

> **Invariant:** [INV-BR-024](../invariants.md#inv-br-024-time-and-identifiers-come-only-from-services)
> **See:** [ADR-BR-025](../decisions/025-deterministic-time-and-ids.md)
> **Satisfies:** [URS-BR-027](../urs.md#urs-br-027-reproduce-time-and-identifiers-during-validation)
> **Risk:** [RSK-BR-007](../gxp/03-risk-assessment.md#rsk-br-007)
> **Regulatory:** supports EU GMP Annex 11 §4 (validation); ALCOA+ Consistent

```ts
interface IdGeneratorShape {
  readonly next: Effect.Effect<string>
}
class IdGenerator extends Context.Service<IdGenerator, IdGeneratorShape>()("@bridger/core/IdGenerator") {}
// Default when none is provided: next = Effect.sync(() => crypto.randomUUID())
```

```
REQUIREMENT: The host MUST read `IdGenerator` with `Effect.serviceOption` at
             construction and fall back to the default implementation,
             backed by `crypto.randomUUID`, when none is provided.
```

```
REQUIREMENT: Every identifier core creates that leaves the core — the host id,
             every `recordId`, and every `correlationId` the host generates —
             MUST be drawn from `IdGenerator.next`.
```

```
REQUIREMENT: Ordering counters that are not identifiers —
             `HostSnapshot.revision`, the event `seq`, `auditSeq`, registry
             revisions and the event bus's listener ordering keys — MUST be
             deterministic counters owned by the host, not drawn from
             `IdGenerator`.
```

```
REQUIREMENT: Every value `IdGenerator.next` returns MUST be a non-empty
             string, and the generator MUST be designed so that the value
             differs from every other value it returned to the same host,
             and from every value returned to any other host whose audit
             records, call-log entries or other identified outputs reach a
             common store. A design meets this requirement when it is
             either unique by construction (for example a prefix unique per
             host and assigned outside the hosts, followed by a counter that
             survives restarts) or random with at least 122 bits per value
             drawn independently and uniformly from a cryptographically
             secure source, which bounds the probability of any repeat
             among 2^36 values in one store below 2^-50. The default
             (`crypto.randomUUID`, a version 4 UUID with 122 such bits)
             meets it by the second rule. This covers each identifier core
             draws from the generator — the `hostId`, every `recordId`,
             every generated `correlationId`, and the `callId`,
             `dispatchId` and realm segment defaults of 29, 31 and 33 — and
             is an obligation on whoever provides the generator.
             Documentation of `IdGenerator` MUST state it, and MUST state
             that the default meets it by the random bound.
```

```
REQUIREMENT: Core MUST NOT assume anything of an identifier beyond being a
             non-empty string, and MUST NOT parse it. Core MUST NOT check
             identifiers for repeats: it keeps no history of the values it
             drew.
```

`TestHost` substitutes a counter (`test-1`, `test-2`, ...;
[21 — Testing Host](./21-testing-host.md)), so that the records of an
executed test are identical on every run. A consumer whose validation needs a
particular format — a ULID for sortability, a prefix per site — supplies its
own generator without changing core.

Uniqueness is what the identifiers are for. Two hosts with one `hostId`
cannot be told apart in a shared store (BEH-BR-016); two records with one
`recordId` turn the sink's idempotence, which lets core retry a write whose
outcome is unknown (BEH-BR-193, BEH-BR-202), into a collision the sink must
keep or refuse; one generated `correlationId` on two unrelated calls joins
their chains for a reviewer. The scope is the store, not the process: hosts
in different processes that write to one audit store must not repeat each
other's values, and hosts that never meet in any store may.

**Settled here.** (1) The service shape (`next: Effect<string>`) and the
`serviceOption`-with-default reading are fixed here; the default keeps hosts
that never heard of `IdGenerator` working unchanged. (2) Uniqueness is the
generator's obligation, not a check core makes (CCR-BR-033). Detecting a
repeat would need every value ever drawn, by every host sharing the store,
which a host does not have. The requirement is therefore stated on the
design, with two ways to meet it, so that it can be reviewed: by
construction, or by a random bound that makes a repeat negligible — 122
random bits per value, the bits of a version 4 UUID, keep the chance of any
repeat among 2^36 values (about 69 billion) below 2^-50. The default meets
it by that bound; a repeat is negligible, not impossible, and core does not
detect one. A provided generator must meet it by design — for example a prefix that is unique per
host and assigned outside the host, followed by a counter or random part —
and a regulated user verifies that design at installation
([validation plan](../gxp/04-validation-plan.md) §5.1, check 8). A sink
still never drops a record under a repeated `recordId` (BEH-BR-193), so a
generator that breaks the rule loses no record silently.

## BEH-BR-211: Ambient time and randomness are prohibited in core

> **Invariant:** [INV-BR-024](../invariants.md#inv-br-024-time-and-identifiers-come-only-from-services)
> **See:** [ADR-BR-025](../decisions/025-deterministic-time-and-ids.md)
> **Satisfies:** [URS-BR-027](../urs.md#urs-br-027-reproduce-time-and-identifiers-during-validation)
> **Risk:** [RSK-BR-007](../gxp/03-risk-assessment.md#rsk-br-007)
> **Regulatory:** supports EU GMP Annex 11 §4 (validation); ALCOA+ Consistent

```
REQUIREMENT: Core source MUST NOT call `Date.now()`, `performance.now()`,
             `crypto.randomUUID()`, `crypto.getRandomValues()`,
             `Math.random()` or `new Date()` without an argument, except
             inside the default `IdGenerator` implementation, which may call
             `crypto.randomUUID()`.
```

```
REQUIREMENT: The prohibition MUST be enforced by an automated static check in
             the core's build, not by review alone.
```

One ambient call is enough to make a trail irreproducible: a single
`Date.now()` in a timeout path means a test that passes under `TestClock`
can behave differently in production, and a record produced there cannot be
regenerated for comparison. A static check makes the rule cheap to keep.

## BEH-BR-212: auditSeq starts at 1 per host and is contiguous

> **Invariant:** [INV-BR-023](../invariants.md#inv-br-023-the-audit-sequence-is-contiguous-per-host)
> **See:** [ADR-BR-037](../decisions/037-audit-sequence-separate-from-event-seq.md)
> **Satisfies:** [URS-BR-022](../urs.md#urs-br-022-obtain-a-complete-ordered-and-gap-detectable-lifecycle-record)
> **Risk:** [RSK-BR-006](../gxp/03-risk-assessment.md#rsk-br-006)
> **Regulatory:** supports 21 CFR 11.10(e); EU GMP Annex 11 §9; ALCOA+ Complete

```
REQUIREMENT: `auditSeq` MUST be assigned by the host's single audit writer,
             at the serialization point immediately before a record's first
             write attempt. The first record of a host MUST receive 1, and
             each subsequent record the previous number plus one.
```

```
REQUIREMENT: A number MUST belong to exactly one record for the life of the
             host and MUST NEVER be assigned to a second record.
```

```
REQUIREMENT: `auditSeq` MUST be per host (scoped by `hostId`). A new host —
             including the same application restarted — MUST start again at
             1 with a new `hostId`.
```

```
REQUIREMENT: `auditSeq` MUST be independent of the event `seq` of
             `Host.events` and of `HostSnapshot.revision`.
```

The host reports its audit position, together with its wiring and its GxP
limits, through `Host.controls` (CCR-BR-014):

```ts
// illustrative — not type-checked
interface HostControls {
  readonly hostId: string                              // HostSnapshot.hostId
  readonly wired: {
    readonly audit: boolean                            // an AuditSink was resolved (02, BEH-BR-015)
    readonly gate: boolean                             // an OperationGate was resolved
    readonly fingerprinter: boolean                    // a ConfigFingerprinter was resolved
  }
  readonly attribution: { readonly require: boolean; readonly requireReason: readonly Operation[] }
  readonly auditTimeout: Duration.Duration
  readonly gateTimeout: Duration.Duration | "forever"
  readonly fingerprintTimeout: Duration.Duration
  readonly buildTimeout: Duration.Duration             // per build, a lazy plugin's load included (05, 27)
  readonly idGenerator: "default" | "provided"         // whether an IdGenerator was supplied (BEH-BR-210)
  readonly auditPosition?: { readonly lastWritten: number }   // present only when an AuditSink is wired
  readonly policy: { /* access, refusal, capability, callLog wiring and mandatory service ids — 28, BEH-BR-265 */ }
  readonly callLog: {                                  // 29, BEH-BR-276, BEH-BR-279
    readonly failed: number                            // record calls that failed, died or timed out
    readonly dropped: number                           // entries dropped (full queue, host closing)
    readonly refused: number                           // calls refused under "refuse"
    readonly onFailure: "drop" | "refuse"              // effective port default; "drop" when no CallLog is wired
    readonly queue: number                             // hand-off queue capacity; 0 when no CallLog is wired
  }
}
// Host.controls(): Effect.Effect<HostControls>  (02 — Host Construction, BEH-BR-013)
```

```
REQUIREMENT: `Host.controls` MUST return the host's `hostId`, which of
             `AuditSink`, `OperationGate` and `ConfigFingerprinter` were
             resolved at construction, the effective `attribution`,
             `auditTimeout`, `gateTimeout`, `fingerprintTimeout` and
             `buildTimeout` after defaults are applied (02 — Host
             Construction, BEH-BR-011), and
             whether an `IdGenerator` was supplied or the default is used.
             None of these MUST change for the life of the host.
```

```
REQUIREMENT: `auditPosition` MUST be present exactly when an `AuditSink` is
             wired. `lastWritten` MUST be the highest `auditSeq` of a record
             the sink accepted (its write succeeded) for this host, or 0
             when none has been accepted. It MUST be per host and MUST NEVER
             decrease.
```

```
REQUIREMENT: `Host.controls` MUST NOT require attribution, consult the
             `OperationGate` or write a record, and MUST NOT fail. It MUST
             remain readable after the host has closed, and MUST then report
             the audit position as the writer leaves it once it has flushed
             (12 — Shutdown and Hosting, BEH-BR-106).
```

`lastWritten` lets a consumer compare what the host handed over with what its
store holds: a store whose highest `auditSeq` for this `hostId` is below
`lastWritten` has lost records the sink accepted, a loss at the tail that
BEH-BR-215 cannot see, because a missing tail leaves no gap. `Host.controls`
is also what makes the wiring and the limits of a host checkable from the
host itself, rather than from its construction code.

**Settled here.** (1) `HostControls` is not part of `HostSnapshot`: the audit
position moves on every write, and a snapshot carrying it would take one
revision per record. (2) `Host.controls` stays readable after close because
the `CloseReport` is produced before the shutdown's own terminal record is
written, so the report's `auditLastSeq` cannot include it (prototype finding
G34); the final high-water mark is read from `Host.controls` once the writer
has flushed. (3) Core reports the position; it does not compare it with any
store, and claims nothing about what the store kept
(BEH-BR-208 of 23 — Audit Sink and Record). (4) `buildTimeout` is reported
(CCR-BR-026) because a lazy plugin's `load` runs inside it (27 — Manifest
and Lazy Activation, BEH-BR-246): the loader companion must fit its fetch
and verification steps within that bound, and can now read it from the
host instead of relying on a value the application repeats (URS gap G61).

Numbering at the writer, rather than when a record is created, is what makes
the numbers the sink receives contiguous even when records are created
concurrently by several fibers: creation order may race, but the writer hands
records over one at a time and numbers them as it does.

The event `seq` exists to show a *subscriber* that it lost events; `auditSeq`
exists to show a *reader of the store* that the store lost records. Sharing
one counter would make either signal ambiguous — a gap in `seq` is normal for
a slow subscriber and would be alarming in the trail
([ADR-BR-037](../decisions/037-audit-sequence-separate-from-event-seq.md)).

## BEH-BR-213: A failed write does not consume its number

> **Invariant:** [INV-BR-023](../invariants.md#inv-br-023-the-audit-sequence-is-contiguous-per-host)
> **See:** [ADR-BR-031](../decisions/031-audit-failure-policy.md), [ADR-BR-037](../decisions/037-audit-sequence-separate-from-event-seq.md)
> **Satisfies:** [URS-BR-022](../urs.md#urs-br-022-obtain-a-complete-ordered-and-gap-detectable-lifecycle-record)
> **Risk:** [RSK-BR-006](../gxp/03-risk-assessment.md#rsk-br-006)
> **Regulatory:** supports 21 CFR 11.10(e); EU GMP Annex 11 §9; ALCOA+ Complete

```
REQUIREMENT: A record whose write attempt fails or times out MUST keep its
             `auditSeq` (and its `recordId`), and the next attempt MUST be a
             retry of that same record. No other record MAY be handed to the
             sink until it is written.
```

```
REQUIREMENT: The sequence of `auditSeq` values handed to the sink MUST
             therefore be gap-free: 1, 2, 3, ... with each number handed over
             (perhaps several times, for one record) before the next.
```

```
REQUIREMENT: Core documentation MUST state the limits of that guarantee: a
             record dropped for writer overflow, or still queued when the
             process ends, was never numbered and leaves no gap; a record
             whose write was being retried when the host closed or the
             process ended holds its number, which no later record follows,
             so it too leaves no gap among the numbers the
             sink accepted. An overflow drop is signalled by the latch, the
             error log, `HostSnapshot.auditDropped` and `droppedSinceAck`
             (23 — Audit Sink and Record, BEH-BR-196); a record unwritten
             when the host closes, by the error log and by `auditPosition`,
             whose `lastWritten` stays below its number (CCR-BR-036); a
             record still queued or mid-retry when the process dies
             abruptly, by nothing core can emit. None of them is signalled
             by the sequence.
```

The consequence for a reader of a stored trail is precise. If the sink kept
everything it acknowledged, the stored numbers are contiguous from 1. A gap in
the store therefore means the store lost, or someone removed, a record the
sink had accepted; a duplicate means the sink stored one retry twice despite
the idempotence obligation (BEH-BR-193). Neither can be caused by core.

## BEH-BR-214: auditSeq is authoritative for order; the wall clock is not

> **Invariant:** [INV-BR-023](../invariants.md#inv-br-023-the-audit-sequence-is-contiguous-per-host)
> **See:** [ADR-BR-025](../decisions/025-deterministic-time-and-ids.md), [ADR-BR-037](../decisions/037-audit-sequence-separate-from-event-seq.md)
> **Satisfies:** [URS-BR-022](../urs.md#urs-br-022-obtain-a-complete-ordered-and-gap-detectable-lifecycle-record)
> **Risk:** [RSK-BR-021](../gxp/03-risk-assessment.md#rsk-br-021)
> **Regulatory:** supports 21 CFR 11.10(e); ALCOA+ Consistent, Contemporaneous

```
REQUIREMENT: The order of a host's records MUST be defined by `auditSeq`
             alone. Core documentation MUST state that `timestamp` is not an
             ordering key.
```

```
REQUIREMENT: When the clock steps backwards (for example an NTP correction),
             core MUST NOT adjust, clamp or reorder timestamps, and MUST NOT
             fail. Records keep the time the clock reported, and a later
             `auditSeq` MAY carry an earlier `timestamp`.
```

Clamping timestamps to be monotonic would make the trail lie about what the
clock said; refusing to record would turn a time-service hiccup into a
production outage. Recording the clock's answer faithfully and ordering by
`auditSeq` keeps both facts: the order in which things happened in this host,
and what time the host believed it was.

## BEH-BR-215: verifyAuditSequence detects gaps, duplicates and disorder — and nothing more

> **Invariant:** [INV-BR-023](../invariants.md#inv-br-023-the-audit-sequence-is-contiguous-per-host)
> **See:** [ADR-BR-037](../decisions/037-audit-sequence-separate-from-event-seq.md), [ADR-BR-034](../decisions/034-gxp-companion-scope.md)
> **Satisfies:** [URS-BR-022](../urs.md#urs-br-022-obtain-a-complete-ordered-and-gap-detectable-lifecycle-record)
> **Risk:** [RSK-BR-006](../gxp/03-risk-assessment.md#rsk-br-006), [RSK-BR-018](../gxp/03-risk-assessment.md#rsk-br-018)
> **Regulatory:** supports the consumer's review under EU GMP Annex 11 §9 and 21 CFR 11.10(e) (detection only)

```ts
declare function verifyAuditSequence(records: Iterable<AuditRecord>): {
  // auditSeq values missing strictly between `after` and `before`; a missing start is { after: 0, before: first }
  readonly gaps: readonly { readonly hostId: string; readonly after: number; readonly before: number }[]
  // an auditSeq present more than once, with the recordIds found for it
  readonly duplicates: readonly { readonly hostId: string; readonly auditSeq: number; readonly recordIds: readonly string[] }[]
  // a record whose auditSeq is lower than that of an earlier record of the same host in the input
  readonly outOfOrder: readonly { readonly hostId: string; readonly auditSeq: number; readonly index: number }[]
}
```

```
REQUIREMENT: `verifyAuditSequence` MUST be a pure, total function: no
             effects, no clock, no I/O, the same result for the same input,
             and empty lists for an empty input.
```

```
REQUIREMENT: It MUST check each `hostId` separately and MUST report: every
             range of missing numbers from 1 up to the highest number present;
             every number present more than once; and every record that
             appears after a record of the same host with a higher number.
```

```
REQUIREMENT: Its name, type documentation and every guide that mentions it
             MUST describe it as gap, duplicate and order detection, and
             MUST state that it is not tamper evidence: records that were
             altered, renumbered consistently, or removed from the end of the
             trail pass it.
```

```
REQUIREMENT: It MUST NOT be described as verifying integrity, authenticity or
             completeness. In particular it cannot detect missing records
             after the highest number present.
```

This is the check a consumer runs over an export to answer "did my store lose
or duplicate anything the host handed it?". It is useful because the host's
side of the sequence is gap-free (BEH-BR-213), so any gap it finds is the
store's. It is not more than that: there is no hash, no signature and no link
from one record to the next, so anyone able to edit the store can produce a
trail that passes. Tamper evidence, where a consumer needs it, belongs to the
store or to a companion — never to a function whose name could be read as
promising it. `@bridger/audit-chain`'s `verifyChain` runs this function first
and then checks hash links and external anchors, within the limits its own
specification states ([references/audit-chain/](../../audit-chain/README.md)).

**Settled here.** (1) A trail whose lowest number is above 1 is reported as a
gap `{ after: 0, before: first }`; a caller verifying a window of a longer
trail ignores that entry knowingly, rather than the function guessing where
the window starts. (2) "Out of order" is judged against the input order,
which is taken to be the store's order; equal numbers are reported as
duplicates, not as disorder.

## BEH-BR-216: Clock accuracy is the consumer's responsibility

> **See:** [ADR-BR-025](../decisions/025-deterministic-time-and-ids.md), [ADR-BR-028](../decisions/028-gxp-scope.md)
> **Satisfies:** [URS-BR-026](../urs.md#urs-br-026-know-which-compliance-obligations-remain-mine)
> **Risk:** [RSK-BR-021](../gxp/03-risk-assessment.md#rsk-br-021), [RSK-BR-007](../gxp/03-risk-assessment.md#rsk-br-007)
> **Regulatory:** supports (by delimiting) EU GMP Annex 11 §12.4 and 21 CFR 11.10(e) time-stamping

```
REQUIREMENT: Core MUST NOT claim that its timestamps are accurate or
             synchronised. Core documentation MUST state that the accuracy
             and synchronisation of the clock behind `Clock` — the platform
             clock by default — are the consumer's responsibility, and that
             the time-stamping expected by EU GMP Annex 11 §12.4 and
             21 CFR 11.10(e) depends on them.
```

```
REQUIREMENT: A consumer that provides its own `Clock` (for example one backed
             by a trusted time source) MUST be able to do so through Effect's
             standard `Clock` service, without any core-specific API.
```

Core can promise one source of time, used everywhere, reproducible in tests.
Whether that source is right is a property of the machine, its time service
and the consumer's procedures for checking them, and it is assessed with
the consumer's infrastructure, not with a library.

---

_Previous: [23 — Audit Sink and Record](./23-audit-sink-and-record.md)_ · _Next: [25 — Operation Gate](./25-operation-gate.md)_
