# Apotheka on Bridger: decisions on the open risks

Status: **proposed decisions, 2026-11-11; nothing here is implemented or type-checked.** This document records one decision for each risk found while writing the code API report (`bridger-code-api`, section 12). It governs Apotheka only. It does not change `@bridger/core` or any companion spec; where a decision needs a spec amendment it names the document, and the amendment is made in the same change.

Facts about `@qadi/core` and awthaq come from their READMEs and from [ERP-ACCESS.md](ERP-ACCESS.md) and [ERP-IDENTITY.md](ERP-IDENTITY.md); the sibling repositories were not executed. Pharmacy domain rules (lists, registers, claims) come from the Apotheka UI prototype's catalogue, not from a legal source; every domain rule below must be confirmed by a pharmacist before implementation. This document makes no legal or compliance claim.

## 1. Decisions

| # | Risk | Decision | Recorded in |
| --- | --- | --- | --- |
| D1 | Only core has code; every companion and the ERP layer are Drafts | **Readiness gate.** Apotheka depends on a companion only when it has an implementation that passes its conformance suite (`Conformance.verify`, [kit](../references/kit/README.md)). Until then Apotheka owns a thin port for that concern and implements it on the ERP's storage. Build order: core, command, durable-bus with a PostgreSQL outbox, ERP storage and modules, Apotheka system modules, Morocco pack, audit-chain, then loader, remote, federation, entitlement, mcp and agent. | This document |
| D2 | The first guest adapter (`@bridger/worker`) runs in the host's own process, so it is not isolation ([remote README](../references/remote/README.md)) | **A guest that handles money, personal data or health data runs in a separate OS process or container, never in `@bridger/worker`.** Worker threads are allowed only for guests that hold no secret and see no personal data (for example a theme or data-pack evaluator). Wholesaler, card terminal, SMS and insurer connectors are all in the first group. | This document |
| D3 | Two command APIs: ERP `Command.contract` / `Command.implement` and `@bridger/command` `Command.make` / `Command.contribute`, with no written mapping | **The ERP form is the author API; the ERP compiles it to the command package.** See section 2. | [ERP-SPEC.md](ERP-SPEC.md) §8 |
| D4 | Two numbering mechanisms, and the UI numbers tickets per terminal | **Central allocation.** The pharmacy server allocates every number from one series per company with the ERP's `Sequence.define`; terminals never hold a series. The terminal and site appear in the printed header, not in the number. Revisit with `@bridger/sequence` only when Apotheka moves to local-first. | [ERP-RECORDS.md](ERP-RECORDS.md) §8 |
| D5 | Two CLIs and test kits: ERP-DX and `@bridger/kit` | **One CLI: the kit's.** ERP scaffolding becomes templates of `bridger create`. `ErpTest.layer` is built as a layer over `PluginTest` and stays the ERP's contract-test entry. | [ERP-DX.md](ERP-DX.md) status |
| D6 | Three ways to express a rule: model constraints, `Model.serve` hooks, core hook points | **Constraints** for invariants on one model's own data. **Core hook points** for rules other plugins add at the counter (dispensing, pricing, recalls). **qadi** for facts about the actor. A controlled-drug sale needs a hook and a qadi policy, kept separate. | This document |
| D7 | Module to plugin mapping thought to be unspecified | **Already specified, and it stands**: one plugin per dependency closure, id `erp.module/<moduleId>@<closureDigest12>`, requiring the runtime keys of its `dependsOn` closure ([ERP-RUNTIME.md](ERP-RUNTIME.md) §2). The command side is added by D3. | [ERP-RUNTIME.md](ERP-RUNTIME.md) |
| D8 | Two UI models: catalog-driven shell and React slots; FoldKit has no slots | **Apotheka's terminal shell is React.** Slots exist only there ([ERP-BROWSER.md](ERP-BROWSER.md) item 8). The first built-in slots are listed in section 3. Partner UI runs through `SandboxedSlot`. | This document |
| D9 | One Ed25519 signature versus N-of-M | **Already superseded by the loader's N-of-M policy** ([ERP-DISTRIBUTION.md](ERP-DISTRIBUTION.md) §4). Apotheka policies: first-party needs the publisher and a reviewer; partner needs the partner key plus an Apotheka countersignature. | [ERP-DISTRIBUTION.md](ERP-DISTRIBUTION.md) |
| D10 | The ERP docs describe only a Todo slice; no pharmacy module is designed | **Module boundaries fixed in section 4.** Each is a proposal to confirm with a pharmacist. | This document |
| D11 | `@bridger/gxp` is not validated and has no independent reviewer | **No compliance or validation claim in Apotheka material.** Use gxp as a set of controls only after it is implemented and independently reviewed. | This document |
| D12 | Keyring key distribution across hosts is not specified; backups keep a destroyed key | **Keys never leave the pharmacy server, and the hub never receives personal fields in clear.** The key store is backed up separately with its own, shorter retention than the data, so a shredded key leaves backups on a bounded schedule. The period is an operator setting. | This document |
| D13 | Effect version split: core prototype `4.0.0`, qadi 0.8.0 and awthaq `4.0.0-rc.116`, ERP docs target 4.1 | **One exact pin for the pharmacy server: the stable 4.x the ERP docs target.** Move core, qadi and awthaq to it, in their own repositories, before ERP step 4. Until then no workspace may resolve two copies of Effect (a package-manager override and `peerDependencies`). | [ERP-ACCESS.md](ERP-ACCESS.md) §9 |
| D14 | A cashier switches users many times an hour; awthaq has no PIN method | **A PIN method as an awthaq plugin (`@awthaq/pin`, proposed).** A PIN works only on an enrolled terminal (`device-authorization`), is rate limited and locks out, and gives a session that cannot refund or edit a register: those carry a re-authentication obligation (`@awthaq/qadi` `ObligationHandlers.reauth`) that needs the password or a second factor. A short idle lock replaces shared logins. | This document |
| D15 | The row-policy compiler is untested (three points in [ERP-ACCESS.md](ERP-ACCESS.md) §5) | **No module ships a row rule until the three points pass the differential suite.** Until then Apotheka uses operation gates, field policies and `Access.owner`, and any other row rule declares `rowFallback: "load-and-enforce"`, which is already specified. | [ERP-ACCESS.md](ERP-ACCESS.md) §5 |
| D16 | Two subject builders: `@awthaq/qadi` and `@bridger/qadi` | **Bridger's resolver replaces awthaq's `SubjectResolver` on every ERP route** ([ERP-IDENTITY.md](ERP-IDENTITY.md) §6). awthaq's own account routes keep its default. | [ERP-IDENTITY.md](ERP-IDENTITY.md) |

## 2. D3: how an ERP command becomes a `@bridger/command` command

| ERP author form | Compiled form |
| --- | --- |
| `Command.contract(id, { input, output })` | `Command.make(id, { input, output, ... })`. The module adds `tags` and sets `regulated` for commands that touch a register. |
| `Command.implement(contract, { permission, execute })` | `Command.contribute(command, handler)`, where the handler runs `execute(input)` inside the ERP's `CommandHandlerWrapper`, which supplies the transaction, request context and scoped `Records`. |
| `permission` | The command's `permission` option, enforced by the qadi-backed `CommandGate`; a refusal is `CommandRefused` and the gateway maps it to `Forbidden`. |
| A contract with no active implementation | `ModuleUnavailable`, as before. |
| Idempotency | The `Idempotency-Key` request header becomes the dispatch `idempotencyKey`; the receipt is committed with the handler's transaction (`CommandReceipts`). |

## 3. D8: first React slots in the Apotheka terminal

| Slot | Opened by | Typical filler |
| --- | --- | --- |
| `erp/record.actions` | Every record view (named in [ERP-BROWSER.md](ERP-BROWSER.md) §8) | Print, export |
| `sales/ticket.actions` | The ticket screen | Loyalty, gift card, delivery |
| `sales/ticket.line.badge` | One ticket line | Interaction and duplicate-therapy advice |
| `stock/lot.actions` | A lot row | Cold-chain history, return to wholesaler |

The last three are proposals. The slot list is part of each Apotheka module's public contract, so adding one is a minor version.

## 4. D10: Apotheka module boundaries (to confirm with a pharmacist)

| Module | Models | Commands | Events | Rules |
| --- | --- | --- | --- | --- |
| `stock` | `lot` (expiry, quantity, quarantined flag), `movement` | receive, adjust, quarantine | `LotQuarantined` | Quantity never negative (constraint) |
| `sales` | `ticket`, `ticket-line`, `session` | open, add-line, finalise | `TicketFinalised` | Owns the `sales/dispense` and `sales/price` hook points |
| `dispensing` | `prescription`, `prescription-line` | validate-line | `LineDispensed` | Veto on the `sales/dispense` point: needs a prescription, controlled list needs a register entry, lot not quarantined. Validation needs the pharmacist role. |
| `registers` | `narcotic-entry`, `prescription-entry` | append-entry | `EntryAppended` | Append-only: no update or delete command, and a constraint rejects both. Their audit entries are chained by `audit-chain`. |
| `pricing` | `ppv` (effective-dated) | publish-price-list | `PriceListPublished` | Veto on the `sales/price` point when a line is outside the effective price |
| `recalls` | `notice` | quarantine-by-notice | `RecallApplied` | A subscriber turns a feed into `stock` quarantine commands |
| `claims` | `claim`, `claim-batch` | submit-batch | `ClaimSubmitted` | A connector guest with granted egress only to the insurer |
| `fiscal` | `day-closure` | close-day | `DayClosed` | Gapless closure number from the company's series |

## 5. What remains open after these decisions

- Every decision above is a proposal. Only D7 and D9 restate what the specs already say.
- D13 needs work in two sibling repositories that I have not changed.
- D14's `@awthaq/pin` and the exact awthaq plugin API are not designed.
- Section 4 needs review by a pharmacist, and the Moroccan rules in it are unverified.
