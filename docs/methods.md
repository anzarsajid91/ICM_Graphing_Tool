# Engineering methods

## Missingness
Known placeholders `9999`, `-9999`, `99999` and `-99999` are missing before scaling, with counts retained in the import audit. They do not default to zero.

## Time basis and alignment
Timezone-naive data remains `model clock/unspecified` until confirmed. Comparisons use overlapping valid domains only. Interpolation occurs inside contiguous valid segments whose sample gap does not exceed the configured maximum. Extrapolation is not allowed.

## Integration
Instantaneous values use piecewise-linear integration; interval-average values use declared rectangular support. Gaps larger than the configured maximum are unknown and excluded. Exclusions split support at exact boundaries. Positive-flow screening integrates the positive part only. Constant instantaneous 1 m³/s from 00:00 to 00:02 integrates to 120 m³.

## Spill intervals and 12/24 counting
Physical spill intervals are threshold exceedances under linear interpolation between consecutive valid samples. Missing/long-gap intervals are unknown and break physical events. User exclusions remove time and break events. The existing 12/24 counting-window convention is applied to retained physical events as a named compatibility method. Monthly physical duration uses actual elapsed time and splits at month boundaries.

A definitive count is shown only where unexcluded coverage is complete under the selected gap policy; otherwise status is `partial/unknown-gap`.

## Exclusion periods
An exclusion is a reviewer decision that a known interval must not contribute to calculations. Every exclusion requires start, end and reason. Multiple intervals are allowed and reversible. Overlaps merge for calculation while reasons are retained. Exclusions remain separate from source files in workspace/report provenance. Appropriate examples include a confirmed EDM logger fault, known model-result corruption or maintenance intervention. Poor model fit by itself is not a data-quality reason to exclude a period.

## Storage screening
The first-release capability is **Idealised spill-volume screening**. All physical discharge volumes are aggregated into their 12/24 counting block and annual block volumes can be screened against a configurable target count. This is not dynamic routing and is not a guaranteed engineered storage size.
