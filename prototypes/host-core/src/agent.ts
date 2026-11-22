// Minimal agent loop pieces (agent 02, 03, 05; improvement report 06 S45, S52): a resume that recomputes taint from the drafted command's descriptor, a bounded
// task store and a transcript that keeps digests unless content is asked for. Models, tools and subagents are not modelled.
import { recomputeOnResume, taskStore, transcriptEntry } from "./hardening.js"

export const makeAgent = (o: { readonly descriptors: ReadonlyMap<string, { external: boolean }>; readonly retain: number; readonly content: boolean }) => {
  const tasks = taskStore(o.retain), transcript: Array<ReturnType<typeof transcriptEntry>> = []
  /** Outcomes supplied by the application on approval are recorded, but taint comes from the descriptor the draft digest names. */
  const resume = (draftDigest: string, supplied: { output: string; tainted?: boolean }) => {
    transcript.push(transcriptEntry(supplied.output, o.content))
    return { tainted: recomputeOnResume(draftDigest, o.descriptors).tainted, output: supplied.output }
  }
  return { resume, finishTask: tasks.finish, purge: tasks.purge, retained: tasks.size, transcript: () => transcript }
}

export class ReplayDiverged extends Error { readonly _tag = "ReplayDiverged"; constructor(readonly callId: string, readonly why: "missing" | "different") { super(`replay diverged at ${callId}: ${why}`) } }
export interface RecordedSpawn { readonly callId: string; readonly args: string; readonly outcome: string; readonly tainted: boolean }
/** BEH-AG-035 (SPEC-AUDIT-09 H3): during replay a reserved spawn call runs no subagent; it is answered with the outcome recorded for its callId, and a missing or different one diverges. */
export const makeReplay = (recorded: ReadonlyArray<RecordedSpawn>) => {
  const byId = new Map(recorded.map((r) => [r.callId, r])); let tainted = false; const transcript: Array<{ callId: string; outcome: string }> = []
  const spawn = (callId: string, args: string) => {
    const r = byId.get(callId)
    if (!r) throw new ReplayDiverged(callId, "missing")
    if (r.args !== args) throw new ReplayDiverged(callId, "different")
    if (r.tainted) tainted = true                                   // the session is tainted from the recorded flag, not from running anything
    transcript.push({ callId, outcome: r.outcome }); return r.outcome
  }
  return { spawn, tainted: () => tainted, transcript: () => transcript }                // no element of a spawned subagent is ever added
}
