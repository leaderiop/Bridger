# 26 — Versioned Contracts

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-BEH-26                                               |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.2 (2026-11-08): acceptance checks 59–61; BEH-BR-232 rewritten to match the remote companion (build opens no session; a provision serves only peers at its major and at least its version; one provision per major);  divergence from npm stated (CCR-BR-022)<br>0.1 (2026-11-08): Initial draft (CCR-BR-017)                 |

---

A plain service key says *which* service a plugin wants, never *which version
of it*. [ADR-BR-011](../decisions/011-serviceid-is-key-identity.md) accepted
that, because a `Context.Service` carries no runtime description of its
methods, and left breaking changes to a naming convention
([01 — Plugin Definition](./01-plugin-definition.md), BEH-BR-007). This file
adds an opt-in kind of key that does carry one: a **contract**, a service key
with a version and a description of its methods in Effect Schema. Between two
contracts the host can do what it cannot do between two plain keys — tell
whether the provider's version satisfies the range the dependent asked for,
and whether every method the dependent knows is still there.

The decision is [ADR-BR-040](../decisions/040-versioned-contracts-in-core.md),
which amends [ADR-BR-027](../decisions/027-core-exclusions.md) ("the core
does not version") and [ADR-BR-011](../decisions/011-serviceid-is-key-identity.md)
(object identity between two copies of one key). It has no SPEC.md source
section. This file owns BEH-BR-225–240 and uses BEH-BR-225–232; 233–240 are
reserved.

> **What core does and does not do with versions**
>
> Core holds **identity and range matching only**: the version a contract
> declares, the range a dependent requires, the comparison of the two, and the
> comparison of method *names*. Core does **not** decode or encode contract
> payloads, choose a wire format, negotiate a version with a peer, diff two
> schemas, check that an implementation behaves as its version says, resolve
> package versions, or verify that loaded code carries the version it
> declares. Codecs, wire formats and negotiation policy belong to companions:
> `@bridger/remote` ([`references/remote/`](../../remote/README.md)), `@bridger/federation`
> ([`references/federation/`](../../federation/README.md)) and `@bridger/kit` ([`references/kit/`](../../kit/README.md)), which
> build on the seams of BEH-BR-232. A contract version is a declaration by
> its author, compared by core and trusted by nobody else on core's word
> ([RSK-BR-025](../gxp/03-risk-assessment.md#rsk-br-025)).

Planned source: `packages/core/src/Contract.ts` *(Planned)*; the checks run
in `packages/core/src/Resolver.ts` *(Planned)*. The required acceptance checks
are 59–61 of BEH-BR-184 ([21 — Testing Host](./21-testing-host.md)).

## BEH-BR-225: A contract is a service key with a version and a method description

> **Invariant:** [INV-BR-031](../invariants.md#inv-br-031-a-registered-contract-requirement-is-satisfied-by-its-registered-provider)
> **See:** [ADR-BR-040](../decisions/040-versioned-contracts-in-core.md), [ADR-BR-011](../decisions/011-serviceid-is-key-identity.md)
> **Satisfies:** [URS-BR-029](../urs.md#urs-br-029-evolve-a-service-contract-without-breaking-its-consumers)
> **Risk:** [RSK-BR-010](../gxp/03-risk-assessment.md#rsk-br-010), [RSK-BR-025](../gxp/03-risk-assessment.md#rsk-br-025)

```ts
// illustrative — not type-checked
class AuditKey extends Context.Service<AuditKey, AuditShape>()("example/Audit@2") {}

const Audit = Contract.make(AuditKey, {
  version: "2.3.0",
  methods: {
    append: Contract.method({ payload: AppendRequest, success: AppendResult, error: AuditRejected }),
    query:  Contract.method({ payload: QueryRequest,  success: Schema.Array(Entry) }),
    tail:   Contract.method({ payload: Schema.Void,   success: Entry, stream: true })
  }
})

interface MethodSpec {
  readonly payload: Schema.Codec<any, any>
  readonly success: Schema.Codec<any, any>
  readonly error?: Schema.Codec<any, any>              // absent = never
  readonly stream?: boolean                            // true: the method returns a Stream of `success`
}

interface Contract<Self, Shape, M extends Record<string, MethodSpec>> extends Context.Key<Self, Shape> {
  readonly key: Context.Key<Self, Shape>               // the Key passed to Contract.make
  readonly name: string                                // "example/Audit"
  readonly version: ContractVersion                    // "2.3.0"
  readonly methods: M
  readonly descriptor: ContractDescriptor
  range(range: string): ContractRequirement<Self, Shape>        // BEH-BR-227
}

interface ContractDescriptor {                         // plain data; JSON-serialisable
  readonly serviceId: ServiceId                        // "example/Audit@2"
  readonly name: string
  readonly version: ContractVersion
  readonly methods: readonly string[]                  // method names, sorted by code unit
}
```

```
REQUIREMENT: `Contract.make(Key, { version, methods })` MUST return a
             `Contract` whose `ServiceId` is the `ServiceId` of `Key`. The
             `ServiceId` of a contract MUST have the form `<name>@<major>`,
             where `<major>` is the decimal major of `version`; `name` is the
             part before the last "@".
```

```
REQUIREMENT: The type of `Contract.make` MUST reject, as a compile error, a
             `Key` whose service shape is not the shape derived from
             `methods`: for each method, a function from the payload's
             decoded type to an `Effect` of the success type with the error
             type (or `never`), or to a `Stream` of them when `stream` is
             true.
```

```
REQUIREMENT: `Contract.make` and `Contract.method` MUST be pure: they MUST
             NOT perform effects, register the contract anywhere or throw.
             A contract whose `ServiceId` lacks the `@<major>` suffix, whose
             suffix differs from the major of `version`, whose `version`
             breaks the grammar of BEH-BR-226, or whose `methods` is empty,
             MUST be recorded as invalid on the value, and every `install`,
             `replace` or `enable` of a definition that names it MUST fail
             with `InvalidDefinition { id, reason }`, `reason` naming the
             contract's `ServiceId` and the rule broken.
```

```
REQUIREMENT: `descriptor` MUST be derived from the contract alone and MUST
             be plain data: the `ServiceId`, the name, the version and the
             sorted method names. It MUST NOT contain a schema, a key object
             or a function.
```

A contract changes nothing about how the host resolves services: resolution
is still by `ServiceId` ([01 — Plugin Definition](./01-plugin-definition.md),
BEH-BR-006), one provider per key per resolution scope
([ADR-BR-003](../decisions/003-one-provider-per-key-per-realm.md)). What it
adds is a runtime description the host can compare. The major in the
`ServiceId` is the convention of BEH-BR-007, made a rule for contracts: two
majors are two keys, so a host can carry a `@2` provider and a `@3` provider
side by side while consumers move across, without breaking the one-provider
rule.

**Settled here.** (1) The methods are described by core's own `MethodSpec`,
not by an `RpcGroup` from `effect/rpc`. That module is marked unstable in
Effect v4 ([ADR-BR-040](../decisions/040-versioned-contracts-in-core.md)),
and a contract is a core type every plugin author depends on; companions
derive an `RpcGroup` from a contract (BEH-BR-232). (2) An invalid contract
does not throw at import — a plugin entry has no import-time side effects
(BEH-BR-008) — and is refused at the first operation that would register it,
as any other definition error is (BEH-BR-018). (3) A contract describes
request/response and streaming methods only. A service with other members
(synchronous getters, `SubscriptionRef`s) stays a plain key.

## BEH-BR-226: Versions and ranges

> **See:** [ADR-BR-040](../decisions/040-versioned-contracts-in-core.md)
> **Satisfies:** [URS-BR-029](../urs.md#urs-br-029-evolve-a-service-contract-without-breaking-its-consumers)

```ts
// illustrative — not type-checked
type ContractVersion = string      // "MAJOR.MINOR.PATCH"
type ContractRange   = string      // "^2", "^2.3", "^2.3.1", "~2.3", "~2.3.1", "2.3.1"

declare const Contract: {
  satisfies(version: ContractVersion, range: ContractRange): boolean
  maxSatisfying(versions: readonly ContractVersion[], range: ContractRange): Option.Option<ContractVersion>
  // ...
}
```

| Form | Matches |
| --- | --- |
| `M.m.p` | exactly `M.m.p` |
| `^M`, `^M.m`, `^M.m.p` with M ≥ 1 | `>= M.m.p` and `< (M+1).0.0` (missing parts are 0) |
| `^0.m`, `^0.m.p` | `>= 0.m.p` and `< 0.(m+1).0` |
| `~M.m`, `~M.m.p` | `>= M.m.p` and `< M.(m+1).0` |

```
REQUIREMENT: A `ContractVersion` MUST be three non-negative decimal integers
             joined by "." with no leading zeros (other than "0" itself) and
             no pre-release or build suffix. A `ContractRange` MUST be one of
             the forms in the table above; versions MUST be ordered
             numerically part by part.
```

```
REQUIREMENT: `Contract.satisfies` and `Contract.maxSatisfying` MUST be pure
             and total: they MUST perform no I/O, read no host, clock or
             identifier service, and MUST return `false` (or `None`) for a
             version or range outside the grammar rather than fail.
             `maxSatisfying` MUST return the highest version that satisfies
             the range.
```

```
REQUIREMENT: Every range a definition or manifest declares for a contract
             MUST lie within the major of that contract's `ServiceId`: the
             lowest version it matches MUST have that major, and so MUST
             every version it matches. A range outside the grammar, or that
             crosses or leaves the major, MUST make `install`, `replace` and
             `enable` fail with `InvalidDefinition`.
```

The grammar is a subset of npm's semver ranges in which every range
denotes one interval inside one major — including npm's reading of `^0.m`,
where the minor is the unit of compatibility — so that a range never spans
two `ServiceId`s and every comparison has one obvious answer. It departs from
npm in one form, deliberately: `^0.0.p` matches `>= 0.0.p` and `< 0.1.0`
here, where npm matches only `0.0.p` (`< 0.0.(p+1)`); a contract at `0.0.x`
treats the minor, not the patch, as its unit of compatibility, like every
other `0.m` contract. A companion mapping npm ranges onto these forms MUST
map npm's `^0.0.p` to the exact form `0.0.p`. Anything wider
(unions, hyphen ranges, pre-releases) is a distribution concern, for the
loader and federation companions to map onto these forms.

**Settled here.** Pre-release versions are excluded rather than given
semver's special ordering: a contract the host compares must have one
version, and a pre-release of a contract is better served by its own
`ServiceId` or by a plain key until it is released.

## BEH-BR-227: Contract references in requires, provides and optional

> **Invariant:** [INV-BR-031](../invariants.md#inv-br-031-a-registered-contract-requirement-is-satisfied-by-its-registered-provider)
> **See:** [ADR-BR-040](../decisions/040-versioned-contracts-in-core.md), [ADR-BR-002](../decisions/002-plugin-build-is-a-layer.md)
> **Satisfies:** [URS-BR-029](../urs.md#urs-br-029-evolve-a-service-contract-without-breaking-its-consumers)

```ts
// illustrative — not type-checked
interface ContractRequirement<Self, Shape> extends Context.Key<Self, Shape> {
  readonly contract: Contract<Self, Shape, any>
  readonly range: ContractRange
}
interface ContractProvision<Self, Shape> extends Context.Key<Self, Shape> {
  readonly contract: Contract<Self, Shape, any>
  readonly version: ContractVersion                    // <= contract.version, same major
  readonly methods: readonly string[]                  // subset of the contract's method names
}

declare const Contract: {
  at<Self, Shape>(contract: Contract<Self, Shape, any>, version: ContractVersion,
                  options: { readonly methods: readonly string[] }): ContractProvision<Self, Shape>
  // ...
}

const Writer = Plugin.define({
  id: "audit-writer",
  requires: [Audit.range("^2.1")],   // or [Audit], read as Audit.range("^2.3.0")
  provides: [Report],
  build: /* ... */
})
```

```
REQUIREMENT: `requires`, `provides` and `optional` MUST accept, beside plain
             keys, contract references: a `Contract`, a
             `ContractRequirement` (from `contract.range(r)`), and in
             `provides` only a `ContractProvision` (from `Contract.at`).
             `IdentifiersOf` MUST yield the same identifier for a contract
             reference as for the contract's `Key`, so the compile-time
             bound of BEH-BR-002 is unchanged.
```

```
REQUIREMENT: A bare `Contract` in `requires` or `optional` MUST be read as
             `contract.range("^" + contract.version)`. A bare `Contract` in
             `provides` MUST be read as a provision of `contract.version`
             with all of its methods. A `ContractRequirement` in `provides`,
             or a `ContractProvision` in `requires` or `optional`, MUST make
             `install` fail with `InvalidDefinition`.
```

```
REQUIREMENT: `Contract.at(contract, version, { methods })` MUST be accepted
             only when `version` has the contract's major, is not above
             `contract.version`, and `methods` is a non-empty subset of the
             contract's method names; otherwise the definition MUST fail
             with `InvalidDefinition` at `install`, `replace` or `enable`.
```

```
REQUIREMENT: Base services that implement contracts MUST be declared in
             `BridgerOptions.baseContracts: readonly (Contract |
             ContractProvision)[]` (default empty). Construction MUST fail
             with a defect naming `baseContracts` when an entry is invalid
             (BEH-BR-225) or names a `ServiceId` the base does not provide,
             as for any other option outside its domain (02 — Host
             Construction, BEH-BR-011).
```

A bare contract in `requires` asks for the version the dependent was compiled
against or a later one of the same major, which is what an author who has
not thought about ranges means. An explicit lower range — `Audit.range("^2.1")`
in a plugin compiled against 2.3 — is a promise by the author to call only
what 2.1 offered; core cannot see calls, so it cannot hold the author to it
(BEH-BR-230).

`Contract.at` is the hook for a provider that implements less than the copy
of the contract it was compiled against: a proxy whose remote side speaks 2.1
([`references/remote/`](../../remote/README.md)), or an adapter. It may claim less, never more.

## BEH-BR-228: Compatibility is checked when a pair is registered

> **Invariant:** [INV-BR-031](../invariants.md#inv-br-031-a-registered-contract-requirement-is-satisfied-by-its-registered-provider), [INV-BR-012](../invariants.md#inv-br-012-a-definition-error-registers-nothing)
> **See:** [ADR-BR-040](../decisions/040-versioned-contracts-in-core.md), [ADR-BR-003](../decisions/003-one-provider-per-key-per-realm.md)
> **Satisfies:** [URS-BR-029](../urs.md#urs-br-029-evolve-a-service-contract-without-breaking-its-consumers)
> **Risk:** [RSK-BR-010](../gxp/03-risk-assessment.md#rsk-br-010), [RSK-BR-025](../gxp/03-risk-assessment.md#rsk-br-025)

```ts
// illustrative — not type-checked
class IncompatibleContract extends Schema.TaggedError<IncompatibleContract>()("IncompatibleContract", {
  serviceId: Schema.String,
  dependentId: Schema.String,                     // plugin ID of the requiring side
  providerId: Schema.String,                      // plugin ID, or "base"
  required: Schema.String,                        // the dependent's range
  provided: Schema.optional(Schema.String),       // the provision's version; absent when the provider declares no contract
  missingMethods: Schema.Array(Schema.String)     // sorted; empty unless only method names failed
}) {}

type InstallError = DuplicatePlugin | DuplicateProvider | DependencyCycle | InvalidDefinition | UnknownRealm
                  | IncompatibleContract | IncompatibleEngine          // IncompatibleEngine: 27, BEH-BR-242
```

A *registered pair* is a registered, non-`disabled` plugin D whose `requires`
holds a contract reference for `ServiceId` S, and the provider P of S in D's
resolution scope under `scopeOf` — a registered, non-`disabled` plugin, or the
base. The pair is *compatible* when:

1. P declares a provision for S (a contract reference in `provides`, or an
   entry of `baseContracts`), and
2. the provision's version satisfies D's range (BEH-BR-226), and
3. when the provision's version is not below the version of D's contract
   object, every method name of D's contract object appears in the
   provision's methods.

```
REQUIREMENT: `install`, `replace` and `enable` MUST fail with
             `IncompatibleContract` when completing the call would leave an
             incompatible registered pair in which the plugin the call names
             is the dependent or the provider. The check MUST run against
             the definitions registered when the call is linearized — for
             `replace`, excluding the definition being replaced — and MUST
             register nothing when it fails.
```

```
REQUIREMENT: When several pairs are incompatible, the error MUST name the
             first: pairs where the named plugin is the dependent, in the
             order of its `requires`, then pairs where it is the provider,
             by dependent ID in code-unit order.
```

```
REQUIREMENT: The definition checks of BEH-BR-018 MUST run in this order:
             `UnknownRealm`, `InvalidDefinition`, `IncompatibleEngine`,
             `DuplicatePlugin`, `DuplicateProvider`, `DependencyCycle`,
             `IncompatibleContract`.
```

```
REQUIREMENT: A requirement on a key that has no provider in the scope MUST
             NOT be checked; the dependent waits as before (05 — Activation,
             BEH-BR-033). The check MUST run when a provider is registered,
             replaced or enabled.
```

```
REQUIREMENT: The checks MUST read declarations only — contract references,
             provisions and manifests (27 — Manifest and Lazy Activation,
             BEH-BR-242). They MUST NOT build, resolve or call any service,
             and MUST NOT call a lazy plugin's `load`.
```

Checking at registration, like the provider-slot check of BEH-BR-019, puts
the failure on the call that would create the incompatibility, with both
plugins named, instead of on some later activation. Its cost is the same
install-order sensitivity [ADR-BR-003](../decisions/003-one-provider-per-key-per-realm.md)
already accepts: a provider replaced by a lower minor that a registered
dependent needs is refused; the dependent must be replaced or removed first.
That refusal is the point — it is what stops a `replace` from taking a method
away from a running consumer.

**Settled here.** (1) Compatibility is decided between *registered* plugins,
not only active ones, for the reason slots are reserved at registration: an
answer that depended on which plugin happened to be active would change with
timing. (2) The method check applies only when the provider is at least as
new as the dependent's copy of the contract. When the dependent's copy is
newer — it declared a lower range — its copy lists methods the provider is
allowed not to have. (3) A plain-key provider of a `ServiceId` a dependent
requires through a contract is incompatible (`provided` absent): an
unversioned provision cannot satisfy a range.

**Open.** `reconcile` executes entries in list order
([18 — Reconciliation and Confluence](./18-reconciliation-and-confluence.md),
BEH-BR-156). A list that upgrades a provider and installs a dependent needing
the upgrade converges only if the provider's entry runs first, or on the next
run (BEH-BR-159). Whether `reconcile` should order provider replacements
before dependent installs is open.

## BEH-BR-229: Between two contract references, version checks replace the object check

> **Invariant:** [INV-BR-015](../invariants.md#inv-br-015-key-identity-is-checked-by-identifier-and-by-object), [INV-BR-031](../invariants.md#inv-br-031-a-registered-contract-requirement-is-satisfied-by-its-registered-provider)
> **See:** [ADR-BR-040](../decisions/040-versioned-contracts-in-core.md), [ADR-BR-011](../decisions/011-serviceid-is-key-identity.md)
> **Satisfies:** [URS-BR-029](../urs.md#urs-br-029-evolve-a-service-contract-without-breaking-its-consumers), [URS-BR-020](../urs.md#urs-br-020-load-plugin-definitions-dynamically-while-running)
> **Risk:** [RSK-BR-010](../gxp/03-risk-assessment.md#rsk-br-010)

```
REQUIREMENT: When a dependent's requirement and its provider's provision for
             one `ServiceId` are both contract references, the activation
             MUST NOT fail with `KeyMismatch` because they are different
             objects (05 — Activation, BEH-BR-038). Their compatibility is
             the registered-pair check of BEH-BR-228.
```

```
REQUIREMENT: When either side is a plain key, BEH-BR-038 MUST apply
             unchanged, comparing the plain key with the other side's
             `Contract.key`: the same object binds, a different object fails
             with `KeyMismatch`.
```

```
REQUIREMENT: For a key in `optional`, an incompatible provider MUST be
             treated as absent: `useOptional` MUST return `None` and
             `whenAvailable` MUST NOT run for it, as if the key had no
             active provider (15 — Optional and Reactive Dependencies).
             An incompatible optional pair MUST NOT fail any operation.
```

Two separately bundled copies of a contract package are exactly the case
ADR-BR-011 had to refuse: identical identifiers, different objects, and no
way to tell whether the shapes agree. Two *contracts* carry the information
that was missing, so the refusal is replaced by a comparison. Two plain keys,
or a plain key against a contract, still carry nothing to compare, and keep
the strict rule.

**Settled here.** An optional dependency is used "if present". A provider
that is present but incompatible is, for that dependent, not a provider it
can use; treating it as absent keeps optional keys from ever failing an
operation (BEH-BR-129) and from ever binding to a version the dependent did
not accept.

## BEH-BR-230: Add-only evolution within a major

> **See:** [ADR-BR-040](../decisions/040-versioned-contracts-in-core.md)
> **Satisfies:** [URS-BR-029](../urs.md#urs-br-029-evolve-a-service-contract-without-breaking-its-consumers)
> **Risk:** [RSK-BR-025](../gxp/03-risk-assessment.md#rsk-br-025)

Within one major (one `ServiceId`), a later minor or patch of a contract may
only add. The rules, for majors ≥ 1 (for major 0 they apply within one
minor):

| Change | Allowed within a major |
| --- | --- |
| Add a method | Yes (minor) |
| Add an optional field to a payload | Yes (minor); the provider must accept its absence |
| Add a field to a success value | Yes (minor); dependents ignore what they do not know (BEH-BR-231) |
| Fix behaviour without changing the schemas | Yes (patch) |
| Remove or rename a method, field or literal member | No — new major |
| Add a required payload field, or make an optional one required | No — new major |
| Change a field's type, a unit, or the meaning of a value | No — new major |
| Add a member to an error union, or turn a non-stream method into a stream | No — new major |

```
REQUIREMENT: Documentation MUST state these rules, and MUST state that core
             checks only two of their consequences: the method-name check of
             BEH-BR-228 and the major in the `ServiceId` (BEH-BR-225).
```

```
REQUIREMENT: The core MUST NOT compare schemas, decide whether a schema
             change is additive, or reject a contract for a schema change.
             A schema diff belongs to a companion (`@bridger/kit`'s contract
             check, `references/kit/`).
```

```
REQUIREMENT: Documentation MUST state that a dependent declaring a range
             below the version it was compiled against MUST call only the
             methods and fields of the range's lowest version, and that core
             cannot detect a call outside it.
```

The method-name check catches the commonest add-only violation — a method
removed in a minor — at the call that would expose it. Everything else needs
the schemas compared, which is a codec concern: comparing two
`Schema.Codec`s for "additive" requires walking their ASTs with rules about
optionality, defaults and transformations, and those rules are exactly what
a companion should own and be free to refine. Adding an error member is a
breaking change because an exhaustive `catchTags` in a dependent compiled
against the earlier error union would not handle it.

## BEH-BR-231: Decoding ignores unknown fields

> **See:** [ADR-BR-040](../decisions/040-versioned-contracts-in-core.md)
> **Satisfies:** [URS-BR-029](../urs.md#urs-br-029-evolve-a-service-contract-without-breaking-its-consumers)

```ts
// illustrative — not type-checked
declare const Contract: {
  readonly parseOptions: { readonly onExcessProperty: "ignore" }   // the only options a contract codec may use
  // ...
}
```

```
REQUIREMENT: The core MUST NOT decode or encode contract payloads. A call
             between two plugins in one host passes values directly, as for
             any service.
```

```
REQUIREMENT: Core documentation MUST state that every codec built from a
             contract's schemas — by a remote, federation, command or
             tooling companion — MUST decode with `Contract.parseOptions`:
             unknown properties are ignored, never an error and never
             preserved into the decoded value.
```

```
REQUIREMENT: `Contract.parseOptions` MUST be a frozen constant. The core
             MUST NOT read it itself.
```

Ignoring unknown fields is what lets a 2.3 provider answer a 2.1 dependent
across a boundary: the extra fields of the newer success value are dropped
by the older side's decoder instead of failing it. Core states the rule and
exports the one constant every companion uses, so that two companions cannot
make different choices about the same contract; in-process, a value with
extra properties is already harmless to code that does not read them.

## BEH-BR-232: Seams for negotiation, and what stays in companions

> **See:** [ADR-BR-040](../decisions/040-versioned-contracts-in-core.md), [ADR-BR-027](../decisions/027-core-exclusions.md)
> **Satisfies:** [URS-BR-029](../urs.md#urs-br-029-evolve-a-service-contract-without-breaking-its-consumers), [URS-BR-030](../urs.md#urs-br-030-know-what-a-plugin-declares-before-running-its-code)
> **Risk:** [RSK-BR-025](../gxp/03-risk-assessment.md#rsk-br-025)

```ts
// illustrative — not type-checked
interface PluginInspection {
  // ... (13 — Observability and Diagnostics)
  readonly contracts: {
    readonly requires: readonly { readonly serviceId: ServiceId; readonly range: ContractRange; readonly bound?: ContractVersion }[]
    readonly provides: readonly ContractDescriptor[]     // with the provision's version and methods
  }
}
```

```
REQUIREMENT: The core's negotiation seams MUST be exactly these: the
             `ContractDescriptor` of BEH-BR-225; `Contract.satisfies` and
             `Contract.maxSatisfying` of BEH-BR-226; `Contract.at` of
             BEH-BR-227; `IncompatibleContract` of BEH-BR-228, which a
             companion MAY use as the cause of an activation it fails; and
             `PluginInspection.contracts`. The core MUST NOT contain a
             negotiation protocol, a handshake, or a policy choosing among
             offered versions.
```

```
REQUIREMENT: `PluginInspection.contracts` MUST list each contract
             requirement with its range and, while the dependent is bound,
             the version of the provision it was bound to (`bound`), and
             each provision with its version and methods. Plain keys MUST
             NOT appear in it.
```

```
REQUIREMENT: The core MUST NOT depend on `effect/rpc`. Derivation of an
             `RpcGroup`, a JSON Schema or a Promise client from a contract
             belongs to companions.
```

```
REQUIREMENT: Whatever registers a provision of a contract at version V —
             a plugin, a remote or federation proxy, a session child —
             MUST deliver only an implementation that serves every method of
             V. A proxy that learns at run time which version a peer serves
             MUST provide the contract only while the peer serves a version
             v with the same major as V and v ≥ V (the range
             `>= V < (major+1).0.0`, built with `Contract.satisfies`); it
             MUST NOT provide it, nor fail the host's checks, for any other
             peer.
```

```
REQUIREMENT: A contract's major is part of its `ServiceId` (BEH-BR-225), so
             a provision MUST NOT change major after registration. A
             companion that follows a peer across majors MUST register one
             provision (one proxy) per major; core MUST NOT offer a way to
             re-key a registered provision.
```

How a remote proxy uses these seams, as [`references/remote/`](../../remote/README.md)
specifies it: the proxy plugin is registered with a provision at the version
its manifest declares, and its build opens nothing — the link becomes
`active` whether or not the peer is reachable, and opens sessions in a
background fiber afterwards. When a session's guest offers the versions it
speaks, the proxy accepts the session only if one satisfies
`>= V < (major+1).0.0`; it then mounts the session's child, which provides
the contract at V. A guest that serves no such version gets no session: the
contract stays unprovided, its dependents stay `waiting`, and the mismatch
is reported in the companion's status with an `IncompatibleContract` cause,
not as a failed activation. The host never negotiates — it sees a provision
fixed at registration and a provider that is present or absent. Federation's
skew handshake ([`references/federation/`](../../federation/README.md)) uses
the same seams with one import proxy per (peer, key, major): its handshake
accepts or refuses that import and never picks a major for a session; its
`IncompatiblePeer` error and N/N−1 window are its own. The kit's contract
check and generated clients ([`references/kit/`](../../kit/README.md)) use
them too.

**Settled here.** A provision is fixed at registration, never at build or at
session time. A version chosen later would make the registration-time check
of BEH-BR-228 meaningless and let a dependent bind to a version nobody
compared: a dependent requiring `^2.1` must never be served by a peer at
2.0.0 through a provision registered at 2.1.0. A proxy that cannot honour what
it declared provides nothing, visibly, instead.

---

_Previous: [25 — Operation Gate](./25-operation-gate.md)_ · _Next: [27 — Manifest and Lazy Activation](./27-manifest-and-lazy-activation.md)_
