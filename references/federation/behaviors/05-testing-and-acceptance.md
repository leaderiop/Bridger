# 05 — Testing and acceptance

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-FD-BEH-05                                            |
> | Revision       | 0.6                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.6 (2026-11-09): Check 44: identity disclosure on imports; check 45: local contracts refused at the plugin's build (core CCR-BR-033); introduction names check 45 (independent review) (CCR-FD-004)<br>0.5 (2026-11-08): Round-2 agent review (R3-01; R4 F1–F5, F7–F11, F15, F21, F22, F24) — checks 16, 32–38 restated; checks 40–43 added (CCR-FD-003)<br>0.4 (2026-11-08): round 2: recheck items 18, 19, 20 and 22, CORE-DECISIONS-2 — checks 32–39 (CCR-FD-003)<br>0.3 (2026-11-08): resolutions of the agent review of 2026-11-08 — checks 16 and 18–23 aligned with links over the remote multiplexer, single-major imports and per-link fences; checks 25–31 added (R3-01, R3-02, R3-18, R3-19, R3-20, R3-21, R3-25, R3-26) (CCR-FD-002)<br>0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-FD-001)<br>0.1 (2026-11-08): Initial draft (CCR-FD-001)                 |

---

Distributed behaviour is only worth specifying if it can be tested without
real networks and real clocks. This file specifies the federation test
harness and the acceptance checks a conforming implementation must pass.
This file owns BEH-FD-033–040 and uses BEH-FD-033–034; BEH-FD-035–040 are
reserved. Checks 32–43 cover [06 — Kill path, placement and skew](./06-kill-path-placement-and-skew.md);
check 44 covers identity disclosure on imports (03, 04), and check 45 the
refusal of local contracts (02, BEH-FD-009).

Planned source: `packages/federation/src/testing/TestFederation.ts`;
planned tests: `packages/federation/test/acceptance/*.test.ts` *(Planned)*.

## BEH-FD-033: TestFederation runs several hosts deterministically

> **See:** [ADR-BR-026](../../core/decisions/026-deterministic-test-host.md)
> **Depends on:** core [21 — Testing host](../../core/behaviors/21-testing-host.md); remote companion `TestTransport` (drop, delay, partition) ([references/remote/](../../remote/README.md))
> **Satisfies:** [URS-BR-019](../../core/urs.md#urs-br-019-test-plugin-lifecycles-deterministically-with-injected-faults)

```ts
// illustrative — not type-checked
interface TestFederation {
  readonly authority: {
    readonly issue: (host: string, manifest: Omit<HostManifest, "format" | "authority" | "host" | "revision"> &
                     { readonly revision?: number }) => Effect.Effect<SignedManifest>
    readonly equivocate: (host: string, revision: number, manifest: unknown) => Effect.Effect<SignedManifest>
    readonly requireResync: (host: string) => Effect.Effect<void>
    readonly down: Effect.Effect<void>
    readonly up: Effect.Effect<void>
  }
  readonly host: (id: string, options?: Partial<FederationOptions>) => Effect.Effect<TestHost, never, Scope.Scope>
  readonly restart: (host: string) => Effect.Effect<void>             // new process, same ManifestStore
  readonly partition: (a: string, b: string) => Effect.Effect<void>
  readonly heal: (a: string, b: string) => Effect.Effect<void>
  readonly tamperStore: (host: string) => Effect.Effect<void>
  readonly eraseStore: (host: string) => Effect.Effect<void>
}
```

```
REQUIREMENT: `TestFederation` MUST run every host as a core `TestHost` in one
             process, share one `TestClock` and a seeded `Random`, connect
             links with the remote companion's `TestTransport` (as the
             physical connection under its multiplexer), and provide
             an in-memory `ManifestStore`, an authority fixture with a test
             `SignaturePolicy` and test keys, and an in-memory resolver.
```

```
REQUIREMENT: The test keys and test `SignaturePolicy` MUST be exported only
             from the testing entry point and MUST refuse to verify any
             signature not made by the fixture.
```

A test signing key that a production build could pick up would be a
permissive policy by another name; keeping it out of the main entry point
is how that is prevented.

## BEH-FD-034: Required acceptance checks

> **See:** [ADR-FD-001](../decisions/001-federation-is-a-companion-over-reconcile.md), [ADR-FD-006](../decisions/006-n-minus-one-skew-window.md)
> **Satisfies:** [URS-BR-019](../../core/urs.md#urs-br-019-test-plugin-lifecycles-deterministically-with-injected-faults), [URS-BR-016](../../core/urs.md#urs-br-016-drive-the-plugin-set-from-a-declarative-list)

```
REQUIREMENT: An implementation MUST pass the checks below under
             `TestFederation` before any behaviour of this companion is
             described as implemented. Each check is a planned scenario
             REQ-FD-NNN, numbered as listed (traceability.md §4).
```

1. A manifest whose signature the policy refuses is neither stored nor applied; the store's highest revision is unchanged (BEH-FD-002).
2. A stored manifest edited locally fails re-verification at boot, is reported `store-invalid`, and the boot bundle (or nothing) is applied (BEH-FD-002, BEH-FD-010).
3. A manifest for another host or authority is refused after verification (BEH-FD-003).
4. Revisions: higher accepted and stored before apply; equal and identical is a no-op; equal and different raises `manifest-equivocation` and changes nothing; lower is refused (BEH-FD-004).
5. A crash injected between storing the highest revision and the end of `reconcile` re-applies that revision at boot, and a plugin it killed does not come back (BEH-FD-004, BEH-FD-010).
6. A resolver failure drops the entry without pruning an installed plugin; a digest mismatch drops it with "digest-mismatch" (BEH-FD-005).
7. A re-applied identical manifest leaves every entry `unchanged` and restarts nothing (BEH-FD-005, INV-BR-021).
8. Local patches change only overridable fields; a patch cannot add an entry or revive a killed one (BEH-FD-006, BEH-FD-007).
9. A kill entry by digest and by id removes the owned plugin through core `remove` (leases drain first), and reports an unowned match without acting (BEH-FD-007).
10. Each apply produces one reconcile with the federation actor, a reason naming the revision, and per-entry gate requests; a gate refusal lands in the status without blocking the record of the applied revision (BEH-FD-008).
11. A manifest listing the federation plugin or one of its providers drops that entry as "self-reference" and applies the rest (BEH-FD-008).
12. Activation with the authority down completes with no network call in the build, and the host runs the stored manifest (BEH-FD-009, BEH-FD-010).
13. Repeated `ManifestUnavailable` backs off with seeded jitter up to ten intervals and resets on success (BEH-FD-011).
14. Passing `validUntil` disables exactly the `requiresFresh` entries and nothing else; a newer manifest restores them (BEH-FD-012).
15. Exceeding `maxOffline` reports `offline-capped` once; the next contact requires re-bootstrap before applying a newer manifest (BEH-FD-013, BEH-FD-014).
16. `ResyncRequired` settles the outbox with links up, then suspends every link (import dependents wait, served calls stop, no host operation is made, control endpoints stay open for kill frames), fetches and installs through the settlement, applies the latest manifest and resumes links with a new offer exchange, in that order; a failing install keeps links suspended and retries from step 1 on the re-bootstrap's own backoff, not at every sync (BEH-FD-014).
17. A clock set back before `issuedAt − skewTolerance` makes the manifest stale and reports `clock-skew` (BEH-FD-016).
18. Protocol handshake over every pair of ranges and windows in a generated set: both ends compute the same agreed version, the highest in the interval of BEH-FD-019, also when their windows differ; N against N−2 yields `IncompatiblePeer` on both ends and no remote session starts (BEH-FD-019).
19. An import whose peer exports its major only at a lower minor, or not at all, is refused alone (proxy provides nothing, dependents waiting, `IncompatibleContract` listed); the other imports work; an import of each of two majors runs as two proxies side by side (BEH-FD-020).
20. A partition makes import dependents wait, not fail; healing opens a new link, repeats the offer exchange, every remote session over it has a new epoch, and a reply of an old epoch is refused (BEH-FD-021).
21. Two peers exporting one key are imported into their own peer realms without `DuplicateProvider` (BEH-FD-022, BEH-FD-026).
22. An export restricted to some methods refuses the others with "method-not-served" before any local lease is taken; an export whose provider is not active is offered unavailable and refused "unavailable" without starting it; each served call holds one core lease, so a local `remove` drains it; a withdrawn export is refused before the reconcile of its apply (BEH-FD-025, BEH-FD-031).
23. Split-brain: after the authority moves a fence, a partitioned old owner that reconnects is refused with `StaleExport` on offer; when an importer learns a higher token, it closes the old owner's endpoint before recording the token and no later reply from it is delivered; equal tokens from two owners raise `ExportConflict` and both imports wait until a higher token arrives (BEH-FD-028, BEH-FD-029, BEH-FD-031).
24. N−1 replay: the acceptance suite of the remote companion and checks 18–23 pass with one host at release N and the other at release N−1 of this package (BEH-FD-019, BEH-FD-020).
25. An incoming link whose offer names a host that is not a listed peer, or one no export is made to, is refused with `IncompatiblePeer { reason: "not-a-peer" }` and closed before any remote session starts on an "import:" endpoint (BEH-FD-017).
26. A served call runs as the peer's service actor with a provenance entry naming the peer and the asserted actor; the asserted actor is never the actor of a mutating host call it reaches; no `TokenAuthority` is needed by either host (BEH-FD-023).
27. A second manifest that adds an import from an already-imported peer defines a new peer realm for it; removing an import retires its realm once empty; a changed `ManifestRealm` is reported `realm-changed` and not redefined (BEH-FD-022, BEH-FD-024).
28. An entry rejected with `Conflict`, `DrainTimeout` or a "gate-timeout" `OperationRejected` is listed as pending and applied at a later sync without a new revision; a kill whose removal was refused transiently is reported `kill-pending` until the plugin is gone; a gate refusal on its merits is not retried (BEH-FD-007, BEH-FD-008).
29. A host that never reaches the authority and is restarted becomes `offline-capped` `maxOffline` after its first activation, not after the restart (BEH-FD-013).
30. After a restart with the resolver offline and its local storage empty, owned entries are dropped and reported, not run; with the digests stored locally they are applied (BEH-FD-005).
31. An import's endpoint transport fails `open` until the link is up and the import accepted; a new offer that withdraws the export closes that endpoint and the proxy provides nothing (BEH-FD-026).
32. A revocation list arriving in a `kill` frame while the host is `offline-capped`, `rebootstrap-blocked`, `resync-required` or suspended for a re-bootstrap is handed to `RevocationSource.offer` unchanged (never to `SignaturePolicy.verify`), and on `Accepted` leads to a `disable` of each owned plugin it revokes by digest, attributed to the revocation actor, with no sync, manifest or re-bootstrap; with a scripted `RefusalList` the plugin stays `disabled` through a later apply and an operator `enable` (BEH-FD-041, BEH-FD-042).
33. A kill frame whose list `offer` answers `NotNewer` is reported `RevocationListStale` and not relayed; one answered `Rejected` is reported `revocation-rejected` and not relayed; a kill frame is accepted on a link then refused as `incompatible`; `Federation.plugin` without `revocation` fails to build (BEH-FD-041, BEH-FD-043).
34. A newer manifest received while a re-bootstrap is pending runs a kill-only apply that removes only the entries its kill entries match and leaves the last applied revision unchanged; after a stale→fresh transition, a transient retry and a restart, the killed plugin stays absent, and the restart applies the last applied manifest, not the newer one (BEH-FD-042, BEH-FD-048).
35. A hub that accepts a newer list relays it once on every other up or suspended link and sends it before its offer on every new link; a terminal linked only to the hub receives it before any offer or manifest, also when it then refuses the link (BEH-FD-043).
36. Re-bootstrap runs outbox settle, link suspension, snapshot fetch, install through `OutboxSettlement.install`, manifest apply and link resume in that order; a blocked or timed-out settle stops before fetch with no link suspended, reports `rebootstrap-blocked` and drops no fact; a `Rebootstrap` without an outbox port is blocked unless `RebootstrapOutbox.none` is wired; an installed revision that differs from the applied one is reported `rebootstrap-revision-mismatch` and not re-installed (BEH-FD-014, BEH-FD-044).
37. An import whose `residency` the route to its peer does not offer is refused "placement-refused" and its dependents wait; an export is left out of that peer's offer and its calls are refused; import proxies carry the label as an annotation; with only `ManifestPeer.residency` set, an accepted import's endpoint carries those labels and its proxy builds (BEH-FD-045).
38. The skew table's rule: on every axis a host at N reads N−1; a link axis refuses a version it cannot read, the event axis reads older versions down to `minVersion` and parks or halts one it cannot read, never drops it; a writer switched by a manifest `publishVersion` change only after "reader" reports from every host in scope show N, with an offline-capped host excludable; `oldestVersions` appears in the status and reaches the `StatusReporter` without payloads (BEH-FD-046, BEH-FD-047).
39. `mandatoryInterceptions` and `allowChildren` of a manifest entry reach the gate's request; a `PolicyMismatch` is listed in `rejected` and not retried; with `atomic` set, a `PartialApply` is reported `apply-partial` and the revision converges at the next sync (BEH-FD-005, BEH-FD-008).
40. A manifest envelope is verified with exactly the loader's call (`subject: { bytes }`, `id` the JCS of [authority, host], `version` the decimal revision); an envelope of another `statementType`, or one whose `id` or `version` differs from the decoded manifest, is refused; every desired list passes `Revocation.filterDesired` (BEH-FD-002, BEH-FD-007).
41. With `maxDisabledPerRevision` set, a set that would disable more owned plugins than allowed disables none, reports each `kill-held`, keeps them in the next apply, and acts after an attributed `releaseRevocation`; a set matching a plugin outside the scope reports `kill-unowned` and acts on nothing (BEH-FD-042).
42. A crash injected during `install` restarts the host with links suspended, applies the last applied manifest minus pending kills, and resumes the re-bootstrap from step 1; a crash after the install resumes at the manifest apply without installing again; `install` never replaces the manifest, revocation or fence stores (BEH-FD-014, BEH-FD-048).
43. A re-bootstrap whose settle stays blocked retries on a backoff up to `rebootstrapRetryMax` and never suspends a link while it is blocked (BEH-FD-014).
44. An import without `disclose` sends no actor, principal, organisation or correlation id to the peer; one with `disclose` sends exactly the listed claims; a changed `disclose` changes the import's `meta.digest` and replaces its proxy, while a reordered or repeated list does not; an entry naming an unknown claim is dropped "unknown-claim" and not installed; no local patch changes `disclose`; the serving host runs a call without identity claims as the peer's service actor with a provenance entry without `ref` and core's default correlation (BEH-FD-023, BEH-FD-026).
45. A `contracts` list holding a local contract passed untyped fails the federation plugin's build with `LocalContractRefused` (site "federation-contracts") before the store is read; nothing is applied, imported or served; the option's type rejects a local contract at compile time; an import's call-log crossing entries name in `disclosed` exactly the claims sent with the call (BEH-FD-009, remote BEH-RM-007, remote BEH-RM-024).

**Settled here.** Check 24 is the "N−1 replay CI" of the architecture
review's step B5: the skew window is only as good as the pair of versions
someone has run together.

---

_Previous: [04 — Exports and imports](./04-exports-and-imports.md)_ · _Next: [06 — Kill path, placement and skew](./06-kill-path-placement-and-skew.md)_
