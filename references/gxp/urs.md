# User Requirements

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-GX-URS                                               |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-GX-03 §5)           |
> | Approved by    | — (pending; single maintainer, see PROC-GX-03 §5)            |
> | Classification | User Requirements Specification                              |
> | Change History | 0.1 (2026-10-03): Initial draft (CCR-GX-001)                 |

---

## 1. Purpose

This document states what users need from `@bridger/gxp`, in their terms. The
[behaviours](./behaviors/01-companion-boundary.md) state how the companion is to meet those
needs. Every requirement here traces forward to at least one behaviour file in
[§6](#6-traceability).

The requirements are written **prospectively**, before any implementation
exists, from the "Companion" allocations of core's
[compliance matrix](../core/gxp/02-compliance-matrix.md) and from core's user requirements
that name the companion — [URS-BR-024](../core/urs.md), [URS-BR-025](../core/urs.md) and
[URS-BR-026](../core/urs.md). They describe intent, not proven behaviour; nothing here
is evidence that the companion does anything. [§7](#7-known-gaps-and-open-items)
records what remains open.

### 1.1 Scope

| Allocation | What |
| ---------- | ---- |
| **Core** (`@bridger/core`) | Attribution, the audit record and its sequence, the single audit writer and latch, the `OperationGate` call, step 4a and the `ConfigFingerprinter` call, `Host.controls`, `CloseReport.auditLastSeq`, `TestHost` |
| **Companion** (`@bridger/gxp`, this specification) | Trail-store contract, `AuditSink` and conformance suite; checks on read; high-water marks and optional sealing; approval policy, tickets, signature capture port, linking and the `OperationGate`; HMAC fingerprints and key handling; installation checks, OQ evidence, evidence pack, export and archive reading |
| **Consumer** (the regulated user's system) | The trail, anchor and ticket store adapters and their storage, backup and retention; authentication, identity binding and re-authentication behind the signature port; key management behind the key provider; anchor custody; clock synchronisation; review of the trail; PQ and system validation |
| **Out of scope** | A review or search tool for the trail; a production store of any kind; a user directory; legal signature equivalence; any claim that a system is compliant |

The companion assembles controls from ports the regulated user supplies and
tests them; whether the assembled system meets a regulation is the regulated
user's determination ([ADR-GX-027](./decisions/027-claims-and-non-claims.md),
[regulatory scope](./gxp/01-regulatory-scope.md)).

## 2. User groups

| Group | Needs |
| ----- | ----- |
| **QA / validation lead** | Know which obligations the companion supports and which remain the system's; obtain installation and operational evidence that shows its gaps; export a trail for inspection |
| **Approver / signer** | See exactly what is being approved, sign with a stated meaning, and know the signature cannot be reused for another change |
| **Requester / operator** | Prepare a change, obtain approval before making it, and make it within the ticket's window |
| **Integration developer** | Write trail, anchor and ticket store adapters and a signature port, and show that they keep the contract |
| **Auditor / inspector** | Read a trail and its approvals as stored, with the findings of the checks and the signatures' manifestations |
| **Test author** | Drive the companion deterministically with marked fixtures that cannot reach production unnoticed |

## 3. Functional requirements

### URS-GX-001: Store audit records with honest acknowledgement

The QA lead needs every audit record core hands to the sink stored by an
adapter of their choosing, and needs core to be told "stored" only when the
adapter has committed it, so that a record core believes written is not lost
in a buffer. A repeat of the same record must not create a second entry, and
a different record must never overwrite a stored one.

### URS-GX-002: Show that a trail adapter conforms

The integration developer needs to run a fixed, numbered set of cases against
their adapter, through the real core, including faults after commit, and
obtain a result per case that can go into an evidence pack.

### URS-GX-003: Detect lost, duplicated, reordered or altered stored records

The QA lead needs to read a host's stored trail and be told of gaps,
duplicates, disorder, entries whose text no longer matches their digest,
records of an unknown schema, calls with a `requested` record and no terminal
record, and records core reports as dropped — each as a named finding.

### URS-GX-004: Detect loss of the newest records

The QA lead needs to know when a stored trail ends before the last record the
host wrote, which a sequence check alone cannot show.

### URS-GX-005: Optionally detect alteration of sealed records

Where the risk warrants it, the QA lead needs to be able to turn on a
mechanism that detects alteration, insertion, removal or reordering of
sealed records up to the last verified anchor, against a party that cannot
also rewrite the anchor store, with its limits stated.

### URS-GX-006: Approve a change before it is made

The QA lead needs regulated changes to be refused unless an approval exists
for them before the call, without making a running operation wait for a
human.

### URS-GX-007: Bind an approval to exactly the change approved

The approver needs their approval to authorise one change only — the
operation, target, definition, configuration paths and, where required, the
values approved — and to be usable once.

### URS-GX-008: Show who signed, when and with what meaning

The auditor needs every signature shown with the signer's printed name, the
date and time of signing in UTC, and the meaning of the signature, wherever
the signed approval is rendered.

### URS-GX-009: Link each signature to the change it approved

The auditor needs each signature linked to the record of the change it
approved, so that it cannot be copied to another change, and needs refused
changes to show which approval they presented.

### URS-GX-010: Keep requester and approver apart

The QA lead needs the person who requests a change never to approve it, and
the approvers of one change to be distinct people.

### URS-GX-011: Compare configuration values without revealing them

The approver needs to approve a configuration value and have the call
refused unless it carries a fingerprint of that value, without the value appearing in the trail, the ticket, or
any output.

### URS-GX-012: Manage fingerprint keys

The QA lead needs fingerprint keys supplied from their own key management,
rotated without losing the ability to compare older fingerprints, and never
disclosed.

### URS-GX-013: Produce installation evidence

The validation lead needs a check of a running installation — versions,
wiring, limits, fixtures, reachability of stores — with each result marked as
established from the installation itself or merely observed at one moment.

### URS-GX-014: Produce operational evidence that shows gaps

The validation lead needs operational evidence assembled only from executed
test-runner output against the installed package, where a requirement with no
executed test shows as not covered and a failure as a failure.

### URS-GX-015: Export and archive a trail with its approvals

The QA lead needs to export a host's trail with its seals, tickets and check
report in a form that keeps the stored bytes, and to read an archive back and
re-run the checks on it.

### URS-GX-016: Know which obligations remain mine

The QA lead needs a clause-by-clause statement of what the companion supports
and what remains the regulated system's obligation, and needs every port the
companion cannot supply to be impossible to omit by accident.

## 4. Non-functional requirements

### NFR-GX-001: Deterministic outputs

Given the same inputs, `Clock`, key material and seed, every canonical text,
digest, binding digest, seal, fingerprint, check report and evidence pack is
byte-for-byte the same on every supported platform.

### NFR-GX-002: Minimal dependencies

The companion depends on `effect`, on `@bridger/core` within its declared
range of one core minor line, and on the platform's own cryptography (SHA-256 and HMAC), and
on nothing else at run time.

### NFR-GX-003: Coverage

Line and branch coverage of `packages/gxp` is at least 95%.

### NFR-GX-004: Mutation testing

The mutation score of `packages/gxp` is at least 80%, with every surviving
mutant in the gate, the sink and the checks reviewed and recorded.

### NFR-GX-005: Specification integrity

The specification passes its own checker with `--strict`, which includes
core's checker, the stricter claims lint and the recomputation of every test
vector ([PROC-GX-01](./process/requirement-id-scheme.md) §5).

### NFR-GX-006: Bounded memory on read

Checks on read, seal verification and export stream a host's entries and use
memory bounded by configuration (page size, open-request limit), not by the
length of the trail; exceeding a bound fails the run with an error
(`CheckCapacityExceeded`), never a partial report.

### NFR-GX-007: No secrets in any output

No configuration value, key material, credential or port-supplied message text
appears in any companion error, log, report, evidence pack, archive or
rendering.

### NFR-GX-008: Gate decision within its deadline

The approval gate decides within an internal deadline below core's
`gateTimeout`, so that a slow ticket store produces a precise refusal reason
rather than core's timeout refusal, and it never waits for a human.

## 5. Assumptions

| # | Assumption | Consequence if false |
| - | ---------- | -------------------- |
| A1 | The consumer's identity system authenticates the actor identifiers core attributes to calls | Separation of duties compares unauthenticated strings (RSK-GX-008) |
| A2 | The anchor store is administered by a party other than the one who can write the trail store | Tail-loss detection and seal verification can be defeated together (RSK-GX-005) |
| A3 | Host clocks are synchronised by the consumer | Ticket windows and `signedAt` times are wrong by the skew (RSK-GX-018) |
| A4 | The signature port re-authenticates the signer for each signing, as it attests | A signature records an attestation that is untrue (RSK-GX-009) |
| A5 | A core release containing CCR-BR-014 exists before the companion is built | The companion has no fingerprinter port, audit position or presented definition to rely on |

## 6. Traceability

Behaviours are cited by file; each `BEH-GX` identifier names the requirements
it satisfies in its `**Satisfies:**` line.

| Requirement | Behaviours | Invariants | Core requirement extended |
| ----------- | ---------- | ---------- | ------------------------- |
| URS-GX-001 | [02](./behaviors/02-trail-store-port.md), [03](./behaviors/03-trail-sink.md) | INV-GX-006, INV-GX-007, INV-GX-008 | — |
| URS-GX-002 | [04](./behaviors/04-conformance-suite.md), [19](./behaviors/19-testing-entry-point.md) | INV-GX-014 | URS-BR-025 |
| URS-GX-003 | [05](./behaviors/05-checks-on-read.md) | INV-GX-009, INV-GX-012 | — |
| URS-GX-004 | [06](./behaviors/06-high-water-marks-and-anchors.md) | INV-GX-009 | — |
| URS-GX-005 | [07](./behaviors/07-optional-sealing.md) | INV-GX-013 | — |
| URS-GX-006 | [08](./behaviors/08-approval-policy.md), [09](./behaviors/09-approval-tickets.md), [12](./behaviors/12-approval-gate.md) | INV-GX-003, INV-GX-011 | URS-BR-024 |
| URS-GX-007 | [09](./behaviors/09-approval-tickets.md), [12](./behaviors/12-approval-gate.md) | INV-GX-002, INV-GX-003, INV-GX-012 | URS-BR-024 |
| URS-GX-008 | [10](./behaviors/10-signature-capture-port.md), [11](./behaviors/11-signature-linking.md) | INV-GX-015 | — |
| URS-GX-009 | [11](./behaviors/11-signature-linking.md) | INV-GX-002, INV-GX-003 | — |
| URS-GX-010 | [10](./behaviors/10-signature-capture-port.md), [12](./behaviors/12-approval-gate.md) | INV-GX-004 | — |
| URS-GX-011 | [13](./behaviors/13-config-fingerprints.md) | INV-GX-005, INV-GX-012 | — |
| URS-GX-012 | [14](./behaviors/14-fingerprint-keys.md) | INV-GX-005 | — |
| URS-GX-013 | [15](./behaviors/15-installation-checks.md), [17](./behaviors/17-evidence-pack.md) | INV-GX-014 | URS-BR-025 |
| URS-GX-014 | [16](./behaviors/16-oq-evidence.md), [17](./behaviors/17-evidence-pack.md) | INV-GX-010 | URS-BR-025 |
| URS-GX-015 | [18](./behaviors/18-archive-and-export.md) | INV-GX-008, INV-GX-009 | — |
| URS-GX-016 | [01](./behaviors/01-companion-boundary.md) | INV-GX-001 | URS-BR-026 |
| NFR-GX-001 | [09](./behaviors/09-approval-tickets.md), [13](./behaviors/13-config-fingerprints.md), [17](./behaviors/17-evidence-pack.md) | INV-GX-012 | — |
| NFR-GX-002 | [01](./behaviors/01-companion-boundary.md) | — | — |
| NFR-GX-003 | [20](./behaviors/20-required-acceptance-checks.md) | — | — |
| NFR-GX-004 | [20](./behaviors/20-required-acceptance-checks.md) | — | — |
| NFR-GX-005 | [13](./behaviors/13-config-fingerprints.md), [16](./behaviors/16-oq-evidence.md), [20](./behaviors/20-required-acceptance-checks.md); process: [PROC-GX-01](./process/requirement-id-scheme.md) §5, [PROC-GX-02](./process/definitions-of-done.md) gate D1 | — | — |
| NFR-GX-006 | [05](./behaviors/05-checks-on-read.md), [07](./behaviors/07-optional-sealing.md), [18](./behaviors/18-archive-and-export.md) | — | — |
| NFR-GX-007 | [01](./behaviors/01-companion-boundary.md), [13](./behaviors/13-config-fingerprints.md), [14](./behaviors/14-fingerprint-keys.md) | INV-GX-005 | — |
| NFR-GX-008 | [12](./behaviors/12-approval-gate.md) | INV-GX-011 | — |

## 7. Known gaps and open items

| # | Item | Status |
| - | ---- | ------ |
| GX-G1 | No implementation exists. Every requirement is unverified. | Open — by design of this phase ([ADR-GX-026](./decisions/026-prospective-specification.md)) |
| GX-G2 | Independent review of this specification is not yet possible (single maintainer). | Open — see [change control](./process/change-control.md) §5; a release blocker ([roadmap](./roadmap.md)) |
| GX-G3 | Re-authentication and the controls of 21 CFR 11.200 happen inside the consumer's signature port; the companion records the attestation and cannot verify it. | Residual — Consumer (RSK-GX-009) |
| GX-G4 | Separation of custody between the trail store and the anchor store cannot be checked by software; the anchor manifest only declares it. | Residual — Consumer (RSK-GX-005) |
| GX-G5 | The conformance suite shows that an adapter passed its cases; it does not show what the adapter's storage keeps after the run. | Residual — Consumer; stated in the suite's output (BEH-GX-032) |
| GX-G6 | Actor identifiers are strings; separation of duties is only as strong as the authentication behind them. | Residual — Consumer (RSK-GX-008) |
| GX-G7 | No review or search tool and no PQ, as for core ([ADR-BR-034](../core/decisions/034-gxp-companion-scope.md) non-claim 12). | Not planned |
| GX-G8 | The checker is a copy of core's, adapted; a shared engine is deferred to a later CCR on both sides ([ADR-GX-028](./decisions/028-checker-copy-and-adapt.md)). | Deferred |
| GX-G9 | No core release containing CCR-BR-014 exists yet, so the compatibility matrix has only a prospective row. | Open — [core interface map](./appendices/core-interface-map.md) §7 |
