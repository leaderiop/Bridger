# Glossary

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-GLOSSARY                                             |
> | Revision       | 0.3                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification — Glossary                          |
> | Change History | 0.3 (2026-10-02): Transition step, cascade, parked, operation in flight, system stop; Linearization and Drain updated; parked per the single parking rule, ended intents and `intent-ended`, operator-rooted cascades (CCR-BR-008)<br>0.2 (2026-10-02): Consistency fixes from independent review (CCR-BR-002)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001) |

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
to the default realm and cannot be replaced by a plugin.

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
dependency-loss or runtime-failure stop, a child mount or removal by its
parent, or shutdown's stops. A **system stop** is such a stop; it is audited as
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
`reconfigure` arrives on the plugin, and either kind when a cascade needs it or
at shutdown.

### Ended intent

A parked operator intent that a cascade or shutdown ends when it resumes the
stop (BEH-BR-080): its remaining actions never run, a `replace`'s reservations
are released and every override change made under it reverts, in the same
revision, in which the host writes an `intent-ended` system record whose
`endsIntentOf` is the `recordId` of the parked call's `requested` record. A
call that instead resumes a parked operation by joining or superseding it
records `resumes`, naming that same record, on its own terminal record.

### Legality table

The table of outcomes for every pair of plugin state and operation
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
state**). **Confluence** is the property that the converged state depends on the
desired state, not on the history of operations that reached it.

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

### Audit-degraded latch

The host condition, after a record could not be written, in which operator
mutations are refused until acknowledged.

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

---

_Next: [User requirements](./urs.md)_
