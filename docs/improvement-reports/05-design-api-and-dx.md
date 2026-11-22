# Improvement report 05: Design API surface and developer experience

Scope: docs/SPEC.md (history), docs/FOLDKIT-API.md, docs/REACT-API.md, docs/ERP-DX.md, docs/guides/*, references/kit, prototypes/host-core/src/{plugin,manifest,testing,errors,contract}.ts, prototypes/effect-v4-api. Lens: Cordis/DeepSeek Harness API ergonomics (cordis-brief.md).

## Executive summary

> **State (2026-11-22):** the text below is the original review, kept as written. All 12 findings and all 10 recommendations are resolved as built on spec/dx-report-05 (10 commits after report 04; prototype suite 707/707, 666 at the start; verify-traceability.sh --strict, verify-events.sh, verify-companions.sh, doc-typecheck.sh, verify-errors.sh, verify-cli.sh and verify-report-05.py report 0 failures). See Resolution status and Not checked.


- Bridger's authoring story is specified, but only the core half is executable: `define` (prototypes/host-core/src/plugin.ts:46) exists; the `definePlugin` facade (make/run/build shapes) used by every guide snippet has no code, so all four guide shapes are unverified.
- Every guide snippet is "type-checked: not yet"; the CI check that would fix this (BEH-KT-028) is a requirement on a CLI that does not exist. This is the largest doc/code drift risk.
- The error catalog (264 entries) is hand-maintained and its check (BEH-KT-051) is a requirement only. The prototype declares 68 TaggedErrors; no script compares the two sets.
- Type-safety has a concrete hole: `config` is `Schema.Codec<any, any>` and `build` receives an untyped `PluginConfig` key, so the plugin author gets no decoded-config type. Cordis types config via its Schema.
- There is no cookbook and no generated config/tool/event catalog. Missing pieces are listed in R4 to R6.

## Where Bridger is already ahead

- Type-checked dependency declaration: `build: Layer<IdentifiersOf<P>, E, IdentifiersOf<R> | PluginRuntime | PluginConfig>` (plugin.ts:20) makes undeclared use and missing provision compile errors. Cordis only checks at run time (UNDECLARED_ACCESS / INACTIVE_ACCESS). The prototype also fixed a real spec bug (G10, the non-distributive `IdentifiersOf`, plugin.ts:11-13).
- Typed errors with a stated rule: tagged errors carry identifiers, never values (errors.ts header; ConfigInvalid at errors.ts:27). The catalog gives Cause/Example/Fix for each tag. Cordis has one `CordisError` with codes.
- Versioned contracts with ranges and method sets (contract.ts, BEH-BR-225..234) answer Cordis's stated open problem: nominal-by-key-only dependency links.
- Manifest/definition agreement check (`disagreement`, manifest.ts:~110) and `consentDiff` give review-before-load; Cordis only offers a capability set.
- Deterministic testing: `TestHost` with stepping and fault injection (testing.ts:43-60, BEH-BR-177..182) is stronger than anything in the Cordis primer. Test kit adds leak and failure checks at test end (BEH-KT-011).
- Honest status banners ("prospective, nothing implemented") on every guide.

## Findings

| ID | Sev | Evidence | Issue | Proposed change |
|----|-----|----------|-------|-----------------|
| DX-01 | H | docs/guides/*.md: `definePlugin` in 12 places; grep finds none in prototypes/host-core/src | The facade the guides teach is unprototyped; make/run shapes and the KitTypeError (BEH-KT-003) are untested claims | Prototype `@bridger/kit` definePlugin over `define` (R1) |
| DX-02 | H | guides/README.md:6-10, BEH-KT-028 (REQUIREMENT only) | No snippet compile gate; every snippet is "type-checked: not yet" | Doc-typecheck script now, before the CLI (R2) |
| DX-03 | H | error-catalog.md (264 headings) vs errors.ts (68 classes); BEH-KT-051 | Catalog completeness is promised, not enforced; kit tags are spread over many specs | Generated catalog plus CI diff (R3) |
| DX-04 | M | plugin.ts:18 `config?: Schema.Codec<any, any>`; plugin.ts:20 `PluginConfig` | Decoded config is untyped inside `build`/`make`; `volatile: ReadonlyArray<string>` accepts any string | Generic `C` and `volatile: keyof C` (R7) |
| DX-05 | M | plugin-author-guide.md ("Declare what your methods reach at call time") | Author must hand-declare services used only inside returned methods; the compiler cannot see them | Add a ctx-style lease accessor or a lint (R8) |
| DX-06 | M | manifest.ts:2 "hand-written (structural...) rather than an Effect Schema"; manifest.ts:10-37 | Manifest type, decoder and JSON schema are three copies; `[extra: string]: unknown` weakens the type | Single Schema, derive type, decoder, JSON Schema (R5) |
| DX-07 | M | docs/guides, ERP-DX.md section 6 "Authoring documentation outline" | The cookbook is an outline only; no recipe for add a tool/adapter/settings page/contribution | Recipes with CI-compiled examples (R4) |
| DX-08 | M | REACT-API.md:25, FOLDKIT-API.md:60 | Two UI adapters each define their own client lifecycle and `use`; no shared conformance test that they agree | Adapter conformance suite over one scenario script (R9) |
| DX-09 | M | contract.ts:12-18 `MethodSpec.payload?: unknown` | Contract methods are untyped (`unknown`), so `Contract.method({...})` does not bind payload/success/error to `Shape` | Type `Contract<Self, Shape>` from methods (R7) |
| DX-10 | L | testing.ts:60 comment "Effect exposes no quiescence signal"; G27 | Tests rely on a yield-until-stable heuristic for settlement; flaky-test risk for authors | Document the guarantee; expose `runUntilIdle` bound/timeout in kit docs |
| DX-11 | L | SPEC.md:3, ERP-DX.md banner | Design-history docs still carry API sketches that differ from core; ERP-DX CLI (`bridger add model`) overlaps kit CLI (BEH-KT-025..032) | One CLI spec; ERP commands as a kit extension |
| DX-12 | L | docs/guides/plugin-author-guide.md "Never write `as const`" | Footgun rule documented instead of removed; relies on `const` type params (plugin.ts:46 does use them) | Verify in the prototype and delete the rule if redundant |

## Recommendations

### R1. Prototype the `definePlugin` facade (DX-01)
Rationale: four shapes (provides: Key / record / run / build) are the whole learnability story; Cordis wins on one shape (`apply(ctx, config)` plus `ctx.effect`). Bridger should show its four shapes are really sugar and that the compile error reads well.
Change: add prototypes/host-core/src/kit.ts, normalising every shape to `define`.
```ts
export const definePlugin = <const R extends Keys, const P extends Keys | Record<string, Key>, C>(d: Shape<R, P, C>) =>
  define({ id: d.id, requires: d.requires ?? [], provides: toTuple(d.provides),
           build: "make" in d ? Layer.effect(...) : "run" in d ? Layer.effectDiscard(d.run) : d.build })
```
Cost/risk: small; the type-level KitTypeError is the hard part. Verification: type tests (tsd/expect-type) for BEH-KT-001..006, including a negative test that an undeclared key yields `KitTypeError`.

### R2. Compile every guide snippet in CI (DX-02)
Rationale: Cordis has doc-typecheck/doc-sync. Bridger has the requirement (BEH-KT-028) but no vehicle; a 40-line script does it today.
Change: `scripts/doc-typecheck.ts` extracts fenced `ts` blocks that follow `// type-checked: yes`, writes them to a temp project with paths to prototypes/host-core, runs `tsc --noEmit`. Flip markers per snippet as they pass; fail CI when a marker says `yes` and the snippet does not compile; also fail when a snippet imports a symbol absent from the package's exports (doc-sync).
Cost/risk: snippets using `@bridger/kit` stay `not yet` until R1; the marker count becomes a visible progress metric. Verification: seed one broken snippet and confirm the red build.

### R3. Generate and verify the error catalog (DX-03)
Rationale: BEH-KT-049..052 already say "one entry per tag, as data" and "generated". Implement as data first.
Change: `errors.catalog.ts` exports `entries: Record<Tag, {cause, example, fix, raisedBy, kind}>`; the markdown is rendered from it; a test enumerates `Schema.TaggedError<...>()("Tag"` across prototypes/ and references/*/ and fails on unmatched tags either way. Add a type-level check that every class in errors.ts appears in the entries record via `satisfies Record<ErrorTag, Entry>`.
```ts
export type ErrorTag = InstanceType<typeof Errors[keyof typeof Errors]>["_tag"]
export const entries = { DuplicatePlugin: { origin: "core", raisedBy: ["install"], ... } } satisfies Record<ErrorTag, Entry>
```
Cost/risk: the catalog is 2189 lines; migrating is mechanical, but prose stays authored. Verification: delete one entry, expect compile failure.

### R4. Cookbook with executable recipes (DX-07)
Rationale: Cordis's harness documents add-a-tool/adapter/settings recipes. Bridger's ERP-TODO-WALKTHROUGH.md (504 lines) is a walkthrough of one app, not recipes, and is not core-level.
Change: docs/guides/cookbook/ with one page per task, each with a compiled snippet (R2) and the test using `it.plugin`: (1) add a service plugin, (2) add a contribution (veto/enrich/advisory hook point), (3) add an adapter behind a contract (partner side), (4) add a settings page via REACT-UI-PLUGINS slot, (5) add a volatile config field, (6) replace with handoff, (7) test a failing activation with `Fault.buildFails`.
Cost/risk: pages are cheap once R2 exists; they rot if not compiled, so the gate is a precondition. Verification: each recipe is a test file; page text is included from it.

### R5. One schema for the manifest, plus generated reference catalogs
Rationale: manifest.ts hand-writes a decoder beside an interface (DX-06). Cordis generates config/tool/event catalogs from code and verifies them.
Change: define `PluginManifest` as an Effect Schema; derive the TS type, `decodeProblem` (path-naming, value-free messages via a custom formatter), and a JSON Schema for `bridger pack`. Add three generated references from the same sources: service catalog (contracts, versions, methods, timeouts from `ContractDescriptor`), config catalog (per plugin, `config` schema with `volatile` flags), contribution/event catalog (registry ids, role, mode). Verified in CI like the Cordis `verify-cordis-catalog`: regenerate and `git diff --exit-code`.
Cost/risk: the Schema formatter must keep BEH-BR-241's "path never value" rule; tested by existing manifest tests. Verification: round-trip every fixture manifest; catalog diff clean.

### R6. Event/hook modes as declared data
Rationale: Cordis declares one mode per event and checks call sites. Bridger has hook points with roles (veto/enrich/advisory, manifest.ts:21) but the guide does not list a catalog of hook points or whether a listener may veto an observation-only event.
Change: `HookPoint.define({id, mode: "veto"|"enrich"|"advisory", payload})`, with the mode part of the generated catalog (R5) and a lint that a registered contribution's `role` matches the point's mode.
Cost/risk: possible overlap with BEH-BR-19 registry semantics; reconcile before adding. Verification: negative test of a mismatched role.

### R7. Type the config and contract surfaces (DX-04, DX-09)
Rationale: type-safety is Bridger's pitch, yet two of the most author-visible values are `any`/`unknown`.
Change:
```ts
interface PluginDefinition<R, P, E, C = never> {
  readonly config?: Schema.Codec<C, any>
  readonly volatile?: ReadonlyArray<keyof C & string>
  readonly build: Layer.Layer<IdentifiersOf<P>, E, IdentifiersOf<R> | PluginRuntime | PluginConfigOf<C>>
}
```
and `Contract.method({payload: S, success: T, error: E})` accumulates into `Shape`. Keep `PluginAny` erased as now (plugin.ts:36-37).
Cost/risk: variance of `PluginAny` and the `any` default for existing callers; do it behind a type-test suite. Verification: tests that `volatile: ["nope"]` fails to compile and that `yield* PluginConfig` is the decoded type.

### R8. Close the call-time dependency gap (DX-05)
Rationale: the guide admits that a service used only inside a returned method is unchecked, so the author must keep two lists in sync by hand. Cordis's proxy catches it at run time with typed errors; Bridger's lease path (`host.use`) catches it as `ServiceUnavailable` only after the call.
Change: either (a) a `ctx.use(Key, f)` helper available inside make whose `R` is bound to `requires | optional` so it is a compile error otherwise, or (b) a kit lint (`bridger check`) that flags `yield*` of a non-required key inside returned closures. (a) is cleaner.
Cost/risk: (a) changes the idiom; keep `yield* Key` for build-time use. Verification: type test plus a lint fixture.

### R9. A shared UI-adapter conformance script (DX-08)
Rationale: FOLDKIT-API.md and REACT-API.md specify the same behaviours (available, pluginState, changes, dispose idempotence, activation failure rejects creation) in two documents with separate examples; drift between them is likely.
Change: a framework-neutral scenario list in references/kit (or a new appendix) naming the ten adapter behaviours, with each adapter test importing it.
Cost/risk: low. Verification: both adapters run the same list; a divergent behaviour fails one of them.

### R10. Converge the CLI specs (DX-11)
Rationale: ERP-DX.md section 2 and references/kit/behaviors/04-cli.md both define `bridger` commands (`new plugin` vs `create`; `check`; `dev`). Two names for one thing hurts learnability.
Change: mark ERP-DX commands as `bridger add ...` extensions registered through the kit CLI, and rename `new plugin` to `create`.
Cost/risk: documentation-only. Verification: grep gate that every command in docs appears in BEH-KT-025..032 or is tagged as an extension.

## Resolution status (2026-11-22)

The recommendations above are the proposals; this table is what was built.

| Finding | Rec. | Status | As built |
| --- | --- | --- | --- |
| DX-01 | R1 | Resolved | prototypes/host-core/src/kit.ts: definePlugin with the four forms over define, adding no field (INV-KT-001), and KitTypeError for an undeclared service, a key both required and provided, a volatile name the config lacks, a non-literal id and a make that does not return what provides declares. Compile-time assertions in test/dx-kit.test.ts. Found by compiling the guides: TypeScript does not push the service shape into a nested Effect.succeed, so a method's parameters are annotated (kit 01 says so). |
| DX-02 | R2 | Resolved | references/kit/scripts/doc-typecheck.sh (gate D3): compiles every type-checked: yes block against the prototype, fails on a block without a marker, on a missing import and on a recipe that differs from its test. 5 snippets compiled and 7 recipes backed by tests; 10 stay not yet because they name code that does not exist (the host facade Bridger.make, PluginTest, the promise SDK, Conformance, Plugin.lazy with a manifest file) or the specified duration strings where the prototype takes numbers (hook points). BEH-KT-028 names the script as the vehicle. |
| DX-03 | R3 | Resolved | references/kit/scripts/verify-errors.sh (gate D4) compares declared tags (TaggedError and Error subclasses with a _tag), the BEH-KT-052 rows and the guide entries, and fails on a row no other file mentions. It found real drift: ReplaceRolledBack, SettleTimeout and PlainCrossBoundaryKey had rows and no guide entry; UndeclaredCallTimeUse is new. src/errors.catalog.ts is generated (--write) as entries satisfies Record<ErrorTag, Entry>: 56 entries, a new tag without one is a compile error. |
| DX-04 | R7 | Resolved | define is generic in C; volatile is readonly (keyof NoInfer<C> & string)[], so a name the schema lacks and volatile without config are compile errors (test/dx-config-types.test.ts). The erased PluginAny is unchanged. |
| DX-05 | R8 | Resolved | make and run receive ctx.use(Key, run) (a key of requires only) and ctx.useOptional(Key, run) (a key of optional only, under a lease): any other key is a compile error. The check backstop for a bare yield* inside a returned closure is specified (BEH-KT-028, UndeclaredCallTimeUse) and has no code, because the CLI does not exist. |
| DX-06 | R5 | Resolved | manifest.ts declares ManifestSchema once; the type, decodeProblem (same paths, never a value, all existing manifest tests unchanged) and manifestJsonSchema() derive from it. The author-written type is closed; the decoded ManifestData keeps unknown properties, as BEH-BR-241 clause 2 requires. src/catalog.ts generates the service, configuration and contribution catalogs, compared with test/golden/catalog.md; the event catalog is report 04's (BEH-KT-053). |
| DX-07 | R4 | Resolved | docs/guides/cookbook/: seven recipes (service, hook point, contract adapter, registry page, volatile config, handoff, failing activation). Each snippet is the recipe region of a test in test/cookbook/, and doc-typecheck.sh fails if the page and the region differ. They test on TestHost directly: it.plugin has no code. |
| DX-08 | R9 | Resolved | references/kit/appendices/c-ui-adapter-scenarios.md names ten framework-neutral scenarios; test/adapter-conformance.ts runs them over any client, and src/adapter.ts is a reference client that passes all ten (mutations of its disposal and subscription fail six of them). Both UI documents point to the appendix. Not shared and not tested: creation failing on an initial build failure, and lazy definitions registered dormant, which need a real framework. |
| DX-09 | R7 | Resolved | Contract.make checks each method spec against the service shape: a method the service lacks, or a payload, success or error that does not fit, is a compile error (an erased Schema.Top is not compared). Contract.makeUnchecked is the same contract without the check, for tooling and tests that drift a contract on purpose (BEH-BR-225). |
| DX-10 | - | Resolved | TestHost.runUntilIdleWith({ maxSteps }), default 1000, dies naming the pending steps instead of hanging; the settlement guarantee and its limit (64 quiet yields, TestClock-bound work unseen) are in core 21, kit 02 and the author guide (test/dx-settlement.test.ts). |
| DX-11 | R10 | Resolved | The overlap was already decided (D5: one CLI, the kit's) and SPEC.md and ERP-DX already carry non-normative banners; what was missing was enforcement. ERP-DX commands are now declared extensions (text extension blocks), new plugin is create --template plugin, BEH-KT-025 requires extension registration without shadowing, and references/kit/scripts/verify-cli.sh (gate D5) fails on any other bridger command in the documents. |
| DX-12 | - | Resolved | Redundant, as the report suspected: requires: [A, B] infers a tuple through define and the facade without as const (test/dx-kit.test.ts; kit BEH-KT-002 already said so). The guide rule is deleted. |
| (R6) | R6 | Resolved, smaller than proposed | A hook point is not one mode: veto, enrich and advise roles coexist by design. The roles a point serves are its type arguments (HookPoint.make<In, Enrich, Advice, Code>); the generated event catalog (report 04) now lists them, and verify-events.sh fails a register with a role the arguments rule out (spec 31). A HookPoint.define with a separate mode was not added. |

## Not checked / uncertainties

- Everything the report did not run was run: the prototype suite (666 passing before the work, 707 after), the type claims by compiling (the volatile hole and the unknown method specs reproduced; DX-12 did not: tuples were already inferred without as const).
- Error counts corrected: the prototype declares 56 tags (51 TaggedError and 5 Error subclasses with a _tag), all of them have a BEH-KT-052 row; the table has 274 rows and the guide 274 entries after three missing guide entries were written. 85 rows describe tags only the specifications name, and each is still mentioned by some other file. The delta the report called not itself a defect was right; the defects were the three missing entries.
- R8: no author-side accessor existed in core 09/14/20 (host.use is host-side); ctx.use and ctx.useOptional are new. R6: the event catalog did exist after report 04, so the part of R6 that duplicated it was dropped.
- SPEC.md, ERP-DX, REACT-API and FOLDKIT-API were read for what DX-08 and DX-11 needed (command lists, client behaviours); ERP-SPEC.md, REACT-UI-PLUGINS.md and ERP-TODO-WALKTHROUGH.md were not read beyond the references to them.
- Not built, by design: the bridger check lint (UndeclaredCallTimeUse) and any CLI code; PluginTest and it.plugin; real React and FoldKit adapters (the reference client and the scenario list stand in); the 10 snippets marked not yet.
- The regex-based gates (verify-errors.sh, verify-cli.sh, doc-typecheck.sh) read code spans, fences and declarations; a command or tag assembled at run time is not seen.
- Loaded-run stability: the new test files ran 4 times under six busy-loop processes with no failure; the full suite under load is recorded in the commit message of the last phase.
