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

The reusable invalid-input state was hardened against the owner border shorthand: aria-invalid controls retain the governed danger border, and the showcase now asserts its rendered colour in addition to semantic state. Final local Python rerun passed after restoring the scratch test dependencies; no application dependency was changed.

Repeated controlled measurements did not reproduce the earlier large EDM navigation delay. Navigation benchmark now separates steady-state route paint from an in-flight authoritative graph redraw; both original and repeated raw samples remain retained, no slow sample discarded. Native modal/narrow rendered independent QA and full browser gates passed at 0b6172a; final token/cascade/layout checks remain in exact-head CI.

Final independent live QA found three unnamed report-section checkboxes and an overly broad first label. Replaced the wrapping label with a named group and individual native labels; control IDs, saved settings and export handlers unchanged. Browser contracts now require each exact accessible name.

Independent native-name audit of visible controls on all 17 default routes at served `56c16bfb` found only the report-section label group and unnamed saved-workspace select. Both fixed with native per-control labels / a Saved workspace accessible name and exact-name browser assertions. IDs and persistence/export behaviour retained. Closed disclosures and loaded conditional controls were not covered by this final name audit.

Final report-name assertions passed at 8d3950db; strict shell spacing then caught the new group’s inherited 5 px gap. Corrected to the governed 4 px rhythm in CSS. No assertion relaxed; preview stopped before deployment.

### Continuation: additional sidebar/block references and Inter

- Baseline: verified interruption-point remote `e45b4af4fdb06ca7931bdc2ebc907e7960ada2a9`; full review 38124703158, actual live acceptance 38124701433 and performance 38124703165 succeeded. Existing gallery/evidence describes the earlier candidate.
- Transformation: assessed both additional recordings and the sidebar JPEG; documented observed versus inferred treatments. Inset desktop rail, tonal active navigation and independent 16 px evidence blocks preserve existing DOM/event/layout ownership.
- Typography: pinned official Inter 4.1 variable WOFF2 and OFL licence; exact requested stack and 400/500/600 weights; tabular numbers, reduced heading tracking and no forced-uppercase CSS. Lazy fixed-resource font embedding for explicit local reports/prints/PNG/SVG; capture report/view before waiting, retain freshness checks and synchronous popup creation.
- Files: existing owner CSS; design-system helper; runtime report CSS/export presentation; survey print; detriment report; schematic capture/report; reviewed dependency manifest/source approvals; new font unit and rendered/offline font contracts.
- Local evidence: confidentiality source gate (22 vendor files, 9 reviewed sources), five Python privacy tests and JavaScript privacy contracts passed. Font unit covers no eager request, fixed URL/options, retry, concurrent caching and binary embedding. Python suite and all 15 JavaScript unit suites passed locally on continuation; build succeeded. Candidate rendered browser/visual, export and performance checks are pending until their results are recorded.
- Risks: font metrics can change wrapping and print pagination; desktop inset can affect compact rail content bounds. New rendered visual and export acceptance must pass before release. Canonical Python, registry, workers and hydraulic calculations remain unchanged.

Continuation typography review also normalised sidebar, subtab, breadcrumb and report-group captions to sentence case; hydraulic acronyms and route/control IDs remain unchanged. The shell test retains exact ordered caption assertions using the updated visible wording.

### Recovered continuation verification

Local product commits: `69fd15e` (references/Inter), `f42fad3` (sentence case).
- Python suite, all 15 JavaScript unit suites, five privacy source tests and required confidentiality gate passed; Pages build succeeded.
- Rendered contracts passed: Inter faces loaded at 400/500/600, tabular figures, embedded offline report face, keyboard/focus/reduced-motion and contrast checks.
- All 17 routes captured at six widths with zero page errors and zero privacy violations. Final sentence-case shell and 400-node/399-edge geometry/pan/alignment/lock checks passed.
- Loaded synthetic browser acceptance passed against the recovered Inter refinement, including imports/mappings/thresholds/spills/storage/workspaces and offline interactive/printed reports. Request observer recorded 393 requests with zero violations. Existing live-mode harness was pointed at a local build; this is **local evidence**, not a deployed acceptance claim. That build carried the interruption-point metadata token for its privacy test configuration; it included the recovered refinement source. Final caption build was separately reviewed with token `f42fad3`.
- Independent PDF font inventory confirmed embedded InterVariable in exported engineering reports. New font metrics alter wrapping/pagination; historical baseline page-count evidence must not be reused as the new font's pagination result.
- No protected canonical engine, domain registry or worker source changed. No new same-runner performance comparison, exhaustive assistive-technology review or deployed new-head acceptance is claimed.
- Push to the existing feature branch was blocked by automatic approval review: explicit authorization to publish these recovered changes to GitHub was not established. Remote PR76/preview and main remain at their previously verified revisions. Owner approval of this specific push is required before remote CI/deployment can run.

The first final-head CI cold-start gate caught stale title-case caption assertions in legacy browser fixtures. Updated exact navigation/subtab/reattachment wording to the requested sentence case; no workflow/order/structure assertion removed or made case-insensitive. Full new-head gates rerun before merge.
