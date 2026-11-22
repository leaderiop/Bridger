#!/usr/bin/env python3
"""Checks report 06's resolution table against the specification and the prototype (improvement report 06, closure).

Every phrase the table relies on must exist in the named file, and phrases the build disproved must be gone.
Run: python3 docs/improvement-reports/verify-report-06.py   (exit 1 on any failure)
"""
import pathlib, sys
root = pathlib.Path(__file__).resolve().parents[2]
src = root / "prototypes/host-core/src"
test = root / "prototypes/host-core/test"
ref = root / "references"
report = (root / "docs/improvement-reports/06-security-gxp-audit.html").read_text()
grounded = [  # (phrase the report shows, file that must state it)
    ("closedContext", src / "closed.ts"), ("InactiveAccess", src / "closed.ts"), ("UndeclaredAccess", src / "host.ts"),
    ("leaseBound", src / "host.ts"), ("consentDiff", src / "host.ts"), ("declaredOnly", src / "policy.ts"),
    ("reversibility", src / "host.ts"), ("anchor-behind", src / "audit-chain.ts"), ("anchorBeforeIrreversible", src / "audit-chain.ts"),
    ("restartGate", src / "loader.ts"), ("resident-revoked", src / "loader.ts"), ("resolveSpecifier", src / "loader.ts"), ("checkExternals", src / "loader.ts"),
    ("bridger:via", src / "annotations.ts"), ("viaProvider", src / "host.ts"), ("runIsolationConformance", src / "isolation-conformance.ts"),
    ("maxLifetime", src / "tokens.ts"), ("sanitizeDeep", src / "gxp.ts"), ("authorizeShred", src / "shred.ts"), ("onUnmatched", src / "budget.ts"), ("auditMessage", src / "gxp.ts"), ("PeerMismatch", src / "federation.ts"), ("killPendingMaxAge", src / "fedplugin.ts"), ("ShredRefused", ref / "keyring/behaviors/03-shred-and-acceptance.md"), ("auditMessage", ref / "core/behaviors/23-audit-sink-and-record.md"), ("maxFenceJump", ref / "federation/behaviors/04-exports-and-imports.md"), ("onUnmatched", ref / "entitlement/behaviors/03-budgets.md"), ("makeEsmEvaluator", src / "evaluator.ts"), ("kill-overdue", ref / "federation/behaviors/06-kill-path-placement-and-skew.md"), ("makeEvaluator", src / "evaluator.ts"), ("makeKillSwitch", src / "kill-switch.ts"), ("openWorker", src / "worker-adapter.ts"),
    ("who provides the services that decide".capitalize(), root / "docs/ERP-ACCESS.md") if False else ("Who provides the services that decide", root / "docs/ERP-ACCESS.md"),
    ("BEH-BR-327", ref / "core/behaviors/32-generic-gate-and-plan.md"), ("BEH-BR-328", ref / "core/behaviors/32-generic-gate-and-plan.md"),
    ("BEH-BR-282", ref / "core/behaviors/29-capability-grants-and-call-log.md"), ("restartRequired", ref / "loader/behaviors/04-revocation-and-kill-switch.md"),
    ("allowBuiltins", ref / "loader/behaviors/02-load-pipeline.md"), ("BEH-RM-073", ref / "remote/behaviors/09-placement-budgets-and-adapters.md"),
    ("anchor-behind", ref / "audit-chain/behaviors/02-anchoring.md"), ("bridger:via", ref / "core/behaviors/30-operation-context-annotations.md"),
    ("SPK-09-12", ref / "remote/risks.md"), ("ADR-RM-011", ref / "remote/README.md"),
]
for t in ("sec-closed-context", "sec-declared-access", "sec-reversibility", "sec-chain-gate", "sec-restart-required", "sec-via", "sec-digest-closure", "sec-token-cap", "sec-provider-allowlist", "sec-isolation", "sec-undo-binding", "sec-evaluator", "sec-kill-switch", "sec-evaluator-esm", "sec-sanitize-deep"):
    grounded.append(("describe(", test / f"{t}.test.ts"))
stale = ["BEH-BR-32 plan entries", "Add to BEH-LD-002", "In remote BEH-RM-070s", "host.ts:1016-1067", "Everything is Draft/Planned: findings are about specified behaviour, not shipped code", "S1 is inferred from", "is not assessed. Everything is Draft", "No production worker adapter, evaluator or kill-switch loop exists"]
bad = []
for phrase, f in grounded:
    if not f.exists(): bad.append(f"{f} is missing")
    elif phrase not in f.read_text(): bad.append(f"{f.name} does not state '{phrase}'")
for phrase in ("Follow-up review", "S12", "S16", "Resolution status", "Bridger now", "BEH-RM-073", "BEH-LD-011", "restartGate", "bridger:via", "UndeclaredAccess"):
    if phrase not in report: bad.append(f"report no longer shows '{phrase}'")
for s in stale:
    if s in report: bad.append(f"report still says '{s}'")
print("\n".join(bad) or "report 06 status: ok")
sys.exit(1 if bad else 0)
