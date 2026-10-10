# Hydra Bench UI/UX transformation

## Baseline and scope

Baseline main: `dff8ff593e61dbfea142007b5ac32b0d66787f0a`.
Branch: `feat/unified-premium-uiux`. Main must not be merged or modified.

Current routes (source of truth: Precision ROUTES plus ICMDetriment.routes):
Data / Time Series; Spills (Assessment, Storage, Network); Flow Survey (FDV,
Rainfall, Volume Balance, Monthly Review); Detriment (Flooding, Level, Spill);
Plots (Comparison, Depth / Rating, DWF); Reports (Generation, Workspace); About.
There are 17 pages across seven workspaces.

## Architecture and ownership

`web/index.html` is source, not the deployable application. `build_pages.py`
replaces development `runtime.js` with `runtime.release.js` and injects overlays.
The effective CSS order is app → v2 → survey → workflow-26 → detriment →
precision → network. Classic scripts share lexical engine/state bindings.
Domain registry loads before runtime; FastPath worker accelerates display;
analysis-worker serialises canonical Python calls. Precision builds the shell,
reparents existing controls with markers, owns routes and restores per-route
scroll. v2 owns native zoom/threshold display; workflow-26 owns survey review;
network loader lazily loads core/review/schematic. Detriment creates its own pages.

Calculation sources, registry, worker protocol, source bytes, mappings, persistence
schemas and validity semantics are protected. Presentation changes must leave
these contracts intact. Historical documents contain obsolete route names; code
has precedence. Generated `_site` must never be edited as source.

## Reference observations

Inspected representative frames at 0, 2, 4 and 6 seconds of the supplied recording.
Product content occupies a small landscape strip within a portrait Threads player.
Observed: light warm-neutral canvas, white rounded compact metric cards, dark
primary typography, muted labels, fine linework, small green/amber status pills,
Day/Week/Month pill with white sliding selection, restrained hover/refresh.
Threads controls, black surround and iOS Control Centre are excluded.
Exact typeface, pixel dimensions, easing, full navigation and responsive behaviour
cannot be established from this recording. Token sizes/timings are design choices,
not measurements of the original implementation. No Figma/source access claimed.

## Baseline evidence and limitations

Local Python: 295 tests and 100 subtests passed in 18.40 s. All existing `*unit.mjs`
suites and privacy guard tests passed. Pages source/vendor build passed (43 Python
modules; 8 reviewed network-capable sources). Synthetic reference simulation run.
Local Chromium launch is blocked by environment socket denial before application
load. Browser evidence must therefore come from GitHub CI and cloud-browser review.
No local browser performance or visual acceptance is claimed.

## Risk register

| Risk | Protection |
|---|---|
| Reparenting controls loses handlers/state | Preserve nodes, IDs and docking markers; shell/interaction suites |
| CSS order hides conditional controls | Edit owning styles, preserve visibility/layout contracts; route inventory |
| Schematic coordinates/hit tests change | No geometry/transform changes; layout/edit/drill-down suites |
| Motion causes chart redraws | Animate selection indicator/opacity only; final resize once, no calculation |
| Report skin loses evidence | Preserve markup, print sizing and technical tables; report smoke |
| Unit/RAG/unknown semantics change | Kernel untouched; equivalence and existing regression suites |
| New egress | No remote font/icons/motion; source review, privacy tests/network observer |
| Preview affects production or storage | Existing Pages staging pattern; byte hashes and distinct storage prefix |

## Migration and validation plan

0. Capture exact-main route/control inventory, screenshots, workflow and timing
   evidence in CI before visual changes.
1. Central tokens and native component showcase; adapt owners rather than adding
   another catch-all stylesheet.
2. Light shell, navigation, inspector and preserved state.
3. All 17 pages: forms, tables, assessment results, diagrams, reporting.
4. Sliding indicators, lightweight interactions, reduced motion and final resize.
5. Reports, focus, responsive and keyboard refinement.
6. Separate QA pass; compare baseline/candidate, rerun affected gates.
7. Exact-head PR and same-host isolated preview; verify build SHA; no merge.

Status: Phase 0 in progress. No visual implementation yet. See ledger and inventory.
