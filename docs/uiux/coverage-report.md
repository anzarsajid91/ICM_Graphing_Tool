# Coverage report

Source-owned selector candidates and runtime-generated controls are separate.
`coverage-matrix.csv` records 536 source candidates, including panels, result
containers, native controls, dynamic markup families and compatibility sources.
`runtime-controls.csv` records 2,145 route/control identities actually rendered in
synthetic browser journeys; shared controls appear on multiple routes. Counts
are not a proof that every state combination has been tested.

| Workspace | Pages | Owner files | Implementation and suite evidence |
|---|---|---|---|
| Data / Time Series | time-series | index, app/v2/v3/precision, runtime.release presentation | Shared controls/surfaces, mappings/units/thresholds/native plots; full smoke |
| Spills | assessment; storage | index, runtime.release presentation, v2/precision | Count/duration, annual/monthly/exclusions/storage; full smoke |
| Network Schematic | network | network-schematic CSS/JS; core/review unchanged | All discovered editor/assignment/review/export families retained; schematic/review/layout/workspace suites |
| Flow Survey | fdv-check; rainfall-check; volume-balance; monthly-review | survey/workflow/precision CSS; label/report presentation | Complete/weekly evidence, review/override/comments/monthly PDF; smoke + schematic-review |
| Plots | comparison; rating; dwf | v2/v3/runtime.release/precision presentation | Exact native data/units retained; calibration/rating/DWF; full smoke and parity hashes |
| Detriment | flooding; level; spill | detriment CSS/JS presentation | A/B/filter/tolerance/freeboard/selected asset/export/restore; detriment + reference suites |
| Reports | report-generation; workspace | precision/runtime.release/workflow/network report presentation | Readiness/sections/scenarios/chart inclusion/four-period/local restore/print; full smoke + review suites |
| About / Global | overview; shell on every page | precision/app CSS/JS | Branding/version/author/navigation/rail/inspector/focus/status; shell/workspace/contracts + independent review |

436 of 536 source candidates have matched rendered states in the 4e artifact; remaining selectors include native hidden file inputs, unshipped compatibility paths, technical result/SVG targets and conditional controls. Every route has baseline/candidate screenshots, six viewport captures and an
independent unloaded desktop pass. Loaded state evidence includes source mapping,
model picker, units, native FDV, rainfall/WAPUG, multi-scenario calibration, rating,
DWF, spills/exclusions, storage, network editor/annual/drill-down, survey weekly /
monthly overrides, detriment quantities and report exports. Transient picker,
busy and conditional controls are recorded during actual synthetic interactions
by the test-only observer; hidden native file inputs are retained deliberately.

Unmatched source selectors remain explicit in the matrix. Some are result targets
with zero height before results, hidden compatibility/registry controls or native
file inputs; others require a particular editor/advanced state. They are not
silently marked fully tested. No numerical/worker/data source was redesigned.

Reproduce discovery and join only actual downloaded synthetic artifacts:

```sh
python scripts/uiux_inventory.py
python scripts/uiux_evidence_inventory.py /path/to/candidate-artifact
```

Remaining acceptance gaps: every conditional state/configuration combination,
full screen-reader/text-zoom/high-contrast/touch pass, exhaustive plot modebar
naming and maximum-size sustained memory/animation profiling. Full suites protect
their explicit assertions; a styled or rendered control is not automatically an
exhaustive interaction assertion. The master definition of done is not claimed
until these gaps are resolved or explicitly accepted for review.
