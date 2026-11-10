# 15 — Installation Checks

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-GX-BEH-15                                            |
> | Revision       | 0.4                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-GX-03 §5)           |
> | Approved by    | — (pending; single maintainer, see PROC-GX-03 §5)            |
> | Classification | Functional Specification                                     |
> | Change History | 0.4 (2026-11-10): `expected.sections.gatePieces`, checked by IQ-10, and IQ-23 records each of the consumer's gate pieces (M5); IQ-24 added: with sealing on, the installed `@bridger/audit-chain` identity matches the lockfile and its version lies in the compatibility row's audit-chain range (BEH-GX-117); deviation range IQ-01 to IQ-24 (M3) (CCR-GX-006)<br>0.3 (2026-11-10): IQ-23 added: the gate pieces "trail" and "chain" used as `expected.sections` declares, with their options recorded (BEH-GX-179); IQ-19 counts the timeouts of the pieces composed before the approval gate; deviation range IQ-01 to IQ-23 (H7, P18) (CCR-GX-005)<br>0.2 (2026-11-09): Core's installation check 8 (identifier uniqueness of a provided `IdGenerator`, core CCR-BR-033) packaged: IQ-22, a probe drawing from the consumer's per-host generator instances given in the new option `idDraw`, and IQ-U10, the generator's design review listed as not executed; BEH-GX-116 retitled to core's eight checks; deviation range IQ-01 to IQ-22; `idDraw.generators` are `IdGenerator` service values; IQ-22's "not-applicable" reason names the default's random bound (CCR-GX-004)<br>0.1 (2026-10-03): Initial draft (CCR-GX-001)                 |

---

Installation evidence answers one question: is what was specified installed
and wired as intended, in this environment? Core's validation plan lists
eight installation checks for a host and leaves them for the companion to
package ([core gxp/04](../../core/gxp/04-validation-plan.md) §5.1); since CCR-BR-014 most of them can be read from
the host's read-only `Host.controls` ([BEH-BR-013](../../core/behaviors/02-host-construction.md)). This file specifies
`runInstallationChecks`: the numbered checks, core's and the companion's, what
each examines, its four possible outcomes, whether its result is a **proof**
(a fact of the installation while it is unchanged) or a **probe** (an
observation at one moment), and the items no code can observe, which are
listed rather than run ([ADR-GX-020](../decisions/020-iq-proof-and-probe.md)). This file owns BEH-GX-113–120 and uses
all eight.

> **What installation checks do not do — and who does**
>
> The checks establish that the installed components are the ones tested
> and that they are wired as the consumer declared. They are not a
> qualification: they do not test behaviour (that is
> [16 — OQ Evidence](./16-oq-evidence.md)), do not show performance in
> intended use, and cannot see custody, identity or key management. Deciding
> what the installation must look like, executing the checks in the
> production environment and approving the result are the consumer's
> obligation.

Planned source: `packages/gxp/src/evidence/runInstallationChecks.ts` and
`packages/gxp/src/evidence/IqReport.ts` *(Planned)*.

## BEH-GX-113: runInstallationChecks executes the numbered checks against a built host and its companion wiring

> **Invariant:** [INV-GX-014](../invariants.md#inv-gx-014-test-fixtures-are-detectable), [INV-GX-010](../invariants.md#inv-gx-010-evidence-results-come-only-from-runner-output-and-gaps-stay-gaps)
> **See:** [ADR-GX-020](../decisions/020-iq-proof-and-probe.md), [ADR-GX-024](../decisions/024-fixtures-are-marked.md), [ADR-GX-025](../decisions/025-core-version-range.md), [ADR-BR-035](../../core/decisions/035-evidence-from-executed-tests.md)
> **Satisfies:** [URS-GX-013](../urs.md#urs-gx-013-produce-installation-evidence), [URS-BR-025](../../core/urs.md)
> **Risk:** [RSK-GX-017](../gxp/03-risk-assessment.md#rsk-gx-017), [RSK-GX-019](../gxp/03-risk-assessment.md#rsk-gx-019), [RSK-BR-017](../../core/gxp/03-risk-assessment.md#rsk-br-017)
> **Regulatory:** supports EU GMP Annex 11 §4.4, §4.5; GAMP 5 installation qualification (as evidence the consumer evaluates)

```ts
// illustrative — not type-checked
declare function runInstallationChecks(
  host: Host,
  options: {
    readonly gxp: GxpInstallation                    // what GxpLayer.make was given, its ApprovalGateLink and HighWaterRecorder
    readonly expected: InstallationRequirements      // the consumer's declared requirements (BEH-GX-116, BEH-GX-118)
    readonly packageRoot: string                     // the application directory module resolution starts from
    readonly lockfile: string                        // the lockfile the installation was made from
    readonly provenance?: { readonly verifiedBy: string; readonly attestationDigest: string }   // when the registry provides one
    readonly idDraw?: {                              // core #8 (b), for IQ-22 (BEH-GX-116)
      readonly generators: readonly IdGeneratorShape[] // IdGenerator service values (core BEH-BR-210), one per host whose outputs reach a common store, each built as that host's is in production
      readonly count: number                         // values drawn from each, at least one host's draws between restarts
    }
  }
): Effect.Effect<IqReport>                           // never fails: a check that cannot run is "not-executed"
```

| Id | Check | Source | Kind |
| --- | --- | --- | --- |
| IQ-01 | `@bridger/core` name, version and registry hash match the lockfile and the released artifact | core gxp/04 §5.1 #1 | proof |
| IQ-02 | Every documented entry point of `@bridger/core` and `@bridger/gxp` resolves from `packageRoot` | core #2 | proof |
| IQ-03 | The installed `effect` version is the one of the compatibility row, and core's only runtime dependency | core #3 | proof |
| IQ-04 | `Host.controls.wired.audit` is as `expected` | core #4 | proof |
| IQ-05 | `Host.controls.idGenerator` is as `expected` | core #5 (identifier source) | proof |
| IQ-06 | `attribution`, `auditTimeout`, `gateTimeout` and `wired.gate` are as `expected` | core #6 | proof |
| IQ-07 | `wired.fingerprinter` and `fingerprintTimeout` are as `expected`; a wired fingerprinter is the companion's | core #7 | proof |
| IQ-08 | `@bridger/gxp` name, version, registry hash and installed-files digest match its release | companion | proof |
| IQ-09 | The installed core version and audit `schemaVersion` list lie in the companion's compatibility row | companion | proof |
| IQ-10 | Each section of `GxpLayer.make` is used or "not-used" as `expected`; store manifests are acceptable | companion | proof |
| IQ-11 | No wired companion port carries the fixture marker | companion | proof |
| IQ-12 | The trail store answers `hosts` | companion | probe |
| IQ-13 | The anchor store answers `latest` for this host | companion | probe |
| IQ-14 | The ticket store answers, and holds this host's `policy-activated` event | companion | probe |
| IQ-15 | The key provider answers `current` with a key id that is not a fixture id | companion | probe |
| IQ-16 | The signature capture port's manifest names its methods and attestation | companion | proof |
| IQ-17 | The policy digest, its exempt rules and its `acknowledgeAuditDegraded` rule are recorded | companion | proof |
| IQ-18 | The eligibility digest and its entries are recorded | companion | proof |
| IQ-19 | `gateTimeout` is finite and exceeds the gate's attached deadline plus the timeouts of the pieces composed before it by at least 1 second | companion | proof |
| IQ-20 | The approval gate is attached to this host | companion | proof |
| IQ-21 | The high-water recorder's `status` reports no consecutive failures; its `lastMarked` is recorded | companion | probe |
| IQ-22 | Where `Host.controls.idGenerator` is "provided", a draw of `idDraw.count` values from each generator of `idDraw` finds no value repeated within or across them | core #8 (b) | probe |
| IQ-23 | The host gate's pieces "trail" (`trailGate`) and "chain" (audit-chain's `ChainGate`) are used or "not-used" as `expected`; the options of each used piece, and the name and timeout of each of the consumer's `gatePieces`, are recorded | companion | proof |
| IQ-24 | With sealing on, `@bridger/audit-chain` name, version and registry hash match the lockfile, and its version lies in the compatibility row's audit-chain range | companion | proof |

```
REQUIREMENT: `runInstallationChecks` MUST produce exactly one result for each
             check of the table, in the order of the table, plus the items of
             BEH-GX-114 that no code can observe. Ids MUST NOT be reused or
             renumbered; a check added later takes the next free id.
```

```
REQUIREMENT: It MUST read the host only through `host.controls()` and MUST
             NOT call a mutating operation, attribute anything or write a
             record. It MUST read stores only through their read methods, and
             MUST NOT append to any store.
```

```
REQUIREMENT: It MUST NOT fail as an effect. A check whose input is missing,
             whose port call fails or dies, or that lacks a permission MUST
             be "not-executed" with that reason; no other check's result MAY
             change because of it.
```

The table is the companion's answer to core's §5.1 and to its own ports:
each line is something that, if wrong, makes a control described elsewhere in
this specification inoperative while everything still appears to work — a
gate wired in test but not in production, a memory store left in, a policy
other than the reviewed one. Fixtures and in-memory stores are refused here,
by IQ-10 and IQ-11 ([BEH-GX-118](#beh-gx-118-ports-are-wired-as-declared-and-no-fixture-is-wired)), which is why every fixture is marked
([BEH-GX-145](./19-testing-entry-point.md)).

## BEH-GX-114: Each result is pass, fail, not-applicable or not-executed, and unobservable items are listed as not executed

> **Invariant:** [INV-GX-010](../invariants.md#inv-gx-010-evidence-results-come-only-from-runner-output-and-gaps-stay-gaps), [INV-GX-009](../invariants.md#inv-gx-009-a-finding-is-never-suppressed-or-upgraded)
> **See:** [ADR-GX-020](../decisions/020-iq-proof-and-probe.md), [ADR-GX-027](../decisions/027-claims-and-non-claims.md)
> **Satisfies:** [URS-GX-013](../urs.md#urs-gx-013-produce-installation-evidence), [URS-GX-016](../urs.md#urs-gx-016-know-which-obligations-remain-mine)
> **Risk:** [RSK-GX-016](../gxp/03-risk-assessment.md#rsk-gx-016), [RSK-GX-004](../gxp/03-risk-assessment.md#rsk-gx-004)
> **Regulatory:** supports EU GMP Annex 11 §4.4; GAMP 5 installation qualification

```ts
// illustrative — not type-checked
interface IqResult {
  readonly id: string                                   // "IQ-01" … or "IQ-U1" …
  readonly title: string
  readonly source: string                               // "core gxp/04 §5.1 #n" or "companion"
  readonly kind: "proof" | "probe"
  readonly outcome: "pass" | "fail" | "not-applicable" | "not-executed"
  readonly reason?: string                              // required unless outcome is "pass"
  readonly expected?: unknown                           // non-secret values only
  readonly observed?: unknown
  readonly observedAt?: string                          // probes only, from Clock
}
```

| Id | Item listed as not executed | Reason text |
| --- | --- | --- |
| IQ-U1 | Provenance attestation of each package, when no `provenance` result is given | "no verified attestation supplied" |
| IQ-U2 | The host's clock source (part of core #5; `Host.controls` does not report it) | "not reported by Host.controls; inspect the assembly" |
| IQ-U3 | Whether the wired `AuditSink` or `OperationGate` is one of core's test fixtures | "core fixtures carry no marker" |
| IQ-U4 | Separate custody of the anchor store from the trail store | "not observable from code; Consumer obligation" |
| IQ-U5 | One identifier per person in the identity system behind actors and signers | "not observable from code; Consumer obligation" |
| IQ-U6 | Re-authentication and §11.200 controls behind the signature port | "attested, not verified by @bridger/gxp" |
| IQ-U7 | The entropy asserted for each eligible "high" path | "not observable from code; Consumer obligation" |
| IQ-U8 | Key generation, custody, rotation schedule and retention | "not observable from code; Consumer obligation" |
| IQ-U9 | Durability, backup and restore of every store | "not observable from code; Consumer obligation" |
| IQ-U10 | The design of a provided `IdGenerator`: every value unique within the host and across every host whose outputs reach a common store (core #8 (a), BEH-BR-210) | "not observable from code; Consumer obligation" |

```
REQUIREMENT: "pass" MUST mean that the check ran and every observed value
             equalled the expected one; "fail" that it ran and some value did
             not; "not-applicable" that the check concerns a part the
             consumer declared not used (for example IQ-13 with
             `anchors: "not-used"`), with that reason; "not-executed" that it
             could not run, with the reason. No other outcome, severity or
             "warning" MAY be reported for a check.
```

```
REQUIREMENT: The items of the second table MUST always be listed with outcome
             "not-executed", kind "probe" and the reason shown, whatever else
             the run found. No option MAY remove one.
```

```
REQUIREMENT: Every "fail", and every "not-executed" result of IQ-01 to IQ-24,
             MUST also be recorded as a deviation in the evidence pack
             (BEH-GX-133). A "not-applicable" result MUST NOT be recorded as
             a deviation, but its reason MUST be shown in every rendering.
```

Four literal outcomes keep the report honest in both directions: a check that
could not run is never a pass, and a part deliberately not used is never a
failure. The second table is the list of things a reader of a green report
might otherwise assume were checked; each is named, with the reason it was
not, so that it reaches the consumer's own procedures as an open item.

## BEH-GX-115: A proof is derived from the installation, a probe is an observation at a stated time

> **See:** [ADR-GX-020](../decisions/020-iq-proof-and-probe.md), [ADR-GX-027](../decisions/027-claims-and-non-claims.md)
> **Satisfies:** [URS-GX-013](../urs.md#urs-gx-013-produce-installation-evidence), [NFR-GX-001](../urs.md#nfr-gx-001-deterministic-outputs)
> **Risk:** [RSK-GX-004](../gxp/03-risk-assessment.md#rsk-gx-004), [RSK-GX-021](../gxp/03-risk-assessment.md#rsk-gx-021)
> **Regulatory:** supports EU GMP Annex 11 §4.4, §11 (a probe is not monitoring)

```
REQUIREMENT: A check MUST be a proof only when its outcome follows from data
             that cannot change while the installation is unchanged: package
             files and their digests, the lockfile, the companion's compiled
             compatibility row, the values of `Host.controls` other than
             `auditPosition` (constant for the host's life, BEH-BR-212),
             port manifests and the policy and
             eligibility list. Every other check MUST be a probe.
```

```
REQUIREMENT: A probe's result MUST carry `observedAt`, read from `Clock` when
             the observation was made, and every rendering of it MUST say
             "observed at <observedAt>". A probe MUST make one observation;
             it MUST NOT retry until it passes.
```

```
REQUIREMENT: The kind of each check MUST be the one in the table of
             BEH-GX-113; a run MUST NOT change it. Two runs against the same
             unchanged installation MUST give the same outcome for every
             proof.
```

A reachable store at 10:02 says nothing about 10:03. Calling that result a
probe, with its time, stops a reader from treating it like the version pin
next to it, which stays true for as long as nobody changes the installation.
Watching the stores continuously is monitoring, which is the consumer's
operational concern; the companion offers the probe, once, as IQ records it.

## BEH-GX-116: Core's eight installation checks run through Host.controls against the consumer's declared requirements

> **See:** [ADR-GX-020](../decisions/020-iq-proof-and-probe.md), [ADR-BR-035](../../core/decisions/035-evidence-from-executed-tests.md)
> **Satisfies:** [URS-GX-013](../urs.md#urs-gx-013-produce-installation-evidence), [URS-BR-025](../../core/urs.md)
> **Risk:** [RSK-GX-017](../gxp/03-risk-assessment.md#rsk-gx-017), [RSK-BR-017](../../core/gxp/03-risk-assessment.md#rsk-br-017), [RSK-BR-014](../../core/gxp/03-risk-assessment.md#rsk-br-014)
> **Regulatory:** supports EU GMP Annex 11 §4.4, §4.5, §12.1

```ts
// illustrative — not type-checked
interface InstallationRequirements {
  readonly audit: "wired" | "not-required"
  readonly gate: "wired" | "not-required"
  readonly fingerprinter: "wired" | "not-required"
  readonly idGenerator: "default" | "provided"
  readonly attribution: { readonly require: boolean; readonly requireReason: readonly Operation[] }
  readonly auditTimeout: Duration.Input
  readonly gateTimeout: Duration.Input | "forever"
  readonly fingerprintTimeout: Duration.Input
  readonly sections: { readonly anchors: "used" | "not-used"; readonly approvals: "used" | "not-used"
                       readonly fingerprints: "used" | "not-used"; readonly sealing: "on" | "off"
                       readonly trailGate: "used" | "not-used"; readonly chainGate: "used" | "not-used"   // IQ-23
                       readonly gatePieces: "used" | "not-used" }                                          // IQ-10, IQ-23
}
```

```
REQUIREMENT: IQ-04 to IQ-07 MUST compare the values `host.controls()`
             returns (BEH-BR-013, REQ-BR-057) with `expected`, field by field,
             with durations compared in milliseconds and `requireReason`
             compared as a set. Each result MUST carry the expected and the
             observed values.
```

```
REQUIREMENT: IQ-01 to IQ-03 MUST read the installed packages' `package.json`
             files as resolved from `packageRoot` and the `lockfile`, and
             compare name, version and registry hash. IQ-02 MUST import each
             entry point documented in core's overview and in this
             specification's overview, under the runtime's own module
             conditions, and MUST report every one that does not resolve.
```

```
REQUIREMENT: IQ-07 MUST pass only when, with `expected.fingerprinter` equal
             to "wired", `wired.fingerprinter` is true and the companion's
             own `hmacFingerprinter` built the port, as recorded in
             `options.gxp`; a consumer's own fingerprinter MUST make IQ-07
             "fail" with the reason "fingerprinter not supplied by
             @bridger/gxp; review it under RSK-BR-024".
```

```
REQUIREMENT: IQ-22 MUST be decided by the `idGenerator` value that
             `host.controls()` reports. When it is "default", IQ-22 MUST be
             "not-applicable" with the reason "core's default generator;
             122 random bits per value (BEH-BR-210)". When it
             is "provided" and `idDraw` is absent, has no generator, or has
             a `count` below 1, IQ-22 MUST be "not-executed" with the
             reason "no generator instances supplied (core gxp/04 §5.1
             #8 (b))". Otherwise it MUST draw `count` values from each
             generator of `idDraw` through `next`, and MUST pass only when
             every drawn value is distinct from every other, within one
             generator and across generators; else it MUST "fail".
             `expected` MUST carry the number of generators and `count`;
             `observed` the number of values drawn, the number of repeated
             values and the first repeated value.
```

```
REQUIREMENT: IQ-22 MUST call only the generators in `idDraw`, never the
             host's own `IdGenerator`, and MUST NOT write a drawn value
             anywhere but its own result. A pass MUST be rendered as "no
             repeat in this draw", never as proof of uniqueness; the
             generator's design stays IQ-U10.
```

Core's check 8 has two parts, and only one of them is code. The design
review — does the generator, by construction, give every host sharing a
store values no other draw returns — is the consumer's (IQ-U10). The draw
catches the misassembly a review of the design does not: two hosts given
one prefix, a counter that restarts from 1. It is a probe, because a
random generator may answer differently on the next run, and it uses the
consumer's own instances, one per host of the deployment, because the
companion sees one host and the collision it looks for is between hosts.

Core's checks 4 to 8 examine the user's assembly, not the library, because
they are the points through which its controls take effect or are bypassed
([core gxp/04](../../core/gxp/04-validation-plan.md) §5.1). `Host.controls` makes checks 4 to 7 executable without
inspecting source code: the host reports what it was built with, and the
check compares that with what the consumer declared it must be. The
declaration is the consumer's, made under their own risk assessment; the
companion checks consistency, not adequacy.

## BEH-GX-117: The companion's identity and its version pins are checked against the compatibility row

> **See:** [ADR-GX-025](../decisions/025-core-version-range.md), [ADR-GX-001](../decisions/001-separate-package.md)
> **Satisfies:** [URS-GX-013](../urs.md#urs-gx-013-produce-installation-evidence), [NFR-GX-002](../urs.md#nfr-gx-002-minimal-dependencies)
> **Risk:** [RSK-GX-019](../gxp/03-risk-assessment.md#rsk-gx-019), [RSK-BR-017](../../core/gxp/03-risk-assessment.md#rsk-br-017)
> **Regulatory:** supports EU GMP Annex 11 §4.5, §10; GAMP 5 configuration management

```
REQUIREMENT: IQ-08 MUST compare the installed `@bridger/gxp` name, version
             and lockfile registry hash with the package's own, and MUST
             compute the installed-files digest — "sha256:" over the canonical
             list of `{ path, digest }` of every file of the installed
             package, sorted by path — and compare it with the digest the
             release publishes.
```

```
REQUIREMENT: IQ-09 MUST pass only when the installed `@bridger/core` version
             is one of the versions of the companion's compiled compatibility
             row (BEH-GX-001, BEH-GX-007), the installed `effect` version is
             the row's, and the row's audit `schemaVersion` list equals the
             exported `SUPPORTED_SCHEMA_VERSIONS`. The result MUST show the
             version pair as observed.
```

```
REQUIREMENT: IQ-09 MUST NOT consult a network service. A row not compiled
             into the installed package MUST NOT be used.
```

```
REQUIREMENT: IQ-24 MUST be "not-applicable", with the reason "sealing off",
             when `expected.sections.sealing` is "off". Otherwise it MUST read
             the installed `@bridger/audit-chain` `package.json` as resolved
             from `packageRoot`, as IQ-01 does for core, and MUST pass only
             when its name, version and registry hash match the `lockfile`
             and its version lies in the audit-chain range of the compiled
             compatibility row (BEH-GX-001). It MUST NOT consult a network
             service, and the result MUST show the version as observed.
```

The pair of versions is the one fact on which every leveraged OQ result
depends: a pack produced against core 1.4.2 says nothing about core 1.5.0.
The companion already refuses to build outside its range (BEH-GX-007); IQ
records the pair it found, as a proof, so that the installation evidence and
the OQ evidence can be matched by version ([BEH-GX-126](./16-oq-evidence.md)).

## BEH-GX-118: Ports are wired as declared, and no fixture is wired

> **Invariant:** [INV-GX-014](../invariants.md#inv-gx-014-test-fixtures-are-detectable), [INV-GX-001](../invariants.md#inv-gx-001-no-decision-port-has-a-default-outside-the-testing-entry-point)
> **See:** [ADR-GX-024](../decisions/024-fixtures-are-marked.md), [ADR-GX-003](../decisions/003-ports-without-defaults.md), [ADR-GX-008](../decisions/008-high-water-anchors.md)
> **Satisfies:** [URS-GX-013](../urs.md#urs-gx-013-produce-installation-evidence), [URS-GX-016](../urs.md#urs-gx-016-know-which-obligations-remain-mine)
> **Risk:** [RSK-GX-017](../gxp/03-risk-assessment.md#rsk-gx-017), [RSK-GX-005](../gxp/03-risk-assessment.md#rsk-gx-005), [RSK-GX-009](../gxp/03-risk-assessment.md#rsk-gx-009)
> **Regulatory:** supports EU GMP Annex 11 §4.4, §4.5; 21 CFR 11.10(d)

```
REQUIREMENT: IQ-10 MUST fail when a section of `GxpLayer.make`, `gatePieces`
             included, is used where `expected.sections` says "not-used" or
             the reverse; when the
             trail store's manifest has `commit: "in-memory"` (BEH-GX-016);
             or when the anchor store's `name` equals the trail store's or
             its `custodian` is blank (BEH-GX-047).
```

```
REQUIREMENT: IQ-11 MUST fail when the manifest of any wired companion port —
             trail store, anchor store, ticket store, signature capture, key
             provider — has `fixture: true`, or when the signature capture
             manifest lists the method "test-fixture". There MUST be no
             option that accepts a fixture.
```

```
REQUIREMENT: IQ-23 MUST fail when the piece "trail" or "chain" of the host
             gate (BEH-GX-178) is used where `expected.sections` says
             "not-used" or the reverse, read from `options.gxp`. It MUST
             record, as `observed`, the `refuseOn` members and `allow` list
             of a used `trailGate`, the options of a used `ChainGate`, and
             the `name` and `timeout` of each piece of a used `gatePieces`,
             in order (BEH-GX-178); for
             a `trailGate` given "not-used" its result MUST carry the
             statement "Marked entries do not stop operator changes."
             (BEH-GX-179).
```

```
REQUIREMENT: IQ-16 MUST print the signature port's `name`, `version`,
             `methods` and attestation document and version, and MUST mark
             them "attested, not verified by @bridger/gxp" (BEH-GX-079). It
             MUST NOT call `capture`.
```

A fixture is a working implementation of a port that quietly does the wrong
thing in production: a memory store loses the trail on restart, a scripted
capture approves without a person ([RSK-GX-017](../gxp/03-risk-assessment.md#rsk-gx-017)). Every fixture carries
the marker ([BEH-GX-145](./19-testing-entry-point.md)), so IQ can refuse it by looking, and does
so without exception. The marker is on the companion's own fixtures only;
core's test sink and gate are not marked, which IQ-U3 states.

## BEH-GX-119: Stores and the key provider are probed, and the policy and eligibility list are recorded by digest

> **See:** [ADR-GX-020](../decisions/020-iq-proof-and-probe.md), [ADR-GX-014](../decisions/014-deny-by-default-policy.md), [ADR-GX-018](../decisions/018-eligibility-allow-list.md), [ADR-GX-019](../decisions/019-key-provider-and-rotation.md)
> **Satisfies:** [URS-GX-013](../urs.md#urs-gx-013-produce-installation-evidence), [NFR-GX-007](../urs.md#nfr-gx-007-no-secrets-in-any-output)
> **Risk:** [RSK-GX-011](../gxp/03-risk-assessment.md#rsk-gx-011), [RSK-GX-010](../gxp/03-risk-assessment.md#rsk-gx-010), [RSK-GX-013](../gxp/03-risk-assessment.md#rsk-gx-013)
> **Regulatory:** supports EU GMP Annex 11 §4.4, §10

```
REQUIREMENT: IQ-12 to IQ-15 MUST each make one read call — `hosts`,
             `latest({ hostId })`, `ticket("gate:" + hostId)` and `current` —
             and pass when it answers well-formed within 10 seconds. IQ-14
             MUST also fail when no `policy-activated` event with the policy
             digest in force is found (BEH-GX-095); IQ-15 MUST record the key
             id only and fail for a "test:" id (BEH-GX-106, BEH-GX-111).
```

```
REQUIREMENT: IQ-17 MUST record the policy's `name`, `version` and digest
             (BEH-GX-061); print every exempt rule with its justification
             (BEH-GX-059) and the rule governing `acknowledgeAuditDegraded`
             with the sentence of BEH-GX-062; and list every rule shadowed
             by an earlier one (BEH-GX-064). IQ-18 MUST record the
             eligibility digest and print `describeEligibility` (BEH-GX-098).
```

```
REQUIREMENT: The printed policy and eligibility list MUST be the ones the
             running gate and fingerprinter were built with, read from
             `options.gxp`, and MUST NOT include a configuration value or key.
```

The digests turn "the reviewed policy" into one value that can be compared
with the change record that approved it; a policy edited after review shows
up as a different digest here and in every consumption event. Exemptions and
the latch rule are printed in full because they are the decisions most
likely to be made in haste and most in need of a second reader.

## BEH-GX-120: A non-finite gateTimeout fails its check and is a deviation, and the report is written to iq.json

> **Invariant:** [INV-GX-009](../invariants.md#inv-gx-009-a-finding-is-never-suppressed-or-upgraded)
> **See:** [ADR-GX-020](../decisions/020-iq-proof-and-probe.md), [ADR-GX-010](../decisions/010-sign-first-then-call.md), [ADR-GX-022](../decisions/022-evidence-pack-format.md)
> **Satisfies:** [URS-GX-013](../urs.md#urs-gx-013-produce-installation-evidence), [NFR-GX-008](../urs.md#nfr-gx-008-gate-decision-within-its-deadline), [NFR-GX-001](../urs.md#nfr-gx-001-deterministic-outputs)
> **Risk:** [RSK-GX-021](../gxp/03-risk-assessment.md#rsk-gx-021), [RSK-GX-016](../gxp/03-risk-assessment.md#rsk-gx-016)
> **Regulatory:** supports EU GMP Annex 11 §4.4, §12.1

```ts
// illustrative — not type-checked
interface IqReport {
  readonly format: "bridger-gx-iq/1"
  readonly hostId: string
  readonly runAt: string                              // from Clock
  readonly controls: HostControls                     // the snapshot every core check was derived from
  readonly results: readonly IqResult[]               // IQ-01 … IQ-24, then IQ-U1 … IQ-U10
  readonly statement: string
}
```

```
REQUIREMENT: IQ-19 MUST fail when `gateTimeout` is "forever", or when it
             exceeds the sum of the `deadline` and `precededBy` reported by
             `ApprovalGateLink.status` (BEH-GX-094) by less than 1 second; with "forever" the evidence pack MUST also
             carry the deviation "non-finite gateTimeout" (BEH-GX-133). IQ-20
             MUST fail when the gate's attached `hostId` differs from
             `Host.controls.hostId` or is absent.
```

```
REQUIREMENT: The report MUST be written as `iq.json` of the evidence pack in
             RFC 8785 canonical form (BEH-GX-129), with results in table
             order. `statement` MUST be: "Installation checks record what was
             installed and wired at <runAt>. They do not test behaviour and
             do not qualify the system."
```

```
REQUIREMENT: The same installation, `Clock` reading, `Host.controls` answer
             and probe answers MUST give a byte-identical `iq.json`
             (NFR-GX-001).
```

A gate whose host waits forever has no bound on how long a change can be
held open, which is the condition [ADR-GX-010](../decisions/010-sign-first-then-call.md) designs out; core accepts
"forever" only when stated explicitly, and the companion accepts it only as
a recorded deviation, so that the consumer's choice is visible to whoever
approves the installation.

---

_Previous: [14 — Fingerprint Keys](./14-fingerprint-keys.md)_ · _Next: [16 — OQ Evidence](./16-oq-evidence.md)_
