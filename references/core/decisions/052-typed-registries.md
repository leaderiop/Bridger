# ADR-BR-052: Contribution registries may declare a contract

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ADR-052                                              |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed — amends ADR-BR-024                                 |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.1 (2026-11-08): Initial draft (CCR-BR-025)                 |

---

## Context

Several implementations of one contract are expressed as one provider of the contract's key, a `ContributionRegistry`, into which the implementations contribute ([31 — Hook points](../behaviors/31-hook-points.md), BEH-BR-307; [ADR-BR-003](./003-one-provider-per-key-per-realm.md)). Versioned contracts ([ADR-BR-040](./040-versioned-contracts-in-core.md)) check a provider's version against a dependent's range when the pair is registered. But a contribution to a registry is not a provider, so no version was ever compared there. A connector compiled against 2.0 could join a registry whose consumers call methods added in 2.3. The first sign would be a missing method at call time. The registry ([ADR-BR-024](./024-shared-state-helpers.md)) was specified not to interpret values, and it still must not.

## Decision

- `ContributionRegistry.make({ contract, range? })` declares the contract the registry's values implement and the range it accepts (default `^` plus the contract's version). The value type is the contract's shape.
- On such a registry every `add` declares `implements`: a version, or a version with method names. The pair (registry as dependent, contribution as provision) must pass the three conditions of BEH-BR-228. A refusal is `IncompatibleContract` with `dependentId` `"registry:<name>"`, and registers nothing. The check runs after the `AccessPolicy` and before the id is reserved.
- The check reads declarations only. It never inspects, calls or decodes the value.
- `registry.within(range)` gives a reader that treats out-of-range entries as absent, and `Selector.make(..., { range })` chooses only among them.
- A registry without a contract is unchanged.

## Alternatives considered

- **A registry-specific error.** Rejected: one error and one rule for "this provision does not satisfy that range" keeps diagnostics and tooling uniform.
- **One registry per major or per minor.** Rejected: consumers that accept different ranges would need different keys for one extension point. A per-call reader serves both from one registry.
- **Checking the value's shape at `add`.** Rejected: core does not decode or compare schemas ([ADR-BR-040](./040-versioned-contracts-in-core.md)); a declared version, compared, is the most core can offer, and it is said to be a declaration.
- **Leaving it to a companion.** Rejected: the registry is core's own multiplexing answer, and the check is the same function core already applies between plugins.

## Consequences

**Positive**:

- A version mismatch inside an extension point is refused at the `add` that creates it, naming both sides.
- Hook points built over a contract registry get the check with no rule of their own.

**Negative**:

- `add` gains an error (`IncompatibleContract`) on contract registries, and contributors must state `implements`.
- A declared version is still trusted on the author's word ([RSK-BR-025](../gxp/03-risk-assessment.md#rsk-br-025)).

**Trade-off accepted**: one more declaration per contribution, in exchange for the version guarantee that providers already have.

## References

- Behaviours: [26 — Versioned contracts](../behaviors/26-versioned-contracts.md), [19 — Contribution registry](../behaviors/19-contribution-registry.md), [31 — Hook points](../behaviors/31-hook-points.md)
- Invariants: [INV-BR-049](../invariants.md#inv-br-049-a-contract-checked-registry-holds-only-compatible-contributions), [INV-BR-031](../invariants.md#inv-br-031-a-registered-contract-requirement-is-satisfied-by-its-registered-provider)
- Requirements: [URS-BR-052](../urs.md#urs-br-052-rely-on-the-contract-version-of-every-implementation-in-an-extension-point), [URS-BR-029](../urs.md#urs-br-029-evolve-a-service-contract-without-breaking-its-consumers), [URS-BR-014](../urs.md#urs-br-014-contribute-to-a-shared-extension-point-safely)
- Risks: [RSK-BR-060](../gxp/03-risk-assessment.md#rsk-br-060), [RSK-BR-025](../gxp/03-risk-assessment.md#rsk-br-025)
- Decisions: [ADR-BR-003](./003-one-provider-per-key-per-realm.md), [ADR-BR-024](./024-shared-state-helpers.md), [ADR-BR-040](./040-versioned-contracts-in-core.md), [ADR-BR-046](./046-hook-points.md)
- Source: Bridger recheck of 2026-11-08, §4 item K3 and §8 item X3. No SPEC.md section.
