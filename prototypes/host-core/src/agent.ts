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
