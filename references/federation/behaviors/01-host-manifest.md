# 01 — Host manifest

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-FD-BEH-01                                            |
> | Revision       | 0.3                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.3 (2026-11-08): resolutions of the agent review of 2026-11-08 — `window` split into `protocolWindow` and `contractWindow`; an import names one major through `version`; resolved definitions kept and offline resolution stated as the loader cache's; transiently rejected entries and pending kills retried at each sync and reported until gone (R3-02, R3-19, R3-21, R3-24) (CCR-FD-002)<br>0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-FD-001)<br>0.1 (2026-11-08): Initial draft (CCR-FD-001)                 |

---

A host manifest is the desired state of one host, issued and signed by an
authority. This file fixes its shape, how it is verified before it is read,
how revisions order it, how it is projected onto the core's `DesiredPlugin`
list together with local patches and kill entries, and how it is applied
through `reconcile`. This file owns BEH-FD-001–008 and uses all eight.

Planned source: `packages/federation/src/Manifest.ts` and
`packages/federation/src/Apply.ts` *(Planned)*.

## BEH-FD-001: A host manifest is data with a fixed schema

> **Invariant:** [INV-FD-002](../invariants.md#inv-fd-002-no-unverified-manifest-is-applied)
> **See:** [ADR-FD-001](../decisions/001-federation-is-a-companion-over-reconcile.md), [ADR-FD-002](../decisions/002-authority-is-the-only-source-of-desired-state.md)
> **Depends on:** [core 27 — Manifest and lazy activation](../../core/behaviors/27-manifest-and-lazy-activation.md) (manifest as data; BEH-BR-241–249)
> **Satisfies:** [URS-BR-016](../../core/urs.md#urs-br-016-drive-the-plugin-set-from-a-declarative-list)

```ts
// illustrative — not type-checked
interface HostManifest {
  readonly format: "bridger.host-manifest/1"
  readonly authority: string                 // opaque authority id
  readonly host: string                      // opaque id of the one host this manifest is for
  readonly revision: number                  // positive integer (BEH-FD-004)
  readonly issuedAt: string                  // ISO 8601, the authority's clock
  readonly validUntil?: string               // ISO 8601; absent = no freshness limit (BEH-FD-012)
  readonly protocolWindow?: number           // federation protocol versions behind the local maximum, default 1 (BEH-FD-019)
  readonly contractWindow?: number           // contract majors behind the highest known, default 1 (BEH-FD-020)
  readonly plugins: readonly ManifestPlugin[]
  readonly realms?: readonly ManifestRealm[]
  readonly peers?: readonly ManifestPeer[]
  readonly exports?: readonly ManifestExport[]
  readonly imports?: readonly ManifestImport[]
  readonly kill?: readonly KillEntry[]
  readonly overridable?: readonly OverridableField[]   // fields local patches may change (BEH-FD-006)
}

interface ManifestPlugin {
  readonly id: string
  readonly digest: string                    // resolved through the loader (BEH-FD-005)
  readonly version: string
  readonly realm?: string                    // default "default"
  readonly config?: unknown                  // the override the plugin should hold
  readonly disabled?: boolean
  readonly requiresFresh?: boolean           // disabled once the manifest is stale (BEH-FD-012)
}

interface ManifestRealm  { readonly id: string; readonly isolate: readonly string[] }   // ServiceIds
interface ManifestPeer   { readonly id: string; readonly address: string; readonly protocol: readonly [min: number, max: number] }
interface ManifestExport { readonly key: string; readonly version: number; readonly to: readonly string[] | "*"
                           readonly methods?: readonly string[]; readonly fence?: ExportFence }       // 04
interface ManifestImport { readonly key: string; readonly from: string
                           readonly version: string                  // the provision's version V; one import = one major (BEH-FD-020)
                           readonly realm?: string; readonly timeout?: string }                       // 04
type KillEntry =
  | { readonly digest: string; readonly reason: string }
  | { readonly id: string; readonly realm?: string; readonly reason: string }
type OverridableField = { readonly id: string; readonly realm?: string; readonly fields: readonly ("config" | "disabled")[] }
```

```
REQUIREMENT: A host manifest MUST be decoded with an Effect Schema whose
             `format` literal is "bridger.host-manifest/1". A manifest with
             another `format` MUST be refused with
             `ManifestRejected { reason: "unknown-format" }`; unknown fields
             of a known format MUST be ignored on decode, so that an
             authority may add fields that older hosts do not read.
```

```
REQUIREMENT: Every identifier in a manifest (authority, host, plugin, realm,
             peer, service key) MUST be treated as opaque. The package MUST
             NOT parse meaning out of an identifier.
```

```
REQUIREMENT: A manifest MUST be complete: it states the whole desired state of
             its host at that revision. The package MUST NOT accept deltas
             against an earlier revision.
```

**Settled here.** (1) Full documents, not deltas: a host that missed
revisions converges on the latest one without replaying the ones in between,
so the manifest itself never needs a replay horizon; only application data
does ([BEH-FD-014](./02-sync-offline-and-rebootstrap.md#beh-fd-014-a-host-too-far-behind-re-bootstraps-from-a-snapshot)).
(2) Ignoring unknown fields follows the add-only evolution of [core 26](../../core/behaviors/26-versioned-contracts.md); a
change that older hosts must not ignore takes a new `format`.

**Open.** Whether `ManifestPlugin` should embed the [core 27](../../core/behaviors/27-manifest-and-lazy-activation.md) plugin manifest
(contributions, triggers, permissions) or only reference it by digest is
left to the integration of [core 27](../../core/behaviors/27-manifest-and-lazy-activation.md); this file needs only `id`, `digest` and
`version`.

## BEH-FD-002: The signed bytes are verified before they are decoded

> **Invariant:** [INV-FD-002](../invariants.md#inv-fd-002-no-unverified-manifest-is-applied)
> **See:** [ADR-FD-004](../decisions/004-signatures-delegated-to-loader.md)
> **Depends on:** `SignaturePolicy` of the loader companion ([references/loader/](../../loader/README.md))
> **Satisfies:** [URS-BR-020](../../core/urs.md#urs-br-020-load-plugin-definitions-dynamically-while-running)

```ts
// illustrative — not type-checked; the port's exact shape is the loader companion's
interface SignedManifest {
  readonly payload: Uint8Array                       // canonical bytes, as signed
  readonly signatures: readonly { readonly keyId: string; readonly algorithm: string; readonly value: Uint8Array }[]
}

// loader companion (assumed shape)
interface SignaturePolicy {
  readonly verify: (subject: { readonly kind: "host-manifest"; readonly bytes: Uint8Array },
                    signatures: SignedManifest["signatures"]) =>
    Effect.Effect<{ readonly signers: readonly string[] }, SignatureRejected>
}
```

```
REQUIREMENT: The federation plugin MUST pass the received `payload` bytes,
             unchanged, with their signatures, to the `SignaturePolicy` named
             in its options, and MUST decode the payload only after that port
             accepted it. Bytes re-encoded from a decoded value MUST NOT be
             verified in place of the received bytes.
```

```
REQUIREMENT: A refusal, failure, defect or timeout of the `SignaturePolicy`
             MUST be treated as `ManifestRejected { reason: "signature" }`.
             The manifest MUST NOT be stored as verified and MUST NOT be
             applied.
```

```
REQUIREMENT: The federation plugin MUST NOT contain a default
             `SignaturePolicy`, permissive or otherwise. Without one wired,
             `Federation.plugin` MUST fail to build with
             `InvalidDefinition { reason: "no-signature-policy" }`.
```

```
REQUIREMENT: A manifest read back from the `ManifestStore` at boot MUST be
             verified again, as received bytes, before it is applied.
```

**Settled here.** Verify-then-decode: decoding first would run a parser over
unauthenticated input and invite "verify what I decoded" mistakes. Verifying
the stored copy again costs one verification per boot and closes the path by
which a local edit to the store would change what the host runs. Refusing to
build without a policy follows the core's refusal of a permissive default
gate ([ADR-BR-032](../../core/decisions/032-operation-gate.md)): a control
that accepts everything should not be configurable as a control.

## BEH-FD-003: A manifest is for one host from one authority

> **Invariant:** [INV-FD-002](../invariants.md#inv-fd-002-no-unverified-manifest-is-applied)
> **See:** [ADR-FD-002](../decisions/002-authority-is-the-only-source-of-desired-state.md)
> **Satisfies:** [URS-BR-016](../../core/urs.md#urs-br-016-drive-the-plugin-set-from-a-declarative-list)

```
REQUIREMENT: After verification, a manifest whose `host` differs from the
             plugin's configured host id, or whose `authority` differs from
             its configured authority id, MUST be refused with
             `ManifestRejected { reason: "wrong-host" | "wrong-authority" }`.
```

```
REQUIREMENT: A federation plugin MUST follow exactly one authority. Two
             federation plugins on one host MUST use distinct reconcile
             scopes and MUST NOT list the same (id, realm); the second
             listing is rejected by core reconcile with `DuplicatePlugin`
             (BEH-BR-155).
```

The host binding stops a manifest signed for one terminal from being
replayed onto another. It is checked after verification because the fields
it reads are only meaningful once the bytes are known to be the authority's.

## BEH-FD-004: Revisions are monotonic, and a reused revision is refused

> **Invariant:** [INV-FD-001](../invariants.md#inv-fd-001-applied-manifest-revisions-never-decrease)
> **See:** [ADR-FD-003](../decisions/003-monotonic-manifest-revisions.md)
> **Satisfies:** [URS-BR-028](../../core/urs.md#urs-br-028-know-which-plugin-version-was-active-at-any-time)

```
REQUIREMENT: The `ManifestStore` MUST keep the highest verified revision the
             host has accepted for its (authority, host), with the manifest
             bytes and signatures of that revision. A verified manifest
             MUST be compared with it:
             - higher revision         → accepted; stored as the highest
                                         verified BEFORE it is applied;
             - equal revision, same
               payload bytes           → a no-op (already known);
             - equal revision,
               different payload       → `ManifestRejected
                                         { reason: "revision-reused" }`;
             - lower revision          → `ManifestRejected
                                         { reason: "revision-regressed" }`.
```

```
REQUIREMENT: A `revision-reused` refusal MUST be reported as a
             `manifest-equivocation` event on `Federation.Status.changes`
             and, when a `StatusReporter` is wired, to the authority. It MUST
             NOT change what the host runs.
```

```
REQUIREMENT: Rolling a host back to an earlier desired state MUST be done by
             the authority issuing a new, higher revision with that content.
             The package MUST NOT offer an operation that applies a lower
             revision.
```

**Settled here.** (1) The highest verified manifest is stored *before* it is
applied. If the host stops between the store write and the end of
`reconcile`, the next boot applies that revision again (reconcile is
idempotent, [INV-BR-021](../../core/invariants.md#inv-br-021-reconcile-is-idempotent));
storing after the apply would let a crash bring back a plugin a kill entry
had just removed. (2) Two different signed payloads under one revision mean
the authority signed twice for one slot — an authority defect or a key
compromise. Neither can be resolved by the host, so it keeps what it runs and
raises the alarm.

**Open.** A host whose store is erased loses its highest revision and would
accept any older signed manifest again. The boot bundle carries a floor
revision (BEH-FD-010), which limits but does not close this; closing it needs
storage the host cannot erase, which is the consumer's.

## BEH-FD-005: A manifest projects to a desired list without evaluating code

> **Invariant:** [INV-FD-002](../invariants.md#inv-fd-002-no-unverified-manifest-is-applied)
> **See:** [ADR-FD-001](../decisions/001-federation-is-a-companion-over-reconcile.md)
> **Depends on:** loader definition resolution by digest ([references/loader/](../../loader/README.md)); [core 27 — Manifest and lazy activation](../../core/behaviors/27-manifest-and-lazy-activation.md) (BEH-BR-241–249)
> **Satisfies:** [URS-BR-016](../../core/urs.md#urs-br-016-drive-the-plugin-set-from-a-declarative-list), [URS-BR-020](../../core/urs.md#urs-br-020-load-plugin-definitions-dynamically-while-running)

```ts
// illustrative — not type-checked
interface PluginResolver {   // supplied by the loader companion
  readonly resolve: (ref: { readonly id: string; readonly digest: string; readonly version: string }) =>
    Effect.Effect<PluginDefinition<any, any, any, any>, ResolveFailed>
}

declare const Manifest: {
  toDesired(
    manifest: HostManifest,
    resolved: ReadonlyMap<string, PluginDefinition<any, any, any, any>>,  // digest -> definition
    local: readonly (Partial<DesiredPlugin> & { readonly id: string })[],
    options: { readonly fresh: boolean }
  ): { readonly desired: readonly DesiredPlugin[]; readonly dropped: readonly { id: string; reason: string }[] }
}
```

```
REQUIREMENT: Each `ManifestPlugin` MUST be resolved to a definition by its
             `digest` through the `PluginResolver`. The resolver is the
             loader companion's; the federation package MUST NOT import,
             fetch or evaluate plugin code itself.
```

```
REQUIREMENT: A definition returned for a digest MUST carry `meta.digest`
             equal to that digest and `meta.version` equal to the entry's
             `version`; otherwise the entry MUST be dropped with reason
             "digest-mismatch". With both set, core reconcile treats an
             unchanged entry as the same definition (BEH-BR-154), so a
             re-applied manifest restarts nothing.
```

```
REQUIREMENT: An entry whose resolution fails MUST be dropped from the desired
             list with its reason and reported; the other entries MUST still
             be applied. A dropped entry that names a plugin the scope
             already owns MUST be listed with the definition this plugin
             last resolved for it, so that a resolver outage does not prune
             it. The plugin MUST keep, for its activation, the definition
             objects it last resolved for each owned entry; core snapshots
             do not carry definitions.
```

```
REQUIREMENT: Documentation MUST state that boot without network is only as
             good as the resolver's local storage: after a process restart
             the plugin holds no resolved definition, and an entry whose
             digest the `PluginResolver` cannot resolve from local,
             content-addressed storage is dropped and not run. A deployment
             that must run offline after a restart MUST use a resolver that
             keeps every digest of the highest verified manifest locally
             (the loader companion's cache).
```

```
REQUIREMENT: `Manifest.toDesired` MUST be pure in the sense of
             `Desired.overlay` (BEH-BR-153): no I/O, no host, clock or
             identifier service. Resolution happens before it; freshness is
             passed in.
```

**Settled here.** Keeping a plugin whose definition cannot be resolved,
rather than pruning it, is the conservative choice: an unreachable package
registry must not remove a working plugin from a terminal. A kill entry, by
contrast, removes it (BEH-FD-007) — removal is only ever on purpose. Where
the loader supplies `Plugin.lazy` definitions ([core 27](../../core/behaviors/27-manifest-and-lazy-activation.md)), resolution yields a
definition whose code is evaluated only at its trigger, so applying a
manifest evaluates no plugin code.

## BEH-FD-006: Local patches change only what the manifest makes overridable

> **See:** [ADR-FD-002](../decisions/002-authority-is-the-only-source-of-desired-state.md)
> **Satisfies:** [URS-BR-016](../../core/urs.md#urs-br-016-drive-the-plugin-set-from-a-declarative-list)

```
REQUIREMENT: The desired list MUST be built as
             `Desired.overlay(base, allowedLocal)`, where `base` is the
             projection of the manifest's plugins and imports, and
             `allowedLocal` keeps from the local patches only the fields
             that `manifest.overridable` lists for that (id, realm). Every
             other field of a local patch, and every patch addressing an
             entry not in `overridable`, MUST be dropped and reported as
             "not-overridable".
```

```
REQUIREMENT: A local patch MUST NOT add an entry: patches carrying a `plugin`
             for an (id, realm) absent from the manifest MUST be dropped.
             Plugins a site operator installs by hand are installed with
             direct host calls, outside the federation scope, where core
             reconcile never touches them (BEH-BR-155).
```

```
REQUIREMENT: Local patches MUST be supplied to the federation plugin by the
             application, with the actor who authored them; each apply that
             uses a patch MUST carry that actor in the reason it passes to
             `reconcile` (BEH-FD-008).
```

**Settled here.** The overlay is the core one; this package only filters what
reaches it. A site that may tune a printer setting gets `config` on that
entry; nothing in a patch can resurrect a plugin the authority dropped or
killed.

## BEH-FD-007: A kill entry removes matching plugins at the next apply

> **Invariant:** [INV-FD-003](../invariants.md#inv-fd-003-a-killed-plugin-is-never-in-a-desired-list)
> **See:** [ADR-FD-003](../decisions/003-monotonic-manifest-revisions.md)
> **Depends on:** loader `RevocationSource` ([references/loader/](../../loader/README.md)), optional
> **Satisfies:** [URS-BR-002](../../core/urs.md#urs-br-002-remove-or-replace-a-plugin-safely-while-it-is-in-use)

```
REQUIREMENT: After the overlay, every entry matching a kill entry — by
             `digest`, or by (id, realm ?? "default") — MUST be removed from
             the desired list, so that core reconcile prunes the plugin if
             the federation scope owns it. Kill entries MUST be applied last
             and MUST NOT be overridable.
```

```
REQUIREMENT: A kill entry matching a plugin installed outside the federation
             scope MUST NOT cause any host operation on it; it MUST be
             reported as `kill-unowned { id, realm, reason }` on
             `Federation.Status.changes`.
```

```
REQUIREMENT: A kill by digest MUST also refuse that digest for imports and
             exports (04): no proxy is installed for it and no export is
             served by a plugin whose definition carries it.
```

```
REQUIREMENT: When a loader `RevocationSource` is wired, a digest it revokes
             MUST be treated as a kill entry at the next apply, whether or not
             the manifest lists it.
```

The kill switch is therefore a manifest entry, applied at the next sync like
any other change: there is no separate push channel whose loss would
silently disable it. How quickly a kill reaches a host is bounded by
`syncEvery` while online; offline, by nothing — which is why the offline cap
exists ([ADR-FD-007](../decisions/007-offline-cap-and-rebootstrap.md)).
Removal goes through core `remove`, so a plugin in use drains under its
leases first ([09 — Leases](../../core/behaviors/09-leases.md)).

**Open.** A kill that must interrupt calls in flight would need a forced
removal. Core's `pruneDrain` and `pruneForce` (core BEH-BR-155) apply to
every prune of one reconcile, not to one entry; whether a kill entry may
carry `force`, served by a separate forced reconcile, is left open, since a
forced drain interrupts writes ([RSK-BR-015](../../core/gxp/03-risk-assessment.md#rsk-br-015)).

## BEH-FD-008: A manifest is applied through one attributed reconcile

> **Invariant:** [INV-FD-001](../invariants.md#inv-fd-001-applied-manifest-revisions-never-decrease), [INV-FD-008](../invariants.md#inv-fd-008-no-host-transition-waits-on-the-network)
> **See:** [ADR-FD-001](../decisions/001-federation-is-a-companion-over-reconcile.md)
> **Satisfies:** [URS-BR-016](../../core/urs.md#urs-br-016-drive-the-plugin-set-from-a-declarative-list), [URS-BR-021](../../core/urs.md#urs-br-021-know-who-changed-the-plugin-set-when-and-why)
> **Regulatory:** supports 21 CFR 11.10(e), Annex 11 §9 (through core attribution and audit)

```
REQUIREMENT: Applying a manifest MUST be exactly one call to
             `host.reconcile(desired, { scope: "federation:" + authority,
             prune: true, context })`, where `context.actor` is
             `{ kind: "service", id: "federation:" + authority }` and
             `context.reason` names the revision (and, when local patches
             were used, the patch author), and `context.correlationId` is
             derived from (authority, host, revision).
```

```
REQUIREMENT: A manifest MUST NOT list the federation plugin itself, nor any
             plugin it requires. Such an entry MUST be dropped with
             `ManifestRejected`-reason "self-reference" before reconcile;
             the rest of the manifest MUST still be applied.
```

```
REQUIREMENT: The revision MUST be recorded in the `ManifestStore` as the
             last applied revision only when `reconcile` returned a report.
             Rejected entries in the report MUST NOT prevent that record;
             they MUST be reported on `Federation.Status` and to the
             `StatusReporter`. When `reconcile` fails (`AuditUnavailable`,
             `HostClosed`, `Unattributed`, `ReasonRequired`), the last
             applied revision MUST stay unchanged and the apply MUST be
             retried at the next sync.
```

```
REQUIREMENT: An entry rejected for a transient reason — `Conflict`,
             `Superseded`, `DrainTimeout`, `WouldDeadlock`, or
             `OperationRejected` with reason "gate-timeout" or
             "gate-defect" — MUST be listed in `Federation.Status.pending`
             and MUST be retried at every sync, by the same reconcile of the
             last applied revision with a reason naming the retry, until it
             is applied or rejected for another reason. The same retry MUST
             run while any plugin owned by the federation scope matches a
             kill entry; each such plugin MUST be reported as
             `kill-pending { id, realm, reason }` until it is no longer
             installed. A gate refusal for any other reason is the gate's
             decision and MUST NOT be retried.
```

```
REQUIREMENT: Applies on one host MUST be serialized. A newer verified
             manifest arriving during an apply MUST be applied after it, and
             intermediate manifests superseded before their turn MUST be
             skipped.
```

```
REQUIREMENT: The apply MUST run in a fiber of the federation plugin, never
             inside its build or a finalizer.
```

Every change a manifest causes is therefore an ordinary core operation:
gated per entry ([25 — Operation gate](../../core/behaviors/25-operation-gate.md)),
recorded with a `requested` and a terminal record, under the federation
actor. A regulated consumer that must approve manifest changes wires a gate
that recognises the federation actor; the gate sees each entry's target,
version and digest as for any operator call. A verified manifest can be
previewed without applying it through core's read-only `Host.plan`
([BEH-BR-317](../../core/behaviors/32-generic-gate-and-plan.md)) over the
manifest's desired list, and an approved preview applied with
`reconcile(desired, { expect: plan })` (BEH-BR-319), which fails with
`PlanStale` and applies nothing if the host changed in between.

**Settled here.** (1) Excluding the federation plugin and its providers from
the manifest avoids a reconcile that would stop the plugin running it, which
core would refuse with `WouldDeadlock` at best. (2) "Applied" means
`reconcile` returned. An entry the gate refused on its merits is the gate's
decision, recorded by core, and repeating it would only repeat the refusal;
the authority sees it in the status report and issues a new revision. An
entry refused for a passing condition — a conflicting operation, a drain
that ran out, a gate that timed out — is retried, because the revision is
still what the authority wants and a kill must not wait for an unrelated
new revision. Re-running the same reconcile is safe: unchanged entries are
left alone (core [INV-BR-021](../../core/invariants.md#inv-br-021-reconcile-is-idempotent)).

---

_Next: [02 — Sync, offline and re-bootstrap](./02-sync-offline-and-rebootstrap.md)_
