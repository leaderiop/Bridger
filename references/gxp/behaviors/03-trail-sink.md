# 03 — Trail Sink

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-GX-BEH-03                                            |
> | Revision       | 0.3                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-GX-03 §5)           |
> | Approved by    | — (pending; single maintainer, see PROC-GX-03 §5)            |
> | Classification | Functional Specification                                     |
> | Change History | 0.3 (2026-11-10): BEH-GX-017: one `trailSink` layer and its status serve exactly one host, as audit-chain's chain sink does; a second host's record is stored, never refused (H6) (CCR-GX-005)<br>0.2 (2026-11-09): BEH-GX-017–024 re-baselined (F-02): the sink stores and marks a record of an unsupported schema or one that is not I-JSON instead of refusing it, fails a write only when the store did not store the record, accepts "stored-collision", provides `TrailSinkStatus`; canonical domain widened to I-JSON with a record vector; sealing through `@bridger/audit-chain` (C-09) (CCR-GX-002)<br>0.1 (2026-10-03): Initial draft (CCR-GX-001)                 |

---

`trailSink` is the companion's `AuditSink`: the piece core calls for every
record, and the only place where a record becomes a stored entry. Its whole
job is to be honest about one answer — whether the store has the record — and
to add nothing that could make that answer wrong: no buffer that acknowledges
early, no background retry that reorders, no error swallowed into a success.
Core already retries in place and fails closed ([BEH-BR-202](../../core/behaviors/23-audit-sink-and-record.md),
[BEH-BR-203](../../core/behaviors/23-audit-sink-and-record.md)), and a retried record keeps its `auditSeq` ([BEH-BR-213](../../core/behaviors/24-time-ids-and-sequence.md)); the sink's duty is to give core a truthful result for each
attempt.

The same honesty runs the other way. A failed write is retried by core with
the same record until the latch stops operator changes
([BEH-BR-205](../../core/behaviors/23-audit-sink-and-record.md)), and a record the sink refuses for a reason of its own is refused
on every retry, so recording stops for the life of the host. Core therefore
asks a sink to fail only when it did not store the record
([BEH-BR-193](../../core/behaviors/23-audit-sink-and-record.md)) and, when it wants operator changes refused for a
condition of its own, to say so through a gate piece and keep accepting
records ([BEH-BR-202](../../core/behaviors/23-audit-sink-and-record.md), Settled (0)). The sink follows that rule
([ADR-GX-030](../decisions/030-sink-marks-and-gate-refuses.md)): a record of a schema it does not know, or one it cannot canonicalise
exactly, is stored with a marker and counted; the companion's gate piece
`trailGate` reads those counts and refuses operator changes
([22 — Trail Status and Gate](./22-trail-status-and-gate.md)); and the only failure the sink reports is the
store's own. This file owns BEH-GX-017–024 and uses all eight.

Planned source: `packages/gxp/src/trailSink.ts` *(Planned)*. The port it
writes through is [02 — Trail Store Port](./02-trail-store-port.md); sealing, when it is on, is
`@bridger/audit-chain` wrapped around the same steps
([21 — Sealing through audit-chain](./21-sealing-through-audit-chain.md)).

## BEH-GX-017: trailSink turns a TrailStore into core's AuditSink and a status

> **Invariant:** [INV-GX-007](../invariants.md#inv-gx-007-the-sink-acknowledges-only-what-the-store-reports-stored), [INV-GX-016](../invariants.md#inv-gx-016-the-sink-never-refuses-a-record-for-a-condition-of-its-own)
> **See:** [ADR-GX-004](../decisions/004-append-only-trail-store.md), [ADR-GX-030](../decisions/030-sink-marks-and-gate-refuses.md), [ADR-BR-030](../../core/decisions/030-audit-sink-port.md), [ADR-BR-031](../../core/decisions/031-audit-failure-policy.md)
> **Satisfies:** [URS-GX-001](../urs.md#urs-gx-001-store-audit-records-with-honest-acknowledgement)
> **Risk:** [RSK-GX-001](../gxp/03-risk-assessment.md#rsk-gx-001), [RSK-GX-023](../gxp/03-risk-assessment.md#rsk-gx-023)
> **Regulatory:** supports 21 CFR 11.10(e); EU GMP Annex 11 §9

```ts
// illustrative — not type-checked
declare function trailSink(
  store: TrailStoreShape,
  options?: {
    readonly sealing?: SealingOptions | "off"     // default "off" (21 — Sealing through audit-chain)
  }
): Layer.Layer<AuditSink | TrailSinkStatus>       // TrailSinkStatus: 22, BEH-GX-176
```

```
REQUIREMENT: `trailSink` MUST return a layer that provides core's `AuditSink`
             and the read-only `TrailSinkStatus` of BEH-GX-176, and nothing
             else. Each call of `AuditSink.record(r)` MUST perform the steps
             of this file in this order: classify the schema (BEH-GX-018),
             canonicalise and digest (BEH-GX-018), call `store.append`
             exactly once (BEH-GX-020) — through `@bridger/audit-chain` when
             sealing is on (BEH-GX-022) — verify an "already-stored" answer
             (BEH-GX-021), count the outcome (BEH-GX-024), and answer core
             (BEH-GX-019).
```

```
REQUIREMENT: `trailSink` MUST NOT call any mutating operation of a host
             (BEH-BR-193) and MUST NOT read the host's snapshot, events or
             controls while recording.
```

```
REQUIREMENT: One `trailSink` layer, with the `TrailSinkStatus` it provides,
             MUST serve exactly one host, as audit-chain's `HashChainSink`
             does (BEH-AC-001): each host MUST be given a layer built for it,
             and documentation MUST say so. A record of a second host that
             reaches the layer MUST still be stored by the steps of this file
             — never refused — and logged at error level once, naming no
             record field; with sealing on, audit-chain appends it with a
             break marker (BEH-AC-005).
```

`options` is optional in this signature because `trailSink` is also usable on
its own, outside `GxpLayer.make`; the absence of `sealing` means "off", which
is the documented default of [ADR-GX-029](../decisions/029-sealing-through-audit-chain.md) and not a decision port.
`GxpLayer.make` passes it explicitly ([BEH-GX-004](./01-companion-boundary.md#beh-gx-004-gxplayermake-requires-every-port-and-a-missing-port-is-a-type-error)).

## BEH-GX-018: The sink classifies, canonicalises and digests every record, and marks what it cannot handle exactly instead of refusing it

> **Invariant:** [INV-GX-012](../invariants.md#inv-gx-012-the-canonical-form-is-deterministic-across-platforms), [INV-GX-016](../invariants.md#inv-gx-016-the-sink-never-refuses-a-record-for-a-condition-of-its-own), [INV-GX-005](../invariants.md#inv-gx-005-no-configuration-value-or-key-material-appears-in-any-companion-output)
> **See:** [ADR-GX-005](../decisions/005-jcs-and-sha256.md), [ADR-GX-025](../decisions/025-core-version-range.md), [ADR-GX-030](../decisions/030-sink-marks-and-gate-refuses.md), [ADR-BR-030](../../core/decisions/030-audit-sink-port.md)
> **Satisfies:** [URS-GX-001](../urs.md#urs-gx-001-store-audit-records-with-honest-acknowledgement), [URS-GX-003](../urs.md#urs-gx-003-detect-lost-duplicated-reordered-or-altered-stored-records)
> **Risk:** [RSK-GX-015](../gxp/03-risk-assessment.md#rsk-gx-015), [RSK-GX-019](../gxp/03-risk-assessment.md#rsk-gx-019), [RSK-GX-023](../gxp/03-risk-assessment.md#rsk-gx-023)
> **Regulatory:** supports 21 CFR 11.10(e); ALCOA+ Original, Accurate, Complete

| The record | Entry written | `marks` |
| --- | --- | --- |
| `schemaVersion` supported and every field defined by the supported schema (BEH-GX-007) | `canonical` = RFC 8785 text | — |
| `schemaVersion` not supported, or a field the supported schema does not define | `canonical` = RFC 8785 text of the record as received | `schema: "unsupported"` |
| not I-JSON: a string holding a lone surrogate, or a value JSON cannot represent | `canonical` = the escaped encoding below | `canonical: "jcs-escaped"` |

```
REQUIREMENT: The sink MUST build the entry as BEH-GX-010 specifies:
             `canonical` the RFC 8785 text of the record exactly as received,
             `digest` its SHA-256, and `hostId`, `auditSeq`, `recordId`
             copied from the record. It MUST NOT add, remove, reorder or
             rewrite any field of the record before canonicalising. The
             canonical domain is the whole of I-JSON (RFC 7493): strings,
             finite numbers written as RFC 8785 §3.2.2.3 writes them —
             including the non-integer numbers an annotation value may hold
             (BEH-BR-195, BEH-BR-293) — booleans, null, arrays and objects.
```

```
REQUIREMENT: A record whose `schemaVersion` is not in the supported list, or
             that has a field the supported schema does not define, MUST be
             stored, unchanged, with `marks.schema` "unsupported", counted in
             `TrailSinkStatus.unsupportedSchema` and logged at warning level.
             The sink MUST NOT refuse it and MUST NOT drop, rename or
             default any field of it.
```

```
REQUIREMENT: When the record is not I-JSON, `canonical` MUST be the RFC 8785
             serialization in which each lone surrogate is written as a
             lower-case `\uXXXX` escape — the encoding of BEH-AC-003, as
             ECMAScript's well-formed `JSON.stringify` writes it — and in
             which any other value JSON cannot represent is written as
             `null`, and the entry MUST carry `marks.canonical`
             "jcs-escaped". The record MUST be stored, counted in
             `TrailSinkStatus.nonCanonical` and logged at warning level;
             the sink MUST NOT refuse it.
```

```
REQUIREMENT: The canonical text and digest MUST be computed afresh from the
             record on every attempt. The sink MUST NOT cache them between
             attempts in a way that a retry with an equal record could
             observe.
```

Canonicalising in the sink, not in the adapter, means every adapter stores
the same bytes for the same record, and the checks of
[05 — Checks on Read](./05-checks-on-read.md) can recompute both without
knowing which adapter wrote them. A marked entry is still an original: its
`record` is what core handed over, and the marker says that `canonical` is
the escaped form or that the companion does not know the shape. Refusing it
instead, as revision 0.1 required, would have stopped recording for the life
of the host the first time core wrote a field the companion did not know —
an annotation value, a new transition — and a record that core retries
forever is a record nobody stores. The vector below is a record whose
annotation holds non-integer numbers; check 17 recomputes it.

```vector
{"input": {"schemaVersion": 1, "recordId": "r-000412", "hostId": "h-7f3a", "auditSeq": 412, "timestamp": "2026-11-09T08:15:02.117Z", "actor": {"id": "u:jrivera", "kind": "user", "display": "J. Rivera"}, "reason": "CC-2026-114: assay limits", "correlationId": "APR-0419", "operation": "reconfigure", "target": {"id": "stabilität-monitor", "realm": "qc"}, "phase": "requested", "definition": {"version": "1.0.3"}, "configChange": {"paths": ["alerts.0.threshold"]}, "annotations": [{"key": "lims.batch", "value": {"lot": "L-7", "purity": 99.5, "tolerance": 1e-07, "weightKg": 2.0}}], "auditDropped": 0}, "canonical": "{\"actor\":{\"display\":\"J. Rivera\",\"id\":\"u:jrivera\",\"kind\":\"user\"},\"annotations\":[{\"key\":\"lims.batch\",\"value\":{\"lot\":\"L-7\",\"purity\":99.5,\"tolerance\":1e-7,\"weightKg\":2}}],\"auditDropped\":0,\"auditSeq\":412,\"configChange\":{\"paths\":[\"alerts.0.threshold\"]},\"correlationId\":\"APR-0419\",\"definition\":{\"version\":\"1.0.3\"},\"hostId\":\"h-7f3a\",\"operation\":\"reconfigure\",\"phase\":\"requested\",\"reason\":\"CC-2026-114: assay limits\",\"recordId\":\"r-000412\",\"schemaVersion\":1,\"target\":{\"id\":\"stabilität-monitor\",\"realm\":\"qc\"},\"timestamp\":\"2026-11-09T08:15:02.117Z\"}", "sha256": "55648c89daec0f24530ba36ce1df4ca81196c3b8c03909ddf95856e7dee0d660"}
```

## BEH-GX-019: The sink fails a write only when the store did not store the record, and every failure is AuditWriteFailed without record content

> **Invariant:** [INV-GX-007](../invariants.md#inv-gx-007-the-sink-acknowledges-only-what-the-store-reports-stored), [INV-GX-016](../invariants.md#inv-gx-016-the-sink-never-refuses-a-record-for-a-condition-of-its-own), [INV-GX-005](../invariants.md#inv-gx-005-no-configuration-value-or-key-material-appears-in-any-companion-output)
> **See:** [ADR-GX-004](../decisions/004-append-only-trail-store.md), [ADR-GX-030](../decisions/030-sink-marks-and-gate-refuses.md), [ADR-BR-030](../../core/decisions/030-audit-sink-port.md), [ADR-BR-031](../../core/decisions/031-audit-failure-policy.md), [ADR-BR-008](../../core/decisions/008-error-taxonomy.md)
> **Satisfies:** [URS-GX-001](../urs.md#urs-gx-001-store-audit-records-with-honest-acknowledgement), [NFR-GX-007](../urs.md#nfr-gx-007-no-secrets-in-any-output)
> **Risk:** [RSK-GX-001](../gxp/03-risk-assessment.md#rsk-gx-001), [RSK-BR-004](../../core/gxp/03-risk-assessment.md#rsk-br-004), [RSK-BR-006](../../core/gxp/03-risk-assessment.md#rsk-br-006)
> **Regulatory:** supports 21 CFR 11.10(e); EU GMP Annex 11 §9; ALCOA+ Complete

| Outcome of the attempt | Answer to core | `AuditWriteFailed.message` |
| --- | --- | --- |
| `append` → "stored" | success | — |
| `append` → "stored-collision" ([BEH-GX-012](./02-trail-store-port.md#beh-gx-012-one-primary-entry-per-recordid-and-per-host-sequence-number-a-collision-is-kept-beside-it-never-over-it)) | success | — |
| `append` → "already-stored", read-back holds an equal entry ([BEH-GX-021](#beh-gx-021-an-already-stored-answer-is-verified-and-a-store-that-does-not-hold-the-entry-has-failed)) | success | — |
| `append` → "already-stored", read-back holds no equal entry | failure | "trail store answered already-stored for an entry it does not hold (<adapter>)" |
| `TrailWriteFailed { reason: "too-large" }` | failure | "record exceeds the trail store's entry size limit (<adapter>)" |
| `TrailWriteFailed { reason: "unavailable" \| "rejected" }` | failure | "trail store unavailable (<adapter>)" |
| defect, or an answer that is not one of the three literals | failure | "trail store failed unexpectedly (<adapter>)" |
| with sealing on, audit-chain's keyed hasher failed (BEH-AC-008) | failure | "keyed hasher unavailable (@bridger/audit-chain)" |

```
REQUIREMENT: The sink MUST succeed only in the three success rows of the
             table, and only after `append` has returned. Every other outcome
             MUST fail with `AuditWriteFailed`. Every failure row is a case
             in which the store did not, or cannot be shown to, hold the
             record; the sink MUST NOT fail for any other reason.
```

```
REQUIREMENT: `AuditWriteFailed.message` MUST be one of the templates of the
             table, with `<adapter>` replaced by `manifest.name`. It MUST NOT
             contain any field of the record, the canonical text, the
             digest, or the message or cause of the store's error
             (BEH-GX-006).
```

```
REQUIREMENT: A defect raised by the store MUST be turned into
             `AuditWriteFailed`, not propagated as a defect, so that core's
             writer treats it as a failed attempt and retries in place
             (BEH-BR-202).
```

Core does not distinguish a "permanent" from a "transient" failure: every
failure is retried with the same record until it succeeds or the latch makes
the loss visible ([BEH-BR-205](../../core/behaviors/23-audit-sink-and-record.md)). That is the right answer to a store that
is down, and the wrong answer to anything the store could have kept, which
is why the table has no row for a schema, a canonical form or a colliding
identifier: those are stored, marked and counted, and `trailGate` turns the
count into refused operator changes while recording continues
([BEH-GX-177](./22-trail-status-and-gate.md#beh-gx-177-trailgate-refuses-operator-changes-while-the-sink-reports-a-condition-of-its-own)). "too-large" stays a failure because the store has not
stored the record; it is the one store limit core's latch must make loud.

## BEH-GX-020: No queue, no reordering, no background retry, no swallowed error

> **Invariant:** [INV-GX-007](../invariants.md#inv-gx-007-the-sink-acknowledges-only-what-the-store-reports-stored), [INV-GX-011](../invariants.md#inv-gx-011-every-port-failure-on-a-decision-path-refuses)
> **See:** [ADR-GX-004](../decisions/004-append-only-trail-store.md), [ADR-BR-030](../../core/decisions/030-audit-sink-port.md), [ADR-BR-037](../../core/decisions/037-audit-sequence-separate-from-event-seq.md)
> **Satisfies:** [URS-GX-001](../urs.md#urs-gx-001-store-audit-records-with-honest-acknowledgement), [URS-GX-003](../urs.md#urs-gx-003-detect-lost-duplicated-reordered-or-altered-stored-records)
> **Risk:** [RSK-GX-001](../gxp/03-risk-assessment.md#rsk-gx-001), [RSK-GX-003](../gxp/03-risk-assessment.md#rsk-gx-003)
> **Regulatory:** supports 21 CFR 11.10(e); EU GMP Annex 11 §9; ALCOA+ Contemporaneous, Complete

```
REQUIREMENT: Each `AuditSink.record` call MUST call `store.append` exactly
             once, in the fiber of that call, and MUST answer only after
             `append` has returned. The sink MUST NOT hold a record in a
             buffer, batch records, or answer from a cache.
```

```
REQUIREMENT: The sink MUST NOT retry `append` itself, start a background
             fiber, or schedule a later write. Retrying is core's: its writer
             repeats the same record in every field before any other
             (BEH-BR-202). Audit-chain's anchoring, when sealing is on, runs
             off the write path and never writes a trail entry (BEH-AC-011).
```

```
REQUIREMENT: The sink MUST NOT reorder records. Since core hands a host's
             records one at a time and waits for each (BEH-BR-202), the order
             of `append` calls for a host MUST be the order of `auditSeq`,
             with repeats only for retries of the same record.
```

```
REQUIREMENT: The sink MUST NOT impose its own timeout on `append`. Core
             interrupts an attempt not completed within `auditTimeout`; the
             sink MUST let that interruption reach `append` and MUST NOT
             shield the call with `uninterruptible`.
```

Every one of these prohibitions removes a way of acknowledging what the store
does not have. A sink that queued records and answered at once would turn
core's fail-closed policy ([BEH-BR-203](../../core/behaviors/23-audit-sink-and-record.md)) into fail-open: the change would be
made, the latch never set, and a crash would lose the queue. A sink that
retried in the background would race with core's own retry and could append a
later record before an earlier one. The interruption rule is safe because the
store is idempotent: an interrupted append that had committed is answered
"already-stored" on core's retry ([BEH-GX-011](./02-trail-store-port.md#beh-gx-011-append-answers-stored-only-after-commit-and-is-idempotent-on-recordid-and-digest)).

## BEH-GX-021: An "already-stored" answer is verified, and a store that does not hold the entry has failed

> **Invariant:** [INV-GX-006](../invariants.md#inv-gx-006-one-primary-entry-per-record-and-per-host-sequence-number-and-no-stored-record-is-displaced), [INV-GX-007](../invariants.md#inv-gx-007-the-sink-acknowledges-only-what-the-store-reports-stored)
> **See:** [ADR-GX-004](../decisions/004-append-only-trail-store.md), [ADR-GX-005](../decisions/005-jcs-and-sha256.md)
> **Satisfies:** [URS-GX-001](../urs.md#urs-gx-001-store-audit-records-with-honest-acknowledgement), [URS-GX-003](../urs.md#urs-gx-003-detect-lost-duplicated-reordered-or-altered-stored-records)
> **Risk:** [RSK-GX-002](../gxp/03-risk-assessment.md#rsk-gx-002), [RSK-GX-001](../gxp/03-risk-assessment.md#rsk-gx-001)
> **Regulatory:** supports 21 CFR 11.10(e) ("shall not obscure previously recorded information")

```
REQUIREMENT: When `append` answers "already-stored", the sink MUST read back
             the host's entries at that `auditSeq` (`read({ hostId, fromSeq:
             auditSeq, toSeq: auditSeq })`) and MUST succeed only when one of
             the entries returned — primary or collision (BEH-GX-012) — has
             the `recordId` and `digest` of the entry it appended.
```

```
REQUIREMENT: When the read-back returns no such entry, the sink MUST fail
             with `AuditWriteFailed` and the template "trail store answered
             already-stored for an entry it does not hold (<adapter>)", count
             the outcome "readback-mismatch" and log it at error level; when
             the read-back fails, it MUST fail with "trail store unavailable
             (<adapter>)".
```

```
REQUIREMENT: The sink MUST NOT read back after "stored" or
             "stored-collision". The read-back is performed only for the
             repeat case, which arises only on a retry.
```

The store's own contract already makes "already-stored" mean "an equal entry
exists" ([BEH-GX-011](./02-trail-store-port.md#beh-gx-011-append-answers-stored-only-after-commit-and-is-idempotent-on-recordid-and-digest)). The read-back is the sink not taking that on
trust at the one moment it matters: a defective adapter that answered
"already-stored" for any known `recordId` would otherwise let a different
record vanish behind an identifier collision, and the host would carry on as
if it had been stored. A failure is right here, and only here, because the
store has said it holds something it does not. The cost is one ranged read
per retry, which happens only after a failed or timed-out attempt.

## BEH-GX-022: With sealing on, the sink records through audit-chain's HashChainSink and computes no chain of its own

> **Invariant:** [INV-GX-007](../invariants.md#inv-gx-007-the-sink-acknowledges-only-what-the-store-reports-stored), [INV-GX-016](../invariants.md#inv-gx-016-the-sink-never-refuses-a-record-for-a-condition-of-its-own)
> **See:** [ADR-GX-029](../decisions/029-sealing-through-audit-chain.md), [ADR-GX-005](../decisions/005-jcs-and-sha256.md)
> **Satisfies:** [URS-GX-005](../urs.md#urs-gx-005-optionally-detect-alteration-of-sealed-records)
> **Risk:** [RSK-GX-002](../gxp/03-risk-assessment.md#rsk-gx-002), [RSK-GX-004](../gxp/03-risk-assessment.md#rsk-gx-004)
> **Regulatory:** supports 21 CFR 11.10(e); EU GMP Annex 11 §9 (detection only, within the limits of 21)

```
REQUIREMENT: When sealing is on, `trailSink` MUST provide as `AuditSink` the
             sink of `HashChainSink.make(trailChainStore(store), …)` of
             `@bridger/audit-chain` (BEH-GX-170), whose inner `ChainStore`
             performs the steps of BEH-GX-018 to BEH-GX-021 on the record and
             stores audit-chain's link in the entry's `link` field. The sink
             MUST NOT compute, store or verify any seal, chain value or
             anchor of its own. When sealing is off, the entry MUST carry no
             `link`.
```

```
REQUIREMENT: A retry of the same record MUST store no second link: on
             "already-stored" the stored entry, link included, MUST be kept
             as it is. Order breaks, retry mismatches, unsupported schemas
             and escaped encodings are marked in the link by audit-chain
             (BEH-AC-005) and never refused, so that sealing adds no failure
             of its own to the write path beyond audit-chain's keyed hasher
             (BEH-AC-008).
```

The companion used to specify a seal chain of its own (BEH-GX-049–056, now
withdrawn). Two chains would mean two verifiers, two sets of test vectors and
two descriptions of the same limit; audit-chain already chains the record
the store keeps, marks instead of refusing, anchors off the write path and
verifies against anchors held apart ([ADR-GX-029](../decisions/029-sealing-through-audit-chain.md)). The companion's part is
to be audit-chain's inner store, so that the entry the checks read carries the
link audit-chain verifies.

## BEH-GX-023: The sink holds no record after acknowledging it

> **See:** [ADR-BR-030](../../core/decisions/030-audit-sink-port.md), [ADR-GX-004](../decisions/004-append-only-trail-store.md)
> **Satisfies:** [URS-GX-001](../urs.md#urs-gx-001-store-audit-records-with-honest-acknowledgement), [NFR-GX-007](../urs.md#nfr-gx-007-no-secrets-in-any-output)
> **Risk:** [RSK-BR-006](../../core/gxp/03-risk-assessment.md#rsk-br-006)
> **Regulatory:** supports EU GMP Annex 11 §7.1 (by keeping no second, unmanaged copy)

```
REQUIREMENT: After answering core for a record, the sink MUST keep no
             reference to the record, its canonical text or its digest. With
             sealing on, it MUST keep only what audit-chain keeps to chain the
             next record of the host (BEH-AC-004); the counters of
             BEH-GX-176 are counts, not records.
```

```
REQUIREMENT: The sink MUST NOT write a record anywhere but `store.append`: not
             to a log, a metric label, a temporary file or a second store.
```

The entry the store accepted is the original, as core's is before it
([BEH-BR-208](../../core/behaviors/23-audit-sink-and-record.md)). A second copy — a debug log of records, a "dead-letter"
file for failed writes — would be a record kept outside the consumer's
controls, with no retention rule, no access control and no place in the
checks. Records that cannot be written stay in core's writer, where the latch
accounts for them; records the sink could not handle exactly are in the
store, marked, where the checks find them.

## BEH-GX-024: The sink's observable output is counts by outcome, never content

> **Invariant:** [INV-GX-005](../invariants.md#inv-gx-005-no-configuration-value-or-key-material-appears-in-any-companion-output)
> **See:** [ADR-GX-027](../decisions/027-claims-and-non-claims.md), [ADR-BR-034](../../core/decisions/034-gxp-companion-scope.md)
> **Satisfies:** [NFR-GX-007](../urs.md#nfr-gx-007-no-secrets-in-any-output), [URS-GX-016](../urs.md#urs-gx-016-know-which-obligations-remain-mine)
> **Risk:** [RSK-GX-004](../gxp/03-risk-assessment.md#rsk-gx-004), [RSK-GX-001](../gxp/03-risk-assessment.md#rsk-gx-001), [RSK-GX-023](../gxp/03-risk-assessment.md#rsk-gx-023)
> **Regulatory:** supports EU GMP Annex 11 §12.1

```ts
// illustrative — not type-checked
// Effect metrics, labelled by adapter name and outcome only
//   bridger_gxp_trail_append_total{adapter, outcome}
//   outcome: "stored" | "stored-collision" | "already-stored" | "too-large" | "unavailable" | "defect" | "readback-mismatch"
//   bridger_gxp_trail_marked_total{adapter, mark}      mark: "schema-unsupported" | "jcs-escaped"
//   bridger_gxp_trail_append_duration_ms{adapter}
```

```
REQUIREMENT: The sink's metrics and logs MUST be labelled by adapter name and
             outcome or mark only. They MUST NOT carry a `hostId`,
             `recordId`, `auditSeq`, actor, reason, target or any other
             record field.
```

```
REQUIREMENT: The sink MUST log each failed attempt and each marked entry at
             warning level with the adapter name and outcome or mark, and
             each "readback-mismatch" and "stored-collision" at error level.
             It MUST NOT log successful attempts above debug level.
```

```
REQUIREMENT: No sink output, type documentation or guide MAY describe an
             acknowledged record as durable, retained or protected. It MAY say
             only that the store answered "stored", "stored-collision" or
             "already-stored", with the commit semantics its manifest
             declares (BEH-GX-016).
```

A collision or a read-back mismatch is never a transient fault: it means two
writers share a `hostId`, a restore replayed old entries, or an adapter is
defective. It is logged at error level and counted in the status that
`trailGate` reads, so that it reaches someone and stops operator changes
until it has been looked at — without stopping the trail. The identifiers
that would locate it stay out of the log, as they are in core's error log of
the operation and target ([BEH-BR-202](../../core/behaviors/23-audit-sink-and-record.md)); the checks of 05 locate it in
the store.

---

_Previous: [02 — Trail Store Port](./02-trail-store-port.md)_ · _Next: [04 — Conformance Suite](./04-conformance-suite.md)_
