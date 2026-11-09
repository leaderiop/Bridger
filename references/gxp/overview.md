# Overview

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-GX-OVW                                               |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-GX-03 §5)           |
> | Approved by    | — (pending; single maintainer, see PROC-GX-03 §5)            |
> | Classification | Overview                                                     |
> | Change History | 0.2 (2026-11-09): Public surface re-baselined: `TrailEntry` marks, collision and audit-chain link; "stored-collision"; `TrailSinkStatus` and `trailGate`; `verifySeals` through `@bridger/audit-chain`; `GxpLayer.make` `trail.gate` and audit-chain sealing options (F-01, F-02, C-09) (CCR-GX-002)<br>0.1 (2026-10-03): Initial draft (CCR-GX-001)                 |

---

## Mission

`@bridger/core` specifies hooks for a regulated user — attributable
operations, an `AuditSink`, an `OperationGate`, a `ConfigFingerprinter`, the
audit position in `Host.controls` — and implements none of the controls behind
them ([ADR-BR-034](../core/decisions/034-gxp-companion-scope.md)). `@bridger/gxp` is the optional
package that assembles those controls from caller-supplied ports and tests
them:

- a **trail store** contract, an `AuditSink` built on it, and a conformance
  suite that shows whether an adapter keeps the contract;
- **checks on read** that report gaps, duplicates, disorder, digest
  mismatches, marked and colliding entries, missing terminal records, tail
  loss against high-water marks, and — when optional sealing through
  `@bridger/audit-chain` is on — chain breaks and anchor mismatches;
- a **trail gate** piece that refuses operator changes while the sink reports
  a condition of its own, so that the sink never refuses a record;
- **approvals**: a policy, approval tickets signed before the call, and an
  `OperationGate` that checks the ticket, links each signature to the change
  it approved and enforces separation of duties;
- **configuration fingerprints**: an HMAC fingerprinter behind core's
  `ConfigFingerprinter` port, so a ticket can bind to a value without anyone
  seeing it;
- **evidence**: installation checks, operational evidence from test-runner
  output, an evidence pack, and trail export with re-verification.

The package assembles and tests; it never makes a system compliant or
validated ([README](./README.md), [ADR-GX-027](./decisions/027-claims-and-non-claims.md)). Nothing here is
implemented (`implementation: absent`).

## Design philosophy

1. **Ports, not defaults.** Everything that stores, authenticates, signs,
   holds keys or decides is a caller-supplied port with no default outside
   `@bridger/gxp/testing` ([ADR-GX-003](./decisions/003-ports-without-defaults.md)).
2. **Fail closed.** A port failure on a decision path refuses; the sink
   acknowledges only what the store reports stored.
3. **Findings, not verdicts.** Checks report what they found, by kind, and
   never that a trail is complete ([ADR-GX-007](./decisions/007-checks-never-claim-integrity.md)).
4. **Sign first, then call.** A human signs a ticket before the call; the gate
   only checks the ticket within `gateTimeout` ([ADR-GX-010](./decisions/010-sign-first-then-call.md)).
5. **One canonical form.** RFC 8785 canonical JSON and SHA-256 for every digest,
   binding and fingerprint input, with published test vectors ([ADR-GX-005](./decisions/005-jcs-and-sha256.md)).
6. **Evidence from execution only.** Results come from runner output; gaps stay
   gaps ([ADR-GX-021](./decisions/021-oq-from-runner-output.md)).

## Packages

| Entry point | Contents | Path |
| ----------- | -------- | ---- |
| `@bridger/gxp` | Ports, sink, checks, approvals, fingerprints, evidence, export, `GxpLayer` | `packages/gxp/src/index.ts` *(Planned)* |
| `@bridger/gxp/testing` | `memoryTrailStore`, `faultyTrailStore`, `memoryTicketStore`, `memoryAnchorStore`, `scriptedSignatureCapture`, `testKeyProvider` — all marked as fixtures | `packages/gxp/src/testing/index.ts` *(Planned)* |

Dependencies: `effect`, `@bridger/core` within the one core minor line of
[ADR-GX-025](./decisions/025-core-version-range.md), and the platform's own cryptography (NFR-GX-002).

## Public API surface

Illustrative signatures. The behaviour files are normative; where this summary
and a behaviour file differ, the behaviour file governs.

### Ports

```ts
// illustrative — not type-checked
// 02 — Trail store port
interface TrailStoreShape {
  readonly manifest: TrailStoreManifest
  readonly append: (entry: TrailEntry) => Effect.Effect<"stored" | "stored-collision" | "already-stored", TrailWriteFailed>
  readonly read: (q: { hostId: string; fromSeq?: number; toSeq?: number }) => Stream.Stream<TrailEntry, TrailReadFailed>
  readonly hosts: Effect.Effect<readonly HostExtent[], TrailReadFailed>
}
interface TrailEntry {
  readonly hostId: string; readonly auditSeq: number; readonly recordId: string   // equal to the record's
  readonly record: AuditRecord              // core's record, schemaVersion 1
  readonly canonical: string                // RFC 8785 text, kept as written
  readonly digest: string                   // "sha256:" + hex(SHA-256(UTF-8(canonical)))
  readonly marks?: { schema?: "unsupported"; canonical?: "jcs-escaped" }   // set by the sink (03)
  readonly collision?: { reason: "record-id" | "host-seq"; with: string }  // set by the store (02)
  readonly link?: ChainLinkV1               // @bridger/audit-chain's link, only with sealing on (21)
}

// 06 — Anchor store port, under separate custody
interface AnchorStoreShape {
  readonly manifest: { name: string; version: string; custodian: string; fixture?: true }
  readonly put: (mark: HighWaterMark) => Effect.Effect<"stored" | "already-stored", AnchorWriteFailed>
  readonly list: (q: { hostId: string }) => Stream.Stream<HighWaterMark, AnchorReadFailed>
  readonly latest: (q: { hostId: string }) => Effect.Effect<Option.Option<HighWaterMark>, AnchorReadFailed>
}

// 09 — Ticket store port: an append-only event log with compare-and-set
interface TicketStoreShape {
  readonly manifest: { name: string; version: string; fixture?: true }
  readonly append: (q: { ticketId: string; expectedVersion: number; at: string; event: TicketEvent }) =>
    Effect.Effect<StoredTicketEvent, TicketVersionConflict | TicketWriteFailed>
  readonly ticket: (ticketId: string) => Effect.Effect<readonly StoredTicketEvent[], TicketReadFailed>
  readonly events: (q: { fromSeq?: number }) => Stream.Stream<StoredTicketEvent, TicketReadFailed>
}

// 10 — Signature capture port: no default, not even a no-op
interface SignatureCaptureShape {
  readonly manifest: { name: string; version: string; methods: readonly string[];
                       attestation: { document: string; version: string }; fixture?: true }
  readonly capture: (req: SignatureRequest) => Effect.Effect<CapturedSignature, SignatureDeclined | SignatureCaptureFailed>
}
interface SignatureRequest {
  readonly ticketId: string
  readonly bindingDigest: string
  readonly meaning: { readonly code: string; readonly text: string }
  readonly requester: { readonly id: string; readonly kind: "user" | "service" }
  readonly rendered: { readonly text: string; readonly digest: string }   // what the signer sees, and its digest
  readonly notAfter: string
}
interface CapturedSignature {
  readonly signer: { readonly id: string; readonly kind: "user"; readonly printedName: string }
  readonly meaning: string                  // equals request.meaning.code
  readonly renderedDigest: string           // equals request.rendered.digest
  readonly authentication: {
    readonly method: string
    readonly event: string
    readonly components: number             // distinct identification components used
    readonly reauthenticated: true          // attested by the port, not verified by the companion
  }
}                                           // signedAt is stamped by the companion from Clock

// 14 — Fingerprint key provider
interface FingerprintKeyProviderShape {
  readonly manifest: { name: string; version: string; custodian: string; fixture?: true }
  readonly current: Effect.Effect<FingerprintKey, FingerprintKeyUnavailable>
  readonly byId: (keyId: string) => Effect.Effect<Option.Option<FingerprintKey>, FingerprintKeyUnavailable>
}
interface FingerprintKey {
  readonly keyId: string                    // "test:" prefix reserved for fixtures
  readonly key: CryptoKey                   // WebCrypto HMAC SHA-256, usage "sign"; never exported
}

class TrailStore extends Context.Service<TrailStore, TrailStoreShape>()("@bridger/gxp/TrailStore") {}
class AnchorStore extends Context.Service<AnchorStore, AnchorStoreShape>()("@bridger/gxp/AnchorStore") {}
class TicketStore extends Context.Service<TicketStore, TicketStoreShape>()("@bridger/gxp/TicketStore") {}
class SignatureCapture extends Context.Service<SignatureCapture, SignatureCaptureShape>()("@bridger/gxp/SignatureCapture") {}
class FingerprintKeyProvider extends Context.Service<FingerprintKeyProvider, FingerprintKeyProviderShape>()("@bridger/gxp/FingerprintKeyProvider") {}
```

### Trail, checks, anchors, sealing and the trail gate

```ts
// illustrative — not type-checked
// 03 — the AuditSink core calls; stores and marks, fails only when the store did not store the record
declare function trailSink(store: TrailStoreShape, options?: { sealing?: SealingOptions | "off" }): Layer.Layer<AuditSink | TrailSinkStatus>

// 22 — a core gate piece over the sink's counts; composed with audit-chain's ChainGate and the approval gate
declare const trailGate: (status: TrailSinkStatusShape, options: TrailGateOptions) => Effect.Effect<Gate<OperationRequest>, GxpLayerInvalid>

// 04 — conformance suite, registered with the caller's test runner, driving the real core through TestHost
declare function runTrailStoreConformance(
  makeStore: Effect.Effect<TrailStoreShape, unknown, Scope.Scope>,
  options: { test: TestRegistrar; reopen: ReopenStore | "not-supported"; seed: number; evidenceDir: string }
): void

// 05 — checks on read: pure over entries, or streaming with bounded memory over a store
declare function checkTrailEntries(entries: Iterable<TrailEntry>, options: { expectClosed: boolean }): CheckReport
declare function checkStoredTrail(
  store: TrailStoreShape,
  options: { hostId: string; expectClosed: boolean; fromSeq?: number; toSeq?: number; pageSize?: number }
): Effect.Effect<CheckReport, TrailReadFailed | CheckCapacityExceeded>
declare function checkApprovals(
  store: TrailStoreShape, tickets: TicketStoreShape, options: { hostId: string; scope: string; policy: ApprovalPolicy }
): Effect.Effect<CheckReport, TrailReadFailed | TicketReadFailed | CheckCapacityExceeded>

// 06 — high-water marks from Host.controls.auditPosition; at close, read after the flush (auditLastSeq is a lower bound)
declare function recordHighWater(host: Host, anchors: AnchorStoreShape, schedule: HighWaterSchedule):
  Effect.Effect<HighWaterRecorder, never, Scope.Scope>
declare function checkHighWater(store: TrailStoreShape, anchors: AnchorStoreShape, options: { hostId: string }):
  Effect.Effect<CheckReport, TrailReadFailed | AnchorReadFailed>

// 21 — seal verification through @bridger/audit-chain (sealing is off by default; import from @bridger/gxp/sealing)
declare function verifySeals(store: TrailStoreShape, marks: AnchorStoreShape, sealing: VerifySealsInputs, options: { hostId: string; pageSize?: number }):
  Effect.Effect<CheckReport & { chain: ChainReport }, TrailReadFailed | AnchorReadFailed | ReceiptStoreFailed>

interface CheckReport {
  readonly format: "bridger-gx-check/1"
  readonly scope: readonly { readonly hostId: string; readonly fromSeq: number; readonly toSeq: number }[]
  readonly checkedKinds: readonly FindingKind[]     // the kinds this run looked for
  readonly notCheckedKinds: readonly FindingKind[]  // every other kind, never omitted
  readonly findings: readonly Finding[]
  readonly statement: string                        // "No findings of the checked kinds." or "<n> findings ..."
}
```

### Approvals

```ts
// illustrative — not type-checked
// 08 — a policy is plain data, checked when GxpLayer.make builds the gate; deny by default
interface ApprovalPolicy {
  readonly v: 1; readonly name: string; readonly version: string
  readonly rules: readonly PolicyRule[]
  readonly defaults: Requirements           // apply when no rule matches
}
type PolicyRule =
  | { readonly id: string; readonly operations: readonly GatedOperation[]; readonly target?: TargetPattern
      readonly decision: "ticket"; readonly requirements: Requirements }
  | { readonly id: string; readonly operations: readonly GatedOperation[]; readonly target?: TargetPattern
      readonly decision: "exempt"; readonly justification: string }
interface Requirements {
  readonly signatures: number; readonly meanings: readonly { code: string; text: string }[]
  readonly bindReason: boolean; readonly requireDigest: boolean; readonly requireFingerprints: boolean
  readonly validity: Duration.Input
}

// 09 — tickets: issued → signed → consumed | expired | revoked; issueTicket captures one signature per meaning.
//      A declined or failed capture leaves the ticket issued for good; the change needs a new ticket.
declare function issueTicket(
  proposal: { scope: string; requests: readonly ProposedRequest[]; notBefore?: string; notAfter: string },
  deps: { policy: ApprovalPolicy; tickets: TicketStoreShape; signatures: SignatureCaptureShape }
): Effect.Effect<Ticket, IssueRefused | SignatureDeclined | SignatureCaptureFailed | TicketWriteFailed | TicketVersionConflict>
declare function revokeTicket(q: { ticketId: string; by: Actor; reason: string }, deps: { tickets: TicketStoreShape }):
  Effect.Effect<void, RevokeRefused | TicketWriteFailed | TicketVersionConflict>
declare function bindingDigest(binding: Binding): `sha256:${string}`   // "sha256:" + SHA-256(JCS(binding))

// 12 — the OperationGate core consults; policy → ticket → window → digest → separation of duties → consume → allow
declare function approvalGate(options: {
  policy: ApprovalPolicy; tickets: TicketStoreShape; scope: string; clock?: Clock.Clock; deadline?: Duration.Input
}): Layer.Layer<OperationGate | ApprovalGateLink, GxpLayerInvalid>
// ApprovalGateLink.attach(host) reads Host.controls once: fixes hostId and the deadline (default gateTimeout − 5 s)
```

### Fingerprints

```ts
// illustrative — not type-checked
// 13 — implements core's ConfigFingerprinter (ADR-BR-039); fp1:hmac-sha256:<keyId>:<b64url>
declare function hmacFingerprinter(options: { keys: FingerprintKeyProviderShape; eligibility: FingerprintEligibility; scope: string }):
  Layer.Layer<ConfigFingerprinter, GxpLayerInvalid>
interface FingerprintEligibility {           // allow-list, deny by default; no class for low-entropy secrets
  readonly v: 1
  readonly entries: readonly { pluginId: string; realm?: string; path: string; form?: "raw" | "decoded"
                               entropy: "public" | "high"; note: string }[]
}
// the same decoding and selection the call will perform, so a ticket can bind before the call
declare function proposeFingerprints(
  q: { definition: PluginDefinition; target: { id: string; realm: string }; form: "raw" | "decoded"; value: unknown; paths: readonly string[] },
  deps: { keys: FingerprintKeyProviderShape; eligibility: FingerprintEligibility; scope: string }
): Effect.Effect<readonly { path: string; fingerprint: string }[], FingerprintProposalFailed>
// 14 — compares a candidate value with a stored fingerprint under the key that made it; reveals nothing else
declare function matchesFingerprint(
  q: { fingerprint: string; scope: string; pluginId: string; path: string; form: "raw" | "decoded"; value: unknown },
  deps: { keys: FingerprintKeyProviderShape; eligibility: FingerprintEligibility }
): Effect.Effect<"match" | "no-match" | "key-retired-unavailable", FingerprintMalformed | FingerprintCompareRefused | FingerprintKeyUnavailable>
```

### Evidence and export

```ts
// illustrative — not type-checked
// 15 — IQ: core gxp/04 §5.1 checks through Host.controls, plus the companion's; each result proof or probe
declare function runInstallationChecks(host: Host, options: {
  gxp: GxpInstallation; expected: InstallationRequirements; packageRoot: string; lockfile: string
  provenance?: { verifiedBy: string; attestationDigest: string }
}): Effect.Effect<IqReport>                 // never fails: a check that cannot run is "not-executed"
// 16 — OQ: results only from runner output; no test means "not covered"
declare function collectOqEvidence(q: {
  runnerOutputs: readonly { format: "vitest-json" | "junit-xml" | "cucumber-ndjson"; path: string; run: string }[]
  traceability: { core: string; gx: string }; installed: InstalledIdentity; conformance?: readonly string[]
}): Effect.Effect<OqReport, RunnerOutputUnreadable>
// 17 — deterministic pack: manifest.json (bridger-gx-evidence/1), iq.json, oq.json, coverage.json, checks.json,
//      deviations.json, adapters.json, attachments/, report.md, report.html
declare function buildEvidencePack(q: {
  iq?: IqReport; oq?: OqReport; checks?: readonly CheckReport[]; adapterManifests: readonly unknown[]
  attachments: readonly { path: string; as: string }[]; outDir: string
}): Effect.Effect<{ readonly packDigest: string }, EvidenceWriteFailed>
declare function diffPacks(prev: string, next: string): Effect.Effect<PackDiff, EvidenceReadFailed>
// 18 — archives keep the original canonical bytes; readArchive re-verifies
declare function exportTrail(q: {
  store: TrailStoreShape; tickets: TicketStoreShape | "not-used"; anchors: AnchorStoreShape | "not-used"
  hostId: string; range: { fromSeq: number; toSeq: number } | "all"; scope: string
  policy: ApprovalPolicy | "not-used"; outDir: string
}): Effect.Effect<ArchiveManifest, ExportFailed>
declare function readArchive(dir: string, options?: { scope?: string; policy?: ApprovalPolicy; pageSize?: number; maxOpenRequests?: number }): Effect.Effect<{
  readonly manifest: ArchiveManifest; readonly files: readonly FileCheck[]
  readonly report: CheckReport; readonly links?: ApprovalLinkReport }, ArchiveUnreadable | CheckCapacityExceeded>

// 01 — one layer, every section required; "not-used" is spelled out, never omitted
declare const GxpLayer: {
  make(options: {
    scope: string                           // deployment scope bound into every binding
    trail: { store: TrailStoreShape; sealing: SealingOptions | "off"; gate: TrailGateOptions | "not-used" }
    anchors: { store: AnchorStoreShape; schedule: HighWaterSchedule } | "not-used"
    approvals: { policy: ApprovalPolicy; tickets: TicketStoreShape; signatures: SignatureCaptureShape } | "not-used"
    fingerprints: { keys: FingerprintKeyProviderShape; eligibility: FingerprintEligibility } | "not-used"
  }): Layer.Layer<AuditSink | OperationGate | ApprovalGateLink | ConfigFingerprinter, GxpLayerInvalid | GxpPlatformUnsupported | GxpCoreVersionUnsupported>
}
```

## Errors

Every error is a `Schema.TaggedError` carrying identifiers only — no
configuration value, key material, record content or port text — following
core's [ADR-BR-008](../core/decisions/008-error-taxonomy.md).

| Error | Raised by | Meaning |
| ----- | --------- | ------- |
| `TrailWriteFailed` / `TrailReadFailed` | trail store adapter | `reason`: unavailable, too-large, rejected ("conflict" withdrawn: a collision is stored); the sink answers core with `AuditWriteFailed` |
| `AnchorWriteFailed` / `AnchorReadFailed` | anchor store adapter | Anchor store unavailable or refusing |
| `TicketWriteFailed` / `TicketReadFailed` / `TicketVersionConflict` | ticket store adapter | Store failure, or a compare-and-set lost to a concurrent event |
| `SignatureDeclined` / `SignatureCaptureFailed` | signature port | The signer declined, or the port failed; no signature is recorded |
| `IssueRefused` / `RevokeRefused` | ticket functions | Policy or state does not allow the step (for example a request missing a `reason` its rule binds, or revoking a consumed ticket); a signer who is the requester fails the capture with `SignatureCaptureFailed` "malformed" |
| `FingerprintKeyUnavailable` / `FingerprintMalformed` / `FingerprintCompareRefused` / `FingerprintProposalFailed` | fingerprints | Key provider failed; a fingerprint not in `fp1` format; a comparison refused for a path no eligibility entry admits or a value outside the canonical domain; a proposal that could not decode as the call would |
| `CheckCapacityExceeded` | streaming checks | A configured memory bound would be exceeded; the check fails rather than drop data or report a partial result |
| `RunnerOutputUnreadable` / `EvidenceWriteFailed` / `EvidenceReadFailed` | evidence | Runner output not parseable; pack not written or not readable |
| `ExportFailed` / `ArchiveUnreadable` | export | Archive not written, or not readable as an archive |
| `GxpLayerInvalid` / `GxpPlatformUnsupported` / `GxpCoreVersionUnsupported` | `GxpLayer.make` | Missing port member, blank `scope` or an invalid policy (BEH-GX-064); platform cryptography missing; core or `schemaVersion` outside the supported range |

The gate's refusals are not errors of the companion: they are core's
`OperationRejected` outcome with one of the eleven refusal reasons, written by core
to the `rejected` record ([BEH-BR-220](../core/behaviors/25-operation-gate.md)).

## Worked example

A host whose regulated plugins need a signed ticket for every change, whose
trail goes to a caller's database, and whose high-water marks go to a
separately administered store. The store adapters (`pgTrailStore`,
`objectLockAnchorStore`), the signature port (`ssoSignatureCapture`) and the
key provider (`kmsKeyProvider`) are the caller's code; the companion ships
none of them.

```ts
// illustrative — not type-checked
import { Bridger } from "@bridger/core"
import { ApprovalGateLink, GxpLayer, issueTicket, proposeFingerprints, recordHighWater,
         type ApprovalPolicy, type FingerprintEligibility } from "@bridger/gxp"

const review = { code: "review", text: "Reviewed for correctness" }
const approve = { code: "approve", text: "Approved for use in production" }
const policy: ApprovalPolicy = {          // plain data; checked when GxpLayer.make builds the gate
  v: 1, name: "Site A host policy", version: "1.0",
  rules: [
    { id: "gmp-change", operations: ["replace", "reconfigure"], target: { realm: "gmp" }, decision: "ticket",
      requirements: { signatures: 2, meanings: [review, approve], bindReason: true,
                      requireDigest: true, requireFingerprints: true, validity: "1 day" } },
    { id: "audit-ack", operations: ["acknowledgeAuditDegraded"], decision: "ticket",
      requirements: { signatures: 1, meanings: [approve], bindReason: true,
                      requireDigest: false, requireFingerprints: false, validity: "4 hours" } }
  ],
  defaults: { signatures: 1, meanings: [approve], bindReason: true,       // no rule matches: a ticket is still required
              requireDigest: false, requireFingerprints: false, validity: "1 day" }
}

const eligibility: FingerprintEligibility = {   // allow-list; a path not listed is never fingerprinted
  v: 1,
  entries: [{ pluginId: "dosing", realm: "gmp", path: "limits.*", form: "decoded", entropy: "public",
              note: "Dose limits are not secret; bound so that approvals cover the values" }]
}

const gxp = GxpLayer.make({
  scope: "site-a",
  trail: {
    store: pgTrailStore(db),
    sealing: {                                            // @bridger/audit-chain, from @bridger/gxp/sealing
      chain: { anchorEvery: { records: 1000, interval: "5 minutes" } },
      anchoring: { anchor: rfc3161Anchor(tsa), receipts: pgReceiptStore(db2) },
      gate: { maxUnanchoredAge: "4 hours", allow: ["remove", "disable"] }
    },
    gate: { refuseOn: { unsupportedSchema: true, nonCanonical: true, collisions: true, readbackMismatches: true },
            allow: ["remove", "disable"] }
  },
  anchors: { store: objectLockAnchorStore(bucket), schedule: { every: "1 minute" } },
  approvals: { policy, tickets: pgTicketStore(db), signatures: ssoSignatureCapture(sso) },
  fingerprints: { keys: kmsKeyProvider(kms), eligibility }
})

// 0. Right after the host is built: attach the gate (reads Host.controls once: hostId, deadline).
yield* (yield* ApprovalGateLink).attach(host)

// 1. Before the change: the requester issues a ticket; the port captures the signatures.
//    proposeFingerprints gives exactly the fingerprints the call will carry, so the ticket can bind them.
const fingerprints = yield* proposeFingerprints(
  { definition: dosing, target: { id: "dosing", realm: "gmp" }, form: "decoded",
    value: { limits: { maxMg: 40 } }, paths: ["limits.maxMg"] },
  { keys, eligibility, scope: "site-a" })
const ticket = yield* issueTicket(
  { scope: "site-a", notAfter: "2026-10-04T12:00:00.000Z",
    requests: [{ operation: "reconfigure", target: { id: "dosing", realm: "gmp" }, actor: alice, reason: "CR-1182",
                 definition: { version: dosing.version, digest: dosing.digest },
                 configChange: { paths: ["limits.maxMg"], fingerprints } }] },
  { policy, tickets, signatures })   // two signers other than alice: "review", then "approve"

// 2. The call cites the ticket by correlationId; the gate checks and consumes the binding.
yield* host.reconfigure({ id: "dosing", realm: "gmp" }, { limits: { maxMg: 40 } },
  { actor: alice, reason: "CR-1182", correlationId: ticket.id })

// 3. Alongside the host: high-water marks; later, checks on read and the cross-store approval check.
yield* recordHighWater(host, anchors, { every: "1 minute" })
```

What the example shows and does not show: the gate allowed the call because a
ticket with a matching binding digest, two distinct signers other than the
requester, and an open validity window existed; the trail store answered
"stored" for each record. It does not show that the database keeps what it
stored, that the anchor bucket is administered by someone else, or that the
single-sign-on port re-authenticated the signers — those are the caller's
obligations, listed in the [compliance matrix](./gxp/02-compliance-matrix.md).
