# Network schematic

Open **Spills → Network Schematic**. This is a manually arranged site overview.
Connectors describe the network; they never change spill calculations or imply
that one asset caused another asset's spills.

## Arrange the site

Choose **Edit network**, select an asset type and add independently named points.
CSOs, storm/emergency overflows, pumping stations, treatment works and storm
tanks support spill evidence. Add separate treatment-works points for separate
channels or discharge locations. Add circular manholes, junctions, outfalls and
pointer labels as needed. Drag points to position them; pointer offsets can be
edited in the settings drawer.

Choose **Connect**, then click the upstream and downstream points. Select a wire
to name it, change its colour, remove its arrow or delete it. Assets, manholes,
labels and connectors use red, amber or blue, with red as the initial default.
Those colours are user-defined network categories, independent of result RAG.

Use Pan, +/− and Fit to navigate. Icon and label sizes remain readable in screen
pixels while the network positions zoom. Undo keeps the last 30 editing states.

## Assign annual files and scenarios

Import time-series CSVs through **Data / Time Series** first. Once authoritative
parsing completes, they appear in the asset's **Add datasets** selector.
Select several annual files together for Observed, or for a named model scenario.
For example, Baseline can contain 2022, 2023 and 2024 files, while Model update
contains its own annual files. Scenario and reporting year are separate fields.

For each assignment, review its channel, reporting years, source-value unit and
threshold. Blank thresholds inherit the asset's observed or model default.
Thresholds use the source's canonical values: known source units cannot be
silently reinterpreted. Level data also has a datum field. File bindings and
semantic choices here do not update shared mappings or other assessments.
One authoritative source per observed/scenario reporting year is required;
duplicate assignments are blocked rather than silently double-counted.

The suggested main reporting year is the calendar year containing the greatest
time span of the source (ties choose the latest year). This uses dates, not file
names or row density. A boundary sample at 1 January belongs to the preceding
half-open support period. Override each source's year field explicitly, including
multiple comma-separated years for a genuinely multi-year source.

Earlier warm-up is omitted from reported totals but retained as counting context.
The native Python spill detector and occupied 12/24 counting blocks are reused;
counting does not restart at New Year. Unknown or excluded warm-up cannot prove
a dry reset. Counts remain provisional until sufficient known dry context is
established; 48 uninterrupted dry hours conservatively guarantee a complete dry
block even when the initial counting phase is unknown.

Only years with at least three calendar months of valid support show count and
duration values. The minimum is measured from the assessment start using calendar
months; gaps and exclusions do not contribute. Zero spills with adequate support
is a valid zero. Short coverage is unavailable, and partial years are labelled.
Values are never extrapolated to a full year.

## Apply and review

Set the asset's maximum valid gap and any local model-clock exclusions. Confirm
the asset's clocks, units/datum and model/rainfall basis before comparing its
observed and modelled results. **Apply & calculate** freezes the results against
source fingerprints, channels, reporting years, thresholds and assessment settings.
Changing those inputs marks the previous evidence stale; moving or renaming the
point does not. No cross-asset period alignment or overlapping-spill analysis runs.

Exit editing and select an asset to see its yearly observed/modelled table and
coverage details for every scenario. The top-level year/evidence/metric filters
choose the canvas badges; All years badges show the latest eligible selected
evidence for each asset. The pop-up remains inside the canvas and scrolls when
needed, leaving the camera controls accessible.

Modelled count and duration cells use fixed absolute-deviation bands independently:
green ≤5%, amber >5–10%, red >10%. Observed zero/modelled zero is green; observed
zero/modelled positive is red. RAG is withheld when evidence is stale, provisional,
ineligible or has incompatible local periods, quantities, units, datum or support.
Individual results remain visible with the reason. No periods are automatically
trimmed or aligned to obtain a colour.

## Save and capture

Layouts and applied evidence are saved in the browser and included in the existing
workspace JSON export. **Save network / Load network** provides a separate network
JSON. Raw files are not embedded: reimport files with matching SHA-256 fingerprints
to validate saved evidence. Missing or changed files cannot retain current RAG.

**Capture PNG** exports the visible canvas at twice its screen resolution, including
the currently visible portion of the open evidence table. Pan/zoom/Fit first to
frame the desired overview. **Export evidence CSV** includes source fingerprints,
thresholds, counting basis, coverage and original applied calculation settings;
stale results are explicitly marked as previous evidence.

## Isolation and release checks

The feature's CSS is scoped to `#nsWorkbench`; its controller is loaded only when
opening the new route. Existing spill/storage engines remain unchanged. Integration
consists of the route, the updated workspace SVG icons, additive JSON persistence,
a new Python endpoint and versioned build assets. Browser acceptance exercises batch
mapping, real Python counts, RAG, drawing, dragging, camera controls, PNG capture,
refresh and fingerprint relinking while asserting shared spill settings are unchanged.
