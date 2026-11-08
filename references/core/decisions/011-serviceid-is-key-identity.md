# ADR-BR-011: ServiceId is key identity and mismatched key objects fail

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ADR-011                                              |
> | Revision       | 0.3                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed — amended by ADR-BR-040 |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.3 (2026-11-08): The distribution-layer reference points to core behaviours 26 and 27 and the loader companion instead of ERP-DISTRIBUTION.md (CCR-BR-027)<br>0.2 (2026-11-08): Object check replaced by version and method-name checks between contract keys; the no-runtime-description premise holds for plain keys only (CCR-BR-017)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001) |
---

## Context

Plugins are often bundled separately and loaded dynamically. A plugin that requires `example/Audit` imports the `Audit` key from some copy of the package that defines it; the provider imported it from its own copy. Inside one bundle, Effect keys compare by object. Across bundles, two copies of the same key are two different objects with the same string identifier (`key.key`).

Matching by object alone would make separately bundled plugins never resolve each other: the dependent would wait forever with no error. Matching by string alone would make them resolve even when the two copies come from different, incompatible versions of the package, and the dependent would call methods on a service whose shape it does not know. Neither failure is visible at the call that caused it.

Shapes cannot be compared at runtime: types are erased and a `Context.Service` carries no runtime schema of its methods.

## Decision

- **Resolution is by `ServiceId`.** The host matches requirements to providers by `ServiceId`, the key's own string identifier (`key.key`). Snapshots, events, errors and audit records hold `ServiceId`s, never keys.
- **Identity is then checked by object.** If a plugin's `requires` key and the active provider's key share a `ServiceId` but are different key objects, the dependent's activation fails with phase `activation` and the cause `KeyMismatch { serviceId }`. Bridger does not guess that the shapes agree.
- **Shape changes are a naming convention, not a check.** The core cannot detect a changed service shape under an unchanged `ServiceId`. By convention a breaking change gets a new identifier carrying the major version (`example/Audit@2`). API-version checks at the manifest level belong to the distribution layer, not to the core: core reads only declared contract versions and manifests ([26 — Versioned contracts](../behaviors/26-versioned-contracts.md), [27 — Manifest and lazy activation](../behaviors/27-manifest-and-lazy-activation.md)); signing, registries and loading are the loader companion's ([references/loader/](../../loader/README.md)).
- **Contracts (amended by [ADR-BR-040](../decisions/040-versioned-contracts-in-core.md)).** For contract keys — keys that carry a version and a Schema description of their methods — the major is part of the `ServiceId` by rule, and two contract references with one `ServiceId` are compared by declared version range and method names instead of by object. The "no runtime description" premise above holds for plain keys only; plain keys keep every rule of this decision.

## Alternatives considered

- **Object identity only.** Rejected: separately bundled plugins would never resolve, and the symptom would be a silent `waiting`.
- **String identity only, trusting the shape.** Rejected: two incompatible copies would bind, and the failure would appear later as a wrong call inside a plugin, far from its cause ([RSK-BR-010](../gxp/03-risk-assessment.md#rsk-br-010)).
- **A structural check at runtime.** Rejected: there is no runtime description of a service's shape to compare.
- **Requiring every service to carry a Schema of its interface.** Rejected: heavy for every author, and it cannot describe Effect-returning methods.

## Consequences

**Positive**:

- Separately bundled plugins resolve each other through stable identifiers.
- Two copies of a key fail loudly at activation, with the `ServiceId` named, instead of either hanging or binding blindly.

**Negative**:

- Applications must deduplicate packages that define shared keys (for example as peer dependencies); a duplicated copy is a `KeyMismatch`, even when the two copies are identical.
- A shape change under an unchanged identifier still passes undetected; the convention and the distribution layer are the only defences.

**Trade-off accepted**: a strict failure for duplicated key packages, in exchange for never binding two key objects the host cannot prove are the same.

## References

- Behaviours: [01 — Plugin definition](../behaviors/01-plugin-definition.md), [05 — Activation](../behaviors/05-activation.md)
- Invariants: [INV-BR-015](../invariants.md#inv-br-015-key-identity-is-checked-by-identifier-and-by-object)
- Requirements: [URS-BR-020](../urs.md#urs-br-020-load-plugin-definitions-dynamically-while-running)
- Risks: [RSK-BR-010](../gxp/03-risk-assessment.md#rsk-br-010), [RSK-BR-017](../gxp/03-risk-assessment.md#rsk-br-017)
- Decisions: [ADR-BR-002](../decisions/002-plugin-build-is-a-layer.md), [ADR-BR-008](../decisions/008-error-taxonomy.md), [ADR-BR-040](../decisions/040-versioned-contracts-in-core.md)
- Source: `docs/SPEC.md` — "Plugin definition" (Key identity and versioning), "Dynamic code loading", "Host interface" (`ServiceId` paragraph)
