#!/usr/bin/env python3
"""Checks report 03's cards and animated diagrams against the spec (improvement report 03, closure).

Every phrase a card relies on must exist in the named spec file, and phrases the build disproved must be gone from the report.
Run: python3 docs/improvement-reports/verify-report-03.py   (exit 1 on any failure)
"""
import pathlib, sys
root = pathlib.Path(__file__).resolve().parents[2]
beh = root / "references/core/behaviors"
report = (root / "docs/improvement-reports/03-effects-scopes-cleanup.html").read_text()
grounded = [  # (phrase the report shows, spec file that must state it)
    ("closeTimeout", "06-removal.md"), ("close timed out after", "06-removal.md"),
    ("revokeTimeout", "19-contribution-registry.md"), ("afterPublish", "05-activation.md"),
    ("superseded", "05-activation.md"), ("retryCleanup", "06-removal.md"), ("retryCleanup", "08-operation-legality.md"),
    ("failed(cleanup)", "06-removal.md"), ("irreversible", "13-observability-and-diagnostics.md"), ("causes", "06-removal.md"),
]
stale = ["interrupt the closing fiber", "The closing fiber is interrupted, not awaited", "per-plugin manifest override", "Defer unless operators ask",
         "Cordis would simply re-run", "bare finalizers stay acknowledgement-only", "labelled via acquire", "cannot be re-run", "Would re-run"]
bad = []
for phrase, f in grounded:
    if phrase not in report: bad.append(f"report no longer shows '{phrase}'")
    if phrase not in (beh / f).read_text(): bad.append(f"spec {f} does not state '{phrase}'")
for s in stale:
    if s in report: bad.append(f"report still says '{s}'")
print("\n".join(bad) or "report 03 cards and diagrams: ok")
sys.exit(1 if bad else 0)
