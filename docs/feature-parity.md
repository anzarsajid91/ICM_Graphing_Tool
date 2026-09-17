# Current feature parity

The [requirements ledger](requirements-ledger.md) supersedes the historical status labels below. Core tests do not establish browser/export parity.

## Historical matrix

# Feature parity matrix

**Implemented** means present in the new core with automated/local verification where feasible. **Partial** means a meaningful migration path exists but full legacy/UI parity or target-environment evidence remains. Real-export/Windows items remain UAT gates.

| ID | Baseline capability | New destination | Status |
|---|---|---|---|
| FP01 | CSV, HYD/P_DATETIME, FDV, R imports | `parsers/`, Data view | Partial — synthetic tests; real UAT pending |
| FP02 | Depth/flow/velocity including FDV | explicit parser channels / Compare | Partial |
| FP03 | Multiple model/comparison files | scenario service / Compare | Partial |
| FP04 | Observed-format comparison series | explicit domain role | Partial |
| FP05 | Rainfall overlay/profile/conversion | rainfall parser/event core | Partial |
| FP06 | Thresholds/labels/colours/rain axis | contextual Compare/Spills shell | Partial |
| FP07 | Apply/refresh/zoom/period | Compare shell; view vs analysis separation | Partial |
| FP08 | Downsampling/adaptive zoom | gap-aware display downsampler | Implemented core |
| FP09 | Scatter/flow-depth/log/rating fit | legacy retained; migration incomplete | Partial |
| FP10 | Calibration metrics/peak timing/lag | metrics + diagnostics | Partial |
| FP11 | DWF/response diagnostics | legacy retained; event core | Partial |
| FP12 | WAPUG/manual criteria/highlights | event service; legacy retained | Partial/UAT |
| FP13 | Data assessment/data health | pre-analysis import audit + Data preview | Partial |
| FP14 | Observed/model 12/24 spill counts | spill core + Spills view | Implemented core; pair UI partial |
| FP15 | Monthly spill durations/boundary split | monthly duration engine | Implemented core |
| FP16 | Monthly modelled spill volumes | shared integration/screening primitives | Partial |
| FP17 | Overflow storage screening | idealised screening with corrected aggregation | Implemented core; UI partial |
| FP18 | Annual/four-graph/spill HTML | legacy retained + current-assessment HTML | Partial — original report parity pending |
| FP19 | Series colours/named workspaces | workspace model + styles | Partial |
| FP20 | Summary/provenance download | report/manifest services | Partial |
| FP21 | Discovery/cache/local launch | catalogue, safe root, CLI, scripts | Partial — Windows CI/UAT pending |

The original application remains present, so unfinished migrations do not remove the pilot fallback. Legacy availability is not itself counted as proof that new parity passed.
