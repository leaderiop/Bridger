# Change Control

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-PROC-03                                              |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see §5)                      |
> | Approved by    | — (pending; single maintainer, see §5)                       |
> | Classification | Process Specification                                        |
> | Change History | 0.1 (2026-10-02): Initial draft (CCR-BR-001)                 |

_Previous: [Definitions of Done](./definitions-of-done.md)_

---

Every change to this specification, and later to the code it governs, passes
through a change control record (`CCR-BR-NNN`). The procedure exists so that a
regulated user can reconstruct why the library is the way it is, and decide
whether a new version requires them to re-qualify it (21 CFR 11.10(k); EU GMP
Annex 11 §10; GAMP 5 configuration and change management).

## 1. When a CCR is required

```
REQUIREMENT: Any change to a normative document (URS, behaviours, invariants,
             decisions, GxP documents, process documents) MUST be made under a
             CCR. Editorial changes (spelling, formatting, a broken link) MAY
             share one CCR but MUST still be recorded.
```

```
REQUIREMENT: Once code exists, any change to `packages/core` that alters a
             BEH, INV or public type MUST be made under a CCR that names the
             affected identifiers.
```

## 2. Lifecycle of a CCR

| Step | Activity | Record |
| ---- | -------- | ------ |
| 1 | Request: state the problem and the proposed change | CCR row opened in the README document history |
| 2 | Impact assessment (§3) | In the CCR description and in each affected document's Change History |
| 3 | Review and approval (§5) | Reviewed by / Approved by rows of each affected document |
| 4 | Implementation: edit documents (and later code and tests) | Revision increments |
| 5 | Verification: `scripts/verify-traceability.sh --strict` passes; later, the full merge gate | Gate output kept with the CCR |
| 6 | Close: the CCR row states what changed | README document history |

## 3. Impact assessment

Every CCR answers, in writing:

1. **Identifiers affected.** Which `URS`, `BEH`, `INV`, `ADR`, `REQ` and `RSK`
   identifiers are added, changed or withdrawn.
2. **Risk.** Which `RSK-BR` entries are affected, re-scored in the
   [risk assessment](../gxp/03-risk-assessment.md), and whether a new risk
   is introduced by the change itself.
3. **GxP impact.** Yes or no, with the reason. A change has GxP impact if it
   touches attribution, the audit record, the audit sequence, the operation
   gate, time or identifier sources, the legality table, or any row of the
   [compliance matrix](../gxp/02-compliance-matrix.md).
4. **Revalidation trigger.** Whether a regulated user who has qualified a
   previous version must re-execute qualification, and which scenarios
   (`REQ-BR`) cover the change ([validation plan](../gxp/04-validation-plan.md)).
5. **Compatibility.** Whether the change breaks a public type, an audit record
   schema (`schemaVersion`), or a documented behaviour.

## 4. Document lifecycle and revisions

| Status | Meaning |
| ------ | ------- |
| Draft | Being written; not for use |
| In Review | Submitted for independent review |
| Approved | Reviewed and approved; awaiting the implementation that makes it effective |
| Effective | Approved, and the implementation and tests it describes exist |
| Superseded | Replaced by a newer document, which is named |
| Withdrawn | No longer applicable; identifiers it defined stay reserved |

```
REQUIREMENT: Revisions are 0.x while a document is Draft or In Review, 1.0 at
             first approval, and increment by 0.1 per approved change
             thereafter. Each revision adds one Change History line citing its
             CCR.
```

ADRs use Proposed, Accepted, Superseded and Withdrawn. An ADR becomes Accepted
only when the code and the test demonstrating it exist
([ADR-BR-036](../decisions/036-prospective-specification.md)).

## 5. Review and approval

Independent review is a GxP expectation: the person who approves a
specification should not be its only author, and a reviewer should be
qualified for the review (GAMP 5 roles and responsibilities; EU GMP Annex 11
§2 personnel).

This specification currently has **one maintainer**, who writes and approves
it. That is recorded rather than hidden:

- The **Reviewed by** row of every document reads "no independent reviewer
  yet", and the **Approved by** row names the single-maintainer situation.
- No document can reach Approved status with an independent review it has not
  had. Until a second qualified reviewer exists, Approved means "approved by the
  maintainer", and the document says so in its Approved by row.
- A regulated user who adopts Bridger must treat this specification as
  supplier documentation that has **not** been independently reviewed, and
  perform or commission that review as part of supplier assessment
  ([validation plan](../gxp/04-validation-plan.md)).

```
REQUIREMENT: The Reviewed by and Approved by rows MUST name the reviewer and
             approver and the date, or state why there is none. They MUST NOT
             be left blank or filled with a role that did not act.
```

## 6. Emergency changes

A defect that makes the library violate an invariant may be corrected before
its CCR is complete, provided the CCR is opened in the same change, the impact
assessment is completed within the next change, and the README history records
that the change was made as an emergency.

---

_Next: [Requirement Identifier Scheme](./requirement-id-scheme.md)_
