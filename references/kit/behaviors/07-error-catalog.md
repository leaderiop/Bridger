# 07 — Error Catalog

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-KT-BEH-07                                            |
> | Revision       | 0.7                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.7 (2026-11-08): Rows `OutboxFrozen` and `IncarnationUnavailable` (event-delivery/06, /01); `RebootstrapBlocked` gains "kept-needs-in-store" and "no-incarnation-source"; `RevocationListStale` raised on an `offer` answer `NotNewer`; note on the federation status events `revocation-rejected`, `kill-held`, `rebootstrap-revision-mismatch` and remote `WireExit.InProgress` (round-2 integration) (CCR-KT-003)<br>0.6 (2026-11-08): Rows `RevocationListMalformed` (loader/04), `TaskStoreUnavailable` and `TaskLost` (command/07); `IdempotencyConflict` gains "definition-differs" and "mode-differs"; `CommandRefused` gains "long-in-batch"; taint-floor wording scoped to commands not declared `readOnly`; `PackageRefused` names "rollback" and "equivocation" for data packs; `SeriesConfigInvalid` gains "resume-and-continue" and "resume-mismatch"; `Revoked` names statement-digest revocation; `SignatureRejected` names "revocation-list" as never verified by `verify` (round-2 agent review) (CCR-KT-003)<br>0.5 (2026-11-08): Rows for the round 2 tags of command (`IdempotencyConflict`, `CommandBreakerOpen`, `CommandWrapperFailed`, `CommandDraftStale`, `CommandBatchRejected`, `CommandBatchRolledBack`, `CommandBatchPartial`, `CommandTaskNotFound`, `CommandTaskAwaitTimeout`, `ReceiptsUnavailable`, `WrapperError`), remote, federation and event delivery (`PlacementRefused`, `RemoteBudgetExceeded`, `RevocationListStale`, `RebootstrapBlocked`, `DowncastRefused`, `PayloadEncodeFailed`, `PayloadDecodeFailed`, `PayloadUnreadable`), event-store, sequence and keyring, and the React adapter's `InvalidContribution`; `CommandVetoed`, `ToolChanged` and `CommandRefused` rows updated; catalog rows only (CCR-BR-027)<br>0.4 (2026-11-08): Rows for the core tags `PolicyMismatch`, `AccessRefused`, `DigestRefused`, `CallLogUnavailable`, `InvalidCallEntry`, `ApplyRolledBack`, `PartialApply` (CCR-BR-024–026), the loader's `PublisherMismatch`, `StatementRevoked`, `SigningFailed`, `DataPackStale`, `DataPackStoreFailed`, the audit chain's `SeriesConfigInvalid`, `BundleExportFailed`; `EntitlementConfigError` row widened (round 2: recheck items 11–17; core alignment) (CCR-KT-003)<br>0.3 (2026-11-08): Agent, MCP and command tags added (R5-13 and the new tags of CCR-CM-002, CCR-MC-002, CCR-AG-002); taint floor in `CommandRefused`/`CommandDeferred` (CCR-KT-002)<br>0.2 (2026-11-08): Rows for the error tags of core files 26–34 and the companions; pending rows removed (CCR-KT-001)<br>0.1 (2026-11-08): Initial draft (CCR-KT-001) |

---

Every Bridger error is a `Schema.TaggedError` carrying identifiers and
messages ([ADR-BR-008](../../core/decisions/008-error-taxonomy.md)). A tag is
precise, and on its own it does not say what to do. The catalog gives every
tag of core, of the core seams added in parallel (files 26–34) and of the
companions one entry: where it comes from, why it happens, a typical example
and the fix. The human-facing version is
[docs/guides/error-catalog.md](../../../docs/guides/error-catalog.md). This
file owns BEH-KT-049–056 and uses BEH-KT-049–052; 053–056 are reserved.

Planned source: `packages/kit/src/catalog/ErrorCatalog.ts` *(Planned)*.

## BEH-KT-049: One entry per tag, as data

> **See:** [ADR-BR-008](../../core/decisions/008-error-taxonomy.md)

```ts
// illustrative — not type-checked
interface CatalogEntry {
  readonly tag: string
  readonly origin: string                                   // "core" | "core/26" … | "remote" | "loader" | "kit" …
  readonly kind: "error" | "port-error" | "record-only" | "defect"
  readonly raisedBy: readonly string[]
  readonly cause: string
  readonly example: string
  readonly fix: string
  readonly see: readonly string[]                           // specification identifiers
}
ErrorCatalog.entries: readonly CatalogEntry[]
ErrorCatalog.lookup(tag: string): Option.Option<CatalogEntry>
```

```
REQUIREMENT: `ErrorCatalog.entries` MUST contain exactly one entry for every
             tag in the table of ADR-BR-008, including the record-only tag
             `Interrupted`, every tag a core behaviour file 26–34 defines,
             and every tag a Bridger companion specification defines,
             including the kit's own. Entries MUST be sorted by origin, then
             tag.
```

```
REQUIREMENT: An entry MUST NOT quote a configuration value, and examples MUST
             use placeholder identifiers only.
```

## BEH-KT-050: Tooling prints the fix next to the tag

> **See:** [ADR-KT-001](../decisions/001-kit-is-sugar-and-tools-over-core.md)

```
REQUIREMENT: `it.plugin`, `bridger dev`, `bridger test` and `bridger check`
             MUST, when they report a failure carrying a catalogued tag,
             print the entry's `fix` and a link to its section of the
             human-facing catalog. An uncatalogued tag MUST be printed as
             "uncatalogued tag <tag>" and MUST fail the kit's own catalog
             test (REQ-KT-022).
```

## BEH-KT-051: The catalog is checked against the specifications

> **See:** [ADR-BR-008](../../core/decisions/008-error-taxonomy.md)

```
REQUIREMENT: A kit test MUST extract every tag from the ADR-BR-008 table and
             from every `Schema.TaggedError<…>()("<Tag>"` declaration in the
             Bridger specifications and sources, and MUST fail when a tag has
             no entry or an entry names a tag that no longer exists.
```

```
REQUIREMENT: The human-facing catalog MUST be generated from
             `ErrorCatalog.entries`; hand edits to it MUST fail the check.
```

## BEH-KT-052: The catalog, v0.1

> **See:** [ADR-BR-008](../../core/decisions/008-error-taxonomy.md)

```
REQUIREMENT: The catalog MUST contain at least the entries of the table
             below, one row per error tag that core files 01–34 and the
             companion specifications define; a tag added to any of them
             MUST be added here in the same change.
```

**Core — ADR-BR-008.**

| Tag | Kind | Raised by | Cause | Fix |
| --- | --- | --- | --- | --- |
| `DuplicatePlugin` | error | `install` | A plugin with this id is already registered in the realm | `replace` it, `remove` it first, or install into another realm |
| `DuplicateProvider` | error | `install`, `replace`, `enable` | Another plugin (or the base) already holds the provider slot for the key in this resolution scope | Remove or disable the other provider, isolate the key in a realm, or for several implementations use a registry and selector (BEH-BR-307) |
| `DependencyCycle` | error | `install`, `replace`, `enable`, child install | The definition would close a cycle of `requires` (`path` lists it) | Break the cycle: move the shared part into its own plugin, or make one edge `optional` |
| `InvalidDefinition` | error | `install`, `replace` | The definition is malformed (`reason`): bad id, duplicate key, key both required and provided | Use `definePlugin`, which reports most of these at compile time |
| `UnknownRealm` | error | `install`, `replace`, `use`, `useAll`, `lease` | The realm was never defined | Call `defineRealm` first |
| `ReplaceError` | error | `replace` | The new definition failed a definition check (`cause`); the running plugin is untouched | Fix the cause shown; nothing was stopped |
| `UnknownPlugin` | error | every operation on a ref; `bridger.host.inspect` (mcp/04) | No plugin with this id in this realm | Check the id and realm (`"id"` means the default realm) |
| `Conflict` | error | illegal operation pairs; child install after parent stop began | Another operation on the plugin is pending and this pair is illegal (ADR-BR-013) | Wait for the pending operation (`inspect(...).pending`) and retry |
| `Superseded` | error | an earlier caller | A later operation on the same plugin overtook this call | Usually expected; re-read state and decide again |
| `HostClosed` | error | every operation once shutdown begins | The host is shutting down or closed | Do not call the host after `shutdown`; in tests, check scope boundaries |
| `ConfigInvalid` | error | `reconfigure`; activation failure cause | The configuration did not decode; `message` names paths and expected forms | Correct the paths named; values are never shown |
| `CleanupError` | error | `remove`, `replace`, `restart`, `disable`, `reconfigure` | A finalizer failed while the plugin stopped; it ended `failed` (cleanup) | Fix the finalizer; the resource may be leaked; `retry` after fixing |
| `DrainTimeout` | error | `remove`, `replace`, `restart`, `disable`, `reconfigure`, `Generation` | Leases on `id` did not drain in time (`target` set when a dependent held them) | Find the long call (`bridger inspect`), raise `drain`, or use `force` knowing callers are interrupted |
| `WouldDeadlock` | error | stopping operations, `retry`, `enable`, `awaitIdle` | The call would wait for something its own lease or transition blocks (ADR-BR-016) | Do not stop your own provider from inside a call to it; fork the operation outside the lease |
| `IdleTimeout` | error | `awaitIdle` | The host did not become idle in time | Look at `pending` work in the attached snapshot; raise the timeout |
| `ServiceUnavailable` | error | `use`, `useAll`, `lease` | No active provider for the key | Check `bridger inspect <plugin>`; in tests add a provision |
| `LeaseRevoked` | error | forced revocation | A forced stop or drain interrupted the callback | Expected under `force`; make the callback's external write atomic |
| `LeaseTimeout` | error | per-call timeout | The callback exceeded its `timeout` | Raise the timeout or make the call shorter |
| `KeyMismatch` | error (cause) | activation failure cause | Two different key objects share one `ServiceId` | Usually two copies of a package; run `bridger check` |
| `AdmissionClosed` | error | `Generation.acquire`, `Generation.use` | The generation's owner closed admission | Acquire before closing, or from the new generation |
| `ActivationFailed` | error | `PluginHandle.awaitActive` | The plugin ended `failed` (`phase`, `message`) | Read `message`; fix and `retry` |
| `PluginRemoved` | error | `PluginHandle.awaitActive` | The plugin was removed while awaited | Expected if another caller removed it |
| `WaitTimeout` | error | `PluginHandle.awaitActive` | The plugin did not become active in time | Run `bridger inspect <plugin>` to see why it waits |
| `DuplicateRealm` | error | `defineRealm` | The realm already exists | Define each realm once |
| `DuplicateContribution` | error | `ContributionRegistry.add` | A contribution with this id exists in the registry | Use a unique id per contribution |
| `ContributionUnavailable` | error | `ContributionRegistry.use` | The contribution is gone or not yet added | Re-read the registry view |
| `Unattributed` | error | every mutating operation | `attribution.require` is set and no actor was supplied | Pass `{ context: { actor } }` |
| `ReasonRequired` | error | operations in `requireReason`; `acknowledgeAuditDegraded` | A reason is required for this operation | Pass `context.reason` |
| `AuditUnavailable` | error | every mutating operation except `shutdown` | The `requested` record could not be written, or the audit latch is set | Restore the sink; an operator acknowledges with `acknowledgeAuditDegraded` |
| `AuditWriteFailed` | port-error | `AuditSink.record` | The sink failed one write; never reaches an operation caller | Fix the sink; the host maps it to `AuditUnavailable` or the latch |
| `OperationRejected` | error | every mutating operation except `shutdown` (per entry for `reconcile`) | The `OperationGate` refused (`reason`) | Obtain the approval the gate requires |
| `ConfigFingerprintUnavailable` | error | `install` with config, `reconfigure` with a value | The wired `ConfigFingerprinter` failed, timed out or answered malformed | Fix the fingerprinter; nothing was changed or recorded |
| `ConfigFingerprintFailed` | port-error | `ConfigFingerprinter.fingerprint` | The port's own failure; never reaches a caller | Fix the port |
| `Interrupted` | record-only | `AuditRecord.error` only | The caller was interrupted after its `requested` record and before its intent | No action; the call changed nothing |

**Core seams (files 26–34).**

| Tag | Origin | Kind | Raised by | Cause | Fix |
| --- | --- | --- | --- | --- | --- |
| `IncompatibleContract` | core/26 | error | `install`, `replace`, `enable` | A dependent's range is not satisfied by its provider's provision, or methods are missing (BEH-BR-228) | Install a provider of a satisfying version, or widen the dependent's range only if it truly works with the older version |
| `NoPluginPrincipal` | core/28 | error | `CurrentPlugin.require` | Called outside plugin code | Call it only from plugin code, or use the non-failing form |
| `ChildNotAllowed` | core/28 | error | `Plugin.Runtime.install` | `allowChildren: false` or the `AccessPolicy` refused | Ask the integrator to allow children for this plugin |
| `PrincipalForged`, `PrincipalRetired` | core/28 | defect | acting with a principal | A principal value the host did not mint, or from an ended activation | Never store or construct principals |
| `ResolutionRefused` | core/29 | error | `use`, `useAll`, `lease` | The `CapabilityPolicy` refused the resolution (`reason`) | Ask for a grant for this key |
| `CapabilityDenied` | core/29 | defect | calling an ungranted member | The grant names members and this one is not among them | Ask for a grant that includes the member |
| `HookRegistrationRefused` | core/31 | error | hook registration | The application's admission rule refused the role | Register an advisory hook, or ask for the role |
| `NoImplementation` | core/31 | error | selector | The registry has no implementation for the site | Install an implementation, or change the selector |
| `IncompatibleEngine` | core/27 | error | `install`, `replace`, `enable` (definition checks) | The manifest's `engines["@bridger/core"]` range is not satisfied by this host's `Bridger.version` (`id`, `engine`, `range`, `actual`) | Use a core version inside the range, or rebuild the plugin against this core |
| `LoadFailed` | core/27 | error (cause) | activation of a lazy plugin, phase "load" | The lazy plugin's `load` failed, died or timed out (`id`, `message`); the plugin is `failed` with phase "load" and published nothing | Fix the code source or the loader, then `retry` (which loads again) |
| `ManifestMismatch` | core/27 | error (cause) | activation of a lazy plugin, phase "load" | The loaded definition differs from the registered manifest in `field` (id, version, digest, keys or contract references) | Register the matching manifest (`replace`) or load the code the manifest describes |
| `AccessDenied` | core/28 | defect | bus listen or emit, registry contribute, child mount | A wired `AccessPolicy` denied the request (`kind`, `subject`, `principal`, `reason`); nothing was registered | Ask the integrator to allow the access, or do not attempt it |
| `DuplicateAnnotationKey` | core/30 | defect | `Annotations.add` | Two annotation key objects with the same `id` in one bag, or a `bridger:` id not defined by core | Give each key a unique, namespaced id |
| `MonotonicAnnotation` | core/30 | defect | `Annotation.replace` | The key is declared `monotonic: true` (for example `Annotation.Taint`); its value can only be combined, never replaced (`id`) | Start new work from a fresh context only where the key's owner allows it; never strip a monotonic label |
| `PlanStale` | core/32 | error | `reconcile(desired, { expect: plan })` | The host changed since `Host.plan` produced the plan (`mismatches`), at the call or at its intent; nothing was applied | Run `Host.plan` again, have it approved, and apply the new plan |
| `RealmInUse` | core/33 | error | `Host.retireRealm` | The realm still has plugins installed (`id`, `plugins`) | Remove the plugins first; retirement never removes them |
| `FamilyMemberUnavailable` | core/33 | error | `Realm.family` use | The member realm for `key` could not be used (`reason`: rejected, failed, activation-timeout, options-changed, invalid-key, closed) | Act on the reason: `reset` a failed member, fix the key, or get the operation approved |
| `FamilyEvictionError` | core/33 | error | `family.evict`, `family.reset` | Eviction could not complete; carries the `DrainTimeout` or the reconcile rejection | Wait for the lease to end and evict again; eviction never forces |
| `HandoffError` | core/34 | error (plugin) | a definition's handoff `export`, `upgrade`, `import` | The plugin's own handoff step failed (`message`); export or decode failures give a cold start, an import failure fails the activation | Fix the handoff schema or `upgrade`; the `handoff` record names the lost step |
| `PolicyMismatch` | core/18 | error (entry) | `reconcile`, `Host.plan` (`rejected`) | The desired entry's `mandatoryInterceptions` or `allowChildren` differ from the installed registration's (`fields`) | Make the desired list state what is installed, or `replace` deliberately with the new policy |
| `AccessRefused` | core/28 | error | `AccessPolicy.ask` (companion buses) | The wired `AccessPolicy` refused a subscription, delivery or publication (`kind`, `subject`, `reason`, e.g. "principal-retired") | Declare the event in the manifest's `listens`, or change the application's access policy |
| `DigestRefused` | core/28 | record-only | `start-refused` system records | `RefusalList` refused a system start, background restart or child mount; the plugin is `disabled` with reason "refused-digest" | Expected for a revoked digest; `replace` with a definition the list does not refuse, or `remove` |
| `CallLogUnavailable` | core/29 | defect (in calls); error (`Host.offerCallEntry`) | recorded service calls under `onFailure: "refuse"`, `Host.offerCallEntry` | The call log could not take the entry (`why`: queue-full, record-failed, record-timeout, host-closing) | Restore the call-log store, raise `queue`, or choose "drop" for captures that may lose entries |
| `InvalidCallEntry` | core/29 | error | `Host.offerCallEntry` | An offered call-log entry is malformed (`message`) | Fill the entry's required fields (`kind`, `origin`, principal) as BEH-BR-280 states |
| `ApplyRolledBack` | core/32 | error | `reconcile(desired, { atomic: true })` | An entry failed (`failed`) and every applied entry was undone (`undone`) | Fix the failed entry's cause and run again; nothing stayed applied |
| `PartialApply` | core/32 | error | `reconcile(desired, { atomic: true })` | An entry failed and some undo actions could not run (`notUndone`, never retried); `reconcile-partial` is published | Resolve each `notUndone` entry by an operator call; read the reasons (`ChangedSinceApply`, `DrainTimeout`, gate, audit) |

**Companions.** Origin `event-delivery` is the companion package `@bridger/durable-bus` (its name is intent, not a claim).

| Tag | Origin | Kind | Raised by | Cause | Fix |
| --- | --- | --- | --- | --- | --- |
| `PackageMalformed` | loader | error | loading | Package paths or parts break BEH-LD-001 | Rebuild with `bridger pack` |
| `RemoteUnavailable` | remote/03 | error | calls through a link | No open session (ended, hold mode, an escaped reference); outcome not-executed | Wait for the session or use withdraw mode so dependents wait |
| `RemoteTimeout` | remote/03 | error | calls through a link | The call's deadline expired; outcome unknown or not-executed | Treat an unknown outcome as unknown; never retry blindly |
| `SessionLost` | remote/03 | error | calls through a link | The session ended with the call in flight; outcome unknown or not-executed | Reconcile the effect with the remote side before retrying |
| `StaleEpoch` | remote/03 | error | frames of another epoch | A frame carried another session's epoch; refused, outcome not-executed | None needed; the frame was discarded |
| `RemoteRevoked` | remote/03 | error | calls through a revoked link | The link was revoked at the boundary | Expected after revocation; remove or replace the link |
| `RemoteBusy` | remote/03 | error | calls through a link | `maxInFlight` reached; outcome not-executed | Retry later or raise `maxInFlight` |
| `WireDecodeError` | remote/01 | error | calls through a link | A payload or reply does not decode with the contract | Align contract versions; run conformance |
| `RemoteDefect` | remote/03 | error | calls through a link | The guest handler died or failed outside the contract; outcome executed | Fix the guest; the call may have had effects |
| `TokenInvalid` | remote/06 | error | guest callbacks | The call token is unknown, of another call or of another epoch | Use only the token of the call in progress |
| `TokenExpired` | remote/06 | error | guest callbacks | The call token's call has ended or its expiry passed | Make callbacks within the call |
| `TransportError` | remote/07 | port-error | transport adapters | The adapter failed (`adapter`, `message`) | Fix the adapter or its environment |
| `TransportClosed` | remote/07 | port-error | transport adapters | The adapter's channel closed (`adapter`, `reason`) | Expected on shutdown; otherwise a partition handled by the link |
| `ManifestRejected` | federation/01 | error | manifest apply | A received host manifest is not applied: signature refused, wrong host or authority, revision regressed, undecodable | Nothing to do locally; the host keeps its applied state; check the authority |
| `ManifestUnavailable` | federation/02 | error | manifest source | The authority could not be reached; never fatal | None; the host runs its last confirmed state within the offline cap |
| `IncompatiblePeer` | federation/03 | error | link skew handshake | No federation protocol version common to both sides inside the window, or not a declared peer | Upgrade one side into the N/N−1 window |
| `ExportConflict` | federation/04 | error | single-owner exports | Two owners present the same fence for one export | Let the authority issue a new fence; reconcile effects |
| `StaleExport` | federation/04 | error | single-owner export calls | An owner presents a fence lower than the highest the importer has seen | Route to the current owner |
| `ResyncRequired` | federation/02 | error | manifest sync | The authority or the offline cap demands a snapshot re-bootstrap | Re-bootstrap from a snapshot |
| `EncodeFailed` | event-delivery/02 | error | `publish` | The payload does not encode with the event's schema (`type`, `issue`) | Fix the payload |
| `OutboxWriteFailed` | event-delivery/02 | error | `publish` | The adapter could not write in the caller's transaction, which fails with it | Fix the storage adapter or the transaction use |
| `DeliveryFailed` | event-delivery/03 | error | relay | A batch could not be delivered; retried by the relay | None; delivery is retried |
| `EnvelopeConflict` | event-delivery/03 | error | inbox | One (origin, stream, sequence) seen with two event ids; parked | Investigate the origin; give a restored store a new incarnation |
| `UnknownEventVersion` | event-delivery/01 | error | inbox decode | The envelope's version is newer than known, or older than the upcasters reach | Upgrade the receiver or add upcasters |
| `UpcastFailed` | event-delivery/01 | error | inbox decode | An upcaster failed (`type`, `from`); parked | Fix the upcaster and replay the parked envelope |
| `DecodeFailed` | event-delivery/03 | error | inbox decode | A payload does not decode after upcasting; parked | Fix the schema or upcaster and replay |
| `SnapshotRequired` | event-delivery/03 | error | subscription | A subscriber's cursor predates the source's retained history | Re-bootstrap the subscriber from a snapshot |
| `ClockSkewExceeded` | event-delivery overview | error (reported) | inbox | A received hybrid logical clock is ahead of the local clock by more than `maxDrift`; the envelope is still received | Synchronise clocks |
| `FetchFailed` | loader/02 | error | `fetch` | The package could not be fetched (or timed out) | Retry later or fix the source |
| `UnsupportedDigestAlgorithm` | loader/01 | error | digest check | The digest names an algorithm the loader does not accept | Repack with a supported algorithm |
| `DigestMismatch` | loader/01 | error | digest check before evaluation | The computed digest of a `part` differs from the expected one | Do not load it; obtain the published package |
| `ManifestMismatch` (loader) | loader/01 | error | package checks | The package's manifest disagrees with what the catalog or definition declares (distinct from core's `ManifestMismatch`) | Republish a consistent package |
| `PackageRefused` | loader/01, loader/08 | error | acceptance rule; data-pack load | A package predicate refused the package (`predicate`, `reason`); for a data pack, predicate "schema-id", "rollback" (lower version) or "equivocation" (same version, different digest) | Rebuild the package within the rules; publish a data-pack correction as a new version |
| `SignatureRejected` | loader/02, loader/07 | error | `SignaturePolicy.verify` (loads, catalog, data packs, other statements) | The signatures do not satisfy the statement type's rule, the verifier timed out, or the type has no rule ("no-rule"; always for "revocation-list", which only the revocation source verifies) | Obtain the missing signatures (`bridger countersign`), or configure a rule for the type; hand revocation lists to `RevocationSource.offer` |
| `Revoked` | loader/02 | error | revocation check of a package | The digest, the package statement's digest or a signer is in the revocation set (`by`: digest, statement-digest, signer; other statement types report `StatementRevoked`) | Use a non-revoked release |
| `RevocationUnavailable` | loader/04 | error | revocation source | The revocation set could not be read | Restore the channel; new loads wait or are refused by policy |
| `RevocationListMalformed` | loader/04 | error | `RevocationSet.decode` (inside `offer`) | A verified revocation-list payload is not the `bridger-revocation-set/v1` shape, has a non-positive revision or repeated keys; the offer is `Rejected` ("malformed") | Ask the list issuer to re-issue the list with `RevocationSet.encode` |
| `RevocationStale` | loader/02 | error | revocation check | The revocation set is older than `maxAge`; new loads are refused | Refresh the revocation set |
| `EvaluationFailed` | loader/02 | error | evaluation after verification | The verified module failed to evaluate | Fix the module |
| `AnchorFailed` | audit-chain/02 | port-error | `Anchor.publish` | The anchor adapter failed (`anchor`, `message`) | Restore the anchor; records keep being chained |
| `ReceiptStoreFailed` | audit-chain/02 | port-error | `ReceiptStore.put` | Storing an anchor receipt failed | Fix the receipt store |
| `EntitlementUnavailable` | entitlement/01 | port-error | `Entitlement` port | The entitlement service could not answer (`pluginId`, `message`); handled by the configured unavailability policy | Restore the service; essential uses still pass |
| `NotEntitled` | entitlement/02 | error | `Entitlement.guard` | The plugin's mode does not allow this use and the use carries no essential label | Renew, or label the use essential if it must always run |
| `BudgetExhausted` | entitlement/03 | error | `Budget.reserve` | A budget limit would be exceeded | Wait for the window, raise the limit, or release reservations |
| `BudgetUnavailable` | entitlement/03 | error | `Budget.reserve` | The budget ledger could not be read | Restore the ledger |
| `CallbackDenied` | remote/06 | error | guest callbacks | The callback was refused at the host boundary (`link`, `contract`, `method`, `reason`: not-granted, invocation-ended, or the admission's reason); nothing was resolved | Make the callback within the call, or ask the integrator for a grant or an admission rule that covers it |
| `MethodNotServed` | remote/03 | error | calls through a link | The far end serves the contract but not this method (`link`, `method`); outcome not-executed | Align contract versions, or serve the method on the far end |
| `NotAPluginDefinition` | loader/02 | error | evaluation after verification | The export the manifest names is missing or is not a plugin definition | Export the definition under the name the manifest gives |
| `LoadLogFailed` | loader/02 | error | load pipeline | A wired `LoadLog` could not record the `accepted` record; the code is not evaluated | Restore the load log; then load again |
| `CatalogEntryRejected` | loader/05 | error | catalog entry verification | A catalog entry failed verification (carries the cause's tag: `DigestMismatch`, `SignatureRejected`, `Revoked`, `RevocationStale`, `RevocationUnavailable`, or a manifest decode error) | Act on the carried cause; the entry is not offered |
| `NoMatchingEntry` | loader/05 | error | catalog `resolve` | No verified entry satisfies the id and range, or two entries share an id and version with different digests ("ambiguous") | Publish a matching version, or remove the duplicate entry from the feed |
| `EntitlementConfigError` | entitlement/02, entitlement/04 | error | `EntitlementGate.piece`, `EntitlementGate.layer`, `Entitlement.capabilityPolicy`, `ReadOnly.fromContracts`, `ReadOnly.fromServices`, `Policies.first` | A construction rule is broken (`component`, `reason`): `checkTimeout` not shorter than the piece's `timeout`, the stated `gateTimeout` or `resolutionTimeout`; `readOnly`, `onUnclassified` or `onNone` missing; a classified name that is not a method of its contract, or a contract or key listed twice; a reserving budget bundle not last in `Policies.first` | Fix the option the `reason` names: shorten `checkTimeout`, state the missing option, correct the classification, or list the budget bundle last |
| `HistoryUnavailable` | event-delivery/06 | error | history read | A history read could not be served (`source`, `cause`); the follower backs off | Restore the history source; the follower retries |
| `KeyedHashFailed` | audit-chain/01 | port-error | `KeyedHasher.mac` | The keyed-hash adapter failed; the sink maps it to `AuditWriteFailed` | Restore the hardware module or key service behind the port |
| `PublisherMismatch` | loader/07 | error | `SignaturePolicy.verify`, loads, catalog entries, data packs | The manifest's `publisher` is matched by no verified signer's configured `publishers` or `identity`; nothing is evaluated | Sign with a key configured for that publisher, or correct the manifest's `publisher` |
| `StatementRevoked` | loader/07 | error | `SignaturePolicy.verify` (statement types other than "package"), `Revocation.check`, `DataPacks` | The statement's subject digest, statement digest or a signer it depended on is revoked (`by`, `revision`) | Obtain a statement that is not revoked (a new issuance or release); packages report `Revoked` instead |
| `SigningFailed` | loader/07 | port-error | `StatementSigner.sign`; `bridger publish`, `bridger countersign` | The signing adapter (KMS, hardware token, keyless flow) failed (`scheme`, `message`); no signature was added | Fix the signer adapter or its access; the package and its digest are unchanged |
| `DataPackStale` | loader/08 | error (also a report) | `DataPacks.status` (reported), `DataPacks.requireFresh` (failure) | The pack is older than its `maxAge` since `issuedAt`, or past `effectiveUntil` (`reason`) | Load a newer pack; whether stale data may be used is the application's decision |
| `DataPackStoreFailed` | loader/08 | port-error | `DataPackStore` | The application's data-pack store failed (`operation`); an unsaved pack is not published | Fix the store; the current pack is unchanged |
| `SeriesConfigInvalid` | audit-chain/04 | error | `ChainSink.make` (construction) | A series spec is refused (`reason`: series-id-syntax, canonicaliser-id-syntax, continues-from-self, resume-and-continue, resume-mismatch) | Correct the series id, canonicaliser id, `continuesFrom` or `resumeFrom` (use the store's head) |
| `BundleExportFailed` | audit-chain/05 | error | `exportBundle` | The chain store or receipt store could not be read, the series is unknown, or the range is invalid (`reason`); no partial bundle is produced | Fix the store access or the requested range and export again |
| `RebootstrapFailed` | federation/02 | error | snapshot re-bootstrap | The re-bootstrap from a snapshot failed; the applied manifest stays in force and links stay suspended | None locally; it is retried at the next sync. Check the authority's snapshot |
| `CommandNotFound` | command/02 | error | dispatch | No command with this `id` in the catalog | Check the catalog |
| `CommandInputInvalid` | command/02 | error | dispatch | The input does not decode with the command's schema (`issues`) | Fix the input |
| `CommandOutputInvalid` | command/02 | error | dispatch | The handler's output does not match the command's schema | Fix the handler |
| `CommandRefused` | command/02 | error | dispatch | The effective gate refused (`reason`), or the taint floor withheld an automatic allow of a command not declared `readOnly` with no draft source ("tainted-session"), or a gate or draft source failed ("gate-defect", "gate-timeout"), or the receipt store failed ("receipts-unavailable"), or a batch draft or version reader is missing ("no-batch-draft-source", "no-version-reader"), or a `long` command was put in `Commands.batch` ("long-in-batch", command BEH-CM-049) | Obtain the approval the gate requires; wire a draft source for tainted sessions |
| `CommandDeferred` | command/02 | error | dispatch | The gate deferred, or the taint floor turned an automatic allow of a command not declared `readOnly` into a draft; carries `draftId` for approval | Approve the draft and dispatch again with the approval reference |
| `CommandVetoed` | command/02 | error | dispatch | A `before` hook point denied (`cause`: veto, hook-failed, hook-timeout, breaker-open, deadline, denied-policy, dormant, wake-failed, wake-timeout, no-host-link, target-failed; `hook`, `code`, `reason` when present) | Act on the cause: a veto code, a policy reason, an outage, or `CommandCatalog.attach` for "no-host-link" |
| `CommandTimeout` | command/02 | error | dispatch | The handler exceeded its timeout (`after`) | Make the handler shorter or raise the timeout |
| `CommandSchemaNotProjectable` | command/01 | error | command registration | The command's schema cannot be projected to JSON Schema 2020-12 | Use a projectable schema |
| `ToolNotInToolset` | command/02 | error | dispatch from a pinned toolset | The command is not in the caller's pinned toolset (`toolsetRevision`) | Use only offered tools |
| `ToolChanged` | command/02 | error | dispatch from a pinned toolset or with `expectDigest` (an MCP call checks the digest the session listed); re-dispatch with an `ApprovalRef` | The command's digest changed since the toolset was pinned or the draft was made (`expected`, `actual`) | Re-pin or list again; re-plan a draft |
| `ApprovalMismatch` | command/02 | error | re-dispatch with an `ApprovalRef` | The approval reference was made for another input (`expected`, `actual` input digests); checked before the gate | Dispatch exactly the input that was approved, or have the new input approved |
| `McpSessionRefused` | mcp/01 | error | MCP server session | The server refused the session (`reason`) | Authenticate the client as the application requires |
| `JsonSchemaUnsupported` | mcp/03 | error | `McpClient.import` (per tool) | An external tool's schema could not be compiled, declares a dialect other than 2020-12, or has a non-object root (`tool`, `reason`); the tool is excluded | Ask the server's owner for a 2020-12 object schema, or serve the tool through your own reviewed command |
| `ImportedToolFailed` | mcp/03 | error | an imported command's handler | The external server answered the call with an error (`tool`, `message`, untrusted text) | Read the message as data; retry only if the external tool is known to be safe to repeat |
| `DefinitionUnresolved` | mcp/04 | error | `bridger.host.reconcile-plan`, `reconcile-apply` | The application's `DefinitionResolver` could not resolve a desired entry (`id`, `realm`, `reason`) | Use a name and version the resolver knows, or add it to the resolver |
| `PlanUnknown` | mcp/04 | error | `bridger.host.reconcile-apply` | The `planId` was never issued by this host-tools activation, expired, was evicted, or was forgotten by a restart (`reason`) | Run `reconcile-plan` again and have the new plan approved |
| `ModelError` | agent/01 | port-error | model adapter | The model call failed (`kind`: unavailable, rate-limited, invalid-request, timeout, other) | Back off or fix the request |
| `AgentStepLimit` | agent/01 | error | `AgentLoop` (task outcome) | A turn reached `maxSteps` (`steps`); the task is `failed` | Split the work, raise `maxSteps` deliberately, or fix a looping prompt |
| `SessionNotFound` | agent/01 | error | `SessionStore.read`, `AgentLoop.start` | No session with this id in the store (`sessionId`) | Start a new session or check the id |
| `StoreError` | agent/01 | port-error | `SessionStore`, `MemoryStore` | The application's store failed (`store`, `message`) | Fix the store; nothing was appended |
| `TaskNotFound` | agent/02 | error | `Tasks`, `AgentLoop.resume`, `cancel` | No task with this id (`taskId`); tasks live for the host's life | Check the id; a task does not survive a restart in v0.1 |
| `TaskNotResumable` | agent/02 | error | `AgentLoop.resume`, task events | The event does not apply to the task's state (`taskId`, `state`), for example an approval for a cancelled task | Re-read the task; start a new one if it ended |
| `TaskAwaitTimeout` | agent/02 | error | `Tasks.await` | No requested state was reached within the timeout (`taskId`, `last`); the task is unaffected | Await again, or raise the timeout |
| `TaintDraftStoreError` | agent/03 | port-error | `TaintDraftStore.create` | The application's approval store could not record a draft (`message`); the tainted call is refused with "gate-defect" | Fix the approval store |
| `SubagentFailed` | agent/04 | error | `SubagentHandle.result` | The subagent did not finish (`taskId`, `reason`: parent-ended, failed, cancelled) | Read the subagent's task; re-spawn in a new turn if needed |
| `SubagentToolNotInParent` | agent/04 | error | `Agent.spawnSubagent` | A requested tool is not in the parent's pinned toolset (`tool`); no realm was created | Request only tools the parent turn holds |
| `SubagentParentUnattributed` | agent/04 | error | `Agent.spawnSubagent` | The parent actor is unattributed, the system actor or a reserved id, which `Actor.narrow` refuses (`actorKind`) | Run the parent under a named actor |
| `ReplayDiverged` | agent/05 | error | `ReplayModel` on `TestHost` | A replayed run differed from its recording at element `index` (`expected`, `actual` digests) | Inspect the change at that call; re-record only if the change is intended |
| `ScriptMismatch` | agent/05 | error | agent test script | A scripted model step did not match (`step`, `reason`: expect-failed, script-exhausted) | Fix the agent or the script |
| `IdempotencyConflict` | command/06 | error | dispatch with `idempotencyKey` | The key's receipt was made by another actor, for another input or another definition digest, in the other mode (value vs task), a dispatch under the key is still running, or no `CommandReceipts` is wired (`reason`: actor-differs, input-differs, definition-differs, mode-differs, in-flight, no-receipts) | Use a new key for new data or after the definition changed; retry later for in-flight; wire receipts or drop the key |
| `TaskStoreUnavailable` | command/07 | error | `CommandTaskStore` port | The task store failed; a `put` failure is logged and changes no outcome, a failure while reading at layer build fails the layer | Check the application's store |
| `TaskLost` | command/07 | error | failed task (BEH-CM-054) | A task was found running when the catalog layer was built; its work was cut off by a restart | Retry with the same key to run it again |
| `CommandBreakerOpen` | command/06 | error | dispatch | The breaker for the command or its providing plugin is open (`scope`, `key`); no handler ran | Wait for the cooldown; fix the failing handler or backend |
| `CommandWrapperFailed` | command/06 | error | dispatch (step 7) | A handler wrapper failed, did not call `run`, or the receipt could not be completed (`wrapper`, `message`) | Fix the wrapper or its store; a transaction wrapper rolled back |
| `CommandDraftStale` | command/07 | error | re-dispatch or batch with an approval carrying expected versions | `Draft.check` found versions that moved (`draftId`, `mismatches`); nothing ran | Re-plan and have the new draft approved |
| `CommandBatchRejected` | command/07 | error | `Commands.batch` | An item failed admission (`batchId`, `index`, `error`); no handler ran | Fix or remove the item |
| `CommandBatchRolledBack` | command/07 | error | `Commands.batch` | An item failed after earlier items ran; every earlier item was undone by an atomic wrapper or compensation (`failed`, `undone`) | Fix the failing item and submit the batch again |
| `CommandBatchPartial` | command/07 | error | `Commands.batch` | An item failed and some earlier items could not be undone (`failed`, `undone`, `notUndone`); never retried | Resolve each `notUndone` item by hand or with its compensation |
| `CommandTaskNotFound` | command/07 | error | `CommandTasks` | No task with this id (`taskId`); terminal tasks beyond `tasks.retain` are forgotten and tasks do not survive the process | Check the id |
| `CommandTaskAwaitTimeout` | command/07 | error | `CommandTasks.await` | The task did not end within the timeout (`taskId`, `last`); the task is unaffected | Await again, or raise the timeout |
| `ReceiptsUnavailable` | command/06 | port-error | `CommandReceipts` | The application's receipt store failed (`message`); a failed claim refuses the dispatch ("receipts-unavailable") | Fix the store |
| `WrapperError` | command/06 | port-error | a handler or batch wrapper | The application's wrapper reported a failure (`message`); surfaced as `CommandWrapperFailed` | Fix the wrapper |
| `PlacementRefused` | remote/09 (also federation/06, event-delivery/02) | error | `Remote.define` (link build), served calls, imports and exports, event destinations | A required residency label is not offered by the transport, route or inbox (`subject`, `required`, `offered`, `reason`) | Use a transport, route or inbox that offers the label, or correct the manifest; the label is compared as a string and proves nothing about where code runs |
| `RemoteBudgetExceeded` | remote/09 | error | calls through a link | `PrincipalBudget.admit` refused, or failed (`link`, `reason`); outcome not-executed, no frame sent, a "refusal" call-log entry offered | Wait for the budget window, or raise the principal's budget |
| `RevocationListStale` | federation/06 | error | `kill` frame handling | A revocation list in a `kill` frame is not newer than the held list: `RevocationSource.offer` answered `NotNewer` (`revision`, `held`, `from`); not applied, not relayed; `revocation-stale` event. A list `offer` answers `Rejected` is reported as the status event `revocation-rejected`, not as this tag. Distinct from the loader's `RevocationStale` | No action for a duplicate; investigate a peer that keeps sending older lists |
| `RebootstrapBlocked` | federation/02 (raised by event-delivery `rebootstrapOutbox`) | error | re-bootstrap step 1 | The outbox could neither push nor keep local facts (`pending`, `reason`: outbox-unsettled, outbox-unavailable, no-outbox-port, kept-needs-in-store for "pushed-or-kept" with a whole-store install, no-incarnation-source for a whole-store install without an `IncarnationSource`, event-delivery/06 BEH-DB-048); nothing fetched or installed, links resumed, status `rebootstrap-blocked`, retried next sync | Restore delivery so the outbox settles; wire an outbox port if none is configured; wire an `IncarnationSource` or install in store |
| `OutboxFrozen` | event-delivery/06 (BEH-DB-048) | error | `publish` | A whole-store re-bootstrap holds the outbox frozen from the end of the first drain phase until its settlement's scope closes (`reason`); nothing is written and the caller's transaction fails with it | Retry the publish after the re-bootstrap ends |
| `IncarnationUnavailable` | event-delivery/01 (BEH-DB-004) | port-error | `IncarnationSource.current`, `IncarnationSource.raise` | The application's incarnation source could not be read or raised (`cause`); a whole-store install that cannot raise it fails | Fix the incarnation source's storage, which lives outside the store's backups |
| `DowncastRefused` | event-delivery/04 | error | `publish` under `publishVersion` | A value at N does not survive the N→N−1→N round trip (`type`, `from`, `reason`); nothing is written | Leave the new field empty until readers are upgraded, or raise `publishVersion` once reports show no reader below N |
| `PayloadEncodeFailed` | event-delivery/01 | error | `publish`, event-store `append` | The `PayloadCodec` could not encode the payload; nothing is written | Fix the codec's dependency (for example the key store), or stop publishing for that subject |
| `PayloadDecodeFailed` | event-delivery/01 | error | reading envelopes, event-store reads | The `PayloadCodec` could not decode the payload, or the reader lacks the envelope's `codec`; handled under the subscription's `onPoison` (event-store: the read ends, BEH-ES-032) | Wire the codec named in `Envelope.codec` on the reader |
| `PayloadUnreadable` | event-delivery/01 | error | reading envelopes | The codec can no longer read the payload (for example its key was destroyed); the envelope is parked for that subscription and the stream is not halted | Expected after a deliberate key destruction; otherwise restore the key store |
| `WrongExpectedVersion` | event-store/01, event-store/05 | error | `Stream.append`, `Aggregate.handle`, sequence `next()` | The stream's version was not the expected one (`stream`, `expected`, `actual`; "unknown" when the adapter detects the conflict only at commit); nothing is written | Read the stream again and decide again; `Aggregate.run` retries |
| `DuplicateEventType` | event-store/01 | error | `EventStore.register` | An event type with this id is already registered with the store (`type`) | Register each event type once |
| `UnregisteredEventType` | event-store/01 | error | `Stream.append` | The event's type was not registered with the store (`type`); nothing is written | Register the type with `EventStore.register` first |
| `StoreWriteFailed` | event-store/05 | error | `Stream.append`, checkpoint writes, the `EventStoreAdapter` | The storage adapter could not write (`message`); the transaction rolls back | Fix the storage; nothing was appended |
| `StoreUnavailable` | event-store/05 (also federation/02) | error | `Stream.read`, `EventStoreAdapter.transact`, `readStream`; the federation store port | The storage adapter could not be reached or read (`message`) | Restore the storage and retry |
| `StoreContention` | event-store/02 | error | `Aggregate.record`, `Aggregate.run` | Appends kept conflicting past `retries`; an operational error, never a refusal of a fact | Retry later; split the stream if it is hot by design |
| `ProjectionFailed` | event-store/03 | port-error | a projection's `apply` or `reset` | The application's projection failed; the batch rolls back, is retried with backoff and then the projection halts at that position, never skipping | Fix the projection or its table; the follower resumes from the checkpoint |
| `NotOwner` | sequence/01 | error | `Series.open` | The origin is not this host's configured origin (`origin`, `configured`); only closure of a superseded series by a later incarnation is allowed | Open series only for the host's own origin |
| `SeriesNameInvalid` | sequence/01 | error | `Series.open` | The series name is outside the grammar (`name`) | Use a name that matches the grammar |
| `SeriesClosed` | sequence/01 | error | `next()`, `close` | The series is closed (`seriesId`, `last`); no number is issued after closure (also the name of the closing event) | Open the series of the current incarnation |
| `KeyShredded` | keyring/01 | error | `Keyring.key`, `encrypt`, `decrypt`, the field codec's encode | The subject has a tombstone; no key is given out and nothing is encrypted for it | Stop writing personal data for that subject; reads yield `Shredded` markers |
| `KeyStoreUnavailable` | keyring/01 | error | `Keyring.key`, `encrypt`, `decrypt`, `shred` | The application's key store could not be reached (`message`) | Restore the key store; nothing was encrypted or destroyed |
| `SubjectInvalid` | keyring/01 | error | `Keyring.key`, `shred` | The subject id is not 1–128 characters of `[A-Za-z0-9._:/-]` (`reason`) | Use an opaque id; the subject id stays readable after a shred |
| `DecryptFailed` | keyring/01 | error | `decrypt`; the field codec's decode (as `PayloadDecodeFailed`) | The ciphertext, nonce, key id or authenticated data does not match | Do not move ciphertext between fields, types or subjects; check the stored form |
| `RedactionFailed` | keyring/03 | port-error | a callback registered with `Keyring.onShred` | The application's redaction of plaintext copies failed; the shred stays pending for that callback | Fix the callback; it is retried from its own cursor |
| `DuplicateCallback` | keyring/03 | error | `Keyring.onShred` | A redaction callback with this name is already registered | Give each callback a unique name |
| `SubjectFromEncryptedField` | keyring/02 | defect | `Keyring.fields` (construction) | A `FieldSpec`'s subject function reads a path listed for encryption | Read the subject from an unencrypted field |

Federation status events are not error tags and have no row: `revocation-rejected` (a kill frame's list that `RevocationSource.offer` answered `Rejected`), `kill-held` (a revision that would disable more owned plugins than `maxDisabledPerRevision` allows, held until `releaseRevocation`) and `rebootstrap-revision-mismatch` (the installed snapshot's revision differs from the applied manifest's) are reported on the federation status feed (federation BEH-FD-015). Remote `WireExit.InProgress` (BEH-RM-020) is not a tag either: a call that reaches its deadline after it fails with `RemoteTimeout`, outcome "unknown".

**Adapters (outside this specification).** Tags of adapters documented in `docs/`, not in a companion tree; proposed, not specified.

| Tag | Origin | Kind | Raised by | Cause | Fix |
| --- | --- | --- | --- | --- | --- |
| `InvalidContribution` | @bridger/react (proposed; docs/REACT-UI-PLUGINS.md) | error | `Ui.messages`, `Ui.theme` | A message catalog or theme token set did not decode (non-string values, malformed locale tag); nothing was registered | Contribute string values and a BCP 47 locale tag |

**Kit.**

| Tag | Kind | Raised by | Cause | Fix |
| --- | --- | --- | --- | --- |
| `MissingProvision` | error | `PluginTest.mount` | The subject stayed `waiting`: `missingServiceIds` have no provision | Add a `PluginTest.stub` for each, or pass `allowWaiting` |
| `StubNotImplemented` | defect | a `PluginTest.partial` double | The test reached a member the double does not implement | Implement the member in the partial, or use `PluginTest.stub` |
| `CaseFailed` | error | a conformance case | One case's assertion failed | Read the case id and message |
| `ConformanceFailed` | error | `Conformance.verify` | At least one executed case failed (`failed` ids) | Fix the provider; the report is on the error |
| `SuiteVersionMismatch` | error | `Conformance.verify` | No given suite matches the provided major, or the subject provides no version | Pass the suites of the provided major |
| `DuplicateDependencyCopy` | error | `bridger check` | Two physical copies of `effect` or `@bridger/core` are reachable | Deduplicate dependencies (one version, hoisted) |
| `ContractBreakingChange` | error | `bridger check` | A change BEH-BR-230 forbids within a major | Release under a new major (new `ServiceId`) or revert the change |
| `ContractVersionNotBumped` | error | `bridger check` | An additive change without a minor bump | Bump the minor version |
| `SdkDecodeFailed` | error | Promise SDK runtime | A payload or a handler result does not match the contract schema (`side`) | Fix the caller's payload or the handler's result |
| `SdkUndeclaredFailure` | error | Promise SDK runtime | A handler threw something other than a generated `ContractError` | Throw a declared error, or handle the exception; see `onUnexpected` |
| `PublishFailed` | port-error | `PublishTarget.upload` | The registry adapter refused or failed | Read the adapter's message; the package is unchanged |

---

_Previous: [06 — Devtools inspector](./06-devtools-inspector.md)_ · _Next: [08 — Required acceptance checks](./08-required-acceptance-checks.md)_
