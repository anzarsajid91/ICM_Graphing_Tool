# Companion repository integration assessment — 18 September 2026

The repositories accessible under `anzarsajid91` were reviewed against the workbench's local-first data contract. Integration is based on reusable engineering behaviour, not direct copying of standalone UI or ICM Exchange automation.

| Repository | Reusable capability | Decision in this release |
|---|---|---|
| `Flow-Survey-Assessment-Tools` | FDV weekly QA: completeness, gaps, ranges, inactive/zero response and 6 h/48 h flatlines | Integrated into the common weekly data assessment and browser table with explicit RAG evidence. |
| `Flow-Survey-Assessment-Tools` | Multi-gauge rainfall: operational coverage, spatial CV and repeated zero-response screening | Integrated into the Rainfall workspace. Uses support-aware daily depth; flags do not automatically exclude gauges. |
| `Flow-Survey-Assessment-Tools` | WAPUG event criteria and population-dependent duration presets | Existing single-gauge WAPUG/manual event workflow retained. Multi-gauge qualification is separated from event detection pending project-specific population/configuration governance. |
| `Flow-Survey-Assessment-Tools` | Installation-card extraction, weather-data builder and Excel publishing | Not embedded. These are upstream preparation/reporting utilities rather than browser analysis functions. |
| `ICM-Survey-Import-Tool` | Real FDV/R header layout, continuation lines, scientific numeric tokens, L/s→m³/s and mm→m conversion | Parser hardened and regression-tested against these conventions. ICM database mutation/import remains in the Exchange script. |
| `ICM-Ruby-Tools` | Network data-flag confidence summaries | Deferred as a future optional model-context input. It needs an agreed export schema and must remain distinct from telemetry quality. |
| `Exporting-ICM-Model-Context` | Network topology/model-context bundles and static QA | Deferred to the network/map phase. The current workbench has no governed asset-context schema and should not ingest the discovery catalogue directly. |

## Engineering boundaries

- Sensor/gauge flags are screening observations, not automatic fault declarations.
- Missing rainfall is never treated as dry; operational status requires at least 90% represented daily support.
- Spatial rainfall variability uses CV across operational gauges and is unavailable when fewer than two gauges qualify.
- Repeated zero response follows the companion logic: a wet network day, the subject gauge at or below 0.01 mm, at least 60% of other operational gauges wet, and at least two strikes within seven days.
- FDV flatline screening uses 6 h for review and 48 h for severe review. Range defaults are 0–10 m for depth/level, 0–10 m/s for velocity, and non-negative flow.

## Next compatible integrations

1. Define a versioned model-context JSON schema for selected ICM assets, topology and confidence flags.
2. Add explicit flow-meter↔rain-gauge association import before applying network-qualified WAPUG CV gating.
3. Add pipe diameter/site metadata only through a user-reviewed survey index, then enable depth–velocity–flow consistency checks.
4. Keep ICM Exchange import/export as an external adapter; do not give the browser workbench database-write authority.
