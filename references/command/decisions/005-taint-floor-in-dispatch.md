# ADR-CM-005: The taint floor is part of dispatch, not an interception

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-CM-ADR-005                                           |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.1 (2026-11-08): Initial draft (CCR-CM-002)                 |

---

## Context

`@bridger/agent` needs one rule to hold for every dispatch: a request whose
session has read untrusted text is never allowed on an automatic decision.
The first draft placed that rule in a `TaintGuard` plugin that installed a
mandatory interception on `CommandGate`. Core does not support that:
mandatory interceptions are given only by the code that builds the host, a
realm or an install (core BEH-BR-260), they wrap host captures only, and
`CommandGate` is read with `Effect.serviceOption` while a base layer is built,
which is not a capture (core BEH-BR-262). With no gate wired there was also
nothing to wrap, and this companion said "no gate means no gate" while the
agent companion said a tainted request "MUST be deferred" — a contradiction
that left the agent's invariant unbacked.

## Decision

- **The floor lives in dispatch.** Step 4 applies a fixed table after the
  effective gate: a request carrying a non-empty core `Annotation.Taint` set
  passes on `Allow` only when an effective gate exists and the request
  carries an `ApprovalRef` already bound to its digest and `inputDigest`;
  otherwise dispatch defers with a draft from the application's
  `CommandDraftSource`, or refuses with "tainted-session" when none is given
  (BEH-CM-016). The floor cannot be turned off.
- **Application policies are gate wrappers.** `CommandCatalog.layer` takes
  `gateWrappers`, applied in order over the `CommandGate` (or none) when the
  layer is built and fixed afterwards; no plugin can reach them (BEH-CM-011).
- **Approvals are bound to the input.** `ApprovalRef` carries `inputDigest`,
  checked by dispatch before any gate (BEH-CM-011).
- **Handlers are served calls.** Dispatch runs the handler inside core's
  `CallerContext.serve`, so nested dispatches carry the outer taint
  (BEH-CM-003).

## Alternatives considered

- **Keep the rule in the agent companion as a wrapper.** Rejected as the only
  mechanism: an application that forgets to wire it, or wires no gate,
  auto-allows tainted requests. The agent companion still supplies the draft
  source (`TaintGuard.drafts`).
- **A core seam applying `BridgerOptions.mandatory` to base-service reads.**
  Not available: core adds no such seam (CCR-BR-022); and an interception
  still cannot act when no gate is wired.
- **Refuse every tainted request outright.** Rejected: drafting from
  untrusted input is the useful case, and a person decides. It remains the
  behaviour when no draft source is wired.

## Consequences

**Positive**:

- One place, one table: every caller, nested or not, gate or no gate, meets
  the same rule (INV-CM-006).
- The rule reads only a core key, so the catalog still carries no product
  rule (ADR-CM-002).

**Negative**:

- The catalog now has one built-in behaviour beyond the default selector. It
  is generic, conservative and documented here.

**Trade-off accepted**: a small fixed rule in the dispatch path, in exchange
for an invariant that does not depend on configuration.

## References

- Behaviours: [02 — Dispatch](../behaviors/02-dispatch.md) (BEH-CM-003 in [01](../behaviors/01-command-definition.md), BEH-CM-011, BEH-CM-016)
- Invariants: [INV-CM-006](../invariants.md#inv-cm-006-a-tainted-dispatch-never-runs-on-an-automatic-allow)
- Core: [28 — Plugin principal and mandatory policy](../../core/behaviors/28-plugin-principal-and-mandatory-policy.md), [30 — Operation context annotations](../../core/behaviors/30-operation-context-annotations.md), [32 — Generic gate and plan](../../core/behaviors/32-generic-gate-and-plan.md)
- Companion: [`@bridger/agent` taint and provenance](../../agent/behaviors/03-taint-and-provenance.md)
- Source: agent review of 2026-11-08, findings R5-01 to R5-04.
