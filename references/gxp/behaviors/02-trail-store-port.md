# 02 — Trail Store Port

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-GX-BEH-02                                            |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-GX-03 §5)           |
> | Approved by    | — (pending; single maintainer, see PROC-GX-03 §5)            |
> | Classification | Functional Specification                                     |
> | Change History | 0.2 (2026-11-09): BEH-GX-009–012, 014, 015 (F-02): `append` answers "stored-collision" and keeps a colliding entry beside the primary instead of failing with "conflict" (reason withdrawn); idempotence on `recordId` and digest; `TrailEntry` gains `marks`, `collision` and audit-chain's `link`, `seal` withdrawn (C-09); `HostExtent.collisions` (CCR-GX-002)<br>0.1 (2026-10-03): Initial draft (CCR-GX-001)                 |

---

Core hands each audit record to an `AuditSink` and keeps no copy
([BEH-BR-208](../../core/behaviors/23-audit-sink-and-record.md)). Where the record goes next decides whether the trail
survives a retry, a crash or a second host writing to the same database. This
file defines the `TrailStore` port: the only interface through which the
companion writes and reads stored records. It is append-only, idempotent on
`recordId` and digest, holds one primary entry per `recordId` and per host
sequence number, keeps a colliding entry beside the primary rather than
refusing or dropping it, and never overwrites. The
consumer supplies the implementation — a table, a log, an object store — and
proves it behaves as specified with the conformance suite of
[04 — Conformance Suite](./04-conformance-suite.md) ([ADR-GX-004](../decisions/004-append-only-trail-store.md),
[ADR-GX-006](../decisions/006-conformance-through-testhost.md)). This file owns BEH-GX-009–016 and uses all eight.

> **What the port does not do — and who does**
>
> The port defines what an adapter must do; it does not make storage
> durable, replicated, backed up or access-controlled. Those are properties
> of the consumer's store and infrastructure, which the adapter manifest
> ([BEH-GX-016](#beh-gx-016-every-adapter-publishes-a-manifest-of-its-commit-semantics-and-limits)) describes and the consumer's own qualification covers.
> This is the consumer's obligation.

Planned source: `packages/gxp/src/TrailStore.ts` and
`packages/gxp/src/TrailEntry.ts` *(Planned)*. The sink that writes through
the port is [03 — Trail Sink](./03-trail-sink.md); the checks that read
through it are [05 — Checks on Read](./05-checks-on-read.md).

## BEH-GX-009: The TrailStore port has three methods and no default

> **Invariant:** [INV-GX-001](../invariants.md#inv-gx-001-no-decision-port-has-a-default-outside-the-testing-entry-point), [INV-GX-008](../invariants.md#inv-gx-008-no-companion-api-rewrites-a-stored-entry)
> **See:** [ADR-GX-004](../decisions/004-append-only-trail-store.md), [ADR-GX-003](../decisions/003-ports-without-defaults.md), [ADR-BR-030](../../core/decisions/030-audit-sink-port.md)
> **Satisfies:** [URS-GX-001](../urs.md#urs-gx-001-store-audit-records-with-honest-acknowledgement)
> **Risk:** [RSK-GX-001](../gxp/03-risk-assessment.md#rsk-gx-001), [RSK-GX-002](../gxp/03-risk-assessment.md#rsk-gx-002)
> **Regulatory:** supports 21 CFR 11.10(c), 11.10(e); EU GMP Annex 11 §7.1, §9

```ts
// illustrative — not type-checked
interface TrailStoreShape {
  readonly manifest: TrailStoreManifest                                   // BEH-GX-016
  readonly append: (entry: TrailEntry) =>
    Effect.Effect<"stored" | "stored-collision" | "already-stored", TrailWriteFailed>
  readonly read: (q: { readonly hostId: string; readonly fromSeq?: number; readonly toSeq?: number }) =>
    Stream.Stream<TrailEntry, TrailReadFailed>
  readonly hosts: Effect.Effect<readonly HostExtent[], TrailReadFailed>
}
class TrailStore extends Context.Service<TrailStore, TrailStoreShape>()("@bridger/gxp/TrailStore") {}

interface HostExtent {
  readonly hostId: string
  readonly firstSeq: number        // lowest auditSeq stored for the host
  readonly lastSeq: number         // highest auditSeq stored for the host
  readonly count: number           // number of primary entries stored for the host
  readonly collisions: number      // number of collision entries stored for the host (BEH-GX-012)
}

class TrailWriteFailed extends Schema.TaggedError<TrailWriteFailed>()("TrailWriteFailed", {
  reason: Schema.Literal("unavailable", "too-large", "rejected"),     // "conflict" withdrawn (CCR-GX-002)
  message: Schema.String
}) {}
class TrailReadFailed extends Schema.TaggedError<TrailReadFailed>()("TrailReadFailed", {
  reason: Schema.Literal("unavailable", "rejected"),
  message: Schema.String
}) {}
```

```
REQUIREMENT: A `TrailStore` MUST implement exactly `manifest`, `append`,
             `read` and `hosts`. It MUST NOT offer, through this port, any
             method that updates, replaces, deletes or truncates an entry.
```

```
REQUIREMENT: The companion MUST NOT provide a `TrailStore` in its main entry
             point (BEH-GX-003). `memoryTrailStore` and `faultyTrailStore`
             exist only in `@bridger/gxp/testing` (BEH-GX-145).
```

```
REQUIREMENT: Every method MUST be safe to call concurrently from several hosts
             and several readers. Concurrency MUST NOT weaken any rule of
             BEH-GX-011 to BEH-GX-014.
```

```
REQUIREMENT: `TrailWriteFailed.message` and `TrailReadFailed.message` written
             by an adapter MUST NOT contain an entry's canonical text, a field
             value of the record, or a credential. The companion never
             forwards these messages (BEH-GX-006); the rule protects the
             adapter's own logs.
```

The port is the narrowest one that lets the sink write and the checks read:
one write, one ranged read per host, and a list of hosts. A query language,
an index or a search would belong to a review tool, which neither package
provides ([ADR-BR-034](../../core/decisions/034-gxp-companion-scope.md) non-claim 12).

## BEH-GX-010: A TrailEntry carries the record, its canonical text and its digest

> **Invariant:** [INV-GX-012](../invariants.md#inv-gx-012-the-canonical-form-is-deterministic-across-platforms), [INV-GX-008](../invariants.md#inv-gx-008-no-companion-api-rewrites-a-stored-entry)
> **See:** [ADR-GX-005](../decisions/005-jcs-and-sha256.md), [ADR-GX-023](../decisions/023-archives-keep-original-bytes.md), [ADR-BR-030](../../core/decisions/030-audit-sink-port.md)
> **Satisfies:** [URS-GX-001](../urs.md#urs-gx-001-store-audit-records-with-honest-acknowledgement), [URS-GX-003](../urs.md#urs-gx-003-detect-lost-duplicated-reordered-or-altered-stored-records)
> **Risk:** [RSK-GX-015](../gxp/03-risk-assessment.md#rsk-gx-015), [RSK-GX-019](../gxp/03-risk-assessment.md#rsk-gx-019)
> **Regulatory:** supports 21 CFR 11.10(b), 11.10(e); EU GMP Annex 11 §8.1; ALCOA+ Original, Accurate

```ts
// illustrative — not type-checked
interface TrailEntry {
  readonly hostId: string            // = record.hostId
  readonly auditSeq: number          // = record.auditSeq
  readonly recordId: string          // = record.recordId
  readonly record: AuditRecord       // as the store holds it (columns, a document, or parsed from `canonical`)
  readonly canonical: string         // RFC 8785 JCS text of the record, exactly as written
  readonly digest: string            // "sha256:" + hex(SHA-256(UTF-8(canonical)))
  readonly marks?: {                 // set by the sink (03 — Trail Sink, BEH-GX-018)
    readonly schema?: "unsupported"          // schemaVersion or a field the supported schema does not know
    readonly canonical?: "jcs-escaped"       // the record is not I-JSON; `canonical` is the escaped encoding
  }
  readonly collision?: {             // set by the store (BEH-GX-012); absent on a primary entry
    readonly reason: "record-id" | "host-seq"
    readonly with: string            // `digest` of the primary entry it collided with
  }
  readonly link?: ChainLinkV1        // only when sealing is on: @bridger/audit-chain's link (21, BEH-GX-170)
}
```

```
REQUIREMENT: `canonical` MUST be the RFC 8785 canonical JSON text of `record`
             as handed to the sink, computed by the companion (BEH-GX-002).
             `digest` MUST be "sha256:" followed by the lower-case hexadecimal
             SHA-256 of the UTF-8 bytes of `canonical`. `hostId`, `auditSeq`
             and `recordId` MUST equal the record's fields of the same names.
```

```
REQUIREMENT: The store MUST keep `canonical` as an exact sequence of Unicode
             code points and MUST return it from `read` unchanged. It MUST NOT
             re-serialise, re-indent, normalise (NFC, NFD or otherwise), trim
             or re-escape it.
```

```
REQUIREMENT: A store that keeps the record in a structured form as well MUST
             return that form as `record`; a store that keeps only `canonical`
             MUST return as `record` the parse of `canonical`. Either way the
             store MUST NOT correct `record` to match `canonical`, or the
             reverse: a disagreement is reported by the checks as
             `canonicalMismatch` (BEH-GX-034).
```

```
REQUIREMENT: `marks`, `collision` and `link` MUST be stored and returned
             beside the record, never inside it, exactly as written. Nothing
             in `canonical` or `digest` MAY depend on them. `collision` MUST
             be set by the store and by nothing else.
```

`canonical` is the original. The structured `record` exists so that a store
can index or display fields without parsing text, but it is a copy, and the
checks compare it with the original rather than trust it. Keeping the text
byte for byte is what lets anyone recompute the digest years later with any
RFC 8785 implementation and get the same answer ([ADR-GX-023](../decisions/023-archives-keep-original-bytes.md)).

**Settled here.** The entry repeats `hostId`, `auditSeq` and `recordId` at
its top level. A store needs them as keys, and naming them in the port means
an adapter never has to parse a record to enforce uniqueness
([BEH-GX-012](#beh-gx-012-one-primary-entry-per-recordid-and-per-host-sequence-number-a-collision-is-kept-beside-it-never-over-it)); the companion sets them from the record, and the checks
report any entry where they disagree as `canonicalMismatch`.

## BEH-GX-011: append answers "stored" only after commit and is idempotent on recordId and digest

> **Invariant:** [INV-GX-007](../invariants.md#inv-gx-007-the-sink-acknowledges-only-what-the-store-reports-stored), [INV-GX-006](../invariants.md#inv-gx-006-one-primary-entry-per-record-and-per-host-sequence-number-and-no-stored-record-is-displaced)
> **See:** [ADR-GX-004](../decisions/004-append-only-trail-store.md), [ADR-BR-030](../../core/decisions/030-audit-sink-port.md), [ADR-BR-031](../../core/decisions/031-audit-failure-policy.md)
> **Satisfies:** [URS-GX-001](../urs.md#urs-gx-001-store-audit-records-with-honest-acknowledgement)
> **Risk:** [RSK-GX-001](../gxp/03-risk-assessment.md#rsk-gx-001), [RSK-GX-002](../gxp/03-risk-assessment.md#rsk-gx-002)
> **Regulatory:** supports 21 CFR 11.10(e); EU GMP Annex 11 §7.1, §9; ALCOA+ Complete, Enduring (as far as the store provides it)

| Situation at `append(e)` | Answer |
| --- | --- |
| No entry with `e.recordId` and none at `(e.hostId, e.auditSeq)` | commit `e` as the primary entry, then `"stored"` |
| An entry (primary or collision) with `e.recordId` and `e.digest` exists | `"already-stored"`, nothing written |
| A primary entry with `e.recordId` exists with a different `digest` | commit `e` as a collision entry, `collision.reason` "record-id", then `"stored-collision"` |
| No entry with `e.recordId`, but a primary entry at `(e.hostId, e.auditSeq)` | commit `e` as a collision entry, `collision.reason` "host-seq", then `"stored-collision"` |
| `e.canonical` exceeds `manifest.maxEntryBytes` | `TrailWriteFailed { reason: "too-large" }`, nothing written |
| The store cannot decide (connection lost, timeout, server refusal) | `TrailWriteFailed { reason: "unavailable" }` or a defect; the entry may or may not have been committed |

```
REQUIREMENT: `append` MUST answer "stored" only after the entry has been
             committed in the sense the manifest's `commit` field declares
             (BEH-GX-016), and MUST NOT answer before.
```

```
REQUIREMENT: `append` of an entry whose `recordId` is already stored with an
             equal `digest` MUST answer "already-stored" and MUST NOT write a
             second copy, change the stored entry, or change its `link`.
```

```
REQUIREMENT: When `append` fails, it MUST NOT leave a partial entry: after any
             failure, a later `read` MUST return either the whole entry with
             every field as appended, or no entry for that `recordId`.
```

```
REQUIREMENT: The answer of `append` for a given entry MUST depend only on what
             is stored, as the table above states. In particular a retry of an
             `append` whose first attempt committed and then failed or hung
             MUST answer "already-stored".
```

Core retries a write whose outcome it does not know, with the same record in
every field ([BEH-BR-202](../../core/behaviors/23-audit-sink-and-record.md)), and requires the sink to absorb a repeat
([BEH-BR-193](../../core/behaviors/23-audit-sink-and-record.md)). Idempotence on `recordId` and digest is what makes that safe: a
write that reached the store before its connection dropped is retried,
answered "already-stored", and leaves one entry. Comparing digests on the
repeat is what stops idempotence from becoming a back door — a different
record that reuses an identifier is stored as a collision and counted, never
answered as a silent success and never dropped.

## BEH-GX-012: One primary entry per recordId and per host sequence number; a collision is kept beside it, never over it

> **Invariant:** [INV-GX-006](../invariants.md#inv-gx-006-one-primary-entry-per-record-and-per-host-sequence-number-and-no-stored-record-is-displaced), [INV-GX-008](../invariants.md#inv-gx-008-no-companion-api-rewrites-a-stored-entry)
> **See:** [ADR-GX-004](../decisions/004-append-only-trail-store.md), [ADR-BR-037](../../core/decisions/037-audit-sequence-separate-from-event-seq.md)
> **Satisfies:** [URS-GX-001](../urs.md#urs-gx-001-store-audit-records-with-honest-acknowledgement), [URS-GX-003](../urs.md#urs-gx-003-detect-lost-duplicated-reordered-or-altered-stored-records)
> **Risk:** [RSK-GX-002](../gxp/03-risk-assessment.md#rsk-gx-002)
> **Regulatory:** supports 21 CFR 11.10(e) ("shall not obscure previously recorded information"); EU GMP Annex 11 §9

```
REQUIREMENT: A store MUST hold at most one primary entry per `recordId`,
             across all hosts, and at most one primary entry per `(hostId,
             auditSeq)`, and at most one entry of any kind per `(recordId,
             digest)`. These constraints MUST hold under concurrent appends
             from any number of writers.
```

```
REQUIREMENT: An `append` of a different entry under a stored `recordId` or
             `(hostId, auditSeq)` MUST store it as a collision entry, with
             `collision` naming the reason and the primary's `digest`, and
             answer "stored-collision". It MUST leave the primary entry
             exactly as it was. No store MAY resolve a collision by keeping
             the newer entry as primary, merging the two, renumbering either,
             or dropping the newer one.
```

```
REQUIREMENT: The uniqueness MUST be enforced by the store itself (a unique
             index, a conditional write, a single-writer log), not by a
             read-then-write sequence in the adapter that a concurrent writer
             can interleave.
```

Two hosts never share a `hostId` ([BEH-BR-016](../../core/behaviors/02-host-construction.md)), and one host numbers its
records without gaps or repeats ([BEH-BR-212](../../core/behaviors/24-time-ids-and-sequence.md)). A collision therefore means
something outside core is wrong: two processes started with the same
`hostId`, a restored backup replaying old records into a live table, or a
record altered in transit. Each of these must be visible, and none of them
is a reason to stop recording. Revision 0.1 failed the append, which set the
latch and then refused every retry of the same record for the life of the
host — the newer record was never stored. Keeping it beside the primary
stores both, the checks report the pair as `collision`
([BEH-GX-034](./05-checks-on-read.md#beh-gx-034-checktrailentries-is-a-pure-check-over-entries-reusing-verifyauditsequence)), and `trailGate` refuses operator changes until the
count has been looked at ([BEH-GX-177](./22-trail-status-and-gate.md#beh-gx-177-trailgate-refuses-operator-changes-while-the-sink-reports-a-condition-of-its-own)); overwriting would hide it.

## BEH-GX-013: The port offers no update and no delete

> **Invariant:** [INV-GX-008](../invariants.md#inv-gx-008-no-companion-api-rewrites-a-stored-entry)
> **See:** [ADR-GX-004](../decisions/004-append-only-trail-store.md), [ADR-GX-023](../decisions/023-archives-keep-original-bytes.md), [ADR-BR-034](../../core/decisions/034-gxp-companion-scope.md)
> **Satisfies:** [URS-GX-001](../urs.md#urs-gx-001-store-audit-records-with-honest-acknowledgement), [URS-GX-015](../urs.md#urs-gx-015-export-and-archive-a-trail-with-its-approvals)
> **Risk:** [RSK-GX-002](../gxp/03-risk-assessment.md#rsk-gx-002), [RSK-GX-004](../gxp/03-risk-assessment.md#rsk-gx-004)
> **Regulatory:** supports 21 CFR 11.10(e); EU GMP Annex 11 §9, §17

```
REQUIREMENT: No companion API MAY update, replace or delete a stored entry,
             its canonical text, its digest, its marks, its collision or its link.
```

```
REQUIREMENT: Retention, archival removal and disposal of entries MUST happen
             outside the companion, under the consumer's own procedures. The
             export of BEH-GX-137 MUST be taken before any removal; the
             companion MUST NOT offer a function that removes what it
             exported.
```

```
REQUIREMENT: Documentation of the port MUST state that "append-only" describes
             the port and not the store: an administrator with direct access
             to the store can still change or remove entries, and only the
             checks of 05 and the optional sealing of 21 can detect such a
             change.
```

This is the companion's half of "no rewrite": nothing it ships can alter an
entry. It cannot stop a database administrator, and saying otherwise would
be the over-claim of [RSK-GX-004](../gxp/03-risk-assessment.md#rsk-gx-004). What it offers against that party is
detection — digest checks always, and seal verification where sealing is on —
with the limits those files state.

## BEH-GX-014: read returns one host's entries in ascending sequence, exactly as stored

> **See:** [ADR-GX-004](../decisions/004-append-only-trail-store.md), [ADR-GX-007](../decisions/007-checks-never-claim-integrity.md)
> **Satisfies:** [URS-GX-003](../urs.md#urs-gx-003-detect-lost-duplicated-reordered-or-altered-stored-records), [NFR-GX-006](../urs.md#nfr-gx-006-bounded-memory-on-read)
> **Risk:** [RSK-GX-001](../gxp/03-risk-assessment.md#rsk-gx-001)
> **Regulatory:** supports 21 CFR 11.10(b), 11.10(e); EU GMP Annex 11 §8.1, §9

```
REQUIREMENT: `read({ hostId, fromSeq, toSeq })` MUST emit every stored entry
             of that host whose `auditSeq` lies in the inclusive range
             `[fromSeq ?? 1, toSeq ?? +infinity]`, in ascending `auditSeq`,
             each exactly once; at one `auditSeq` the primary entry first,
             then its collision entries in the order they were stored.
```

```
REQUIREMENT: An entry for which `append` has answered "stored",
             "stored-collision" or "already-stored" MUST be emitted by every `read` that starts
             after that answer and whose range includes it.
```

```
REQUIREMENT: `read` MUST be a stream that a consumer can pull in pages: the
             store MUST NOT load the whole range into memory before emitting
             the first entry, and MUST NOT emit an entry before it can emit it
             whole.
```

```
REQUIREMENT: When the store cannot complete a read, the stream MUST fail with
             `TrailReadFailed`. It MUST NOT end normally after emitting only
             part of the range.
```

```
REQUIREMENT: `read` MUST NOT verify, filter, repair or reorder what it returns
             beyond sorting by `auditSeq`. An entry whose digest or canonical
             text is wrong MUST be returned as stored, for the checks to
             report.
```

The read side is deliberately dumb. A store that "helpfully" skips entries it
cannot parse would make a corrupt entry look like a gap, or no defect at all;
returning everything as stored lets the checks name each defect for what it
is ([BEH-GX-033](./05-checks-on-read.md#beh-gx-033-a-check-report-lists-findings-by-kind-and-claims-only-the-absence-of-the-checked-kinds)). The streaming rule is what lets
[BEH-GX-034](./05-checks-on-read.md#beh-gx-034-checktrailentries-is-a-pure-check-over-entries-reusing-verifyauditsequence) check a host with millions of entries in bounded memory
([NFR-GX-006](../urs.md#nfr-gx-006-bounded-memory-on-read)).

## BEH-GX-015: hosts lists every host with stored entries and its extent

> **See:** [ADR-GX-004](../decisions/004-append-only-trail-store.md), [ADR-GX-008](../decisions/008-high-water-anchors.md)
> **Satisfies:** [URS-GX-003](../urs.md#urs-gx-003-detect-lost-duplicated-reordered-or-altered-stored-records), [URS-GX-004](../urs.md#urs-gx-004-detect-loss-of-the-newest-records)
> **Risk:** [RSK-GX-003](../gxp/03-risk-assessment.md#rsk-gx-003)
> **Regulatory:** supports EU GMP Annex 11 §9

```
REQUIREMENT: `hosts` MUST return one `HostExtent` for every `hostId` with at
             least one stored entry, sorted by `hostId` in code-point order,
             and none for any other.
```

```
REQUIREMENT: `firstSeq`, `lastSeq`, `count` and `collisions` MUST be the
             lowest `auditSeq`, the highest `auditSeq`, the number of primary
             entries and the number of collision entries stored for the host
             at a single point in time. The extent MUST NOT be estimated
             or cached across appends.
```

`count` is not trusted on its own: a `count` of `lastSeq − firstSeq + 1`
does not prove there is no gap, and the checks read the entries rather than
compare numbers. The extent is there so that a checker or an export can be
planned — which hosts, which ranges — and so that the high-water comparison
of [BEH-GX-044](./06-high-water-marks-and-anchors.md#beh-gx-044-at-close-the-mark-comes-from-hostcontrols-after-the-flush-never-from-closereportauditlastseq-alone) can be answered without reading a whole trail.

## BEH-GX-016: Every adapter publishes a manifest of its commit semantics and limits

> **See:** [ADR-GX-004](../decisions/004-append-only-trail-store.md), [ADR-GX-006](../decisions/006-conformance-through-testhost.md), [ADR-GX-020](../decisions/020-iq-proof-and-probe.md)
> **Satisfies:** [URS-GX-002](../urs.md#urs-gx-002-show-that-a-trail-adapter-conforms), [URS-GX-016](../urs.md#urs-gx-016-know-which-obligations-remain-mine)
> **Risk:** [RSK-GX-001](../gxp/03-risk-assessment.md#rsk-gx-001), [RSK-GX-004](../gxp/03-risk-assessment.md#rsk-gx-004)
> **Regulatory:** supports EU GMP Annex 11 §4.5, §7.1 (by stating, not providing, storage properties); GAMP 5 configuration specification

```ts
// illustrative — not type-checked
interface TrailStoreManifest {
  readonly name: string                          // e.g. "acme-postgres-trail"
  readonly version: string                       // the adapter's own version, semver
  readonly commit:                               // what "stored" means
    | "local-flush"                              // written and flushed on one node
    | "synchronous-replica"                      // acknowledged by at least one replica before "stored"
    | "quorum"                                   // acknowledged by a quorum before "stored"
    | "in-memory"                                // nothing survives the process (testing only)
  readonly isolation: "serializable" | "single-writer-log" | "conditional-write"
  readonly maxEntryBytes: number                 // UTF-8 bytes of `canonical`; at least 65536
  readonly fixture?: true                        // set only by @bridger/gxp/testing (BEH-GX-145)
}
```

```
REQUIREMENT: `manifest` MUST be a constant value, readable without I/O.
             `maxEntryBytes` MUST be an integer of at least 65536.
```

```
REQUIREMENT: `append` of an entry whose `canonical` exceeds `maxEntryBytes` in
             UTF-8 MUST fail with `TrailWriteFailed { reason: "too-large" }`
             before any write is attempted.
```

```
REQUIREMENT: The manifest MUST be copied, unchanged, into every evidence pack
             produced for the store (BEH-GX-129) and into every conformance
             run's output (BEH-GX-031). The installation checks MUST refuse a
             manifest with `commit: "in-memory"` or `fixture: true`
             (BEH-GX-113).
```

```
REQUIREMENT: The companion MUST treat the manifest as a declaration and MUST
             NOT describe it as verified. The conformance suite checks the
             behaviour of the port; it cannot check that `commit` is true of
             the infrastructure, and its output MUST say so.
```

The manifest turns properties the companion cannot test into statements
someone is accountable for. "Stored" means something different on a single
SQLite file and on a three-node cluster; the suite of
[04 — Conformance Suite](./04-conformance-suite.md) shows that the adapter
answers correctly under injected faults, and the manifest says what kind of
commit those answers stand for. Whether that is enough for the regulated
user's data is their risk decision. This is the consumer's obligation.

**Settled here.** `maxEntryBytes` has a floor of 64 KiB. Core records carry
no values, so a record's size is bounded by identifiers, a reason and a path
list; a reason of several kilobytes and a few hundred paths stay well under
64 KiB, and a store that cannot hold that much per entry would refuse
legitimate records and set the latch.

---

_Previous: [01 — Companion Boundary](./01-companion-boundary.md)_ · _Next: [03 — Trail Sink](./03-trail-sink.md)_
