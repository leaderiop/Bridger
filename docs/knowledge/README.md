# Knowledge index: Bridger, Effect v4, Alchemy, and a plugin ERP

Research date: **2026-10-02**. Status: **research and API-design input**. No ERP implementation, package installation, cloud deployment, or runtime compatibility test was performed.

This index gathers documented features that are easy to overlook and maps them to the work needed for an extensible ERP. It is a broad, source-backed catalog, not an exhaustive enumeration of every API or proof of Odoo/Sage/SAP parity. Bridger remains a generic Effect plugin library; ERP contracts belong above it.

## Design deliverables

- [ERP core and public API](../ERP-SPEC.md): module boundaries, authoring contracts, transactions and lifecycle.
- [Complete Todo plugin](../ERP-TODO-WALKTHROUGH.md): model, migration, policy, generated FoldKit screen, server setup and hot installation.

- [Documentation index](../ERP-INDEX.md): reading order, package map and status.
- [ERP on the core](../ERP-RUNTIME.md) and [Records, model logic and platform data services](../ERP-RECORDS.md): shared module activations and tenant generations; constraints, hooks, relations, queries, seeds, services, sequences, settings, money, translations.
- Area specs: [storage](../ERP-STORAGE.md), [identity](../ERP-IDENTITY.md), [distribution](../ERP-DISTRIBUTION.md), [browser](../ERP-BROWSER.md), [business platform](../ERP-BUSINESS.md), [operations](../ERP-OPERATIONS.md), [developer experience](../ERP-DX.md).
- [Permissions and policies with `@qadi/core`](../ERP-ACCESS.md): permission tokens, role DAG, SQL-compiled row rules, error mapping and the proposed `@bridger/qadi` wrapper.
- [Bridger core](../SPEC.md), [React adapter](../REACT-API.md) (with [UI plugins](../REACT-UI-PLUGINS.md)) and [FoldKit adapter](../FOLDKIT-API.md): the generic runtime and its UI adapter proposals.
- [Shared models and database ownership](../ERP-MODELS.md): multiple plugins contributing to one table, typed projections, tenant-specific activation and migration rules.

- [Effect Schema integration](../ERP-SCHEMA-DESIGN.md): schema-first fields, database and transport variants, and patch semantics.
- [Effect Schema and Model source review](EFFECT-SCHEMA-MODEL.md): verified APIs and limits for shared-table plugins.

## Accepted technology policy

The user explicitly permits **all Effect v4 unstable features**. SQL, workflows, clustering, event logs, persistence, HTTP APIs, RPC, reactivity, schema tooling, and AI are eligible wherever they meet a requirement. We do not need to wait for stable status or ask for separate approval to use them. Maturity labels remain useful for pinning versions and reviewing API changes; they are not exclusion gates. Current import paths follow the selected release even where older examples used `/unstable/`.

## Start here

| Document | Indexed entries | What it answers |
| --- | --- | --- |
| [Effect v4](EFFECT-V4.md) | E01–E45: 45 | Which runtime, schema, persistence, workflow, integration and testing primitives can we reuse? |
| [Alchemy](ALCHEMY.md) | A01–A30: 30 | How can infrastructure, runtime bindings, deployment, code loading and operations support the system? |
| [ERP capabilities](ERP-CAPABILITIES.md) | R01–R32: 32 | Which platform and business contracts are needed, with Odoo, Sage Intacct and SAP evidence? |
| [FoldKit and Bridger](FOLDKIT-BRIDGER.md) | F01–F16: 16 | How do UI state, services, dynamic screens and cleanup connect safely? |
| [Architecture decisions](ARCHITECTURE.md) | B01–B18: 18 | Which boundaries and unresolved decisions should guide the next specifications? |
| [Odoo core source review](ODOO-CORE.md) | O01–O12: 12 | Which addon, ORM, policy and UI mechanisms inform our design? |
| [Machine-readable index](index.json) | 153 entries | Find entries by ID, topic, source, file or tag. |
| [Source register](sources.json) | External citation inventory | Find which entries and documents cite a source. |

Every catalog distinguishes documented behavior from our proposed use and its limitations. Architecture entries B01–B18 are design proposals, not existing library features. Catalog entries have stable IDs; the JSON index also records their Markdown line numbers and preserves all table fields.

## Version checkpoint

| Component | Observed repository state | Consequence |
| --- | --- | --- |
| Effect | Canonical `Effect-TS/effect` main reports 4.0.0. The older effect-smol repository is archived. | Use current v4 exports; do not combine v3 or beta signatures into one API design. [Source](https://raw.githubusercontent.com/Effect-TS/effect/main/packages/effect/package.json) |
| Alchemy | Main reports 2.0.0-beta.79. Its workspace permits Effect rc.118 or 4.0.0+, while overriding its own workspace to rc.118. | An allowed dependency range is not proof that every Alchemy example works unchanged with final Effect 4.0.0. [Package](https://raw.githubusercontent.com/alchemy-run/alchemy/main/packages/alchemy/package.json), [workspace](https://raw.githubusercontent.com/alchemy-run/alchemy/main/pnpm-workspace.yaml) |
| FoldKit | Main reports 0.165.0 and exact Effect / platform-browser peers 4.0.0. | Select one tested version tuple and keep browser plugin module identities compatible. [Source](https://raw.githubusercontent.com/foldkit/foldkit/main/packages/foldkit/package.json) |
| `@qadi/core` | npm reports 0.8.0 with a dependency on exactly `effect@4.0.0-rc.116`; sibling packages `@qadi/predicate-sql`, `@qadi/audit` and `@qadi/react` are 0.8.0. | Project policy: target the latest stable Effect 4.x everywhere (4.0.0 is published on npm; `@effect/*` packages are at 4.0.0). Third-party exact pins (qadi and awthaq rc.116, FoldKit 4.0.0, Alchemy rc.118) are tracked here but not designed around; the browser shell talks to the server only over HTTP. |
| awthaq (`/Users/mohammadalmechkor/Projects/Perso/effect-auth`) | Private, unpublished packages at 0.1.0, Effect pinned exactly at `4.0.0-rc.116`. | Authentication source for [ERP-IDENTITY.md](../ERP-IDENTITY.md); consumed by workspace or git link until published. |


These observations concern live source and documentation, not verified npm dist-tags or an immutable lockfile. Pin exact versions and archive commit/tag references when implementation begins. Current Effect exports use `effect/sql`, `effect/workflow`, `effect/http-api`, and related paths; module-level `@stability unstable` annotations still matter. Some Alchemy examples retain older `effect/unstable/*` imports. [Effect export map](https://raw.githubusercontent.com/Effect-TS/effect/main/packages/effect/package.json), [Alchemy Worker Loader example](https://alchemy.run/cloudflare/compute/worker-loader/).

## Findings with the largest design impact

- **Refreshable and keyed resources:** E06–E09 cover `LayerRef`, `LayerMap`, reference-counted resources and scoped caches. They are candidates for provider generations and tenant connectors, with different lifetime semantics.
- **Fair sharing and observable state:** E15–E16 cover `PartitionedSemaphore` and `SubscriptionRef`. They address runtime load sharing and the snapshot seam already proposed by both UI adapters.
- **Three different transaction mechanisms:** E13–E14 concern process-local atomic state; E29 concerns SQL transactions; E33–E36 concern durable workflows. They cannot be treated as one atomic boundary.
- **Metadata beyond validation:** E21–E24 cover codecs, schema-derived tooling, representations and experimental compilers. ERP field metadata, permissions and extension precedence still need their own contracts.
- **Runtime-loaded cloud code exists:** A28 covers Alchemy's Worker Loader. Its isolated Workers require a transport/capability adapter instead of sharing an in-process Effect Context. [Documentation](https://alchemy.run/cloudflare/compute/worker-loader/)
- **Native FoldKit deployment exists:** A30 covers Alchemy's `Cloudflare.Website.Foldkit`. It deploys the UI; our dynamic UI contribution and cleanup contracts remain separate. [Documentation](https://alchemy.run/cloudflare/frontend/foldkit/)
- **Graceful shutdown is not cloud eviction:** A21 covers platform finalizer limits. Durability cannot depend on an instance receiving a cleanup opportunity. [Runtime lifecycle](https://alchemy.run/infrastructure-as-effects/runtime/)
- **Full ERP behavior lives above the libraries:** R01–R32 identify domain and platform obligations. A schema, SQL transaction, workflow engine or resource scope does not independently establish correct accounting, tax, stock or authorization behavior.

## Retrieval paths by design question

| Question | Start with |
| --- | --- |
| How do we hot-install, replace and remove code safely? | E02–E09, E12, E16; A13–A17, A21, A28–A29; B03–B04, B12 |
| How do we support many tenants and companies? | E02, E07, E15, E18; A09–A11; R07–R09; B05–B06 |
| How do plugins extend business records and screens? | E21–E24, E30–E31; R01–R05; F07–F10; B07–B08, B12 |
| How do we post invoices without duplicates or partial events? | E25–E26, E29, E32–E36; R11–R15, R25; B09–B11 |
| How do approvals survive upgrades and outages? | E33–E37; A24; R06, R30–R31; B10, B15 |
| How do we serve APIs and integrate other systems? | E17–E20, E39–E41; A14, A22–A23; R25–R28 |
| How do we observe and test the system? | E43–E44; A19–A20, A27; F11–F12; R29–R31 |
| How do we deploy the FoldKit ERP shell? | A30; F01–F08, F13–F16; [adapter API proposal](../FOLDKIT-API.md) |
| What does Odoo/Sage/SAP-like breadth require? | R01–R32, especially the explicit follow-up domains and invariants at the end |

Search the Markdown from the repository root:

```sh
rg -n 'LayerRef|WorkerLoader|approval|ledger' knowledge/*.md
```

If `jq` is available, retrieve a machine-indexed entry or topic:

```sh
jq '.entries[] | select(.id == "E06")' knowledge/index.json
jq '.entries[] | select(.tags | index("tenancy")) | {id, title, file, line}' knowledge/index.json
```

The index stores source citations and proposed uses together without converting a proposal into a verified feature. Line pointers are valid for this research snapshot; stable IDs remain the reference after editing.

## How the research was gathered

The explicitly requested Context7 plugin was used for **`/alchemy-run/alchemy`**, **`/foldkit/foldkit`**, and **`/websites/effect_website_v4`**. We selected official repositories or version-specific official documentation and checked returned claims against first-party docs and source. Effect's initial connector error was resolved after connection; its follow-up query corroborated the resource-lifetime behavior of LayerRef, LayerMap and RcRef.

Context7 results are discovery evidence, not a version guarantee: Alchemy results included an older compatibility minimum and resolver metadata from its earlier API lineage; FoldKit results included a vendored Effect example. The catalog documents these discrepancies. Some vendor evidence came from official indexed excerpts when direct pages timed out. The source register is a citation inventory, not a claim that every URL was independently downloaded or link-tested.

## Coverage and remaining uncertainty

- Broad framework catalog: covered. Exhaustive API/provider enumeration: not claimed.
- Plugin ERP capability taxonomy: covered at design level. Complete workflows and acceptance fixtures for every domain: future specification work.
- Odoo evidence primarily targets 19.0, with marked SaaS exceptions; Sage evidence concerns Intacct; SAP evidence concerns S/4HANA Cloud Public Edition. These are reference product scopes, not claims about every vendor product or edition.
- Source versions and known API mismatches: recorded. Installation and runtime compatibility: untested.
- ERP invariants and boundaries: proposed. Country-specific accounting, tax, payroll and reporting requirements: require locale selection and domain validation.
- UI contribution teardown, durable module installation, migration recovery and cross-replica activation: identified, not implemented.
- CRM, commerce/POS, advanced warehouse operations, quality, maintenance and industry verticals need deeper process catalogs before claiming full feature coverage.

The next useful specification is the **ERP module contract above Bridger**: durable installation state, metadata extensions, permission declarations, migrations, domain events, workflow-version ownership, and UI contributions. [Architecture decisions](ARCHITECTURE.md) gives the starting checklist.
