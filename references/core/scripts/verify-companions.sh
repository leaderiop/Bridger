#!/usr/bin/env bash
# verify-companions.sh — mechanical consistency checks for the companion
# specification trees (every references/*/ except core) and docs/guides/.
#
# Usage: bash references/core/scripts/verify-companions.sh
#
# Requires bash and python3 (standard library only). Reuses the rules of
# verify-traceability.sh where they apply:
#   1. links and anchors      — as core check 12 (fenced code ignored)
#   2. claims lint            — as core check 11 (same restricted words, same
#                               negations, same three-line window), with its own
#                               allowlist companions-claims-allowlist.txt that
#                               fails in both directions. The package name
#                               `@bridger/durable-bus` (and its path, document
#                               title and package id) is masked before the lint:
#                               ADR-DB-007 keeps the name as intent only, with no
#                               persistence claim, and the rename stays an open
#                               gap in references/core/urs.md.
#   3. own identifiers        — every BEH/INV/ADR/REQ/RSK-<PFX> cited in any tree
#                               or guide is defined in the tree owning <PFX>
#   4. core identifiers       — every BEH/INV/ADR/URS/NFR/RSK/REQ-BR cited is
#                               defined in references/core (same definition
#                               rules as verify-traceability.sh)
#   5. structure              — each tree has README.md with a Document Control
#                               table and an `implementation: absent` line, a root
#                               index.yaml, and every directory holding .md files
#                               has an index.yaml listing exactly those files
# Exit status is 1 if any check fails.
set -euo pipefail
REFS="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ROOT="$(cd "$REFS/.." && pwd)"
exec python3 - "$REFS" "$ROOT" <<'PY'
import os, re, sys
from collections import Counter, defaultdict

REFS, ROOT = sys.argv[1], sys.argv[2]
CORE = os.path.join(REFS, "core")
fails = defaultdict(list)
def read(p):
    with open(p, encoding="utf-8") as f: return f.read()
def rel(p): return os.path.relpath(p, REFS)

# ---------------------------------------------------------------- inventory
trees = sorted(d for d in os.listdir(REFS) if d != "core" and os.path.isdir(os.path.join(REFS, d)))
roots = [os.path.join(REFS, t) for t in trees]
guides = os.path.join(ROOT, "docs", "guides")
if os.path.isdir(guides): roots.append(guides)
md_files = []
for r in roots:
    for d, _, fs in os.walk(r):
        md_files += [os.path.join(d, f) for f in fs if f.endswith(".md")]
md_files.sort()
text = {p: read(p) for p in md_files}

def strip_code(s):
    out, inside = [], False
    for line in s.split("\n"):
        if line.lstrip().startswith("```"):
            inside = not inside; out.append(""); continue
        out.append("" if inside else line)
    return "\n".join(out)

def slug(h):
    h = h.strip().lower()
    h = re.sub(r"[^\w\- ]", "", h, flags=re.UNICODE)
    return h.replace(" ", "-")

anchor_cache = {}
def anchors_of(p):
    if p not in anchor_cache:
        s = strip_code(text[p] if p in text else read(p))
        seen, out = Counter(), set()
        for m in re.finditer(r"^#{1,6} (.+?)\s*#*\s*$", s, re.M):
            base = slug(m.group(1)); n = seen[base]; seen[base] += 1
            out.add(base if n == 0 else f"{base}-{n}")
        for m in re.finditer(r'<a id="([^"]+)"', s): out.add(m.group(1))
        anchor_cache[p] = out
    return anchor_cache[p]

# ---------------------------------------------------------------- check 1: links and anchors
for p in md_files:
    s = strip_code(text[p])
    for m in re.finditer(r"\[[^\]]*\]\(([^)\s]+)\)", s):
        target = m.group(1)
        if re.match(r"^[a-z]+:", target): continue
        path, _, frag = target.partition("#")
        dest = os.path.normpath(os.path.join(os.path.dirname(p), path)) if path else p
        if not os.path.exists(dest): fails[1].append(f"{rel(p)}: broken link {target}"); continue
        if frag and dest.endswith(".md") and frag not in anchors_of(dest):
            fails[1].append(f"{rel(p)}: unknown anchor {target}")

# ---------------------------------------------------------------- check 2: claims lint
allow_p = os.path.join(CORE, "scripts", "companions-claims-allowlist.txt")
allow = []
if os.path.exists(allow_p):
    for l in read(allow_p).split("\n"):
        l = l.strip()
        if l and not l.startswith("#") and "::" in l:
            f, sub = l.split("::", 1); allow.append((f.strip(), sub.strip()))
used = set()
CLAIM = re.compile(r"\b(validated|qualified|compliant|compliance-ready|tamper[- ]evident|tamper[- ]proof|durable|durability)\b", re.I)
NEG = re.compile(r"\b(not|no|never|nor|neither|without|cannot|can't|isn't|aren't|doesn't|won't|makes no|refus\w*|out of scope|consumer|companion|regulated user|liabilit\w*|claim\w*|responsib\w*|obligation\w*|unverified)\b", re.I)
# Package-name mask (ADR-DB-007): the name is intent only, never a claim.
NAME = re.compile(r"@bridger/durable-bus|bridger-durable-bus|durable-bus|Bridger Durable Bus|Durable Bus\b")
for p in md_files:
    lines_ = [NAME.sub("PKG", l) for l in text[p].split("\n")]
    for ln, line in enumerate(lines_, 1):
        window = " ".join(lines_[max(0, ln - 3):ln])
        if not CLAIM.search(line) or NEG.search(window): continue
        raw = text[p].split("\n")[ln - 1]
        hit = next((a for a in allow if a[0] == rel(p) and a[1] in raw), None)
        if hit: used.add(hit)
        else: fails[2].append(f"{rel(p)}:{ln}: unqualified claim word — {raw.strip()[:110]}")
for a in allow:
    if a not in used:
        fails[2].append(f"allowlist entry matches no flagged line: {a[0]} :: {a[1][:60]}")

# ---------------------------------------------------------------- check 3: own identifiers
prefix_tree = {}
for t in trees:
    ip = os.path.join(REFS, t, "index.yaml")
    if os.path.exists(ip):
        m = re.search(r"^infix:\s*(\w+)", read(ip), re.M)
        if m: prefix_tree[m.group(1)] = t
cdefs = defaultdict(set)   # (series, pfx) -> nums
for p in md_files:
    s = strip_code(text[p])
    for m in re.finditer(r"^#{2,3} (BEH|INV|RSK)-([A-Z]{2})-(\d{3})\b", s, re.M): cdefs[(m.group(1), m.group(2))].add(int(m.group(3)))
    for m in re.finditer(r'<a id="(req|rsk|inv)-([a-z]{2})-(\d{3})"', s): cdefs[(m.group(1).upper(), m.group(2).upper())].add(int(m.group(3)))
    for m in re.finditer(r"^\|\s*(?:<a id=\"[^\"]+\"></a>\s*)?(REQ|RSK)-([A-Z]{2})-(\d{3})\s*\|", s, re.M): cdefs[(m.group(1), m.group(2))].add(int(m.group(3)))
for pfx, t in prefix_tree.items():
    dd = os.path.join(REFS, t, "decisions")
    if os.path.isdir(dd):
        for f in os.listdir(dd):
            if re.match(r"\d{3}-.*\.md$", f): cdefs[("ADR", pfx)].add(int(f[:3]))
for p in md_files:
    ls_ = text[p].split("\n")
    for m in re.finditer(r"\b(BEH|INV|ADR|REQ|RSK)-([A-Z]{2})-(\d{3})\b", text[p]):
        s_, pfx, n = m.group(1), m.group(2), int(m.group(3))
        if pfx == "BR": continue
        ln = text[p].count("\n", 0, m.start())
        if "reserved" in " ".join(ls_[ln:ln + 2]): continue   # a reserved block remainder, named as such
        if pfx not in prefix_tree: fails[3].append(f"{rel(p)}: cites {s_}-{pfx}-{n:03d} of unknown tree"); continue
        if n not in cdefs[(s_, pfx)]: fails[3].append(f"{rel(p)}: cites undefined {s_}-{pfx}-{n:03d}")
fails[3] = sorted(set(fails[3]))

# ---------------------------------------------------------------- check 4: core identifiers
core_md = []
for d, _, fs in os.walk(CORE):
    if d.endswith(os.sep + "scripts"): continue
    core_md += [os.path.join(d, f) for f in fs if f.endswith(".md")]
bdefs = defaultdict(set)
for p in core_md:
    s = strip_code(read(p)); r = os.path.relpath(p, CORE)
    for m in re.finditer(r"^## (BEH|INV)-BR-(\d{3}):", s, re.M): bdefs[m.group(1)].add(int(m.group(2)))
    if r == "urs.md":
        for m in re.finditer(r"^### (URS|NFR)-BR-(\d{3}):", s, re.M): bdefs[m.group(1)].add(int(m.group(2)))
    if r == os.path.join("gxp", "03-risk-assessment.md"):
        for m in re.finditer(r'<a id="rsk-br-(\d{3})"', s): bdefs["RSK"].add(int(m.group(1)))
    if r == "traceability.md":
        sec5 = re.search(r"^## §5.*?(?=^## §6)", s, re.M | re.S)
        if sec5:
            for m in re.finditer(r"^\| REQ-BR-(\d{3}) \|", sec5.group(0), re.M): bdefs["REQ"].add(int(m.group(1)))
for f in os.listdir(os.path.join(CORE, "decisions")):
    if re.match(r"\d{3}-.*\.md$", f): bdefs["ADR"].add(int(f[:3]))
for p in md_files:
    for m in re.finditer(r"\b(BEH|INV|ADR|URS|NFR|RSK|REQ)-BR-(\d{3})\b", text[p]):
        if int(m.group(2)) not in bdefs[m.group(1)]: fails[4].append(f"{rel(p)}: cites undefined {m.group(1)}-BR-{m.group(2)}")
fails[4] = sorted(set(fails[4]))

# ---------------------------------------------------------------- check 5: structure
for t in trees:
    base = os.path.join(REFS, t)
    rp = os.path.join(base, "README.md")
    if not os.path.exists(rp): fails[5].append(f"{t}/README.md missing")
    else:
        s = read(rp)
        if "**Document Control**" not in s[:600]: fails[5].append(f"{t}/README.md: no Document Control table at top")
        if not re.search(r"\*\*implementation:\s*absent\*\*", s): fails[5].append(f"{t}/README.md: no '**implementation: absent**' line")
    for d, _, fs in os.walk(base):
        mds = sorted(f for f in fs if f.endswith(".md"))
        if not mds: continue
        ip = os.path.join(d, "index.yaml")
        if not os.path.exists(ip): fails[5].append(f"{rel(d)}/index.yaml missing"); continue
        listed = re.findall(r'file:\s*"([^"]+)"', read(ip))
        for f in sorted(set(mds) - set(listed)): fails[5].append(f"{rel(os.path.join(d, f))} on disk but not in index.yaml")
        for f in sorted(set(listed) - set(mds)): fails[5].append(f"{rel(d)}/index.yaml lists missing file {f}")
    for p in md_files:
        if p.startswith(base + os.sep) and "**Document Control**" not in text[p][:600]:
            fails[5].append(f"{rel(p)}: no Document Control table at top")

# ---------------------------------------------------------------- report
names = {1: "links and anchors", 2: "claims lint", 3: "companion identifiers defined",
         4: "core identifiers defined", 5: "README, Document Control and index.yaml"}
print(f"companion verification — trees: {', '.join(trees)}" + (", docs/guides" if os.path.isdir(guides) else ""))
print(f"files: {len(md_files)}")
total = 0
for i in range(1, 6):
    f = fails[i]
    print(f"[{'FAIL' if f else 'PASS':7}] {i}. {names[i]}")
    for x in f[:40]: print(f"           - {x}")
    if len(f) > 40: print(f"           … and {len(f) - 40} more")
    total += len(f)
print(f"\n{total} failure(s)")
sys.exit(1 if total else 0)
PY
