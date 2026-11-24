# Hydra Bench v3.0.1 dual-expert review

## A. Executive assessment

The target is the live v3.0.1 release at
`ccc36427c12f003e5d9b1fee61632770b31952cc`, merged in PR #120. The product is
a static browser workbench with authoritative Python calculations in a worker,
fast-path previews, a shared local project registry and separate workspace
controllers. Reviewers check current operator behaviour and the matching source
independently. Existing release verification provides the baseline identity.
[Live app](https://anzarsajid91.github.io/ICM_Graphing_Tool/) ·
[Production verification](https://github.com/anzarsajid91/ICM_Graphing_Tool/actions/runs/45384027648)

The hydraulic methods supported the independently checked reference
calculations and ordinary workflows. Four high-priority defects affect
engineering interpretation in Flow Survey, Verification, Detriment and
directional network review. Two high-priority usability defects impede
routine reporting and exact keyboard inspection. Treat the affected workflows
as unable to support an uncaveated decision until corrected and reassessed.
The broader evidence supports continued investigation and screening within
the documented method limits. The next candidate needs verified fixes and
both specialist approvals.

The reviewers worked in separate contexts and locked their original records
before exchange. Agent A checked browser behaviour, exact source and independent
arithmetic, and ran 18 guarded live browser scenarios, 89 focused engineering
unit tests and 28 privacy unit tests. Agent B reviewed all workspaces in desktop
Chromium and Firefox and completed eight populated journeys covering
import, analysis, export and recovery. The coordinator independently reproduced
the three-view comparison and inspected the Strategic SVG. The verification
protected fixed-resource requests in the exercised flows, and Agent A checked
153 deployed resource hashes.
[Technical first pass](technical/technical-review.md) ·
[Design first pass](design/INDEPENDENT-REVIEW.md) ·
[Schematic capture](evidence/README.md)

The evidence is synthetic. Boundaries include licensed ICM execution, native
export variants, actual field surveys and project sign-off, full parameter and
report permutations, screen reader speech, mobile, enterprise browser policies
and organisation approval. Inspect further when the next candidate changes
these areas or a project depends on them. Reviewers are independent AI
specialists, and the engineering judgement records do not convey human
certification. The [tracker](tracker.md) stores the review checkpoint.

## B. Workspace assessment

| Workspace and intended decision | Observed behaviour and technical assessment | UI/UX assessment and action |
| --- | --- | --- |
| **Home** · Find suitable workflows and understand readiness | The guarded synthetic import moved the ready-source count from zero to one. Recent activity reopened the profile and note in-tab. Reload retained the remembered route and cleared the active data/profile context. The ICM toolkit discloses licensed-runtime limitations. | The six guided routes give useful entry points. Make prerequisite recovery equally direct when people open a downstream work surface first. Cover remembered routes with missing source reattachment. DE-10. [Technical Home check](technical/regression/project-home-smoke.log) · [Home view](design/screens/01-home-default-chromium.jpg) |
| **Data / Time Series** · Interpret and assign local evidence before analysis | Valid imports survived a malformed companion. Reviewed parsing covered sentinel, duplicate-clock, units, equivalent 12 mm rainfall encodings and invalid negative rainfall. Preserve source time semantics after mapping. | Chart readout requires a pointer for exact point selection. A rainfall event input clips at 1024 px. Provide bounded keyboard selection and responsive control layout. DE-05, DE-06. [Series quality](technical/regression/series-quality-smoke.log) · [Loaded chart](design/screens/journey-data-chart-chromium.jpg) |
| **Spills and storage** · Quantify event and reporting impacts and screen storage | The hand check distinguished 24 h and 48 h duration, occupied-window counts 2 and 3, and 8,640 and 17,280 m³ at outward 0.1 m³/s. The 10 s storage case reconciled 10 m³ inflow with 7.5 m³ passed and 2.5 m³ excess. Large gaps and stale input disabled unsupported outputs. | Physical discharges and 12/24 counts are distinguishable. Keep routing and assessment entry points separate and carry eligibility into partial report preparation. DE-11. [Scenario check](technical/regression/spill-scenarios-smoke.ram.log) · [Storage proof](technical/regression/storage-routing-smoke.ram.log) |
| **Network Schematic** · Review field geometry, engineering connectivity and communication diagrams | A 101-node native fixture preserved all source edges, reach members and two typed monitors. Engineering separated the CSO continuation and pumped paths. Strategic folded 9- and 6-node feeders. Detailed and Long section misinterpreted an explicitly unconfirmed link in a separate three-node test. | Detailed is useful for source plan investigation with zoom and search. Engineering is clearer for tracing. Strategic helps communicate grouped feeders, with weaker differentiation on this fixture. Narrow inspector and publication context reduce readability. DE-04, DE-07, DE-08, DE-10. [Three live views](evidence/README.md) · [Directional test](technical/observations-chromium-direction.json) |
| **Simulation results** · Inspect exact signed model samples and their context | Corrected duplicate timestamps and retained typed time/asset association, conversion, zero and Missing separately from negative −0.4 m³/s. Independent check covered native local intake and bounds. | Recoverable deferred load and input replacement. The keyboard slider shows the correct visible result and exposes only an index as its accessible value. Expose selected time and value. DE-09. [Native intake check](technical/regression/simulation-results-smoke.log) · [Playback screen](design/screens/journey-results-review-chromium.jpg) |
| **Flow Survey** · Qualify survey evidence and compare stations on a consistent basis | The independent half-full 1 m diameter calculation at 1.2 m/s gave 0.4712389 m³/s and the flagged +90.9859% difference from the recorded 0.9 m³/s. Volume balance falsely compared unequal retained periods. Field judgements still require survey context. | Explicit status is useful on the survey tabs. A first-time reviewer can struggle to locate associations. Explain common evidence and next required inputs. DE-02, DE-10. [Survey observations](technical/observations-chromium-survey.json) · [Survey entry](design/screens/12-survey-default-chromium.jpg) |
| **Verification** · Compare observed/modelled performance on defensible support | Full-event calculations matched hand totals 180/192 m³ with +10% peak, +6.6667% volume and zero lag. Event matrix with incomplete common coverage withheld full-event criteria. Overview allowed Acceptable with one pair and zero shared interval. | The complete workflow retained the decision and comment. Help users recover missing assignment and distinguish exploratory point diagnostics from formal judgement. DE-01, DE-10, DE-11. [Comparison screen](technical/chromium-verification.jpg) · [Matrix proof](technical/regression/verification-matrix-smoke.log) |
| **Hydraulic Calculations** · Produce transparent screening calculations | For a 950 m pipe, 0.31 m diameter, 0.053 m³/s, f = 0.021, K = 3.75 and −2 m static head, the independent Darcy reference was 0.702203 m/s, 1.617915 m friction, 0.094277 m minor loss and −0.287808 m signed total head. Full-precision worksheet/report matched. The populated capacity trial retained two normal depths. | Methods, units and assumptions were visible. Preserve efficient result and assumption scanning as supported calculators grow. No change proposed in this cycle. [Hydraulic design](technical/regression/hydraulic-design-smoke.ram.log) · [Capacity trial](design/screens/journey-hydraulics-result-chromium.jpg) |
| **Detriment** · Compare baseline/proposed criteria and retain auditable evidence | Tested flooded/level/spill comparisons, matched basis and export. The level reference found a +0.30 m rise and a 0.35 m proposed freeboard against 0.50 m. Missing one spill statistic suppressed supported adverse evidence in the other. | Clear baseline/proposed and Data entry. Current-view HTML table and chart used different asset scopes. Repair that verified mismatch before clarifying export labels. DE-03, DE-15, DE-13. [Audited spill CSV](technical/chromium-detriment-export.csv) · [Scoped export](technical/cross-export-cohort.json) |
| **Reports** · Save interpretation, scope and traceable inputs for review | Offline assessment displayed two charts, provenance and retained verification reference. The calculation sheet kept exact app/worker revisions and head. Editing inputs invalidated a stale worksheet. Reopen without original files reported 0/4 matching fingerprints. | Reports options clips an action at 1024 px. Current Partial summaries describe freshness but omit the missing basis. Retain truthful partial export and explicit reattachment. DE-05, DE-11. [Report controls](design/screens/a11y-report-1024-chromium.jpg) · [Rendered report](design/screens/journey-report-export-chromium.jpg) |
| **About and IT Security** · Confirm identity, local handling and relevant assurance | Footer, source and build agreed. Eight displayed claims were checked, including fixed downloads and local storage boundaries. Exact assurance explicitly awaited the current build. | Readable limits and accessible routes. Give the engineer direct access to the exact-SHA production record while preserving honest candidate and missing states. DE-14. [Security view](design/screens/journey-it-security-chromium.jpg) · [Live check](technical/regression/security-about-smoke.log) |
| **Shared project workflow** · Move through workspaces with a single evidence and review basis | Tests exercised the local typed pool, reviewed source roles, monitor mapping, stale-result controls, asset revisions and offline export. No violations were observed in the tested request flows. Reopening may require source files again. | Back navigation, arrow-key tabs and focus styling work. A keyboard-first skip target and consistent prerequisite actions reduce repetitive navigation. Review narrow rails and zoom. DE-05, DE-10, DE-12. [Browser inventory](design/logs/inventory-chromium.json) · [Revision proof](technical/regression/assessment-revision-smoke.ram.log) |

## C. Consolidated implementation backlog

Each entry has a stable implementation ID. The original specialist IDs remain
in the independent records. The [decision record](reconciliation.md) records
reviewer ownership, cross-review disposition and unresolved project decisions.

### DE-01 · Gate Verification decisions on jointly supported evidence

- A-02 · Verified engineering defect · High severity / P1, release-blocking.
  Use the [observed](technical/A-TECH-observed.csv) and
  [modelled](technical/A-TECH-model.csv) series in Verification Overview.
  Their valid 120 s intervals touch at one timestamp in a 240 s request.
  The live screen shows 50% Eligible support and RMSE 0 m³/s for one matched
  point. It saves Acceptable without a note. The common interval duration is
  zero. Reproduced in Chromium and Firefox. [Captured decision](technical/chromium-verification.jpg)
- In `src/icm_workbench/browser_api.py`, the current minimum individual
  fraction is an upper bound on common coverage. The current decision rule in
  `web/assets/precision-workbench.js` treats a partial result with one pair
  as reviewable without further evidence requirements.
- Use authoritative common valid intervals with existing clock offset, gap,
  boundary and exclusion rules. Show requested duration, common duration,
  pair count and interpretation separately. Keep matched-point statistics
  with their denominator. For zero common duration, disable Acceptable and
  allow a saved Insufficient evidence or investigation record. Where a
  method-approved, recorded project policy for partial evidence already
  exists, use it only for a caveated outcome and show its rationale beside
  the decision. Uncaveated Acceptable needs the full requested duration and
  a confirmed comparable basis. Both require at least two distinct qualifying
  paired timestamps associated with joint support and any stronger documented
  project checks. A caveated decision also needs positive joint duration,
  an approved project basis and a reason. Preserve explicit analysis bounds
  or the existing overlap-of-extents default. Show requested, excluded,
  eligible and common seconds. A plot-only viewport does not change the
  basis. Add no default project-specific percentage threshold.
- For the fixture, show 0/240 s, one matched point, RMSE 0 m³/s for that point
  and insufficient decision evidence. Test complete, partial and disjoint
  windows, asymmetric gaps/exclusions, offsets, and all saved decisions.
  Advance evidence identity and invalidate affected verification decisions and
  dependent reports and overlays. Verify both browser states and the export.

### DE-02 · Reconcile survey station volumes over the same valid intervals

- A-01 · Verified engineering defect · High severity / P1, release-blocking.
  Run Flow Survey Volume balance for
  [FM01](technical/FM01.FDV) upstream of [FM02](technical/FM02.FDV) using the
  [association workbook](technical/A-TECH-survey-associations.xlsx).
  Load it through the dedicated association chooser or name the local copy
  `fm_rg_assoc.xlsx` for bulk recognition.
  Both carry constant 0.1 m³/s over 240 s. Exclude only the first 120 s
  upstream, then repeat with only the downstream excluded. Current output
  reports 2.000 Green or 0.500 Red at 100% support. Correct common support in
  both cases is 120 s and 12/12 m³. [Browser measurements](technical/observations-chromium-survey.json)
- The weekly method in `src/icm_workbench/analysis/survey_context.py`
  compares independently integrated totals and uses the minimum individual
  coverage. Both masks can be individually complete on unequal retained
  periods.
- Compute the intersection of valid intervals over all required stations
  after per-source exclusions. Integrate the required stations over those
  same intervals using the applicable source rules. Keep requested/common
  seconds, eligible retained seconds, exclusions and original source-specific
  support separate. Show the partial-window ratio as a diagnostic. Preserve
  the documented Green rule over complete approved retained support, qualified
  as retained-period screening. Use the original requested seconds for
  requested coverage. A one-sided approval and a derived common mask do not
  on their own authorise a formal whole-week RAG. Withhold the formal decision
  unless the verified existing policy covers the aligned basis. Carry the
  common basis and status to monthly, schematic, report and export consumers.
- Confirm 24/24 m³ and 1.000 on the full case, 12/12 m³ and 1.000 on both
  asymmetric variants, and unavailable on disjoint support. Verify no false
  inflow or loss diagnosis on the fixture. Test multi-tributary paths,
  incomplete downstream evidence, unequal time steps and week boundaries.
  Preserve the symmetric approved-exclusion Green case in
  `tests/unit/test_survey_context.py` and original per-monitor exclusions in
  `tests/unit/test_survey_scope_integrity.py`.
  Keep legacy signed FSAT rules, monthly reports, provenance and valid saved
  associations. Advance affected evidence identity and revalidate in both browsers.

### DE-03 · Preserve individually supported spill detriment criteria

- A-03 · Verified engineering defect · High severity / P1, release-blocking.
  Load the [baseline](technical/A-TECH-spill-baseline.csv) and
  [proposed](technical/A-TECH-spill-proposed.csv) summary fixtures. Choose the
  matched period, zero tolerances and the either-criterion policy. COUNT has
  +3 spills with unavailable duration. DURATION has +2.25 h with unavailable
  count. Live v3.0.1 marks both criteria and both combined rows Unavailable.
  [Current audited CSV](technical/chromium-detriment-export.csv)
- The shared-availability branch in `src/icm_workbench/detriment_api.py`
  classifies both criteria as unavailable when either delta is absent.
- Evaluate each criterion whenever its paired inputs and method scope are
  eligible. For the either-criterion policy, preserve Detriment for a
  known breach strictly above that criterion's tolerance, with a companion
  Unavailable marker. A positive increase within tolerance remains independent
  Risk. An unchanged, improved or within-tolerance known result plus an
  unavailable companion leaves the combined result unresolved. For count-primary, retain the
  supported count-only policy state and mark incomplete secondary evidence.
  A missing count with supported duration-only detriment remains an unresolved
  count-primary result and shows the adverse duration as a separate criterion.
  In a legacy workspace, a known count increase still satisfies the original
  adverse count rule even if duration is missing. Other partial legacy results
  remain unresolved and expose their supported criterion. Preserve all
  complete-case classifications. Report missing-criterion and adverse
  evidence as separate, potentially overlapping totals.
- Show COUNT detriment +3 spills and DURATION detriment +2.25 h with the
  missing companion. Verify rollups, filters, map hotspots, CSV/HTML and
  both browsers. Test missing data from each side, unmatched IDs, threshold
  boundaries and all supported policy modes. Keep raw evidence and declared
  analysis scope. Resolve this before DE-13.

### DE-04 · Use one nominal direction contract from import through long section

- A-04 · Verified engineering defect · High severity / P1, release-blocking.
  Import the [three-node direction fixture](technical/network-direction.csv).
  A–B explicitly has `flow_direction=Unknown`. Engineering and Strategic
  show an unconfirmed dotted link. Detailed shows an arrow and Long section
  accepts A–C as two ordered links. [Route evidence](technical/observations-chromium-direction.json)
- Native import keeps the raw field. Projection interprets it independently
  of the canonical direction used by Detailed and
  `web/assets/network-review-core.js`. Move interpretation to a shared
  engineer-reviewed canonical contract and retain source provenance.
- Render the same explicit uncertainty in all three views and their exports.
  Trace nominal paths using the shared contract. Require a confirmed
  forward route for a signed directional long section. An unconfirmed
  connection remains inspectable as original geometry and the blocker is
  explained beside route selection, with a link to the exact source edge.
  Use an existing explicit reviewed override only where its provenance
  supports the route. Keep new override or provisional-profile workflows
  outside this repair. Preserve explicit unknown values on restore. A historic
  nominal value that contradicts explicit source uncertainty requires fresh
  review unless a compatible audited override exists. Revalidate overrides
  and affected route reviews when source direction or typed endpoints change.
- For A–C, all three views identify A–B as uncertain and the default
  confirmed route excludes it. Test nominal, unknown, reversible and
  manually adjudicated connections, alternate directional paths, compatible
  restore and reimport, and independent signed simulation result overlays.
  Preserve typed source assets and existing valid profile geometry.

### DE-05 · Keep report and rainfall controls operable at desktop widths

- B-01 · Verified UX defect · High severity / P1. At 1024 px, the Reports
  options Collapse button spans x965–1054 px and its clipping parent ends at
  x974 px. The document itself reports no horizontal overflow. In Data /
  Rainfall events the minimum duration field reaches x1039 px.
- Reproduce in Chromium and Firefox with the standard rail layout. In Reports,
  open Report options and compare the button and clipping ancestor rectangles.
  In Data, open Rainfall events and inspect the minimum duration field.
- Fix the nested grid and flex minimum sizes and heading wrapping. Reflow the
  control group before switching to an expressly visible and focusable local
  scroller. Keep report ordering, input values and primary action sequence.
- At 1440, 1366 and 1024 px and a 1366 px window at 200% zoom, show the full
  control and focus ring or an obvious keyboard-operable local overflow region.
  Assert hit-testing at the button centre, ancestor clipping, pointer and
  keyboard activation, long scenario text, rail states and report exports.

### DE-06 · Give exact source point inspection a keyboard path

- B-02 · Verified accessibility defect · High severity / P1. The populated
  time-series Point inspector instructs a trace click. Its formatter is wired
  to a Plotly pointer event in `web/assets/workbench-v2.js`. Tab and arrow
  interaction cannot reach the same exact point readout and Copy point.
- Reproduce with multiple mapped synthetic traces, including a missing value.
  Inspect as a pointer user, then start from keyboard focus and try to choose
  a trace and timestamp.
- Add a compact trace and exact-source-sample navigator using the existing
  point-inspector formatter. Use the actual recorded cohort for the selected
  visible source trace and window. Label any native values omitted by the
  plotted resolution, and disclose units, transformations or interval support.
  Keep render and memory cost bounded on long series. Reconcile native and
  displayed indexes so hover, exact selection and CSV handling remain correct.
- In both browsers, keyboard-select three known source samples including
  Missing and identical display times on different traces. Verify series
  identity, project clock, value, unit, focus and clipboard content. Test
  current plot limits, exclusions, unit conversions and downsampling.

### DE-07 · Keep engineering landmarks visible when the asset inspector opens

- B-03 · Verified usability improvement · Medium severity / P2. At 1024×768
  the open asset inspector reduced the fitted Engineering canvas to 454 px
  and labels to six of 14. The pump and main outlet symbols remained visible,
  but their identifiers disappeared. Detailed exposed 202 sequential SVG
  stops. Find asset preserved W-06 across view switches. Clear trace displayed
  all 14 points again while the status still claimed a traced-only view.
- Reproduce the [three-view fixture](evidence/README.md), Fit Engineering, then
  find W-06 and open its inspector at 1024×768. Compare labels and focus path
  before and after opening and closing the panel.
- Prioritise named topology anchors before local node labels, reflow the
  inspector when it obscures the task, and add a direct keyboard handoff
  between Find asset, its selected inspector, actions and canvas. Keep
  individual asset and link inspection reachable.
- In both browsers, preserve readable identifiers or directly exposed labels
  for split, merge, pump, CSO and both outfalls. Provide a clear selected
  point and a one-action return to the full view. Check saved camera, pins,
  manual routing, nominal trace, fitting and branch folds across all modes.
  Tests assert that Clear trace and asset search synchronise canvas scope,
  pressed state and user-visible status.

### DE-08 · Explain schematic scope in the view and its publication

- B-04 and coordinator export review · Verified usability improvement ·
  Medium severity / P2. Both schematic modes draw 14 links from 101 source
  links. A 13-link reach resembles a one-link connector and two Strategic
  feeders have the same caption apart from their sizes. SVG exports share a
  generic accessible title and filename. The synthetic export title
  breaks “network” at the fixed 52-character cut.
- Use the [same network and export script](evidence/README.md). Compare the
  three views and open the Strategic SVG outside the app. Confirm the current
  title split in `web/assets/network-schematic.js`.
- Reuse derived graph member metadata for the diagram legend, SVG, PNG and
  PDF. Show active mode and scope and describe visible versus represented
  counts. Distinguish feeders using observed identities or downstream
  destination. Use measured, word-aware title wrapping and a meaningful
  accessible publication name and suggested filename.
- A reader can identify the 13-link reach and both feeder groups without
  hover. The view and exported artifact show the same filtered or traced
  scope, points, links and direction convention. Retain ordered member IDs and
  source provenance. Verify title wrapping, legends and legibility at report
  scale without using an arbitrary minimum point reduction.

### DE-09 · Expose simulation time and value to assistive technology

- B-05 · Verified accessibility improvement · Medium severity / P2. After
  replacing a CSV with duplicate clock times, Home and ArrowRight correctly
  selected 0 m³/s, Missing and −0.4 m³/s. The slider exposes 0–2 and has no
  `aria-valuetext`. Actual screen-reader speech was outside this review.
- Generate three irregular project-clock samples as in the design evidence
  and move across them by keyboard and Previous/Next, including missing
  and negative values.
- Apply the existing timestamp/value formatter to the accessible transport
  value. Use a deliberate announcement for pause or step and avoid repeatedly
  announcing automatic playback. Confirm exact sample selection and switch
  series without changing time semantics.
- Verify the accessible value contains the selected clock time, unit and
  numeric or Missing state in both browsers. Exercise time offsets, sample
  window bounds, paused and playing transitions and zero/negative handling.

### DE-10 · Offer the next useful action when prerequisites are missing

- B-06 and the survey onboarding part of B-08 · Verified UX improvement with
  survey comprehension follow-up · Medium severity / P2. A fresh Verification
  scatter fails with a message to apply observed and modelled sources. The
  primary network import is inside Save / Export / Load. Detriment already
  offers a useful Data recovery action.
- Reproduce by opening Verification, Schematic and Flow Survey directly in a
  fresh workspace. Attempt scatter, inspect the empty network and find the
  survey association workflow.
- Surface the shortest valid Data, assignment or local file action using
  existing controls and readiness states. Identify the missing source category
  on the relevant Flow Survey card. Preserve expert paths and technical error
  details. Verify survey wording with a first-use walkthrough.
- At each relevant empty or failed state, reach the required input in one
  visible keyboard-operable action. Cover no data, incompatible data, stale
  assessment and valid results. Failed imports preserve valid sources and
  invite a corrected file.

### DE-11 · Explain Partial report readiness before export

- B-07 · Verified usability improvement · Medium severity / P2. With
  partially supported current evidence, the cards show Partial and say
  dependencies match. That describes freshness and leaves the missing
  prerequisite or evidence basis unstated. Titles also ellipsise at 1024 px.
- Reproduce with a partial verification or spill comparison and an omitted
  survey association. Compare preparation cards with the exported report.
- Attach the method-specific reason and related review action to the existing
  readiness model. Keep freshness, missing prerequisites and intentional
  exclusions distinct. Apply the same agreed semantics to export summaries.
- Valid, stale, partial and deliberately omitted sections each show the
  corresponding evidence status. Partial identifies the cause and a route
  to inspect it. Titles fit with DE-05, exported section selection and
  provenance remain intact, and an intentional partial export is truthful.

### DE-12 · Permit a quick keyboard entry to the active workspace

- B-08 · Verified keyboard gap · Medium severity / P2. Fresh Tab traverses
  the rail and workspace choices before main work. Route Back, arrow
  navigation and many focus rings work.
- Reproduce with a fresh keyboard-only session on both desktop browsers.
  Tab from page entry and check the active route and focus order.
- Add a first-focus skip-to-workspace link targeting the active heading or
  main landmark. Reuse shell routing and preserve visible focus, reading
  order, sticky header offsets and dialog focus return.
- The first Tab then Enter reaches the active work surface. Verify both rails,
  Back and Forward, dialogs, route tabs, saved workspace restore and widths.

### DE-13 · Clarify Detriment export scope and format

- B-09 · Verified labels with comprehension untested · Low severity / P3
  optional opportunity. Four full/current actions compete with Calculate
  detriment at 1024 px. An applied asset list changes the meaning of full.
- Reproduce with an applied ID list and grid filter. Compare the four labels
  with actual locally saved format, row count and included assets.
- Keep this behind engineering prerequisite work, particularly DE-03. If
  authorised, label the actual format and evaluation scope in the action or
  a single export disclosure. Preserve all supported formats and dataset
  selection, no-detriment policy and fingerprint metadata.
- The operator can distinguish evaluated scope from filtered rows before
  export. The full and current files have the expected formats and exact
  row sets, including unresolved assets, at 1024 px. Pointer and keyboard
  access and request assertions pass. Resolve DE-15 before simplifying labels.

### DE-14 · Make reviewed production assurance discoverable by exact SHA

- A-05 · Verified engineering assurance improvement · Medium severity / P2.
  IT Security identifies v3.0.1 accurately and reports that an exact-revision
  assurance record is still awaited. Its displayed latest production record
  is v2.2.0. [Current UI evidence](technical/regression/security-about-smoke.log)
- Define the assurance record as a separately reviewed immutable
  post-deployment record of the built SHA, browser/engineering coverage and
  limitations. Use the existing approved evidence route where possible.
  Resolve exact-build identity without embedding a self-reference in a
  Git commit. A new fixed network resource would require its own review
  and approvals under `SECURITY.md`.
- Users can reach the exact deployed-SHA evidence from IT Security and
  distinguish candidate, production, missing and expired evidence. The
  tested report states external and licensed-ICM validation limits. Verify
  the version/footer, existing claims, security links, keyboard and request
  contract. Preserve an honest awaiting state while exact evidence is absent.

### DE-15 · Bound current-view Detriment HTML figures to the exported table scope

- Technical cross-review of B-09 · Verified local export scope defect ·
  Medium severity / P2. The live Chromium run selected Detriment only over
  three synthetic flooding changes (7, 1 and 0 m³) without an applied ID list.
  The visible table and downloaded current-view HTML table had one asset.
  Its embedded chart contained all three IDs and values. This can mislead
  a reviewer about the selected export cohort. The exercised network requests
  stayed within the local-processing contract.
  [Captured data](technical/cross-export-cohort.json) ·
  [Extracted chart](technical/cross-export-cohort-embedded.png)
- Replay the [browser case](technical/cross-export-cohort.mjs). The table
  uses current status and text filters while the chart may use all results
  in the no-ID-list path. The export reuses the rendered chart. Confirm the
  exact cohort in `web/assets/detriment-workspace.js`.
- Use one authoritative scoped-row selector for current view export tables,
  figures and metadata. Apply the same active ID scope and filters before
  ranking the existing chart subset. Full export retains the complete
  assessed population for its applied scope. Keep the live chart's own
  broader context only if it is explicitly labelled. Feed the exported
  figures their intended cohort without changing the user’s current state.
  Snapshot the cohort and provenance before generating figures asynchronously.
- In the fixture, retain the chart with only asset `A-CROSS-ID-001` at +7 m³ and no
  excluded IDs in embedded current-view figures. Distinguish the comparable
  chart subset from unresolved rows retained in the table and provenance.
  Top-20 ranking occurs within that scope
  and reports the subset and scope clearly. Test filters with and without
  applied IDs, selected assets excluded by filters, unresolved rows, outputs
  after DE-03, and the full and current HTML and CSV in both browsers. Inspect
  the offline HTML and extracted figures. Preserve signed values, units,
  version and criterion provenance.

## D. Implementation roadmap

1. **Decision integrity.** Land DE-01 and DE-02 with shared valid-interval
   primitives where the current methodologies permit. Keep each workflow's
   denominator and decision policy explicit. Then land DE-03 and DE-04.
   Upgrade affected evidence identities, review dependencies and prevent old
   decisions or profiles appearing current without reassessment.
2. **Core access.** Fix DE-05 and DE-06 on supported desktop browsers.
   Use the original interactions and widths as red-to-green reproductions.
   These accessibility and reporting issues are part of this cycle's gate.
3. **Interpretation and workflow clarity.** After DE-04, deliver DE-07 and
   DE-08 together with scope consistency and report-scale outputs. Then
   implement DE-09 through DE-12. DE-11 depends on trustworthy support from
   DE-01 and DE-02. Fix DE-15 after DE-03 and before any Detriment export
   wording change. DE-14 may proceed if the existing approved publication
   mechanism can bind the exact release SHA. Otherwise record the deployment
   evidence dependency and defer it with the truthful pending state intact.
4. **Optional work.** DE-13 follows a verified DE-03 and requires explicit
   implementation scope. Preserve comparison and export contracts.
   Track any deferred allowed finding with owner, rationale and next review.

## E. Regression protection

Preserve the validated engineering kernels and methodology, source values and
typed identities, observed and modelled time support, local storage, portable
workspace restore, source traceability, deterministic release artifacts and
per-workflow request assertions. Continue to run the existing protected release
gates. Expand targeted regression coverage only when required to demonstrate
the agreed corrective action.
[Release controls](../../release-controls.md) · [Security policy](../../../SECURITY.md)

| Area | Preserve and verify |
| --- | --- |
| Home, Data and project state | Explicit source assignment, authoritative worker finality, supported FDV/CSV/Rainfall interpretations, source lineage, project save/restore, data excluded from default attachments, duplicate-name and bad-file recovery, partial input retention. Run `web/tests/project-home-smoke.mjs` and `web/tests/domain-registry-unit.mjs` plus the affected data checks. |
| Spill and storage | Existing 12/24 counting, gap/exclusion meaning, valid monitoring support, threshold convention, event clipping, and storage continuity and volume balance. Run `tests/unit/test_spills.py`, `tests/unit/test_network_spills.py` and `web/tests/storage-routing-smoke.mjs`. |
| Network and playback | Original geometry, typed node/link identity, pump/weir role, ordered source reachability, exact monitor host, unknown direction, chainage provenance, saved manual edits, playback sample meaning and local exports. Run `network-diagram-unit.mjs`, `network-diagram-smoke.mjs`, `network-route-smoke.mjs` and `simulation-results-smoke.mjs` from `web/tests`. Re-run the three-view [synthetic review](evidence/README.md). |
| Flow Survey and Verification | Separate rainfall, flow, depth and velocity validity, the distinction between requested and usable duration, gaps and exclusions, WAPUG methods and reported information basis, reviewer decision lineage, and datum/units compatibility. Run the applicable `tests/unit/test_survey_*.py`, `test_rainfall_*.py`, `test_verification_*.py` and existing survey and verification browser checks. |
| Hydraulic Calculations | Preserve documented equations, strong input bounds, solver envelopes, applicability and old workspace state. Check independent rectangular/circular capacity and relevant pump and structure cases. Run `test_hydraulic_design.py`, `test_pipe_capacity.py` and affected `web/tests/hydraulic-*-smoke.mjs` or `web/tests/hydraulics-smoke.mjs`. |
| Detriment and Reports | Keep separate criterion evidence and clear Unknown handling, provenance, all accepted no-detriment thresholds, offline report compatibility, result visibility, and presentation across desktop sizes. Run `test_detriment.py`, `test_detriment_reference.py`, `web/tests/detriment-reference-smoke.mjs`, `web/tests/report-controls-acceptance.mjs` and `web/tests/graph-report-unit.mjs`. |
| About, privacy, performance | Preserve exact release identity, intelligible assurance limitations, fixed local resource paths, explicit local export, approved dependencies, network assertions, same-runner performance and protected release. Keep all current security, CI and live checks and run `python scripts/verify_data_confidentiality.py`, `python -m unittest discover -s tests/privacy -v` and `node web/tests/privacy-network-unit.mjs`. |

## F. Release acceptance requirements

For the next candidate, require both specialist verdicts bound to the exact head,
reproduced and resolved blockers, live-scope confidentiality evidence, supported
desktop browser coverage, a verified deployment and the existing maintainer
authorisation and release checks.
[Dual-Expert Review Framework](../../dual-expert-review.md)

For each in-scope finding retain an original-failure reproduction, an
after-fix independent expected result or task outcome, and the exact browser or
source evidence. Consistency or accessibility changes require an inspected
before/after capture and interaction check, including keyboard where relevant.
Compare current measurements for modified render/parse paths with the same
fixture, browser and window. Confirm every release blocker has both specialists'
evidence-backed disposition and exact-head approval. Store unresolved
disagreements and acceptance limits. Positive local tests are part of the gate
alongside all protected GitHub checks, owner acknowledgement and live verification.

## G. Implementation directive

Act as the engineering implementation owner for Hydra Bench in
`anzarsajid91/ICM_Graphing_Tool`. Verify current production and reconcile it
with this dossier, whose baseline is v3.0.1
`ccc36427c12f003e5d9b1fee61632770b31952cc`. Start from current protected
`main`, preserve existing work and reproduce both the primary failures and
accepted neighbouring behaviours on the candidate base. These review records
identify the workflow and evidence. They do not modify the application.

Implement DE-01 through DE-12 and DE-15 in the roadmap sequence and within the
acceptance boundaries in each finding. Apply the conditional scope for DE-14.
Leave DE-13 optional unless the implementation request includes it.
Preserve project-specific engineering criteria and do not assume field or
regulatory validation. Keep a versioned implementation tracker with each ID,
dependency, status, reviewed commit, test, screenshot and open decision.
Update it after every verified checkpoint. When interrupted, confirm the
actual branch, working tree, commits, PRs, tests and saved records. Continue
from the first unfinished step.

Use red-to-green reproductions and independent reference calculations for
decision fixes. Inspect before and after rendered desktop journeys and local
exports. Rerun affected regression and confidentiality checks and the full
normal gates. Publish review observations as synthetic evidence. Resolve
security findings through the existing process.

Convene both specialists in independent contexts to reassess the final
candidate, then run cross-review. Require each exact-head approval and
evidence for closed blockers. Follow the verified maintainer, protected
GitHub and authenticated owner release process. When the requested
implementation includes release, verify the actual deployment SHA, assets
and live workflows before marking work complete.
