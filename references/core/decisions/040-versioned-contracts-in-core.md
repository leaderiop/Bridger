# ADR-BR-040: Contract versions and ranges are matched in core

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ADR-040                                              |
> | Revision       | 0.3                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed — amends ADR-BR-027 and ADR-BR-011                  |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.3 (2026-11-09): Decision gains the local contract, `Contract.local(Key, { version, members })`, declared by member names without codecs and never carried across a host; a rejected alternative recorded (requested by event-store CCR-ES-003 and sequence CCR-SQ-003) (CCR-BR-033)<br>0.2 (2026-11-08): `IncompatibleContract` is a cause a companion reports (a proxy provides nothing rather than failing its activation); a provision serves only peers at its major and at least its version, one provision per major (CCR-BR-022)<br>0.1 (2026-11-08): Initial draft (CCR-BR-017) |
---

## Context

[ADR-BR-011](../decisions/011-serviceid-is-key-identity.md) made `ServiceId` the identity of a service key, refused to bind two key objects with one identifier (`KeyMismatch`), and left breaking changes to a convention — a new identifier carrying the major (`example/Audit@2`) — because "a `Context.Service` carries no runtime schema of its methods". [ADR-BR-027](../decisions/027-core-exclusions.md) and BEH-BR-007 then said the core does not version: API-version checks belong to a distribution layer.

Three things have changed the balance:

- **Separately built plugins are the normal case.** A remote proxy, a lazily loaded plugin and a partner bundle each carry their own copy of a contract package. Under ADR-BR-011 two copies of one key never bind, even when one is 2.1 and the other 2.3 of the same add-only contract; the only remedy is deduplication, which is impossible across a process boundary and awkward across bundles.
- **Consumers need ranges.** An application that runs version N and N−1 of a plugin side by side, a manifest that declares `engines`, a federation peer with skew — all ask "does what is provided satisfy what is required?". If core does not answer it, every companion answers it differently, and none of them can refuse a `replace` that takes a method away from a running consumer, because only the host sees that call.
- **Effect Schema can describe a method.** The objection "it cannot describe Effect-returning methods" holds for arbitrary services, not for request/response methods whose payload, success and error are Schemas.

The question is how much of versioning moves into core without moving codecs, wire formats or negotiation policy with it, and without disturbing one provider per key per realm ([ADR-BR-003](../decisions/003-one-provider-per-key-per-realm.md)), one instance per id per realm ([ADR-BR-006](../decisions/006-one-instance-per-id-per-realm.md)) and `ServiceId` as key identity (ADR-BR-011).

## Decision

- **An opt-in contract key.** `Contract.make(Key, { version, methods })` returns a key with a `ContractVersion` and a description of its methods by core's own `MethodSpec` (payload, success, error Schemas; optional `stream`). Plain keys are unchanged ([26 — Versioned contracts](../behaviors/26-versioned-contracts.md), BEH-BR-225).
- **Local contracts (CCR-BR-033).** `Contract.local(Key, { version, members })` declares a contract whose members are named but carry no codecs, for a service whose members run in the caller's process — they take a transaction from the caller's environment or an effect as argument. Every in-process rule of this decision applies to it by member name; it has `local: true` on the value and on its descriptor, and no companion may serve, proxy or derive a wire artifact from it. Locality is fixed per major (BEH-BR-225).
- **`ServiceId` stays the identity; the major is part of it.** A contract's `ServiceId` must be `<name>@<major>`. Resolution, provider slots, cycles and snapshots are still keyed by `ServiceId`, so ADR-BR-003 holds unchanged: one provider per `<name>@<major>` per realm, and two majors are two keys that can be provided side by side. ADR-BR-006 is untouched: versions never create a second instance of a plugin ID.
- **Ranges inside one major.** Dependents require `contract.range(r)` (a bare contract means `^` its own version). The grammar is a restricted subset of semver — exact, caret, tilde — in which every range is one interval within the `ServiceId`'s major (BEH-BR-226).
- **Checked at registration, both directions.** `install`, `replace` and `enable` fail with `IncompatibleContract` when they would leave a registered dependent whose range its registered provider does not satisfy, or whose known methods the provider lacks (BEH-BR-228). The check reads declarations only — never code, never `load`.
- **Version checks replace the object check between contracts (amends ADR-BR-011).** Two contract references with one `ServiceId` are compared by version and method names, not by object; `KeyMismatch` still applies whenever either side is a plain key (BEH-BR-229). Optional contract dependencies treat an incompatible provider as absent.
- **Core matches; companions encode and negotiate (amends ADR-BR-027).** Core holds version identity, range matching and method-name comparison, and exports `Contract.parseOptions` (unknown fields ignored) for every companion codec. It does not decode payloads, diff schemas, negotiate, or depend on `effect/rpc`. Its negotiation seams are the descriptor, `satisfies`/`maxSatisfying`, `Contract.at` (provide a lower version of one major) and `IncompatibleContract` as a cause a companion reports. A provision is fixed at registration: a proxy serves it only while its peer serves a version of the same major at least as high, provides nothing otherwise, and follows a peer across majors with one provision per major (BEH-BR-232).

### Amendment to ADR-BR-027

ADR-BR-027's "No loader" bullet says the core does not "fetch, verify, version or sandbox plugin packages". From this decision on, that bullet reads: the core does not fetch, verify or sandbox plugin packages, does not resolve or select package versions, and does not verify that code carries the version it declares; it **does** match contract versions against declared ranges and `engines["@bridger/core"]` against its own version (ADR-BR-040, ADR-BR-041). A new exclusion is added: no codecs, wire formats or version-negotiation policy — those belong to companions. The exact text is in the integration notes of CCR-BR-017.

## Alternatives considered

- **Keep versions out of core (status quo).** Rejected: every companion would compare versions its own way, the host could not refuse a `replace` that removes a method from a running consumer, and separately built copies of one contract would never bind.
- **Use `RpcGroup` from `effect/rpc` as the method description.** Rejected for core: the module is marked unstable in Effect v4, and a contract is a type every author depends on. Companions derive an `RpcGroup` from a contract.
- **Version as data beside an unversioned `ServiceId`, with several majors in one slot.** Rejected: it would break ADR-BR-003 — one slot would hold two providers chosen by range — and every dependent's captured identity would become a policy decision.
- **Check compatibility at activation, as `KeyMismatch` is.** Rejected: the failure would land on whichever dependent next started, far from the `replace` that caused it, and would be sticky (ADR-BR-005) for a condition the operator could have been told about at the call.
- **Compare schemas structurally in core.** Rejected: deciding whether a schema change is additive needs AST rules about optionality, defaults and transformations that a companion should own and refine; core checks method names only.
- **Mark single members of a codec contract as local.** Rejected (CCR-BR-033): a service with one member that cannot cross a host cannot be served across one at all, and a proxy or client carrying the other members would present a partial service under the full contract's `ServiceId`. Locality belongs to the whole contract, per major.
- **Full semver ranges (unions, hyphen ranges, pre-releases).** Rejected: a range spanning two majors spans two `ServiceId`s, and pre-release ordering adds readings without adding safety.

## Consequences

**Positive**:

- Separately built plugins bind when their contracts are compatible, and fail at registration, with both plugins named, when they are not.
- A `replace` cannot remove, within a major, a method a registered consumer knows.
- Remote, federation and kit companions share one notion of version, one range grammar and one decoding rule.

**Negative**:

- A version is a declaration. A provider that declares 2.3 and behaves like something else passes every core check ([RSK-BR-025](../gxp/03-risk-assessment.md#rsk-br-025)); schema diffs and conformance tests are the companion's and the consumer's.
- Registration checks add install-order sensitivity: a provider must be upgraded before a dependent that needs the upgrade is installed.
- `requires` and `provides` accept two kinds of reference, which the facade of the [kit companion](../../kit/README.md) must keep readable.

**Trade-off accepted**: a small, declarative version check inside core, at the cost of amending ADR-BR-011 and ADR-BR-027, because only the host sees every registration and every `replace`, and versions compared anywhere else could not refuse them.

## References

- Behaviours: [26 — Versioned contracts](../behaviors/26-versioned-contracts.md), [27 — Manifest and lazy activation](../behaviors/27-manifest-and-lazy-activation.md), [01 — Plugin definition](../behaviors/01-plugin-definition.md), [03 — Installation](../behaviors/03-installation.md), [05 — Activation](../behaviors/05-activation.md)
- Invariants: [INV-BR-015](../invariants.md#inv-br-015-key-identity-is-checked-by-identifier-and-by-object), [INV-BR-031](../invariants.md#inv-br-031-a-registered-contract-requirement-is-satisfied-by-its-registered-provider)
- Requirements: [URS-BR-029](../urs.md#urs-br-029-evolve-a-service-contract-without-breaking-its-consumers)
- Risks: [RSK-BR-010](../gxp/03-risk-assessment.md#rsk-br-010), [RSK-BR-025](../gxp/03-risk-assessment.md#rsk-br-025)
- Decisions: [ADR-BR-003](../decisions/003-one-provider-per-key-per-realm.md), [ADR-BR-006](../decisions/006-one-instance-per-id-per-realm.md), [ADR-BR-011](../decisions/011-serviceid-is-key-identity.md) (amended), [ADR-BR-027](../decisions/027-core-exclusions.md) (amended), [ADR-BR-041](../decisions/041-manifest-as-data.md)
- Source: none in `docs/SPEC.md`; architecture review of 2026-11-08, gap item 1 and the version conflict of its §4
- External: Effect v4 `effect/rpc` (`Rpc`, `RpcGroup`), stability "unstable"; semver 2.0.0; npm `semver` caret and tilde ranges
