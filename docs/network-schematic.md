# Network schematic

Open **Network Schematic** from the primary navigation. This is an annual network assessment overview,
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
rule. Thresholds use the selected values unit. Known parser units are converted locally
for plots, and thresholds are converted back to stored units for calculation.
Changing a known unit also converts its effective threshold; unresolved source units
are assigned without changing values or thresholds. Level data also has a datum field. File bindings and
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
badge displays every assigned reporting year when All years is selected, with a
separate year header and O/M rows. A single-year selection shows only that year. Missing values display a dash;
stale values require recalculation. Model rows use the same comparison RAG bands
as the evidence table. RAG compares spill outcomes, so confirmed level/status/flow
signals may use independent units, datums and rules. It still requires matching
periods, temporal support and exclusion masks. Provisional counts stay neutral,
while duration is assessed independently. Unconfirmed comparisons remain neutral;
hover a row to see why. No value is borrowed from a different reporting year. Observed-only rows remain
when no model shares that exact period. Coverage, channel, effective threshold,
value range and comparison reasons sit in **Assessment details**. Results that
classify all valid support as spilling carry a concise threshold-check warning. The top-level year/evidence/metric filters
choose the canvas badges; All years badges show every assigned year
for each asset, with missing evidence shown as a dash. The pop-up remains inside the canvas and scrolls when
needed, leaving the camera controls accessible.

**Time series** opens the asset's assigned channels, with source-specific threshold
lines and local exclusions. **Channels, units & thresholds** lets users set the
channel, quantity, values unit, threshold rule and level datum directly in this
view, then **Apply & recalculate annual spills**. Known units convert values and
thresholds together; assigning unknown units preserves existing numbers. Distinct
quantities/units/datums get separate axes.
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
workspace JSON export. The **Save / Export / Load** dropdown overlays the canvas without moving the toolbar,
and closes after selecting an action, clicking outside or pressing Escape.
**Save network / Load network** provides a separate network
JSON. Raw files are not embedded: reimport files with matching SHA-256 fingerprints
to validate saved evidence. Missing or changed files cannot retain current RAG.

Turn on **Zoom** to zoom at the pointer with the mouse wheel. Zoom reaches 3,200%. Above 100%, asset symbols shrink gradually to leave more room around connections. Labels and click targets stay readable. Press and drag the
middle mouse button to pan in any mode. Turn Zoom off to scroll the page with
the wheel. The **Pan**, **−**, **+** and **Fit** buttons remain available.

**Clear map** asks for confirmation before removing the current schematic and its
saved views, snapshots and evidence. Imported source files and exported copies
remain available. Use **Edit network → Undo** to restore the cleared map before
reloading. Unlock a locked map under **Tools → Layout** before clearing it.

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

**Export SVG** uses the selected diagram and publication scope. **Annual report /
PDF** opens a printable vector schematic and all-year tables, differences and comments. Use its
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

### Canonical network context CSV preview

Open an empty schematic and select the CSV using **Save / Export / Load → Load network**.
Use UTF-8, metre coordinates, separate node and link IDs, and explicit nominal
upstream and downstream node IDs. Fields may be quoted on one line. Coordinates
use x east and y north, within ±1,000,000 m per axis.

```csv
HydraBench network context v1
record,id,type,name,x_m,y_m,from,to
node,A,manhole,Upstream,350000,425000,,
node,B,outfall,Outlet,350125,425030,,
link,A.1,,Conduit,,,A,B
```

Node types are `manhole`, `junction`, `outfall`, `cso`, `storm`, `emergency`,
`pump`, `wwtw` and `tank`. Missing endpoints, duplicate IDs within an object
kind, invalid coordinates and mismatched formats are rejected before changing the
canvas. A populated manually drawn schematic is protected from replacement by a CSV import.

The import audit previews counts, disconnected components, isolated nodes,
loop-affected nodes and parallel links before changing the canvas. On first
import, choose geographic coordinates or engineering schematic layout.
Re-importing a revised export requires the same format and shared imported
node IDs. Compatible manual positions, labels, bends and manual additions are
retained. The import withdraws affected calculated spill results and preserves
compatible saved views and unaffected evidence. Undo restores the previous
local schematic.

### Native InfoWorks CSV preview

Use a combined native CSV with documented `**** hw_node` and
`**** hw_conduit` delimiters. Confirm metre coordinates, levels and lengths,
and millimetre conduit dimensions and Colebrook–White roughness in the audit.
The importer reads case-insensitive node keys, composite conduit keys, and
packed `point_array` vertices. You can also select the separate ICM table CSVs
together, keeping their table suffixes (for example, `_node.csv` and
`_conduit.csv`). The importer recognises leading description and unit records,
ignores unused fields, and matches required fields by database name. Confirm
the actual export units before applying the import. The audit lists skipped
tables. Pumps, weirs, sluices, flap valves, screens, orifices and user-control
links are represented as named connectors with their source type. Conduit
hydraulic trials remain limited to eligible conduits. Unpacked geometry
remains unsupported. The combined selection limit is 32 MiB.
This adapter is tested against synthetic fixtures based on Autodesk's
[CSV file format](https://help.autodesk.com/cloudhelp/2027/ENU/ICM-Help/files/GUID-7EF49200-AFE8-4934-9ECC-74238171895C.htm).
The importer also recognises the explicit `FieldDescription` and `UserUnits` records emitted with the default ICM export options.

In **Edit network**, select a compatible imported conduit and choose **Open
in Hydraulic Calculations**. Handoff requires circular geometry, one barrel,
zero sediment, uniform Colebrook–White roughness, and a supported gradient.
Edits in the calculator apply to the independent trial.

### Verification evidence layer

In **Edit network**, select a point and confirm its **Monitoring association**
using a flow monitor from the local project registry. One monitor can be linked
to one schematic point. The association is reversible and is saved with the
schematic. **Tools → Verification evidence layer** shows a V badge at linked
points. Its tooltip distinguishes current, partial, stale and unavailable
comparison evidence. The drawer opens Verification Overview when the current
comparison belongs to the linked monitor. The layer reads existing results
and does not rerun the comparison.

### Flow Survey evidence layer

Use the confirmed monitoring association and enable **Tools → Flow Survey
evidence layer**. Select a survey week to see its effective rating, whether it
was calculated or reviewed, and whether it is a short boundary week. Stale
assessments show a stale badge without displaying a rating. **Open Flow Survey
week** opens the linked monitor and week in the survey review. The layer reads
existing results without recalculating them.

### Detriment evidence

Calculate the baseline and proposed assessment in Detriment, then select Flooding,
Level / freeboard or Spill count / duration under Network Schematic → Tools.
In Edit network, select an imported node or link and confirm its exact report ID
under Detriment association. Confirm the ID against both scenario reports before
linking. The association can be removed or undone.

The layer uses the current assessment's existing classifications and displays the
signed change, available duration or freeboard and assessment flags. A changed
report pair, mapping, scope, period, datum or template needs a fresh association.
A changed assessment criterion hides the prior result until recalculation.
Applying a network context import clears associations on its imported objects.
Saved schematic associations are local and remain stale on restore until the
matching comparison is calculated again.

### Reading dense diagrams

The Tools disclosure expands above the canvas and leaves the properties pane
available. On narrow screens the pane stacks beneath the canvas. Automatic
detail uses rendered text bounds to suppress lower-priority labels that collide
with other labels or symbols. Selecting a point reveals its full label. Search
and the properties pane also show full names. Manually positioned labels take
priority. Full detail shows all labels, so it can reveal intentional overlaps.
Zoom or reposition labels when available space is limited.

Verification badges show current recorded scenario decisions and highlight
investigation or unsuitable-for-acceptance decisions. Stale evidence does not
carry a current decision. The overlay uses the current published verification
comparison, while Flow Survey uses its current completed weekly assessment.


## Explore the network

Use **Explore mode** to inspect a point or connector without moving it. Double-click
to focus it. Right-click or press Shift+F10 on a focused object for focus, tracing
and branch isolation. Search accepts object names and identifiers. **Reset view**
clears display filters and the active trace, then fits the entire network. The
minimap supports click, drag, arrow keys and Enter to fit. On a touch surface, drag
one finger to pan or pinch with two fingers in Explore mode. Use **Edit network**
for geometry, labels, connectors and calculation configuration.

The inspector works on both points and connectors. **Properties** displays
read-only original ICM values, descriptions, declared units and source provenance
where available. Add local name/value/unit properties beneath the source fields.
**Upload data** uses the shared local file picker. **Data linking** can attach
time-series references, confirmed monitor relationships, Detriment associations,
and annual spill assignments where applicable. A time-series reference is not an
assignment to a spill calculation. **Evidence** keeps existing results,
analysis actions and review notes.

A revised export refreshes its ICM source fields. Matching objects retain compatible
local names, geometry, properties, references, views and evidence. If substantive
source fields change, the previous attached calculation and Detriment evidence
must be re-established. Original units remain visible without conversion, and
unsupported declared units for engineering fields are rejected. The importer
creates or updates only the Hydra Bench project and never writes to ICM.

In the import audit, open **Revision comparison** before applying a revised
export. **Preview scope** starts with the changes on the current register
page. Choose **Full network context** for a fixed source-coordinate view
around all filtered changes. **Geometry layer** shows baseline, revised
or both. Gray supplies context. Red and teal identify the selected old
and new changes.

Select a changed asset to inspect its source fields and affected monitor
deployments, series references and assessments. Filter to changes affecting
assignments or evidence, or download the filtered revision audit locally.
A changed typed host requires confirmation before its previous monitor
deployment can appear on the revised map. Apply the import to update the
network. Check hydraulic impact separately using compatible simulation
results.

With a confirmed long section open, **Compare the open long section**
reviews the corresponding typed route in the proposed export. **Use
revised route geometry** adds a separately scaled profile while the map
continues to show the baseline. The route requires the same ordered links,
recorded endpoints and reviewed direction. See the [simulation results
guide](simulation-results.md#compare-reviewed-revision-geometry) for exact
sample playback and the local saved review.

## Network review

Choose the view that suits the review.

| View | Use |
| --- | --- |
| **Detailed network** | Inspect the imported geometry and attributes. Use the conduit geometry layer and simulation playback here. A confirmed route always uses source assets, lengths and levels. |
| **Engineering schematic** | Follow nominal upstream-to-downstream connectivity through junctions, discharges, pumps and controls. Ordinary runs become selectable reaches with ordered original assets. Expand a reach or open one of its assets in the detailed network. |
| **Strategic asset diagram** | Present the main assets and routes. An unpinned upstream feeder without a significant asset or uncertain connection can be shown as one group with its original downstream exit. Expand the group to inspect its contributing assets. |

Pin an asset from its inspector to retain it during simplification. Inspect any
unrecognised classification against its imported attributes and confirm the type
in Edit mode. **Diagram options** sets orientation, feeder detail, secondary
controls and visible components. Use **Flow monitors** to show installed monitors
and retain their host asset. A link marker identifies the host conduit.
Select a point or link in an expanded branch and choose **Collapse selected
branch** to fold it individually. **Collapse expanded branches** folds them all.

Schematic positions are diagram coordinates. Arrows show the nominal connection
direction, with dotted routes and no arrow where direction is uncertain. Pump
links and routes with explicit pumped, overflow or storage-return metadata have
distinct line styles. Junction symbols mark actual joins. Parallel links, loops
and separate discharge destinations retain their own source paths.

In **Manual layout**, drag an asset or use its arrow keys to place and pin it.
Select a connector and use **Place connector bend** to route it through a manual
point. Choose **Arrange automatically** to recalculate unpinned positions and
clear manual routes. Use Undo or Redo to restore a layout edit. Save a named view
from **Tools → Views & snapshots**. Saved projects keep each diagram's options,
positions and routing separately. Old Overview saves open in Engineering
schematic. Reimport retains compatible pins and preferences and removes routes
whose recorded source members changed identity or endpoints.

Use **Save / Export / Load → Diagram publication** for SVG, high-resolution PNG
or a print document you can save to PDF locally. Choose the full visible view,
viewport or traced branch, and set the title, legend and evidence badges.
For a large drawing, export one component, viewport or traced route at a time
to keep the report readable.

Native ICM context imports support up to 6,000 nodes and 6,000 links within
the existing 32 MiB CSV selection limit. On a dense detailed map, individual
ordinary assets are drawn together at wide extents. Their source lines and
bends still follow their original locations. Zoom in or use **Find asset**
to open the individual node or link. This visual optimisation is separate
from either schematic view, which groups runs into selectable schematic reaches.
The full detail and source attributes remain in **Save network**. Use that
local JSON file to reopen a large network if browser recovery storage is full.

Use **Import monitor locations** in Data setup or Network Schematic. Choose the monitor and installed asset columns, then inspect the preview. Ambiguous node/link IDs require a choice. A changed location requires confirmation. Unresolved rows stay in the import review. The **Flow monitors** switch displays confirmed installations and counts shared host assets. A symbol on a pipe identifies the host pipe. A measured position along the pipe requires its own survey. Monitor locations, review comments and results can be shared through the explicit **Save network** local export.

Open **Long section**, select endpoints and confirm each branch. The table preserves link order and lists source lengths, invert levels, section dimensions and provenance. Gradient uses the signed difference between the source inverts divided by the source length. Structures occupy their nominal route station. Missing lengths interrupt absolute chainage, with any subsequent measurable reach plotted against local distance. Missing levels break the line. Ground lines connect supplied node levels. The shaft marker uses recorded ground and chamber floor elevations, with a symbolic width. Use horizontal and vertical zoom and pan independently. Each plot gives its vertical exaggeration. **Expand profile** provides a wider view, and **Download profile SVG** saves the current plotted axes and source geometry as a vector file. The profile view settings are included in saved route reviews. The chart and table select the same map asset.

Use **Overlay modelled levels** with a linked model scenario, exact model clock time and engineer-confirmed vertical datum. The display uses sampled route node levels with applicable units and includes source references in the saved review. The marker tooltip gives ground freeboard where the source ground level is available. Link-end hydraulic results and pressure head need applicable result channels. Use **Check pipe capacity** on a supported circular conduit, review the inputs and viscosity, then calculate and keep a trial. The capacity screen uses the same full-bore solver as Hydraulic Calculations. Backwater and surcharge assessment requires applicable model results and boundary conditions.

## Follow-on engineering requirements

| Item | Scope and benchmark |
| --- | --- |
| Pipe headloss and system curves | Add static lift, Darcy–Weisbach friction and fitting losses to a shared flow axis with individual loss terms. Benchmark against a 1,000 m, 300 mm pipe at an independently specified friction factor and fitting K values, plus zero-flow static lift and a negative static head case. |
| Pump duty point | Accept ordered, unit-confirmed pump head/flow points, show all intersections within the sampled range, and disclose interpolation and unsupported ranges. Benchmark a falling straight pump curve crossing a rising quadratic system curve, a multiple-crossing curve and a no-intersection case. |
| Weir and orifice screening | Require structure type, discharge coefficient, geometry, upstream and downstream level and datum. Benchmark a free rectangular weir against its declared rating equation, a submerged orifice against head difference and a reversible or zero-head case. Establish validity limits for each supported regime. |
| ICM revision comparison | Compare typed source IDs, link endpoints, attributes and associated evidence before applying a new revision. Benchmark an ID collision across asset types, changed link endpoints, changed units and removed monitor hosts. |
