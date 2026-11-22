# Spike 05: platform runtime and plugin packaging

Findings from the readiness spike for Bridger area 05. Everything marked "Observed" was produced by a test in `spikes/05-platform-packaging/`. Everything marked "Source" or "Docs" was read from Effect source comments or the Bridger spec and not executed. Inferences are labelled as such.

## 1. Purpose and scope

Question: can Effect 4.1.4 (`effect`, `@effect/platform-node`, `@effect/opentelemetry`) carry the host-process, plugin-packaging and plugin-isolation needs of Bridger, and what must Bridger build itself?

Needs and spec references covered:

- Graceful shutdown of the host process (loader overview, host lifecycle).
- Out-of-process plugin hosts and remote adapters: spawn, stdio, kill, env (`references/remote/overview.md`, ADR-RM-006 "isolation comes from the host").
- No in-process sandbox for untrusted code (`references/loader/decisions/005-in-process-loading-is-for-first-party-code.md`, `references/loader/overview.md` line 168 "not a sandbox").
- Package format, digest and extraction safety (`references/loader/behaviors/01-package-and-digest.md`, BEH-LD-001/002; ADR-LD-002; `docs/ERP-DISTRIBUTION.md`).
- Safe handling of untrusted text formats (NDJSON from remote guests, CSV, YAML, JSON5, XML).
- Atomic file publication, temp directories, directory watching, path containment.
- Observability export (traces, Prometheus metrics).

Cloudflare is out of scope: it is not a Bridger requirement. It is covered only in section 7.

## 2. Environment and method

- macOS (Darwin 25.6), Node 22+, zsh. All results are macOS/POSIX only.
- `effect@4.1.4`, `@effect/platform-node@4.1.4`, `@effect/opentelemetry@4.1.4`, vitest 5.1.0. The installed `effect@4.1.4` is newer than the checkout at `../effect/packages/effect/src`: `Tar`, `Zip`, `Csv`, `Json5`, `Xml` and `crypto/*` exist only in `spikes/node_modules/effect/src`. Source quotes below come from the installed package.
- Tests are characterization tests per `spikes/README.md`: they assert what happens, including negative behaviour.
- Run one area: `cd spikes && npx vitest run 05-platform-packaging`. Result at time of writing: 6 files, 44 tests, all pass; `npx tsc --noEmit -p .` reports no errors in this directory.

File map (all under `spikes/05-platform-packaging/`):

| File | Purpose |
|---|---|
| `runmain.spike.test.ts` | Spawns a child Effect main and signals it (SPK-05-01) |
| `childprocess.spike.test.ts` | ChildProcess spawn, env, kill, process groups, no-sandbox proof (SPK-05-02) |
| `fs-path.spike.test.ts` | Atomic write, scoped temp dir, watch, `resolveWithin` and symlink bypass (SPK-05-03) |
| `tar-zip.spike.test.ts` | Tar bundle, hostile archives, caps, Zip, digests (SPK-05-04, 05, 06) |
| `parsers.spike.test.ts` | Ndjson, Csv, Yaml, Json5, Xml limits (SPK-05-07) |
| `otel-cf.spike.test.ts` | OTel peers check, Effect-native OTLP, Prometheus, `new Function` (SPK-05-08, 09) |
| `bundle.ts` | Helpers: sorted tar builder, entry validator, sha256, `packageDigest` |
| `fixtures/main.mjs` | Effect main with finalizers, run under `NodeRuntime.runMain` |
| `fixtures/sh.mjs` | Child that echoes stdin, prints env, ignores SIGTERM, or tries fs/network access |
| `fixtures/grandchild.mjs` | Parent that spawns a grandchild and prints its pid |
| `RESULT.md` | Verdict table |

Test ID note: the test files label sub-tests with letters that do not always match the RESULT.md rows (for example the fs tests are `03a` to `03f` in the file, and RESULT.md groups some). This document cites the test name text.

## 3. Findings

### SPK-05-01 NodeRuntime.runMain signals

- Need: host shuts down on SIGTERM/SIGINT with finalizers (plugin scopes, connection pools) completing; exit code known for supervisors.
- Tested: `fixtures/main.mjs` runs `NodeRuntime.runMain` over a scoped effect with a finalizer printing `FINALIZER_RAN`; the test spawns it with `node`, waits for `READY`, sends a signal.
- Observed: SIGTERM and SIGINT both ran the finalizer and exited with code **130** (not 143 for SIGTERM). An async finalizer (300 ms sleep) completed before exit. A `fail` main exited 1, a successful main exited 0. A second SIGTERM 50 ms after the first did not kill the process; the slow finalizer still finished and the exit code was 130.
- Source: `NodeRuntime.runMain` installs one handler for both SIGINT and SIGTERM that interrupts the fiber; `Runtime.defaultTeardown` maps external interruption to 130. The docs do not state this for SIGTERM.
- Verdict: READY.
- Evidence: `runmain.spike.test.ts`, tests `SPK-05-01a` to `01e`.
- Caveats: there is no shutdown deadline. A finalizer that never completes hangs shutdown (inference from the second-signal test: later signals are absorbed). A supervisor expecting 143 will misread 130.

### SPK-05-02 ChildProcess

Need: remote adapters spawn plugin hosts and must control their lifetime and inputs (remote overview, ADR-RM-006).

**02a stdio.** Spawn `node sh.mjs echo`, write bytes through `h.stdin` sink, read `h.stdout` as a stream. Observed: round trip `hello bridger`. READY. Test `SPK-05-02a`.

**02b env and Redacted.** Observed: with `env: {SECRET_TOKEN: Redacted}` and no `extendEnv`, the child printed the secret and `NOPATH` (inherited env replaced). With `extendEnv: true` it printed the secret and `PATH`. `String(redacted)` does not contain the secret. Source: the option docs say Redacted values "are passed to the child unchanged and are never shown in errors". PARTIAL: Redacted protects parent-side logs only; the child sees plaintext. Test `SPK-05-02b`.

**02c kill semantics.** A child that traps SIGTERM and keeps running. Observed: `h.kill()` did not complete within 1 s (the effect timed out, process still running); `h.kill({forceKillAfter: "200 millis"})` then terminated it. Source: `forceKillAfter` defaults to undefined, so SIGKILL is never sent. PARTIAL (works, but the default can hang). Test `SPK-05-02c`.

**02d scope close and descendants.** Parent spawns a grandchild (same process group, not detached) and prints its pid. Closing the scope with `forceKillAfter: 500 ms` left both pid and grandchild pid dead after 300 ms. Source: POSIX spawns default to `detached: true` (own process group) and cleanup signals the group; on Windows, `taskkill` kills the tree only while the leader runs and descendants that outlive the leader survive; the spawner docs warn that a reused process-group id could signal an unrelated group. Not tested: a grandchild that calls `setsid` or `detached: true` itself (inference: it escapes the group signal). READY on POSIX for cooperative trees. Test `SPK-05-02d`.

**02e no sandbox.** The child wrote a file in a temp dir outside its cwd, read `/etc/hosts`, and fetched from a local HTTP server on a random port. All succeeded. A second test reads the `CommandOptions` interface from source and asserts no member name matches uid, gid, permission, sandbox, network, chroot, limit, seccomp or rlimit. GAP: Effect provides lifecycle control only. Design implication: any plugin run as a child process has the host user's full fs and network authority. This agrees with loader ADR-005 and ADR-RM-006; the isolation boundary has to be supplied by the environment. Tests `SPK-05-02e`, `SPK-05-02f`.

### SPK-05-03 FileSystem and Path

**Atomic write.** Pattern in the test: write `target.<pid>.tmp`, open and `sync` it, `rename` to target. Simulated crash (die before rename) left the old content `OLD` readable and exactly one stray `.tmp`; a completed run replaced it and left no temp. Source check: `FileSystem.ts` contains no occurrence of "atomic". PARTIAL: the pattern works, no helper exists, a startup sweep of stray temps is needed, and the directory itself was not fsynced (not tested). Tests `SPK-05-03a`, `SPK-05-03b`.

**Scoped temp dir.** `makeTempDirectoryScoped` removed the directory including nested files after the scope closed with a failure. READY. Test `SPK-05-03c`.

**Watch.** After `onReady`, the test did three `writeFileString` to `p.tgz`, a rename to `q.tgz`, and a remove. Observed events (macOS): `Update:<dir name>`, `Remove:p.tgz`, `Remove:q.tgz`: 3 events for 5 operations, no Create for either file. PARTIAL: the stream is raw OS notifications, lossy and path-imprecise on macOS. Inference: Linux inotify will differ; not tested. Test `SPK-05-03d`.

**resolveWithin lexical cases.** With root `/srv/plugins/acme`: `../other`, `a/../../x`, `/etc/passwd` and `../acme-evil/x` returned none; `a/../b` resolved to `/srv/plugins/acme/b`; `.` resolved to the root. Test `SPK-05-03e`.

**resolveWithin symlink bypass.** Created `root/link -> <outside dir>`. `resolveWithin(root, "link/evil.txt")` returned `Some(root/link/evil.txt)`; writing there created `evil.txt` in the outside directory. `realpath(root/link)` is not under `realpath(root)`, so a realpath re-check catches it. Source docs state the check is lexical and "not a sandbox on its own". PARTIAL. Test `SPK-05-03f`.

### SPK-05-04 Tar bundles

Need: deterministic, safe plugin bundles (BEH-LD-001/002). Note ADR-LD-002 hashes the file set, not the archive, so archive determinism is useful for reproducible publishing but not required by the digest.

Tested (`tar-zip.spike.test.ts`, `bundle.ts`):

- **Determinism.** `buildBundle` sorts entries by path and encodes with `Tar.file` defaults (mode 0644, uid/gid 0, empty names, mtime epoch). Two runs and three seeded shuffles of the input were byte-identical (`Buffer.equals`). Without sorting, a shuffled input produced different bytes: the encoder preserves caller order. Setting `mtime` changes the bytes. Output length is a multiple of 512. Tests `04a`, `04b`, `04c`.
- **Hostile archives.** Built with the encoder (it does not reject these), decoded with the raw decoder (all entries decoded, count equal), then run through the validator:

| Fixture | Raw decoder | Validator result |
|---|---|---|
| `../evil.js` | accepted | "parent traversal" |
| `a/../../evil.js` | accepted | "parent traversal" |
| `/etc/cron.d/x` | accepted | "absolute path" |
| symlink `link -> /etc`, then file `link/passwd` | accepted | rejected at the symlink entry ("type Symlink not allowed") |
| hardlink to `/etc/shadow` | accepted | "type Hardlink not allowed" |
| mode `0o4755` | accepted | "setuid/setgid" |
| `a` then `A` | accepted | "duplicate (case-insensitive)" |

- **Caps.** Entry count, per-entry declared size and total declared size each rejected a small test archive. A forged header (size field set to octal 10000000000, 1 GiB, checksum recomputed, followed by 4 KiB of data) was rejected by the declared-size cap. Without any cap the decoder surfaced the 1 GiB header and then failed with `TarError` kind `Truncated`: `header.size` is trusted when the header is read. Header checksum is verified (a forged size with a stale checksum failed with "header checksum mismatch"). A truncated valid archive failed with a `TarError`, not a crash. Tests `04d` to `04g`.
- Source: the `Tar.decode` docs say paths and link targets "can be absolute or contain `..`" and that a symlink entry "can redirect a later entry outside the target directory"; PAX and GNU long-name headers over 1 MiB fail; GNU sparse is `Unsupported`; bodies must be read while the entry stream runs.
- Verdict: PARTIAL. The codec is correct and streaming, the policy is entirely Bridger's.

**Validator design in `bundle.ts` (`violation`, `validateBundle`).** Per entry, before any body is read or disk touched:

1. Type must be `File` or `Directory` (rejects symlink, hardlink, device, FIFO).
2. Reject absolute paths and drive-letter prefixes.
3. Reject backslash and NUL.
4. Reject any `..` segment.
5. Reject empty or `.` segments after trimming trailing slashes.
6. Reject case-insensitive duplicates (also covers macOS and Windows collisions).
7. Count entries against `maxEntries` (default 1000).
8. Reject `header.size` over `maxEntryBytes` (default 10 MB) and running total over `maxTotalBytes` (default 50 MB), using the declared size, before the body is read.
9. Reject setuid/setgid mode bits.

The defaults are spike values, not recommendations. Not covered (inference): the declared size is trusted by the decoder, so a body-length overrun is bounded by the decoder itself (it streams exactly `size` bytes per the docs), but total bytes actually written should still be counted at extraction; Unicode normalization collisions and reserved Windows names are not checked.

### SPK-05-05 Zip

- Determinism: `Zip.file` entries for `Store` and `Deflate` produced identical archives across two runs on this machine (fixed mtime 1980-01-01, mode 0644). Source/inference: Deflate output is a function of the zlib build, so cross-machine or cross-Node-version identity is not guaranteed; Store is a pure function of input. Deflated output for 1000 `x` was smaller than stored. Test `05a`, `05b`.
- CRC: flipping one stored byte made decode fail with a `ZipError`; message: `Checksum CRC-32 of "a.txt" is 0x7666ca52, but the archive records 0x478ed0cf`. Test `05c`.
- Bomb: 64 MiB of zeros deflated to under 200 KB. In-memory `Zip.file` entries report `header.size` (67108864) at header time, so a cap can reject before inflating. A streamed `Zip.fileStream` Deflate entry without size reported `header.size === undefined` and the body read produced the full 67108864 bytes: the caller must count bytes while reading and abort. Source docs warn that deflate can expand about a thousand times and that skipping an entry inflates the rest of it. Test `05d`.
- Hostile zip: a hand-built archive with name `../evil.txt`, deflated body and a data-descriptor flag decoded successfully; the path was returned unsanitized and `size` was undefined. Source: Store entries whose sizes follow their data fail with `Unsupported` by design; the central directory is not read, so other tools may see different entries in archives with appended data. Test `05e`.
- Verdict: PARTIAL, same validator needed. Inference: prefer tar for packages.

### SPK-05-06 Digest

- **06a.** `NodeCrypto.layerDigest` with `Digest.sha256` over the bundle equals a `node:crypto` streaming digest fed in two chunks. `Digest.digest` takes a whole `Uint8Array`; there is no streaming interface (source). READY with that caveat. Test `SPK-05-06a`.
- **06b `packageDigest`.** Implements BEH-LD-002 from the spec: `manifestDigest = sha256(manifest bytes)`; `sbomDigest = sha256(utf8(format) || 0x00 || bytes)`; `filesDigest = sha256(for each path in byte-wise UTF-8 order: utf8(path) || 0x00 || utf8("sha256:"+hex(sha256(content))) || 0x0A)`; `packageDigest = sha256("bridger-package-v1\n" + manifestDigest + "\n" + sbomDigest + "\n" + filesDigest + "\n")`; every value is `sha256:<hex>`. Observed: same digest for shuffled input; same digest after a tar encode/decode round trip with a different mtime; different digest when one content byte changes, when a path changes, and when the SBOM format changes. This is the value spike 06 signs and verifies. READY. Caveat: I did not diff against another implementation; the sub-digest layout follows the spec text exactly as quoted in `01-package-and-digest.md` lines 121 to 130. The spike's file content in the round-trip test is text, so binary files are not exercised.

### SPK-05-07 Parser safety

- **Ndjson (07a, 07b).** `Ndjson.decode()` default `maxLineBytes` is unbounded (source: "Lines are unbounded by default"). A single 20 MiB line was buffered and parsed to one value. With `maxLineBytes: 1 MiB` it failed with `NdjsonError.reason === "LineTooLarge"`. A stream of 12.5 MiB spaces with no newline also failed with `LineTooLarge` under a 1 MiB cap (the unbounded-default case for that input is inferred from the source, not run to exhaustion). GAP for the default.
- **Csv (07c).** A 2 MiB record failed by default with `CsvError.kind === "RecordSize"`; `maxRecordSize: 4 MiB` and `Infinity` both accepted it. READY (default is 1 MiB UTF-16 units per source).
- **Yaml (07d).** `<<` merge works unquoted (`user` got `role: admin` plus `name: bob`); quoted `"<<"` stays an ordinary key. `Yaml.parse` has arity 1: no options. 5000 nested `[` threw `RangeError` (stack overflow). An alias chain of 6 levels with fan-out 10 parsed quickly (shared references) but `JSON.stringify` of the result was 46,913,610 bytes. GAP: no depth, alias or size limits and no switch to turn merge off.
- **Json5 (07e).** `{"__proto__": {polluted: true}, a: 1}` yields an own property `__proto__`, prototype unchanged, `({}).polluted` undefined. A naive recursive merge over the result then set `Object.prototype.polluted`. `JSON.parse` behaves the same. PARTIAL: parser is safe, consumers are not.
- **Xml (07f, 07g).** A DOCTYPE with nested entity declarations and a `SYSTEM "file:///etc/passwd"` entity both ended in `XmlError`; `&lt;&amp;&#65;` decoded to `<&A`. `maxDepth: 100` rejected 2000-deep nesting. Source: entities declared in a DOCTYPE are never expanded. READY; limits are opt-in.

### SPK-05-08 OpenTelemetry

- **08a.** `spikes/node_modules/@opentelemetry` contains only `semantic-conventions`. `@opentelemetry/api`, `sdk-trace-base`, `sdk-trace-node`, `sdk-metrics`, `resources` are not installed. `import("@effect/opentelemetry/NodeSdk")` rejects. The in-memory exporter test could not be written. BLOCKED. Root `package.json` was off-limits for this spike.
- **08b.** Substitute test using Effect's own `Otlp.layerJson` with `NodeHttpClient.layerUndici`, pointed at a local HTTP server capturing `/v1/traces`. A span `plugin.activate` with a child `child` was run under `Effect.withParentSpan(Tracer.externalSpan({traceId, spanId}))`. Observed: `plugin.activate.traceId` and `parentSpanId` equal the external ids; `child.parentSpanId` equals `plugin.activate.spanId`; custom attribute `bridger.plugin` exported. PARTIAL: proves Effect-to-OTLP parenting; does not prove the `@effect/opentelemetry` bridge.
- **08c.** `PrometheusMetrics.format({prefix: "bridger"})` after updating a counter by 3 produced a `# TYPE ... counter` line and a `plugin_loads_total ... 3` sample; `layerHttp` is exported. READY.

### SPK-05-09 In-process evaluation

`new Function("return typeof process + ':' + typeof require + ':' + typeof fetch")()` returned a string starting with `object`; code run through `new Function` also set a global. GAP as an isolation mechanism, as expected; confirms loader ADR-005 (a `vm` context or frozen realm is rejected). Test `SPK-05-09c`. Cloudflare checks are discussed in section 7.

## 4. Surprises and gotchas

1. SIGTERM exits 130, not 143. Both signals map to interruption.
2. `kill()` and scope close wait forever on a SIGTERM-ignoring child unless `forceKillAfter` is set. Graceful-then-forced needs explicit configuration.
3. Setting `env` drops `PATH` and everything else unless `extendEnv: true`; but `extendEnv: true` leaks the parent's whole environment, including any secrets, to the child.
4. Redacted is a parent-side display guard only.
5. `fs.watch` on macOS lost events: no Create for a renamed-in file; one Update on the directory stood in for several writes.
6. `resolveWithin` returns `Some` for a symlinked escape. A result of `Some` is not a safety proof.
7. Tar and Zip decoders return what the archive says, including `..`, absolute paths, symlinks, setuid. The Tar encoder does not sort, so "deterministic" holds only for fixed input order.
8. Tar decoder trusts `header.size`; the failure for a lying size appears later as `Truncated`.
9. Tar and Zip bodies must be consumed inside the entry stream; `Stream.runCollect` on entries then reading bodies fails with `BodyConsumed` (source).
10. Zip entries streamed without size have no `header.size`; count bytes yourself.
11. `Ndjson.decode` has no default line cap; Csv has 1 MiB; Xml limits are optional.
12. Yaml has no options at all and the merge key cannot be disabled.
13. `Digest.digest` needs the whole buffer in memory.
14. The checkout at `../effect` lacks Tar, Zip and others; read `spikes/node_modules/effect/src` instead.
15. Stream-style APIs here use `Stream.pipeThroughChannel`; a `Latch` helper I first guessed at (`Effect.makeLatch`) does not exist in this version, so the watch test uses a plain promise.

## 5. Missing pieces (Bridger must build)

**atomicWrite and tmp sweep.** Sketch: `atomicWrite(path, bytes)` writes `path.<pid>.<random>.tmp` in the same directory (same filesystem is required for rename), opens it, writes, `sync`s the file, renames over the target, then fsyncs the directory (open the directory read-only and `sync`; not tested here). `sweepTmp(dir)` runs at host start before admission and removes files matching the temp naming convention older than the start time. Acceptance: kill the process between write and rename (the spike's simulated crash) and assert old content plus one sweepable temp.

**Symlink-safe resolve.** Sketch: `resolveSafe(root, input)` = `resolveWithin` for the lexical check, then `realPath` the longest existing prefix of the result and require it to equal or be under `realPath(root)`; for writes, create parents one segment at a time with `lstat` checks, or open with `O_NOFOLLOW` on the final component (inference, not tested). Extraction should also refuse symlink and hardlink entries outright (validator rule 1), which removes the main way for archive content to create links.

**Sorted bundler.** Sketch: the `buildBundle` in `bundle.ts`: byte-order sort on UTF-8 paths, fixed mode, uid/gid 0, epoch mtime, no PAX extras, forbid `Directory` entries or emit them in sorted order. Tests: two runs plus shuffled input equal bytes. Document that archive bytes are not the package digest; `packageDigest` is.

**Entry validator and caps.** Productize `violation` with the nine rules above, counted extraction totals, a per-plugin policy for caps, and an error type naming the failing entry. Run it before extraction on the header stream and again on actual bytes written.

**External runtime for untrusted plugins.** Effect gives process control, not containment (SPK-05-02e). Sketch (inference, nothing here tested): the remote adapter launches the guest in an environment that restricts it: a container or microVM with a read-only root, no network or an egress allowlist, and a single mounted plugin directory; or Node's `--permission` flags with explicit fs and net grants; or an isolate runtime. The adapter keeps only transport (stdio or socket carrying NDJSON with `maxLineBytes`), env minimization (explicit allowlist, never `extendEnv: true`), `forceKillAfter`, and a scope that ensures kill on host shutdown. This matches ADR-RM-006: isolation comes from the host environment, not Bridger.

**Parser policy.** Always pass `maxLineBytes` to Ndjson on guest streams, limits to Xml, a size cap before `Yaml.parse`, and a key blocklist (`__proto__`, `constructor`, `prototype`) in manifest validation. Do not parse untrusted manifests as YAML.

**Shutdown deadline.** Wrap host teardown in a timeout so a stuck finalizer cannot hold the process indefinitely.

## 6. Fix and improve list by owner

**bridger-spec**
- must (02e, 09b): state that out-of-process is not isolation and that untrusted plugins require an external runtime; already the direction of ADR-005 and ADR-RM-006, make the runtime requirements concrete.
- should (02b): specify env passing for guests: explicit allowlist, no inherited environment, per-plugin scoped secrets.
- should (07d): specify JSON only for manifests; no YAML for untrusted input.
- nice (01): record the exit code (130 for SIGTERM and SIGINT) in operational docs.

**bridger-code**
- must (04, 05): entry validator, caps, sorted bundler, refuse links and setuid; count bytes at extraction.
- must (03f): symlink-safe path resolution.
- must (02c): set `forceKillAfter` in every spawn.
- must (07a): set `maxLineBytes` on every NDJSON stream from plugins.
- should (03a): `atomicWrite` plus startup tmp sweep.
- should (01): shutdown timeout around finalizers.
- should (03d): treat `fs.watch` as a hint: debounce, re-scan, re-digest.
- should (06a): streaming digest for large bundles.
- should (07e): reject prototype-pollution keys in manifests.
- nice (07f): pass Xml `maxDepth` and `maxTokenSize`.
- nice (06b): keep `packageDigest` as the reference implementation and add cross-implementation test vectors.

**effect-upstream**
- should (07a): safe default for `Ndjson` `maxLineBytes`.
- should (07d): `Yaml.parse` options (max depth, aliases, input size, merge off).
- nice (02c): optional default escalation for `forceKillAfter`; document the 130 exit code.
- nice (03a): an atomic write helper in `FileSystem`.
- nice (06a): a streaming digest in `crypto/Digest`.

**qadi, awthaq**
- None from this area. Inference: if signature verification of the package digest needs key material, that belongs to spike 06 and the awthaq/qadi spikes, not here.

## 7. Not verified

| Item | Why | What it would take |
|---|---|---|
| Linux behaviour (watch events, process groups, `setsid` escape) | Only macOS was available | Run the suite on Linux (CI container); add a `setsid` grandchild test |
| Windows (`taskkill`, path semantics, case folding) | Not available | Windows runner; expect different kill and watch results per source docs |
| `@effect/opentelemetry` `NodeSdk.layer` with an in-memory exporter, Effect span to OTel span parentage via the SDK | OTel SDK peers not installed; root `package.json` was off-limits | Add `@opentelemetry/api`, `sdk-trace-base`, `sdk-trace-node`, `sdk-metrics`, `resources` (versions per the package's peer ranges) to the spikes root, then write the in-memory exporter test (SPK-05-08a) |
| Deflate determinism across zlib versions or machines | One machine, one Node | Build the same zip on several Node versions and platforms and compare hashes; or avoid by using Store or tar |
| Directory fsync durability, power-loss behaviour | Needs fault injection | Fault-injecting filesystem or VM crash test |
| Binary file contents in `packageDigest`, cross-implementation vectors | Spike used text files and one implementation | Add binary vectors and a second implementation |
| NDJSON unterminated-stream memory use under the default | Capped test only | Run a bounded-memory process against an endless line |

Cloudflare: out of scope, not a Bridger requirement, and not a blocked item. My earlier claim that `@effect/platform-cloudflare` does not exist was wrong in substance. What I observed: it is not installed in `spikes/node_modules`, and no cloudflare package is in the local `../effect/packages` checkout (which lists only browser, bun, deno, node, node-shared under platform). The coordinator reports that `@effect/platform-cloudflare@4.1.4` exists on npm; I did not verify that and the package was simply not installed. The test `SPK-05-09a` asserts non-installation only, and `SPK-05-09b` found no Worker Loader, KV or R2 bindings in `effect/src` (it matched a few comment mentions in files such as `Scheduler.ts`, which I did not read in detail). RESULT.md rows SPK-05-09a and its "BLOCKED" verdict should be read with this correction.

## 8. Reproduction notes

- `cd /Users/mohammadalmechkor/Projects/Perso/Bridger/spikes && npx vitest run 05-platform-packaging`. Add `--reporter=verbose --silent=false` to see logged values (zip CRC message, unsized zip entry size, watch events, Yaml results).
- Needs Node 22+, loopback networking (tests start local HTTP servers on random ports), and permission to spawn `process.execPath`. Tests use `os.tmpdir()` temp dirs and remove them.
- Timing-sensitive tests: `runmain` waits for a `READY` marker; the kill test waits 1 s for a hang and 300 ms after scope close; watch waits 600 ms. On a slow machine the watch and process-death waits may need raising.
- The watch result (3 events) is macOS-specific; the assertion is `length < 5` and no `Create:q.tgz`, which may fail on Linux.
- Type-check: `npx tsc --noEmit -p .` from `spikes/`.
- No packages were installed and no files outside `spikes/05-platform-packaging/` were changed by the spike run. This document is the only file written outside that directory.
