# 26 — Versioned Contracts

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-BEH-26                                               |
> | Revision       | 0.10                                                         |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.10 (2026-11-11): BEH-BR-228 provider-side pairs ordered by dependent ID, then dependent realm (CL9) (SPEC-AUDIT-06) (CCR-BR-038)<br>0.9 (2026-11-11): `IncompatibleContract` gains `dependentRealm` and `providerRealm`, absent for a registry, "base" and "application", so both sides are named by id and realm (BEH-BR-147; round-5 residual of C2) (SPEC-AUDIT-05) (CCR-BR-037)<br>0.8 (2026-11-10): BEH-BR-232 a proxy's accepted range is `"^" + V`, inside the `ContractRange` grammar and, for major 0, within one minor (C9) (CCR-BR-036)<br>0.7 (2026-11-09): BEH-BR-225 a *local* contract, `Contract.local(Key, { version, members })`: members without codecs, `local` and `descriptor.local` true, every other rule of this file unchanged, never served, proxied or derived across a host boundary, locality fixed per major; BEH-BR-231 and BEH-BR-234 do not apply to it; BEH-BR-232 a companion refuses a local contract at a boundary (requested by event-store CCR-ES-003 and sequence CCR-SQ-003); the signature of `Contract.local` rejects a `members` list that omits an own key (`MissingMembers`), the example is a self-contained shape, and `Contract.local` is pure like `Contract.make` (CCR-BR-033)<br>0.6 (2026-11-09): BEH-BR-228 a `replace` that leaves the plugin disabled forms no registered pair; pairs checked at `enable` (U-07) (CCR-BR-032)<br>0.5 (2026-11-08): BEH-BR-233 Settled (3): a hook point is not a contract registry (agent review R1-14) (CCR-BR-029)<br>0.4 (2026-11-08): BEH-BR-225 `serviceKey` holds the key passed to `Contract.make` and `key` is the `ServiceId` string, Settled (4) (prototype finding G-P1); BEH-BR-228 an `install` with `disabled: true` forms no registered pair and is checked at `enable` (G-P2); BEH-BR-229 compares with `Contract.serviceKey` (CCR-BR-028)<br>0.3 (2026-11-08): BEH-BR-233 contract-checked contribution registries (`ContributionRegistry.make({ contract })`, `implements` on `add`, `within(range)` reader and `Selector` range); BEH-BR-234 optional per-method `timeout` in `MethodSpec` and `descriptor.timeouts`, not enforced by core (gap G48); BEH-BR-228 Open on `reconcile` order closed by BEH-BR-156 (gap G36); BEH-BR-230 timeout row; BEH-BR-232 seams list the timeouts; acceptance check 102 (CCR-BR-025)<br>0.2 (2026-11-08): acceptance checks 59–61; BEH-BR-232 rewritten to match the remote companion (build opens no session; a provision serves only peers at its major and at least its version; one provision per major);  divergence from npm stated (CCR-BR-022)<br>0.1 (2026-11-08): Initial draft (CCR-BR-017)                 |

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
section. This file owns BEH-BR-225–240 and uses BEH-BR-225–234; 235–240 are
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
are 59–61 and 102 of BEH-BR-184 ([21 — Testing Host](./21-testing-host.md)).

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

// A local contract: members that run only in the caller's process — they take a transaction
// from the caller's environment, take an effect as argument, or are objects of functions —
// declared by name, without codecs (CCR-BR-033).
interface LedgerShape {
  readonly post: (entry: Entry) => Effect.Effect<void, LedgerRejected, LedgerTransaction>       // needs the caller's transaction
  readonly within: <A, E>(effect: Effect.Effect<A, E, LedgerTransaction>) =>
    Effect.Effect<A, E | LedgerUnavailable, LedgerTransaction>                                   // takes an effect
  readonly cursors: { readonly get: (name: string) => Effect.Effect<number>
                      readonly put: (name: string, at: number) => Effect.Effect<void> }          // an object of functions
}
class LedgerKey extends Context.Service<LedgerKey, LedgerShape>()("example/Ledger@1") {}
const Ledger = Contract.local(LedgerKey, {
  version: "1.0.0",
  members: ["post", "within", "cursors"]                       // every own key of LedgerShape; omitting one is a compile error
})

interface LocalMember { readonly local: true }

interface MethodSpec {
  readonly payload: Schema.Codec<any, any>
  readonly success: Schema.Codec<any, any>
  readonly error?: Schema.Codec<any, any>              // absent = never
  readonly stream?: boolean                            // true: the method returns a Stream of `success`
  readonly timeout?: Duration.Input                    // default bound of one remote call (BEH-BR-234); never enforced by core
}

interface Contract<Self, Shape, M extends Record<string, MethodSpec> | Record<string, LocalMember>>
    extends Context.Key<Self, Shape> {
  // key: string — inherited from Context.Key: the ServiceId, "example/Audit@2" (CCR-BR-028)
  readonly serviceKey: Context.Key<Self, Shape>        // the Key passed to Contract.make
  readonly name: string                                // "example/Audit"
  readonly version: ContractVersion                    // "2.3.0"
  readonly methods: M                                  // MethodSpec per method; LocalMember per member when local
  readonly local: boolean                              // true exactly for Contract.local
  readonly descriptor: ContractDescriptor
  range(range: string): ContractRequirement<Self, Shape>        // BEH-BR-227
}

interface ContractDescriptor {                         // plain data; JSON-serialisable
  readonly serviceId: ServiceId                        // "example/Audit@2"
  readonly name: string
  readonly version: ContractVersion
  readonly methods: readonly string[]                  // method (or member) names, sorted by code unit
  readonly timeouts: readonly { readonly method: string; readonly millis: number }[]
                                                       // declared method timeouts, sorted by method (BEH-BR-234); [] when local
  readonly local: boolean                              // the contract's `local`
}

declare const Contract: {
  make<Self, Shape, M extends Record<string, MethodSpec>>(key: Context.Key<Self, Shape>,
    options: { readonly version: string; readonly methods: M }): Contract<Self, Shape, M>
  local<Self, Shape, const N extends readonly (keyof Shape & string)[]>(key: Context.Key<Self, Shape>,
    options: { readonly version: string; readonly members: N & Exhaustive<Shape, N> }): Contract<Self, Shape, Record<N[number], LocalMember>>
  // ...
}

// Unknown names are rejected by N's constraint; an omitted own key leaves `MissingMembers` to satisfy,
// which no array literal does, so the compile error names the missing keys.
type Exhaustive<Shape, N extends readonly PropertyKey[]> =
  [Exclude<keyof Shape & string, N[number]>] extends [never] ? unknown
    : MissingMembers<Exclude<keyof Shape & string, N[number]>>
interface MissingMembers<K extends string> { readonly missingMembers: K }
```

```
REQUIREMENT: `Contract.make(Key, { version, methods })` MUST return a
             `Contract` whose `ServiceId` is the `ServiceId` of `Key`. The
             `ServiceId` of a contract MUST have the form `<name>@<major>`,
             where `<major>` is the decimal major of `version`; `name` is the
             part before the last "@".
```

```
REQUIREMENT: As a `Context.Key`, a contract's `key` MUST be its `ServiceId`
             string, as for every key (01 — Plugin Definition, BEH-BR-006),
             and the key passed to `Contract.make` MUST be exposed as
             `serviceKey`. Every member of the interface above MUST read as
             stated even when the contract is built on a class key, whose
             own `name` is the class's. `ContractRequirement` and
             `ContractProvision` (BEH-BR-227) MUST follow the same rule:
             their `key` is the `ServiceId`, and the wrapped key is
             `contract.serviceKey`.
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
REQUIREMENT: `Contract.make`, `Contract.local` and `Contract.method` MUST
             be pure: they MUST NOT perform effects, register the contract
             anywhere or throw.
             A contract whose `ServiceId` lacks the `@<major>` suffix, whose
             suffix differs from the major of `version`, whose `version`
             breaks the grammar of BEH-BR-226, or whose `methods` is empty,
             MUST be recorded as invalid on the value, and every `install`,
             `replace` or `enable` of a definition that names it MUST fail
             with `InvalidDefinition { id, reason }`, `reason` naming the
             contract's `ServiceId` and the rule broken.
```

```
REQUIREMENT: `Contract.local(Key, { version, members })` MUST return a
             *local* contract: a `Contract` whose `local` is true, whose
             `methods` holds one `LocalMember` per listed name, and whose
             `descriptor` has `local` true, the sorted member names as
             `methods` and no `timeouts`. `Contract.make` MUST give `local`
             false. The type of `Contract.local` MUST reject, as a compile
             error, a `members` list that names a key absent from the
             service shape or omits an own key of it, so that every member
             of the shape is listed. The validity rules of `Contract.make`
             apply — `ServiceId` suffix, major, version grammar, a
             non-empty list — and a list that names one member twice MUST
             also make the contract invalid.
```

```
REQUIREMENT: Every rule of this file other than those that read codecs or
             timeouts MUST apply to a local contract unchanged: versions and
             ranges (BEH-BR-226), references (BEH-BR-227), the pair check by
             member names (BEH-BR-228, BEH-BR-229), add-only evolution of
             member names (BEH-BR-230), registries (BEH-BR-233), and grants
             by member name (29 — Capability Grants and Call Log,
             BEH-BR-273). BEH-BR-231 and BEH-BR-234 MUST NOT apply: a local
             contract has no codecs and no remote call to bound.
```

```
REQUIREMENT: A local contract MUST NOT cross a host boundary. Core crosses
             none itself. Documentation of `Contract.local` MUST state that
             no companion may serve a local contract to another host,
             provide it from a peer (a remote, federation or MCP proxy), or
             derive a wire artifact from it (an `RpcGroup`, a JSON Schema, a
             generated client); a companion that would MUST refuse when the
             contract object it is given, or its `descriptor`, has `local`
             true (BEH-BR-232).
```

```
REQUIREMENT: A contract's locality MUST be fixed per major: every version of
             one `ServiceId` MUST be declared local, or every version not.
             Changing locality MUST take a new major. Core does not compare
             the locality of two contract objects, which a manifest's
             contract reference does not carry; a companion at a boundary
             MUST read `local` on every contract object it is given.
```

```
REQUIREMENT: `descriptor` MUST be derived from the contract alone and MUST
             be plain data: the `ServiceId`, the name, the version, the
             sorted method names, the declared method timeouts
             (BEH-BR-234) and `local`. It MUST NOT contain a schema, a key object or a
             function.
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
as any other definition error is (BEH-BR-018). (3) A contract made with
`Contract.make` describes request/response and streaming methods only. A
service with other members (synchronous getters, `SubscriptionRef`s) stays a
plain key, or, when it never crosses a host, is a local contract (5). (4) The key
passed to `Contract.make` is `serviceKey`, not `key` (CCR-BR-028). (5) A local
contract is declared by member names alone (CCR-BR-033). The event store and
sequence companions provide services whose members run in the caller's
`StoreTransaction` or take an effect as argument; such a member has no wire
form, so a `MethodSpec` for it would be a codec nobody could honour, and a
plain key would lose the version check and the member-level grants those
companions need. Declaring the members by name keeps every in-process rule,
and the `local` flag gives the boundary companions one fact to refuse on.
Locality is per major rather than per member: a service with one local member
cannot be served across a host whole, and a grant or a client that crossed
with the other members would present a service missing one. Revision
0.3 declared `key: Context.Key` on a type that extends `Context.Key`, whose
`key` is the `ServiceId` string that `Context.add` and `Context.get` read;
the two cannot both hold (host-core prototype finding G-P1).

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
  dependentId: Schema.String,                     // plugin ID of the requiring side, or "registry:" + name
  dependentRealm: Schema.optional(Schema.String), // its realm; absent for a registry (BEH-BR-147)
  providerId: Schema.String,                      // plugin ID, or "base", or "application"
  providerRealm: Schema.optional(Schema.String),  // its realm; absent for "base" and "application" (BEH-BR-147)
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
             register nothing when it fails. An `install` with
             `disabled: true` (03 — Installation, BEH-BR-023) forms no
             registered pair, so it MUST NOT fail with
             `IncompatibleContract`; nor does a `replace` that leaves the
             plugin disabled (07 — Replacement and Reactivation,
             BEH-BR-050). Their pairs are checked at `enable`
             (BEH-BR-062).
```

```
REQUIREMENT: When several pairs are incompatible, the error MUST name the
             first: pairs where the named plugin is the dependent, in the
             order of its `requires`, then pairs where it is the provider,
             by dependent ID and then dependent realm, each in code-unit
             order.
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

**Settled (CCR-BR-025).** Earlier revisions left open that `reconcile`
acted on entries in list order, so a list that upgrades a provider and
installs a dependent needing the upgrade converged only if the provider's
entry came first (gap G36). `reconcile` now orders its changes providers
first ([18 — Reconciliation and Confluence](./18-reconciliation-and-confluence.md),
BEH-BR-156), and an atomic apply undoes the whole list when a check still
refuses an entry ([32 — Generic Gate and Plan](./32-generic-gate-and-plan.md),
BEH-BR-322). A provider *narrowed* under a listed dependent's current
definition still needs two runs, as BEH-BR-156 states.

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
             `Contract.serviceKey`: the same object binds, a different object fails
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
| Change a method's declared `timeout` (BEH-BR-234) | Yes (patch); core does not compare it |

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
             companion MAY use as the cause of an activation it fails;
             `PluginInspection.contracts`; and the declared method timeouts
             of BEH-BR-234. The core MUST NOT contain a
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
             v that satisfies the range `"^" + V`, decided with
             `Contract.satisfies` (for a major ≥ 1, the same major and
             v ≥ V; for major 0, the same minor and v ≥ V, the span
             add-only evolution covers, BEH-BR-230); it
             MUST NOT provide it, nor fail the host's checks, for any other
             peer. A proxy, server or generator MUST NOT be built for a local
             contract (BEH-BR-225).
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
speaks, the proxy accepts the session only if one satisfies `"^" + V`; it
then mounts the session's child, which provides
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

## BEH-BR-233: A registry may declare a contract, and every contribution is checked against it

> **Invariant:** [INV-BR-049](../invariants.md#inv-br-049-a-contract-checked-registry-holds-only-compatible-contributions)
> **See:** [ADR-BR-052](../decisions/052-typed-registries.md), [ADR-BR-040](../decisions/040-versioned-contracts-in-core.md), [ADR-BR-024](../decisions/024-shared-state-helpers.md)
> **Satisfies:** [URS-BR-052](../urs.md#urs-br-052-rely-on-the-contract-version-of-every-implementation-in-an-extension-point), [URS-BR-029](../urs.md#urs-br-029-evolve-a-service-contract-without-breaking-its-consumers), [URS-BR-014](../urs.md#urs-br-014-contribute-to-a-shared-extension-point-safely)
> **Risk:** [RSK-BR-060](../gxp/03-risk-assessment.md#rsk-br-060), [RSK-BR-025](../gxp/03-risk-assessment.md#rsk-br-025)

```ts
// illustrative — not type-checked
const Ordering = Contract.make(OrderingKey, { version: "2.3.0", methods: { placeOrder, status, cancel } })

// The registry is the one provider of its key (31, BEH-BR-307); it now states what it accepts.
const wholesalers = yield* ContributionRegistry.make({ name: "wholesalers", contract: Ordering, range: "^2.1" })

yield* wholesalers.add("acme", acmeApi, { implements: "2.3.0" })                     // all methods of 2.3.0
yield* wholesalers.add("beta", betaApi, { implements: { version: "2.1.4", methods: ["placeOrder", "status"] } })
yield* wholesalers.add("gamma", gammaApi)                       // fails: IncompatibleContract, `provided` absent

const pick = Selector.make(wholesalers, choosePerBranch, { range: "^2.3" })   // only "acme" can be chosen
```

```
REQUIREMENT: `ContributionRegistry.make` MUST accept an optional `contract`
             (a `Contract`, BEH-BR-225) and an optional `range` (default
             `"^" + contract.version`). With a `contract`, the registry's
             value type MUST be the contract's service shape, and `make` MUST
             die with a defect naming the registry when the contract is
             invalid (BEH-BR-225) or `range` breaks BEH-BR-226 or leaves the
             contract's major. A `range` without a `contract` MUST be such a
             defect too.
```

```
REQUIREMENT: On a registry made with a `contract`, every `add` MUST declare
             what its value implements: `implements: v` (a version, read as a
             provision of `v` with all the method names of the registry's
             contract) or `implements: { version, methods }`. The pair formed
             by the registry — as the dependent, with its `range` and its
             contract object — and the contribution — as the provision — MUST
             be compatible by the three conditions of BEH-BR-228. A
             contribution without `implements` MUST be incompatible, as a
             plain-key provider is (BEH-BR-228, Settled 3).
```

```
REQUIREMENT: An incompatible `add` MUST fail with `IncompatibleContract`,
             with `serviceId` the contract's `ServiceId`, `dependentId`
             `"registry:" + name` and no `dependentRealm`, `providerId` and
             `providerRealm` the contributing plugin's ID and realm (from
             `@bridger/core/ActivePlugin`), or `providerId` `"application"`
             and no `providerRealm` when no plugin is active, `required` the registry's `range`, `provided`
             the declared version (absent without `implements`) and
             `missingMethods` as BEH-BR-228 defines it, and MUST register
             nothing. The check MUST run after a wired `AccessPolicy` allows
             the contribution and before the id is reserved
             (19 — Contribution Registry, BEH-BR-163).
```

```
REQUIREMENT: `implements` on a registry made without a `contract`, or with
             an empty `methods` list, MUST be rejected at `add` as a defect
             and MUST register nothing.
```

```
REQUIREMENT: The check MUST read declarations only: the registry's contract
             and range and the contribution's `implements`. It MUST NOT
             inspect, call or decode the contributed value, and core MUST NOT
             describe a passing check as evidence that the value behaves as
             the declared version says.
```

```
REQUIREMENT: On a contract registry, `within(range)` MUST return a reader
             whose `get`, `view`, `changes`, `use` and `useAll` treat every
             entry whose declared version does not satisfy `range` as
             absent: `get` returns `None`, views omit it, `use` fails with
             `ContributionUnavailable`; the reader holds and drains exactly
             as the registry does (19 — Contribution Registry, BEH-BR-166,
             BEH-BR-167). `Selector.make(registry, choose, { range })`
             (31 — Hook Points, BEH-BR-307) MUST pass `choose` the view of
             `within(range)` and MUST accept only ids in it. A `range` that
             breaks BEH-BR-226 or leaves the registry contract's major, or
             `within` on a registry without a contract, MUST be a defect at
             the call.
```

Before this behaviour, the one place where several implementations of one
contract meet — a registry, as BEH-BR-307 requires — was also the one place
where nothing compared versions: a connector compiled against 2.0 could
contribute to a registry whose consumers call methods added in 2.3, and the
first sign would be a missing method at call time. The registry now plays
the part a dependent plays in BEH-BR-228: it states the range it accepts,
and each contribution states the version it implements, so the refusal lands
on the `add` that would create the mismatch, naming both sides.

**Settled here.** (1) The check reuses `IncompatibleContract` and the three
conditions of BEH-BR-228 rather than a registry-specific error, so that a
tool that explains one explains both. `dependentId` carries a
`"registry:"` prefix because a registry is not a plugin. (2) Range filters
are per call: one registry can serve a consumer that needs 2.3 and another
that is content with 2.1, without two registries. (3) A hook point is not
a contract registry: it makes its own registry, named after its id, and its
contributions are hook functions, not contract implementations (31 — Hook
Points, BEH-BR-297), so this check does not apply to it. A `Selector` over a
contract registry (BEH-BR-307) is where several implementations of one
contract meet and are checked (CCR-BR-029, agent review R1-14).

## BEH-BR-234: A contract method may declare a call timeout, which core does not enforce

> **See:** [ADR-BR-040](../decisions/040-versioned-contracts-in-core.md), [ADR-BR-027](../decisions/027-core-exclusions.md)
> **Satisfies:** [URS-BR-029](../urs.md#urs-br-029-evolve-a-service-contract-without-breaking-its-consumers), [URS-BR-010](../urs.md#urs-br-010-detect-a-plugin-that-waits-forever)
> **Risk:** [RSK-BR-025](../gxp/03-risk-assessment.md#rsk-br-025)

```ts
// illustrative — not type-checked
const Payments = Contract.make(PaymentsKey, {
  version: "1.2.0",
  methods: {
    authorize: Contract.method({ payload: AuthRequest, success: AuthResult, error: Declined, timeout: "20 seconds" }),
    status:    Contract.method({ payload: StatusRequest, success: Status, timeout: "2 seconds" })
  }
})
// Payments.descriptor.timeouts = [{ method: "authorize", millis: 20000 }, { method: "status", millis: 2000 }]
```

```
REQUIREMENT: `MethodSpec.timeout` MUST be optional. When present it MUST be
             a finite, positive duration; any other value MUST make the
             contract invalid (BEH-BR-225). `descriptor.timeouts` MUST list
             every declared timeout in milliseconds, sorted by method name in
             code-unit order, and MUST be empty when none is declared.
```

```
REQUIREMENT: Core MUST NOT enforce a method timeout: it MUST NOT bound,
             interrupt or fail a call between two plugins in one host because
             of it, and it MUST NOT compare timeouts in any compatibility
             check (BEH-BR-228, BEH-BR-233).
```

```
REQUIREMENT: Core documentation MUST state that a companion proxy serving a
             contract across a boundary (the remote and federation
             companions) reads `descriptor.timeouts` as the method's
             default call bound, that the bound it applies is the smallest of
             that value, its own per-link option and the remaining time of the
             caller's `Annotation.Deadline`
             ([30 — Operation Context Annotations](./30-operation-context-annotations.md),
             BEH-BR-291), and that a method without a declared timeout falls
             back to the companion's own default.
```

A method's expected duration is part of what the contract's author knows —
an authorisation that may wait on a card network is not a status lookup —
and every proxy of the contract needs it, so it belongs beside the method,
not in each proxy's options (gap G48). In one host a call is a function
call: core puts no clock on it and adds none here.

**Settled here.** (1) The timeout is a declaration carried as data, like the
method names; core reads it nowhere. (2) Changing it is allowed within a
major (BEH-BR-230): it changes no shape a dependent compiled against.

---

## Acceptance checks

These checks extend BEH-BR-184 (21 — Testing Host); their scenarios are
allocated in [traceability.md](../traceability.md) §5. Each will be a tagged
scenario once code exists; none has run.

| Scenario | Check | Behaviours |
| --- | --- | --- |
| REQ-BR-102 | A contract registry refuses an `add` without `implements`, below its range, or missing a method of its contract copy with `IncompatibleContract` naming `registry:<name>` and registers nothing; a compatible `add` registers with its version in the view; `within(range)` and `Selector.make` with a range hide out-of-range entries; `implements` on a plain registry is a defect; a method `timeout` appears in `descriptor.timeouts`, is never enforced in-process and never fails a check, and an invalid one makes the contract invalid | BEH-BR-163, BEH-BR-165, BEH-BR-225, BEH-BR-233, BEH-BR-234 |

_Previous: [25 — Operation Gate](./25-operation-gate.md)_ · _Next: [27 — Manifest and Lazy Activation](./27-manifest-and-lazy-activation.md)_
