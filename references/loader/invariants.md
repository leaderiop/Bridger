# Loader — Runtime Invariants

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-LD-INV                                               |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification (companion)                         |
> | Change History | 0.2 (2026-11-08): INV-LD-003 covers lazy definitions built with `Plugin.lazy`'s `digest` and proxies stamped by `stampRemote`; INV-LD-005 states the two actors of the kill switch (CCR-LD-002)<br>0.1 (2026-11-08): Initial draft (CCR-LD-001)                 |

---

Properties of `@bridger/loader` that hold for every execution. As in core's
[invariants](../core/invariants.md), each names the mechanism that is to
enforce it; every **Source** and **Verification** is *(Planned)*, and no
invariant here may be cited as evidence until a test that checks it has been
written and executed ([ADR-BR-035](../core/decisions/035-evidence-from-executed-tests.md)).

## INV-LD-001: No code is evaluated before its digest and signatures are accepted

No byte of a package reaches an evaluator, a module loader, `eval`,
`Function`, `import()` or `require` before the digest comparison, the
acceptance rule, the revocation check and the application's predicates have
all succeeded for that package.

**Source**: `packages/loader/src/Loader.ts` *(Planned)* — the pipeline is one
sequential `Effect.gen` whose evaluator call is reachable only after the
verified value is constructed; `VerifiedPackage` has no public constructor.

**Implication**: unapproved, altered or revoked code is never run by the
loader, even transiently; a refusal has no side effect beyond the loader's
record.

**Verification** *(Planned)*: acceptance check 2 of BEH-LD-048 with the
recording evaluator, each step failing in turn; a type-level test that
`EvaluatorShape.evaluate` accepts only `VerifiedPackage`.

**Related**: [BEH-LD-004](behaviors/01-package-and-digest.md), [BEH-LD-009](behaviors/02-load-pipeline.md), [BEH-LD-013](behaviors/02-load-pipeline.md), [BEH-LD-024](behaviors/03-signature-policy.md), [BEH-LD-037](behaviors/05-catalog-and-lazy-loading.md), [ADR-LD-001](decisions/001-verify-before-evaluate.md).

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
yet, including lazy plugins whose trigger fires after the revocation.

**Verification** *(Planned)*: acceptance checks 11, 13, 14 and 15 of
BEH-LD-048.

**Related**: [BEH-LD-027](behaviors/04-revocation-and-kill-switch.md), [BEH-LD-030](behaviors/04-revocation-and-kill-switch.md), [BEH-LD-034](behaviors/05-catalog-and-lazy-loading.md), [ADR-LD-004](decisions/004-revocation-acts-through-desired-state.md).

---

## INV-LD-005: The kill switch acts only through Host.reconcile and Host.remove

Every change the kill switch makes to a host's plugin set is a
`Host.reconcile` or `Host.remove` call, and is therefore gated, drained and
audited as core specifies. A call caused by a revocation carries the
configured revocation actor and a reason naming the revocation revision, and
issues removals only; a call caused by a desired-list change carries the
application's actor and names no revocation.

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
