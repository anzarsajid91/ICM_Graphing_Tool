# FDV/CSV FastPath performance evidence

PR: #25 — Precision Workbench UI/UX + FDV/CSV FastPath Architecture  
Baseline main: `cb66e762b23c5cd59cf61b42a6c4b52655307cfc`

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

Evidence source:

- GitHub Pages Workbench run: `35625923843`
- PR head measured: `7d4a94e93768defb199784e297c96e247983448e`
- tested PR merge build: `562c1793901e9ddddba7aff63f03d4f9c1e3328d`
- browser evidence artifact: `precision-workbench-evidence-562c1793901e9ddddba7aff63f03d4f9c1e3328d`

The subsequent pending-import lifecycle hardening changes only cancellation/state handoff and does not alter FastPath parsing, Python methods or native-resolution calculation data. A fresh exact-head browser run is required before PR handover.

## Reference-file timing matrix

| Reference source | Bytes | Rows | First preview graph T4−T0 | Preview statistics T5−T0 | Authoritative ready T6−T0 | Preview/Python reconciliation |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| `FM01.fdv` | 311,029 | 20,161 | 614 ms | 1,480 ms | 6,386 ms | matched |
| `StationA_EDM.csv` | 3,156,775 | 105,216 | 913 ms | 1,726 ms | 17,808 ms | matched |
| `StationA_Rainfall.csv` | 7,089,179 | 349,387 | 1,316 ms | 1,710 ms | 38,919 ms | matched |
| `StationA_Modelled Data.csv` (first member extracted from supplied ZIP) | 62,884,882 | 1,143,361 | 5,248 ms | 5,593 ms | 127,003 ms | matched |

The selection-to-first-graph browser outcomes, including page/DOM interaction overhead, were 1.661 s, 2.337 s, 2.816 s and 5.680 s respectively. In all four cold/fresh cases the useful FastPath graph appeared before authoritative readiness.

For the supplied model archive, the acceptance test extracts the first CSV member and uploads that CSV because ZIP ingestion is not a product feature in this PR. The FastPath preview hides the auxiliary `Seconds` column and reconciles the exposed engineering-series contract with Python.

## Reference correctness evidence

`FM01.fdv` authoritative/native statistics remain independently regression-checked, including:

- flow arithmetic mean: `0.1289310550071921 m³/s`
- depth arithmetic mean: approximately `0.18822851049055 m`
- velocity arithmetic mean: approximately `0.88046426268538 m/s`
- native integrated flow total in the reference graph/report workflow: `311,912.16 m³`

The supplied `RG01.R` workflow remains authoritative-only in this PR. The supplied Station A rainfall CSV remains unit-unresolved in FastPath unless explicit semantics establish a unit; no dimensional rainfall total is produced by the preview.

## Failure/fallback evidence

The browser acceptance deliberately replaces the FastPath worker with a throwing worker and verifies that a valid CSV still reaches authoritative `Ready` state with no application error. FastPath disagreement is surfaced diagnostically; it never replaces the Python result.

Lifecycle acceptance also covers:

- clearing a source while its cold FastPath import is still pending;
- cancelling/restarting the isolated Python worker while a source is validating;
- retaining only authoritative-ready sources across that restart;
- preserving and redrawing an existing applied authoritative mapping when a newly imported FastPath preview validates.

## Baseline limitation

A pre-FastPath, authoritative-only timing artifact was not retained before implementation. Therefore this PR does **not** claim a historical percentage speed-up or a fabricated before/after ratio.

The defensible comparison is the measured same-build boundary between first useful FastPath paint and authoritative readiness. The design baseline is architectural: main previously gated import/graph availability on Pyodide readiness and authoritative parsing. Current acceptance demonstrates the preview graph before that boundary while leaving authoritative calculations unchanged.

## Interpretation and limitations

These values are CI measurements, not end-user hardware guarantees. Pyodide startup, browser caching, CPU contention and file-system performance can move absolute times. They should be used to verify ordering, scale and regressions rather than as a fixed SLA.

The merge gate is qualitative and architectural as well as numerical:

1. first useful FDV/CSV preview must not wait for Pyodide;
2. large parsing must remain off the UI thread;
3. preview/Python reference contracts must reconcile or warn explicitly;
4. engineering calculations must continue to use authoritative/native-resolution data;
5. unsupported or failed FastPath cases must fall back safely;
6. browser/report/reference regressions must remain green.
