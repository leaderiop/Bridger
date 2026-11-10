#!/usr/bin/env python3
"""gen-traceability.py — regenerate references/gxp/traceability.md.

Usage: python3 references/gxp/scripts/gen-traceability.py

Stdlib only. Modelled on the generator of references/core/traceability.md.
Every row is derived from the specification itself:
  §1  behaviour file -> the planned source paths named in the file's intro
  §2  INV-GX -> behaviours whose **Invariant:** line cites it
  §3  ADR-GX -> behaviours whose **See:** line cites it, with the status
      recorded in decisions/index.yaml
  §5  REQ-GX-nnn = numbered acceptance check nnn of
      behaviors/20-required-acceptance-checks.md, citing the BEH-GX ids the
      check text names ("BEH-GX-a to BEH-GX-b" ranges expanded)
  §7  RSK-GX -> the BEH/INV controls cited in its entry of
      gxp/03-risk-assessment.md -> the REQ-GX rows exercising them
Run scripts/verify-traceability.sh afterwards.
"""
import os, re, glob

SPEC = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))


def read(p):
    with open(os.path.join(SPEC, p), encoding="utf-8") as f:
        return f.read()


def slug(h):
    h = h.strip().lower()
    h = re.sub(r"[^\w\- ]", "", h, flags=re.UNICODE)
    return h.replace(" ", "-")


# ---------------------------------------------------------------- behaviours
beh = {}
intro_src = {}
for p in sorted(glob.glob(os.path.join(SPEC, "behaviors", "[0-9][0-9]-*.md"))):
    f = os.path.basename(p)
    s = read(os.path.join("behaviors", f))
    head = re.split(r"^## BEH-GX-", s, maxsplit=1, flags=re.M)[0]
    paths = []
    for m in re.finditer(r"`(packages/gxp/src/[^`\s]+)`", head):
        if m.group(1) not in paths:
            paths.append(m.group(1))
    intro_src[f] = paths
    lines = s.split("\n")
    for i, l in enumerate(lines):
        m = re.match(r"^## BEH-GX-(\d{3}): (.+)$", l)
        if not m:
            continue
        bq = []
        for j in range(i + 1, min(i + 14, len(lines))):
            if lines[j].startswith(">"):
                bq.append(lines[j])
            elif bq:
                break
        def line(tag):
            return "\n".join(x for x in bq if x.startswith(f"> **{tag}:**"))
        beh[int(m.group(1))] = dict(
            file=f, title=m.group(2).strip(),
            inv=sorted({int(x) for x in re.findall(r"INV-GX-(\d{3})", line("Invariant"))}),
            adr=sorted({int(x) for x in re.findall(r"ADR-GX-(\d{3})", line("See"))}))

files = sorted({v["file"] for v in beh.values()})


def link_beh(n):
    return f"[BEH-GX-{n:03d}](behaviors/{beh[n]['file']}#{slug('BEH-GX-%03d: %s' % (n, beh[n]['title']))})"


def rng(ns):
    ns = sorted(set(ns)); out = []; s = q = None
    for n in ns:
        if s is None: s = q = n
        elif n == q + 1: q = n
        else: out.append((s, q)); s = q = n
    if s is not None: out.append((s, q))
    return ", ".join(f"BEH-GX-{a:03d}" if a == b else f"BEH-GX-{a:03d}–{b:03d}" for a, b in out)


# ---------------------------------------------------------------- invariants, decisions
inv_titles = {int(n): t.strip() for n, t in re.findall(r"^## INV-GX-(\d{3}): (.+)$", read("invariants.md"), re.M)}
adrs = re.findall(r'id: "ADR-GX-(\d{3})"\s*\n\s*file: "([^"]+)"\s*\n\s*title: "([^"]+)"\s*\n\s*status: "([^"]+)"',
                  read(os.path.join("decisions", "index.yaml")))

# ---------------------------------------------------------------- acceptance checks -> REQ-GX
SUMMARY = {
 1: "The sink acknowledges only what the store answered stored or stored-collision; a failing, dying or hanging store reaches core as `AuditWriteFailed`",
 2: "A repeated append is already-stored; different content under a stored key is kept beside the primary as a collision and the first entry reads back unchanged",
 3: "The sink stores and marks an unsupported shape and a record that is not I-JSON, the call succeeds and no latch is set; the record vector reproduces",
 4: "Conformance cases 1–16 pass against `memoryTrailStore` and fail as listed against each `brokenTrailStore` variant",
 5: "Conformance runs with one seed are reproducible; the manifest lists every case and no result",
 6: "`checkTrailEntries` reports each seeded gap, duplicate, disorder, digest mismatch and canonical mismatch",
 7: "`checkStoredTrail` equals `checkTrailEntries` across page boundaries and never reports part of a range",
 8: "Unknown schema versions, unfinished calls, records dropped (at acknowledgement and per record) and unclean closes are reported, with the fixed statement",
 9: "`checkApprovals` reports approvals without records and records without approvals, and nothing for a gate refusal",
 10: "High-water marks follow `Host.controls` and `CloseReport`; `checkHighWater` reports `tailLoss` and `unanchoredTail`",
 11: "Sealing through audit-chain: links stored beside entries; `verifySeals` maps `chainBreak`, `anchorMismatch`, `chainUnanchoredTail`, `anchorUnconfirmed`, `chainLossCounterRose` and `headMismatch`; off, the kinds are not checked",
 12: "`bindingDigest` reproduces the four vectors; a proposal, the gate request and both records give one digest",
 13: "`issueTicket` refusals, `issued` and `signed` events; a declined or failed capture leaves the ticket issued",
 14: "Signature refusals for the requester, a repeated or reserved signer, a wrong meaning or digest, too few components, or no re-authentication",
 15: "The rendering shows every bound field and only \"fingerprinted\" for a fingerprinted path; the fixed manifestation sentence",
 16: "Each gate refusal reason occurs exactly when its condition holds, first in step order, with one `rejected` record",
 17: "Concurrent calls citing one binding give one allow and one `consumed` event; a consumed binding stays consumed",
 18: "A failing or slow ticket store refuses \"ticket-store-unavailable\" before the deadline; an unattached gate refuses every request",
 19: "A bundle-cited `reconcile` consumes one binding per matching entry, refuses a non-matching entry alone and leaves the rest open",
 20: "An exempt rule allows only after the `exempted` event is stored; `attach` stores one `policy-activated` event",
 21: "`linkApprovals` links by the triple, reports \"burned\" calls and transferred signatures",
 22: "`hmacFingerprinter` reproduces the vectors; `select` keeps eligible paths in order; request and records carry the fingerprints",
 23: "Each fingerprint failure carries its fixed tag and core fails the call before the gate, writing no record",
 24: "`proposeFingerprints` equals the call's fingerprints; after rotation earlier tickets are refused and listed as stale",
 25: "`matchesFingerprint` answers match, no-match and key-retired-unavailable, and refuses inadmissible input",
 26: "`runInstallationChecks` reports every IQ item in order, failing on wired fixtures, an unbounded `gateTimeout` and a repeated identifier in the IQ-22 draw",
 27: "`collectOqEvidence` is exact on the known-bad corpus; packs reproduce byte for byte; `diffPacks` shows lost coverage",
 28: "Archives keep the stored canonical bytes; `readArchive` finds an edited line from its own run",
 29: "Peer dependencies only; core never imports the companion; the main entry point exports no port implementation and no policy",
 30: "`GxpLayer.make` options are exhaustive at compile time; a \"not-used\" section equals an unwired core port",
 31: "No canary value, key or port error text appears in any output",
 32: "Every port failure on a decision path ends in the refusal shown, and no call that may have taken effect is retried",
 33: "A core version outside the compatibility row fails the layer with `GxpCoreVersionUnsupported`",
 34: "Each invalid policy fails the layer with `GxpLayerInvalid`; a request no rule matches requires a ticket",
 35: "Ticket state follows from events; window boundaries under `TestClock`; `revokeTicket` rules; one event per version",
 36: "A caller interrupted at the gate gets a \"caller-interrupted\" record and no change; an in-flight consumption is reported burned",
 37: "The gate caches nothing: each call is decided from the ticket store at its own time",
 38: "Vectors and the canonical form reproduce on every runtime; out-of-domain values fail with `CanonicalisationFailed`",
 39: "Reads over 1,000,000 entries stay within a fixed heap bound",
 40: "Every report carries its fixed sentences and, outside a negated sentence, none of the words ADR-GX-027 forbids",
 41: "Testing ports are marked `fixture: true`; test keys are deterministic; an installation using a fixture fails IQ",
 42: "The suite's own OQ evidence reports every REQ-GX as pass; coverage and mutation targets are met",
 43: "`trailGate` refuses operator calls while the sink's counts are raised; recording, system records and refused calls' records continue",
 44: "A call refused by the trail or chain piece consumes no binding",
 45: "`superseded`, `joined` and resumer terminals pair with their requests and are not reported open",
 46: "Binding version 2 binds `onBehalfOf`, `undo` and the request-only fields; annotations and `previousManifest` change nothing",
 47: "IQ-23 reports the trail and chain gate pieces; evidence packs carry the sink's counts in `sink-status.json`",
}

checks = []
s20 = read(os.path.join("behaviors", "20-required-acceptance-checks.md"))
for blk in re.findall(r"```\nREQUIREMENT:(.*?)```", s20, re.S):
    cur = None
    for ln in blk.split("\n"):
        m = re.match(r"^ {13}(\d+)\. (.*)$", ln)
        if m:
            cur = [int(m.group(1)), m.group(2).strip()]; checks.append(cur)
        elif cur is not None and ln.startswith(" " * 14):
            cur[1] += " " + ln.strip()
        else:
            cur = None
assert [c[0] for c in checks] == list(range(1, len(checks) + 1)), "acceptance checks are not numbered 1..n in order"
assert set(SUMMARY) == {c[0] for c in checks}, "SUMMARY does not match the acceptance checks"


def cited_behs(text):
    ns = set()
    for a, b in re.findall(r"BEH-GX-(\d{3})\s+to\s+BEH-GX-(\d{3})", text):
        ns.update(range(int(a), int(b) + 1))
    ns.update(int(x) for x in re.findall(r"BEH-GX-(\d{3})", text))
    return sorted(ns)


REQ = []
for n, text in checks:
    ns = cited_behs(text)
    assert ns, f"acceptance check {n} cites no BEH-GX"
    for x in ns:
        assert x in beh, f"acceptance check {n} cites undefined BEH-GX-{x:03d}"
    REQ.append((n, SUMMARY[n], ns))

# ---------------------------------------------------------------- risks
inv_beh = {}
for n, v in beh.items():
    for i in v["inv"]:
        inv_beh.setdefault(i, []).append(n)
rsk_rows = []
for b in re.split(r'(?=<a id="rsk-gx-\d{3}")', read(os.path.join("gxp", "03-risk-assessment.md"))):
    m = re.match(r'<a id="rsk-gx-(\d{3})"></a>\s*\n### RSK-GX-\d{3}: (.+)', b)
    if not m:
        continue
    body = b[:4000]
    ctrls = sorted({x for x in re.findall(r"\b((?:BEH|INV)-GX-\d{3})\b", body)})
    behs = {int(c[7:]) for c in ctrls if c.startswith("BEH")}
    reqs = [f"REQ-GX-{k:03d}" for k, _, ns in REQ if behs & set(ns)]
    if not reqs:  # no check cites a control behaviour: use the checks of the same behaviour files
        fs = {beh[n]["file"] for n in behs if n in beh and not beh[n]["file"].startswith("20-")}
        reqs = [f"REQ-GX-{k:03d}" for k, _, ns in REQ if any(beh[x]["file"] in fs for x in ns)]
    if not reqs:  # only invariants cited: fall back to the behaviours enforcing them
        for c in ctrls:
            if c.startswith("INV"):
                behs.update(inv_beh.get(int(c[7:]), []))
        reqs = [f"REQ-GX-{k:03d}" for k, _, ns in REQ if behs & set(ns)]
    rsk_rows.append((int(m.group(1)), m.group(2).strip(), ctrls, reqs))


def risk_reqs():
    """RSK number -> REQ-GX ids, for editors of gxp/03."""
    return {n: reqs for n, _, _, reqs in rsk_rows}


# ---------------------------------------------------------------- output
def dc(prop, val):
    return f"> | {prop:<14} | {val:<60} |"


out = []
out.append("\n".join([
    "# Traceability", "", "> **Document Control**", ">",
    "> | Property       | Value                                                        |",
    "> | -------------- | ------------------------------------------------------------ |",
    dc("Document ID", "BRIDGER-GX-TRACE"), dc("Revision", "0.4"),
    dc("Effective Date", "— (pending approval)"), dc("Status", "Draft"),
    dc("Author", "Bridger Engineering"),
    dc("Reviewed by", "— (no independent reviewer yet; see PROC-GX-03 §5)"),
    dc("Approved by", "— (pending; single maintainer, see PROC-GX-03 §5)"),
    dc("Classification", "Traceability Matrix"),
    dc("Change History", "0.4 (2026-11-10): REQ-GX-011 and REQ-GX-047 text: chain-derived finding kinds, IQ-23 and `sink-status.json`; check 47 cites BEH-GX-118 and BEH-GX-129 (CCR-GX-005)<br>0.3 (2026-11-09): REQ-GX-026 text: IQ-22, a repeated identifier in the draw (core CCR-BR-033) (CCR-GX-004)<br>0.2 (2026-11-09): Regenerated for CCR-GX-002: behaviours 169–179 (files 20, 21, 22), BEH-GX-049–056 and INV-GX-013 withdrawn, INV-GX-016, ADR-GX-029 and ADR-GX-030, RSK-GX-023, acceptance scenarios REQ-GX-043–047 (CCR-GX-002)<br>0.1 (2026-10-03): Initial draft (CCR-GX-001)"),
]))
out.append('''
---

## Traceability chain

```
  URS-GX / NFR-GX ──► BEH-GX ──► INV-GX ──► source (Planned)
         │              │  ▲         │
         │              │  └ ADR-GX  └──► test (Planned)
         │              ▼
         │           REQ-GX (acceptance scenario, Planned) ──► executed evidence (none yet)
         ▼
  RSK-GX ──► control (BEH/INV) ──► verification (REQ/test)
  Regulatory clause ──► allocation (Core/Companion/Consumer) ──► BEH/INV/ADR
  Core interface (BEH-BR/ADR-BR/RSK-BR) ──► appendices/core-interface-map.md
```

Nothing is implemented. Every source and test path below is marked *(Planned)*;
`scripts/verify-traceability.sh` fails if a path marked Planned exists, so the
marking cannot silently go stale. A row in this matrix is a commitment, not
evidence ([ADR-GX-026](decisions/026-prospective-specification.md)).

This document is generated by `scripts/gen-traceability.py` from the
behaviours, invariants, decisions, acceptance checks and risk assessment; edit
those and regenerate rather than editing it by hand. User requirements trace
forward to behaviours in [urs.md §6](urs.md#6-traceability). The core
identifiers the companion builds on are listed in the
[core interface map](appendices/core-interface-map.md).
''')

out.append("## §1 Behaviour to source\n\n| Behaviours | File | Planned source |\n| --- | --- | --- |")
for f in files:
    ns = [n for n, v in beh.items() if v["file"] == f]
    paths = intro_src.get(f) or []
    cell = ", ".join(f"`{x}` *(Planned)*" for x in paths) or "— (no source; acceptance checks, see §5)"
    out.append(f"| {rng(ns)} | [{f}](behaviors/{f}) | {cell} |")

out.append("\n## §2 Invariant traceability\n\n| Invariant | Enforced by behaviours | Planned verification |\n| --- | --- | --- |")
PROPERTY = {2, 3, 4, 6, 7, 8, 9, 12, 16}   # INV-GX-013 withdrawn (CCR-GX-002)
for i in sorted(inv_titles):
    bs = ", ".join(link_beh(n) for n in sorted(inv_beh.get(i, []))) or "—"
    kind = "property test over generated histories" if i in PROPERTY else "scenario tests"
    if "(withdrawn)" in inv_titles[i]: kind = "none — withdrawn"
    out.append(f"| [INV-GX-{i:03d}](invariants.md#{slug('INV-GX-%03d: %s' % (i, inv_titles[i]))}) | {bs} | {kind}{'' if 'withdrawn' in kind else ' *(Planned)*'} |")

out.append("\n## §3 Decision traceability\n\n| Decision | Status | Cited by behaviours |\n| --- | --- | --- |")
adr_beh = {}
for n, v in beh.items():
    for a in v["adr"]:
        adr_beh.setdefault(a, []).append(n)
for num, f, t, st in adrs:
    bs = rng(adr_beh.get(int(num), [])) or "— (process or scope decision)"
    out.append(f"| [ADR-GX-{num}](decisions/{f}) — {t} | {st} | {bs} |")

out.append("\n## §4 Test file map\n\nEvery path is planned. Type-level tests use `tstyche` (`*.tst.ts`); property tests use `@effect/vitest` with `fast-check`.\n\n| Behaviour file | Planned tests |\n| --- | --- |")
for f in files:
    stem = f[:-3]
    if f.startswith("20-"):
        cell = "`packages/gxp/test/acceptance/` *(Planned)*, one tagged test per REQ-GX of §5"
    elif "withdrawn" in read(os.path.join("behaviors", f)).split("\n", 1)[0]:
        cell = "— (file withdrawn by CCR-GX-002)"
    else:
        cell = f"`packages/gxp/test/{stem}.test.ts` *(Planned)*"
        if f[:2] in ("01",):
            cell += f", `packages/gxp/test/{stem}.tst.ts` *(Planned)*"
    out.append(f"| [{f}](behaviors/{f}) | {cell} |")

out.append(f"\n## §5 Acceptance scenario traceability\n\nOne scenario per numbered check of [BEH-GX-153–169](behaviors/20-required-acceptance-checks.md) (checks 1–{len(REQ)}), in the same order: REQ-GX-nnn is check nnn. The behaviours are those the check's text cites. Each will be a test tagged `@REQ-GX-nnn` in `packages/gxp/test/acceptance/` once code exists; until then none has run.\n\n| Scenario | Check | Behaviours | Status |\n| --- | --- | --- | --- |")
for k, title, ns in REQ:
    out.append(f"| REQ-GX-{k:03d} | {k}. {title} | {', '.join(link_beh(n) for n in ns)} | Not run |")

out.append('''
## §6 Coverage targets

| Target | Threshold | Source |
| --- | --- | --- |
| Line and branch coverage, `packages/gxp` | ≥ 95% | [NFR-GX-003](urs.md#nfr-gx-003-coverage) |
| Mutation score, `packages/gxp` | ≥ 80%, surviving mutants in the gate, the sink and the checks reviewed and recorded | [NFR-GX-004](urs.md#nfr-gx-004-mutation-testing) |
| Acceptance scenarios | every REQ-GX in §5 executed and passing | [BEH-GX-168](behaviors/20-required-acceptance-checks.md) |
| Conformance suite | every case passes against `memoryTrailStore` and fails as listed against each broken store | [04 — Conformance Suite](behaviors/04-conformance-suite.md) |
| Invariants | at least one test per INV-GX, property-based where §2 says so | §2 |

None of these is measured yet.
''')

out.append("## §7 Risk traceability\n\nEach risk's controls are the behaviours and invariants cited in its entry of the [risk assessment](gxp/03-risk-assessment.md); verification is through the scenarios of §5 that exercise those behaviours (where no check cites a control behaviour, the checks of the same behaviour file; where an entry cites only invariants, the behaviours enforcing them).\n\n| Risk | Hazard | Controls | Verified by |\n| --- | --- | --- | --- |")
for n, title, ctrls, reqs in rsk_rows:
    out.append(f"| [RSK-GX-{n:03d}](gxp/03-risk-assessment.md#rsk-gx-{n:03d}) | {title} | {', '.join(ctrls)} | {', '.join(reqs) or 'Planned — no scenario yet; see the entry'} |")

out.append('''
## §8 Regulatory clause traceability

Clause-level allocation — 21 CFR Part 11, EU GMP Annex 11 and ALCOA+, each to
Core, Companion, Consumer or N/A with the identifiers that support it — is
maintained in one place, the [compliance matrix](gxp/02-compliance-matrix.md),
and not duplicated here. Behaviours that support a clause name it in their
`**Regulatory:**` line. A row there, like a row here, records a commitment of
the specification, not evidence about any consumer's system.

---

_Next: [Roadmap](roadmap.md)_
''')

if __name__ == "__main__":
    with open(os.path.join(SPEC, "traceability.md"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(out) + "\n")
    print("BEH", len(beh), "INV", len(inv_titles), "ADR", len(adrs), "REQ", len(REQ), "RSK", len(rsk_rows))
