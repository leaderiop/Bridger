# Change history

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-MC-CHG                                               |
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

## BRIDGER-MC-BEH-01

`mcp/behaviors/01-server.md`

- 0.3 (2026-11-08): Inbound sessions tainted unless the application's resolver marks them trusted (BEH-MC-002); the session's listing record and `expectDigest` refuse a call whose definition changed since it was listed, `ToolChanged` mapped (BEH-MC-003–005); `readOnlyHint` from the descriptor; idempotency key from `_meta`; long commands as tasks; new outcomes mapped; MCP resources as projections of read-only commands (BEH-MC-006, BEH-MC-007) (CCR-MC-003, round 2: recheck items 1, 6, 7, 9; X7, X8)
- 0.2 (2026-11-08): `tools/call` pins per call and passes the toolset; deferred direct calls are `isError` results; `onBehalfOf` wording; `Annotations` type (CCR-MC-002)
- 0.1 (2026-11-08): Initial draft (CCR-MC-001)                

## BRIDGER-MC-BEH-04

`mcp/behaviors/04-host-tools.md`

- 0.4 (2026-11-08): Reads and plans declared `readOnly`; host calls carry the dispatch's correlation through core `CurrentCorrelation`; `reconcile-plan` takes `atomic`, `reconcile-apply` reports `ApplyRolledBack` and `PartialApply`, undo requests, core's order and refused digests; call-log wording (CCR-MC-003, round 2: recheck item 9; core round 2 alignment)
- 0.3 (2026-11-08): `PlanStore` and `PlanUnknown`; `UnknownPlugin`; inspect without id; served host calls; error classes declared (CCR-MC-002)
- 0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-MC-001)
- 0.1 (2026-11-08): Initial draft (CCR-MC-001)                
