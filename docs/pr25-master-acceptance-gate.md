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

---

## A. Scope, repository and change control

- [ ] A1. PR remains based on the verified intended `main` baseline; exact base SHA and head SHA are recorded.
- [ ] A2. Work is confined to the dedicated PR #25 branch until explicit merge instruction.
- [ ] A3. Existing zero-install GitHub Pages architecture is preserved; no backend/hosting migration.
- [ ] A4. Existing working tools/calculations are preserved unless a change is explicitly required and regression-tested.
- [ ] A5. No unplanned engineering-method change exists under `src/icm_workbench/**`.
- [ ] A6. Exact changed-file list is reviewed for scope creep.
- [ ] A7. PR description records exact head, tested merge SHA/run IDs, test counts, reference data, performance evidence, visual evidence and genuine limitations.

## B. Precision Workbench design language and hierarchy

The target is Apple-inspired restraint, not an Apple clone and not decorative glassmorphism.

- [ ] B1. Graph-first analytical routes make the chart the dominant canvas.
- [ ] B2. Focus Canvas graph panel is at least 82% of viewport width and chart at least 78% at the agreed desktop acceptance viewport.
- [ ] B3. Standard layout restores readable labelled primary navigation in one action.
- [ ] B4. Primary workspace hierarchy is unmistakable: workspace title -> primary navigation -> local/channel controls -> graph -> statistics -> metadata/advanced controls.
- [ ] B5. Typography hierarchy is deliberate and consistent:
  - workspace/page title approximately 24–32 px;
  - section heading approximately 20–24 px;
  - controls/body 13–15 px;
  - metadata/supporting text 11–13 px;
  - primary navigation visually stronger than secondary navigation.
- [ ] B6. Spacing follows an 8 px base rhythm; 4 px micro-spacing is allowed only for tightly coupled elements. Arbitrary 7/9/10/14/18 px layout rhythm must be removed or explicitly justified.
- [ ] B7. Each task area has one visually obvious primary action; secondary and destructive actions are subordinate.
- [ ] B8. Nested cards/borders are reduced. The graph and major engineering surfaces are not wrapped in unnecessary card-within-card framing.
- [ ] B9. Colour is restrained and semantic; decorative colour/KPI-dashboard styling is absent.
- [ ] B10. Controls use progressive disclosure rather than a persistent wall of settings.
- [ ] B11. Contextual inspector shows only controls relevant to the active task and can be collapsed/overlaid without consuming graph width.
- [ ] B12. Main workspaces and tabs retain stronger visual focus than local sub-tabs, buttons and metadata.
- [ ] B13. Tables are compact, numeric, readable, contained and use sticky/overflow behavior where needed.
- [ ] B14. Desktop layouts have no document-level horizontal overflow at the tested widths.
- [ ] B15. Responsive behavior preserves orientation, task ownership and usable controls.
- [ ] B16. Tool-to-tool continuity preserves context across Data & Time Series, Flow Survey, Rainfall, Assessment, Spills and Report.
- [ ] B17. Exact-head screenshots are reviewed for every major workspace and graph-heavy sub-route, not only Graph/Data Health/Spills.
- [ ] B18. Final visual review explicitly checks text size, tab prominence, button weight, relative control sizing, spacing rhythm and surface ownership.

## C. Navigation, graph and hydraulic interaction

- [ ] C1. Six primary workspaces are clear and stable: Data & Time Series, Flow Survey, Rainfall, Assessment, Spills, Report.
- [ ] C2. Collapsible navigation materially expands chart space and persists user preference appropriately.
- [ ] C3. Graph-heavy routes default to Focus Canvas unless the user explicitly opts out; Standard layout is one-click.
- [ ] C4. Inspector is an overlay/drawer in Focus Canvas and constrained widths.
- [ ] C5. Plotly range slider/overview mini-graph is absent.
- [ ] C6. FDV combined view uses exact vertical order: Rainfall -> Flow -> Depth -> Velocity.
- [ ] C7. Flow / Depth / Velocity / Combined channel switching is graph-adjacent and retains state.
- [ ] C8. Observed hydraulic traces default to red.
- [ ] C9. First simulation defaults to purplish blue.
- [ ] C10. Rainfall treatment/colour convention is retained.
- [ ] C11. Per-series/model colour adjustment remains available.
- [ ] C12. Multiple models are selected through a compact checkbox-style picker rather than an exposed large multi-select.
- [ ] C13. Progressive zoom retains native source resolution and can refine to every source point; display reduction is never used for calculations.
- [ ] C14. Statistics are integrated beneath/with the graph and include Series, Unit, Min, Max, Average and applicable Total.
- [ ] C15. Statistics clearly communicate units and do not imply dimensional totals when units are unresolved.
- [ ] C16. Graph legends, annotations and hydraulic panels do not overlap at tested widths.

## D. FastPath architecture and performance

- [ ] D1. FDV and eligible CSV/HYD sources can show a useful first graph before Pyodide authoritative parsing completes.
- [ ] D2. FastPath runs off the UI thread.
- [ ] D3. FastPath is display/recognition only; it is not an independent engineering engine.
- [ ] D4. Original source/native bytes remain authoritative input.
- [ ] D5. Authoritative Python/Pyodide remains the source for project registry, persistence, analyses and reports.
- [ ] D6. FastPath cannot perform DWF, rainfall-event analysis, flow volume integration, verification metrics, spills, exclusions, storage or regulatory counting.
- [ ] D7. FastPath FDV eligibility is strict: required structural headers, valid start/interval, complete field count and supported units.
- [ ] D8. CSV timestamp recognition is conservative; ambiguous semantics are not guessed.
- [ ] D9. Unresolved engineering units remain unresolved and dimensional preview totals are withheld.
- [ ] D10. Malformed/truncated/unsupported sources fail safely to the authoritative path.
- [ ] D11. Preview/Python disagreement is surfaced diagnostically and Python remains authoritative.
- [ ] D12. Clear/restart/cancellation during pending imports cannot resurrect stale preview state.
- [ ] D13. Repeated and mixed imports do not duplicate or corrupt source/mapping state.
- [ ] D14. Existing applied observed/model/rainfall mapping survives FastPath -> authoritative handoff.
- [ ] D15. T0–T6 instrumentation is captured for representative reference files.
- [ ] D16. Formal before-vs-after performance evidence is produced from the same reference data and comparable environment; no invented speed-up claim.
- [ ] D17. Large practical CSV/FDV files demonstrate first useful graph without waiting for full Pyodide parse and without freezing the UI.

## E. Engineering correctness and numerical validity

- [ ] E1. Native-resolution data remain separate from display/downsampled arrays.
- [ ] E2. Actual-timestep integration is preserved.
- [ ] E3. Missing rainfall is never treated as dry/zero.
- [ ] E4. Irregular timesteps are handled correctly.
- [ ] E5. Duplicate timestamps, gaps and boundary behavior remain protected by tests.
- [ ] E6. DST/time-basis behavior remains protected.
- [ ] E7. Unit detection/conversion remains explicit and conservative.
- [ ] E8. Dimensional calculations are withheld when units are unresolved.
- [ ] E9. Rainfall accumulation/event logic remains authoritative and validity-aware.
- [ ] E10. DWF calculations remain authoritative and validity-aware.
- [ ] E11. Model/observed comparison and alignment remain authoritative.
- [ ] E12. Spill intervals/counting/duration/volume remain authoritative and regression-protected.
- [ ] E13. Multiple exclusion windows remain supported, global or channel-specific, auditable, and split spill intervals correctly at exclusion boundaries.
- [ ] E14. Excluded data are never silently reclassified as non-spill.
- [ ] E15. Storage calculations remain authoritative and withhold results on insufficient/invalid support.
- [ ] E16. Workspace schema migration/backward compatibility remains regression-protected.

## F. Workflow completeness

- [ ] F1. Import supports CSV/FDV/R and current supported ICM/HYD forms.
- [ ] F2. Multi-file file-input import works.
- [ ] F3. Multi-file drag/drop works.
- [ ] F4. Observed/simulated/rainfall mapping supports multiple model scenarios.
- [ ] F5. Data Health is visible, summary-first and retains expandable native evidence.
- [ ] F6. Flow Survey Data Health includes coverage/gaps/invalid/zero/flatline/out-of-range evidence and status.
- [ ] F7. Flow Continuity / volume balance retains association schematic, coverage/RAG, likely-source and recommendation evidence.
- [ ] F8. Rainfall gauge/accumulation/event workflows remain available and missing rainfall semantics remain safe.
- [ ] F9. Verification/comparison workflows remain available and graphs/tables are visually contained.
- [ ] F10. DWF workflow remains available and correct.
- [ ] F11. Spills support observed-only analysis; model is optional.
- [ ] F12. Spill threshold/exclusion editor supports multiple windows and remains visually contained.
- [ ] F13. Spill yearly/monthly/count/duration/volume outputs remain available and contained.
- [ ] F14. Storage workflow remains available and correct.
- [ ] F15. Workspace save/restore preserves mappings, appearance, exclusions and relevant analysis settings.

## G. Reporting and auditability

- [ ] G1. Report Builder shows readiness/preflight before export.
- [ ] G2. Assessment HTML report renders without legend overlap, clipped tables or missing major metrics.
- [ ] G3. Four-period HTML report renders four print-safe pages with rainfall separated above hydraulic panels.
- [ ] G4. Reports include depth/flow/velocity statistics with units and rainfall metrics where valid.
- [ ] G5. Reports include spill tables, exclusions and relevant engineering outputs.
- [ ] G6. Reports preserve source provenance/auditability internally.
- [ ] G7. Standalone provenance page/export is not exposed as a primary user workflow.
- [ ] G8. Report calculations use authoritative/native-resolution data even when display traces are reduced.
- [ ] G9. Copyright is present as © 2026 Anzar Sajid.
- [ ] G10. Exact-head generated reports are visually inspected, not only string-tested.

## H. Reference data, browser, regression and evidence gates

- [ ] H1. FM01 FDV authoritative reference row count/period/statistics match known values.
- [ ] H2. RG01 rainfall authoritative reference total and statistics match known values.
- [ ] H3. Station A EDM CSV row count/period/quantity/units match expected authoritative parse.
- [ ] H4. Station A rainfall CSV preserves unresolved source units where not explicitly established.
- [ ] H5. Large Station A model CSV parses authoritative source data and does not expose auxiliary Seconds as an engineering series.
- [ ] H6. Python regression suite is green on the exact head.
- [ ] H7. JS runtime/graph/report/domain/FastPath contract tests are green on the exact head.
- [ ] H8. Pages build/manifest/compile checks are green on the exact head.
- [ ] H9. Chromium complete browser workflow is green on the exact head with no material console/page/request errors.
- [ ] H10. Firefox Precision Workbench shell is green on the exact head.
- [ ] H11. Browser visual evidence covers Graph, Data Health, Flow Continuity, Rainfall, Verification, DWF, Spills, Storage and Report.
- [ ] H12. Responsive acceptance covers at least the agreed desktop widths and confirms no document-level horizontal overflow.
- [ ] H13. Generated browser evidence and performance artifacts are retained and tied to the exact tested head/merge SHA.

## I. Final merge gate

Before stating “GO to merge”:

- [ ] I1. Every mandatory item A–H above is PASS.
- [ ] I2. No unresolved review thread or material reviewer comment remains.
- [ ] I3. PR is mergeable against the current `main`; `main` has not moved unexpectedly.
- [ ] I4. Final exact-head CI/browser/report/visual gates are green after the last PR change.
- [ ] I5. PR description contains the final evidence and no stale “complete” claims.
- [ ] I6. Overall verdict is explicitly recorded as GO.
- [ ] I7. Merge is performed only after explicit user instruction.

If any item is not PASS, the correct verdict is **NO-GO** and PR #25 must remain Draft/not merge-ready until the blocker is corrected or explicitly superseded by the user.
