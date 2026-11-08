# ADR-SQ-004: Formats and meaning stay in the application

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-SQ-ADR-004                                           |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.1 (2026-11-08): Initial draft (CCR-SQ-001)                 |

---

## Context

Number formats — prefixes, years, padding, check digits, per-period restarts — vary by application and by the rules that apply to it. Bridger knows nothing about domains ([ADR-BR-027](../../core/decisions/027-core-exclusions.md)).

## Decision

- The package stores and returns positive integers only.
- Formatting, rendering and any per-period restart (a new series name) are the application's.

## Alternatives considered

- **A format template in the series.** Rejected: it would carry domain rules into a generic package and make a format change look like a series change.

## Consequences

**Positive**: the package stays generic; formats can change without touching series.

**Negative**: each application writes its formatter.

**Trade-off accepted**: a little application code, in exchange for a generic package.

## References

- Behaviours: [BEH-SQ-017](../behaviors/03-formats-testing-and-acceptance.md#beh-sq-017-number-formats-stay-in-the-application)
