# 03 — Taint and Provenance

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-AG-BEH-03                                            |
> | Revision       | 0.9                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.9 (2026-11-11): BEH-AG-020: the reserved spawn call, never dispatched, falls under the same taint floor as a command not declared `readOnly` — refused "tainted-session" in a tainted session, no subagent run — and its `parent.context` carries the session's taint and the call's provenance; second pass (cleanest design): BEH-AG-020: the refusal is the agent's own `ToolRefused` "tainted-session", not `CommandRefused` (SPEC-AUDIT-09 A1) (CCR-AG-012)<br>0.8 (2026-11-11): BEH-AG-018: a session's taint starts with exactly the labels of `spawn.taint`, none for a top-level session (SPEC-AUDIT-05 PL7) (CCR-AG-008)<br>0.7 (2026-11-10): BEH-AG-022 a loop started with `StartRequest.spawn` pins no toolset and reads no selector (H10 follow-up) (CCR-AG-005)<br>0.6 (2026-11-09): The example of BEH-AG-023 carries the required `draftWithdrawal` (BEH-AG-016, audit U-12) (CCR-AG-004)<br>0.5 (2026-11-08): BEH-AG-020 scoped to commands not declared `readOnly`, following the command catalog's read-only exemption (round-2 agent review A-05) (CCR-AG-003)<br>0.4 (2026-11-08): Field-level untrusted output taints the session (label `untrusted-field:`); `TaintGuard.drafts` also drafts batches; provenance reaches core's call-log entries through the dispatch context; BEH-AG-023 tool results reach the model only as size-capped envelopes (CCR-AG-003, round 2: recheck items 5, 8; X8)<br>0.3 (2026-11-08): BEH-AG-020 relies on the command taint floor, `TaintGuard.drafts` supplies drafts; provenance entries `{ source, ref }`; tainted sessions use a distinct selector; `Annotations` type; `Actor.isWithin` (CCR-AG-002)<br>0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-AG-001)<br>0.1 (2026-11-08): Initial draft (CCR-AG-001)                 |

---

A model that has read text from an untrusted source — a partner's tool, an
imported document, a third party's product description — may follow
instructions hidden in it. No filter reliably removes such instructions. The
workable control is to remember that the session has read untrusted text and
to forbid any automatic approval from then on, so that a person looks before
anything changes. This file specifies the two annotations that carry that
memory (`Taint`, `Provenance`) in core's operation-context annotation bag
([core file 30](../../core/behaviors/30-operation-context-annotations.md)), the
rule that taint only rises, where it comes from, and how a tainted request
meets the command catalog's taint floor (command BEH-CM-016), for which
`TaintGuard` supplies the drafts. This file owns
BEH-AG-017–024 and uses BEH-AG-017–023; 024 is reserved.

> **What this does not do.** Taint is a label, propagated by the rules below.
> It does not detect injected instructions, does not clean text, and is only as
> complete as the sources the application declares. A session can be
> manipulated by untrusted text that reached it through a source nobody
> declared untrusted; the package cannot see that.

Planned source: `packages/agent/src/Taint.ts`, `packages/agent/src/TaintGuard.ts` *(Planned)*.

## BEH-AG-017: Taint and Provenance are annotations on OperationContext

> **Invariant:** [INV-AG-005](../invariants.md#inv-ag-005-taint-is-monotone-per-session)
> **See:** [ADR-AG-003](../decisions/003-taint-is-monotone-and-forbids-auto-allow.md)
> **Core seam:** [30 — Operation context annotations](../../core/behaviors/30-operation-context-annotations.md)

```ts
// illustrative — not type-checked; the keys are core file 30's, the label conventions are this package's
// Core: Annotation.Taint       id "bridger:taint"       A = ReadonlySet<string>   combine: union; monotonic
// Core: Annotation.Provenance  id "bridger:provenance"  A = readonly { source: string; ref?: string }[]
//                                                       combine: append, first occurrence kept, at most 32; monotonic
type TaintLabel =
  | `tool-output:${string}`      // command id of an output tagged "untrusted-output"
  | `untrusted-field:${string}`  // command id whose output held a value at an untrusted path (command BEH-CM-030)
  | `imported-tool:${string}`    // MCP import prefix (@bridger/mcp)
  | `mcp-inbound:${string}`      // set by @bridger/mcp on an untrusted inbound session (BEH-MC-002); carried here
  | `memory:${string}`           // memory entry id
  | `subagent:${string}`         // task id of a tainted subagent
  | `policy:${string}`           // a TaintPolicy rule name, or "policy:failed"

interface TaintState {             // a read view, derived; never stored separately
  readonly tainted: boolean        // true iff the session's Annotation.Taint set is non-empty
  readonly labels: ReadonlySet<string>
}
interface Provenance {             // one entry of Annotation.Provenance, with this package's sources
  readonly source: "user" | "model" | "tool" | "memory" | "subagent" | "system"
  readonly ref?: string            // command id, memory id, task id
}

declare const Taint: {
  readonly of: (annotations: Annotations) => TaintState   // core file 30, BEH-BR-289
}
```

```
REQUIREMENT: The package MUST store taint and provenance only in core's
             `Annotation.Taint` and `Annotation.Provenance` (core file 30),
             with the labels and sources above. It MUST NOT declare
             annotation keys of its own for them, and MUST NOT add fields to
             `Actor` or to `OperationContext` itself.
```

```
REQUIREMENT: A session MUST be tainted exactly when its `Annotation.Taint`
             set is non-empty. Because core combines that annotation by
             union and declares it monotonic, the package MUST NOT attempt
             to remove a label, and MUST NOT use `Annotation.replace` on it.
```

```
REQUIREMENT: Every dispatch made by `ToolRunner` MUST carry both
             annotations, so that a gate, hook point or call log reached by
             the dispatch can read them (core files 30, 31, 32, 29).
```

**Settled here.** Core bounds provenance at 32 entries; the taint set is
not truncated, because dropping a label could untaint a session.

**Open.** Whether a session with many distinct labels needs a bound on the
taint set's size in gate requests; [core file 30](../../core/behaviors/30-operation-context-annotations.md) does not bound it.

## BEH-AG-018: Taint is monotone per session

> **Invariant:** [INV-AG-005](../invariants.md#inv-ag-005-taint-is-monotone-per-session)
> **See:** [ADR-AG-003](../decisions/003-taint-is-monotone-and-forbids-auto-allow.md)

```
REQUIREMENT: A session's taint MUST start with exactly the labels of
             `StartRequest.spawn.taint` — none for a top-level session,
             whose `Taint.of(...).tainted` starts `false`; a subagent's
             session starts tainted when its parent's was (01, BEH-AG-003;
             04, BEH-AG-029) — and, once `true`, `tainted` MUST stay `true`
             for the life of the session. No API of
             the package MAY lower it, including `SessionStore.append`, a
             `replace` of any agent provider, and `resume`.
```

```
REQUIREMENT: A session MUST become tainted before the model is called with
             any message whose provenance names a source that BEH-AG-019 treats as
             a taint source.
```

```
REQUIREMENT: Every `TaskSnapshot` MUST carry the session's taint at its
             revision (BEH-AG-009).
```

There is no "untaint": the model's context window still contains the text
after any number of further turns. A person who wants a clean session starts
a new one.

**Settled here.** Tainting happens before the model reads the message, not
after the model responds, so the first tool call that follows already carries
the taint.

## BEH-AG-019: Sources of taint

> **Invariant:** [INV-AG-005](../invariants.md#inv-ag-005-taint-is-monotone-per-session)
> **See:** [ADR-AG-003](../decisions/003-taint-is-monotone-and-forbids-auto-allow.md)
> **Core seam:** [mcp — Client import](../../mcp/behaviors/03-client-import.md)

```ts
// illustrative — not type-checked
class TaintPolicy extends Context.Service<TaintPolicy, {
  readonly classify: (input: TaintInput) => Effect.Effect<boolean>   // true = tainted
}>()("@bridger/agent/TaintPolicy") {}
type TaintInput =
  | { readonly _tag: "UserMessage"; readonly sessionId: string; readonly actor: Actor }
  | { readonly _tag: "ToolOutput"; readonly descriptor: CommandDescriptor }
  | { readonly _tag: "MemoryEntry"; readonly entry: MemoryEntry }
```

```
REQUIREMENT: Whatever the policy says, a tool result MUST be tainted when
             its command was imported through `@bridger/mcp`'s client or is
             tagged "external" or "untrusted-output", and when its envelope
             (BEH-AG-023) lists at least one untrusted value — a value at
             one of the descriptor's `untrustedOutput` paths (command
             BEH-CM-030), labelled `untrusted-field:<command id>`; a memory entry MUST be
             tainted when it was stored with a non-empty taint set; a subagent's
             result MUST be tainted when the subagent's session is tainted
             (04 — Subagents). These defaults MUST NOT be overridable by
             `TaintPolicy`.
```

```
REQUIREMENT: `TaintPolicy`, when wired, MAY taint further inputs. It MUST
             NOT be able to untaint an input the defaults taint: a `false`
             from the policy for such an input MUST be ignored.
```

```
REQUIREMENT: A `TaintPolicy` that fails or dies MUST be treated as tainting
             the input.
```

The defaults cover what the package can see is untrusted. Everything else —
a user message pasted from an email, a product description from a supplier's
feed — only the application knows, which is why the policy exists and why it
can add but not remove.

**Settled here.** Policy failure taints (fail closed), as a gate failure
refuses in core ([ADR-BR-032](../../core/decisions/032-operation-gate.md)).

## BEH-AG-020: A tainted session is never auto-allowed a change

> **Invariant:** [INV-AG-001](../invariants.md#inv-ag-001-a-tainted-session-is-never-auto-allowed-a-change)
> **See:** [ADR-AG-003](../decisions/003-taint-is-monotone-and-forbids-auto-allow.md), [ADR-CM-005](../../command/decisions/005-taint-floor-in-dispatch.md)
> **Core seam:** [32 — Generic gate and plan](../../core/behaviors/32-generic-gate-and-plan.md), [30 — Operation context annotations](../../core/behaviors/30-operation-context-annotations.md), [command — Dispatch](../../command/behaviors/02-dispatch.md)

```ts
// illustrative — not type-checked
// The application's approval store, as TaintGuard needs it.
interface TaintDraftStore {
  // records a draft awaiting approval and returns the id it is stored under
  readonly create: (requests: readonly [CommandRequest, ...CommandRequest[]], reason: "tainted-session" | "batch-deferred") =>
    Effect.Effect<{ readonly draftId: string }, TaintDraftStoreError>
}
class TaintDraftStoreError extends Schema.TaggedError<TaintDraftStoreError>()("TaintDraftStoreError", {
  message: Schema.String
}) {}

declare const TaintGuard: {
  // a CommandDraftSource (command BEH-CM-016, BEH-CM-051) for CommandCatalog.layer({ drafts }),
  // with both draftFor and draftForBatch
  readonly drafts: (store: TaintDraftStore) => CommandDraftSource
}

// wiring, by the code that builds the application's base layers:
//   CommandCatalog.layer({ drafts: TaintGuard.drafts(myApprovalStore), gateWrappers: [...] })
```

```
REQUIREMENT: The package MUST rely on the taint floor of the command
             catalog (command BEH-CM-016) for the rule that a tainted
             request of a command not declared `readOnly` is never allowed
             on an automatic decision; a declared read keeps the gate's
             decision and the session keeps its taint. It MUST
             NOT install a plugin, interception or gate of its own for
             that rule, and every agent tool call MUST reach a handler only
             through `Commands.dispatch` (BEH-AG-005), so that the floor
             applies to it and to every dispatch nested inside it. The
             reserved spawn call is the one tool call that is not
             dispatched (01, BEH-AG-003); it falls under the same floor as
             a command not declared `readOnly`: in a tainted session it can
             carry no `ApprovalRef` and no draft source drafts it, so the
             loop answers it as the floor's row without a draft, with the
             agent's own refusal `ToolRefused { tool, reason:
             "tainted-session" }` (01, BEH-AG-003) — never a dispatch tag,
             since nothing was dispatched — and runs no subagent. The `parent.context` it passes to
             `spawnSubagent` carries the session's `Taint` and the call's
             `Provenance` (01, BEH-AG-003).
```

```
REQUIREMENT: `TaintGuard.drafts(store)` MUST return a `CommandDraftSource`
             whose `draftFor(r, reason)` calls `store.create([r], reason)`
             once and returns the well-formed draft of core BEH-BR-316:
             `draftId` the id the store returned (non-empty), `requests`
             exactly `[r]` without its `approval`, and `expected` exactly
             `[{ key: "bridger-command:" + r.command, version: r.digest }]`;
             and whose `draftForBatch(rs, parts, reason)` calls
             `store.create(rs, reason)` once and returns a draft whose
             `requests` are exactly `rs` in order (without `approval`) and
             whose `expected` holds one such entry per distinct command of
             `rs` together with every expectation of `parts`, without
             duplicate keys (a key whose versions disagree MUST fail the
             call).
             When the store fails or returns an empty id, `draftFor` MUST
             fail; it MUST NOT invent a draft id. (The floor then refuses
             with "gate-defect".)
```

```
REQUIREMENT: Whether an approval exists, and who gave it, is checked by the
             application's gate against its own approval store; core file
             32 stores none, and dispatch checks only that an `ApprovalRef`
             is bound to the request's digest and `inputDigest` (command
             BEH-CM-011). The package's documentation MUST state that the
             application's gate must not accept an approval given by the
             agent's actor or by any narrowing of it, which the gate tests
             with core's `Actor.isWithin(approver, agentActor)` (core
             BEH-BR-337).
```

```
REQUIREMENT: `ToolRunner` MUST map a floor deferral like any gate deferral
             (`Deferred { draftId }`, BEH-AG-005, which puts the task in
             `awaiting-approval`, BEH-AG-012), and a floor refusal
             (`CommandRefused` with reason "tainted-session" or
             "gate-defect") to `Failed` with that tag and reason.
```

The rule itself is the command catalog's: a request carrying core's taint
annotation passes on `Allow` only with an effective gate and an approval
reference bound to it, whether or not a gate is wired, and however deeply the
dispatch is nested ([ADR-CM-005](../../command/decisions/005-taint-floor-in-dispatch.md)).
This package contributes what makes the deferral useful: the taint label on
every request a steered session makes (BEH-AG-017 to BEH-AG-019), and a draft
source that turns a withheld allow into a draft a person can approve.

**Settled here.** (1) An untainted session is unaffected: the application's
gate may allow automatically. (2) Without a gate, or without a draft source,
a tainted request is refused or deferred, never allowed, because "no gate" is
not an approval. (3) A draft records the descriptor digest as its expected
version, so an approval given for one definition of the command is stale for
another (core BEH-BR-316). (4) The approval must not come from the agent's own
actor, so an agent cannot approve its own draft; this check sits in the
application's gate because only it holds approvals.

**Open.** None. (Recognising "the agent's actor or a narrowing of it", open in
revision 0.2, is settled by core's `Actor.isWithin`,
[core file 33](../../core/behaviors/33-realm-families.md), BEH-BR-337.)

## BEH-AG-021: Provenance reaches tool results, the call log and stored data

> **See:** [ADR-AG-003](../decisions/003-taint-is-monotone-and-forbids-auto-allow.md)
> **Core seam:** [29 — Capability grants and call log](../../core/behaviors/29-capability-grants-and-call-log.md)

```
REQUIREMENT: Every tool result returned to the loop MUST carry a
             `Provenance` entry `{ source: "tool", ref: <command id> }`
             (core `Annotation.Provenance`, BEH-BR-290); whether it taints
             the session is decided by BEH-AG-019 and recorded in
             `Annotation.Taint`, not in the provenance entry. The result
             MUST be stored with that provenance (BEH-AG-004).
```

```
REQUIREMENT: When core's `CallLog` port is wired, the annotations of every
             agent dispatch MUST reach it through the dispatch's context
             unchanged — on the refusal entries the command catalog offers
             and on core's entries for the calls a handler makes (command
             BEH-CM-015); the package MUST NOT write a separate call log.
```

```
REQUIREMENT: Provenance MUST NOT carry message content or tool input or
             output values; only sources and references.
```

**Settled here.** Provenance is a reference, not a copy, so annotations never
become a channel for content that the call log or a gate should not hold.

## BEH-AG-022: Taint does not sanitize and does not cross out of the session

> **See:** [ADR-AG-003](../decisions/003-taint-is-monotone-and-forbids-auto-allow.md), [ADR-BR-027](../../core/decisions/027-core-exclusions.md)

```
REQUIREMENT: The package MUST NOT describe taint as detecting, blocking or
             removing injected instructions, and MUST NOT offer a function
             that rewrites tainted text into untainted text.
```

```
REQUIREMENT: The package MUST NOT, by its own decision, change what the
             model is shown or which tools are in the pinned toolset because
             of taint; taint MUST only affect gate outcomes (BEH-AG-020) and
             what observers see, except through the application's choice
             below.
```

```
REQUIREMENT: An application that wants a tainted session to see fewer tools
             MUST give a distinct selector for it in
             `StartRequest.taintedSelector` (BEH-AG-003). Unless
             `StartRequest.spawn` is present (a subagent uses its parent's
             restricted toolset and pins nothing, BEH-AG-003), the loop MUST pin
             with that selector for every turn that begins while the
             session is tainted, and with `selector` otherwise. The package
             MUST NOT pass taint to a selector: the command companion's
             `include` receives the descriptor and the principal only, and
             toolset generations are keyed by (actor id, selector name)
             (command BEH-CM-018, BEH-CM-021).
```

Keeping taint out of the toolset keeps the model's view and the gate's rule
separate: narrowing the toolset is a product choice, approval is a control,
and only the control is fixed here. A distinct selector name keeps a tainted
and an untainted session of the same actor from sharing one toolset
generation.

**Settled here.** The switch happens at a turn boundary, because a turn sees
one toolset (BEH-AG-003); a session tainted in the middle of a turn keeps its
pin until the turn ends, and the floor still governs every call it makes.

## BEH-AG-023: Tool results reach the model only as size-capped envelopes

> **Invariant:** [INV-AG-007](../invariants.md#inv-ag-007-untrusted-tool-output-reaches-the-model-only-inside-an-envelope)
> **See:** [ADR-AG-003](../decisions/003-taint-is-monotone-and-forbids-auto-allow.md)
> **Core seam:** [command — JSON Schema projection](../../command/behaviors/04-json-schema-projection.md)

```ts
// illustrative — not type-checked
AgentLoop.plugin({ draftWithdrawal, maxToolResultBytes: 32768 })   // maxToolResultBytes is passed to Command.envelope as maxBytes; integer ≥ 1024
// A tool message as stored and as shown to the model:
//   { role: "tool", content: ModelEnvelope, provenance: { source: "tool", ref: "<command id>" } }
```

```
REQUIREMENT: The reference loop MUST turn every `Ok` tool result into a
             message whose content is `Command.envelope(descriptor,
             encodedOutput, { maxBytes: maxToolResultBytes })` (command
             BEH-CM-030), with the descriptor of the turn's pinned toolset,
             and MUST store and replay that envelope, never the raw output,
             as the tool message (BEH-AG-004, BEH-AG-034).
```

```
REQUIREMENT: For an imported command (whole output untrusted) the envelope
             holds the output as one untrusted value; for a command without
             untrusted paths it holds the output as data, still bounded by
             `maxBytes`. A `ModelAdapter` MUST present the envelope's
             `untrusted` entries to the model as quoted data separate from
             `data` and MUST NOT merge them back into it.
```

```
REQUIREMENT: The package MUST NOT describe the envelope as removing or
             neutralising instructions (BEH-AG-022). Its effects are that
             untrusted text is marked and bounded in what the model reads,
             and that the session is tainted when such text is present
             (BEH-AG-019).
```

A model reads tool results as part of its context. Before this revision an
imported tool's answer, or a supplier's product description inside an
otherwise trusted output, reached the model as plain structure, unbounded.
The envelope gives every consumer the same rendering — a size cap, numbered
untrusted values, a deterministic shape a transcript can replay — and the
taint keeps the gate's rule in force whatever the model does with it.

**Settled here.** (1) The cap applies to every tool result, untrusted or not:
a large trusted result can crowd out the prompt as well. (2) The envelope is
computed by the loop, not by the runner, so a replacement `ToolRunner` cannot
skip it.

---

_Previous: [02 — Tasks](./02-tasks.md)_ · _Next: [04 — Subagents](./04-subagents.md)_
