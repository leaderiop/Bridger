# Bridger Loader — Specification

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-LD-00                                                |
> | Revision       | 0.3                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification — Master Index (companion)          |
> | Change History | 0.3 (2026-11-08): Register row CCR-LD-002 (resolutions of the agent review of 2026-11-08); Open questions section; dependencies on core updated (CCR-LD-002)<br>0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-LD-001)<br>0.1 (2026-11-08): Initial draft (CCR-LD-001)                 |

---

**implementation: absent**

This is the specification of `@bridger/loader`, an optional companion package
of `@bridger/core`. It fetches plugin packages, checks their digest, their
signatures and their revocation status **before** any of their code is
evaluated, evaluates exactly the bytes it checked, and fills the
`meta.version` and `meta.digest` labels that core carries but never computes
([ADR-BR-027](../core/decisions/027-core-exclusions.md)). It feeds revocations
into the desired state so that `reconcile` removes revoked digests — a kill
switch per digest — and publishes a catalog of signed manifests that can be
read without loading code. It depends on `@bridger/core`; `@bridger/core`
never depends on it.

## Status: prospective

Nothing described here is implemented. Every document is a `Draft`, every
decision is `Proposed`, and every source or test path is marked *Planned*.
The rules of the core specification apply unchanged
([ADR-BR-036](../core/decisions/036-prospective-specification.md),
[ADR-BR-035](../core/decisions/035-evidence-from-executed-tests.md)): this
specification is not evidence that the package behaves as described.

## The honest-claims rule

The loader is specified to **refuse to evaluate** packages whose digest,
signatures or revocation status do not satisfy the application's rules. It
makes **no** claim that loaded code is safe, that plugins are isolated from
one another or from the host, that removed code is reclaimed from memory, or
that adopting it makes a deployment compliant with any regulation. Three
limits recur in every document because they are the easiest to lose:

1. **Verification is provenance, not containment.** Code evaluated in the
   host's process has the host's authority and can defeat any in-process
   check ([BEH-LD-041](./behaviors/06-limits-and-acceptance.md#beh-ld-041-verification-establishes-provenance-not-containment)).
2. **No reclamation.** Replacing, removing or revoking a plugin leaves its
   module in memory until the process restarts; the loader reports which
   revoked code is still resident
   ([BEH-LD-042](./behaviors/06-limits-and-acceptance.md#beh-ld-042-no-reclamation-and-no-control-of-run-time-code-fetching)).
3. **In-process loading is for first-party code.** Code from anyone else is
   fetched and verified here and run out of process by `@bridger/remote`
   behind a proxy plugin ([ADR-LD-005](./decisions/005-in-process-loading-is-for-first-party-code.md)).

## Reading order

| Step | Document | Purpose |
| ---- | -------- | ------- |
| 1 | [Overview](./overview.md) | Mission, package boundary, public API surface, worked example, limits |
| 2 | [Behaviours](./behaviors/01-package-and-digest.md) | What the package must do, as `BEH-LD` requirements |
| 3 | [Invariants](./invariants.md) | Properties that hold for every execution |
| 4 | [Decisions](./decisions/001-verify-before-evaluate.md) | Why, as `ADR-LD` records |
| 5 | [Traceability](./traceability.md) | BEH → INV → ADR → REQ, and risk notes |

Readers new to Bridger should first read core's
[01 — Plugin definition](../core/behaviors/01-plugin-definition.md),
[18 — Reconciliation and confluence](../core/behaviors/18-reconciliation-and-confluence.md)
and [25 — Operation gate](../core/behaviors/25-operation-gate.md).

## Contents

### Behaviours

| # | File | Identifiers |
| - | ---- | ----------- |
| 01 | [Package and digest](./behaviors/01-package-and-digest.md) | BEH-LD-001–008 |
| 02 | [Load pipeline](./behaviors/02-load-pipeline.md) | BEH-LD-009–016 |
| 03 | [Signature policy](./behaviors/03-signature-policy.md) | BEH-LD-017–024 |
| 04 | [Revocation and kill switch](./behaviors/04-revocation-and-kill-switch.md) | BEH-LD-025–032 |
| 05 | [Catalog and lazy loading](./behaviors/05-catalog-and-lazy-loading.md) | BEH-LD-033–040 |
| 06 | [Limits and acceptance](./behaviors/06-limits-and-acceptance.md) | BEH-LD-041–048 |

### Decisions

| ID | Title |
| -- | ----- |
| [ADR-LD-001](./decisions/001-verify-before-evaluate.md) | Verify before evaluate, and evaluate the verified bytes |
| [ADR-LD-002](./decisions/002-package-digest-commits-to-manifest-sbom-and-files.md) | The package digest commits to the manifest, the SBOM and the files |
| [ADR-LD-003](./decisions/003-n-of-m-signature-policy-with-no-default.md) | An N-of-M signature policy over verifier adapters, with no default |
| [ADR-LD-004](./decisions/004-revocation-acts-through-desired-state.md) | Revocation acts through desired state and reconcile |
| [ADR-LD-005](./decisions/005-in-process-loading-is-for-first-party-code.md) | In-process loading is for first-party code; other code is fetched for out-of-process guests |

## Dependencies on core

| Core document | What this package uses | Owner |
| ------------- | ---------------------- | ----- |
| [01 — Plugin definition](../core/behaviors/01-plugin-definition.md), [11 — Configuration](../core/behaviors/11-configuration.md) | Definitions accepted from a dynamic import (BEH-BR-008); `meta` opaque, `version` and `digest` compared, never verified by core (BEH-BR-104) | Core (existing) |
| [18 — Reconciliation and confluence](../core/behaviors/18-reconciliation-and-confluence.md) | `reconcile`, ownership scopes, "same definition" by version and digest (BEH-BR-154) | Core (existing) |
| [19 — Contribution registry](../core/behaviors/19-contribution-registry.md) | The catalog registry | Core (existing) |
| [02 — Host construction](../core/behaviors/02-host-construction.md) | `AcceptedDigests` and `RevocationSource` given to the host as a `Context` base (BEH-BR-012) | Core (existing) |
| [22 — Attributable operations](../core/behaviors/22-attributable-operations.md), [23 — Audit sink and record](../core/behaviors/23-audit-sink-and-record.md), [25 — Operation gate](../core/behaviors/25-operation-gate.md) | Kill-switch actors; `definition.digest` on records and on gate requests, installed digest for plugin-addressed operations (BEH-BR-219); system transitions never gated (BEH-BR-223) | Core (existing) |
| [26 — Versioned contracts](../core/behaviors/26-versioned-contracts.md) | Version range syntax for catalog resolution | CCR-BR-017 |
| [27 — Manifest and lazy activation](../core/behaviors/27-manifest-and-lazy-activation.md) | Manifest schema, `Plugin.lazy({ manifest, load, digest })` with the digest beside the manifest, loading in the build step, triggers, reconcile without evaluating code | CCR-BR-017, CCR-BR-022 |
| [32 — Generic gate and plan](../core/behaviors/32-generic-gate-and-plan.md) | `Gate<OperationRequest>`, `Gate.all` with a timeout per piece, `OperationGate.fromGate` for `LoaderGate` | CCR-BR-019, CCR-BR-022 |
| [references/remote/](../remote/README.md) | Running verified guest bundles out of process | CCR-RM-001 (Draft) |

No new core seam is needed for the behaviours specified here. Two questions
for core remain open (below).

## Open questions

Residual questions this package cannot settle within the current core; each is
for core's change control, not decided here.

1. **System starts of a revoked digest.** A gate piece can refuse every
   operator call that restarts a revoked digest, but core never gates a system
   transition (BEH-BR-223): a dependency's return, a lazy trigger of an
   installed registration or a background restart starts the code again.
   Only `disable` or `remove` makes the digest unusable. Already registered
   in core as gap G60 ([urs.md](../core/urs.md) §7).
2. **`buildTimeout` is not observable.** A lazy load runs under core's
   `buildTimeout` (BEH-BR-246), and the loader must fit its own step bounds
   inside it, but `Host.controls` reports `gateTimeout` and not
   `buildTimeout` (BEH-BR-212). The loader relies on a value the application
   states ([06](./behaviors/06-limits-and-acceptance.md), BEH-LD-046).

## Identifier scheme

| Prefix | Meaning |
| ------ | ------- |
| `BEH-LD-NNN` | Functional behaviour requirement (blocks of eight per file) |
| `INV-LD-NNN` | Runtime invariant |
| `ADR-LD-NNN` | Architecture decision |
| `REQ-LD-NNN` | Acceptance scenario (planned) |
| `CCR-LD-NNN` | Change control record of this package |
| `BRIDGER-LD-*` | Document ID |

The rules of the core [identifier scheme](../core/process/requirement-id-scheme.md)
apply, with infix `LD`. Risks are not given an `LD` series: hazards this
package introduces or reduces are carried in the core register
([traceability](./traceability.md) §3).

## Document history

| CCR | Date | Change |
| --- | ---- | ------ |
| CCR-LD-002 | 2026-11-08 | Resolutions of the agent review of 2026-11-08 (review R4, findings LD-B1, LD-M1–LD-M6, LD-m1–LD-m8): `Loader.lazy` builds with core's `Plugin.lazy({ manifest, load, digest })` and package manifests carry no `digest` (LD-B1); `LoaderGate` is a core `Gate<OperationRequest>` piece built before the host over a shared `AcceptedDigests` base service, with explicit exemptions for bootstrap and bundled plugins and a stated effect of replacing the loader (LD-M1); verified catalog entries count as accepted for lazy installs (LD-M2); `enable`, `retry`, `restart` and `reconfigure` of a revoked installed digest are refused, with the limit of ungated system transitions stated (LD-M3); direct loads stay outside transitions, lazy loads run in the build slot with the loader's timeouts inside `buildTimeout` (LD-M4); missing verification records fail closed and re-evaluation uses the acceptance time (LD-M5); the kill switch is the one reconciler of its scope, with the application's actor for desired-list changes and the revocation actor for removals only (LD-M6); double signing means two signer entries (LD-m1); Sigstore log evidence checked against a pinned log key (LD-m2); signers revoked by identity (LD-m3); blast-radius guard and threshold recommendation (LD-m4); evaluator option narrowed (LD-m5); `Loader.stampRemote` (LD-m6); `VerificationRecord` fields per step and refusal-record failures (LD-m7); un-revocation and store rollback stated (LD-m8). Open questions for core recorded above.<br>**Impact (PROC-03 §3).** (1) Identifiers: no identifier added or withdrawn; BEH-LD-001, 015, 016, 018–020, 025, 026, 028–032, 037–039, 043, 046, 048, INV-LD-003, INV-LD-005, ADR-LD-001, 003, 004 amended; the heading of BEH-LD-029 changed. (2) Risk: bears on RSK-BR-043 and RSK-BR-044 (controls strengthened; one control-introduced hazard, the revocation channel's blast radius, stated with its mitigation); no score changed by this record. (3) GxP impact: yes — attribution of kill-switch changes (21 CFR 11.10(e)) and the gate piece's decisions change. (4) Revalidation: nothing released (implementation absent); REQ-LD-005–007, 012, 013, 015, 016 updated. (5) Compatibility: draft API changes (`LoaderGate.check` replaced by `make`/`piece`; `KillSwitch.run` options; `filterDesired` signature; `VerificationRecord` fields); no core type changed. |
| CCR-LD-001 | 2026-11-08 | Initial draft: package of manifest, SBOM and files with a digest committing to three sub-digests; fixed pipeline fetch → digest → acceptance rule → revocation → predicates → evaluate from held bytes, with no bypass; `meta.version` and `meta.digest` stamped; `LoaderGate` gate piece; `LoadLog` port; N-of-M signature policy with roles (double signing), Ed25519 and Sigstore verifier adapters, no default rule; signed, monotonic revocation sets with explicit `maxAge`; kill switch as desired-state filter plus `reconcile`; catalog of signed manifests verified without code on a core `ContributionRegistry`; `Loader.lazy` over `Plugin.lazy`; `fetchVerified` for out-of-process guests; limits (no containment, no reclamation). BEH-LD-001–048, INV-LD-001–006, ADR-LD-001–005, REQ-LD-001–016.<br>**Impact (PROC-03 §3).** (1) Identifiers: all listed are new; no core identifier changed by this record (core edits are proposed separately to the core change control). (2) Risk: bears on RSK-BR-017 (primary control once adopted), RSK-BR-013, RSK-BR-014, RSK-BR-018; three new hazards proposed for the core register ([traceability](./traceability.md) §3); no score changed by this record. (3) GxP impact: yes — the package decides which code may run in a host whose changes are audited, and adds its own verification record. (4) Revalidation: nothing released or qualified (implementation absent); REQ-LD-001–016 are to cover it. (5) Compatibility: new package; no core public type, record field or `schemaVersion` changes. |

---

_Next: [Overview](./overview.md)_
