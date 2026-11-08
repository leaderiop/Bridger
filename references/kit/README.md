# Bridger Kit — Companion Specification

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-KT-00                                                |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Companion Specification — Master Index                       |
> | Change History | 0.2 (2026-11-08): Register row for CCR-KT-002 (CCR-KT-002)<br>0.1 (2026-11-08): Initial draft (CCR-KT-001)                 |

---

**implementation: absent**

This is the specification of `@bridger/kit`, the developer-experience
companion of `@bridger/core`. It gives the people who adopt Bridger a shorter
path than the raw core API:

- a `definePlugin` facade that writes the `Layer` for the author, checks the
  declared keys against what the code uses with readable type errors, and
  removes the casts that the prototype's tests needed
  ([appendix A](./appendices/a-cast-inventory.md));
- `PluginTest.mount` and `it.plugin`, a test harness on top of core's
  `TestHost`;
- conformance kits (`Conformance.verify`) generated from versioned contracts;
- a `bridger` command line: `create`, `dev`, `test`, `check`, `pack`,
  `publish`, `inspect`;
- a Promise SDK, generated from contract schemas, for partners whose code runs
  out of process behind the [remote companion](../remote/invariants.md) and
  who never learn Effect;
- a read-only devtools inspector (dependency graph, why a plugin is waiting,
  leases, timeline, `inspect --json`);
- an error catalog: every error tag of core and of the companions, with cause,
  example and fix.

Human-facing guides built on this specification live in
[docs/guides/](../../docs/guides/README.md).

## Status: prospective

Nothing described here is implemented. Every document is a `Draft`, every
decision is `Proposed`, and every source or test path is marked *Planned*. The
line `implementation: absent` above has the meaning it has in the
[core README](../core/README.md): while it says `absent`, no document here may
call itself Effective and no decision may call itself Accepted
([ADR-BR-036](../core/decisions/036-prospective-specification.md)).

This specification is not evidence that the package behaves as described. A
requirement becomes evidence only when a test that exercises it has run and
passed ([ADR-BR-035](../core/decisions/035-evidence-from-executed-tests.md)).
The one exception in kind, not in status, is [appendix A](./appendices/a-cast-inventory.md):
its counts were taken by compiling a scratch copy of the prototype with the
casts removed. That is evidence about the prototype's types, not about the kit.

## The honest-claims rule

The [core rule](../core/README.md#the-honest-claims-rule) applies unchanged.
In particular this package makes **no** claim that:

- a plugin written with the facade is correct because it type-checks — the
  type check covers the keys a build uses, not what a returned method reaches
  at call time ([BEH-BR-002](../core/behaviors/01-plugin-definition.md));
- a conformance pass proves that a provider honours its contract — it proves
  that the executed cases passed;
- the Promise SDK, the remote companion or any process boundary is a sandbox —
  isolation is the deployment's (gap report §7 rule 1;
  [ADR-BR-019](../core/decisions/019-realms-are-resolution-namespaces.md));
- `pack` and `publish` make a package trustworthy — signing and verification
  are the [loader companion's](../loader/behaviors/01-package-and-digest.md);
- the devtools timeline is an audit trail — it is built on `Host.events`, a
  lossy diagnostic feed ([BEH-BR-113](../core/behaviors/13-observability-and-diagnostics.md)).

## What stays in core, in other companions and in the application

- **Core** keeps every semantic: lifecycle, leases, legality, attribution,
  audit, gate. The kit adds none ([ADR-KT-001](./decisions/001-kit-is-sugar-and-tools-over-core.md)).
  It needs one small new core type, `Plugin.Any`
  ([ADR-KT-002](./decisions/002-plugin-any-is-the-contravariant-top.md)), and
  uses the seams listed in the [overview](./overview.md#core-seams-used).
- **Remote** owns transports, sessions, epochs and `Guest.serve`; the SDK runs
  behind it. **Loader** owns the package format, digests, signing and
  revocation; `pack` and `publish` call it.
- **The application** decides whether and how the inspector is exposed, which
  partners exist, and its own release process.

## Reading order

| Step | Document | Purpose |
| ---- | -------- | ------- |
| 1 | [Overview](./overview.md) | Mission, package boundary, public API surface, worked example |
| 2 | [Behaviours](./behaviors/01-plugin-facade.md) | What the package must do, as `BEH-KT` requirements |
| 3 | [Invariants](./invariants.md) | Properties that hold for every execution |
| 4 | [Decisions](./decisions/001-kit-is-sugar-and-tools-over-core.md) | Why, as `ADR-KT` records |
| 5 | [Appendix A — cast inventory](./appendices/a-cast-inventory.md) | The evidence behind the facade types |
| 6 | [Guides](../../docs/guides/README.md) | Persona guides (informative) |

## Contents

### Behaviours

| # | File | Identifiers |
| - | ---- | ----------- |
| 01 | [Plugin facade](./behaviors/01-plugin-facade.md) | BEH-KT-001–008 |
| 02 | [Plugin test harness](./behaviors/02-plugin-test.md) | BEH-KT-009–016 |
| 03 | [Conformance kits](./behaviors/03-conformance-kits.md) | BEH-KT-017–024 |
| 04 | [Command line](./behaviors/04-cli.md) | BEH-KT-025–032 |
| 05 | [Promise SDK](./behaviors/05-promise-sdk.md) | BEH-KT-033–040 |
| 06 | [Devtools inspector](./behaviors/06-devtools-inspector.md) | BEH-KT-041–048 |
| 07 | [Error catalog](./behaviors/07-error-catalog.md) | BEH-KT-049–056 |
| 08 | [Required acceptance checks](./behaviors/08-required-acceptance-checks.md) | BEH-KT-057–064 |

Each file owns a block of eight identifiers; unused numbers at the end of a
block are reserved, not gaps, as in core
([identifier scheme](../core/process/requirement-id-scheme.md) §3).

### Decisions

| ADR | Title |
| --- | ----- |
| [ADR-KT-001](./decisions/001-kit-is-sugar-and-tools-over-core.md) | The kit is sugar and tools over core, never a second runtime |
| [ADR-KT-002](./decisions/002-plugin-any-is-the-contravariant-top.md) | `Plugin.Any` is the contravariant top of plugin definitions, with a phantom brand |
| [ADR-KT-003](./decisions/003-conformance-suites-from-versioned-contracts.md) | Conformance suites are generated from versioned contracts and run cumulatively within a major |
| [ADR-KT-004](./decisions/004-promise-sdk-for-out-of-process-partners.md) | Partners get a generated Promise SDK that runs only out of process |
| [ADR-KT-005](./decisions/005-devtools-are-read-only.md) | Devtools are read-only views over core observation |

### Appendices (informative)

| Appendix | Purpose |
| -------- | ------- |
| [A — Cast inventory](./appendices/a-cast-inventory.md) | Every cast in the prototype's tests and `src/plugin.ts`, classified, with the facade type that removes it |

## Identifier scheme

| Prefix | Meaning |
| ------ | ------- |
| `BEH-KT-NNN` | Functional behaviour requirement (blocks of eight per file) |
| `INV-KT-NNN` | Runtime invariant |
| `ADR-KT-NNN` | Architecture decision |
| `REQ-KT-NNN` | Acceptance scenario (planned), defined in [08](./behaviors/08-required-acceptance-checks.md) |
| `CCR-KT-NNN` | Change control record |

Document IDs: `BRIDGER-KT-00` (this file), `BRIDGER-KT-OVW`, `BRIDGER-KT-INV`,
`BRIDGER-KT-BEH-NN`, `BRIDGER-KT-ADR-NNN`, `BRIDGER-KT-APP-A`. The rules of the
[core identifier scheme](../core/process/requirement-id-scheme.md) apply with
the infix `KT`; changes follow [core change control](../core/process/change-control.md).

## Document history

| CCR | Date | Change |
| --- | ---- | ------ |
| CCR-KT-001 | 2026-11-08 | Initial draft of the `@bridger/kit` companion specification (gap report item 17, roadmap step B7, risk "Effect learning curve"): plugin facade, test harness, conformance kits, command line, Promise SDK, devtools inspector, error catalog; cast inventory of the host-core prototype (appendix A); persona guides under `docs/guides/`.<br>**Impact (PROC-03 §3).** (1) Identifiers: BEH-KT-001–006, 009–014, 017–022, 025–031, 033–038, 041–046, 049–052, 057; INV-KT-001–007; ADR-KT-001–005; REQ-KT-001–024 added; nothing withdrawn. Core: one new type `Plugin.Any` requested as an amendment to BEH-BR-001, BEH-BR-017, BEH-BR-127 and BEH-BR-153 (registered by the integration CCR, not here). (2) Risk: two new core risks proposed (development reload reaching a controlled host; a facade or generated SDK that hides a contract mismatch), owned Core + Companion; no existing score changes. (3) GxP impact: no for the kit's own behaviour — every host mutation it causes goes through core's attributed, gated and audited operations (INV-KT-004); yes, indirectly, in that `bridger dev` must never attach to a host with a sink or gate wired (BEH-KT-026). (4) Revalidation: none; nothing is implemented or qualified. (5) Compatibility: `Plugin.Any` widens what `install` accepts only for branded definitions; no public type of core is narrowed. |
| CCR-KT-002 | 2026-11-08 | Resolutions of the agent review of 2026-11-08 (finding R5-13; R5-23 in `docs/guides/plugin-author-guide.md`), aligned with core CCR-BR-022: BEH-KT-052 and `docs/guides/error-catalog.md` gain `AgentStepLimit`, `SessionNotFound`, `StoreError`, `TaskNotFound`, `TaskNotResumable`, `TaskAwaitTimeout`, `TaintDraftStoreError`, `SubagentFailed`, `SubagentToolNotInParent`, `SubagentParentUnattributed`, `ReplayDiverged`, `JsonSchemaUnsupported`, `ImportedToolFailed`, `DefinitionUnresolved`, `PlanUnknown` and `ApprovalMismatch`, and the other companions' tags found missing (`CallbackDenied`, `MethodNotServed`, `NotAPluginDefinition`, `LoadLogFailed`, `CatalogEntryRejected`, `NoMatchingEntry`, `EntitlementConfigError`, `HistoryUnavailable`, `KeyedHashFailed`, `RebootstrapFailed`) (the agent, MCP and command ones now declared as `Schema.TaggedError` in their behaviour files, so BEH-KT-051 sees them); `PluginNotFound` replaced by core `UnknownPlugin`; no new core tag found in CCR-BR-022; `bridger dev` digests follow core's lazy and manifest digest rules (BEH-KT-026); the guide's `reconcile` snippet carries `DesiredPlugin.id`.<br>**Impact (PROC-03 §3).** (1) Identifiers: none added or withdrawn; BEH-KT-026 and BEH-KT-052 amended. (2) Risk: none changed. (3) GxP impact: none. (4) Revalidation: none (implementation absent). (5) Compatibility: catalog entries added only. |

---

_Next: [Overview](./overview.md)_
