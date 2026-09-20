# Precision Workbench feature coverage ledger

Baseline: `fc8e269f9743f4d2731d2e1fac4e51f0e86ad1bd`

| Surface | Existing source/control | Precision Workbench route | Calculation contract | Status |
|---|---|---|---|---|
| 01 Sources | `.source-panel`, file/folder inputs, source pool | Data / Sources | Parsers + source registry unchanged | Implemented |
| 02 Series mapping | `.mapping-panel`, observed/model/rain selectors | Data / Series mapping | Mapping catalogue unchanged | Implemented |
| 03 Time series | `#tab-graph`, Plotly graph/statistics | Data / Time series | Native-resolution analysis; display decimation only | Implemented |
| 04 Survey configuration | `#surveyAssociationPanel` runtime insertion | Survey / Configuration | Workbook precedence/topology unchanged | Implemented |
| 05 Data Health | `#tab-data-health`, health table | Survey / Data Health | QA methods unchanged | Implemented |
| 06 Rainfall response | `.survey-professional`, complete survey result | Survey / Rainfall response | FSAT/WAPUG controls unchanged | Implemented |
| 07 Flow continuity | `#surveyBalancePanel` | Survey / Flow continuity | Common-support volume balance unchanged | Implemented |
| 08 Gauges & accumulation | professional gauge/rain evidence | Rainfall / Gauges & accumulation | Rainfall interval semantics unchanged | Implemented |
| 09 Events & hydraulic response | `#tab-rain-events` | Rainfall / Events & hydraulic response | Event detection unchanged | Implemented |
| 10 Comparison diagnostics | `#tab-compare` | Verification / Comparison diagnostics | Alignment/metrics unchanged | Implemented |
| 11 Depth/rating | rating subpanel in compare | Verification / Depth agreement / rating | Diagnostic fit unchanged | Implemented |
| 12 DWF | DWF subpanel in compare | Verification / DWF | DWF qualification unchanged | Implemented |
| 13 Thresholds & exclusions | `#tab-spills`, exclusion editor | Spills / Thresholds & exclusions | Exclusion/count contracts unchanged | Implemented |
| 14 Spill results | spill summaries/tables | Spills / Results | Canonical counting unchanged | Implemented |
| 15 Storage screening | `#tab-storage` | Verification / Storage screening | Screening/integration unchanged | Implemented |
| 16 Workspace save/restore | `#tab-workspace` persistence controls | Report / Workspace save/restore | Schema/migration unchanged | Implemented |
| 17 Report builder | report readiness/export controls | Report / Report builder | Snapshot/readiness unchanged | Implemented |
| 18 Exported engineering report | HTML export paths | Report output | Existing result objects unchanged | Implemented |
| 19 Provenance/audit | project registry/provenance CSV/report appendix | Report / Provenance | Source lineage unchanged | Implemented |
| Existing rating residual/exceedance controls | comparison runtime | Verification | Unchanged | Implemented |
| Existing multiple scenarios | `#modelSelect` | Data mapping + Verification | Canonical select remains synchronized | Implemented |
| Existing source pool collapse/audit | `#sourcePoolToggle`, `#poolBody` | Data / Sources | Unchanged | Implemented |
| Existing review notes | `#reviewNotes` | Report / Report builder | Reviewer text remains separate from computed findings | Implemented |
| Existing domain registry | `#domainRegistryPanel`/registry API | Report / Provenance and left-rail asset context | Unchanged | Implemented |

## Redesign-specific verification notes

- Six primary workspaces and route-specific secondary navigation are implemented over the existing canonical controls and calculation paths.
- Data / Time series, Verification / Comparison and Rainfall / Events use Focus Canvas by default on desktop: 74 px compact rail, inspector drawer, and explicit visible-Plotly resize. Standard layout remains one click away.
- Browser acceptance asserts no document horizontal overflow at 1366×768, 1487×1058 and 1920×1080, plus a >1000 px time-series chart at the 1440 px reference viewport in Focus Canvas.
- Single-series observed traces are fixed to `#d32f2f`; first model trace is `#5755d9`. FDV multi-variable graphs retain quantity-specific colours for depth/flow/velocity.
- Engineering Python modules were not changed by the redesign; the browser shell reuses the existing IDs, state, result objects and Python/Pyodide bridges.
- The exact built `_site` and browser screenshot evidence are retained as PR workflow artifacts. Production deployment remains restricted to `main`.
