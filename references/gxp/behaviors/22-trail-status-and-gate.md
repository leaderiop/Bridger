# 22 — Trail Status and Gate

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-GX-BEH-22                                            |
> | Revision       | 0.4                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-GX-03 §5)           |
> | Approved by    | — (pending; single maintainer, see PROC-GX-03 §5)            |
> | Classification | Functional Specification                                     |
> | Change History | 0.4 (2026-11-10): BEH-GX-178 a `Defer` from a consumer's gate piece becomes a refusal "<name>: deferred", so the approval piece cannot consume the binding of a call core then rejects (G5) (CCR-GX-007)<br>0.3 (2026-11-10): BEH-GX-178 the consumer's `gatePieces` (a loader's or an entitlement piece) are composed after "chain" and before "approval", validated, and counted in `precededBy`; BEH-GX-179 IQ-23 records them (M5) (CCR-GX-006)<br>0.2 (2026-11-10): BEH-GX-176 counts are those of the one host the layer serves; BEH-GX-179 names IQ-23 and the evidence pack's `sink-status.json` (H6, H7) (CCR-GX-005)<br>0.1 (2026-11-09): Initial draft; the sink's status and the `trailGate` piece that refuses operator changes in place of a refused write (CCR-GX-002) |

---

Some conditions the sink meets are worth stopping operator changes for: a
record of a shape the companion does not know, a record it could not
canonicalise exactly, a colliding identifier, a store that claimed to hold an
entry it does not. None of them is a reason to stop recording. Core's answer
to a refused write is to retry the same record in place, with every later
record waiting behind it, and to set the latch
([BEH-BR-202](../../core/behaviors/23-audit-sink-and-record.md), [BEH-BR-205](../../core/behaviors/23-audit-sink-and-record.md)); a sink that refuses a record for a
condition of its own therefore stops the trail for the life of the host, and
core asks such a sink to use a gate piece instead
([BEH-BR-202](../../core/behaviors/23-audit-sink-and-record.md), Settled (0)). This file defines that piece for the
companion: the sink stores, marks and counts
([03 — Trail Sink](./03-trail-sink.md)); `trailGate` reads the counts and refuses operator changes
before they are made; and `GxpLayer.make` composes it with audit-chain's gate
piece and the approval gate into the one host gate core reads
([ADR-GX-030](../decisions/030-sink-marks-and-gate-refuses.md)). This file owns BEH-GX-176–179 and uses all four.

Planned source: `packages/gxp/src/TrailSinkStatus.ts` and
`packages/gxp/src/trailGate.ts` *(Planned)*.

## BEH-GX-176: The sink reports its own conditions as counts

> **Invariant:** [INV-GX-016](../invariants.md#inv-gx-016-the-sink-never-refuses-a-record-for-a-condition-of-its-own), [INV-GX-005](../invariants.md#inv-gx-005-no-configuration-value-or-key-material-appears-in-any-companion-output)
> **See:** [ADR-GX-030](../decisions/030-sink-marks-and-gate-refuses.md), [ADR-BR-030](../../core/decisions/030-audit-sink-port.md)
> **Satisfies:** [URS-GX-001](../urs.md#urs-gx-001-store-audit-records-with-honest-acknowledgement), [URS-GX-003](../urs.md#urs-gx-003-detect-lost-duplicated-reordered-or-altered-stored-records)
> **Risk:** [RSK-GX-023](../gxp/03-risk-assessment.md#rsk-gx-023), [RSK-GX-019](../gxp/03-risk-assessment.md#rsk-gx-019)
> **Regulatory:** supports 21 CFR 11.10(e); EU GMP Annex 11 §9, §12.1

```ts
// illustrative — not type-checked
interface TrailSinkStatusValue {
  readonly unsupportedSchema: number      // entries stored with marks.schema "unsupported" (BEH-GX-018)
  readonly nonCanonical: number           // entries stored with marks.canonical "jcs-escaped" (BEH-GX-018)
  readonly collisions: number             // "stored-collision" answers (BEH-GX-012)
  readonly readbackMismatches: number     // "already-stored" answers the read-back did not confirm (BEH-GX-021)
}
interface TrailSinkStatusShape {
  readonly current: Effect.Effect<TrailSinkStatusValue>
  readonly changes: Stream.Stream<TrailSinkStatusValue>      // latest-wins
}
class TrailSinkStatus extends Context.Service<TrailSinkStatus, TrailSinkStatusShape>()("@bridger/gxp/TrailSinkStatus") {}
```

```
REQUIREMENT: The counts MUST start at 0 when the `trailSink` layer is built
             and MUST be increased, after the attempt that caused them and
             before the sink answers core, by one for each marked entry,
             each "stored-collision" answer and each read-back that did not
             confirm an "already-stored" answer. They MUST NOT decrease while
             the layer lives.
```

```
REQUIREMENT: The status MUST hold counts only: no `hostId`, `recordId`,
             `auditSeq` or other record field. It MUST NOT be described as a
             record of what was stored; the stored entries and the checks of
             05 are.
```

The counts are the sink's only voice besides its answer to core. A layer
serves one host (BEH-GX-017), so its counts are that host's, and a gate built
over them refuses only that host's operator changes. They carry
no identifiers for the reason the logs carry none (BEH-GX-024); the checks on
read find the entries, which are marked in the store.

## BEH-GX-177: trailGate refuses operator changes while the sink reports a condition of its own

> **Invariant:** [INV-GX-016](../invariants.md#inv-gx-016-the-sink-never-refuses-a-record-for-a-condition-of-its-own), [INV-GX-011](../invariants.md#inv-gx-011-every-port-failure-on-a-decision-path-refuses)
> **See:** [ADR-GX-030](../decisions/030-sink-marks-and-gate-refuses.md), [ADR-BR-047](../../core/decisions/047-generic-gate-and-plan.md), [ADR-BR-032](../../core/decisions/032-operation-gate.md)
> **Satisfies:** [URS-GX-001](../urs.md#urs-gx-001-store-audit-records-with-honest-acknowledgement), [URS-GX-006](../urs.md#urs-gx-006-approve-a-change-before-it-is-made)
> **Risk:** [RSK-GX-023](../gxp/03-risk-assessment.md#rsk-gx-023), [RSK-GX-019](../gxp/03-risk-assessment.md#rsk-gx-019), [RSK-GX-002](../gxp/03-risk-assessment.md#rsk-gx-002)
> **Regulatory:** supports 21 CFR 11.10(e), 11.10(f); EU GMP Annex 11 §9

```ts
// illustrative — not type-checked
declare const trailGate: (status: TrailSinkStatusShape, options: {
  readonly refuseOn: {                                  // no default for any member
    readonly unsupportedSchema: boolean
    readonly nonCanonical: boolean
    readonly collisions: boolean
    readonly readbackMismatches: boolean
  }
  readonly allow: readonly Operation[]                  // operations never refused; no default (e.g. ["remove", "disable", "acknowledgeAuditDegraded"])
}) => Effect.Effect<Gate<OperationRequest>, GxpLayerInvalid>   // core 32, BEH-BR-313
```

| Count greater than 0, with `refuseOn` true | Refusal reason |
| --- | --- |
| `unsupportedSchema` | "trail-schema-unsupported" |
| `nonCanonical` | "trail-non-canonical" |
| `collisions` | "trail-collision" |
| `readbackMismatches` | "trail-readback-mismatch" |

```
REQUIREMENT: `trailGate` MUST return a `Gate<OperationRequest>` as core
             defines it (BEH-BR-313) that reads only the status and MUST NOT
             return `Defer`. For a request whose operation is not in `allow`,
             it MUST return `Refuse` with the reason of the first row of the
             table, in table order, whose count is greater than 0 and whose
             `refuseOn` member is true; otherwise `Allow`.
```

```
REQUIREMENT: `refuseOn` and `allow` MUST be stated explicitly; every member
             of `refuseOn` MUST be given, and a configuration with every
             member false MUST fail with `GxpLayerInvalid` (the piece would
             refuse nothing; "not-used" says that instead, BEH-GX-178).
             `allow` MUST NOT contain "acknowledgeAuditDegraded" unless the
             policy has a rule for it (BEH-GX-062).
```

```
REQUIREMENT: Documentation MUST state that the piece refuses operator calls
             only: system transitions and shutdown are not gated
             (BEH-BR-223) and keep being recorded; a refused call leaves
             core's one `rejected` record carrying the reason (BEH-BR-220),
             which the sink records like any other; and a condition clears
             only when the sink is rebuilt, which, as for audit-chain's
             chain breaks, means the host is rebuilt after the entries have
             been looked at.
```

The piece turns what revision 0.1 expressed as a refused write into a refused
change: the same operator changes stop, but before they are made and with a
reason in the trail, while the record that caused the condition, the records
of the refused calls and every system transition are stored. Not clearing
while the sink lives is deliberate — a count that an operator could reset
from inside the running host would be the "acknowledge and carry on" that the
latch's own acknowledgement already provides for real store outages, without
its record.

## BEH-GX-178: GxpLayer composes one host gate from its pieces, in a fixed order

> **Invariant:** [INV-GX-002](../invariants.md#inv-gx-002-a-binding-is-consumed-at-most-once), [INV-GX-011](../invariants.md#inv-gx-011-every-port-failure-on-a-decision-path-refuses)
> **See:** [ADR-GX-030](../decisions/030-sink-marks-and-gate-refuses.md), [ADR-GX-029](../decisions/029-sealing-through-audit-chain.md), [ADR-BR-047](../../core/decisions/047-generic-gate-and-plan.md)
> **Satisfies:** [URS-GX-006](../urs.md#urs-gx-006-approve-a-change-before-it-is-made), [URS-GX-007](../urs.md#urs-gx-007-bind-an-approval-to-exactly-the-change-approved)
> **Risk:** [RSK-GX-006](../gxp/03-risk-assessment.md#rsk-gx-006), [RSK-GX-023](../gxp/03-risk-assessment.md#rsk-gx-023), [RSK-BR-014](../../core/gxp/03-risk-assessment.md#rsk-br-014)
> **Regulatory:** supports 21 CFR 11.10(f), 11.10(g); EU GMP Annex 11 §12.1

```ts
// illustrative — not type-checked
// Inside GxpLayer.make, when at least one piece is used:
const hostGate = OperationGate.fromGate(Gate.all([             // core 32, BEH-BR-315, BEH-BR-321
  { name: "trail", gate: trail, timeout: "1 second" },          // BEH-GX-177; omitted when "not-used"
  { name: "chain", gate: chain, timeout: "1 second" },          // BEH-GX-175; omitted when "not-used" or sealing off
  ...gatePieces.map(deferRefused),                              // the consumer's, in the order given, a Defer made a Refuse; none when "not-used"
  { name: "approval", gate: OperationGate.asGate(approval), timeout: "forever" }   // 12; bounded by its own deadline
]))
```

```
REQUIREMENT: `GxpLayer.make` MUST provide core's `OperationGate` as
             `OperationGate.fromGate(Gate.all(pieces))` with the pieces that
             are used, in the order "trail", "chain", the consumer's
             `gatePieces` in the order given, "approval". The approval gate
             MUST be last, so that a refusal by an earlier piece ends the
             consultation before a binding can be consumed (BEH-BR-321).
```

```
REQUIREMENT: `GxpLayer.make` MUST fail with `GxpLayerInvalid` (section
             "gatePieces") when a piece of `gatePieces` has a blank `name`, a
             `name` equal to another piece's or to "trail", "chain" or
             "approval", or a `timeout` that is not a finite duration. Each
             piece's `timeout` MUST be counted in the approval gate's
             `precededBy` (BEH-GX-094). `GxpLayer.make` MUST wrap each
             piece's gate so that a `Defer` it returns becomes `Refuse {
             reason: "deferred" }`, recorded as "<name>: deferred": core
             consults the later pieces after a `Defer` (BEH-BR-321), so the
             approval piece would consume the binding of a call that is
             then rejected. The companion MUST NOT add any other condition
             to a consumer's piece; documentation MUST state that such a
             piece SHOULD never return `Defer` and that it is the
             consumer's to qualify.
```

```
REQUIREMENT: Documentation MUST state that a refusal reason in a `rejected`
             record is prefixed by the piece's name ("trail: …", "chain: …",
             "approval: …", BEH-BR-321), and every check, rendering or
             evidence that compares a refusal reason MUST compare the
             prefixed reason.
```

```
REQUIREMENT: When every piece is "not-used", `GxpLayer.make` MUST provide no
             `OperationGate`, leaving core's behaviour unchanged (INV-BR-026).
```

Order matters because only the approval piece has an effect: it consumes a
binding when it allows ([12 — Approval Gate](./12-approval-gate.md)). Placing it last means a call
refused for a trail or anchoring condition keeps its ticket for a later
attempt, and core's own bound, `gateTimeout`, still covers the whole
consultation ([BEH-BR-221](../../core/behaviors/25-operation-gate.md)).

## BEH-GX-179: The status and the gate are part of the installation evidence

> **See:** [ADR-GX-030](../decisions/030-sink-marks-and-gate-refuses.md), [ADR-GX-020](../decisions/020-iq-proof-and-probe.md)
> **Satisfies:** [URS-GX-013](../urs.md#urs-gx-013-produce-installation-evidence), [URS-GX-016](../urs.md#urs-gx-016-know-which-obligations-remain-mine)
> **Risk:** [RSK-GX-023](../gxp/03-risk-assessment.md#rsk-gx-023), [RSK-GX-017](../gxp/03-risk-assessment.md#rsk-gx-017)
> **Regulatory:** supports EU GMP Annex 11 §4.4; 21 CFR 11.10(a) (as evidence the consumer evaluates)

```
REQUIREMENT: The installation checks (BEH-GX-113–120) MUST report, as the
             proof IQ-23, whether `trailGate` is used and with which `refuseOn`
             members and `allow` list, whether audit-chain's `ChainGate`
             is used and with which options, and the `name` and `timeout` of
             each of the consumer's `gatePieces`; a `trailGate` given "not-used"
             MUST be reported as a consumer decision, with the statement
             "Marked entries do not stop operator changes."
```

```
REQUIREMENT: Every evidence pack made for an assembly with a trail sink MUST
             include, as `sink-status.json`, the `TrailSinkStatus` counts
             read when the pack was made, labelled as counts since the sink
             was built (BEH-GX-129).
```

A deployment may decide that a marked entry should not stop changes — a
consumer who reviews every marked entry daily, for example. The companion
lets it, and makes the decision visible where a reviewer of the installation
looks.

---

_Previous: [21 — Sealing through audit-chain](./21-sealing-through-audit-chain.md)_
