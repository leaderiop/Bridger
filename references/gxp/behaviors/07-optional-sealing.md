# 07 — Optional Sealing (withdrawn)

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-GX-BEH-07                                            |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Withdrawn                                                    |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-GX-03 §5)           |
> | Approved by    | — (pending; single maintainer, see PROC-GX-03 §5)            |
> | Classification | Functional Specification                                     |
> | Change History | 0.2 (2026-11-09): File withdrawn (C-09): BEH-GX-049–056 withdrawn and reserved; sealing adopted from `@bridger/audit-chain` and specified in 21 (CCR-GX-002)<br>0.1 (2026-10-03): Initial draft (CCR-GX-001)                 |

---

**This file is withdrawn** by CCR-GX-002. Revision 0.1 specified a seal chain
of the companion's own — an envelope per entry, anchors of the latest seal in
the companion's anchor store, and `verifySeals` recomputing the chain. The
companion now adopts `@bridger/audit-chain` as its only sealing mechanism
([ADR-GX-029](../decisions/029-sealing-through-audit-chain.md), superseding [ADR-GX-009](../decisions/009-optional-sealing.md)), and the wiring is specified in
[21 — Sealing through audit-chain](./21-sealing-through-audit-chain.md). Two chains would have meant two verifiers, two
link formats and two descriptions of one limit, and the companion's chain
refused to seal over a gap where audit-chain marks and keeps recording
(BEH-AC-005).

The identifiers BEH-GX-049–056 stay reserved and are never reused. Each is
kept below, withdrawn, with the identifier that replaces it.

## BEH-GX-049: The seal chain is defined per host over the entries' digests

> **Withdrawn:** by CCR-GX-002; replaced by BEH-GX-170 ([21 — Sealing through audit-chain](./21-sealing-through-audit-chain.md)).
> **See:** [ADR-GX-029](../decisions/029-sealing-through-audit-chain.md), [ADR-GX-009](../decisions/009-optional-sealing.md) (superseded)

```
REQUIREMENT: BEH-GX-049 is withdrawn. It MUST NOT be implemented, cited as a
             requirement or reused; BEH-GX-170 applies instead.
```

## BEH-GX-050: The envelope sits beside the record, and a repeat is never re-sealed

> **Withdrawn:** by CCR-GX-002; replaced by BEH-GX-170 ([21 — Sealing through audit-chain](./21-sealing-through-audit-chain.md)).
> **See:** [ADR-GX-029](../decisions/029-sealing-through-audit-chain.md), [ADR-GX-009](../decisions/009-optional-sealing.md) (superseded)

```
REQUIREMENT: BEH-GX-050 is withdrawn. It MUST NOT be implemented, cited as a
             requirement or reused; BEH-GX-170 applies instead.
```

## BEH-GX-051: Anchors are taken every N records, every T, and at close

> **Withdrawn:** by CCR-GX-002; replaced by BEH-GX-170, BEH-GX-175 ([21 — Sealing through audit-chain](./21-sealing-through-audit-chain.md)).
> **See:** [ADR-GX-029](../decisions/029-sealing-through-audit-chain.md), [ADR-GX-009](../decisions/009-optional-sealing.md) (superseded)

```
REQUIREMENT: BEH-GX-051 is withdrawn. It MUST NOT be implemented, cited as a
             requirement or reused; BEH-GX-170, BEH-GX-175 applies instead.
```

## BEH-GX-052: verifySeals recomputes the chain and compares it with every anchor

> **Withdrawn:** by CCR-GX-002; replaced by BEH-GX-171 ([21 — Sealing through audit-chain](./21-sealing-through-audit-chain.md)).
> **See:** [ADR-GX-029](../decisions/029-sealing-through-audit-chain.md), [ADR-GX-009](../decisions/009-optional-sealing.md) (superseded)

```
REQUIREMENT: BEH-GX-052 is withdrawn. It MUST NOT be implemented, cited as a
             requirement or reused; BEH-GX-171 applies instead.
```

## BEH-GX-053: Sealing is off by default and fixed for the life of a host

> **Withdrawn:** by CCR-GX-002; replaced by BEH-GX-170 ([21 — Sealing through audit-chain](./21-sealing-through-audit-chain.md)).
> **See:** [ADR-GX-029](../decisions/029-sealing-through-audit-chain.md), [ADR-GX-009](../decisions/009-optional-sealing.md) (superseded)

```
REQUIREMENT: BEH-GX-053 is withdrawn. It MUST NOT be implemented, cited as a
             requirement or reused; BEH-GX-170 applies instead.
```

## BEH-GX-054: Seal verification is described in exactly one way

> **Withdrawn:** by CCR-GX-002; replaced by BEH-GX-173 ([21 — Sealing through audit-chain](./21-sealing-through-audit-chain.md)).
> **See:** [ADR-GX-029](../decisions/029-sealing-through-audit-chain.md), [ADR-GX-009](../decisions/009-optional-sealing.md) (superseded)

```
REQUIREMENT: BEH-GX-054 is withdrawn. It MUST NOT be implemented, cited as a
             requirement or reused; BEH-GX-173 applies instead.
```

## BEH-GX-055: Without a matching anchor, a consistent chain shows only consistency

> **Withdrawn:** by CCR-GX-002; replaced by BEH-GX-172 ([21 — Sealing through audit-chain](./21-sealing-through-audit-chain.md)).
> **See:** [ADR-GX-029](../decisions/029-sealing-through-audit-chain.md), [ADR-GX-009](../decisions/009-optional-sealing.md) (superseded)

```
REQUIREMENT: BEH-GX-055 is withdrawn. It MUST NOT be implemented, cited as a
             requirement or reused; BEH-GX-172 applies instead.
```

## BEH-GX-056: Sealing covers trail entries only

> **Withdrawn:** by CCR-GX-002; replaced by BEH-GX-174 ([21 — Sealing through audit-chain](./21-sealing-through-audit-chain.md)).
> **See:** [ADR-GX-029](../decisions/029-sealing-through-audit-chain.md), [ADR-GX-009](../decisions/009-optional-sealing.md) (superseded)

```
REQUIREMENT: BEH-GX-056 is withdrawn. It MUST NOT be implemented, cited as a
             requirement or reused; BEH-GX-174 applies instead.
```

---

_Previous: [06 — High-Water Marks and Anchors](./06-high-water-marks-and-anchors.md)_ · _Next: [08 — Approval Policy](./08-approval-policy.md)_
