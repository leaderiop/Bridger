# Spike area 06: crypto, RPC, EventLog, utilities

Findings from runnable spikes in `spikes/06-crypto-rpc-eventlog/`. Items marked **observed** come from a passing test. Items marked **source** come from reading Effect 4.1.4 source or type declarations. Items marked **inference** are my reading and were not tested.

## 1. Purpose and scope

This area asks whether Effect 4.1.4 crypto, jose, RPC, EventLog and a few utility modules can carry the Bridger needs below, and what Bridger has to build itself.

Spec packages consulted (overviews and README headers only, see section 7): `references/keyring` (per-subject keys, shredding, rotation, key distribution limit), `references/audit-chain` (hash chain, MAC fingerprints, verification), `references/federation` and `docs/ERP-IDENTITY.md` (host-to-host key distribution, decision D12), `references/remote` (RPC between hosts), `references/durable-bus` (per-(origin,stream) sequence, ack after commit, inbox watermark), `references/entitlement`, `references/sequence`, and `docs/resources/effect-cluster/companion-modules.md`. Needs covered: field encryption and crypto-shredding, plugin bundle signing and N-of-M policy, JWKS verification, audit chain integrity and canonical form, host key agreement, RPC with capability tokens, timeouts, version skew and unknown outcome, EventLog as a sync substrate, tenant-to-shard mapping, plugin version ranges, consent diffs, cron with missed-run policy.

Out of scope: Cloudflare, cluster entities, SQL persistence beyond the SQL journal (other areas).

## 2. Environment and method

- Effect 4.1.4, `@effect/platform-node` 4.1.4, `@effect/sql-sqlite-node` 4.1.4, vitest 5.1.0, Node 22+, macOS.
- Run: from `spikes/`, `npx vitest run 06-crypto-rpc-eventlog` (33 tests, all pass in about 2 s). Type check: `npx tsc --noEmit` reports no errors for this directory. To see `console.log` evidence add `--silent=false`.
- Import paths in 4.1.4 differ from the repository source tree: `effect/crypto`, `effect/jose`, `effect/rpc`, `effect/socket`, `effect/eventlog/<Module>`, `effect/http`. There is no `effect/unstable/*`. The installed package ships readable source at `node_modules/effect/src`.
- Method: characterization tests. Each test asserts what happened, including negative behaviour. Where a gap exists, a small Bridger-style implementation is written in the test to show that Bridger owns it.

File map:

| File | Content |
|---|---|
| `crypto.spike.test.ts` | Aead, KeyWrap, Kdf, rotation and shredding model, Ed25519, N-of-M aggregator, Jws/Jwks, digest chain, Mac, canonical JSON, KeyAgreement (SPK-06-01 to 09) |
| `rpc.spike.test.ts` | Rpc over TCP socket, middleware, timeout, version skew, connection drop, in-process, worker (SPK-06-10 to 15) |
| `rpc-worker.mjs` | Worker-thread side of SPK-06-15, plain ESM |
| `eventlog.spike.test.ts` | Journal sync on memory and SQLite, conflicts, ordering, EventLog write, encryption (SPK-06-16 to 20) |
| `util.spike.test.ts` | HashRing, SemVerRange, TextDiff, JsonPatch, Cron, catchUp (SPK-06-21 to 29) |
| `RESULT.md` | Verdict table |

Test ID note: SPK-06-24 is unused (renumbered during work). SPK-06-01 is one test run for two algorithms; SPK-06-16 to 18 run once per journal backend (`[memory]`, `[sqlite]`).

## 3. Findings

### SPK-06-01 Aead round trip, AAD binding, nonce handling
- Need: keyring field encryption with AAD binding (keyring README and overview).
- Test: for `Aead.xchacha20Poly1305` and `Aead.aes256Gcm`, encrypt with random nonce and AAD `tenant=t1;subject=s1;field=email`, decrypt, then try wrong AAD, no AAD, flipped bit, short nonce, nonce reuse.
- Observed: round trip works. Ciphertext length is plaintext plus 16 (17 plus 16 = 33). Wrong AAD, missing AAD and a flipped bit all fail with a `CryptoError` whose `reason._tag` is `DecryptionFailed`. A 8-byte nonce fails with reason `InvalidArgument`. Encrypting the same plaintext twice with the same key, nonce and AAD gives identical ciphertext (nothing stops nonce reuse).
- Source: XChaCha20 and ChaCha20 run a vendored pure TypeScript `@noble/ciphers` 2.4.0; AES-GCM runs on `crypto.subtle`. The docs say to use XChaCha with random 24-byte nonces.
- Verdict: READY. Evidence: `crypto.spike.test.ts`, "SPK-06-01: Aead ... round trip, AAD binding, nonce handling".
- Caveat: `CryptoError` has one tag; callers must inspect `reason._tag` (my first test version matched on `_tag` and failed).

### SPK-06-02 KeyWrap and Kdf
- Need: wrap a data-encryption key (DEK) under a key-encryption key (KEK); derive per-subject keys.
- Test: AES-256-KW wrap and unwrap of an XChaCha DEK, then decrypt data with the unwrapped key; RSA-OAEP-SHA256 wrap with a generated pair; unwrap with the wrong KEK; HKDF-SHA256 with different `info`; `Kdf.argon2id()`.
- Observed: wrapped DEK is 40 bytes for a 32-byte DEK. Unwrap restores a working key. RSA-OAEP round trip works. Wrong KEK fails with `DecryptionFailed`. HKDF is deterministic for equal inputs and differs per `info`. `Kdf.argon2id` against the WebCrypto layer returned `Unsupported`.
- Verdict: READY (HKDF, AES-KW, RSA-OAEP). Argon2id not available on this layer.
- Evidence: "SPK-06-02: KeyWrap wraps/unwraps a DEK ...".

### SPK-06-03 Rotation and crypto-shredding
- Need: decrypt old data with an old key id after rotation; make data unreadable by destroying the key (keyring mission).
- Test: an in-test map keyId to wrapped DEK. Seal with `subj1#v1`, rotate to `#v2`, unseal both, delete both wrapped keys, unseal the old ciphertext. Key id is also the AAD.
- Observed: both versions open after rotation; after deletion the lookup fails (`KeyShredded`, my own error) and no key exists to decrypt.
- Verdict: PARTIAL. Primitives suffice; the KeyStore, key ids, versioning, rewrap and tombstone are Bridger code.
- Caveat (inference): shredding is only as good as the absence of plaintext DEK copies in memory, caches or backups. Not testable here.
- Evidence: "SPK-06-03: rotation ... and crypto-shredding ...".

### SPK-06-04 Ed25519 over a bundle digest
- Need: sign plugin bundle digests (federation, plugin packaging).
- Test: SHA-256 digest of bytes, sign, verify; change the digest; verify with another key; export public key bytes and re-import.
- Observed: valid signature verifies. Changed digest gives `false`. Wrong key gives `false`. Signature 64 bytes, public key 32 bytes. Re-imported key verifies.
- Verdict: READY. Caveat: what bytes constitute the bundle digest is not defined by Effect.
- Evidence: "SPK-06-04: Ed25519 signs a bundle digest ...".

### SPK-06-05 N-of-M policy
- Need: threshold approval of a bundle by several signers.
- Test: three trusted Ed25519 keys plus an outsider. A small `thresholdVerify` counts distinct trusted key ids with valid signatures.
- Observed: `Signature.verify` verifies one signature against one key only. The aggregator: one of three with N=2 fails; two distinct pass; the same signer twice fails (dedup); an outsider signature is ignored.
- Source: there is no multisig or trust-set API in `effect/crypto`.
- Verdict: GAP (about 10 lines, Bridger-owned). Evidence: "SPK-06-05: N-of-M policy is Bridger code ...".
- Caveat: no revocation, key validity windows or trust-set distribution in the sketch.

### SPK-06-06 Jws and Jwks with remote cache and cooldown
- Need: verify tokens or manifests against a JWKS with rotation.
- Test: generate EdDSA keys with `Jwk.generateKeyPair`, import them, `Jws.sign`/`Jws.verify`; tamper with the payload segment; `Jwks.makeRemote({timeToLive: 10 minutes, cooldown: 30 seconds})` with a fake `HttpClient` counting fetches and `TestClock`.
- Observed: valid token verifies; tampered payload rejected. Two verifications caused 1 fetch (cache). A token with unknown `kid` failed and did not refetch; after the key set changed, a second attempt inside the cooldown still failed and still no refetch; after advancing 31 s the verification succeeded and the fetch count rose to 2.
- Source: the declaration documents that a failed fetch fails every caller until cooldown passes, with no stale fallback.
- Verdict: READY. Caveat: rotation visibility lag equals the cooldown by design; issuer and `kid` pinning policy is not provided.
- Evidence: "SPK-06-06: Jws sign/verify (EdDSA) ... Jwks.makeRemote ...".

### SPK-06-07 Digest chain and Mac
- Need: audit chain `h(n)=H(h(n-1) || entry)`, HMAC fingerprints (audit-chain overview).
- Test: chain over three entries with SHA-256; edit the middle one, reorder, delete the middle, truncate the tail; `Mac.hmacSha256` sign and verify.
- Observed: edit changes the entry's hash and every later head; reorder and middle delete change the head; truncating the tail produces a prefix of the original chain that is indistinguishable by chain alone (head of entry 2 equals the original second hash). HMAC verifies with the right key and fails (`false`) with another.
- Verdict: READY for the primitive. Truncation needs an external anchor or expected head (inference: matches the audit-chain overview text about deletion of trailing windows, not checked line by line).
- Evidence: "SPK-06-07: Digest chain ...".

### SPK-06-08 Canonical JSON
- Need: stable bytes for hashing entries across hosts.
- Test: the same logical entry with keys in two orders. First hashed with `JSON.stringify`, then with a 4-line recursive key-sorting canonicalizer. Also `JSON.stringify({n: 1n})`.
- Observed: naive hashes differ for the two key orders (this is the "failing" half, asserted as `not.toBe`); the sorted canonicalizer gives equal hashes (the "fixed" half). `JSON.stringify` throws on `bigint`.
- Source: no canonicalizer was found in the effect modules I looked at (inference from absence in the modules I read).
- Verdict: GAP. Caveat: my canonicalizer is not RFC 8785 (no number normalization, no unicode rules).
- Evidence: "SPK-06-08: canonical JSON gap ...".

### SPK-06-09 KeyAgreement, Kdf, KeyWrap for host DEK distribution (D12)
- Need: two hosts derive a shared key and one sends a DEK to the other (federation, keyring limit 5).
- Test: X25519 key pairs for A and B; shared secret both ways; HKDF-SHA256 with `info` naming both hosts; AES-256-KW wrap on A, unwrap on B; then a third key pair M substitutes B's public key; an Ed25519 signature over B's public key bytes; RSA-OAEP wrap as an alternative.
- Observed: both sides derive the same KEK and B recovers the identical DEK. The attacker M agrees with A (shared secrets equal), so nothing in `KeyAgreement` authenticates the peer. A signature over the ephemeral public key verifies. No export containing "hpke" exists in `KeyAgreement`.
- Verdict: PARTIAL. It works as a building block; authentication, context binding and sender identity are Bridger's.
- Evidence: "SPK-06-09: two hosts X25519 + HKDF ...".
- Caveat: this is a sketch, not a reviewed protocol (no key confirmation, no replay protection, static salt of zeros).

### SPK-06-10 Rpc middleware with a capability token
- Need: RPC calls carry a capability; server verifies (remote spec).
- Test: `RpcMiddleware.Service` `CapAuth` with `requiredForClient: true`, error schema `Unauthorized`, provides a `Cap` service. Client layer (`RpcMiddleware.layerClient`) sets header `x-cap`. Server over `NodeSocketServer` + `RpcServer.layerProtocolSocketServer`, ndjson; client over `NodeSocket.layerNet`.
- Observed: good token: handler reads `Cap` and returns `{n: 7, sub: "plugin-a"}`. Bad token: typed failure with `_tag` `Unauthorized`.
- Verdict: READY. Caveat: the token is a plain header string checked against a map in the test; expiry, audience, replay and per-method scope are not provided.
- Evidence: "SPK-06-10: capability-token middleware over TCP socket ...".

### SPK-06-11 Per-call timeout
- Test: handler sleeps 5 s; client wraps the call in `Effect.timeout("150 millis")`.
- Observed: fails with `TimeoutError` in well under 1 s; the same client then completes another call.
- Source: `RpcClient.make` has no timeout option; `RpcClient.layerProtocolSocket` options are ping interval, ping timeout and retry settings (liveness, not per-call).
- Verdict: GAP (Bridger wraps each call). Not verified: whether the server handler fiber is interrupted on client interruption (the test name mentions it, the assertions do not).
- Evidence: "SPK-06-11: no per-call timeout in Rpc ...".

### SPK-06-12 Version skew
- Test: server exposes `Echo(n)` and `Slow`; client group adds `NewThing` and changes `Echo` payload to `{n, extra}`.
- Observed: calling `NewThing` fails with cause reason `Die`, message "Unknown request tag: NewThing" (a defect, not a typed error). `Echo({n:3, extra:"hi"})` succeeds: the old server silently drops the extra field.
- Source: no handshake or protocol version message found in the RPC protocol types I read.
- Verdict: GAP. Evidence: "SPK-06-12: version skew ...".

### SPK-06-13 and 13b Connection drop mid-call and reconnect
- Test 13: server scope closed while `Slow(3000)` is in flight (graceful close); server restarted on the same port; client created with `retryTransientErrors: true`; new call retried with a spaced schedule. Test 13b: a TCP proxy resets sockets (`resetAndDestroy`) mid-call; client without retry.
- Observed 13: the in-flight fiber exits with cause `Interrupt` (not a typed failure). After restart, a retried `Echo` succeeds. Observed 13b: in-flight call fails with `RpcClientError` whose reason is `SocketReadError` ("An error occurred during Read"); a following call on the same client also fails with the same error within the 3 s window (client without retry stays failed).
- Source: `RpcClient.ts` stores a `currentError` and fails subsequent sends with it until reconnect logic clears it; reconnect is on only for `SocketOpenError` with `retryTransientErrors`.
- Verdict: PARTIAL. Caller cannot know whether the handler ran; two distinct failure shapes (Interrupt, `RpcClientError`); no call id or idempotency key.
- Evidence: "SPK-06-13" and "SPK-06-13b" tests.
- Caveat: I did not investigate why graceful close yields Interrupt; that is observed only.

### SPK-06-14 In-process transport
- Test: `RpcTest.makeClient(V1)` with handlers, middleware and client middleware layers.
- Observed: works and returns `{n: 9, sub: "plugin-a"}`. Source: this transport has no serialization. Verdict: READY. Caveat (inference): it will not catch schema encode/decode problems.
- Evidence: "SPK-06-14: in-process transport ...".

### SPK-06-15 Worker transport
- Test: `RpcClient.layerProtocolWorker({size: 1})` with `NodeWorker.layer(() => new Worker(rpc-worker.mjs))`; worker runs `RpcServer.layer` on `layerProtocolWorkerRunner` with `NodeWorkerRunner.layer` and `Layer.launch`.
- Observed: `Ping(41)` returns 42. Verdict: READY. Caveat: worker file is plain `.mjs` so no TS loader is needed.
- Evidence: "SPK-06-15: Rpc over a worker_threads Worker ...".

### SPK-06-16 EventLog journal sync (memory and SQLite)
- Need: sync events between hosts (durable-bus alternative or substrate).
- Test: two journal instances (`Layer.fresh`, separate SQLite `:memory:` DBs). A small pump: `withRemoteUncommited` on the sender, assign `remoteSequence` from a counter, `writeFromRemote` on the receiver, `writeRemoteAcks` on the sender.
- Observed on both backends: 2 entries sent, 0 duplicates; receiver has both; sender's `nextRemoteSequence` is 2; pushing back sends nothing (imported entries are not echoed); a second push sends nothing; redelivering the same entries to the receiver reports 2 `duplicateEntries` and the count stays 2; an ack with a gap (sequence 5 when cursor is 2) leaves the cursor at 2.
- Verdict: PARTIAL (works; contract differs, see mismatch table). Evidence: "SPK-06-16[memory]" and "[sqlite]".
- Caveat: the "server" in this spike is my pump, not `EventLogServer*`.

### SPK-06-17 Conflicts and last-writer-wins
- Test: both sides write `SetName` for key `user1`, sync both ways; compare winners; then import an entry whose id carries a timestamp one hour ahead.
- Observed: both entries are kept on both sides; the `effect` callback of `writeFromRemote` receives non-empty `conflicts`; both sides pick the same winner (later id). The skewed-clock entry beats a later honest write.
- Source: ids are uuidv7 (`createdAtMillis` is read from the id).
- Verdict: PARTIAL. Resolution is the handler's job; ordering is wall-clock only (no HLC, no skew bound).
- Evidence: "SPK-06-17[memory]" and "[sqlite]".
- Caveat: the skewed id was injected by import because `write` assigns ids itself.

### SPK-06-18 Late-arriving entry
- Test: write a local entry, then import an entry whose id is 60 s older.
- Observed: `entries` returns `["older-arrives-late", "newer"]`; the late entry sorts before the existing one.
- Verdict: GAP against a position-based watermark. Evidence: "SPK-06-18[...]".

### SPK-06-19 EventLog write: handler then commit
- Test: `EventLog.group` handler that succeeds, and one that fails with a typed error.
- Observed: success: entry committed, handler ran once. Failure: `write` fails and 0 entries are committed.
- Source: `EventLog` docs state the handler runs first and the journal entry is committed only after it succeeds.
- Verdict: PARTIAL. It is not an outbox and not enlisted in a Bridger SQL transaction (inference from the API; not tested with a shared transaction).
- Evidence: "SPK-06-19: EventLog.write runs the typed handler first ...".

### SPK-06-20 EventLog encryption
- Test: `EventLogEncryption.encrypt(identity, storeId, entries)` and `decrypt`.
- Observed: two encryptions of the same entry have different IVs; the ciphertext text does not contain the event name or primary key; decrypt restores the entry. Wrong identity, wrong store id and a flipped byte all fail as defects (cause reason `Die`). The identity has two fields, `publicKey` and `privateKey`. Entry ids are plaintext and carry a creation timestamp.
- Source: batch AES-256-GCM, key derived from the identity root secret, AAD is store id plus entry ids (header comments in `EventLogEncryption.ts`; signature differs from the test in the effect repo, so I used the installed one).
- Verdict: PARTIAL: confidentiality is there; no per-subject keys, no rotation, no shredding.
- Evidence: "SPK-06-20: encryption ...".

### SPK-06-21 HashRing stability (digest-derived ids)
- Test: 5000 tenant keys (sha-derived), 8 nodes (sha-derived ids), default `baseWeight` 128.
- Observed: adding a 9th node moved about 10.3 percent of tenants (ideal 11.1), all to the new node (asserted). Removing a node moved only that node's tenants. Shares per node were 10.7 to 13.8 percent (ideal 12.5). Rings built in reversed insertion order give identical assignments (0 moved). With `baseWeight` 1024 the add moved about 12.5 percent, shares 11.8 to 13.5 percent (exploratory run, not kept as a test).
- Verdict: READY. Evidence: "SPK-06-21: with digest-derived ids ...".

### SPK-06-22 HashRing with plain sequential names
- Test: nodes `n1..n8`, tenants `tenant-0..4999`.
- Observed: adding `n9` moved 33.5 percent of tenants (3 times the ideal); one node owned 82.3 percent of tenants and removing it moved 82.3 percent; the smallest node owned 0.2 percent (from an exploratory run, the kept test asserts moved over 25 percent and max share over 40 percent). Hashing the ids first restores the numbers in SPK-06-21. Host-style ids (`host-N.bridger.internal:9000`) with `tenant-N` keys moved 10.2 percent in the exploratory run.
- Cause (inference): ring points and lookups use `Hash.string`, a weak hash for similar strings (source shows `Hash.string(`${key}:${i}`)`).
- Verdict: GAP in practice (quality depends on the caller). Evidence: "SPK-06-22: GAP-in-practice ...".

### SPK-06-23 Weighted HashRing
- Observed: with weights 1, 1, 2 and hashed ids, the weight-2 node got between 40 and 60 percent of tenants (exploratory run about 49 percent). `getShards(r, 3)` returned three distinct nodes. Verdict: READY. Caveat: no ownership epoch, fencing or replication factor; it only answers "who".
- Evidence: "SPK-06-23: weighted nodes ...".

### SPK-06-25 SemVerRange
- Observed (asserted): `^1.2.3` matches 1.2.3, 1.9.0, 1.2.4, not 2.0.0, not 1.2.2. `~1.2.3` matches 1.2.9, not 1.3.0. `^0.2.3` matches 0.2.9, not 0.3.0. `^0.0.3` does not match 0.0.4. `^1.2.3` does not match `1.3.0-alpha` unless `includePrerelease: true`. `^1.2.3-beta.2` matches `1.2.3-beta.3`, not `1.2.3-beta.1`. Build metadata is ignored. `maxSatisfying` over `["1.2.0","1.9.9","2.0.0","1.10.0-rc.1"]` for `^1.2.0` returned 1.9.9. `1.0.0-rc.1` sorts below `1.0.0`.
- Verdict: READY. Caveat: `matches` takes a parsed `SemVer`; passing a string is a type error.
- Evidence: "SPK-06-25: caret/tilde ...".

### SPK-06-26 TextDiff
- Observed: `TextDiff.lines` plus `unified` shows `+read:invoices` and `+admin:tenants`; `applyText` returns `{success: <text>}` (an object, not a string) and round trips; `invert` restores the original. Verdict: READY. Evidence: "SPK-06-26: TextDiff.lines + unified ...".

### SPK-06-27 JsonPatch
- Observed: patch ops are only `add`, `remove`, `replace`; applying the patch reproduces the target; `[1,2,3]` to `[3,1,2]` yields three `replace` ops (no move); `apply` throws for a `move` op. One `add` under `/perms` was found by filtering paths.
- Verdict: PARTIAL: usable for diffs; no consent classification. Evidence: "SPK-06-27: JsonPatch yields add/replace/remove only ...".

### SPK-06-28 Cron and DST
- Test: `Cron.parseUnsafe(expr, "America/New_York")`, repeated `Cron.next`, 2025 DST dates.
- Observed (asserted): daily `30 2 * * *`: 2025-03-08 07:30Z, 2025-03-09 07:30Z (this is 03:30 local; the nonexistent 02:30 ran once, shifted), then 06:30Z. Daily `30 1 * * *` on the fall-back day: one run at 05:30Z (first 01:30) by default; with `{onDstOverlap: "both"}` two runs, 05:30Z and 06:30Z. Hourly `0 * * * *` across fall-back: 05:00Z, 07:00Z, 08:00Z, so the 06:00Z run (second 01:00 local) is skipped, a 2-hour gap.
- Verdict: READY with a documented caveat (default overlap policy skips repeated hour for sub-daily jobs). Policies are `earlier`, `later`, `both` (source).
- Evidence: "SPK-06-28: Cron.next is timezone aware ...".

### SPK-06-29 catchUp
- Test: `catchUp(cron, lastRun, now, "all"|"latest"|"skip", max)` iterating `Cron.next` from `lastRun` while `<= now`.
- Observed: `0 9 * * *` Europe/Berlin, down from 2025-03-28T08:00Z to 2025-04-01T12:00Z, over the 30 March change: `all` gives 08:00Z, 07:00Z, 07:00Z, 07:00Z on 29, 30, 31 Mar, 1 Apr; `latest` gives the last; `skip` gives none; `max=2` caps at 2; `lastRun == now` gives none.
- Source: `Schedule.cron`, `fixed`, `spaced` exist; I found no missed-run policy in Cron or Schedule. I did not read `ClusterCron` for this (it is another area).
- Verdict: GAP, owned by Bridger. Evidence: "SPK-06-29: catchUp ...".

### EventLog versus durable-bus contract

Spec references are to the package directories under `references/durable-bus/` (overview, invariants, README) and `references/keyring/`. **Verification status: none of these rows was checked line by line against the spec text.** I read the durable-bus overview header and the contract summary given in the task (per-(origin,stream) contiguous sequence, ack after commit, inbox watermark). The "Effect side" column is observed or from source as marked; the "Spec side" column is from the task brief and the overview, and exact BEH or invariant numbers are not cited because I did not verify them.

| # | Topic | Effect side | Spec side (unverified in detail) | Evidence | Spec ref |
|---|---|---|---|---|---|
| 1 | Sequence scope | one `remoteSequence` per remote, assigned by the remote; no stream concept; `primaryKey` is an aggregate key (observed 16, source) | contiguous sequence per (origin, stream) | SPK-06-16 | `references/durable-bus/overview.md`, `README.md` |
| 2 | Ordering | journal sorted by uuidv7 id; late entries sort first (observed 18) | per-origin contiguous order, gaps detected | SPK-06-18 | `references/durable-bus/invariants.md` |
| 3 | Ack after commit | `writeRemoteAcks` records upload receipts and advances a cursor over contiguous sequences (observed 16); handler-then-commit in `EventLog.write` (observed 19) | consumer acknowledges after its own commit (outbox settlement) | SPK-06-16, 19 | `references/durable-bus/README.md` |
| 4 | Inbox watermark | none; dedup by entry id only (observed duplicates reported) | high-water mark per origin and stream | SPK-06-16 | `references/durable-bus/invariants.md` |
| 5 | Conflict and clock | LWW by uuidv7 id; skewed clock wins (observed 17) | no wall-clock dependence for ordering (inference) | SPK-06-17 | `references/durable-bus/overview.md` |
| 6 | Encryption | one key per identity, AES-GCM, AAD store id plus entry ids; ids plaintext (observed 20) | per-subject keys via keyring `PayloadCodec`, shreddable | SPK-06-20 | `references/keyring/overview.md` |
| 7 | Failure typing | decrypt failures are defects (observed 20) | typed outcomes (inference) | SPK-06-20 | not located |
| 8 | Transaction | journal write is not enlisted in a Bridger transaction (inference from API, not tested) | outbox in the store transaction (`StoreTransaction`, overview change history) | SPK-06-19 | `references/durable-bus/overview.md` |

Rows 5 and 7 spec sides are my inference, not read. Row 8's Effect side is also inference.

## 4. Surprises and gotchas

1. Wrong import paths: the repo source tree layout (`effect/unstable/...`) does not match 4.1.4 exports. Use `effect/crypto`, `effect/jose`, `effect/rpc`, `effect/eventlog/<Module>`, `effect/http`.
2. `CryptoError` is a single tag; the specific failure is `error.reason._tag` (`DecryptionFailed`, `InvalidArgument`, `Unsupported`, ...).
3. `Effect.provide(layer)` closes the layer scope when the provided effect finishes. Building an `RpcClient` or a SQLite-backed journal that way closes the socket or database ("database is not open"; RPC calls hang). Build the layer with `Layer.build` in the outer scope. My first RPC test run hung for 120 s on this.
4. `Effect.provide(J, layer)` with the same layer reuses the memoized instance, so "two journals" were one. Use `Layer.fresh`.
5. RPC graceful server close interrupts in-flight calls instead of failing them; abrupt reset gives `RpcClientError`. Handle both.
6. Without `retryTransientErrors` the socket client keeps failing after a drop (observed 13b).
7. Unknown RPC methods are defects (`Die`), and added payload fields are dropped silently.
8. EventLog decryption problems are defects; wrap if typed errors are needed.
9. HashRing needs digest-derived ids; plain names give 82 percent hot nodes.
10. Cron default for repeated DST hour skips the second occurrence, so an hourly job loses a run once a year; spring-forward shifts the job rather than skipping it.
11. `TextDiff.applyText` returns `{success}`; `SemVerRange.matches` requires a parsed `SemVer`; `Jwk.generateKeyPair` returns JWK structures, not key objects (import them with `importPublic` and `importPrivate`).
12. `Jwks.makeRemote` failures are not served from stale cache (source docs).
13. `console.log` output in passing vitest tests is hidden by default; use `--silent=false`.

## 5. Missing pieces and design sketches

All sketches are proposals; only the N-of-M, canonical JSON, and catchUp ones have working test code (small). The rest are untested design.

**KeyStore and rotation (not built; primitives tested in SPK-06-03).** Records `{subjectId, keyId = subject#version, wrappedDek, kekId, state: active|retired|shredded, createdAt}`. `key(subject)` creates `#v1` on first use (DEK via `Aead.generateKey`, wrapped with `KeyWrap.aes256Kw` under a KEK). Ciphertext envelope `{keyId, nonce(24), ct}` with AAD = tenant, subject, field, keyId. Rotation mints `#v(n+1)` and leaves old records readable; `rewrap` re-wraps under a new KEK. Shred writes a tombstone with attribution, deletes every wrapped copy including replicas, then runs redaction callbacks. Obligation: no plaintext DEK persisted; backups must contain only wrapped keys or be covered by the retention policy.

**N-of-M aggregator (tested, SPK-06-05).** `thresholdVerify(trusted: Map<kid, PublicKey>, sigs, n)`: for each signature, skip unknown kid, verify against that key, add valid kids to a set, succeed when set size is at least n. To add: trust-set versioning, revocation list, validity windows, and signed policy `{n, signers}` bound into the signed digest so a policy cannot be downgraded.

**Canonical JSON (tested in minimal form, SPK-06-08).** Specify RFC 8785 (JCS) for entries: sorted keys by UTF-16 code unit, no insignificant whitespace, number serialization rules, reject `undefined`, `NaN`, `Infinity`, represent bigint and bytes explicitly (decimal string, base64url). Pick one canonicalizer, version it inside the chain link (`ChainLink` version field), and add golden test vectors shared by every host implementation.

**RPC deadline and unknown outcome.** Client wrapper: `call = Effect.timeout(deadline)` plus a header `x-deadline` (absolute time) and `x-idem` (idempotency key, UUIDv7). Server middleware rejects expired deadlines, interrupts the handler at the deadline, and records `x-idem` with the result in a dedup table (TTL longer than the longest retry window). Client maps `TimeoutError`, `Interrupt` and `RpcClientError(SocketReadError)` to one typed `OutcomeUnknown` error that carries the idempotency key; callers retry with the same key or query by key. Also add a `Version` header check in the same middleware returning a typed `VersionSkew` error.

**Hybrid logical clock bus (design only, nothing tested).** Replace wall-clock ordering with entries `{origin, stream, seq, hlc}` where `seq` is contiguous per (origin, stream) and `hlc = (physical, logical, origin)` with a bounded skew check on receive (reject or quarantine entries more than a configured skew ahead). Receiver keeps a watermark per (origin, stream) in the same SQL transaction as the effect it applies, accepts `seq = watermark + 1` only, buffers or requests a replay on gaps, and acks after commit. EventLog's journal and encryption can sit underneath as transport and storage, with the bus layer owning sequence and watermark. This is inference about how to reuse EventLog; it was not prototyped.

**catchUp (tested, SPK-06-29).** `catchUp(cron, lastRun, now, policy, max)`: iterate `Cron.next` from `lastRun` while `<= now` up to `max`; `all` returns all, `latest` returns the last, `skip` returns none. To add: persisted last-run per job in the store transaction, per-job `onDstOverlap`, a replay storm guard (the `max` cap), and a recorded "skipped" audit event.

## 6. Fix and improve list by owner

**bridger-spec**
- must: define canonical JSON and bundle digest layout (SPK-06-04, 06-08).
- must: state that journal position is not a watermark and that ordering must not rely on wall clocks; decide whether EventLog is transport only (SPK-06-17, 06-18, mismatch rows 1 to 5).
- must: add RPC contract: deadline, idempotency key, version negotiation, unknown-outcome semantics (SPK-06-11, 06-12, 06-13).
- should: state the shredding obligation about plaintext key copies and backups (SPK-06-03).
- should: choose `onDstOverlap` per scheduled job and document skipped-repeated-hour behaviour (SPK-06-28).
- should: require tail anchoring or expected heads for chains (SPK-06-07).
- nice: specify N-of-M policy document format (SPK-06-05).

**bridger-code**
- must: KeyStore, rotation, rewrap, shred (SPK-06-01, 06-02, 06-03).
- must: authenticated key distribution (signed ephemeral keys, host ids in KDF info) (SPK-06-09).
- must: RPC wrapper with timeout, idempotency key, `OutcomeUnknown` mapping, version check (SPK-06-11 to 06-13).
- must: feed digest-derived ids to HashRing (SPK-06-22).
- must: build RPC clients and journals with `Layer.build` in the right scope (SPK-06-10, 06-16).
- should: threshold signature verifier and trust set (SPK-06-05).
- should: capability token format with expiry, audience, scope check (SPK-06-10).
- should: `catchUp` with persisted last run (SPK-06-29).
- should: map JsonPatch ops to consent items; treat additions under permission paths as escalation (SPK-06-27).
- should: handle both Interrupt and `RpcClientError` drops; enable `retryTransientErrors` (SPK-06-13).
- nice: JWKS cooldown and pinning policy per IdP (SPK-06-06).
- nice: ship worker entry as plain JS (SPK-06-15).

**effect-upstream**
- should: HPKE or an authenticated KEM in `effect/crypto` (SPK-06-09).
- should: stronger string hash or documentation warning for `HashRing` (SPK-06-22).
- should: per-call timeout option on `RpcClient` and typed unknown-method error (SPK-06-11, 06-12).
- nice: Argon2id on the WebCrypto layer (SPK-06-02).
- nice: HLC-based entry ids or skew check in `EventJournal` (SPK-06-17).
- nice: typed decrypt failures in `EventLogEncryption` (SPK-06-20).

**qadi:** nothing from this area (inference: capability token checks could call qadi, not tested here).

**awthaq:** nothing tested here. Inference: JWKS and token verification (SPK-06-06) overlaps with awthaq identity; whether awthaq wraps `Jwks` was not checked.

## 7. Not verified

- **EventLog server and remote protocol.** I tested the journal (memory and SQL) with my own pump and the encryption service, and `EventLog.write` with a handler. I did not run `EventLogRemote`, `EventLogServerUnencrypted`, `EventLogServerEncrypted`, session authentication or compaction end to end. Doing so needs: a store mapping, an authorization service, a storage layer (memory storage exists), an RPC protocol pair (the effect repo test `EventLogServerUnencrypted.test.ts` shows the wiring), and assertions on the server-assigned sequence, auth failures, and compaction. Estimate half a day.
- **Spec line-by-line check.** I read only the overview headers and mission text of keyring, audit-chain and durable-bus, plus the task summary. Behaviour and invariant IDs (BEH-, invariants) were not cross-checked, federation, remote, entitlement and sequence packages and `ERP-IDENTITY.md` D12 were not opened, and the mismatch table spec side is therefore partly inference. To verify: for each table row, find the invariant and behaviour text and cite its ID; for D12 read the decision text and compare against SPK-06-09.
- RPC server-side interruption when the client times out (SPK-06-11 asserts only client behaviour).
- HashRing with real tenant ids at scale and with churn of more than one node.
- Cron with 6-field (seconds) expressions, `prev`, and `Schedule.cron` integration.
- Jwks with RSA/EC keys and `verifyWithKeySet` algorithm confusion cases.
- AES-GCM or XChaCha performance, key size limits, large payloads.

## 8. Reproduction notes

1. `cd spikes && npx vitest run 06-crypto-rpc-eventlog` (add `--silent=false` for printed evidence; `--testTimeout=15000` if debugging a hang). Expected: 4 files, 33 tests passed.
2. `npx tsc --noEmit` in `spikes/`; filter output with `grep '^06-'` for this area.
3. Effect source for reference: `spikes/node_modules/effect/src/{crypto,jose,rpc,eventlog,socket,workers}`; type declarations under `dist/`.
4. The RPC tests bind real TCP ports (port 0, loopback) and a worker thread; 13b also starts a loopback proxy. No external network is used.
5. The RPC and SQLite tests rely on building layers in the outer scope with `Layer.build`; replacing that with `Effect.provide(layer)` reproduces the hang and the "database is not open" error described in section 4.
6. Exploratory numbers quoted in section 3 and marked "exploratory" (HashRing `baseWeight` 1024, host-style ids, min share 0.2 percent) came from a throwaway test that was deleted; they are not in the committed tests.
