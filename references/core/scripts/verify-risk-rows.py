#!/usr/bin/env python3
"""Risk rows follow their sources (report 07, R6 v): the Controls cell of each RSK row in traceability.md section 7 is the
set of BEH and INV that either the risk's entry in gxp/03-risk-assessment.md cites, or name the risk in their own
`Risk:` field (a behaviour) or text (an invariant). The row is generated; it holds nothing the sources do not say.

  python3 references/core/scripts/verify-risk-rows.py           check
  python3 references/core/scripts/verify-risk-rows.py --write   regenerate the Controls cells
"""
import os, re, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
CORE = os.environ.get("RISK_ROWS_CORE") or os.path.join(ROOT, "references", "core")   # the override is for the tests
ID = r"(?:BEH|INV)-BR-\d{3}"

def key(x): k, _, n = x.split("-")[0], x.split("-")[1], x.split("-")[2]; return (0 if k == "BEH" else 1, int(n))

def linked():
    """Behaviours and invariants that name a risk themselves."""
    import glob
    out = {}
    for f in sorted(glob.glob(os.path.join(CORE, "behaviors", "*.md"))) + [os.path.join(CORE, "invariants.md")]:
        for part in re.split(r"(?=^## (?:BEH|INV)-BR-\d{3}:)", open(f, encoding="utf8").read(), flags=re.M)[1:]:
            ident = re.match(r"## ((?:BEH|INV)-BR-\d{3})", part).group(1)
            if ident.startswith("BEH"):
                text = " ".join(m.group(1) for m in re.finditer(r"^> \*\*Risk:?\*\*:?(.*)$", part, re.M))
            else: text = part
            for r in set(re.findall(r"RSK-BR-\d{3}", text)): out.setdefault(r, set()).add(ident)
    return out

def entries():
    g = open(os.path.join(CORE, "gxp", "03-risk-assessment.md"), encoding="utf8").read()
    out = {}
    for block in re.split(r'(?=<a id="rsk-br-\d{3}">)', g)[1:]:
        n = re.match(r'<a id="rsk-br-(\d{3})">', block).group(1)
        block = re.split(r"\n## ", block)[0]
        out[f"RSK-BR-{n}"] = set(re.findall(ID, block))
    for r, ids in linked().items():
        if r in out: out[r] |= ids
    return {r: sorted(ids, key=key) for r, ids in out.items()}

ROW = re.compile(r"^(\| \[(RSK-BR-\d{3})\]\([^)]*\) \| [^|]* \| )([^|]*)( \| .*)$")

def run(write):
    path = os.path.join(CORE, "traceability.md")
    t = open(path, encoding="utf8").read()
    a = t.index("## §7 Risk traceability")
    ent, out, fails = entries(), [], []
    for line in t[a:].split("\n"):
        m = ROW.match(line)
        if m and m.group(2) in ent:
            want = ", ".join(ent[m.group(2)])
            if m.group(3) != want:
                have = set(re.findall(ID, m.group(3))); w = set(ent[m.group(2)])
                fails.append(f"{m.group(2)}: Controls cell differs from the entry (row only: {sorted(have - w)[:3]}, entry only: {sorted(w - have)[:3]})")
                line = m.group(1) + want + m.group(4)
        out.append(line)
    missing = sorted(set(ent) - {re.match(ROW, l).group(2) for l in out if ROW.match(l)})
    for r in missing: fails.append(f"{r}: no row in section 7")
    if write: open(path, "w", encoding="utf8").write(t[:a] + "\n".join(out))
    return fails

if __name__ == "__main__":
    write = sys.argv[1:] == ["--write"]
    f = run(write)
    if write: print(f"verify-risk-rows: {len(f)} row(s) rewritten")
    else:
        print(f"verify-risk-rows: {len(f)} failure(s)")
        for x in f[:10]: print(f"FAIL {x}")
    sys.exit(0 if write or not f else 1)
