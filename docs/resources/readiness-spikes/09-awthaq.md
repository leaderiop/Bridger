# Spike 09: awthaq (authentication) against Bridger identity and plugin needs

Date of runs: 2026-11-14. All statements marked "Observed" come from a test in `spikes/09-awthaq/` that passed when run. Statements marked "Source" come from reading awthaq code or docs and were not exercised. Statements marked "Inference" are my reading.

## 1. Purpose and scope

This area answers whether awthaq can carry Bridger's identity layer and how it relates to Bridger's plugin host. Bridger needs it for:

- `docs/ERP-IDENTITY.md`: users, tenants, companies, sessions, service accounts, device or terminal login, API keys, impersonation, `Identity.awthaq` request context (section 3), subject construction (section 6), HTTP assembly (section 8), decisions 4 and 5 (service principals, SCIM).
- `docs/ERP-ACCESS.md` and the qadi wrapper contract (identity to principal to qadi subject).
- `references/core` (plugin model: leases, generations, states, reconcile), `references/loader`, `references/federation` (offline hosts, manifest-carried keys), `references/remote` (remote hosts that authenticate), `references/audit-chain` and `references/core/behaviors/23` (AuditSink and AuditRecord).

awthaq (sibling repo `/Users/mohammadalmechkor/Projects/Perso/awthaq`, "Effect Native Auth") is an authentication runtime on Effect v4. It resolves "who is asking" into a `Principal`; authorization is delegated to qadi through `@awthaq/qadi`. Source: private, unpublished, version 0.1.0, packages core, api, server, sql, ports, qadi, test, plus plugins password, oauth, passkey, jwt, api-key, organization, roles, admin, scim, device-authorization, magic-link, two-factor, saml, webhooks. Its `spec/` is canonical. Source: awthaq README and `spec/overview.md`.

Out of scope: Cloudflare, awthaq's React/Next packages, the migrate-* packages.

## 2. Environment and method

- Workspace: `/Users/mohammadalmechkor/Projects/Perso/Bridger/spikes`, effect 4.1.4, `@effect/sql-pglite` 4.1.4, `@effect/platform-node` 4.1.4, vitest 5.1, Node 26.
- awthaq: dev catalog `effect ^4.1.2` (installed 4.1.2), peer range `^4.1.0`. Source: `awthaq/pnpm-workspace.yaml`. Its pnpm store also holds an older `effect@4.0.0-rc.116` (cucumber tooling) and published `@qadi/core` and `@qadi/http` 0.12.0 built against `effect@4.1.2`. The qadi repo checkout is also 0.12.0.
- awthaq code is imported by relative path from the built `lib/` of each package (`../../../awthaq/packages/<pkg>/lib/index.js`) and from `awthaq/examples/memory-server/app.ts`. The `lib/` builds were dated 2026-11-09, `src/` 2026-11-14; I used `lib/` consistently to avoid mixing.
- Per-area vitest config is ignored when running `npx vitest run 09-awthaq` (root config is used), so aliasing in a local config was not an option.

### The dual-copy hazard (observed)

awthaq resolves effect 4.1.2 from its own `node_modules/.pnpm`. The root config has `resolve.dedupe: ["effect"]`, which collapses awthaq code that Vite inlines (verified by comparing class prototype chains) but not packages Vite externalizes (`@qadi/*`, `@effect/*` under `.pnpm`); those load through Node and keep effect 4.1.2.

Effect of two copies: the memory-server app builds, then the first request returns an empty-body HTTP 500 with nothing logged, even with a pretty logger. No error text is produced. The same happened to a Bridger group with `Api.Authentication` in SPK-09-07. Other areas (SQL, JWT, audit) still passed with two copies, so the failure is partial and hard to attribute. Inference: service identity matches by string key but class/prototype checks (middleware, schema classes) differ across copies.

Mitigation: `effect-copies.ts` registers a `node:module` `registerHooks` resolve hook that rewrites any file URL under `.pnpm/effect@*/node_modules/effect/` to `spikes/node_modules/effect/`. It also records which effect roots Node loaded. With the hook on, the loaded set is exactly `Bridger/spikes/node_modules/effect`. `SPIKE_DEDUPE=0` disables the rewrite: then SPK-09-01, 02 and 07 fail (3 of 23).

Type level (observed): `tsc --noEmit` reported type mismatches because awthaq `.d.ts` bind their own effect 4.1.2 types (for example `typeof Users` not assignable to `Context.Key`). All 09-awthaq files carry `// @ts-nocheck` for that reason; with it, `tsc` reports no errors from 09-awthaq or awthaq sources (errors reported from `../../qadi` belong to another area).

### How to run

```
cd /Users/mohammadalmechkor/Projects/Perso/Bridger/spikes
npx vitest run 09-awthaq            # 9 files, 23 tests, all pass
SPIKE_DEDUPE=0 npx vitest run 09-awthaq   # shows the dual-copy failures
```

Passing tests do not print console output (vitest root config); failures do.

### File map

| File | Role |
|---|---|
| `effect-copies.ts` | Node resolve hook: rewrite awthaq's effect onto ours, record loaded roots. Import first in every test file. |
| `mem-harness.ts` | `makeMemApp(built, services)`: memory-backed `AuthHost.layer` with the memory-server example's ports (argon2id hasher, console mailer, memory rate limiter, direct client address, ephemeral key, no-breach HTTP client, NodeCrypto). |
| `sql-harness.ts` | Password+Organization over SQLite (awthaq's own sql-sqlite-node 4.1.2) or PGlite (ours), `migrations:"apply"`. |
| `01-runtime.spike.test.ts` | SPK-09-01, 02. |
| `02-identity.spike.test.ts` | SPK-09-21, 22. |
| `03-plugin-model.spike.test.ts` | SPK-09-03, 04, 05 (uses the host-core prototype from `07-core-primitives/host-core-4.1/src`). |
| `04-sql.spike.test.ts` | SPK-09-06, once per dialect. |
| `05-http.spike.test.ts` | SPK-09-07, 08, 09. |
| `06-jwt-offline.spike.test.ts` | SPK-09-10, 11, 12. |
| `07-qadi.spike.test.ts` | SPK-09-13, 14, 15. |
| `08-security.spike.test.ts` | SPK-09-16, 17, 18. |
| `09-audit.spike.test.ts` | SPK-09-19, 20. |
| `RESULT.md` | Verdict table. |

## 3. Findings

### SPK-09-01: does awthaq run on effect 4.1.4

Need: ERP-IDENTITY section 1 (awthaq is the authentication owner; Bridger targets latest effect 4.x). Test: boot `makeAppLayer` from the memory-server example (Password, Organization, Roles, RolesAdmin, qadi guard) under our effect, sign up through `TestAuth.withApp`, check status 200, session cookie, and `Users.findByEmail`. Observed: passes with one effect copy; with two copies the sign-up returns an empty 500 (section 2). No API break between 4.1.2 and 4.1.4 was found in the paths exercised. Verdict PARTIAL (version fine, install story fragile). Evidence: `01-runtime` "SPK-09-01". Caveat: awthaq's own test suite was not run on 4.1.4 (section 7).

### SPK-09-02: version pins and copy hazard

Observed: the workspace file pins dev `^4.1.2` and peer `^4.1.0`; the test asserts both and asserts the loaded effect roots equal our single copy. Verdict PARTIAL. Evidence: `01-runtime` "SPK-09-02". Caveat: the pins are read from the yaml, the peer range is for published packages which do not exist yet.

### SPK-09-03: awthaq tuple hosted as a Bridger plugin

Need: references/core plugin model (BEH-BR-001 definition, activation by Layer build, removal closes scope, replace). Tested with the host-core prototype (`Host.make`, `define`, `install`, `use`, `replace`, `remove`, `snapshot`, `awaitIdle`).

The adapter (observed to work):

```
define({
  id: "awthaq",
  requires: [],
  provides: [Users.Users, Sessions.Sessions],
  build: Layer.merge(
    makeMemApp(Auth.make(tuple), configLayer),          // AuthHost.layer over memory records + ports
    Layer.effectDiscard(Effect.addFinalizer(...)))      // proves scope == activation
})
```

Observed behaviour:
- `install` then `awaitIdle`: state `active`; `host.use(Users.Users, u => u.create(...))` returns a user.
- `replace` with a new definition holding `[Password, Jwt]` (plus `JwtConfig.config`) makes the old scope close (finalizer ran once) and the new one active. The memory users created before are gone (no handoff), `findByEmail` returns `None`.
- `remove` closes the scope (finalizer count 2); a later `host.use` fails with the host's failure (checked as a failed Exit, not the tag).

Integration seams (Source for the awthaq side, observed for the use):
1. awthaq layer = Bridger activation (the layer's lifetime is the plugin scope).
2. awthaq `ports` (declared on each plugin, listed in `manifest.ports`) = Bridger `requires`; the app provides Mailer, PasswordHasher, RateLimiter, Encryption, SqlTransaction, ClientAddress, HostResolver.
3. awthaq `exposes` and core services (`Users`, `Sessions`) = Bridger `provides`.
4. `dependsOn` orders awthaq plugins inside the tuple only.
5. `migrations` and `tables` (per plugin, plugin-id prefixed) map to Bridger storage ownership.
6. `contract` groups (HttpApi) map to the route registry (see SPK-09-08).
7. `events` (manifest lists 80 events in the 10-plugin composition I printed) map to the event bus and audit sink.

What awthaq lacks versus the Bridger host (SPK-09-05 asserts the absent statics): per-plugin state machine, leases and drain, generations, health checks, handoff, reconfigure, remove/enable/disable, version and digest labels. A plugin tuple is static: `Auth.make` folds it once. Adding or removing one awthaq plugin means replacing the whole composition. Verdict PARTIAL: hosting works as one coarse Bridger plugin; awthaq plugins are not individually Bridger plugins. Evidence: `03-plugin-model` "SPK-09-03". Caveat: the host-core prototype is a throwaway, not the specified core; leases were not exercised against an in-flight awthaq request.

### SPK-09-04: shared SqlClient and transaction

Need: ERP-IDENTITY section 2 storage note (awthaq SQL supports PostgreSQL and SQLite; on other dialects no shared transaction). Test: a PGlite `SqlClient` built once and given to the host as a base service; the plugin requires `SqlClient` and builds `makeSqlApp(Layer.succeed(SqlClient, c))`. Observed: activation applies migrations; inside `client.withTransaction`, a business `insert` plus `Users.create` followed by a failure rolls back both (the business table has 0 rows, the awthaq user is `None`); the committed users survive `replace` because storage is the host's. Verdict READY. Evidence: `03-plugin-model` "SPK-09-04". Caveats: `migrations:"apply"` runs on every activation (Source: `AuthHost` option docs recommend `"verify"` plus a deploy step); only the Users write was tested inside the transaction, not session issuance.

### SPK-09-05: seam inventory

Observed: static members present on `Password.Password`: id, dependsOn, migrations, tables, contract, layer, ports; absent: state, lease, generation, health, handoff, reconfigure, remove, activate, deactivate, stop. `Auth.make` returns `layer, api, manifest, migrations, tenancy, sealedColumns, userFields, events`. Verdict GAP (against the Bridger lifecycle vocabulary). Evidence: `03-plugin-model` "SPK-09-05". This is a characterization, not a failure of awthaq.

### SPK-09-06: SQL over SQLite and PGlite

Test: `AuthHost.layer` with `records:"sql"`, `migrations:"apply"`, on SQLite (`:memory:`) and PGlite; list tables, sign up, create a business table in the same database, run `Migrations.status([])` as a second pass. Observed on both: `organization_org` and more than 8 tables exist after build; sign-up returns 200; `status` returns 2 ledgers. Verdict PARTIAL. Caveats: `@effect/sql-sqlite-node` is not installed in `spikes/node_modules` (the package.json lists it), so SQLite ran on awthaq's own 4.1.2 copy through the effect rewrite. Source: awthaq `TestSql.ts` documents a `regclass` codec hazard for sql-pg rc.116 on a second migrator run; not hit on sql-pglite 4.1.4 (the second pass above succeeded). Evidence: `04-sql` both tests. Postgres proper was not run.

### SPK-09-07: HTTP, cookie and bearer, shared router

Need: ERP-IDENTITY section 8 (HTTP assembly, cookie mode, bearer exempt from CSRF). Test: a Bridger `HttpApiGroup("erp")` with `Api.Authentication`, `Api.CsrfProtection`, `Api.RequestContext` in `HttpApi.make("auth")`, layered through `HttpApiBuilder.layer` plus `AuthHttp.middlewareFor(api, {csrf})` and provided on top of the memory app. Observed:
- Group middleware order matters: without `RequestContext` the request fails with a defect.
- The Bridger middleware layer needs `ClientAddress` and `SecureRandom`, which the example keeps private; the test supplies `ClientAddress.layerDirect` and `NodeCrypto.layer`.
- Cookie: `GET /erp/session` returns principal `_tag` "User". Bearer: the same opaque value from the `__Host-session` cookie (`<id>.<signature>`) as `Authorization: Bearer` also yields "User" with no cookie jar. No credential: 401.
- `GET /session` body has no `tenantId` or `companyId`.
Verdict READY. Evidence: `05-http` "SPK-09-07". Caveats: the API id must be the literal `"auth"` (Source: `middlewareFor` signature).

### SPK-09-08: collision with Bridger's route registry

Observed: adding a Bridger endpoint `POST /password/sign-in` beside awthaq's does not fail at build; the first request throws `Method 'POST' already declared for route '/password/sign-in'`. awthaq paths are unprefixed (`/password/*`, `/session`, `/jwt/*`, `/api-key`). Source: `AuthHost` options have `tier`, `openapiPath`, `docsPath`, no prefix. The Effect router has no remove (Source/other area SPK-04 findings). Verdict GAP. Evidence: `05-http` "SPK-09-08". Caveat: I did not test mounting awthaq under the 04 catch-all registry; Inference: it would need a prefix or the registry to pass unprefixed paths.

### SPK-09-09: OpenAPI

Observed: `OpenApi.fromApi` on the Bridger contract lists `/erp/session` and has at least one security scheme. Source: awthaq can serve its own document and Scalar page at `openapiPath` and `docsPath`, off by default and unauthenticated. Merge across contracts not tested. Verdict PARTIAL. Evidence: `05-http` "SPK-09-09" (weak assertion).

### SPK-09-10: offline verification and the lite verifier

Need: federation (hub or terminal verifying without the cloud), ERP-IDENTITY decision 4.
Test: sign up, `POST /jwt/token`, fetch `GET /jwt/jwks`.
Observed:
- Claims: iss, aud (both the configured issuer), exp, iat, jti, sub, sid, amr, auth_time. Header `alg` EdDSA (Ed25519), `typ` at+jwt. No tenant or company claim. Source: `JwtConfig.definePayload` can add claims.
- `JwtCodec.verify` with keys pinned from the JWKS: succeeds with no HTTP and no awthaq runtime; a token with a changed signature tail is refused.
- `Verify.makeVerifier` against a stub client: first verify fetches JWKS; with the endpoint failing, verification succeeds while the cache is valid (`cacheTtl` set to 150 ms in the test; Source: default 10 minutes); after expiry with the endpoint down it fails with a `jwks fetch failed` reason. No stale-if-error.
- JWKS response header `cache-control: public, max-age=600`.
Verdict PARTIAL. Evidence: `06-jwt-offline` "SPK-09-10". Caveat: the test used the cloud-side library as the signer; no real terminal.

### SPK-09-11: key rotation

Observed: `KeyRing.rotateNow()` (needs `SecureRandom` in context; the test provides NodeCrypto) gives the next token a new `kid`; the JWKS then lists both kids. A verifier with a cached pre-rotation JWKS and the endpoint down still verifies the old token and fails on the new one (unknown kid, refetch fails). Source: `keyGracePeriod` default 30 days, must be at least `ttl` (checked at layer build), emergency path `rotateNow({gracePeriod: Duration.zero})` and `KeyRing.revoke(kid)`. Verdict PARTIAL. Evidence: `06-jwt-offline` "SPK-09-11". Caveat: grace period behaviour beyond "both published" not timed.

### SPK-09-12: revocation latency

Observed: token `exp - iat` is 900 seconds by default. After `Sessions.revoke(sid, "admin")`, `Jwt.verify` (stateless) still succeeds; `Jwt.verifyLive` fails (it needs `Sessions`, so online). Source: `RevocationStore` is a jti denylist consulted by `introspect`; I found no code that writes to it when a session ends (Inference: nothing calls `revoke` automatically). Source: `acceptAsBearer` defaults to false. Verdict GAP for a kill switch without the cloud. Evidence: `06-jwt-offline` "SPK-09-12".

### SPK-09-13: identity to principal to qadi subject

Need: ERP-IDENTITY section 6, ERP-ACCESS. Observed (`07-qadi`):
- `SubjectResolver.resolveIdentityOnly` for a User principal returns id `user:<id>`, no roles, no permissions, attributes `amr`, `aal`, `restrictedFactor` and `actingAs` when impersonating. ApiKey principals map scopes shaped `resource:action` to permissions and drop others; id `apikey:<id>`.
- Over HTTP with a group using `withAuthorizedSubject` and a handler calling `check(hasPermission(todo:read))`: the default resolver denies; a Bridger resolver (a Map of grants to `fromRoles`, attributes `tenantId`, `companyId`) allows and the handler sees `companyId`.
Verdict READY. Caveat: qadi was `@qadi/core` 0.12.0 from awthaq's pnpm store, with `EvaluationServicesNone`; no attribute resolvers, relationships or obligations.

### SPK-09-14: Bridger replaces the SubjectResolver slot

Observed: `Slots.override({id:"bridger.identity"}, SubjectResolver, Effect.succeed(impl))` in the host `services` layer takes effect; `AuthorizedSubjectLive` must sit above it to read it (built over the composed output). Verdict READY. Evidence: `07-qadi` "SPK-09-14" (shares the HTTP test with 13).

### SPK-09-15: Roles plugin and the slot

Observed: Bridger override plus `Roles.Roles` fails at layer build with `SlotConflict`: `awthaq: slot "awthaq/slot/SubjectResolver" is overridden by both "bridger.identity" and "roles"`. The failure surfaces only when the layer is built (first use), not at `Auth.make`. ERP-IDENTITY section 6 proposes mixing platform roles into the Bridger subject. Verdict GAP. Evidence: `07-qadi` "SPK-09-15".

### SPK-09-16: password hashing port

Observed: `PasswordHasher.layerArgon2id` produces `$argon2id$v=19$m=19456,t=2,p=1$...`, accepts `Redacted` input, verify succeeds. Source: implemented with `hash-wasm` (WASM, not native), env knobs `AUTH_ARGON2_MEMORY_KIB`, `_ITERATIONS`, `_PARALLELISM`; scrypt fallback; verify caps stored parameters; a worker pool port exists. Verdict READY. Evidence: `08-security` "SPK-09-16". Caveat: timing and worker pool not measured.

### SPK-09-17: rate limiting

Observed: eight bad sign-ins in one app yield a 429 at some attempt; a second freshly built app (separate memory limiter) yields its 429 at the same attempt index, so each process has its own budget. Source: `RateLimiter.layerMemory` is per process; `RateLimiterStoreSql.layerStoreSql` gives a shared store; budget rules are declared per plugin (`rateLimits` in the manifest). Verdict PARTIAL. Evidence: `08-security` "SPK-09-17". The shared SQL limiter was not run.

### SPK-09-18: cookie, CSRF, secrets at rest

Observed: `Set-Cookie: __Host-session=<id>.<hmac>; Max-Age=2591999; Path=/; HttpOnly; Secure; SameSite=Strict`, no Domain. A cookie-authenticated POST (`/session/revoke-others`) without the CSRF header returns 403 with a `_tag`. `SessionStore.get(id)` returns a record whose `secretHash` is 64 hex characters and which does not contain the cookie signature; the user record does not contain the password. Session lifetime 30 days (expiresAt one month after issue, observed in the sign-up body). Verdict READY. Evidence: `08-security` "SPK-09-18".

### SPK-09-19: auth events into an append-only chain

Need: references/audit-chain, core behaviors 23 (AuditSink and AuditRecord). Observed:
- `AuditLog.list` rows contain eventTag, actorUserId, occurredAt, correlationId, traceId, spanId, ip, userAgent, tenantId, payload; no sequence number, no hash. Sign-up and a failed sign-in produced at least `auth.user.created` and `auth.session.issued`.
- `EventRelay.drainOnce` with a custom `EventTransport`: with `settleDelay` 60 s it delivers 0; with 0 it delivers the rows; a second drain delivers 0 (cursor persisted). Source: default `settleDelay` is 2 s.
- Each delivered event was linked with `AuditChain.link` (keyed HMAC-SHA256 over `prevHash\npayload`). `verify` passes on the full list; editing a payload is detected at that index; dropping the first link is detected at index 0; dropping the newest link verifies clean.
- `AuditChain.canonicalize` is `JSON.stringify` of an ordered array of strings and numbers, not RFC 8785 object canonicalization. The chain key config is `perDeployment`; verifying with a separately built chain layer failed in my first attempt (inference: config scoped to the app composition), so verification ran inside the app context.
Verdict PARTIAL. Evidence: `09-audit` "SPK-09-19". Caveat: "events carry identifiers only, no email" is Source (EventRelay header); not asserted.

### SPK-09-20: awthaq's own audit table as the record

Observed: after `AuditLog.pseudonymizeActor(userId)`, rows previously naming the user no longer do (count greater than 0 rewritten); `purge({before})` exists. Source: the AuditLog header states deliberately not hash-chained, for GDPR erasure; only admin impersonation records use `AuditChain`. Verdict GAP as an append-only source. Evidence: `09-audit` "SPK-09-20" (the purge assertion is weak; it only checks the call returns a number or fails).

### SPK-09-21: ERP-IDENTITY concepts versus awthaq plugins

Observed from `Auth.make([...]).manifest` for Password, Organization, Admin, Jwt, ApiKey, DeviceAuthorization, Scim (tables asserted), and Source for behaviour.

| ERP-IDENTITY concept | awthaq coverage | Status |
|---|---|---|
| Users, passwords | core `Users`, `@awthaq/password` | Covered |
| OAuth/OIDC sign-in | `@awthaq/oauth` (provider tokens sealed; Source) | Covered (not run here) |
| Sessions, cookie, CSRF | core `Sessions`, `@awthaq/server` | Covered (observed) |
| Tenant = organization | `organization_org`, membership, teams, roles; ambient `TenantContext` stamps rows (Source `Tenant.ts`; session has `tenantId`) | Covered (tenant stamping not run) |
| Tenant resolution by host | Bridger supplies it (per ERP-IDENTITY) | Not in awthaq |
| Company / legal entity | no table or concept (manifest tables checked against `compan|legal_entity`) | Not covered |
| Selected company per session | not present; session body has no such field | Not covered |
| Role grants per (actor, tenant, company) | awthaq `roles_assignments` and `organization_role` are platform and org roles | Partial (different model) |
| Service accounts | `apikey_client` (client credentials, service JWT) and API keys | Partial (no tenant/company) |
| API keys | `apikey_key`: owner user, scopes, expiry, rotation, revoke | Partial |
| Impersonation | `admin_impersonation`, `actingAs` on principal | Covered (principal field observed in SPK-09-13) |
| Device / terminal login | `device_authorization_grant` (RFC 8628, yields a bearer session) | Partial: online only |
| Offline terminal login | none | Not covered |
| SCIM | `scim_connection`, `scim_resource` | Covered (not run) |
| Auth audit | `AuditLog`, 80 event tags; no chain | Partial |
| 2FA, magic link, SAML, passkey | packages exist | Covered (not run); ERP-IDENTITY says unavailable, stale |

Verdict PARTIAL. Evidence: `02-identity` "SPK-09-21".

### SPK-09-22: API keys for plugins and remote hosts

Observed with Password, Jwt, ApiKey and a Bridger group using `Api.MachineAuthentication`: a signed-in user creates a key with scopes and expiry; the create response has no tenant or company field; `x-api-key` authenticates a principal `_tag` "ApiKey" with `scopes` exactly as granted and no tenant or company field on the principal; a scope outside `grantableScopes` returns an error status; rotation returns a successor and both keys work during the grace window; deleting the successor makes its next request 401. Source: `maxExpiresIn`, `defaultExpiresIn`, `rotationGrace` (default 24 hours) config; client credentials mint a service JWT with `serviceTokenTtl` default 15 minutes, which is the revocation lag for a revoked client. Verdict PARTIAL. Evidence: `02-identity` "SPK-09-22". Caveat: the client-credentials flow was not run.

## 4. Surprises and gotchas

1. The dual-copy failure is silent: an empty 500, no log. A single copy of effect is a hard prerequisite, at runtime and in types.
2. The `TestAuth.withApp` layer builds lazily: a layer failure (route collision, `SlotConflict`) appears at the first `app.run` or request, not at `withApp`.
3. Route duplicates are detected only at first request, as a defect.
4. Two Bridger middleware layers need awthaq ports that the example `AuthHost` composition does not export; a second `HttpApi` must get its own ports.
5. Group middleware order matters: `Authentication`, then `CsrfProtection`, then `RequestContext` last. `withAuthorizedSubject` applies a correct order for the qadi pair.
6. `KeyRing.rotateNow` and `Jwt` operations need `SecureRandom` in the effect context; `app.run` does not carry the app's ports.
7. The bearer value for sessions is the cookie value; there is no separate token.
8. `AuditChain` config is deployment-scoped; a chain built outside the app context does not use the app's key.
9. Console mailer prints verification tokens in logs; the memory-server key provider is ephemeral and logs a warning.
10. Users must verify their email before sign-in succeeds in the SQL example (Source: sql-server smoke test), not exercised here.
11. `ERP-IDENTITY.md` still cites `effect-auth` and says code was not executed.

## 5. Missing pieces (what Bridger must build)

Design sketches are inferences, not tested.

- **Companies and grants**: tables `bridger_companies`, `bridger_grants`, `bridger_session_context` as in ERP-IDENTITY sections 4 and 5, in the same database as awthaq so SPK-09-04's transaction sharing applies (member removal revokes grants in one transaction). Bridger subscribes to `auth.session.revoked`, `auth.organization.memberRemoved` through awthaq events or `EventRelay`.
- **Key to tenant and company binding**: table `bridger_key_binding(key_id, tenant_id, company_id, created_at)`, written in the same transaction as key creation (the owner is a service-account user). The resolver or the Bridger `Identity` adapter reads it by `ApiKeyPrincipal.ref.id` and sets `tenantId` and `companyId` attributes; narrowing scopes happens in the resolver (SPK-09-13 shows attributes are settable).
- **Offline terminal login**: awthaq has only an online device grant. Sketch: terminal credentials issued by the cloud as signed tokens whose public keys and revocation list ride in the federation manifest; the terminal verifies with `JwtCodec.verify` using pinned keys (SPK-09-10), with an offline credential store for the user table (PIN or token) kept by Bridger.
- **Revocation feed**: on session end or key revoke, the cloud publishes a signed list of `jti` or `sid` values; hubs and terminals apply it on sync (federation) and consult it beside the stateless verify. Bound the lag by shortening `ttl` (the 900 s default is the current worst case).
- **Append-only audit sink**: a Bridger `AuditSink` adapter over `EventRelay` that maps `PublishedAny` to `AuditRecord`, assigns its own gapless `seq`, canonicalizes with RFC 8785, chains via `references/audit-chain`, anchors externally, and stores pseudonymous ids with keyring-encrypted personal data so erasure does not break the chain.
- **Route mounting**: place awthaq's api behind the catch-all registry from spike 04 with a prefix (needs an awthaq option or a path rewrite).
- **Shared rate limiter**: wire `RateLimiterStoreSql` per tenant.
- **Sqlite dependency**: install `@effect/sql-sqlite-node` in the workspace if SQLite is a target.

## 6. Fix and improve list

### bridger-spec
- must: record awthaq as one Bridger plugin per tuple, tuple chosen at deployment (SPK-09-03, 05).
- must: specify that signing keys and the revocation list travel in the signed host manifest, and state the offline revocation latency (SPK-09-10, 11, 12).
- should: update `ERP-IDENTITY.md` (awthaq path, now executed, 2FA, magic link, SAML, passkey shipped) (SPK-09-21).
- should: resolve the Roles-plugin mix-in in section 6, which conflicts with an exclusive slot (SPK-09-15).
- should: say how audit copies relate to erasure (SPK-09-20).

### bridger-code
- must: one effect copy in the workspace, awthaq built in the same type program (SPK-09-01, 02).
- must: companies, grants, session context, key binding tables and the Identity adapter (SPK-09-07, 21, 22).
- must: audit sink with seq, canonical form and anchor (SPK-09-19).
- should: awthaq behind the route registry; supply ports to a second HttpApi (SPK-09-07, 08).
- should: production uses `migrations:"verify"` and shared rate limiter store (SPK-09-04, 17).
- nice: merged OpenAPI (SPK-09-09); install `sql-sqlite-node` (SPK-09-06).

### effect-upstream
- should: reject duplicate routes at `HttpRouter.add` or build time, not at first request (SPK-09-08).
- nice: a diagnosable error when a service from a second copy is used (SPK-09-01).

### qadi
- nothing needed from this area; SPK-09-13 and 14 worked with `@qadi/core` 0.12.0.

### awthaq
- must: a loud check at boot for a foreign effect copy (SPK-09-01).
- should: route prefix option in `AuthHost.layer` (SPK-09-08).
- should: chainable or composable `SubjectResolver` (SPK-09-15).
- should: stale-if-error option in the lite verifier (SPK-09-10).
- should: write `RevocationStore` on session end and publish a list (SPK-09-12).
- should: monotonic position on audit rows; export the host ports from `AuthHost` (SPK-09-19, 07).
- should: publish packages so they can be consumed (Source: map.md item, 0.1.0 unpublished).
- nice: emit an event on key rotation (SPK-09-11).

## 7. Not verified

- awthaq's own suites on effect 4.1.4. To verify: in a scratch copy of awthaq, bump the catalog to 4.1.4, install, run `pnpm test`. I did not run it, and was told not to edit awthaq.
- `@qadi/http` permission registration (`guardApi`, `PermissionRegistryLive`, `RequirePermission`). awthaq's own memory-server smoke test passes on 4.1.2 (observed once from `examples/memory-server`, 5 tests), but I did not run that guard on 4.1.4. To verify: add a guarded group from `RolesAdminApi` to a spike.
- Real Postgres (only PGlite and SQLite), tenant row stamping, OAuth, passkey, SAML, SCIM, webhooks, device grant flow, client credentials, impersonation runs, organization flows.
- Host leases against in-flight awthaq requests, and handoff.
- Merged OpenAPI across contracts; the `openapiPath` endpoint.
- Real offline terminals and a real clock for rotation grace.

## 8. Reproduction notes

- Run from `/Users/mohammadalmechkor/Projects/Perso/Bridger/spikes`: `npx vitest run 09-awthaq` expects 9 files and 23 tests passing. Use `SPIKE_DEDUPE=0` to reproduce the empty 500 (3 failures: SPK-09-01, 02, 07).
- awthaq `lib/` must exist (built 2026-11-09); the `@qadi/core` import in `07-qadi` uses the pnpm store path `awthaq/node_modules/.pnpm/@qadi+core@0.12.0_effect@4.1.2/...`, which changes if awthaq is reinstalled.
- Passed-test console output is hidden; to inspect, write to a file or make the test fail.
- `03-plugin-model` imports the 07 host-core prototype source; if that prototype changes, adjust the adapter.
- Timing tests in SPK-09-10 use real sleeps (about 250 ms).
- `@ts-nocheck` is required on all 09-awthaq files while awthaq types bind a different effect copy.
