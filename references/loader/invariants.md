# Loader — Runtime Invariants

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-LD-INV                                               |
> | Revision       | 0.7                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification (companion)                         |
> | Change History | 0.7 (2026-11-11): INV-LD-005: the scope's plugins are those core reports owned by it (`PluginSnapshot.scope`), and a catalog withdrawal is never acted on under the revocation actor (L1, L4) (SPEC-AUDIT-07) (CCR-LD-010)<br>0.6 (2026-11-11): INV-LD-005: a revocation's only actions are the removals of the dropped entries, by `Host.remove`, never a reconcile (H6) (SPEC-AUDIT-06) (CCR-LD-009)<br>0.5 (2026-11-11): INV-LD-004: the `RevokedDigests` view serves the refusal list and the remote boundary, and the kill switch and gate agree with it on the same inputs — agreement, not one computation (PL16); INV-LD-005: a revocation reconcile keeps every entry still installed as its last completed action left it, whatever its pending status (H8) (SPEC-AUDIT-05) (CCR-LD-008)<br>0.4 (2026-11-09): INV-LD-009 (no package is evaluated in the host's process without an accepted first-party statement); INV-LD-001 and INV-LD-004 cite file 09 (specification audit F-06, M-06); INV-LD-009 guest wording (independent review) (CCR-LD-004)<br>0.3 (2026-11-08): INV-LD-007 (a data pack is never evaluated) and INV-LD-008 (a signature counts only for its statement type) (round 2: recheck items 11, 12) (CCR-LD-003)<br>0.2 (2026-11-08): INV-LD-003 covers lazy definitions built with `Plugin.lazy`'s `digest` and proxies stamped by `stampRemote`; INV-LD-005 states the two actors of the kill switch (CCR-LD-002)<br>0.1 (2026-11-08): Initial draft (CCR-LD-001)                 |

---

Properties of `@bridger/loader` that hold for every execution. As in core's
[invariants](../core/invariants.md), each names the mechanism that is to
enforce it; every **Source** and **Verification** is *(Planned)*, and no
invariant here may be cited as evidence until a test that checks it has been
written and executed ([ADR-BR-035](../core/decisions/035-evidence-from-executed-tests.md)).

## INV-LD-001: No code is evaluated before its digest and signatures are accepted

No byte of a package reaches an evaluator, a module loader, `eval`,
`Function`, `import()` or `require` before the digest comparison, the
acceptance rule, the "first-party" rule (BEH-LD-065), the revocation check and
the application's predicates have all succeeded for that package.

**Source**: `packages/loader/src/Loader.ts` *(Planned)* — the pipeline is one
sequential `Effect.gen` whose evaluator call is reachable only after the
verified value is constructed; `VerifiedPackage` has no public constructor.

**Implication**: unapproved, altered or revoked code is never run by the
loader, even transiently; a refusal has no side effect beyond the loader's
record.

**Verification** *(Planned)*: acceptance check 2 of BEH-LD-048 with the
recording evaluator, each step failing in turn; a type-level test that
`EvaluatorShape.evaluate` accepts only `VerifiedPackage`.

**Related**: [BEH-LD-004](behaviors/01-package-and-digest.md), [BEH-LD-009](behaviors/02-load-pipeline.md), [BEH-LD-013](behaviors/02-load-pipeline.md), [BEH-LD-024](behaviors/03-signature-policy.md), [BEH-LD-037](behaviors/05-catalog-and-lazy-loading.md), [BEH-LD-065](behaviors/09-trust-class-and-guest-links.md), [ADR-LD-001](decisions/001-verify-before-evaluate.md).

---

## INV-LD-002: The evaluated bytes are the verified bytes

The bytes an evaluator evaluates are, file for file, the bytes whose digest
was computed and accepted, and every import they make resolves to another
verified file of the same package or to an application-supplied external.

**Source**: `packages/loader/src/Evaluator.ts` *(Planned)* — evaluation from
in-memory bytes held by `VerifiedPackage`; a resolver that maps relative
specifiers to package files and bare specifiers to `externals` only.

**Implication**: closes the window between check and use, and the door of an
import that pulls in code no digest covers.

**Verification** *(Planned)*: acceptance check 3 of BEH-LD-048 (mutating the
fetcher's store after verification; URL and unlisted bare imports).

**Related**: [BEH-LD-011](behaviors/02-load-pipeline.md), [BEH-LD-042](behaviors/06-limits-and-acceptance.md), [ADR-LD-001](decisions/001-verify-before-evaluate.md).

---

## INV-LD-003: A stamped digest is the verified package digest

Every `meta.digest` the loader writes — on a loaded definition, on a lazy
definition from a catalog entry (through `Plugin.lazy`'s `digest` option), or
on a proxy definition stamped by `Loader.stampRemote` — equals the package
digest it recomputed from the bytes it verified, and every `meta.version` it
writes equals the verified manifest's version.

**Source**: `packages/loader/src/Package.ts`, `Lazy.ts` *(Planned)* — stamping
reads the digest only from the `VerifiedPackage` or `VerifiedEntry`, never
from input; a manifest carrying `digest` is refused.

**Implication**: core's records and gate requests name the bytes that were
checked; `reconcile` idempotence over loader-built lists is sound.

**Verification** *(Planned)*: acceptance checks 1, 5, 15 and 16 of BEH-LD-048;
property test: for generated packages, the stamp equals an independent
implementation of the construction.

**Related**: [BEH-LD-002](behaviors/01-package-and-digest.md), [BEH-LD-007](behaviors/01-package-and-digest.md), [BEH-LD-034](behaviors/05-catalog-and-lazy-loading.md), [BEH-LD-037](behaviors/05-catalog-and-lazy-loading.md), [BEH-LD-039](behaviors/05-catalog-and-lazy-loading.md), [ADR-LD-002](decisions/002-package-digest-commits-to-manifest-sbom-and-files.md).

---

## INV-LD-004: A revoked digest is never newly loaded

With a current revocation set that is not stale, no `load`, `fetchVerified`,
catalog verification or lazy trigger accepts a digest revoked by digest, or
whose acceptance rule is unsatisfied once revoked signers are removed.

**Source**: `packages/loader/src/Revocation.ts` *(Planned)* — step 5 of the
pipeline and `Catalog.verifyEntry` read the current set; stale or
unavailable sets refuse.

**Implication**: the kill switch also holds for code that has not been loaded
yet, including lazy plugins whose trigger fires after the revocation, and
guest links, whose every session fetches and verifies again (BEH-LD-068). The
package digests revoked by digest, statement digest or signer are computed in
the `RevokedDigests` view (BEH-LD-070), which the refusal list and the remote
boundary read; the kill switch's `filterDesired` and the gate compute their
answers from the same inputs and agree with it — agreement, not one
computation.

**Verification** *(Planned)*: acceptance checks 11, 13, 14 and 15 of
BEH-LD-048.

**Related**: [BEH-LD-027](behaviors/04-revocation-and-kill-switch.md), [BEH-LD-030](behaviors/04-revocation-and-kill-switch.md), [BEH-LD-034](behaviors/05-catalog-and-lazy-loading.md), [BEH-LD-068](behaviors/09-trust-class-and-guest-links.md), [BEH-LD-070](behaviors/09-trust-class-and-guest-links.md), [ADR-LD-004](decisions/004-revocation-acts-through-desired-state.md).

---

## INV-LD-005: The kill switch acts only through Host.reconcile and Host.remove

Every change the kill switch makes to a host's plugin set is a
`Host.reconcile` or `Host.remove` call, and is therefore gated, drained and
audited as core specifies. A revocation causes `Host.remove` calls only, never
a reconcile: they carry the configured revocation actor and a reason naming
the revocation revision, and its only actions are the removals of the dropped
entries — the plugins `Host.snapshot` reports owned by its scope
(`PluginSnapshot.scope`) whose digest the new set drops — so it removes
nothing that was not revoked and undoes no operator change, a plugin an
operator reinstalled by hand included. A catalog withdrawal is never acted on
under the revocation actor. A `Host.reconcile` call is caused by a
desired-list change only; it carries the application's actor and names no
revocation.

**Source**: `packages/loader/src/KillSwitch.ts` *(Planned)* — the module
depends on the public `Bridger.Host` service only.

**Implication**: a revocation is never a back door around the gate, the drain
rules or the audit latch, leaves the records an operator's removal leaves, and
is never credited with a change it did not cause.

**Verification** *(Planned)*: acceptance check 12 of BEH-LD-048 with core's
`TestHost`, `scriptedGate` and `memoryAuditSink`.

**Related**: [BEH-LD-029](behaviors/04-revocation-and-kill-switch.md), [BEH-LD-031](behaviors/04-revocation-and-kill-switch.md), [BEH-LD-032](behaviors/04-revocation-and-kill-switch.md), [BEH-LD-046](behaviors/06-limits-and-acceptance.md), [ADR-LD-004](decisions/004-revocation-acts-through-desired-state.md).

---

## INV-LD-006: No load without an explicit acceptance rule

A loader cannot be constructed without an acceptance rule that requires
either a pinned digest or a satisfied signature policy with a positive
threshold, and none of the package's exports is a rule that accepts
everything.

**Source**: `packages/loader/src/Policy.ts` *(Planned)* — construction-time
validation of the rule; the public rule constructors are `pinned`, `signed`
and `anyOf` only.

**Implication**: a deployment either requires signatures or pins digests, and
visibly does one or the other.

**Verification** *(Planned)*: acceptance check 9 of BEH-LD-048; an export
inventory test over `@bridger/loader` and `@bridger/loader/testing`.

**Related**: [BEH-LD-019](behaviors/03-signature-policy.md), [BEH-LD-022](behaviors/03-signature-policy.md), [BEH-LD-045](behaviors/06-limits-and-acceptance.md), [ADR-LD-003](decisions/003-n-of-m-signature-policy-with-no-default.md).

---

## INV-LD-007: A data pack is never evaluated

No byte of a data pack reaches an evaluator, a module loader, `eval`,
`Function`, `import()` or `require`, before or after verification, and no
data-pack digest enters `Loader.resident` or `AcceptedDigests`.

**Source**: `packages/loader/src/DataPack.ts` *(Planned)* — the data-pack
pipeline has no evaluator dependency; `VerifiedDataPack` is a distinct type
that `EvaluatorShape.evaluate` does not accept.

**Implication**: reference data is judged like code for provenance and
revocation, and is never run.

**Verification** *(Planned)*: acceptance check 23 of BEH-LD-064 with the
recording evaluator; a type-level test that a `VerifiedDataPack` cannot be
passed to the evaluator.

**Related**: [BEH-LD-057](behaviors/08-data-packs.md), [BEH-LD-058](behaviors/08-data-packs.md), [BEH-LD-059](behaviors/08-data-packs.md), [ADR-LD-007](decisions/007-data-packs-are-verified-never-evaluated.md).

---

## INV-LD-008: A signature counts only for the statement type it was made for

Every signature the loader counts was verified over a statement the loader
built, whose `statementType`, subject digest, id and version are those of the
call it counts for; a signature over a statement of another type counts for
nothing.

**Source**: `packages/loader/src/Verify.ts` *(Planned)* — `SignaturePolicy.verify`
is the only function that counts signatures, and it builds the statement
from its request.

**Implication**: a data publisher's, fleet operator's or licence signer's key
never counts towards a release policy, and no signature is replayed across
types.

**Verification** *(Planned)*: acceptance checks 17 and 18 of BEH-LD-064.

**Related**: [BEH-LD-049](behaviors/07-signed-statements.md), [BEH-LD-050](behaviors/07-signed-statements.md), [BEH-LD-051](behaviors/07-signed-statements.md), [BEH-LD-054](behaviors/07-signed-statements.md), [ADR-LD-006](decisions/006-one-verification-step-for-every-signed-statement.md).

---

## INV-LD-009: No package is evaluated in the host process without an accepted first-party statement

Every package the loader evaluates in the host's process — through `load` or
through the `load` of a definition built by `Loader.lazy` — had, at that load,
both its "package" statement and its "first-party" statement accepted by
`SignaturePolicy.verify` under the current rules and revocation set. A package
whose "first-party" statement is absent, unsatisfied or revoked is never
evaluated by the loader; it may only be fetched with `fetchVerified` and run
as a guest, outside the host's runtime.

**Source**: `packages/loader/src/Loader.ts` and `packages/loader/src/Trust.ts`
*(Planned)* — step 4 of the pipeline makes the two `verify` calls in order and
no path to the evaluator skips the second; `Loader.lazy` builds no definition
for a guest entry; `fetchVerified` has no evaluator.

**Implication**: in-process evaluation is always an explicit, signed and
revocable decision of the application's release authority, never a
consequence of a partner's package being listed in a catalog or accepted by
the "package" rule. It says nothing about what in-process code does once
evaluated ([BEH-LD-041](behaviors/06-limits-and-acceptance.md)).

**Verification** *(Planned)*: acceptance checks 25 and 27 of BEH-LD-071.

**Related**: [BEH-LD-009](behaviors/02-load-pipeline.md), [BEH-LD-065](behaviors/09-trust-class-and-guest-links.md), [BEH-LD-067](behaviors/09-trust-class-and-guest-links.md), [ADR-LD-005](decisions/005-in-process-loading-is-for-first-party-code.md), [ADR-LD-008](decisions/008-in-process-eligibility-is-a-signed-statement.md).
