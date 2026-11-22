// Check on read, minimal kernel (gxp BEH-GX-033; improvement report 06 S30): sequence kinds only, a policy digest on every report, and a run under a policy
// other than the recorded active one is a finding, never silently accepted. The other finding kinds are listed as not checked.
import { createHash } from "node:crypto"
import { verifyAuditSequence } from "./gxp.js"

export const FINDING_KINDS = ["gap", "duplicate", "outOfOrder", "digestMismatch", "canonicalMismatch", "unknownSchemaVersion", "nonCanonical", "collision",
  "requestedWithoutTerminal", "droppedSinceAck", "auditDropped", "noCleanClose", "approvalWithoutRecord", "recordWithoutApproval", "tailLoss", "unanchoredTail",
  "chainBreak", "anchorMismatch", "headMismatch", "chainUnanchoredTail", "chainNonCanonical", "chainLossCounterRose", "anchorUnconfirmed", "chainLinkUnchecked",
  "bundleMismatch", "policyNotRecorded"] as const
export type FindingKind = (typeof FINDING_KINDS)[number]
export interface Finding { readonly kind: FindingKind; readonly hostId: string; readonly auditSeq?: number; readonly toSeq?: number; readonly detail?: string }
export interface CheckReport {
  readonly format: "bridger-gx-check/1"; readonly scope: ReadonlyArray<{ hostId: string; fromSeq: number; toSeq: number }>
  readonly checkedKinds: ReadonlyArray<FindingKind>; readonly notCheckedKinds: ReadonlyArray<FindingKind>; readonly policyDigest: string
  readonly findings: ReadonlyArray<Finding>; readonly statement: string
}
const digest = (policy: unknown) => "sha256:" + createHash("sha256").update(JSON.stringify(policy)).digest("hex")

/** `recordedPolicy` is the active policy the trail recorded; `policy` the one the caller evaluates under. They differ: `policyNotRecorded`, and the digest is the caller's. */
export const checkTrail = (hostId: string, entries: ReadonlyArray<{ auditSeq: number }>, o: { readonly policy: unknown; readonly recordedPolicy: unknown }): CheckReport => {
  const v = verifyAuditSequence(entries)
  const findings: Finding[] = [
    ...v.gaps.map((g) => ({ kind: "gap" as const, hostId, auditSeq: g.after + 1, toSeq: g.before - 1 })),
    ...v.duplicates.map((n) => ({ kind: "duplicate" as const, hostId, auditSeq: n })),
    ...v.outOfOrder.map((n) => ({ kind: "outOfOrder" as const, hostId, auditSeq: n }))]
  const policyDigest = digest(o.policy)
  if (policyDigest !== digest(o.recordedPolicy)) findings.push({ kind: "policyNotRecorded", hostId, detail: "evaluated under a policy other than the recorded active policy" })
  const checked: FindingKind[] = ["gap", "duplicate", "outOfOrder", "policyNotRecorded"]
  const order = (f: Finding) => FINDING_KINDS.indexOf(f.kind)
  findings.sort((a, b) => (a.auditSeq ?? Infinity) - (b.auditSeq ?? Infinity) || order(a) - order(b))
  const notChecked = FINDING_KINDS.filter((k) => !checked.includes(k))
  const seqs = entries.map((e) => e.auditSeq)
  return { format: "bridger-gx-check/1", scope: [{ hostId, fromSeq: seqs.length ? Math.min(...seqs) : 0, toSeq: seqs.length ? Math.max(...seqs) : 0 }],
    checkedKinds: FINDING_KINDS.filter((k) => checked.includes(k)), notCheckedKinds: notChecked, policyDigest, findings,
    statement: `${findings.length === 0 ? "No findings" : `${findings.length} findings`} of the checked kinds. Kinds not checked: ${notChecked.join(", ")}.` }
}
