# Invariants

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-GX-INV                                               |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-GX-03 §5)           |
> | Approved by    | — (pending; single maintainer, see PROC-GX-03 §5)            |
> | Classification | Invariants                                                   |
> | Change History | 0.1 (2026-10-03): Initial draft (CCR-GX-001)                 |

---

Properties of `@bridger/gxp` that are to hold for every execution. Each names
the mechanism that will enforce it, because an invariant nobody enforces is a
wish.

This specification is prospective
([ADR-GX-026](decisions/026-prospective-specification.md)): nothing below is
implemented. Every **Source** names a planned module and the mechanism it is
to carry, marked *(Planned)*; every **Verification** names the kind of check
that is to exercise the property, also *(Planned)*. No test cited here exists,
and no invariant here may be cited as evidence until a test that checks it has
been written and executed against the installed package
([ADR-GX-021](decisions/021-oq-from-runner-output.md)). Requirement scenarios
(`REQ-GX`) are not yet allocated; until [traceability.md](traceability.md) §5
allocates them, each **Verification** points at the numbered acceptance checks
of [20 — Required acceptance checks](behaviors/20-required-acceptance-checks.md):
[BEH-GX-153](behaviors/20-required-acceptance-checks.md) for storage,
conformance, checks on read, anchors and sealing, and
[BEH-GX-154](behaviors/20-required-acceptance-checks.md) for tickets,
signatures, the gate, fingerprints, evidence and export.

Each invariant has the same shape as core's
([core invariants](../core/invariants.md)): a one-sentence statement; the
**Source** that will enforce it; the **Implication** — the failure it prevents,
with the risk it controls in the [risk assessment](gxp/03-risk-assessment.md);
the **Verification** that will check it; and the **Related** behaviours and
decisions that motivate it. The behaviours are normative in detail; an
invariant is the property those behaviours together must never break. The
companion also relies on core's invariants listed in the
[core interface map](appendices/core-interface-map.md) §3, which it does not
restate.

## INV-GX-001: No decision port has a default outside the testing entry point

No port of the companion that stores, authenticates, signs, holds keys or
decides — `TrailStore`, `AnchorStore`, `TicketStore`, `SignatureCapture`,
`FingerprintKeyProvider`, and the `ApprovalPolicy` and `FingerprintEligibility`
values — has an implementation, a default value or a no-op stand-in exported
from the main entry point `@bridger/gxp`; the only implementations the
companion ships are the marked fixtures of `@bridger/gxp/testing`.

**Source**: `packages/gxp/src/GxpLayer.ts` *(Planned)* — `GxpLayer.make`
takes every section as a required option; `anchors`, `approvals` and
`fingerprints` can be left out only by the literal `"not-used"`, and sealing
only by `"off"`; a missing member is a type error and, for callers who
bypass the types, `GxpLayerInvalid` at construction.
`packages/gxp/src/index.ts` *(Planned)* — exports port tags and shapes, never a
layer that provides one of them. `packages/gxp/src/testing/index.ts`
*(Planned)* — the only module that builds port implementations, each carrying
the fixture marker of [INV-GX-014](#inv-gx-014-test-fixtures-are-detectable).
Merge-gate rows 4 and 5 of the
[Definitions of Done](process/definitions-of-done.md) are to reject a default
port outside `testing/` and any import of `testing/` from the main entry point.

**Implication**: a host cannot appear to have a trail store, an approval
control, a signature service or a key when nothing real is wired. A default
that does nothing would read, in configuration and in IQ, as a control
([RSK-GX-017](gxp/03-risk-assessment.md#rsk-gx-017)); a no-op signature
capture would yield approvals with no signer behind them
([RSK-GX-009](gxp/03-risk-assessment.md#rsk-gx-009)). Omission is visible:
the caller must write `"not-used"`, and core reports the gate or fingerprinter
of an unused section as unwired in `Host.controls`.

**Verification** *(Planned)*: type-level tests that `GxpLayer.make` without
each member fails to compile; a unit test that a runtime-built options object
missing a member fails with `GxpLayerInvalid`; a build check that walks the
main entry point's export graph and finds no value implementing a port shape;
acceptance checks of [BEH-GX-153](behaviors/20-required-acceptance-checks.md)
and [BEH-GX-154](behaviors/20-required-acceptance-checks.md) for the
boundary.

**Related**: [BEH-GX-003](behaviors/01-companion-boundary.md), [BEH-GX-004](behaviors/01-companion-boundary.md), [BEH-GX-009](behaviors/02-trail-store-port.md), [BEH-GX-041](behaviors/06-high-water-marks-and-anchors.md), [BEH-GX-073](behaviors/10-signature-capture-port.md), [BEH-GX-080](behaviors/10-signature-capture-port.md), [BEH-GX-145–BEH-GX-152](behaviors/19-testing-entry-point.md), [ADR-GX-003](decisions/003-ports-without-defaults.md), [ADR-GX-024](decisions/024-fixtures-are-marked.md), [ADR-BR-030](../core/decisions/030-audit-sink-port.md), [ADR-BR-032](../core/decisions/032-operation-gate.md).

---

## INV-GX-002: A binding is consumed at most once

For every binding of every ticket, the `TicketStore` holds at most one
`consumed` event, and no gate decision other than the one that appended that
event allows a call on it.

**Source**: `packages/gxp/src/approvals/TicketStore.ts` *(Planned)* — the
port's `append` takes an `expectedVersion` and fails with
`TicketVersionConflict` unless the ticket's stored version equals it, so two
writers that read the same state cannot both append.
`packages/gxp/src/approvals/approvalGate.ts` *(Planned)* — the gate appends
`consumed` by compare-and-set as its last step before allowing; a lost
compare-and-set re-reads the ticket and repeats the checks, at most three
times for one request, and a binding found consumed is the refusal
`binding-consumed`. A failed, interrupted or refused call after
consumption does not restore the binding: a consumed binding is burned
([ADR-GX-013](decisions/013-single-use-tickets.md)). A `reconcile` bundle
holds one binding per entry action, each consumed on its own.

**Implication**: an approval is used for exactly one change. A ticket replayed
on a second call, cited by two concurrent calls, or cited again after a failed
call is refused ([RSK-GX-006](gxp/03-risk-assessment.md#rsk-gx-006)); a
`reconcile` bundle cannot apply one entry's approval to another entry
([RSK-GX-022](gxp/03-risk-assessment.md#rsk-gx-022)). The burned-ticket rule
introduces its own risk, that operators answer burned tickets with
exemptions ([RSK-GX-007](gxp/03-risk-assessment.md#rsk-gx-007)).

**Verification** *(Planned)*: a property test over generated interleavings of
concurrent gated calls citing the same ticket, under `TestHost` with a
`memoryTicketStore` that yields between read and append, asserting at most one
`consumed` event per binding and at most one allow; scenarios for replay after
success, replay after a failed call, and a bundle entry cited twice; mutation
testing of the compare-and-set; acceptance checks of
[BEH-GX-154](behaviors/20-required-acceptance-checks.md).

**Related**: [BEH-GX-067](behaviors/09-approval-tickets.md), [BEH-GX-068](behaviors/09-approval-tickets.md), [BEH-GX-071](behaviors/09-approval-tickets.md), [BEH-GX-072](behaviors/09-approval-tickets.md), [BEH-GX-089–BEH-GX-096](behaviors/12-approval-gate.md), [ADR-GX-011](decisions/011-ticket-cited-by-correlation-id.md), [ADR-GX-013](decisions/013-single-use-tickets.md), [BEH-BR-222](../core/behaviors/25-operation-gate.md).

---

## INV-GX-003: An allowed call holds a valid binding with an equal digest

Whenever the approval gate answers allow for an operation its policy does not
exempt, the call's `correlationId` names a ticket issued under the gate's
current policy digest, the ticket is signed by the number of distinct signers
with the meanings its rule requires, the gate's clock reading lies within
`[notBefore, notAfter)`, the ticket is neither revoked nor expired, and the
binding digest recomputed from the gate request equals the digest of an
unconsumed binding of that ticket.

**Source**: `packages/gxp/src/approvals/approvalGate.ts` *(Planned)* — the
fixed step order policy → ticket → state and time window → digest →
separation of duties → consume → allow, in which every step can only refuse
and only the last can allow. `packages/gxp/src/approvals/binding.ts`
*(Planned)* — the binding is rebuilt from the gate's scope and the
`OperationRequest` core passes (operation, target, definition version and digest, configuration paths and
fingerprints, requester, and the reason where the rule binds it) and digested
by the same function the issuer uses. The gate keeps no cache of tickets or
decisions.

**Implication**: an approval cannot be moved to a different change, target,
plugin version, configuration value or requester, and an approval outside its
window, revoked, or under a superseded policy does not count
([RSK-GX-006](gxp/03-risk-assessment.md#rsk-gx-006)). A difference between the
form the issuer digested and the form the gate digests refuses rather than
allows ([RSK-GX-015](gxp/03-risk-assessment.md#rsk-gx-015)); a skewed clock
can only shorten or lengthen the window by the skew, never remove it
([RSK-GX-018](gxp/03-risk-assessment.md#rsk-gx-018)).

**Verification** *(Planned)*: a property test generating requests and tickets
that differ in exactly one bound field, asserting refusal with the matching
reason for each; boundary scenarios at `notBefore` and `notAfter` under
`TestClock`; a scenario for a policy digest change between issue and call;
mutation testing of each gate step; acceptance checks of
[BEH-GX-154](behaviors/20-required-acceptance-checks.md).

**Related**: [BEH-GX-061](behaviors/08-approval-policy.md), [BEH-GX-065](behaviors/09-approval-tickets.md), [BEH-GX-066](behaviors/09-approval-tickets.md), [BEH-GX-070](behaviors/09-approval-tickets.md), [BEH-GX-081–BEH-GX-088](behaviors/11-signature-linking.md), [BEH-GX-089–BEH-GX-096](behaviors/12-approval-gate.md), [ADR-GX-010](decisions/010-sign-first-then-call.md), [ADR-GX-012](decisions/012-binding-contents.md), [ADR-GX-014](decisions/014-deny-by-default-policy.md), [BEH-BR-219](../core/behaviors/25-operation-gate.md), [BEH-BR-221](../core/behaviors/25-operation-gate.md).

---

## INV-GX-004: The approver is never the requester

No ticket reaches the `signed` state, and no gate allows a call on it, while
any of its counted signatures has a signer identifier equal to the ticket's
requester identifier, equal to another counted signature's signer identifier,
or beginning with the reserved prefix `bridger:`.

**Source**: `packages/gxp/src/approvals/issueTicket.ts` *(Planned)* —
`issueTicket` refuses such a captured signature, failing with
`SignatureCaptureFailed` "malformed" before any `signed` event is appended
for it (BEH-GX-078). `packages/gxp/src/approvals/approvalGate.ts` *(Planned)* — the gate
re-checks the stored signatures against the binding's `requester` and against
`request.actor.id`, and refuses with the reason `same-person`; the requester is also
part of the binding digest, so a request from a different actor fails the
digest step as well.

**Implication**: no person approves their own change under one identifier
([RSK-GX-008](gxp/03-risk-assessment.md#rsk-gx-008)). The rule is on
identifiers only: two identifiers that name one person pass it, which is why
identity binding and alias control remain the consumer's
([ADR-GX-015](decisions/015-separation-of-duties.md)).

**Verification** *(Planned)*: scenarios in which the requester signs, the same
signer signs twice towards `signatures: 2`, a reserved actor signs, and the
call is made by an actor other than the binding's requester; a property test
over generated signer sets asserting that `signed` is reached only with the
required number of distinct, non-requester, non-reserved signers; acceptance
checks of [BEH-GX-154](behaviors/20-required-acceptance-checks.md).

**Related**: [BEH-GX-060](behaviors/08-approval-policy.md), [BEH-GX-069](behaviors/09-approval-tickets.md), [BEH-GX-078](behaviors/10-signature-capture-port.md), [BEH-GX-089–BEH-GX-096](behaviors/12-approval-gate.md), [ADR-GX-015](decisions/015-separation-of-duties.md), [BEH-BR-191](../core/behaviors/22-attributable-operations.md).

---

## INV-GX-005: No configuration value or key material appears in any companion output

No configuration value, no fingerprint key material, and no message, cause or
stack of a port's error appears in any value the companion returns or writes: errors, refusal
reasons, check reports and findings, ticket events, rendered bindings,
evidence packs, archives, logs, metrics or spans.

**Source**: `packages/gxp/src/Errors.ts` *(Planned)* — every error is a tagged
error whose fields are identifiers, counts and closed vocabularies; a port's
error is mapped to a reason tag and its message discarded.
`packages/gxp/src/fingerprints/hmacFingerprinter.ts` *(Planned)* — values are
read only inside the HMAC computation and never retained; a key is used only
as the provider's `CryptoKey` handle, never exported or read as bytes, and
only its key id appears in an output.
`packages/gxp/src/approvals/renderBinding.ts` *(Planned)* — renders paths,
marking those bound by a fingerprint as "fingerprinted", and never a value or
a fingerprint. The companion relies on core passing values only
to the `ConfigFingerprinter` port and keeping them out of records and gate
requests ([INV-BR-013](../core/invariants.md#inv-br-013-configuration-values-are-never-observable),
[INV-BR-028](../core/invariants.md)).

**Implication**: approving, recording and archiving a configuration change
does not put the value, or the key that could test guesses against its
fingerprint, into a retained trail or evidence pack that cannot be purged
([RSK-GX-014](gxp/03-risk-assessment.md#rsk-gx-014),
[RSK-GX-013](gxp/03-risk-assessment.md#rsk-gx-013)). A fingerprint itself is
not a value; whether it reveals one is controlled by eligibility and keying
([RSK-GX-012](gxp/03-risk-assessment.md#rsk-gx-012)).

**Verification** *(Planned)*: a canary test that runs every public function
and every failure path with configuration values, key material and port error
messages set to unique marker strings and bytes, and scans every output, error,
log line and written file for them; acceptance checks of
[BEH-GX-153](behaviors/20-required-acceptance-checks.md) and
[BEH-GX-154](behaviors/20-required-acceptance-checks.md); mutation testing of
the error mapping.

**Related**: [BEH-GX-006](behaviors/01-companion-boundary.md), [BEH-GX-019](behaviors/03-trail-sink.md), [BEH-GX-024](behaviors/03-trail-sink.md), [BEH-GX-074](behaviors/10-signature-capture-port.md), [BEH-GX-097–BEH-GX-104](behaviors/13-config-fingerprints.md), [BEH-GX-105–BEH-GX-112](behaviors/14-fingerprint-keys.md), [ADR-GX-017](decisions/017-hmac-through-the-core-port.md), [ADR-GX-019](decisions/019-key-provider-and-rotation.md), [ADR-BR-033](../core/decisions/033-no-config-values-in-audit.md), [ADR-BR-039](../core/decisions/039-config-fingerprint-port.md).

---

## INV-GX-006: At most one stored entry per record and per host sequence number

Every trail store that passes the conformance suite holds, at every moment, at
most one entry per `recordId` and at most one entry per (`hostId`, `auditSeq`)
pair, and an entry once stored is the one every later read returns.

**Source**: `packages/gxp/src/TrailStore.ts` *(Planned)* — the port contract:
`append` is idempotent on `recordId` (an entry whose digest equals the stored
one's answers `"already-stored"`) and fails with `TrailWriteFailed`
`reason: "conflict"` for a different entry under either key, never
overwriting. `packages/gxp/src/trailSink.ts` *(Planned)* — compares an
`"already-stored"` answer's stored digest with the entry it offered and fails
on a difference. `packages/gxp/src/testing/conformance.ts` *(Planned)* —
numbered cases for retry after commit, conflicting content under the same
`recordId` and under the same sequence number, and two hosts.

**Implication**: core's retry of a write whose acknowledgement was lost does
not duplicate the record, and a conflicting record does not replace the one
stored first ([RSK-GX-002](gxp/03-risk-assessment.md#rsk-gx-002)). The
invariant holds for an adapter only as far as its conformance run and its own
commit semantics reach ([ADR-GX-006](decisions/006-conformance-through-testhost.md)).

**Verification** *(Planned)*: the conformance suite's retry and conflict cases
run against `memoryTrailStore` and, with the expected case failing, against
each mode of `faultyTrailStore`; a property test of the sink over generated
retry sequences; acceptance checks of
[BEH-GX-153](behaviors/20-required-acceptance-checks.md).

**Related**: [BEH-GX-011](behaviors/02-trail-store-port.md), [BEH-GX-012](behaviors/02-trail-store-port.md), [BEH-GX-021](behaviors/03-trail-sink.md), [BEH-GX-028](behaviors/04-conformance-suite.md), [ADR-GX-004](decisions/004-append-only-trail-store.md), [ADR-GX-006](decisions/006-conformance-through-testhost.md), [BEH-BR-202](../core/behaviors/23-audit-sink-and-record.md), [INV-BR-023](../core/invariants.md).

---

## INV-GX-007: The sink acknowledges only what the store reports stored

`trailSink` completes core's `AuditSink.record` call successfully only after the store's
`append` has returned `"stored"`, or `"already-stored"` with a stored entry
equal to the one offered; every other outcome — a failure, a defect, an
interruption, a timeout — reaches core as a failed write.

**Source**: `packages/gxp/src/trailSink.ts` *(Planned)* — `record` is a single
sequential effect: check the schema version, canonicalise, digest, seal if
sealing is on, `append`, inspect the answer, complete. There is no queue,
buffer, background fiber or retry inside the sink; a failure maps to core's
`AuditWriteFailed` with a reason tag and no record content, and core's own
retry and latch policy then applies.

**Implication**: core's fail-closed audit policy rests on what the store
reports, not on what the sink hopes; a record core believes written was
reported committed by the store
([RSK-GX-001](gxp/03-risk-assessment.md#rsk-gx-001)). The invariant cannot
reach past the adapter: an adapter that answers `"stored"` before it commits
is detected only by the conformance cases that exercise it.

**Verification** *(Planned)*: conformance cases driven through the real core
`TestHost` with `faultyTrailStore` in each mode (commit-then-hang,
commit-then-fail, fail-before-commit, die), asserting the core outcome each
mode is specified to produce; a mutation test that acknowledging before
`append` returns is caught; acceptance checks of
[BEH-GX-153](behaviors/20-required-acceptance-checks.md).

**Related**: [BEH-GX-011](behaviors/02-trail-store-port.md), [BEH-GX-017](behaviors/03-trail-sink.md), [BEH-GX-019](behaviors/03-trail-sink.md), [BEH-GX-020](behaviors/03-trail-sink.md), [BEH-GX-027](behaviors/04-conformance-suite.md), [BEH-GX-029](behaviors/04-conformance-suite.md), [ADR-GX-004](decisions/004-append-only-trail-store.md), [ADR-GX-006](decisions/006-conformance-through-testhost.md), [BEH-BR-203](../core/behaviors/23-audit-sink-and-record.md), [BEH-BR-204](../core/behaviors/23-audit-sink-and-record.md), [BEH-BR-205](../core/behaviors/23-audit-sink-and-record.md).

---

## INV-GX-008: No companion API rewrites a stored entry

No function of the companion updates, deletes, re-serialises or re-seals a
stored trail entry, anchor or ticket event: every store port offers only adding
(`append`, `put`) and reading, and every function that copies stored data copies its original
canonical bytes.

**Source**: `packages/gxp/src/TrailStore.ts`, `packages/gxp/src/AnchorStore.ts`
and `packages/gxp/src/approvals/TicketStore.ts` *(Planned)* — port shapes with
no update or delete member. `packages/gxp/src/trailSink.ts` *(Planned)* — a
repeat write is never re-sealed. `packages/gxp/src/export/exportTrail.ts`
*(Planned)* — writes the stored `canonical` text byte for byte and never
serialises a parsed record again.

**Implication**: the companion is never the means by which a record is
changed after it was stored, and an archive is a copy of what was stored, not
a re-rendering of it ([RSK-GX-002](gxp/03-risk-assessment.md#rsk-gx-002),
[RSK-GX-020](gxp/03-risk-assessment.md#rsk-gx-020)). Whoever controls the
store can still change it outside the companion; detecting that is the work of
checks on read and seal verification, within their stated reach
([RSK-GX-004](gxp/03-risk-assessment.md#rsk-gx-004)).

**Verification** *(Planned)*: type-level tests that the port shapes have no
mutating member besides `append` and `put`; a property test that an export
followed by `readArchive` reproduces each entry's canonical bytes and digest
exactly, including for non-ASCII and large numeric values; a repeat-write
scenario asserting the stored seal is unchanged; acceptance checks of
[BEH-GX-153](behaviors/20-required-acceptance-checks.md) and
[BEH-GX-154](behaviors/20-required-acceptance-checks.md).

**Related**: [BEH-GX-013](behaviors/02-trail-store-port.md), [BEH-GX-014](behaviors/02-trail-store-port.md), [BEH-GX-022](behaviors/03-trail-sink.md), [BEH-GX-041](behaviors/06-high-water-marks-and-anchors.md), [BEH-GX-050](behaviors/07-optional-sealing.md), [BEH-GX-068](behaviors/09-approval-tickets.md), [BEH-GX-137–BEH-GX-144](behaviors/18-archive-and-export.md), [ADR-GX-004](decisions/004-append-only-trail-store.md), [ADR-GX-023](decisions/023-archives-keep-original-bytes.md).

---

## INV-GX-009: A finding is never suppressed or upgraded

Every check of the companion — checks on read, high-water checks, seal
verification, approval cross-checks, archive re-verification — reports every
finding it detects, each under its own kind, and no option, severity mapping,
merge or later step removes a finding, hides it in a count, or turns it into a
weaker kind or into the absence of findings.

**Source**: `packages/gxp/src/checks/CheckReport.ts` *(Planned)* — the report
type holds `checkedKinds`, `notCheckedKinds`, `scope`, the full list of
findings and a `statement` fixed by their number; it has no severity and no
"ok" flag. Every check function builds its report by appending, and none takes
an option that names a kind to ignore.
`packages/gxp/src/checks/checkStoredTrail.ts` *(Planned)* — when its memory
bound would be exceeded the run fails with `CheckCapacityExceeded` and produces
no report, never a silent truncation; an entry of an unknown `schemaVersion` is a finding,
never skipped.

**Implication**: a reviewer never reads a clean report for a trail in which a
checked kind of problem was detected, and never reads more into a clean report
than it says: an empty finding list means "no findings of the checked kinds"
over `scope`, and nothing about the kinds in `notCheckedKinds`
([RSK-GX-004](gxp/03-risk-assessment.md#rsk-gx-004),
[RSK-GX-003](gxp/03-risk-assessment.md#rsk-gx-003)).

**Verification** *(Planned)*: a property test that generates trails with
injected gaps, duplicates, reorderings, digest mismatches, unknown schema
versions, open requests and seal breaks in any combination and asserts that
each injected defect yields exactly its finding kind, in every report path
(pure, streaming, archive re-verification); a scenario per finding kind;
mutation testing of each finding's emission; acceptance checks of
[BEH-GX-153](behaviors/20-required-acceptance-checks.md).

**Related**: [BEH-GX-033](behaviors/05-checks-on-read.md), [BEH-GX-035](behaviors/05-checks-on-read.md), [BEH-GX-036](behaviors/05-checks-on-read.md), [BEH-GX-040](behaviors/05-checks-on-read.md), [BEH-GX-045](behaviors/06-high-water-marks-and-anchors.md), [BEH-GX-046](behaviors/06-high-water-marks-and-anchors.md), [BEH-GX-052](behaviors/07-optional-sealing.md), [BEH-GX-055](behaviors/07-optional-sealing.md), [ADR-GX-007](decisions/007-checks-never-claim-integrity.md), [BEH-BR-215](../core/behaviors/24-time-ids-and-sequence.md).

---

## INV-GX-010: Evidence results come only from runner output and gaps stay gaps

Every result in an OQ report and an evidence pack is derived from
machine-readable test-runner output of a run against the installed package,
by the fixed rules fail beats pass, all-skipped is skipped, and no test is
not covered; no result is entered by hand, read from source code, defaulted,
or relabelled, and every requirement in the traceability of either tree that
no test claims appears as not covered.

**Source**: `packages/gxp/src/evidence/collectOqEvidence.ts` *(Planned)* —
parsers for vitest JSON, JUnit XML and Cucumber NDJSON as the only inputs; a
resolver of `@REQ-BR-nnn` and `@REQ-GX-nnn` tags against both trees, with an
unknown tag recorded as a deviation; the outcome function as a total table
with no override parameter. `packages/gxp/src/evidence/buildEvidencePack.ts`
*(Planned)* — copies results and deviations verbatim into `oq.json` and
`deviations.json`; the derived `report.html` and `report.md` are generated from
those files and marked as derived.

**Implication**: a pack cannot report a pass for a test that did not run,
failed, was skipped or does not exist, and a requirement nobody tested is
visible as a gap rather than absent
([RSK-GX-016](gxp/03-risk-assessment.md#rsk-gx-016)). This is the companion's
side of core's evidence rule
([ADR-BR-035](../core/decisions/035-evidence-from-executed-tests.md)).

**Verification** *(Planned)*: the generator's self-test over its known-bad
corpus (a failed test, a skipped-only requirement, an unknown tag, a
duplicate test id, a run against a different package version, a truncated
file), asserting the exact outcome for each; a property test that the outcome
table never yields pass when any input result for the requirement is fail;
mutation testing at least 80% on the generator; acceptance checks of
[BEH-GX-154](behaviors/20-required-acceptance-checks.md).

**Related**: [BEH-GX-031](behaviors/04-conformance-suite.md), [BEH-GX-121–BEH-GX-128](behaviors/16-oq-evidence.md), [BEH-GX-129–BEH-GX-136](behaviors/17-evidence-pack.md), [ADR-GX-021](decisions/021-oq-from-runner-output.md), [ADR-GX-022](decisions/022-evidence-pack-format.md), [ADR-BR-035](../core/decisions/035-evidence-from-executed-tests.md).

---

## INV-GX-011: Every port failure on a decision path refuses

On every path where the companion decides whether a change may happen or
whether a write counts — the sink's acknowledgement, the gate's decision, the
fingerprinter's answer, ticket issue, signing and consumption — a port that
fails, dies, times out, answers malformed data or is interrupted produces a
refusal or a failed write, never an allow, an acknowledgement or a fingerprint.

**Source**: `packages/gxp/src/approvals/approvalGate.ts` *(Planned)* — every
store read and the compare-and-set run inside an internal deadline below
core's `gateTimeout`; a failure or an expired deadline is the refusal
`ticket-store-unavailable`, and core itself treats a gate that fails or hangs
as a refusal ([BEH-BR-221](../core/behaviors/25-operation-gate.md)).
`packages/gxp/src/fingerprints/hmacFingerprinter.ts` *(Planned)* — a key
provider failure fails the port call, which core turns into
`ConfigFingerprintUnavailable` with no change and no record
([BEH-BR-188](../core/behaviors/22-attributable-operations.md)).
`packages/gxp/src/trailSink.ts` *(Planned)* — every store failure is a failed
write (INV-GX-007). `packages/gxp/src/GxpLayer.ts` *(Planned)* — no
`catchAll` on a decision path; the fault-injection matrix below is to catch
one.

**Implication**: an outage of a ticket store, a key provider or a trail store
can stop changes, but never lets an unapproved, unrecorded or unfingerprinted
change through ([RSK-GX-010](gxp/03-risk-assessment.md#rsk-gx-010),
[RSK-GX-013](gxp/03-risk-assessment.md#rsk-gx-013)). The availability cost is
the risk this control introduces
([RSK-GX-021](gxp/03-risk-assessment.md#rsk-gx-021)).

**Verification** *(Planned)*: a fault-injection matrix — every port × {fail,
die, hang past the deadline, malformed answer, interruption} — run through the
real core `TestHost`, asserting refusal or failed write and the exact core
outcome and record for each cell; mutation testing of each error mapping;
acceptance checks of [BEH-GX-153](behaviors/20-required-acceptance-checks.md)
and [BEH-GX-154](behaviors/20-required-acceptance-checks.md).

**Related**: [BEH-GX-005](behaviors/01-companion-boundary.md), [BEH-GX-019](behaviors/03-trail-sink.md), [BEH-GX-077](behaviors/10-signature-capture-port.md), [BEH-GX-089–BEH-GX-096](behaviors/12-approval-gate.md), [BEH-GX-097–BEH-GX-104](behaviors/13-config-fingerprints.md), [ADR-GX-003](decisions/003-ports-without-defaults.md), [ADR-GX-010](decisions/010-sign-first-then-call.md), [INV-BR-026](../core/invariants.md#inv-br-026-an-unwired-sink-or-gate-changes-nothing).

---

## INV-GX-012: The canonical form is deterministic across platforms

For every value the companion canonicalises — trail records, bindings, seal
inputs, fingerprint inputs, policy and eligibility definitions, pack manifests
— the canonical text is the RFC 8785 (JCS) serialisation, identical byte for
byte on every supported runtime, platform and locale, and every digest over it
is `"sha256:"` followed by the lower-case hexadecimal SHA-256 of its UTF-8
bytes.

**Source**: `packages/gxp/src/Canonical.ts` *(Planned)* — one JCS
implementation used by every caller; values RFC 8785 cannot represent exactly
(a non-finite number, a number that is not a safe integer, a lone surrogate,
`undefined` inside an array, a `bigint`, a `Date` or any non-plain object) are
refused with `CanonicalisationFailed` rather than coerced.
`packages/gxp/src/Crypto.ts` *(Planned)* — SHA-256 and HMAC-SHA256 from the
platform only: WebCrypto where it exists, otherwise `node:crypto`.

**Implication**: the issuer and the gate, the sink and a later check, and two
installations on different platforms compute the same digest for the same
value; a mismatch then means the value differs
([RSK-GX-015](gxp/03-risk-assessment.md#rsk-gx-015)). A core record shape the
companion was not built for is refused rather than canonicalised differently
([RSK-GX-019](gxp/03-risk-assessment.md#rsk-gx-019)).

**Verification** *(Planned)*: the test vectors of files 09 and 13, recomputed
by the documentation checker (check 17) and by merge-gate row 10 on every
supported runtime; a property test that canonicalise ∘ parse ∘ canonicalise is
the identity on generated JSON values, including non-ASCII strings, escapes,
negative zero and integers at ±(2^53 − 1); acceptance checks of
[BEH-GX-153](behaviors/20-required-acceptance-checks.md) and
[BEH-GX-154](behaviors/20-required-acceptance-checks.md).

**Related**: [BEH-GX-002](behaviors/01-companion-boundary.md), [BEH-GX-010](behaviors/02-trail-store-port.md), [BEH-GX-018](behaviors/03-trail-sink.md), [BEH-GX-066](behaviors/09-approval-tickets.md), [BEH-GX-097–BEH-GX-104](behaviors/13-config-fingerprints.md), [ADR-GX-005](decisions/005-jcs-and-sha256.md), [ADR-GX-025](decisions/025-core-version-range.md).

---

## INV-GX-013: A host's seal chain is linear over exactly the stored sequence

With sealing on, every stored entry of a host carries a seal, and for every
`n` the seal of the entry with `auditSeq = n` is computed over that entry's
digest and the seal of the entry with `auditSeq = n − 1` (the fixed genesis
value for `n = 1`), so that the chain has exactly one link per stored
sequence number, no branch and no gap.

**Source**: `packages/gxp/src/sealing/seal.ts` *(Planned)* —
`seal_n = "sha256:" + hex(SHA-256(JCS({ v: 1, hostId, auditSeq, prev, digest_n })))`, computed
by the sink before `append` from the previous seal it holds for the host;
core's single writer per host
([BEH-BR-202](../core/behaviors/23-audit-sink-and-record.md)) supplies the
order. A repeat write keeps the stored seal. Sealing is fixed for the life of a
host, so a chain never starts mid-host.
`packages/gxp/src/checks/verifySeals.ts` *(Planned)* — recomputes the chain
from the stored digests and compares it with every anchor.

**Implication**: seal verification can detect alteration, insertion, removal
or reordering of sealed records up to the last verified anchor, against a
party that cannot also rewrite the anchor store — and nothing
beyond that ([RSK-GX-004](gxp/03-risk-assessment.md#rsk-gx-004),
[RSK-GX-005](gxp/03-risk-assessment.md#rsk-gx-005)).

**Verification** *(Planned)*: a property test that generates trails, applies
one alteration, insertion, removal, reordering or truncation at a random
position, and asserts that seal verification reports it when the position is
at or before the last anchor and reports the unanchored tail otherwise; a
retry scenario asserting the seal is not recomputed; acceptance checks of
[BEH-GX-153](behaviors/20-required-acceptance-checks.md).

**Related**: [BEH-GX-022](behaviors/03-trail-sink.md), [BEH-GX-049](behaviors/07-optional-sealing.md), [BEH-GX-050](behaviors/07-optional-sealing.md), [BEH-GX-051](behaviors/07-optional-sealing.md), [BEH-GX-052](behaviors/07-optional-sealing.md), [BEH-GX-053](behaviors/07-optional-sealing.md), [BEH-GX-054](behaviors/07-optional-sealing.md), [ADR-GX-009](decisions/009-optional-sealing.md), [ADR-BR-034](../core/decisions/034-gxp-companion-scope.md).

---

## INV-GX-014: Test fixtures are detectable

Every port implementation and key produced by `@bridger/gxp/testing` is
recognisable as a fixture — by `fixture: true` in the port's manifest or a
`test:` key id prefix — and so is the data it produces where the port's shape
allows (signatures carry the method "test-fixture"); the installation checks
report a wired fixture as a failure.

**Source**: `packages/gxp/src/testing/index.ts` *(Planned)* — every fixture
publishes a manifest with `fixture: true`; `testKeyProvider` issues `test:`
key ids; `scriptedSignatureCapture` returns signatures with the method
"test-fixture". `packages/gxp/src/evidence/runInstallationChecks.ts`
*(Planned)* — fails IQ-11, a proof, when any wired companion port carries
the marker or the capture's manifest lists the method "test-fixture", and
IQ-15, a probe, when the key provider answers a `test:` key id; each failure
is recorded as a deviation.

**Implication**: an in-memory store, a scripted signature capture or a test
key wired into a production assembly is caught at IQ and, if it still runs,
by checks on the data it wrote
([RSK-GX-017](gxp/03-risk-assessment.md#rsk-gx-017)).

**Verification** *(Planned)*: an IQ scenario per fixture, wired alone and
mixed with production ports, asserting `fail` and the deviation; a scenario
reading a store with fixture-stamped data; a build check that no main-entry
implementation carries the marker; acceptance checks of
[BEH-GX-154](behaviors/20-required-acceptance-checks.md).

**Related**: [BEH-GX-113–BEH-GX-120](behaviors/15-installation-checks.md), [BEH-GX-145–BEH-GX-152](behaviors/19-testing-entry-point.md), [ADR-GX-020](decisions/020-iq-proof-and-probe.md), [ADR-GX-024](decisions/024-fixtures-are-marked.md), [BEH-BR-181](../core/behaviors/21-testing-host.md), [BEH-BR-182](../core/behaviors/21-testing-host.md).

---

## INV-GX-015: Every signed binding carries a manifestation

Every signature event the companion records for a binding holds the signer's
identifier and printed name, the UTC time of signing stamped from `Clock`, the
meaning of the signature, and the binding digest it signs, and every rendering
of that binding in the companion's outputs shows the printed name, the time
and the meaning.

**Source**: `packages/gxp/src/approvals/SignatureCapture.ts` *(Planned)* —
a `CapturedSignature` without a non-empty `printedName`, or whose `meaning`
differs from the meaning requested, is refused before any event is appended.
`packages/gxp/src/approvals/issueTicket.ts` *(Planned)* — stamps `signedAt`
from `Clock` and writes the signature event with the binding digest.
`packages/gxp/src/approvals/renderManifestation.ts` *(Planned)* — renders each
signature as one fixed sentence of printed name, UTC date and time and
meaning, which every output that shows a signed binding — the link report,
the evidence pack's derived report and the archive's `trail.html` — prints
beside the rendered binding.

**Implication**: a signed approval shows who signed, when and with what
meaning wherever it is shown, and is linked by digest to the change it
approved ([RSK-GX-009](gxp/03-risk-assessment.md#rsk-gx-009),
[RSK-GX-020](gxp/03-risk-assessment.md#rsk-gx-020)). Whether the printed name
belongs to the person who signed is the signature port's and the consumer's
([ADR-GX-016](decisions/016-signature-port-and-manifestation.md)).

**Verification** *(Planned)*: scenarios with a capture that omits the printed
name, returns a different meaning, or returns its own timestamp, asserting
refusal or that the companion's `signedAt` is used; a golden-file test of the
rendering under `TestClock`; acceptance checks of
[BEH-GX-154](behaviors/20-required-acceptance-checks.md).

**Related**: [BEH-GX-074](behaviors/10-signature-capture-port.md), [BEH-GX-075](behaviors/10-signature-capture-port.md), [BEH-GX-076](behaviors/10-signature-capture-port.md), [BEH-GX-081–BEH-GX-088](behaviors/11-signature-linking.md), [BEH-GX-137–BEH-GX-144](behaviors/18-archive-and-export.md), [ADR-GX-016](decisions/016-signature-port-and-manifestation.md), [BEH-BR-224](../core/behaviors/25-operation-gate.md).
