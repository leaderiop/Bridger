# 12 — Shutdown and Hosting

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-BEH-12                                               |
> | Revision       | 0.6                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.6 (2026-10-03): BEH-BR-106 `CloseReport.auditLastSeq?`, the highest `auditSeq` written when the report is produced; the shutdown's own terminal record comes after it and is read from `Host.controls` (prototype finding G34) (CCR-BR-014)<br>0.5 (2026-10-02): The scope-close path flushes the audit writer before it closes (prototype finding G18) (CCR-BR-009)<br>0.4 (2026-10-02): Shutdown resumes parked stops of any kind under its own limits; never parks; ends parked intents with an `intent-ended` record; stops take no `concurrency` slot (CCR-BR-008)<br>0.3 (2026-10-02): ManagedRuntime build forced with runtime.context() (CCR-BR-003)<br>0.2 (2026-10-02): Consistency fixes from independent review (CCR-BR-002)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001) |

---

A host that stops without saying what failed to stop has hidden exactly the
failures an operator most needs to see. This file converts SPEC.md
"Shutdown" and "Hosting from non-Effect code (ManagedRuntime)": the ordered,
bounded shutdown, the `CloseReport`, the scope-close path and `onClose`,
`HostClosed`, shutdown's relation to the audit latch, and the rules for
holding a host through `ManagedRuntime`. This file owns BEH-BR-105–112 and
uses all eight.

## BEH-BR-105: Shutdown stops every plugin in reverse dependency order, bounded

> **Invariant:** [INV-BR-005](../invariants.md#inv-br-005-dependents-stop-before-their-providers), [INV-BR-017](../invariants.md#inv-br-017-every-drain-is-bounded-unless-declared-forever)
> **Satisfies:** [URS-BR-008](../urs.md#urs-br-008-shut-down-with-a-report-of-what-failed)

```ts
// illustrative — not type-checked
shutdown(options?: { readonly timeout?: Duration.Input } & OperationOptions):
  Effect.Effect<CloseReport, Unattributed | ReasonRequired>   // never AuditUnavailable or OperationRejected (BEH-BR-110)
```

```
REQUIREMENT: `shutdown` MUST stop every plugin that has a live activation
             scope, dependents before their providers, with independent
             subtrees stopping concurrently. Stops MUST NOT take a
             `concurrency` slot (05 — Activation, BEH-BR-034).
```

```
REQUIREMENT: The whole shutdown MUST be bounded by `options.timeout`, default
             `BridgerOptions.shutdownTimeout` (default 60 seconds). Each
             plugin's drain MUST follow `drainTimeout`; `force` MUST be
             applied only once the overall limit has passed (BEH-BR-107).
```

```
REQUIREMENT: Plugins with nothing to stop — `disabled`, `waiting`, and
             `failed` plugins whose scope is already closed — MUST be
             skipped by the stop sequence.
```

```
REQUIREMENT: Shutdown MUST resume every parked stop — a parked operation or
             a parked system stop (08 — Operation Legality, BEH-BR-074) —
             under its own limits: the drain under `drainTimeout`, then
             revocation once the overall limit has passed (BEH-BR-107). It
             MUST NOT leave any stop parked, and the plugin's snapshot
             `reason` MUST become "shutdown" in the revision in which
             shutdown resumes it (04 — States and Snapshots, BEH-BR-027).
             Each resumption MUST emit a `stop-resumed` event with `by`
             "shutdown" and, when it ends a parked operator intent,
             `endsIntent` (13 — Observability and Diagnostics).
```

```
REQUIREMENT: When shutdown resumes a parked operation, the parked operator
             intent MUST end in that revision: its remaining actions MUST
             NOT run, the call that parked it MUST NOT receive a further
             terminal record, the reservations of a parked `replace` MUST be
             released (07 — Replacement and Reactivation, BEH-BR-050), and
             every override change made under the intent MUST revert
             (11 — Configuration, BEH-BR-101). In the same revision the
             host MUST write the system record `intent-ended` with `target`
             the plugin, `endsIntentOf` the `recordId` of the parked call's
             `requested` record, `configChange.paths` of every reverted
             override path (paths only), and as `causationId` the `recordId`
             of the `requested` record of `shutdown` (23 — Audit Sink and
             Record; 22 — Attributable Operations, BEH-BR-190).
```

```
REQUIREMENT: Once shutdown has begun, a drain expiry MUST NOT park any stop,
             whoever began it: shutdown MUST take the stop over under its own
             limits, and a call still waiting on that stop MUST complete with
             `HostClosed` (08 — Operation Legality, BEH-BR-075).
```

```
REQUIREMENT: Every stop shutdown drives, including the stops of dependents
             it cascades into, is a stop with no caller: it MUST drain under
             `drainTimeout`, MUST revoke only once the overall shutdown limit
             has passed (BEH-BR-107), MUST NOT park, and its system records
             MUST carry as
             `causationId` the `recordId` of the `requested` record of
             `shutdown` (22 — Attributable Operations, BEH-BR-190;
             10 — Runtime Failure and Health, BEH-BR-095).
```

```
REQUIREMENT: A `Layer` base MUST be released only after every plugin has
             stopped. A `Context` base is the caller's to manage.
```

```
REQUIREMENT: Shutdown MUST run in the host's own fibers once its intent is
             recorded. Interrupting the caller MUST stop only the caller's
             wait, never the shutdown.
```

The SPEC states the per-plugin rules for removal; shutdown is the same
dependents-first stop applied to the whole graph, so a provider is still
usable from its dependents' finalizers during shutdown exactly as during a
removal ([06 — Removal](./06-removal.md)).

**Settled here.** Because shutdown runs in the host's fibers, a `shutdown`
called from inside a lease callback does not deadlock on its own lease: the
caller waits, the overall limit eventually forces the remaining leases
(including the caller's, which interrupts its wait), and shutdown completes
and delivers its report to `onClose`. `shutdown` therefore does not fail with
`WouldDeadlock`.

**Settled here.** A parked stop waits for an operator call; once shutdown
has begun, every such call fails with `HostClosed`
([08 — Operation Legality](./08-operation-legality.md), BEH-BR-075), so
nothing but shutdown could ever resume it. Shutdown therefore resumes parked
stops of every kind under its own limits and revokes once the overall limit
passes, exactly as it does for any other plugin (CCR-BR-008). For the same
reason no stop parks once shutdown has begun: a stop whose drain expires then
is taken over by shutdown, and a call still waiting on it is answered with
`HostClosed`, since nothing could resume it. A parked intent that shutdown ends
gets its own `intent-ended` record, written when it ends, so the trail shows
that the operator's change will not happen — with the reverted override
paths, if any — before the plugin's `system-stop` record, which is an ordinary
one caused by the shutdown. A drain that expired before shutdown and expires
again during it is reported in `CloseReport.failed` with cause "drain" like
any other.

## BEH-BR-106: CloseReport reports every failure

> **Invariant:** [INV-BR-018](../invariants.md#inv-br-018-shutdown-reports-every-failure)
> **Satisfies:** [URS-BR-008](../urs.md#urs-br-008-shut-down-with-a-report-of-what-failed)
> **Risk:** [RSK-BR-009](../gxp/03-risk-assessment.md#rsk-br-009)

```ts
interface CloseReport {
  readonly stopped: readonly string[]                 // plugins whose scope closed without a cleanup failure
  readonly failed: readonly {
    readonly id: string
    readonly cause: "cleanup" | "drain"
    readonly message: string
  }[]
  readonly forced: readonly string[]                  // plugins whose leases were interrupted
  readonly durationMs: number                         // measured with the Clock service
  readonly auditDegraded: boolean                     // the audit latch was set when the report was produced (BEH-BR-110)
  readonly auditLastSeq?: number                      // highest auditSeq written when the report was produced; with a sink only (24)
}
```

```
REQUIREMENT: Every cleanup failure and every drain that did not complete
             within `drainTimeout` during shutdown MUST appear in
             `CloseReport.failed`. A failure MUST NOT be dropped.
```

```
REQUIREMENT: `failed[].cause` MUST be "cleanup" when closing the plugin's
             scope failed, and "drain" when its leases were still held when
             its drain limit expired.
```

```
REQUIREMENT: A plugin already `failed` with phase "cleanup" when shutdown
             begins MUST appear in `failed` with cause "cleanup": its leak is
             still unresolved.
```

```
REQUIREMENT: `durationMs` MUST be measured with the `Clock` service.
```

```
REQUIREMENT: `auditDegraded` MUST be true when the host's audit latch is set
             at the moment the report is produced — whether it was set
             before shutdown began or by an audit write that failed during
             it — and false otherwise, including when no `AuditSink` is
             wired.
```

```
REQUIREMENT: `auditLastSeq` MUST be present exactly when an `AuditSink` is
             wired, and MUST be the highest `auditSeq` the sink had accepted
             when the report was produced — the audit position
             `lastWritten` at that moment (24 — Time, Identifiers and
             Sequence, BEH-BR-212), 0 when none had been accepted. It MUST
             NOT be presented as the last record of the host: the
             shutdown's own terminal record is written after the report is
             produced, and the final position MUST be read from
             `Host.controls` once the writer has flushed.
```

SPEC.md named this field `phase`, reusing the vocabulary of
`PluginSnapshot.failure.phase` ("build", "activation", "runtime",
"cleanup"). The report's causes are a different and smaller set, and sharing
the name invited a reader to look for "runtime" in it. It is renamed `cause`.

**Settled here.** The three lists are not exclusive. A plugin whose drain
expired is listed in `failed` with cause "drain"; if it is then forced it is
also in `forced`; if its scope then closed cleanly it is also in `stopped`.
A plugin is in `stopped` or in `failed` with cause "cleanup", never both.
Listing a drain shortfall as a failure, even when force then succeeded,
keeps an overrun visible instead of folding it into success.

`auditLastSeq` (CCR-BR-014) lets an `onClose` handler or the caller of
`shutdown` compare the host's audit position with its store at the moment
the host closes. The prototype showed that the report is produced before the
shutdown's terminal record is written (finding G34), so the field is defined
as the position when the report is produced, not as the host's last number;
`Host.controls` stays readable after close for the final one.

## BEH-BR-107: Force after the overall limit

> **Invariant:** [INV-BR-017](../invariants.md#inv-br-017-every-drain-is-bounded-unless-declared-forever)
> **See:** [ADR-BR-015](../decisions/015-leases-one-primitive.md)
> **Satisfies:** [URS-BR-008](../urs.md#urs-br-008-shut-down-with-a-report-of-what-failed)
> **Risk:** [RSK-BR-015](../gxp/03-risk-assessment.md#rsk-br-015)

```
REQUIREMENT: When the overall shutdown limit passes, the host MUST revoke the
             leases still held (callbacks fail with `LeaseRevoked`), MUST
             await their finalizers, MUST close the remaining scopes in
             dependency order, and MUST list each affected plugin in
             `forced`.
```

```
REQUIREMENT: Each revocation MUST be reported as a `lease-revoked` host event
             and, when an `AuditSink` is wired, audited as the system
             transition `lease-revoked` with `causationId` set to the record
             id of the shutdown.
```

```
REQUIREMENT: The host MUST NOT abandon a finalizer that is still running in
             order to meet the limit.
```

**Settled here.** Effect cannot interrupt a running finalizer, and pretending
a resource was released because a deadline passed would be the false claim
that [RSK-BR-009](../gxp/03-risk-assessment.md#rsk-br-009) warns about. A
finalizer that never completes therefore delays the report; `durationMs`
then exceeds the limit, which is itself the signal.

## BEH-BR-108: Closing the scope performs the same shutdown

> **Invariant:** [INV-BR-018](../invariants.md#inv-br-018-shutdown-reports-every-failure)
> **Satisfies:** [URS-BR-008](../urs.md#urs-br-008-shut-down-with-a-report-of-what-failed)
> **Risk:** [RSK-BR-009](../gxp/03-risk-assessment.md#rsk-br-009)

```ts
// BridgerOptions
readonly onClose?: (report: CloseReport) => Effect.Effect<void>
```

```
REQUIREMENT: Closing the host's `Scope` (or releasing `Bridger.layer`) MUST
             perform the same shutdown as `shutdown()`.
```

```
REQUIREMENT: In the scope-close path the `CloseReport` MUST be passed to
             `BridgerOptions.onClose` when given, and MUST be logged at error
             level with each failure.
```

```
REQUIREMENT: When an `AuditSink` is wired, the scope-close path MUST hand
             every record queued by the shutdown — its terminal record
             included — to the sink before the audit writer closes, waiting
             at most `auditTimeout`. A record still unwritten when that limit
             passes MUST be logged at error level as lost.
```

```
REQUIREMENT: The scope-close path MUST NOT be refusable. It MUST perform
             `shutdown` attributed to `Actor.system` with no reason, and,
             when an `AuditSink` is wired, MUST be audited with operation
             `shutdown` under the same rules as an explicit call
             (BEH-BR-110). It MUST be exempt from the attribution checks
             (`attribution.require` and `attribution.requireReason`;
             22 — Attributable Operations, BEH-BR-189).
```

A scope finalizer cannot fail, so this path has no caller to return a
report to. Applications that must act on cleanup failures call `shutdown()`
before closing the scope; everyone else still gets the failures in
`onClose` and in the log, never nowhere.

**Settled here.** The audit writer is owned by the host scope that is
closing. Without the flush above, the shutdown's terminal record — the last
record of the host's trail (BEH-BR-109) — could still be queued when the writer
stops, and the trail would end with a `requested` record and no outcome. The
host-core prototype lost it this way (URS gap G18, CCR-BR-009). The wait is
bounded by `auditTimeout` because a scope finalizer cannot wait forever on a
sink that is down.

**Settled here.** (1) `onClose` is called exactly once per host, with the
report of the one shutdown that ran, whether that shutdown was started by
`shutdown()` or by the scope closing. (2) A defect in `onClose` is logged at
error level and does not stop the rest of the close, including release of
the base layer.

## BEH-BR-109: After shutdown starts, operations fail with HostClosed

> **Invariant:** [INV-BR-011](../invariants.md#inv-br-011-every-state-and-operation-pair-has-a-defined-outcome)
> **Satisfies:** [URS-BR-008](../urs.md#urs-br-008-shut-down-with-a-report-of-what-failed)

```
REQUIREMENT: Once shutdown has started, every Host operation that has
             `HostClosed` in its error union MUST fail with `HostClosed`,
             including `awaitIdle` and `inspect`.
```

```
REQUIREMENT: A `shutdown` call made while a shutdown is in progress MUST
             join it and receive the same `CloseReport` (recorded with a
             `joined` terminal record when an `AuditSink` is wired).
```

```
REQUIREMENT: A `shutdown` call made after shutdown has completed MUST return
             the original `CloseReport` and MUST write no audit record: the
             audit writer has already closed.
```

```
REQUIREMENT: `changes` MUST end when the host closes. `events` MUST emit
             `closed` and then end. `snapshot()` MUST keep returning the
             final snapshot.
```

SPEC.md's signatures for `awaitIdle` and `inspect` omitted `HostClosed`;
both are corrected here, since neither has anything meaningful to wait for or
inspect on a closed host. `use`, `useAll` and `lease` fail with
`ServiceUnavailable` instead ([09 — Leases](./09-leases.md)).

**Settled here.** A `shutdown` after completion returns the original report
rather than `HostClosed`, so a dispose path that calls `shutdown()` twice
never loses the report (BEH-BR-111). It writes no record, because the audit
writer closed with the host; the trail of that host ends with the terminal
record of the shutdown that ran.

## BEH-BR-110: Shutdown is always permitted, even with the audit latch set

> **Invariant:** [INV-BR-029](../invariants.md#inv-br-029-the-audit-degraded-latch-blocks-operator-mutations)
> **See:** [ADR-BR-031](../decisions/031-audit-failure-policy.md), [ADR-BR-032](../decisions/032-operation-gate.md)
> **Satisfies:** [URS-BR-008](../urs.md#urs-br-008-shut-down-with-a-report-of-what-failed), [URS-BR-023](../urs.md#urs-br-023-prevent-a-change-that-cannot-be-recorded)
> **Risk:** [RSK-BR-004](../gxp/03-risk-assessment.md#rsk-br-004)

```
REQUIREMENT: `shutdown` MUST skip the audit latch check: it MUST NOT be
             refused because `auditDegraded` is set.
```

```
REQUIREMENT: `shutdown` MUST NOT be gated: the `OperationGate` MUST NOT be
             consulted for it, and it MUST NOT fail with
             `OperationRejected`.
```

```
REQUIREMENT: When an `AuditSink` is wired, `shutdown` MUST attempt its
             `requested` and terminal records. A failure to write either MUST
             NOT refuse or abort the shutdown; it MUST set the latch (event
             `audit-degraded`), be logged at error level, and be reported as
             `CloseReport.auditDegraded: true`. `shutdown` MUST NOT fail with
             `AuditUnavailable`.
```

```
REQUIREMENT: An explicit `shutdown()` call MUST still pass the attribution
             check (`Unattributed`, `ReasonRequired`); a call refused there
             MUST change nothing.
```

The audit latch ([23 — Audit Sink and Record](./23-audit-sink-and-record.md))
exists to stop operator changes that cannot be recorded. Shutdown is the one
change that cannot be prevented anyway — closing the scope performs it
regardless — and refusing the explicit call would only push the application
onto the scope-close path, where the `CloseReport` reaches no caller. So the
latch never blocks it, and an unwritable audit record is reported loudly
rather than turned into a refusal.

Stopping is the safe direction; refusing to stop is not. A gate that could
refuse `shutdown` would add nothing either, since closing the scope stops
the host regardless. `auditDegraded` in the report puts the one fact a
reviewer of the shutdown most needs — that its audit trail may be
incomplete — in the value the caller already receives.

**Settled here.** For `shutdown` only, this behaviour overrides the
step order of [22 — Attributable Operations](./22-attributable-operations.md)
(BEH-BR-188: latch check, gate, refusal on an unwritable `requested` record)
and the rule that every mutating operation's error union carries all four GxP
errors: `shutdown`'s union is `Unattributed | ReasonRequired`. Attribution
still applies to the explicit call because it is the consumer's own policy,
not a failure of the audit channel. The scope-close path is attributed to
`Actor.system` (BEH-BR-108) and is exempt from `attribution.require` and
`attribution.requireReason`, so it never fails them: otherwise either option
would refuse `Actor.system` or the missing reason, and the host scope could
not close.

## BEH-BR-111: Hosting through ManagedRuntime — force the build, shut down before dispose

> **See:** [ADR-BR-009](../decisions/009-managedruntime-hosting.md)
> **Satisfies:** [URS-BR-018](../urs.md#urs-br-018-host-plugins-from-code-that-does-not-use-effect), [URS-BR-008](../urs.md#urs-br-008-shut-down-with-a-report-of-what-failed)

```ts
const runtime = ManagedRuntime.make(Bridger.layer(options))   // layer is built lazily on first use
await runtime.context()                                        // forces the build without running an effect (prototype E3b)
const report = await runtime.runPromise(Bridger.Host.use((host) => host.shutdown()))
await runtime.dispose()                                        // releases the layer; the runtime cannot be reused
```

```
REQUIREMENT: An application that is not an Effect program MUST hold the host
             through `ManagedRuntime.make(Bridger.layer(options))`.
```

```
REQUIREMENT: Because a `ManagedRuntime` builds its layer lazily on first use,
             an adapter that promises "ready after the initial snapshot" MUST
             force the build and await the first `snapshot()` before
             resolving.
```

```
REQUIREMENT: An adapter's dispose MUST call `host.shutdown()` first, surface
             its `CloseReport`, and only then call `runtime.dispose()`.
```

```
REQUIREMENT: A disposed runtime MUST NOT be reused.
```

`dispose()` runs scope finalizers, which cannot fail, so a cleanup failure
during dispose alone would be logged and never returned. Calling `shutdown()`
first is what keeps the report. A base-layer build failure surfaces at the
forced build rather than at some later first use, where it would be
misattributed to whatever call happened to come first.

## BEH-BR-112: The runtime holds the static part only

> **See:** [ADR-BR-009](../decisions/009-managedruntime-hosting.md)
> **Satisfies:** [URS-BR-018](../urs.md#urs-br-018-host-plugins-from-code-that-does-not-use-effect)
> **Risk:** [RSK-BR-001](../gxp/03-risk-assessment.md#rsk-br-001)

```
REQUIREMENT: The runtime's `R` MUST contain only `Bridger.Host` and the
             application's base services. Plugin services MUST NOT appear in
             `R`; they MUST be reachable only through `host.use`, `useAll`
             and `lease`.
```

```
REQUIREMENT: The runtime is per application. A plugin MUST NOT create its own
             `ManagedRuntime`; it MUST use its activation `Scope` and
             `Plugin.Runtime`, so that its resources stay inside the
             activation scope.
```

This is a design rule, not a limitation: it is what lets plugins leave. A
plugin service placed in a long-lived runtime's context could be called after
its plugin was removed, with no lease to stop the provider closing under the
call. A plugin-owned runtime would hold resources outside the activation
scope, where removal cannot reach them.

---

_Previous: [11 — Configuration](./11-configuration.md)_ · _Next: [13 — Observability and Diagnostics](./13-observability-and-diagnostics.md)_
