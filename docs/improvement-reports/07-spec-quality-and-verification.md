# 07 - Specification quality, traceability, formal guarantees and verification

**State (2026-11-22):** the original review is kept as written below. All 13 findings and 8 recommendations were checked against the specification and the prototype; 5 findings or recommendations were partly wrong in their premise or already built by reports 01, 04 and 05 (the transition ledger, the generated catalogs, the effect pin), and all are resolved in `references/*`, `prototypes/host-core` and the verifier scripts (see Resolution status). Not built: a second implementation for differential testing, and an independent assessment of what each invariant leaves unchecked.

## Resolution status (2026-11-22)

Corrected facts: the prototype names 40 of 187 invariants and 399 of 1,054 behaviours (not 2 and 223); host-core is on effect 4.1.5; the full test run is 994 tests in 143 files.

| Finding | Rec. | Verdict | As built |
|---|---|---|---|
| F1 | R1, R8 | True, resolved | Every one of the 52 core invariants now carries a `Check` block (`predicate`, `scope`, `evidence`, `status`, `unchecked`) after its prose. `predicate` names a function of `references/core/formal/model.ts` (`legal`, `inv017`, `inv022`, `inv023`, `inv030`) where one exists and reads `none` otherwise (INV-BR-009, INV-BR-016 have no predicate). `verify-invariants.py` lints the blocks. The other 14 trees (135 invariants) carry blocks too, generated from each invariant's title, its evidence and any residual its own text names: `predicate` is `none` and `scope` repeats the title, so they are lint-clean but thin. |
| F2 | R3 | True, resolved | `process/change-control.md` §1 now requires, for a MUST on a shared primitive, a callers table (`callers.sh "<name>" --md`) and an outcome matrix (operation x state, each cell cited or "n/a because"), one scenario id per High and no spec edit landing in the round it is audited without the matrix. |
| F3 | R2, R8 | Partly wrong, resolved | The counts were stale: the prototype names 40 of 187 invariants and 399 of 1,054 behaviours across the trees (core: 10 of 52 INV, 244 of 327 BEH). `appendices/correspondence.md` is generated (`gen-correspondence.mjs`), `--check` fails on a dangling id or a fall in coverage, and traceability §2 gains a generated Prototype evidence column. |
| F4 | R5 | Partly wrong, resolved | host-core was already on effect 4.1.5 (spikes 4.1.4); `RESULTS.md` still said 4.0.0 and "behaviours 01-09" and is corrected. Coverage is the generated table, not prose. `check-drift.mjs` (`verify-spec.sh --since <rev>`) fails when a behaviour the prototype names changes with no prototype change and no `prototype-exempt:` line. |
| F5 | R4 | True, resolved | `test/pbt/` (fast-check 4.11, seed pinned, `BRIDGER_PBT_SEED` to explore): confluence over install/remove/enable/disable/restart with shrinking, LIFO revert, drain bound under TestClock, audit chain, reconcile idempotence. The hand LCG `confluence.test.ts` is removed. Each property was shown to fail, with a shrunk counterexample, under a seeded host bug. |
| F6 | R1 | True, resolved | BEH-BR-160 listed exclusions but never defined the settled state. It now defines it: `quiescent` (disabled by flag, active as the least fixed point of "every required service has an active provider in its realm's scope", waiting otherwise with the missing services; a child exists while its parent is active). The model states it and the host is compared with it over 300 random histories. |
| F7 | R6 | True, resolved | `split-history.py` keeps a Document Control cell to 2,000 characters: 116 cells over the limit, 957 lines moved whole to `<tree>/CHANGES.md` (15 trees), each cell ending with a link to its section; `--check` enforces it. `gxp/traceability.md` is exempt (its cell is written by `gen-traceability.py`). |
| F8 | R6 | Partly wrong, resolved | Error catalog, event modes and guide code fences were already generated or verified by reports 04 and 05 (`verify-events.sh`, `verify-errors.sh`, `doc-typecheck.sh`). New: `verify-risk-rows.py` regenerates the Controls cell of every risk row in traceability §7 from the risk entry and the behaviours' own `Risk:` fields (60 rows changed; 7 controls no source names were dropped: BEH-BR-337 on RSK-BR-013, BEH-BR-248 on RSK-BR-017, BEH-BR-323 to 326 on RSK-BR-033, INV-BR-031 on RSK-BR-010). The glossary has no id tags, so there is nothing to check there. |
| F9 | R3 | True, resolved | `callers.sh <name> [--md]` lists every behaviour and invariant in the 15 trees whose text names a primitive (54 sections name `WouldDeadlock`); it is the callers table a CCR attaches. |
| F10 | R7 | True, resolved | `specforge.json` and `spec/hello.spec` deleted; the decision is recorded in `docs/SPECFORGE-ASSESSMENT.md` §7a. Option 3 (a generated projection) is not built. |
| F11 | R2 | Partly wrong, resolved | Scripts already existed for core, companions, events, gxp and kit; what was missing was one entry point. `verify-spec.sh [--since <rev>]` runs all of them plus the correspondence, invariant, history and risk-row checks (gate D6 in the definitions of done). CI is `.github/workflows/verify.yml`: tsc, the full suite and `verify-spec.sh` (with `--since` on pull requests); it ran green on GitHub Actions for commit 8be3fa3 (run 45059503960). |
| F12 | R4 | True, resolved | `fast-check` added to host-core devDependencies. |
| F13 | R3 | True, resolved | The rule exists now (change control §1). Round-9 Highs and their executable scenarios: H1 core check 89 and the model's wait-for scenario; H2 federation check 14 (extended here) with `test/federation-durable.test.ts`, which also exposed and fixed a prototype gap (a freshness re-apply did not re-verify or disable `requiresFresh` entries); H3 agent check 10 (`makeReplay`), H4 sequence check 11 (`makeSeriesNode`), H5 and H6 event-store check 18 (`makeSwapReads`), all in `test/h3h6-scenarios.test.ts`. Those three are minimal slices written for the scenario, not the full subsystems. |
| R1 | - | Partly wrong, resolved | `transitions.yaml` already was the single source of both legality tables (report 01, R10), so the model imports it and does not copy it. Built: `references/core/formal/model.ts` (pure): `legal`, `flight`, `quiescent`, `waitCycle`/`inv030`, `takeOverWaits` (the round-8 take-over rule closes a cycle through the slot, the fixed rule does not), `inv017`, `inv022`, `inv023`; `appendices/formal-model.md`. Progress is not modelled (stated). |
| R2, R5 | - | Resolved | See F3, F4, F11. |
| R3, R4, R6, R7, R8 | - | Resolved | See F1 to F13. |

## Executive summary

- Bridger's spec is far more traceable than Cordis's paper (BEH/INV/REQ/RSK/ADR/CCR ids, 14 mechanical checks, an in-spec test-host contract). It is far less *executable*: 52 invariants are prose with free-text "Verification" paragraphs, and the prototype cited only 2 distinct INV ids against 223 BEH ids when written (it now names 40 of 187 invariants and 399 of 1,054 behaviours, see Resolution status).
- Nine audit rounds keep finding the same four classes, always in the previous round's fix (round 8: 4 H / 24 M / 36 L; round 9: 6 H / 23 M / 27 L). The mechanical verifiers pass every time ("0 failures"), so they police form, not meaning.
- Cordis states one calculus with theorems; Bridger has confluence (BEH-BR-160, INV-BR-026-style claims) but no formal transition system, so cross-feature rules (take-over, whenReadable, cold, handoff) accrete as prose and collide.
- The prototype was pinned to effect 4.0.0 (now 4.1.5), is declared non-evidence (CCR-BR-004), and had seeded-LCG "random" histories (5 seeds x 40 ops), now replaced by fast-check suites with shrinking.
- Highest-value changes: (1) one executable reference model (state x operation x in-flight) that the spec tables are generated from; (2) a spec-to-code correspondence table like Cordis Table 2; (3) a "gate-walk" and "fix-propagation" checklist enforced in CCR process; (4) fast-check model-based suites for confluence, LIFO revert, drain bounds.

## Where Bridger is already ahead

- Stable, hyphenated, range-allocated ids with a 14-check verifier (`references/core/scripts/verify-traceability.sh`: uniqueness, contiguity, index.yaml == disk, status honesty, planned-path-must-not-exist, claims lint, link/anchor resolution). Cordis has no requirement-level traceability.
- Honest status discipline: "Planned" source paths, Document Control per file, "no independent reviewer yet" disclosed, restricted-claims allowlist, regulatory allocation (Core/Companion/Consumer/N/A).
- Spec-level testability: `TestHost` (BEH-BR-177-184, `21-testing-host.md`) and numbered acceptance checks (BEH-BR-183/184; checks up to 103+) give each behaviour a named scenario; the prototype already has a total state x operation table (`prototypes/host-core/src/legality.ts`, 56 live cells).
- Findings fed back from running code: RESULTS.md G10-G12, G-P7 closed in spec (ADR-BR-038, BEH-BR-086, BEH-BR-160 lazy comparison). Spikes (`spikes/FINDINGS.md`, 394 tests) are decision-grade with owner-keyed backlogs.
- Invariants carry Source / Implication / Verification, risks are linked to controls (RSK rows in `traceability.md` section 7), and the SpecForge assessment (`docs/SPECFORGE-ASSESSMENT.md`) rightly refused a premature migration (G1, G10, G14-G16).
- Cordis's own limits (no overhead measurements, inverse correctness is an author obligation, one ecosystem) are not hidden by Bridger either: INV-BR-024 and INV-BR-043 explicitly name unchecked obligations.

## Findings

| ID | Sev | Evidence | Issue | Proposed change |
|---|---|---|---|---|
| F1 | H | `invariants.md` (52 INV, e.g. INV-BR-017 at :673, INV-BR-016/030 :715-720) | Invariants are paragraphs with nested exceptions; not machine-checkable; INV-BR-016/017/030 were re-amended in CCR-BR-035..041 (7+ revisions) | Add a one-line predicate form per INV (LTL-ish or TS predicate over `inspect()` + record log) beside the prose; see R1 |
| F2 | H | SPEC-AUDIT-09 H1 vs INV-BR-030; AUDIT-08 H1 | Every high is a regression of the prior round's rule (take-over wait grew a build wait, deadlocking on the slot) | Gate-walk and fix-propagation rule in `process/change-control.md` (R3) |
| F3 | H | `traceability.md` section 2 line 123: INV-BR-041 -> "scenario tests under TestClock *(Planned)*"; 154 "Planned" hits | Executable evidence for INV is a column of Planned; prototype cites 2 INV ids | INV -> test-id table generated and checked (R2, R4) |
| F4 | H | `RESULTS.md` header "not the implementation and evidences no requirement (CCR-BR-004)"; package pins effect 4.0.0 vs 4.1.4 (FINDINGS 07) | Prototype covers 01-25 + P7; behaviours 26-34 partly; no divergence detector; stale pin | Drift test (R5); bump pin; label each BEH Prototyped/Unprototyped |
| F5 | M | `confluence.test.ts:18` hand-rolled LCG, 5 seeds x 40 ops; `p7-confluence.test.ts` 30 histories | Confluence is sampled, no shrinking, no generator over the full operation alphabet (config, children, realms, leases, hooks) | fast-check model-based suite (R4) |
| F6 | M | BEH-BR-160, `18-reconciliation-and-confluence.md` | Confluence is stated by exclusion (what the comparison leaves out: `PluginSnapshot.scope`, lazy dormant/active class, refusal lists as history) - the quiescent-state function is never defined | Define `quiescent(config) -> StateMap` precisely; Cordis's theorem is the template (R1) |
| F7 | M | `traceability.md` Change History cell ~6.4 KB single line; 114 KB file; per-file 10 KB cells (`18-...md:15`) | History inlined in tables is unreviewable and forces every fix to touch many rows (propagation class) | Move history to `CHANGELOG`-per-file, keep last revision in header (R6) |
| F8 | M | AUDIT-09 patterns 4 "Propagation, as every round"; CL1-CL9, PL3-PL18 | Roughly a third of findings are stale summaries/rows/glossary (Low class) that scripts could catch | Generated derived artefacts: glossary tags, error catalog, risk rows (R6) |
| F9 | M | AUDIT-09 H3 (INV-AG-006), H4-H6 whenReadable | Gate/decorator added to one primitive without enumerating callers | Callers table per gate generated from `Related` fields (R3) |
| F10 | M | `specforge.json`, `spec/hello.spec` (starter only), ASSESSMENT verdict | SpecForge is installed but empty; a stub invites false confidence | Delete or generate read-only projection (R7) |
| F11 | M | `references/*/invariants.md` 15 trees; `references/core/scripts` only core+companions | Verifier coverage uneven: verify-companions.sh and gxp script exist, no cross-tree id/CCR/error-catalog check beyond allowlists | One verifier entry point `make verify-spec` in CI (R2) |
| F12 | L | `fast-check` absent in `prototypes/host-core/package.json` and `spikes/package.json` | No PBT dependency | Add dev dependency |
| F13 | L | AUDIT-08/09 "agent-reported" vs "verified" tags | Findings quality varies; resolution not tracked as test | Every H gets a regression scenario id in check list (R3) |

## Recommendations

### R1. A formal core: one transition system, with the prose tables generated from it
- Rationale: Cordis proves preservation/progress/confluence/quiescence over one calculus. Bridger's equivalents (INV-BR-009 per-step, 016 `WouldDeadlock`, 017 bounded drain, 026, 030 no cross-plugin build wait, 045 cold) are separate prose rules; the recurring regressions (AUDIT-08 H1, 09 H1) are interactions between rules nobody can enumerate.
- Concrete change: add `references/core/formal/model.ts` (pure, no Effect): state = per plugin {registered|starting|active|stopping|failed(cleanup)...} x in-flight operation x lease set x slot count; transitions = the operations of BEH-BR-040..; observation = `quiescent(desired set)`. Export (a) the legality table (replacing hand-kept `legality.ts`), (b) the invariants as predicates `inv017(trace)`, `inv030(trace)`. Lift the settled cells already proven (56 live cells). State the theorems as testable properties: *Preservation* (every reachable state satisfies INV predicates), *Progress* (no non-terminal state without an enabled transition or a bounded timer), *Confluence/quiescence* (final snapshot is a function of final desired set, BEH-BR-160).
- Cost/risk: M-L (2-3 weeks); risk of a second source of truth. Mitigate: the spec tables are generated from model, and the prototype is checked against it (R5).
- Verification: model checker scenario for AUDIT-09 H1 (slot + finalizer take-over) must find the deadlock in the round-8 spec and not in the fixed one.

### R2. Spec-to-code correspondence table (Cordis Table 2) as a checked artefact
- Rationale: `traceability.md` section 4 maps BEH -> *Planned* paths; nothing maps spec elements to code. Cordis's Table 2 (theory construct -> API) is verified in CI.
- Concrete change: generate `references/core/correspondence.md` from `// @spec BEH-BR-xxx INV-BR-yyy` tags in `prototypes/host-core/src` and `test`, now and in `packages/core` later. Columns: spec id, status (Specified / Prototyped / Implemented / Tested), file:line, test name. Extend `verify-traceability.sh` check 9: a tag naming an undefined id fails; an INV with status Effective and no test tag fails (generalising "status honesty"). Single CI target `verify-spec` running core, companions, gxp scripts plus this.
- Cost/risk: S-M. Risk: tag rot; mitigated by the check failing on dangling ids.
- Verification: run on prototype; expect a report like "INV 2/52 tagged, BEH 223/324" as a baseline, then ratchet.

### R3. Process rules that kill the recurring finding classes
Audit classes, ordered by count: (a) fix propagation (stale rows, glossary, catalog, roadmap; CL/PL ~ 30% of each round), (b) new gate/rule not walked across callers (H4-H6 whenReadable), (c) fail-safe rules checked only against the fail case (H2), (d) follow-up rules decided against one case (AUDIT-08 pattern 1).
- Concrete change in `process/change-control.md` / `definitions-of-done.md`: every CCR containing a new MUST on a shared primitive (store read, stop step, slot, gate, `cold`) must attach (i) a "callers table" (generated by grepping the primitive's name across all 15 trees, R6), (ii) an "outcome matrix" rows = operation (remove / restart / replace / reconfigure / shutdown / reconcile / system stop), cols = state (building / active / draining / parked / failed(cleanup)), each cell cited or "n/a because"; (iii) one executable scenario id per H finding added to the acceptance check list; (iv) a freeze: no spec edit lands the same round it is audited without the matrix.
- Cost/risk: S; adds friction per CCR, but rounds 7-9 cost 64+64+56 findings each.
- Verification: audit round N+1 high count trending to 0 and "regression" tag disappearing; track in AUDIT front matter.

### R4. Property-based and model-based test plan (fast-check on TestHost)
- Rationale: current "random histories" are a hand LCG with 5 fixed seeds; failures are not shrunk and the operation alphabet is partial (`confluence.test.ts:18-23`).
- Concrete change (add `fast-check`, `prototypes/host-core/test/pbt/`):
  1. Confluence: arbitrary sequences over {install, remove, enable, disable, restart, reconfigure, replace, reconcile, child mount/unmount, wake} with TestClock steps; assert snapshot after `awaitIdle` equals fresh install of final set (BEH-BR-160), modulo the documented exclusions.
  2. State x operation table: `fc.constantFrom(states) x fc.constantFrom(ops)`, compare live `TestHost` result with `legality.ts` for all cells including the in-flight table (BEH-BR-183 check 4).
  3. LIFO revert: random plugin graphs with recorded finalizer logs; after remove/shutdown assert dependents' finalizers ran before providers' and each fired exactly once, reverse of acquisition (Cordis's inverse accumulator; BEH-BR-183 check 1, 12).
  4. Drain bound: with TestClock, every removal ends within `drainTimeout + handoffTimeout + removal steps` (INV-BR-017/030); no waits on slots from finalizers (AUDIT-09 H1 regression).
  5. Audit chain: any history yields gapless `auditSeq`, one terminal record per `requested` (INV-BR-022/023), `verifyAuditSequence` passes.
  6. Idempotence: reconcile twice = once (BEH-BR-159).
- Cost/risk: M; flaky if wall time leaks (use TestClock only). Pin fast-check seeds in CI, log failing seed.
- Verification: mutation check - re-introduce known bugs (G11 cross-plugin order, finalizer slot wait) and require a counterexample.

### R5. Bound prototype divergence
- Rationale: RESULTS.md says the prototype evidences nothing; yet it is the only executable semantics, and it is at effect 4.0.0 while spikes are at 4.1.4 (340/340 pass unchanged per FINDINGS 07).
- Concrete change: (a) bump pin; (b) coverage table in RESULTS.md derived from R2 (behaviours 26-34 listed as unprototyped; P7 slice listed); (c) when `packages/core` starts, run the same PBT suite (R4) against both implementations through the `TestHost` interface (differential testing); (d) CI job fails when a CCR touches a prototyped BEH without a prototype/test change or an explicit "prototype-exempt" note.
- Cost/risk: S for a-b, M for c-d. Risk of treating a throwaway as product; keep the label.

### R6. Generate what is currently hand-synchronised
- Rationale: Cordis generates docs from vendored code and verifies in CI (verify-cordis-catalog, doc-sync, doc-typecheck) and gives each event one mode. Bridger's catalogs (error rows, kit catalog, risk rows, glossary) are hand-edited and cross-checked by agents.
- Concrete change: scripts (python3, same style as existing): (i) `verify-catalogs.sh`: every error tag named in a behaviour appears in exactly one catalog row and vice versa (the round-8 "every row of both catalogs" check is currently an agent task); (ii) every event in the bus (`16-event-bus.md`) declares one dispatch mode, checked against emit sites, mirroring Cordis's one-mode-per-event rule; (iii) every code fence in guides and spec (`docs/guides`, behaviours' `ts` blocks) type-checked (`doc-typecheck`) against the prototype signatures; (iv) move Document Control Change History out of 6-10 KB single-line cells (`traceability.md:15`, `18-...md:15`) into `CHANGES.md` per tree so diffs are reviewable; (v) RSK/INV rows in traceability regenerated from `Related:` fields.
- Cost/risk: M; python parsing of markdown prose is fragile - only parse structured fields.
- Verification: seed deliberate drift (rename an error tag) and see CI fail; AUDIT Low-class count should fall.

### R7. Decide the SpecForge question
- Rationale: `specforge.json` + `spec/hello.spec` are a stub; the assessment (verdict: do not migrate) is sound.
- Concrete change: either delete the stub and mention in the assessment, or generate a read-only `.spec` projection of BEH/INV/edges (only for its trace/query value) in CI. Do not add hand-written `.spec`.
- Cost/risk: S. Verification: `specforge check` passes on generated projection.

### R8. Make invariants checkable: structured block per INV
- Rationale: INV text mixes statement, exceptions, sources and test narrative; verification paragraphs cannot be linted.
- Concrete change: add a front-matter block per INV: `predicate:` (name of model predicate, R1), `scope:` (events/records inspected), `evidence:` (test ids, status Planned/Prototyped/Tested), `unchecked:` (author obligations, e.g. INV-BR-024 generator uniqueness, INV-BR-043 code binding via `meta.digest`). The verifier checks `evidence` ids exist and `unchecked` is non-empty or "none".
- Cost/risk: M one-off; touches 52 + ~100 INV in the other trees. Do core first.
- Verification: table of INV with evidence status in correspondence.md.

## Not checked / uncertainties

- Properties are checked on sampled histories (60 to 300 per run with shrinking), not proved. The model covers the settled behaviour of the dependency graph, drain bounds, wait-for cycles and the audit predicates; leases beyond the drain bound, handoff, hooks, lazy registrations, federation and the companion trees are checked only by the scenario suites.
- R8 blocks for the 14 companion trees were rewritten by reading each invariant and its cited evidence (`scope` names what the evidence exercises, `unchecked` what it does not); `predicate` is still `none` because the reference model covers core only. Evidence is found by id, so a block saying no prototype file names an invariant does not rule out an uncited test that covers it. The assessments are model-written and have had one spot-check, not an independent review.
- The correspondence table counts a mention of an id in `src` or `test`, so a citation says where to look, not that the rule holds; tests may cover a behaviour without naming it.
- The CI workflow ran green on GitHub Actions for commit 8be3fa3 (run 45059503960). The audit counts (round 8: 4/24/36, round 9: 6/23/27) are from the report summaries, and whether Highs fall in future rounds is not yet known.
- Cost estimates in the original review were rough.
