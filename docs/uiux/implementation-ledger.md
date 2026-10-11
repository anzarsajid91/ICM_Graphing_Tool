# Implementation ledger

Baseline main `dff8ff593e61dbfea142007b5ac32b0d66787f0a`.
Feature branch `feat/unified-premium-uiux`; no merge authorised.

| Phase | Baseline behaviour preserved | Transformation / sources | Status | Verification and remaining risk |
|---|---|---|---|---|
| 0 | Actual release boot, 17 routes, legacy selectors, canonical calculations | Architecture/reference/risk review; source and runtime inventory | Baseline established | All baseline suites passed in 38083426614; synthetic screenshots and outputs retained |
| 1 | Native IDs, actions, options, units and disabled/busy semantics | Central app.css tokens; owner aliases; native showcase | Implemented | Source/privacy/units pass; governed contrast contracts pass; showcase states passed at 4e after fixture correction |
| 2 | Original nodes, docking markers, selected route, scroll and analysis context | Precision shell, light rail, secondary pill, Inspector focus/inert | Implemented and browser tested | Shell/workspace tests and independent keyboard/Back/Inspector pass; no calculations on layout changes |
| 3 Data | File/folder/drop, mappings/unknown units, FDV/rain native plots, settings/exclusions | app/v2/v3/Precision surfaces, compact forms/tables/legend | Implemented; full deployed smoke passed | Source bytes, unit semantics, resolution/datum/threshold persistence preserved |
| 3 Plots | Scatter/log, regression/residual/cumulative/exceedance, rating and DWF | Owner CSS and presentation-only chart helper; empty-state guidance | Implemented; full deployed smoke passed | Trace x/y/unit hashes match baseline; explicit axes/uirevision/no wheel/no slider retained |
| 3 Spills/Storage | Count/duration, annual/monthly/common support, exclusions and screening | Neutral owner surfaces, primary count/duration evidence, compact tables | Implemented; deployed smoke passed | Baseline spill calendar exact; no formula or validity changes |
| 3 Network | Coordinates, connectors/bends, hit tests, pan/zoom, editing/assignment/annual review/restore | Network owner CSS; dialog focus, year buttons, agreement text, local print skin | Implemented; 4e label/annual/full acceptance passed; native modal and narrow fixes revalidating | Prior full editing/annual/layout/live suites pass; no geometry/pointer math changes |
| 3 Survey | FDV/rainfall/volume/monthly; overrides/comments/calculated vs reviewed | Survey/workflow owner tokens and tables | Implemented; full deployed suites passed | Authoritative assessment matches baseline excluding measured timing metadata |
| 3 Detriment | Flooding/Level/Spill A/B, filters/settings/delta/results/exports | Detriment owner CSS, chart/report skin and drawer focus | Implemented; full deployed suites passed | Reference output objects match excluding random source IDs/paths |
| 3 Reports/About | Readiness/section/scenario settings, local export/save/restore, version/Anzar Sajid | Report CSS and calmer framing; same markup/provenance | Implemented; deployed export suites passed | Printed methodology verified; four-period PDF retains baseline 13-page size/layout for fixture |
| 4 | Immediate handlers, stale/loading validity and deliberate graph interactions | 120–220 ms feedback, decorative pill transform, limited reveal, final resize | Implemented and contract tested | No animated engineering numbers, SVG coordinate motion or graph transform; reduced motion tested |
| 5 | Evidence/units/warnings remain reachable on narrow screens | Responsive tabs/rail, solid focus, print-open basis, colour-independent agreement | Implemented; bounded review | Six widths captured; exhaustive screen-reader/zoom/touch/AA gaps remain explicit |
| 6 | Numerical/functional/privacy/performance contracts | Existing full suites plus independent pass, same-runner hashes/timings, conditional control recorder | Verification in progress for final head | No known critical product regression; component/state completeness not inferred from static discovery |
| 7 | Main release and production storage remain unchanged | Draft PR76; same-host isolated preview, exact served SHA + post-deploy suites | Real preview verified and tested; final-head revalidation running | 99 production files unchanged; no merge; unknown independently hosted preview folders require explicit staging input |

Each selector has baseline function, source ownership, visual contract, state,
accessibility and evidence fields in `coverage-matrix.csv`. `runtime-controls.csv`
adds identities actually rendered in synthetic journeys. Missing rendered states
are named; no row is marked exhaustively verified merely because a family is styled.

Phased local commits (remote equivalents in PR history): 0f358c9/76ff7db baseline;
797afd8 foundation; 3f4dc74 shell; 7f97789 workspace owners; 3ce9ae3 charts/reports;
d21d2a7 focus; 4e490f7 spacing/narrow navigation; 33409fc performance contracts;
af16407 actual deployed acceptance/print; 08e3c2c independent polish; db9ace9 explicit
agreement text. Test/preview compatibility fixes are separate reviewable commits.

Caught failures: old preview-prefix regression, strict title/nav minimum and
spacing violation were corrected in product code. Inspector contract fixture and
hidden showcase fixture assumptions were corrected without removing assertions
or changing canonical behaviour. No test was weakened to produce a pass.

Current measured graph comparison is documented in performance-report.md. A slower
full-survey elapsed time in separate baseline/live runners is not used to claim a
UI regression or improvement: complete survey was also compared on one
runner without control-inventory instrumentation (118.2 vs119.8 seconds; normalized results identical). Final release recommendation
requires the final candidate gates and review gaps to be considered explicitly.

Later local commits c99327d (narrow empty instruction), 2179705 (native modal background isolation) and 8348c08 (separate synchronous/paint timing) are individually reviewable. Remaining navigation timing exception and exhaustive acceptance gaps are explicit in performance/coverage/accessibility reports.

A live accessibility-tree check revealed plot-only empty guidance exposed outside Plots. Route-scoped pseudo content now prevents irrelevant guidance on Data/assessments; a new contract asserts absence on Data and presence on empty Comparison. No display/route/Plotly handler changed.
