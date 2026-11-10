# Definitions of Done

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-PROC-02                                              |
> | Revision       | 0.4                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Process Specification                                        |
> | Change History | 0.4 (2026-11-10): Merge gate: the pack-and-install row moves to row 8, before the acceptance scenarios (now row 9) that import the packed package, rows 9–12 renumbered (Low); row 13 runs the acceptance scenarios against packed mutants (C16) (CCR-BR-035)<br>0.3 (2026-11-10): Merge gate row 8 runs the acceptance scenarios against the packed package (C25) (CCR-BR-034)<br>0.2 (2026-10-03): What `implementation: partial` changes, as the script implements it (consistency pass) (CCR-BR-013)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001)                 |

_Previous: [Requirement Identifier Scheme](./requirement-id-scheme.md)_

---

Bridger has two gates: the one that can run today, over the specification
alone, and the one that will run when code exists. Both are listed so that the
second is not invented later under pressure, and so that nobody mistakes a
passing documentation gate for evidence about the library.

## Documentation gate (runnable now)

| # | Command | Gate |
| - | ------- | ---- |
| D1 | `bash references/core/scripts/verify-traceability.sh --strict` | The specification is internally consistent (all fourteen checks of the [identifier scheme](./requirement-id-scheme.md) §5) |

A pass means the documents agree with each other. It says nothing about
whether the library — which does not exist yet — would behave as written.

## Merge gate (planned — not yet runnable)

`pnpm check` will run, in order. Every row is *Not yet runnable* until the
package exists; the row's command is fixed now so that the gate is decided
before the code that must pass it.

| # | Command | Gate | Status |
| - | ------- | ---- | ------ |
| 1 | `tsc -b tsconfig.json` | Sources compile | Not yet runnable |
| 2 | `tsc -p tsconfig.test.json` | Tests compile | Not yet runnable |
| 3 | `oxlint` | Lint clean | Not yet runnable |
| 4 | `node scripts/check-house-style.mjs` | House rules, including no ambient `Date.now()`, `performance.now()` or `crypto.randomUUID()` in core ([INV-BR-024](../invariants.md#inv-br-024-time-and-identifiers-come-only-from-services)) | Not yet runnable |
| 5 | `madge --circular --extensions ts packages/*/src` | No circular imports | Not yet runnable |
| 6 | `tstyche` | Type-level tests (`*.tst.ts`), including undeclared-dependency compile errors and event-key mismatches | Not yet runnable |
| 7 | `vitest run --coverage` | Tests pass; coverage ≥ 95% on `packages/core` ([NFR-BR-003](../urs.md#nfr-br-003-coverage)) | Not yet runnable |
| 8 | `node scripts/check-package-install.mjs` | Packed packages install, resolve and run a smoke host | Not yet runnable |
| 9 | `pnpm --filter @bridger/features test` | Acceptance scenarios `REQ-BR-NNN` pass, importing the packed package by name from the clean install of row 8 ([validation plan](../gxp/04-validation-plan.md) §5.2) | Not yet runnable |
| 10 | `node scripts/check-doc-examples.mjs` | Every runnable example in `references/` compiles ([NFR-BR-004](../urs.md#nfr-br-004-executable-documentation-examples)) | Not yet runnable |
| 11 | `bash references/core/scripts/verify-traceability.sh --strict` | Gate D1 | Runnable |
| 12 | `node scripts/check-api-surface.mjs` | `overview.md` names every export | Not yet runnable |
| 13 | `stryker run` | Mutation score ≥ 80% on `packages/core` ([NFR-BR-008](../urs.md#nfr-br-008-mutation-testing)); the `REQ-BR` acceptance scenarios run against each mutant packed and installed as row 8 packs the release, so their kills are counted ([validation plan](../gxp/04-validation-plan.md) §5.2) | Not yet runnable |

When code exists, `implementation:` in the README moves to `partial`; the
traceability script then stops refusing `Effective` documents and `Accepted`
decisions (check 8). Check 9 already fails any path marked *Planned* that
exists.

## Per-change checklist

A change to this specification is done when:

1. It has a `CCR-BR-NNN` entry in the README document history.
2. Every document it touched has a new revision and a Change History line
   citing the CCR.
3. Its GxP impact assessment is recorded ([change control](./change-control.md) §3),
   and any `RSK-BR` it affects has been re-scored.
4. New identifiers follow the [identifier scheme](./requirement-id-scheme.md)
   and appear in `traceability.md`.
5. Gate D1 passes with `--strict`.

---

_Next: [Change control](./change-control.md)_
