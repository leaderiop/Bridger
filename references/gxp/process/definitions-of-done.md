# Definitions of Done

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-GX-PROC-02                                           |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-GX-03 §5)           |
> | Approved by    | — (pending; single maintainer, see PROC-GX-03 §5)            |
> | Classification | Procedure                                                    |
> | Change History | 0.1 (2026-10-03): Initial draft (CCR-GX-001)                 |

_Previous: [Requirement Identifier Scheme](./requirement-id-scheme.md)_

---

The companion has two gates, as core does: the one that can run today, over
the specification alone, and the one that will run when `packages/gxp` exists.
Both are fixed now so that the second is not invented later under pressure,
and so that nobody mistakes a passing documentation gate for evidence about
the package.

## Documentation gate (runnable now)

| # | Command | Gate |
| - | ------- | ---- |
| D1 | `bash references/gxp/scripts/verify-traceability.sh --strict` | The companion specification is internally consistent (all seventeen checks of the [identifier scheme](./requirement-id-scheme.md) §5), and core's own gate D1 passes (check 15) |

A pass means the documents agree with each other and with core's identifiers.
It says nothing about whether the companion — which does not exist yet —
would behave as written, and it does not recompute anything except the test
vectors of check 17.

## Merge gate (planned — not yet runnable)

`pnpm check` will run, for `packages/gxp`, in order. Every row is *Not yet
runnable* until the package exists; the command is fixed now.

| # | Command | Gate | Status |
| - | ------- | ---- | ------ |
| 1 | `tsc -b tsconfig.json` | Sources compile against the supported core range | Not yet runnable |
| 2 | `tsc -p tsconfig.test.json` | Tests compile, including the compile-time failures of `GxpLayer.make` with a missing port | Not yet runnable |
| 3 | `oxlint` | Lint clean | Not yet runnable |
| 4 | `node scripts/check-house-style.mjs` | House rules: no ambient clock or randomness, crypto only from the platform, no default port outside `@bridger/gxp/testing` | Not yet runnable |
| 5 | `madge --circular --extensions ts packages/gxp/src` | No circular imports; the main entry point does not import `testing/` | Not yet runnable |
| 6 | `tstyche` | Type-level tests (`*.tst.ts`) for the port shapes and `GxpLayer.make` | Not yet runnable |
| 7 | `vitest run --coverage` | Tests pass; coverage ≥ 95% on `packages/gxp` ([NFR-GX-003](../urs.md#nfr-gx-003-coverage)) | Not yet runnable |
| 8 | `pnpm --filter @bridger/gxp test:acceptance` | Acceptance scenarios `REQ-GX-NNN` pass, against the real core through `TestHost` | Not yet runnable |
| 9 | `pnpm --filter @bridger/gxp test:conformance` | The conformance suite passes against `memoryTrailStore` and fails, with the expected case numbers, against each `brokenTrailStore` variant | Not yet runnable |
| 10 | `pnpm --filter @bridger/gxp test:vectors` | The implementation reproduces every ```` ```vector ```` block of files 09 and 13 | Not yet runnable |
| 11 | `pnpm --filter @bridger/gxp test:evidence-selftest` | The OQ evidence generator reports the expected fail, skipped and not-covered results on its known-bad corpus | Not yet runnable |
| 12 | `bash references/gxp/scripts/verify-traceability.sh --strict` | Gate D1 | Runnable |
| 13 | `node scripts/check-api-surface.mjs --package gxp` | `overview.md` names every export | Not yet runnable |
| 14 | `node scripts/check-package-install.mjs --package gxp` | The packed package installs beside the packed core and runs a smoke host | Not yet runnable |
| 15 | `stryker run` | Mutation score ≥ 80% on `packages/gxp` ([NFR-GX-004](../urs.md#nfr-gx-004-mutation-testing)) | Not yet runnable |

When code exists, `implementation:` in the README moves to `partial`; the
checker then stops refusing `Effective` documents and `Accepted` decisions
(check 8). Check 9 already fails any path marked *Planned* that exists.

## Per-change checklist

A change to this specification is done when:

1. It has a `CCR-GX-NNN` entry in the README document history.
2. Every document it touched has a new revision and a Change History line
   citing the CCR.
3. Its impact assessment is recorded ([change control](./change-control.md) §3),
   and any `RSK-GX` it affects has been re-scored.
4. New identifiers follow the [identifier scheme](./requirement-id-scheme.md)
   and appear in `traceability.md`.
5. Every core identifier it newly cites is listed in the
   [core interface map](../appendices/core-interface-map.md), and the coupling rule of
   [change control](./change-control.md) §7 is met.
6. Gate D1 passes with `--strict`, which includes core's gate D1.

---

_Next: [Change control](./change-control.md)_
