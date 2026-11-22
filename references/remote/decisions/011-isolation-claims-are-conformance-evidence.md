# ADR-RM-011: An adapter's isolation claims are conformance evidence, not an enum

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-RM-ADR-011                                           |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.1 (2026-11-22): Initial draft (improvement report 06, R3)  |

---

## Context

Bridger provides no isolation ([ADR-RM-006](./006-isolation-comes-from-the-host.md)).
The improvement report proposed a loader class `partner` and an isolation level
on the adapter. The loader already has a guest trust class (BEH-LD-066..068), and
a level on a profile would be a claim Bridger cannot back: it would be the
adapter's word.

## Decision

- No new enum, no profile field. An adapter's isolation is shown by a numbered
  negative conformance suite of six probes ([BEH-RM-073](../behaviors/09-placement-budgets-and-adapters.md#beh-rm-073-an-adapters-isolation-claims-are-evidence-from-a-negative-conformance-suite)),
  the same pattern as the trail-store suite (gxp BEH-GX-025..032): the manifest first
  and result-free, unsupported is a failure, numbers never reused.
- A deployment attaches the manifest and results to its operational
  qualification evidence (gxp BEH-GX-130).

## Consequences

- `@bridger/worker` fails two cases (egress and filesystem) and its documentation says so: honest by
  construction.
- A real sandbox adapter earns its claim by passing cases, not by its name.
- Six probes are not the whole attack surface: the output says so (BEH-RM-073).
