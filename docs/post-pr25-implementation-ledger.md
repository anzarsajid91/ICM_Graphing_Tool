# Post-PR25 implementation and verification ledger

Branch: `fix/post-pr25-navigation-threshold-reports`  
Pull request: #28 (draft; no merge requested)  
Baseline main verified at start: `24fd09ff71b16a32a955ba384a8923d1e2ec2ff3`  
Initial PR28 head: `8ee36618dc6e818557ac1c7a206ff1c6b38ac76a`

This ledger records current-code evidence only. A requirement is not marked **Verified** until the applicable tests/browser evidence have run against the current or later exact head.

| ID | Required behaviour | Current evidence / implementation | Verification evidence | Status |
|---|---|---|---|---|
| BASE-01 | Live repository/PR baseline established | main/PR/CI/changed-file inventory recorded before edits | GitHub PR and workflow inspection | Verified |
| DEF-01 | Correct Depth/Level threshold eligibility and overlays | quantity precedence corrected in Python browser contract, release runtime and project registry; existing PR28 threshold overlay path retained | fresh browser smoke pending | Implemented but unverified |
| DEF-02 | Import preserves current route | existing PR28 import-navigation correction retained | fresh browser smoke pending | Implemented but unverified |
| NAV-01 | Data / Time Series → Spills → Flow Survey → Graphs → Reports | canonical Precision ROUTES restructured in `precision-workbench.js` | precision-shell/Chromium pending | Implemented but unverified |
| NAV-02 | Storage Assessment under Spills | canonical `spills/storage`; legacy Storage route aliases there; no primary Storage workspace | precision-shell pending | Implemented but unverified |
| NAV-03 | Flow Survey exact FDV Check → Rainfall Check → Volume Balance | routes/ownership restructured; rainfall assessment surfaces moved to Rainfall Check without duplicating engines | precision-shell/browser workflow pending | Implemented but unverified |
| NAV-04 | Assessment becomes Graphs | canonical Graphs owns comparison/rating/DWF; old verification routes alias to Graphs | precision-shell pending | Implemented but unverified |
| NAV-05 | Report Generation first/default | Reports route order and report surface order changed | precision-shell pending | Implemented but unverified |
| GRAPH-01 | One authoritative pairing/statistics contract | `compare_series` remains canonical Python path; exposes unit/method/weighting metadata | Python tests/CI pending | Implemented but unverified |
| GRAPH-02 | Professional linear/log scatter | multi-scenario scatter, per-scenario colours, 1:1 line, hover timestamps, raw-scale fitted lines; log filters strictly positive pairs | graph-report unit/browser pending | Implemented but unverified |
| GRAPH-03 | Pearson r, regression R², slope/intercept, bias, RMSE and existing metrics | authoritative Python `calibration_metrics` extended; correlation and regression R² remain separately labelled | Python unit/CI pending | Implemented but unverified |
| GRAPH-04 | Log statistics use log-view eligible sample | Python exports positive-only metrics and filtered count; UI/report consume them | unit/browser pending | Implemented but unverified |
| REPORT-01 | Full declared analysis period, not accidental zoom | report rebuilds native period traces and fixed report layout from declared/source period | downloaded HTML inspection pending | Implemented but unverified |
| REPORT-02 | Scatter/regression sample context in report | selected scatter view, authoritative metrics and filtered count exported | downloaded HTML inspection pending | Implemented but unverified |
| REPORT-03 | © 2026 Anzar Sajid | existing report shell/footer and application footer retained | graph-report/browser pending | Implemented but unverified |
| REF-01 | Real reference data manifest | repo contains FM01–FM08 FDV, RG01–RG04 .R, StationA EDM/rainfall/model ZIP, five Station A HTML reports and FDV reference screenshot | actual workflow execution pending | In progress |
| PERF-01 | Preserve FastPath gates | architecture unchanged; initial branch baseline-performance passed before these changes | exact-head comparison pending | In progress |
| FINAL-01 | Python/JS/build/Chromium/Firefox/exact-head CI green | not yet run on final reconciled head | pending | In progress |
| FINAL-02 | Synchronise with latest main | branch began one commit behind current main | reconciliation pending | In progress |

## Reference-data manifest

The following files are present on the working branch and are approved repository references; using them in an acceptance claim still requires an actual recorded run.

| Purpose | Repository path | Git blob SHA |
|---|---|---|
| FDV flow survey | `reference/current-tool/sample-data/fdv/FM01.fdv` through `FM08.fdv` | FM01 `aa5d10175f81dcc220d2e86197a65070a0cc1443` (individual SHAs retained by Git) |
| Rainfall .R | `reference/current-tool/sample-data/rainfall/RG01.R` through `RG04.R` | RG01 `c4f2f408b321653dd21e2e6e3ed34974c1c82e5b` |
| Association workbook | `reference/current-tool/sample-data/rainfall/fm_rg_assoc.xlsx` | `e8631ef222acbac875a00eb4c649a0e19075a54d` |
| Station A observed EDM | `reference/current-tool/sample-data/other/StationA_EDM.csv` | `6f34d8b7efe19643a3ba6dda9e9991a3e94743c7` |
| Station A rainfall | `reference/current-tool/sample-data/other/StationA_Rainfall.csv` | `cb44651a2a124ff8385160702e8ac741597a11ad` |
| Station A model | `reference/current-tool/sample-data/other/StationA_Modelled Data.zip` | `86b49f505f9314ac89f48972d276a1f40618fe6c` |
| Station A report references | `reference/current-tool/reports/html/StationA_CSO_Spills_2022.html`, 2023, 2024 and two 2024 model-update variants | repository blobs |
| FDV visual reference | `reference/current-tool/reports/screenshots/FDV_Sample_Plots.png` | `30fdbf9a665affa0e50321a74720f5da4d217a48` |

## Continuation record

Current implementation commits after the historical PR28 head:
- `185dc068` — hydraulic quantity precedence and authoritative scatter/regression metrics.
- `84260082` — canonical hydraulic-workflow navigation and legacy-route migration.
- `ae084a0d` — multi-scenario linear/log scatter UI and scenario statistics table.

Next gate: run current CI/browser tests, repair failures, reconcile latest main, execute reference-data/performance acceptance, inspect screenshots and downloaded report, then update this ledger on the exact final head. No merge or production deployment is authorised by this record.
