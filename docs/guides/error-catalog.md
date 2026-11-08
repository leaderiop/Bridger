# Error catalog

Status: **prospective — nothing here is implemented.** This page is the human-facing form of
[kit BEH-KT-052](../../references/kit/behaviors/07-error-catalog.md#beh-kt-052-the-catalog-v01). When the kit exists it will be generated from
`ErrorCatalog.entries`; until then it is maintained from that table. Every error carries identifiers and a
message, never a configuration value ([ADR-BR-008](../../references/core/decisions/008-error-taxonomy.md)).

Kinds: **error** — a typed error a caller can catch with `Effect.catchTag`; **port-error** — the error of a port you implement, never seen by an operation caller; **record-only** — appears only in an audit record; **defect** — a programming error, not a typed error.

Origin `event-delivery` is the companion package `@bridger/durable-bus` (its name is intent, not a claim).

## Core

### DuplicatePlugin

*error* · origin: core · raised by: `install`

- **Cause.** A plugin with this id is already registered in the realm.
- **Example.** `host.install(logger)` twice in the default realm.
- **Fix.** `replace` it, `remove` it first, or install into another realm.

### DuplicateProvider

*error* · origin: core · raised by: `install`, `replace`, `enable`

- **Cause.** Another plugin (or the base) already holds the provider slot for the key in this resolution scope.
- **Example.** Two plugins both list `Logger` in `provides` in the same realm.
- **Fix.** Remove or disable the other provider, isolate the key in a realm, or for several implementations use a registry and selector (BEH-BR-307).

### DependencyCycle

*error* · origin: core · raised by: `install`, `replace`, `enable`, child install

- **Cause.** The definition would close a cycle of `requires` (`path` lists it).
- **Example.** `a` requires `B` provided by `b`, which requires `A` provided by `a`; `path` is `["a","b","a"]`.
- **Fix.** Break the cycle: move the shared part into its own plugin, or make one edge `optional`.

### InvalidDefinition

*error* · origin: core · raised by: `install`, `replace`

- **Cause.** The definition is malformed (`reason`): bad id, duplicate key, key both required and provided.
- **Example.** A hand-written definition with `id: ""`.
- **Fix.** Use `definePlugin`, which reports most of these at compile time.

### UnknownRealm

*error* · origin: core · raised by: `install`, `replace`, `use`, `useAll`, `lease`

- **Cause.** The realm was never defined.
- **Example.** `host.install(repo, { realm: "tenant-a" })` before `defineRealm("tenant-a", …)`.
- **Fix.** Call `defineRealm` first.

### ReplaceError

*error* · origin: core · raised by: `replace`

- **Cause.** The new definition failed a definition check (`cause`); the running plugin is untouched.
- **Example.** `host.replace(newGreeter)` where the new definition provides a key another plugin holds.
- **Fix.** Fix the cause shown; nothing was stopped.

### UnknownPlugin

*error* · origin: core · raised by: every operation on a ref; `bridger.host.inspect` (mcp/04)

- **Cause.** No plugin with this id in this realm.
- **Example.** `host.remove("example/loger")` (typo).
- **Fix.** Check the id and realm (`"id"` means the default realm).

### Conflict

*error* · origin: core · raised by: illegal operation pairs; child install after parent stop began

- **Cause.** Another operation on the plugin is pending and this pair is illegal (ADR-BR-013).
- **Example.** `host.enable("x")` while a `remove("x")` is still pending.
- **Fix.** Wait for the pending operation (`inspect(...).pending`) and retry.

### Superseded

*error* · origin: core · raised by: an earlier caller

- **Cause.** A later operation on the same plugin overtook this call.
- **Example.** A `restart("x")` overtaken by a later `remove("x")`.
- **Fix.** Usually expected; re-read state and decide again.

### HostClosed

*error* · origin: core · raised by: every operation once shutdown begins

- **Cause.** The host is shutting down or closed.
- **Example.** A background fiber calls `host.use(...)` after the scope closed.
- **Fix.** Do not call the host after `shutdown`; in tests, check scope boundaries.

### ConfigInvalid

*error* · origin: core · raised by: `reconfigure`; activation failure cause

- **Cause.** The configuration did not decode; `message` names paths and expected forms.
- **Example.** `reconfigure("example/mailer", { retries: "three" })`; message: `retries: expected number`.
- **Fix.** Correct the paths named; values are never shown.

### CleanupError

*error* · origin: core · raised by: `remove`, `replace`, `restart`, `disable`, `reconfigure`

- **Cause.** A finalizer failed while the plugin stopped; it ended `failed` (cleanup).
- **Example.** A plugin whose finalizer closes a socket that throws.
- **Fix.** Fix the finalizer; the resource may be leaked; `retry` after fixing.

### DrainTimeout

*error* · origin: core · raised by: `remove`, `replace`, `restart`, `disable`, `reconfigure`, `Generation`

- **Cause.** Leases on `id` did not drain in time (`target` set when a dependent held them).
- **Example.** `remove("example/db", { drain: "5 seconds" })` while a report query holds a lease for a minute.
- **Fix.** Find the long call (`bridger inspect`), raise `drain`, or use `force` knowing callers are interrupted.

### WouldDeadlock

*error* · origin: core · raised by: stopping operations, `retry`, `enable`, `awaitIdle`

- **Cause.** The call would wait for something its own lease or transition blocks (ADR-BR-016).
- **Example.** Inside `host.use(Logger, …)`, the callback calls `host.remove("example/logger")`.
- **Fix.** Do not stop your own provider from inside a call to it; fork the operation outside the lease.

### IdleTimeout

*error* · origin: core · raised by: `awaitIdle`

- **Cause.** The host did not become idle in time.
- **Example.** `awaitIdle({ timeout: "1 second" })` while a build sleeps for ten.
- **Fix.** Look at `pending` work in the attached snapshot; raise the timeout.

### ServiceUnavailable

*error* · origin: core · raised by: `use`, `useAll`, `lease`

- **Cause.** No active provider for the key.
- **Example.** `host.use(Greeter, …)` while `example/greeter` is `waiting`.
- **Fix.** Check `bridger inspect <plugin>`; in tests add a provision.

### LeaseRevoked

*error* · origin: core · raised by: forced revocation

- **Cause.** A forced stop or drain interrupted the callback.
- **Example.** `remove("example/db", { force: true })` while a call is inside the database.
- **Fix.** Expected under `force`; make the callback's external write atomic.

### LeaseTimeout

*error* · origin: core · raised by: per-call timeout

- **Cause.** The callback exceeded its `timeout`.
- **Example.** `host.use(Search, f, { timeout: "2 seconds" })` with a slow `f`.
- **Fix.** Raise the timeout or make the call shorter.

### KeyMismatch

*error (cause)* · origin: core · raised by: activation failure cause

- **Cause.** Two different key objects share one `ServiceId`.
- **Example.** Two copies of a contract package each create their own `Logger` key with the id `"example/Logger"`.
- **Fix.** Usually two copies of a package; run `bridger check`.

### AdmissionClosed

*error* · origin: core · raised by: `Generation.acquire`, `Generation.use`

- **Cause.** The generation's owner closed admission.
- **Example.** `generation.acquire` after the owning plugin began to stop.
- **Fix.** Acquire before closing, or from the new generation.

### ActivationFailed

*error* · origin: core · raised by: `PluginHandle.awaitActive`

- **Cause.** The plugin ended `failed` (`phase`, `message`).
- **Example.** `(yield* host.install(p)).awaitActive` for a plugin whose build fails.
- **Fix.** Read `message`; fix and `retry`.

### PluginRemoved

*error* · origin: core · raised by: `PluginHandle.awaitActive`

- **Cause.** The plugin was removed while awaited.
- **Example.** Awaiting activation of a plugin that another caller removed.
- **Fix.** Expected if another caller removed it.

### WaitTimeout

*error* · origin: core · raised by: `PluginHandle.awaitActive`

- **Cause.** The plugin did not become active in time.
- **Example.** `awaitActive({ timeout: "5 seconds" })` for a plugin that stays `waiting`.
- **Fix.** Run `bridger inspect <plugin>` to see why it waits.

### DuplicateRealm

*error* · origin: core · raised by: `defineRealm`

- **Cause.** The realm already exists.
- **Example.** `defineRealm("tenant-a")` called twice.
- **Fix.** Define each realm once.

### DuplicateContribution

*error* · origin: core · raised by: `ContributionRegistry.add`

- **Cause.** A contribution with this id exists in the registry.
- **Example.** Two plugins add a menu entry with id `"menu/settings"` to one registry.
- **Fix.** Use a unique id per contribution.

### ContributionUnavailable

*error* · origin: core · raised by: `ContributionRegistry.use`

- **Cause.** The contribution is gone or not yet added.
- **Example.** Using a contribution whose plugin was just removed.
- **Fix.** Re-read the registry view.

### Unattributed

*error* · origin: core · raised by: every mutating operation

- **Cause.** `attribution.require` is set and no actor was supplied.
- **Example.** `host.install(p)` with no `context` on a host built with `attribution: { require: true }`.
- **Fix.** Pass `{ context: { actor } }`.

### ReasonRequired

*error* · origin: core · raised by: operations in `requireReason`; `acknowledgeAuditDegraded`

- **Cause.** A reason is required for this operation.
- **Example.** `host.remove("x", { context: { actor } })` when `requireReason` includes `remove`.
- **Fix.** Pass `context.reason`.

### AuditUnavailable

*error* · origin: core · raised by: every mutating operation except `shutdown`

- **Cause.** The `requested` record could not be written, or the audit latch is set.
- **Example.** Any operation while the audit sink is down and the latch is set.
- **Fix.** Restore the sink; an operator acknowledges with `acknowledgeAuditDegraded`.

### AuditWriteFailed

*port-error* · origin: core · raised by: `AuditSink.record`

- **Cause.** The sink failed one write; never reaches an operation caller.
- **Example.** A sink whose database connection dropped; seen only by the host.
- **Fix.** Fix the sink; the host maps it to `AuditUnavailable` or the latch.

### OperationRejected

*error* · origin: core · raised by: every mutating operation except `shutdown` (per entry for `reconcile`)

- **Cause.** The `OperationGate` refused (`reason`).
- **Example.** `host.replace(newBatchModule)` without the approval the gate checks for.
- **Fix.** Obtain the approval the gate requires.

### ConfigFingerprintUnavailable

*error* · origin: core · raised by: `install` with config, `reconfigure` with a value

- **Cause.** The wired `ConfigFingerprinter` failed, timed out or answered malformed.
- **Example.** `reconfigure("x", { apiKey })` while the fingerprinter times out.
- **Fix.** Fix the fingerprinter; nothing was changed or recorded.

### ConfigFingerprintFailed

*port-error* · origin: core · raised by: `ConfigFingerprinter.fingerprint`

- **Cause.** The port's own failure; never reaches a caller.
- **Example.** The fingerprinter cannot reach its key store; seen only by the host.
- **Fix.** Fix the port.

### Interrupted

*record-only* · origin: core · raised by: `AuditRecord.error` only

- **Cause.** The caller was interrupted after its `requested` record and before its intent.
- **Example.** An HTTP handler calling `host.remove` is cancelled just after the `requested` record was queued.
- **Fix.** No action; the call changed nothing.

## Core seams (files 26–34)

### IncompatibleContract

*error* · origin: core/26 · raised by: `install`, `replace`, `enable`

- **Cause.** A dependent's range is not satisfied by its provider's provision, or methods are missing (BEH-BR-228).
- **Example.** A dependent requires `Audit.range("^2.3")`; the installed provider provides 2.1.0.
- **Fix.** Install a provider of a satisfying version, or widen the dependent's range only if it truly works with the older version.

### IncompatibleEngine

*error* · origin: core/27 · raised by: `install`, `replace`, `enable` (definition checks)

- **Cause.** The manifest's `engines["@bridger/core"]` range is not satisfied by this host's `Bridger.version` (`id`, `engine`, `range`, `actual`).
- **Example.** A manifest requiring `^2.0` installed on a 1.x host.
- **Fix.** Use a core version inside the range, or rebuild the plugin against this core.
### NoPluginPrincipal

*error* · origin: core/28 · raised by: `CurrentPlugin.require`

- **Cause.** Called outside plugin code.
- **Example.** `CurrentPlugin.require` called from application code outside any plugin.
- **Fix.** Call it only from plugin code, or use the non-failing form.

### ChildNotAllowed

*error* · origin: core/28 · raised by: `Plugin.Runtime.install`

- **Cause.** `allowChildren: false` or the `AccessPolicy` refused.
- **Example.** A plugin calls `Plugin.Runtime.install(child)` though the integrator set `allowChildren: false`.
- **Fix.** Ask the integrator to allow children for this plugin.

### PrincipalForged, PrincipalRetired

*defect* · origin: core/28 · raised by: acting with a principal

- **Cause.** A principal value the host did not mint, or from an ended activation.
- **Example.** Keeping the principal value from an old activation and acting with it after a restart.
- **Fix.** Never store or construct principals.

### ResolutionRefused

*error* · origin: core/29 · raised by: `use`, `useAll`, `lease`

- **Cause.** The `CapabilityPolicy` refused the resolution (`reason`).
- **Example.** A plugin without a grant for `Payments` calls `host.use(Payments, …)` with a capability policy wired.
- **Fix.** Ask for a grant for this key.

### CapabilityDenied

*defect* · origin: core/29 · raised by: calling an ungranted member

- **Cause.** The grant names members and this one is not among them.
- **Example.** A grant of `Storage` with `members: ["read"]`; the plugin calls `write`.
- **Fix.** Ask for a grant that includes the member.

### HookRegistrationRefused

*error* · origin: core/31 · raised by: hook registration

- **Cause.** The application's admission rule refused the role.
- **Example.** Registering a veto hook from code the application does not label as allowed to veto.
- **Fix.** Register an advisory hook, or ask for the role.

### NoImplementation

*error* · origin: core/31 · raised by: selector

- **Cause.** The registry has no implementation for the site.
- **Example.** The selector for a site finds no implementation in the registry.
- **Fix.** Install an implementation, or change the selector.

### LoadFailed

*error (cause)* · origin: core/27 · raised by: activation of a lazy plugin, phase "load"

- **Cause.** The lazy plugin's `load` failed, died or timed out (`id`, `message`); the plugin is `failed` with phase "load" and published nothing.
- **Example.** A loader that cannot fetch the package when the first trigger fires.
- **Fix.** Fix the code source or the loader, then `retry` (which loads again).

### ManifestMismatch

*error (cause)* · origin: core/27 · raised by: activation of a lazy plugin, phase "load"

- **Cause.** The loaded definition differs from the registered manifest in `field` (id, version, digest, keys or contract references).
- **Example.** The package was rebuilt with another `provides` list after its manifest was registered.
- **Fix.** Register the matching manifest (`replace`) or load the code the manifest describes.

### AccessDenied

*defect* · origin: core/28 · raised by: bus listen or emit, registry contribute, child mount

- **Cause.** A wired `AccessPolicy` denied the request (`kind`, `subject`, `principal`, `reason`); nothing was registered.
- **Example.** A plugin emits an event the policy reserves for another plugin.
- **Fix.** Ask the integrator to allow the access, or do not attempt it.

### DuplicateAnnotationKey

*defect* · origin: core/30 · raised by: `Annotations.add`

- **Cause.** Two annotation key objects with the same `id` in one bag, or a `bridger:` id not defined by core.
- **Example.** Two companions both define `app:tenant`.
- **Fix.** Give each key a unique, namespaced id.

### MonotonicAnnotation

*defect* · origin: core/30 · raised by: `Annotation.replace`

- **Cause.** The key is declared `monotonic: true` (for example `Annotation.Taint`); its value can only be combined, never replaced (`id`).
- **Example.** Code tries to clear the taint set of a context.
- **Fix.** Start new work from a fresh context only where the key's owner allows it; never strip a monotonic label.

### PlanStale

*error* · origin: core/32 · raised by: `reconcile(desired, { expect: plan })`

- **Cause.** The host changed since `Host.plan` produced the plan (`mismatches`), at the call or at its intent; nothing was applied.
- **Example.** Another operator replaced a plugin between plan and approval.
- **Fix.** Run `Host.plan` again, have it approved, and apply the new plan.

### RealmInUse

*error* · origin: core/33 · raised by: `Host.retireRealm`

- **Cause.** The realm still has plugins installed (`id`, `plugins`).
- **Example.** Retiring a family member while one of its plugins is still `waiting`.
- **Fix.** Remove the plugins first; retirement never removes them.

### FamilyMemberUnavailable

*error* · origin: core/33 · raised by: `Realm.family` use

- **Cause.** The member realm for `key` could not be used (`reason`: rejected, failed, activation-timeout, options-changed, invalid-key, closed).
- **Example.** A failed member is not recreated until reset.
- **Fix.** Act on the reason: `reset` a failed member, fix the key, or get the operation approved.

### FamilyEvictionError

*error* · origin: core/33 · raised by: `family.evict`, `family.reset`

- **Cause.** Eviction could not complete; carries the `DrainTimeout` or the reconcile rejection.
- **Example.** A long lease on a member's provider outlasts the drain limit.
- **Fix.** Wait for the lease to end and evict again; eviction never forces.

### HandoffError

*error (plugin)* · origin: core/34 · raised by: a definition's handoff `export`, `upgrade`, `import`

- **Cause.** The plugin's own handoff step failed (`message`); export or decode failures give a cold start, an import failure fails the activation.
- **Example.** `import` rejects a state its new version cannot read.
- **Fix.** Fix the handoff schema or `upgrade`; the `handoff` record names the lost step.

### PolicyMismatch

*error* · origin: core/18 · raised by: `reconcile`, `Host.plan` (in `rejected`)

- **Cause.** A desired entry's `mandatoryInterceptions` or `allowChildren` differ from the installed registration (`id`, `realm`, `fields`); no action is taken for it and it is never retried.
- **Example.** A manifest adds a mandatory interception to a plugin that is already installed without it.
- **Fix.** Replace the plugin through an operator call with the new policy, or restore the desired entry.

### AccessRefused

*error* · origin: core/28 · raised by: `AccessPolicy.ask`, `on`, `subscribe`, `add`, event delivery by companions

- **Cause.** The `AccessPolicy` refused a listen, subscribe, publish or contribute request (`kind`, `subject`, `reason`), including "principal-retired".
- **Example.** A plugin without `listens` in its manifest subscribes under `AccessPolicy.declaredOnly`
- **Fix.** Declare the listener or contribution in the manifest, or ask the integrator to change the policy.

### DigestRefused

*record-only* · origin: core/28 · raised by: `AuditRecord.error` of a `start-refused` record

- **Cause.** A system start of a digest the `RefusalList` refuses; the plugin lands in `disabled` with reason "refused-digest".
- **Example.** A dependency returns and its dependent's revoked digest would start again.
- **Fix.** Install a release whose digest is not refused; check the revocation source.

### CallLogUnavailable

*error* · origin: core/29 · raised by: service calls under the "refuse" call-log policy (a defect there), `Host.offerCallEntry`

- **Cause.** The call-log entry could not be delivered under "refuse": the queue was full, or `record` failed, died or timed out (`serviceId`, `member`, `why`); no value reached the consumer.
- **Example.** A data-access log backend is down while a service is configured to refuse unlogged calls.
- **Fix.** Restore the log backend; choose "drop" for services where an unlogged call is acceptable.

### InvalidCallEntry

*error* · origin: core/29 · raised by: `Host.offerCallEntry`

- **Cause.** An offered call-log entry is malformed (`message`): empty `companion`, a missing or extra info field for its `kind`, or an empty `dispatch.command`.
- **Example.** A companion offers a "crossing" entry without `crossing`
- **Fix.** Fill the entry as BEH-BR-280 states.

### ApplyRolledBack

*error* · origin: core/32 · raised by: `reconcile(desired, { atomic: true })`

- **Cause.** An entry failed (`failed`) and every applied entry was undone (`undone`).
- **Example.** The third of four entries fails to activate; the first two are undone in reverse.
- **Fix.** Fix the failed entry's cause and run again; nothing stayed applied.

### PartialApply

*error* · origin: core/32 · raised by: `reconcile(desired, { atomic: true })`

- **Cause.** An entry failed and some undo actions could not run (`notUndone`, never retried); `reconcile-partial` is published.
- **Example.** An undo `replace` is refused by the gate.
- **Fix.** Resolve each `notUndone` entry by an operator call; read the reasons (`ChangedSinceApply`, `DrainTimeout`, gate, audit).

## Companions

### PackageMalformed

*error* · origin: loader · raised by: loading

- **Cause.** Package paths or parts break BEH-LD-001.
- **Example.** A package containing the path `../escape.js`.
- **Fix.** Rebuild with `bridger pack`.

### IncompatiblePeer

*error* · origin: federation/03 · raised by: link skew handshake

- **Cause.** No federation protocol version common to both sides inside the window, or not a declared peer.
- **Example.** A host two versions behind its peer.
- **Fix.** Upgrade one side into the N/N−1 window.

### RemoteUnavailable

*error* · origin: remote/03 · raised by: calls through a link

- **Cause.** No open session (ended, hold mode, an escaped reference); outcome not-executed.
- **Example.** Calling a remote service while its guest is restarting in hold mode.
- **Fix.** Wait for the session or use withdraw mode so dependents wait.

### RemoteTimeout

*error* · origin: remote/03 · raised by: calls through a link

- **Cause.** The call's deadline expired; outcome unknown or not-executed.
- **Example.** A guest that hangs past the per-call deadline.
- **Fix.** Treat an unknown outcome as unknown; never retry blindly.

### SessionLost

*error* · origin: remote/03 · raised by: calls through a link

- **Cause.** The session ended with the call in flight; outcome unknown or not-executed.
- **Example.** The worker process crashes mid-call.
- **Fix.** Reconcile the effect with the remote side before retrying.

### StaleEpoch

*error* · origin: remote/03 · raised by: frames of another epoch

- **Cause.** A frame carried another session's epoch; refused, outcome not-executed.
- **Example.** A late reply from a previous session.
- **Fix.** None needed; the frame was discarded.

### RemoteRevoked

*error* · origin: remote/03 · raised by: calls through a revoked link

- **Cause.** The link was revoked at the boundary.
- **Example.** The loader's revocation of the guest's digest.
- **Fix.** Expected after revocation; remove or replace the link.

### RemoteBusy

*error* · origin: remote/03 · raised by: calls through a link

- **Cause.** `maxInFlight` reached; outcome not-executed.
- **Example.** A burst of calls above the link's limit.
- **Fix.** Retry later or raise `maxInFlight`.

### WireDecodeError

*error* · origin: remote/01 · raised by: calls through a link

- **Cause.** A payload or reply does not decode with the contract.
- **Example.** A guest built against an incompatible copy of the contract.
- **Fix.** Align contract versions; run conformance.

### RemoteDefect

*error* · origin: remote/03 · raised by: calls through a link

- **Cause.** The guest handler died or failed outside the contract; outcome executed.
- **Example.** An uncaught exception in a guest handler.
- **Fix.** Fix the guest; the call may have had effects.

### TokenInvalid

*error* · origin: remote/06 · raised by: guest callbacks

- **Cause.** The call token is unknown, of another call or of another epoch.
- **Example.** A guest reuses a token after its call ended.
- **Fix.** Use only the token of the call in progress.

### TokenExpired

*error* · origin: remote/06 · raised by: guest callbacks

- **Cause.** The call token's call has ended or its expiry passed.
- **Example.** A callback issued after the call returned.
- **Fix.** Make callbacks within the call.

### TransportError

*port-error* · origin: remote/07 · raised by: transport adapters

- **Cause.** The adapter failed (`adapter`, `message`).
- **Example.** A worker thread cannot be spawned.
- **Fix.** Fix the adapter or its environment.

### TransportClosed

*port-error* · origin: remote/07 · raised by: transport adapters

- **Cause.** The adapter's channel closed (`adapter`, `reason`).
- **Example.** The guest process exited.
- **Fix.** Expected on shutdown; otherwise a partition handled by the link.

### ManifestRejected

*error* · origin: federation/01 · raised by: manifest apply

- **Cause.** A received host manifest is not applied: signature refused, wrong host or authority, revision regressed, undecodable.
- **Example.** A replayed older signed manifest.
- **Fix.** Nothing to do locally; the host keeps its applied state; check the authority.

### ManifestUnavailable

*error* · origin: federation/02 · raised by: manifest source

- **Cause.** The authority could not be reached; never fatal.
- **Example.** Offline host.
- **Fix.** None; the host runs its last confirmed state within the offline cap.

### ExportConflict

*error* · origin: federation/04 · raised by: single-owner exports

- **Cause.** Two owners present the same fence for one export.
- **Example.** A split-brain after a partition.
- **Fix.** Let the authority issue a new fence; reconcile effects.

### StaleExport

*error* · origin: federation/04 · raised by: single-owner export calls

- **Cause.** An owner presents a fence lower than the highest the importer has seen.
- **Example.** A deposed owner still answering.
- **Fix.** Route to the current owner.

### ResyncRequired

*error* · origin: federation/02 · raised by: manifest sync

- **Cause.** The authority or the offline cap demands a snapshot re-bootstrap.
- **Example.** A host offline beyond the cap.
- **Fix.** Re-bootstrap from a snapshot.

### EncodeFailed

*error* · origin: event-delivery/02 · raised by: `publish`

- **Cause.** The payload does not encode with the event's schema (`type`, `issue`).
- **Example.** A field of the wrong type.
- **Fix.** Fix the payload.

### OutboxWriteFailed

*error* · origin: event-delivery/02 · raised by: `publish`

- **Cause.** The adapter could not write in the caller's transaction, which fails with it.
- **Example.** The storage transaction is closed.
- **Fix.** Fix the storage adapter or the transaction use.

### DeliveryFailed

*error* · origin: event-delivery/03 · raised by: relay

- **Cause.** A batch could not be delivered; retried by the relay.
- **Example.** The receiving host is unreachable.
- **Fix.** None; delivery is retried.

### EnvelopeConflict

*error* · origin: event-delivery/03 · raised by: inbox

- **Cause.** One (origin, stream, sequence) seen with two event ids; parked.
- **Example.** A restored origin reusing sequences without a new incarnation.
- **Fix.** Investigate the origin; give a restored store a new incarnation.

### UnknownEventVersion

*error* · origin: event-delivery/01 · raised by: inbox decode

- **Cause.** The envelope's version is newer than known, or older than the upcasters reach.
- **Example.** A receiver older than the sender.
- **Fix.** Upgrade the receiver or add upcasters.

### UpcastFailed

*error* · origin: event-delivery/01 · raised by: inbox decode

- **Cause.** An upcaster failed (`type`, `from`); parked.
- **Example.** An upcaster that rejects an old payload.
- **Fix.** Fix the upcaster and replay the parked envelope.

### DecodeFailed

*error* · origin: event-delivery/03 · raised by: inbox decode

- **Cause.** A payload does not decode after upcasting; parked.
- **Example.** A schema change that broke the add-only rule.
- **Fix.** Fix the schema or upcaster and replay.

### SnapshotRequired

*error* · origin: event-delivery/03 · raised by: subscription

- **Cause.** A subscriber's cursor predates the source's retained history.
- **Example.** A subscriber offline longer than the replay horizon.
- **Fix.** Re-bootstrap the subscriber from a snapshot.

### ClockSkewExceeded

*error (reported)* · origin: event-delivery overview · raised by: inbox

- **Cause.** A received hybrid logical clock is ahead of the local clock by more than `maxDrift`; the envelope is still received.
- **Example.** An unsynchronised sender clock.
- **Fix.** Synchronise clocks.

### FetchFailed

*error* · origin: loader/02 · raised by: `fetch`

- **Cause.** The package could not be fetched (or timed out).
- **Example.** The registry is unreachable.
- **Fix.** Retry later or fix the source.

### UnsupportedDigestAlgorithm

*error* · origin: loader/01 · raised by: digest check

- **Cause.** The digest names an algorithm the loader does not accept.
- **Example.** A package digested with an unknown algorithm.
- **Fix.** Repack with a supported algorithm.

### DigestMismatch

*error* · origin: loader/01 · raised by: digest check before evaluation

- **Cause.** The computed digest of a `part` differs from the expected one.
- **Example.** A package altered after signing.
- **Fix.** Do not load it; obtain the published package.

### ManifestMismatch (loader)

*error* · origin: loader/01 · raised by: package checks

- **Cause.** The package's manifest disagrees with what the catalog or definition declares (distinct from core's `ManifestMismatch`).
- **Example.** A catalog entry pointing at a different build.
- **Fix.** Republish a consistent package.

### PackageRefused

*error* · origin: loader/01, loader/08 · raised by: acceptance rule; data-pack load

- **Cause.** A package predicate refused the package (`predicate`, `reason`); for a data pack, predicate "schema-id", "rollback" (a lower version) or "equivocation" (the same version with a different digest).
- **Example.** A file outside the declared layout; a second data pack "price-list" 3.1.0 with other bytes.
- **Fix.** Rebuild the package within the rules; publish a data-pack correction as a new version.

### SignatureRejected

*error* · origin: loader/02, loader/07 · raised by: `SignaturePolicy.verify` (loads, catalog, data packs, other statements)

- **Cause.** The signatures do not satisfy the statement type's rule, the verifier timed out, or the type has no rule ("no-rule"; always for "revocation-list", which only the revocation source verifies).
- **Example.** Only the publisher signed where a reviewer is also required.
- **Fix.** Obtain the missing signatures (`bridger countersign`), or configure a rule for the type; hand revocation lists to `RevocationSource.offer`.

### Revoked

*error* · origin: loader/02 · raised by: revocation check of a package

- **Cause.** The digest, the package statement's digest or a signer is in the revocation set (`by`: digest, statement-digest, signer; other statement types report `StatementRevoked`).
- **Example.** Loading a release revoked after a defect.
- **Fix.** Use a non-revoked release.

### RevocationUnavailable

*error* · origin: loader/04 · raised by: revocation source

- **Cause.** The revocation set could not be read.
- **Example.** The revocation channel is unreachable.
- **Fix.** Restore the channel; new loads wait or are refused by policy.

### RevocationListMalformed

*error* · origin: loader/04 · raised by: `RevocationSet.decode` (inside `offer`)

- **Cause.** A verified revocation-list payload is not the `bridger-revocation-set/v1` shape, has a non-positive revision or repeated keys; the offer is `Rejected` ("malformed").
- **Example.** An issuer that signs a list written by hand rather than by `RevocationSet.encode`.
- **Fix.** Ask the list issuer to re-issue the list with `RevocationSet.encode`.

### RevocationStale

*error* · origin: loader/02 · raised by: revocation check

- **Cause.** The revocation set is older than `maxAge`; new loads are refused.
- **Example.** A device offline for weeks.
- **Fix.** Refresh the revocation set.

### EvaluationFailed

*error* · origin: loader/02 · raised by: evaluation after verification

- **Cause.** The verified module failed to evaluate.
- **Example.** A top-level exception in the plugin module.
- **Fix.** Fix the module.

### AnchorFailed

*port-error* · origin: audit-chain/02 · raised by: `Anchor.publish`

- **Cause.** The anchor adapter failed (`anchor`, `message`).
- **Example.** The anchor service is down.
- **Fix.** Restore the anchor; records keep being chained.

### ReceiptStoreFailed

*port-error* · origin: audit-chain/02 · raised by: `ReceiptStore.put`

- **Cause.** Storing an anchor receipt failed.
- **Example.** The receipt store is full.
- **Fix.** Fix the receipt store.

### EntitlementUnavailable

*port-error* · origin: entitlement/01 · raised by: `Entitlement` port

- **Cause.** The entitlement service could not answer (`pluginId`, `message`); handled by the configured unavailability policy.
- **Example.** The licence server is down.
- **Fix.** Restore the service; essential uses still pass.

### NotEntitled

*error* · origin: entitlement/02 · raised by: `Entitlement.guard`

- **Cause.** The plugin's mode does not allow this use and the use carries no essential label.
- **Example.** A paid feature after a licence lapse.
- **Fix.** Renew, or label the use essential if it must always run.

### BudgetExhausted

*error* · origin: entitlement/03 · raised by: `Budget.reserve`

- **Cause.** A budget limit would be exceeded.
- **Example.** Quota of model calls used up.
- **Fix.** Wait for the window, raise the limit, or release reservations.

### BudgetUnavailable

*error* · origin: entitlement/03 · raised by: `Budget.reserve`

- **Cause.** The budget ledger could not be read.
- **Example.** The ledger store is unreachable.
- **Fix.** Restore the ledger.

### CallbackDenied

*error* · origin: remote/06 · raised by: guest callbacks

- **Cause.** The callback was refused at the host boundary (`link`, `contract`, `method`, `reason`: not-granted, invocation-ended, or the admission's reason); nothing was resolved.
- **Example.** A guest calls back a contract its call token does not grant.
- **Fix.** Make the callback within the call, or ask the integrator for a grant or an admission rule that covers it.

### MethodNotServed

*error* · origin: remote/03 · raised by: calls through a link

- **Cause.** The far end serves the contract but not this method (`link`, `method`); outcome not-executed.
- **Example.** A host calls a method added in a minor version the peer has not deployed.
- **Fix.** Align contract versions, or serve the method on the far end.

### NotAPluginDefinition

*error* · origin: loader/02 · raised by: evaluation after verification

- **Cause.** The export the manifest names is missing or is not a plugin definition.
- **Example.** A package whose entry file exports `default` while the manifest names `plugin`.
- **Fix.** Export the definition under the name the manifest gives.

### LoadLogFailed

*error* · origin: loader/02 · raised by: load pipeline

- **Cause.** A wired `LoadLog` could not record the `accepted` record; the code is not evaluated.
- **Example.** The load-log store is full when a package is accepted.
- **Fix.** Restore the load log; then load again.

### CatalogEntryRejected

*error* · origin: loader/05 · raised by: catalog entry verification

- **Cause.** A catalog entry failed verification (carries the cause's tag: `DigestMismatch`, `SignatureRejected`, `Revoked`, `RevocationStale`, `RevocationUnavailable`, or a manifest decode error).
- **Example.** A catalog feed lists a package whose digest does not match the published bytes.
- **Fix.** Act on the carried cause; the entry is not offered.

### NoMatchingEntry

*error* · origin: loader/05 · raised by: catalog `resolve`

- **Cause.** No verified entry satisfies the id and range, or two entries share an id and version with different digests ("ambiguous").
- **Example.** Resolving `example/greeter` at `^2` when only 1.x entries are verified.
- **Fix.** Publish a matching version, or remove the duplicate entry from the feed.

### EntitlementConfigError

*error* · origin: entitlement/02, entitlement/04 · raised by: `EntitlementGate.piece`, `EntitlementGate.layer`, `Entitlement.capabilityPolicy`, `ReadOnly.fromContracts`, `ReadOnly.fromServices`, `Policies.first`

- **Cause.** A construction rule of the entitlement package is broken (`component`, `reason`): `checkTimeout` is not shorter than the piece's `timeout`, the stated `gateTimeout` or the host's `resolutionTimeout`; `readOnly`, `onUnclassified` or `onNone` is missing; a classified name is not a method of its contract, or a contract or key is listed twice; a reserving budget bundle is not last in `Policies.first`.
- **Example.** `Policies.first(quota, entitled)` — the budget bundle reserves, so a later entitlement `Skip` would leave its reservation to expire.
- **Fix.** Correct what `reason` names: shorten `checkTimeout`, state the missing option, fix the classification, or list the budget bundle last.

### HistoryUnavailable

*error* · origin: event-delivery/06 · raised by: history read

- **Cause.** A history read could not be served (`source`, `cause`); the follower backs off.
- **Example.** The event store is unreachable while a follower replays.
- **Fix.** Restore the history source; the follower retries.

### KeyedHashFailed

*port-error* · origin: audit-chain/01 · raised by: `KeyedHasher.mac`

- **Cause.** The keyed-hash adapter failed; the sink maps it to `AuditWriteFailed`.
- **Example.** The hardware module holding the MAC key is offline.
- **Fix.** Restore the hardware module or key service behind the port.

### RebootstrapFailed

*error* · origin: federation/02 · raised by: snapshot re-bootstrap

- **Cause.** The re-bootstrap from a snapshot failed; the applied manifest stays in force and links stay suspended.
- **Example.** The authority's snapshot cannot be fetched during a re-bootstrap.
- **Fix.** None locally; it is retried at the next sync. Check the authority's snapshot.

### CommandNotFound

*error* · origin: command/02 · raised by: dispatch

- **Cause.** No command with this `id` in the catalog.
- **Example.** A typo or a removed plugin.
- **Fix.** Check the catalog.

### CommandInputInvalid

*error* · origin: command/02 · raised by: dispatch

- **Cause.** The input does not decode with the command's schema (`issues`).
- **Example.** A missing required field.
- **Fix.** Fix the input.

### CommandOutputInvalid

*error* · origin: command/02 · raised by: dispatch

- **Cause.** The handler's output does not match the command's schema.
- **Example.** A handler returning an extra shape.
- **Fix.** Fix the handler.

### CommandRefused

*error* · origin: command/02 · raised by: dispatch

- **Cause.** The effective gate (`CommandGate` and its wrappers) refused (`reason`), or the taint floor withheld an automatic allow of a command not declared `readOnly` with no draft source wired (`reason` "tainted-session"), or a gate or draft source failed ("gate-defect", "gate-timeout"), or the receipt store failed ("receipts-unavailable"), or a batch draft or version reader is missing ("no-batch-draft-source", "no-version-reader"), or a `long` command was put in `Commands.batch` ("long-in-batch", command BEH-CM-049).
- **Example.** An unapproved regulated command; a tainted agent call on a catalog built without `drafts`.
- **Fix.** Obtain the approval the gate requires.

### CommandDeferred

*error* · origin: command/02 · raised by: dispatch

- **Cause.** The gate deferred, or the taint floor turned an automatic allow of a command not declared `readOnly` into a draft from the configured draft source; carries `draftId` for approval.
- **Example.** A tainted agent session proposing a write.
- **Fix.** Approve the draft and dispatch again with the approval reference.

### CommandVetoed

*error* · origin: command/02 · raised by: dispatch

- **Cause.** A `before` hook point denied (`cause`: veto, hook-failed, hook-timeout, breaker-open, deadline, denied-policy, dormant, wake-failed, wake-timeout, no-host-link, target-failed; `hook`, `code`, `reason` when present).
- **Example.** A hook forbidding the command outside opening hours.
- **Fix.** Act on the cause: a veto code, a policy reason, an outage, or `CommandCatalog.attach` for "no-host-link".

### CommandTimeout

*error* · origin: command/02 · raised by: dispatch

- **Cause.** The handler exceeded its timeout (`after`).
- **Example.** A slow handler.
- **Fix.** Make the handler shorter or raise the timeout.

### CommandSchemaNotProjectable

*error* · origin: command/01 · raised by: command registration

- **Cause.** The command's schema cannot be projected to JSON Schema 2020-12.
- **Example.** A schema using a transformation with no JSON form.
- **Fix.** Use a projectable schema.

### ToolNotInToolset

*error* · origin: command/02 · raised by: dispatch from a pinned toolset

- **Cause.** The command is not in the caller's pinned toolset (`toolsetRevision`).
- **Example.** An agent calls a tool it was not offered.
- **Fix.** Use only offered tools.

### ToolChanged

*error* · origin: command/02 · raised by: dispatch from a pinned toolset or with `expectDigest` (an MCP call checks the digest the session listed); re-dispatch with an `ApprovalRef`

- **Cause.** The command's digest changed since the toolset was pinned, the session listed it, or the draft was made (`expected`, `actual`).
- **Example.** A plugin replaced during an agent turn.
- **Fix.** Re-pin or list again; re-plan a draft.

### ApprovalMismatch

*error* · origin: command/02 · raised by: re-dispatch with an `ApprovalRef`

- **Cause.** The approval reference was made for another input (`expected`, `actual` input digests); checked before the gate.
- **Example.** A draft approved for a quantity of 10, re-dispatched with a quantity of 10000.
- **Fix.** Dispatch exactly the input that was approved, or have the new input approved.

### McpSessionRefused

*error* · origin: mcp/01 · raised by: MCP server session

- **Cause.** The server refused the session (`reason`).
- **Example.** An unauthenticated client.
- **Fix.** Authenticate the client as the application requires.

### JsonSchemaUnsupported

*error* · origin: mcp/03 · raised by: `McpClient.import` (per tool)

- **Cause.** An external tool's schema could not be compiled, declares a dialect other than 2020-12, or has a non-object root (`tool`, `reason`); the tool is excluded.
- **Example.** An imported server declares a draft-07 `$schema` for one tool.
- **Fix.** Ask the server's owner for a 2020-12 object schema, or serve the tool through your own reviewed command.

### ImportedToolFailed

*error* · origin: mcp/03 · raised by: an imported command's handler

- **Cause.** The external server answered the call with an error (`tool`, `message`, untrusted text).
- **Example.** `docs.search` returns `isError: true` with "index unavailable".
- **Fix.** Read the message as data; retry only if the external tool is known to be safe to repeat.

### DefinitionUnresolved

*error* · origin: mcp/04 · raised by: `bridger.host.reconcile-plan`, `reconcile-apply`

- **Cause.** The application's `DefinitionResolver` could not resolve a desired entry (`id`, `realm`, `reason`).
- **Example.** A desired entry names `example/greeter` at a version the resolver's table does not hold.
- **Fix.** Use a name and version the resolver knows, or add it to the resolver.

### PlanUnknown

*error* · origin: mcp/04 · raised by: `bridger.host.reconcile-apply`

- **Cause.** The `planId` was never issued by this host-tools activation, expired, was evicted, or was forgotten by a restart (`reason`).
- **Example.** An approved apply re-dispatched two days after the plan, past the default 24-hour `planTtl`.
- **Fix.** Run `reconcile-plan` again and have the new plan approved.

### ModelError

*port-error* · origin: agent/01 · raised by: model adapter

- **Cause.** The model call failed (`kind`: unavailable, rate-limited, invalid-request, timeout, other).
- **Example.** Rate limit from the model provider.
- **Fix.** Back off or fix the request.

### AgentStepLimit

*error* · origin: agent/01 · raised by: `AgentLoop` (task outcome)

- **Cause.** A turn reached `maxSteps` (`steps`); the task is `failed`.
- **Example.** A model that keeps calling the same read tool for 20 steps.
- **Fix.** Split the work, raise `maxSteps` deliberately, or fix a looping prompt.

### SessionNotFound

*error* · origin: agent/01 · raised by: `SessionStore.read`, `AgentLoop.start`

- **Cause.** No session with this id in the store (`sessionId`).
- **Example.** Resuming `s-1` after the in-memory test store was discarded.
- **Fix.** Start a new session or check the id.

### StoreError

*port-error* · origin: agent/01 · raised by: `SessionStore`, `MemoryStore`

- **Cause.** The application's store failed (`store`, `message`).
- **Example.** The session database is unreachable when a message is appended.
- **Fix.** Fix the store; nothing was appended.

### TaskNotFound

*error* · origin: agent/02 · raised by: `Tasks`, `AgentLoop.resume`, `cancel`

- **Cause.** No task with this id (`taskId`); tasks live for the host's life.
- **Example.** `tasks.await("t-9")` after a host restart.
- **Fix.** Check the id; a task does not survive a restart in v0.1.

### TaskNotResumable

*error* · origin: agent/02 · raised by: `AgentLoop.resume`, task events

- **Cause.** The event does not apply to the task's state (`taskId`, `state`).
- **Example.** An approval arriving for a task that was cancelled.
- **Fix.** Re-read the task; start a new one if it ended.

### TaskAwaitTimeout

*error* · origin: agent/02 · raised by: `Tasks.await`

- **Cause.** No requested state was reached within the timeout (`taskId`, `last`); the task is unaffected.
- **Example.** Awaiting `awaiting-approval` for 30 seconds on a long research turn.
- **Fix.** Await again, or raise the timeout.

### TaintDraftStoreError

*port-error* · origin: agent/03 · raised by: `TaintDraftStore.create`

- **Cause.** The application's approval store could not record a draft (`message`); the tainted call is refused with "gate-defect".
- **Example.** The approval store's database is read-only during maintenance.
- **Fix.** Fix the approval store.

### SubagentFailed

*error* · origin: agent/04 · raised by: `SubagentHandle.result`

- **Cause.** The subagent did not finish (`taskId`, `reason`: parent-ended, failed, cancelled).
- **Example.** The parent turn ended while its subagent was still running.
- **Fix.** Read the subagent's task; re-spawn in a new turn if needed.

### SubagentToolNotInParent

*error* · origin: agent/04 · raised by: `Agent.spawnSubagent`

- **Cause.** A requested tool is not in the parent's pinned toolset (`tool`); no realm was created.
- **Example.** Spawning a subagent with `tools: ["catalog.rename-item"]` from a read-only turn.
- **Fix.** Request only tools the parent turn holds.

### SubagentParentUnattributed

*error* · origin: agent/04 · raised by: `Agent.spawnSubagent`

- **Cause.** The parent actor is unattributed, the system actor or a reserved id, which `Actor.narrow` refuses (`actorKind`).
- **Example.** A background job without an actor spawns a subagent.
- **Fix.** Run the parent under a named actor.

### ReplayDiverged

*error* · origin: agent/05 · raised by: `ReplayModel` on `TestHost`

- **Cause.** A replayed run differed from its recording at element `index` (`expected`, `actual` digests).
- **Example.** A gate change makes the third tool call deferred instead of allowed.
- **Fix.** Inspect the change at that call; re-record only if the change is intended.

### ScriptMismatch

*error* · origin: agent/05 · raised by: agent test script

- **Cause.** A scripted model step did not match (`step`, `reason`: expect-failed, script-exhausted).
- **Example.** The agent called a tool the script did not expect.
- **Fix.** Fix the agent or the script.

### IdempotencyConflict

*error* · origin: command/06 · raised by: dispatch with `idempotencyKey`

- **Cause.** The key's receipt was made by another actor, for another input or another definition digest, in the other mode (value vs task), a dispatch under the key is still running, or no `CommandReceipts` is wired (`reason`: actor-differs, input-differs, definition-differs, mode-differs, in-flight, no-receipts).
- **Example.** A retry reuses a key with a changed amount.
- **Fix.** Use a new key for new data or after the definition changed; retry later for in-flight; wire receipts or drop the key.

### TaskStoreUnavailable

*error* · origin: command/07 · raised by: `CommandTaskStore` port

- **Cause.** The task store failed; a `put` failure is logged and changes no outcome, a failure while reading at layer build fails the layer.
- **Example.** The application's task table is unreachable when the catalog layer is built.
- **Fix.** Check the application's store.

### TaskLost

*error* · origin: command/07 · raised by: failed task (BEH-CM-054)

- **Cause.** A task was found running when the catalog layer was built; its work was cut off by a restart.
- **Example.** A long export interrupted by a process restart.
- **Fix.** Retry with the same key to run it again.

### CommandBreakerOpen

*error* · origin: command/06 · raised by: dispatch

- **Cause.** The breaker for the command or its providing plugin is open (`scope`, `key`); no handler ran.
- **Example.** A handler's backend timed out five times within a minute.
- **Fix.** Wait for the cooldown; fix the failing handler or backend.

### CommandWrapperFailed

*error* · origin: command/06 · raised by: dispatch (step 7)

- **Cause.** A handler wrapper failed, did not call `run`, or the receipt could not be completed (`wrapper`, `message`).
- **Example.** A transaction wrapper's commit fails.
- **Fix.** Fix the wrapper or its store; a transaction wrapper rolled back.

### CommandDraftStale

*error* · origin: command/07 · raised by: re-dispatch or batch with an approval carrying expected versions

- **Cause.** `Draft.check` found versions that moved (`draftId`, `mismatches`); nothing ran.
- **Example.** A record changed between approval and execution.
- **Fix.** Re-plan and have the new draft approved.

### CommandBatchRejected

*error* · origin: command/07 · raised by: `Commands.batch`

- **Cause.** An item failed admission (`batchId`, `index`, `error`); no handler ran.
- **Example.** The third item's input does not decode.
- **Fix.** Fix or remove the item.

### CommandBatchRolledBack

*error* · origin: command/07 · raised by: `Commands.batch`

- **Cause.** An item failed after earlier items ran; every earlier item was undone by an atomic wrapper or compensation (`failed`, `undone`).
- **Example.** The second item fails and the first is compensated.
- **Fix.** Fix the failing item and submit the batch again.

### CommandBatchPartial

*error* · origin: command/07 · raised by: `Commands.batch`

- **Cause.** An item failed and some earlier items could not be undone (`failed`, `undone`, `notUndone`); never retried.
- **Example.** A compensation is refused by the gate.
- **Fix.** Resolve each `notUndone` item by hand or with its compensation.

### CommandTaskNotFound

*error* · origin: command/07 · raised by: `CommandTasks`

- **Cause.** No task with this id (`taskId`); terminal tasks beyond `tasks.retain` are forgotten and tasks do not survive the process.
- **Example.** Reading a long command's task after a restart.
- **Fix.** Check the id.

### CommandTaskAwaitTimeout

*error* · origin: command/07 · raised by: `CommandTasks.await`

- **Cause.** The task did not end within the timeout (`taskId`, `last`); the task is unaffected.
- **Example.** Awaiting a report generation for 5 seconds.
- **Fix.** Await again, or raise the timeout.

### ReceiptsUnavailable

*port-error* · origin: command/06 · raised by: `CommandReceipts`

- **Cause.** The application's receipt store failed (`message`); a failed claim refuses the dispatch ("receipts-unavailable").
- **Example.** The receipts table is locked.
- **Fix.** Fix the store.

### WrapperError

*port-error* · origin: command/06 · raised by: a handler or batch wrapper

- **Cause.** The application's wrapper reported a failure (`message`); surfaced as `CommandWrapperFailed`.
- **Example.** A wrapper cannot open its transaction.
- **Fix.** Fix the wrapper.

### PublisherMismatch

*error* · origin: loader/07 · raised by: `SignaturePolicy.verify`, loads, catalog entries, data packs

- **Cause.** The manifest's `publisher` is matched by no verified signer's configured `publishers` or `identity`; nothing is evaluated.
- **Example.** A package signed by `acme-publisher` declares `publisher: "Other Corp"`
- **Fix.** Sign with a key configured for that publisher, or correct the manifest's `publisher`.

### StatementRevoked

*error* · origin: loader/07 · raised by: `SignaturePolicy.verify` (statement types other than "package"), `Revocation.check`, `DataPacks`

- **Cause.** The statement's subject digest, statement digest or a signer it depended on is revoked (`by`, `revision`).
- **Example.** A host manifest whose statement digest appears in revocation list revision 42.
- **Fix.** Obtain a statement that is not revoked (a new issuance or release); packages report `Revoked` instead.

### SigningFailed

*port-error* · origin: loader/07 · raised by: `StatementSigner.sign`; `bridger publish`, `bridger countersign`

- **Cause.** The signing adapter (KMS, hardware token, keyless flow) failed; no signature was added.
- **Example.** The KMS adapter's credentials expired during `bridger countersign`
- **Fix.** Fix the signer adapter or its access; the package and its digest are unchanged.

### DataPackStale

*error (also a report)* · origin: loader/08 · raised by: `DataPacks.status` (reported), `DataPacks.requireFresh` (failure)

- **Cause.** The pack is older than its `maxAge` since `issuedAt` ("max-age"), or past `effectiveUntil` ("expired").
- **Example.** A `price-list` pack with `maxAge: "30 days"` read 31 days after `issuedAt`
- **Fix.** Load a newer pack; whether stale data may be used is the application's decision.

### DataPackStoreFailed

*port-error* · origin: loader/08 · raised by: `DataPackStore`

- **Cause.** The application's data-pack store failed (`operation`: highest, save, load); an unsaved pack is not published.
- **Example.** The store's disk is full when saving a new pack.
- **Fix.** Fix the store; the current pack is unchanged.

### SeriesConfigInvalid

*error* · origin: audit-chain/04 · raised by: `ChainSink.make` (construction)

- **Cause.** A series spec is refused (`reason`: series-id-syntax, canonicaliser-id-syntax, continues-from-self, resume-and-continue, resume-mismatch).
- **Example.** A series id containing a space; a `resumeFrom` that differs from the head the store reports.
- **Fix.** Correct the series id, canonicaliser id, `continuesFrom` or `resumeFrom` (use the store's head).

### BundleExportFailed

*error* · origin: audit-chain/05 · raised by: `exportBundle`

- **Cause.** The chain store or receipt store could not be read, the series is unknown, or the range is invalid (`reason`); no partial bundle is produced.
- **Example.** `exportBundle` for a series id the store does not know.
- **Fix.** Fix the store access or the requested range and export again.

### PlacementRefused

*error* · origin: remote/09 (also federation/06, event-delivery/02) · raised by: `Remote.define` (link build), served calls, imports and exports, event destinations

- **Cause.** A required residency label is not offered by the transport, route or inbox (`subject`, `required`, `offered`, `reason`).
- **Example.** A plugin whose manifest says `residency: "eu"` behind a transport that offers only `"us"`
- **Fix.** Use a transport, route or inbox that offers the label, or correct the manifest; the label is compared as a string and proves nothing about where code runs.

### RemoteBudgetExceeded

*error* · origin: remote/09 · raised by: calls through a link

- **Cause.** `PrincipalBudget.admit` refused, or failed (`link`, `reason`); outcome not-executed, no frame sent, a "refusal" call-log entry offered.
- **Example.** A partner principal exceeds its hourly call budget.
- **Fix.** Wait for the budget window, or raise the principal's budget.

### RevocationListStale

*error* · origin: federation/06 · raised by: `kill` frame handling

- **Cause.** A revocation list in a `kill` frame is not newer than the held list: `RevocationSource.offer` answered `NotNewer` (`revision`, `held`, `from`); not applied, not relayed; `revocation-stale` event. A list `offer` answers `Rejected` is reported as the status event `revocation-rejected`, not as this tag. Distinct from the loader's `RevocationStale`.
- **Example.** A relay forwards revision 41 to a host that holds 42.
- **Fix.** No action for a duplicate; investigate a peer that keeps sending older lists.

### RebootstrapBlocked

*error* · origin: federation/02 (raised by event-delivery `rebootstrapOutbox`) · raised by: re-bootstrap step 1

- **Cause.** The outbox could neither push nor keep local facts (`pending`, `reason`: outbox-unsettled, outbox-unavailable, no-outbox-port), or the settlement was refused (`reason`: kept-needs-in-store for "pushed-or-kept" with a whole-store install, no-incarnation-source for a whole-store install without an `IncarnationSource`; event-delivery/06, BEH-DB-048); nothing fetched or installed, links resumed, status `rebootstrap-blocked`, retried next sync.
- **Example.** A terminal with 300 unsent envelopes cannot reach the hub when a snapshot is due.
- **Fix.** Restore delivery so the outbox settles; wire an outbox port if none is configured; for a whole-store install, wire an `IncarnationSource` or install in store.

### OutboxFrozen

*error* · origin: event-delivery/06 (BEH-DB-048) · raised by: `publish`

- **Cause.** A whole-store re-bootstrap holds the outbox frozen from the end of its first drain phase until the settlement's scope closes (`reason`); nothing is written and the caller's transaction fails with it.
- **Example.** A terminal records a sale while it installs a fresh snapshot from the hub.
- **Fix.** Retry the publish after the re-bootstrap ends.

### IncarnationUnavailable

*port-error* · origin: event-delivery/01 (BEH-DB-004) · raised by: `IncarnationSource.current`, `IncarnationSource.raise`

- **Cause.** The application's incarnation source could not be read or raised (`cause`); a whole-store install that cannot raise it fails.
- **Example.** The file that keeps the incarnation number outside the database is not writable.
- **Fix.** Fix the incarnation source's storage, which lives outside the store's backups.

**Federation status events (not error tags).** `revocation-rejected` (a kill frame's list that `RevocationSource.offer` answered `Rejected`), `kill-held` (a revision that would disable more owned plugins than `maxDisabledPerRevision` allows, held until `releaseRevocation`) and `rebootstrap-revision-mismatch` (the installed snapshot's revision differs from the applied manifest's) are reported on the federation status feed (federation BEH-FD-015). Remote `WireExit.InProgress` (BEH-RM-020) is not a tag: a call that reaches its deadline after it fails with `RemoteTimeout`, outcome "unknown".

### DowncastRefused

*error* · origin: event-delivery/04 · raised by: `publish` under `publishVersion`

- **Cause.** A value at N does not survive the N→N−1→N round trip (`type`, `from`, `reason`); nothing is written.
- **Example.** A field added in version 3 is set while writers still publish version 2.
- **Fix.** Leave the new field empty until readers are upgraded, or raise `publishVersion` once reports show no reader below N.

### PayloadEncodeFailed

*error* · origin: event-delivery/01 · raised by: `publish`, event-store `append`

- **Cause.** The `PayloadCodec` could not encode the payload; nothing is written.
- **Example.** The keyring codec refuses to encode for a shredded subject.
- **Fix.** Fix the codec's dependency (for example the key store), or stop publishing for that subject.

### PayloadDecodeFailed

*error* · origin: event-delivery/01 · raised by: reading envelopes, event-store reads

- **Cause.** The `PayloadCodec` could not decode the payload, or the reader lacks the envelope's `codec`; handled under the subscription's `onPoison` (event-store: the read ends, BEH-ES-032).
- **Example.** A reader without the keyring codec receives an encrypted envelope.
- **Fix.** Wire the codec named in `Envelope.codec` on the reader.

### PayloadUnreadable

*error* · origin: event-delivery/01 · raised by: reading envelopes

- **Cause.** The codec can no longer read the payload (for example its key was destroyed); the envelope is parked for that subscription and the stream is not halted.
- **Example.** An envelope whose every encrypted field's key is gone without a tombstone.
- **Fix.** Expected after a deliberate key destruction; otherwise restore the key store.

### WrongExpectedVersion

*error* · origin: event-store/01, event-store/05 · raised by: `Stream.append`, `Aggregate.handle`, sequence `next()`

- **Cause.** The stream's version was not the expected one (`stream`, `expected`, `actual`; "unknown" when the adapter detects the conflict only at commit); nothing is written.
- **Example.** Two terminals append to one stream from version 7.
- **Fix.** Read the stream again and decide again; `Aggregate.run` retries.

### DuplicateEventType

*error* · origin: event-store/01 · raised by: `EventStore.register`

- **Cause.** An event type with this id is already registered with the store (`type`).
- **Example.** Registering one `DurableEvent` twice.
- **Fix.** Register each event type once.

### UnregisteredEventType

*error* · origin: event-store/01 · raised by: `Stream.append`

- **Cause.** The event's type was not registered with the store (`type`); nothing is written.
- **Example.** Appending an event declared after the store was built.
- **Fix.** Register the type with `EventStore.register` first.

### StoreWriteFailed

*error* · origin: event-store/05 · raised by: `Stream.append`, checkpoint writes, the `EventStoreAdapter`

- **Cause.** The storage adapter could not write (`message`); the transaction rolls back.
- **Example.** The database rejects the insert because the disk is full.
- **Fix.** Fix the storage; nothing was appended.

### StoreUnavailable

*error* · origin: event-store/05 (also federation/02) · raised by: `Stream.read`, `EventStoreAdapter.transact`, `readStream`; the federation store port

- **Cause.** The storage adapter could not be reached or read (`message`).
- **Example.** The database connection pool is exhausted.
- **Fix.** Restore the storage and retry.

### StoreContention

*error* · origin: event-store/02 · raised by: `Aggregate.record`, `Aggregate.run`

- **Cause.** Appends kept conflicting past `retries`; an operational error, never a refusal of a fact.
- **Example.** Many terminals record facts on one hot stream at once.
- **Fix.** Retry later; split the stream if it is hot by design.

### ProjectionFailed

*port-error* · origin: event-store/03 · raised by: a projection's `apply` or `reset`

- **Cause.** The application's projection failed; the batch rolls back, is retried with backoff and then the projection halts at that position, never skipping.
- **Example.** A read model's unique index rejects a row.
- **Fix.** Fix the projection or its table; the follower resumes from the checkpoint.

### NotOwner

*error* · origin: sequence/01 · raised by: `Series.open`

- **Cause.** The origin is not this host's configured origin (`origin`, `configured`); only closure of a superseded series by a later incarnation is allowed.
- **Example.** A host opens a series of another terminal.
- **Fix.** Open series only for the host's own origin.

### SeriesNameInvalid

*error* · origin: sequence/01 · raised by: `Series.open`

- **Cause.** The series name is outside the grammar (`name`).
- **Example.** A name containing a space.
- **Fix.** Use a name that matches the grammar.

### SeriesClosed

*error* · origin: sequence/01 · raised by: `next()`, `close`

- **Cause.** The series is closed (`seriesId`, `last`); no number is issued after closure (also the name of the closing event).
- **Example.** Issuing a number after the series was closed for a restore.
- **Fix.** Open the series of the current incarnation.

### KeyShredded

*error* · origin: keyring/01 · raised by: `Keyring.key`, `encrypt`, `decrypt`, the field codec's encode

- **Cause.** The subject has a tombstone; no key is given out and nothing is encrypted for it.
- **Example.** Encrypting a new record for a customer whose data was removed.
- **Fix.** Stop writing personal data for that subject; reads yield `Shredded` markers.

### KeyStoreUnavailable

*error* · origin: keyring/01 · raised by: `Keyring.key`, `encrypt`, `decrypt`, `shred`

- **Cause.** The application's key store could not be reached (`message`).
- **Example.** The key vault is down.
- **Fix.** Restore the key store; nothing was encrypted or destroyed.

### SubjectInvalid

*error* · origin: keyring/01 · raised by: `Keyring.key`, `shred`

- **Cause.** The subject id is not 1–128 characters of `[A-Za-z0-9._:/-]` (`reason`).
- **Example.** A subject id containing a name with spaces.
- **Fix.** Use an opaque id; the subject id stays readable after a shred.

### DecryptFailed

*error* · origin: keyring/01 · raised by: `decrypt`; the field codec's decode (as `PayloadDecodeFailed`)

- **Cause.** The ciphertext, nonce, key id or authenticated data does not match.
- **Example.** An encrypted field copied into another event type.
- **Fix.** Do not move ciphertext between fields, types or subjects; check the stored form.

### RedactionFailed

*port-error* · origin: keyring/03 · raised by: a callback registered with `Keyring.onShred`

- **Cause.** The application's redaction of plaintext copies failed; the shred stays pending for that callback.
- **Example.** A read model's delete statement fails.
- **Fix.** Fix the callback; it is retried from its own cursor.

### DuplicateCallback

*error* · origin: keyring/03 · raised by: `Keyring.onShred`

- **Cause.** A redaction callback with this name is already registered.
- **Example.** Two plugins register `customer-view` callbacks.
- **Fix.** Give each callback a unique name.

### SubjectFromEncryptedField

*defect* · origin: keyring/02 · raised by: `Keyring.fields` (construction)

- **Cause.** A `FieldSpec`'s subject function reads a path listed for encryption.
- **Example.** The subject is read from the `customerId` field that is also encrypted.
- **Fix.** Read the subject from an unencrypted field.

## Kit

### MissingProvision

*error* · origin: kit · raised by: `PluginTest.mount`

- **Cause.** The subject stayed `waiting`: `missingServiceIds` have no provision.
- **Example.** `PluginTest.mount(greeter)` with no `Logger` stub.
- **Fix.** Add a `PluginTest.stub` for each, or pass `allowWaiting`.

### StubNotImplemented

*defect* · origin: kit · raised by: a `PluginTest.partial` double

- **Cause.** The test reached a member the double does not implement.
- **Example.** `PluginTest.partial(Database, { query })`, and the subject calls `execute`.
- **Fix.** Implement the member in the partial, or use `PluginTest.stub`.

### CaseFailed

*error* · origin: kit · raised by: a conformance case

- **Cause.** One case's assertion failed.
- **Example.** Case `append-then-query` sees no entry after an append.
- **Fix.** Read the case id and message.

### ConformanceFailed

*error* · origin: kit · raised by: `Conformance.verify`

- **Cause.** At least one executed case failed (`failed` ids).
- **Example.** Two cases of suite 1.1.0 fail against a provider of 1.2.0.
- **Fix.** Fix the provider; the report is on the error.

### SuiteVersionMismatch

*error* · origin: kit · raised by: `Conformance.verify`

- **Cause.** No given suite matches the provided major, or the subject provides no version.
- **Example.** Passing only the 2.x suites to a provider of 1.4.0.
- **Fix.** Pass the suites of the provided major.

### DuplicateDependencyCopy

*error* · origin: kit · raised by: `bridger check`

- **Cause.** Two physical copies of `effect` or `@bridger/core` are reachable.
- **Example.** `effect` 4.0.0 hoisted and 4.0.1 nested under a contract package.
- **Fix.** Deduplicate dependencies (one version, hoisted).

### ContractBreakingChange

*error* · origin: kit · raised by: `bridger check`

- **Cause.** A change BEH-BR-230 forbids within a major.
- **Example.** Removing the field `locale` from `GreetRequest` and releasing 1.3.0.
- **Fix.** Release under a new major (new `ServiceId`) or revert the change.

### ContractVersionNotBumped

*error* · origin: kit · raised by: `bridger check`

- **Cause.** An additive change without a minor bump.
- **Example.** Adding a method and releasing the contract still as 1.2.0.
- **Fix.** Bump the minor version.

### SdkDecodeFailed

*error* · origin: kit · raised by: Promise SDK runtime

- **Cause.** A payload or a handler result does not match the contract schema (`side`).
- **Example.** A handler returns `{ txt: "hi" }` where the contract expects `{ text }`.
- **Fix.** Fix the caller's payload or the handler's result.

### SdkUndeclaredFailure

*error* · origin: kit · raised by: Promise SDK runtime

- **Cause.** A handler threw something other than a generated `ContractError`.
- **Example.** A handler throws `TypeError: cannot read properties of undefined`.
- **Fix.** Throw a declared error, or handle the exception; see `onUnexpected`.

### PublishFailed

*port-error* · origin: kit · raised by: `PublishTarget.upload`

- **Cause.** The registry adapter refused or failed.
- **Example.** The registry refuses an upload because the version already exists.
- **Fix.** Read the adapter's message; the package is unchanged.

## Adapters (outside this specification)

Tags of adapters documented in `docs/`, not in a companion tree; proposed, not specified.

### InvalidContribution

*error* · origin: @bridger/react (proposed; docs/REACT-UI-PLUGINS.md) · raised by: `Ui.messages`, `Ui.theme`

- **Cause.** A message catalog or theme token set did not decode (non-string values, malformed locale tag); nothing was registered.
- **Example.** `ui.messages({ id: "sales/fr", locale: "fr", messages: { "sales/orders": 3 } })`
- **Fix.** Contribute string values and a BCP 47 locale tag.

Missing a tag? The kit treats an uncatalogued tag as a failure of its own catalog test ([BEH-KT-051](../../references/kit/behaviors/07-error-catalog.md#beh-kt-051-the-catalog-is-checked-against-the-specifications)).

Change log: 2026-11-08, round 2 — entries for the core tags `PolicyMismatch`, `AccessRefused`, `DigestRefused`, `CallLogUnavailable`, `InvalidCallEntry`, `ApplyRolledBack`, `PartialApply`; the command, loader, audit-chain, remote, federation, event delivery, event-store, sequence and keyring tags of round 2; the React adapter's `InvalidContribution`; `CommandVetoed`, `ToolChanged`, `CommandRefused`, `SignatureRejected`, `Revoked` and `EntitlementConfigError` updated (CCR-BR-027).

Change log: 2026-11-08, round-2 agent review — entries `RevocationListMalformed`, `TaskStoreUnavailable`, `TaskLost`; `IdempotencyConflict` ("definition-differs", "mode-differs"), `CommandRefused` ("long-in-batch") and the taint-floor wording of `CommandRefused`/`CommandDeferred` (commands not declared `readOnly`) updated; `PackageRefused` (data-pack "rollback" and "equivocation"), `SignatureRejected` ("revocation-list" verified only by the revocation source), `Revoked` (statement-digest revocation) and `SeriesConfigInvalid` ("resume-and-continue", "resume-mismatch") updated (CCR-BR-029).

Change log: 2026-11-08, round-2 integration — entries `OutboxFrozen` and `IncarnationUnavailable`; `RebootstrapBlocked` gains "kept-needs-in-store" and "no-incarnation-source"; `RevocationListStale` raised on an `offer` answer `NotNewer`; a note on the federation status events `revocation-rejected`, `kill-held`, `rebootstrap-revision-mismatch` and remote `WireExit.InProgress` (CCR-BR-029).
