# Current-tool graphing & reporting reference contract

Date: 2026-09-20

This contract is derived from the user's uploaded examples under `reference/current-tool/`. The files are reference evidence, not production dependencies. Requirements below distinguish stable presentation principles from example-specific data values.

## Source evidence reviewed

- `reports/screenshots/FDV_Sample_Plots.png`
- `reports/html/StationA_CSO_Spills_2022.html`
- `reports/html/StationA_CSO_Spills_2023.html`
- `reports/html/StationA_CSO_Spills_2024.html`
- `reports/html/StationA_CSO_Spills_2024_Model_Updates_at_CSO.html`
- `reports/html/StationA_CSO_Spills_2024_Model_Updates_at_tank.html`
- FDV files `FM01.fdv` etc.
- rainfall `.R` files `RG01.R` etc.
- Station A observed EDM CSV, rainfall CSV and zipped model data.

## 1. Time-series composition

### FDV / flow-survey presentation

The FDV reference screenshot establishes the preferred composition:

1. Rainfall at the top, inverted, with zero at the top.
2. Flow.
3. Depth.
4. Velocity.
5. Statistics table at the bottom.

All panels share one time scale. Only the bottom panel shows the normal date/tick labels. Hydraulic quantities have independent Y scales and must never share/overlay a hydraulic Y axis.

Panel titles are simple and centred: **Rainfall**, **Flow**, **Depth**, **Velocity**, **Statistics**.

The uploaded FM01/RG01 example exactly supports the visible reference statistics:

| Series | Min | Max | Mean / average |
|---|---:|---:|---:|
| Flow | 0.039 m³/s | 0.769 m³/s | 0.128931 m³/s |
| Depth | 0.113 m | 0.470 m | 0.188229 m |
| Velocity | 0.420 m/s | 1.480 m/s | 0.880464 m/s |
| Rainfall | 0 mm/h | 66 mm/h | 0.126482 mm/h |

RG01 total depth over the sample period is 85 mm using its two-minute intensity timestep.

These numeric values are sample regression evidence only; they must not be hard-coded into product logic.

### General observed/model depth presentation

The Station A HTML reports use:

- rainfall in a narrow inverted upper band;
- observed depth and model depth together in the larger hydraulic band;
- depth-only threshold lines;
- statistics in a dedicated lower band.

The full report plot is approximately 1005 px tall and reserves substantial vertical room for the statistics table rather than placing statistics outside the figure.

## 2. Default visual language

Defaults evidenced by the references:

- Observed depth / primary observed comparison series: **red** `#ff0000`
- First model / simulated comparison series: **blue** `#0008ff`
- Rainfall: `#4A90E2`
- FDV Flow: `#1f77b4`
- FDV Depth: `#ff0000`
- FDV Velocity: `#2ca02c`
- Reference threshold 1: purple `#8000ff`
- Reference threshold 2: yellow `#ebcb00`

User-selectable colours remain supported. These are defaults, not fixed colours.

Reference line hierarchy:
- observed depth: about 2.2 px;
- first model: about 2.0 px;
- rainfall: about 1.0 px;
- thresholds: about 2.5 px dashed.

For the browser workbench, equivalent visual hierarchy may be adapted for WebGL/performance while retaining the same perceptual emphasis.

## 3. Threshold ownership

Thresholds belong to **Depth only**.

- A threshold must not appear on Flow or Velocity.
- Model threshold controls must not imply an active model threshold if no model Depth series is mapped.
- If observed and model thresholds coincide, one visible line is preferable to two coincident lines, with a combined legend label.
- Threshold lines are dashed and identified in the legend.

## 4. Statistics contract

Reference table order:

`Series | Unit | Min | Max | Average | Total`

Expected rows depend on the plotted quantities. Examples show:
- Observed Flow
- Observed Depth
- Observed Velocity
- Rainfall
- Simulated/model series where mapped

Dimensional totals must only be shown where meaningful:
- rainfall total: depth in mm, derived with actual timestep;
- flow total: volume in m³ when units/time support are resolved;
- depth/velocity totals: em dash.

Statistics and totals must come from native-resolution visible/selected support, never display-downsampled arrays.

## 5. Legend and headings

Reference Plotly figures use a compact horizontal legend above the graph, aligned to the right.

Graph titles identify the comparison and period, for example:
- `Observed vs Simulated — All`
- `Observed vs Simulated — Depth — 2024 Complete Period`
- fixed period labels such as Jan-Apr, May-Aug and Sep-Dec.

Product output should generate titles from the current mapping/period rather than hard-code Station A naming.

## 6. Four-period annual report

The uploaded reports establish a useful annual reporting pattern:

1. Complete year
2. January-April
3. May-August
4. September-December

Each period should reuse the same visual contract and colours.

The current workbench implementation must not revert FDV to overlaid hydraulic Y axes in this report path.

## 7. Spill / EDM report structure

Uploaded spill reports include:

1. Full time-period graph.
2. Observed spills table.
3. Model spills table.
4. Observed vs modelled spill comparison.

The observed/model tables use calendar-year rows and Jan-Dec + Total columns for spill counts. The comparison includes year/month, observed count, model count, difference, and an interpretation such as matching / under-predicting / over-predicting.

The ICM Graphing Tool may add coverage, duration, exclusion and uncertainty information, but should not lose this compact monthly comparison view.

## 8. Sample-data semantics

### FDV
The uploaded FDV examples are fixed-width ASCII with:
- Flow in L/s -> canonical m³/s
- Depth in mm -> canonical m
- Velocity in m/s
- explicit start/end/interval metadata

### Rainfall R
The uploaded R examples use intensity in mm/hr with explicit timestep.

### Station A EDM CSV
The observed file is an ICM HYD / `P_DATETIME` export and is level data in metres.

### Station A rainfall CSV
The example is a two-column, two-minute series whose filename identifies it as rainfall. The 2022-2024 subset integrates to approximately 2880.854 mm when values are treated as mm/h intensity at the actual two-minute timestep. This closely matches the 2881 mm reference-report total.

The product must not assume all generic CSV rainfall files share this filename, timestep or unit. When unit semantics cannot be resolved from metadata/header, the UI must request/allow an explicit unit rather than silently assuming one.

### Zipped model data
The ZIP is repository convenience/reference storage. Product runtime ZIP ingestion is not implied by the reference contract. Tests may extract it to validate underlying model files.

## 9. Performance and resolution

Reference FDV screenshot contains roughly 20,161 two-minute samples per hydraulic/rainfall series across February 2026 and visibly preserves event detail.

Browser behavior:
- full-period rendering may reduce points for responsiveness;
- extrema and gaps must be preserved;
- zoom must progressively refine;
- sufficiently zoomed windows must show every underlying source timestep;
- calculations/stats always use native data.

## 10. Reporting implementation principle

The reference reports are Plotly-based. The online workbench should therefore use one authoritative Plotly composition model for:
- interactive time-series display;
- report-resolution rendering;
- four-period output.

This avoids the current risk of interactive and report layouts diverging.

The implementation may export SVG/static figures for portable HTML reports, but the rendered composition should match the reference Plotly figure structure: rainfall/hydraulic panels plus statistics band, with consistent colours, thresholds, legends and axes.

## 11. Non-overfitting guardrail

The uploaded data are examples, not a closed list of supported inputs.

Implementation must remain quantity- and metadata-driven:
- omit missing panels cleanly;
- support arbitrary monitor/file names;
- support other valid intervals and date ranges;
- preserve multiple model scenarios;
- preserve CSV/FDV/R parsing contracts;
- withhold dimensional calculations where unit semantics are unresolved;
- do not special-case Station A, FM01, RG01 or the reference filenames in production logic.
