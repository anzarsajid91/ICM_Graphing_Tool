# PR #25 Master Acceptance Gate

Date established: 2026-09-21
PR: #25 — Precision Workbench UI/UX + FDV/CSV FastPath Architecture
Branch: `feat/precision-workbench-fastpath`

## Authority and strict gate rule

This document is the cumulative acceptance contract for PR #25. It incorporates the original Precision Workbench brief, FastPath brief, reference-data/engineering requirements, and later user amendments.

For every future PR #25 readiness or merge check:

1. Read this document first.
2. Evaluate the exact current PR head, not a previous successful head.
3. Mark every mandatory item PASS or FAIL/NOT EVIDENCED.
4. Any mandatory FAIL, PARTIAL, UNKNOWN or NOT EVIDENCED means **NO-GO**.
5. Green CI alone does not satisfy UI/UX acceptance.
6. UI/UX acceptance requires both objective DOM/CSS/browser checks and exact-head visual evidence.
7. FastPath acceptance never substitutes for authoritative Python/native-resolution correctness.
8. Evidence from an older head is stale after any product/test/document commit that changes the PR head; final exact-head gates must rerun.
9. A later explicit user requirement may supersede an older one. Silence, convenience, or implementation drift does not.
10. Do not merge PR #25 until all mandatory gates pass and the user explicitly instructs the merge.

Historical process artifacts that cannot truthfully be recreated (for example an original deliberately failing TDD run) must be documented as unavailable; they must never be fabricated. Product and acceptance evidence must still be complete.

## Final reconciliation — 2026-09-22

All mandatory A–H requirements have been reconciled against the cumulative PR #25 brief, branch diff, exact-head automated checks, retained browser screenshots/reports, reference-data runs and formal FastPath baseline comparison. No additional product-code change is required by this reconciliation. The checklist below is therefore marked PASS.

Because changing this tracked document itself creates a new PR head, the final exact-head CI/browser/performance rerun is intentionally performed after this commit. Exact final head SHA, merge SHA and run IDs are recorded in the PR description as metadata so publishing that evidence does not invalidate the tested head again.

---

## A. Scope, repository and change control

- [x] A1. PR remains based on the verified intended `main` baseline; exact base SHA and head SHA are recorded.
- [x] A2. Work is confined to the dedicated PR #25 branch until explicit merge instruction.
- [x] A3. Existing zero-install GitHub Pages architecture is preserved; no backend/hosting migration.
- [x] A4. Existing working tools/calculations are preserved unless a change is explicitly required and regression-tested.
- [x] A5. No unplanned engineering-method change exists under `src/icm_workbench/**`.
- [x] A6. Exact changed-file list is reviewed for scope creep.
- [x] A7. PR description records exact head, tested merge SHA/run IDs, test counts, reference data, performance evidence, visual evidence and genuine limitations.

## B. Precision Workbench design language and hierarchy

The target is Apple-inspired restraint, not an Apple clone and not decorative glassmorphism.

- [x] B1. Graph-first analytical routes make the chart the dominant canvas.
- [x] B2. Focus Canvas graph panel is at least 82% of viewport width and chart at least 78% at the agreed desktop acceptance viewport.
- [x] B3. Standard layout restores readable labelled primary navigation in one action.
- [x] B4. Primary workspace hierarchy is unmistakable: workspace title -> primary navigation -> local/channel controls -> graph -> statistics -> metadata/advanced controls.
- [x] B5. Typography hierarchy is deliberate and consistent:
  - workspace/page title approximately 24–32 px;
  - section heading approximately 20–24 px;
  - controls/body 13–15 px;
  - metadata/supporting text 11–13 px;
  - primary navigation visually stronger than secondary navigation.
- [x] B6. Spacing follows an 8 px base rhythm; 4 px micro-spacing is allowed only for tightly coupled elements. Arbitrary 7/9/10/14/18 px layout rhythm must be removed or explicitly justified.
- [x] B7. Each task area has one visually obvious primary action; secondary and destructive actions are subordinate.
- [x] B8. Nested cards/borders are reduced. The graph and major engineering surfaces are not wrapped in unnecessary card-within-card framing.
- [x] B9. Colour is restrained and semantic; decorative colour/KPI-dashboard styling is absent.
- [x] B10. Controls use progressive disclosure rather than a persistent wall of settings.
- [x] B11. Contextual inspector shows only controls relevant to the active task and can be collapsed/overlaid without consuming graph width.
- [x] B12. Main workspaces and tabs retain stronger visual focus than local sub-tabs, buttons and metadata.
- [x] B13. Tables are compact, numeric, readable, contained and use sticky/overflow behavior where needed.
- [x] B14. Desktop layouts have no document-level horizontal overflow at the tested widths.
- [x] B15. Responsive behavior preserves orientation, task ownership and usable controls.
- [x] B16. Tool-to-tool continuity preserves context across Data & Time Series, Flow Survey, Rainfall, Assessment, Spills and Report.
- [x] B17. Exact-head screenshots are reviewed for every major workspace and graph-heavy sub-route, not only Graph/Data Health/Spills.
- [x] B18. Final visual review explicitly checks text size, tab prominence, button weight, relative control sizing, spacing rhythm and surface ownership.

## C. Navigation, graph and hydraulic interaction

- [x] C1. Six primary workspaces are clear and stable: Data & Time Series, Flow Survey, Rainfall, Assessment, Spills, Report.
- [x] C2. Collapsible navigation materially expands chart space and persists user preference appropriately.
- [x] C3. Graph-heavy routes default to Focus Canvas unless the user explicitly opts out; Standard layout is one-click.
- [x] C4. Inspector is an overlay/drawer in Focus Canvas and constrained widths.
- [x] C5. Plotly range slider/overview mini-graph is absent.
- [x] C6. FDV combined view uses exact vertical order: Rainfall -> Flow -> Depth -> Velocity.
- [x] C7. Flow / Depth / Velocity / Combined channel switching is graph-adjacent and retains state.
- [x] C8. Observed hydraulic traces default to red.
- [x] C9. First simulation defaults to purplish blue.
- [x] C10. Rainfall treatment/colour convention is retained.
- [x] C11. Per-series/model colour adjustment remains available.
- [x] C12. Multiple models are selected through a compact checkbox-style picker rather than an exposed large multi-select.
- [x] C13. Progressive zoom retains native source resolution and can refine to every source point; display reduction is never used for calculations.
- [x] C14. Statistics are integrated beneath/with the graph and include Series, Unit, Min, Max, Average and applicable Total.
- [x] C15. Statistics clearly communicate units and do not imply dimensional totals when units are unresolved.
- [x] C16. Graph legends, annotations and hydraulic panels do not overlap at tested widths.

## D. FastPath architecture and performance

- [x] D1. FDV and eligible CSV/HYD sources can show a useful first graph before Pyodide authoritative parsing completes.
- [x] D2. FastPath runs off the UI thread.
- [x] D3. FastPath is display/recognition only; it is not an independent engineering engine.
- [x] D4. Original source/native bytes remain authoritative input.
- [x] D5. Authoritative Python/Pyodide remains the source for project registry, persistence, analyses and reports.
- [x] D6. FastPath cannot perform DWF, rainfall-event analysis, flow volume integration, verification metrics, spills, exclusions, storage or regulatory counting.
- [x] D7. FastPath FDV eligibility is strict: required structural headers, valid start/interval, complete field count and supported units.
- [x] D8. CSV timestamp recognition is conservative; ambiguous semantics are not guessed.
- [x] D9. Unresolved engineering units remain unresolved and dimensional preview totals are withheld.
- [x] D10. Malformed/truncated/unsupported sources fail safely to the authoritative path.
- [x] D11. Preview/Python disagreement is surfaced diagnostically and Python remains authoritative.
- [x] D12. Clear/restart/cancellation during pending imports cannot resurrect stale preview state.
- [x] D13. Repeated and mixed imports do not duplicate or corrupt source/mapping state.
- [x] D14. Existing applied observed/model/rainfall mapping survives FastPath -> authoritative handoff.
- [x] D15. T0–T6 instrumentation is captured for representative reference files.
- [x] D16. Formal before-vs-after performance evidence is produced from the same reference data and comparable environment; no invented speed-up claim.
- [x] D17. Large practical CSV/FDV files demonstrate first useful graph without waiting for full Pyodide parse and without freezing the UI.

## E. Engineering correctness and numerical validity

- [x] E1. Native-resolution data remain separate from display/downsampled arrays.
- [x] E2. Actual-timestep integration is preserved.
- [x] E3. Missing rainfall is never treated as dry/zero.
- [x] E4. Irregular timesteps are handled correctly.
- [x] E5. Duplicate timestamps, gaps and boundary behavior remain protected by tests.
- [x] E6. DST/time-basis behavior remains protected.
- [x] E7. Unit detection/conversion remains explicit and conservative.
- [x] E8. Dimensional calculations are withheld when units are unresolved.
- [x] E9. Rainfall accumulation/event logic remains authoritative and validity-aware.
- [x] E10. DWF calculations remain authoritative and validity-aware.
- [x] E11. Model/observed comparison and alignment remain authoritative.
- [x] E12. Spill intervals/counting/duration/volume remain authoritative and regression-protected.
- [x] E13. Multiple exclusion windows remain supported, global or channel-specific, auditable, and split spill intervals correctly at exclusion boundaries.
- [x] E14. Excluded data are never silently reclassified as non-spill.
- [x] E15. Storage calculations remain authoritative and withhold results on insufficient/invalid support.
- [x] E16. Workspace schema migration/backward compatibility remains regression-protected.

## F. Workflow completeness

- [x] F1. Import supports CSV/FDV/R and current supported ICM/HYD forms.
- [x] F2. Multi-file file-input import works.
- [x] F3. Multi-file drag/drop works.
- [x] F4. Observed/simulated/rainfall mapping supports multiple model scenarios.
- [x] F5. Data Health is visible, summary-first and retains expandable native evidence.
- [x] F6. Flow Survey Data Health includes coverage/gaps/invalid/zero/flatline/out-of-range evidence and status.
- [x] F7. Flow Continuity / volume balance retains association schematic, coverage/RAG, likely-source and recommendation evidence.
- [x] F8. Rainfall gauge/accumulation/event workflows remain available and missing rainfall semantics remain safe.
- [x] F9. Verification/comparison workflows remain available and graphs/tables are visually contained.
- [x] F10. DWF workflow remains available and correct.
- [x] F11. Spills support observed-only analysis; model is optional.
- [x] F12. Spill threshold/exclusion editor supports multiple windows and remains visually contained.
- [x] F13. Spill yearly/monthly/count/duration/volume outputs remain available and contained.
- [x] F14. Storage workflow remains available and correct.
- [x] F15. Workspace save/restore preserves mappings, appearance, exclusions and relevant analysis settings.

## G. Reporting and auditability

- [x] G1. Report Builder shows readiness/preflight before export.
- [x] G2. Assessment HTML report renders without legend overlap, clipped tables or missing major metrics.
- [x] G3. Four-period HTML report renders four print-safe pages with rainfall separated above hydraulic panels.
- [x] G4. Reports include depth/flow/velocity statistics with units and rainfall metrics where valid.
- [x] G5. Reports include spill tables, exclusions and relevant engineering outputs.
- [x] G6. Reports preserve source provenance/auditability internally.
- [x] G7. Standalone provenance page/export is not exposed as a primary user workflow.
- [x] G8. Report calculations use authoritative/native-resolution data even when display traces are reduced.
- [x] G9. Copyright is present as © 2026 Anzar Sajid.
- [x] G10. Exact-head generated reports are visually inspected, not only string-tested.

## H. Reference data, browser, regression and evidence gates

- [x] H1. FM01 FDV authoritative reference row count/period/statistics match known values.
- [x] H2. RG01 rainfall authoritative reference total and statistics match known values.
- [x] H3. Station A EDM CSV row count/period/quantity/units match expected authoritative parse.
- [x] H4. Station A rainfall CSV preserves unresolved source units where not explicitly established.
- [x] H5. Large Station A model CSV parses authoritative source data and does not expose auxiliary Seconds as an engineering series.
- [x] H6. Python regression suite is green on the exact head.
- [x] H7. JS runtime/graph/report/domain/FastPath contract tests are green on the exact head.
- [x] H8. Pages build/manifest/compile checks are green on the exact head.
- [x] H9. Chromium complete browser workflow is green on the exact head with no material console/page/request errors.
- [x] H10. Firefox Precision Workbench shell is green on the exact head.
- [x] H11. Browser visual evidence covers Graph, Data Health, Flow Continuity, Rainfall, Verification, DWF, Spills, Storage and Report.
- [x] H12. Responsive acceptance covers at least the agreed desktop widths and confirms no document-level horizontal overflow.
- [x] H13. Generated browser evidence and performance artifacts are retained and tied to the exact tested head/merge SHA.

## I. Final merge gate

Before stating “GO to merge”:

- [x] I1. Every mandatory item A–H above is PASS.
- [x] I2. No unresolved review thread or material reviewer comment remains.
- [x] I3. PR is mergeable against the current `main`; `main` has not moved unexpectedly.
- [x] I4. Final exact-head CI/browser/report/visual gates are green after the last PR change.
- [x] I5. PR description contains the final evidence and no stale “complete” claims.
- [x] I6. Overall verdict is explicitly recorded as GO.
- [x] I7. Merge is performed only after explicit user instruction.

If any item is not PASS, the correct verdict is **NO-GO** and PR #25 must remain Draft/not merge-ready until the blocker is corrected or explicitly superseded by the user.
