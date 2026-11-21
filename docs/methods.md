# Engineering methods

## Missingness
Known placeholders `9999`, `-9999`, `99999` and `-99999` are missing before scaling, with counts retained in the import audit. They do not default to zero.

## Time basis and alignment
Timezone-naive data remains `model clock/unspecified` until confirmed. Comparisons use overlapping valid domains only. Interpolation occurs inside contiguous valid segments whose sample gap does not exceed the configured maximum. Extrapolation is not allowed.

## Integration
Instantaneous values use piecewise-linear integration; interval-average values use declared rectangular support. Gaps larger than the configured maximum are unknown and excluded. Exclusions split support at exact boundaries. Positive-flow screening integrates the positive part only. Constant instantaneous 1 m³/s from 00:00 to 00:02 integrates to 120 m³.

## Spill intervals and 12/24 counting
Physical spill intervals are threshold exceedances under linear interpolation between consecutive valid samples. Missing/long-gap intervals are unknown and break physical events. User exclusions remove time and break events. The 12/24 counting-window convention is applied to retained physical events without restarting at calendar month or year boundaries. The initial occupied 12-hour block counts once; each subsequent occupied 24-hour block contributes one additional count. A complete dry 24-hour block resets the sequence. Physical intervals are half-open: an interval ending exactly at a block boundary does not occupy the next block.

Each count is timestamped at the first retained discharge within its block. Monthly and yearly spill counts are allocated by these timestamps, rather than assigning every count from a long physical discharge to its start month/year. A short discharge continuing into a later month within one counted block can still have positive duration and zero new counts in that later month. `counting_windows.count_timestamps` retains the allocation evidence. Episode start fields remain episode metadata for whole-episode storage screening.

Monthly physical duration uses actual elapsed time and splits at month boundaries.

A definitive count is shown only where unexcluded coverage is complete under the selected gap policy; otherwise status is `partial/unknown-gap`.

## Exclusion periods
An exclusion is a reviewer decision that a known interval must not contribute to calculations. Every exclusion requires start, end and reason. Multiple intervals are allowed and reversible. Overlaps merge for calculation while reasons are retained. Exclusions remain separate from source files in workspace/report provenance. Appropriate examples include a confirmed EDM logger fault, known model-result corruption or maintenance intervention. Poor model fit by itself is not a data-quality reason to exclude a period.

## Storage screening
The first-release capability is **Idealised spill-volume screening**. All physical discharge volumes are aggregated into their 12/24 counting block and annual block volumes can be screened against a configurable target count. This is not dynamic routing and is not a guaranteed engineered storage size.

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
the separate test and 180,500 L/day for their mixed catchment. Scottish
Water publishes its [Sewers for Scotland technical specification](https://www.scottishwater.co.uk/Business-and-Developers/NEW-Connecting-to-Our-Network/Developing-housing-and-commercial-properties/Applying/Waste-Water-Connection-Technical-Standards).
[SEPA's treatment-works authorisation page](https://www.sepa.org.uk/regulation/authorisations/easr-authorisations/water-activities/discharges/discharge-of-sewage-effluent/discharge-from-a-sewage-treatment-works-with-overflows-from-more-than-10-properties-or-50-population-equivalent/)
identifies Formula A calculations as relevant when applicable. Those
references support further jurisdiction-specific review and the current
calculator applies the verified England method.
