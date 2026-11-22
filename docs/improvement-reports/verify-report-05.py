#!/usr/bin/env python3
"""Checks report 05's status table against the specification and the prototype (improvement report 05, closure).

Every phrase the status relies on must exist in the named file, and phrases the build disproved must be gone.
Run: python3 docs/improvement-reports/verify-report-05.py   (exit 1 on any failure)
"""
import pathlib, sys
root = pathlib.Path(__file__).resolve().parents[2]
src = root / "prototypes/host-core/src"
test = root / "prototypes/host-core/test"
kit = root / "references/kit"
core = root / "references/core"
report = (root / "docs/improvement-reports/05-design-api-and-dx.html").read_text()
grounded = [  # (phrase the report shows, file that must state it)
    ("UndeclaredCallTimeUse", src / "lint.ts"), ("StubNotImplemented", src / "plugin-test.ts"), ("Duration.toMillis", src / "hooks.ts"),
    ("serveContract", src / "sdk.ts"), ("SuiteVersionMismatch", src / "conformance.ts"), ("createBridgerClient", src / "react.ts"), ("BridgerFoldkit", src / "foldkit.ts"), ("makeCli", src / "cli.ts"), ("packageDigest", src / "loader.ts"), ("verifyBundle", src / "audit-chain.ts"), ("pack", src / "kit-release.ts"), ("local", src / "contract.ts"),
    ("KitTypeError", src / "kit.ts"), ("useOptional", src / "kit.ts"), ("NoInfer", src / "plugin.ts"),
    ("makeUnchecked", src / "contract.ts"), ("ManifestSchema", src / "manifest.ts"), ("manifestJsonSchema", src / "manifest.ts"),
    ("runUntilIdleWith", src / "testing.ts"), ("satisfies Record<ErrorTag, Entry>", src / "errors.catalog.ts"),
    ("UndeclaredCallTimeUse", kit / "behaviors/07-error-catalog.md"), ("extension", kit / "behaviors/04-cli.md"),
    ("doc-typecheck.sh", core / "process/definitions-of-done.md"), ("verify-errors.sh", core / "process/definitions-of-done.md"),
    ("verify-cli.sh", core / "process/definitions-of-done.md"), ("maxSteps", core / "behaviors/21-testing-host.md"),
    ("BRIDGER-KT-APP-C", kit / "appendices/index.yaml"), ("scenarios", test / "adapter-conformance.ts"),
    ("recipe", test / "cookbook/01-service.test.ts") if (test / "cookbook/01-service.test.ts").exists() else ("recipe", next((test / "cookbook").glob("01-*.test.ts"))),
]
stale = ["4 stay <code>not yet</code>", "and any CLI code", "it.plugin</code> has no code", "10 stay <code>not yet</code>", "The prototypes and their tests were not run", "Not verified whether a <code>host.use</code>"]
bad = []
for phrase, f in grounded:
    if phrase not in f.read_text(): bad.append(f"{f.name} does not state '{phrase}'")
for phrase in ("doc-typecheck.sh", "verify-errors.sh", "verify-cli.sh", "KitTypeError", "makeUnchecked", "runUntilIdleWith", "Resolution status"):
    if phrase not in report: bad.append(f"report no longer shows '{phrase}'")
for s in stale:
    if s in report: bad.append(f"report still says '{s}'")
print("\n".join(bad) or "report 05 status: ok")
sys.exit(1 if bad else 0)
