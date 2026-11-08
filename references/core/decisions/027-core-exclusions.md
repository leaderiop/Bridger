# ADR-BR-027: Core exclusions

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ADR-027                                              |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed — amended by ADR-BR-040, ADR-BR-041 and ADR-BR-042 |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.2 (2026-11-08): No-loader bullet amended for contract versions and lazy loading; codecs, wire formats, negotiation and enforcement of manifest labels excluded (CCR-BR-017); policy seams are not enforcement against hostile in-process code; no per-call tokens or call-log storage (CCR-BR-018); no tenant option, plugin-state persistence, gate or approval store (CCR-BR-019); pointers to the companions for out-of-process code, federation, the outbox-based bus, the loader, hash chaining, agent-facing use and developer tooling (CCR-BR-021)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001) |

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
  (The CLI, watcher and development reload are specified in the [kit companion](../../kit/README.md), which drives the host only through its public operations.)
- No automatic compensation for external emissions (sent messages, committed transactions); scope cleanup covers tracked resources only.
- No process or browser sandbox for untrusted code. Realms and interceptions change resolution only; they are not isolation boundaries ([ADR-BR-019](../decisions/019-realms-are-resolution-namespaces.md)). Running such code out of process behind a local proxy plugin is specified by the `@bridger/remote` companion ([ADR-RM-001](../../remote/decisions/001-remote-plugin-is-a-local-proxy.md)); the isolation of that process or isolate comes from the host mechanism and the consumer's deployment, never from Bridger ([ADR-RM-006](../../remote/decisions/006-isolation-comes-from-the-host.md)).
- No loader: the core does not fetch, verify or sandbox plugin packages, does not resolve or select package versions, does not manipulate the module cache, and cannot promise reclamation of imported code. It **does** match the versions that contract keys declare against the ranges dependents declare, and `engines["@bridger/core"]` against its own version ([ADR-BR-040](../decisions/040-versioned-contracts-in-core.md)); it does not verify that code carries the version or digest it declares. For a lazy plugin it runs the `load` Effect it is given and checks the result against the manifest ([ADR-BR-042](../decisions/042-lazy-activation.md)); obtaining and verifying the code is the loader's. A companion, `@bridger/loader` ([references/loader/](../../loader/README.md)), is specified to fetch and verify packages before evaluation and to fill `meta.version` and `meta.digest`; it cannot reclaim imported code either.

**Added for versioned contracts and manifests:**

- No codecs, wire formats or version negotiation. The core decodes no contract payload, compares no schemas and chooses no version among those a peer offers; it exports the descriptor, range matching and the decoding rule companions use ([ADR-BR-040](../decisions/040-versioned-contracts-in-core.md)).
- No enforcement of manifest labels. Requested capabilities, egress, residency, publisher and tier are carried and diffed, never enforced ([ADR-BR-041](../decisions/041-manifest-as-data.md)).

**Added for GxP use** (see [ADR-BR-028](../decisions/028-gxp-scope.md) and [ADR-BR-034](../decisions/034-gxp-companion-scope.md)):

- No storage of audit records. The core hands each record to the consumer's `AuditSink` and keeps no copy; retention, durability, backup, archival and review are outside it.
- No authentication or identity binding. The core records the `Actor` it is given and never establishes who that actor is.
- No electronic signatures and no approval workflow. The core consults an `OperationGate` when one is wired and has no implementation of its own.
- No tamper evidence. `verifyAuditSequence` detects gaps, duplicates and out-of-order numbers; it is not cryptographic protection. Hash chaining with external anchors is a companion concern (`@bridger/audit-chain`, [references/audit-chain/](../../audit-chain/README.md)), detection only, within non-claim 5 of ADR-BR-034.
- No clock synchronisation; the core reads the `Clock` it is given.
- No verification of plugin code. `meta.version` and `meta.digest` are opaque labels the core compares but does not compute. The loader companion is what fills and checks these labels; core still compares them only.

**Added with the policy seams** (CCR-BR-018):

- No enforcement against hostile in-process code. The plugin principal, mandatory interceptions, `allowChildren`, the `AccessPolicy` and capability grants are attribution and policy among trusted code in one process ([ADR-BR-043](./043-plugin-principal-and-mandatory-policy.md), [ADR-BR-044](./044-capability-policy-and-call-log-ports.md)).
- No per-call tokens, expiries, epochs or egress control; `CurrentCall` is the seam the remote companion uses ([references/remote/](../../remote/README.md)).
- No storage of call-log entries; no interpretation of taint or provenance annotations ([ADR-BR-045](./045-operation-context-annotations.md)).

**Added with hook points, gates, realm families and handoff** (CCR-BR-019):

- No tenant option and no data separation: realm families and ephemeral realms are realms ([ADR-BR-048](./048-realm-families-and-retirement.md)).
- No persistence of plugin state; handoff is in-memory between two activations ([ADR-BR-049](./049-state-handoff-on-replace.md)).
- No gate, hook rule or approval store implementation ([ADR-BR-046](./046-hook-points.md), [ADR-BR-047](./047-generic-gate-and-plan.md)).

**Added for agent-facing use** (companions `@bridger/command`, `@bridger/mcp`, `@bridger/agent`; CCR-BR-021):

- No command catalog, toolset, JSON Schema projection or tool protocol (MCP) in core; core provides the registry, generation, gate, hook-point and annotation seams they are built on ([references/command/](../../command/README.md), [references/mcp/](../../mcp/README.md)).
- No agent loop, model adapter, session or memory store in core ([references/agent/](../../agent/README.md)).
- No rule about which commands are regulated, who may run them or when an agent's draft needs a person; those are application rules expressed in a gate.

## Alternatives considered

- **Batteries included.** Rejected: every bundled integration adds dependencies (against the rule that the core's runtime dependency is `effect` only) and couples core releases to frameworks the core does not otherwise need.
- **A sandbox in core.** Rejected: an in-process "sandbox" is not one, and claiming isolation that does not hold is worse than stating that none exists.
- **Audit storage and signatures in core.** Rejected: they require storage, identity and cryptography that differ per deployment and that the core has no competence to choose. The core provides the ports; a companion and the consumer provide the rest ([ADR-BR-028](../decisions/028-gxp-scope.md)).

## Consequences

**Positive**:

- The core stays small, depends on `effect` only, and makes no promise it cannot test.
- Every excluded capability has an obvious place to live (an adapter, a loader, the companion, the consumer's infrastructure) that does not require changing the core.
- Federation of hosts and the outbox-based event bus are companion packages
  ([references/federation/](../../federation/README.md),
  [references/durable-bus/](../../durable-bus/README.md)); neither adds a host
  operation, a storage dependency or a sandbox claim to the core.

**Negative**:

- Applications must assemble loaders, integrations and storage themselves or adopt adapters, and those are not covered by the core's tests.
- A user who expects a plugin runtime to sandbox plugins, or an audit hook to store records, must read this list to learn otherwise.

**Trade-off accepted**: a core that does less and says so, at the cost of more assembly work for applications, rather than a core that bundles capabilities it cannot guarantee in every deployment.

## References

- Behaviours: [01 — Plugin definition](../behaviors/01-plugin-definition.md), [17 — Realms and interception](../behaviors/17-realms-and-interception.md), [23 — Audit sink and record](../behaviors/23-audit-sink-and-record.md)
- Invariants: [INV-BR-020](../invariants.md#inv-br-020-a-realm-changes-resolution-only)
- Requirements: [URS-BR-026](../urs.md#urs-br-026-know-which-compliance-obligations-remain-mine)
- Risks: [RSK-BR-013](../gxp/03-risk-assessment.md#rsk-br-013), [RSK-BR-017](../gxp/03-risk-assessment.md#rsk-br-017)
- Decisions: [ADR-BR-019](../decisions/019-realms-are-resolution-namespaces.md), [ADR-BR-028](../decisions/028-gxp-scope.md), [ADR-BR-034](../decisions/034-gxp-companion-scope.md), [ADR-BR-040](./040-versioned-contracts-in-core.md), [ADR-BR-041](./041-manifest-as-data.md), [ADR-BR-042](./042-lazy-activation.md), [ADR-BR-043](./043-plugin-principal-and-mandatory-policy.md), [ADR-BR-044](./044-capability-policy-and-call-log-ports.md), [ADR-BR-045](./045-operation-context-annotations.md), [ADR-BR-046](./046-hook-points.md), [ADR-BR-047](./047-generic-gate-and-plan.md), [ADR-BR-048](./048-realm-families-and-retirement.md), [ADR-BR-049](./049-state-handoff-on-replace.md)
- Companions: [remote](../../remote/README.md), [federation](../../federation/README.md), [durable-bus](../../durable-bus/README.md), [loader](../../loader/README.md), [audit-chain](../../audit-chain/README.md), [entitlement](../../entitlement/README.md), [command](../../command/README.md), [mcp](../../mcp/README.md), [agent](../../agent/README.md), [kit](../../kit/README.md)
- GxP documents: [../gxp/01-regulatory-scope.md](../gxp/01-regulatory-scope.md)
- Source: `docs/SPEC.md` — "Core exclusions", "Dynamic code loading"
