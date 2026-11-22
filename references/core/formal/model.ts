// The reference model of the Bridger host core (report 07, R1). Pure: no Effect, no clock, no I/O.
// It states, as functions, three things the prose of references/core leaves implicit:
//   1. quiescent(...)  what "the settled state depends only on what is installed" means (BEH-BR-160);
//   2. the operation tables, read from the transition ledger (transitions.yaml) and never copied;
//   3. predicates over traces and wait-for graphs for INV-BR-017, 022, 023 and 030.
// The prototype is checked against it (prototypes/host-core/test/model.test.ts, test/pbt/*). The model covers the
// settled behaviour of the dependency graph, not leases, handoff, hooks or the audit gate; those are checked by the
// scenario and property suites only. It is not an implementation and evidences no requirement (CCR-BR-004).

// ---------------------------------------------------------------- the ledger
export type Ledger = {
  readonly rows: Readonly<Record<string, Readonly<Record<string, string>>>>
  readonly inFlight: Readonly<Record<string, Readonly<Record<string, string>>>>
}
/** BEH-BR-071: the outcome of `op` on a plugin in `row` with no operation in flight. */
export const legal = (ledger: Ledger, row: string, op: string): string => {
  const cell = ledger.rows[row]?.[op]
  if (cell === undefined) throw new Error(`no cell for ${row} x ${op}`)
  return cell
}
/** BEH-BR-072: the outcome of `op` while `flight` is in flight on the plugin. */
export const flight = (ledger: Ledger, inFlight: string, op: string): string => {
  const cell = ledger.inFlight[inFlight]?.[op]
  if (cell === undefined) throw new Error(`no cell for ${inFlight} x ${op}`)
  return cell
}

// ---------------------------------------------------------------- quiescent state
export type Registration = {
  readonly id: string
  readonly realm: string
  /** Service ids this plugin cannot start without. */
  readonly requires: ReadonlyArray<string>
  readonly provides: ReadonlyArray<string>
  /** Registrations it installs while it is active (BEH-BR-121); a child needs its parent active. */
  readonly children?: ReadonlyArray<Registration>
}
/** A realm resolves a service to a provider in its own realm when it isolates it, else in `default` (BEH-BR-062). */
export type Realms = Readonly<Record<string, ReadonlySet<string>>>
export type Desired = ReadonlyArray<{ readonly reg: Registration; readonly enabled: boolean }>
export type Settled = ReadonlyArray<{
  readonly id: string; readonly realm: string; readonly parent?: string
  readonly state: "active" | "waiting" | "disabled"; readonly missing?: ReadonlyArray<string>
}>

const keyOf = (r: { id: string; realm: string }) => JSON.stringify([r.realm, r.id])

/**
 * quiescent(desired, realms): the state every registration rests in once the host is idle, as a function of the
 * installed set alone (BEH-BR-160). A registration is
 *   `disabled` if it is installed with its enabled flag off,
 *   `active`   if it is enabled and every required service has an active provider in its realm's resolution scope,
 *   `waiting`  otherwise, with `missing` the required services that have none;
 * a child exists exactly while its parent is active, in the parent's realm. Active is the least fixed point of the
 * rule, so the order of operations that produced the set cannot enter. Failure, lazy registrations and refusal lists
 * are history, not part of the function (the exceptions of BEH-BR-160).
 */
export const quiescent = (desired: Desired, realms: Realms): Settled => {
  const regs = desired.map((d) => ({ reg: d.reg, enabled: d.enabled, parent: undefined as string | undefined }))
  const active = new Set<string>()
  const providerActive = (service: string, realm: string) => {
    const where = realms[realm]?.has(service) ? realm : "default"
    return [...pool(regs, active)].some((r) => r.reg.realm === where && r.reg.provides.includes(service) && active.has(keyOf(r.reg)))
  }
  // Children of an active registration join the pool; iterate to the fixed point.
  for (let changed = true; changed;) {
    changed = false
    for (const r of pool(regs, active)) {
      const k = keyOf(r.reg)
      if (active.has(k) || !r.enabled) continue
      if (r.reg.requires.every((s) => providerActive(s, r.reg.realm))) { active.add(k); changed = true }
    }
  }
  const out: Array<Settled[number]> = []
  for (const r of pool(regs, active)) {
    const k = keyOf(r.reg)
    const base = { id: r.reg.id, realm: r.reg.realm, ...(r.parent ? { parent: r.parent } : {}) }
    if (active.has(k)) out.push({ ...base, state: "active" })
    else if (!r.enabled) out.push({ ...base, state: "disabled" })
    else out.push({ ...base, state: "waiting", missing: r.reg.requires.filter((s) => !providerActive(s, r.reg.realm)).sort() })
  }
  return out.sort((a, b) => keyOf(a).localeCompare(keyOf(b)))
}
/** The top-level registrations, plus the children of every active one, recursively. */
function* pool(regs: ReadonlyArray<{ reg: Registration; enabled: boolean; parent: string | undefined }>, active: ReadonlySet<string>): Generator<{ reg: Registration; enabled: boolean; parent: string | undefined }> {
  for (const r of regs) {
    yield r
    if (active.has(keyOf(r.reg))) yield* pool((r.reg.children ?? []).map((c) => ({ reg: { ...c, realm: r.reg.realm }, enabled: true, parent: r.reg.id })), active)
  }
}

// ---------------------------------------------------------------- wait-for graphs (INV-BR-030)
/** `from` waits for `to`: a transition step, a lease, or the concurrency slot. */
export type WaitEdge = readonly [from: string, to: string]
/** INV-BR-030: the wait-for relation between host transitions has no cycle. Returns one cycle, or undefined. */
export const waitCycle = (edges: ReadonlyArray<WaitEdge>): ReadonlyArray<string> | undefined => {
  const next = new Map<string, Array<string>>()
  for (const [a, b] of edges) next.set(a, [...(next.get(a) ?? []), b])
  const done = new Set<string>()
  const walk = (n: string, path: ReadonlyArray<string>): ReadonlyArray<string> | undefined => {
    if (path.includes(n)) return [...path.slice(path.indexOf(n)), n]
    if (done.has(n)) return undefined
    for (const m of next.get(n) ?? []) { const c = walk(m, [...path, n]); if (c) return c }
    done.add(n)
    return undefined
  }
  for (const n of next.keys()) { const c = walk(n, []); if (c) return c }
  return undefined
}
export const inv030 = (edges: ReadonlyArray<WaitEdge>): boolean => waitCycle(edges) === undefined

/**
 * The wait-for edges of a parent build that, in a finalizer, takes over the removal of its child while the child has
 * a build queued for the concurrency slot the parent's build holds (SPEC-AUDIT-09 H1, INV-BR-030, BEH-BR-121).
 * `round-8`: the take-over waits for the child's running step, a build included; `fixed`: only for its stop step.
 */
export const takeOverWaits = (rules: "round-8" | "fixed"): ReadonlyArray<WaitEdge> => [
  ["build:parent", "take-over:child"],                       // the finalizer runs inside the parent's build and waits for the take-over
  ["build:child", "slot"],                                   // the child's build is queued for the slot
  ["slot", "build:parent"],                                  // the slot is released when the parent's build ends
  rules === "round-8" ? ["take-over:child", "build:child"] : ["take-over:child", "stop:child"]
]

// ---------------------------------------------------------------- trace predicates
/** INV-BR-017: every drain that started ended within its limit (a limit of `forever` is declared, not a default). */
export const inv017 = (drains: ReadonlyArray<{ readonly start: number; readonly end?: number; readonly limit: number | "forever" }>, now: number): boolean =>
  drains.every((d) => d.limit === "forever" || (d.end ?? now) - d.start <= d.limit)

type RecordLike = { readonly auditSeq: number; readonly phase: string; readonly correlationId: string; readonly operation: string; readonly target?: { readonly id: string; readonly realm: string } }
/** INV-BR-023: `auditSeq` runs 1, 2, 3, … with no gap, no repeat and no reordering. */
export const inv023 = (records: ReadonlyArray<Pick<RecordLike, "auditSeq">>): boolean => records.every((r, i) => r.auditSeq === i + 1)
/**
 * INV-BR-022, for an idle host: of the records a call writes (same correlation, operation and target), exactly one is
 * `requested` and exactly one is terminal, or exactly one is `rejected` and none `requested`. System records stand outside it.
 */
export const inv022 = (records: ReadonlyArray<RecordLike>): boolean => {
  const calls = new Map<string, Array<string>>()
  for (const r of records) {
    if (r.phase === "system") continue
    const k = JSON.stringify([r.correlationId, r.operation, r.target?.id, r.target?.realm])
    calls.set(k, [...(calls.get(k) ?? []), r.phase])
  }
  const terminal = new Set(["completed", "failed", "superseded", "joined"])
  return [...calls.values()].every((phases) => {
    const requested = phases.filter((p) => p === "requested").length
    const ended = phases.filter((p) => terminal.has(p)).length
    const rejected = phases.filter((p) => p === "rejected").length
    return (requested === 1 && ended === 1 && rejected === 0) || (requested === 0 && ended === 0 && rejected === 1)
  })
}
