# 05 — Checks on Read

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-GX-BEH-05                                            |
> | Revision       | 0.3                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-GX-03 §5)           |
> | Approved by    | — (pending; single maintainer, see PROC-GX-03 §5)            |
> | Classification | Functional Specification                                     |
> | Change History | 0.3 (2026-11-10): BEH-GX-033 chain-derived kinds `chainUnanchoredTail`, `chainNonCanonical`, `chainLossCounterRose` and `anchorUnconfirmed`, and the archive kind `bundleMismatch`; BEH-GX-035 numbers below `fromSeq` are outside the range (P7, P14, P15, P16, P20); follow-up: `CheckCapacityExceeded` declared as `Schema.TaggedError`, as raised (CCR-GX-005)<br>0.2 (2026-11-09): BEH-GX-033, 034 kinds `nonCanonical`, `collision`, `auditDropped`, `headMismatch` (F-01, F-02); BEH-GX-036 marked and unmarked unknown shapes; BEH-GX-037 pairing by phase, `superseded` paired without `causationId` (C-08); BEH-GX-038 `auditDropped` on every record, the claim that the acknowledgement is the only place a dropped count appears corrected (F-01); seal kinds from 21 (C-09) (CCR-GX-002)<br>0.1 (2026-10-03): Initial draft (CCR-GX-001)                 |

---

A stored trail can be wrong in ways nobody notices until an inspection: an
entry lost by a failover, a row edited by hand, a record whose bytes no
longer hash to its digest, a request that never got an outcome. The checks of
this file read what the store holds and report each such defect as a named
finding. They build on core's `verifyAuditSequence` ([BEH-BR-215](../../core/behaviors/24-time-ids-and-sequence.md)) and add
the kinds of defect it does not look for. They report; they never repair, and
they never call a trail complete or unaltered — only "no findings of the
checked kinds" ([ADR-GX-007](../decisions/007-checks-never-claim-integrity.md)). This file owns BEH-GX-033–040 and uses all
eight.

Planned source: `packages/gxp/src/checks/checkTrailEntries.ts`,
`packages/gxp/src/checks/checkStoredTrail.ts` and
`packages/gxp/src/checks/CheckReport.ts` *(Planned)*. Tail loss against
high-water marks is [06 — High-Water Marks and Anchors](./06-high-water-marks-and-anchors.md);
seal verification is [21 — Sealing through audit-chain](./21-sealing-through-audit-chain.md).

## BEH-GX-033: A check report lists findings by kind and claims only the absence of the checked kinds

> **Invariant:** [INV-GX-009](../invariants.md#inv-gx-009-a-finding-is-never-suppressed-or-upgraded)
> **See:** [ADR-GX-007](../decisions/007-checks-never-claim-integrity.md), [ADR-GX-027](../decisions/027-claims-and-non-claims.md), [ADR-BR-037](../../core/decisions/037-audit-sequence-separate-from-event-seq.md)
> **Satisfies:** [URS-GX-003](../urs.md#urs-gx-003-detect-lost-duplicated-reordered-or-altered-stored-records), [URS-GX-016](../urs.md#urs-gx-016-know-which-obligations-remain-mine)
> **Risk:** [RSK-GX-004](../gxp/03-risk-assessment.md#rsk-gx-004), [RSK-BR-018](../../core/gxp/03-risk-assessment.md#rsk-br-018)
> **Regulatory:** supports the consumer's review under 21 CFR 11.10(e) and EU GMP Annex 11 §9 (detection only)

```ts
// illustrative — not type-checked
type FindingKind =
  | "gap" | "duplicate" | "outOfOrder"                         // from verifyAuditSequence (BEH-BR-215)
  | "digestMismatch" | "canonicalMismatch" | "unknownSchemaVersion"
  | "nonCanonical" | "collision"                               // marked and colliding entries (03, 02)
  | "requestedWithoutTerminal" | "droppedSinceAck" | "auditDropped" | "noCleanClose"
  | "approvalWithoutRecord" | "recordWithoutApproval"           // BEH-GX-039
  | "tailLoss" | "unanchoredTail"                              // 06
  | "chainBreak" | "anchorMismatch" | "headMismatch"           // 21, from @bridger/audit-chain
  | "chainUnanchoredTail" | "chainNonCanonical" | "chainLossCounterRose" | "anchorUnconfirmed"   // 21, from @bridger/audit-chain
  | "bundleMismatch"                                           // 18, an archive's chain bundle against its entries

interface Finding {
  readonly kind: FindingKind
  readonly hostId: string
  readonly auditSeq?: number          // the entry concerned, or the first of a range
  readonly toSeq?: number             // last of a range (gap, tailLoss, unanchoredTail, chainUnanchoredTail, anchorUnconfirmed)
  readonly recordId?: string
  readonly detail?: string            // from a fixed template per kind; never record content
}

interface CheckReport {
  readonly format: "bridger-gx-check/1"
  readonly scope: readonly { readonly hostId: string; readonly fromSeq: number; readonly toSeq: number }[]
  readonly checkedKinds: readonly FindingKind[]
  readonly notCheckedKinds: readonly FindingKind[]
  readonly findings: readonly Finding[]
  readonly statement: string          // see the second requirement
}
```

```
REQUIREMENT: Every report MUST list in `checkedKinds` exactly the kinds the
             run looked for, and in `notCheckedKinds` every other
             `FindingKind`. A kind that needs an input the caller did not give
             (a high-water mark store, a ticket store, a sealed trail) MUST be listed
             as not checked, never as checked with no findings.
```

```
REQUIREMENT: `statement` MUST be "No findings of the checked kinds." when
             `findings` is empty and "<n> findings of the checked kinds."
             otherwise, followed in both cases by "Kinds not checked: <list>."
             when that list is not empty. No report, rendering or summary MAY
             describe a trail as complete, intact, unaltered, verified or
             correct.
```

```
REQUIREMENT: `findings` MUST be sorted by `hostId`, then `auditSeq` (absent
             last), then `kind` in the order of the `FindingKind` declaration,
             then `recordId`. The same input MUST give a byte-identical
             canonical report.
```

The wording is part of the behaviour because a report is read by people who
did not write the check. "No findings of the checked kinds" says exactly what
a run establishes; "trail verified" says something nobody can establish from
inside the trail, since entries removed from the end, or altered and
re-hashed consistently, pass every check of this file ([BEH-BR-215](../../core/behaviors/24-time-ids-and-sequence.md)).

## BEH-GX-034: checkTrailEntries is a pure check over entries, reusing verifyAuditSequence

> **Invariant:** [INV-GX-009](../invariants.md#inv-gx-009-a-finding-is-never-suppressed-or-upgraded), [INV-GX-012](../invariants.md#inv-gx-012-the-canonical-form-is-deterministic-across-platforms)
> **See:** [ADR-GX-007](../decisions/007-checks-never-claim-integrity.md), [ADR-GX-005](../decisions/005-jcs-and-sha256.md), [ADR-BR-037](../../core/decisions/037-audit-sequence-separate-from-event-seq.md)
> **Satisfies:** [URS-GX-003](../urs.md#urs-gx-003-detect-lost-duplicated-reordered-or-altered-stored-records), [NFR-GX-001](../urs.md#nfr-gx-001-deterministic-outputs)
> **Risk:** [RSK-GX-002](../gxp/03-risk-assessment.md#rsk-gx-002), [RSK-GX-015](../gxp/03-risk-assessment.md#rsk-gx-015)
> **Regulatory:** supports 21 CFR 11.10(e); EU GMP Annex 11 §8.1, §9

```ts
// illustrative — not type-checked
declare function checkTrailEntries(
  entries: Iterable<TrailEntry>,
  options: { readonly expectClosed: boolean }
): CheckReport
```

| Kind | Reported when |
| --- | --- |
| `gap`, `duplicate`, `outOfOrder` | `verifyAuditSequence` over the entries' `record`s reports it; mapped one to one |
| `digestMismatch` | `digest` ≠ "sha256:" + hex(SHA-256(UTF-8(`canonical`))) |
| `canonicalMismatch` | JCS(`record`) ≠ `canonical` — or, for an entry marked `canonical: "jcs-escaped"`, the escaped encoding of `record` ≠ `canonical` — or `hostId`, `auditSeq` or `recordId` of the entry ≠ those of `record` |
| `unknownSchemaVersion` | [BEH-GX-036](#beh-gx-036-an-entry-of-an-unknown-schema-version-is-reported-and-never-skipped) |
| `nonCanonical` | the entry carries `marks.canonical` "jcs-escaped" (BEH-GX-018) |
| `collision` | the entry carries `collision` (BEH-GX-012); `detail` "collides with the primary entry on <reason>" |
| `requestedWithoutTerminal`, `droppedSinceAck`, `auditDropped`, `noCleanClose` | [BEH-GX-037](#beh-gx-037-open-requests-and-an-unclean-close-are-findings), [BEH-GX-038](#beh-gx-038-records-core-reported-dropped-are-a-finding) |

```
REQUIREMENT: `checkTrailEntries` MUST be pure and total: no effects, no clock,
             no I/O, the same report for the same input, and a report with no
             findings and an empty `scope` for empty input.
```

```
REQUIREMENT: It MUST obtain `gap`, `duplicate` and `outOfOrder` by calling
             core's `verifyAuditSequence` over the entries' records and
             mapping each result to one finding; it MUST NOT re-implement
             sequence checking.
```

```
REQUIREMENT: It MUST check every entry for `digestMismatch` and
             `canonicalMismatch`, independently: an entry can have both, one
             or neither, and each MUST be reported. It MUST report
             `nonCanonical` and `collision` for every entry carrying the
             mark, and MUST pass collision entries to `verifyAuditSequence`
             like any other, so that a collision at an occupied sequence
             number is also reported as core's `duplicate`.
```

`canonicalMismatch` catches the store whose structured copy and original text
disagree — a column updated by hand, a migration that rewrote JSON — and
`digestMismatch` the one whose original text no longer matches the digest
written with it. Neither catches an edit that changed text, structure and
digest together; that needs sealing and an anchor held elsewhere
([BEH-GX-173](./21-sealing-through-audit-chain.md#beh-gx-173-seal-verification-is-described-in-exactly-one-way)).

## BEH-GX-035: checkStoredTrail streams one host's entries in bounded memory with the same result

> **Invariant:** [INV-GX-009](../invariants.md#inv-gx-009-a-finding-is-never-suppressed-or-upgraded)
> **See:** [ADR-GX-007](../decisions/007-checks-never-claim-integrity.md), [ADR-GX-004](../decisions/004-append-only-trail-store.md)
> **Satisfies:** [URS-GX-003](../urs.md#urs-gx-003-detect-lost-duplicated-reordered-or-altered-stored-records), [NFR-GX-006](../urs.md#nfr-gx-006-bounded-memory-on-read)
> **Risk:** [RSK-GX-004](../gxp/03-risk-assessment.md#rsk-gx-004)
> **Regulatory:** supports EU GMP Annex 11 §9 (review of large trails)

```ts
// illustrative — not type-checked
declare function checkStoredTrail(
  store: TrailStoreShape,
  options: {
    readonly hostId: string
    readonly expectClosed: boolean
    readonly fromSeq?: number
    readonly toSeq?: number
    readonly pageSize?: number          // default 1000
    readonly maxOpenRequests?: number   // default 100000
  }
): Effect.Effect<CheckReport, TrailReadFailed | CheckCapacityExceeded>

class CheckCapacityExceeded extends Schema.TaggedError<CheckCapacityExceeded>()("CheckCapacityExceeded", {
  hostId: Schema.String,
  auditSeq: Schema.Number                 // the first entry, or open request, the check could not hold
}) {}
```

```
REQUIREMENT: `checkStoredTrail` MUST read the host's entries through
             `store.read` as a stream and MUST hold in memory at most one page
             of entries, the last entry of the previous page, and the open
             `requested` records of BEH-GX-037.
```

```
REQUIREMENT: It MUST run `verifyAuditSequence` page by page, each page
             prefixed with the last entry of the previous page, and MUST
             translate the results to findings so that the report equals,
             finding for finding, the report of `checkTrailEntries` over the
             whole range read at once.
```

```
REQUIREMENT: Numbers below `fromSeq` are outside the range. When `fromSeq`
             is greater than 1, the missing start that `verifyAuditSequence`
             reports (`after` 0) MUST be reported as a `gap` only from
             `fromSeq` to the first `auditSeq` read less one, and not at all
             when the entry at `fromSeq` was read; the report's `scope` MUST
             show the range's start.
```

```
REQUIREMENT: When the open `requested` records exceed `maxOpenRequests`, the
             check MUST fail with `CheckCapacityExceeded { hostId, auditSeq
             }`. It MUST NOT drop open requests, report a partial result, or
             report the run as having no findings.
```

```
REQUIREMENT: When `store.read` fails, the check MUST fail with
             `TrailReadFailed` (BEH-GX-005); a report MUST NOT be produced for
             a range that was only partly read.
```

The equality requirement is what makes paging safe: the test for it is a
property test over seeded trails with defects placed at page boundaries
(duplicates split across two pages, a gap whose ends fall on different
pages), comparing the streamed report with the whole-input one.

**Settled here.** The bound on open requests fails the check rather than
spilling to disk. A healthy trail has a handful of open requests at any point
— each call's `requested` record is answered within the same correlation a
few entries later — so 100,000 open at once is itself a sign of a defect, and
the failure names the `auditSeq` where it happened.

## BEH-GX-036: An entry of an unknown schema version is reported and never skipped

> **Invariant:** [INV-GX-009](../invariants.md#inv-gx-009-a-finding-is-never-suppressed-or-upgraded)
> **See:** [ADR-GX-025](../decisions/025-core-version-range.md), [ADR-GX-007](../decisions/007-checks-never-claim-integrity.md), [ADR-BR-030](../../core/decisions/030-audit-sink-port.md)
> **Satisfies:** [URS-GX-003](../urs.md#urs-gx-003-detect-lost-duplicated-reordered-or-altered-stored-records)
> **Risk:** [RSK-GX-019](../gxp/03-risk-assessment.md#rsk-gx-019)
> **Regulatory:** supports 21 CFR 11.10(b), 11.10(e); EU GMP Annex 11 §8.1

```
REQUIREMENT: An entry whose `record.schemaVersion` is not in the supported
             list (BEH-GX-007), or whose record has a field the supported
             schema does not define, MUST be reported as
             `unknownSchemaVersion` with its `auditSeq` and `recordId`,
             whether or not the sink marked it `schema: "unsupported"`: a
             record written by another sink, or before an upgrade, carries
             no mark.
```

```
REQUIREMENT: Such an entry MUST still take part in every check that needs only
             the entry's top-level fields and bytes: `gap`, `duplicate`,
             `outOfOrder`, `digestMismatch`, `collision` and, for sealed
             trails, seal verification (BEH-GX-171). It MUST be excluded only from the checks that interpret
             record fields, and the report's `detail` for it MUST say "content
             checks not applied".
```

Skipping an entry the checker does not understand would turn a schema drift
into a gap that is not reported as one, or into no finding at all
([RSK-GX-019](../gxp/03-risk-assessment.md#rsk-gx-019)). Keeping it in the sequence and chain checks means its
presence, position and bytes are still accounted for.

## BEH-GX-037: Open requests and an unclean close are findings

> **Invariant:** [INV-GX-009](../invariants.md#inv-gx-009-a-finding-is-never-suppressed-or-upgraded), [INV-BR-022](../../core/invariants.md#inv-br-022-one-requested-and-one-terminal-record-per-mutating-call)
> **See:** [ADR-GX-007](../decisions/007-checks-never-claim-integrity.md), [ADR-BR-030](../../core/decisions/030-audit-sink-port.md), [ADR-BR-031](../../core/decisions/031-audit-failure-policy.md)
> **Satisfies:** [URS-GX-003](../urs.md#urs-gx-003-detect-lost-duplicated-reordered-or-altered-stored-records)
> **Risk:** [RSK-GX-003](../gxp/03-risk-assessment.md#rsk-gx-003), [RSK-BR-004](../../core/gxp/03-risk-assessment.md#rsk-br-004)
> **Regulatory:** supports 21 CFR 11.10(e); EU GMP Annex 11 §9; ALCOA+ Complete

```
REQUIREMENT: A `requested` record MUST be paired with the first later record
             of the same host that is its terminal record under core's rules
             (BEH-BR-198, BEH-BR-200), by phase:
             - `completed` or `failed`: the same `correlationId`,
               `operation`, `target` and `causationId` (a resumer's own
               terminal record, carrying `resumes`, pairs with the resumer's
               own `requested` record by the same rule);
             - `superseded`: the same `correlationId`, `operation` and
               `target`, whatever its `causationId`, which names the
               superseding call's `requested` record and so never equals the
               superseded request's own;
             - `joined`: a `causationId` equal to the requested record's
               `correlationId` and the same `target`; its own
               `correlationId` is the joined call's.
             Pairing MUST be first-in, first-out in `auditSeq` order among
             requests with the same key.
```

```
REQUIREMENT: Every `requested` record left unpaired at the end of the range
             read MUST be reported as `requestedWithoutTerminal`. When the
             range ends before the host's last stored entry, unpaired requests
             within the last 1024 entries of the range MUST NOT be reported,
             and the report's `scope` MUST show the range was partial.
```

```
REQUIREMENT: A `superseded` record MUST be paired whatever its
             `causationId` holds. Whether that `causationId` names a stored
             `requested` record is not checked by this file, and the report
             MUST NOT be read as saying it was.
```

```
REQUIREMENT: With `expectClosed: true`, the check MUST report `noCleanClose`
             for a host whose last entry is not the terminal `completed`
             record of a `shutdown` call. With `expectClosed: false` the kind
             MUST be listed in `notCheckedKinds`.
```

An unanswered request is what core leaves in the trail when the host stopped,
or the sink failed, between a call's two records ([BEH-BR-198](../../core/behaviors/23-audit-sink-and-record.md)). Core makes
the second case loud through the latch; the check makes both visible in the
stored trail, where a reviewer looks. The pairing keys differ by phase
because core's records differ: a `superseded` terminal shares the superseded
call's correlation but carries, as its cause, the superseding call's
`requested` record ([BEH-BR-200](../../core/behaviors/23-audit-sink-and-record.md)), so a key that included `causationId` —
revision 0.1's — paired no supersession and reported every superseded call
as open. A `requested` record dropped for writer overflow leaves no record
and no pairing to miss; it is counted by
[BEH-GX-038](#beh-gx-038-records-core-reported-dropped-are-a-finding) instead.

## BEH-GX-038: Records core reported dropped are a finding

> **Invariant:** [INV-GX-009](../invariants.md#inv-gx-009-a-finding-is-never-suppressed-or-upgraded)
> **See:** [ADR-GX-007](../decisions/007-checks-never-claim-integrity.md), [ADR-BR-031](../../core/decisions/031-audit-failure-policy.md)
> **Satisfies:** [URS-GX-003](../urs.md#urs-gx-003-detect-lost-duplicated-reordered-or-altered-stored-records)
> **Risk:** [RSK-GX-003](../gxp/03-risk-assessment.md#rsk-gx-003), [RSK-BR-006](../../core/gxp/03-risk-assessment.md#rsk-br-006)
> **Regulatory:** supports 21 CFR 11.10(e); EU GMP Annex 11 §9, §13

```
REQUIREMENT: Every `completed` record of an `acknowledgeAuditDegraded` call
             whose `droppedSinceAck` is greater than 0 MUST be reported as
             `droppedSinceAck`, with its `auditSeq`, `recordId`, and `detail`
             "<n> records dropped before this acknowledgement".
```

```
REQUIREMENT: Every record carries `auditDropped`, the host's count of
             records dropped for overflow when it was numbered, which never
             decreases (BEH-BR-195). The check MUST report `auditDropped`, with
             `detail` "<n> records dropped before this record", at the first
             record of the range whose `auditDropped` is greater than that of
             the record before it (or greater than 0, for the first record of
             the host), and MUST report it with `detail` "auditDropped
             decreased" at a record whose value is lower than the one before
             it.
```

```
REQUIREMENT: A `droppedSinceAck` or `auditDropped` finding MUST be reported
             even when a `reason` explains the loss. The check MUST NOT read
             or interpret `reason`.
```

Records dropped for writer overflow leave no gap in `auditSeq`
([BEH-BR-202](../../core/behaviors/23-audit-sink-and-record.md)). The trail says how many there were in two places: the
acknowledgement's `droppedSinceAck`, and, since CCR-BR-026, the `auditDropped`
count every record carries, which shows between which two stored records the
losses happened. Revision 0.1 said the acknowledgement was the only place;
that is no longer true, and the check now reads both. Reporting them every
time keeps a known loss from being forgotten because someone wrote a good
reason for it.

## BEH-GX-039: Approvals and records are checked against each other

> **Invariant:** [INV-GX-009](../invariants.md#inv-gx-009-a-finding-is-never-suppressed-or-upgraded), [INV-GX-003](../invariants.md#inv-gx-003-an-allowed-call-holds-a-valid-binding-with-an-equal-digest)
> **See:** [ADR-GX-011](../decisions/011-ticket-cited-by-correlation-id.md), [ADR-GX-007](../decisions/007-checks-never-claim-integrity.md), [ADR-BR-032](../../core/decisions/032-operation-gate.md)
> **Satisfies:** [URS-GX-009](../urs.md#urs-gx-009-link-each-signature-to-the-change-it-approved), [URS-GX-003](../urs.md#urs-gx-003-detect-lost-duplicated-reordered-or-altered-stored-records)
> **Risk:** [RSK-GX-006](../gxp/03-risk-assessment.md#rsk-gx-006), [RSK-GX-022](../gxp/03-risk-assessment.md#rsk-gx-022)
> **Regulatory:** supports 21 CFR 11.70; EU GMP Annex 11 §14

```ts
// illustrative — not type-checked
declare function checkApprovals(
  store: TrailStoreShape,
  tickets: TicketStoreShape,
  options: { readonly hostId: string; readonly scope: string; readonly policy: ApprovalPolicy }   // scope: BEH-GX-065, BEH-GX-083
): Effect.Effect<CheckReport, TrailReadFailed | TicketReadFailed | CheckCapacityExceeded>
```

```
REQUIREMENT: For every binding consumed in the ticket store with this `hostId`
             (BEH-GX-071), the check MUST find a `requested` or `rejected`
             record whose `correlationId` equals the ticket id and whose
             binding digest, recomputed with `options.scope`, equals the
             consumed one (BEH-GX-083);
             otherwise it MUST report `approvalWithoutRecord`.
```

```
REQUIREMENT: For every `requested` or `rejected` record of an operation that
             the policy in force required a ticket for (BEH-GX-058), the check
             MUST find a consumed binding as above; otherwise it MUST report
             `recordWithoutApproval`. A `rejected` record whose `error` is the
             gate's refusal for a missing or invalid ticket MUST NOT be
             reported: it is the record of a refusal working as intended.
```

The two directions catch different failures. `approvalWithoutRecord` is an
approval spent on a change the trail does not show — a lost `requested`
record, or a binding consumed by a call whose record went elsewhere.
`recordWithoutApproval` is a gated change with no approval behind it — a
policy changed between the call and the check, or a gate that was not wired.
The exact linking rules, including manifestation, are in
[11 — Signature Linking](./11-signature-linking.md).

## BEH-GX-040: A finding is never suppressed, merged or upgraded

> **Invariant:** [INV-GX-009](../invariants.md#inv-gx-009-a-finding-is-never-suppressed-or-upgraded)
> **See:** [ADR-GX-007](../decisions/007-checks-never-claim-integrity.md), [ADR-GX-027](../decisions/027-claims-and-non-claims.md)
> **Satisfies:** [URS-GX-003](../urs.md#urs-gx-003-detect-lost-duplicated-reordered-or-altered-stored-records), [NFR-GX-007](../urs.md#nfr-gx-007-no-secrets-in-any-output)
> **Risk:** [RSK-GX-004](../gxp/03-risk-assessment.md#rsk-gx-004)
> **Regulatory:** supports 21 CFR 11.10(e); EU GMP Annex 11 §9

```
REQUIREMENT: No option, configuration or later step MAY remove a finding from
             a report, lower it to a warning, merge findings of different
             entries into one, or mark a finding as accepted. Findings have no
             severity.
```

```
REQUIREMENT: A consumer's assessment of a finding (an explanation, a deviation
             number) MUST be recorded outside the report, in the evidence
             pack's deviations (BEH-GX-133), referring to the finding by its
             kind, `hostId` and `auditSeq`. The report itself MUST stay
             unchanged.
```

```
REQUIREMENT: `detail` MUST come from a fixed template per kind and MUST NOT
             contain a record's `reason`, actor, target, configuration path or
             any other field value, nor any store error message (BEH-GX-006).
```

A check that can be told to ignore something will, eventually, be told to
ignore the thing that mattered. Keeping the report a plain record of what the
check found, and putting every human judgment about it in a separate,
attributable place, keeps the two distinguishable years later.

---

_Previous: [04 — Conformance Suite](./04-conformance-suite.md)_ · _Next: [06 — High-Water Marks and Anchors](./06-high-water-marks-and-anchors.md)_
