# User Requirements

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-URS                                                  |
> | Revision       | 0.23                                                         |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | User Requirements Specification                              |
> | Change History | 0.23 (2026-11-08): Gap G70 opened (no `settle` for a declaration answered `Run` whose wake failed) (CCR-BR-029)<br>0.22 (2026-11-08): URS-BR-059 retitled and narrowed to holders without another key copy, no erasure claim (agent review R5-08); gap G64 row narrowed (CCR-BR-029)<br>0.21 (2026-11-08): Gap G47 row: actor half settled with the narrowing delimiter rule, realm half still open (CCR-BR-028)<br>0.20 (2026-11-08): URS-BR-056–059 (event-sourced streams, per-host number series, subject key removal, erasable event payloads); gap G56 closed; gaps G66–G68 opened and closed with core seams (call-log kind "dispatch", registry entry owner, `HoldRevoked` feed); gap G69 (no read-only marker on contract methods); G43 and G49 rows updated (CCR-BR-027)<br>0.19 (2026-11-08): URS-BR-049–050; gaps G37, G39 and G62 closed; gap G64 (a loaded but inactive veto plugin still fails open) (CCR-BR-024); URS-BR-051–052; gaps G36, G40, G44 and G48 closed; gap G65 (a narrowing provider replace needs two runs) (CCR-BR-025); URS-BR-053–055; gaps G38, G41–G43, G54, G55 (core side), G57–G61 and G63 closed (CCR-BR-026)<br>0.18 (2026-11-08): Gaps G61–G63 from the open questions of the loader and entitlement companions (CCR-BR-023)<br>0.17 (2026-11-08): URS-BR-032 reads "on behalf of which plugin" (CCR-BR-022)<br>0.16 (2026-11-08): URS-BR-029–031, gaps G36–G38 and G5 narrowed (CCR-BR-017); URS-BR-032–035, gaps G39–G42 (CCR-BR-018); URS-BR-036–040, gaps G44–G47 (CCR-BR-019); companion-origin URS-BR-041–048, Partner user group, companion scope row, gaps G43 and G48–G56 (CCR-BR-021)<br>0.15 (2026-11-08): Gap G35 recorded (the companion Draft in references/gxp/, on which G8's closure rests, is not present in this repository); G8's status points to G35; links into references/gxp/ turned into plain-text citations (CCR-BR-016)<br>0.14 (2026-10-03): Gap G8 closed: the companion is specified as a Draft in references/gxp/ (CCR-BR-015)<br>0.13 (2026-10-03): Gap G34 recorded and closed (`CloseReport.auditLastSeq` and the audit position after close) (CCR-BR-014)<br>0.12 (2026-10-03): §6 points to the behaviours' Satisfies lines (consistency pass) (CCR-BR-013)<br>0.11 (2026-10-03): G33 recorded and closed from the P5 exit-criterion work (CCR-BR-012)<br>0.10 (2026-10-02): G26–G32 recorded and closed from the P5 prototype (CCR-BR-011)<br>0.9 (2026-10-02): G19–G25 recorded and closed from the P4 prototype (CCR-BR-010)<br>0.8 (2026-10-02): G17 and G18 recorded and closed from the P2 prototype (CCR-BR-009)<br>0.7 (2026-10-02): G11 status reworded (the prototype evidences no requirement); G16 recorded and closed, including the second review pass (CCR-BR-008)<br>0.6 (2026-10-02): G14 and G15 recorded and closed from the in-flight table prototype (CCR-BR-007)<br>0.5 (2026-10-02): G11 closed by ADR-BR-038 (CCR-BR-006)<br>0.4 (2026-10-02): G11 extended and G13 recorded from the GxP prototype (CCR-BR-005)<br>0.3 (2026-10-02): G10–G12 recorded from the host-core prototype (CCR-BR-004)<br>0.2 (2026-10-02): Open items G2–G4 closed by the Effect API prototype; G9 added (CCR-BR-003)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001)                 |

---

## 1. Purpose

This document states what users need from Bridger's plugin runtime
(`@bridger/core`), in their terms. The [behaviours](./behaviors/01-plugin-definition.md)
state how the library is to satisfy those needs, in the library's terms. Every
requirement here traces forward to at least one behaviour in
[§6](#6-traceability).

The prototype checks cited in §7 confirm facts about the Effect platform, not behaviour of Bridger; they are not evidence for any requirement.

These requirements are written **prospectively**, before any implementation
exists, from the design in `docs/SPEC.md` and from the GxP obligations a
regulated user of the library carries. That direction has the opposite weakness
to qadi's retroactive requirements: they describe intent, not proven behaviour.
Nothing here is evidence that the library does anything. [§7](#7-known-gaps-and-open-items)
records what is still undecided.

### 1.1 Scope

| Allocation | What |
| ---------- | ---- |
| **Core** (`@bridger/core`) | Installing, activating, replacing and removing plugins at runtime; dependency ordering; leases; failure and health; configuration decoding; observation; attributable operations; the `AuditSink` and `OperationGate` ports; deterministic time and identifiers |
| **Companion** (`@bridger/gxp`, specified later in `references/gxp/`) | A durable audit-trail adapter contract; approval and electronic-signature flows through `OperationGate`; IQ/OQ evidence generated from executed tests |
| **Consumer** (the regulated user's system) | Authentication and identity binding; audit storage, retention, protection, review and archival; clock synchronisation; system validation (IQ/OQ/PQ); procedures, training, periodic review; security of the process |
| **Companions** (specified as Drafts, CCR-BR-021) | Out-of-process plugins (`@bridger/remote`); host federation (`@bridger/federation`); cross-host event delivery (`@bridger/durable-bus`); loading and signature checks (`@bridger/loader`); hash chaining of stored records (`@bridger/audit-chain`); entitlement and budgets (`@bridger/entitlement`); command catalog, MCP and agent seams (`@bridger/command`, `@bridger/mcp`, `@bridger/agent`); developer kit (`@bridger/kit`). Isolation of out-of-process code is allocated to the consumer (host mechanism and deployment), not to Bridger |
| **Out of scope** | Fetching, verifying or sandboxing plugin code in core; domain models; HTTP, UI or CLI integration; compensation of external effects |

Bridger runs plugins; it does not authenticate, persist, or validate. A library
cannot be validated on its own: validation is an activity a regulated user
performs on a computerized system that includes it. See
[ADR-BR-028](./decisions/028-gxp-scope.md) and the
[regulatory scope](./gxp/01-regulatory-scope.md).

## 2. User groups

| Group | Needs |
| ----- | ----- |
| **Application developer** | Install, use and observe plugins without ordering providers by hand |
| **Plugin author** | Declare typed dependencies, configuration and health; write teardown that is safe |
| **Operator / administrator** | Change the running plugin set safely; diagnose stalls and failures; shut down with a report |
| **QA / validation lead** | See who changed what, when and why; know which compliance obligations the library supports and which remain the system's; obtain evidence that was produced by executed tests |
| **Test author** | Drive the host deterministically, including time, identifiers and injected faults |
| **Partner** | Implements a contract consumed by a Bridger application, from its own process, without using Effect (companions, URS-BR-048) |

## 3. Functional requirements

### URS-BR-001: Install plugins at runtime without ordering providers

An application must be able to install plugins in any order while it runs, and
have each start as soon as what it needs is available.

Rationale: manual ordering is the step that gets wrong first when the plugin
set changes at runtime.

### URS-BR-002: Remove or replace a plugin safely while it is in use

An operator must be able to remove or replace a plugin while other plugins and
calls depend on it, without those dependents observing a closed provider.

Rationale: a runtime that can add but not safely remove is a runtime that must
be restarted for every change.

### URS-BR-003: Catch undeclared dependencies at compile time

A plugin author must learn at compile time that a plugin uses a service it did
not declare.

Rationale: a dependency discovered at runtime is discovered in production.

### URS-BR-004: Know why a plugin is not running

An operator must be able to see, for every installed plugin, its state and the
reason it is not active: which services are missing, or in which phase it
failed.

### URS-BR-005: Never lose a provider in the middle of a call

A call that has started using a service must not see that service close
underneath it, and a call that never ends must not block removal forever.

### URS-BR-006: Recover from failure explicitly and never silently

A failed plugin must stay failed until someone acts, so that repeated side
effects of a failing start are visible rather than retried away.

### URS-BR-007: Configure plugins safely including secrets and live changes

A plugin author must receive configuration checked against its schema before the plugin starts,
secrets must never appear in observable output, and settings declared as live
must change without a restart.

### URS-BR-008: Shut down with a report of what failed

Shutting down must stop everything in a safe order and report every cleanup
that failed and every lease that had to be revoked.

### URS-BR-009: See plugin lifecycle in existing tracing logs and metrics

Lifecycle transitions must appear in the application's existing Effect tracing,
logs and metrics, with plugin identity attached.

### URS-BR-010: Detect a plugin that waits forever

A plugin that waits for a provider that never arrives must be reported, not
left as a silent hang.

### URS-BR-011: Run the same plugin once per tenant or database

An application must be able to run the same plugin definition more than once,
each instance resolving its own copy of selected services.

### URS-BR-012: Use a dependency when it is present without requiring it

A plugin must be able to use a service if it is available, and react when it
appears or disappears, without failing to start when it is absent.

### URS-BR-013: Exchange typed events between plugins

Plugins must be able to publish and handle events whose arguments, results and
errors are checked at compile time, with listeners removed automatically when
their plugin stops.

### URS-BR-014: Contribute to a shared extension point safely

Several plugins must be able to add entries to one shared registry, and each
plugin's entries must disappear when it stops without disturbing the others.

### URS-BR-015: Switch several behaviours atomically

An application must be able to replace a set of related behaviours so that no
call ever observes a mixture of old and new.

### URS-BR-016: Drive the plugin set from a declarative list

An operator must be able to state the desired plugin set as data and have the
host converge on it repeatedly with the same result.

### URS-BR-017: Bind sub-plugins to the lifetime of a parent

A plugin must be able to start sub-plugins that are removed when it stops.

### URS-BR-018: Host plugins from code that does not use Effect

An application written without Effect (a React client, a script) must be able
to create, use and shut down a host and receive its shutdown report.

### URS-BR-019: Test plugin lifecycles deterministically with injected faults

A test author must be able to step the host, control time and identifiers, and
inject build, stop, lease and runtime faults.

### URS-BR-020: Load plugin definitions dynamically while running

An application must be able to install a definition produced by a dynamic
import at any time, with the host making no assumption about where it came
from.

### URS-BR-021: Know who changed the plugin set when and why

A QA lead must be able to attribute every change to the running plugin set to
an actor, a time and, where required, a reason.

Rationale: ALCOA+ *Attributable* and *Contemporaneous*; 21 CFR 11.10(e); EU GMP
Annex 11 §9.

### URS-BR-022: Obtain a complete ordered and gap-detectable lifecycle record

A QA lead must receive, for every change, a record of the request and of its
outcome, in an order that cannot be confused, with gaps detectable.

Rationale: ALCOA+ *Complete* and *Consistent*. A trail with silent holes cannot
be reviewed.

### URS-BR-023: Prevent a change that cannot be recorded

When a change cannot be recorded, it must not happen.

Rationale: a change made while the trail is unavailable is a change nobody can
later reconstruct.

### URS-BR-024: Require approval before a regulated change

A regulated user must be able to require an approval, or an electronic
signature, before a lifecycle change proceeds, with no path around it through
the host.

Rationale: 21 CFR 11.10(f)–(g), 11.50, 11.70 (approval and signature
manifestation themselves belong to the companion and the consumer).

### URS-BR-025: Generate qualification evidence from executed tests

A validation lead must be able to obtain operational-qualification evidence that
was produced by tests that actually ran against the installed package.

Rationale: the qadi predecessor shipped qualification steps that were
`typeof x === "function"` checks; evidence that does not test is a liability.

### URS-BR-026: Know which compliance obligations remain mine

A QA lead must be able to see, clause by clause, what the library supports,
what the companion supports and what remains the regulated system's
responsibility.

### URS-BR-027: Reproduce time and identifiers during validation

A validation lead must be able to run the host with controlled time and
identifiers, so that executed tests are reproducible.

### URS-BR-028: Know which plugin version was active at any time

A QA lead must be able to establish, from the record, which definition version
and digest of each plugin was active over any period.

### URS-BR-029: Evolve a service contract without breaking its consumers

An integrator must be able to publish a new version of a service contract,
run providers and consumers built against different compatible versions
together, and be told at the call — naming both plugins — when a change
would leave a consumer with a provider it is not compatible with.

Rationale: separately built, remote and lazily loaded plugins each carry
their own copy of a contract; matching by object alone (ADR-BR-011) cannot
bind them, and matching by name alone cannot refuse an incompatible one.

### URS-BR-030: Know what a plugin declares before running its code

An integrator, an operator or a reviewer must be able to read what a plugin
provides, requires, contributes and asks for — and what an upgrade asks for
that the previous version did not — without loading or running the plugin.

### URS-BR-031: Start a plugin only when it is needed

An integrator must be able to register a plugin so that its code is loaded
and built only when something needs it, while its provider slots,
dependencies and versions are decided at registration as for any plugin.

### URS-BR-032: Know which plugin made a change and for whom

A QA lead must be able to tell, from the record of a plugin-set change made
by plugin code, on behalf of which plugin — by id, realm, version and digest
— the calling code ran, alongside the actor on whose request it was made,
without that plugin being able to name another. (A provider's method serving
another plugin runs on behalf of that consumer unless the provider states
otherwise; 28 — Plugin Principal and Mandatory Policy, BEH-BR-258.)

### URS-BR-033: Enforce a policy wrapper that no plugin can remove

A system owner must be able to attach a wrapper to a service, decide whether
a plugin may mount children, and decide who may emit, listen and contribute,
such that no plugin or child can remove or replace these through the
library's API.

Rationale: in-process plugins are trusted code; the requirement is about
the library's API, not about isolation (ADR-BR-019).

### URS-BR-034: Narrow and log what each plugin can call

A system owner must be able to restrict each consumer to named members of a
service it resolves, and to obtain one access-log entry per call made
through a resolved service, without the library storing those entries.

### URS-BR-035: Carry labels such as taint provenance and deadline across calls

An integrator must be able to attach typed labels — taint, provenance, a
deadline, and labels of its own — to a chain of work, and rely on the
library to carry each label only to the places it declares: event
listeners, the gate, the capability policy, the call log and the audit
record.

### URS-BR-036: Let several plugins take part in one decision under a stated failure policy

An application developer must be able to let several plugins veto, enrich or
advise on one decision, with a rule of their own over who may veto, a time
budget for the whole decision, a stated outcome when a contributor fails or
is slow, and a record of which contributor decided — without a failing
contributor stopping the plugin or the decision.

Rationale: policy hooks (approval of regulated commands by shipped code
only; a loyalty extension that must never block a sale) need authority,
budget and accountability that `waterfall` does not give.

### URS-BR-037: Review a proposed plugin-set change before it is applied

An operator or an automated agent must be able to see exactly what a change
to the plugin set would do before doing it, have it approved, and apply it
only if the host is still in the state it was planned against; any gate must
be able to answer "not yet" as well as yes or no.

Rationale: self-modifying systems (agents adding tools, update services) are
reviewable only if what is applied is what was reviewed.

### URS-BR-038: Create a plugin set per key on demand and reclaim it when idle

An application developer must be able to run a plugin set per key learnt at
run time (an organisation, a workspace), created on first use and removed
when idle without cutting off any call in flight — without the library
presenting this as separation of one key's data from another's.

### URS-BR-039: Run a short-lived plugin set for delegated work

An application developer must be able to run a plugin set that lives exactly
as long as one task, leaves nothing behind, and whose changes are recorded as
made by that task on behalf of the person or service that started it.

### URS-BR-040: Keep a plugin's state across a replacement

An operator replacing a plugin with a new version must be able to keep the
plugin's in-memory state when both versions support it, and must be able to
see from the record when the state could not be kept.

### URS-BR-041: Use plugin code that runs outside the host process

An application must be able to use a plugin whose code runs in another
thread, process, isolate or host as an ordinary plugin of its host, with the
same withdrawal guarantees, waiting rather than failing while the code is
unreachable, every remote call bounded by a deadline, and the remote code
limited to the services granted to it.

Rationale: architecture review 2026-11-08, item 2; third-party code must run
out of process behind a proxy plugin, since in-process code is never
confined (A1). Allocated to the `@bridger/remote` companion; isolation of the
other process or isolate is allocated to the consumer.

### URS-BR-042: Run each host of a fleet from one authority, including offline

An operator of many hosts must be able to state, in one place, what each host
runs and which hosts talk to each other; each host must converge on that state,
keep running its last confirmed state while the authority is out of reach for
a bounded time, and apply a kill decision at its next contact.

Rationale: architecture review 2026-11-08, item 8. Allocated to the
`@bridger/federation` companion; core supplies `reconcile`, realms, attribution,
gate and audit.

### URS-BR-043: Deliver business events across hosts and outages without loss or duplication of effect

A developer must be able to record a business event in the same storage
transaction as the state change it describes, and have it delivered to other
hosts after any outage, in order per stream, with repeated deliveries absorbed.

Rationale: architecture review 2026-11-08, item 9. Allocated to the event
delivery companion (package `@bridger/durable-bus`, a name kept as intent
only, not a claim; ADR-DB-007) and to the consumer's storage adapter; core
owns no storage.

### URS-BR-044: Offer commands to callers and agents through one path

An application must be able to describe its state-changing operations once,
as typed commands, and have the UI, APIs, jobs and an AI agent reach them
through one path that consults the same approval gate, with a deterministic,
per-principal list of what each caller is offered.

Rationale: architecture review 2026-11-08, item 11. Allocated to the
`@bridger/command` companion.

### URS-BR-045: Expose and consume tools over MCP without a second path

An application must be able to serve its commands to MCP clients, and use
tools of external MCP servers, without a second tool registry and with
external output marked as untrusted.

Rationale: architecture review 2026-11-08, item 11. Allocated to the
`@bridger/mcp` companion.

### URS-BR-046: Run an agent whose writes cannot happen without approval after untrusted input

An application must be able to run an agent loop with replaceable parts,
observe its tasks, delegate to narrower subagents, and be sure that once a
session has read untrusted text, no write happens without a person's
approval; and must be able to test the agent deterministically without a
live model.

Rationale: architecture review 2026-11-08, item 12. Allocated to the
`@bridger/agent` companion; core supplies the taint and provenance
annotations, the gate, realm families and narrowed actors.

### URS-BR-047: Write and test plugins without casts or Effect boilerplate

A plugin author must be able to declare a plugin, put it into a host or a
list, and test it with doubles, without type assertions, and must get a
one-line message naming the plugin and the key when declared and used
services disagree.

Rationale: architecture review 2026-11-08, item 17. Allocated to the
`@bridger/kit` companion, with the core type `Plugin.Any` (BEH-BR-001).

### URS-BR-048: Implement a contract without learning Effect

A partner must be able to implement a published contract as plain
asynchronous functions over JSON-shaped data, run out of process, and check
the implementation against suites published with the contract.

Rationale: architecture review 2026-11-08, item 17. Allocated to the
`@bridger/kit` companion, over `@bridger/remote`.

### URS-BR-049: Keep a policy decision closed while a contributor to it is not yet loaded

An application developer must be able to rely on a contributor that may veto
a decision being asked, or the decision being refused, even when the plugin
that contributes it is registered lazily and has not been loaded yet — never
on the decision being allowed because the contributor's code has not run.

Rationale: Bridger recheck 2026-11-08, item K1 (contradiction X1 between
lazy activation and hook points). Allocated to core.

### URS-BR-050: Let a plugin started by an event receive that event

An application developer must be able to register a plugin that is loaded
when an event is first dispatched and that then receives the event that
caused it to load, within a stated bound, with a diagnostic when it does
not.

Rationale: Bridger recheck 2026-11-08, item K9. Allocated to core; consumers
that must see every event use the event delivery companion.

### URS-BR-051: Apply a reviewed plugin set change as a whole or not at all

An operator applying a reviewed change to a host's plugin set — a bundle
switched at a safe point — must be able to have every change of it made, or
the previous plugin set registered again, or be told exactly which changes
remain applied; and must not have to order the list by hand for providers
to come before the plugins that need them.

Rationale: Bridger recheck 2026-11-08, item K2 (gap G36). "As a whole"
covers the host's plugin set, not external effects of plugin code.

### URS-BR-052: Rely on the contract version of every implementation in an extension point

An application developer collecting several implementations of one contract
in one extension point must be able to state the contract version range it
accepts, have an implementation of another version refused when it is added,
and choose among implementations by version range.

Rationale: Bridger recheck 2026-11-08, item K3.

### URS-BR-053: Keep a revoked plugin version from running again, whatever starts it

An operator who revokes a plugin version must be sure that, from then on, no
route through the host starts code of that version again — an operator call,
a dependency returning, a lazy trigger, a background restart or a parent
mounting it — and that each refused start is in the audit trail.

Rationale: Bridger recheck 2026-11-08, item K4 (gap G60). Core supplies the
`RefusalList` port (BEH-BR-267); the revocation feed is the loader
companion's.

### URS-BR-054: Follow one request through everything it causes

A reviewer must be able to follow one request — a command, a host call, an
agent step — through the host records, gate requests, hook decisions, nested
host calls and call-log entries it caused, by one correlation id, without
every dispatcher passing that id by hand.

Rationale: Bridger recheck 2026-11-08, item K6 (gap G58).

### URS-BR-055: Refuse a call whose access cannot be logged

A deployment that keeps a data-access log must be able to require, per
service, that a call whose log entry cannot be delivered does not deliver its
result, rather than proceed unlogged.

Rationale: Bridger recheck 2026-11-08, item K7 (gap G42).

### URS-BR-056: Keep event-sourced business streams with the outbox in one transaction

A developer must be able to append business events to a stream with an
expected version, fold them into state, feed read models that never skip an
event, and publish selected events in the same storage transaction as the
append — and record a fact that happened offline without the receiving host
being able to reject it.

Rationale: Bridger recheck 2026-11-08, item 26. Allocated to the
`@bridger/event-store` companion and the consumer's storage adapter; core
owns no storage.

### URS-BR-057: Number records per host without gaps, reuse or renumbering

An operator must be able to give each host its own number series whose
committed numbers are contiguous, which can be closed, which never renumbers
or reuses a number even after a restore from backup, and which an authority
can check for gaps, duplicates and numbers after closure.

Rationale: Bridger recheck 2026-11-08, item 27. Allocated to the
`@bridger/sequence` companion; formats stay in the application.

### URS-BR-058: Make a subject's personal fields unreadable without rewriting history

A QA or data-protection lead must be able to have the personal fields of
stored and published events encrypted under a per-subject key, later have
that key destroyed and registered read models drop their plaintext, while
streams and hash chains stay intact and verifiable — with the limits of that
removal stated.

Rationale: Bridger recheck 2026-11-08, item 28. Allocated to the
`@bridger/keyring` companion; which fields are personal data, key custody and
backups are the consumer's.

<a id="urs-br-059-erase-a-persons-data-from-events-without-breaking-their-order"></a>

### URS-BR-059: Make a person's event payloads unreadable without breaking their order

A developer must be able to make the payloads of events that carry personal
data unreadable on request (for example by destroying a per-subject key) to
every holder that has no other copy of the destroyed key, while the order,
identities and access checks of the stream keep working, and must have
written guidance on which fields must never carry personal data because they
cannot be made unreadable selectively. The requirement does not ask for
erasure: copies of the key outside the key store, unexpired backups and
hosts that held the key and were not told of its destruction can still read
the payloads, and the result must not be described as erasure
(keyring BEH-KR-022).

Rationale: Bridger recheck 2026-11-08, item 21. Allocated to the event
delivery companion's `PayloadCodec` (durable-bus BEH-DB-008) and to the
keyring companion (URS-BR-058); core supplies no payload handling. Retitled
and narrowed by CCR-BR-029 (agent review R5-08): the earlier text, "wherever
the event was copied", claimed more than a key destruction gives. The
earlier anchor is kept for existing links.

## 4. Non-functional requirements

### NFR-BR-001: Determinism

Given the same inputs, `Clock` and `IdGenerator`, the host produces the same
snapshots, events and audit records.

### NFR-BR-002: Type safety

Plugin dependencies, configuration, event payloads and errors are expressed in
types, and illustrative examples in this specification compile once code exists.

### NFR-BR-003: Coverage

Line and branch coverage of `packages/core` at or above 95% once code exists.

### NFR-BR-004: Executable documentation examples

Every example marked runnable compiles in the merge gate once code exists; until
then all examples are marked illustrative.

### NFR-BR-005: Specification integrity

The specification passes `scripts/verify-traceability.sh --strict`.

### NFR-BR-006: Runtime dependency on effect only

`@bridger/core` has a single runtime dependency, `effect`.

### NFR-BR-007: Bounded memory

Every buffer the host owns is bounded or released: the event buffer, retired
generations, drained registries and removed plugins' state.

### NFR-BR-008: Mutation testing

Mutation score at or above 80% on `packages/core` and, when it exists, on
`packages/gxp`.

## 5. Assumptions

| # | Assumption |
| - | ---------- |
| A1 | Plugins are trusted code running in the host's process. Bridger provides no sandbox. |
| A2 | The consumer authenticates users and binds them to an `Actor` before calling the host. |
| A3 | The consumer's clock is synchronised to a trusted time source. |
| A4 | The consumer stores, protects, retains and reviews audit records that an `AuditSink` receives. |
| A5 | Effect 4.x behaves as documented; Bridger's guarantees are no stronger than the Effect runtime's. |
| A6 | Each regulated user validates the computerized system that includes Bridger; this specification is input to that validation, not a substitute for it. |

## 6. Traceability

Behaviours are cited by file; each `BEH-BR` identifier names the requirements
it satisfies in its `**Satisfies:**` line.

| Requirement | Behaviours | Invariants |
| ----------- | ---------- | ---------- |
| URS-BR-001 | [03](./behaviors/03-installation.md), [05](./behaviors/05-activation.md) | INV-BR-001, INV-BR-002, INV-BR-003 |
| URS-BR-002 | [06](./behaviors/06-removal.md), [07](./behaviors/07-replacement-and-reactivation.md), [08](./behaviors/08-operation-legality.md) | INV-BR-005, INV-BR-009, INV-BR-011 |
| URS-BR-003 | [01](./behaviors/01-plugin-definition.md) | INV-BR-015 |
| URS-BR-004 | [04](./behaviors/04-states-and-snapshots.md), [13](./behaviors/13-observability-and-diagnostics.md) | INV-BR-008 |
| URS-BR-005 | [09](./behaviors/09-leases.md) | INV-BR-006, INV-BR-016, INV-BR-017 |
| URS-BR-006 | [07](./behaviors/07-replacement-and-reactivation.md), [10](./behaviors/10-runtime-failure-and-health.md) | INV-BR-007 |
| URS-BR-007 | [11](./behaviors/11-configuration.md) | INV-BR-013 |
| URS-BR-008 | [12](./behaviors/12-shutdown-and-hosting.md) | INV-BR-018 |
| URS-BR-009 | [13](./behaviors/13-observability-and-diagnostics.md) | INV-BR-008 |
| URS-BR-010 | [13](./behaviors/13-observability-and-diagnostics.md) | — |
| URS-BR-011 | [17](./behaviors/17-realms-and-interception.md) | INV-BR-001, INV-BR-020 |
| URS-BR-012 | [15](./behaviors/15-optional-and-reactive.md) | INV-BR-019 |
| URS-BR-013 | [16](./behaviors/16-event-bus.md) | — |
| URS-BR-014 | [19](./behaviors/19-contribution-registry.md) | INV-BR-017 |
| URS-BR-015 | [20](./behaviors/20-generation.md) | INV-BR-017 |
| URS-BR-016 | [18](./behaviors/18-reconciliation-and-confluence.md) | INV-BR-021 |
| URS-BR-017 | [14](./behaviors/14-children-and-groups.md) | INV-BR-005 |
| URS-BR-018 | [12](./behaviors/12-shutdown-and-hosting.md), [02](./behaviors/02-host-construction.md) | INV-BR-018 |
| URS-BR-019 | [21](./behaviors/21-testing-host.md) | INV-BR-024 |
| URS-BR-020 | [01](./behaviors/01-plugin-definition.md), [03](./behaviors/03-installation.md) | INV-BR-012 |
| URS-BR-021 | [22](./behaviors/22-attributable-operations.md), [23](./behaviors/23-audit-sink-and-record.md) | INV-BR-025 |
| URS-BR-022 | [23](./behaviors/23-audit-sink-and-record.md), [24](./behaviors/24-time-ids-and-sequence.md) | INV-BR-022, INV-BR-023 |
| URS-BR-023 | [23](./behaviors/23-audit-sink-and-record.md) | INV-BR-027, INV-BR-029 |
| URS-BR-024 | [25](./behaviors/25-operation-gate.md) | INV-BR-026, INV-BR-027 |
| URS-BR-025 | [21](./behaviors/21-testing-host.md); [validation plan](./gxp/04-validation-plan.md) (companion) | — |
| URS-BR-026 | [compliance matrix](./gxp/02-compliance-matrix.md) | — |
| URS-BR-027 | [24](./behaviors/24-time-ids-and-sequence.md), [21](./behaviors/21-testing-host.md) | INV-BR-024 |
| URS-BR-028 | [23](./behaviors/23-audit-sink-and-record.md), [04](./behaviors/04-states-and-snapshots.md) | INV-BR-022 |
| URS-BR-029 | [26](./behaviors/26-versioned-contracts.md) | INV-BR-015, INV-BR-031 |
| URS-BR-030 | [27](./behaviors/27-manifest-and-lazy-activation.md), [26](./behaviors/26-versioned-contracts.md) | INV-BR-034 |
| URS-BR-031 | [27](./behaviors/27-manifest-and-lazy-activation.md) | INV-BR-011, INV-BR-032, INV-BR-033 |
| URS-BR-032 | [28](./behaviors/28-plugin-principal-and-mandatory-policy.md) | INV-BR-035 |
| URS-BR-033 | [28](./behaviors/28-plugin-principal-and-mandatory-policy.md) | INV-BR-036, INV-BR-037 |
| URS-BR-034 | [29](./behaviors/29-capability-grants-and-call-log.md) | INV-BR-037, INV-BR-038 |
| URS-BR-035 | [30](./behaviors/30-operation-context-annotations.md) | INV-BR-039 |
| URS-BR-036 | [31](./behaviors/31-hook-points.md) | INV-BR-040, INV-BR-041, INV-BR-042 |
| URS-BR-037 | [32](./behaviors/32-generic-gate-and-plan.md) | INV-BR-043 |
| URS-BR-038 | [33](./behaviors/33-realm-families.md) | INV-BR-044, INV-BR-020 |
| URS-BR-039 | [33](./behaviors/33-realm-families.md) | INV-BR-044, INV-BR-025 |
| URS-BR-040 | [34](./behaviors/34-state-handoff.md) | INV-BR-045 |
| URS-BR-041 | [remote 01–08](../remote/README.md) (companion), [14](./behaviors/14-children-and-groups.md), [26](./behaviors/26-versioned-contracts.md) | INV-RM-001–009 (companion) |
| URS-BR-042 | [federation 01–05](../federation/behaviors/01-host-manifest.md) (companion), [18](./behaviors/18-reconciliation-and-confluence.md) | INV-BR-021 |
| URS-BR-043 | [event delivery 01–08](../durable-bus/behaviors/01-events-and-envelope.md) (companion) | — |
| URS-BR-044 | [command 01–04](../command/behaviors/01-command-definition.md) (companion), [31](./behaviors/31-hook-points.md), [32](./behaviors/32-generic-gate-and-plan.md) | — |
| URS-BR-045 | [mcp 01–04](../mcp/behaviors/01-server.md) (companion) | — |
| URS-BR-046 | [agent 01–05](../agent/behaviors/01-agent-seams.md) (companion), [30](./behaviors/30-operation-context-annotations.md), [33](./behaviors/33-realm-families.md) | INV-BR-039 |
| URS-BR-047 | [kit 01](../kit/behaviors/01-plugin-facade.md), [kit 02](../kit/behaviors/02-plugin-test.md) (companion), [01](./behaviors/01-plugin-definition.md) | INV-KT-001, INV-KT-002 (companion) |
| URS-BR-048 | [kit 03](../kit/behaviors/03-conformance-kits.md), [kit 05](../kit/behaviors/05-promise-sdk.md) (companion) | INV-KT-005, INV-KT-006 (companion) |
| URS-BR-049 | [31](./behaviors/31-hook-points.md), [27](./behaviors/27-manifest-and-lazy-activation.md) | INV-BR-040, INV-BR-046 |
| URS-BR-050 | [27](./behaviors/27-manifest-and-lazy-activation.md), [16](./behaviors/16-event-bus.md) | INV-BR-047 |
| URS-BR-051 | [32](./behaviors/32-generic-gate-and-plan.md), [18](./behaviors/18-reconciliation-and-confluence.md), [34](./behaviors/34-state-handoff.md) | INV-BR-048, INV-BR-021 |
| URS-BR-052 | [26](./behaviors/26-versioned-contracts.md), [19](./behaviors/19-contribution-registry.md) | INV-BR-049, INV-BR-031 |
| URS-BR-053 | [28](./behaviors/28-plugin-principal-and-mandatory-policy.md), [05](./behaviors/05-activation.md), [10](./behaviors/10-runtime-failure-and-health.md), [14](./behaviors/14-children-and-groups.md) | INV-BR-050 |
| URS-BR-054 | [22](./behaviors/22-attributable-operations.md), [23](./behaviors/23-audit-sink-and-record.md), [30](./behaviors/30-operation-context-annotations.md), [31](./behaviors/31-hook-points.md) | INV-BR-051 |
| URS-BR-055 | [29](./behaviors/29-capability-grants-and-call-log.md) | INV-BR-052 |
| URS-BR-056 | [event-store 01–05](../event-store/README.md) (companion), [24](./behaviors/24-time-ids-and-sequence.md) | INV-ES-001–006 (companion) |
| URS-BR-057 | [sequence 01–03](../sequence/README.md) (companion), [24](./behaviors/24-time-ids-and-sequence.md) | INV-SQ-001–005 (companion) |
| URS-BR-058 | [keyring 01–03](../keyring/README.md) (companion), [29](./behaviors/29-capability-grants-and-call-log.md) | INV-KR-001–005 (companion) |
| URS-BR-059 | [event delivery 01](../durable-bus/behaviors/01-events-and-envelope.md) (companion), [keyring](../keyring/README.md) (companion) | INV-DB-010 (companion) |
| NFR-BR-001 | [24](./behaviors/24-time-ids-and-sequence.md), [21](./behaviors/21-testing-host.md) | INV-BR-024 |
| NFR-BR-002 | [01](./behaviors/01-plugin-definition.md), [16](./behaviors/16-event-bus.md) | INV-BR-015 |
| NFR-BR-003 | [Definitions of Done](./process/definitions-of-done.md) | — |
| NFR-BR-004 | [Definitions of Done](./process/definitions-of-done.md) | — |
| NFR-BR-005 | [Definitions of Done](./process/definitions-of-done.md) | — |
| NFR-BR-006 | [ADR-BR-001](./decisions/001-effect-v4-as-effect-system.md) | — |
| NFR-BR-007 | [13](./behaviors/13-observability-and-diagnostics.md), [20](./behaviors/20-generation.md) | INV-BR-017 |
| NFR-BR-008 | [Definitions of Done](./process/definitions-of-done.md) | — |

## 7. Known gaps and open items

| # | Item | Status |
| - | ---- | ------ |
| G1 | No implementation exists. Every requirement is unverified. | Open — by design of this phase ([ADR-BR-036](./decisions/036-prospective-specification.md)) |
| G2 | Per-subscriber lag behaviour of a sliding `PubSub` in Effect 4.x. | Closed (CCR-BR-003): lag is per subscriber — a slow subscriber loses only its own oldest messages, a fast one loses nothing, and publishing never blocks. Platform fact confirmed by prototype checks E1a–E1c in `prototypes/effect-v4-api` (effect 4.0.0, Node 22; see its `RESULTS.md`) |
| G3 | Whether `Layer.effectContext` (used by `Plugin.fromEffect`) exists in Effect 4.x. | Closed (CCR-BR-003): it exists, lifts an `Effect<Context>` into a `Layer`, and releases scoped resources with the build scope. Prototype checks E2a–E2b |
| G4 | How to force a `ManagedRuntime` layer build without running an effect. | Closed (CCR-BR-003): `runtime.context()` forces the build without running an effect, caches it, and rejects when the layer fails. Prototype checks E3a–E3e |
| G5 | A changed service *shape* under an unchanged `ServiceId` cannot be detected by the core. | Residual risk (RSK-BR-010); mitigated by the versioned-identifier convention. Narrowed (CCR-BR-017): for contract keys, the major is part of the `ServiceId`, ranges are checked and method names compared at registration (BEH-BR-225, BEH-BR-228); a schema change within a major remains undetected by core (BEH-BR-230, RSK-BR-025) |
| G6 | A re-entrant wait that passes through another fiber cannot be detected. | Residual risk (RSK-BR-011); bounded by drain limits |
| G7 | Independent review of this specification is not yet possible (single maintainer). | Open — see [change control](./process/change-control.md) §5 |
| G8 | The `@bridger/gxp` companion is not yet specified. | Closed (CCR-BR-015): specified as a Draft in `references/gxp/` (CCR-GX-001); not approved, not implemented. That Draft is not present in this repository; see G35 |
| G10 | The `IdentifiersOf` helper as first written yields `unknown` for an empty tuple, so a plugin that provides nothing could not type-check. | Closed (CCR-BR-004): made distributive in BEH-BR-002; found by the compiler in `prototypes/host-core` |
| G11 | A system-initiated stop of a dependent (its provider is being removed) can meet an operator operation already in flight on that dependent; the specification ordered operations per plugin but did not say how a stop that crosses plugins is ordered against them. | Closed by [ADR-BR-038](./decisions/038-cross-plugin-stop-ordering.md) and BEH-BR-078–080 (CCR-BR-006): no host-wide order; waits run only from a provider to its dependents; a cascade waits for a dependent's step, never its operation, and ends a parked intent rather than completing it; `WouldDeadlock` is decided before any wait. The host-core prototype replaced its host-wide lock with per-plugin admission, consistent with the rule in throwaway prototype scenarios modelled on checks 43–45; the prototype evidences no requirement. The rule was amended by CCR-BR-008 (G16) |
| G12 | How a forced removal revokes a scoped `lease()` was unspecified. | Closed (CCR-BR-004): it interrupts the acquiring fiber (BEH-BR-086) |
| G13 | Whether acknowledging the audit latch needs only a writable sink or a drained backlog. | Closed (CCR-BR-005): a drained backlog (BEH-BR-206); found by the GxP prototype in `prototypes/host-core` |
| G14 | With per-plugin ordering, a call can wait for its turn at the linearization point after its `requested` record, and that turn can be held by a call waiting for a system stop to drain; BEH-BR-188 made that span uninterruptible. | Closed (CCR-BR-007): interruption is allowed; the call changes nothing and ends with a `failed` terminal record (`Interrupted`) (BEH-BR-188, BEH-BR-067); found by the in-flight table prototype. Refined by CCR-BR-008 (G16): the passage from the gate's approval to the enqueue of the `requested` record stays uninterruptible, and the first terminal cause wins |
| G15 | Whether a call that parked an operation gets a second terminal record when the parked operation is later joined, superseded or ended. | Closed (CCR-BR-007): no; its `failed` (`DrainTimeout`) record is final (BEH-BR-074) |
| G16 | A review of CCR-BR-003..007 by three agent reviewers (not the independent review of PROC-03 §5) found contradictions and undefined cases in the G11, G14 and G15 amendments. A second review pass of the resolutions found further cases — how an ended intent is recorded, the direction of mount edges, stops left unsettled by a call that fails with `DrainTimeout`, parking during shutdown, and `requireReason` for a `reconcile` whose diff changes before its intent. | Closed by CCR-BR-008 (both passes) |
| G17 | BEH-BR-092 makes an in-flight health check a lease that a drain waits for; BEH-BR-093 interrupts it when the plugin leaves `active`. | Closed (CCR-BR-009): the check is interrupted when the stop begins, so its lease ends at once (BEH-BR-092); found by the P2 host-core prototype |
| G18 | On the scope-close path the audit writer closes with the host scope, so shutdown's terminal record could be lost. | Closed (CCR-BR-009): the scope-close path flushes queued records to the sink, bounded by `auditTimeout` (BEH-BR-108); found by the P2 host-core prototype |
| G19 | `Plugin.Runtime.install` was undefined once the parent's stop had begun: a fiber of the parent could mount a child after the children were removed and before the scope closed, and nothing would remove it. A parked child removal (`next` "gone") resumed by an operation other than `remove` had no defined target. | Closed (CCR-BR-010): the mount fails with `Conflict` (or `HostClosed` under shutdown) and registers nothing (BEH-BR-121, BEH-BR-089 signature); only the parent's stop, shutdown or `remove` resumes a parked child removal, other operations fail with `Conflict` "remove" (BEH-BR-125); found by the P4 host-core prototype |
| G20 | A child's mount and its activation are both `system-start` records; the activation's cause was not stated. | Closed (CCR-BR-010): the mount record carries the registration state; an activation that begins in the mount's revision is caused by the mount record (BEH-BR-126); found by the P4 host-core prototype |
| G21 | A parent that awaits a child inside its build holds a build slot the child's build needs, so the wait can starve even when the child needs nothing of the parent. | Closed (CCR-BR-010): documented, with a SHOULD to await children after the build (BEH-BR-124); found by the P4 host-core prototype |
| G22 | BEH-BR-128 gave a group member's `InstallError` phase "activation"; it fails the group's build Layer, which BEH-BR-037 and BEH-BR-121 call phase "build". | Closed (CCR-BR-010): phase "build" (BEH-BR-128); found by the P4 host-core prototype |
| G23 | The outcome of `parallel`, `serial` and `waterfall` when a listener is interrupted because its plugin was removed during the dispatch was unspecified. | Closed (CCR-BR-010): the dispatch fails with a defect naming the event; under `emit` the interruption is not a `listener-failed` (BEH-BR-141, BEH-BR-142); found by the P4 host-core prototype |
| G24 | BEH-BR-122 lets a child's `intercept` replace inheritance, so BEH-BR-151's order "realm → inherited → own" never had both middle terms, and whether a parent's realm interceptors are inherited was not said. | Closed (CCR-BR-010): realm interceptors, then inherited or own; a parent's realm interceptors are never inherited (BEH-BR-151); found by the P4 host-core prototype |
| G25 | A `starting` plugin whose requirement became unavailable before its build began — waiting for a slot, or its provider hidden by an operation before the provider's stop reached it — had no defined outcome; capture happens when a build begins (BEH-BR-035). | Closed (CCR-BR-010): it returns to `waiting`, not `failed`; a stop cancels a build that holds no slot (BEH-BR-034, BEH-BR-035); found by the P4 prototype's confluence property test, against which the prototype's first choice (`failed`) broke BEH-BR-160 |
| G26 | BEH-BR-174 closed an `acquire` lease's scope with a `LeaseRevoked` cause; in Effect a scope from the caller's environment cannot be closed by a third party. | Closed (CCR-BR-011): the acquiring fiber is interrupted, as BEH-BR-086 revokes a scoped host lease (BEH-BR-172, BEH-BR-174); found by the P5 host-core prototype |
| G27 | A test cannot step its `TestHost`'s scope-close shutdown; and with a lease still held, the close waits on limits read from `TestClock`. | Closed (CCR-BR-011): once the scope begins to close, transitions advance without steps; the held-lease case is documented (BEH-BR-178); found by the P5 host-core prototype |
| G28 | `awaitIdle` on a `TestHost` never returns unless the test steps. | Closed (CCR-BR-011): its meaning is kept and documented; `runUntilIdle` is the stepping form (BEH-BR-178); found by the P5 host-core prototype |
| G29 | `pending` read right after an operation could miss the transition it started; detecting a settlement point needs a quiescence signal Effect does not provide. | Closed (CCR-BR-011): `pending` reads at a settlement point (BEH-BR-178); how to detect one is an implementation matter, noted there; found by the P5 host-core prototype |
| G30 | BEH-BR-177 forbade an alternate scheduling path yet had `TestHost` own the scheduling. | Closed (CCR-BR-011): every transition step and wait goes through one internal scheduling interface; production runs each at once (BEH-BR-177); found by the P5 host-core prototype |
| G31 | Faults need either a production hook or a decoration of definitions; decoration must keep definition identity, and cannot reach children. | Closed (CCR-BR-011): faults apply through the `TestHost`'s own entry points, keeping one object per (definition, realm); children are outside their reach (BEH-BR-180); found by the P5 host-core prototype |
| G32 | BEH-BR-142 covered a listener interrupted by its plugin's removal, not one withdrawn after the dispatch began and before its turn. | Closed (CCR-BR-011): both fail the dispatch with a defect (BEH-BR-142); found by the P5 host-core prototype |
| G33 | BEH-BR-040 defined idle as "no transition is running"; a system stop that was requested and not yet begun — held by a `TestHost`, with no operation in flight and no state change yet — did not count, so `awaitIdle` returned with a child of a failed activation still `active`. | Closed (CCR-BR-012): a step requested and not yet begun counts as a transition (BEH-BR-040, BEH-BR-178); acceptance check 6 extended (BEH-BR-183); found when the P4 suites were moved onto `TestHost` |
| G34 | BEH-BR-106 and the audit position: the `CloseReport` is produced before the shutdown's own terminal record is written, so a last-written sequence number in the report cannot include that record. | Closed (CCR-BR-014): `CloseReport.auditLastSeq` is the highest `auditSeq` written when the report is produced (BEH-BR-106), and `Host.controls` stays readable after close, so the final audit position can be read once the writer has flushed (BEH-BR-212); found by the CCR-BR-014 prototype |
| G35 | The `@bridger/gxp` companion Draft (`references/gxp/`, Draft 0.1, CCR-GX-001), on which the closure of G8 rests, is not present in this repository: core documents cite its compliance matrix and behaviour files, but they cannot be inspected or reviewed here. G8 is not reopened by this entry; its closure rests on a Draft that cannot be inspected. | Open (CCR-BR-016): core links into `references/gxp/` were turned into plain-text citations (ADR-BR-034, the regulatory scope, the compliance matrix, the validation plan, the roadmap's P6 row); the companion Draft must be restored to the repository or re-drafted, under its own change control, before any core document may rely on it |
| G36 | `reconcile` executes entries in list order (BEH-BR-156); a list that upgrades a provider and installs a dependent needing the upgrade is refused with `IncompatibleContract` for the dependent unless the provider's entry comes first, and converges only on the next run. | Closed (CCR-BR-025): `reconcile` orders removals dependents first and other changes providers first (BEH-BR-156); `atomic` undoes a list that is still refused (BEH-BR-322–326, ADR-BR-051). A provider narrowed under a listed dependent's current definition still needs two runs (BEH-BR-156; gap G65) |
| G37 | A loaded lazy plugin is never returned to `dormant`; returning it when idle would deactivate behaviour but not reclaim imported code (BEH-BR-008). | Closed (CCR-BR-024): `Plugin.lazy({ idle })` returns an idle loaded plugin to `dormant` through a normal, ungated system stop recorded as `lazy-idle`; the loaded definition is released and the next wake loads again (BEH-BR-252) |
| G38 | A loaded plugin that contributes to a registry or listens to an event its manifest did not declare is not detected by core. | Closed (CCR-BR-026): `AccessPolicy.declaredOnly` compares listen and contribute requests with the manifest, including its `listens` field (BEH-BR-268, BEH-BR-241); a deployment that does not wire it is not checked |
| G39 | Whether `Host.wake` (BEH-BR-245), which is not a mutating operation, runs under the caller's `CurrentPlugin` and records `onBehalfOf`; file 27 records the wake as a system transition attributed to `Actor.system`. | Closed (CCR-BR-024): `wake` reads the caller's principal as a mutating call does; the root `lazy-triggered` record of a `wake` or of an event dispatch carries it as `onBehalfOf`, attributed still to `Actor.system` — the one exception to BEH-BR-259's rule that system records carry none (BEH-BR-253) |
| G40 | Whether a `Desired` entry of `reconcile` declares mandatory interceptions, and whether a change to them is a replace or a refusal. | Closed (CCR-BR-025, with CCR-BR-026 for the gate request side G41): a `Desired` entry carries `mandatoryInterceptions` (catalog ids from `BridgerOptions.mandatoryCatalog`, never functions) and `allowChildren`; a difference from the registration is refused with `PolicyMismatch`, never a replace (BEH-BR-153, BEH-BR-154) |
| G41 | Whether the `OperationRequest` of `install` carries `allowChildren` and the mandatory service ids, so a gate can decide on them. | Closed (CCR-BR-026): the `OperationRequest` of plugin-addressed operations carries `allowChildren` and `mandatoryInterceptions` (BEH-BR-219, BEH-BR-263) |
| G42 | Whether call logging may be fail-closed, and whether refused and allowed calls (including the remote companion's callbacks, BEH-RM-046) may follow different failure policies. | Closed (CCR-BR-026): `CallLog` `onFailure` "drop" \| "refuse" with a bounded hand-off queue and `CallLogUnavailable`; per-capture choice through `select`, per-entry choice for offered entries (BEH-BR-279, BEH-BR-280) |
| G43 | The `CallLog` entry shape for records offered by companion code rather than by core's capture (command dispatch, BEH-CM-015; remote crossings with direction, link, epoch and outcome, BEH-RM-043) and for non-call entries such as a boundary revocation (BEH-RM-014); also how a `PrincipalRef` (BEH-BR-259) is encoded across hosts, which the event delivery companion's envelope carries as a plain string. | Closed (CCR-BR-026): `CallEntry` kinds "call", "crossing", "refusal", "revocation", `Host.offerCallEntry`, `PrincipalRef.encode`/`decode` (BEH-BR-280); a kind for an executed command dispatch was not added then (G66, closed by CCR-BR-027) |
| G44 | State handoff on `restart` and on volatile `reconfigure` is not specified; the same definition restarting is a persistence question. | Closed (CCR-BR-025): handoff on `restart` and on a restarting `reconfigure` when the definition lists them in `handoff.alsoOn`, skipped with `cold: true`; a volatile-only `reconfigure` keeps the activation and hands off nothing (BEH-BR-353). Persistence across a process restart stays the plugin's store |
| G45 | `registeredAt` (BEH-BR-318) is tracked by the host but not shown in `PluginSnapshot`. | Open (CCR-BR-019): whether to expose it |
| G46 | A hook point's breaker defaults (5 errors in 1 minute, 30 s cooldown) and the `handoffTimeout` default (5 s) are design guesses. | Open (CCR-BR-019): to be measured in a prototype (BEH-BR-304, BEH-BR-347) |
| G47 | Realm family member ids and narrowed actor ids use "/" as a separator; `defineRealm` does not restrict realm id characters (BEH-BR-145). | Open (CCR-BR-019). Actor half settled by CCR-BR-028: "/" is the narrowing delimiter and an application's own actor ids must not contain it (BEH-BR-337, host-core prototype finding G-P8). Realm half open: `defineRealm` still accepts "/" in a realm id, so an application realm can take the id of a family member or an ephemeral realm (BEH-BR-145, BEH-BR-330, BEH-BR-336) |
| G48 | A per-method call timeout for a contract method (wanted by the remote companion, BEH-RM-022) has no place in the contract descriptor of BEH-BR-225. | Closed (CCR-BR-025): `MethodSpec.timeout` and `ContractDescriptor.timeouts`, read by companion proxies as the method's default call bound, never enforced by core (BEH-BR-234) |
| G49 | The companion specifications in `references/remote/`, `federation/`, `durable-bus/`, `loader/`, `audit-chain/`, `entitlement/`, `command/`, `mcp/`, `agent/`, `kit/`, `event-store/`, `sequence/` and `keyring/` are Drafts (CCR-RM-001, CCR-FD-001, CCR-DB-001, CCR-LD-001, CCR-AC-001, CCR-EN-001, CCR-CM-001, CCR-MC-001, CCR-AG-001, CCR-KT-001, revised by their CCR-…-002 and CCR-…-003; CCR-ES-001, CCR-SQ-001, CCR-KR-001). The review's "Effect learning curve" risk is addressed only by the kit Draft and the [guides](../../docs/guides/README.md). | Open (CCR-BR-021): not approved, not implemented |
| G50 | Selecting one provider among several federated peers exporting one contract (a contract as a registry) is not specified; federation imports land in per-peer realms. | Open (CCR-BR-021): BEH-FD-026 |
| G51 | Whether a federation kill entry may force a removal, interrupting calls in flight. | Open (CCR-BR-021): BEH-FD-007; [RSK-BR-015](./gxp/03-risk-assessment.md#rsk-br-015) |
| G52 | The event delivery companion's package name `@bridger/durable-bus` contains a restricted claim word; ADR-DB-007 keeps it as a name of intent only, not a claim. | Open (CCR-BR-021): whether to rename the package |
| G53 | Offline failover of a site's single-owner service without the authority is not automatic; it is the application's policy (ADR-FD-008). | Residual by design (CCR-BR-021) |
| G54 | An `AuditSink` does not see core's `auditDropped` count, so a chaining sink cannot put it into its anchor statements. | Closed (CCR-BR-026): every `AuditRecord` carries `auditDropped`, stamped when numbered (BEH-BR-195, BEH-BR-196, BEH-BR-202) |
| G55 | Whether the bus access rules of the `AccessPolicy` (BEH-BR-264) also apply to events forwarded from the event delivery companion (BEH-DB-053). | Closed on the core side (CCR-BR-026): `AccessPolicy.ask` with styles "subscribe"/"delivery", mode "publish", `origin` and `AccessRefused` (BEH-BR-269); the event delivery companion must adopt it (BEH-DB-053) |
| G56 | The loader's `SignaturePolicy` verifies packages; the federation companion needs it to verify host-manifest bytes, and the kit's `publish` needs a named signing step to cite. | Closed (CCR-BR-027): the loader companion's `SignaturePolicy.verify` verifies typed signed statements (package, host-manifest, data-pack, licence, or an application type), and `Statement.signingInput` with the `StatementSigner` port is the signing step the kit's publish and countersign call (`references/loader/behaviors/07-signed-statements.md`, BEH-LD-049–056; CCR-LD-003); federation cites BEH-LD-050 |
| G57 | A child removed because the sub-scope it was mounted under closed is recorded as a `system-stop` caused by its own mount record (BEH-BR-126); when a companion closes that sub-scope on someone's request — a boundary revocation in the remote companion, say — the requesting actor and reason reach no audit record, and the dependents' stops that follow have no attributed cause. | Closed (CCR-BR-026): `Plugin.Runtime.unmount` records `unmount-requested` with `requestedBy`, causing the removal's records (BEH-BR-126, BEH-BR-190) |
| G58 | `CallerContext` (BEH-BR-292) carries the actor and annotations of the invoker into a served call but no correlation id, because core keeps none in the fiber; nested host calls from served code get a fresh `correlationId` unless the dispatcher passes one in `options.context`. | Closed (CCR-BR-026): `CurrentCorrelation` in the fiber, carried by `CallerContext` (BEH-BR-187, BEH-BR-292, ADR-BR-054) |
| G59 | Core does not guarantee that the strings it writes into audit records — a caller's `reason`, identifiers, labels — are well-formed UTF-16 (no lone surrogates); a sink that canonicalises records (RFC 8785) must refuse such a string, and core's in-place retry then halts recording (BEH-BR-202, RSK-BR-020). | Closed (CCR-BR-026): core replaces lone surrogates with U+FFFD and flags the record `sanitized` (BEH-BR-185, BEH-BR-196) |
| G60 | A gate can refuse every operator call that would restart a plugin of a revoked digest, but system transitions are never gated (BEH-BR-219, BEH-BR-223): an installed plugin of that digest starts again when its dependencies return, when a lazy trigger applies, or when a background fiber restarts under its policy. Only `disable` or `remove` makes the digest unusable. | Closed (CCR-BR-026): `RefusalList` consulted on every start, system transitions included (BEH-BR-267, ADR-BR-053) |
| G61 | A lazy load runs under core's `buildTimeout` (BEH-BR-246), and the loader companion must fit its own fetch and verification step bounds inside it, but `Host.controls` reports `gateTimeout` and not `buildTimeout` (BEH-BR-212); the loader can only rely on a value the application states (loader BEH-LD-046). | Closed (CCR-BR-026): `HostControls.buildTimeout` (BEH-BR-212) |
| G62 | A hook point's skip policy can only skip a contribution (BEH-BR-302), and the decision record (BEH-BR-305) has no outcome such as "denied-policy": a hook point whose owner wants an unlicensed veto contribution to block the dispatch, recorded as a policy decision rather than as the contributor's veto, cannot express it; the entitlement companion skips (BEH-EN-016). | Closed (CCR-BR-024): the hook point's `policy` (renamed from `skip`) may return `Deny { reason }`; on a veto contribution it ends the dispatch `Denied { cause: "denied-policy", reason }` and is recorded as "denied-policy", never as the contributor's veto (BEH-BR-312) |
| G63 | The skip policy runs before a hook call and core offers no step after it (BEH-BR-302), so a budget charged by the policy cannot be returned when the call fails or times out (entitlement BEH-EN-023). | Closed (CCR-BR-026): `HookPointOptions.settle`, called once after each call the policy let run, with its outcome (BEH-BR-302) |
| G64 | A hook dispatch asks declared contributions only of registrations not yet loaded (BEH-BR-309); a loaded plugin that is `waiting`, `failed` or `disabled` has no hook at the point and its veto is absent, as for an eager plugin, so the dispatch may be `Allowed` without it: a loaded but inactive veto plugin still fails open. | Open (CCR-BR-024): whether an absent veto of a registered, loaded plugin should deny (BEH-BR-309, Settled (5); RSK-BR-057 residual). Narrowed by CCR-BR-029: a lazy registration idling toward `dormant` ("idling") or disabled by the `RefusalList` ("refused") is reported and decided by the wake step (BEH-BR-250, BEH-BR-309); still open for `waiting`, `failed`, operator-`disabled` and a `stopping` for any other cause, including a `replace` |
| G65 | A `replace` that narrows a provider — a lower minor, fewer methods — while a listed dependent's current definition still needs what it takes away is refused under providers-first order; the dependent's replacement must be registered first, so the list converges only on a second `reconcile` run (or, with `atomic`, the whole apply is undone). | Open (CCR-BR-025): whether a plan that detects narrowing from declarations should order such a replace consumers first (BEH-BR-156, ADR-BR-051) |
| G66 | `Host.offerCallEntry` accepted only the kinds "crossing", "refusal" and "revocation" (BEH-BR-280), although the closure of G43 names command dispatch (command BEH-CM-015) among the records companions offer: a command dispatch that ran a handler — or returned a stored outcome for an idempotency key — had no entry kind, so the command companion offered only its refusals. | Closed (CCR-BR-027): kind "dispatch" with `DispatchInfo { command, digest?, inputDigest?, idempotencyKey?, replayed? }`, offered under the same queue and failure policy, never produced by core (BEH-BR-276, BEH-BR-280) |
| G67 | A `RegistryView` entry did not carry the plugin that contributed it: the registry reported owners to the host for `inspect` only (BEH-BR-163, BEH-BR-168), so a renderer that mounts contributed UI could not learn the owner's id or realm from the view (docs/REACT-UI-PLUGINS.md §7 row 2). | Closed (CCR-BR-027): view entries carry `owner { pluginId, realm }` from `ActivePlugin` at `add`, diagnostic attribution only (BEH-BR-163, BEH-BR-165) |
| G68 | When a registry revoked a hold at its `drainTimeout` (BEH-BR-167) it failed the holder with `LeaseRevoked` but emitted no event, unlike a forced revocation of a host lease (`lease-revoked`, BEH-BR-086); a forced unmount of contributed UI was visible only to the adapter (docs/REACT-UI-PLUGINS.md §7 row 5). | Closed (CCR-BR-027): `Registry.revocations` publishes one `HoldRevoked { registry, id, owner?, holders, at }` per removal that revoked holders; no audit record, as a revocation changes no plugin state (BEH-BR-167) |
| G69 | A contract cannot state which of its methods are read-only (BEH-BR-225), so the entitlement companion's grant narrowing on lapse needs a separate `ReadOnlyClassifier` per deployment, and a wrong classification leaves a writing member callable (entitlement BEH-EN-025–028, Open (1)). | Open (CCR-BR-027): whether `MethodSpec` gains an optional read-only marker carried in `ContractDescriptor` and read by companions, never enforced by core |
| G70 | `settle` is called only after a hook call that `policy` answered with `Run` (BEH-BR-302). A declaration answered `Run` before its wake whose wake then fails or times out (BEH-BR-309) is never called, so it gets no `settle`, and a budget the policy charged for it is returned only when the charge expires (entitlement BEH-EN-023; open item (0) of entitlement behaviour file 04). | Open (CCR-BR-029): whether `settle` gains an outcome "wake-failed" for a declaration answered `Run` and never called; until then the entitlement companion documents expiry at `ttl` (BEH-BR-302, BEH-BR-309) |
| G9 | A naive supervised child (`forkChild` + `join` inside the lease) releases the lease before the child's finalizers run when the caller is interrupted, which would break BEH-BR-084. | Design constraint recorded (CCR-BR-003): the implementation interrupts and awaits the child before release; prototype checks E7a–E7b show the failure and the fix |

---

_Next: [Behaviours](./behaviors/01-plugin-definition.md)_
