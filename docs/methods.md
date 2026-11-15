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
