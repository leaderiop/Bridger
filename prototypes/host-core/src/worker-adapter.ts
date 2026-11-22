// `@bridger/worker` prototype (remote BEH-RM-052, BEH-RM-053; improvement report 06 R3): a guest in a Node `worker_threads` worker behind a Connection.
// It withholds what the mechanism can withhold (environment, CPU by termination, memory by resource limits, a shared module cache) and nothing else:
// the worker shares the process, so network and file system stay reachable, and isolation-conformance reports exactly that. First-party code and testing only.
import { Worker } from "node:worker_threads"
import { Effect, Queue } from "effect"
import type { Connection } from "./wire.js"
import type { Attempt, IsolationProbe, Probe } from "./isolation-conformance.js"

export interface WorkerGuest { readonly conn: Connection; readonly close: Effect.Effect<void> }
export interface WorkerOptions { readonly maxMemoryMb?: number; readonly env?: Record<string, string> }
/** The profile this adapter declares (BEH-RM-049): truthful, and silent about isolation. */
export const workerProfile = { liveness: "local", residency: [] as ReadonlyArray<string> } as const

const spawn = (code: string, o: WorkerOptions = {}) => new Worker(code, { eval: true, env: o.env ?? {}, resourceLimits: { maxOldGenerationSizeMb: o.maxMemoryMb ?? 32 } })

/** Opens the guest only here, never at import (BEH-RM-052 obligation 2). The guest speaks string frames through `parentPort`. */
export const openWorker = (guestSource: string, o: WorkerOptions = {}): Effect.Effect<WorkerGuest> => Effect.gen(function* () {
  const inbox = yield* Queue.unbounded<string>()
  const w = spawn(guestSource, o)
  w.on("message", (m) => { if (typeof m === "string") Queue.offerUnsafe(inbox, m) })
  return { conn: { send: (f) => Effect.sync(() => { w.postMessage(f) }), receive: Queue.take(inbox) }, close: Effect.promise(() => w.terminate()).pipe(Effect.asVoid) }
})

const ATTEMPT: Record<string, string> = {
  egress: `try { require("node:net"); require("node:dns"); post("reached") } catch { post("refused") }`,
  filesystem: `try { require("node:fs").readdirSync("/"); post("reached") } catch { post("refused") }`,
  environment: `post(Object.keys(process.env).length > 0 ? "reached" : "refused")`,
  cpu: `while (true) {}`,
  memory: `const a = []; for (;;) a.push(new Array(1e6).fill(1))`
}
const harness = (body: string) => `const { parentPort } = require("node:worker_threads"); const post = (r) => parentPort.postMessage(r); ${body}`

/** Runs one probe in a fresh worker of this adapter and reports what the guest could do. */
export const workerProbe: IsolationProbe = {
  attempt: (probe: Probe) => Effect.promise<Attempt>(() => new Promise((resolve) => {
    const done = (w: Worker, r: Attempt) => { void w.terminate(); resolve(r) }
    if (probe === "module-cache") {
      const a = spawn(harness(`globalThis.__leak = 1; require("node:module"); post("set")`))
      a.once("message", () => { const b = spawn(harness(`post(globalThis.__leak === undefined ? "refused" : "reached")`)); b.once("message", (r) => { void a.terminate(); done(b, r as Attempt) }) })
      return
    }
    const body = ATTEMPT[probe]
    if (!body) return resolve("unsupported")
    const w = spawn(harness(body), { env: {}, maxMemoryMb: 16 })
    w.once("message", (r) => done(w, r as Attempt))
    w.once("error", () => done(w, probe === "memory" ? "refused" : "refused"))      // out of memory: the limit held
    if (probe === "cpu") setTimeout(() => done(w, "refused"), 100)                  // the host cut a runaway guest by terminating it
  }))
}
