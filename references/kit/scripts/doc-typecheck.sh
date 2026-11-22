#!/usr/bin/env bash
# doc-typecheck.sh — compile every guide snippet marked `type-checked: yes` (improvement report 05, R2; BEH-KT-028).
#
# Usage: bash references/kit/scripts/doc-typecheck.sh [--write]
#
# Requires bash, python3 and the prototype's node_modules. Scans docs/guides/**/*.md (and every directory in the
# environment variable DOC_TYPECHECK_EXTRA, a fixture hook for tests) for fenced `ts` blocks. A block whose first line is
#   // type-checked: yes
# is written to a scratch project beside the prototype, where `@bridger/kit` resolves to src/kit.ts and `@bridger/core`
# to src/index.ts, and compiled with `tsc --noEmit`. An HTML comment `<!-- prelude ... -->` directly before the fence
# holds hidden declarations the example assumes (its services, helpers); it is compiled but not shown.
# A block whose first line is `// type-checked: test <path under prototypes/host-core>` is a recipe: its body must equal the
# region between `// #region recipe` and `// #endregion` of that test file, which compiles and runs with the suite; --write
# copies the region into the block. A missing file, a missing region or a different body fails.
# Fails when a `yes` block does not compile (an import of a symbol the package does not export is such an error), and when a
# block carries no marker. Prints the number of `yes` and `not yet` blocks, the visible progress of the guides.
set -euo pipefail
SPEC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$SPEC_DIR/../.." && pwd)"
exec python3 - "$REPO_ROOT" "${1:-}" <<'PY'
import os, re, subprocess, sys, shutil, json
ROOT, ARG = sys.argv[1], sys.argv[2]
PROTO = os.path.join(ROOT, "prototypes", "host-core")
dirs = [os.path.join(ROOT, "docs", "guides")] + [d for d in os.environ.get("DOC_TYPECHECK_EXTRA", "").split(os.pathsep) if d]
FENCE = re.compile(r'(?:<!--\s*prelude\n(.*?)\n-->\s*\n)?```ts\n(.*?)\n```', re.S)
files = []
for base in dirs:
    for d, ds, fs in os.walk(base):
        files += [os.path.join(d, f) for f in sorted(fs) if f.endswith(".md")]
blocks, fails, yes, notyet, recipes = [], [], 0, 0, 0
def region(rel_path):
    full = os.path.join(PROTO, rel_path)
    if not os.path.exists(full): return None
    m = re.search(r'// #region recipe\n(.*?)\n// #endregion', open(full, encoding="utf-8").read(), re.S)
    return m.group(1) if m else None
for f in sorted(files):
    text = open(f, encoding="utf-8").read()
    changed = False
    for m in list(FENCE.finditer(text)):
        body = m.group(2); line = text[:m.start(2)].count("\n") + 1
        first = body.split("\n", 1)[0].strip()
        rm = re.match(r'// type-checked: test (\S+)', first)
        if rm:
            recipes += 1
            want = region(rm.group(1))
            have = body.split("\n", 1)[1] if "\n" in body else ""
            if want is None: fails.append(f"{os.path.relpath(f, ROOT)}:{line}: recipe test file {rm.group(1)} is missing or has no `// #region recipe`")
            elif want != have:
                if ARG == "--write": text = text.replace(body, first + "\n" + want, 1); changed = True
                else: fails.append(f"{os.path.relpath(f, ROOT)}:{line}: the snippet differs from the region of {rm.group(1)}; run doc-typecheck.sh --write")
        elif first.startswith("// type-checked: yes"): yes += 1; blocks.append((f, line, m.group(1) or "", body))
        elif first.startswith("// type-checked: not yet"): notyet += 1
        else: fails.append(f"{os.path.relpath(f, ROOT)}:{line}: a ts block carries no `// type-checked:` marker")
    if changed: open(f, "w", encoding="utf-8").write(text)
scratch = os.path.join(PROTO, ".doc-snippets")
shutil.rmtree(scratch, ignore_errors=True)
if blocks:
    os.makedirs(scratch)
    for i, (f, line, prelude, body) in enumerate(blocks):
        # one scope per snippet: wrapping in a block keeps names from clashing, imports stay at the top
        imports = [l for l in body.split("\n") if re.match(r'\s*import\b', l)]
        rest = [l for l in body.split("\n") if l not in imports]
        # `//# file <name>` lines in a prelude start a fixture file written beside the snippet (a JSON manifest, a module it imports)
        parts = re.split(r'^//# file (\S+)\n', prelude, flags=re.M)
        prelude, fixtures = parts[0], list(zip(parts[1::2], parts[2::2]))
        pre_imports = [l for l in prelude.split("\n") if re.match(r'\s*import\b', l)]
        pre_rest = [l for l in prelude.split("\n") if l not in pre_imports]
        src = "\n".join(pre_imports + imports) + "\n" + "\n".join(pre_rest) + "\n" + "\n".join(rest) + "\nexport {}\n"
        os.makedirs(os.path.join(scratch, f"s{i}"))
        open(os.path.join(scratch, f"s{i}", "main.ts"), "w", encoding="utf-8").write(src)
        for name, content in fixtures:
            os.makedirs(os.path.dirname(os.path.join(scratch, f"s{i}", name)), exist_ok=True)
            open(os.path.join(scratch, f"s{i}", name), "w", encoding="utf-8").write(content)
    json.dump({"extends": "../tsconfig.json", "compilerOptions": {"resolveJsonModule": True, "baseUrl": "..", "paths": {"@bridger/kit": ["src/kit.ts"], "@bridger/core": ["src/index.ts"], "@bridger/kit/testing": ["src/kit-testing.ts"], "@bridger/kit/sdk": ["src/sdk.ts"], "@bridger/core/testing": ["src/core-testing.ts"]}}, "include": ["./*/*.ts"]},
              open(os.path.join(scratch, "tsconfig.json"), "w"))
    r = subprocess.run(["npx", "tsc", "-p", os.path.join(scratch, "tsconfig.json"), "--pretty", "false"], cwd=PROTO, capture_output=True, text=True)
    for l in (r.stdout + r.stderr).splitlines():
        m = re.match(r'(?:.*/)?s(\d+)/main\.ts\((\d+),\d+\): (.*)', l)
        if m:
            f, line, _, _ = blocks[int(m.group(1))]
            fails.append(f"{os.path.relpath(f, ROOT)}:{line}: snippet does not compile: {m.group(3)[:160]}")
        elif l.strip() and "error TS" in l: fails.append(l[:200])
    shutil.rmtree(scratch, ignore_errors=True)
print(f"doc-typecheck: {yes} snippet(s) compiled, {recipes} recipe(s) backed by a test, {notyet} marked not yet")
for x in fails: print("[FAIL   ]", x)
print(f"{len(fails)} failure(s)")
sys.exit(1 if fails else 0)
PY
