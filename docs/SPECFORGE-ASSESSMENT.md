# SpecForge vs. raw Markdown for `references/` — assessment

Status: analysis, 2026-10-04. Evidence comes from SpecForge 0.1.0 (CLI + MCP) and from
throwaway probes in a scratch project; nothing in `spec/` or `references/` was changed.
Counts below are grep-level approximations, not verified inventories.

## 0. Verdict

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Today:   raw Markdown + verify-traceability.sh  >  SpecForge             │
│ Why:     SpecForge 0.1.0 cannot yet represent ~70% of what references/   │
│          encodes, and cannot enforce most of what the script enforces.   │
│ Could SpecForge win?  Yes, on 4 specific axes (§6), but only after the   │
│          gaps in §4 are closed, mostly by writing our own extension.     │
│ Recommendation: do NOT migrate. Keep Markdown as source of truth.       │
│          Optionally generate a read-only .spec projection (§7).          │
└──────────────────────────────────────────────────────────────────────────┘
```

## 1. What `references/` actually encodes

```
┌─────────────────────────── references/core (+ gxp) ───────────────────────────┐
│ Entities (approx. counts)                                                      │
│   URS ~28 · NFR ~8 · BEH 222 · INV 30 · ADR 40 · RSK ~24 · REQ ~55+          │
│   REQUIREMENT blocks ~800 (RFC 2119 text, several per BEH)                     │
│   Regulatory clauses → allocation (Core | Companion | Consumer | N/A | a+b)    │
│   CCR change requests (CCR-BR-001..014) · Document Control per file            │
│                                                                                │
│ Link types (reference blockquote under every BEH)                              │
│   Satisfies ~195 · See(ADR) ~191 · Invariant ~137 · Risk ~125 · Regulatory ~41 │
│   + traceability.md: BEH→source(Planned), INV→test, REQ→BEH, RSK→control       │
│                                                                                │
│ Mechanical rules (verify-traceability.sh, 14 checks, 305 lines)                │
│   id-uniqueness, block ranges, contiguity, index.yaml==disk, status honesty,   │
│   Planned-path-must-not-exist, restricted-claims allowlist, link+anchor        │
│   resolution, CCR cited ⊂ history, SPEC.md heading migration map               │
└────────────────────────────────────────────────────────────────────────────────┘
```

## 2. What SpecForge 0.1.0 gives us (measured)

```
┌────────────────────────── SpecForge in this repo ──────────────────────────┐
│ Core compiler alone : only `spec "X" { version ".." }`. Any other keyword   │
│                       is E001 syntax error ("structural-only mode").         │
│ Builtin extensions  : @specforge/software, @specforge/product               │
│                       (no registry configured; others unavailable)          │
│ Kinds (14)          : behavior event invariant port type feature module     │
│                       milestone release deliverable journey persona         │
│                       channel term                                          │
│ Edges (34)          : BehaviorEnforcesInvariant, BehaviorImplementsFeature, │
│                       BehaviorUsesPort, MilestoneIncludesBehavior, ...      │
│ Validation rules    : 41 shipped (software 11, product 30), hardcoded;      │
│                       `schema` dump listed 0, so rules are not declarative   │
│ Tools               : check, trace, query, stats, export, model, collect    │
│                       (test-runner → "entity proven"), infer-*              │
│ Extensions          : Rust → WASM (wasm32-wasip1), scaffold via             │
│                       `specforge extension init`                            │
└──────────────────────────────────────────────────────────────────────────────┘
```

## 3. Probe results (scratch project, not the repo)

| Probe | Result | Consequence |
|---|---|---|
| `behavior BEH-BR-041 {}` | E001: identifiers cannot contain `-` | All IDs must be renamed (`BEH_BR_041`) or mapped; every Markdown link/anchor/ADR-text using hyphen IDs diverges |
| `behavior BEH_BR_041 { satisfies [URS_BR_002] }` | W020 unrecognized field `satisfies` | No `Satisfies`/`Risk`/`Regulatory`/`ADR` link fields |
| `invariants [INV_BR_999]` (undefined) | E003 unresolved reference | Good: dangling-ref detection works |
| `behavior` without a `feature` | W001 "does not implement any feature" | Model assumes product features, not URS/ADR |
| `feature` | E006 requires `problem` | Forces product-shaped content onto URS rows |
| Multi-line string in `contract` | Accepted | Prose fits, but one `contract` per behavior (we have several `REQUIREMENT:` blocks per BEH) |
| `behavior` field set | contract (required), category, consumes, produces, features, invariants, ports, severity, status, refs | No `risk`, `adr`, `regulatory`, `satisfies`, `source`, `test`, `revision` |
| `specforge coverage` (CLI) | not a subcommand (MCP has `specforge_coverage`) | Coverage is test-collector based, not "every BEH has a REQ" |
| `specforge search` | E063: no built-in registry | No ADR/GxP/requirements extension is obtainable |

## 4. Gap analysis — what SpecForge is missing

Legend: ✔ covered · ◐ partial · ✖ missing. "Cost" is the effort to close it by writing our own extension.

```
┌────┬──────────────────────────────────────┬───────┬─────────────────────────────────────────────────┬──────┐
│ #  │ Capability we rely on today           │ State │ Detail                                          │ Cost │
├────┼──────────────────────────────────────┼───────┼─────────────────────────────────────────────────┼──────┤
│ G1 │ Hyphenated stable IDs (BEH-BR-041)    │  ✖    │ Parser rejects `-`; IDs are citation currency   │ High │
│    │ used in prose, links, CCRs, tests     │       │ across 800+ places and external docs            │      │
│ G2 │ Kind: URS / NFR                       │  ✖    │ `feature` needs `problem`; wrong semantics      │ Med  │
│ G3 │ Kind: ADR (status, supersedes,        │  ✖    │ No decision kind at all                         │ Med  │
│    │ alternatives, consequences)           │       │                                                 │      │
│ G4 │ Kind: RSK + control→BEH/INV +         │  ✖    │ `invariant.risk` is a free string, not an edge  │ Med  │
│    │ verification→REQ                      │       │                                                 │      │
│ G5 │ Kind: REQ (acceptance scenario)       │  ✖    │ Closest is `behavior`; conflates two roles      │ Med  │
│ G6 │ Kind: regulatory clause + allocation  │  ✖    │ Enum Core|Companion|Consumer|N/A and `a+b`      │ Med  │
│ G7 │ Kind: CCR / change history / revision │  ✖    │ Document Control table per file has no model    │ Med  │
│ G8 │ Many REQUIREMENT blocks per BEH,      │  ◐    │ One `contract` string; RFC 2119 keyword check   │ Med  │
│    │ each with MUST/SHOULD keyword rule    │       │ and per-block anchors lost                      │      │
│ G9 │ Typed edges Satisfies/See/Risk/Reg    │  ✖    │ Must be added as extension edges                │ Low  │
│ G10│ Required-edge rules (every BEH has    │  ✖    │ 0 validation rules in schema; no declarative    │ High │
│    │ ≥1 REQUIREMENT, every RSK has ≥1      │       │ cardinality rules; would be Rust/WASM code      │      │
│    │ control, every URS has a row, …)      │       │                                                 │      │
│ G11│ ID registry rules: range blocks per   │  ✖    │ "BEH inside its file's block", contiguity       │ High │
│    │ file, contiguity, uniqueness          │       │ (uniqueness alone is likely native)             │      │
│ G12│ index.yaml == disk                    │  n/a  │ Disappears in SpecForge (graph is the index)    │ —    │
│ G13│ Status honesty (no Effective/Accepted │  ✖    │ Cross-cutting rule keyed on an                  │ Med  │
│    │ while `implementation: absent`)       │       │ `implementation` flag at package level          │      │
│ G14│ Planned-path-must-not-exist           │  ✖    │ Needs filesystem checks; WASM sandbox           │ High │
│    │ (source/test linkage)                 │       │ (wasm32-wasip1) may not allow it                │      │
│ G15│ Restricted-claims linter + allowlist  │  ✖    │ Text lint over prose with negation heuristics   │ High │
│ G16│ Markdown link + #anchor resolution    │  ✖    │ Spec prose lives in strings, not Markdown       │ High │
│ G17│ Prose-heavy documents (architecture   │  ✖    │ Overview, philosophy, comparison, glossary,     │ High │
│    │ narrative, tables, diagrams, ts blocks)│      │ migration map: no home in a graph DSL           │      │
│ G18│ Human reading/review in PRs & editors │  ◐    │ `render`/`export` exist; unknown quality; the   │ Med  │
│    │                                       │       │ .spec form is less readable than Markdown       │      │
│ G19│ Test→entity proof (`collect`)         │  ◐    │ Runner support seen: cargo-test; ours is        │ Med  │
│    │                                       │       │ TypeScript (vitest-style) — adapter unknown     │      │
│ G20│ Extension distribution                │  ◐    │ No registry; must live in-repo as Rust→WASM:    │ Med  │
│    │                                       │       │ new toolchain for a TypeScript team             │      │
│ G21│ Format maturity / stability           │  ◐    │ v0.1.0 CLI, `migrate` exists for format drift   │ Risk │
└────┴──────────────────────────────────────┴───────┴─────────────────────────────────────────────────┴──────┘
```

### Check-by-check: the 14 mechanical checks

```
┌────┬────────────────────────────────────────────────────┬─────────────────────────────────┐
│ #  │ verify-traceability.sh check                        │ SpecForge equivalent today      │
├────┼────────────────────────────────────────────────────┼─────────────────────────────────┤
│  1 │ index.yaml matches disk                             │ not needed (graph is the index) │
│  2 │ INV/ADR have trace rows; ADR status matches index   │ ✖ no ADR kind                   │
│  3 │ URS/NFR have trace rows                             │ ✖ no URS kind / required edge   │
│  4 │ RSK cites ≥1 BEH/INV control                        │ ✖ no RSK kind / cardinality     │
│  5 │ allocation ∈ {Core,Companion,Consumer,N/A,a+b}      │ ✖ no enum-with-union field      │
│  6 │ unique ids; BEH in file block; contiguity           │ ◐ uniqueness only              │
│  7 │ every BEH has reference blockquote + REQUIREMENT    │ ✖                               │
│  8 │ Document Control complete; status honesty           │ ✖                               │
│  9 │ Planned paths must not exist                        │ ✖                               │
│ 10 │ REQ defined once and cites defined BEH              │ ◐ dangling-ref E003 works       │
│ 11 │ restricted claim words                              │ ✖                               │
│ 12 │ relative links and #anchors resolve                 │ ✖ (and moot if prose leaves MD) │
│ 13 │ CCR cited ⊂ README history                          │ ✖ no CCR kind                   │
│ 14 │ SPEC.md headings all mapped in migration map        │ ✖                               │
└────┴────────────────────────────────────────────────────┴─────────────────────────────────┘
   Native today: ~1 full + 2 partial of 14.
```

## 5. Why raw Markdown is better *today* (conceding the point)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. Diffable, reviewable prose. Reviewers read Markdown in GitHub; the      │
│    corpus is mostly narrative reasoning (ADR Context/Alternatives).        │
│ 2. Anchors are the links. Every cross-ref is a clickable relative link.    │
│ 3. Rules are already enforced, and enforced in OUR domain terms             │
│    (status honesty, Planned paths, claim words) — SpecForge has none.       │
│ 4. IDs are stable human strings (BEH-BR-041) used in code comments, CCRs,   │
│    GxP docs and the HTML companion. SpecForge forbids `-`.                  │
│ 5. Zero toolchain: bash + python3. SpecForge extensions need Rust→WASM.    │
│ 6. Format risk: SpecForge is 0.1.0 with a migrate command; our 802 blocks   │
│    would be a bet on its stability.                                         │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 6. Where SpecForge could genuinely be better (the honest case for it)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ A. Graph queries instead of grep:  "what breaks if INV-BR-017 changes?"   │
│    → trace/query/impact across BEH→INV→RSK→REQ in one call.              │
│    Today: grep + reading traceability.md, hand-maintained, can drift.     │
│                                                                           │
│ B. Single source, generated views: traceability.md (v0.9 "regenerated"    │
│    nine times by hand) becomes an export, so §1–§7 cannot go stale.       │
│                                                                           │
│ C. Executed-evidence linkage: `collect` records which entities tests      │
│    prove — exactly what ADR-BR-035 ("evidence from executed tests") and   │
│    the validation plan need once implementation exists. Markdown can only │
│    claim; a graph can compute coverage_pct / proof_pct (stats already     │
│    report both, currently 0 / null).                                      │
│                                                                           │
│ D. Typed model + diagnostics + LSP/MCP: agents can query entities, get    │
│    structured gaps (infer_gaps, plan-gap check) instead of reading 25     │
│    behavior files. The MCP server is already wired in .mcp.json.          │
└──────────────────────────────────────────────────────────────────────────┘
```

None of A–D requires the prose to move out of Markdown; they require the *links and
metadata* to be machine-readable. That distinction drives the recommendation.

## 7. Options

```
┌───────────────────────────┬──────────────────────────────┬───────────────────────────────┐
│ Option                    │ What it means                │ Verdict                       │
├───────────────────────────┼──────────────────────────────┼───────────────────────────────┤
│ 1. Full migration         │ .spec becomes source of      │ Reject. Needs G1–G17; loses   │
│                           │ truth, Markdown generated    │ prose fidelity; v0.1 risk.    │
├───────────────────────────┼──────────────────────────────┼───────────────────────────────┤
│ 2. Status quo             │ Markdown + shell checks      │ Safe, but A–D stay unavailable│
├───────────────────────────┼──────────────────────────────┼───────────────────────────────┤
│ 3. Projection (recommended│ Markdown stays canonical. A  │ Lowest risk; tests the model; │
│    to try)                │ script generates spec/*.spec │ gives A, B-lite, D now; gives │
│                           │ (ids mapped BEH-BR-041 →     │ C when tests exist. Throw it  │
│                           │ BEH_BR_041) from headings +  │ away if it does not pay off.  │
│                           │ the **Satisfies/See/…**      │                               │
│                           │ blockquotes; keeps verify-   │                               │
│                           │ traceability.sh as gatekeeper│                               │
└───────────────────────────┴──────────────────────────────┴───────────────────────────────┘

Option 3 pipeline
┌──────────────┐  parse   ┌────────────────┐ compile ┌───────────────┐ query ┌───────────────┐
│ references/  │ ───────► │ spec/*.spec    │ ──────► │ SpecForge     │ ────► │ trace / stats │
│ *.md (truth) │  script  │ (generated,    │         │ graph         │       │ impact / MCP  │
└──────┬───────┘          │  gitignored)   │         └───────────────┘       └───────────────┘
       │                  └────────────────┘
       └──► verify-traceability.sh  (still the gate)
```

Prerequisites for option 3 (all small): a generator (~150 lines) and a decision on
the ID mapping. It would cover only behavior, invariant, and edges via
`invariants`/`refs`. URS, ADR, RSK, REQ, and regulatory rows would be stuffed in
`refs` strings (untyped) until an extension exists.

## 8. What would change my verdict

```
┌──────────────────────────────────────────────────────────────────────────┐
│ SpecForge accepts hyphenated IDs (G1)                                    │
│ + declarative cardinality/required-edge rules without writing Rust (G10) │
│ + ADR / risk / requirement kinds shipped or a no-Rust way to add kinds   │
│ + a TypeScript test collector (G19)                                      │
│ → then migrating the *metadata layer* becomes worth it.                  │
└──────────────────────────────────────────────────────────────────────────┘
```

## 9. Unverified

- Whether `specforge_render` / `export` can regenerate readable Markdown (not tried).
- Whether a custom extension can read the filesystem (G14) or define declarative
  rules; only the empty scaffold was inspected.
- The `@specforge/product` extension was installed in the scratch project but its
  rules were not exercised.
- Counts in §1 come from grep over headings/blockquotes and may be off by a few.

## 10. Correction and extension-system findings (added after follow-up probes)

Correction: §2 and G10 said extensions declare 0 rules. `specforge outline` shows the
builtins ship 41 rules (software 11, product 30) under "Contributes: validators". They are
compiled in; the schema dump just does not expose them. The point stands: we cannot
declare our own rules in a manifest.

```
┌────────────────────────────────────────────────────────────────────────────┐
│ What a custom extension CAN declare (manifest.json, probed)                │
│   entityKinds[] (struct with required `keyword`), fields[] (`fieldType`),  │
│   edgeTypes[] → validated by `extension validate`                          │
│ What it CANNOT (no manifest key found; validators = WASM code)             │
│   cardinality, required-edge, id-range, status-honesty, claim-word rules   │
│ Toolchain: scaffold targets wasm32-wasip1; this machine has wasip2 and     │
│   wasm32-unknown-unknown installed, not wasip1 (build would need rustup    │
│   target add). `extension build` only checks structure, it does not compile│
│ Distribution: no registry, `add` resolves only builtins or a local path    │
│ Unverified: the WASM validator ABI (no docs surfaced), so G10/G13-G16      │
│   feasibility is unknown, not proven impossible.                           │
└────────────────────────────────────────────────────────────────────────────┘
```

## 11. Source review (SpecForge repo) — supersedes parts of §2, §4, §10

Read from `~/Projects/Perso/SpecForge` (docs, WIT, grammar, registry) and confirmed against
the installed 0.1.0 binary in a scratch project. Earlier sections undercounted; corrections:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ CORRECTIONS                                                                 │
│ • 7 builtin extensions exist, not 2: product, software, governance, formal, │
│   testing, vitest, cargo-test (22 kinds, 57+ edges). I only probed two.     │
│ • governance gives decision (≈ADR), constraint (≈NFR), failure_mode (≈RSK). │
│ • vitest collector EXISTS (G19 was wrong): tests link via                   │
│   meta:{specforge:{behavior,verify}}; `verify` obligations proven by passing│
│   tests naming their exact text.                                            │
│ • Declarative rules ARE possible in manifest (no Rust): no_incoming_edges,  │
│   no_outgoing_edges, missing_field_when_flag_set, field_value_constraint    │
│   (pattern/enum), cycle_detection, file_exists. Only `custom` needs WASM.   │
│ • file_exists covers part of G14 (Planned-path rule is its inverse).        │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Kind-by-kind fit of governance onto our entities

```
┌──────────────┬─────────────────┬──────────────────────────────────────────────┐
│ Ours         │ SpecForge kind  │ Fit                                          │
├──────────────┼─────────────────┼──────────────────────────────────────────────┤
│ ADR-BR-nnn   │ decision        │ GOOD: context, decision, alternatives,       │
│              │                 │ consequences, status, date, superseded_by,   │
│              │                 │ deciders. Missing: revision, change history; │
│              │                 │ status is a free string (needs enum rule)    │
│ INV-BR-nnn   │ invariant       │ OK: guarantee + risk string                  │
│ BEH-BR-nnn   │ behavior        │ PARTIAL: one `contract`; no multi-REQUIREMENT│
│              │                 │ blocks; no satisfies/risk/regulatory fields  │
│ RSK-BR-nnn   │ failure_mode    │ PARTIAL: severity/occurrence/detection/rpn,  │
│              │                 │ but ONE invariant ref; ours cites BEH or INV │
│ NFR-BR-nnn   │ constraint      │ GOOD: metric, threshold, constrains/protects │
│ URS-BR-nnn   │ feature         │ POOR: requires `problem`, product-shaped     │
│ REQ-BR-nnn   │ behavior+verify │ PARTIAL: acceptance = `verify` obligation,   │
│ (acceptance) │                 │ proven by a test, which is stronger than ours│
│ Regulatory   │ —               │ MISSING (clause, allocation enum, citations) │
│ CCR / history│ —               │ MISSING                                      │
└──────────────┴─────────────────┴──────────────────────────────────────────────┘
```

### Revised gap list (what is still really missing)

```
┌────┬──────────────────────────────────────────┬────────────────────────────────┐
│ G1 │ Hyphenated IDs                            │ HARD: core grammar identifier  │
│    │                                           │ = /[a-zA-Z_][a-zA-Z0-9_]*/.    │
│    │                                           │ Needs core change or id-alias  │
│    │                                           │ (display id vs. symbol).       │
│ G2 │ URS, regulatory-clause, CCR kinds         │ Declarative manifest: doable   │
│ G3 │ Multiple requirement blocks per behavior  │ Needs list-of-block field or   │
│    │ with RFC 2119 keyword check               │ child entity kind; keyword     │
│    │                                           │ check = field_value_constraint │
│    │                                           │ (pattern) if applied per item  │
│ G4 │ Edge typing for Satisfies/Risk/See/Reg    │ Declarative edges: doable      │
│ G5 │ Cardinality: "≥1 control", "≥1 REQUIREMENT│ no_outgoing_edges covers ≥1;   │
│    │ per BEH", "every URS traced"             │ no "exactly one"/range         │
│ G6 │ Enum status + honesty rule                │ enum: doable; the cross-entity │
│    │ (no Accepted while implementation absent) │ condition needs `custom` WASM  │
│ G7 │ Id-range blocks per file, contiguity      │ `custom` WASM                  │
│ G8 │ Claims linter (negation heuristics)       │ `custom` WASM over string data │
│ G9 │ Markdown links/anchors, prose documents   │ Out of scope for a graph tool  │
│ G10│ Doc Control (revision, reviewer, status)  │ Doable as fields on each entity│
│ G11│ Registry/distribution                     │ Builtins only; local path ok   │
└────┴──────────────────────────────────────────┴────────────────────────────────┘
```

### Revised verdict

The extensions are closer than §0–§10 said: governance + testing + vitest cover roughly
ADR, NFR, risk and executed-evidence linkage out of the box, and most remaining kinds and
edges are declarative manifest work. Three blockers remain real: **G1 (hyphenated IDs, a
core-grammar change)**, **G3 (multi-requirement behaviors)** and the **`custom` WASM
validators** (G6–G8) with their unfamiliar ABI/toolchain. Raw Markdown still wins for prose
and links (G9). Migration of the *metadata layer* is plausible once G1 and G3 land; the
projection approach in §7 remains the cheapest way to start.
