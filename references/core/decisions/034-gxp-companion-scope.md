# ADR-BR-034: The @bridger/gxp companion scope and its limits

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ADR-034                                              |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.2 (2026-10-02): Consistency fixes from independent review (CCR-BR-002)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001) |

---

## Context

[ADR-BR-028](../decisions/028-gxp-scope.md) splits GxP support into process, core hooks and a companion. The core hooks are ports: an `AuditSink` that receives records, an `OperationGate` that can refuse, attribution that records what it is given. A regulated user still needs somewhere to put the records, a way to capture approvals and signatures, and qualification evidence. Those need storage, identity and cryptography that the core must not acquire ([ADR-BR-027](../decisions/027-core-exclusions.md)).

Qadi ADR-QD-056 placed the equivalent capability in an optional, separately versioned companion package that the core does not depend on, with every storage, identity and crypto capability a caller-supplied port, and with no shipped no-op signature service. Its own later revisions also recorded, in one place, the residual risk it did not close (no cryptographic tamper evidence). This ADR takes that shape and states the limits up front rather than discovering them later.

## Decision

`@bridger/gxp` is an optional companion package, specified separately under `references/gxp/`. It depends on `@bridger/core`; `@bridger/core` never depends on it. Its scope is:

- **Trail adapter contract.** A contract, with conformance tests, for an `AuditSink` implementation that writes records to the regulated user's own store and reports failure honestly. Durability is a property of that store and of the user's infrastructure; the companion defines what the adapter must do, and the user provides the storage.
- **Trail verification on read.** Use of `verifyAuditSequence` over stored records, with the limits stated in [ADR-BR-037](../decisions/037-audit-sequence-separate-from-event-seq.md).
- **Approval and electronic-signature capture** through the `OperationGate` seam ([ADR-BR-032](../decisions/032-operation-gate.md)), with signature capture itself a caller-supplied port. No default signature or approval implementation, not even a no-op.
- **Optional value fingerprinting** for configuration changes, if specified there ([ADR-BR-033](../decisions/033-no-config-values-in-audit.md)).
- **IQ/OQ evidence** generated from executed tests ([ADR-BR-035](../decisions/035-evidence-from-executed-tests.md)).

**Claims this library does not make.** Neither `@bridger/core` nor `@bridger/gxp` claims, and no Bridger document may state, that Bridger:

1. is compliant with 21 CFR Part 11, EU GMP Annex 11 or any other regulation — compliance is a property of the regulated user's system and procedures;
2. is validated or qualified — validation is the regulated user's activity on their system in its intended use; Bridger is to supply specifications and, once tests have been executed, test evidence for its components;
3. authenticates users, or binds an `Actor` to a person;
4. stores, retains, backs up or archives records durably — the core keeps no copy, and storage is the user's;
5. provides tamper evidence — `verifyAuditSequence` detects gaps, duplicates and out-of-order numbers; anyone able to rewrite the store can renumber it;
6. makes an electronic signature legally binding, or provides the signature controls of Part 11 Subpart C (§§11.100–11.300);
7. synchronises or verifies clocks;
8. verifies, signs or sandboxes plugin code — `meta.version` and `meta.digest` are labels it compares, not checks it performs;
9. isolates plugins from one another — realms change resolution only;
10. makes `Host.events` or `Host.changes` an audit trail — both are lossy by design;
11. undoes the external effects of a failed or replaced plugin;
12. provides an audit-trail review tool, or performance qualification (PQ) evidence for any user's system.

## Alternatives considered

- **Put these capabilities in core.** Rejected in [ADR-BR-028](../decisions/028-gxp-scope.md): deployment-specific storage, identity and crypto, and runtime dependencies beyond `effect`.
- **No companion; document the ports and stop.** Rejected: every regulated user would re-derive the adapter contract and its tests, and the evidence generation would be redone, inconsistently, per project.
- **Several companion packages** (one for trail, one for signatures). Rejected for now: the capabilities are designed to be used together around one host, as Qadi found for its audit pipeline; the split can be revisited if they diverge.
- **A shorter limits list in prose.** Rejected: a numbered list is something a reviewer can check documents and release notes against.

## Consequences

**Positive**:

- A regulated user gets an assembled path from core ports to their own store, approvals and evidence, without the core acquiring dependencies.
- The limits are explicit and enumerable, so over-claiming in documentation is checkable.

**Negative**:

- A second package to version and keep consistent with the core's record schema and gate contract.
- Much of what a regulated user needs remains theirs: storage, identity, clock synchronisation, review, retention, PQ.
- The companion does not exist yet; until it is specified and tested, none of its capabilities may be cited ([ADR-BR-036](../decisions/036-prospective-specification.md)).

**Trade-off accepted**: a companion that stops at ports, contracts and evidence, at the cost of leaving storage, identity and review with the user, rather than a package that would claim properties it cannot hold in every deployment.

## References

- Behaviours: [23 — Audit sink and record](../behaviors/23-audit-sink-and-record.md), [25 — Operation gate](../behaviors/25-operation-gate.md)
- Requirements: [URS-BR-026](../urs.md#urs-br-026-know-which-compliance-obligations-remain-mine)
- Risks: [RSK-BR-012](../gxp/03-risk-assessment.md#rsk-br-012), [RSK-BR-018](../gxp/03-risk-assessment.md#rsk-br-018)
- Decisions: [ADR-BR-027](../decisions/027-core-exclusions.md), [ADR-BR-028](../decisions/028-gxp-scope.md), [ADR-BR-032](../decisions/032-operation-gate.md), [ADR-BR-033](../decisions/033-no-config-values-in-audit.md), [ADR-BR-035](../decisions/035-evidence-from-executed-tests.md), [ADR-BR-036](../decisions/036-prospective-specification.md), [ADR-BR-037](../decisions/037-audit-sequence-separate-from-event-seq.md)
- GxP documents: [../gxp/01-regulatory-scope.md](../gxp/01-regulatory-scope.md), [../gxp/02-compliance-matrix.md](../gxp/02-compliance-matrix.md)
- Precedent: Qadi ADR-QD-056, *`@qadi/audit`: a companion package narrows ADR-QD-016* (precedent; cited by name).
- External: 21 CFR Part 11 Subpart C (§§11.100–11.300); EU GMP Annex 11 (2011) §7, §14, §17.
