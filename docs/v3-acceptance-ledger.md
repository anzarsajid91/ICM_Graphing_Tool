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
| 3.4.1–6 | Native geometry import, native result parsers, detriment import | Geometry, time series, subcatchments, spill/storage/PFF, monitor results and detriment scripts. Each has documented Autodesk contracts and manual export, verified syntax, contract and round-trip. Record real ICM runtime availability separately | Partial |
| 4.1 | FDV and rainfall quality checks; source exclusions | Inspect and adjudicate configurable flatlines, discontinuities, gaps, irregular timesteps, duplicate timestamps, clock offset/drift, implausible values, unit conflicts | Partial |
| 4.2 | Time offset, canonical units, supported temporal integration | Test rate/accumulation/level/status resampling, shifting, conversions, arithmetic and derived series using immutable originals and complete provenance | Partial |
| 4.3 | Plotly, shared graph state and rainfall overlays | Multi-monitor display with same axes, sync zoom, unit distinctions, visibility and local export | Verified locally |
| 5.1 | Physical spills, calendar counts and analysis graphs | Filter/rank investigation events with exact support, rainfall, eligible volume and source navigation | Verified locally |
| 5.2 | Annual schematic and common-period comparison | Compare several scenarios and count/duration/volume independently across assets, years and comparable periods | Verified locally |
| 5.3 | Idealised block-volume storage screening | Distinct mass-conservative routing/sensitivity with inflow/outflow assumptions, capacity, initial state, discharge rules and missing-period handling | Verified locally |
| 6.1 | Native typed ICM import, revision reimport and stale evidence | Added/removed, geometry/attribute/endpoint/topology/type diff, map/register and audited evidence/monitor effects | Partial |
| 6.2 | Schematic evidence layers and result indicators | Flow, velocity, utilisation, surcharge, flooding, freeboard, gradient and dimensions with quantities, scales, scenario, direction and missingness | Verified locally for imported result layers, reviewed flow direction, same-datum freeboard, source geometry and positive imported full-capacity utilisation |
| 6.3 | Exact-time selected model-level samples and overview | Synchronized recorded map/profile playback, event filtering, exact sample windows, speed controls, comparable scenario layers and independent extrema | Verified locally for exact shared-clock comparison and independent layer extrema. Geometry-sensitive scenario review remains open under 6.1 and 6.4 |
| 6.4 | v2.2 route profile, source chainage and links | Engineering profile with shaft/pipe/structure geometry, exact and approximate hydraulic levels, freeboard, surcharge, independent scales, navigation, inspection and export | Partial. Source geometry, structure levels and paired exact proposal endpoints on reviewed shared route geometry verified in both desktop browsers. Revision-specific geometry and expanded profile interaction remain open |
| 6.5 | Local worker, series parser, source identity and registry | Native streaming CSV, portable formats and producer, typed provenance, bounded memory and file-backed access, cancellation and exact selective lookup | Verified locally for indexed ingestion and lookup. Broader capacity and release checks remain open |
| 7.1 | Flow Survey FDV health, evidence and ratings | Paired channel review, circular-area cross-check, suspect periods, local source timing handoff and engineer audit | Verified locally for configurable diagnostics. Real site diagnosis requires independent evidence |
| 7.2 | Gauge qualification, cumulative/event data | Common-clock spatial comparison, event totals, correlation, peak offset, coverage, suspect bins and WAPUG linkage | Verified locally |
| 7.3 | Weekly review, coverage and WAPUG/FSAT | Suitability screen for a selected monitored location and rainfall candidate, using measured support, reviewed range, site evidence and current qualification | Verified locally for candidate screening |
| 8.1 | DWF, comparison and event diagnostics | Explain preceding-flow, storm, peak, timing, recovery and paired-depth differences with exact support and investigation prompts | Verified locally for the phase investigation |
| 8.2 | Existing event comparison and alignment | Qualifying event sets with multiple monitor–scenario pairings, independent criteria, true common time support, comments, plots and audit | Verified locally for the matrix |
| 8.3 | Existing comparison evidence stamps and review history | Review current matrix against named baseline snapshots with the same recorded observations, criteria, support and qualification | Verified locally for portable snapshots |
| 9.1 | Circular full/part-full Colebrook–White and comparisons | Shared circular solver, Manning capacity and depth, full-bore Manning and Darcy diameter/gradient, section and depth chart, pipe trials | Verified locally for circular hydraulics and documented rectangular/trapezoidal uniform-flow sections |
| 9.2 | SI circular pipe engine | Head-loss components, signed static/dynamic head, series/parallel, fixed and calculated Darcy factors, supported curve intervals and calculation sheets | Verified locally for steady forward full-pipe screening |
| 9.3 | Candidate system-curve model | Manual and mapped CSV pump curves, exact specified-factor intersections including multiple and absent duties, identical arrangements, power and operating limits | Verified locally for the specified-factor system model |
| 9.4 | ICM structure metadata only | Primary equation evidence and tests for applicable free/submerged/reversible weir, orifice and sluice conditions | Partial |
| 9.5 England and framework research | Official permitting guidance | Versioned methods for England, Scotland, Wales and the reviewed Irish combined setting, with a documented project method | Verified locally within the cited applicability. Northern Ireland continuation uses the reviewed project consent basis |
| 9.5 input modes and upstream tracing | Native network importer, explicit source attributes, graph trace | Manual, mapped ICM files and reviewed network allocation with inherited/missing/duplicate/bifurcating/loop/transfer cases | Verified locally for reviewed source fields, native fixed event profiles and explicit contributing allocations. Real ICM runtime and project-specific regulatory applicability remain separate |
| 9.5 outputs and related calculations | Existing capacity and spill evidence | Catchment audit, conversions, sensitivity, compatible comparison and sheets; distinct DWF, FFT, peak flow, self-cleansing and boundary shear methods | Verified locally for the supported frameworks, circular sections and same-run typed link results. Inheritance remains a separate input criterion |
| 10.1 | Per-scenario detriment comparisons | Common baseline with multiple candidates and independent criteria | Verified locally within each assessment category |
| 10.2 | Category result tables and evidence | Combined typed asset and proposal register retaining each independent result, criterion, period and threshold | Verified locally for session review and explicit CSV audit |
| 10.3 | Detriment schematic overlay | Reviewed typed proposal hotspots, independent criterion and severity filters, nominal branch trace and direct report evidence | Verified locally for compatible imported networks |
| 11.1 | Report builder and local HTML/print exports | Configurable arrangement, engineering comments, preview and export | Verified locally for assessment templates, section order, schematic, current calculation-sheet selection and local preview/export. Exact final full regressions remain open |
| 11.2 | Existing print and local downloads | Engineering sheets with equations, units, component results, provenance, assumptions, methods and exact version | Partial. Shared v3 hydraulic design sheets and Reports integration verified locally. Coverage of remaining calculation methods remains open |
| 11.3 | Workspace and schematic snapshots | Reproducible change report with explicit evidence comparability | Partial. Portable Reports snapshots, reviewed inputs, current calculation-sheet results, mapped comparison/spill support, decisions and action register. Coverage of the remaining workspace evidence is open |
| 12.1 | IT Security and claim register | Runtime-supported diagnostics/inventory/clear controls and reliable storage information | Verified locally |
| 12.2 | Methods documentation and About page | Searchable and sourced method library with revision, scopes and limitations | Partial |
| 12.3 | Build metadata, security claims and release evidence | Versioned assurance covering actual feature, numerical, confidentiality and compatibility outcomes | Open |
| 13 | Shared registry, workspace serialization and storage | Shared typed results and route context; deterministic stale state, bounded imports and prior workspace compatibility | Open |
| 14 | Precision Workbench / shared design tokens | Desktop usability, keyboard, responsive layout, contrast, reduced motion, progress and understandable empty/error states | Open |
| 15 | Existing numerical and browser regressions | Independent reference cases for every new method, mandatory invalid/boundary cases, tolerances and genuine ICM comparisons where available | Open |
| 16 | CI baseline comparison and v2.2 matched startup measures | Matched lifecycle benchmarks at 400, 1,600 and 10,000 assets and varying duration, throughput, memory, cancellation and state integrity | Partial. Matched native network import, pan, inspection, overview and zoom verified locally. Exact final release and annual-results lifecycle evidence remain open |
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

### Simulation result ingestion and exact-sample review

- The first local import contract links explicit column mappings to typed ICM
  assets, simulation, model revision, scenario, event, quantity, location,
  datum, units, project-clock temporal support and a source fingerprint.
  The worker stages bounded typed arrays and supports cancellation, exact
  frames, selective time windows and per-series extrema. See
  [simulation results documentation](simulation-results.md) for the Autodesk
  field references and browser limits.
- A standalone result reviewer offers exact timestamp, sample slider,
  previous/next, playback speed and min/max for the selected series. It keeps
  gaps and distinguishes zero, missing and signed flow. Previous sources stay
  available when an import is cancelled or rejected.
- Chromium and Firefox exercised native file selection, preview, link mapping,
  pause, step, playback and keyboard transport, extrema, duplicate file reuse,
  cancellation and source removal. Both request observers saw 32 requests and
  zero violations with simulation and revision canaries. Index unit tests
  covered quoted records across block boundaries, a UTF-16 BOM, date and unit
  conflicts, malformed values, source fingerprint and resource exhaustion.
  The browser entry and worker received scoped same-origin source reviews.
- A synthetic Node ingestion benchmark used 400 assets at 289 samples (0.47 MB
  source, 1.05 MB typed allocation, 54 ms), 1,600 at 289 (1.87 MB, 4.15 MB,
  115 ms), and 10,000 at 73 (2.99 MB, 6.24 MB, 295 ms). An annual 15-minute
  file with 96 of 400 columns indexed used 56.91 MB source, 27.26 MB typed
  allocation and 1,335 ms. Process RSS deltas ranged from 14 to 108 MB and
  include temporary JavaScript allocations. These are offline parser results.
  The 10,000-asset schematic renderer, browser peak memory and the matched
  release workload remain open.
- Remaining integration covers current model revision binding, map and route
  samples, scoped windows and scenarios, file-backed retrieval, the optional
  compact package and testing on genuine ICM exports.

### ICM Export Toolkit

- Home offers six standalone versioned Ruby downloads built from a shared
  library and one run guide. The scripts use documented desktop model and
  result reads. The generated packages have no external launch, dependency
  installation, network request, model write, transaction or Exchange API.
  They require a user-selected output folder and confirmed source units and
  include an explicit completion file. See [ICM export guide](icm-export-toolkit.md).
- Ruby 3.3.13 checked syntax for all six standalone files. A read-only mocked
  ICM network exercised all six jobs. Real Hydra Bench parsers verified the
  generated native geometry, preserved conduit bends and typed links,
  signed and missing samples, and Formula A catchment leading zeros and
  explicit zero versus blank values. Chromium and Firefox downloaded all
  seven fixed resources and matched release artifact bytes. Request observers
  saw 27 and 35 requests with zero violations.
- Review covered local File writes, exclusive output paths, unsafe text and
  native result allocation limits. The scoped Gitleaks check on the toolkit
  downloads returned zero matches. Three findings in an extra whole-artifact
  scan were verified fixed SHA-256 digests in the integrity manifest.
- ICM runtime compatibility, native flags and inherited values, dedicated
  storage volume outputs, and authoritative detriment report round-trips
  remain open. The guide gives native CSV workflows for those use cases.

### Source diagnostics and reviewed exclusions

- The Data workspace now screens actual timestamp and value samples for
  duplicates, gaps, short intervals, missing values, flatlines, abrupt changes,
  isolated spikes and explicit plausibility ranges. Resolved units are
  required for dimensional thresholds. The reviewer can accept or reject
  findings, record a reason, export the diagnostic record and add a verified
  interval to the existing source-specific exclusions. Original values are
  preserved.
- Optional same-signal lag screening checks actual matched sampling times
  across an early and late window. The independent synthetic case shifted the
  reference by 120 then 180 seconds. The reported candidate corrections were
  −120 s and −180 s. Ambiguous or constant signals stay inconclusive.
- Chromium and Firefox verified real file import, diagnostic and clock
  controls, exclusion review, output invalidation and explicit CSV export.
  Request observers counted 92 and 90 requests with zero violations. The
  Python suite passed 386 tests and 111 subtests. Further unit/quantity
  conflict investigation and persistent decisions remain open.
- CI recorded a PyPI TLS handshake timeout in the standalone dependency
  audit at toolkit head `980eab2`. That audit passed on retry. All required
  security checks still apply at the exact release candidate.

### Hydraulic structures and engineering method search

- The model screens thin-plate rectangular weirs, fully wetted circular or
  rectangular orifices, vertical sluice gates in supported steady regimes,
  and manually supplied passive ratings. It checks the common vertical
  datum and applicability, requires justified coefficients, preserves sign
  and withholds results in unsupported flow regimes. The entered evidence,
  equations, units and numeric result appear in the calculation CSV.
- Independent hand-calculated case values include 0.782889280 m³/s for a
  free rectangular weir, 0.699733650 m³/s for its submerged case and
  −0.220574800 m³/s for a reverse submerged rectangular orifice. The full
  Python suite passed 394 tests and 111 subtests. Eight structure tests cover
  basic cases, zero drive, unsafe regimes, unconfirmed reverse flow and
  bounded rating interpolation. ICM parity requires suitable external cases.
- Eleven explanatory sections are built directly from the repository's
  methodology text with fourteen reviewed references. The About library
  supports full-text search, category/jurisdiction filters, retry on load
  failure and contextual navigation. It loads a fixed versioned resource
  when opened. The wider WAPUG, FSAT, regulatory and assurance library
  remains open. The new calculation panels initialise on their workspace
  entry points to reduce initial Home work.
- Chromium and Firefox verified the calculation and library workflows.
  The structure request observers saw 91 and 90 requests and the method
  library observers saw 31 and 32, all with zero violations.
- The interim Chromium live-mode harness passed against the local candidate
  with 542 requests and zero violations. Both mixed-file probes kept the
  valid CSV usable after a malformed FDV failed, including the 1,200 ms
  delayed worker case. The earlier production intermittency in issue #100
  remains under monitoring. Exact final-head CI and live verification are
  still required.
- The previous Firefox shell job correctly rejected adding a second Data
  tab at `72da977`. The source diagnostics now open from the existing
  Source pool in an accessible dialog. The single Time series route and
  the legacy shell acceptance assertion are retained. Both full local shell
  suites passed after the correction. Chromium and Firefox rechecked the
  diagnostic review and keyboard dismissal with 94 and 92 observed requests
  and zero violations.
- An interim five-pair cold Chromium test after the structure and library
  changes found 6,512 ms versus 5,999 ms cold startup and 2,114 ms versus
  2,020 ms for the first schematic visit. Under 75 ms network latency,
  200 KB/s and fourfold CPU throttling, these changes are 8.6% and 4.7%.
  Cold-start optimization and final matched performance remain open.

### Deferred startup components and preserved About navigation

- The hydraulic screens, simulation reviewer and source diagnostics now
  download only on their relevant entry points. Home and first schematic
  entry request none of the three scripts. The shell retries a failed fixed
  component request and mounts the validated content when available.
- At `46f5063`, the shell job passed its layout stage. Both protected browser
  jobs subsequently caught a keyboard regression in IT Security when adding
  a third About tab. The method library now opens from About Overview and
  preserves the Overview and IT Security tab order. Existing assertions
  remain in place and passed locally in Chromium and Firefox with the fix.
- Browser checks passed the lazy-load and retry path, the IT Security keyboard
  and no-navigation-request contract, the method-library search and dismissal,
  and the Storage routing empty state and calculation after deferred loading.
  Chromium recorded 33, 27, 29 and 92 requests. Firefox recorded 34, 28, 30
  and 90. All request observations had zero violations. Earlier affected
  simulation, design, structures and diagnostics checks also passed.
- The repeat benchmark rebuilt exact commit `99477708af7751852a1d8231cb540ddf217b4c73`
  and used the same v2.2 production revision for five alternating cold
  Chromium pairs. Median startup was 5,798 ms versus 5,680 ms (+2.1%).
  Median first schematic entry was 2,003 ms versus 1,947 ms (+2.9%). One
  candidate schematic run took 2,498 ms. This is a focused startup check,
  with final release workloads and large-network rendering still open.
- Repository-wide Code Scanning, Secret Scanning and Dependabot alert lists
  returned HTTP 403 to the current credential. Exact-head workflow checks,
  source inventories and the authenticated release procedure still apply.

### Source-based long-section investigation

- The long section adds independent horizontal and elevation zoom and pan,
  reset, a full-size modal and local vector export. The view records its
  scale ratio, preserves configured display options in saved networks and
  reads earlier profile snapshots. Modal and compact controls share the
  same selection and rendering state.
- Profile geometry uses source length, invert, ground, chamber floor and
  dimensions when present. It retains junction drops, missing length and
  missing level boundaries. Source invert differences and lengths give a
  0.002 m/m grade in the reference pipe. Node results remain discrete exact
  markers. A freeboard tooltip uses compatible declared-datum elevations.
- Route and revision unit suites passed. Chromium and Firefox exercised
  import, navigation, independent scales, pan, reset, the expanded dialog,
  SVG download, a source node level, the unchanged 288.094 L/s pipe check,
  save/restore and changed-source invalidation. The two request observers
  saw 123 and 122 requests with zero violations. Synthetic screenshots are
  retained in the local `hydra-evidence/v3/profile-view` folder.
- Structure geometry beyond the current symbols, hydraulically valid water
  fill and synchronized conduit-end results remain
  open. The profile's shaft widths indicate node position symbolically.

### Exact-sample schematic and profile playback

- In the detailed network, an engineer reviews declared revision, typed
  mappings, reported quantity and end convention before applying a local
  result source. Native node IDs and composite link identities match
  independently. Leading zeros are preserved and ambiguous typed matches
  are excluded. Missing samples have distinct map styling. Adjustable bands
  stay fixed across all timestamps until the user reapplies a new scale.
- Step, play, pause, slider and speed controls request exact existing
  timestamps from the same local index as the standalone result reviewer.
  Map styling updates on the existing SVG groups. Compatible node levels
  update an open route at the same exact time after explicit geometry-datum
  confirmation. Missing data leaves no level marker. No interpolated
  water surface or internal hydraulic grade is implied.
- Unit tests verify typed matching, collisions, source revision format,
  leading zeros and colour ranges. Chromium and Firefox verify unmatched
  columns, numerical zero, reverse and missing link flow, keyboard timeline,
  speed and pause, sample parity, datum mismatch, freeboard above and below
  ground, panel removal, source removal and reimport invalidation. Each
  browser observed 32 same-origin static requests and zero violations.
- The result layer is session-only and cleared on revision, edit, overview
  or source removal. The optional profile coverage currently includes node
  levels only. Conduit-end water geometry, time-window transport, scenario
  synchronization, comparative envelopes, calculated thematic layers,
  measured-direction indicators and large-playback benchmarks remain open.
- A protected Chromium run on the preceding head reached Storage routing
  before its deferred script finished. The smoke test now waits for the
  required empty-state message and retains its original assertion and
  calculation checks.

### Derived time-series intervals

- The Data source pool opens a non-destructive transformation dialog. It
  produces interval means or supported totals, with source-specific shifts,
  units, selection of window and step, and reviewed same-quantity addition
  or subtraction. A local vectorized worker calculation tracks exact source
  and exclusion boundaries, signed volume, incremental rainfall and both
  operand coverage values. Incomplete periods remain missing. Source bytes
  and units are preserved. The audit CSV and derived JSON include provenance.
- Independent checks recover 8, 32 and 8 m³ from the triangular flow residual.
  A native .R fixture produces the same 0.7 mm from intensity or incremental
  depth, includes the declared final interval and does not bridge a reviewed
  gap. See [the temporal method and references](methods.md#derived-time-series-intervals).
- Seven independent transformation tests passed. Chromium and Firefox
  validated the local chooser, both shifts, addition and subtraction, explicit
  date bounds, interval means and signed totals, output units, missing bins,
  pagination, JSON provenance and a formula-like synthetic filename in the
  CSV audit. Request observers saw 93 and 91 static requests and zero
  violations. The existing diagnostics and method-library flows passed in
  both browsers. The source gate, 28 privacy tests and JS request contract
  passed locally.
- A synthetic five-minute annual source of 105,121 samples produced 8,760
  complete hourly bins in 0.142 s with 9.79 MiB traced peak allocation in
  the local Python kernel. The integral matched 22,075,200 m³. This is an
  algorithm measurement with array creation outside the measured interval.
  Browser ingestion and UI latency at that size remain unmeasured.
- The derived series currently has export evidence. Restoring derived series
  into the common project registry, preserving text categorical states, and
  providing period plots and graph handoffs remain open.
- Protected browser interactions also caught a connector focus assertion at
  `823f5fb`. An instrumented synthetic replay reproduced the failure while
  tracing successful focus on both successive replacement SVG groups. The
  test now reads the live DOM and exact focused connector ID together after
  the retired group detaches. Six local Chromium runs passed with the control
  evidence recorder enabled.

### Synchronized monitoring plots

- Data can compare two to eight locally resident monitoring channels of one
  resolved quantity. The plot uses the existing worker's selected window
  and pinned chart renderer. A rainfall overlay uses its own unit axis and
  the same project-clock x axis. Gaps and invalid negative rainfall stay
  unplotted. Absolute level requires reviewed vertical datum. Visibility
  switches are keyboard-accessible and the plot fit covers both y axes.
- CSV export is explicitly limited to plotted samples and includes source
  fingerprints and units. Source datasets retain their actual resolution.
  The plot defers all components until opened and releases plot state on
  dismissal. Window loads use the worker's ordinary display budget with a
  50,000-point ceiling per trace after preserving gap boundaries.
- Chromium and Firefox verified selection filtering, compatible canonical
  units, optional rainfall, bounds validation, source zero and gaps, plot
  zoom and fit, visibility, level datum, local CSV injection protection and
  dismissal. They observed 94 and 92 fixed requests and zero violations.
  Deferred-workspace regressions passed alongside them. Matched dense plot
  performance is part of the open release-wide benchmarks.

### Physical discharge investigation

- The register uses the latest authoritative physical intervals, the exact
  threshold channel and applied exclusions from the spill snapshot. The
  separate 12/24 count retains its existing status. Duration, interruption
  between intervals, optional discharge flow and rainfall, ranking and local
  CSV export use reviewed source definitions. The graph handoff carries the
  interval in local function arguments to the fixed Time series route.
- Two hand-checkable tests distinguish two physical intervals from one 12/24
  count, recover 90 and 45 m³ of positive discharge and 0.2 mm of complete
  rainfall, preserve valid zero crossings, and withhold incomplete auxiliary
  contributions. The raw unit, rejection and prior transformation tests
  passed alongside these fixtures.
- A local vector workload reviewed 5,000 synthetic intervals from 105,121
  five-minute samples, with a matching flow source. It produced every exact
  300 m³ result in 2.16 s with 16.8 MiB traced peak allocation. This is a
  focused Python kernel measurement.
- Chromium and Firefox verified the normal spill calculation, event support,
  optional evidence, ranking, duration filter, paging, CSV, exact graph
  bounds, and stale threshold handling. They observed 95 and 93 fixed requests
  with zero violations. The browser worker exposed a WASM32 scalar-conversion
  limit for nanosecond epoch values. Python integer splitting now handles
  scalar boundaries for the register and transformations. Reviewed exclusions
  shifted together with their source and passed the new browser regression.
- The Firefox shell caught a five-pixel monitor-control gap at `53c593c`.
  The layout now uses the existing four-pixel spacing rhythm. The full local
  Firefox shell and both deferred component suites passed with the fix.

### SEPA overflow and treatment design flows

- The Formula A workspace adds the current Scottish low-significance inland
  method from SEPA WAT-G-058 v1.0, August 2025. It requires reviewed evidence,
  dilution over 8:1, population equivalent below 10,000, absence of interacting
  discharges, and confirmed maximum infiltration allowances. Mixed rows retain
  actual separate contributions. The simpler combined basis requires an explicit
  reviewed separate share below 20% and an allocation basis. See the
  [official Scottish method and limitations](methods.md#scotland-continuation-flow-screening).
- The new Treatment flows route applies WAT-G-065 v1.0, August 2025. Its DWF
  and FFT calculations use independently reviewed dry-weather and maximum
  infiltration values. The same local worker reports all three flow units and
  an audit export with the source and design horizon.
- Seven Scotland unit cases and fifteen existing hydraulic cases passed.
  The fixtures independently recovered 169,000, 63,000, 148,400 and 169,200
  L/day for the stated continuation-flow cases, plus DWF 21,000 L/day and
  FFT 63,000 L/day. Boundary rejection covers dilution 8:1, PE 10,000,
  interaction, inland applicability, classification and Imax confirmation.
- Both browsers verified England/Scotland switching, imported catchments,
  Scottish applicability failure, the simpler combined branch, build-stamped
  local CSV, separate treatment allowances and exact reference links in the
  method library. The hydraulic observers counted 92 and 91 requests. The
  library observers counted 29 and 30. All found zero violations. Deferred
  loading, the Firefox shell and source confidentiality checks passed locally.
- The workspace accepts reviewed SEPA allowances. Empirical Imax and Q80/Q90
  estimation, extra jurisdictions, custom methodology, upstream trace, and
  the full permit and simulated-continuation comparison remain open.

### Common-baseline spill scenarios

- The Spills workspace compares reviewed local baseline and proposed sources
  for up to eight assets and up to eight proposals per asset. It splits one
  explicit project-clock window into reporting years and preserves the
  authoritative preceding 12/24 context. Count, duration and volume each
  have distinct comparability and withholding reasons. A common date range
  alone cannot establish comparable support.
- The calculation reuses the existing common-period and threshold engines,
  plus the reviewed positive discharge integration. Independent cases cover
  two versus three counts, 24 versus 48 hours and 8,640 versus 17,280 m³,
  unequal exclusion masks, unknown support, missing auxiliary flow, multiple
  years and invalid source associations.
- Chromium and Firefox checked asset and proposal editing, optional flow
  confirmations, exact deltas, asset/year filters, an incompatible case,
  pagination, an explicit CSV export and stale input handling. They observed
  95 and 93 requests with zero violations. The separate physical discharge
  register is preserved. Session review and CSV export retain source
  fingerprints, assignments, assumptions, periods and applied exclusions.
  The shared registry and saved project integration remain open under §13.

### Local data inventory and browser diagnostics

- IT Security shows ready source counts and selected file sizes, indexed
  result counts and typed allocation, named workspace and recovery copies,
  schematic autosave and current tab navigation state. Runtime capability
  checks describe observed API availability. Storage estimates are explicitly
  origin-wide, with a distinct unavailable or denied state. Source sizes,
  encoded text sizes and typed allocations have separate labels.
- Project routes expose their existing source and simulation removal controls.
  The new confirmed action removes only the named workspace storage key and
  its recovery copies. It preserves the active tab's data and schematic and
  unrelated keys on the shared origin. Claim SC-03 records this exact scope.
- Chromium and Firefox tested real synthetic uploads, simulation indexing,
  schematic import, saved workspace, cancel and confirm removal, a retained
  unrelated key, and a denied storage estimate. The request observers saw
  101 and 98 requests with zero violations. Both existing deferred and IT
  Security navigation checks also passed. The complete development Python
  suite at this point passed 414 tests and 111 subtests.

### Paired monitor diagnostics (`ee0fa6d`)

- Flow Survey FDV Health reviews concurrent signed velocity and depth,
  optionally with discharge and a confirmed circular section. Explicit
  thresholds control range, velocity change, near-flat depth and rising-depth
  candidates. Missing or excluded periods break adjacency. A source-timing
  action opens the existing Data review for drift and clock evidence. Findings
  are independent from the existing WAPUG, FSAT, RAG and volume-balance engines.
- The half-full 1 m diameter reference gives π/8 m² and about 0.471239 m³/s
  at 1.2 m/s. A synthetic 0.9 m³/s sample gives a roughly 90.99% difference.
  The new tests cover signed reverse velocity, crown and measurement evidence,
  source exclusions and elapsed-time gaps. See [Engineering methods](methods.md#paired-flow-monitor-investigation).
- Chromium and Firefox validated empty state, required engineering confirmations,
  channel selection, exact paired and checked sample counts, evidence filtering,
  review decisions, notes, paging, local CSV and Data handoff. The request
  observers saw 97 and 95 requests with zero violations. The separate lazy
  loading regression also passed on both. The full Python suite passed 417
  tests and 111 subtests, and the repository privacy suites passed.

### Spatial rainfall comparison (`ab1d5e5`)

- Flow Survey Rainfall check compares up to eight local rainfall channels on
  one explicit period. The engineer can select a current network WAPUG
  candidate or manual dates. The comparison reports independent support and
  flags without changing the WAPUG result. Exact global rainfall, mapped
  gauge and reviewed source exclusions are retained in the local audit.
- Complete hand-checkable gauges gave 6 and 12 mm, Pearson r of −5/11,
  +60 seconds second-gauge peak offset and spatial CV of 100/3%. Invalid
  and missing rainfall withheld event totals, produced chart gaps and left
  genuine recorded dry periods at zero. Mixed rate and interval depth,
  constant records, long gaps, an incomplete trailing bin and resource limits
  have numerical regression coverage. See [Engineering methods](methods.md#spatial-rainfall-comparison).
- Chromium and Firefox exercised ordinary Data import, optional gauge add and
  remove, disabled duplicates, native R/FDV plus association spreadsheet,
  calculation and selection of a fresh WAPUG event, invalidation after a
  gauge-specific exclusion, independent totals at the unaffected gauge, a
  formula-safe CSV and successful recovery from a resource limit. Request
  monitors saw 98 and 96 requests with zero violations. The deferred module
  and time-series transformation regressions also passed in both browsers.
  The full Python suite reached 421 tests and 111 subtests.
- A separate synthetic CPython check used 8 × 105,120 five-minute samples and
  8,760 hourly bins. It returned exactly 636 mm at the reference gauge with
  a measured 5.60 s and 19.85 MiB of traced new Python allocation. This run
  excluded source parsing, browser costs and production comparison.

### Flow Survey verification suitability (`0cd5715`)

- The Rainfall check reviews one workbook monitor and current WAPUG candidate
  at a time. Hydraulic and mapped rainfall time support use original valid
  intervals and exact applied exclusions. Reviewed instrument-range support,
  existing qualification, optional observed-flow coverage and site evidence
  remain independent findings. Existing FSAT response accompanies the screen.
  Candidate status is an engineering investigation aid. [Engineering methods](methods.md#flow-survey-verification-suitability)
- Independent tests verified 160 s of supported data and 40 s satisfying the
  reviewed range from a 240 s fixture, allowed signed reverse velocity,
  withheld results after missing rain or inadequate coverage and rejected
  invalid criteria. The full Python suite passed 425 tests and 111 subtests.
- Chromium and Firefox exercised empty and stale evidence, native FDV/R and
  association matching, a qualifying event, required review notes, failing and
  passing range criteria, optional flow, keyboard disclosure/close, the
  persistent Close action at 960 × 760 CSS pixels and a local formula-safe
  CSV with source fingerprints. The request monitors saw 100 and
  98 requests with zero violations. Deferred loading passed in both browsers.

### Multi-event verification matrix (`1f82fba`)

- The Verification workspace calculates reviewed monitor–scenario pairings
  over current Data or Flow Survey network-qualified events. It retains
  the native common-support values, signed metric errors, distinct criterion
  states, plot and engineer comments. It withholds full-event criteria with
  gaps or exclusions and separately withholds timing for tied peaks.
  [Engineering methods](methods.md#multi-event-verification-matrix)
- The independent 120 s flow case reports 180 vs 192 m³, +10% peak error,
  +6.6667% signed volume error and zero peak delay. The clipped 60 s offset
  case with L/s conversion gives 105 vs 114 m³. Tests also cover reverse
  relative errors, absolute depth errors, zero reference, tied peaks and
  incomplete data. The full local Python suite passed 430 tests and 111
  subtests before starting the revision-comparison milestone.
- Both desktop browsers checked 12 actual Data rainfall events, two monitor
  and scenario pairs, 24 comparisons, independent tolerances, event selection,
  paging, filtering, labels, local plot, comment, formula-safe export and
  cancellation. The confidentiality observers saw 99 requests in Chromium
  and 97 in Firefox with zero violations. The integrated native Flow Survey
  test also verified the WAPUG handoff. It saw 102 and 100 requests with no
  violations. The separate legacy Verification overview and lazy-loading
  regressions passed.
- A same-candidate CPython comparison on two 105,121-row local files
  (2,312,684 and 2,628,046 bytes) produced identical result JSON for 12
  event periods. Five alternating repeats gave median 0.489 s with bounded
  event slices versus 1.521 s reading the whole series from the warm cache.
  That check excludes browser overhead, parsing and production benchmarking.
- The engineering library indexes the three Flow Survey methods and matrix
  references. Both browsers verified its navigation, fixed HTTPS sources,
  no-referrer behaviour and rejection of a modified CIWEM link from synthetic
  staged data. There were 30 and 31 observed requests with no violations.

### Verification scenario revision tracking (`44ea202`)

- A named baseline can be retained in the current session or reopened as a
  validated local JSON snapshot. It records source fingerprints, channels,
  rainfall qualification, exact support, assumptions, signed metrics and
  review notes. The scenario comparison checks a common observed source and
  window, full raw support, recorded observed values and matching project
  criteria before comparing individual errors. Missing or duplicate matches,
  withheld criteria and changed evidence retain separate explanations.
  [Engineering methods](methods.md#verification-scenario-revision-tracking)
- Independent cases cover a reduced peak error, an increased volume error,
  unchanged timing magnitude, altered observations and support, missing or
  ambiguous baseline, different thresholds and incompatible units. The full
  development Python suite passed 433 tests and 111 subtests.
- The two browser runs exercised baseline capture, exact JSON round-trip,
  invalid file recovery, alternate simulated source, retained engineer note,
  filtered and paged comparisons, formula-safe CSV and changed-tolerance
  non-comparability. The −5% proposed peak improved from +10%. Other
  unchanged comparisons remain visible. Request observers saw 100 and 98
  requests with no violations. The responsive shell passed in both browsers.
  Shared workspace persistence and other report types remain separately
  tracked under sections 11 and 13.

### Hosted browser-source gate correction (`126b391`)

- The [hosted verify job](https://github.com/anzarsajid91/ICM_Graphing_Tool/actions/runs/44920994590/job/136896832452)
  failed when its Node sandbox evaluated browser interface registration
  alongside the extracted standalone rainfall-source helper. Registration for
  the two shared survey selectors now runs with the existing browser exports.
- The unchanged survey-source unit tests and the full workflow browser-source
  step passed locally, including FastPath/Python reference equivalence. The
  source, Python privacy and network-contract checks passed. Hosted check
  status remains specific to the exact candidate revision. The [hosted verify
  rerun at `37f5a0e`](https://github.com/anzarsajid91/ICM_Graphing_Tool/actions/runs/44923318300/job/136903923252)
  passed following the correction.

### Calibration investigation across hydrograph phases (`37f5a0e`)

- A selected flow comparison opens a local investigation with optional
  preceding, recovery and paired depth records. The preceding reference
  requires exact rainfall support and a reviewed limit. The screen preserves
  native agreement metrics and shows supporting observations, quantities and
  reasons independently. Suggested investigations cover loading,
  infiltration, storm response, timing, storage, controls and backwater.
  [Engineering methods](methods.md#calibration-investigation-across-hydrograph-phases)
- Independent cases verified 18 and 24 m³ of storm excess, residual recovery
  means of 0.08 and 0.15 m³/s, and 0.30 m of peak depth difference. Incomplete
  rainfall, wet and mismatched preceding periods, gapped storm flow and missing
  companion depth each have explicit withholding. The local Python suite
  passed 439 tests and 111 subtests.
- Chromium and Firefox exercised an ordinary flow-matrix entry, unavailable
  evidence, required confirmation, invalid preceding window, explicit time
  selection, paired depth and optional thresholds, exact support, local
  formula-safe CSV and close/focus restoration. The browser fixture returned
  60 versus 72 m³ of storm excess, 0.20 m depth difference and 60 of 60 s
  supported dry rainfall. Its guards saw 101 and 99 requests with no
  violations. The separate spatial rainfall and WAPUG regression passed
  with 104 and 102 requests and no violations.

### Circular Manning sizing (`641bde6`)

- Hydraulic Calculations includes a deferred circular Manning sizing surface.
  It handles a known fill depth, both possible normal depths, a continuous
  full-bore diameter and required uniform gradient. It shows section geometry,
  mean velocity, Reynolds number and Darcy-equivalent resistance. The new
  screen withholds low-Reynolds results. The circular conveyance root search
  is shared with the previous Colebrook–White normal-depth solver.
  [Engineering methods](methods.md#manning-circular-gravity-sizing)
- Independent reference values for a 600 mm pipe are 434.171726 L/s full,
  217.085863 L/s at half depth and 1.53556836 m/s in both at the tested
  gradient. The HEC-22 SI example inputs give continuous diameters 514.851153
  and 569.339451 mm at the two reviewed roughness values. Zero gradient,
  unsuitable Reynolds numbers, invalid depth and beyond-envelope results were
  exercised. The full Python suite passed 443 tests and 111 subtests.
- Chromium and Firefox checked the controls, full- and part-depth results,
  both branches, inverses, depth–discharge plot, trial retention and removal,
  local CSVs and fallback states. Their request observers saw 100 and 99
  requests with no violations. The unchanged original hydraulic workflow
  passed, including its 202.65 L/s and two normal depths. The method library
  and deferred loading regressions also passed in both browsers.
- The sizing viewport test exposed a shared Firefox header overflow of 24 px
  at a 640 px desktop viewport. The context grid now constrains its track to
  the available width and keeps the workspace tab strip independently
  scrollable. The reproduction isolates the layout change without altering
  any calculation and continues to check keyboard access at that width.

### Darcy full-bore gravity sizing

- The same sizing workspace provides laminar and Colebrook–White
  full-bore diameter and gradient, with explicit withholding in the
  transitional regime. Both methods share the circular section display,
  comparison trials and local calculation sheet.
  [Engineering methods](methods.md#darcy-full-bore-gravity-sizing)
- Independent cases recovered 600 mm at 424.115008 L/s and Darcy f of
  0.020 at Reynolds 900,000. The 10 mm case returned f of 0.064 at
  Reynolds 1,000. The suite also covers zero and invalid inputs, curve
  gaps, and required gradients beyond the screened domain. Python passed
  446 tests and 111 subtests.
- Chromium and Firefox exercised both sizing methods, transitions, CSV
  export, keyboard operation and the previous pipe capacity result of
  202.65 L/s. Request observers recorded 101 and 100 requests with no
  violations. The method-library and deferred-workspace checks passed in
  both browsers. The source, privacy and network-contract checks passed.

### Calculated-friction pipe system curves

- The system screen offers specified Darcy factors or an absolute
  roughness and viscosity basis. The engine computes branch losses, solves
  the common head at parallel branches, adds series head and keeps gaps
  where transition is unsupported. The quadratic pump solver still requires
  the specified-factor basis. [Engineering methods](methods.md#fixed-factor-pipe-system-screening-and-pump-duty)
- The independently constructed reference recovered Darcy f of 0.020 at
  Reynolds 900,000, with the single 600 mm stage reporting 0.860385555 m
  of dynamic loss and −1.139614445 m of total head. Separate tests cover
  series, a laminar branch in parallel with a turbulent branch, zero, a
  10⁻³⁰ m³/s mathematical boundary and transition between chart samples.
  A 100-branch synthetic CPython computation took 0.91 s including the
  41 display samples. Flow residual was 8.89×10⁻¹⁵ m³/s and the branch
  head range was 6.58×10⁻¹⁶ m. This excludes browser and worker startup.
- Chromium and Firefox verified controls, exact CSV values, transition
  gaps, switching modes and specified-factor pump and design-flow
  regressions. Request observers saw 101 and 100 requests respectively
  with no violations. Python passed 450 tests and 111 subtests. The source,
  28 Python privacy and network-contract checks passed.

### Hosted simulation workspace readiness check

- The [hosted browser-interactions job](https://github.com/anzarsajid91/ICM_Graphing_Tool/actions/runs/44944611774/job/136969053630)
  saw the visible deferred loading panel before the CSV controls had mounted.
  The browser regression now holds the fixed simulation asset response,
  observes the loading status, releases the response and waits for the input.
  It retains the original empty-state check and all sample, import and
  playback assertions. There is no runtime or privacy-policy change.
- Chromium and Firefox both passed the delayed-load test and full simulation
  results smoke with 32 guarded requests each and no violations. Hosted
  status must be checked on the subsequent PR revision.

### Mapped pump curve CSV

- A local preview lets an engineer choose independent pump curve columns
  and source units. The same authoritative validator checks imported and
  typed curves. The worksheet retains manifested source columns, units,
  SHA-256, actual single-pump and composite curve points, and whether
  the inputs were edited after import. No curve data or source labels are
  used in requests. [Engineering methods](methods.md#fixed-factor-pipe-system-screening-and-pump-duty)
- Independent checks convert 360 m³/h to 0.1 m³/s and 8 ft to 2.4384 m,
  preserve row order and reject duplicate flows, unsupported unit choices,
  formulas, missing cells, malformed quoting, non-finite values and excess
  points. Python passed 452 tests and 111 subtests.
- Chromium and Firefox checked file selection, malformed recovery,
  cancellation without replacement, explicit reversed-column mapping,
  720 m³/h and 5 ft conversion, edit provenance and the manual duty
  regressions. Request observers saw 101 and 100 requests with no
  violations. The method-library reference and privacy checks passed.

### Detriment scenario comparison

- The Detriment Assessment workspace compares up to six named proposals
  under the same reviewed report basis. It applies the existing pairwise
  engine with the same baseline, scope, threshold policy, units, datum and
  period identities. A proposal with incompatible inputs is withheld on
  its own. A scoped worker cache reuses prepared common reports without
  persisting data or changing the existing pair results.
- The per-category register pages through asset evidence and preserves the
  independent level and freeboard, or spill count and duration, criteria.
  Exact raw rows, mappings, thresholds and source fingerprints are kept in
  the explicit local audit. Changed report inputs invalidate previous
  comparisons. Spatial review remains open.
- The independent flooding fixtures retained +6 m³ detriment and −1 m³
  improvement while holding a mismatched assessment period. The level
  fixture reported a new breach at 0.35 m against a 0.5 m minimum. The
  block-row fixture retained 2 h of additional actual duration under its
  selected source basis. Python passed 454 tests and 111 subtests and the
  focused detriment and privacy checks passed.
- Chromium and Firefox tested all three categories, proposal controls,
  confirmation, a held incompatible report, paging, filters, the raw
  evidence dialog, local CSV, stale criteria and 960 px desktop containment.
  Their request observers saw 116 and 103 requests with no violations.
  Evidence screenshots use synthetic inputs only.
- The local CPython engine processed six 10,000-asset proposals in 2.32 s.
  It returned 21,645,699 bytes and peaked at 154,928 KiB RSS, up from
  54,104 KiB after programme startup. This excludes browser and worker
  costs. The comparison limits retained results to 120,000 rows per batch.

### Combined detriment asset evidence

- A combined register joins only reviewer-declared node or link IDs with
  the same baseline revision, proposal name and exact identifier.
  Unclassified report IDs stay within their category. Independent flooding,
  level, freeboard, spill-count and duration values retain their original
  assessment basis and can be inspected separately. The register has no
  aggregate severity score.
- Changes to a source, mapping or criterion withdraw the affected category
  from the register pending recalculation and renewed identity review.
  The local audit includes the selected baseline identity, asset type,
  build, source fingerprints, assessment basis and raw comparison evidence.
- Unit tests cover same-text node/link collisions, exact leading zeros,
  separate baseline revisions and unavailable proposal evidence. Both
  desktop browser suites exercised category inclusion and removal, a 91-row
  paged register, distinct baseline selection, the raw evidence drill-down,
  copied criteria, stale withholding and local CSV. Chromium and Firefox
  saw 116 and 103 guarded requests respectively, with no violations.
  The build, source and network-policy gates passed. Register selections
  are local to the current work session.

### Detriment proposal hotspots on imported networks

- After the engineer confirms the reviewed model revision and exact report
  IDs, a chosen proposal opens a temporary detailed-network layer. Matching
  uses original typed IDs only. Same-text nodes and links stay distinct.
  Ambiguous aliases, duplicate report identities, manually drawn objects and
  unclassified records are not auto-associated.
- Level, freeboard, flooding, spill count and duration are separate display
  criteria. The upstream and downstream actions follow recorded topology
  and skip unconfirmed link directions. Raw source evidence opens from a
  matched selected asset. Geometry replacement, edit mode, stale inputs
  and Hide clear the layer. It does not change geometry or saved evidence.
- Synthetic browser checks exercised the explicit review gate, adverse
  and all-state filters, a 0.35 m freeboard breach and independent
  one-node upstream and two-node downstream traces, raw evidence and Hide.
  Chromium and Firefox saw 119 and 106 guarded requests with no violations.
  The route and revision suites also passed in both. Unit cases verify typed
  collisions, duplicate aliases and unintended manual-name matches. The
  confidentiality source check, 28 privacy tests and request contracts passed.

### Portable simulation results package

- Indexed CSV results can be downloaded to one local, openly documented
  `.hbresults` file and reviewed and reloaded without remapping. It uses
  shared exact project-clock arrays and canonical binary64 values. Typed
  identities, original mappings, datum, source fingerprint, signed values
  and missing samples survive the round trip. Package fingerprints are
  calculated from the exact bytes read. [Format and controls](simulation-results.md#portable-results-package-v1)
- Unit tests cover exact sample and window equivalence, original hashes,
  extrema, corrupt length, invalid block geometry, repeated timestamps,
  non-finite values, budget withholding and cancellation. Both browser
  suites checked download, preview, truncated-file recovery, reimport,
  duplicate package detection and playback against native geometry. Each
  saw 32 guarded requests with no violations. The build and privacy gates
  passed.
- In one synthetic Node run, 40 result channels at five-minute steps for
  105,121 timestamps made a 54,965,841-byte CSV and a 34,488,880-byte package.
  The matched reader took 1,134 ms for CSV and 94 ms for the portable file.
  Encoding took 10.5 ms. Gzip reduced this regular CSV to 7,616,245 bytes
  in 1,074 ms. The uncompressed layout keeps exact offsets and avoids a
  decompression stage. The test held generation data and both indexes and
  reached 416,528 KiB cumulative process peak RSS. This is engine evidence
  excluding browser and production comparisons.

### Bounded file-backed simulation access

- The portable import can validate a local selected file and retain only
  block-end clocks and one block's cache. Exact frames read requested
  columns, and adjacent accesses reuse buffered values. Series and extrema
  use original samples across block boundaries. The source stays indexed
  under the same identity when a newly confirmed access mode replaces it.
  The tab never stores the file in persistent browser storage.
- A 5,001-sample contract fixture verified operation above its imposed
  full-copy budget, selective reads, cache hits, exact missing values,
  inter-sample withholding, windows and extrema across a block boundary.
  Both browser suites checked mode change, cancellation without replacing
  previous evidence, exact samples and map playback with 32 guarded
  requests each and no violations. The build and privacy gates passed.
- An independently written 81,595,147-byte annual file with 96 channels and
  105,121 timestamps exceeded the in-memory budget and indexed file-backed
  in Chromium in 1,459 ms and Firefox in 929 ms. The typed reserve was
  1,049,000 bytes. The keyboard jump to the exact final sample took 57 ms
  and 16 ms respectively in one local run. The browser request observer
  saw 32 requests each with no violations. Figures include command and UI
  latency, and the reserve is not total browser RAM.
- The same Node engine test indexed in 205 ms, averaged 0.51 ms at
  representative cross-block frames and scanned one full-series extrema
  in 16.2 ms. The native source was smaller for this low-precision fixture.
  The local browser exporter produces packages from indexed sources.

### Offline large-package production

- **Download CSV mapping** validates the local review configuration and
  exports its typed clock, units and column mappings in a fixed-name JSON.
  The offline Node converter shares the application parser and package
  writer, streams blocks to private temporary files, publishes only after
  validation, refuses to overwrite existing output and handles cancellation.
  No model access, network request or runtime dependency is involved.
  [Local converter instructions](simulation-results.md#produce-a-larger-package-locally)
- Tests verify byte-identical package production relative to the in-memory
  writer, an exact partial final block, failure cleanup and refusal to
  overwrite. The Chromium and Firefox regression exercised the mapping
  download with `00127` and `00129` preserved as text, native and portable
  import, file-backed playback and cancellation. Each observer saw 32
  requests with no violations. The source and privacy gates passed.
- The tool converted the 56,799,247-byte synthetic annual CSV to an
  81,595,147-byte file with 105,121 timestamps and 96 channels in 2,133 ms.
  Parsed header fields and the entire payload SHA-256 matched the
  independent reference writer. The process recorded a peak of
  128,452 KiB RSS with no retained results index during conversion.

### Exact playback windows and event selection

- The results reviewer and detailed schematic share project-clock window
  controls. Start and end are inclusive. The worker returns actual sample
  indices and endpoints for both memory and file-backed sources. The slider,
  transport and selected-series extrema follow that range. An empty range
  leaves the previous usable selection active. Event filters use the local
  source declarations. Returning to all events restores the selected source.
- Unit cases cover exact and non-exact endpoints, disjoint ranges, invalid
  order and a cross-block file-backed range. Chromium and Firefox verified
  sparse bounds, windowed extrema, empty windows, original source selection,
  single-sample playback, route playback, reset and package regressions.
  Each observed 32 guarded requests with no violations. Source and privacy
  gates passed on the changed candidate.
- The [previous hosted layout test](https://github.com/anzarsajid91/ICM_Graphing_Tool/actions/runs/44949144908/job/136983096899)
  found the new hotspot section shared the existing Review tools layout
  class. The hotspot now uses the general review section class. The unchanged
  400-point layout regression passed in Chromium and Firefox. Hosted
  confirmation remains tied to the next exact candidate revision.

### Exact conduit-end profiles and result layers

- A mixed indexed package offers result layers grouped by typed asset kind,
  quantity, unit, location and datum. A reviewed absolute-level layer can
  pair opposite conduit ends from the same simulation, revision, scenario
  and event. Each end uses the exact project-clock sample.
- The long section depicts separate end inverts and levels. For supported
  circular geometry, a diagrammatic fill is clipped at the soffit and
  pressure above it is drawn separately. Dry or unavailable ends withhold
  the fill. Link-end level and total head are kept distinct per the
  [Autodesk reference](https://help.autodesk.com/cloudhelp/2026/ENU/ICM-Help/files/GUID-174D9482-C7A3-4A12-B8E3-993F2C088F46.htm).
- Independent cases exercise a known two-thirds soffit crossing,
  0.6 m head above soffit, −0.2 m freeboard, dry and missing ends, and
  missing barrel geometry. Chromium and Firefox exercised wet, dry,
  surcharged and missing exact-clock data, a signed mixed-layer flow and
  the existing node-level plot. Both simulation runs observed 32 guarded
  requests with no violations. Route regressions independently observed
  135 Chromium and 134 Firefox requests with no violations.
- Scenario comparison, additional cross-section geometry and the exact
  release assurance gates remain open.

### Exact baseline and proposal playback

- Choose a compatible proposal after selecting the baseline result layer.
  The two declarations must agree on event, temporal support, asset kind,
  quantity, unit, location and datum. The engineer confirms the common
  project clock and asset mappings. Values and proposal-minus-baseline
  differences are independent fields. The map can shade each field and
  the long section marks available exact proposal node or selected
  conduit-end levels.
- Unit cases verify a zero and signed difference, missing and overflowing
  values, and rejection of mismatched event, datum, quantity, location or
  support. Chromium and Firefox verified a zero sample difference, an
  unmatched seven-minute versus eight-minute sample, a −0.3 m proposal
  difference, three map shading modes, proposal level marks and layer
  withdrawal after deleting either source. The request observer saw 32
  requests in each browser with zero violations. Existing source,
  privacy, and numeric unit checks passed locally.
- This stage compares results on a reviewed common network. Independent
  schematic extrema, proposed opposite-end fills and review of scenario
  geometry differences remain open.

### Independent schematic window extrema

- The schematic switches from exact instantaneous playback to minimum or
  maximum by selected asset and result layer. The source scan retains the
  timestamp of the first tied extreme, valid sample counts and unavailable
  values. A separate legend and status explain that extrema may occur at
  different times. The independent layer withholds a playback profile.
- The worker scans by indexed block and supports progress and cancellation.
  Memory-backed and file-backed cases agree on coverage, ties, signed values
  and exact timestamps. The file-backed tests cross an index block boundary
  and demonstrate a usable source after cancellation. Chromium and Firefox
  verified minimum −0.4 m³/s at 00:15, maximum 0 m³/s at 00:00, a restricted
  one-sample window, cancellation and return to playback. Each browser
  observed 32 guarded requests with no violations. Source and privacy
  gates passed locally.
- The hydrated annual synthetic package was 81,595,147 bytes with 96
  channels and 105,121 timestamps. A Node file-backed scan returned all
  exact reference extrema, occurrence timestamps and valid counts in
  175 ms. Repeated independent single-column requests took 583 ms in the
  same process. Observed peak process RSS was 116,376 KiB, including the
  reference calculation and Node runtime. The indexed typed reserve
  remained 1,049,000 bytes. This is a local engine measurement.

### Hosted preview artifact availability

- In the [hosted browser smoke job](https://github.com/anzarsajid91/ICM_Graphing_Tool/actions/runs/44952586905/job/136994776524),
  all application browser steps passed. Artifact 14726219977 finalized
  successfully, then the action's immediate by-name lookup reported it
  unavailable. The same exact ID was later visible in this run's REST
  artifact list. The archive verification and tested-manifest publication
  were skipped by GitHub when the download failed.
- The browser job now waits for the upload's exact ID in the current run
  before downloading it with the existing pinned action. Permissions
  add Actions read access to this job only. The existing manifest
  comparison and complete archive verification still determine success.
  Local tests covered immediate and delayed visibility, wrong and missing
  IDs, and the live read-only artifact lookup. A hosted run remains
  required to confirm the revised artifact handoff.
- The [following browser job](https://github.com/anzarsajid91/ICM_Graphing_Tool/actions/runs/44992125915/job/137117040313)
  passed every application browser step. The metadata wait could not
  compare IDs because the hosted runner lacks `rg`. It now uses the
  runner's standard exact-line match with `grep -xF`. The lookup still
  requires the current run's exact upload ID before archive verification.

### Reviewed hydraulic calculation sheets

- The shared v3 calculation form retains a current result snapshot with
  the reviewed inputs, source and method audit, equations, exact values,
  rendered results, application and worker revisions and calculation
  time. Review the sheet beside the calculation, print through a local
  window or download a standalone HTML and the existing CSV. Editing
  inputs or invalidating the linked source withdraws the sheet.
- The shared path covers system head loss, pump duty, structure screening,
  rated flow controls, Formula A, treatment design flows and storage
  routing. Pump duty sheets record the system branches as well as the
  measured pump curve and power equations. The rated-control sheet
  records its within-range interpolation equation.
- Chromium and Firefox checked the existing calculation values, the
  keyboard-accessible head-loss sheet, the same record in the opened local
  print view and HTML download, focus restoration and disabled export
  after an input change. The observer saw 101 Chromium and 100 Firefox
  requests with no violations. Chromium produced a PDF from the print
  view. The complete Python suite passed 454 tests and 111 subtests.

### Reusable assessment report layouts and preview

- The assessment builder offers editable templates for general reports,
  verification, spills and storage, flow survey and network
  investigation. Section order and inclusion survive workspace
  save/restore. Legacy saves use the established order. The existing
  settings, source provenance and engineer notes remain in the report.
- Network review uses the existing schematic renderer and identifies
  detailed and simplified views. The same report compiler supplies the
  downloaded HTML and local preview, including survey evidence checked
  by the existing freshness rules. The preview mounts its isolated
  document on demand. The original mixed-file import test exposed early
  mounting during a browser session with service workers blocked. The
  on-demand mount avoids a hidden frame during unrelated workflows.
- Unit and desktop browser checks verified report ordering, a manually
  reordered verification preview with interactive plots, equivalent
  local download, workspace restoration and a network-only schematic.
  The local request observer reported no violations in these tests.
  The [hosted Firefox shell](https://github.com/anzarsajid91/ICM_Graphing_Tool/actions/runs/44992125915/job/137117040302)
  detected sheet action padding outside the shared spacing grid. The
  unmodified Firefox shell passed locally after the spacing correction.
  The complete local Chromium acceptance passed with 1,707 guarded
  requests and no violations, including both mixed-file probes and the
  existing survey and report exports. Offline Firefox report controls
  passed with 27 guarded requests and no violations. Hosted evidence
  remains specific to each candidate revision.

### Reviewed contributing catchments for Formula A

- Native schematic assets open the existing Formula A workflow with a
  typed assessment point. The catchment CSV preview uses documented ICM
  drainage column names when available. The topology register traces
  node, composite link and catchment-transfer destinations and flags
  duplicate, disconnected and ambiguous records. Multiple lateral
  drainage and separate groundwater destinations require engineer review.
- Inclusion requires evidence and explicit shares for reviewed population,
  daily infiltration and daily trade. The same source ID can contribute
  once. Excluded and duplicate rows remain in the audit. The existing
  continuation-flow calculation applies the reviewed allowances. A
  changed network endpoint invalidates an earlier allocation review.
- Independent unit cases cover leading zeros, links, transfers, cycles,
  branches, pumps, unknown direction, missing IDs and duplicated inputs.
  In Chromium and Firefox the leading-zero manhole reached the chosen
  CSO, a disconnected record and separate groundwater record were
  excluded, and the duplicate rows stayed in the audit. Using 50%, 25%
  and 80% of the reviewed population, infiltration and trade yielded
  81,050 L/day. An imported endpoint change withdrew the result. The
  request observer recorded 104 Chromium and 103 Firefox requests with
  no violations. A pure JavaScript topology benchmark over 10,000 nodes,
  9,999 links and 100 records matched the reference 53 candidates and
  47 disconnected records in a median 148 ms across five runs.
- Automatic resolution of inheritance, direct import of structured
  lateral weights, sensitivity and comparisons with permit, pipe capacity
  and supported simulation evidence remain outstanding.

### Treatment flows, peak foul loading and gravity-section checks

- The Environment Agency treatment method preserves distinct dry-weather
  and maximum infiltration. It accepts an annual case or two reviewed
  winter and summer cases and shows the governing FFT and any ties.
  Its calculation reuses the treatment components already verified for
  SEPA, with separate method and source identity.
- The Uisce Éireann screen implements the published Appendix C Equation 1
  for new-network design foul flow, with reviewed domestic, commercial
  domestic, trade and infiltration inputs. The circular section review
  uses the existing section geometry for mean velocity and a supplied
  cleansing threshold. Uniform-flow confirmation is required to calculate
  mean boundary shear. The method library links the current primary
  references and the calculation sheets show provenance and equations.
- Independent outputs are 60,000 L/day for the England winter case,
  74,500 L/day for the governing summer case, 397,250 L/day for the
  Irish foul-loading case and 7.3549875 Pa for the half-full 600 mm
  section. Unit cases cover ties, incomplete periods, nonfinite input,
  unsupported depth and dry flow. Chromium and Firefox verified the
  screen results and local audits. The calculation request observers
  recorded 104 and 103 requests respectively. The method-library
  observers recorded 31 and 32 requests. All recorded zero violations.
  The complete Python suite passed 457 tests and 111 subtests.

### Wales, Ireland and documented continuation-flow methods

- Wales uses NRW GN066 version 2.0 of 29 July 2026, section 2.7. The
  screen records the project applicability and retains qualification
  evidence for each separate-system allowance. GN066 distinguishes the
  minimum design screen from the permit-specific flow check. GN021
  covers the separate unpermitted application process.
- The Irish combined option uses the EPA-published Department of the
  Environment overflow guidance, section 6.2, with the stated daily
  volume units converted to litres. It requires a reviewed combined
  design and licence basis. A reviewed separate method can use the
  documented project option when its equation is expressible by the four
  supported additive terms. The same documented option applies to a
  separately evidenced Northern Ireland consent. The method library
  and repository methods retain the regulator and water-company sources.
- Both browsers agreed with 180,500 L/day for the mixed Welsh case,
  160,000 L/day for the combined Irish case and 43,600 L/day for a named
  project equation. Both checked the refreshed permit evidence, method
  library and local worksheets. Their respective calculation and method
  library observers saw 104 and 31 Chromium requests, and 103 and 32
  Firefox requests, with no violations. The complete Python suite
  passed 459 tests and 111 subtests.

### Continuation-flow sensitivity, permit and capacity checks

- Each sensitivity run changes one of population, per-capita allowance,
  infiltration or trade effluent by the entered percentage and reruns the
  same reviewed framework. Invalid variants are identified individually.
  A reviewed permit setting and eligible circular conduit are compared
  independently in L/s. The sheet preserves the permit evidence, capacity
  assumptions, native conduit identity and source fingerprint.
- An independent 160,000 L/day case gave the 144,900–175,100 L/day
  population range. Both browsers verified 73,500–88,600 L/day for the
  integrated network case, a deficit against a 0.9 L/s permit value and
  288.09 L/s of steady full-pipe capacity. Reimport withdrew the stale
  result after a topology change. There were 104 guarded Chromium and
  103 Firefox requests with no confidentiality violations.

### Modelled continuation evidence during physical spills

- The worksheet compares two reviewed same-run link-end flows. It applies
  the existing physical threshold detector and bounded linear integrals
  to signed continuation. It records overflow coverage, supported and
  unknown continuation time, signed direction, typed identifiers and source
  fingerprints. Deficit and volume above the requirement are reviewed
  independently. Removing a selected source withdraws the sheet.
- Chromium and Firefox matched the independent reverse-flow and incomplete
  support case. The 240-second physical spill included 120 supported
  seconds and 120 unknown. Those supported segments gave 0.0975 m³ deficit
  and 0.0375 m³ above the requirement. Both exercises covered mismatched
  event filtering, repeated asset rejection, local worksheet output and
  removal. The observers recorded 107 and 105 requests with zero violations.
  The full Python suite passed 462 tests and 111 subtests.
- A synthetic annual CPython reference used 105,121 five-minute samples per
  channel. It matched 13,140 disjoint intervals, 7,884,000 seconds of
  physical spill time and 7,884 m³ deficit. Its median calculation time
  across five runs was 0.829 s. Process peak RSS was 151,400 KiB; this
  includes the test environment and reference arrays. Browser import and
  transfer costs are measured separately from this solver-only result.

### Native ICM land-use defaults

- The local catchment import can review a matching `hw_land_use` CSV.
  The Autodesk 2026 field contract supports area × density population
  and blank connectivity and wastewater-profile inheritance. Each row
  retains source values, units and its resolution basis. Explicit zeros
  remain original values. Missing fields and unresolved source tokens
  stay unavailable. Only an engineer-confirmed population proposal can
  fill the blank design population. Model connectivity, ground routing,
  profiles, base flow and trade metadata remain separate from permit
  eligibility and daily allowances.
- In Chromium and Firefox, 25,000 m² and 80 people/ha yielded 200 people,
  90% model connectivity and profile 2. An explicit-zero row retained
  all three zeros. The worksheet used a separately mapped allowance and
  agreed with the independent England result of 299,100 L/day. The flow
  observers counted 107 and 105 requests with zero violations. The two
  added method-library entries passed in Chromium and Firefox with 31
  and 32 requests and zero violations. The Python suite passed 463 tests
  and 111 subtests. Full ICM run compatibility remains unverified.

### Hosted folder-picker acknowledgment

- Hosted run 44996155758 passed the verification, security, browser-smoke,
  Firefox shell and performance jobs. Job 137127591090 failed in Playwright
  while waiting for its Firefox directory-selection acknowledgment. A
  minimal browser reproduction delayed the driver's listener and observed
  precisely that timeout while Firefox delivered trusted `input` and
  `change` events and selected both real fixture files.
- The existing acceptance now asserts the chooser target, pre-armed
  trusted events, exact selected files, recursive paths and completed
  application imports. A timeout alone remains a failure without that
  evidence. Chromium and Firefox independently passed with 104 and 102
  guarded requests and zero violations. Hosted exact-head CI still applies.

### Engineering calculation sheets in Reports

- The report builder can place selected current calculation sheets in
  the configured section order. Its dedicated calculation template
  presents the chosen sheets without unrelated series data. The preview
  and downloaded report retain the result, reviewed inputs, audit,
  the method version and calculation-worker identity. The compiler
  rechecks sheet freshness before returning the finished report.
- Workspace exports store the report section and calculation form IDs.
  Restoring the settings safely supports a calculation-only workspace
  with no graph mapping and requires fresh results from prior sessions.
  Chromium and Firefox exercised missing selections, a valid report,
  local download, stale rejection after an input edit, and save/restore
  with the selected sheet unavailable until recalculation. The request
  observers recorded 109 and 106 requests, with zero violations. Runtime,
  graph/report, Python and JavaScript privacy contracts and the 152-file
  Pages artifact checks passed locally.

### Portable assessment revision comparison

- Reports captures a named baseline or proposal, or opens a bounded
  version-one local snapshot. It records the application identity,
  current worksheet scalar results, settings, source basis, mapped
  verification and spill results, reviewer evidence and outstanding
  actions. It withholds stale results and keeps the recalculation action.
  The table and its local HTML/CSV export distinguish recorded changes
  from results with different methods, source support, units or missing
  values. An unchanged value by itself gives no improvement conclusion.
- Chromium and Firefox verified capture, independent fixed-factor pipe
  trials, valid and invalid snapshot files, status filters, reopening,
  and escaped offline HTML and spreadsheet-safe CSV. The audited setting
  changed from −1 m to −2 m of static head. The duty head changed on the
  same method, while a revision of the method marked the result as
  non-comparable. Request observers recorded 102 and 101 requests with
  zero violations. The independent JavaScript comparison and 153-file
  Pages integrity checks passed locally.
- Continue extending current evidence projections for storage, individual
  detriment criteria, network reviews and survey acceptance actions.

### Local rainfall analysis during worker recovery

- An extended Chromium regression exposed an intermittent local rainfall
  request during analysis-worker recovery. An independent test reproduced
  the `Reference Python worker is not ready` error by holding worker
  readiness between cumulative plotting and cross-gauge analysis.
- Worker readiness now covers restoration of the existing channel
  interpretations. Rainfall requests wait for the current recovery and
  discard stale generations. Retrying a computation is bounded to an
  identified worker replacement. The reproduced timing case, worker
  recovery and runtime regression checks passed. Chromium and Firefox
  rainfall audits both passed with 101 guarded requests and zero
  violations. The existing mixed-file and full live workflows remain
  required on the final release candidate.

- The follow-up Chromium regression against the complete local preview
  passed 604 guarded requests with zero violations. It ran the same
  browser script in its live-target mode against localhost, including
  both mixed-sibling import probes, and excluded the additional CI-only
  full-suite probes. Final hosted and production checks remain required.

### Reviewed direction on the simulation map

- Recorded link-flow arrows use the engineer-confirmed positive direction
  relative to the imported endpoints. Nominal topology stays visible.
  Zero and missing samples have no recorded direction mark. Independent
  extrema and scenario differences have no instantaneous flow arrow.
- The same synthetic −0.4 m³/s link sample drew opposing arrows under
  the two explicit conventions. Chromium and Firefox verified the SVG
  direction geometry, keyboard navigation, zero and missing samples,
  camera changes, independent extrema and layer removal. Both browser
  observers counted 32 requests with zero violations. Network and
  simulation unit regressions passed locally.

### Ground-level freeboard thematic results

- An indexed node or link-end level can be displayed as the ground
  elevation minus its exact recorded sample. The geometry and results must
  declare the same datum. Link ends use the source ground at the matching
  endpoint. Missing geometry remains unavailable. Comparing proposals
  requires confirmation of the shared ground elevations and datum.
- The independent minimum freeboard uses the maximum recorded level,
  and vice versa. Chromium and Firefox checked the 10.5 m ground reference,
  a 0.25 m margin, an above-ground result of −0.2 m and the +0.3 m proposal
  difference on the exact clock. Both checked missing datum rejection and
  the timestamps of the independent extrema. The request observers each
  counted 32 requests with zero violations.

### Source conduit geometry thematic layers

- The detailed schematic can shade imported width and height in mm and
  gradient in m/m on an explicit scale. The gradient uses the reported
  value where available and the difference between source inverts over
  source length otherwise. A zero source gradient remains zero. Adverse
  gradients retain their negative sign. Missing geometry has separate
  styling and structures retain their existing appearance.
- Chromium and Firefox both checked the 600 mm dimensions, positive
  0.002 m/m gradient, adverse −0.001667 m/m gradient, missing-length
  conduit and unaffected pump. Both checked invalid scale rejection,
  layer removal and switching back to simulation playback. The request
  observers each counted 32 requests with zero violations.

### Reviewed full-capacity utilisation

- An optional same-run Pipe full capacity table uses the documented
  Autodesk PFC result and typed conduit identities. The local worker
  checks mapped units, file fingerprints, duplicates, scope and resource
  limits. Failed, cancelled or missing tables preserve existing sources.
  Only relevant asset keys are retrieved for a map layer.
- Utilisation is 100 times recorded flow magnitude divided by positive
  imported PFC. Missing or zero capacity withholds the ratio. Independent
  extrema come from the exact magnitude samples. A proposal uses its
  own reviewed table, and the difference is in percentage points.
- Chromium and Firefox verified zero, missing and reverse flow,
  a −0.4 m³/s sample and 0.5 m³/s capacity giving 80%, and a separate
  proposal giving 90% and a +10-point difference. Both verified exact
  extrema, cancellation, duplicate rejection, table removal and layer
  withdrawal. Their observers each counted 32 requests with no
  violations. In-memory and file-backed magnitude tests agreed.

### Source-backed chambers, soffits and control structures

- Long sections use documented closed conduit shapes, source height and
  original invert levels. The chamber roof must be above the floor and at
  or below ground when ground is known. Unsupported units and unknown shape
  geometry remain unavailable. Pump, weir, orifice and sluice marks distinguish
  source levels from schematic symbols. A structure adds no inferred pipe
  length to chainage.
- The independent fixture checked a 100 m rectangular pipe (0.5 m high),
  four coincident structures, a 0.6 m egg section and a source chamber roof
  of 11 m. It also checked 10.9 m weir crest, four other control levels and
  the rejection of a feet declaration. Chromium and Firefox verified the
  five marks and keyboard inspection from the profile into Explore. Their
  route request observers recorded 136 and 135 requests with no violations.
  Chromium simulation playback also passed with 32 requests and no
  violations. The static source gate, 28 Python privacy tests and the
  153-resource artifact integrity check passed. Synthetic screenshots are
  recorded under `hydra-evidence/v3/profile-controls/`.

### Native network scale and desktop interaction

- The 32 MiB native CSV input limit remains. The native geometry schema now
  supports up to 6,000 nodes and 6,000 links, with individual rejection cases.
  Manual and canonical limits remain covered by the existing suites. Dense
  detailed maps use clipped source geometry, compact drawing and zoom or asset
  search for inspection. Panning updates the SVG viewport during the gesture
  and refreshes its interactive detail after release. The topological overview
  and original network are retained separately. Local JSON restores all typed
  assets after clearing the map. Browser recovery storage remains quota-bound.
- Matched localhost runs used the exact production v2.2.0 artifact
  (`5882ebf60da8ee89d0ec10a0374b95fc548cc569`) and the candidate with the
  same desktop browser settings and generated 399, 1,599 and 10,001 assets.
  Times are individual end-to-end wall-clock observations through two paint
  frames. A pan includes 12 automated pointer movements and the restored
  detailed view on release.

| Browser, assets | v2.2 apply and fit | Candidate apply and fit | v2.2 pan | Candidate pan |
|---|---:|---:|---:|---:|
| Chromium, 399 | 327 ms | 324 ms | 941 ms | 393 ms |
| Chromium, 1,599 | 777 ms | 894 ms | 3,758 ms | 1,269 ms |
| Chromium, 10,001 | Import rejected | 378 ms | Unavailable | 579 ms |
| Firefox, 399 | 431 ms | 342 ms | 982 ms | 504 ms |
| Firefox, 1,599 | 1,355 ms | 1,306 ms | 3,999 ms | 1,922 ms |
| Firefox, 10,001 | Import rejected | 605 ms | Unavailable | 791 ms |

- The largest synthetic CSV is 344,830 bytes. Candidate preview took 343 ms
  in Chromium and 364 ms in Firefox, and search inspection took 267 ms and
  376 ms. The native detailed map kept 96 individual graphics at full extent
  alongside the source coordinates of the ordinary assets. Chromium reported
  33,988,360 bytes of used JavaScript heap after the overview interaction.
  That figure excludes native browser and graphics allocations. The same
  fixture without windowing and compact paths used approximately 74.5 MB of
  JavaScript heap and a 23.4 s scripted pan. Chromium applied the middle
  candidate fixture 117 ms slower in the matched single run. Smaller-network
  repeated performance and dense thematic playback remain separate checks.
- Both scale suites watched every request, with zero violations. They are
  wired into the existing protected browser-interaction workflow. Local raw
  results and synthetic screenshots are under `hydra-evidence/v3/network-scale/`
  and `hydra-evidence/v3/network-scale-final/`.

### Paired proposed conduit-end profiles

- The proposed scenario can use its own reviewed opposite-end level source.
  The current route and datum require explicit review for both revisions.
  Companion lookup stays local and selects the typed route links at the exact
  timestamp. Missing ends and dry transitions withhold a connecting line.
  An out-of-date route review withholds proposed levels from the profile
  while keeping the independent map comparison. A different geometry needs
  a separate route review against its own model export.
- Both desktop browsers verified the two exact proposal levels, a one-minute
  companion clock mismatch, a dry end at invert, and 0.3 m of reported head
  above the shared soffit (10.9 m level and 10.6 m soffit). Both checked that
  a changed route clears the geometry review. The request observer counted
  32 requests with no violations in each browser. Simulation result and
  route unit suites and the 153-resource artifact integrity check passed.

### Distributed drainage evidence for Formula A

- A documented ICM Open Data Export Centre flat report preserves each parent
  catchment and composite receiving link identity, displayed fraction or
  percentage, source row, review note and file fingerprint. The worksheet
  checks distinct columns, complete fractions, unique destinations and
  typed nominal connectivity. It flags routes through control inlets for
  review and follows transferred catchments to the terminal lateral grid.
  An updated source length or endpoint withdraws the previous result.
- The synthetic grid connects 25% to a candidate path and 75% to a
  disconnected path. Both desktop browser suites mapped the generic headers,
  removed and reattached the input, reviewed each path and confirmed separate
  25% population, 0% infiltration and 10% trade shares. Their audited Formula A
  calculation matched 111,850 L/day, with a population sensitivity of
  101,280 to 122,420 L/day. The two observers saw 109 and 106
  requests with no violations. The 153-resource artifact, route unit checks
  and 464 Python tests plus 111 subtests passed.

### Native fixed domestic and trade event profiles

- The event CSV reader follows Autodesk's published fixed profile, identity
  and unit records. It distinguishes domestic per-capita units from fixed
  trade factors. The model audit uses reviewed inherited or explicit source
  population, connectivity and profile, with additional foul flow and raw
  base flow kept separate. Event interpolation, timestamps and calibration
  multipliers are outside this nominal source-loading assessment. A selected
  per-capita rate enters Formula A only after a separate project-basis review.
- Chromium and Firefox independently confirmed the 200-person, 90%-connected
  case, a 160 L/head/day fixed rate, 864 L/day of additional foul flow and
  29,664 L/day of nominal domestic loading. A separately imported 1.25 legacy
  factor produced 2,160 L/day model trade flow, with the reviewed regulatory
  trade and infiltration untouched. The worksheet rejected incompatible event
  type, conflicting unit, competing domestic mapping and missing run note.
  Both browsers verified the 306,100 L/day Formula A result and its exact
  audit, with 109 and 106 guarded requests and no violations. Python covers
  duplicate or invalid profile IDs, invalid numeric tokens, missing values,
  explicit disabled profiles and source unit conflicts.

### Rectangular and trapezoidal gravity sizing

- The current Gravity sizing worksheet also supports rectangular open
  channels, closed rectangular conduits and symmetric trapezoidal channels.
  Both shapes use the existing Manning resistance and Reynolds screen.
  The closed rectangular case distinguishes its wetted-crown full-bore
  capacity from its limiting free-surface conveyance. The open cases
  report Froude number, specific energy and critical depth where supported.
- Independent checks used FHWA HDS-4 example 4.1 (2.056083666 m³/s without
  intermediate rounding), a 0.500 m critical depth, and a closed box at
  3.064784761 m³/s free-surface limit and 2.338868511 m³/s full-bore flow.
  Both Chromium and Firefox verified shape selection, bounds, normal-depth
  inversion, separate plot references, retained trials and CSV exports.
  Both preserved the existing circular Manning and Darcy reference results.
  The two browsers saw 102 and 101 requests with no violations. The Python
  suite passed 474 tests and 111 subtests. The 153-resource artifact passed
  its integrity check, and synthetic screenshots are retained locally.

### Method library index recovery and expansion

- The staged build exposed a renamed circular Manning heading used by the
  method index. The existing key is restored. Separate entries now document
  rectangular and trapezoidal gravity sizing, fixed ICM event loading and
  derived interval support. The additional federal reference is restricted
  to one approved static FHWA PDF with the existing no-referrer link policy.
- A fresh full Pages build staged 30 method entries and passed artifact
  integrity. Chromium and Firefox verified the index counts, all original
  filters and references, and the three new method entries. Their request
  observers saw 31 and 32 requests respectively, with no violations.
