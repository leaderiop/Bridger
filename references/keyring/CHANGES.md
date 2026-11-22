# Change history

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-KR-CHG                                               |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Change Record                                                |
> | Change History | 0.1 (2026-11-22): Older Change History lines moved out of the Document Control tables (improvement report 07, R6) |

---

A Document Control cell keeps its newest revisions; older lines are moved here, newest first, under the Document ID of
the document they belong to (`python3 references/core/scripts/split-history.py`). Nothing is rewritten: a line moves whole.

## BRIDGER-KR-00

`keyring/README.md`

- 0.6 (2026-11-10): CCR-KR-004 registered (round 2 findings of the specification audit of 2026-11-09: P10, P11, P12, key-store outage on decode); dependency row for core 28 names `AccessPolicy` for shred notices; follow-up: `KeyStore` members for `rewrap` (CCR-KR-004)
- 0.5 (2026-11-09): CCR-KR-003 registered (specification audit of 2026-11-09, M-01 keyring side; C-13 checked); dependency rows for core 22, 23 and 26 restated (CCR-KR-003)
- 0.4 (2026-11-08): CCR-KR-002 registered (round-2 agent review); key distribution stated as a limit in the honest-claims rule and open question 2 (CCR-KR-002)
- 0.3 (2026-11-08): CCR-KR-001 extended: `KR` infix registered by core, URS-BR-058 and 059 cited (CCR-KR-001)
- 0.2 (2026-11-08): `PayloadCodec` dependency cites durable-bus BEH-DB-008; open question 1 answered by the alignment of BEH-KR-009 and BEH-KR-012 (CCR-KR-001, revision bump)
- 0.1 (2026-11-08): Initial draft (CCR-KR-001)                

## BRIDGER-KR-INV

`keyring/invariants.md`

- 0.4 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-06) — INV-KR-002: keyring writes on the outbox database take the durable-bus fence (H4); `decrypt` and the codec refuse every subject from the `OriginChange` until the re-apply commits (K1); the store-swap crash window stated as a named residual (K2) (CCR-KR-008)
- 0.3 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-05) — INV-KR-002 holds across a whole-store re-bootstrap install through the store-swap participant (B6) (CCR-KR-007)
- 0.2 (2026-11-08): INV-KR-002 notes that storing an existing marker uses no key (CCR-KR-002)
- 0.1 (2026-11-08): Initial draft (CCR-KR-001)                

## BRIDGER-KR-RISK

`keyring/risks.md`

- 0.5 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-06) — RSK-KR-001: controls add the fence on keyring writes and the refusal until the store-swap re-apply commits (H4, K1); the residual names the store-swap crash window of INV-KR-002 (K2); scores unchanged (CCR-KR-008)
- 0.4 (2026-11-10): RSK-KR-001: a notice that meets a key-store outage halts the receiving subscription and is never parked (BEH-KR-020); RSK-KR-006: acknowledgements are covered by the `AccessPolicy` obligation and counted by the envelope's origin (BEH-KR-020) (CCR-KR-005)
- 0.3 (2026-11-10): RSK-KR-002 control restated as BEH-KR-012 specifies (a lost key fails the decode with `PayloadUnreadable`, an unreachable store with `PayloadDecodeFailed`) and re-scored, scores unchanged; RSK-KR-006 covers a received notice that no attributed shred made (P11, P12) (CCR-KR-004)
- 0.2 (2026-11-09): RSK-KR-006 added: a shred that leaves no attributable, reasoned record (M-01) (CCR-KR-003)
- 0.1 (2026-11-08): Initial draft (CCR-KR-001)                

## BRIDGER-KR-BEH-01

`keyring/behaviors/01-keys-and-subjects.md`

- 0.10 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-07) — BEH-KR-004: a `KeyStore` that offers `transaction` runs its `onEnd` functions as durable-bus BEH-DB-054 property 8 requires, given the outcome, stated as a requirement (PL9, K3); the keyring also gives `KeyStore` writes the store-swap `apply` transaction and, for step 1 of a `shred` on an outbox-sharing `KeyStore`, its caller's transaction (H3, H4) (CCR-KR-009)
- 0.9 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-06) — BEH-KR-004: `KeyStore.transaction` runs the `onEnd` effects of its `StoreTransaction` at commit or rollback, which ends fence admissions (H3); the keyring gives `tombstone`, `destroy`, `markStep` and `acknowledge` a transaction only from its own `KeyStore.transaction` or its own handlers, never a caller's (K3) (CCR-KR-008)
- 0.8 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-05) — BEH-KR-004: `tombstone`, `destroy`, `markStep` and `acknowledge` write in an ambient `KeyStore.transaction` when one is present, committed with it, so a handler on a database shared with the outbox never waits on a second writer (B5); `KeyStore.tombstones` lists every tombstone for the store-swap participant (B6); BEH-KR-008: the plugin registers that participant when `store.transaction` is given (B6); `KeyStore.transaction` keeps its signature and ends the fence admissions taken on it as the durable-bus adapter does (H2) (CCR-KR-007)
- 0.7 (2026-11-10): BEH-KR-004: `KeyStore` gains `acknowledge`, `acknowledgements` and `unacknowledged` for callback and host acknowledgements and each callback's cursor (K1); BEH-KR-008 declares `NonceSource`, `KeyringPorts`, `Keyring.plugin` and `KeyringConfigError` (PL2) (SPEC-AUDIT-04) (CCR-KR-006)
- 0.6 (2026-11-10): BEH-KR-004 declares `WrappedKey` and `SubjectKeys`; BEH-KR-005 declares the `KeyWrapper` port, whose failures are `KeyStoreUnavailable`; BEH-KR-006: `rewrap` handles only the versions listed at its start, returns a `RewrapReport` naming the versions it could not re-wrap, and a wrap failure of one version does not end the call (M24) (CCR-KR-005)
- 0.5 (2026-11-10): `rotate` and `rewrap`, required by BEH-KR-006, added to `KeyringShape` (BEH-KR-002) and to the members of the `Keyring` contract (BEH-KR-008) (P10); follow-up: BEH-KR-004 `KeyStore` gains `wrappedUnder` and the compare-and-set `replaceWrapped` (`WrappedKeyChanged`), which BEH-KR-006 `rewrap` uses (CCR-KR-004)
- 0.4 (2026-11-09): Specification audit of 2026-11-09 (M-01) — BEH-KR-004: `tombstone` stores the shred's attribution with it, and no field of a tombstone changes afterwards; `markStep` changes the step state only (M-01); BEH-KR-008: `Keyring` is declared with core `Contract.local` and never crosses a host (core CCR-BR-033) (CCR-KR-003)
- 0.3 (2026-11-08): BEH-KR-004 `KeyStore` gains `markStep`, `incompleteShreds`, optional `holders` and an optional outbox-sharing `transaction` for resumable shreds; Open (2) moved to a stated limit (CCR-KR-002)
- 0.2 (2026-11-08): BEH-KR-002 and 008 cite URS-BR-058 (registered by core CCR-BR-027) (CCR-KR-001)
- 0.1 (2026-11-08): Initial draft (CCR-KR-001)                

## BRIDGER-KR-BEH-02

`keyring/behaviors/02-field-encryption.md`

- 0.8 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-07) — BEH-KR-012: the refusal of every decode from a whole-store `OriginChange` until the store-swap re-apply commits, and the state the codec shared with the plugin, are removed: the re-apply now commits inside the install before the `OriginChange` (03, BEH-KR-020), so the codec reads the tombstones from the `KeyStore` (H4, K2) (CCR-KR-009)
- 0.7 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-06) — BEH-KR-012: the codec fails every decode of an `Encrypted` field with `PayloadDecodeFailed` naming `KeyStoreUnavailable` from a whole-store `OriginChange` until the keyring's store-swap re-apply has committed, a state shared with the plugin through the same `KeyringPorts` value (K1) (CCR-KR-008)
- 0.6 (2026-11-10): BEH-KR-009: `Keyring.fields` takes the `KeyringPorts` given to `Keyring.plugin` (PL2) (SPEC-AUDIT-04) (CCR-KR-006)
- 0.5 (2026-11-10): BEH-KR-012: a decode that meets `KeyStoreUnavailable` fails with `PayloadDecodeFailed`, never `PayloadUnreadable` or a marker, so that the reader keeps the envelope and retries (CCR-KR-004)
- 0.4 (2026-11-08): BEH-KR-009 `Field` is `Codec<A | Shredded, I | Shredded>` and upcasters pass markers through; BEH-KR-010 defines the `Shredded` form, decoded and stored; BEH-KR-012 stores an existing marker without a key, leaves park or halt to the reader, and states the key precondition as a limit (CCR-KR-002)
- 0.3 (2026-11-08): BEH-KR-009 and 012 cite URS-BR-058 and URS-BR-059 (registered by core CCR-BR-027) (CCR-KR-001)
- 0.2 (2026-11-08): BEH-KR-009 and BEH-KR-012 aligned with durable-bus BEH-DB-008 (`PayloadCodec` shape cited, codec id "bridger-keyring/v1", `PayloadEncodeFailed`, `PayloadDecodeFailed` and `PayloadUnreadable` mapping); Open (2) closed (CCR-KR-001, revision bump)
- 0.1 (2026-11-08): Initial draft (CCR-KR-001)                

## BRIDGER-KR-BEH-03

`keyring/behaviors/03-shred-and-acceptance.md`

- 0.12 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-09) — BEH-KR-020: event-store reads gated page by page, a page in flight interrupted at the freeze's second step, a read inside a store transaction fenced, projections restarted once `whenReadable` completes; a read a participant step makes itself skips the gate, a stated limit (H4, H5, H6) — second pass (cleanest design): the limit withdrawn: the participant declares stage "codec", so durable-bus commits its `apply` before any "data" `apply` begins and hands it, like `run`, no `SwapStep`, the only way a step decodes; reads inside a store transaction take event-store `readIn` and the read fence; BEH-KR-017: `shredIn(tx, …)` joins the caller's transaction for step 1 (fence first, `OutboxFrozen` there only, the remaining steps forked on `tx.onEnd` "committed"), `shred` always opens its own and never returns `OutboxFrozen`, the joining forms `keyIn`, `encryptIn`, `rotateIn`, `rewrapIn` and the codec's `encode` write in the `tx` they are passed, each joining form dies on a `KeyStore` without `transaction`, and no operation looks for a transaction in the environment; BEH-KR-020: handlers and the store-swap `apply` pass their transaction to each `KeyStore` write; checks 3 and 10; BEH-KR-017: only a `Sealed` whose key (or version) the rolled-back transaction created is lost (PL18); check 12; third pass: a store-swap step that awaits the read gate is refused at once (durable-bus BEH-DB-048, `CurrentSwapStep`) — BEH-KR-020 says so where it lists the three ways (CCR-KR-011)
- 0.11 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-08) — BEH-KR-020: "every reader" restated as every subscription, every `follow` and every event-store read, event-store reads awaiting `DurableBus.whenReadable`, an application decoding through the codec awaiting it as its own duty (H3); the bound of residuals (a) and (b): received tombstones by the restored-host rule, this host's own shreds by an operator re-apply from a host that received the notice, else unbounded (B4); BEH-KR-017: the rollback limits of a `Sealed` kept outside a caller's transaction and of a `rewrap` under one (PL22); BEH-KR-023: `memoryKeyStore` reads its own pending writes in a transaction (PL18); checks 3, 10 (`encrypt`, and BEH-KR-002, 006, 009 cited) and 12 follow (PL21) (CCR-KR-010)
- 0.10 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-07) — BEH-KR-017: on an outbox-sharing `KeyStore`, a `shred` under a caller's `StoreTransaction` writes step 1 (tombstone and notice) in it and runs the later steps through `tx.onEnd` after a commit, nothing on rollback, failing with `OutboxFrozen` during a freeze, in place of ignoring the ambient transaction (H3); the keyring's own transactions retry `fence` under bounded backoff, uncounted, never from the status feed (K1); BEH-KR-020: the store-swap participant re-applies in `apply`, inside the install before the `OriginChange`, and the refusal of `decrypt` and the codec after the `OriginChange` is removed (H4, K2); the residual narrows to a crash during the install and a failed `apply`; BEH-KR-023: `memoryKeyStore` applies its writes on the "committed" outcome and offers `dump` and `restoreFrom` (K3); checks 3, 10 and 12 restated; SPEC-AUDIT-07 residual — BEH-KR-020: after a failed `apply` durable-bus retries it in its `apply-pending` hold, readers held, and the keyring's own re-apply is removed; the residual keeps a stop of the process during the install or the hold, and adds the keyring plugin stopping during the hold; BEH-KR-017: the `create`, `addVersion` and `replaceWrapped` writes of `key`, `encrypt`, `rotate`, `rewrap` and the codec take the fence like every keyring write, retried on the keyring's own transactions, and under a caller's `StoreTransaction` are written in it and fail with `OutboxFrozen`; checks 10 and 12 follow; BEH-KR-017: a key the codec creates inside a `publish` or event-store write that then fails is a keyring write in the caller's transaction, kept if the caller commits, used by the subject's next encryption, not an outbox row; BEH-KR-020: the residual stated as three accepted residuals with their bounds, adding (c) an `apply` that fails on every retry, holding writes and readers until the operator restores the `KeyStore`; check 10 follows (CCR-KR-009)
- 0.9 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-06) — BEH-KR-017: `shred` ignores an ambient transaction (K3); with an outbox-sharing `KeyStore`, every keyring write transaction calls `DurableBus.fence` first and waits for the freeze to lift on `OutboxFrozen`, uncounted, the error union unchanged (H4); BEH-KR-020: `decrypt` and the codec refuse every subject from the `OriginChange` until the re-apply commits (K1), and the crash window before the re-apply is a stated residual (K2); BEH-KR-023: `memoryKeyStore` offers `transaction` over a given `TestStore` (PL14); checks 3, 10 and 12 extended (PL14, H4, K1, K3) (CCR-KR-008)
- 0.8 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-05) — BEH-KR-017: a publish that fails on the one-transaction path runs step 1 again alone and leaves the notice pending; the pending-notice list adds `OutboxFrozen`, `AccessRefused` and `DowncastRefused`; the error union is unchanged (B4); BEH-KR-020: the applying and acknowledgement handlers write the `KeyStore` in their own transaction when the `KeyStore` shares the outbox database (B5); an `onStoreSwap` participant keeps tombstones, pending steps and acknowledgements across a whole-store install (B6); checks 10–12 extended (CCR-KR-007)
- 0.7 (2026-11-10): BEH-KR-019: acknowledgements and callback cursors are stored with the `KeyStore` (K1); BEH-KR-020: subscriptions named `<id>/shred-apply`, `<id>/shred-refused` and `<id>/shred-ack` (PL2), and a notice for a subject tombstoned under another `shredId` writes nothing, resumes steps 2 and 4 and is acknowledged with its own `shredId` (K2); checks 10, 11 and 12 extended (SPEC-AUDIT-04) (CCR-KR-006)
- 0.6 (2026-11-10): BEH-KR-020: only a refused (unattributed) notice is parked, through a refusal subscription of its own; a notice that meets `KeyStoreUnavailable` halts the applying subscription, never parked, and resumes on plugin start or `DurableBus.resume` (M22); `SubjectShredAcknowledged` loses `host`, the acknowledging host is taken from the envelope's origin, and the `AccessPolicy` obligation covers the acknowledgement as well as the notice (M23); checks 4 and 12 extended (CCR-KR-005)
- 0.5 (2026-11-10): BEH-KR-020: a received notice whose envelope actor a local shred would refuse is not applied (`ShredUnattributed`, parked); the `AccessPolicy` rules that keep the notice's event type to the keyring plugin and to trusted origins are a stated obligation; checks 7 and 12 extended (P12; key-store outage on decode); follow-up: BEH-KR-024 checks 3 and 4 cover `wrappedUnder`, `replaceWrapped` and `rewrap` (BEH-KR-004, BEH-KR-006) (CCR-KR-004)
- 0.4 (2026-11-09): Specification audit of 2026-11-09 (M-01) — a shred requires an attributed actor (`ShredUnattributed`); the tombstone keeps the shred's actor, `onBehalfOf`, correlation, reason and origin, written once and never changed; the notice carries the reason and time and is published under the shred's context, and a receiving host keeps the origin's attribution as a claim; the receipt exposes the attribution; checks 10 and 12 extended (CCR-KR-003)
- 0.3 (2026-11-08): BEH-KR-017 persists step state, resumes incomplete shreds at start and on a repeated `shred`, opens its own transactions and commits the notice with the tombstone when the `KeyStore` shares the outbox; BEH-KR-020 and 021 report acknowledging and `KeyStore`-declared hosts only; BEH-KR-022 `notStated` names undeclared hosts; BEH-KR-024 checks 7, 10 and 12 extended (CCR-KR-002)
- 0.2 (2026-11-08): BEH-KR-017 cites URS-BR-058 (registered by core CCR-BR-027) (CCR-KR-001)
- 0.1 (2026-11-08): Initial draft (CCR-KR-001)                
