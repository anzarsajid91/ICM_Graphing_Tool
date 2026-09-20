# ICM Graphing Tool — FDV, Native Zoom, Mapping & Workflow Refinement Design

Date: 2026-09-20  
Base: `main@9aa5145ccbf994a2cbbd8f54216039347a1e8260`  
Branch: `feat/fdv-native-zoom-workflow-2026-09-20`

## 1. Purpose

This batch resolves the remaining graphing, mapping, navigation and performance issues observed in the current browser workbench while preserving the existing engineering calculation kernel.

The user outcome is a professional hydraulic-modelling workflow where:
- FDV hydraulic channels are visually separated and immediately readable;
- long telemetry/model series open quickly but refine toward native timestep detail as the user zooms;
- multi-model selection is compact and understandable;
- plotted-series colours are fully controllable;
- page/navigation structure is stable and predictable;
- low-value user-facing provenance clutter is removed without weakening internal auditability.

No engineering calculation is to be changed unless a failing regression proves the calculation itself is wrong.

## 2. Original-source behaviour to preserve

The root `app.py` remains the reference for the original local-tool plotting conventions.

Relevant V18 behaviour:
- `V18_HYDRO_CHANNELS` defines Flow (`m³/s`), Depth (`m`) and Velocity (`m/s`).
- The V18 plotting path uses vertically stacked shared-time subplots rather than overlaying all hydraulic quantities on one axis.
- Rainfall is rendered in an upper band with a reversed/inverted axis.
- Hydraulic quantities have independent engineering units.
- The local tool uses reduced display points while calculations operate on the source data.
- The original UI supports explicit colour controls for plotted series.

The browser workbench must adopt these useful presentation patterns without reintroducing the local Dash app architecture.

## 3. FDV time-series composition

### Required order

When an observed FDV source exposes all three canonical hydraulic quantities and rainfall is mapped, the graph stack is:

1. Rainfall — inverted upper band
2. Flow
3. Depth
4. Velocity

If rainfall is absent, the hydraulic panels remain Flow → Depth → Velocity.

If one or more FDV quantities are absent, only available panels are shown while retaining the canonical relative order.

### Panel behaviour

- Panels share the same X/time range and zoom.
- Each hydraulic quantity owns its own Y axis and unit:
  - Flow: `m³/s`
  - Depth: `m`
  - Velocity: `m/s`
  - Rainfall: resolved rainfall unit, normally `mm/h`, shown inverted.
- Observed and matching model traces for the same quantity appear in the same panel.
- No FDV hydraulic quantity may be represented by an overlaid secondary/tertiary Y axis.
- Depth spill/threshold overlays are drawn only on the depth panel unless a threshold is explicitly quantity-specific.
- Missing values and source gaps remain visually disconnected.
- Hovering aligns vertically across the shared timestamp while reporting the local panel quantity and unit.

### Non-FDV behaviour

Single-series CSV workflows continue to use one hydraulic panel plus the optional rainfall band. Existing comparison/spill/assessment calculations keep their current mappings.

## 4. Series statistics

Below the time-series stack, render an engineering summary inspired by the original local-tool layout.

### Period summary

Show:
- visible/selected time range;
- total rainfall depth for the assessed visible period when rainfall is available;
- integrated flow volume when a dimensional flow series with resolved `m³/s` units is available;
- validity/coverage status where totals are incomplete or withheld.

### Quantity statistics

Render a compact matrix with rows for the currently plotted quantities/series and columns for:
- Series
- Unit
- Minimum
- Mean
- Maximum
- Total where dimensionally meaningful

Requirements:
- statistics use native source resolution for the visible/selected window, never display-downsampled values;
- irregular timestep and gap validity rules remain canonical;
- flow volume uses actual timestep integration;
- rainfall total uses the existing validity-aware rainfall accumulation path;
- unresolved units withhold dimensional totals rather than guessing.

## 5. Adaptive / native-resolution zoom

### Problem

Current browser plotting uses fixed display caps of 15,000 points per trace for full view and 60,000 points for all zoomed views. This can remain visibly coarse compared with the source data even after substantial zooming.

### Target behaviour

Use progressive range-aware rendering:

- full-period view: extrema/gap-aware reduced representation for responsive opening;
- intermediate zoom: point budget increases according to visible source density and viewport;
- native window: when the visible raw-point count is within the native rendering ceiling, every source timestep in the visible range is returned and plotted;
- the UI must explicitly expose `Native resolution · shown/raw points` when all visible source points are rendered.

The user must be able to keep zooming until the graph shows all actual CSV/FDV points in that visible period.

### Performance architecture

- calculations remain full resolution and separate from display sampling;
- preserve prepared-series caching in the Python worker;
- slice by requested range before downsampling/transfer;
- debounce relayout/zoom redraws;
- cancel/ignore stale render generations;
- use WebGL line traces where it materially improves large-series interaction;
- avoid re-parsing source files on zoom;
- avoid recomputing unrelated analysis results on visual-only relayouts.

Do not simply increase a fixed point cap for every view.

## 6. Multi-model selector

Replace the visually exposed multi-select box with a compact searchable dropdown popover.

Required interaction:
- closed state shows `No models`, `1 model selected`, or `N models selected`;
- opening shows a search field;
- every model/comparison series has a checkbox;
- include Select all and Deselect all;
- selection order is deterministic;
- selected models remain represented in the existing canonical mapping state;
- keyboard focus and basic accessibility semantics are retained;
- the old native `#modelSelect` may remain as an internal compatibility/state surface but must not be the primary visible control.

Observed and rainfall selection remain single-select controls.

## 7. Colour controls

Appearance/overlay controls must expose a colour picker for every active plotted series:
- each observed FDV quantity independently;
- each selected model/comparison trace independently;
- rainfall;
- threshold overlays;
- event/highlight overlays where applicable.

Default scheme:
- observed depth remains red;
- first model remains the established purplish blue;
- rainfall keeps the existing default;
- flow and velocity receive distinct defaults consistent with the original tool.

Colour choices persist in workspace save/restore.

## 8. Navigation and naming

### Product name

Replace user-facing `ICM Precision Workbench` / `ICM Calibration Workbench` branding with:

**ICM Graphing Tool**

### Primary workspaces

Use:
- Data & Time Series
- Flow Survey
- Rainfall
- Assessment
- Spills
- Report

Route IDs may remain stable internally to avoid breaking deep links/workspaces.

### Navigation rail

- Add a visible manual Collapse / Expand control.
- The chosen rail state persists across sub-tools and workspaces.
- Route changes must not automatically expand/collapse the rail.
- Focus Canvas may alter graph layout, but must not silently mutate the user's navigation-width preference.

## 9. Provenance

Remove the user-facing Provenance page and standalone provenance CSV export.

Retain internally:
- source fingerprints/hashes;
- source roles and resolved units;
- method/version identifiers;
- calculation freshness/readiness metadata;
- information required by generated engineering reports and workspace auditability.

Do not delete internal provenance capabilities that protect reproducibility.

## 10. Performance and speed acceptance

Add repeatable benchmark/regression coverage for long time series.

Minimum acceptance checks:
- synthetic 1-minute dataset covering at least one year;
- representative observed + two model traces;
- initial graph renders with reduced display arrays;
- zooming into a small enough window results in `display_count == raw_count` for every visible hydraulic trace;
- repeated zoom does not reparse the source;
- stale zoom requests do not overwrite a newer range;
- calculations continue to operate on native-resolution inputs;
- browser smoke suite completes without material regression in duration.

Record benchmark timings as evidence, not hard guarantees where CI hardware varies.

## 11. Regression requirements

Tests must be written before production changes and observed failing for the intended missing behaviour.

Browser/structural regression coverage must prove:
- FDV plot order is Rainfall → Flow → Depth → Velocity;
- hydraulic quantities occupy separate panels, not overlay axes;
- units are correct;
- statistics cover the visible period using native-resolution calculation paths;
- colour controls exist for all active series and redraw the correct trace only;
- model selector is compact/searchable/checkbox based and updates canonical mapping;
- progressive zoom reaches native resolution;
- no Plotly range slider/overview is introduced;
- navigation collapse state remains stable through route changes;
- renamed primary workspaces and product branding render correctly;
- user-facing provenance route/export is absent;
- report/workspace audit information needed for reproducibility remains present.

Engineering parity regression must retain current accepted results for:
- rainfall totals and validity;
- comparison metrics;
- survey assessment and flow continuity;
- exclusions;
- spill counts/durations;
- storage screening;
- workspace restore;
- HTML report generation.

## 12. Implementation boundaries

Likely browser files:
- `web/assets/workbench-v2.js`
- `web/assets/workbench-v2.css`
- `web/assets/precision-workbench.js`
- `web/assets/precision-workbench.css`
- `web/assets/runtime.js` only where canonical mapping/colour state requires it
- `web/index.html`
- `web/tests/smoke.mjs`
- `web/tests/precision-shell.mjs`
- focused runtime/unit tests as required

Python bridge/kernel files may be changed only for display-range payload efficiency or statistics access, not to alter established hydraulic methodology.

## 13. Delivery gate

Work remains on the dedicated feature branch until:
- focused RED→GREEN tests pass;
- full Python/JavaScript regression suites pass;
- Chromium end-to-end workflow passes;
- Firefox shell/responsive checks pass;
- long-series/native-zoom benchmark evidence is recorded;
- populated screenshots are visually inspected;
- a final code review finds no unresolved Critical/Important issue.

Only then may the implementation be committed as merge-ready. Merging to `main` is a separate integration decision unless explicitly requested after the verified branch is ready.
