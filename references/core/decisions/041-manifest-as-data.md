# ADR-BR-041: A plugin manifest is data the core reads only for resolution

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ADR-041                                              |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.1 (2026-11-08): Initial draft (CCR-BR-017) |
---

## Context

A plugin's `meta` is opaque except for `version` and `digest` (BEH-BR-104). Everything else a plugin ecosystem needs to know before running a plugin — publisher, trust tier, requested capabilities and egress, residency, the core version it needs, what it contributes, its configuration schema — has no place, so each consumer invents one. The consumers that read it are many: the loader, a consent screen, a marketplace, an agent choosing tools, a gate, `reconcile`. If they read different records, they decide about different plugins.

Core needs only a few of those fields, and only for resolution. The others are labels whose meaning is an application's: what a "tier" is, what a residency class allows.

## Decision

- **One schema, defined in core.** `PluginManifest` (with `manifestVersion: 1`) is a core-exported Schema, so every party reads the same record ([27 — Manifest and lazy activation](../behaviors/27-manifest-and-lazy-activation.md), BEH-BR-241).
- **Core reads resolution fields only.** `id`, `version`, `digest`, `provides`, `requires`, `optional` (with contract versions and ranges, [ADR-BR-040](../decisions/040-versioned-contracts-in-core.md)), `engines["@bridger/core"]`, `activation` and `contributions`. All other fields are carried unchanged, including properties the schema does not name, and never interpreted.
- **A manifest must agree with its definition.** On an eager definition at registration; on a lazy one when it is loaded (BEH-BR-242, BEH-BR-246).
- **`engines["@bridger/core"]` is checked**, with `IncompatibleEngine`; other engines are ignored by core.
- **`consentDiff` is a pure function in core.** It classifies the difference between two manifests as widened, narrowed, relabelled or unclassified, and core never acts on it (BEH-BR-243). Anything it cannot classify counts towards `requiresConsent`.
- **Manifests reach the gate, not the record.** The gate request carries the presented manifest and, on `replace`, the previous one; audit records keep carrying version and digest only (BEH-BR-248).

## Alternatives considered

- **Manifest schema in a companion (`@bridger/manifest`) only.** Rejected: core needs the resolution fields for lazy registration and reconcile, and two schemas for one record would drift. Companions may add helpers (authoring, JSON Schema generation, signing) around the core schema.
- **Interpret tier, permissions and residency in core.** Rejected: those are policies of an application, and an in-process check of them would suggest isolation that does not exist ([ADR-BR-019](../decisions/019-realms-are-resolution-namespaces.md), [ADR-BR-027](../decisions/027-core-exclusions.md)).
- **Drop unknown properties on decode.** Rejected: a newer manifest read by an older core would lose fields silently, and `consentDiff` would not see them.
- **`consentDiff` in the application.** Rejected: it is the same pure computation for every consumer, and a gate, a marketplace and a reviewer must reach the same answer from the same two records.
- **Manifests in audit records.** Rejected: records would grow by an unbounded, application-shaped value; the companion that needs the manifest at a point in time can keep it under its own retention.

## Consequences

**Positive**:

- One declaration per plugin, readable without code, shared by loader, gate, reconcile and tooling.
- New labels need no core release.

**Negative**:

- Requested capabilities, egress and residency are labels to core; they constrain nothing unless a policy port ([29 — Capability Grants and Call Log](../behaviors/29-capability-grants-and-call-log.md), BEH-BR-273–275) or an out-of-process boundary ([remote companion](../../remote/README.md)) enforces them.
- A manifest can be honest about everything core checks and still misdescribe what the code does ([RSK-BR-027](../gxp/03-risk-assessment.md#rsk-br-027), [RSK-BR-026](../gxp/03-risk-assessment.md#rsk-br-026)).

**Trade-off accepted**: a core-owned schema that core mostly does not read, at the cost of a wider core surface, so that every party decides from the same record.

## References

- Behaviours: [27 — Manifest and lazy activation](../behaviors/27-manifest-and-lazy-activation.md), [11 — Configuration](../behaviors/11-configuration.md) (BEH-BR-104), [25 — Operation gate](../behaviors/25-operation-gate.md)
- Invariants: [INV-BR-034](../invariants.md#inv-br-034-comparing-and-checking-manifests-evaluates-no-plugin-code)
- Requirements: [URS-BR-030](../urs.md#urs-br-030-know-what-a-plugin-declares-before-running-its-code)
- Risks: [RSK-BR-026](../gxp/03-risk-assessment.md#rsk-br-026), [RSK-BR-027](../gxp/03-risk-assessment.md#rsk-br-027)
- Decisions: [ADR-BR-027](../decisions/027-core-exclusions.md), [ADR-BR-032](../decisions/032-operation-gate.md), [ADR-BR-040](../decisions/040-versioned-contracts-in-core.md), [ADR-BR-042](../decisions/042-lazy-activation.md)
- Source: none in `docs/SPEC.md`; architecture review of 2026-11-08, gap item 4
- Precedent: VS Code `package.json` contribution points and activation events; Grafana `plugin.json`
