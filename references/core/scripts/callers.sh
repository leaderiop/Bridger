#!/usr/bin/env bash
# Callers table for a shared primitive (report 07, R3): every behaviour and invariant, in all fifteen trees,
# whose text names it. Attach the output to a CCR that adds a MUST on that primitive.
#   bash references/core/scripts/callers.sh "<name>" [--md]
set -eu
[ $# -ge 1 ] || { echo "usage: callers.sh <name> [--md]" >&2; exit 2; }
root="$(cd "$(dirname "$0")/../../.." && pwd)"
python3 - "$root" "$1" "${2:-}" <<'PY'
import os, re, sys
root, name, md = sys.argv[1], sys.argv[2], sys.argv[3] == "--md"
pat = re.compile(re.escape(name))
head = re.compile(r"^#{2,3} ((?:BEH|INV)-[A-Z]+-\d{3}):", re.M)
rows = {}
for d, _, fs in os.walk(os.path.join(root, "references")):
    if "node_modules" in d or "/appendices" in d: continue
    for f in sorted(fs):
        if not f.endswith(".md") or f in ("traceability.md", "glossary.md", "CHANGES.md"): continue
        p = os.path.join(d, f); s = open(p, encoding="utf8").read()
        marks = [(m.start(), m.group(1)) for m in head.finditer(s)]
        for i, (start, ident) in enumerate(marks):
            end = marks[i + 1][0] if i + 1 < len(marks) else len(s)
            n = len(pat.findall(s[start:end]))
            if n: rows[ident] = (os.path.relpath(p, os.path.join(root, "references")), n)
def key(i): k, t, n = i.split("-"); return (t, k, int(n))
out = sorted(rows, key=key)
if md:
    print("| Id | File | Mentions | Outcome |\n| --- | --- | --- | --- |")
    for i in out: print(f"| {i} | {rows[i][0]} | {rows[i][1]} | |")
else:
    for i in out: print(f"{i}\t{rows[i][0]}\t{rows[i][1]}")
print(f"callers: {len(out)} behaviour/invariant section(s) name '{name}'", file=sys.stderr)
PY
