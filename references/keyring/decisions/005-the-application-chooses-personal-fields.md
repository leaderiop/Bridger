# ADR-KR-005: Which fields are personal data stays with the application

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-KR-ADR-005                                           |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.1 (2026-11-08): Initial draft (CCR-KR-001)                 |

---

## Context

Whether a field is personal data, whose it is, and when it must go depend on the application's domain and the rules that apply to it. Bridger knows nothing about domains ([ADR-BR-027](../../core/decisions/027-core-exclusions.md)).

## Decision

- The application lists the fields to encrypt per event type and supplies the subject function; the package infers nothing.
- The subject id is chosen by the application and must not itself be personal data; unlisted fields and metadata stay readable, and documentation says so.

## Alternatives considered

- **Heuristic detection of personal data.** Rejected: unreliable, and it would imply a coverage the package cannot give.

## Consequences

**Positive**: precise, reviewable field lists.

**Negative**: an omitted field is stored in plaintext.

**Trade-off accepted**: application responsibility, in exchange for no false assurance.

## References

- Behaviours: [BEH-KR-001](../behaviors/01-keys-and-subjects.md#beh-kr-001-a-subject-is-an-opaque-identifier-chosen-by-the-application), [BEH-KR-013](../behaviors/02-field-encryption.md#beh-kr-013-the-application-chooses-the-fields), [BEH-KR-016](../behaviors/02-field-encryption.md#beh-kr-016-what-is-not-encrypted)
