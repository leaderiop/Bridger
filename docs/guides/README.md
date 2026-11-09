# Bridger guides

Status: **prospective — nothing described here is implemented.** These guides
describe the API specified in [references/core/](../../references/core/README.md)
and the developer-experience companion [references/kit/](../../references/kit/README.md).
Every snippet is marked `type-checked: not yet (implementation absent)`: it
follows the specified names, and no compiler has seen it. When code exists,
`bridger check` will compile every snippet marked `type-checked: yes`
([BEH-KT-028](../../references/kit/behaviors/04-cli.md#beh-kt-028-check-finds-a-second-copy-of-effect-and-breaking-contract-changes)).

The `docs/ERP-*` files are one example application built on Bridger, not
library documentation.

## Start here

| Guide | For | Time |
| ----- | --- | ---- |
| [Bridger in 5 minutes](./bridger-in-5-minutes.md) | everyone | 5 minutes |
| [Plugin author guide](./plugin-author-guide.md) | people writing in-process plugins with Effect | 30 minutes |
| [Partner SDK guide](./partner-sdk-guide.md) | partners implementing a contract, without Effect | 15 minutes |
| [Error catalog](./error-catalog.md) | anyone holding an error tag | lookup |
| [Partner publishing guide](../../references/kit/appendices/b-partner-publishing.md) | partners and publishers: pack, publish, countersign and what a host checks | 15 minutes |

## Persona map

| Persona | You are | Read | Then the specification |
| ------- | ------- | ---- | ---------------------- |
| **App author** | You assemble a product from plugins: build a host, install plugins, wire realms and configuration | [5 minutes](./bridger-in-5-minutes.md), the "Hosting" section of the [plugin author guide](./plugin-author-guide.md#hosting-plugins-in-an-application) | core [overview](../../references/core/overview.md), behaviours 02–13, 18 (reconcile) |
| **Plugin author** | You write first-party plugins that run in the host's process | [plugin author guide](./plugin-author-guide.md) | kit [01 — Plugin facade](../../references/kit/behaviors/01-plugin-facade.md), [02 — Test harness](../../references/kit/behaviors/02-plugin-test.md); core 01, 09, 14–20 |
| **Partner** | You implement a published contract for someone else's product; your code runs behind a transport, never in the host's runtime | [partner SDK guide](./partner-sdk-guide.md) | kit [05 — Promise SDK](../../references/kit/behaviors/05-promise-sdk.md), [03 — Conformance](../../references/kit/behaviors/03-conformance-kits.md); [remote companion](../../references/remote/invariants.md); partner UI: [REACT-UI-PLUGINS.md §3.7](../REACT-UI-PLUGINS.md) |
| **Operator** | You run hosts: watch state, find why a plugin waits, roll out changes | the "Inspecting a host" section of the [plugin author guide](./plugin-author-guide.md#inspecting-a-host), [error catalog](./error-catalog.md) | kit [06 — Devtools](../../references/kit/behaviors/06-devtools-inspector.md); core 13 (observability), 18 (reconcile) |
| **Regulated user** | You must show who changed the system, when, why, with what approval | the "Attribution and audit" section of the [plugin author guide](./plugin-author-guide.md#attribution-and-audit) | core [README — honest-claims rule](../../references/core/README.md#the-honest-claims-rule), behaviours 22–25, [GxP documents](../../references/core/gxp/01-regulatory-scope.md) |

## Three rules that shape everything

1. **The host knows nothing about your domain.** It installs, starts, stops
   and replaces plugins, and leases services to callers. Domain behaviour is
   in plugins.
2. **Third-party code is never evaluated in the host's runtime.** First-party
   plugins run in-process; partner code runs behind a transport and is
   reached through a proxy plugin. Where it runs — another process, a
   service, an isolate, or a worker thread of the host's own process — and
   what confines it are the deployment's choice; Bridger confines nothing. A realm is a naming scope, not a security boundary.
3. **Nothing here claims more than was tested.** Bridger supports a regulated
   user's controls with attribution, an audit port and an approval gate; it
   does not make a system compliant, and these guides never say otherwise.

Change log: 2026-11-08, round 2 — partner persona links the sandboxed partner UI section of REACT-UI-PLUGINS.md; partner publishing guide (kit appendix B) linked (CCR-BR-027).

Change log: 2026-11-09, independent review — rule 2 and the partner persona: partner code is never evaluated in the host's runtime, and where it runs is the deployment's choice, a worker thread of the host's process included (CCR-KT-004).
