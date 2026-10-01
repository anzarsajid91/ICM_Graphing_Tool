# Detriment Assessment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Ship the approved Flooding, Level and Spill detriment workspace with Data Sources report ingestion, precise comparisons, evidence and CSV/HTML export; merge and verify the live deployment.

**Architecture:** A dedicated Python report adapter and comparison engine handle string asset IDs, dimensional conversion and engineering classification. A dedicated browser module owns the new UI and persistence, with narrow source-pool/navigation hooks. Report tables are kept out of existing hydraulic series and analyses.

**Tech Stack:** Existing Python/pandas worker, plain JavaScript, Plotly and current Precision styles; no new product dependencies.

**Spec:** `docs/detriment-assessment-proposal.md`, approved by the user, plus the explicit requirement that uploads occur through Data Sources.

## Global Constraints

- Scenario A is baseline; B is proposed; calculate B minus A on unrounded canonical values.
- Flood/level detriment requires a change strictly above tolerance; freeboard breaches strictly below the minimum.
- Preserve leading-zero IDs; reject duplicate summary IDs; missing assets are unmatched, never zero.
- Preserve independent level-rise/freeboard and spill-count/duration flags.
- Import CSV or clipboard grids through Data Sources; use mapping previews for unknown header aliases.
- Keep report tables outside existing time-series mappings and existing workspace calculations.
- Maintain source fingerprints, criteria and scenario names in exports; invalidate results when inputs change.
- Existing storage changes remain in their separate approved priority-1 PR; new feature changes are reviewed separately.

## Review Focus

- Mixed-unit reports and user overrides must convert once and reject dimensional contradictions.
- Detail-only statistics cannot silently use exceedance-row counts as UK 12/24 spill counts.
- Unknown/changed ground levels and incompatible datums must not produce false freeboard passes.
- Removed/reuploaded sources and restored workspaces must invalidate stale results and relink by fingerprint.
- Malformed numbers, duplicate IDs, spreadsheet formula strings and imported markup must not produce misleading results or unsafe exports.

---

### Task 1: Report adapter and comparison engine

**Files:** Create `src/icm_workbench/detriment_api.py`, `tests/unit/test_detriment.py`; add only API exports to `src/icm_workbench/advanced_api.py`.

**Interfaces:** `parse_detriment_report(path, report_kind='auto') -> JSON` returns report columns, suggestions, eight preview rows and provenance metadata, without timestamp-series registration. `detriment_result(kind, scenario_a_json, scenario_b_json, criteria_json, ground_json='null', detail_a_json='null', detail_b_json='null') -> JSON` returns canonical asset rows, independent flags, summary metrics and criteria/scenario evidence. Scenarios contain path, mapping, name, units, datum and scope/period/template declarations.

- [x] Write tests for flood 2→8 at tolerance 5 (detriment), 0→0.4 (new flood below tolerance), threshold equality, string IDs and unmatched assets; level 99.35→99.65 with ground 100/freeboard 0.5 (new breach), existing breach improving, mm conversion and missing/changed ground; spill 12/18h→15/22h and 12/18h→10/24h (mixed); reject duplicate IDs, invalid values, datum/period mismatches and ambiguous detail counting.
- [x] Run `python -m pytest tests/unit/test_detriment.py`; expect missing API failure before implementation.
- [x] Implement the adapter with CSV/TSV sniffing, report preamble handling, manual mappings, explicit units and safe detail-count modes; implement classification and raw evidence without changing existing calculations.
- [x] Run the new tests and full `python -m pytest`; expect all pass.
- [x] Commit the adapter/engine and tests.

### Task 2: Data Sources and three-tab workspace

**Files:** Create `web/assets/detriment-workspace.js`, `web/assets/detriment-workspace.css`, `web/tests/detriment-unit.mjs`; narrowly integrate `web/assets/runtime.release.js`, `web/assets/precision-workbench.js`, `scripts/build_pages.py`.

**Interfaces:** Expose `window.ICMDetriment` with report detection/type lookup, source refresh and route definitions. Use the existing `state.files`, `ingestFiles`, `engine.call(...,'advanced_bridge')` and source-pool events. Persist scenario mappings/criteria as an additional workspace field; source references contain fingerprints rather than raw data.

- [x] Write failing browser-unit tests for escaping, safe CSV with full-precision deltas/criteria, mapping choices, filters and report/time-series separation.
- [x] Run `node web/tests/detriment-unit.mjs`; expect missing module/API failure.
- [x] Implement Data Sources report upload/paste controls; prevent report tables entering hydraulic dropdowns. Add Flooding/Level/Spill routes, comparison strip, mapping preview/criteria, metrics, signed changes, count/duration graphics, filtered sortable tables and asset evidence drawer.
- [x] Implement independent ground/optional detail selection, stale-result guards, workspace save/restore and CSV/HTML export. Block calculations until scope/template/period and level datum/elevation are confirmed.
- [x] Run browser-unit regressions and Pages build; expect pass. Commit the workspace/integration.

### Task 3: QA, independent review, merge and live verification

**Files:** Create `web/tests/detriment-smoke.mjs`, `tests/fixtures/detriment/*`; update existing navigation expectations and CI to execute new regressions without removing existing checks.

**Interfaces:** The smoke suite uploads fixture reports through Data Sources, exercises all tabs/mapping/filters/export/restoration/removal and checks existing hydraulic controls exclude report columns. Existing full smoke, Firefox shell and engineering reference simulations remain required.

- [ ] Write smoke expectations for the approved acceptance examples, TSV paste, separate ground table, unknown mapping, detail evidence, export content, stale state, source removal and desktop/mobile containment.
- [ ] Run against the built app, correct observed failures, and retain screenshots outside the repo.
- [ ] Run Python and browser suites plus EDM/Flow Survey reference workflows; inspect the diff to verify scope.
- [ ] Dispatch one fresh-context whole-branch reviewer under executing-plans; fix Important/Critical findings with failing tests first and rerun the suite.
- [ ] Publish a reviewable feature PR; complete required CI. Merge the separately verified priority-1 PR, then the feature PR with exact expected head SHAs.
- [ ] Verify main deployment metadata, new live routes/import/export and existing-workspace live checks. Report the live URL and evidence.

The user explicitly authorised implementation, main merge and deployment in this session. No additional design or deployment approval gate is required.
