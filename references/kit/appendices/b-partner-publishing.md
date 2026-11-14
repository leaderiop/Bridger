# Appendix B — Partner Publishing Guide

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-KT-APP-B                                             |
> | Revision       | 0.4                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Informative appendix (companion)                             |
> | Change History | 0.4 (2026-11-11): §5: the bundle runs outside the host's runtime, in the bundle runtime the deployment chose (§1), not necessarily out of process (PL19) (SPEC-AUDIT-05) (CCR-KT-008)<br>0.3 (2026-11-09): §1 and §5: a partner package is a guest entry reached through `LoaderRemote.link`, fetched and verified at each session, never `Loader.lazy`; identity disclosed only by the application's opt-in; §2 guest-shaped manifest with `requested.capabilities` and the entry key; §6 `GuestEntryInvalid`, `NotFirstParty` (F-06, F-07, C-19, M-03); §1 and §7: a guest runs outside the host's runtime in the deployment's bundle runtime, possibly a worker thread of the same process; first-party is the application's decision (independent review) (CCR-KT-004)<br>0.2 (2026-11-08): `publish` and `countersign` examples pass the application's rules and a revocation source; what `publish` prints without them (round-2 agent review R3-12, R3-13) (CCR-KT-003)<br>0.1 (2026-11-08): Initial draft (CCR-KT-003)                 |

---

**Informative.** This appendix walks a partner — an organisation other than the
application's developers — from a Promise SDK handler to a package a host will
accept. It adds no requirement; every step cites the behaviour that specifies
it. Nothing here is implemented. Snippets are illustrative and marked
`type-checked: not yet`; `bridger check` compiles only snippets marked
`type-checked: yes` (BEH-KT-028), so none of these is evidence that the API
exists as shown.

The persona guide for writing the handler itself is
[docs/guides/partner-sdk-guide.md](../../../docs/guides/partner-sdk-guide.md);
this appendix starts where that one ends.

## 1. What the host will check, and who decides

A host never evaluates your code in its own runtime unless the application
decides to. Your package reaches a host as a catalog entry whose trust class
is "guest": it carries no "first-party" statement, and only the application's
own "first-party" rule decides whose signature on such a statement counts —
you cannot add one that a host accepts. An application can sign one for your
package, and then it is evaluated in the host's runtime; that is its decision
and its responsibility, not yours
([loader BEH-LD-065, BEH-LD-066](../../loader/behaviors/09-trust-class-and-guest-links.md)). The loader's `Loader.lazy` refuses
such an entry with `NotFirstParty` (BEH-LD-067). The host instead builds a
remote link from your entry with `LoaderRemote.link`, which fetches and
verifies your bundle with the loader's `fetchVerified` at each session attempt
and hands it to the bundle runtime the deployment chose, which runs it
outside the host's runtime — in a worker thread of the host's own process
with `@bridger/worker`, which confines nothing beyond a separate heap, or in
an isolate or another process with the other adapters (remote BEH-RM-053)
(BEH-LD-068; [loader BEH-LD-039](../../loader/behaviors/05-catalog-and-lazy-loading.md)).
At each of those fetches, the loader checks:

| Check | Who decides | Behaviour |
| ----- | ----------- | --------- |
| The package digest matches the bytes | Fixed construction | BEH-LD-002 |
| The signatures satisfy the deployment's rule for "package" statements — typically your publisher key plus a reviewer's key | The application's signature policy | BEH-LD-020, BEH-LD-050, BEH-LD-051 |
| Your manifest's `publisher` is a name your key is configured for | The application's trust configuration (`TrustedSigner.publishers`) | BEH-LD-053 |
| No revocation covers the digest, the statement or your key | The application's revocation channel | BEH-LD-052 |
| The application's own predicates (SBOM, requested permissions, egress) | The application | BEH-LD-006 |
| Your manifest has the guest shape: one `provides` contract, nothing in `requires`, `optional`, `activation`, `contributions` or `listens` | Fixed construction (`LoaderRemote.link`) | BEH-LD-068 |
| Which of your `requested.capabilities` callbacks are granted, and whether user identity is disclosed to your process | The application, in the link's options (`grants`, `disclose`) | remote BEH-RM-043, BEH-RM-024 |

You do not choose the policy and cannot lower it. Ask the application owner for
three things before you start: the publisher name your key will be configured
for, the roles the release policy requires (for example one `publisher` and
one `reviewer`), and which signing scheme they verify (Ed25519 pinned keys, or
Sigstore identities).

## 2. Build: `bridger pack`

```ts
// illustrative — type-checked: not yet
// bridger.config.ts
export default {
  manifest: {
    id: "acme.label-printer",
    version: "1.4.0",
    publisher: "Acme Devices",                 // must match your configured publisher name (BEH-LD-053)
    provides: [{ serviceId: "acme/LabelPrinter@1", version: "1.2.0", methods: ["print"] }],   // exactly one contract (guest shape, BEH-LD-068)
    requested: {
      egress: [{ host: "labels.acme.example", purpose: "printing" }],
      capabilities: [{ serviceId: "example/Clock@1", methods: ["now"] }]   // callbacks you ask for; a request is not a grant
    }
    // no requires, optional, activation, contributions or listens
  }
}
```

`bridger pack` runs `bridger check`, builds the manifest, one SBOM and the
files, and computes the digest with the loader's own function; the same
sources give byte-identical packages (BEH-KT-029). It writes the module and
export your bundle starts from into `extensions["@bridger/loader"].entry`,
which is how a host's bundle runtime finds it (BEH-KT-029; loader BEH-LD-001).
A partner template's manifest must have the guest shape; `pack` refuses
anything else and names the field, as a host would refuse it with
`GuestEntryInvalid` (BEH-KT-029, BEH-KT-036). Your callback clients are
generated from `requested.capabilities`; the host decides which it grants
(BEH-KT-035).

## 3. Sign: `bridger publish`

```text
$ bridger publish dist/acme.label-printer-1.4.0.bpkg --target partner-registry --signer kms-acme \
    --rules host-rules.json --revocation revocations.json
package   acme.label-printer 1.4.0  sha256:9c…e2
signing   kms-acme …  ok (signer entry acme-publisher)
revocation list revision 42, issued 2026-11-07T09:00:00Z
policy    release-v1: not yet satisfied — needs 1 signer with role reviewer
          run: bridger countersign dist/acme.label-printer-1.4.0.bpkg
uploaded  nothing (pass --partial to upload with one signature)
```

`publish` never sees your key. It hands the loader's signing input — the
canonical statement "package, this digest, this id, this version" — to the
signer adapter you wired (a KMS, a hardware token, a Sigstore keyless flow)
and receives a signature back (BEH-KT-030; BEH-LD-054). It then asks the
loader's `SignaturePolicy.verify` what the policy still needs and prints it.
That report needs the application's rules (`host-rules.json`, which the
application owner gives you, including the revocation issuer and trust root)
and a revocation list (`--revocation`, or `unbounded`, which prints a warning
that no revocation was checked). Without `--rules`, `publish` signs, prints
"policy unknown: the deployment's rules were not given", and uploads only with
`--partial`.

## 4. Review and countersign: `bridger countersign`

The reviewer — a person other than the one who built the package, holding a
different key listed under a different signer entry — inspects the package
(manifest, SBOM, the conformance report shipped with it, BEH-KT-036) and runs:

```text
$ bridger countersign dist/acme.label-printer-1.4.0.bpkg --signer kms-review --rules host-rules.json --revocation revocations.json
package   acme.label-printer 1.4.0  sha256:9c…e2 (recomputed)
verified  acme-publisher (roles: publisher)
signing   kms-review …  ok (signer entry acme-reviewer)
policy    release-v1: satisfied (acme-publisher, acme-reviewer)
```

`countersign` recomputes the digest, verifies the existing signatures, signs
the same statement, appends the signature, and checks the policy again
(BEH-KT-032). The package bytes and digest do not change. The loader counts
signer entries, not people: that the two entries belong to two people is the
application's key custody (BEH-LD-020).

## 5. Upload, and what happens next

Run `bridger publish` again (or with `--partial` earlier, then upload the
countersigned signatures). The registry adapter receives the package and its
signatures (`PublishTarget.upload`). From there the application's catalog
verifies the entry without fetching your code (BEH-LD-034), shows your
publisher name only if it is bound to a verified signer (BEH-LD-053), and
gives it the trust class "guest" (BEH-LD-066). A host that installs the link
fetches and verifies your bundle each time a session opens, and runs it
outside the host's runtime, in the bundle runtime the deployment chose (§1) —
with `@bridger/worker`, a worker thread of the host's own process; a revocation or a policy change takes effect at the next session
(BEH-LD-068). Your process receives no user identity unless the application
configured the link to disclose some claims, which it records on its side as
a data transfer (BEH-KT-034; remote BEH-RM-024).

## 6. When something is refused

| You see | Meaning | What to do |
| ------- | ------- | ---------- |
| `SignatureRejected` ("unsatisfied") | The policy still lacks a signer, or a key is outside its validity window | Countersign with the missing role; check key windows |
| `PublisherMismatch` | Your manifest's `publisher` is not a name your key is configured for | Use the agreed name, or ask the application owner to configure it |
| `Revoked` / `StatementRevoked` | The digest, the statement or a key it depended on is revoked | Publish a new version; if your key is revoked, sign with a new configured key |
| `SigningFailed` | Your signer adapter failed; nothing was added | Fix the adapter's access; the package is unchanged |
| `DigestMismatch` | The bytes changed after the digest was computed | Re-run `bridger pack`; never edit a packed package |
| `GuestEntryInvalid` | Your manifest is not guest-shaped (the reason names the field) | Declare exactly one `provides` contract and move callbacks to `requested.capabilities`; re-run `bridger pack` |
| `NotFirstParty` | A host tried to load your package in process | Nothing on your side: the host must reach your package through `LoaderRemote.link` |

The error catalog gives the fix for each tag
([07 — Error catalog](../behaviors/07-error-catalog.md)).

## 7. What this does not promise

A signed, accepted package is a package the required signers vouched for; it
is not reviewed for safety by Bridger, and where it runs — and whether
anything confines it there — is a deployment property, not a sandbox the kit
provides (README, honest-claims
rule). A data pack you publish follows the same steps with
`bridger countersign` accepting data packs (BEH-KT-032); its readers are told
when it is stale and decide what to do (BEH-LD-060).

---

_Previous: [Appendix A — Cast inventory](./a-cast-inventory.md)_
