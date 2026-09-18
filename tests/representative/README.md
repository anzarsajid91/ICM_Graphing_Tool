# Representative engineering validation corpus

This directory defines the remaining real-export UAT gate. Synthetic/unit tests
protect arithmetic and state behaviour, but they do not prove compatibility with
actual ICM and flow-survey vendor exports.

## Minimum acceptance set

Supply anonymised examples covering, as applicable to the intended project use:

- InfoWorks ICM CSV and/or HYD exports for flow, depth/level and velocity.
- Real FDV exports, including at least two vendor/layout variants if both occur in practice.
- Real rainfall R/R.txt exports.
- A file containing known missing/sentinel values.
- A file containing a long telemetry outage or irregular timestep.
- A multi-month or otherwise large export representative of normal modeller use.
- At least one deliberately corrupt/truncated file to confirm actionable failure behaviour.

Do not commit client-sensitive raw exports unless project governance explicitly
permits it. By default, place local files under `tests/representative/data/`;
that path is git-ignored.

## Acceptance manifest

Copy `manifest.example.json` to `manifest.local.json` and replace the
placeholder paths/expectations with independently known values. Expectations
should come from the source system, survey deliverable, or an independent
engineering calculation rather than from this tool itself.

Run:

```bash
python scripts/validate_representative_exports.py \
  tests/representative/manifest.local.json \
  --report reports/representative-validation.json
```

The harness checks parser selection, row/time bounds, required columns, series
quantity/unit metadata and exact timestamped sample values with explicit
tolerances. It also records SHA-256 fingerprints so the evidence can be tied to
the exact files assessed.

## Domain sign-off

Automated pass is necessary but not sufficient. A hydraulic modeller should
reconcile at least the following against independently known results:

1. plotted native values and timestamps;
2. unit conversion and datum/quantity interpretation;
3. rainfall depth/event totals;
4. observed/model comparison support and headline metrics;
5. physical spill intervals and durations;
6. 12/24 compatibility counts where the project actually uses that policy;
7. exclusion effects;
8. storage/spill-volume calculations where units and support are complete.

Record any project-specific policy assumptions separately. Passing this corpus
must not be described as regulatory approval.
