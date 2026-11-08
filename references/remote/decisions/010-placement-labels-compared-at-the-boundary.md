# ADR-RM-010: Placement labels are compared at the process boundary, as strings

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-RM-ADR-010                                           |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.1 (2026-11-08): Initial draft — round 2: recheck item 20 (CCR-RM-003) |

---

## Context

A plugin manifest carries an opaque `residency` label, which core carries
and diffs but never enforces ([ADR-BR-041](../../core/decisions/041-manifest-as-data.md)).
Nothing checks it, so a plugin labelled for one place can be wired to a
transport that reaches another. Inside one process a check would compare a
label with nothing: the code runs where the host runs. At a process
boundary there is something to compare with — the transport's description
of where it leads.

## Decision

- Each transport, and each federation route, may declare the residency
  labels it offers (`TransportProfile.residency`). A `PlacementPolicy` port,
  default `PlacementPolicy.exact` (string membership), compares a required
  label with those labels ([BEH-RM-068](../behaviors/09-placement-budgets-and-adapters.md#beh-rm-068-transports-and-routes-declare-the-residency-labels-they-offer)).
- The comparison runs at `Remote.define` (a mismatch fails the link's build
  with `PlacementRefused`), before every session, and at each serving end on
  the label received as the `placement/residency` wire annotation
  ([BEH-RM-069](../behaviors/09-placement-budgets-and-adapters.md#beh-rm-069-the-residency-label-travels-as-a-wire-annotation-and-is-checked-by-the-serving-end)).
- Core compares nothing and gains no seam: the annotation key is this
  package's, declared with core's `Annotation.key`, and core's flows carry it
  to the call log and the audit trail.

## Alternatives considered

- **Enforce residency in core.** Rejected: core would compare a label with
  the host's own location, which it cannot know, and an in-process check
  suggests a boundary that does not exist (ADR-BR-019, ADR-BR-027).
- **Check only at install, in a gate.** Rejected as the only check: a
  transport is configuration and can change after install, and work that
  arrives at a serving end from another host never passed the local gate. A
  gate may still add the install check from `OperationRequest.definition.manifest`.
- **Structured labels (region, jurisdiction, provider).** Rejected for now:
  what a label means is the application's; a policy port lets an application
  compare structure without Bridger choosing one.

## Consequences

**Positive**: a mismatch between how a plugin is labelled and where its
transport leads is refused and recorded, at install and at every call.

**Negative**: the check is only as good as the labels; a wrong declaration
passes silently ([RSK-RM-014](../risks.md#rsk-rm-014)).

## References

- Behaviours: [09](../behaviors/09-placement-budgets-and-adapters.md)
- Invariant: [INV-RM-011](../invariants.md#inv-rm-011-no-call-crosses-a-transport-that-does-not-offer-its-residency-label)
- Core: [27 — Manifest and lazy activation](../../core/behaviors/27-manifest-and-lazy-activation.md), [30 — Operation context annotations](../../core/behaviors/30-operation-context-annotations.md)
