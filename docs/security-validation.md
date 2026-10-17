# Candidate security validation — 2026-10-17

This is an honest execution ledger, not a release certificate.

| Check | Observed outcome |
|---|---|
| Current live metadata | v1.066, commit 8c7f59ff94ecdf0c84c5b22f1f9ec6d6d4c38a98 |
| Current GitHub protection/rulesets | main unprotected; no rulesets. Not Enforced |
| Source confidentiality and vendor hashes | Pass: 9 reviewed network-capable sources, 22 pinned dependency files |
| Privacy/claim/artifact negative tests | Pass: 8 Python unittest tests; changed evidence and artifact tampering rejected |
| Browser request guard unit tests | Pass: fixed resources accepted; prohibited methods, destinations, queries, headers/sockets and protected canary rejected |
| Existing JavaScript unit scripts | Pass: 17 scripts matching `web/tests/*-unit.mjs` |
| JavaScript syntax | All `web/assets/*.js` parsed successfully |
| Full Python pytest run | 314 passed; 1 failed because the connector snapshot lacks the baseline Git ancestor needed by the unchanged versioning test. A prior run additionally failed on temporary download fragments; fragments were removed and vendor validation passes |
| Independent numerical benchmark | Linear flow 0.02 → 0.08 m3/s over 600 s: authoritative integral = hand trapezoid = 30.0 m3 |
| Resolved Python dependency scan | pip-audit 2.9.0, requirements-workbench.txt: 31 package identities, no known vulnerabilities returned |
| Fixed browser OSV scan | Failed: two SheetJS advisory matches, retained for independent applicability review; no blanket ignore introduced |
| Browser tooling lock | Playwright 1.55.1 pinned with npm lockfile and integrity hashes; npm reported no audit findings while resolving the lock |
| Workflow source syntax | All workflow YAML parsed; this does not establish GitHub execution |
| Candidate artifact fixture | Build/source/claims/vendor gates passed; 106 staged files matched deterministic integrity manifest. Fixture-only ancestry ledger was used to exercise staging; this is **not** the approved release artifact/version |
| Local browser attempts | Chromium headless-shell with Playwright 1.55.1 passed About interaction/keyboard/layout/content/build identity and no-new-request checks; 25 fixed-resource requests, zero violations. Full Chromium executable initially failed due environment socket restrictions. Firefox could not create a page in this environment; CI Firefox acceptance remains required |
| Cloud browser candidate attempt | Loopback URL reached a different service requiring a bearer token; candidate inaccessible in that environment. No visual acceptance claimed |
| Remote CI | Initial PR #81 runs executed: confidentiality passed; Python/browser/npm scans and SBOM production ran. Browser scan failed on SheetJS applicability; Python scan flagged CI-tool lxml 5.4.0. Dependency review requires enabled Dependency graph. Secret scanner installation path failed before scanning. Candidate fixes module path and updates audit tooling/lxml; reruns required |
| Production deployment | Not attempted: independent review and server enforcement missing; additional findings remain |

Sources for scan evidence use public package names/versions only. Fixtures are independently generated synthetic engineering data. No protected project inputs were uploaded to a scanner, GitHub or an artifact. Complete historical authenticity/secret review and execution of live full-file artifact comparison remain incomplete.

The About test is committed for Chromium/Firefox CI execution. Actual Chromium screenshots are in docs/security-evidence; they show a staging fixture (v1.059 / revision local), not an approved release. Additional Chromium import regression passed: worker/Pyodide boot, CSV import, workspace fingerprint restore, six workspaces and three widths, with 82 observed fixed-resource requests and zero confidentiality violations. Four isolated browser probes (data query, POST body, Beacon and external destination) were intercepted before transport and correctly rejected by the observer. The synthetic EDM/flow-survey reference simulation returned passed=true.

GitHub Actions is the required full-history environment for the version test and candidate release build. Approval must follow final-diff review, executed CI evidence and actual ruleset verification.

## Executed CI on 70ad982 (PR merge revision 150c6bf)

- Data confidentiality, CodeQL (both languages), full reachable-history secret scan, Linux Workbench CI, Pages Python/JS verification, complete Chromium browser-smoke, cross-browser workspace interactions and baseline-performance comparison **passed**. The full-history environment resolved the local versioning-test limitation.
- Audit-tool upgrade remediation was verified: Python dependency audit, npm audit and both SBOM-generation steps passed. Security assurance remained failed solely on the two SheetJS advisory matches; they were not ignored.
- Windows ran 314 tests successfully but the new claim digest check failed because checkout converted JS line endings. Candidate correction adds canonical LF source attributes while retaining exact vendor/reference bytes; hashes are not normalised or bypassed.
- Firefox shell validation rejected the new card's 18 px padding and 10 px heading margin against the existing 8/4 px spacing contract. Candidate correction uses 16 px and 8 px; the spacing test is retained unchanged. Rerun required.
- Dependency graph was enabled and the saved setting was observed through the signed-in browser. Dependency review rerun passed (job 117451538455); its earlier failure predates enablement. Existing GitHub secret protection and push protection were observed enabled.
- The complete production ruleset was prepared, including eleven GitHub Actions checks and CodeQL high/critical alert blocking, but saving requires GitHub account reauthentication. The secure request timed out; subsequent API reads still return main protected=false and no rulesets. **Not Enforced.**
- Additional Dependabot alert/private vulnerability-reporting changes were blocked by automatic approval review due their notification/access scope. They were not enabled. Independent approval and a nominated second reviewer remain outstanding.

No production merge or deployment occurred. The latest correction's CI outcomes must be inspected before treating these fixes as verified.

## Single-maintainer candidate revision — 2026-10-18

The owner authorised single-maintainer release; no independent human approval is claimed. All existing required tests remain enabled. Fresh local checks passed: source confidentiality (nine approved network-capable sources, 22 fixed vendor files), claim digests, all 13 privacy/applicability/artifact tests and all 18 JavaScript unit scripts. Governance tests cover required checks bound to GitHub Actions, strict up-to-date policy, rejected bypass actors, owner merge and exact PR head, including nine negative cases. Applicability tests reject altered advisory fields, unknown advisory IDs, changed versions/packages and vendor tampering. About browser acceptance now requires the explicit single-maintainer/no-independent-review statements.

The complete previous candidate d917bd8 CI was inspected: both Workbench OS suites, Pages verification, Chromium full browser smoke, Firefox shell, browser interactions, performance comparison, dependency review, secrets, confidentiality and both CodeQL analyses passed. Only the browser advisory scan remained failed. These are prior-candidate results, not a claim that the revised candidate or production has passed. New remote CI, exact-build browser screenshots, effective settings verification and deployment outcome must be checked before release. GitHub currently requests account confirmation before saving the prepared fourteen-check production ruleset; no setting success is inferred from the prepared form.
