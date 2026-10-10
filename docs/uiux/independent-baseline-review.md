# Independent baseline review

Reviewed baseline: `dff8ff593e61dbfea142007b5ac32b0d66787f0a`.
Review scope: read-only source review of release architecture, UI coverage matrix,
review harness, selected accessibility contracts and independent unit checks.
This review is separate from implementation. No browser journey or rendered
accessibility/performance result is claimed.

## Release assessment

The baseline discovery is useful but does not yet meet Phase 0 or release
acceptance. Loaded-state browser evidence, screenshot review, engineering-result
comparison and meaningful performance measurements are required before claiming
product-wide coverage. No new numerical or confidentiality defect was identified
in the reviewed documentation/harness-only changes. This is not proof that every
workflow is correct.

## Architecture contracts

- Review `_site`, built by `scripts/build_pages.py`, rather than serving only
  `web/index.html`. Release replaces `runtime.js` with `runtime.release.js` and
  injects classic scripts that share the global lexical environment.
- Release CSS order is app → v2 → survey → workflow26 → detriment → precision →
  network. `.pw-route-visible`, direct-child panel rules and `[hidden]` include
  intentional `!important` visibility contracts. Preserve visibility precedence.
- `precision-workbench.js` reparents existing nodes with comment markers in
  `dock()` and `dockSurveySettings()`. Logical route ownership is different from
  physical DOM parentage. Preserve node identity, IDs, listeners and markers for
  `#sharedAnalysisPanel`, `#v2GraphToolbar`, `.appearance-panel`, comparison
  `.mapping-grid`/`.actions` and survey settings.
- Report presentation has separate owners: `reportCss()`/`reportShell()` in
  `runtime.release.js`; monthly print overrides in `workflow-26.js`; inline
  detriment export styles; standalone network report popup CSS. Application token
  updates alone cannot unify these exports.
- `resizeVisuals()` schedules chart resizing after 90 ms. A longer animated
  layout can leave a graph sized to an intermediate width. Verify final sizing
  after transition completion without recreating charts or recalculating results.
  Never transform Plotly content or network geometry for visual animation.

## Inventory and harness improvements

Initial matrix contained 535 rows, of which 252 had unresolved global ownership.
These counts describe the reviewed snapshot, not subsequent corrections.

Normalize templated IDs (`#assessmentCanvas-`, `#assessmentDrawer-`,
`#assessmentMatrix-`, `#assessmentSearch-`, `#assessmentExceptions-`,
`#assessmentSchematic-`, `#assessmentSchematicViewport-`, `#assessmentWeek-`,
`#assessmentZoom-`, `#dtError-`, `#fastpath-`, `#spill-`) to explicit prefix
selectors such as `[id^="assessmentDrawer-"]`; document actual suffix instances
and cardinality once rendered. Do not present template prefixes as valid literal
component selectors.

For each matrix component record logical route owner, physical container when
reparented, state trigger/fixture, expected interaction outcome, exact test case,
baseline failure status and evidence artifact. A generic 'preserve action' entry
is a discovery placeholder rather than a tested component contract. Distinguish
interactive data attributes from rendering-only annotations and enumerate SVG
handles, conditional buttons and report popup controls.

The initial harness scans the entire document, including hidden routes. Record
visible route components separately from shared/hidden inventory; assert the
requested route and root visibility before screenshots. A fixed 250 ms delay is
not a readiness condition. Screenshots must wait for authoritative loaded/busy/
stale status and charts where relevant.

The initial route timing includes an intentional 250 ms sleep, and shell timing
is `performance.now()` when the API exists. These are not navigation latency,
first paint or time to first useful graph. Measure route input/event through
paint separately; measure graph readiness with synthetic imports, consistent
cache state, repeated runs and unchanged fixtures.

## Concrete state coverage

| Route family | Required setup/state combinations | Preserved assertions |
|---|---|---|
| Data / Time Series | Empty; single/multiple FDV/CSV/R import; mixed quantities; missing/known units; parse failure; multiple models; exclusions; restored workspace | Source count/removal; original byte fingerprints; quantity/unit selections; stacked inverted rainfall; native zoom; threshold persistence; export/download; stale gating |
| Plots | Observed-only/model-only; aligned multi-model; log scatter; no positive pairs; rating diameter context; qualified/unqualified DWF | Pair count/population; unchanged metrics; reference lines; trace toggles; retained range after shell changes |
| Spills / Storage | Loaded multi-year; year filter; incomplete common support; no exceedance; exclusions; target count; unknown units | Canonical 12/24 count/duration; annual/monthly results; explicit unavailable/provisional output; storage dimensional gating; CSV values |
| Network | Empty/edit/view; selected and multi-selected; connector bends/label offsets; multi-year observed/model; source removal/restoration; stale; popup/analysis/settings/matrix | Saved coordinates/camera; hit testing; keyboard edit/pan; RAG count/duration independently; all-year badges; per-source units; layout undo/redo; local SVG/PNG/CSV/report exports |
| Flow Survey | FDV/rainfall weekly and whole-survey; gaps/flatline/fault; association workbook; volume balance common support; override/comment; monthly review | Calculated vs reviewed distinction; audit reasons/history; selected week/monitor; rainfall workflow independence; residuals/integration; monthly print evidence |
| Detriment | Flooding/level/spill with A/B; unmatched IDs; missing units/datum; tolerances; ID filters; selected asset; stale source | Unchanged deltas/freeboard; count vs physical duration; full vs current-view exports; raw evidence; missing flags; drawer chart sizing |
| Reports / Restore | Ready/partial/stale; section/scenario selection; four-period; monthly; workspace save/load; source reattachment | Units/legends/thresholds/provenance; complete HTML/PDF pages; no print table clipping; exact exported values; preserved source matching |
| Global / About | Every route; Back/Forward; sidebar and inspector open/closed; focus mode; six widths; reduced motion; keyboard | Selection/scroll persistence; final Plotly/network resize; visible controls; version/author; focus return; no new page/network errors |

Capture empty/loading/loaded/stale/error states separately. Width coverage should
include 1920, 1440, 1280, 1024, 768 and 390 px. Test loaded wide tables and network
analysis toolbars at narrow widths; empty routes do not expose those risks.

## Pre-existing accessibility findings

These are static source findings; rendered impact and severity require browser
verification. They must be tracked separately from redesign-induced defects.

- Network `#nsAnalysis` has Escape and a Tab trap, but close hides focused
  `#nsCloseAnalysis` without returning to its opener. The trap only selects
  button/select/summary/input and does not filter disabled controls, or include
  textarea and relevant Plotly focus targets. Preserve existing trap intent while
  testing complete focus order and background isolation.
- Network picker focuses `#nsSourceSearch`, but the canvas key handler returns
  early for `#nsPicker`, preventing its Escape dismissal. Close/assignment also
  lacks explicit opener focus restoration.
- Network annual evidence uses click-only `tr[data-ns-focus]`. Provide a semantic
  keyboard action in the row; preserve table numerical content and existing
  pointer actions. SVG nodes/connectors already support Enter/Space, and the
  canvas supports arrow edit/pan: preserve those contracts.
- Inspector open/close lacks explicit focus restoration; hiding its focused close
  button can lose keyboard context. Add toggle state/name linkage without treating
  a desktop nonmodal aside as a modal dialog.
- Detriment drawer `#dtClose` hides the focused close button without explicit
  focus restoration. Verify keyboard access to the source asset action.

Avoid a blanket WCAG AA claim. Inspect contrast, keyboard flows, dialogs, chart
controls, text scaling, status semantics and colour-independent RAG evidence.

## Checks actually executed

| Command | Outcome |
|---|---|
| `python scripts/verify_data_confidentiality.py` | Passed; 20 pinned dependency files and 8 reviewed network-capable sources |
| `node web/tests/graph-report-unit.mjs` | Passed; stacked domains/units, no slider, safe report payload, period retrieval and scatter contracts |
| `node web/tests/network-schematic-unit.mjs` | Passed; connectors/bends/labels, multi-year evidence/RAG, thresholds and unit scaling |
| `node web/tests/precision-shell.mjs` | Could not launch: required Firefox executable absent; no browser assertions executed |

Browser request acceptance, rendered screenshot comparisons, full numerical
regression, memory measurements and accessibility audits were not executed by
this independent pass. CI results must be recorded separately when available.
