#!/usr/bin/env python3
"""Checks report 07's resolution table against the specification, the prototype and the scripts (improvement report 07, closure).

Every phrase the table relies on must exist in the named file, and phrases the build disproved must be gone.
Run: python3 docs/improvement-reports/verify-report-07.py   (exit 1 on any failure)
"""
import pathlib, re, sys
root = pathlib.Path(__file__).resolve().parents[2]
proto = root / "prototypes/host-core"
ref = root / "references"
report = (root / "docs/improvement-reports/07-spec-quality-and-verification.html").read_text()
md = (root / "docs/improvement-reports/07-spec-quality-and-verification.md").read_text()
grounded = [  # (phrase the report shows, file that must state it)
    ("quiescent", ref / "core/formal/model.ts"), ("takeOverWaits", ref / "core/formal/model.ts"), ("inv030", ref / "core/formal/model.ts"),
    ("inv017", ref / "core/formal/model.ts"), ("inv022", ref / "core/formal/model.ts"), ("inv023", ref / "core/formal/model.ts"),
    ("export const legal", ref / "core/formal/model.ts"), ("export const flight", ref / "core/formal/model.ts"),
    ("quiescent", ref / "core/behaviors/18-reconciliation-and-confluence.md"), ("least set closed", ref / "core/behaviors/18-reconciliation-and-confluence.md"),
    ("callers.sh", ref / "core/process/change-control.md"), ("outcome matrix", ref / "core/process/change-control.md"), ("prototype-exempt", ref / "core/process/change-control.md"),
    ("verify-spec.sh", ref / "core/process/definitions-of-done.md"), ("D6", ref / "core/process/definitions-of-done.md"),
    ("verify-invariants.py", ref / "core/process/definitions-of-done.md"), ("split-history.py", ref / "core/process/definitions-of-done.md"), ("verify-risk-rows.py", ref / "core/process/definitions-of-done.md"),
    ("**Check**", ref / "core/invariants.md"), ("unchecked:", ref / "core/invariants.md"), ("predicate: inv017", ref / "core/invariants.md"),
    ("Prototype evidence", ref / "core/traceability.md"), ("Reference model", ref / "core/appendices/formal-model.md"),
    ("Spec-to-code correspondence", ref / "core/appendices/correspondence.md"), ("Change history", ref / "core/CHANGES.md"),
    ("verify-spec.sh", ref / "core/scripts/verify-spec.sh"), ("check-drift.mjs", ref / "core/scripts/verify-spec.sh"), ("split-history.py", ref / "core/scripts/verify-spec.sh"),
    ("gen-correspondence", proto / "scripts/gen-correspondence.mjs"), ("prototype-exempt", proto / "scripts/check-drift.mjs"),
    ("effect@4.1.5", proto / "RESULTS.md"), ("fast-check", proto / "package.json"), ("seed", proto / "test/pbt/config.ts"),
    ("specforge.json", root / "docs/SPECFORGE-ASSESSMENT.md"), ("7a. Decision", root / "docs/SPECFORGE-ASSESSMENT.md"),
]
for t in ("test/pbt/confluence.pbt.test.ts", "test/pbt/properties.pbt.test.ts", "test/model.test.ts", "test/dx-correspondence.test.ts", "test/dx-drift.test.ts",
          "test/dx-callers.test.ts", "test/dx-invariants.test.ts", "test/dx-history.test.ts", "test/dx-risk-rows.test.ts"):
    grounded.append(("describe(", proto / t))
must_exist = [root / "references/core/scripts" / n for n in ("verify-spec.sh", "callers.sh", "verify-invariants.py", "split-history.py", "verify-risk-rows.py")]
must_exist += [ref / t / "CHANGES.md" for t in sorted(p.name for p in ref.iterdir() if p.is_dir())]
must_be_gone = [root / "specforge.json", root / "spec/hello.spec", proto / "test/confluence.test.ts"]
stale = ["effect@4.0.0 Its purpose", "5 seeds x 40 ops, not property-based", "No PBT dependency to add"]
bad = []
for phrase, f in grounded:
    if not f.exists(): bad.append(f"{f} is missing")
    elif phrase not in f.read_text(): bad.append(f"{f.name} does not state '{phrase}'")
for f in must_exist:
    if not f.exists(): bad.append(f"{f} is missing")
for f in must_be_gone:
    if f.exists(): bad.append(f"{f} should have been deleted")
for name, text in (("html", report), ("md", md)):
    for phrase in ("Resolution status", "F13", "Not built", "40 of 187", "395 of 1,054", "effect 4.1.5", "quiescent", "verify-spec.sh", "Check", "CHANGES.md", "Bridger now" if name == "html" else "Not checked"):
        if phrase not in text: bad.append(f"report {name} no longer shows '{phrase}'")
    for s in stale:
        if s in text: bad.append(f"report {name} still says '{s}'")
# the counts the report quotes must be what the generated table says
corr = (ref / "core/appendices/correspondence.md").read_text()
inv_def = len(re.findall(r"^\| INV-", corr, re.M)); inv_named = len([l for l in corr.split("\n") if l.startswith("| INV-") and "| Specified |" not in l])
beh_def = len(re.findall(r"^\| BEH-", corr, re.M)); beh_named = len([l for l in corr.split("\n") if l.startswith("| BEH-") and "| Specified |" not in l])
for phrase in (f"{inv_named} of {inv_def} invariants", f"{beh_named} of {beh_def:,} behaviours".replace(",", ",")):
    if phrase not in report: bad.append(f"report does not quote the generated count '{phrase}'")
print("\n".join(bad) or "report 07 status: ok")
sys.exit(1 if bad else 0)
