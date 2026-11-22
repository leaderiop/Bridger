#!/usr/bin/env bash
# verify-events.sh — the event catalog and its call sites (improvement report 04, R2).
#
# Usage: bash references/core/scripts/verify-events.sh [--write]
#
# Requires bash and python3 (standard library only). Extracts every event the system declares:
#   host events    the `HostEventBody` tags of prototypes/host-core/src/events.ts, against the union in 13;
#   bus events     every `Event.make<...>()(id, { mode })` in prototypes/host-core/src and in references/**/*.md;
#   hook points    every `HookPoint.make<...>(name` in the same places.
# and checks: each bus event declares a mode; one id is never declared with two modes; in every file, an event
# constant is dispatched and listened to only with its own mode; every host event of the prototype is specified in 13;
# and appendices/event-catalog.md equals what is extracted (a new event needs its row in the same change).
# --write regenerates the catalog. Exit status 1 on any failure.
set -euo pipefail
SPEC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$SPEC_DIR/../.." && pwd)"
exec python3 - "$SPEC_DIR" "$REPO_ROOT" "${1:-}" <<'PY'
import os, re, sys
SPEC, ROOT, ARG = sys.argv[1], sys.argv[2], sys.argv[3]
CATALOG = os.path.join(SPEC, "appendices", "event-catalog.md")
def read(p):
    with open(p, encoding="utf-8") as f: return f.read()
def rel(p): return os.path.relpath(p, ROOT) if p.startswith(ROOT) else p
def walk(base, ext, skip=()):
    for d, ds, fs in os.walk(base):
        ds[:] = sorted(x for x in ds if x not in ("node_modules", ".git", "test", "dist") and x not in skip)
        for f in sorted(fs):
            if f.endswith(ext): yield os.path.join(d, f)

fails = []
MODES = ("emit", "parallel", "serial", "waterfall")
MAKE = re.compile(r'Event\.make<.*?>\(\)\(\s*"([^"]+)"\s*(?:,\s*\{([^}]*)\})?\s*\)')
bus, files = [], []   # bus: (id, mode, file)
EXTRA = os.environ.get("VERIFY_EVENTS_EXTRA")   # a directory of fixtures to check as well (the script's own test); the catalog is then not compared
sources = list(walk(os.path.join(ROOT, "prototypes/host-core/src"), ".ts")) + list(walk(os.path.join(ROOT, "references"), ".md"))
if EXTRA: sources += list(walk(EXTRA, ".ts")) + list(walk(EXTRA, ".md"))
for p in sources:
    t = read(p)
    for m in MAKE.finditer(t):
        ident, opts = m.group(1), m.group(2) or ""
        mode = re.search(r'mode:\s*"(\w+)"', opts)
        if not mode or mode.group(1) not in MODES:
            fails.append(f"{rel(p)}: Event.make for {ident!r} declares no mode (one of {', '.join(MODES)})"); continue
        bus.append((ident, mode.group(1), rel(p)))
# one id, one mode
by_id = {}
for ident, mode, f in bus: by_id.setdefault(ident, set()).add(mode)
for ident, ms in sorted(by_id.items()):
    if len(ms) > 1: fails.append(f"event {ident!r} is declared with more than one mode: {sorted(ms)}")

# call sites: a constant of one mode is dispatched / listened to with that mode only (prototype src, tests, spec snippets)
DISP = {"emit": "emit", "parallel": "parallel", "serial": "serial", "waterfall": "waterfall", "on": ("emit", "parallel", "serial"), "around": ("waterfall",)}
checked = 0
for p in sources + list(walk(os.path.join(ROOT, "prototypes/host-core/test"), ".ts")):
    t = read(p)
    consts = {m.group(1): None for m in re.finditer(r'(?:const|let)\s+(\w+)\s*=\s*Event\.make', t)}
    for m in re.finditer(r'(?:const|let)\s+(\w+)\s*=\s*Event\.make<.*?>\(\)\(\s*"[^"]+"\s*,\s*\{[^}]*mode:\s*"(\w+)"', t):
        consts[m.group(1)] = m.group(2)
    for name, mode in consts.items():
        if mode is None: continue
        for m in re.finditer(r'\.(emit|parallel|serial|waterfall|on|around)\(\s*' + re.escape(name) + r'\b', t):
            checked += 1
            ok = DISP[m.group(1)]; ok = (ok,) if isinstance(ok, str) else ok
            if mode not in ok:
                line = t.count("\n", 0, m.start()) + 1
                if "@ts-expect-error" in t.split("\n")[line - 2]: continue   # a deliberate mismatch the compiler is asserted to refuse
                fails.append(f"{rel(p)}:{line}: {name} is a {mode!r} event used with .{m.group(1)}()")

# hook points
hooks = []
for p in sources:
    for m in re.finditer(r'HookPoint\.make<[^>]*(?:<[^>]*>[^>]*)*>\(\s*"([^"]+)"', read(p)):
        hooks.append((m.group(1), rel(p)))

# host events
ev_ts = read(os.path.join(ROOT, "prototypes/host-core/src/events.ts"))
body = ev_ts[ev_ts.index("export type HostEventBody"):ev_ts.index("export type HostEvent =")]
host_events = {}
for m in re.finditer(r'\{ readonly type: "([\w-]+)"([^}]*)\}', body):
    fields = re.findall(r'readonly (\w+)(\??):', m.group(2))
    host_events[m.group(1)] = ", ".join(f + q for f, q in fields)
spec13 = read(os.path.join(SPEC, "behaviors/13-observability-and-diagnostics.md"))
union = spec13[spec13.index("type HostEvent"):]
union = union[:union.index("```")]
spec_tags = set(re.findall(r'type: "([\w-]+)"', union))
for tag in sorted(host_events):
    if tag not in spec_tags: fails.append(f"host event {tag!r} is in events.ts but not in the HostEvent union of 13")
mentions = {}
for d in ("behaviors",):
    for p in walk(os.path.join(SPEC, d), ".md"):
        t = read(p)
        for tag in host_events:
            if f"`{tag}`" in t: mentions.setdefault(tag, []).append(os.path.basename(p).split("-")[0])

# hook-point option defaults: every HookPointOptions field of 31 has a row in the "Option defaults" table, and every row names a field
spec31 = read(os.path.join(SPEC, "behaviors/31-hook-points.md"))
iface = spec31[spec31.index("interface HookPointOptions"):]
iface = iface[:iface.index("\n}\n")]
option_keys = re.findall(r'^\s{2}readonly (\w+)\??:', iface, re.M)
table = spec31[spec31.index("**Option defaults.**"):]
table = table[:table.index("\n\n", table.index("| Option |"))]
rows = re.findall(r'^\| `(\w+)` \|', table, re.M)
for k in option_keys:
    if k not in rows: fails.append(f"31: HookPointOptions.{k} has no row in the Option defaults table")
for k in rows:
    if k not in option_keys: fails.append(f"31: the Option defaults table names {k!r}, which HookPointOptions does not have")
proto_hooks = read(os.path.join(ROOT, "prototypes/host-core/src/hooks.ts"))
proto_iface = proto_hooks[proto_hooks.index("export interface HookPointOptions"):]
proto_iface = proto_iface[:proto_iface.index("\n}\n")]
for k in set(re.findall(r'^\s{2}readonly (\w+)\??:', proto_iface, re.M)) ^ set(option_keys):
    fails.append(f"HookPointOptions.{k} is in one of spec 31 and hooks.ts and not the other")

# the catalog
L = []
L.append("# Appendix — Event catalog\n")
L.append("> **Document Control**\n>\n> | Property       | Value                                                        |\n> | -------------- | ------------------------------------------------------------ |\n> | Document ID    | BRIDGER-APP-03                                               |\n> | Revision       | 0.1                                                          |\n> | Effective Date | — (pending approval)                                         |\n> | Status         | Draft                                                        |\n> | Author         | Bridger Engineering                                          |\n> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |\n> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |\n> | Classification | Appendix — Informative                                       |\n> | Change History | 0.1 (2026-11-22): Generated by `scripts/verify-events.sh --write` (improvement report 04, R2) |\n\n---\n")
L.append("This appendix is **generated**; do not edit it by hand. `bash references/core/scripts/verify-events.sh` fails when it differs from what the sources declare, so a new event, hook point or host event needs its row in the same change (PROC rule: [change control](../process/change-control.md)). It is informative: the normative text is in [16](../behaviors/16-event-bus.md), [13](../behaviors/13-observability-and-diagnostics.md) and [31](../behaviors/31-hook-points.md).\n")
L.append("## Bus events (`Event.make`)\n\nEach event has exactly one dispatch mode (BEH-BR-138). Declarations are those of `prototypes/host-core/src` and of the specifications; test fixtures are not listed.\n")
L.append("| Event id | Mode | Declared in |\n| --- | --- | --- |")
for ident in sorted(by_id):
    mode = sorted(by_id[ident])[0]
    where = sorted({f for i, m, f in bus if i == ident})
    L.append(f"| `{ident}` | `{mode}` | {', '.join('`'+w+'`' for w in where)} |")
if not by_id: L.append("| — | — | — |")
L.append("\n## Hook points (`HookPoint.make`)\n")
L.append("| Hook point | Declared in |\n| --- | --- |")
for name in sorted({h for h, _ in hooks}):
    L.append(f"| `{name}` | {', '.join('`'+f+'`' for f in sorted({f for h, f in hooks if h == name}))} |")
if not hooks: L.append("| — | — |")
L.append("\n## Host events (`Host.events`)\n\nThe `HostEventBody` tags of the prototype. \"Specified in\" lists the behaviour files that name the tag.\n")
L.append("| Tag | Fields (besides the common ones) | Specified in |\n| --- | --- | --- |")
for tag in sorted(host_events):
    L.append(f"| `{tag}` | {('`' + host_events[tag] + '`') if host_events[tag] else '—'} | {', '.join(sorted(set(mentions.get(tag, [])))) or '—'} |")
only_spec = sorted(spec_tags - set(host_events))
L.append("\nSpecified in 13 and not in the prototype: " + (", ".join(f"`{t}`" for t in only_spec) if only_spec else "none") + ".\n")
out = "\n".join(L)

if ARG == "--write":
    with open(CATALOG, "w", encoding="utf-8") as f: f.write(out)
    print(f"wrote {rel(CATALOG)}")
else:
    cur = read(CATALOG) if os.path.exists(CATALOG) else ""
    if cur != out and not EXTRA: fails.append("appendices/event-catalog.md is stale; run `bash references/core/scripts/verify-events.sh --write` and commit it")
print(f"verify-events: {len(option_keys)} hook options, {len(by_id)} bus events, {len({h for h,_ in hooks})} hook points, {len(host_events)} host events, {checked} call sites checked")
for f in fails: print("[FAIL   ]", f)
print(f"{len(fails)} failure(s)")
sys.exit(1 if fails else 0)
PY
