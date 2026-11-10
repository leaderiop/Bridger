# 06 — High-Water Marks and Anchors

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-GX-BEH-06                                            |
> | Revision       | 0.3                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-GX-03 §5)           |
> | Approved by    | — (pending; single maintainer, see PROC-GX-03 §5)            |
> | Classification | Functional Specification                                     |
> | Change History | 0.3 (2026-11-10): BEH-GX-041: `AnchorWriteFailed`, `AnchorReadFailed` declared as `Schema.TaggedError`, raised but never declared before (CCR-GX-005)<br>0.2 (2026-11-09): BEH-GX-042, 048: `HighWaterMark.seal` withdrawn; the anchor store holds high-water marks only; marks become audit-chain's expected heads (C-09) (CCR-GX-002)<br>0.1 (2026-10-03): Initial draft (CCR-GX-001)                 |

---

Every check of [05 — Checks on Read](./05-checks-on-read.md) works from what
the store holds, so none of them can see records missing after the last one
stored: a trail truncated at entry 900 of 1,000 looks exactly like a trail of
900 entries ([BEH-BR-215](../../core/behaviors/24-time-ids-and-sequence.md)). The only way to notice is to compare the store
with a number kept somewhere else — the host's own count of records written,
recorded periodically and at close into an `AnchorStore` held under separate
custody. This file defines that store, the recorder that writes to it, and
the two findings the comparison gives: `tailLoss` and `unanchoredTail`
([ADR-GX-008](../decisions/008-high-water-anchors.md)). This file owns BEH-GX-041–048 and uses all eight.

> **What the anchor store does not do — and who does**
>
> The comparison is only as good as the separation between the two stores. A
> party able to rewrite both the trail and the anchors can remove records
> and lower the marks to match. Keeping the anchor store under custody
> separate from the trail store — another system, other administrators — is
> the consumer's obligation; the companion records what the consumer
> declares and cannot check it.

Planned source: `packages/gxp/src/AnchorStore.ts`,
`packages/gxp/src/recordHighWater.ts` and
`packages/gxp/src/checks/checkHighWater.ts` *(Planned)*. Core supplies the
position through `Host.controls`, and `CloseReport.auditLastSeq` as a lower
bound at close (core CCR-BR-014; [BEH-BR-013](../../core/behaviors/02-host-construction.md), [BEH-BR-106](../../core/behaviors/12-shutdown-and-hosting.md)).

## BEH-GX-041: The AnchorStore port is append-only and has no default

> **Invariant:** [INV-GX-001](../invariants.md#inv-gx-001-no-decision-port-has-a-default-outside-the-testing-entry-point), [INV-GX-008](../invariants.md#inv-gx-008-no-companion-api-rewrites-a-stored-entry)
> **See:** [ADR-GX-008](../decisions/008-high-water-anchors.md), [ADR-GX-003](../decisions/003-ports-without-defaults.md)
> **Satisfies:** [URS-GX-004](../urs.md#urs-gx-004-detect-loss-of-the-newest-records)
> **Risk:** [RSK-GX-005](../gxp/03-risk-assessment.md#rsk-gx-005), [RSK-GX-003](../gxp/03-risk-assessment.md#rsk-gx-003)
> **Regulatory:** supports 21 CFR 11.10(e); EU GMP Annex 11 §7.1, §9

```ts
// illustrative — not type-checked
interface AnchorStoreShape {
  readonly manifest: {
    readonly name: string
    readonly version: string
    readonly custodian: string            // declared custody, e.g. "QA records system, ops team B"
    readonly fixture?: true               // testing entry point only (BEH-GX-145)
  }
  readonly put: (mark: HighWaterMark) => Effect.Effect<"stored" | "already-stored", AnchorWriteFailed>
  readonly list: (q: { readonly hostId: string }) => Stream.Stream<HighWaterMark, AnchorReadFailed>   // ascending lastWritten, then `at`
  readonly latest: (q: { readonly hostId: string }) => Effect.Effect<Option.Option<HighWaterMark>, AnchorReadFailed>
}
class AnchorStore extends Context.Service<AnchorStore, AnchorStoreShape>()("@bridger/gxp/AnchorStore") {}

class AnchorWriteFailed extends Schema.TaggedError<AnchorWriteFailed>()("AnchorWriteFailed", {
  reason: Schema.Literal("unavailable", "rejected"),
  message: Schema.String
}) {}
class AnchorReadFailed extends Schema.TaggedError<AnchorReadFailed>()("AnchorReadFailed", {
  reason: Schema.Literal("unavailable", "rejected"),
  message: Schema.String
}) {}
```

```
REQUIREMENT: An `AnchorStore` MUST offer no method that updates or deletes a
             mark. `put` of a mark equal in every field to a stored one MUST
             answer "already-stored" and store nothing; `put` of a mark with
             the same `hostId` and `lastWritten` and a different `source` or
             `at` MUST store it as a separate mark.
```

```
REQUIREMENT: `latest` MUST return the stored mark of the host with the highest
             `lastWritten`, and among equal ones the latest `at`. `list` MUST
             return every stored mark of the host.
```

```
REQUIREMENT: The companion MUST NOT export an `AnchorStore` from its main
             entry point. `memoryAnchorStore` exists only in
             `@bridger/gxp/testing` (BEH-GX-145).
```

The port is shaped like the trail store's for the same reason: whatever is
written must stay as written, and a repeat must not double it. It is a
separate port, not a second `TrailStore`, because it must be able to live in a
different system with different administrators, which is its whole value.

## BEH-GX-042: A high-water mark records the host's last written sequence number and when it was read

> **Invariant:** [INV-GX-005](../invariants.md#inv-gx-005-no-configuration-value-or-key-material-appears-in-any-companion-output)
> **See:** [ADR-GX-008](../decisions/008-high-water-anchors.md), [ADR-GX-029](../decisions/029-sealing-through-audit-chain.md), [ADR-BR-025](../../core/decisions/025-deterministic-time-and-ids.md)
> **Satisfies:** [URS-GX-004](../urs.md#urs-gx-004-detect-loss-of-the-newest-records)
> **Risk:** [RSK-GX-003](../gxp/03-risk-assessment.md#rsk-gx-003), [RSK-GX-018](../gxp/03-risk-assessment.md#rsk-gx-018)
> **Regulatory:** supports 21 CFR 11.10(e); ALCOA+ Contemporaneous

```ts
// illustrative — not type-checked
interface HighWaterMark {
  readonly v: 1
  readonly hostId: string
  readonly lastWritten: number          // HostControls.auditPosition.lastWritten (at close: read after the flush)
  readonly at: string                   // from Clock, ISO-8601 UTC with ms
  readonly source: "periodic" | "close"
  // `seal` (revision 0.1) is withdrawn: the chain and its anchors are @bridger/audit-chain's (21)
}
```

```
REQUIREMENT: `lastWritten` MUST be a number the host itself reported:
             `HostControls.auditPosition.lastWritten` for periodic marks, and
             for the close mark the reading of BEH-GX-044. The recorder MUST
             NOT derive it from the trail store.
```

```
REQUIREMENT: `at` MUST be read from `Clock` when the position is read. A mark
             MUST carry no other field than those above: no actor, record
             content or configuration value.
```

```
REQUIREMENT: A mark MUST NOT carry a seal, hash or link. With sealing on, the
             host's highest mark is passed to audit-chain's verification as
             the expected head of the host (BEH-GX-171); the `AnchorStore` of
             this file holds high-water marks only and MUST NOT be used as
             audit-chain's `Anchor` or `ReceiptStore`.
```

A mark taken from the host, not from the store, is independent of the store:
if the store loses its newest entries afterwards, the mark still says how far
the host had got. `at` is for a reviewer reading the marks; the comparisons of
this file use `lastWritten` only, so a wrong clock cannot produce or hide a
finding ([RSK-GX-018](../gxp/03-risk-assessment.md#rsk-gx-018)).

## BEH-GX-043: recordHighWater reads Host.controls on a schedule and writes a mark when the position moved

> **See:** [ADR-GX-008](../decisions/008-high-water-anchors.md), [ADR-BR-034](../../core/decisions/034-gxp-companion-scope.md)
> **Satisfies:** [URS-GX-004](../urs.md#urs-gx-004-detect-loss-of-the-newest-records)
> **Risk:** [RSK-GX-003](../gxp/03-risk-assessment.md#rsk-gx-003)
> **Regulatory:** supports 21 CFR 11.10(e); EU GMP Annex 11 §9

```ts
// illustrative — not type-checked
type HighWaterSchedule = { readonly every: Duration.Input }   // at least 1 second, at most 1 hour

declare function recordHighWater(
  host: Host,
  anchors: AnchorStoreShape,
  schedule: HighWaterSchedule
): Effect.Effect<HighWaterRecorder, never, Scope.Scope>

interface HighWaterRecorder {
  readonly recordClose: (report: CloseReport) => Effect.Effect<void, AnchorWriteFailed>
  readonly status: Effect.Effect<{ readonly lastMarked: number; readonly consecutiveFailures: number }>
}
```

```
REQUIREMENT: The recorder MUST read `host.controls` once per `schedule.every`
             of `Clock` time, and MUST `put` a periodic mark when
             `auditPosition.lastWritten` is greater than the `lastWritten` of
             its previous successful mark. It MUST NOT put a mark when the
             position did not move.
```

```
REQUIREMENT: A failed `put` MUST NOT affect the host: it MUST NOT call a host
             operation, set the latch or delay a record. The recorder MUST log
             each failure at warning level, at error level from the third
             consecutive failure, and MUST retry at the next tick with the
             position then current.
```

```
REQUIREMENT: The recorder MUST run in the scope it is given and stop when that
             scope closes. It MUST NOT read `host.controls` after the host has
             begun shutting down, except as BEH-GX-044 states.
```

```
REQUIREMENT: `schedule.every` MUST lie between 1 second and 1 hour;
             `GxpLayer.make` and `recordHighWater` MUST refuse other values
             with `GxpLayerInvalid` (BEH-GX-004).
```

The recorder is deliberately off the decision path: the host's changes are
protected by the trail sink and the latch, and the marks exist only to make a
later loss detectable. A failing anchor store therefore costs detection, not
availability, and that cost shows up where it belongs — as an
`unanchoredTail` finding that grows until marks are written again
([BEH-GX-046](#beh-gx-046-unanchoredtail-is-reported-for-entries-no-mark-covers)).

## BEH-GX-044: At close the mark comes from Host.controls after the flush, never from CloseReport.auditLastSeq alone

> **See:** [ADR-GX-008](../decisions/008-high-water-anchors.md)
> **Satisfies:** [URS-GX-004](../urs.md#urs-gx-004-detect-loss-of-the-newest-records)
> **Risk:** [RSK-GX-003](../gxp/03-risk-assessment.md#rsk-gx-003)
> **Regulatory:** supports 21 CFR 11.10(e); EU GMP Annex 11 §9

```
REQUIREMENT: `recordClose(report)` MUST put one mark with `source: "close"`
             and `lastWritten` equal to `auditPosition.lastWritten` read from
             `host.controls` once, after shutdown has returned its report and
             therefore after the writer's final flush (BEH-BR-208).
```

```
REQUIREMENT: `recordClose` MUST NOT use `report.auditLastSeq`, or a reading
             taken before the flush, as the close mark: core produces the
             report before the shutdown's own terminal record is written
             (BEH-BR-106), so either can be lower than the last record
             written and would hide the loss of the records written after it
             (core prototype finding G34). When the reading is lower than
             `report.auditLastSeq`, `recordClose` MUST put the mark with
             `report.auditLastSeq` and log the discrepancy at error level.
```

```
REQUIREMENT: The close mark MUST be put even when the position did not move
             since the last periodic mark, so that a clean close is marked as
             such. When `report.auditDegraded` is true, the mark MUST still be
             put; the unwritten records are not in `lastWritten` and are
             visible through the latch, not through the mark.
```

The close mark is the strongest single mark: after it, the host writes no
more records, so any entry missing at or below it is a loss, and nothing
above it should exist. Paired with `noCleanClose` ([BEH-GX-037](./05-checks-on-read.md#beh-gx-037-open-requests-and-an-unclean-close-are-findings)) it lets a
reviewer tell "the host was shut down and every record it wrote is stored"
from "the host stopped, and we do not know what it wrote last".

## BEH-GX-045: tailLoss is reported when the store holds less than a mark says was written

> **Invariant:** [INV-GX-009](../invariants.md#inv-gx-009-a-finding-is-never-suppressed-or-upgraded)
> **See:** [ADR-GX-008](../decisions/008-high-water-anchors.md), [ADR-GX-007](../decisions/007-checks-never-claim-integrity.md)
> **Satisfies:** [URS-GX-004](../urs.md#urs-gx-004-detect-loss-of-the-newest-records), [URS-GX-003](../urs.md#urs-gx-003-detect-lost-duplicated-reordered-or-altered-stored-records)
> **Risk:** [RSK-GX-003](../gxp/03-risk-assessment.md#rsk-gx-003)
> **Regulatory:** supports 21 CFR 11.10(e); EU GMP Annex 11 §9; ALCOA+ Complete

```ts
// illustrative — not type-checked
declare function checkHighWater(
  store: TrailStoreShape,
  anchors: AnchorStoreShape,
  options: { readonly hostId: string }
): Effect.Effect<CheckReport, TrailReadFailed | AnchorReadFailed>
```

```
REQUIREMENT: The check MUST compare the highest stored `auditSeq` of the host
             (`HostExtent.lastSeq`, 0 when the host has no entry) with the
             highest `lastWritten` among its marks. When the mark is higher,
             it MUST report one `tailLoss` finding with `auditSeq` = stored
             `lastSeq` + 1 and `toSeq` = the mark's `lastWritten`.
```

```
REQUIREMENT: The check MUST also report `tailLoss` for a host that has marks
             and no stored entry at all, since `hosts` does not list it
             (BEH-GX-015); it MUST therefore enumerate hosts from the anchor
             store as well as from the trail store.
```

```
REQUIREMENT: When the anchor store cannot be read, the check MUST fail with
             `AnchorReadFailed`. It MUST NOT report the comparison as done.
```

Gaps below the stored `lastSeq` are reported by `verifyAuditSequence`
([BEH-GX-034](./05-checks-on-read.md#beh-gx-034-checktrailentries-is-a-pure-check-over-entries-reusing-verifyauditsequence)); the mark adds exactly what it cannot see — the range above
the last entry. The two checks together report missing entries anywhere up
to the highest mark.

## BEH-GX-046: unanchoredTail is reported for entries no mark covers

> **Invariant:** [INV-GX-009](../invariants.md#inv-gx-009-a-finding-is-never-suppressed-or-upgraded)
> **See:** [ADR-GX-008](../decisions/008-high-water-anchors.md), [ADR-GX-007](../decisions/007-checks-never-claim-integrity.md)
> **Satisfies:** [URS-GX-004](../urs.md#urs-gx-004-detect-loss-of-the-newest-records), [URS-GX-016](../urs.md#urs-gx-016-know-which-obligations-remain-mine)
> **Risk:** [RSK-GX-003](../gxp/03-risk-assessment.md#rsk-gx-003), [RSK-GX-004](../gxp/03-risk-assessment.md#rsk-gx-004)
> **Regulatory:** supports EU GMP Annex 11 §9 (by stating what cannot be detected)

```
REQUIREMENT: When the stored `lastSeq` of a host is greater than the highest
             `lastWritten` of its marks, the check MUST report one
             `unanchoredTail` finding from that `lastWritten` + 1 to
             `lastSeq`. A host with no marks MUST be reported with the range 1
             to `lastSeq`.
```

```
REQUIREMENT: When `GxpLayer.make` was given `anchors: "not-used"`, every check
             run that the companion offers MUST list `tailLoss` in
             `notCheckedKinds` and report `unanchoredTail` for each host's
             whole range.
```

An unanchored tail is not a defect: a running host always has one, as long as
the recording interval. It is reported because the entries in it could be lost
without any check noticing, and a reviewer must know how much of the trail
that applies to. A tail that is long, or that covers a closed host, is the
sign that the recorder or its store stopped working.

## BEH-GX-047: Separate custody of the anchor store is declared by the consumer and shown, not verified

> **See:** [ADR-GX-008](../decisions/008-high-water-anchors.md), [ADR-GX-020](../decisions/020-iq-proof-and-probe.md), [ADR-GX-027](../decisions/027-claims-and-non-claims.md)
> **Satisfies:** [URS-GX-016](../urs.md#urs-gx-016-know-which-obligations-remain-mine), [URS-GX-004](../urs.md#urs-gx-004-detect-loss-of-the-newest-records)
> **Risk:** [RSK-GX-005](../gxp/03-risk-assessment.md#rsk-gx-005)
> **Regulatory:** supports EU GMP Annex 11 §7.1, §12.1 (as consumer controls)

```
REQUIREMENT: The anchor store's manifest MUST declare a `custodian`, and the
             trail store's manifest is the record of the trail's. The
             installation checks MUST report as failed an anchor store whose
             `name` equals the trail store's or whose `custodian` is empty
             (BEH-GX-113), and MUST report the separation itself as a probe,
             not a proof (ADR-GX-020).
```

```
REQUIREMENT: Every report that contains a `tailLoss` or `unanchoredTail` check
             MUST include the anchor store's `custodian` as declared, and the
             sentence "Separate custody is declared by the consumer and is not
             verified by @bridger/gxp."
```

The companion can see two names and a declared custodian; it cannot see who
holds administrative rights to which database. Stating the declaration in
every report puts it in front of the person who can check it. This is the
consumer's obligation.

## BEH-GX-048: What high-water marks can and cannot show

> **See:** [ADR-GX-008](../decisions/008-high-water-anchors.md), [ADR-GX-027](../decisions/027-claims-and-non-claims.md), [ADR-BR-034](../../core/decisions/034-gxp-companion-scope.md)
> **Satisfies:** [URS-GX-016](../urs.md#urs-gx-016-know-which-obligations-remain-mine)
> **Risk:** [RSK-GX-004](../gxp/03-risk-assessment.md#rsk-gx-004), [RSK-GX-005](../gxp/03-risk-assessment.md#rsk-gx-005)
> **Regulatory:** supports (by delimiting) 21 CFR 11.10(e); EU GMP Annex 11 §9

```
REQUIREMENT: Documentation and reports MUST describe the marks as detecting
             the loss of stored entries up to the highest mark, against a
             party that cannot also rewrite the anchor store. They MUST state
             that entries above the highest mark can be lost without
             detection, and that marks record positions only: an entry altered
             in place keeps its position and is detected, if at all, by the
             digest checks of 05 or the seal verification of 21.
```

```
REQUIREMENT: No output MAY describe a trail with no `tailLoss` finding as
             complete or as having lost nothing.
```

The marks make one precise claim possible — "the store holds every position
up to N that the host reported writing" — and the findings carry it. With
sealing on, the same position becomes audit-chain's expected head, which lets
seal verification report the removal of the newest anchored windows together
with their receipts ([BEH-GX-171](./21-sealing-through-audit-chain.md#beh-gx-171-verifyseals-runs-audit-chains-verification-over-the-stored-entries-with-high-water-marks-as-expected-heads)).

---

_Previous: [05 — Checks on Read](./05-checks-on-read.md)_ · _Next: [07 — Optional Sealing (withdrawn)](./07-optional-sealing.md)_
