# Change Control

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-GX-PROC-03                                           |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see §5)                      |
> | Approved by    | — (pending; single maintainer, see §5)                       |
> | Classification | Procedure                                                    |
> | Change History | 0.1 (2026-10-03): Initial draft (CCR-GX-001)                 |

_Previous: [Definitions of Done](./definitions-of-done.md)_

---

Every change to this specification, and later to the code it governs, passes
through a change control record (`CCR-GX-NNN`). The procedure exists so that a
regulated user can reconstruct why the companion is the way it is, and decide
whether a new version requires them to repeat their own qualification of it
(21 CFR 11.10(k); EU GMP Annex 11 §10; GAMP 5 configuration and change
management). It is the companion's own procedure; core's change control
([BRIDGER-PROC-03](../../core/process/change-control.md)) governs `references/core` and is
joined to this one only by the coupling rule of §7.

## 1. When a CCR is required

```
REQUIREMENT: Any change to a normative document of this tree (URS,
             behaviours, invariants, decisions, GxP documents, process
             documents, the core interface map) MUST be made under a CCR-GX.
             Editorial changes (spelling, formatting, a broken link) MAY share
             one CCR but MUST still be recorded.
```

```
REQUIREMENT: Once code exists, any change to `packages/gxp` that alters a
             BEH-GX, INV-GX, a public type, the canonical form, a digest, a
             fingerprint format or the evidence pack format MUST be made under
             a CCR-GX that names the affected identifiers.
```

## 2. Lifecycle of a CCR

| Step | Activity | Record |
| ---- | -------- | ------ |
| 1 | Request: state the problem and the proposed change | CCR row opened in the README document history |
| 2 | Impact assessment (§3), including the coupling assessment (§7) | In the CCR description and in each affected document's Change History |
| 3 | Review and approval (§5) | Reviewed by / Approved by rows of each affected document |
| 4 | Implementation: edit documents (and later code and tests) | Revision increments |
| 5 | Verification: `scripts/verify-traceability.sh --strict` passes, which runs core's checker too; later, the full merge gate | Gate output kept with the CCR |
| 6 | Close: the CCR row states what changed | README document history |

## 3. Impact assessment

Every CCR-GX answers, in writing:

1. **Identifiers affected.** Which `URS-GX`, `NFR-GX`, `BEH-GX`, `INV-GX`,
   `ADR-GX`, `REQ-GX` and `RSK-GX` identifiers are added, changed or
   withdrawn, and which core identifiers are newly relied on or no longer
   relied on (the [core interface map](../appendices/core-interface-map.md) changes with them).
2. **Risk.** Which `RSK-GX` entries are affected, re-scored in the
   [risk assessment](../gxp/03-risk-assessment.md), and whether the change itself
   introduces a risk. A change that bears on a core risk whose residual names
   the companion (for example RSK-BR-014 or RSK-BR-024) says so, and the
   re-scoring is made under a core CCR (§7).
3. **GxP impact.** Yes or no, with the reason. A change has GxP impact if it
   touches what the trail store stores or acknowledges, the checks on read,
   anchors or sealing, the approval policy, tickets, signatures or the gate,
   fingerprints or keys, installation or operational evidence, export, or any
   row of the [compliance matrix](../gxp/02-compliance-matrix.md).
4. **Revalidation trigger.** Whether a regulated user who has qualified a
   previous version must re-execute qualification, and which scenarios
   (`REQ-GX`) cover the change ([validation plan](../gxp/04-validation-plan.md)).
5. **Compatibility.** Whether the change breaks a public type, a stored or
   exported format (trail entry, seal, binding, ticket event, fingerprint,
   evidence pack, archive), a supported core range or audit `schemaVersion`
   ([ADR-GX-025](../decisions/025-core-version-range.md)), or a documented behaviour.

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
REQUIREMENT: Revisions MUST be 0.x while a document is Draft or In Review,
             1.0 at first approval, and increment by 0.1 per approved change
             thereafter. Each revision MUST add one Change History line
             citing its CCR-GX.
```

ADRs use Proposed, Accepted, Superseded and Withdrawn. An ADR becomes Accepted
only when the code and the test demonstrating it exist
([ADR-GX-026](../decisions/026-prospective-specification.md)).

## 5. Review and approval

Independent review is a GxP expectation: the person who approves a
specification should not be its only author, and the reviewer should have the
competence the review needs (GAMP 5 roles and responsibilities; EU GMP Annex
11 §2 personnel).

This specification has **one maintainer**, who writes and approves it — the
same maintainer as core's. That is disclosed rather than hidden:

- The **Reviewed by** row of every document reads "no independent reviewer
  yet", and the **Approved by** row names the single-maintainer situation.
- No document can reach Approved status with an independent review it has not
  had. Until a second competent reviewer exists, Approved means "approved by
  the maintainer", and the document says so in its Approved by row.
- Reviews by agents, including the consistency review recorded in CCR-GX-001,
  are recorded as such and are not the independent review of this section.
- A regulated user who adopts the companion must treat this specification as
  supplier documentation that has **not** been independently reviewed, and
  perform or commission that review as part of supplier assessment
  ([validation plan](../gxp/04-validation-plan.md)). An independent review is a
  release blocker ([roadmap](../roadmap.md)).

```
REQUIREMENT: The Reviewed by and Approved by rows MUST name the reviewer and
             approver and the date, or state why there is none. They MUST NOT
             be left blank or filled with a role that did not act.
```

## 6. Emergency changes

A defect that makes the companion violate an invariant may be corrected before
its CCR is complete, provided the CCR is opened in the same change, the impact
assessment is completed within the next change, and the README history records
that the change was made as an emergency.

## 7. Coupling with core

The companion is built on core identifiers that core's own change control may
alter. The coupling rule keeps the two registers from drifting apart.

```
REQUIREMENT: A core change (CCR-BR) that adds, amends or withdraws a core
             identifier listed in the core interface map MUST be answered by
             a CCR-GX that assesses its effect on the companion, even when
             the answer is "no change". The CCR-GX MUST cite the CCR-BR, and
             the CCR-BR SHOULD cite the CCR-GX in its compatibility item.
```

```
REQUIREMENT: A companion change that needs a core change MUST NOT be closed
             before the CCR-BR that makes the core change is registered in
             core's README; the CCR-GX MUST cite it.
```

```
REQUIREMENT: A CCR-GX that changes the supported core range or audit
             `schemaVersion` MUST update the compatibility matrix of the core
             interface map in the same change.
```

The checker enforces the mechanical half of the rule: a `CCR-BR` cited in this
tree must be in core's register (check 13), every core identifier cited must
be defined in core and listed in the map (check 14), and core's checker must
pass (check 15). Whether a CCR-BR was assessed at all is a review question the
checker cannot answer.

**Settled here.** The coupling is a pair of cross-references, not a shared
register: each tree keeps its own numbering, so that core can be read and
changed without the companion, as [ADR-GX-001](../decisions/001-separate-package.md) requires, and a
shared register would make core's history depend on a package core does not
know about. CCR-BR-014 is the first core change made for the companion;
CCR-GX-001 cites it as complete.

---

_Next: [Requirement Identifier Scheme](./requirement-id-scheme.md)_
