#!/usr/bin/env bash
# verify-traceability.sh — mechanical consistency checks for references/gxp/.
#
# Usage: bash references/gxp/scripts/verify-traceability.sh [--strict]
#
# Copied from references/core/scripts/verify-traceability.sh and adapted
# (ADR-GX-028); a shared engine is deferred to a later CCR on both sides.
# Requires bash and python3 (standard library only). Implements the eighteen
# checks listed in process/requirement-id-scheme.md §5. Each check reports
# PASS, FAIL or PLANNED (a planned source/test path that correctly does not
# exist yet). Exit status is 1 if any check FAILs. --strict additionally fails
# on warnings (a core identifier listed in the core interface map that no
# document cites).
set -euo pipefail
SPEC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$SPEC_DIR/../.." && pwd)"
CORE_DIR="$REPO_ROOT/references/core"
STRICT=0
[[ "${1:-}" == "--strict" ]] && STRICT=1
exec python3 - "$SPEC_DIR" "$REPO_ROOT" "$CORE_DIR" "$STRICT" <<'PY'
import base64, hashlib, hmac, json, os, re, subprocess, sys
from collections import Counter, defaultdict

SPEC, ROOT, CORE, STRICT = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4] == "1"
fails, warns = defaultdict(list), defaultdict(list)
planned_count = 0
SERIES = ("BEH", "INV", "URS", "NFR", "ADR", "RSK", "REQ")

def rel(p): return os.path.relpath(p, SPEC)
def read(p):
    with open(p, encoding="utf-8") as f: return f.read()

def md_inventory(base):
    out = []
    for d, _, fs in os.walk(base):
        if os.path.basename(d) == "scripts": continue
        for f in fs:
            if f.endswith(".md"): out.append(os.path.join(d, f))
    return sorted(out)

# ---------------------------------------------------------------- inventory
md_files = md_inventory(SPEC)
text = {p: read(p) for p in md_files}

def strip_code(s, kinds=None):
    """Blank fenced code blocks, keeping the line count. With `kinds`, blank
    only fences whose info string is one of them (the fence lines always)."""
    out, inside, blank = [], False, True
    for line in s.split("\n"):
        st = line.lstrip()
        if st.startswith("```"):
            if not inside:
                info = st[3:].strip().split(" ")[0]
                blank = kinds is None or info in kinds
            inside = not inside; out.append(""); continue
        out.append("" if inside and blank else line)
    return "\n".join(out)

def slug(h):
    h = h.strip().lower()
    h = re.sub(r"[^\w\- ]", "", h, flags=re.UNICODE)
    return h.replace(" ", "-")

def anchors_of(src):
    s = strip_code(src)
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

# ---------------------------------------------------------------- definitions (one tree, one infix)
def collect_defs(base, files, txt, infix, errs):
    d = defaultdict(dict)
    def define(series, num, p):
        if num in d[series]:
            if errs is not None: errs.append(f"{series}-{infix}-{num:03d} defined twice ({os.path.relpath(d[series][num], base)}, {os.path.relpath(p, base)})")
        else: d[series][num] = p
    lo = infix.lower()
    for p in files:
        s = strip_code(txt[p]); r = os.path.relpath(p, base)
        for m in re.finditer(rf"^## (BEH|INV)-{infix}-(\d{{3}}):", s, re.M): define(m.group(1), int(m.group(2)), p)
        if r == "urs.md":
            for m in re.finditer(rf"^### (URS|NFR)-{infix}-(\d{{3}}):", s, re.M): define(m.group(1), int(m.group(2)), p)
        if r == os.path.join("gxp", "03-risk-assessment.md"):
            for m in re.finditer(rf'<a id="rsk-{lo}-(\d{{3}})"', s): define("RSK", int(m.group(1)), p)
        if r == "traceability.md":
            sec5 = re.search(r"^## §5.*?(?=^## §6)", s, re.M | re.S)
            if sec5:
                for m in re.finditer(rf"^\| (REQ)-{infix}-(\d{{3}}) \|", sec5.group(0), re.M): define("REQ", int(m.group(2)), p)
    ddir = os.path.join(base, "decisions")
    adrs = sorted(f for f in os.listdir(ddir) if re.match(r"\d{3}-.*\.md$", f)) if os.path.isdir(ddir) else []
    for f in adrs: define("ADR", int(f[:3]), os.path.join(ddir, f))
    return d, adrs

defs, adr_files = collect_defs(SPEC, md_files, text, "GX", fails[6])
core_files = md_inventory(CORE) if os.path.isdir(CORE) else []
core_text = {p: read(p) for p in core_files}
core_defs, _ = collect_defs(CORE, core_files, core_text, "BR", None)

# ---------------------------------------------------------------- check 1: index.yaml registries
def index_files(d):
    p = os.path.join(d, "index.yaml")
    if not os.path.exists(p): return None
    return re.findall(r'file:\s*"([^"]+)"', read(p))
root_idx = os.path.join(SPEC, "index.yaml")
if os.path.exists(root_idx):
    ri = read(root_idx)
    if not re.search(r"^package:\s*bridger-gxp\s*$", ri, re.M) or not re.search(r"^infix:\s*GX\s*$", ri, re.M):
        fails[1].append("index.yaml: package must be bridger-gxp and infix GX")
for d in [SPEC] + [os.path.join(SPEC, x) for x in ("behaviors", "decisions", "gxp", "process", "appendices")]:
    listed = index_files(d)
    if listed is None: fails[1].append(f"{rel(d)}/index.yaml missing"); continue
    if "package: bridger-gxp" not in read(os.path.join(d, "index.yaml")): fails[1].append(f"{rel(d)}/index.yaml: package is not bridger-gxp")
    on_disk = sorted(f for f in os.listdir(d) if f.endswith(".md")) if os.path.isdir(d) else []
    for f in sorted(set(on_disk) - set(listed)): fails[1].append(f"{rel(os.path.join(d, f))} on disk but not in index.yaml")
    for f in sorted(set(listed) - set(on_disk)): fails[1].append(f"{rel(d)}/index.yaml lists missing file {f}")

# ---------------------------------------------------------------- check 2: INV/ADR in traceability, ADR status
trace_p = os.path.join(SPEC, "traceability.md")
trace = strip_code(text.get(trace_p, ""))
def section(s, n):
    m = re.search(rf"^## §{n}\b.*?(?=^## §|\Z)", s, re.M | re.S)
    return m.group(0) if m else ""
for n in sorted(defs["INV"]):
    if not re.search(rf"^\|\s*\[?INV-GX-{n:03d}\b", section(trace, 2), re.M): fails[2].append(f"INV-GX-{n:03d} has no row in traceability.md §2")
adr_idx_p = os.path.join(SPEC, "decisions", "index.yaml")
adr_index = read(adr_idx_p) if os.path.exists(adr_idx_p) else ""
idx_status = dict(re.findall(r'file:\s*"([^"]+)"\s*\n\s*title:[^\n]*\n\s*status:\s*"([^"]+)"', adr_index))
def dc_value(s, prop):
    m = re.search(rf"^>\s*\|\s*{re.escape(prop)}\s*\|\s*(.*?)\s*\|\s*$", s, re.M)
    return m.group(1).strip() if m else None
for f in adr_files:
    n = int(f[:3])
    if not re.search(rf"^\|\s*\[?ADR-GX-{n:03d}\b", section(trace, 3), re.M): fails[2].append(f"ADR-GX-{n:03d} has no row in traceability.md §3")
    st = dc_value(text[os.path.join(SPEC, "decisions", f)], "Status")
    if f not in idx_status: fails[2].append(f"decisions/{f} has no status in decisions/index.yaml")
    elif st != idx_status[f]: fails[2].append(f"decisions/{f}: Status '{st}' != index.yaml '{idx_status[f]}'")

# ---------------------------------------------------------------- check 3: URS/NFR in urs §6
urs = strip_code(text.get(os.path.join(SPEC, "urs.md"), ""))
urs6 = re.search(r"^## 6\. Traceability.*?(?=^## 7\.|\Z)", urs, re.M | re.S)
urs6 = urs6.group(0) if urs6 else ""
for series in ("URS", "NFR"):
    for n in sorted(defs[series]):
        if not re.search(rf"^\|\s*\[?{series}-GX-{n:03d}\b", urs6, re.M): fails[3].append(f"{series}-GX-{n:03d} has no row in urs.md §6")

# ---------------------------------------------------------------- check 4: risks
rsk_p = os.path.join(SPEC, "gxp", "03-risk-assessment.md")
if rsk_p in text:
    for b in re.split(r'(?=<a id="rsk-gx-\d{3}")', text[rsk_p]):
        m = re.match(r'<a id="rsk-gx-(\d{3})"', b)
        if not m: continue
        n = int(m.group(1)); b = b[:4000]
        ctrl = [(s_, int(x)) for s_, x in re.findall(r"\b(BEH|INV)-GX-(\d{3})\b", b)]
        if not ctrl: fails[4].append(f"RSK-GX-{n:03d} cites no BEH-GX/INV-GX control")
        for s_, x in ctrl:
            if x not in defs[s_]: fails[4].append(f"RSK-GX-{n:03d} cites undefined {s_}-GX-{x:03d}")
        if not re.search(rf"^\|\s*\[?RSK-GX-{n:03d}\b", section(trace, 7), re.M): fails[4].append(f"RSK-GX-{n:03d} has no row in traceability.md §7")
else:
    fails[4].append("gxp/03-risk-assessment.md missing")

# ---------------------------------------------------------------- check 5: allocations + every cited GX id defined
cm_p = os.path.join(SPEC, "gxp", "02-compliance-matrix.md")
ALLOWED = {"Core", "Companion", "Consumer", "N/A"}
if cm_p in text:
    for table in re.findall(r"((?:^\|.*\|\s*\n)+)", strip_code(text[cm_p]), re.M):
        rows = table.strip().split("\n")
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
    for m in re.finditer(r"\b(BEH|INV|URS|NFR|ADR|RSK|REQ)-GX-(\d{3})\b", text[p]):
        s_, n = m.group(1), int(m.group(2))
        if n not in defs[s_]: fails[5].append(f"{rel(p)}: cites undefined {s_}-GX-{n:03d}")
fails[5] = sorted(set(fails[5]))

# ---------------------------------------------------------------- check 6: uniqueness, blocks, contiguity
beh_idx_p = os.path.join(SPEC, "behaviors", "index.yaml")
beh_index = read(beh_idx_p) if os.path.exists(beh_idx_p) else ""
blocks = {f: (int(a), int(b)) for f, a, b in re.findall(r'file:\s*"([^"]+)"[^\n]*\n(?:[^\n]*\n){2}\s*range:\s*"BEH-GX-(\d{3})\.\.(\d{3})"', beh_index)}
for n, p in defs["BEH"].items():
    f = os.path.basename(p)
    if f not in blocks: fails[6].append(f"BEH-GX-{n:03d} in {rel(p)}, which has no range in behaviors/index.yaml"); continue
    lo, hi = blocks[f]
    if not lo <= n <= hi: fails[6].append(f"BEH-GX-{n:03d} outside {f}'s block {lo:03d}..{hi:03d}")
for f, (lo, hi) in blocks.items():
    used = sorted(n for n, p in defs["BEH"].items() if os.path.basename(p) == f)
    if used and used != list(range(lo, lo + len(used))): fails[6].append(f"{f}: BEH ids not contiguous from {lo:03d}: {used}")
for series in ("INV", "URS", "NFR", "ADR", "RSK", "REQ"):
    nums = sorted(defs[series])
    if nums and nums != list(range(1, len(nums) + 1)): fails[6].append(f"{series}-GX ids not contiguous from 001: missing {sorted(set(range(1, max(nums)+1)) - set(nums))}")

# ---------------------------------------------------------------- check 7: BEH structure
RFC = re.compile(r"\b(MUST|MUST NOT|SHOULD|SHOULD NOT|MAY|SHALL|REQUIRED)\b")
for p in md_files:
    if os.sep + "behaviors" + os.sep not in p: continue
    lines = text[p].split("\n")
    heads = [i for i, l in enumerate(lines) if re.match(r"^## BEH-GX-\d{3}:", l)]
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
    did = dc_value(s, "Document ID") or ""
    if not did.startswith("BRIDGER-GX-"): fails[8].append(f"{rel(p)}: Document ID '{did}' does not start with BRIDGER-GX-")
    st = dc_value(s, "Status") or ""
    base = st.split(" — ")[0].strip()
    allowed = ADR_ST if os.sep + "decisions" + os.sep in p else DOC_ST
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
for m in re.finditer(r"^\|\s*REQ-GX-(\d{3})\s*\|(.*)$", sec5, re.M):
    cited = re.findall(r"BEH-GX-(\d{3})", m.group(2))
    if not cited: fails[10].append(f"REQ-GX-{m.group(1)} cites no BEH-GX")
    for x in cited:
        if int(x) not in defs["BEH"]: fails[10].append(f"REQ-GX-{m.group(1)} cites undefined BEH-GX-{x}")

# ---------------------------------------------------------------- check 11: claims lint (sentence-scoped, stricter than core's)
allow_p = os.path.join(SPEC, "scripts", "claims-allowlist.txt")
allow = []
if os.path.exists(allow_p):
    for l in read(allow_p).split("\n"):
        l = l.strip()
        if l and not l.startswith("#") and "::" in l:
            f, sub = l.split("::", 1); allow.append((f.strip(), sub.strip()))
used = set()
CLAIM = re.compile(r"\b(validated|qualified|compliant|compliance-ready|tamper[- ]evident|tamper[- ]proof|durable|durability|"
                   r"integrity|intact|immutable|authentic(?!at)\w*|non-repudiat\w*|legally binding|guarantee\w*|secure)\b", re.I)
TPROOF = re.compile(r"\btamper[- ]proof\b", re.I)
NEG = re.compile(r"\b(not|no|never|nor|neither|without|cannot|does not|makes no|out of scope|consumer|regulated user)\b", re.I)
TPROOF_FILE = os.path.join("decisions", "027-claims-and-non-claims.md")

def sentences(src):
    """Yield (sentence, [line numbers]) over prose, table rows and REQUIREMENT
    blocks; ts and vector fences are skipped (their identifiers are code)."""
    # link targets are removed: an anchor slug repeats its heading, which is linted where it stands
    lines_ = [re.sub(r"\]\([^)\s]*\)", "]", l) for l in
              strip_code(src, kinds={"ts", "typescript", "vector", "json", "yaml", "bash", "sh"}).split("\n")]
    # A list item is its own unit; its first sentence is read together with the
    # lead-in sentence that introduced the list when that sentence ends with
    # ":" ("No document may state that the companion: 1. …" is one sentence).
    ITEM = re.compile(r"^\s*(?:\d+\.|[-*+])\s")
    def split(para):
        if not para: return []
        joined, owner = "", []
        for ln, l in para:
            piece = l.strip() + " "
            joined += piece; owner += [ln] * len(piece)
        out, start = [], 0
        for m in re.finditer(r"(?<=[.!?])\s+(?!\d)|$", joined):
            end = m.start()
            if end > start: out.append((joined[start:end], sorted(set(owner[start:end]))))
            start = m.end()
        return out
    para, is_item, lead, out = [], False, "", []
    def flush():
        nonlocal para, is_item, lead
        sents = split(para)
        if sents and is_item and lead:
            sents[0] = (lead + " " + sents[0][0], sents[0][1])
        if sents and not is_item:
            last = sents[-1][0].rstrip()
            lead = last if last.endswith(":") else ""
        out.extend(sents); para = []
    for ln, l in enumerate(lines_, 1):
        if not l.strip():
            flush()
        elif l.lstrip().startswith("|"):        # a table row is its own unit
            flush(); lead = ""; out.append((l.strip(), [ln]))
        elif ITEM.match(l):
            flush(); is_item = True; para = [(ln, ITEM.sub("", l))]   # "17." is a marker, not a sentence
        else:
            if not para and is_item and not l.startswith(" "): is_item = False
            para.append((ln, l))
    flush()
    return out

for p in md_files:
    raw_lines = text[p].split("\n")
    for sent, lns in sentences(text[p]):
        if not CLAIM.search(sent): continue
        span = [raw_lines[i - 1] for i in lns]
        hit = next((a for a in allow if a[0] == rel(p) and (a[1] in sent or any(a[1] in x for x in span))), None)
        first = next((i for i in lns if CLAIM.search(raw_lines[i - 1])), lns[0])
        if TPROOF.search(sent):
            if hit: used.add(hit); continue
            if rel(p) == TPROOF_FILE: continue
            fails[11].append(f"{rel(p)}:{first}: 'tamper-proof' outside ADR-GX-027 and the allowlist — {sent.strip()[:100]}")
            continue
        if NEG.search(sent): continue
        if hit: used.add(hit)
        else: fails[11].append(f"{rel(p)}:{first}: unqualified claim word '{CLAIM.search(sent).group(0)}' — {sent.strip()[:100]}")
for a in allow:
    if a not in used:
        if not any(a[0] == rel(p) and a[1] in text[p] for p in md_files):
            fails[11].append(f"claims-allowlist entry no longer matches: {a[0]} :: {a[1][:60]}")

# ---------------------------------------------------------------- check 12: links and anchors (into ../core too)
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
            if dest not in anchor_cache:
                src = text.get(dest) or core_text.get(dest) or read(dest)
                anchor_cache[dest] = anchors_of(src)
            if frag not in anchor_cache[dest]: fails[12].append(f"{rel(p)}: unknown anchor {target}")

# ---------------------------------------------------------------- check 13: CCR registers (own and core's)
def register(readme_text, infix):
    hist = re.search(r"^## Document history.*", readme_text, re.M | re.S)
    return set(re.findall(rf"^\|\s*(CCR-{infix}-\d{{3}})\s*\|", hist.group(0) if hist else "", re.M))
gx_reg = register(readme, "GX")
core_readme_p = os.path.join(CORE, "README.md")
br_reg = register(read(core_readme_p), "BR") if os.path.exists(core_readme_p) else set()
if not gx_reg: fails[13].append("README.md: no CCR-GX in the Document history register")
for p in md_files:
    for c in sorted(set(re.findall(r"CCR-GX-\d{3}", text[p]))):
        if c not in gx_reg: fails[13].append(f"{rel(p)}: cites unregistered {c}")
    for c in sorted(set(re.findall(r"CCR-BR-\d{3}", text[p]))):
        if c not in br_reg: fails[13].append(f"{rel(p)}: cites {c}, which is not in core's register")

# ---------------------------------------------------------------- check 14: core identifiers defined and mapped
map_p = os.path.join(SPEC, "appendices", "core-interface-map.md")
map_text = text.get(map_p, "")
if not map_text: fails[14].append("appendices/core-interface-map.md missing")
mapped = set(re.findall(r"\b((?:BEH|INV|URS|NFR|ADR|RSK|REQ)-BR-\d{3})\b", map_text))
cited_br = defaultdict(set)
for p in md_files:
    for m in re.finditer(r"\b(BEH|INV|URS|NFR|ADR|RSK|REQ)-BR-(\d{3})\b", text[p]):
        cited_br[f"{m.group(1)}-BR-{m.group(2)}"].add(rel(p))
for ident, where in sorted(cited_br.items()):
    s_, _, n = ident.split("-")
    if int(n) not in core_defs[s_]: fails[14].append(f"{ident} cited in {sorted(where)[0]} is not defined in references/core")
    elif ident not in mapped: fails[14].append(f"{ident} cited in {sorted(where)[0]} is not listed in the core interface map")
for ident in sorted(mapped):
    if not any(r != rel(map_p) for r in cited_br.get(ident, ())):
        warns[14].append(f"{ident} is listed in the core interface map but cited by no other document")

# ---------------------------------------------------------------- check 15: core's checker passes
core_script = os.path.join(CORE, "scripts", "verify-traceability.sh")
if not os.path.exists(core_script): fails[15].append("references/core/scripts/verify-traceability.sh missing")
else:
    r = subprocess.run(["bash", core_script, "--strict"], capture_output=True, text=True)
    if r.returncode != 0:
        tail = [l for l in r.stdout.strip().split("\n") if l.strip()][-3:]
        fails[15].append("core checker --strict failed: " + " | ".join(x.strip() for x in tail))

# ---------------------------------------------------------------- check 16: Regulatory lines say "supports"
FORBIDDEN_VERB = re.compile(r"\b(satisf\w*|meets?|compl(?:y|ies|iant)|fulfil\w*|ensures?|achieves?|conforms?)\b", re.I)
for p in md_files:
    for ln, line in enumerate(text[p].split("\n"), 1):
        m = re.match(r"^>?\s*\*\*Regulatory:\*\*\s*(.*)$", line)
        if not m: continue
        body = m.group(1)
        if not body.lower().startswith("supports"): fails[16].append(f"{rel(p)}:{ln}: Regulatory line does not begin with 'supports'")
        if FORBIDDEN_VERB.search(body): fails[16].append(f"{rel(p)}:{ln}: Regulatory line uses '{FORBIDDEN_VERB.search(body).group(0)}'")

# ---------------------------------------------------------------- check 17: test vectors recompute
def es_number(x):
    """ECMAScript Number::toString of a finite double, as RFC 8785 §3.2.2.3 requires."""
    from decimal import Decimal
    if x != x or x in (float("inf"), float("-inf")): raise ValueError(f"non-finite number {x!r} is outside I-JSON")
    if x == 0: return "0"
    if x < 0: return "-" + es_number(-x)
    t = Decimal(repr(x)).normalize().as_tuple()
    d = "".join(map(str, t.digits)); k = len(d); n = k + t.exponent
    if k <= n <= 21: return d + "0" * (n - k)
    if 0 < n <= 21: return d[:n] + "." + d[n:]
    if -6 < n <= 0: return "0." + "0" * (-n) + d
    e = n - 1; es = ("+" if e >= 0 else "-") + str(abs(e))
    return (d if k == 1 else d[0] + "." + d[1:]) + "e" + es

def jcs(v):
    """RFC 8785: sorted keys (UTF-16 order), no whitespace, JSON string escaping
    with non-ASCII left literal, numbers as ECMAScript writes them (I-JSON
    domain; records may carry non-integer annotation values since CCR-BR-018)."""
    if isinstance(v, dict):
        return "{" + ",".join(json.dumps(k, ensure_ascii=False) + ":" + jcs(v[k]) for k in sorted(v, key=lambda k: k.encode("utf-16-be"))) + "}"
    if isinstance(v, list): return "[" + ",".join(jcs(x) for x in v) + "]"
    if v is True: return "true"
    if v is False: return "false"
    if v is None: return "null"
    if isinstance(v, int):
        if abs(v) > 2**53 - 1: raise ValueError(f"integer {v} is outside I-JSON's exact range")
        return str(v)
    if isinstance(v, float): return es_number(v)
    if isinstance(v, str): return json.dumps(v, ensure_ascii=False)
    raise ValueError(f"value {v!r} is outside the canonical domain")

assert [es_number(x) for x in (1e-7, 99.5, 1e21, 123456789012345680000.0, 0.000001, -2.5, 5e-324)] == ["1e-7", "99.5", "1e+21", "123456789012345680000", "0.000001", "-2.5", "5e-324"]

def b64url(b): return base64.urlsafe_b64encode(b).decode("ascii").rstrip("=")

# behaviors/13 BEH-GX-099: fp1:hmac-sha256:<keyId>:<43-char base64url MAC>,
# key id ^[A-Za-z0-9._:-]{1,64}$ (may contain ":", so the MAC is split off the right)
FP_KEYID = re.compile(r"[A-Za-z0-9._:-]{1,64}")
FP_MAC = re.compile(r"[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]")   # 32 bytes, unpadded
def fingerprint_error(fp):
    if not fp.startswith("fp1:hmac-sha256:"): return "lacks the prefix fp1:hmac-sha256:"
    key_id, _, mac = fp[len("fp1:hmac-sha256:"):].rpartition(":")
    if not FP_KEYID.fullmatch(key_id): return f"key id {key_id!r} does not match ^[A-Za-z0-9._:-]{{1,64}}$"
    if not FP_MAC.fullmatch(mac): return f"MAC {mac!r} is not 43 base64url characters encoding 32 bytes"
    return None

def fp_fields(x):
    """Every value of a "fingerprint" key in a vector, whatever its prefix."""
    if isinstance(x, dict):
        for k, y in x.items():
            if k == "fingerprint" and isinstance(y, str): yield y
            else: yield from fp_fields(y)
    elif isinstance(x, list):
        for y in x: yield from fp_fields(y)

VECTOR_FILES = {os.path.join("behaviors", "03-trail-sink.md"): ("input", "canonical", "sha256"),
                os.path.join("behaviors", "09-approval-tickets.md"): ("input", "canonical", "sha256"),
                os.path.join("behaviors", "13-config-fingerprints.md"): ("key_hex", "input", "canonical", "hmac_b64url")}
vector_count = 0
for vf, keys in VECTOR_FILES.items():
    p = os.path.join(SPEC, vf)
    if p not in text: fails[17].append(f"{vf} missing"); continue
    blocks_ = re.findall(r"^```vector[^\n]*\n(.*?)^```", text[p], re.M | re.S)
    if not blocks_: fails[17].append(f"{vf}: no ```vector block"); continue
    for k, raw in enumerate(blocks_, 1):
        where = f"{vf} vector {k}"
        try: v = json.loads(raw)
        except ValueError as e: fails[17].append(f"{where}: not JSON ({e})"); continue
        for fp in sorted(set(re.findall(r"fp1:[^\s\"\\]*", raw)) | set(fp_fields(v))):   # in input and in canonical
            err = fingerprint_error(fp)
            if err: fails[17].append(f"{where}: fingerprint {fp[:60]} {err}")
        if not isinstance(v, dict) or set(v) != set(keys): fails[17].append(f"{where}: keys must be exactly {sorted(keys)}"); continue
        try: canon = jcs(v["input"])
        except ValueError as e: fails[17].append(f"{where}: {e}"); continue
        if canon != v["canonical"]: fails[17].append(f"{where}: canonical form differs; recomputed {canon[:80]}"); continue
        data = canon.encode("utf-8")
        if "sha256" in keys:
            want = hashlib.sha256(data).hexdigest()
            got = v["sha256"][7:] if str(v["sha256"]).startswith("sha256:") else v["sha256"]
            if got != want: fails[17].append(f"{where}: sha256 differs; recomputed {want}")
        else:
            try: key = bytes.fromhex(v["key_hex"])
            except ValueError: fails[17].append(f"{where}: key_hex is not hex"); continue
            want = b64url(hmac.new(key, data, hashlib.sha256).digest())
            if v["hmac_b64url"] != want: fails[17].append(f"{where}: hmac_b64url differs; recomputed {want}")
        vector_count += 1

# every ```vector block must sit in a file listed above, so none escapes recomputation
for p in md_files:
    if rel(p) not in VECTOR_FILES and re.search(r"^```vector", text[p], re.M):
        fails[17].append(f"{rel(p)}: has a ```vector block but is not in VECTOR_FILES, so it is never recomputed")

# ---------------------------------------------------------------- check 18: pinned revisions are current
# The core interface map §6 pins each document of core (and of audit-chain) the
# companion relies on, as `tree/path` | Document ID | Revision. A pin that differs
# from the document's current Document Control means a CCR-BR (or CCR-AC) has not
# been assessed under the coupling rule (process/change-control.md §7).
REFS = os.path.dirname(CORE)
sec6 = re.search(r"^## 6\..*?(?=^## 7\.)", map_text, re.M | re.S)
pins = re.findall(r"^\|\s*`([^`]+)`\s*\|\s*([A-Z0-9-]+)\s*\|\s*([0-9.]+)\s*\|", sec6.group(0) if sec6 else "", re.M)
if not pins: fails[18].append("appendices/core-interface-map.md §6: no pinned revision rows")
for path, doc_id, rev in pins:
    if not re.match(r"(core|audit-chain)/", path): fails[18].append(f"pin `{path}` does not name the core or audit-chain tree"); continue
    tp = os.path.join(REFS, path)
    if not os.path.exists(tp): fails[18].append(f"pin `{path}` names a missing document"); continue
    dc = read(tp)
    got_id = re.search(r"^>\s*\|\s*Document ID\s*\|\s*([^|]+?)\s*\|", dc, re.M)
    got_rev = re.search(r"^>\s*\|\s*Revision\s*\|\s*([^|]+?)\s*\|", dc, re.M)
    if not got_id or got_id.group(1) != doc_id: fails[18].append(f"pin `{path}`: Document ID {doc_id}, document says {got_id.group(1) if got_id else 'nothing'}")
    if not got_rev or got_rev.group(1) != rev: fails[18].append(f"pin `{path}`: pinned Revision {rev}, current is {got_rev.group(1) if got_rev else 'unknown'}; assess the change under change control §7 and re-pin")
pinned_paths = {p for p, _, _ in pins}
for f in sorted(set(re.findall(r"\]\(\.\./\.\./(core/[^)#]+\.md)", map_text))):
    if f not in pinned_paths: fails[18].append(f"core interface map links {f} but §6 does not pin its revision")

# ---------------------------------------------------------------- report
names = {1: "index.yaml registries", 2: "INV/ADR traceability and ADR status", 3: "URS/NFR traceability",
         4: "risks have controls and rows", 5: "allocations and defined identifiers", 6: "identifier hygiene",
         7: "behaviour structure", 8: "Document Control", 9: "planned paths", 10: "acceptance scenarios",
         11: "claims lint (strict)", 12: "links and anchors (into core too)", 13: "CCR registers (GX and core)",
         14: "core identifiers defined and mapped", 15: "core checker --strict", 16: "Regulatory wording",
         17: "test vectors", 18: "pinned core revisions current"}
print(f"references/gxp verification — implementation: {IMPL}")
print("defined: " + ", ".join(f"{k} {len(v)}" for k, v in sorted(defs.items())))
print(f"core identifiers cited: {len(cited_br)}; mapped: {len(mapped)}")
total = 0
for i in range(1, 19):
    f = fails[i] + (warns[i] if STRICT else [])
    status = "FAIL" if f else ("PLANNED" if i == 9 and planned_count else "PASS")
    extra = f" ({planned_count} planned paths)" if i == 9 else (f" ({vector_count} vectors)" if i == 17 else (f" ({len(pins)} pins)" if i == 18 else ""))
    print(f"[{status:7}] {i:2}. {names[i]}{extra}")
    for x in f[:40]: print(f"           - {x}")
    if len(f) > 40: print(f"           … and {len(f) - 40} more")
    if not STRICT and warns[i]: print(f"           ({len(warns[i])} warning(s); --strict fails on them)")
    total += len(f)
print(f"\n{total} failure(s)")
sys.exit(1 if total else 0)
PY
