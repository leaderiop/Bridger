# 11 — Signature Linking

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-GX-BEH-11                                            |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-GX-03 §5)           |
> | Approved by    | — (pending; single maintainer, see PROC-GX-03 §5)            |
> | Classification | Functional Specification                                     |
> | Change History | 0.2 (2026-11-09): BEH-GX-082, 083: `bindingOf` builds binding version 2 (`onBehalfOf`, `undo`, `requestOnly`); the record-side link takes `requestOnly` from the consumed binding and says so (F-01) (CCR-GX-002)<br>0.1 (2026-10-03): Initial draft (CCR-GX-001)                 |

---

A signature recorded on a ticket ([10 — Signature Capture Port](./10-signature-capture-port.md))
and a change recorded in the trail ([BEH-BR-195](../../core/behaviors/23-audit-sink-and-record.md)) live in two stores, written
at different times by different components. 21 CFR 11.70 asks that a
signature be linked to its record so that it cannot be copied or transferred
to falsify another; 11.50 asks that a signed record show who signed, when and
with what meaning. This file defines the link — the ticket id carried as the
call's `correlationId`, the binding digest recomputed from the request or the
record, and the consumption event in the ticket store — the one function that
recomputes a binding, the manifestation every rendering shows, why a copied
signature fails, and the report that lays approvals and records side by side
([ADR-GX-011](../decisions/011-ticket-cited-by-correlation-id.md), [ADR-GX-012](../decisions/012-binding-contents.md), [ADR-GX-016](../decisions/016-signature-port-and-manifestation.md)). This file owns BEH-GX-081–088 and
uses all eight.

> **What linking does not show — and who does**
>
> A link shows that the ticket store and the trail agree: the same ticket,
> the same approved change, a consumption the gate recorded. It does not show
> that the person named in a signature was the one at the keyboard, that the
> signature port re-authenticated them, or that nobody with write access to
> both stores rewrote them consistently. The ticket store is not sealed
> ([BEH-GX-174](./21-sealing-through-audit-chain.md#beh-gx-174-sealing-covers-trail-entries-only)). Identity, re-authentication and the custody of both
> stores are the consumer's obligation.

Planned source: `packages/gxp/src/approvals/binding.ts`,
`packages/gxp/src/approvals/linkApprovals.ts` and
`packages/gxp/src/approvals/manifestation.ts` *(Planned)*.

## BEH-GX-081: A signature is linked to a change by the ticket id, the recomputed binding digest and the consumption event

> **Invariant:** [INV-GX-003](../invariants.md#inv-gx-003-an-allowed-call-holds-a-valid-binding-with-an-equal-digest), [INV-GX-015](../invariants.md#inv-gx-015-every-signed-binding-carries-a-manifestation)
> **See:** [ADR-GX-011](../decisions/011-ticket-cited-by-correlation-id.md), [ADR-GX-012](../decisions/012-binding-contents.md), [ADR-GX-013](../decisions/013-single-use-tickets.md), [ADR-BR-034](../../core/decisions/034-gxp-companion-scope.md)
> **Satisfies:** [URS-GX-009](../urs.md#urs-gx-009-link-each-signature-to-the-change-it-approved), [URS-GX-007](../urs.md#urs-gx-007-bind-an-approval-to-exactly-the-change-approved)
> **Risk:** [RSK-GX-006](../gxp/03-risk-assessment.md#rsk-gx-006), [RSK-GX-015](../gxp/03-risk-assessment.md#rsk-gx-015)
> **Regulatory:** supports 21 CFR 11.70; EU GMP Annex 11 §14

```ts
// illustrative — not type-checked
interface ApprovalLink {
  readonly ticketId: string                        // = the record's correlationId
  readonly bindingDigest: string                   // recomputed from the record (BEH-GX-083)
  readonly consumption: ConsumptionRecord          // BEH-GX-084
  readonly record: {                               // the requested or rejected record that cites the ticket
    readonly hostId: string
    readonly auditSeq: number
    readonly recordId: string
    readonly phase: "requested" | "rejected"
  }
  readonly signatures: readonly SignatureRecord[]  // the ticket's accepted signatures (BEH-GX-076)
}
```

```
REQUIREMENT: The companion MUST report a recorded change as linked to the
             signatures of a ticket only when all three of the following
             hold: (1) the record's `correlationId` equals the ticket's `id`;
             (2) the binding digest recomputed from the record (BEH-GX-083)
             equals the digest of one binding of that ticket; and (3) the
             ticket store holds a `consumed` event for that ticket with that
             `bindingDigest`, whose `correlationId` equals the ticket's `id`
             and whose `hostId` equals the record's `hostId`.
```

```
REQUIREMENT: No other evidence — equal `reason` text, close timestamps, the
             same actor, an operator's statement — MAY establish a link,
             substitute for a missing element of the triple, or override a
             disagreeing one.
```

```
REQUIREMENT: The signatures of a linked change MUST be exactly the accepted
             signatures of the ticket (BEH-GX-086). For a bundle (BEH-GX-072)
             every binding of the ticket is linked to the same signatures,
             because they signed the bundle digest of BEH-GX-074, which covers
             each binding's digest.
```

Each element of the triple is written by a different party: the operator
chooses the `correlationId`, core writes it into the record together with the
fields the binding is rebuilt from ([BEH-BR-219](../../core/behaviors/25-operation-gate.md)), and the gate writes the
consumption. A forged link needs all three to agree, which is why none of them
can be replaced by something easier to obtain. The join needs nothing from
core beyond what core already records, as [BEH-BR-224](../../core/behaviors/25-operation-gate.md) anticipates.

## BEH-GX-082: One function builds a binding from a proposal, a request or a record

> **Invariant:** [INV-GX-012](../invariants.md#inv-gx-012-the-canonical-form-is-deterministic-across-platforms), [INV-GX-005](../invariants.md#inv-gx-005-no-configuration-value-or-key-material-appears-in-any-companion-output)
> **See:** [ADR-GX-012](../decisions/012-binding-contents.md), [ADR-GX-005](../decisions/005-jcs-and-sha256.md), [ADR-BR-039](../../core/decisions/039-config-fingerprint-port.md)
> **Satisfies:** [URS-GX-007](../urs.md#urs-gx-007-bind-an-approval-to-exactly-the-change-approved), [NFR-GX-001](../urs.md#nfr-gx-001-deterministic-outputs)
> **Risk:** [RSK-GX-015](../gxp/03-risk-assessment.md#rsk-gx-015)
> **Regulatory:** supports 21 CFR 11.70; EU GMP Annex 11 §14

```ts
// illustrative — not type-checked
type BindingSource =
  | { readonly kind: "proposal"; readonly value: ProposedRequest }        // 09, BEH-GX-069
  | { readonly kind: "request"; readonly value: OperationRequest }        // core BEH-BR-219
  | { readonly kind: "record"; readonly value: AuditRecord }              // phase "requested" or "rejected" only

declare function bindingOf(
  source: BindingSource,
  options: { readonly scope: string; readonly bindReason: boolean }
): Option.Option<Binding>                                                  // None: no binding can be built
```

| Binding field | Taken from the source |
| --- | --- |
| `v` | the constant 2 |
| `scope` | `options.scope` |
| `operation` | `operation` |
| `target` | `target`, when present |
| `definition` | `definition`, with exactly the fields present in the source |
| `config` | when `configChange` is present: `form` "raw" for `install`, "decoded" for `reconfigure`; `paths` as given; `fingerprints` as given, absent when the source has none |
| `requester` | `{ id, kind }` of `actor`; `display` is never copied |
| `onBehalfOf` | `onBehalfOf` without `revision`, when present |
| `undo` | `true` when a request carries `undo: true` or a record carries `undoes` |
| `requestOnly` | proposal and request only: `manifestDigest` = `bindingDigest`'s hash over the canonical `definition.manifest`, `allowChildren` and `mandatoryInterceptions` as given; never built from a record |
| `reason` | `reason`, only when `options.bindReason` is true and the source has one |

```
REQUIREMENT: The issuer (BEH-GX-069), the gate (12 — Approval Gate), the
             checks of this file and the archive reader (BEH-GX-140) MUST
             build bindings with `bindingOf` and digests with `bindingDigest`
             (BEH-GX-066), from the same package version. No component MAY
             build a binding with its own code.
```

```
REQUIREMENT: `bindingOf` MUST return None, and no binding MUST be compared,
             when the source is a record whose `phase` is not "requested" or
             "rejected", when its `operation` is a `SystemTransition`,
             `shutdown` or "reconcile", or when its actor's `kind` is
             "system". Fields MUST be copied unchanged: no trimming, case
             folding, Unicode normalisation, sorting or de-duplication.
```

```
REQUIREMENT: `bindingOf` MUST read only the fields named in the table and
             MUST NOT read `correlationId`, `causationId`, `timestamp`,
             `recordId`, `auditSeq`, `before`, `after`, `error`,
             `annotations` or `previousManifest`, so that the same change gives
             the same binding whether it is read from the proposal, the
             request or either of its records, apart from `requestOnly`,
             which no record carries (BEH-GX-083).
```

Core makes the request and the call's records carry equal `operation`,
`target`, `actor`, `reason`, `definition` and `configChange` values
([BEH-BR-219](../../core/behaviors/25-operation-gate.md), [BEH-BR-195](../../core/behaviors/23-audit-sink-and-record.md), [BEH-BR-197](../../core/behaviors/23-audit-sink-and-record.md)). One function over those fields is therefore
enough for the signer's view, the gate's decision and the reviewer's check to
agree; three functions would be three chances for the canonicalisation
mismatch of [RSK-GX-015](../gxp/03-risk-assessment.md#rsk-gx-015). A `reconcile` never has a binding of its own: its
entry actions are recorded and gated under their own operations
([BEH-BR-201](../../core/behaviors/23-audit-sink-and-record.md)).

## BEH-GX-083: A record links to a consumed binding when the digest recomputed from the record equals it

> **Invariant:** [INV-GX-003](../invariants.md#inv-gx-003-an-allowed-call-holds-a-valid-binding-with-an-equal-digest), [INV-GX-009](../invariants.md#inv-gx-009-a-finding-is-never-suppressed-or-upgraded)
> **See:** [ADR-GX-011](../decisions/011-ticket-cited-by-correlation-id.md), [ADR-GX-012](../decisions/012-binding-contents.md), [ADR-BR-039](../../core/decisions/039-config-fingerprint-port.md)
> **Satisfies:** [URS-GX-009](../urs.md#urs-gx-009-link-each-signature-to-the-change-it-approved)
> **Risk:** [RSK-GX-006](../gxp/03-risk-assessment.md#rsk-gx-006), [RSK-GX-022](../gxp/03-risk-assessment.md#rsk-gx-022)
> **Regulatory:** supports 21 CFR 11.70; EU GMP Annex 11 §9, §14

```
REQUIREMENT: To decide whether a `requested` or `rejected` record links to a
             consumed binding `b` of the ticket its `correlationId` names, the
             companion MUST compute `bindingOf({ kind: "record", value:
             record }, { scope, bindReason })`, with `scope` the checker's
             configured scope and `bindReason` true exactly when `b` has a
             `reason` field, add to it `b`'s own `requestOnly` member when `b`
             has one, and MUST compare its digest with `b`'s digest. Equal
             digests link; anything else does not.
```

```
REQUIREMENT: Every rendering and report of a link MUST state that the
             `requestOnly` fields — the manifest digest, `allowChildren` and
             the mandatory interceptions — were matched against the request
             by the gate when it consumed the binding, and are not shown by
             the record, which does not carry them (BEH-BR-195).
```

```
REQUIREMENT: The `definition` of the recomputed binding MUST come from the
             record's own `definition` field, which core writes on the
             `requested` and `rejected` records of every plugin-addressed
             operation (BEH-BR-195, REQ-BR-058). A refused `replace` or
             `install` MUST therefore be linkable to the incoming definition
             digest it was refused with, not to the installed one.
```

```
REQUIREMENT: A record MUST be linked to at most one consumed binding, and a
             consumed binding to at most one record. When two records of the
             same host and `correlationId` give an equal digest — a call
             repeated with the same ticket id — the record with the lower
             `auditSeq` MUST be linked and the other MUST be reported as a
             record with no consumed binding (BEH-GX-087).
```

**Settled here.** Whether `reason` belongs in the recomputed binding is taken
from the consumed binding itself rather than from the policy. The checker may
run under a later policy than the gate did; reading `bindReason` from the
policy in force would make a link appear or vanish with a policy change.
Every other optional field is present in a binding exactly when the record
carries it, so the binding's own shape answers the one question the record
cannot.

## BEH-GX-084: A consumption record is derived from the ticket store's consumed event and the binding it names

> **Invariant:** [INV-GX-002](../invariants.md#inv-gx-002-a-binding-is-consumed-at-most-once), [INV-GX-008](../invariants.md#inv-gx-008-no-companion-api-rewrites-a-stored-entry)
> **See:** [ADR-GX-013](../decisions/013-single-use-tickets.md), [ADR-GX-011](../decisions/011-ticket-cited-by-correlation-id.md)
> **Satisfies:** [URS-GX-009](../urs.md#urs-gx-009-link-each-signature-to-the-change-it-approved), [NFR-GX-006](../urs.md#nfr-gx-006-bounded-memory-on-read)
> **Risk:** [RSK-GX-006](../gxp/03-risk-assessment.md#rsk-gx-006), [RSK-GX-007](../gxp/03-risk-assessment.md#rsk-gx-007)
> **Regulatory:** supports 21 CFR 11.10(e), 11.70; ALCOA+ Attributable, Contemporaneous

```ts
// illustrative — not type-checked
interface ConsumptionRecord {
  readonly ticketId: string
  readonly bindingDigest: string
  readonly correlationId: string                   // from the consumed event (BEH-GX-071)
  readonly operation: GatedOperation               // from the binding with that digest
  readonly target?: { readonly id: string; readonly realm: string }
  readonly consumedAt: string                      // StoredTicketEvent.at, from Clock
  readonly hostId: string
  readonly policyDigest: string
  readonly eventSeq: number                        // the consumed event's position in the store
}

declare function listConsumptions(
  tickets: TicketStoreShape,
  options: { readonly hostId?: string; readonly fromSeq?: number }
): Stream.Stream<ConsumptionRecord | ConsumptionMismatch, TicketReadFailed>
```

```
REQUIREMENT: A `ConsumptionRecord` MUST be derived from exactly one stored
             `consumed` event and the `issued` event of the same ticket:
             `consumedAt` is the stored event's `at`; `operation` and `target`
             are those of the ticket's binding whose digest equals the
             event's `bindingDigest`. Nothing in it MAY come from the trail.
```

```
REQUIREMENT: A `consumed` event whose `bindingDigest` names no binding of its
             ticket, whose `correlationId` differs from the ticket's `id`, or
             that precedes the event that made the ticket `signed`, MUST be
             emitted as `ConsumptionMismatch { ticketId, eventSeq, kind }`
             with kind "unknown-binding", "foreign-correlation" or
             "consumed-before-signed", and MUST NOT be emitted as a
             consumption.
```

```
REQUIREMENT: `listConsumptions` MUST stream the store's events in `eventSeq`
             order and MUST hold in memory only the `issued` and `signed`
             events of tickets with an open binding, so that its memory is
             bounded by the number of tickets still in use, not by the size
             of the log.
```

The consumption record is the gate's statement "this approval was used here,
at this time, under this policy". It names the operation and target so that a
reviewer reading the ticket store alone can see what each approval was spent
on; the trail then confirms it. A consumed event that does not fit its ticket
cannot be written by the companion's own gate, which validates before it
appends ([BEH-GX-068](./09-approval-tickets.md#beh-gx-068-the-ticketstore-is-an-append-only-event-log-with-its-own-sequence-and-compare-and-set)); finding one means something else wrote the store.

## BEH-GX-085: Every rendering of a signed binding shows the printed name, the UTC date and time, and the meaning together

> **Invariant:** [INV-GX-015](../invariants.md#inv-gx-015-every-signed-binding-carries-a-manifestation), [INV-GX-005](../invariants.md#inv-gx-005-no-configuration-value-or-key-material-appears-in-any-companion-output)
> **See:** [ADR-GX-016](../decisions/016-signature-port-and-manifestation.md)
> **Satisfies:** [URS-GX-008](../urs.md#urs-gx-008-show-who-signed-when-and-with-what-meaning)
> **Risk:** [RSK-GX-020](../gxp/03-risk-assessment.md#rsk-gx-020), [RSK-GX-009](../gxp/03-risk-assessment.md#rsk-gx-009)
> **Regulatory:** supports 21 CFR 11.50(a), 11.50(b); EU GMP Annex 11 §14; ALCOA+ Attributable, Legible

```ts
// illustrative — not type-checked
declare function renderManifestation(signature: SignatureRecord): string
// "Signed by Dr. Ana Müller (u:amueller) on 2026-10-03 at 09:41:07.215 UTC; meaning: Approved for release to production [approve]"
```

```
REQUIREMENT: `renderManifestation` MUST produce exactly: "Signed by ",
             `signer.printedName`, " (", `signer.id`, ") on ", the date part
             of `signedAt` as YYYY-MM-DD, " at ", the time part as
             HH:MM:SS.mmm, " UTC; meaning: ", `meaningText`, " [", `meaning`,
             "]". Each value MUST be inserted as recorded, with no
             translation, abbreviation or conversion to another time zone.
```

```
REQUIREMENT: Every companion output that shows a signed binding — the issuer's
             rendering after signing, the link report (BEH-GX-087), the
             evidence pack's derived report (BEH-GX-134) and the archive's
             rendering (BEH-GX-141) — MUST show `renderManifestation` of
             every accepted signature of the ticket, next to the rendered
             binding and in the order the signatures were recorded. No output
             MAY show a signer's name, a signing time or a meaning apart from
             the other two.
```

```
REQUIREMENT: A `SignatureRecord` with a blank `printedName`, `meaningText`,
             `meaning` or `signedAt` MUST NOT be rendered as a manifestation;
             the output MUST show "manifestation incomplete" in its place and
             the link report MUST record the finding of BEH-GX-087.
```

The three elements of 11.50(a) are useless apart: a name without a time does
not say which approval it was, a time without a meaning does not say what was
approved. Rendering them as one fixed sentence, built from the recorded
fields alone, means the same signature reads the same way in every output and
any later rendering can be compared with an earlier one character for
character ([RSK-GX-020](../gxp/03-risk-assessment.md#rsk-gx-020)). The time is the companion's `Clock` reading
([BEH-BR-209](../../core/behaviors/24-time-ids-and-sequence.md)), shown in UTC so that two readers in different time zones see
one value.

## BEH-GX-086: A signature copied to another ticket or binding counts for nothing

> **Invariant:** [INV-GX-003](../invariants.md#inv-gx-003-an-allowed-call-holds-a-valid-binding-with-an-equal-digest), [INV-GX-015](../invariants.md#inv-gx-015-every-signed-binding-carries-a-manifestation)
> **See:** [ADR-GX-016](../decisions/016-signature-port-and-manifestation.md), [ADR-GX-012](../decisions/012-binding-contents.md), [ADR-GX-015](../decisions/015-separation-of-duties.md)
> **Satisfies:** [URS-GX-009](../urs.md#urs-gx-009-link-each-signature-to-the-change-it-approved), [URS-GX-008](../urs.md#urs-gx-008-show-who-signed-when-and-with-what-meaning)
> **Risk:** [RSK-GX-006](../gxp/03-risk-assessment.md#rsk-gx-006), [RSK-GX-020](../gxp/03-risk-assessment.md#rsk-gx-020)
> **Regulatory:** supports 21 CFR 11.70 (a signature cannot be transferred to falsify another record); EU GMP Annex 11 §14

| Check on a stored `signed` event | Finding when it fails |
| --- | --- |
| `signature.ticketId` equals the `ticketId` of the stored event that holds it | `signatureTransferred` |
| `signature.bindingDigest` equals the ticket's signing digest: its binding's digest, or the bundle digest of [BEH-GX-074](./10-signature-capture-port.md#beh-gx-074-a-signaturerequest-shows-the-signer-exactly-what-is-approved-and-with-what-meaning) | `signatureTransferred` |
| `signature.policyDigest` equals the ticket's `policyDigest` | `signatureTransferred` |
| `signature.renderedDigest` equals the digest of `renderBinding` recomputed from the ticket's bindings | `renderedMismatch` |
| `signedAt` is at or after the `issued` event's `at` and before `notAfter` | `signedOutsideWindow` |

```
REQUIREMENT: A signature MUST count towards a ticket's required signatures —
             at the gate (BEH-GX-090) and in every report — only when every
             check of the table holds for it. A signature that fails one MUST
             be treated as absent, so that a ticket whose remaining
             signatures do not meet its rule is `issued`, not `signed`.
```

```
REQUIREMENT: `checkSignatureLinks(tickets, { ticketId? })` MUST run the
             checks of the table over every stored `signed` event, or over
             one ticket's, and report each failure as a finding with the
             ticket id, the event's `eventSeq` and the kind shown. It MUST NOT
             repair, re-sign or remove a signature.
```

```
REQUIREMENT: The companion MUST offer no function that copies a signature
             from one ticket to another, re-targets it to a new binding or
             re-renders it under a new key id after rotation (BEH-GX-109).
```

A signature record is data and can be copied byte for byte into another
ticket's log by anyone who can write the store. What the copy cannot do is
make the other ticket usable: its digest names the binding it was given for,
its rendered digest names the text its signer saw, and both are recomputed
from the ticket it now sits in. The copy is therefore treated as absent and,
where it was planted, reported by name.

## BEH-GX-087: linkApprovals lays every consumed binding beside its record, burned bindings included

> **Invariant:** [INV-GX-009](../invariants.md#inv-gx-009-a-finding-is-never-suppressed-or-upgraded), [INV-GX-003](../invariants.md#inv-gx-003-an-allowed-call-holds-a-valid-binding-with-an-equal-digest)
> **See:** [ADR-GX-011](../decisions/011-ticket-cited-by-correlation-id.md), [ADR-GX-013](../decisions/013-single-use-tickets.md), [ADR-GX-007](../decisions/007-checks-never-claim-integrity.md)
> **Satisfies:** [URS-GX-009](../urs.md#urs-gx-009-link-each-signature-to-the-change-it-approved), [URS-GX-003](../urs.md#urs-gx-003-detect-lost-duplicated-reordered-or-altered-stored-records)
> **Risk:** [RSK-GX-007](../gxp/03-risk-assessment.md#rsk-gx-007), [RSK-GX-022](../gxp/03-risk-assessment.md#rsk-gx-022), [RSK-GX-006](../gxp/03-risk-assessment.md#rsk-gx-006)
> **Regulatory:** supports 21 CFR 11.10(e), 11.70; EU GMP Annex 11 §9, §14

```ts
// illustrative — not type-checked
declare function linkApprovals(
  store: TrailStoreShape,
  tickets: TicketStoreShape,
  options: { readonly hostId: string; readonly scope: string; readonly policy: ApprovalPolicy }
): Effect.Effect<ApprovalLinkReport, TrailReadFailed | TicketReadFailed | CheckCapacityExceeded>

type LinkStatus =
  | "applied"       // linked requested record; terminal record completed (noop included)
  | "joined" | "superseded"   // linked requested record; terminal record of that phase (BEH-BR-200)
  | "burned"        // linked requested record with a failed terminal record, or a linked rejected record
  | "unlinked"      // no record links to the consumption (also approvalWithoutRecord, BEH-GX-039)
  | "exempted"      // a record allowed under an exempt rule; an `exempted` event names it (BEH-GX-095)

interface ApprovalLinkReport {
  readonly format: "bridger-gx-links/1"
  readonly hostId: string
  readonly policyDigest: string                    // of options.policy
  readonly links: readonly { readonly status: LinkStatus; readonly link?: ApprovalLink
                             readonly consumption?: ConsumptionRecord; readonly recordId?: string }[]
  readonly open: readonly { readonly ticketId: string; readonly bindingDigest: string
                            readonly state: "signed" | "expired" | "revoked" }[]   // bindings never consumed
  readonly findings: readonly LinkFinding[]
  readonly statement: string                       // BEH-GX-033 wording, then BEH-GX-088's sentence
}
type LinkFinding = Finding & { readonly kind:
  | "approvalWithoutRecord" | "recordWithoutApproval"                     // as BEH-GX-039
  | "signatureTransferred" | "renderedMismatch" | "signedOutsideWindow"   // BEH-GX-086
  | "manifestationIncomplete"                                              // BEH-GX-085
  | "unknown-binding" | "foreign-correlation" | "consumed-before-signed"   // BEH-GX-084
}
```

```
REQUIREMENT: `linkApprovals` MUST give every consumption of the host exactly
             one entry in `links`, with the status of the table above. A
             `requested` or `rejected` record of an operation the policy
             requires a ticket for that links to no consumption MUST be
             reported as `recordWithoutApproval`, except the `rejected` record
             of a gate refusal (BEH-GX-039). A record allowed under an exempt
             rule MUST appear as "exempted" only when the ticket store holds
             the gate's `exempted` event for its `correlationId`; otherwise
             it is `recordWithoutApproval`.
```

```
REQUIREMENT: A consumption whose linked call ended in a `failed` terminal
             record, whatever its `error._tag` ("Interrupted" and
             "AuditUnavailable" included), or which links to a `rejected`
             record, MUST have status "burned". Burned bindings MUST be
             listed individually and counted in the report; they MUST NOT be
             reported as findings, because consuming them was correct.
```

```
REQUIREMENT: Bindings never consumed MUST be listed in `open` with the
             ticket's state at the time of the run, read from `Clock`. A
             bundle with some bindings consumed and others open MUST appear
             in both `links` and `open`.
```

```
REQUIREMENT: The report MUST follow the ordering, `statement` and
             determinism rules of BEH-GX-033, and MUST show the manifestation
             of every linked signature (BEH-GX-085). It MUST NOT contain a
             configuration value or a fingerprint key (BEH-GX-006).
```

The report is the reviewer's view of 11.70: each approved change with its
signatures and the record that shows it happened, each refusal that spent an
approval, each approval never used. "Burned" is listed rather than flagged:
the gate consumed the binding before core decided the outcome
([BEH-GX-071](./09-approval-tickets.md#beh-gx-071-a-binding-is-consumed-once-by-compare-and-set-and-a-failed-call-burns-it)), so a failed call spends its approval by design. A count of burned
bindings that keeps rising is the early sign of the exemption pressure of
[RSK-GX-007](../gxp/03-risk-assessment.md#rsk-gx-007), and it is visible here rather than in a workaround.

**Settled here.** A `rejected` record that links to a consumed binding is
possible: the caller is interrupted, or core's `gateTimeout` expires, after
the gate's compare-and-set and before its answer reaches core
([BEH-BR-221](../../core/behaviors/25-operation-gate.md)). Core then writes one `rejected` record
([BEH-BR-220](../../core/behaviors/25-operation-gate.md)) and changes nothing. The binding stays consumed and the
link is reported as "burned", which states exactly what happened.

## BEH-GX-088: Linking shows agreement between two stores, and states what it does not show

> **See:** [ADR-GX-027](../decisions/027-claims-and-non-claims.md), [ADR-GX-016](../decisions/016-signature-port-and-manifestation.md), [ADR-BR-034](../../core/decisions/034-gxp-companion-scope.md)
> **Satisfies:** [URS-GX-016](../urs.md#urs-gx-016-know-which-obligations-remain-mine), [URS-GX-009](../urs.md#urs-gx-009-link-each-signature-to-the-change-it-approved)
> **Risk:** [RSK-GX-004](../gxp/03-risk-assessment.md#rsk-gx-004), [RSK-GX-009](../gxp/03-risk-assessment.md#rsk-gx-009), [RSK-GX-008](../gxp/03-risk-assessment.md#rsk-gx-008)
> **Regulatory:** supports (by delimiting) 21 CFR 11.50, 11.70, 11.200; EU GMP Annex 11 §14

```
REQUIREMENT: Every link report, and every rendering that shows a link, MUST
             state: "Linking shows that the ticket store and the trail agree
             on the ticket, the approved change and its use. It does not show
             who physically signed, and the ticket store is not sealed."
```

```
REQUIREMENT: The ticket store MUST be kept, unaltered, at least as long as
             any trail entry whose `correlationId` names one of its tickets,
             and an export of the trail MUST include the tickets it cites
             (BEH-GX-137). This is the consumer's obligation.
```

```
REQUIREMENT: No companion output MAY describe a linked signature as verified,
             as the signer's own act, or as having any legal effect. Outputs
             MAY say that the signature port reported the signer, method and
             authentication event shown (BEH-GX-079).
```

A link is strong against the failures it was designed for — an approval
replayed on a second change, a signature planted on another ticket, a
reconcile that drifted from its approved bundle — because each of those
breaks the triple. It is weak against a party who controls both stores and
rewrites them in agreement: such a party can make any link appear. Sealing
detects that for trail entries only, against a party that cannot also
rewrite the anchor store; nothing in the companion does it for tickets
([BEH-GX-174](./21-sealing-through-audit-chain.md#beh-gx-174-sealing-covers-trail-entries-only)). Separate administration of the two stores is how
the consumer narrows that gap.

---

_Previous: [10 — Signature Capture Port](./10-signature-capture-port.md)_ · _Next: [12 — Approval Gate](./12-approval-gate.md)_
