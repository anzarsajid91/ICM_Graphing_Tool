# Precision Workbench feature coverage ledger

Baseline: `fc8e269f9743f4d2731d2e1fac4e51f0e86ad1bd`

| Surface | Existing source/control | Precision Workbench route | Calculation contract | Status |
|---|---|---|---|---|
| 01 Sources | `.source-panel`, file/folder inputs, source pool | Data / Sources | Parsers + source registry unchanged | Planned |
| 02 Series mapping | `.mapping-panel`, observed/model/rain selectors | Data / Series mapping | Mapping catalogue unchanged | Planned |
| 03 Time series | `#tab-graph`, Plotly graph/statistics | Data / Time series | Native-resolution analysis; display decimation only | Planned |
| 04 Survey configuration | `#surveyAssociationPanel` runtime insertion | Survey / Configuration | Workbook precedence/topology unchanged | Planned |
| 05 Data Health | `#tab-data-health`, health table | Survey / Data Health | QA methods unchanged | Planned |
| 06 Rainfall response | `.survey-professional`, complete survey result | Survey / Rainfall response | FSAT/WAPUG controls unchanged | Planned |
| 07 Flow continuity | `#surveyBalancePanel` | Survey / Flow continuity | Common-support volume balance unchanged | Planned |
| 08 Gauges & accumulation | professional gauge/rain evidence | Rainfall / Gauges & accumulation | Rainfall interval semantics unchanged | Planned |
| 09 Events & hydraulic response | `#tab-rain-events` | Rainfall / Events & hydraulic response | Event detection unchanged | Planned |
| 10 Comparison diagnostics | `#tab-compare` | Verification / Comparison diagnostics | Alignment/metrics unchanged | Planned |
| 11 Depth/rating | rating subpanel in compare | Verification / Depth agreement / rating | Diagnostic fit unchanged | Planned |
| 12 DWF | DWF subpanel in compare | Verification / DWF | DWF qualification unchanged | Planned |
| 13 Thresholds & exclusions | `#tab-spills`, exclusion editor | Spills / Thresholds & exclusions | Exclusion/count contracts unchanged | Planned |
| 14 Spill results | spill summaries/tables | Spills / Results | Canonical counting unchanged | Planned |
| 15 Storage screening | `#tab-storage` | Verification / Storage screening | Screening/integration unchanged | Planned |
| 16 Workspace save/restore | `#tab-workspace` persistence controls | Report / Workspace save/restore | Schema/migration unchanged | Planned |
| 17 Report builder | report readiness/export controls | Report / Report builder | Snapshot/readiness unchanged | Planned |
| 18 Exported engineering report | HTML export paths | Report output | Existing result objects unchanged | Planned |
| 19 Provenance/audit | project registry/provenance CSV/report appendix | Report / Provenance | Source lineage unchanged | Planned |
| Existing rating residual/exceedance controls | comparison runtime | Verification | Unchanged | Planned |
| Existing multiple scenarios | `#modelSelect` | Data mapping + Verification | Canonical select remains synchronized | Planned |
| Existing source pool collapse/audit | `#sourcePoolToggle`, `#poolBody` | Data / Sources | Unchanged | Planned |
| Existing review notes | `#reviewNotes` | Report / Report builder | Reviewer text remains separate from computed findings | Planned |
| Existing domain registry | `#domainRegistryPanel`/registry API | Report / Provenance and left-rail asset context | Unchanged | Planned |
