# Appendix B — Partner Publishing Guide

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-KT-APP-B                                             |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Informative appendix (companion)                             |
> | Change History | 0.2 (2026-11-08): `publish` and `countersign` examples pass the application's rules and a revocation source; what `publish` prints without them (round-2 agent review R3-12, R3-13) (CCR-KT-003)<br>0.1 (2026-11-08): Initial draft (CCR-KT-003)                 |

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

A host that runs partner code fetches it with the loader's `fetchVerified` and
runs it out of process behind the remote companion
([loader BEH-LD-039](../../loader/behaviors/05-catalog-and-lazy-loading.md)).
Before any of that, the loader checks:

| Check | Who decides | Behaviour |
| ----- | ----------- | --------- |
| The package digest matches the bytes | Fixed construction | BEH-LD-002 |
| The signatures satisfy the deployment's rule for "package" statements — typically your publisher key plus a reviewer's key | The application's signature policy | BEH-LD-020, BEH-LD-050, BEH-LD-051 |
| Your manifest's `publisher` is a name your key is configured for | The application's trust configuration (`TrustedSigner.publishers`) | BEH-LD-053 |
| No revocation covers the digest, the statement or your key | The application's revocation channel | BEH-LD-052 |
| The application's own predicates (SBOM, requested permissions, egress) | The application | BEH-LD-006 |

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
    requested: { egress: [{ host: "labels.acme.example", purpose: "printing" }] }
  }
}
```

`bridger pack` runs `bridger check`, builds the manifest, one SBOM and the
files, and computes the digest with the loader's own function; the same
sources give byte-identical packages (BEH-KT-029). The manifest it emits
declares your hook contributions with their roles and targets, and the events
you listen to, so that the host can compare what your code registers with what
you signed (BEH-KT-029; core BEH-BR-241, BEH-BR-268).

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
publisher name only if it is bound to a verified signer (BEH-LD-053), and a
host fetches and runs your bundle out of process when it is installed.

## 6. When something is refused

| You see | Meaning | What to do |
| ------- | ------- | ---------- |
| `SignatureRejected` ("unsatisfied") | The policy still lacks a signer, or a key is outside its validity window | Countersign with the missing role; check key windows |
| `PublisherMismatch` | Your manifest's `publisher` is not a name your key is configured for | Use the agreed name, or ask the application owner to configure it |
| `Revoked` / `StatementRevoked` | The digest, the statement or a key it depended on is revoked | Publish a new version; if your key is revoked, sign with a new configured key |
| `SigningFailed` | Your signer adapter failed; nothing was added | Fix the adapter's access; the package is unchanged |
| `DigestMismatch` | The bytes changed after the digest was computed | Re-run `bridger pack`; never edit a packed package |

The error catalog gives the fix for each tag
([07 — Error catalog](../behaviors/07-error-catalog.md)).

## 7. What this does not promise

A signed, accepted package is a package the required signers vouched for; it
is not reviewed for safety by Bridger, and running it out of process is a
deployment property, not a sandbox the kit provides (README, honest-claims
rule). A data pack you publish follows the same steps with
`bridger countersign` accepting data packs (BEH-KT-032); its readers are told
when it is stale and decide what to do (BEH-LD-060).

---

_Previous: [Appendix A — Cast inventory](./a-cast-inventory.md)_
