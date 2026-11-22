#!/usr/bin/env bash
# verify-cli.sh — every `bridger <command>` a document names is a command of the kit CLI or a declared extension
# (improvement report 05, R10; BEH-KT-025).
#
# Usage: bash references/kit/scripts/verify-cli.sh
#
# Requires bash and python3 (standard library only). The kit's commands are the first words of the synopsis block of
# references/kit/behaviors/04-cli.md. Extension commands are the first words of every fenced block opened with
# "```text extension" in any document. A document that names (in a code span, a code block, or at the start of a line
# after "$ ") a command that is neither fails, and so does an extension that shadows a kit command.
# VERIFY_CLI_EXTRA is a fixture hook: a directory of extra .md files scanned too.
set -euo pipefail
SPEC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$SPEC_DIR/../.." && pwd)"
exec python3 - "$REPO_ROOT" <<'PY'
import os, re, sys
ROOT = sys.argv[1]
def read(p):
    with open(p, encoding="utf-8") as f: return f.read()
def walk(base):
    for d, ds, fs in os.walk(base):
        ds[:] = sorted(x for x in ds if x not in ("node_modules", ".git", "improvement-reports", ".doc-snippets"))
        for f in sorted(fs):
            if f.endswith(".md"): yield os.path.join(d, f)
files = list(walk(os.path.join(ROOT, "docs"))) + list(walk(os.path.join(ROOT, "references")))
if os.environ.get("VERIFY_CLI_EXTRA"): files += list(walk(os.environ["VERIFY_CLI_EXTRA"]))
cli = read(os.path.join(ROOT, "references", "kit", "behaviors", "04-cli.md"))
synopsis = re.search(r'```text\n(bridger create.*?)\n```', cli, re.S).group(1)
kit = set(re.findall(r'^bridger ([a-z][a-z-]*)', synopsis, re.M))
ext, fails = {}, []
for p in files:
    for block in re.findall(r'```text extension\n(.*?)\n```', read(p), re.S):
        for c in re.findall(r'^bridger ([a-z][a-z-]*)', block, re.M): ext[c] = p
rel = lambda p: os.path.relpath(p, ROOT) if p.startswith(ROOT) else p
for c, p in sorted(ext.items()):
    if c in kit: fails.append(f"{rel(p)}: extension command `{c}` shadows a kit command (BEH-KT-025)")
allowed = kit | set(ext)
NAME = re.compile(r'(?:`|^|\$ )bridger (?!v\d)([a-z][a-z-]*)', re.M)
n = 0
for p in files:
    text = re.sub(r'```text extension\n.*?\n```', '', read(p), flags=re.S)   # the declarations themselves
    for m in NAME.finditer(text):
        n += 1
        line = text[:m.start()].count("\n") + 1
        if m.group(1) not in allowed: fails.append(f"{rel(p)}:{line}: `bridger {m.group(1)}` is neither a kit command nor a declared extension")
print(f"verify-cli: {len(kit)} kit commands, {len(ext)} extension commands, {n} mentions checked")
for x in fails: print("[FAIL   ]", x)
print(f"{len(fails)} failure(s)")
sys.exit(1 if fails else 0)
PY
