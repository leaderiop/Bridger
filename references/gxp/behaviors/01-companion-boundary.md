# 01 — Companion Boundary

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-GX-BEH-01                                            |
> | Revision       | 0.3                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-GX-03 §5)           |
> | Approved by    | — (pending; single maintainer, see PROC-GX-03 §5)            |
> | Classification | Functional Specification                                     |
> | Change History | 0.3 (2026-11-10): BEH-GX-004: the anchoring fiber of audit-chain's sink is the one fiber the layer starts; one layer per host. BEH-GX-007: the core version is read from `Bridger.version` (H6, low); follow-up: `GxpPlatformUnsupported`, `CanonicalisationFailed` declared as `Schema.TaggedError`, as raised (CCR-GX-005)<br>0.2 (2026-11-09): BEH-GX-001 `@bridger/audit-chain` as an optional peer dependency (C-09); BEH-GX-002 canonical domain widened to I-JSON numbers, the integer-only claim corrected (F-01); BEH-GX-004 `trail.gate` and the composed host gate; BEH-GX-007 an unsupported record shape is stored and marked, not refused (F-02); BEH-GX-008 sealing wording points at 21 (CCR-GX-002)<br>0.1 (2026-10-03): Initial draft (CCR-GX-001)                 |

---

`@bridger/gxp` is a separate, optional package that plugs into the ports
`@bridger/core` already has — `AuditSink`, `OperationGate` and
`ConfigFingerprinter` — and adds stores, checks and evidence around them
([ADR-GX-001](../decisions/001-separate-package.md), [ADR-BR-034](../../core/decisions/034-gxp-companion-scope.md)). This file fixes what the package may depend
on, which of its ports have defaults (none that matter), how it is assembled,
how it fails, and what it does not claim. Every later file assumes these
rules. This file owns BEH-GX-001–008 and uses all eight.

> **What the companion does not do — and who does**
>
> The companion assembles adapters and tests them. It does **not** store
> records itself, **authenticate** people, provide **signature controls**,
> hold **keys**, keep **clocks**, or make a system **compliant** or
> **validated**. Storage, identity, signature components, key custody and
> the system-level validation are the consumer's; the companion defines the
> ports through which the consumer supplies them and the checks that show
> whether the supplied parts behave as specified.

Planned source: `packages/gxp/src/GxpLayer.ts`, `packages/gxp/src/Crypto.ts`,
`packages/gxp/src/Errors.ts` and `packages/gxp/src/Compatibility.ts`
*(Planned)*. The testing entry point is
`packages/gxp/src/testing/index.ts` *(Planned)*
([19 — Testing Entry Point](./19-testing-entry-point.md)).

## BEH-GX-001: The companion depends on effect and one core minor line only

> **See:** [ADR-GX-001](../decisions/001-separate-package.md), [ADR-GX-025](../decisions/025-core-version-range.md), [ADR-BR-034](../../core/decisions/034-gxp-companion-scope.md)
> **Satisfies:** [NFR-GX-002](../urs.md#nfr-gx-002-minimal-dependencies), [URS-GX-016](../urs.md#urs-gx-016-know-which-obligations-remain-mine)
> **Risk:** [RSK-GX-019](../gxp/03-risk-assessment.md#rsk-gx-019)
> **Regulatory:** supports GAMP 5 supplier documentation of software components; EU GMP Annex 11 §4.5 (by keeping the component inventory small)

```
REQUIREMENT: The published package MUST declare runtime dependencies on
             `effect` and `@bridger/core` only, both as peer dependencies,
             and `@bridger/audit-chain` as an optional peer dependency,
             imported only by the sealing entry `@bridger/gxp/sealing`
             (BEH-GX-170). The package MUST NOT bundle any of them, and the
             main entry point MUST load without `@bridger/audit-chain`
             installed.
```

```
REQUIREMENT: The `@bridger/core` peer range MUST be one core minor line,
             written as `>=X.Y.Z <X.(Y+1).0`, and MUST equal the range in the
             compatibility matrix of the core interface map
             (appendices/core-interface-map.md). A core release outside that
             line MUST NOT be accepted by widening the range without a CCR-GX
             that records the core revisions re-checked.
```

```
REQUIREMENT: Core MUST NOT depend on the companion: no `@bridger/core` source
             file, type or test MAY import `@bridger/gxp`.
```

```
REQUIREMENT: The companion MUST use only the public exports of `@bridger/core`
             and `@bridger/core/testing`. It MUST NOT import a core file by
             deep path, read a private field, or rely on behaviour that no
             BEH-BR identifier states.
```

A component that is part of a regulated user's system appears in their
inventory and their supplier assessment. Every runtime dependency is one more
component to assess, and one more place where a change can enter unnoticed.
Two dependencies, both already present in any host that uses Bridger, add
nothing new to that inventory.

The range is narrow because the companion relies on specific core behaviour:
the order of a call ([BEH-BR-188](../../core/behaviors/22-attributable-operations.md)), the record shape ([BEH-BR-195](../../core/behaviors/23-audit-sink-and-record.md)), the
writer's retry in place ([BEH-BR-202](../../core/behaviors/23-audit-sink-and-record.md)) and the gate's refusal semantics
([BEH-BR-221](../../core/behaviors/25-operation-gate.md)). A core patch release may change none of these; a core minor
release may, and the companion must be re-checked against it before it is
accepted.

**Settled here.** The range covers one core minor line rather than one exact
core version. An exact pin would force a companion release for every core
patch, and a patch changes no BEH-BR requirement by core's own change-control
rules; a wider range would accept core changes that nobody re-checked. Every
core version actually tested is still listed individually in the matrix.

## BEH-GX-002: Cryptography comes from the platform only

> **Invariant:** [INV-GX-012](../invariants.md#inv-gx-012-the-canonical-form-is-deterministic-across-platforms)
> **See:** [ADR-GX-005](../decisions/005-jcs-and-sha256.md), [ADR-GX-001](../decisions/001-separate-package.md)
> **Satisfies:** [NFR-GX-002](../urs.md#nfr-gx-002-minimal-dependencies), [NFR-GX-001](../urs.md#nfr-gx-001-deterministic-outputs)
> **Risk:** [RSK-GX-015](../gxp/03-risk-assessment.md#rsk-gx-015)
> **Regulatory:** supports 21 CFR 11.10(e) and EU GMP Annex 11 §9 (by detection of alteration only, as stated in 05 and 07)

```ts
// illustrative — not type-checked
interface GxpCrypto {
  readonly sha256: (bytes: Uint8Array) => Effect.Effect<Uint8Array>
  readonly hmacSha256: (key: CryptoKey, bytes: Uint8Array) => Effect.Effect<Uint8Array>
}
```

```
REQUIREMENT: SHA-256 and HMAC-SHA256 MUST be computed with the platform's
             WebCrypto (`globalThis.crypto.subtle`) where it exists, and
             otherwise with `node:crypto`. The companion MUST NOT contain its
             own implementation of either function and MUST NOT depend on a
             third-party cryptography package.
```

```
REQUIREMENT: Every digest the companion writes MUST be the string "sha256:"
             followed by the 64 lower-case hexadecimal digits of SHA-256 over
             the UTF-8 bytes of the RFC 8785 canonical form of the input
             (ADR-GX-005), with exactly two exceptions: the digest of a file
             — an attachment, a traceability file, a file listed in an
             evidence-pack or archive manifest, `assessments.json` — is over
             the file's bytes as read (BEH-GX-123, BEH-GX-130, BEH-GX-135,
             BEH-GX-138), and the digest of a rendered text shown to a
             signer is over the UTF-8 bytes of that text (BEH-GX-074). No
             other digest algorithm or encoding MAY appear in a companion
             output.
```

```
REQUIREMENT: When neither WebCrypto nor `node:crypto` is available, building
             `GxpLayer` MUST fail with `GxpPlatformUnsupported { missing:
             "sha256" | "hmac-sha256" }`. The companion MUST NOT fall back to
             a slower or weaker implementation.
```

```
REQUIREMENT: The canonical form MUST be the same byte sequence for the same
             value on every supported platform, over the I-JSON domain, with
             numbers written as RFC 8785 §3.2.2.3 writes them. Outside the
             sink, canonicalisation MUST refuse, with
             `CanonicalisationFailed { path }`, a value that RFC 8785 cannot
             represent exactly: a non-finite number, a lone surrogate,
             `undefined` inside an array, a `bigint`, a `Date` or any
             non-plain object. `path` MUST name the position in the value and
             MUST NOT contain the value. A trail record is never refused: the
             sink writes the escaped encoding and marks the entry
             (BEH-GX-018).
```

```ts
// illustrative — not type-checked
class CanonicalisationFailed extends Schema.TaggedError<CanonicalisationFailed>()("CanonicalisationFailed", {
  path: Schema.String                                   // the position in the value; never the value
}) {}
```

The canonical form is where two parties that must agree on a digest — the
ticket issuer and the gate, the sink and the checker — can silently disagree
([RSK-GX-015](../gxp/03-risk-assessment.md#rsk-gx-015)). Restricting the inputs to what RFC 8785 serialises without
loss, and refusing everything else by name, removes the floating-point and
object-ordering cases where implementations differ.

**Settled here.** Revision 0.1 restricted numbers to integers within
±(2^53 − 1) on the ground that core's records held no others. Since
CCR-BR-018 a record's `annotations` carry arbitrary JSON values
([BEH-BR-195](../../core/behaviors/23-audit-sink-and-record.md), [BEH-BR-293](../../core/behaviors/30-operation-context-annotations.md)), including non-integer numbers, so the
canonical form uses RFC 8785's number serialisation throughout; the record
vector of [03 — Trail Sink](./03-trail-sink.md#beh-gx-018-the-sink-classifies-canonicalises-and-digests-every-record-and-marks-what-it-cannot-handle-exactly-instead-of-refusing-it) and check 17 cover it.

## BEH-GX-003: No port that stores, authenticates, signs, holds keys or decides has a default

> **Invariant:** [INV-GX-001](../invariants.md#inv-gx-001-no-decision-port-has-a-default-outside-the-testing-entry-point)
> **See:** [ADR-GX-003](../decisions/003-ports-without-defaults.md), [ADR-GX-024](../decisions/024-fixtures-are-marked.md), [ADR-BR-034](../../core/decisions/034-gxp-companion-scope.md), [ADR-BR-032](../../core/decisions/032-operation-gate.md)
> **Satisfies:** [URS-GX-016](../urs.md#urs-gx-016-know-which-obligations-remain-mine)
> **Risk:** [RSK-GX-017](../gxp/03-risk-assessment.md#rsk-gx-017)
> **Regulatory:** supports EU GMP Annex 11 §3.1 and §5 (by making every supplied component explicit); 21 CFR 11.10(d), 11.200 (by leaving controls to the consumer, never silently defaulting them)

| Port | Defined in | Default in the main entry point |
| --- | --- | --- |
| `TrailStore` | [BEH-GX-009](./02-trail-store-port.md#beh-gx-009-the-trailstore-port-has-three-methods-and-no-default) | none |
| `AnchorStore` | [BEH-GX-041](./06-high-water-marks-and-anchors.md#beh-gx-041-the-anchorstore-port-is-append-only-and-has-no-default) | none |
| `ApprovalPolicy` | [BEH-GX-057](./08-approval-policy.md#beh-gx-057-an-approvalpolicy-is-a-list-of-rules-over-operation-and-target-with-explicit-defaults) | none |
| `TicketStore` | [BEH-GX-068](./09-approval-tickets.md#beh-gx-068-the-ticketstore-is-an-append-only-event-log-with-its-own-sequence-and-compare-and-set) | none |
| `SignatureCapture` | [BEH-GX-073](./10-signature-capture-port.md#beh-gx-073-the-signaturecapture-port-captures-one-signature-per-request-and-has-no-default) | none, not even a no-op |
| `FingerprintKeyProvider` | [BEH-GX-105](./14-fingerprint-keys.md) | none |
| `FingerprintEligibility` | [BEH-GX-098](./13-config-fingerprints.md) | none (an empty allow-list must be passed explicitly) |

```
REQUIREMENT: The main entry point `@bridger/gxp` MUST NOT export an
             implementation of any port in the table above: no in-memory
             store, no allow-all policy, no accept-all or no-op signature
             capture, no generated or constant key provider.
```

```
REQUIREMENT: In-memory and scripted implementations MUST be exported only from
             `@bridger/gxp/testing`, and every value they produce MUST carry
             the fixture marker of BEH-GX-145, which the installation checks
             refuse (BEH-GX-113).
```

```
REQUIREMENT: No companion function MAY substitute a default for a port the
             caller omitted, at the type level or at run time. Where a feature
             is not used, the caller MUST say so explicitly (BEH-GX-004).
```

The parts named in the table are exactly the ones a regulated user must be
able to point at and say who supplied them, how they were qualified and who
controls them. A default would be a part nobody chose. Core makes the same
choice for its gate ([BEH-BR-217](../../core/behaviors/25-operation-gate.md)) and its sink ([BEH-BR-193](../../core/behaviors/23-audit-sink-and-record.md)); the
companion keeps it for every port it adds.

A pure function that only computes — canonicalisation, digests, the checks of
[05 — Checks on Read](./05-checks-on-read.md) — is not a port and has one
implementation.

## BEH-GX-004: GxpLayer.make requires every port, and a missing port is a type error

> **Invariant:** [INV-GX-001](../invariants.md#inv-gx-001-no-decision-port-has-a-default-outside-the-testing-entry-point)
> **See:** [ADR-GX-003](../decisions/003-ports-without-defaults.md), [ADR-GX-029](../decisions/029-sealing-through-audit-chain.md), [ADR-GX-030](../decisions/030-sink-marks-and-gate-refuses.md), [ADR-GX-017](../decisions/017-hmac-through-the-core-port.md)
> **Satisfies:** [URS-GX-016](../urs.md#urs-gx-016-know-which-obligations-remain-mine), [URS-GX-001](../urs.md#urs-gx-001-store-audit-records-with-honest-acknowledgement), [URS-GX-006](../urs.md#urs-gx-006-approve-a-change-before-it-is-made)
> **Risk:** [RSK-GX-017](../gxp/03-risk-assessment.md#rsk-gx-017), [RSK-GX-011](../gxp/03-risk-assessment.md#rsk-gx-011)
> **Regulatory:** supports EU GMP Annex 11 §4.4 (a stated configuration of the installed parts)

```ts
// illustrative — not type-checked
declare const GxpLayer: {
  make(options: {
    readonly scope: string                                // deployment scope bound into every binding (09, 12)
    readonly trail: {
      readonly store: TrailStore                         // 02
      readonly sealing: SealingOptions | "off"            // 21 (@bridger/audit-chain, from @bridger/gxp/sealing)
      readonly gate: TrailGateOptions | "not-used"        // 22, BEH-GX-177
    }
    readonly anchors: {
      readonly store: AnchorStore                         // 06
      readonly schedule: HighWaterSchedule                // 06
    } | "not-used"
    readonly approvals: {
      readonly policy: ApprovalPolicy                     // 08
      readonly tickets: TicketStore                       // 09
      readonly signatures: SignatureCapture               // 10
    } | "not-used"
    readonly fingerprints: {
      readonly keys: FingerprintKeyProvider               // 14
      readonly eligibility: FingerprintEligibility        // 13
    } | "not-used"
  }): Layer.Layer<AuditSink | TrailSinkStatus | OperationGate | ApprovalGateLink | ConfigFingerprinter, GxpLayerInvalid | GxpPlatformUnsupported | GxpCoreVersionUnsupported>
}

class GxpLayerInvalid extends Schema.TaggedError<GxpLayerInvalid>()("GxpLayerInvalid", {
  section: Schema.Literal("scope", "trail", "anchors", "approvals", "fingerprints"),
  message: Schema.String
}) {}
class GxpPlatformUnsupported extends Schema.TaggedError<GxpPlatformUnsupported>()("GxpPlatformUnsupported", {
  missing: Schema.Literal("sha256", "hmac-sha256")      // BEH-GX-002
}) {}
```

```
REQUIREMENT: Every key of the options object, and every key inside a section
             that is used, MUST be required in the type: omitting one MUST be
             a compile-time error. A section that is not used MUST be given as
             the literal "not-used" (for `sealing`, "off"); `undefined` and an
             absent key MUST NOT be accepted.
```

```
REQUIREMENT: The layer MUST provide `AuditSink` and `TrailSinkStatus` built
             by `trailSink` (BEH-GX-017); `ApprovalGateLink` built by
             `approvalGate` (BEH-GX-089), with the policy and ticket store of
             `approvals` and the top-level `scope`, only when `approvals` is
             used; `OperationGate` composed by BEH-GX-178 from the pieces
             "trail" (`trail.gate`), "chain" (`trail.sealing.gate`) and
             "approval", only when at least one of them is used; and `ConfigFingerprinter` built by `hmacFingerprinter`
             (BEH-GX-097) only when `fingerprints` is used. A section given as
             "not-used" MUST provide nothing, so that core's behaviour without
             that port applies unchanged (INV-BR-026). A blank `scope` MUST
             fail the layer with `GxpLayerInvalid`.
```

```
REQUIREMENT: Run-time validation of the options MUST fail the layer with
             `GxpLayerInvalid` when a port value lacks a method its type
             requires, or when the policy of `approvals` has a rule with
             `requireFingerprints` while `fingerprints` is "not-used" or its
             eligibility list has no entries (BEH-GX-060), although an empty
             list is valid on its own (BEH-GX-098). `fingerprints` used with
             no such rule, or with `approvals` "not-used", MUST be accepted.
             `message` MUST name the section and the missing member and
             nothing else.
```

```
REQUIREMENT: `GxpLayer.make` MUST NOT start a fiber, open a connection or call
             a port while the layer is built, except the reachability probes
             the caller asks for through the installation checks (BEH-GX-113)
             and, with sealing on and anchored, the anchoring fiber that
             audit-chain's `HashChainSink.make` starts in the layer's scope
             (BEH-AC-011, BEH-GX-170), which calls the anchor and receipt
             ports off the write path.
```

The literal "not-used" is the point of the design: a reviewer reading the
host's assembly sees, line by line, that approvals were deliberately left out
rather than forgotten. Core's ports are optional because a plain plugin host
needs none of them; the companion's are not, because its only reason to be
wired is that someone wants these controls.

The three core ports the layer provides are read once, when the host is
built ([BEH-BR-015](../../core/behaviors/02-host-construction.md)). The layer therefore has to be provided to
`Bridger.layer` and not to an individual operation, and, since its sink serves
one host ([BEH-GX-017](./03-trail-sink.md)), each host is given a layer of its own.

**Settled here.** `anchors` may be "not-used". Without it, tail loss is not
detectable ([BEH-GX-045](./06-high-water-marks-and-anchors.md#beh-gx-045-tailloss-is-reported-when-the-store-holds-less-than-a-mark-says-was-written)), and the checks report this as the finding
`unanchoredTail` on every run rather than staying silent; refusing to build
would push teams that only want approvals into a fake anchor store, which is
worse than an explicit, reported absence.

## BEH-GX-005: Every port failure on a decision path refuses

> **Invariant:** [INV-GX-011](../invariants.md#inv-gx-011-every-port-failure-on-a-decision-path-refuses)
> **See:** [ADR-GX-003](../decisions/003-ports-without-defaults.md), [ADR-BR-031](../../core/decisions/031-audit-failure-policy.md), [ADR-BR-032](../../core/decisions/032-operation-gate.md), [ADR-BR-039](../../core/decisions/039-config-fingerprint-port.md)
> **Satisfies:** [URS-GX-001](../urs.md#urs-gx-001-store-audit-records-with-honest-acknowledgement), [URS-GX-006](../urs.md#urs-gx-006-approve-a-change-before-it-is-made)
> **Risk:** [RSK-GX-010](../gxp/03-risk-assessment.md#rsk-gx-010), [RSK-GX-001](../gxp/03-risk-assessment.md#rsk-gx-001)
> **Regulatory:** supports 21 CFR 11.10(e), 11.10(f); EU GMP Annex 11 §9, §12.1

| Path | A port fails, dies, times out or answers malformed data | Outcome in core |
| --- | --- | --- |
| `trailSink` → `TrailStore.append` | `AuditWriteFailed` ([BEH-GX-019](./03-trail-sink.md#beh-gx-019-the-sink-fails-a-write-only-when-the-store-did-not-store-the-record-and-every-failure-is-auditwritefailed-without-record-content)) | writer retries in place; the call fails with `AuditUnavailable` after `auditTimeout` ([BEH-BR-203](../../core/behaviors/23-audit-sink-and-record.md)) |
| `approvalGate` → `TicketStore`, policy | refusal reason `ticket-store-unavailable` ([BEH-GX-089](./12-approval-gate.md)) | `OperationRejected`, one `rejected` record ([BEH-BR-220](../../core/behaviors/25-operation-gate.md)) |
| `hmacFingerprinter` → `FingerprintKeyProvider` | `ConfigFingerprintFailed` ([BEH-GX-100](./13-config-fingerprints.md)) | the call fails with `ConfigFingerprintUnavailable`, no record ([BEH-BR-188](../../core/behaviors/22-attributable-operations.md) step 4a) |
| `issueTicket` → `SignatureCapture` | `SignatureCaptureFailed` ([BEH-GX-077](./10-signature-capture-port.md#beh-gx-077-declining-and-failing-are-distinct-and-both-leave-the-ticket-unsigned)) | no signature is recorded; nothing reaches core |

```
REQUIREMENT: On every path in the table, a failure, a defect, an interruption,
             a timeout or a malformed answer of a caller-supplied port MUST
             end in the refusal shown, never in an acknowledgement, an allow,
             a fingerprint or a recorded signature.
```

```
REQUIREMENT: A companion function on a decision path MUST NOT catch a port's
             defect and continue as if the port had succeeded, and MUST NOT
             retry a port call whose first attempt may have taken effect,
             except `TrailStore.append`, whose retries core performs and whose
             idempotence makes them safe (BEH-GX-011).
```

```
REQUIREMENT: Off decision paths — checks on read, exports, evidence generation
             — a port failure MUST end the operation with its typed error and
             MUST NOT produce a partial result that looks complete. A check
             that cannot read the whole requested range MUST fail with
             `TrailReadFailed`, not report the part it read.
```

Failing closed is the only policy under which "no change without an
approval" or "no acknowledgement without a stored record" can be properties
of the system rather than hopes. It costs availability: a ticket store that is
down blocks every gated change ([RSK-GX-010](../gxp/03-risk-assessment.md#rsk-gx-010)). That cost is visible —
every refusal is recorded with its reason — and is the consumer's to manage
by making the store available, not the companion's to hide by letting
changes through.

## BEH-GX-006: No configuration value, key material or port text appears in any companion output

> **Invariant:** [INV-GX-005](../invariants.md#inv-gx-005-no-configuration-value-or-key-material-appears-in-any-companion-output)
> **See:** [ADR-BR-033](../../core/decisions/033-no-config-values-in-audit.md), [ADR-BR-039](../../core/decisions/039-config-fingerprint-port.md), [ADR-GX-017](../decisions/017-hmac-through-the-core-port.md), [ADR-GX-019](../decisions/019-key-provider-and-rotation.md)
> **Satisfies:** [NFR-GX-007](../urs.md#nfr-gx-007-no-secrets-in-any-output), [URS-GX-011](../urs.md#urs-gx-011-compare-configuration-values-without-revealing-them)
> **Risk:** [RSK-GX-014](../gxp/03-risk-assessment.md#rsk-gx-014), [RSK-BR-008](../../core/gxp/03-risk-assessment.md#rsk-br-008), [RSK-BR-024](../../core/gxp/03-risk-assessment.md#rsk-br-024)
> **Regulatory:** supports EU GMP Annex 11 §12.1; 21 CFR 11.10(d)

```
REQUIREMENT: No companion output — a stored entry, a ticket, a binding, a
             refusal reason, an error message, a log line, a metric, a check
             report, an evidence pack or an archive — MAY contain a
             configuration value (raw, decoded, redacted or summarised), a
             key, a part of a key, or a value derived from a key other than a
             fingerprint of BEH-GX-097.
```

```
REQUIREMENT: Every error the companion raises MUST carry a message written by
             the companion from a fixed template. It MUST NOT include the
             message, cause or stack of an error raised by a caller-supplied
             port, because port text can quote the data the port was handling.
             The port's error MAY be logged at debug level by tag only.
```

```
REQUIREMENT: The companion MUST NOT log a record's `reason`, a signer's
             printed name or an authentication event identifier at any level.
             These appear only in stored entries, tickets, reports and
             exports, where the consumer's access controls apply.
```

Core keeps values out of records and requests ([BEH-BR-197](../../core/behaviors/23-audit-sink-and-record.md),
[BEH-BR-219](../../core/behaviors/25-operation-gate.md)); the companion is downstream of both and must not reopen the
channel. The fingerprinter is the one component that receives values, through
core's port, and it returns only HMACs under a key the consumer holds
([BEH-GX-097](./13-config-fingerprints.md)).

## BEH-GX-007: The companion refuses to run against an unsupported core, and marks a record of an unsupported shape

> **See:** [ADR-GX-025](../decisions/025-core-version-range.md), [ADR-BR-034](../../core/decisions/034-gxp-companion-scope.md)
> **Satisfies:** [URS-GX-016](../urs.md#urs-gx-016-know-which-obligations-remain-mine), [URS-GX-003](../urs.md#urs-gx-003-detect-lost-duplicated-reordered-or-altered-stored-records)
> **Risk:** [RSK-GX-019](../gxp/03-risk-assessment.md#rsk-gx-019)
> **Regulatory:** supports EU GMP Annex 11 §10 (change management of interfacing components)

```ts
// illustrative — not type-checked
class GxpCoreVersionUnsupported extends Schema.TaggedError<GxpCoreVersionUnsupported>()("GxpCoreVersionUnsupported", {
  found: Schema.String,          // the core version read from @bridger/core's `Bridger.version`
  supported: Schema.String       // the peer range of BEH-GX-001
}) {}

const SUPPORTED_SCHEMA_VERSIONS = [1] as const
```

```
REQUIREMENT: Building `GxpLayer` MUST read the version `@bridger/core`
             exports as `Bridger.version` and MUST fail with `GxpCoreVersionUnsupported`
             when it lies outside the range of BEH-GX-001.
```

```
REQUIREMENT: The companion MUST state, as an exported constant, the
             `AuditRecord.schemaVersion` values it supports. `trailSink` MUST
             store a record with any other `schemaVersion` marked
             `schema: "unsupported"` and MUST NOT refuse it (BEH-GX-018); the
             checks on read MUST report such an entry as
             `unknownSchemaVersion` and MUST NOT skip it (BEH-GX-036).
```

```
REQUIREMENT: A record field that the supported schema does not define MUST be
             treated as a different shape: `trailSink` MUST store the record
             marked `schema: "unsupported"`, and the checks MUST report it as
             `unknownSchemaVersion`. The companion MUST NOT drop or rename a
             field to make a record fit.
```

An unknown shape is stored, marked, counted and reported, and `trailGate`
refuses operator changes while such entries exist
([BEH-GX-177](./22-trail-status-and-gate.md#beh-gx-177-trailgate-refuses-operator-changes-while-the-sink-reports-a-condition-of-its-own)). Revision 0.1 refused the record instead, which set the latch
and then stopped recording for the life of the host, because core retries a
refused record forever ([BEH-BR-202](../../core/behaviors/23-audit-sink-and-record.md), Settled (0)). Either way a schema
drift ([RSK-GX-019](../gxp/03-risk-assessment.md#rsk-gx-019)) does not go unnoticed; only the first keeps the
trail.

## BEH-GX-008: The companion inherits core's non-claims and adds its own

> **See:** [ADR-GX-027](../decisions/027-claims-and-non-claims.md), [ADR-GX-026](../decisions/026-prospective-specification.md), [ADR-BR-034](../../core/decisions/034-gxp-companion-scope.md), [ADR-BR-028](../../core/decisions/028-gxp-scope.md)
> **Satisfies:** [URS-GX-016](../urs.md#urs-gx-016-know-which-obligations-remain-mine)
> **Risk:** [RSK-GX-004](../gxp/03-risk-assessment.md#rsk-gx-004), [RSK-BR-018](../../core/gxp/03-risk-assessment.md#rsk-br-018)
> **Regulatory:** supports (by delimiting) 21 CFR 11.10, 11.50, 11.70, 11.200; EU GMP Annex 11 §4, §7, §9, §14, §17

```
REQUIREMENT: No companion type documentation, error message, report, evidence
             pack or guide MAY state that the companion, a host using it, or a
             trail it stores, checks or seals is compliant, validated,
             qualified, durable, protected against tampering, intact,
             complete, authentic or legally binding.
```

```
REQUIREMENT: Every check report and evidence pack MUST state, in its own text,
             the limits of what it shows: checks report "no findings of the
             checked kinds" (BEH-GX-033); seal verification "detects
             alteration, insertion, removal or reordering of sealed records up
             to the last verified anchor, against a party that cannot also
             rewrite the anchor store" (BEH-GX-173); evidence shows only
             executed tests (BEH-GX-121).
```

```
REQUIREMENT: Every obligation the companion leaves to the consumer MUST be
             named in the behaviour that leaves it, with the sentence "This is
             the consumer's obligation", so that the list in the compliance
             matrix can be derived from the behaviours.
```

The non-claims of [ADR-BR-034](../../core/decisions/034-gxp-companion-scope.md) bind both packages. The companion's own
list ([ADR-GX-027](../decisions/027-claims-and-non-claims.md)) adds what its parts could be mistaken for:

1. A conforming trail store is not thereby a durable one: the conformance
   suite shows behaviour under faults it injects, not the store's behaviour
   under faults of the user's infrastructure ([BEH-GX-025](./04-conformance-suite.md#beh-gx-025-runtrailstoreconformance-registers-the-numbered-cases-with-the-callers-test-runner)).
2. Checks on read detect the kinds of defect they name, and nothing else.
3. Sealing, which is `@bridger/audit-chain`'s, detects, it does not prevent,
   and only within the custody assumption stated in [BEH-GX-173](./21-sealing-through-audit-chain.md#beh-gx-173-seal-verification-is-described-in-exactly-one-way).
4. A captured signature carries what the capture port attests; the companion
   verifies neither the signer's identity nor the re-authentication
   ([BEH-GX-079](./10-signature-capture-port.md#beh-gx-079-re-authentication-and-the-11200-controls-are-attested-by-the-implementer-not-verified)).
5. An evidence pack records executed tests; it is not a qualification, and
   its pass verdicts are the runner's, not the companion's.

These are stated as behaviour rather than disclaimer text because the
honest-claims lint of `scripts/verify-traceability.sh` checks every companion
document, and an over-claim anywhere in the tree fails the build of the
specification ([ADR-GX-028](../decisions/028-checker-copy-and-adapt.md)).

---

_Next: [02 — Trail Store Port](./02-trail-store-port.md)_
