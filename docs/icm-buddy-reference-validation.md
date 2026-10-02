# ICM Buddy reference validation

This change uses the three native CSVs uploaded in commit `740f570`. Originals remain unchanged. `scripts/detriment_reference_cases.py` creates temporary, clearly named Scenario A/B copies with independently specified expected results; no assessment engine is used to construct the expectations.

## Report contracts

- Worst-case Level: 41 asset rows. The leading maximum-level result determines the report type even when ancillary flood columns exist. Ground and water levels declare m AD. The 122 date-formatted cells in ancillary numeric columns are preserved and flagged, never converted to inferred numeric values.
- Worst-case Volume: 18 asset rows. The leading `Max Flood/Lost Volume (m3)` is the critical measure. Ancillary results cannot substitute for that independent worst-case result. Known flood-only and combined flood/lost measures cannot be compared interchangeably. Generic explicitly mapped columns remain supported.
- Statistical spill detail: 124 rows for one asset, including exported actual duration and absolute boundaries. The empty elapsed-minute boundary columns are not selected. A date-only end at `01/01/2025` is interpreted as midnight and disclosed in the import audit. Rows remain on a common model clock. Period-crossing events, duplicate boundaries and mixed scenario/run evidence are blocked.
- Spill detail row counting requires an explicit choice of exported block rows or physical events. Displayed/exported units state that basis. No UK 12/24 count is inferred from row count. The default authoritative-summary mode continues to require Summary evidence.

## Independently specified cases

| Assessment | A | B | Expected |
|---|---:|---:|---|
| Flood volume, tolerance 5 m³ | 2 m³ | 8 m³ | +6 m³ detriment |
| New flooding below tolerance | 0 m³ | 0.4 m³ | Risk; new flooding |
| Flood improvement | 10 m³ | 3 m³ | −7 m³ improvement |
| Flood tolerance equality | 2 m³ | 7 m³ | +5 m³ within tolerance |
| New freeboard breach, minimum 0.5 m | 0.65 m freeboard | 0.35 m freeboard | +0.30 m level rise; new breach |
| Existing breach improves | 0.30 m freeboard | 0.40 m freeboard | Persistent risk; improvement |
| Existing breach worsens | 0.20 m freeboard | 0.10 m freeboard | Detriment despite rise below level tolerance |
| Level/freeboard equality | 0.65 m freeboard | 0.50 m freeboard | +0.15 m level rise within tolerance; no breach |
| Exported spill-block rows | 124 | 125 | +1 exported row |
| Actual spilling duration | 52,265.2 min | 52,385.2 min | +120 min = +2 h |

Untouched assets retain zero change. Existing tests retain missing-asset outer joins, leading zeros, unknown/invalid numeric results, units, datums, incomplete evidence and summary-count/duration mixed outcomes. Selecting an absent attribute is blocked rather than becoming an empty "complete" assessment.

## Interaction and release checks

- Uploads use the existing Data / Time Series source pool; report tables do not appear as hydraulic time series or enter Data Health.
- Navigation order is Data / Time Series, Spills, Flow Survey, Detriment Assessment, Graphs, Reports. Branding is ICM Buddy; repository URLs and persistence identities remain compatible.
- The upload note lists .CSV, .FDV, .R and fm_rg_assoc.xlsx.
- Retry Python appears beside a failed engine status. It restarts the isolated worker, restores file bytes, reparses both report and hydraulic sources, and reapplies quantity/unit interpretations to Python and browser metadata. Source identities, mapping, route and time/datum confirmations survive. Repeated failures remain retryable; concurrent clicks share recovery; old terminated-worker events cannot invalidate the new worker.
- Charts show the largest 20 changes by absolute magnitude. The table/export filter is explicit and separate. Level/freeboard and count/actual-duration evidence remain separate. Spill timelines group all exported spans into A/B lanes rather than presenting hundreds of unreadable event labels.
- Assessment HTML contains embedded PNG charts, units, duration/freeboard columns, criteria, fingerprints and full-precision/raw evidence. Export rejects changes to the assessment/filter/selection made during capture. Closed/stale asset graphics are omitted.
- The Python suite, browser unit suites, real-world EDM/Flow Survey simulation, Pages packaging, existing Chromium workflow, reference Chromium workflows and Firefox shell remain release checks. The new native-reference suite also runs against the exact deployed SHA.

Local browser validation uses the environment's outbound proxy and a temporary route serving the exact staged local files. This transport adjustment is not committed and does not mock Python calculations. CI and live verification run the committed strict browser suites without that adjustment.
