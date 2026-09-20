# Precision Workbench redesign implementation plan

Date: 2026-09-20  
Baseline main: `fc8e269f9743f4d2731d2e1fac4e51f0e86ad1bd`  
Branch: `feat/precision-workbench-redesign-2026-09-20`

## Contract
- Preserve the canonical Python/Pyodide calculation paths and the existing project/source/result state contracts.
- Treat the supplied Precision Workbench PNGs as visual references and the implementation brief as authoritative when render text conflicts.
- Retain zero-install GitHub Pages delivery; no backend, login, cloud upload, or production deployment.
- Keep existing DOM control IDs and regression selectors wherever practical. Presentation may move existing elements but must not duplicate calculations.
- Use six primary workspaces: Data, Survey, Rainfall, Verification, Spills, Report.
- Preserve observed-only, rainfall-only, depth-only and multi-scenario workflows.
- Reviewable PR only. No merge to main.

## Incremental tasks
1. Baseline: record feature coverage, current release/build composition, existing browser regressions and baseline workflow state.
2. Visual foundation: add Precision Workbench tokens, shell, left rail, context header, secondary navigation, scope bar, contextual inspector and responsive states.
3. Navigation adapter: map the existing tabs/subpanels into the six-workspace information architecture using existing nodes/IDs; add restorable hash routes without resetting loaded files.
4. Data workflow: Source pool, Series mapping and Time series. Replace Ctrl/Cmd-only scenario selection with an accessible checklist while keeping the original select synchronized as the canonical control.
5. Survey/Rainfall workflow: expose association configuration, Data Health, professional rainfall response, flow continuity, gauge evidence and rainfall events as direct secondary pages.
6. Verification/Spills workflow: expose comparison, rating, DWF, storage, thresholds/exclusions and bounded spill results through the new shell while preserving calculations.
7. Report workflow: separate workspace restore, report builder/readiness and provenance/audit views using the current workspace/report/provenance objects.
8. Visual fidelity: apply navy rail, white canvas, teal actions, reserved legend/statistics space, responsive inspector/drawer behavior, table overflow containment and specified trace colours.
9. Tests: extend browser regressions for six-workspace routing, deep-link restore, scenario checklist synchronization, no document horizontal overflow at 1366×768 / 1487×1058 / 1920×1080, first-model #5755d9, inspector/rail collapse, and existing engineering workflow parity.
10. Verification: run Python regression, JS syntax/unit checks, deterministic Pages package checks and Playwright Chromium workflow on the PR artifact. Retain screenshot evidence as a PR Actions artifact. Compare analytical fixture outputs to baseline; any calculation delta is a blocker unless separately justified and tested.
11. Handoff: open draft/reviewable PR, attach screenshots/evidence, list verified/unverified areas and do not merge/deploy.

## Files
- Add: `web/assets/precision-workbench.css` — visual tokens, shell, workspaces, inspector, responsive/accessibility rules.
- Add: `web/assets/precision-workbench.js` — one presentation/navigation adapter, deep links, scenario checklist synchronization, contextual page handling.
- Modify: `scripts/build_pages.py` — stage/version the two reviewed assets after existing UX scripts.
- Modify: `web/assets/runtime.release.js` only for the explicitly requested first-model default colour if it cannot be supplied safely by the presentation layer.
- Modify: `web/tests/smoke.mjs` — new UI acceptance plus preserved engineering journey.
- Modify: `.github/workflows/pages.yml` — validate the two new assets and retain PR screenshot evidence without deploying.
- Add/update docs: coverage ledger and navigation/user guidance.

## Acceptance gates
- No calculation modules changed for the redesign.
- Existing regression journey still completes.
- PR Pages workflow `verify` and `browser-smoke` pass.
- Browser screenshot evidence exists for Data/Time series, Survey/Data Health, Survey/Flow continuity, Spills/Exclusions and Report.
- No production build/deploy job runs for the feature branch because Pages deploy remains restricted to `main`.
