# ADR-BR-027: Core exclusions

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ADR-027                                              |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.1 (2026-10-02): Initial draft (CCR-BR-001)                 |

---

## Context

A plugin runtime attracts features: a loader that fetches packages, a file watcher for hot reload, a UI integration, a sandbox. Each is reasonable in some application and wrong in another, and each one placed in the core enlarges the `Host` interface, adds a runtime dependency, and adds a promise the core must test. Some are also promises the core cannot keep: it cannot sandbox code that shares its process, and it cannot make a record durable without owning storage.

Naming what the core does not do is as much a part of the specification as naming what it does, because an omission that is not written down is read as an oversight to be filled, or worse, as a capability that is assumed.

## Decision

The core contains none of the following. Adapters and companions may add them without enlarging the `Host` interface.

**From SPEC.md:**

- No domain model, database, tenant or migration interface.
- No built-in FoldKit, React, HTTP, CLI or server integration.
- No filesystem watcher or hot-module-replacement policy.
- No automatic compensation for external emissions (sent messages, committed transactions); scope cleanup covers tracked resources only.
- No process or browser sandbox for untrusted code. Realms and interceptions change resolution only; they are not isolation boundaries ([ADR-BR-019](../decisions/019-realms-are-resolution-namespaces.md)).
- No loader: the core does not fetch, verify, version or sandbox plugin packages, does not manipulate the module cache, and cannot promise reclamation of imported code.

**Added for GxP use** (see [ADR-BR-028](../decisions/028-gxp-scope.md) and [ADR-BR-034](../decisions/034-gxp-companion-scope.md)):

- No storage of audit records. The core hands each record to the consumer's `AuditSink` and keeps no copy; retention, durability, backup, archival and review are outside it.
- No authentication or identity binding. The core records the `Actor` it is given and never establishes who that actor is.
- No electronic signatures and no approval workflow. The core consults an `OperationGate` when one is wired and has no implementation of its own.
- No tamper evidence. `verifyAuditSequence` detects gaps, duplicates and out-of-order numbers; it is not cryptographic protection.
- No clock synchronisation; the core reads the `Clock` it is given.
- No verification of plugin code. `meta.version` and `meta.digest` are opaque labels the core compares but does not compute.

## Alternatives considered

- **Batteries included.** Rejected: every bundled integration adds dependencies (against the rule that the core's runtime dependency is `effect` only) and couples core releases to frameworks the core does not otherwise need.
- **A sandbox in core.** Rejected: an in-process "sandbox" is not one, and claiming isolation that does not hold is worse than stating that none exists.
- **Audit storage and signatures in core.** Rejected: they require storage, identity and cryptography that differ per deployment and that the core has no competence to choose. The core provides the ports; a companion and the consumer provide the rest ([ADR-BR-028](../decisions/028-gxp-scope.md)).

## Consequences

**Positive**:

- The core stays small, depends on `effect` only, and makes no promise it cannot test.
- Every excluded capability has an obvious place to live (an adapter, a loader, the companion, the consumer's infrastructure) that does not require changing the core.

**Negative**:

- Applications must assemble loaders, integrations and storage themselves or adopt adapters, and those are not covered by the core's tests.
- A user who expects a plugin runtime to sandbox plugins, or an audit hook to store records, must read this list to learn otherwise.

**Trade-off accepted**: a core that does less and says so, at the cost of more assembly work for applications, rather than a core that bundles capabilities it cannot guarantee in every deployment.

## References

- Behaviours: [01 — Plugin definition](../behaviors/01-plugin-definition.md), [17 — Realms and interception](../behaviors/17-realms-and-interception.md), [23 — Audit sink and record](../behaviors/23-audit-sink-and-record.md)
- Invariants: [INV-BR-020](../invariants.md#inv-br-020-a-realm-changes-resolution-only)
- Requirements: [URS-BR-026](../urs.md#urs-br-026-know-which-compliance-obligations-remain-mine)
- Risks: [RSK-BR-013](../gxp/03-risk-assessment.md#rsk-br-013), [RSK-BR-017](../gxp/03-risk-assessment.md#rsk-br-017)
- Decisions: [ADR-BR-019](../decisions/019-realms-are-resolution-namespaces.md), [ADR-BR-028](../decisions/028-gxp-scope.md), [ADR-BR-034](../decisions/034-gxp-companion-scope.md)
- GxP documents: [../gxp/01-regulatory-scope.md](../gxp/01-regulatory-scope.md)
- Source: `docs/SPEC.md` — "Core exclusions", "Dynamic code loading"
