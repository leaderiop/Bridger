# Improvement report 06: Security, access control, sandboxing, GxP/audit and trust

Lens: Cordis / DeepSeek Harness (capability-style proxy access, interception metadata, UNDECLARED/INACTIVE_ACCESS, "language-level checks are not a sandbox", output-commit problem).

**State (2026-11-22):** the original review is kept as written below. All 11 findings were checked against the specification and the prototype; 10 were partly wrong in their premise or already specified, and all are resolved (see Resolution status). Not built: a production worker adapter, a production evaluator and a kill-switch loop; those are reference kernels.

## Resolution status (2026-11-22)

Corrected citations: BEH-BR-32 is BEH-BR-313..326, BEH-RM-06x is BEH-RM-041..044, BEH-LD-002 is BEH-LD-011, and the BEH-RM-070s are taken (new: BEH-RM-073).

| Finding | Rec. | Verdict | As built |
|---|---|---|---|
| S1 | R1 | Partly wrong, resolved | The leak was the install caller's environment, not host ports (those are closure values). `closed.ts` `closedContext` replaces the build, finalizer, background, listener and hook contexts; an undeclared service fails the activation as `UndeclaredAccess` (BEH-BR-036, ADR-BR-002 amendment, INV-BR-014, check 115). `test/sec-closed-context.test.ts`. |
| S2 | R1 | Partly wrong, resolved | `Runtime.optional` already hands out no service (BEH-BR-130). The real escape was a service kept past its activation: `leaseBound` throws `InactiveAccess` once the provider's activation has ended (check 116). |
| S3 | R2 | Partly wrong, resolved | `consentDiff` was already specified (BEH-BR-243, BEH-BR-318). Now wired into plan entries; manifest `emits`, `mounts`, `hostOps`; `declaredOnly` decides emit and child; BEH-GX-092 binds the diff through the request digest. `test/sec-declared-access.test.ts`. |
| S4 | R3 | Partly wrong, resolved | The guest trust class already exists (BEH-LD-066..068), so no `partner` value. BEH-RM-073 and ADR-RM-011: a six-case negative isolation suite, manifest first, `unsupported` fails; BEH-RM-052 obligation 7. `src/isolation-conformance.ts` with a real `worker_threads` adapter (`worker-adapter.ts`) that fails egress and filesystem and withholds the rest (`test/sec-isolation.test.ts`). The adapter is a prototype for first-party code and testing. |
| S5 | R5 | Partly wrong, resolved | `residentRevoked` is the loader's, not `Host.controls`; BEH-GX-091 stays at eleven reasons. BEH-LD-031 adds `restartRequired` and the opt-in `restartGate` (refusal `restart: resident-revoked`); federation kill frames feed the same revocation source. `test/sec-restart-required.test.ts`. |
| S6 | R4 | Partly wrong, resolved | Plan entries carry `reversibility` (BEH-BR-327, BEH-BR-328): core sets only `irreversible` from a resource acquired with `irreversible: true` (BEH-BR-119); an atomic apply defers irreversible removals past changes unless a dependency forces order (BEH-BR-156). The binding carries it only when present (BEH-GX-066 vectors unchanged). Shred and remote outcomes stay owner-declared. `test/sec-reversibility.test.ts`. |
| S7 | R4 | Partly wrong, resolved | `ChainGate` already did anchor freshness (BEH-AC-013); the option `anchorBeforeIrreversible` refuses `anchor-behind` at the gate and never waits on the write path (INV-AC-005). `test/sec-chain-gate.test.ts`. |
| S8 | R6 | Confirmed, resolved | BEH-BR-282: core's own delivery layer sets `bridger:via` while a provider's method runs, independent of `CallLog`; the principal is unchanged (BEH-BR-258); check 117. `test/sec-via.test.ts`. |
| S9 | R7 | Partly wrong, resolved | Closure was already BEH-LD-011 (`EvaluationFailed` "unresolved-import"), not BEH-LD-002. Added root-escape, protocol-specifier and `allowBuiltins` rules; `resolveSpecifier` and `checkExternals`. `test/sec-digest-closure.test.ts`. No production evaluator exists. |
| S10 | - | Partly wrong, resolved | The 900 s is awthaq's JWT (SPK-09-12), now documented in RSK-RM-009, the entitlement traceability and ERP-IDENTITY. The per-call cap `tokenTtl` existed; the checker now enforces it against custom authorities. `test/sec-token-cap.test.ts`. |
| S11 | - | Partly wrong, resolved | `CapabilityPolicy.resolve` (not `AccessPolicy`) already receives the provider's identity; documented as the allow-list hook in BEH-BR-273. `test/sec-provider-allowlist.test.ts`. |

## Follow-up review (2026-11-22)

A second read of files the first pass skipped (federation 03, 04 and 06, keyring, entitlement, GXP-COMPANION, spikes 06 and 08, `actor.ts`, `config.ts`, `gxp.ts`) found seven more issues. Three are open and are not resolved by this work.

| ID | Status | Finding |
|---|---|---|
| S12 | Resolved | Peer identity in an offer was a claim and a fence token from an offer became the stored highest, so an unauthenticated offer could lock out the real owner. BEH-FD-023/029 now require `LinkConnection.authenticatedPeer`, refuse a mismatching host (`PeerMismatch`), and honour a token only from an authenticated peer within `maxFenceJump`; anything else is advisory. `FenceTable.offer` implements it (`test/federation.test.ts`). |
| S13 | Resolved | `shred` and received shred notices bypassed `OperationGate.authorize` and the audit. BEH-KR-017/020 now require a `shredGate`; `src/shred.ts` (`authorizeShred`, `receiveNotice`, `gatedShred`, `ShredRefused`) gates both with `reversibility: irreversible`, the notice actor `keyring-notice:<origin>`, once per shredId (`test/sec-shred-gate.test.ts`). |
| S14 | Resolved | Plugin error text copied into `error.message`. BEH-BR-197 now specifies `Host.Options.auditMessage`, applied to the message and each cause message before the sink; without it the text is recorded and RSK-BR-008 keeps the residual (`test/sec-audit-message.test.ts`). |
| S15 | Resolved | BEH-BR-185 requires lone-surrogate replacement in every string at any depth; the prototype did it for four fields. `sanitizeDeep` now covers the whole record (`test/sec-sanitize-deep.test.ts`). The writer's retry of an unencodable record now has a path: `AuditWriteFailed.permanent` writes a stub with the same recordId and auditSeq (BEH-BR-202, `test/sec-audit-permanent.test.ts`). |
| S16 | Resolved | `Budget` took labels and the essential flag from the call site and left an unmatched key unlimited. BEH-EN-017/018/016 now require `onUnmatched` (no default), `Budget.forPlugin` host-derived labels that a plugin cannot shed, and an essential list that only the application defines. `src/budget.ts` is the reference kernel (`test/sec-budget.test.ts`); periods and the `BudgetLedger` are not built. |
| S17 | Resolved | A federation kill under `revocationActor` could be refused by a remove-only gate and a refused kill had no age bound. BEH-FD-042 requires the gate to allow `disable` and `remove` from that actor and `kill-overdue` past `killPendingMaxAge`; `fedplugin.ts` now reports `kill-overdue` with its age and clears it when the gate allows (`test/federation-durable.test.ts`). |
| S18 | Resolved (documentation) | ERP-ACCESS stated qadi properties that the spike 08 results show are not there (the `:` check is types-only, the decision sink is fail-open and embeds the resource, a built subject is a snapshot). They are now stated as requirements on `@bridger/qadi` in §7 and §10. |
| S19 | Resolved | Decode accepted plaintext at a selected path, and a `Shredded` marker or `Encrypted.subject` was trusted as written. BEH-KR-010/012 now require an exact marker form, `PayloadDecodeFailed` for plaintext or a subject mismatch, and a recording host to check the same. `src/keyring.ts` (`decode`, marker check) and `test/sec-keyring.test.ts` implement it. |
| S20 | Resolved | The authenticated data omitted the stream, so a ciphertext copied into another event of the same subject decrypted. BEH-KR-011 adds the stream id. Implemented in `src/keyring.ts` (`test/sec-keyring.test.ts`). |
| S21 | Resolved | Encode's fail-closed set missed a throwing `subject`, `SubjectInvalid`, an uncanonicalisable value and wildcard paths, and `SubjectFromEncryptedField` could not be enforced. BEH-KR-012/013 now fail closed on all of them and define a runtime probe. Implemented in `src/keyring.ts`, including the runtime probe (`test/sec-keyring.test.ts`). |
| S22 | Resolved | Nothing bounded GCM nonce use per key and key material shared the `NonceSource`. BEH-KR-005/006 add `maxUsesPerKey`, a separate key source and a refusal of a fixed `NonceSource` outside a test host. Implemented in `src/keyring.ts`: auto-rotation at `maxUsesPerKey`, a separate key source, a fixed nonce source refused outside a test host (`test/sec-keyring.test.ts`). |
| S23 | Resolved | `rotate` and `rewrap` were unbounded and unattributed. They now carry an actor and reason into a key-event record, with `maxKeyVersions` and `KeyVersionLimit`. Implemented in `src/keyring.ts`: attributed key events and `KeyVersionLimit` (`test/sec-keyring.test.ts`). |
| S24 | Resolved | A child plugin's mount bypassed the entitlement gate (core 25 never submits it). BEH-EN-009 now has `Entitlement.layer` provide core's mount-time policy, with `childSubject`. `Options.mountPolicy` in `host.ts` and `src/entitlement-mount.ts` (`childMountPolicy`) implement it; a throwing entitlement fails closed (`test/sec-mount-entitlement.test.ts`). |
| S25 | Resolved | Budget periods re-anchored at each restart and the ledger could not see the period. BEH-EN-021/022 require `anchor`, a `period` index, and replay of unreconciled local reservations. `src/budget.ts` implements `anchor`, periods, the ledger `period` index, `onLedgerUnavailable` and replay by id (`test/sec-budget.test.ts`). |
| S26 | Resolved (documentation) | GXP-COMPANION scenario A reused the ticket id as the correlation id and showed no single-use or approver separation. A callout now says the specification governs. |
| S27 | Resolved | `signEvidencePack` took the requester from the caller and assessments and signatures were unchained appends. BEH-GX-129/133/135 now record the requester in the manifest, read it there, and chain every appended entry by `prev`; `verifyEvidencePack` reports a broken chain. Implemented in `src/evidencepack.ts` (`test/evidencepack.test.ts`). |
| S28 | Resolved | Hook phases shared one mutable input. BEH-BR-306 now requires a deep-frozen input handed unchanged to every phase; `hooks.ts` freezes it (`test/sec-hook-input.test.ts`). |
| S29 | Resolved (specified) | A contribution with no owner was said to bypass entitlement and budget. It is application code (BEH-BR-298 takes the owner from the principal, never an argument), so BEH-EN-023 now states it is unmetered unless `ownerlessKey` is given. No code: the entitlement policy is not built. |
| S30 | Resolved | `CheckReport` named no policy, so a report made under a laxer caller-supplied policy looked like one under the recorded policy. BEH-GX-033 adds `policyDigest` and a `policyNotRecorded` finding. `src/trailcheck.ts` is a minimal kernel (sequence kinds only, other kinds listed as not checked) with `test/sec-trailcheck.test.ts`. |
| S31 | Not a gap | Examined and dropped: reversibility is computed by core, not declared by a plugin (BEH-BR-327); an exempt rule that lists every operation is already refused (BEH-GX-059); a bundle ticket answers to one policy rule and one requester (gxp 09 settled note); the `expect` check runs at the start of the apply under the host lock (BEH-BR-318). |
| S32 | Resolved | IQ-11 recognised a fixture only by its self-declared `fixture: true`. BEH-GX-118 now also fails a testing name prefix, an in-memory commit or a "test fixture" custodian, and `faultyTrailStore` OR-s the flag in. `iq11` in `src/gxp-testing.ts` (`test/sec-gxp-testing.test.ts`). |
| S33 | Resolved | Check 41 covered few of the BEH-GX-145..152 requirements and check 31 omitted the sealing key and newer outputs. Both are extended in gxp 20; the prototype's `test/sec-gxp-testing.test.ts` runs the import-graph, signature-shape, one-warning-line and canary cases against `src/gxp-testing.ts`. |
| S34 | Resolved | `scriptedSignatureCapture` had no runtime guard on `decide`. A non-function now fails with a defect (BEH-GX-148; `src/gxp-testing.ts`, tested). |
| S35 | Resolved | Core's `scriptedGate` and `memoryAuditSink` carry no marker, so an approve-everything gate passed IQ. IQ-U3 is now an executed probe of a ticketless request; `gatePosture` implements it (tested). |
| S36 | Resolved | See S33: the canary and import-graph additions to checks 31 and 41, exercised in `test/sec-gxp-testing.test.ts`. |
| S37 | Resolved | `testKeyProvider` put its seed into every key id. The id now carries a digest of the seed and the seed is documented as not a secret (`testKeyProvider`, tested). |
| S38 | Resolved | Shred does not reach aggregate snapshots, which hold plaintext (event-store 03:152-184). Fix: encode snapshot `state` through the `PayloadCodec`, or delete snapshots on `onShred`, and bind a snapshot to its event's id and hash. |
| S39 | Resolved | `retireDestination`, `acceptGap`, `resetVersions` are attributed but not gated (durable-bus 02:231, 03:211, 04:274). Fix: route them through `OperationGate.authorize` as irreversible, with a loss record. |
| S40 | Resolved | A fact id chosen by a peer drops a different fact (event-store 02:246). Fix: store a `factDigest`; on a different digest append a `FactConflict`. |
| S41 | Resolved | No per-stream authorization on event-store append and read, and `DurableBus.read` skips the access policy. Fix: `AccessPolicy.ask` on both, reserve the `rx:` prefix. |
| S42 | Resolved | No size bound on a received envelope; a peer can halt a stream (durable-bus 03:40). Fix: `maxEnvelopeBytes` and stream-length limits with an `EnvelopeRefused` stop. |
| S43 | Resolved | The v2 chain link hash does not cover `origin` or `break` (audit-chain 04:205). Fix: include them in the hash input (changes the vectors). |
| S44 | Resolved | A generic-series `recordId` with a line feed could move bytes between it and the payload. BEH-AC (04) now forbids control characters; `genericTail` refuses them (`test/sec-chain-recordid.test.ts`). |
| S45 | Resolved | Untrusted error text, approved-resume outcomes and long-command results reach the model outside the envelope and taint (agent 01/02/03, mcp 03/01). Fix: envelope and taint every `Failed` outcome, recompute on resume. |
| S46 | Resolved | Callbacks per parent call were unbounded. BEH-RM-044 now requires `maxCallbacks` and `CallbackLimit`; `admitCallback` enforces it (`test/sec-remote-bounds.test.ts`). |
| S47 | Resolved | Package paths could contain NUL or LF, making `filesDigest` ambiguous. Loader 01 now forbids control characters and `checkPaths` rejects them (`test/sec-remote-bounds.test.ts`). |
| S48 | Resolved | The taint floor accepts a caller-presented `ApprovalRef` (command 02:850). Fix: the gate returns a typed approval witness. |
| S49 | Resolved | `reconcile-apply` approves an opaque, guessable `planId` (mcp 04:217-281). Fix: bind a `planDigest` into the input digest. |
| S50 | Resolved | Plugin error text is served unredacted through host tools (mcp 04, core 04:330). Fix: apply `auditMessage` to snapshot messages. |
| S51 | Resolved | The sequence authority records foreign-origin events (sequence 02:221-303). Fix: refuse and quarantine an origin mismatch. |
| S52 | Resolved | Agent tasks, replay transcripts and series events keep personal data without bounds (agent 02, 05; sequence 01). Fix: retention and redaction options. |
| S53 | Resolved | A remote peer is unauthenticated and the served actor is spoofable (remote 02:35, 05:279). Fix: a digest-bound handshake. |
| S54 | Resolved | Token refs may be guessable and the callback parent is guest-chosen (remote 06:111-165). Fix: 128-bit CSPRNG refs bound to session, epoch, call and guest. |
| S55 | Resolved | `reverify.acceptedAt` and rollback state come from an unauthenticated store; guest-link grants are not bound to `requested` (loader 07/08/09). Fix: MAC the accepted record; require grants to be a subset of `requested`. |
| S56 | Resolved | The budget checked, then suspended on the ledger, then debited, so concurrent reservations could both pass, and ledger ids restarted at 1. `reserve` now debits in the same step as the check, gives it back on refusal, and ledger ids carry `instanceId` (BEH-EN-018; `test/sec-budget.test.ts`). |
| S57 | Resolved | `rotate` could give a shredded subject a new key, and shred accepted a blank or reserved actor. Both are refused (BEH-KR-005, 017; `test/sec-keyring.test.ts`, `test/sec-shred-gate.test.ts`). |
| S58 | Resolved | A shred notice was marked seen before it was applied, so a failed apply lost it. It is marked after (BEH-KR-020; `test/sec-shred-gate.test.ts`). |
| S59 | Resolved | Any authenticated peer could raise the fence and lock out the real owner. An offer now raises the fence only for the current owner (BEH-FD-029; `test/federation.test.ts`). |
| S60 | Resolved | `linkMetaOk` was never called and a stripped `break` marker was not noticed. `verifyBundle` takes `expectedBreaks` and reports a stripped marker (`test/audit-chain.test.ts`). |
| S61 | Resolved | On the Sigstore inclusion-proof path `integratedTime` is unsigned and attacker-chosen. It is accepted only when the pin states `allowUnsignedTime` (BEH-LD-018; `test/release.test.ts`). |
| S62 | Resolved | The `rx:` stream name was ambiguous at ":". Origin and stream are percent-encoded and the hash form cannot collide (`test/sec-hardening.test.ts`). |
| S63 | Resolved | The real session path lacked `maxCallbacks`, used a counter for token refs and dropped revocations. `CallbackContext` and the session options carry `maxCallbacks` and `rev`, and the default authority mints 128-bit refs (`src/session.ts`, `src/callback.ts`; the limit itself is tested at `admitCallback` in `test/sec-remote-bounds.test.ts`). |
| S64 | Resolved | `acceptGap` and `resetVersions` share one gated path with `retireDestination` and record only after apply; `maxStreamTotal` bounds a stream's total bytes; the `ChainGate` allow-list no longer skips `anchor-behind`; the accepted-record MAC covers policy digest and revocation epoch; `CallbackLimit` is tested through `openSession` (`test/sec-hardening.test.ts`, `test/sec-chain-gate.test.ts`, `test/callback-wire.test.ts`). |
| S65 | Resolved in part | Signer `validFrom`/`validUntil` are enforced against `signedAt` or `now` (BEH-LD-019); a first fence offer is bounded from zero; `maxCallbacks` defaults to 64; the served remote actor comes from a digest-to-plugin record; evidence attachment names are one plain unique segment (`test/release.test.ts`, `test/federation.test.ts`, `test/sec-hardening.test.ts`, `test/sec-packages.test.ts`). Open from that review: pack head pinning (BEH-GX-135 tail truncation), kill-switch `release` matching by realm and digest, the audit sink that would produce `expectedBreaks`, and an ungated raw `keyring.shred`. |
| S66 | Resolved in part | Evidence-pack heads can be pinned (`packHeads`, `verifyEvidencePack(dir, digest, heads)`) so a removed last signature or an edited last entry is a `chain` difference (BEH-GX-135); kill-switch `release` matches id, realm and digest; the keyring's `shred` takes the gate and the request and checks the subject digest, so no ungated path exists (`test/evidencepack.test.ts`, `test/sec-kill-switch.test.ts`, `test/sec-keyring.test.ts`). The minimal sink `src/chain-sink.ts` marks `retry-mismatch` and `chain-order` and returns the `expectedBreaks` the verifier takes (`test/sec-chain-sink.test.ts`); its markers are keyed by seq, so a duplicate-seq retry-mismatch makes the verifier also flag the original at that seq if the caller passes `expectedBreaks`. |

S38, S39, S40, S41, S42, S43, S45, S48, S49, S50, S51, S52, S53, S54 and S55 are enforced by reference kernels in `src/hardening.ts` (the event-store rules S38, S40 and S41 also run end to end in the minimal store `src/eventstore.ts`, `test/sec-eventstore.test.ts`; S39 and S42 in the minimal bus `src/durablebus.ts`, `test/sec-durablebus.test.ts`; S51 and the series-event reason rule of S52 in the minimal authority `src/sequence.ts`, `test/sec-sequence.test.ts`; S45 and S48 in the minimal dispatcher `src/command.ts`, `test/sec-command.test.ts`; S45 resume and S52 retention in `src/agent.ts`, S49 and S50 in `src/mcp-host-tools.ts`, S46, S53 and S54 in `src/remote-link.ts`, S55 in `src/loader-admission.ts`, all in `test/sec-packages.test.ts`) with `test/sec-hardening.test.ts`; the spec requirement for each is in the package file the row names. The event-store, durable-bus, command, agent, mcp, sequence, remote and loader packages themselves are not in the prototype, so the kernels are the checked form of each rule, not the packages.

## Executive summary

1. Bridger is already stricter than Cordis on trust: signed statements, no default policy, a separate "first-party" statement for in-process code (BEH-LD-065), and explicit "attribution, not isolation" non-claims.
2. The weak point is the gap between declared and reachable authority. Declarations are enforced at compile time (Layer `RIn`) and only for listen/contribute at run time (BEH-BR-268). There is no runtime UNDECLARED/INACTIVE_ACCESS analogue and no spec statement that a plugin build sees a closed context.
3. Partner (neither first-party nor fully hostile) plugins have no supported tier: in-process is first-party only, remote "provides no isolation" (ADR-RM-006), so isolation evidence is entirely the integrator's.
4. Irreversibility is not modelled. Atomic apply undo (ADR-BR-051), keyring shred (ADR-KR-001), revoked code staying resident (BEH-LD-031) and remote unknown outcomes (ADR-RM-008) are each handled alone; the gate and approval plan have no "irreversible" class and no output-commit ordering.
5. Audit integrity is well specified (anchors, expected heads, INV-AC-001..007). Remaining items: tying anchor freshness to irreversible operations, and attributing provider-originated mutations.

## Where Bridger is already ahead of Cordis

- **Trust is a first-class, signed pipeline.** Digest commits to manifest, SBOM and files (BEH-LD-001); N-of-M signer policy with roles and validity windows (BEH-LD-020); no default policy (BEH-LD-022); trust roots from the application, never the package (BEH-LD-023); signatures re-checked on every load (BEH-LD-024). Cordis has no signing concept.
- **Revocation and kill switch** (BEH-LD-025..032): stale revocation set refuses loads (BEH-LD-027), blast-radius guard `maxDroppedPerRun`, and what the switch cannot reach is reported (`status.outsideScope`, `status.residentRevoked`).
- **Principal minted only by the host** (BEH-BR-257, INV-BR-035; prototype `policy.ts` `minted` WeakSet, `PrincipalForged`/`PrincipalRetired`). Cordis has fiber uid but no forgery-proof principal on records.
- **Mandatory interceptions that plugins cannot remove** (BEH-BR-260/262) are stronger than Cordis `intercept`, which is merged metadata a parent may override.
- **Honest non-claims** (core/overview.md Core exclusions; RSK-BR-028; INV on realms). Cordis itself says real sandboxing needs an external boundary; Bridger says this in the normative text.
- **Gate with single-use, bound, separated-duty approvals** (BEH-GX-089..093, ADR-GX-010/013/015) and undo actions that are ordinary, gated, linked changes (`undoes`, BEH-BR-325).
- **Audit chain** with anchor-or-say-so (`layerUnanchored` explicit, ADR-AC-002), keyed hasher, generic series, bundle verification; spikes 06/09 confirmed that tail truncation and rewritable audit tables are real (SPK-06-07, SPK-09-20), and the spec answers them.

## Findings

| ID | Sev | Evidence | Issue | Proposed change |
|----|-----|----------|-------|-----------------|
| S1 | H | ADR-BR-002 ("a requirement reached only inside a returned method is invisible"); the build pipeline of host.ts (`closedContext`; it was `provideContext`) (`Context.empty()` plus `Effect.provideContext`); RSK-BR-001 residual | Closed build context is not specified or tested. `provideContext` adds to the inherited fiber context; host services and `Reference` defaults may be reachable by `Effect.service` or a cast. No UNDECLARED_ACCESS equivalent. | New behaviour: build, finalizers and background fibers run with a replaced context; acceptance check that an undeclared host service lookup fails with a typed defect. |
| S2 | M | BEH-BR-130 `Runtime.optional`; RSK-BR-001 residual "reference captured and kept" | A captured service used after its lease ends is accepted as "contradicts contract" with no runtime signal (no INACTIVE_ACCESS). | Lease-bound wrapper that throws `InactiveAccess` after release, built on the BEH-BR-260 interception machinery. |
| S3 | M | BEH-BR-268 settled (3): emits and child mounts not compared | Load-time review covers listens and contributions only. Emits, child mounts, host mutations and external egress are undeclared. | Extend manifest and `DeclaredAccess` with `emits`, `mounts`; add a consent-diff on upgrade. |
| S4 | H | INV-LD-009; ADR-RM-006; RSK-BR-028 | Partner/third-party plugins have no Bridger-defined tier: not in-process, remote isolation is "the host's". No shipped negative conformance for an adapter. | Isolation conformance suite per adapter (egress, fs, env, timing) recorded as evidence, never an enum. |
| S5 | M | BEH-LD-031 `residentRevoked` | A revoked, evaluated module keeps running code until restart. Kill switch removes the plugin but not its scheduled outside work. | Gate-visible `restartRequired` state: GMP-class operations refused (or flagged) until recycle, configurable. |
| S6 | H | Core exclusions ("does not compensate external effects"); ADR-BR-051; ADR-BR-004; ADR-RM-008; ADR-KR-001; BEH-GX-093 | No operation-level reversibility class. Atomic apply undoes in reverse order but cannot know which action is irreversible (shred, external send, ticket consumption). | Reversibility annotation on plan entries; apply orders irreversible last or refuses to roll back past it (output-commit rule). |
| S7 | M | INV-AC-005 (anchoring never delays a write); SPK-06-07; FINDINGS #9 | Records after the last anchor rest on the chain alone, and nothing couples anchor freshness to a high-risk operation. | Gate option "anchored head at least n" before an irreversible op (the gate, not the write path, waits). |
| S8 | M | BEH-BR-258/259; RSK-BR-028 | A provider mutating the host while serving consumer A is recorded `onBehalfOf` A with no trace of the provider's code. Attribution of module origin is lost. | Built-in mandatory interception adds a `via` annotation (provider principal) on every intercepted call result path. |
| S9 | M | BEH-LD-001/ADR-LD-002 | SBOM is opaque to the loader (BEH-LD-001 non-claims). Transitive imports at evaluation time are not tied to the digest. | Require file-set closure: loader evaluates only files in the digest, no dynamic import outside it. |
| S10 | L | SPK-09-12; BEH-BR-281 | Offline/stateless tokens stay valid until expiry (900 s); entitlement lapse narrows live captures but token lifetime is awthaq's. | Document the bound in the entitlement and remote risk tables; per-call token (BEH-RM-041..044) TTL max. |
| S11 | L | Cordis paper: version drift, key collision | Nominal key identity (ADR-BR-011) allows a lookalike provider to satisfy a `requires`. | Already mitigated by contract versions (BEH-BR-229); add provider-principal allow-list in AccessPolicy docs. |

## Recommendations

### R1 (S1, S2). A closed plugin context and typed access errors

**Rationale.** Cordis's value is that `ctx[key]` is proxy-mediated: undeclared throws UNDECLARED_ACCESS, declared but unavailable throws INACTIVE_ACCESS, and the capability set is knowable before running. Bridger gets the first half from the `Layer` type and from the resolver supplying only declared services (the build pipeline of host.ts builds `ctx` from `requires` alone), which is good. But the spec never states that the build fiber's context is exactly that set. `Effect.provideContext(ctx)` merges onto the caller's context; if the host's fiber carries `AuditSink`, `OperationGate` or similar, plugin code can read them at run time (type erasure, `as any`). `Reference` services (`CurrentActor`, `PrincipalReference`, `ActivePlugin`) are always readable by design. RSK-BR-028 says "trusted code"; but a partner plugin or an agent-generated plugin is exactly where capability discipline pays.

**Concrete spec change.** (a) New BEH in core 05 Activation: "The build, finalizers, background fibers, listeners and hooks of a plugin MUST run in a context whose services are exactly: its declared and optional requirements (after interceptions), `Plugin.Runtime`, `Plugin.Config`, and Effect's own References. Host-internal ports (`AuditSink`, `OperationGate`, `AccessPolicy`, `CallLog`, `RefusalList`) MUST NOT be present." (b) Define `UndeclaredAccess` and `InactiveAccess` defects with the plugin id and key; `Runtime.optional` captures and lease-released services are wrapped to throw `InactiveAccess`. (c) Add acceptance checks: undeclared lookup in build fails; a captured optional used after drain fails typed. (d) Record the reachable References list in `Host.controls` (BEH-BR-265).

**Cost/risk.** Low to medium. Wrapping by interception costs a proxy per delivered service; Effect-internal services (Scope, Clock) must stay. Risk: a plugin legitimately using a host service through a cast breaks (desired).

**Verification.** Prototype test under `TestHost`: plugin whose build calls `Effect.service(AuditSink)` must die with `UndeclaredAccess`; property test on lease release.

### R2 (S3). Make the load-time review complete

**Rationale.** A manifest read by a consent screen or agent (BEH-BR-241) is only as true as what is enforced. `declaredOnly` leaves emits and child mounts out because the manifest declares none (BEH-BR-268 settled 3).

**Concrete spec change.** Add manifest fields `emits`, `mounts`, `hostOps` (which host operations it may call via `Plugin.Runtime.install/unmount`). Extend `DeclaredAccess` and `declaredOnly` to deny "undeclared emit/mount" with exact-string comparison. Add a manifest diff (old vs new on replace) as input to the approval plan so an upgrade that widens declarations needs a fresh ticket (BEH-GX-092 binding). Keep `withoutManifest` without default.

**Cost/risk.** Manifest churn; existing eager plugins without manifests unaffected under "allow". Cordis does this only informally.

**Verification.** Acceptance checks mirroring check 102; golden manifest-diff fixtures.

### R3 (S4). A partner-plugin tier built from evidence, not an enum

**Rationale.** ADR-RM-006 correctly rejects an isolation-level enum; yet GxP integrators then have nothing to cite for partner code. The Cordis paper's conclusion (external sandbox needed) is accepted by Bridger but not operationalised.

**Concrete spec change.** In remote BEH-RM-073: a normative negative conformance suite each adapter publishes (egress denied, fs/env unreadable, CPU/memory cap, no shared module cache), result recorded in the GxP OQ evidence pack (BEH-GX-127 already records package self). Add a loader trust-class value `partner` meaning "remote link only; first-party statement refused" so `Loader.lazy` cannot admit it by accident (BEH-LD-067 already refuses non-first-party; make the class explicit in the catalog).

**Cost/risk.** Medium: suite content per adapter. Avoids false claims.

**Verification.** Run the suite against the `worker_threads` adapter and expect specific known leaks documented as failures (shows the suite has teeth).

### R4 (S6, S7). Reversibility class and output-commit ordering

**Rationale.** The paper's own stated limit: effects crossing the system boundary need withholding or compensation. Bridger says "does not compensate external effects" and handles each case separately, but a GxP approver reading an atomic-apply plan cannot see which entries cannot be undone.

**Concrete spec change.** (a) Add an annotation `Reversibility = reversible | compensable | irreversible` on plan entries (BEH-BR-313..326 generic plan); defaults: install/replace/remove reversible by the undo of ADR-BR-051; keyring shred, remote calls with unknown outcome, ticket consumption and external-egress contributions declared irreversible by their owners. (b) Atomic apply MUST order irreversible entries after all reversible ones and MUST fail the plan, not the run, if an irreversible entry precedes a reversible one it depends on. (c) The approval binding (BEH-GX-092) covers the class so approvers see it. (d) With S7, the gate may require `anchoredHead >= headAtPlanTime` before executing an irreversible entry; this respects INV-AC-005 because the wait is at the gate, not the write.

**Cost/risk.** Medium; one new annotation, one ordering rule. Risk: plugin authors under-declare, so also require companions (keyring, remote) to set it.

**Verification.** Scenario: apply with shred plus failing replace rolls back everything except the (last) shred, which never ran; property test on ordering.

### R5 (S5). Revoked resident code must be visible to the gate

**Rationale.** BEH-LD-031 admits revoked modules stay in memory. For a high-risk revocation (compromised signer), "removed from host" is not "stopped".

**Concrete spec change.** When `status.residentRevoked` is non-empty and the policy is `strict`, `Host.controls` reports `restartRequired`, and the GxP gate refuses new GMP-class operations (reason from the eleven of BEH-GX-091, plus one) until a process incarnation begins. Federation kill frames (ADR-FD-009) trigger the same.

**Cost/risk.** Availability cost; make it opt-in per deployment.

**Verification.** Kill switch scenario in `TestHost` plus gate acceptance check.

### R6 (S8). Attribute provider-originated mutations

**Rationale.** BEH-BR-258 consciously records the caller, not the module. In an audit this makes a provider-originated change look consumer-originated; Cordis has the same blind spot but also no regulatory duty.

**Concrete spec change.** Ship a mandatory interception (core-built, like grant narrowing BEH-BR-275) that adds `via: providerPrincipal` as an annotation while a service method runs; record it in `onBehalfOf`'s neighbour field `via`. Costs one wrapper per service call, tolerable since interceptions already exist.

**Cost/risk.** Per-call overhead; shallow (does not reach captured sub-objects, same limitation as grants).

**Verification.** Record-shape tests; spike against awthaq adapter (spike 09 SPK-09-03).

### R7 (S9). Digest closure

**Rationale.** The digest commits to a file set (ADR-LD-002) but evaluation can still import outside it.

**Concrete spec change.** Add to BEH-LD-011: the evaluator MUST resolve imports only inside the digested file map; a bare or dynamic specifier outside it fails with `OutsideDigest`. Keep SBOM interpretation out of scope.

**Cost/risk.** Packaging constraint for bundling; matches Cordis HMR's import-graph analysis in spirit.

**Verification.** Fixture package with a dynamic import of `node:fs` and a sibling path.

## Not checked / uncertainties

- S1 was run, not inferred: `test/sec-closed-context.test.ts` shows the leak before the fix and its removal after.
- A ticket consumed by a rolled-back forward action is not re-issued: the undo is gated as its own request with `undo: true` and needs a binding of its own (gxp BEH-GX-093, core BEH-BR-325). `test/sec-undo-binding.test.ts` runs both cases with a single-use gate (without the undo's binding the apply ends `PartialApply`).
- The prototype now has a `worker_threads` adapter (`worker-adapter.ts`), CommonJS and ES module evaluators over verified bytes (`evaluator.ts`; the ES one needs `--experimental-vm-modules`, set in `vitest.config.ts`) and a kill-switch kernel with its change-and-retry loop (`kill-switch.ts`), each with tests. They are reference implementations: an evaluator timeout bounds synchronous code only, and the adapter is for first-party code and testing. Six probes are not the whole attack surface (BEH-RM-073).
- ERP-layer authorization (`docs/ERP-ACCESS.md`) was read in full: tenant and company scope is added by Records and cannot be widened by a policy, and permissions are data. The one gap, a lookalike `Records` or `Identity` provider, is closed by the provider allow-list (S11) and is now stated in ERP-ACCESS §5, with custom predicates named as plugin code. Spike 08 is the health spike and is not about authorization. Everything is Draft/Planned.
