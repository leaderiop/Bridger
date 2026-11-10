# 04 — Revocation and Kill Switch

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-LD-BEH-04                                            |
> | Revision       | 0.6                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification (companion)                         |
> | Change History | 0.6 (2026-11-10): round 2 follow-up: `RevocationStoreFailed` declared (BEH-LD-026) (CCR-LD-005)<br>0.5 (2026-11-08): Round-2 agent review (R3-01, R3-02, R3-03; offline review F3, F4, F29): `SignedRevocationList`, its canonical encoding and `issuer` defined here; lists verified under a separate revocation trust root with no revocation step, ending the cycle with `StatementVerifier`; a list may revoke its own signers for later lists; `RevocationSource.offer` replaces the constructor-time feed as the way other companions hand lists in; statement digests reach `filterDesired`; `Revoked.by` gains "statement-digest"; the kill switch's scope is exclusive of other actuators (CCR-LD-003)<br>0.4 (2026-11-08): Revocation digests match subject and statement digests of every statement type; revocation lists verified as "revocation-list" statements; the set backs core's `RefusalList` (round 2: recheck item 11; core alignment K4) (CCR-LD-003)<br>0.3 (2026-11-08): Signers revoked by identity; un-revocation and store rollback stated; `filterDesired` drops digests with no verification record when a signer is revoked; re-evaluation at acceptance time; the kill switch is the scope's one reconciler, with the application's actor for desired-list changes and the revocation actor for removals only; blast-radius guard (CCR-LD-002)<br>0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-LD-001)<br>0.1 (2026-11-08): Initial draft (CCR-LD-001)                 |

---

A signature, once given, cannot be taken back; a release found to be
defective must still be stopped. This file specifies revocation: a
`RevocationSource` delivers signed sets of revoked digests and signers; the
loader refuses to load anything revoked; and a kill switch feeds the
revocation set into the desired state, so that `reconcile` removes revoked
plugins through the host's ordinary, gated and audited path
([ADR-LD-004](../decisions/004-revocation-acts-through-desired-state.md),
core [ADR-BR-023](../../core/decisions/023-desired-state-reconcile.md)).
This file owns BEH-LD-025–032 and uses all eight.

> **What this package does not do — and who does**
>
> The kill switch removes plugins from the host. It does **not** remove
> their code from memory (core
> [BEH-BR-048](../../core/behaviors/06-removal.md#beh-br-048-removal-releases-behaviour-not-imported-code)),
> does **not** undo what they already did, and does **not** bypass the
> gate, the drain rules or the audit latch. A process that must be rid of
> revoked code is restarted by its operator; the loader says when that is
> needed (BEH-LD-031).

Planned source: `packages/loader/src/Revocation.ts`,
`packages/loader/src/KillSwitch.ts` *(Planned)*.

## BEH-LD-025: A revocation set names revoked digests and revoked signers

> **See:** [ADR-LD-004](../decisions/004-revocation-acts-through-desired-state.md)
> **Satisfies:** [URS-BR-016](../../core/urs.md#urs-br-016-drive-the-plugin-set-from-a-declarative-list)
> **Risk:** [RSK-BR-017](../../core/gxp/03-risk-assessment.md#rsk-br-017)

```ts
// illustrative — not type-checked
interface RevocationSet {
  readonly issuer: string                         // the issuing authority's name; the statement id (07, BEH-LD-049)
  readonly revision: number                       // positive integer, strictly increasing per issuer
  readonly issuedAt: string                       // ISO-8601 UTC, from the issuer
  readonly digests: ReadonlyMap<string, { readonly reason: string; readonly revokedAt: string }>
  readonly signers: ReadonlyMap<string, { readonly reason: string; readonly revokedAt: string }>  // TrustedSigner.identity (03, BEH-LD-019)
}
// The signed form: a SignedStatement (07, BEH-LD-049) of type "revocation-list".
interface SignedRevocationList extends SignedStatement {
  readonly statementType: "revocation-list"
  readonly id: string                             // = issuer
  readonly version: string                        // = revision, in decimal (07, BEH-LD-049)
  readonly payload: Uint8Array                    // RevocationSet.encode(set), exactly as signed
}
declare const RevocationSet: {
  // UTF-8 of the RFC 8785 (JCS) form of
  // { format: "bridger-revocation-set/v1", issuer, revision, issuedAt,
  //   digests: { [digest]: { reason, revokedAt } }, signers: { [identity]: { reason, revokedAt } } }
  readonly encode: (set: RevocationSet) => Uint8Array
  readonly decode: (payload: Uint8Array) => Effect.Effect<RevocationSet, RevocationListMalformed>
}
type RawRevocationFeed = Stream.Stream<SignedRevocationList>
type OfferOutcome =
  | { readonly _tag: "Accepted"; readonly revision: number }
  | { readonly _tag: "NotNewer"; readonly revision: number; readonly held: number }
  | { readonly _tag: "Rejected"; readonly reason: "signature" | "malformed" | "envelope-mismatch" | "wrong-issuer" | "no-trust-root"
      readonly cause?: SignatureRejected | RevocationListMalformed }
interface RevocationSourceShape {
  readonly current: Effect.Effect<RevocationSet, RevocationUnavailable>
  readonly changes: Stream.Stream<RevocationSet>  // each accepted set, latest wins
  // Hands one received list to the source, which verifies, orders and persists it (BEH-LD-026).
  // `from` names the channel for logs, e.g. "authority", "peer:<id>".
  readonly offer: (list: SignedRevocationList, from: string) => Effect.Effect<OfferOutcome, RevocationStoreFailed>
}
class RevocationSource extends Context.Service<RevocationSource, RevocationSourceShape>()("@bridger/loader/RevocationSource") {}
class RevocationListMalformed extends Schema.TaggedError<RevocationListMalformed>()("RevocationListMalformed", {
  message: Schema.String
}) {}
```

```
REQUIREMENT: `RevocationSet.encode` MUST produce exactly the bytes above;
             `decode` MUST refuse with `RevocationListMalformed` a payload
             that is not that JSON shape, whose `format` differs, whose
             `revision` is not a positive integer, or whose map keys repeat.
             The loader MUST keep and persist a list's payload as received
             and MUST NOT re-encode it to verify or to store it.
```

```
REQUIREMENT: The loader MUST require a `RevocationSource`. An application
             with no revocation channel MUST wire one explicitly (for
             example a constant empty set with a stated `maxAge` of
             "unbounded", BEH-LD-027), so that its absence is a visible
             decision.
```

```
REQUIREMENT: `changes` MUST be latest-wins: a subscriber that falls behind
             MUST see the newest set, never a stale one after a newer one.
```

```
REQUIREMENT: Revoked signers MUST be named by their `identity` (03,
             BEH-LD-019) — a key fingerprint or a Sigstore issuer and
             subject — never by a policy-local `TrustedSigner.id`, so that a
             list means the same to every consumer and renaming a signer in
             one configuration cannot un-revoke it.
```

A digest in `digests` is matched against the subject digest and the statement
digest of every signed statement, whatever its type — packages, data packs,
host manifests, licences ([07 — Signed Statements](./07-signed-statements.md),
BEH-LD-052).

Revocation by digest stops one release; revocation by signer stops every
release whose acceptance depended on a compromised key (BEH-LD-030). Both are
needed: a defect is a digest, a stolen key is a signer. The issuer of a list
does not know the ids each consumer gave its signers, which are unique only
within one policy; it does know the keys and identities, so lists name those.

## BEH-LD-026: Revocation sets are verified, monotonic and persisted by the application

> **See:** [ADR-LD-004](../decisions/004-revocation-acts-through-desired-state.md), [ADR-LD-003](../decisions/003-n-of-m-signature-policy-with-no-default.md)
> **Risk:** [RSK-BR-017](../../core/gxp/03-risk-assessment.md#rsk-br-017)

```ts
// illustrative — not type-checked
declare const RevocationSource: {
  // Verifies each offered list under the revocation trust root, refuses rollbacks, persists through the store.
  readonly verified: (options: {
    readonly issuer: string                        // the one issuer this source follows; configuration
    readonly trustRoot: AcceptanceRule             // the revocation trust root (03, BEH-LD-022); configuration,
                                                   // separate from StatementRules (07, BEH-LD-051)
    readonly verifiers: readonly SignatureVerifierShape[]
    readonly verifyTimeout: Duration.Input         // bounds steps 3–4, as 02, BEH-LD-013; no default
    readonly store: RevocationStore                // the application's persistence port
    readonly feeds?: readonly RawRevocationFeed[]  // optional: each element is offered as by `offer`, with from "feed:<index>"
  }) => Layer.Layer<RevocationSource, RevocationStoreFailed, Clock>
  // For an application with no revocation channel: a constant set; every offer is Rejected "no-trust-root".
  readonly constant: (set: RevocationSet) => Layer.Layer<RevocationSource>
}
interface RevocationStoreShape {
  readonly load: Effect.Effect<Option.Option<SignedRevocationList>, RevocationStoreFailed>
  readonly save: (list: SignedRevocationList) => Effect.Effect<void, RevocationStoreFailed>
}
class RevocationStoreFailed extends Schema.TaggedError<RevocationStoreFailed>()("RevocationStoreFailed", {
  operation: Schema.Literal("load", "save"),     // "load": cannot be read; "save": cannot be written
  message: Schema.String
}) {}
```

```
REQUIREMENT: The revocation source MUST accept a list only when all of the
             following hold, checked in this order before the payload is
             decoded: the envelope's `statementType` is "revocation-list"
             and its `id` is the configured `issuer` (otherwise "wrong-issuer"
             or "envelope-mismatch"); its signatures satisfy `trustRoot` over
             the statement of 07, BEH-LD-049 — subject `{ bytes: payload }`,
             id the issuer, version the revision as written in the envelope
             — run as steps 1–4 and 6 of `SignaturePolicy.verify` with no
             publisher and with no step 5 (07, BEH-LD-050). After
             acceptance the payload MUST be decoded, and a list whose decoded
             `issuer` or `revision` differs from the envelope's MUST be
             refused ("envelope-mismatch").
```

```
REQUIREMENT: The revocation source MUST NOT depend on `RevocationSource`,
             `StatementVerifier` or `StatementRules`, and no revocation set
             — the held one included — MUST be consulted for the list's
             digest or statement digest. The only state of the source that
             enters a list's verification is the set of signer identities
             revoked by the list it holds: a trust-root signer whose
             `identity` the held list revokes MUST NOT count towards
             `trustRoot` for any later list. A list MAY revoke one of the
             signers that signed it; it is itself judged with the signers
             as they stood before it, and the revocation takes effect from
             the next list on. A later list that omits that identity
             restores the signer for the lists after it, logged as an
             un-revocation (below).
```

```
REQUIREMENT: `offer` MUST be the one way a list enters the source: the
             `feeds` of `verified` and every other companion (the federation
             companion's kill frames, for example) go through it. It MUST
             answer `Accepted` only after the list is saved and published,
             `NotNewer` for a revision not greater than the held one,
             `Rejected` with its reason otherwise, and fail only when the
             store cannot be written. A refusal by the trust root, a
             verifier timeout or a verifier death MUST be `Rejected`
             ("signature"), never `Accepted`. Concurrent offers MUST be
             handled one at a time.
```

```
REQUIREMENT: A list whose revision is not greater than the last accepted
             revision MUST be ignored and reported. An accepted list MUST be
             saved through the store before it is published on `changes`;
             a list that cannot be saved MUST NOT be published.
```

```
REQUIREMENT: Monotonicity applies to `revision` only. A list with a greater
             revision MAY omit a digest or signer an earlier list revoked
             (un-revocation); the loader MUST log each omitted entry at
             warning level with both revisions, and the kill switch MUST
             report it in `status.unrevoked` (BEH-LD-029). Un-revocation
             MUST NOT install or enable anything by itself; a digest becomes
             usable again only through the ordinary path (a load, a gated
             install).
```

```
REQUIREMENT: At construction, the last saved list MUST be loaded and
             re-verified before any package is loaded, so that a restart
             without network keeps every revocation it had. Because the
             lists before it are not kept, it MUST be re-verified against
             `trustRoot` with no signer removed. A saved list that fails
             re-verification, or a store that cannot be read, MUST leave the
             source with no current set (`current` fails with
             `RevocationUnavailable`) and MUST be logged at error level; the
             layer MUST fail to build only when the store cannot be read.
```

```
REQUIREMENT: Documentation MUST state that a list which revokes enough
             trust-root signers to leave `trustRoot` unsatisfiable leaves
             the source unable to accept any later list, and that the remedy
             is a new trust root given as configuration (03, BEH-LD-023);
             and MUST recommend a threshold trust root (more than one
             signer, BEH-LD-032) so that one compromised key can neither
             issue nor block lists alone.
```

A kill switch that a man-in-the-middle can switch off by replaying an older
list is not a kill switch; a monotonic revision refuses the replay. Saving
before publishing means a restart never forgets a revocation it already
acted on — provided the store itself cannot be rolled back: a store restored
from an older backup hands the loader an older list it has no way to tell
from the newest. Protecting the store against rollback (write-once storage,
a revision kept elsewhere) is the consumer's control. Where the store keeps
the list, and for how long, is the application's. Un-revocation is allowed
because a revocation issued in error must be correctable by the same signed
channel; it is logged rather than silent because it widens what may run.

A revocation list is checked against its own trust root, never against a
revocation set, because the set is what the list establishes: at first boot
there is none, and a list judged by the set it replaces would let an old set
veto its own successor. Keeping the trust root out of `StatementRules` keeps
the two configurations — who may sign code, who may withdraw it — apart, and
keeps the source free of any dependency on the `StatementVerifier`, which
itself needs the source. The one piece of state the source does use, the
signer revocations of the list it holds, is what lets a deployment retire a
stolen revocation key by the same signed channel. `offer` replaces a
constructor-time feed so that a companion which itself depends on the
revocation source, such as the federation plugin relaying kill frames, can
hand lists in without a dependency cycle.

## BEH-LD-027: A load checks revocation, and a stale set refuses the load

> **Invariant:** [INV-LD-004](../invariants.md#inv-ld-004-a-revoked-digest-is-never-newly-loaded)
> **See:** [ADR-LD-004](../decisions/004-revocation-acts-through-desired-state.md)
> **Risk:** [RSK-BR-017](../../core/gxp/03-risk-assessment.md#rsk-br-017)

```ts
// illustrative — not type-checked
interface LoaderOptions {
  // ...
  readonly revocation: { readonly maxAge: Duration.Input | "unbounded" }   // no default
}
class Revoked extends Schema.TaggedError<Revoked>()("Revoked", {
  digest: Schema.String, reason: Schema.String, by: Schema.Literal("digest", "statement-digest", "signer"), revision: Schema.Number
}) {}
class RevocationStale extends Schema.TaggedError<RevocationStale>()("RevocationStale", {
  revision: Schema.Number, issuedAt: Schema.String, maxAge: Schema.String
}) {}
```

```
REQUIREMENT: Step 5 of the pipeline (02, BEH-LD-009) MUST read the current
             set and MUST fail with `Revoked` when the package digest or
             the package statement's digest (07, BEH-LD-052) is listed, or
             when the policy is no longer satisfied once revoked
             signers are removed from the verified signers (BEH-LD-030).
```

```
REQUIREMENT: When the current set's `issuedAt` is older than `maxAge` by
             the time read from `Clock`, the load MUST fail with
             `RevocationStale`. `maxAge` MUST be stated explicitly; the
             value "unbounded" MUST be accepted only when written as such.
```

```
REQUIREMENT: When the source cannot answer, the load MUST fail with
             `RevocationUnavailable`. The loader MUST NOT treat an
             unanswered revocation check as "not revoked".
```

`maxAge` is the honest form of the offline question: how long may a device
go without hearing about revocations and still load new code? Bridger cannot
answer it for an application, so the application must write its answer down.
`maxAge` governs new loads only; plugins already running are not stopped
because a list is old — stopping is the kill switch's job, on a revocation
actually received.

## BEH-LD-028: Revocation filters the desired list, as a pure function

> **See:** [ADR-LD-004](../decisions/004-revocation-acts-through-desired-state.md), [ADR-BR-023](../../core/decisions/023-desired-state-reconcile.md)
> **Satisfies:** [URS-BR-016](../../core/urs.md#urs-br-016-drive-the-plugin-set-from-a-declarative-list)
> **Risk:** [RSK-BR-017](../../core/gxp/03-risk-assessment.md#rsk-br-017)

```ts
// illustrative — not type-checked
declare const Revocation: {
  readonly filterDesired: (
    desired: readonly DesiredPlugin[],
    set: RevocationSet,
    options: {
      readonly verification: (digest: string) => Option.Option<VerificationRecord>   // AcceptedDigests.lookup (02, BEH-LD-015)
      readonly pinned: readonly string[]          // the digests the acceptance rule pins (03, BEH-LD-022); may be empty
    }
  ) => { readonly kept: readonly DesiredPlugin[]; readonly dropped: readonly { readonly id: string; readonly realm?: string; readonly digest?: string; readonly reason: string }[] }
}
```

```
REQUIREMENT: `filterDesired` MUST drop every entry whose definition's
             `meta.digest` — for a lazy definition, its `meta.digest` taken
             from `Plugin.lazy`'s `digest` option (core BEH-BR-244; 05,
             BEH-LD-037) — is revoked by digest, by the `statementDigest` of
             the record `verification` returns for it (07, BEH-LD-052), or
             by signer (BEH-LD-030), and MUST keep every other entry
             unchanged and in order.
```

```
REQUIREMENT: When `set` revokes at least one signer and `verification`
             returns `None` for an entry's digest — a desired list from
             configuration or federation, a host restarted before the
             catalog was verified again — `filterDesired` MUST drop the entry
             with reason "verification-unknown", unless the digest is in
             `pinned` (a pinned acceptance depends on no signer). It MUST NOT
             keep an entry whose dependence on a revoked signer it cannot
             rule out.
```

```
REQUIREMENT: An entry whose definition carries no `meta.digest` MUST be
             dropped with reason "digest-absent" when the loader is the
             source of the desired list. An application that mixes in
             definitions not produced by the loader MUST filter them itself.
```

```
REQUIREMENT: `filterDesired` MUST be pure and total: no effects, the same
             result for the same input.
```

Dropping an entry whose verification record is missing fails closed: the
alternative — keeping it because nothing proves it depended on the revoked
key — is the reading under which a stolen key keeps working on every host that
lost its records. The cost is availability: such entries come back once a
load or catalog verification has recorded them again.

Revocation changes what is wanted; `reconcile` changes what is. Expressing the
kill switch as a filter on the desired list means it inherits everything core
already specifies for `reconcile`: per-entry gating, per-entry audit records,
ownership scopes, and idempotence ([BEH-BR-159](../../core/behaviors/18-reconciliation-and-confluence.md#beh-br-159-reconcile-is-idempotent-and-convergent)).

## BEH-LD-029: The kill switch is the scope's one reconciler, and attributes each change to its cause

> **Invariant:** [INV-LD-005](../invariants.md#inv-ld-005-the-kill-switch-acts-only-through-hostreconcile-and-hostremove)
> **See:** [ADR-LD-004](../decisions/004-revocation-acts-through-desired-state.md), [ADR-BR-029](../../core/decisions/029-attributable-mutations.md)
> **Satisfies:** [URS-BR-016](../../core/urs.md#urs-br-016-drive-the-plugin-set-from-a-declarative-list), [URS-BR-021](../../core/urs.md#urs-br-021-know-who-changed-the-plugin-set-when-and-why)
> **Risk:** [RSK-BR-017](../../core/gxp/03-risk-assessment.md#rsk-br-017), [RSK-BR-044](../../core/gxp/03-risk-assessment.md#rsk-br-044), [RSK-BR-005](../../core/gxp/03-risk-assessment.md#rsk-br-005)

```ts
// illustrative — not type-checked
declare const KillSwitch: {
  readonly run: (options: {
    readonly desired: Stream.Stream<readonly DesiredPlugin[]>     // the application's desired list, latest wins
    readonly scope: string                                        // the reconcile ownership scope (18, BEH-BR-155)
    readonly actor: Actor                                         // the application's actor for desired-list changes
    readonly revocationActor: Actor                               // kind "service"; never an id beginning "bridger:"
    readonly outsideScope?: "report" | "remove"                   // default "report" (BEH-LD-031)
    readonly maxDroppedPerRevision?: number                       // blast-radius guard (BEH-LD-032); no default
    readonly retryInterval: Duration.Input                        // no default
  }) => Effect.Effect<never, never, Bridger.Host | RevocationSource | AcceptedDigests | Loader | Scope.Scope>
  readonly status: Stream.Stream<KillSwitchStatus>
  // Lets a revision held by the blast-radius guard proceed (BEH-LD-032).
  readonly release: (revision: number) => Effect.Effect<void>
}
interface KillSwitchStatus {
  readonly revision: number
  readonly removed: readonly string[]                              // "<realm>/<id>@<digest>"
  readonly pending: readonly { readonly target: string; readonly reason: string }[]   // refused, parked, drain timeout, latch, held
  readonly held?: { readonly revision: number; readonly dropped: number }             // BEH-LD-032
  readonly unrevoked: readonly string[]                            // digests and signer identities omitted by a newer list (BEH-LD-026)
  readonly residentRevoked: readonly string[]                      // BEH-LD-031
}
```

```
REQUIREMENT: `KillSwitch.run` MUST be the only caller of `Host.reconcile`
             for its `scope`. Documentation MUST state that the application
             MUST NOT reconcile the same scope elsewhere: it hands its
             desired list to the kill switch instead, and the kill switch
             applies `filterDesired` (BEH-LD-028) to every list it applies.
```

```
REQUIREMENT: Documentation MUST state that `KillSwitch.run` MUST NOT be
             given a scope in which another component reconciles, removes or
             disables plugins in response to revocation — for example the
             scope of a federation companion, which acts on revocations
             itself (federation BEH-FD-042) — and that a component acting on
             revocations outside the kill switch does not get the
             blast-radius guard of BEH-LD-032 unless it implements that
             guard itself.
```

```
REQUIREMENT: When the revocation set changes and `filterDesired` drops
             entries that the last applied list kept, `KillSwitch.run` MUST
             call `Host.reconcile` with the last applied list minus those
             entries, the given `scope`, and an `OperationContext` whose
             `actor` is `revocationActor` and whose `reason` names the
             revocation revision and the dropped digests — so that its only
             actions are the prune removals of the dropped entries. A
             revocation change that drops nothing new MUST NOT call
             `reconcile`.
```

```
REQUIREMENT: When the desired list changes, `KillSwitch.run` MUST call
             `Host.reconcile` with the `filterDesired` result under
             `actor`, with a reason supplied by the application's stream
             element or, absent one, "desired-list-change". It MUST NOT use
             `revocationActor` or name a revocation revision for these
             changes. When both change together, the revocation reconcile
             MUST run first.
```

```
REQUIREMENT: A reconcile entry that does not complete — refused by the gate,
             failed with `DrainTimeout`, parked, refused by the audit latch —
             MUST appear in `status.pending` with its error tag, and MUST be
             retried at the next change or after `retryInterval`, under the
             actor of the change that caused it. The kill switch MUST NOT
             retry faster than that interval.
```

```
REQUIREMENT: The kill switch MUST run as supervised background work of the
             plugin that provides it (core
             [BEH-BR-090](../../core/behaviors/10-runtime-failure-and-health.md#beh-br-090-supervised-background-work-and-its-failure-policy)),
             with the `fail-plugin` policy, so that a kill switch that stops
             working is a visible plugin failure, not a silent one.
```

The kill switch has an actor because it is an operator in every sense core
cares about: it changes the plugin set, so the change must say who made it
and why. A service actor named by the application ("release-revocation", for
example) makes each removal readable in the trail: which revocation revision
removed which digest. It cannot use `Actor.system`, which core reserves for
records the host originates (core
[BEH-BR-185](../../core/behaviors/22-attributable-operations.md#beh-br-185-actor-and-operationcontext)).

Two actors keep the trail truthful. An install or replace that follows a
catalog update was not caused by a revocation, and recording it under the
revocation actor, with a reason naming a revocation revision, would misstate
who changed the plugin set and why (21 CFR 11.10(e)) — and would let a gate
that trusts the revocation actor approve installs it was never meant to see.
Building the revocation reconcile from the last applied list, rather than the
newest desired list, keeps a revocation from carrying along changes nobody
has reviewed. One reconciler per scope keeps two callers from undoing each
other's lists, which core's ownership rule would otherwise turn into a
`reconcile` that prunes what the other just installed.

## BEH-LD-030: Revoking a signer withdraws exactly the packages that depended on it

> **See:** [ADR-LD-003](../decisions/003-n-of-m-signature-policy-with-no-default.md), [ADR-LD-004](../decisions/004-revocation-acts-through-desired-state.md)
> **Risk:** [RSK-BR-017](../../core/gxp/03-risk-assessment.md#rsk-br-017)

```
REQUIREMENT: When a set revokes a signer, the loader MUST re-evaluate the
             policy (03, BEH-LD-020) for every digest in `AcceptedDigests`
             (02, BEH-LD-015) whose record shows `acceptedBy: "signed"`,
             using the recorded verified signers minus every signer whose
             `identity` the set revokes, with validity windows checked at
             the time recorded at acceptance (03, BEH-LD-019), and MUST
             treat as revoked, with `by: "signer"`, each digest whose policy
             is then unsatisfied.
```

```
REQUIREMENT: Re-evaluation MUST remove only revoked signers. It MUST NOT
             read `Clock`: a signer whose `validUntil` passes after a
             package was accepted MUST NOT make that package count as
             revoked.
```

```
REQUIREMENT: A digest that still satisfies the policy without the revoked
             signer — because enough other signers signed it — MUST NOT be
             treated as revoked.
```

This is why the verification record keeps every verified signer
(BEH-LD-020): a release signed by three of a two-of-three policy survives the
loss of one key; a release signed by exactly two does not. Re-evaluation needs
no network and no signatures, only the record. Re-evaluating at the time of
acceptance matters as much: a routine key expiry is not a revocation, and a
re-evaluation against the current time would turn every expiry into a mass
removal. A digest with no record is handled by BEH-LD-028.

## BEH-LD-031: What the kill switch cannot reach is reported

> **See:** [ADR-LD-005](../decisions/005-in-process-loading-is-for-first-party-code.md), [ADR-BR-027](../../core/decisions/027-core-exclusions.md)
> **Satisfies:** [URS-BR-026](../../core/urs.md#urs-br-026-know-which-compliance-obligations-remain-mine)
> **Risk:** [RSK-BR-017](../../core/gxp/03-risk-assessment.md#rsk-br-017)

```
REQUIREMENT: The kill switch MUST read `Host.snapshot` after each
             revocation reconcile and report, in `status.pending`, every
             installed plugin whose `meta.digest` is revoked but which is not
             an entry of the list the kill switch last applied (so not owned
             by its scope). With `outsideScope: "remove"`, it MUST call
             `Host.remove` for each, with `revocationActor` and a reason
             naming the revocation; with "report" (the default), it MUST
             change nothing.
```

```
REQUIREMENT: `status.residentRevoked` MUST list every revoked digest that is
             resident in this process (02, BEH-LD-012), whether or not its
             plugin is still installed. Documentation MUST state that the
             code of these digests stays in memory until the process
             restarts.
```

Two things are beyond a reconcile scope: plugins installed by someone else,
and code already evaluated. The first may belong to another owner whose
decision the kill switch should not override silently, hence "report" by
default. The second cannot be reached at all from inside the process; a
revoked module whose plugin is removed holds no host resources, but its code —
and anything it scheduled outside the plugin's scope — remains until restart.

## BEH-LD-032: The kill switch never bypasses the host

> **Invariant:** [INV-LD-005](../invariants.md#inv-ld-005-the-kill-switch-acts-only-through-hostreconcile-and-hostremove)
> **See:** [ADR-LD-004](../decisions/004-revocation-acts-through-desired-state.md), [ADR-BR-032](../../core/decisions/032-operation-gate.md)
> **Satisfies:** [URS-BR-024](../../core/urs.md#urs-br-024-require-approval-before-a-regulated-change)
> **Risk:** [RSK-BR-014](../../core/gxp/03-risk-assessment.md#rsk-br-014), [RSK-BR-017](../../core/gxp/03-risk-assessment.md#rsk-br-017)

```
REQUIREMENT: The kill switch MUST change the plugin set only through
             `Host.reconcile` and `Host.remove`. It MUST NOT use a core
             internal, a privileged option, `force` drain options it was not
             configured with, or a second host.
```

```
REQUIREMENT: Documentation MUST state that a wired gate is consulted for
             every removal the kill switch requests, and that an application
             which wants revocations to proceed without a human approval
             must make its gate allow them — for example by allowing
             `remove` requests from `revocationActor`, and nothing else from
             that actor — rather than expect the kill switch to step around
             the gate.
```

```
REQUIREMENT: When `maxDroppedPerRevision` is given and one revision would
             drop more entries than it allows, the kill switch MUST NOT call
             `reconcile` for that revision; it MUST report every such entry
             in `status.pending` with reason "blast-radius" and the revision
             in `status.held`, and MUST act on it only after
             `KillSwitch.release(revision)`. Documentation MUST recommend a
             threshold signature policy for revocation lists (more than one
             signer, BEH-LD-026) together with this guard, because a single
             compromised revocation key combined with an auto-allowing gate
             can otherwise remove every plugin of a scope.
```

A kill switch with a back door would be the most powerful path in the system
and the least reviewed one. The revocation channel is itself a control
whose compromise has a large blast radius: it can remove plugins, though never
install them. A threshold on the lists' signatures and a cap per revision,
above which a person releases the revision, bound that radius; whoever calls
`release` does so through the application's own access rules, and the
removals that follow are still gated and audited. Going through the host means a revocation leaves
exactly the records an operator's removal leaves, waits for in-flight calls
like any removal (so a revoked plugin is not cut off in the middle of a write),
and stops when the audit trail cannot record it. An application may choose a
drain limit and `force` for revocations; the choice is configuration, visible
in review.

**Settled here.** (1) Revocation is a signed, monotonic list kept by the
application's store across restarts; signers are revoked by identity;
un-revocation is allowed by a newer list and is logged. Lists are verified
under a separate revocation trust root with no revocation step, enter only
through `offer`, and may revoke their own signers for later lists. (2) `maxAge` has no
default. (3) The kill switch is the one reconciler of its scope: desired-list
changes are reconciled under the application's actor, and revocation removals
under the revocation actor with a reason naming the revision, gated and
audited like any operator change. (4) A digest whose dependence on a revoked
signer cannot be ruled out is dropped ("verification-unknown"). (5)
Re-evaluation uses the acceptance time and removes only revoked signers. (6)
Plugins outside the scope are reported by default, not removed. (7) Resident
revoked code is reported; a restart is the only remedy.

**Open.** (1) Whether the kill switch should offer `disable` instead of
removal for plugins whose data must stay readable (needs [core 27](../../core/behaviors/27-manifest-and-lazy-activation.md)'s manifest,
BEH-BR-241, to say so). (2) Whether the blast-radius guard of BEH-LD-032
should be offered as a standalone helper, so that a companion that acts on
revocations in its own scope (the federation companion's immediate `disable`)
can apply the same cap and `release` rather than restate them.

**Round 2, agent review.** A federation of hosts carries revocation lists on
their own channel: the federation plugin hands each list it receives to
`RevocationSource.offer`, and reads the outcome; the source alone verifies,
orders and persists lists (BEH-LD-026). Revocation lists are verified under the
source's own trust root, with no revocation step, so neither first boot nor the
`StatementVerifier` depends on a set that does not exist yet.

**Round 2.** The revocation set also backs core's `RefusalList`, so a revoked
digest that would start again — a dependency's return, a lazy trigger, a
background restart — becomes `disabled` with reason "refused-digest" instead
(07, BEH-LD-056; core BEH-BR-267). The kill switch remains what stops an
`active` plugin.

---

_Previous: [03 — Signature Policy](./03-signature-policy.md)_ · _Next: [05 — Catalog and Lazy Loading](./05-catalog-and-lazy-loading.md)_
