# Current implementation status — 18 September 2026

This document records the engineering-correctness release state for PR #4 and
the remaining gates. GitHub Pages remains the primary zero-install product and
the shared Python package remains the authoritative calculation engine.

## Engineering-correctness phase 1

| Backlog item | State | Evidence / remaining gate |
|---|---|---|
| BK-001 authoritative units | implemented | Generic CSV unit detection/conversion; canonical SI metadata; unresolved dimensional operations are withheld unless explicitly resolved. |
| BK-002 missing rainfall != dry | implemented | DWF only accepts days with complete rainfall support; missing/uncovered rainfall is unknown, never dry. |
| BK-003 actual-support rainfall | implemented | Cumulative rainfall and event calculations use actual timestamp support; final intensity support requires a declared interval. |
| BK-004 deterministic invalidation | implemented for source reset | Clearing the source pool invalidates mappings, exclusions, histories, colours and derived browser state. The wider single-action dependency architecture remains a later consolidation task. |
| BK-005 storage coverage/unit gating | implemented | Level/flow unit contracts are explicit; spill-volume support is tracked and storage headline values are withheld for partial/unavailable support. |
| BK-006 common validity architecture | implemented as validity-v1 foundation | Canonical valid/suspect/invalid/excluded/missing/unknown states and complete/partial/unavailable calculation status are shared across integration, rainfall, spill coverage, time coverage/scenario comparison and browser result payloads. Suspect/invalid states are intentionally available for the richer telemetry-QA detectors planned in P1. |
| BK-007 representative engineering corpus | harness implemented; real data/sign-off outstanding | A local, fingerprinted manifest-driven validation harness and domain-UAT protocol now exist. Actual anonymised ICM/HYD, FDV and rainfall exports plus independently known expected results are still required before project field-validation can be claimed. |

## Release evidence required for merge

The artifact-changing head must pass all of the following before merge:

1. Python regression suite on Ubuntu and Windows.
2. Python compile checks.
3. JavaScript runtime regressions and syntax checks.
4. Deterministic Pages build/package-manifest verification.
5. Chromium acceptance against the exact staged Pages artifact.
6. No unresolved PR review issue that changes engineering behaviour.

After merge, the same Pages workflow must verify, build and deploy the exact
`main` artifact successfully.

Representative real-export reconciliation is deliberately a **domain assurance
gate**, not a reason to weaken or bypass automated release gates. It remains
required before describing the tool as validated for a specific utility/project.

## Correctness architecture delivered

The validity-v1 contract is the common support vocabulary:

- `valid`
- `suspect`
- `invalid`
- `excluded`
- `missing`
- `unknown`

Every governed calculation exposes `complete`, `partial` or `unavailable`
status with coverage where meaningful. Excluded support is removed before
missing/unknown classification so the same time cannot be silently
double-counted into two states.

The browser comparison workflow now surfaces calculation status and valid
support directly with the calibration metrics.

## Repository-wide polish and survey assessment pass

- Time-series graphs now include a contained statistics band calculated from native source values. It reports quantity, resolved unit, valid/missing counts, minimum, time-weighted mean where supported, median, maximum, dimensional flow volume and rainfall depth.
- Assessment and four-period HTML reports include the same statistics without relying on the Plotly legend area.
- FDV weekly assessment now screens completeness, large gaps, range violations, near-zero/inactive response and 6 h/48 h flatlines.
- Rainfall assessment now includes all-R cumulative depth plus multi-gauge operational coverage, spatial CV and repeated zero-response review flags.
- FDV/R parsers now accept ICM continuation headers, named constants and scientific notation while retaining explicit unit conversion and sentinel-to-missing behaviour.
- Cross-repository decisions and deferred contracts are recorded in `docs/companion-repository-assessment.md`.

## Next product phases

Phase 1 correctness does not bundle the broader product roadmap. Subsequent
regression-controlled phases remain:

- P1 — explicit time basis/DST, richer telemetry QA, professional DWF and
  multi-gauge rainfall workspaces, event-centred verification, governed spill
  policies and reproducible evidence manifests.
- P2 — state/action consolidation, hydraulic/rating diagnostics, transparent
  mapping assistance, engineering presets and complete evidence packages.
- P3 — linked flow/depth/velocity diagnostics, progress/cancellation/recovery,
  large-data performance limits and release/user documentation.
- P4 — network/map context and advisory sensor change-point research only after
  the core workbench is production-ready.

No rewrite of the working local-first architecture is implied by these phases.
