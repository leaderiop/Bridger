# Decisions the findings force

Each decision is the user's to make. The recommendation follows what the spikes showed. Spike IDs refer to the area files.

| # | Decision | Options | Recommendation | Evidence |
|---|---|---|---|---|
| 1 | Source of truth for background jobs | (a) own `bridger_jobs` table; (b) Effect `PersistedQueue`; (c) persisted Cluster entities | (a). The Effect queue uses its own `effect_queue` table, whole-second retry delays, a 30 s exhausted-row sweep, and lacks tenant, priority, per-key serialization, replay and cancel. Use Cluster or `PersistedQueue` for delivery only | 02-06, 01-02 |
| 2 | Workflow engine | (a) `ClusterWorkflowEngine`; (b) the planned ERP-DB engine | Decide after the Cluster failure model. Cluster memoizes activities and survives restart (SQLite only tested), but version pinning is convention (`Order@1`) and workflow bodies replay | 01-06 |
| 3 | Scheduler | (a) `ClusterCron`; (b) own scheduler with a named lock | (a) first, with a Bridger ledger and the `latest` mode built on `CurrentScheduledTime`. Do it only after the failure model | 01-04, 01-05 |
| 4 | Receipts | Cluster dedupe vs Bridger tables | Bridger tables with fencing. Cluster only dedupes and delivers | 01-03, 02-02 |
| 5 | Durable bus | (a) EventLog; (b) Bridger bus with per-(origin, stream) sequence and hybrid logical clock | (b). Keep EventLog for offline sync only | 06-16..20 |
| 6 | Plugin HTTP routes | (a) rebuild the listener; (b) catch-all registry | (b). Rebuilding refused 39 requests in about 250 ms. The registry had zero failures under load | 04-02 |
| 7 | Untrusted plugin isolation | (a) in-process; (b) external runtime | (b). Neither `ChildProcess` nor `new Function` isolates. Cloudflare is out of scope | 05-02e, 05-09b |
| 8 | Entitlement | inside qadi vs `@bridger/entitlement` | Separate Bridger package. qadi evaluates decisions and never spends. Entitlement depends on qadi one way only | 08-06 |
| 9 | awthaq hosting | (a) one Bridger plugin per `Auth.make` tuple; (b) per-awthaq-plugin | (a) via a thin adapter. awthaq has no per-plugin state, lease, generation or reconfigure | 09-03..05 |
| 10 | Effect version policy | exact pin vs range | Exact pin to 4.1.4 for Bridger core, one copy enforced for qadi and awthaq. Upgrade the prototype pin now (no source changes needed) | 07-01, 08-01, 09-02 |
| 11 | Postgres in CI | PGlite only vs a real server | A real server before any release. PGlite hides locking and ordering behaviour | 02, 01 |
| 12 | Secrets in schemas | `Redacted` vs a Bridger `Secret` | `Secret` that always sets `disallowJsonEncode` | 03-06 |
| 13 | Canonical JSON | adopt a library vs own | Own small module with conformance vectors. A ~20-line version passed RFC 8785 section 3.2.3 vectors | 03-10 |
| 14 | Money | `BigDecimal` directly vs `Money` type | `Money` with currency and allocation; ban `fromNumber` and `scale()` | 03-08 |
| 15 | Host event bus strategy | bounded, dropping, sliding | Sliding or dropping. A bounded `PubSub` stalls publishers behind a slow subscriber | 07-10 |
| 16 | Snapshot streaming to the UI | every revision vs latest-wins | Build latest-wins coalescing. Atom and `SubscriptionRef` deliver every revision | 04-10, 07-12 |
| 17 | Cron overlap and catch-up | defaults vs explicit | Explicit per job: `onDstOverlap` and catch-up mode | 06-28, 06-29 |
| 18 | Cluster adoption timing | now vs after prerequisites | After the failure model ADR and a real Postgres run. The transaction join is proven, but poison handling, failover timing and SQL Server support are open | 01 |
