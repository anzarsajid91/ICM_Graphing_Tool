# Detriment Assessment QA

This release adds report comparison through Data Sources, with Flooding, Level and Spill assessment tabs. Scenario A is baseline and B is proposed. Report tables are isolated from hydraulic series and Data Health; existing storage calculations are unchanged by the feature.

## Engineering acceptance

- Flood volume 2→8 m³ at tolerance 5 produces +6 m³ detriment. Equality is within tolerance; new flooding remains a separate flag.
- Level 99.35→99.65 m with ground 100 and minimum freeboard 0.5 produces a +0.30 m rise and new freeboard breach (0.65→0.35 m). Existing breaches improving remain risk evidence.
- Spill count 12→15 and actual duration 18→22 h produce independent +3 spills/+4 h. Reduced count with longer duration is mixed risk.
- Missing assets never become zero. Invalid numeric evidence remains unresolved. Duplicate summary IDs, incompatible dimensions/datums and known conflicting spill statistics are rejected.
- Detail rows use ISO or day/month/year in a common model clock. Start/end are required, and rows outside or crossing the declared period are blocked pending period-specific attribution. An exact end at the exclusive period boundary is valid.
- Optional ground and detail sources retain fingerprints, mappings, units and datum in exports. Workspace restore/reupload relinks unique fingerprints even after renaming; results require recalculation.

## Independent review

A fresh whole-branch reviewer found six Important issues, all addressed with observed failing regression tests before fixes: physical dimensions, inline ground datum, spill statistics semantics, detail period boundaries, export provenance and approved visuals/filters. A filename-dependent relinking finding was also addressed. No Critical finding remained. No second author-only review substituted for that independent pass.

## Validation

- Python: 198 tests and 9 subtests pass.
- Browser unit regressions: runtime, report/graph, spill evidence, rainfall, registry, FastPath and new detriment tests pass.
- FastPath/Python reference-data equivalence passes.
- Real-world EDM/Flow Survey reference workflows pass all 17 acceptance checks, with 9 monitors and immutable raw sources.
- Pages package stages all 42 Python modules and versioned new assets.
- Rendered acceptance remains a required CI gate: all three report workflows, mapping/paste, named filters, paired/section/timeline plots, CSV/HTML, stale results, restore/rename/removal and responsive containment. Existing Chromium workflow, Firefox shell and baseline-performance jobs remain enabled.
- Post-deployment verification runs both the existing full smoke and new detriment smoke against the exact deployed main revision.

Representative user ICM report exports were not supplied. Header aliases and synthetic fixtures are provisional; explicit column mapping and engineering confirmations are required for unfamiliar exports. Physical event rows are not automatically converted to UK12/24 counts.
