# Precision Workbench + FastPath architecture — design contract

Date: 2026-09-20  
Baseline main: `cb66e762b23c5cd59cf61b42a6c4b52655307cfc`  
Branch: `feat/precision-workbench-fastpath`

## Goal

Keep the existing zero-install hydraulic engineering workbench and authoritative Python calculation layer, while making supported FDV/CSV data useful before the Pyodide engineering worker has completed startup. Refine the existing Precision Workbench shell rather than replacing it.

## Baseline findings that govern this change

- The public Pages product is assembled from `web/` by `scripts/build_pages.py`; `runtime.release.js` is staged as the release runtime.
- Pyodide already executes in `analysis-worker.js`, so Python is already off the browser main thread. Do not create another Python-worker migration.
- Import still waits for that worker to finish booting before `addFile` / `parse_source`, so time-to-first-useful-graph is coupled to advanced-engine readiness.
- `workbench-v2.js` already keeps native calculation data separate from display downsampling and progressively refines zoom. Preserve it.
- Current main already contains the Precision Workbench shell, collapsible navigation, contextual inspector, stacked FDV panels, reference-data graph/report fixes and protected numerical regressions.
- The older `feat/precision-workbench-redesign-2026-09-20` branch is materially stale and must not be used as a base.

## Architecture

### Startup layers

1. **Shell** — import/navigation immediately usable.
2. **FastPath preview** — conservative FDV/CSV structural parse in a lightweight worker; canonical preview contract; first graph; safe descriptive statistics.
3. **Authoritative engine** — existing Pyodide worker boots in parallel.
4. **Reconciliation** — source is parsed by `icm_workbench.parsers`; preview metadata/series interpretation is compared with authoritative output; existing application state becomes authoritative.
5. **Specialist analysis** — comparison, DWF, rainfall events, spills, storage, exclusions and reporting remain existing Python methods and run on demand.

### Canonical preview contract

The FastPath output is a display/recognition contract, not an engineering-analysis result:

```text
{
  schema_version,
  eligible,
  format,
  source,
  monitor,
  rows,
  start,
  end,
  columns,
  metadata,
  audit,
  series: [
    {
      column,
      quantity,
      original_unit,
      canonical_unit,
      unit_status,
      timestamps,
      values,
      statistics: {valid_count, missing_count, minimum, mean, maximum}
    }
  ],
  warnings
}
```

Only defensible structural information is populated. Unresolved units remain unresolved.

### Eligibility

**FDV:** fast preview only when the existing required structural contract can be proved: FIELD, CSTART/CEND, valid explicit START, valid explicit INTERVAL, complete field-count, and supported units. Canonical conversion must match the Python parser.

**CSV:** fast preview only when a timestamp field can be identified conservatively and at least one numeric series exists. Support explicit year-first/ISO and UK day-first timestamp forms. ICM HYD/P_DATETIME exports may be recognised from their section/header. Quantity/unit inference is conservative and mirrors existing supported unit vocabulary. Ambiguous unit semantics remain unresolved.

**R:** retain the existing authoritative parser in this PR unless measurements show a safe, worthwhile structural preview that can be implemented without duplicating rainfall semantics. No scope expansion merely for symmetry.

### Safe browser-side work

Allowed:
- file reading;
- structural recognition;
- timestamp parsing for eligible preview cases;
- supported unit recognition/conversion;
- channel identification;
- min/mean/max, valid/missing counts;
- preview display reduction;
- Plotly preview composition;
- timing instrumentation.

Not allowed:
- DWF;
- rainfall-event calculations;
- dimensional rainfall totals when semantics are unresolved;
- flow volume integration;
- verification metrics;
- spill logic;
- exclusion logic;
- storage;
- regulatory counting;
- any calculation from downsampled display arrays.

## Data ownership and reconciliation

- The original File object/native bytes remain the source.
- FastPath preview data never overwrite authoritative Python results.
- The authoritative Python parse remains the source for project registry, workspace persistence, analyses and reports.
- When authoritative parsing completes, compare format, row count, start/end, channels, quantity and canonical units for preview-eligible sources.
- Any material mismatch is surfaced as a FastPath reconciliation warning and retained in diagnostics; specialist analysis uses Python regardless.
- Display downsampling is independent of source/native-resolution calculation support.

## Performance instrumentation

Record monotonic marks per source where available:

- T0 selection/drop accepted
- T1 bytes/text available to FastPath
- T2 FastPath parse completed
- T3 preview canonical dataset available
- T4 first useful preview graph painted
- T5 preview statistics painted
- T6 authoritative Python source parse ready

Expose reproducible diagnostic records for browser tests and PR evidence. Benchmark the same checked-in reference files before/after; never invent timing values.

## Precision Workbench refinements

- Graph remains the primary canvas.
- Navigation is collapsible. On graph-heavy analytical routes, desktop defaults to Focus Canvas so the time-series surface remains dominant; the compact rail preserves workspace orientation and a one-click Standard layout restores fully labelled navigation.
- Inspector remains collapsible/contextual; Focus Canvas uses an explicit overlay inspector, and constrained widths use the same drawer pattern.
- Add efficient FDV channel/view switching where useful without reconfiguring the source.
- Do not reintroduce Plotly range sliders.
- Preserve observed red, first simulation purplish blue, established rainfall treatment.
- Raise undersized secondary labels where current hierarchy impairs legibility, without turning the product into a mobile-style dashboard.
- Tables stay contained with explicit overflow/sticky headers where useful.
- Loading states distinguish preview ready from advanced analysis ready.

## Protected engineering behavior

No intentional change in this PR to actual-timestep integration, rainfall accumulation/events, missing-rainfall validity, DWF, comparison/alignment, volume/storage, spill intervals/counting, exclusions, gap handling, duplicates, unit validity, provenance or workspace migration.

Any required correctness change must be isolated, explained and regression-tested.

## Verification

Automated:
- FastPath parser contract tests for FDV/CSV and conservative failure paths.
- Reference-file FastPath/Python equivalence tests.
- Existing full Python suite.
- Existing JS runtime/domain/report tests.
- Pages build/manifest checks.
- Chromium full workflow.
- Firefox Precision shell.
- New FastPath browser path and timing evidence.

Reference datasets:
- representative and largest practical checked-in FDV;
- Station A observed/EDM CSV;
- Station A rainfall CSV (unit semantics remain unresolved unless explicitly established);
- existing R/reference workflows for regression;
- multi-file/mixed-file import where current product supports it.

Visual/report:
- graph workspace, Data Health, Rainfall, Survey, Verification, Spills, Reports;
- legends, tables, responsive graph width, statistics and generated HTML report.

## Non-goals

- no backend;
- no hosting migration;
- no replacement of Plotly;
- no independent JavaScript engineering engine;
- no cloning of the reference viewer UI/source;
- no production merge/deploy from this branch.
