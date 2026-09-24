# Precision Workbench feature coverage ledger

This ledger reflects the canonical post-PR25 workflow. Historical route names are retained only as compatibility aliases; they are not separate user-facing implementations.

## Canonical workspaces and feature ownership

| Order | Workspace / subtab | Existing capability retained | Calculation / state contract |
|---:|---|---|---|
| 1 | **Data / Time Series → Sources** | file/folder import, drag/drop, source pool, parsing/audit | original bytes retained; FastPath preview reconciles to authoritative parser |
|  | **Series Mapping** | observed, model scenario(s), rainfall mapping; colour controls | shared mapping state; model scenarios remain distinct |
|  | **Time Series** | hydraulic/rainfall graph, statistics, exclusions, threshold overlays, adaptive zoom | native-resolution Python data; display reduction only; zoom does not change analysis scope |
| 2 | **Spills → Spill Assessment** | observed/model spill configuration/results, thresholds, exclusions, monthly/yearly/count/duration/volume outputs | canonical spill engine and 12/24-hour rules; observed/model thresholds remain distinct |
|  | **Storage Assessment** | level/overflow-flow mapping, units, threshold, target count, ranked blocks, monthly outputs | authoritative support-aware storage screening; partial/invalid support withheld |
| 3 | **Flow Survey → FDV Check** | data health, weekly/whole-survey QA, coverage/gaps/invalid/zero/flatline/out-of-range evidence | existing survey quality methods; missing evidence remains unknown |
|  | **Rainfall Check** | rainfall QA, accumulation, event qualification/response, network rainfall context | rainfall interval semantics, WAPUG/manual criteria and exclusions retained |
|  | **Volume Balance** | flow continuity, topology, upstream/downstream volume comparison, RAG/recommendations | actual-timestep integration on common valid support; signed residual/declared assumptions retained |
| 4 | **Graphs → Observed vs Modelled** | comparison metrics, residuals, cumulative diagnostics, exceedance, multi-scenario scatter | canonical Python pairing/metrics; linear/log view population is explicit |
|  | **Depth / Rating** | depth agreement and Q/H diagnostic, generic fit and monitor-diameter context | authoritative comparison/rating methods; diameter context only from defensible association data |
|  | **DWF** | dry-weather baseline and qualification | missing rainfall is not dry; authoritative validity-aware DWF path |
| 5 | **Reports → Report Generation** | readiness/preflight, report sections, scenario subset, scatter scale, HTML/four-period exports | coherent dependency-signed snapshot; stale selected results rejected |
|  | **Workspace Save / Restore** | schema migration, named/file workspace persistence, mappings/appearance/exclusions/settings/report choices | source SHA-256 fingerprints; supported route/schema migration; unresolved source guidance |

## Legacy route migration

| Legacy route | Canonical route |
|---|---|
| `verification/comparison` | `graphs/comparison` |
| `verification/rating` | `graphs/rating` |
| `verification/dwf` | `graphs/dwf` |
| `verification/storage` | `spills/storage` |
| `spills/thresholds`, `spills/results` | `spills/assessment` |
| `survey/configuration`, `survey/data-health` | `survey/fdv-check` |
| `survey/rainfall-response`, `rainfall/gauges`, `rainfall/events` | `survey/rainfall-check` |
| `survey/flow-continuity` | `survey/volume-balance` |
| `report/builder` | `reports/report-generation` |
| `report/workspace` | `reports/workspace` |

## Feature-preservation notes

- Precision ROUTES are the sole user-facing navigation owner. Legacy tabs remain implementation surfaces behind canonical routes rather than a second navigation model.
- Import never chooses a new route on the user's behalf. FastPath may prepare a preview graph while the active workspace/subtab remains unchanged.
- Data-only workflows remain valid: observed-only, model-only Depth/Level, rainfall-only and multi-scenario mappings are covered separately.
- Hydraulic threshold controls are quantity-aware. Depth/Level may expose threshold controls; Flow/Velocity do not. Absolute Level retains source unit/reference context (for example Station A `m AD`).
- Threshold display and spill calculations share canonical stored values. Threshold changes invalidate affected spill readiness.
- Graphs uses authoritative paired values and statistics. Log scatter filters only strictly positive plotted pairs and reports the removed count without modifying source data.
- Observed traces retain the established red default; the first model retains `#5755d9`; rainfall keeps its established convention.
- The Plotly mini range slider remains absent. Adaptive zoom can restore native source points without changing analytical scope.
- Survey dependency signatures include association records/source/topology, source identities, analysis period, exclusions and relevant criteria. Late results are discarded.
- Report Generation is first/default for ordinary Reports navigation. Explicit deep links/workspace restore may reopen a deliberately saved supporting subtab.
- Report readiness exposes Current, Stale, Partial, Not run, Blocked and Error semantics with reasons.
- Downloaded reports rebuild full-period authoritative traces, retain rainfall/threshold/context, integrate graph metrics without duplication, contain wide tables/legends, preserve © 2026 Anzar Sajid and keep audit/provenance context.
- Workspace schema v1/v2/v3 migration is explicit; missing/changed source fingerprints produce reattachment guidance; unsupported schemas fail before mutating the active workspace.
- FastPath remains a worker-side display accelerator only. Python/Pyodide/native-resolution engineering calculations remain authoritative.

## Acceptance ownership

Final acceptance for this ledger is the exact-head PR #30 workflow set:
1. Workbench CI on Linux and Windows.
2. Pages verify/build/source checks.
3. Chromium complete browser workflow using repository reference data.
4. Firefox Precision shell/navigation/focus checks.
5. Same-runner repeated FastPath baseline comparison.
6. Retained screenshots, downloaded HTML and print/PDF evidence reviewed against the requested workflow and Station A reference presentation.

The exact final head SHA and workflow run IDs are recorded in PR #30 after the last tracked documentation change so that evidence does not become stale merely by documenting it.
