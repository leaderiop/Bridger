# Change history

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-AC-CHG                                               |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Change Record                                                |
> | Change History | 0.1 (2026-11-22): Older Change History lines moved out of the Document Control tables (improvement report 07, R6) |

---

A Document Control cell keeps its newest revisions; older lines are moved here, newest first, under the Document ID of
the document they belong to (`python3 references/core/scripts/split-history.py`). Nothing is rewritten: a line moves whole.

## BRIDGER-AC-BEH-01

`audit-chain/behaviors/01-hash-chain-sink.md`

- 0.2 (2026-11-08): No condition of the sink's own fails a write: order and host violations and retry mismatches are appended with a break marker, unsupported schema versions and strings that are not I-JSON are chained with a marker (escaped canonical form); `failClosed` and `maxPending` options removed; the cost of core's retry in place stated (CCR-AC-002)
- 0.1 (2026-11-08): Initial draft (CCR-AC-001)                

## BRIDGER-AC-BEH-03

`audit-chain/behaviors/03-verification.md`

- 0.3 (2026-11-08): Store port renamed `ChainStore`; offline bundles in 05 (round 2: recheck items 13, 14) (CCR-AC-003)
- 0.2 (2026-11-08): `verifyChain` takes `expectedHeads` and reports `head` per host; marked links reported as "sink-marked" breaks and escaped encodings as notices; undetectable cases listed; acceptance checks 1–4, 8 and 11 updated (CCR-AC-002)
- 0.1 (2026-11-08): Initial draft (CCR-AC-001)                
