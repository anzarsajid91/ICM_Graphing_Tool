# Synthetic ICM Buddy reference validation

Detriment acceptance uses only the independently generated CSV fixtures listed
in `reference/current-tool/synthetic-manifest.json`. The generator establishes
fresh assets, measurements, dates and deliberate import-audit cases. Historical
source-specific row counts, durations, dates and upload references are removed.

`scripts/detriment_reference_cases.py` builds temporary Scenario A/B fixtures and
independently specified expected changes. The assessment engine is never used to
manufacture expected results. Current row counts and dates come from the manifest;
expected scenario results come from the generated case manifest.

## Preserved engineering contracts

- Level evidence retains explicit units and datum; date-formatted cells in numeric
  fields are flagged rather than converted to invented values.
- Flooding comparisons retain their critical worst-case measure, unit agreement,
  tolerances, missing-asset joins and newly introduced flooding checks.
- Spill comparisons distinguish exported block rows, physical events and
  authoritative summaries. Exported duration stays separate from counts; row count
  does not imply a UK 12/24 spill count.
- Absolute event boundaries, model-clock confirmation, duplicate detection and
  mixed scenario/run checks remain required.
- Import recovery, source interpretation, graph/table filters and local exports
  retain their existing regression tests.

The historical-data cleanup changes reference evidence and Git identities only.
Calculation methods, parsers, browser runtime and synthetic fixture bytes remain
unchanged and are checked before publishing rewritten history.
