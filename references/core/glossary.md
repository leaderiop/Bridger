# Glossary

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-GLOSSARY                                             |
> | Revision       | 0.13                                                         |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification — Glossary                          |
> | Change History | 0.13 (2026-11-10): Parked stop and ended intent: a child's sub-scope close or unmount also resumes (C11); plan: `expect` binds code only through `meta.digest` (C6) (CCR-BR-035)<br>0.12 (2026-11-10): System stop names the refused background restart (C5); `HoldRevoked` `seq` and `GenerationRevoked` (C7); Call-log entry kinds include "dispatch" (audit round 2, Low) (CCR-BR-034)<br>0.11 (2026-11-09): Contract: local contract (`Contract.local`); realm family: a ready member; state handoff: `restart` and `reconfigure` under `alsoOn`, and a superseded build (U-02, U-03; local contracts); system stop names the idle return of a lazy plugin (BEH-BR-252, BEH-BR-073) (CCR-BR-033)<br>0.10 (2026-11-09): Base service: replaceable only in a realm that isolates its key; host-owned keys (C-02) (CCR-BR-032)<br>0.9 (2026-11-08): Companion terms of round 2: receipt, listing record, model-facing envelope, signed statement, data pack, revocation list, kill-only apply, chain series, verification bundle, residency label, writers last, payload codec, expected version, fact, number series, crypto-shredding; entry owner and `HoldRevoked` (CCR-BR-027)<br>0.8 (2026-11-08): Hook point entry: phases, targets, breaker per plugin, declarations; declared contribution, HostLink, held event, idle return, denied-policy (CCR-BR-024); atomic apply, undo action, PartialApply, mandatory catalog, contract registry, Selector range (CCR-BR-025); refusal list, CurrentCorrelation, call-log failure policy, attributed unmount, call-log entry kinds (CCR-BR-026)<br>0.7 (2026-11-08): Plugin principal: "on whose behalf" (CCR-BR-022)<br>0.6 (2026-11-08): Contracts, manifest, consent diff, lazy plugin and legality table with seven states (CCR-BR-017); principal, policy and annotation terms (CCR-BR-018); hook point, selector, gate, plan, realm family and handoff terms (CCR-BR-019); `Plugin.Any` (CCR-BR-020); hash chain and companion terms (CCR-BR-021)<br>0.5 (2026-10-03): Fingerprint; Audit position (CCR-BR-014)<br>0.4 (2026-10-03): Parked (a child's removal resumed only by `remove`), Confluence (the failure exception) and Audit-degraded latch (what sets it) follow their behaviours (consistency pass) (CCR-BR-013)<br>0.3 (2026-10-02): Transition step, cascade, parked, operation in flight, system stop; Linearization and Drain updated; parked per the single parking rule, ended intents and `intent-ended`, operator-rooted cascades (CCR-BR-008)<br>0.2 (2026-10-02): Consistency fixes from independent review (CCR-BR-002)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001) |

---

Terms are defined as this specification uses them. Where a term has a wider
meaning elsewhere, the narrower meaning here governs.

## Plugin model

### Plugin

A definition (`PluginDefinition`) that declares the services it requires and
provides and a `Layer` that builds the provided services. A definition is data;
it has no state until it is installed.

### Host

The runtime (`Bridger.Host`) that installs plugin definitions, activates them,
owns their scopes, and publishes their state.

### Service, service key, ServiceId

A service is an Effect `Context.Service`. Its key's string identifier
(`key.key`) is its **ServiceId**, the identity the host uses to match providers
to requirements across separately bundled code.

### Provider, dependent

The plugin that provides a service is its **provider**. A plugin that requires
it is a **dependent** of that provider.

### Base service

A service supplied when the host is constructed, outside any plugin. It belongs
to the default realm and cannot be replaced by a plugin there; a realm that
isolates its key may hold its own provider of it. The **host-owned keys**
`Bridger.Host` and `Bridger.Events` are base services of every realm: no
plugin provides them and no realm isolates them.

### Activation

One run of a plugin's `build` layer in a fresh scope, ending when that scope
closes. A plugin has a new activation after every restart.

### Activation scope

The Effect `Scope` forked from the host scope for one activation; it owns every
resource the activation acquired.

### Resolution scope, realm

A **realm** is a named service-resolution namespace. A plugin resolves an
isolated key only among providers in its own realm and every other key in the
default realm. The plugin's **resolution scope** is the set of providers it can
see under these rules.

### Plugin reference (`PluginRef`)

A plugin's ID within a realm; a bare string means the default realm.

### Intent

The target an operation records at its linearization point, after its checks
(attribution, latch, validation, gate, the `requested` record and the
`WouldDeadlock` check). The transition toward the intent continues even if the
caller stops waiting.

### Linearization

Operations on one plugin take effect in call order, one transition step at a
time, with at most one operator operation in flight on the plugin. There is no
host-wide order: operations on different plugins never wait for each other,
except that a provider's stop waits for its dependents' stops (a cascade)
([behaviour 08](./behaviors/08-operation-legality.md), BEH-BR-078).

### Transition step

One build, or one stop, of one plugin; at most one runs per plugin at a time.
A **stop step** begins when the plugin becomes `stopping` and includes waiting
for its dependents' stops, its lease drain and its scope close. Not to be
confused with a numbered step of the call order of BEH-BR-188, which is always
cited with its number.

### Operation in flight

An operator operation on a plugin from its linearization point until it
completes or its intent is ended (BEH-BR-080), including while its stop is
parked. A call that resumes a parked system stop is in flight from the
resumption. At most one is in flight per plugin; what an incoming call does
meanwhile is given by the in-flight operation table (BEH-BR-072). `inspect`
reports it as `pending`.

### System transition, system stop

A transition no operator call asked for: an automatic start, a
dependency-loss or runtime-failure stop, the idle return of a lazy plugin to
`dormant` (BEH-BR-252), the stop into `disabled` of a plugin whose
`background` restart the refusal list refused (reason "refused-digest",
BEH-BR-267), a child mount or removal by its parent, or shutdown's
stops (BEH-BR-073). A **system stop** is such a stop; it is audited as
a system record attributed to `Actor.system`, never gated.

### Cascade, cascade root, cascading call

A **cascade** is the stop of a dependent that a provider's stop requires
(BEH-BR-043), whatever began that stop. The **cascade root** is what began the
provider's stop: an operator call (the **cascading call**), a runtime failure,
a dependency-loss stop, or shutdown. An **operator-rooted** cascade — one whose
root is an operator call — drains under that call's `drain` and `force`; a
cascade whose root has no caller drains under `drainTimeout`, never parks, and
revokes on expiry (shutdown: only once its overall limit has passed).

### Parked, parked operation, parked system stop

A stop is **parked** when its drain expired without `force`, or when the call
driving it failed with `DrainTimeout` and left it unsettled, and it waits for a
call, a cascade or shutdown to resume it; the plugin stays `stopping` with
`parked` true. When a call fails with `DrainTimeout`, every stop it drives that
has not settled — its own stop and every dependency-loss stop it started, at
any depth — parks in the same revision; only that call fails. A **parked
operation** is an operator operation's parked stop; a **parked system stop** is
a parked dependency-loss stop. Only stops driven by an operator call — its own
stop, or a cascade whose root is an operator call — park, and none parks once
shutdown has begun. A parked operation resumes when a call joins or supersedes
it, a parked system stop when a `remove`, `replace`, `restart`, `disable` or
`reconfigure` arrives on the plugin (on a child whose stop removes it, only
`remove`), and either kind when a cascade needs it,
at shutdown, or — for a child — when the sub-scope it was mounted under closes
or it is unmounted (14, BEH-BR-121, BEH-BR-126).

### Ended intent

A parked operator intent that a cascade, shutdown, or a child's sub-scope close
or unmount ends when it resumes the stop (BEH-BR-080, BEH-BR-121): its remaining actions never run, a `replace`'s reservations
are released and every override change made under it reverts, in the same
revision, in which the host writes an `intent-ended` system record whose
`endsIntentOf` is the `recordId` of the parked call's `requested` record. A
call that instead resumes a parked operation by joining or superseding it
records `resumes`, naming that same record, on its own terminal record.

### Legality table

The table of outcomes for every pair of plugin state — seven states,
`dormant` included — and operation
([behaviour 08](./behaviors/08-operation-legality.md)).

### Sticky failure

A failed plugin stays failed until an explicit operation acts on it.

### Lease

A claim on one or more active providers for the duration of a callback or a
scope. A provider does not close while a lease on it is held, up to the drain
limit.

### Drain, force, revocation

**Draining** is waiting for leases to end before closing a provider, bounded by
the drain limit (`drain`, default `drainTimeout`). When the limit passes,
**force** interrupts the remaining lease holders; that interruption is a
**revocation** (`LeaseRevoked`). Without `force`, an operator call fails with
`DrainTimeout` and every stop it drives that has not settled parks; a stop
with no caller at its cascade root revokes instead (shutdown: once its overall
limit has passed).

### Generation

An immutable value published atomically to new callers while old callers keep
the value they were admitted to, until their lease ends.

### Contribution registry

A shared extension point to which plugins add entries that are removed when the
contributing scope closes.

### Reconcile, desired state, confluence

**Reconcile** makes the host match a declared list of plugins (the **desired
state**). **Confluence** is the property that, once the host is idle, the
state depends on what is installed, not on the history of operations that
reached it — except that a past failure may differ until that plugin is acted
on explicitly (BEH-BR-160).

### Contract, contract reference

A **contract** is a service key with a version (`MAJOR.MINOR.PATCH`) and a
description of its methods in Effect Schema, made by `Contract.make`; its
`ServiceId` ends in `@<major>`. A **contract reference** is a contract, a
range requirement on it (`contract.range("^2.1")`) or a provision of a lower
version of it (`Contract.at`), used in `requires`, `provides` or `optional`
([26](./behaviors/26-versioned-contracts.md)). A **local contract**, made by
`Contract.local`, names its members without Schemas, for a service that runs
only in the caller's process; it never crosses a host (BEH-BR-225).

### Contract range, compatible pair

A **range** is a set of contract versions within one major (`^`, `~` or an
exact version). A registered dependent and its provider form a **compatible
pair** when the provider's declared version satisfies the dependent's range
and lists the methods the dependent's copy knows (BEH-BR-228).

### Manifest

A data record describing a plugin — id, version, digest, provided and
required contracts, engines, triggers, contributions, and labels such as
publisher, tier, requested capabilities, egress and residency. Core reads only
the fields it needs to resolve and carries the rest unchanged
([27](./behaviors/27-manifest-and-lazy-activation.md)).

### Consent diff

The pure classification, by `Manifest.consentDiff`, of how a manifest differs
from a previous one: widened, narrowed, relabelled or unclassified. Core
computes it and acts on none of it (BEH-BR-243).

### Lazy plugin, dormant, trigger

A **lazy plugin** is registered from its manifest by `Plugin.lazy` and stays
**dormant** — slots reserved, code not loaded, nothing provided — until a
**trigger** applies: `OnService`, `OnContribution` or `OnEvent`. Its code is
then loaded in its first build step (BEH-BR-244–246).

### Declared contribution, HostLink

A **declared contribution** is a `contributions` entry of a lazy plugin's
manifest, reported by `Host.declaredContributions` while the plugin is not
yet loaded. The **HostLink** is the narrow view (`declaredContributions`,
`wake`) a hook point reads it through, carried in the fibers the host runs
(BEH-BR-250, BEH-BR-309).

### Held event

The one event that applied an `OnEvent` trigger, held for the plugin it woke
and delivered once to that plugin's listeners when it becomes `active`, or
dropped with a diagnostic (BEH-BR-251).

### Idle return

A loaded lazy plugin with `idle` set that nothing uses goes back to
`dormant` through a normal stop, recorded as `lazy-idle` (BEH-BR-252).

### `Plugin.Any`

The type every plugin definition fits: the definition fields with
`build: Layer<never, unknown, any>` and a phantom brand set only by
`Plugin.define` (BEH-BR-001; ADR-KT-002 in the [kit companion](../kit/README.md)).

## Principal, policy and annotations

### Plugin principal (`CurrentPlugin`), `onBehalfOf`

The identity (id, realm, version, digest, revision) of the plugin on whose
behalf a fiber runs — the plugin itself for code the host starts for it, the
consumer for a provider's method serving that consumer — minted by the host
per activation and checked on every read; attribution among trusted code,
not authentication. `onBehalfOf` is that principal recorded on the gate request and audit records of a mutating call
made from plugin code; it is never an actor
([28](./behaviors/28-plugin-principal-and-mandatory-policy.md)).

### `CurrentCorrelation`

The fiber reference holding the correlation id of the request the code works
for. A call takes it when its context supplies none; the host sets it for a
call's work, listeners and served calls follow it, and background work
starts without it ([22](./behaviors/22-attributable-operations.md), BEH-BR-187).

### Mandatory interception, `allowChildren`, access policy

A **mandatory interception** comes from host, realm or installation options;
no child or operation can replace or remove it, it applies outside ordinary
interceptions and, by default, to `Host.use`. **`allowChildren`** decides
whether a plugin may mount children; children can narrow it, never widen it.
The optional **`AccessPolicy`** port decides listen, emit, contribute and
child requests (BEH-BR-260–264).

### Refusal list, refused digest

The optional **`RefusalList`** port names digests the host must not start.
It is consulted on every start — operator calls (before the gate), dependency
returns, lazy triggers, background restarts and child mounts. A plugin whose
start it refused is `disabled` with reason `refused-digest` and the refusal
is recorded as `start-refused` ([28](./behaviors/28-plugin-principal-and-mandatory-policy.md), BEH-BR-267).

### Attributed unmount

`Plugin.Runtime.unmount` removes a child on someone's request; the trail
records `unmount-requested` with `requestedBy`, and the removal's records
point to it ([14](./behaviors/14-children-and-groups.md), BEH-BR-126).

### Capability policy, grant, call log, `CurrentCall`

The optional **`CapabilityPolicy`** port is consulted at each capture; its
**grant** (`Grant.all`, `Grant.of`) names the members a consumer may call,
applied as a shallow narrowing — not a security boundary in-process. The
optional **`CallLog`** port receives one payload-free entry per call through a
recorded capture; core keeps nothing. **`CurrentCall`** describes the
intercepted call in progress and is the seam for per-call tokens
([29](./behaviors/29-capability-grants-and-call-log.md)). Entries have a kind ("call", "crossing",
"refusal", "revocation", "dispatch"); companions offer theirs with `Host.offerCallEntry`; a policy may re-resolve live captures
through `changes` (BEH-BR-280, BEH-BR-281).

### Call-log failure policy

"drop" (an undeliverable entry is counted and the call stands) or "refuse"
(the call does not deliver its outcome unless its entry was accepted), chosen
by the `CallLog` port and per capture, over a bounded hand-off queue
([29](./behaviors/29-capability-grants-and-call-log.md), BEH-BR-279).

### Annotation, annotation key, flow

A typed label in the `OperationContext` / `CurrentAnnotations` bag; its key
declares how it combines, whether it is monotonic, and which flows (events,
gate, policy, callLog, audit) may carry it. Core keys: `Annotation.Deadline`
(`bridger:deadline`), `Annotation.Taint`, `Annotation.Provenance`. Labels are
carried, never enforced by core
([30](./behaviors/30-operation-context-annotations.md)).

## Hook points, gates, realm families and handoff

### Hook point, admission rule, breaker, decision record

A **hook point** is a named extension point over a contribution registry
whose contributions declare a role (veto, enrich, advisory), are admitted by
the application's **admission rule** (`who`) over owner, labels and what they
ask for (failure policy, target), run in three ordered phases — enrich, then
veto (seeing the enrichments), then advise — in priority-then-id order under
a per-hook timeout and a per-dispatch deadline, and yield a **decision
record** naming the deciding contribution — returned and fed, never audited
by core. A **breaker** is per contribution or per plugin and is hook-level
state, never plugin failure. Contributions declared by plugins not yet
loaded are woken or deny ([31](./behaviors/31-hook-points.md)).

### Denied-policy

A hook dispatch denied by the point's `policy` about a veto contribution,
recorded as such and never as that contribution's veto (BEH-BR-312).

### Selector

The per-call choice among the implementations contributed to one registry; no
failover (BEH-BR-307); with a contract registry, limited to a version range (BEH-BR-233).

### Gate (`Gate<Req>`), draft, plan

A **gate** answers Allow, Refuse or Defer with a **draft** carrying the
versions it was planned against; `OperationGate` is its host instance and
`Gate.all` composes pieces. A **plan** (`ReconcilePlan`) is the read-only
result of `Host.plan`: what `reconcile` would do, without values;
`reconcile(desired, { expect: plan })` applies it or nothing (`PlanStale`); it
binds an entry's code only where the definition declares `meta.digest`
([32](./behaviors/32-generic-gate-and-plan.md), BEH-BR-319).

### Atomic apply, undo action, PartialApply

An **atomic apply** is `reconcile(desired, { atomic: true })`: its actions run
in dependency order, the first that does not complete stops it, and every
completed action is reversed by an **undo action** — the opposite ordinary
operation, attributed, gated (`undo: true`) and recorded (`undoes`). It ends
applied, rolled back (`ApplyRolledBack`) or partial (`PartialApply`, naming
what stayed applied). "Atomic" covers the host's plugin set only, never
external effects ([32](./behaviors/32-generic-gate-and-plan.md)).

### Mandatory catalog

`BridgerOptions.mandatoryCatalog`: the mandatory interceptions the
application names by id so that a desired list can cite them as data
(`DesiredPlugin.mandatoryInterceptions`); a difference on an installed entry
is `PolicyMismatch` ([18](./behaviors/18-reconciliation-and-confluence.md)).

### Contract registry

A `ContributionRegistry` made with a `contract`: each contribution declares
`implements`, checked against the registry's range at `add`;
`within(range)` reads only compatible entries
([26](./behaviors/26-versioned-contracts.md), BEH-BR-233).

### Realm family, ephemeral realm, narrowed actor, realm retirement

A **realm family** creates realms per key on first use and retires them when
idle, through public operations; an **ephemeral realm** is bound to a scope.
A member is **ready** when every plugin in it is `active`, `dormant` or
disabled by an operator. Neither is tenancy or separation. A **narrowed actor** (`Actor.narrow`,
`parent/segment`) is a label conferring nothing; `Actor.isWithin` recognises
it. **Retirement** (`Host.retireRealm`) removes only an empty realm
([33](./behaviors/33-realm-families.md)).

### State handoff

Transfer of an active plugin's in-memory state from the old to the new
definition during `replace`, or across a `restart` or restarting
`reconfigure` the definition lists in `alsoOn`, into the next build that will
be published; a cold start is recorded when it fails
([34](./behaviors/34-state-handoff.md)).

## Observation

### Snapshot

An immutable description of the host (`HostSnapshot`) or of one plugin
(`PluginSnapshot`), carrying a monotonic revision.

### Event feed (`Host.events`)

A bounded, lossy diagnostic stream of host events numbered by `seq`. It is
**not** an audit trail.

## GxP vocabulary

### GxP

The family of "good practice" regulations and guidelines (GMP, GCP, GLP, GDP,
GVP) governing regulated life-science activities.

### Computerized system

Hardware, software, procedures and people that together perform a regulated
function. Bridger is a component of such a system, never a system on its own.

### Regulated user

The organisation that operates a computerized system under GxP and is
accountable for its validation.

### Actor

The person, service or system to which an operation is attributed (`Actor`).
Binding an actor to an authenticated identity is the regulated user's
responsibility.

### Attributable

Traceable to the actor who performed it (ALCOA+). In this specification:
carrying an `Actor` and, when required, a reason.

### Audit trail, audit record

An **audit trail** is a secure, computer-generated, time-stamped record of
actions that create, modify or delete records (21 CFR 11.10(e)). Bridger
produces **audit records** and hands them to an `AuditSink`; storing them as an
audit trail is the regulated system's role.

### Audit sequence (`auditSeq`)

The contiguous, per-host sequence number of audit records; authoritative for
their order.

### Audit position

The highest `auditSeq` the host's sink has accepted (`lastWritten`), reported
by `Host.controls` when a sink is wired; per host, it never decreases, and it
stays readable after the host closes, so the final high-water mark can be read
once the writer has flushed (BEH-BR-212). `CloseReport.auditLastSeq` is the
same number at the moment the report is produced (BEH-BR-106).

### Hash chain, anchor, inclusion proof

A **hash chain** is a sequence of records in which each record's link hash
covers the record and the previous link; it uses no secret, so anyone who can
write its store can recompute it. An **anchor** is a party outside the trail's
store to which the chain's roots are published, which makes a recomputed chain
detectable only against a party who cannot also rewrite the anchor store. An
**inclusion proof** shows that a record belongs to an anchored window. Core
computes none of these; the [`@bridger/audit-chain`](../audit-chain/README.md)
companion specifies them, as detection only.

### Audit-degraded latch

The host condition, after a terminal, `rejected` or system record (or
`shutdown`'s `requested` record) could not be written, or a record was dropped
for writer-queue overflow, in which operator mutations are refused until
acknowledged (BEH-BR-205). An ordinary call whose `requested` record cannot be
written fails with `AuditUnavailable` instead and sets no latch.

### Fingerprint

An opaque string standing for a configuration value without revealing it,
produced by the consumer's optional `ConfigFingerprinter` port at step 4a of
a call, for paths the port selected, and carried in `configChange` next to
the paths (BEH-BR-188, BEH-BR-197). A fingerprint is not a configuration value;
core computes none, and whether one resists guessing depends on the port
alone (ADR-BR-039, RSK-BR-024).

### Operation gate

A port consulted before a lifecycle operation, able to refuse it; the seam for
approvals and electronic signatures.

### Electronic signature

A computer data compilation of symbols executed, adopted or authorised by an
individual to be the legally binding equivalent of a handwritten signature (21
CFR 11.3). Manifestation and linking (11.50, 11.70) belong to the companion and
the regulated user, not the core.

### ALCOA+

Data-integrity principles: Attributable, Legible, Contemporaneous, Original,
Accurate, plus Complete, Consistent, Enduring and Available (PIC/S PI 041; MHRA
GxP data integrity guidance).

### GAMP 5

ISPE's *A Risk-Based Approach to Compliant GxP Computerized Systems*, second
edition (2022). Category 5 denotes custom software.

### IQ, OQ, PQ

Installation, operational and performance qualification: verification that a
system is installed correctly, operates as specified, and performs in its
intended use.

### CSA

Computer Software Assurance: the FDA's risk-based approach (final guidance,
2025) that scales the rigour of assurance activities to the risk of the
function.

### Critical thinking

The CSA practice of choosing assurance activities by reasoning about risk and
intended use rather than by producing uniform documentation.

### Risk class, priority

In the GAMP 5 FMEA used here, **risk class** combines severity and probability;
**priority** combines risk class and detectability
([risk assessment](./gxp/03-risk-assessment.md)).

### Supports (a clause)

The verb this specification uses for the relationship between a library
behaviour and a regulatory clause. A library supports a regulated user's
compliance; it does not satisfy a regulation.

## Companions

Terms defined in the companion specifications (Drafts, CCR-BR-021; round 2,
CCR-BR-027); each tree is normative for its own terms.

### Remote plugin, link, session, epoch, guest

A **remote plugin** runs outside the host's process, reached through a local
proxy plugin, the **link** (`Remote.define`), which mounts one session child
per **session**; every frame and call token carries the session's **epoch**.
The **guest** serves a contract with `Guest.serve`. Out of process is not
isolated by Bridger ([remote](../remote/README.md)).

### Authority, host manifest, kill entry, offline cap

The **authority** issues and signs **host manifests**, the complete desired
state of one host; a **kill entry** removes plugins at the next apply; the
**offline cap** bounds how long a manifest counts as fresh
([federation](../federation/README.md)).

### Outbox, inbox, origin, upcaster

Rows written in the caller's storage transaction for later delivery, rows the
receiver stores once per origin, stream and sequence, the publishing node and
its incarnation, and a pure function from one event version to the next, in the
event delivery companion (its package name is intent, not a claim)
([event delivery](../durable-bus/README.md)).

### Package digest, signature policy, revocation set, kill switch

The loader's digest over manifest, SBOM and files; the rule of pinned digests
or N-of-M signers by role; a signed, monotonically numbered list of revoked
digests and signers; and revocation applied as a filter on the desired list
followed by `reconcile` ([loader](../loader/README.md)).

### Entitlement, essential label, budget

A mode (`full`, `grace`, `read-only`, `none`) an application states for a
plugin, never a lifecycle state; a label no entitlement or budget helper
refuses; a quota drawn down by reservations ([entitlement](../entitlement/README.md)).

### Command, toolset, taint (agent)

A named, typed request a plugin contributes a handler for; an id-ordered list
of command descriptors offered to one principal, which grants nothing; and a
session marked through `Annotation.Taint` once untrusted text may have reached
the model ([command](../command/README.md), [mcp](../mcp/README.md),
[agent](../agent/README.md)).

### Facade, conformance suite, Promise SDK, inspector

The kit's authoring function `definePlugin`; cases bound to one contract
version and run with `Conformance.verify`; generated plain-TypeScript handlers
run behind `Guest.serve`, not an isolation mechanism; a read-only devtools
service ([kit](../kit/README.md)).

### Receipt (command), listing record (MCP), model-facing envelope

A **receipt** is the record, in the application's `CommandReceipts` store, of
a completed dispatch under an idempotency key; a completed receipt never runs
its handler again (command BEH-CM-041). A **listing record** holds, per MCP
session, the descriptor digest of each tool the server listed; a call runs
only that definition (mcp BEH-MC-003). The **model-facing envelope**
(`Command.envelope`) is a command output with values at untrusted paths
replaced by numbered references and listed apart, size-capped (command
BEH-CM-030).

### Signed statement, data pack

A **signed statement** is a typed claim (`package`, `host-manifest`,
`data-pack`, `licence`, `revocation-list`, or an application type) about a
subject digest, whose type is part of the signed bytes, verified by the
loader's `SignaturePolicy.verify` (BEH-LD-049). A **data pack** is a loader
package kind holding a manifest and a payload of reference data and no entry
code: verified as a signed statement, served as bytes, never evaluated, and
reported stale past its `maxAge` (BEH-LD-057) ([loader](../loader/README.md)).

### Revocation list, kill-only apply

A **revocation list** is a signed, monotonic list of revoked digests and
signers (loader BEH-LD-025), verified with `statementType`
"revocation-list"; it travels apart from desired state (federation
ADR-FD-009) and feeds the `RefusalList`. A **kill-only apply** reconciles a
host's last applied desired list minus the entries a newer manifest's kill
entries match, while a re-bootstrap is pending (BEH-FD-042).

### Chain series, verification bundle

A **chain series** is an append-only stream chained by the audit-chain
companion's `ChainSink<R>` under a series id separate from any host id; core
audit is one series (BEH-AC-025, BEH-AC-026). A **verification bundle** is a
canonical export of chain segments, anchors, receipts and trust roots checked
offline by the pure `verifyBundle` (BEH-AC-033, BEH-AC-034)
([audit-chain](../audit-chain/README.md)).

### Residency label, writers last, payload codec

A **residency label** is the opaque `residency` string of a plugin manifest
(BEH-BR-241), and the labels a transport or route declares it offers; core
carries both and compares nothing, and the remote companion's
`PlacementPolicy` compares them as strings (BEH-RM-068). It is not evidence
of where code runs. **Writers last** is the rollout order for a version raise
when some readers cannot be upgraded first: readers learn N first; writers
switch to N by configuration once reports show no reader below N
(BEH-FD-046, BEH-DB-031). The **payload codec** is the event delivery
companion's port that encodes event payloads after schema encoding, for
example field encryption (BEH-DB-008).

### Expected version, fact, number series, crypto-shredding

An **expected version** is the stream version an append requires; a
mismatch is `WrongExpectedVersion`. A **fact** (offline fact) is input that
already took effect on a host and is recorded, never rejected; rule
violations become events (ADR-ES-005) ([event-store](../event-store/README.md)).
A **number series** is a per-origin, contiguous, closeable sequence of
record numbers owned by one host ([sequence](../sequence/README.md)).
**Crypto-shredding** makes encrypted fields unreadable by destroying their
key copies held by the keyring's key store, without changing stored records;
the keyring companion states its limits and claims no erasure
([keyring](../keyring/README.md)).

### Entry owner, hold revocation notice

A registry view entry's **owner** is the plugin id and realm that
`ActivePlugin` held when its `add` ran — diagnostic attribution, never
authorization (BEH-BR-165). A **`HoldRevoked`** notice is published on a
registry's `revocations` feed when a removal interrupts holders at
`drainTimeout` (BEH-BR-167); the feed is a notification, not a log, and its
`seq` shows lost notices as a gap. A generation announces its forced
revocations the same way, as `GenerationRevoked` on its own `revocations`
feed (BEH-BR-174).

---

_Next: [User requirements](./urs.md)_
