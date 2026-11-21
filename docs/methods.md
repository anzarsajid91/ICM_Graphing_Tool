# Engineering methods

## Missingness
Known placeholders `9999`, `-9999`, `99999` and `-99999` are missing before scaling, with counts retained in the import audit. They do not default to zero.

## Time basis and alignment
Timezone-naive data remains `model clock/unspecified` until confirmed. Comparisons use overlapping valid domains only. Interpolation occurs inside contiguous valid segments whose sample gap does not exceed the configured maximum. Extrapolation is not allowed.

## Integration
Instantaneous values use piecewise-linear integration; interval-average values use declared rectangular support. Gaps larger than the configured maximum are unknown and excluded. Exclusions split support at exact boundaries. Positive-flow screening integrates the positive part only. Constant instantaneous 1 m³/s from 00:00 to 00:02 integrates to 120 m³.

### Derived time-series intervals

**Data / time series → Transform time series** produces a separate series on
a reviewed project-clock grid. An output interval is half-open, with a shorter
final interval when needed. The output is an interval mean or a supported
accumulation. Hydraulics use linear support between valid adjacent samples.
Rainfall intensities use the existing left-labelled rainfall support. An
incremental rainfall depth is apportioned by the fraction of its declared or
bounded source interval. A final rainfall sample contributes only when the
source declares supporting interval length. Unresolved sources, negative
rainfall, long gaps and exclusions have no valid support. Each derived value
requires full support across its output period for every operand.

Source shifts move the timestamp and its source-specific exclusions together.
Addition combines flow or rainfall with the same resolved quantity. Subtraction
derives a difference between resolved like quantities. An absolute-level
difference requires reviewed common vertical datum. These operations use the
same explicit period for both operands. Verify that timing, gauge footprints,
flow sign convention and physical combination are appropriate for the project.

Flow volumes are signed integrals in m³ or L. Interval rainfall depths are
integrals in mm. Level, depth and velocity outputs are means. Supported unit
changes use the existing canonical conversion table. The tool withholds an
output when either source leaves part of the interval unsupported and reports
both support durations. Shorter timesteps change the output grid, with no
change to raw measurements or source files.

Reference checks include a 120-second triangular flow with peak 1.2 m³/s
compared against constant 0.2 m³/s. For three consecutive 40-second periods,
the signed flow-volume differences are 8, 32 and 8 m³. A 2 mm incremental
depth over 120 seconds contributes 1 mm to each fully supported half-period.
The engine allows up to 500,000 samples per input and 25,000 output intervals.
CSV and JSON output contain source hashes, assumptions and explicit interval
bounds. The generic CSV importer continues to use its own temporal semantics.

The U.S. Army Corps of Engineers documentation distinguishes instantaneous
values, period means and period accumulations, and describes integrating source
support to compute a period mean. [HEC-DSSVue time conventions](https://www.hec.usace.army.mil/confluence/dssdocs/dssvueum/introduction/time-series-conventions) · [HEC-DSSVue time functions](https://www.hec.usace.army.mil/confluence/dssdocs/dssvueum/math-and-statistical-functions/time-functions)

## Paired flow-monitor investigation

**Flow Survey → FDV health → Investigate monitor readings** reviews concurrent
depth and signed velocity from one local record on the reviewed project clock.
The engineer can set measurement ranges, maximum adjacent sample gap, near-flat
depth and velocity-change criteria, and a rising-depth screen requiring a
confirmed positive downstream sign. A reviewed circular diameter enables a
separate crown check. Long gaps, missing values and confirmed source exclusions
break pattern support. The existing FDV, WAPUG and FSAT methods retain their
own criteria and outputs.

For a reviewed circular section below its crown, the discharge check compares
the concurrent reported flow with wetted cross-sectional area multiplied by
the reviewed mean velocity. The denominator is the greater of the absolute
reference discharge and the explicitly chosen near-zero floor. The result
requires a common section, sign and time basis. For a diameter of 1 m and a
depth of 0.5 m, the wetted area is π/8 m². At 1.2 m/s the reference discharge
is about 0.471239 m³/s. A concurrent reading of 0.9 m³/s is about 90.99% above
that reference. Crown or above-crown depth, missing discharge and unreviewed
velocity conventions are outside this discharge check. The Environment Agency
describes characteristic velocity and wetted area in its free-surface
area–velocity guidance. [MCERTS flow monitoring, section 9](https://www.gov.uk/government/publications/minimum-requirements-for-self-monitoring-of-flow-mcerts-performance-standard/minimum-requirements-for-self-monitoring-of-flow-mcerts-performance-standard#9-installing-and-using-area-velocity-flowmeters-in-free-surface-flows)

Rising depth and low or reverse velocity warrant investigation of backwater,
transient response or measurement conditions. Near-flat depth with changing
velocity warrants a check of instrument response, possible fouling and site
hydraulics. Drift and clock offsets are reviewed in Data source diagnostics.
These are configurable Hydra Bench screens. A discharge channel calculated by
the monitor itself may share the same inputs. Site checks and independent
measurements are needed to validate the installation or diagnose a fault.
The tool reviews up to 250,000 rows, counts all candidates and shows the first
2,000 retained candidate records. Decisions and notes can be exported with
the source fingerprint and settings as an explicit local audit.

## Spatial rainfall comparison

**Flow Survey → Rainfall check → Compare rain gauges** compares 2–8 observed
channels, either over a selected current WAPUG candidate or an explicit
project-clock period. It carries the selected candidate and existing network
qualification into the audit. The comparison leaves the WAPUG and survey
qualification methods, gauge assessment and event decisions intact.

The comparison integrates resolved mm/h or interval mm records on a shared
left-labelled grid. It retains exact valid depth and support, and withholds a
full-window total at a gauge with any incomplete bin. Missing, negative,
excluded and over-gap input contributes no valid time. Valid dry observations
remain zero. The chart breaks at incomplete bins and labels its accumulation
as supported depth. The optional high-rate threshold flags complete bins for
review. It neither removes an observation nor classifies the instrument.

Pearson r compares rates from at least three simultaneously complete,
equal-length bins. Constant or insufficient support has no reported r.
Peak offsets use the midpoints of unique wettest intervals and require both
records to have full support over the selected window. Positive offset means
the second peak was later at the selected bin resolution. It does not establish
a logger correction. Spatial CV uses the population standard deviation divided
by the mean of the complete event totals. It requires complete records at all
selected gauges and a positive mean.

The hand-checkable one-minute sequences `[0, 2, 4, 0]` and `[0, 4, 0, 8]` mm
give totals of 6 and 12 mm, Pearson r of −5/11, a +60 second second-gauge peak
offset and spatial CV of 100/3%. The worker reviews up to 500,000 samples per
gauge and 10,000 bins. The explicit CSV includes source fingerprints, applied
exclusions, per-bin coverage and candidate flags.

WaPUG User Note 6 advises consideration of the spatial distribution of storm
rainfall alongside storm response and local catchment characteristics. WMO
explains that gauge exposure and siting also affect representativeness. These
comparison measures are descriptive Hydra Bench diagnostics. [WaPUG User Note 6, version 2, sections 2 and 5](https://www.ciwem.org/assets/pdf/Special%20Interest%20Groups/Urban%20Drainage%20Group/WAPUG_User_Note_06.pdf) · [WMO Guide to Hydrological Practices, volume I, chapter 3](https://unstats.un.org/unsd/envaccounting/waterGuidelines/Material/WMO_Guide_168_Vol_I_en_hydrological_practices.pdf) · [NIST Pearson correlation definition](https://www.itl.nist.gov/div898/software/dataplot/refman2/auxillar/correlat.htm)

## Flow survey verification suitability

**Flow Survey → Rainfall check → Review verification suitability** reviews
one workbook-mapped observed monitor through one current network rainfall
candidate. The report carries the existing WAPUG decision, mapped gauge
evidence and available FSAT depth–velocity response. It screens the selected
period using the project's explicit minimum supported time, gap limit,
instrument ranges and engineering site review. A screen can include flow
coverage when required by the intended verification purpose.

Hydraulic time support requires finite bracketing samples and a gap within
the reviewed maximum. Range support conservatively requires both supporting
samples within the entered range. Rain uses validated left-labelled interval
support. Unknown, unsupported, negative rainfall and excluded time do not
count toward the requested coverage. Its denominator is the entire period.
Reviewed exclusions apply at exact boundaries to their relevant channels.
The default 90% criterion is a configurable Hydra Bench screening value.
Measured flow coverage, instrument evidence and sensor range states are
reported independently from the rainfall decision and candidate status.

In the independent point check, a 240 s period has 180 s of finite depth
brackets and a 20 s exclusion. Available coverage is 160 s. Two adjoining
brackets touch a depth reading above the reviewed instrument maximum, leaving
40 s of support within range. Signed reverse velocity remains valid where the
reviewed instrument range supports it. A missing gauge, incomplete ranges or
site evidence and a network candidate that fails qualification each retain
their own reason to hold the record for review.

CIWEM guidance treats stable sites, verified depth and velocity measurement,
independent evidence and the shape of the response through recession as part
of the engineering decision. Check site calibration, the useful storm period
and model purpose before relying on the screening result. [CIWEM UDG Code of Practice for the Hydraulic Modelling of Urban Drainage Systems, 2017, sections 3.10 and 5](https://www.ciwem.org/assets/pdf/Special%20Interest%20Groups/Urban%20Drainage%20Group/Code%20of%20Practice%20for%20the%20Hydraulic%20Modelling%20of%20Ur.pdf)

## Spill intervals and 12/24 counting
Physical spill intervals are threshold exceedances under linear interpolation between consecutive valid samples. Missing/long-gap intervals are unknown and break physical events. User exclusions remove time and break events. The 12/24 counting-window convention is applied to retained physical events without restarting at calendar month or year boundaries. The initial occupied 12-hour block counts once; each subsequent occupied 24-hour block contributes one additional count. A complete dry 24-hour block resets the sequence. Physical intervals are half-open: an interval ending exactly at a block boundary does not occupy the next block.

The physical discharge register uses intervals from the applied assessment.
It reports measured support between adjacent identified intervals. A gap in
that evidence prevents interpreting them as distinct discharges. The separately
reported 12/24 count retains its authoritative count status. The Environment
Agency distinguishes physical discharges from 12/24 counted spills. [Storm
overflow assessment framework 2025, Appendix A](https://www.gov.uk/government/publications/storm-overflow-assessment-framework-2025/storm-overflow-assessment-framework-2025#appendix-a-spill-counting-method)

Supporting series require engineer confirmation of their common project clock,
gauge selection and discharge location. Discharge volume integrates the positive
part of the piecewise-linear discharge flow, including exact zero crossings.
Rainfall accumulates over the physical interval using its declared support and
the existing rainfall conventions. Independent support and exclusions apply to
each source. The register withholds volume or rainfall if its interval is
incomplete and reports the corresponding supported time. Treat the gauge total
during a discharge as contextual evidence. Filtering
or ranking the register only changes the displayed or explicitly exported rows.

### Common-period scenario comparisons

Assign each baseline and proposed result to its reviewed asset and compare on
one explicit project-clock period. A record with insufficient source bounds
remains visible with an explanation. The comparison splits reports into calendar
years while preserving the preceding 12/24 counting context for each source.
It applies the existing common-period requirement of three calendar months of
valid evidence for an eligible count. Physical duration and discharge volume
are checked independently. The user confirms a common threshold quantity, unit
and, for levels, vertical datum. Count deltas require definitive counts and
matching preceding context. Duration deltas require matched support and applied
exclusions. Volume deltas require both confirmed flow records and complete
positive discharge integration over the supported physical intervals.

A hand-checkable case compares a 24-hour discharge with a 48-hour discharge
on a three-month complete record. The respective 12/24 counts are two and
three. Constant outward flow of 0.1 m³/s over those periods gives 8,640 and
17,280 m³. Unmatched masks, unknown time and unlinked flow are separate
evidence conditions. The report exports individual values and reasons.

Each count is timestamped at the first retained discharge within its block. Monthly and yearly spill counts are allocated by these timestamps, rather than assigning every count from a long physical discharge to its start month/year. A short discharge continuing into a later month within one counted block can still have positive duration and zero new counts in that later month. `counting_windows.count_timestamps` retains the allocation evidence. Episode start fields remain episode metadata for whole-episode storage screening.

Monthly physical duration uses actual elapsed time and splits at month boundaries.

A definitive count is shown only where unexcluded coverage is complete under the selected gap policy; otherwise status is `partial/unknown-gap`.

## Exclusion periods
An exclusion is a reviewer decision that a known interval must not contribute to calculations. Every exclusion requires start, end and reason. Multiple intervals are allowed and reversible. Overlaps merge for calculation while reasons are retained. Exclusions remain separate from source files in workspace/report provenance. Appropriate examples include a confirmed EDM logger fault, known model-result corruption or maintenance intervention. Poor model fit by itself is not a data-quality reason to exclude a period.

## Storage screening
The first-release capability is **Idealised spill-volume screening**. All physical discharge volumes are aggregated into their 12/24 counting block and annual block volumes can be screened against a configurable target count. This is not dynamic routing and is not a guaranteed engineered storage size.

**Storage routing** screens physical volumes via a separate continuity model.
Inputs are reviewed nonnegative instantaneous inflow on the project clock,
initial occupied volume, capacity, a fixed pass-forward cap and maximum valid
timestep. The model integrates piecewise-linear inflow with trapezoids and
splits each interval if inflow crosses the release cap. For each resulting
piece, outflow is capped by the release rate and by available water. Storage
fills up to capacity and excess volume spills. Each row checks that inflow
plus initial storage equals passed volume, spilled volume and final storage
to within `max(10⁻⁷ m³, 10⁻⁹ × max(1 m³, inflow + initial storage))`.
The [US Army Corps of Engineers storage continuity reference](https://www.hec.usace.army.mil/confluence/hmsdocs/hmstrm/reservoir-modeling/reservoir-modeling-concepts-and-equations)
describes reservoir mass conservation. Hydra Bench uses the fixed-cap and
volume-limited rule above as its own screening method.

Dates must match actual samples. The first missing, excluded or excessive
interval ends routing, since the storage state after that interval is unknown.
Comparisons use the same supported prefix and initial occupied volume. The
limit of 25 capacities and 250,000 samples bounds work in the browser worker.
The scheme assumes an ideal outlet, constant settings and no tailwater,
head-dependent control, infiltration loss, backwater or hydraulic feedback.
Use it to screen spill volume sensitivity. The existing block-based and
12/24-hour assessments remain authoritative for their existing methods.

## Source diagnostics

The Data / time series register reviews instantaneous samples using explicit
project-clock and value criteria. An accepted timestep is within the entered
absolute tolerance of the nominal interval. Duplicate times, values missing
from actual rows, intervals longer or shorter than expected and source rows
without a valid timestamp are distinct findings. Flatline groups require a
continuous run with peak-to-peak amplitude at or below the entered tolerance
and the entered duration. This prevents slowly drifting readings from
appearing flat solely because successive changes are small. A spike candidate
has two opposite adjacent changes over the threshold and a return within the
threshold of the initial reading. The register also reports the individual
changes and optional canonical-unit value bounds.

Optional clock screening assumes a different recording of the same signal in
comparable dimensions. It tests integer multiples of the entered timestep
by matching actual timestamps in the early and late halves of their overlap.
A candidate needs at least 20 exact valid pairs per tested lag, a positive
Pearson correlation of at least 0.70, and a margin of 0.05 above the next
candidate. The change between supported candidate shifts can motivate a drift
investigation. It does not establish a faulty clock or move data. These are
Hydra Bench screening settings and do not change the survey or verification
criteria. Signed values and phase differences may have physical causes.

Review decisions and reasons are exportable as a local CSV. A reviewer can
add a source-specific exclusion with a reason for a finding at two distinct
timestamps. The existing exclusion editor controls subsequent use and
removal. Original data remain intact. A review handles at most 250,000 rows
per series, returns total counts by kind and makes up to 1,500 candidates
available per run. Use a smaller review period when detailed review needs
more rows.

## Circular-pipe capacity and design flow preview

The calculator uses SI units, steady uniform gravity flow, and pipe gradient
as the energy slope. Full-bore capacity uses (64/Re) in laminar flow and
Colebrook–White in turbulent flow. Capacity is withheld in the transitional
range.

Partially full design flow uses circular-segment area and wetted perimeter,
with hydraulic diameter equal to four times the hydraulic radius. The solver
checks both limbs of the turbulent capacity curve, including the descending
near-crown limb. It reports each supported normal depth and identifies an
exact full-bore capacity boundary separately. The implied full-bore velocity
is always the imposed discharge divided by the full area.

Partially full laminar and transitional regimes and relative roughness above
5% of the hydraulic diameter are outside this preview's calculation scope.
Results provide uniform-flow design evidence. Use dynamic hydraulic modelling
for backwater, surcharge, controls and time-dependent flows.

### InfoWorks ICM comparison basis

The calculator accepts the InfoWorks conduit field names US invert level, DS
invert level and Length. The derived gradient is (US invert − DS invert) /
Length. Circular diameter represents one barrel. The preview uses a single
Colebrook–White roughness and reports a uniform-flow estimate.

Autodesk documents **Conduit full capacity** as flow just full, calculated
during Network Validation. Use that field as the primary full-flow benchmark.
For an ICM comparison, record the ICM version, solution model, geometry and
units, inverts, length, roughness type and both roughness values, barrel count,
and sediment depth. Begin with clean single-barrel circular cases with the
same top and bottom roughness. Then test mixed roughness and sediment as
separate cases before claiming support.

The [InfoWorks hydraulic theory](https://help.autodesk.com/cloudhelp/2027/ENU/ICM-Help/files/GUID-3AF862EF-FC9D-4632-BACD-06CC4BC0431C.htm)
describes a network solver that uses Saint-Venant equations, a pressurised
flow slot and a monotonic conveyance approximation near the crown. A
HydraBench two-root design check follows the unmodified uniform-flow curve.
Compare these outputs under equivalent assumptions and keep that near-crown
method difference explicit. See the [Autodesk conduit field reference](https://help.autodesk.com/cloudhelp/2026/ENU/ICMLIVE-Help/files/GUID-1306601E-4A25-4FBE-AE9A-01E06BF4986E.htm)
for the documented gradient and just-full capacity definitions.

### Verification Event Review

Select a current qualifying Time Series rainfall event and one mapped model
scenario. Event Review accepts instantaneous flow or depth with matching units
and a confirmed comparison time basis. It applies the model time offset and
intersects the two series' linearly interpolable intervals before subtracting
the union of their exclusions. Interpolation never crosses a gap beyond the
configured limit or an invalid sample.

Peaks use each trace's own breakpoints on that intersection, including boundary
limits. Tied peaks use the earliest time. Peak error and timing lag are model
minus observed. Signed flow volume integrates both curves over exactly the
same retained support. Depth has no volume output. The separate Overview shows
the existing comparison coverage estimate, which uses the smaller of the two
eligible-support fractions and does not measure interval intersection.

## Multi-event verification matrix

Choose a current Flow Survey network-qualified WAPUG set or current Data
rainfall events. Confirm each observed and simulated pairing belongs to the
same site and measured quantity on the reviewed project clock. The matrix
uses the existing Event Review support, peak and integration engine. It
reads only the event window and the native samples needed to bracket it.
The model clock shift applies before computing intersected support. Invalid
and repeated source timestamps require review before using the matrix.

Coverage is common valid time divided by the full review period. The audit
also records retained native support and excluded time. Peak, volume and
timing assessments require full support and no exclusions. A partial record
may show the numerical metric over the retained intervals with its withheld
criterion. A timing check is withheld for tied peak times. Depth error is
in metres. Flow peak and signed common-support volume errors are percentages
of their positive observed reference. That reference must exceed its
explicitly reviewed floor. Comparisons report signed differences as model
minus observed and apply the absolute magnitude to the chosen tolerance.
Tolerance checks include a numerical allowance of `max(10⁻¹², threshold ×
10⁻¹²)` in the reported units. This does not change the selected tolerance
or the reported numerical result.

The independent 120 s synthetic event uses observed flow of `[1, 2, 1]`
m³/s and modelled flow of `[1, 2.2, 1]` m³/s at minute boundaries. Volumes
are 180 and 192 m³. Peak error is +10%, volume error is +6.6667%, and peak
offset is zero. Cutting the model in half leaves 50% valid common support
and withholds the full-event agreement criteria. An independent offset case
with a clipped 60 s window and model imported in L/s gives 105 and 114 m³.

The matrix accepts up to 16 pairings and 512 event–pair combinations per run.
The chart shows local records with the selected clock shift and shades
reviewed exclusions. The audit is a user-initiated local CSV with channel
fingerprints, assumptions, outcomes and engineer comments. Set thresholds
appropriate to the project and verify shape and agreement through recession.
[CIWEM UDG verification guidance, sections 5.2 and 5.3](https://www.ciwem.org/assets/pdf/Special%20Interest%20Groups/Urban%20Drainage%20Group/Code%20of%20Practice%20for%20the%20Hydraulic%20Modelling%20of%20Ur.pdf)

### Verification scenario revision tracking

Save a baseline matrix with the reviewed revision name and one designated
model per observed record and event. A portable JSON snapshot keeps its
source hashes and channels, qualification fingerprint, dates, project
criteria, common support, independent metrics and comments. Reopen the JSON
locally as the baseline or retain the current matrix during this session.
Create the proposed matrix using the same reviewed observational basis.

Two rows can be compared only for identical observed fingerprints, channels,
event boundaries and identified rainfall evidence. Both require the same
method, gap rule, clock shift and tolerances, and the full event without
exclusions. The engine also checks the recorded support values and observed
peak and volume evidence. Changed, duplicate, missing and partial comparisons
have individual reasons for being withheld. The engineer verifies provenance
of reopened review files against the underlying sources.

Improvement measures the change in the absolute value of each signed peak,
volume or timing error. It leaves the baseline and proposed signed values
visible. Values within `max(10⁻¹², 10⁻¹² × larger error magnitude)` count as
unchanged in the reported units. For example, a peak change from +10% to −5%
reduces error magnitude by 5 percentage points. A volume change from −2% to
+4% increases error magnitude by 2 points. The separate outcome for each
criterion and the original review comments are exported in the local audit.

## Fixed-factor pipe system screening and pump duty

Use full circular pipes, a steady forward flow and an engineering-specified
constant Darcy friction factor for each pipe. Use the difference in elevation
and pressure head between the system boundaries for static head. Apply any
boundary velocity or local losses through the appropriate loss coefficients.

For a pipe, the four component coefficients are Darcy `fL/D`, fittings K,
entrance K and exit K. Multiply each by `V²/(2g)` with `g = 9.80665 m/s²`.
Each pipe has a resistance R such that `h = R Q²`. Parallel pipes share the
same endpoints and therefore the same loss. Their equivalent resistance is
`(Σ 1/√R)⁻²`. Series stages carry the same total flow and their resistances
add. Total system head is `static head + R_eq Q²`. A negative static term
can represent gravity assistance. This calculation assumes a full pipe and
does not establish priming, pressure adequacy, reverse-flow operation,
transient response or cavitation margin.

Pump curves use straight segments between supplied flow/head pairs. For
identical pumps, series adds head at each flow and parallel adds flow at each
head. Intersections use the actual quadratic system curve, including the
maximum of the residual inside a rising linear segment. Shared vertex roots
are reported once. The solver evaluates head residual with tolerance
`1e-10 × max(1 m, |pump head|, |system head|)`. It uses bisection where
the residual changes sign and merges practically coincident roots within
`1e-10 × max(1 m³/s, flow)`. Hydraulic power is `ρgQH`. With a supplied
overall efficiency, estimated input power is hydraulic power divided by that
efficiency. A local residual slope is an investigation cue. Manufacturer
allowable operating region, controls and system dynamics govern suitability.
The calculations use the supplied curve domain.

Independent tests calculate one 1,000 m by 300 mm pipe directly from
the component equation, unequal parallel branches from square-root flow
partition, and pump roots from a unit-resistance quadratic with known
single, double, tangent and absent intersections. The worker uses SI
units. Existing gravity-capacity calculations use their original methods.
See the [U.S. Department of Energy pumping system sourcebook](https://www1.eere.energy.gov/manufacturing/tech_assistance/pdfs/pump.pdf).

## England continuation-flow screening

Enter reviewed contributing catchments using explicit daily allowances.
Domestic flow is the sum of population times the applicable domestic rate
for each contributing catchment. DWF adds daily infiltration and daily
trade effluent. England retained flow adds 1,360 L per person per day for
combined and partially separate areas, twice domestic flow for qualifying
separate foul areas and twice total daily trade effluent. In an entirely
qualifying separate catchment this gives the applicable PFF equation.
Conversion uses 86,400 seconds per day and 1,000 litres per cubic metre.

The Environment Agency expects supporting evidence that an area was
designed and remains separately drained with minimal storm response
at or below 3DWF. The manually confirmed classification carries a review
note. An exclusion also carries its reason. Missing allowances and duplicate
identities stop the calculation. The output screens continuation flow during
the whole spill. Confirm the applicable permit and compare against compatible
downstream evidence before drawing a regulatory conclusion. The formulas
and eligibility language were checked on 2026-11-21 against the [Environment
Agency storm overflow permitting guidance](https://www.gov.uk/government/publications/water-companies-environmental-permits-for-storm-overflows-and-emergency-overflows/water-companies-environmental-permits-for-storm-overflows-and-emergency-overflows#formula-a).

Reference cases are 160,000 L/day for the combined test, 20,500 L/day for
the separate test and 180,500 L/day for their mixed catchment.

The catchment CSV review accepts a single table or the native ICM
`hw_subcatchment` table in a multi-table export. It suggests only documented
`subcatchment_id` and `population` mappings. Select any regulatory-flow
columns and their units explicitly. A blank or `#D` value stays blank until
the reviewer resolves it. The source schema may inherit population from
other settings. Model trade flow, base flow and other source fields require
engineering review before they can represent regulatory allowances.
The calculation CSV retains the source fingerprint, field mappings, original
cell values and conversion factors beside the reviewed results. The current
review accepts up to 100 rows per table and 1 MiB per input. Source-only
classification and network contribution remain separate review decisions.
See Autodesk's [ICM Subcatchment data fields](https://help.autodesk.com/cloudhelp/2026/ENU/ICM-Help/files/GUID-1F3FA957-FE1B-4BD6-A73C-3DF2F6ACD839.htm).

## Scotland continuation-flow screening

The Scottish overflow screen uses SEPA WAT-G-058 version 1.0, August 2025,
section 4.1.1. Confirm the applicability of the low-significance inland
discharge method, with dilution above 8:1 on the guidance basis, fewer than
10,000 population equivalent and no interaction with other discharges.
Record project and permit evidence. More consequential discharges require
the appropriate modelling and regulatory assessment. [SEPA sewer overflows
method](https://www.sepa.org.uk/media/rdphwj00/wat-g-058_permit-guide_sewer_overflows.docx)

Compute in litres per day. For fully combined drainage, the base flow is
the sum of domestic flow, maximum infiltration Imax and trade effluent. Add
1,360 L/person/day and twice the trade allowance. Fully separate systems
use three times domestic and trade allowances plus Imax. Mixed systems add
the 1,360 L/person/day contribution for combined drainage and twice the
domestic contribution for separate foul drainage to the base flow and twice
trade. Each row keeps its reviewed domestic allowance and classification.
Use the simpler combined equation for a mixed catchment only with a reviewed
separately drained share below 20% and a recorded allocation basis.

Independent checks give 169,000 L/day for the fully combined case and
63,000 L/day for the fully separate case with P = 100, G = 150 L/head/day,
Imax = 6,000 L/day and trade = 4,000 L/day. A mixed case with P = 80 and 20,
G = 150 and 160, the same total Imax and trade gives 148,400 L/day. The
reviewed simpler combined basis for that fixture yields 169,200 L/day.
Confirm the permit and review comparative measured or simulated evidence.
Scottish Water publishes its separate design and construction specification
for new infrastructure. [Sewers for Scotland technical specification](https://www.scottishwater.co.uk/Business-and-Developers/NEW-Connecting-to-Our-Network/Developing-housing-and-commercial-properties/Applying/Waste-Water-Connection-Technical-Standards)

## Scotland municipal treatment design flows

SEPA WAT-G-065 version 1.0, August 2025, sections 3.2 and 3.3 use distinct
infiltration terms. Design DWF is PG + Idwf + E, based on reviewed daily
allowances at the design horizon. Design full-treatment flow is
3PG + Imax + 3E. Use the reviewed maximum infiltration for that calculation.
The current calculator accepts those allowances and their provenance. The
guidance describes Q80/Q90 reporting, empirical Imax estimation and conditions
for limited monitoring. [SEPA municipal sewage treatment works guide](https://www.sepa.org.uk/media/zz4ereqb/wat-g-065_permit_guide_municipal_sewage_treatment-_works.docx)

For 100 people at 150 L/head/day, Idwf = 2,000 L/day, Imax = 6,000 L/day and
trade effluent = 4,000 L/day, the reference values are 21,000 L/day for DWF
and 63,000 L/day for design full treatment. Results show L/day, L/s and m³/s
and include the input basis. Check the applicable permit when reviewing
performance against a limit.

## Hydraulic structures and supplied ratings

Hydra Bench screens steady flow using SI inputs and levels referenced to a
common vertical datum. Review evidence for effective dimensions, discharge
coefficients, geometry, approach losses and receiving conditions. The current
form assumes negligible approach velocity where water levels stand in for
energy heads. Sludge, blockage, dynamic operation, directional appurtenances,
nonlevel crests and mixed flow at partially filled openings require suitable
additional modelling.

For an aerated rectangular thin-plate weir, use `Q = (2/3) Cd W √(2g) H^1.5`,
where `H` is the higher head above the crest. Flow is withheld below the USBR
0.2 ft (0.06096 m) sharp-crested nappe screening threshold. When the tailwater
is above the crest, apply the Villemonte reduction `[1 − (Hd/H)^1.5]^0.385`.
This requires a suitably measured tailwater and reviewed use of the empirical
correction. See the [USBR thin-plate equations](https://www.usbr.gov/tsc/techreferences/mands/wmm/chap02_09.html),
[sharp-crested weir conditions](https://www.usbr.gov/tsc/techreferences/mands/wmm/chap07_05.html)
and the [USBR reference describing the Villemonte relation](https://www.usbr.gov/tsc/techreferences/hydraulics_lab/pubs/PAP/PAP-0668.pdf).

A fully wetted orifice discharging freely uses `Cd A √(2g Hc)`, with head to
the opening centre. A fully submerged opening uses `Cd A √(2g |ΔH|)`, with a
separately justified coefficient and the level difference. Partial tailwater
wetting and incomplete upstream opening coverage are outside this screen.
See the [USBR orifice relationship](https://www.usbr.gov/tsc/techreferences/mands/wmm/chap02_08.html)
and [submerged orifice method](https://www.usbr.gov/tsc/techreferences/mands/wmm/chap09_05.html).

For a sluice gate, headwater must exceed 1.25 times the opening. In the free
gate regime use `Cd W B √(2g H)` with upstream head above the sill. A tailwater
ratio below 0.67 uses the free equation. Ratios from 0.67 to below 0.80 need a
gate transition model. A fully wetted opening from 0.80 uses the submerged
opening relation. See the [HEC-RAS gated-spillway reference](https://www.hec.usace.army.mil/confluence/rasdocs/ras1dtechref/latest/modeling-gated-spillways-weirs-and-drop-structures/hydraulic-computations-through-gated-spillways).

Reverse flow requires confirmation of a symmetric configuration without
directional restrictions. Signs refer to the entered nominal upstream and
downstream sides. A supplied passive rating uses piecewise linear interpolation
over reviewed head and flow pairs. It has no extrapolation and supports a
symmetric reverse rating only when confirmed. These methods provide screening
calculations with explicit formula and regime output. Agreement with an ICM
structure needs a verified comparison using its selected hydraulic model.
