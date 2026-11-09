# 08 — Approval Policy

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-GX-BEH-08                                            |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-GX-03 §5)           |
> | Approved by    | — (pending; single maintainer, see PROC-GX-03 §5)            |
> | Classification | Functional Specification                                     |
> | Change History | 0.1 (2026-10-03): Initial draft (CCR-GX-001)                 |

---

The approval gate of [12 — Approval Gate](./12-approval-gate.md) answers one
question for every call core submits to it: is there a valid, signed ticket
for exactly this change? Whether a ticket is needed at all, how many
signatures it must carry, with which meanings, and what it must bind to, is
decided by the approval policy defined here. The policy is data: a list of
rules, matched by operation and target, plus defaults that apply where no
rule matches. It denies by default — with no matching rule a ticket is
required — and every exemption is a rule someone wrote, with a justification
([ADR-GX-014](../decisions/014-deny-by-default-policy.md)). This file owns BEH-GX-057–064 and uses all eight.

> **What the policy does not decide — and who does**
>
> Which operations on which plugins are regulated, how many people must
> approve them and what each signature means are the regulated user's
> decisions, made under their own change control. The companion checks
> that the policy is well formed, applies it exactly, and records its
> digest; it does not judge whether the policy is adequate. This is the
> consumer's obligation.

Planned source: `packages/gxp/src/approvals/ApprovalPolicy.ts` *(Planned)*.

## BEH-GX-057: An ApprovalPolicy is a list of rules over operation and target, with explicit defaults

> **Invariant:** [INV-GX-001](../invariants.md#inv-gx-001-no-decision-port-has-a-default-outside-the-testing-entry-point), [INV-GX-003](../invariants.md#inv-gx-003-an-allowed-call-holds-a-valid-binding-with-an-equal-digest)
> **See:** [ADR-GX-014](../decisions/014-deny-by-default-policy.md), [ADR-GX-003](../decisions/003-ports-without-defaults.md), [ADR-BR-032](../../core/decisions/032-operation-gate.md)
> **Satisfies:** [URS-GX-006](../urs.md#urs-gx-006-approve-a-change-before-it-is-made), [URS-GX-007](../urs.md#urs-gx-007-bind-an-approval-to-exactly-the-change-approved)
> **Risk:** [RSK-GX-011](../gxp/03-risk-assessment.md#rsk-gx-011)
> **Regulatory:** supports 21 CFR 11.10(f), 11.10(g); EU GMP Annex 11 §10, §12.1

```ts
// illustrative — not type-checked
type GatedOperation = Exclude<Operation, "shutdown">     // core's Operation (BEH-BR-185) minus shutdown

interface ApprovalPolicy {
  readonly v: 1
  readonly name: string                                   // e.g. "LIMS host policy"
  readonly version: string                                // the consumer's document version, e.g. "3.2"
  readonly rules: readonly PolicyRule[]
  readonly defaults: Requirements                         // apply when no rule matches (BEH-GX-058)
}

type PolicyRule =
  | { readonly id: string; readonly operations: readonly GatedOperation[]; readonly target?: TargetPattern
      readonly decision: "ticket"; readonly requirements: Requirements }
  | { readonly id: string; readonly operations: readonly GatedOperation[]; readonly target?: TargetPattern
      readonly decision: "exempt"; readonly justification: string }

interface TargetPattern { readonly id?: string; readonly realm?: string }   // "*" matches any run of characters

interface Requirements {
  readonly signatures: number                             // 1..5 distinct signers (BEH-GX-060)
  readonly meanings: readonly Meaning[]                   // exactly `signatures` entries
  readonly bindReason: boolean
  readonly requireDigest: boolean
  readonly requireFingerprints: boolean
  readonly validity: Duration.Input                       // longest notAfter − notBefore of a ticket; at most 30 days
}

interface Meaning { readonly code: string; readonly text: string }   // e.g. { code: "approve", text: "Approved for release to production" }
```

```
REQUIREMENT: A policy MUST be a plain JSON value of the shape above. Every
             field MUST be present where the type does not mark it optional;
             the companion MUST NOT fill in an omitted field.
```

```
REQUIREMENT: The companion MUST NOT provide a policy, a policy builder with
             default rules, or an allow-all value in its main entry point
             (BEH-GX-003).
```

The policy speaks core's vocabulary — the operation names of
[BEH-BR-185](../../core/behaviors/22-attributable-operations.md), the mutating operations that accept an `OperationContext` ([BEH-BR-186](../../core/behaviors/22-attributable-operations.md)), and the `{ id, realm }` target of [BEH-BR-219](../../core/behaviors/25-operation-gate.md) — so that a
reviewer can read it next to the trail and see, for each record, which rule
applied. Rules carry an `id` so that a refusal and the evidence pack can name
the rule that decided.

## BEH-GX-058: The first matching rule decides, and with no match a ticket is required under the defaults

> **Invariant:** [INV-GX-003](../invariants.md#inv-gx-003-an-allowed-call-holds-a-valid-binding-with-an-equal-digest), [INV-GX-011](../invariants.md#inv-gx-011-every-port-failure-on-a-decision-path-refuses)
> **See:** [ADR-GX-014](../decisions/014-deny-by-default-policy.md)
> **Satisfies:** [URS-GX-006](../urs.md#urs-gx-006-approve-a-change-before-it-is-made)
> **Risk:** [RSK-GX-011](../gxp/03-risk-assessment.md#rsk-gx-011), [RSK-GX-007](../gxp/03-risk-assessment.md#rsk-gx-007)
> **Regulatory:** supports 21 CFR 11.10(f); EU GMP Annex 11 §12.1

```
REQUIREMENT: For an `OperationRequest`, the policy MUST be evaluated by taking
             the rules in their declared order and choosing the first whose
             `operations` contains the request's `operation` and whose
             `target` pattern, when present, matches the request's `target`. A
             rule with a `target` pattern MUST NOT match a request without
             `target`.
```

```
REQUIREMENT: A pattern MUST match a string when the whole string equals the
             pattern with each `*` standing for any run of zero or more
             characters. No other character MAY have a special meaning;
             matching MUST be case-sensitive and by code point.
```

```
REQUIREMENT: When no rule matches, the outcome MUST be "ticket required" with
             `defaults` as the requirements. No configuration MAY change this
             to an allow.
```

```
REQUIREMENT: For a `reconcile`, the policy MUST be evaluated once per entry
             action, with that action's operation and target, exactly as core
             submits it (BEH-BR-222).
```

First match in declared order is the rule a reviewer can apply by eye, top to
bottom, without computing specificity. The default is a ticket because the
failure modes are not symmetric: a missing rule that demands a ticket blocks
a change and someone notices; a missing rule that allows one lets a regulated
change through and nobody does ([RSK-GX-011](../gxp/03-risk-assessment.md#rsk-gx-011)).

## BEH-GX-059: Exemptions are explicit rules with a justification

> **See:** [ADR-GX-014](../decisions/014-deny-by-default-policy.md), [ADR-GX-027](../decisions/027-claims-and-non-claims.md)
> **Satisfies:** [URS-GX-006](../urs.md#urs-gx-006-approve-a-change-before-it-is-made), [URS-GX-016](../urs.md#urs-gx-016-know-which-obligations-remain-mine)
> **Risk:** [RSK-GX-011](../gxp/03-risk-assessment.md#rsk-gx-011), [RSK-GX-007](../gxp/03-risk-assessment.md#rsk-gx-007)
> **Regulatory:** supports EU GMP Annex 11 §1 (risk-based decisions documented); 21 CFR 11.10(f)

```
REQUIREMENT: An "exempt" rule MUST carry a `justification` of at least 20
             characters after trimming. The policy validation MUST refuse an
             exempt rule without one with `GxpLayerInvalid` (BEH-GX-004).
```

```
REQUIREMENT: An exempt rule MUST list its operations explicitly. An exempt
             rule whose `operations` contains every `GatedOperation` and has
             no `target` MUST be refused with `GxpLayerInvalid`, since it
             would turn the policy into an allow-all.
```

```
REQUIREMENT: Every exempt rule, with its justification, MUST appear in the
             installation evidence (BEH-GX-113) and in the human-readable
             rendering of the evidence pack (BEH-GX-134), so that each
             exemption is visible to the person approving the installation.
```

Exemptions are expected — a `restart` of a non-GMP plugin, a `retry` after a
transient fault — and the policy must be able to say so without a ticket for
every routine act, or operators will find ways around it
([RSK-GX-007](../gxp/03-risk-assessment.md#rsk-gx-007)). The justification is what makes an exemption a recorded
decision rather than a configuration accident.

## BEH-GX-060: Each rule states how many signers, with which meanings, and what the ticket binds

> **Invariant:** [INV-GX-003](../invariants.md#inv-gx-003-an-allowed-call-holds-a-valid-binding-with-an-equal-digest), [INV-GX-004](../invariants.md#inv-gx-004-the-approver-is-never-the-requester), [INV-GX-015](../invariants.md#inv-gx-015-every-signed-binding-carries-a-manifestation)
> **See:** [ADR-GX-012](../decisions/012-binding-contents.md), [ADR-GX-015](../decisions/015-separation-of-duties.md), [ADR-GX-016](../decisions/016-signature-port-and-manifestation.md)
> **Satisfies:** [URS-GX-007](../urs.md#urs-gx-007-bind-an-approval-to-exactly-the-change-approved), [URS-GX-008](../urs.md#urs-gx-008-show-who-signed-when-and-with-what-meaning), [URS-GX-010](../urs.md#urs-gx-010-keep-requester-and-approver-apart)
> **Risk:** [RSK-GX-009](../gxp/03-risk-assessment.md#rsk-gx-009), [RSK-GX-006](../gxp/03-risk-assessment.md#rsk-gx-006)
> **Regulatory:** supports 21 CFR 11.50(a)(3), 11.70, 11.10(g); EU GMP Annex 11 §14

| Field | Effect on issuing ([BEH-GX-069](./09-approval-tickets.md#beh-gx-069-issueticket-turns-a-proposed-request-into-a-signed-ticket)) and on the gate ([BEH-GX-089](./12-approval-gate.md)) |
| --- | --- |
| `signatures` | the ticket needs that many signatures from distinct signers, none of them the requester ([BEH-GX-078](./10-signature-capture-port.md#beh-gx-078-signers-are-distinct-never-the-requester-and-never-a-reserved-actor)) |
| `meanings` | the signatures carry exactly these meanings, one each, matched as a multiset by `code` |
| `bindReason` | the binding includes the requester's `reason`, and the call's `reason` must equal it |
| `requireDigest` | the binding must contain `definition.digest`; a plugin-addressed request without a definition digest is refused |
| `requireFingerprints` | the binding must contain a fingerprint for every path of `configChange`; a request whose paths are not all fingerprinted is refused |
| `validity` | the longest window `notAfter − notBefore` a ticket under the rule may have |

```
REQUIREMENT: `signatures` MUST be an integer from 1 to 5, and `meanings` MUST
             have exactly `signatures` entries. Each `code` MUST match
             `^[a-z][a-z0-9-]{0,31}$`, and each `text` MUST be 1 to 200
             characters, the wording the manifestation will show (BEH-GX-085).
```

```
REQUIREMENT: `validity` MUST be at least 1 minute and at most 30 days.
```

```
REQUIREMENT: `requireFingerprints` MUST be refused with `GxpLayerInvalid` on a
             rule none of whose operations is `install`, `reconfigure` or
             `reconcile`, and on any rule when `GxpLayer.make` was given
             `fingerprints: "not-used"` or an eligibility list with no
             entries (BEH-GX-004), since every configuration change under the
             rule would then be refused.
```

```
REQUIREMENT: `requireDigest` MUST be refused with `GxpLayerInvalid` on a rule
             whose operations include `defineRealm` or
             `acknowledgeAuditDegraded`, which address no plugin and carry no
             definition (BEH-BR-219).
```

`requireDigest` is how a policy binds an approval to a specific build of a
plugin, closing the gap core leaves between a version label and the code
that runs ([RSK-BR-017](../../core/gxp/03-risk-assessment.md#rsk-br-017) residual). `requireFingerprints` binds the approval
to the configuration values, through HMACs only
([13 — Config Fingerprints](./13-config-fingerprints.md)); without it, an
approval of a `reconfigure` covers the changed paths but not the values.

## BEH-GX-061: A policy is identified by its digest, and a ticket is valid only under the policy it was issued under

> **Invariant:** [INV-GX-012](../invariants.md#inv-gx-012-the-canonical-form-is-deterministic-across-platforms), [INV-GX-003](../invariants.md#inv-gx-003-an-allowed-call-holds-a-valid-binding-with-an-equal-digest)
> **See:** [ADR-GX-005](../decisions/005-jcs-and-sha256.md), [ADR-GX-014](../decisions/014-deny-by-default-policy.md), [ADR-GX-012](../decisions/012-binding-contents.md)
> **Satisfies:** [URS-GX-007](../urs.md#urs-gx-007-bind-an-approval-to-exactly-the-change-approved), [NFR-GX-001](../urs.md#nfr-gx-001-deterministic-outputs)
> **Risk:** [RSK-GX-011](../gxp/03-risk-assessment.md#rsk-gx-011), [RSK-GX-015](../gxp/03-risk-assessment.md#rsk-gx-015)
> **Regulatory:** supports EU GMP Annex 11 §10; 21 CFR 11.10(k)

```
REQUIREMENT: The policy digest MUST be "sha256:" followed by the lower-case
             hexadecimal SHA-256 of the RFC 8785 canonical form of the policy,
             with `validity` normalised to an integer number of milliseconds
             before canonicalising.
```

```
REQUIREMENT: Every ticket MUST record the digest of the policy under which it
             was issued (BEH-GX-065), and the gate MUST treat a ticket whose
             policy digest differs from that of the policy in force as
             invalid.
```

```
REQUIREMENT: The digest of the policy in force MUST be reported by the
             installation checks (BEH-GX-113) and recorded in every
             consumption event (BEH-GX-071) and every evidence pack.
```

Binding tickets to the policy means a policy change cannot retroactively
weaken approvals already given, nor make tickets issued under a stricter
regime pass under a looser one. The cost is that a policy change makes open
tickets unusable, which is the same cost as a key rotation
([ADR-GX-019](../decisions/019-key-provider-and-rotation.md)) and for the same reason.

## BEH-GX-062: acknowledgeAuditDegraded must have its own, deliberate rule

> **See:** [ADR-GX-014](../decisions/014-deny-by-default-policy.md), [ADR-BR-031](../../core/decisions/031-audit-failure-policy.md)
> **Satisfies:** [URS-GX-006](../urs.md#urs-gx-006-approve-a-change-before-it-is-made)
> **Risk:** [RSK-GX-010](../gxp/03-risk-assessment.md#rsk-gx-010), [RSK-BR-020](../../core/gxp/03-risk-assessment.md#rsk-br-020)
> **Regulatory:** supports EU GMP Annex 11 §13; 21 CFR 11.10(e)

```
REQUIREMENT: A policy MUST contain at least one rule whose `operations`
             includes `acknowledgeAuditDegraded`. Policy validation MUST
             refuse a policy without one with `GxpLayerInvalid`; the defaults
             MUST NOT apply to this operation.
```

```
REQUIREMENT: The installation evidence and the rendered evidence pack MUST
             show the rule that governs `acknowledgeAuditDegraded`, and when
             it is a "ticket" rule MUST add: "While the ticket store is
             unavailable, the audit-degraded latch cannot be acknowledged."
```

Core submits `acknowledgeAuditDegraded` to the gate like any operator call
([BEH-BR-206](../../core/behaviors/23-audit-sink-and-record.md)). It is the call that ends a degradation, and it is likely to
be needed when infrastructure has just failed — possibly the same database
that holds tickets. Requiring a ticket keeps a person's approval on the act of
resuming changes; exempting it keeps the latch clearable during a wider
outage. Both are defensible, so the companion forces the consumer to choose
and shows the consequence of the choice, instead of choosing silently.

## BEH-GX-063: Shutdown and system transitions are outside the policy

> **See:** [ADR-GX-014](../decisions/014-deny-by-default-policy.md), [ADR-BR-032](../../core/decisions/032-operation-gate.md)
> **Satisfies:** [URS-GX-016](../urs.md#urs-gx-016-know-which-obligations-remain-mine)
> **Risk:** [RSK-GX-011](../gxp/03-risk-assessment.md#rsk-gx-011)
> **Regulatory:** supports EU GMP Annex 11 §16 (the safe direction stays open)

```
REQUIREMENT: A policy rule MUST NOT name `shutdown` or a `SystemTransition`;
             policy validation MUST refuse such a rule with `GxpLayerInvalid`.
```

```
REQUIREMENT: Documentation of the policy MUST state that core never submits
             `shutdown` or a system transition to the gate (BEH-BR-223), so
             that no policy can require approval for them, and that they are
             recorded in the trail without a ticket.
```

A rule naming `shutdown` would never be consulted. System transitions are
recorded as system records ([BEH-BR-199](../../core/behaviors/23-audit-sink-and-record.md)) and pass no gate. Refusing it at
construction prevents a policy from appearing to control something it does
not.

## BEH-GX-064: The policy is checked once, at construction, and fixed for the life of the gate

> **Invariant:** [INV-GX-011](../invariants.md#inv-gx-011-every-port-failure-on-a-decision-path-refuses), [INV-GX-005](../invariants.md#inv-gx-005-no-configuration-value-or-key-material-appears-in-any-companion-output)
> **See:** [ADR-GX-014](../decisions/014-deny-by-default-policy.md), [ADR-GX-003](../decisions/003-ports-without-defaults.md)
> **Satisfies:** [URS-GX-006](../urs.md#urs-gx-006-approve-a-change-before-it-is-made), [NFR-GX-007](../urs.md#nfr-gx-007-no-secrets-in-any-output)
> **Risk:** [RSK-GX-011](../gxp/03-risk-assessment.md#rsk-gx-011)
> **Regulatory:** supports EU GMP Annex 11 §10 (change management of the configuration)

```
REQUIREMENT: The policy MUST be checked when `GxpLayer.make` builds the
             gate, against every rule of this file. Any violation MUST fail
             the layer with `GxpLayerInvalid`, naming the rule `id` and the
             field, and the host MUST NOT be built.
```

```
REQUIREMENT: The gate MUST evaluate the policy it was built with for the whole
             of its life. The companion MUST NOT offer a way to replace,
             reload or patch a policy in a running gate; a policy change takes
             effect with a new layer and therefore a new host.
```

```
REQUIREMENT: Rule `id`s MUST be unique within the policy. A rule that can
             never match because an earlier rule matches every request it
             would match MUST be reported as a warning in the installation
             evidence, naming both rules.
```

```
REQUIREMENT: A policy MUST NOT contain a configuration value, a credential or
             a person's name; `justification` and `Meaning.text` are free text
             and the installation evidence MUST print them so that their
             content is reviewed.
```

A policy that could be reloaded in place would make "which policy applied to
this change" depend on timing. Fixing it per gate makes the answer one value
— the policy digest recorded with each consumption — and puts every policy
change through the same path as any other change to the host's assembly.

---

_Previous: [07 — Optional Sealing](./07-optional-sealing.md)_ · _Next: [09 — Approval Tickets](./09-approval-tickets.md)_
