# Runtime Invariants

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-CM-INV                                               |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.2 (2026-11-08): INV-CM-006 added (taint floor) (CCR-CM-002)<br>0.1 (2026-11-08): Initial draft (CCR-CM-001)                 |

---

Properties of `@bridger/command` that hold for every execution. The shape is
that of the [core invariants](../core/invariants.md): statement, **Source**,
**Implication**, **Verification**, **Related**. Nothing below is implemented;
every Source and Verification is *(Planned)*, and no invariant here may be
cited as evidence until a test that checks it has run
([ADR-BR-035](../core/decisions/035-evidence-from-executed-tests.md)).

## INV-CM-001: The catalog runs a handler only through dispatch

A handler contributed to the catalog is run by the package only at step 6 of
`Commands.dispatch`, after the gate (when wired) has allowed that dispatch and
the before-hooks have not vetoed it.

**Source**: `packages/command/src/Commands.ts` *(Planned)* — the only call
site of a stored handler; `packages/command/src/CommandCatalog.ts`
*(Planned)* — the registry is private and views map entries to descriptors.

**Implication**: holding the catalog gives a caller descriptors, not a way
around the gate. The guarantee is about the package: in-process code that
holds the handler function itself (its author) can call it; plugins are
trusted code and no isolation is claimed.

**Verification** *(Planned)*: a runtime walk of every exported value and of
the catalog's views asserting no function reachable from them calls a
handler; per-step failure tests (acceptance check 5); mutation testing of the
gate call.

**Related**: BEH-CM-003, BEH-CM-004, BEH-CM-009, BEH-CM-011; ADR-CM-001.

## INV-CM-002: A toolset's order depends only on its contents

`Toolset.tools` is ordered by command id; two toolsets with the same
descriptors for the same principal and selector are equal element by element
and have the same fingerprint.

**Source**: `packages/command/src/Toolsets.ts` *(Planned)* — a sort by id at
build time; the fingerprint over the ordered digests.

**Implication**: activation order, contribution timing and registry priority
never reorder what a model or an MCP client is shown; a restart that
re-creates the same catalog shows the same list.

**Verification** *(Planned)*: a property test over random contribution,
activation and priority orders on `TestHost` (acceptance check 11).

**Related**: BEH-CM-017, BEH-CM-018, BEH-CM-020; ADR-CM-003.

## INV-CM-003: A pinned tool never runs a different definition

A dispatch made with a pinned toolset, or after a gate decision, runs the
handler only if the catalog entry's digest equals the digest the caller was
shown and the gate decided on; otherwise it fails with a typed error and runs
nothing.

**Source**: `packages/command/src/Commands.ts` *(Planned)* — digest checks at
step 1 and again inside the contribution hold at step 6.

**Implication**: a tool removed and re-contributed with a different
description in the middle of a turn, or between approval and execution, is
never executed under the old description or the old approval.

**Verification** *(Planned)*: scenario tests of the remove-and-re-contribute
race with held `TestHost` steps (acceptance checks 9 and 10).

**Related**: BEH-CM-005, BEH-CM-013, BEH-CM-019; ADR-CM-003.

## INV-CM-004: Projection and digest are deterministic

Projecting a command's schemas, and computing its descriptor digest, yields
the same canonical bytes in every process for the same definition.

**Source**: `packages/command/src/JsonSchema.ts` *(Planned)* — fixed generator
options, path-derived `$defs` names, RFC 8785 canonicalisation; SHA-256 of the
canonical form.

**Implication**: digests, fingerprints and list-changed decisions do not
change on restart; a generated SDK can compute the same digest.

**Verification** *(Planned)*: a test that projects a fixed set of schemas in
two processes and compares bytes (acceptance check 12); golden files.

**Related**: BEH-CM-001, BEH-CM-005, BEH-CM-025, BEH-CM-027; ADR-CM-004.

## INV-CM-005: Toolset membership grants nothing

Every dispatch of a command that is in a toolset passes the same steps,
including the gate, as a dispatch of a command that is in none.

**Source**: `packages/command/src/Commands.ts` *(Planned)* — the toolset is
checked at step 1 only to refuse; it is not an input to the gate decision.

**Implication**: there is one decision point for what is allowed. A selector
that offers too much does not let anything run that the gate refuses.

**Verification** *(Planned)*: a test in which the gate refuses a toolset
member (acceptance check 11); static review that no code path reads toolset
membership after step 1.

**Related**: BEH-CM-011, BEH-CM-021, BEH-CM-022; ADR-CM-002.

## INV-CM-006: A tainted dispatch never runs on an automatic allow

A dispatch whose resolved annotations carry a non-empty core
`Annotation.Taint` set runs its handler only when an effective gate is wired,
that gate allowed the request, and the request carries an `ApprovalRef` bound
by dispatch to the same descriptor digest and the same `inputDigest`. Every
other path ends in `CommandDeferred` or `CommandRefused`.

**Source**: `packages/command/src/Commands.ts` *(Planned)* — the taint floor
at step 4, after the effective gate and the approval-binding checks of steps
1 and 2; `packages/command/src/CommandCatalog.ts` *(Planned)* — wrappers fixed
when the layer is built.

**Implication**: a session steered by untrusted text can propose a change but
cannot make one happen on an automatic decision, whatever gate (or none) the
application wired, and a nested dispatch inherits the taint (BEH-CM-003). The
guarantee is about the package's dispatch path: in-process code that holds a
handler function can still call it (INV-CM-001), and whether an approval is
genuine is the application gate's check.

**Verification** *(Planned)*: a property test over taint, gate decision,
approval and draft source (acceptance check 13); a nested-dispatch scenario
(acceptance check 3); mutation testing of the floor table.

**Related**: BEH-CM-003, BEH-CM-011, BEH-CM-016; ADR-CM-005.
