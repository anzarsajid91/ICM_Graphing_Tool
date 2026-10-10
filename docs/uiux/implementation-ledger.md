# Implementation ledger

| Phase | Baseline contract | Transformation | Sources | Status | Evidence / remaining risk |
|---|---|---|---|---|---|
| 0 | Current main, all supported routes and functions | Architecture, control inventory, reference audit, baseline | docs/uiux, scripts, web/tests | Baseline captured; extended CI running | 295 Python tests + 100 subtests; JS/privacy/source gates pass; 17 live screenshots; Chromium/Firefox workspace interactions and shell plus WebKit startup pass in run 38083426601 |
| 1 | Native controls retain IDs/events | Central tokens, component state showcase | app.css, workbench-v2.css, native showcase | Implemented; browser review pending | Central token aliases; source/privacy gates pass; no handlers or calculation changes |
| 2 | Navigation/docking/scroll persistence | Light shell and coherent navigation | precision-workbench | Implemented; browser review pending | Same DOM docking/state; animated decorative pill; inspector expanded state/inert and Escape/focus return; no chart geometry changes |
| 3 | All 17 pages/conditional controls | Workspace-specific hierarchy and surfaces | v2/survey/workflow/network/detriment; report pending | Workspace surfaces implemented; acceptance pending | Neutral tokens replace decorative palette; semantic colours/coordinates/visibility preserved; report/chart styling next |
| 4 | No recalculation on cosmetic actions | Indicator/opacity motion, resize completion | presentation only | Pending | Reduced-motion and rapid interactions |
| 5 | Exports retain evidence and units | Print/report/accessibility/responsive finish | presentation/report CSS | Pending | No WCAG compliance claim without audit |
| 6 | Exact baseline engineering outputs | Independent verification pass | test harness | Pending | Browser/latency/memory coverage |
| 7 | Main remains live unchanged | Feature PR and same-host preview | existing Pages pattern | Pending | Served revision and production-byte verification |
