# Implementation status

**Branch:** `feat/icm-workbench-modernisation`  
**Baseline:** `4bbf00d2d44715353d3ca12e21114edae9346b85`

## Work packages

| WP | Status | Evidence / blocker |
|---|---|---|
| WP0 Baseline/inventory | Complete for connector-visible source inspection | baseline commit/tree/blob identities recorded; raw-file SHA-256 still requires materialised checkout |
| WP1 Package/startup/tests | Implemented, target validation pending | new package/CLI/BAT scripts/CI; original scripts untouched |
| WP2 Parsers/data quality | Partial | CSV/HYD/FDV/R adapters and import audits; representative actual exports pending |
| WP3 Engineering calculations | Core complete against synthetic/analytic fixtures | integration, bounded alignment, metrics, spills, exclusions, month split, corrected screening |
| WP4 Interface/result lifecycle | Partial | Data/Compare/Events/Spills/Report shell and exclusion editor; browser acceptance pending |
| WP5 Enhancements/workspaces | Partial | scenario table, residual/cumulative/exceedance core, events, workspace JSON, offset preview, exclusions, batch runner, report notes structure |
| WP6 Reports/performance/robustness | Partial | offline HTML and escaping; legacy report parity/benchmarks/cache robustness pending |
| WP7 Package/docs/review | In progress | scripts/CI/method docs present; CI/draft PR and remaining acceptance evidence pending |

## Local executed validation
Environment: Python 3.13.5, pandas 2.2.3, NumPy 2.3.5, Plotly 6.5.2, pytest 9.0.2. Dash/pyarrow were absent locally.

```text
22 core/unit/integration tests passed
python -m compileall -q src tests  # passed
```

Coverage includes 120 m³ integration, exact exclusion splitting, no long-gap bridging, undefined constant-series NSE, multi-exclusion audit, exclusion-split spills, partial status for unknown gaps, month-boundary durations, 7,200 m³ same-window discharge aggregation, sentinel→missing parsing, FDV truncation rejection, workspace round-trip, batch fault isolation, HTML escaping, scenario common-domain comparison, non-mutating time-offset preview, gap-aware plotting and synthetic demo pipeline.

## Outstanding release gates
1. GitHub CI must provide Linux + Windows Python 3.12 evidence; failures must be repaired rather than described as passed.
2. Browser journeys/accessibility/screenshots remain pending until Dash runtime is exercised.
3. Original annual/four-graph/spill report parity is not yet fully migrated.
4. Performance/memory/corrupt-cache benchmarks remain pending.
5. T20 remains release-blocking until representative real ICM CSV/HYD, FDV and R files are independently reconciled on the intended Windows environment.
