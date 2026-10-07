# Network schematic

Open **Spills → Network Schematic**. This is an annual network assessment overview,
with automatic layout and optional manual refinement. Spill count and duration
are the primary information; evidence checks and engineering notes are disclosed
on demand.
Connectors describe the network; they never change spill calculations or imply
that one asset caused another asset's spills.

## Arrange the site

Choose **Edit network**, select an asset type and add independently named points.
CSOs, storm/emergency overflows, pumping stations, treatment works and storm
tanks support spill evidence. Add separate treatment-works points for separate
channels or discharge locations. Add circular manholes, junctions, outfalls and
pointer labels as needed. Drag points to position them; pointer offsets can be
edited in the settings drawer. Every point name can be dragged independently in
Edit network. A moved name gets a leader arrow back to its point, stays attached
when the point moves and keeps readable screen-size spacing during zoom. Use
Label X/Y for precise placement or **Reset label** to restore its default position.

Choose **Connect**, then click the upstream and downstream points. Select a wire
to name it, change its colour, remove its arrow or delete it. New wires are straight
asset-to-asset connections with separate boundary ports. In Edit network, select a
connector and choose **+ Add bend**, or click a **+** handle on one of its segments.
Drag the round bend handles to route the wire. Remove individual bends in the
settings drawer, use **Straighten** to clear them, or Undo an edit. Bends are manual
waypoints in network coordinates; pan and zoom keep them attached to the wire.
Each connector retains its own asset boundary ports and direction arrow. Direction arrows sit
on each wire, clear of the asset icons; outfalls and other larger symbols have
white frames. Crossings do not create junctions. Assets, manholes,
labels and connectors use red, amber or blue, with red as the initial default.
Those colours are user-defined network categories, independent of result RAG.

Use Pan, +/− and Fit to navigate. Icon and label sizes remain readable in screen
pixels while the network positions zoom. Undo/Redo keep the last 30 editing states.
Connector names can also be dragged without moving their wires.

**Tools → Layout** offers snap, lock, align, distribute and automatic upstream-to-
downstream layout. Shift-click to select several points for moving or comparing.
Pin a point in its drawer to preserve its position during automatic layout. Layout
handles directed cycles as groups; it is a topology layout, not a hydraulic solver.
Automatic layout clears manual bends only on wires between unpinned points.
Zooming far out hides numeric badges; use Detail → Full to retain them.

## Assign annual files and scenarios

Import time-series CSVs through **Data / Time Series** first. Once authoritative
parsing completes, they appear in the asset's **Add datasets** selector.
Select several annual files together for Observed, or for a named model scenario.
For example, Baseline can contain 2022, 2023 and 2024 files, while Model update
contains its own annual files. Scenario and reporting year are separate fields.

For each assignment, review its channel, reporting years, source-value unit and
threshold. Blank thresholds inherit the asset's observed or model default.
The effective threshold and whether it comes from the source override or asset
default appear in each source row. **Spill when** selects `>` or `≥`; overflow flow
defaults to `>` so zero flow at threshold zero remains dry. Depth, level and status
retain `≥` by default. Changing quantity resets the rule to that quantity's default;
review it before applying. The regular Spill Assessment workspace retains its existing
rule. Thresholds use the source's canonical values: known source units cannot be
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

Exit editing and hover or select an asset to see observed/modelled count and hours
for every assigned reporting year. Missing scenario/year pairs remain explicit
dashes. The inspector always includes all years, independently of the badge year.
**Annual table** provides the asset/year/scenario matrix, signed model-minus-
observed differences and a selected-assets-only option. Differences and RAG
require comparable evidence. Select **Observed + all models**
in Evidence for a compact asset badge showing **O: count** and **M (scenario): count**
on separate lines. The selected Metric also supports duration in hours. The
badge displays one year throughout; All years selects the latest eligible year
for that asset and shows the year in its header. Missing values display a dash;
stale values require recalculation. Model rows use the same comparison RAG bands
as the evidence table. Unconfirmed or incompatible comparisons remain neutral;
hover a row to see why. No value is borrowed from a different reporting year. Observed-only rows remain
when no model shares that exact period. Coverage, channel, effective threshold,
value range and comparison reasons sit in **Assessment details**. Results that
classify all valid support as spilling carry a concise threshold-check warning. The top-level year/evidence/metric filters
choose the canvas badges; All years badges show the latest eligible selected
evidence for each asset. The pop-up remains inside the canvas and scrolls when
needed, leaving the camera controls accessible.

**Time series** opens the asset's assigned channels, with source-specific threshold
lines and local exclusions. Distinct quantities/units/datums get separate axes.
Select a graph year and zoom to retrieve detail. **Spill analysis** opens the same
workspace focused on annual counts and duration. Both use local schematic settings;
neither changes shared mappings, thresholds or the regular Spill Assessment.
The optional **Common-period comparison** uses the date intersection of one
observed/model scenario pair within one year. It reuses the native detector with
preceding counting context and does not overwrite annual totals or annual RAG.

**Find asset** centres a named point. **Tools** contains scenario visibility, asset
type, evidence-state and result filters. Upstream/downstream tracing follows the
drawn directed connections. Connectivity checks report disconnected components,
isolated points and cycle-affected points. Traces never imply hydraulic causation.
Small evidence-state dots have hover explanations; evidence diagnostics stay
secondary to numeric results.

Modelled count and duration cells use fixed absolute-deviation bands independently:
green ≤5%, amber >5–10%, red >10%. Observed zero/modelled zero is green; observed
zero/modelled positive is red. RAG is withheld when evidence is stale, provisional,
ineligible or has incompatible local periods, quantities, units, datum or support.
Individual results remain visible with the reason. No periods are automatically
trimmed or aligned to obtain a colour.

## Save and capture

Layouts and applied evidence are saved in the browser and included in the existing
workspace JSON export. The **Save / export** dropdown overlays the canvas without moving the toolbar,
and closes after selecting an action, clicking outside or pressing Escape.
**Save network / Load network** provides a separate network
JSON. Raw files are not embedded: reimport files with matching SHA-256 fingerprints
to validate saved evidence. Missing or changed files cannot retain current RAG.

**Capture PNG** exports the visible canvas at twice its screen resolution, including
the currently visible portion of the open evidence table. Pan/zoom/Fit first to
frame the desired overview. **Export evidence CSV** includes source fingerprints,
thresholds, counting basis, coverage and original applied calculation settings;
stale results are explicitly marked as previous evidence.

**Tools → Views & snapshots** saves camera, geometry and display choices as named
views. Review snapshots freeze layout, calculated evidence, fingerprints and
settings with build and methodology metadata; source files are not embedded.
Asset/connector review notes and status persist with the network. Schema 1 layouts
load into schema 2 without discarding their previous evidence.

**Export SVG** includes the whole network, regardless of camera and asset
filters, with the chosen scenarios/year/metric. **Annual report / PDF** opens a
printable vector schematic and all-year tables, differences and comments. Use its
Print / Save PDF button. Assessment-basis sections remain collapsed unless opened.

The test-branch preview lives at `preview/network-annual-review/` on the existing
Pages site. Its workflow builds the current main release separately, verifies
that staging changes none of those release files, and namespaces preview browser
storage. Main's git branch and browser workspace are not changed by preview edits.

## Isolation and release checks

The feature's CSS is scoped to `#nsWorkbench`; its controller is loaded only when
opening the new route. The shared detector accepts the schematic’s explicit comparison rule while its
existing inclusive default and all other workspaces’ calls remain unchanged. Integration
consists of the route, the updated workspace SVG icons, additive JSON persistence,
a new Python endpoint and versioned build assets. Browser acceptance exercises batch
mapping, real Python counts, RAG, drawing, dragging, camera controls, PNG capture,
refresh and fingerprint relinking while asserting shared spill settings are unchanged.

Saved assessments from the previous schematic method are marked stale and must
be recalculated; their original evidence remains available for audit.
