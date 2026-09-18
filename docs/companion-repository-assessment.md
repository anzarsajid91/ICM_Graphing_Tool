# Companion repository integration assessment — 18 September 2026

The repositories accessible under `anzarsajid91` were reviewed against the workbench's local-first data contract. Integration is based on reusable engineering behaviour, not direct copying of standalone UI or ICM Exchange automation.

| Repository | Reusable capability | Decision in this release |
|---|---|---|
| `Flow-Survey-Assessment-Tools` | FDV weekly QA: completeness, gaps, ranges, inactive/zero response and 6 h/48 h flatlines | Integrated into the common weekly data assessment and browser table with explicit RAG evidence. |
| `Flow-Survey-Assessment-Tools` | Multi-gauge rainfall operational coverage and spatial consistency | Integrated. Daily rainfall support, network mean/depth, CV ≤40% screening, significant-rain windows and dry/low-rain spell evidence use all loaded .R files. |
| `Flow-Survey-Assessment-Tools` | Population-dependent WAPUG qualification | Integrated. Catchment population >50k uses 6 min intensity streak / 60 min event duration; ≤50k uses 4 min / 30 min. Network qualification requires ≥2 operational gauges and CV ≤40%. |
| `Flow-Survey-Assessment-Tools` | Faulty rain-gauge strike/cutoff/recovery logic | Integrated as auditable evidence. Event-level two-consecutive-strike cutoff is calculated; applying it to subsequent network WAPUG qualification is explicit and opt-in. The daily 7-day/2-strike detector and wet-proof recovery evidence are also exposed. Raw rainfall is never deleted. |
| `Flow-Survey-Assessment-Tools` | Rainfall→hydraulic correlation and lag | Integrated into the professional monitor workflow. Positive lags are searched to 12 h and only assessed with adequate rain, active response and wet overlap. |
| `Flow-Survey-Assessment-Tools` | Dry-weather residual response | Integrated. Depth/velocity use a median diurnal dry-weather baseline where at least five complete dry days exist in the 28-day window with a 6 h antecedent dry-period check; raw response is used when residual support is inadequate. |
| `Flow-Survey-Assessment-Tools` | Rain-event linkage and monitor scoring/RAG | Integrated. Rain events are linked to hydraulic response over 18 h, with quantity-specific rise tests, flatline suppression, 0–100 channel evidence scores and weekly RAG/decision paths. |
| `Flow-Survey-Assessment-Tools` | Installation-card extraction, weather-data builder and Excel publishing | Not embedded. These are upstream preparation/reporting utilities rather than browser analysis functions. |
| `ICM-Survey-Import-Tool` | Real FDV/R header layout, continuation lines, scientific numeric tokens, L/s→m³/s and mm→m conversion | Parser hardened and regression-tested against these conventions. ICM database mutation/import remains in the Exchange script. |
| `ICM-Ruby-Tools` | Network data-flag confidence summaries | Deferred as a future optional model-context input. It needs an agreed export schema and must remain distinct from telemetry quality. |
| `Exporting-ICM-Model-Context` | Network topology/model-context bundles and static QA | Deferred to the network/map phase. The current workbench has no governed asset-context schema and should not ingest the discovery catalogue directly. |

## Engineering boundaries

- Sensor/gauge findings are screening evidence, not automatic declarations that field instrumentation is defective.
- Missing rainfall is never treated as dry; operational status requires at least 90% represented support.
- Spatial rainfall variability uses CV across operational gauges and is unavailable when fewer than two gauges qualify.
- Event-level fault evidence follows the companion FDV logic: subject gauge ≤0.01 mm while ≥60% of other operational gauges are wet, with two consecutive significant-event strikes producing a suggested cutoff.
- Daily dynamic fault evidence follows the companion rainfall logic: wet-network zero-response strikes are counted in a seven-day window; two strikes indicate Faulty and recovery requires a strike-free rolling window plus a wet-proof response.
- FDV flatline screening uses 6 h for review and 48 h for severe review; event-linkage analysis suppresses materially flat response windows.
- Correlation/lag is diagnostic evidence, not proof of causation. The workbench records the method, overlap and gating used.
- The professional workflow uses the mapped monitor rainfall gauge for response analysis and all loaded .R files for network rainfall context.
- Dimensional hydraulic thresholds operate only after depth, velocity and flow have resolved SI unit contracts or explicit user unit overrides.
- Professional results are included in the engineering report and audit appendix after calculation; changing professional assessment inputs invalidates those browser results until recalculated.

## Deferred by design

1. Installation-card parsing and Excel report production remain external preparation/reporting utilities.
2. ICM Exchange database mutation/import stays outside the browser workbench.
3. Pipe diameter/site metadata and linked depth–velocity–flow physical-consistency rules should only be enabled through a user-reviewed survey index.
4. Network topology/model-context import requires a versioned governed schema before integration.
5. Representative real-export reconciliation remains a domain UAT gate: automated tests prove implementation behaviour, not utility/project field validity.
