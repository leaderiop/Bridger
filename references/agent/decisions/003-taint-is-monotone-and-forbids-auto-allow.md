# ADR-AG-003: Taint is monotone per session and forbids automatic allow

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-AG-ADR-003                                           |
> | Revision       | 0.3                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.3 (2026-11-08): Rule enforced by the command catalog's taint floor; `TaintGuard.drafts` (CCR-AG-002)<br>0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-AG-001)<br>0.1 (2026-11-08): Initial draft (CCR-AG-001)                 |

---

## Context

A model that reads text from a third party — an imported tool's output, a
product description, a document — can be steered by it. An application gate
that auto-allows some agent writes (small, reversible, within caps) is safe
only while the session has not read such text. Gates are written per
application; the rule "never auto-allow after untrusted text" is generic and
easy to forget.

## Decision

- **Taint and provenance are core's `Annotation.Taint` and
  `Annotation.Provenance`** on `OperationContext` ([core file 30](../../core/behaviors/30-operation-context-annotations.md)), with label
  conventions defined here,, carried by dispatch to the gate, hooks and call log
  (BEH-AG-017, BEH-AG-021).
- **Taint is monotone per session**: it is set before the model reads the
  tainted text and never cleared (BEH-AG-018); sources are imported tool
  output, outputs tagged untrusted, tainted memory and the application's
  `TaintPolicy`, which fails closed (BEH-AG-019).
- **The rule is enforced by the command catalog's taint floor**
  ([ADR-CM-005](../../command/decisions/005-taint-floor-in-dispatch.md), command BEH-CM-016): every
  dispatch of a tainted request passes on `Allow` only with a wired gate and
  an `ApprovalRef` bound to the request's digest and input digest; otherwise
  it is deferred or refused, gate or no gate. **`TaintGuard.drafts`** supplies
  the floor's draft source, so a withheld allow becomes a draft a person can
  approve; the application's gate checks that the approval exists and was not
  given by an actor within the agent's actor (`Actor.isWithin`) (BEH-AG-020).
  (Revision 0.1 placed the rule in a `TaintGuard` plugin installing a
  mandatory interception; core does not let a plugin install one, and an
  interception cannot reach a gate read while a base layer is built.)
- Taint does not sanitize anything and does not leave the session
  (BEH-AG-022).

## Alternatives considered

- **Leave the rule to each application gate.** Rejected: the one rule every
  gate needs would be missing from some.
- **Taint per message, clearing after a turn.** Rejected: text read earlier
  still shapes later turns.
- **Refuse tainted writes outright.** Rejected: proposing drafts from
  untrusted input is the useful case; a person decides.

## Consequences

**Positive**:

- No change happens without a person once a session may be steered.

**Negative**:

- Long sessions that touch external text require approval for every write.

**Trade-off accepted**: approval friction, in exchange for a rule that does
not depend on every gate author remembering it.

## References

- Behaviours: [03 — Taint and provenance](../behaviors/03-taint-and-provenance.md), [04 — Subagents](../behaviors/04-subagents.md)
- Invariants: [INV-AG-001](../invariants.md#inv-ag-001-a-tainted-session-is-never-auto-allowed), [INV-AG-005](../invariants.md#inv-ag-005-taint-is-monotone-per-session)
- Core: [28 — Plugin principal and mandatory policy](../../core/behaviors/28-plugin-principal-and-mandatory-policy.md), [30 — Operation context annotations](../../core/behaviors/30-operation-context-annotations.md), [32 — Generic gate and plan](../../core/behaviors/32-generic-gate-and-plan.md)
- Command: [ADR-CM-005](../../command/decisions/005-taint-floor-in-dispatch.md)
- Companion: [`@bridger/mcp` client import](../../mcp/behaviors/03-client-import.md)
