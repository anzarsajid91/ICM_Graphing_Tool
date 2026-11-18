# HydraBench v2 release assurance

Status on 2026-11-18: **acceptance review remains open**.

The tested product candidate is `9f4d5b215f925c219c0bce5b5713f6d440e78a33`
on [PR #108](https://github.com/anzarsajid91/ICM_Graphing_Tool/pull/108).
All fourteen required checks and the separate CodeQL finding gate passed.
The [candidate workflow](https://github.com/anzarsajid91/ICM_Graphing_Tool/actions/runs/44160522774)
passed Chromium graph/assessment, survey, Detriment and release regression checks,
Firefox shell, browser interactions and performance comparison. Its packaged
preview retained every tested file.

The schematic and annual print report now assign project text through native DOM.
The SVG download serializes the SVG node. CodeQL reports no new alerts in the PR.
Cold and delayed mixed-file import checks preserve the valid sibling and collect
probe-local failure diagnostics. The workflow runner pin to Ubuntu 24.04 is
included in the v2 branch.

## Control results

[The control matrix](hydrabench-v2-control-results.csv) records 743 route/control
identities from the two synthetic CI artifacts, including 691 observed enabled.
The matrix currently reconciles 104 identities to passing assertions or executed
keyboard disclosure checks. The other 639 are explicitly BLOCKED pending
per-control assertion reconciliation or a prerequisite-state outcome check.
These rows include disabled states and repeated shared controls. The matrix does
not infer failure from a missing activation, or acceptance from a recorded click.
The inventory covers buttons, links and disclosures. Input and conditional-state
coverage also requires reconciliation with the workflow tests.

The repaired visual audit discovers canonical routes at runtime and supports
Chromium and Firefox. It checks all 22 routes at four desktop widths and uses
Enter and Space to verify visible disclosure state changes. The synthetic desktop
audit passed on the product candidate in both browsers. Runtime evidence contains
21 idle-state disclosure outcomes per browser.

## Engineering and security evidence

353 Python tests passed during the candidate review, together with JavaScript
unit and privacy suites. The hydraulic browser suite checked full-flow capacity,
two normal-depth solutions, comparison and local export. The spill calendar fixture
matched observed/modelled monthly counts and durations. No hydraulic equation,
unit conversion, validity rule or engineering threshold was changed by these fixes.
Exact equivalence to an external InfoWorks normal-depth result remains unverified.

CI npm and Python audits reported zero indexed vulnerabilities. The browser audit
retained two SheetJS matches with reviewed not-affected dispositions bound to the
vendor bytes and advisory contents. The history and staged secret scans passed.
These checks do not substitute for reviewing repository-wide open alert lists.

On 2026-11-18 the connected integration received HTTP 403 for the complete Code
Scanning and Secret Scanning lists. The Dependabot endpoint reported alerts
disabled. Those are unresolved security-review dependencies. No evidence supports
a claim that all existing repository alerts are clear.

## Issue and release disposition

- Issue #100 stays open. The candidate passes cold and deliberately delayed mixed
  imports. The historical live timeout has no confirmed application root cause.
  Review the deployed evidence before recording final disposition.
- Issue #106 stays open until the repaired workflow runs against an approved new
  production deployment. The previous scheduled failure was Chromium installation
  with Playwright 1.55.1 on Ubuntu 26.04, before application acceptance.
- PR #107 remains open. The candidate includes the runner and Home routing repairs
  and retains the rainfall-operation completion wait. Reconcile the superseded PR
  after the owner chooses the release path.

The baseline public build was verified at v1.071 / `5483d3f` with 106 published
resource hashes and Firefox shell acceptance. The candidate still requires owner
merge approval, the authenticated administrative release record, production CI,
and actual live acceptance. No merge or deployment is performed by this review.
