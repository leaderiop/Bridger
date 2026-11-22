#!/usr/bin/env python3
"""Invariant Check blocks (report 07, R8): every invariant of an authored tree carries a yaml block that can be linted.

  python3 references/core/scripts/verify-invariants.py [tree ...]     (default: every references/*/invariants.md)

A tree with no `**Check**` block at all is reported as "not yet authored" and is not a failure; a tree with some must have
one for every `## INV-XX-nnn` heading. Each block has predicate, scope, evidence, status, unchecked:
  predicate  `none`, or a name exported by references/core/formal/model.ts (core only)
  evidence   `none`, or paths under prototypes/host-core that exist and name the invariant
  status     Tested (a test names it), Prototyped (only src names it), Planned (nothing does): derived from evidence
  unchecked  non-empty: what the invariant leaves to the author, or `none stated`
"""
import os, re, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
FIELDS = ("predicate", "scope", "evidence", "status", "unchecked")

def parse_block(body):
    out, key = {}, None
    for line in body.split("\n"):
        m = re.match(r"^(\w+):\s*(.*)$", line)
        if m: key = m.group(1); out[key] = m.group(2).strip() or []; continue
        m = re.match(r"^\s+-\s+(.*)$", line)
        if m and key is not None:
            if not isinstance(out.get(key), list): out[key] = []
            out[key].append(m.group(1).strip())
    return out

def check_tree(path, model_names):
    text = open(path, encoding="utf8").read()
    parts = re.split(r"^(?=## INV-[A-Z]+-\d{3}:)", text, flags=re.M)[1:]
    if not any("**Check**" in p for p in parts):
        return None, [], len(parts)
    fails = []
    for part in parts:
        ident = re.match(r"## (INV-[A-Z]+-\d{3})", part).group(1)
        m = re.search(r"\*\*Check\*\*:\s*\n+```yaml\n(.*?)\n```", part, re.S)
        if not m: fails.append(f"{ident}: no Check block"); continue
        b = parse_block(m.group(1))
        for f in FIELDS:
            if f not in b or b[f] in ("", []): fails.append(f"{ident}: Check block lacks '{f}'")
        if any(f not in b for f in FIELDS): continue
        pred = b["predicate"]
        if pred != "none" and path.endswith(os.path.join("core", "invariants.md")) and pred not in model_names:
            fails.append(f"{ident}: predicate '{pred}' is not exported by formal/model.ts")
        ev = [] if b["evidence"] == "none" else b["evidence"]
        if not isinstance(ev, list): fails.append(f"{ident}: evidence must be 'none' or a list of paths"); continue
        for e in ev:
            full = os.path.join(ROOT, e)
            if not os.path.isfile(full): fails.append(f"{ident}: evidence {e} does not exist")
            elif not re.search(r"\b" + ident + r"\b", open(full, encoding="utf8").read()): fails.append(f"{ident}: evidence {e} does not name it")
        want = "Planned" if not ev else ("Tested" if any("/test/" in e for e in ev) else "Prototyped")
        if b["status"] != want: fails.append(f"{ident}: status is {b['status']}, the evidence makes it {want}")
    return True, fails, len(parts)

def section2_cells():
    """The generated fourth column of traceability.md section 2: status and evidence files, from each invariant's Check block."""
    text = open(os.path.join(ROOT, "references", "core", "invariants.md"), encoding="utf8").read()
    cells = {}
    for part in re.split(r"^(?=## INV-BR-\d{3}:)", text, flags=re.M)[1:]:
        ident = re.match(r"## (INV-BR-\d{3})", part).group(1)
        m = re.search(r"\*\*Check\*\*:\s*\n+```yaml\n(.*?)\n```", part, re.S)
        b = parse_block(m.group(1)) if m else {}
        ev = [] if b.get("evidence") in (None, "none") else b["evidence"]
        files = ", ".join(f"`{e.replace('prototypes/host-core/', '')}`" for e in ev)
        cells[ident] = f"{b.get('status', 'Planned')}" + (f": {files}" if files else "")
    return cells

def table_check(write):
    path = os.path.join(ROOT, "references", "core", "traceability.md")
    text = open(path, encoding="utf8").read()
    a, z = text.index("## §2 Invariant traceability"), text.index("## §3 Decision traceability")
    cells, out, fails = section2_cells(), [], []
    for line in text[a:z].split("\n"):
        parts = line.strip().strip("|").split(" | ")
        m = re.match(r"\| \[(INV-BR-\d{3})\]", line)
        if line.startswith("| Invariant"): line = "| Invariant | Enforced by behaviours | Planned verification | Prototype evidence |"
        elif line.startswith("| ---") and len(parts) in (3, 4): line = "| --- | --- | --- | --- |"
        elif m:
            want = f"| {' | '.join(p.strip() for p in parts[:3])} | {cells[m.group(1)]} |"
            if line != want: fails.append(f"{m.group(1)}: traceability section 2 evidence cell is stale")
            line = want
        out.append(line)
    if write: open(path, "w", encoding="utf8").write(text[:a] + "\n".join(out) + text[z:])
    return fails

def main(argv):
    if argv[:1] == ["--write"]:
        table_check(True); print("verify-invariants: traceability section 2 rewritten"); return 0
    model = os.path.join(ROOT, "references", "core", "formal", "model.ts")
    names = set(re.findall(r"^export (?:const|function) (\w+)", open(model, encoding="utf8").read(), re.M)) if os.path.exists(model) else set()
    trees = argv or sorted(os.path.join(ROOT, "references", d, "invariants.md") for d in os.listdir(os.path.join(ROOT, "references")) if os.path.isfile(os.path.join(ROOT, "references", d, "invariants.md")))
    total = 0
    for t in trees:
        authored, fails, n = check_tree(t, names)
        rel = os.path.relpath(t, ROOT)
        if authored is None: print(f"verify-invariants: {rel}: {n} invariants, not yet authored"); continue
        print(f"verify-invariants: {rel}: {n} invariants authored, {len(fails)} failure(s)")
        for f in fails: print(f"FAIL {f}")
        total += len(fails)
    if not argv:
        stale = table_check(False)
        if stale: print(f"verify-invariants: traceability.md section 2 is stale; run with --write"); total += 1
        for f in stale[:5]: print(f"FAIL {f}")
    print(f"{total} failure(s)")
    return 1 if total else 0

if __name__ == "__main__": sys.exit(main(sys.argv[1:]))
