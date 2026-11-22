# Appendix C — UI Adapter Scenarios

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-KT-APP-C                                             |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Informative appendix (companion)                             |
> | Change History | 0.2 (2026-11-22): the FoldKit adapter seam runs the scenarios; the React adapter is tested with its hooks on a DOM<br>0.1 (2026-11-22): Initial draft — the ten framework-neutral scenarios of the two UI adapters (improvement report 05 R9, DX-08) |

---

**Informative.** [`docs/REACT-API.md`](../../../docs/REACT-API.md) and
[`docs/FOLDKIT-API.md`](../../../docs/FOLDKIT-API.md) specify the same client
behaviours twice, with separate examples. This appendix names them once, as
scenarios, so that each adapter runs one list and a divergence between the two
fails a test instead of surviving in two documents. It adds no requirement of
core or the kit; the adapters are outside this specification.

The list is executable: `prototypes/host-core/test/adapter-conformance.ts`
exports `scenarios`, and an adapter's test supplies `make`, a function from a
host to its client (the interface of `prototypes/host-core/src/adapter.ts`:
`snapshot`, `changes`, `pluginState`, `isAvailable`, `use`, `dispose`). The
prototype's framework-neutral client and the FoldKit adapter's seam (`src/foldkit.ts`, assembled from its exports in `test/foldkit.test.ts`) pass all ten
(`test/adapter-conformance.test.ts`); removing its disposal check, or its
subscription to the host, fails scenarios A9, A2, A3, A6, A7 and A8.

| Id | Scenario | What it requires |
| -- | -------- | ---------------- |
| A1 | No snapshot before the first one; an empty snapshot is a snapshot | `Option.none()` until the host's first snapshot arrives, then `Some`, even with zero plugins (FoldKit Model; core 04, BEH-BR-028). |
| A2 | `pluginState` is a lifecycle state, or `uninstalled` | Pure selector over the cached snapshot (FoldKit `pluginState`; React plugin-lifecycle hook). |
| A3 | `isAvailable` is true only while an active provider exists | False while the provider is missing, waiting or removed (FoldKit `isAvailable`; React `record.available`). |
| A4 | Availability is a hint | A call after the provider was removed fails typed (`ServiceUnavailable`, `LeaseRevoked`, `LeaseTimeout`), never as a crash (both documents, "does not reserve"). |
| A5 | A call runs under the client and returns the service's result | Through `host.use`, so the provider is not closed under it (core 09, BEH-BR-085). |
| A6 | Revisions only increase | No snapshot with a lower revision follows a higher one (FoldKit "Snapshot and lifecycle contracts"). |
| A7 | After a burst of changes the cache holds the host's latest snapshot | Intermediate snapshots may be coalesced; the latest is the state (FoldKit). |
| A8 | Hot install and removal reach existing subscribers | No recreation of the client; subscribers are notified (React §4, FoldKit §6). |
| A9 | `dispose` is idempotent and refuses later calls | A second `dispose` does nothing; a call after it fails; the host is not closed (React §1, FoldKit "Shutdown"). |
| A10 | One subscription to the host per client | However many consumers read the cache, `Host.changes` is consumed once (React "Core observation seam"). |

Behaviours that are not shared stay in each adapter's document: React's
provider and hooks (`useSyncExternalStore` over the cache), FoldKit's Commands,
Subscriptions and widget mounting. Two behaviours are stated in both documents
but need a real framework to test, and are not in the list: rejecting client
creation when an initial plugin fails its build (a missing dependency leaves it
`waiting`, not failed), and registering lazy definitions `dormant` without
running their code.
