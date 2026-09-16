# Consequential implementation decisions

## D01 — Additive migration
The original `app.py`, `install.bat`, `launch.bat` and `requirements.txt` remain untouched. The workbench is a separate `src/icm_workbench` package and script set, retaining the historical runtime during the pilot without a production switch that restores known wrong calculations.

## D02 — Exclusions are analysis masks, not data edits
Exclusion periods have start, end, reason, source and stable ID. Multiple periods are allowed; overlapping periods merge for calculation while reasons are retained. Source data is never changed. Excluded time is removed from spill counts/durations/integration, not reclassified as dry or zero. Unexcluded missing time remains unknown.

## D03 — Missing is not zero
Known telemetry sentinels become `NaN` with an import audit before downstream transformation.

## D04 — Bounded interpolation
Model-to-observed pairing is limited to valid contiguous segments and a configured maximum gap. No extrapolation occurs beyond source extents.

## D05 — One integration engine
Instantaneous values use piecewise-linear integration; interval-average values use declared rectangular support. Exclusions split support at exact boundaries. Long gaps are not integrated.

## D06 — Physical spills separated from 12/24 count windows
Threshold crossings create physical spill intervals. The existing 12/24 convention is then applied to retained physical intervals. Monthly physical duration is split at calendar boundaries independently. Storage screening aggregates every physical discharge volume in a counting block even when a later discharge contributes zero incremental count.

## D07 — Result/report provenance
New report HTML escapes untrusted text and includes the exclusion audit. Reports are built from the stored result snapshot rather than a separate recalculation route.

## D08 — Local security boundary
The CLI binds to loopback only. Source references are resolved beneath the registered data root, including symlink resolution. This release makes no claim of safety for unauthenticated internet exposure.
