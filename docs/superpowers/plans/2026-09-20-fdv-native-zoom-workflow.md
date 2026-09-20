# ICM Graphing Tool — FDV Native Zoom & Workflow Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the screenshot-driven graphing, mapping, navigation, provenance and performance refinements while preserving established hydraulic calculations and merge the verified result to `main`.

**Architecture:** Keep the existing Python/Pyodide engineering kernel as the source of canonical calculations. Refactor only the browser presentation/mapping layer plus the range-aware display payload so FDV channels render as stacked shared-time panels and zoom requests progressively reach native source resolution. Preserve route IDs/state compatibility while replacing clumsy visible controls with compact adapters over existing mapping state.

**Tech Stack:** Vanilla JavaScript, Plotly, Pyodide/Pandas/NumPy, CSS, Playwright/Chromium/Firefox, GitHub Actions/Pages.

**Spec:** `docs/superpowers/specs/2026-09-20-fdv-native-zoom-workflow-design.md`

## Global Constraints

- FDV panel order with rainfall mapped: Rainfall (inverted) → Flow → Depth → Velocity.
- Flow unit: `m³/s`; Depth: `m`; Velocity: `m/s`.
- Calculations remain native-resolution and separate from display downsampling.
- Missing values and gaps must not be bridged.
- Observed depth remains red; first model remains the established purplish blue; rainfall default remains unchanged.
- Product name: `ICM Graphing Tool`.
- Primary workspace labels: `Data & Time Series`, `Flow Survey`, `Rainfall`, `Assessment`, `Spills`, `Report`.
- Remove the user-facing provenance page/export but retain internal lineage/fingerprints needed for reports/workspaces.
- No Plotly range slider/overview strip.
- Existing engineering parity tests are mandatory before merge.

## Review Focus

1. FDV source missing one hydraulic channel: only available panels render and relative order stays canonical.
2. Mixed CSV + FDV models: model traces enter the matching quantity panel when quantity is resolved; unresolved mismatches do not corrupt another panel.
3. Very long 1-minute series: full view is reduced, deep zoom reaches `display_count == raw_count`, and stale zoom responses cannot overwrite the latest window.
4. Workspace save/restore after new colour controls and compact selector: canonical mappings and colours restore without breaking schema compatibility.
5. Provenance removal: user-facing route/export disappears while generated reports/workspaces still retain source fingerprints and method audit data.

---

### Task 1: Lock screenshot-driven acceptance contracts

**Files:**
- Modify: `web/tests/smoke.mjs`
- Modify: `web/tests/precision-shell.mjs`
- Modify: `web/tests/runtime-unit.mjs`

**Interfaces:**
- Consumes: existing DOM IDs, `window.__ICM_WORKBENCH__`, `window.ICMGraph`.
- Produces: regression contracts for FDV panel ordering, native zoom, selector UX, colour controls, stable navigation, branding and provenance removal.

- [ ] **Step 1: Add failing browser/structural assertions**

Add assertions equivalent to:

```js
// FDV plot order and separate axes/panels.
const layout = await page.evaluate(() => {
  const c=document.querySelector('#timeChart');
  return {
    mode: window.__ICM_WORKBENCH__.lastGraphMode,
    order: window.__ICM_WORKBENCH__.lastPanelOrder,
    axes: Object.fromEntries(
      Object.entries(c.layout).filter(([k])=>/^yaxis\d*$/.test(k))
        .map(([k,v])=>[k,{title:v.title?.text||v.title,domain:v.domain,overlaying:v.overlaying}])
    )
  };
});
if(JSON.stringify(layout.order)!==JSON.stringify(['rainfall','flow','depth','velocity'])) throw new Error(...);
if(Object.values(layout.axes).some(x=>x.overlaying==='y')) throw new Error(...);

// Deep zoom must become native.
await page.evaluate(()=>window.ICMGraph.draw(['2026-01-01T00:00:00','2026-01-02T00:00:00']));
await page.waitForFunction(()=>Object.values(window.__ICM_WORKBENCH__.lastGraphPointCounts||{}).filter(Boolean).every(x=>x.native));
```

Add selector assertions for a compact trigger, search box and checkboxes, colour-control assertions for observed flow/depth/velocity + selected model(s), stable sidebar state across route changes, exact product/workspace labels, and absence of a provenance route/export control.

- [ ] **Step 2: Run branch CI and confirm RED**

Run GitHub Actions for the branch. Expected: browser/shell acceptance fails specifically because current FDV uses overlay axes, current model selector is visible multi-select, rail state is route-coupled, old branding/provenance remain, and/or deep zoom remains capped.

- [ ] **Step 3: Commit tests**

Commit message: `test: lock graphing workflow refinement acceptance`

---

### Task 2: Make display range progressively native without changing calculations

**Files:**
- Modify: `src/icm_workbench/browser_api.py`
- Modify: `web/assets/workbench-v2.js`
- Modify: `web/tests/runtime-unit.mjs`
- Modify: `scripts/benchmark_workbench.py`
- Modify: `docs/performance.md`

**Interfaces:**
- Consumes: `series_data(path, column, max_points, start, end, max_gap_seconds)`.
- Produces: range-sliced display payload with `raw_count`, `display_count`, `native_resolution`; browser adaptive budget helper based on visible raw density.

- [ ] **Step 1: Add focused failing tests**

Add a unit/browser test proving:
- full one-year range returns reduced display data;
- a one-day window returns every underlying point when below the native ceiling;
- display statistics still reflect the full visible native window;
- repeated range calls reuse prepared-series cache.

- [ ] **Step 2: Verify RED**

Expected: current browser hard-codes 60,000 points for every zoomed window and does not expose progressive budget/native-ceiling behaviour.

- [ ] **Step 3: Implement adaptive display policy**

In `workbench-v2.js`, replace the fixed zoom policy with helpers conceptually equivalent to:

```js
const OVERVIEW_POINTS = 12000;
const NATIVE_RENDER_CEILING = 120000;
function displayBudget(rawCount, range, fullRange) {
  if (!range) return OVERVIEW_POINTS;
  if (rawCount <= NATIVE_RENDER_CEILING) return rawCount;
  const ratio = visibleDuration(range) / Math.max(1, visibleDuration(fullRange));
  return Math.min(NATIVE_RENDER_CEILING, Math.max(24000, Math.round(OVERVIEW_POINTS / Math.max(ratio, 0.02))));
}
```

Use a lightweight metadata/count path or a first range slice result to determine the visible raw count. Keep range slicing before sampling, stale-generation cancellation and debounce. Prefer `scattergl` for long line traces. Do not modify comparison/spill/survey algorithms.

- [ ] **Step 4: Benchmark**

Extend `benchmark_workbench.py` with a one-year 1-minute synthetic series and record overview vs one-day window display preparation timings/counts in `docs/performance.md`.

- [ ] **Step 5: Verify GREEN**

Run Python unit tests + JS runtime tests + browser smoke focused on zoom. Expected: reduced full view, native deep zoom, unchanged engineering results.

- [ ] **Step 6: Commit**

Commit message: `perf: refine graphs to native detail on zoom`

---

### Task 3: Render FDV as stacked Rainfall → Flow → Depth → Velocity panels and rebuild statistics

**Files:**
- Modify: `web/assets/workbench-v2.js`
- Modify: `web/assets/workbench-v2.css`
- Modify: `web/tests/smoke.mjs`

**Interfaces:**
- Consumes: `observedGraphSeries()`, `seriesQuantity()`, `seriesUnit()`, adaptive `v2SeriesFor()`.
- Produces: Plotly layout with independent Y-axis domains, `window.__ICM_WORKBENCH__.lastPanelOrder`, native-resolution engineering statistics table.

- [ ] **Step 1: Add failing FDV composition/statistics assertions**

Assert:
- panel order is rainfall, flow, depth, velocity;
- each hydraulic axis has its own non-overlapping domain and no `overlaying`;
- correct engineering units;
- depth threshold overlays target depth axis;
- statistics include period, rainfall total, flow volume and rows for flow/depth/velocity.

- [ ] **Step 2: Verify RED**

Expected: current code uses y/y3/y4 overlaid in one hydraulic domain and generic statistics.

- [ ] **Step 3: Implement stacked domains**

Build ordered panel descriptors:

```js
const PANEL_ORDER=['rainfall','flow','depth','velocity'];
const panelSpecs = availableQuantitiesIn(PANEL_ORDER);
```

Assign non-overlapping Plotly axis domains, shared X, inverted rainfall, and route each observed/model trace to its quantity axis. Keep single-series CSV behaviour compact.

- [ ] **Step 4: Implement engineering summary**

Render two compact sections below the graph:
- visible/selected period summary (time range, rainfall depth, flow volume, status);
- series statistics matrix (Series, Unit, Minimum, Mean, Maximum, Total).

Use `series_data.statistics` from native visible range. Never derive totals from plotted arrays.

- [ ] **Step 5: Verify GREEN and capture screenshot**

Browser smoke must capture populated FDV graph evidence showing all four bands and statistics.

- [ ] **Step 6: Commit**

Commit message: `feat: restore stacked FDV hydraulic graph workflow`

---

### Task 4: Replace model multi-select and expose per-series colours

**Files:**
- Modify: `web/index.html`
- Modify: `web/assets/runtime.js`
- Modify: `web/assets/workbench-v2.js`
- Modify: `web/assets/workbench-v2.css`
- Modify: `web/tests/smoke.mjs`

**Interfaces:**
- Consumes: canonical `#modelSelect`, `state.mapping.models`, `state.modelColours`.
- Produces: `#modelPickerTrigger`, searchable checkbox popover, observed quantity colour map, workspace-compatible colour state.

- [ ] **Step 1: Add failing selector/colour tests**

Assert:
- native multi-select is not the visible primary control;
- trigger reports selected count;
- search filters options;
- checkbox toggles update the hidden canonical select and `state.mapping.models`;
- Select all/Deselect all work;
- colour pickers exist for observed flow/depth/velocity, selected models and rainfall;
- changing one picker redraws only the intended trace colour.

- [ ] **Step 2: Verify RED**

Expected: large multi-select is visible and FDV flow/velocity colours are hard-coded.

- [ ] **Step 3: Implement compact selector adapter**

Keep `#modelSelect` hidden-but-functional for backward compatibility. Build an accessible popover with search and checkboxes sourced from its options. Dispatch `change` to the canonical select so existing mapping/workspace paths remain authoritative.

- [ ] **Step 4: Implement colour state**

Extend state with observed quantity colours while preserving `modelColours`. Use defaults:
- depth: red;
- flow: original-tool blue/teal distinction as visually appropriate without conflicting with model blue;
- velocity: green/orange distinct default;
- first model: established purplish blue;
- rainfall: unchanged.

Include these controls in workspace save/restore using a backward-compatible optional field.

- [ ] **Step 5: Verify GREEN**

Run unit/browser tests and inspect populated mapping screenshot.

- [ ] **Step 6: Commit**

Commit message: `feat: compact model mapping and series colour controls`

---

### Task 5: Stabilise navigation, rename product/workspaces, and remove user-facing provenance

**Files:**
- Modify: `web/assets/precision-workbench.js`
- Modify: `web/assets/precision-workbench.css`
- Modify: `web/index.html`
- Modify: `web/tests/precision-shell.mjs`
- Modify: `web/tests/smoke.mjs`

**Interfaces:**
- Consumes: current Precision route IDs and session storage.
- Produces: persistent explicit rail collapse state, revised labels, no provenance route/export.

- [ ] **Step 1: Add failing shell assertions**

Assert:
- visible product title is exactly `ICM Graphing Tool`;
- workspace labels are exactly the six approved names;
- a sidebar collapse/expand button exists;
- user-selected collapsed state survives navigation between multiple sub-tools;
- route navigation never implicitly changes rail state;
- no visible provenance page/nav/export control remains.

- [ ] **Step 2: Verify RED**

Expected: current title/labels and route-coupled rail logic fail.

- [ ] **Step 3: Implement stable navigation**

Introduce an explicit persisted `navCollapsed` preference independent from focus canvas. Route navigation only changes content; the rail changes only via its control. Keep old route keys for deep-link compatibility.

- [ ] **Step 4: Remove provenance surface**

Delete the provenance page from visible route definitions and remove its export action. Preserve internal registry/source hash data and report/workspace audit payloads.

- [ ] **Step 5: Verify GREEN**

Run shell + browser acceptance across Data & Time Series, Flow Survey, Rainfall, Assessment, Spills and Report.

- [ ] **Step 6: Commit**

Commit message: `refactor: simplify graphing tool navigation and audit surfaces`

---

### Task 6: Full regression, visual QA, code review and main integration

**Files:**
- Modify only if a regression/review finding requires a tested fix.
- Evidence: GitHub Actions artifacts/screenshots/logs.

**Interfaces:**
- Consumes: all previous tasks.
- Produces: verified branch and merged `main`.

- [ ] **Step 1: Run full engineering suite**

Run the repository's Workbench CI and Pages browser acceptance. Required:
- Python tests green;
- JS runtime/domain/precision tests green;
- Chromium smoke green;
- Firefox shell/browser check green;
- build succeeds.

- [ ] **Step 2: Verify engineering parity**

Read the smoke log and confirm current accepted values for rainfall totals, FM03 flow-continuity status/ratio, exclusion seconds, spill results, comparison/storage/report/workspace paths remain unchanged.

- [ ] **Step 3: Inspect screenshots**

Inspect populated screenshots for:
- FDV Rainfall/Flow/Depth/Velocity stack;
- model checkbox dropdown;
- per-series colour controls;
- stable expanded and collapsed navigation;
- report/workspace page without provenance clutter.

Reject the branch for clipping, overlapping labels, hidden units, scroll traps or unreadable statistics.

- [ ] **Step 4: Run final code review**

Review diff from `main@9aa5145...` to branch HEAD against the spec. Fix any Critical/Important issue via RED→GREEN test and rerun the full suite.

- [ ] **Step 5: Merge to main**

Because the user explicitly requested the updates on `main`, merge only after all gates above are green. Then verify the post-merge Pages workflow and live Pages verification against the new `main` HEAD.

- [ ] **Step 6: Final evidence**

Report branch commits, merge/main SHA, test workflow IDs/conclusions, numerical parity, performance evidence, and screenshot artifacts.
