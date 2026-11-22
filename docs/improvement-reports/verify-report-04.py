#!/usr/bin/env python3
"""Checks report 04's status table against the spec and the prototype (improvement report 04, closure).

Every phrase the status relies on must exist in the named file, and phrases the build disproved must be gone.
Run: python3 docs/improvement-reports/verify-report-04.py   (exit 1 on any failure)
"""
import pathlib, sys
root = pathlib.Path(__file__).resolve().parents[2]
beh = root / "references/core/behaviors"
src = root / "prototypes/host-core/src"
report = (root / "docs/improvement-reports/04-events-hooks-pipelines.html").read_text()
grounded = [  # (phrase the report shows, file that must state it)
    ("EventModeMismatch", src / "bus.ts"), ("NextCalledTwice", src / "bus.ts"), ("EmitDepthExceeded", src / "bus.ts"),
    ("observer skipped next", beh / "16-event-bus.md"), ("listener-overflow", beh / "16-event-bus.md"),
    ("listenerConcurrency", beh / "02-host-construction.md"), ("emitDepthCap", beh / "02-host-construction.md"),
    ("serialised", beh / "16-event-bus.md"), ("fail-fast", beh / "16-event-bus.md"), ("allowSkipOnVeto", beh / "31-hook-points.md"),
    ("Option defaults", beh / "31-hook-points.md"), ("listenerId", beh / "16-event-bus.md"),
    ("verify-events.sh", root / "references/core/process/definitions-of-done.md"),
]
stale = ["around(event,{role:", "BEH-BR-146 (the realm answer", "no prototype tests were run"]
bad = []
for phrase, f in grounded:
    if phrase not in report: bad.append(f"report no longer shows '{phrase}'")
    if phrase not in f.read_text(): bad.append(f"{f.name} does not state '{phrase}'")
for s in stale:
    if s in report: bad.append(f"report still says '{s}'")
print("\n".join(bad) or "report 04 status: ok")
sys.exit(1 if bad else 0)
