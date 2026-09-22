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

- GitHub Pages Workbench run: `35699755269`
- PR head measured: `84309aafc1f3b296559ce6fd6e5c2c3ec17ac198`
- tested PR merge build: `64345aa1ab4d7af04300351f05da17021d1d8695`
- browser evidence artifact: `precision-workbench-evidence-64345aa1ab4d7af04300351f05da17021d1d8695`
- formal comparison artifact: `fastpath-baseline-comparison-64345aa1ab4d7af04300351f05da17021d1d8695`

The pending-import lifecycle hardening is included in this measured head. It changes cancellation/state handoff only and does not alter FastPath parsing, Python methods or native-resolution calculation data.

## Reference-file timing matrix

| Reference source | Bytes | Rows | First preview graph T4−T0 | Preview statistics T5−T0 | Authoritative ready T6−T0 | Preview/Python reconciliation |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| `FM01.fdv` | 311,029 | 20,161 | 427 ms | 1,171 ms | 4,305 ms | matched |
| `StationA_EDM.csv` | 3,156,775 | 105,216 | 514 ms | 943 ms | 8,853 ms | matched |
| `StationA_Rainfall.csv` | 7,089,179 | 349,387 | 919 ms | 1,272 ms | 18,070 ms | matched |
| `StationA_Modelled Data.csv` (first member extracted from supplied ZIP) | 62,884,882 | 1,143,361 | 3,840 ms | 4,130 ms | 55,863 ms | matched |

The selection-to-first-graph browser outcomes, including page/DOM interaction overhead, were 1.272 s, 1.352 s, 2.046 s and 4.205 s respectively. In all four cold/fresh cases the useful FastPath graph appeared before authoritative readiness.

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

- clearing a source while its cold FastPath import is still pending — final state: 0 source rows, 0 registry sources, no recorded errors;
- cancelling/restarting the isolated Python worker while a source is validating — only the already-ready base source remains, with no recorded errors;
- retaining only authoritative-ready sources across that restart;
- preserving and redrawing an existing applied authoritative mapping when a newly imported FastPath preview validates — observed/rain mapping and `fdv-multi-variable` graph mode are unchanged across handoff.

## Formal pre-FastPath comparison

The acceptance workflow checks out baseline `main` at `cb66e762b23c5cd59cf61b42a6c4b52655307cfc` and the PR release artifact side-by-side, serves both locally, and measures them with the same Playwright Chromium runner. Baseline selection waits for its authoritative engine because that historical build rejects imports during worker startup. The PR selection remains cold so it exercises the intended FastPath-before-Pyodide path.

| Reference source | Baseline first graph | PR first graph | Change | PR preview T4−T0 | PR authoritative ready |
| --- | ---: | ---: | ---: | ---: | ---: |
| `FM01.fdv` (0.30 MB) | 1,065 ms | 1,083 ms | −1.7% | 431 ms | 4,978 ms |
| `StationA_EDM.csv` (3.01 MB) | 6,613 ms | 1,058 ms | **84.0% faster** | 620 ms | 10,253 ms |
| `StationA_Rainfall.csv` (6.76 MB) | 18,556 ms | 1,425 ms | **92.3% faster** | 1,138 ms | 21,098 ms |
| `StationA_Modelled Data.csv` (59.97 MB) | 63,612 ms | 4,648 ms | **92.7% faster** | 4,374 ms | 65,569 ms |

The tiny FDV result is reported as measured rather than forced into a universal speed-up claim: its PR first graph was 18 ms slower than the already-warm historical parser, a 1.7% difference. It still produced its internal FastPath paint in 431 ms and did not wait for its own 4,978 ms authoritative boundary. The formal performance gate therefore requires every preview to precede its own authoritative result and requires files of at least 1 MB to beat the historical first-graph time. All mandatory cases passed.

## Interpretation and limitations

These values are CI measurements, not end-user hardware guarantees. Pyodide startup, browser caching, CPU contention and file-system performance can move absolute times. They should be used to verify ordering, scale and regressions rather than as a fixed SLA.

The merge gate is qualitative and architectural as well as numerical:

1. first useful FDV/CSV preview must not wait for Pyodide;
2. large parsing must remain off the UI thread;
3. preview/Python reference contracts must reconcile or warn explicitly;
4. engineering calculations must continue to use authoritative/native-resolution data;
5. unsupported or failed FastPath cases must fall back safely;
6. browser/report/reference regressions must remain green.
