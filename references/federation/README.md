# Bridger Federation — Specification

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-FD-00                                                |
> | Revision       | 0.3                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification — Companion Master Index            |
> | Change History | 0.3 (2026-11-08): resolutions of the agent review of 2026-11-08; register row and open questions added (CCR-FD-002)<br>0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-FD-001)<br>0.1 (2026-11-08): Initial draft (CCR-FD-001)                 |

---

**implementation: absent**

This is the specification of `@bridger/federation`, a companion package of
`@bridger/core`. It lets many Bridger hosts — a cloud service, a shop hub, a
fleet of terminals — each converge on a desired state that an **authority**
issues for it, keep running on the last state it applied while offline, and
call each other's services across **links**, each peer resolved in its own
realm. It covers gap item 8 of the architecture review of 2026-11-08 and the
distributed-systems hazards named in its §9 (clock skew, split-brain on
exports, replay after long offline periods).

## Status: prospective

Nothing described here is implemented. Every document is a `Draft`, every
decision is `Proposed`, and every source or test path is marked *Planned*.
The rule of the core specification applies unchanged
([ADR-BR-036](../core/decisions/036-prospective-specification.md)): this
specification is not evidence that the package behaves as described. A
requirement becomes evidence only when a test that exercises it has run and
passed ([ADR-BR-035](../core/decisions/035-evidence-from-executed-tests.md)).

## The honest-claims rule

This companion inherits the core's honest-claims rule
([core README](../core/README.md#the-honest-claims-rule)). In particular:

- It makes **no** claim that a federation of hosts is secure, isolated or
  sandboxed. A peer realm is a resolution namespace, not a boundary
  ([BEH-BR-150](../core/behaviors/17-realms-and-interception.md)); code of a
  peer never runs in the local process — a peer's services are reached through
  remote proxy plugins, and the guarantees of the transport (authentication,
  confidentiality) are the transport's and the consumer's.
- It performs **no** cryptography. Manifest signatures are verified by the
  loader companion's `SignaturePolicy` port ([references/loader/](../loader/README.md)); this
  package only refuses a manifest that port did not accept.
- It keeps **no** storage of its own. The last applied manifest is kept
  through a `ManifestStore` port that the consumer implements; whether that
  copy survives a power loss or a disk replacement is the consumer's
  obligation.
- It provides **no** consensus and **no** automatic failover. Desired state
  comes from the authority alone; two hosts never elect an owner between
  themselves ([ADR-FD-002](./decisions/002-authority-is-the-only-source-of-desired-state.md)).

## Reading order

| Step | Document | Purpose |
| ---- | -------- | ------- |
| 1 | [Overview](./overview.md) | Mission, package boundary, public API surface, worked example |
| 2 | [Behaviours](./behaviors/01-host-manifest.md) | What the package must do, as `BEH-FD` requirements |
| 3 | [Invariants](./invariants.md) | Properties that hold for every execution |
| 4 | [Decisions](./decisions/001-federation-is-a-companion-over-reconcile.md) | Why, as `ADR-FD` records |
| 5 | [Traceability](./traceability.md) | BEH → INV → ADR → REQ |

The core specification is a prerequisite: [reconcile](../core/behaviors/18-reconciliation-and-confluence.md),
[realms](../core/behaviors/17-realms-and-interception.md),
[attributable operations](../core/behaviors/22-attributable-operations.md)
and the [operation gate](../core/behaviors/25-operation-gate.md) are used
here without restatement.

## Contents

### Behaviours

| # | File | Identifiers |
| - | ---- | ----------- |
| 01 | [Host manifest](./behaviors/01-host-manifest.md) | BEH-FD-001–008 |
| 02 | [Sync, offline and re-bootstrap](./behaviors/02-sync-offline-and-rebootstrap.md) | BEH-FD-009–016 |
| 03 | [Links and the skew handshake](./behaviors/03-links-and-skew-handshake.md) | BEH-FD-017–024 |
| 04 | [Exports and imports](./behaviors/04-exports-and-imports.md) | BEH-FD-025–032 |
| 05 | [Testing and acceptance](./behaviors/05-testing-and-acceptance.md) | BEH-FD-033–040 |

Each file owns a block of eight identifiers; unused numbers at the end of a
block are reserved, not gaps (core
[identifier scheme](../core/process/requirement-id-scheme.md) §3).

### Decisions

| ADR | Title |
| --- | ----- |
| [ADR-FD-001](./decisions/001-federation-is-a-companion-over-reconcile.md) | Federation is a companion layered on reconcile |
| [ADR-FD-002](./decisions/002-authority-is-the-only-source-of-desired-state.md) | The authority is the only source of desired state |
| [ADR-FD-003](./decisions/003-monotonic-manifest-revisions.md) | Manifest revisions are monotonic per host |
| [ADR-FD-004](./decisions/004-signatures-delegated-to-loader.md) | Signature verification is delegated to the loader companion |
| [ADR-FD-005](./decisions/005-peer-realms-and-remote-proxies.md) | Each peer in its own realm, imports as remote proxies |
| [ADR-FD-006](./decisions/006-n-minus-one-skew-window.md) | An N/N−1 skew window with the highest common version |
| [ADR-FD-007](./decisions/007-offline-cap-and-rebootstrap.md) | A cap on offline duration, and snapshot re-bootstrap |
| [ADR-FD-008](./decisions/008-fenced-single-owner-exports.md) | Fenced single-owner exports against split-brain |

## Open questions

Residuals this revision cannot settle alone. None needs a core behaviour
change; the first two are risk rows for the core risk assessment, where this
companion's risks are registered.

- **Deposed owner still acting.** A fence protects each importer, not the
  owner side; two owners can serve different importers until every importer
  has seen the higher token (BEH-FD-028, ADR-FD-008). Proposed core risk row:
  split-brain effects of a deposed owner, owner Consumer.
- **Offline boot depends on the loader cache.** After a restart, an entry the
  resolver cannot resolve locally is dropped, not run (BEH-FD-005). Proposed
  core risk row, owner Consumer + loader companion.
- **Peer realm ids and family ids.** Peer realm ids contain the peer and
  contract ids, which may contain "/"; family member ids are formed with "/"
  too (core gap G47).

## Identifier scheme

The core scheme applies with the infix **`FD`**.

| Prefix | Meaning | Defined in |
| ------ | ------- | ---------- |
| `BEH-FD-NNN` | Functional behaviour requirement | `behaviors/NN-*.md` headings |
| `INV-FD-NNN` | Runtime invariant | `invariants.md` headings |
| `ADR-FD-NNN` | Architecture decision | `decisions/NNN-*.md` |
| `REQ-FD-NNN` | Acceptance scenario (planned) | `traceability.md` §4 |
| `CCR-FD-NNN` | Change control record | this README, Document history |
| `BRIDGER-FD-*` | Document ID | Document Control headers |

User requirements and risks are not duplicated here: this companion's needs
and risks are registered in the core `urs.md` and `gxp/03-risk-assessment.md`
under the `BR` infix, so that one risk register covers the core and its
companions. Changes follow core
[change control](../core/process/change-control.md).

## Document history

| CCR | Date | Change |
| --- | ---- | ------ |
| CCR-FD-001 | 2026-11-08 | Initial draft of the federation companion: signed per-host desired-state manifests applied through core `reconcile` and `Desired.overlay`; last applied manifest kept through a consumer port for offline boot; kill switch as a manifest entry; offline cap and snapshot re-bootstrap; links with an N/N−1 skew handshake (`IncompatiblePeer`); exports and imports across links, each peer in its own realm, imports as remote proxies; fenced single-owner exports against split-brain; monotonic revisions. Impact assessment (PROC-03 §3): (1) adds BEH-FD-001–034, INV-FD-001–009, ADR-FD-001–008, REQ-FD-001–024; no core identifier changed by this CCR — the core URS, RSK, glossary and overview rows it needs are proposed to the core change that registers this companion. (2) Risk: introduces distributed-systems risks (stale or rolled-back desired state, split-brain on exports, skewed clocks, unverified manifests) to be registered in the core risk assessment. (3) GxP impact: yes — the package drives operator mutations through `reconcile`, which are attributed, gated and audited by core; it does not change core's audit record or gate. (4) Revalidation: none (nothing qualified exists). (5) Compatibility: new package; no core public type changes. |
| CCR-FD-002 | 2026-11-08 | Resolutions of the agent review of 2026-11-08 (report R3), findings R3-01 (federation part), R3-02, R3-03, R3-18, R3-19, R3-20, R3-21, R3-22, R3-23, R3-24, R3-25, R3-26, and R3-33 (citation side): links rebuilt on the remote companion's `Transport`, endpoint multiplexer (BEH-RM-056) and host-side serving end `Remote.serve` (BEH-RM-039), with this package's own control endpoint for offers, `LinkListener` and acceptance of listed peers only, `PeerLinkStatus` with string identifiers, fences bound to the link and enforced by closing superseded endpoints, no cross-host `TokenAuthority` needed; one import proxy per (peer, contract, major), accepted or refused by the offer, never a major chosen (core BEH-BR-232); method restriction and unavailable providers through `Remote.serve` refusals instead of `Grant.of`; one immutable peer realm per import, retired when empty, no realm family; transient reconcile rejections and pending kills retried at each sync and reported; re-bootstrap suspends links; symmetric protocol window in the offer, `protocolWindow` and `contractWindow`; wording of waiting proxies; resolver cache dependency stated and resolved definitions kept; offline cap from a stored first activation; fence limits stated; event delivery positions cited through `HistorySource` (BEH-DB-047). Impact assessment (PROC-03 §3): (1) adds REQ-FD-025–031; changes the manifest fields `window` (split) and `ManifestImport.range` (now `version`); renames `LinkStatus` to `PeerLinkStatus`; adds `LinkListener`, `ControlFrame`, `FederationOptions.contracts` and `listener`, `ManifestStore` first-activation and fence methods; headings of BEH-FD-020 and BEH-FD-022 changed; no identifier withdrawn. (2) Risk: two risk rows proposed for the core register (Open questions). (3) GxP impact: yes — peer realms are now retired with the attributed `retireRealm`, and transient retries add attributed reconciles under the federation actor; no core record, gate or legality cell changed. (4) Revalidation: none (nothing qualified exists). (5) Compatibility: manifest format `bridger.host-manifest/1` changed within a Draft; no core change. |
