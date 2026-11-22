#!/usr/bin/env python3
"""Rolling Change History (report 07, R6 iv): a Document Control cell keeps its newest revisions, the rest live in CHANGES.md.

  python3 references/core/scripts/split-history.py            move older lines of every cell over the limit
  python3 references/core/scripts/split-history.py --check     fail if a cell is over the limit or its link does not resolve

A cell is `0.12 (date): text<br>0.11 (date): text<br>…`, newest first. When it is longer than LIMIT characters the oldest
lines move, newest first, to `references/<tree>/CHANGES.md` under a heading named by the document's Document ID, and the
cell ends with `Earlier revisions: [CHANGES.md](…#anchor)`. Files whose cell a generator writes are left alone.
"""
import os, re, sys

LIMIT = 2000
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
REFS = os.environ.get("SPLIT_HISTORY_REFS") or os.path.join(ROOT, "references")   # the override is for the tests
GENERATED = {os.path.join("gxp", "traceability.md")}   # references/gxp/scripts/gen-traceability.py writes this cell
CELL = re.compile(r"^> \| Change History \| (.*) \|$", re.M)
LINK = re.compile(r"<br>Earlier revisions: \[CHANGES\.md\]\(([^)]*)\)$")

def slug(h):
    h = h.strip().lower()
    return re.sub(r"[^\w\- ]", "", h, flags=re.UNICODE).replace(" ", "-")

def docs():
    for tree in sorted(os.listdir(REFS)):
        base = os.path.join(REFS, tree)
        if not os.path.isdir(base): continue
        for d, _, fs in os.walk(base):
            for f in sorted(fs):
                if f.endswith(".md") and f != "CHANGES.md": yield tree, os.path.join(d, f)

def doc_id(text):
    m = re.search(r"^> \| Document ID\s+\| (\S+)\s+\|$", text, re.M)
    return m.group(1) if m else None

def split_cell(cell):
    link = LINK.search(cell)
    body = cell[: link.start()] if link else cell
    return body.split("<br>"), link

def changes_path(tree): return os.path.join(REFS, tree, "CHANGES.md")

def read_changes(tree):
    p = changes_path(tree)
    if not os.path.exists(p): return None
    return open(p, encoding="utf8").read()

HEAD = """# Change history

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-{infix}-CHG{pad}|
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Change Record                                                |
> | Change History | 0.1 (2026-11-22): Older Change History lines moved out of the Document Control tables (improvement report 07, R6) |

---

A Document Control cell keeps its newest revisions; older lines are moved here, newest first, under the Document ID of
the document they belong to (`python3 references/core/scripts/split-history.py`). Nothing is rewritten: a line moves whole.
"""

def infix_of(tree):
    idx = open(os.path.join(REFS, tree, "index.yaml"), encoding="utf8").read()
    return re.search(r"^infix: (\w+)", idx, re.M).group(1)

def add_to_changes(tree, ident, title, lines):
    text = read_changes(tree)
    if text is None:
        infix = infix_of(tree); value = f"BRIDGER-{infix}-CHG"
        text = HEAD.format(infix=infix, pad=" " * max(1, 61 - len(value)))
    sec = f"## {ident}"
    block = "\n".join(f"- {l}" for l in lines)
    if sec in text:
        i = text.index(sec); j = text.index("\n", i) + 1
        # the section's own heading line is followed by a blank line, then the list: newer lines go first
        k = text.index("\n\n", j) + 2          # after the heading and the `path` line that follows it
        text = text[:k] + block + "\n" + text[k:]
    else:
        text = text.rstrip("\n") + f"\n\n{sec}\n\n{title}\n\n{block}\n"
    open(changes_path(tree), "w", encoding="utf8").write(text)

def process(write):
    over, moved = [], 0
    for tree, path in docs():
        r = os.path.relpath(path, REFS)
        if r in GENERATED: continue
        text = open(path, encoding="utf8").read()
        m = CELL.search(text)
        if not m: continue
        cell = m.group(1)
        if len(cell) <= LIMIT: continue
        over.append(r)
        if not write: continue
        ident = doc_id(text)
        lines, link = split_cell(cell)
        keep, size = [], 0
        for l in lines:
            if keep and size + len(l) + 4 > LIMIT - 120: break
            keep.append(l); size += len(l) + 4
        old = lines[len(keep):]
        if not old: continue
        add_to_changes(tree, ident, f"`{r}`", old)
        target = os.path.relpath(changes_path(tree), os.path.dirname(path)).replace(os.sep, "/") + "#" + slug(ident)
        newcell = "<br>".join(keep) + f"<br>Earlier revisions: [CHANGES.md]({target})"
        open(path, "w", encoding="utf8").write(text[: m.start(1)] + newcell + text[m.end(1):])
        moved += len(old)
    return over, moved

def check():
    fails = []
    for tree, path in docs():
        r = os.path.relpath(path, REFS)
        if r in GENERATED: continue
        text = open(path, encoding="utf8").read()
        m = CELL.search(text)
        if not m: continue
        if len(m.group(1)) > LIMIT and len(split_cell(m.group(1))[0]) > 1:   # one long revision line cannot be split further
            fails.append(f"{r}: Change History cell is {len(m.group(1))} characters, over {LIMIT}; run split-history.py")
        link = LINK.search(m.group(1))
        if link:
            file, _, anchor = link.group(1).partition("#")
            target = os.path.normpath(os.path.join(os.path.dirname(path), file))
            ch = open(target, encoding="utf8").read() if os.path.exists(target) else ""
            if anchor not in {slug(h) for h in re.findall(r"^## (.+)$", ch, re.M)}: fails.append(f"{r}: Earlier revisions link {link.group(1)} does not resolve")
    return fails

if __name__ == "__main__":
    if sys.argv[1:] == ["--check"]:
        f = check()
        print(f"split-history: {len(f)} failure(s)")
        for x in f[:20]: print(f"FAIL {x}")
        sys.exit(1 if f else 0)
    over, moved = process(True)
    print(f"split-history: {len(over)} cell(s) over {LIMIT}, {moved} line(s) moved")
