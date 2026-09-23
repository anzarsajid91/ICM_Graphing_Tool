# Post-PR25 implementation and verification ledger

Branch: `fix/post-pr25-final-acceptance-closeout`  
Pull request: #30 — **Post-PR25 final acceptance close-out**  
Current main baseline for this close-out: `9b871bb30c9fdfc1d6dbbff50e2d67f01be75e0e`  
Successor purpose: close the mandatory requirements in `ICM_Post_PR25_Enhanced_Implementation_Prompt.md` after PR #28 without weakening the PR25 engineering/FastPath contracts.

This ledger records repository evidence for the successor close-out. The exact final verified head and final workflow run IDs are intentionally recorded in the PR description/handoff after the last code/document commit, because writing them into this tracked file would itself create a newer unverified head.

Status meanings: **Verified** = evidenced on the applicable current/later build; **Implemented but unverified** = code/tests are present but the final exact-head acceptance rerun is still required; **Blocked** = an external input/action is required.

| ID | Required behaviour | Implementation / evidence location | Verification status |
|---|---|---|---|
| BASE-01 | Live branch/PR/main baseline established and branch kept isolated | PR #30; branch `fix/post-pr25-final-acceptance-closeout`; compare against `main` | Verified |
| BASE-02 | Branch synchronised with current main before final decision | compare currently reports 0 commits behind main | Verified; recheck at final gate |
| ARCH-01 | Python/Pyodide remains authoritative; FastPath is preview/display only | existing worker/Python bridges retained; FastPath reconciliation tests preserved | Implemented but unverified on final head |
| ARCH-02 | Native-resolution calculations, timestep/gap/DST/units/exclusions/spill-counting preserved | Python regression suite + browser numerical parity + existing PR25 gate | Implemented but unverified on final head |
| DEF-THR-01 | Observed threshold only for applicable Depth/Level; Flow/Velocity ineligible | quantity-aware threshold context in runtime/workbench graph code; browser matrix tests | Implemented but unverified on final head |
| DEF-THR-02 | Model threshold only for applicable model Depth/Level, including model-only workflow | model-only graph/spill/report support and browser test | Implemented but unverified on final head |
| DEF-THR-03 | Zero/negative/out-of-range values, datum/unit context, incompatible remapping and immediate overlay | threshold context/reconciliation; Station A `m AD`; edge-case browser tests | Implemented but unverified on final head |
| DEF-THR-04 | Same threshold value reaches control, graph, calculation and report; changes stale dependent results | canonical spill threshold state, dependency signatures, Station A chain test | Implemented but unverified on final head |
| DEF-IMP-01 | File input preserves current workspace/subtab | route-continuity browser cases across Spills, Flow Survey, Graphs and Reports | Implemented but unverified on final head |
| DEF-IMP-02 | Folder import and drag/drop preserve route; valid siblings survive malformed files | real-directory folder test, drag/drop route assertion, malformed-sibling regression | Implemented but unverified on final head |
| NAV-01 | Principal order: Data / Time Series → Spills → Flow Survey → Graphs → Reports | `web/assets/precision-workbench.js` ROUTES | Implemented but unverified on final head |
| NAV-02 | Storage Assessment belongs under Spills; old Storage routes migrate | canonical `spills/storage` + route aliases/workspace migration | Implemented but unverified on final head |
| NAV-03 | Flow Survey exact order FDV Check → Rainfall Check → Volume Balance | canonical survey route order and owned surfaces | Implemented but unverified on final head |
| NAV-04 | Assessment becomes Graphs while comparison/rating/DWF remain reachable | canonical Graphs workspace + old verification aliases | Implemented but unverified on final head |
| NAV-05 | Reports opens on Report Generation; workspace save/restore follows | canonical Reports route order and report-owned surfaces | Implemented but unverified on final head |
| NAV-06 | Back/Forward, deep links and keyboard subtab order/focus work | pushState/popstate route handling; rebuilt-tab focus restoration; explicit focus ring fallback | Implemented but unverified on final head |
| GRAPH-01 | One authoritative pairing contract for scatter/statistics/report | Python `compare_series` results reused; no independent JS engineering formula | Implemented but unverified on final head |
| GRAPH-02 | Professional linear/log scatter, observed X/model Y, 1:1, fitted lines, hover timestamp/context | `runtime.release.js`; graph/report unit and browser tests | Implemented but unverified on final head |
| GRAPH-03 | Log view filters nonpositive pairs without mutating source data and reports filtered count | positive-pair metrics/filtering + fitted-line clipping regression | Implemented but unverified on final head |
| GRAPH-04 | Pearson r, regression R², slope/intercept, bias, RMSE and retained MAE/NSE/KGE with validity reasons | authoritative Python metrics exposed through comparison result | Implemented but unverified on final head |
| GRAPH-05 | Multiple scenarios retain distinct colours/support and remain contained with long names | multi-scenario browser scatter/table/legend test | Implemented but unverified on final head |
| GRAPH-06 | Native-resolution zoom retained; no mini range slider; 200% zoom usable | adaptive zoom/browser density checks and explicit 200% shell acceptance | Implemented but unverified on final head |
| REPORT-01 | Report Generation exposes section/scenario/scatter options and readiness before export | report options/state persistence + semantic readiness panel | Implemented but unverified on final head |
| REPORT-02 | Readiness distinguishes Current/Stale/Partial/Not run/Blocked/Error with reasons | `workbench-survey.js` readiness classification and UI regression | Implemented but unverified on final head |
| REPORT-03 | Export uses coherent authoritative snapshot and rejects stale selected results | dependency signatures + report freshness guard | Implemented but unverified on final head |
| REPORT-04 | Selected scenario subset and linear/log scatter are honoured in report | report-specific scatter and browser payload assertions | Implemented but unverified on final head |
| REPORT-05 | Full-period graph uses declared/source period, not accidental screen zoom | timezone-neutral report period and rebuilt authoritative report traces | Implemented but unverified on final head |
| REPORT-06 | Station A-style downloaded HTML/print layout: rainfall visible, metrics integrated, tables/legends contained | independent report browser/print/PDF acceptance | Implemented but unverified on final head |
| REPORT-07 | © 2026 Anzar Sajid and source/build/provenance retained | application/report footer and audit appendix tests | Implemented but unverified on final head |
| STATE-01 | Dependency signatures include mappings, units, period, thresholds, exclusions and project/survey context | analysis/rating/spill/storage/survey signatures | Implemented but unverified on final head |
| STATE-02 | Association rows/source/topology and criteria changes stale survey outputs; late async results discarded | survey dependency signatures/generation guards and browser regressions | Implemented but unverified on final head |
| STATE-03 | Supported older workspaces/routes migrate; missing/changed sources guide reattachment; unsupported schemas fail safely | schema v1/v2/v3 migration and workspace browser acceptance | Implemented but unverified on final head |
| UX-01 | Apple-inspired restrained graph-first hierarchy, progressive disclosure and contextual controls preserved | Precision shell/CSS and route ownership | Implemented but unverified on final head |
| UX-02 | Responsive widths, narrow layout, keyboard focus, table containment and no document overflow | Precision shell/Chromium acceptance | Implemented but unverified on final head |
| REF-01 | Real FDV/R/Station A reference inputs are exercised, not merely listed | reference manifest below + CI/browser/performance scripts | Implemented but unverified on final head |
| REF-02 | Station A HYD-in-CSV content is recognised by signature and preserves Level · m · AD | `src/icm_workbench/parsers/csv.py` + unit/browser tests | Implemented but unverified on final head |
| PERF-01 | Repeated same-runner FastPath baseline comparison with median/range and practical-file gate | `web/tests/baseline-comparison.mjs`, sample size 3 | Implemented but unverified on final head |
| PERF-02 | Navigation/scatter responsiveness and memory evidence retained where available | performance evidence JSON/browser assertions | Implemented but unverified on final head |
| FINAL-01 | Python/JS/build/reference validation green on exact final head | Workbench CI + Pages verify | Pending final exact-head run |
| FINAL-02 | Chromium complete workflow green on exact final head | Pages `browser-smoke` | Pending final exact-head run |
| FINAL-03 | Firefox Precision shell/focus green on exact final head | Pages `browser-firefox-shell` | Pending final exact-head run |
| FINAL-04 | FastPath performance comparison green on exact final head | Pages `baseline-performance` | Pending final exact-head run |
| FINAL-05 | Required screenshots/downloaded report visually inspected on exact final head | retained Pages evidence artifact | Pending final exact-head review |
| FINAL-06 | No unresolved review threads; PR mergeable; latest main rechecked | GitHub PR metadata | Pending final gate |
| FINAL-07 | Merge/deployment only after explicit user authorisation | PR remains Draft and unmerged during verification | Verified process constraint |

## Canonical feature migration map

| Historical destination | Canonical destination |
|---|---|
| Data / Sources | Data / Time Series → Sources |
| Data / Mapping | Data / Time Series → Series Mapping |
| Data / Graph | Data / Time Series → Time Series |
| Spills / Thresholds or Results | Spills → Spill Assessment |
| Standalone / Verification Storage | Spills → Storage Assessment |
| Survey / Data Health | Flow Survey → FDV Check |
| Survey / Rainfall Response and Rainfall / Events | Flow Survey → Rainfall Check |
| Survey / Flow Continuity | Flow Survey → Volume Balance |
| Assessment / Verification Comparison | Graphs → Observed vs Modelled |
| Verification / Rating | Graphs → Depth / Rating |
| Verification / DWF | Graphs → DWF |
| Report / Builder | Reports → Report Generation |
| Report / Workspace | Reports → Workspace Save / Restore |

Old route aliases remain intentionally supported so bookmarks/workspaces migrate without duplicate tool ownership.

## Reference-data manifest

These approved repository references are the acceptance sources actually targeted by CI/browser/performance workflows:

| Purpose | Repository path | Reference identity |
|---|---|---|
| FDV flow survey | `reference/current-tool/sample-data/fdv/FM01.fdv` through `FM08.fdv` | FM01 blob `aa5d10175f81dcc220d2e86197a65070a0cc1443` |
| Rainfall .R | `reference/current-tool/sample-data/rainfall/RG01.R` through `RG04.R` | RG01 blob `c4f2f408b321653dd21e2e6e3ed34974c1c82e5b` |
| Association workbook | `reference/current-tool/sample-data/rainfall/fm_rg_assoc.xlsx` | blob `e8631ef222acbac875a00eb4c649a0e19075a54d` |
| Station A observed EDM | `reference/current-tool/sample-data/other/StationA_EDM.csv` | blob `6f34d8b7efe19643a3ba6dda9e9991a3e94743c7` |
| Station A rainfall | `reference/current-tool/sample-data/other/StationA_Rainfall.csv` | blob `cb44651a2a124ff8385160702e8ac741597a11ad` |
| Station A model | `reference/current-tool/sample-data/other/StationA_Modelled Data.zip` | blob `86b49f505f9314ac89f48972d276a1f40618fe6c` |
| Station A reference reports | `reference/current-tool/reports/html/StationA_CSO_Spills_*.html` | repository reference set |
| FDV visual reference | `reference/current-tool/reports/screenshots/FDV_Sample_Plots.png` | blob `30fdbf9a665affa0e50321a74720f5da4d217a48` |

Station A threshold-chain acceptance selects the HYD payload by parsed hydraulic quantity, verifies Level / m / AD metadata, chooses a finite in-support threshold, then requires that identical value in the Time Series control/overlay, Spill calculation snapshot and exported report.

## Close-out continuation record

The successor branch contains cohesive commits covering: single navigation ownership; browser history/keyboard routing; quantity/reference-safe thresholds; model-only and rainfall-only workflows; complete result dependency signatures; late-result rejection; report section/scenario/scatter selection; semantic readiness states; workspace migration/reattachment safety; Station A HYD datum handling; malformed-import isolation; drag/drop/folder route continuity; multi-scenario/long-legend acceptance; repeated FastPath benchmarking; print/PDF checks; and explicit 200% zoom coverage.

The latest pre-ledger browser findings were:
- Firefox keyboard focus was restored to the correct rebuilt subtab but lacked a computed visible outline; corrected with a secondary-navigation cross-browser focus-ring fallback.
- Chromium folder-route acceptance attempted to feed an in-memory file to a `webkitdirectory` input; corrected to exercise a real temporary directory, preserving the product requirement rather than weakening it.

**Next action:** after these documentation updates are committed, run the complete exact-head Workbench CI and GitHub Pages acceptance set. Repair any concrete failure. Only when Python/JS/build/reference, Chromium, Firefox, performance and retained visual/report evidence are green should PR #30 be updated with final evidence and considered for Ready for Review. No merge is authorised by this ledger.
