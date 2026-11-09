# 03 — Trail Sink

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-GX-BEH-03                                            |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-GX-03 §5)           |
> | Approved by    | — (pending; single maintainer, see PROC-GX-03 §5)            |
> | Classification | Functional Specification                                     |
> | Change History | 0.1 (2026-10-03): Initial draft (CCR-GX-001)                 |

---

`trailSink` is the companion's `AuditSink`: the piece core calls for every
record, and the only place where a record becomes a stored entry. Its whole
job is to be honest about one answer — whether the store has the record — and
to add nothing that could make that answer wrong: no buffer that acknowledges
early, no background retry that reorders, no error swallowed into a success.
Core already retries in place and fails closed ([BEH-BR-202](../../core/behaviors/23-audit-sink-and-record.md),
[BEH-BR-203](../../core/behaviors/23-audit-sink-and-record.md)), and a retried record keeps its `auditSeq` ([BEH-BR-213](../../core/behaviors/24-time-ids-and-sequence.md)); the sink's duty is to give core a truthful result for each
attempt. This file owns BEH-GX-017–024 and uses all eight.

Planned source: `packages/gxp/src/trailSink.ts` *(Planned)*. The port it
writes through is [02 — Trail Store Port](./02-trail-store-port.md); the
sealing step it runs before each append is
[07 — Optional Sealing](./07-optional-sealing.md).

## BEH-GX-017: trailSink turns a TrailStore into core's AuditSink

> **Invariant:** [INV-GX-007](../invariants.md#inv-gx-007-the-sink-acknowledges-only-what-the-store-reports-stored)
> **See:** [ADR-GX-004](../decisions/004-append-only-trail-store.md), [ADR-BR-030](../../core/decisions/030-audit-sink-port.md), [ADR-BR-031](../../core/decisions/031-audit-failure-policy.md)
> **Satisfies:** [URS-GX-001](../urs.md#urs-gx-001-store-audit-records-with-honest-acknowledgement)
> **Risk:** [RSK-GX-001](../gxp/03-risk-assessment.md#rsk-gx-001)
> **Regulatory:** supports 21 CFR 11.10(e); EU GMP Annex 11 §9

```ts
// illustrative — not type-checked
declare function trailSink(
  store: TrailStoreShape,
  options?: {
    readonly sealing?: SealingOptions | "off"     // default "off" (07 — Optional Sealing)
  }
): Layer.Layer<AuditSink>
```

```
REQUIREMENT: `trailSink` MUST return a layer that provides core's `AuditSink`
             and nothing else. Each call of `AuditSink.record(r)` MUST perform
             the steps of this file in this order: check the schema
             (BEH-GX-018), canonicalise and digest (BEH-GX-018), seal when
             sealing is on (BEH-GX-022), call `store.append` exactly once
             (BEH-GX-020), verify an "already-stored" answer (BEH-GX-021), and
             answer core (BEH-GX-019).
```

```
REQUIREMENT: `trailSink` MUST NOT call any mutating operation of a host
             (BEH-BR-193) and MUST NOT read the host's snapshot, events or
             controls while recording.
```

```
REQUIREMENT: The layer MUST be safe to share between hosts: all state it keeps
             MUST be keyed by `hostId`, and a record of one host MUST NOT wait
             on, or change the outcome of, a record of another host.
```

`options` is optional in this signature because `trailSink` is also usable on
its own, outside `GxpLayer.make`; the absence of `sealing` means "off", which
is the documented default of [ADR-GX-009](../decisions/009-optional-sealing.md) and not a decision port.
`GxpLayer.make` passes it explicitly ([BEH-GX-004](./01-companion-boundary.md#beh-gx-004-gxplayermake-requires-every-port-and-a-missing-port-is-a-type-error)).

## BEH-GX-018: The sink checks the schema, canonicalises and digests before it writes

> **Invariant:** [INV-GX-012](../invariants.md#inv-gx-012-the-canonical-form-is-deterministic-across-platforms), [INV-GX-005](../invariants.md#inv-gx-005-no-configuration-value-or-key-material-appears-in-any-companion-output)
> **See:** [ADR-GX-005](../decisions/005-jcs-and-sha256.md), [ADR-GX-025](../decisions/025-core-version-range.md), [ADR-BR-030](../../core/decisions/030-audit-sink-port.md)
> **Satisfies:** [URS-GX-001](../urs.md#urs-gx-001-store-audit-records-with-honest-acknowledgement), [URS-GX-003](../urs.md#urs-gx-003-detect-lost-duplicated-reordered-or-altered-stored-records)
> **Risk:** [RSK-GX-015](../gxp/03-risk-assessment.md#rsk-gx-015), [RSK-GX-019](../gxp/03-risk-assessment.md#rsk-gx-019)
> **Regulatory:** supports 21 CFR 11.10(e); ALCOA+ Original, Accurate

```
REQUIREMENT: The sink MUST refuse, with `AuditWriteFailed`, a record whose
             `schemaVersion` is not in the supported list or that has a field
             the supported schema does not define (BEH-GX-007). It MUST NOT
             call `append` for such a record.
```

```
REQUIREMENT: The sink MUST build the entry as BEH-GX-010 specifies:
             `canonical` the RFC 8785 text of the record exactly as received,
             `digest` its SHA-256, and `hostId`, `auditSeq`, `recordId` copied
             from the record. It MUST NOT add, remove, reorder or rewrite any
             field of the record before canonicalising.
```

```
REQUIREMENT: A canonicalisation failure (BEH-GX-002) MUST fail the write with
             `AuditWriteFailed` and MUST NOT call `append`. Because a retry of
             the same record fails the same way, core's latch is then set
             (BEH-BR-205); the sink MUST NOT work around the failure by
             serialising differently.
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
knowing which adapter wrote them. Core's records contain only strings,
integers and the literal `true`, so a canonicalisation failure would mean a
core defect or a schema drift; refusing the write is the only outcome that
does not store something the checker cannot reproduce.

## BEH-GX-019: The sink acknowledges only "stored" or a verified "already-stored", and every failure is AuditWriteFailed without record content

> **Invariant:** [INV-GX-007](../invariants.md#inv-gx-007-the-sink-acknowledges-only-what-the-store-reports-stored), [INV-GX-005](../invariants.md#inv-gx-005-no-configuration-value-or-key-material-appears-in-any-companion-output), [INV-GX-011](../invariants.md#inv-gx-011-every-port-failure-on-a-decision-path-refuses)
> **See:** [ADR-GX-004](../decisions/004-append-only-trail-store.md), [ADR-BR-030](../../core/decisions/030-audit-sink-port.md), [ADR-BR-031](../../core/decisions/031-audit-failure-policy.md), [ADR-BR-008](../../core/decisions/008-error-taxonomy.md)
> **Satisfies:** [URS-GX-001](../urs.md#urs-gx-001-store-audit-records-with-honest-acknowledgement), [NFR-GX-007](../urs.md#nfr-gx-007-no-secrets-in-any-output)
> **Risk:** [RSK-GX-001](../gxp/03-risk-assessment.md#rsk-gx-001), [RSK-BR-004](../../core/gxp/03-risk-assessment.md#rsk-br-004), [RSK-BR-006](../../core/gxp/03-risk-assessment.md#rsk-br-006)
> **Regulatory:** supports 21 CFR 11.10(e); EU GMP Annex 11 §9; ALCOA+ Complete

| Outcome of the attempt | Answer to core | `AuditWriteFailed.message` |
| --- | --- | --- |
| `append` → "stored" | success | — |
| `append` → "already-stored", read-back digest equal ([BEH-GX-021](#beh-gx-021-an-already-stored-answer-is-verified-and-a-different-stored-entry-is-a-failure)) | success | — |
| `append` → "already-stored", read-back missing or different | failure | "trail store answered already-stored for a different entry (<adapter>)" |
| `TrailWriteFailed { reason: "conflict" }` | failure | "trail store refused a conflicting entry (<adapter>)" |
| `TrailWriteFailed { reason: "too-large" }` | failure | "record exceeds the trail store's entry size limit (<adapter>)" |
| `TrailWriteFailed { reason: "unavailable" \| "rejected" }` | failure | "trail store unavailable (<adapter>)" |
| defect, or an answer that is not one of the two literals | failure | "trail store failed unexpectedly (<adapter>)" |
| unsupported schema | failure | "record schema not supported by @bridger/gxp <version>" |
| canonicalisation failure | failure | "record could not be canonicalised" |

```
REQUIREMENT: The sink MUST succeed only in the two success rows of the table,
             and only after `append` has returned. Every other outcome MUST
             fail with `AuditWriteFailed`.
```

```
REQUIREMENT: `AuditWriteFailed.message` MUST be one of the templates of the
             table, with `<adapter>` replaced by `manifest.name` and
             `<version>` by the companion's version. It MUST NOT contain any
             field of the record, the canonical text, the digest, or the
             message or cause of the store's error (BEH-GX-006).
```

```
REQUIREMENT: A defect raised by the store MUST be turned into
             `AuditWriteFailed`, not propagated as a defect, so that core's
             writer treats it as a failed attempt and retries in place
             (BEH-BR-202).
```

Core does not distinguish a "permanent" from a "transient" failure: every
failure is retried with the same record until it succeeds or the latch makes
the loss visible ([BEH-BR-205](../../core/behaviors/23-audit-sink-and-record.md)). The sink therefore has nothing to gain from
classifying failures for core, and the message carries just enough for an
operator to know which adapter refused and why, without quoting a record
that may hold a reason or an actor identifier.

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
             (BEH-BR-202).
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
"already-stored" on core's retry ([BEH-GX-011](./02-trail-store-port.md#beh-gx-011-append-answers-stored-only-after-commit-and-is-idempotent-on-recordid)).

## BEH-GX-021: An "already-stored" answer is verified, and a different stored entry is a failure

> **Invariant:** [INV-GX-006](../invariants.md#inv-gx-006-at-most-one-stored-entry-per-record-and-per-host-sequence-number), [INV-GX-007](../invariants.md#inv-gx-007-the-sink-acknowledges-only-what-the-store-reports-stored)
> **See:** [ADR-GX-004](../decisions/004-append-only-trail-store.md), [ADR-GX-005](../decisions/005-jcs-and-sha256.md)
> **Satisfies:** [URS-GX-001](../urs.md#urs-gx-001-store-audit-records-with-honest-acknowledgement), [URS-GX-003](../urs.md#urs-gx-003-detect-lost-duplicated-reordered-or-altered-stored-records)
> **Risk:** [RSK-GX-002](../gxp/03-risk-assessment.md#rsk-gx-002), [RSK-GX-001](../gxp/03-risk-assessment.md#rsk-gx-001)
> **Regulatory:** supports 21 CFR 11.10(e) ("shall not obscure previously recorded information")

```
REQUIREMENT: When `append` answers "already-stored", the sink MUST read back
             the host's entry at that `auditSeq` (`read({ hostId, fromSeq:
             auditSeq, toSeq: auditSeq })`) and MUST succeed only when exactly
             one entry is returned and its `recordId` and `digest` equal those
             of the entry it appended.
```

```
REQUIREMENT: When the read-back returns no entry, an entry with another
             `recordId` or `digest`, or fails, the sink MUST fail with
             `AuditWriteFailed` and the first template of BEH-GX-019's table
             that applies; a failed read-back MUST use "trail store
             unavailable (<adapter>)".
```

```
REQUIREMENT: The sink MUST NOT read back after "stored". The read-back is
             performed only for the repeat case, which arises only on a retry.
```

The store's own contract already makes "already-stored" mean "an equal entry
exists" ([BEH-GX-011](./02-trail-store-port.md#beh-gx-011-append-answers-stored-only-after-commit-and-is-idempotent-on-recordid)). The read-back is the sink not taking that on
trust at the one moment it matters: a defective adapter that answered
"already-stored" for any known `recordId` would otherwise let a different
record vanish behind an identifier collision, and the host would carry on as
if it had been stored. The cost is one ranged read per retry, which happens
only after a failed or timed-out attempt.

## BEH-GX-022: With sealing on, the sink seals before it appends and never re-seals a repeat

> **Invariant:** [INV-GX-013](../invariants.md#inv-gx-013-a-hosts-seal-chain-is-linear-over-exactly-the-stored-sequence)
> **See:** [ADR-GX-009](../decisions/009-optional-sealing.md), [ADR-GX-005](../decisions/005-jcs-and-sha256.md)
> **Satisfies:** [URS-GX-005](../urs.md#urs-gx-005-optionally-detect-alteration-of-sealed-records)
> **Risk:** [RSK-GX-002](../gxp/03-risk-assessment.md#rsk-gx-002), [RSK-GX-004](../gxp/03-risk-assessment.md#rsk-gx-004)
> **Regulatory:** supports 21 CFR 11.10(e); EU GMP Annex 11 §9 (detection only, within the limits of 07)

```
REQUIREMENT: When sealing is on, the sink MUST compute the entry's seal
             envelope (BEH-GX-049) from the record's digest and the seal of
             the host's previous entry before calling `append`, and MUST pass
             the envelope in the entry. When sealing is off, the entry MUST
             carry no seal.
```

```
REQUIREMENT: The previous seal of a host MUST be taken from the sink's memory
             when the sink has stored the host's previous `auditSeq`, and
             otherwise read from the store as the seal of the entry at
             `auditSeq − 1`. A record with `auditSeq` 1 MUST use the genesis
             value of BEH-GX-049. When the entry at `auditSeq − 1` is missing,
             unsealed or unreadable, the sink MUST fail with
             `AuditWriteFailed` ("trail store unavailable (<adapter>)") and
             MUST NOT seal against any other entry.
```

```
REQUIREMENT: A retry of the same record MUST produce the same seal envelope as
             the first attempt. On "already-stored", the stored envelope MUST
             be kept as it is; the sink MUST NOT write, replace or re-seal it,
             and MUST update its memory of the host's previous seal from the
             read-back entry.
```

```
REQUIREMENT: The sink MUST advance its memory of a host's previous seal only
             after the entry carrying it has been acknowledged to core.
```

Because the seal of entry n depends only on the record's digest and the seal
of entry n − 1, a retry with an identical record recomputes an identical seal,
and the idempotent repeat stays idempotent. Refusing to seal against anything
but the entry immediately before is what keeps the chain linear over exactly
the stored sequence ([INV-GX-013](../invariants.md#inv-gx-013-a-hosts-seal-chain-is-linear-over-exactly-the-stored-sequence)): a gap in the store stops the sink, sets
the host's latch and becomes visible, rather than being sealed over.

## BEH-GX-023: The sink holds no record after acknowledging it

> **See:** [ADR-BR-030](../../core/decisions/030-audit-sink-port.md), [ADR-GX-004](../decisions/004-append-only-trail-store.md)
> **Satisfies:** [URS-GX-001](../urs.md#urs-gx-001-store-audit-records-with-honest-acknowledgement), [NFR-GX-007](../urs.md#nfr-gx-007-no-secrets-in-any-output)
> **Risk:** [RSK-BR-006](../../core/gxp/03-risk-assessment.md#rsk-br-006)
> **Regulatory:** supports EU GMP Annex 11 §7.1 (by keeping no second, unmanaged copy)

```
REQUIREMENT: After answering core for a record, the sink MUST keep no
             reference to the record, its canonical text or its digest, except
             the last seal and last `auditSeq` per host needed by BEH-GX-022.
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
accounts for them.

## BEH-GX-024: The sink's observable output is counts by outcome, never content

> **Invariant:** [INV-GX-005](../invariants.md#inv-gx-005-no-configuration-value-or-key-material-appears-in-any-companion-output)
> **See:** [ADR-GX-027](../decisions/027-claims-and-non-claims.md), [ADR-BR-034](../../core/decisions/034-gxp-companion-scope.md)
> **Satisfies:** [NFR-GX-007](../urs.md#nfr-gx-007-no-secrets-in-any-output), [URS-GX-016](../urs.md#urs-gx-016-know-which-obligations-remain-mine)
> **Risk:** [RSK-GX-004](../gxp/03-risk-assessment.md#rsk-gx-004), [RSK-GX-001](../gxp/03-risk-assessment.md#rsk-gx-001)
> **Regulatory:** supports EU GMP Annex 11 §12.1

```ts
// illustrative — not type-checked
// Effect metrics, labelled by adapter name and outcome only
//   bridger_gxp_trail_append_total{adapter, outcome}
//   outcome: "stored" | "already-stored" | "conflict" | "too-large" | "unavailable" | "defect" | "schema" | "canonical" | "readback-mismatch"
//   bridger_gxp_trail_append_duration_ms{adapter}
```

```
REQUIREMENT: The sink's metrics and logs MUST be labelled by adapter name and
             outcome only. They MUST NOT carry a `hostId`, `recordId`,
             `auditSeq`, actor, reason, target or any other record field.
```

```
REQUIREMENT: The sink MUST log each failed attempt at warning level with the
             adapter name and outcome, and each "readback-mismatch" and
             "conflict" at error level. It MUST NOT log successful attempts
             above debug level.
```

```
REQUIREMENT: No sink output, type documentation or guide MAY describe an
             acknowledged record as durable, retained or protected. It MAY say
             only that the store answered "stored" or "already-stored", with
             the commit semantics its manifest declares (BEH-GX-016).
```

A conflict or a read-back mismatch is never a transient fault: it means two
writers share a `hostId`, a restore replayed old entries, or an adapter is
defective. It is logged at error level so that it reaches someone before the
latch it causes is acknowledged. The identifiers that would locate it stay
out of the log, as they are in the trail itself and in core's error log of
the operation and target ([BEH-BR-202](../../core/behaviors/23-audit-sink-and-record.md)).

---

_Previous: [02 — Trail Store Port](./02-trail-store-port.md)_ · _Next: [04 — Conformance Suite](./04-conformance-suite.md)_
