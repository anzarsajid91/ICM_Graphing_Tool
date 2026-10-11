# Functional regression report

Baseline main `dff8ff593e61dbfea142007b5ac32b0d66787f0a`.
Baseline source-identical documentation candidate `8e82b7d401f85700609ca22655e3e612b7531d51`.
[Complete baseline run](https://github.com/anzarsajid91/ICM_Graphing_Tool/actions/runs/38083426614)
passed all suites below; synthetic artifact ID 11682175015. Its application source
matches main; early build metadata used the PR merge SHA, explicitly distinguished
from the source SHA. New builds stamp the exact checked-out head.

Local baseline: 295 Python tests + 100 subtests (18.40 s), every JavaScript unit
suite, source/privacy/vendor/build gates passed. Local candidate: 296 Python tests
+ 100 subtests (17.47 s), every JavaScript unit suite passed. The additional Python
test verifies distinct preview storage and production/sibling file preservation.
No existing assertion was removed or relaxed.

[Candidate 6ed4f4c preview gates](https://github.com/anzarsajid91/ICM_Graphing_Tool/actions/runs/38085106104)
passed shell, native network editing/calculation, annual review, layout and workspace
interactions. [Workbench CI](https://github.com/anzarsajid91/ICM_Graphing_Tool/actions/runs/38085106099)
passed. Full deployed acceptance at `fffea1f4` passed in [run 38085730519](https://github.com/anzarsajid91/ICM_Graphing_Tool/actions/runs/38085730519). The newer exact-head full candidate review at `4e685ef5` passed in [run 38122112522](https://github.com/anzarsajid91/ICM_Graphing_Tool/actions/runs/38122112522), artifact 11696026420. Latest native modal/narrow fixes are additionally gated on the final head; inspect the PR checks and preview revision before release.

| Suite / command | Protected workflows | Baseline | Candidate evidence |
|---|---|---|---|
| `python -m pytest` | Parsers, units/datum, timestep integration, exclusions, spill/storage, survey, DWF/WAPUG, detriment, reports | Pass 295 + 100 | Pass 296 + 100 |
| `for f in web/tests/*unit.mjs; do node "$f"; done` | Runtime/queued cancellation, native graphs, registry, mapping, report payload, network geometry/review | Pass | Local pass; CI gated |
| `node web/tests/uiux-review.mjs` | 17 routes, six requested widths, DOM inventory, console/privacy | Pass | Pass 4e; 17 routes/six widths, errors [] |
| `node web/tests/uiux-contracts.mjs` | Inspector focus/inert, 1024 transition, mobile nav, keyboard pill, reduced motion, token contrast | Added candidate contract | Pass 4e full review |
| `node web/tests/precision-shell.mjs` | Shell/routes/docking, typography/spacing, scroll/focus | Pass | Pass Chromium |
| `node web/tests/workspace-interactions.mjs` | All routes scroll/rail state, schematic camera, report toolbar | Pass | Pass Chromium; no page errors |
| `node web/tests/network-schematic-smoke.mjs` | Synthetic imports, source assignment, real Python spill counts, editor/camera, capture/restore | Pass | Pass Chromium |
| `node web/tests/network-review-smoke.mjs` | Multi-year annual counts, units/threshold conversion, common support isolation, scenarios, tracing, pinned layout, notes, snapshots, vector/PDF/restore | Pass | Pass 4e including printed basis and agreement labels |
| `node web/tests/network-layout-smoke.mjs` | 400 assets/399 wires, pan, multi-select alignment, lock | Pass | Pass 6ed, 43 ms layout in that runner |
| `node web/tests/smoke.mjs` | Full imports/folders/drop, mappings/units, adaptive/native graph, comparisons/rating/DWF/WAPUG, survey/volume, spills/exclusions/storage, workspace/report/export | Pass | Pass 4e complete suite |
| `node web/tests/detriment-smoke.mjs` | Synthetic Flooding/Level/Spill A/B, settings/filters/inspector/CSV/HTML, narrow/About | Pass | Pass 4e complete review |
| `node web/tests/detriment-reference-smoke.mjs` | ICM report reference results, viewport, startup recovery | Pass | Pass 4e complete review |
| `node web/tests/schematic-review-smoke.mjs` | Survey weekly/monthly calculations vs reviewed outcomes, comments/overrides/persistence, print PDF | Pass | Pass 4e complete review |
| `node web/tests/audit-release-smoke.mjs` | CDN blocked, worker import/boot, fingerprint restore, six workspaces/three widths | Pass | Pass 4e complete review |
| `node web/tests/uiux-performance.mjs` | Alternating exact baseline/candidate; native x/y/unit equivalence | Added comparison | Pass 6ed; identical two fixture hashes across 12 samples |

Canonical `src/icm_workbench/`, domain registry, analysis worker and FastPath worker
are unchanged. Plot layout changes only affect font/background/hover presentation;
explicit axes/domains/thresholds/trace colours/uirevision are retained. Compare
native trace hashes in the performance report and authoritative reference result
JSON in the artifacts. Authoritative reference Level/Spill/Flooding result objects match after excluding only random source IDs and virtual paths. Spill calendar and reviewed survey outputs match exactly; assessment matches excluding only performance metadata. See [numerical comparison](evidence/numerical-comparison.json) and [same-runner survey hashes/timings](evidence/survey-performance-comparison.json).

Failures caught, isolated and repaired:

- Historical preview-prefix compatibility test caught a changed prefix; restored
  the old prefix and added a separate isolated-prefix/path test.
- Strict shell tests caught reduced title/nav sizing and a non-grid table padding;
  restored required minimums and 8/12 px table spacing in CSS.
- New inspector test incorrectly clicked a covered trigger after changing from
  docked to an already-open overlay. Corrected the test to assert preserved open
  state, close with Escape, then reopen; product state was not changed.

No unsupported baseline failure was hidden. Local browser launch is blocked by a
socket sandbox denial before application boot, so browser claims come from CI and
cloud review. Coverage is suite-level; exhaustive combinations, screen-reader
use, physical touch, sustained worker-cancellation/recovery and maximum-size
memory remain separate acceptance gaps, not implicitly certified by a screenshot.

The component showcase passed default/hover/focus/disabled/busy/error/disclosure/narrow contracts at 4e after correcting its hidden fixture container. Native dialog isolation, backdrop focus and route-exit tests were subsequently added without weakening existing assertions. Superseded queued preview/Pages jobs were cancelled by existing concurrency rules, not counted as passes.
