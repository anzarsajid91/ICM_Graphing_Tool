# FDV/CSV FastPath performance evidence

PR: #25 — Precision Workbench UI/UX + FDV/CSV FastPath Architecture  
Baseline main: `497fde37b25a3ab6864b161d288cb0aa45f99924`

## Measurement contract

FastPath is a display accelerator only. Browser-side preview parsing may provide structural recognition, display-reduced series and descriptive sample statistics. Python/Pyodide remains authoritative for source parsing, native-resolution engineering data, integration/totals, rainfall events, DWF, comparison metrics, spills, exclusions, storage and reports.

The browser acceptance records monotonic T0–T6 marks:

- T0 — selection/drop accepted
- T1 — bytes available
- T2 — FastPath parse complete
- T3 — preview contract available
- T4 — first useful preview graph painted
- T5 — preview statistics painted
- T6 — authoritative Python parse ready

Every preview-eligible reference source is reconciled against the authoritative parser before specialist analysis is used.

## Reproducible environment

The measurements below come from the exact GitHub Pages release artifact in GitHub Actions, served from a local HTTP server and exercised by Playwright Chromium. Each cold benchmark opens a fresh page. FastPath parsing runs in `fastpath-worker.js`; Pyodide runs independently in `analysis-worker.js`.

Current synthetic measurements are retained by each acceptance workflow run.

The pending-import lifecycle hardening is included in this measured head. It changes cancellation/state handoff only and does not alter FastPath parsing, Python methods or native-resolution calculation data.

## Synthetic performance fixtures

Historical timings and source-specific statistics were removed with the original reference data. Re-measure the current synthetic FDV, HYD, rainfall and large model CSV fixtures; use FastPath/Python parity checks and independent generator expectations. Do not interpret older timings as measurements of the replacement files.

## Failure/fallback evidence

The browser acceptance deliberately replaces the FastPath worker with a throwing worker and verifies that a valid CSV still reaches authoritative `Ready` state with no application error. FastPath disagreement is surfaced diagnostically; it never replaces the Python result.

Lifecycle acceptance also covers:

- clearing a source while its cold FastPath import is still pending — final state: 0 source rows, 0 registry sources, no recorded errors;
- cancelling/restarting the isolated Python worker while a source is validating — only the already-ready base source remains, with no recorded errors;
- retaining only authoritative-ready sources across that restart;
- preserving and redrawing an existing applied authoritative mapping when a newly imported FastPath preview validates — observed/rain mapping and `fdv-multi-variable` graph mode are unchanged across handoff.

## Formal pre-FastPath comparison

The acceptance workflow checks out baseline `main` at `497fde37b25a3ab6864b161d288cb0aa45f99924` and the PR release artifact side-by-side, serves both locally, and measures them with the same Playwright Chromium runner. Baseline selection waits for its authoritative engine because that historical build rejects imports during worker startup. The PR selection remains cold so it exercises the intended FastPath-before-Pyodide path.

The browser gate continues to compare useful preview ordering and large-file performance against the historical application using the same new synthetic fixtures on both sides. Current CI evidence provides the measurements.

## Interpretation and limitations

These values are CI measurements, not end-user hardware guarantees. Pyodide startup, browser caching, CPU contention and file-system performance can move absolute times. They should be used to verify ordering, scale and regressions rather than as a fixed SLA.

The merge gate is qualitative and architectural as well as numerical:

1. first useful FDV/CSV preview must not wait for Pyodide;
2. large parsing must remain off the UI thread;
3. preview/Python reference contracts must reconcile or warn explicitly;
4. engineering calculations must continue to use authoritative/native-resolution data;
5. unsupported or failed FastPath cases must fall back safely;
6. browser/report/reference regressions must remain green.
