# Flow Survey + Data / Time Series — 26-point implementation contract

This document is the authoritative implementation scope agreed on 26 September 2026. When the project refers to the “original request” for this redesign, it means all 26 items below together.

1. Keep Flow Survey tabs: FDV Check, Rainfall Check, Volume Balance.
2. Use a review-first Flow Survey UX: conclusions and exceptions before technical detail.
3. Use monitor-centric drill-down for detailed weekly, event-response, QA and methodology evidence.
4. Simplify FDV Check to one coherent monitor-assessment journey and concise monitor rows.
5. Treat fm_rg_assoc.xlsx as authoritative for monitor→rain gauge, diameter and upstream relationships; only ask for manual intervention when mapping is ambiguous.
6. Simplify Rainfall Check to gauge condition, rainfall quality and event assessment, with detailed settings secondary.
7. Present WAPUG Events and Event Review as related views of one Flow Survey rainfall assessment.
8. Simplify Volume Balance to summary RAG, network relationship/schematic, likely issue and recommendation, with detailed evidence on drill-down.
9. Add a Flow Survey Monthly Review synthesising the month rather than averaging scores.
10. Add a persistent Flow Survey status header with period/readiness/source counts/fm_rg_assoc status and Monthly Review access.
11. Place the general visual WAPUG event overlay in Data / Time Series, spanning the inverted rainfall panel and hydraulic traces.
12. Keep the Time Series WAPUG workflow independent of Flow Survey.
13. Maintain separate assessment state for general/EDM Time Series WAPUG and Flow Survey WAPUG.
14. Use one authoritative WAPUG/event-calculation library underneath both workflows.
15. Preserve WAPUG engineering correctness: population preset, intensity/depth/duration/dry-gap criteria, operational coverage, spatial CV, minimum gauges, faulty-gauge treatment, missing-rainfall semantics, units and actual timestep support.
16. Preserve EDM/telemetry as a standalone workflow: telemetry + rainfall + WAPUG overlay + thresholds + spill calculation + exclusions + reports, with no Flow Survey dependency.
17. Add a formal Engineer Review / Override layer for automated assessment judgements.
18. Store calculated and reviewed assessments separately; never destroy the calculated result.
19. Require an engineering reason for any override that changes the calculated assessment.
20. Propagate reviewed outcomes consistently through summaries, detail views, Monthly Review, recommendations and reports.
21. Make overrides reversible back to the calculated assessment.
22. Preserve auditability: calculated result, reviewed result, reason and review timestamp/metadata where available.
23. Keep the assessment hierarchy: raw data → validated calculation → automated assessment → engineer review → final reported assessment.
24. Reuse validated analytical engines; do not unnecessarily rewrite FDV/rainfall/WAPUG/Event Response/volume-balance methods.
25. Apply the UX hierarchy: conclusion → exception → evidence → calculation detail.
26. Merge Data Upload + Data Assignment into Data / Time Series as one Upload → Interpret/Assign → Graph → Analyse workflow, while explicitly preserving and regression-testing every existing Time Series capability.

## Protected Time Series behaviour under item 26

The merge is a workflow consolidation, not a graph rewrite. Preserve:
- multiple observed/modelled/rainfall source handling and independent per-series interpretation;
- quantity assignment for Flow, Depth, Level, Velocity, Rainfall and supported generic numeric series;
- native-format semantics and user override only where appropriate;
- unit detection/canonical conversion and dimensional withholding when unresolved;
- FDV stacked layout (inverted rainfall, Flow, Depth, Velocity) and appropriate non-FDV layouts;
- native-resolution/adaptive retrieval, performance safeguards and current FastPath behaviour;
- current Plotly interaction contract including no accidental page-scroll zoom, deliberate pan/zoom/autoscale/reset, hover/compare, point inspector, visibility/legend behaviour, colour customisation and responsive/adaptive display;
- no unnecessary range slider;
- live threshold behaviour and persistence after redraw/refresh/rescale;
- quantity-correct threshold placement: depth/level only, observed/model separation, immediate update and report inclusion where applicable;
- per-series and observed-vs-modelled statistics, including valid-pair support, R²/regression, slope/intercept where applicable, RMSE, MAE, bias, NSE, KGE and existing metrics;
- full common series by default unless the user deliberately restricts the period;
- exclusions, graphical multi-period exclusions, rainfall bands, cumulative diagnostics, WAPUG Time Series overlay, spill connections and reporting.

## Architectural rule

General/EDM Time Series rainfall-event assessment and Flow Survey rainfall assessment are independent assessment instances that call the same validated engineering methods. Flow Survey review/override is an audit layer over calculated results, not a mutation of calculation evidence.
