#!/usr/bin/env bash
# verify-traceability.sh — mechanical consistency checks for references/core/.
#
# Usage: bash references/core/scripts/verify-traceability.sh [--strict]
#
# Requires bash and python3 (standard library only). Implements the fourteen
# checks listed in process/requirement-id-scheme.md §5. Each check reports
# PASS, FAIL or PLANNED (a planned source/test path that correctly does not
# exist yet). Exit status is 1 if any check FAILs. --strict additionally fails
# on warnings.
set -euo pipefail
SPEC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$SPEC_DIR/../.." && pwd)"
STRICT=0
[[ "${1:-}" == "--strict" ]] && STRICT=1
exec python3 - "$SPEC_DIR" "$REPO_ROOT" "$STRICT" <<'PY'
import os, re, sys
from collections import Counter, defaultdict

SPEC, ROOT, STRICT = sys.argv[1], sys.argv[2], sys.argv[3] == "1"
fails, warns = defaultdict(list), defaultdict(list)
planned_count = 0

def rel(p): return os.path.relpath(p, SPEC)
def read(p):
    with open(p, encoding="utf-8") as f: return f.read()

# ---------------------------------------------------------------- inventory
md_files = []
for d, _, fs in os.walk(SPEC):
    if os.sep + "scripts" in d + os.sep and d.endswith("scripts"): continue
    for f in fs:
        if f.endswith(".md"): md_files.append(os.path.join(d, f))
md_files.sort()
text = {p: read(p) for p in md_files}

def strip_code(s):
    """Remove fenced code blocks (keep line count)."""
    out, inside = [], False
    for line in s.split("\n"):
        if line.lstrip().startswith("```"):
            inside = not inside; out.append(""); continue
        out.append("" if inside else line)
    return "\n".join(out)

def slug(h):
    h = h.strip().lower()
    h = re.sub(r"[^\w\- ]", "", h, flags=re.UNICODE).replace("_", "_")
    return h.replace(" ", "-")

def anchors_of(p):
    s = strip_code(text[p]) if p in text else ""
    seen, out = Counter(), set()
    for m in re.finditer(r"^#{1,6} (.+?)\s*#*\s*$", s, re.M):
        base = slug(m.group(1)); n = seen[base]; seen[base] += 1
        out.add(base if n == 0 else f"{base}-{n}")
    for m in re.finditer(r'<a id="([^"]+)"', s): out.add(m.group(1))
    return out

readme = text.get(os.path.join(SPEC, "README.md"), "")
m = re.search(r"\*\*implementation:\s*(absent|partial|present)\*\*", readme)
IMPL = m.group(1) if m else None
if IMPL is None: fails[8].append("README.md: missing '**implementation: absent|partial|present**' line")

# ---------------------------------------------------------------- definitions
defs = defaultdict(dict)          # series -> {num: file}
def define(series, num, p):
    if num in defs[series]: fails[6].append(f"{series}-BR-{num:03d} defined twice ({rel(defs[series][num])}, {rel(p)})")
    else: defs[series][num] = p

for p in md_files:
    s = strip_code(text[p])
    for m in re.finditer(r"^## (BEH|INV)-BR-(\d{3}):", s, re.M): define(m.group(1), int(m.group(2)), p)
    if rel(p) == "urs.md":
        for m in re.finditer(r"^### (URS|NFR)-BR-(\d{3}):", s, re.M): define(m.group(1), int(m.group(2)), p)
    if rel(p) == "gxp/03-risk-assessment.md":
        for m in re.finditer(r'<a id="rsk-br-(\d{3})"', s): define("RSK", int(m.group(1)), p)
    if rel(p) == "traceability.md":
        sec5 = re.search(r"^## §5.*?(?=^## §6)", s, re.M | re.S)
        if sec5:
            for m in re.finditer(r"^\| (REQ)-BR-(\d{3}) \|", sec5.group(0), re.M): define("REQ", int(m.group(2)), p)
adr_files = sorted(f for f in os.listdir(os.path.join(SPEC, "decisions")) if re.match(r"\d{3}-.*\.md$", f))
for f in adr_files: define("ADR", int(f[:3]), os.path.join(SPEC, "decisions", f))

# ---------------------------------------------------------------- check 1: index.yaml registries
def index_files(d):
    p = os.path.join(d, "index.yaml")
    if not os.path.exists(p): return None
    return re.findall(r'file:\s*"([^"]+)"', read(p))
for d in [SPEC] + [os.path.join(SPEC, x) for x in ("behaviors", "decisions", "gxp", "process", "appendices")]:
    listed = index_files(d)
    if listed is None: fails[1].append(f"{rel(d)}/index.yaml missing"); continue
    on_disk = sorted(f for f in os.listdir(d) if f.endswith(".md"))
    for f in sorted(set(on_disk) - set(listed)): fails[1].append(f"{rel(os.path.join(d, f))} on disk but not in index.yaml")
    for f in sorted(set(listed) - set(on_disk)): fails[1].append(f"{rel(d)}/index.yaml lists missing file {f}")

# ---------------------------------------------------------------- check 2: INV/ADR in traceability, ADR status
trace_p = os.path.join(SPEC, "traceability.md")
trace = strip_code(text.get(trace_p, ""))
def section(s, n):
    m = re.search(rf"^## §{n}\b.*?(?=^## §|\Z)", s, re.M | re.S)
    return m.group(0) if m else ""
for n in sorted(defs["INV"]):
    if not re.search(rf"^\|\s*\[?INV-BR-{n:03d}\b", section(trace, 2), re.M): fails[2].append(f"INV-BR-{n:03d} has no row in traceability.md §2")
adr_index = read(os.path.join(SPEC, "decisions", "index.yaml"))
idx_status = dict(re.findall(r'file:\s*"([^"]+)"\s*\n\s*title:[^\n]*\n\s*status:\s*"([^"]+)"', adr_index))
def dc_value(s, prop):
    m = re.search(rf"^>\s*\|\s*{re.escape(prop)}\s*\|\s*(.*?)\s*\|\s*$", s, re.M)
    return m.group(1).strip() if m else None
for f in adr_files:
    n = int(f[:3])
    if not re.search(rf"^\|\s*\[?ADR-BR-{n:03d}\b", section(trace, 3), re.M): fails[2].append(f"ADR-BR-{n:03d} has no row in traceability.md §3")
    st = dc_value(text[os.path.join(SPEC, "decisions", f)], "Status")
    if f not in idx_status: fails[2].append(f"decisions/{f} has no status in decisions/index.yaml")
    elif st != idx_status[f]: fails[2].append(f"decisions/{f}: Status '{st}' != index.yaml '{idx_status[f]}'")

# ---------------------------------------------------------------- check 3: URS/NFR in urs §6
urs = strip_code(text.get(os.path.join(SPEC, "urs.md"), ""))
urs6 = re.search(r"^## 6\. Traceability.*?(?=^## 7\.|\Z)", urs, re.M | re.S)
urs6 = urs6.group(0) if urs6 else ""
for series in ("URS", "NFR"):
    for n in sorted(defs[series]):
        if not re.search(rf"^\|\s*{series}-BR-{n:03d}\s*\|", urs6, re.M): fails[3].append(f"{series}-BR-{n:03d} has no row in urs.md §6")

# ---------------------------------------------------------------- check 4: risks
rsk_p = os.path.join(SPEC, "gxp", "03-risk-assessment.md")
# rigour levels listed in the validation plan's §4 table; each registered risk must be listed once, at the level its initial scoring gives
vp_p = os.path.join(SPEC, "gxp", "04-validation-plan.md")
rigour = {}
for lvl, cell in re.findall(r"^\|\s*(High|Medium|Low)\s*\|([^|]*)\|", text.get(vp_p, ""), re.M):
    for a, b in re.findall(r"RSK-BR-(\d{3})(?:\s+to\s+RSK-BR-(\d{3}))?", cell):
        for k in range(int(a), int(b or a) + 1): rigour.setdefault(k, []).append(lvl)
if rsk_p in text:
    rs = text[rsk_p]
    blocks = re.split(r'(?=<a id="rsk-br-\d{3}")', rs)
    for b in blocks:
        m = re.match(r'<a id="rsk-br-(\d{3})"', b)
        if not m: continue
        n = int(m.group(1)); b = b[:4000]
        ctrl = [(s_, int(x)) for s_, x in re.findall(r"\b(BEH|INV)-BR-(\d{3})\b", b)]
        if not ctrl: fails[4].append(f"RSK-BR-{n:03d} cites no BEH/INV control")
        for s_, x in ctrl:
            if x not in defs[s_]: fails[4].append(f"RSK-BR-{n:03d} cites undefined {s_}-BR-{x:03d}")
        if not re.search(rf"^\|\s*\[?RSK-BR-{n:03d}\b", section(trace, 7), re.M): fails[4].append(f"RSK-BR-{n:03d} has no row in traceability.md §7")
        sc = re.search(r"Initial scoring[^\n]*class \*\*(\w+)\*\*[^\n]*priority \*\*(\w+)\*\*", b)
        if not sc: fails[4].append(f"RSK-BR-{n:03d} has no initial class and priority")
        else:
            want = "High" if "High" in sc.groups() else sc.group(1)
            if rigour.get(n) != [want]: fails[4].append(f"RSK-BR-{n:03d} needs rigour {want} in gxp/04-validation-plan.md §4, found {rigour.get(n) or 'none'}")
else:
    fails[4].append("gxp/03-risk-assessment.md missing")

# ---------------------------------------------------------------- check 5: allocations + every cited id defined
cm_p = os.path.join(SPEC, "gxp", "02-compliance-matrix.md")
ALLOWED = {"Core", "Companion", "Consumer", "N/A"}
if cm_p in text:
    for table in re.findall(r"((?:^\|.*\|\s*\n)+)", strip_code(text[cm_p]), re.M):
        rows = [r for r in table.strip().split("\n")]
        hdr = [c.strip() for c in rows[0].strip("|").split("|")]
        if "Allocation" not in hdr: continue
        i = hdr.index("Allocation")
        for r in rows[2:]:
            cells = [c.strip() for c in r.strip().strip("|").split("|")]
            if len(cells) <= i: continue
            parts = [x.strip().strip("*") for x in cells[i].split("+")]
            if not all(x in ALLOWED for x in parts): fails[5].append(f"compliance matrix: bad allocation '{cells[i]}' in row '{cells[0][:40]}'")
else:
    fails[5].append("gxp/02-compliance-matrix.md missing")
for p in md_files:
    for m in re.finditer(r"\b(BEH|INV|URS|NFR|ADR|RSK|REQ)-BR-(\d{3})\b", text[p]):
        s_, n = m.group(1), int(m.group(2))
        if n not in defs[s_]: fails[5].append(f"{rel(p)}: cites undefined {s_}-BR-{n:03d}")
fails[5] = sorted(set(fails[5]))

# ---------------------------------------------------------------- check 6: uniqueness, blocks, contiguity
beh_index = read(os.path.join(SPEC, "behaviors", "index.yaml"))
blocks = {f: (int(a), int(b)) for f, a, b in re.findall(r'file:\s*"([^"]+)"[^\n]*\n(?:[^\n]*\n){2}\s*range:\s*"BEH-BR-(\d{3})\.\.(\d{3})"', beh_index)}
for n, p in defs["BEH"].items():
    f = os.path.basename(p)
    if f not in blocks: fails[6].append(f"BEH-BR-{n:03d} in {rel(p)}, which has no range in behaviors/index.yaml"); continue
    lo, hi = blocks[f]
    if not lo <= n <= hi: fails[6].append(f"BEH-BR-{n:03d} outside {f}'s block {lo:03d}..{hi:03d}")
for f, (lo, hi) in blocks.items():
    used = sorted(n for n, p in defs["BEH"].items() if os.path.basename(p) == f)
    if used and used != list(range(lo, lo + len(used))): fails[6].append(f"{f}: BEH ids not contiguous from {lo:03d}: {used}")
for series in ("INV", "URS", "NFR", "ADR", "RSK", "REQ"):
    nums = sorted(defs[series])
    if nums and nums != list(range(1, len(nums) + 1)): fails[6].append(f"{series}-BR ids not contiguous from 001: missing {sorted(set(range(1, max(nums)+1)) - set(nums))}")

# ---------------------------------------------------------------- check 7: BEH structure
RFC = re.compile(r"\b(MUST|MUST NOT|SHOULD|SHOULD NOT|MAY|SHALL|REQUIRED)\b")
for p in md_files:
    if "/behaviors/" not in p: continue
    lines = text[p].split("\n")
    heads = [i for i, l in enumerate(lines) if re.match(r"^## BEH-BR-\d{3}:", l)]
    for k, i in enumerate(heads):
        end = heads[k + 1] if k + 1 < len(heads) else len(lines)
        body = "\n".join(lines[i + 1:end])
        bq = next((l for l in lines[i + 1:i + 4] if l.strip()), "")
        hid = lines[i][3:13]
        if not bq.startswith(">") or "**" not in bq: fails[7].append(f"{rel(p)}: {hid} lacks a reference blockquote")
        reqs = re.findall(r"```[^\n]*\nREQUIREMENT:(.*?)```", body, re.S)
        if not reqs: fails[7].append(f"{rel(p)}: {hid} has no REQUIREMENT: block")
        elif not any(RFC.search(r) for r in reqs): fails[7].append(f"{rel(p)}: {hid} REQUIREMENT lacks RFC 2119 keyword")

# ---------------------------------------------------------------- check 8: Document Control
PROPS = ["Document ID", "Revision", "Effective Date", "Status", "Author", "Reviewed by", "Approved by", "Classification", "Change History"]
DOC_ST = {"Draft", "In Review", "Approved", "Effective", "Superseded", "Withdrawn"}
ADR_ST = {"Proposed", "Accepted", "Superseded", "Withdrawn"}
for p in md_files:
    s = text[p]
    if "**Document Control**" not in s[:600]: fails[8].append(f"{rel(p)}: no Document Control table at top"); continue
    for prop in PROPS:
        if dc_value(s, prop) is None: fails[8].append(f"{rel(p)}: Document Control lacks '{prop}'")
    st = dc_value(s, "Status") or ""
    base = st.split(" — ")[0].strip()
    allowed = ADR_ST if "/decisions/" in p else DOC_ST
    if base not in allowed: fails[8].append(f"{rel(p)}: Status '{st}' not allowed")
    if IMPL == "absent" and base in ("Effective", "Accepted"): fails[8].append(f"{rel(p)}: Status '{base}' while implementation is absent")

# ---------------------------------------------------------------- check 9: planned paths
for p in md_files:
    for m in re.finditer(r"`((?:packages|apps|examples|features|scripts)/[^`\s]+)`\s*\*?\(?(Planned|Exists)\)?\*?", text[p]):
        path, st = m.group(1), m.group(2)
        exists = os.path.exists(os.path.join(ROOT, path))
        if st == "Planned":
            if exists: fails[9].append(f"{rel(p)}: {path} is marked Planned but exists")
            else: planned_count += 1
        elif not exists: fails[9].append(f"{rel(p)}: {path} is marked Exists but is missing")

# ---------------------------------------------------------------- check 10: REQ
sec5 = section(trace, 5)
for m in re.finditer(r"^\|\s*REQ-BR-(\d{3})\s*\|(.*)$", sec5, re.M):
    cited = re.findall(r"BEH-BR-(\d{3})", m.group(2))
    if not cited: fails[10].append(f"REQ-BR-{m.group(1)} cites no BEH")
    for x in cited:
        if int(x) not in defs["BEH"]: fails[10].append(f"REQ-BR-{m.group(1)} cites undefined BEH-BR-{x}")

# ---------------------------------------------------------------- check 11: claims lint
allow_p = os.path.join(SPEC, "scripts", "claims-allowlist.txt")
allow = []
if os.path.exists(allow_p):
    for l in read(allow_p).split("\n"):
        l = l.strip()
        if l and not l.startswith("#") and "::" in l:
            f, sub = l.split("::", 1); allow.append((f.strip(), sub.strip()))
used = set()
CLAIM = re.compile(r"\b(validated|qualified|compliant|compliance-ready|tamper[- ]evident|tamper[- ]proof|durable|durability)\b", re.I)
NEG = re.compile(r"\b(not|no|never|nor|neither|without|cannot|can't|isn't|aren't|doesn't|won't|makes no|refus\w*|out of scope|consumer|companion|regulated user|liabilit\w*|claim\w*|responsib\w*|obligation\w*|unverified)\b", re.I)
for p in md_files:
    lines_ = text[p].split("\n")
    for ln, line in enumerate(lines_, 1):
        window = " ".join(lines_[max(0, ln - 3):ln])   # a negation may sit on the two lines a sentence wrapped from
        if not CLAIM.search(line) or NEG.search(window): continue
        hit = next((a for a in allow if a[0] == rel(p) and a[1] in line), None)
        if hit: used.add(hit)
        else: fails[11].append(f"{rel(p)}:{ln}: unqualified claim word — {line.strip()[:110]}")
for a in allow:
    if a not in used:
        ok = any(a[0] == rel(p) and a[1] in text[p] for p in md_files)
        if not ok: fails[11].append(f"claims-allowlist entry no longer matches: {a[0]} :: {a[1][:60]}")

# ---------------------------------------------------------------- check 12: links and anchors
anchor_cache = {}
for p in md_files:
    s = strip_code(text[p])
    for m in re.finditer(r"\[[^\]]*\]\(([^)\s]+)\)", s):
        target = m.group(1)
        if re.match(r"^[a-z]+:", target) or target.startswith("mailto:"): continue
        path, _, frag = target.partition("#")
        dest = os.path.normpath(os.path.join(os.path.dirname(p), path)) if path else p
        if not os.path.exists(dest): fails[12].append(f"{rel(p)}: broken link {target}"); continue
        if frag and dest.endswith(".md"):
            if dest not in text and dest not in anchor_cache:
                text[dest] = read(dest)
            if dest not in anchor_cache: anchor_cache[dest] = anchors_of(dest)
            if frag not in anchor_cache[dest]: fails[12].append(f"{rel(p)}: unknown anchor {target}")

# ---------------------------------------------------------------- check 13: CCR register
hist = re.search(r"^## Document history.*", readme, re.M | re.S)
registered = set(re.findall(r"^\|\s*(CCR-BR-\d{3})\s*\|", hist.group(0) if hist else "", re.M))
for p in md_files:
    for c in set(re.findall(r"CCR-BR-\d{3}", text[p])):
        if c not in registered: fails[13].append(f"{rel(p)}: cites unregistered {c}")

# ---------------------------------------------------------------- check 14: SPEC.md coverage
spec_md = os.path.join(ROOT, "docs", "SPEC.md")
map_p = os.path.join(SPEC, "appendices", "spec-md-migration-map.md")
if not os.path.exists(spec_md): fails[14].append("docs/SPEC.md missing")
else:
    sm = read(spec_md)
    if "Superseded by" not in sm[:1500]: fails[14].append("docs/SPEC.md lacks its superseded banner")
    mp = text.get(map_p, "")
    if not mp: fails[14].append("appendices/spec-md-migration-map.md missing")
    for h in re.findall(r"^#{2,3} (.+)$", strip_code(sm), re.M):
        if h.strip() not in mp: fails[14].append(f"SPEC.md heading not in migration map: '{h.strip()}'")

# ---------------------------------------------------------------- report
names = {1: "index.yaml registries", 2: "INV/ADR traceability and ADR status", 3: "URS/NFR traceability",
         4: "risks have controls and rows", 5: "allocations and defined identifiers", 6: "identifier hygiene",
         7: "behaviour structure", 8: "Document Control", 9: "planned paths", 10: "acceptance scenarios",
         11: "claims lint", 12: "links and anchors", 13: "CCR register", 14: "SPEC.md coverage"}
print(f"references/core verification — implementation: {IMPL}")
print(f"defined: " + ", ".join(f"{k} {len(v)}" for k, v in sorted(defs.items())))
total = 0
for i in range(1, 15):
    f = fails[i]
    status = "FAIL" if f else ("PLANNED" if i == 9 and planned_count else "PASS")
    extra = f" ({planned_count} planned paths)" if i == 9 else ""
    print(f"[{status:7}] {i:2}. {names[i]}{extra}")
    for x in f[:40]: print(f"           - {x}")
    if len(f) > 40: print(f"           … and {len(f) - 40} more")
    total += len(f)
print(f"\n{total} failure(s)")
sys.exit(1 if total else 0)
PY
