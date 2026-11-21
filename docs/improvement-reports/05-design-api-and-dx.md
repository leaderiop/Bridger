# Improvement report 05: Design API surface and developer experience

Scope: docs/SPEC.md (history), docs/FOLDKIT-API.md, docs/REACT-API.md, docs/ERP-DX.md, docs/guides/*, references/kit, prototypes/host-core/src/{plugin,manifest,testing,errors,contract}.ts, prototypes/effect-v4-api. Lens: Cordis/DeepSeek Harness API ergonomics (cordis-brief.md).

## Executive summary

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

## Not checked / uncertainties

- I did not run the prototypes or their tests; claims about types come from reading plugin.ts, manifest.ts, contract.ts, errors.ts, not compiling.
- The 264 vs 68 error count compares catalog headings with `export class` in prototypes/host-core/src only; the catalog also covers companion specs (kit, loader, federation, ...) that have no prototype, so the delta is not itself a defect.
- I did not read the full 976-line SPEC.md, REACT-UI-PLUGINS.md, ERP-SPEC.md or ERP-TODO-WALKTHROUGH.md; findings about them rely on headers and the guide cross-references.
- I did not verify whether `host.use`/`ctx`-style accessor (R8) already exists elsewhere in core behaviours 09/14.
- Whether a "events catalog" with modes exists inside references/core/behaviors/19 or the event bus spec was not confirmed; R6 may duplicate it.
