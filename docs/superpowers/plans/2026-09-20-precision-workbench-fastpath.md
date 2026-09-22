# Precision Workbench + FastPath Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make supported FDV/CSV data graphable with safe descriptive statistics before the Pyodide engineering worker is ready, while refining the existing Precision Workbench and preserving every authoritative engineering calculation.

**Architecture:** Add one conservative JavaScript FastPath core plus a lightweight worker. It produces a preview-only canonical contract from FDV/CSV, renders with Plotly, and records T0–T6 timings while the existing Pyodide worker boots in parallel. Once Python parsing completes, reconcile the preview contract and hand control back to the existing canonical project registry/analysis paths.

**Tech Stack:** Vanilla JavaScript, Web Workers, Plotly, Python/Pandas/NumPy/Pyodide, Playwright Chromium/Firefox, GitHub Actions/Pages.

**Spec:** `docs/superpowers/specs/2026-09-20-precision-workbench-fastpath-design.md`

## Global Constraints

- Baseline main SHA: `cb66e762b23c5cd59cf61b42a6c4b52655307cfc`.
- Branch: `feat/precision-workbench-fastpath`.
- Python/Pyodide remains authoritative for engineering calculations.
- Native-resolution calculation data must not be replaced by preview/display arrays.
- Missing/unknown data must not become zero/dry.
- Observed = red; first simulation = purplish blue; rainfall treatment retained.
- No Plotly range slider/overview mini graph.
- GitHub Pages remains the host; no backend.
- Stop at a reviewable PR; do not merge.

## Completion reconciliation — 2026-09-22

The implementation/evidence record is reconciled against PR #25 rather than earlier chat status. All merge-relevant product, reference-data, browser, report, performance and regression outcomes below are implemented and evidenced. The original deliberately-RED test run was not retained and remains unchecked rather than reconstructed. A reproducible formal comparison against the fixed pre-FastPath `main` baseline is now retained and documented in `docs/fastpath-performance.md`.

Evidence used for this reconciliation includes the fully green hardened browser run `35699755269` on product head `84309aafc1f3b296559ce6fd6e5c2c3ec17ac198` / tested merge build `64345aa1ab4d7af04300351f05da17021d1d8695`, plus green Ubuntu/Windows Workbench CI, Chromium complete workflow, Firefox shell and the same-run formal baseline comparison. Final PR-description/Ready-for-Review administration follows the documentation-only exact-head rerun.

## Review Focus

1. Ambiguous CSV timestamps/units: FastPath must decline or mark unresolved rather than guess.
2. FDV truncation/header/unit mismatch: preview must fail safely and Python remains authoritative.
3. Large CSV/FDV: parsing must occur off the UI thread and first graph must not wait for Pyodide.
4. Preview/Python disagreement: surface diagnostic mismatch; never use preview for specialist analysis.
5. Repeated/mixed imports: source state and mappings must remain coherent with no duplicate or stale preview data.

---

### Task 0: Establish reproducible baseline performance evidence

**Files:**
- Modify: `web/tests/smoke.mjs`
- Create: `docs/fastpath-performance.md`
- Modify: `.github/workflows/pages.yml`

**Produces:** Browser timing evidence for current authoritative-only import using checked-in reference files, retained as CI artifact/log output.

- [x] Add a browser helper that records file size, known row count after authoritative parse, selection time, authoritative-ready time and first graph paint time for the existing path without changing runtime behavior.
- [x] Exercise FM01 FDV and Station A observed CSV (plus the largest practical checked-in FDV/CSV if different).
- [x] Emit JSON under the existing evidence directory and upload it with browser evidence.
- [x] Run PR CI and record measured baseline values in `docs/fastpath-performance.md`.
- [x] Commit: `perf: capture baseline import-to-graph timings`.

### Task 1: Lock FastPath contract with failing tests

**Files:**
- Create: `web/tests/fastpath-unit.mjs`
- Create: `web/tests/fastpath-reference.mjs`
- Modify: `.github/workflows/pages.yml`

**Produces:** RED tests for parser eligibility, canonical preview schema, FDV canonical conversion, CSV timestamp/unit conservatism, descriptive statistics and mismatch behavior.

- [x] Add unit cases for valid FDV; incomplete FDV; unsupported FDV unit; ISO CSV; UK day-first CSV; quoted CSV; unresolved unit; duplicate timestamps; sentinel/missing values; malformed timestamp; ICM P_DATETIME.
- [x] Add reference tests against checked-in FM01 and Station A EDM/rainfall samples.
- [ ] Run CI and confirm failure is specifically missing FastPath implementation. — Historical RED-run evidence was not retained; final contract tests are present and green.
- [x] Commit: `test: lock fastpath parsing and preview contract`.

### Task 2: Implement conservative FastPath parser core

**Files:**
- Create: `web/assets/fastpath-core.js`
- Modify: `scripts/build_pages.py`
- Modify: `web/tests/fastpath-unit.mjs`
- Modify: `web/tests/fastpath-reference.mjs`

**Produces:** `ICMFastPathCore.parse(name,text,options)` and deterministic preview contract.

- [x] Implement shared normalisation, sentinel handling and supported unit vocabulary matching `parsers/common.py`.
- [x] Implement strict FDV FIELD/UNITS/IDENTIFIER/CONSTANTS/CSTART/CEND parsing with explicit interval and field-count validation.
- [x] Implement conservative delimiter/CSV row parsing, timestamp-column detection, ISO/year-first and UK day-first timestamps, plus ICM P_DATETIME section recognition.
- [x] Compute only valid/missing counts and min/mean/max.
- [x] Keep unresolved units unresolved and omit all dimensional totals.
- [x] Stage/version the new asset in Pages.
- [x] Run node contract/reference tests and syntax/build checks.
- [x] Commit: `perf: add conservative fdv csv fastpath parser`.

### Task 3: Execute FastPath off-main-thread and progressively import

**Files:**
- Create: `web/assets/fastpath-worker.js`
- Modify: `web/assets/runtime.release.js`
- Modify: `scripts/build_pages.py`
- Modify: `web/tests/runtime-unit.mjs`
- Modify: `web/tests/smoke.mjs`

**Produces:** file selection -> FastPath worker preview while `analysis-worker.js` boots concurrently.

- [x] Add a small worker controller with request IDs, failures and termination.
- [x] Start the authoritative Python worker asynchronously at application startup but do not await it before FastPath parsing.
- [x] On import record T0/T1/T2/T3 and set explicit states: reading -> preview-ready/preview-unavailable -> validating -> ready/error.
- [x] Reuse the already-read buffer/text where safe; transfer a copy to the Python worker only when it becomes ready.
- [x] Keep unsupported FastPath sources on the existing authoritative path.
- [x] Ensure cancellation/restart restores only authoritative-ready sources.
- [x] Verify UI remains responsive and multiple files progress independently.
- [x] Commit: `perf: decouple source preview from python readiness`.

### Task 4: Render first useful graph and basic statistics from preview

**Files:**
- Modify: `web/assets/runtime.release.js`
- Modify: `web/assets/workbench-v2.js`
- Modify: `web/assets/precision-workbench.js`
- Modify: `web/assets/precision-workbench.css`
- Modify: `web/tests/smoke.mjs`
- Modify: `web/tests/precision-shell.mjs`

**Produces:** immediate graph-first preview, FDV channel controls, safe statistics, non-blocking engine readiness status.

- [x] Auto-render eligible FDV as stacked Flow/Depth/Velocity (and rainfall only when present/linked) using existing graph colour/layout conventions.
- [x] For eligible CSV render recognised series; unresolved units are visibly marked.
- [x] Add compact Flow/Depth/Velocity/Rainfall/Combined channel navigation when applicable.
- [x] Use `Plotly.react`; keep no range slider.
- [x] Record T4 after Plotly render and T5 after statistics are visible.
- [x] Never display flow volume/rain total from preview-only data.
- [x] Replace preview with authoritative graph without losing selected context when Python validation completes.
- [x] Commit: `ui: add graph-first fastpath preview and metrics`.

### Task 5: Reconcile FastPath with authoritative parser and protect engineering state

**Files:**
- Modify: `web/assets/runtime.release.js`
- Modify: `web/assets/domain-registry.js`
- Create: `scripts/validate_fastpath_equivalence.py`
- Modify: `.github/workflows/pages.yml`
- Modify: `web/tests/smoke.mjs`

**Produces:** T6 timing, equivalence evidence, explicit disagreement diagnostics.

- [x] Compare format, rows, period, channels, quantity and canonical unit after `parse_source`.
- [x] Mark preview as validated when equivalent; retain diagnostic warning when different.
- [x] Ensure registry/workspace/analysis only consume authoritative `item.parsed`.
- [x] Add Python/Node reference equivalence validation for checked-in FDV/CSV.
- [x] Prove specialist actions remain unavailable until authoritative-ready.
- [x] Commit: `test: reconcile fastpath with authoritative source parsing`.

### Task 6: Precision Workbench hierarchy and continuity polish

**Files:**
- Modify: `web/assets/precision-workbench.js`
- Modify: `web/assets/precision-workbench.css`
- Modify: `web/tests/precision-shell.mjs`
- Modify: `web/tests/smoke.mjs`

**Produces:** graph-dominant desktop shell with clearer typography and predictable navigation/inspector behavior.

- [x] Make labelled navigation the default; focus-canvas is explicit rather than silently hiding orientation.
- [x] Ensure collapsing rail materially expands graph canvas.
- [x] Keep inspector contextual/collapsible and drawer-based at constrained widths.
- [x] Raise undersized scope/metadata/control text where needed while retaining engineering density.
- [x] Audit primary/secondary button hierarchy and graph workspace spacing.
- [x] Preserve route/context state through Data Health, Survey, Rainfall, Verification, DWF, Spills and Reports.
- [x] Verify tables remain contained and spill/report tables do not overflow.
- [x] Commit: `ui: refine precision workbench hierarchy and graph focus`.

### Task 7: Reference regression, reports and performance validation

**Files:**
- Modify: `web/tests/smoke.mjs`
- Modify: `tests/representative/test_reference_graphs.py` only if additional assertions are needed
- Modify: `docs/fastpath-performance.md`

**Produces:** measured before/after matrix and reference-data regression evidence.

- [x] Re-run identical FDV/CSV timing matrix and record T0-T6 values.
- [x] Verify FM01/RG01 known reference values and Station A parser counts/periods through authoritative paths.
- [x] Exercise multi-file and mixed supported import.
- [x] Exercise rainfall R, Data Health/survey, observed/model comparison, spills/exclusions, workspace/report export.
- [x] Inspect generated report in browser test for legend/rainfall/statistics/table containment.
- [x] Confirm no unexpected numerical change; explain any difference before continuing.
- [x] Commit: `perf: document reference fastpath benchmarks and regressions`.

### Task 8: Final gates and PR handover

**Files:** no product changes unless a failing gate produces a tested repair.

- [x] Run/fetch fresh full PR checks: Python regression, JS unit/syntax, Pages build, Chromium full workflow, Firefox shell.
- [x] Inspect browser evidence artifacts and console results.
- [x] Compare final branch against baseline and ensure no unplanned engineering-method changes.
- [x] Update PR description with measured performance, exact reference files, test counts, browser flows, report evidence, commit range and genuine limitations. — Final metadata publication follows this documentation commit and does not change the tested tree.
- [x] Mark the PR ready only when all required gates are green. — Performed after the documentation-only exact-head rerun succeeds.
- [x] Do not merge.
