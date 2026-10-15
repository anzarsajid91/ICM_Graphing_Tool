# Requirements ledger — current desktop release contracts

Updated 15 October 2026 for the rainfall audit correction release following v1.065
(`192b7b5`). This is the current coverage matrix. Earlier historical statuses are
available in Git history; they are not the current implementation state.

“Covered” means implemented with the named automated checks. It does not certify
arbitrary customer exports, every input state or independent engineering sign-off.
Release evidence is the GitHub Pages Workbench workflow on the exact PR/main SHA;
a previous release's green checks do not validate a new revision.

| Requirement IDs | Current contract | Automated evidence | Remaining qualification |
|---|---|---|---|
| U01, U09, FP21, F11–F12 | Static desktop shell; browser-local Python worker; FastPath preview; queued authoritative calculations and explicit recovery | `cold-start-shell.mjs`, `engine-recovery-unit.mjs`, `smoke.mjs`, `baseline-comparison.mjs` | Worker restart/retry is covered; universal fine-grained interruption and maximum-memory endurance are not established |
| U02–U05, FP01–FP04 | Mixed source pool, native FDV/R and CSV adapters; quantity/unit interpretation; observed-only, rainfall-only and multiple model mappings | `test_parsers.py`, `test_engineering_correctness_phase1.py`, `rainfall-unit.mjs`, `survey-source-unit.mjs`, `workbook-reader-unit.mjs`, `smoke.mjs` | Independent representative vendor-export reconciliation remains external input; no new formats are promised |
| U06, U12, FP06, FP08, E02–E03 | Native-resolution analysis, bounded graph sampling, stable mapping/selection, desktop scrolling and shared no-wheel-zoom plot configuration | `motion-scheduling.mjs`, `workspace-interactions.mjs`, `uiux-contracts.mjs`, `rainfall-cumulative-unit.mjs`, `rainfall-audit-smoke.mjs`, `smoke.mjs` | Desktop Chromium/Firefox scope; no mobile release gate or guaranteed refresh rate |
| U07, FP05, FP11–FP12, audit F1–F4 | Explicit intensity/incremental-depth rainfall; equivalent physical storms agree; negative rainfall invalid; native support intersected with exact event bounds; DWF requires valid dry days | `test_rainfall_audit_regressions.py`, `test_cumulative_rainfall.py`, `test_survey_assessment_advanced.py`, `rainfall-cumulative-unit.mjs`, `rainfall-audit-smoke.mjs` | Corrections change affected erroneous results; raw-source cumulative plot deliberately includes assessment exclusions and says so |
| U08, U10–U11, FP07, FP14–FP17 | Persistent level thresholds; physical/counting spill separation; year/month allocation; common-period coverage; exclusion and storage validity | `test_audit_correctness.py`, `test_audit_remediation_known_issues.py`, `test_engineering_correctness_phase1.py`, `spill-evidence-unit.mjs`, `spill-record-disclosure.mjs`, `smoke.mjs` | Historical intermittent CSV readiness timeout unresolved; failed isolated probe now captures its own state before closure |
| U13, FP09–FP10, E04–E05 | Rating/scatter/log diagnostics, pairing, residuals and integration contracts | `test_audit_remediation_known_issues.py`, `test_engineering_correctness_phase1.py`, `smoke.mjs` | Do not infer validation for all masked/irregular real-project diagnostics from synthetic cases |
| Flow Survey / Monthly Review | Monitor/rain-gauge associations, network rainfall, weekly assessment, volume balances, manual reviews and evidence freshness | `test_survey_assessment_advanced.py`, `test_survey_quality.py`, `survey-source-unit.mjs`, `weekly-review-unit.mjs`, `schematic-review-smoke.mjs`, `reference_workflow_simulation.py` | Synthetic reference simulation is not independent customer-data calibration |
| Network schematic / annual review | Multiple years/scenarios, real Python spill counts, thresholds, selection/editing/pan, snapshots and local vector/PDF/CSV capture | `network-schematic-unit.mjs`, `network-review-unit.mjs`, `network-schematic-smoke.mjs`, `network-review-smoke.mjs`, `network-layout-smoke.mjs` | Layout gate includes 400 points/399 wires; this is a measured fixture, not a maximum-capacity claim |
| Detriment | Flooding/level/spill A/B comparisons, precision/tolerance boundaries, filters, source removal and restoration | `detriment-unit.mjs`, `detriment-smoke.mjs`, `detriment-reference-smoke.mjs` | Synthetic fixtures; no change to assessment criteria |
| FP18–FP20, E07–E08, E11, E13, F06/F13 | Versioned workspace serialization, fingerprint relinking, scoped exclusions, stale-result gates and local reports/exports | `test_audit_correctness.py`, `graph-report-unit.mjs`, `weekly-review-unit.mjs`, `audit-release-smoke.mjs`, `rainfall-audit-smoke.mjs`, `schematic-review-smoke.mjs`, `smoke.mjs` | Every possible report/state combination and repeated maximum-scale exports remain unverified |
| Confidentiality | Input bytes, metadata and derived results remain in browser/worker/local exports; fixed reviewed resources only | `verify_data_confidentiality.py`, `tests/privacy`, `privacy-network-unit.mjs`, request observers in release browser tests | Source approval is a reviewed change detector, not a universal security guarantee; see `SECURITY.md` |
| Release identity / governance, F15 | One version increment per merged main PR; SHA in built artifact; release gates before Pages deployment | `app_version.py`, `build_pages.py`, `.github/workflows/pages.yml`, `data-confidentiality.yml` | Server-side branch protection requires repository administration access; see `release-controls.md`; do not claim configured from repository text |

## Explicit outstanding work

- Independent representative real exports and signed engineering expected values
  (T20/BK-007); never put confidential originals into Git or Actions artifacts.
- Windows launcher verification on the target environment (F10).
- Large-project import/remove/reimport, cancellation/recovery and repeated-export
  endurance beyond the bounded regression fixtures. Existing worker recovery and
  the added three-cycle source lifecycle check must not be described as unlimited
  endurance certification.
- E01/E06/E09/E10/E12: any additional audit-to-range UI, event-bookmark/demo,
  offset-workflow and fine-grained batch cancellation requirements beyond existing
  tested operations remain backlog, rather than implicitly complete.
- Optional threshold sensitivity (E14) and saved-assessment diff (E15) remain
  explicitly deferred.

See [rainfall audit correction notes](rainfall-audit-corrections.md) for the
physical acceptance cases, release order and intentional numerical changes.
