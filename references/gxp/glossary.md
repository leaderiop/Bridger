# Glossary

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-GX-GLOSSARY                                          |
> | Revision       | 0.6                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-GX-03 §5)           |
> | Approved by    | — (pending; single maintainer, see PROC-GX-03 §5)            |
> | Classification | Glossary                                                     |
> | Change History | 0.6 (2026-11-11): Finding: the two exceptions of INV-GX-009 (PL2) (SPEC-AUDIT-06) (CCR-GX-009)<br>0.5 (2026-11-11): Check on read: links not checked for want of a key (`chainLinkUnchecked`) (PL23); high-water mark: the close mark from `HostControls.closed` (core CCR-BR-037) (G4) (CCR-GX-008)<br>0.4 (2026-11-10): Check on read and unanchored tail: findings taken from audit-chain named apart (`chainUnanchoredTail`, unconfirmed receipts, loss-counter rises) (P14, P16) (CCR-GX-005)<br>0.3 (2026-11-09): Installation checks: core's eight checks (IQ-01 to IQ-07, IQ-22 and IQ-U10) (core CCR-BR-033) (CCR-GX-004)<br>0.2 (2026-11-09): Trail entry, marked entry, collision entry, trail gate; anchor store holds high-water marks only; sealing and seal verification are `@bridger/audit-chain`'s; canonical domain I-JSON (F-01, F-02, C-09) (CCR-GX-002)<br>0.1 (2026-10-03): Initial draft (CCR-GX-001)                 |

---

Terms are defined as this specification uses them. Where a term has a wider
meaning elsewhere, the narrower meaning here governs. Core's terms (host,
plugin, actor, audit record and `AuditRecord`, `auditSeq`, audit position,
the audit-degraded latch, the operation gate) keep the meaning of core's
[glossary](../core/glossary.md) and are not repeated; `TestHost` is core's
test host ([BEH-BR-177](../core/behaviors/21-testing-host.md)).

## Trail

### Trail store

The caller-supplied port (`TrailStore`) that stores trail entries. It appends,
reads one host's entries in sequence, and lists hosts; it offers no update and
no delete. The companion ships no production trail store
([ADR-GX-004](./decisions/004-append-only-trail-store.md)).

### Trail entry

What the trail store keeps for one audit record: its `hostId`, `auditSeq`
and `recordId`, the record, its canonical text, its digest, the sink's
marks when it could not handle the record exactly, a collision marker when the
store kept it beside a primary entry, and, when sealing is on,
`@bridger/audit-chain`'s link. The canonical text is
kept as written and is never re-serialised.

### Marked entry

An entry the sink stored with `marks.schema` "unsupported" (a `schemaVersion`
or field the companion does not know) or `marks.canonical` "jcs-escaped" (a
record that is not I-JSON, stored with the escaped encoding) instead of
refusing it; counted in `TrailSinkStatus` and reported on read
([ADR-GX-030](./decisions/030-sink-marks-and-gate-refuses.md)).

### Collision entry

A different entry the store received under a stored `recordId` or `(hostId,
auditSeq)`, kept beside the primary entry, never over it, with the reason and
the primary's digest; answered "stored-collision" and reported as `collision`.

### Trail gate

`trailGate`, a core gate piece that refuses operator changes while the sink's
counts of marked entries, collisions or unconfirmed "already-stored" answers
are above zero, so that the sink never has to refuse a record. Composed with
audit-chain's `ChainGate` and the approval gate into one host gate.

### Canonical form, canonical text

The RFC 8785 (JSON Canonicalization Scheme) serialisation of a value, over
the I-JSON domain (non-integer numbers included since CCR-GX-002): object keys sorted, no insignificant
whitespace, strings escaped as JSON, numbers as ECMAScript writes them. Every digest, binding and
fingerprint input is computed over canonical text encoded as UTF-8
([ADR-GX-005](./decisions/005-jcs-and-sha256.md)).

### Digest

`"sha256:"` followed by the lower-case hexadecimal SHA-256 of the UTF-8
bytes of a canonical text (for a file of an evidence pack or an archive, of
the file's bytes). A digest identifies bytes; it says nothing about who wrote them.

### Acknowledgement

The trail sink's answer to core for one record. The sink acknowledges only
when the store has answered `"stored"`, or `"already-stored"` for an entry
the sink has verified to be the same; any other outcome is a failure that
core handles by retrying and latching.

### Adapter manifest

The statement an adapter publishes about itself: its name and version, what
"stored" means for it (the commit point), how it enforces uniqueness (its
isolation) and the largest entry it accepts. The manifest is copied
unchanged into every conformance manifest and evidence pack produced for the
store, as a declaration the companion does not verify.

### Conformance suite

`runTrailStoreConformance`: numbered cases, registered with the caller's
test runner, that drive the real core through `TestHost` against a caller's
trail store. The runner's report gives each case's pass or fail; a listed
case with no test in the report is not executed. Its output is evidence for
an evidence pack, not a verdict on the adapter ([ADR-GX-006](./decisions/006-conformance-through-testhost.md)).

## Checks, anchors, sealing and the trail gate

### Check on read

A function over stored entries (`checkTrailEntries`, `checkStoredTrail`,
`checkHighWater`, `verifySeals`, `checkApprovals`) that reports findings of
named kinds — gaps, duplicates, disorder, digest and canonical mismatches,
unknown `schemaVersion`, `requested` records without a terminal
record, dropped records, marked and colliding entries, an unclean close,
incomplete approval linking, tail loss, an unanchored tail, and, mapped from
audit-chain's results under names of their own, chain breaks, anchor
mismatches, head mismatches, links that could not be checked for want of a
key, the chain's unanchored tail, non-canonical links, loss-counter rises and
unconfirmed receipts. A run with no findings reports "no findings of the checked
kinds"; it does not say the trail is complete
([ADR-GX-007](./decisions/007-checks-never-claim-integrity.md)).

### Finding

One reported observation of a check, with its kind, host and sequence range.
A finding is never suppressed and never upgraded to a pass, but for the two
exceptions of archive re-verification that INV-GX-009 names.

### High-water mark

A host's highest written audit sequence number, read from
`Host.controls.auditPosition.lastWritten` while the host runs and, at close,
from `lastWritten` of the `CloseTail` that `HostControls.closed` yields once
the audit writer's final flush has ended, never from `CloseReport.auditLastSeq`
alone (BEH-GX-044), and written by `recordHighWater` to the
anchor store. A stored trail that ends below a high-water mark has lost its
tail ([ADR-GX-008](./decisions/008-high-water-anchors.md)).

### Anchor store

A caller-supplied port (`AnchorStore`) that holds high-water marks under
custody separate from the trail store. Its value depends on that separation,
which the companion cannot check. It is not `@bridger/audit-chain`'s `Anchor`,
which holds the chain's anchors when sealing is on; both should be held apart
from the trail.

### Unanchored tail

The entries of a host stored after its last anchor: after its highest
high-water mark (`unanchoredTail`, BEH-GX-046) or, in seal verification,
after its last confirmed chain anchor (`chainUnanchoredTail`, BEH-GX-171).
Neither tail loss nor alteration within the unanchored tail can be detected
against that anchor; checks report its extent.

### Sealing, link

Optional, and specified by `@bridger/audit-chain`, which the companion adopts
as its only sealing mechanism
([ADR-GX-029](./decisions/029-sealing-through-audit-chain.md)): its hash chain
sink wraps the trail store, and each entry carries audit-chain's link
(`ChainLinkV1`) beside the record. The companion's own seal chain, envelope
and seal anchors of revision 0.1 are withdrawn.

### Seal verification

`verifySeals`: audit-chain's confirmation of anchors and `verifyChain` over a
host's entries, with high-water marks as expected heads, mapped to findings.
Seal
verification detects alteration, insertion, removal or reordering of sealed
records up to the last verified anchor, against a party that cannot also
rewrite the anchor store. Sealing does not prevent any change.

## Approvals and signatures

### Approval policy

The rules (`ApprovalPolicy`) that say, for each operation and target pattern,
whether a ticket is required and with what signatures, meanings and bound
fields. When no rule matches, a ticket is required under the policy's
`defaults`; an exemption is an explicit rule with a justification, and the
policy's digest is recorded with every ticket and consumption
([ADR-GX-014](./decisions/014-deny-by-default-policy.md)).

### Ticket

A record in the ticket store, identified by its id, that carries a requester,
one or more bindings, a validity window and the digest of the policy it was
issued under; its state is derived from its event log. A call cites its ticket
by setting its `correlationId` to the ticket id
([ADR-GX-011](./decisions/011-ticket-cited-by-correlation-id.md)).

### Binding

The canonical description of exactly one change a ticket approves: scope,
operation, target, presented definition, configuration form, paths and
fingerprints, requester and, when the rule says so, reason
([ADR-GX-012](./decisions/012-binding-contents.md)).

### Binding digest

`"sha256:"` + SHA-256 of the canonical text of a binding. The gate recomputes
it from the `OperationRequest` and compares it with the digests of the
ticket's bindings.

### Bundle

A ticket with one binding per entry of a `reconcile`; each entry consumes its
own binding.

### Ticket lifecycle

`issued` → `signed` → `consumed`, or `expired` or `revoked`. The ticket store
keeps the events (`issued`, `signed`, `consumed`, `revoked`) as an
append-only log; expiry is computed from `notAfter` and `Clock`, never
written.

### Consumption

The compare-and-set step at which the gate marks a binding used. A binding is
consumed at most once; a call that fails after consumption has still used its
ticket ([ADR-GX-013](./decisions/013-single-use-tickets.md)).

### Signature capture

The caller-supplied port (`SignatureCapture`) that presents a rendered
binding to a signer and returns who signed, with what meaning and how the
signer was authenticated. The companion stamps the time from `Clock`
([ADR-GX-016](./decisions/016-signature-port-and-manifestation.md)).

### Manifestation

The printed name of the signer, the UTC date and time of signing, and the
meaning of the signature, shown with every signed binding wherever it is
rendered (21 CFR 11.50).

### Re-authentication attestation

The fields of a captured signature (`authentication.method`, `event`,
`components`, `reauthenticated: true`) by which the implementer's port states
that the signer was authenticated for this signing. The companion records the
attestation; it cannot check it.

### Separation of duties

The rule that no signer of a ticket is its requester and that signers of one
ticket are distinct, enforced on actor identifiers. It is only as strong as
the authentication behind those identifiers
([ADR-GX-015](./decisions/015-separation-of-duties.md)).

### Refusal reason

The reason the approval gate gives core when it refuses, from a closed list
of eleven (`no-ticket` … `ticket-store-unavailable`); core writes it to the
`rejected` record.

## Fingerprints and keys

### Fingerprint

A keyed digest of one configuration value at one path:
`fp1:hmac-sha256:<keyId>:<b64url>`, the HMAC-SHA256 under key `keyId` of the
canonical text of `{v: 1, scope, pluginId, path, form, value}`. Without the
key, a fingerprint cannot be compared with a guessed value
([ADR-GX-017](./decisions/017-hmac-through-the-core-port.md)).

### Eligibility

The allow-list of configuration paths whose values may be fingerprinted.
A path not on the list is never fingerprinted; the list has no class that
admits a low-entropy secret, and the entropy of each path is asserted by
the consumer ([ADR-GX-018](./decisions/018-eligibility-allow-list.md)).

### Fingerprint key provider

The caller-supplied port (`FingerprintKeyProvider`) that returns the current
key, and any key it still holds by id. A retired key stays usable for
comparison for as long as the consumer retains it; key material never
appears in any companion output
([ADR-GX-019](./decisions/019-key-provider-and-rotation.md)).

### Stale ticket

A ticket whose bindings carry fingerprints under a key that is no longer
current. After rotation such a ticket must be re-issued.

## Evidence

### Installation checks (IQ)

`runInstallationChecks`: checks of a running installation, including core's
eight installation checks (IQ-01 to IQ-07 and IQ-22, those on wiring read
through `Host.controls`, IQ-22 a draw from the consumer's identifier
generators, and the design review of the eighth listed as IQ-U10) and the companion's own. Each result is pass, fail, not-applicable or not-executed, and is marked
**proof** (established from the installation itself) or **probe** (an
observation at one moment, such as reachability)
([ADR-GX-020](./decisions/020-iq-proof-and-probe.md)).

### OQ evidence

`collectOqEvidence`: results taken only from test-runner output (vitest JSON,
JUnit XML, Cucumber NDJSON) of runs against the installed package, resolved
by `@REQ-BR-NNN` and `@REQ-GX-NNN` tags. A requirement with no executed test is
**not covered** ([ADR-GX-021](./decisions/021-oq-from-runner-output.md)).

### Deviation

An entry in `deviations.json`, with state "open": a failed or not-executed
installation check, a non-finite `gateTimeout`, an unknown requirement tag,
a failed or uncovered requirement, a conformance case failed or not
executed, a package mismatch, an incomplete run environment, or a check
report's finding. A deviation is reported, never resolved, by the
companion; the consumer's assessments are kept apart in `assessments.json`.

### Evidence pack

A directory with `manifest.json` (format `bridger-gx-evidence/1`, SHA-256 of
every other file), `iq.json`, `oq.json`, `coverage.json`, `checks.json`,
`deviations.json`, `adapters.json` and `attachments/`, plus derived
`report.html` and `report.md`; assessments and QA signatures are added later
in `assessments.json` and `signatures.json`, outside the manifest. The pack
digest is the digest of the canonical manifest
([ADR-GX-022](./decisions/022-evidence-pack-format.md)).

### Test fixture

An implementation of a port from `@bridger/gxp/testing`. Every fixture carries
the marker `fixture: true` in its manifest; installation checks fail an installation that wires one
([ADR-GX-024](./decisions/024-fixtures-are-marked.md)).

### Archive

The output of `exportTrail`: JSONL of the canonical texts as stored, marks and audit-chain links,
tickets, high-water marks, the check report and a manifest, with a human-readable rendering
that shows manifestations. `readArchive` re-runs the checks on it
([ADR-GX-023](./decisions/023-archives-keep-original-bytes.md)).
