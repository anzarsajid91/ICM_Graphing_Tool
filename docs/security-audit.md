# Hydra Bench security assessment — 2026-10-17

**Bounded assessment, not a certification. Initial findings below retain the original baseline; the 2026-10-18 disposition supersedes the initial independent-review proposal.**

Baseline: public repository `anzarsajid91/ICM_Graphing_Tool`, main `8c7f59ff94ecdf0c84c5b22f1f9ec6d6d4c38a98`. Live build.json reports **v1.066**, that SHA, worker architecture 9 and SHA-versioned assets. The latest inspected scheduled live run (39026506758, 2026-10-17) concluded success for that revision. Neither statement establishes absence of vulnerabilities.

The audit retrieved a fixed source snapshot through the GitHub connector, verified retrieved file bytes against Git blob hashes, and retrieved missing fixed runtime binaries from production with comparison to the checked-in SHA-256 manifest. No imported engineering data was used. Complete historical Git objects, deleted branches, forks, external caches and expired artifacts have not been exhaustively inspected. Tests and results are recorded separately in security-validation.md; do not infer execution from workflow source.

## Risk method

Severity combines credible likelihood and impact: Critical = credible broad uncontrolled data disclosure or release compromise with immediate exploitable access; High = a credible path to engineering-data disclosure or production code compromise; Medium = a meaningful attack prerequisite, integrity/availability weakness or incomplete assurance; Low = limited exposure or maintenance/documentation risk. Confidence is stated where uncertainty affects disposition. Missing evidence is not proof of safety or proof of compromise. Critical/High data exposure findings block release until corrected and independently reviewed; the no-egress contract has no waiver.

## Baseline controls

| Existing control | Execution and purpose | Limitations / baseline enforcement |
|---|---|---|
| SECURITY.md and AGENTS.md | All contributor/agent changes: prohibit engineering data and derived metadata egress | Policy, not a technical sandbox or organisational approval |
| verify_data_confidentiality.py + network-source-approvals.json | Every push/PR confidentiality workflow and every Pages build; detects network-capable source changes and vendor tampering | Pattern/AST change detector; obfuscation, JS computed properties and unreviewed semantic changes can evade patterns; approval file itself needs review |
| tests/privacy + privacy-network-unit.mjs | Positive and synthetic prohibited-operation tests | Establish guard behaviour, not comprehensive browser security |
| privacy-network.mjs | Request observation in existing release browser flows, pages/popups/workers; fixed same-origin GET resources and release token | Observes exercised operations, not all browser APIs, extensions, speculative browser traffic or endpoint activity; socket detection is page-based |
| pages.yml | Python, JS, authoritative/FastPath, Chromium, Firefox and interaction acceptance before production | Baseline path filters, head-only PR checkout, mutable Action tags; branch bypass possible |
| live-pages-verification.yml | After successful main deployment, scheduled and manual; exact build metadata, synthetic live smoke, issue signal | Metadata alone is not complete byte attestation; workflow edits are not independently enforced |
| vendor manifest + verify_vendor.py | Build and source checks validate exact files, sizes and hashes | Hashes are not trust/provenance proof; upstream advisories and licences require review |
| app_version.py + build metadata | Existing PR-based version increment and SHA asset tokens | Local build requires full relevant Git history; cache busting is not cryptographic authenticity |

GitHub API evidence: main `protected:false`, protection disabled, required contexts empty; repository rulesets `[]`. Thus server-side prevention of direct/force pushes and unchecked merges was **Not Enforced**. Connector administration is unavailable. Branches and release collections were inspected; no releases returned, several non-main branches remain. This assessment does not delete branches or rewrite history.

## Findings and disposition

| ID | Severity / confidence | Evidence and impact | Candidate remediation / residual status |
|---|---|---|---|
| HB-01 | High / high | Unprotected main and no rulesets allow production changes outside review/checks; compromised account or automation could publish exfiltrating code | Fail-closed production-governance check, CODEOWNERS, exact administrator instructions. **Open release blocker:** administrator enforcement and independent reviewer still required |
| HB-02 | High / high | live-improvement-loop.md and generated live-regression instructions allowed automatic merging of ingestion/deployment changes | Replaced with universal PR, checks and independent review; no repair may relax confidentiality. Pending independent review; not a claim of server enforcement |
| HB-03 | Medium / high | Pages path filters can omit checks; explicit PR head checkout excludes merge-result integration; deployment build did not directly need verify | Removed Pages filters, test github.sha merge result, add explicit verify/security dependencies. CI execution pending |
| HB-04 | Medium / high | Actions use mutable tags; Python ranges and transient npm installation are not a fully locked build-tool supply chain | Candidate Action SHA pins and provenance inventory, dependency/secret/static scanning, recurring audits and SBOM. Playwright is locked with npm integrity metadata; complete Python/platform/runner locks and licence review remain incomplete |
| HB-05 | Medium / high | Some CSV exports quote cells but do not neutralise spreadsheet formulas: runtime.release.js downloadManifest and network-schematic.js exportRows | Candidate fix: shared spreadsheet-safe cell serializer prefixes formula-leading strings, preserves typed numbers and escapes quotes. Applied to these two identified exports with tests and explicit source-review rationale. Independent review pending. The active detriment CSV serializer already neutralises formula-leading text. The historical runtime.js source is replaced by runtime.release.js in the production build. |
| HB-06 | Medium / high | Persistent named workspaces, quarantine records and network layouts can retain identifiers, mappings, comments and thresholds in localStorage | Accurate retention/clear-site-data guidance added. Browser/endpoint exposure remains; no automatic erasure claim |
| HB-07 | Medium / high | Baseline document has no CSP/referrer policy; HTML/SVG reports and extensive DOM innerHTML remain important injection surfaces | Added limited CSP base/object/form restrictions and no-referrer metadata. Full script/connect CSP and Trusted Types require compatibility validation; not represented as implemented |
| HB-08 | Medium / moderate | Workbook reader caps bytes, sheets, expansion, rows/columns; other CSV/FDV workloads can still exhaust browser resources | Worker separation helps responsiveness; exhaustive fuzzing/global limits/cancellation and all malformed-file paths remain unverified. Do not reject legitimate large engineering data using arbitrary unreviewed limits |
| HB-09 | Medium / high | Source controls cannot establish upstream dependency safety; current browser OSV query returns two SheetJS advisories | **Blocking scan pending independent applicability review:** npm xlsx advisory ranges are open-ended, while advisory text says fixes in CE 0.19.3/0.20.2 and vendored version is 0.20.3. Preserve raw findings, do not auto-ignore or treat this as confirmed exploitability |
| HB-10 | Medium / high | Exact build metadata can coexist with modified/mixed assets; Pages headers/access controls are hosting-managed | Added deterministic complete artifact hash manifest and local tamper tests. Manifest is compared to the tested artifact from the same workflow; live verifier rebuilds the exact revision and compares every fixed resource. CI execution and trusted external attestation remain incomplete |
| HB-11 | Medium / unknown | Real historical data/credentials may exist beyond retrieved current source, reachable fixtures, branches, old PRs/artifacts/caches | Full-history secret scan added; historical authenticity review of reference material and GitHub artifacts remains incomplete. No confidential evidence republished and no destructive history change authorised |
| HB-12 | Low / high | No dedicated evidence-backed IT transparency view; storage and assurance limitations not visible together | About → IT Security with static claim register/digest checks and neutral verification status. UI and content validation required before release |

No confirmed credential or actual engineering-data transmission is asserted by this report. No absence-of-egress guarantee is asserted either. The application-level contract remains absolute; assurance of its implementation is bounded by reviewed source and executed tests.

## Browser data-flow and trust boundaries

1. Browser file selection/drop supplies File bytes; runtime retains local file/series records. Filenames/identifiers are protected data.
2. FastPath worker receives bytes by postMessage and parses local previews. The authoritative worker boot downloads fixed same-origin Pyodide, selected wheels and Python modules.
3. analysis-worker writes inputs into the in-memory `/data` filesystem, calls authoritative APIs, returns results by postMessage; removal uses FS.unlink. Worker state and JS registries can retain results until reset/reload.
4. Charts, survey/spill/detriment calculations and network rendering consume local state. Named workspaces/layouts persist selectively in browser storage. Explicit exports use local Blob downloads/blank print documents; browser/device handling after export is outside the app.
5. Source data must never enter URLs, query strings, headers, request bodies, referrers, logs, scanner inputs or CI artifacts. Reviewed resource downloads are the only permitted network category. The network test observer is not a production egress firewall.

The Python/Dash desktop-server entry points and developer CLI have different execution/hosting boundaries from the deployed static browser build. This assessment does not authorise hosting them as remote upload services. Do not extend browser-local claims to those modes without a separate deployment review.

## STRIDE threat model

| Threat | Assets / boundary and plausible attack | Impact / likelihood | Mitigations and residual risk |
|---|---|---|---|
| Spoofing | Maintainer/app credentials or malicious dependency masquerade as approved release | High / credible | MFA/token review, pins, independent PR review and protected release; external account controls unverified |
| Tampering | PR changes workflow/approval list or generated artifact after tests | High / credible with write access | Merge-result tests, source/vendor digests, hash manifest, protected ruleset required; self-modifiable CI cannot enforce itself |
| Repudiation | Manual/AI repair bypasses review; no traceable approved revision | Medium / credible | PR evidence, final-head approval, commit/version identity, incident record; retention and approval depend on GitHub settings |
| Information disclosure | DOM injection, compromised runtime, malicious SVG/HTML, data-bearing requests, stored layouts, exported spreadsheets | High / conditional on attack path | Escaping review, local-only contract, network tests, limited CSP; comprehensive XSS proof, endpoint/extension isolation and all sinks not established |
| Denial of service | Large/malformed CSV/FDV/XLSX or pathological plots consume CPU/memory | Medium / credible | Workers and workbook resource limits; browser can still exhaust resources; further parser fuzzing needed |
| Elevation of privilege | Untrusted PR reaches privileged workflow; release app/bot bypasses branch rules | High / credible if controls absent | Read-only PR permissions, no pull_request_target execution, immutable Action refs, required reviewers/environment; verify rules and third-party action transitive downloads |

## Supply chain and licensing

Browser runtime is checked in and same-origin: Plotly 3.1.0, Pyodide 0.29.4 including its WASM/Python stdlib and selected wheels, SheetJS CE 0.20.3, Inter 4.1. The vendor inventory records exact sizes/hashes and licence files, including NumPy, pandas, python-dateutil, pytz and six. The candidate produces CycloneDX browser and resolved Python inventories in CI. Pyodide-distributed binaries and stdlib require project-specific review beyond PyPI package-name matches; no coverage is inferred from an empty query response.

Python development/desktop requirements use bounded ranges, not complete reproducible platform locks. Build tools, npm browser runners, Actions' internal downloads and runner images are additional supply-chain dependencies. Pinning an Action commit does not pin every downloaded tool. The project itself has no root licence in the inspected tree; rights to contribute/distribute code and any client-derived material need maintainer/authorised legal determination. Do not invent a project licence or ownership approval.

Primary references reviewed: [GitHub rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets), [Pyodide 0.29.4](https://pyodide.org/en/0.29.4/), [SheetJS ReDoS advisory record](https://osv.dev/vulnerability/GHSA-5pgg-2g8v-p4x9), [prototype-pollution advisory record](https://osv.dev/vulnerability/GHSA-4r6h-8v6p-xvw6). Scan applicability needs independent adjudication; raw scanner matches are not silently suppressed.

## First executed candidate CI findings

The initial PR run executed confidentiality successfully and produced inspectable scan evidence and SBOMs. It identified a real **CI-tooling** dependency issue: the first pinned CycloneDX toolchain resolved lxml 5.4.0, flagged by PYSEC-2026-87 / CVE-2026-41066 (untrusted XML entity resolution; fixed in 6.1.0). The candidate updates pip-audit to 2.10.1, cyclonedx-bom to 7.5.0 and explicitly pins lxml 6.1.0. This does not change the browser's Pyodide runtime or engineering dependencies. The executed rerun confirmed the Python audit passes after this remediation; no advisory is ignored.

The initial secret job failed while installing Gitleaks because its historic Go module declares github.com/zricethezav/gitleaks/v8 despite the repository's current organisation name. The module path is corrected at the same pinned version; the executed rerun passed the full reachable-history secret scan. This does not certify absence of authentic historical engineering data.

Dependency review failed because GitHub Dependency graph is disabled/unsupported in the current repository settings. Dependency graph was subsequently enabled through the signed-in browser and its saved setting verified. The dependency-review rerun passed after enablement; it was never silently skipped. The new dependency-review job name is unique to avoid ambiguity with the existing optional UIUX review job.

## Release decision

The later [CodeQL source-path review](https://github.com/anzarsajid91/ICM_Graphing_Tool/blob/main/docs/security-codeql-review.md) records an additional **High** finding: a malformed imported schematic gap could break out of an unescaped input attribute. The renderer now escapes that attribute and numeric-label attributes, with hostile import/render/export regression coverage. SVG camera offsets are explicitly numeric at the presentation boundary. No hydraulic calculation source is changed. Predictable synthetic-evidence writes and misleading regex text stripping were also corrected. No scanner query, threshold or path coverage was disabled; final scan and browser results must establish acceptance. The release outcome and exact tested revision are recorded in PR #81 rather than inferred from this document.

Release remains conditional on effective administrator rules, all mandatory checks, static-analysis review and exact-artifact validation. The owner authorised single-maintainer release on 2026-10-18; no independent human review is represented. Historical-data, licensing and wider hosting assurance limitations remain open and are not claims of confirmed data egress. See security-governance.md for exact settings and rollback procedure. No employer-specific policy or approval is claimed.

## 2026-10-18 maintainer disposition and policy revision

The owner explicitly authorised single-maintainer governance and release subject to passing checks. Independent human review is unavailable; AI-assisted scrutiny is not represented as independent approval. HB-01's missing-settings condition is remediated: GitHub reports active ruleset 25314721, protected main, fourteen required GitHub Actions checks, strict up-to-date policy, mandatory PRs, conversation resolution, no bypass actors, deletion/force-push protection and CodeQL high/error alert blocking. The production gate must also verify effective rules for the released revision. The pages-release environment permits main only, with administrator protection-rule bypass disabled. HB-02 automation boundaries still prohibit automatic merge and test relaxation. HB-05 affects only CSV string serialization; typed numeric outputs and hydraulic methods are unchanged and require regression evidence.

HB-09: [GHSA-4r6h-8v6p-xvw6](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6) documents affected CE versions below 0.19.3; [GHSA-5pgg-2g8v-p4x9](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9) documents versions below 0.20.2. Both machine records omit a fixed npm event because maintained CE builds are distributed outside npm. The hash-verified vendor binary identifies version 0.20.3. `security/dependency-applicability.json` records a narrow not-affected disposition for those two advisories and those exact bytes. CI retains raw matches and validates current advisory ID, modification date, details and affected fields against the reviewed record. Changed advisory content, other versions/bytes and every unreviewed advisory remain release-blocking. This is applicability evaluation, not an accepted vulnerable-version exception or scanner disablement. Regression tests cover each rejection case. No application dependency or engineering method is changed by this correction.

The About register explicitly describes single-maintainer review, available test categories and unavailable independent review. Exact-build security verification remains neutral; no fabricated green security badge is added. Earlier references to independent review in the baseline findings describe the initial proposal, superseded by this authorised policy revision. The residual concentration of code, settings and release authority in one account remains material. Reassess independent review when another maintainer is available.
