# Hydra Bench v3.0 acceptance ledger

Release owner workflow and engineering scope follow the v3.0 specification supplied on 2026-11-21. Use one development PR. This ledger tracks verification separately from implementation. Record evidence by commit, include the commands and observed outcomes, and recheck dependent rows after a change. All release gates in section 20 apply to the complete candidate.

## Baseline as checked on 2026-11-21

- The public build reports v2.2.0 and revision 5882ebf60da8ee89d0ec10a0374b95fc548cc569. The remote main ref matched that revision and PR #117 was merged. The independent live verification run 44828848399 reported success.
- The v2.2 release evidence records the 110 matching public resources, the Chromium and Firefox end-to-end route workflow, and a 1,600-node browser fixture. The separate overview applicability check reduced a 101-node synthetic ICM network to 14 points with monitors while preserving nominal downstream connectivity.
- The existing desktop workbench uses a shared JavaScript project registry, authoritative Python in a local worker, fixed staged browser dependencies, a FastPath preview, and browser-local saved settings. Route planning and ICM geometry import already exist. Existing result evidence has method-specific freshness contracts. Reuse those contracts and the existing review semantics when exposing summaries.
- The published engineering methods define temporal support, exclusion handling, 12/24 spill counts, circular gravity hydraulics and verification alignment. The network follow-on list specifies pipe head losses, pump duty, structures and revision comparison. Repository controls require synthetic shared evidence, source and privacy validation, protected PR checks, verified artifact identity and a fresh authenticated owner record.
- An effective main-rules read listed required PRs, status checks, CodeQL and deletion/force-update protection. Recheck detailed enforcement and bypass settings on the exact final head. Issue #100 tracks intermittent live mixed-file import. PR #107 and the dependency-update PRs are outside this feature branch.
- An exact-baseline local Python rerun reported 353 passed tests and 111 passed subtests. Existing comparisons and panel screenshots are baseline evidence. Matched final performance, fresh browser coverage and exact candidate CI are separate acceptance tasks.

## Requirement matrix

Status terms are Open, Partial, Verified and External validation. A Partial row still has work required for v3.0.

| Requirement | Existing feature to build on | Acceptance and evidence | Status |
|---|---|---|---|
| 1–2 | Protected Pages, versioned artifacts and v2.2 release evidence | Live SHA, PR #117, baseline suite and matched benchmarks, architecture and security audit, one development PR | Partial |
| 3.1 | Home shortcuts, source pool, registry and assessment freshness APIs | Dashboard status reconciles to authoritative data and opens each relevant workspace | Verified locally |
| 3.2 | Home default, route state, named workspaces | Restore user-selected assessment context safely while preserving the default landing route and legacy saves | Partial |
| 3.3 | Current help text and workspace routes | Six guided journeys with actual prerequisites, results and next actions | Verified locally |
| 3.4.1–6 | Native geometry import, native result parsers, detriment import | Geometry, time series, subcatchments, spill/storage/PFF, monitor results and detriment scripts. Each has documented Autodesk contracts and manual export, verified syntax, contract and round-trip. Record real ICM runtime availability separately | Open |
| 4.1 | FDV and rainfall quality checks; source exclusions | Inspect and adjudicate configurable flatlines, discontinuities, gaps, irregular timesteps, duplicate timestamps, clock offset/drift, implausible values, unit conflicts | Open |
| 4.2 | Time offset, canonical units, supported temporal integration | Test rate/accumulation/level/status resampling, shifting, conversions, arithmetic and derived series using immutable originals and complete provenance | Open |
| 4.3 | Plotly, shared graph state and rainfall overlays | Multi-monitor display with same axes, sync zoom, unit distinctions, visibility and local export | Open |
| 5.1 | Physical spills, calendar counts and analysis graphs | Filter/rank investigation events with exact support, rainfall, eligible volume and source navigation | Open |
| 5.2 | Annual schematic and common-period comparison | Compare several scenarios and count/duration/volume independently across assets, years and comparable periods | Open |
| 5.3 | Idealised block-volume storage screening | Distinct mass-conservative routing/sensitivity with inflow/outflow assumptions, capacity, initial state, discharge rules and missing-period handling | Verified locally |
| 6.1 | Native typed ICM import, revision reimport and stale evidence | Added/removed, geometry/attribute/endpoint/topology/type diff, map/register and audited evidence/monitor effects | Partial |
| 6.2 | Schematic evidence layers and result indicators | Flow, velocity, utilisation, surcharge, flooding, freeboard, gradient and dimensions with quantities, scales, scenario, direction and missingness | Open |
| 6.3 | Exact-time selected model-level samples and overview | Synchronized real-sample map/profile playback, transport controls, windowing, scenario comparison, extrema and missingness | Open |
| 6.4 | v2.2 route profile, source chainage and links | Engineering profile with shaft/pipe/structure geometry, exact and approximate hydraulic levels, freeboard, surcharge, independent scales, navigation, inspection and export | Open |
| 6.5 | Local worker, series parser, source identity and registry | Native and optional portable result package, explicit schema and time support, bounded indexed worker and cancellation, selective retrieval, measured storage/capacity trade-offs | Open |
| 7.1 | Flow Survey FDV health, evidence and ratings | Explainable review of fouling, drift, flatline, depth–velocity, backwater, suspect dimensions and measurement ranges | Open |
| 7.2 | Gauge qualification, cumulative/event data | Compare timing, totals, correlation, spatial variability and suspect/missing support without inferring dry periods | Open |
| 7.3 | Weekly review, coverage and WAPUG/FSAT | Explain suitability of selected periods and clearly attribute published versus project screening criteria | Open |
| 8.1 | DWF, comparison and event diagnostics | Explain evidence and alternate investigation paths for baseflow/infiltration, runoff, peaks/timing/recession and restrictions/backwater | Open |
| 8.2 | Existing event comparison and alignment | Multiple monitors, events and scenarios with criterion states, support, decisions and plot navigation | Open |
| 8.3 | Existing comparison evidence stamps and review history | Compare revisions with a controlled observed basis and explicit non-comparability | Open |
| 9.1 | Circular full/part-full Colebrook–White and comparisons | Preserve verified outputs; justify additional methods, geometries, target diameter/gradient and plots | Open |
| 9.2 | SI circular pipe engine | Head-loss components, static/dynamic head, forward series/parallel, system curve and auditable sheets with independent cases | Partial |
| 9.3 | Candidate system-curve model | Validated curves, intersections, limits, configurations and power; distinguish unsupported conditions | Partial |
| 9.4 | ICM structure metadata only | Primary equation evidence and tests for applicable free/submerged/reversible weir, orifice and sluice conditions | Open |
| 9.5 England and framework research | Official permitting guidance | Versioned, cited England combined, qualifying separate and mixed calculations. Review Scotland and other jurisdictions before any preset and provide documented custom methodology | Partial |
| 9.5 input modes and upstream tracing | Native network importer, explicit source attributes, graph trace | Manual, mapped ICM files and reviewed network allocation with inherited/missing/duplicate/bifurcating/loop/transfer cases | Partial |
| 9.5 outputs and related calculations | Existing capacity and spill evidence | Catchment audit, conversions, sensitivity, compatible comparison and sheets; distinct DWF, FFT, peak flow, self-cleansing and boundary shear methods | Open |
| 10.1 | Per-scenario detriment comparisons | Common baseline with multiple candidates and independent criteria | Open |
| 10.2 | Category result tables and evidence | Asset register displaying each independent result, criterion, period and threshold | Open |
| 10.3 | Detriment schematic overlay | Filter hotspots and affected branch and navigate directly to evidence | Open |
| 11.1 | Report builder and local HTML/print exports | Configurable arrangement, engineering comments, preview and export | Open |
| 11.2 | Existing print and local downloads | Engineering sheets with equations, units, component results, provenance, assumptions, methods and exact version | Open |
| 11.3 | Workspace and schematic snapshots | Reproducible change report with explicit evidence comparability | Open |
| 12.1 | IT Security and claim register | Runtime-supported diagnostics/inventory/clear controls and reliable storage information | Open |
| 12.2 | Methods documentation and About page | Searchable and sourced method library with revision, scopes and limitations | Open |
| 12.3 | Build metadata, security claims and release evidence | Versioned assurance covering actual feature, numerical, confidentiality and compatibility outcomes | Open |
| 13 | Shared registry, workspace serialization and storage | Shared typed results and route context; deterministic stale state, bounded imports and prior workspace compatibility | Open |
| 14 | Precision Workbench / shared design tokens | Desktop usability, keyboard, responsive layout, contrast, reduced motion, progress and understandable empty/error states | Open |
| 15 | Existing numerical and browser regressions | Independent reference cases for every new method, mandatory invalid/boundary cases, tolerances and genuine ICM comparisons where available | Open |
| 16 | CI baseline comparison and v2.2 matched startup measures | Matched lifecycle benchmarks at 400, 1,600 and 10,000 assets and varying duration, throughput, memory, cancellation and state integrity | Open |
| 17 | Local worker, CSP, approvals, SBOM and request observers | Review every affected trust boundary, malformed inputs and resource limits. Repeat source, claim, licence, CodeQL, dependency, secret and browser checks | Open |
| 18 | Chromium/Firefox release suites | Complete per-control and cross-workspace checks and documented review passes. Distinguish AI review, real ICM and available browser/platform coverage | Open |
| 19 | Git and this ledger | Preserve implementation commits, exact evidence, outstanding limitations and recovery context | Partial |
| 20 | Semantic milestone mapping, protected Pages and live verifier | Verified exact final head, authenticated owner acknowledgement, live v3.0.0 SHA, smoke and release report. Release readiness depends on the full matrix | Open |

## Work in progress

Development is in draft PR #119. Version assignment is deferred until the complete acceptance and protected release gates can be verified.

### Hydraulic calculation milestone source review

The fixed system, pump and England calculation screens call three named
operations on the existing local worker. Calculation inputs, notes and
result rows use DOM text and values and export only through explicit local
CSV downloads with the existing formula-injection protection. The static
builder stages one new fixed, same-origin script with the existing release
SHA. SC-01's confidentiality wording and SC-07's build identification are
consistent with that fixed resource and unchanged worker transport. SC-03's
storage source reference now includes three additional UI routes that hold
inputs and result rows in browser memory and provide explicit local export.
The existing saved workspace and retention controls continue to govern
other state.

### Verified local milestone evidence

- `tests/unit/test_hydraulic_design.py` covers reviewed England combined,
  separate and mixed catchments, daily flow conversions, missing and duplicate
  inputs, separate eligibility, negative static head, unequal parallel branches
  and multiple, tangential and absent pump intersections.
- `web/tests/hydraulic-design-smoke.mjs` passed in Chromium and Firefox.
  The suite exercises native form validation, worker calculations, stale
  output invalidation, downloads and Home/pipe-capacity navigation.
  The request observer counted 84 and 83 requests with no violations.
- The source gate, 28 Python privacy tests, JavaScript request contract and
  rebuilt Pages artifact passed locally. CI wiring runs the new smoke test
  in both established browsers without changing required contexts.
- Remaining hydraulic acceptance includes documented custom and non-England
  methods, catchment trace, sensitivity and comparisons,
  printable calculation reports, broader gravity methods, structures and
  independent ICM cross-checks where genuine references are available.

### Network revision review milestone

- Revision import previews added, removed and modified typed assets,
  original geometry, source fields and nominal connectivity. The dialog
  offers before/after geometry, a paged register, filtering and field drill-down.
- Native link identity is the ICM table, upstream node and suffix. A changed
  downstream node is an endpoint change. A changed native identity is reported
  as a removal and addition, unless a supported export supplies a stable
  identity. The feature keeps compatible local layout and review fields.
  Changes to source geometry, attributes and incident topology invalidate
  affected cached assessments. Compatible monitor and source associations
  are shown for engineer review.
- Native synthetic unit and Chromium/Firefox tests cover audit and cancel,
  classification, endpoint changes, true source position versus local layout,
  before/after geometry and scoped invalidation. Both browser runs passed and
  observed 28 and 29 requests with zero violations.
- Review of the network-capable schematic source covers modal-local DOM
  text, numeric SVG geometry, and the existing local application state.
  The current source approval records the revised hash and scope. A broader
  assessment-dependency graph across workspaces remains open.

### Home dashboard and guided workflows

- Home remains the default. Project readiness and review links derive from the
  shared project data, the existing workspace outputs and available freshness checks.
  Six guides use the existing workspace entry points.
- Recent work records up to six validated route keys in session storage.
  In-tab navigation retains live selections through existing workspace context.
  Reload restores route history. Restoring engineering selections after reload
  still requires a named workspace save and remains open in this ledger.
- Chromium and Firefox project-home smoke checks exercised project readiness,
  guided navigation, opening Home by default and session-route privacy. Runtime
  observation saw 117 and 109 requests with zero violations. The static builder
  stages a fixed same-origin script using the existing version mechanism.
- A matched five-run synthetic Chromium comparison used the exact v2.2 artifact,
  75 ms latency, 200 KiB/s throughput and fourfold CPU throttling. Candidate
  medians were 5,847 ms cold startup versus 5,667 ms and 2,080 ms for first
  schematic navigation versus 1,943 ms. Treat both differences as interim.

### Formula A catchment file review

- Formula A accepts a bounded, local CSV with explicit mappings and engineering
  confirmation. It records file fingerprints and source values in the audit
  CSV. Unknown units, duplicate IDs and unresolved daily allowances block
  calculation. Source system type remains distinct from reviewed classification.
- The expanded synthetic browser check mapped a native multi-table CSV, kept a
  leading-zero ID, converted m³/day to L/day, and left an inherited `#D` value
  for review. It passed in Chromium and Firefox with 85 and 84 requests and zero
  violations. The Python suite passed 368 tests and 111 subtests.
- The current table caps input at 100 catchments and 1 MiB. Larger catchment
  files, imported default inheritance and integrated reviewed upstream trace
  remain open.

### Storage routing and spill-volume sensitivity

- Spills has a separate routing view that reuses the ready local flow channel,
  shared worker, applicable exclusions and safe calculation export. Review the
  inflow clock, period, pass-forward cap and initial occupied storage. Existing
  Storage assessment and 12/24 rules keep their established methods.
- The worker checks continuity for all tested capacities and stops at the
  first unsupported interval. The view reports assessed duration and coverage,
  stage volumes, spill sensitivity and mass residual. It signs the source
  reference with the existing SHA-256 and retains the reviewed assumptions in
  the local CSV. In-app calculation state is session-only at this milestone.
- The triangular benchmark integrates 10 m³, passes 7.5 m³ and spills 1.5 m³
  with 1 m³ of retained storage. Eleven storage tests cover cap crossings,
  fill and drawdown, zero release, excluded intervals, duplicate timestamps,
  invalid controls and source unit conversion. The full Python suite passed
  379 tests and 111 subtests.
- The Chromium and Firefox workflow verified existing Storage assessment
  navigation, actual time-series import, partial and complete selected periods,
  chart and table values, invalid inputs, invalidation and protected CSV export.
  The observer saw 89 and 87 requests with zero violations. The revised shell
  source hash covers one additional fixed local route only.
